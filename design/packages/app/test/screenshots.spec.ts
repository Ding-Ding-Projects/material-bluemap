/**
 * Screenshot harness.
 *
 * Captures the real built app through Playwright's Electron driver, so every image is the
 * actual shipped artifact rather than a mockup, a design file, or a hand-edited picture.
 * This is the only sanctioned way to produce a capture for an issue comment or a release:
 * if a surface cannot be captured here, the honest report is that it has no capture yet.
 *
 * Runs in CI under xvfb. Output lands in `screenshots/` and is uploaded as a build
 * artifact.
 *
 * ## The map is local, and the harness cannot reach the internet
 *
 * The capture used to open the app's default profile, which pointed at the public BlueMap
 * demo somebody else maintains, and pulled real tiles off it on every push (issue #17).
 * It now serves its own map over loopback - a world `packages/worldgen` generated and
 * upstream's BlueMap engine rendered, both in the same CI run - and a network guard
 * refuses and records anything that is not loopback, so the old behaviour cannot come
 * back by accident. See `captureTarget.ts` and `networkGuard.ts`.
 *
 * ## Every capture is captioned
 *
 * Each image gets a `<name>.caption.txt` beside it, an entry in `manifest.json`, and a
 * row in `captions.md` that is ready to paste into an issue comment. The caption names
 * what rendered the map, because a screenshot of a rendered world otherwise reads as
 * proof that this project renders worlds, and today it proves the viewer port.
 *
 * Every capture records the window size and display scale in its filename, so a reviewer
 * can tell at a glance which configuration a defect appears in.
 *
 * ## Every surface, or an honest note saying why not
 *
 * The set used to be the shell at four window sizes, four display scales and two colour
 * schemes: ten pictures of the same screen. A reader could not see the settings drawer,
 * the options editor, the wizard or a single dialog, so the documentation described
 * surfaces nobody outside the repository had ever seen.
 *
 * So the harness now opens each of them and photographs it. Two rules keep that honest:
 *
 *   1. **Nothing is staged.** Every surface is opened by driving the real application:
 *      real clicks, real files on disk, the app's own state. No value is planted to make
 *      a screen look populated, and no screen stands in for a different one.
 *   2. **What cannot be reached is recorded, not substituted.** A surface that genuinely
 *      needs a signed-in account, live network traffic or a running render is listed in
 *      `manifest.json` under `skipped`, with the reason. An empty row there is the claim
 *      that everything was captured; a filled one is the claim that it was not.
 *
 * The surfaces are enumerated from the running application rather than from a list kept
 * here - the settings sections come from their own `data-anchor` attributes, the options
 * editor's tabs from its tab strip, the wizard's steps from its step nav. A section added
 * in `packages/ui` therefore arrives in this set on its own, instead of being silently
 * missing until somebody notices.
 */

import {
    test,
    expect,
    _electron as electron,
    type ElectronApplication,
    type Locator,
    type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCaptureTarget } from "./captureTarget.js";
import type { CaptureTarget } from "./captureTarget.js";
import {
    describeViolation,
    installNetworkGuard,
    networkGuardInstalled,
    networkViolations,
} from "./networkGuard.js";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..", "..", "..");
const shotDir = join(appRoot, "screenshots");

/**
 * The key `packages/ui/src/stores/profiles.ts` persists its profiles under.
 *
 * Hard-coded rather than imported: that module is a Vue store and this process has no
 * Vue. If the key ever changes there, this seeds a value nothing reads and the harness
 * captures an app with no map - which the manifest would then report as `mapDrew: false`
 * rather than passing silently.
 */
const PROFILE_STORAGE_KEY = "material-bluemap-profiles";

/** Window geometries worth proving, including the narrow widths where labels clip. */
const VIEWPORTS = [
    { name: "1280x800", width: 1280, height: 800 },
    { name: "1920x1080", width: 1920, height: 1080 },
    { name: "1024x768", width: 1024, height: 768 },
    { name: "800x600-narrow", width: 800, height: 600 },
];

/** Display scales the sizing rules call out explicitly. */
const SCALES = [1, 1.25, 1.5, 2];

/** The window every surface capture is taken at, so they can be read side by side. */
const SURFACE_VIEWPORT = { width: 1280, height: 800 };

let app: ElectronApplication;
let page: Page;
let target: CaptureTarget;
let mapDrew = false;

/** What the map area of the window holds while a capture is being taken. */
type MapArea =
    /** A map is loaded and the window shows it. */
    | "map"
    /** A map is loaded, but this surface paints over the whole of it. */
    | "covered"
    /** No profile is active, so there is no map at all. */
    | "none";

let mapArea: MapArea = "map";

/** One row per image, for `manifest.json` and `captions.md`. */
const captures: { name: string; file: string; surface: string; caption: string }[] = [];

/**
 * Surfaces this run did not photograph, and why.
 *
 * Published rather than dropped. A gallery that quietly omits a screen is indistinguishable
 * from one that never had it, and the reason a surface is missing (no account, no network,
 * no running render) is usually the more useful fact.
 */
const skipped: { surface: string; reason: string }[] = [];

/**
 * A PNG of a single flat colour compresses to almost nothing. The map canvas starting out
 * black means an all-black capture is tiny, which is a cheap and reliable "nothing has
 * drawn yet" signal without decoding pixels.
 */
const EMPTY_FRAME_BYTES = 40_000;

/**
 * Waits until the map has actually drawn something.
 *
 * The viewer streams tiles, so a capture taken the instant the interface mounts
 * photographs an empty scene. That is how a run once produced a full set of screenshots
 * showing black, with the chrome correct and the map missing, which reads as a rendering
 * bug rather than a timing one.
 *
 * Returns whether content arrived, so a caller can record that a capture is of an empty
 * map instead of quietly publishing it as if it were the product.
 */
async function waitForMapContent(timeoutMs = 45_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const buffer = await page.screenshot();
        if (buffer.length > EMPTY_FRAME_BYTES) return true;
        await page.waitForTimeout(1000);
    }
    return false;
}

/** What the map area of an image actually contains, in one phrase. */
function mapNote(): string {
    if (mapArea === "none") {
        return "no map is loaded, so the application is showing the wizard for making one";
    }
    if (mapArea === "covered") {
        return "an opaque surface fills the window, so none of the map behind it is visible";
    }
    if (target.mode === "none") return "no map is loaded; the map area is the app's empty state";
    if (!mapDrew) return "the map had drawn nothing when this was taken, so the map area is empty";
    return target.mode === "remote"
        ? "the map area shows tiles fetched from the remote server named above"
        : "the map area shows the locally rendered world named above";
}

/** A file-name-safe form of a label read off the running interface. */
function slug(text: string): string {
    return (
        text
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "unnamed"
    );
}

interface ShotOptions {
    /**
     * Crop to this element instead of photographing the whole window. Used where the
     * surface is self-contained and a full window would bury it in map pixels.
     */
    readonly crop?: Locator;
    /** What the cropped region is, in words, for the caption. */
    readonly cropped?: string;
    /** Overrides what the caption says about the map area for this one image. */
    readonly mapArea?: MapArea;
}

async function shoot(name: string, surface: string, options: ShotOptions = {}): Promise<void> {
    await mkdir(shotDir, { recursive: true });

    const previousArea = mapArea;
    if (options.mapArea !== undefined) mapArea = options.mapArea;

    const buffer =
        options.crop === undefined ? await page.screenshot() : await options.crop.screenshot();

    // A zero-byte or absent capture is a silent failure; assert it landed.
    expect(buffer.length, `capture ${name} produced no bytes`).toBeGreaterThan(1000);
    await writeFile(join(shotDir, `${name}.png`), buffer);

    const where =
        options.cropped === undefined
            ? `In this image, ${mapNote()}.`
            : `This image is cropped to ${options.cropped} rather than showing the whole window.`;
    const caption = `${surface}. ${target.caption} ${where}`;
    await writeFile(join(shotDir, `${name}.caption.txt`), `${caption}\n`, "utf8");
    captures.push({ name, file: `${name}.png`, surface, caption });

    mapArea = previousArea;
}

/** Records a surface this run deliberately did not photograph. */
function skip(surface: string, reason: string): void {
    skipped.push({ surface, reason });
    console.log(`[harness] skipped ${surface}: ${reason}`);
}

/**
 * Runs one surface's capture sequence, and records a skip rather than failing the run if
 * the surface never appeared.
 *
 * A thrown selector timeout here means one screen is missing from the set. Failing the
 * whole file for it would take the other forty with it, and an artifact of forty good
 * captures plus a named gap is far more useful than no artifact at all. The gap is loud:
 * it is in `manifest.json`, in `captions.md`, and printed by the final test.
 */
async function attempt(surface: string, run: () => Promise<void>): Promise<void> {
    try {
        await run();
    } catch (error) {
        const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
        skip(surface, `the harness could not open it in this run: ${reason ?? "unknown error"}`);
    }
}

/* -------------------------------------------------------------------------- */
/* Driving the app                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Points the app at the capture target and reloads so it takes effect.
 *
 * The profiles store reads localStorage once, at module load, so the value has to be in
 * place before the document that uses it. Writing it and reloading is what makes the
 * capture deterministic: the same profile, the same map and the same camera in every run,
 * instead of whatever the app happened to remember.
 */
async function pointAppAtCaptureTarget(): Promise<void> {
    const state = JSON.stringify({
        profiles: target.profile === null ? [] : [target.profile],
        activeId: target.profile?.id ?? null,
    });

    await page.evaluate(
        (seed: { key: string; value: string; hash: string }) => {
            window.localStorage.setItem(seed.key, seed.value);
            if (seed.hash.length > 0) window.location.hash = seed.hash;
        },
        { key: PROFILE_STORAGE_KEY, value: state, hash: target.locationHash },
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app", { timeout: 30_000 });
}

/**
 * Clears the active profile and reloads, so the shell shows the make-a-map wizard.
 *
 * The wizard and the map are mutually exclusive by design - `App.vue` shows the wizard
 * exactly when no profile is active - so the only honest way to photograph the wizard is
 * to be in that state, rather than to force its component on screen over a map.
 */
async function pointAppAtNoMap(): Promise<void> {
    await page.evaluate((key: string) => {
        window.localStorage.setItem(key, JSON.stringify({ profiles: [], activeId: null }));
        window.location.hash = "";
    }, PROFILE_STORAGE_KEY);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app", { timeout: 30_000 });
    await page.waitForSelector(".mb-world-wizard", { timeout: 30_000 });
    mapArea = "none";
}

/** Presses Escape and lets the closing transition finish. */
async function dismiss(): Promise<void> {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
}

/** True when a selector is present and actually visible, without throwing on absence. */
async function visible(selector: string): Promise<boolean> {
    return page
        .locator(selector)
        .first()
        .isVisible()
        .catch(() => false);
}

/**
 * Opens the side sheet and walks back to its root page.
 *
 * The menu button re-opens whatever page was last on the stack, not the root, so a second
 * surface captured after the first would otherwise photograph the first one again.
 */
async function openMenuRoot(): Promise<void> {
    if (!(await visible(".mb-side-sheet"))) {
        await page.locator(".mb-cb-menu").first().click();
        await page.waitForSelector(".mb-side-sheet", { state: "visible", timeout: 15_000 });
    }
    for (let guard = 0; guard < 6; guard += 1) {
        if (await visible(".mb-main-menu__root")) return;
        const back = page.locator('.mb-side-sheet [aria-label="Back"]');
        if ((await back.count()) === 0) break;
        await back.first().click();
        await page.waitForTimeout(250);
    }
    await page.waitForSelector(".mb-main-menu__root", { state: "visible", timeout: 15_000 });
}

/** Opens one page of the side sheet by the label on its row in the root list. */
async function openMenuPage(label: string, waits: string): Promise<void> {
    await openMenuRoot();
    await page.locator(".mb-main-menu__root .mb-menu-option", { hasText: label }).first().click();
    await page.waitForSelector(waits, { state: "visible", timeout: 15_000 });
    await page.waitForTimeout(400);
}

/** Closes the side sheet if it is open. */
async function closeSideSheet(): Promise<void> {
    if (await visible(".mb-side-sheet")) await dismiss();
}

/**
 * Answers the operating system's folder picker with a folder that is already on disk.
 *
 * This replaces the native dialog and nothing else. The folder handed back is a real one,
 * the application then really reads the real files inside it, and every value on screen
 * afterwards came off the disk. Without this the options editor cannot be photographed at
 * all: its only door is `dialog.showOpenDialog`, and Playwright cannot drive a window the
 * operating system draws.
 *
 * `dialog` is the live Electron module object that `main/index.ts` passes to the config
 * handlers, and the call site reads `host.showOpenDialog` at call time, so replacing the
 * property here is seen by the next call.
 */
async function answerFolderPickerWith(folder: string): Promise<void> {
    await app.evaluate(({ dialog }, chosen: string) => {
        const patched = dialog as unknown as {
            showOpenDialog: (...args: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }>;
        };
        patched.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [chosen] });
    }, folder);
}

/**
 * A real BlueMap configuration folder to open in the options editor, or null.
 *
 * `MATERIAL_BLUEMAP_CAPTURE_CONFIG` names one explicitly. Failing that, the oracle gate
 * leaves one behind: it is written by upstream's own CLI, so it is a genuine BlueMap
 * config set rather than something this harness invented. When neither exists the editor
 * is captured in the only state it can honestly be in - nothing open - and the tabs are
 * recorded as skipped.
 */
function captureConfigFolder(): string | null {
    const explicit = process.env.MATERIAL_BLUEMAP_CAPTURE_CONFIG?.trim();
    const candidates = [
        explicit === undefined || explicit === "" ? null : explicit,
        join(repoRoot, "tools", "oracle", "out", "gate", "reference", "config"),
    ];
    for (const candidate of candidates) {
        if (candidate !== null && existsSync(candidate)) return candidate;
    }
    return null;
}

/**
 * A real Minecraft world folder for the wizard, or null.
 *
 * The wizard's first step probes the folder it is given through the main process, so a
 * made-up path fails the probe and the step never advances - correctly. A world this
 * repository generated satisfies it honestly; nothing else will.
 */
function captureWorldFolder(): string | null {
    const explicit = process.env.MATERIAL_BLUEMAP_CAPTURE_WORLD?.trim();
    if (explicit !== undefined && explicit !== "" && existsSync(explicit)) return explicit;
    return null;
}

/* -------------------------------------------------------------------------- */
/* First run                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Photographs the first-run flow, then completes it.
 *
 * It has to run before anything else, because it is a blocking dialog over every other
 * surface - which is exactly why the app shows it once, on a fresh profile, and never
 * again. The harness launches with a throwaway user-data directory so it is genuinely a
 * first run, and answers it the way a cautious person would: it declines the Mojang
 * download consent, which is a real answer, is remembered, and downloads nothing.
 */
async function captureFirstRun(): Promise<void> {
    const appeared = await page
        .waitForSelector(".mb-setup-card", { state: "visible", timeout: 20_000 })
        .then(() => true)
        .catch(() => false);

    if (!appeared) {
        skip(
            "First-run setup",
            "the application did not ask: this launch was not a first run, which happens when " +
                "MATERIAL_BLUEMAP_ACCEPT_DOWNLOAD is set or the user-data directory already " +
                "records a completed setup",
        );
        return;
    }

    const card = page.locator(".mb-setup-card");

    await shoot("firstrun-1-welcome", "First-run setup, the welcome step", {
        crop: card,
        cropped: "the first-run dialog",
    });
    await shoot(
        "firstrun-1-welcome-window",
        "First-run setup over the application window, showing the language modes and the two funny-level sliders",
    );

    await page.getByRole("button", { name: "Next", exact: true }).first().click();
    await page.waitForSelector(".mb-setup-outcomes", { state: "visible", timeout: 15_000 });
    await page.waitForTimeout(400);
    await shoot("firstrun-2-consent", "First-run setup, the Minecraft files consent step", {
        crop: card,
        cropped: "the first-run dialog",
    });

    // Decline, not accept. It is a real answer, it is remembered, and it leaves the
    // machine this ran on in the state it was already in rather than recording an
    // agreement to somebody else's licence on their behalf.
    await page.getByRole("button", { name: "Decline", exact: true }).first().click();
    await page.waitForSelector(".mb-setup-storage", { state: "visible", timeout: 15_000 });
    await page.waitForTimeout(400);
    await shoot("firstrun-3-storage", "First-run setup, the map storage step", {
        crop: card,
        cropped: "the first-run dialog",
    });

    await page.getByRole("button", { name: "Finish setup", exact: true }).first().click();
    await page.waitForSelector(".mb-setup-card", { state: "detached", timeout: 20_000 });
}

/* -------------------------------------------------------------------------- */
/* Setup and teardown                                                         */
/* -------------------------------------------------------------------------- */

test.beforeAll(async () => {
    target = await resolveCaptureTarget();
    console.log(`[harness] capture mode: ${target.mode}`);
    console.log(`[harness] caption: ${target.caption}`);

    // A throwaway profile directory, so the first-run flow is genuinely a first run and
    // whatever machine this is running on keeps its own settings.
    const userData = await mkdtemp(join(tmpdir(), "material-bluemap-capture-"));
    console.log(`[harness] user data: ${userData}`);

    app = await electron.launch({
        args: [appRoot, "--no-sandbox", "--disable-gpu", `--user-data-dir=${userData}`],
        env: { ...process.env, MATERIAL_BLUEMAP_SCREENSHOTS: "1" },
    });

    // Before anything is pointed at a map. The app makes no outbound request until a
    // server profile is active, and the only thing that activates one is
    // `pointAppAtCaptureTarget` below, which runs after this.
    await installNetworkGuard(app, target.allowedOrigins);
    expect(
        await networkGuardInstalled(app),
        "the offline guard did not install; refusing to capture unguarded",
    ).toBe(true);

    // Surface what the renderer is actually doing. A blank window with a silent console is
    // the hardest failure to diagnose from CI, and the whole point of this harness is to
    // produce evidence rather than a timeout.
    app.process().stdout?.on("data", (d) => process.stdout.write(`[main] ${d}`));
    app.process().stderr?.on("data", (d) => process.stderr.write(`[main] ${d}`));

    page = await app.firstWindow();
    page.on("console", (msg) => console.log(`[renderer:${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => console.log(`[renderer:pageerror] ${err.message}`));
    page.on("requestfailed", (req) =>
        console.log(`[renderer:requestfailed] ${req.url()} ${req.failure()?.errorText ?? ""}`),
    );

    await page.waitForLoadState("domcontentloaded");
    console.log(`[harness] window url: ${page.url()}`);

    // Wait on the Vue mount point, which index.html always contains, rather than on a
    // Vuetify class that only exists once the app has successfully mounted. If mounting
    // failed we still want a capture of the broken state.
    await page.waitForSelector("#app", { timeout: 30_000 });
    await page.setViewportSize(SURFACE_VIEWPORT);

    // `.mb-app` is the class App.vue puts on its `<v-app>` root. Do NOT wait on
    // `.v-application`: Vuetify 3.13 does not emit it, so that selector reports a
    // perfectly mounted app as broken, and a false alarm here would mask a real one.
    const mounted = await page
        .waitForSelector(".mb-app", { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);

    if (!mounted) {
        await mkdir(shotDir, { recursive: true });
        await page.screenshot({ path: join(shotDir, "diagnostic-unmounted.png") });
        const html = await page.content();
        await writeFile(join(shotDir, "diagnostic-unmounted.html"), html);
        console.log(`[harness] Vuetify root never appeared; captured the broken state instead.`);
        console.log(`[harness] body length: ${html.length}`);
    }

    // First, because it is a blocking dialog over everything else. Guarded, because a
    // failure here must cost this one surface rather than the whole set.
    await attempt("First-run setup", captureFirstRun);

    await pointAppAtCaptureTarget();

    // Give the map a chance to draw before anything is captured. Recorded rather than
    // asserted: a capture of an empty map is still useful evidence, but it must be
    // labelled as one instead of being published as the product.
    mapDrew = target.profile === null ? false : await waitForMapContent();
    mapArea = target.profile === null ? "none" : "map";
    if (target.profile === null) {
        console.log("[harness] no map to capture; the app is captured with an empty map area");
    } else {
        console.log(
            mapDrew
                ? "[harness] map drew content before capturing"
                : "[harness] WARNING: no map content appeared; captures show an empty scene",
        );
    }
});

test.afterAll(async () => {
    await app?.close();
    await target?.close();
});

/* -------------------------------------------------------------------------- */
/* The window itself                                                          */
/* -------------------------------------------------------------------------- */

test("captures the window's own chrome", async () => {
    await attempt("Material title bar", async () => {
        const bar = page.locator(".mb-titlebar");
        await bar.waitFor({ state: "visible", timeout: 15_000 });
        await shoot(
            "chrome-titlebar",
            "The application's own Material title bar, the whole width of the window, with no operating system caption bar above it",
            { crop: bar, cropped: "the title bar" },
        );
        await shoot(
            "chrome-titlebar-window-buttons",
            "The minimize, maximize and close buttons the application draws for itself",
            { crop: page.locator(".mb-titlebar-controls"), cropped: "the window buttons" },
        );
    });

    await attempt("Viewer control bar", async () => {
        const bar = page.locator(".mb-cb");
        await bar.waitFor({ state: "visible", timeout: 15_000 });
        await shoot(
            "chrome-control-bar",
            "The viewer control bar: the menu button, the map, marker and player lists, the view and day-night switches, the live position inputs and the compass",
            { crop: bar, cropped: "the control bar" },
        );
    });

    await attempt("Shell buttons", async () => {
        const fabs = page.locator(".mb-shell-fabs");
        await fabs.waitFor({ state: "visible", timeout: 15_000 });
        await shoot(
            "chrome-shell-buttons",
            "The three shell buttons in the bottom left corner: settings, maps and servers, and server configuration",
            { crop: fabs, cropped: "the shell buttons" },
        );
    });
});

test("captures the shell at every supported window size", async () => {
    for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(300);
        await shoot(`shell-${viewport.name}`, `The application shell at ${viewport.name}`);
    }
    await page.setViewportSize(SURFACE_VIEWPORT);
});

test("captures the shell at every supported display scale", async () => {
    for (const scale of SCALES) {
        await page.evaluate((z) => {
            document.documentElement.style.zoom = String(z);
        }, scale);
        await page.waitForTimeout(300);
        await shoot(
            `shell-scale-${String(scale).replace(".", "_")}x`,
            `The application shell at ${scale * 100}% display scale`,
        );
    }
    await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
    });
});

test("captures each navigable page", async () => {
    const items = page.locator(".v-navigation-drawer .v-list-item");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
        const label = ((await items.nth(i).innerText()) || `item-${i}`)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        await items.nth(i).click();
        await page.waitForTimeout(500);
        const name = label || `item-${i}`;
        await shoot(`page-${name}`, `The "${name}" page`);
    }
});

test("captures both themes", async () => {
    for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForTimeout(300);
        await shoot(`theme-${theme}`, `The application shell in the ${theme} theme`);
    }
    await page.emulateMedia({ colorScheme: null });
});

/* -------------------------------------------------------------------------- */
/* The side sheet menu                                                        */
/* -------------------------------------------------------------------------- */

test("captures every page of the menu", async () => {
    await attempt("Menu, root page", async () => {
        await openMenuRoot();
        await shoot("menu-root", "The main menu, with maps, markers, settings and info");
    });

    await attempt("Maps menu", async () => {
        await openMenuPage("Maps", ".mb-maps-menu");
        await shoot("menu-maps", "The maps menu, listing the maps the active profile serves");
    });

    await attempt("Settings menu", async () => {
        await openMenuPage("Settings", ".mb-side-sheet .mb-settings");
        await shoot("menu-settings", "The viewer settings menu, inside the side sheet");
    });

    await attempt("Info page", async () => {
        await openMenuPage("Info", ".mb-info-page, .mb-info-page__empty");
        await shoot("menu-info", "The info page, with the application version at the foot of it");
    });

    await attempt("Marker menu", async () => {
        await openMenuPage("Markers", ".mb-marker-menu");
        await shoot("menu-markers", "The marker menu, showing the marker sets of the loaded map");
    });

    await closeSideSheet();
});

test("captures the menu search bar and its regex builder", async () => {
    await attempt("Menu search bar", async () => {
        await openMenuPage("Settings", ".mb-side-sheet .mb-settings");

        const head = page.locator(".mb-side-sheet .mb-menu-searchbar__head .v-btn").first();
        await head.click();
        await page.waitForSelector(".mb-menu-search", { state: "visible", timeout: 15_000 });
        await page.locator(".mb-menu-search input").first().fill("render");
        await page.waitForTimeout(400);
        await shoot(
            "menu-search",
            "The settings menu's own search bar, filtering the menu down to the settings that match what was typed",
        );

        await page.locator(".mb-menu-search__builder").first().click();
        await page.waitForSelector(".mb-regex-builder", { state: "visible", timeout: 15_000 });
        await page.waitForTimeout(500);
        await shoot(
            "menu-regex-builder",
            "The regex builder anchored to the menu's search bar, with its flags, its character classes, anchors, groups, alternation and quantifiers, and the live matches underneath",
            { crop: page.locator(".mb-regex-builder"), cropped: "the regex builder" },
        );
        await dismiss();
    });

    await closeSideSheet();
});

test("captures the reset-settings super confirmation", async () => {
    await attempt("Reset settings super confirmation", async () => {
        await openMenuPage("Settings", ".mb-side-sheet .mb-settings");

        await page
            .locator(".mb-side-sheet .mb-menu-option", { hasText: "Reset All Settings" })
            .first()
            .click();
        await page.waitForSelector(".mb-super-confirm", { state: "visible", timeout: 15_000 });
        await page.waitForTimeout(400);

        const gate = page.locator(".mb-super-confirm");
        await shoot(
            "super-confirm-untouched",
            "The destructive-action gate before either key is turned: the slider will not move and the status line says both keys are needed",
            { crop: gate, cropped: "the confirmation dialog" },
        );

        const keys = page.locator(".mb-super-confirm__keys input[type='checkbox']");
        await keys.nth(0).click({ force: true });
        await page.waitForTimeout(200);
        await shoot(
            "super-confirm-one-key",
            "The destructive-action gate with one key turned, which is still not enough to arm the slider",
            { crop: gate, cropped: "the confirmation dialog" },
        );

        await keys.nth(1).click({ force: true });
        await page.waitForTimeout(300);
        await shoot(
            "super-confirm-armed",
            "The destructive-action gate with both keys turned and the slider armed, one drag away from resetting every viewer setting",
            { crop: gate, cropped: "the confirmation dialog" },
        );

        // Emergency exit rather than the slider. Driving the slider to the end really does
        // reset every setting and reload the page, and a capture is not worth doing that.
        await page.getByRole("button", { name: "Emergency exit" }).first().click();
        await page.waitForTimeout(400);
    });

    await closeSideSheet();
});

test("captures the marker menu's filter and sort controls", async () => {
    await attempt("Marker filters", async () => {
        await openMenuPage("Markers", ".mb-marker-menu");

        const toggle = page.locator(".mb-marker-menu__filters-head .v-btn").first();
        if ((await toggle.count()) === 0) {
            skip(
                "Marker search and sort controls",
                "the loaded map has no markers, so the marker menu shows only its set list and " +
                    "the search and sort controls are not part of the interface to photograph",
            );
            return;
        }

        if ((await page.locator("#mb-marker-filters").first().isVisible()) === false) {
            await toggle.click();
            await page.waitForTimeout(400);
        }
        await shoot(
            "menu-marker-filters",
            "The marker menu's search and sort controls: the search field with its plain-text and regex modes, and the sort order choice",
        );

        await page.locator(".mb-marker-search__builder-button").first().click();
        await page.waitForSelector(".mb-regex-builder", { state: "visible", timeout: 15_000 });
        await page.waitForTimeout(500);
        await shoot(
            "menu-marker-regex-builder",
            "The regex builder opened from the marker search field",
            { crop: page.locator(".mb-regex-builder"), cropped: "the regex builder" },
        );
        await dismiss();
    });

    await closeSideSheet();
});

/* -------------------------------------------------------------------------- */
/* Shell surfaces                                                             */
/* -------------------------------------------------------------------------- */

test("captures the map and server profile manager", async () => {
    await attempt("Profile manager", async () => {
        await page.locator('.mb-shell-fab[aria-label="Servers"]').first().click();
        await page.waitForSelector(".v-overlay--active .v-card", {
            state: "visible",
            timeout: 15_000,
        });
        await page.waitForTimeout(400);
        await shoot(
            "profiles-manager",
            "The maps and servers manager, listing the maps rendered on this computer and the remote BlueMap servers the application knows about, with the fields for adding another",
        );
        await dismiss();
    });
});

test("captures the settings surface and every section in it", async () => {
    const drawer = page.locator(".v-navigation-drawer.mb-settings");

    await attempt("Settings drawer", async () => {
        await page.locator('.mb-shell-fab[aria-label="Settings"]').first().click();
        await drawer.waitFor({ state: "visible", timeout: 15_000 });
        await page.waitForTimeout(600);
        await shoot("settings-drawer", "The application settings, opened over the map");
    });

    // Enumerated from the running application rather than from a list kept here, so a
    // section added in `packages/ui` arrives in this set without anybody remembering to
    // add it. `data-anchor` is what `SettingsSection.vue` puts on every one of them.
    await attempt("Settings sections", async () => {
        const sections = page.locator(".v-navigation-drawer.mb-settings .mb-setting[data-anchor]");
        const count = await sections.count();
        expect(count, "the settings drawer rendered no sections").toBeGreaterThan(0);

        for (let i = 0; i < count; i += 1) {
            const section = sections.nth(i);
            const anchor = (await section.getAttribute("data-anchor")) ?? `section-${i}`;
            const title = (await section.locator(".mb-setting__title").innerText()).trim();
            await section.scrollIntoViewIfNeeded();
            await page.waitForTimeout(400);
            await shoot(
                `settings-section-${slug(anchor)}`,
                `The "${title}" settings section, scrolled into view in the settings drawer`,
                { crop: drawer, cropped: "the settings drawer" },
            );
        }
    });

    await attempt("Settings search and regex builder", async () => {
        await page.locator(".mb-settings__search input").first().fill("java");
        await page.waitForTimeout(500);
        await shoot(
            "settings-search",
            "The settings search, filtering the drawer to the settings whose name, explanation or current value matches what was typed",
            { crop: drawer, cropped: "the settings drawer" },
        );

        await page
            .locator('.mb-settings__search [aria-label="Open the regex builder"]')
            .first()
            .click();
        await page.waitForSelector(".mb-config-regex", { state: "visible", timeout: 15_000 });
        await page.locator(".mb-config-regex__pattern textarea").first().fill("java|storage");
        await page.waitForTimeout(600);
        await shoot(
            "settings-regex-builder",
            "The regex builder anchored to the settings search, showing the pattern, the supported flags, the guided token palette and the live matches against the text on screen",
            { crop: page.locator(".mb-config-regex"), cropped: "the regex builder" },
        );
        await dismiss();
        await page.locator(".mb-settings__search input").first().fill("");
        await page.waitForTimeout(300);
    });

    skip(
        "GitHub account, signed in",
        "signing in needs a real GitHub account and a real device-flow round trip to github.com; " +
            "the harness refuses every non-loopback request, so only the signed-out state of the " +
            "account section is real here and it is the one captured",
    );

    await dismiss();
    await page.waitForTimeout(400);
});

/* -------------------------------------------------------------------------- */
/* The options editor                                                         */
/* -------------------------------------------------------------------------- */

test("captures the options editor, its tabs and its dialogs", async () => {
    const openEditor = async (): Promise<void> => {
        if (await visible(".mb-config-screen")) return;
        await page.locator('.mb-shell-fab[aria-label="Server configuration"]').first().click();
        await page.waitForSelector(".mb-config-screen", { state: "visible", timeout: 15_000 });
        await page.waitForTimeout(500);
    };

    await attempt("Options editor, nothing open", async () => {
        await openEditor();
        await shoot(
            "config-welcome",
            "The options editor before a folder is chosen, offering to open a folder BlueMap already uses or to generate a new set of config files",
            { mapArea: "covered" },
        );
    });

    const folder = captureConfigFolder();
    if (folder === null) {
        skip(
            "Options editor tabs, search, delete gate and save plan",
            "no BlueMap configuration folder was available to this run, and the editor's tabs " +
                "only exist once a real folder is open; set MATERIAL_BLUEMAP_CAPTURE_CONFIG to " +
                "one to capture them",
        );
    } else {
        console.log(`[harness] options editor folder: ${folder}`);

        await attempt("Options editor tabs", async () => {
            await openEditor();
            await answerFolderPickerWith(folder);
            await page
                .locator(".mb-config-screen__bar .v-btn", { hasText: "Open" })
                .first()
                .click();
            await page.waitForSelector(".mb-config-screen__tabs", {
                state: "visible",
                timeout: 20_000,
            });
            await page.waitForTimeout(600);

            // The notice the open raised, photographed while it is still on screen. It is
            // the app's real notification corner reporting a real thing that just happened.
            if (await visible(".mb-config-notices__toast")) {
                await shoot(
                    "notifications-toast",
                    "The notification corner reporting, without blocking anything, how many config files were read from the folder that was just opened",
                    { mapArea: "covered" },
                );
            }

            const tabs = page.locator(".mb-config-screen__tabs .v-tab");
            const count = await tabs.count();
            expect(count, "the options editor rendered no tabs").toBeGreaterThan(0);
            for (let i = 0; i < count; i += 1) {
                const label = (await tabs.nth(i).innerText()).trim();
                await tabs.nth(i).click();
                await page.waitForTimeout(600);
                await shoot(
                    `config-tab-${slug(label)}`,
                    `The options editor, the "${label}" tab, showing the settings that tab owns as they are in the config folder that is open`,
                    { mapArea: "covered" },
                );
            }
        });

        await attempt("Options editor search and regex builder", async () => {
            const search = page.locator(".mb-config-screen__search .mb-config-search input");
            await search.first().fill("port");
            await page.waitForTimeout(600);
            await shoot(
                "config-search",
                "The options editor's search, which reaches every setting on all of the tabs at once and says which tab each result lives on",
                { mapArea: "covered" },
            );

            await page
                .locator('.mb-config-screen__search [aria-label="Open the regex builder"]')
                .first()
                .click();
            await page.waitForSelector(".mb-config-regex", { state: "visible", timeout: 15_000 });
            await page.waitForTimeout(600);
            await shoot(
                "config-regex-builder",
                "The regex builder anchored to the options editor's search bar",
                { crop: page.locator(".mb-config-regex"), cropped: "the regex builder" },
            );
            await dismiss();
            await search.first().fill("");
            await page.waitForTimeout(400);
        });

        await attempt("Options editor delete gate", async () => {
            const maps = page.locator(".mb-config-screen__tabs .v-tab", { hasText: "Maps" });
            await maps.first().click();
            await page.waitForSelector(".mb-config-maps", { state: "visible", timeout: 15_000 });
            await page.waitForTimeout(500);

            await page
                .locator(".mb-config-maps .v-btn", { hasText: "Delete" })
                .first()
                .click();
            await page.waitForSelector(".mb-config-confirm", {
                state: "visible",
                timeout: 15_000,
            });
            await page.waitForTimeout(400);
            await shoot(
                "config-delete-gate",
                "The super confirmation that guards deleting a map's configuration: two keys, then a full-travel slider, with an emergency exit that is always available",
                { crop: page.locator(".mb-config-confirm"), cropped: "the confirmation popover" },
            );
            await page.getByRole("button", { name: "Emergency exit" }).first().click();
            await page.waitForTimeout(400);
        });

        await attempt("Options editor save plan", async () => {
            const save = page.locator(".mb-config-screen__bar .v-btn", { hasText: "Save" }).first();
            if (await save.isDisabled()) {
                skip(
                    "Options editor save plan",
                    "the save plan dialog only opens once something has been changed, and this " +
                        "run made no edit to the config folder it opened",
                );
                return;
            }
            await save.click();
            await page.waitForSelector(".mb-config-apply__title", {
                state: "visible",
                timeout: 15_000,
            });
            await page.waitForTimeout(400);
            await shoot(
                "config-save-plan",
                "The save plan, which names the folder and every file that would be written before anything is written",
                { mapArea: "covered" },
            );
            await dismiss();
        });
    }

    // Escape closes the editor, and focus goes back to the button that opened it. The key
    // is sent to the editor's own host region, which is what listens for it.
    if (await visible(".mb-config-screen")) {
        await page.locator('[role="region"][aria-label="Server configuration"]').press("Escape");
        await page.waitForTimeout(600);
    }
});

test("captures the notification corner and its history", async () => {
    await attempt("Notification corner", async () => {
        const tools = page.locator(".mb-config-notices__tools");
        await tools.waitFor({ state: "visible", timeout: 15_000 });
        await shoot(
            "notifications-corner",
            "The notification corner in the bottom right, with the button that opens the history of everything the application has reported",
            { crop: tools, cropped: "the notification corner" },
        );

        await page.locator('[aria-label="Notification history"]').first().click();
        await page.waitForSelector(".mb-config-notices__history", {
            state: "visible",
            timeout: 15_000,
        });
        await page.waitForTimeout(400);
        await shoot(
            "notifications-history",
            "The notification history, so a message that has already faded is still readable",
            {
                crop: page.locator(".mb-config-notices__history"),
                cropped: "the notification history panel",
            },
        );
        await dismiss();
    });
});

/* -------------------------------------------------------------------------- */
/* The wizard, which needs no map                                             */
/* -------------------------------------------------------------------------- */

test("captures the make-a-map wizard at every step", async () => {
    await pointAppAtNoMap();
    await page.waitForTimeout(800);

    await attempt("Wizard, world step", async () => {
        await shoot(
            "wizard-1-world",
            "The make-a-map wizard on its first step, asking for the world folder, with the five steps listed across the top",
        );
    });

    const world = captureWorldFolder();
    if (world === null) {
        skip(
            "Wizard steps after the first",
            "the wizard probes the world folder it is given through the main process, so the " +
                "later steps only exist once a real Minecraft world has passed that probe; set " +
                "MATERIAL_BLUEMAP_CAPTURE_WORLD to one to capture them",
        );
    } else {
        console.log(`[harness] wizard world folder: ${world}`);
        await attempt("Wizard steps", async () => {
            const field = page.locator(".mb-world-step__row input").first();
            await field.fill(world);
            await field.press("Enter");
            await page.waitForSelector(".mb-world-step__found", {
                state: "visible",
                timeout: 30_000,
            });
            await page.waitForTimeout(500);
            await shoot(
                "wizard-1-world-checked",
                "The wizard's first step after the world folder has been read: it names the dimensions it found and how many region files each holds",
            );

            // Walk the rest of the steps by their own step nav, which is the only list of
            // them that cannot drift from what the application actually has.
            const steps = page.locator(".mb-world-wizard__steps .mb-world-wizard__step");
            const count = await steps.count();
            for (let i = 1; i < count; i += 1) {
                await page
                    .locator(".mb-world-wizard__actions .v-btn", { hasText: "Next" })
                    .first()
                    .click();
                await page.waitForTimeout(700);
                const label = (await steps.nth(i).innerText()).trim().replace(/^\d+\s*/, "");
                await shoot(
                    `wizard-${i + 1}-${slug(label)}`,
                    `The make-a-map wizard on its "${label}" step`,
                );
            }
        });
    }

    await attempt("Release downloads", async () => {
        // Back to the first step, where the release downloads panel lives.
        await page.locator(".mb-world-wizard__steps .mb-world-wizard__step").first().click();
        await page.waitForTimeout(600);
        await page.locator(".mb-world-step__downloads .v-btn").first().click();
        await page.waitForSelector(".mb-downloads", { state: "visible", timeout: 15_000 });
        await page.waitForTimeout(500);
        await shoot(
            "wizard-release-downloads",
            "The release downloads panel, which offers to fetch a world from a GitHub release for somebody with no Minecraft save on this machine",
            { crop: page.locator(".mb-downloads"), cropped: "the release downloads panel" },
        );
    });

    skip(
        "Release download progress and asset list",
        "listing a release's assets and downloading one both need real traffic to github.com, " +
            "which the offline guard refuses; the panel is captured in the state it is in before " +
            "anything is asked for",
    );
    skip(
        "Render progress panel",
        "it only exists while a render is actually running, which needs a Java runtime, an " +
            "accepted Mojang download consent and minutes of work; this run declined that consent",
    );
    skip(
        "Interrupted renders",
        "it only appears when a previous render was interrupted and left a session behind, and " +
            "this throwaway profile has never run one",
    );
});

/* -------------------------------------------------------------------------- */
/* The guarantees                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The tripwire from issue #17, asserted rather than assumed.
 *
 * It fails on the first request to anything that is not loopback (or, in remote mode, the
 * one server that run was deliberately browsing), and names every offender, because the
 * failure this exists to catch is a capture that quietly starts costing a third party
 * bandwidth again.
 */
test("reached nothing but the machine it ran on", async () => {
    expect(await networkGuardInstalled(app), "the offline guard was not installed").toBe(true);

    const violations = await networkViolations(app);
    expect(
        violations.map(describeViolation),
        "the capture tried to reach the network; see captureTarget.ts and issue #17",
    ).toEqual([]);
});

test("records what was captured", async () => {
    for (const gap of skipped) console.log(`[harness] not captured - ${gap.surface}: ${gap.reason}`);

    // A manifest makes the artifact self-describing, so a reviewer reading an issue
    // comment can tell which build and which surface an image came from.
    const manifest = {
        capturedBy: "design/packages/app/test/screenshots.spec.ts",
        method: "Playwright _electron against the packaged app entry point",
        commit: process.env.GITHUB_SHA ?? "(local run)",
        run: process.env.GITHUB_RUN_ID ?? "(local run)",
        captureMode: target.mode,
        mapSource:
            target.mode === "local"
                ? `served over loopback from ${target.profile?.url ?? "(unknown)"}`
                : target.mode === "remote"
                  ? (target.profile?.url ?? "(unknown remote server)")
                  : "none: no map was loaded",
        renderedBy: target.provenance?.renderer ?? null,
        world: target.provenance?.world ?? null,
        renderedAt: target.provenance?.renderedAt ?? null,
        fixtureRequestsServed: target.servedRequests(),
        offlineGuard:
            target.mode === "remote"
                ? `loopback plus ${target.allowedOrigins.join(", ")}`
                : "loopback only; every other host is refused and recorded",
        networkViolations: await networkViolations(app),
        viewports: VIEWPORTS.map((v) => v.name),
        scales: SCALES,
        mapContentPresent: mapDrew,
        caption: target.caption,
        captures,
        skipped,
        note:
            "Every image is a capture of the real running app. None is a mockup or a design " +
            "file. Publish each one with its caption from captions.md: the caption is what " +
            "keeps a capture of the viewer from being read as a capture of the mesher. " +
            "`skipped` lists the surfaces this run could not reach, with the reason; nothing " +
            "was substituted for any of them.",
    };
    await mkdir(shotDir, { recursive: true });
    await writeFile(join(shotDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    // Ready to paste into an issue or a release comment, so the caption travels with the
    // image instead of being left behind in a JSON file nobody opens.
    const lines = [
        "# Screenshots",
        "",
        `Commit \`${manifest.commit}\`, run \`${manifest.run}\`, capture mode \`${target.mode}\`.`,
        "",
        target.caption,
        "",
        ...captures.flatMap((capture) => [
            `## ${capture.name}`,
            "",
            `![${capture.surface}](${capture.file})`,
            "",
            capture.caption,
            "",
        ]),
        ...(skipped.length === 0
            ? ["## Nothing was skipped", "", "Every surface this harness knows about was captured.", ""]
            : [
                  "## Not captured",
                  "",
                  "Nothing was substituted for these. They are listed so the gap is visible.",
                  "",
                  ...skipped.map((gap) => `- **${gap.surface}**: ${gap.reason}`),
                  "",
              ]),
    ];
    await writeFile(join(shotDir, "captions.md"), `${lines.join("\n")}\n`, "utf8");
});

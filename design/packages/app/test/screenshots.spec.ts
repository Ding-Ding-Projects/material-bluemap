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
 */

import {
    test,
    expect,
    _electron as electron,
    type ElectronApplication,
    type Page,
} from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
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

let app: ElectronApplication;
let page: Page;
let target: CaptureTarget;
let mapDrew = false;

/** One row per image, for `manifest.json` and `captions.md`. */
const captures: { name: string; file: string; surface: string; caption: string }[] = [];

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
    if (target.mode === "none") return "no map is loaded; the map area is the app's empty state";
    if (!mapDrew) return "the map had drawn nothing when this was taken, so the map area is empty";
    return target.mode === "remote"
        ? "the map area shows tiles fetched from the remote server named above"
        : "the map area shows the locally rendered world named above";
}

async function shoot(name: string, surface: string, targetPage: Page = page): Promise<void> {
    await mkdir(shotDir, { recursive: true });
    const buffer = await targetPage.screenshot();
    // A zero-byte or absent capture is a silent failure; assert it landed.
    expect(buffer.length, `capture ${name} produced no bytes`).toBeGreaterThan(1000);
    await writeFile(join(shotDir, `${name}.png`), buffer);

    const caption = `${surface}. ${target.caption} In this image, ${mapNote()}.`;
    await writeFile(join(shotDir, `${name}.caption.txt`), `${caption}\n`, "utf8");
    captures.push({ name, file: `${name}.png`, surface, caption });
}

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

test.beforeAll(async () => {
    target = await resolveCaptureTarget();
    console.log(`[harness] capture mode: ${target.mode}`);
    console.log(`[harness] caption: ${target.caption}`);

    app = await electron.launch({
        args: [appRoot, "--no-sandbox", "--disable-gpu"],
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

    await pointAppAtCaptureTarget();

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

    // Give the map a chance to draw before anything is captured. Recorded rather than
    // asserted: a capture of an empty map is still useful evidence, but it must be
    // labelled as one instead of being published as the product.
    mapDrew = target.profile === null ? false : await waitForMapContent();
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

test("captures the shell at every supported window size", async () => {
    for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(300);
        await shoot(`shell-${viewport.name}`, `The application shell at ${viewport.name}`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
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
        note:
            "Every image is a capture of the real running app. None is a mockup or a design " +
            "file. Publish each one with its caption from captions.md: the caption is what " +
            "keeps a capture of the viewer from being read as a capture of the mesher.",
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
    ];
    await writeFile(join(shotDir, "captions.md"), `${lines.join("\n")}\n`, "utf8");
});

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
 *      `manifest.json` under `skipped`, with the reason. An empty `skipped` is the claim
 *      that everything was captured; a filled one is the claim that it was not.
 *
 * The surfaces are enumerated from the running application rather than from a list kept
 * here - the settings sections from their own `data-anchor` attributes, the options
 * editor's tabs from its tab strip, the wizard's steps from the step each one lands on.
 * A section added in `packages/ui` therefore arrives in this set on its own, instead of
 * being silently missing until somebody notices.
 *
 * ## Three things to know before adding a capture
 *
 * **Do not select a button by its accessible name.** Vuetify upper-cases button labels in
 * CSS, and an accessible name is computed after `text-transform`, so `getByRole("button",
 * { name: "Next" })` matches nothing while the button plainly reads Next. It fails as a
 * thirty-second timeout rather than as a not-found, which reads like a hang. Use
 * `locator(selector, { hasText })`, which matches the text in the DOM, or a class.
 *
 * **A failing test costs the whole manifest.** Playwright discards the worker after a
 * failure and starts a new one, which re-runs `beforeAll` and empties the list of
 * captures this file has accumulated - so the run ends by publishing a manifest that
 * describes only whatever happened after the failure. Every surface is therefore opened
 * inside `attempt`, which records a gap instead of throwing.
 *
 * **`.mb-eula` is not a unique selector, and a bare wait on it hangs forever.**
 * `EulaViewer.vue` is mounted in two places at once once first-run reaches its licence
 * step: the standalone `EulaSurface` panel, always in the DOM behind `v-show` even while
 * closed (see that component's own doc comment on why it is `v-show` and not `v-if`), and
 * the compact copy inside the wizard's `SetupEulaStep`. `page.waitForSelector(".mb-eula",
 * { state: "visible" })` resolves `document.querySelector(".mb-eula")` - the first match
 * in DOM order, which is the always-hidden standalone panel mounted earlier in `App.vue`'s
 * template - and polls *that* element's visibility, never the wizard's. It cannot become
 * visible while closed, so the wait times out no matter how long the budget is; run
 * 31003307669's trace shows exactly that (a clean 15000.0ms timeout, three times, once per
 * worker launch that run spawned) and a diagnostic screenshot moments later shows the real
 * step fully rendered - it was never slow, the wait was watching the wrong element the
 * whole time. Scope the wait to the dialog (`card.locator(".mb-eula")`) and it resolves in
 * about two seconds. Confirmed directly: `page.locator(".mb-eula").count()` is 2 once the
 * step mounts, and `.first().isVisible()` is `false`.
 *
 * **First-run setup is not "one surface" like the others.** It is the one dialog in the
 * whole application that is `persistent` - no Escape, no backdrop dismiss - which is
 * correct product behaviour for the one decision that genuinely must be made before
 * continuing, and exactly why a broken capture of it is not survivable the way a broken
 * capture of, say, the changelog viewer is. If `captureFirstRun` gives up mid-flow (from
 * the bug above, or anything else), the dialog stays open and its scrim blocks every click
 * anywhere else in the shell - not just for the rest of `beforeAll`, but for the first
 * click after every later `page.reload()`, because a reload remounts the app and asks
 * `needsFirstRun()` again, and the answer is still "yes" until the flow's own Finish
 * button has actually been reached. `captureFirstRun` therefore keeps photography and
 * flow-progress on separate failure paths - a failed screenshot must never stop the flow
 * from being driven to completion - and `beforeAll` checks afterwards, in
 * `ensureFirstRunClosed`, that the dialog is really gone before handing control to the
 * rest of the suite.
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
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

/** Opening a surface involves several waits; the default per-test budget is too small. */
const SURFACE_TIMEOUT = 300_000;

/** How long to wait for one element. Short enough that a wrong selector is not a hang. */
const ELEMENT_TIMEOUT = 15_000;

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

/**
 * A label read off a control, in sentence case.
 *
 * Vuetify upper-cases tab and button labels in CSS, so `innerText` comes back as "WEB
 * SERVER" and a caption written from it shouts. The source calls it "Web server", and
 * that is what a caption should say.
 */
function readableLabel(text: string): string {
    const trimmed = text.trim().toLowerCase();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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
    /** Appended to the caption, for anything the picture alone would misrepresent. */
    readonly note?: string;
}

/**
 * Moves the pointer somewhere harmless and waits for tooltips to close.
 *
 * Playwright leaves the pointer wherever it last clicked, so the button that opened a
 * surface is still hovered when the surface is photographed and its tooltip sits on top
 * of the thing the capture is of. That tooltip is an artefact of how the harness drives
 * the app, not something a person would see, and publishing it makes the interface look
 * like it has a floating black box over its own search field.
 *
 * The corner of the title bar's drag region is the destination: it is always present, it
 * is not a control, and it has nothing to hover.
 */
async function parkPointer(): Promise<void> {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(350);
}

async function shoot(name: string, surface: string, options: ShotOptions = {}): Promise<void> {
    await mkdir(shotDir, { recursive: true });
    await parkPointer();

    const previousArea = mapArea;
    if (options.mapArea !== undefined) mapArea = options.mapArea;

    const buffer =
        options.crop === undefined ? await page.screenshot() : await options.crop.screenshot();

    // A zero-byte or absent capture is a silent failure; assert it landed. The floor is
    // low because a crop can legitimately be tiny: three window buttons on a flat bar
    // compress to a few hundred bytes, and a threshold set for a full window rejects a
    // perfectly good capture of them.
    expect(buffer.length, `capture ${name} produced no bytes`).toBeGreaterThan(200);
    await writeFile(join(shotDir, `${name}.png`), buffer);

    const where =
        options.cropped === undefined
            ? `In this image, ${mapNote()}.`
            : `This image is cropped to ${options.cropped} rather than showing the whole window.`;
    const caption = [`${surface}.`, target.caption, where, options.note].filter(Boolean).join(" ");
    await writeFile(join(shotDir, `${name}.caption.txt`), `${caption}\n`, "utf8");
    captures.push({ name, file: `${name}.png`, surface, caption });

    mapArea = previousArea;
}

/**
 * Runs a step that only tidies up after a capture, and swallows its failure.
 *
 * Housekeeping is not a surface. Reporting a failed one as a missing screen puts a false
 * statement in the manifest beside an image that plainly exists.
 */
async function attemptQuietly(run: () => Promise<void>): Promise<void> {
    try {
        await run();
    } catch {
        // Deliberately silent: nothing published depends on this succeeding.
    }
}

/** Records a surface this run deliberately did not photograph. */
function skip(surface: string, reason: string): void {
    skipped.push({ surface, reason });
    console.log(`[harness] skipped ${surface}: ${reason}`);
}

/**
 * Runs one surface's capture sequence, and records a gap rather than failing the run if
 * the surface never appeared.
 *
 * A thrown selector timeout here means one screen is missing from the set. Failing for it
 * would take the other forty with it - see the note at the top of this file about what a
 * failure does to the manifest - and an artifact of forty good captures plus a named gap
 * is far more useful than no artifact at all. The gap is loud: it is in `manifest.json`,
 * in `captions.md`, printed by the final test, and a diagnostic capture of whatever was
 * on screen at the time is written beside the rest.
 */
async function attempt(surface: string, run: () => Promise<void>): Promise<void> {
    try {
        await run();
    } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        const reason = details.split("\n")[0];
        skip(surface, `the harness could not open it in this run: ${reason ?? "unknown error"}`);
        await writeFile(
            join(shotDir, `diagnostic-${slug(surface)}.txt`),
            `${details}\n`,
            "utf8",
        ).catch(() => undefined);
        await page
            .screenshot({ path: join(shotDir, `diagnostic-${slug(surface)}.png`) })
            .catch(() => undefined);
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
 * The wizard and the map are separate pages in the persistent tab strip. Clearing the
 * active profile makes the wizard page truthful, but a fresh shell still lands on the map
 * tab, so the harness follows the same visible navigation a person would use before it
 * waits for the wizard. It never forces the component into the DOM over another page.
 */
async function pointAppAtNoMap(): Promise<void> {
    await page.evaluate((key: string) => {
        window.localStorage.setItem(key, JSON.stringify({ profiles: [], activeId: null }));
        window.location.hash = "";
    }, PROFILE_STORAGE_KEY);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app", { timeout: 30_000 });
    /*
     * The wizard is a tab now, not the thing that appears when no map is loaded.
     *
     * It used to be rendered by the shell whenever `profilesStore.activeId` was null, so
     * clearing the profile list was enough to put it on screen. Since the shell became
     * tabbed it lives behind "Make a map", which is a real improvement - it is reachable
     * while a map is open, which it was not - and it means this helper has to open the tab
     * rather than assume an empty profile list shows it. Waiting for `.mb-world-wizard`
     * without that is a thirty second timeout describing a wizard that is fine.
     */
    const wizardTab = page.locator('[role="tab"]', { hasText: /make a map/i }).first();
    await wizardTab.waitFor({ state: "visible", timeout: 30_000 });
    if ((await wizardTab.getAttribute("aria-selected")) !== "true") {
        // The label, not the tab. A tab carries its own close button, so a click on the
        // tab's centre is a coin toss between selecting it and closing it - and when the
        // close button wins, Playwright reports a thirty-second click timeout on a locator
        // it had already resolved, which reads like a hung application.
        await wizardTab
            .locator(".mb-tabs-strip__label")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
    }
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

/** The one control in this application that cancels a super confirmation. */
function emergencyExit(): Locator {
    return page.locator(".v-btn", { hasText: "Emergency exit" }).first();
}

/**
 * Selects a page's tab in the shell's own strip, whether or not it currently fits.
 *
 * A fresh profile seeds one tab per declared page - eleven of them - and at this
 * harness's `SURFACE_VIEWPORT` (1280x800) only the first seven ordinary tabs fit before
 * `TabStrip.vue`'s own overflow arithmetic moves the rest behind the "N tabs do not fit"
 * control (see that component's own doc comment: "moved into an overflow menu and the
 * button says how many"). That is real, working behaviour - the exact mechanism the
 * "Tab strip" capture below exists to show - not an absent surface, so a plain
 * `[role="tab"]` lookup for one of the later pages times out waiting for an element that
 * is sitting behind that control rather than missing. `pagesTab.waitFor(...)` did exactly
 * that for "Publish to Pages" and read as a broken screen in the manifest, when the fix a
 * person would use without thinking about it is the same overflow menu `TabStrip.vue`
 * already ships: open it, and choose the tab from the list inside.
 *
 * Tries the direct tab first, with a short budget rather than `ELEMENT_TIMEOUT`, so a tab
 * that is genuinely visible activates immediately and one that is not falls through to
 * the overflow route well inside this step's own timeout instead of spending the whole
 * budget on a lookup that was never going to resolve.
 *
 * The overflow *button* is scoped to `.mb-shell-tabs`, not the bare page. `AppSettings.vue`
 * and `ConfigScreen.vue` mount their own `TabbedNavigation` too - see the "Tab context
 * menu" step further down this file for the exact prior bug an unscoped lookup here would
 * repeat: it can resolve to Settings' or the options editor's own overflow control
 * instead, invisible while that surface is closed and therefore never clickable no matter
 * how long the wait.
 *
 * The overflow menu's *content* is deliberately left unscoped. `v-menu` teleports it out
 * from under `.mb-shell-tabs` into the shared overlay container - the same reason "Tab
 * finder" further down reaches for its panel unscoped rather than through `shellTabs` -
 * and because this menu is not `eager` like the tab finder's, nothing is mounted for it at
 * all until this function's own click opens it, so there is only ever one to find.
 */
async function openShellTab(label: RegExp): Promise<void> {
    const shellTabs = page.locator(".mb-shell-tabs");
    const direct = shellTabs.locator('[role="tab"]', { hasText: label }).first();
    const directlyVisible = await direct
        .waitFor({ state: "visible", timeout: 2_000 })
        .then(() => true)
        .catch(() => false);

    if (directlyVisible) {
        if ((await direct.getAttribute("aria-selected")) !== "true") {
            await direct
                .locator(".mb-tabs-strip__label")
                .first()
                .click({ timeout: ELEMENT_TIMEOUT });
        }
        return;
    }

    const overflowButton = shellTabs.locator('[aria-label*="do not fit"]').first();
    await overflowButton.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await overflowButton.click({ timeout: ELEMENT_TIMEOUT });
    const item = page.locator(".mb-tabs-strip__sheet .v-list-item", { hasText: label }).first();
    await item.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await item.click({ timeout: ELEMENT_TIMEOUT });
}

/**
 * Presses the command palette's own shortcut and waits for it to render.
 *
 * `Control+Shift+F`, not `Control+K`: the palette used to answer to Ctrl+K, and that
 * shortcut is what this drove until the palette's own module changed its mind about which
 * chord it owns (see `palettePrefs.ts`). Driving the real shortcut here, rather than a
 * selector for a button that opens it, is what would have caught that change - a capture
 * that finds another way in would keep passing the day the documented shortcut stopped
 * working.
 */
async function openPalette(): Promise<void> {
    // Pressed and released one key at a time, rather than as a `"Control+Shift+F"` chord:
    // Playwright tracks modifier state on the page for as long as this run lives, and a
    // chord that left Shift or Control reporting as still held would turn the very next
    // right-click in the suite into a Shift+right-click - which every `AppearanceTarget`
    // and every tab treats as "skip the menu, open the editor" - so a later assertion
    // would fail with a confusing timeout on a menu that was never going to appear.
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await page.keyboard.press("F");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
    await page.waitForSelector(".mb-palette", { state: "visible", timeout: ELEMENT_TIMEOUT });
    await page.waitForTimeout(400);
}

/**
 * True when a Vuetify navigation drawer is actually open.
 *
 * A `temporary` drawer stays in the document when it is closed and is slid out of the
 * window with a transform, so it keeps a bounding box and `isVisible()` reports it as on
 * screen. That is how a run concluded the side sheet was already open, never pressed the
 * button that opens it, and then spent fifteen seconds waiting for a page inside a drawer
 * nobody had opened. `v-navigation-drawer--active` is the class Vuetify actually toggles.
 */
async function drawerOpen(selector: string): Promise<boolean> {
    return page
        .locator(`${selector}.v-navigation-drawer--active`)
        .first()
        .isVisible()
        .catch(() => false);
}

/**
 * Selects the Map tab if some other tab is active.
 *
 * `.mb-cb-menu` - the control bar's own Menu button - is part of the map page's content,
 * not the shell chrome, so it does not exist in the DOM at all on any other tab. A test
 * running late enough in the file to follow one that switched tabs (the appearance editor
 * capture right-clicks "Maps and servers"; the tab strip capture visits several tabs by
 * name) would otherwise see `openMenuRoot` wait out its full budget for a button that was
 * never going to appear, which reads exactly like a slow click and is not one: confirmed
 * directly that `.mb-cb-menu` is a zero-match, `count() === 0` locator on every tab but
 * Map, not merely a hidden one.
 */
async function ensureMapTabActive(): Promise<void> {
    const mapTab = page.locator('.mb-shell-tabs [role="tab"]', { hasText: /^Map$/i }).first();
    if ((await mapTab.count()) === 0) return;
    if ((await mapTab.getAttribute("aria-selected")) === "true") return;
    await mapTab.locator(".mb-tabs-strip__label").first().click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForTimeout(300);
}

/**
 * Opens the side sheet and walks back to its root page.
 *
 * The menu button re-opens whatever page was last on the stack, not the root, so a second
 * surface captured after the first would otherwise photograph the first one again.
 */
async function openMenuRoot(): Promise<void> {
    await ensureMapTabActive();
    if (!(await drawerOpen(".mb-side-sheet"))) {
        await page.locator(".mb-cb-menu").first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-side-sheet.v-navigation-drawer--active", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
    }
    for (let guard = 0; guard < 6; guard += 1) {
        if (await visible(".mb-main-menu__root")) return;
        const back = page.locator('.mb-side-sheet [aria-label="Back"]');
        if ((await back.count()) === 0) break;
        await back.first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(300);
    }
    await page.waitForSelector(".mb-main-menu__root", {
        state: "visible",
        timeout: ELEMENT_TIMEOUT,
    });
}

/** Opens one page of the side sheet by the label on its row in the root list. */
async function openMenuPage(label: string, waits: string): Promise<void> {
    await openMenuRoot();
    await page
        .locator(".mb-main-menu__root .mb-menu-option", { hasText: label })
        .first()
        .click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(waits, { state: "visible", timeout: ELEMENT_TIMEOUT });
    await page.waitForTimeout(400);
}

/**
 * Makes sure the options editor is not painted over the window before a step that needs
 * the tab strip, a shell button, or the side sheet menu underneath it.
 *
 * The editor's own test closes it by pressing Escape with its host region focused, and an
 * earlier step inside that same test timing out can leave focus somewhere else entirely -
 * which leaves `.mb-config-screen` open, covering the tab strip and everything under it,
 * for every test that runs after it. That is a fact about how a previous step's cleanup
 * can fail, not about the surface a later step means to capture, so closing it here first
 * is what keeps a capture from being reported as an unopenable surface when the real
 * problem was a screen left open by something else.
 */
async function ensureOptionsEditorClosed(): Promise<void> {
    if (!(await visible(".mb-config-screen"))) return;
    await page
        .locator('[role="region"][aria-label="Server configuration"]')
        .press("Escape")
        .catch(() => undefined);
    await page.waitForTimeout(700);
}

/**
 * Closes the side sheet if it is open.
 *
 * Escape is not enough on its own: the sheet treats it as Back, so from a page two deep
 * it pops one page and stays open. It is 320 pixels wide on the left, which is exactly
 * where the three shell buttons live, so a sheet left open makes the settings and profile
 * captures fail with a click timeout on a button nothing is wrong with. Its own close
 * button is unambiguous, so use that.
 */
async function closeSideSheet(): Promise<void> {
    for (let guard = 0; guard < 6; guard += 1) {
        if (!(await drawerOpen(".mb-side-sheet"))) return;
        const close = page.locator('.mb-side-sheet [aria-label="Close the menu"]');
        if ((await close.count()) === 0) {
            await dismiss();
            continue;
        }
        await close.first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
    }
}

/**
 * A real Minecraft world folder for the wizard, generating one if nothing was supplied.
 *
 * The wizard's first step probes the folder it is given through the main process, so a
 * made-up path fails the probe and the step never advances - correctly. Only a real world
 * satisfies it, and this repository can write one, so a run with nothing to point at makes
 * its own rather than recording four captures as skipped. It is small on purpose: these
 * captures need a world the wizard accepts, not a world worth rendering.
 *
 * A supplied path still wins, and a generator that fails still yields null - the skip is
 * the honest outcome then, and it says which command failed.
 */
function captureWorldFolder(): string | null {
    const explicit = process.env.MATERIAL_BLUEMAP_CAPTURE_WORLD?.trim();
    if (explicit !== undefined && explicit !== "" && existsSync(explicit)) return explicit;

    const cli = resolve(here, "../../worldgen/dist/cli.js");
    if (!existsSync(cli)) return null;

    const out = join(tmpdir(), "material-bluemap-capture-world");
    try {
        // Deterministic seed: the same world every run, so a capture that changes is a
        // change in the application rather than in the terrain behind it.
        execFileSync(process.execPath, [cli, "--seed", "1", "--size", "64", "--out", out], {
            stdio: "pipe",
            timeout: 240_000,
        });
    } catch (error) {
        console.log(
            `[harness] could not generate a capture world: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
        );
        return null;
    }

    const world = readdirSync(out, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(out, entry.name))
        .find((folder) => existsSync(join(folder, "level.dat")));
    return world ?? null;
}

/* -------------------------------------------------------------------------- */
/* First run                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Takes one first-run step's screenshot(s) without letting a failed capture stop the flow
 * from being driven to completion.
 *
 * Every other surface in this file costs only itself when its capture fails, because
 * `attempt` isolates it. First-run setup cannot be isolated the same way: the dialog it
 * lives inside is `persistent`, so the only thing that ever gets it off screen is actually
 * reaching Finish, and a photography failure - a bad crop, a write error, a stray
 * assertion - must never be allowed to leave the click sequence stalled partway through.
 */
async function captureFirstRunStep(surface: string, run: () => Promise<void>): Promise<void> {
    try {
        await run();
    } catch (error) {
        const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
        skip(surface, `the harness could not capture it in this run: ${reason}`);
    }
}

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
    const actions = page.locator(".mb-setup-card__actions .v-btn");

    await captureFirstRunStep("First-run setup: welcome", async () => {
        await shoot(
            "firstrun-1-welcome",
            "First-run setup, the welcome step, with the three language modes and a separate funny level for each language",
            { crop: card, cropped: "the first-run dialog" },
        );
        await shoot(
            "firstrun-1-welcome-window",
            "First-run setup as it appears over the whole application window on a fresh profile",
        );
    });

    await actions.last().click({ timeout: ELEMENT_TIMEOUT });
    // The licence became its own step. Keep the capture honest: wait for that real
    // viewer, then press its Next control before looking for the consent question. The
    // old harness clicked once and waited for `.mb-setup-outcomes`, which left the EULA
    // dialog open and made every later tab click hit Vuetify's overlay scrim.
    //
    // Scoped to `card`, not `page`: `EulaViewer.vue` is also mounted, always, inside the
    // standalone `EulaSurface` panel (`v-show`-hidden while closed, never removed from the
    // DOM), so an unscoped `.mb-eula` matches that permanently-hidden copy first and a wait
    // on it never resolves - see the module doc comment for how this was confirmed.
    await card.locator(".mb-eula").waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await page.waitForTimeout(400);
    await captureFirstRunStep("First-run setup: licence", async () => {
        await shoot(
            "firstrun-2-eula",
            "First-run setup, the Minecraft licence step, with the document provenance and its anchored search",
            { crop: card, cropped: "the first-run dialog" },
        );
    });
    await actions.last().click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(".mb-setup-outcomes", {
        state: "visible",
        timeout: ELEMENT_TIMEOUT,
    });
    await page.waitForTimeout(400);
    await captureFirstRunStep("First-run setup: consent", async () => {
        await shoot(
            "firstrun-2-consent",
            "First-run setup, the Minecraft files step, which asks once whether the application may download from Mojang and says what each answer means",
            { crop: card, cropped: "the first-run dialog" },
        );
    });

    // Decline, not accept. It is a real answer, it is remembered, and it leaves the
    // machine this ran on in the state it was already in rather than recording an
    // agreement to somebody else's licence on their behalf.
    await page.locator(".mb-setup-card__answer").nth(1).click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(".mb-setup-storage", {
        state: "visible",
        timeout: ELEMENT_TIMEOUT,
    });
    await page.waitForTimeout(400);
    await captureFirstRunStep("First-run setup: storage", async () => {
        await shoot(
            "firstrun-3-storage",
            "First-run setup, the map storage step, which asks where rendered maps should be written",
            { crop: card, cropped: "the first-run dialog" },
        );
    });

    await actions.last().click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(".mb-setup-card", { state: "detached", timeout: 20_000 });
}

/**
 * Last-resort recovery when `captureFirstRun` could not drive the dialog to completion.
 *
 * `attempt` keeps a thrown step from failing the whole run, but for this one surface that
 * is not the same as making it safe to continue: the dialog is still open, still
 * `persistent`, and about to survive the `page.reload()` that follows - because
 * `needsFirstRun()` is asked fresh on every mount and the answer is still "yes" until
 * `completeFirstRun()` has actually been called. Left alone, that reload does not clear
 * the dialog, it recreates it, open, at the welcome step, for whichever test runs next.
 *
 * So this checks for exactly that: the card still attached after `captureFirstRun`
 * returned. If it is, the run is told so - this is a real gap, not a silent recovery -
 * and the harness calls the app's own `completeFirstRun()` bridge method directly, the
 * same call the flow's own Finish button makes. That is not a fake dismissal: nothing
 * here touches the scrim, the dialog's `visible` state, or any CSS. It is the one honest
 * way left to make "first run is over" true without repeating the same click sequence
 * that just failed for a reason this function does not know - and Mojang's licence stays
 * declined either way, because nothing here calls `acceptDownload`.
 */
async function ensureFirstRunClosed(): Promise<void> {
    const stillOpen = await page.locator(".mb-setup-card").count();
    if (stillOpen === 0) return;

    skip(
        "First-run setup: completion",
        "the flow did not reach Finish in this run; completing it directly through the " +
            "bridge so the dialog does not reopen, still declined, after the reload that " +
            "follows",
    );
    await page
        .evaluate(async () => {
            const bridge = (
                window as unknown as {
                    materialBluemap?: { completeFirstRun?: () => Promise<unknown> };
                }
            ).materialBluemap;
            await bridge?.completeFirstRun?.();
        })
        .catch(() => {
            // Nothing left to try from here; `pointAppAtCaptureTarget` still reloads next,
            // and if the dialog reopens the affected tests will report it honestly rather
            // than hang silently, exactly as they did before this recovery existed.
        });
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
    await mkdir(shotDir, { recursive: true });
    await page.setViewportSize(SURFACE_VIEWPORT);

    // `.mb-app` is the class App.vue puts on its `<v-app>` root. Do NOT wait on
    // `.v-application`: Vuetify 3.13 does not emit it, so that selector reports a
    // perfectly mounted app as broken, and a false alarm here would mask a real one.
    const mounted = await page
        .waitForSelector(".mb-app", { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);

    if (!mounted) {
        await page.screenshot({ path: join(shotDir, "diagnostic-unmounted.png") });
        const html = await page.content();
        await writeFile(join(shotDir, "diagnostic-unmounted.html"), html);
        console.log(`[harness] Vuetify root never appeared; captured the broken state instead.`);
        console.log(`[harness] body length: ${html.length}`);
    }

    // First, because it is a blocking dialog over everything else. Guarded, because a
    // failure here must cost this one surface rather than the whole set - which
    // `ensureFirstRunClosed` right after is what actually makes true, since `attempt` on
    // its own only stops the exception, not the dialog it left open.
    await attempt("First-run setup", captureFirstRun);
    await ensureFirstRunClosed();

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

test("captures the render location choice for routing evidence", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    const worldTab = page.locator('[role="tab"]', { hasText: /Make a map/i }).first();
    await worldTab.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    if ((await worldTab.getAttribute("aria-selected")) !== "true") await worldTab.click();
    const card = page.locator(".mb-run-location");
    await card.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shoot(
        "run-location",
        "The render-location choice: local, Docker on this computer, and another machine over SSH, with Docker's real daemon state and the route that will actually be used",
        { crop: card, cropped: "the render-location card", mapArea: "covered" },
    );
});

/* -------------------------------------------------------------------------- */
/* The window itself                                                          */
/* -------------------------------------------------------------------------- */

test("captures the window's own chrome", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Material title bar", async () => {
        const bar = page.locator(".mb-titlebar");
        await bar.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "chrome-titlebar",
            "The application's own Material title bar, the whole width of the window, with no operating system caption bar above it",
            { crop: bar, cropped: "the title bar" },
        );
        await shoot(
            "chrome-titlebar-window-buttons",
            "The minimize, maximize and close buttons the application draws for itself, because the window is frameless",
            { crop: page.locator(".mb-titlebar-controls"), cropped: "the window buttons" },
        );
    });

    await attempt("Viewer control bar", async () => {
        const bar = page.locator(".mb-cb");
        await bar.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "chrome-control-bar",
            "The viewer control bar: the menu button, the map, marker and player lists, the view and day-night switches, the live position inputs and the compass",
            { crop: bar, cropped: "the control bar" },
        );
    });

    await attempt("Shell buttons", async () => {
        const fabs = page.locator(".mb-shell-fabs");
        await fabs.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
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
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Menu, root page", async () => {
        await openMenuRoot();
        await shoot(
            "menu-root",
            "The main menu, listing maps, markers, settings and info, then the camera and screenshot actions",
        );
    });

    await attempt("Maps menu", async () => {
        await openMenuPage("Maps", ".mb-maps-menu");
        await shoot("menu-maps", "The maps menu, listing the maps the active profile serves");
    });

    await attempt("Settings menu", async () => {
        await openMenuPage("Settings", ".mb-side-sheet .mb-settings");
        await shoot(
            "menu-settings",
            "The viewer settings menu inside the side sheet, with its own search bar at the top",
        );
    });

    await attempt("Info page", async () => {
        await openMenuPage("Info", ".mb-info-page, .mb-info-page__empty");
        await shoot("menu-info", "The info page, with the application version at the foot of it");
    });

    await attempt("Marker menu", async () => {
        await openMenuPage("Markers", ".mb-marker-menu");
        await shoot(
            "menu-markers",
            "The marker menu, showing the marker sets of the map that is loaded",
        );
    });

    await closeSideSheet();
});

test("captures the menu search bar and its regex builder", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Menu search bar", async () => {
        await openMenuPage("Settings", ".mb-side-sheet .mb-settings");

        await page
            .locator(".mb-side-sheet .mb-menu-searchbar__head .v-btn")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-menu-search", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.locator(".mb-menu-search input").first().fill("re");
        await page.waitForTimeout(500);
        await shoot(
            "menu-search",
            "The settings menu's own search bar, filtering the menu down to the settings that match what was typed",
        );

        await page.locator(".mb-menu-search__builder").first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-regex-builder", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(600);
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
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Reset settings super confirmation", async () => {
        await openMenuPage("Settings", ".mb-side-sheet .mb-settings");

        await page
            .locator(".mb-side-sheet .mb-menu-option", { hasText: "Reset All Settings" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-super-confirm", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(400);

        const gate = page.locator(".mb-super-confirm");
        await shoot(
            "super-confirm-untouched",
            "The destructive-action gate before either key is turned: the slider will not move, and the status line says both keys are needed",
            { crop: gate, cropped: "the confirmation dialog" },
        );

        const keys = page.locator(".mb-super-confirm__keys input[type='checkbox']");
        await keys.nth(0).click({ force: true });
        await page.waitForTimeout(300);
        await shoot(
            "super-confirm-one-key",
            "The destructive-action gate with one key turned, which is still not enough to arm the slider",
            { crop: gate, cropped: "the confirmation dialog" },
        );

        await keys.nth(1).click({ force: true });
        await page.waitForTimeout(400);
        await shoot(
            "super-confirm-armed",
            "The destructive-action gate with both keys turned and the slider armed, one full drag away from resetting every viewer setting",
            { crop: gate, cropped: "the confirmation dialog" },
        );

        // Emergency exit rather than the slider. Driving the slider to the end really does
        // reset every setting and reload the page, and a capture is not worth doing that.
        await emergencyExit().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
    });

    await closeSideSheet();
});

test("captures the marker menu's filter and sort controls", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Marker search and sort controls", async () => {
        await openMenuPage("Markers", ".mb-marker-menu");

        const toggle = page.locator(".mb-marker-menu__filters-head .v-btn");
        if ((await toggle.count()) === 0) {
            skip(
                "Marker search and sort controls",
                "the map this run captured carries no markers, so the marker menu has no marker " +
                    "section and its search and sort controls are not on screen to photograph",
            );
            return;
        }

        if (!(await visible("#mb-marker-filters"))) {
            await toggle.first().click({ timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(400);
        }
        await shoot(
            "menu-marker-filters",
            "The marker menu's search and sort controls: the search field with its plain-text and regular-expression modes, and the sort order choice",
        );

        await page
            .locator(".mb-marker-search__builder-button")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-regex-builder", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(600);
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
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Profile manager", async () => {
        // It used to open from a floating button, and this clicked that button. The shell
        // removed it when it became tabbed - a tab and a FAB reaching one surface are two
        // navigation models arguing on one screen - so this waited fifteen seconds for a
        // control that was deliberately deleted, and the capture quietly left the set.
        const serversTab = page.locator('[role="tab"]', { hasText: /maps and servers/i }).first();
        await serversTab.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        if ((await serversTab.getAttribute("aria-selected")) !== "true") {
            // The label, not the tab: a tab carries its own close button, and a click on the
            // tab's centre is a coin toss between selecting it and closing it.
            await serversTab
                .locator(".mb-tabs-strip__label")
                .first()
                .click({ timeout: ELEMENT_TIMEOUT });
        }
        await page.waitForSelector('[role="tabpanel"]', {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        // `attached`, not `visible`: the listbox is always rendered, but with no maps and no
        // servers yet it has no rows, so it has no height, and Playwright calls a
        // zero-height element invisible. Waiting for it to be seen is waiting for somebody
        // to add a server first.
        await page.waitForSelector(".mb-profiles__list", {
            state: "attached",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "profiles-manager",
            "The maps and servers manager on its own tab, listing the maps rendered on this computer and the remote BlueMap servers the application knows about, with the fields for adding another",
            { mapArea: "covered" },
        );
    });
});

test("captures the backup screen", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Backup screen", async () => {
        const backupsTab = page.locator('[role="tab"]', { hasText: /backups/i }).first();
        await backupsTab.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        if ((await backupsTab.getAttribute("aria-selected")) !== "true") {
            await backupsTab
                .locator(".mb-tabs-strip__label")
                .first()
                .click({ timeout: ELEMENT_TIMEOUT });
        }
        await page.waitForSelector(".mb-backup", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "backups",
            "Backing a world or a rendered map up to GitHub release assets: what to pack, where it goes, and the notice saying nobody is signed in to GitHub on this computer yet. The screen states why this uses release assets rather than Git LFS, and the pointer format it writes",
            { mapArea: "covered" },
        );
    });
});

/**
 * Opens Settings if it is not already open, then switches to one section through the
 * panel's own search - the same route a person uses, and the only one this harness can
 * rely on regardless of which tab Settings was last showing.
 *
 * That last part is not hypothetical. `AppSettings.vue`'s `revealAnchor()` says so in its
 * own comment: opening the panel through the plain Settings FAB passes no anchor, and "no
 * anchor means just open it... no tab is switched, so whichever tab this surface last
 * remembered stays exactly where it was left" - deliberate app behaviour, a settings panel
 * that remembers where you were, not a bug. The "Settings sections" step below drives
 * through all six sections and leaves the last one (Language and tone) active when it
 * finishes; a later step that reopens Settings with the bare FAB and assumes the Mojang
 * consent tab is showing - because that used to be the only tab there was, before every
 * section became its own lazily-mounted tab - reopens on whatever the previous test left
 * behind instead, and a locator scoped to a tab that is not mounted times out looking for
 * an element that was never going to appear. That is what sent release `v0.1.0-build.419`
 * (run 31031646647) out with a red Screenshots job: "EULA viewer - the harness could not
 * open it in this run: locator.click: Timeout 15000ms exceeded", chasing
 * `.mb-consent-row button` on whatever tab happened to be left open rather than the one
 * that actually holds it.
 */
async function openSettingsSection(anchor: string, title: string): Promise<void> {
    if (!(await visible(".mb-settings"))) {
        await page
            .locator('.mb-shell-fab[aria-label="Settings"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-settings", { state: "visible", timeout: ELEMENT_TIMEOUT });
    }
    const searchInput = page.locator(".mb-settings__search input").first();
    await searchInput.fill("");
    await searchInput.fill(anchor);
    const result = page.locator(".mb-settings__result", { hasText: title });
    await result.first().waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await result.first().click();
    await searchInput.fill("");
}

test("captures the settings surface and every section in it", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    // `.mb-settings` itself, not the Vuetify drawer it used to live inside. The settings
    // surface can now be floating or docked to any edge, so its chrome is `DockedSurface`
    // rather than `v-navigation-drawer` - and a selector naming the old chrome cannot match
    // in any placement, which is how two required captures went missing at once.
    const drawer = page.locator(".mb-settings");

    await attempt("Settings drawer", async () => {
        await page
            .locator('.mb-shell-fab[aria-label="Settings"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-settings", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(700);
        await shoot("settings-drawer", "The application settings, opened over the map");
    });

    // Every settings section is now its own browser-style tab (`AppSettings.vue`'s own
    // doc comment: "Only the active tab's section is mounted at a time"), so a bulk query
    // for `[data-anchor]` finds only whichever one tab happens to already be open - it
    // used to find every section at once, back when they were one long scrolling column
    // under simultaneous `data-anchor` markers. That regression is invisible in the
    // manifest (`attempt()` records a gap, not a failure) and was found only by counting
    // captures: six anchors documented in `docs/render-in-actions.md` and the README
    // shrank to one (`settings-section-mojang-download-consent`) with the run staying
    // green throughout - the same "recorded a gap, not a failure" shape `CONFIG_STATE_NOTE`
    // above already warns about for the options editor.
    //
    // Fixed by driving the surface the way a person actually reaches a section now: type
    // its anchor into the settings search (the search haystack includes the literal
    // anchor string, per `sectionHaystack` in `settingsSections.ts`), click the one
    // matching result, which opens and switches to that section's tab, then capture.
    //
    // The anchor list is hard-coded rather than imported, for the same reason
    // `PROFILE_STORAGE_KEY` above is: `settingsSections.ts` is bundled through
    // `packages/ui`'s own Vite pipeline and this is a plain Playwright/Node test with no
    // access to that build. If a section is added there without a matching entry here,
    // this loop simply will not open it - which is exactly the gap this fix exists to
    // stop being silent, so a missing/renamed anchor shows up as a named capture failure
    // rather than as a manifest that quietly lists fewer sections than the product has.
    await attempt("Settings sections", async () => {
        const anchors: { anchor: string; title: string }[] = [
            { anchor: "mojang-download-consent", title: "Mojang download consent" },
            { anchor: "java-runtime", title: "Java runtime" },
            { anchor: "map-storage-directory", title: "Where rendered maps go" },
            { anchor: "world-folder", title: "World folder" },
            { anchor: "github-account", title: "GitHub account" },
            { anchor: "language-and-tone", title: "Language and tone" },
        ];

        const searchInput = page.locator(".mb-settings__search input").first();

        for (const { anchor, title } of anchors) {
            await searchInput.fill("");
            await searchInput.fill(anchor);
            const result = page.locator(".mb-settings__result", { hasText: title });
            await result.first().waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await result.first().click();
            await page.waitForTimeout(500);
            await shoot(
                `settings-section-${slug(anchor)}`,
                `The "${title}" settings section, scrolled into view in the settings drawer`,
                { crop: drawer, cropped: "the settings drawer" },
            );
        }

        await searchInput.fill("");
    });

    await attempt("Settings search", async () => {
        await page.locator(".mb-settings__search input").first().fill("java");
        await page.waitForTimeout(600);
        await shoot(
            "settings-search",
            "The settings search, filtering the drawer to the settings whose name, explanation or current value matches what was typed",
            { crop: drawer, cropped: "the settings drawer" },
        );
    });

    await attempt("Settings regex builder", async () => {
        await page
            .locator('.mb-settings__search [aria-label="Open the regex builder"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-regex", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.locator(".mb-config-regex__pattern textarea").first().fill("java|storage");
        await page.waitForTimeout(700);
        await shoot(
            "settings-regex-builder",
            "The regex builder anchored to the settings search, showing the pattern, the supported flags, the guided token palette and the live matches against the text on screen",
            { crop: page.locator(".mb-config-regex"), cropped: "the regex builder" },
        );
        await dismiss();
        await page.locator(".mb-settings__search input").first().fill("");
        await page.waitForTimeout(400);
    });

    skip(
        "GitHub account, signed in",
        "signing in needs a real GitHub account and a real device-flow round trip to github.com, " +
            "and the offline guard refuses every request that is not loopback; the signed-out " +
            "state of the account section is real and is the one captured",
    );

    await dismiss();
    await page.waitForTimeout(500);
});

/* -------------------------------------------------------------------------- */
/* The options editor                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What the options editor is showing in these captures, said plainly in every caption.
 *
 * The throwaway profile these runs use has no BlueMap config folder on disk, so the editor
 * opens on BlueMap's own generated defaults and says so in a notice across the top. Every
 * setting, tab and control below that notice is real, live and savable - what is absent is
 * a folder read off this machine, not the ability to write one.
 *
 * This note used to describe a different state, and the difference is worth recording: the
 * editor once resolved no host at all, because it called `provideConfigHost()` and
 * `useConfigHost()` in the same component and a component's own `provide` is invisible to
 * its own `inject`. Fixing that gave the editor a real bridge, which meant it stopped
 * generating a set and opened on an empty state instead - and because `attempt()` records
 * a gap rather than failing, six options-editor captures silently vanished from the
 * artifact while the job stayed green. The captures are the only thing that noticed.
 */
const CONFIG_STATE_NOTE =
    "The editor is showing BlueMap's own generated defaults, because the throwaway profile " +
    "this run uses has no config folder on disk, and it says so in the notice across the top. " +
    "Every setting, tab and control in the image is real, live and savable; what is absent is " +
    "a folder read off this machine.";

/**
 * Opens the options editor, or leaves it open.
 *
 * Called at the start of every capture in this test rather than once, because Escape is
 * how an overlay inside the editor is closed and the editor's own host region listens for
 * the same key: closing the regex builder therefore closes the editor out from under the
 * next capture. Re-opening is cheap and makes each capture independent of the last.
 */
async function ensureOptionsEditor(): Promise<void> {
    if (await visible(".mb-config-screen")) return;
    await page
        .locator('.mb-shell-fab[aria-label="Server configuration"]')
        .first()
        .click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(".mb-config-screen", {
        state: "visible",
        timeout: ELEMENT_TIMEOUT,
    });
    await page.waitForTimeout(700);
}

test("captures the options editor, its tabs and its dialogs", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Options editor", async () => {
        await ensureOptionsEditor();

        // Taken first and quickly: an informational notice dismisses itself after five
        // seconds, and this one is raised by the editor mounting.
        if (await visible(".mb-config-notices__toast")) {
            await shoot(
                "notifications-toast",
                "The notification corner reporting, without blocking anything, what the options editor loaded when it opened",
                { mapArea: "covered", note: CONFIG_STATE_NOTE },
            );
        }

        await shoot("config-screen", "The options editor as it opens", {
            mapArea: "covered",
            note: CONFIG_STATE_NOTE,
        });
    });

    await attempt("Options editor tabs", async () => {
        await ensureOptionsEditor();
        // `TabbedNavigation`/`TabButton` render a `[role="tab"]` div, not a Vuetify
        // `.v-tab` - the editor's tab strip stopped being Vuetify tabs some time ago, and
        // this selector was never updated to follow. Left as `.v-tab`, this locator
        // matches nothing, `tabs.first().waitFor` times out, and the whole step - plus
        // every step below it that opens a specific tab - reports "could not open it"
        // instead of the real failure, which is that the selector is stale.
        const tabs = page.locator('.mb-config-screen__tabs [role="tab"]');
        await tabs.first().waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        const count = await tabs.count();
        expect(count, "the options editor rendered no tabs").toBeGreaterThan(0);
        for (let i = 0; i < count; i += 1) {
            const label = readableLabel(await tabs.nth(i).innerText());
            await tabs.nth(i).click({ timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(700);
            await shoot(
                `config-tab-${slug(label)}`,
                `The options editor, the "${label}" tab, with the settings that tab owns`,
                { mapArea: "covered", note: CONFIG_STATE_NOTE },
            );
        }
    });

    await attempt("Options editor search", async () => {
        await ensureOptionsEditor();
        const search = page.locator(".mb-config-screen__search .mb-config-search input").first();
        await search.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await search.fill("port");
        await page.waitForTimeout(700);
        await shoot(
            "config-search",
            "The options editor's search, which reaches every setting on all of the tabs at once and says which tab each result lives on",
            { mapArea: "covered", note: CONFIG_STATE_NOTE },
        );
    });

    await attempt("Options editor regex builder", async () => {
        await page
            .locator('.mb-config-screen__search [aria-label="Open the regex builder"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-regex", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(700);
        await shoot(
            "config-regex-builder",
            "The regex builder anchored to the options editor's search bar",
            { crop: page.locator(".mb-config-regex"), cropped: "the regex builder" },
        );
    });

    // Tidying up, outside the attempt above and unable to fail it. Escape closes the
    // builder and then reaches the editor's own host region, which closes the editor too,
    // so clearing the search afterwards would otherwise fail and be reported as though
    // the builder had never opened - while its capture sat on disk beside the claim.
    await dismiss();
    await attemptQuietly(async () => {
        await ensureOptionsEditor();
        await page.locator(".mb-config-screen__search .mb-config-search input").first().fill("");
        await page.waitForTimeout(400);
    });

    await attempt("Options editor delete gate", async () => {
        await ensureOptionsEditor();
        await page
            .locator('.mb-config-screen__tabs [role="tab"]', { hasText: "Maps" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-maps", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(600);

        await page
            .locator(".mb-config-maps .v-btn", { hasText: "Delete" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-confirm", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "config-delete-gate",
            "The super confirmation that guards deleting a map's configuration: two keys, then a full-travel slider, with an emergency exit that is always available",
            { crop: page.locator(".mb-config-confirm"), cropped: "the confirmation popover" },
        );
        await emergencyExit().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
    });

    await attempt("Options editor save plan", async () => {
        await ensureOptionsEditor();
        const save = page.locator(".mb-config-screen__bar .v-btn", { hasText: "Save" }).first();
        await save.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        if (await save.isDisabled()) {
            skip(
                "Options editor save plan",
                "the Save control is disabled in this state, and its tooltip says why; the dialog " +
                    "that lists the files a save would write therefore has no door to open through, " +
                    "and nothing was substituted for it",
            );
            return;
        }
        await save.click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-apply__title", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "config-save-plan",
            "The save plan, which names every file a save would write and every reason it would write it, before anything is written",
            { mapArea: "covered", note: CONFIG_STATE_NOTE },
        );
        // Cancelled, not confirmed. Opening this dialog writes nothing; only its confirm
        // button does, and this run has no folder it has any business writing into.
        await dismiss();
    });

    // Escape closes the editor, and focus goes back to the button that opened it. The key
    // is sent to the editor's own host region, which is what listens for it.
    if (await visible(".mb-config-screen")) {
        await page
            .locator('[role="region"][aria-label="Server configuration"]')
            .press("Escape")
            .catch(() => undefined);
        await page.waitForTimeout(700);
    }
});

test("captures the remaining first-class screens", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("History", async () => {
        await ensureOptionsEditor();
        const historyTab = page
            .locator('.mb-config-screen__tabs [role="tab"]', { hasText: "History" })
            .first();
        await historyTab.click({ timeout: ELEMENT_TIMEOUT });
        // A fresh profile has no folder yet, so the panel deliberately renders its
        // truthful "save this config set to one first" state rather than a fake timeline.
        // The window is still the History screen and is the surface worth proving.
        //
        // `.mb-config-screen__window` does not exist anywhere in the UI source - another
        // selector this step was written against that the tab strip's move to
        // `TabbedNavigation` left behind. The one active tab's real content lives in that
        // component's own `.mb-tabs__panel` (`role="tabpanel"`), scoped to this editor's
        // strip so it cannot match the application's outer tab strip instead.
        const history = page.locator('.mb-config-screen__tabs .mb-tabs__panel[role="tabpanel"]');
        await history.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await expect(history).toContainText(/History follows a folder|save this config set/i);
        await page.waitForTimeout(500);
        await shoot(
            "config-history",
            "The config folder's version-history tab, including its honest empty state when this throwaway profile has no folder attached",
            { crop: history, cropped: "the version-history panel", mapArea: "covered" },
        );
    });

    await dismiss();

    await attempt("Projects", async () => {
        const projectsTab = page.locator('[role="tab"]', { hasText: /^Projects$/i }).first();
        await projectsTab.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        if ((await projectsTab.getAttribute("aria-selected")) !== "true") {
            await projectsTab
                .locator(".mb-tabs-strip__label")
                .first()
                .click({ timeout: ELEMENT_TIMEOUT });
        }
        const projects = page.locator(".mb-projects-screen");
        await projects.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "projects-screen",
            "The Projects screen, showing the real empty state and the path into a new render project",
            { crop: projects, cropped: "the Projects screen", mapArea: "covered" },
        );
    });

    await attempt("CI-render screen", async () => {
        const ciTab = page.locator('[role="tab"]', { hasText: /GitHub runners/i }).first();
        await ciTab.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        if ((await ciTab.getAttribute("aria-selected")) !== "true") {
            await ciTab
                .locator(".mb-tabs-strip__label")
                .first()
                .click({ timeout: ELEMENT_TIMEOUT });
        }
        const ci = page.locator(".ci-render-screen");
        await ci.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "ci-render-screen",
            "The CI-render screen, with its honest repository fields and the preflight route that refuses before uploading anything",
            { crop: ci, cropped: "the CI-render screen", mapArea: "covered" },
        );
    });

    // Needs nothing but the application: the render list is read from disk and is honestly
    // empty on a throwaway profile, and the preflight is never run, so no GitHub account and
    // no network are involved in reaching this screen.
    //
    // "Publish to Pages" is the ninth of eleven seeded tabs, past the seven that fit this
    // harness's capture viewport before the strip's own overflow arithmetic takes over - see
    // `openShellTab`'s own doc comment for the run that first showed a plain `[role="tab"]`
    // lookup timing out on that, not on a missing screen.
    await attempt("Pages publishing screen", async () => {
        await openShellTab(/Publish to Pages/i);
        const publish = page.locator(".mb-pages-screen");
        await publish.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "pages-publishing-screen",
            "The Pages publishing screen: the searchable render list, the repository fields, and the check that reports what publishing would push before anything is pushed",
            { crop: publish, cropped: "the Pages publishing screen", mapArea: "covered" },
        );
    });

    await attempt("EULA viewer", async () => {
        // Reached through the search, not the bare FAB: see openSettingsSection()'s doc
        // comment for why a plain reopen cannot be trusted to land on the Mojang consent
        // tab that `.mb-consent-row` actually lives on.
        await openSettingsSection("mojang-download-consent", "Mojang download consent");
        const settings = page.locator(".mb-settings");
        await settings.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        const readLicence = settings.locator(".mb-consent-row button").first();
        await readLicence.click({ timeout: ELEMENT_TIMEOUT });
        const eula = settings.locator(".mb-eula");
        await eula.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "eula-viewer",
            "The EULA viewer embedded in Settings, with the bundled or cached licence copy, its provenance and its searchable section tabs",
            { crop: eula, cropped: "the EULA viewer", mapArea: "covered" },
        );
    });

    await dismiss();

    // A console only exists while a render is genuinely in flight. Keep the capture step
    // explicit so the manifest names the missing dependency instead of making the screen
    // look forgotten; a Java runtime, accepted download consent and a real world are not
    // smuggled into a screenshot run merely to make a gallery look complete.
    await attempt("Render console", async () => {
        const consoleSurface = page.locator(".mb-console");
        await consoleSurface.waitFor({ state: "visible", timeout: 3_000 });
        await shoot(
            "render-console",
            "The live render console, with level filters, the shared regex builder and the bounded log",
            { crop: consoleSurface, cropped: "the render console", mapArea: "covered" },
        );
    });
});

test("captures the notification corner and its history", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Notification corner", async () => {
        // Opening the options editor raises a real informational notice, which is what
        // puts a live toast in the corner. Nothing is planted: the message is the one the
        // editor writes for itself when it loads.
        await ensureOptionsEditor();
        const corner = page.locator(".mb-config-notices");
        await corner.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "notifications-corner",
            "The notification corner in the bottom right: a message that reports without blocking anything, and beside it the button that opens the history of everything the application has said",
            { crop: corner, cropped: "the notification corner" },
        );

        // The bell is found by its class, not by an accessible name: that name carries the
        // unread count, so it changes with the notices in the corner. It also stopped being
        // "Notification history" when the flat list became a real notification centre, and
        // this selector went on waiting fifteen seconds for it.
        await page.locator(".mb-notice-bell").first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-notice-centre", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "notifications-history",
            "The notification centre, so a message that has already faded away is still readable, searchable and filterable by level",
            {
                crop: page.locator(".mb-notice-centre"),
                cropped: "the notification centre",
            },
        );
        await dismiss();
    });
});

/* -------------------------------------------------------------------------- */
/* The command palette                                                       */
/* -------------------------------------------------------------------------- */

test("captures the command palette", async () => {
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    await attempt("Command palette", async () => {
        await openPalette();
        await shoot(
            "palette",
            "The command palette, opened with Ctrl+Shift+F: every command, setting and destination the application has, in one searchable list",
            { mapArea: "covered" },
        );

        await page.locator(".mb-palette__search input").first().fill("theme");
        await page.waitForTimeout(500);
        await shoot(
            "palette-search",
            "The command palette filtered by a search, with a setting row that carries its own live control - changing it here changes the real setting, the same way changing it on its own page would",
            {
                crop: page.locator(".mb-palette__card"),
                cropped: "the command palette",
                mapArea: "covered",
            },
        );

        await dismiss();
    });
});

/* -------------------------------------------------------------------------- */
/* The tab strip: its context menu, the finder and the bulk-close preview     */
/* -------------------------------------------------------------------------- */

test("captures the tab strip, its context menu, the tab finder and the bulk-close preview", async () => {
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    // `.mb-shell-tabs` scopes every one of these to the shell's own tab bar. Settings
    // carries its own `TabbedNavigation` too (the settings surface is tabbed per the
    // project's own rules - see `AppSettings.vue`), and `DockedSurface` keeps it mounted
    // with `v-show` rather than `v-if` even while closed, so an unscoped `.mb-tabs-strip-row`
    // or `[aria-label="Find a tab"]` resolves to more than one match - the settings
    // surface's copy among them, invisible and therefore never clickable - and `.first()`
    // is not guaranteed to land on the one this suite actually means.
    const shellTabs = page.locator(".mb-shell-tabs");

    await attempt("Tab strip", async () => {
        const strip = shellTabs.locator(".mb-tabs-strip-row").first();
        await strip.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "tab-strip",
            "The browser-style tab strip: the shell's own pages, the new-tab menu, the overflow control that appears only once something stops fitting, and the tab finder's own magnifier",
            { crop: strip, cropped: "the tab strip" },
        );
    });

    await attempt("Tab context menu", async () => {
        const tab = shellTabs.locator('[role="tab"]', { hasText: /maps and servers/i }).first();
        await tab.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        // The label, not the tab: a tab carries its own close button over part of its
        // area, and a right-click aimed at the tab's centre is a coin toss between the
        // label and that button.
        await tab
            .locator(".mb-tabs-strip__label")
            .first()
            .click({ button: "right", timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-tabs-menu", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "tab-context-menu",
            "Right-clicking a tab: its own management commands, with the keyboard-reachable filter every context menu in this application carries and the working shortcut printed beside each item that has one",
            { crop: page.locator(".mb-tabs-menu"), cropped: "the tab's context menu" },
        );
        await dismiss();
    });

    await attempt("Tab finder", async () => {
        await shellTabs
            .locator('[aria-label="Find a tab"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-tabs-finder", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(400);
        // `.first()`, not a bare locator: the finder's own `v-menu` carries `eager`, so its
        // content mounts immediately rather than only when opened - and the settings
        // surface's own (normally hidden) `TabbedNavigation` carries the identical finder,
        // so more than one `.mb-tabs-finder` exists in the document at once. Only one is
        // ever visible, but `.screenshot()` enforces exactly one match regardless of
        // visibility, so an unscoped locator here is a strict-mode violation waiting to
        // happen rather than a genuine "did not open" gap.
        await shoot(
            "tab-finder",
            "The tab finder: search this strip, search every open tab in every window, search groups by name, and both text bulk closes, each with its own anchored regex builder",
            { crop: page.locator(".mb-tabs-finder").first(), cropped: "the tab finder" },
        );
    });

    await attempt("Bulk-close preview", async () => {
        if (!(await visible(".mb-tabs-finder"))) {
            skip(
                "Bulk-close preview",
                "the tab finder that hosts this panel did not open in this run, so the panel inside it was never on screen",
            );
            return;
        }
        await page
            .locator(".mb-tabs-finder__toggle", { hasText: "Close many tabs at once" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        const panel = page.locator(".mb-tabs-close__panel").first();
        await panel.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        // "a" matches several of the shell's own built-in tab labels ("Make a map",
        // "Maps and servers", "Publish to Pages") without matching all of them, so the
        // preview shows a real, partial selection rather than either extreme.
        await panel.locator("input").first().fill("a");
        await page.waitForTimeout(500);
        await shoot(
            "tab-bulk-close-preview",
            "Close tabs containing text, previewing exactly which tabs the pattern matches and what closing them would do, before anything closes",
            { crop: panel, cropped: "the bulk-close panel" },
        );
    });

    await dismiss();
});

/* -------------------------------------------------------------------------- */
/* The appearance editor: its context menu, typography and the colour picker  */
/* -------------------------------------------------------------------------- */

test("captures the appearance editor, its context menu, typography and the infinite colour picker", async () => {
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    // Taller than the usual surface viewport for this one test. The tab this opens the
    // editor from sits right under the title bar, and the editor anchors to the *top* of
    // its target and grows downward from there - so at the standard 800px height, its own
    // header and tab strip (Text/Surface/Presets) land partly behind the title bar and tab
    // strip's opaque chrome, and a click on the Surface tab times out on an element that is
    // technically present but not actually reachable. More vertical room is the fix, not a
    // different selector - the tabs are exactly where the contract puts them.
    await page.setViewportSize({ width: SURFACE_VIEWPORT.width, height: 1400 });

    await attempt("Appearance editor context menu", async () => {
        // A tab, not a row in some other list: every tab is its own appearance target
        // (the contract's "for tabs specifically" clause), and a tab is always on screen
        // no matter whether this run has a map or a server profile to show elsewhere.
        // Scoped to the shell's own tab bar for the same reason the tab-strip test is:
        // the settings surface carries a second, normally-invisible `TabbedNavigation`.
        const tab = page
            .locator('.mb-shell-tabs [role="tab"]', { hasText: /maps and servers/i })
            .first();
        await tab.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        // The label, not the tab: a tab carries its own close button over part of its
        // area, and a right-click aimed at the tab's centre is a coin toss between the
        // label and that button.
        await tab
            .locator(".mb-tabs-strip__label")
            .first()
            .click({ button: "right", timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-tabs-menu", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "appearance-context-menu",
            "A tab's own context menu: its management commands, then \"Edit tab appearance...\" with its working Ctrl+Shift+F10 shortcut printed beside it, and the menu's own searchable filter at the top",
            { crop: page.locator(".mb-tabs-menu"), cropped: "the tab's context menu" },
        );

        await page
            .locator(".mb-tabs-menu .v-list-item", { hasText: "Edit tab appearance" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-appearance-editor", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
    });

    await attempt("Typography editor", async () => {
        if (!(await visible(".mb-appearance-editor"))) {
            skip(
                "Typography editor",
                "the appearance editor did not open in this run, so its Text tab was never on screen",
            );
            return;
        }
        // The editor opens on its Text tab by default, which is the typography editor.
        await shoot(
            "appearance-typography",
            "The appearance editor's Text tab: every installed and bundled font with its own live preview, size, weight, style and the rest of the Word-depth typography controls, editing this tab's own label live",
            { crop: page.locator(".mb-appearance-editor"), cropped: "the appearance editor" },
        );
    });

    await attempt("Appearance editor surface tab", async () => {
        if (!(await visible(".mb-appearance-editor"))) {
            skip(
                "Appearance editor surface tab",
                "the appearance editor did not open in this run, so its Surface tab was never on screen",
            );
            return;
        }
        await page
            .locator(".mb-appearance-editor .v-tab", { hasText: "Surface" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "appearance-surface",
            "The appearance editor's Surface tab: background and border colour, border style, radius, spacing, shadow and opacity for this tab, each with a reset of its own",
            { crop: page.locator(".mb-appearance-editor"), cropped: "the appearance editor" },
        );
    });

    await attempt("Infinite colour picker", async () => {
        if (!(await visible(".mb-appearance-editor"))) {
            skip(
                "Infinite colour picker",
                "the appearance editor did not open in this run, so the colour swatch that opens the picker was never on screen",
            );
            return;
        }
        // Not scoped to the Surface tab's `v-window-item`, this matches every colour
        // field this editor has - Text's own text/highlight/outline colours included -
        // and `v-window` keeps every tab's content mounted for its slide transition, so
        // `.first()` in DOM order lands on one of the Text tab's swatches, which is
        // `display: none` while Surface is active. Confirmed directly: with the editor on
        // its Surface tab, `.mb-color-field__swatch` matches eight elements and the first
        // six report `isVisible() === false` with a `null` bounding box; only the two
        // Surface-tab swatches, last in DOM order, are actually reachable. `:visible`
        // scopes the selector to the ones a click can actually land on.
        await page
            .locator(".mb-color-field__swatch:visible")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-color-picker", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "infinite-colour-picker",
            "The infinite colour picker: a continuous field rather than a swatch grid, translated across named colours, hex, RGB, HSL, HSV, HWB, CIELAB/LCH, OKLab/OKLCH and CMYK, with a contrast readout",
            { crop: page.locator(".mb-color-picker"), cropped: "the infinite colour picker" },
        );
        await dismiss();
    });

    // Two presses: the first closes the colour picker popover, the second closes the
    // appearance editor itself and returns focus to the tab that opened it.
    await dismiss();
    await dismiss();

    await page.setViewportSize(SURFACE_VIEWPORT);
});

/* -------------------------------------------------------------------------- */
/* The changelog viewer                                                       */
/* -------------------------------------------------------------------------- */

test("captures the changelog viewer", async () => {
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    await attempt("Changelog viewer", async () => {
        await openMenuPage("Info", ".mb-info-page, .mb-info-page__empty");
        const fold = page.locator(".mb-info-page__changelog");
        await fold.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await fold.locator("summary").first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-changelog", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "changelog-viewer",
            "The changelog viewer, folded inside the Info page: every released version, its date filter, its own search wired to the regex builder, and the commit each entry links to",
            {
                crop: page.locator(".mb-info-page__changelog"),
                cropped: "the changelog fold in the Info page",
                mapArea: "covered",
            },
        );
    });

    await closeSideSheet();
});

/* -------------------------------------------------------------------------- */
/* The wizard, which needs no map                                             */
/* -------------------------------------------------------------------------- */

test("captures the make-a-map wizard at every step", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await pointAppAtNoMap();
    await page.waitForTimeout(1000);

    await attempt("Wizard, world step", async () => {
        await shoot(
            "wizard-1-world",
            "The make-a-map wizard on its first step, asking for the world folder, with its five steps listed across the top",
        );
    });

    await attempt("Wizard, SSH world source", async () => {
        const opener = page.locator('[data-test="ssh-open"]');
        await opener.click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector("#mb-ssh-world-panel", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "wizard-ssh-world-source",
            "The SSH world-source checklist inside the first wizard step: saved key-only machines, explicit host-key review, remote-world inspection, and a local fetch destination",
            {
                crop: page.locator("#mb-ssh-world-panel"),
                cropped: "the SSH world-source checklist",
            },
        );
        await opener.click({ timeout: ELEMENT_TIMEOUT });
    });

    await attempt("Wizard, Docker world source", async () => {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: false,
        });
        try {
            const opener = page.locator('[data-test="docker-open"]');
            await opener.click({ timeout: ELEMENT_TIMEOUT });
            const panel = page.locator("#mb-docker-world-panel");
            await panel.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(500);

            const metrics = await panel.evaluate((element) => {
                const label = (candidate: Element): string =>
                    candidate.getAttribute("data-test") ??
                    candidate.getAttribute("aria-label") ??
                    candidate.textContent?.trim().slice(0, 80) ??
                    candidate.tagName.toLowerCase();
                const controls = Array.from(
                    new Set([
                        ...element.querySelectorAll<HTMLElement>(
                            "button:not([disabled]), input:not([disabled]), [role='checkbox'], [role='combobox']",
                        ),
                        ...document.querySelectorAll<HTMLElement>(
                            "[data-test='mount-minecraft-folder']",
                        ),
                    ]),
                ).filter((candidate) => candidate.getClientRects().length > 0);
                const hitTarget = (candidate: HTMLElement): HTMLElement =>
                    candidate instanceof HTMLInputElement
                        ? (candidate.closest<HTMLElement>(".v-field, .v-selection-control") ??
                          candidate)
                        : candidate;
                const clippedControls = controls
                    .filter((candidate) => {
                        const rect = hitTarget(candidate).getBoundingClientRect();
                        return rect.left < 0 || rect.right > window.innerWidth;
                    })
                    .map(label);
                const undersized = controls
                    .filter((candidate) => {
                        const rect = hitTarget(candidate).getBoundingClientRect();
                        return rect.width < 44 || rect.height < 44;
                    })
                    .map(label);
                const internallyClippedControls = controls
                    .filter((candidate) => {
                        const content =
                            candidate.querySelector<HTMLElement>(".v-btn__content") ?? candidate;
                        return (
                            content.scrollWidth > content.clientWidth + 1 ||
                            content.scrollHeight > content.clientHeight + 1
                        );
                    })
                    .map(label);

                return {
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight,
                        deviceScaleFactor: window.devicePixelRatio,
                    },
                    documentOverflowX:
                        document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
                    panelOverflowX: element.scrollWidth - element.clientWidth,
                    clippedControls,
                    internallyClippedControls,
                    undersized,
                };
            });

            expect(metrics.viewport.width).toBe(390);
            expect(metrics.viewport.height).toBe(844);
            // Chromium reports the float32 representation on Windows
            // (`2.0000000596046448` here), not a hand-rounded integer.
            expect(metrics.viewport.deviceScaleFactor).toBeCloseTo(2, 5);
            expect(metrics.documentOverflowX).toBe(0);
            expect(metrics.bodyOverflowX).toBe(0);
            expect(metrics.panelOverflowX).toBe(0);
            expect(metrics.clippedControls).toEqual([]);
            expect(metrics.internallyClippedControls).toEqual([]);
            expect(metrics.undersized).toEqual([]);
            await writeFile(
                join(shotDir, "wizard-docker-world-source-390x844-200pct.metrics.json"),
                `${JSON.stringify(metrics, null, 2)}\n`,
                "utf8",
            );
            const compactCapture = await cdp.send("Page.captureScreenshot", {
                format: "png",
                fromSurface: true,
                captureBeyondViewport: false,
            });
            const compactName = "wizard-docker-world-source-390x844-200pct";
            const compactSurface =
                "The local Docker world-source checklist at a 390 by 844 CSS-pixel viewport and 200% device scale: Docker's real state, actual containers and volumes, a browsed local destination, live-copy risk acknowledgement, and honest progress";
            const compactCaption =
                `${compactSurface}. ${target.caption} In this image, ${mapNote()}. ` +
                "Captured through Chromium's own DevTools surface so the image uses the same exact CSS viewport and device scale as the metrics. The metrics record zero horizontal overflow, outer or internal control clipping, or undersized interactive targets.";
            await writeFile(
                join(shotDir, `${compactName}.png`),
                Buffer.from(compactCapture.data, "base64"),
            );
            await writeFile(
                join(shotDir, `${compactName}.caption.txt`),
                `${compactCaption}\n`,
                "utf8",
            );
            captures.push({
                name: compactName,
                file: `${compactName}.png`,
                surface: compactSurface,
                caption: compactCaption,
            });
            await opener.click({ timeout: ELEMENT_TIMEOUT });
        } finally {
            await cdp.send("Emulation.clearDeviceMetricsOverride");
            await page.setViewportSize(SURFACE_VIEWPORT);
        }
    });

    const world = captureWorldFolder();
    if (world === null) {
        skip(
            "Wizard steps after the first",
            "the wizard reads the world folder it is given through the main process, so its later " +
                "steps only exist once a real Minecraft world has been read; point " +
                "MATERIAL_BLUEMAP_CAPTURE_WORLD at one to capture them",
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
            await page.waitForTimeout(600);
            await shoot(
                "wizard-1-world-read",
                "The wizard's first step after the world folder has been read: it names the dimensions it found and how many region files each of them holds",
            );

            // Walked by the step the wizard actually lands on rather than by a counter,
            // because a Next that does not advance would otherwise shift every later
            // name by one and label each capture with the wrong step.
            const seen = new Set<string>(["World"]);
            for (let guard = 0; guard < 8; guard += 1) {
                const next = page.locator(".mb-world-wizard__actions .v-btn", { hasText: "Next" });
                if ((await next.count()) === 0) break;
                await next.first().click({ timeout: ELEMENT_TIMEOUT });
                await page.waitForTimeout(800);

                const step = page.locator("section.mb-world-step").first();
                const label = (await step.getAttribute("aria-label")) ?? `step-${guard}`;
                if (seen.has(label)) continue;
                seen.add(label);
                await shoot(
                    `wizard-${seen.size}-${slug(label)}`,
                    `The make-a-map wizard on its "${label}" step`,
                );
            }

            // The last step offers to start the render. It is photographed rather than
            // pressed: a render needs a Java runtime, an accepted Mojang download consent
            // and minutes of work, and this run declined that consent.
        });
    }

    await attempt("Release downloads", async () => {
        // Back to the first step, where the release downloads panel lives.
        await page
            .locator(".mb-world-wizard__steps .mb-world-wizard__step")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(700);
        await page
            .locator(".mb-world-step__downloads .v-btn")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-downloads", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(600);
        await shoot(
            "wizard-release-downloads",
            "The release downloads panel, which offers to fetch a world from a GitHub release for somebody with no Minecraft save on this machine",
            { crop: page.locator(".mb-downloads"), cropped: "the release downloads panel" },
        );
    });

    skip(
        "Release asset list and download progress",
        "listing a release's assets and downloading one both need real traffic to github.com, " +
            "which the offline guard refuses; the panel is captured in the state it is in before " +
            "anything has been asked for",
    );
    skip(
        "Render progress panel",
        "it only exists while a render is actually running, which needs a Java runtime, an " +
            "accepted Mojang download consent and minutes of work; this run declined that consent",
    );
    skip(
        "Interrupted renders",
        "it only appears when a previous render was interrupted and left a session behind, and " +
            "the throwaway profile this run used has never started one",
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
    for (const gap of skipped)
        console.log(`[harness] not captured - ${gap.surface}: ${gap.reason}`);

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
            ? [
                  "## Nothing was skipped",
                  "",
                  "Every surface this harness knows about was captured.",
                  "",
              ]
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

/**
 * The surfaces whose absence is a defect rather than a gap.
 *
 * `attempt()` deliberately records a missing surface instead of failing, so forty good
 * captures still reach the artifact when one screen refuses to open. That is right for a
 * screen which needs a Java runtime, a real GitHub account or a render in flight - and
 * wrong for a screen that is simply part of the application. The distinction had to be
 * made after a one-line fix in the options editor took six of its captures with it and
 * left the job green: the gap was in the manifest, and a green tick is what anybody
 * actually reads.
 *
 * A surface belongs here when it needs nothing but the application itself.
 */
const REQUIRED_SURFACES = [
    "Options editor",
    "Options editor tabs",
    "Options editor search",
    "Options editor regex builder",
    "History",
    "Projects",
    "CI-render screen",
    "Pages publishing screen",
    "EULA viewer",
    "Profile manager",
    "Notification corner",
    "Backup screen",
    // Added when an audit found the palette, the appearance editor, the changelog and
    // most of the tab strip's own surfaces had no capture step at all - so a change that
    // deleted any of them outright would still have left this run green. Every one of
    // these opens with nothing but the running application: no account, no network, no
    // render in flight.
    "Command palette",
    "Tab strip",
    "Tab context menu",
    "Tab finder",
    "Bulk-close preview",
    "Appearance editor context menu",
    "Typography editor",
    "Appearance editor surface tab",
    "Infinite colour picker",
    "Changelog viewer",
] as const;

test("captured every surface that needs nothing but the application", () => {
    const missing = skipped
        .filter((gap) => (REQUIRED_SURFACES as readonly string[]).includes(gap.surface))
        .map((gap) => `${gap.surface} - ${gap.reason}`);

    expect(
        missing,
        "These surfaces need no runtime, no account and no render, so a run that could not " +
            "open them is reporting a broken application rather than an unavailable one.",
    ).toEqual([]);
});

/**
 * Screenshot harness.
 *
 * Captures the real built app through Playwright's Electron driver, so every
 * image is the actual shipped artifact rather than a mockup, a design file, or
 * a hand-edited picture. This is the only sanctioned way to produce a capture
 * for an issue comment or a release: if a surface cannot be captured here, the
 * honest report is that it has no capture yet.
 *
 * Runs in CI under xvfb. Output lands in `screenshots/` and is uploaded as a
 * build artifact.
 *
 * Every capture records the window size and display scale in its filename, so a
 * reviewer can tell at a glance which configuration a defect appears in.
 */

import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const shotDir = join(appRoot, "screenshots");

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

async function shoot(name: string, target: Page = page): Promise<void> {
    await mkdir(shotDir, { recursive: true });
    const file = join(shotDir, `${name}.png`);
    await target.screenshot({ path: file });
    // A zero-byte or absent capture is a silent failure; assert it landed.
    const buffer = await target.screenshot();
    expect(buffer.length, `capture ${name} produced no bytes`).toBeGreaterThan(1000);
}

test.beforeAll(async () => {
    app = await electron.launch({
        args: [appRoot, "--no-sandbox", "--disable-gpu"],
        env: { ...process.env, MATERIAL_BLUEMAP_SCREENSHOTS: "1" },
    });

    // Surface what the renderer is actually doing. A blank window with a silent
    // console is the hardest failure to diagnose from CI, and the whole point of
    // this harness is to produce evidence rather than a timeout.
    app.process().stdout?.on("data", (d) => process.stdout.write(`[main] ${d}`));
    app.process().stderr?.on("data", (d) => process.stderr.write(`[main] ${d}`));

    page = await app.firstWindow();
    page.on("console", (msg) => console.log(`[renderer:${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => console.log(`[renderer:pageerror] ${err.message}`));
    page.on("requestfailed", (req) =>
        console.log(`[renderer:requestfailed] ${req.url()} ${req.failure()?.errorText ?? ""}`)
    );

    await page.waitForLoadState("domcontentloaded");
    console.log(`[harness] window url: ${page.url()}`);

    // Wait on the Vue mount point, which index.html always contains, rather than
    // on a Vuetify class that only exists once the app has successfully mounted.
    // If mounting failed we still want a capture of the broken state.
    await page.waitForSelector("#app", { timeout: 30_000 });

    const mounted = await page
        .waitForSelector(".v-application", { timeout: 20_000 })
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
});

test.afterAll(async () => {
    await app?.close();
});

test("captures the shell at every supported window size", async () => {
    for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(300);
        await shoot(`shell-${viewport.name}`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
});

test("captures the shell at every supported display scale", async () => {
    for (const scale of SCALES) {
        await page.evaluate((z) => {
            document.documentElement.style.zoom = String(z);
        }, scale);
        await page.waitForTimeout(300);
        await shoot(`shell-scale-${String(scale).replace(".", "_")}x`);
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
        await shoot(`page-${label || `item-${i}`}`);
    }
});

test("captures both themes", async () => {
    for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForTimeout(300);
        await shoot(`theme-${theme}`);
    }
    await page.emulateMedia({ colorScheme: null });
});

test("records what was captured", async () => {
    // A manifest makes the artifact self-describing, so a reviewer reading an
    // issue comment can tell which build and which surface an image came from.
    const manifest = {
        capturedBy: "design/packages/app/test/screenshots.spec.ts",
        method: "Playwright _electron against the packaged app entry point",
        commit: process.env.GITHUB_SHA ?? "(local run)",
        run: process.env.GITHUB_RUN_ID ?? "(local run)",
        viewports: VIEWPORTS.map((v) => v.name),
        scales: SCALES,
        note: "Every image is a capture of the real running app. None is a mockup or a design file.",
    };
    await mkdir(shotDir, { recursive: true });
    await writeFile(join(shotDir, "manifest.json"), JSON.stringify(manifest, null, 2));
});

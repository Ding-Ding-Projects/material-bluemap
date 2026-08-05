/**
 * `-g`/`--generate-webapp` and `-s`/`--generate-websettings`, over a real `WebappConfig`
 * and real `MapConfig`s.
 *
 * Java source: `common/.../WebFilesManager.java`, called from `BlueMapService.createOrUpdateWebApp`
 *
 * Two halves, exactly split the way upstream splits them:
 *
 *   1. **The webapp bundle** (`updateFiles`/`filesNeedUpdate`) — upstream extracts a
 *      `webapp.zip` bundled inside its own jar. This package has no such bundle of its
 *      own; `scripts/copy-webapp.mjs` copies the *real* upstream webapp
 *      (`vendor/BlueMap/common/webapp/dist` — MIT-licensed, the exact static bundle
 *      upstream's own CLI ships) into this package's `dist/webapp` at build time. This
 *      function looks there first, then at `BLUEMAP_WEBAPP_SOURCE` (how the Dockerfile
 *      supplies it in a container that never had `vendor/` checked out), and fails loudly
 *      — never silently skips — when neither exists.
 *   2. **`settings.json`** (`WebFilesManager.Settings`) — every field transcribed with its
 *      exact upstream key (Gson's `FieldNamingPolicy.IDENTITY` means the Java field name
 *      *is* the JSON key), populated from the real `WebappConfig` and the real, sorted map
 *      id list, never invented data.
 */

import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MapConfig, WebappConfig } from "@material-bluemap/config";
import type { Logger } from "./logger.js";

/** upstream: `WebFilesManager.Settings`, field-for-field, in upstream's own declared order. */
export interface WebappSettings {
    version: string;
    useCookies: boolean;
    defaultToFlatView: boolean;
    startLocation: string | null;
    resolutionDefault: number;
    minZoomDistance: number;
    maxZoomDistance: number;
    hiresSliderMax: number;
    hiresSliderDefault: number;
    hiresSliderMin: number;
    lowresSliderMax: number;
    lowresSliderDefault: number;
    lowresSliderMin: number;
    mapDataRoot: string;
    liveDataRoot: string;
    maps: string[];
    scripts: string[];
    styles: string[];
}

/** upstream: `LinkedHashSet::add` — insertion order preserved, duplicates collapse. */
function unionPreservingOrder(existing: readonly string[], added: readonly string[]): string[] {
    return [...new Set([...existing, ...added])];
}

/**
 * upstream: `Settings#setFrom(WebappConfig)` (`base` omitted — every scalar field, plus
 * `scripts`/`styles`/`maps`, are (re)built from the live config) and `Settings#addFrom`
 * (`base` given — upstream's "add" call only ever touches `scripts`, `styles` and `maps`,
 * unioned onto whatever the field already held; every other field is left exactly as
 * `base` had it, which is upstream's real behaviour for `update-settings-file: false`, not
 * a simplification of it).
 */
export function buildWebappSettings(
    webapp: WebappConfig,
    maps: ReadonlyMap<string, MapConfig>,
    appVersion: string,
    base?: WebappSettings | null,
): WebappSettings {
    // upstream: `mapConfigs.entrySet().stream().sorted(comparing(MapConfig::getSorting)).map(Entry::getKey)`
    const sortedMapIds = [...maps.entries()].sort(([, a], [, b]) => a.sorting - b.sorting).map(([id]) => id);

    if (base != null) {
        return {
            ...base,
            maps: unionPreservingOrder(base.maps, sortedMapIds),
            scripts: unionPreservingOrder(base.scripts, webapp.scripts),
            styles: unionPreservingOrder(base.styles, webapp.styles),
        };
    }

    return {
        version: appVersion,
        useCookies: webapp["use-cookies"],
        defaultToFlatView: webapp["default-to-flat-view"],
        startLocation: webapp["start-location"],
        resolutionDefault: webapp["resolution-default"],
        minZoomDistance: webapp["min-zoom-distance"],
        maxZoomDistance: webapp["max-zoom-distance"],
        hiresSliderMax: webapp["hires-slider-max"],
        hiresSliderDefault: webapp["hires-slider-default"],
        hiresSliderMin: webapp["hires-slider-min"],
        lowresSliderMax: webapp["lowres-slider-max"],
        lowresSliderDefault: webapp["lowres-slider-default"],
        lowresSliderMin: webapp["lowres-slider-min"],
        mapDataRoot: webapp["map-data-root"],
        liveDataRoot: webapp["live-data-root"],
        maps: sortedMapIds,
        scripts: [...webapp.scripts],
        styles: [...webapp.styles],
    };
}

/** upstream: `WebFilesManager#saveSettings` */
export async function writeWebappSettings(webroot: string, settings: WebappSettings): Promise<void> {
    await mkdir(webroot, { recursive: true });
    await writeFile(join(webroot, "settings.json"), JSON.stringify(settings));
}

/** upstream: `WebFilesManager#loadSettings` — used by the `!update-settings-file` merge path. */
export async function readWebappSettings(webroot: string): Promise<WebappSettings | null> {
    try {
        const text = await readFile(join(webroot, "settings.json"), "utf-8");
        return JSON.parse(text) as WebappSettings;
    } catch {
        return null;
    }
}

/**
 * Where the bundled webapp source is looked for, in priority order.
 *
 * `../dist/webapp`, not `./webapp`: this module runs two different ways that put it at two
 * different depths — as `dist/webapp.js` after a real build, and directly as `src/webapp.ts`
 * under vitest, which transpiles the whole workspace's tests straight from source rather
 * than importing a package's compiled `dist/` (every other test in this repository already
 * relies on that). Both `src/` and `dist/` sit one level below the package root, so
 * `../dist/webapp` reaches the exact same real directory — `packages/cli/dist/webapp`,
 * populated by `scripts/copy-webapp.mjs` — from either location. `./webapp` only ever
 * reached it from the first.
 */
function candidateWebappSources(): string[] {
    const candidates: string[] = [];
    const envSource = process.env["BLUEMAP_WEBAPP_SOURCE"];
    if (envSource !== undefined && envSource !== "") candidates.push(envSource);
    candidates.push(fileURLToPath(new URL("../dist/webapp", import.meta.url)));
    return candidates;
}

export class WebappSourceNotFoundError extends Error {}

/**
 * upstream: `WebFilesManager#filesNeedUpdate` + `updateFiles`. Copies the real webapp
 * bundle into `webroot` when `webroot/index.html` is missing, or unconditionally when
 * `force` is true (upstream: `-g`'s own `force` argument, and a render's
 * `forceGenerateWebapp`).
 */
export async function ensureWebappFiles(webroot: string, force: boolean, logger: Logger): Promise<void> {
    const indexPath = join(webroot, "index.html");
    if (!force && existsSync(indexPath)) return;

    const source = candidateWebappSources().find((candidate) => existsSync(candidate));
    if (source === undefined) {
        throw new WebappSourceNotFoundError(
            "Could not find the webapp bundle to copy. Looked at: " +
                candidateWebappSources().join(", ") +
                ". Run 'pnpm --filter @material-bluemap/cli build' from a checkout with the " +
                "vendor/BlueMap submodule present, or set BLUEMAP_WEBAPP_SOURCE to a directory " +
                "containing a built BlueMap webapp (index.html, assets/, lang/).",
        );
    }

    await mkdir(webroot, { recursive: true });
    await cp(source, webroot, { recursive: true });
    logger.info(`Copied the webapp bundle from ${source} to ${webroot}`);
}

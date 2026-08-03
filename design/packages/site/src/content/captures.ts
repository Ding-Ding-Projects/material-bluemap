/**
 * The captures that are committed to this repository, under `docs/screenshots/`.
 *
 * These are not the same images as the gallery on the Screenshots page. That page shows
 * whatever `scripts/fetch-screenshots.mjs` downloaded from a workflow run at build time,
 * and a fresh clone has none of it, which is why the landing page could not show a single
 * picture: the one set of images guaranteed to exist was the one nothing was reading.
 *
 * So this module reads that set. The files are tracked in git, they travel with every
 * clone, and they are pulled into the bundle by `import.meta.glob` as ordinary hashed
 * assets, exactly as the dim sum photographs are. Nothing is fetched at runtime and no
 * image comes from a third party.
 *
 * Two rules make it safe to point a landing page at them:
 *
 *   1. A record whose file did not resolve is dropped, not rendered. A broken image on a
 *      landing page reads as a broken project.
 *   2. Nothing here describes what is inside a picture beyond what the capture's own
 *      provenance supports. The configuration is recorded by the harness that took it;
 *      the alt text names the surface and that configuration and stops there.
 */

import type { HomeLink } from "./types.js";
import { repoFile } from "./links.js";

const CAPTURE_DIRECTORY = "docs/screenshots";

const imageModules = import.meta.glob("../../../../../docs/screenshots/*.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

const manifestModules = import.meta.glob("../../../../../docs/screenshots/manifest.json", {
    eager: true,
    import: "default",
}) as Record<string, unknown>;

/**
 * One committed capture.
 *
 * Deliberately not `ScreenshotCapture`: that type carries pixel dimensions and a byte size,
 * which the fetch script reads out of the PNG header at build time. Nothing here reads a
 * PNG header, so nothing here may claim those numbers.
 */
export interface RepoCapture {
    readonly file: string;
    /** Bundled asset URL, resolved by the bundler. Never a hand-written path. */
    readonly url: string;
    readonly title: string;
    /** The window size, display scale or colour scheme this was taken at. */
    readonly configuration: string;
    readonly alt: string;
    /**
     * The window's aspect ratio as a CSS value, so the layout reserves the right box
     * before a lazily loaded image arrives. It is the shape of the window the harness
     * drove, which the file name records; it is not a claim about the pixel dimensions.
     */
    readonly aspectRatio: string;
}

/** What the harness recorded about how the whole set was produced. */
export interface CaptureProvenance {
    readonly capturedBy: string;
    readonly method: string;
    readonly commit: string;
    readonly run: string;
    readonly directory: HomeLink;
}

interface CaptureRecord {
    readonly file: string;
    readonly title: string;
    readonly configuration: string;
    readonly alt: string;
    readonly aspectRatio: string;
    /** True for the captures the landing page shows. The rest stay in the full set. */
    readonly featured: boolean;
}

/**
 * The captures, in the order a reader should meet them.
 *
 * The installed application comes first because it is the only one that shows the whole
 * interface at once, and because "somebody installed this and it opened" is the single
 * most useful thing a landing page can prove.
 */
const RECORDS: readonly CaptureRecord[] = [
    {
        file: "installed-app-1920x1200.png",
        aspectRatio: "8 / 5",
        title: "The installed application",
        configuration: "installed from the Windows installer, 1920 by 1200",
        alt: "The material-bluemap desktop application running after a Windows install, showing a three-dimensional Minecraft map with the ported interface over it: the menu, maps, markers and players controls at the top left, the view-mode and day-night controls with live x and z position inputs and a compass at the top right, zoom controls at the bottom right, and shape, extrude, line and point markers drawn on the map.",
        featured: true,
    },
    {
        file: "theme-dark.png",
        aspectRatio: "8 / 5",
        title: "Dark colour scheme",
        configuration: "1280 by 800, dark colour scheme",
        alt: "The material-bluemap application window rendered with the dark colour scheme, at 1280 by 800 pixels.",
        featured: false,
    },
    {
        file: "theme-light.png",
        aspectRatio: "8 / 5",
        title: "Light colour scheme",
        configuration: "1280 by 800, light colour scheme",
        alt: "The material-bluemap application window rendered with the light colour scheme, at 1280 by 800 pixels.",
        featured: false,
    },
    {
        file: "shell-800x600-narrow.png",
        aspectRatio: "4 / 3",
        title: "The narrowest supported window",
        configuration: "800 by 600, 100% display scale",
        alt: "The material-bluemap application window at 800 by 600 pixels, the narrowest window size the interface is checked against.",
        featured: true,
    },
    {
        file: "shell-scale-2x.png",
        aspectRatio: "8 / 5",
        title: "200 percent display scale",
        configuration: "1280 by 800, 200% display scale",
        alt: "The material-bluemap application window at 200 percent display scale, where element sizing defects appear first.",
        featured: true,
    },
    {
        file: "shell-1920x1080.png",
        aspectRatio: "16 / 9",
        title: "A full-size window",
        configuration: "1920 by 1080, 100% display scale",
        alt: "The material-bluemap application window at 1920 by 1080 pixels.",
        featured: true,
    },
    {
        file: "shell-1280x800.png",
        aspectRatio: "8 / 5",
        title: "The harness default window",
        configuration: "1280 by 800, 100% display scale",
        alt: "The material-bluemap application window at 1280 by 800 pixels, the size the capture harness resets to.",
        featured: false,
    },
    {
        file: "shell-1024x768.png",
        aspectRatio: "4 / 3",
        title: "A small window",
        configuration: "1024 by 768, 100% display scale",
        alt: "The material-bluemap application window at 1024 by 768 pixels.",
        featured: false,
    },
    {
        file: "shell-scale-1x.png",
        aspectRatio: "8 / 5",
        title: "100 percent display scale",
        configuration: "1280 by 800, 100% display scale",
        alt: "The material-bluemap application window at 100 percent display scale.",
        featured: false,
    },
    {
        file: "shell-scale-1_25x.png",
        aspectRatio: "8 / 5",
        title: "125 percent display scale",
        configuration: "1280 by 800, 125% display scale",
        alt: "The material-bluemap application window at 125 percent display scale.",
        featured: false,
    },
    {
        file: "shell-scale-1_5x.png",
        aspectRatio: "8 / 5",
        title: "150 percent display scale",
        configuration: "1280 by 800, 150% display scale",
        alt: "The material-bluemap application window at 150 percent display scale.",
        featured: false,
    },
];

function imageUrl(file: string): string | null {
    for (const [path, url] of Object.entries(imageModules)) {
        if (path.endsWith(`/${file}`)) return url;
    }
    return null;
}

function toCapture(record: CaptureRecord): RepoCapture | null {
    const url = imageUrl(record.file);
    if (url === null) return null;
    return {
        file: record.file,
        url,
        title: record.title,
        configuration: record.configuration,
        alt: record.alt,
        aspectRatio: record.aspectRatio,
    };
}

/** Every committed capture whose image actually resolved, in reading order. */
export const repoCaptures: readonly RepoCapture[] = RECORDS.map(toCapture).filter(
    (capture): capture is RepoCapture => capture !== null
);

/** The subset the landing page shows. The lead capture is the first of them. */
export const featuredCaptures: readonly RepoCapture[] = RECORDS.filter((record) => record.featured)
    .map(toCapture)
    .filter((capture): capture is RepoCapture => capture !== null);

function manifestString(key: string, fallback: string): string {
    const manifest = Object.values(manifestModules)[0];
    if (typeof manifest !== "object" || manifest === null) return fallback;
    const value = (manifest as Record<string, unknown>)[key];
    return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * How the set was produced.
 *
 * Every field falls back to a stated value rather than to an empty string, so a manifest
 * that loses a key produces a caption that is still true rather than one with a hole in it.
 */
export const captureProvenance: CaptureProvenance = {
    capturedBy: manifestString("capturedBy", "design/packages/app/test/screenshots.spec.ts"),
    method: manifestString("method", "Playwright driving the real Electron application"),
    commit: manifestString("commit", "not recorded in the manifest"),
    run: manifestString("run", "not recorded in the manifest"),
    directory: { label: CAPTURE_DIRECTORY, href: repoFile(CAPTURE_DIRECTORY) },
};

/**
 * The screenshots gallery page.
 *
 * Images come from the app's own Playwright harness, downloaded from a CI run at build
 * time by `scripts/fetch-screenshots.mjs`. When no artifact was available the page says
 * so and shows nothing. There are no placeholder images: a stand-in in a gallery of
 * real captures is indistinguishable from a real capture to anyone scrolling.
 */

import type { ScreenshotAvailability, ScreenshotCapture } from "./types.js";
import { screenshotAvailability } from "./generated/screenshots.js";
import { SITE_BASE_PATH, ACTIONS_URL } from "./links.js";

export { screenshotAvailability };
export type { ScreenshotAvailability, ScreenshotCapture };

export const screenshotsCopy = {
    title: "Screenshots",
    lead: "Every image here is a capture of the real running application, taken by the project's Playwright harness in continuous integration. None is a mockup, a design file or a hand-edited picture.",
    caveat: "The captures show the application shell. They do not show a rendered Minecraft world, because rendering a local world is not built yet. When a capture shows a broken or empty window, that is the state the build was in: the harness publishes what it found rather than hiding it.",
    unavailableHeading: "Captures are not available for this build",
    unavailableLead:
        "No screenshot artifact could be collected when this site was built, so there is nothing to show. The reason is below. Nothing has been substituted for the missing images.",
    unavailableLinkLabel: "Open the workflow run history",
    unavailableLinkHref: ACTIONS_URL,
    provenanceHeading: "Where these came from",
} as const;

/**
 * The URL for a capture, resolved against the site's base path.
 *
 * The site is served from a project subpath, so a root-relative URL has to carry that
 * prefix. `base` is a parameter rather than a constant so a differently mounted copy of
 * the site can pass its own.
 */
export function screenshotUrl(publicPath: string, file: string, base: string = SITE_BASE_PATH): string {
    const cleanBase = base.endsWith("/") ? base : `${base}/`;
    const cleanDir = publicPath.replace(/^\/+|\/+$/g, "");
    return `${cleanBase}${cleanDir}/${file}`;
}

/**
 * The caption under a capture: window size, display scale and colour scheme.
 *
 * When the harness did not record enough to say, the caption says that instead of
 * inventing a configuration.
 */
export function captureCaption(capture: ScreenshotCapture): string {
    if (!capture.configurationKnown) {
        return `${capture.title} · configuration not recorded by the harness`;
    }
    const scheme = capture.colourScheme === "system" ? "system colour scheme" : `${capture.colourScheme} colour scheme`;
    return `${capture.title} · ${capture.windowSize} · ${capture.displayScale} display scale · ${scheme}`;
}

/** Captures grouped by what they were proving, so the gallery reads as sets. */
export interface CaptureGroup {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly captures: readonly ScreenshotCapture[];
}

const GROUP_DEFINITIONS: readonly {
    id: string;
    title: string;
    description: string;
    match: (capture: ScreenshotCapture) => boolean;
}[] = [
    {
        id: "window-sizes",
        title: "Window sizes",
        description:
            "Four supported geometries including the narrow case, where labels clip first and bilingual copy is longest.",
        match: (capture) => capture.file.startsWith("shell-") && !capture.file.startsWith("shell-scale-"),
    },
    {
        id: "display-scales",
        title: "Display scales",
        description: "100, 125, 150 and 200 percent, which is where element sizing defects appear.",
        match: (capture) => capture.file.startsWith("shell-scale-"),
    },
    {
        id: "pages",
        title: "Pages",
        description: "Each destination in the navigation drawer, captured after activating it.",
        match: (capture) => capture.file.startsWith("page-"),
    },
    {
        id: "themes",
        title: "Light and dark",
        description: "The same shell under both colour schemes.",
        match: (capture) => capture.file.startsWith("theme-"),
    },
    {
        id: "diagnostics",
        title: "Diagnostics",
        description:
            "Captures the harness takes when the interface fails to mount. These are published rather than hidden, because a broken window is the evidence that fixes it.",
        match: (capture) => capture.file.startsWith("diagnostic"),
    },
];

/**
 * Group the captures. Anything that matches no rule lands in a final group rather than
 * being dropped, because a gallery that silently omits an image is a gallery nobody can
 * check against the artifact.
 */
export function groupCaptures(captures: readonly ScreenshotCapture[]): readonly CaptureGroup[] {
    const claimed = new Set<string>();
    const groups: CaptureGroup[] = [];

    for (const definition of GROUP_DEFINITIONS) {
        const matched = captures.filter((capture) => !claimed.has(capture.file) && definition.match(capture));
        for (const capture of matched) claimed.add(capture.file);
        if (matched.length > 0) {
            groups.push({
                id: definition.id,
                title: definition.title,
                description: definition.description,
                captures: matched,
            });
        }
    }

    const rest = captures.filter((capture) => !claimed.has(capture.file));
    if (rest.length > 0) {
        groups.push({
            id: "other",
            title: "Other captures",
            description: "Images in the artifact that do not match a known capture set.",
            captures: rest,
        });
    }

    return groups;
}

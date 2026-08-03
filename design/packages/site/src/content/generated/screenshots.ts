/**
 * GENERATED FILE. Do not edit by hand.
 *
 * Written by `design/packages/site/scripts/fetch-screenshots.mjs`, which downloads the
 * `screenshots` artifact produced by the app's Playwright harness in CI and copies the
 * images into the site's public directory. The workflow that deploys the site runs that
 * script before every build.
 *
 * The version committed to the repository is deliberately the unavailable one, so a
 * fresh clone builds a gallery that says captures are not available rather than one
 * referencing images that are not in the tree. The images themselves are never
 * committed; see the `.gitignore` beside the public screenshots directory. A committed
 * available state with no images on disk is caught by `content.test.ts`.
 */

import type { ScreenshotAvailability } from "../types.js";

export const screenshotAvailability: ScreenshotAvailability = {
    available: false,
    generatedAt: "1970-01-01T00:00:00.000Z",
    reason: "This build did not run the screenshot fetch script, so no captures were collected.",
};

/**
 * GENERATED FILE. Do not edit by hand.
 *
 * Written by `design/packages/site/scripts/fetch-release.mjs`, which asks the GitHub
 * releases API for the newest published, non-draft release and checks that a real
 * Squirrel.Windows installer asset is attached to it. The workflow that deploys the
 * site runs that script before every build.
 *
 * The version committed to the repository is deliberately the unavailable one. A
 * fresh clone therefore builds a site with no download button and an honest note,
 * rather than one pointing at whatever release happened to be current when somebody
 * last ran the script. If you run the script locally, restore this file before
 * committing so a stale pointer never lands on the default branch.
 */

import type { ReleaseAvailability } from "../types.js";

export const releaseAvailability: ReleaseAvailability = {
    available: false,
    generatedAt: "1970-01-01T00:00:00.000Z",
    reason: "This build did not run the release fetch script, so no release has been verified.",
};

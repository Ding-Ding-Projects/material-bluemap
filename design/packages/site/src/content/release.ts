/**
 * The Home page download button.
 *
 * The rule this file exists to enforce: absent rather than wrong. `releaseAvailability`
 * comes from a generated module written by `scripts/fetch-release.mjs`, which only
 * reports `available: true` after it has seen a published, non-draft release carrying
 * an asset that is actually a Squirrel installer. When it is false the shell renders
 * the unavailable copy and no link at all.
 */

import type { ReleaseAvailability, ReleaseInfo } from "./types.js";
import { releaseAvailability } from "./generated/release.js";
import { RELEASES_URL } from "./links.js";

export { releaseAvailability };
export type { ReleaseAvailability, ReleaseInfo };

/** Copy for both states of the download area. */
export const downloadCopy = {
    heading: "Download",
    /** Shown above the button when a release is available. */
    availableLead:
        "The Windows installer below is the artefact CI built and published, linked by its own immutable release asset URL.",
    /** Shown instead of the button when no release passed verification. */
    unavailableHeading: "No verified release for this build",
    unavailableLead:
        "This build of the site did not find a published release with a verified installer attached, so it offers no download. Nothing here guesses a URL.",
    unavailableLinkLabel: "Open the releases page",
    unavailableLinkHref: RELEASES_URL,
    /** Always shown, in both states. */
    caveat:
        "Windows only, and the installer is not code signed. Rendering a world of your own needs a Java runtime, which the app will fetch for itself, because a local render runs upstream BlueMap's Java engine rather than this project's own renderer.",
    releaseNotesLabel: "Release notes",
} as const;

/** Bytes as a short human figure. Binary units, because that is what a file manager shows. */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KiB", "MiB", "GiB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex] ?? "KiB"}`;
}

/** An ISO timestamp as a plain date, or the raw value if it does not parse. */
export function formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toISOString().slice(0, 10);
}

/** The visible button label. Short, because the detail sits beside it. */
export function downloadButtonLabel(release: ReleaseInfo): string {
    return `Download for ${release.installer.platform}`;
}

/**
 * The architecture, or nothing when the release did not say.
 *
 * Squirrel does not put an architecture in its default filename, so most releases have
 * none to report. Leaving it out is correct; filling it in from what the packaging
 * config happens to say today would be the site guessing.
 */
function archPart(arch: string): string | null {
    return arch === "unspecified" || arch.length === 0 ? null : arch;
}

/**
 * The accessible name for the download link.
 *
 * A link whose accessible name is "Download" tells a screen-reader user nothing about
 * what arrives, so this names the version, the platform, the architecture and the size.
 */
export function downloadAccessibleName(release: ReleaseInfo): string {
    const { installer } = release;
    const parts = [
        `Download material-bluemap ${release.version} for ${installer.platform}`,
        archPart(installer.arch),
        `${installer.format} installer`,
        formatBytes(installer.sizeBytes),
        `file ${installer.assetName}`,
    ].filter((part): part is string => part !== null);
    return parts.join(", ");
}

/** The detail line rendered under the button. */
export function downloadDetailLine(release: ReleaseInfo): string {
    const { installer } = release;
    const arch = archPart(installer.arch);
    const platform = arch === null ? installer.platform : `${installer.platform} ${arch}`;
    const parts = [
        `Version ${release.version}`,
        platform,
        `${installer.format} installer`,
        formatBytes(installer.sizeBytes),
        `published ${formatDate(release.publishedAt)}`,
    ];
    return parts.join(" · ");
}

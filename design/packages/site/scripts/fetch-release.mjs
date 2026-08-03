#!/usr/bin/env node
/**
 * fetch-release.mjs — resolve the installer the site's download button points at.
 *
 * The rule this script exists to enforce is that the button is absent rather than
 * wrong. It asks the forge for the newest published release, proves that a real
 * Squirrel.Windows installer is attached to it, and writes the asset's own
 * `browser_download_url` into a generated module. No URL is ever constructed from a tag
 * and a guessed filename, and nothing is written from a release that failed a check.
 *
 * When anything fails, the generated module says the download is unavailable and gives
 * the reason. The site then builds with no button and an honest note. That is a
 * success, not an error, so this script exits 0 unless it cannot write its output.
 *
 * Usage:
 *   node scripts/fetch-release.mjs
 *   node scripts/fetch-release.mjs --repo owner/name
 *   node scripts/fetch-release.mjs --out src/content/generated/release.ts
 *
 * Needs the GitHub CLI on PATH. Authentication is optional for a public repository,
 * but an authenticated call has a far higher rate limit, so CI should have GH_TOKEN set.
 */

import { resolve } from "node:path";
import process from "node:process";

import {
    FetchFailure,
    GENERATED_DIR,
    SITE_ROOT,
    ghApi,
    log,
    parseArgs,
    resolveRepo,
    writeGeneratedModule,
} from "./shared.mjs";

const SCRIPT = "fetch-release";

/**
 * An installer smaller than this is a stub, a placeholder or an unrelated executable
 * that happens to be named like one. The real Electron installer is over 100 MiB.
 */
const MIN_INSTALLER_BYTES = 10 * 1024 * 1024;

/** Squirrel names its installer `<Product>-<version>-Setup.exe`. */
const SETUP_ASSET = /-setup\.exe$/i;

/** Squirrel always publishes these beside the installer. Their absence means it is not one. */
const RELEASES_MANIFEST = "RELEASES";
const NUPKG_ASSET = /\.nupkg$/i;

const HEADER = [
    "GENERATED FILE. Do not edit by hand.",
    "",
    "Written by `design/packages/site/scripts/fetch-release.mjs`, which asks the GitHub",
    "releases API for the newest published, non-draft release and checks that a real",
    "Squirrel.Windows installer asset is attached to it. The workflow that deploys the",
    "site runs that script before every build.",
    "",
    "The version committed to the repository is deliberately the unavailable one. A",
    "fresh clone therefore builds a site with no download button and an honest note,",
    "rather than one pointing at whatever release happened to be current when somebody",
    "last ran the script. If you run the script locally, `git checkout` this file before",
    "committing so a stale pointer never lands on the default branch.",
];

/** The app version inside a release tag such as `v0.1.0-build.37`. */
function versionFromTag(tag) {
    const match = /^v?(\d+\.\d+\.\d+)/.exec(tag);
    return match ? match[1] : tag;
}

/**
 * The architecture, only when the asset actually says so.
 *
 * Squirrel does not put the architecture in its default filename, so most releases will
 * not have one. Reporting "unspecified" is correct; inferring x64 because that is what
 * the packaging config happens to say today would be this script guessing.
 */
function archFromAssetName(name) {
    const lower = name.toLowerCase();
    if (lower.includes("arm64") || lower.includes("aarch64")) return "arm64";
    if (lower.includes("x64") || lower.includes("amd64") || lower.includes("win64")) return "x64";
    if (lower.includes("ia32") || lower.includes("x86") || lower.includes("win32")) return "ia32";
    return "unspecified";
}

/** Pull the fields we rely on out of an asset, or null if it is not shaped like one. */
function normaliseAsset(asset) {
    if (!asset || typeof asset !== "object") return null;
    const { name, size, state, browser_download_url: url } = asset;
    if (typeof name !== "string" || name.length === 0) return null;
    if (typeof url !== "string" || !url.startsWith("https://")) return null;
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return null;
    return { name, size, state: typeof state === "string" ? state : "unknown", url };
}

/**
 * Prove the release carries a Squirrel installer, and return it.
 *
 * Throws a `FetchFailure` naming the exact check that failed, because "no download is
 * offered" is only a useful message when it comes with the reason.
 */
function findInstaller(release) {
    const rawAssets = Array.isArray(release.assets) ? release.assets : [];
    const assets = rawAssets.map(normaliseAsset).filter((asset) => asset !== null);

    if (assets.length === 0) {
        throw new FetchFailure(`release ${release.tag_name} has no usable assets attached`);
    }

    const uploaded = assets.filter((asset) => asset.state === "uploaded" || asset.state === "unknown");
    const candidates = uploaded.filter((asset) => SETUP_ASSET.test(asset.name));

    if (candidates.length === 0) {
        throw new FetchFailure(
            `release ${release.tag_name} has no asset whose name ends in -Setup.exe, so no installer could be identified`
        );
    }
    if (candidates.length > 1) {
        const names = candidates.map((asset) => asset.name).join(", ");
        throw new FetchFailure(
            `release ${release.tag_name} has more than one installer candidate (${names}); refusing to pick one`
        );
    }

    const installer = candidates[0];

    if (installer.size < MIN_INSTALLER_BYTES) {
        throw new FetchFailure(
            `${installer.name} is only ${installer.size} bytes, which is too small to be the installer`
        );
    }

    // Squirrel.Windows always emits the update manifest and the package alongside the
    // installer. Requiring both is what stops an unrelated executable attached to a
    // release from being offered as the app.
    const hasManifest = uploaded.some((asset) => asset.name === RELEASES_MANIFEST);
    const hasPackage = uploaded.some((asset) => NUPKG_ASSET.test(asset.name));
    if (!hasManifest || !hasPackage) {
        const missing = [
            hasManifest ? null : `the ${RELEASES_MANIFEST} manifest`,
            hasPackage ? null : "a .nupkg package",
        ]
            .filter(Boolean)
            .join(" and ");
        throw new FetchFailure(
            `release ${release.tag_name} is missing ${missing}, so ${installer.name} was not confirmed to be a Squirrel installer`
        );
    }

    return installer;
}

async function resolveRelease(repo) {
    // `releases/latest` is defined as the newest release that is neither a draft nor a
    // prerelease, which is exactly the set a download button may point at.
    const release = await ghApi(`repos/${repo}/releases/latest`);

    if (!release || typeof release !== "object") {
        throw new FetchFailure("the forge returned no release");
    }
    if (release.draft === true) {
        throw new FetchFailure("the newest release is a draft, which nobody outside the project can download");
    }
    if (release.prerelease === true) {
        throw new FetchFailure("the newest release is a prerelease");
    }
    if (typeof release.tag_name !== "string" || release.tag_name.length === 0) {
        throw new FetchFailure("the newest release has no tag");
    }
    if (typeof release.html_url !== "string" || !release.html_url.startsWith("https://")) {
        throw new FetchFailure(`release ${release.tag_name} has no usable page URL`);
    }

    const installer = findInstaller(release);

    return {
        available: true,
        generatedAt: new Date().toISOString(),
        release: {
            tag: release.tag_name,
            version: versionFromTag(release.tag_name),
            publishedAt: typeof release.published_at === "string" ? release.published_at : new Date().toISOString(),
            releaseUrl: release.html_url,
            installer: {
                assetName: installer.name,
                url: installer.url,
                sizeBytes: installer.size,
                platform: "Windows",
                arch: archFromAssetName(installer.name),
                format: "Squirrel.Windows",
            },
        },
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repo = resolveRepo(args);
    const out = typeof args.out === "string" ? resolve(SITE_ROOT, args.out) : resolve(GENERATED_DIR, "release.ts");

    log(SCRIPT, `repository: ${repo}`);

    let value;
    try {
        value = await resolveRelease(repo);
        const { installer, tag, version } = value.release;
        log(SCRIPT, `verified ${tag} (version ${version})`);
        log(SCRIPT, `installer: ${installer.assetName}, ${installer.sizeBytes} bytes, ${installer.arch}`);
        log(SCRIPT, `url: ${installer.url}`);
    } catch (error) {
        const reason =
            error instanceof FetchFailure
                ? error.message
                : `an unexpected error occurred: ${String(error?.message ?? error)}`;
        value = {
            available: false,
            generatedAt: new Date().toISOString(),
            reason: `No download is offered for this build: ${reason}.`,
        };
        log(SCRIPT, `no verified release: ${reason}`);
        log(SCRIPT, "the site will build without a download button, which is the intended fallback");
    }

    await writeGeneratedModule({
        file: out,
        header: HEADER,
        typeName: "ReleaseAvailability",
        exportName: "releaseAvailability",
        value,
    });

    log(SCRIPT, `wrote ${out}`);
}

await main();

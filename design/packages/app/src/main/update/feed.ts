/**
 * Where the app looks for a newer version of itself, and what it is allowed to send there.
 *
 * The packaging side of this already exists and has never been used: `electron-builder`
 * builds a Squirrel.Windows target, so every release carries a `RELEASES` index and the
 * full and delta `.nupkg` files that Electron's own `autoUpdater` consumes. This module is
 * the other half - deciding which URL those live behind, and refusing to invent one.
 *
 * ## Three refusals, and why each is a refusal rather than a guess
 *
 * 1. **Not packaged.** A development build has no Squirrel `Update.exe` beside it. Pointing
 *    the updater at a feed anyway produces an error on every launch that says nothing about
 *    the app and everything about how it was started.
 * 2. **Not Windows.** Squirrel.Windows is the only install path this product ships. On any
 *    other platform there is no artefact to hand the updater, so it says so instead of
 *    downloading one that cannot be installed.
 * 3. **No feed configured.** A build with no repository and no override has nowhere to look.
 *    Guessing a URL would mean a scheduled background request to a host nobody chose.
 *
 * Each refusal produces a *reason string*, not silence. "This build cannot update itself,
 * because it was not installed by its installer" is a sentence a user can act on; a Check
 * for updates button that spins forever is not.
 *
 * ## The credential never reaches the renderer, and never reaches a release asset
 *
 * A private feed needs an `Authorization` header. It is read from the process environment
 * in the main process, attached to the feed configuration here, and **never** placed in any
 * value that crosses IPC: {@link describeFeed} exists precisely so the interface can be told
 * where updates come from without being told how the app authenticates to it. The redaction
 * is asserted by a test rather than left to reviewer discipline, because a header that
 * leaks into a state object is invisible until somebody screenshots it.
 */

/** The `update.electronjs.org` service, which speaks Squirrel.Windows natively. */
const PUBLIC_FEED_HOST = "https://update.electronjs.org";

/** Environment overrides, so a self-hosted or staging feed needs no rebuild. */
export const FEED_URL_VARIABLE = "WORLDLENS_UPDATE_FEED";
export const FEED_TOKEN_VARIABLE = "WORLDLENS_UPDATE_TOKEN";
/** Set this to switch the updater off entirely on a machine that manages its own installs. */
export const FEED_DISABLE_VARIABLE = "WORLDLENS_DISABLE_UPDATES";

/** Old names remain readable for installed clients and managed-machine configuration. */
export const LEGACY_FEED_URL_VARIABLE = "MATERIAL_BLUEMAP_UPDATE_FEED";
export const LEGACY_FEED_TOKEN_VARIABLE = "MATERIAL_BLUEMAP_UPDATE_TOKEN";
export const LEGACY_FEED_DISABLE_VARIABLE = "MATERIAL_BLUEMAP_DISABLE_UPDATES";

export interface FeedInputs {
    /** `app.isPackaged`. False for a development run and for an unpacked directory. */
    readonly packaged: boolean;
    /** `process.platform`. */
    readonly platform: NodeJS.Platform;
    /** `process.arch`, which the public service uses to pick the right channel. */
    readonly arch: string;
    /** `app.getVersion()`. The service compares against it server-side. */
    readonly version: string;
    /** `owner/repo` of the repository publishing the releases, or null for none. */
    readonly repository: string | null;
    /** `process.env`, passed in so this whole module is testable without one. */
    readonly environment: Readonly<Record<string, string | undefined>>;
}

/** Exactly what `autoUpdater.setFeedURL` is given. Holds the credential; never crosses IPC. */
export interface FeedConfiguration {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly serverType: "default" | "json";
}

export type FeedResolution =
    | { readonly ok: true; readonly feed: FeedConfiguration }
    | { readonly ok: false; readonly reason: string };

/** True for an https URL. An update fetched over http is an update anybody can replace. */
export function isSecureFeedUrl(value: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(value.trim());
    } catch {
        return false;
    }
    if (parsed.protocol === "https:") return true;
    // Loopback over http is allowed so a test server needs no certificate. Nothing else
    // is: on any other host, plaintext means the installer can be swapped in transit.
    return parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
}

function truthy(value: string | undefined): boolean {
    if (value === undefined) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

function firstEnvironmentValue(
    environment: Readonly<Record<string, string | undefined>>,
    primary: string,
    legacy: string,
): string | undefined {
    const current = environment[primary]?.trim();
    if (current !== undefined && current !== "") return current;
    const old = environment[legacy]?.trim();
    return old === "" ? undefined : old;
}

/**
 * The feed this build should use, or the reason there is not one.
 *
 * The override is checked before the platform and packaging gates on purpose: somebody who
 * has pointed the app at a local feed is testing the updater, and refusing them because the
 * build is not packaged would make the seam untestable on the machine where it is being
 * written.
 */
export function resolveFeed(inputs: FeedInputs): FeedResolution {
    const environment = inputs.environment;

    if (
        truthy(environment[FEED_DISABLE_VARIABLE]) ||
        truthy(environment[LEGACY_FEED_DISABLE_VARIABLE])
    ) {
        return {
            ok: false,
            reason:
                `Automatic updates are switched off on this machine by ${FEED_DISABLE_VARIABLE}. ` +
                "Unset it to have the app check for updates again.",
        };
    }

    const token = firstEnvironmentValue(
        environment,
        FEED_TOKEN_VARIABLE,
        LEGACY_FEED_TOKEN_VARIABLE,
    );
    const headers: Record<string, string> = {};
    if (token !== undefined && token !== "") headers["Authorization"] = `Bearer ${token}`;

    const override = firstEnvironmentValue(
        environment,
        FEED_URL_VARIABLE,
        LEGACY_FEED_URL_VARIABLE,
    );
    if (override !== undefined && override !== "") {
        if (!isSecureFeedUrl(override)) {
            return {
                ok: false,
                reason:
                    `${FEED_URL_VARIABLE} is not an https address, so it was ignored. ` +
                    "An update fetched over plain http can be replaced in transit, which is the one thing an " +
                    "updater must not allow.",
            };
        }
        return { ok: true, feed: { url: override, headers, serverType: "default" } };
    }

    if (inputs.platform !== "win32") {
        return {
            ok: false,
            reason:
                "This app installs through a Windows installer, and this is not Windows, so there is no update " +
                "for it to fetch. Nothing is wrong; there is simply nothing to check.",
        };
    }

    if (!inputs.packaged) {
        return {
            ok: false,
            reason:
                "This copy was not installed by the setup program, so it has no updater beside it. " +
                "Installed copies update themselves; a development build is updated by rebuilding it.",
        };
    }

    const repository = inputs.repository?.trim();
    if (repository === undefined || repository === "" || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
        return {
            ok: false,
            reason:
                "This build has no release repository configured, so there is nowhere to look for a newer version. " +
                `Set ${FEED_URL_VARIABLE} to a release feed to point it somewhere.`,
        };
    }

    // `win32-<arch>` is the service's own channel spelling, and the version goes in the
    // path rather than a query string because that is the route it documents.
    const url = `${PUBLIC_FEED_HOST}/${repository}/win32-${inputs.arch}/${encodeURIComponent(inputs.version)}`;
    return { ok: true, feed: { url, headers, serverType: "default" } };
}

/**
 * What may be said about the feed on screen: the address, and never the credential.
 *
 * `hasCredential` is a boolean rather than the header, because "this app authenticates to
 * the update server" is a fact worth showing in a diagnostics row and the token is not.
 */
export interface FeedDescription {
    readonly url: string;
    readonly hasCredential: boolean;
}

export function describeFeed(feed: FeedConfiguration): FeedDescription {
    return { url: feed.url, hasCredential: Object.keys(feed.headers).length > 0 };
}

/**
 * Deciding whether a scheduled world has changed, cheaply, for each `world-source` the
 * render workflow accepts.
 *
 * `render-world.yml` reads a world from one of three places - a path already in this
 * repository, a URL, or a GitHub release asset - and each one offers a different cheap
 * signal, or none at all:
 *
 * - **repository**: the world is already checked out by the time the scheduled workflow's
 *   job runs, so this reuses {@link "./world/fingerprint.js".fingerprintWorld} - the exact
 *   function `main/cirender/sync.ts` already runs before every desktop upload - rather
 *   than inventing a second "has it changed" mechanism. See `../cli.ts`'s `fingerprint`
 *   command, which is how the workflow gets that digest without importing this package's
 *   internals directly into a shell step.
 * - **release-asset**: downloading the asset just to hash it defeats the entire point of
 *   checking cheaply, so this trusts what GitHub already publishes about the asset without
 *   fetching its bytes - its own `digest` field when GitHub sent one, and its `size` and
 *   `updated_at` otherwise. That is a real, documented narrowing from a byte-for-byte
 *   comparison: it is honest about trusting GitHub's metadata rather than re-deriving it.
 * - **url**: nothing about an arbitrary URL is guaranteed cheap to compare, so this reads
 *   only what a `HEAD` request's headers offer - `ETag`, `Content-Length`,
 *   `Last-Modified` - and says plainly, as `"unknown"`, when a server sends none of them.
 *   `"unknown"` is not a guess in either direction: it is refusing to claim a change was
 *   found or was not found when there is nothing to compare.
 * - **git**: a world kept in a git repository (see `app/src/main/worldrepo/`) has the
 *   cheapest signal of all four - the target branch's current commit SHA, one `gh api`
 *   call, nothing cloned and nothing downloaded. Two SHAs either match or they do not;
 *   there is no fallback to reach for the way `release-asset` and `url` need one.
 *
 * Every comparison here is pure - it takes two already-gathered snapshots and decides. The
 * gathering itself (checking out the world, calling the GitHub API, sending a `HEAD`
 * request) happens in `.github/workflows/scheduled-render.yml`'s own steps, which is where
 * the actual network and filesystem access belongs.
 */

export type CiScheduleSourceKind = "repository" | "release-asset" | "url" | "git";

export type CiScheduleCheckResult =
    | { readonly result: "changed"; readonly reason: string }
    | { readonly result: "unchanged"; readonly reason: string }
    /** Nothing comparable was available on either side. Never treated as "unchanged". */
    | { readonly result: "unknown"; readonly reason: string }
    /** The configured world itself could not be found or read. Not a change decision. */
    | { readonly result: "error"; readonly reason: string };

type Facts = Readonly<Record<string, unknown>>;

function str(facts: Facts, key: string): string | null {
    const value = facts[key];
    return typeof value === "string" && value.length > 0 ? value : null;
}

function num(facts: Facts, key: string): number | null {
    const value = facts[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Compares a `repository` source's two fingerprints.
 *
 * Reads `digest` directly off whatever {@link "./world/fingerprint.js".WorldFingerprint}
 * JSON the caller passed - `fingerprintWorld`'s own output - so this never re-implements
 * what counts as "changed" for a checked-out world; it only asks whether the digest moved.
 */
function compareRepository(previous: Facts, current: Facts): CiScheduleCheckResult {
    const before = str(previous, "digest");
    const after = str(current, "digest");
    if (before === null || after === null) {
        return {
            result: "error",
            reason: "A fingerprint digest was missing from what was compared, so nothing could be decided.",
        };
    }
    return before === after
        ? { result: "unchanged", reason: "The checked-out world's fingerprint digest has not moved." }
        : { result: "changed", reason: "The checked-out world's fingerprint digest is different from last time." };
}

/**
 * Compares a `release-asset` source's published metadata.
 *
 * GitHub's own `digest` (`sha256:...`) is preferred when both snapshots have one, because
 * it is the closest thing to a content comparison this can do without downloading the
 * asset. Older assets, and some hosts, never publish one - `size` plus `updated_at` is the
 * fallback, and it is a real fallback: two uploads that happen to land on the same second
 * with the same byte count would be missed, and that limitation is documented rather than
 * hidden. See `docs/scheduled-render.md`.
 */
function compareReleaseAsset(previous: Facts, current: Facts): CiScheduleCheckResult {
    const beforeDigest = str(previous, "digest");
    const afterDigest = str(current, "digest");
    if (beforeDigest !== null && afterDigest !== null) {
        return beforeDigest === afterDigest
            ? { result: "unchanged", reason: "GitHub reports the same asset digest as last time." }
            : { result: "changed", reason: "GitHub reports a different asset digest than last time." };
    }

    const beforeSize = num(previous, "size");
    const afterSize = num(current, "size");
    const beforeUpdated = str(previous, "updatedAt");
    const afterUpdated = str(current, "updatedAt");
    if (beforeSize === null || afterSize === null || beforeUpdated === null || afterUpdated === null) {
        return {
            result: "error",
            reason: "The release asset's size or upload time was missing, so nothing could be decided.",
        };
    }
    return beforeSize === afterSize && beforeUpdated === afterUpdated
        ? {
              result: "unchanged",
              reason:
                  "GitHub published no digest for this asset, so its size and upload time were " +
                  "compared instead, and neither has changed.",
          }
        : {
              result: "changed",
              reason:
                  "GitHub published no digest for this asset, so its size and upload time were " +
                  "compared instead, and one of them has.",
          };
}

/**
 * Compares a `url` source's `HEAD` response headers.
 *
 * `ETag` is preferred when both sides sent one, exactly as an HTTP cache would use it.
 * Falling back to `Content-Length`/`Last-Modified` catches a plain static file server; a
 * server that sends none of the three - some do not - genuinely cannot be checked this
 * way, and that is reported as `"unknown"` rather than guessed at in either direction.
 */
function compareUrl(previous: Facts, current: Facts): CiScheduleCheckResult {
    const beforeEtag = str(previous, "etag");
    const afterEtag = str(current, "etag");
    if (beforeEtag !== null && afterEtag !== null) {
        return beforeEtag === afterEtag
            ? { result: "unchanged", reason: "The URL's ETag header has not changed." }
            : { result: "changed", reason: "The URL's ETag header is different from last time." };
    }

    const beforeLength = num(previous, "contentLength");
    const afterLength = num(current, "contentLength");
    const beforeModified = str(previous, "lastModified");
    const afterModified = str(current, "lastModified");
    const haveLength = beforeLength !== null && afterLength !== null;
    const haveModified = beforeModified !== null && afterModified !== null;
    if (!haveLength && !haveModified) {
        return {
            result: "unknown",
            reason:
                "This URL sent no ETag, Content-Length or Last-Modified header, so a change " +
                "cannot be detected without downloading the whole world - which this check will " +
                "not do. Dispatch the render workflow by hand when this world changes, or " +
                "switch it to a release-asset or repository source for automatic detection.",
        };
    }
    const lengthChanged = haveLength && beforeLength !== afterLength;
    const modifiedChanged = haveModified && beforeModified !== afterModified;
    return lengthChanged || modifiedChanged
        ? {
              result: "changed",
              reason:
                  "This URL sent no ETag, so its Content-Length and Last-Modified headers were " +
                  "compared instead, and one of them is different from last time.",
          }
        : {
              result: "unchanged",
              reason:
                  "This URL sent no ETag, so its Content-Length and Last-Modified headers were " +
                  "compared instead, and neither has changed.",
          };
}

/**
 * Compares a `git` source's branch tip.
 *
 * `sha` is the target branch's current commit, exactly what {@link
 * "../../../app/src/main/worldrepo/repo.js".WorldRepoHost.remoteTip} answers on the
 * desktop side and what `.github/workflows/scheduled-render.yml`'s git snapshot step reads
 * with one `gh api` call. Nothing here is a fallback for a missing field the way
 * `release-asset` and `url` need one - a branch either has a commit or the source could not
 * be found at all, which is already handled by {@link evaluateScheduleChange} before this
 * runs.
 */
function compareGit(previous: Facts, current: Facts): CiScheduleCheckResult {
    const before = str(previous, "sha");
    const after = str(current, "sha");
    if (before === null || after === null) {
        return {
            result: "error",
            reason: "The branch's commit SHA was missing from what was compared, so nothing could be decided.",
        };
    }
    return before === after
        ? { result: "unchanged", reason: "The world repository's branch tip has not moved." }
        : { result: "changed", reason: "The world repository's branch tip is different from last time." };
}

/**
 * The one entry point every `schedule-check` CLI call and its tests go through.
 *
 * `current === null` means the configured world could not even be found this time - an
 * asset that was deleted, a path that no longer exists - which is an **error**, never a
 * "changed" render trigger: dispatching a render that would immediately fail to find its
 * world helps nobody. `previous === null` means no earlier check is recorded at all, which
 * is genuinely a "changed" case: it establishes the baseline and renders once, the same
 * way a first upload does in `main/cirender/sync.ts`.
 */
export function evaluateScheduleChange(
    kind: CiScheduleSourceKind,
    previous: Facts | null,
    current: Facts | null,
): CiScheduleCheckResult {
    if (current === null) {
        return {
            result: "error",
            reason: "The configured world could not be found, so it cannot be checked for changes.",
        };
    }
    if (previous === null) {
        return {
            result: "changed",
            reason: "No earlier check is recorded yet; this establishes the baseline and renders once.",
        };
    }
    switch (kind) {
        case "repository":
            return compareRepository(previous, current);
        case "release-asset":
            return compareReleaseAsset(previous, current);
        case "url":
            return compareUrl(previous, current);
        case "git":
            return compareGit(previous, current);
    }
}

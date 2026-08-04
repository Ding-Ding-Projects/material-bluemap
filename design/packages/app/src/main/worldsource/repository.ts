/**
 * Naming the repository a world comes from.
 *
 * `download/` already fetches from any `owner/repo` it is handed - the parameters were
 * always there. What was missing is the step before it: turning what a person actually
 * has into that pair. Nobody types `cafepromenade/Andyville-World`; they copy the address
 * bar, which is a release URL, or they paste the whole `https://github.com/...` link.
 *
 * So this accepts every shape of the same fact and refuses everything else. The refusal
 * matters more than the acceptance: an owner or a repository name is interpolated into an
 * API path, and a value carrying `../` would address a different endpoint entirely. The
 * grammars below are GitHub's own, and nothing that fails them is passed on to be encoded
 * and hoped about.
 */

/**
 * GitHub's account grammar: alphanumerics and single hyphens, 39 characters at most.
 *
 * Written as one pattern rather than a length check plus a character check because the
 * failure being prevented is a name that passes one and not the other - `-`, `a--b`,
 * a forty-character login - being sent to the API to be rejected there, where the error
 * is a 404 that reads as "no such release".
 */
const OWNER = /^[A-Za-z0-9](?:-?[A-Za-z0-9]){0,38}$/;

/** GitHub's repository grammar. Dots and underscores are legal here and not in an owner. */
const REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/;

/** Where the app looks when nobody says otherwise. */
export interface WorldSourceReference {
    readonly owner: string;
    readonly repo: string;
    /**
     * The release tag the text named, or null for "whatever is latest".
     *
     * Null rather than the string `latest`: `latest` is a real tag somebody could
     * publish, and the two would then be indistinguishable one layer down.
     */
    readonly tag: string | null;
}

/** `owner/repo`, for a message or a folder name. Never used to build a URL. */
export function formatReference(reference: {
    readonly owner: string;
    readonly repo: string;
}): string {
    return `${reference.owner}/${reference.repo}`;
}

/** True for a pair that can be put in an API path without escaping anything. */
export function isValidReference(owner: string, repo: string): boolean {
    return OWNER.test(owner) && REPOSITORY.test(repo);
}

/**
 * A trailing `.git` is part of a clone URL, never part of the repository's name.
 *
 * Left on, every lookup of a pasted clone URL 404s, and the message says the release does
 * not exist - which sends somebody to check a release that is sitting right there.
 */
function withoutGitSuffix(value: string): string {
    return value.endsWith(".git") ? value.slice(0, -4) : value;
}

/**
 * Reads any of the shapes a person actually has into an owner, a repo and maybe a tag.
 *
 * Accepted, all meaning the same repository:
 *
 * ```
 * cafepromenade/Andyville-World
 * github.com/cafepromenade/Andyville-World
 * https://github.com/cafepromenade/Andyville-World
 * https://github.com/cafepromenade/Andyville-World.git
 * https://github.com/cafepromenade/Andyville-World/releases/tag/andyville-backup-20260804-160001
 * ```
 *
 * The last one carries a tag, and carrying it through is the point: somebody who pasted a
 * link to *that* release means that release, and silently fetching `latest` instead would
 * hand them a different world with no sign that it had happened.
 *
 * Returns null for anything that is not a repository reference. Never throws: this is
 * called on every keystroke of a text field, where an exception is a crash and a null is
 * a field that has not been filled in yet.
 */
export function parseWorldSourceReference(text: string): WorldSourceReference | null {
    if (typeof text !== "string") return null;
    let value = text.trim();
    if (value === "") return null;

    // A URL, in any of the spellings a browser or a clone dialog produces. Only the
    // hostname is dropped; a link to some other forge is refused below rather than being
    // treated as though it were GitHub, because it is not and its API is not this one.
    const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i.exec(value);
    if (url !== null && url[1] !== undefined) value = url[1];
    else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return null;

    const segments = value.split("/").filter((segment) => segment !== "");
    const owner = segments[0];
    const repo = segments[1] === undefined ? undefined : withoutGitSuffix(segments[1]);
    if (owner === undefined || repo === undefined) return null;
    if (!isValidReference(owner, repo)) return null;

    // `/releases/tag/<tag>` is the only trailing form that means anything here. A tag may
    // itself contain slashes - `release/1.4` is ordinary - so everything after `tag` is
    // the tag, joined back together rather than taken as one segment.
    let tag: string | null = null;
    if (segments[2] === "releases" && segments[3] === "tag" && segments.length > 4) {
        const rest = segments.slice(4).join("/");
        tag = rest === "" ? null : decodeURIComponent(rest);
    }

    return { owner, repo, tag };
}

/**
 * Why an update did not happen, in words somebody can act on.
 *
 * Electron's `autoUpdater` reports every one of its problems the same way - an `error`
 * event carrying an `Error` whose message came from Squirrel, from WinINet, or from the
 * HTTP stack underneath. Those messages are accurate and useless: "hash of downloaded file
 * does not match" tells a person nothing about what to do, and "getaddrinfo ENOTFOUND"
 * tells them nothing at all.
 *
 * So every failure is classified once, here, into a code the interface can key off and a
 * sentence a person can read. The classification is deliberately conservative: an error
 * that matches no rule becomes `unknown` and keeps its original text as `detail`, because
 * inventing a confident wrong diagnosis is worse than admitting the app does not recognise
 * this one.
 *
 * The failure this file exists to prevent is the silent one. An update that cannot be
 * checked, downloaded or verified must never look like an update that is simply not there
 * yet: the first needs the user's attention and the second does not, and a spinner that
 * never resolves is how both end up looking identical.
 */

/** What went wrong, coarsely enough to drive copy and finely enough to be useful. */
export type UpdateFailureCode =
    /** No route to the update server. Almost always the machine being offline. */
    | "offline"
    /** The server answered, but not with a feed: a 404, a 500, an HTML error page. */
    | "feed-unavailable"
    /** The downloaded installer is not signed by the expected publisher. */
    | "invalid-signature"
    /** The download arrived, and it is not the bytes the feed said it would be. */
    | "corrupt-asset"
    /** Squirrel is not present, which is what an unpackaged or copied build looks like. */
    | "not-installed"
    /** The disk filled, or the staging folder could not be written. */
    | "staging-failed"
    /** Recognised as nothing in particular. The original text travels as `detail`. */
    | "unknown";

export interface UpdateFailure {
    readonly code: UpdateFailureCode;
    /** One sentence, already written for a person. Never a syscall or a stack. */
    readonly message: string;
    /** The original text, for a disclosure. Null when there was nothing extra to say. */
    readonly detail: string | null;
    /**
     * True when trying again later could plausibly work without the user doing anything.
     *
     * A network blip is retryable; a signature that does not verify is not, and retrying it
     * on a schedule would just be downloading a bad file over and over.
     */
    readonly retryable: boolean;
}

/** Collapses whitespace so a multi-line Squirrel banner does not become the whole screen. */
function oneLine(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

/** The text of anything that arrived on an `error` event, however it was thrown. */
export function errorText(error: unknown): string {
    if (error instanceof Error) return oneLine(error.message);
    if (typeof error === "string") return oneLine(error);
    if (typeof error === "object" && error !== null && "message" in error) {
        const message = (error as { readonly message?: unknown }).message;
        if (typeof message === "string") return oneLine(message);
    }
    return oneLine(String(error));
}

/**
 * Every rule, in order, first match wins.
 *
 * Ordered rather than a lookup because the strings overlap: Squirrel's signature complaint
 * mentions the file it downloaded, and a hash mismatch mentions the download too, so a
 * naive "contains download" rule would swallow both. The signature rules come first
 * because misreporting a tampered installer as a flaky network is the one mistake here
 * with a security consequence.
 */
const RULES: readonly {
    readonly code: UpdateFailureCode;
    readonly test: RegExp;
    readonly message: string;
    readonly retryable: boolean;
}[] = [
    {
        code: "invalid-signature",
        test: /authenticode|signature (?:is )?(?:not valid|invalid|could not be verified)|not (?:digitally )?signed|untrusted publisher/i,
        message:
            "The update was downloaded but it is not signed by the publisher this app expects, so it was not installed. " +
            "Nothing has changed on this machine. Download the update from the project's releases page instead.",
        retryable: false,
    },
    {
        code: "corrupt-asset",
        test: /hash (?:of |for )?.*(?:does not match|mismatch)|checksum|sha1 .*(?:mismatch|does not match)|corrupt|not a valid (?:nupkg|package|zip)|end of central directory/i,
        message:
            "The update downloaded, but the file that arrived is not the file the server said it would be, so it was " +
            "not installed. This is usually a download that was cut short and normally fixes itself on the next check.",
        retryable: true,
    },
    {
        code: "offline",
        test: /enotfound|eai_again|econnrefused|econnreset|etimedout|ehostunreach|enetunreach|network is unreachable|could not resolve host|dns/i,
        message:
            "The update server could not be reached, so this check found nothing. " +
            "That is normally the machine being offline; the app will try again by itself.",
        retryable: true,
    },
    {
        code: "feed-unavailable",
        test: /\b(?:404|403|500|502|503|504)\b|not found|forbidden|unauthori[sz]ed|internal server error|bad gateway|service unavailable|unexpected token|invalid json/i,
        message:
            "The update server answered, but not with a release list this app understands, so nothing was downloaded. " +
            "That is a problem at the server rather than on this machine.",
        retryable: true,
    },
    {
        code: "not-installed",
        test: /squirrel|update\.exe|no such file or directory.*update|can not find|cannot find the (?:file|path) specified|not installed/i,
        message:
            "This copy of the app was not installed by its installer, so it has no updater to run. " +
            "Install it with the setup program and updates will work from then on.",
        retryable: false,
    },
    {
        code: "staging-failed",
        test: /enospc|no space left|eacces|eperm|access is denied|disk (?:is )?full|read-only/i,
        message:
            "The update could not be written to disk, so it was not installed. " +
            "Check that this machine has free space and that the app's folder is writable.",
        retryable: true,
    },
];

/**
 * Turns whatever the updater threw into a failure the interface can render.
 *
 * Never throws, and never returns null: every error is *some* failure, and a code path
 * that silently drops one is a code path where the user sees a spinner forever.
 */
export function classifyUpdateFailure(error: unknown): UpdateFailure {
    const text = errorText(error);
    for (const rule of RULES) {
        if (rule.test.test(text)) {
            return {
                code: rule.code,
                message: rule.message,
                detail: text === "" ? null : text,
                retryable: rule.retryable,
            };
        }
    }
    return {
        code: "unknown",
        message:
            "The update check did not finish, and the reason it gave is not one this app recognises. " +
            "Nothing was installed and nothing has changed.",
        detail: text === "" ? null : text,
        retryable: true,
    };
}

/** A failure this app raised itself, rather than one the updater reported. */
export function updateFailure(
    code: UpdateFailureCode,
    message: string,
    options: { readonly detail?: string; readonly retryable?: boolean } = {},
): UpdateFailure {
    return {
        code,
        message,
        detail: options.detail === undefined ? null : oneLine(options.detail),
        retryable: options.retryable ?? true,
    };
}

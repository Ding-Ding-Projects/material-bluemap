/**
 * Keeping credentials out of everything the app says.
 *
 * A token leaks through the boring paths, not the interesting ones. Nobody writes
 * `console.log(token)`; what happens is that a request fails, the error carries the
 * request it was made for, the message ends up in a log file or a bug report, and the
 * token goes with it. `fetch` implementations differ in how much of a request they put
 * into a rejection, and a proxy in the middle can add its own text, so the safe
 * assumption is that any error string might contain the secret.
 *
 * So no error text in this module's callers is used raw. It goes through
 * {@link describeError}, which replaces the values it was told about and, as a second
 * line of defence, anything shaped like a GitHub credential even when nobody told it.
 * The second rule matters because the first only covers tokens this process knows: a
 * token pasted into the wrong field, or one belonging to another tool entirely, has
 * never passed through the store and would otherwise print in full.
 */

/** What a redacted value is replaced with. Fixed text, so it reads as deliberate. */
export const REDACTED = "[redacted]";

/**
 * Shapes GitHub issues credentials in.
 *
 * `ghp_` personal, `gho_` OAuth, `ghu_` user-to-server, `ghs_` server-to-server,
 * `ghr_` refresh, and the longer `github_pat_` fine-grained form. The length bounds are
 * deliberately loose: matching too much is harmless here, and matching too little is
 * the failure this exists to prevent.
 */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
    /gh[pousr]_[A-Za-z0-9]{16,}/g,
    /github_pat_[A-Za-z0-9_]{16,}/g,
];

/**
 * Below this length a "secret" is more likely to be a word that appears in ordinary
 * text than a credential, and replacing it would mangle the message without protecting
 * anything. Every real GitHub token is far longer than this.
 */
const MINIMUM_SECRET_LENGTH = 8;

/**
 * Removes known secrets, then anything credential-shaped, from a piece of text.
 *
 * Order matters: the explicit values go first so a token this process is holding is
 * removed whatever shape it has, including the device code, which is not a token but is
 * a bearer credential for the length of a sign-in.
 */
export function redactSecrets(
    text: string,
    secrets: readonly (string | null | undefined)[] = [],
): string {
    let result = text;

    for (const secret of secrets) {
        if (typeof secret !== "string") continue;
        const value = secret.trim();
        if (value.length < MINIMUM_SECRET_LENGTH) continue;
        result = result.split(value).join(REDACTED);
    }

    for (const pattern of CREDENTIAL_PATTERNS) {
        result = result.replace(pattern, REDACTED);
    }

    return result;
}

/**
 * One line of text describing a failure, with nothing secret left in it.
 *
 * The stack is deliberately not used. It rarely says anything the message does not, it
 * is the part most likely to carry a serialized request, and it is the part most likely
 * to be pasted into a public issue.
 */
export function describeError(
    error: unknown,
    secrets: readonly (string | null | undefined)[] = [],
): string {
    const raw =
        error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : safeStringify(error);
    return redactSecrets(raw, secrets);
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

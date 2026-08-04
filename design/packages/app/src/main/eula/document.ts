/**
 * Loading Mojang's EULA: fetch it, cache it, and never lie about which one you got.
 *
 * The app asks people to accept a licence. Until now it quoted BlueMap's four-line
 * summary of that licence and linked out to the document itself, which means the app
 * asked for agreement to something it never showed. This module is the other half:
 * the actual text, fetched from the address the consent record already stores.
 *
 * ## Three outcomes, three different sentences
 *
 * The whole design of the return type is that the interface can never accidentally
 * describe one outcome using another's words:
 *
 *  - **live** - fetched successfully just now. The viewer says "fetched at <time>".
 *  - **cache** - the fetch failed and a previous copy exists. The viewer says the fetch
 *    failed, says why, and says the copy on screen was fetched at <an older time>. It is
 *    never presented as current, because a licence can be revised and a stale copy that
 *    looks live is the one genuinely harmful thing this feature could do.
 *  - **unavailable** - the fetch failed and there is no copy. The caller (the renderer)
 *    falls back to the wording BlueMap itself quotes, labelled as a quotation from
 *    BlueMap rather than as Mojang's document.
 *
 * There is deliberately no fourth outcome where a failure quietly becomes a success.
 *
 * ## Bounded, and no credentials
 *
 * A public legal document needs no authentication, so nothing here sends any, and the
 * response is capped: a redirect loop or a hostile response is not allowed to grow the
 * main process's memory without limit. The request carries an explicit timeout because
 * the alternative - an interface element that spins until the operating system gives up
 * - is indistinguishable from a hang.
 */

import { readCachedEula, writeCachedEula, type CachedEula } from "./cache.js";
import { extractDocumentText, looksLikeTheEula } from "./text.js";

/** The subset of `fetch` used, so a test hands in a function rather than a server. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Longest response body this build will read. Comfortably larger than the licence. */
export const MAX_RESPONSE_BYTES = 2_000_000;

/** How long a single attempt is given before it is reported as a timeout. */
export const FETCH_TIMEOUT_MS = 15_000;

/**
 * How old a cached copy may be before a load tries the network again.
 *
 * Seven days rather than every launch: the document changes rarely, and a legal page
 * fetched on every start of a desktop app is a request nobody asked for. A load that is
 * explicitly refreshed by the user ignores this entirely.
 */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type EulaSource = "live" | "cache";

export interface EulaDocumentReadout {
    readonly source: EulaSource;
    readonly text: string;
    readonly documentUrl: string;
    /** ISO-8601 UTC. When this exact text was fetched, never when it was displayed. */
    readonly fetchedAt: string;
    readonly characters: number;
}

export type EulaLoadResult =
    | { readonly ok: true; readonly document: EulaDocumentReadout }
    | {
          readonly ok: false;
          /** Plain-language reason, safe to show. Never a stack trace. */
          readonly reason: string;
          /** A previous copy, when one survives. Always labelled as cached by the caller. */
          readonly cached: EulaDocumentReadout | null;
      };

export interface LoadEulaOptions {
    readonly fetch: FetchLike;
    /** Where the cache file lives. `app.getPath("userData")` in the running app. */
    readonly dataDirectory: string;
    /** The document address. Comes from `MOJANG_EULA_URL`; never a second literal. */
    readonly documentUrl: string;
    /** True to go to the network even when the cache is fresh. */
    readonly refresh?: boolean;
    readonly now?: () => Date;
    readonly maxAgeMs?: number;
    readonly timeoutMs?: number;
}

function describe(error: unknown): string {
    if (error instanceof Error) {
        if (error.name === "AbortError" || error.name === "TimeoutError") {
            return "Mojang's server did not answer in time.";
        }
        return error.message;
    }
    return String(error);
}

function asReadout(cached: CachedEula, source: EulaSource): EulaDocumentReadout {
    return {
        source,
        text: cached.text,
        documentUrl: cached.documentUrl,
        fetchedAt: cached.fetchedAt,
        characters: cached.text.length,
    };
}

/**
 * Reads a response body, refusing anything longer than {@link MAX_RESPONSE_BYTES}.
 *
 * `response.text()` would happily buffer whatever the far end sends, and the far end is
 * not under our control. The cap is checked while reading rather than after, because a
 * check after the fact has already paid the cost it exists to avoid.
 */
async function readBounded(response: Response): Promise<string> {
    const body = response.body;
    if (body === null) return await response.text();

    const decoder = new TextDecoder("utf-8");
    const reader = body.getReader();
    let seen = 0;
    let text = "";
    for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        seen += chunk.value.byteLength;
        if (seen > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error(
                `The page at that address is larger than ${String(MAX_RESPONSE_BYTES)} bytes, ` +
                    "which the licence is not. It was not read.",
            );
        }
        text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
}

/**
 * The EULA, from the network or from the cache, with the failure stated when there is one.
 *
 * A fresh-enough cached copy short-circuits the network entirely and is reported as
 * `source: "cache"` with its original timestamp, not as a live fetch. That distinction is
 * the only reason this function does not simply return a string.
 */
export async function loadEulaDocument(options: LoadEulaOptions): Promise<EulaLoadResult> {
    const now = options.now ?? ((): Date => new Date());
    const maxAgeMs = options.maxAgeMs ?? CACHE_MAX_AGE_MS;
    const cached = readCachedEula(options.dataDirectory, options.documentUrl);

    if (cached !== null && options.refresh !== true) {
        const age = now().getTime() - new Date(cached.fetchedAt).getTime();
        // A negative age means the clock moved backwards or the file was hand-edited into
        // the future. Treated as stale rather than as infinitely fresh, because the
        // failure of the other choice is a copy that never refreshes again.
        if (age >= 0 && age < maxAgeMs) return { ok: true, document: asReadout(cached, "cache") };
    }

    let html: string;
    try {
        const response = await options.fetch(options.documentUrl, {
            redirect: "follow",
            headers: { accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
            signal: AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
            return {
                ok: false,
                reason: `Mojang's server answered ${String(response.status)} ${response.statusText}.`,
                cached: cached === null ? null : asReadout(cached, "cache"),
            };
        }
        html = await readBounded(response);
    } catch (error) {
        return {
            ok: false,
            reason: describe(error),
            cached: cached === null ? null : asReadout(cached, "cache"),
        };
    }

    const text = extractDocumentText(html);
    const verdict = looksLikeTheEula(text);
    if (!verdict.ok) {
        // The response arrived and was not the document. Reporting this as a success with
        // odd-looking content is exactly how somebody ends up reading a cookie banner and
        // believing it was a licence.
        return {
            ok: false,
            reason: verdict.reason ?? "The page at that address did not look like the licence.",
            cached: cached === null ? null : asReadout(cached, "cache"),
        };
    }

    const stored = writeCachedEulaSafely(options.dataDirectory, {
        text,
        documentUrl: options.documentUrl,
        fetchedAt: now().toISOString(),
        characters: text.length,
    });

    return { ok: true, document: asReadout(stored, "live") };
}

/**
 * Writes the cache, and carries on when the write fails.
 *
 * A read-only or full data directory must not stop somebody reading the licence they
 * have just successfully downloaded. The only consequence of a failed write is that the
 * next launch fetches again, which is not worth failing the operation the user asked for.
 */
function writeCachedEulaSafely(dataDirectory: string, document: CachedEula): CachedEula {
    try {
        return writeCachedEula(dataDirectory, document);
    } catch {
        return document;
    }
}

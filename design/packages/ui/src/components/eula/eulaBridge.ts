/**
 * Asking the main process for Mojang's EULA, and being honest about what came back.
 *
 * Three things can be on screen, and the controller keeps them apart so no component can
 * accidentally describe one with another's words:
 *
 *  - **live** - fetched from Mojang just now, with the time it happened;
 *  - **cache** - a copy the app fetched earlier and kept, with the time *it* happened.
 *    Shown when the network is unavailable or when the copy is still fresh. It is never
 *    described as current, because a licence can be revised and a stale copy presented as
 *    live is the single genuinely harmful thing this feature could do;
 *  - **fallback** - nothing could be fetched and nothing was cached, so what is on screen
 *    is the four lines BlueMap itself quotes, labelled as a quotation from BlueMap rather
 *    than as Mojang's document.
 *
 * The fallback is the reason `source` is a string rather than a boolean. "We have a
 * document" and "we have *the* document" are different claims and the viewer makes
 * different sentences out of them.
 *
 * ## The bridge method is optional, and its absence is not an error
 *
 * A browser build has no main process, so there is nothing to fetch with and nothing to
 * cache into. That is the same shape as `OptionalStorageBridge` in the setup flow: the
 * method is probed, its absence puts the controller straight into the fallback state with
 * a sentence saying why, and nothing throws. A build that gains the method later needs no
 * change here.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { CONSENT_QUOTE, MOJANG_EULA_URL } from "../setup/setupStrings.js";

/** Where the text on screen came from. */
export type EulaTextSource = "live" | "cache" | "fallback";

/** Mirrors `EulaDocumentReadout` in the main process, structurally. */
export interface EulaDocumentLike {
    source: "live" | "cache";
    text: string;
    documentUrl: string;
    /** ISO-8601. When this text was fetched, never when it was displayed. */
    fetchedAt: string;
    characters: number;
}

export type EulaLoadResultLike =
    | { ok: true; document: EulaDocumentLike }
    | { ok: false; reason: string; cached: EulaDocumentLike | null };

/**
 * The half of the preload this viewer uses.
 *
 * A structural interface rather than a reference to the ambient bridge type, so a test
 * hands in a plain object and this module compiles in a build with no preload at all.
 */
export interface EulaBridge {
    readEulaDocument?: (request: { refresh: boolean }) => Promise<EulaLoadResultLike>;
}

export function resolveEulaBridge(): EulaBridge | null {
    const host = globalThis as { materialBluemap?: EulaBridge };
    return host.materialBluemap ?? null;
}

/**
 * The wording BlueMap itself quotes, used only when Mojang's document cannot be had.
 *
 * Not a substitute for the licence and never labelled as one. It is what the rest of this
 * application has always shown, it is upstream's own summary of the same terms, and the
 * viewer prints a line above it saying exactly that.
 */
export const FALLBACK_TEXT: string = CONSENT_QUOTE.join("\n\n");

export interface EulaState {
    readonly source: EulaTextSource;
    readonly text: string;
    readonly documentUrl: string;
    /** ISO-8601, or null for the fallback, which was never fetched from anywhere. */
    readonly fetchedAt: string | null;
    /** Why the live document is not on screen. Null when it is. */
    readonly failure: string | null;
}

export interface EulaController {
    readonly state: Ref<EulaState>;
    readonly busy: Ref<boolean>;
    /** True when this build can fetch at all. False in a browser tab. */
    readonly available: boolean;
    /** True when what is on screen is Mojang's own text, live or cached. */
    readonly isTheDocument: ComputedRef<boolean>;
    load(options?: { refresh?: boolean }): Promise<void>;
}

export interface EulaControllerOptions {
    bridge?: EulaBridge | null;
}

/** The state a build with no way to fetch starts and stays in. */
export function unavailableState(reason: string): EulaState {
    return {
        source: "fallback",
        text: FALLBACK_TEXT,
        documentUrl: MOJANG_EULA_URL,
        fetchedAt: null,
        failure: reason,
    };
}

function describe(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

/**
 * Reads a result that crossed the bridge without trusting its shape.
 *
 * The value comes from another process through structured cloning, and a build mismatch
 * is a real possibility rather than a theoretical one. A result this function cannot read
 * becomes a failure with a sentence, not a document with missing fields - a viewer
 * rendering `undefined` where the fetch time should be is worse than one saying it does
 * not know.
 */
export function interpretResult(result: unknown, previous: EulaState): EulaState {
    if (typeof result !== "object" || result === null) {
        return { ...unavailableState("The document request returned nothing this build can read."), ...keepText(previous) };
    }

    const value = result as Partial<EulaLoadResultLike> & Record<string, unknown>;

    if (value.ok === true) {
        const document = value["document"];
        const readable = readDocument(document);
        if (readable === null) {
            return {
                ...unavailableState("The document request succeeded but carried no readable text."),
                ...keepText(previous),
            };
        }
        return {
            source: readable.source,
            text: readable.text,
            documentUrl: readable.documentUrl,
            fetchedAt: readable.fetchedAt,
            failure: null,
        };
    }

    const reason =
        typeof value["reason"] === "string" && value["reason"].trim().length > 0
            ? value["reason"]
            : "Mojang's document could not be fetched.";

    const cached = readDocument(value["cached"]);
    if (cached !== null) {
        // A copy exists. It goes on screen, and `source` stays "cache" with the failure
        // beside it, so the viewer says "this is the copy from <date>, and here is why it
        // is not newer" rather than presenting an old licence as the current one.
        return {
            source: "cache",
            text: cached.text,
            documentUrl: cached.documentUrl,
            fetchedAt: cached.fetchedAt,
            failure: reason,
        };
    }

    return unavailableState(reason);
}

/** Keeps a document already on screen rather than replacing it with the fallback. */
function keepText(previous: EulaState): Partial<EulaState> {
    if (previous.source === "fallback") return {};
    return { source: previous.source, text: previous.text, fetchedAt: previous.fetchedAt };
}

function readDocument(value: unknown): EulaDocumentLike | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const text = record["text"];
    const fetchedAt = record["fetchedAt"];
    if (typeof text !== "string" || text.trim().length === 0) return null;
    if (typeof fetchedAt !== "string" || Number.isNaN(new Date(fetchedAt).getTime())) return null;
    const url = record["documentUrl"];
    const source = record["source"];
    return {
        source: source === "live" ? "live" : "cache",
        text,
        documentUrl: typeof url === "string" && url.length > 0 ? url : MOJANG_EULA_URL,
        fetchedAt,
        characters: text.length,
    };
}

export function createEulaController(options: EulaControllerOptions = {}): EulaController {
    const bridge = options.bridge !== undefined ? options.bridge : resolveEulaBridge();
    const read = bridge?.readEulaDocument;
    const available = typeof read === "function";

    const state = ref<EulaState>(
        available
            ? unavailableState("The document has not been fetched yet.")
            : unavailableState(
                  "This build has no way to fetch Mojang's document, so the wording BlueMap quotes is shown instead.",
              ),
    );
    const busy = ref(false);

    async function load(loadOptions: { refresh?: boolean } = {}): Promise<void> {
        if (!available || read === undefined || busy.value) return;
        busy.value = true;
        try {
            const result = await read({ refresh: loadOptions.refresh === true });
            state.value = interpretResult(result, state.value);
        } catch (error) {
            // A rejected invoke. The failure is stated and whatever is already on screen
            // stays there rather than being replaced with a blank panel.
            state.value = { ...state.value, failure: describe(error) };
        } finally {
            busy.value = false;
        }
    }

    return {
        state,
        busy,
        available,
        isTheDocument: computed(() => state.value.source !== "fallback"),
        load,
    };
}

/**
 * "4 August 2026 at 09:14" from the stored ISO timestamp, in the viewer's locale.
 *
 * Shares its shape with `formatConsentTimestamp` in the setup flow, including the
 * underscore-to-hyphen repair for BlueMap's own locale names, because `Intl` throws a
 * RangeError on `zh_cn` and a viewer that cannot say when it fetched something has lost
 * the fact that matters most about a cached copy.
 */
export function formatFetchedAt(iso: string | null, locale: string): string | null {
    if (iso === null) return null;
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) return null;
    try {
        return new Intl.DateTimeFormat(locale.replace(/_/g, "-"), {
            dateStyle: "long",
            timeStyle: "short",
        }).format(when);
    } catch {
        return when.toISOString();
    }
}

/**
 * The state one search bar and its builder share.
 *
 * Every search field owns exactly one model, and every builder is opened against the model of the
 * field that opened it. Two fields never share a model, so a pattern typed in one cannot leak into
 * another. That is the whole reason this is a class with an id rather than a module singleton.
 *
 * Synchronisation rules, which the tests pin down:
 *
 *   - `query` is the literal text. It only changes when the visitor edits the field in plain text
 *     mode, or when a caller sets it. Switching modes never rewrites it, so returning to plain
 *     text always restores exactly what was typed.
 *   - `pattern` is the regular expression source. Entering regex mode seeds it from the literal,
 *     escaped, so opting into regex does not silently change what the field matches. Once the
 *     visitor edits the pattern it is theirs and is kept as long as the literal has not moved on.
 *   - `flags` and the Match case checkbox are one value seen two ways: Match case is the absence
 *     of the `i` flag, in both directions.
 *   - Validation is recomputed on every change. An invalid pattern matches nothing and says so; it
 *     never leaves the previous pattern's results standing.
 */

import { REGEX_LIMITS, SUPPORTED_FLAGS, escapeRegExp, findBacktrackingRisk } from "./engine.js";
import type { SupportedFlag } from "./engine.js";
import { searchPreferenceStore } from "./preferences.js";
import type { SearchPreferenceStore } from "./preferences.js";

export type SearchMode = "text" | "regex";

export type ValidationStatus = "empty" | "valid" | "invalid";

export type BacktrackingRisk = "nested-quantifier" | "alternation-loop";

export interface SearchValidation {
    readonly status: ValidationStatus;
    /** The engine's own message when the pattern will not compile, otherwise `null`. */
    readonly message: string | null;
    /** An advisory warning about backtracking shapes, otherwise `null`. */
    readonly risk: BacktrackingRisk | null;
}

export interface SearchQuerySnapshot {
    readonly fieldId: string;
    readonly mode: SearchMode;
    readonly query: string;
    readonly pattern: string;
    readonly flags: string;
    readonly caseSensitive: boolean;
    readonly validation: SearchValidation;
    /** What the search input shows: the literal in plain text mode, the pattern in regex mode. */
    readonly fieldValue: string;
}

/** What a surface should actually do with this field right now. */
export type EffectiveQuery =
    | { readonly kind: "empty" }
    | { readonly kind: "text"; readonly query: string; readonly caseSensitive: boolean }
    | { readonly kind: "regex"; readonly pattern: string; readonly flags: string }
    | { readonly kind: "invalid"; readonly message: string };

export interface SearchQueryModelOptions {
    /** Stable identifier. Used for the accessible relationship ids and for preference storage. */
    readonly fieldId: string;
    readonly initialMode?: SearchMode | undefined;
    readonly initialQuery?: string | undefined;
    readonly initialFlags?: string | undefined;
    /** Set to false for fields whose mode and flags should not be remembered. */
    readonly persist?: boolean | undefined;
    readonly store?: SearchPreferenceStore | undefined;
}

const DEFAULT_FLAGS = "giu";

function normaliseFlags(flags: string): string {
    let out = "";
    for (const flag of SUPPORTED_FLAGS) {
        if (flags.includes(flag)) {
            out += flag;
        }
    }
    // The u and v flags are mutually exclusive. Keep v, which is the newer superset, if both came
    // in together, and never hand an impossible pair to the engine.
    if (out.includes("u") && out.includes("v")) {
        out = out.replace("u", "");
    }
    return out;
}

export class SearchQueryModel {
    readonly fieldId: string;

    private mode: SearchMode;
    private query: string;
    private pattern: string;
    private flags: string;
    /** The literal the current pattern was seeded from, so a stale seed can be spotted. */
    private patternSeededFrom: string | null;
    private validation: SearchValidation;
    private readonly listeners = new Set<(snapshot: SearchQuerySnapshot) => void>();
    private readonly persist: boolean;
    private readonly store: SearchPreferenceStore;

    constructor(options: SearchQueryModelOptions) {
        this.fieldId = options.fieldId;
        this.persist = options.persist ?? true;
        this.store = options.store ?? searchPreferenceStore();

        const stored = this.persist ? this.store.read(this.fieldId) : null;
        this.mode = options.initialMode ?? stored?.mode ?? "text";
        this.query = options.initialQuery ?? "";
        this.flags = normaliseFlags(options.initialFlags ?? stored?.flags ?? DEFAULT_FLAGS);
        this.pattern = escapeRegExp(this.query);
        this.patternSeededFrom = this.query;
        this.validation = this.computeValidation();
    }

    snapshot(): SearchQuerySnapshot {
        return {
            fieldId: this.fieldId,
            mode: this.mode,
            query: this.query,
            pattern: this.pattern,
            flags: this.flags,
            caseSensitive: !this.flags.includes("i"),
            validation: this.validation,
            fieldValue: this.mode === "text" ? this.query : this.pattern,
        };
    }

    subscribe(listener: (snapshot: SearchQuerySnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Route an edit of the search input to the value that mode is showing. */
    setFieldValue(value: string): void {
        if (this.mode === "text") {
            this.setQuery(value);
        } else {
            this.setPattern(value);
        }
    }

    setQuery(query: string): void {
        if (this.query === query) {
            return;
        }
        this.query = query;
        if (this.mode === "text") {
            // Keep the pattern equivalent to the literal so opening the builder shows a pattern
            // that matches exactly what the field matches right now.
            this.pattern = escapeRegExp(query);
            this.patternSeededFrom = query;
        }
        this.changed();
    }

    setPattern(pattern: string): void {
        if (this.pattern === pattern) {
            return;
        }
        this.pattern = pattern;
        // The pattern is now the visitor's own work, aligned with the literal as it stands.
        this.patternSeededFrom = this.query;
        this.changed();
    }

    setMode(mode: SearchMode): void {
        if (this.mode === mode) {
            return;
        }
        this.mode = mode;
        if (mode === "regex" && this.patternSeededFrom !== this.query) {
            this.pattern = escapeRegExp(this.query);
            this.patternSeededFrom = this.query;
        }
        this.rememberPreference();
        this.changed();
    }

    setFlags(flags: string): void {
        const next = normaliseFlags(flags);
        if (this.flags === next) {
            return;
        }
        this.flags = next;
        this.rememberPreference();
        this.changed();
    }

    setFlag(flag: SupportedFlag, on: boolean): void {
        let next = on
            ? this.flags.includes(flag)
                ? this.flags
                : `${this.flags}${flag}`
            : this.flags.split(flag).join("");
        // Turning on one of the Unicode flags turns the other off; they cannot coexist.
        if (on && flag === "u") {
            next = next.split("v").join("");
        }
        if (on && flag === "v") {
            next = next.split("u").join("");
        }
        this.setFlags(next);
    }

    /** Match case is the absence of the `i` flag, in both directions. */
    setCaseSensitive(caseSensitive: boolean): void {
        this.setFlag("i", !caseSensitive);
    }

    /** Clear the query and the pattern without touching mode or flags. */
    clear(): void {
        if (this.query === "" && this.pattern === "") {
            return;
        }
        this.query = "";
        this.pattern = "";
        this.patternSeededFrom = "";
        this.changed();
    }

    /** Back to the shipped defaults, including mode and flags. */
    reset(): void {
        this.mode = "text";
        this.query = "";
        this.pattern = "";
        this.patternSeededFrom = "";
        this.flags = DEFAULT_FLAGS;
        this.rememberPreference();
        this.changed();
    }

    /** What the surface should run right now. */
    effectiveQuery(): EffectiveQuery {
        if (this.mode === "text") {
            if (this.query === "") {
                return { kind: "empty" };
            }
            return { kind: "text", query: this.query, caseSensitive: !this.flags.includes("i") };
        }
        if (this.pattern === "") {
            return { kind: "empty" };
        }
        if (this.validation.status === "invalid") {
            return { kind: "invalid", message: this.validation.message ?? "" };
        }
        return { kind: "regex", pattern: this.pattern, flags: this.flags };
    }

    /** The pattern and flags as they would be written in JavaScript source. */
    toLiteral(): string {
        return `/${this.pattern === "" ? "(?:)" : this.pattern}/${this.flags}`;
    }

    private computeValidation(): SearchValidation {
        if (this.mode === "text") {
            return { status: this.query === "" ? "empty" : "valid", message: null, risk: null };
        }
        if (this.pattern === "") {
            return { status: "empty", message: null, risk: null };
        }
        if (this.pattern.length > REGEX_LIMITS.maxPatternLength) {
            return {
                status: "invalid",
                message: `Pattern exceeds ${REGEX_LIMITS.maxPatternLength} characters.`,
                risk: null,
            };
        }
        try {
            // Compiling is safe on this thread. Matching is what backtracks, and that only ever
            // happens inside the worker.
            new RegExp(this.pattern, this.flags);
        } catch (error) {
            return {
                status: "invalid",
                message: error instanceof Error ? error.message : String(error),
                risk: null,
            };
        }
        const risk = findBacktrackingRisk(this.pattern);
        return {
            status: "valid",
            message: null,
            risk: risk === "nested-quantifier" || risk === "alternation-loop" ? risk : null,
        };
    }

    private rememberPreference(): void {
        if (!this.persist) {
            return;
        }
        this.store.write(this.fieldId, { mode: this.mode, flags: this.flags });
    }

    private changed(): void {
        this.validation = this.computeValidation();
        const snapshot = this.snapshot();
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }
}

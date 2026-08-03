/**
 * The one funnel every search surface runs a query through.
 *
 * Plain text is matched here on the calling thread, because a fully escaped literal cannot
 * backtrack. A visitor-written pattern is never matched here: it goes to the bounded evaluator, is
 * given a deadline, and comes back as a reported outcome. An invalid pattern returns `invalid` and
 * no hits, so a surface can never keep showing the previous pattern's results as if they were
 * current.
 */

import type { BoundedRegexEvaluator } from "./evaluator.js";
import { createPlainTextMatcher } from "./predicate.js";
import type { MatchSpan } from "./predicate.js";
import type { EffectiveQuery } from "./queryModel.js";

export interface CandidateHitResult {
    /** Index into the candidate array that was submitted. */
    readonly index: number;
    readonly span: MatchSpan | null;
}

export type SearchOutcome =
    /** No query. Every surface shows its full list rather than an empty one. */
    | { readonly status: "all" }
    | { readonly status: "ok"; readonly hits: readonly CandidateHitResult[] }
    | { readonly status: "invalid"; readonly message: string }
    | { readonly status: "timeout"; readonly limitMs: number }
    | { readonly status: "limit"; readonly message: string }
    | { readonly status: "unavailable"; readonly message: string };

export async function runSearch(
    query: EffectiveQuery,
    candidates: readonly string[],
    evaluator: BoundedRegexEvaluator,
): Promise<SearchOutcome> {
    if (query.kind === "empty") {
        return { status: "all" };
    }
    if (query.kind === "invalid") {
        return { status: "invalid", message: query.message };
    }
    if (query.kind === "text") {
        const matcher = createPlainTextMatcher(query.query, query.caseSensitive);
        const hits: CandidateHitResult[] = [];
        for (let index = 0; index < candidates.length; index += 1) {
            const span = matcher.firstSpan(candidates[index] ?? "");
            if (span !== null) {
                hits.push({ index, span });
            }
        }
        return { status: "ok", hits };
    }

    const outcome = await evaluator.filter(query.pattern, query.flags, candidates);
    switch (outcome.status) {
        case "ok":
            return {
                status: "ok",
                hits: outcome.result.hits.map((hit) => ({
                    index: hit.index,
                    span: { start: hit.start, end: hit.end },
                })),
            };
        case "invalid":
            return { status: "invalid", message: outcome.message };
        case "limit":
            return { status: "limit", message: outcome.message };
        case "timeout":
            return { status: "timeout", limitMs: outcome.limitMs };
        default:
            return { status: "unavailable", message: outcome.message };
    }
}

/** One searchable piece of text belonging to one item. */
export interface CandidateOwner<TField extends string> {
    readonly itemIndex: number;
    readonly field: TField;
}

export interface CandidateIndex<TField extends string> {
    readonly values: string[];
    readonly owners: CandidateOwner<TField>[];
}

export interface CandidateField<TItem, TField extends string> {
    readonly name: TField;
    readonly get: (item: TItem) => string | undefined;
}

/**
 * Flatten a list of items into the candidate array the evaluator takes, remembering which item and
 * which field each entry came from. Field order is priority order: the first field that matched is
 * the one a result row reports.
 */
export function buildCandidateIndex<TItem, TField extends string>(
    items: readonly TItem[],
    fields: readonly CandidateField<TItem, TField>[],
): CandidateIndex<TField> {
    const values: string[] = [];
    const owners: CandidateOwner<TField>[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const item = items[itemIndex];
        if (item === undefined) {
            continue;
        }
        for (const field of fields) {
            const value = field.get(item);
            if (value === undefined || value === "") {
                continue;
            }
            values.push(value);
            owners.push({ itemIndex, field: field.name });
        }
    }
    return { values, owners };
}

export interface ResolvedHit<TField extends string> {
    readonly itemIndex: number;
    readonly field: TField;
    readonly span: MatchSpan | null;
    /** The candidate string that matched, so a caller can build an excerpt from it. */
    readonly value: string;
}

/**
 * Collapse candidate hits back to one hit per item, keeping the highest priority field that
 * matched. Item order is preserved so results do not jump around between keystrokes.
 */
export function resolveHits<TField extends string>(
    index: CandidateIndex<TField>,
    fieldOrder: readonly TField[],
    hits: readonly CandidateHitResult[],
): ResolvedHit<TField>[] {
    const priority = new Map<TField, number>();
    fieldOrder.forEach((field, order) => priority.set(field, order));

    const best = new Map<number, ResolvedHit<TField>>();
    for (const hit of hits) {
        const owner = index.owners[hit.index];
        if (owner === undefined) {
            continue;
        }
        const candidate: ResolvedHit<TField> = {
            itemIndex: owner.itemIndex,
            field: owner.field,
            span: hit.span,
            value: index.values[hit.index] ?? "",
        };
        const existing = best.get(owner.itemIndex);
        if (
            existing === undefined ||
            (priority.get(candidate.field) ?? 0) < (priority.get(existing.field) ?? 0)
        ) {
            best.set(owner.itemIndex, candidate);
        }
    }

    return [...best.values()].sort((left, right) => left.itemIndex - right.itemIndex);
}

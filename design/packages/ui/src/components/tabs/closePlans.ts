/**
 * Closing many tabs at once, and proving beforehand exactly which ones.
 *
 * ### One predicate, used twice
 *
 * "Close tabs containing text" and "Close tabs not containing text" are not two
 * features. They are one predicate and its negation, and the contract is blunt
 * about why that has to be literally true in the code: two implementations drift
 * on case, on Unicode, on which flags are honoured, and the day they disagree a
 * pair of actions that a user reasonably believes are exhaustive quietly leaves
 * tabs untouched by both. So {@link planTextClose} takes one
 * {@link SettingMatcher} and one `direction`, applies the same `matcher.test` to
 * the same eligible set, and only flips the sign. There is no second matcher to
 * get out of step with the first.
 *
 * The unit test proves the partition rather than trusting the shape: for any
 * query, in either mode, `containing` and `notContaining` are disjoint and
 * together cover every eligible tab.
 *
 * ### Nothing closes until the plan has been read
 *
 * Every function here returns a plan and closes nothing. The plan says what the
 * matching mode is, which tabs are in scope, which will close, which were
 * protected for being pinned, and which hold unsaved work - all before a single
 * tab goes. That is what the reviewable preview renders, and because the preview
 * *is* the plan rather than a second calculation of it, the preview and the
 * close cannot disagree about the count.
 *
 * A plan with an empty query or a pattern that will not compile closes nothing
 * at all. It is not merely disabled in the interface: `selected` is empty, so
 * even a caller that ignored `runnable` would close nothing.
 *
 * ### Protected and failed tabs are named, never silently dropped
 *
 * Pinned tabs are out of scope unless the user says otherwise, and the plan
 * lists them by name so the preview can show what the protection saved. Tabs
 * holding unsaved work are listed separately: they matched, they are not
 * protected, and closing them is a decision somebody has to make rather than a
 * side effect of a text query. {@link applyClosePlan} reports what it actually
 * closed and what it kept, so a partial result can never be reported as a whole
 * one.
 */

import type { SettingMatcher } from "../config/regexEngine.js";
import { closeTabs, removeGroup, type TabGroup, type TabStripState } from "./tabModel.js";
import type { TabHit } from "./tabSearch.js";
import { searchStripTabs } from "./tabSearch.js";

/** Which of the five bulk closes a plan is for. */
export type ClosePlanKind = "containing" | "notContaining" | "others" | "toStart" | "toEnd";

/** Why a plan will close nothing, when the reason is the query rather than the tabs. */
export type ClosePlanRefusal = "empty-query" | "invalid-pattern";

/** A tab that matched the shape of the action but is being held back, and why. */
export interface HeldTab {
    readonly hit: TabHit;
    readonly reason: "pinned" | "unsaved";
}

/**
 * Which tabs an action was aimed at, before the pinned rule narrows it further.
 *
 * The contract requires a preview to state whether it applies to the current
 * group or to the whole strip, and requires that a scoped action never quietly
 * crosses a group boundary. Carrying the scope on the plan is what makes both
 * true at once: the preview reads the scope rather than being told separately by
 * whichever surface opened it, so the sentence on screen and the set being
 * closed come from the same place.
 */
export type ClosePlanScope =
    | { readonly kind: "strip" }
    | { readonly kind: "group"; readonly groupId: string; readonly groupName: string };

export interface TabClosePlan {
    readonly kind: ClosePlanKind;
    /** Null for the actions that take no query, which is how a preview knows not to claim one. */
    readonly mode: "text" | "regex" | null;
    readonly query: string;
    readonly scope: ClosePlanScope;
    readonly includePinned: boolean;
    /** The tabs the predicate was applied to, after the pinned rule. */
    readonly eligible: readonly TabHit[];
    /** The tabs that will close once the plan is applied. */
    readonly selected: readonly TabHit[];
    /** Pinned tabs kept out of scope, named so the preview can show what was protected. */
    readonly protectedPinned: readonly HeldTab[];
    /** Selected tabs that hold unsaved work, which the confirmation has to mention. */
    readonly unsaved: readonly HeldTab[];
    readonly refusal: ClosePlanRefusal | null;
    /** The compile error, so an invalid pattern is visible rather than silently empty. */
    readonly patternError: string | null;
    /** True when applying the plan would actually close something. */
    readonly runnable: boolean;
}

function held(hits: readonly TabHit[], reason: HeldTab["reason"]): readonly HeldTab[] {
    return hits.map((hit) => ({ hit, reason }));
}

/** Every tab of a strip as a hit, which is the shape the plans report in. */
function allHits(strip: TabStripState): readonly TabHit[] {
    return searchStripTabs(strip, { test: () => true, error: null, active: false });
}

/**
 * Splits a strip's tabs into what the action may touch and what it may not.
 *
 * The pinned rule lives here, once, so every one of the five actions applies it
 * identically. "Excluded by default, included only on an explicit choice" is the
 * contract's wording and it is the same sentence for a text close as for a
 * close-others.
 *
 * Unsaved work is deliberately not part of this split. Holding work does not put
 * a tab out of scope - it makes closing that tab a decision somebody has to
 * make - so those tabs stay eligible and are listed separately on the plan.
 */
function scopeFor(
    strip: TabStripState,
    includePinned: boolean,
    scope: ClosePlanScope,
): { eligible: readonly TabHit[]; protectedPinned: readonly HeldTab[] } {
    const all = scope.kind === "strip" ? allHits(strip) : allHits(strip).filter((hit) => hit.groupId === scope.groupId);
    if (includePinned) return { eligible: all, protectedPinned: [] };
    return {
        eligible: all.filter((hit) => !hit.pinned),
        protectedPinned: held(
            all.filter((hit) => hit.pinned),
            "pinned",
        ),
    };
}

/** Names the scope, so a caller passes a group id and gets the group's name on the plan. */
function scopeOf(strip: TabStripState, groupId: string | null): ClosePlanScope {
    if (groupId === null) return { kind: "strip" };
    const group = strip.groups.find((candidate) => candidate.id === groupId);
    return group === undefined
        ? { kind: "strip" }
        : { kind: "group", groupId: group.id, groupName: group.name };
}

/** The ids of tabs whose close would lose work, looked up once per plan. */
function dirtySet(strip: TabStripState): ReadonlySet<string> {
    return new Set(strip.tabs.filter((tab) => tab.dirty).map((tab) => tab.id));
}

/** Assembles the plan, so every action reports the same fields the same way. */
function finish(parts: {
    readonly kind: ClosePlanKind;
    readonly mode: "text" | "regex" | null;
    readonly query: string;
    readonly scope: ClosePlanScope;
    readonly includePinned: boolean;
    readonly eligible: readonly TabHit[];
    readonly selected: readonly TabHit[];
    readonly protectedPinned: readonly HeldTab[];
    readonly dirty: ReadonlySet<string>;
    readonly refusal: ClosePlanRefusal | null;
    readonly patternError: string | null;
}): TabClosePlan {
    const chosen = parts.refusal === null ? parts.selected : [];
    return {
        kind: parts.kind,
        mode: parts.mode,
        query: parts.query,
        scope: parts.scope,
        includePinned: parts.includePinned,
        eligible: parts.eligible,
        selected: chosen,
        protectedPinned: parts.protectedPinned,
        unsaved: held(
            chosen.filter((hit) => parts.dirty.has(hit.tabId)),
            "unsaved",
        ),
        refusal: parts.refusal,
        patternError: parts.patternError,
        runnable: parts.refusal === null && chosen.length > 0,
    };
}

/**
 * The two text actions, from one matcher.
 *
 * `matcher` is built by the calling field from its own query, mode and flags -
 * the same `createSettingMatcher` every search bar in this application uses - and
 * is handed here whole. Nothing in this function knows what mode it is in beyond
 * labelling the preview, which is precisely why the two directions cannot end up
 * with different ideas about case or Unicode.
 */
export function planTextClose(
    strip: TabStripState,
    options: {
        readonly direction: "containing" | "notContaining";
        readonly query: string;
        readonly regexMode: boolean;
        readonly matcher: SettingMatcher;
        readonly includePinned: boolean;
        /** Null for the whole strip, or a group id to keep the action inside it. */
        readonly groupId?: string | null;
    },
): TabClosePlan {
    const dirty = dirtySet(strip);
    const scope = scopeOf(strip, options.groupId ?? null);
    const { eligible, protectedPinned } = scopeFor(strip, options.includePinned, scope);
    const mode = options.regexMode ? "regex" : "text";

    const refusal: ClosePlanRefusal | null =
        options.query.trim() === ""
            ? "empty-query"
            : options.matcher.error !== null
              ? "invalid-pattern"
              : null;

    const selected = eligible.filter((hit) => {
        const matched = options.matcher.test(hit.label);
        return options.direction === "containing" ? matched : !matched;
    });

    return finish({
        kind: options.direction,
        mode,
        query: options.query,
        scope,
        includePinned: options.includePinned,
        eligible,
        selected,
        protectedPinned,
        dirty,
        refusal,
        patternError: options.matcher.error,
    });
}

/** Close every tab but this one, under the same pinned and unsaved rules. */
export function planCloseOthers(
    strip: TabStripState,
    keepTabId: string,
    includePinned: boolean,
): TabClosePlan {
    const dirty = dirtySet(strip);
    const scope: ClosePlanScope = { kind: "strip" };
    const { eligible, protectedPinned } = scopeFor(strip, includePinned, scope);
    const selected = eligible.filter((hit) => hit.tabId !== keepTabId);
    return finish({
        kind: "others",
        mode: null,
        query: "",
        scope,
        includePinned,
        eligible,
        selected,
        protectedPinned,
        dirty,
        refusal: null,
        patternError: null,
    });
}

/**
 * Close everything to one side of a tab.
 *
 * "Side" is measured in the strip's own left-to-right order, which includes the
 * members of collapsed groups. A collapsed group sitting to the right of the
 * anchor is closed by a close-to-the-right, because the tabs are there; skipping
 * them would make collapsing a group a way to accidentally survive a close, and
 * the preview would then disagree with the strip.
 */
export function planCloseToEdge(
    strip: TabStripState,
    fromTabId: string,
    edge: "start" | "end",
    includePinned: boolean,
): TabClosePlan {
    const dirty = dirtySet(strip);
    const scope: ClosePlanScope = { kind: "strip" };
    const { eligible, protectedPinned } = scopeFor(strip, includePinned, scope);
    const anchor = allHits(strip).find((hit) => hit.tabId === fromTabId);
    const selected =
        anchor === undefined
            ? []
            : eligible.filter((hit) => (edge === "start" ? hit.index < anchor.index : hit.index > anchor.index));
    return finish({
        kind: edge === "start" ? "toStart" : "toEnd",
        mode: null,
        query: "",
        scope,
        includePinned,
        eligible,
        selected,
        protectedPinned,
        dirty,
        refusal: null,
        patternError: null,
    });
}

/**
 * The groups a plan would empty, so the preview can say so before it happens.
 *
 * Reported from the plan rather than discovered afterwards, because "this will
 * also remove the group Renders" is exactly the kind of consequence somebody
 * needs before agreeing rather than after. Measured against `selected`, which is
 * the set the preview shows; a tab held back for unsaved work therefore keeps
 * its group, and {@link applyClosePlan} agrees because it recomputes from what
 * really closed.
 */
export function groupsEmptiedBy(strip: TabStripState, plan: TabClosePlan): readonly TabGroup[] {
    const closing = new Set(plan.selected.map((hit) => hit.tabId));
    return strip.groups.filter(
        (group) => group.tabIds.length > 0 && group.tabIds.every((id) => closing.has(id)),
    );
}

/** What a plan actually did, as opposed to what it intended. */
export interface CloseOutcome {
    readonly strip: TabStripState;
    /** The tabs that really closed. */
    readonly closed: readonly TabHit[];
    /** The tabs that were selected and are still open, with the reason. */
    readonly kept: readonly HeldTab[];
    /**
     * Groups the close emptied, named whether or not they were then removed.
     *
     * A group is a container for tabs, so one left holding none is a leftover
     * rather than a thing anybody asked for, and the contract keeps it only on a
     * deliberate choice. Either way the names are reported, because a group
     * vanishing without being mentioned looks exactly like a bug.
     */
    readonly emptiedGroups: readonly TabGroup[];
}

/**
 * Applies a plan.
 *
 * `closeUnsaved` is the answer to the confirmation the plan's `unsaved` list
 * forced. Left false, those tabs stay open and come back in `kept`, and the
 * caller reports "closed 4, kept 2 holding unsaved work" rather than "closed 6",
 * which is the difference the contract's failure-modes section is about.
 *
 * `keepEmptyGroups` is the deliberate choice the contract asks for before an
 * emptied group survives. It defaults to false, so a close that removes a
 * group's last tab tidies the group away and says so.
 */
export function applyClosePlan(
    strip: TabStripState,
    plan: TabClosePlan,
    options: { readonly closeUnsaved?: boolean; readonly keepEmptyGroups?: boolean } = {},
): CloseOutcome {
    if (!plan.runnable) return { strip, closed: [], kept: [], emptiedGroups: [] };

    const closeUnsaved = options.closeUnsaved ?? false;
    const keepEmptyGroups = options.keepEmptyGroups ?? false;

    const unsavedIds = new Set(plan.unsaved.map((entry) => entry.hit.tabId));
    const closing = closeUnsaved ? plan.selected : plan.selected.filter((hit) => !unsavedIds.has(hit.tabId));
    const kept = closeUnsaved ? [] : plan.unsaved;

    const closed = closeTabs(
        strip,
        closing.map((hit) => hit.tabId),
    );
    const hadMembers = new Set(
        strip.groups.filter((group) => group.tabIds.length > 0).map((group) => group.id),
    );
    const emptiedGroups = closed.groups.filter(
        (group) => group.tabIds.length === 0 && hadMembers.has(group.id),
    );

    const tidied = keepEmptyGroups
        ? closed
        : emptiedGroups.reduce((state, group) => removeGroup(state, group.id), closed);

    return { strip: tidied, closed: closing, kept, emptiedGroups };
}

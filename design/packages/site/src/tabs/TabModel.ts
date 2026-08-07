/**
 * Tab state: what pages exist, what order they are in, which are pinned, which groups they
 * belong to, which are closed, and which is active.
 *
 * `order` is the canonical sequence of every registered page, pinned and closed ones
 * included. Everything the strip draws is derived from it, so a reorder is a permutation of
 * a single array rather than several lists that can disagree.
 *
 * Groups do not need their members to be adjacent in `order`. `segments()` gathers a group's
 * members wherever they are and emits them as one run, and a group move permutes exactly the
 * indices that run occupies. Group order is therefore implied by the position of the group's
 * first member, which is why persisting `order` is enough to restore group order after a
 * reload.
 *
 * Pinned pages keep their group membership while pinned. They are drawn in the pinned region
 * rather than inside the group, and unpinning puts them back where they came from, so pinning
 * never silently discards which group a page belonged to.
 */

import { compileMatcher, type CompiledMatcher, type MatchSpec } from "./matcher.js";
import type { I18n, TextSource } from "../i18n/I18n.js";
import type { IconName } from "../platform/icons.js";
import type { Preferences } from "../platform/Preferences.js";

export const GROUP_COLOURS = ["blue", "green", "amber", "purple", "red", "grey"] as const;
export type GroupColour = (typeof GROUP_COLOURS)[number];
export const TAB_PLACEMENTS = ["left", "right", "top", "bottom"] as const;
export type TabPlacement = (typeof TAB_PLACEMENTS)[number];
export const DEFAULT_TAB_PLACEMENT: TabPlacement = "left";

/** This site owns one window and one strip. Search results still name both, because the API
 *  contract is that a result says where it is, and a caller should not have to know that the
 *  answer happens to be constant here. */
export const STRIP_ID = "main";

export interface TabGroupSeed {
    readonly id: string;
    readonly name: string;
    readonly colour?: GroupColour;
}

export interface TabDefinition {
    readonly id: string;
    readonly label: TextSource;
    readonly icon?: IconName;
    /** Draw the page. Return a function to undo anything that outlives the DOM. */
    readonly render: (host: HTMLElement) => void | (() => void);
    /** Defaults to true. A page that cannot be closed is also excluded from bulk closes. */
    readonly closable?: boolean;
    /** Pinned the first time this page is seen. A stored choice always wins afterwards. */
    readonly pinned?: boolean;
    /** Group this page joins the first time it is seen. */
    readonly group?: TabGroupSeed;
}

export interface TabGroup {
    id: string;
    name: string;
    colour: GroupColour;
    collapsed: boolean;
}

export type Segment =
    | { readonly kind: "tab"; readonly id: string }
    | { readonly kind: "group"; readonly id: string; readonly members: readonly string[] };

export interface TabSearchResult {
    readonly tabId: string;
    /** Exactly the text the visitor can read on the tab, in the current language mode. */
    readonly label: string;
    readonly pinned: boolean;
    readonly closed: boolean;
    readonly closable: boolean;
    readonly groupId: string | null;
    readonly groupName: string | null;
    readonly groupCollapsed: boolean;
    readonly stripId: string;
    readonly windowLabel: string;
}

export interface GroupSearchResult {
    readonly groupId: string;
    readonly name: string;
    readonly colour: GroupColour;
    readonly collapsed: boolean;
    readonly openTabCount: number;
    readonly stripId: string;
    readonly windowLabel: string;
}

export interface BulkCloseOptions {
    /** True for "close pages NOT containing text". Negates the same compiled matcher. */
    readonly invert: boolean;
    readonly includePinned: boolean;
}

export interface BulkClosePreview {
    readonly matcher: CompiledMatcher;
    readonly spec: MatchSpec;
    readonly options: BulkCloseOptions;
    /** Every open page the action considered. */
    readonly eligible: readonly TabSearchResult[];
    readonly willClose: readonly TabSearchResult[];
    readonly excludedPinned: readonly TabSearchResult[];
    readonly excludedProtected: readonly TabSearchResult[];
    /** True when the batch hit its time budget and stopped. Nothing is claimed for the rest. */
    readonly timedOut: boolean;
}

export interface BulkCloseResult {
    readonly closed: readonly string[];
    readonly excluded: number;
    readonly failed: readonly string[];
}

/** Wall-clock budget for one matching batch, so a slow pattern cannot freeze the page. */
const MATCH_BUDGET_MS = 50;
const STATE_KEY = "tabs.state";
const STATE_VERSION = 2;
const LEGACY_STATE_VERSION = 1;
const RECENTLY_CLOSED_LIMIT = 20;

interface PersistedState {
    readonly v: number;
    readonly order: string[];
    readonly pinned: string[];
    readonly closed: string[];
    readonly groups: TabGroup[];
    readonly membership: [string, string][];
    readonly active: string | null;
    readonly placement: TabPlacement;
}

interface RevivedState extends PersistedState {
    readonly placementWasStored: boolean;
}

function revive(value: unknown): RevivedState | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const raw = value as Partial<PersistedState>;
    if (raw.v !== STATE_VERSION && raw.v !== LEGACY_STATE_VERSION) return undefined;
    if (!Array.isArray(raw.order) || !Array.isArray(raw.pinned) || !Array.isArray(raw.closed))
        return undefined;
    if (!Array.isArray(raw.groups) || !Array.isArray(raw.membership)) return undefined;
    return {
        v: STATE_VERSION,
        order: raw.order.filter((id): id is string => typeof id === "string"),
        pinned: raw.pinned.filter((id): id is string => typeof id === "string"),
        closed: raw.closed.filter((id): id is string => typeof id === "string"),
        groups: raw.groups.filter(isGroup),
        membership: raw.membership.filter(
            (pair): pair is [string, string] =>
                Array.isArray(pair) &&
                pair.length === 2 &&
                typeof pair[0] === "string" &&
                typeof pair[1] === "string",
        ),
        active: typeof raw.active === "string" ? raw.active : null,
        placement: (TAB_PLACEMENTS as readonly unknown[]).includes(raw.placement)
            ? (raw.placement as TabPlacement)
            : DEFAULT_TAB_PLACEMENT,
        placementWasStored: (TAB_PLACEMENTS as readonly unknown[]).includes(raw.placement),
    };
}

function isGroup(value: unknown): value is TabGroup {
    if (typeof value !== "object" || value === null) return false;
    const raw = value as Partial<TabGroup>;
    return (
        typeof raw.id === "string" &&
        typeof raw.name === "string" &&
        typeof raw.collapsed === "boolean" &&
        (GROUP_COLOURS as readonly string[]).includes(raw.colour ?? "")
    );
}

export class TabModel {
    private readonly prefs: Preferences;
    private readonly i18n: I18n;
    private readonly definitions = new Map<string, TabDefinition>();
    private readonly listeners = new Set<() => void>();

    private order: string[] = [];
    private pinned: string[] = [];
    private closed = new Set<string>();
    private recentlyClosed: string[] = [];
    private groups = new Map<string, TabGroup>();
    private membership = new Map<string, string>();
    private activeId: string | null = null;
    private placementValue: TabPlacement = DEFAULT_TAB_PLACEMENT;
    private placementStored = false;
    /** Ids that came back from storage, so a definition's defaults only apply to new pages. */
    private readonly hydrated = new Set<string>();
    private groupCounter = 0;

    constructor(prefs: Preferences, i18n: I18n) {
        this.prefs = prefs;
        this.i18n = i18n;
        this.load();
    }

    // ---- registration ---------------------------------------------------------------

    register(definition: TabDefinition): void {
        this.definitions.set(definition.id, definition);
        if (!this.order.includes(definition.id)) this.order.push(definition.id);

        const isNew = !this.hydrated.has(definition.id);
        if (isNew) {
            if (definition.pinned === true && !this.pinned.includes(definition.id))
                this.pinned.push(definition.id);
            if (definition.group !== undefined) {
                const seed = definition.group;
                if (!this.groups.has(seed.id)) {
                    this.groups.set(seed.id, {
                        id: seed.id,
                        name: seed.name,
                        colour: seed.colour ?? "blue",
                        collapsed: false,
                    });
                }
                this.membership.set(definition.id, seed.id);
            }
            this.hydrated.add(definition.id);
        }

        // A stored active id may be registered later in the host's declaration order.
        // Do not replace it with the first page and immediately persist that replacement
        // merely because its definition has not arrived yet.
        const awaitingStoredActive =
            this.activeId !== null &&
            this.hydrated.has(this.activeId) &&
            !this.definitions.has(this.activeId);
        if (!awaitingStoredActive && (this.activeId === null || !this.isOpen(this.activeId))) {
            this.activeId = this.openIds()[0] ?? null;
        }
        this.save();
        this.emit();
    }

    definition(id: string): TabDefinition | undefined {
        return this.definitions.get(id);
    }

    // ---- reading state --------------------------------------------------------------

    get active(): string | null {
        return this.activeId;
    }

    get placement(): TabPlacement {
        return this.placementValue;
    }

    /** Whether this value came from storage rather than the built-in migration fallback. */
    get placementProvenance(): "stored" | "default" {
        return this.placementStored ? "stored" : "default";
    }

    isOpen(id: string): boolean {
        return this.definitions.has(id) && !this.closed.has(id);
    }

    isPinned(id: string): boolean {
        return this.pinned.includes(id) && this.isOpen(id);
    }

    isClosable(id: string): boolean {
        return this.definitions.get(id)?.closable !== false;
    }

    groupOf(id: string): TabGroup | null {
        const groupId = this.membership.get(id);
        return groupId === undefined ? null : (this.groups.get(groupId) ?? null);
    }

    listGroups(): TabGroup[] {
        // Group order follows the position of each group's first member in `order`.
        const seen: TabGroup[] = [];
        for (const id of this.order) {
            const group = this.groupOf(id);
            if (group !== null && !seen.includes(group)) seen.push(group);
        }
        for (const group of this.groups.values()) if (!seen.includes(group)) seen.push(group);
        return seen;
    }

    /** Every registered page id in strip order, open or closed. */
    allIds(): string[] {
        return this.order.filter((id) => this.definitions.has(id));
    }

    openIds(): string[] {
        return this.order.filter((id) => this.isOpen(id));
    }

    pinnedIds(): string[] {
        return this.pinned.filter((id) => this.isOpen(id));
    }

    /** Pages the visitor closed, most recently closed first. */
    recentlyClosedIds(): string[] {
        return [...this.recentlyClosed]
            .reverse()
            .filter((id) => this.definitions.has(id) && this.closed.has(id));
    }

    /** The unpinned part of the strip, with each group's members gathered into one run. */
    segments(): Segment[] {
        const emitted = new Set<string>();
        const result: Segment[] = [];
        for (const id of this.order) {
            if (!this.isOpen(id) || this.isPinned(id) || emitted.has(id)) continue;
            const group = this.groupOf(id);
            if (group === null) {
                emitted.add(id);
                result.push({ kind: "tab", id });
                continue;
            }
            const members = this.order.filter(
                (candidate) =>
                    this.isOpen(candidate) &&
                    !this.isPinned(candidate) &&
                    this.groupOf(candidate) === group,
            );
            for (const member of members) emitted.add(member);
            result.push({ kind: "group", id: group.id, members });
        }
        return result;
    }

    label(id: string): string {
        const definition = this.definitions.get(id);
        return definition === undefined ? id : this.i18n.text(definition.label);
    }

    // ---- mutations ------------------------------------------------------------------

    activate(id: string): void {
        if (!this.isOpen(id) || this.activeId === id) return;
        this.activeId = id;
        this.save();
        this.emit();
    }

    /** Activate the page `delta` positions away in the visible sequence, wrapping around. */
    activateRelative(delta: number): void {
        const visible = [
            ...this.pinnedIds(),
            ...this.segments().flatMap((s) => (s.kind === "tab" ? [s.id] : s.members)),
        ];
        if (visible.length === 0) return;
        const current = this.activeId === null ? -1 : visible.indexOf(this.activeId);
        const next = visible[(current + delta + visible.length) % visible.length];
        if (next !== undefined) this.activate(next);
    }

    setPlacement(placement: TabPlacement): void {
        if (this.placementValue === placement && this.placementStored) return;
        this.placementValue = placement;
        this.placementStored = true;
        this.save();
        this.emit();
    }

    close(id: string): boolean {
        if (!this.isOpen(id) || !this.isClosable(id)) return false;
        const visible = [
            ...this.pinnedIds(),
            ...this.segments().flatMap((s) => (s.kind === "tab" ? [s.id] : s.members)),
        ];
        const position = visible.indexOf(id);

        this.closed.add(id);
        this.pinned = this.pinned.filter((pinnedId) => pinnedId !== id);
        this.recentlyClosed.push(id);
        if (this.recentlyClosed.length > RECENTLY_CLOSED_LIMIT) this.recentlyClosed.shift();

        if (this.activeId === id) {
            const remaining = visible.filter((candidate) => candidate !== id);
            this.activeId = remaining[Math.min(position, remaining.length - 1)] ?? null;
        }
        this.save();
        this.emit();
        return true;
    }

    reopen(id: string): boolean {
        if (!this.definitions.has(id) || !this.closed.has(id)) return false;
        this.closed.delete(id);
        this.recentlyClosed = this.recentlyClosed.filter((candidate) => candidate !== id);
        this.activeId = id;
        this.save();
        this.emit();
        return true;
    }

    reopenLast(): string | null {
        const id = this.recentlyClosed[this.recentlyClosed.length - 1];
        if (id === undefined) return null;
        return this.reopen(id) ? id : null;
    }

    setPinned(id: string, pinned: boolean): void {
        if (!this.isOpen(id)) return;
        if (pinned && !this.pinned.includes(id)) this.pinned.push(id);
        if (!pinned) this.pinned = this.pinned.filter((candidate) => candidate !== id);
        this.save();
        this.emit();
    }

    /** Move a pinned page within the pinned region. */
    movePinned(id: string, delta: number): boolean {
        const ids = this.pinnedIds();
        const from = ids.indexOf(id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= ids.length) return false;
        const moved = [...ids];
        const [taken] = moved.splice(from, 1);
        if (taken === undefined) return false;
        moved.splice(to, 0, taken);
        // Write back into the positions the pinned ids occupied, leaving everything else.
        const positions = this.pinned.flatMap((candidate, index) =>
            ids.includes(candidate) ? [index] : [],
        );
        for (const [slot, index] of positions.entries()) {
            const value = moved[slot];
            if (value !== undefined) this.pinned[index] = value;
        }
        this.save();
        this.emit();
        return true;
    }

    /**
     * Move a page one place along the strip. Inside a group the move stays inside that group;
     * outside one it steps over a whole neighbouring group rather than landing in the middle
     * of it, because a page cannot be half in a group.
     */
    moveTab(id: string, delta: number): boolean {
        if (this.isPinned(id)) return this.movePinned(id, delta);
        const group = this.groupOf(id);
        if (group !== null) {
            const members = this.segments().find((s) => s.kind === "group" && s.id === group.id);
            if (members === undefined || members.kind !== "group") return false;
            return this.permute([...members.members], id, delta);
        }
        const segments = this.segments();
        const index = segments.findIndex((s) => s.kind === "tab" && s.id === id);
        return index < 0 ? false : this.moveSegment(index, delta);
    }

    /** Move a whole group, and everything in it, one place along the strip. */
    moveSegment(index: number, delta: number): boolean {
        const segments = this.segments();
        const target = index + delta;
        if (index < 0 || index >= segments.length || target < 0 || target >= segments.length)
            return false;
        const reordered = [...segments];
        const [taken] = reordered.splice(index, 1);
        if (taken === undefined) return false;
        reordered.splice(target, 0, taken);
        const flattened = reordered.flatMap((segment) =>
            segment.kind === "tab" ? [segment.id] : [...segment.members],
        );
        this.writeBack(flattened);
        this.save();
        this.emit();
        return true;
    }

    createGroup(name: string, colour: GroupColour = "blue"): string {
        this.groupCounter += 1;
        let id = `group-${this.groupCounter}`;
        while (this.groups.has(id)) {
            this.groupCounter += 1;
            id = `group-${this.groupCounter}`;
        }
        this.groups.set(id, { id, name, colour, collapsed: false });
        this.save();
        this.emit();
        return id;
    }

    /** The number to suggest for the next group's default name. */
    nextGroupNumber(): number {
        return this.groups.size + 1;
    }

    renameGroup(groupId: string, name: string): void {
        const group = this.groups.get(groupId);
        if (group === undefined || name.trim().length === 0) return;
        group.name = name.trim().slice(0, 80);
        this.save();
        this.emit();
    }

    setGroupColour(groupId: string, colour: GroupColour): void {
        const group = this.groups.get(groupId);
        if (group === undefined) return;
        group.colour = colour;
        this.save();
        this.emit();
    }

    setGroupCollapsed(groupId: string, collapsed: boolean): void {
        const group = this.groups.get(groupId);
        if (group === undefined || group.collapsed === collapsed) return;
        group.collapsed = collapsed;
        // A collapsed group must not swallow the active page: activate the group header's
        // first member instead of leaving the visitor on a page they can no longer see.
        if (collapsed && this.activeId !== null && this.groupOf(this.activeId)?.id === groupId) {
            const outside = this.openIds().find((id) => this.groupOf(id)?.id !== groupId);
            if (outside !== undefined) this.activeId = outside;
        }
        this.save();
        this.emit();
    }

    /** Remove a group. Its pages stay open and become ungrouped. */
    removeGroup(groupId: string): void {
        if (!this.groups.has(groupId)) return;
        this.groups.delete(groupId);
        for (const [tabId, id] of [...this.membership])
            if (id === groupId) this.membership.delete(tabId);
        this.save();
        this.emit();
    }

    setGroup(tabId: string, groupId: string | null): void {
        if (!this.definitions.has(tabId)) return;
        if (groupId === null) this.membership.delete(tabId);
        else if (this.groups.has(groupId)) this.membership.set(tabId, groupId);
        this.save();
        this.emit();
    }

    /** Undo every group, pin, close and reorder, returning the strip to its registered state. */
    reset(): void {
        this.order = [...this.definitions.keys()];
        this.pinned = [...this.definitions.values()]
            .filter((d) => d.pinned === true)
            .map((d) => d.id);
        this.closed = new Set();
        this.recentlyClosed = [];
        this.groups = new Map();
        this.membership = new Map();
        for (const definition of this.definitions.values()) {
            if (definition.group === undefined) continue;
            const seed = definition.group;
            if (!this.groups.has(seed.id)) {
                this.groups.set(seed.id, {
                    id: seed.id,
                    name: seed.name,
                    colour: seed.colour ?? "blue",
                    collapsed: false,
                });
            }
            this.membership.set(definition.id, seed.id);
        }
        this.activeId = this.openIds()[0] ?? null;
        this.placementValue = DEFAULT_TAB_PLACEMENT;
        this.placementStored = false;
        this.prefs.remove(STATE_KEY);
        this.emit();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    // ---- search ---------------------------------------------------------------------

    describe(id: string): TabSearchResult {
        const group = this.groupOf(id);
        return {
            tabId: id,
            label: this.label(id),
            pinned: this.isPinned(id),
            closed: this.closed.has(id),
            closable: this.isClosable(id),
            groupId: group?.id ?? null,
            groupName: group?.name ?? null,
            groupCollapsed: group?.collapsed ?? false,
            stripId: STRIP_ID,
            windowLabel: document.title,
        };
    }

    describeGroup(group: TabGroup): GroupSearchResult {
        return {
            groupId: group.id,
            name: group.name,
            colour: group.colour,
            collapsed: group.collapsed,
            openTabCount: this.openIds().filter((id) => this.groupOf(id)?.id === group.id).length,
            stripId: STRIP_ID,
            windowLabel: document.title,
        };
    }

    /**
     * Run a compiled matcher over a set of pages under a wall-clock budget. Returns what was
     * matched and whether the budget ran out, so a caller can report an incomplete result
     * honestly rather than presenting a partial answer as a complete one.
     */
    private runMatcher(
        ids: readonly string[],
        matcher: CompiledMatcher,
        invert: boolean,
    ): { matched: TabSearchResult[]; timedOut: boolean } {
        if (!matcher.ok) return { matched: [], timedOut: false };
        const started = performance.now();
        const matched: TabSearchResult[] = [];
        for (const [index, id] of ids.entries()) {
            if (index % 16 === 0 && performance.now() - started > MATCH_BUDGET_MS) {
                return { matched, timedOut: true };
            }
            const result = this.describe(id);
            if (matcher.test(result.label) !== invert) matched.push(result);
        }
        return { matched, timedOut: false };
    }

    searchTabs(
        ids: readonly string[],
        spec: MatchSpec,
    ): { results: TabSearchResult[]; matcher: CompiledMatcher; timedOut: boolean } {
        const matcher = compileMatcher(spec);
        if (!matcher.ok) return { results: [], matcher, timedOut: false };
        const { matched, timedOut } = this.runMatcher(ids, matcher, false);
        return { results: matched, matcher, timedOut };
    }

    searchGroupNames(spec: MatchSpec): { results: GroupSearchResult[]; matcher: CompiledMatcher } {
        const matcher = compileMatcher(spec);
        if (!matcher.ok) return { results: [], matcher };
        const results = this.listGroups()
            .filter((group) => matcher.test(group.name))
            .map((group) => this.describeGroup(group));
        return { results, matcher };
    }

    // ---- bulk close -----------------------------------------------------------------

    /**
     * `scopeIds` limits the action to a subset, which is how the group scope works. The
     * preview always reports the eligible set it actually considered, so the dialog can state
     * the scope rather than leaving the visitor to guess how far a close reaches.
     */
    previewBulkClose(
        spec: MatchSpec,
        options: BulkCloseOptions,
        scopeIds?: readonly string[],
    ): BulkClosePreview {
        const matcher = compileMatcher(spec);
        const scope =
            scopeIds === undefined
                ? this.openIds()
                : this.openIds().filter((id) => scopeIds.includes(id));
        const eligible = scope.map((id) => this.describe(id));
        if (!matcher.ok) {
            return {
                matcher,
                spec,
                options,
                eligible,
                willClose: [],
                excludedPinned: [],
                excludedProtected: [],
                timedOut: false,
            };
        }

        // One compiled matcher, one call, and the inverse action negates that same result.
        // The two directions therefore always partition the eligible set exactly.
        const { matched, timedOut } = this.runMatcher(
            eligible.map((entry) => entry.tabId),
            matcher,
            options.invert,
        );

        const excludedPinned = matched.filter((entry) => entry.pinned && !options.includePinned);
        const excludedProtected = matched.filter((entry) => !entry.closable);
        const willClose = matched.filter(
            (entry) => entry.closable && (options.includePinned || !entry.pinned),
        );
        return {
            matcher,
            spec,
            options,
            eligible,
            willClose,
            excludedPinned,
            excludedProtected,
            timedOut,
        };
    }

    applyBulkClose(preview: BulkClosePreview): BulkCloseResult {
        const closed: string[] = [];
        const failed: string[] = [];
        for (const entry of preview.willClose) {
            if (this.close(entry.tabId)) closed.push(entry.tabId);
            else failed.push(entry.tabId);
        }
        return {
            closed,
            excluded: preview.excludedPinned.length + preview.excludedProtected.length,
            failed,
        };
    }

    // ---- internals ------------------------------------------------------------------

    /** Permute a subset of `order` in place, leaving every other entry where it is. */
    private permute(subset: string[], id: string, delta: number): boolean {
        const from = subset.indexOf(id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= subset.length) return false;
        const moved = [...subset];
        const [taken] = moved.splice(from, 1);
        if (taken === undefined) return false;
        moved.splice(to, 0, taken);

        const indices = this.order.flatMap((candidate, index) =>
            subset.includes(candidate) ? [index] : [],
        );
        for (const [slot, index] of indices.entries()) {
            const value = moved[slot];
            if (value !== undefined) this.order[index] = value;
        }
        this.save();
        this.emit();
        return true;
    }

    /** Write a new sequence for the unpinned, open pages back into `order`. */
    private writeBack(sequence: string[]): void {
        const members = new Set(sequence);
        const indices = this.order.flatMap((candidate, index) =>
            members.has(candidate) ? [index] : [],
        );
        for (const [slot, index] of indices.entries()) {
            const value = sequence[slot];
            if (value !== undefined) this.order[index] = value;
        }
    }

    private load(): void {
        const state = this.prefs.readJson<RevivedState>(STATE_KEY, revive);
        if (state === undefined) return;
        this.order = [...state.order];
        this.pinned = [...state.pinned];
        this.closed = new Set(state.closed);
        this.groups = new Map(state.groups.map((group) => [group.id, { ...group }]));
        this.membership = new Map(
            state.membership.filter(([, groupId]) => this.groups.has(groupId)),
        );
        this.activeId = state.active;
        this.placementValue = state.placement;
        this.placementStored = state.placementWasStored;
        for (const id of state.order) this.hydrated.add(id);
        for (const group of this.groups.keys()) {
            const parsed = Number.parseInt(group.replace("group-", ""), 10);
            if (Number.isFinite(parsed)) this.groupCounter = Math.max(this.groupCounter, parsed);
        }
    }

    private save(): void {
        const state: PersistedState = {
            v: STATE_VERSION,
            order: this.order.filter((id) => this.definitions.has(id)),
            pinned: this.pinned.filter((id) => this.definitions.has(id)),
            closed: [...this.closed].filter((id) => this.definitions.has(id)),
            groups: [...this.groups.values()].map((group) => ({ ...group })),
            membership: [...this.membership].filter(([tabId]) => this.definitions.has(tabId)),
            active: this.activeId,
            placement: this.placementValue,
        };
        this.prefs.writeJson(STATE_KEY, state);
    }

    private emit(): void {
        for (const listener of [...this.listeners]) listener();
    }
}

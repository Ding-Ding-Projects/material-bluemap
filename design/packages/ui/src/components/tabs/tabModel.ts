/**
 * What a tab strip is made of, and every operation that changes one.
 *
 * This module is pure data and pure functions. Nothing here touches the DOM, the
 * clock, storage or Vue, which is deliberate: the awkward parts of browser-style
 * tabs are ordering rules, not rendering. "Where does a tab go when it is
 * unpinned", "what happens to a group's members when the group is removed",
 * "which tab becomes active when the active one closes" are all questions with
 * exactly one right answer that a mounted component test would prove slowly and
 * a unit test proves in a line. The components in this folder render what these
 * functions decide and add nothing of their own.
 *
 * ### One authority per ordering
 *
 * The contract asks for four separate orders to survive a restart: tab order,
 * pinned order, group order and membership. The temptation is to store one array
 * of tabs and derive the rest by filtering it, which reads well until a tab is
 * pinned - at which point its position means two things at once and every later
 * operation has to guess which one the user meant. So each order gets exactly one
 * field that owns it, and nothing else is allowed to imply it:
 *
 *  - {@link TabStripState.tabs} is the set of tabs, keyed by id. Its array order
 *    carries no meaning at all beyond being a stable iteration order.
 *  - {@link TabStripState.pinnedOrder} is the pinned region, left to right.
 *  - {@link TabStripState.slots} is the ordinary region, left to right, where a
 *    slot is either one ungrouped tab or one whole group. That single list
 *    carries both the ordinary tab order and the group order, so the two cannot
 *    contradict each other the way two parallel arrays eventually would.
 *  - {@link TabGroup.tabIds} is the order inside that group.
 *
 * Every id therefore appears in exactly one place, and {@link normalizeStrip}
 * enforces that on anything read back from disk.
 *
 * ### Pinning takes a tab out of its group
 *
 * A pinned tab lives in the pinned region; a grouped tab lives inside its group's
 * run. Those are two different places on screen and a tab cannot be in both, so
 * pinning clears membership (this is also what Chrome does). The alternative -
 * keeping the membership and merely hiding the tab from the group's run - makes
 * the per-group search report a tab that is demonstrably not in the group, which
 * is worse than losing the membership because it is a lie rather than a loss.
 *
 * ### The slot reserved for appearance
 *
 * Per-tab and per-group appearance is a separate piece of work. What it needs
 * from here is somewhere to attach and a promise that this module will not throw
 * it away, so {@link TabRecord.appearance} and {@link TabGroup.appearance} are
 * opaque records: this module never reads inside them, every operation carries
 * them through untouched, and storage round-trips them verbatim. See
 * {@link setTabAppearance} and {@link setGroupAppearance}.
 */

/**
 * A per-element appearance record, owned by the appearance work rather than by
 * this module.
 *
 * Deliberately opaque. Nothing here inspects a key, so this folder cannot come to
 * depend on a shape that the appearance editor has not settled on yet, and a
 * record written by a newer build survives a round trip through an older one.
 */
export type AppearanceRecord = Readonly<Record<string, unknown>>;

/** The edge a strip occupies around its panel. Fresh and migrated strips start on the left. */
export const TAB_PLACEMENTS = ["left", "right", "top", "bottom"] as const;
export type TabPlacement = (typeof TAB_PLACEMENTS)[number];
export const DEFAULT_TAB_PLACEMENT: TabPlacement = "left";

/**
 * A page a tab can show.
 *
 * The host declares these and renders one named slot per `id`; a tab names one
 * of them in {@link TabRecord.pageId}. Keeping the page list out of the tab
 * record is what lets two tabs show the same page, which is the whole point of
 * a tabbed shell over a switch statement.
 */
export interface TabPage {
    readonly id: string;
    readonly label: string;
    /** An `@mdi/js` path, or null. */
    readonly icon: string | null;
}

/** One tab: an identity, the page it shows, and the label everything searches by. */
export interface TabRecord {
    readonly id: string;
    /**
     * Which page this tab shows. Several tabs may name the same page; the tab is
     * the window onto it, not the page itself.
     */
    readonly pageId: string;
    /**
     * The visible label. This is the only text a search or a bulk close is ever
     * allowed to look at, which is why it is a plain string on the tab rather
     * than something resolved from the page at match time.
     */
    readonly label: string;
    /** An `@mdi/js` path, or null when the tab shows no icon. */
    readonly icon: string | null;
    /**
     * True when closing this tab would lose work.
     *
     * The bulk-close plans refuse to sweep these away silently: they are listed
     * in the preview and need the confirmation to say so out loud, because the
     * one thing worse than a bulk close that skips a tab is one that does not.
     */
    readonly dirty: boolean;
    /** Reserved for the per-tab appearance editor. Never read here. */
    readonly appearance: AppearanceRecord | null;
}

/** One group: a name, a colour, a collapsed state and an ordered membership. */
export interface TabGroup {
    readonly id: string;
    readonly name: string;
    /**
     * A colour token, kept as a plain string so the palette belongs to whoever
     * owns appearance rather than being frozen into the model. The strip renders
     * it as a Vuetify theme colour when it names one.
     */
    readonly color: string;
    /** The user's saved preference, which a search result must never overwrite. */
    readonly collapsed: boolean;
    readonly tabIds: readonly string[];
    /** Reserved for the per-group appearance editor. Never read here. */
    readonly appearance: AppearanceRecord | null;
}

/** One position in the ordinary region: a lone tab, or a whole group. */
export type TabSlot =
    | { readonly kind: "tab"; readonly tabId: string }
    | { readonly kind: "group"; readonly groupId: string };

/** One strip of tabs, in one window. */
export interface TabStripState {
    readonly id: string;
    /** The strip's own name, reported by the master search so a result is locatable. */
    readonly label: string;
    readonly windowId: string;
    readonly windowLabel: string;
    /** Persisted independently for each strip. */
    readonly placement: TabPlacement;
    /** Every tab in the strip. Array order carries no meaning; see the module note. */
    readonly tabs: readonly TabRecord[];
    readonly groups: readonly TabGroup[];
    /** The pinned region, left to right. */
    readonly pinnedOrder: readonly string[];
    /** The ordinary region, left to right. */
    readonly slots: readonly TabSlot[];
    readonly activeTabId: string | null;
}

/** Every strip the application owns, which is what the master search covers. */
export interface TabWorkspaceState {
    readonly strips: readonly TabStripState[];
}

/* -------------------------------------------------------------------------- */
/* Reading a strip                                                            */
/* -------------------------------------------------------------------------- */

/** Lookups built once, so a render does not run `find` inside a loop. */
export interface StripIndex {
    readonly tabById: ReadonlyMap<string, TabRecord>;
    readonly groupById: ReadonlyMap<string, TabGroup>;
    /** The group a tab belongs to, absent when it is ungrouped or pinned. */
    readonly groupOfTab: ReadonlyMap<string, TabGroup>;
    readonly pinned: ReadonlySet<string>;
}

export function indexStrip(strip: TabStripState): StripIndex {
    const tabById = new Map(strip.tabs.map((tab) => [tab.id, tab]));
    const groupById = new Map(strip.groups.map((group) => [group.id, group]));
    const groupOfTab = new Map<string, TabGroup>();
    for (const group of strip.groups) {
        for (const tabId of group.tabIds) {
            if (!groupOfTab.has(tabId)) groupOfTab.set(tabId, group);
        }
    }
    return { tabById, groupById, groupOfTab, pinned: new Set(strip.pinnedOrder) };
}

/** One drawn section of the ordinary region. */
export type StripSegment =
    | { readonly kind: "tab"; readonly tab: TabRecord }
    | { readonly kind: "group"; readonly group: TabGroup; readonly tabs: readonly TabRecord[] };

/** The pinned region, in its own order. */
export function pinnedTabs(strip: TabStripState): readonly TabRecord[] {
    const { tabById } = indexStrip(strip);
    const found: TabRecord[] = [];
    for (const id of strip.pinnedOrder) {
        const tab = tabById.get(id);
        if (tab !== undefined) found.push(tab);
    }
    return found;
}

/** The ordinary region, as the sections the strip draws. */
export function stripSegments(strip: TabStripState): readonly StripSegment[] {
    const { tabById, groupById } = indexStrip(strip);
    const segments: StripSegment[] = [];
    for (const slot of strip.slots) {
        if (slot.kind === "tab") {
            const tab = tabById.get(slot.tabId);
            if (tab !== undefined) segments.push({ kind: "tab", tab });
            continue;
        }
        const group = groupById.get(slot.groupId);
        if (group === undefined) continue;
        const tabs: TabRecord[] = [];
        for (const id of group.tabIds) {
            const tab = tabById.get(id);
            if (tab !== undefined) tabs.push(tab);
        }
        segments.push({ kind: "group", group, tabs });
    }
    return segments;
}

/**
 * Narrows the overflow menu's own segments to what a local filter allows.
 *
 * A lone tab is kept only when its own label matches. A group is kept whole when its own
 * name matches -- the group itself is what was found, so every member stays reachable --
 * or narrowed to just the members whose own label matches when the name does not, and
 * dropped entirely when neither is true. An empty group heading left behind by a filter
 * would be a result nobody asked for and a row that does nothing when clicked.
 *
 * Pulled out of `TabStrip.vue` as a plain function precisely so it can be proven here,
 * against fixtures, rather than only by forcing a real overflow inside a mounted
 * component -- jsdom has no layout engine, so nothing here would ever actually be
 * measured as not fitting.
 */
export function filterHiddenSegments(
    segments: readonly StripSegment[],
    matches: (label: string) => boolean,
): readonly StripSegment[] {
    return segments.flatMap((segment): readonly StripSegment[] => {
        if (segment.kind === "tab") {
            return matches(segment.tab.label) ? [segment] : [];
        }
        if (matches(segment.group.name)) return [segment];
        const tabs = segment.tabs.filter((tab) => matches(tab.label));
        return tabs.length > 0 ? [{ kind: "group", group: segment.group, tabs }] : [];
    });
}

/**
 * Whether a group's tabs are on screen right now.
 *
 * `revealed` is the runtime set a search result adds to when it lands inside a
 * collapsed group. It is deliberately not part of {@link TabStripState}, because
 * anything in that structure is persisted, and revealing a result must never
 * rewrite the collapsed preference the user chose.
 */
export function isGroupExpanded(group: TabGroup, revealed: ReadonlySet<string>): boolean {
    return !group.collapsed || revealed.has(group.id);
}

/**
 * Every tab the arrow keys can reach, left to right.
 *
 * Tabs inside a collapsed group are absent, because roving focus must not land
 * on something that is not drawn - the focus ring would vanish and the next
 * arrow press would appear to do nothing.
 */
export function focusOrder(
    strip: TabStripState,
    revealed: ReadonlySet<string> = new Set<string>(),
): readonly TabRecord[] {
    const order: TabRecord[] = [...pinnedTabs(strip)];
    for (const segment of stripSegments(strip)) {
        if (segment.kind === "tab") order.push(segment.tab);
        else if (isGroupExpanded(segment.group, revealed)) order.push(...segment.tabs);
    }
    return order;
}

/**
 * Every tab, left to right, whether or not it is currently drawn.
 *
 * This is the order a close-to-the-right acts on and the order the searchable
 * tab list shows, both of which have to include a collapsed group's members: a
 * collapsed group is a display state, not a claim that the tabs are gone.
 */
export function tabOrder(strip: TabStripState): readonly TabRecord[] {
    const order: TabRecord[] = [...pinnedTabs(strip)];
    for (const segment of stripSegments(strip)) {
        if (segment.kind === "tab") order.push(segment.tab);
        else order.push(...segment.tabs);
    }
    return order;
}

/* -------------------------------------------------------------------------- */
/* Repairing a strip                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Restores every invariant this module relies on.
 *
 * Called on anything read back from storage, and after any operation that could
 * plausibly leave a dangling id. The rules are all "first mention wins, later
 * mentions are dropped, anything missing is appended at the end", so the repair
 * is stable: normalising twice changes nothing the second time, which is what a
 * test can actually pin down.
 *
 * It is not defensive programming for its own sake. The stored file is editable
 * by hand and is written by other versions of this application, so a group that
 * claims a tab which no longer exists, or two groups that both claim the same
 * tab, are things that genuinely arrive here rather than things that could only
 * happen through a bug.
 */
export function normalizeStrip(strip: TabStripState): TabStripState {
    const tabs: TabRecord[] = [];
    const seenTabs = new Set<string>();
    for (const tab of strip.tabs) {
        if (seenTabs.has(tab.id)) continue;
        seenTabs.add(tab.id);
        tabs.push(tab);
    }

    const pinnedOrder: string[] = [];
    const pinned = new Set<string>();
    for (const id of strip.pinnedOrder) {
        if (!seenTabs.has(id) || pinned.has(id)) continue;
        pinned.add(id);
        pinnedOrder.push(id);
    }

    // A tab belongs to at most one group, and a pinned tab belongs to none.
    const claimed = new Set<string>(pinned);
    const groups: TabGroup[] = [];
    const seenGroups = new Set<string>();
    for (const group of strip.groups) {
        if (seenGroups.has(group.id)) continue;
        seenGroups.add(group.id);
        const tabIds: string[] = [];
        for (const id of group.tabIds) {
            if (!seenTabs.has(id) || claimed.has(id)) continue;
            claimed.add(id);
            tabIds.push(id);
        }
        groups.push({ ...group, tabIds });
    }

    const slots: TabSlot[] = [];
    const placedGroups = new Set<string>();
    for (const slot of strip.slots) {
        if (slot.kind === "group") {
            if (!seenGroups.has(slot.groupId) || placedGroups.has(slot.groupId)) continue;
            placedGroups.add(slot.groupId);
            slots.push(slot);
            continue;
        }
        if (!seenTabs.has(slot.tabId) || claimed.has(slot.tabId)) continue;
        claimed.add(slot.tabId);
        slots.push(slot);
    }
    for (const group of groups) {
        if (!placedGroups.has(group.id)) slots.push({ kind: "group", groupId: group.id });
    }
    for (const tab of tabs) {
        if (!claimed.has(tab.id)) slots.push({ kind: "tab", tabId: tab.id });
    }

    const repaired: TabStripState = {
        ...strip,
        tabs,
        groups,
        pinnedOrder,
        slots,
        activeTabId: strip.activeTabId,
    };
    if (strip.activeTabId !== null && seenTabs.has(strip.activeTabId)) return repaired;
    return { ...repaired, activeTabId: tabOrder(repaired)[0]?.id ?? null };
}

/** Moves a strip to another edge without touching any tab, group, pin, or active state. */
export function setTabPlacement(strip: TabStripState, placement: TabPlacement): TabStripState {
    return strip.placement === placement ? strip : { ...strip, placement };
}

/* -------------------------------------------------------------------------- */
/* Small array helpers                                                        */
/* -------------------------------------------------------------------------- */

function without<T>(items: readonly T[], predicate: (item: T) => boolean): T[] {
    return items.filter((item) => !predicate(item));
}

/**
 * Moves the item at `from` by `delta` places, clamped to the ends.
 *
 * Clamped rather than wrapped: a tab at the left edge nudged left again should
 * sit still, not appear at the right edge, which reads as the strip having
 * scrambled itself.
 */
function shift<T>(items: readonly T[], from: number, delta: number): T[] {
    const copy = [...items];
    const item = copy[from];
    if (item === undefined) return copy;
    const to = Math.max(0, Math.min(copy.length - 1, from + delta));
    if (to === from) return copy;
    copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
}

/** Moves the item at `from` to exactly `to`, clamped, which is what a drop does. */
function moveTo<T>(items: readonly T[], from: number, to: number): T[] {
    if (from < 0 || from >= items.length) return [...items];
    return shift(items, from, to - from);
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The first `prefix-n` that nothing in `existing` is using.
 *
 * Ids are generated rather than random so that a test can state the whole
 * expected structure, and so a persisted file stays diffable by eye. Collisions
 * are impossible rather than unlikely, which matters because the id is what
 * every ordering field points at.
 */
export function nextId(existing: Iterable<string>, prefix: string): string {
    const taken = new Set(existing);
    for (let n = 1; ; n++) {
        const candidate = `${prefix}-${n}`;
        if (!taken.has(candidate)) return candidate;
    }
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                 */
/* -------------------------------------------------------------------------- */

/** The fields a caller supplies when opening a tab; the rest have safe defaults. */
export interface NewTab {
    readonly id?: string;
    readonly pageId: string;
    readonly label: string;
    readonly icon?: string | null;
    readonly dirty?: boolean;
}

/** Opens a tab at the end of the ordinary region and makes it active. */
export function addTab(strip: TabStripState, tab: NewTab): TabStripState {
    const id =
        tab.id ??
        nextId(
            strip.tabs.map((existing) => existing.id),
            "tab",
        );
    const record: TabRecord = {
        id,
        pageId: tab.pageId,
        label: tab.label,
        icon: tab.icon ?? null,
        dirty: tab.dirty ?? false,
        appearance: null,
    };
    return normalizeStrip({
        ...strip,
        tabs: [...strip.tabs, record],
        slots: [...strip.slots, { kind: "tab", tabId: id }],
        activeTabId: id,
    });
}

/**
 * Closes tabs, and hands the active state to a neighbour rather than to nothing.
 *
 * The neighbour is the next surviving tab to the right of the one that was
 * active, falling back to the left, which is the behaviour every tabbed
 * application has and the only one that does not make a person hunt for where
 * they were. Closing every tab leaves `activeTabId` null and the host draws its
 * empty state; it does not invent a tab to keep the strip looking populated.
 */
export function closeTabs(strip: TabStripState, ids: Iterable<string>): TabStripState {
    const closing = new Set(ids);
    if (closing.size === 0) return strip;

    const order = tabOrder(strip);
    const activeIndex = order.findIndex((tab) => tab.id === strip.activeTabId);

    let nextActive = strip.activeTabId;
    if (strip.activeTabId !== null && closing.has(strip.activeTabId)) {
        nextActive = null;
        for (let i = activeIndex + 1; i < order.length; i++) {
            const candidate = order[i];
            if (candidate !== undefined && !closing.has(candidate.id)) {
                nextActive = candidate.id;
                break;
            }
        }
        if (nextActive === null) {
            for (let i = activeIndex - 1; i >= 0; i--) {
                const candidate = order[i];
                if (candidate !== undefined && !closing.has(candidate.id)) {
                    nextActive = candidate.id;
                    break;
                }
            }
        }
    }

    return normalizeStrip({
        ...strip,
        tabs: without(strip.tabs, (tab) => closing.has(tab.id)),
        groups: strip.groups.map((group) => ({
            ...group,
            tabIds: group.tabIds.filter((id) => !closing.has(id)),
        })),
        pinnedOrder: strip.pinnedOrder.filter((id) => !closing.has(id)),
        slots: without(strip.slots, (slot) => slot.kind === "tab" && closing.has(slot.tabId)),
        activeTabId: nextActive,
    });
}

/** Makes a tab active. An unknown id changes nothing rather than blanking the panel. */
export function setActiveTab(strip: TabStripState, tabId: string): TabStripState {
    if (!strip.tabs.some((tab) => tab.id === tabId)) return strip;
    return { ...strip, activeTabId: tabId };
}

/** Replaces a tab's label, which is what every search and bulk close then matches. */
export function renameTab(strip: TabStripState, tabId: string, label: string): TabStripState {
    return {
        ...strip,
        tabs: strip.tabs.map((tab) => (tab.id === tabId ? { ...tab, label } : tab)),
    };
}

/** Marks a tab as holding unsaved work, which excludes it from a silent bulk close. */
export function setTabDirty(strip: TabStripState, tabId: string, dirty: boolean): TabStripState {
    return {
        ...strip,
        tabs: strip.tabs.map((tab) => (tab.id === tabId ? { ...tab, dirty } : tab)),
    };
}

/**
 * Attaches (or clears) a tab's appearance record.
 *
 * The attach point the appearance editor will use. It is here rather than left
 * to that work so the round trip through storage is already tested against a
 * record this module never looks inside.
 */
export function setTabAppearance(
    strip: TabStripState,
    tabId: string,
    appearance: AppearanceRecord | null,
): TabStripState {
    return {
        ...strip,
        tabs: strip.tabs.map((tab) => (tab.id === tabId ? { ...tab, appearance } : tab)),
    };
}

/** The same attach point for a group. */
export function setGroupAppearance(
    strip: TabStripState,
    groupId: string,
    appearance: AppearanceRecord | null,
): TabStripState {
    return {
        ...strip,
        groups: strip.groups.map((group) =>
            group.id === groupId ? { ...group, appearance } : group,
        ),
    };
}

/* -------------------------------------------------------------------------- */
/* Pinning                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Pins a tab: it leaves its group and the ordinary region and joins the end of
 * the pinned region.
 *
 * Leaving the group is the deliberate part; see the module note. It is also
 * recoverable, because unpinning puts the tab back at the front of the ordinary
 * region rather than somewhere arbitrary.
 */
export function pinTab(strip: TabStripState, tabId: string): TabStripState {
    if (!strip.tabs.some((tab) => tab.id === tabId)) return strip;
    if (strip.pinnedOrder.includes(tabId)) return strip;
    return normalizeStrip({
        ...strip,
        groups: strip.groups.map((group) => ({
            ...group,
            tabIds: group.tabIds.filter((id) => id !== tabId),
        })),
        slots: without(strip.slots, (slot) => slot.kind === "tab" && slot.tabId === tabId),
        pinnedOrder: [...strip.pinnedOrder, tabId],
    });
}

/**
 * Unpins a tab into the front of the ordinary region.
 *
 * The front rather than the end: the tab was sitting immediately left of the
 * ordinary tabs a moment ago, so the front is where the eye already is. Sending
 * it to the far end of a strip that overflows would make an unpin look like a
 * close.
 */
export function unpinTab(strip: TabStripState, tabId: string): TabStripState {
    if (!strip.pinnedOrder.includes(tabId)) return strip;
    return normalizeStrip({
        ...strip,
        pinnedOrder: strip.pinnedOrder.filter((id) => id !== tabId),
        slots: [{ kind: "tab", tabId }, ...strip.slots],
    });
}

/* -------------------------------------------------------------------------- */
/* Reordering                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Which run of the strip a tab is reordered inside.
 *
 * A tab never jumps between regions by being nudged: a pinned tab moves within
 * the pinned region, a grouped tab within its group, and an ordinary tab within
 * the ordinary slots. Crossing a boundary is {@link pinTab},
 * {@link unpinTab} or {@link assignTabToGroup}, all of which are explicit
 * actions with their own menu items, because a drag that silently ungrouped a
 * tab would be indistinguishable from a bug.
 */
export type TabRegion = "pinned" | "group" | "ordinary";

export function regionOfTab(strip: TabStripState, tabId: string): TabRegion | null {
    if (strip.pinnedOrder.includes(tabId)) return "pinned";
    if (strip.groups.some((group) => group.tabIds.includes(tabId))) return "group";
    if (strip.slots.some((slot) => slot.kind === "tab" && slot.tabId === tabId)) return "ordinary";
    return null;
}

/** Nudges a tab one or more places within its own region. */
export function moveTab(strip: TabStripState, tabId: string, delta: number): TabStripState {
    if (delta === 0) return strip;
    const region = regionOfTab(strip, tabId);
    if (region === null) return strip;

    if (region === "pinned") {
        return {
            ...strip,
            pinnedOrder: shift(strip.pinnedOrder, strip.pinnedOrder.indexOf(tabId), delta),
        };
    }
    if (region === "group") {
        return {
            ...strip,
            groups: strip.groups.map((group) =>
                group.tabIds.includes(tabId)
                    ? { ...group, tabIds: shift(group.tabIds, group.tabIds.indexOf(tabId), delta) }
                    : group,
            ),
        };
    }
    const index = strip.slots.findIndex((slot) => slot.kind === "tab" && slot.tabId === tabId);
    return { ...strip, slots: shift(strip.slots, index, delta) };
}

/**
 * Drops a tab at an exact index within its own region, which is what a pointer
 * drag produces.
 *
 * Shares {@link shift} with {@link moveTab} so a drag and a keyboard nudge cannot
 * end up with two different ideas of what an index means.
 */
export function moveTabToIndex(strip: TabStripState, tabId: string, index: number): TabStripState {
    const region = regionOfTab(strip, tabId);
    if (region === null) return strip;

    if (region === "pinned") {
        return {
            ...strip,
            pinnedOrder: moveTo(strip.pinnedOrder, strip.pinnedOrder.indexOf(tabId), index),
        };
    }
    if (region === "group") {
        return {
            ...strip,
            groups: strip.groups.map((group) =>
                group.tabIds.includes(tabId)
                    ? { ...group, tabIds: moveTo(group.tabIds, group.tabIds.indexOf(tabId), index) }
                    : group,
            ),
        };
    }
    const from = strip.slots.findIndex((slot) => slot.kind === "tab" && slot.tabId === tabId);
    return { ...strip, slots: moveTo(strip.slots, from, index) };
}

/**
 * Nudges a whole group past its neighbouring slot.
 *
 * Because a group occupies one slot, moving it past a lone tab and moving it
 * past another group are the same operation, and its members travel with it
 * without any of their own order changing.
 */
export function moveGroup(strip: TabStripState, groupId: string, delta: number): TabStripState {
    const index = strip.slots.findIndex(
        (slot) => slot.kind === "group" && slot.groupId === groupId,
    );
    if (index === -1 || delta === 0) return strip;
    return { ...strip, slots: shift(strip.slots, index, delta) };
}

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

/** The colours a new group may be given, in the order the menu offers them. */
export const GROUP_COLORS = [
    "primary",
    "secondary",
    "tertiary",
    "success",
    "warning",
    "error",
    "info",
] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export const DEFAULT_GROUP_COLOR: GroupColor = "primary";

/**
 * Creates a group holding the given tabs, in the order they were given.
 *
 * The group takes the position of the first of those tabs, so a group made from
 * tabs the user was already looking at appears where they were looking rather
 * than at the end of the strip. Pinned tabs among them are unpinned first, for
 * the reason in the module note.
 */
export function createGroup(
    strip: TabStripState,
    group: { readonly id?: string; readonly name: string; readonly color?: string },
    tabIds: readonly string[],
): TabStripState {
    const known = new Set(strip.tabs.map((tab) => tab.id));
    const members = [...new Set(tabIds)].filter((id) => known.has(id));
    if (members.length === 0) return strip;

    const id =
        group.id ??
        nextId(
            strip.groups.map((existing) => existing.id),
            "group",
        );
    const record: TabGroup = {
        id,
        name: group.name,
        color: group.color ?? DEFAULT_GROUP_COLOR,
        collapsed: false,
        tabIds: members,
        appearance: null,
    };

    const member = new Set(members);
    const slotIndex = strip.slots.findIndex(
        (slot) => slot.kind === "tab" && member.has(slot.tabId),
    );
    const remaining = without(strip.slots, (slot) => slot.kind === "tab" && member.has(slot.tabId));
    const at = slotIndex === -1 ? remaining.length : Math.min(slotIndex, remaining.length);
    const slots = [
        ...remaining.slice(0, at),
        { kind: "group", groupId: id } as TabSlot,
        ...remaining.slice(at),
    ];

    return normalizeStrip({
        ...strip,
        groups: [
            ...strip.groups.map((existing) => ({
                ...existing,
                tabIds: existing.tabIds.filter((tabId) => !member.has(tabId)),
            })),
            record,
        ],
        pinnedOrder: strip.pinnedOrder.filter((tabId) => !member.has(tabId)),
        slots,
    });
}

/**
 * One group a host wants a *fresh* workspace seeded into, named by page rather than by tab.
 *
 * A host declares pages, not tabs: it has no way of knowing which tab id a page will get,
 * because ids are handed out as the tabs are created. So a seed names page ids and
 * {@link applyGroupSeeds} resolves them once the tabs exist, which is also what makes a seed
 * safe to declare for a page this build might not ship - an unknown id is skipped rather
 * than producing an empty group with a name and nothing under it.
 *
 * This describes a *default*, not a structure. Everything a seeded group has - its name, its
 * colour, whether it is collapsed, what is in it, whether it exists at all - is editable
 * afterwards through the ordinary group commands, and the edit is what gets persisted. The
 * seed is consulted exactly once, on a workspace that has never been saved.
 */
export interface TabGroupSeed {
    /** Fixed rather than generated when a host wants a stable id in its own tests. */
    readonly id?: string;
    readonly name: string;
    readonly color?: string;
    /**
     * Defaults to collapsed, because that is the whole point of seeding groups: a fresh
     * install shows a short strip of names instead of one row per destination. A seed that
     * wants its members visible from the first launch says `false` explicitly.
     */
    readonly collapsed?: boolean;
    /** In the order they should sit inside the group. */
    readonly pageIds: readonly string[];
}

/**
 * The order tabs are created in on a fresh install, given the groups they are being seeded
 * into: every ungrouped page first, in the host's declared order, then each group's pages in
 * the order that group names them.
 *
 * This exists because {@link createGroup} takes the position of the first member it is given,
 * measured against the slots that are left after the members are lifted out. Creating three
 * groups out of pages interleaved with ungrouped ones therefore lands the second and third
 * groups at positions that are arithmetically correct and impossible to predict by reading
 * the page list, which is a poor thing to hand somebody as a default layout. Seeding the
 * ungrouped pages first makes each group's members a contiguous run at the end, so the groups
 * come out in the order they were declared, after the loose tabs, every time.
 *
 * A page named by two seeds belongs to the first that names it, matching
 * {@link normalizeStrip}'s own "first mention wins" repair. A page named by no seed keeps its
 * declared position among the other ungrouped pages.
 */
export function seedTabOrder(
    pages: readonly TabPage[],
    seeds: readonly TabGroupSeed[],
): readonly TabPage[] {
    const byId = new Map(pages.map((page) => [page.id, page]));
    const claimed = new Set<string>();
    const grouped: TabPage[] = [];
    for (const seed of seeds) {
        for (const pageId of seed.pageIds) {
            const page = byId.get(pageId);
            if (page === undefined || claimed.has(pageId)) continue;
            claimed.add(pageId);
            grouped.push(page);
        }
    }
    return [...pages.filter((page) => !claimed.has(page.id)), ...grouped];
}

/**
 * Creates one group per seed out of the tabs already showing those pages.
 *
 * Deliberately narrow, and every exclusion here is load-bearing:
 *
 *  - a **pinned** tab is skipped rather than pulled into the group, because
 *    {@link createGroup} unpins what it takes (see the module note) and a host that asks for
 *    a page to be both pinned and grouped means the pin - the pinned region is the promise
 *    that a landing tab stays at the front of the strip.
 *  - a page with **no tab** is skipped, which is what makes a seed for a page this build
 *    does not ship a no-op instead of an empty group.
 *  - a seed left with **no members at all** creates nothing, because a name with nothing
 *    under it is a row that does nothing when clicked.
 *
 * Collapsed is written through {@link setGroupCollapsed} rather than baked into
 * {@link createGroup}, so the one function that owns that preference stays the one function
 * that writes it.
 */
export function applyGroupSeeds(
    strip: TabStripState,
    seeds: readonly TabGroupSeed[],
): TabStripState {
    return seeds.reduce<TabStripState>((state, seed) => {
        const pinned = new Set(state.pinnedOrder);
        const members = seed.pageIds
            .map((pageId) => state.tabs.find((tab) => tab.pageId === pageId))
            .filter((tab): tab is TabRecord => tab !== undefined && !pinned.has(tab.id))
            .map((tab) => tab.id);
        if (members.length === 0) return state;

        const id =
            seed.id ??
            nextId(
                state.groups.map((group) => group.id),
                "group",
            );
        const grouped = createGroup(state, { id, name: seed.name, color: seed.color }, members);
        return seed.collapsed === false ? grouped : setGroupCollapsed(grouped, id, true);
    }, strip);
}

export function renameGroup(strip: TabStripState, groupId: string, name: string): TabStripState {
    return {
        ...strip,
        groups: strip.groups.map((group) => (group.id === groupId ? { ...group, name } : group)),
    };
}

export function setGroupColor(strip: TabStripState, groupId: string, color: string): TabStripState {
    return {
        ...strip,
        groups: strip.groups.map((group) => (group.id === groupId ? { ...group, color } : group)),
    };
}

/**
 * Writes the collapsed preference.
 *
 * The only path that may change it. A search result landing inside a collapsed
 * group reveals it through the runtime set instead, which is the whole point of
 * that set existing.
 */
export function setGroupCollapsed(
    strip: TabStripState,
    groupId: string,
    collapsed: boolean,
): TabStripState {
    return {
        ...strip,
        groups: strip.groups.map((group) =>
            group.id === groupId ? { ...group, collapsed } : group,
        ),
    };
}

/**
 * Removes a group and leaves its tabs where the group was.
 *
 * Removing a group is not closing its tabs. Those are different actions with
 * very different consequences, and only one of them is reversible, so this one
 * never touches a tab: the members become lone tabs occupying the slot the group
 * held, in the order they had inside it.
 */
export function removeGroup(strip: TabStripState, groupId: string): TabStripState {
    const group = strip.groups.find((candidate) => candidate.id === groupId);
    if (group === undefined) return strip;

    const index = strip.slots.findIndex(
        (slot) => slot.kind === "group" && slot.groupId === groupId,
    );
    const replacement: TabSlot[] = group.tabIds.map((tabId) => ({ kind: "tab", tabId }));
    const slots =
        index === -1
            ? [...strip.slots, ...replacement]
            : [...strip.slots.slice(0, index), ...replacement, ...strip.slots.slice(index + 1)];

    return normalizeStrip({
        ...strip,
        groups: without(strip.groups, (candidate) => candidate.id === groupId),
        slots,
    });
}

/**
 * Moves a tab into a group, or out of every group when `groupId` is null.
 *
 * Pinned tabs are unpinned on the way in, for the reason in the module note. A
 * tab moved out lands at the end of the ordinary region rather than back at the
 * group's slot, because the group is still there and dropping the tab beside it
 * would look like it never left.
 */
export function assignTabToGroup(
    strip: TabStripState,
    tabId: string,
    groupId: string | null,
): TabStripState {
    if (!strip.tabs.some((tab) => tab.id === tabId)) return strip;
    if (groupId !== null && !strip.groups.some((group) => group.id === groupId)) return strip;

    const stripped: TabStripState = {
        ...strip,
        groups: strip.groups.map((group) => ({
            ...group,
            tabIds: group.tabIds.filter((id) => id !== tabId),
        })),
        pinnedOrder: strip.pinnedOrder.filter((id) => id !== tabId),
        slots: without(strip.slots, (slot) => slot.kind === "tab" && slot.tabId === tabId),
    };

    if (groupId === null) {
        return normalizeStrip({ ...stripped, slots: [...stripped.slots, { kind: "tab", tabId }] });
    }
    return normalizeStrip({
        ...stripped,
        groups: stripped.groups.map((group) =>
            group.id === groupId ? { ...group, tabIds: [...group.tabIds, tabId] } : group,
        ),
    });
}

/* -------------------------------------------------------------------------- */
/* Overflow                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How many of a run of items fit, given their measured widths.
 *
 * Separate from the component because the arithmetic is the part that goes
 * wrong, and it goes wrong in a way no screenshot catches: an off-by-one here
 * clips the last tab under the overflow button instead of listing it, and the
 * tab is still *there*, just unreachable. The rule the contract sets is that
 * nothing is ever silently clipped, so when anything overflows the button has to
 * be paid for out of the budget too - otherwise the button itself covers the tab
 * that only just fitted.
 *
 * Zero and negative budgets happen for one frame before the first layout and in
 * a jsdom test, where every measurement is zero. Both answer "all of them",
 * which keeps the strip complete rather than briefly emptying it.
 */
export function fitCount(
    widths: readonly number[],
    available: number,
    overflowWidth: number,
): number {
    if (widths.length === 0) return 0;
    const total = widths.reduce((sum, width) => sum + width, 0);
    if (available <= 0 || total <= available) return widths.length;

    const budget = available - overflowWidth;
    let used = 0;
    let count = 0;
    for (const width of widths) {
        if (used + width > budget) break;
        used += width;
        count++;
    }
    return count;
}

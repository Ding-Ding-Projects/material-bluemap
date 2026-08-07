/**
 * The EULA viewer's own tab strip, and the part of it that outlives a launch.
 *
 * The viewer uses this project's tab system - the same `TabStrip`, the same
 * `tabModel.ts` operations, so it gets overflow, reordering, pinning, grouping and all
 * four searches without a second implementation of any of them. What it deliberately does
 * *not* share is the storage key: `tabStorage.ts` writes the application's own workspace
 * under one fixed key and reads `strips[0]` back, so a viewer persisting through it would
 * overwrite the user's real tab layout with a licence.
 *
 * So this is the same shape of module with its own key, plus one thing the application's
 * strip does not need: **reconciliation**.
 *
 * ## Why a stored layout has to be reconciled rather than restored
 *
 * The tabs come from the document. If Mojang revises the licence, the sections change,
 * and a layout restored verbatim would show tabs pointing at ranges that no longer exist
 * - a tab labelled "Termination" opening an empty panel is worse than no tab at all. So
 * {@link reconcileEulaStrip} keeps every tab whose section is still there, in the order
 * and grouping the user gave it, drops the ones that are not, and appends the sections
 * that are new. A layout that has nothing left in common with the document is discarded
 * and the defaults are seeded, for the same reason `TabbedNavigation` seeds rather than
 * restoring half a layout: half a layout is indistinguishable from a bug.
 */

import {
    addTab,
    closeTabs,
    DEFAULT_TAB_PLACEMENT,
    normalizeStrip,
    renameTab,
    setActiveTab,
    type TabPage,
    type TabStripState,
} from "../tabs/tabModel.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

const STORAGE_KEY = "worldlens-eula-tabs";

/** Bumped when the stored shape changes in a way reconciliation cannot repair. */
export const EULA_TAB_STORAGE_VERSION = 1;

/** The two methods used, so a test passes a plain object and nothing else leaks. */
export interface EulaTabStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

function defaultStorage(): EulaTabStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Reading `localStorage` itself throws where storage is blocked outright.
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

/**
 * The stored strip, or null when there is none this build can use.
 *
 * Only the fields that carry a user's arrangement are read back. Labels are *not*: they
 * come from the document and from the current language mode, so a label restored from
 * disk would be last month's wording of a section that has since been reworded, in a
 * language the user may have stopped using.
 */
export function readEulaStrip(
    storage: EulaTabStorage | null = defaultStorage(),
): TabStripState | null {
    if (storage === null) return null;
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) return null;
        if (parsed["version"] !== EULA_TAB_STORAGE_VERSION) return null;
        const strip = parsed["strip"];
        if (!isRecord(strip)) return null;

        const tabs = Array.isArray(strip["tabs"])
            ? strip["tabs"]
                  .filter(isRecord)
                  .filter(
                      (tab) => typeof tab["id"] === "string" && typeof tab["pageId"] === "string",
                  )
                  .map((tab) => ({
                      id: tab["id"] as string,
                      pageId: tab["pageId"] as string,
                      label:
                          typeof tab["label"] === "string" ? tab["label"] : (tab["id"] as string),
                      icon: typeof tab["icon"] === "string" ? tab["icon"] : null,
                      dirty: false,
                      appearance: isRecord(tab["appearance"]) ? tab["appearance"] : null,
                  }))
            : [];
        if (tabs.length === 0) return null;

        const groups = Array.isArray(strip["groups"])
            ? strip["groups"]
                  .filter(isRecord)
                  .filter((group) => typeof group["id"] === "string")
                  .map((group) => ({
                      id: group["id"] as string,
                      name:
                          typeof group["name"] === "string"
                              ? group["name"]
                              : (group["id"] as string),
                      color: typeof group["color"] === "string" ? group["color"] : "primary",
                      collapsed: group["collapsed"] === true,
                      tabIds: asStringArray(group["tabIds"]),
                      appearance: isRecord(group["appearance"]) ? group["appearance"] : null,
                  }))
            : [];

        const slots = Array.isArray(strip["slots"])
            ? strip["slots"]
                  .filter(isRecord)
                  .map((slot) =>
                      slot["kind"] === "group" && typeof slot["groupId"] === "string"
                          ? ({ kind: "group", groupId: slot["groupId"] } as const)
                          : slot["kind"] === "tab" && typeof slot["tabId"] === "string"
                            ? ({ kind: "tab", tabId: slot["tabId"] } as const)
                            : null,
                  )
                  .filter(
                      (
                          slot,
                      ): slot is
                          { kind: "tab"; tabId: string } | { kind: "group"; groupId: string } =>
                          slot !== null,
                  )
            : [];

        const activeTabId = strip["activeTabId"];

        return normalizeStrip({
            id: "strip-eula",
            label: typeof strip["label"] === "string" ? strip["label"] : "strip-eula",
            windowId: "window-eula",
            windowLabel: typeof strip["windowLabel"] === "string" ? strip["windowLabel"] : "",
            placement:
                strip["placement"] === "left" ||
                strip["placement"] === "right" ||
                strip["placement"] === "top" ||
                strip["placement"] === "bottom"
                    ? strip["placement"]
                    : DEFAULT_TAB_PLACEMENT,
            tabs,
            groups,
            pinnedOrder: asStringArray(strip["pinnedOrder"]),
            slots,
            activeTabId: typeof activeTabId === "string" ? activeTabId : null,
        });
    } catch {
        return null;
    }
}

/** Writes the strip, silently doing nothing where storage refuses. */
export function writeEulaStrip(
    strip: TabStripState,
    storage: EulaTabStorage | null = defaultStorage(),
): void {
    // Fire-and-forget mirror into the main process's own settings history, whether or not
    // there is a local `storage` to write to - see `appSettingsHistorySync.ts`'s own doc
    // comment.
    recordAppSetting("eulaTabs", strip);
    if (storage === null) return;
    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                version: EULA_TAB_STORAGE_VERSION,
                strip: {
                    label: strip.label,
                    windowLabel: strip.windowLabel,
                    placement: strip.placement,
                    tabs: strip.tabs.map((tab) => ({
                        id: tab.id,
                        pageId: tab.pageId,
                        label: tab.label,
                        icon: tab.icon,
                        appearance: tab.appearance,
                    })),
                    groups: strip.groups.map((group) => ({
                        id: group.id,
                        name: group.name,
                        color: group.color,
                        collapsed: group.collapsed,
                        tabIds: [...group.tabIds],
                        appearance: group.appearance,
                    })),
                    pinnedOrder: [...strip.pinnedOrder],
                    slots: strip.slots.map((slot) => ({ ...slot })),
                    activeTabId: strip.activeTabId,
                },
            }),
        );
    } catch {
        // Private mode or a full quota. A remembered arrangement of licence tabs is
        // nowhere near worth a notification.
    }
}

/** A fresh strip: one tab per section, in document order, with the first one active. */
export function seedEulaStrip(
    pages: readonly TabPage[],
    label: string,
    windowLabel: string,
): TabStripState {
    const empty: TabStripState = {
        id: "strip-eula",
        label,
        windowId: "window-eula",
        windowLabel,
        placement: DEFAULT_TAB_PLACEMENT,
        tabs: [],
        groups: [],
        pinnedOrder: [],
        slots: [],
        activeTabId: null,
    };
    const seeded = pages.reduce<TabStripState>(
        (state, page) =>
            addTab(state, {
                id: `tab-${page.id}`,
                pageId: page.id,
                label: page.label,
                icon: page.icon,
            }),
        empty,
    );
    const first = seeded.tabs[0];
    return first === undefined ? seeded : setActiveTab(seeded, first.id);
}

/**
 * A stored arrangement, brought into line with the document that is actually loaded.
 *
 * Order, pinning, grouping and the collapsed state all survive; labels are refreshed from
 * the current sections and the current language, tabs whose section is gone are closed,
 * and sections with no tab get one at the end. A strip with no surviving tab at all is
 * rejected so the caller seeds instead.
 */
export function reconcileEulaStrip(
    stored: TabStripState,
    pages: readonly TabPage[],
    label: string,
    windowLabel: string,
): TabStripState | null {
    const byId = new Map(pages.map((page) => [page.id, page]));

    const gone = stored.tabs.filter((tab) => !byId.has(tab.pageId)).map((tab) => tab.id);
    let strip: TabStripState = gone.length === 0 ? stored : closeTabs(stored, gone);
    if (strip.tabs.length === 0) return null;

    // Labels come from the document and the language mode, never from the file.
    for (const tab of strip.tabs) {
        const page = byId.get(tab.pageId);
        if (page !== undefined && page.label !== tab.label)
            strip = renameTab(strip, tab.id, page.label);
    }

    const covered = new Set(strip.tabs.map((tab) => tab.pageId));
    const wasActive = strip.activeTabId;
    for (const page of pages) {
        if (covered.has(page.id)) continue;
        strip = addTab(strip, {
            id: `tab-${page.id}`,
            pageId: page.id,
            label: page.label,
            icon: page.icon,
        });
    }
    // `addTab` activates what it opens, which is right for a "new tab" gesture and wrong
    // here: appending sections the document grew must not move somebody off the section
    // they were reading last time.
    if (wasActive !== null && strip.tabs.some((tab) => tab.id === wasActive)) {
        strip = setActiveTab(strip, wasActive);
    }

    return normalizeStrip({ ...strip, label, windowLabel });
}

/**
 * The part of a tab strip that outlives the application being closed.
 *
 * The contract names six things that must survive a restart - tab order, pinned
 * order, groups, group order, collapsed state and membership - and the model in
 * `tabModel.ts` was shaped so that each of those is exactly one field. This
 * module is therefore almost boring: it writes those fields as JSON and reads
 * them back through a validator, and {@link normalizeStrip} repairs whatever
 * arrives.
 *
 * ### What is not persisted, and why
 *
 * `dirty` is runtime state. A tab holding unsaved work at the moment the
 * application closed is not holding it on the next launch - either the work was
 * saved, or it is gone, and in both cases a restored `dirty: true` would be a
 * lie that then protects the tab from a bulk close for no reason. So it is
 * dropped on write and defaults to false on read.
 *
 * Search queries and regex patterns are not persisted either. They are not
 * ordinary layout preferences, they can contain anything a person typed, and the
 * contract asks for exactly the opposite of storing them without a reason. Each
 * field starts empty on launch.
 *
 * `appearance` **is** persisted, verbatim, without being inspected. It is the
 * slot the per-element appearance editor will fill, and a round trip that
 * silently dropped keys it did not recognise would lose a newer build's work
 * every time an older build ran once.
 *
 * ### Storage failure is not an error worth showing anybody
 *
 * A blocked or full storage throws on write, and the consequence is that a tab
 * layout does not survive a restart. That is annoying and nowhere near a
 * notification, so both directions swallow it, exactly as `palettePrefs.ts`
 * does for the palette's size. A stored value that is not the shape this build
 * knows is discarded rather than trusted, because the file is editable by hand
 * and is written by other versions of this application.
 */

import {
    normalizeStrip,
    type AppearanceRecord,
    type TabGroup,
    type TabRecord,
    type TabSlot,
    type TabStripState,
    type TabWorkspaceState,
} from "./tabModel.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/**
 * The key the application shell's own workspace has always been written under.
 *
 * Exported so a second `TabbedNavigation` mounted for a different surface -
 * settings, the config editor, a project's editor - can be told to use a key of
 * its own rather than silently sharing this one. Two independent tab strips
 * writing the same key would each stomp the other's layout on every change,
 * which is a worse bug than the one this file exists to prevent: a settings
 * tab order that occasionally reverts to the map shell's.
 */
export const DEFAULT_TAB_STORAGE_KEY = "material-bluemap-tabs";

/**
 * The shape written today.
 *
 * Bumping it is how a future change that cannot be repaired by
 * {@link normalizeStrip} refuses an old file instead of half-reading it.
 */
export const TAB_STORAGE_VERSION = 1;

/** The two methods used, so a test can pass a plain object and nothing else leaks. */
export interface TabStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

function defaultStorage(): TabStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Reading `localStorage` itself throws where storage is blocked outright.
        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Kept whole when it is an object, discarded when it is anything else. */
function asAppearance(value: unknown): AppearanceRecord | null {
    return isRecord(value) ? (value as AppearanceRecord) : null;
}

function readTab(value: unknown): TabRecord | null {
    if (!isRecord(value)) return null;
    const id = value["id"];
    const pageId = value["pageId"];
    if (typeof id !== "string" || id === "" || typeof pageId !== "string" || pageId === "") return null;
    const icon = value["icon"];
    return {
        id,
        pageId,
        label: asString(value["label"], id),
        icon: typeof icon === "string" ? icon : null,
        dirty: false,
        appearance: asAppearance(value["appearance"]),
    };
}

function readGroup(value: unknown): TabGroup | null {
    if (!isRecord(value)) return null;
    const id = value["id"];
    if (typeof id !== "string" || id === "") return null;
    return {
        id,
        name: asString(value["name"], id),
        color: asString(value["color"], "primary"),
        collapsed: value["collapsed"] === true,
        tabIds: asStringArray(value["tabIds"]),
        appearance: asAppearance(value["appearance"]),
    };
}

function readSlot(value: unknown): TabSlot | null {
    if (!isRecord(value)) return null;
    const kind = value["kind"];
    if (kind === "tab" && typeof value["tabId"] === "string") return { kind: "tab", tabId: value["tabId"] };
    if (kind === "group" && typeof value["groupId"] === "string") return { kind: "group", groupId: value["groupId"] };
    return null;
}

function readStrip(value: unknown): TabStripState | null {
    if (!isRecord(value)) return null;
    const id = value["id"];
    if (typeof id !== "string" || id === "") return null;

    const tabs = Array.isArray(value["tabs"])
        ? value["tabs"].map(readTab).filter((tab): tab is TabRecord => tab !== null)
        : [];
    // A strip with no tabs carries no information and would only shadow the
    // defaults the host would otherwise seed, so it is refused rather than
    // restored as an empty strip nobody asked for.
    if (tabs.length === 0) return null;

    const groups = Array.isArray(value["groups"])
        ? value["groups"].map(readGroup).filter((group): group is TabGroup => group !== null)
        : [];
    const slots = Array.isArray(value["slots"])
        ? value["slots"].map(readSlot).filter((slot): slot is TabSlot => slot !== null)
        : [];
    const activeTabId = value["activeTabId"];

    return normalizeStrip({
        id,
        label: asString(value["label"], id),
        windowId: asString(value["windowId"], "main"),
        windowLabel: asString(value["windowLabel"], ""),
        tabs,
        groups,
        pinnedOrder: asStringArray(value["pinnedOrder"]),
        slots,
        activeTabId: typeof activeTabId === "string" ? activeTabId : null,
    });
}

/**
 * The stored workspace, or null when there is none, it is unreadable, it was
 * written by a version this build does not understand, or it is junk.
 *
 * Null rather than an empty workspace, so the caller can tell "nothing saved,
 * seed the defaults" apart from "saved, and it really was empty".
 */
export function readTabWorkspace(
    storage: TabStorage | null = defaultStorage(),
    key: string = DEFAULT_TAB_STORAGE_KEY,
): TabWorkspaceState | null {
    if (storage === null) return null;
    try {
        const raw = storage.getItem(key);
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) return null;
        if (parsed["version"] !== TAB_STORAGE_VERSION) return null;
        const strips = Array.isArray(parsed["strips"])
            ? parsed["strips"].map(readStrip).filter((strip): strip is TabStripState => strip !== null)
            : [];
        return strips.length === 0 ? null : { strips };
    } catch {
        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/** The JSON a strip becomes: every ordering field, and nothing runtime. */
function writableStrip(strip: TabStripState): Record<string, unknown> {
    return {
        id: strip.id,
        label: strip.label,
        windowId: strip.windowId,
        windowLabel: strip.windowLabel,
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
    };
}

/** Writes the workspace, silently doing nothing where storage refuses. */
export function writeTabWorkspace(
    workspace: TabWorkspaceState,
    storage: TabStorage | null = defaultStorage(),
    key: string = DEFAULT_TAB_STORAGE_KEY,
): void {
    if (storage === null) return;
    try {
        storage.setItem(
            key,
            JSON.stringify({ version: TAB_STORAGE_VERSION, strips: workspace.strips.map(writableStrip) }),
        );
    } catch {
        // Private mode or a full quota. A remembered tab layout is not worth a toast.
    }
    // Fire-and-forget mirror into the main process's own settings history, on top of the
    // localStorage write above - see `appSettingsHistorySync.ts`'s own doc comment. Namespaced
    // under `tabs.<key>` because this one module backs several independent tab strips (the
    // main shell, Settings, the config editor, a project editor), each under its own
    // `localStorage` key, and they must not collide in the shared bag either.
    recordAppSetting(`tabs.${key}`, workspace);
}

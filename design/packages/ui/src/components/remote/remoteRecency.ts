/**
 * Which saved machine somebody chose most recently, so the list they pick from puts the one
 * they probably want at the top instead of making them re-read every row.
 *
 * ## Why this is a separate store from `remoteTargets.ts`
 *
 * A machine's identity - its host, its port, its key path - is a decision somebody made once
 * and the main process has to validate before it is safe to act on. *When it was last used*
 * is neither: it is never sent to `ssh`, never shown to a host, and wrong in the worst case
 * only in the sense that the list is sorted a little oddly. Keeping it out of
 * {@link RemoteTarget} means a stale or corrupt recency entry can never become a field the
 * main process has to validate, and forgetting a machine never has to touch this file's
 * bookkeeping to stay correct - see {@link orderByRecency}'s own note on that.
 *
 * ## Mirrored the same way, for the same reason
 *
 * `recordUsed` calls {@link recordAppSetting} exactly as `saveTargets` does, under its own
 * key (`remoteTargetRecency`) so it cannot collide with the machines list itself in the
 * shared application-settings bag. It is a courtesy for the version-history panel, not a
 * promise anybody depends on: `localStorage` stays the source of truth here, and a browser
 * tab with no bridge simply keeps working with an ordering that resets next launch.
 */

import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import type { RemoteTarget } from "./remoteBridge.js";
import type { TargetStorage } from "./remoteTargets.js";

const STORAGE_KEY = "worldlens-remote-target-recency";

function defaultStorage(): TargetStorage | null {
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

/** A saved machine's id, mapped to the epoch millisecond it was last chosen for a render. */
export type RecencyMap = Readonly<Record<string, number>>;

/** The stored map, or an empty one. Never throws: a corrupt entry is dropped, not fatal. */
export function loadRecency(storage: TargetStorage | null = defaultStorage()): RecencyMap {
    if (storage === null) return {};
    let raw: string | null;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        return {};
    }
    if (raw === null || raw === "") return {};

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (!isRecord(parsed)) return {};

    const map: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
        if (typeof value === "number" && Number.isFinite(value)) map[id] = value;
    }
    return map;
}

function persist(map: RecencyMap, storage: TargetStorage | null): void {
    recordAppSetting("remoteTargetRecency", map);
    if (storage === null) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // Best effort, exactly like `remoteTargets.ts`'s own `saveTargets`: a browser that
        // refuses to persist this still lets somebody choose a machine and render with it.
    }
}

/** Marks one machine as chosen just now. Returns the map with that one change applied. */
export function recordUsed(
    id: string,
    storage: TargetStorage | null = defaultStorage(),
    map: RecencyMap = loadRecency(storage),
): RecencyMap {
    const next = { ...map, [id]: Date.now() };
    persist(next, storage);
    return next;
}

/**
 * The saved machines, most recently used first.
 *
 * A machine that has never been chosen sorts after every machine that has, and keeps its
 * position among the other never-chosen ones - so adding a new machine puts it where it was
 * added, not at the top or the bottom of the list, and a stale recency entry left behind by a
 * machine that was since forgotten (see `remoteTargets.ts`'s own `removeTarget`, which never
 * has to know this map exists) simply matches nothing here and changes no ordering.
 */
export function orderByRecency(
    targets: readonly RemoteTarget[],
    recency: RecencyMap,
): readonly RemoteTarget[] {
    const used: RemoteTarget[] = [];
    const unused: RemoteTarget[] = [];
    for (const target of targets) {
        if (recency[target.id] === undefined) unused.push(target);
        else used.push(target);
    }
    used.sort((a, b) => (recency[b.id] ?? 0) - (recency[a.id] ?? 0));
    return [...used, ...unused];
}

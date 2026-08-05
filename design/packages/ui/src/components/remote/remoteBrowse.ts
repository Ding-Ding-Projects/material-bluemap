/**
 * The Explorer-style remote browser's own logic: paths, breadcrumbs, sorting, keyboard
 * navigation and the world badge - all pure, so every rule here is provable without a DOM
 * and without a server, the same discipline `worldCatalog.ts` holds the local world list to.
 *
 * `RemoteFileBrowser.vue` is arrangement over this file, not a second copy of it.
 */

import type { RemoteEntry, RemoteOs } from "./remoteBridge.js";

/* -------------------------------------------------------------------------- */
/* Paths, the way each remote actually spells them                            */
/* -------------------------------------------------------------------------- */

/** `/` for Linux, `\` for Windows. Mirrors `remoteSeparator` in `main/remote/browse.ts`. */
export function remoteSeparator(os: RemoteOs): "/" | "\\" {
    return os === "windows" ? "\\" : "/";
}

/** Splits a remote path into its non-empty segments, accepting either separator either way. */
function splitSegments(path: string): string[] {
    return path.split(/[\\/]+/).filter((segment) => segment !== "");
}

/**
 * Joins a folder and a child name the way that remote's own shell would.
 *
 * Windows keeps a drive's own root (`C:\`) rather than doubling its separator, since
 * `C:\` + `\Users` would otherwise become `C:\\Users` - harmless to `ssh`, which is not the
 * point; it is confusing on screen, which is.
 */
export function joinRemotePath(parent: string, name: string, os: RemoteOs): string {
    const sep = remoteSeparator(os);
    if (parent === "") return name;
    return parent.endsWith(sep) ? `${parent}${name}` : `${parent}${sep}${name}`;
}

/**
 * True at the top of what this browser can go up from: a POSIX `/`, or a bare Windows drive
 * root such as `C:\`. Going up from either would only ever answer "there is nowhere higher",
 * so the Up action is disabled here rather than issuing a listing request that can only fail.
 */
export function isRemoteRoot(path: string, os: RemoteOs): boolean {
    const trimmed = path.trim();
    if (os === "windows") return /^[A-Za-z]:\\?$/.test(trimmed);
    return trimmed === "/";
}

/** The folder one level up, or null when {@link isRemoteRoot} already says there is none. */
export function parentRemotePath(path: string, os: RemoteOs): string | null {
    if (isRemoteRoot(path, os)) return null;
    const sep = remoteSeparator(os);
    const segments = splitSegments(path);
    if (segments.length <= 1) return os === "windows" && /^[A-Za-z]:$/.test(segments[0] ?? "") ? null : sep;
    if (os === "windows" && /^[A-Za-z]:$/.test(segments[0] ?? "")) {
        return segments.length === 2 ? `${segments[0]}${sep}` : segments.slice(0, -1).join(sep);
    }
    const parent = segments.slice(0, -1).join(sep);
    return os === "windows" ? parent : `${sep}${parent}`;
}

/** One clickable crumb: the label to show, and the full path clicking it opens. */
export interface Breadcrumb {
    readonly label: string;
    readonly path: string;
}

/**
 * The breadcrumb trail for a path, root first.
 *
 * A Windows path's first crumb is the drive letter itself (`C:`), which is what somebody
 * actually reads as "the top" on that OS - a bare `\` there would name nothing they
 * recognise. A POSIX path's first crumb is `/`, which is the root and is real to click.
 */
export function breadcrumbSegments(path: string, os: RemoteOs): readonly Breadcrumb[] {
    const sep = remoteSeparator(os);
    const segments = splitSegments(path);
    if (os === "windows") {
        const [drive, ...rest] = segments;
        if (drive === undefined) return [];
        const crumbs: Breadcrumb[] = [{ label: drive, path: `${drive}${sep}` }];
        let current = `${drive}${sep}`;
        for (const segment of rest) {
            current = joinRemotePath(current, segment, os);
            crumbs.push({ label: segment, path: current });
        }
        return crumbs;
    }
    const crumbs: Breadcrumb[] = [{ label: sep, path: sep }];
    let current: string = sep;
    for (const segment of segments) {
        current = joinRemotePath(current, segment, os);
        crumbs.push({ label: segment, path: current });
    }
    return crumbs;
}

/**
 * Reads whatever somebody typed into the path field into a path this OS would recognise.
 *
 * Accepts either separator regardless of which remote is in view, since a person moving a
 * path between a Linux box and a Windows box - or just typing from habit - should not be
 * refused for using the wrong slash. Never invents a drive letter or a leading slash that
 * was not there: an incomplete path is left incomplete, and the browser's own "could not be
 * listed" answer is what tells somebody it was not enough.
 */
export function normalizeTypedRemotePath(input: string, os: RemoteOs): string {
    const trimmed = input.trim();
    if (trimmed === "") return trimmed;
    const sep = remoteSeparator(os);
    if (os === "windows") {
        return trimmed.replace(/\//g, "\\");
    }
    return trimmed.replace(/\\/g, "/") || sep;
}

/* -------------------------------------------------------------------------- */
/* Sorting, the way Explorer's own column headers do                          */
/* -------------------------------------------------------------------------- */

export type SortColumn = "name" | "size" | "modified";
export type SortDirection = "ascending" | "descending";

/**
 * Sorts a directory listing the way Windows Explorer's own column headers do: folders
 * always above files regardless of which column is sorted, because "smallest first" putting
 * a folder of ten terabytes above a 4&nbsp;KB text file is not what anybody sorting by size
 * is asking for. Within each group, the chosen column breaks ties by name so the order is
 * stable and never depends on whatever order the remote happened to report entries in.
 */
export function sortRemoteEntries(
    entries: readonly RemoteEntry[],
    column: SortColumn,
    direction: SortDirection,
): readonly RemoteEntry[] {
    const sign = direction === "ascending" ? 1 : -1;
    return [...entries].sort((left, right) => {
        if (left.directory !== right.directory) return left.directory ? -1 : 1;
        const primary = compareByColumn(left, right, column);
        if (primary !== 0) return primary * sign;
        return left.name.localeCompare(right.name) * sign;
    });
}

function compareByColumn(left: RemoteEntry, right: RemoteEntry, column: SortColumn): number {
    switch (column) {
        case "name":
            return left.name.localeCompare(right.name);
        case "size": {
            const leftSize = left.sizeBytes ?? -1;
            const rightSize = right.sizeBytes ?? -1;
            return leftSize - rightSize;
        }
        case "modified": {
            const leftAt = left.modifiedAt === null ? -Infinity : Date.parse(left.modifiedAt);
            const rightAt = right.modifiedAt === null ? -Infinity : Date.parse(right.modifiedAt);
            return leftAt - rightAt;
        }
    }
}

/** Toggles a column header: clicking the active column flips direction; a new one starts ascending. */
export function nextSort(
    current: { readonly column: SortColumn; readonly direction: SortDirection },
    clicked: SortColumn,
): { readonly column: SortColumn; readonly direction: SortDirection } {
    if (current.column !== clicked) return { column: clicked, direction: "ascending" };
    return { column: clicked, direction: current.direction === "ascending" ? "descending" : "ascending" };
}

/* -------------------------------------------------------------------------- */
/* Keyboard: arrows, Home/End/PageUp/PageDown, and type-ahead                 */
/* -------------------------------------------------------------------------- */

/**
 * Where an arrow key moves the active row - the same non-wrapping model
 * `worldCatalog.ts`'s `nextOptionIndex` already proved for the local world list, restated
 * here because a `remote/` component importing from `world/` would be a strange dependency
 * for two lists that otherwise know nothing about each other.
 */
export function nextRowIndex(key: string, current: number, count: number): number {
    if (count <= 0) return -1;
    const at = current < 0 ? -1 : Math.min(current, count - 1);
    switch (key) {
        case "ArrowDown":
            return at < 0 ? 0 : Math.min(at + 1, count - 1);
        case "ArrowUp":
            return at < 0 ? count - 1 : Math.max(at - 1, 0);
        case "Home":
            return 0;
        case "End":
            return count - 1;
        case "PageDown":
            return at < 0 ? 0 : Math.min(at + 10, count - 1);
        case "PageUp":
            return at < 0 ? count - 1 : Math.max(at - 10, 0);
        default:
            return current;
    }
}

/**
 * Type-ahead: typing a letter jumps to the next row whose name starts with it.
 *
 * Case-insensitive, and starts searching **after** the current row so pressing the same
 * letter repeatedly cycles through every match rather than sitting on the first one -
 * exactly how Explorer's own type-ahead behaves. Wraps once around the whole list, because
 * type-ahead is a shortcut for finding a row, not a linear scan somebody has to watch.
 */
export function typeAheadIndex(entries: readonly RemoteEntry[], letter: string, current: number): number {
    if (entries.length === 0) return -1;
    const needle = letter.toLowerCase();
    for (let step = 1; step <= entries.length; step += 1) {
        const index = (current + step) % entries.length;
        if (entries[index]?.name.toLowerCase().startsWith(needle) === true) return index;
    }
    return current;
}

/* -------------------------------------------------------------------------- */
/* The world badge: what to show, and why                                     */
/* -------------------------------------------------------------------------- */

export type WorldBadgeKind = "world" | "partial" | "none";

/**
 * What the world badge says about one row, structured rather than a pre-baked sentence.
 *
 * The main process never localises anything - it has no copy catalogue - so it reports
 * `hasLevelDat` and `regionDimensions` as plain facts and this function turns them into the
 * three states the row actually renders. `RemoteFileBrowser.vue` turns `kind` into the
 * catalogue key that says why, in the viewer's own language and funny level; the fact stays
 * exact at every one of them.
 */
export interface WorldBadge {
    readonly kind: WorldBadgeKind;
    readonly hasLevelDat: boolean;
    readonly regionDimensions: readonly string[];
}

export function worldBadgeFor(entry: RemoteEntry): WorldBadge {
    if (!entry.directory || entry.symlink) {
        return { kind: "none", hasLevelDat: false, regionDimensions: [] };
    }
    const { hasLevelDat, regionDimensions, looksLikeWorld } = entry.world;
    if (looksLikeWorld) return { kind: "world", hasLevelDat, regionDimensions };
    if (hasLevelDat || regionDimensions.length > 0) {
        return { kind: "partial", hasLevelDat, regionDimensions };
    }
    return { kind: "none", hasLevelDat: false, regionDimensions: [] };
}

/* -------------------------------------------------------------------------- */
/* Sizes and dates, the way the columns show them                             */
/* -------------------------------------------------------------------------- */

/** `4,096 bytes`, `12.3 KB`, `1.4 GB` - null for a folder, which has no size of its own here. */
export function formatEntrySize(sizeBytes: number | null): string | null {
    if (sizeBytes === null) return null;
    if (sizeBytes < 1000) return `${String(sizeBytes)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = sizeBytes / 1000;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit += 1;
    }
    return `${value.toFixed(1)} ${units[unit] ?? "B"}`;
}

/** The viewer's own locale, medium date plus short time - null when the remote gave no date. */
export function formatEntryModified(modifiedAt: string | null): string | null {
    if (modifiedAt === null) return null;
    const at = new Date(modifiedAt);
    if (Number.isNaN(at.getTime())) return null;
    try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(at);
    } catch {
        return at.toISOString();
    }
}

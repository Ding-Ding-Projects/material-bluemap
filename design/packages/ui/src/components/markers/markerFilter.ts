import type { AnyMarkerData, AnyMarkerSetData, Vec3Like } from "./markerTypes.js";

export type SortOrder = "default" | "label" | "distance";
export type SearchMode = "text" | "regex";

/** Longest query accepted in either mode. Bounds both the filter and the builder preview. */
export const MAX_PATTERN_LENGTH = 512;

/**
 * Flags that must never reach the search predicate. `g` and `y` make a RegExp stateful
 * through `lastIndex`, so re-using one instance across marker fields would skip matches
 * at random. The builder still offers them for the preview, where scanning is the point.
 */
const SEARCH_UNSAFE_FLAGS = /[gy]/g;

/** Upstream monkey-patched `String.prototype.includesCI` in main.js; this replaces it. */
export function includesCI(haystack: string, needle: string): boolean {
    return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Strips the outermost HTML tag from a marker label, exactly as upstream's MarkerItem
 * did, so `<span>Spawn</span>` lists as `Spawn`. Player markers list by name, and a
 * marker with no usable label falls back to its id.
 */
export function markerDisplayLabel(marker: AnyMarkerData): string {
    if (marker.type === "player" && marker.name) return marker.name;

    if (marker.label) {
        const stripped = /^(?:<[^>]*>\s*)*([^<>]*\S[^<>]*)(?:<|$)/gi.exec(marker.label);
        if (stripped && stripped.length > 1 && stripped[1]) return stripped[1];
    }

    return marker.id;
}

/**
 * The fields the search runs against, matching upstream: id and label for every marker,
 * plus name and uuid for players.
 */
export function markerSearchFields(marker: AnyMarkerData): string[] {
    const fields: string[] = [marker.id];
    if (marker.label) fields.push(marker.label);
    if (marker.type === "player") {
        if (marker.name) fields.push(marker.name);
        if (marker.playerUuid) fields.push(marker.playerUuid);
    }
    return fields;
}

export function distanceToSquared(a: Vec3Like, b: Vec3Like): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

export interface CompiledPattern {
    regexp: RegExp | null;
    error: string | null;
}

/** Compiles a pattern for the search predicate, dropping the stateful scanning flags. */
export function compileSearchPattern(pattern: string, flags: string): CompiledPattern {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return {
            regexp: null,
            error: `Pattern is longer than ${MAX_PATTERN_LENGTH} characters.`,
        };
    }
    try {
        return { regexp: new RegExp(pattern, flags.replace(SEARCH_UNSAFE_FLAGS, "")), error: null };
    } catch (error) {
        return { regexp: null, error: (error as Error).message };
    }
}

export interface MarkerMatcher {
    /** Whether a marker passes the current query. */
    match: (marker: AnyMarkerData) => boolean;
    /** Set when the query is a regular expression that does not compile. */
    error: string | null;
    /** Whether a query is active at all, so callers can tell "no filter" from "no match". */
    active: boolean;
}

/**
 * Builds the search predicate once per query change. An invalid regular expression
 * yields `error` and matches nothing, so the list reports the syntax error instead of
 * silently re-running the last pattern that happened to compile.
 */
export function createMarkerMatcher(
    search: string,
    mode: SearchMode,
    flags: string,
): MarkerMatcher {
    if (!search) return { match: () => true, error: null, active: false };

    if (mode === "regex") {
        const { regexp, error } = compileSearchPattern(search, flags);
        if (!regexp) return { match: () => false, error, active: true };
        return {
            match: (marker) => markerSearchFields(marker).some((field) => regexp.test(field)),
            error: null,
            active: true,
        };
    }

    return {
        match: (marker) => markerSearchFields(marker).some((field) => includesCI(field, search)),
        error: null,
        active: true,
    };
}

/** The label used when sorting by name, so a marker without a label still sorts sanely. */
function sortLabel(marker: AnyMarkerData): string {
    return markerDisplayLabel(marker).toLowerCase();
}

/**
 * Drops unlisted markers, applies the query, then sorts. Ordering matches upstream:
 * `default` uses the marker's own `sorting` field, `label` compares lowercased names,
 * and `distance` compares squared distance to the camera.
 */
export function filterMarkers(
    markers: readonly AnyMarkerData[],
    matcher: MarkerMatcher,
    order: SortOrder,
    cameraPosition: Vec3Like,
): AnyMarkerData[] {
    const filtered = markers.filter((marker) => marker.listed && matcher.match(marker));

    return filtered.sort((a, b) => {
        if (order === "label") {
            const la = sortLabel(a);
            const lb = sortLabel(b);
            if (la < lb) return -1;
            if (la > lb) return 1;
            return 0;
        }
        if (order === "distance") {
            return (
                distanceToSquared(a.position, cameraPosition) -
                distanceToSquared(b.position, cameraPosition)
            );
        }
        return (a.sorting || 0) - (b.sorting || 0);
    });
}

/** Listed child sets, in `sorting` order. Child sets are never hidden by the query. */
export function filterMarkerSets(sets: readonly AnyMarkerSetData[]): AnyMarkerSetData[] {
    return sets.filter((set) => set.listed).sort((a, b) => (a.sorting || 0) - (b.sorting || 0));
}

export function countListedMarkers(set: AnyMarkerSetData): number {
    return set.markers.filter((marker) => marker.listed).length;
}

export function countListedMarkerSets(set: AnyMarkerSetData): number {
    return set.markerSets.filter((child) => child.listed).length;
}

/** Whether drilling into a set would show anything at all. */
export function isMarkerSetActive(set: AnyMarkerSetData): boolean {
    return countListedMarkers(set) > 0 || countListedMarkerSets(set) > 0;
}

/**
 * Depth-first path from `root` down to `target`, inclusive of both. Used for the
 * breadcrumb title (upstream's `parent > child`) and to tell whether an ancestor set is
 * hiding an otherwise-visible child in the 3D scene.
 */
export function findPathToSet(
    root: AnyMarkerSetData,
    target: AnyMarkerSetData,
): AnyMarkerSetData[] | null {
    if (root === target) return [root];
    for (const child of root.markerSets) {
        const path = findPathToSet(child, target);
        if (path) return [root, ...path];
    }
    return null;
}

/** Finds a set by id anywhere in the tree, for entry points such as the player list. */
export function findMarkerSetById(
    root: AnyMarkerSetData,
    id: string,
): AnyMarkerSetData | null {
    if (root.id === id) return root;
    for (const child of root.markerSets) {
        const found = findMarkerSetById(child, id);
        if (found) return found;
    }
    return null;
}

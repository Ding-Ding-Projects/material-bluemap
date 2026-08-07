/**
 * Searching settings.
 *
 * Two search surfaces are built on this. Each generated form has its own field
 * search, which filters the controls in front of the user; and the settings
 * screen has a search across every file at once, which is the one that answers
 * "I know the setting is called something like ambient light, where is it".
 *
 * Both take the same matcher, so a pattern that works in one works in the other,
 * and both state plainly when a match is sitting on a screen the user is not
 * looking at. A search bar that silently has results elsewhere is how somebody
 * concludes a setting does not exist.
 */

import type { FieldMeta } from "@worldlens/config";
import { fieldValue, type EditableConfigFile } from "./configModel.js";
import { searchTextForField, valueToText } from "./fieldValue.js";
import { createSettingMatcher, type SettingMatcher } from "./regexEngine.js";
import { entriesOfKind, type ConfigWorkspace, type EntryKind, type WorkspaceEntry } from "./configWorkspace.js";

/** The tabs the settings screen is divided into. */
export type ScreenId = "core" | "webapp" | "webserver" | "plugin" | "maps" | "storages" | "run";

export interface ScreenMeta {
    readonly id: ScreenId;
    readonly label: string;
    readonly description: string;
}

/**
 * Every screen, in the order the tab strip shows them.
 *
 * `run` is not a config file: it is the CLI's own flags, which are the other half
 * of "everything you would otherwise have typed". A person who can set every key
 * in every file but cannot say "render only the nether" still has to open a
 * terminal, so the flags belong in the same interface.
 */
export const SCREENS: readonly ScreenMeta[] = [
    { id: "core", label: "Core", description: "Folders, render threads, update timing and the debug log." },
    { id: "maps", label: "Maps", description: "One screen per map: world, bounds, lighting, tiles and markers." },
    { id: "storages", label: "Storages", description: "Where rendered tiles are written, on disk or into a database." },
    { id: "webapp", label: "Web app", description: "What a visitor sees, and where the web app is generated." },
    { id: "webserver", label: "Web server", description: "The built-in server: port, bind address and access log." },
    { id: "plugin", label: "Server plugin", description: "Live player markers and the settings only a server plugin uses." },
    { id: "run", label: "Run", description: "The command-line flags a render, a marker update or the web server is started with." },
];

const SCREEN_FOR_KIND: Record<EntryKind, ScreenId> = {
    core: "core",
    webapp: "webapp",
    webserver: "webserver",
    plugin: "plugin",
    map: "maps",
    storage: "storages",
};

/** Where one setting lives, in enough detail to navigate to it. */
export interface SettingLocation {
    readonly screenId: ScreenId;
    readonly screenLabel: string;
    readonly entryKey: string;
    /** Human name of the file, e.g. `Core` or `Map: overworld`. */
    readonly entryLabel: string;
    readonly groupId: string;
    readonly groupLabel: string;
}

export interface SettingIndexEntry {
    readonly location: SettingLocation;
    readonly field: FieldMeta;
    /** Everything a query is tested against. */
    readonly haystack: string;
    /** The current value, as one line, for the result list. */
    readonly valueText: string;
}

function entryLabel(entry: WorkspaceEntry): string {
    if (entry.kind === "map") return `Map: ${entry.name ?? ""}`;
    if (entry.kind === "storage") return `Storage: ${entry.name ?? ""}`;
    return entry.file.descriptor.title;
}

function screenLabel(id: ScreenId): string {
    return SCREENS.find((screen) => screen.id === id)?.label ?? id;
}

/** Every setting in the workspace, flattened. */
export function buildSettingIndex(workspace: ConfigWorkspace): SettingIndexEntry[] {
    const index: SettingIndexEntry[] = [];

    for (const entry of workspace.entries) {
        const screenId = SCREEN_FOR_KIND[entry.kind];
        const groups = new Map(entry.file.descriptor.groups.map((group) => [group.id, group.label]));

        for (const field of entry.file.descriptor.fields) {
            const value = fieldValue(entry.file, field);
            index.push({
                location: {
                    screenId,
                    screenLabel: screenLabel(screenId),
                    entryKey: entry.key,
                    entryLabel: entryLabel(entry),
                    groupId: field.group,
                    groupLabel: groups.get(field.group) ?? field.group,
                },
                field,
                haystack: searchTextForField(field, value),
                valueText: field.secret === true ? "hidden" : valueToText(value),
            });
        }
    }

    return index;
}

export interface SettingSearchResult {
    readonly matches: readonly SettingIndexEntry[];
    /** Compile error in regex mode, null otherwise. */
    readonly error: string | null;
    /** True when the query is filtering anything at all. */
    readonly active: boolean;
    /** How many settings were searched, so "0 of 214" reads honestly. */
    readonly searched: number;
}

/** Runs a query over an index. */
export function searchSettings(index: readonly SettingIndexEntry[], query: string, regexMode: boolean, flags: string): SettingSearchResult {
    const matcher = createSettingMatcher(query, regexMode, flags);
    if (!matcher.active) return { matches: index, error: null, active: false, searched: index.length };
    if (matcher.error !== null) return { matches: [], error: matcher.error, active: true, searched: index.length };

    return {
        matches: index.filter((candidate) => matcher.test(candidate.haystack)),
        error: null,
        active: true,
        searched: index.length,
    };
}

/** Results grouped by screen, so the interface can say where each one lives. */
export interface ScreenMatches {
    readonly screenId: ScreenId;
    readonly screenLabel: string;
    readonly entries: readonly { entryKey: string; entryLabel: string; matches: readonly SettingIndexEntry[] }[];
    readonly count: number;
}

export function groupMatchesByScreen(matches: readonly SettingIndexEntry[]): ScreenMatches[] {
    const byScreen = new Map<ScreenId, Map<string, SettingIndexEntry[]>>();

    for (const match of matches) {
        const screen = byScreen.get(match.location.screenId) ?? new Map<string, SettingIndexEntry[]>();
        const bucket = screen.get(match.location.entryKey) ?? [];
        bucket.push(match);
        screen.set(match.location.entryKey, bucket);
        byScreen.set(match.location.screenId, screen);
    }

    const result: ScreenMatches[] = [];
    for (const screen of SCREENS) {
        const entries = byScreen.get(screen.id);
        if (entries === undefined) continue;

        const listed = [...entries.entries()].map(([entryKey, list]) => ({
            entryKey,
            entryLabel: list[0]?.location.entryLabel ?? entryKey,
            matches: list,
        }));

        result.push({
            screenId: screen.id,
            screenLabel: screen.label,
            entries: listed,
            count: listed.reduce((total, item) => total + item.matches.length, 0),
        });
    }

    return result;
}

/**
 * Filters one file's fields for the search bar on its own form.
 *
 * The advanced flag is applied here too, because "hide the settings most people
 * never touch" and "show only what matches" are the same question from the
 * user's point of view: what is on screen right now.
 */
export function filterFields(
    fields: readonly FieldMeta[],
    file: EditableConfigFile,
    matcher: SettingMatcher,
    showAdvanced: boolean,
): FieldMeta[] {
    return fields.filter((field) => {
        if (!showAdvanced && field.advanced && !matcher.active) return false;
        if (!matcher.active) return true;
        return matcher.test(searchTextForField(field, fieldValue(file, field)));
    });
}

/**
 * Real text for the regex builder to preview against.
 *
 * The builder is only useful if what it scans is what the search will scan, so
 * the sample is the actual labels and paths of the settings on the surface that
 * opened it, one per line, rather than a made-up example.
 */
export function sampleTextFor(fields: readonly FieldMeta[]): string {
    return fields.map((field) => `${field.label}  ${field.path}`).join("\n");
}

/** The same, for the whole workspace. */
export function workspaceSampleText(workspace: ConfigWorkspace): string {
    const lines: string[] = [];
    for (const entry of workspace.entries) {
        for (const field of entry.file.descriptor.fields) lines.push(`${field.label}  ${field.path}`);
    }
    return lines.join("\n");
}

/** How many settings each screen holds, for the tab badges. */
export function settingCountByScreen(workspace: ConfigWorkspace): Record<ScreenId, number> {
    const counts: Record<ScreenId, number> = { core: 0, webapp: 0, webserver: 0, plugin: 0, maps: 0, storages: 0, run: 0 };
    for (const kind of ["core", "webapp", "webserver", "plugin", "map", "storage"] as const) {
        for (const entry of entriesOfKind(workspace, kind)) {
            counts[SCREEN_FOR_KIND[kind]] += entry.file.descriptor.fields.length;
        }
    }
    return counts;
}

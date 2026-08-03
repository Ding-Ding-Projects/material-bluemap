/**
 * A whole config folder, open for editing.
 *
 * `configModel.ts` knows about one file. This knows about the seven kinds of file
 * together, which is where the questions a person actually has live: does this
 * map point at a storage that exists, will these tiles have to be rendered
 * again, what happens to the other maps if I change this storage.
 *
 * Every operation returns a new workspace. Nothing writes to disk; the caller
 * hands {@link savePlan}'s output to a {@link ConfigHost}, which keeps the
 * decision about where files go with the code that knows about consent and about
 * the working directory.
 */

import {
    descriptorFor,
    generateConfigSet,
    renderFileStorageTemplate,
    renderMapTemplate,
    renderPluginTemplate,
    renderSqlStorageTemplate,
    storageDescriptorFor,
    type ConfigSetOptions,
    type MapPreset,
    type PlainValue,
} from "@material-bluemap/config";
import {
    changedFields,
    fieldValue,
    markSaved,
    openConfigFile,
    setFieldValue,
    type AnyDescriptor,
    type EditableConfigFile,
    type FieldChange,
} from "./configModel.js";

export type EntryKind = "core" | "webapp" | "webserver" | "plugin" | "map" | "storage";

/** One open file, plus the identity BlueMap gives it. */
export interface WorkspaceEntry {
    /** Stable key for this entry, e.g. `core` or `map:overworld`. */
    readonly key: string;
    readonly kind: EntryKind;
    /** The file name without its suffix, for maps and storages. Null otherwise. */
    readonly name: string | null;
    /**
     * The id BlueMap derives from the file name.
     *
     * For a map that is the sanitised name (see {@link sanitiseMapId}); for a
     * storage it is the name verbatim, which is what a map's `storage` setting
     * has to match.
     */
    readonly id: string | null;
    readonly file: EditableConfigFile;
}

export interface ConfigWorkspace {
    /** The folder these files came from, or null for one built from templates. */
    readonly folder: string | null;
    readonly entries: readonly WorkspaceEntry[];
    /** Paths to delete on the next save, relative to the folder. */
    readonly deletions: readonly string[];
    /** Paths that were on disk when the folder was read. */
    readonly onDisk: readonly string[];
    /** Files in the folder that this editor does not model, left untouched. */
    readonly unknown: readonly string[];
}

// ---- identity --------------------------------------------------------------

/** Suffixes BlueMap's `ConfigLoader.REGISTRY` recognises, in registry order. */
export const CONFIG_SUFFIXES = [".conf", ".json"] as const;

/** True for a file name BlueMap would load as a config file. */
export function isConfigFileName(name: string): boolean {
    return CONFIG_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/** The file name with its config suffix removed, which is `ConfigManager.getConfigName`. */
export function configNameOf(fileName: string): string {
    for (const suffix of CONFIG_SUFFIXES) {
        if (fileName.endsWith(suffix)) return fileName.slice(0, fileName.length - suffix.length);
    }
    return fileName;
}

/**
 * The map id BlueMap derives from a map config's file name.
 *
 * Upstream is `id.replaceAll("\\W", "_")`, and Java's `\W` without
 * `UNICODE_CHARACTER_CLASS` is ASCII, so this is exactly the same substitution.
 * It matters because the id is what ends up in the URL a tile is served from,
 * and because two file names that sanitise to the same id make BlueMap refuse to
 * start.
 */
export function sanitiseMapId(name: string): string {
    return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function entryKey(kind: EntryKind, name: string | null): string {
    return name === null ? kind : `${kind}:${name}`;
}

/** The path a map with this file name lives at. */
export function mapPathFor(name: string): string {
    return `maps/${name}.conf`;
}

/** The path a storage with this file name lives at. */
export function storagePathFor(name: string): string {
    return `storages/${name}.conf`;
}

// ---- loading ---------------------------------------------------------------

/** A file as it came off disk or out of a template. */
export interface SourceFile {
    readonly path: string;
    readonly text: string;
}

const SINGLETONS: readonly { kind: EntryKind; name: string }[] = [
    { kind: "core", name: "core" },
    { kind: "webapp", name: "webapp" },
    { kind: "webserver", name: "webserver" },
    { kind: "plugin", name: "plugin" },
];

function descriptorForStorageText(text: string): AnyDescriptor {
    // The storage file is loaded twice by BlueMap too: once to read
    // `storage-type`, then again as whichever class that names. Reading it with
    // the file descriptor first is safe, because `storage-type` is the one key
    // both descriptors share.
    const probe = openConfigFile(descriptorFor("storage-file") as AnyDescriptor, "storages/probe.conf", text);
    const raw = probe.value === null ? "file" : ((probe.value as Record<string, unknown>)["storage-type"] ?? "file");
    const resolved = storageDescriptorFor(typeof raw === "string" ? raw : "file");
    return (resolved ?? descriptorFor("storage-file")) as AnyDescriptor;
}

function classify(path: string): { kind: EntryKind; name: string | null } | null {
    const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
    const parts = normalized.split("/");
    const fileName = parts[parts.length - 1] ?? "";
    if (!isConfigFileName(fileName)) return null;

    const name = configNameOf(fileName);

    if (parts.length === 1) {
        const singleton = SINGLETONS.find((entry) => entry.name === name);
        return singleton === undefined ? null : { kind: singleton.kind, name: null };
    }
    if (parts.length === 2 && parts[0] === "maps") return { kind: "map", name };
    if (parts.length === 2 && parts[0] === "storages") return { kind: "storage", name };
    return null;
}

function openEntry(kind: EntryKind, name: string | null, path: string, text: string): WorkspaceEntry {
    const descriptor =
        kind === "storage"
            ? descriptorForStorageText(text)
            : (descriptorFor(kind === "map" ? "map" : kind) as AnyDescriptor);

    return {
        key: entryKey(kind, name),
        kind,
        name,
        id: kind === "map" ? sanitiseMapId(name ?? "") : kind === "storage" ? name : null,
        file: openConfigFile(descriptor, path, text),
    };
}

/** Opens every file this editor recognises, and remembers the ones it does not. */
export function loadWorkspace(folder: string | null, files: readonly SourceFile[]): ConfigWorkspace {
    const entries: WorkspaceEntry[] = [];
    const unknown: string[] = [];

    for (const file of files) {
        const path = file.path.replace(/\\/g, "/").replace(/^\.\//, "");
        const classified = classify(path);
        if (classified === null) {
            unknown.push(path);
            continue;
        }
        entries.push(openEntry(classified.kind, classified.name, path, file.text));
    }

    entries.sort((left, right) => left.key.localeCompare(right.key));

    return {
        folder,
        entries,
        deletions: [],
        onDisk: files.map((file) => file.path.replace(/\\/g, "/")),
        unknown,
    };
}

/**
 * A brand new config folder, exactly as the CLI would generate it.
 *
 * `plugin.conf` is included even though the CLI never writes it, because the
 * plugin settings screen has to be reachable from the same interface whether or
 * not the person is running a server plugin. It is written only if they change
 * something in it (see {@link savePlan}).
 */
export function createWorkspace(folder: string | null, options: ConfigSetOptions): ConfigWorkspace {
    const generated = generateConfigSet(options);
    const withPlugin = generated.some((file) => file.path === "plugin.conf")
        ? generated
        : [...generated, { path: "plugin.conf", text: renderPluginTemplate() }];

    const workspace = loadWorkspace(folder, withPlugin);
    // Nothing has been written yet, so every file counts as new.
    return { ...workspace, onDisk: [] };
}

// ---- reading the workspace -------------------------------------------------

export function findEntry(workspace: ConfigWorkspace, key: string): WorkspaceEntry | undefined {
    return workspace.entries.find((entry) => entry.key === key);
}

export function entriesOfKind(workspace: ConfigWorkspace, kind: EntryKind): WorkspaceEntry[] {
    return workspace.entries.filter((entry) => entry.kind === kind);
}

export function singletonEntry(workspace: ConfigWorkspace, kind: EntryKind): WorkspaceEntry | undefined {
    return workspace.entries.find((entry) => entry.kind === kind && entry.name === null);
}

/** Storage ids a map's `storage` setting may name. */
export function storageIds(workspace: ConfigWorkspace): string[] {
    return entriesOfKind(workspace, "storage")
        .map((entry) => entry.id)
        .filter((id): id is string => id !== null);
}

/** True when a file name is free for a new map or storage. */
export function isNameAvailable(workspace: ConfigWorkspace, kind: "map" | "storage", name: string): boolean {
    return !workspace.entries.some((entry) => entry.kind === kind && entry.name === name);
}

// ---- editing ---------------------------------------------------------------

function withEntries(workspace: ConfigWorkspace, entries: readonly WorkspaceEntry[]): ConfigWorkspace {
    return { ...workspace, entries: [...entries].sort((left, right) => left.key.localeCompare(right.key)) };
}

/** Swaps one entry's file for an edited copy of it. */
export function replaceFile(workspace: ConfigWorkspace, key: string, file: EditableConfigFile): ConfigWorkspace {
    return withEntries(
        workspace,
        workspace.entries.map((entry) => (entry.key === key ? { ...entry, file } : entry)),
    );
}

/**
 * Changes a storage file's type, and re-opens it against the descriptor for the
 * type it now names.
 *
 * The two storage descriptors are two Java classes behind one file, so the set
 * of settings really does change. Re-opening is what makes the SQL fields appear
 * and the file-only fields stop being offered.
 */
export function setStorageType(workspace: ConfigWorkspace, key: string, type: "file" | "sql"): ConfigWorkspace {
    const entry = findEntry(workspace, key);
    if (entry === undefined || entry.kind !== "storage") return workspace;

    const typeField = entry.file.descriptor.fields.find((field) => field.path === "storage-type");
    if (typeField === undefined) return workspace;

    const written = setFieldValue(entry.file, typeField, type);
    const descriptor = (storageDescriptorFor(type) ?? entry.file.descriptor) as AnyDescriptor;
    const reopened = openConfigFile(descriptor, entry.file.path, written.text);

    return replaceFile(workspace, key, { ...reopened, baselineText: entry.file.baselineText, baselineValue: entry.file.baselineValue });
}

export interface NewMapOptions {
    /** File name, without the suffix. Becomes the map id after sanitising. */
    readonly name: string;
    /** The map's display name in the web app. */
    readonly displayName: string;
    readonly world: string;
    readonly dimension: string;
    readonly dimensionType: string;
    readonly sorting: number;
    readonly preset: MapPreset;
}

/** Adds a map, written from upstream's own template so it arrives documented. */
export function addMap(workspace: ConfigWorkspace, options: NewMapOptions): ConfigWorkspace {
    const path = mapPathFor(options.name);
    const text = renderMapTemplate({
        name: options.displayName,
        world: options.world,
        dimension: options.dimension,
        dimensionType: options.dimensionType,
        sorting: options.sorting,
        preset: options.preset,
    });

    const entry = openEntry("map", options.name, path, text);
    return {
        ...withEntries(workspace, [...workspace.entries, entry]),
        // A file that was queued for deletion and then recreated under the same
        // name must not be deleted after it is written.
        deletions: workspace.deletions.filter((deleted) => deleted !== path),
    };
}

/**
 * Copies a map, comments and all.
 *
 * The source file's text is copied verbatim rather than re-rendered from the
 * template, so every setting the person tuned, and every note they wrote beside
 * it, comes with the copy. Only the display name is changed.
 */
export function cloneMap(workspace: ConfigWorkspace, sourceKey: string, name: string, displayName: string): ConfigWorkspace {
    const source = findEntry(workspace, sourceKey);
    if (source === undefined || source.kind !== "map") return workspace;

    const path = mapPathFor(name);
    const copy = openEntry("map", name, path, source.file.text);
    const nameField = copy.file.descriptor.fields.find((field) => field.path === "name");
    const named = nameField === undefined ? copy.file : setFieldValue(copy.file, nameField, displayName);

    return {
        ...withEntries(workspace, [...workspace.entries, { ...copy, file: { ...named, baselineText: "", baselineValue: null } }]),
        deletions: workspace.deletions.filter((deleted) => deleted !== path),
    };
}

/** Adds a storage from upstream's template for the type asked for. */
export function addStorage(workspace: ConfigWorkspace, name: string, type: "file" | "sql", root: string): ConfigWorkspace {
    const path = storagePathFor(name);
    const text = type === "file" ? renderFileStorageTemplate({ root }) : renderSqlStorageTemplate();
    const entry = openEntry("storage", name, path, text);

    return {
        ...withEntries(workspace, [...workspace.entries, entry]),
        deletions: workspace.deletions.filter((deleted) => deleted !== path),
    };
}

/**
 * Removes an entry and queues its file for deletion.
 *
 * A file that was never on disk is simply forgotten; there is nothing to delete
 * and queueing it would ask the host to remove a path that does not exist.
 */
export function removeEntry(workspace: ConfigWorkspace, key: string): ConfigWorkspace {
    const entry = findEntry(workspace, key);
    if (entry === undefined) return workspace;

    const wasOnDisk = workspace.onDisk.includes(entry.file.path);
    return {
        ...workspace,
        entries: workspace.entries.filter((candidate) => candidate.key !== key),
        deletions: wasOnDisk && !workspace.deletions.includes(entry.file.path) ? [...workspace.deletions, entry.file.path] : workspace.deletions,
    };
}

// ---- validation across files ----------------------------------------------

export interface WorkspaceIssue {
    readonly severity: "error" | "warning";
    /** The entry the issue belongs to, or null for the folder as a whole. */
    readonly entryKey: string | null;
    /** Field path inside that entry, or the empty string. */
    readonly path: string;
    readonly message: string;
}

/** True for a path the CLI will not re-interpret against its working directory. */
export function isAbsolutePath(value: string): boolean {
    return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value);
}

function stringField(entry: WorkspaceEntry, path: string): string | null {
    const field = entry.file.descriptor.fields.find((candidate) => candidate.path === path);
    if (field === undefined) return null;
    const value = fieldValue(entry.file, field);
    return typeof value === "string" ? value : null;
}

/**
 * The problems that only show up when the files are read together.
 *
 * Per-file validation already lives in `@material-bluemap/config`; every issue
 * here is one no single file can see on its own. Each one is a failure mode that
 * really happens: a map pointing at a storage nobody created, two map files
 * whose names collapse to one id, tiles written where the web app will never
 * look for them, and the relative-path trap that put 47 MB of tiles in the wrong
 * folder the first time this was run by hand.
 */
export function workspaceIssues(workspace: ConfigWorkspace): WorkspaceIssue[] {
    const issues: WorkspaceIssue[] = [];
    const maps = entriesOfKind(workspace, "map");
    const storages = storageIds(workspace);

    // Two map files whose names sanitise to one id make BlueMap refuse to start.
    const byId = new Map<string, WorkspaceEntry[]>();
    for (const map of maps) {
        const id = map.id ?? "";
        byId.set(id, [...(byId.get(id) ?? []), map]);
    }
    for (const [id, group] of byId) {
        if (group.length < 2) continue;
        const names = group.map((entry) => entry.name ?? "").join(", ");
        for (const entry of group) {
            issues.push({
                severity: "error",
                entryKey: entry.key,
                path: "",
                message: `These map files all become the map id "${id}": ${names}. BlueMap refuses to start when two map configs give the same id. Rename one of them.`,
            });
        }
    }

    for (const map of maps) {
        if (map.name !== null && map.id !== null && map.name !== map.id) {
            issues.push({
                severity: "warning",
                entryKey: map.key,
                path: "",
                message: `BlueMap turns the file name "${map.name}" into the map id "${map.id}", and that id is what appears in the tile URLs. Rename the file if you want a different id.`,
            });
        }

        const world = stringField(map, "world");
        if (world === null || world.trim() === "") {
            issues.push({
                severity: "error",
                entryKey: map.key,
                path: "world",
                message: "This map has no world folder, so BlueMap has nothing to render. Pick the folder that contains level.dat.",
            });
        } else if (!isAbsolutePath(world)) {
            issues.push({
                severity: "warning",
                entryKey: map.key,
                path: "world",
                message: "This world path is relative. BlueMap resolves it against its working directory, not against the config folder, so where it lands depends on where the program was started. Use an absolute path.",
            });
        }

        const storage = stringField(map, "storage");
        if (storage !== null && storages.length > 0 && !storages.includes(storage)) {
            issues.push({
                severity: "error",
                entryKey: map.key,
                path: "storage",
                message: `This map stores its tiles in "${storage}", and there is no storages/${storage}.conf. Available storages: ${storages.join(", ")}.`,
            });
        }
    }

    if (maps.length === 0) {
        issues.push({
            severity: "warning",
            entryKey: null,
            path: "",
            message: "There are no map configs. BlueMap writes its three default ones the next time it loads this folder, pointing at whatever world it finds.",
        });
    }

    const webapp = singletonEntry(workspace, "webapp");
    const webroot = webapp === undefined ? null : stringField(webapp, "webroot");

    for (const storage of entriesOfKind(workspace, "storage")) {
        const type = stringField(storage, "storage-type") ?? "bluemap:file";

        if (type.endsWith("file")) {
            const root = stringField(storage, "root");
            if (root !== null && !isAbsolutePath(root)) {
                issues.push({
                    severity: "warning",
                    entryKey: storage.key,
                    path: "root",
                    message: "This map folder is relative. BlueMap resolves it against its working directory, so starting the program from somewhere else writes the tiles somewhere else. Use an absolute path.",
                });
            }
            if (root !== null && webroot !== null && isAbsolutePath(root) && isAbsolutePath(webroot)) {
                const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
                const normalizedWebroot = webroot.replace(/\\/g, "/").replace(/\/+$/, "");
                if (!normalizedRoot.startsWith(`${normalizedWebroot}/`)) {
                    issues.push({
                        severity: "warning",
                        entryKey: storage.key,
                        path: "root",
                        message: `The web app is served from ${webroot} and looks for tiles under its own maps folder. This storage writes them to ${root}, which is outside it, so the map will render but the web app will not find it.`,
                    });
                }
            }
        }

        if (type.endsWith("sql")) {
            const url = stringField(storage, "connection-url");
            if (url === null || url.trim() === "") {
                issues.push({
                    severity: "error",
                    entryKey: storage.key,
                    path: "connection-url",
                    message: "This SQL storage has no connection URL, so BlueMap cannot reach a database to write tiles to.",
                });
            }
        }
    }

    const core = singletonEntry(workspace, "core");
    if (core !== undefined) {
        const acceptField = core.file.descriptor.fields.find((field) => field.path === "accept-download");
        if (acceptField !== undefined && fieldValue(core.file, acceptField) !== true) {
            issues.push({
                severity: "warning",
                entryKey: core.key,
                path: "accept-download",
                message: "Rendering needs the Minecraft client jar, which BlueMap downloads from Mojang. Until that is accepted in the app's settings, a render stops before it starts.",
            });
        }

        const data = stringField(core, "data");
        if (data !== null && !isAbsolutePath(data)) {
            issues.push({
                severity: "warning",
                entryKey: core.key,
                path: "data",
                message: "This data folder is relative. BlueMap resolves it against its working directory, so a render started from a different folder builds a second copy of the resource cache there. Use an absolute path.",
            });
        }
    }

    return issues;
}

// ---- saving ----------------------------------------------------------------

/** Everything one entry is about to change. */
export interface EntryChanges {
    readonly entry: WorkspaceEntry;
    readonly changes: readonly FieldChange[];
    /** Map ids whose already-rendered tiles these changes make wrong. */
    readonly affectedMapIds: readonly string[];
}

function mapsUsingStorage(workspace: ConfigWorkspace, storageId: string): string[] {
    return entriesOfKind(workspace, "map")
        .filter((map) => stringField(map, "storage") === storageId)
        .map((map) => map.id ?? "")
        .filter((id) => id !== "");
}

/** What saving would write, delete and invalidate. */
export interface WorkspacePlan {
    readonly writes: readonly SourceFile[];
    readonly deletes: readonly string[];
    /** Paths among the writes that do not exist on disk yet. */
    readonly created: readonly string[];
    readonly entryChanges: readonly EntryChanges[];
    /** The subset whose changes force a re-render. */
    readonly tileInvalidating: readonly EntryChanges[];
    /** Every map id that would have to be rendered again, without duplicates. */
    readonly affectedMapIds: readonly string[];
    /** True when there is genuinely nothing to do. */
    readonly empty: boolean;
}

/**
 * Works out what saving would do, before anything is written.
 *
 * An unchanged file is not rewritten. That matters more than it sounds: leaving
 * a file alone is what keeps its modification time, its comments and any
 * hand-written note in it exactly as they were, and it keeps the save honest
 * about which files were actually touched.
 */
export function savePlan(workspace: ConfigWorkspace): WorkspacePlan {
    const writes: SourceFile[] = [];
    const created: string[] = [];
    const entryChanges: EntryChanges[] = [];

    for (const entry of workspace.entries) {
        const isNew = !workspace.onDisk.includes(entry.file.path);
        const textChanged = entry.file.text !== entry.file.baselineText;

        if (entry.file.readOnly) continue;
        if (isNew || textChanged) {
            writes.push({ path: entry.file.path, text: entry.file.text });
            if (isNew) created.push(entry.file.path);
        }

        const changes = changedFields(entry.file);
        if (changes.length === 0) continue;

        const invalidating = changes.some((change) => change.invalidatesTiles);
        const affected = !invalidating
            ? []
            : entry.kind === "map"
              ? [entry.id ?? ""].filter((id) => id !== "")
              : entry.kind === "storage" && entry.id !== null
                ? mapsUsingStorage(workspace, entry.id)
                : [];

        entryChanges.push({ entry, changes, affectedMapIds: affected });
    }

    const tileInvalidating = entryChanges.filter((group) => group.changes.some((change) => change.invalidatesTiles));
    const affectedMapIds = [...new Set(tileInvalidating.flatMap((group) => group.affectedMapIds))].sort();

    return {
        writes,
        deletes: workspace.deletions,
        created,
        entryChanges,
        tileInvalidating,
        affectedMapIds,
        empty: writes.length === 0 && workspace.deletions.length === 0,
    };
}

/** Records that the plan was carried out, so nothing is written twice. */
export function markWorkspaceSaved(workspace: ConfigWorkspace, plan: WorkspacePlan): ConfigWorkspace {
    const written = new Set(plan.writes.map((file) => file.path));
    const entries = workspace.entries.map((entry) => (written.has(entry.file.path) ? { ...entry, file: markSaved(entry.file) } : entry));

    const onDisk = new Set(workspace.onDisk);
    for (const path of written) onDisk.add(path);
    for (const path of plan.deletes) onDisk.delete(path);

    return { ...workspace, entries, deletions: [], onDisk: [...onDisk] };
}

/** True when anything at all is waiting to be written or deleted. */
export function isWorkspaceDirty(workspace: ConfigWorkspace): boolean {
    if (workspace.deletions.length > 0) return true;
    return workspace.entries.some((entry) => entry.file.text !== entry.file.baselineText || !workspace.onDisk.includes(entry.file.path));
}

/** A value for one field of one entry, for callers that only have the key. */
export function readEntryField(workspace: ConfigWorkspace, key: string, path: string): PlainValue | undefined {
    const entry = findEntry(workspace, key);
    if (entry === undefined) return undefined;
    const field = entry.file.descriptor.fields.find((candidate) => candidate.path === path);
    if (field === undefined) return undefined;
    return fieldValue(entry.file, field);
}

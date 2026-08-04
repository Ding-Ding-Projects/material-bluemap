/**
 * A project, as plain functions over plain values.
 *
 * Everything that decides anything about a project lives here rather than in the
 * components, for the same reason `../world/wizardModel.ts` keeps the wizard's rules out
 * of its steps: the rules worth trusting are the ones a test can prove, and these are
 * exactly the sort that get quietly broken by a template change six months later.
 *
 * Three of them are load-bearing:
 *
 *  - **the map id is previewed as it is typed, not validated after the fact.** The id
 *    becomes a folder on disk and a segment in the URL a tile is served from, so somebody
 *    typing `My World!` has to see `my-world-` while they are typing rather than meet it
 *    for the first time in a path. {@link previewMapId} is that preview and
 *    {@link mapIdProblem} is the refusal that follows it;
 *  - **a map's named fields and its config text are kept in step.** `name`, `dimension`,
 *    `sorting` and `storage` are real keys in `maps/<id>.conf` as well as fields on the
 *    project record. Writing one and not the other produces a project whose summary line
 *    disagrees with the file it would render from, which is the kind of divergence nobody
 *    notices until a render comes out wrong. {@link withMapIdentity} writes both;
 *  - **nothing here writes a file.** Every function returns a new {@link ProjectFile}, so
 *    the editor can hold an unsaved project, show what is dirty, and let somebody abandon
 *    it - and so all of this is testable with no disk anywhere near it.
 *
 * ## The two id rules, and why there are two
 *
 * `projectFileSchema` accepts `^[a-z0-9_-]+$`. The render engine is stricter: it refuses an
 * id outside `^[a-z0-9][a-z0-9_-]*$` before it writes anything, which is what
 * `../world/wizardModel.ts` validates against. An id that satisfies the schema and not the
 * engine would save happily and then fail at render time, which is the worst place to find
 * out. So the preview produces text that satisfies the schema, and the problem check
 * applies the engine's rule, on the field that asked for it.
 */

import {
    PROJECT_FORMAT_VERSION,
    descriptorFor,
    findField,
    renderFileStorageTemplate,
    renderMapTemplate,
    renderSqlStorageTemplate,
    storageDescriptorFor,
    type FieldMeta,
    type MapPreset,
    type PlainValue,
    type ProjectFile,
    type ProjectMap,
    type ProjectRender,
    type ProjectStorage,
} from "@material-bluemap/config";
import {
    isExplicit,
    openConfigFile,
    setFieldValue,
    type AnyDescriptor,
    type EditableConfigFile,
} from "../config/configModel.js";
import type { RenderMapRequest, RenderRequest } from "../world/worldBridge.js";
// The same two-overload shape every other describing helper in this application takes, so
// vue-i18n's own `t` is assignable to it without a cast at every call site.
import type { Translate } from "../world/worldFolder.js";

export type { Translate };

/* -------------------------------------------------------------------------- */
/* Map ids                                                                    */
/* -------------------------------------------------------------------------- */

export const MAP_ID_MAX_LENGTH = 64;

/** What the render engine accepts. Stricter than the project schema; see the file note. */
export const ENGINE_MAP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * The id a display name becomes, shown live while somebody types the name.
 *
 * Lower-cased, with every run of characters outside `[a-z0-9_-]` collapsed to a single
 * hyphen. A run rather than a character each, so `New  World` becomes `new-world` rather
 * than `new--world` - the same substitution `../world/wizardModel.ts` already makes, kept
 * identical on purpose so the guide and the editor cannot disagree about what a name turns
 * into.
 *
 * Deliberately does **not** tidy the ends. `suggestMapId` in the wizard strips a leading
 * non-alphanumeric and a trailing separator, which is right when it is silently proposing
 * an id nobody asked to see. Here the whole point is that the preview is the truth: if the
 * name ends in an exclamation mark the id ends in a hyphen, and {@link mapIdProblem} says
 * so rather than the field quietly producing something else.
 */
export function previewMapId(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .slice(0, MAP_ID_MAX_LENGTH);
}

/** A refusal a step or a dialog renders itself, or null when the id is fine. */
export interface IdProblem {
    /** Translation key. */
    readonly key: string;
    /** English fallback, and the message a build with no locale shows. */
    readonly fallback: string;
    /** Values substituted into the message, by `{name}`. */
    readonly vars?: Readonly<Record<string, string>>;
}

/**
 * Why this id cannot be used, in the words the field shows.
 *
 * `taken` is every id already in the project, so the check that two maps cannot share a
 * folder happens on the field that asked rather than at save time. BlueMap refuses to start
 * when two map configs resolve to one id, so this is a real failure rather than a tidiness
 * rule.
 */
export function mapIdProblem(id: string, taken: readonly string[] = []): IdProblem | null {
    if (id === "") {
        return {
            key: "project.map.needId",
            fallback: "Give the map an id. It becomes its folder on disk and part of its address.",
        };
    }
    if (id.length > MAP_ID_MAX_LENGTH) {
        return {
            key: "project.map.longId",
            fallback: "A map id may be at most {max} characters long.",
            vars: { max: String(MAP_ID_MAX_LENGTH) },
        };
    }
    if (!ENGINE_MAP_ID_PATTERN.test(id)) {
        return {
            key: "project.map.badId",
            fallback:
                "A map id may hold lower-case letters, digits, hyphens and underscores, and has to " +
                "start with a letter or a digit. {id} does not, so the render engine would refuse it.",
            vars: { id },
        };
    }
    if (taken.includes(id)) {
        return {
            key: "project.map.idTaken",
            fallback:
                "This project already has a map called {id}. BlueMap refuses to start when two maps " +
                "share an id, because they would write into the same folder.",
            vars: { id },
        };
    }
    return null;
}

/* -------------------------------------------------------------------------- */
/* Making one                                                                 */
/* -------------------------------------------------------------------------- */

/** The clock and the dice, injected so every function here is testable. */
export interface ProjectStamp {
    /** ISO 8601 with an offset, exactly as the file stores it. */
    readonly now: string;
    /** A stable id for a new project. Survives renames and moves. */
    readonly id: string;
    /** Which build wrote it. Diagnostic only; never used to decide behaviour. */
    readonly appVersion?: string | null;
}

/** An ISO timestamp with the local offset, which is what the file format asks for. */
export function nowStamp(at: Date = new Date()): string {
    const pad = (value: number): string => String(value).padStart(2, "0");
    const offset = -at.getTimezoneOffset();
    const sign = offset < 0 ? "-" : "+";
    const size = Math.abs(offset);
    return (
        `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
        `T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}` +
        `${sign}${pad(Math.floor(size / 60))}:${pad(size % 60)}`
    );
}

/**
 * A new project id.
 *
 * Time-ordered rather than random, so two projects made on the same day sort next to each
 * other in any listing that falls back to the id, and so a person looking at a file can see
 * roughly when it was made. The random tail is what stops two projects created in the same
 * millisecond from colliding.
 */
export function newProjectId(at: Date = new Date(), random: () => number = Math.random): string {
    const tail = Math.floor(random() * 0xffffff)
        .toString(36)
        .padStart(5, "0");
    return `p${at.getTime().toString(36)}-${tail}`;
}

/** The stamp a caller with no opinion gets: now, a fresh id, no app version. */
export function defaultStamp(): ProjectStamp {
    return { now: nowStamp(), id: newProjectId(), appVersion: null };
}

export const EMPTY_RENDER: ProjectRender = {
    threads: null,
    force: false,
    fixEdges: false,
    metrics: false,
    outputFolder: null,
};

/**
 * A project with nothing in it but a name.
 *
 * `fromWizard` is false: this one was made in the editor, by somebody who chose to. The
 * distinction is not a quality judgement - the file and its settings are identical either
 * way - it just lets the list honestly say "made by the guide, never opened in the editor".
 */
export function createProject(name: string, stamp: ProjectStamp = defaultStamp()): ProjectFile {
    return {
        version: PROJECT_FORMAT_VERSION,
        id: stamp.id,
        name: name.trim() === "" ? "Untitled project" : name.trim(),
        createdAt: stamp.now,
        updatedAt: stamp.now,
        appVersion: stamp.appVersion ?? null,
        maps: [],
        storages: [],
        render: { ...EMPTY_RENDER },
        core: null,
        webapp: null,
        webserver: null,
        plugin: null,
        fromWizard: false,
    };
}

/** What the guide collected, in the shape this module needs to write a project from it. */
export interface WizardAnswers {
    /** The world folder the project file will live at the root of. */
    readonly world: string;
    readonly mapId: string;
    readonly mapName: string;
    readonly dimension: string;
    readonly sorting: number;
    /** The complete `maps/<id>.conf` body the wizard built. */
    readonly config: string;
    /** Where the tiles go, when the app told the wizard. Null uses the app's own folder. */
    readonly outputFolder?: string | null;
    readonly force?: boolean;
    readonly fixEdges?: boolean;
    readonly metrics?: boolean;
    readonly threads?: number | null;
}

/**
 * The project the guide writes when it finishes.
 *
 * This is what stops the wizard being a dead end. Five answers used to produce one render
 * and then the knowledge was gone; now they produce a file that can be reopened and edited
 * in full, with `fromWizard` recording honestly that nobody has been into the editor yet.
 *
 * The project is named after the world folder rather than after the map, because a project
 * holds however many maps somebody adds to it later and a project called `overworld` that
 * also renders the nether is a project with a misleading name from its second day.
 */
export function projectFromWizard(
    answers: WizardAnswers,
    stamp: ProjectStamp = defaultStamp(),
): ProjectFile {
    const base = createProject(worldLeaf(answers.world), stamp);
    const map: ProjectMap = {
        id: answers.mapId,
        name: answers.mapName.trim() === "" ? answers.mapId : answers.mapName.trim(),
        dimension: answers.dimension,
        config: answers.config,
        storage: "file",
        sorting: answers.sorting,
        enabled: true,
    };

    return {
        ...base,
        maps: [map],
        render: {
            threads: answers.threads ?? null,
            force: answers.force ?? false,
            fixEdges: answers.fixEdges ?? false,
            metrics: answers.metrics ?? false,
            outputFolder: answers.outputFolder ?? null,
        },
        fromWizard: true,
    };
}

/** The last segment of a path, which is what a world folder is usually named after. */
export function worldLeaf(path: string): string {
    const trimmed = path.trim().replace(/[\\/]+$/, "");
    const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    const leaf = cut < 0 ? trimmed : trimmed.slice(cut + 1);
    return leaf === "" ? "Untitled project" : leaf;
}

/* -------------------------------------------------------------------------- */
/* Editing one                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Records that the project changed.
 *
 * Every edit below goes through this, which is what keeps `updatedAt` honest and what
 * clears `fromWizard`: the moment somebody changes anything in the editor, the claim that
 * the guide wrote this and nothing has touched it stops being true.
 */
export function touch(project: ProjectFile, stamp: Pick<ProjectStamp, "now" | "appVersion"> = { now: nowStamp() }): ProjectFile {
    return {
        ...project,
        updatedAt: stamp.now,
        appVersion: stamp.appVersion ?? project.appVersion,
        fromWizard: false,
    };
}

export function withName(project: ProjectFile, name: string): ProjectFile {
    const trimmed = name.trim();
    return { ...project, name: trimmed === "" ? project.name : trimmed };
}

/**
 * The maps in the order the web app will list them.
 *
 * `sorting` first, exactly as upstream orders them, and the id as the tie-break so two maps
 * that share a sorting number keep a stable order between visits instead of following
 * whatever order the array happened to be in.
 */
export function orderedMaps(project: ProjectFile): readonly ProjectMap[] {
    return [...project.maps].sort((left, right) => {
        if (left.sorting !== right.sorting) return left.sorting - right.sorting;
        return left.id.localeCompare(right.id);
    });
}

export function findMap(project: ProjectFile, id: string): ProjectMap | undefined {
    return project.maps.find((map) => map.id === id);
}

/** Every id already used, which is what {@link mapIdProblem} checks a new one against. */
export function mapIds(project: ProjectFile, except: string | null = null): string[] {
    return project.maps.filter((map) => map.id !== except).map((map) => map.id);
}

/** The dimension a new map should default to: the first one nothing has claimed yet. */
export const DEFAULT_DIMENSIONS: readonly { readonly key: string; readonly preset: MapPreset; readonly sorting: number }[] = [
    { key: "minecraft:overworld", preset: "overworld", sorting: 0 },
    { key: "minecraft:the_nether", preset: "nether", sorting: 100 },
    { key: "minecraft:the_end", preset: "end", sorting: 200 },
];

export function presetFor(dimension: string): MapPreset {
    return DEFAULT_DIMENSIONS.find((entry) => entry.key === dimension)?.preset ?? "overworld";
}

export function sortingFor(dimension: string): number {
    return DEFAULT_DIMENSIONS.find((entry) => entry.key === dimension)?.sorting ?? 0;
}

export interface NewMap {
    readonly id: string;
    readonly name: string;
    readonly dimension: string;
    readonly sorting?: number;
    readonly storage?: string;
    /** The world folder, written into the generated config's `world` key. */
    readonly world: string;
    /** The platform separator, so generated paths read the way the platform writes them. */
    readonly separator?: string;
}

/**
 * Adds a map, written from upstream's own template so it arrives with every setting
 * explained in place.
 *
 * The template rather than an empty file, for the same reason `configWorkspace.addMap`
 * uses it: a map config somebody opens for the first time should be BlueMap's own
 * documented file, not ninety-two blank keys they have to look up one at a time.
 *
 * The separator is always passed rather than left to the template's default. Upstream's
 * helper falls back to `node:path`, and in a renderer that module is a browser stub that
 * throws the moment it is read.
 */
export function withMapAdded(project: ProjectFile, map: NewMap): ProjectFile {
    if (findMap(project, map.id) !== undefined) return project;

    const dimension = map.dimension;
    const sorting = map.sorting ?? sortingFor(dimension);
    const text = renderMapTemplate({
        name: map.name.trim() === "" ? map.id : map.name.trim(),
        world: map.world,
        dimension,
        dimensionType: dimension,
        sorting,
        preset: presetFor(dimension),
        separator: map.separator ?? "/",
    });

    const added: ProjectMap = {
        id: map.id,
        name: map.name.trim() === "" ? map.id : map.name.trim(),
        dimension,
        config: text,
        storage: map.storage ?? "file",
        sorting,
        enabled: true,
    };
    return { ...project, maps: [...project.maps, added] };
}

/**
 * Takes a map out of the project. **Destructive**, and gated where it is offered.
 *
 * Nothing on the disk moves. The tiles a previous render wrote stay exactly where they are,
 * which is worth saying out loud at the gate: the space is not reclaimed and the map is no
 * longer served, so somebody expecting one of those two things gets neither by accident.
 */
export function withMapRemoved(project: ProjectFile, id: string): ProjectFile {
    return { ...project, maps: project.maps.filter((map) => map.id !== id) };
}

/** Replaces one map's record wholesale, keeping the rest of the project untouched. */
export function withMapReplaced(project: ProjectFile, id: string, next: ProjectMap): ProjectFile {
    return { ...project, maps: project.maps.map((map) => (map.id === id ? next : map)) };
}

/** Replaces one map's `maps/<id>.conf` body, which is what the settings form edits. */
export function withMapConfig(project: ProjectFile, id: string, config: string): ProjectFile {
    const map = findMap(project, id);
    if (map === undefined) return project;
    return withMapReplaced(project, id, { ...map, config });
}

export function withMapEnabled(project: ProjectFile, id: string, enabled: boolean): ProjectFile {
    const map = findMap(project, id);
    if (map === undefined) return project;
    return withMapReplaced(project, id, { ...map, enabled });
}

/** What {@link withMapIdentity} may change. Anything left out stays as it is. */
export interface MapIdentity {
    readonly id?: string;
    readonly name?: string;
    readonly dimension?: string;
    readonly sorting?: number;
    readonly storage?: string;
}

/**
 * Renames, re-dimensions, re-sorts or re-homes a map, and writes the same facts into its
 * config text.
 *
 * The second half is the point. `name`, `dimension`, `sorting` and `storage` are real keys
 * in `maps/<id>.conf`, so a project that changed only its own record would show one
 * dimension in the editor and render another - and the config file is what actually
 * reaches the engine. Both are written, from one call, so they cannot drift.
 *
 * `dimension-type` follows `dimension` only when the file names it explicitly *and* names
 * the dimension it used to be. A world with a custom dimension type has said something this
 * has no business overwriting.
 */
export function withMapIdentity(project: ProjectFile, id: string, identity: MapIdentity): ProjectFile {
    const map = findMap(project, id);
    if (map === undefined) return project;

    const nextId = identity.id ?? map.id;
    if (nextId !== map.id && findMap(project, nextId) !== undefined) return project;

    const next: ProjectMap = {
        ...map,
        id: nextId,
        name: identity.name === undefined || identity.name.trim() === "" ? map.name : identity.name.trim(),
        dimension: identity.dimension ?? map.dimension,
        sorting: identity.sorting ?? map.sorting,
        storage: identity.storage ?? map.storage,
    };

    return withMapReplaced(project, id, { ...next, config: syncMapConfig(next, map.dimension) });
}

/** The map descriptor, which is the only schema a map's config text is read against. */
export function mapDescriptor(): AnyDescriptor {
    return descriptorFor("map") as AnyDescriptor;
}

/** One map's config text, opened for the settings form. */
export function openMapFile(map: ProjectMap): EditableConfigFile {
    return openConfigFile(mapDescriptor(), `maps/${map.id}.conf`, map.config);
}

function writeField(file: EditableConfigFile, path: string, value: PlainValue): EditableConfigFile {
    const field: FieldMeta | undefined = findField(file.descriptor, path);
    if (field === undefined) return file;
    return setFieldValue(file, field, value);
}

/**
 * The map's config text with its four named settings written into it.
 *
 * A file that does not parse comes back untouched: there is no document to edit, and
 * inventing one would throw away whatever the person has in the file. `setFieldValue`
 * already refuses in that case, so this inherits the behaviour rather than repeating the
 * check.
 */
export function syncMapConfig(map: ProjectMap, previousDimension: string | null = null): string {
    let file = openMapFile(map);

    file = writeField(file, "name", map.name);
    file = writeField(file, "dimension", map.dimension);
    file = writeField(file, "sorting", map.sorting);
    file = writeField(file, "storage", map.storage);

    const typeField = findField(file.descriptor, "dimension-type");
    if (typeField !== undefined && isExplicit(file, typeField)) {
        const stated = file.value === null ? undefined : (file.value as Record<string, unknown>)["dimension-type"];
        // Only when the file was following the dimension already. A custom dimension type
        // is a deliberate statement and is left exactly as written.
        if (previousDimension !== null && stated === previousDimension) {
            file = setFieldValue(file, typeField, map.dimension);
        }
    }

    return file.text;
}

/**
 * Moves a map one place earlier or later in the web app's list.
 *
 * Swaps the two neighbours' `sorting` numbers rather than renumbering the whole list.
 * Renumbering looks tidier and is wrong: upstream's own presets use 0, 100 and 200 with
 * deliberate room between them, and a reorder that flattened those to 0, 1, 2 would silently
 * destroy the gaps somebody left for maps they have not added yet.
 *
 * Two maps that already share a sorting number are separated by one, because swapping equal
 * numbers is a move that does nothing and looks like a broken button.
 */
export function withMapMoved(project: ProjectFile, id: string, delta: -1 | 1): ProjectFile {
    const order = orderedMaps(project);
    const at = order.findIndex((map) => map.id === id);
    if (at < 0) return project;

    const to = at + delta;
    const moving = order[at];
    const other = order[to];
    if (moving === undefined || other === undefined) return project;

    const [movingSorting, otherSorting] =
        moving.sorting === other.sorting
            ? [other.sorting + delta, other.sorting]
            : [other.sorting, moving.sorting];

    return {
        ...project,
        maps: project.maps.map((map) => {
            if (map.id === moving.id) return { ...map, sorting: movingSorting, config: syncMapConfig({ ...map, sorting: movingSorting }) };
            if (map.id === other.id) return { ...map, sorting: otherSorting, config: syncMapConfig({ ...map, sorting: otherSorting }) };
            return map;
        }),
    };
}

/* -------------------------------------------------------------------------- */
/* Storages                                                                   */
/* -------------------------------------------------------------------------- */

/** Every storage id a map's `storage` setting may name. `file` is always available. */
export function storageIds(project: ProjectFile): string[] {
    const named = project.storages.map((storage) => storage.id);
    return named.includes("file") ? named : ["file", ...named];
}

export function findStorage(project: ProjectFile, id: string): ProjectStorage | undefined {
    return project.storages.find((storage) => storage.id === id);
}

export function withStorageAdded(project: ProjectFile, id: string, config: string): ProjectFile {
    if (findStorage(project, id) !== undefined) return project;
    return { ...project, storages: [...project.storages, { id, config }] };
}

export function withStorageConfig(project: ProjectFile, id: string, config: string): ProjectFile {
    return {
        ...project,
        storages: project.storages.map((storage) => (storage.id === id ? { ...storage, config } : storage)),
    };
}

/**
 * Takes a storage out of the project. **Destructive**, and gated where it is offered.
 *
 * Maps pointing at it are named at the gate rather than repointed here: a storage a map
 * still names is a broken project, and silently moving somebody's maps to another storage
 * would be this code deciding where several gigabytes of tiles should go.
 */
export function withStorageRemoved(project: ProjectFile, id: string): ProjectFile {
    return { ...project, storages: project.storages.filter((storage) => storage.id !== id) };
}

/** Which maps would be left naming a storage that is not there. */
export function mapsUsingStorage(project: ProjectFile, id: string): readonly ProjectMap[] {
    return project.maps.filter((map) => map.storage === id);
}

/**
 * A project file's own refusal, restated so the editor can catch it before a save.
 *
 * `projectFileSchema` refuses a storage block carrying `connection-properties`, because a
 * project file travels inside a world folder that people copy and zip up, and that block is
 * where a database user name and password live. Catching it here means the person is told
 * on the field they typed it into rather than by a save that fails.
 */
export const CREDENTIAL_BLOCK = /(^|\n)\s*connection-properties\s*[:{=]/;

export function storageCarriesCredentials(config: string): boolean {
    return CREDENTIAL_BLOCK.test(config);
}

/** What BlueMap accepts as a storage name, which is the file name in `storages/`. */
export const STORAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function storageIdProblem(id: string, taken: readonly string[] = []): IdProblem | null {
    if (id.trim() === "") {
        return {
            key: "project.storage.needId",
            fallback: "Give the storage a name. It becomes the file BlueMap reads it from.",
        };
    }
    if (!STORAGE_ID_PATTERN.test(id)) {
        return {
            key: "project.storage.badId",
            fallback:
                "A storage name may hold letters, digits, hyphens and underscores, and has to start " +
                "with a letter or a digit. {id} does not.",
            vars: { id },
        };
    }
    if (taken.includes(id)) {
        return {
            key: "project.storage.idTaken",
            fallback: "This project already has a storage called {id}.",
            vars: { id },
        };
    }
    return null;
}

/**
 * Which of the two descriptors a storage's text should be read against.
 *
 * A storage file is one file with two Java classes behind it, and BlueMap itself loads it
 * twice for the same reason: once to read `storage-type`, then again as whichever class
 * that names. Reading it with the file descriptor first is safe, because `storage-type` is
 * the one key both descriptors share.
 */
export function storageDescriptorForText(text: string): AnyDescriptor {
    const probe = openConfigFile(descriptorFor("storage-file") as AnyDescriptor, "storages/probe.conf", text);
    const raw = probe.value === null ? "file" : ((probe.value as Record<string, unknown>)["storage-type"] ?? "file");
    const resolved = storageDescriptorFor(typeof raw === "string" ? raw : "file");
    return (resolved ?? descriptorFor("storage-file")) as AnyDescriptor;
}

/** One storage's config text, opened for the settings form. */
export function openStorageFile(storage: ProjectStorage): EditableConfigFile {
    return openConfigFile(storageDescriptorForText(storage.config), `storages/${storage.id}.conf`, storage.config);
}

/** A brand new storage, from upstream's own template for the type asked for. */
export function newStorageText(type: "file" | "sql", root: string, separator = "/"): string {
    return type === "file" ? renderFileStorageTemplate({ root, separator }) : renderSqlStorageTemplate();
}

/**
 * Switches a storage between the two shapes, re-opening it against the other descriptor.
 *
 * The set of settings really does change, so the file is rewritten from the template for
 * the new type rather than having a key flipped in place - a file storage carrying leftover
 * SQL keys is a file BlueMap reads and quietly ignores half of.
 */
export function withStorageType(
    project: ProjectFile,
    id: string,
    type: "file" | "sql",
    root: string,
    separator = "/",
): ProjectFile {
    if (findStorage(project, id) === undefined) return project;
    return withStorageConfig(project, id, newStorageText(type, root, separator));
}

/** Which of the two shapes a storage's text currently describes. */
export function storageTypeOf(storage: ProjectStorage): "file" | "sql" {
    const file = openStorageFile(storage);
    const stated = file.value === null ? null : (file.value as Record<string, unknown>)["storage-type"];
    return stated === "sql" ? "sql" : "file";
}

/* -------------------------------------------------------------------------- */
/* Render options and the singletons                                          */
/* -------------------------------------------------------------------------- */

export function withRender(project: ProjectFile, render: Partial<ProjectRender>): ProjectFile {
    return { ...project, render: { ...project.render, ...render } };
}

/** The four whole-file settings a project may carry, and never more than these four. */
export const SINGLETONS = ["core", "webapp", "webserver", "plugin"] as const;
export type SingletonKind = (typeof SINGLETONS)[number];

export function singletonText(project: ProjectFile, kind: SingletonKind): string | null {
    return project[kind];
}

/**
 * Writes one of the four whole-file settings.
 *
 * An empty body is stored as `null` rather than as `""`, because the two mean different
 * things to whatever renders this project: null is "this project never touched it, use
 * BlueMap's default", and an empty file is "this project deliberately wants a file with
 * nothing in it". Only the first of those is ever what somebody meant by clearing the form.
 */
export function withSingleton(project: ProjectFile, kind: SingletonKind, text: string | null): ProjectFile {
    const value = text === null || text.trim() === "" ? null : text;
    return { ...project, [kind]: value };
}

/** One singleton's text opened for the settings form. Absent starts from an empty body. */
export function openSingletonFile(project: ProjectFile, kind: SingletonKind): EditableConfigFile {
    const descriptor = descriptorFor(kind) as AnyDescriptor;
    return openConfigFile(descriptor, `${kind}.conf`, project[kind] ?? "");
}

/* -------------------------------------------------------------------------- */
/* Rendering it                                                               */
/* -------------------------------------------------------------------------- */

/** Why a project cannot be rendered as it stands. Empty means it can. */
export function renderProblems(project: ProjectFile): IdProblem[] {
    const problems: IdProblem[] = [];
    const enabled = project.maps.filter((map) => map.enabled);

    if (project.maps.length === 0) {
        problems.push({
            key: "project.render.noMaps",
            fallback: "This project has no maps yet, so there is nothing to render. Add one first.",
        });
    } else if (enabled.length === 0) {
        problems.push({
            key: "project.render.noneEnabled",
            fallback:
                "Every map in this project is switched off, so a render would draw nothing. Switch at " +
                "least one back on.",
        });
    }

    for (const map of project.maps) {
        const problem = mapIdProblem(map.id, mapIds(project, map.id));
        if (problem !== null) problems.push(problem);
    }

    for (const storage of project.storages) {
        if (storageCarriesCredentials(storage.config)) {
            problems.push({
                key: "project.render.credentialled",
                fallback:
                    "The storage {id} carries connection-properties. A project file travels inside the " +
                    "world folder, so it refuses to hold a database user name or password. Move that " +
                    "storage into the app's own config folder.",
                vars: { id: storage.id },
            });
        }
    }

    return problems;
}

/**
 * The render this project describes, with the project's own settings on it.
 *
 * This is what makes a second render repeat the first without asking again: everything the
 * guide asked for once lives in the file, so starting a render is reading it rather than
 * answering it. Maps that are switched off are left out - that is the whole meaning of the
 * switch - and the world comes from where the file was found rather than from the file,
 * because the file is inside the world and storing the path as well would create a second
 * source of truth that goes wrong the moment somebody moves the folder.
 *
 * The complete `maps/<id>.conf` body travels with each map. The render bridge validates a
 * handful of named fields and carries the rest as text for the same reason: a map has
 * ninety-odd settings, this editor offers all of them, and a request narrowed to the five
 * with a named field would silently drop the rest.
 */
export function projectToRenderRequest(project: ProjectFile, world: string): RenderRequest {
    const maps: RenderMapRequest[] = orderedMaps(project)
        .filter((map) => map.enabled)
        .map((map) => ({
            id: map.id,
            world,
            name: map.name,
            dimension: map.dimension,
            sorting: map.sorting,
            config: map.config,
        }));

    return {
        maps,
        force: project.render.force,
        fixEdges: project.render.fixEdges,
        metrics: project.render.metrics,
        ...(project.render.threads === null ? {} : { renderThreads: project.render.threads }),
    };
}

/* -------------------------------------------------------------------------- */
/* Listing them                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Everything a listing row needs, without needing the file open.
 *
 * Restated from {@link ProjectSummary} rather than imported so this module stays pure and
 * has no opinion about how a summary was obtained - the sort, the search corpus and the
 * detail line are the same whether the rows came from a bridge or from a test.
 */
export interface ProjectRow {
    readonly world: string;
    readonly file: string;
    readonly id: string;
    readonly name: string;
    readonly maps: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly fromWizard: boolean;
    readonly worldName: string | null;
    readonly problem: string | null;
}

/**
 * Most recently edited first, which is the one somebody almost always wants.
 *
 * A row whose timestamp cannot be read sorts to the end rather than to the beginning: an
 * unparseable date is not "just now", and floating a broken row to the top of the list
 * would be the list asserting something it does not know. Ties fall back to the name so
 * the order is stable between visits.
 */
export function sortProjects(rows: readonly ProjectRow[]): readonly ProjectRow[] {
    const at = (value: string): number => {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? -1 : parsed;
    };
    return [...rows].sort((left, right) => {
        const difference = at(right.updatedAt) - at(left.updatedAt);
        if (difference !== 0) return difference;
        return left.name.localeCompare(right.name);
    });
}

/** The world's own name where it is known, and its folder otherwise. */
export function worldLabel(row: ProjectRow): string {
    return row.worldName ?? worldLeaf(row.world);
}

/** "3 August 2026 at 09:14" in the viewer's locale, or null when the date is unreadable. */
export function formatWhen(value: string): string | null {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(parsed),
        );
    } catch {
        return new Date(parsed).toISOString();
    }
}

/**
 * The parts of a row's secondary line, in the order they matter.
 *
 * Built as a list and joined, so a row missing half of them reads as a shorter sentence
 * rather than as a line full of gaps and stray separators. Nothing here invents a value.
 */
export function projectDetailParts(row: ProjectRow, t: Translate): string[] {
    const parts: string[] = [];

    parts.push(t("project.row.world", { world: worldLabel(row) }, "world {world}"));
    parts.push(
        row.maps === 1
            ? t("project.row.oneMap", "1 map")
            : t("project.row.maps", { maps: row.maps }, "{maps} maps"),
    );

    const edited = formatWhen(row.updatedAt);
    if (edited !== null) parts.push(t("project.row.edited", { at: edited }, "last edited {at}"));

    if (row.fromWizard) {
        parts.push(t("project.row.fromWizard", "made by the guide, never opened in the editor"));
    }
    if (row.problem !== null) parts.push(row.problem);

    return parts;
}

export function projectDetailLine(row: ProjectRow, t: Translate): string {
    return projectDetailParts(row, t).join(" · ");
}

/**
 * The text a search runs against.
 *
 * Everything the row puts on screen and nothing it does not: the project's name, the world
 * it belongs to, the path of the file itself, and every part of the detail line. Searching
 * for a folder, for `guide`, or for the word in a problem has to find the row showing it,
 * or the search is lying about what it looked at.
 */
export function projectSearchText(row: ProjectRow, t: Translate): string {
    return [row.name, worldLabel(row), row.world, row.file, ...projectDetailParts(row, t)]
        .filter((value) => value !== "")
        .join(" ");
}

/**
 * What a screen reader says for one row.
 *
 * The name and the whole detail line, because the details are precisely what somebody is
 * choosing between and four rows announced as "Survival" are four rows nobody can choose.
 */
export function projectOptionName(row: ProjectRow, t: Translate): string {
    return `${row.name}. ${projectDetailLine(row, t)}`;
}

/* -------------------------------------------------------------------------- */
/* Taking them away with you                                                  */
/* -------------------------------------------------------------------------- */

export const EXPORT_FORMATS = ["json", "csv", "markdown"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const EXPORT_COLUMNS: readonly (keyof ProjectRow)[] = [
    "name",
    "world",
    "file",
    "id",
    "maps",
    "createdAt",
    "updatedAt",
    "fromWizard",
];

function csvCell(value: unknown): string {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * The chosen rows as a file, in whichever of the three shapes carries them faithfully.
 *
 * JSON keeps every field and round-trips. CSV is the one somebody opens in a spreadsheet,
 * and it carries the same columns rather than a chosen few. Markdown is for pasting into an
 * issue. None of the three drops a field silently: what is exported is what is listed.
 *
 * UTF-8, `\n` line endings, and a trailing newline, because a file that does not end with
 * one is a file every editor silently "fixes" later.
 */
export function exportProjects(rows: readonly ProjectRow[], format: ExportFormat): string {
    if (format === "json") {
        return `${JSON.stringify({ exported: nowStamp(), projects: rows }, null, 4)}\n`;
    }
    if (format === "csv") {
        const head = EXPORT_COLUMNS.join(",");
        const body = rows.map((row) => EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(","));
        return `${[head, ...body].join("\n")}\n`;
    }
    const head = `| ${EXPORT_COLUMNS.join(" | ")} |`;
    const rule = `| ${EXPORT_COLUMNS.map(() => "---").join(" | ")} |`;
    const body = rows.map((row) => `| ${EXPORT_COLUMNS.map((column) => String(row[column] ?? "")).join(" | ")} |`);
    return `${[head, rule, ...body].join("\n")}\n`;
}

/** The file name an export lands under, so a download is not called `download`. */
export function exportFileName(format: ExportFormat, at: Date = new Date()): string {
    const stamp = at.toISOString().replace(/[:.]/g, "-");
    const extension = format === "markdown" ? "md" : format;
    return `material-bluemap-projects-${stamp}.${extension}`;
}

/**
 * The seam between the project surfaces and whatever can actually read a world folder.
 *
 * Written to the same shape as `../history/historyHost.ts` and `../backup/backupBridge.ts`,
 * and for the same reasons. A project file lives at the root of a Minecraft world, so
 * finding one, reading one and writing one all need a file system, and this package runs in
 * three places that have three different amounts of access to one:
 *
 *   - inside the Electron shell, where the preload bridge can walk the world catalogue;
 *   - inside a plain browser tab (`pnpm --filter ui dev`), where it cannot;
 *   - inside vitest, where a fake host makes the whole surface testable with no disk
 *     anywhere near it.
 *
 * A missing host is a stated fact, never a disabled-looking button that silently does
 * nothing. {@link useProjectHost} returns `null` when nothing is wired up, and the surfaces
 * say what is missing rather than showing an empty list that reads as "you have no
 * projects" when the truth is "this build cannot look".
 *
 * ## Why every method is probed one at a time
 *
 * {@link projectHostFromBridge} checks for each function separately and refuses a partial
 * answer for the three a project surface cannot exist without. A released desktop shell can
 * load a newer renderer than the one it was built beside, so a surface that assumed the
 * whole namespace was present would render a Save button that throws when pressed - far
 * worse than a surface that says this build cannot open projects.
 *
 * `deleteProject` is deliberately the exception. A shell that can list, read and write
 * projects is a shell where the whole editor works; refusing the entire feature because it
 * cannot delete one would take away the nine things it can do to punish it for the one it
 * cannot. It is probed on its own and reported as {@link ProjectHost.canDelete}, so the row
 * that would offer deletion says plainly that this build does not, rather than offering a
 * gate whose confirm button throws.
 *
 * ## Nothing here carries a secret
 *
 * A project file travels inside a world folder that people zip up and send to each other,
 * and `projectFileSchema` refuses a storage block carrying `connection-properties` for
 * exactly that reason. Nothing on this bridge moves a credential in either direction.
 */

import { inject, provide, type InjectionKey } from "vue";
import type { ProjectFile, ProjectReadFailure } from "@material-bluemap/config";
import type { HistoryRestoreResult } from "../history/historyHost.js";
import type { SimpleHistoryHost, SimpleHistoryListing } from "../history/simpleHistoryHost.js";

/* -------------------------------------------------------------------------- */
/* What a listing row knows                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One project the machine knows about, read well enough to list without opening it.
 *
 * Everything here is a fact the row shows. Nothing is guessed: a field the main process
 * could not read arrives as null and is left out of the row's line rather than filled in
 * with something plausible.
 */
export interface ProjectSummary {
    /** The world folder the project file sits at the root of, absolute. */
    readonly world: string;
    /** The project file itself, absolute. Shown so a person can find it on disk. */
    readonly file: string;
    /** The project's own stable id, which survives a rename and a move. */
    readonly id: string;
    readonly name: string;
    /** How many maps the project holds. */
    readonly maps: number;
    /** ISO 8601, from the file rather than from the file system's mtime. */
    readonly createdAt: string;
    readonly updatedAt: string;
    /** True while the guide wrote it and nothing has edited it since. */
    readonly fromWizard: boolean;
    /**
     * What the world folder is called, when the main process could tell.
     *
     * The world's own name rather than its folder, where `level.dat` was readable. Null
     * otherwise, and the row falls back to the last segment of the path.
     */
    readonly worldName: string | null;
    /**
     * Set when the file is there and could not be read, with the reason in words.
     *
     * A project that fails to parse still appears in the list. A row that silently vanishes
     * from a list somebody knows it belongs in is the worst answer available: they conclude
     * the app lost their settings, when in fact the file is sitting there intact and
     * something about it needs saying.
     */
    readonly problem: string | null;
}

/** Everything a scan found, including what it could not read. */
export interface ProjectListing {
    readonly projects: readonly ProjectSummary[];
    /** How many world folders were looked at, so an empty list can say it looked. */
    readonly scanned: number;
    /** Folders that could not be examined at all, each with the reason. */
    readonly problems: readonly { readonly world: string; readonly message: string }[];
}

export type ProjectReadAnswer =
    | { readonly ok: true; readonly project: ProjectFile; readonly file: string }
    | { readonly ok: false; readonly failure: ProjectReadFailure };

export type ProjectWriteAnswer =
    | { readonly ok: true; readonly file: string }
    | { readonly ok: false; readonly message: string };

/* -------------------------------------------------------------------------- */
/* The host                                                                    */
/* -------------------------------------------------------------------------- */

/** Everything the project surfaces ask of their environment. */
export interface ProjectHost {
    /** Named in the interface when a capability is missing, e.g. `Electron shell`. */
    readonly name: string;
    /** True when {@link deleteProject} is really there. See the note at the top. */
    readonly canDelete: boolean;

    /**
     * Every world the catalogue knows about that carries a project file.
     *
     * Discovery goes through the world catalogue the wizard already uses, so a project on a
     * USB stick that has been mounted appears here for the same reason its world does.
     */
    listProjects(): Promise<ProjectListing>;

    /** Reads one world's project file. A world with none answers `{ kind: "absent" }`. */
    readProject(world: string): Promise<ProjectReadAnswer>;

    /** Writes the file at the root of that world, replacing whatever is there. */
    writeProject(world: string, project: ProjectFile): Promise<ProjectWriteAnswer>;

    /**
     * Takes the project file off the disk. **Destructive**, and the only call here that is.
     *
     * The world itself is never touched, and neither are any tiles already rendered from
     * it. What is lost is the record of how this world was set up to render, which is
     * precisely the thing the project exists to keep, so the surface puts the two-key gate
     * in front of it.
     */
    deleteProject?(world: string): Promise<ProjectWriteAnswer>;
}

/**
 * The shape the preload bridge is expected to expose.
 *
 * Declared here rather than relied on from `bridge.d.ts` so these surfaces compile against
 * a shell that has not grown the namespace yet, and degrade to "no host" at runtime instead
 * of failing to build. The main process side of this is somebody else's work; this is the
 * contract it has to satisfy.
 */
interface BridgeProjectApi {
    listProjects(): Promise<ProjectListing>;
    readProject(world: string): Promise<ProjectReadAnswer>;
    writeProject(world: string, project: ProjectFile): Promise<ProjectWriteAnswer>;
    deleteProject?(world: string): Promise<ProjectWriteAnswer>;
}

/** The three a project surface cannot exist without, named once so the probe cannot drift. */
const REQUIRED: readonly (keyof BridgeProjectApi)[] = ["listProjects", "readProject", "writeProject"];

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * A host from the desktop shell's bridge, or null when this build has no project layer.
 *
 * Takes the bridge object rather than reaching for `window` itself, so a test can hand it
 * a half-built namespace and see the refusal it produces.
 */
export function projectHostFromBridge(bridge: unknown): ProjectHost | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as { project?: unknown }).project;
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<Record<keyof BridgeProjectApi, unknown>>;
    for (const method of REQUIRED) {
        if (!isFunction(candidate[method])) return null;
    }
    const ready = api as BridgeProjectApi;
    const canDelete = isFunction(ready.deleteProject);

    return {
        name: "Electron shell",
        canDelete,
        listProjects: () => ready.listProjects(),
        readProject: (world) => ready.readProject(world),
        writeProject: (world, project) => ready.writeProject(world, project),
        // Spread rather than assigned, because `exactOptionalPropertyTypes` makes
        // `deleteProject: undefined` a different thing from an absent `deleteProject`, and
        // the surface asks the second question - "is this method here?" - not the first.
        ...(canDelete
            ? {
                  deleteProject: (world: string) =>
                      ready.deleteProject?.(world) as Promise<ProjectWriteAnswer>,
              }
            : {}),
    };
}

const PROJECT_HOST = Symbol("material-bluemap-project-host") as InjectionKey<ProjectHost | null>;

/** Puts a host in reach of every project surface below this component. */
export function provideProjectHost(host: ProjectHost | null): void {
    provide(PROJECT_HOST, host);
}

/**
 * The host, or null when nothing is wired up.
 *
 * Falls back to the window bridge so a surface mounted without an explicit provider still
 * works inside the desktop shell, which is how the shell mounts it.
 */
export function useProjectHost(): ProjectHost | null {
    const provided = inject(PROJECT_HOST, undefined);
    if (provided !== undefined) return provided;
    return resolveProjectHost();
}

/** The bridge on `window`, probed. Exported for the surfaces that resolve their own. */
export function resolveProjectHost(): ProjectHost | null {
    return projectHostFromBridge(typeof globalThis === "undefined" ? null : (globalThis as { materialBluemap?: unknown }).materialBluemap);
}

/* -------------------------------------------------------------------------- */
/* A project file's own version history                                       */
/* -------------------------------------------------------------------------- */

/**
 * The shape `bridge.project.history`/`bridge.project.restore` are expected to satisfy.
 *
 * Declared here rather than relied on from `bridge.d.ts`, for the same reason
 * {@link BridgeProjectApi} is: this surface compiles against a shell that has not grown the
 * two methods yet and degrades to "no host" at runtime instead of failing to build.
 * `history`'s answer is read structurally as a {@link SimpleHistoryListing} - it carries one
 * field this does not need (`worldFolder`, which the caller already knows) and nothing this
 * needs is missing, so no field-by-field remapping is required to satisfy that shape.
 */
interface BridgeProjectHistoryApi {
    history(worldFolder: string, limit?: number): Promise<SimpleHistoryListing>;
    restore(worldFolder: string, id: string): Promise<HistoryRestoreResult>;
}

/**
 * Browse-and-restore for one project file, bound to the world it lives in.
 *
 * `main/project/ipc.ts` registers `project:history` and `project:restore` and
 * `project:save`'s own doc comment already promises "records exactly one revision of it" -
 * every save was writing a revision with nothing in this package ever reading one back. This
 * is `SimpleHistoryList.vue`'s narrow host (list and restore, nothing else - see
 * `../history/simpleHistoryHost.ts` for why a project's history does not need the config-folder
 * panel's other six methods), curried on the one world folder a mounted editor is ever open on,
 * since (unlike the profile list or the application settings) a project's history is scoped to
 * a particular world rather than to one global store.
 */
export function projectHistoryHostFor(bridge: unknown, worldFolder: string): SimpleHistoryHost | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as { project?: unknown }).project;
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<BridgeProjectHistoryApi>;
    if (!isFunction(candidate.history) || !isFunction(candidate.restore)) return null;
    const ready = api as BridgeProjectHistoryApi;

    return {
        list: (limit) => ready.history(worldFolder, limit),
        restore: (id) => ready.restore(worldFolder, id),
    };
}

/** The bridge on `window`, probed and bound to `worldFolder`. */
export function resolveProjectHistoryHost(worldFolder: string): SimpleHistoryHost | null {
    return projectHistoryHostFor(
        typeof globalThis === "undefined" ? null : (globalThis as { materialBluemap?: unknown }).materialBluemap,
        worldFolder,
    );
}

/** One sentence explaining what cannot be done and why, for a surface with no host. */
export function hostMissingReason(): string {
    return (
        "Projects live in a file at the root of a Minecraft world, so opening one needs the " +
        "desktop app. This page is running in a browser tab, which has no access to your " +
        "world folders."
    );
}

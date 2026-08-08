/**
 * The project file — a world's own record of how it should be rendered.
 *
 * A project lives at the root of the Minecraft world it renders, in a single file. That
 * placement is the whole design: a world carries its own settings, so opening a world on
 * another machine, after a reinstall, or three months later finds the maps, the storages
 * and the render options that were set up for it, rather than an empty wizard asking the
 * same five questions again.
 *
 * ## Why a project rather than a wizard alone
 *
 * The wizard collects the minimum needed to start one render and then that knowledge is
 * gone. Everything BlueMap can be told - ninety-odd settings per map, several maps per
 * world, storages, the web app and the web server - has no home between runs. So the
 * wizard now writes one of these, and stays as the easy way in rather than the only one:
 * answer five questions and a project exists that can be reopened and edited in full.
 *
 * ## What is not in here, deliberately
 *
 * **The world path.** The file is inside the world, so the world is wherever the file was
 * found. Storing it as well would create a second source of truth that goes wrong the
 * moment somebody moves or copies the folder - which is exactly when a project needs to
 * still work.
 *
 * **Anything secret.** A project file sits in a folder people zip up and send to each
 * other. Database passwords belong in the storage config the app keeps under its own data
 * directory, never here. {@link projectFileSchema} refuses a storage block that carries a
 * `connection-properties`, so a project cannot become the thing that leaks a password.
 *
 * **The history.** Revisions live in the isolated Git repository beside the app's own
 * data, never as a `.git` inside somebody's world. This file records only which project a
 * history belongs to.
 */

import { z } from "zod";

/**
 * The file's name, at the root of the world folder.
 *
 * Long and explicit on purpose. This lands in a directory Minecraft and every other tool
 * also writes to, so a name like `project.json` would be both unclear about whose it is
 * and a plausible collision. A leading dot was rejected for the opposite reason: a file
 * somebody cannot see is a file they cannot back up, move or delete on purpose.
 */
export const PROJECT_FILE_NAME = "worldlens.project.json";
export const LEGACY_PROJECT_FILE_NAME = "material-bluemap.project.json";
export const PROJECT_FILE_NAMES = [PROJECT_FILE_NAME, LEGACY_PROJECT_FILE_NAME] as const;
export const PROJECT_SCHEMA_ID = "worldlens.project";
export const LEGACY_PROJECT_SCHEMA_ID = "material-bluemap.project";

/**
 * The format version, which is a promise about reading rather than writing.
 *
 * A newer app reads an older file. An older app meeting a newer file must say so and stop
 * rather than guess, because the failure mode of guessing is silently discarding the
 * settings it did not understand the moment it saves.
 */
export const PROJECT_FORMAT_VERSION = 2;

/** ISO 8601, with an offset. Stored as text so a file stays diffable and human-readable. */
const timestamp = z.string().min(1);

/**
 * One map inside a project.
 *
 * `config` carries the complete `maps/<id>.conf` body as HOCON text rather than a parsed
 * object, for the same reason the render bridge does: a map has ninety-odd settings, the
 * editor offers all of them, and a project that stored only the handful with a named field
 * here would silently drop the rest on every save. The named fields are the ones something
 * other than the editor needs to reason about without parsing HOCON.
 */
export const projectMapSchema = z
    .object({
        /** The map id, which becomes `maps/<id>.conf` and the folder tiles are written to. */
        id: z
            .string()
            .min(1)
            .regex(
                /^[a-z0-9_-]+$/,
                "a map id may hold lowercase letters, digits, hyphens and underscores",
            ),
        /** What a person calls it. Free text; the id is what machines use. */
        name: z.string().min(1),
        /** `minecraft:overworld`, `minecraft:the_nether`, or any dimension the world holds. */
        dimension: z.string().min(1),
        /**
         * A different world than the one this project lives in, or null for that one.
         *
         * A project belongs to the world it sits in, and most maps are of that world's own
         * dimensions - so null is the ordinary case and means "here". But a person with several
         * worlds wants one map list covering all of them, and forcing a separate project per
         * world would scatter the settings that describe a single server.
         *
         * Written relative to this project's own world where one path can reach the other, so a
         * whole saves directory can be moved or copied and the project still resolves. An
         * absolute path is accepted for a world on another drive, where no relative path exists,
         * and is the one thing here that does not survive being moved - which the interface says
         * rather than discovering silently at render time.
         */
        world: z.string().nullable().default(null),
        /** The complete `maps/<id>.conf` body, HOCON. */
        config: z.string(),
        /** Which storage in `storages` receives the tiles. */
        storage: z.string().min(1).default("file"),
        /** Order in the web app's map list. Lower sorts first, as upstream does. */
        sorting: z.number().int().default(0),
        /** False keeps the map in the project without rendering it in a render-everything run. */
        enabled: z.boolean().default(true),
    })
    .passthrough();

export type ProjectMap = z.infer<typeof projectMapSchema>;

/**
 * A storage a project writes tiles into.
 *
 * The refusal below is the point of this block. A SQL storage's user name and password
 * live in `connection-properties`, and this file travels: it is inside a world folder that
 * people copy to another machine, zip up for a friend, or commit to a repository. So a
 * project names a storage and holds its non-secret shape, and anything credential-shaped
 * is refused at the schema rather than trusted to reviewers.
 */
export const projectStorageSchema = z
    .object({
        id: z.string().min(1),
        /** The complete `storages/<id>.conf` body, HOCON. */
        config: z.string(),
    })
    .passthrough()
    .refine((storage) => !/(^|\n)\s*connection-properties\s*[:{=]/.test(storage.config), {
        message:
            "a project file travels with the world, so it must not carry connection-properties: " +
            "put the credentialed storage in the config folder the app keeps under its own data directory",
    });

export type ProjectStorage = z.infer<typeof projectStorageSchema>;

/** How a render of this project is started. Mirrors the CLI's own options. */
export const projectRenderSchema = z
    .object({
        /**
         * Where the render is executed. Older project files omit this field and are treated as
         * local by every reader; new files write the choice explicitly so a project opened on a
         * second computer keeps the same one-click Render behaviour.
         */
        route: z.enum(["local", "github-actions"]).optional(),
        /** Null means "let BlueMap decide", which is what upstream does with no value. */
        threads: z.number().int().min(1).nullable().default(null),
        force: z.boolean().default(false),
        fixEdges: z.boolean().default(false),
        metrics: z.boolean().default(false),
        /**
         * Where the rendered web map is written, absolute.
         *
         * The one absolute path here, and it has to be: the output belongs outside the world,
         * so it cannot be expressed relative to a file that lives inside it. Null means the app
         * uses the storage directory chosen during setup, which is the ordinary case.
         */
        outputFolder: z.string().nullable().default(null),
    })
    .passthrough();

export type ProjectRender = z.infer<typeof projectRenderSchema>;

/**
 * The file itself.
 *
 * `core`, `webapp`, `webserver` and `plugin` are whole HOCON bodies for the same reason a
 * map's is: the editor offers every field upstream defines, and a project that modelled a
 * chosen subset would quietly lose the rest. Absent means "this project never touched it",
 * and the app generates BlueMap's default at render time.
 */
export const projectFileSchema = z
    .object({
        /** Stable schema identity. Legacy and absent values are adapted on read. */
        schema: z.enum([PROJECT_SCHEMA_ID, LEGACY_PROJECT_SCHEMA_ID]).optional(),
        /** Refused rather than guessed when it is from the future. See PROJECT_FORMAT_VERSION. */
        version: z.number().int().min(1),
        /** Stable across renames and moves, so a history can follow a project that was renamed. */
        id: z.string().min(1),
        name: z.string().min(1),
        createdAt: timestamp,
        updatedAt: timestamp,
        /** Which build wrote it last. Diagnostic only; never used to decide behaviour. */
        appVersion: z.string().nullable().default(null),

        maps: z.array(projectMapSchema).default([]),
        storages: z.array(projectStorageSchema).default([]),
        render: projectRenderSchema.default({
            route: "local",
            threads: null,
            force: false,
            fixEdges: false,
            metrics: false,
            outputFolder: null,
        }),

        core: z.string().nullable().default(null),
        webapp: z.string().nullable().default(null),
        webserver: z.string().nullable().default(null),
        plugin: z.string().nullable().default(null),

        /**
         * True when this project was written by the wizard and has not been edited since.
         *
         * Not a lesser kind of project - it is the same file with the same settings - but the
         * interface can honestly say "made by the guide, never opened in the editor", which is
         * the difference between a project somebody designed and one they accepted defaults for.
         */
        fromWizard: z.boolean().default(false),
    })
    .passthrough();

export type ProjectFile = z.infer<typeof projectFileSchema>;

/** Why a project file could not be read. Each is something to tell a person, not a stack. */
export type ProjectReadFailure =
    | { readonly kind: "absent" }
    | { readonly kind: "unreadable"; readonly message: string }
    | { readonly kind: "not-json"; readonly message: string }
    | { readonly kind: "too-new"; readonly version: number }
    | { readonly kind: "invalid"; readonly problems: readonly string[] };

export type ProjectReadResult =
    | { readonly ok: true; readonly project: ProjectFile }
    | { readonly ok: false; readonly failure: ProjectReadFailure };

/**
 * Reads a project out of the text of a file.
 *
 * Pure, and separate from anything that touches a disk, so every refusal above can be
 * tested without one. A version from the future is refused before validation runs: a file
 * written by a newer app will fail this schema in confusing ways, and "this project was
 * made by a newer version of the app" is the true and useful thing to say.
 */
export function parseProjectFile(text: string): ProjectReadResult {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        return {
            ok: false,
            failure: {
                kind: "not-json",
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }

    const version = (raw as { version?: unknown } | null)?.version;
    if (typeof version === "number" && version > PROJECT_FORMAT_VERSION) {
        return { ok: false, failure: { kind: "too-new", version } };
    }

    // Versioned, lossless adapters. Spreading keeps fields this build does not model;
    // `.passthrough()` on every object keeps them through validation and serialization.
    // Version 1 had no schema field and used the legacy filename. Version 2 writes the
    // immutable Worldlens schema id, while still accepting the explicit legacy id.
    const adapted =
        typeof raw === "object" &&
        raw !== null &&
        !Array.isArray(raw) &&
        (version === 1 || version === 2)
            ? {
                  ...(raw as Record<string, unknown>),
                  version: PROJECT_FORMAT_VERSION,
                  schema: PROJECT_SCHEMA_ID,
              }
            : raw;

    const parsed = projectFileSchema.safeParse(adapted);
    if (!parsed.success) {
        return {
            ok: false,
            failure: {
                kind: "invalid",
                problems: parsed.error.issues.map((issue) =>
                    issue.path.length > 0
                        ? `${issue.path.join(".")}: ${issue.message}`
                        : issue.message,
                ),
            },
        };
    }
    return { ok: true, project: parsed.data };
}

/**
 * The text to write for a project.
 *
 * Two decisions worth keeping. It is indented and its keys are written in a fixed order, so
 * two saves that changed one setting differ by one line - this file is version-controlled,
 * and a formatter that reorders keys turns every diff into noise. And it ends with a
 * newline, because a file that does not is a file every editor silently "fixes" later.
 */
export function serializeProjectFile(project: ProjectFile): string {
    const ordered: ProjectFile = {
        schema: PROJECT_SCHEMA_ID,
        version: PROJECT_FORMAT_VERSION,
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        appVersion: project.appVersion,
        maps: project.maps,
        storages: project.storages,
        render: project.render,
        core: project.core,
        webapp: project.webapp,
        webserver: project.webserver,
        plugin: project.plugin,
        fromWizard: project.fromWizard,
        ...Object.fromEntries(
            Object.entries(project).filter(
                ([key]) =>
                    ![
                        "schema",
                        "version",
                        "id",
                        "name",
                        "createdAt",
                        "updatedAt",
                        "appVersion",
                        "maps",
                        "storages",
                        "render",
                        "core",
                        "webapp",
                        "webserver",
                        "plugin",
                        "fromWizard",
                    ].includes(key),
            ),
        ),
    };
    return `${JSON.stringify(ordered, null, 4)}\n`;
}

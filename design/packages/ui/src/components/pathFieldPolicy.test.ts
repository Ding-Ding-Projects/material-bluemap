/**
 * The browse affordance's own contract, kept true by a test rather than by remembering.
 *
 * The rule is short: **every field that names a folder or a file on this machine offers the
 * native browse button**, `PathField.vue`, alongside the box a path can still be typed or
 * pasted into. It is not a rule about most path fields, and it is not satisfied by a picker
 * living somewhere else on the screen.
 *
 * `HANDOFF.md`'s own trap is the reason this file has two halves rather than one. A rule
 * test that only re-checks the fields a wiring pass already touched catches a `PathField`
 * quietly turned back into a `v-text-field` - but it has nothing to say about a ninth path
 * field written next month that never got a browse button in the first place, because
 * nothing about writing a plain `v-text-field` labelled "Folder" feels like a violation while
 * you are doing it. Two different failures, so two different halves:
 *
 *  1. **The named list** (`WIRED_PATH_FIELDS`). Every field the wiring pass reported, taken
 *     from the actual report and checked against the actual source rather than trusted. This
 *     catches the affordance being lost from a field that had it.
 *  2. **The structural sweep**. Every `v-text-field`/`v-textarea`/`VTextField`/`VTextarea` in
 *     the whole package whose label or hint reads as a filesystem location, cross-checked
 *     against `PATH_FIELD_EXEMPTIONS`. A path-shaped field with no `<PathField>` block in its
 *     file and no exemption fails outright. This catches a path field that was never wired at
 *     all - which is exactly how `components/project/ProjectEditor.vue`'s "Where the rendered
 *     map is written" turned up while this file was being written: a real absolute path, on a
 *     plain text box, with no browse button and no test that had ever asked. It now carries
 *     `PathField` and is in the named list instead of the exemption table.
 *
 * What this deliberately does NOT do is check that `PathField.vue` itself works - that is
 * `PathField.test.ts` and `pathFieldHost.test.ts`, and duplicating them here would make this
 * file slow and fragile without making it stricter.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** `packages/ui/src`, one level above this file (`components/pathFieldPolicy.test.ts`). */
const uiSource = fileURLToPath(new URL("..", import.meta.url));

function read(path: string): string {
    return readFileSync(join(uiSource, path), "utf8");
}

function relativeToSource(path: string): string {
    return relative(uiSource, path).replaceAll("\\", "/");
}

function vueFiles(dir: string, found: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            vueFiles(path, found);
            continue;
        }
        if (name.endsWith(".vue")) found.push(path);
    }
    return found;
}

/**
 * `PathField.vue` is the affordance itself. Its own internal `v-text-field` - the mono-font
 * box a path is typed into - is not a field that needs the affordance; it IS the affordance.
 */
const MACHINERY = new Set<string>(["components/PathField.vue"]);

/** Every `<PathField ... />` block in a file, self-closing exactly as all of them are written. */
function pathFieldBlocks(source: string): string[] {
    const blocks: string[] = [];
    const OPEN = /<PathField\b/g;
    let match: RegExpExecArray | null;
    while ((match = OPEN.exec(source)) !== null) {
        const close = source.indexOf("/>", match.index);
        if (close === -1) continue;
        blocks.push(source.slice(match.index, close + 2));
    }
    return blocks;
}

/* -------------------------------------------------------------------------- */
/* Part 1: the wired fields, named and checked against the source             */
/* -------------------------------------------------------------------------- */

interface WiredField {
    readonly file: string;
    /** What a user sees, in words a reviewer can match against the wiring report. */
    readonly describes: string;
    /** A substring that must appear inside that file's `<PathField ... />` markup. */
    readonly needle: string;
}

/**
 * Every path field this application wires to the shared browse affordance, one entry per
 * field a user can meet, not per file - `MapsScreen.vue` and `StoragesScreen.vue` each carry
 * one of their own alongside the schema-driven ones `ConfigControl.vue` covers generically.
 *
 * THIS LIST IS EXPECTED TO GROW. A new folder or file field wired to `PathField` is one line
 * here; the second half of this file (the structural sweep, below) is what stops that line
 * from ever being the only thing standing between a path field and a plain text box.
 */
const WIRED_PATH_FIELDS: readonly WiredField[] = [
    {
        file: "components/config/ConfigControl.vue",
        describes:
            "every BlueMap config field the schema declares kind: 'path' - web root, data " +
            "folder, debug/access log files, storage map folder, the JDBC driver .jar, world " +
            "folder and the rest - rendered across MapsScreen, StoragesScreen, ConfigScreen " +
            "and every schema-driven config screen",
        needle: "v-else-if=\"control.kind === 'path'\"",
    },
    {
        file: "components/config/MapsScreen.vue",
        describes: "\"World folder\" in the New Map create dialog",
        needle: "config.maps.world",
    },
    {
        file: "components/config/StoragesScreen.vue",
        describes: "\"Folder for rendered tiles\" in the New Storage create dialog",
        needle: "config.storages.root",
    },
    {
        file: "components/settings/StorageSettingRow.vue",
        describes: "Folder for rendered maps (settings.storage.field)",
        needle: "settings.storage.field",
    },
    {
        file: "components/setup/SetupStorageStep.vue",
        describes: "Folder for rendered maps, first-run setup wizard step 3 (storage.fieldLabel)",
        needle: "storage.fieldLabel",
    },
    {
        file: "components/remote/RemoteTargetEditor.vue",
        describes: "Private key file, the SSH identity file (remote.targets.field.identity)",
        needle: "remote.targets.field.identity",
    },
    {
        file: "components/backup/BackupScreen.vue",
        describes: "Folder (backup.folder), the world or render folder being backed up",
        needle: "backup.folder",
    },
    {
        file: "components/project/ProjectEditor.vue",
        describes:
            "Where the rendered map is written (project.render.outputFolder) - the one " +
            "absolute path a project carries, per that field's own hint",
        needle: "project.render.outputFolder",
    },
    {
        file: "components/worldrepo/WorldRepoScreen.vue",
        describes: "World folder (worldrepo.field.worldPath), the world being synced or adopted into",
        needle: "worldrepo.field.worldPath",
    },
];

describe("every path field the wiring pass reported still carries the browse affordance", () => {
    it("finds every listed file, so a rename cannot quietly empty this list", () => {
        for (const { file } of WIRED_PATH_FIELDS) {
            expect(() => read(file), file).not.toThrow();
        }
    });

    it("is not itself empty, so a broken list cannot pass by covering nothing", () => {
        expect(WIRED_PATH_FIELDS.length).toBeGreaterThanOrEqual(8);
    });

    it("keeps a <PathField> block naming each one, rather than a plain text box", () => {
        const lost: string[] = [];
        for (const { file, describes, needle } of WIRED_PATH_FIELDS) {
            const blocks = pathFieldBlocks(read(file));
            const present = blocks.some((block) => block.includes(needle));
            if (!present) lost.push(`${file}: ${describes}`);
        }
        expect(
            lost,
            "one of the fields the wiring pass reported no longer has a <PathField> block " +
                "naming it. Either the browse button was removed, or the field's own key " +
                "changed and this list's needle needs updating to match.",
        ).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Part 2: the structural sweep - a path field that was never wired at all    */
/* -------------------------------------------------------------------------- */

const PATH_LIKE_TAG = /<(?:v-text-field|VTextField|v-textarea|VTextarea)\b[^>]*>/g;
const PATH_SHAPED = /folder|directory|\bpath\b|\bfile\b/i;

interface PathLikeField {
    /** The field's own `t()`/`i18n.t()` key, when the tag's label resolves through one. */
    readonly key: string | null;
    readonly tag: string;
}

/**
 * Every `v-text-field`/`v-textarea` (kebab-case or the `VTextField`/`VTextarea` PascalCase
 * `cirender/CiRenderScreen.vue` writes instead) whose label or hint reads as a filesystem
 * location - "folder", "directory", "path" or "file" - somewhere in its opening tag.
 *
 * Deliberately generous, the same trade-off `regexPolicy.test.ts`'s `hasSearchShapedInput`
 * makes: it is better to make somebody write one exemption sentence than to let a real path
 * field through because its label said "Location" instead of "Folder".
 */
function pathLikeFields(source: string): PathLikeField[] {
    const found: PathLikeField[] = [];
    PATH_LIKE_TAG.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PATH_LIKE_TAG.exec(source)) !== null) {
        const tag = match[0];
        if (!PATH_SHAPED.test(tag)) continue;
        const keyMatch = /:label="(?:i18n\.)?t\(\s*["']([\w.-]+)["']/.exec(tag);
        found.push({ key: keyMatch?.[1] ?? null, tag });
    }
    return found;
}

/**
 * Why a path-shaped field is not a gap, as one of a closed set of three reasons - closed for
 * the same reason `superConfirmPolicy.test.ts`'s `Standing` is: a fourth reason invented by
 * writing prose in `note` would make an exemption exactly as easy to fake as no exemption at
 * all, and `it('proves every "own-browse" exemption really has one...')` below only knows how
 * to check three.
 *
 *  - `not-a-location`  Names an identifier, a slug, or the file's own text content - not a
 *                       place on disk to navigate to. `config.maps.fileName` is the config
 *                       file's own name being chosen, not an existing path being found.
 *  - `own-browse`      A folder/file browse already lives in this file, predating
 *                       `PathField.vue` (`WorldFolderStep.vue` and `MapStorageStep.vue` are
 *                       the two `PathField.vue`'s own file header names as exactly that
 *                       precedent). Checked, not just claimed: the file must still call
 *                       `pickFolder(`/`pickFile(` itself.
 *  - `remote-machine`  The path names a location on a different computer.
 *                       `RemoteTargetEditor.vue`'s own identity-file field sits right beside
 *                       this one and does use `PathField`, which is the proof the split is
 *                       deliberate rather than an oversight: a local file dialog can open a
 *                       path this machine can see, and the ssh work directory is never that.
 */
type ExemptionReason = "not-a-location" | "own-browse" | "remote-machine";

interface Exemption {
    readonly reason: ExemptionReason;
    /** Why this word, specifically, for this field. */
    readonly note: string;
}

/** Keyed `${file}::${the field's own t() key}`, so two fields in one file cannot share cover. */
const PATH_FIELD_EXEMPTIONS: Record<string, Exemption> = {
    "components/config/ConfigFileForm.vue::config.form.raw": {
        reason: "not-a-location",
        note:
            "The raw fallback editor for a config file that failed to parse. Its content is " +
            "the file's text, not a place on disk - there is nothing here to browse to.",
    },
    "components/config/ConfigMarkerSetsField.vue::config.markers.raw": {
        reason: "not-a-location",
        note:
            "The raw marker JSON, exactly as written in the map's config file. A textarea of " +
            "content, not a field naming where a file lives.",
    },
    "components/config/MapsScreen.vue::config.maps.fileName": {
        reason: "not-a-location",
        note:
            "The new map config file's own name, typed while creating or duplicating it - an " +
            "identifier being chosen, not an existing path being found on disk.",
    },
    "components/config/StoragesScreen.vue::config.storages.fileName": {
        reason: "not-a-location",
        note:
            "The new storage config file's own name. Its own hint says a map points at this " +
            "storage by exactly this name - an identifier, not a filesystem location.",
    },
    "components/world/MapIdentityStep.vue::world.identity.id": {
        reason: "not-a-location",
        note:
            "The map's id/slug. Its hint says it is used as the folder name and in the served " +
            "address, which is exactly why it is not itself a path to browse to.",
    },
    "components/world/MinecraftWorldList.vue::world.mounts.renameLabel": {
        reason: "not-a-location",
        note:
            "Renames the display label of a folder already mounted, in place. The mount " +
            "itself is chosen through this same file's own browseForFolder(), a few lines " +
            "away, which is what adds a folder rather than relabels one already added.",
    },
    "components/project/DiscoveredWorldsPanel.vue::project.discovered.renameLabel": {
        reason: "not-a-location",
        note:
            "The same field as MinecraftWorldList.vue's own world.mounts.renameLabel above, " +
            "on this panel's own discovered-world rows: it renames the display label of a " +
            "folder already mounted, in place. The mount itself is chosen through this " +
            "file's own browseForFolder(), a few lines away, which is what adds a folder " +
            "rather than relabels one already added.",
    },
    "components/cirender/CiRenderScreen.vue::cirender.field.world": {
        reason: "own-browse",
        note:
            "browseWorldFolder() in this same file reads window.materialBluemap.dialog." +
            "pickFolder directly - one of the three routes this screen's own comment says " +
            "it offers for the same choice WorldFolderStep.vue offers, predating PathField.vue.",
    },
    "components/project/ProjectsScreen.vue::project.create.world": {
        reason: "own-browse",
        note:
            "pickWorld(), wired to the Browse button beside this field, calls the config " +
            "host's own pickDirectory() directly rather than through PathField.vue.",
    },
    "components/world/MapStorageStep.vue::world.storage.folder": {
        reason: "own-browse",
        note:
            "browse() in this same file calls the config host's own pickDirectory() " +
            "directly. PathField.vue's own file header names this component as one of the " +
            "pickers it was modelled on rather than written to replace.",
    },
    "components/world/WorldFolderStep.vue::world.folder.label": {
        reason: "own-browse",
        note:
            "browse() in this same file calls the config host's own pickDirectory() " +
            "directly, alongside drag-and-drop and a list of known worlds. PathField.vue's " +
            "own file header names this component as one of the pickers it was modelled on.",
    },
    "components/remote/RemoteTargetEditor.vue::remote.targets.field.workDir": {
        reason: "remote-machine",
        note:
            "A directory on the remote machine this render target connects to over ssh, not " +
            "on this one. This file's identity-file field, a few lines above, does carry " +
            "PathField - the split is deliberate: this machine's file dialog cannot open a " +
            "path on a computer it is not running on.",
    },
    "components/remote/RemoteFileBrowser.vue::remote.browse.pathLabel": {
        reason: "remote-machine",
        note:
            "The Explorer-style remote browser's own address bar - the exact dialog " +
            "RemoteTargetEditor.vue's workDir field above opens as its 'Browse...' " +
            "affordance. A local PathField.vue dialog cannot list a path on the remote " +
            "machine this component is browsing, for the same reason workDir is exempt. " +
            "This field is not a bare text box either: it is synchronised in both " +
            "directions with the breadcrumb and directory grid it sits beside - typing a " +
            "path and pressing Enter navigates the grid, and clicking a breadcrumb or " +
            "entering a folder writes the resolved path back here - so it already carries " +
            "the remote equivalent of a browse affordance rather than needing one bolted on.",
    },
};

describe("every path-shaped text field either carries the affordance or names why not", () => {
    const files = vueFiles(uiSource)
        .map(relativeToSource)
        .filter((file) => !MACHINERY.has(file));

    it("finds the components it is supposed to be watching", () => {
        // A glob or regex that silently stopped matching would make every field below look
        // perfectly covered.
        expect(files.length).toBeGreaterThan(40);
    });

    it("finds at least the path-shaped fields already known about, so the detector itself is live", () => {
        const total = files.reduce((sum, file) => sum + pathLikeFields(read(file)).length, 0);
        expect(total).toBeGreaterThanOrEqual(Object.keys(PATH_FIELD_EXEMPTIONS).length);
    });

    it("gives every path-shaped field the affordance, or a written exemption", () => {
        const undeclared: string[] = [];

        for (const file of files) {
            const source = read(file);
            const hasPathField = pathFieldBlocks(source).length > 0;
            for (const { key, tag } of pathLikeFields(source)) {
                if (hasPathField) continue;
                const exemptKey = `${file}::${key ?? tag.slice(0, 60)}`;
                if (exemptKey in PATH_FIELD_EXEMPTIONS) continue;
                undeclared.push(exemptKey);
            }
        }

        expect(
            undeclared,
            "a field naming a folder or a file has no browse button in its own file, and no " +
                "exemption saying why not. Wire it to PathField.vue (see components/config/" +
                "MapsScreen.vue for the shape), or - if it genuinely is not a location to " +
                "browse to - name it in PATH_FIELD_EXEMPTIONS with the reason.",
        ).toEqual([]);
    });

    it("keeps every exemption pointing at a field that still exists and still looks path-shaped", () => {
        for (const [exemptKey, { note }] of Object.entries(PATH_FIELD_EXEMPTIONS)) {
            const separator = exemptKey.indexOf("::");
            const file = exemptKey.slice(0, separator);
            const key = exemptKey.slice(separator + 2);
            const source = read(file);
            // A stale exemption is how this guard starts covering less than it says.
            const stillThere = pathLikeFields(source).some((field) => field.key === key);
            expect(stillThere, `${exemptKey} no longer matches a path-shaped field`).toBe(true);
            expect(note.length, `${exemptKey} needs a real reason, not a placeholder`).toBeGreaterThan(40);
        }
    });

    it('proves every "own-browse" exemption really has one, rather than trusting the label', () => {
        // Two bridges exist in this package: `pathFieldHost.ts`'s `pickFolder`/`pickFile`
        // (what `PathField.vue` itself calls) and the older `configHost.ts`'s
        // `pickDirectory`, which every one of these four files predates that bridge with.
        // CiRenderScreen.vue reads `window.materialBluemap.dialog.pickFolder` by hand rather
        // than through either host, so a property reference counts as much as a call does.
        const OWN_BROWSE_CALL = /\bpickFolder\b|\bpickFile\b|\bpickDirectory\b/;
        for (const [exemptKey, { reason }] of Object.entries(PATH_FIELD_EXEMPTIONS)) {
            if (reason !== "own-browse") continue;
            const file = exemptKey.slice(0, exemptKey.indexOf("::"));
            const source = read(file);
            expect(
                OWN_BROWSE_CALL.test(source),
                `${exemptKey} claims its own browse but this file never reaches a pick call`,
            ).toBe(true);
        }
    });

    it("catches a fabricated gap, and does not accuse an ordinary field", () => {
        // The detector is the whole test, so it is exercised rather than trusted.
        const gap = pathLikeFields('<v-text-field :label="t(\'x.y\', \'Folder to render into\')" />');
        expect(gap).toHaveLength(1);
        expect(gap[0]?.key).toBe("x.y");

        const pascal = pathLikeFields('<VTextField :label="t(\'x.z\', \'World folder\')" />');
        expect(pascal).toHaveLength(1);

        const innocent = pathLikeFields('<v-text-field :label="t(\'x.y\', \'Display name\')" />');
        expect(innocent).toHaveLength(0);

        const notAField = pathLikeFields('<v-select :label="t(\'x.y\', \'Folder\')" />');
        expect(notAField).toHaveLength(0);
    });
});

import { describe, expect, it } from "vitest";
import { descriptorFor, renderMapTemplate, type FieldMeta } from "@worldlens/config";
import {
    baselineFieldValue,
    changedFields,
    clearFieldValue,
    fieldValue,
    hasBlockingIssues,
    isDirty,
    isExplicit,
    isStructurallyEditable,
    markSaved,
    openConfigFile,
    replaceText,
    setFieldValue,
    tileInvalidatingChanges,
    type AnyDescriptor,
    type EditableConfigFile,
} from "./configModel.js";

const mapDescriptor = descriptorFor("map") as AnyDescriptor;

function field(path: string): FieldMeta {
    const found = mapDescriptor.fields.find((candidate) => candidate.path === path);
    if (found === undefined) throw new Error(`no such field: ${path}`);
    return found;
}

function openMap(): EditableConfigFile {
    const text = renderMapTemplate({
        name: "Overworld",
        world: "/srv/world",
        dimension: "minecraft:overworld",
        dimensionType: "minecraft:overworld",
        sorting: 0,
        preset: "overworld",
    });
    return openConfigFile(mapDescriptor, "maps/overworld.conf", text);
}

describe("opening a file", () => {
    it("reads upstream's own generated map config without complaint", () => {
        const file = openMap();
        expect(file.document).not.toBeNull();
        expect(hasBlockingIssues(file)).toBe(false);
        expect(isDirty(file)).toBe(false);
    });

    it("fills defaults in, so a key the file never mentions still has a value to show", () => {
        const file = openMap();
        expect(isExplicit(file, field("lod-count"))).toBe(false);
        expect(fieldValue(file, field("lod-count"))).toBe(3);
    });

    it("reads the values the template actually wrote", () => {
        const file = openMap();
        expect(fieldValue(file, field("world"))).toBe("/srv/world");
        expect(fieldValue(file, field("sky-color"))).toBe("#7dabff");
        expect(isExplicit(file, field("sky-color"))).toBe(true);
    });
});

describe("editing one setting", () => {
    it("keeps every comment in the file", () => {
        const file = openMap();
        const commentsBefore = (file.text.match(/^\s*#/gm) ?? []).length;

        const edited = setFieldValue(file, field("ambient-light"), 0.4);
        const commentsAfter = (edited.text.match(/^\s*#/gm) ?? []).length;

        expect(commentsAfter).toBe(commentsBefore);
        expect(fieldValue(edited, field("ambient-light"))).toBe(0.4);
    });

    it("changes one line and leaves the rest of the file byte for byte", () => {
        const file = openMap();
        const edited = setFieldValue(file, field("ambient-light"), 0.4);

        const before = file.text.split("\n");
        const after = edited.text.split("\n");
        expect(after).toHaveLength(before.length);

        const differing = before.map((line, index) => (line === after[index] ? null : index)).filter((index) => index !== null);
        expect(differing).toHaveLength(1);
    });

    it("marks the file dirty, and clean again once it is saved", () => {
        const file = setFieldValue(openMap(), field("ambient-light"), 0.4);
        expect(isDirty(file)).toBe(true);
        expect(isDirty(markSaved(file))).toBe(false);
    });

    it("adds a key the file did not have", () => {
        // `lod-factor` is one of the tile-geometry settings upstream's template
        // never writes, so a generated file genuinely does not mention it.
        const file = openMap();
        expect(isExplicit(file, field("lod-factor"))).toBe(false);

        const edited = setFieldValue(file, field("lod-factor"), 4);
        expect(isExplicit(edited, field("lod-factor"))).toBe(true);
        expect(fieldValue(edited, field("lod-factor"))).toBe(4);
    });

    it("removes a key so BlueMap falls back to its default, keeping the comment that explains it", () => {
        const file = openMap();
        const explanationBefore = (file.text.match(/^\s*#/gm) ?? []).length;

        const cleared = clearFieldValue(file, field("sky-color"));
        expect(isExplicit(cleared, field("sky-color"))).toBe(false);
        expect(fieldValue(cleared, field("sky-color"))).toBe("#7dabff");
        expect((cleared.text.match(/^\s*#/gm) ?? []).length).toBe(explanationBefore);
    });

    it("does nothing when asked to clear a key that was never there", () => {
        const file = openMap();
        expect(clearFieldValue(file, field("lod-count")).text).toBe(file.text);
    });
});

describe("what changed", () => {
    it("lists the settings whose effective value differs from the saved file", () => {
        const file = setFieldValue(openMap(), field("ambient-light"), 0.4);
        const changes = changedFields(file);

        expect(changes).toHaveLength(1);
        expect(changes[0]?.field.path).toBe("ambient-light");
        expect(changes[0]?.from).toBe(0.1);
        expect(changes[0]?.to).toBe(0.4);
    });

    it("reports nothing when a key is written with the value it already had", () => {
        const file = setFieldValue(openMap(), field("sky-color"), "#7dabff");
        expect(changedFields(file)).toHaveLength(0);
    });

    it("still counts the file as dirty when only the text changed, so the save is not lost", () => {
        const file = setFieldValue(openMap(), field("lod-count"), 3);
        expect(changedFields(file)).toHaveLength(0);
        expect(isDirty(file)).toBe(true);
    });

    it("flags a change that makes already-rendered tiles wrong", () => {
        // Cave removal is baked into the geometry, so changing it means every
        // tile has to be produced again.
        const file = setFieldValue(openMap(), field("remove-caves-below-y"), 40);
        const invalidating = tileInvalidatingChanges(file);

        expect(invalidating).toHaveLength(1);
        expect(invalidating[0]?.field.path).toBe("remove-caves-below-y");
        expect(invalidating[0]?.field.invalidatesTiles).toBe(true);
        expect(invalidating[0]?.invalidationNote).toBe(field("remove-caves-below-y").invalidationNote);
    });

    it("does not flag a change the web app applies at view time", () => {
        // Ambient light is applied by the viewer, not baked into the tiles, and
        // the schema says so. Warning about a re-render here would train people
        // to ignore the warning that matters.
        const file = setFieldValue(openMap(), field("ambient-light"), 0.4);
        expect(changedFields(file)).toHaveLength(1);
        expect(tileInvalidatingChanges(file)).toHaveLength(0);
    });

    it("does not flag a change that only renames the map", () => {
        const file = setFieldValue(openMap(), field("name"), "The Overworld");
        expect(changedFields(file)).toHaveLength(1);
        expect(tileInvalidatingChanges(file)).toHaveLength(0);
    });

    it("keeps the baseline pointing at the saved file, not at the last edit", () => {
        const once = setFieldValue(openMap(), field("ambient-light"), 0.4);
        const twice = setFieldValue(once, field("ambient-light"), 0.6);

        expect(baselineFieldValue(twice, field("ambient-light"))).toBe(0.1);
        expect(changedFields(twice)).toHaveLength(1);
    });
});

describe("a file that does not parse", () => {
    const broken = () => replaceText(openMap(), "world: { unclosed");

    it("reports the parse error and offers no controls", () => {
        const file = broken();
        expect(file.document).toBeNull();
        expect(isStructurallyEditable(file)).toBe(false);
        expect(file.issues.some((issue) => issue.kind === "hocon")).toBe(true);
    });

    it("refuses to edit rather than throwing away what the user has in the file", () => {
        const file = broken();
        expect(setFieldValue(file, field("world"), "/elsewhere").text).toBe(file.text);
        expect(clearFieldValue(file, field("world")).text).toBe(file.text);
    });

    it("comes back to life the moment the text parses again", () => {
        const fixed = replaceText(broken(), 'world: "/srv/world"\n');
        expect(fixed.document).not.toBeNull();
        expect(fieldValue(fixed, field("world"))).toBe("/srv/world");
    });
});

describe("a JSON config file", () => {
    it("is shown read-only, because writing HOCON into it would produce a file BlueMap refuses", () => {
        const file = openConfigFile(mapDescriptor, "maps/overworld.json", '{ "world": "/srv/world" }');
        expect(file.readOnly).toBe(true);
        expect(file.readOnlyReason ?? "").toContain("JSON");
        expect(isStructurallyEditable(file)).toBe(false);
    });
});

describe("validation", () => {
    it("reports a key BlueMap would silently ignore", () => {
        const file = replaceText(openMap(), 'render-treads: 8\nworld: "/srv/world"\n');
        const unknown = file.issues.find((issue) => issue.kind === "unknown-key");
        expect(unknown?.path).toBe("render-treads");
        expect(unknown?.severity).toBe("warning");
    });

    it("reports a value the schema refuses as an error against that key", () => {
        const file = replaceText(openMap(), 'sky-color: "not a colour"\n');
        expect(hasBlockingIssues(file)).toBe(true);
        expect(file.issues.some((issue) => issue.path === "sky-color")).toBe(true);
    });
});

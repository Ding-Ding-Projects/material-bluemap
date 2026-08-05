/**
 * The guard for "need these on every single element": every setting the options
 * editor shows gets the full explanation with its disclosure toggle, and the
 * default-provenance line, truthfully.
 *
 * `ConfigField.vue` has always carried that pair for the 154 settings
 * `configSearch.test.ts`'s `buildSettingIndex()` counts. This file adds the two
 * places that count does not reach, because neither is a `FieldMeta` a whole
 * config file owns: a render mask's own shape fields (`MASK_SHAPES`, rendered by
 * `ConfigMaskField.vue`) and a marker set's own container properties
 * (`MARKER_SET_FIELDS`, rendered by `ConfigMarkerSetsField.vue`). Together the
 * three sources are every place this editor puts a `FieldMeta` in front of
 * somebody.
 *
 * ## Why an explicit list, not just a property check
 *
 * A test that only asks "does every enumerated field have a non-empty doc and a
 * real default" would have passed the day before this task started, for the
 * wrong reason: `ConfigMarkerSetsField.vue` rendered its four container
 * properties as hand-written controls with no `FieldMeta` behind them at all, so
 * nothing about them was ever enumerable in the first place. A property check
 * over an enumeration can only fail on a field *inside* the enumeration; it says
 * nothing about a setting that never joined it, which is exactly how the marker
 * set gap survived unnoticed. `EXPECTED_MASK_FIELDS` and
 * `EXPECTED_MARKER_SET_FIELDS` below are hand-maintained manifests of what
 * `MASK_SHAPES` and `MARKER_SET_FIELDS` are supposed to contain, so a shape or a
 * property added to the schema without a matching update here is a red test
 * naming exactly what is missing, rather than a silently wider enumeration that
 * still reports everything covered.
 */

import { describe, expect, it } from "vitest";
import { MARKER_SET_FIELDS, MASK_SHAPES, generateConfigSet, renderPluginTemplate, type FieldMeta } from "@material-bluemap/config";
import { buildSettingIndex } from "./configSearch.js";
import { loadWorkspace, type ConfigWorkspace } from "./configWorkspace.js";
import { isDocLong } from "./explainField.js";

const OPTIONS = { webroot: "/srv/web", dataFolder: "/srv/data", world: "/srv/world", version: "5.22" };

function workspace(): ConfigWorkspace {
    return loadWorkspace("/cfg", [...generateConfigSet(OPTIONS), { path: "plugin.conf", text: renderPluginTemplate() }]);
}

/** The explicit manifest: every mask shape, and every field it is supposed to carry, in order. */
const EXPECTED_MASK_FIELDS: Record<string, readonly string[]> = {
    box: ["subtract", "min-x", "max-x", "min-y", "max-y", "min-z", "max-z"],
    circle: ["subtract", "center-x", "center-z", "radius", "min-y", "max-y"],
    ellipse: ["subtract", "center-x", "center-z", "radius-x", "radius-z", "min-y", "max-y"],
    polygon: ["subtract", "shape", "min-y", "max-y"],
    blur: ["subtract", "size", "masks"],
};

/** The explicit manifest: every marker set container property. */
const EXPECTED_MARKER_SET_FIELDS: readonly string[] = ["label", "sorting", "toggleable", "default-hidden"];

describe("the explicit manifest matches what the schema actually declares", () => {
    it("names exactly the mask shapes MASK_SHAPES has, no more and no fewer", () => {
        expect(MASK_SHAPES.map((shape) => shape.key).sort()).toEqual(Object.keys(EXPECTED_MASK_FIELDS).sort());
    });

    it("names exactly the fields of every mask shape, in the order the editor renders them", () => {
        for (const shape of MASK_SHAPES) {
            const expected = EXPECTED_MASK_FIELDS[shape.key];
            expect(expected, `${shape.key} is not in EXPECTED_MASK_FIELDS`).toBeDefined();
            expect(
                shape.fields.map((field) => field.path),
                `${shape.key}'s fields changed without EXPECTED_MASK_FIELDS being updated to match`,
            ).toEqual(expected);
        }
    });

    it("names exactly the marker set container properties MARKER_SET_FIELDS has", () => {
        expect(MARKER_SET_FIELDS.map((field) => field.path)).toEqual(EXPECTED_MARKER_SET_FIELDS);
    });
});

/** Every `FieldMeta` this editor puts in front of somebody, from all three sources. */
function everyExplainedField(): { source: string; field: FieldMeta }[] {
    const fields: { source: string; field: FieldMeta }[] = [];

    for (const entry of buildSettingIndex(workspace())) fields.push({ source: `${entry.location.entryKey}.${entry.field.path}`, field: entry.field });
    for (const shape of MASK_SHAPES) for (const field of shape.fields) fields.push({ source: `mask:${shape.key}.${field.path}`, field });
    for (const field of MARKER_SET_FIELDS) fields.push({ source: `marker-set:${field.path}`, field });

    return fields;
}

describe("every setting gets the full explanation and the provenance line", () => {
    it("reaches the number the three sources are supposed to add up to: 154 + 27 mask + 4 marker-set", () => {
        const fields = everyExplainedField();
        // Guards the guard: a scanner that silently stopped walking one of the three
        // sources would still pass every per-field assertion below, on a smaller list.
        expect(fields).toHaveLength(154 + 27 + 4);
    });

    it("gives every one of them a non-empty explanation", () => {
        const empty = everyExplainedField()
            .filter(({ field }) => field.doc.trim().length === 0)
            .map(({ source }) => source);
        expect(empty).toEqual([]);
    });

    it("gives every one of them a real default, so the provenance line always has a value to name", () => {
        const missing = everyExplainedField()
            .filter(({ field }) => field.default === undefined)
            .map(({ source }) => source);
        expect(missing).toEqual([]);
    });

    it("marks every mask and marker-set field as authored, since none of them is a lifted upstream comment", () => {
        const unmarked = everyExplainedField()
            .filter(({ source, field }) => (source.startsWith("mask:") || source.startsWith("marker-set:")) && field.docSource !== "authored")
            .map(({ source }) => source);
        expect(unmarked).toEqual([]);
    });

    it("leaves the 154 top-level settings on their default provenance, since every one of them really is upstream's own comment", () => {
        const wronglyMarked = everyExplainedField()
            .filter(({ source, field }) => !source.startsWith("mask:") && !source.startsWith("marker-set:") && field.docSource === "authored")
            .map(({ source }) => source);
        expect(wronglyMarked).toEqual([]);
    });

    it("reports which fields are long enough to need the disclosure toggle at all, so the count is not zero by accident", () => {
        // Not every field needs the toggle -- a three-line-or-shorter doc is already
        // shown in full -- but at least one from each of the three sources should be
        // long enough to prove the toggle exists rather than being vacuously true.
        const bySource = { top: false, mask: false, markerSet: false };
        for (const { source, field } of everyExplainedField()) {
            if (!isDocLong(field.doc)) continue;
            if (source.startsWith("mask:")) bySource.mask = true;
            else if (source.startsWith("marker-set:")) bySource.markerSet = true;
            else bySource.top = true;
        }
        expect(bySource).toEqual({ top: true, mask: true, markerSet: true });
    });
});

describe("a spot check against the schema's own real explanations", () => {
    it("shows a mask field's real behaviour, not a placeholder", () => {
        const radius = MASK_SHAPES.find((shape) => shape.key === "circle")?.fields.find((field) => field.path === "radius");
        expect(radius?.doc).toContain("Double.MAX_VALUE");
        expect(radius?.doc).toContain("greater than 0");
    });

    it("shows the polygon outline's real closing rule, now that it is long enough to collapse", () => {
        const shape = MASK_SHAPES.find((mask) => mask.key === "polygon")?.fields.find((field) => field.path === "shape");
        expect(shape?.doc).toContain("closed automatically");
        expect(isDocLong(shape?.doc ?? "")).toBe(true);
    });

    it("shows a marker set field's real behaviour, sourced from MarkerSet's own Javadoc rather than invented", () => {
        const toggleable = MARKER_SET_FIELDS.find((field) => field.path === "toggleable");
        expect(toggleable?.doc).toContain("default-hidden");
        const defaultHidden = MARKER_SET_FIELDS.find((field) => field.path === "default-hidden");
        expect(defaultHidden?.doc).toContain("toggleable");
    });
});

/**
 * The render mask: the shapes that decide which part of a world gets rendered.
 *
 * `render-mask` in a map config is a list of shapes, each either additive or
 * subtractive, combined in order. Upstream calls this a `CombinedMask` and
 * deserialises it in two passes: once as the base class to read `type`, then
 * again as whichever concrete class that key names.
 *
 * Java source: `common/src/main/java/de/bluecolored/bluemap/common/config/mask/`
 * Wiki:        https://bluemap.bluecolored.de/wiki/customization/Masks.html
 */

import { z } from "zod";
import type { Control, FieldMeta, SelectOption } from "../meta.js";
import { decimalControl, formatKey, hoconBoolean, hoconInt, hoconNumber, integerControl, JAVA_DOUBLE_MAX, JAVA_INT_MAX, JAVA_INT_MIN, SWITCH, vector2d } from "./common.js";

/** The five shapes BlueMap's mask registry knows about. */
export const MASK_TYPE_OPTIONS: readonly SelectOption[] = [
    { value: "box", label: "Box", description: "An axis-aligned cuboid, given as min and max on each axis. The default." },
    { value: "circle", label: "Circle", description: "A circle on the X/Z plane with an optional Y range." },
    { value: "ellipse", label: "Ellipse", description: "Like a circle, with separate X and Z radii." },
    { value: "polygon", label: "Polygon", description: "An arbitrary outline on the X/Z plane with an optional Y range." },
    { value: "blur", label: "Blur", description: "Softens the edge of the masks nested inside it." },
];

export const boxMaskSchema = z.object({
    type: z.literal("bluemap:box"),
    subtract: hoconBoolean().default(false),
    "min-x": hoconInt().default(JAVA_INT_MIN),
    "min-y": hoconInt().default(JAVA_INT_MIN),
    "min-z": hoconInt().default(JAVA_INT_MIN),
    "max-x": hoconInt().default(JAVA_INT_MAX),
    "max-y": hoconInt().default(JAVA_INT_MAX),
    "max-z": hoconInt().default(JAVA_INT_MAX),
});

export const circleMaskSchema = z.object({
    type: z.literal("bluemap:circle"),
    subtract: hoconBoolean().default(false),
    "center-x": hoconNumber().default(0),
    "center-z": hoconNumber().default(0),
    radius: hoconNumber().default(JAVA_DOUBLE_MAX),
    "min-y": hoconInt().default(JAVA_INT_MIN),
    "max-y": hoconInt().default(JAVA_INT_MAX),
});

export const ellipseMaskSchema = z.object({
    type: z.literal("bluemap:ellipse"),
    subtract: hoconBoolean().default(false),
    "center-x": hoconNumber().default(0),
    "center-z": hoconNumber().default(0),
    "radius-x": hoconNumber().default(JAVA_DOUBLE_MAX),
    "radius-z": hoconNumber().default(JAVA_DOUBLE_MAX),
    "min-y": hoconInt().default(JAVA_INT_MIN),
    "max-y": hoconInt().default(JAVA_INT_MAX),
});

export const polygonMaskSchema = z.object({
    type: z.literal("bluemap:polygon"),
    subtract: hoconBoolean().default(false),
    "min-y": hoconInt().default(JAVA_INT_MIN),
    "max-y": hoconInt().default(JAVA_INT_MAX),
    shape: z.array(vector2d()).default([]),
});

export type BoxMask = z.infer<typeof boxMaskSchema>;
export type CircleMask = z.infer<typeof circleMaskSchema>;
export type EllipseMask = z.infer<typeof ellipseMaskSchema>;
export type PolygonMask = z.infer<typeof polygonMaskSchema>;

/** A blur mask wraps a nested list of masks, so the type is recursive. */
export interface BlurMask {
    readonly type: "bluemap:blur";
    readonly subtract: boolean;
    readonly size: number;
    readonly masks: MaskConfig[];
}

export type MaskConfig = BoxMask | CircleMask | EllipseMask | PolygonMask | BlurMask;

/** Fills in the type key the way `MaskConfig`'s base class does before dispatch. */
function normaliseMaskType(value: unknown): unknown {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    const raw = typeof record["type"] === "string" ? record["type"] : "box";
    return { ...record, type: formatKey(raw, "bluemap") };
}

/**
 * A blur's nested masks. Deferred because the type is recursive: a blur mask
 * holds masks, one of which may be another blur.
 */
const nestedMasks: z.ZodType<MaskConfig[]> = z.lazy(() => z.array(maskConfigSchema));

export const blurMaskSchema = z.object({
    type: z.literal("bluemap:blur"),
    subtract: hoconBoolean().default(false),
    size: hoconInt().default(5),
    masks: nestedMasks.default([]),
});

/**
 * One entry of a render mask.
 *
 * `type` defaults to `box` exactly as the Java base class does, and a bare key
 * such as `circle` is read as `bluemap:circle`, matching `Key.parse`. The
 * preprocess step is what makes the union unambiguous: by the time the union
 * runs, exactly one member's `type` literal can match.
 */
export const maskConfigSchema: z.ZodType<MaskConfig> = z.preprocess(
    normaliseMaskType,
    z.union([boxMaskSchema, circleMaskSchema, ellipseMaskSchema, polygonMaskSchema, blurMaskSchema]),
);

/** The whole `render-mask` list. */
export const combinedMaskSchema: z.ZodType<MaskConfig[]> = z.array(maskConfigSchema);

// ---- metadata for the mask editor ------------------------------------------

/** Field metadata for one shape, used to build the mask editor. */
export interface MaskShapeMeta {
    /** The value written to `type`, unqualified as upstream's examples write it. */
    readonly key: string;
    /** The key after `Key.parse` normalisation. */
    readonly formattedKey: string;
    readonly label: string;
    readonly doc: string;
    readonly fields: readonly FieldMeta[];
}

const MASK_GROUP = "mask";

function maskField(
    path: string,
    javaField: string,
    label: string,
    doc: string,
    control: Control,
    defaultValue: unknown,
    extra: Partial<FieldMeta> = {},
): FieldMeta {
    return {
        path,
        key: path,
        segments: [path],
        javaField,
        label,
        doc,
        group: MASK_GROUP,
        control,
        default: defaultValue,
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        invalidationNote:
            "Changing the render mask does not force a full re-render: BlueMap updates the map and deletes tiles that fall outside the new limits. Run 'fix-edges' afterwards if edges look wrong.",
        advanced: false,
        // Upstream's `map.conf` carries exactly one comment for the whole render-mask
        // block, not one per shape field, so none of these are a lifted quotation.
        docSource: "authored",
        ...extra,
    };
}

const SUBTRACT_FIELD = maskField(
    "subtract",
    "subtract",
    "Subtract instead of add",
    "When true this shape removes from the render area rather than adding to it, which is how the Nether's ceiling is cut away.",
    SWITCH,
    false,
);

const UNBOUNDED_MIN = "Defaults to Java's Integer.MIN_VALUE, which means no limit on this side.";
const UNBOUNDED_MAX = "Defaults to Java's Integer.MAX_VALUE, which means no limit on this side.";

export const MASK_SHAPES: readonly MaskShapeMeta[] = [
    {
        key: "box",
        formattedKey: "bluemap:box",
        label: "Box",
        doc: "An axis-aligned cuboid. Every axis is optional; an axis left out is unbounded. All six values must have min below max or BlueMap refuses the config.",
        fields: [
            SUBTRACT_FIELD,
            maskField("min-x", "minX", "Minimum X", UNBOUNDED_MIN, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MIN),
            maskField("max-x", "maxX", "Maximum X", UNBOUNDED_MAX, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MAX),
            maskField("min-y", "minY", "Minimum Y", UNBOUNDED_MIN, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MIN),
            maskField("max-y", "maxY", "Maximum Y", UNBOUNDED_MAX, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MAX),
            maskField("min-z", "minZ", "Minimum Z", UNBOUNDED_MIN, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MIN),
            maskField("max-z", "maxZ", "Maximum Z", UNBOUNDED_MAX, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MAX),
        ],
    },
    {
        key: "circle",
        formattedKey: "bluemap:circle",
        label: "Circle",
        doc: "A circle on the X/Z plane, optionally limited in Y. The radius has to be greater than 0 or BlueMap refuses the config.",
        fields: [
            SUBTRACT_FIELD,
            maskField("center-x", "centerX", "Centre X", "The centre of the circle on the X axis.", decimalControl({ step: 1, unit: "blocks" }), 0),
            maskField("center-z", "centerZ", "Centre Z", "The centre of the circle on the Z axis.", decimalControl({ step: 1, unit: "blocks" }), 0),
            maskField(
                "radius",
                "radius",
                "Radius",
                "Defaults to Java's Double.MAX_VALUE, which means the circle covers everything. Must be greater than 0.",
                decimalControl({ min: 0, step: 1, unit: "blocks" }),
                JAVA_DOUBLE_MAX,
            ),
            maskField("min-y", "minY", "Minimum Y", UNBOUNDED_MIN, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MIN),
            maskField("max-y", "maxY", "Maximum Y", UNBOUNDED_MAX, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MAX),
        ],
    },
    {
        key: "ellipse",
        formattedKey: "bluemap:ellipse",
        label: "Ellipse",
        doc: "A circle with separate X and Z radii. Both radii have to be greater than 0 or BlueMap refuses the config.",
        fields: [
            SUBTRACT_FIELD,
            maskField("center-x", "centerX", "Centre X", "The centre of the ellipse on the X axis.", decimalControl({ step: 1, unit: "blocks" }), 0),
            maskField("center-z", "centerZ", "Centre Z", "The centre of the ellipse on the Z axis.", decimalControl({ step: 1, unit: "blocks" }), 0),
            maskField("radius-x", "radiusX", "Radius X", "Defaults to Java's Double.MAX_VALUE. Must be greater than 0.", decimalControl({ min: 0, step: 1, unit: "blocks" }), JAVA_DOUBLE_MAX),
            maskField("radius-z", "radiusZ", "Radius Z", "Defaults to Java's Double.MAX_VALUE. Must be greater than 0.", decimalControl({ min: 0, step: 1, unit: "blocks" }), JAVA_DOUBLE_MAX),
            maskField("min-y", "minY", "Minimum Y", UNBOUNDED_MIN, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MIN),
            maskField("max-y", "maxY", "Maximum Y", UNBOUNDED_MAX, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MAX),
        ],
    },
    {
        key: "polygon",
        formattedKey: "bluemap:polygon",
        label: "Polygon",
        doc: "An arbitrary outline on the X/Z plane, optionally limited in Y. BlueMap needs at least 3 points.",
        fields: [
            SUBTRACT_FIELD,
            maskField(
                "shape",
                "shape",
                "Outline",
                [
                    "The points of the outline, each { x, z }. At least 3 are needed.",
                    "Upstream's field has no initialiser, so a polygon mask without a shape is rejected when the config loads.",
                    "Points are read in the order given and the outline is closed automatically between the last point and the first, so there is no need to repeat the first point at the end.",
                    "This only limits X and Z; pair it with min-y/max-y on this same shape to also limit height.",
                ].join("\n"),
                { kind: "list", itemLabel: "Point", unique: false, item: { kind: "vector", integer: false, axes: [{ key: "x", label: "X" }, { key: "z", label: "Z" }] } },
                [],
                { advisory: { min: 3, note: "BlueMap needs at least 3 points for a valid shape." } },
            ),
            maskField("min-y", "minY", "Minimum Y", UNBOUNDED_MIN, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MIN),
            maskField("max-y", "maxY", "Maximum Y", UNBOUNDED_MAX, integerControl({ step: 1, unit: "blocks" }), JAVA_INT_MAX),
        ],
    },
    {
        key: "blur",
        formattedKey: "bluemap:blur",
        label: "Blur",
        doc: "Softens the edge of the masks nested inside it. A size of 0 or less turns the blur off and leaves the nested masks as they are.",
        fields: [
            SUBTRACT_FIELD,
            maskField("size", "size", "Blur size", "How wide the softened edge is, in blocks. 0 or less disables the blur.", integerControl({ min: 0, step: 1, unit: "blocks" }), 5),
            maskField("masks", "masks", "Nested masks", "The masks this blur applies to, in the same form as the outer render-mask list.", { kind: "mask-list" }, []),
        ],
    },
];

/**
 * Every setting gets the control its own type deserves, kept true by a test.
 *
 * The user requirement behind this file is two sentences long: every config
 * setting is reachable from the GUI, and it gets a rich control rather than a
 * text box. The first half is easy to see when it breaks, because the setting is
 * simply missing. The second half is the one that decays quietly, and it decays
 * in a very specific way: somebody adds a field, reaches for the shortest
 * `control:` that compiles, and a value with four legal answers ships as a free
 * text field that accepts anything and complains later. Nothing about writing
 * that line feels wrong at the time. It only reads wrong months afterwards, next
 * to the six neighbours that were done properly.
 *
 * So this walks every field of every descriptor, and every field of every mask
 * shape, and asks the schema itself what the value is before looking at what the
 * control claims to be. The schema is the right authority because it is the
 * thing that decides what BlueMap will accept: a boolean is a boolean whatever
 * anybody names it, a hex-colour pattern is a colour, and a value the schema will
 * take but the control cannot express is a value the GUI is about to lose.
 *
 * Three families of rule live here:
 *
 *  1. **The control matches the zod type.** A boolean is a switch, a number is a
 *     numeric control, an object of coordinates is a vector, and so on.
 *  2. **The control can express everything the schema accepts.** This is the one
 *     that matters most and the one that reads as pedantry until it bites: a
 *     closed select over an open schema renders *empty* when the file holds
 *     something not in its list, which looks exactly like an unset setting and is
 *     overwritten by the next click.
 *  3. **The control matches upstream's own Java type**, read out of the vendored
 *     source rather than out of anything this repository wrote. A `Path` gets a
 *     browse affordance, a `Key` gets a select, a `String` named `*Color` gets
 *     the colour picker.
 *
 * Where a rule genuinely does not apply, the exemption is a sentence somebody
 * wrote next to the field, not an absence nobody noticed.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import type { Control, FieldMeta } from "../src/meta.js";
import {
    ALL_DESCRIPTORS,
    HEX_COLOR_PATTERN,
    MASK_SHAPES,
    NAMESPACED_KEY_PATTERN,
    maskConfigSchema,
} from "../src/schema/index.js";
import { outerClassBody, nestedClassBody, parseJavaFields } from "./javaDefaults.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "..", "..", "..", "..");
const configJavaDir = join(repoRoot, "vendor", "BlueMap", "common", "src", "main", "java", "de", "bluecolored", "bluemap", "common", "config");
const vendorAvailable = existsSync(configJavaDir);

// ---------------------------------------------------------------------------
// Reading a zod schema back
// ---------------------------------------------------------------------------

/**
 * The slice of zod's internals this needs.
 *
 * Reaching into `_zod` is not free, and the alternative was worse: the only
 * other way to learn a leaf's type is to probe it with sample values, which
 * cannot tell a coerced boolean from a string that happens to say `yes`, and
 * would quietly classify half of these fields wrongly. The surface used here is
 * four property names, and a zod upgrade that moves them fails this file loudly
 * rather than making it pass vacuously.
 */
interface ZodNode {
    _zod: {
        def: {
            type: string;
            innerType?: ZodNode;
            out?: ZodNode;
            getter?: () => ZodNode;
            shape?: Record<string, ZodNode>;
            element?: ZodNode;
            options?: ZodNode[];
            values?: readonly unknown[];
            checks?: { _zod: { def: { check?: string; format?: string; pattern?: RegExp } } }[];
        };
    };
}

function asNode(schema: unknown): ZodNode {
    return schema as ZodNode;
}

/** Peels off the wrappers that do not change what a value *is*. */
function unwrap(node: ZodNode): ZodNode {
    let current = node;
    for (let guard = 0; guard < 20; guard++) {
        const def = current._zod.def;
        switch (def.type) {
            case "default":
            case "prefault":
            case "nullable":
            case "optional":
            case "nonoptional":
            case "readonly":
            case "catch":
                if (def.innerType === undefined) return current;
                current = def.innerType;
                continue;
            // Every scalar in these schemas is `z.preprocess(coerce, real)`, which
            // is a pipe. The half worth asking about is what comes out of it.
            case "pipe":
                if (def.out === undefined) return current;
                current = def.out;
                continue;
            case "lazy":
                if (def.getter === undefined) return current;
                current = def.getter();
                continue;
            default:
                return current;
        }
    }
    return current;
}

/** What a schema leaf actually holds, reduced to the handful of shapes that matter. */
type Domain =
    | { readonly kind: "boolean" }
    | { readonly kind: "number" }
    | { readonly kind: "string"; readonly patterns: readonly RegExp[] }
    | { readonly kind: "object"; readonly keys: readonly string[] }
    | { readonly kind: "array"; readonly element: ZodNode | null }
    | { readonly kind: "record" }
    /** A genuinely finite set: a literal, an enum, or a union of either. */
    | { readonly kind: "closed"; readonly values: readonly unknown[] }
    | { readonly kind: "unknown"; readonly type: string };

function literalValues(node: ZodNode): readonly unknown[] | null {
    const def = node._zod.def;
    if ((def.type === "literal" || def.type === "enum") && def.values !== undefined) return def.values;
    return null;
}

function domainOf(schema: unknown): Domain {
    const node = unwrap(asNode(schema));
    const def = node._zod.def;

    switch (def.type) {
        case "boolean":
            return { kind: "boolean" };

        case "number":
        case "int":
        case "bigint":
            return { kind: "number" };

        case "string": {
            const patterns = (def.checks ?? [])
                .map((check) => check._zod.def)
                .filter((check) => check.check === "string_format" && check.format === "regex")
                .map((check) => check.pattern)
                .filter((pattern): pattern is RegExp => pattern instanceof RegExp);
            return { kind: "string", patterns };
        }

        case "object":
            return { kind: "object", keys: Object.keys(def.shape ?? {}) };

        case "array":
            return { kind: "array", element: def.element ?? null };

        case "record":
        case "map":
            return { kind: "record" };

        case "literal":
        case "enum":
            return { kind: "closed", values: literalValues(node) ?? [] };

        case "union": {
            const options = (def.options ?? []).map(unwrap);
            const values = options.map(literalValues);
            // A union of literals is a closed set; a union of object shapes (the
            // five mask types) is not something a single control ever binds to.
            if (values.every((value) => value !== null)) return { kind: "closed", values: values.flatMap((value) => value ?? []) };
            return { kind: "unknown", type: "union" };
        }

        default:
            return { kind: "unknown", type: def.type };
    }
}

/** Walks a descriptor's schema down a field's path. */
function nodeAtPath(schema: unknown, segments: readonly string[]): ZodNode | null {
    let current = unwrap(asNode(schema));
    for (const segment of segments) {
        const shape = current._zod.def.shape;
        const next = shape?.[segment];
        if (next === undefined) return null;
        current = unwrap(next);
    }
    return current;
}

/** The member of the mask union whose `type` literal is this shape's key. */
function maskShapeSchema(formattedKey: string): ZodNode | null {
    const union = unwrap(asNode(maskConfigSchema));
    for (const option of union._zod.def.options ?? []) {
        const member = unwrap(option);
        const typeField = member._zod.def.shape?.["type"];
        if (typeField === undefined) continue;
        if ((literalValues(unwrap(typeField)) ?? []).includes(formattedKey)) return member;
    }
    return null;
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/** Which controls can honestly edit which domain. */
function allowedKinds(domain: Domain): readonly Control["kind"][] {
    switch (domain.kind) {
        case "boolean":
            return ["switch"];
        case "number":
            // A select is allowed over a number only because upstream documents a
            // short list for `resolution-default`; the open-schema rule below still
            // forces it to accept a value outside that list.
            return ["number", "slider", "select"];
        case "string":
            if (domain.patterns.some((pattern) => pattern.source === HEX_COLOR_PATTERN.source)) return ["color"];
            // A BlueMap registry key always names an entry in a registry, and a
            // registry is a documented set. A text box over one is a text box over a
            // menu the user cannot see.
            if (domain.patterns.some((pattern) => pattern.source === NAMESPACED_KEY_PATTERN.source)) return ["select"];
            return ["text", "path", "select"];
        case "object":
            return ["vector"];
        case "array":
            return ["list", "mask-list"];
        case "record":
            return ["key-value", "marker-sets"];
        case "closed":
            return ["select", "switch"];
        case "unknown":
            return [];
    }
}

/**
 * Numeric settings whose value genuinely has no unit, each with the reason.
 *
 * Everything else that counts something states what it counts, because a bare
 * `60` in a settings screen is a number the reader has to go and look up. Keep
 * this list short and keep every entry true: an entry added to make the test
 * pass is worse than no test, because it looks like somebody thought about it.
 */
const NO_UNIT: Record<string, string> = {
    "core.render-thread-priority": "A JVM thread priority is a bare 1-to-10 rank, not a quantity of anything.",
    "webserver.port": "A TCP port number is an identifier, not a measurement.",
    "map.sorting": "An ordering rank. Lower sorts first; the number counts nothing.",
    "map.sky-light": "A 0-to-1 strength factor, which upstream describes as none to fully lit rather than in any unit.",
    "map.ambient-light": "A 0-to-1 strength factor, which upstream describes as none to fully lit rather than in any unit.",
    "map.edge-light-strength": "Minecraft's own 0-to-15 light level, which is a level rather than a unit.",
    "map.lod-factor": "A ratio between one lowres level and the next, so it is dimensionless by definition.",
    "plugin.hide-below-sky-light": "Minecraft's own 0-to-15 light level, which is a level rather than a unit.",
    "plugin.hide-below-block-light": "Minecraft's own 0-to-15 light level, which is a level rather than a unit.",
};

interface Subject {
    /** `core.data`, or `mask:box.min-x` for a mask shape's field. */
    readonly id: string;
    readonly field: FieldMeta;
    readonly node: ZodNode | null;
}

/** Every field this file is responsible for: the seven files, plus the five mask shapes. */
function everyField(): Subject[] {
    const subjects: Subject[] = [];

    for (const descriptor of ALL_DESCRIPTORS) {
        for (const field of descriptor.fields) {
            subjects.push({
                id: `${descriptor.id}.${field.path}`,
                field,
                node: nodeAtPath(descriptor.schema as unknown as z.ZodType, field.segments),
            });
        }
    }

    for (const shape of MASK_SHAPES) {
        const member = maskShapeSchema(shape.formattedKey);
        for (const field of shape.fields) {
            subjects.push({
                id: `mask:${shape.key}.${field.path}`,
                field,
                node: member === null ? null : (member._zod.def.shape?.[field.path] ?? null),
            });
        }
    }

    return subjects;
}

const SUBJECTS = everyField();

describe("every setting gets the control its type deserves", () => {
    it("finds the fields it is supposed to be watching", () => {
        // A walk that silently found nothing would pass every assertion below.
        expect(SUBJECTS.length).toBeGreaterThan(85);
        expect(SUBJECTS.filter((subject) => subject.node === null).map((subject) => subject.id)).toEqual([]);
    });

    it("matches every control to the zod type behind it", () => {
        const wrong: string[] = [];

        for (const subject of SUBJECTS) {
            const domain = domainOf(subject.node);
            const allowed = allowedKinds(domain);

            if (domain.kind === "unknown") {
                wrong.push(`${subject.id}: this test cannot classify the schema (zod type ${domain.type}), so it is not being checked`);
                continue;
            }
            if (!allowed.includes(subject.field.control.kind)) {
                wrong.push(`${subject.id}: a ${domain.kind} may be edited by ${allowed.join(", ")}, not by a ${subject.field.control.kind} control`);
            }
        }

        expect(wrong, "The control must fit the value. A closed set is a select, a hex colour is the colour picker, a boolean is a switch.").toEqual([]);
    });

    it("never closes a select over a schema that accepts more than its options", () => {
        const closed: string[] = [];

        for (const subject of SUBJECTS) {
            const control = subject.field.control;
            if (control.kind !== "select" || control.allowCustom) continue;

            const domain = domainOf(subject.node);
            if (domain.kind === "closed") continue;
            closed.push(`${subject.id}: the schema accepts any ${domain.kind}, so a closed select would render empty for a value it has no option for`);
        }

        expect(
            closed,
            "Vuetify matches a select item by value: bound to something no item holds, the control shows nothing, the setting reads as unset, and the next click overwrites it. Set allowCustom.",
        ).toEqual([]);
    });

    it("teaches every registry-key select how BlueMap parses that key", () => {
        const problems: string[] = [];

        for (const subject of SUBJECTS) {
            const control = subject.field.control;
            const domain = domainOf(subject.node);
            const isKey = domain.kind === "string" && domain.patterns.some((pattern) => pattern.source === NAMESPACED_KEY_PATTERN.source);

            if (control.kind !== "select") continue;
            if (isKey && control.keyNamespace === undefined) {
                problems.push(`${subject.id}: a registry key needs keyNamespace, or bluemap:gzip will not match an option spelled gzip`);
            }
            if (!isKey && control.keyNamespace !== undefined) {
                problems.push(`${subject.id}: keyNamespace is set but this value is not a BlueMap key, so it would compare two things that are not keys`);
            }
        }

        expect(problems).toEqual([]);
    });

    it("gives every colour control the alpha channel BlueMap actually reads", () => {
        for (const subject of SUBJECTS) {
            if (subject.field.control.kind !== "color") continue;
            // The schema takes 4 and 8 digit forms because `Color.parse` pads a
            // 6-digit value with `ff` and reads the eighth byte as alpha. A control
            // without alpha could not express half of what the file may hold.
            expect(subject.field.control.alpha, `${subject.id} accepts #rrggbbaa, so its control must offer alpha`).toBe(true);
        }
    });

    it("states the unit of every number that has one", () => {
        const bare: string[] = [];

        for (const subject of SUBJECTS) {
            const control = subject.field.control;
            if (control.kind !== "number" && control.kind !== "slider") continue;
            if (control.unit !== undefined && control.unit !== "") continue;
            if (subject.id in NO_UNIT) continue;
            bare.push(subject.id);
        }

        expect(bare, "A bare number in a settings screen is a number the reader has to go and look up. State the unit, or name the field in NO_UNIT with the reason it has none.").toEqual([]);
    });

    it("keeps every unit exemption pointing at a field that still exists and is still a number", () => {
        // A stale exemption is how a guard quietly starts covering less than it
        // says: the field it excused is renamed, the entry stays, and the next
        // field to take that name inherits an excuse nobody wrote for it.
        for (const [id, reason] of Object.entries(NO_UNIT)) {
            expect(reason.length, `${id} needs a real reason, not a placeholder`).toBeGreaterThan(40);

            const subject = SUBJECTS.find((candidate) => candidate.id === id);
            expect(subject, `${id} is exempted from stating a unit but no longer exists`).toBeDefined();
            if (subject === undefined) continue;

            const control = subject.field.control;
            expect(control.kind === "number" || control.kind === "slider", `${id} is no longer a numeric control`).toBe(true);
        }
    });

    it("checks a list's item control against what the list actually holds", () => {
        const wrong: string[] = [];

        for (const subject of SUBJECTS) {
            const control = subject.field.control;
            if (control.kind !== "list") continue;

            const domain = domainOf(subject.node);
            if (domain.kind !== "array" || domain.element === null) {
                wrong.push(`${subject.id}: a list control over a schema that is not an array`);
                continue;
            }

            const allowed = allowedKinds(domainOf(domain.element));
            if (!allowed.includes(control.item.kind)) {
                wrong.push(`${subject.id}: items are ${domainOf(domain.element).kind}, which ${control.item.kind} cannot edit`);
            }
        }

        expect(wrong).toEqual([]);
    });

    it("gives every vector an axis for each key the schema has", () => {
        for (const subject of SUBJECTS) {
            const control = subject.field.control;
            if (control.kind !== "vector") continue;

            const domain = domainOf(subject.node);
            expect(domain.kind, `${subject.id} is a vector control`).toBe("object");
            if (domain.kind !== "object") continue;
            // An axis missing from the editor is a component of the value that
            // cannot be changed and, worse, is invisible.
            expect(control.axes.map((axis) => axis.key).sort(), `${subject.id} axes`).toEqual([...domain.keys].sort());
        }
    });

    it("gives every select real options, each saying what it means", () => {
        for (const subject of SUBJECTS) {
            const controls: Control[] = [subject.field.control];
            if (subject.field.control.kind === "list") controls.push(subject.field.control.item);

            for (const control of controls) {
                if (control.kind !== "select") continue;

                expect(control.options.length, `${subject.id} has a select with no options`).toBeGreaterThan(0);

                const values = control.options.map((option) => String(option.value));
                expect(new Set(values).size, `${subject.id} has a duplicate option value`).toBe(values.length);

                for (const option of control.options) {
                    expect(option.label.length, `${subject.id} option ${String(option.value)} has no label`).toBeGreaterThan(0);
                }
            }
        }
    });

    it("gives every path control a picker that knows what it is picking", () => {
        for (const subject of SUBJECTS) {
            const control = subject.field.control;
            if (control.kind !== "path") continue;
            expect(["directory", "file"], `${subject.id}`).toContain(control.select);
            // A directory picker offering file extensions would be filtering nothing.
            if (control.select === "directory") expect(control.extensions, `${subject.id} is a folder, so extensions mean nothing`).toBeUndefined();
        }
    });

    it("does not leave a rich value stranded in a text box", () => {
        // The requirement in one assertion: name every field that is still free
        // text, so adding a new one is a deliberate edit to this list rather than a
        // quiet default. Each of these is genuinely open: an id, a display name, a
        // URL, a connection string, a class name or a format template.
        const text = SUBJECTS.filter((subject) => subject.field.control.kind === "text").map((subject) => subject.id);
        expect(text.sort()).toEqual(
            [
                "map.name",
                "storage-sql.connection-url",
                "storage-sql.driver-class",
                "webapp.live-data-root",
                "webapp.map-data-root",
                "webapp.start-location",
                "webserver.log.format",
            ].sort(),
        );
    });
});

// ---------------------------------------------------------------------------
// The second opinion: upstream's own Java types
// ---------------------------------------------------------------------------

/**
 * What each Java type may be edited by.
 *
 * This is the check that cannot be satisfied by editing this repository alone.
 * Every rule above reads a schema this repository wrote; these read the types
 * upstream declared, so a field modelled as a string that is really a `Path`
 * fails here even when everything on our side agrees with itself.
 */
const JAVA_TYPE_CONTROLS: Record<string, readonly Control["kind"][]> = {
    boolean: ["switch"],
    int: ["number", "slider"],
    long: ["number", "slider"],
    float: ["number", "slider"],
    double: ["number", "slider"],
    Integer: ["number", "slider"],
    Long: ["number", "slider"],
    Double: ["number", "slider"],
    String: ["text", "path", "select", "color"],
    Path: ["path"],
    Key: ["select"],
    WorldLoaderType: ["select"],
    Vector2i: ["vector"],
    Vector2d: ["vector"],
    CombinedMask: ["mask-list"],
    ConfigurationNode: ["marker-sets"],
    Map: ["key-value"],
    List: ["list"],
    Set: ["list"],
    LinkedHashSet: ["list"],
    "Vector2d[]": ["list"],
};

/** `Map<String, String>` and `LinkedHashSet<String>` are `Map` and `LinkedHashSet` here. */
function javaTypeHead(javaType: string): string {
    return javaType.replace(/<.*$/, "").trim();
}

/**
 * The one place a select is right over a Java number.
 *
 * `resolutionDefault` is a `float`, and upstream's comment lists three values
 * for it. Offering those three with their meanings is better than a spin box
 * over a number nobody knows the range of, and it costs nothing precisely
 * because free entry stays open: the schema-derived rule above refuses a closed
 * select over an open schema, so a hand-written 1.5 still shows and is still
 * kept. Without that guarantee this clause would be a hole.
 */
function isOpenSelect(control: Control): boolean {
    return control.kind === "select" && control.allowCustom;
}

const JAVA_FILES: { id: string; file: string; className: string; nested?: { field: string; className: string } }[] = [
    { id: "core", file: "CoreConfig.java", className: "CoreConfig", nested: { field: "log", className: "LogConfig" } },
    { id: "webapp", file: "WebappConfig.java", className: "WebappConfig" },
    { id: "webserver", file: "WebserverConfig.java", className: "WebserverConfig", nested: { field: "log", className: "LogConfig" } },
    { id: "plugin", file: "PluginConfig.java", className: "PluginConfig" },
    { id: "map", file: "MapConfig.java", className: "MapConfig" },
    { id: "storage-file", file: "storage/FileConfig.java", className: "FileConfig" },
    { id: "storage-sql", file: "storage/SQLConfig.java", className: "SQLConfig" },
];

const MASK_FILES: { key: string; file: string; className: string }[] = [
    { key: "box", file: "mask/BoxMaskConfig.java", className: "BoxMaskConfig" },
    { key: "circle", file: "mask/CircleMaskConfig.java", className: "CircleMaskConfig" },
    { key: "ellipse", file: "mask/EllipseMaskConfig.java", className: "EllipseMaskConfig" },
    { key: "polygon", file: "mask/PolygonMaskConfig.java", className: "PolygonMaskConfig" },
    { key: "blur", file: "mask/BlurMaskConfig.java", className: "BlurMaskConfig" },
];

/**
 * Java types that are nested config objects rather than values, with the reason.
 *
 * A nested object has no control of its own; its own fields are modelled under a
 * dotted prefix and checked individually.
 */
const NOT_A_VALUE = new Set(["LogConfig"]);

describe.skipIf(!vendorAvailable)("controls match the Java types upstream declared", () => {
    it("checks every field against its own Java declaration, and reports anything it could not", () => {
        const wrong: string[] = [];
        const unclassified: string[] = [];

        const check = (id: string, javaType: string, control: Control | undefined): void => {
            const head = javaTypeHead(javaType);
            if (NOT_A_VALUE.has(head)) return;

            const allowed = JAVA_TYPE_CONTROLS[head] ?? JAVA_TYPE_CONTROLS[javaType.trim()];
            if (allowed === undefined) {
                unclassified.push(`${id} (${javaType})`);
                return;
            }
            if (control === undefined) {
                wrong.push(`${id} is declared in Java but has no field metadata`);
                return;
            }
            if (allowed.includes(control.kind)) return;
            if (allowed.includes("number") && isOpenSelect(control)) return;
            wrong.push(`${id}: Java declares ${javaType}, which ${allowed.join(", ")} can edit, but the control is ${control.kind}`);
        };

        for (const source of JAVA_FILES) {
            const descriptor = ALL_DESCRIPTORS.find((candidate) => candidate.id === source.id);
            expect(descriptor, `${source.id} has no descriptor`).toBeDefined();
            const path = join(configJavaDir, source.file);

            const record = (prefix: string, body: string): void => {
                for (const javaField of parseJavaFields(body)) {
                    const key = prefix + javaField.key;
                    check(`${source.id}.${key}`, javaField.javaType, descriptor?.fields.find((field) => field.path === key)?.control);
                }
            };

            record("", outerClassBody(path, source.className));
            if (source.nested !== undefined) record(`${source.nested.field}.`, nestedClassBody(path, source.nested.className));
            if (source.id.startsWith("storage-")) record("", outerClassBody(join(configJavaDir, "storage", "StorageConfig.java"), "StorageConfig"));
        }

        for (const source of MASK_FILES) {
            const shape = MASK_SHAPES.find((candidate) => candidate.key === source.key);
            expect(shape, `${source.key} is not modelled`).toBeDefined();

            for (const javaField of parseJavaFields(outerClassBody(join(configJavaDir, source.file), source.className))) {
                check(`mask:${source.key}.${javaField.key}`, javaField.javaType, shape?.fields.find((field) => field.path === javaField.key)?.control);
            }
        }

        expect(wrong, "Upstream's own type says what a setting is. A Path gets a browse affordance, a Key gets a select, a colour gets the picker.").toEqual([]);
        // A type this table does not know is a field nobody checked, which must be
        // visible rather than counted as a pass.
        expect(unclassified, "Add these Java types to JAVA_TYPE_CONTROLS so their fields are actually being checked.").toEqual([]);
    });

    it("recognises the Java types it claims to, so a renamed class fails loudly", () => {
        expect(javaTypeHead("Map<String, String>")).toBe("Map");
        expect(javaTypeHead("LinkedHashSet<String>")).toBe("LinkedHashSet");
        expect(javaTypeHead("Path")).toBe("Path");
    });
});

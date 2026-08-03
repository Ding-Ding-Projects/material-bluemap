import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_DESCRIPTORS, checkDescriptorConsistency, descriptorFor, MASK_SHAPES, readPath } from "../src/schema/index.js";
import type { ConfigFileId } from "../src/meta.js";
import { nestedClassBody, outerClassBody, parseJavaFields, toDashedKey } from "./javaDefaults.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "..", "..", "..", "..");
const configJavaDir = join(repoRoot, "vendor", "BlueMap", "common", "src", "main", "java", "de", "bluecolored", "bluemap", "common", "config");
const vendorAvailable = existsSync(configJavaDir);

describe("descriptors", () => {
    it("covers every configuration file BlueMap reads", () => {
        expect(ALL_DESCRIPTORS.map((descriptor) => descriptor.id)).toEqual(["core", "webapp", "webserver", "plugin", "map", "storage-file", "storage-sql"]);
    });

    it.each(ALL_DESCRIPTORS)("$id agrees with its own schema", (descriptor) => {
        expect(checkDescriptorConsistency(descriptor)).toEqual([]);
    });

    it.each(ALL_DESCRIPTORS)("$id documents every field with upstream's own text", (descriptor) => {
        for (const field of descriptor.fields) {
            expect(field.doc.length, `${descriptor.id}.${field.path} has no documentation`).toBeGreaterThan(20);
            expect(field.label.length, `${descriptor.id}.${field.path} has no label`).toBeGreaterThan(0);
        }
    });

    it.each(ALL_DESCRIPTORS)("$id has no duplicate field paths", (descriptor) => {
        const paths = descriptor.fields.map((field) => field.path);
        expect(new Set(paths).size).toBe(paths.length);
    });

    it("names every setting that costs a re-render", () => {
        const map = descriptorFor("map");
        const invalidating = map.fields.filter((field) => field.invalidatesTiles).map((field) => field.path);
        expect(invalidating).toEqual([
            "loader",
            "world",
            "dimension",
            "dimension-type",
            "remove-caves-below-y",
            "cave-detection-ocean-floor",
            "cave-detection-uses-block-light",
            "render-edges",
            "edge-light-strength",
            "enable-perspective-view",
            "enable-free-flight-view",
            "enable-hires",
            "storage",
            "ignore-missing-light-data",
            "hires-tile-size",
            "lowres-tile-size",
            "lod-count",
            "lod-factor",
        ]);
    });

    it("marks the one setting the app must not present as an ordinary switch", () => {
        const gated = ALL_DESCRIPTORS.flatMap((descriptor) => descriptor.fields.filter((field) => field.consentGated === true).map((field) => `${descriptor.id}.${field.path}`));
        expect(gated).toEqual(["core.accept-download"]);
    });

    it("marks the credentials so they are never logged or exported", () => {
        const secret = ALL_DESCRIPTORS.flatMap((descriptor) => descriptor.fields.filter((field) => field.secret === true).map((field) => `${descriptor.id}.${field.path}`));
        expect(secret).toEqual(["storage-sql.connection-properties"]);
    });

    it("records which fields upstream leaves out of its templates", () => {
        const hidden = ALL_DESCRIPTORS.flatMap((descriptor) => descriptor.fields.filter((field) => field.hidden).map((field) => `${descriptor.id}.${field.path}`));
        expect(hidden).toEqual([
            "webserver.ip",
            "map.loader",
            "map.min-inhabited-time-radius",
            "map.check-for-removed-regions",
            "map.hires-tile-size",
            "map.lowres-tile-size",
            "map.lod-count",
            "map.lod-factor",
            "storage-file.atomic",
            "storage-sql.dialect",
        ]);
    });
});

describe("mask shapes", () => {
    it("covers every shape in BlueMap's mask registry", () => {
        expect(MASK_SHAPES.map((shape) => shape.key)).toEqual(["box", "circle", "ellipse", "polygon", "blur"]);
    });

    it("gives every shape a subtract switch, because that is what makes a mask subtractive", () => {
        for (const shape of MASK_SHAPES) {
            expect(shape.fields.map((field) => field.path)).toContain("subtract");
        }
    });
});

// ---------------------------------------------------------------------------
// Cross-checks against the vendored Java source. Skipped when it is not present.
// ---------------------------------------------------------------------------

/** Which Java class each descriptor's fields come from. */
const JAVA_SOURCES: { id: ConfigFileId; file: string; className: string; nested?: { field: string; className: string } }[] = [
    { id: "core", file: "CoreConfig.java", className: "CoreConfig", nested: { field: "log", className: "LogConfig" } },
    { id: "webapp", file: "WebappConfig.java", className: "WebappConfig" },
    { id: "webserver", file: "WebserverConfig.java", className: "WebserverConfig", nested: { field: "log", className: "LogConfig" } },
    { id: "plugin", file: "PluginConfig.java", className: "PluginConfig" },
    { id: "map", file: "MapConfig.java", className: "MapConfig" },
    { id: "storage-file", file: "storage/FileConfig.java", className: "FileConfig" },
    { id: "storage-sql", file: "storage/SQLConfig.java", className: "SQLConfig" },
];

/**
 * Fields the Java reader deliberately does not resolve to a value, with the
 * reason. Both are nested config objects whose own fields are read separately
 * and recorded under a `log.` prefix.
 */
const UNRESOLVABLE: Record<string, string> = {
    "core.log": "new LogConfig(), a nested config object rather than a value",
    "webserver.log": "new LogConfig(), a nested config object rather than a value",
};

interface JavaDefaults {
    readonly values: Map<string, unknown>;
    readonly skipped: string[];
}

function readJavaDefaults(source: (typeof JAVA_SOURCES)[number]): JavaDefaults {
    const file = join(configJavaDir, source.file);
    const values = new Map<string, unknown>();
    const skipped: string[] = [];

    const record = (prefix: string, body: string): void => {
        for (const field of parseJavaFields(body)) {
            const key = prefix + field.key;
            if (!field.resolved) {
                skipped.push(`${source.id}.${key} (${field.expression})`);
                continue;
            }
            values.set(key, field.value);
        }
    };

    record("", outerClassBody(file, source.className));
    if (source.nested !== undefined) record(`${source.nested.field}.`, nestedClassBody(file, source.nested.className));

    // Both storage configs inherit `storageType` from the abstract base class.
    if (source.id === "storage-file" || source.id === "storage-sql") {
        record("", outerClassBody(join(configJavaDir, "storage", "StorageConfig.java"), "StorageConfig"));
    }

    return { values, skipped };
}

describe.skipIf(!vendorAvailable)("defaults match the vendored Java classes", () => {
    it.each(JAVA_SOURCES)("$id", (source) => {
        const descriptor = descriptorFor(source.id);
        const { values, skipped } = readJavaDefaults(source);

        // A resolver that quietly resolved nothing would make this test vacuous.
        expect(values.size, `no Java fields were resolved for ${source.id}`).toBeGreaterThan(3);

        const expectedSkips = Object.keys(UNRESOLVABLE)
            .filter((key) => key.startsWith(`${source.id}.`))
            .map((key) => key.slice(source.id.length + 1));
        expect(skipped.map((entry) => entry.replace(/^[\w-]+\./, "").replace(/ \(.*$/, "")).sort()).toEqual(expectedSkips.sort());

        for (const [key, javaDefault] of values) {
            const field = descriptor.fields.find((candidate) => candidate.path === key);
            expect(field, `${source.id}.${key} exists in Java but is not modelled`).toBeDefined();
            expect(field?.default, `${source.id}.${key}`).toEqual(javaDefault);
        }
    });

    it("models every Java field, with nothing invented", () => {
        for (const source of JAVA_SOURCES) {
            const descriptor = descriptorFor(source.id);
            const { values } = readJavaDefaults(source);

            // Every leaf field on the Java class, and nothing that is not on it.
            expect(descriptor.fields.map((field) => field.path).sort(), `${source.id} field list`).toEqual([...values.keys()].sort());
        }
    });

    it("matches the mask shape defaults too", () => {
        const maskDir = join(configJavaDir, "mask");
        const shapes: { key: string; file: string; className: string }[] = [
            { key: "box", file: "BoxMaskConfig.java", className: "BoxMaskConfig" },
            { key: "circle", file: "CircleMaskConfig.java", className: "CircleMaskConfig" },
            { key: "ellipse", file: "EllipseMaskConfig.java", className: "EllipseMaskConfig" },
            { key: "polygon", file: "PolygonMaskConfig.java", className: "PolygonMaskConfig" },
            { key: "blur", file: "BlurMaskConfig.java", className: "BlurMaskConfig" },
        ];

        for (const shape of shapes) {
            const meta = MASK_SHAPES.find((candidate) => candidate.key === shape.key);
            expect(meta, `${shape.key} is not modelled`).toBeDefined();

            const fields = parseJavaFields(outerClassBody(join(maskDir, shape.file), shape.className));
            for (const field of fields) {
                if (!field.resolved) continue;
                const modelled = meta?.fields.find((candidate) => candidate.path === field.key);
                expect(modelled, `${shape.key}.${field.key} exists in Java but is not modelled`).toBeDefined();
                expect(modelled?.default, `${shape.key}.${field.key}`).toEqual(field.value);
            }

            // `subtract` is declared on the shared base class.
            const base = parseJavaFields(outerClassBody(join(maskDir, "MaskConfig.java"), "MaskConfig")).find((field) => field.key === "subtract");
            expect(base?.value).toBe(false);
        }
    });
});

describe.skipIf(!vendorAvailable)("Configurate's naming scheme", () => {
    it("turns a camelCase Java field into the key the config file uses", () => {
        expect(toDashedKey("acceptDownload")).toBe("accept-download");
        expect(toDashedKey("sseEnabled")).toBe("sse-enabled");
        expect(toDashedKey("hiresTileSize")).toBe("hires-tile-size");
        expect(toDashedKey("minX")).toBe("min-x");
        expect(toDashedKey("data")).toBe("data");
    });
});

describe("reading a value out of a parsed config", () => {
    it("follows a dotted path", () => {
        expect(readPath({ log: { file: "x" } }, ["log", "file"])).toBe("x");
        expect(readPath({ log: { file: "x" } }, ["log", "missing"])).toBeUndefined();
        expect(readPath({ log: null }, ["log", "file"])).toBeUndefined();
    });
});

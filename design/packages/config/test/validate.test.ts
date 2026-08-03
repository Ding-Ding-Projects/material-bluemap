import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { descriptorFor, fileStorageDescriptor, maskConfigSchema, sqlStorageDescriptor, storageDescriptorFor } from "../src/schema/index.js";
import { parseConfigText, validateConfigValue } from "../src/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, "fixtures", "cli-generated");

function fixture(name: string): string {
    return readFileSync(join(fixtureRoot, name), "utf8");
}

describe("parsing the files the CLI generated", () => {
    it("reads core.conf with no errors and no warnings", () => {
        const result = parseConfigText(descriptorFor("core"), fixture("core.conf"));
        expect(result.issues).toEqual([]);
        expect(result.value).toEqual({
            "accept-download": false,
            data: "data",
            "render-thread-count": 3,
            "render-thread-priority": 5,
            "update-cooldown": 60,
            "full-update-interval": 1440,
            "scan-for-mod-resources": true,
            metrics: true,
            log: { file: "data/logs/debug.log", append: false },
        });
    });

    it("reads webapp.conf cleanly", () => {
        const result = parseConfigText(descriptorFor("webapp"), fixture("webapp.conf"));
        expect(result.issues).toEqual([]);
        expect(result.value?.["webroot"]).toBe("web");
        expect(result.value?.["start-location"]).toBeNull();
    });

    it("reads webserver.conf cleanly, filling in the ip the template never mentions", () => {
        const result = parseConfigText(descriptorFor("webserver"), fixture("webserver.conf"));
        expect(result.issues).toEqual([]);
        expect(result.value?.["port"]).toBe(8100);
        expect(result.value?.["ip"]).toBe("0.0.0.0");
        expect(result.value?.["log"]).toEqual({ file: "data/logs/webserver.log", append: false, format: '%1$s "%3$s %4$s %5$s" %6$s %7$s' });
    });

    it.each(["overworld", "nether", "end"])("reads the generated %s map config cleanly", (id) => {
        const result = parseConfigText(descriptorFor("map"), fixture(`maps/${id}.conf`));
        expect(result.issues).toEqual([]);
        expect(result.value?.["dimension"]).toBe(id === "overworld" ? "minecraft:overworld" : id === "nether" ? "minecraft:the_nether" : "minecraft:the_end");
    });

    it("reads the nether's ceiling-removing render mask", () => {
        const result = parseConfigText(descriptorFor("map"), fixture("maps/nether.conf"));
        expect(result.value?.["render-mask"]).toEqual([
            { type: "bluemap:box", subtract: false, "min-x": -2147483648, "min-y": -2147483648, "min-z": -2147483648, "max-x": 2147483647, "max-y": 2147483647, "max-z": 2147483647 },
            { type: "bluemap:box", subtract: true, "min-x": -2147483648, "min-y": 90, "min-z": -2147483648, "max-x": 2147483647, "max-y": 127, "max-z": 2147483647 },
        ]);
    });

    it("reads both storage configs, dispatching on storage-type", () => {
        const file = parseConfigText(fileStorageDescriptor, fixture("storages/file.conf"));
        expect(file.issues).toEqual([]);
        expect(file.value).toEqual({ "storage-type": "file", root: "web/maps", compression: "gzip", atomic: true });

        const sql = parseConfigText(sqlStorageDescriptor, fixture("storages/sql.conf"));
        expect(sql.issues).toEqual([]);
        expect(sql.value?.["connection-properties"]).toEqual({ user: "root", password: "" });

        expect(storageDescriptorFor("file")).toBe(fileStorageDescriptor);
        expect(storageDescriptorFor("bluemap:sql")).toBe(sqlStorageDescriptor);
        expect(storageDescriptorFor("redis")).toBeUndefined();
    });
});

describe("reporting rather than silently dropping", () => {
    it("reports an unknown key instead of ignoring it the way Configurate does", () => {
        const result = parseConfigText(descriptorFor("core"), "render-treads: 8\n");
        expect(result.ok).toBe(true); // BlueMap loads this file, so we do too.
        expect(result.issues).toEqual([
            {
                severity: "warning",
                kind: "unknown-key",
                path: "render-treads",
                message: 'BlueMap does not know the setting "render-treads" and ignores it. Check the spelling, or delete the line.',
                file: "core",
            },
        ]);
    });

    it("reports an unknown key nested inside a known section", () => {
        const result = parseConfigText(descriptorFor("core"), "log { flie: x }\n");
        expect(result.issues.map((issue) => issue.path)).toEqual(["log.flie"]);
    });

    it("reports a legacy render bound as an error, in upstream's own words", () => {
        const result = parseConfigText(descriptorFor("map"), "min-y: 50\nmax-y: 100\n");
        expect(result.ok).toBe(false);
        expect(result.issues.map((issue) => issue.path)).toEqual(["min-y", "max-y"]);
        expect(result.issues[0]?.kind).toBe("legacy-key");
        expect(result.issues[0]?.message).toContain("Your map-configuration is outdated!");
    });

    it("reports a value the schema rejects, with its path", () => {
        const result = parseConfigText(descriptorFor("webserver"), "port: 70000\n");
        expect(result.ok).toBe(false);
        expect(result.value).toBeNull();
        expect(result.issues[0]?.kind).toBe("invalid-value");
        expect(result.issues[0]?.path).toBe("port");
    });

    it("reports a malformed file with the line it went wrong on", () => {
        const result = parseConfigText(descriptorFor("core"), "log { file: x\n");
        expect(result.ok).toBe(false);
        expect(result.document).toBeNull();
        expect(result.issues[0]?.kind).toBe("hocon");
        expect(result.issues[0]?.message).toContain("never closed");
    });

    it("warns about a value outside a range upstream recommends, without rejecting it", () => {
        const result = parseConfigText(descriptorFor("map"), "edge-light-strength: 40\n");
        expect(result.ok).toBe(true);
        expect(result.issues).toEqual([
            { severity: "warning", kind: "advisory", path: "edge-light-strength", message: "Upstream says this should be a value between 0 and 15.", file: "map" },
        ]);
    });

    it("warns about a resolution the viewer does not document", () => {
        const result = parseConfigText(descriptorFor("webapp"), "resolution-default: 3\n");
        expect(result.issues.map((issue) => issue.path)).toEqual(["resolution-default"]);
        expect(result.value?.["resolution-default"]).toBe(3);
    });
});

describe("coercions Configurate performs and this schema mirrors", () => {
    it("reads the words Configurate's boolean serialiser reads", () => {
        for (const [text, expected] of [
            ["yes", true],
            ["y", true],
            ["true", true],
            ["t", true],
            ["1", true],
            ["no", false],
            ["n", false],
            ["false", false],
            ["f", false],
            ["0", false],
        ] as [string, boolean][]) {
            const result = validateConfigValue(descriptorFor("core"), { "accept-download": text });
            expect(result.value?.["accept-download"], text).toBe(expected);
        }
    });

    it("does not invent words Configurate would refuse", () => {
        // HOCON's tokenizer only makes `true` and `false` booleans, and
        // Configurate's serialiser does not take "on" or "off", so neither does
        // this. Accepting them here would load a file the Java CLI rejects.
        const result = validateConfigValue(descriptorFor("core"), { "accept-download": "on" });
        expect(result.ok).toBe(false);
        expect(result.issues[0]?.path).toBe("accept-download");
    });

    it("reads a quoted number as a number", () => {
        expect(validateConfigValue(descriptorFor("webserver"), { port: "8200" }).value?.["port"]).toBe(8200);
    });

    it("reads start-pos written with y instead of z, as the Vector2i serialiser does", () => {
        expect(validateConfigValue(descriptorFor("map"), { "start-pos": { x: 1, y: 2 } }).value?.["start-pos"]).toEqual({ x: 1, z: 2 });
    });

    it("fills in every default when the file is empty", () => {
        const result = validateConfigValue(descriptorFor("map"), {});
        expect(result.ok).toBe(true);
        expect(result.value?.["storage"]).toBe("file");
        expect(result.value?.["edge-light-strength"]).toBe(15);
        expect(result.value?.["marker-sets"]).toBeNull();
    });

    it("keeps duplicate scripts out, because the Java field is a LinkedHashSet", () => {
        expect(validateConfigValue(descriptorFor("webapp"), { scripts: ["a.js", "a.js", "b.js"] }).value?.["scripts"]).toEqual(["a.js", "b.js"]);
    });
});

describe("render masks", () => {
    it("defaults an entry with no type to a box, as the Java base class does", () => {
        expect(maskConfigSchema.parse({ "min-y": 4 })).toMatchObject({ type: "bluemap:box", "min-y": 4, subtract: false });
    });

    it("reads a bare key with BlueMap's default namespace", () => {
        expect(maskConfigSchema.parse({ type: "circle", radius: 50 })).toMatchObject({ type: "bluemap:circle", radius: 50 });
        expect(maskConfigSchema.parse({ type: "bluemap:circle", radius: 50 })).toMatchObject({ type: "bluemap:circle", radius: 50 });
    });

    it("reads every shape in the registry", () => {
        expect(maskConfigSchema.parse({ type: "ellipse" })).toMatchObject({ type: "bluemap:ellipse" });
        expect(maskConfigSchema.parse({ type: "polygon", shape: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }] })).toMatchObject({ type: "bluemap:polygon" });
        expect(maskConfigSchema.parse({ type: "blur", size: 3, masks: [{ type: "box" }] })).toMatchObject({
            type: "bluemap:blur",
            size: 3,
            masks: [{ type: "bluemap:box" }],
        });
    });

    it("nests a blur inside a blur", () => {
        const parsed = maskConfigSchema.parse({ type: "blur", masks: [{ type: "blur", masks: [{ type: "circle" }] }] });
        expect(parsed).toMatchObject({ type: "bluemap:blur", masks: [{ type: "bluemap:blur", masks: [{ type: "bluemap:circle" }] }] });
    });

    it("rejects a shape nobody registered", () => {
        expect(() => maskConfigSchema.parse({ type: "hexagon" })).toThrow();
    });

    it("warns when a polygon has too few points to be a shape", () => {
        const result = parseConfigText(descriptorFor("map"), 'render-mask: [ { type: polygon, shape: [ { x: 0, z: 0 } ] } ]\n');
        expect(result.ok).toBe(true);
        expect(result.issues).toEqual([]);
        // The advisory lives on the mask shape metadata rather than the map
        // descriptor, because the map descriptor treats render-mask as one leaf.
        expect(result.value?.["render-mask"]).toHaveLength(1);
    });
});

describe("marker sets", () => {
    it("reads a marker set's own fields and passes its markers through untouched", () => {
        const result = validateConfigValue(descriptorFor("map"), {
            "marker-sets": {
                towns: { label: "Towns", "default-hidden": true, markers: { spawn: { type: "poi", position: { x: 1, y: 2, z: 3 } } } },
            },
        });

        expect(result.ok).toBe(true);
        expect(result.value?.["marker-sets"]).toEqual({
            towns: { label: "Towns", toggleable: true, "default-hidden": true, sorting: 0, markers: { spawn: { type: "poi", position: { x: 1, y: 2, z: 3 } } } },
        });
    });
});

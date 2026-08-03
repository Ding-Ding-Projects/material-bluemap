import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigTemplate, formatConfigPath, platformSeparator, UNSET_VARIABLE } from "../src/templates/template.js";
import { CONFIG_TEMPLATES } from "../src/templates/sources.js";
import { generateConfigSet, localTimestamp, suggestRenderThreadCount } from "../src/generate.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "..", "..", "..", "..");
const vendorConfigDir = join(repoRoot, "vendor", "BlueMap", "common", "src", "main", "resources", "de", "bluecolored", "bluemap", "config");
const fixtureRoot = join(here, "fixtures", "cli-generated");

const vendorAvailable = existsSync(vendorConfigDir);

describe("embedded templates", () => {
    // Skipped rather than failed when the vendored Java tree is not checked out,
    // because a package consumer has no reason to have it.
    it.skipIf(!vendorAvailable).each(Object.keys(CONFIG_TEMPLATES))("%s matches the vendored file byte for byte", (name) => {
        const vendored = readFileSync(join(vendorConfigDir, `${name}.conf`), "utf8").replaceAll("\r\n", "\n");
        expect(CONFIG_TEMPLATES[name as keyof typeof CONFIG_TEMPLATES]).toBe(vendored);
    });

    it("has all seven of them", () => {
        expect(Object.keys(CONFIG_TEMPLATES).sort()).toEqual(["core", "maps/map", "plugin", "storages/file", "storages/sql", "webapp", "webserver"]);
    });
});

describe("ConfigTemplate", () => {
    it("substitutes a variable", () => {
        expect(new ConfigTemplate("a: ${x}").setVariable("x", "1").build()).toBe("a: 1");
    });

    it("leaves upstream's placeholder for a variable nobody set", () => {
        expect(new ConfigTemplate("a: ${x}").build()).toBe(`a: ${UNSET_VARIABLE}`);
        expect(new ConfigTemplate("a: ${x}").setVariable("x", "1").setVariable("x", null).build()).toBe(`a: ${UNSET_VARIABLE}`);
    });

    it("keeps an enabled conditional and drops a disabled one", () => {
        const template = new ConfigTemplate("start${flag<<-middle->>}end");
        expect(template.setConditional("flag", true).build()).toBe("start-middle-end");
        expect(template.setConditional("flag", false).build()).toBe("startend");
    });

    it("expands variables inside an enabled conditional", () => {
        expect(new ConfigTemplate("${flag<<x=${v}>>}").setConditional("flag", true).setVariable("v", "9").build()).toBe("x=9");
    });

    it("does not rescan a substituted value, so a value containing ${...} is left alone", () => {
        expect(new ConfigTemplate("a: ${x}").setVariable("x", "${y}").build()).toBe("a: ${y}");
    });

    it("escapes backslashes in a path but leaves forward slashes alone", () => {
        expect(formatConfigPath("C:\\Users\\map", "\\")).toBe("C:/Users/map");
        expect(formatConfigPath("/srv/bluemap/web", "/")).toBe("/srv/bluemap/web");
        // On a POSIX host a literal backslash in a name is not a separator, so it
        // survives as an escaped backslash rather than becoming a slash.
        expect(formatConfigPath("/srv/od\\d", "/")).toBe("/srv/od\\\\d");
    });

    it("works out the separator itself, without reaching for a Node builtin", () => {
        // This used to be `import { sep } from "node:path"`, which is correct in
        // Node and fatal in a browser bundle: the options GUI and the create-a-map
        // wizard both render these templates in the renderer process, and bundling
        // that import failed the build outright with `"sep" is not exported by
        // "__vite-browser-external"`.
        expect(platformSeparator()).toBe(process.platform === "win32" ? "\\" : "/");
    });

    it("uses that separator when a caller does not name one", () => {
        const windows = "C:\\Users\\map";
        expect(formatConfigPath(windows)).toBe(formatConfigPath(windows, platformSeparator()));
    });
});

describe("generateConfigSet reproduces what the Java CLI writes", () => {
    // The fixtures under test/fixtures/cli-generated were produced by:
    //   cd <a scratch folder>
    //   java -jar vendor/BlueMap/implementations/cli/build/libs/cli-5.22-27-shadow.jar -c "$(pwd)/config"
    // on a machine with 24 logical cores and a default heap, which is why the
    // suggested render-thread count in that file is 3.
    const generated = generateConfigSet({
        webroot: "web",
        dataFolder: "data",
        world: "world",
        version: "5.22-27",
        minecraftVersion: null,
        renderThreadCount: 3,
        timestamp: "2026-08-03T11:53:54",
        separator: "/",
    });

    const byPath = new Map(generated.map((file) => [file.path, file.text]));

    it.each(["core.conf", "webapp.conf", "webserver.conf", "maps/overworld.conf", "maps/nether.conf", "maps/end.conf", "storages/file.conf", "storages/sql.conf"])(
        "writes %s byte for byte",
        (path) => {
            expect(byPath.get(path)).toBe(readFileSync(join(fixtureRoot, path), "utf8"));
        },
    );

    it("writes exactly the files the CLI writes, and no plugin.conf", () => {
        expect(generated.map((file) => file.path)).toEqual([
            "core.conf",
            "webapp.conf",
            "webserver.conf",
            "maps/overworld.conf",
            "maps/nether.conf",
            "maps/end.conf",
            "storages/file.conf",
            "storages/sql.conf",
        ]);
    });

    it("writes plugin.conf when a server platform asks for it", () => {
        const withPlugin = generateConfigSet({ webroot: "web", dataFolder: "data", world: "world", version: "5.22-27", includePluginConfig: true, separator: "/" });
        expect(withPlugin.map((file) => file.path)).toContain("plugin.conf");
        expect(withPlugin.find((file) => file.path === "plugin.conf")?.text).toBe(CONFIG_TEMPLATES.plugin);
    });
});

describe("upstream's own suggestions", () => {
    it("suggests render threads the way BlueMapConfigManager does", () => {
        expect(suggestRenderThreadCount(4, 16384)).toBe(1);
        expect(suggestRenderThreadCount(6, 2048)).toBe(1);
        expect(suggestRenderThreadCount(6, 4096)).toBe(2);
        expect(suggestRenderThreadCount(10, 4096)).toBe(2);
        expect(suggestRenderThreadCount(10, 8192)).toBe(3);
        expect(suggestRenderThreadCount(24, 65536)).toBe(3);
    });

    it("formats a timestamp the way LocalDateTime.now().withNano(0).toString() does", () => {
        expect(localTimestamp(new Date(2026, 7, 3, 11, 53, 54))).toBe("2026-08-03T11:53:54");
    });
});

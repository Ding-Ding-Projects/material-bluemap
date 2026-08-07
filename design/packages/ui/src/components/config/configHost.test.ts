import { afterEach, describe, expect, it, vi } from "vitest";
import { generateConfigSet, renderPluginTemplate } from "@worldlens/config";
import {
    createBridgeConfigHost,
    displayPath,
    hostMissingReason,
    type ConfigHost,
    type HostConfigFile,
    type SqlProbeRequest,
} from "./configHost.js";
import { fieldValue, setFieldValue } from "./configModel.js";
import { findEntry, loadWorkspace, markWorkspaceSaved, replaceFile, savePlan, type ConfigWorkspace } from "./configWorkspace.js";

const OPTIONS = { webroot: "/srv/web", dataFolder: "/srv/data", world: "/srv/world", version: "5.22" };

function setWindow(value: unknown): void {
    (globalThis as { window?: unknown }).window = value;
}

afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
});

describe("probing the bridge", () => {
    it("reports no host when there is no window at all, which is the test environment", () => {
        expect(createBridgeConfigHost()).toBeNull();
    });

    it("reports no host when the shell exposes nothing", () => {
        setWindow({});
        expect(createBridgeConfigHost()).toBeNull();
    });

    it("reports no host when the shell has a bridge but no config namespace", () => {
        setWindow({ worldlens: { getVersion: () => Promise.resolve("5.22") } });
        expect(createBridgeConfigHost()).toBeNull();
    });

    it("refuses a half-wired bridge rather than offering a picker that would throw", () => {
        setWindow({ worldlens: { config: { readFolder: () => Promise.resolve({ folder: "/cfg", files: [] }) } } });
        expect(createBridgeConfigHost()).toBeNull();
    });

    it("accepts a bridge that has every method, and forwards to it", async () => {
        const readFolder = vi.fn(() => Promise.resolve({ folder: "/cfg", files: [] }));
        const writeFiles = vi.fn(() => Promise.resolve());
        setWindow({
            worldlens: {
                config: {
                    readFolder,
                    writeFiles,
                    deleteFiles: () => Promise.resolve(),
                    pickDirectory: () => Promise.resolve(null),
                    pickFile: () => Promise.resolve(null),
                    testSqlConnection: () => Promise.resolve({ ok: true, message: "connected" }),
                    suggestConfigFolder: () => Promise.resolve("/cfg"),
                    pathSeparator: "\\",
                },
            },
        });

        const host = createBridgeConfigHost();
        expect(host).not.toBeNull();
        expect(host?.separator).toBe("\\");

        await host?.readFolder("/cfg");
        await host?.writeFiles("/cfg", [{ path: "core.conf", text: "" }]);
        expect(readFolder).toHaveBeenCalledWith("/cfg");
        expect(writeFiles).toHaveBeenCalledWith("/cfg", [{ path: "core.conf", text: "" }]);
    });

    it("falls back to a forward slash when the shell does not say", () => {
        setWindow({
            worldlens: {
                config: {
                    readFolder: () => Promise.resolve({ folder: "/cfg", files: [] }),
                    writeFiles: () => Promise.resolve(),
                    deleteFiles: () => Promise.resolve(),
                    pickDirectory: () => Promise.resolve(null),
                    pickFile: () => Promise.resolve(null),
                    testSqlConnection: () => Promise.resolve({ ok: true, message: "connected" }),
                    suggestConfigFolder: () => Promise.resolve("/cfg"),
                },
            },
        });
        expect(createBridgeConfigHost()?.separator).toBe("/");
    });
});

describe("saying what cannot be done", () => {
    it("names the action and says why, rather than leaving a dead control", () => {
        const reason = hostMissingReason("Saving a config folder");
        expect(reason).toContain("Saving a config folder");
        expect(reason).toContain("desktop app");
    });

    it("builds a display path with the host's own separator", () => {
        const windowsHost = { separator: "\\" } as ConfigHost;
        expect(displayPath(windowsHost, "C:\\cfg", "maps/overworld.conf")).toBe("C:\\cfg\\maps\\overworld.conf");
        expect(displayPath(null, "/cfg", "maps/overworld.conf")).toBe("/cfg/maps/overworld.conf");
        expect(displayPath(null, null, "maps/overworld.conf")).toBe("maps/overworld.conf");
    });

    it("does not double the separator when the folder already ends in one", () => {
        expect(displayPath(null, "/cfg/", "core.conf")).toBe("/cfg/core.conf");
    });
});

/**
 * A host backed by a map, so the whole open-edit-save round trip can be exercised
 * without a file system.
 */
function fakeHost(files: Map<string, string>): ConfigHost & { deleted: string[]; probes: SqlProbeRequest[] } {
    const deleted: string[] = [];
    const probes: SqlProbeRequest[] = [];

    return {
        name: "fake",
        separator: "/",
        deleted,
        probes,
        readFolder: (folder) =>
            Promise.resolve({ folder, files: [...files.entries()].map(([path, text]): HostConfigFile => ({ path, text })) }),
        writeFiles: (_folder, written) => {
            for (const file of written) files.set(file.path, file.text);
            return Promise.resolve();
        },
        deleteFiles: (_folder, paths) => {
            for (const path of paths) {
                files.delete(path);
                deleted.push(path);
            }
            return Promise.resolve();
        },
        pickDirectory: () => Promise.resolve("/picked"),
        pickFile: () => Promise.resolve("/picked/driver.jar"),
        testSqlConnection: (request) => {
            probes.push(request);
            return Promise.resolve({ ok: false, message: "Access denied for user 'root'@'localhost'", detail: "SQLSTATE 28000" });
        },
        suggestConfigFolder: () => Promise.resolve("/cfg"),
    };
}

describe("the whole round trip through a host", () => {
    it("reads a folder, changes one setting, writes only that file, and comes back clean", async () => {
        const files = new Map<string, string>();
        for (const file of [...generateConfigSet(OPTIONS), { path: "plugin.conf", text: renderPluginTemplate() }]) {
            files.set(file.path, file.text);
        }
        const host = fakeHost(files);

        const contents = await host.readFolder("/cfg");
        let workspace: ConfigWorkspace = loadWorkspace(contents.folder, contents.files);

        const entry = findEntry(workspace, "map:overworld");
        const field = entry!.file.descriptor.fields.find((candidate) => candidate.path === "remove-caves-below-y")!;
        workspace = replaceFile(workspace, entry!.key, setFieldValue(entry!.file, field, 40));

        const plan = savePlan(workspace);
        expect(plan.writes.map((file) => file.path)).toEqual(["maps/overworld.conf"]);
        expect(plan.affectedMapIds).toEqual(["overworld"]);

        await host.writeFiles("/cfg", plan.writes);
        workspace = markWorkspaceSaved(workspace, plan);
        expect(savePlan(workspace).empty).toBe(true);

        // Reading it back gives the same value, with the comments still there.
        const reread = loadWorkspace("/cfg", (await host.readFolder("/cfg")).files);
        const rereadEntry = findEntry(reread, "map:overworld")!;
        expect(fieldValue(rereadEntry.file, field)).toBe(40);
        expect(rereadEntry.file.text).toContain("#");
    });

    it("deletes a file only after the save, not when the entry is removed", async () => {
        const files = new Map<string, string>();
        for (const file of generateConfigSet(OPTIONS)) files.set(file.path, file.text);
        const host = fakeHost(files);

        let workspace = loadWorkspace("/cfg", (await host.readFolder("/cfg")).files);
        const { removeEntry } = await import("./configWorkspace.js");
        workspace = removeEntry(workspace, "map:nether");

        expect(files.has("maps/nether.conf")).toBe(true);

        const plan = savePlan(workspace);
        await host.deleteFiles("/cfg", plan.deletes);
        expect(host.deleted).toEqual(["maps/nether.conf"]);
        expect(files.has("maps/nether.conf")).toBe(false);
    });

    it("passes the connection details through and reports the driver's own words back", async () => {
        const host = fakeHost(new Map());
        const result = await host.testSqlConnection({
            connectionUrl: "jdbc:mysql://localhost:3306/bluemap",
            properties: { user: "root", password: "" },
            dialect: null,
            driverJar: null,
            driverClass: null,
        });

        expect(host.probes[0]?.connectionUrl).toBe("jdbc:mysql://localhost:3306/bluemap");
        expect(result.ok).toBe(false);
        expect(result.message).toContain("Access denied");
        expect(result.detail).toBe("SQLSTATE 28000");
    });
});

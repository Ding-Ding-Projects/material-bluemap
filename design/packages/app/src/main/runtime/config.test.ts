import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { engineStorageRoot, writeEngineConfig } from "./config.js";

const created: string[] = [];

async function workspace(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "bluemap-runtime-config-"));
    created.push(directory);
    return directory;
}

afterEach(async () => {
    while (created.length > 0) {
        const directory = created.pop();
        if (directory !== undefined) await rm(directory, { recursive: true, force: true });
    }
});

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

describe("writing the config a container will read", () => {
    it("writes container paths into the files while writing the files here", async () => {
        const root = await workspace();
        const configDir = join(root, "config-container");

        const written = await writeEngineConfig({
            hostConfigDir: configDir,
            engineDataDir: "/bluemap/data",
            engineWebRoot: "/bluemap/web",
            maps: [{ id: "overworld", world: "/worlds/overworld" }],
            acceptDownload: true,
            createEngineDirectories: false,
        });

        expect(written.files).toHaveLength(5);
        const core = await readFile(join(configDir, "core.conf"), "utf8");
        expect(core).toContain('data: "/bluemap/data"');
        // The one that matters: the log path is joined in the engine's grammar, not this
        // machine's, so a Windows host does not write `\bluemap\data\logs` into it.
        expect(core).toContain('file: "/bluemap/data/logs/cli.log"');

        const map = await readFile(join(configDir, "maps", "overworld.conf"), "utf8");
        expect(map).toContain('world: "/worlds/overworld"');

        const storage = await readFile(join(configDir, "storages", "file.conf"), "utf8");
        expect(storage).toContain('root: "/bluemap/web/maps"');
    });

    it("never creates the engine's own directories on this machine", async () => {
        const root = await workspace();
        await writeEngineConfig({
            hostConfigDir: join(root, "config-container"),
            engineDataDir: "/bluemap/data",
            engineWebRoot: "/bluemap/web",
            maps: [{ id: "overworld", world: "/worlds/overworld" }],
            acceptDownload: true,
            createEngineDirectories: false,
        });
        // The failure this prevents: `C:\bluemap\web\maps`, or `/bluemap` on a Linux host,
        // created beside a container's output and never found again.
        expect(await exists("/bluemap")).toBe(false);
    });

    it("creates them for a local run, where they are this machine's paths", async () => {
        const root = await workspace();
        await writeEngineConfig({
            hostConfigDir: join(root, "config"),
            engineDataDir: join(root, "data"),
            engineWebRoot: join(root, "web"),
            maps: [{ id: "overworld", world: join(root, "world") }],
            acceptDownload: true,
            createEngineDirectories: true,
        });
        expect(await exists(join(root, "data"))).toBe(true);
        expect(await exists(join(root, "web", "maps"))).toBe(true);
    });
});

describe("the web server's own config", () => {
    it("leaves upstream's server disabled for a render", async () => {
        const root = await workspace();
        await writeEngineConfig({
            hostConfigDir: join(root, "config"),
            engineDataDir: join(root, "data"),
            engineWebRoot: join(root, "web"),
            maps: [{ id: "overworld", world: join(root, "world") }],
            acceptDownload: true,
            createEngineDirectories: true,
        });
        expect(await readFile(join(root, "config", "webserver.conf"), "utf8")).toContain("enabled: false");
    });

    it("binds loopback locally and every interface inside a container", async () => {
        const root = await workspace();
        for (const [ip, folder] of [
            ["127.0.0.1", "local"],
            ["0.0.0.0", "container"],
        ] as const) {
            await writeEngineConfig({
                hostConfigDir: join(root, folder),
                engineDataDir: "/bluemap/data",
                engineWebRoot: "/bluemap/web",
                maps: [{ id: "overworld", world: "/worlds/overworld" }],
                acceptDownload: true,
                createEngineDirectories: false,
                webServer: { port: 8100, ip },
            });
            const text = await readFile(join(root, folder, "webserver.conf"), "utf8");
            expect(text).toContain("enabled: true");
            expect(text).toContain(`ip: "${ip}"`);
            expect(text).toContain("port: 8100");
        }
    });
});

describe("what it refuses", () => {
    it("refuses a map id that is not a usable folder or URL segment", async () => {
        const root = await workspace();
        await expect(
            writeEngineConfig({
                hostConfigDir: join(root, "config"),
                engineDataDir: "/bluemap/data",
                engineWebRoot: "/bluemap/web",
                maps: [{ id: "../escape", world: "/worlds/x" }],
                acceptDownload: true,
                createEngineDirectories: false,
            }),
        ).rejects.toThrow(/not a usable map id/);
    });

    it("keeps a supplied map body and still owns world, dimension and storage", async () => {
        const root = await workspace();
        await writeEngineConfig({
            hostConfigDir: join(root, "config"),
            engineDataDir: "/bluemap/data",
            engineWebRoot: "/bluemap/web",
            maps: [
                {
                    id: "overworld",
                    world: "/worlds/overworld",
                    config: 'name: "Mine"\nambient-light: 0.1\nworld: "/somewhere/else"\n',
                },
            ],
            acceptDownload: true,
            createEngineDirectories: false,
        });
        const text = await readFile(join(root, "config", "maps", "overworld.conf"), "utf8");
        expect(text).toContain('ambient-light: 0.1');
        expect(text.trimEnd().endsWith('storage: "file"')).toBe(true);
        expect(text.lastIndexOf('world: "/worlds/overworld"')).toBeGreaterThan(
            text.lastIndexOf('world: "/somewhere/else"'),
        );
    });
});

describe("the storage root", () => {
    it("is under the web root, in the engine's own path grammar", () => {
        expect(engineStorageRoot("/bluemap/web")).toBe("/bluemap/web/maps");
        expect(engineStorageRoot("C:\\renders\\world\\web")).toBe("C:\\renders\\world\\web\\maps");
    });
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    defaultStorageDirectory,
    expandStorageDirectory,
    listRenderIds,
    renderIdForWorld,
    renderWorkspace,
} from "./workspace.js";

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-workspace-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("renderWorkspace", () => {
    it("puts everything a render produces inside one directory", () => {
        const workspace = renderWorkspace("/maps", "world-abc123");
        expect(workspace.root).toBe(resolve("/maps", "world-abc123"));
        expect(workspace.configDir).toBe(join(workspace.root, "config"));
        expect(workspace.dataDir).toBe(join(workspace.root, "data"));
        expect(workspace.webRoot).toBe(join(workspace.root, "web"));
        expect(workspace.storageRoot).toBe(join(workspace.root, "web", "maps"));
        expect(workspace.recordFile).toBe(join(workspace.root, "render.json"));
    });
});

describe("renderIdForWorld", () => {
    it("is stable, which is what makes an incremental re-render possible", () => {
        // BlueMap re-renders only what changed, and knows what changed from the render
        // state in the storage folder. An id that varied per render would give every
        // render an empty folder and turn every update into a full re-render.
        const first = renderIdForWorld("/saves/My World");
        expect(renderIdForWorld("/saves/My World")).toBe(first);
    });

    it("keeps two worlds with the same folder name apart", () => {
        expect(renderIdForWorld("/a/world")).not.toBe(renderIdForWorld("/b/world"));
    });

    it("treats a differently-capitalised path as the same world", () => {
        // Windows and macOS both do. Hashing the two to different ids would silently
        // full-re-render a world because somebody typed a drive letter in lower case.
        expect(renderIdForWorld("C:\\Saves\\World")).toBe(renderIdForWorld("c:\\saves\\world"));
    });

    it("stays readable, so the folder means something in a file manager", () => {
        expect(renderIdForWorld("/saves/My World")).toMatch(/^my-world-[0-9a-f]{12}$/);
    });
});

describe("expandStorageDirectory", () => {
    /**
     * The setup step in `packages/ui/.../setup/mapStorage.ts` stores the person's
     * choice with a token in it, because the renderer has no home directory to resolve
     * against, and states plainly that "the main process expands it when a render
     * starts". These are those expansions.
     */
    it("expands the Windows default the setup step writes", () => {
        expect(
            expandStorageDirectory("%APPDATA%\\Worldlens\\maps", {
                home: "C:\\Users\\me",
                appData: "C:\\Users\\me\\AppData\\Roaming",
                platform: "win32",
            }),
        ).toBe("C:\\Users\\me\\AppData\\Roaming\\Worldlens\\maps");
    });

    it("expands the POSIX default the setup step writes", () => {
        expect(
            expandStorageDirectory("~/.config/Worldlens/maps", {
                home: "/home/me",
                platform: "linux",
            }),
        ).toBe("/home/me/.config/Worldlens/maps");
    });

    it("leaves a path somebody typed themselves alone", () => {
        expect(expandStorageDirectory("/mnt/big/maps", { home: "/home/me", platform: "linux" })).toBe(
            "/mnt/big/maps",
        );
    });

    it("refuses a relative path rather than resolving it against the cwd", () => {
        // Resolving against the working directory is exactly how tiles end up wherever
        // the app happened to be launched from.
        expect(() =>
            expandStorageDirectory("maps", { home: "/home/me", platform: "linux" }),
        ).toThrow(/absolute/);
        expect(() => expandStorageDirectory("  ", { home: "/home/me" })).toThrow(/empty/);
    });
});

describe("defaultStorageDirectory", () => {
    it("agrees with the setup step's default by construction", () => {
        // Electron's userData on Windows is %APPDATA%\Worldlens, so this and
        // `defaultMapStorageDir("windows")` name the same folder without either of them
        // hard-coding the other's string.
        expect(defaultStorageDirectory("C:\\Users\\me\\AppData\\Roaming\\Worldlens")).toBe(
            join("C:\\Users\\me\\AppData\\Roaming\\Worldlens", "maps"),
        );
    });
});

describe("listRenderIds", () => {
    it("lists the render directories that exist", async () => {
        await mkdir(join(root, "world-a"), { recursive: true });
        await mkdir(join(root, "world-b"), { recursive: true });
        await writeFile(join(root, "loose-file.txt"), "not a render", "utf8");

        expect((await listRenderIds(root)).sort()).toEqual(["world-a", "world-b"]);
    });

    it("reports no renders rather than failing on a first launch", async () => {
        expect(await listRenderIds(join(root, "never-created"))).toEqual([]);
    });
});

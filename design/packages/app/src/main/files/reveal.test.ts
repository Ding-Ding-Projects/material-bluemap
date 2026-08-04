import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isInsideRoot, revealInFileManager, type RevealHost, type RevealRoot } from "./reveal.js";

/* -------------------------------------------------------------------------- */
/* The containment rule, on its own                                           */
/* -------------------------------------------------------------------------- */

describe("isInsideRoot", () => {
    it("accepts the root itself and anything under it", () => {
        expect(isInsideRoot("C:\\data\\maps", "C:\\data\\maps", "win32")).toBe(true);
        expect(isInsideRoot("C:\\data\\maps", "C:\\data\\maps\\world\\0\\0.png", "win32")).toBe(true);
        expect(isInsideRoot("/data/maps", "/data/maps/world", "linux")).toBe(true);
    });

    it("refuses a sibling whose name merely starts the same way", () => {
        // The failure a string prefix check would let through: `maps-evil` is a completely
        // different directory that begins with every character of `maps`.
        expect(isInsideRoot("C:\\data\\maps", "C:\\data\\maps-evil", "win32")).toBe(false);
        expect(isInsideRoot("/data/maps", "/data/maps-evil", "linux")).toBe(false);
    });

    it("refuses a path that climbs out", () => {
        expect(isInsideRoot("C:\\data\\maps", "C:\\data", "win32")).toBe(false);
        expect(isInsideRoot("C:\\data\\maps", "C:\\Windows\\System32", "win32")).toBe(false);
    });

    it("refuses a different drive or share entirely", () => {
        expect(isInsideRoot("C:\\data\\maps", "D:\\data\\maps\\thing", "win32")).toBe(false);
        expect(isInsideRoot("C:\\data\\maps", "\\\\server\\share\\thing", "win32")).toBe(false);
    });

    it("compares case-insensitively on Windows and case-sensitively elsewhere", () => {
        expect(isInsideRoot("C:\\Data\\Maps", "c:\\data\\maps\\x", "win32")).toBe(true);
        expect(isInsideRoot("/Data/Maps", "/data/maps/x", "linux")).toBe(false);
    });

    it("treats both separators as separators on Windows", () => {
        expect(isInsideRoot("C:/data/maps", "C:\\data\\maps\\x", "win32")).toBe(true);
    });
});

/* -------------------------------------------------------------------------- */
/* The channel, against a real directory                                      */
/* -------------------------------------------------------------------------- */

const created: string[] = [];

async function tempRoot(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "mb-reveal-"));
    created.push(folder);
    return folder;
}

afterAll(async () => {
    for (const folder of created) await rm(folder, { recursive: true, force: true });
});

interface Recorded {
    readonly host: RevealHost;
    readonly shown: string[];
    readonly opened: string[];
}

function fakeShell(problem = ""): Recorded {
    const shown: string[] = [];
    const opened: string[] = [];
    return {
        shown,
        opened,
        host: {
            showItemInFolder(path: string): void {
                shown.push(path);
            },
            openPath(path: string): Promise<string> {
                opened.push(path);
                return Promise.resolve(problem);
            },
        },
    };
}

function rootsOf(...paths: string[]): () => readonly RevealRoot[] {
    return () => paths.map((path, index) => ({ id: `root-${String(index)}`, label: `folder ${String(index)}`, path }));
}

describe("revealInFileManager", () => {
    it("opens a folder inside an allowlisted root", async () => {
        const root = await tempRoot();
        const inside = join(root, "world-abc");
        await mkdir(inside);
        const shell = fakeShell();

        const result = await revealInFileManager(inside, { roots: rootsOf(root), host: shell.host });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.opened).toBe("folder");
        expect(shell.opened.length).toBe(1);
    });

    it("selects a file rather than launching it", async () => {
        const root = await tempRoot();
        const file = join(root, "render.json");
        await writeFile(file, "{}", "utf8");
        const shell = fakeShell();

        const result = await revealInFileManager(file, { roots: rootsOf(root), host: shell.host });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.opened).toBe("item");
        // `openPath` on an `.exe` would run it. A file is always selected in its parent,
        // never handed to the shell to open.
        expect(shell.opened.length).toBe(0);
        expect(shell.shown.length).toBe(1);
    });

    it("refuses a path outside every root, and names what it will open", async () => {
        const root = await tempRoot();
        const shell = fakeShell();

        // The file system is injected so this case runs identically on the Windows machine
        // it describes and on the Linux runner that has no `C:\Windows` at all.
        const result = await revealInFileManager("C:\\Windows\\System32\\cmd.exe", {
            roots: rootsOf(root),
            host: shell.host,
            platform: "win32",
            realPath: (path) => Promise.resolve(path),
            kind: () => Promise.resolve("file"),
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("not inside a folder this app owns");
        expect(shell.opened.length + shell.shown.length).toBe(0);
    });

    it("refuses a sibling of a root whose name shares its prefix", async () => {
        const root = await tempRoot();
        const sibling = `${root}-evil`;
        await mkdir(sibling);
        created.push(sibling);
        const shell = fakeShell();

        const result = await revealInFileManager(sibling, { roots: rootsOf(root), host: shell.host });
        expect(result.ok).toBe(false);
        expect(shell.opened.length).toBe(0);
    });

    it("refuses a relative path rather than resolving it against the working directory", async () => {
        const root = await tempRoot();
        const shell = fakeShell();
        const result = await revealInFileManager("..\\..\\Windows", {
            roots: rootsOf(root),
            host: shell.host,
            platform: "win32",
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("not a full path");
    });

    it("refuses an empty path, a non-string, and a path with a control character", async () => {
        const root = await tempRoot();
        const shell = fakeShell();
        const options = { roots: rootsOf(root), host: shell.host };

        expect((await revealInFileManager("", options)).ok).toBe(false);
        expect((await revealInFileManager("   ", options)).ok).toBe(false);
        expect((await revealInFileManager(undefined, options)).ok).toBe(false);
        expect((await revealInFileManager(42, options)).ok).toBe(false);
        expect((await revealInFileManager(`${root}\u0000\\..\\..\\evil`, options)).ok).toBe(false);
        expect(shell.opened.length + shell.shown.length).toBe(0);
    });

    it("refuses a link that resolves out of the root, which is not traversal at all", async () => {
        const root = await tempRoot();
        const outside = await tempRoot();
        const shell = fakeShell();

        // The link is simulated through the injected `realPath` rather than made on disk,
        // because creating a real junction needs privileges CI does not have - and the
        // property under test is that the *resolved* path is what gets compared.
        const result = await revealInFileManager(join(root, "shortcut"), {
            roots: rootsOf(root),
            host: shell.host,
            realPath: (path) => Promise.resolve(path === join(root, "shortcut") ? outside : path),
            kind: () => Promise.resolve("directory"),
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("not inside a folder this app owns");
    });

    it("refuses a path that is not there, and says so rather than blaming the allowlist", async () => {
        const root = await tempRoot();
        const shell = fakeShell();
        const result = await revealInFileManager(join(root, "gone"), {
            roots: rootsOf(root),
            host: shell.host,
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("There is nothing at");
    });

    it("refuses when the build has no folders of its own yet", async () => {
        const shell = fakeShell();
        const result = await revealInFileManager("C:\\anything", {
            roots: () => [],
            host: shell.host,
            platform: "win32",
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("no folders of its own");
    });

    it("ignores a root that does not exist yet without refusing the others", async () => {
        const root = await tempRoot();
        const inside = join(root, "web");
        await mkdir(inside);
        const shell = fakeShell();

        const result = await revealInFileManager(inside, {
            roots: rootsOf(join(root, "never-rendered-yet"), root),
            host: shell.host,
        });
        expect(result.ok).toBe(true);
    });

    it("reports the shell's own refusal rather than claiming success", async () => {
        const root = await tempRoot();
        const shell = fakeShell("no application is registered for this folder");
        const result = await revealInFileManager(root, { roots: rootsOf(root), host: shell.host });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("no application is registered");
    });

    it("reads its roots fresh, so a storage folder that moved is the one that is allowed", async () => {
        const first = await tempRoot();
        const second = await tempRoot();
        const shell = fakeShell();
        let current = first;

        const options = { roots: (): readonly RevealRoot[] => [{ id: "maps", label: "maps", path: current }], host: shell.host };
        expect((await revealInFileManager(second, options)).ok).toBe(false);
        current = second;
        expect((await revealInFileManager(second, options)).ok).toBe(true);
    });
});

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { CommandRunner, DirectoryReader } from "./extract.js";
import {
    STAGING_PREFIX,
    findJavaHome,
    installArchive,
    sweepStagingDirectories,
    tarExecutable,
} from "./extract.js";

const temporaryDirectories: string[] = [];
afterAll(() => {
    for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "bluemap-jdk-extract-"));
    temporaryDirectories.push(directory);
    return directory;
}

/**
 * `join` produces backslashes on Windows and forward slashes elsewhere, so the fake
 * tree is written with forward slashes and both sides are normalized before they are
 * compared. Otherwise these tests would only pass on one family of platforms.
 */
const slashes = (path: string): string => path.replace(/\\/g, "/");

/** A reader over a fixed set of paths, so the tree shape can be stated exactly. */
function fakeReader(paths: string[], directories: string[]): DirectoryReader {
    return {
        exists: (path) => paths.includes(slashes(path)) || directories.includes(slashes(path)),
        isDirectory: (path) => directories.includes(slashes(path)),
        readdir: (path) =>
            [...paths, ...directories]
                .filter((entry) => entry.startsWith(`${slashes(path)}/`))
                .map((entry) => entry.slice(slashes(path).length + 1).split("/")[0] ?? "")
                .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index),
    };
}

describe("tarExecutable", () => {
    it("uses the absolute System32 bsdtar on Windows", () => {
        // A GNU tar from Git or MSYS is often earlier on PATH and cannot read zip at
        // all, which fails with an unrecognized-format error that points nowhere.
        expect(tarExecutable("win32", { SystemRoot: "C:\\Windows" }, () => true)).toBe(
            join("C:\\Windows", "System32", "tar.exe"),
        );
    });

    it("falls back to PATH when System32 has no tar", () => {
        expect(tarExecutable("win32", { SystemRoot: "C:\\Windows" }, () => false)).toBe("tar");
    });

    it("uses plain tar everywhere else", () => {
        expect(tarExecutable("linux", {}, () => true)).toBe("tar");
        expect(tarExecutable("darwin", {}, () => true)).toBe("tar");
    });
});

describe("findJavaHome", () => {
    it("finds the home inside Temurin's single wrapper directory", () => {
        const reader = fakeReader(
            ["/staging/jdk-25.0.4+7/bin/java"],
            ["/staging", "/staging/jdk-25.0.4+7", "/staging/jdk-25.0.4+7/bin"],
        );
        expect(slashes(findJavaHome("/staging", "linux", reader) ?? "")).toBe("/staging/jdk-25.0.4+7");
    });

    it("finds the home when the archive unpacked flat", () => {
        const reader = fakeReader(["/staging/bin/java"], ["/staging", "/staging/bin"]);
        expect(slashes(findJavaHome("/staging", "linux", reader) ?? "")).toBe("/staging");
    });

    it("finds the home inside a macOS bundle", () => {
        const reader = fakeReader(
            ["/staging/jdk-25.0.4+7/Contents/Home/bin/java"],
            [
                "/staging",
                "/staging/jdk-25.0.4+7",
                "/staging/jdk-25.0.4+7/Contents",
                "/staging/jdk-25.0.4+7/Contents/Home",
                "/staging/jdk-25.0.4+7/Contents/Home/bin",
            ],
        );
        expect(slashes(findJavaHome("/staging", "darwin", reader) ?? "")).toBe(
            "/staging/jdk-25.0.4+7/Contents/Home",
        );
    });

    it("looks for java.exe on Windows", () => {
        const reader = fakeReader(
            ["/staging/jdk-25/bin/java.exe"],
            ["/staging", "/staging/jdk-25", "/staging/jdk-25/bin"],
        );
        expect(slashes(findJavaHome("/staging", "win32", reader) ?? "")).toBe("/staging/jdk-25");
    });

    it("returns null when the archive contained no runnable JVM", () => {
        const reader = fakeReader(["/staging/readme.txt"], ["/staging"]);
        expect(findJavaHome("/staging", "linux", reader)).toBeNull();
    });
});

describe("sweepStagingDirectories", () => {
    it("removes only this destination's leftovers", () => {
        const root = temporaryDirectory();
        const destination = join(root, "temurin-25");
        const mine = join(root, `temurin-25${STAGING_PREFIX}abc123`);
        const otherFeature = join(root, `temurin-21${STAGING_PREFIX}def456`);
        const unrelated = join(root, "downloads");
        for (const directory of [mine, otherFeature, unrelated]) mkdirSync(directory, { recursive: true });

        const removed = sweepStagingDirectories(destination);

        expect(removed).toEqual([mine]);
        expect(existsSync(mine)).toBe(false);
        expect(existsSync(otherFeature)).toBe(true);
        expect(existsSync(unrelated)).toBe(true);
    });

    it("copes with a parent directory that does not exist yet", () => {
        expect(sweepStagingDirectories(join(temporaryDirectory(), "nope", "temurin-25"))).toEqual([]);
    });
});

/**
 * A runner that stands in for `tar`, writing whatever tree the test says the archive
 * contains into the `-C` directory it was given.
 */
function fakeTar(
    contents: Record<string, string>,
    behaviour: { fail?: string } = {},
): { runCommand: CommandRunner; invocations: string[][] } {
    const invocations: string[][] = [];
    const runCommand: CommandRunner = (command, args) => {
        invocations.push([command, ...args]);
        if (behaviour.fail !== undefined) {
            return Promise.resolve({ ok: false, stdout: "", stderr: behaviour.fail, error: "exit 1" });
        }
        const destination = args[args.indexOf("-C") + 1];
        if (destination === undefined) throw new Error("fake tar was given no -C");
        for (const [relative, body] of Object.entries(contents)) {
            const path = join(destination, relative);
            mkdirSync(join(path, ".."), { recursive: true });
            writeFileSync(path, body);
        }
        return Promise.resolve({ ok: true, stdout: "", stderr: "", error: null });
    };
    return { runCommand, invocations };
}

describe("installArchive", () => {
    it("installs the located home at the destination", async () => {
        const root = temporaryDirectory();
        const destination = join(root, "temurin-25");
        const { runCommand, invocations } = fakeTar({
            "jdk-25.0.4+7/bin/java": "#!/bin/sh\n",
            "jdk-25.0.4+7/lib/modules": "modules",
            "jdk-25.0.4+7/release": "JAVA_VERSION=25.0.4",
        });

        const installed = await installArchive(join(root, "jdk.tar.gz"), destination, {
            platform: "linux",
            runCommand,
        });

        expect(installed.home).toBe(destination);
        expect(readFileSync(join(destination, "bin", "java"), "utf8")).toBe("#!/bin/sh\n");
        expect(existsSync(join(destination, "lib", "modules"))).toBe(true);
        expect(invocations[0]?.[0]).toContain("tar");
    });

    it("leaves no staging directory behind on success", async () => {
        const root = temporaryDirectory();
        const destination = join(root, "temurin-25");
        const { runCommand } = fakeTar({ "jdk-25/bin/java": "x" });

        await installArchive(join(root, "jdk.tar.gz"), destination, { platform: "linux", runCommand });

        expect(sweepStagingDirectories(destination)).toEqual([]);
    });

    it("sweeps staging left by an earlier interrupted run", async () => {
        const root = temporaryDirectory();
        const destination = join(root, "temurin-25");
        const stale = join(root, `temurin-25${STAGING_PREFIX}stale01`);
        mkdirSync(join(stale, "jdk-25", "bin"), { recursive: true });
        const { runCommand } = fakeTar({ "jdk-25/bin/java": "x" });

        const installed = await installArchive(join(root, "jdk.tar.gz"), destination, {
            platform: "linux",
            runCommand,
        });

        expect(installed.sweptStaging).toEqual([stale]);
        expect(existsSync(stale)).toBe(false);
    });

    it("refuses to install an archive with no bin/java, and touches nothing", async () => {
        const root = temporaryDirectory();
        const destination = join(root, "temurin-25");
        // A previous, working install that must survive a failed replacement.
        mkdirSync(join(destination, "bin"), { recursive: true });
        writeFileSync(join(destination, "bin", "java"), "the install that already worked");

        const { runCommand } = fakeTar({ "some-other-thing/readme.txt": "not a jdk" });

        await expect(
            installArchive(join(root, "jdk.tar.gz"), destination, { platform: "linux", runCommand }),
        ).rejects.toThrow(/is not a JDK/);

        expect(readFileSync(join(destination, "bin", "java"), "utf8")).toBe(
            "the install that already worked",
        );
        expect(sweepStagingDirectories(destination)).toEqual([]);
    });

    it("reports what tar said when extraction fails, and installs nothing", async () => {
        const root = temporaryDirectory();
        const destination = join(root, "temurin-25");
        const { runCommand } = fakeTar({}, { fail: "tar: Unrecognized archive format" });

        await expect(
            installArchive(join(root, "jdk.zip"), destination, { platform: "linux", runCommand }),
        ).rejects.toThrow(/Unrecognized archive format/);

        expect(existsSync(destination)).toBe(false);
        expect(sweepStagingDirectories(destination)).toEqual([]);
    });

    it("replaces a previous install rather than merging into it", async () => {
        const root = temporaryDirectory();
        const destination = join(root, "temurin-25");
        mkdirSync(join(destination, "bin"), { recursive: true });
        writeFileSync(join(destination, "bin", "java"), "old");
        writeFileSync(join(destination, "stale-file-from-the-old-jdk"), "x");

        const { runCommand } = fakeTar({ "jdk-25.0.4+7/bin/java": "new" });
        await installArchive(join(root, "jdk.tar.gz"), destination, { platform: "linux", runCommand });

        expect(readFileSync(join(destination, "bin", "java"), "utf8")).toBe("new");
        expect(existsSync(join(destination, "stale-file-from-the-old-jdk"))).toBe(false);
    });
});

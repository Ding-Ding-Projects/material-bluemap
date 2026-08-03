import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";

// `join` stays native where it builds a real temporary directory on this machine.
// Fixtures describing a Linux installation use `posix.join`, because `ensureJava`
// is being told `platform: "linux"` and now honours that: building `/opt/...` with
// the native join produced `\opt\...` on Windows and matched nothing.
import { afterAll, describe, expect, it } from "vitest";
import type { FetchText } from "./adoptium.js";
import type { FetchBinary, HttpBinaryResponse } from "./download.js";
import type { CommandRunner } from "./extract.js";
import type { JavaProbeOutput, JavaRunner } from "./probe.js";
import { NoUsableJavaError, ensureJava } from "./index.js";
import { javaExecutableIn, javaHomePath, readInstallRecord } from "./installation.js";
import { downloadDirectory } from "./provision.js";

const temporaryDirectories: string[] = [];
afterAll(() => {
    for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

function dataDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "bluemap-ensure-java-"));
    temporaryDirectories.push(directory);
    return directory;
}

/* -- the fake Temurin archive and the fake Adoptium API that publishes it -- */

const ARCHIVE = Buffer.from("a pretend temurin archive ".repeat(40));
const ARCHIVE_SHA256 = createHash("sha256").update(ARCHIVE).digest("hex");
const ARCHIVE_URL =
    "https://github.invalid/adoptium/temurin25-binaries/releases/download/jdk-25.0.4%2B7/OpenJDK25U-jdk_x64_linux_hotspot_25.0.4_7.tar.gz";

function adoptiumApi(checksum = ARCHIVE_SHA256): { fetchText: FetchText; calls: string[] } {
    const calls: string[] = [];
    const fetchText: FetchText = (url) => {
        calls.push(url);
        return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
                Promise.resolve(
                    JSON.stringify([
                        {
                            release_name: "jdk-25.0.4+7",
                            version: { openjdk_version: "25.0.4+7-LTS" },
                            binary: {
                                package: {
                                    checksum,
                                    link: ARCHIVE_URL,
                                    name: "OpenJDK25U-jdk_x64_linux_hotspot_25.0.4_7.tar.gz",
                                    size: ARCHIVE.length,
                                },
                            },
                        },
                    ]),
                ),
        });
    };
    return { fetchText, calls };
}

function archiveServer(body: Buffer = ARCHIVE): { fetchBinary: FetchBinary; calls: string[] } {
    const calls: string[] = [];
    const fetchBinary: FetchBinary = (url) => {
        calls.push(url);
        return Promise.resolve<HttpBinaryResponse>({
            ok: true,
            status: 200,
            headers: { get: (name) => (name.toLowerCase() === "content-length" ? String(body.length) : null) },
            body: (async function* () {
                yield Uint8Array.prototype.slice.call(body, 0);
            })(),
        });
    };
    return { fetchBinary, calls };
}

/** Stands in for `tar`, writing a plausible JDK tree into the `-C` directory. */
const fakeTar: CommandRunner = (_command, args) => {
    const destination = args[args.indexOf("-C") + 1];
    if (destination === undefined) throw new Error("fake tar was given no -C");
    mkdirSync(join(destination, "jdk-25.0.4+7", "bin"), { recursive: true });
    writeFileSync(join(destination, "jdk-25.0.4+7", "bin", "java"), "#!/bin/sh\n");
    writeFileSync(join(destination, "jdk-25.0.4+7", "release"), "JAVA_VERSION=25.0.4\n");
    return Promise.resolve({ ok: true, stdout: "", stderr: "", error: null });
};

/** A `java` that reports `version` for the listed executables and fails for the rest. */
function runnerFor(versions: Record<string, string | null>): { runner: JavaRunner; calls: string[] } {
    const calls: string[] = [];
    const runner: JavaRunner = (executable) => {
        calls.push(executable);
        const version = versions[executable];
        const failure: JavaProbeOutput = {
            ok: false,
            stdout: "",
            stderr: "",
            error: `spawn ${executable} ENOENT`,
        };
        if (version === undefined || version === null) return Promise.resolve(failure);
        return Promise.resolve({
            ok: true,
            stdout: "",
            stderr: `openjdk version "${version}" 2026-04-21 LTS\nOpenJDK Runtime Environment Temurin-${version}+7 (build ${version}+7-LTS)\n`,
            error: null,
        });
    };
    return { runner, calls };
}

describe("ensureJava", () => {
    it("uses a suitable JVM already on the machine and downloads nothing", async () => {
        const dataDir = dataDirectory();
        const { runner } = runnerFor({ [posix.join("/opt/jdk-25", "bin", "java")]: "25.0.3" });
        const { fetchText, calls: apiCalls } = adoptiumApi();
        const { fetchBinary, calls: downloadCalls } = archiveServer();

        const result = await ensureJava({
            dataDir,
            platform: "linux",
            env: { JAVA_HOME: "/opt/jdk-25" },
            exists: (path) => path === posix.join("/opt/jdk-25", "bin", "java"),
            allowProvisioning: true,
            runner,
            fetchText,
            fetchBinary,
        });

        expect(result.installation.source).toBe("JAVA_HOME");
        expect(result.provisioned).toBe(false);
        expect(apiCalls).toHaveLength(0);
        expect(downloadCalls).toHaveLength(0);
    });

    it("refuses to download unless it was allowed to, and explains what it checked", async () => {
        const dataDir = dataDirectory();
        const { runner } = runnerFor({ [posix.join("/opt/jdk-17", "bin", "java")]: "17.0.9" });
        const { fetchText, calls } = adoptiumApi();

        // 200 MB leaving the machine is a decision, not a side effect of a lookup.
        const error = await ensureJava({
            dataDir,
            platform: "linux",
            env: { JAVA_HOME: "/opt/jdk-17" },
            exists: (path) => path === posix.join("/opt/jdk-17", "bin", "java"),
            runner,
            fetchText,
        }).catch((thrown: unknown) => thrown);

        expect(error).toBeInstanceOf(NoUsableJavaError);
        expect((error as NoUsableJavaError).message).toContain("Java 17");
        expect((error as NoUsableJavaError).discovery.rejected).toHaveLength(1);
        expect(calls).toHaveLength(0);
    });

    it("provisions, verifies, installs and then proves the result actually runs", async () => {
        const dataDir = dataDirectory();
        const provisioned = javaExecutableIn(javaHomePath(dataDir, 25), "linux");
        const { runner, calls: probeCalls } = runnerFor({ [provisioned]: "25.0.4" });
        const { fetchText } = adoptiumApi();
        const { fetchBinary, calls: downloadCalls } = archiveServer();

        const stages: string[] = [];
        const result = await ensureJava({
            dataDir,
            platform: "linux",
            architecture: "x64",
            env: {},
            allowProvisioning: true,
            runner,
            fetchText,
            fetchBinary,
            extract: { runCommand: fakeTar },
            onEvent: (event) => stages.push(event.stage),
        });

        expect(result.provisioned).toBe(true);
        expect(result.installation.source).toBe("provisioned");
        expect(result.installation.version.feature).toBe(25);
        expect(downloadCalls).toEqual([ARCHIVE_URL]);

        // The JDK is installed under userData and nowhere else.
        expect(readFileSync(join(javaHomePath(dataDir, 25), "bin", "java"), "utf8")).toBe("#!/bin/sh\n");
        expect(javaHomePath(dataDir, 25).startsWith(dataDir)).toBe(true);

        // The install is recorded with the provenance a support question needs.
        const record = readInstallRecord(dataDir);
        expect(record?.archiveUrl).toBe(ARCHIVE_URL);
        expect(record?.archiveSha256).toBe(ARCHIVE_SHA256);
        expect(record?.releaseName).toBe("jdk-25.0.4+7");

        // Freshly installed is not the same as known to work.
        expect(probeCalls).toContain(provisioned);
        expect(stages).toEqual([
            "resolving",
            "downloading",
            "downloading",
            "downloading",
            "verifying",
            "extracting",
            "installing",
            "done",
        ]);

        // The 200 MB archive is not left in the user's profile forever.
        expect(existsSync(join(downloadDirectory(dataDir), "OpenJDK25U-jdk_x64_linux_hotspot_25.0.4_7.tar.gz"))).toBe(
            false,
        );
    });

    it("finds the provisioned copy on the next launch without downloading again", async () => {
        const dataDir = dataDirectory();
        const provisioned = javaExecutableIn(javaHomePath(dataDir, 25), "linux");
        const first = runnerFor({ [provisioned]: "25.0.4" });

        await ensureJava({
            dataDir,
            platform: "linux",
            env: {},
            allowProvisioning: true,
            runner: first.runner,
            fetchText: adoptiumApi().fetchText,
            fetchBinary: archiveServer().fetchBinary,
            extract: { runCommand: fakeTar },
        });

        const second = runnerFor({ [provisioned]: "25.0.4" });
        const { fetchText, calls: apiCalls } = adoptiumApi();
        const result = await ensureJava({
            dataDir,
            platform: "linux",
            env: {},
            allowProvisioning: true,
            runner: second.runner,
            fetchText,
            fetchBinary: archiveServer().fetchBinary,
            extract: { runCommand: fakeTar },
        });

        expect(result.provisioned).toBe(false);
        expect(result.installation.source).toBe("provisioned");
        expect(apiCalls).toHaveLength(0);
    });

    it("refuses a downloaded JDK whose digest does not match, and installs nothing", async () => {
        const dataDir = dataDirectory();
        const { runner } = runnerFor({});
        const { fetchText } = adoptiumApi();
        // The server serves something other than what Adoptium published a digest for.
        const { fetchBinary } = archiveServer(Buffer.from("a substituted archive"));

        await expect(
            ensureJava({
                dataDir,
                platform: "linux",
                env: {},
                allowProvisioning: true,
                runner,
                fetchText,
                fetchBinary,
                extract: { runCommand: fakeTar },
            }),
        ).rejects.toThrow(/Checksum mismatch/);

        expect(existsSync(javaHomePath(dataDir, 25))).toBe(false);
        expect(readInstallRecord(dataDir)).toBeNull();
    });

    it("refuses to download at all when Adoptium published no checksum", async () => {
        const dataDir = dataDirectory();
        const { runner } = runnerFor({});
        const { fetchText } = adoptiumApi("");
        const { fetchBinary, calls } = archiveServer();

        await expect(
            ensureJava({
                dataDir,
                platform: "linux",
                env: {},
                allowProvisioning: true,
                runner,
                fetchText,
                fetchBinary,
                extract: { runCommand: fakeTar },
            }),
        ).rejects.toThrow(/refusing to download an unverifiable JDK/);

        expect(calls).toHaveLength(0);
    });

    it("reports a provisioned JDK that unpacked but will not run", async () => {
        const dataDir = dataDirectory();
        // Nothing answers a version probe: a quarantined binary, a partially written
        // file, a JDK for the wrong architecture.
        const { runner } = runnerFor({});

        const error = await ensureJava({
            dataDir,
            platform: "linux",
            env: {},
            allowProvisioning: true,
            runner,
            fetchText: adoptiumApi().fetchText,
            fetchBinary: archiveServer().fetchBinary,
            extract: { runCommand: fakeTar },
        }).catch((thrown: unknown) => thrown);

        expect(error).toBeInstanceOf(NoUsableJavaError);
        expect((error as NoUsableJavaError).message).toContain(ARCHIVE_URL);
        expect((error as NoUsableJavaError).message).toContain(javaHomePath(dataDir, 25));
        expect((error as NoUsableJavaError).discovery.rejected.at(-1)?.source).toBe("provisioned");

        // The record is withdrawn, so the next launch does not keep offering a JVM
        // that has already been shown not to run.
        expect(readInstallRecord(dataDir)).toBeNull();
    });
});

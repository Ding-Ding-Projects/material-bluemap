import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { JavaInstallRecord } from "./installation.js";
import {
    INSTALL_RECORD_VERSION,
    clearInstallRecord,
    installRecordFile,
    javaExecutableIn,
    javaHomePath,
    javaRoot,
    provisionedJavaExecutable,
    readInstallRecord,
    writeInstallRecord,
} from "./installation.js";

const temporaryDirectories: string[] = [];
afterAll(() => {
    for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

function dataDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "bluemap-userdata-"));
    temporaryDirectories.push(directory);
    return directory;
}

function record(dataDir: string, overrides: Partial<JavaInstallRecord> = {}): JavaInstallRecord {
    const home = javaHomePath(dataDir, 25);
    return {
        recordVersion: INSTALL_RECORD_VERSION,
        feature: 25,
        version: "25.0.4+7-LTS",
        releaseName: "jdk-25.0.4+7",
        vendor: "eclipse-temurin",
        os: "linux",
        architecture: "x64",
        home,
        executable: javaExecutableIn(home, "linux"),
        archiveUrl: "https://example.invalid/OpenJDK25U-jdk_x64_linux_hotspot_25.0.4_7.tar.gz",
        archiveSha256: "a".repeat(64),
        installedAt: "2026-08-03T11:28:40.000Z",
        ...overrides,
    };
}

describe("paths", () => {
    it("keeps everything under userData, touching nothing machine-wide", () => {
        const dataDir = dataDirectory();
        expect(javaRoot(dataDir).startsWith(dataDir)).toBe(true);
        expect(javaHomePath(dataDir, 25).startsWith(javaRoot(dataDir))).toBe(true);
        expect(installRecordFile(dataDir).startsWith(javaRoot(dataDir))).toBe(true);
    });

    it("keys the home on the feature release, so an update replaces rather than accumulates", () => {
        const dataDir = dataDirectory();
        expect(javaHomePath(dataDir, 25)).toBe(join(dataDir, "java", "temurin-25"));
        expect(javaHomePath(dataDir, 26)).not.toBe(javaHomePath(dataDir, 25));
    });

    it("names the executable for the platform", () => {
        expect(javaExecutableIn("/opt/jdk", "linux")).toBe(join("/opt/jdk", "bin", "java"));
        expect(javaExecutableIn("/opt/jdk", "win32")).toBe(join("/opt/jdk", "bin", "java.exe"));
    });
});

describe("install record", () => {
    it("round-trips what was installed", () => {
        const dataDir = dataDirectory();
        const written = writeInstallRecord(dataDir, record(dataDir));
        expect(readInstallRecord(dataDir)).toEqual(written);
    });

    it("reads as 'nothing installed' when absent, malformed or from an older schema", () => {
        const dataDir = dataDirectory();
        expect(readInstallRecord(dataDir)).toBeNull();

        mkdirSync(javaRoot(dataDir), { recursive: true });
        writeFileSync(installRecordFile(dataDir), "{ this is not json");
        expect(readInstallRecord(dataDir)).toBeNull();

        writeFileSync(installRecordFile(dataDir), JSON.stringify({ recordVersion: 0, home: "/x" }));
        expect(readInstallRecord(dataDir)).toBeNull();
    });

    it("rejects a record missing the fields that make it useful", () => {
        const dataDir = dataDirectory();
        mkdirSync(javaRoot(dataDir), { recursive: true });
        // No archiveSha256: an install whose provenance cannot be stated is not one
        // this layer is prepared to vouch for.
        const withoutDigest: Record<string, unknown> = { ...record(dataDir) };
        delete withoutDigest["archiveSha256"];
        writeFileSync(installRecordFile(dataDir), JSON.stringify(withoutDigest));
        expect(readInstallRecord(dataDir)).toBeNull();
    });

    it("leaves no half-written file behind", () => {
        const dataDir = dataDirectory();
        writeInstallRecord(dataDir, record(dataDir));
        expect(existsSync(`${installRecordFile(dataDir)}.writing`)).toBe(false);
    });

    it("can be cleared", () => {
        const dataDir = dataDirectory();
        writeInstallRecord(dataDir, record(dataDir));
        clearInstallRecord(dataDir);
        expect(readInstallRecord(dataDir)).toBeNull();
        // Clearing an already-clear record is not an error.
        expect(() => clearInstallRecord(dataDir)).not.toThrow();
    });
});

describe("provisionedJavaExecutable", () => {
    it("needs both a record and a binary at the path it names", () => {
        const dataDir = dataDirectory();
        const written = writeInstallRecord(dataDir, record(dataDir));
        expect(provisionedJavaExecutable(dataDir, (path) => path === written.executable)).toBe(
            written.executable,
        );
    });

    it("returns null when the record survived but the JDK did not", () => {
        // A user clearing out their profile directory leaves exactly this state, and
        // trusting the record would launch a path that is no longer there.
        const dataDir = dataDirectory();
        writeInstallRecord(dataDir, record(dataDir));
        expect(provisionedJavaExecutable(dataDir, () => false)).toBeNull();
    });

    it("returns null when nothing was ever provisioned", () => {
        expect(provisionedJavaExecutable(dataDirectory(), () => true)).toBeNull();
    });
});

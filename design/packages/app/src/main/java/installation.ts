/**
 * Where a provisioned JDK lives, and the record of what was installed.
 *
 * Nothing here touches anything machine-wide. Everything the app provisions goes
 * under the Electron `userData` directory the caller hands in, so uninstalling the
 * app removes the JDK with it, no elevation is ever needed, and a JDK the user
 * installed themselves is never modified, upgraded or shadowed.
 *
 * The record is what makes the install *auditable*: which build, from which URL,
 * with which digest, on which day. Without it, "the app downloaded a JDK from
 * somewhere at some point" is the whole story available to a support question.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Bumped if the layout or the meaning of the record changes. */
export const INSTALL_RECORD_VERSION = 1;

export interface JavaInstallRecord {
    readonly recordVersion: number;
    /** Feature release, e.g. 25. */
    readonly feature: number;
    /** Full version as Adoptium reports it, e.g. `25.0.4+7`. */
    readonly version: string;
    /** Adoptium's release name, e.g. `jdk-25.0.4+7`. */
    readonly releaseName: string;
    readonly vendor: string;
    /** Adoptium's OS name (`windows`, `linux`, `mac`, `alpine-linux`). */
    readonly os: string;
    /** Adoptium's architecture name (`x64`, `aarch64`, ...). */
    readonly architecture: string;
    /** Absolute path to the JDK home. */
    readonly home: string;
    /** Absolute path to the `java` binary inside that home. */
    readonly executable: string;
    /** The exact archive this came from, recorded so the install can be re-derived. */
    readonly archiveUrl: string;
    /** The SHA-256 that was verified before a single byte was extracted. */
    readonly archiveSha256: string;
    /** ISO-8601 with offset. */
    readonly installedAt: string;
}

/** `<userData>/java` — the root of everything this module owns. */
export function javaRoot(dataDir: string): string {
    return join(dataDir, "java");
}

/**
 * `<userData>/java/temurin-25` — the home for one feature release.
 *
 * Keyed by feature rather than by full version so an update replaces the install
 * instead of accumulating a 300 MB directory per patch release, and so the path is
 * predictable enough to appear in an error message someone can act on.
 */
export function javaHomePath(dataDir: string, feature: number): string {
    return join(javaRoot(dataDir), `temurin-${String(feature)}`);
}

/** `<userData>/java/installed.json`. */
export function installRecordFile(dataDir: string): string {
    return join(javaRoot(dataDir), "installed.json");
}

/** The `java` binary inside a JDK home, named for the platform. */
export function javaExecutableIn(home: string, platform: NodeJS.Platform = process.platform): string {
    return join(home, "bin", platform === "win32" ? "java.exe" : "java");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readString(source: Record<string, unknown>, key: string): string | null {
    const value = source[key];
    return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads the install record.
 *
 * A missing, unreadable, malformed or older-schema record reads as "nothing is
 * installed". That is the safe direction: the cost of being wrong is re-provisioning
 * a JDK, whereas the cost of trusting a record that does not describe what is
 * actually on disk is launching a path that no longer exists.
 */
export function readInstallRecord(dataDir: string): JavaInstallRecord | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(installRecordFile(dataDir), "utf8"));
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    if (parsed.recordVersion !== INSTALL_RECORD_VERSION) return null;

    const feature = parsed.feature;
    if (typeof feature !== "number" || !Number.isInteger(feature)) return null;

    const home = readString(parsed, "home");
    const executable = readString(parsed, "executable");
    const archiveUrl = readString(parsed, "archiveUrl");
    const archiveSha256 = readString(parsed, "archiveSha256");
    if (home === null || executable === null || archiveUrl === null || archiveSha256 === null) {
        return null;
    }

    return {
        recordVersion: INSTALL_RECORD_VERSION,
        feature,
        version: readString(parsed, "version") ?? "unknown",
        releaseName: readString(parsed, "releaseName") ?? "unknown",
        vendor: readString(parsed, "vendor") ?? "unknown",
        os: readString(parsed, "os") ?? "unknown",
        architecture: readString(parsed, "architecture") ?? "unknown",
        home,
        executable,
        archiveUrl,
        archiveSha256,
        installedAt: readString(parsed, "installedAt") ?? "unknown",
    };
}

/**
 * Writes the install record through a staging file and a rename.
 *
 * Same reasoning as `consent.ts`: a crash halfway through a plain write leaves a
 * truncated file, and a truncated JSON file that happens to still parse is the worst
 * possible outcome. A rename is atomic, so the record either describes the previous
 * install or the new one and never something in between.
 */
export function writeInstallRecord(dataDir: string, record: JavaInstallRecord): JavaInstallRecord {
    const target = installRecordFile(dataDir);
    mkdirSync(dirname(target), { recursive: true });
    const staging = `${target}.writing`;
    writeFileSync(staging, `${JSON.stringify(record, null, 4)}\n`, "utf8");
    renameSync(staging, target);
    return record;
}

/** Forgets a recorded install. Used when the recorded home has gone missing. */
export function clearInstallRecord(dataDir: string): void {
    rmSync(installRecordFile(dataDir), { force: true });
}

/**
 * The provisioned `java` executable, or null.
 *
 * Both halves have to agree: a record that claims an install, *and* an executable
 * actually present at the path it names. A record alone is a claim about the past,
 * and a directory alone might be a half-finished extraction, so neither is taken as
 * proof on its own. This still says nothing about the JVM's version, which only
 * running it can establish; that is `discovery.ts`'s job.
 */
export function provisionedJavaExecutable(
    dataDir: string,
    exists: (path: string) => boolean = existsSync,
): string | null {
    const record = readInstallRecord(dataDir);
    if (record === null) return null;
    return exists(record.executable) ? record.executable : null;
}

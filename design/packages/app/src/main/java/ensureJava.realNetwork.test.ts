/**
 * `ensureJava`'s own decision to provision, proven against the real Adoptium API and a
 * real download - not just `provisionJava` called directly.
 *
 * `provision.realNetwork.test.ts` already proves that `provisionJava` itself resolves,
 * downloads, verifies and extracts a real Temurin JDK that a real `java -version`
 * accepts. What it explicitly does not prove, and says so in its own header, is the
 * decision one level up: that `ensureJava`, asked for a JVM on a machine where
 * `discoverJava` finds *nothing usable*, actually chooses to provision rather than
 * throwing `NoUsableJavaError` - because every Windows machine this project runs its
 * test suite on already has a real JDK, so an unmodified `discoverJava` call finds one
 * and `ensureJava` never reaches its provisioning branch at all.
 *
 * This file closes that gap without uninstalling anything. `ensureJava`'s `env` option
 * is forwarded only to `discoverJava` (`JAVA_HOME` lookup and the `PATH` walk) - it is
 * never forwarded to extraction or to the download itself, which keep using the real
 * `process.env` so `tar.exe` still resolves through `SystemRoot` on Windows. Stripping
 * every `JAVA_HOME`/`PATH` key from a *copy* of the environment before it is handed to
 * `ensureJava`, together with a brand-new empty `dataDir` that has no provisioned
 * install recorded yet, makes `discoverJava` genuinely unable to see this machine's own
 * JDK - not a mock standing in for that outcome, the real function walking a real,
 * deliberately blinded environment and genuinely finding nothing. `ensureJava` then has
 * to take its provisioning branch for real, or the test fails.
 *
 * ## Opt-in
 *
 * Same gate as `provision.realNetwork.test.ts`, on purpose - this is the same real
 * ~190 MB Temurin download, and a plain `pnpm test` must not trigger it. Set
 * `MBM_REAL_JDK_DOWNLOAD=1` to run it.
 *
 *   cd design
 *   MBM_REAL_JDK_DOWNLOAD=1 npx vitest run \
 *     packages/app/src/main/java/ensureJava.realNetwork.test.ts
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureJava } from "./index.js";

const RUN_ENV = "MBM_REAL_JDK_DOWNLOAD";
const shouldRun = process.env[RUN_ENV] === "1";

if (!shouldRun) {
    console.info(
        `[ensureJava.realNetwork] The real discovery-blinded provisioning proof DID NOT RUN. ` +
            `It is opt-in: set ${RUN_ENV}=1 to enable it (currently ` +
            `${RUN_ENV}=${process.env[RUN_ENV] ?? "<unset>"}). It downloads a real ~190 MB JDK.`,
    );
}

/**
 * A copy of the real environment with every case-variant of `JAVA_HOME` and `PATH`
 * removed, so `discoverJava`'s own case-insensitive `PATH` lookup (`discovery.ts`'s
 * `pathVariable`) has nothing left to find on Windows, where the shell can hand the
 * process `Path` rather than `PATH`.
 */
function blindedEnv(): NodeJS.ProcessEnv {
    const copy: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(copy)) {
        const lower = key.toLowerCase();
        if (lower === "path" || lower === "java_home") delete copy[key];
    }
    return copy;
}

describe.skipIf(!shouldRun)("ensureJava against a real, deliberately blinded machine", () => {
    it(
        "provisions a real Temurin JDK when discovery genuinely finds nothing, and the result runs",
        { timeout: 10 * 60 * 1000 },
        async () => {
            const dataDir = mkdtempSync(join(tmpdir(), "material-bluemap-real-ensure-"));
            try {
                const env = blindedEnv();
                expect(env["JAVA_HOME"]).toBeUndefined();
                expect(env["PATH"]).toBeUndefined();
                expect(env["Path"]).toBeUndefined();

                const started = Date.now();
                const result = await ensureJava({
                    dataDir,
                    allowProvisioning: true,
                    env,
                    required: 25,
                });
                const elapsedMs = Date.now() - started;

                // The interesting assertion: this call took the provisioning branch,
                // not the "found one already" branch. If discovery had somehow still
                // seen this machine's real JDK, `provisioned` would be false and the
                // whole point of the test would be unproven.
                expect(result.provisioned).toBe(true);
                expect(result.record).not.toBeNull();
                expect(result.installation.source).toBe("provisioned");
                expect(result.installation.version.feature).toBeGreaterThanOrEqual(25);

                const record = result.record;
                if (record !== null) {
                    expect(record.vendor).toBe("eclipse-temurin");
                    expect(record.archiveUrl).toMatch(/^https:\/\/github\.com\/adoptium\//);
                    expect(record.archiveSha256).toMatch(/^[0-9a-f]{64}$/);

                    console.info(
                        `[ensureJava.realNetwork] discovery was genuinely blinded (no JAVA_HOME/PATH in the ` +
                            `env handed to it), found nothing, and ensureJava provisioned ` +
                            `${record.releaseName} (${record.architecture}/${record.os}) from ${record.archiveUrl} ` +
                            `(sha256 ${record.archiveSha256}) at ${record.home} in ${String(elapsedMs)} ms. ` +
                            `Probed version: ${result.installation.version.version} ` +
                            `(${result.installation.version.runtime ?? "no runtime line"}).`,
                    );
                }
            } finally {
                rmSync(dataDir, { recursive: true, force: true });
            }
        },
    );
});

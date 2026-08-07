/**
 * Provisioning a real Eclipse Temurin JDK, against the real Adoptium API and a real
 * download, on a machine that never sees an injected `fetchText` or `fetchBinary`.
 *
 * Every other test of this layer - `provision.ts` has none of its own; `download.
 * test.ts`, `adoptium.test.ts` and `extract.test.ts` cover it piecewise - runs against
 * fakes: `download.test.ts`'s "pretend JDK archive" is forty-eight repeated bytes,
 * and `adoptium.test.ts` resolves a release against `fetchText` stubs answering for
 * `https://example.invalid`. That proves the HTTP range-resume logic, the digest
 * check and the response-shape parsing - real code, real coverage - but nothing
 * before this file has asked `provisionJava` to actually talk to
 * `api.adoptium.net`, download a real ~190 MB archive from GitHub's release CDN, and
 * extract a JDK that a real `java -version` accepts. That is exactly the gap the
 * java-render-path article named: "JDK provisioning is tested only against fakes".
 *
 * This is that missing proof, and the one asterisk on it is honest: it does not run
 * on a machine with no usable JDK already on it (this project is Windows-only, and
 * every Windows dev machine touched by CI already has one), so it cannot observe
 * `ensureJava`'s own decision to provision - only `provisionJava` itself, called
 * directly, which is the function `ensureJava` calls when discovery finds nothing.
 *
 * ## Opt-in
 *
 * A real ~190 MB download from a shared JDK is not something a plain `pnpm test`
 * should trigger - on a metered connection, on a laptop, or on a CI runner where it
 * would race every other test file's network use for no reason most of them need.
 * Set `MBM_REAL_JDK_DOWNLOAD=1` to run it. Nothing here asks for a licence
 * acceptance the way the Mojang-derived tests do: Eclipse Temurin is Adoptium's own
 * GPLv2+CE build of OpenJDK, redistributed under its own licence, not something this
 * project's consent gate has ever covered.
 *
 * To run it by hand:
 *
 *   cd design
 *   MBM_REAL_JDK_DOWNLOAD=1 npx vitest run \
 *     packages/app/src/main/java/provision.realNetwork.test.ts
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provisionJava } from "./provision.js";
import { probeJava } from "./probe.js";
import { satisfiesRequirement } from "./version.js";

const RUN_ENV = "MBM_REAL_JDK_DOWNLOAD";
const shouldRun = process.env[RUN_ENV] === "1";

if (!shouldRun) {
    console.info(
        `[provision.realNetwork] The real Adoptium download/extract/probe proof DID NOT RUN. ` +
            `It is opt-in: set ${RUN_ENV}=1 to enable it (currently ` +
            `${RUN_ENV}=${process.env[RUN_ENV] ?? "<unset>"}). It downloads a real ~190 MB JDK.`,
    );
}

describe.skipIf(!shouldRun)("provisionJava against the real Adoptium API", () => {
    it(
        "resolves, downloads, verifies and extracts a real Temurin 25 JDK that a real `java -version` accepts",
        { timeout: 10 * 60 * 1000 },
        async () => {
            const dataDir = mkdtempSync(join(tmpdir(), "worldlens-real-jdk-"));
            try {
                const record = await provisionJava({ dataDir, feature: 25 });

                expect(record.vendor).toBe("eclipse-temurin");
                expect(record.feature).toBe(25);
                expect(record.archiveUrl).toMatch(/^https:\/\/github\.com\/adoptium\//);
                expect(record.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
                expect(statSync(record.executable).isFile()).toBe(true);

                // The install is verified by the same probe `ensureJava` runs on a
                // freshly provisioned JDK before trusting it: an archive extracting
                // cleanly is not proof it runs.
                const report = await probeJava(record.executable);
                expect(report.version, `probe of ${record.executable} did not report a version`).not.toBeNull();
                if (report.version !== null) {
                    expect(satisfiesRequirement(report.version, 25)).toBe(true);
                    expect(report.version.feature).toBeGreaterThanOrEqual(25);
                }

                console.info(
                    `[provision.realNetwork] provisioned ${record.releaseName} (${record.architecture}/${record.os}) ` +
                        `at ${record.home}, probed as ${report.version?.version ?? "<unknown>"}`,
                );
            } finally {
                rmSync(dataDir, { recursive: true, force: true });
            }
        },
    );
});

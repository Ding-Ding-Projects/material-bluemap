/**
 * The two safety properties of `downloadVerified` - refuse a wrong digest, resume
 * rather than restart - proven against real HTTP, not the in-memory fakes
 * `download.test.ts` already covers piecewise.
 *
 * Neither proof needs a real ~190 MB JDK to be honest about what it shows:
 *
 * - **Digest refusal** downloads a real, tiny file (Adoptium's own published
 *   `.sha256.txt` sidecar, a couple of dozen bytes) from the real Adoptium/GitHub CDN,
 *   with a deliberately wrong expected digest, and asserts `downloadVerified` throws
 *   and leaves nothing behind. The file is real; only the expected digest is wrong.
 * - **Resume** downloads the real Temurin 25 Windows/x64 archive - the same one
 *   `provision.realNetwork.test.ts` and `ensureJava.realNetwork.test.ts` install - but
 *   aborts the transfer on purpose once 95% of it has arrived, so the `.part` file is
 *   genuinely incomplete on disk. A second, unaborted call to `downloadVerified` for
 *   the same URL then has to ask GitHub's CDN for a real HTTP range starting past what
 *   was already written, append onto the real partial file, and verify the finished
 *   file's real SHA-256. Aborting late keeps the total transfer close to one archive's
 *   worth rather than two, while still leaving a genuinely non-empty, genuinely
 *   incomplete `.part` file for the resume to prove itself against.
 *
 * ## Opt-in
 *
 * Same gate as `provision.realNetwork.test.ts` and `ensureJava.realNetwork.test.ts`:
 * set `MBM_REAL_JDK_DOWNLOAD=1` to run it. The digest-refusal test alone would be cheap
 * enough to run by default, but it shares this file with the resume test, which is not,
 * so both stay behind the one flag rather than splitting an already-small proof across
 * two different gates.
 *
 *   cd design
 *   MBM_REAL_JDK_DOWNLOAD=1 npx vitest run \
 *     packages/app/src/main/java/download.realNetwork.test.ts
 */

import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTemurinRelease } from "./adoptium.js";
import type { DownloadProgress } from "./download.js";
import { downloadVerified, sha256File } from "./download.js";

const RUN_ENV = "MBM_REAL_JDK_DOWNLOAD";
const shouldRun = process.env[RUN_ENV] === "1";

if (!shouldRun) {
    console.info(
        `[download.realNetwork] The real digest-refusal and resume proofs DID NOT RUN. ` +
            `It is opt-in: set ${RUN_ENV}=1 to enable it (currently ` +
            `${RUN_ENV}=${process.env[RUN_ENV] ?? "<unset>"}). The resume half downloads a real ~190 MB JDK.`,
    );
}

describe.skipIf(!shouldRun)("downloadVerified against real HTTP", () => {
    it(
        "refuses a real download whose digest does not match what was expected",
        { timeout: 60_000 },
        async () => {
            const dataDir = mkdtempSync(join(tmpdir(), "material-bluemap-real-digest-"));
            try {
                // Adoptium's own published checksum sidecar for the Windows/x64 JDK -
                // a few dozen real bytes, fetched over real HTTPS from GitHub's release
                // CDN. The content is genuine; only the digest handed to
                // `downloadVerified` below is deliberately wrong.
                const url =
                    "https://github.com/adoptium/temurin25-binaries/releases/download/" +
                    "jdk-25.0.4%2B7/OpenJDK25U-jdk_x64_windows_hotspot_25.0.4_7.zip.sha256.txt";
                const wrongDigest = "0".repeat(64);
                const target = join(dataDir, "checksum-sidecar.txt");

                await expect(
                    downloadVerified({ url, sha256: wrongDigest, target }),
                ).rejects.toThrow(/Checksum mismatch/);

                // Nothing usable was left behind: no finished file at the target path,
                // and no `.part`/`.part.json` for a caller to accidentally trust later.
                expect(existsSync(target)).toBe(false);
                expect(existsSync(`${target}.part`)).toBe(false);
                expect(existsSync(`${target}.part.json`)).toBe(false);

                console.info(
                    `[download.realNetwork] a real ${String(wrongDigest.length)}-byte-digest mismatch against ` +
                        `${url} was refused, and no file was left at ${target}.`,
                );
            } finally {
                rmSync(dataDir, { recursive: true, force: true });
            }
        },
    );

    it(
        "resumes a real transfer that was genuinely interrupted, rather than restarting it",
        { timeout: 10 * 60 * 1000 },
        async () => {
            const dataDir = mkdtempSync(join(tmpdir(), "material-bluemap-real-resume-"));
            try {
                const release = await resolveTemurinRelease({
                    feature: 25,
                    platform: "win32",
                    architecture: "x64",
                });
                const target = join(dataDir, release.fileName);

                // Aborts once 95% of the archive has arrived, so the interrupted
                // transfer is genuine (not an artificial zero-byte stub) while the
                // resumed second call only has to fetch the last ~5% over the network.
                const controller = new AbortController();
                let sawAbortTrigger = false;
                const onProgress = (progress: DownloadProgress): void => {
                    if (sawAbortTrigger || progress.total === null) return;
                    if (progress.received >= progress.total * 0.95) {
                        sawAbortTrigger = true;
                        controller.abort();
                    }
                };

                await expect(
                    downloadVerified({
                        url: release.url,
                        sha256: release.sha256,
                        target,
                        expectedSize: release.size,
                        onProgress,
                        signal: controller.signal,
                    }),
                ).rejects.toThrow();

                expect(sawAbortTrigger).toBe(true);
                expect(existsSync(target)).toBe(false);
                expect(existsSync(`${target}.part`)).toBe(true);

                const interruptedSize = statSync(`${target}.part`).size;
                expect(interruptedSize).toBeGreaterThan(0);
                expect(interruptedSize).toBeLessThan(release.size);
                // The digest of the interrupted file must NOT already match: if it did,
                // the abort threshold was too late to prove anything about resuming.
                expect(await sha256File(`${target}.part`)).not.toBe(release.sha256);

                let observedResumedFrom = 0;
                const result = await downloadVerified({
                    url: release.url,
                    sha256: release.sha256,
                    target,
                    expectedSize: release.size,
                    onProgress: (progress) => {
                        observedResumedFrom = progress.resumedFrom;
                    },
                });

                // The interesting assertions: the resumed call actually resumed (did not
                // silently restart from zero), and the finished file it produced is
                // byte-for-byte the real archive, verified against the real digest.
                expect(result.resumedFrom).toBeGreaterThan(0);
                expect(result.resumedFrom).toBe(interruptedSize);
                expect(observedResumedFrom).toBe(interruptedSize);
                expect(result.reused).toBe(false);
                expect(existsSync(target)).toBe(true);
                expect(existsSync(`${target}.part`)).toBe(false);
                expect(await sha256File(target)).toBe(release.sha256);

                console.info(
                    `[download.realNetwork] interrupted a real ${String(release.size)}-byte download of ` +
                        `${release.fileName} at ${String(interruptedSize)} bytes (${(
                            (interruptedSize / release.size) *
                            100
                        ).toFixed(
                            1,
                        )}%), then resumed from byte ${String(result.resumedFrom)} and verified the ` +
                        `finished file against the real SHA-256 ${release.sha256}.`,
                );
            } finally {
                rmSync(dataDir, { recursive: true, force: true });
            }
        },
    );
});

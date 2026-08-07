import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

interface ReplacementEntry {
    readonly file: string;
}

interface FaultContext {
    readonly point: string;
    readonly index: number | undefined;
    readonly file: string | undefined;
}

interface FinalizerModule {
    readonly FINALIZATION_REPLACEMENTS: readonly ReplacementEntry[];
    readonly FINALIZER_TEST_FAULT_POINTS: {
        readonly afterBackup: string;
        readonly afterVerification: string;
        readonly beforeBackupCleanup: string;
    };
    finalizeText(file: string, text: string): string;
    verifyFinalText(file: string, text: string): void;
    runFinalizerForTest(options: {
        root: string;
        mode: string;
        fault?: (context: FaultContext) => void | Promise<void>;
    }): Promise<string>;
}

interface Fingerprint {
    readonly sha256: string;
    readonly mtimeNs: string;
}

const repositoryRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
let finalizer: FinalizerModule;

beforeAll(async () => {
    // @ts-expect-error This committed plain-JavaScript CLI intentionally has no declaration file.
    finalizer = await import("../../../../scripts/finalize-worldlens-repository.mjs");
});

async function createFixture(): Promise<string> {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "worldlens-finalizer-"));
    for (const { file } of finalizer.FINALIZATION_REPLACEMENTS) {
        const target = resolve(fixtureRoot, file);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(resolve(repositoryRoot, file), target);
    }
    return fixtureRoot;
}

async function fingerprint(root: string): Promise<Record<string, Fingerprint>> {
    const result: Record<string, Fingerprint> = {};
    for (const { file } of finalizer.FINALIZATION_REPLACEMENTS) {
        const path = resolve(root, file);
        const [contents, metadata] = await Promise.all([
            readFile(path),
            stat(path, { bigint: true }),
        ]);
        result[file] = {
            sha256: createHash("sha256").update(contents).digest("hex"),
            mtimeNs: metadata.mtimeNs.toString(),
        };
    }
    return result;
}

async function recoveryArtifacts(root: string): Promise<string[]> {
    const found: string[] = [];
    async function visit(directory: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) await visit(path);
            else if (entry.name.includes(".worldlens-finalize-")) found.push(path);
        }
    }
    await visit(root);
    return found.sort();
}

function injectedFault(point: string, index?: number) {
    return ({ point: actualPoint, index: actualIndex }: FaultContext): void => {
        if (actualPoint === point && (index === undefined || actualIndex === index)) {
            throw new Error(
                `Injected test fault at ${point}${index === undefined ? "" : `:${index}`}.`,
            );
        }
    };
}

async function withFixture(run: (fixtureRoot: string) => Promise<void>): Promise<void> {
    const fixtureRoot = await createFixture();
    try {
        await run(fixtureRoot);
    } finally {
        await rm(fixtureRoot, { force: true, recursive: true });
    }
}

describe("Worldlens repository finalizer filesystem transaction", () => {
    it("checks readiness without changing hashes, timestamps, or recovery artifacts", async () => {
        await withFixture(async (fixtureRoot) => {
            const before = await fingerprint(fixtureRoot);
            await expect(
                finalizer.runFinalizerForTest({ root: fixtureRoot, mode: "--check-ready" }),
            ).resolves.toBe(
                "Worldlens rename finalizer is ready for 8 files; no file was changed.",
            );
            expect(await fingerprint(fixtureRoot)).toEqual(before);
            expect(await recoveryArtifacts(fixtureRoot)).toEqual([]);
        });
    });

    it("applies and verifies all eight files, then removes transaction artifacts", async () => {
        await withFixture(async (fixtureRoot) => {
            await expect(
                finalizer.runFinalizerForTest({ root: fixtureRoot, mode: "--apply" }),
            ).resolves.toBe(
                "Finalized Worldlens repository identity in 8 files. Commit all changes together.",
            );
            await expect(
                finalizer.runFinalizerForTest({ root: fixtureRoot, mode: "--verify-final" }),
            ).resolves.toBe("Worldlens repository identity is final in 8 files.");
            expect(await recoveryArtifacts(fixtureRoot)).toEqual([]);
        });
    });

    it("rolls every file back exactly when installation fails after the fourth backup", async () => {
        await withFixture(async (fixtureRoot) => {
            const before = await fingerprint(fixtureRoot);
            await expect(
                finalizer.runFinalizerForTest({
                    root: fixtureRoot,
                    mode: "--apply",
                    fault: injectedFault(finalizer.FINALIZER_TEST_FAULT_POINTS.afterBackup, 3),
                }),
            ).rejects.toThrow("Injected test fault at after-backup:3.");
            expect(await fingerprint(fixtureRoot)).toEqual(before);
            expect(await recoveryArtifacts(fixtureRoot)).toEqual([]);
        });
    });

    it("rolls every file back exactly when failure follows successful verification", async () => {
        await withFixture(async (fixtureRoot) => {
            const before = await fingerprint(fixtureRoot);
            await expect(
                finalizer.runFinalizerForTest({
                    root: fixtureRoot,
                    mode: "--apply",
                    fault: injectedFault(finalizer.FINALIZER_TEST_FAULT_POINTS.afterVerification),
                }),
            ).rejects.toThrow("Injected test fault at after-verification.");
            expect(await fingerprint(fixtureRoot)).toEqual(before);
            expect(await recoveryArtifacts(fixtureRoot)).toEqual([]);
        });
    });

    it("keeps every finalized target and the remaining backups after committed cleanup fails", async () => {
        await withFixture(async (fixtureRoot) => {
            const original = await fingerprint(fixtureRoot);
            const retainedBackups = finalizer.FINALIZATION_REPLACEMENTS.slice(1).map(({ file }) =>
                resolve(fixtureRoot, file).concat(`.worldlens-finalize-backup-${process.pid}`),
            );
            const expectedMessage =
                "Worldlens finalization committed and every target remains finalized, but backup cleanup stopped at CONTRIBUTING.md. " +
                "No rollback was attempted. Retained backups for manual recovery: " +
                `${retainedBackups.join(", ")}. Review them, then remove them manually.`;

            let failure: unknown;
            try {
                await finalizer.runFinalizerForTest({
                    root: fixtureRoot,
                    mode: "--apply",
                    fault: injectedFault(
                        finalizer.FINALIZER_TEST_FAULT_POINTS.beforeBackupCleanup,
                        1,
                    ),
                });
            } catch (error) {
                failure = error;
            }
            expect(failure).toBeInstanceOf(AggregateError);
            expect((failure as AggregateError).message).toBe(expectedMessage);

            await expect(
                finalizer.runFinalizerForTest({ root: fixtureRoot, mode: "--verify-final" }),
            ).resolves.toBe("Worldlens repository identity is final in 8 files.");
            expect(await recoveryArtifacts(fixtureRoot)).toEqual(retainedBackups.sort());

            const firstTarget = resolve(fixtureRoot, finalizer.FINALIZATION_REPLACEMENTS[0]!.file);
            await expect(
                stat(`${firstTarget}.worldlens-finalize-backup-${process.pid}`),
            ).rejects.toMatchObject({ code: "ENOENT" });
            for (const [index, { file }] of finalizer.FINALIZATION_REPLACEMENTS.entries()) {
                const finalText = await readFile(resolve(fixtureRoot, file), "utf8");
                expect(() => finalizer.verifyFinalText(file, finalText)).not.toThrow();
                if (index > 0) {
                    const backup = await readFile(
                        `${resolve(fixtureRoot, file)}.worldlens-finalize-backup-${process.pid}`,
                    );
                    expect(createHash("sha256").update(backup).digest("hex")).toBe(
                        original[file]!.sha256,
                    );
                }
            }
        });
    });
});

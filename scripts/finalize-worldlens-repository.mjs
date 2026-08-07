#!/usr/bin/env node

import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FINALIZATION_REPLACEMENTS = Object.freeze([
    {
        file: "README.md",
        changes: [
            [
                "https://github.com/Ding-Ding-Projects/material-bluemap/releases/latest",
                "https://github.com/Ding-Ding-Projects/worldlens/releases/latest",
                1,
            ],
            [
                "https://github.com/Ding-Ding-Projects/material-bluemap/releases",
                "https://github.com/Ding-Ding-Projects/worldlens/releases",
                1,
            ],
            [
                "https://ding-ding-projects.github.io/material-bluemap/",
                "https://ding-ding-projects.github.io/worldlens/",
                3,
            ],
            [
                "https://github.com/Ding-Ding-Projects/material-bluemap.git",
                "https://github.com/Ding-Ding-Projects/worldlens.git",
                1,
            ],
            ["cd material-bluemap", "cd worldlens", 1],
            [
                "ding-ding-projects.github.io/material-bluemap",
                "ding-ding-projects.github.io/worldlens",
                1,
            ],
        ],
    },
    {
        file: "CONTRIBUTING.md",
        changes: [
            [
                "https://github.com/Ding-Ding-Projects/material-bluemap.git",
                "https://github.com/Ding-Ding-Projects/worldlens.git",
                1,
            ],
            ["cd material-bluemap", "cd worldlens", 1],
        ],
    },
    {
        file: "CODE_OF_CONDUCT.md",
        changes: [
            [
                "https://github.com/Ding-Ding-Projects/material-bluemap/issues",
                "https://github.com/Ding-Ding-Projects/worldlens/issues",
                1,
            ],
        ],
    },
    {
        file: "SECURITY.md",
        changes: [
            [
                "https://github.com/Ding-Ding-Projects/material-bluemap/security",
                "https://github.com/Ding-Ding-Projects/worldlens/security",
                1,
            ],
        ],
    },
    {
        file: "LICENSE",
        changes: [
            [
                "Copyright (c) material-bluemap contributors",
                "Copyright (c) Worldlens contributors",
                1,
            ],
        ],
    },
    {
        file: "design/LICENSE",
        changes: [
            [
                "Copyright (c) material-bluemap contributors",
                "Copyright (c) Worldlens contributors",
                1,
            ],
        ],
    },
    {
        file: "design/NOTICE",
        changes: [["material-bluemap", "Worldlens", 1]],
    },
    {
        file: "design/tools/regex-builder-reference/regex-builder.html",
        changes: [
            [
                "https://github.com/Ding-Ding-Projects/material-bluemap",
                "https://github.com/Ding-Ding-Projects/worldlens",
                4,
            ],
        ],
    },
]);

function occurrences(text, needle) {
    return text.split(needle).length - 1;
}

export function finalizeText(file, text) {
    const plan = FINALIZATION_REPLACEMENTS.find((entry) => entry.file === file);
    if (plan === undefined) throw new Error(`No Worldlens finalization plan exists for ${file}.`);
    let next = text;
    for (const [from, to, expected] of plan.changes) {
        const count = occurrences(next, from);
        if (count !== expected) {
            throw new Error(
                `${file}: expected ${expected} occurrence(s) of ${JSON.stringify(from)}, found ${count}.`,
            );
        }
        next = next.split(from).join(to);
    }
    return next;
}

export function verifyFinalText(file, text) {
    const plan = FINALIZATION_REPLACEMENTS.find((entry) => entry.file === file);
    if (plan === undefined) throw new Error(`No Worldlens finalization plan exists for ${file}.`);
    for (const [from, to, expected] of plan.changes) {
        if (occurrences(text, from) !== 0 || occurrences(text, to) < expected) {
            throw new Error(
                `${file}: rename-time replacement ${JSON.stringify(from)} -> ${JSON.stringify(to)} is incomplete.`,
            );
        }
    }
}

async function loadPlan(root) {
    return Promise.all(
        FINALIZATION_REPLACEMENTS.map(async ({ file }) => {
            const path = resolve(root, file);
            const current = await readFile(path, "utf8");
            return { file, path, current, finalized: finalizeText(file, current) };
        }),
    );
}

export const FINALIZER_TEST_FAULT_POINTS = Object.freeze({
    afterBackup: "after-backup",
    afterVerification: "after-verification",
    beforeBackupCleanup: "before-backup-cleanup",
});

async function invokeTestFault(testFault, point, index, file) {
    if (testFault !== undefined) await testFault({ point, index, file });
}

async function removeTemporaryFiles(staged) {
    const failures = [];
    for (const entry of staged) {
        try {
            await rm(entry.temporary, { force: true });
        } catch (error) {
            failures.push(error);
        }
    }
    return failures;
}

async function rollbackInstall(installed) {
    const failures = [];
    for (const entry of [...installed].reverse()) {
        try {
            await rm(entry.path, { force: true });
            await rename(entry.backup, entry.path);
        } catch (error) {
            failures.push(error);
        }
    }
    return failures;
}

async function executeFinalizer({ root, mode, testFault }) {
    if (mode === "--verify-final") {
        for (const { file } of FINALIZATION_REPLACEMENTS) {
            verifyFinalText(file, await readFile(resolve(root, file), "utf8"));
        }
        return `Worldlens repository identity is final in ${FINALIZATION_REPLACEMENTS.length} files.`;
    }
    if (mode !== "--check-ready" && mode !== "--apply") {
        throw new Error("Use --check-ready, --apply, or --verify-final.");
    }

    const plan = await loadPlan(root);
    if (mode === "--check-ready") {
        return `Worldlens rename finalizer is ready for ${plan.length} files; no file was changed.`;
    }

    const staged = [];
    try {
        for (const entry of plan) {
            const temporary = `${entry.path}.worldlens-finalize-${process.pid}`;
            await writeFile(temporary, entry.finalized, "utf8");
            staged.push({
                ...entry,
                temporary,
                backup: `${entry.path}.worldlens-finalize-backup-${process.pid}`,
            });
        }
    } catch (error) {
        const cleanupFailures = await removeTemporaryFiles(staged);
        if (cleanupFailures.length > 0) {
            throw new AggregateError(
                [error, ...cleanupFailures],
                "Worldlens finalization could not stage every replacement, and one or more temporary files could not be removed. Retained temporary paths end in .worldlens-finalize-<pid>.",
            );
        }
        throw error;
    }

    const installed = [];
    let transactionState = "prepared";
    try {
        for (const [index, entry] of staged.entries()) {
            await rm(entry.backup, { force: true });
            await rename(entry.path, entry.backup);
            installed.push(entry);
            await invokeTestFault(
                testFault,
                FINALIZER_TEST_FAULT_POINTS.afterBackup,
                index,
                entry.file,
            );
            await rename(entry.temporary, entry.path);
        }
        for (const { file, path } of plan) verifyFinalText(file, await readFile(path, "utf8"));
        await invokeTestFault(
            testFault,
            FINALIZER_TEST_FAULT_POINTS.afterVerification,
            undefined,
            undefined,
        );
        transactionState = "committed";
    } catch (error) {
        const rollbackFailures = await rollbackInstall(installed);
        const temporaryCleanupFailures = await removeTemporaryFiles(staged);
        if (rollbackFailures.length > 0 || temporaryCleanupFailures.length > 0) {
            throw new AggregateError(
                [error, ...rollbackFailures, ...temporaryCleanupFailures],
                "Worldlens finalization failed before commit, and one or more original or temporary files could not be restored or removed. Retained recovery paths end in .worldlens-finalize-backup-<pid> or .worldlens-finalize-<pid>.",
            );
        }
        throw error;
    }

    if (transactionState !== "committed") {
        throw new Error("Worldlens finalization reached an invalid transaction state.");
    }

    // The transaction is committed. Cleanup is deliberately outside the rollback catch above:
    // a cleanup-only failure must never remove an already-verified finalized target.
    const temporaryCleanupFailures = await removeTemporaryFiles(staged);
    if (temporaryCleanupFailures.length > 0) {
        throw new AggregateError(
            temporaryCleanupFailures,
            "Worldlens finalization committed and every target remains finalized, but temporary cleanup failed. No rollback was attempted. Review and remove retained .worldlens-finalize-<pid> files manually.",
        );
    }

    for (const [index, entry] of staged.entries()) {
        try {
            await invokeTestFault(
                testFault,
                FINALIZER_TEST_FAULT_POINTS.beforeBackupCleanup,
                index,
                entry.file,
            );
            await rm(entry.backup);
        } catch (error) {
            const retainedBackups = staged.slice(index).map(({ backup }) => backup);
            throw new AggregateError(
                [error],
                `Worldlens finalization committed and every target remains finalized, but backup cleanup stopped at ${entry.file}. No rollback was attempted. Retained backups for manual recovery: ${retainedBackups.join(
                    ", ",
                )}. Review them, then remove them manually.`,
            );
        }
    }

    return `Finalized Worldlens repository identity in ${plan.length} files. Commit all changes together.`;
}

/**
 * Test-only filesystem integration seam. Production CLI execution never accepts a fixture root
 * or fault hook, and no environment variable or command-line flag can enable fault injection.
 */
export async function runFinalizerForTest({ root, mode, fault }) {
    return executeFinalizer({ root: resolve(root), mode, testFault: fault });
}

async function main() {
    const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const mode = process.argv[2] ?? "--check-ready";
    console.log(await executeFinalizer({ root, mode }));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}

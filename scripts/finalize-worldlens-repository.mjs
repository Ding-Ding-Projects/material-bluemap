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

async function main() {
    const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const mode = process.argv[2] ?? "--check-ready";
    if (mode === "--verify-final") {
        for (const { file } of FINALIZATION_REPLACEMENTS) {
            verifyFinalText(file, await readFile(resolve(root, file), "utf8"));
        }
        console.log(
            `Worldlens repository identity is final in ${FINALIZATION_REPLACEMENTS.length} files.`,
        );
        return;
    }
    const plan = await loadPlan(root);
    if (mode === "--check-ready") {
        console.log(
            `Worldlens rename finalizer is ready for ${plan.length} files; no file was changed.`,
        );
        return;
    }
    if (mode !== "--apply") throw new Error("Use --check-ready, --apply, or --verify-final.");

    const staged = [];
    const backedUp = [];
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
        for (const entry of staged) {
            await rm(entry.backup, { force: true });
            await rename(entry.path, entry.backup);
            backedUp.push(entry);
            await rename(entry.temporary, entry.path);
        }
        for (const { file, path } of plan) verifyFinalText(file, await readFile(path, "utf8"));
        await Promise.all(backedUp.map(({ backup }) => rm(backup, { force: true })));
    } catch (error) {
        const rollbackFailures = [];
        for (const entry of backedUp.reverse()) {
            try {
                await rm(entry.path, { force: true });
                await rename(entry.backup, entry.path);
            } catch (rollbackError) {
                rollbackFailures.push(rollbackError);
            }
        }
        if (rollbackFailures.length > 0) {
            throw new AggregateError(
                [error, ...rollbackFailures],
                "Worldlens finalization failed and one or more original files could not be restored. Retained backup paths end in .worldlens-finalize-backup-<pid>.",
            );
        }
        throw error;
    } finally {
        await Promise.all(staged.map(({ temporary }) => rm(temporary, { force: true })));
    }
    console.log(
        `Finalized Worldlens repository identity in ${plan.length} files. Commit all changes together.`,
    );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}

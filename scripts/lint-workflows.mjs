#!/usr/bin/env node
/**
 * Guard the release steps whose data crosses from Actions expressions into an
 * executable script. Expressions belong in `env:` mappings; the script reads
 * the resulting variables as quoted data.
 *
 * actionlint checks known attacker-controlled contexts, but it cannot infer
 * that a step output was fetched from another repository. This project-level
 * guard therefore keeps a hand-written inventory of the release steps whose
 * dynamic inputs must never be interpolated into `run:` source.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const WATCHED_SCRIPT_STEPS = Object.freeze({
    ".github/workflows/ci.yml": Object.freeze([
        "Resolve dim sum code name",
        "Compose release notes",
        "Publish",
    ]),
});

const EXPRESSION = /\$\{\{(?<body>.*?)\}\}/g;
const SCRIPT_KEY_LINE = /^(?<indent>\s*)(?:-\s+)?(?<key>run|script):(?<rest>\s.*|\s*)$/;
const STEP_NAME_LINE = /^(?<indent>\s*)-\s+name:\s*(?<name>.+?)\s*$/;

function indentOf(line) {
    return line.length - line.trimStart().length;
}

function unquoteYamlScalar(value) {
    if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'")))
    ) {
        return value.slice(1, -1);
    }
    return value;
}

/** Return every `run:`/`script:` region and the closest owning named step. */
function scriptRegions(text) {
    const lines = text.split(/\r?\n/);
    const regions = [];
    let block = null;
    let currentStep = null;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        if (block) {
            const blank = line.trim() === "";
            if (blank || indentOf(line) > block.keyIndent) {
                if (!blank) block.lines.push({ number: index + 1, text: line });
                continue;
            }
            block = null;
        }

        const step = STEP_NAME_LINE.exec(line);
        if (step) {
            currentStep = {
                indent: step.groups.indent.length,
                name: unquoteYamlScalar(step.groups.name),
            };
        } else if (
            currentStep &&
            line.trim() !== "" &&
            !/^\s*#/.test(line) &&
            indentOf(line) <= currentStep.indent
        ) {
            currentStep = null;
        }

        if (/^\s*#/.test(line)) continue;
        const match = SCRIPT_KEY_LINE.exec(line);
        if (!match) continue;

        const value = match.groups.rest.trim();
        const region = {
            key: match.groups.key,
            keyLine: index + 1,
            keyIndent: match.groups.indent.length,
            stepName: currentStep?.name ?? null,
            lines: [],
        };

        if (/^[|>][+-]?\d*[+-]?\s*(?:#.*)?$/.test(value)) {
            block = region;
            regions.push(region);
        } else if (value !== "") {
            region.lines.push({ number: index + 1, text: line });
            regions.push(region);
        }
    }

    return regions;
}

function lintText(text, file, watchedSteps) {
    const regions = scriptRegions(text);
    const problems = [];

    for (const stepName of watchedSteps) {
        const matches = regions.filter((region) => region.stepName === stepName);
        if (matches.length !== 1) {
            problems.push({
                file,
                line: 1,
                stepName,
                expression: null,
                message: `watched step must exist exactly once with a script; found ${matches.length}`,
            });
            continue;
        }

        for (const { number, text: line } of matches[0].lines) {
            for (const match of line.matchAll(EXPRESSION)) {
                problems.push({
                    file,
                    line: number,
                    stepName,
                    expression: match.groups.body.trim(),
                    message: "Actions expression is interpolated into executable script text",
                });
            }
        }
    }

    return problems;
}

function lintInventory(root = process.cwd()) {
    const problems = [];
    for (const [relativePath, watchedSteps] of Object.entries(WATCHED_SCRIPT_STEPS)) {
        const file = resolve(root, relativePath);
        let text;
        try {
            text = readFileSync(file, "utf8");
        } catch (error) {
            problems.push({
                file: relativePath,
                line: 1,
                stepName: null,
                expression: null,
                message: `watched workflow cannot be read (${error.code ?? "unknown error"})`,
            });
            continue;
        }
        problems.push(...lintText(text, relativePath, watchedSteps));
    }
    return problems;
}

function main() {
    const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
    const problems = lintInventory(root);
    if (problems.length > 0) {
        for (const problem of problems) {
            const expression = problem.expression ? ` (${problem.expression})` : "";
            process.stderr.write(
                `${problem.file}:${problem.line}: ${problem.message}${expression}; ` +
                    "pass dynamic data through env and quote the shell variable\n",
            );
        }
        process.stderr.write(
            `lint-workflows: ${problems.length} unsafe or missing watched release boundary item(s)\n`,
        );
        process.exitCode = 1;
        return;
    }
    process.stdout.write(
        `lint-workflows: ${Object.keys(WATCHED_SCRIPT_STEPS).length} workflow and ` +
            `${Object.values(WATCHED_SCRIPT_STEPS).flat().length} watched release steps clean\n`,
    );
}

export { WATCHED_SCRIPT_STEPS, lintInventory, lintText, scriptRegions };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main();
}

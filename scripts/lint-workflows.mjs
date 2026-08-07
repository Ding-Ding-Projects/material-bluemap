#!/usr/bin/env node
/**
 * Guard the release steps whose data crosses from Actions expressions into an
 * executable script. Each watched value has one declared provenance, enters via
 * `env:`, and is consumed only as quoted data by a non-executing sink.
 *
 * actionlint checks known attacker-controlled contexts, but it cannot infer
 * that a step output was fetched from another repository. This project-level
 * guard therefore keeps a hand-written inventory of the exact release steps and
 * expressions that form this repository's boundary.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const WATCHED_SCRIPT_STEPS = Object.freeze({
    ".github/workflows/ci.yml": Object.freeze({
        "Resolve dim sum code name": Object.freeze({
            ORDINAL: "steps.tag.outputs.ordinal",
        }),
        "Compose release notes": Object.freeze({
            DISH_NAME_EN: "steps.dish.outputs.dish_name_en",
            DISH_NAME_ZH: "steps.dish.outputs.dish_name_zh",
            DISH_ALT_EN: "steps.dish.outputs.dish_alt_en",
            DISH_FILE_NAME: "steps.dish.outputs.dish_file_name",
            DISH_VOLUME: "steps.dish.outputs.dish_volume",
            RELEASE_TAG: "steps.tag.outputs.tag",
            SPLIT: "steps.split.outputs.split",
            SPLIT_NAMES: "steps.split.outputs.names",
        }),
        Publish: Object.freeze({
            BLUEMAP_VERSION: "needs.jars.outputs.version",
            RELEASE_TAG: "steps.tag.outputs.tag",
        }),
    }),
});

const EXPRESSION = /\$\{\{(?<body>[\s\S]*?)\}\}/g;
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

function stepRanges(lines) {
    const steps = [];
    for (let index = 0; index < lines.length; index++) {
        const match = STEP_NAME_LINE.exec(lines[index]);
        if (!match) continue;
        const indent = match.groups.indent.length;
        let end = lines.length;
        for (let next = index + 1; next < lines.length; next++) {
            const candidate = STEP_NAME_LINE.exec(lines[next]);
            if (candidate && candidate.groups.indent.length <= indent) {
                end = next;
                break;
            }
        }
        steps.push({
            name: unquoteYamlScalar(match.groups.name),
            start: index,
            end,
            indent,
        });
    }
    return steps;
}

/** Return every literal `run:`/`script:` region and the closest owning named step. */
function scriptRegions(text) {
    const lines = text.split(/\r?\n/);
    const ranges = stepRanges(lines);
    const regions = [];
    let block = null;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (block) {
            const blank = line.trim() === "";
            if (blank || indentOf(line) > block.keyIndent) {
                block.lines.push({ number: index + 1, text: line });
                continue;
            }
            block = null;
        }
        if (/^\s*#/.test(line)) continue;

        const match = SCRIPT_KEY_LINE.exec(line);
        if (!match) continue;
        const owner = ranges.find((range) => index > range.start && index < range.end);
        const value = match.groups.rest.trim();
        const region = {
            key: match.groups.key,
            keyLine: index + 1,
            keyIndent: match.groups.indent.length,
            stepName: owner?.name ?? null,
            stepStart: owner?.start ?? null,
            stepEnd: owner?.end ?? null,
            rawValue: value,
            lines: [],
        };

        if (/^[|>][+-]?\d*[+-]?\s*(?:#.*)?$/.test(value)) {
            block = region;
        } else {
            // For an inline script, lint the YAML value rather than the whole
            // `run:` declaration so command-position checks see the shell source.
            region.lines.push({ number: index + 1, text: value });
        }
        regions.push(region);
    }
    return regions;
}

function expressionProblems(region, file) {
    const script = region.lines.map((line) => line.text).join("\n");
    const problems = [];
    for (const match of script.matchAll(EXPRESSION)) {
        const prefix = script.slice(0, match.index);
        const lineOffset = (prefix.match(/\n/g) ?? []).length;
        problems.push({
            file,
            line: (region.lines[0]?.number ?? region.keyLine) + lineOffset,
            stepName: region.stepName,
            expression: match.groups.body.replace(/\s+/g, " ").trim(),
            message: "Actions expression is interpolated into executable script text",
        });
    }
    return problems;
}

function isDoubleQuotedAt(text, index) {
    let single = false;
    let double = false;
    let escaped = false;
    for (let position = text.lastIndexOf("\n", index - 1) + 1; position < index; position++) {
        const character = text[position];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (character === "\\" && !single) {
            escaped = true;
        } else if (character === "'" && !double) {
            single = !single;
        } else if (character === '"' && !single) {
            double = !double;
        }
    }
    return double && !single;
}

function variableProblems(region, file, expectedBindings) {
    const script = region.lines.map((line) => line.text).join("\n");
    const problems = [];
    for (const variable of Object.keys(expectedBindings)) {
        const reference = new RegExp(`\\$(?:\\{${variable}\\}|${variable}\\b)`, "g");
        const matches = [...script.matchAll(reference)];
        if (matches.length === 0) {
            problems.push({
                file,
                line: region.keyLine,
                stepName: region.stepName,
                expression: null,
                message: `watched environment variable ${variable} is never consumed`,
            });
            continue;
        }

        for (const match of matches) {
            const prefix = script.slice(0, match.index);
            const lineOffset = (prefix.match(/\n/g) ?? []).length;
            const line = script.split("\n")[lineOffset];
            const previousLine = lineOffset > 0 ? script.split("\n")[lineOffset - 1] : "";
            const lineNumber = (region.lines[0]?.number ?? region.keyLine) + lineOffset;
            if (!isDoubleQuotedAt(script, match.index)) {
                problems.push({
                    file,
                    line: lineNumber,
                    stepName: region.stepName,
                    expression: null,
                    message: `${variable} must be read inside double quotes`,
                });
            }

            const escapedVariable = `\\$(?:\\{${variable}\\}|${variable}\\b)`;
            const executionSinks = [
                new RegExp(`\\beval\\b[^\\n]*${escapedVariable}`),
                new RegExp(`\\b(?:bash|sh)\\s+-c\\b[^\\n]*${escapedVariable}`),
                new RegExp(`(?:^|[;&|]\\s*)\\s*source\\s+[^\\n]*${escapedVariable}`),
                new RegExp(`(?:^|[;&|]\\s*)\\s*\\.\\s+[^\\n]*${escapedVariable}`),
                new RegExp("`[^`]*" + escapedVariable + "[^`]*`"),
                new RegExp(`\\$\\([^\\n)]*${escapedVariable}[^\\n)]*\\)`),
            ];
            const trimmed = line.trimStart();
            const commandPosition =
                !previousLine.trimEnd().endsWith("\\") &&
                [
                    `$${variable}`,
                    `\${${variable}}`,
                    `"$${variable}`,
                    `"\${${variable}}`,
                ].some((prefix) => trimmed.startsWith(prefix));
            if (commandPosition || executionSinks.some((sink) => sink.test(line))) {
                problems.push({
                    file,
                    line: lineNumber,
                    stepName: region.stepName,
                    expression: null,
                    message: `${variable} reaches a shell execution sink instead of a data-only sink`,
                });
            }
        }
    }
    return problems;
}

function bindingProblems(lines, region, file, expectedBindings) {
    const stepLines = lines.slice(region.stepStart, region.stepEnd);
    const problems = [];
    for (const [variable, expression] of Object.entries(expectedBindings)) {
        const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const canonical = new RegExp(`^\\s+${variable}:\\s*\\$\\{\\{\\s*${escaped}\\s*\\}\\}\\s*$`);
        const count = stepLines.filter((line) => canonical.test(line)).length;
        if (count !== 1) {
            problems.push({
                file,
                line: (region.stepStart ?? 0) + 1,
                stepName: region.stepName,
                expression,
                message: `expected exactly one canonical env binding for ${variable}; found ${count}`,
            });
        }
    }
    return problems;
}

function lintText(text, file, watchedSteps) {
    const lines = text.split(/\r?\n/);
    const regions = scriptRegions(text);
    const problems = [];

    for (const [stepName, expectedBindings] of Object.entries(watchedSteps)) {
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
        const region = matches[0];
        if (/^[*&]/.test(region.rawValue)) {
            problems.push({
                file,
                line: region.keyLine,
                stepName,
                expression: null,
                message: "watched scripts may not use YAML anchors or aliases",
            });
            continue;
        }
        problems.push(...expressionProblems(region, file));
        problems.push(...bindingProblems(lines, region, file, expectedBindings));
        problems.push(...variableProblems(region, file, expectedBindings));
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
            process.stderr.write(`${problem.file}:${problem.line}: ${problem.message}${expression}\n`);
        }
        process.stderr.write(
            `lint-workflows: ${problems.length} unsafe or missing watched release boundary item(s)\n`,
        );
        process.exitCode = 1;
        return;
    }
    const stepCount = Object.values(WATCHED_SCRIPT_STEPS).reduce(
        (total, steps) => total + Object.keys(steps).length,
        0,
    );
    process.stdout.write(
        `lint-workflows: ${Object.keys(WATCHED_SCRIPT_STEPS).length} workflow and ` +
            `${stepCount} watched release steps clean\n`,
    );
}

export { WATCHED_SCRIPT_STEPS, lintInventory, lintText, scriptRegions };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main();
}

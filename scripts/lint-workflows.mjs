#!/usr/bin/env node
/**
 * Fail-closed contract for dynamic values in the three release scripts.
 * Every dynamic env key, its Actions-expression provenance, and every exact
 * script line allowed to read it are inventoried below. Anything else fails.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const secretChain =
  "secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN";
const contract = (expression, uses = [], implicit = false) =>
  Object.freeze({ expression, uses: Object.freeze(uses), implicit });

const WATCHED_SCRIPT_STEPS = Object.freeze({
  ".github/workflows/ci.yml": Object.freeze({
    "Resolve dim sum code name": Object.freeze({
      GH_TOKEN: contract(secretChain, [], true),
      ORDINAL: contract("steps.tag.outputs.ordinal", [
        'node scripts/pick-dim-sum.mjs --ordinal "$ORDINAL" --out dim-sum-out',
      ]),
    }),
    "Compose release notes": Object.freeze({
      DISH_NAME_EN: contract("steps.dish.outputs.dish_name_en", [
        'if [ -n "$DISH_NAME_EN" ]; then',
        'printf \'**Code name: %s · %s**\\n\\n\' "$DISH_NAME_EN" "$DISH_NAME_ZH"',
      ]),
      DISH_NAME_ZH: contract("steps.dish.outputs.dish_name_zh", [
        'printf \'**Code name: %s · %s**\\n\\n\' "$DISH_NAME_EN" "$DISH_NAME_ZH"',
      ]),
      DISH_ALT_EN: contract("steps.dish.outputs.dish_alt_en", [
        '"$DISH_ALT_EN" "$GITHUB_REPOSITORY" "$RELEASE_TAG" "$DISH_FILE_NAME"',
      ]),
      DISH_FILE_NAME: contract("steps.dish.outputs.dish_file_name", [
        '"$DISH_ALT_EN" "$GITHUB_REPOSITORY" "$RELEASE_TAG" "$DISH_FILE_NAME"',
      ]),
      DISH_VOLUME: contract("steps.dish.outputs.dish_volume", [
        '"$DISH_VOLUME"',
      ]),
      RELEASE_TAG: contract("steps.tag.outputs.tag", [
        '"$DISH_ALT_EN" "$GITHUB_REPOSITORY" "$RELEASE_TAG" "$DISH_FILE_NAME"',
      ]),
      SPLIT: contract("steps.split.outputs.split", [
        'if [ "$SPLIT" = "1" ]; then',
      ]),
      SPLIT_NAMES: contract("steps.split.outputs.names", ['"$SPLIT_NAMES"']),
    }),
    Publish: Object.freeze({
      GH_TOKEN: contract(secretChain, [], true),
      BLUEMAP_VERSION: contract("needs.jars.outputs.version", [
        'jars="bluemap-server-plugins-${BLUEMAP_VERSION}"',
        "printf 'BlueMap %s server plugins\\n\\n' \"$BLUEMAP_VERSION\"",
      ]),
      RELEASE_TAG: contract("steps.tag.outputs.tag", [
        'extras="material-bluemap-${RELEASE_TAG}-extras"',
        "printf 'material-bluemap %s - extras\\n\\n' \"$RELEASE_TAG\"",
        'gh release create "$RELEASE_TAG" \\',
        '--title "material-bluemap $RELEASE_TAG" \\',
        'gh release edit "$RELEASE_TAG" \\',
        'gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --json body --jq .body \\',
        'gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --json isDraft,assets \\',
      ]),
    }),
  }),
});

const EXPRESSION = /\$\{\{(?<body>[\s\S]*?)\}\}/g;
const SCRIPT_KEY_LINE =
  /^(?<indent>\s*)(?:-\s+)?(?<key>run|script):(?<rest>\s.*|\s*)$/;
const STEP_NAME_LINE = /^(?<indent>\s*)-\s+name:\s*(?<name>.+?)\s*$/;

const indentOf = (line) => line.length - line.trimStart().length;
const unquote = (value) =>
  value.length >= 2 &&
  ((value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")))
    ? value.slice(1, -1)
    : value;

function stepRanges(lines) {
  const ranges = [];
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
    ranges.push({ name: unquote(match.groups.name), start: index, end });
  }
  return ranges;
}

function scriptRegions(text) {
  const lines = text.split(/\r?\n/);
  const ranges = stepRanges(lines);
  const regions = [];
  let block = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (block) {
      if (line.trim() === "" || indentOf(line) > block.keyIndent) {
        block.lines.push({ number: index + 1, text: line });
        continue;
      }
      block = null;
    }
    if (/^\s*#/.test(line)) continue;
    const match = SCRIPT_KEY_LINE.exec(line);
    if (!match) continue;
    const owner = ranges.find(
      (range) => index > range.start && index < range.end,
    );
    const rawValue = match.groups.rest.trim();
    const region = {
      keyLine: index + 1,
      keyIndent: match.groups.indent.length,
      stepName: owner?.name ?? null,
      stepStart: owner?.start ?? null,
      stepEnd: owner?.end ?? null,
      rawValue,
      lines: [],
    };
    if (/^[|>][+-]?\d*[+-]?\s*(?:#.*)?$/.test(rawValue)) block = region;
    else region.lines.push({ number: index + 1, text: rawValue });
    regions.push(region);
  }
  return regions;
}

function expressionProblems(region, file) {
  const script = region.lines.map((line) => line.text).join("\n");
  return [...script.matchAll(EXPRESSION)].map((match) => ({
    file,
    line:
      (region.lines[0]?.number ?? region.keyLine) +
      (script.slice(0, match.index).match(/\n/g) ?? []).length,
    stepName: region.stepName,
    expression: match.groups.body.replace(/\s+/g, " ").trim(),
    message: "Actions expression is interpolated into executable script text",
  }));
}

function bindingProblems(lines, region, file, expected) {
  const stepLines = lines.slice(region.stepStart, region.stepEnd);
  const problems = [];
  for (const [key, spec] of Object.entries(expected)) {
    const escaped = spec.expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const canonical = new RegExp(
      `^\\s+${key}:\\s*\\$\\{\\{\\s*${escaped}\\s*\\}\\}\\s*$`,
    );
    const count = stepLines.filter((line) => canonical.test(line)).length;
    if (count !== 1) {
      problems.push({
        file,
        line: (region.stepStart ?? 0) + 1,
        stepName: region.stepName,
        expression: spec.expression,
        message: `expected one canonical dynamic env binding for ${key}; found ${count}`,
      });
    }
  }
  const declared = stepLines.flatMap((line, offset) => {
    const match =
      /^\s+([A-Za-z_][A-Za-z0-9_]*):\s*\$\{\{\s*(.*?)\s*\}\}\s*$/.exec(line);
    return match
      ? [
          {
            key: match[1],
            body: match[2],
            line: (region.stepStart ?? 0) + offset + 1,
          },
        ]
      : [];
  });
  for (const item of declared) {
    if (!Object.hasOwn(expected, item.key)) {
      problems.push({
        file,
        line: item.line,
        stepName: region.stepName,
        expression: item.body,
        message: `undeclared dynamic environment binding ${item.key}`,
      });
    }
  }
  const allCount = [...stepLines.join("\n").matchAll(EXPRESSION)].length;
  const scriptCount = [
    ...region.lines
      .map((line) => line.text)
      .join("\n")
      .matchAll(EXPRESSION),
  ].length;
  if (allCount - scriptCount !== Object.keys(expected).length) {
    problems.push({
      file,
      line: (region.stepStart ?? 0) + 1,
      stepName: region.stepName,
      expression: null,
      message: `dynamic expression inventory mismatch: expected ${Object.keys(expected).length}, found ${allCount - scriptCount}`,
    });
  }
  return problems;
}

function useProblems(region, file, expected) {
  const script = region.lines.map((line) => line.text).join("\n");
  const problems = [];
  for (const [variable, spec] of Object.entries(expected)) {
    const references = [
      ...script.matchAll(
        new RegExp(`\\$(?:\\{${variable}\\}|${variable}\\b)`, "g"),
      ),
    ];
    const actual = references.map((match) => {
      const lineOffset = (script.slice(0, match.index).match(/\n/g) ?? [])
        .length;
      return script.split("\n")[lineOffset].trim();
    });
    const wanted = [...spec.uses];
    actual.sort();
    wanted.sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      problems.push({
        file,
        line: region.keyLine,
        stepName: region.stepName,
        expression: spec.expression,
        message: spec.implicit
          ? `${variable} is implicit-only and may not appear in script text`
          : `${variable} must appear only in its exact approved data-use lines`,
      });
    }
  }
  return problems;
}

function lintText(text, file, watchedSteps) {
  const lines = text.split(/\r?\n/);
  const regions = scriptRegions(text);
  const problems = [];
  for (const [stepName, expected] of Object.entries(watchedSteps)) {
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
    problems.push(...bindingProblems(lines, region, file, expected));
    problems.push(...useProblems(region, file, expected));
  }
  return problems;
}

function lintInventory(root = process.cwd()) {
  const problems = [];
  for (const [relativePath, watched] of Object.entries(WATCHED_SCRIPT_STEPS)) {
    try {
      problems.push(
        ...lintText(
          readFileSync(resolve(root, relativePath), "utf8"),
          relativePath,
          watched,
        ),
      );
    } catch (error) {
      problems.push({
        file: relativePath,
        line: 1,
        stepName: null,
        expression: null,
        message: `watched workflow cannot be read (${error.code ?? "unknown error"})`,
      });
    }
  }
  return problems;
}

function main() {
  const problems = lintInventory(
    process.argv[2] ? resolve(process.argv[2]) : process.cwd(),
  );
  if (problems.length) {
    for (const problem of problems) {
      process.stderr.write(
        `${problem.file}:${problem.line}: ${problem.message}${problem.expression ? ` (${problem.expression})` : ""}\n`,
      );
    }
    process.stderr.write(
      `lint-workflows: ${problems.length} release boundary problem(s)\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      "lint-workflows: 1 workflow and 3 watched release steps clean\n",
    );
  }
}

export { WATCHED_SCRIPT_STEPS, lintInventory, lintText, scriptRegions };

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();

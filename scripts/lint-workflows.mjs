#!/usr/bin/env node
/**
 * Fail-closed contract for dynamic values in the three release scripts.
 * Every dynamic env key, its Actions-expression provenance, and every exact
 * script line allowed to read it are inventoried below. Anything else fails.
 */

import { createHash } from "node:crypto";
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
        'extras="worldlens-${RELEASE_TAG}-extras"',
        "printf 'Worldlens %s - extras\\n\\n' \"$RELEASE_TAG\"",
        'gh release create "$RELEASE_TAG" \\',
        '--title "Worldlens $RELEASE_TAG" \\',
        'gh release edit "$RELEASE_TAG" \\',
        'gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --json body --jq .body \\',
        'gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --json isDraft,assets \\',
      ]),
    }),
  }),
});

const WATCHED_STEP_FINGERPRINTS = Object.freeze({
  ".github/workflows/ci.yml": Object.freeze({
    "Resolve dim sum code name": Object.freeze({
      env: "ac9ce0136bb0c6611abee76c2b2cc24d3380b23f7dc6d660f03b4977280fc471",
      run: "e8b171b7170173016649dfb65ae654678e711f93fcd0b2b0795226f4036dc3ca",
    }),
    "Compose release notes": Object.freeze({
      env: "caed41d074403c32376a58e8f01edc7c6e03a0b181235c85078eaccf819e9ca5",
      run: "c2caf3f7ad7aec29373a50dc29be218ff8492e2846c0f3baa262c3720baa94a2",
    }),
    Publish: Object.freeze({
      env: "f951560bc01336f0c08b2b8fc66f8b9bc7745b1593b3560718edb128c9f3b823",
      run: "af16d0b8b87cfc2564dbca37bd489909047b7e9dd552e9cd55a332ce6ddf9eb5",
    }),
  }),
});

const RELEASE_JOB_FINGERPRINT =
  "20e55262565f1d57cf9402404320fd6717a037d9563dac7f1d6e490f2fd6882f";

const PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 7,
  }),
  "actions/setup-node": Object.freeze({
    sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
    count: 7,
  }),
  "actions/setup-java": Object.freeze({
    sha: "cf277c60eb25467037889841efdb72551f06f6c3",
    count: 2,
  }),
  "actions/upload-artifact": Object.freeze({
    sha: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    count: 5,
  }),
  "actions/download-artifact": Object.freeze({
    sha: "d3f86a106a0bac45b974a628896c90dbdf5c8093",
    count: 9,
  }),
  "pnpm/action-setup": Object.freeze({
    sha: "f40ffcd9367d9f12939873eb1018b921a783ffaa",
    count: 6,
  }),
});

const BUILD_JARS_PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 1,
  }),
  "actions/setup-node": Object.freeze({
    sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
    count: 1,
  }),
  "actions/setup-java": Object.freeze({
    sha: "cf277c60eb25467037889841efdb72551f06f6c3",
    count: 2,
  }),
  "actions/upload-artifact": Object.freeze({
    sha: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    count: 8,
  }),
  "gradle/actions/setup-gradle": Object.freeze({
    sha: "0b6dd653ba04f4f93bf581ec31e66cbd7dcb644d",
    count: 1,
  }),
});

const ACTION_INVENTORIES = Object.freeze({
  ".github/workflows/ci.yml": PINNED_ACTIONS,
  ".github/workflows/build-jars.yml": BUILD_JARS_PINNED_ACTIONS,
});

const REQUIRED_STEP_LINES = Object.freeze({
  "Guard executable workflow expressions and release metadata": Object.freeze([
    "node --test scripts/lint-workflows.test.mjs scripts/pick-dim-sum.test.mjs",
    "node scripts/lint-workflows.mjs",
  ]),
  "Resolve release tag": Object.freeze([
    'if [[ ! "$version" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then',
    'if [[ ! "$GITHUB_RUN_NUMBER" =~ ^[1-9][0-9]{0,17}$ ]]; then',
    'if [[ ! "$count" =~ ^[0-9]{1,6}$ ]] || [ "$count" -gt 999999 ]; then',
    "printf 'tag=%s\\n' \"$tag\"",
    "printf 'version=%s\\n' \"$version\"",
    "printf 'ordinal=%s\\n' \"$ordinal\"",
  ]),
  "Stamp this build's version": Object.freeze([
    "if ($base -notmatch '^[0-9]+\\.[0-9]+$') {",
    "if ($env:GITHUB_RUN_NUMBER -notmatch '^[1-9][0-9]{0,17}$') {",
    '"version=$version" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append',
  ]),
  "Stage the CLI jar to bundle": Object.freeze([
    "$actual = (Get-FileHash -LiteralPath $jar.FullName -Algorithm SHA256).Hash.ToLowerInvariant()",
    "if ($actual -ne $record[0].sha256) {",
  ]),
  "Verify installer and test-world artifact provenance": Object.freeze([
    "(cd installer-out && sha256sum -c installer-out.sha256.txt)",
    "(cd world-out && sha256sum -c test-world.sha256.txt)",
  ]),
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

function normalizeBlock(lines) {
  const content = lines.map((line) => line.text.replace(/[ \t]+$/u, ""));
  while (content.length > 0 && content[0].trim() === "") content.shift();
  while (content.length > 0 && content.at(-1).trim() === "") content.pop();
  const indents = content
    .filter((line) => line.trim() !== "")
    .map((line) => indentOf(line));
  const commonIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return content
    .map((line) => (line.trim() === "" ? "" : line.slice(commonIndent)))
    .join("\n");
}

function envBlock(lines, region) {
  if (region.stepStart === null || region.stepEnd === null) return null;
  const indexes = [];
  for (let index = region.stepStart + 1; index < region.stepEnd; index++) {
    if (/^\s+env:\s*$/.test(lines[index])) indexes.push(index);
  }
  if (indexes.length !== 1) return null;
  const start = indexes[0];
  const indent = indentOf(lines[start]);
  const block = [];
  for (let index = start + 1; index < region.stepEnd; index++) {
    if (lines[index].trim() !== "" && indentOf(lines[index]) <= indent) break;
    block.push({ number: index + 1, text: lines[index] });
  }
  return block;
}

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

function stepFingerprint(text, stepName) {
  const lines = text.split(/\r?\n/);
  const regions = scriptRegions(text).filter(
    (region) => region.stepName === stepName,
  );
  if (regions.length !== 1) return null;
  const env = envBlock(lines, regions[0]);
  if (env === null) return null;
  return {
    env: sha256(normalizeBlock(env)),
    run: sha256(normalizeBlock(regions[0].lines)),
  };
}

function jobBlock(lines, jobName) {
  const start = lines.findIndex(
    (line) => line === `  ${jobName}:` || line === `  ${jobName}: `,
  );
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return {
    start,
    end,
    lines: lines
      .slice(start, end)
      .map((text, offset) => ({ number: start + offset + 1, text })),
  };
}

function jobFingerprint(text, jobName) {
  const block = jobBlock(text.split(/\r?\n/), jobName);
  return block ? sha256(normalizeBlock(block.lines)) : null;
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

function lintText(text, file, watchedSteps, fingerprints = null) {
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
    const wantedFingerprint = fingerprints?.[stepName];
    if (wantedFingerprint) {
      const actualFingerprint = stepFingerprint(text, stepName);
      for (const part of ["env", "run"]) {
        if (
          actualFingerprint?.[part] !== wantedFingerprint[part] ||
          !/^[0-9a-f]{64}$/.test(wantedFingerprint[part])
        ) {
          problems.push({
            file,
            line: region.keyLine,
            stepName,
            expression: null,
            message: `watched ${part} block changed outside its reviewed SHA-256 contract`,
          });
        }
      }
    }
  }
  return problems;
}

function actionDependencyProblems(text, file) {
  const lines = text.split(/\r?\n/);
  const problems = [];
  const seen = new Map();
  const inventory = ACTION_INVENTORIES[file] ?? {};
  for (let index = 0; index < lines.length; index++) {
    const match = /^\s*(?:-\s+)?uses:\s+([^\s#]+)(?:\s+#.*)?$/.exec(
      lines[index],
    );
    if (!match || match[1].startsWith("./")) continue;
    const [name, revision] = match[1].split("@");
    const expected = inventory[name];
    if (!expected || revision !== expected.sha) {
      problems.push({
        file,
        line: index + 1,
        stepName: null,
        expression: null,
        message: `external action ${match[1]} is not in the exact SHA inventory`,
      });
      continue;
    }
    seen.set(name, (seen.get(name) ?? 0) + 1);

    if (name === "actions/checkout") {
      const indent = indentOf(lines[index]);
      let end = lines.length;
      for (let next = index + 1; next < lines.length; next++) {
        if (
          indentOf(lines[next]) === indent &&
          /^\s*-\s+(?:name|uses):/.test(lines[next])
        ) {
          end = next;
          break;
        }
      }
      const credentialGuards = lines
        .slice(index + 1, end)
        .filter((line) => /^\s+persist-credentials:\s+false\s*$/.test(line));
      if (credentialGuards.length !== 1) {
        problems.push({
          file,
          line: index + 1,
          stepName: null,
          expression: null,
          message:
            "each checkout step must erase its credential with persist-credentials: false",
        });
      }
    }
  }

  for (const [name, expected] of Object.entries(inventory)) {
    const count = seen.get(name) ?? 0;
    if (count !== expected.count) {
      problems.push({
        file,
        line: 1,
        stepName: null,
        expression: null,
        message: `external action inventory expected ${expected.count} uses of ${name}; found ${count}`,
      });
    }
  }

  if (file !== ".github/workflows/ci.yml") return problems;

  const release = jobBlock(lines, "release");
  const releaseStart = release?.start ?? -1;
  const releaseEnd = release?.end ?? lines.length;
  const expectedReleaseNeeds =
    "needs: [check, workflows, package, jars, test-world, config-java-roundtrip]";
  const releaseNeeds =
    releaseStart < 0
      ? []
      : lines
          .slice(releaseStart + 1, releaseEnd)
          .map((line) => line.trim())
          .filter((line) => line.startsWith("needs:"));
  if (releaseNeeds.length !== 1 || releaseNeeds[0] !== expectedReleaseNeeds) {
    problems.push({
      file,
      line: releaseStart + 1 || 1,
      stepName: null,
      expression: null,
      message:
        "release must depend on every required build and workflow-security gate",
    });
  }

  const actualReleaseFingerprint = jobFingerprint(text, "release");
  if (
    actualReleaseFingerprint !== RELEASE_JOB_FINGERPRINT ||
    !/^[0-9a-f]{64}$/.test(RELEASE_JOB_FINGERPRINT)
  ) {
    problems.push({
      file,
      line: releaseStart + 1 || 1,
      stepName: null,
      expression: null,
      message:
        "complete release job changed outside its reviewed SHA-256 contract",
    });
  }

  for (const region of scriptRegions(text).filter(
    (candidate) =>
      candidate.keyLine > releaseStart + 1 && candidate.keyLine <= releaseEnd,
  )) {
    problems.push(...expressionProblems(region, file));
  }

  const regions = scriptRegions(text);
  for (const [stepName, requiredLines] of Object.entries(REQUIRED_STEP_LINES)) {
    const region = regions.find((candidate) => candidate.stepName === stepName);
    const commands = region?.lines.map((line) => line.text.trim()) ?? [];
    for (const command of requiredLines) {
      if (commands.filter((line) => line === command).length !== 1) {
        problems.push({
          file,
          line: region?.keyLine ?? 1,
          stepName: region?.stepName ?? stepName,
          expression: null,
          message: `security contract must run exactly once: ${command}`,
        });
      }
    }
  }
  return problems;
}

function lintInventory(root = process.cwd()) {
  const problems = [];
  for (const [relativePath, watched] of Object.entries(WATCHED_SCRIPT_STEPS)) {
    try {
      const text = readFileSync(resolve(root, relativePath), "utf8");
      problems.push(
        ...lintText(
          text,
          relativePath,
          watched,
          WATCHED_STEP_FINGERPRINTS[relativePath],
        ),
      );
      problems.push(...actionDependencyProblems(text, relativePath));
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
  for (const relativePath of Object.keys(ACTION_INVENTORIES).filter(
    (path) => !Object.hasOwn(WATCHED_SCRIPT_STEPS, path),
  )) {
    try {
      problems.push(
        ...actionDependencyProblems(
          readFileSync(resolve(root, relativePath), "utf8"),
          relativePath,
        ),
      );
    } catch (error) {
      problems.push({
        file: relativePath,
        line: 1,
        stepName: null,
        expression: null,
        message: `action inventory workflow cannot be read (${error.code ?? "unknown error"})`,
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
      "lint-workflows: 2 workflows, 49 pinned actions and 3 watched release steps clean\n",
    );
  }
}

export {
  PINNED_ACTIONS,
  RELEASE_JOB_FINGERPRINT,
  ACTION_INVENTORIES,
  WATCHED_SCRIPT_STEPS,
  WATCHED_STEP_FINGERPRINTS,
  actionDependencyProblems,
  lintInventory,
  lintText,
  scriptRegions,
  jobFingerprint,
  stepFingerprint,
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();

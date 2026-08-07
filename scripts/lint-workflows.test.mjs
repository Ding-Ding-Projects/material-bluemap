import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ACTION_INVENTORIES,
  PINNED_ACTIONS,
  WATCHED_SCRIPT_STEPS,
  WATCHED_STEP_FINGERPRINTS,
  actionDependencyProblems,
  lintText,
  scriptRegions,
  stepFingerprint,
} from "./lint-workflows.mjs";

const FILE = ".github/workflows/ci.yml";
const BUILD_JARS_FILE = ".github/workflows/build-jars.yml";
const WATCHED = WATCHED_SCRIPT_STEPS[FILE];
const ONE_INPUT = {
  Publish: {
    NAME: {
      expression: "steps.dish.outputs.name",
      uses: ["printf '%s\\n' \"$NAME\""],
      implicit: false,
    },
  },
};

function workflowAt(revision) {
  return execFileSync("git", ["show", `${revision}:${FILE}`], {
    encoding: "utf8",
  });
}

function rawExpressionProblems(problems) {
  return problems.filter((problem) =>
    problem.message.startsWith("Actions expression is interpolated"),
  );
}

function oneStep({
  env = "NAME: ${{ steps.dish.outputs.name }}",
  run = "printf '%s\\n' \"$NAME\"",
}) {
  return `jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        env:\n          ${env}\n        run: ${run}\n`;
}

test("the exact recovered workflow fails at its original 11 executable expression sites", () => {
  const problems = lintText(workflowAt("98988e3"), FILE, WATCHED);
  assert.equal(rawExpressionProblems(problems).length, 11);
});

test("the exact e137779 baseline exposes all 19 later executable expression sites", () => {
  const problems = lintText(
    workflowAt("e13777927876a3d7898778f18193e9465bc97cc2"),
    FILE,
    WATCHED,
  );
  assert.deepEqual(
    rawExpressionProblems(problems).map((problem) => problem.line),
    [
      803, 809, 810, 810, 812, 812, 812, 814, 827, 830, 878, 882, 901, 915, 952,
      955, 989, 992, 999,
    ],
  );
});

test("the checked-in workflow has exact provenance and quoted data-only sinks", () => {
  const workflow = readFileSync(FILE, "utf8");
  assert.deepEqual(
    lintText(workflow, FILE, WATCHED, WATCHED_STEP_FINGERPRINTS[FILE]),
    [],
  );
  for (const [stepName, fingerprint] of Object.entries(
    WATCHED_STEP_FINGERPRINTS[FILE],
  )) {
    assert.deepEqual(stepFingerprint(workflow, stepName), fingerprint);
  }
});

test("complete run and env fingerprints reject indirect execution and harmless drift", () => {
  const workflow = readFileSync(FILE, "utf8");
  const anchor = 'if [ -n "$DISH_NAME_EN" ]; then';
  for (const extra of [
    "printenv DISH_NAME_EN | bash",
    'eval "$(printenv DISH_NAME_EN)"',
    'key=DISH_NAME_EN; eval "${!key}"',
    'export PAYLOAD="$(printenv DISH_NAME_EN)"; bash -c "$PAYLOAD"',
    'echo "harmless reviewed change"',
  ]) {
    const mutated = workflow.replace(
      anchor,
      `${anchor}\n              ${extra}`,
    );
    const problems = lintText(
      mutated,
      FILE,
      WATCHED,
      WATCHED_STEP_FINGERPRINTS[FILE],
    );
    assert.ok(
      problems.some((problem) =>
        /watched run block changed outside its reviewed SHA-256 contract/.test(
          problem.message,
        ),
      ),
      extra,
    );
  }

  const extraEnv = workflow.replace(
    "DISH_NAME_EN: ${{ steps.dish.outputs.dish_name_en }}",
    'DISH_NAME_EN: ${{ steps.dish.outputs.dish_name_en }}\n          REVIEW_NOTE: "harmless"',
  );
  assert.ok(
    lintText(extraEnv, FILE, WATCHED, WATCHED_STEP_FINGERPRINTS[FILE]).some(
      (problem) =>
        /watched env block changed outside its reviewed SHA-256 contract/.test(
          problem.message,
        ),
    ),
  );
});

test("all 49 release-chain actions are SHA-pinned and checkouts erase credentials", () => {
  for (const file of Object.keys(ACTION_INVENTORIES)) {
    assert.deepEqual(
      actionDependencyProblems(readFileSync(file, "utf8"), file),
      [],
    );
  }
  assert.equal(
    Object.values(ACTION_INVENTORIES).reduce(
      (total, inventory) =>
        total +
        Object.values(inventory).reduce((sum, item) => sum + item.count, 0),
      0,
    ),
    49,
  );
  assert.equal(Object.keys(PINNED_ACTIONS).length, 6);
});

test("mutable action tags, retained checkout credentials and missing root gates fail", () => {
  const workflow = readFileSync(FILE, "utf8");
  const mutable = workflow.replace(
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "actions/checkout@v4",
  );
  assert.ok(
    actionDependencyProblems(mutable, FILE).some((problem) =>
      /not in the exact SHA inventory/.test(problem.message),
    ),
  );

  const credentialed = workflow.replace(
    "persist-credentials: false",
    "persist-credentials: true",
  );
  assert.ok(
    actionDependencyProblems(credentialed, FILE).some((problem) =>
      /erase its credential/.test(problem.message),
    ),
  );

  const unwired = workflow.replace(
    "node --test scripts/lint-workflows.test.mjs scripts/pick-dim-sum.test.mjs",
    "echo skipped",
  );
  assert.ok(
    actionDependencyProblems(unwired, FILE).some((problem) =>
      /security contract must run exactly once/.test(problem.message),
    ),
  );

  const unvalidatedOutput = workflow.replace(
    "printf 'ordinal=%s\\n' \"$ordinal\"",
    'echo "ordinal=$ordinal"',
  );
  assert.ok(
    actionDependencyProblems(unvalidatedOutput, FILE).some((problem) =>
      /security contract must run exactly once/.test(problem.message),
    ),
  );

  const bypassedGuard = workflow.replace(
    "needs: [check, workflows, package, jars, test-world, config-java-roundtrip]",
    "needs: [check, package, jars, test-world, config-java-roundtrip]",
  );
  assert.ok(
    actionDependencyProblems(bypassedGuard, FILE).some((problem) =>
      /release must depend/.test(problem.message),
    ),
  );

  const jarWorkflow = readFileSync(BUILD_JARS_FILE, "utf8");
  const mutableReusable = jarWorkflow.replace(
    "gradle/actions/setup-gradle@0b6dd653ba04f4f93bf581ec31e66cbd7dcb644d",
    "gradle/actions/setup-gradle@v4",
  );
  assert.ok(
    actionDependencyProblems(mutableReusable, BUILD_JARS_FILE).some((problem) =>
      /not in the exact SHA inventory/.test(problem.message),
    ),
  );
});

test("the small canonical contract shape passes", () => {
  assert.deepEqual(lintText(oneStep({}), FILE, ONE_INPUT), []);
});

test("the hand-written inventory fails when a watched step disappears", () => {
  const problems = lintText(oneStep({}), FILE, WATCHED);
  assert.equal(
    problems.filter((problem) =>
      /must exist exactly once/.test(problem.message),
    ).length,
    2,
  );
});

test("multiline Actions expressions in a block script are rejected", () => {
  const workflow = `jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        env:\n          NAME: \${{ steps.dish.outputs.name }}\n        run: |\n          printf '%s\\n' "\${{\n            steps.dish.outputs.name\n          }}"\n`;
  const problems = lintText(workflow, FILE, ONE_INPUT);
  assert.equal(rawExpressionProblems(problems).length, 1);
});

test("YAML aliases cannot hide either a watched env mapping or watched script", () => {
  const aliasedEnv = `x-release-env: &release-env\n  NAME: \${{ steps.dish.outputs.name }}\njobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        env: *release-env\n        run: printf '%s\\n' "$NAME"\n`;
  assert.ok(
    lintText(aliasedEnv, FILE, ONE_INPUT).some((problem) =>
      /canonical dynamic env binding/.test(problem.message),
    ),
  );

  const aliasedRun = `x-release-script: &release-script |\n  printf '%s\\n' "$NAME"\njobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        env:\n          NAME: \${{ steps.dish.outputs.name }}\n        run: *release-script\n`;
  assert.ok(
    lintText(aliasedRun, FILE, ONE_INPUT).some((problem) =>
      /anchors or aliases/.test(problem.message),
    ),
  );
});

test("a watched binding must preserve its declared expression provenance", () => {
  const workflow = oneStep({ env: "NAME: ${{ github.event.issue.title }}" });
  assert.ok(
    lintText(workflow, FILE, ONE_INPUT).some((problem) =>
      /canonical dynamic env binding/.test(problem.message),
    ),
  );
});

test("watched variables must remain double-quoted", () => {
  const workflow = oneStep({ run: "printf '%s\\n' $NAME" });
  assert.ok(
    lintText(workflow, FILE, ONE_INPUT).some((problem) =>
      /exact approved data-use/.test(problem.message),
    ),
  );
});

for (const [name, run] of [
  ["eval", 'eval "$NAME"'],
  ["bash -c", 'bash -c "$NAME"'],
  ["bash options before -c", 'bash --noprofile -c "$NAME"'],
  ["sh options before -c", 'sh -eu -c "$NAME"'],
  ["source", 'source "$NAME"'],
  ["command source", 'command source "$NAME"'],
  ["dot source", '. "$NAME"'],
  ["bash standard input", 'bash -s <<< "$NAME"'],
  ["pipe to bash", "printf '%s' \"$NAME\" | bash"],
  [
    "write then execute",
    "printf '%s' \"$NAME\" > /tmp/run.sh; bash /tmp/run.sh",
  ],
  ["indirect eval", 'cmd=eval; "$cmd" "$NAME"'],
  ["backtick substitution", "result=`printf '%s' \"$NAME\"`"],
  ["command substitution", "result=$(printf '%s' \"$NAME\")"],
  ["command position", '"$NAME" --version'],
]) {
  test(`${name} is outside the fail-closed data-use contract`, () => {
    assert.ok(
      lintText(oneStep({ run }), FILE, ONE_INPUT).some((problem) =>
        /exact approved data-use/.test(problem.message),
      ),
    );
  });
}

test("an undeclared dynamic environment binding is rejected", () => {
  const workflow = oneStep({
    env: "NAME: ${{ steps.dish.outputs.name }}\n          EXTRA: ${{ steps.dish.outputs.other }}",
  });
  const problems = lintText(workflow, FILE, ONE_INPUT);
  assert.ok(
    problems.some((problem) => /undeclared dynamic/.test(problem.message)),
  );
  assert.ok(
    problems.some((problem) => /inventory mismatch/.test(problem.message)),
  );
});

test("block parsing keeps comments inside a script and ignores YAML comments", () => {
  const regions = scriptRegions(String.raw`
# run: echo "\${{ ignored }}"
- name: Publish
  run: |
    # expression here is still script text: \${{ watched }}
- name: Next
  env:
    SAFE: \${{ structural }}
`);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].stepName, "Publish");
  assert.equal(regions[0].lines.length, 1);
});

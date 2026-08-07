import assert from "node:assert/strict";
import { test } from "node:test";

import { lintText, scriptRegions } from "./lint-workflows.mjs";

const WATCHED = ["Resolve dim sum code name", "Compose release notes", "Publish"];

const originalVulnerableShape = String.raw`
jobs:
  release:
    steps:
      - name: Resolve dim sum code name
        run: node scripts/pick-dim-sum.mjs --ordinal "\${{ steps.tag.outputs.ordinal }}"
      - name: Compose release notes
        run: |
          if [ -n "\${{ steps.dish.outputs.dish_name_en }}" ]; then
            echo "\${{ steps.dish.outputs.dish_name_en }} · \${{ steps.dish.outputs.dish_name_zh }}"
            echo "![\${{ steps.dish.outputs.dish_alt_en }}](release/\${{ steps.tag.outputs.tag }}/\${{ steps.dish.outputs.dish_file_name }})"
            echo "\${{ steps.dish.outputs.dish_volume }}"
          fi
      - name: Publish
        run: |
          gh release create "\${{ steps.tag.outputs.tag }}" \
            --title "material-bluemap \${{ steps.tag.outputs.tag }}"
          gh release view "\${{ steps.tag.outputs.tag }}"
`;

test("the recovered original shape fails at all 11 executable expression sites", () => {
    const problems = lintText(originalVulnerableShape, ".github/workflows/ci.yml", WATCHED);
    assert.equal(problems.length, 11);
    assert.ok(problems.every((problem) => problem.expression));
});

test("env mappings with quoted shell reads pass", () => {
    const safe = String.raw`
jobs:
  release:
    steps:
      - name: Resolve dim sum code name
        env:
          ORDINAL: \${{ steps.tag.outputs.ordinal }}
        run: node scripts/pick-dim-sum.mjs --ordinal "$ORDINAL"
      - name: Compose release notes
        env:
          NAME: \${{ steps.dish.outputs.dish_name_en }}
        run: |
          printf '%s\n' "$NAME"
      - name: Publish
        env:
          TAG: \${{ steps.tag.outputs.tag }}
        run: gh release view "$TAG"
`;
    assert.deepEqual(lintText(safe, ".github/workflows/ci.yml", WATCHED), []);
});

test("the hand-written inventory fails when a watched step disappears", () => {
    const problems = lintText(
        "jobs:\n  release:\n    steps:\n      - name: Publish\n        run: echo safe\n",
        ".github/workflows/ci.yml",
        WATCHED,
    );
    assert.equal(problems.filter((problem) => !problem.expression).length, 2);
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

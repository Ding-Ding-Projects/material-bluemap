#!/usr/bin/env node

import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const argv = process.argv.slice(2);

function option(name) {
  const index = argv.indexOf(name);
  const value = index < 0 ? undefined : argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`missing required ${name} value`);
  }
  return value;
}

const primaryRoot = resolve(repoRoot, option("--primary"));
const supplementRoot = resolve(repoRoot, option("--supplement"));
const outputRoot = resolve(repoRoot, option("--out"));
const commit = option("--commit");
const run = option("--run");
const primary = JSON.parse(
  await readFile(join(primaryRoot, "manifest.json"), "utf8"),
);
const supplementNames = (await readdir(supplementRoot))
  .filter((name) => name.endsWith(".caption.txt"))
  .sort((left, right) => left.localeCompare(right, "en"));

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const stripAnsi = (value) => value.replace(/\x1b\[[0-9;]*m/g, "");

async function validatePng(path) {
  const bytes = await readFile(path);
  if (bytes.length <= 200 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${path}: missing, empty, or not a PNG capture`);
  }
}

const supplements = [];
for (const captionName of supplementNames) {
  const name = captionName.replace(/\.caption\.txt$/, "");
  const file = `${name}.png`;
  const caption = (
    await readFile(join(supplementRoot, captionName), "utf8")
  ).trim();
  const marker = ". Real Electron app.";
  const markerIndex = caption.indexOf(marker);
  if (markerIndex < 1) {
    throw new Error(
      `${captionName}: caption does not contain the expected provenance marker`,
    );
  }
  await validatePng(join(supplementRoot, file));
  supplements.push({
    name,
    file,
    surface: caption.slice(0, markerIndex),
    caption,
  });
}

const supplementByName = new Map(
  supplements.map((capture) => [capture.name, capture]),
);
const firstRun = supplements.filter((capture) =>
  capture.name.startsWith("firstrun-"),
);
const captures = [
  ...firstRun,
  ...primary.captures.map(
    (capture) => supplementByName.get(capture.name) ?? capture,
  ),
  ...supplements.filter(
    (capture) =>
      !capture.name.startsWith("firstrun-") &&
      !primary.captures.some(
        (primaryCapture) => primaryCapture.name === capture.name,
      ),
  ),
];
const duplicateNames = captures
  .map((capture) => capture.name)
  .filter((name, index, names) => names.indexOf(name) !== index);
if (duplicateNames.length > 0) {
  throw new Error(
    `duplicate merged capture names: ${[...new Set(duplicateNames)].join(", ")}`,
  );
}

const skipped = primary.skipped
  .filter((gap) => !(gap.surface === "First-run setup" && firstRun.length > 0))
  .map((gap) => ({
    surface: stripAnsi(gap.surface),
    reason: stripAnsi(gap.reason),
  }));
const manifest = {
  ...primary,
  method:
    `${primary.method} plus a targeted first-run supplement, merged by ` +
    "scripts/merge-screenshot-captures.mjs",
  commit,
  run,
  captures,
  skipped,
  supplements: [
    {
      source: supplementRoot,
      captures: supplements.map((capture) => capture.file),
      reason:
        "The full run proved every required surface; this targeted fresh-profile run supplied onboarding after its isolation seam was repaired.",
    },
  ],
  note:
    `${primary.note} This manifest combines one complete required-surface run with one ` +
    "targeted first-run capture from the same built source state; duplicate filenames use the targeted run's newer bytes.",
};

await mkdir(outputRoot, { recursive: true });
for (const capture of captures) {
  const source = supplementByName.has(capture.name)
    ? join(supplementRoot, capture.file)
    : join(primaryRoot, capture.file);
  await validatePng(source);
  await copyFile(source, join(outputRoot, capture.file));
}
await writeFile(
  join(outputRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

const lines = [
  "# Screenshots",
  "",
  `Commit \`${manifest.commit}\`, run \`${manifest.run}\`, capture mode \`${manifest.captureMode}\`.`,
  "",
  manifest.caption,
  "",
  ...captures.flatMap((capture) => [
    `## ${capture.name}`,
    "",
    `![${capture.surface}](${capture.file})`,
    "",
    capture.caption,
    "",
  ]),
  ...(skipped.length === 0
    ? [
        "## Nothing was skipped",
        "",
        "Every surface this harness knows about was captured.",
        "",
      ]
    : [
        "## Not captured",
        "",
        "Nothing was substituted for these. They are listed so the gap is visible.",
        "",
        ...skipped.map((gap) => `- **${gap.surface}**: ${gap.reason}`),
        "",
      ]),
];
await writeFile(
  join(outputRoot, "captions.md"),
  `${lines.join("\n").trimEnd()}\n`,
  "utf8",
);

process.stdout.write(
  `Merged ${primary.captures.length} primary captures and ${supplements.length} supplement ` +
    `captures into ${captures.length} unique targets under ${outputRoot}.\n`,
);

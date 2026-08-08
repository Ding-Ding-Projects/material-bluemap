#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const inventoryPath = resolve(
  repoRoot,
  "docs/screenshots/evidence-inventory.json",
);
const manifestPath = resolve(repoRoot, "docs/screenshots/manifest.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".gif",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
]);
const normalise = (value) => value.replaceAll("\\", "/");
const sort = (values) =>
  [...values].sort((left, right) => left.localeCompare(right, "en"));
const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
})
  .split("\0")
  .filter(Boolean)
  .map(normalise);

function isEvidencePath(file) {
  return (
    IMAGE_EXTENSIONS.has(extname(file).toLowerCase()) &&
    inventory.evidenceRoots.some((root) =>
      file.startsWith(`${normalise(root)}/`),
    )
  );
}

function difference(left, right) {
  const rightSet = new Set(right);
  return sort(left.filter((value) => !rightSet.has(value)));
}

function assertEmpty(values, message) {
  if (values.length === 0) return;
  throw new Error(
    `${message}:\n${values.map((value) => `  - ${value}`).join("\n")}`,
  );
}

function dimensions(file, bytes) {
  if (file.endsWith(".png")) {
    const signature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    if (!bytes.subarray(0, 8).equals(signature))
      throw new Error(`${file}: invalid PNG signature`);
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (file.endsWith(".gif")) {
    if (!/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"))) {
      throw new Error(`${file}: invalid GIF signature`);
    }
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  return { width: 1, height: 1 };
}

if (inventory.version !== 1)
  throw new Error(
    `unsupported evidence inventory version ${inventory.version}`,
  );
if (
  !Number.isInteger(inventory.expectedTargetCount) ||
  inventory.expectedTargetCount < 1
) {
  throw new Error("expectedTargetCount must be a positive integer");
}

const groupIds = inventory.groups.map((group) => group.id);
assertEmpty(
  groupIds.filter((id, index) => groupIds.indexOf(id) !== index),
  "duplicate inventory group ids",
);

for (const group of inventory.groups) {
  for (const field of ["id", "authority", "command", "reproducibility"]) {
    if (typeof group[field] !== "string" || group[field].trim() === "") {
      throw new Error(
        `${group.id ?? "unnamed group"}: ${field} must be a non-empty string`,
      );
    }
  }
  if (group.targets.length !== group.expectedCount) {
    throw new Error(
      `${group.id}: expectedCount=${group.expectedCount}, but ${group.targets.length} targets are listed`,
    );
  }
}

const listed = inventory.groups.flatMap((group) =>
  group.targets.map(normalise),
);
const duplicateTargets = listed.filter(
  (file, index) => listed.indexOf(file) !== index,
);
assertEmpty(
  sort(new Set(duplicateTargets)),
  "targets listed in more than one evidence group",
);

if (listed.length !== inventory.expectedTargetCount) {
  throw new Error(
    `inventory expected ${inventory.expectedTargetCount} targets, but lists ${listed.length}`,
  );
}

const actual = tracked.filter(isEvidencePath);
assertEmpty(
  difference(actual, listed),
  "tracked evidence images missing from the hand-written inventory",
);
assertEmpty(
  difference(listed, actual),
  "inventory targets that are not tracked evidence images",
);

for (const file of listed) {
  const bytes = readFileSync(resolve(repoRoot, file));
  const { width, height } = dimensions(file, bytes);
  if (width < 1 || height < 1)
    throw new Error(`${file}: invalid ${width}x${height} dimensions`);
}

const manifestGroup = inventory.groups.find(
  (group) => group.id === "app-playwright-manifest",
);
if (manifestGroup === undefined)
  throw new Error("app-playwright-manifest group is required");
const manifestFiles = manifest.captures.map(
  (capture) => `docs/screenshots/${capture.file}`,
);
assertEmpty(
  difference(manifestFiles, manifestGroup.targets),
  "Playwright manifest captures absent from its evidence group",
);
assertEmpty(
  difference(manifestGroup.targets, manifestFiles),
  "Playwright evidence targets absent from docs/screenshots/manifest.json",
);

const walkthrough = inventory.groups.find(
  (group) => group.id === "site-walkthrough-media",
);
if (walkthrough === undefined)
  throw new Error("site-walkthrough-media group is required");
const walkthroughIds = new Set(
  walkthrough.targets.map((file) =>
    file.replace(/^.*\//, "").replace(/\.(?:gif|png)$/, ""),
  ),
);
for (const id of walkthroughIds) {
  for (const extension of ["gif", "png"]) {
    const file = `design/packages/site/src/assets/walkthroughs/${id}.${extension}`;
    if (!walkthrough.targets.includes(file))
      throw new Error(`${id}: missing ${extension} walkthrough pair`);
  }
}
if (walkthroughIds.size * 2 !== walkthrough.targets.length) {
  throw new Error(
    "walkthrough inventory must contain exactly one GIF and one PNG per action id",
  );
}

process.stdout.write(
  [
    `Screenshot evidence inventory: ${listed.length}/${inventory.expectedTargetCount} tracked targets covered`,
    ...inventory.groups.map(
      (group) => `  ${group.id}: ${group.targets.length}`,
    ),
    `  Playwright manifest: ${manifestFiles.length} captures, ${manifest.skipped.length} named skips`,
  ].join("\n") + "\n",
);

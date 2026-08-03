#!/usr/bin/env node
/**
 * Regenerates `design/packages/engine/src/map/hires/prbmOracleData.ts` from the real
 * upstream mesher.
 *
 *   node tools/oracle/prbm/regenerate.mjs
 *
 * `compare.mjs` (the phase gate next door) renders a whole world and diffs the tile
 * directories. This is the unit-level counterpart: it drives `ArrayTileModel` and
 * `PRBMWriter` out of the built oracle jar directly, over a handful of small hand-built
 * models, and records what they emitted. That lets the TypeScript port be pinned against
 * the reference implementation from a plain `vitest run`, with no world, no resource
 * pack and no 80-second render — and it localises a mismatch to one model instead of one
 * tile out of 961.
 *
 * `PrbmOracle` lives in upstream's own package so it can read `ArrayTileModel`'s
 * package-private arrays; the model construction inside it is mirrored line for line by
 * `prbmOracleFixture.ts` on the TypeScript side. Change one and you must change both,
 * or the comparison stops meaning anything.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const outDir = join(here, "out");
const libs = join(repoRoot, "vendor/BlueMap/implementations/cli/build/libs");
const fixture = join(repoRoot, "design/packages/engine/src/map/hires/prbmOracleData.ts");

function findShadowJar() {
    if (!existsSync(libs)) return null;
    const jar = readdirSync(libs).find((n) => n.endsWith("-shadow.jar"));
    return jar === undefined ? null : join(libs, jar);
}

const jar = findShadowJar();
if (jar === null) {
    console.error(
        [
            "No shadow jar found under vendor/BlueMap/implementations/cli/build/libs.",
            "Build the oracle first:",
            "",
            "  cd vendor/BlueMap",
            `  GRADLE_USER_HOME=${join(repoRoot, "tools/oracle/.gradle")} ./gradlew :cli:shadowJar`,
        ].join("\n"),
    );
    process.exit(1);
}
console.log("oracle jar:", jar);

mkdirSync(outDir, { recursive: true });

const run = (cmd, args) =>
    execFileSync(cmd, args, { cwd: here, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

run("javac", [
    "-cp",
    jar,
    "-d",
    outDir,
    "de/bluecolored/bluemap/core/map/hires/PrbmOracle.java",
    "TrigOracle.java",
]);

const cp = `${jar}${process.platform === "win32" ? ";" : ":"}${outDir}`;
const dump = run("java", ["-cp", cp, "de.bluecolored.bluemap.core.map.hires.PrbmOracle"]);
const dumpPath = join(outDir, "oracle-output.txt");
writeFileSync(dumpPath, dump);

run("node", ["genFixture.mjs", dumpPath, fixture]);

// flow-math's own sin/cos, for the engine's TrigMath.test.ts table. Printed rather than
// written: that table is small enough to live in the test file, and reviewing a trig
// change by hand is the point.
console.log("\n--- flow-math TrigMath reference (paste into TrigMath.test.ts) ---");
console.log(run("java", ["-cp", cp, "TrigOracle"]));

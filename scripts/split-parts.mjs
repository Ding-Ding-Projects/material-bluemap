#!/usr/bin/env node
/**
 * Splits a file that is too large for a GitHub release asset into parts that are not.
 *
 * A thin command line over `@material-bluemap/parts`; every byte of the logic lives in
 * the package, is unit tested there, and is the same code the desktop application runs
 * in reverse when it downloads what this produced.
 *
 *   node scripts/split-parts.mjs <file> [--out <dir>] [--part-size <bytes>] [--json]
 *   node scripts/split-parts.mjs --check <file> [--limit <bytes>]
 *
 * `--check` only reports whether a file would be split, and exits 0 either way. It is
 * for a publish step deciding what to do, not for a person.
 *
 * A file no larger than the part size is left alone: nothing is written, and the report
 * says so. Producing a one-part manifest for a forty-megabyte installer would make every
 * consumer of every release learn the join format to open an asset that was never split.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const packageDist = resolve(here, "../design/packages/parts/dist/index.js");

if (!existsSync(packageDist)) {
    console.error(
        "The @material-bluemap/parts package has not been built.\n" +
            "Run this first:\n\n" +
            "    cd design && pnpm install && pnpm --filter @material-bluemap/parts run build\n",
    );
    process.exit(2);
}

// A file URL, not a path: `import()` of a bare `C:\...` is not a specifier Node accepts.
const { DEFAULT_PART_SIZE, GITHUB_ASSET_LIMIT, splitFile } = await import(
    pathToFileURL(packageDist).href
);

function parseArguments(argv) {
    const options = { file: null, outDir: null, partSize: null, json: false, check: false, limit: null };
    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i];
        if (argument === "--json") options.json = true;
        else if (argument === "--check") options.check = true;
        else if (argument === "--out") options.outDir = argv[++i] ?? null;
        else if (argument === "--part-size") options.partSize = Number(argv[++i]);
        else if (argument === "--limit") options.limit = Number(argv[++i]);
        else if (argument.startsWith("--")) fail(`Unknown option ${argument}`);
        else if (options.file === null) options.file = argument;
        else fail(`Unexpected extra argument ${argument}`);
    }
    if (options.file === null) fail("A file to split is required.");
    if (options.partSize !== null && !Number.isSafeInteger(options.partSize)) {
        fail("--part-size must be a whole number of bytes.");
    }
    if (options.limit !== null && !Number.isSafeInteger(options.limit)) {
        fail("--limit must be a whole number of bytes.");
    }
    return options;
}

function fail(message) {
    console.error(message);
    process.exit(2);
}

function human(bytes) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit++;
    }
    return `${unit === 0 ? String(value) : value.toFixed(2)} ${units[unit]}`;
}

const options = parseArguments(process.argv.slice(2));
const target = resolve(options.file);

if (options.check) {
    const limit = options.limit ?? GITHUB_ASSET_LIMIT;
    const size = statSync(target).size;
    const over = size > limit;
    if (options.json) {
        console.log(JSON.stringify({ file: target, bytes: size, limit, oversized: over }, null, 2));
    } else {
        console.log(
            `${target} is ${human(size)}; the cap is ${human(limit)}. ` +
                (over ? "It must be split." : "It can be attached unchanged."),
        );
    }
    process.exit(0);
}

const partSize = options.partSize ?? DEFAULT_PART_SIZE;
let lastPercent = -1;

const result = await splitFile(target, {
    partSize,
    ...(options.outDir === null ? {} : { outDir: resolve(options.outDir) }),
    onProgress: (progress) => {
        if (options.json) return;
        const percent = Math.floor(progress.percent);
        if (percent === lastPercent) return;
        lastPercent = percent;
        process.stderr.write(
            `\rsplitting: ${String(percent)}% (${String(progress.partsDone)}/${String(progress.partsTotal)} parts)`,
        );
    },
});

if (!options.json) process.stderr.write("\n");

if (!result.split) {
    if (options.json) {
        console.log(JSON.stringify({ split: false, file: result.file, bytes: result.bytes }, null, 2));
    } else {
        console.log(
            `${result.file} is ${human(result.bytes)}, which fits in one part of ${human(partSize)}. ` +
                "Nothing was written.",
        );
    }
    process.exit(0);
}

if (options.json) {
    console.log(
        JSON.stringify(
            {
                split: true,
                file: result.file,
                bytes: result.bytes,
                manifest: result.manifestPath,
                parts: result.partPaths,
                sha256: result.manifest.sha256,
            },
            null,
            2,
        ),
    );
} else {
    console.log(
        `${result.file} (${human(result.bytes)}) was split into ${String(result.manifest.parts.length)} parts ` +
            `of at most ${human(partSize)}.`,
    );
    console.log(`  manifest: ${result.manifestPath}`);
    for (const part of result.manifest.parts) {
        console.log(`  ${part.name}  ${human(part.bytes).padStart(10)}  ${part.sha256}`);
    }
    console.log(`  whole file SHA-256: ${result.manifest.sha256}`);
    console.log("");
    console.log("Rejoin with:");
    console.log(`  node scripts/join-parts.mjs ${result.manifestPath}`);
}

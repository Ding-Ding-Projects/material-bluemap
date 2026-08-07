#!/usr/bin/env node
/**
 * Puts a split release asset back together, and proves it is what it claims to be.
 *
 * A thin command line over `@worldlens/parts`, and the same code the desktop
 * application runs after downloading. Every part is checked against its own SHA-256 as
 * it is appended, and the whole file is checked at the end.
 *
 *   node scripts/join-parts.mjs <manifest.parts.json> [--out <dir>] [--json]
 *
 * Download every `<name>.NNN` and the `<name>.parts.json` from the release into one
 * directory, then point this at the manifest. An interrupted run picks up from the last
 * complete part rather than starting over, so it can simply be run again.
 *
 * A part that does not match is named, with its index, so one file can be downloaded
 * again instead of all of them. Exit code 1 means the parts on disk do not add up to the
 * published file; nothing that failed verification is left behind.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const packageDist = resolve(here, "../design/packages/parts/dist/index.js");

if (!existsSync(packageDist)) {
    console.error(
        "The @worldlens/parts package has not been built.\n" +
            "Run this first:\n\n" +
            "    cd design && pnpm install && pnpm --filter @worldlens/parts run build\n",
    );
    process.exit(2);
}

const { joinParts, PartsIntegrityError, PartsManifestError } = await import(
    pathToFileURL(packageDist).href
);

function parseArguments(argv) {
    const options = { manifest: null, outDir: null, json: false };
    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i];
        if (argument === "--json") options.json = true;
        else if (argument === "--out") options.outDir = argv[++i] ?? null;
        else if (argument.startsWith("--")) fail(`Unknown option ${argument}`);
        else if (options.manifest === null) options.manifest = argument;
        else fail(`Unexpected extra argument ${argument}`);
    }
    if (options.manifest === null) fail("A <name>.parts.json manifest is required.");
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
let lastPercent = -1;

try {
    const result = await joinParts(resolve(options.manifest), {
        ...(options.outDir === null ? {} : { outDir: resolve(options.outDir) }),
        onProgress: (progress) => {
            if (options.json) return;
            const percent = Math.floor(progress.percent);
            if (percent === lastPercent) return;
            lastPercent = percent;
            process.stderr.write(
                `\rjoining: ${String(percent)}% ` +
                    `(${String(progress.partsDone)}/${String(progress.partsTotal)} parts)`,
            );
        },
    });

    if (!options.json) process.stderr.write("\n");

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(`${result.path} (${human(result.bytes)})`);
        console.log(`  SHA-256 ${result.sha256} - verified against the manifest.`);
        if (result.reusedParts > 0) {
            console.log(
                `  Resumed: ${String(result.reusedParts)} parts were already in place and were ` +
                    "re-checked rather than re-copied.",
            );
        }
    }
} catch (error) {
    if (!options.json) process.stderr.write("\n");
    if (error instanceof PartsIntegrityError || error instanceof PartsManifestError) {
        console.error(error.message);
        process.exit(1);
    }
    throw error;
}

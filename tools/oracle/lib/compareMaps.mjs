/**
 * Comparing two rendered map directories.
 *
 * Split out of `compare.mjs` so `selftest.mjs` can drive it against deliberately
 * corrupted inputs — a comparison nobody has ever seen fail is not evidence of anything.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describeError, diffBytes, diffJson, diffPng } from "./diff.mjs";
import { listFiles, log } from "./util.mjs";

/**
 * What kind of file this is, and therefore how it has to be compared.
 *
 * The default is a byte comparison. The two exceptions are deliberate and named:
 *
 *  - `*.png` is compared **pixel for pixel** once a byte comparison fails, because two
 *    encoders can write different bytes for the same image and a byte-only check would
 *    fail a correct render. A pixel-identical, byte-different pair is reported as
 *    exactly that, not as agreement and not as a render bug.
 *  - `settings.json`, `live/markers.json` and `live/players.json` are compared **by
 *    value**, because gson html-escapes `=`, `<`, `>`, `&` and `'` inside strings and
 *    `JSON.stringify` does not. Same document, different bytes.
 *
 * Nothing else is softened. In particular the hires tiles are gunzipped and then
 * compared byte for byte, which is the gate.
 */
export function classify(relativePath) {
    if (relativePath.startsWith("tiles/0/") && relativePath.includes(".prbm"))
        return {
            category: "hires",
            mode: relativePath.endsWith(".gz") ? "gunzip-bytes" : "bytes",
        };
    if (/^tiles\/[1-9]\d*\//.test(relativePath) && relativePath.endsWith(".png"))
        return { category: "lowres", mode: "png" };
    if (relativePath === "textures.json.gz") return { category: "textures", mode: "gunzip-bytes" };
    if (relativePath === "textures.json") return { category: "textures", mode: "bytes" };
    if (relativePath === "settings.json") return { category: "settings", mode: "json" };
    if (relativePath === "live/markers.json" || relativePath === "live/players.json")
        return { category: "live", mode: "json" };
    if (relativePath.startsWith("rstate/"))
        return {
            category: "renderstate",
            mode: relativePath.endsWith(".gz") ? "gunzip-bytes" : "bytes",
        };
    return { category: "other", mode: "bytes" };
}

function decompressIfNeeded(buffer, mode, side) {
    if (mode !== "gunzip-bytes") return buffer;
    try {
        return gunzipSync(buffer);
    } catch (error) {
        throw new Error(`the ${side} file is not valid gzip: ${describeError(error)}`);
    }
}

/** @returns {Promise<null | {file: string, category: string, kind: string, message: string, detail: string[]}>} */
export async function compareFile(relativePath, referenceRoot, portedRoot) {
    const { category, mode } = classify(relativePath);
    const referenceBytes = await readFile(join(referenceRoot, ...relativePath.split("/")));
    const portedBytes = await readFile(join(portedRoot, ...relativePath.split("/")));

    if (mode === "png") {
        const difference = diffPng(referenceBytes, portedBytes);
        return difference === null ? null : { file: relativePath, category, ...difference };
    }

    if (mode === "json") {
        let referenceJson;
        let portedJson;
        try {
            referenceJson = JSON.parse(referenceBytes.toString("utf8"));
        } catch (error) {
            return {
                file: relativePath,
                category,
                kind: "json-parse",
                message: `the java file is not valid json: ${describeError(error)}`,
                detail: [],
            };
        }
        try {
            portedJson = JSON.parse(portedBytes.toString("utf8"));
        } catch (error) {
            return {
                file: relativePath,
                category,
                kind: "json-parse",
                message: `the typescript file is not valid json: ${describeError(error)}`,
                detail: [],
            };
        }
        const difference = diffJson(referenceJson, portedJson);
        return difference === null ? null : { file: relativePath, category, ...difference };
    }

    let referenceData;
    let portedData;
    try {
        referenceData = decompressIfNeeded(referenceBytes, mode, "java");
        portedData = decompressIfNeeded(portedBytes, mode, "typescript");
    } catch (error) {
        return {
            file: relativePath,
            category,
            kind: "decompress",
            message: describeError(error),
            detail: [],
        };
    }

    const difference = diffBytes(referenceData, portedData);
    if (difference === null) return null;

    const result = { file: relativePath, category, ...difference };

    // a differing textures.json is far easier to act on as "element 412's key changed"
    // than as "byte 9134 differs", so say both
    if (category === "textures") {
        try {
            const extra = diffJson(
                JSON.parse(referenceData.toString("utf8")),
                JSON.parse(portedData.toString("utf8")),
            );
            if (extra !== null) result.detail = [...result.detail, "  as json: " + extra.message];
        } catch {
            // an unparseable textures.json is already covered by the byte report
        }
    }

    return result;
}

function emptyCategoryStats() {
    return {
        compared: 0,
        matching: 0,
        differing: 0,
        reencoded: 0,
        onlyInReference: 0,
        onlyInPorted: 0,
    };
}

/**
 * @param {string} referenceRoot the java render's map directory
 * @param {string} portedRoot the typescript render's map directory
 * @param {number} keepDivergences how many divergence records to retain in the report
 */
export async function compareMaps(referenceRoot, portedRoot, keepDivergences = 100) {
    const referenceFiles = await listFiles(referenceRoot);
    const portedFiles = await listFiles(portedRoot);
    const portedSet = new Set(portedFiles);
    const referenceSet = new Set(referenceFiles);

    const categories = {};
    const bump = (category, field) => {
        categories[category] ??= emptyCategoryStats();
        categories[category][field]++;
    };

    const divergences = [];
    const reencoded = [];
    const onlyInReference = [];
    const onlyInPorted = [];

    for (const file of referenceFiles) {
        const { category } = classify(file);
        if (!portedSet.has(file)) {
            bump(category, "onlyInReference");
            onlyInReference.push(file);
            continue;
        }
        bump(category, "compared");
        const difference = await compareFile(file, referenceRoot, portedRoot);
        if (difference === null) {
            bump(category, "matching");
        } else if (difference.kind === "png-reencode") {
            // The gate for lowres tiles is stated in pixels, not bytes (decision D3:
            // "PNG parity checked on decoded pixels, never bytes"), because ImageIO and
            // pngjs make different filter and zlib choices for the same image. So this
            // counts as a match — but it is counted and printed separately rather than
            // folded away, because a sudden crop of re-encodes is worth seeing.
            bump(category, "matching");
            bump(category, "reencoded");
            reencoded.push({ file, ...difference });
        } else {
            bump(category, "differing");
            if (divergences.length < keepDivergences) divergences.push(difference);
        }
    }

    for (const file of portedFiles) {
        if (referenceSet.has(file)) continue;
        const { category } = classify(file);
        bump(category, "onlyInPorted");
        onlyInPorted.push(file);
    }

    const total = (field) =>
        Object.values(categories).reduce((sum, stats) => sum + stats[field], 0);

    const summary = {
        referenceFiles: referenceFiles.length,
        portedFiles: portedFiles.length,
        compared: total("compared"),
        matching: total("matching"),
        differing: total("differing"),
        reencoded: total("reencoded"),
        onlyInReference: onlyInReference.length,
        onlyInPorted: onlyInPorted.length,
    };

    return {
        ok:
            summary.differing === 0 &&
            summary.onlyInReference === 0 &&
            summary.onlyInPorted === 0 &&
            summary.compared > 0,
        summary,
        categories,
        divergences,
        reencoded,
        onlyInReference,
        onlyInPorted,
    };
}

export function printComparison(comparison, maxReport) {
    log("");
    log("  category     compared  matching  differing  re-encoded  java-only   ts-only");
    for (const [category, stats] of Object.entries(comparison.categories).sort()) {
        log(
            "  " +
                category.padEnd(12) +
                String(stats.compared).padStart(8) +
                String(stats.matching).padStart(10) +
                String(stats.differing).padStart(11) +
                String(stats.reencoded).padStart(12) +
                String(stats.onlyInReference).padStart(11) +
                String(stats.onlyInPorted).padStart(10),
        );
    }
    log("");

    if (comparison.reencoded.length > 0) {
        log(
            `  ${comparison.reencoded.length} png(s) are pixel-identical but byte-different — ` +
                `counted as matching (the lowres gate is pixels, per decision D3):`,
        );
        for (const note of comparison.reencoded.slice(0, maxReport)) log(`    ${note.file}`);
        if (comparison.reencoded.length > maxReport)
            log(`    … and ${comparison.reencoded.length - maxReport} more`);
        log("");
    }

    if (comparison.onlyInReference.length > 0) {
        log(
            `  ${comparison.onlyInReference.length} file(s) the java render wrote and the typescript render did not:`,
        );
        for (const file of comparison.onlyInReference.slice(0, maxReport)) log(`    ${file}`);
        if (comparison.onlyInReference.length > maxReport)
            log(`    … and ${comparison.onlyInReference.length - maxReport} more`);
        log("");
    }

    if (comparison.onlyInPorted.length > 0) {
        log(
            `  ${comparison.onlyInPorted.length} file(s) the typescript render wrote and the java render did not:`,
        );
        for (const file of comparison.onlyInPorted.slice(0, maxReport)) log(`    ${file}`);
        if (comparison.onlyInPorted.length > maxReport)
            log(`    … and ${comparison.onlyInPorted.length - maxReport} more`);
        log("");
    }

    if (comparison.divergences.length > 0) {
        log(`  first ${Math.min(maxReport, comparison.divergences.length)} divergence(s):`);
        for (const divergence of comparison.divergences.slice(0, maxReport)) {
            log("");
            log(`  ${divergence.file}  [${divergence.category}/${divergence.kind}]`);
            log(`    ${divergence.message}`);
            for (const line of divergence.detail ?? []) log(`  ${line}`);
        }
        if (comparison.summary.differing > maxReport)
            log(`\n  … and ${comparison.summary.differing - maxReport} more differing file(s)`);
        log("");
    }
}

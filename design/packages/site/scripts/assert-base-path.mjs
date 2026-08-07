#!/usr/bin/env node
/**
 * assert-base-path.mjs — prove the built site is actually addressed at its subpath.
 *
 * The failure this exists to catch is quiet and total. The site is served from
 * `/worldlens/`, not from a domain root. A build configured with a root base
 * emits absolute URLs like `/assets/index.js`, the upload succeeds, the deployment goes
 * green, and every page 404s in the browser. Nothing in the pipeline notices, because
 * nothing in the pipeline ever asks for the page.
 *
 * So this asks. It reads the built output, checks that the entry document references
 * its assets under the expected prefix, and fails loudly if any root-absolute reference
 * escapes it.
 *
 * Usage:
 *   node scripts/assert-base-path.mjs
 *   node scripts/assert-base-path.mjs --dist dist --base /worldlens/
 *
 * Exits non-zero on any violation. This one is a gate, unlike the fetch scripts.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import process from "node:process";

import { SITE_ROOT, log, parseArgs } from "./shared.mjs";

const SCRIPT = "assert-base-path";

const DEFAULT_BASE = "/worldlens/";

/** Files worth scanning for a stray root-absolute asset URL. */
const SCANNED_EXTENSIONS = [".html", ".css", ".js", ".mjs", ".webmanifest", ".json"];

/** Every `src=` and `href=` value in a document, quoted either way. */
function extractReferences(html) {
    const references = [];
    const pattern = /\b(?:src|href)\s*=\s*("([^"]*)"|'([^']*)')/gi;
    let match = pattern.exec(html);
    while (match !== null) {
        const value = match[2] ?? match[3] ?? "";
        if (value.length > 0) references.push(value);
        match = pattern.exec(html);
    }
    return references;
}

/** Recursively list every file under a directory. */
async function listFiles(directory) {
    const found = [];
    const walk = async (current) => {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const path = join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(path);
            } else if (entry.isFile()) {
                found.push(path);
            }
        }
    };
    await walk(directory);
    return found;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const dist = typeof args.dist === "string" ? resolve(SITE_ROOT, args.dist) : resolve(SITE_ROOT, "dist");
    const rawBase = typeof args.base === "string" ? args.base : DEFAULT_BASE;
    const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

    log(SCRIPT, `checking ${dist} against base ${base}`);

    try {
        const info = await stat(dist);
        if (!info.isDirectory()) throw new Error("not a directory");
    } catch {
        console.error(`[${SCRIPT}] the build output directory ${dist} does not exist; build the site first`);
        process.exit(1);
    }

    const failures = [];

    const indexPath = join(dist, "index.html");
    let index;
    try {
        index = await readFile(indexPath, "utf8");
    } catch {
        console.error(`[${SCRIPT}] ${indexPath} does not exist; the build produced no entry document`);
        process.exit(1);
    }

    const references = extractReferences(index);
    const rootAbsolute = references.filter((value) => value.startsWith("/") && !value.startsWith("//"));
    const prefixed = rootAbsolute.filter((value) => value.startsWith(base));
    const escaped = rootAbsolute.filter((value) => !value.startsWith(base));

    for (const value of escaped) {
        failures.push(`index.html references ${value}, which is not under ${base} and will 404 when served`);
    }

    if (prefixed.length === 0) {
        failures.push(
            `index.html has no reference under ${base}. The build is emitting relative or root URLs, which means the Vite base is not set to ${base}`
        );
    }

    // A stray root-absolute asset URL inside a bundled file breaks a page just as
    // thoroughly as one in the document, and is harder to spot by eye.
    const files = await listFiles(dist);
    const scanned = files.filter((file) => SCANNED_EXTENSIONS.some((extension) => file.endsWith(extension)));
    const strayPattern = /(?:["'(])\/assets\//g;

    for (const file of scanned) {
        const text = await readFile(file, "utf8");
        if (strayPattern.test(text)) {
            failures.push(`${relative(dist, file)} contains a root-absolute /assets/ URL, which is missing ${base}`);
        }
        strayPattern.lastIndex = 0;
    }

    if (failures.length > 0) {
        console.error(`[${SCRIPT}] the built site would 404 when served from ${base}:`);
        for (const failure of failures) console.error(`[${SCRIPT}]   - ${failure}`);
        process.exit(1);
    }

    log(SCRIPT, `checked ${scanned.length} built files`);
    log(SCRIPT, `index.html carries ${prefixed.length} references under ${base}`);
    log(SCRIPT, "the built output is addressed at the project subpath");
}

await main();

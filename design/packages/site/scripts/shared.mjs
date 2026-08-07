/**
 * Helpers shared by the site's build-time fetch scripts.
 *
 * Everything that talks to the forge goes through the `gh` CLI rather than a raw HTTP
 * client, so authentication, enterprise hosts and rate-limit handling are the CLI's
 * problem and not a second implementation of them here.
 *
 * Both scripts fail closed. A missing CLI, a failed call, a malformed response or a
 * validation failure all produce the same thing: a generated module saying the data is
 * unavailable, with the reason. Neither script ever invents a URL or a placeholder, and
 * neither exits non-zero for an absent release or an expired artifact, because a site
 * with an honest empty state is a successful build.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));

/** The site package root, `design/packages/site`. */
export const SITE_ROOT = resolve(here, "..");

/** Where the generated content modules are written. */
export const GENERATED_DIR = resolve(SITE_ROOT, "src/content/generated");

/** Default repository, overridable so a fork can build its own site. */
export const DEFAULT_REPO = "Ding-Ding-Projects/worldlens";

/** Parse `--name value` and `--name=value` pairs, plus bare `--flag`. */
export function parseArgs(argv) {
    /** @type {Record<string, string | boolean>} */
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith("--")) continue;
        const body = token.slice(2);
        const equals = body.indexOf("=");
        if (equals !== -1) {
            args[body.slice(0, equals)] = body.slice(equals + 1);
            continue;
        }
        const next = argv[index + 1];
        if (next !== undefined && !next.startsWith("--")) {
            args[body] = next;
            index += 1;
        } else {
            args[body] = true;
        }
    }
    return args;
}

/** The repository to query: the flag, then the CI environment, then the default. */
export function resolveRepo(args) {
    if (typeof args.repo === "string" && args.repo.length > 0) return args.repo;
    if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
    return DEFAULT_REPO;
}

/** A tagged failure, so callers can report a cause without a stack trace. */
export class FetchFailure extends Error {}

/**
 * Run `gh` and return stdout.
 *
 * A missing CLI is reported as a `FetchFailure` with a readable reason rather than an
 * ENOENT, because "gh is not installed" is a legitimate reason for a site to ship
 * without a download button and should read like one.
 */
export async function gh(args, options = {}) {
    try {
        const { stdout } = await execFileAsync("gh", args, {
            maxBuffer: 64 * 1024 * 1024,
            env: process.env,
            ...options,
        });
        return stdout;
    } catch (error) {
        if (error && error.code === "ENOENT") {
            throw new FetchFailure("the GitHub CLI (gh) is not installed on this machine");
        }
        const stderr = String(error?.stderr ?? "").trim();
        const detail = stderr.length > 0 ? stderr.split("\n")[0] : String(error?.message ?? error);
        throw new FetchFailure(`gh ${args[0]} failed: ${detail}`);
    }
}

/** Run a `gh api` call and parse the JSON it returns. */
export async function ghApi(path, extra = []) {
    const stdout = await gh(["api", path, ...extra]);
    try {
        return JSON.parse(stdout);
    } catch {
        throw new FetchFailure(`the forge returned something that is not JSON for ${path}`);
    }
}

/** A TypeScript source literal for arbitrary JSON-shaped data, safe to write to disk. */
export function toSourceLiteral(value, indent = 1) {
    const pad = "    ".repeat(indent);
    const closePad = "    ".repeat(indent - 1);

    if (value === null) return "null";
    if (typeof value === "boolean") return String(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error(`refusing to emit a non-finite number: ${value}`);
        return String(value);
    }
    if (typeof value === "string") return JSON.stringify(value);

    if (Array.isArray(value)) {
        if (value.length === 0) return "[]";
        const items = value.map((item) => `${pad}${toSourceLiteral(item, indent + 1)},`).join("\n");
        return `[\n${items}\n${closePad}]`;
    }

    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (entries.length === 0) return "{}";
    const body = entries
        .map(([key, item]) => {
            // A bare identifier where the key allows one, so the generated module reads
            // like the hand-written default it replaces rather than like pasted JSON.
            const name = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
            return `${pad}${name}: ${toSourceLiteral(item, indent + 1)},`;
        })
        .join("\n");
    return `{\n${body}\n${closePad}}`;
}

/**
 * Write a generated content module.
 *
 * The output is prettier-shaped TypeScript with a loud header, because a generated file
 * that looks hand-written is a generated file somebody edits.
 */
export async function writeGeneratedModule({ file, header, typeName, exportName, value }) {
    const source = [
        "/**",
        ...header.map((line) => (line.length > 0 ? ` * ${line}` : " *")),
        " */",
        "",
        `import type { ${typeName} } from "../types.js";`,
        "",
        `export const ${exportName}: ${typeName} = ${toSourceLiteral(value)};`,
        "",
    ].join("\n");

    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, source, "utf8");
    return source;
}

/** Read a JSON file, returning null when it is absent or unparseable. */
export async function readJsonFile(file) {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    } catch {
        return null;
    }
}

/** One line of output, prefixed so it is findable in a workflow log. */
export function log(scriptName, message) {
    process.stdout.write(`[${scriptName}] ${message}\n`);
}

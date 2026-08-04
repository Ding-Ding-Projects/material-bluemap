/** Small shared helpers. Node built-ins only — `tools/` installs nothing. */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/**
 * Runs a command, streaming its output to this process' stderr, and resolves with the
 * exit code. Never rejects on a non-zero exit — the caller decides what that means.
 *
 * @param {string} command
 * @param {string[]} args
 * `shell` is opt-in and defaults to off, because a shell re-parses the arguments and every
 * path this harness passes around is a Windows path with spaces in it. The one caller that
 * needs it is spawning `pnpm`, which on Windows is a `.cmd` shim that `CreateProcess`
 * cannot execute directly.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd?: string, env?: Record<string, string>, quiet?: boolean, capture?: boolean,
 *          shell?: boolean}} [options]
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
export function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: { ...process.env, ...(options.env ?? {}) },
            stdio: ["ignore", "pipe", "pipe"],
            shell: options.shell ?? false,
        });

        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
            if (!options.quiet && !options.capture) process.stderr.write(chunk);
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
            if (!options.quiet) process.stderr.write(chunk);
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    });
}

/** Every regular file under `root`, as paths relative to `root`, using "/" separators. */
export async function listFiles(root) {
    const found = [];
    async function walk(directory) {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch (error) {
            if (error && error.code === "ENOENT") return;
            throw error;
        }
        for (const entry of entries) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.isFile()) found.push(relative(root, path).split(sep).join("/"));
        }
    }
    await walk(root);
    found.sort();
    return found;
}

export async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

export async function isDirectory(path) {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

export function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

/** ANSI-free logging so a redirected log stays readable. */
export function log(...parts) {
    process.stderr.write(parts.join(" ") + "\n");
}

export function formatDuration(milliseconds) {
    if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
    const seconds = milliseconds / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${(seconds - minutes * 60).toFixed(0)}s`;
}

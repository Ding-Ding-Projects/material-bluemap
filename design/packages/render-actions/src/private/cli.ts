#!/usr/bin/env node
/**
 * The commands the private render workflow calls.
 *
 * Kept apart from the main `cli.js` on purpose. Everything in here handles a key, and a
 * separate entry point means the public render path cannot accidentally grow a flag that
 * takes one - which is how a secret ends up on a command line, and from there in a
 * process list and a log.
 *
 * Two rules hold throughout:
 *
 * - **Nothing readable about the private side is ever printed.** Labels go in, digests
 *   come out. The workflow passes labels through the environment rather than as
 *   arguments, so they do not appear in a process list either.
 * - **Every failure is a refusal.** A missing key, a failed authentication, a short
 *   payload: the command exits non-zero with a sentence saying what stopped and why.
 *   There is no path here that carries on with something unencrypted.
 */

import { appendFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PrivateCryptoError, keyFromEnvironment } from "./crypto.js";
import {
    assetPattern,
    deriveLegacyProjectId,
    deriveProjectId,
    manifestAssetName,
    stagingTag,
} from "./ids.js";
import { PrivatePayloadError, openPayload, readManifest, sealPayload } from "./payload.js";

const USAGE = `Worldlens private transport

Seals and opens the encrypted payloads that move a private world to a public runner and
the rendered map back again. Every command needs the encryption key, which is read from
an environment variable and never taken as an argument.

Commands:
  id      derive the opaque identifier for a label, without touching any data
  seal    encrypt a file into parts plus a manifest
  open    verify and decrypt parts back into the original file
  check   prove the key and the required secrets are present before anything runs

Run "<command> --help" for the options of each.
`;

const ID_USAGE = `id [options]

  --key-env <VAR>        environment variable holding the key (default PRIVATE_WORLD_KEY)
  --label-env <VAR>      environment variable holding the label to derive from
  --label <text>         the label, when it is not sensitive; prefer --label-env
  --suffix <text>        extends the label, e.g. "shard|3"; carries nothing private
  --staging <run-id>     derive a staging release tag for this run instead of an asset id
  --github-output <path> write project-id, manifest and pattern for Actions
`;

const SEAL_USAGE = `seal --in <file> --out <dir> [options]

  --in <file>            the file to seal, usually a tar of a world or a rendered map
  --out <dir>            where the sealed parts and the manifest are written
  --key-env <VAR>        environment variable holding the key (default PRIVATE_WORLD_KEY)
  --label-env <VAR>      environment variable holding the label to derive the id from
  --label <text>         the label, when it is not sensitive; prefer --label-env
  --suffix <text>        extends the label, e.g. "shard|3"; carries nothing private
  --part-bytes <n>       override the 50 MB part size; for tests, not for runs
  --github-output <path> write project-id, part-count, manifest and pattern for Actions
`;

const OPEN_USAGE = `open --in <dir> --out <file> [options]

  --in <dir>             the directory the sealed files were downloaded into
  --out <file>           where the reassembled plaintext is written
  --key-env <VAR>        environment variable holding the key (default PRIVATE_WORLD_KEY)
  --label-env <VAR>      environment variable holding the label to derive the id from
  --label <text>         the label, when it is not sensitive; prefer --label-env
  --suffix <text>        extends the label, e.g. "shard|3"; carries nothing private
  --github-output <path> write part-count and total-bytes for Actions
`;

const CHECK_USAGE = `check [options]

  --key-env <VAR>        environment variable holding the key (default PRIVATE_WORLD_KEY)
  --require <VAR>        an environment variable that must be set; repeatable
`;

const DEFAULT_KEY_ENV = "PRIVATE_WORLD_KEY";

interface Args {
    readonly flags: Map<string, string>;
    readonly repeated: Map<string, string[]>;
    readonly booleans: Set<string>;
}

function parseArgs(argv: readonly string[]): Args {
    const flags = new Map<string, string>();
    const repeated = new Map<string, string[]>();
    const booleans = new Set<string>();

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === undefined || !arg.startsWith("--")) continue;
        const name = arg.slice(2);
        const next = argv[index + 1];

        if (next === undefined || next.startsWith("--")) {
            booleans.add(name);
            continue;
        }

        flags.set(name, next);
        const bucket = repeated.get(name);
        if (bucket === undefined) repeated.set(name, [next]);
        else bucket.push(next);
        index++;
    }

    return { flags, repeated, booleans };
}

function required(args: Args, name: string, usage: string): string {
    const value = args.flags.get(name);
    if (value === undefined) {
        process.stderr.write(`Missing required option --${name}\n\n${usage}`);
        process.exit(2);
    }
    return value;
}

/**
 * The label, preferring the environment.
 *
 * A world name on a command line is visible in a process list and in anything that
 * echoes the command, which on a public runner is the log. `--label-env` names a
 * variable instead, and the variable's *value* never reaches this process's arguments.
 *
 * `--suffix` extends it - `shard|3`, `release|<run id>` - so one secret label yields
 * every identifier a run needs, each unrelated to the others as far as anyone watching
 * can tell. The suffix itself carries nothing private, which is why it is allowed on the
 * command line while the label is not.
 */
function resolveLabel(args: Args): string {
    const suffix = args.flags.get("suffix");
    const base = resolveBaseLabel(args);
    return suffix === undefined ? base : `${base}|${suffix}`;
}

function resolveBaseLabel(args: Args): string {
    const fromEnv = args.flags.get("label-env");
    if (fromEnv !== undefined) {
        const value = process.env[fromEnv];
        if (value === undefined || value.trim() === "") {
            process.stderr.write(`${fromEnv} is not set, so there is no label to derive from.\n`);
            process.exit(2);
        }
        return value.trim();
    }

    const direct = args.flags.get("label");
    if (direct !== undefined) return direct;

    process.stderr.write("Give either --label-env <VAR> or --label <text>.\n");
    return process.exit(2);
}

async function writeGithubOutput(
    path: string | undefined,
    values: readonly (readonly [string, string])[],
): Promise<void> {
    if (path === undefined) return;
    await mkdir(dirname(resolve(path)), { recursive: true });
    await appendFile(
        path,
        `${values.map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
        "utf8",
    );
}

async function commandId(args: Args): Promise<number> {
    if (args.booleans.has("help")) {
        process.stdout.write(ID_USAGE);
        return 0;
    }

    const key = keyFromEnvironment(args.flags.get("key-env") ?? DEFAULT_KEY_ENV);
    const label = resolveLabel(args);
    const runId = args.flags.get("staging");

    const projectId =
        runId === undefined ? deriveProjectId(key, label) : stagingTag(key, label, runId);

    await writeGithubOutput(args.flags.get("github-output"), [
        ["project-id", projectId],
        ["manifest", manifestAssetName(projectId)],
        ["pattern", assetPattern(projectId)],
    ]);

    // The digest, and nothing else. Whatever it was derived from stays where it was.
    process.stdout.write(`${projectId}\n`);
    return 0;
}

async function commandSeal(args: Args): Promise<number> {
    if (args.booleans.has("help")) {
        process.stdout.write(SEAL_USAGE);
        return 0;
    }

    const key = keyFromEnvironment(args.flags.get("key-env") ?? DEFAULT_KEY_ENV);
    const label = resolveLabel(args);
    const projectId = deriveProjectId(key, label);

    const partBytesRaw = args.flags.get("part-bytes");
    const partBytes = partBytesRaw === undefined ? undefined : Number(partBytesRaw);
    if (partBytes !== undefined && (!Number.isFinite(partBytes) || partBytes <= 0)) {
        throw new Error("--part-bytes must be a positive number of bytes");
    }

    const report = await sealPayload({
        key,
        inputPath: resolve(required(args, "in", SEAL_USAGE)),
        outputDirectory: resolve(required(args, "out", SEAL_USAGE)),
        projectId,
        ...(partBytes === undefined ? {} : { partBytes }),
    });

    process.stderr.write(
        `Sealed ${report.totalBytes} bytes into ${report.partCount} part(s) as ${projectId}.*\n`,
    );

    await writeGithubOutput(args.flags.get("github-output"), [
        ["project-id", report.projectId],
        ["part-count", String(report.partCount)],
        ["total-bytes", String(report.totalBytes)],
        ["manifest", manifestAssetName(projectId)],
        ["pattern", assetPattern(projectId)],
    ]);

    process.stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
}

async function commandOpen(args: Args): Promise<number> {
    if (args.booleans.has("help")) {
        process.stdout.write(OPEN_USAGE);
        return 0;
    }

    const key = keyFromEnvironment(args.flags.get("key-env") ?? DEFAULT_KEY_ENV);
    const label = resolveLabel(args);
    const inputDirectory = resolve(required(args, "in", OPEN_USAGE));

    // Said before anything is decrypted, because "the download brought nothing" and "the
    // payload failed to authenticate" are very different problems with very different
    // fixes, and a bare authentication error for an empty directory sends somebody
    // looking at their key.
    const present = await readdir(inputDirectory).catch(() => [] as string[]);
    if (present.length === 0) {
        throw new PrivatePayloadError(
            "no-manifest",
            `Nothing was downloaded into ${inputDirectory}, so there is no payload to open.`,
        );
    }

    const currentProjectId = deriveProjectId(key, label);
    const legacyProjectId = deriveLegacyProjectId(key, label);
    const projectId = present.includes(manifestAssetName(currentProjectId))
        ? currentProjectId
        : present.includes(manifestAssetName(legacyProjectId))
          ? legacyProjectId
          : currentProjectId;

    const manifest = await readManifest({ key, inputDirectory, projectId });
    process.stderr.write(`Opening ${manifest.partCount} part(s), ${manifest.totalBytes} bytes\n`);

    const report = await openPayload({
        key,
        inputDirectory,
        outputPath: resolve(required(args, "out", OPEN_USAGE)),
        projectId,
    });

    await writeGithubOutput(args.flags.get("github-output"), [
        ["part-count", String(report.partCount)],
        ["total-bytes", String(report.totalBytes)],
    ]);

    process.stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
}

/**
 * Proves the run can work before it starts doing anything.
 *
 * A private render that discovers a missing secret in its third job has already spent
 * two jobs' worth of time, and - much worse - has already decrypted a world onto a
 * runner. Failing in the first thirty seconds is both cheaper and safer.
 */
function commandCheck(args: Args): number {
    if (args.booleans.has("help")) {
        process.stdout.write(CHECK_USAGE);
        return 0;
    }

    const keyVariable = args.flags.get("key-env") ?? DEFAULT_KEY_ENV;
    // Throws with a clear message when it is absent or the wrong length. The key itself
    // is never printed, and neither is any part of it.
    keyFromEnvironment(keyVariable);

    const missing = (args.repeated.get("require") ?? []).filter((variable) => {
        const value = process.env[variable];
        return value === undefined || value.trim() === "";
    });

    if (missing.length > 0) {
        process.stderr.write(
            `These secrets are not set, so the private render cannot run: ${missing.join(", ")}.\n` +
                "Nothing was decrypted and nothing was published.\n",
        );
        return 1;
    }

    process.stderr.write(`${keyVariable} is present and well formed; required secrets are set.\n`);
    return 0;
}

async function main(argv: readonly string[]): Promise<number> {
    const command = argv[0];
    const args = parseArgs(argv.slice(1));

    switch (command) {
        case "id":
            return await commandId(args);
        case "seal":
            return await commandSeal(args);
        case "open":
            return await commandOpen(args);
        case "check":
            return commandCheck(args);
        case "--help":
        case "-h":
        case undefined:
            process.stdout.write(USAGE);
            return command === undefined ? 2 : 0;
        default:
            process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
            return 2;
    }
}

main(process.argv.slice(2))
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error: unknown) => {
        // A transport failure is a sentence, not a stack trace: it is going to be read in
        // a workflow log by somebody deciding what to fix.
        if (error instanceof PrivateCryptoError || error instanceof PrivatePayloadError) {
            process.stderr.write(`${error.message}\n`);
        } else {
            process.stderr.write(
                `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
            );
        }
        process.exitCode = 1;
    });

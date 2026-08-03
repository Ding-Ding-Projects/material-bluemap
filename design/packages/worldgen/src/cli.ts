#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { defaultZipName, generateWorld, zipWorld } from "./generateWorld.js";
import { DATA_VERSION, VERSION_NAME } from "./version.js";

const USAGE = `material-bluemap worldgen

Generates a deterministic synthetic Minecraft world directly in anvil format.
It is written byte by byte by this repository; no Minecraft server or client is
involved, and nothing is downloaded.

Usage:
  worldgen --seed <n> --size <blocks> --out <dir> [options]

Options:
  --seed <n>        world seed; the world is a function of this alone (required)
  --size <blocks>   edge length of the generated square, in blocks (default 1000)
  --out <dir>       directory the world folder is created in (default ".")
  --name <str>      world folder name (default "test-world-seed-<seed>")
  --zip <path>      archive path (default "<out>/test-world-seed-<seed>.zip")
  --no-zip          write the world folder only, no archive
  --quiet           no progress output
  --help            this text

Output:
  progress on stderr, a JSON summary of the generated world on stdout.
`;

interface CliOptions {
    seed: number;
    size: number;
    out: string;
    name: string | undefined;
    zip: string | undefined;
    writeZip: boolean;
    quiet: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions | null {
    let seed: number | undefined;
    let size = 1000;
    let out = ".";
    let name: string | undefined;
    let zip: string | undefined;
    let writeZip = true;
    let quiet = false;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!;
        const next = (): string => {
            const value = argv[++i];
            if (value === undefined) throw new Error("Missing value for " + arg);
            return value;
        };

        switch (arg) {
            case "--help":
            case "-h":
                return null;
            case "--seed":
                seed = parseIntegerArg(arg, next());
                break;
            case "--size":
                size = parseIntegerArg(arg, next());
                break;
            case "--out":
                out = next();
                break;
            case "--name":
                name = next();
                break;
            case "--zip":
                zip = next();
                break;
            case "--no-zip":
                writeZip = false;
                break;
            case "--quiet":
                quiet = true;
                break;
            default:
                throw new Error("Unknown argument: " + arg);
        }
    }

    if (seed === undefined) throw new Error("--seed is required");
    if (size <= 0) throw new Error("--size must be positive, got " + size);

    return { seed, size, out, name, zip, writeZip, quiet };
}

function parseIntegerArg(flag: string, raw: string): number {
    if (!/^-?\d+$/.test(raw)) throw new Error(flag + " expects an integer, got '" + raw + "'");
    const value = Number(raw);
    if (!Number.isSafeInteger(value))
        throw new Error(flag + " is outside the safe integer range: " + raw);
    return value;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KiB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MiB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GiB";
}

async function main(): Promise<number> {
    let options: CliOptions | null;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(String(error instanceof Error ? error.message : error) + "\n\n");
        process.stderr.write(USAGE);
        return 2;
    }

    if (options === null) {
        process.stdout.write(USAGE);
        return 0;
    }

    // narrowed into a const so the callbacks below can see it as non-null
    const settings = options;

    const outDir = resolve(settings.out);
    await mkdir(outDir, { recursive: true });

    const log = (message: string): void => {
        if (!settings.quiet) process.stderr.write(message + "\n");
    };

    log(
        "Generating a " +
            settings.size +
            "x" +
            settings.size +
            " block world, seed " +
            settings.seed +
            ", Minecraft " +
            VERSION_NAME +
            " (DataVersion " +
            DATA_VERSION +
            ")",
    );

    const started = Date.now();
    let lastReport = 0;

    const world = await generateWorld({
        seed: settings.seed,
        size: settings.size,
        outDir,
        ...(settings.name !== undefined ? { name: settings.name } : {}),
        onProgress: (done, total) => {
            if (settings.quiet) return;
            const now = Date.now();
            if (done !== total && now - lastReport < 2000) return;
            lastReport = now;
            const percent = ((done / total) * 100).toFixed(1);
            process.stderr.write("  " + done + "/" + total + " chunks (" + percent + "%)\n");
        },
    });

    log(
        "World folder: " +
            world.worldFolder +
            " (" +
            formatBytes(world.bytes) +
            ", " +
            world.chunkCount +
            " chunks in " +
            world.regionFiles.length +
            " region files)",
    );
    log(
        "Spawn: " +
            world.spawn.x +
            ", " +
            world.spawn.y +
            ", " +
            world.spawn.z +
            "; generated in " +
            ((Date.now() - started) / 1000).toFixed(1) +
            " s",
    );

    let zipPath: string | null = null;
    let zipBytes = 0;
    if (settings.writeZip) {
        zipPath =
            settings.zip === undefined
                ? join(outDir, defaultZipName(settings.seed))
                : isAbsolute(settings.zip)
                  ? settings.zip
                  : resolve(settings.zip);
        const zipStarted = Date.now();
        zipBytes = await zipWorld(world, zipPath);
        log(
            "Archive: " +
                zipPath +
                " (" +
                formatBytes(zipBytes) +
                ", packed in " +
                ((Date.now() - zipStarted) / 1000).toFixed(1) +
                " s)",
        );
    }

    process.stdout.write(
        JSON.stringify(
            {
                seed: world.seed,
                size: world.size,
                name: world.name,
                worldFolder: world.worldFolder,
                chunkCount: world.chunkCount,
                chunksPerAxis: world.chunksPerAxis,
                regionFiles: world.regionFiles,
                dataVersion: world.dataVersion,
                versionName: world.versionName,
                spawn: world.spawn,
                worldBytes: world.bytes,
                zipPath,
                zipBytes,
                elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
            },
            null,
            2,
        ) + "\n",
    );

    return 0;
}

main().then(
    (code) => {
        process.exitCode = code;
    },
    (error: unknown) => {
        process.stderr.write(
            "worldgen failed: " + (error instanceof Error ? error.stack : String(error)) + "\n",
        );
        process.exitCode = 1;
    },
);

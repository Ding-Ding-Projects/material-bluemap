/**
 * Listing a directory on the remote host, over the same `ssh` this whole package already
 * trusts, for a Windows-Explorer-style browser rather than a typed path.
 *
 * ## Why this is not `preflight.ts`'s style of round trip
 *
 * A directory can hold thousands of entries, and the browser also wants to know - cheaply,
 * without downloading anything - which of them look like a Minecraft world, so somebody can
 * see where their world is rather than guess. Doing that as "list, then probe each row" would
 * be one SSH round trip per candidate folder, which is slow on a real network and would make
 * opening a folder with forty saves in it visibly hang. So every check below happens inside
 * **one** remote command: the listing, the `level.dat` check and the region-folder check for
 * every entry, in a single script, in a single round trip. `world/inspect.ts` reads exactly
 * this signal locally; this module asks the same three questions of a folder that never
 * touches this computer's disk.
 *
 * ## Two remotes, two scripts, one reason each
 *
 * A Windows `ssh` server's default shell is `cmd.exe` unless an administrator changed it, and
 * this application has no way to know which. Rather than guess, the Windows path never
 * relies on remote shell quoting at all: it invokes `powershell.exe` with
 * `-EncodedCommand`, a base64 blob of UTF-16LE script text. Base64 contains no character any
 * shell - `cmd.exe`, `sh`, or PowerShell itself, if that happens to already be the login
 * shell - treats specially, so the five words this sends (`powershell`, three flags, and the
 * blob) are safe to hand to `ssh` completely unquoted and work identically whichever shell
 * receives them first.
 *
 * The Linux path is the reverse: an ordinary POSIX `sh -c '<script>'`, sent through
 * {@link sshCommandRunner} exactly as `preflight.ts` sends its own scripts, so the same
 * single-quote escaping that already protects a world folder called `Saves, old (2)`
 * protects this listing too.
 *
 * ## What is never guessed
 *
 * A folder is only ever called a world when it has **both** `level.dat` and at least one
 * region folder in one of the fixed places Minecraft actually writes them (the same three
 * literals `world/inspect.ts` checks locally - see the note beside where they are restated
 * below). A folder with only one of the two signals is reported with that partial signal and
 * is never called a world: a guess dressed up as certainty sends somebody to render the wrong
 * folder.
 *
 * Only datapack/mod dimensions (`dimensions/<namespace>/<name>/region`) are left out of the
 * remote signal that `inspect.ts` also checks locally - finding those needs two more levels
 * of remote listing per candidate, which is exactly the per-row round trip this module exists
 * to avoid. A world using only a custom dimension and no vanilla one is rare enough that this
 * module still reports it correctly by `level.dat` alone, just without a region folder named
 * in the reason.
 */

import { execFileCommandRunner, type CommandOptions, type CommandOutput, type CommandRunner } from "../runtime/command.js";
import {
    classifySshOutput,
    quoteForRemoteShell,
    sshArguments,
    sshCommandRunner,
    type SshOptionsInput,
} from "./ssh.js";

/**
 * The same three literals `world/inspect.ts` reads locally, restated rather than imported.
 *
 * `world/inspect.ts` is a shared file this lane does not own, and its module-scope constants
 * are not exported - so this is a deliberate, small duplication of three string literals
 * rather than a dependency on another lane's internals changing shape underneath this one.
 * If `world/inspect.ts` ever exports these, importing them here removes the duplication in
 * one line; until then, keeping the spelling in one comment beside the other is how the two
 * are kept honest with each other.
 */
const LEVEL_DAT = "level.dat";
const REGION = "region";
const VANILLA_DIMENSIONS = ["DIM-1", "DIM1"] as const;

export type RemoteOs = "linux" | "windows";

/** `/` for a Linux remote, `\` for a Windows one. Never guessed from the path somebody typed. */
export function remoteSeparator(os: RemoteOs): "/" | "\\" {
    return os === "windows" ? "\\" : "/";
}

/**
 * What is known about whether a folder is a Minecraft world, from the cheap signal alone.
 *
 * Never a single boolean. `hasLevelDat` and `regionDimensions` are reported separately so a
 * caller - and the person reading the browser - can be told exactly which half of the
 * evidence is present when it is not both, instead of a bare "no".
 */
export interface RemoteWorldSignal {
    readonly hasLevelDat: boolean;
    /** The fixed-location dimension folders that were found, e.g. `["region", "DIM-1/region"]`. */
    readonly regionDimensions: readonly string[];
    /** True only when both signals are present. A partial signal is never reported as a world. */
    readonly looksLikeWorld: boolean;
}

const NO_WORLD_SIGNAL: RemoteWorldSignal = {
    hasLevelDat: false,
    regionDimensions: [],
    looksLikeWorld: false,
};

function worldSignal(hasLevelDat: boolean, regionDimensions: readonly string[]): RemoteWorldSignal {
    return { hasLevelDat, regionDimensions, looksLikeWorld: hasLevelDat && regionDimensions.length > 0 };
}

export interface RemoteEntry {
    /** The entry's own name. Never a full path: the caller joins it with {@link remoteSeparator}. */
    readonly name: string;
    readonly directory: boolean;
    /** True for a symbolic link (or, on Windows, a reparse point). Never followed for the world signal. */
    readonly symlink: boolean;
    /** Bytes, or null for a directory. */
    readonly sizeBytes: number | null;
    /** ISO 8601, or null when the remote could not report one. */
    readonly modifiedAt: string | null;
    /** {@link NO_WORLD_SIGNAL} for every file and for a symlinked directory, which is never probed. */
    readonly world: RemoteWorldSignal;
}

export interface RemoteDirectoryListing {
    /** The path that was listed, exactly as it was given. */
    readonly path: string;
    readonly os: RemoteOs;
    readonly separator: "/" | "\\";
    readonly entries: readonly RemoteEntry[];
    /** True when more entries existed than {@link BrowseOptions.maxEntries} allowed through. */
    readonly truncated: boolean;
    /** How many entries the remote actually reported, which may exceed `entries.length`. */
    readonly totalEntries: number;
}

export type RemoteBrowseFailureCode =
    | "not-found"
    | "not-a-directory"
    | "permission-denied"
    | "symlink-loop"
    | "unreachable"
    | "remote-failed";

export type RemoteBrowseOutcome =
    | { readonly ok: true; readonly listing: RemoteDirectoryListing }
    | {
          readonly ok: false;
          readonly code: RemoteBrowseFailureCode;
          readonly message: string;
          readonly detail: string | null;
      };

export interface BrowseOptions extends SshOptionsInput {
    readonly ssh?: string;
    readonly runner?: CommandRunner;
    readonly timeoutMs?: number;
    /** Caps how many entries a single listing reads. Defaults to {@link DEFAULT_MAX_ENTRIES}. */
    readonly maxEntries?: number;
    /** Skips detection and uses this OS. Mainly for tests; a real caller lets it detect. */
    readonly os?: RemoteOs;
}

/** Generous enough that no ordinary folder hits it; bounded so a `region` folder cannot hang the browser. */
export const DEFAULT_MAX_ENTRIES = 2048;

/* -------------------------------------------------------------------------- */
/* Which remote this is                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `uname -s`, read defensively.
 *
 * Never rejects and never reports a third answer: this application supports Linux and
 * Windows remotes, and every Windows OpenSSH server it has been tried against has no
 * `uname` on its `PATH` at all - not even under WSL, since the SSH server itself runs
 * outside WSL. So a failed, refused or unrecognised answer is read as Windows rather than
 * as a fourth OS this module does not yet handle. A future macOS or BSD remote would also
 * land here today, and would be misread as Windows until this function is taught its name -
 * which is the honest limit of what "Linux and Windows" as stated can promise, not a silent
 * gap.
 */
export async function detectRemoteOs(remote: CommandRunner): Promise<RemoteOs> {
    const result = await remote("uname", ["-s"]);
    if (result.ok && /linux/i.test(result.stdout)) return "linux";
    return "windows";
}

/* -------------------------------------------------------------------------- */
/* Linux: one `sh -c` script, single-quoted like every other script here      */
/* -------------------------------------------------------------------------- */

/**
 * The POSIX listing script.
 *
 * One `stat` per entry (for size and modification time; POSIX `sh` has no builtin for
 * either) and, for every entry that is a real directory and not a symlink, up to four
 * builtin `[ -f ]`/`[ -d ]` tests for the world signal - no extra fork per candidate, and
 * no fork at all for the signal itself. Existence, directory-ness and readability are
 * checked before the loop, so "there is nothing there", "that is a file" and "this account
 * cannot read it" are three different exit codes rather than one folded-together failure.
 */
function linuxListingScript(path: string, maxEntries: number): string {
    const target = quoteForRemoteShell(path);
    return [
        `TARGET=${target}`,
        // A broken or self-referential symlink is reported by name: `-e` is false for both
        // "nothing here" and "a link that never resolves", and only `-L` tells them apart.
        `if [ ! -e "$TARGET" ]; then`,
        `  if [ -L "$TARGET" ]; then echo 'MB_ERR:LOOP'; exit 5; fi`,
        `  echo 'MB_ERR:NOENT'; exit 2`,
        `fi`,
        `if [ ! -d "$TARGET" ]; then echo 'MB_ERR:NOTDIR'; exit 3; fi`,
        `if [ ! -r "$TARGET" ] || ! cd "$TARGET" 2>/dev/null; then echo 'MB_ERR:DENIED'; exit 4; fi`,
        `total=0`,
        `count=0`,
        `for f in .* *; do`,
        `  [ "$f" = '.' ] && continue`,
        `  [ "$f" = '..' ] && continue`,
        `  [ -e "$f" ] || [ -L "$f" ] || continue`,
        `  total=$((total+1))`,
        `  [ $count -ge ${String(maxEntries)} ] && continue`,
        `  count=$((count+1))`,
        `  if [ -L "$f" ]; then sym=1; else sym=0; fi`,
        `  if [ -d "$f" ]; then kind=d; else kind=f; fi`,
        `  info=$(stat --format='%s\\t%Y' -- "$f" 2>/dev/null) || info='0\\t0'`,
        `  level=0; dims=''`,
        `  if [ "$kind" = d ] && [ "$sym" = 0 ]; then`,
        `    [ -f "$f/${LEVEL_DAT}" ] && level=1`,
        `    [ -d "$f/${REGION}" ] && dims="\${dims}${REGION},"`,
        ...VANILLA_DIMENSIONS.map(
            (dimension) =>
                `    [ -d "$f/${dimension}/${REGION}" ] && dims="\${dims}${dimension}/${REGION},"`,
        ),
        `  fi`,
        `  printf 'E\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$kind" "$sym" "$info" "$level" "$dims" "$f"`,
        `done`,
        `printf 'T\\t%s\\t%s\\n' "$total" "$count"`,
    ].join("\n");
}

interface ParsedLinuxRow {
    readonly kind: "d" | "f";
    readonly symlink: boolean;
    readonly sizeBytes: number;
    readonly mtimeEpochSeconds: number;
    readonly hasLevelDat: boolean;
    readonly regionDimensions: readonly string[];
    readonly name: string;
}

/** Reads the script's own stdout, which is exactly the shape {@link linuxListingScript} writes. */
export function parseLinuxListing(
    stdout: string,
): { readonly rows: readonly ParsedLinuxRow[]; readonly total: number } {
    const rows: ParsedLinuxRow[] = [];
    let total = 0;
    for (const line of stdout.split("\n")) {
        if (line === "") continue;
        const fields = line.split("\t");
        if (fields[0] === "T") {
            total = Number.parseInt(fields[1] ?? "0", 10) || 0;
            continue;
        }
        if (fields[0] !== "E") continue;
        // E, kind, sym, size, mtime, level, dims, name - and `name` may itself legitimately
        // contain a tab, so it is rejoined from every field past the fixed six rather than
        // taken as `fields[7]` alone.
        const [, kind, sym, size, mtime, level, dims, ...nameParts] = fields;
        const name = nameParts.join("\t");
        if (name === "") continue;
        rows.push({
            kind: kind === "d" ? "d" : "f",
            symlink: sym === "1",
            sizeBytes: Number.parseInt(size ?? "0", 10) || 0,
            mtimeEpochSeconds: Number.parseInt(mtime ?? "0", 10) || 0,
            hasLevelDat: level === "1",
            regionDimensions: (dims ?? "").split(",").filter((part) => part !== ""),
            name,
        });
    }
    return { rows, total };
}

async function browseLinux(path: string, options: BrowseOptions): Promise<RemoteBrowseOutcome> {
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const remote = sshCommandRunner(options);
    const script = linuxListingScript(path, maxEntries);
    const commandOptions: CommandOptions =
        options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };
    const output = await remote("sh", ["-c", script], commandOptions);

    const connectivity = connectivityFailure(output);
    if (connectivity !== null) return connectivity;

    if (!output.ok) {
        const marker = /MB_ERR:(NOENT|NOTDIR|DENIED|LOOP)/.exec(output.stdout);
        if (marker?.[1] === "NOENT") {
            return refuse("not-found", `There is nothing at ${path} on this remote.`, null);
        }
        if (marker?.[1] === "NOTDIR") {
            return refuse("not-a-directory", `${path} is a file, not a folder.`, null);
        }
        if (marker?.[1] === "DENIED") {
            return refuse(
                "permission-denied",
                `${path} could not be read: this account is not allowed to open it.`,
                null,
            );
        }
        if (marker?.[1] === "LOOP") {
            return refuse(
                "symlink-loop",
                `${path} is a link that never resolves to a real folder.`,
                null,
            );
        }
        return refuse("remote-failed", `${path} could not be listed.`, firstNonEmptyLine(output.stderr));
    }

    const { rows, total } = parseLinuxListing(output.stdout);
    const entries: RemoteEntry[] = rows.map((row) => ({
        name: row.name,
        directory: row.kind === "d",
        symlink: row.symlink,
        sizeBytes: row.kind === "d" ? null : row.sizeBytes,
        modifiedAt: epochSecondsToIso(row.mtimeEpochSeconds),
        world: row.kind === "d" && !row.symlink ? worldSignal(row.hasLevelDat, row.regionDimensions) : NO_WORLD_SIGNAL,
    }));

    return {
        ok: true,
        listing: {
            path,
            os: "linux",
            separator: "/",
            entries,
            truncated: total > entries.length,
            totalEntries: total,
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Windows: one PowerShell script, sent as an unquoted -EncodedCommand blob   */
/* -------------------------------------------------------------------------- */

/** A literal for a PowerShell single-quoted string: double any embedded quote, nothing else. */
function powerShellLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function windowsListingScript(path: string, maxEntries: number): string {
    const target = powerShellLiteral(path);
    const levelDat = powerShellLiteral(LEVEL_DAT);
    const dimensionPairs: readonly (readonly [string, string])[] = [
        [REGION, REGION],
        ...VANILLA_DIMENSIONS.map(
            (dimension): readonly [string, string] => [`${dimension}\\${REGION}`, `${dimension}/${REGION}`],
        ),
    ];
    const dimensionPairsLiteral = dimensionPairs
        .map(([native, reported]) => `@(${powerShellLiteral(native)}, ${powerShellLiteral(reported)})`)
        .join(", ");

    return [
        "$ErrorActionPreference = 'Stop'",
        "$result = @{}",
        `$target = ${target}`,
        "try {",
        "  if (-not (Test-Path -LiteralPath $target)) {",
        // `Test-Path` resolves a reparse point's target and is false for both "nothing
        // here" and "a link that never resolves" - `Get-Item -Force` on the link itself
        // does not need to resolve it, so its success is what tells the two apart.
        "    $probe = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue",
        "    if ($null -ne $probe) { $result = @{ ok = $false; error = 'LOOP' } }",
        "    else { $result = @{ ok = $false; error = 'NOENT' } }",
        "  } elseif (-not (Get-Item -LiteralPath $target -Force).PSIsContainer) {",
        "    $result = @{ ok = $false; error = 'NOTDIR' }",
        "  } else {",
        "    $all = $null",
        "    try {",
        "      $all = @(Get-ChildItem -LiteralPath $target -Force -ErrorAction Stop)",
        "    } catch {",
        "      $result = @{ ok = $false; error = 'DENIED' }",
        "    }",
        "    if ($null -ne $all) {",
        `      $capped = $all | Select-Object -First ${String(maxEntries)}`,
        `      $dimPairs = @(${dimensionPairsLiteral})`,
        "      $rows = foreach ($c in $capped) {",
        "        $isDir = $c.PSIsContainer",
        "        $isLink = [bool]($c.Attributes -band [IO.FileAttributes]::ReparsePoint)",
        "        $hasLevel = $false",
        "        $dims = @()",
        "        if ($isDir -and -not $isLink) {",
        `          $hasLevel = Test-Path -LiteralPath (Join-Path $c.FullName ${levelDat}) -PathType Leaf`,
        "          foreach ($pair in $dimPairs) {",
        "            if (Test-Path -LiteralPath (Join-Path $c.FullName $pair[0]) -PathType Container) { $dims += $pair[1] }",
        "          }",
        "        }",
        "        [PSCustomObject]@{",
        "          name = $c.Name",
        "          directory = $isDir",
        "          symlink = $isLink",
        "          size = if ($isDir) { $null } else { $c.Length }",
        "          modified = $c.LastWriteTimeUtc.ToString('o')",
        "          hasLevelDat = $hasLevel",
        "          regionDims = $dims",
        "        }",
        "      }",
        "      $result = @{ ok = $true; entries = @($rows); total = $all.Count; truncated = ($all.Count -gt $capped.Count) }",
        "    }",
        "  }",
        "} catch {",
        "  $result = @{ ok = $false; error = 'FAILED'; message = $_.Exception.Message }",
        "}",
        "$result | ConvertTo-Json -Compress -Depth 6",
    ].join("\n");
}

interface WindowsJsonEntry {
    readonly name: string;
    readonly directory: boolean;
    readonly symlink: boolean;
    readonly size: number | null;
    readonly modified: string | null;
    readonly hasLevelDat: boolean;
    readonly regionDims: readonly string[] | string | null;
}

interface WindowsJsonSuccess {
    readonly ok: true;
    readonly entries: readonly WindowsJsonEntry[] | WindowsJsonEntry;
    readonly total: number;
    readonly truncated: boolean;
}

interface WindowsJsonFailure {
    readonly ok: false;
    readonly error: "NOENT" | "NOTDIR" | "DENIED" | "LOOP" | "FAILED";
    readonly message?: string;
}

/**
 * PowerShell's `ConvertTo-Json` collapses a one-element array to a bare scalar, and an
 * empty one to `null` - so `entries` and `regionDims` both need this before they can be
 * trusted to be arrays at all.
 */
function asStringArray(value: readonly string[] | string | null | undefined): readonly string[] {
    if (value === null || value === undefined) return [];
    if (typeof value === "string") return [value];
    return value;
}

function asEntryArray(
    value: readonly WindowsJsonEntry[] | WindowsJsonEntry | null | undefined,
): readonly WindowsJsonEntry[] {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value as readonly WindowsJsonEntry[];
    return [value as WindowsJsonEntry];
}

async function browseWindows(path: string, options: BrowseOptions): Promise<RemoteBrowseOutcome> {
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const ssh = options.ssh ?? "ssh";
    // The raw local runner - the one that launches `ssh` itself - rather than
    // `sshCommandRunner`, which wraps a runner to execute a command *on the remote host*.
    // Using that here would try to run the local `ssh` binary as a remote command.
    const runner = options.runner ?? execFileCommandRunner;
    const script = windowsListingScript(path, maxEntries);
    // Base64 of the UTF-16LE script: what `-EncodedCommand` expects, and a blob that contains
    // nothing any shell - cmd.exe, sh, or PowerShell itself if that is already the login
    // shell - treats specially. So none of these five words needs the POSIX single-quote
    // escaping `sshCommandRunner` would otherwise apply, and this bypasses it deliberately.
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const argv = [
        ...sshArguments(options),
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encoded,
    ];
    const commandOptions: CommandOptions =
        options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };
    const output = await runner(ssh, argv, commandOptions);

    // This call went through the raw local runner rather than `sshCommandRunner`, since that
    // wrapper is for running a command *on the remote host* and would have tried to run the
    // local `ssh` binary as one. So the SSH-level classification it would otherwise have done
    // - a refused connection, an unreachable host, a missing local `ssh` - is done here by hand
    // with the same {@link classifySshOutput} preflight.ts and ssh.ts already trust.
    if (output.spawnError !== null) {
        return refuse(
            output.spawnError === "ENOENT" ? "remote-failed" : "unreachable",
            output.spawnError === "ENOENT"
                ? "There is no 'ssh' program on this computer."
                : "This remote could not be reached.",
            null,
        );
    }
    if (!output.ok) {
        const outcome = classifySshOutput(output);
        if (outcome !== "remote-failed") {
            return refuse("unreachable", "This remote could not be reached or signed in to.", firstNonEmptyLine(output.stderr));
        }
        // Not an SSH-level failure - PowerShell ran and exited non-zero, which this script
        // is not written to do on purpose. Its own JSON is still tried below; a script that
        // could not even start (PowerShell missing entirely) falls through to the catch.
    }

    let parsed: WindowsJsonSuccess | WindowsJsonFailure;
    try {
        parsed = JSON.parse(output.stdout.trim()) as WindowsJsonSuccess | WindowsJsonFailure;
    } catch {
        return refuse(
            "remote-failed",
            `${path} answered with something this application could not read.`,
            firstNonEmptyLine(output.stdout),
        );
    }

    if (!parsed.ok) {
        switch (parsed.error) {
            case "NOENT":
                return refuse("not-found", `There is nothing at ${path} on this remote.`, null);
            case "NOTDIR":
                return refuse("not-a-directory", `${path} is a file, not a folder.`, null);
            case "DENIED":
                return refuse(
                    "permission-denied",
                    `${path} could not be read: this account is not allowed to open it.`,
                    null,
                );
            case "LOOP":
                return refuse(
                    "symlink-loop",
                    `${path} is a link that never resolves to a real folder.`,
                    null,
                );
            default:
                return refuse(
                    "remote-failed",
                    `${path} could not be listed.`,
                    parsed.message ?? null,
                );
        }
    }

    const rows = asEntryArray(parsed.entries);
    const entries: RemoteEntry[] = rows.map((row) => {
        const dims = asStringArray(row.regionDims);
        return {
            name: row.name,
            directory: row.directory,
            symlink: row.symlink,
            sizeBytes: row.directory ? null : row.size,
            modifiedAt: row.modified,
            world:
                row.directory && !row.symlink
                    ? worldSignal(row.hasLevelDat, dims)
                    : NO_WORLD_SIGNAL,
        };
    });

    return {
        ok: true,
        listing: {
            path,
            os: "windows",
            separator: "\\",
            entries,
            truncated: parsed.truncated === true,
            totalEntries: parsed.total,
        },
    };
}

/* -------------------------------------------------------------------------- */
/* The entry point                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Lists one remote directory, detecting Linux or Windows first unless {@link BrowseOptions.os}
 * names one. Never rejects: every failure - a bad path, a refused permission, a dead
 * connection - is a value the browser renders, exactly as `preflight.ts` never rejects for
 * the same reason.
 */
export async function browseRemoteDirectory(
    path: string,
    options: BrowseOptions,
): Promise<RemoteBrowseOutcome> {
    if (path.trim() === "") {
        return refuse("not-found", "No folder was given, so there was nothing to list.", null);
    }
    const os = options.os ?? (await detectRemoteOs(sshCommandRunner(options)));
    return os === "windows" ? browseWindows(path, options) : browseLinux(path, options);
}

/* -------------------------------------------------------------------------- */
/* Shared plumbing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A connection-level failure, read from what `sshCommandRunner` already classified.
 *
 * `sshCommandRunner` sets `spawnError` to `"SSH"` for every failure that was the *connection's*
 * rather than the remote command's - refused, unreachable, an unknown or changed host key -
 * and to `"ENOENT"` when the remote shell itself is missing. Neither is this module's script
 * failing; both are the same "could not reach or use this host" that `preflight.ts` exists to
 * catch earlier, and a directory listing run without a preflight first still has to say so
 * rather than reporting a folder that does not exist.
 */
function connectivityFailure(output: CommandOutput): RemoteBrowseOutcome | null {
    if (output.spawnError === "SSH") {
        return refuse("unreachable", "This remote could not be reached or signed in to.", firstNonEmptyLine(output.stderr));
    }
    if (output.spawnError === "ENOENT") {
        return refuse(
            "remote-failed",
            "The remote shell needed to list a folder is not available on this host.",
            firstNonEmptyLine(output.stderr),
        );
    }
    return null;
}

function refuse(
    code: RemoteBrowseFailureCode,
    message: string,
    detail: string | null,
): RemoteBrowseOutcome {
    return { ok: false, code, message, detail };
}

function firstNonEmptyLine(text: string): string | null {
    const line = text
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);
    return line ?? null;
}

function epochSecondsToIso(seconds: number): string | null {
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

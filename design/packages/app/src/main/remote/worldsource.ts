/**
 * A world that lives on a remote host, fetched over the same SSH this folder already speaks.
 *
 * `remote/` already hands a render *to* a Linux machine and brings the map back. This is the
 * other direction: a world that already lives on a machine the person owns - reachable over
 * SSH, on Linux or on Windows - is read from where it is, rather than requiring it to be
 * zipped up and carried here first. It reuses this folder's connection, host-key verification
 * and transfer primitives rather than writing parallel ones:
 *
 * | What | Reused from |
 * |---|---|
 * | the connection, its security options, its quoting | `ssh.ts` |
 * | "is this host key trusted, unknown, or changed" | `hostkey.ts` |
 * | `scp`, and rsync with its `scp` fallback | `transfer.ts`, `rsync.ts` |
 * | every failure sentence | `failure.ts` |
 *
 * ## Two hosts, one honest difference
 *
 * A Linux host very likely has `rsync`, and `chooseTransfer` already prefers it: an
 * interrupted fetch of a Minecraft world's tens of thousands of small region files resumes
 * from where it stopped rather than starting the whole world over. A Windows host very
 * likely does **not** have `rsync` - it does not ship with Windows and is rarely installed -
 * so `chooseTransfer` falls back to `scp`, exactly as it already does for any host missing
 * either end of the pair, and says so in the message it returns. Nothing new was needed for
 * that: `chooseTransfer`'s own honesty is what this module leans on.
 *
 * What Windows needs that Linux does not is a way to even *ask* the question "what host is
 * this" and "what files does it have" without knowing in advance which shell is on the other
 * end of the connection. `windowsShell.ts` is that answer, and {@link surveyRemoteWorld} is
 * what uses it: a cheap listing of every file's size and modification time, which is enough
 * to say a world has not changed without transferring a single region file, on either
 * platform. That survey is also exactly the "cheap change check" a scheduled render wants to
 * run before deciding a render is worth starting at all - {@link diffRemoteWorldSurveys} and
 * {@link remoteWorldChanged} are pure functions, importable with no Electron runtime and no
 * network, for whatever drives that decision.
 *
 * ## What this module does not do
 *
 * It never writes to the remote host. A world source is read from; nothing here creates,
 * deletes or modifies a directory there, which is also why the Windows side needs no
 * PowerShell equivalent of `mkdir -p`/`rm -rf` - those exist in `transfer.ts` only because the
 * *render* side uploads a staging directory, and this module is the download-only mirror of
 * that, not a second copy of it.
 */

import { execFileCommandRunner, type CommandRunner } from "../runtime/command.js";
import * as failures from "./failure.js";
import type { RemoteFailure } from "./failure.js";
import { describeOffers, scanHostKeys, type HostKeyOffer, type HostKeyOptions } from "./hostkey.js";
import {
    classifySshOutput,
    firstLine,
    quoteForRemoteShell,
    sshScriptArguments,
    type SshOptionsInput,
} from "./ssh.js";
import {
    chooseTransfer as runChooseTransfer,
    probeRsync as runProbeRsync,
    type ChooseTransferOptions,
    type RsyncOptions,
    type RsyncSupport,
    type TransferChoice,
} from "./rsync.js";
import { scpTransfer as buildScpTransfer, TransferError, type FileTransfer } from "./transfer.js";
import { describeTarget, type RemoteTarget } from "./target.js";
import { powershellRemoteCommand, quoteForPowerShell } from "./windowsShell.js";

/* -------------------------------------------------------------------------- */
/* Shared option shape                                                        */
/* -------------------------------------------------------------------------- */

export interface RemoteWorldSshOptions {
    /** The app's own `known_hosts`, exactly as the render side uses. */
    readonly knownHostsFile: string;
    readonly userKnownHostsFile?: string | null;
    readonly connectTimeoutSeconds?: number;
    /** The local `ssh` binary. A parameter so a test can name one that does not exist. */
    readonly ssh?: string;
    /** The `ssh-keyscan` binary, for the host-key evidence shown on an unknown key. */
    readonly keyscan?: string;
    readonly runner?: CommandRunner;
    readonly timeoutMs?: number;
}

function sshOptionsFor(target: RemoteTarget, options: RemoteWorldSshOptions): SshOptionsInput {
    return {
        target,
        knownHostsFile: options.knownHostsFile,
        ...(options.userKnownHostsFile === undefined ? {} : { userKnownHostsFile: options.userKnownHostsFile }),
        ...(options.connectTimeoutSeconds === undefined
            ? {}
            : { connectTimeoutSeconds: options.connectTimeoutSeconds }),
    };
}

function hostKeyOptionsFor(options: RemoteWorldSshOptions): HostKeyOptions {
    return {
        knownHostsFile: options.knownHostsFile,
        ...(options.userKnownHostsFile === undefined ? {} : { userKnownHostsFile: options.userKnownHostsFile }),
        ...(options.keyscan === undefined ? {} : { keyscan: options.keyscan }),
        ...(options.runner === undefined ? {} : { runner: options.runner }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    };
}

/* -------------------------------------------------------------------------- */
/* 1. Connect, and work out what kind of host answered                       */
/* -------------------------------------------------------------------------- */

/** What kind of remote shell answered the connection probe. */
export type RemoteHostKind = "posix" | "windows" | "unknown";

export interface RemoteHostDetection {
    readonly kind: RemoteHostKind;
    /** What the probe actually printed - a `uname -s` answer, or a Windows version string. */
    readonly detail: string | null;
}

export type ConnectResult =
    | { readonly ok: true; readonly detection: RemoteHostDetection }
    | { readonly ok: false; readonly failure: RemoteFailure; readonly hostKeys: readonly HostKeyOffer[] };

/**
 * Connects, verifies the host key exactly as `preflight.ts` does, and works out which kind of
 * shell is on the other end - in one round trip when the host is POSIX, and one more when it
 * is not.
 *
 * This is deliberately **not** `preflight.ts`: that function also demands a working Docker
 * daemon and disk space, neither of which has anything to do with reading a world from a
 * machine that only ever hosts a Minecraft server. Reusing it would mean a world source that
 * refuses to work on a host with no Docker on it at all, which is most of them.
 *
 * Never rejects. Every outcome - including "this host is not offering a key this app knows" -
 * is an answer a settings screen renders, and a rejection would arrive as a bare `Error`.
 */
export async function connectAndDetectHost(
    target: RemoteTarget,
    options: RemoteWorldSshOptions,
): Promise<ConnectResult> {
    const runner = options.runner ?? execFileCommandRunner;
    const ssh = options.ssh ?? "ssh";
    const name = describeTarget(target);
    const sshOptions = sshOptionsFor(target, options);
    const timeoutOpt = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };

    const posixProbe = await runner(ssh, sshScriptArguments(sshOptions, "uname -s"), timeoutOpt);
    const outcome = classifySshOutput(posixProbe);
    const said = firstLine(posixProbe.stderr);

    if (outcome === "ok") {
        return { ok: true, detection: { kind: "posix", detail: posixProbe.stdout.trim() || null } };
    }
    if (outcome === "ssh-missing") {
        return { ok: false, failure: failures.sshMissing(ssh), hostKeys: [] };
    }
    if (outcome === "host-key-changed") {
        // No `hostKeys` here, on purpose: there is no button, so there is nothing to show a
        // fingerprint for. See `hostkey.ts` for why a changed key is never offered as a choice.
        return { ok: false, failure: failures.hostKeyChanged(name, said), hostKeys: [] };
    }
    if (outcome === "host-key-unknown") {
        const scanned = await scanHostKeys(target, hostKeyOptionsFor(options));
        if (scanned.offers.length === 0) {
            return { ok: false, failure: failures.hostKeyUnavailable(name, scanned.detail ?? said), hostKeys: [] };
        }
        return {
            ok: false,
            failure: failures.hostKeyUnknown(name, describeOffers(scanned.offers)),
            hostKeys: scanned.offers,
        };
    }
    if (outcome === "auth-refused") {
        return { ok: false, failure: failures.authRefused(name, said), hostKeys: [] };
    }
    if (outcome === "unreachable") {
        return { ok: false, failure: failures.unreachable(name, said), hostKeys: [] };
    }

    // `outcome === "remote-failed"`: ssh connected, signed in, and ran a command - it is the
    // *command* that failed, not the connection. `uname` not existing is exactly what a
    // Windows host looks like, so this is the detection signal, not a reason to give up.
    const windowsProbe = await runner(
        ssh,
        sshScriptArguments(
            sshOptions,
            powershellRemoteCommand("Write-Output ([Environment]::OSVersion.VersionString)"),
        ),
        timeoutOpt,
    );
    if (windowsProbe.ok && windowsProbe.stdout.trim() !== "") {
        return { ok: true, detection: { kind: "windows", detail: windowsProbe.stdout.trim() } };
    }

    // Connected, and neither a POSIX shell nor PowerShell answered anything usable. Genuinely
    // unknown: every caller downstream degrades from here rather than guessing which shell it
    // would have to speak.
    return {
        ok: true,
        detection: { kind: "unknown", detail: said ?? firstLine(windowsProbe.stderr) },
    };
}

/* -------------------------------------------------------------------------- */
/* 2. A remote world path, checked in the grammar its own host actually uses  */
/* -------------------------------------------------------------------------- */

export type RemoteWorldPathCheck =
    | { readonly ok: true; readonly path: string }
    | { readonly ok: false; readonly reason: string };

const CONTROL_CHARS = /[\u0000-\u001F]/;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH = /^\\\\[^\\]+\\[^\\]+/;

/**
 * Checks a remote world path against the grammar its own host actually uses.
 *
 * `remote/target.ts`'s `checkWorkDir` is deliberately not reused: it refuses anything with a
 * `:` in it, which is correct for a POSIX staging directory and wrong for `D:\servers\world`,
 * the ordinary shape of a Windows path. A world source needs both grammars, chosen by what
 * {@link connectAndDetectHost} actually found - never guessed from the string alone, because
 * `C:\backup` and a POSIX path that happens to contain a colon are not the same kind of
 * mistake to make silently.
 */
export function checkRemoteWorldPath(value: string, kind: RemoteHostKind): RemoteWorldPathCheck {
    const given = value.trim();
    if (given === "") return { ok: false, reason: "A path to the world on the remote host is required." };
    if (CONTROL_CHARS.test(given)) {
        return { ok: false, reason: `${given} contains a control character, so it is not a path.` };
    }

    if (kind === "windows") {
        if (!WINDOWS_DRIVE_PATH.test(given) && !WINDOWS_UNC_PATH.test(given)) {
            return {
                ok: false,
                reason:
                    `${given} is not a full Windows path. Give a path from a drive letter, such as ` +
                    "'D:\\servers\\world', or a UNC path naming a server and a share.",
            };
        }
        return { ok: true, path: given };
    }

    // "posix" and "unknown" both read as a POSIX path: it is the overwhelmingly common case,
    // and it is what the transfer tools this module hands the path to already expect.
    if (given.includes(":")) {
        return { ok: false, reason: `${given} contains a ':', which is not part of a POSIX path.` };
    }
    const rooted = given.startsWith("/") || given === "~" || given.startsWith("~/");
    if (!rooted) {
        return {
            ok: false,
            reason: `${given} is not a full path. Give a path from the root, or one under '~/'.`,
        };
    }
    if (given.split("/").includes("..")) {
        return { ok: false, reason: `${given} contains a '..' step.` };
    }
    return { ok: true, path: given };
}

/* -------------------------------------------------------------------------- */
/* 3. A cheap survey - size and modification time, no bytes transferred       */
/* -------------------------------------------------------------------------- */

export interface RemoteWorldEntry {
    /** Relative to the world's root, forward-slash separated regardless of the remote OS. */
    readonly path: string;
    readonly size: number;
    readonly mtimeMs: number;
}

export type RemoteWorldSurvey =
    | { readonly ok: true; readonly kind: RemoteHostKind; readonly entries: readonly RemoteWorldEntry[] }
    | { readonly ok: false; readonly failure: RemoteFailure };

/** .NET ticks (100ns units) at the Unix epoch, for converting `LastWriteTimeUtc.Ticks`. */
const DOTNET_EPOCH_TICKS = 621_355_968_000_000_000;

function windowsSurveyScript(remotePath: string): string {
    const base = quoteForPowerShell(remotePath);
    return [
        `$base = ${base}`,
        "Get-ChildItem -LiteralPath $base -Recurse -File | ForEach-Object {",
        "    $rel = $_.FullName.Substring($base.Length).TrimStart('\\','/').Replace('\\','/')",
        '    "$($_.Length) $($_.LastWriteTimeUtc.Ticks) $rel"',
        "}",
    ].join("\n");
}

function parseSurveyLine(line: string, kind: "posix" | "windows"): RemoteWorldEntry | null {
    const match = /^(\d+)\s+([\d.]+)\s+(.+)$/.exec(line.trim());
    if (match === null) return null;
    const [, sizeText, timeText, pathText] = match;
    if (sizeText === undefined || timeText === undefined || pathText === undefined) return null;
    const size = Number.parseInt(sizeText, 10);
    const time = Number.parseFloat(timeText);
    // POSIX `find -printf %T@` prints seconds since the epoch, with a fractional part.
    // Windows prints .NET ticks since 0001-01-01. Both are normalised to milliseconds since
    // the Unix epoch here, so a survey compares equal regardless of which host produced it.
    const mtimeMs = kind === "posix" ? time * 1000 : (time - DOTNET_EPOCH_TICKS) / 10_000;
    return { path: pathText.replaceAll("\\", "/"), size, mtimeMs };
}

function parseSurvey(stdout: string, kind: "posix" | "windows"): RemoteWorldEntry[] {
    const entries: RemoteWorldEntry[] = [];
    for (const raw of stdout.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "") continue;
        const entry = parseSurveyLine(line, kind);
        if (entry !== null) entries.push(entry);
    }
    return entries;
}

/**
 * Lists every file under a remote world, with its size and modification time, without
 * transferring a single byte of the world itself.
 *
 * This is the "cheap change check": run it before a scheduled render to learn whether the
 * world has changed since the last one, and run it again afterwards to record what "last
 * time" now means, all for the cost of one remote command rather than the whole world.
 *
 * `find -printf` on POSIX, a `Get-ChildItem` one-liner over `windowsShell.ts` on Windows.
 * Refuses to guess on `"unknown"`: a host that answered neither probe in
 * {@link connectAndDetectHost} has no listing command this module is willing to assume it has.
 */
export async function surveyRemoteWorld(
    target: RemoteTarget,
    remotePath: string,
    kind: RemoteHostKind,
    options: RemoteWorldSshOptions,
): Promise<RemoteWorldSurvey> {
    const runner = options.runner ?? execFileCommandRunner;
    const ssh = options.ssh ?? "ssh";
    const name = describeTarget(target);
    const sshOptions = sshOptionsFor(target, options);
    const timeoutOpt = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };

    if (kind === "unknown") {
        return {
            ok: false,
            failure: failures.remoteCommandFailed(
                name,
                "A file survey",
                null,
                "This host answered neither a POSIX shell probe nor a PowerShell one, so its files " +
                    "cannot be listed without transferring them.",
            ),
        };
    }

    const script =
        kind === "posix"
            ? `cd ${quoteForRemoteShell(remotePath)} && find . -type f -printf '%s %T@ %P\\n'`
            : powershellRemoteCommand(windowsSurveyScript(remotePath));

    const output = await runner(ssh, sshScriptArguments(sshOptions, script), timeoutOpt);
    if (!output.ok) {
        return {
            ok: false,
            failure: failures.remoteCommandFailed(name, "A file survey", output.exitCode, firstLine(output.stderr)),
        };
    }
    return { ok: true, kind, entries: parseSurvey(output.stdout, kind) };
}

/* -------------------------------------------------------------------------- */
/* 4. Diffing two surveys - what a scheduled render decides against           */
/* -------------------------------------------------------------------------- */

export interface RemoteWorldChanges {
    readonly added: readonly string[];
    readonly changed: readonly string[];
    readonly removed: readonly string[];
    readonly unchanged: number;
}

/**
 * Compares two surveys by path, size and modification time. Pure, and therefore usable by
 * anything that has two surveys and no SSH client at all - including a scheduled render's own
 * change detection, which is exactly what this was built to expose.
 */
export function diffRemoteWorldSurveys(
    previous: readonly RemoteWorldEntry[],
    current: readonly RemoteWorldEntry[],
): RemoteWorldChanges {
    const previousByPath = new Map(previous.map((entry) => [entry.path, entry]));
    const currentByPath = new Map(current.map((entry) => [entry.path, entry]));

    const added: string[] = [];
    const changed: string[] = [];
    let unchanged = 0;
    for (const [path, entry] of currentByPath) {
        const before = previousByPath.get(path);
        if (before === undefined) added.push(path);
        else if (before.size !== entry.size || before.mtimeMs !== entry.mtimeMs) changed.push(path);
        else unchanged++;
    }
    const removed = [...previousByPath.keys()].filter((path) => !currentByPath.has(path));

    return { added: added.sort(), changed: changed.sort(), removed: removed.sort(), unchanged };
}

/** True when a survey diff says anything actually moved. */
export function remoteWorldChanged(changes: RemoteWorldChanges): boolean {
    return changes.added.length > 0 || changes.changed.length > 0 || changes.removed.length > 0;
}

/* -------------------------------------------------------------------------- */
/* 5. Fetching the world                                                      */
/* -------------------------------------------------------------------------- */

export interface RemoteWorldFetchOptions extends RemoteWorldSshOptions {
    readonly scp?: string;
    readonly rsync?: string;
    readonly signal?: AbortSignal;
    readonly onLine?: (line: string) => void;
    /** Injected so a test can fetch without a real host to connect to. */
    readonly detect?: (target: RemoteTarget, options: RemoteWorldSshOptions) => Promise<ConnectResult>;
    /** Injected so a test can control which transfer is chosen without a real rsync or scp. */
    readonly chooseTransfer?: (choice: ChooseTransferOptions) => Promise<TransferChoice>;
    readonly probeRsync?: (probe: RsyncOptions) => Promise<RsyncSupport>;
    /** Injected so a test can fake the `scp` fallback transfer entirely. */
    readonly scpTransfer?: FileTransfer;
}

export type RemoteWorldFetchResult =
    | {
          readonly ok: true;
          readonly kind: RemoteHostKind;
          readonly transfer: "rsync" | "scp";
          /** What `chooseTransfer` said about the transfer, including any fallback reason. */
          readonly message: string;
      }
    | { readonly ok: false; readonly failure: RemoteFailure; readonly hostKeys: readonly HostKeyOffer[] };

/**
 * Fetches a world from a remote host into `localPath`, choosing the incremental transfer
 * where the host supports it and falling back, out loud, where it does not.
 *
 * The order is: connect and detect the host, check the path in that host's own grammar, pick
 * a transfer, download. Nothing is sent to the remote host at any point - this is a read, and
 * only a read - so a failure at any stage leaves the remote host exactly as it was.
 *
 * Never rejects except through the signal the caller passed in already being aborted before
 * the call. A mid-transfer cancellation is reported as `failures.cancelled()`, the same
 * failure shape a cancelled remote render already uses.
 */
export async function fetchRemoteWorld(
    target: RemoteTarget,
    remotePath: string,
    localPath: string,
    options: RemoteWorldFetchOptions,
): Promise<RemoteWorldFetchResult> {
    if (options.signal?.aborted === true) {
        return { ok: false, failure: failures.cancelled(), hostKeys: [] };
    }

    const detect = options.detect ?? connectAndDetectHost;
    const connected = await detect(target, options);
    if (!connected.ok) return connected;

    const pathCheck = checkRemoteWorldPath(remotePath, connected.detection.kind);
    if (!pathCheck.ok) {
        return { ok: false, failure: failures.invalidTarget(pathCheck.reason), hostKeys: [] };
    }

    const sshOptions = sshOptionsFor(target, options);
    const scp =
        options.scpTransfer ??
        buildScpTransfer({
            ...sshOptions,
            ...(options.scp === undefined ? {} : { scp: options.scp }),
            ...(options.ssh === undefined ? {} : { ssh: options.ssh }),
            ...(options.runner === undefined ? {} : { runner: options.runner }),
        });
    const choose = options.chooseTransfer ?? runChooseTransfer;

    let choice: TransferChoice;
    try {
        choice = await choose({
            ...sshOptions,
            ...(options.rsync === undefined ? {} : { rsync: options.rsync }),
            ...(options.ssh === undefined ? {} : { ssh: options.ssh }),
            ...(options.runner === undefined ? {} : { runner: options.runner }),
            scpTransfer: scp,
            ...(options.probeRsync === undefined ? {} : { probe: options.probeRsync }),
            ...(options.onLine === undefined ? {} : { onLine: options.onLine }),
        });
    } catch (error) {
        return {
            ok: false,
            failure: failures.remoteCommandFailed(
                describeTarget(target),
                "Choosing a transfer",
                null,
                describe(error),
            ),
            hostKeys: [],
        };
    }

    options.onLine?.(choice.message);

    try {
        await choice.transfer.downloadDirectory(pathCheck.path, localPath, {
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            ...(options.onLine === undefined ? {} : { onLine: options.onLine }),
        });
    } catch (error) {
        if (isAbortLike(error)) return { ok: false, failure: failures.cancelled(), hostKeys: [] };
        const failure =
            error instanceof TransferError
                ? failures.transferFailed(describeTarget(target), error.message, error.detail)
                : failures.remoteCommandFailed(
                      describeTarget(target),
                      "Fetching the world",
                      null,
                      describe(error),
                  );
        return { ok: false, failure, hostKeys: [] };
    }

    return { ok: true, kind: connected.detection.kind, transfer: choice.kind, message: choice.message };
}

/** Also used by `probeRsync` internally through `rsync.ts` - kept local so nothing here needs a second export just to check an abort. */
function isAbortLike(error: unknown): boolean {
    return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// `runProbeRsync` is exported again from this module purely so `worldsource/sshIpc.ts` and
// callers outside `remote/` can build a `RemoteWorldFetchOptions.probeRsync` override without
// importing two different folders for one call. It is the exact function `rsync.ts` exports.
export { runProbeRsync as probeRsync };

/**
 * Talking to the remote host, through the OpenSSH client the person already trusts.
 *
 * There is no SSH library here, and that is a decision rather than an omission. Using the
 * system `ssh` means the person's agent, their `~/.ssh/config`, their hardware key and
 * their jump hosts all keep working, and it means this app never holds, parses, decrypts
 * or writes key material of any kind. A library would have to be handed a private key to
 * be useful, and the moment that is possible it is the thing that leaks.
 *
 * ## The options are the security model
 *
 * Every invocation carries the same block, and each line of it prevents a specific failure:
 *
 * ```
 * BatchMode=yes                     never prompt. A prompt in a background process is a hang.
 * PasswordAuthentication=no         no password is ever offered, even if the host asks.
 * KbdInteractiveAuthentication=no   the other way a host asks for a password.
 * PreferredAuthentications=publickey  do not even try the rest.
 * StrictHostKeyChecking=yes         an unknown key is a refusal, never a silent trust.
 * UserKnownHostsFile=<app> <user>   read both; write only the app's own.
 * ConnectTimeout=<n>                a dead host fails in seconds, not in a TCP timeout.
 * ```
 *
 * `StrictHostKeyChecking=yes` is the one that matters most. `accept-new` would make the
 * first connection to any host succeed silently, which is exactly the connection a
 * machine-in-the-middle needs to survive. The refusal it produces is turned into a decision
 * for the person by `hostkey.ts`.
 *
 * ## Quoting
 *
 * `ssh host <words>` does not run an argv. It joins the words with spaces and hands the
 * string to the remote **login shell**, which then splits, globs and expands it. So a
 * world folder called `Saves, old (2)` or a path with a `$` in it is not an edge case, it
 * is a broken command - or worse, a different command. Every word this module sends is
 * single-quoted by {@link quoteForRemoteShell} first, which is the only quoting a POSIX
 * shell has no way to reinterpret.
 */

import {
    execFileCommandRunner,
    type CommandOptions,
    type CommandOutput,
    type CommandRunner,
} from "../runtime/command.js";
import { destination, type RemoteTarget } from "./target.js";

/** How long a connection attempt is given before the host counts as unreachable. */
export const CONNECT_TIMEOUT_SECONDS = 15;

/**
 * Wraps one word so a POSIX shell hands it back exactly as it was given.
 *
 * Single quotes, with `'` written as `'\''`. There is no character a single-quoted POSIX
 * word can contain that the shell will reinterpret, which is why this is the only quoting
 * used here rather than an escape table that has to be right for every shell in the wild.
 */
export function quoteForRemoteShell(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}

/** A whole remote command line, every word quoted. */
export function remoteCommandLine(words: readonly string[]): string {
    return words.map(quoteForRemoteShell).join(" ");
}

/**
 * A remote path with a leading `~` left for the shell to expand.
 *
 * `quoteForRemoteShell("~/renders")` produces `'~/renders'`, and a POSIX shell does **not**
 * expand a tilde inside quotes - so the render would stage into a directory *literally*
 * called `~` in the account's working directory, and the person would find their world in
 * a folder with a tilde for a name. The tilde and the slash stay outside the quotes; every
 * character that could be dangerous is still inside them.
 *
 * This is only for the one command that resolves the home directory. Everything downstream
 * uses the absolute path that command returns, because a container mount cannot expand a
 * tilde at all - `docker run -v '~/x:/y'` creates a directory called `~` on the host.
 */
export function quoteRemotePath(path: string): string {
    if (path === "~") return "~";
    if (path.startsWith("~/")) return `~/${quoteForRemoteShell(path.slice(2))}`;
    return quoteForRemoteShell(path);
}

/**
 * `ssh ... <script>`, where the script is a shell snippet this app wrote itself.
 *
 * Used only where the remote *shell* is genuinely needed - expanding `$HOME`, `&&` between
 * two commands - and never with anything a person typed spliced into it raw. Values always
 * arrive through {@link quoteForRemoteShell} or {@link quoteRemotePath} first.
 */
export function sshScriptArguments(input: SshOptionsInput, script: string): string[] {
    return [...sshArguments(input), script];
}

export interface SshOptionsInput {
    readonly target: RemoteTarget;
    /**
     * The app's own `known_hosts`, which is the only file this app ever writes to.
     *
     * Separate from the person's `~/.ssh/known_hosts` on purpose: an app that appends to a
     * user's own trust store changes the trust of every other program on the machine, and
     * a bug here would be a bug in their `git push`.
     */
    readonly knownHostsFile: string;
    /** The person's own file, read as well, so keys they already trust need no second decision. */
    readonly userKnownHostsFile?: string | null;
    readonly connectTimeoutSeconds?: number;
}

/**
 * `-o` pairs shared by `ssh`, `scp` and `ssh-keyscan`-adjacent calls.
 *
 * Built as a list of `-o key=value` pairs rather than a single string, so nothing here can
 * accidentally depend on a shell splitting it.
 */
export function sshSecurityOptions(input: SshOptionsInput): string[] {
    const timeout = input.connectTimeoutSeconds ?? CONNECT_TIMEOUT_SECONDS;
    const files = [input.knownHostsFile];
    if (input.userKnownHostsFile !== undefined && input.userKnownHostsFile !== null) {
        files.push(input.userKnownHostsFile);
    }
    // OpenSSH splits this value on whitespace and honours double quotes, which is what
    // makes a Windows path with a space in it usable here at all.
    const knownHosts = files.map((file) => `"${file}"`).join(" ");

    const options = [
        "-o",
        "BatchMode=yes",
        "-o",
        "PasswordAuthentication=no",
        "-o",
        "KbdInteractiveAuthentication=no",
        "-o",
        "PreferredAuthentications=publickey",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        `UserKnownHostsFile=${knownHosts}`,
        "-o",
        `ConnectTimeout=${String(timeout)}`,
    ];

    if (input.target.identityFile !== null) {
        // `IdentitiesOnly=yes` beside it: without it the agent's keys are offered first and
        // a host with a low `MaxAuthTries` refuses before the named key is ever reached,
        // which reads as "the key does not work" for a key that does.
        options.push("-i", input.target.identityFile, "-o", "IdentitiesOnly=yes");
    }
    return options;
}

/** The full `ssh` argv up to but not including the remote command. */
export function sshArguments(input: SshOptionsInput): string[] {
    return [
        ...sshSecurityOptions(input),
        "-p",
        String(input.target.port),
        destination(input.target),
    ];
}

/**
 * The full `scp` argv, up to but not including the paths.
 *
 * `scp` spells the port `-P`, where `ssh` spells it `-p`. Getting that one letter wrong
 * produces a client that ignores the port and connects to 22, which on a host that has
 * moved SSH is a connection refused with no hint that a flag was the reason.
 */
export function scpArguments(input: SshOptionsInput, extra: readonly string[] = []): string[] {
    return [...sshSecurityOptions(input), "-P", String(input.target.port), ...extra];
}

/** `user@host:/quoted/remote/path`, the form scp takes. */
export function scpRemotePath(target: RemoteTarget, path: string): string {
    // scp hands the remote half to a remote shell, exactly as ssh does, so it is quoted
    // for the same reason and by the same function.
    return `${destination(target)}:${quoteForRemoteShell(path)}`;
}

/* -------------------------------------------------------------------------- */
/* What a failed connection actually was                                      */
/* -------------------------------------------------------------------------- */

export type SshOutcome =
    | "ok"
    | "ssh-missing"
    | "unreachable"
    | "host-key-unknown"
    | "host-key-changed"
    | "auth-refused"
    | "remote-failed";

/** The banner OpenSSH prints when a recorded key and the offered key disagree. */
const KEY_CHANGED = /REMOTE HOST IDENTIFICATION HAS CHANGED|host key .* has changed|POSSIBLE DNS SPOOFING/i;

/**
 * The several ways OpenSSH says "I have never seen this host".
 *
 * All of them, because a spelling this misses is a refusal reported as an unexplained
 * failure, and the person is then stuck with an error that has no fix in it.
 */
const KEY_UNKNOWN =
    /host key verification failed|no (?:matching )?(?:\w+ )?host key is known|no hostkey alg|key verification failed/i;

const UNREACHABLE =
    /could not resolve hostname|name or service not known|connection refused|connection timed out|operation timed out|network is unreachable|no route to host|connection closed by remote host|timed out while waiting|port \d+: (?:connection|network)/i;

const AUTH_REFUSED =
    /permission denied|no supported authentication methods|too many authentication failures|authentications that can continue|not accepted by the server|publickey/i;

/**
 * Reads one failed SSH result into the single reason it was.
 *
 * ## The exit code decides whose failure it is, and the text only decides which one
 *
 * `ssh` exits **255** for its own failures and otherwise returns the *remote command's*
 * exit status. That distinction has to come first, because the phrases below are ordinary
 * English that a remote command says all the time: a `docker version` refused by its own
 * daemon prints "permission denied", and matching that as an SSH authentication failure
 * turns "add this account to the docker group" into "your key was rejected" - two problems
 * with nothing in common and different machines to fix them on. This was not hypothetical;
 * it is what the first version of this function did.
 *
 * So: a spawn failure is local, 255 is `ssh`'s, and anything else belongs to the command
 * that ran on the other side, whatever words it used.
 *
 * Within 255, the order is still the design and is still not alphabetical: a changed host
 * key is checked before an unknown one because OpenSSH prints *both* banners in that case,
 * and reporting it as "unknown" would offer somebody a button to trust a key that has just
 * changed under them.
 *
 * A pure function of a {@link CommandOutput}, so every branch is testable without a server.
 */
export function classifySshOutput(output: CommandOutput): SshOutcome {
    if (output.spawnError !== null) {
        return output.spawnError === "ENOENT" ? "ssh-missing" : "remote-failed";
    }
    if (output.ok) return "ok";
    if (output.exitCode !== 255) return "remote-failed";

    const said = `${output.stderr}\n${output.stdout}`;
    if (KEY_CHANGED.test(said)) return "host-key-changed";
    if (KEY_UNKNOWN.test(said)) return "host-key-unknown";
    if (AUTH_REFUSED.test(said)) return "auth-refused";
    if (UNREACHABLE.test(said)) return "unreachable";
    // 255 with nothing recognisable in it is still `ssh` failing rather than the command,
    // and "the host did not answer" is the only honest thing to say about that.
    return "unreachable";
}

/** One line of what the client said, so a report has evidence without becoming a wall. */
export function firstLine(text: string): string | null {
    const line = text
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        // The `@@@@@` rule around OpenSSH's key-changed banner is decoration, not evidence.
        .find((entry) => !/^@+$/.test(entry) && !/^-+$/.test(entry));
    return line === undefined ? null : line;
}

/* -------------------------------------------------------------------------- */
/* A CommandRunner that runs on the other machine                             */
/* -------------------------------------------------------------------------- */

export interface SshRunnerOptions extends SshOptionsInput {
    /** The local `ssh` binary. A parameter so a test can name one that does not exist. */
    readonly ssh?: string;
    /** How the local process is actually run. Injected everywhere, so tests need no ssh. */
    readonly runner?: CommandRunner;
}

/**
 * A {@link CommandRunner} whose commands happen on the remote host.
 *
 * This is what lets `runtime/docker.ts` be reused verbatim against a machine on the other
 * side of the world: `probeDocker({ runner: sshCommandRunner(...) })` asks *that* host what
 * Docker it has, and `readDockerVersion` reads the answer with the same code and the same
 * five distinct states as it does locally.
 *
 * Two translations happen on the way back, and both exist so that reuse is honest rather
 * than merely convenient:
 *
 * - a remote shell's **127** ("command not found") becomes `spawnError: "ENOENT"`, which is
 *   what a *locally* missing binary looks like. Without it, "Docker is not installed on
 *   that host" would arrive as "docker version failed with exit code 127", and the person
 *   would be sent to debug Docker rather than to install it.
 * - a failure of **ssh itself** becomes `spawnError: "SSH"`, so a caller can tell "the host
 *   did not answer" apart from "the host answered and the command failed". Anything that
 *   treats those as one thing reports a dead server as a broken Docker.
 */
export function sshCommandRunner(options: SshRunnerOptions): CommandRunner {
    const ssh = options.ssh ?? "ssh";
    const runner = options.runner ?? execFileCommandRunner;

    return async (
        command: string,
        args: readonly string[],
        commandOptions: CommandOptions = {},
    ): Promise<CommandOutput> => {
        const output = await runner(
            ssh,
            [...sshArguments(options), remoteCommandLine([command, ...args])],
            commandOptions,
        );
        if (output.spawnError !== null) return output;
        if (output.ok) return output;

        const outcome = classifySshOutput(output);
        if (outcome !== "remote-failed") {
            return { ...output, spawnError: "SSH" };
        }
        // The remote shell's own "no such command". Reported the way a local one is, so a
        // reader that already knows what a missing binary looks like recognises this one.
        if (output.exitCode === 127 || /command not found|not found\b|No such file or directory/i.test(output.stderr)) {
            return { ...output, spawnError: "ENOENT" };
        }
        return output;
    };
}

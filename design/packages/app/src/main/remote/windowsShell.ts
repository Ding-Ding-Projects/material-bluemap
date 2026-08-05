/**
 * Running something on a Windows remote host, when the login shell might be anything.
 *
 * ## The problem this file exists to avoid
 *
 * Every remote command elsewhere in this folder is one string, handed to `ssh`, handed by
 * `ssh` to the remote **login shell**, which splits, quotes and expands it. That is fine on
 * a POSIX host because `quoteForRemoteShell` in `ssh.ts` is a complete answer for a POSIX
 * shell: single quotes, with `'` doubled through a backslash escape, and there is no
 * character a single-quoted POSIX word can contain that the shell will reinterpret.
 *
 * There is no such complete answer for a Windows remote, because there is no single shell to
 * write it for. OpenSSH Server on Windows defaults its login shell to `cmd.exe`, which
 * understands neither single quotes nor `&&` the way a POSIX shell does; an administrator can
 * configure `DefaultShell` to PowerShell instead, which has its own, different quoting rules
 * again. Writing "the" Windows quoting function would mean guessing which of those two a
 * given host is running, silently, and being wrong about a shell is how a path with a space
 * or an apostrophe in it turns into a different command.
 *
 * ## The way out: stop asking the login shell to parse anything
 *
 * `-EncodedCommand` is PowerShell's own answer to exactly this problem: give it a script as
 * Base64 of UTF-16LE text, and it decodes and runs that script itself, with **no quoting step
 * in between**. The remote command line this module builds is therefore:
 *
 * ```
 * powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <base64>
 * ```
 *
 * The Base64 alphabet is `A-Za-z0-9+/=` — no space, no quote, no shell metacharacter of any
 * kind — so this single line survives being split on whitespace by `cmd.exe`, by PowerShell
 * acting as a login shell, or by anything else that merely tokenises a command line the plain
 * way. The login shell's own quoting dialect stops mattering, because nothing sent to it ever
 * needs quoting. What *is* quoted is the PowerShell script text itself, with
 * {@link quoteForPowerShell}, before it is encoded - that quoting is real PowerShell syntax,
 * checked by PowerShell's own parser once the script runs, not by a login shell guessing.
 *
 * This is deliberately narrower than a general "run PowerShell over SSH" helper: it exists so
 * `worldsource.ts` can detect a Windows host and read a file listing from it without a second,
 * untested quoting dialect anywhere in this application. It assumes `powershell.exe` is on the
 * remote account's `PATH`, true by default on every supported Windows release; a host where
 * that is somehow not so answers the detection probe honestly as `unknown`, and every caller
 * degrades from there rather than guessing.
 */

/**
 * Wraps one value as a PowerShell single-quoted string literal.
 *
 * PowerShell's single-quote escape is doubling the quote (`'` becomes `''`), the way SQL and
 * several shells do it - not the backslash escape a POSIX shell uses. A single-quoted
 * PowerShell literal takes no other character specially, which is why this - and not a
 * double-quoted string, which PowerShell still expands variables and subexpressions inside of
 * - is the only form used here.
 */
export function quoteForPowerShell(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Base64 of UTF-16LE, which is the one encoding `-EncodedCommand` accepts. */
export function encodePowerShellCommand(script: string): string {
    return Buffer.from(script, "utf16le").toString("base64");
}

/**
 * The whole remote command line for running `script` through PowerShell.
 *
 * This is the value handed to `sshScriptArguments` as the "script" - it is not itself parsed
 * by a POSIX shell, and it does not need to be, which is the entire point: see the module
 * doc comment above for why encoding rather than quoting is what makes this work regardless
 * of which shell `sshd` handed the command to.
 */
export function powershellRemoteCommand(script: string): string {
    return (
        "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass " +
        `-EncodedCommand ${encodePowerShellCommand(script)}`
    );
}

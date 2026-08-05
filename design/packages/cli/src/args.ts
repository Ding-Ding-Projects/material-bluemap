/**
 * Argument parsing for the standalone CLI.
 *
 * The actual parsing is not reimplemented here: `@material-bluemap/config`'s
 * `cli/flags.ts` already models every flag `BlueMapCLI.createOptions()` declares
 * (transcribed from the Java source and checked against real `--help` output — see that
 * file's own doc comment), a `parseCliArgs` that reads an argv the same way Commons CLI
 * does (grouped short flags, attached values, `--flag=value`), and a `resolveCliActions`
 * that mirrors `BlueMapCLI.main()`'s exact branching — which flags trigger which action,
 * and what a combination like `-gu` actually means once it is inside the render branch.
 * The GUI (`packages/config`'s consumer) and this real CLI now share one flag model
 * instead of two that could quietly drift apart.
 *
 * This module only adds what a terminal program needs on top of that model: `--help`
 * text and `--version` text.
 */

import {
    buildCliArgs,
    CLI_FLAGS,
    parseCliArgs,
    resolveCliActions,
    type CliFlag,
    type CliInvocation,
    type CliParseIssue,
    type ResolvedCliActions,
} from "@material-bluemap/config";

export { parseCliArgs, resolveCliActions, buildCliArgs, CLI_FLAGS };
export type { CliInvocation, CliParseIssue, ResolvedCliActions };

/** Matches upstream's own package/artifact name, since `getCliCommand()`'s fallback did. */
const DEFAULT_COMMAND = "bluemap-cli";

/** upstream: `BlueMapCLI.getCliCommand()` — env override, else the package's own name. */
export function cliCommand(): string {
    return process.env["BLUEMAP_COMMAND"] ?? DEFAULT_COMMAND;
}

function flagUsage(flag: CliFlag): string {
    const short = flag.short === null ? "" : `-${flag.short},`;
    const long = `--${flag.long}`;
    const arg = flag.argument === null ? "" : ` <${flag.argument.name}>`;
    return `  ${short}${long}${arg}`;
}

/** upstream: `HelpFormatter#printHelp`, plus the same worked examples `printHelp()` prints. */
export function formatHelp(): string {
    const command = cliCommand();
    const lines: string[] = [`Usage: ${command} [options]`, "", "Options:"];

    const usages = CLI_FLAGS.map(flagUsage);
    const width = Math.max(...usages.map((usage) => usage.length)) + 2;
    for (let i = 0; i < CLI_FLAGS.length; i++) {
        const flag = CLI_FLAGS[i]!;
        lines.push(`${(usages[i] ?? "").padEnd(width)}${flag.description}`);
    }

    lines.push(
        "",
        "Examples:",
        "",
        `${command} -c './config/'`,
        "Generates the default/example configurations in a folder named 'config' if they are not already present",
        "",
        `${command} -r`,
        "Render the configured maps",
        "",
        `${command} -w`,
        "Start only the webserver without doing anything else",
        "",
        `${command} -ru`,
        "Render the configured maps and then keeps watching the world-files and updates the map once something changed.",
    );

    return lines.join("\n");
}

/** upstream: `BlueMapCLI.printVersion()` — id then git hash, one per line. */
export function formatVersion(version: string, gitHash: string): string {
    return `${version}\n${gitHash}`;
}

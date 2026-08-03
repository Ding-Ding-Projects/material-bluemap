/**
 * Every command-line flag `bluemap-cli` accepts, modelled so the GUI can express
 * a run without anybody opening a terminal.
 *
 * The list is transcribed from `BlueMapCLI.createOptions()` and checked against
 * what `java -jar cli-5.22-27-shadow.jar --help` actually prints, because a flag
 * list written from memory is a flag list that quietly loses one.
 *
 * Java source: `implementations/cli/src/main/java/de/bluecolored/bluemap/cli/BlueMapCLI.java`
 */

import type { Control } from "../meta.js";

/** One flag, with the description upstream's help output prints for it. */
export interface CliFlag {
    /** Single-character form, or `null` for a long-only flag such as `--markers`. */
    readonly short: string | null;
    readonly long: string;
    /** `null` for a switch; otherwise the argument's placeholder name and kind. */
    readonly argument: { readonly name: string; readonly kind: "path" | "text" | "csv" } | null;
    /** Upstream's own description, verbatim. */
    readonly description: string;
    /** Short label for the GUI. */
    readonly label: string;
    readonly group: string;
    readonly control: Control;
}

export const CLI_FLAGS: readonly CliFlag[] = [
    {
        short: "h",
        long: "help",
        argument: null,
        description: "Displays this message",
        label: "Print help",
        group: "info",
        control: { kind: "switch" },
    },
    {
        short: "c",
        long: "config",
        argument: { name: "config-folder", kind: "path" },
        description: "Sets path of the folder containing the configuration-files to use (configurations will be generated here if they don't exist)",
        label: "Config folder",
        group: "paths",
        control: { kind: "path", select: "directory", relativeToWorkingDirectory: true },
    },
    {
        short: "n",
        long: "mods",
        argument: { name: "mods-folder", kind: "path" },
        description: "Sets path of the folder containing the mods that contain extra resources for rendering.",
        label: "Mods folder",
        group: "paths",
        control: { kind: "path", select: "directory", relativeToWorkingDirectory: true },
    },
    {
        short: "v",
        long: "mc-version",
        argument: { name: "mc-version", kind: "text" },
        description: "Sets the minecraft-version, used e.g. to load resource-packs correctly. Defaults to the latest compatible version.",
        label: "Minecraft version",
        group: "resources",
        control: { kind: "text", placeholder: "1.21.4", monospace: true },
    },
    {
        short: "l",
        long: "log-file",
        argument: { name: "file-name", kind: "path" },
        description: "Sets a file to save the log to. If not specified, no log will be saved.",
        label: "Log file",
        group: "logging",
        control: { kind: "path", select: "file", extensions: ["log"], relativeToWorkingDirectory: true },
    },
    {
        short: "a",
        long: "append",
        argument: null,
        description: "Causes log save file to be appended rather than replaced.",
        label: "Append to the log file",
        group: "logging",
        control: { kind: "switch" },
    },
    {
        short: "w",
        long: "webserver",
        argument: null,
        description: "Starts the web-server, configured in the 'webserver.conf' file",
        label: "Start the web server",
        group: "webserver",
        control: { kind: "switch" },
    },
    {
        short: "b",
        long: "verbose",
        argument: null,
        description: "Causes the web-server to log requests to the console",
        label: "Log web requests to the console",
        group: "webserver",
        control: { kind: "switch" },
    },
    {
        short: "g",
        long: "generate-webapp",
        argument: null,
        description: "Generates the files for the web-app to the folder configured in the 'webapp.conf' file",
        label: "Generate the web app",
        group: "webapp",
        control: { kind: "switch" },
    },
    {
        short: "s",
        long: "generate-websettings",
        argument: null,
        description: "Updates the settings.json for the web-app",
        label: "Update settings.json",
        group: "webapp",
        control: { kind: "switch" },
    },
    {
        short: "r",
        long: "render",
        argument: null,
        description: "Renders the maps configured in the 'render.conf' file",
        label: "Render the maps",
        group: "render",
        control: { kind: "switch" },
    },
    {
        short: "e",
        long: "fix-edges",
        argument: null,
        description: "Forces rendering the map-edges, instead of only rendering chunks that have been modified since the last render",
        label: "Fix map edges",
        group: "render",
        control: { kind: "switch" },
    },
    {
        short: "f",
        long: "force-render",
        argument: null,
        description: "Forces rendering everything, instead of only rendering chunks that have been modified since the last render",
        label: "Force a full re-render",
        group: "render",
        control: { kind: "switch" },
    },
    {
        short: "m",
        long: "maps",
        argument: { name: "arg", kind: "csv" },
        description: "A comma-separated list of map-id's that should be rendered. Example: 'world,nether'",
        label: "Only these maps",
        group: "render",
        control: { kind: "list", itemLabel: "Map id", unique: true, item: { kind: "text", monospace: true } },
    },
    {
        short: null,
        long: "markers",
        argument: null,
        description: "Updates the map-markers based on the map configs",
        label: "Update markers",
        group: "markers",
        control: { kind: "switch" },
    },
    {
        short: "u",
        long: "watch",
        argument: null,
        description: "Watches for file-changes after rendering and updates the map",
        label: "Watch for changes",
        group: "render",
        control: { kind: "switch" },
    },
    {
        short: "V",
        long: "version",
        argument: null,
        description: "Print the current BlueMap version",
        label: "Print the version",
        group: "info",
        control: { kind: "switch" },
    },
];

/** A run of the CLI, as a GUI would assemble it. */
export interface CliInvocation {
    readonly help: boolean;
    readonly version: boolean;
    readonly configFolder: string | null;
    readonly modsFolder: string | null;
    readonly minecraftVersion: string | null;
    readonly logFile: string | null;
    readonly append: boolean;
    readonly webserver: boolean;
    readonly verbose: boolean;
    readonly generateWebapp: boolean;
    readonly generateWebsettings: boolean;
    readonly render: boolean;
    readonly fixEdges: boolean;
    readonly forceRender: boolean;
    readonly maps: readonly string[] | null;
    readonly markers: boolean;
    readonly watch: boolean;
}

/** An invocation that does nothing but generate the config files. */
export const EMPTY_INVOCATION: CliInvocation = {
    help: false,
    version: false,
    configFolder: null,
    modsFolder: null,
    minecraftVersion: null,
    logFile: null,
    append: false,
    webserver: false,
    verbose: false,
    generateWebapp: false,
    generateWebsettings: false,
    render: false,
    fixEdges: false,
    forceRender: false,
    maps: null,
    markers: false,
    watch: false,
};

/** How much of the map a render task re-does. Upstream's `TileUpdateStrategy`. */
export type TileUpdateStrategy = "none" | "edge" | "all";

/**
 * What a given set of flags actually makes the CLI do.
 *
 * The flags are not independent. `-r`, `-f`, `-u` and `-e` all take the render
 * branch, and inside it `-g` stops meaning "generate the web app" and starts
 * meaning "force the web app to be regenerated as part of the render", while
 * `--markers` and `-s` are not reached at all. A GUI that offers checkboxes
 * without modelling that will confidently promise things the run will not do.
 */
export interface ResolvedCliActions {
    /**
     * True when the run loads the config folder, which writes any file that is
     * missing. `--help` and `--version` are answered before that happens.
     */
    readonly generatesMissingConfigs: boolean;
    readonly render: { readonly watch: boolean; readonly force: TileUpdateStrategy; readonly forceGenerateWebapp: boolean; readonly maps: readonly string[] | null } | null;
    readonly updateMarkers: { readonly maps: readonly string[] | null } | null;
    readonly regenerateWebapp: boolean;
    readonly updateWebSettings: boolean;
    readonly startWebserver: { readonly verbose: boolean } | null;
    /**
     * True when the CLI would find nothing to do: it prints the generated-config
     * message, prints the help, and exits with status 1.
     */
    readonly noActions: boolean;
    /** Things worth telling the user before the run starts. */
    readonly notes: readonly string[];
}

/** Works out what an invocation will do, mirroring `BlueMapCLI.main`. */
export function resolveCliActions(invocation: CliInvocation): ResolvedCliActions {
    const notes: string[] = [];

    if (invocation.help || invocation.version) {
        return {
            generatesMissingConfigs: false,
            render: null,
            updateMarkers: null,
            regenerateWebapp: false,
            updateWebSettings: false,
            startWebserver: null,
            noActions: false,
            notes: ["The CLI prints the requested information and exits without loading any config."],
        };
    }

    const takesRenderBranch = invocation.render || invocation.forceRender || invocation.watch || invocation.fixEdges;

    let render: ResolvedCliActions["render"] = null;
    let updateMarkers: ResolvedCliActions["updateMarkers"] = null;
    let regenerateWebapp = false;
    let updateWebSettings = false;

    if (takesRenderBranch) {
        const force: TileUpdateStrategy = invocation.forceRender ? "all" : invocation.fixEdges ? "edge" : "none";
        if (invocation.forceRender && invocation.fixEdges) notes.push("--force-render wins over --fix-edges: everything is re-rendered, not only the edges.");

        render = { watch: invocation.watch, force, forceGenerateWebapp: invocation.generateWebapp, maps: invocation.maps };

        if (invocation.markers) notes.push("--markers does nothing here: the render branch does not reach it. Run it without the render flags.");
        if (invocation.generateWebsettings) notes.push("--generate-websettings does nothing here: the render branch does not reach it.");
        if (invocation.generateWebapp) notes.push("--generate-webapp inside a render means the web app is regenerated as part of the render, rather than on its own.");
    } else {
        if (invocation.markers) updateMarkers = { maps: invocation.maps };
        if (invocation.generateWebapp) regenerateWebapp = true;
        if (invocation.generateWebsettings) updateWebSettings = true;
    }

    const startWebserver = invocation.webserver ? { verbose: invocation.verbose } : null;

    if (!invocation.webserver && invocation.verbose) notes.push("--verbose only affects the web server, which is not being started.");
    if (invocation.append && invocation.logFile === null) notes.push("--append only affects --log-file, which is not set.");
    if (invocation.maps !== null && !takesRenderBranch && !invocation.markers) notes.push("--maps only narrows a render or a marker update, neither of which is happening.");

    const noActions = render === null && updateMarkers === null && !regenerateWebapp && !updateWebSettings && startWebserver === null;
    if (noActions) notes.push("Nothing to do: the CLI writes any missing config files, prints its help, and exits with status 1.");

    if (render !== null) notes.push("Rendering downloads and reads a Minecraft client jar, so core.conf must have accept-download set to true first.");

    return { generatesMissingConfigs: true, render, updateMarkers, regenerateWebapp, updateWebSettings, startWebserver, noActions, notes };
}

/** Builds the argument list for an invocation, in the order the flags are declared. */
export function buildCliArgs(invocation: CliInvocation): string[] {
    const args: string[] = [];

    if (invocation.help) args.push("-h");
    if (invocation.version) args.push("-V");
    if (invocation.configFolder !== null) args.push("-c", invocation.configFolder);
    if (invocation.modsFolder !== null) args.push("-n", invocation.modsFolder);
    if (invocation.minecraftVersion !== null) args.push("-v", invocation.minecraftVersion);
    if (invocation.logFile !== null) args.push("-l", invocation.logFile);
    if (invocation.append) args.push("-a");
    if (invocation.render) args.push("-r");
    if (invocation.forceRender) args.push("-f");
    if (invocation.fixEdges) args.push("-e");
    if (invocation.watch) args.push("-u");
    if (invocation.maps !== null && invocation.maps.length > 0) args.push("-m", invocation.maps.join(","));
    if (invocation.markers) args.push("--markers");
    if (invocation.generateWebapp) args.push("-g");
    if (invocation.generateWebsettings) args.push("-s");
    if (invocation.webserver) args.push("-w");
    if (invocation.verbose) args.push("-b");

    return args;
}

/** A problem found while reading an argument list. */
export interface CliParseIssue {
    readonly argument: string;
    readonly message: string;
}

const BY_SHORT = new Map(CLI_FLAGS.filter((flag) => flag.short !== null).map((flag) => [flag.short as string, flag]));
const BY_LONG = new Map(CLI_FLAGS.map((flag) => [flag.long, flag]));

function applyFlag(invocation: CliInvocation, flag: CliFlag, value: string | null): CliInvocation {
    switch (flag.long) {
        case "help":
            return { ...invocation, help: true };
        case "version":
            return { ...invocation, version: true };
        case "config":
            return { ...invocation, configFolder: value };
        case "mods":
            return { ...invocation, modsFolder: value };
        case "mc-version":
            return { ...invocation, minecraftVersion: value };
        case "log-file":
            return { ...invocation, logFile: value };
        case "append":
            return { ...invocation, append: true };
        case "webserver":
            return { ...invocation, webserver: true };
        case "verbose":
            return { ...invocation, verbose: true };
        case "generate-webapp":
            return { ...invocation, generateWebapp: true };
        case "generate-websettings":
            return { ...invocation, generateWebsettings: true };
        case "render":
            return { ...invocation, render: true };
        case "fix-edges":
            return { ...invocation, fixEdges: true };
        case "force-render":
            return { ...invocation, forceRender: true };
        case "maps":
            return { ...invocation, maps: value === null ? null : value.split(",").filter((id) => id.length > 0) };
        case "markers":
            return { ...invocation, markers: true };
        case "watch":
            return { ...invocation, watch: true };
        default:
            return invocation;
    }
}

/**
 * Reads an argument list back into an invocation.
 *
 * Commons CLI accepts several spellings for the same thing, so this does too:
 * `-c dir`, `-cdir`, `--config dir` and `--config=dir` all set the config folder,
 * and grouped switches such as `-ru` work the way `java -jar cli.jar -ru` does.
 */
export function parseCliArgs(argv: readonly string[]): { invocation: CliInvocation; issues: CliParseIssue[] } {
    let invocation = EMPTY_INVOCATION;
    const issues: CliParseIssue[] = [];

    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index] as string;

        if (argument.startsWith("--")) {
            const equals = argument.indexOf("=");
            const name = equals === -1 ? argument.slice(2) : argument.slice(2, equals);
            const inlineValue = equals === -1 ? null : argument.slice(equals + 1);
            const flag = BY_LONG.get(name);

            if (flag === undefined) {
                issues.push({ argument, message: `Unrecognised option "--${name}"` });
                continue;
            }

            if (flag.argument === null) {
                if (inlineValue !== null) issues.push({ argument, message: `"--${name}" does not take a value` });
                invocation = applyFlag(invocation, flag, null);
                continue;
            }

            const value = inlineValue ?? argv[++index] ?? null;
            if (value === null) {
                issues.push({ argument, message: `"--${name}" needs a <${flag.argument.name}>` });
                continue;
            }
            invocation = applyFlag(invocation, flag, value);
            continue;
        }

        if (argument.startsWith("-") && argument.length > 1) {
            let cursor = 1;
            while (cursor < argument.length) {
                const letter = argument[cursor] as string;
                const flag = BY_SHORT.get(letter);

                if (flag === undefined) {
                    issues.push({ argument, message: `Unrecognised option "-${letter}"` });
                    cursor++;
                    continue;
                }

                if (flag.argument === null) {
                    invocation = applyFlag(invocation, flag, null);
                    cursor++;
                    continue;
                }

                // Commons CLI allows the value to be attached: -cconfig
                const attached = argument.slice(cursor + 1);
                const value = attached.length > 0 ? attached : (argv[++index] ?? null);
                if (value === null) {
                    issues.push({ argument, message: `"-${letter}" needs a <${flag.argument.name}>` });
                    break;
                }
                invocation = applyFlag(invocation, flag, value);
                break;
            }
            continue;
        }

        issues.push({ argument, message: `Unexpected argument "${argument}". The CLI takes options only.` });
    }

    return { invocation, issues };
}

/** Quotes an argument for display, so a path with a space still reads as one word. */
function quoteForDisplay(argument: string): string {
    return /[\s"']/.test(argument) ? `"${argument.replace(/"/g, '\\"')}"` : argument;
}

/**
 * The full command, for showing beside a run and for copying into a terminal.
 *
 * Always pass an absolute config folder. The CLI resolves the storage root and
 * the data folder against the *working directory*, not the config folder, so a
 * relative path is how a render writes its tiles somewhere nobody expected.
 */
export function formatCliCommand(jarPath: string, invocation: CliInvocation): string {
    return ["java", "-jar", quoteForDisplay(jarPath), ...buildCliArgs(invocation).map(quoteForDisplay)].join(" ");
}

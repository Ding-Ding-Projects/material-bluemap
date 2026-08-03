/**
 * Binding the CLI's flags to controls.
 *
 * `@material-bluemap/config` models the flags and works out what a given set of
 * them actually makes the CLI do. What it deliberately does not carry is the
 * mapping from one flag to one field of {@link CliInvocation}, because that is a
 * user-interface concern. It lives here, next to the screen that uses it, and
 * away from the component so it can be tested without a DOM.
 *
 * The point of the run screen is the second half of "everything you would
 * otherwise have typed". Somebody who can set every key in every config file but
 * cannot say "render only the nether, and fix the edges while you are at it"
 * still has to open a terminal.
 */

import { CLI_FLAGS, type CliFlag, type CliInvocation } from "@material-bluemap/config";

/** A flag's current value, in the shape its control binds to. */
export type FlagValue = boolean | string | readonly string[] | null;

interface Binding {
    readonly get: (invocation: CliInvocation) => FlagValue;
    readonly set: (invocation: CliInvocation, value: FlagValue) => CliInvocation;
}

function switchBinding(key: keyof CliInvocation): Binding {
    return {
        get: (invocation) => invocation[key] === true,
        set: (invocation, value) => ({ ...invocation, [key]: value === true }),
    };
}

function textBinding(key: keyof CliInvocation): Binding {
    return {
        get: (invocation) => (invocation[key] as string | null) ?? "",
        set: (invocation, value) => ({ ...invocation, [key]: typeof value === "string" && value !== "" ? value : null }),
    };
}

/**
 * Every flag, bound to the field it drives.
 *
 * The table is keyed by the long option name, and the test suite checks it
 * covers every entry of `CLI_FLAGS`, so a flag added upstream and modelled in
 * the config package cannot appear on this screen without a working control.
 */
export const FLAG_BINDINGS: Readonly<Record<string, Binding>> = {
    help: switchBinding("help"),
    version: switchBinding("version"),
    config: textBinding("configFolder"),
    mods: textBinding("modsFolder"),
    "mc-version": textBinding("minecraftVersion"),
    "log-file": textBinding("logFile"),
    append: switchBinding("append"),
    webserver: switchBinding("webserver"),
    verbose: switchBinding("verbose"),
    "generate-webapp": switchBinding("generateWebapp"),
    "generate-websettings": switchBinding("generateWebsettings"),
    render: switchBinding("render"),
    "fix-edges": switchBinding("fixEdges"),
    "force-render": switchBinding("forceRender"),
    maps: {
        get: (invocation) => invocation.maps ?? [],
        set: (invocation, value) => ({
            ...invocation,
            maps: Array.isArray(value) && value.length > 0 ? value.map(String) : null,
        }),
    },
    markers: switchBinding("markers"),
    watch: switchBinding("watch"),
};

/** The current value of a flag. */
export function flagValue(invocation: CliInvocation, flag: CliFlag): FlagValue {
    const binding = FLAG_BINDINGS[flag.long];
    return binding === undefined ? null : binding.get(invocation);
}

/** An invocation with one flag changed. */
export function withFlagValue(invocation: CliInvocation, flag: CliFlag, value: FlagValue): CliInvocation {
    const binding = FLAG_BINDINGS[flag.long];
    return binding === undefined ? invocation : binding.set(invocation, value);
}

/** Everything a flag search should look at. */
export function flagSearchText(flag: CliFlag): string {
    const short = flag.short === null ? "" : `-${flag.short}`;
    return [flag.label, `--${flag.long}`, short, flag.description, flag.group].join("\n");
}

/** Groups for the run screen, in the order they are shown. */
export const FLAG_GROUPS: readonly { id: string; label: string }[] = [
    { id: "render", label: "Rendering" },
    { id: "webapp", label: "Web app" },
    { id: "webserver", label: "Web server" },
    { id: "markers", label: "Markers" },
    { id: "paths", label: "Folders" },
    { id: "resources", label: "Resources" },
    { id: "logging", label: "Logging" },
    { id: "info", label: "Information" },
];

/** The flags in one group, in the order upstream declares them. */
export function flagsInGroup(group: string): CliFlag[] {
    return CLI_FLAGS.filter((flag) => flag.group === group);
}

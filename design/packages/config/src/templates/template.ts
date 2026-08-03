/**
 * A port of upstream's `ConfigTemplate`.
 *
 * BlueMap's config files are not written from a data structure. They are written
 * from an annotated text template with two placeholder forms:
 *
 *   `${name}`              a variable, replaced by its value
 *   `${name<< ... >>}`     a conditional, kept only when `name` is enabled
 *
 * Reproducing that exactly matters, because a config folder this app generates
 * has to be indistinguishable from one the Java CLI generates. Anything else and
 * a person comparing the two would reasonably conclude one of them is broken.
 *
 * Upstream escapes `$` and `\` in every replacement because Java's
 * `Matcher.replaceAll` treats them as syntax. JavaScript's replacer functions
 * take their return value literally, so the escaping is not needed here and the
 * output is the same either way.
 *
 * Source: `vendor/BlueMap/common/src/main/java/de/bluecolored/bluemap/common/config/ConfigTemplate.java`
 */

import { sep } from "node:path";

const TEMPLATE_VARIABLE = /\$\{([\w\-.]+)\}/g;
const TEMPLATE_CONDITIONAL = /\$\{([\w\-.]+)<<([\s\S]*?)>>\}/g;

/** What upstream substitutes for a variable nobody supplied a value for. */
export const UNSET_VARIABLE = "?";

export class ConfigTemplate {
    private readonly template: string;
    private readonly enabledConditionals = new Set<string>();
    private readonly variables = new Map<string, string>();

    constructor(template: string) {
        this.template = template;
    }

    /** Enables or disables a `${name<< ... >>}` block. */
    setConditional(conditional: string, enabled: boolean): this {
        if (enabled) this.enabledConditionals.add(conditional);
        else this.enabledConditionals.delete(conditional);
        return this;
    }

    /** Sets a `${name}` variable. Passing `null` unsets it, leaving `?` behind. */
    setVariable(variable: string, value: string | null): this {
        if (value === null) this.variables.delete(variable);
        else this.variables.set(variable, value);
        return this;
    }

    /** Expands the template into the text that gets written to disk. */
    build(): string {
        return this.expand(this.template);
    }

    private expand(text: string): string {
        // Conditionals first, over the whole text, exactly as upstream does it.
        // An enabled block has its own contents expanded recursively; a disabled
        // one disappears entirely, taking its newlines with it.
        const withConditionals = text.replace(TEMPLATE_CONDITIONAL, (_match, name: string, body: string) =>
            this.enabledConditionals.has(name) ? this.expand(body) : "",
        );

        return withConditionals.replace(TEMPLATE_VARIABLE, (_match, name: string) => this.variables.get(name) ?? UNSET_VARIABLE);
    }
}

/**
 * Formats a path the way upstream writes one into a config file: the platform
 * separator becomes a forward slash, and any backslash that survives is escaped
 * so the surrounding quoted string still parses.
 *
 * The template already supplies the quotes (`data: "${data}"`), so a value
 * substituted into it has to arrive HOCON-escaped rather than being escaped
 * later by the writer.
 *
 * Upstream also relativises the path against the working directory. This app
 * deliberately does not: the CLI resolves every relative path in these files
 * against the process working directory rather than against the config folder,
 * so a relative path is how a render ends up writing 47 MB of tiles into
 * whatever directory the app happened to be launched from. Absolute paths only.
 *
 * @param separator the platform path separator, defaulting to this platform's
 */
export function formatConfigPath(path: string, separator: string = sep): string {
    const forwardSlashed = separator === "/" ? path : path.split(separator).join("/");
    return forwardSlashed.replace(/\\/g, "\\\\");
}

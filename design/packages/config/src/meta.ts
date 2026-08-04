/**
 * UI metadata attached to every configuration field.
 *
 * The options GUI is generated from this, so a field that is missing here is a
 * setting nobody can reach without opening a text editor. Everything upstream
 * BlueMap writes into a generated config file has an entry, and so does every
 * field that exists on the Java config class but is deliberately left out of the
 * template (marked `hidden`, see {@link FieldMeta.hidden}).
 *
 * The documentation strings are lifted verbatim from the comments in upstream's
 * own config templates under
 * `vendor/BlueMap/common/src/main/resources/de/bluecolored/bluemap/config/`.
 * Those comments are the real documentation for these settings, so the GUI shows
 * them rather than a paraphrase written from memory.
 */

/** A single option in a {@link SelectControl}. */
export interface SelectOption {
    /** The value written to the config file. */
    readonly value: string | number;
    /** Short human label. */
    readonly label: string;
    /** Longer explanation, shown as helper text. */
    readonly description?: string;
}

/** One axis of a {@link VectorControl}. */
export interface VectorAxis {
    /** Key inside the object, e.g. `x`. */
    readonly key: string;
    readonly label: string;
    readonly min?: number;
    readonly max?: number;
}

/** An on/off toggle. */
export interface SwitchControl {
    readonly kind: "switch";
}

/** A free numeric entry, optionally bounded. */
export interface NumberControl {
    readonly kind: "number";
    readonly integer: boolean;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    /** Unit shown as a suffix, e.g. `seconds`. */
    readonly unit?: string;
}

/** A bounded numeric entry that is better expressed as a track. */
export interface SliderControl {
    readonly kind: "slider";
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly integer: boolean;
    readonly unit?: string;
}

/**
 * One placeholder a format string accepts, offered as an insertable chip.
 *
 * A format string is genuinely free text, so it stays a text field. What it is
 * not is *opaque* text: upstream's own comment for the webserver access log
 * lists seven numbered arguments and an example of each, and a person who has to
 * retype `%1$s` from a doc comment three lines below the field will get it wrong
 * once and then leave the default alone forever. The tokens make the closed part
 * of an open field reachable without turning the field into a select it cannot be.
 */
export interface TextToken {
    /** The literal inserted at the caret, e.g. `%1$s`. */
    readonly insert: string;
    /** Short label for the chip, e.g. `Source address`. */
    readonly label: string;
    /** Upstream's own example of what it expands to, e.g. `10.10.10.10`. */
    readonly example: string;
}

/** A text field. */
export interface TextControl {
    readonly kind: "text";
    readonly multiline?: boolean;
    readonly placeholder?: string;
    /** Format strings, URLs and JDBC URLs read better in a mono face. */
    readonly monospace?: boolean;
    /** Placeholders this field understands, insertable at the caret. */
    readonly tokens?: readonly TextToken[];
}

/** A file-system path with a picker beside it. */
export interface PathControl {
    readonly kind: "path";
    readonly select: "directory" | "file";
    /** File extensions offered by the picker, without the dot. */
    readonly extensions?: readonly string[];
    /**
     * Whether the path is resolved against the process working directory rather
     * than the config folder. Upstream's CLI resolves every relative path in
     * these files against the working directory, which is why the app always
     * writes absolute paths.
     */
    readonly relativeToWorkingDirectory: boolean;
}

/** A closed set of values. */
export interface SelectControl {
    readonly kind: "select";
    readonly options: readonly SelectOption[];
    /**
     * True when the config accepts values outside `options` (a namespaced key
     * from a mod or datapack, for example), so the GUI offers free entry too.
     *
     * This is not a styling choice. It has to be true whenever the schema is
     * wider than the option list, because a closed control bound to a value it
     * has no option for shows nothing at all: the setting reads as unset, and
     * the next click overwrites a value the user put there deliberately.
     * `controlPolicy.test.ts` refuses a closed select over an open schema.
     */
    readonly allowCustom: boolean;
    /**
     * The default namespace BlueMap parses this field's value with, when the
     * value is one of its registry keys.
     *
     * `Key.parse("gzip", "bluemap")` and `Key.parse("bluemap:gzip", "bluemap")`
     * are the same key, and BlueMap's generated templates write the short form
     * while the Java defaults carry the long one. Without this, a `compression`
     * of `bluemap:gzip` matches no option spelled `gzip` and the control shows a
     * raw key beside a list it plainly belongs to. With it, the two forms match
     * and the label is shown - and the file keeps whichever spelling it already
     * had, because normalising somebody's file on open is not this app's job.
     */
    readonly keyNamespace?: string;
}

/** A colour, as the hex string BlueMap stores. */
export interface ColorControl {
    readonly kind: "color";
    /** BlueMap accepts `#rrggbb` and `#rrggbbaa` for these fields. */
    readonly alpha: boolean;
}

/** A fixed set of numeric components stored as an object. */
export interface VectorControl {
    readonly kind: "vector";
    readonly axes: readonly VectorAxis[];
    readonly integer: boolean;
}

/** An ordered list of same-shaped values. */
export interface ListControl {
    readonly kind: "list";
    readonly item: Control;
    readonly itemLabel: string;
    /** True when duplicate entries are dropped, as for a Java `LinkedHashSet`. */
    readonly unique: boolean;
}

/** An editable string-to-string mapping. */
export interface KeyValueControl {
    readonly kind: "key-value";
    readonly keyLabel: string;
    readonly valueLabel: string;
    /**
     * Keys whose values are credentials. The GUI masks these and they are never
     * written to a log, a Discussion, an issue, or an exported diagnostic.
     */
    readonly secretKeys: readonly string[];
}

/** The render mask: an ordered list of additive and subtractive shapes. */
export interface MaskListControl {
    readonly kind: "mask-list";
}

/** Static marker sets. Structured content rather than a scalar setting. */
export interface MarkerSetsControl {
    readonly kind: "marker-sets";
}

export type Control =
    | SwitchControl
    | NumberControl
    | SliderControl
    | TextControl
    | PathControl
    | SelectControl
    | ColorControl
    | VectorControl
    | ListControl
    | KeyValueControl
    | MaskListControl
    | MarkerSetsControl;

/**
 * What upstream writes into a freshly generated file, when that differs from the
 * Java class default.
 *
 * These two really do disagree in several places (`edge-light-strength` defaults
 * to 15 in `MapConfig` but the template writes 8), so a GUI that shows only one
 * of them will mislead somebody. Both are carried.
 */
export interface TemplateValue {
    /** The literal the template writes, already expanded. */
    readonly value: unknown;
    /** Why it differs, in upstream's own terms. */
    readonly note: string;
}

/** A group of related fields, used to lay the options GUI out. */
export interface GroupMeta {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
}

/** A key that used to be valid and now produces a hard error. */
export interface LegacyKey {
    readonly key: string;
    readonly message: string;
}

/** Everything the GUI needs to render and validate one configuration field. */
export interface FieldMeta {
    /** Dotted path inside its config file, e.g. `log.file`. */
    readonly path: string;
    /** The final path segment as written in HOCON, e.g. `file`. */
    readonly key: string;
    /** Path segments, e.g. `["log", "file"]`. */
    readonly segments: readonly string[];
    /**
     * The camelCase field on the Java config class. Configurate maps between the
     * two with its `LOWER_CASE_DASHED` naming scheme.
     */
    readonly javaField: string;
    readonly label: string;
    /** Upstream's own comment for this field, verbatim. */
    readonly doc: string;
    readonly group: string;
    readonly control: Control;
    /** The default on the Java config class. */
    readonly default: unknown;
    /** What a freshly generated file contains, when it differs from `default`. */
    readonly templateValue?: TemplateValue;
    /** True when the template ships this key commented out. */
    readonly commentedOutInTemplate: boolean;
    /**
     * True when the field exists on the Java config class but appears nowhere in
     * the template. Setting it works; upstream just does not advertise it.
     */
    readonly hidden: boolean;
    /**
     * True when changing this value makes already-rendered tiles wrong, so the
     * GUI must warn that saving forces a re-render.
     */
    readonly invalidatesTiles: boolean;
    /** Upstream's own qualification, when the answer above has conditions. */
    readonly invalidationNote?: string;
    /** True for fields most people should never need to touch. */
    readonly advanced: boolean;
    /**
     * A range or set upstream recommends but does not enforce.
     *
     * The schema stays as permissive as the Java class, because rejecting a file
     * BlueMap loads happily would be a bug in this package rather than in the
     * file. Values outside this range are reported as a warning instead, in
     * upstream's own words.
     */
    readonly advisory?: {
        readonly min?: number;
        readonly max?: number;
        readonly oneOf?: readonly (string | number)[];
        readonly note: string;
    };
    /**
     * True for `accept-download`. This one is not an ordinary switch: it is
     * Mojang EULA acceptance, and the app sources it from its own consent record
     * rather than putting a licence in front of somebody mid-task.
     */
    readonly consentGated?: boolean;
    /** True when the value is a credential and must never be logged or exported. */
    readonly secret?: boolean;
}

/** The seven configuration files BlueMap reads. */
export type ConfigFileId = "core" | "webapp" | "webserver" | "plugin" | "map" | "storage-file" | "storage-sql";

/**
 * Where a config file lives inside the config folder, and how many of it there
 * can be.
 */
export interface ConfigFileLocation {
    /**
     * Path relative to the config root, with `<id>` standing in for the part the
     * user names, e.g. `maps/<id>.conf`.
     */
    readonly pattern: string;
    /** `single` for `core.conf`; `many` for map and storage configs. */
    readonly cardinality: "single" | "many";
    /** Folder holding the `many` files, relative to the config root. */
    readonly folder?: string;
}

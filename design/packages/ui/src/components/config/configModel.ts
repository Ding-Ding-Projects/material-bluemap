/**
 * One config file, open for editing.
 *
 * The editor never rebuilds a config file from a plain object. It parses the file
 * BlueMap generated, changes the one key the user changed, and writes the
 * document back, so every comment, blank line and hand-written note survives.
 * That is the whole reason `@worldlens/config` carries a round-tripping
 * HOCON reader rather than `JSON.parse` over a converted file.
 *
 * Every function here returns a new value; nothing is mutated. That keeps the
 * Vue layer to a single `shallowRef` swap per edit and makes the whole model
 * testable without a component.
 */

import {
    deleteValue,
    hasValue,
    parseHocon,
    readPath,
    resolve,
    setPlainValue,
    validateConfigValue,
    writeHocon,
    HoconError,
    type ConfigFileDescriptor,
    type ConfigIssue,
    type FieldMeta,
    type HoconDocument,
    type PlainValue,
} from "@worldlens/config";

/** A descriptor with its value type erased, which is all the GUI needs. */
export type AnyDescriptor = ConfigFileDescriptor<unknown>;

export interface EditableConfigFile {
    readonly descriptor: AnyDescriptor;
    /** Path relative to the config folder, always forward slashes. */
    readonly path: string;
    /** The text as it was last read from or written to disk. */
    readonly baselineText: string;
    /** The text as it stands now, ready to be written. */
    readonly text: string;
    /** The parsed document, or null when the text is not valid HOCON. */
    readonly document: HoconDocument | null;
    /** Validated value with defaults filled in, or null when validation failed. */
    readonly value: unknown;
    /** The same, for {@link baselineText}, so a change list can be computed. */
    readonly baselineValue: unknown;
    readonly issues: readonly ConfigIssue[];
    /**
     * True when this editor refuses to write the file. BlueMap reads `.json`
     * config files with a JSON loader, and writing HOCON into one would produce
     * a file that loader rejects.
     */
    readonly readOnly: boolean;
    readonly readOnlyReason: string | null;
}

/** True when the text differs from what is on disk. */
export function isDirty(file: EditableConfigFile): boolean {
    return file.text !== file.baselineText;
}

/** True when the file can be edited through controls rather than as raw text. */
export function isStructurallyEditable(file: EditableConfigFile): boolean {
    return file.document !== null && !file.readOnly;
}

function reason(path: string): string | null {
    if (path.endsWith(".json")) {
        return "BlueMap reads this file with its JSON loader. This editor writes HOCON, which that loader would refuse, so the file is shown read-only. Rename it to .conf to edit it here.";
    }
    return null;
}

function analyse(descriptor: AnyDescriptor, text: string): { document: HoconDocument | null; value: unknown; issues: ConfigIssue[] } {
    let document: HoconDocument;
    try {
        document = parseHocon(text);
    } catch (error) {
        const message = error instanceof HoconError ? error.message : String(error);
        return {
            document: null,
            value: null,
            issues: [{ severity: "error", kind: "hocon", path: "", message, file: descriptor.id }],
        };
    }

    const result = validateConfigValue(descriptor, resolve(document));
    return { document, value: result.value, issues: [...result.issues] };
}

/** Opens a file's text against a descriptor. */
export function openConfigFile(descriptor: AnyDescriptor, path: string, text: string): EditableConfigFile {
    const { document, value, issues } = analyse(descriptor, text);
    const readOnlyReason = reason(path);

    return {
        descriptor,
        path,
        baselineText: text,
        text,
        document,
        value,
        baselineValue: value,
        issues,
        readOnly: readOnlyReason !== null,
        readOnlyReason,
    };
}

/** Replaces the whole file text, for the raw editor and for import. */
export function replaceText(file: EditableConfigFile, text: string): EditableConfigFile {
    const { document, value, issues } = analyse(file.descriptor, text);
    return { ...file, text, document, value, issues };
}

/** Records that the current text is what is now on disk. */
export function markSaved(file: EditableConfigFile): EditableConfigFile {
    return { ...file, baselineText: file.text, baselineValue: file.value };
}

function rebuild(file: EditableConfigFile, document: HoconDocument): EditableConfigFile {
    const text = writeHocon(document);
    const result = validateConfigValue(file.descriptor, resolve(document));
    return { ...file, document, text, value: result.value, issues: [...result.issues] };
}

/**
 * Writes one setting.
 *
 * A file that failed to parse is returned untouched: there is no document to
 * edit, and inventing one would throw away whatever the user has in the file.
 * The interface shows the parse error and the raw editor in that state instead.
 */
export function setFieldValue(file: EditableConfigFile, field: FieldMeta, value: PlainValue): EditableConfigFile {
    if (!isStructurallyEditable(file) || file.document === null) return file;
    return rebuild(file, setPlainValue(file.document, field.segments, value));
}

/**
 * Removes a setting, so BlueMap falls back to its own default.
 *
 * The key's surrounding comments stay in the file, because they document the
 * setting rather than the value, and a config file that stops explaining itself
 * is a worse file than one with an unused comment in it.
 */
export function clearFieldValue(file: EditableConfigFile, field: FieldMeta): EditableConfigFile {
    if (!isStructurallyEditable(file) || file.document === null) return file;
    if (!hasValue(file.document, field.segments)) return file;
    return rebuild(file, deleteValue(file.document, field.segments));
}

/** The effective value of a field: what the file says, or the default it implies. */
export function fieldValue(file: EditableConfigFile, field: FieldMeta): PlainValue | undefined {
    if (file.value === null) return undefined;
    return readPath(file.value, field.segments) as PlainValue | undefined;
}

/** The value the same field had when the file was last saved. */
export function baselineFieldValue(file: EditableConfigFile, field: FieldMeta): PlainValue | undefined {
    if (file.baselineValue === null) return undefined;
    return readPath(file.baselineValue, field.segments) as PlainValue | undefined;
}

/** True when the file names this setting explicitly rather than inheriting it. */
export function isExplicit(file: EditableConfigFile, field: FieldMeta): boolean {
    if (file.document === null) return false;
    return hasValue(file.document, field.segments);
}

/** One setting that differs from what is on disk. */
export interface FieldChange {
    readonly field: FieldMeta;
    readonly from: PlainValue | undefined;
    readonly to: PlainValue | undefined;
    /** True when applying this change makes already-rendered tiles wrong. */
    readonly invalidatesTiles: boolean;
    /** Upstream's own qualification, when there is one. */
    readonly invalidationNote: string | undefined;
}

/**
 * Which settings actually changed.
 *
 * Effective values are compared, not file text. Writing a key that was already
 * inheriting the same default changes the file but changes nothing about the
 * render, and warning about a re-render in that case would train people to
 * ignore the warning. {@link isDirty} still reports the text change, so the file
 * is still saved.
 */
export function changedFields(file: EditableConfigFile): FieldChange[] {
    if (file.value === null || file.baselineValue === null) return [];

    const changes: FieldChange[] = [];
    for (const field of file.descriptor.fields) {
        const from = baselineFieldValue(file, field);
        const to = fieldValue(file, field);
        if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
        changes.push({
            field,
            from,
            to,
            invalidatesTiles: field.invalidatesTiles,
            invalidationNote: field.invalidationNote,
        });
    }
    return changes;
}

/** The subset of {@link changedFields} that forces already-rendered tiles to be redone. */
export function tileInvalidatingChanges(file: EditableConfigFile): FieldChange[] {
    return changedFields(file).filter((change) => change.invalidatesTiles);
}

/** True when nothing in the file stops BlueMap from loading it. */
export function hasBlockingIssues(file: EditableConfigFile): boolean {
    return file.issues.some((issue) => issue.severity === "error");
}

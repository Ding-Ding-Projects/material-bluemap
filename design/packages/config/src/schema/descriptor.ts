/**
 * A configuration file, described well enough to generate a GUI from it.
 *
 * A descriptor pairs a zod schema (what the values are and what they may be)
 * with a field list (what to call them, how to edit them, what upstream's own
 * documentation says about them, and whether changing one throws away tiles that
 * are already rendered).
 *
 * The two halves are checked against each other by
 * {@link checkDescriptorConsistency}, which the test suite runs over every
 * descriptor. A field that exists in the schema but not the field list is a
 * setting the GUI would never show; a field in the list but not the schema is a
 * control that would write a key BlueMap ignores. Neither is allowed to happen
 * quietly.
 */

import type { z } from "zod";
import type { ConfigFileId, ConfigFileLocation, FieldMeta, GroupMeta, LegacyKey } from "../meta.js";

export interface ConfigFileDescriptor<T> {
    readonly id: ConfigFileId;
    /** Human title for the GUI tab. */
    readonly title: string;
    /** One line saying what the file is for. */
    readonly description: string;
    readonly location: ConfigFileLocation;
    /** Validates and fills in defaults for the plain value a HOCON file resolves to. */
    readonly schema: z.ZodType<T>;
    readonly fields: readonly FieldMeta[];
    readonly groups: readonly GroupMeta[];
    /** Keys that used to be valid and now mean the file needs upgrading. */
    readonly legacyKeys: readonly LegacyKey[];
    /** Upstream's annotated template for this file, before variable expansion. */
    readonly template: string;
}

/** True for a value that behaves like a HOCON object rather than a leaf. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinPath(prefix: string, key: string): string {
    return prefix === "" ? key : `${prefix}.${key}`;
}

/**
 * Walks a value, stopping at any path the field list calls a leaf.
 *
 * `start-pos` is an object in the file and a single control in the GUI, so the
 * walk has to be told where to stop rather than descending into every object it
 * meets.
 */
function collectPaths(value: unknown, prefix: string, leaves: ReadonlySet<string>, into: string[]): void {
    if (prefix !== "" && leaves.has(prefix)) {
        into.push(prefix);
        return;
    }
    if (isRecord(value)) {
        const keys = Object.keys(value);
        if (keys.length === 0 && prefix !== "") {
            into.push(prefix);
            return;
        }
        for (const key of keys) collectPaths(value[key], joinPath(prefix, key), leaves, into);
        return;
    }
    if (prefix !== "") into.push(prefix);
}

/** Reads a dotted path out of a plain value. */
export function readPath(value: unknown, path: readonly string[]): unknown {
    let cursor: unknown = value;
    for (const segment of path) {
        if (!isRecord(cursor)) return undefined;
        cursor = cursor[segment];
    }
    return cursor;
}

/** A disagreement between a descriptor's schema and its field list. */
export interface DescriptorProblem {
    readonly file: ConfigFileId;
    readonly path: string;
    readonly message: string;
}

/**
 * Checks a descriptor against itself.
 *
 * The defaults come out of the schema by parsing an empty object, which works
 * because every field in every one of these schemas carries a default. That also
 * means the check covers the thing most worth checking: whether the default this
 * package would write matches the default the Java class actually has.
 */
export function checkDescriptorConsistency<T>(descriptor: ConfigFileDescriptor<T>): DescriptorProblem[] {
    const problems: DescriptorProblem[] = [];
    const push = (path: string, message: string): void => {
        problems.push({ file: descriptor.id, path, message });
    };

    const parsed = descriptor.schema.safeParse({});
    if (!parsed.success) {
        push("", `The schema cannot produce a default value: ${parsed.error.message}`);
        return problems;
    }

    const leaves = new Set(descriptor.fields.map((field) => field.path));
    const schemaPaths: string[] = [];
    collectPaths(parsed.data, "", leaves, schemaPaths);

    for (const path of schemaPaths) {
        if (!leaves.has(path)) push(path, "The schema has this key but no field metadata describes it, so the GUI would never show it");
    }

    for (const field of descriptor.fields) {
        if (!schemaPaths.includes(field.path)) {
            push(field.path, "Field metadata describes this key but the schema does not have it, so the GUI would write a key BlueMap ignores");
            continue;
        }

        const schemaDefault = readPath(parsed.data, field.segments);
        if (JSON.stringify(schemaDefault) !== JSON.stringify(field.default)) {
            push(field.path, `The schema default ${JSON.stringify(schemaDefault)} does not match the documented default ${JSON.stringify(field.default)}`);
        }

        const expectedKey = field.segments[field.segments.length - 1];
        if (field.key !== expectedKey) push(field.path, `key is ${JSON.stringify(field.key)} but the path ends in ${JSON.stringify(expectedKey)}`);
        if (field.segments.join(".") !== field.path) push(field.path, "segments do not spell out the path");

        if (!descriptor.groups.some((group) => group.id === field.group)) {
            push(field.path, `group ${JSON.stringify(field.group)} is not declared on this descriptor`);
        }
    }

    return problems;
}

/** Every path a descriptor recognises, including the containers along the way. */
export function knownPaths<T>(descriptor: ConfigFileDescriptor<T>): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const field of descriptor.fields) {
        for (let length = 1; length <= field.segments.length; length++) {
            paths.add(field.segments.slice(0, length).join("."));
        }
    }
    return paths;
}

/** The subset of paths that are editable leaves rather than containers. */
export function leafPaths<T>(descriptor: ConfigFileDescriptor<T>): ReadonlySet<string> {
    return new Set(descriptor.fields.map((field) => field.path));
}

/** Looks a field up by its dotted path. */
export function findField<T>(descriptor: ConfigFileDescriptor<T>, path: string): FieldMeta | undefined {
    return descriptor.fields.find((field) => field.path === path);
}

/** Groups a descriptor's fields for laying out a settings surface. */
export function fieldsByGroup<T>(descriptor: ConfigFileDescriptor<T>): { group: GroupMeta; fields: readonly FieldMeta[] }[] {
    return descriptor.groups.map((group) => ({ group, fields: descriptor.fields.filter((field) => field.group === group.id) }));
}

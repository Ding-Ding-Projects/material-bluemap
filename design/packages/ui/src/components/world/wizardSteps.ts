/**
 * The wizard's steps, and where each of BlueMap's map settings is asked.
 *
 * Nothing here lists a setting by hand except the five the first, second and
 * fourth steps ask for in their own words. Everything else is whatever remains in
 * `@material-bluemap/config`, grouped by the schema's own groups, so a setting
 * added to the schema tomorrow appears in the options step with no change to this
 * file. That is the whole point: a hand-written list of 92 fields is a list that
 * silently stops being 92 fields, and nobody notices until somebody asks why a
 * setting cannot be reached.
 *
 * Which groups start folded is derived too. A group is advanced when every
 * setting left in it is one upstream marks advanced, so a first render never
 * requires reading tile geometry documentation, and an expert still finds it two
 * clicks away rather than in a text editor.
 */

import { descriptorFor, type ConfigFileDescriptor, type FieldMeta } from "@material-bluemap/config";

export const WIZARD_STEPS = ["world", "identity", "options", "storage", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardStepMeta {
    readonly id: WizardStep;
    /** Translation key for the step's title. */
    readonly key: string;
    /** English fallback, which is also what a build with no locale shows. */
    readonly label: string;
}

export const WIZARD_STEP_META: readonly WizardStepMeta[] = [
    { id: "world", key: "world.wizard.step.world", label: "World" },
    { id: "identity", key: "world.wizard.step.identity", label: "Name and dimension" },
    { id: "options", key: "world.wizard.step.options", label: "Options" },
    { id: "storage", key: "world.wizard.step.storage", label: "Where it goes" },
    { id: "review", key: "world.wizard.step.review", label: "Review" },
];

/** The map settings the world step asks for in its own words. */
export const WORLD_STEP_PATHS: readonly string[] = ["world"];

/** The map settings the naming step asks for in its own words. */
export const IDENTITY_STEP_PATHS: readonly string[] = ["name", "dimension", "dimension-type", "sorting"];

/** The map settings the storage step asks for in its own words. */
export const STORAGE_STEP_PATHS: readonly string[] = ["storage"];

/**
 * Every path a step other than the options step already asks for.
 *
 * The options step is the complement of this set, never an enumeration, so it
 * cannot fall behind the schema.
 */
export const OWNED_BY_OTHER_STEPS: ReadonlySet<string> = new Set([
    ...WORLD_STEP_PATHS,
    ...IDENTITY_STEP_PATHS,
    ...STORAGE_STEP_PATHS,
]);

/** Which step asks for a given map setting. Every field has exactly one. */
export function stepOf(path: string): WizardStep {
    if (WORLD_STEP_PATHS.includes(path)) return "world";
    if (IDENTITY_STEP_PATHS.includes(path)) return "identity";
    if (STORAGE_STEP_PATHS.includes(path)) return "storage";
    return "options";
}

export interface WizardOptionGroup {
    readonly id: string;
    readonly label: string;
    readonly description: string | undefined;
    readonly fields: readonly FieldMeta[];
    /** How many of them upstream does not mark advanced. */
    readonly everyday: number;
    /** True when the whole group is expert territory, so it starts folded. */
    readonly advanced: boolean;
}

/** The map descriptor, which is the only schema this wizard edits. */
export function mapDescriptor(): ConfigFileDescriptor<unknown> {
    return descriptorFor("map") as ConfigFileDescriptor<unknown>;
}

/** Every map setting the options step is responsible for showing. */
export function optionFields(): readonly FieldMeta[] {
    return mapDescriptor().fields.filter((field) => !OWNED_BY_OTHER_STEPS.has(field.path));
}

/**
 * The options step's groups, in the schema's own order.
 *
 * A group whose every setting is asked for by an earlier step disappears rather
 * than being rendered empty; `storage` is the one that does today.
 */
export function optionGroups(): WizardOptionGroup[] {
    const descriptor = mapDescriptor();

    return descriptor.groups
        .map((group) => {
            const fields = descriptor.fields.filter(
                (field) => field.group === group.id && !OWNED_BY_OTHER_STEPS.has(field.path),
            );
            const everyday = fields.filter((field) => !field.advanced).length;
            return {
                id: group.id,
                label: group.label,
                description: group.description,
                fields,
                everyday,
                advanced: fields.length > 0 && everyday === 0,
            };
        })
        .filter((group) => group.fields.length > 0);
}

/** The groups that start open: the ones with at least one everyday setting in them. */
export function defaultOpenGroups(groups: readonly WizardOptionGroup[]): string[] {
    return groups.filter((group) => !group.advanced).map((group) => group.id);
}

/**
 * The map settings a render request actually carries today.
 *
 * The local engine writes its own config file for a single render from the
 * request it was handed, and the request has room for these six settings and no
 * others. The review step reads this to say which of the person's changes reach
 * this render and which are carried in the map config file instead, because a
 * wizard that implies all 92 take effect and silently drops 86 of them is a
 * wizard that lies.
 */
export const REQUEST_BACKED_PATHS: ReadonlySet<string> = new Set([
    "world",
    "dimension",
    "name",
    "sorting",
    "start-pos",
    "storage",
]);

/** True when a change to this setting reaches the local render engine. */
export function reachesRender(path: string): boolean {
    return REQUEST_BACKED_PATHS.has(path);
}

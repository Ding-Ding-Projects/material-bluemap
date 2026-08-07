/**
 * The create-a-map wizard, as plain functions over refs.
 *
 * Everything that decides anything lives here rather than in the components, for
 * the same reason first-run setup does: the rules worth trusting are the ones a
 * test can prove, and a wizard's rules are exactly the sort that get quietly
 * broken by a template change six months later.
 *
 * Two of them are load-bearing:
 *
 *  - **the map config is rebuilt, never patched.** Every identity answer feeds
 *    upstream's own map template, and the person's option edits are replayed on
 *    top of the fresh text. Changing the dimension after tuning the lighting
 *    therefore produces the nether template with the tuning still on it, instead
 *    of an overworld file with a nether key written into it;
 *  - **the map id is validated against the engine's own rule**, not against a
 *    looser one. The main process rejects an id outside `[a-z0-9][a-z0-9_-]*`
 *    before it writes anything, so an id that would be refused there is refused
 *    here, on the step that asked for it, rather than at the end of the wizard.
 */

import { computed, ref, shallowRef, type ComputedRef, type Ref } from "vue";
import {
    findField,
    renderMapTemplate,
    type ConfigIssue,
    type ConfigFileDescriptor,
    type FieldMeta,
    type MapPreset,
    type PlainValue,
} from "@worldlens/config";
import {
    changedFields,
    clearFieldValue,
    fieldValue,
    hasBlockingIssues,
    openConfigFile,
    setFieldValue,
    type EditableConfigFile,
    type FieldChange,
} from "../config/configModel.js";
import {
    isAbsolutePath,
    uncheckedWorld,
    type WorldDimension,
    type WorldInspection,
} from "./worldFolder.js";
import {
    WIZARD_STEPS,
    mapDescriptor,
    reachesRender,
    stepOf,
    type WizardStep,
} from "./wizardSteps.js";
import type { RenderMapRequest, RenderRequest } from "./worldBridge.js";

/**
 * What the engine accepts as a map id.
 *
 * Copied deliberately rather than shared: the id becomes a directory name and a
 * URL path segment, the main process validates it with exactly this expression
 * before writing anything, and a wizard that accepts `My World` produces a render
 * that is refused with `invalid-request` after the person has answered five
 * steps. The options editor's own `sanitiseMapId` is a different rule for a
 * different purpose (it mirrors what BlueMap derives from a file name, which
 * allows capitals), so it cannot stand in for this one.
 */
export const MAP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export const MAP_ID_MAX_LENGTH = 64;

export function isValidMapId(id: string): boolean {
    return MAP_ID_PATTERN.test(id) && id.length <= MAP_ID_MAX_LENGTH;
}

/** Turns a display name into an id the engine will accept, or `""` when it cannot. */
export function suggestMapId(name: string): string {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^[^a-z0-9]+/, "")
        .replace(/[-_]+$/, "");
    return slug.slice(0, MAP_ID_MAX_LENGTH);
}

/** A dimension's own name, turned into an id fragment - `"The Nether"` becomes `"the-nether"`. */
function dimensionSlug(dimension: WorldDimension): string {
    const slug = suggestMapId(dimension.label);
    return slug === "" ? suggestMapId(dimension.key) : slug;
}

/**
 * The id an extra dimension's own map gets, derived from the primary map's id so the
 * family reads together in a project's map list - `survival`, `survival-the-nether`,
 * `survival-the-end` - and valid under the engine's own rule either way.
 *
 * Exported so the review step can show the exact id a render will use before it runs,
 * rather than a paraphrase that could drift from what `toRenderRequest()` actually builds.
 */
export function extraMapId(baseId: string, dimension: WorldDimension): string {
    const combined = suggestMapId(`${baseId}-${dimensionSlug(dimension)}`);
    return combined === "" ? dimensionSlug(dimension) : combined;
}

/**
 * `candidate`, or the same id with a counting suffix appended, so two dimensions whose
 * labels happen to slugify to the same id - two differently namespaced custom
 * dimensions with near-identical names, say - never silently collide into one map
 * config overwriting another's.
 *
 * Exported so the review step can preview the exact id a render will use, including
 * the de-duplication, rather than a preview that could disagree with what
 * `toRenderRequest()` actually builds whenever two dimensions' ids would otherwise clash.
 */
export function uniqueMapId(candidate: string, used: ReadonlySet<string>): string {
    if (!used.has(candidate)) return candidate;
    for (let suffix = 2; suffix < 1000; suffix++) {
        const attempt = suggestMapId(`${candidate}-${suffix}`);
        if (attempt !== "" && !used.has(attempt)) return attempt;
    }
    // Exhausted only if somebody ticked hundreds of dimensions that all slugify
    // identically, which is not a real world this app will ever be handed.
    return candidate;
}

/** The three dimensions offered when nothing has read the world folder. */
export const FALLBACK_DIMENSIONS: readonly WorldDimension[] = [
    {
        key: "minecraft:overworld",
        dimensionType: "minecraft:overworld",
        label: "Overworld",
        regionDirectory: "region",
        regionFiles: 0,
        preset: "overworld",
        sorting: 0,
        custom: false,
        external: false,
    },
    {
        key: "minecraft:the_nether",
        dimensionType: "minecraft:the_nether",
        label: "The Nether",
        regionDirectory: "DIM-1/region",
        regionFiles: 0,
        preset: "nether",
        sorting: 100,
        custom: false,
        external: false,
    },
    {
        key: "minecraft:the_end",
        dimensionType: "minecraft:the_end",
        label: "The End",
        regionDirectory: "DIM1/region",
        regionFiles: 0,
        preset: "end",
        sorting: 200,
        custom: false,
        external: false,
    },
];

/** One edit the person made on the options step. */
type OptionEdit = { readonly kind: "set"; readonly value: PlainValue } | { readonly kind: "clear" };

/** A reason a step cannot be left, in a form the step renders itself. */
export interface StepProblem {
    /** Translation key. */
    readonly key: string;
    /** English fallback, and the message a build with no locale shows. */
    readonly fallback: string;
    /** Values substituted into the message, by `{name}`. */
    readonly vars?: Readonly<Record<string, string>>;
    /** Exact setting destination when this problem belongs to a rendered field. */
    readonly target?: {
        readonly step: WizardStep;
        readonly fieldPath: string;
    };
}

/**
 * The first blocking issue's real owning field, or no destination for file-wide/unknown
 * errors. Zod may report a nested path such as `render-mask.0.radius`; the editor owns that
 * through its longest matching descriptor field (`render-mask`), never a guessed constant.
 */
export function problemTargetForIssues(issues: readonly ConfigIssue[]): StepProblem["target"] {
    const issue = issues.find((candidate) => candidate.severity === "error");
    if (issue === undefined || issue.path === "") return undefined;

    const owner = mapDescriptor()
        .fields.filter(
            (field) => issue.path === field.path || issue.path.startsWith(`${field.path}.`),
        )
        .sort((left, right) => right.path.length - left.path.length)[0];
    if (owner === undefined) return undefined;
    return { step: stepOf(owner.path), fieldPath: owner.path };
}

/** How the render itself is started, which the review step offers. */
export interface RunOptions {
    /** Re-render everything rather than only what changed. */
    force: boolean;
    /** Re-render the map edges as well as changed chunks. */
    fixEdges: boolean;
    /** Upstream's anonymous usage report. Off unless deliberately turned on. */
    metrics: boolean;
    /** Render threads, or null for the engine's own default. */
    renderThreads: number | null;
}

export interface MapWizard {
    readonly step: Ref<WizardStep>;
    readonly stepIndex: ComputedRef<number>;
    readonly stepCount: number;

    /* world */
    readonly worldPath: Ref<string>;
    readonly inspection: Ref<WorldInspection>;
    readonly inspecting: Ref<boolean>;
    /** Dimensions really present, or the vanilla three when nothing could read the folder. */
    readonly dimensions: ComputedRef<readonly WorldDimension[]>;
    /**
     * Which dimensions besides the one being named and tuned below will also be
     * rendered, each as its own map. Keyed by dimension key; see the ref's own comment
     * in `createMapWizard` for why it starts empty rather than pre-ticked.
     */
    readonly includedExtraDimensions: Ref<ReadonlySet<string>>;
    /** The dimensions {@link includedExtraDimensions} resolves to right now, in request order. */
    readonly extraDimensions: ComputedRef<readonly WorldDimension[]>;

    /* identity */
    readonly displayName: Ref<string>;
    readonly mapId: Ref<string>;
    /** True while the id follows the display name, which stops once it is edited. */
    readonly idFollowsName: Ref<boolean>;
    readonly dimensionKey: Ref<string>;
    readonly dimension: ComputedRef<WorldDimension | null>;
    readonly sorting: Ref<number>;

    /* options */
    readonly file: ComputedRef<EditableConfigFile>;
    readonly changes: ComputedRef<readonly FieldChange[]>;
    /** The subset of `changes` this render will actually apply. */
    readonly reachingChanges: ComputedRef<readonly FieldChange[]>;
    /** The subset carried only by the map config file. */
    readonly carriedChanges: ComputedRef<readonly FieldChange[]>;

    /* storage */
    readonly storageDirectory: Ref<string>;
    readonly storageDefault: Ref<string>;
    /** True when the app told us the folder, rather than it being typed in. */
    readonly storageKnown: Ref<boolean>;

    /* run */
    readonly run: Ref<RunOptions>;

    problemsFor(step: WizardStep): StepProblem[];
    canLeave(step: WizardStep): boolean;
    /** True when every step up to and including `step` is answered. */
    canReach(step: WizardStep): boolean;
    next(): void;
    back(): void;
    goTo(step: WizardStep): void;

    setWorld(path: string, inspection?: WorldInspection): void;
    chooseDimension(key: string): void;
    /** Includes or excludes a batch of extra dimensions in one step. The primary dimension is always skipped. */
    setExtraDimensionsIncluded(keys: readonly string[], included: boolean): void;
    /** Flips inclusion for a batch of extra dimensions at once. The primary dimension is always skipped. */
    invertExtraDimensionInclusion(keys: readonly string[]): void;
    setOption(field: FieldMeta, value: PlainValue): void;
    clearOption(field: FieldMeta): void;
    resetOptions(): void;

    toRenderRequest(): RenderRequest;
    /** The map config exactly as it would be written, for export and for review. */
    configText(): string;
}

export interface MapWizardOptions {
    /** The platform separator, so generated paths read the way the platform writes them. */
    readonly separator?: string;
    readonly storageDirectory?: string;
}

function descriptor(): ConfigFileDescriptor<unknown> {
    return mapDescriptor();
}

function fieldFor(path: string): FieldMeta | undefined {
    return findField(descriptor(), path);
}

export function createMapWizard(options: MapWizardOptions = {}): MapWizard {
    const step = ref<WizardStep>("world");

    const worldPath = ref("");
    const inspection = ref<WorldInspection>(uncheckedWorld(""));
    const inspecting = ref(false);

    const displayName = ref("");
    const mapId = ref("");
    const idFollowsName = ref(true);
    const dimensionKey = ref("minecraft:overworld");
    const sorting = ref(0);

    /**
     * Which other dimensions of this world will also be rendered, besides the one being
     * named and tuned above.
     *
     * Empty until somebody ticks one, deliberately: a world with a Nether and an End
     * still renders one map, the one the identity step is answering, until the person
     * says otherwise. See `dimensionsIn`'s own default in `DimensionSelection.vue` for
     * why the Nether and the End - and anything a mod or datapack added - start unticked
     * rather than ticked: rendering the Nether is not always wanted, and this app has no
     * way to guess the size of a dimension it has never seen.
     *
     * Keyed by dimension key rather than by index, so a set built against one folder
     * reading stays meaningful across a re-read that finds the same dimensions again -
     * and so a key that stops existing (a re-read that lost a dimension) simply stops
     * mattering rather than pointing at the wrong row.
     */
    const includedExtraDimensions = ref<ReadonlySet<string>>(new Set());

    /**
     * The option edits, held shallowly on purpose.
     *
     * `ref()` unwraps its contents recursively at the type level, and `PlainValue`
     * is a recursive union, so a deep ref over a map of them sends the checker
     * past its instantiation depth limit. Nothing here mutates a map in place
     * anyway: every edit replaces the whole map, which is what makes the derived
     * config file recompute.
     */
    const edits = shallowRef(new Map<string, OptionEdit>());

    const storageDirectory = ref(options.storageDirectory ?? "");
    const storageDefault = ref(options.storageDirectory ?? "");
    const storageKnown = ref((options.storageDirectory ?? "") !== "");

    const run = ref<RunOptions>({
        force: false,
        fixEdges: false,
        metrics: false,
        renderThreads: null,
    });

    const dimensions = computed<readonly WorldDimension[]>(() =>
        inspection.value.dimensions.length > 0 ? inspection.value.dimensions : FALLBACK_DIMENSIONS,
    );

    const dimension = computed<WorldDimension | null>(
        () => dimensions.value.find((candidate) => candidate.key === dimensionKey.value) ?? null,
    );

    /**
     * The dimensions that will render as their own extra maps, in the same order the
     * request builds them in. The review step reads this to say plainly what is about to
     * happen, rather than only naming the one map the identity step is answering.
     */
    const extraDimensions = computed<readonly WorldDimension[]>(() =>
        dimensions.value.filter(
            (candidate) =>
                candidate.key !== dimensionKey.value &&
                includedExtraDimensions.value.has(candidate.key),
        ),
    );

    /**
     * Rebuilds the whole file from upstream's template and replays the edits.
     *
     * The template is not a starting point that gets patched: it is regenerated
     * from the current answers every time one of them changes, because the three
     * presets differ in more than the dimension key (sky colour, void colour,
     * ambient light, cave removal), and patching one key would leave a nether map
     * lit like an overworld.
     */
    function build(): EditableConfigFile {
        const chosen =
            dimensions.value.find((candidate) => candidate.key === dimensionKey.value) ??
            FALLBACK_DIMENSIONS.find((candidate) => candidate.key === dimensionKey.value) ??
            null;

        const preset: MapPreset = chosen?.preset ?? "overworld";
        const id = mapId.value.trim() === "" ? "map" : mapId.value.trim();

        const text = renderMapTemplate({
            name: displayName.value.trim() === "" ? id : displayName.value.trim(),
            world: worldPath.value.trim(),
            dimension: dimensionKey.value,
            dimensionType: chosen?.dimensionType ?? dimensionKey.value,
            sorting: sorting.value,
            preset,
            // Always passed, never left to the default. Upstream's template helper
            // defaults this to `node:path`'s separator, and in a renderer that
            // module is a browser stub that throws the moment it is read. Forward
            // slashes are what BlueMap writes into its own configs anyway, and a
            // Windows path keeps working either way because the writer escapes
            // whatever backslashes are left.
            separator: options.separator ?? "/",
        });

        let built = openConfigFile(descriptor(), `maps/${id}.conf`, text);
        for (const [path, edit] of edits.value) {
            const field = fieldFor(path);
            if (field === undefined) continue;
            if (edit.kind === "clear") built = clearFieldValue(built, field);
            else built = setFieldValue(built, field, edit.value);
        }
        return built;
    }

    /**
     * The map config, derived rather than stored.
     *
     * Every answer above feeds it, so there is no way to change one of them and
     * leave the file behind: a display name typed into the identity step is in the
     * text the review step shows, without anything having to remember to rebuild.
     */
    const file = computed<EditableConfigFile>(build);

    const changes = computed<readonly FieldChange[]>(() => changedFields(file.value));
    const reachingChanges = computed(() =>
        changes.value.filter((change) => reachesRender(change.field.path)),
    );
    const carriedChanges = computed(() =>
        changes.value.filter((change) => !reachesRender(change.field.path)),
    );

    /* ---- steps ------------------------------------------------------------ */

    const stepIndex = computed(() => WIZARD_STEPS.indexOf(step.value));

    function worldProblems(): StepProblem[] {
        const problems: StepProblem[] = [];
        const path = worldPath.value.trim();
        if (path === "") {
            problems.push({
                key: "world.wizard.needWorld",
                fallback: "Choose the world folder first.",
            });
            return problems;
        }
        if (!isAbsolutePath(path)) {
            problems.push({
                key: "world.wizard.worldRelative",
                fallback:
                    "That world path is relative, so where it points depends on where the app was started. Use a full path.",
            });
        }
        // A folder nothing could read is allowed through: this build may have no
        // way to look inside one, and refusing every world on a build that cannot
        // check would make the wizard unusable rather than careful. A folder that
        // WAS read and is not a world is refused, because there the answer is known.
        if (!inspection.value.unchecked && !inspection.value.ok) {
            problems.push({
                key: "world.wizard.notAWorld",
                fallback:
                    "That folder is not a Minecraft world. The step above says what is wrong with it.",
            });
        }
        return problems;
    }

    function identityProblems(): StepProblem[] {
        const problems: StepProblem[] = [];
        const id = mapId.value.trim();

        if (id === "") {
            problems.push({
                key: "world.wizard.needId",
                fallback: "Give the map an id. It becomes its folder name and part of its address.",
            });
        } else if (!MAP_ID_PATTERN.test(id)) {
            problems.push({
                key: "world.wizard.badId",
                fallback:
                    "A map id may contain lower-case letters, digits, hyphens and underscores, and has to start with a letter or a digit. {id} does not.",
                vars: { id },
            });
        } else if (id.length > MAP_ID_MAX_LENGTH) {
            problems.push({
                key: "world.wizard.longId",
                fallback: "A map id may be at most {max} characters long.",
                vars: { max: String(MAP_ID_MAX_LENGTH) },
            });
        }

        if (dimensionKey.value.trim() === "") {
            problems.push({
                key: "world.wizard.needDimension",
                fallback: "Choose which dimension of that world to render.",
            });
        }
        return problems;
    }

    function optionProblems(): StepProblem[] {
        if (!hasBlockingIssues(file.value)) return [];
        const target = problemTargetForIssues(file.value.issues);
        return [
            {
                key: "world.wizard.optionsInvalid",
                fallback:
                    "One of the settings holds a value BlueMap would refuse. The setting says which, in red, beside it.",
                ...(target === undefined ? {} : { target }),
            },
        ];
    }

    function storageProblems(): StepProblem[] {
        const problems: StepProblem[] = [];
        const path = storageDirectory.value.trim();
        if (path === "") {
            problems.push({
                key: "world.wizard.needStorage",
                fallback: "Say where the rendered map should be written.",
            });
            return problems;
        }
        // The app's own default arrives already expanded, so anything left with a
        // token in it was typed. Those still resolve, which is why this is the same
        // absolute-path rule the rest of the app uses rather than a stricter one.
        if (!isAbsolutePath(path) && !/^%[^%]+%/.test(path) && !path.startsWith("~")) {
            problems.push({
                key: "world.wizard.storageRelative",
                fallback:
                    "That folder is relative, so the tiles would land wherever the app happened to be started. Use a full path.",
            });
        }
        return problems;
    }

    function problemsFor(target: WizardStep): StepProblem[] {
        switch (target) {
            case "world":
                return worldProblems();
            case "identity":
                return identityProblems();
            case "options":
                return optionProblems();
            case "storage":
                return storageProblems();
            case "review":
                return [];
        }
    }

    function canLeave(target: WizardStep): boolean {
        return problemsFor(target).length === 0;
    }

    function canReach(target: WizardStep): boolean {
        const index = WIZARD_STEPS.indexOf(target);
        for (let earlier = 0; earlier < index; earlier++) {
            const candidate = WIZARD_STEPS[earlier];
            if (candidate !== undefined && !canLeave(candidate)) return false;
        }
        return true;
    }

    function next(): void {
        if (!canLeave(step.value)) return;
        const nextStep = WIZARD_STEPS[stepIndex.value + 1];
        if (nextStep !== undefined) step.value = nextStep;
    }

    function back(): void {
        const previous = WIZARD_STEPS[stepIndex.value - 1];
        if (previous !== undefined) step.value = previous;
    }

    function goTo(target: WizardStep): void {
        if (canReach(target)) step.value = target;
    }

    /* ---- answers ---------------------------------------------------------- */

    function setWorld(path: string, next?: WorldInspection): void {
        worldPath.value = path;
        inspection.value = next ?? uncheckedWorld(path);

        // A world with dimensions on disk decides which one is offered first: the
        // overworld when it exists, otherwise whatever does. Choosing a dimension
        // the world does not have is the second most common way to render nothing.
        const available = inspection.value.dimensions;
        if (
            available.length > 0 &&
            !available.some((candidate) => candidate.key === dimensionKey.value)
        ) {
            const first = available[0];
            if (first !== undefined) applyDimension(first);
        }

        if (idFollowsName.value && displayName.value.trim() === "") {
            const suggested = suggestMapId(folderLeaf(path));
            if (suggested !== "") {
                displayName.value = folderLeaf(path);
                mapId.value = suggested;
            }
        }
    }

    function applyDimension(chosen: WorldDimension): void {
        dimensionKey.value = chosen.key;
        sorting.value = chosen.sorting;
    }

    /** Takes a dimension out of the extra set once it becomes the one being customised. */
    function dropFromExtras(key: string): void {
        if (!includedExtraDimensions.value.has(key)) return;
        const next = new Set(includedExtraDimensions.value);
        next.delete(key);
        includedExtraDimensions.value = next;
    }

    function chooseDimension(key: string): void {
        const chosen =
            dimensions.value.find((candidate) => candidate.key === key) ??
            FALLBACK_DIMENSIONS.find((candidate) => candidate.key === key) ??
            null;
        if (chosen === null) {
            dimensionKey.value = key;
        } else {
            applyDimension(chosen);
        }
        // A dimension cannot be both the map being tuned by hand and one of the extras
        // added alongside it - that would render it twice under two different ids.
        dropFromExtras(dimensionKey.value);
    }

    /**
     * Includes or excludes a batch of dimensions from the extra set in one step - a
     * single row's own checkbox, or a bulk "include shown"/"exclude shown" action.
     *
     * The dimension currently being tuned by hand is silently skipped rather than
     * refused: it is always included, by virtue of being the map the rest of the wizard
     * is building, and a bulk action run over a whole search result should not have to
     * carve it out by hand to avoid a pointless second copy of itself.
     */
    function setExtraDimensionsIncluded(keys: readonly string[], included: boolean): void {
        const next = new Set(includedExtraDimensions.value);
        for (const key of keys) {
            if (key === dimensionKey.value) continue;
            if (included) next.add(key);
            else next.delete(key);
        }
        includedExtraDimensions.value = next;
    }

    /** Flips inclusion for a batch of dimensions at once - the bulk "invert" action. */
    function invertExtraDimensionInclusion(keys: readonly string[]): void {
        const next = new Set(includedExtraDimensions.value);
        for (const key of keys) {
            if (key === dimensionKey.value) continue;
            if (next.has(key)) next.delete(key);
            else next.add(key);
        }
        includedExtraDimensions.value = next;
    }

    function setOption(field: FieldMeta, value: PlainValue): void {
        const next = new Map(edits.value);
        next.set(field.path, { kind: "set", value });
        edits.value = next;
    }

    function clearOption(field: FieldMeta): void {
        const next = new Map(edits.value);
        next.set(field.path, { kind: "clear" });
        edits.value = next;
    }

    function resetOptions(): void {
        edits.value = new Map();
    }

    /* ---- the request ------------------------------------------------------ */

    function readStartPos(): { x: number; z: number } | null {
        const field = fieldFor("start-pos");
        if (field === undefined) return null;
        const value = fieldValue(file.value, field);
        if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
        const record = value as Record<string, unknown>;
        const x = record["x"];
        const z = record["z"];
        if (typeof x !== "number" || typeof z !== "number") return null;
        return { x, z };
    }

    /**
     * The extra dimensions somebody ticked, each built as its own map from BlueMap's own
     * template for its dimension - the same template `build()` above renders the primary
     * map from, with the same sky colour, void colour, ambient light and cave removal
     * that make a nether map look like a nether map. None of the primary map's own
     * option edits are replayed here: those were made against one particular dimension
     * and a setting that suits the overworld does not necessarily suit the Nether, so an
     * extra map starts exactly where the primary one did before anybody touched it, and
     * stays reachable afterwards through the project editor like any other map.
     */
    function extraDimensionMaps(): RenderMapRequest[] {
        const baseId = mapId.value.trim() === "" ? "map" : mapId.value.trim();
        const baseName = displayName.value.trim() === "" ? baseId : displayName.value.trim();
        // Seeded with the primary map's own id, so an extra map can never collide with
        // the map the rest of the wizard is building either.
        const usedIds = new Set<string>([baseId]);

        const maps: RenderMapRequest[] = [];
        for (const candidate of dimensions.value) {
            if (candidate.key === dimensionKey.value) continue;
            if (!includedExtraDimensions.value.has(candidate.key)) continue;

            // A split-server dimension is rendered from its own sibling folder, never
            // from the primary world path - BlueMap resolves DIM-1/DIM1 relative to
            // whatever `world` names, and that sibling is the only folder that has them.
            const world = candidate.worldFolder ?? worldPath.value.trim();
            const id = uniqueMapId(extraMapId(baseId, candidate), usedIds);
            usedIds.add(id);
            const name = `${baseName} - ${candidate.label}`;

            const text = renderMapTemplate({
                name,
                world,
                dimension: candidate.key,
                dimensionType: candidate.dimensionType,
                sorting: candidate.sorting,
                preset: candidate.preset,
                separator: options.separator ?? "/",
            });

            maps.push({
                id,
                world,
                name,
                dimension: candidate.key,
                sorting: candidate.sorting,
                config: text,
            });
        }
        return maps;
    }

    function toRenderRequest(): RenderRequest {
        const id = mapId.value.trim();
        const startPos = readStartPos();

        const map: RenderMapRequest = {
            id,
            world: worldPath.value.trim(),
            name: displayName.value.trim() === "" ? id : displayName.value.trim(),
            dimension: dimensionKey.value,
            sorting: sorting.value,
            ...(startPos === null ? {} : { startPos }),
        };

        const current = run.value;
        return {
            maps: [map, ...extraDimensionMaps()],
            force: current.force,
            fixEdges: current.fixEdges,
            metrics: current.metrics,
            ...(current.renderThreads === null ? {} : { renderThreads: current.renderThreads }),
        };
    }

    function configText(): string {
        return file.value.text;
    }

    return {
        step,
        stepIndex,
        stepCount: WIZARD_STEPS.length,
        worldPath,
        inspection,
        inspecting,
        dimensions,
        includedExtraDimensions,
        extraDimensions,
        displayName,
        mapId,
        idFollowsName,
        dimensionKey,
        dimension,
        sorting,
        file,
        changes,
        reachingChanges,
        carriedChanges,
        storageDirectory,
        storageDefault,
        storageKnown,
        run,
        problemsFor,
        canLeave,
        canReach,
        next,
        back,
        goTo,
        setWorld,
        chooseDimension,
        setExtraDimensionsIncluded,
        invertExtraDimensionInclusion,
        setOption,
        clearOption,
        resetOptions,
        toRenderRequest,
        configText,
    };
}

/** The last segment of a path, which is what a world folder is usually named after. */
export function folderLeaf(path: string): string {
    const trimmed = path.trim().replace(/[\\/]+$/, "");
    const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return cut < 0 ? trimmed : trimmed.slice(cut + 1);
}

/**
 * Fills `{name}` placeholders in a step problem, for a translator that does not
 * interpolate them itself.
 *
 * vue-i18n does, given {@link StepProblem.vars} as its second argument, which is
 * how the wizard renders these: by the time a translated string comes back,
 * vue-i18n has compiled the message and consumed `{id}` as a named parameter of
 * its own, so there is nothing left here to fill. This stays for a surface whose
 * translator is a plain lookup.
 */
export function fillProblem(problem: StepProblem, text: string): string {
    let filled = text;
    for (const [name, value] of Object.entries(problem.vars ?? {})) {
        filled = filled.split(`{${name}}`).join(value);
    }
    return filled;
}

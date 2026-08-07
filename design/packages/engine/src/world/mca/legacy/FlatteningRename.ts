import { Key } from "@worldlens/shared";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import { BlockState } from "../../BlockState.js";

/**
 * Port-only infrastructure with no upstream analog (upstream v0.10.3-mc1.12 never renders
 * against a modern resource pack at all — see LegacyResourcePackExtension.ts's doc comment).
 *
 * {@link BlockIdConfig} (BlockIdMapper.ts) and {@link Chunk_1_12} correctly hand back the
 * *pre-flattening* block name a numeric id and metadata nibble mean — `minecraft:grass` for
 * the grass block, `minecraft:snow` for the full snow block, and so on. Nothing downstream of
 * that translates those names into their modern (post-1.13 flattening) equivalents before a
 * resource pack is asked for a model. Three ways that goes wrong, all documented in
 * `design/HANDOFF.md`'s "Where it stops being right" section:
 *
 *  - a name the flattening **removed** resolves to no blockstate at all (`snow_layer`);
 *  - a name the flattening **reused for a different block** resolves to that different
 *    block, confidently and wrongly (`grass` now means the modern grass tuft, `snow` now
 *    means the thin snow layer — the two swapped meaning across the flattening);
 *  - a name that **survived but gained a property** modern packs key their variants on
 *    matches no variant at all (`podzol` gained `snowy`, `repeater` gained `locked`,
 *    `daylight_detector` gained `inverted`, ...).
 *
 * This module is that translation, applied to a {@link BlockState} that came from a
 * pre-flattening ({@link Chunk_1_12} / `DataVersion` < 1451) chunk, strictly *after* the
 * legacy block-state extensions have already run (so `SnowyExtension`'s derived `snowy` on
 * `grass`/`mycelium`, `WoodenFenceConnectExtension`'s derived connections on `fence`, and
 * every other extension-added property survive the rename untouched) and strictly *before*
 * the resource pack is consulted for a model. It never touches what {@link Chunk_1_12},
 * {@code MCAWorld#getExtendedBlockState} or the legacy block-state extensions themselves
 * hand back — those keep returning the exact pre-flattening name, which is correct and is
 * what `legacy-worldgen.test.ts` pins block by block. Only the render-time resource lookup
 * (`BlockStateModelRenderer`) sees the renamed state.
 *
 * Every entry below was derived from, and is verified against, the real modern (26.2)
 * resource pack plus `resourceExtensions.zip` — not guessed. Where a legacy state's meaning
 * genuinely depends on world neighbors that only a {@link BlockStateExtension} can resolve
 * (stair shape, fence/wall/pane/tripwire connections, door upper-half facing, double-plant
 * upper-half type, double-chest facing agreement, redstone-wire connections, fire
 * connections), this module does not attempt it — that machinery already exists
 * (`extensions/`) and is unaffected by renaming, since a rename only ever changes the *name*
 * and passes every existing property through untouched unless a rule says otherwise.
 *
 * <p><b>This table bridges a LEGACY world to a MODERN pack — nothing else.</b> Both call
 * sites ({@code BlockStateModelRenderer#renderModel}, {@code ExtendedBlock#getProperties})
 * gate on {@link isLegacyResourcePack} in addition to the world chunk's own era, because a
 * pre-flattening ("era-matched", e.g. real 1.12.2) resource pack, loaded through
 * {@code LegacyResourcePackExtension}, already resolves every one of these pre-flattening
 * names correctly on its own — that is the whole point of that extension. Renaming
 * `minecraft:grass` to `minecraft:grass_block` before consulting a pack that has never heard
 * of `grass_block` (it did not exist before the 1.13 flattening) does not degrade gracefully:
 * `ResourcePack#getBlockState` returns `null`, and both call sites silently skip the block
 * rather than draw it — worse than the gap this table exists to close. See
 * `resourcepack-e2e.test.ts`'s Proof 4 for the surgical proof of that failure mode and
 * `tools/oracle/render-1-12-era-matched.mjs` for the render-level corroboration (issue #46).
 */

/** the result of a rename: the modern id plus the modern property map */
interface Flattened {
    readonly key: Key;
    readonly properties: ReadonlyMap<string, string>;
}

/**
 * A rename rule. Returning `null` means "this specific property combination does not need
 * (or does not have a known) rename" — used by the wood-log rule, which only fires for the
 * pre-flattening "bark on every side" state (`axis=none`) and leaves the three real
 * `axis=x/y/z` logs, which already resolve correctly, untouched.
 */
type Rule = (properties: ReadonlyMap<string, string>) => Flattened | null;

/** keeps every existing property and applies `mutate` on top of a copy */
function withProperties(id: string, mutate: (properties: Map<string, string>) => void): Rule {
    const key = Key.parse(id);
    return (properties) => {
        const copy = new Map(properties);
        mutate(copy);
        return { key, properties: copy };
    };
}

/** a plain rename: same properties, new name */
function renamed(id: string): Rule {
    return withProperties(id, () => {});
}

/** renames and injects a property the legacy state never carried, if not already present */
function withDefault(id: string, property: string, value: string): Rule {
    return withProperties(id, (p) => {
        if (!p.has(property)) p.set(property, value);
    });
}

/** the modern "double" slab state: drops every legacy property (`seamless`/`variant`) */
function doubleSlab(id: string): Rule {
    const key = Key.parse(id);
    return () => ({ key, properties: new Map([["type", "double"]]) });
}

/** the modern single-height slab: `half=bottom/top` (legacy) -> `type=bottom/top` (modern) */
function singleSlab(id: string): Rule {
    return withProperties(id, (p) => {
        const half = p.get("half");
        p.clear();
        if (half !== undefined) p.set("type", half);
    });
}

/**
 * The pre-flattening "bark on every side" log state (numeral meta 12-15, encoded as
 * `axis=none`) became a dedicated `*_wood` block. That block's modern blockstate still keys
 * on `axis` (the bark-everywhere texture is identical regardless, but the model still varies
 * by orientation), which a legacy world never distinguished for this state — `y` is the
 * neutral default, matching a log's usual standing orientation. The three real orientations
 * (`axis=x/y/z`) already resolve as `<species>_log` without any rename.
 */
function woodBarkLog(id: string): Rule {
    const key = Key.parse(id);
    return (properties) => {
        if (properties.get("axis") !== "none") return null;
        return { key, properties: new Map([["axis", "y"]]) };
    };
}

/**
 * `unlit_redstone_torch`/`redstone_torch` (upstream: two separate pre-flattening block ids,
 * on and off) both carry a `facing` that is `up` for the floor-standing torch and a cardinal
 * direction for the wall-mounted one. The modern pack split those into two blocks:
 * `redstone_torch[lit]` (no `facing`) and `redstone_wall_torch[facing,lit]`.
 */
function redstoneTorchSplit(lit: boolean): Rule {
    return (properties) => {
        const facing = properties.get("facing");
        if (facing === "up" || facing === undefined) {
            return { key: Key.minecraft("redstone_torch"), properties: new Map([["lit", String(lit)]]) };
        }
        return {
            key: Key.minecraft("redstone_wall_torch"),
            properties: new Map([
                ["facing", facing],
                ["lit", String(lit)],
            ]),
        };
    };
}

/**
 * `_stained_hardened_clay` (upstream: every dye color) -> `_terracotta` (modern). "silver"
 * (upstream: the pre-flattening name for this color) became "light_gray" at the flattening,
 * same as every other silver_* rename in this table — every other color kept its name.
 */
function terracotta(color: string): [string, Rule] {
    const target = color === "silver" ? "light_gray" : color;
    return [`minecraft:${color}_stained_hardened_clay`, renamed(`minecraft:${target}_terracotta`)];
}

/** the sixteen dye colors, in the legacy metadata order (matches DyeColor's ordinal) */
const DYE_COLORS = [
    "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
    "silver", "cyan", "purple", "blue", "brown", "green", "red", "black",
];

/** every single-height slab family: legacy meta already keys `half`, only the key renames */
const SLAB_FAMILIES = [
    "oak", "spruce", "birch", "jungle", "acacia", "dark_oak",
    "stone", "sandstone", "cobblestone", "brick", "stone_brick",
    "nether_brick", "quartz", "red_sandstone", "purpur",
];

const RULES = new Map<string, Rule>([
    // --- names the flattening simply renamed, properties unaffected -----------------------
    ["minecraft:brick_block", renamed("minecraft:bricks")],
    ["minecraft:end_bricks", renamed("minecraft:end_stone_bricks")],
    ["minecraft:fence", renamed("minecraft:oak_fence")],
    ["minecraft:hardened_clay", renamed("minecraft:terracotta")],
    ["minecraft:houstonia", renamed("minecraft:azure_bluet")],
    ["minecraft:magma", renamed("minecraft:magma_block")],
    ["minecraft:melon_block", renamed("minecraft:melon")],
    ["minecraft:mob_spawner", renamed("minecraft:spawner")],
    ["minecraft:noteblock", renamed("minecraft:note_block")],
    ["minecraft:portal", renamed("minecraft:nether_portal")],
    ["minecraft:quartz_column", renamed("minecraft:quartz_pillar")],
    ["minecraft:quartz_ore", renamed("minecraft:nether_quartz_ore")],
    ["minecraft:red_nether_brick", renamed("minecraft:red_nether_bricks")],
    ["minecraft:reeds", renamed("minecraft:sugar_cane")],
    ["minecraft:slime", renamed("minecraft:slime_block")],
    ["minecraft:smooth_andesite", renamed("minecraft:polished_andesite")],
    ["minecraft:smooth_diorite", renamed("minecraft:polished_diorite")],
    ["minecraft:smooth_granite", renamed("minecraft:polished_granite")],
    ["minecraft:trapdoor", renamed("minecraft:oak_trapdoor")],
    ["minecraft:waterlily", renamed("minecraft:lily_pad")],
    ["minecraft:web", renamed("minecraft:cobweb")],
    // NOT "wooden_button" -> "oak_button": the modern button gained a `face` property
    // (floor/wall/ceiling) that a legacy button's `facing` (a single 6-direction enum) does
    // not cleanly decompose into without guessing, so it is left exactly as broken as before
    ["minecraft:wooden_door", renamed("minecraft:oak_door")],
    ["minecraft:wooden_pressure_plate", renamed("minecraft:oak_pressure_plate")],
    ["minecraft:golden_rail", renamed("minecraft:powered_rail")],

    // stone-brick and its silverfish-infested twin (upstream: monster_egg vs. stonebrick)
    ["minecraft:stonebrick", renamed("minecraft:stone_bricks")],
    ["minecraft:mossy_stonebrick", renamed("minecraft:mossy_stone_bricks")],
    ["minecraft:cracked_stonebrick", renamed("minecraft:cracked_stone_bricks")],
    ["minecraft:chiseled_stonebrick", renamed("minecraft:chiseled_stone_bricks")],
    ["minecraft:stone_monster_egg", renamed("minecraft:infested_stone")],
    ["minecraft:cobblestone_monster_egg", renamed("minecraft:infested_cobblestone")],
    ["minecraft:stone_brick_monster_egg", renamed("minecraft:infested_stone_bricks")],
    ["minecraft:mossy_brick_monster_egg", renamed("minecraft:infested_mossy_stone_bricks")],
    ["minecraft:cracked_brick_monster_egg", renamed("minecraft:infested_cracked_stone_bricks")],
    ["minecraft:chiseled_brick_monster_egg", renamed("minecraft:infested_chiseled_stone_bricks")],

    // "silver" (upstream: the pre-flattening dye color) -> "light_gray" (modern)
    ["minecraft:silver_carpet", renamed("minecraft:light_gray_carpet")],
    ["minecraft:silver_concrete", renamed("minecraft:light_gray_concrete")],
    ["minecraft:silver_concrete_powder", renamed("minecraft:light_gray_concrete_powder")],
    ["minecraft:silver_glazed_terracotta", renamed("minecraft:light_gray_glazed_terracotta")],
    ["minecraft:silver_stained_glass", renamed("minecraft:light_gray_stained_glass")],
    ["minecraft:silver_stained_glass_pane", renamed("minecraft:light_gray_stained_glass_pane")],
    ["minecraft:silver_wool", renamed("minecraft:light_gray_wool")],

    // --- names that swapped meaning across the flattening (the four observed gaps) --------
    ["minecraft:grass", renamed("minecraft:grass_block")],
    ["minecraft:snow", renamed("minecraft:snow_block")],
    ["minecraft:snow_layer", renamed("minecraft:snow")], // `layers` is already given, kept as-is
    // this project's own legacy naming (BlockIdMapper.ts / blockIds.json) picked distinct
    // synthetic names for the two "grass tuft" states pre-flattening conflated at "tall_grass"
    // (single, id 31 meta 1) and "double_grass" (double, id 175 meta 2/3) specifically to keep
    // them apart; the *real* Minecraft flattening renamed them the other way around
    ["minecraft:tall_grass", renamed("minecraft:short_grass")],
    ["minecraft:double_grass", renamed("minecraft:tall_grass")], // `half` matches, kept as-is
    ["minecraft:double_fern", renamed("minecraft:large_fern")],
    ["minecraft:double_rose", renamed("minecraft:rose_bush")],
    ["minecraft:paeonia", renamed("minecraft:peony")],
    ["minecraft:syringa", renamed("minecraft:lilac")],

    // --- names that survived but gained a property a legacy world never modeled -----------
    // (podzol is the documented case; the rest are the same shape: pick the neutral default
    // a pre-flattening world implies, since none of these states ever carried that concept)
    ["minecraft:podzol", withDefault("minecraft:podzol", "snowy", "false")],
    // the modern blockstate does not vary by `power` at all, only by `inverted` — dropped
    // for both ids, since keeping a `power` the target blockstate never conditions on would
    // be harmless but misleading about what the model actually depends on
    ["minecraft:daylight_detector", withProperties("minecraft:daylight_detector", (p) => {
        p.delete("power");
        if (!p.has("inverted")) p.set("inverted", "false");
    })],
    ["minecraft:daylight_detector_inverted", withProperties("minecraft:daylight_detector", (p) => {
        p.delete("power");
        p.set("inverted", "true");
    })],

    // "powered"/"unpowered" (upstream: two separate pre-flattening block ids) both already
    // carry the modern `mode`/`facing`/`powered` properties within their own metadata
    ["minecraft:powered_comparator", renamed("minecraft:comparator")],
    ["minecraft:unpowered_comparator", renamed("minecraft:comparator")],
    // repeaters only carry `facing`/`delay`; `powered` is which of the two ids this is, and
    // `locked` (a repeater held by another repeater pointing at it) did not exist pre-1.13
    ["minecraft:powered_repeater", withProperties("minecraft:repeater", (p) => {
        p.set("powered", "true");
        p.set("locked", "false");
    })],
    ["minecraft:unpowered_repeater", withProperties("minecraft:repeater", (p) => {
        p.set("powered", "false");
        p.set("locked", "false");
    })],
    // furnace/redstone_lamp (upstream: lit and unlit were separate ids; `facing` on furnace
    // is already given and kept)
    ["minecraft:furnace", withDefault("minecraft:furnace", "lit", "false")],
    ["minecraft:lit_furnace", withProperties("minecraft:furnace", (p) => p.set("lit", "true"))],
    ["minecraft:redstone_lamp", withDefault("minecraft:redstone_lamp", "lit", "false")],
    ["minecraft:lit_redstone_lamp", withProperties("minecraft:redstone_lamp", (p) => p.set("lit", "true"))],
    // redstone_ore's lit/unlit glow does not change the model at all (one unconditional
    // variant in a modern pack), so the "lit" id is a plain rename with no property left
    ["minecraft:lit_redstone_ore", renamed("minecraft:redstone_ore")],

    // fence gates gained `in_wall` (whether the post sits flush against a wall), a mechanic
    // that did not exist pre-flattening; a legacy world never modeled it, so `false` always
    ["minecraft:fence_gate", withDefault("minecraft:oak_fence_gate", "in_wall", "false")],
    ["minecraft:acacia_fence_gate", withDefault("minecraft:acacia_fence_gate", "in_wall", "false")],
    ["minecraft:birch_fence_gate", withDefault("minecraft:birch_fence_gate", "in_wall", "false")],
    ["minecraft:dark_oak_fence_gate", withDefault("minecraft:dark_oak_fence_gate", "in_wall", "false")],
    ["minecraft:jungle_fence_gate", withDefault("minecraft:jungle_fence_gate", "in_wall", "false")],
    ["minecraft:spruce_fence_gate", withDefault("minecraft:spruce_fence_gate", "in_wall", "false")],

    // --- redstone torches: two legacy ids, split by facing into two modern blocks ----------
    ["minecraft:unlit_redstone_torch", redstoneTorchSplit(false)],
    ["minecraft:redstone_torch", redstoneTorchSplit(true)],

    // --- the "bark on every side" log states -----------------------------------------------
    ["minecraft:oak_log", woodBarkLog("minecraft:oak_wood")],
    ["minecraft:spruce_log", woodBarkLog("minecraft:spruce_wood")],
    ["minecraft:birch_log", woodBarkLog("minecraft:birch_wood")],
    ["minecraft:jungle_log", woodBarkLog("minecraft:jungle_wood")],
    ["minecraft:acacia_log", woodBarkLog("minecraft:acacia_wood")],
    ["minecraft:dark_oak_log", woodBarkLog("minecraft:dark_oak_wood")],
]);

// every dye color's stained-hardened-clay -> terracotta rename
for (const color of DYE_COLORS) {
    const [id, rule] = terracotta(color);
    RULES.set(id, rule);
}

// every single-height slab family: `half` (legacy) -> `type` (modern), same value
for (const family of SLAB_FAMILIES) {
    RULES.set(`minecraft:${family}_slab`, singleSlab(`minecraft:${family}_slab`));
}
// every double slab: legacy id 43 (stone-category) and 125 (the four pre-1.8 wood species)
RULES.set("minecraft:oak_double_slab", doubleSlab("minecraft:oak_slab"));
RULES.set("minecraft:spruce_double_slab", doubleSlab("minecraft:spruce_slab"));
RULES.set("minecraft:birch_double_slab", doubleSlab("minecraft:birch_slab"));
RULES.set("minecraft:jungle_double_slab", doubleSlab("minecraft:jungle_slab"));
RULES.set("minecraft:acacia_double_slab", doubleSlab("minecraft:acacia_slab"));
RULES.set("minecraft:dark_oak_double_slab", doubleSlab("minecraft:dark_oak_slab"));
RULES.set("minecraft:wood_old_double_slab", doubleSlab("minecraft:oak_slab"));
RULES.set("minecraft:stone_double_slab", doubleSlab("minecraft:stone_slab"));
RULES.set("minecraft:sandstone_double_slab", doubleSlab("minecraft:sandstone_slab"));
RULES.set("minecraft:cobblestone_double_slab", doubleSlab("minecraft:cobblestone_slab"));
RULES.set("minecraft:brick_double_slab", doubleSlab("minecraft:brick_slab"));
RULES.set("minecraft:stone_brick_double_slab", doubleSlab("minecraft:stone_brick_slab"));
RULES.set("minecraft:nether_brick_double_slab", doubleSlab("minecraft:nether_brick_slab"));
RULES.set("minecraft:quartz_double_slab", doubleSlab("minecraft:quartz_slab"));
RULES.set("minecraft:red_sandstone_double_slab", doubleSlab("minecraft:red_sandstone_slab"));
RULES.set("minecraft:purpur_double_slab", doubleSlab("minecraft:purpur_slab"));
// "wood_old_slab" (upstream: id 44 meta 2, the pre-1.8 stone-slab-mechanics wood slab, before
// oak/spruce/birch/jungle got their own slab id at 126) -> the closest modern equivalent
RULES.set("minecraft:wood_old_slab", singleSlab("minecraft:oak_slab"));

/**
 * Whether `pack` is itself a pre-flattening (era-matched, e.g. real 1.12.2)
 * resource-pack — i.e. whether {@link flattenLegacyBlockState}'s renames must NOT be applied
 * before consulting it, because it already understands the pre-flattening names on its own.
 *
 * Delegates to {@link ResourcePack#isLegacy}, which is in turn backed by
 * {@link LegacyResourcePackExtension#isLegacy} — the exact same era-detection
 * `resourcepack-e2e.test.ts`'s Proof 4 exercises (`pack.mcmeta`'s `pack_format`, read by
 * `LegacyPackFormat.isLegacyPackRoot` for every root the pack loaded — see that extension's
 * doc comment for why a missing/malformed `pack.mcmeta` reads as modern by design).
 *
 * This is a thin wrapper rather than a direct `pack.getExtension(LEGACY_RESOURCES_EXTENSION)`
 * lookup deliberately: `LegacyResourcePackExtension.ts` imports `ResourcePack` (a value, for
 * its self-registration on `ResourcePack.Extension.REGISTRY`), and this module is reachable
 * from `ResourcePack.ts`'s own `BlockColorsConfig` -> ... -> `ExtendedBlock.ts` import chain
 * — importing `LEGACY_RESOURCES_EXTENSION` here would close that into a require-cycle where
 * `LegacyResourcePackExtension.ts`'s self-registration runs before `ResourcePack.ts` has
 * finished defining the class it registers against (`TypeError: Cannot read properties of
 * undefined (reading 'Extension')` — hit and reverted locally while fixing issue #46,
 * before this file ever reached a commit). `ResourcePack#isLegacy` answers the same
 * question generically, through the already-imported `ResourcePackExtension` invoker
 * object, with no such edge.
 */
export function isLegacyResourcePack(pack: ResourcePack): boolean {
    return pack.isLegacy();
}

/**
 * Translates a pre-flattening {@link BlockState} into its modern (post-1.13) equivalent for
 * resource-pack resolution, or returns it unchanged if no rule applies.
 *
 * Callers MUST only invoke this for a block-state that came from a pre-flattening chunk
 * ({@link Chunk_1_12} / `DataVersion` < 1451, after the legacy block-state extensions have
 * already run) — never for a modern chunk's block-state, since a real 1.13-1.20.2 world can
 * legitimately use some of these exact names for a different, already-correct block (a
 * `minecraft:grass` block-state from a real 1.13-1.20.2 chunk means the grass tuft, which the
 * modern resource pack already resolves correctly; renaming it here would draw it as
 * `grass_block` instead) — AND only when {@link isLegacyResourcePack} of the resolving pack
 * is `false` (see this module's doc comment: renaming a name an era-matched pack already
 * resolves correctly turns a working lookup into a `null` one).
 */
export function flattenLegacyBlockState(state: BlockState): BlockState {
    const rule = RULES.get(state.getId().getFormatted());
    if (rule === undefined) return state;

    const flattened = rule(state.getProperties());
    if (flattened === null) return state;

    return new BlockState(flattened.key, flattened.properties);
}

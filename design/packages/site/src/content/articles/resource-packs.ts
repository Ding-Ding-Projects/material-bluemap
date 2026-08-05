import type { Article } from "../types.js";
import { repoFile, ROADMAP_URL } from "../links.js";

export const resourcePacks: Article = {
    id: "resource-packs",
    title: "The resource-pack pipeline",
    summary:
        "Reading directories and zips as one virtual file system, stacking packs as overlays, and resolving a block state through models to the textures that draw it.",
    category: "engine",
    status: "shipped",
    statusNote:
        "All three phase exit criteria have run (issue #31, closed). textures.json matched the upstream Java output byte for byte in semantic terms for vanilla 1.21 (1723 of 1723 gallery entries) and for a modded pack (1725 of 1725, including a vanilla-texture override), with every one of the modded pack's texture keys additionally checked pixel by pixel on both engines. The live end-to-end resolution of minecraft:grass_block, from a real downloaded 1.21 client jar through block state, variant, model, parent chain and texture, ran and matched. A real 1.12.2 client jar ran through the legacy compatibility path, and that run surfaced a genuine defect - the flattening rename firing on the world's era with no regard for the pack's own era, silently dropping grass-family blocks under an era-matched pack - filed and fixed as issue #46 with real before/after numbers.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "A block state such as ",
                        { code: "minecraft:oak_fence[north=true,west=true]" },
                        " says nothing about how the block looks. Turning it into geometry means walking a chain: ",
                        "the block state file picks a variant, the variant names a model, the model inherits from a ",
                        "parent chain, and the leaves of that chain name textures. That chain lives in resource ",
                        "packs, and this layer reads them.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "Virtual file system." },
                            " A pack is a directory or a zip. Both are read through one interface, so nothing ",
                            "downstream cares which it got.",
                        ],
                        [
                            { strong: "Pack mounting." },
                            " Packs mount in five steps and stack as overlays applied in reverse order, so a pack ",
                            "later in the list wins. Both eras of ",
                            { code: "pack.mcmeta" },
                            " are understood, including the newer overlay declarations.",
                        ],
                        [
                            { strong: "Data classes." },
                            " Block states, multipart conditions, variants, models, elements, faces, rotations, ",
                            "texture variables and entity states are parsed into typed objects through a JSON ",
                            "adapter layer ported from the upstream Gson configuration.",
                        ],
                        [
                            { strong: "Atlases." },
                            " Seven source types build the texture atlas, including directory and single sources, ",
                            "paletted permutations, and unstitching a region out of a larger image. The pixel work ",
                            "runs on decoded PNGs.",
                        ],
                        [
                            { strong: "Texture gallery." },
                            " The resolved textures are collected and written as ",
                            { code: "textures.json" },
                            ", which is the file the webapp loads to draw anything at all.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Weighted variants matter more than they look. When a block state offers several models with ",
                        "weights, Minecraft picks one from a generator seeded by the block's coordinates, so the ",
                        "same block always draws the same way. That generator is ported exactly, because Phase D's ",
                        "mesh parity depends on picking the same variant upstream would.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Packs from 1.12 need a separate path. They predate the atlas system and predate the ",
                        "flattening that renamed almost every block, so there is a legacy compatibility layer with ",
                        "its own name mapping, its own pack-format detection and its own pre-atlas discovery.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Pack list",
                            description:
                                "An ordered list of directories or zip files. Order is significant: later packs override earlier ones, matching Minecraft's own behaviour.",
                        },
                        {
                            term: "Minecraft version",
                            description:
                                "Which client jar the vanilla assets come from. The version manifest is fetched from Mojang, and the chosen version's client jar is downloaded and verified.",
                        },
                        {
                            term: "Accept download",
                            description:
                                "The consent gate for that download. It has no default value: nothing downloads until it is explicitly set, so a fresh install never contacts Mojang on its own.",
                        },
                        {
                            term: "Texture filter",
                            description:
                                "Which resolved textures reach the gallery. The orchestrator applies it during its own resolution phases rather than afterwards, so filtered textures never enter the atlas.",
                        },
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "No options GUI yet",
                    content: [
                        "These are constructor arguments today. Editing them in the app is Phase F, which is where ",
                        "every BlueMap setting gets a control. See the ",
                        { link: "roadmap", href: ROADMAP_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "A required resource is missing",
                            description:
                                "A dedicated error carries what was looked for and where. This is a common state, not an exceptional one: modded and cut-down packs are missing things all the time.",
                        },
                        {
                            term: "A model's parent chain is broken or circular",
                            description:
                                "Resolution stops rather than recursing. The block falls back the way upstream falls back, so a broken pack produces missing geometry, not a hung render.",
                        },
                        {
                            term: "The client jar download fails or its hash does not match",
                            description:
                                "The download is rejected and the partial file is not promoted to a usable jar. The SHA-1 is computed while streaming, so a truncated or substituted download is caught before anything reads it.",
                        },
                        {
                            term: "A zip is malformed",
                            description:
                                "The pack fails to mount and is reported by name. One broken pack does not silently disappear from the stack.",
                        },
                        {
                            term: "An atlas source names an image that does not decode",
                            description:
                                "That source fails. Because the atlas is built from several sources, the failure is attributed to the one that caused it.",
                        },
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Minecraft assets are never redistributed. The client jar is downloaded from Mojang at runtime, only after explicit consent, and nothing extracted from it is committed to this repository.",
                        "The consent flag has no default. A gate that defaults to yes is not a gate, so this one has to be set before any request is made.",
                        "The client jar's SHA-1 is verified against the version manifest, computed while the bytes stream in rather than after writing a whole file that might already be wrong.",
                        "Zip entries are a path-traversal surface. Entry paths are treated as pack-relative resource paths and are never used to write outside the pack's own tree.",
                        "PNG decoding happens in process on untrusted images from third-party packs. It uses a maintained decoder rather than hand-rolled parsing, but it is the largest untrusted-input surface in this layer.",
                        "Pack metadata is parsed as data. Nothing in a pack is executed or evaluated.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Every ported file in this layer has colocated unit tests - 101 files, 1476 passing, across ",
                        "the whole engine package - and beyond that, all three of the phase's own exit criteria have ",
                        "now genuinely run rather than only been asserted about.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            "The generated ",
                            { code: "textures.json" },
                            " was compared for semantic equality against the file upstream's Java produces, for ",
                            "vanilla 1.21 (1723 of 1723 gallery entries matched) and for a modded pack (1725 of 1725, ",
                            "with every one of the pack's texture keys additionally verified pixel by pixel on both ",
                            "engines).",
                        ],
                        [
                            "A real 1.12.2 client jar was loaded through the legacy compatibility path end to end. ",
                            "That run surfaced a real defect, filed and fixed as issue #46: the flattening rename fired ",
                            "on the world's era alone with no regard for the resource pack's own era, silently ",
                            "dropping every grass-family block under an era-matched 1.12.2 pack. Grass-family vertex ",
                            "count went from 0 to 91,944 and the dirt fraction from 43.6% to a 4.3%-control-matching ",
                            "10.2% once fixed, with the render suite's byte-identical comparison gate unaffected.",
                        ],
                        [
                            "The live check ran: the 1.21 client jar was downloaded with the consent flag set, and ",
                            { code: "minecraft:grass_block" },
                            " was resolved from block state to variant to model to parent chain to texture.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "One disclosed scope note, not an unproven criterion",
                    content: [
                        "The modded half of the textures.json check used a rigorously built synthetic pack rather ",
                        "than a real third-party mod, because no legitimate real modded pack is reachable under this ",
                        "project's Mojang-only network policy. The closing issue comment judges this against the ",
                        "exit criterion's own literal text, which asked for one modded pack rather than a real ",
                        "download, and records that a real pack remains a stronger, still-available proof if one is ",
                        "ever legitimately reachable.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "world-reading",
            reason: "Where the block states this layer resolves come from. Read it first if you have not.",
        },
        {
            articleId: "release-pipeline",
            reason: "How an unverified phase still ships behind a green test suite, and what the release notes claim.",
        },
        {
            articleId: "screenshot-gallery",
            reason: "The capture harness, which is the evidence route for anything with a visible surface.",
        },
    ],

    sources: [
        { label: "packages/engine/src/resources", href: repoFile("design/packages/engine/src/resources") },
        {
            label: "packages/engine/src/resources/pack/resourcepack/ResourcePack.ts",
            href: repoFile("design/packages/engine/src/resources/pack/resourcepack/ResourcePack.ts"),
        },
        { label: "design/ROADMAP.md", href: ROADMAP_URL },
    ],
};

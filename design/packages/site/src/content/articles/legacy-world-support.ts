import type { Article } from "../types.js";
import { LEGACY_WORLDS_DOC_URL, repoFile } from "../links.js";

export const legacyWorldSupport: Article = {
    id: "legacy-world-support",
    title: "1.12.2 worlds, written from a seed and rendered",
    summary:
        "The generator can write pre-flattening worlds, numeric block ids and metadata nibbles and all, so a 1.12.2 world can be produced from a seed, read back through this project's own reader, and rendered against a control of the same terrain.",
    category: "engine",
    status: "shipped",
    statusNote:
        "The legacy writer is on the default branch and 13 tests read a generated world back through this project's own reader in CI. The render half is a script rather than a test because it needs a client jar and two full renders, and there is no Java oracle for this era at all, so what it proves is a control comparison rather than byte equality, and it says so.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "DataVersion 1343 is Minecraft 1.12.2, the last release before the flattening replaced ",
                        "numeric block ids with namespaced block-states. This project's reader has always ",
                        "dispatched on that threshold, and 1343 is both the newest legacy world and the only value ",
                        "that proves the legacy branch was taken rather than the modern one. What is new is that ",
                        "the generator can write that format, so the reader can be fed a world nobody had to find.",
                    ],
                },
                {
                    kind: "table",
                    caption: "What a pre-flattening section is made of",
                    columns: ["Tag", "Type", "What it holds"],
                    rows: [
                        [{ code: "Blocks" }, { code: "byte[4096]" }, "The low 8 bits of each block's numeric id"],
                        [
                            { code: "Add" },
                            { code: "byte[2048]" },
                            "An optional nibble array holding bits 8 to 11, so ids above 255 can be expressed",
                        ],
                        [{ code: "Data" }, { code: "byte[2048]" }, "A nibble array of 4-bit metadata"],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Nibble arrays pack two values per byte, low nibble first, which is the layout the legacy ",
                        "chunk reader reads back. Getting the halves the wrong way round produces a world that ",
                        "decodes to a checkerboard of two different blocks, plausible enough at a glance to be ",
                        "missed. Biomes are a flat array of one id per column rather than a per-section palette, ",
                        "and the heightmap is a plain integer array rather than a bit-packed long array.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "Ids and metadata are both load bearing." },
                            " 1.12.2 had 256 usable ids and four bits of metadata to distinguish everything within ",
                            "one: every stone variant, every wood species, every leaf type. Two spellings of the ",
                            "same id are not the same block, and getting the metadata wrong is the easiest ",
                            "possible way to write a world that decodes into confident nonsense.",
                        ],
                        [
                            { strong: "A substitution is counted, never silent." },
                            " Where 1.12.2 has no block corresponding to a modern one, an era-appropriate stand-in ",
                            "is written and the count appears in the run's JSON summary and again on the error ",
                            "stream, because a legacy world quietly losing a block is exactly the failure this ",
                            "format exists to rule out and nobody reads the summary of a run that looked fine.",
                        ],
                        [
                            { strong: "No block moves." },
                            " A 1.12.2 world is 256 blocks tall from y=0 and the generator's box is 384 from ",
                            "y=-64, but the terrain already lives inside 0 to 255, so the same generated chunk is ",
                            "written at the same coordinates in either format. Two things change at the bottom: ",
                            "the all-rock sections below zero are dropped because that space does not exist in ",
                            "this era, and y=0 becomes a solid bedrock floor because that is the world floor.",
                        ],
                        [
                            { strong: "The level data is missing something on purpose." },
                            " A modern world carries a generation-settings compound, which is where the reader ",
                            "gets the overworld's floor and height. 1.12.2 predates the concept and carries none. ",
                            "Inventing one would make the generated world easier for the reader than any world it ",
                            "will ever meet, so it is left out and the consequence is measured instead: the reader ",
                            "falls back to the modern world box and scans a taller world than there is. Nothing ",
                            "breaks, because the legacy chunk answers air for everything below zero, and that is ",
                            "upstream's behaviour for a legacy world too.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Why both formats from one generator matters",
                    content:
                        "The same seed produces literally the same blocks in a 1.12.2 world and a modern one, which makes the modern world a usable control. Rendering both and diffing the two maps isolates the format: anything present in one and missing from the other is a difference in how the world was read and resolved rather than in what was generated.",
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "code",
                    language: "sh",
                    caption: "Write a pre-flattening world, then check it renders",
                    code: [
                        "node design/packages/worldgen/dist/cli.js --seed 22 --size 128 --format 1.12.2 --out ./out",
                        "node tools/oracle/render-1-12.mjs --seed 22 --size 128",
                    ].join("\n"),
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Two spellings of one choice",
                            description:
                                "The format can be named as a version or as a DataVersion, because both are how people refer to a world's era: a human says 1.12.2 and a tool reading a chunk says 1343. Giving both is an error only when they disagree.",
                        },
                        {
                            term: "Different folder names",
                            description:
                                "The two formats default to different names, so writing both from one seed leaves two worlds rather than one overwriting the other.",
                        },
                        {
                            term: "The harness fetches nothing",
                            description:
                                "It reads the client jar and resource extensions the modern parity gate already downloaded, and stops with a message if they are absent.",
                        },
                        {
                            term: "Why the default world is 128 blocks",
                            description:
                                "Eight chunks square, which at the default seed spans five of the generator's nine biomes and therefore covers grass, podzol, snow, three wood species, the stone variants and the ground plants. Larger adds render minutes and no new block-states; smaller lands inside one biome and would pass every check on four block ids.",
                        },
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "A modern block with no 1.12.2 equivalent is substituted and counted, in the summary and on the error stream. It is never dropped.",
                        "The format and the DataVersion given together and disagreeing is an error; given together and agreeing it is not, because both are ordinary ways of naming the same era.",
                        "The reader falling back to the modern world box is expected for this era, is explained above, and is asserted by a test rather than treated as a surprise.",
                        "Four block-states render differently or not at all under a modern resource pack, as flattening consequences rather than decoding bugs: the grass block, whose name a modern overlay gives to the grass tuft; podzol, whose modern variants are keyed on a property that did not exist; the snow layer, renamed by the flattening so nothing answers the old name; and the snow block, the mirror image of it, because the two names swapped meaning across the flattening. Each is pinned by name.",
                        "The harness fails if an undocumented fifth divergence appears and also fails if one of the four quietly starts working, so the pinned list cannot rot into fiction in either direction.",
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
                        "The generator reads no clock, no network and no environment, so a world is a pure function of its seed, its size and its format. That is what makes the byte-identical determinism test possible, and it is why a generated world can be published as a fixture without carrying anything about the machine that produced it.",
                        "The render harness reads its resources from disk and fetches nothing, so running it cannot pull a resource pack from anywhere.",
                        "Reading a legacy world is the same trust boundary as reading any other: region files are untrusted input, parsed by the same decoders, and a malformed chunk is a decode failure rather than something that reaches further in.",
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
                        "The decoding half is a unit test and runs in about a second. It reads a generated world ",
                        "back through this project's own reader and checks that the folder declares itself 1.12.2, ",
                        "that DataVersion 1343 really does dispatch to the legacy chunk, that every block the era ",
                        "cannot express is reported rather than lost, that the same seed produces byte-identical ",
                        "output, that the two formats write different folder names, that every written block ",
                        "decodes back to the block-state its id and metadata mean, that the 4-bit metadata ",
                        "survives, that bedrock sits on the floor with nothing below it, that every biome byte ",
                        "resolves through the legacy table, that the heightmap is an absolute y with no offset, ",
                        "that sky light is present above the terrain and absent under it, and that the snowy ",
                        "property is put back by the legacy neighbour extensions.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "There is no Java oracle for this era, and the harness says so",
                    content:
                        "Upstream carries no pre-flattening chunk loader at all, so there is no Java render of a 1.12.2 world to compare bytes against, and there cannot be one without reviving a decade-old branch whose output format predates everything this engine writes. The byte-exact gate the modern comparison runs is impossible here. What stands in for it is a control render of the same terrain, which is a weaker claim and is stated as one. It is also a real one, and it is what found the four block-states now pinned.",
                },
                {
                    kind: "paragraph",
                    content: [
                        "The render half is a script rather than a test because it needs a client jar, the ",
                        "resource extensions, a full resource-pack load of roughly 2,100 textures and two complete ",
                        "renders: a minute of work and a few hundred megabytes of resident memory, on files that ",
                        "are downloaded rather than committed. Nothing is softened by that. Every check is an ",
                        "assertion and a failure exits non-zero: every material a tile references resolves to a ",
                        "gallery entry with an embedded texture, no part of the map is the missing-texture ",
                        "placeholder, the map is made of at least fifteen distinct materials rather than one ",
                        "repeated block, no single material is more than sixty per cent of it, everything the ",
                        "control render draws and the legacy one does not is one of the four documented gaps, the ",
                        "legacy render draws nothing the control does not, and any material both draw in wildly ",
                        "different amounts is documented and still divergent.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "world-reading",
            reason: "The decoder matrix this format is one branch of, and the threshold it dispatches on.",
        },
        {
            articleId: "test-world-generator",
            reason: "The modern format, and why a synthetic world exists at all.",
        },
        {
            articleId: "java-render-path",
            reason: "The engine that renders both worlds in the control comparison.",
        },
    ],

    sources: [
        { label: "docs/legacy-1-12-worlds.md", href: LEGACY_WORLDS_DOC_URL },
        {
            label: "packages/worldgen/src/legacyChunkNbt.ts",
            href: repoFile("design/packages/worldgen/src/legacyChunkNbt.ts"),
        },
        {
            label: "packages/worldgen/test/legacy-worldgen.test.ts",
            href: repoFile("design/packages/worldgen/test/legacy-worldgen.test.ts"),
        },
        { label: "tools/oracle/render-1-12.mjs", href: repoFile("tools/oracle/render-1-12.mjs") },
    ],
};

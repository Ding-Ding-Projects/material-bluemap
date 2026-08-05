import type { Article } from "../types.js";
import { repoFile, issue, DEVIATIONS_URL } from "../links.js";

export const worldReading: Article = {
    id: "world-reading",
    title: "Reading a Minecraft world",
    summary:
        "NBT, five compression codecs, three region-file containers and a version-dispatched chunk decoder covering Minecraft 1.12.2 through 26.x.",
    category: "engine",
    status: "shipped",
    statusNote:
        "Complete and proved by an end-to-end test that builds synthetic worlds byte by byte. Reading a world is not the same as rendering one: nothing yet turns this data into map tiles.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "A Minecraft world on disk is a directory of region files. Each region file holds up to ",
                        "1024 chunks, each chunk is a compressed NBT document, and the shape of that document has ",
                        "changed repeatedly since 1.12. Reading one back means four layers, and this package has ",
                        "all four.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "NBT",
                            description: [
                                "A port of the BlueNBT subset: a streaming reader and writer for all twelve tag ",
                                "types, Java's modified UTF-8 string encoding, and a schema mapping layer that ",
                                "deserialises tags straight into typed objects. Gzip and zlib streams are detected ",
                                "from their header rather than declared.",
                            ],
                        },
                        {
                            term: "Compression",
                            description: [
                                "A registry of five codecs: none, gzip, deflate, zstd and LZ4 in Java's block ",
                                "framing. Region files name their codec per chunk, so the registry is looked up ",
                                "per chunk rather than per file.",
                            ],
                        },
                        {
                            term: "Region containers",
                            description: [
                                "Anvil ",
                                { code: ".mca" },
                                " files, the ",
                                { code: ".linear" },
                                " community format, and ",
                                { code: ".mcc" },
                                " external chunk files for chunks too large for their sector allocation. The ",
                                "container is chosen by file name, so a world can mix them.",
                            ],
                        },
                        {
                            term: "Chunk decoders",
                            description:
                                "Five decoders, picked by the chunk's own DataVersion field. Block states, biomes, light, block entities and entities all move between versions, and each decoder knows one era.",
                        },
                    ],
                },
                {
                    kind: "table",
                    caption: "Chunk decoder dispatch, by the DataVersion recorded in the chunk",
                    columns: ["Decoder", "Minimum DataVersion", "Minecraft era"],
                    rows: [
                        [{ code: "Chunk_1_18" }, "2844", "1.18 and newer, including 26.x"],
                        [{ code: "Chunk_1_16" }, "2500", "1.16 and 1.17"],
                        [{ code: "Chunk_1_15" }, "2200", "1.15"],
                        [{ code: "Chunk_1_13" }, "1344", "1.13 and 1.14"],
                        [{ code: "Chunk_1_12" }, "0", "1.12.2 and older, and chunks with no DataVersion at all"],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The loader remembers which decoder it used last and tries that one first, because a world ",
                        "is overwhelmingly likely to be uniform. When the DataVersion says otherwise it reloads the ",
                        "chunk with the right decoder rather than misreading it.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Reading 1.12.2 needed more than a decoder. Current upstream BlueMap decodes 1.13 and ",
                        "newer, so 1.12 support is combined back in from upstream tag ",
                        { code: "v0.10.3-mc1.12" },
                        ": the legacy numeric block-id mapper, and the fifteen neighbour-derived block-state ",
                        "extensions that reconstruct information 1.12 never stored. Fence connections, wall ",
                        "connections, stair shapes, door hinges, double chests, redstone wire, snowy grass, fire ",
                        "and tripwire are all derived from surrounding blocks at decode time.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "There is no user-facing configuration for this layer yet, because there is no options GUI ",
                        "and no server configuration schema. What a caller chooses is chosen in code.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "World directory",
                            description: [
                                "The directory holding ",
                                { code: "level.dat" },
                                ". Dimensions are resolved from it, and the level data is read through the NBT ",
                                "schema mapping.",
                            ],
                        },
                        {
                            term: "Region type",
                            description: [
                                "Defaults to Anvil. The registry recognises a file by its name, so a directory ",
                                "with both ",
                                { code: ".mca" },
                                " and ",
                                { code: ".linear" },
                                " files loads both.",
                            ],
                        },
                        {
                            term: "Chunk cache",
                            description:
                                "Loaded chunks are held in a bounded cache. The bound is a constructor argument today and becomes a setting when the config schema lands in Phase E.",
                        },
                        {
                            term: "Watching",
                            description:
                                "A watch service can follow a world directory and report regions that changed on disk. Re-rendering on that signal is Phase E and does not exist yet.",
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
                    kind: "definitions",
                    items: [
                        {
                            term: "A chunk has no DataVersion",
                            description:
                                "It dispatches to the 1.12 decoder, which is correct: DataVersion was introduced in 1.9 and 1.12-era chunks written by older tools may omit it.",
                        },
                        {
                            term: "A region file is truncated or its header is corrupt",
                            description:
                                "The affected chunk read fails and is reported. A single bad chunk does not fail the whole region, because a partially readable world is more useful than none.",
                        },
                        {
                            term: "A chunk names a compression codec that is not registered",
                            description:
                                "The read fails with the codec identifier, rather than guessing at a decoder and producing plausible nonsense.",
                        },
                        {
                            term: "An external .mcc chunk file is missing",
                            description:
                                "The region entry points at a file that is not there, and the chunk reads as absent. This is what an interrupted save looks like on disk.",
                        },
                        {
                            term: "A world is newer than any decoder knows",
                            description:
                                "The 1.18 decoder claims everything from 2844 upward, so a future format change would be read with the wrong decoder rather than refused. That is the upstream behaviour and is deliberate.",
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
                    kind: "paragraph",
                    content: [
                        "A world file is untrusted input. It may come from a download, a server backup or another ",
                        "player, and the decoders sit in front of everything else the renderer does.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "The NBT reader is streaming and bounds every array length it reads against the bytes actually available, so a declared length cannot make it allocate arbitrarily.",
                        "Decompression is the classic decompression-bomb surface. Chunks are read one at a time into buffers sized from the region header rather than from an attacker-chosen field.",
                        "Modified UTF-8 decoding is done explicitly rather than by handing bytes to a platform decoder, because Java's encoding is not standard UTF-8 and the difference is a source of parser confusion bugs.",
                        "Nothing read from a world is executed, evaluated or interpolated into markup. It becomes typed data structures and nothing else.",
                        "Paths inside a world directory are resolved relative to it. A world cannot name a file outside its own tree.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Not yet fuzzed",
                    content:
                        "The decoders have unit tests and a byte-exact end-to-end test, but no fuzzing harness. Deliberately malformed region files are not part of the test suite today.",
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
                        "The acceptance proof for this layer is ",
                        { code: "packages/engine/test/world-e2e.test.ts" },
                        ". It builds a synthetic 1.18 world and a synthetic 1.12.2 world byte by byte, writes real ",
                        "region files, and then asserts exact block-state, biome and light decoding back through the ",
                        "world API, including the legacy neighbour extensions such as fence connections.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Every decoder, the packed-int-array accessor in both of its layouts, the region containers and each compression codec have their own colocated tests.",
                        "The NBT package was validated against a real level.dat, not only against data it wrote itself.",
                        "Lint, build and tests run on every push in the CI workflow.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "One deferred verification",
                    content: [
                        "The LZ4 block-framing constants are ported from Java's implementation and have not been ",
                        "checked against real output from that implementation. Standing up a dockerized upstream ",
                        "Java oracle for that is tracked as ",
                        { link: "#3", href: issue(3), external: true },
                        " and recorded in the ",
                        { link: "deviations log", href: DEVIATIONS_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "world-discovery",
            reason: "Where a world folder comes from before any of this reads it: the wizard step that finds it.",
        },
        {
            articleId: "resource-packs",
            reason: "A block state is only half a block. The resource pack turns it into a model and a texture.",
        },
        {
            articleId: "viewer-remote-mode",
            reason: "What the app shows today, while local rendering is still unbuilt.",
        },
        {
            articleId: "release-pipeline",
            reason: "How this code reaches an installer, and how the tests that guard it gate a release.",
        },
    ],

    sources: [
        { label: "packages/nbt/src", href: repoFile("design/packages/nbt/src") },
        { label: "packages/engine/src/world/mca", href: repoFile("design/packages/engine/src/world/mca") },
        {
            label: "packages/engine/src/storage/compression",
            href: repoFile("design/packages/engine/src/storage/compression"),
        },
        { label: "packages/engine/test/world-e2e.test.ts", href: repoFile("design/packages/engine/test/world-e2e.test.ts") },
    ],
};

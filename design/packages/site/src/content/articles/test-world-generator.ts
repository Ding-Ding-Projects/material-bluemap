import type { Article } from "../types.js";
import { ROADMAP_URL, issue, repoFile } from "../links.js";

export const testWorldGenerator: Article = {
    id: "test-world-generator",
    title: "The test-world generator",
    summary:
        "A synthetic Minecraft world written directly in Anvil format by this repository, so a render can be demonstrated and reproduced from a seed without a Minecraft server, a download, or somebody else's demo site.",
    category: "delivery",
    status: "shipped",
    statusNote:
        "Built, and proved by reading its own output back through this project's world reader: 19 tests covering terrain, biomes, lighting, packing and determinism, running in CI on every push.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Rendering needs a world, and every obvious way of getting one is a problem. A real save ",
                        "is somebody's personal data and is far too large to commit. Generating one with ",
                        "Minecraft means shipping or downloading a server jar. Pointing at a public demo server, ",
                        "which is what the screenshot job used to do, spends a stranger's bandwidth on every push ",
                        "and produces captures that change with their uptime. So this repository writes its own.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Nothing here comes from Minecraft",
                    content: [
                        "There is no server jar, no client jar, no licence to accept and nothing is downloaded ",
                        "at generation time. Every byte of ",
                        { code: "level.dat" },
                        " and of every region file is written by this project, on top of its own NBT writer. The ",
                        "terrain is invented: plausible-looking, not vanilla-accurate, and a seed here has ",
                        "nothing to do with the same number typed into Minecraft.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "Real Anvil, current layout." },
                            " The 1.18 and later chunk format, with paletted block states packed into padded ",
                            "long arrays, a bedrock floor at the bottom of a 384-block-tall world, and sea level ",
                            "where Minecraft puts it.",
                        ],
                        [
                            { strong: "Terrain worth rendering." },
                            " A slow continent field decides land from sea, a faster hill field adds relief, and ",
                            "a ridged mountain field masked to the raised interior produces peaks. Typically a ",
                            "fifth to a third of a world is below sea level, so there is water and shoreline in ",
                            "every render rather than a flat plain.",
                        ],
                        [
                            { strong: "Nine biomes, chosen from height, temperature and humidity." },
                            " Ocean, beach, desert, plains, forest, taiga, snowy plains, stony peaks and jagged ",
                            "peaks, each with its own surface block, filler and filler depth.",
                        ],
                        [
                            { strong: "Detail with hard edges in it." },
                            " Oak, birch and spruce trees with real canopies, ground cover, cacti and dead ",
                            "bushes in the desert, ore veins in their own depth bands, and a rare ruined ",
                            "stone-brick pillar, so a rendered tile contains at least one straight vertical edge ",
                            "to look at.",
                        ],
                        [
                            { strong: "Every block is a real block state." },
                            " Written into the section palette as a name plus properties, exactly as Minecraft ",
                            "writes them, so the resource-pack pipeline has something genuine to resolve.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A 1000 by 1000 block world is 3,969 chunks across four region files. That is the world ",
                        "behind the 961-tile render figure quoted elsewhere on this site.",
                    ],
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
                    caption: "Generating a world, from design/ after a build",
                    code: [
                        "node packages/worldgen/dist/cli.js --seed 4242424242 --size 1000 --out ./out",
                        "",
                        "#   --seed <n>       world seed; the world is a function of this alone (required)",
                        "#   --size <blocks>  edge length of the generated square (default 1000)",
                        "#   --out <dir>      directory the world folder is created in (default \".\")",
                        "#   --name <str>     world folder name",
                        "#   --zip <path>     archive path",
                        "#   --no-zip         write the world folder only",
                        "#   --quiet          no progress output",
                    ].join("\n"),
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Seed",
                            description:
                                "The whole input. Two runs with the same seed produce identical files, and the test suite asserts exactly that. To reproduce the world attached to a release, take the seed from its notes and run the same command.",
                        },
                        {
                            term: "Size",
                            description:
                                "Edge length in blocks of the generated square. Chunk count grows with the square of it, so this is the knob that decides whether a render takes a minute or an afternoon.",
                        },
                        {
                            term: "Output",
                            description:
                                "A world folder holding level.dat and its region files, plus a zip archive by default. Progress goes to standard error and a JSON summary to standard output, so a CI step can capture the summary with a plain redirect.",
                        },
                        {
                            term: "Target version",
                            description:
                                "Minecraft 1.20.4's data version, with world geometry from that era. That is what the file claims to be, and it is what a reader will treat it as.",
                        },
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "It is also usable as a library rather than a command: the terrain generator can be ",
                        "queried for a column's height or biome without writing anything to disk, which is what ",
                        "makes the terrain testable separately from the file format.",
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
                            term: "Determinism is over the generator's own output",
                            description:
                                "Timestamps are fixed constants and nothing consults a clock or a global random source, so two runs on one machine produce identical bytes. The compressor is part of that output, though: a different zlib build could emit a different, still valid, compressed stream for the same input. The world it decompresses to is the same either way.",
                        },
                        {
                            term: "Sky light is a vertical cast, not a propagation",
                            description:
                                "Light is full above a column's topmost block and zero at and below it. It does not bleed sideways under an overhang and water is not attenuated with depth. Block light is not written at all. A render of this world is therefore lit more simply than a render of a real one.",
                        },
                        {
                            term: "Decoration never crosses a chunk border",
                            description:
                                "Trees are placed far enough inside a chunk that their canopy stays in it, so every chunk is generatable on its own and no canopy is cut off at a border. Real worlds do not have that property.",
                        },
                        {
                            term: "Biomes are picked per four-by-four cell",
                            description:
                                "Which is Minecraft's own storage resolution, but the surface block of a column follows that column's own biome, so near a biome edge a column can carry a neighbouring biome's surface block. That is the same thing vanilla's biome storage does to a smooth surface rule.",
                        },
                        {
                            term: "No caves, ravines, structures, entities or block entities",
                            description:
                                "Beyond the ruined pillar there is nothing built, and there are no entity or point-of-interest folders. A renderer feature that only triggers on a block entity will not be exercised by this world.",
                        },
                        {
                            term: "The bedrock floor is flat",
                            description:
                                "One layer, rather than vanilla's ragged few. It makes the sections below zero identical in every chunk, which is worth tens of millions of block writes on a large world.",
                        },
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "None of these affects whether the world parses. They are written down so nobody mistakes ",
                        "a deliberate simplification for a bug, and so nobody concludes from a render of this ",
                        "world that lighting or structures are correct.",
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
                        "Nothing is downloaded and no third-party service is contacted. Generation is entirely local, which is the whole reason this exists rather than a fixture pulled from somewhere.",
                        "No Minecraft asset is copied, extracted or redistributed. The generator writes block-state strings, which are names rather than content, and the textures for them come later from the client jar the person consented to download.",
                        "A generated world contains no personal data. That is what makes it publishable as a release asset, where a real save would not be.",
                        "The archive writer keeps every path relative and inside a single top-level folder, so extracting one cannot write outside its own directory.",
                        "The output is a deterministic function of the seed, so an archive attached to a release can be re-derived and compared rather than trusted.",
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
                        "The proof is a loop: the test suite generates a small world and then reads it back ",
                        { strong: "through this project's own world reader" },
                        ". A generator whose output this project cannot parse would be worthless, and a reader ",
                        "that agreed with a generator sharing its bugs would be worse, so the assertions are ",
                        "about specific block states at specific coordinates rather than about the files being ",
                        "well formed.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Every chunk loads as a fully generated, lit chunk of the expected format, and the reader takes its world geometry out of the generated level.dat rather than a default.",
                        "Thousands of sampled blocks come back as the exact block states the generator placed, spanning the bedrock floor, the deep rock, the surface band and the air above it.",
                        "Every column below sea level is flooded and every column above it is not, with both kinds present.",
                        "Every biome cell resolves through the data pack to the biome the generator chose, and never falls back to a default.",
                        "The surface and ocean-floor heightmaps resolve to the actual surface and floor of each column, and sky light is full above the terrain and zero at the surface block.",
                        "The same seed twice produces byte-identical files, and a different seed does not.",
                        "The archive opens through this project's own zip file system and its region bytes match the ones on disk.",
                        "The padded long-array packing is checked directly against the reader's own unpacking, at every bit width the generator can choose, including the widths where the width is ambiguous from the array length alone.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What a world from here does not prove",
                    content: [
                        "It is not vanilla. A render of it exercises the terrain, biome, water and lighting paths ",
                        "the generator writes, and nothing else: no caves, no structures, no block entities, no ",
                        "block light. Parity with upstream is still measured against fixture worlds and the ",
                        "oracle harness, ",
                        { link: "tracked as issue 3", href: issue(3), external: true },
                        ".",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "It replaced the screenshot job's dependency on a third party's public demo server, ",
                        { link: "issue 17", href: issue(17), external: true },
                        ", which is what made captures free, offline and reproducible from a recorded seed.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "world-reading",
            reason: "The reader this generator is proved against, and the format both of them speak.",
        },
        {
            articleId: "java-render-path",
            reason: "What a generated world is handed to, and where the 961-tile figure comes from.",
        },
        {
            articleId: "screenshot-gallery",
            reason: "The capture job this exists to make self-contained.",
        },
    ],

    sources: [
        { label: "packages/worldgen", href: repoFile("design/packages/worldgen") },
        {
            label: "packages/worldgen/README.md",
            href: repoFile("design/packages/worldgen/README.md"),
        },
        {
            label: "packages/worldgen/test/worldgen.test.ts",
            href: repoFile("design/packages/worldgen/test/worldgen.test.ts"),
        },
        { label: "design/ROADMAP.md", href: ROADMAP_URL },
    ],
};

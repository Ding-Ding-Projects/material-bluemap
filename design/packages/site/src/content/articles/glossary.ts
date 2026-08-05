import type { Article } from "../types.js";
import {
    BEDROCK_WORLDS_DOC_URL,
    FINDING_WORLDS_DOC_URL,
    HANDOFF_URL,
    LEGACY_WORLDS_DOC_URL,
    WORLD_SOURCES_DOC_URL,
} from "../links.js";

export const glossary: Article = {
    id: "glossary",
    title: "Glossary: the words this project uses, defined once",
    summary:
        "Every domain term this site and the application use, in plain language, defined once so no other article has to stop and explain one from context.",
    category: "application",
    status: "shipped",
    statusNote:
        "This article is the site's own glossary and is live now. An equivalent in-place glossary reachable from inside the desktop application itself, so a reader never has to alt-tab to a browser mid-task, has not shipped yet; when it does, the two are expected to define every term the same way.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Every article on this site uses these words as though a reader already knows them, ",
                        "because most of the time a reader does. This one is for the times a reader does not: ",
                        "one place, alphabetised by group rather than by letter, so related terms sit near each ",
                        "other instead of being scattered by spelling.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "World",
                            description: [
                                "A Minecraft save: the region files, the level data and everything the game needs ",
                                "to load it. Not the finished map you look at in a browser, and not a rendered ",
                                "image; the raw save this project reads.",
                            ],
                        },
                        {
                            term: "Render",
                            description: [
                                "The act of turning a world into a map: reading the blocks, building geometry and ",
                                "images from them, and writing the result to disk as tiles a browser can open. ",
                                "“Rendering a world” and “making a map” mean the same thing here.",
                            ],
                        },
                        {
                            term: "Map",
                            description: [
                                "The finished, browsable 3D result of a render: a set of tiles plus the settings ",
                                "that say how to display them. This is not Minecraft's own in-game map item; ",
                                "nothing on this site is about that.",
                            ],
                        },
                        {
                            term: "Engine",
                            description: [
                                "The program that actually turns blocks into geometry. Two exist: upstream ",
                                "BlueMap's own Java engine, which renders every local world today, and a ",
                                "TypeScript rewrite of it that this project exists to build. The “Java render ",
                                "path” article below covers which one runs and why in full.",
                            ],
                        },
                        {
                            term: "Tile",
                            description: [
                                "One small piece of a rendered map. A hires tile is a 3D mesh covering a short ",
                                "square of the world, used up close. A lowres tile is a flat image used from far ",
                                "away, the way a paper map shows less detail than standing in the place itself.",
                            ],
                        },
                        {
                            term: "Viewer",
                            description: [
                                "The interface a browser or the desktop application shows once a map exists: pan, ",
                                "zoom, switch maps, follow markers. It opens a map the same way whether that map ",
                                "was rendered on this computer or is being read from a server somewhere else.",
                            ],
                        },
                        {
                            term: "Marker",
                            description: "A labelled point of interest placed on a map, such as a base, a shop or a waypoint, shown in the viewer as a pin.",
                        },
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Project",
                            description: [
                                "A saved set of maps, storages and settings that the application edits as one ",
                                "document, the way a file is one document in a word processor. Most people only ",
                                "ever have one.",
                            ],
                        },
                        {
                            term: "Storage",
                            description: "Where a map's rendered tiles and configuration live on disk: one storage directory per render, holding its config, its data and its finished web output together.",
                        },
                        {
                            term: "Resource pack",
                            description: "The set of block textures a render draws from. Without one, blocks fall back to a plain placeholder texture rather than looking like the game.",
                        },
                        {
                            term: "Config file",
                            description: [
                                "A settings file the engine reads before it renders, such as ",
                                { code: "core.conf" },
                                " or ",
                                { code: "webapp.conf" },
                                ". The application's options editor writes these for you; hand-editing is ",
                                "possible but is the harder path.",
                            ],
                        },
                        {
                            term: "Mojang download consent",
                            description: "Agreement to Mojang's own end-user licence, asked once before the first render because the engine downloads an official Minecraft client jar to read textures from. Nothing renders without it.",
                        },
                        {
                            term: "Backup",
                            description: "A packed, checksummed copy of a world or a rendered map, published to a GitHub release so it survives a lost drive and can be restored from anywhere.",
                        },
                        {
                            term: "Publishing to Pages",
                            description: "Taking a finished local render and hosting it as a real public website through GitHub Pages, directly from the application, without a separate web server of your own.",
                        },
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "DataVersion",
                            description: "A number every Minecraft world carries that says exactly which game version wrote it. This project reads it to pick the right rules for decoding that world's blocks.",
                        },
                        {
                            term: "“The flattening”",
                            description: [
                                "A change Minecraft made in version 1.13: before it, a block was a number plus ",
                                "extra bits; after it, a block is a name. Some names also changed meaning, which ",
                                "is why an old world needs its own decoding rules rather than reusing the new ones.",
                            ],
                        },
                        {
                            term: "Java Edition and Bedrock Edition",
                            description: [
                                "Two different Minecraft games that share a name and look alike but store worlds ",
                                "completely differently. This project reads Java Edition worlds; a Bedrock world ",
                                "is a different case with its own article.",
                            ],
                        },
                        {
                            term: "Live players",
                            description: "A planned feature, not yet built: showing where real players currently are on a rendered map while a server is running. Nothing on this site claims it exists today.",
                        },
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
                        "There is nothing to configure here beyond finding a term. This article is indexed ",
                        "the same way every other article is, so the site's own search bar finds it by typing ",
                        "a term directly, and its anchored regex builder is available if a broader pattern is ",
                        "more useful than a plain word.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Term names and their definitions are treated as facts, not tone: the language and ",
                        "funny-level settings that style the rest of this site's chrome do not rewrite what a ",
                        "term means. A joke can sit around a definition; it cannot replace one.",
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "A glossary's failure mode is not a crash; it is a word that quietly means two ",
                        "different things depending on who is talking. These are the ones most likely to trip ",
                        "a newcomer up.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "“Map”, in Minecraft versus here",
                            description: "In the game, a map is an item you hold. Everywhere on this site, a map is the rendered 3D result you view in a browser. The two are unrelated, and this project does not touch the in-game item.",
                        },
                        {
                            term: "“World”, before and after a render",
                            description: "A world is the save; a map is what a render makes from it. Talking about “rendering a world” is normal; a “rendered world” usually means the map that came out of it.",
                        },
                        {
                            term: "“Engine”, without saying which one",
                            description: "There are two, and only one renders anything today. An article or a setting that says “the engine” without naming Java or TypeScript is describing the one that currently runs local renders, per decision D17.",
                        },
                        {
                            term: "A term used here that this glossary does not define",
                            description: "Genuinely possible, since this project keeps shipping. The right next step is the article that uses it, whose own sources link back to the exact code that term describes.",
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
                        "This article is static, bundled text with no external requests, no analytics and nothing that reads or stores anything about the person reading it.",
                        "It defines no credential, key or setting; where a term names something sensitive, such as Mojang download consent, this article says what it is and points to the article that governs it rather than repeating configuration details here.",
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
                        "This article carries the same mechanical guarantees every article on this site does: ",
                        "it is indexed by the search suite, every suggested link resolves to a real article, ",
                        "and every source cited below is a real, absolute link, all checked by ",
                        { code: "content.test.ts" },
                        " on every push.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Where this list came from",
                    content: [
                        "These are the same terms design/HANDOFF.md defines for the agents working on this ",
                        "project, rewritten here for a reader of the application rather than a reader of its ",
                        "source. Where the two describe the same thing, they are kept saying the same thing.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "install",
            reason: "The natural first stop once the words in this list make sense.",
        },
        {
            articleId: "world-discovery",
            reason: "Where “world” stops being an abstract term and becomes a folder on your disk.",
        },
        {
            articleId: "java-render-path",
            reason: "“Engine” and “render”, in full, including which one actually runs.",
        },
        {
            articleId: "legacy-world-support",
            reason: "“DataVersion” and “the flattening”, worked through against a real 1.12.2 world.",
        },
    ],

    sources: [
        { label: "design/HANDOFF.md (Glossary section)", href: HANDOFF_URL },
        { label: "docs/finding-worlds.md", href: FINDING_WORLDS_DOC_URL },
        { label: "docs/world-sources.md", href: WORLD_SOURCES_DOC_URL },
        { label: "docs/legacy-1-12-worlds.md", href: LEGACY_WORLDS_DOC_URL },
        { label: "docs/bedrock-worlds.md", href: BEDROCK_WORLDS_DOC_URL },
    ],
};

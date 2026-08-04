import type { Article } from "../types.js";
import { ROADMAP_URL, repoFile } from "../links.js";

export const configRichControls: Article = {
    id: "config-rich-controls",
    title: "A real control for every setting",
    summary:
        "Every field in a BlueMap config gets the control its own value deserves, kept that way by a guard that classifies each field from its schema and takes a second opinion from upstream's Java types.",
    category: "application",
    status: "shipped",
    statusNote:
        "The controls, the registry-key normalisation and the alpha-capable colour field are on the default branch, with a guard test that walks every field of every descriptor and every mask shape. The half of that guard which reads upstream's own Java declarations skips itself where the vendored submodule is absent, nobody has opened these controls in an installed build, and the wider exit check the options editor still owes has not run: no config written from these screens has been loaded by the real Java server.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The promise the options editor makes is that nobody has to open a HOCON file. A form ",
                        "of text boxes technically keeps that promise and breaks its point: a value with four ",
                        "legal answers becomes a field that accepts anything and complains afterwards, and a ",
                        "colour becomes six characters somebody has to get right from memory. So every field ",
                        "carries the control its value actually needs, and a test refuses the shortest ",
                        { code: "control:" },
                        " that would have compiled.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The failure that motivated most of this work is invisible when it happens. A closed ",
                        "select bound to a value none of its items holds does not warn and does not fall back: ",
                        "it renders ",
                        { strong: "empty" },
                        ". The setting then reads as unset, and the next click writes over something somebody ",
                        "put in the file deliberately. Two different causes land there, and the control now ",
                        "keeps them apart.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "The same key, spelled differently." },
                            " BlueMap parses several of these values as registry keys, and ",
                            { code: "Key.parse" },
                            " fills in a default namespace. A file saying ",
                            { code: "file" },
                            ", a Java default of ",
                            { code: "bluemap:file" },
                            " and an option spelled either way are one value. Each of those selects now ",
                            "carries the namespace BlueMap would apply, so the two spellings compare equal ",
                            "and the option's own label is shown.",
                        ],
                        [
                            { strong: "A value this app has never heard of." },
                            " A dimension from a datapack, a resolution of 1.5, a storage id somebody named ",
                            "themselves. All legal, none in a list this application ships. The control ",
                            "prepends an item holding the file's own text and says plainly that it is ",
                            "unlisted, which is fine if a mod, a datapack or a local setup provides it.",
                        ],
                        [
                            { strong: "Either way, the file is not rewritten." },
                            " The prepended item's value is the text that was read, so showing it cannot ",
                            "change it. Normalising somebody's spelling on open is not this application's ",
                            "job, and a save that quietly rewrote every key would be a diff nobody asked for.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Free entry stays open beside the list wherever the schema is wider than the options, ",
                        "which is what makes offering a short list of sensible values safe in the first place. ",
                        "A numeric option set coerces a numeric-looking entry back to a number, because ",
                        { code: "\"2\"" },
                        " where the file wants ",
                        { code: "2" },
                        " is the sort of thing HOCON forgives and a reader does not; anything else is left ",
                        "alone for the schema to report.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Both colours carry alpha, because BlueMap reads it",
                    content: [
                        { code: "sky-color" },
                        " and ",
                        { code: "void-color" },
                        " mount the same infinite colour picker the appearance editor uses, with the alpha ",
                        "channel switched on. That is not decoration: upstream's ",
                        { code: "Color.parse" },
                        " pads a six-digit value with ",
                        { code: "ff" },
                        " and reads the eighth hex byte as alpha, and the map settings serialiser hands the ",
                        "whole colour to the webapp. A picker without alpha could not express a value BlueMap ",
                        "both accepts and uses, and would have dropped it the first time somebody opened it.",
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
                        "None of this is a user setting. Each rule is a property of the field, declared beside ",
                        "it in the schema and enforced from outside.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "allowCustom",
                            description:
                                "True whenever the schema accepts more than the option list does, which is what keeps free entry beside the list. A closed select over an open schema is refused by the guard rather than left to be discovered as a blank control.",
                        },
                        {
                            term: "keyNamespace",
                            description:
                                "The default namespace BlueMap parses this field's value with. Required on every select over a registry key, and refused on every select that is not over one, so the control never compares two things that are not keys.",
                        },
                        {
                            term: "alpha",
                            description:
                                "Set on every colour control, because both colour fields accept the eight-digit form. The guard asserts it rather than trusting that whoever added the field remembered.",
                        },
                        {
                            term: "unit",
                            description:
                                "Every number that measures something states what it measures. The nine that genuinely measure nothing, such as a TCP port or a JVM thread priority, are named in the guard with the reason, and a stale exemption fails the test rather than quietly excusing whatever field later takes that name.",
                        },
                    ],
                },
                {
                    kind: "table",
                    caption: "What upstream's own Java type is allowed to become",
                    columns: ["Java declaration", "Controls it may use"],
                    rows: [
                        [{ code: "boolean" }, "Switch"],
                        [{ code: "int, long, float, double" }, "Number or slider"],
                        [{ code: "String" }, "Text, path, select or colour"],
                        [{ code: "Path" }, "Path, with a picker beside it"],
                        [{ code: "Key, WorldLoaderType" }, "Select"],
                        [{ code: "Vector2i, Vector2d" }, "Vector"],
                        [{ code: "Map, List, Set, LinkedHashSet" }, "Key-value or list"],
                        [{ code: "CombinedMask" }, "The mask list"],
                        [{ code: "ConfigurationNode" }, "Marker sets"],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Seven fields are still a plain text box, and that list is written into the guard so ",
                        "an eighth is a deliberate edit rather than a quiet default. Each is genuinely open: ",
                        "a map's display name, an SQL connection URL, a driver class name, two webapp data ",
                        "roots, a start location and a log format template.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "One number is offered as a select instead: ",
                        { code: "resolution-default" },
                        " is a Java ",
                        { code: "float" },
                        " whose comment lists three values, so those three are offered with their meanings. ",
                        "That costs nothing only because free entry stays open, which is the earlier rule ",
                        "holding this one up.",
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
                            term: "The file holds a value no option matches",
                            description:
                                "Shown as its own item at the top of the list rather than as a blank control, labelled with the option it is equivalent to when it is only a spelling variant, and flagged as unlisted when it is not.",
                        },
                        {
                            term: "The colour cannot be read as hex",
                            description:
                                "Kept and shown with a note saying so, never replaced with a guess. BlueMap's parser takes hex; the picker is happy with a named colour or an OKLCH expression, and a value it cannot turn into hex is the user's text rather than the app's to overwrite.",
                        },
                        {
                            term: "The colour field is cleared",
                            description:
                                "Read as BlueMap's own default for that field, which is the only thing an empty colour can honestly mean in a file where the key still has to hold something.",
                        },
                        {
                            term: "Free entry hands back the wrong primitive",
                            description:
                                "A numeric option set turns a numeric-looking string back into a number. Anything else is passed through unchanged so the schema reports it, rather than being coerced into something that would validate and mean something different.",
                        },
                        {
                            term: "A new field reaches for the wrong control",
                            description:
                                "The guard fails, naming the field, what the schema says the value is, and which controls could edit it. That is the whole reason it walks every field rather than sampling.",
                        },
                        {
                            term: "The guard cannot classify a schema",
                            description:
                                "Reported as a failure rather than skipped. A field the test cannot read is a field nobody is checking, and a silent pass there is worse than no test.",
                        },
                        {
                            term: "The vendored upstream source is not checked out",
                            description:
                                "The Java half of the guard skips itself. It is the half that cannot be satisfied by editing this repository alone, so a run without submodules proves strictly less and the article says so rather than the suite pretending otherwise.",
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
                        "Config text is data. Nothing a control renders is executed or evaluated, and a value read from a file is put on screen as text rather than interpreted.",
                        "The SQL connection properties are marked secret, so the key-value control masks them and they stay out of logs, exported diagnostics and issue comments.",
                        "The colour picker, the key normalisation and every validation run locally. Nothing about a config field reaches the network, and no field's value is transmitted to be checked.",
                        "Search over these screens runs on the project's bounded regex engine, because a search box that accepts a pattern is a search box that can be handed a catastrophically backtracking one.",
                        "The guard reads the vendored upstream Java source from disk at test time only. Nothing in the shipped application parses Java.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "table",
                    caption: "What each test file holds",
                    columns: ["File", "What it proves"],
                    rows: [
                        [
                            { code: "controlPolicy.test.ts" },
                            "Walks every field of every descriptor and every mask shape, over 85 of them, and asks the zod schema what the value is before looking at what the control claims to be: the control fits the type, no select is closed over an open schema, every registry-key select carries its namespace and no other select does, every colour offers alpha, every number states its unit or is exempted with a reason, a list's item control fits what the list holds, a vector has an axis per key, and the free-text set is exactly the seven fields named above.",
                        ],
                        [
                            { code: "controlPolicy.test.ts, the Java half" },
                            "Reads the field declarations out of the vendored upstream Java files and checks each control against the type upstream declared. A Java type the table does not know is reported rather than counted as a pass, so a field nobody is checking is visible.",
                        ],
                        [
                            { code: "ConfigControl.test.ts" },
                            "Mounted: the colour field opens the same picker as the rest of the app, writes back the hex spelling BlueMap reads whatever notation the picker used, keeps the alpha channel, reads clearing as the default and keeps an unreadable colour rather than guessing; a select shows the option a differently-spelled key means without rewriting the file, keeps an unlisted value visible instead of rendering empty, adds nothing when an option already holds the value verbatim, and puts a number back as a number while leaving a non-numeric entry for the schema.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The schema-derived half of the guard reaches into zod's internals to learn what a leaf ",
                        "actually is. That is a deliberate cost: the alternative is probing each schema with ",
                        "sample values, which cannot tell a coerced boolean from a string that happens to say ",
                        { code: "yes" },
                        " and would classify half these fields wrongly. The surface used is four property ",
                        "names, so a zod upgrade that moves them fails loudly rather than passing vacuously.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What these tests do not show",
                    content: [
                        "Every claim here is about what this repository writes and what upstream's source ",
                        "declares. No config written through these controls has been loaded by the real Java ",
                        "server and compared value for value, nobody has driven them in an installed build, ",
                        "and no capture of the screens exists at the longest localised strings, so clipping ",
                        "there is unproven rather than known good. The same exit check is tracked in the ",
                        { link: "roadmap", href: ROADMAP_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "options-gui",
            reason: "The editor these controls are the surface of, and the exit check it still owes.",
        },
        {
            articleId: "config-history",
            reason: "What happens to the folder after a save made through one of these controls.",
        },
        {
            articleId: "appearance-editor",
            reason: "The infinite colour picker and its translator, which the two colour fields mount.",
        },
        {
            articleId: "java-render-path",
            reason: "The renderer that reads the file these controls write, and what a wrong value costs there.",
        },
    ],

    sources: [
        { label: "packages/config/src/meta.ts", href: repoFile("design/packages/config/src/meta.ts") },
        {
            label: "packages/config/test/controlPolicy.test.ts",
            href: repoFile("design/packages/config/test/controlPolicy.test.ts"),
        },
        {
            label: "packages/config/src/schema/map.ts",
            href: repoFile("design/packages/config/src/schema/map.ts"),
        },
        {
            label: "packages/ui/src/components/config/ConfigControl.vue",
            href: repoFile("design/packages/ui/src/components/config/ConfigControl.vue"),
        },
        {
            label: "packages/ui/src/components/config/ConfigControl.test.ts",
            href: repoFile("design/packages/ui/src/components/config/ConfigControl.test.ts"),
        },
    ],
};

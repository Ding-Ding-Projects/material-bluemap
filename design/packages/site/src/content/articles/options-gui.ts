import type { Article } from "../types.js";
import { PLAN_URL, ROADMAP_URL, repoFile } from "../links.js";

export const optionsGui: Article = {
    id: "options-gui",
    title: "The options GUI",
    summary:
        "Every BlueMap setting as a real control, generated from a schema checked against upstream's own Java source, editing the actual config files without stripping the comments that explain them.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The schema, the round-tripping HOCON editor and the screens are built and covered by 175 tests in the config package and 311 in the interface package. What has not run is the plan's exit check: a config authored here loaded by the real Java server and compared value for value.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "BlueMap is configured through HOCON files, and the promise this project made is that ",
                        "nobody has to open one. That is harder than putting a form over a JSON blob, because ",
                        "the files are not a serialisation format: they are documentation. A freshly generated ",
                        { code: "core.conf" },
                        " is mostly comments explaining what each setting does, and a GUI that rebuilt the file ",
                        "from a plain object would silently delete all of it the first time somebody changed a ",
                        "number.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "The file is edited, not regenerated." },
                            " The editor parses what BlueMap wrote, changes the one key that changed, and ",
                            "writes the document back, so every comment, blank line and hand-written note ",
                            "survives. A key that is currently commented out is re-added directly beneath its ",
                            "own example rather than appended to the bottom, so the setting lands where its ",
                            "documentation already is.",
                        ],
                        [
                            { strong: "Every control is generated from a schema." },
                            " Each field carries its real default, its bounds, upstream's own comment as its ",
                            "help text, the control to render, the group it belongs to, and whether changing it ",
                            "invalidates tiles that are already rendered.",
                        ],
                        [
                            { strong: "Twelve kinds of control, because twelve are used." },
                            " Switch, number, slider, text, path, select, colour, vector, list, key-value, ",
                            "mask list and marker sets. Every one of them is required by at least one real ",
                            "setting.",
                        ],
                        [
                            { strong: "Maps and storages are managed, not just edited." },
                            " Create, clone, rename and delete a map; add a file or SQL storage and test the ",
                            "connection against the real database; see which maps a storage is holding before ",
                            "removing it.",
                        ],
                        [
                            { strong: "The command line is a screen too." },
                            " All seventeen CLI flags, with an honest statement of what the chosen set will ",
                            "actually do. The flags are not independent: several take the render branch, and ",
                            "inside it one flag changes meaning while two others are never reached. The screen ",
                            "shows the resolved answer instead of implying that every ticked box happens.",
                        ],
                        [
                            { strong: "Search on every surface, with the regex builder behind it." },
                            " Plain text by default, regex as an explicit opt-in, matching a field's label, its ",
                            "config key, its Java field name and upstream's explanation of it.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Saving is a gate rather than a button. Before anything is written, the dialog names ",
                        "every file that will change, every value that will change in it, and every map that ",
                        "will have to be rendered again, by id rather than as \"some maps\". Errors across files ",
                        "block the save; warnings do not, because BlueMap itself would load the folder, so they ",
                        "are shown and the person decides.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Why this arrived before the phase that plans it",
                    content: [
                        "The plan put the options GUI after the TypeScript render manager. Decision D17 runs ",
                        "local rendering on upstream's Java engine, and this GUI writes BlueMap's own HOCON and ",
                        "invokes the real CLI, so it never needed that render manager at all. It is being built ",
                        "out of order and against the Java engine. See ",
                        { link: "Amendment 1 in the plan", href: PLAN_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "table",
                    caption: "The config files modelled, and how many fields each carries",
                    columns: ["File", "Fields", "Upstream Java class"],
                    rows: [
                        [{ code: "core.conf" }, "10", { code: "CoreConfig" }],
                        [{ code: "webapp.conf" }, "19", { code: "WebappConfig" }],
                        [{ code: "webserver.conf" }, "8", { code: "WebserverConfig" }],
                        [{ code: "plugin.conf" }, "12", { code: "PluginConfig" }],
                        [{ code: "maps/<id>.conf" }, "31", { code: "MapConfig" }],
                        [
                            { code: "storages/<id>.conf (file)" },
                            "4",
                            { code: "FileConfig + StorageConfig" },
                        ],
                        [
                            { code: "storages/<id>.conf (sql)" },
                            "8",
                            { code: "SQLConfig + StorageConfig" },
                        ],
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Settings upstream does not advertise",
                            description:
                                "Ten fields exist on the Java config classes and appear in none of upstream's templates. They work; they are simply undiscoverable. Each is marked hidden so a GUI can put it behind an advanced disclosure rather than pretending it does not exist.",
                        },
                        {
                            term: "Where the template and the Java class disagree",
                            description:
                                "Several defaults differ between the Java field and what a freshly generated file actually contains. Showing only one of them would mislead somebody, so the schema records both: the Java default, and what the generated file says.",
                        },
                        {
                            term: "Re-render warnings",
                            description:
                                "Eighteen of the map config's fields are flagged as invalidating rendered tiles, each carrying upstream's own qualification where it has one. Four are flagged on this project's judgement rather than upstream's wording, and each says so. A spurious warning costs somebody time; a missing one costs them a map that is quietly wrong.",
                        },
                        {
                            term: "Consent is not a setting",
                            description:
                                "Mojang EULA acceptance is modelled as consent-gated, so no generated screen renders it as an ordinary switch. The GUI never flips it; it points at the setup surface that owns the decision.",
                        },
                        {
                            term: "Secrets",
                            description:
                                "The SQL connection properties field usually holds a database password and is marked secret, so it must never reach a log, an exported diagnostic or an issue comment.",
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
                            term: "The file uses HOCON features the reader refuses",
                            description:
                                "Substitutions, includes and list-append are refused by name, with the line number, rather than guessed at. Resolving a substitution wrongly would corrupt somebody's config, and a config editor that corrupts configs is worse than no config editor. Nothing upstream generates uses any of them.",
                        },
                        {
                            term: "The file has keys the schema does not know",
                            description:
                                "Reported as an issue and left alone. An unknown key is more likely a newer BlueMap than a mistake, and deleting it to make a form tidy would break the thing it configures.",
                        },
                        {
                            term: "The file has keys that used to be valid",
                            description:
                                "Reported as a legacy key, which means the folder needs upgrading rather than that the value is wrong.",
                        },
                        {
                            term: "There is no host to touch the disk",
                            description:
                                "In a plain browser tab there is no file access. That is a stated fact, not a disabled-looking button that silently does nothing: editing, validating, previewing and copying the file text all keep working, and the surface says what is missing.",
                        },
                        {
                            term: "A write fails",
                            description:
                                "The reason is reported verbatim rather than flattened to something went wrong. When a write fails because a folder is read-only, that sentence is the whole answer.",
                        },
                        {
                            term: "A map points at a storage that does not exist",
                            description:
                                "Found before saving, not after a render fails. Cross-file questions like this are exactly why the editor models a whole folder rather than one file at a time.",
                        },
                        {
                            term: "A very large integer",
                            description:
                                "One field is a Java long, and JavaScript holds integers exactly only to a point. In practice the values involved are small, but it is a real limit and it is written down rather than hidden.",
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
                        "The editor itself never touches a disk. Everything that reads or writes goes through a host interface, which exists only where the app actually has that privilege, so the same code runs in a browser tab with no file access at all.",
                        "Config text is parsed as data. Nothing in a config file is executed or evaluated, and the refused HOCON features are refused rather than partially implemented.",
                        "The SQL connection properties field is marked secret so it can be kept out of logs and exported diagnostics. A connection test opens a real connection and reports what the driver said, which is the only way to answer the question honestly, so it is a deliberate outbound action taken when somebody presses it.",
                        "Mojang EULA acceptance is not editable here. It belongs to the consent record and its own surface, so no settings screen can quietly flip it.",
                        "Deleting a map or a storage is a destructive action and uses the app's two-key confirmation gate rather than a plain confirm.",
                        "Paths chosen through the picker are absolute. The CLI resolves relative paths against its working directory, which is how a render writes tens of megabytes into whatever directory the app happened to be launched from.",
                        "Regex evaluation for the search surfaces is bounded, because a search box that accepts a pattern is a search box that can be handed a catastrophically backtracking one.",
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
                        "The strongest test here reads the field declarations straight out of the vendored ",
                        "upstream Java files and asserts that this package models ",
                        { strong: "every" },
                        " field on those classes, with ",
                        { strong: "no" },
                        " field it invented, and with every default equal. That is what makes the table above a ",
                        "claim rather than a hope: the schema cannot drift from upstream without the suite going ",
                        "red.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Every descriptor is checked against its own schema, so a field the GUI would never show and a control that would write a key BlueMap ignores are both build failures rather than surprises.",
                        "The HOCON reader and writer are tested for round-tripping: a parse and an unmodified write returns the original text, and a single-key edit changes only that key.",
                        "The CLI flag model is tested for the cases where flags cancel each other out, which is the whole reason the run screen states what will happen rather than listing what was ticked.",
                        "The interface package carries 311 tests and the config package 175, both running in CI on every push.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "The exit check has not run",
                    content: [
                        "The plan's criterion for this work is a round trip through the real thing: a config ",
                        "authored in the GUI, loaded by the upstream Java server, and compared value for value, ",
                        "plus every upstream template importing losslessly. That has not been run. Until it has, ",
                        "the schema is proved against upstream's ",
                        { em: "source" },
                        " and not against its ",
                        { em: "behaviour" },
                        ". See the ",
                        { link: "roadmap", href: ROADMAP_URL, external: true },
                        ".",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        "No config written by this GUI has been loaded by the upstream Java server and compared value for value.",
                        "The SQL connection test has not been exercised against a real database in CI.",
                        "The screens have not been captured at every supported width and display scale, so clipping at the longest localised strings is unproven rather than known good.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "java-render-path",
            reason: "What the config this GUI writes is actually handed to, and the flags the run screen composes.",
        },
        {
            articleId: "first-run-consent",
            reason: "The one setting this GUI refuses to render as a switch, and the surface that owns it.",
        },
        {
            articleId: "contract-regex-builder",
            reason: "The builder every search field on these screens opens, and what it is contracted to provide.",
        },
        {
            articleId: "contract-super-confirmation",
            reason: "The gate in front of deleting a map or a storage.",
        },
    ],

    sources: [
        { label: "packages/config", href: repoFile("design/packages/config") },
        { label: "packages/config/README.md", href: repoFile("design/packages/config/README.md") },
        {
            label: "packages/ui/src/components/config",
            href: repoFile("design/packages/ui/src/components/config"),
        },
        { label: "design/ROADMAP.md", href: ROADMAP_URL },
    ],
};

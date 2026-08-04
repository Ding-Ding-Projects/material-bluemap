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
        "The schema, the round-tripping HOCON editor, the seven screens and the main-process bridge that lets them touch a real folder are all built, and the editor is now reachable from the application itself. 176 tests cover the config package, 176 the editor's own interface modules and 75 the bridge, all running in CI. What has not run is the plan's exit check: a config authored here loaded by the real Java server and compared value for value.",

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
                    kind: "paragraph",
                    content: [
                        "It also has a door now, which it did not for most of its existence: the whole editor ",
                        "was built, tested and mounted nowhere. A third button in the application's own ",
                        "corner cluster opens it over the full window, Escape closes it, and focus returns to ",
                        "the button that opened it. It is reachable whether or not a map is open, because ",
                        "configuration is not a step in making a first map: it is how somebody points this at ",
                        "a folder BlueMap is already using, which is exactly the case where there is a map on ",
                        "screen already. The wizard behind it is left mounted and made inert rather than torn ",
                        "down, so somebody four steps in who opens the configuration to check a path does not ",
                        "come back to an empty first step.",
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
                            " Create, clone, rename and delete a map; add a file or an SQL storage; see which ",
                            "maps a storage is holding before removing it. The SQL connection test answers ",
                            "honestly about what this build can actually do, which is described below.",
                        ],
                        [
                            { strong: "The folder is a real folder on a real disk." },
                            " Choosing one opens the platform's own picker, reading it walks the folder and ",
                            "its maps and storages subfolders, and saving writes the files back. Nothing is ",
                            "cached between calls, which is what lets somebody edit a config in another ",
                            "program, come back, press Reload and see what is really there.",
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
                {
                    kind: "table",
                    caption: "The seven things the editor can ask the main process to do",
                    columns: ["Channel", "What it does"],
                    rows: [
                        [{ code: "config:readFolder" }, "Reads every config file in a folder, and in its maps and storages subfolders."],
                        [{ code: "config:writeFiles" }, "Writes a batch of files. Every path is checked before anything is written."],
                        [{ code: "config:deleteFiles" }, "Deletes files by name. A file that is already gone is not an error."],
                        [{ code: "config:pickDirectory" }, "Opens the platform's folder picker."],
                        [{ code: "config:pickFile" }, "Opens the platform's file picker, for a JDBC driver jar."],
                        [{ code: "config:testSqlConnection" }, "Answers what would happen if a connection were opened. See below."],
                        [{ code: "config:suggestFolder" }, "Where the application would keep a config folder if nobody chose one."],
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "What a file may be named",
                            description:
                                "Only the shapes BlueMap's own config loader recognises: core, webapp, webserver or plugin at the top of the folder, a map under maps, a storage under storages, with a .conf or .json suffix. That is deliberately tighter than refusing traversal. Refusing only the escapes would still let the editor be talked into overwriting a level.dat in a folder somebody pointed it at by mistake; refusing everything that is not a config file the editor models means the worst a wrong folder costs is a file that was already a config file.",
                        },
                        {
                            term: "A batch is all or nothing before it starts",
                            description:
                                "Every path in a save is checked before the first byte is written, so one bad name writes none of the others either. That is the difference between a refusal and a half-applied save, and it matters because the editor marks a save as done only when the whole batch resolves.",
                        },
                        {
                            term: "Where a folder is suggested",
                            description:
                                "Beside the rendered maps rather than inside them. A config folder holding a maps subfolder, sitting next to a maps folder full of tiles, is a pair of names nobody would untangle twice.",
                        },
                        {
                            term: "Caps",
                            description:
                                "512 files and four megabytes per file, both far above anything real, so that a folder which is not a config folder cannot turn a read into a file crawler or a write into a way to fill a disk.",
                        },
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "The SQL connection test refuses, and says why",
                    content: [
                        "A JDBC driver is a Java library. BlueMap loads the one named in its storage file inside ",
                        "its own virtual machine when it renders; the part of the application that would run ",
                        "this test is a Node process, and there is nothing in it to open the connection with. ",
                        "Shipping a MySQL, MariaDB, PostgreSQL and SQL Server client alongside a map renderer to ",
                        "answer a test button is not a trade this project made. So the button reports that the ",
                        "connection was not attempted and why, names the dialect it would have used, confirms ",
                        "the shape of the URL, and never claims a success nobody observed. The lookup is a seam ",
                        "rather than a constant, so a build that does carry a client can supply one, and both ",
                        "the success and the failure paths are covered by tests instead of by hope.",
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
                            term: "A name points outside the folder",
                            description:
                                "Refused, by the shape of the name rather than by resolving it. Nothing is joined onto the folder until the shape has been proved, so there is no moment at which a climbing path exists as a resolved path that only a later check would catch. Absolute paths are refused in the spelling they arrived in, because a drive letter, a network share and a leading slash are each absolute on some platform and this process may not be running on the one the sender had in mind.",
                        },
                        {
                            term: "A link is in the way",
                            description:
                                "Reading skips it, because a directory read never follows a link and a folder that cannot be descended is a folder with nothing in it. Writing cannot be silent about it the same way: the alternative is quietly creating a second maps folder beside the one somebody set up, so a link where a folder or a file should be is refused by name.",
                        },
                        {
                            term: "The folder is not there",
                            description:
                                "Rejected rather than answered with an empty listing. This folder holds no config and this folder is not there send somebody to two different places, and an editor shown an empty folder will cheerfully offer to create the maps that are already sitting in it.",
                        },
                        {
                            term: "A name Windows reserves for a device",
                            description:
                                "Refused. A file called CON is not a file on Windows, it is the console: opening it for writing succeeds, writes nothing to disk, and leaves the editor believing it saved a map. This is the one refusal here that protects against a mistake rather than an attack, and it costs nothing on the platforms where those names are ordinary.",
                        },
                        {
                            term: "A write fails",
                            description:
                                "The reason is reported verbatim rather than flattened to something went wrong. When a write fails because a folder is read-only, that sentence is the whole answer. Every reason is written for a person: read-only disk, no space left, another program holding the file open, an account that is not allowed to change it.",
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
                        "The folder somebody chose is the whole of the capability, and the interface cannot widen it. A compromised renderer naming a file inside that folder is an ordinary thing to imagine, and the name it sends is checked against the shapes BlueMap loads before any path is built from it.",
                        "Config text is parsed as data. Nothing in a config file is executed or evaluated, and the refused HOCON features are refused rather than partially implemented.",
                        "The SQL connection properties field is marked secret so it can be kept out of logs and exported diagnostics, and a connection result never repeats the URL back. A JDBC URL routinely carries a password in its query string, and that message is shown on screen, copied into issues and captured in screenshots; naming the dialect says what went wrong without carrying the credential along with it.",
                        "This build opens no database connection, so pressing the test button makes no outbound request at all. A build that supplied a driver would be making one deliberately, at the moment somebody pressed it, and nowhere else.",
                        "Errors cross the bridge as one sentence written for a person. Every rejection is rethrown as a fresh error, so a subsystem's stack, syscall or error code never becomes interface copy.",
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
                        "The bridge is tested without Electron anywhere near it, native picker included, because Electron arrives as a type and the dialog is a parameter. 75 tests cover it: every refused path shape, the link cases in both directions, the caps, the case-insensitive maps folder, and both answers the connection test can give.",
                        "176 tests cover the config package and 176 the editor's own modules in the interface package, all running in CI on every push.",
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
                        "No database connection has ever been opened, because this build carries no client to open one with. The refusal is tested; a successful connection is tested against a supplied driver rather than a real database.",
                        "Nobody has opened the editor from an installed build, chosen a folder BlueMap already uses, and saved into it by hand.",
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
        {
            articleId: "desktop-shell-chrome",
            reason: "The shell this editor opens inside, and the notification corner its saves report through.",
        },
    ],

    sources: [
        { label: "packages/config", href: repoFile("design/packages/config") },
        { label: "packages/config/README.md", href: repoFile("design/packages/config/README.md") },
        {
            label: "packages/ui/src/components/config",
            href: repoFile("design/packages/ui/src/components/config"),
        },
        {
            label: "packages/app/src/main/config/ipc.ts",
            href: repoFile("design/packages/app/src/main/config/ipc.ts"),
        },
        { label: "design/ROADMAP.md", href: ROADMAP_URL },
    ],
};

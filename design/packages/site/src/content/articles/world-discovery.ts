import type { Article } from "../types.js";
import { FINDING_WORLDS_DOC_URL, repoFile } from "../links.js";

export const worldDiscovery: Article = {
    id: "world-discovery",
    title: "Finding the worlds already on this computer",
    summary:
        "The first step of the make-a-map wizard finds the worlds already on this machine, from the default Minecraft installation and from any number of mounted folders, while every manual route (typing a path, browsing, dropping a folder) keeps working with nothing mounted at all.",
    category: "application",
    status: "shipped",
    statusNote:
        "main/world/locations.ts, mounts.ts, catalog.ts and inspect.ts are on the default branch, driving the wizard's first step, and are covered by their own test files plus the world list's keyboard and state tests. The platform-specific paths for the default installation are exercised with a fake platform, environment and home directory rather than the real operating system, because this repository has already shipped a path bug a real-OS test could not have reached.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Nothing has to be configured before the wizard shows a world. The default Minecraft ",
                        "installation is found on its own, and mounting more folders, typing a path, browsing ",
                        "for one, or dropping a folder onto the step all work beside it, none of them behind a ",
                        "disclosure.",
                    ],
                },
                {
                    kind: "table",
                    caption: "Where the default installation is looked for",
                    columns: ["Platform", "Path"],
                    rows: [
                        ["Windows", [{ code: "%APPDATA%\\.minecraft\\saves" }, ", falling back to the home directory when the variable is absent"]],
                        ["macOS", { code: "~/Library/Application Support/minecraft/saves" }],
                        ["Everywhere else", { code: "~/.minecraft/saves" }],
                        ["Portable build", [{ code: "<directory of the running executable>/.minecraft/saves" }, ", listed only when it really exists"]],
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "No MultiMC or Prism entry, on purpose",
                    content: [
                        "Their instance-root layouts could not be confirmed from anything in this repository, ",
                        "and a guessed root reports no worlds about a folder full of them, which is worse than ",
                        "not looking because it answers a question it was never asked. Mounting covers those ",
                        "installations properly instead.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "One machine commonly holds several installations: a vanilla one, a modded one, a ",
                        "launcher's instance tree, a copy on a second drive. Each can be mounted, and the list ",
                        "persists. Either level is accepted, ",
                        { code: ".minecraft" },
                        " or ",
                        { code: ".minecraft/saves" },
                        ", and what it resolved to is recorded and shown; a folder that is neither is refused ",
                        "by name, with the parent to mount instead. Mounting the same folder twice resolves to ",
                        "the row that already exists, and unmounting rewrites one JSON file and never opens the ",
                        "folder.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A world's name comes from ",
                        { code: "LevelName" },
                        " rather than the folder name, because those differ constantly. Underneath it is a real ",
                        "secondary line rather than a tooltip: last played, version, game mode, Hardcore, cheats, ",
                        "dimensions and their region files, size on disk, seed, the folder on disk when it differs ",
                        "from the name, and which mounted folder it came from, because two installations commonly ",
                        "hold worlds with the same name. The seed travels as decimal text rather than a JavaScript ",
                        "number, since a 64-bit seed does not survive one and a quietly wrong seed is worse than an ",
                        "absent one.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The list is sorted by last played, most recent first, across every mount, with unknown ",
                        "dates sorting last and ties broken by name. Its search is the project's own ",
                        "config search field with the anchored regex builder, over the name, the folder name, the ",
                        "full path, the mount label and every detail part, so typing a version, a game mode or an ",
                        "installation's name all find what somebody means.",
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
                        "The only persisted state is the mount list, and the only manual inputs are the three ",
                        "routes that bypass discovery entirely.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Mounted folders",
                            description:
                                "A named, ordered list stored under the app's own data directory, keyed by origin so a moved home directory keeps its name rather than being read as a new folder.",
                        },
                        {
                            term: "Typing a path or browsing for one",
                            description:
                                "Works with nothing mounted, and a dropped or picked folder that is already listed resolves to that row rather than appearing a second time.",
                        },
                        {
                            term: "Dropping a folder",
                            description: [
                                "Electron removed ",
                                { code: "File.path" },
                                " in v32, so the drop target resolves a dropped folder through ",
                                { code: "webUtils.getPathForFile" },
                                " in the preload rather than the renderer reading the path itself.",
                            ],
                        },
                        {
                            term: "The browse button",
                            description:
                                "Not specific to this wizard. Every field in the application that names a folder or a file on this computer offers the same button, writing into the field exactly as typing would, changing nothing on a cancelled dialog, and shown disabled with an explanation rather than hidden when there is no desktop app to open a native dialog with.",
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
                        "No Minecraft folder at all: reported by naming the paths it actually looked in, not a bare empty state.",
                        "Folders found but no worlds in them: reported by naming the real paths that were read.",
                        "A mount that has gone missing or is unreadable keeps its row and says so, because a folder on an unplugged external drive is not a folder somebody meant to forget.",
                        "A scan that fails for one folder reports on that folder's row while the other folders' worlds stay on screen.",
                        "A world whose level.dat cannot be read is still listed, with everything that was never in doubt and a note saying what is missing, never a guess and never a crash.",
                        "No bridge at all, such as a browser tab with no Electron behind it: the whole section is simply absent rather than showing a broken control.",
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
                        "Nothing is written by scanning. The only file this feature writes at all is the mount list under the app's own data directory, and unmounting rewrites that file and never touches the folder it pointed at.",
                        "Size is measured with a doubly bounded walk, so a save folder with a pathological structure cannot turn a scan into an unbounded traversal.",
                        "level.dat is skimmed rather than parsed whole: a one-pass reader recognises about a dozen names at two known paths and steps over everything else, including the dimension registry, which is the largest thing in a modern level.dat.",
                        "A malformed or hostile level.dat yields a listed world with missing details, never a crash and never an invented value.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "code",
                    language: "sh",
                    code: [
                        "cd design && npx vitest run packages/app/src/main/world      # discovery, level.dat, mounts, catalog",
                        "cd design && npx vitest run packages/ui/src/components/world # the list, its keyboard model, its states",
                    ].join("\n"),
                },
                {
                    kind: "paragraph",
                    content: [
                        { code: "locations.ts" },
                        " is tested with a fake platform, environment and home directory and no filesystem at ",
                        "all, so the Windows, macOS and portable layouts are exercised from any CI runner. The ",
                        "filesystem-touching tests use real temporary directories rather than a fake ",
                        { code: "fs" },
                        ", because a fake would decide the very questions worth asking.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The list itself is a real ",
                        { code: "listbox" },
                        ": ",
                        { code: "role=\"option\"" },
                        " rows, ",
                        { code: "aria-selected" },
                        " on the chosen world, one roving tab stop, arrow and paging keys stopping at the ends ",
                        "rather than wrapping, and an accessible name per option carrying the world name and the ",
                        "whole detail line. Focus and selection are kept separate on purpose: choosing a world runs ",
                        "a folder inspection, so arrowing down ninety rows must not start ninety of them.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "world-reading",
            reason: "What happens once a world is chosen here: the four layers that turn its files into typed data.",
        },
        {
            articleId: "bedrock-worlds",
            reason: "A folder this step lists that is not a Java world at all, and what the wizard does about it.",
        },
        {
            articleId: "regex-builder-surfaces",
            reason: "The search field this list embeds, and every other place the same builder appears.",
        },
    ],

    sources: [
        { label: "docs/finding-worlds.md", href: FINDING_WORLDS_DOC_URL },
        { label: "packages/app/src/main/world", href: repoFile("design/packages/app/src/main/world") },
        {
            label: "packages/ui/src/components/world/MinecraftWorldList.vue",
            href: repoFile("design/packages/ui/src/components/world/MinecraftWorldList.vue"),
        },
    ],
};

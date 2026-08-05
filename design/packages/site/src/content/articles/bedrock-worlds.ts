import type { Article } from "../types.js";
import { BEDROCK_WORLDS_DOC_URL, repoFile } from "../links.js";

export const bedrockWorlds: Article = {
    id: "bedrock-worlds",
    title: "Bedrock Edition worlds: detecting them, and converting them with Chunker",
    summary:
        "BlueMap renders Java Edition only, so a Bedrock Edition world is detected and named for what it is rather than reported as corrupt, and can then be converted to Java with Chunker's CLI, in bounded batches for worlds too large for one JVM, with every loss stated before the conversion runs.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "Detection, the Chunker driver, the fidelity briefing, provenance recording and batched conversion for large worlds are on the default branch, covered by 121 tests across seven files. None of those tests runs a real Chunker, a real JVM or a real Bedrock world: the process runner is injected throughout, so what is proven is the logic around the CLI rather than the CLI's own behaviour under real conversion.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The two editions look alike at a glance and share exactly one filename. Both have a ",
                        { code: "level.dat" },
                        ", which is why a Bedrock world used to reach the world list at all: it listed, the Java ",
                        "NBT reader failed on the header, and the row appeared with a parse error and no name, ",
                        "which reads as \"your world is corrupt\". It is not. It is the other edition, and that is ",
                        "a different sentence with a different next step.",
                    ],
                },
                {
                    kind: "table",
                    caption: "What tells the two editions apart",
                    columns: [" ", "Java Edition", "Bedrock Edition"],
                    rows: [
                        ["Chunk storage", [{ code: "region/*.mca" }, " (Anvil)"], [{ code: "db/" }, " (a LevelDB database)"]],
                        ["level.dat", "big-endian NBT, gzip", "little-endian NBT behind an 8-byte header"],
                        ["World name", { code: "LevelName" }, [{ code: "levelname.txt" }, ", plain UTF-8"]],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        { code: "main/bedrock/detect.ts" },
                        " answers the question properly instead: ",
                        { code: "certain" },
                        " for a ",
                        { code: "db" },
                        " directory holding real LevelDB files, or one beside a ",
                        { code: "levelname.txt" },
                        "; ",
                        { code: "likely" },
                        " for a bare ",
                        { code: "db" },
                        " directory beside a ",
                        { code: "level.dat" },
                        " with nothing else corroborating it. Java evidence always wins outright: any Anvil ",
                        "region file in any dimension settles the folder as Java no matter what else is beside ",
                        "it, because a mod, a datapack or a backup tool can leave a stray ",
                        { code: "db" },
                        " folder in a perfectly healthy Java world.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Conversion is an explicit step somebody starts. Nothing converts as a side effect of ",
                        "looking at a folder, because it produces a second, multi-gigabyte copy of a world. ",
                        "Before the button, the interface states where the copy goes (beside the original, never ",
                        "inside it), roughly how big it will be, that the original is never modified, what will ",
                        "be lost, and whether the world is large enough that it will probably fail, sized against ",
                        "the actual world in front of the person rather than stated in general.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Chunker",
                            description: [
                                "Hive Games' open-source Java/Bedrock converter, MIT licensed. It ships as an ",
                                "Electron app and as a standalone CLI jar; this app drives the CLI, about 30 MB, ",
                                "no installer, no native components.",
                            ],
                        },
                        {
                            term: "Why nothing is bundled",
                            description: [
                                "The licence permits bundling. This app does not, as a product decision rather ",
                                "than a licence restriction: 30 MB in every installer for a feature most people ",
                                "never use is a poor trade, and a bundled copy would pin a converter version to ",
                                "an app release when the converter tracks new Minecraft versions on its own ",
                                "schedule.",
                            ],
                        },
                        {
                            term: "What is lost",
                            description: [
                                "Entities other than paintings and item frames, and structure data such as ",
                                "villages, per Chunker's own README. This does not change what BlueMap draws, ",
                                "since BlueMap renders blocks rather than entities. Some blocks have no exact ",
                                "Java equivalent and are mapped to the closest approximation, and the conversion ",
                                "is a one-way snapshot, not a link back to the Bedrock world.",
                            ],
                        },
                        {
                            term: "Provenance",
                            description: [
                                { code: "bedrock-conversion.json" },
                                " is written inside every converted world, naming the converter, its version, ",
                                "the Java version used, the source world, when it ran and the fidelity notes in ",
                                "force at the time, because a converted world is otherwise indistinguishable from ",
                                "a native Java one by inspection.",
                            ],
                        },
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Exit code zero does not mean it worked",
                    content: [
                        "Three of Chunker's failure paths print to stderr and then return normally, so the ",
                        "process exits 0. This app therefore requires all three of exit code 0, the completion ",
                        "line on stdout, and an output directory verified to hold an actual Java world before ",
                        "reporting success.",
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
                            term: "Where Chunker is found",
                            description:
                                "In order: a jar path configured in settings, the CHUNKER_CLI_JAR environment variable, then a copy this app downloaded into its own data directory. A configured path that does not exist is reported, never silently replaced with another copy.",
                        },
                        {
                            term: "Java",
                            description:
                                "Chunker needs Java 17 or higher, and this app reuses the provisioned Temurin JDK it already carries for the Java render path rather than adding a second Java story.",
                        },
                        {
                            term: "Downloaded jars",
                            description:
                                "Checked against a SHA-256 pinned in this app's source and reviewed like any other code. Chunker publishes no detached signature or artifact attestation for the CLI jar, so a digest fetched from the releases API is labelled a weaker guarantee than the pinned one, and the two are never shown as though they meant the same thing.",
                        },
                        {
                            term: "Target format",
                            description:
                                "Defaults to a modern Java identifier BlueMap has long read, rather than the newest format Chunker offers. An unknown identifier is rejected by Chunker with the list of valid values, which this app reports rather than swallowing.",
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
                    kind: "table",
                    caption: "The exit codes worth reading",
                    columns: ["Code", "Meaning", "What the app says"],
                    rows: [
                        ["0", "Only trustworthy alongside the other two checks above", "success, if all three checks pass"],
                        ["1", "The conversion threw, including most out-of-memory deaths", "out-of-memory when the output carries an OOM signature, otherwise chunker-failed"],
                        ["2", "A usage error", "bad-invocation: this app built the command line wrong"],
                        ["12", "OutOfMemoryError on Chunker's main thread only", "out-of-memory"],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Memory grows without bound on larger worlds",
                    content: [
                        "Past roughly 200 MB of source world, Chunker's memory use climbs until the JVM dies. ",
                        "This figure is this project's own observation from running Chunker rather than ",
                        "something upstream documents, and the copy never suggests a bigger heap as the fix, ",
                        "because a larger heap only changes when the failure arrives, not whether it does.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "A world past the memory threshold is offered batched conversion instead: whole 32 by 32 regions, each converted with pruning boxes grown by one chunk so every block's neighbour-derived connection state (fences, stairs, doors and the like) is decided with complete information, then only the batch's own region files are kept and the margin files discarded.",
                        "A staging directory named with a .converting suffix holds the work in progress and is renamed to the real name only after the output is verified to hold a level.dat and at least one region file, so a cancelled conversion, a crashed JVM or a lost-power machine never leaves something that looks like a finished world.",
                        "A stale staging directory left by an earlier attempt is deleted rather than converted into, because writing into it would mix two unrelated conversions and still pass verification.",
                        "Cancellation ends the JVM directly. There is nothing to flush and nothing to lose, because a half-written Java world is worthless and is exactly why it is written under a staging name.",
                        "Chunker not installed, a configured jar missing, no Java 17 or higher, and a folder that is actually already a Java world are all reported by name before anything runs, never silently substituted or ignored.",
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
                        "The original Bedrock world is only ever passed as Chunker's input flag. Nothing in this feature writes to it, and the converted copy goes to a sibling directory.",
                        "The CLI is spawned directly with no shell in between, so the cancel path kills the JVM itself rather than a shell that could leave a detached JVM writing gigabytes into somebody's disk.",
                        "Downloaded jars are verified before use, against a digest pinned in source, with the limits of that assurance stated plainly rather than glossed over.",
                        "levelname.txt is bounded and cut at the first line break when read for the world list, since nothing stops a corrupt or hostile save shipping far more than a name under that filename.",
                        "Every IPC handler returns a value, including every refusal, because a rejected invoke arrives in the renderer with a message Electron's serialisation has mangled into something nobody can act on.",
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
                    caption: "From design/",
                    code: ["npx vitest run packages/app", "npx tsc -p packages/app --noEmit", "npx eslint packages/app"].join("\n"),
                },
                {
                    kind: "paragraph",
                    content: [
                        "The Bedrock suites are 121 tests across seven files, and none of them needs Chunker, ",
                        "a JVM or a Bedrock world on disk: the process runner is injected, and detection runs ",
                        "against fixtures built from empty files, because a Bedrock world's shape is the whole ",
                        "of what detection reads. Detection, the CLI contract, the zero-exit failure paths, ",
                        "out-of-memory recognition, batching's margin geometry and its resumable staging are ",
                        "each their own colocated test file.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Not verified against real Chunker or a real Bedrock world",
                    content: [
                        "No end-to-end conversion of a real Bedrock world has been run in this repository, ",
                        "because that needs a Bedrock world, a 30 MB third-party download and a JVM, none of ",
                        "which belong in the test suite. The CLI contract driven here, its flags, its progress ",
                        "format, its exit codes and its three zero-exit failure paths, was read from Chunker's ",
                        "own source rather than observed. On batching specifically, the mechanism is proven ",
                        "from source but no batched world has been produced and inspected here, so whether a ",
                        "one-chunk margin is genuinely sufficient rests on reading the handlers rather than on ",
                        "a side-by-side comparison against a single-pass conversion.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "world-discovery",
            reason: "The wizard step this detection is wired into, and everything else that step already does.",
        },
        {
            articleId: "java-render-path",
            reason: "The Java toolchain this feature reuses rather than provisioning a second one for Chunker.",
        },
        {
            articleId: "github-sign-in",
            reason: "The other place this project verifies a third-party download by a pinned digest before trusting it.",
        },
    ],

    sources: [
        { label: "docs/bedrock-worlds.md", href: BEDROCK_WORLDS_DOC_URL },
        { label: "packages/app/src/main/bedrock", href: repoFile("design/packages/app/src/main/bedrock") },
        {
            label: "packages/ui/src/components/world/BedrockConversionNote.vue",
            href: repoFile("design/packages/ui/src/components/world/BedrockConversionNote.vue"),
        },
    ],
};

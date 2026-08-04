import type { Article } from "../types.js";
import { PLAN_URL, ROADMAP_URL, UPSTREAM_URL, issue, repoFile } from "../links.js";

export const javaRenderPath: Article = {
    id: "java-render-path",
    title: "The Java render path",
    summary:
        "How a world on your disk becomes tiles you can open: upstream BlueMap's own Java engine, built from vendored source and driven by the app as a child process, until the TypeScript mesher can replace it.",
    category: "engine",
    status: "ported-unverified",
    statusNote:
        "Every part of this is written and unit tested, and a real 961-tile render has been produced by hand on one Windows machine. It has not run in CI, on macOS or on Linux, and the render was driven by invoking the jar directly rather than through the app.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "This project is a port of BlueMap into TypeScript, and the part that turns blocks into ",
                        "geometry is the largest and hardest piece of it. Until that mesher is finished, the app ",
                        "can read a world, resolve its textures and serve a map it did not make, and render ",
                        "nothing at all. So it renders with upstream's engine instead: the real BlueMap command ",
                        "line renderer, built from the vendored source, launched as a child process and driven by ",
                        "the app. That is decision D17, and it is written down rather than quietly assumed.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "Consent first." },
                            " Before a workspace is created, before a JDK is looked for, before a jar is resolved ",
                            "and long before anything is spawned. A person who has not accepted the Mojang ",
                            "download cannot reach a state where a client jar is being fetched on their behalf, ",
                            "and the answer arrives instantly rather than after a toolchain probe.",
                        ],
                        [
                            { strong: "A JVM is found, or fetched." },
                            " The environment's ",
                            { code: "JAVA_HOME" },
                            " first, then ",
                            { code: "java" },
                            " on the path, then the copy the app installed for itself. Every candidate is run ",
                            "rather than trusted by its path.",
                        ],
                        [
                            { strong: "The jar is resolved." },
                            " In a packaged app it is a bundled resource; in a checkout it is whatever the build ",
                            "script last staged, or what Gradle left behind. The version is read off the file ",
                            "name, which upstream's build writes from ",
                            { code: "git describe" },
                            ".",
                        ],
                        [
                            { strong: "A config directory is written." },
                            " ",
                            { code: "core.conf" },
                            ", ",
                            { code: "webapp.conf" },
                            ", ",
                            { code: "webserver.conf" },
                            ", one file per map and one per storage. Every path in it is absolute.",
                        ],
                        [
                            { strong: "The CLI runs, and is read as it goes." },
                            " Its log is its only progress channel, so every line is parsed and forwarded as it ",
                            "arrives. A render takes minutes; a spinner for four minutes is indistinguishable ",
                            "from a hang.",
                        ],
                        [
                            { strong: "The output is served like any other map." },
                            " A finished render is a static web root, mounted at a local path the viewer treats ",
                            "exactly as it treats a remote server. The viewer cannot tell the difference, which ",
                            "is the point.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Progress lines look like ",
                        { code: "[11:28:40 INFO] updating map 'overworld': 25.663% (ETA: 47 seconds)" },
                        ", printed on a ten-second timer, which is why a map can finish without ever reporting ",
                        "100%. The parser was written against output captured from a real render rather than ",
                        "against the shape a console log usually has, and nothing in it waits for a map to reach ",
                        "the end of the scale.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Every render writes a ",
                        { code: "render.json" },
                        " beside its output naming the engine, its version and the JVM that ran it, before the ",
                        "render starts and again when it ends. Written before, deliberately: a record that only ",
                        "appears on success cannot explain a folder full of half-written tiles, which is exactly ",
                        "the folder somebody asks about.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "That record is also what the run panel reads. Every ending, whether the render ",
                        "finished, failed or was stopped, names the engine that produced it, and it prefers the ",
                        { code: "render.json" },
                        " on disk over the description the events carried: the record is what actually wrote ",
                        "the tiles, and the expectation is only what was about to run. Where there is no record ",
                        "the panel falls back to that expectation and words it differently, rather than naming ",
                        "an engine on the strength of what was expected. The application's own version is shown ",
                        "on its information page for the same reason, so a support question can be answered ",
                        "from the screen rather than guessed at.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "The TypeScript engine is still the destination",
                    content: [
                        "The mesher keeps being written, and takes over when its decompressed tile bytes are ",
                        "identical to the Java engine's and its lowres images match pixel for pixel. Nothing ",
                        "switches silently: the app says which engine rendered a map. See the ",
                        { link: "roadmap", href: ROADMAP_URL, external: true },
                        " and ",
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
                    kind: "definitions",
                    items: [
                        {
                            term: "Mojang download consent",
                            description:
                                "Upstream's accept-download, which is Mojang EULA acceptance. Asked once during first-run setup and remembered. Without it there is no render, because the engine cannot texture a map without the client jar.",
                        },
                        {
                            term: "Java runtime",
                            description:
                                "Found on the machine or installed by the app into its own data directory. Upstream pins Java 25, so anything older is rejected with the version it actually reported rather than a generic failure.",
                        },
                        {
                            term: "Map storage directory",
                            description:
                                "Where renders are written. One directory per render, holding its config, its data, its web root and its provenance record. Chosen during setup and changeable afterwards.",
                        },
                        {
                            term: "Per-map settings",
                            description:
                                "World folder, display name, dimension, sort order and start position. Everything not set keeps upstream's default rather than being restated, so a config file never silently pins a default that upstream later changes.",
                        },
                        {
                            term: "Render flags",
                            description:
                                "Force a full re-render rather than only what changed, fix map edges, turn on upstream's metrics, choose a thread count. They map onto the CLI's own flags.",
                        },
                    ],
                },
                {
                    kind: "code",
                    language: "sh",
                    caption: "Building the engine and rendering by hand, which is how the figures below were obtained",
                    code: [
                        "cd vendor/BlueMap",
                        "GRADLE_USER_HOME=../../tools/oracle/.gradle ./gradlew :cli:shadowJar",
                        "#  -> implementations/cli/build/libs/cli-5.22-27-shadow.jar",
                        "",
                        "cd <an empty scratch directory>",
                        "java -jar <absolute path to the jar> -c <absolute config dir>",
                        "#  writes core.conf, webapp.conf, webserver.conf, maps/*.conf, storages/*.conf",
                        "#  set accept-download: true, and make every path absolute",
                        "java -jar <absolute path to the jar> -c <absolute config dir> -r -g",
                    ].join("\n"),
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "The working directory is load-bearing",
                    content: [
                        "The CLI resolves its storage root and data folder relative to its ",
                        { strong: "working directory" },
                        ", not to the config folder. Running it from the repository root once wrote 47 MB of ",
                        "tiles into a top-level ",
                        { code: "/web" },
                        " and a 38 MB Mojang client jar into a top-level ",
                        { code: "/data" },
                        ". Both defences are in place independently: every path the app writes is absolute, and ",
                        "the child process is given a deliberate working directory inside the render workspace.",
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
                        "Every failure is a code with a remedy attached, not a sentence the interface has to ",
                        "match on. Where a setting fixes it, the failure carries that setting, because a report ",
                        "saying what is wrong and not where to change it is a dead end at the exact moment ",
                        "somebody knows what they want to do.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Consent has not been given",
                            description:
                                "Nothing is spawned and nothing is downloaded. The failure names the settings row that grants it and says why it was opened. It never puts a licence in front of somebody who is halfway through choosing a world.",
                        },
                        {
                            term: "No usable Java",
                            description:
                                "The rejections are collected rather than discarded, so the report says JAVA_HOME points at Java 17 rather than no Java found on a machine with three JDKs on it.",
                        },
                        {
                            term: "The jar is missing",
                            description:
                                "In a checkout that usually means it has not been built yet, and the message says so rather than reporting a missing file the reader has never heard of.",
                        },
                        {
                            term: "A world folder does not exist",
                            description:
                                "Checked before the engine is launched, so a typo is caught in a second rather than after a JVM starts and fails on its own terms.",
                        },
                        {
                            term: "The CLI rendered nothing and exited zero",
                            description:
                                "Its own success path. A misconfigured map makes it print a warning, then start updating 0 maps, then report that maps are up to date, and exit 0. That is treated as a failure with its own code, because trusting the exit code would report a render that produced no tiles as a completed render.",
                        },
                        {
                            term: "The render is cancelled",
                            description:
                                "The child is asked politely first and killed only if it is still there. On Windows there are no POSIX signals, so the first step already ends it and the engine's shutdown sequence does not run; on platforms that deliver signals, the wait is what buys the tiles already rendered. Either way no finished work is lost, because storage is incremental and the next render resumes from what is on disk.",
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
                        "Minecraft assets are never redistributed. The client jar is downloaded by the engine at runtime, only after explicit consent, and nothing extracted from it is committed to this repository.",
                        "The consent check happens in one place, before anything is spawned. It is not re-decided in the config writer, the runner or the orchestrator, so there is no path where four agreeing checks become three.",
                        "The CLI is spawned directly, with no shell between this process and the JVM. A shell would sit in the middle of the process tree, and cancelling would kill the shell and leave a detached JVM writing into somebody's disk with nothing holding a handle to it.",
                        "A provisioned JDK is verified before use: the SHA-256 comes from the same API response that carried the download link, and is checked against the finished file before a single byte is extracted. There is no path that installs an artefact whose digest was missing, unparseable or wrong.",
                        "Nothing machine-wide is touched. A provisioned JDK lives under the app's own data directory: no registry key, no PATH edit, no installer, no elevation, and a JDK the user installed themselves is never modified or shadowed.",
                        "Config values are escaped as JSON strings, which is exactly what HOCON quoted strings are. An unescaped Windows path is a parse error waiting to happen, because a drive-letter path contains sequences that are not valid escapes.",
                        "The local map handler serves only the webapp settings file and the tiles beneath it. Upstream's own webapp, including the PHP reference implementation it ships, is left in the render directory and is not reachable through the handler.",
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
                        "The unit tests cover the parser against captured real output, the config writer against ",
                        "a real Windows path, the runner against a real child process, the orchestrator's ordering ",
                        "of consent and engine resolution, the provenance record, and the whole Java toolchain ",
                        "layer against fakes. The app package carries 286 tests, and they run in CI on every push.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The end-to-end evidence is one render, done by hand: upstream's ",
                        { code: "cli-5.22-27-shadow.jar" },
                        ", 6.4 MB, built in 34 seconds warm, rendering a generated 1000x1000 world to ",
                        { strong: "961 hires tiles" },
                        " plus lowres images and a texture index, in 80 seconds.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What that render does not prove",
                    content:
                        "It was produced by invoking the jar directly on one Windows machine, not by asking the app to render. Reproducing it through the app's own orchestrator, from a request to tiles opened in the viewer, is the next piece of evidence and it does not exist yet.",
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        "The render path has not run in CI, on macOS or on Linux.",
                        "JDK provisioning is tested against fakes only. No real Temurin archive has been resolved, downloaded, verified and extracted by this code on a machine with no JDK.",
                        [
                            "Only ",
                            { code: ":cli:shadowJar" },
                            " has been built by hand. A reusable workflow that builds all seven implementations ",
                            "and attaches them to the release is on the branch, and this article does not claim a ",
                            "green run of it.",
                        ],
                        [
                            "Oracle validation of the TypeScript engine against this one has not run. It is ",
                            { link: "tracked as issue 3", href: issue(3), external: true },
                            " and is the gate the mesher has to pass.",
                        ],
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "first-run-consent",
            reason: "The decision this path checks before it does anything. Read it to see why a render never asks.",
        },
        {
            articleId: "options-gui",
            reason: "Where the config this path writes can be edited by hand, key by key, with the CLI flags beside it.",
        },
        {
            articleId: "world-reading",
            reason: "The TypeScript side of the same job: reading the world this engine renders.",
        },
        {
            articleId: "test-world-generator",
            reason: "Where the 1000x1000 world in the figures above came from, and how to reproduce it.",
        },
    ],

    sources: [
        {
            label: "packages/app/src/main/render",
            href: repoFile("design/packages/app/src/main/render"),
        },
        { label: "packages/app/src/main/java", href: repoFile("design/packages/app/src/main/java") },
        { label: "design/docs/decisions.md", href: repoFile("design/docs/decisions.md") },
        { label: "design/ROADMAP.md", href: ROADMAP_URL },
        { label: "plan.md", href: PLAN_URL },
        { label: "Upstream BlueMap", href: UPSTREAM_URL },
    ],
};

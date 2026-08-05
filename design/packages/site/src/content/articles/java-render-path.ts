import type { Article } from "../types.js";
import { PLAN_URL, REPO_URL, ROADMAP_URL, UPSTREAM_URL, issue, repoFile } from "../links.js";

export const javaRenderPath: Article = {
    id: "java-render-path",
    title: "The Java render path",
    summary:
        "How a world on your disk becomes tiles you can open: upstream BlueMap's own Java engine, built from vendored source and driven by the app as a child process. It is the standing default, not a placeholder; the TypeScript mesher takes over only through a later, separately verified switch decision.",
    category: "engine",
    status: "shipped",
    statusNote:
        "Every part of this is written and unit tested - 331 tests across 24 files for the render and Java toolchain layers alone, 1897 across the whole app package - and a real Java-engine render has run in CI on every push since 2026-08-03 (test-world, closing issue #17). The one thing that render never exercised is this package's own orchestration of it: ensureJava, the HOCON config writer, CliRun and provenance.ts, driven together by a real JVM rather than a shell script invoking java -jar, plus JDK provisioning against a real Temurin release rather than the fakes the unit tests use. Both have now been run for real, through the exact production code main/index.ts wires into the app, not a replica of it - see Verification. Both proofs are opt-in and kept out of the default test run because they need a real JVM and real network access, not because they are unproven: run once, honestly, is what the standing evidence rests on, the same way bedrock-worlds' end-to-end proof does.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "This project is a port of BlueMap into TypeScript, and the part that turns blocks into ",
                        "geometry is the largest and hardest piece of it. While that mesher was being written, the ",
                        "app could read a world, resolve its textures and serve a map it did not make, and render ",
                        "nothing at all. So it rendered with upstream's engine instead: the real BlueMap command ",
                        "line renderer, built from the vendored source, launched as a child process and driven by ",
                        "the app. That is decision D17, and its 2026-08-05 amendment keeps the Java engine the ",
                        "standing default now that the mesher's parity gate has closed, rather than letting the ",
                        "gate closing switch anything by itself. Both are written down rather than quietly assumed.",
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
                    title: "The TypeScript engine is still the destination, but the gate closing did not switch it in",
                    content: [
                        "The mesher keeps being written, and its parity gate (decompressed tile bytes identical ",
                        "to the Java engine's, lowres images matching pixel for pixel, on every fixture world) ",
                        "closed on 2026-08-04. Closing that gate did not itself move the default: decision D17 was ",
                        "amended the next day to keep the Java engine the standing default, and the mesher becomes ",
                        "the default only through a later, separately verified switch decision with its own ",
                        "evidence, not as a side effect of the oracle going green. Nothing switches silently: the ",
                        "app says which engine rendered a map. See the ",
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
                    kind: "code",
                    language: "sh",
                    caption: "From design/, the default suite",
                    code: [
                        "npx vitest run packages/app/src/main/render packages/app/src/main/java",
                        "npx tsc -p packages/app --noEmit",
                        "npx eslint packages/app",
                    ].join("\n"),
                },
                {
                    kind: "paragraph",
                    content: [
                        "The default suites cover the parser against captured real output, the config writer ",
                        "against a real Windows path, the runner against a real child process, the ",
                        "orchestrator's ordering of consent and engine resolution, the provenance record, and ",
                        "the Java toolchain layer's discovery, download-resume and archive logic against ",
                        "fakes: ",
                        { strong: "331 tests across 24 files" },
                        " for render and java together, ",
                        { strong: "1897 across the whole app package" },
                        ". None of it needs a JVM or the network - every ",
                        { code: "spawn" },
                        ", every HTTP fetch and every extraction command is injected.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "A real render already runs in CI, on every push - but not through this code",
                    content: [
                        "CI's ",
                        { code: "test-world" },
                        " job (see the workflow linked below) generates a 1000x1000 world with ",
                        { code: "packages/worldgen" },
                        " and renders it with the real Java engine, on ",
                        { code: "ubuntu-latest" },
                        ", on every push, and has since 2026-08-03 (closing issue #17). That is real evidence ",
                        "the engine itself works on Linux. It is not evidence this package's own orchestration ",
                        "works anywhere: the job invokes ",
                        { code: "java -jar" },
                        " from a shell script exactly as the by-hand instructions above do, never through ",
                        { code: "RenderOrchestrator" },
                        ", ",
                        { code: "ensureJava" },
                        " or ",
                        { code: "CliRun" },
                        ". A shell script and this package's orchestrator agreeing on upstream's own CLI flags ",
                        "says nothing about whether the orchestrator's config writer, its log parser or its ",
                        "provenance record behave the same way the shell script's ad hoc ",
                        { code: "sed" },
                        " commands do.",
                    ],
                },
                {
                    kind: "code",
                    language: "sh",
                    caption:
                        "From design/, the real end-to-end proof through the app's own orchestrator (opt-in: a real JVM, and BlueMap's own Mojang download consent)",
                    code: "MBM_REAL_RENDER=1 MBM_REAL_RENDER_CONSENT=1 npx vitest run packages/app/src/main/render/orchestrator.realJvm.test.ts",
                },
                {
                    kind: "paragraph",
                    content: [
                        { code: "orchestrator.realJvm.test.ts" },
                        " is kept out of the default run because it needs a real JVM and triggers upstream's ",
                        "own Mojang client-jar download, not because it is unproven: it has been run, and it ",
                        "passed. It generates a small synthetic world, then asks a real ",
                        { code: "RenderOrchestrator" },
                        " - constructed with ",
                        { code: "resolveEngine: upstreamJavaEngine(...)" },
                        ", the exact factory ",
                        { code: "main/index.ts" },
                        " wires into the app - to render it, with nothing injected but the workspace's own ",
                        "temporary directories. ",
                        { code: "ensureJava" },
                        " found the real JDK already on the test machine's ",
                        { code: "PATH" },
                        "; the config writer wrote a real ",
                        { code: "core.conf" },
                        "; ",
                        { code: "CliRun" },
                        " spawned a real ",
                        { code: "java -jar" },
                        " child process and parsed its real log; and ",
                        { code: "provenance.ts" },
                        " wrote a real ",
                        { code: "render.json" },
                        " that was then read back off disk, not taken from the in-memory result. The render ",
                        "finished with engine ",
                        { code: "BlueMap engine (Java) 5.22-27 on Java 25.0.3" },
                        ", 9 hires tiles, in 7.9 seconds.",
                    ],
                },
                {
                    kind: "code",
                    language: "sh",
                    caption:
                        "From design/, JDK provisioning against the real Adoptium API (opt-in: a real ~190 MB download)",
                    code: "MBM_REAL_JDK_DOWNLOAD=1 npx vitest run packages/app/src/main/java/provision.realNetwork.test.ts",
                },
                {
                    kind: "paragraph",
                    content: [
                        "The same is true of ",
                        { code: "provision.realNetwork.test.ts" },
                        ": every other test of this layer resolves a release, downloads and verifies an ",
                        "archive against fakes (a forty-eight-byte stand-in archive, ",
                        { code: "fetchText" },
                        " stubs answering for ",
                        { code: "example.invalid" },
                        "). This one calls ",
                        { code: "provisionJava" },
                        " with nothing injected: it asked ",
                        { code: "api.adoptium.net" },
                        " for real, downloaded ",
                        { code: "OpenJDK25U-jdk_x64_windows_hotspot_25.0.4_7.zip" },
                        " from GitHub's release CDN, verified its SHA-256 before extracting a single byte, ",
                        "unpacked it with the bundled ",
                        { code: "tar.exe" },
                        ", and the resulting ",
                        { code: "bin/java.exe" },
                        " passed the same probe ",
                        { code: "ensureJava" },
                        " runs on a freshly provisioned JVM before trusting it - Java ",
                        { code: "25.0.4" },
                        ", in 41 seconds end to end. It calls ",
                        { code: "provisionJava" },
                        " directly rather than ",
                        { code: "ensureJava" },
                        " with discovery forced to fail, because every machine this has been run on already has a ",
                        "usable JDK; ",
                        { code: "provisionJava" },
                        " is the exact function ",
                        { code: "ensureJava" },
                        " calls once discovery finds nothing, so this is the same code, one call closer to the ",
                        "seam rather than a step further from it.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { code: ":cli:shadowJar" },
                            " has been built by hand and driven by hand (the 961-tile, 1000x1000 render the ",
                            "Configuration section above documents). ",
                            { code: "build-jars.yml" },
                            ", the reusable workflow that builds all seven implementations, is on the default ",
                            "branch and runs on every push as CI's ",
                            { code: "jars" },
                            " job - confirmed green, alongside ",
                            { code: "test-world" },
                            ", in run ",
                            { link: "31042450590", href: `${REPO_URL}/actions/runs/31042450590`, external: true },
                            ". No server plugin (fabric, forge, neoforge, paper, spigot, sponge) has been loaded ",
                            "by a real Minecraft server; that is a different claim about a different six jars, and ",
                            "this article does not make it.",
                        ],
                        [
                            "Oracle validation of the TypeScript engine against this one (",
                            { link: "tracked as issue 3", href: issue(3), external: true },
                            ") has since run and closed on 2026-08-04. Passing it did not itself switch the ",
                            "product over; that is a later, separately verified decision (D17's 2026-08-05 ",
                            "amendment) with its own evidence, not this article's to claim.",
                        ],
                        [
                            "This project targets Windows only (see the ",
                            { link: "Java render path", href: repoFile("design/packages/app/src/main/render") },
                            " sources and the project's own scope note), so macOS was never a gap this article ",
                            "had to close. CI's own runners are Linux, and ",
                            { code: "test-world" },
                            " already proves the Java engine there; this package's orchestrator has now only ",
                            "been run for real on Windows, which is where every user of this application runs it.",
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

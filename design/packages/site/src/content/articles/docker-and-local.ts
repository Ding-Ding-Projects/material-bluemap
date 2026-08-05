import type { Article } from "../types.js";
import { DOCKER_AND_LOCAL_DOC_URL, repoFile } from "../links.js";

export const dockerAndLocal: Article = {
    id: "docker-and-local",
    title: "Choosing where the engine runs: this machine, or a container",
    summary:
        "Rendering and the map web server can run as a program on this computer, or the same jar and the same arguments inside a Docker container, with identical reporting either way.",
    category: "application",
    status: "shipped",
    statusNote:
        "The probe, the mount planning, the process handling, the config writer, the web server binding and the reattachment machinery are built and covered by 126 tests in design/packages/app/src/main/runtime/, none of which need Docker installed. Nobody has run a real render against a real Docker daemon from a packaged build, so that end-to-end path is unverified even though every piece of it is.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Local is the default and needs nothing beyond what the app already manages: the ",
                        "BlueMap engine runs as a program on this computer, on the Java runtime the app found ",
                        "or installed. Docker is opt-in, offered only when it is genuinely usable, and runs ",
                        "the same jar with the same arguments inside a container instead.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Everything the local path reports, the Docker path reports identically: phases, ",
                        "per-map progress with an estimate, every log line, every warning banner, the ",
                        "outcome and cancellation. That is not a promise kept by writing the same code ",
                        "twice: both modes produce the same ",
                        { code: "EngineLaunch" },
                        " and are run by the same ",
                        { code: "EngineProcess" },
                        ", reading output through the same parser, so there is no second path for the ",
                        "reporting to differ on.",
                    ],
                },
                {
                    kind: "table",
                    caption: "What Docker changes, and what it does not",
                    columns: [" ", "Local", "Docker"],
                    rows: [
                        ["Isolation from this computer", "none beyond the account's own", "the container sees the world (read-only), the output folder, the config and the jar, and nothing else"],
                        ["Java version", "whatever the app found or installed", "whatever the image ships, independent of this computer"],
                        ["Needs a JDK on this machine", "yes", "no"],
                        ["Speed", "the machine's own", "the same machine, usually slower"],
                        ["Needs a daemon running", "no", "yes"],
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Docker is not a speed feature",
                    content: [
                        "Docker does not give a render more CPU, more memory or a faster disk; it runs on ",
                        "the same hardware, and on Windows and macOS it runs inside a Linux virtual machine ",
                        "and reaches the world folder through a file-sharing layer that is measurably ",
                        "slower for a large world than reading it directly. What it is genuinely good for ",
                        "is rendering on a machine with no Java, rendering on a Java version this computer ",
                        "does not have, and keeping the engine away from everything on the disk that is ",
                        "not a map.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Docker's own state is never cached, because Docker Desktop is started and stopped ",
                        "while the app is open, and an answer kept from launch would be wrong exactly when ",
                        "somebody has just started Docker and pressed the button again. The probe ",
                        "(",
                        { code: "docker version --format {{json .}}" },
                        ") resolves to one of five states each time it is asked: ",
                        { code: "available" },
                        ", ",
                        { code: "daemon-unreachable" },
                        ", ",
                        { code: "refused" },
                        ", ",
                        { code: "not-installed" },
                        " or ",
                        { code: "unusable" },
                        ", each with its own sentence rather than one generic \"Docker is not available\".",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Quitting the app does not stop a running container. The daemon owns the ",
                        "container's lifetime, so on the next launch, or whenever asked, the app puts the ",
                        "container's recorded name to the daemon and reattaches a still-running render, ",
                        "collects the output of one that finished while the app was away, or leaves the ",
                        "record alone when the daemon itself did not answer. This is the same picture the ",
                        "remote SSH route uses one machine further away.",
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
                            term: "What gets mounted",
                            description: [
                                "Exactly five sources: the config folder (read-write), the data folder ",
                                "(read-write), the web output folder (read-write), the engine jar (read-only) ",
                                "and each world folder (read-only). Nothing else can be added from the ",
                                "interface.",
                            ],
                        },
                        {
                            term: "The image",
                            description: [
                                "A stock ",
                                { code: "eclipse-temurin:25-jre" },
                                " by default. The jar is mounted rather than baked into an image, so which ",
                                "engine rendered a map stays a question about the jar's own version rather ",
                                "than about a container tag.",
                            ],
                        },
                        {
                            term: "The web server",
                            description: [
                                "Local binds ",
                                { code: "127.0.0.1:<port>" },
                                " directly. Docker binds ",
                                { code: "0.0.0.0:<containerPort>" },
                                " inside the container and publishes it with ",
                                { code: "-p 127.0.0.1:<hostPort>:<containerPort>" },
                                ", so the address reachable from outside is loopback either way. A URL is ",
                                "reported only after the app has opened a real connection to it, never from ",
                                "a log line or a still-running process alone.",
                            ],
                        },
                        {
                            term: "Cancelling and picking a container back up",
                            description: [
                                "A local cancel is SIGINT with an escalation to SIGKILL. A container is ",
                                "asked with ",
                                { code: "docker stop --time 8 <name>" },
                                ", and started with ",
                                { code: "--init" },
                                " so that SIGTERM actually reaches the JVM. Every container is named before ",
                                "it starts, and that name is written to ",
                                { code: "container.json" },
                                " beside the render before the launch, so a container can be found again ",
                                "after the app closes and reopens.",
                            ],
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
                            term: "Docker is not installed, or its daemon is not running",
                            description:
                                "Reported with a distinct sentence for each, and no suggestion to install anything when the daemon is simply not running. Local rendering still works and needs neither.",
                        },
                        {
                            term: "A world folder may not be mounted",
                            description:
                                "The launch is refused with the reason before anything starts. A home directory, a drive root, a filesystem root and the well-known system folders are refused the same way, and the refusal is reported rather than silently dropped.",
                        },
                        {
                            term: "The container is killed for using too much memory",
                            description: "Exit 137, read by the automatic repair pass as an out-of-memory kill even though the JVM itself printed nothing.",
                        },
                        {
                            term: "The app closes while a container is rendering",
                            description:
                                "The container carries on. The next launch offers to pick it up by name rather than starting a second one beside it, and a daemon that does not answer is never read as a container that has gone.",
                        },
                        {
                            term: "The daemon is down when the app looks for containers",
                            description: "Nothing is collected and nothing is discarded; the note that names the container is kept, and the offer is made again later.",
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
                        "The world is always read-only in the container. A render reads chunks and writes tiles, and nothing about that should be able to write into somebody's save.",
                        "A published port is bound to loopback by default, never to every interface, so a laptop on a public network does not put somebody's world map on it.",
                        "No shell is used anywhere on the launch path. Every argument is passed as its own argv element, so a world folder with an odd name in it is a folder name rather than a second command.",
                        "Containers run with --rm, and with --user where the caller supplies one, so a container writing as root on Linux does not leave root-owned tiles behind.",
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
                        "126 tests in ",
                        { code: "design/packages/app/src/main/runtime/" },
                        " run in CI on every push and none of them need Docker installed: the probe's five ",
                        "states across both Windows and Linux daemon wordings, the mount refusals, the exact ",
                        "mount list and publish rule, that a local run and a containerised one produce ",
                        "identical signal streams from the same output, and every branch of picking a ",
                        "container back up after the app closes.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What that does not prove",
                    content:
                        "Every test runs against a fake Docker daemon that answers the way the real one does. Nobody has rendered a world through this path against a real, installed Docker Desktop or Docker Engine from a packaged build of the app.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "java-render-path",
            reason: "The same engine and the same jar this article's Local mode runs, explained on its own.",
        },
        {
            articleId: "remote-render",
            reason: "The same container problem, one machine further away, reached over SSH instead of run here.",
        },
        {
            articleId: "render-in-actions",
            reason: "A third place the engine can run, needing no machine of your own at all.",
        },
    ],

    sources: [
        { label: "docs/docker-and-local.md", href: DOCKER_AND_LOCAL_DOC_URL },
        { label: "packages/app/src/main/java", href: repoFile("design/packages/app/src/main/java") },
        { label: "packages/ui/src/components/remote/RunLocationCard.vue", href: repoFile("design/packages/ui/src/components/remote/RunLocationCard.vue") },
        { label: "packages/ui/src/components/remote/DockerStateNote.vue", href: repoFile("design/packages/ui/src/components/remote/DockerStateNote.vue") },
        { label: "packages/ui/src/components/remote/runtimeChoice.ts", href: repoFile("design/packages/ui/src/components/remote/runtimeChoice.ts") },
        { label: "packages/ui/src/components/remote/dockerStates.ts", href: repoFile("design/packages/ui/src/components/remote/dockerStates.ts") },
        { label: "packages/app/src/main/runtime/", href: repoFile("design/packages/app/src/main/runtime") },
    ],
};

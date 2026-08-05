import type { Article } from "../types.js";
import { PUBLISHING_TO_PAGES_DOC_URL, REMOTE_HOSTING_DOC_URL, REMOTE_RENDER_DOC_URL, repoFile } from "../links.js";

export const remoteHosting: Article = {
    id: "remote-hosting",
    title: "Hosting a rendered map on your own server",
    summary:
        "Publish an already-rendered map to a Linux server you own, over the same SSH/Docker foundation remote rendering uses, as a detached container that keeps answering after this application closes - loopback by default, a warned public choice, and live verification before anything is called live.",
    category: "application",
    status: "shipped",
    statusNote:
        "The docker-run plan, the orchestrator (preflight, upload, replace-and-start, both verification paths, the persisted record) and the IPC seam are built and covered by 46 tests in design/packages/app/src/main/remote/ and design/packages/ui/src/components/remote/, all against fakes - no real SSH client, Docker daemon or server anywhere in the run. The panel component is reachable end to end through the preload bridge, but is not yet mounted into the application's own tab navigation, and this article says so rather than implying it is one click away.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Reuses rendering on a remote host's whole SSH/Docker foundation rather than a parallel ",
                        "copy of it: the same ",
                        { code: "ssh" },
                        " wrapper, the same trust-on-first-use host-key store, the same resumable transfer, ",
                        "the same four-stage preflight. What is new is what happens to a render that already ",
                        "finished: the map is sent the other way, the container is started detached rather ",
                        "than disposable, and a published port is verified rather than merely started.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "The world is sent again, for a map that already rendered",
                    content: [
                        "The engine builds a real map on every start of the process - web-server mode ",
                        "included - and that construction opens the world's own files whether or not ",
                        "anything is going to be re-rendered. Hosting a map finished an hour ago still ",
                        "uploads the world, read-only, alongside the already-rendered tiles.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "Preflight" },
                            ", stage and upload: exactly rendering-on-a-remote-host's own four checks, then ",
                            "the config (written here with container paths and web-server mode enabled), ",
                            "the engine jar, each map's world, and the render's entire already-rendered ",
                            { code: "web/" },
                            " root.",
                        ],
                        [
                            { strong: "Replace and serve" },
                            ": any previous container of the same name is torn down first (one idempotent ",
                            { code: "docker rm -f" },
                            "), then ",
                            { code: "docker run -d --restart unless-stopped" },
                            " starts a fresh one, published at the address chosen below.",
                        ],
                        [
                            { strong: "Verify" },
                            ": a public bind is proven with a real connection from this computer; a ",
                            "loopback bind is proven by a check run on the remote host itself, over the ",
                            "SSH connection already open. Only a successful check earns ",
                            { code: "verified: true" },
                            ".",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Publishing again is what \"update\" is: the same operation, run a second time - ",
                        "re-syncs whatever changed, tears down the running container and starts a fresh ",
                        "one, verifies again. A few seconds of downtime while that happens is the stated ",
                        "cost, rather than a zero-downtime promise this does not keep.",
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
                            term: "Bind mode",
                            description: [
                                { strong: "Loopback" },
                                " (default): published only to the remote host's own ",
                                { code: "127.0.0.1" },
                                ", reachable elsewhere only through an SSH tunnel you open yourself. ",
                                { strong: "Public" },
                                ": published to every interface, reachable at ",
                                { code: "http://<host>:<port>/" },
                                " - a deliberate, warned choice, never a silent default.",
                            ],
                        },
                        {
                            term: "Port",
                            description: [
                                "Chosen on the panel, never invented. The engine's own listen address inside ",
                                "the container is always ",
                                { code: "0.0.0.0" },
                                " regardless of the bind choice above - a container's own loopback is ",
                                "unreachable through Docker's port publishing from outside it, a different ",
                                "fact from the host-side address a person actually types.",
                            ],
                        },
                        {
                            term: "Target fields",
                            description:
                                "The same fields a remote render target carries: host, port, user, an optional identity file path, a work directory, the container image, and whether the staging directory is kept afterward.",
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
                            term: "The named render has no output on this computer",
                            description: "Refused before anything is uploaded - there is nothing to host until it has actually been rendered here first.",
                        },
                        {
                            term: "docker run refuses - a port already in use, for instance",
                            description: "Reported honestly as a failure to start, distinct from a verification failure: the container never existed to verify.",
                        },
                        {
                            term: "The container starts and the address never answers",
                            description: "Reported as verified: false with no URL and a note naming which check ran, never assumed live because Docker reported success.",
                        },
                        {
                            term: "The container was already gone when stopping was asked for",
                            description: "Treated as a successful stop rather than an error - \"No such container\" is what a container that is already gone answers either way.",
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
                        "No password anywhere, and nowhere to put one - the same SSH options rendering on a remote host uses, which make the client refuse a password even if a host offers one.",
                        "Host keys are never trusted silently: the same trust-on-first-use store, an unknown key put in front of you as a fingerprint, a changed key refused with no override.",
                        "Loopback bind is the default. Choosing public puts the map on the real internet over plain HTTP; this server has no TLS anywhere in it, and the panel states plainly that a certificate is your own responsibility, before public is ever the selected value.",
                        "Stopping a hosted map - the container torn down and, unless the target keeps its files, the remote copy of the world removed too - sits behind the same anchored two-key-and-slider gate every other destructive control in this application uses, naming exactly that cost first.",
                        "The world is still mounted read-only, always, exactly as a render mounts it.",
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
                        "46 tests across ",
                        { code: "hostplan.test.ts" },
                        ", ",
                        { code: "hosting.test.ts" },
                        ", ",
                        { code: "hostingIpc.test.ts" },
                        " and ",
                        { code: "RemoteHostingPanel.test.ts" },
                        " run in CI on every push, against the same fake command runner and fake file ",
                        "transfer the rest of the remote package is tested with, plus injected verification ",
                        "probes for both bind modes: preflight refusing before a byte moves, the exact ",
                        { code: "docker run" },
                        " arguments for both bind modes, idempotent republish, both verification paths ",
                        "reporting honestly when the address never answers, loopback verification never ",
                        "inventing a public URL, and stopping with and without ",
                        { code: "keepRemoteFiles" },
                        ".",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What that does not prove",
                    content:
                        "Every command this builds is asserted character-for-character against a fake that answers the way the real tools do, but nothing here has run against a real ssh connection, a real Docker daemon publishing a real port, or a real browser opening a hosted map - and the panel is not yet mounted into the application's own navigation.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "remote-render",
            reason: "The SSH/Docker foundation this feature reuses unchanged, and where the world-upload requirement comes from.",
        },
        {
            articleId: "publishing-to-pages",
            reason: "The other way a finished map leaves this computer - free, static, and hosted by somebody else instead of a server you run.",
        },
        {
            articleId: "docker-and-local",
            reason: "The local web server this feature's honesty rule - a URL is reported only after it has been connected to - is carried over from.",
        },
    ],

    sources: [
        { label: "docs/remote-hosting.md", href: REMOTE_HOSTING_DOC_URL },
        { label: "docs/remote-render.md", href: REMOTE_RENDER_DOC_URL },
        { label: "docs/pages-hosting.md", href: PUBLISHING_TO_PAGES_DOC_URL },
        { label: "packages/app/src/main/remote/hostplan.ts", href: repoFile("design/packages/app/src/main/remote/hostplan.ts") },
        { label: "packages/app/src/main/remote/hosting.ts", href: repoFile("design/packages/app/src/main/remote/hosting.ts") },
        { label: "packages/ui/src/components/remote/RemoteHostingPanel.vue", href: repoFile("design/packages/ui/src/components/remote/RemoteHostingPanel.vue") },
    ],
};

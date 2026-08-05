import type { Article } from "../types.js";
import { REMOTE_RENDER_DOC_URL, RENDER_IN_ACTIONS_DOC_URL, repoFile } from "../links.js";

export const remoteRender: Article = {
    id: "remote-render",
    title: "Rendering on a remote machine over SSH",
    summary:
        "Hand a render to another machine over SSH, run it in a container there, and bring the map back, with the interface reporting the whole thing exactly as it reports a local render.",
    category: "application",
    status: "shipped",
    statusNote:
        "The target validation, SSH invocation, host-key trust, preflight, upload, container launch, cancellation, reattachment and cleanup are built and covered by 154 tests in design/packages/app/src/main/remote/, none of which need a real SSH client, container runtime, server or network. No capture from a real remote host exists yet, and this article says so rather than implying one does.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "A laptop is a bad place to render a large world; a Linux box with real cores and ",
                        "real disk is a good one. This route hands a render to that machine over SSH, runs ",
                        "it in a container there using the same command-building code the local Docker ",
                        "route uses, and brings the map back into this render's own workspace.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "Preflight" },
                            ": can this app reach the host, is this the machine that answered last time, ",
                            "is there a Docker there with a running daemon, and is there room under the ",
                            "work directory. Nothing is sent until all four pass, in that order, because ",
                            "asking about Docker before the connection works reports \"Docker is not ",
                            "installed\" for a host that is simply switched off.",
                        ],
                        [
                            { strong: "Stage and upload" },
                            ": a per-render directory is created on the remote host, a config file is ",
                            "written here with container paths in it and uploaded, then the engine jar and ",
                            "each world.",
                        ],
                        [
                            { strong: "Note, then render" },
                            ": the container's name is written to ",
                            { code: "container.json" },
                            " before it starts, then ",
                            { code: "ssh" },
                            " runs ",
                            { code: "docker run" },
                            " on the remote host and its output is read line by line as it arrives.",
                        ],
                        [
                            { strong: "Collect and clean up" },
                            ": the rendered tiles come home into this render's own workspace, and the ",
                            "staging directory on the remote host is removed unless the target is set to ",
                            "keep its files.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A remote render emits the same ",
                        { code: "RenderEvent" },
                        " union a local render emits, so the same progress bar, log pane, cancel button ",
                        "and failure banner work with no special knowledge that a network was involved. ",
                        "Transfer steps report their percentage as files staged rather than bytes moved, ",
                        "because that is what ",
                        { code: "scp" },
                        " can actually say.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Closing the app does not stop the render",
                    content: [
                        "Killing the local ssh client kills a viewer, not the container: the remote ",
                        "daemon owns the container's lifetime. So on the next launch, or whenever asked, ",
                        "the app puts the container's recorded name to that daemon and either reattaches ",
                        "a still-running render by streaming its log from the start, collects the output ",
                        "of one that finished while the app was away, or leaves the note alone when the ",
                        "host simply did not answer.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Where both machines have ",
                        { code: "rsync" },
                        ", the world upload is resumable: an interrupted transfer carries on from where ",
                        "it stopped rather than starting a multi-gigabyte world over from byte zero. Where ",
                        "either machine lacks it, the app falls back to ",
                        { code: "scp" },
                        " and says so in the log before a byte moves, naming which machine is missing it.",
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
                            term: "Target fields",
                            description: [
                                "Host, port (22 by default), user, an optional identity file path, a work ",
                                "directory on the remote host (",
                                { code: "~/.material-bluemap/renders" },
                                " by default), the container image, and whether the staging directory ",
                                "survives the render.",
                            ],
                        },
                        {
                            term: "Authentication",
                            description: [
                                "Keys only. There is no password field and nowhere to put one: every ",
                                "invocation carries ",
                                { code: "PasswordAuthentication=no" },
                                " and ",
                                { code: "BatchMode=yes" },
                                ", so the client cannot fall back to a prompt even if a host offers one. ",
                                "Authentication is your SSH agent, or a named identity file the app records ",
                                "the path of and never reads the contents of.",
                            ],
                        },
                        {
                            term: "The host key",
                            description: [
                                "Trusted, unknown or changed. An unknown key is put in front of you as a ",
                                "fingerprint to compare; a changed key is refused with no button anywhere, ",
                                "because a rebuilt server and an intercepted connection are indistinguishable ",
                                "from this app.",
                            ],
                        },
                        {
                            term: "What is sent, and what never is",
                            description: [
                                "Sent: the world folders in this render, the engine jar, a generated config. ",
                                "Never sent: any GitHub token or sign-in, any private key, any password, any ",
                                "other world, map or setting on this computer.",
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
                            term: "The host is unreachable, or refuses the key",
                            description: "Reported before anything is uploaded, since preflight runs first and a render is gigabytes of upload and hours of compute.",
                        },
                        {
                            term: "The host key changed since a render started",
                            description: "Refused, in the same words a fresh connection is refused in, with no override.",
                        },
                        {
                            term: "Docker is missing, its daemon is down, or this account is refused",
                            description: "Three different sentences, using the same five-state classifier the local Docker route uses, run over an SSH-backed command runner.",
                        },
                        {
                            term: "The container was removed by --rm while the app was away",
                            description: "Its tiles are fetched if the staging directory still exists; its exit status is reported as gone rather than guessed at.",
                        },
                        {
                            term: "The engine ran and produced no tiles",
                            description: "A render is only a success when the engine printed its own completion line; an exit code of 0 with no such line is reported as a failure, not a success.",
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
                        "No password anywhere: no field, no storage, no argument, and SSH options that make the client refuse one even when a host offers it.",
                        "No private key is ever read, written or copied by the app; only a path is recorded, and only ssh opens it.",
                        "No host key is trusted silently. An unknown key is a decision for the person, a changed key is a refusal with no override, and the app writes only to its own trust store, never to the user's own ~/.ssh/known_hosts.",
                        "Every remote word is quoted with POSIX single quotes, so a world folder with an odd name in it is a folder name rather than a different command.",
                        "The world is mounted read-only in the container, always, and no port is published: a remote render has no web server of its own, the tiles come home and are served by this app.",
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
                        "154 tests in ",
                        { code: "design/packages/app/src/main/remote/" },
                        " run in CI on every push: target validation refusing a host beginning with ",
                        { code: "-" },
                        ", the SSH options that make a password impossible, the fingerprint matching an ",
                        "independently computed value, the preflight ordering, a resumable rsync transfer ",
                        "asserted against a fake host that counts bytes, and the whole orchestrated flow ",
                        "including a cancelled render that cleans up without being reported as a failure.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What that does not prove",
                    content:
                        "Every command this builds is asserted character-for-character and every failure path is exercised against a fake that answers the way the real tools do, but no capture from a real remote host exists yet.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "remote-hosting",
            reason: "The natural next step for a render that finished here: put it on that same kind of server, running, instead of bringing it home.",
        },
        {
            articleId: "docker-and-local",
            reason: "The same container problem, run on this machine instead of one reached over the network.",
        },
        {
            articleId: "render-in-actions",
            reason: "A third place the engine can run, needing no server of your own at all.",
        },
        {
            articleId: "java-render-path",
            reason: "The engine this route ships to the remote host and drives there.",
        },
    ],

    sources: [
        { label: "docs/remote-render.md", href: REMOTE_RENDER_DOC_URL },
        { label: "docs/render-in-actions.md", href: RENDER_IN_ACTIONS_DOC_URL },
        { label: "packages/app/src/main/remote/", href: repoFile("design/packages/app/src/main/remote") },
        { label: "packages/ui/src/components/remote/RemotePreflightPanel.vue", href: repoFile("design/packages/ui/src/components/remote/RemotePreflightPanel.vue") },
        { label: "packages/ui/src/components/remote/remoteTargets.ts", href: repoFile("design/packages/ui/src/components/remote/remoteTargets.ts") },
    ],
};

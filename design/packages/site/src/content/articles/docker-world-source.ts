import type { Article } from "../types.js";
import { DOCKER_WORLD_SOURCE_DOC_URL, repoFile } from "../links.js";

export const dockerWorldSource: Article = {
    id: "docker-world-source",
    title: "Fetch a world from local Docker",
    summary:
        "Choose a real local container mount or named volume in the map wizard, review live-copy safety, fetch read-only into a browsed folder and rejoin ordinary world validation.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The main/preload/UI seam is mounted and covered by focused tests, policy inventories, a production build and a cheap hidden compact-layout proof. Docker Desktop 29.6.1 was installed during verification, but its desktop-linux daemon pipe was absent, so no real container or volume fetch could run and none is claimed.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        "Open World in local Docker inside the ordinary wizard's World step. The panel checks this computer's local daemon only and reuses the existing five-state Docker guidance.",
                        "Choose Container or Named volume. Both pickers are populated from Docker itself. A selected container is inspected again and offers only its real bind and volume mounts.",
                        "Review running or stopped state. A running server names the exact torn-.mca risk and keeps Fetch disabled until that single attempt is acknowledged; stop-first and known-good-backup alternatives remain visible.",
                        "Choose the exact local destination through the shared native-folder PathField or free text.",
                        "Fetch read-only and additively, with cancellation. A bind-direct route reports real file counts; Docker copy remains honestly indeterminate until local placement exposes real file counts.",
                        "The main process validates the fetched folder as a Minecraft world, then the panel hands that same local folder to the ordinary wizard inspection path.",
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
                            term: "Local daemon",
                            description:
                                "This UI registration runs Docker on the same computer as the app. Remote Docker-over-SSH support exists below the module seam but is not invented as a UI capability here.",
                        },
                        {
                            term: "Source",
                            description:
                                "One actual container mount or one actual named volume. Container ids, volume names and mount destinations are selected, never typed blind.",
                        },
                        {
                            term: "Destination",
                            description:
                                "The exact local world folder, chosen with the native folder browser. Copying adds and updates files but never removes stale destination files.",
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
                            term: "Docker is not installed",
                            description:
                                "Reported separately from an installed client whose daemon is stopped.",
                        },
                        {
                            term: "Daemon is down or refused",
                            description:
                                "The existing Docker note names whether to start Docker Desktop or repair account permission, then Refresh retries the real inventory.",
                        },
                        {
                            term: "No mount or volume",
                            description:
                                "The picker shows an honest empty state. It never presents a fake default path.",
                        },
                        {
                            term: "Live container",
                            description:
                                "Refused until the exact warning is acknowledged for this attempt. The acknowledgement is cleared whether the attempt succeeds or fails.",
                        },
                        {
                            term: "Not a world",
                            description:
                                "The fetched folder failed its level.dat/region validation and is not handed to the wizard as usable.",
                        },
                        {
                            term: "Cancellation",
                            description:
                                "The child copy is aborted. Already placed local files remain because the operation is additive; temporary staging is removed.",
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
                        "Every byte moves out of Docker toward the chosen local destination. No command copies in the opposite direction.",
                        "A named volume is mounted into the disposable helper container as /mb-source:ro.",
                        "Container and volume identifiers cross a context-isolated typed preload namespace; the renderer never receives daemon credentials.",
                        "Super confirmation is not applicable because the operation deletes nothing. The separate live-copy acknowledgement protects consistency, not deletion.",
                        "The panel does not expose or claim a remote Docker daemon. Reaching one would require the SSH target/trust surface to own that choice.",
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
                        "Focused tests cover the main fetcher and IPC, the preload listener, the renderer bridge seam, mounted inventory/mount/volume selection, one-shot live-risk acknowledgement, null fingerprints, real progress and cancellation, plus the surface-search, menu, appearance, path and safety inventories. The production workspace build includes the panel.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "The daemon was not reachable",
                    content:
                        "Docker Desktop client 29.6.1 was present, but the desktop-linux daemon pipe did not exist. The hidden compact proof therefore verifies the real built daemon-down surface, not a successful container or volume fetch.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "world-reading",
            reason: "The ordinary local validation path the fetched folder rejoins.",
        },
        {
            articleId: "docker-and-local",
            reason: "The same daemon's separate role when running the renderer itself in a container.",
        },
        {
            articleId: "ssh-world-sources",
            reason: "The explicitly remote world-source route, with target and host-key ownership.",
        },
    ],
    sources: [
        { label: "docs/docker-world-source.md", href: DOCKER_WORLD_SOURCE_DOC_URL },
        {
            label: "DockerWorldSourcePanel.vue",
            href: repoFile("design/packages/ui/src/components/world/DockerWorldSourcePanel.vue"),
        },
        {
            label: "dockerWorldSourceBridge.ts",
            href: repoFile("design/packages/ui/src/components/world/dockerWorldSourceBridge.ts"),
        },
        { label: "main/dockerworld", href: repoFile("design/packages/app/src/main/dockerworld") },
    ],
};

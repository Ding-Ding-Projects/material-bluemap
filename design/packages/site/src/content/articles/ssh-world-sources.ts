import type { Article } from "../types.js";
import { SSH_WORLD_SOURCES_DOC_URL, repoFile } from "../links.js";

export const sshWorldSources: Article = {
    id: "ssh-world-sources",
    title: "Fetch a world from your own SSH server",
    summary:
        "Choose a saved key-only SSH host inside the map wizard, browse its real folders, review its host fingerprint, survey a world and fetch it into the ordinary local-world flow.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The complete preload-to-wizard seam is mounted and covered by 24 focused bridge and UI tests plus the existing 64 main-process SSH-world tests. The UI build and policy guards pass. No real Linux or Windows SSH host has been fetched through the packaged application yet, so the status remains ported-unverified rather than shipped.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        "Open the SSH source inside the wizard's World step and choose a saved machine. The existing target editor remains the create and edit path, so remote rendering and remote world fetching share one target list.",
                        "Check the host. The real bridge validates the target, detects POSIX or Windows, and checks the same known-hosts stores remote rendering uses.",
                        "If the key is unknown, compare one exact SHA256 fingerprint with the server and explicitly trust it. The main process re-scans before recording it. A changed key is refused and receives no trust action.",
                        "Browse the host through the existing Explorer-style browser. Its rows come from a real remote directory listing, and folders with level.dat plus region data are highlighted as likely Minecraft worlds.",
                        "Survey the chosen folder before transferring it. The button remains disabled until the survey finds both level.dat and a region file and a local destination is chosen.",
                        "Fetch with rsync where both ends support it or the existing honest scp fallback. Transfer messages and cancellation stay in the panel that started the work; success hands the resulting local folder to the wizard's ordinary inspection path.",
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
                            term: "Saved machine",
                            description:
                                "Host, port, user, SSH-agent or identity-file path, and the existing remote-render fields. There is no password field.",
                        },
                        {
                            term: "Remote world folder",
                            description:
                                "Chosen from actual remote directory data or entered as a path, then validated in the detected host's own POSIX or Windows grammar.",
                        },
                        {
                            term: "Local destination",
                            description:
                                "A native folder picker plus free text. The remote world's folder is created inside that parent, matching the transfer layer's existing directory-download contract.",
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
                            term: "Unknown host key",
                            description:
                                "The fingerprint is shown for review and nothing is transferred until an exact fingerprint is explicitly trusted.",
                        },
                        {
                            term: "Changed host key",
                            description:
                                "Refused with the bridge's exact explanation and no trust button. The UI never silently replaces the recorded key.",
                        },
                        {
                            term: "Unknown shell",
                            description:
                                "The host is named honestly as unknown and browsing/surveying stay disabled because the app will not guess a path grammar or listing command.",
                        },
                        {
                            term: "Not a world",
                            description:
                                "A survey missing level.dat or a real region file explains that the world folder itself is needed and prevents transfer.",
                        },
                        {
                            term: "Interrupted transfer",
                            description:
                                "Cancel names the active fetch id. rsync can carry partial files on; scp states that the interrupted file starts again.",
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
                        "Key-only authentication is inherited from the remote foundation: PasswordAuthentication=no, KbdInteractiveAuthentication=no and BatchMode=yes.",
                        "Only a fingerprint crosses the renderer boundary. The main process re-scans the host and writes only a freshly offered matching key into the app's own trust store.",
                        "The source operation writes nothing to the SSH host. Survey and fetch are reads; no staging folder or script is left there.",
                        "The remote path is checked in the detected operating system's grammar before survey or transfer, and the UI refuses to guess when detection is unknown.",
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
                        "The UI seam test resolves the real nested ",
                        { code: "window.materialBluemap.sshWorldSource" },
                        " shape; mounted tests drive unknown-key review, explicit trust, detection, survey, transfer events and the handoff back to the wizard. Existing tests cover the nine preload channels and the main-process SSH implementation. The UI typecheck, workspace build and surface-policy guards run alongside them.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Real-host proof is still outstanding",
                    content:
                        "No packaged build has yet completed this flow against a genuine Linux or Windows OpenSSH host. The code path is reachable and the seam is tested; the live network claim remains unproven.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "world-reading",
            reason: "The ordinary local inspection path the fetched folder rejoins.",
        },
        {
            articleId: "remote-render",
            reason: "The same target list, key-only authentication and host-key trust model in the opposite direction.",
        },
        {
            articleId: "release-downloads",
            reason: "The other world-source route already available inside the same wizard step.",
        },
    ],
    sources: [
        { label: "docs/ssh-world-sources.md", href: SSH_WORLD_SOURCES_DOC_URL },
        {
            label: "SshWorldSourcePanel.vue",
            href: repoFile("design/packages/ui/src/components/world/SshWorldSourcePanel.vue"),
        },
        {
            label: "sshWorldSourceBridge.ts",
            href: repoFile("design/packages/ui/src/components/world/sshWorldSourceBridge.ts"),
        },
    ],
};

import type { Article } from "../types.js";
import { ROADMAP_URL, SECURITY_POLICY_URL, repoFile } from "../links.js";

export const firstRunConsent: Article = {
    id: "first-run-consent",
    title: "First-run setup and Mojang download consent",
    summary:
        "The one question the app asks: whether it may download Minecraft's client jar. Asked once, at first launch, remembered forever, and never asked again.",
    category: "application",
    status: "shipped",
    statusNote:
        "The record, the flow and the settings row are built and covered by 73 main-process tests plus 89 in the setup surface, all running in CI. Nobody has yet walked through it in an installed, packaged build.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "BlueMap textures a map from the real Minecraft client jar, so it cannot render anything ",
                        "until the person running it accepts Mojang's licence. Upstream expresses that as ",
                        { code: "accept-download" },
                        " in its config, defaulting to false. This app turns that config key into a decision a ",
                        "person makes, once.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "Asked at first launch, before anybody is mid-task." },
                            " Three steps: what this is, the consent question, and where maps should be stored. ",
                            "The alternative is asking when a render is first attempted, which is precisely the ",
                            "wrong moment: a licence appearing on top of a chosen world and a pressed button ",
                            "reads as an obstacle to get past rather than a decision to make.",
                        ],
                        [
                            { strong: "Accept and Decline are the same button rendered twice." },
                            " Same variant, same size, same row, no colour separating them, neither focused ",
                            "first. A decline styled as the quiet option is a decline nobody makes.",
                        ],
                        [
                            { strong: "Declining is a real answer and is remembered too." },
                            " Setup completes whichever way the question was answered, so somebody who said no ",
                            "is not shown the same licence at every launch until they give in.",
                        ],
                        [
                            { strong: "Nothing ever asks again." },
                            " A render that needs consent and does not have it comes back with a typed failure ",
                            "naming the settings row that grants it. It does not open a licence.",
                        ],
                        [
                            { strong: "It can be withdrawn, and re-granted." },
                            " A decision that cannot be reversed is not really a decision. The settings row ",
                            "offers both directions and shows the same verbatim quotation either way, because ",
                            "agreeing to a licence you were not shown is not agreeing to anything.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Two records are kept, not one, and they answer different questions. The consent record ",
                        "says what was agreed to, when, and to which version of which document. The first-run ",
                        "flag says only that setup has been completed. Completing setup never implies an ",
                        "acceptance, and an acceptance never implies the flow was shown.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "The only blocking dialog in the application",
                    content:
                        "This is the one decision that genuinely must be made before continuing, which is exactly what a modal is reserved for. Everything else the app says arrives as a notification that does not halt anything.",
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
                            term: "The consent record",
                            description:
                                "A small JSON file in the app's own data directory holding whether it was accepted, when, which document, which terms version, and the app version at the time. The last of those is provenance: it makes a support question answerable.",
                        },
                        {
                            term: "Terms version",
                            description:
                                "Bumped only when what a person is agreeing to materially changes. A stored answer that names a different version, or a different document, does not carry over, and this is the one case where asking again is correct rather than nagging.",
                        },
                        {
                            term: "The first-run flag",
                            description:
                                "A separate file recording that setup completed and when. Set on both the accept and the decline path.",
                        },
                        {
                            term: "Environment opt-in",
                            description:
                                "Setting WORLDLENS_ACCEPT_DOWNLOAD to 1, true or yes answers for the process; the legacy MATERIAL_BLUEMAP_ACCEPT_DOWNLOAD name remains readable during migration. A developer machine, CI runner, or administered server is never shown setup at all. Deliberately an environment variable rather than a build-time default: a shipped installer that pre-accepted would be declaring, in a stranger's name, that they accepted a licence they were never shown.",
                        },
                        {
                            term: "Map storage directory",
                            description:
                                "The third setup step, stored in a token form that expands at render time, so a path chosen on one machine still means the right thing on the next.",
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
                    kind: "paragraph",
                    content: [
                        "The two ways of getting this wrong are not equally bad, and every unhappy path is ",
                        "resolved in the same direction because of it. Guessing ",
                        { em: "not accepted" },
                        " when somebody did accept costs one visit to a settings row. Guessing ",
                        { em: "accepted" },
                        " when they did not downloads copyrighted assets in their name, under a licence they ",
                        "were never shown.",
                    ],
                },
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "The record is missing",
                            description:
                                "A fresh install. Reads as not accepted, and no file is written merely by asking.",
                        },
                        {
                            term: "The record is corrupt, truncated or unreadable",
                            description:
                                "Not accepted. That covers a file that is not JSON, a file that is JSON but not an object, an accepted flag that is a string or a number, a directory where the file should be, and a staging file left behind by a crash mid-write. The bytes on disk are left exactly as they are rather than tidied away, because they are the evidence somebody diagnosing this will want.",
                        },
                        {
                            term: "The terms or the document have changed",
                            description:
                                "Not accepted, in both directions. A record naming an older terms version is stale; one naming a newer version was written by a build this one cannot show the terms of.",
                        },
                        {
                            term: "A write fails partway",
                            description:
                                "Both files are written to a staging name and renamed into place, so a crash mid-write cannot leave a half-written file that reads as a different answer than the one given.",
                        },
                        {
                            term: "The first-run flag is unreadable",
                            description:
                                "Setup is shown again. The safe direction is the opposite one here: showing a setup screen an extra time is a small annoyance, while skipping it silently means the question is never asked at all.",
                        },
                        {
                            term: "The bridge is unavailable",
                            description:
                                "In a plain browser build there is no main process, no local rendering and therefore nothing to consent to, so nothing is shown. If a bridge call fails during setup, the flag stays unset and setup opens again next launch, which is the safe direction.",
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
                        "No default is yes. A gate that defaults to accepted is not a gate.",
                        "The persisted answer never weakens the gate in the engine: the loader still takes the permission as a required parameter with no default, so no code path can download a Mojang jar without being handed an explicit answer. This module only remembers what the answer was.",
                        "Consent is checked once, in one place, before a render spawns anything. It is not re-decided in the config writer or the runner, so there is no path where four agreeing checks quietly become three.",
                        "The environment opt-in is an opt-in only. Setting it to 0 says nothing and cannot revoke somebody's stored yes; the variable can only add a permission for the current process, never remove one.",
                        "The environment opt-in does not forge a stored record. It answers for the process; the settings row keeps telling the truth about what is actually on disk.",
                        "The consent quotation shown to the person is bundled text, not fetched at display time, so what they are agreeing to cannot change between being written and being read. The link to the document itself opens externally.",
                        "Withdrawing is deliberately not behind the destructive-action gate. It destroys nothing, and the next press of Accept puts it back. Wrapping a reversible preference in the ceremony reserved for irreversible deletion teaches people to work through that ceremony without reading it.",
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
                        "73 tests cover the record in the main process and 89 cover the setup surface, all of ",
                        "them running in CI on every push. Most of them are the same assertion from different ",
                        "angles, which is the point: every unhappy path has to resolve to not accepted, and a ",
                        "suite that only checked the happy path would pass just as happily against a reader that ",
                        "returned accepted whenever parsing threw.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "A missing file, a missing data directory, and every shape of malformed file read as not accepted rather than throwing.",
                        "A changed terms version or document URL resets consent, in both the older and the newer direction.",
                        "Acceptance persists, and calling it again keeps the original timestamp rather than restamping it, which is checked by moving the clock and the app version between the two calls.",
                        "Revoking really clears the record rather than hiding it, is repeatable, is safe before anything was ever accepted, and can be reversed.",
                        "Setup completes exactly once whichever way consent went, including the accept-then-withdraw path, and is never shown to somebody who answered through the environment.",
                        "The two records stay independent: completing setup writes no consent, and accepting writes no first-run flag.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Not yet verified",
                    content: [
                        "Nobody has installed a packaged build and walked through the flow by hand, so the ",
                        "screenshots that would prove what it looks like at first launch do not exist. Layout at ",
                        "narrow widths and high display scales is handled in the component and covered by the ",
                        "capture harness only when that harness runs against a real build. See the ",
                        { link: "roadmap", href: ROADMAP_URL, external: true },
                        ".",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "worldlens-migration",
            reason: "The separate one-time consent and verified copy used when a legacy product profile exists.",
        },
        {
            articleId: "java-render-path",
            reason: "What consent unlocks, and why a render reports a missing answer instead of asking for one.",
        },
        {
            articleId: "resource-packs",
            reason: "The layer that actually downloads and verifies the client jar this decision permits.",
        },
        {
            articleId: "electron-security",
            reason: "The bridge these calls cross, and why the renderer cannot reach the record directly.",
        },
    ],

    sources: [
        {
            label: "packages/app/src/main/consent.ts",
            href: repoFile("design/packages/app/src/main/consent.ts"),
        },
        {
            label: "packages/app/src/main/consent.test.ts",
            href: repoFile("design/packages/app/src/main/consent.test.ts"),
        },
        {
            label: "packages/ui/src/components/setup",
            href: repoFile("design/packages/ui/src/components/setup"),
        },
        { label: "SECURITY.md", href: SECURITY_POLICY_URL },
    ],
};

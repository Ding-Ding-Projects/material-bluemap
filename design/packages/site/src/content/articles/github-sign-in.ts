import type { Article } from "../types.js";
import { ROADMAP_URL, SECURITY_POLICY_URL, repoFile } from "../links.js";

export const githubSignIn: Article = {
    id: "github-sign-in",
    title: "Signing in to GitHub",
    summary:
        "An optional account, for the two jobs the app cannot do anonymously: a world in a private repository and a release asset that is not public. A browser device flow, a pasted token, and a credential the renderer never sees.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The device flow, the pasted-token path, the credential store and the settings section are built and covered by 79 tests in the main process and 47 in the interface, all running in CI. Every one of those tests drives a stand-in for GitHub's endpoints: no sign-in has been completed against github.com from a packaged build, so the protocol is proved against its specification rather than against the server.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Signing in is the fifth section of the settings surface, and it is optional in every ",
                        "state. A public world renders and a public release downloads with nobody signed in at ",
                        "all. The section says so rather than asking for an account because applications ask for ",
                        "accounts: it exists for the two cases that genuinely cannot work anonymously, which are ",
                        "a world that lives in a private repository and a release asset that is not public.",
                    ],
                },
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        [
                            { strong: "The browser sign-in is a device flow." },
                            " The app asks GitHub for a short user code, the person types it on github.com, and ",
                            "the app polls until they have. It was chosen because a desktop application cannot ",
                            "keep a client secret, because there is no redirect to catch without either a ",
                            "loopback server on a guessed port or a registered URL scheme, and because the ",
                            "machine rendering a world need not be the machine with a browser on it. The code is ",
                            "eight characters and a hyphen; it can be typed on a phone.",
                        ],
                        [
                            { strong: "The code is the largest thing on the panel, and it is verbatim." },
                            " Hyphen included, in the case GitHub issued. Reformatting it produces a code the ",
                            "verification page refuses, and nothing on screen would say which of the two the ",
                            "person is looking at.",
                        ],
                        [
                            { strong: "The countdown is not a clock the panel started." },
                            " The code, the address, the seconds left and the outcome all arrive as events from ",
                            "the main process, and the panel renders the latest of each. A screen that has ",
                            "stopped hearing from the main process therefore stops counting, instead of ",
                            "confidently counting down to a code that died minutes ago.",
                        ],
                        [
                            { strong: "The four ways it ends are kept apart." },
                            " Approved is a success. Refused on the GitHub page is a decision somebody made, not ",
                            "a fault. An expired code is neither, and wants one button that fetches a fresh one. ",
                            "Only a failure is a failure, and there the main process's own sentence is shown as ",
                            "written, because it is the most precise statement available and the thing somebody ",
                            "would search for.",
                        ],
                        [
                            { strong: "A pasted personal access token is the other way in." },
                            " For a network that blocks the device endpoint, or somebody who already has a ",
                            "token. The field hands its value straight to the main process and keeps nothing: ",
                            "not in a variable, not in a message, not in a failure.",
                        ],
                        [
                            { strong: "Signing out says what it actually managed to do." },
                            " The stored credential is deleted, and revocation is attempted. Revoked is reported ",
                            "as true only when GitHub confirmed it, never merely because it was asked.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Each control is behind its own feature detection rather than one blanket check, because ",
                        "a released shell can load a newer interface than the one it was built beside. Half a ",
                        "bridge costs the half of the section that needs it, not all of it. A host with no ",
                        "preload at all, which is what a browser tab is, gets one sentence saying this build ",
                        "cannot sign in and no control whatsoever: the credential lives in the main process, so ",
                        "without one there is nothing to sign in ",
                        { em: "with" },
                        ", and a button that throws when it is pressed is worse than a sentence explaining why ",
                        "there is no button.",
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
                            term: "Which application signs you in",
                            description:
                                "An OAuth application by default. A GitHub App is registered too and fully supported behind an environment override, for somebody who would rather grant access one repository at a time and accept the installation step and the expiring tokens that come with it. The two are not interchangeable, and every difference is handled rather than papered over.",
                        },
                        {
                            term: "The client id is committed on purpose",
                            description:
                                "The device flow uses no client secret at all, and a client id identifies an application without authenticating it. Treating it as sensitive would buy nothing and only make the app harder to configure. A fork points at its own application through the environment rather than by editing the line, so the change survives a rebase.",
                        },
                        {
                            term: "Scopes",
                            description:
                                "public_repo, workflow and read:user for the OAuth application. A GitHub App is sent no scope parameter at all, because its permissions come from its own configuration and from which repositories it was installed on.",
                        },
                        {
                            term: "A token that reports no scopes",
                            description:
                                "A GitHub App user token and a fine-grained personal access token each report an empty scope list, for different reasons. That is a fact about the token rather than a gap in the reading, so it is carried as its own flag and never rendered as this account may do nothing.",
                        },
                        {
                            term: "Where the token lives",
                            description:
                                "The operating system's own credential store, through Electron safeStorage: DPAPI on Windows, the Keychain on macOS, libsecret on Linux. Ciphertext is what lands on disk, written to a staging name and renamed into place so a crash halfway through cannot leave a truncated file. A refresh token goes inside the same encrypted blob rather than beside it.",
                        },
                        {
                            term: "A machine with no credential store",
                            description:
                                "The sign-in is kept in memory for as long as the app is open, and the section says the sign-in will not survive a restart. Nothing is written to a plain file, which is the tempting alternative and the wrong one.",
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
                            term: "The person refuses on the GitHub page",
                            description:
                                "Reported as a refusal, not an error. Nothing is retried and nothing turns red: somebody made a decision and the panel reflects it.",
                        },
                        {
                            term: "The code expires before it is entered",
                            description:
                                "Its own state, with one button that asks for a fresh code. Retrying with the dead code would fail for a reason nobody could see.",
                        },
                        {
                            term: "GitHub asks the client to slow down",
                            description:
                                "The poll backs off to the interval the server asked for. This is one of the paths that is awkward to reach by hand and is covered by tests instead, because the clock, the network and the sleep are all parameters.",
                        },
                        {
                            term: "The application has the device flow turned off",
                            description:
                                "Its own failure code, because the fix is a setting on the GitHub application rather than anything the person at the keyboard can do.",
                        },
                        {
                            term: "The token is real but too narrow",
                            description:
                                "The missing scopes are named. Where signing in with the OAuth application instead would likely work, that is offered rather than left to be guessed at.",
                        },
                        {
                            term: "A pasted token is refused",
                            description:
                                "Reported by the pasted-token form itself. The main process emits a failure for every refused sign-in, including this one, so that event only moves the browser panel while a browser flow is actually in flight. Without that rule a mistyped token would paint the browser panel red about something it never did.",
                        },
                        {
                            term: "Revocation is refused",
                            description:
                                "Signing out still happened: the credential is gone from this machine. GitHub's revocation endpoint wants a client secret and a desktop application holds none, so on a shipped build the honest answer is usually that the local deletion succeeded and the revocation did not, with the reason and a link for finishing the job on github.com.",
                        },
                        {
                            term: "Half a preload",
                            description:
                                "Each method is probed on its own. A build whose preload has grown some of this shows the part that works and says plainly what the rest needs.",
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
                        "The renderer never holds a credential. The main process is the only side that talks to GitHub and the only side that stores a token; the interface learns who is signed in, what that account may do, and whether the credential survived being stored. No type on that bridge carries a token at all.",
                        "The pasted-token field is the one place a token exists in the renderer, and it exists for the length of one call. It is handed to the main process and kept nowhere afterwards.",
                        "Nothing is written to a plain file. Where the operating system offers no credential store, the sign-in is refused persistence rather than downgraded to plaintext: a token in a predictable path under the user profile is readable by every process running as that user, is swept up by whatever backs that folder up, and looks identical to a protected one.",
                        "Secrets are redacted out of anything that gets reported. A device-flow error, an HTTP body and a stack are all things that end up in a log or an issue comment, so they pass through a redactor before they become a message.",
                        "Only two files in the sign-in code import Electron. Everything else takes its clock, its network and its storage as parameters, which is why the awkward paths can be tested at all.",
                        "External links open through one guarded door that checks the scheme, so a URL that arrived from a response cannot become an arbitrary shell open.",
                        "Signing out deletes locally first and then attempts revocation, in that order. The reverse order would leave a credential on disk whenever the network call failed.",
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
                        "126 tests cover this: 79 in the main process across the client resolution, the device ",
                        "flow, the token exchange and verification, the credential store, the session and the ",
                        "redactor, and 47 in the interface across the state the section holds and the section ",
                        "itself. All of them run in CI on every push.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "The device flow's unhappy answers each have their own test: denied, expired, cancelled, a server asking the client to slow down, a malformed body, and an application with the flow disabled.",
                        "The credential store is tested for the refusal that matters: with encryption unavailable it writes nothing, rather than falling back to a plain file.",
                        "The redactor is tested against the shapes a token actually arrives in, so a failure message cannot carry one.",
                        "The interface tests assert that the pasted token never reaches any state the section holds, and that a failure raised by the token path does not move the browser panel's phase.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Nobody has signed in to the real GitHub from a packaged build",
                    content: [
                        "Every test here drives a stand-in for GitHub's endpoints, which is what makes the ",
                        "awkward paths reachable at all, and it is also the limit of what they prove. No user ",
                        "code has been typed on github.com from an installed build of this application, and there ",
                        "is no capture of the section. See the ",
                        { link: "roadmap", href: ROADMAP_URL, external: true },
                        ".",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Signing in does not yet reach the downloader",
                    content: [
                        "The download path reads a token from the ",
                        { code: "GH_TOKEN" },
                        " environment variable, and the sign-in session is not wired into it. So signing in ",
                        "does not currently make a private release asset fetchable from the downloads surface. ",
                        "That is a gap rather than a design, and it is stated here rather than left for somebody ",
                        "to discover by signing in and finding nothing changed.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "release-downloads",
            reason: "The surface a token would eventually serve, and what it can already fetch without one.",
        },
        {
            articleId: "electron-security",
            reason: "The bridge these calls cross, and why the renderer cannot reach the credential directly.",
        },
        {
            articleId: "render-in-actions",
            reason: "The private-repository rendering this account exists for, as it works today from CI.",
        },
        {
            articleId: "desktop-shell-chrome",
            reason: "The settings surface this section is the fifth of, and the notices its outcomes raise.",
        },
    ],

    sources: [
        { label: "packages/app/src/main/github", href: repoFile("design/packages/app/src/main/github") },
        {
            label: "packages/ui/src/components/github",
            href: repoFile("design/packages/ui/src/components/github"),
        },
        {
            label: "packages/ui/src/components/settings/AppSettings.vue",
            href: repoFile("design/packages/ui/src/components/settings/AppSettings.vue"),
        },
        { label: "SECURITY.md", href: SECURITY_POLICY_URL },
    ],
};

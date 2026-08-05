import type { Article } from "../types.js";
import { AUTOMATIC_REPAIR_DOC_URL, CONFIG_HISTORY_DOC_URL, repoFile } from "../links.js";

export const automaticRepair: Article = {
    id: "automatic-repair",
    title: "Automatic repair when a render or the web server fails to start",
    summary:
        "A failed run is diagnosed rather than guessed at, by a repeatable deterministic pass first and a narrowly guardrailed local coding agent only for what that pass cannot explain.",
    category: "application",
    status: "shipped",
    statusNote:
        "The deterministic diagnosis, the guardrails and the agent path are built and unit-tested on the default branch, and the panel is mounted as a Diagnostics tab in the application's settings. Render failures are wired to file evidence automatically; the web server's own failure path is not yet wired the same way. Nobody has run the coding-agent half against a real installed copy of opencode, and there is no committed capture of the panel with a failure on record.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The order between the two halves is the whole safety of the feature. Every failure ",
                        "this project already knows the shape of is decided by code, from the evidence, with ",
                        "no language model involved anywhere; a local coding agent is reached only for what ",
                        "is left, and only when one is installed and the setting is switched on.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        [
                            { strong: "Deterministic diagnosis covers eight named failure classes" },
                            ", each recognised from a line the vendored engine or Docker itself prints: a " +
                                "port already in use, Java missing or too old, an unreadable world, an " +
                                "unwritable output folder, an out-of-memory kill (including a bare exit code " +
                                "137, which is what a container gets and prints nothing else), a rejected " +
                                "config, an unaccepted download, and Docker being unavailable.",
                        ],
                        [
                            { strong: "More than one diagnosis can be true at once." },
                            " All of them are reported rather than a single winner being picked, and every ",
                            "diagnosis quotes the evidence line it was decided from, never a paraphrase.",
                        ],
                        [
                            { strong: "A cancelled run is diagnosed as nothing." },
                            " Cancelling is a decision, not a fault, and an unrecognised failure stays ",
                            "unexplained rather than being matched to the wrong pattern by accident.",
                        ],
                        [
                            { strong: "The agent, when reached, answers in strict JSON or is refused whole." },
                            " Prose, invalid JSON, or ",
                            { code: '"cause": null' },
                            " are all accepted as “I do not know” rather than as a licence to guess.",
                        ],
                        [
                            { strong: "Every applied edit is shown as a unified diff before it counts." },
                            " The change is then handed to the config folder's own local version history, ",
                            "so an automatic edit is an ordinary revision that can be restored, and that ",
                            "restore undone in turn, exactly like a change a person made.",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The panel lists whichever failures the main process currently has on record, with ",
                        "Diagnose and Diagnose and repair actions per row. Render failures are already wired ",
                        "to file evidence the moment a render fails; until a failure is filed, the panel says ",
                        "plainly that none are on record rather than inventing one to look busier than it is.",
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
                            term: "The coding agent",
                            description:
                                "Off by default and reached only when switched on and opencode is found on the account's PATH. Its absence is reported as an ordinary fact; the deterministic half works without it and the only thing lost is the last resort.",
                        },
                        {
                            term: "Guardrail scope",
                            description:
                                "Only files inside the failed run's own config folder, and only the names BlueMap actually loads as config: core.conf, webapp.conf, webserver.conf, plugin.conf, maps/<name>.conf, storages/<name>.conf, in either supported spelling, the same set the options editor writes, checked by the same function.",
                        },
                        {
                            term: "Credential masking",
                            description:
                                "Every config file is redacted on the way into the evidence record, not on the way out, so keys are kept and values replaced before the text is ever shown, stored or put into a prompt.",
                        },
                        {
                            term: "Size cap",
                            description:
                                "4 MiB per written file, matching the options editor's own cap; a larger proposed file is refused rather than truncated.",
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
                            term: "A deletion is proposed",
                            description:
                                "Refused as a category, by name, before any file is opened. The repair pass never deletes a file or a folder, anywhere, for any reason.",
                        },
                        {
                            term: "A path reaches outside the config folder, or into a world",
                            description:
                                "Refused with the path named, and nothing is written. The world-folder rule is checked even though the config-folder rule already excludes it.",
                        },
                        {
                            term: "One file is named twice in a single repair",
                            description:
                                "No version of it is written, rather than letting whichever the agent emitted last silently win.",
                        },
                        {
                            term: "A write, or the history snapshot after it, fails",
                            description:
                                "Reported per file rather than hidden; the other files in the same repair still apply, and a failed history write never undoes a repair that otherwise succeeded.",
                        },
                        {
                            term: "The pass itself throws",
                            description: "It does not: every step's outcome is a field in the result rather than an exception a caller has to catch.",
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
                        "The renderer names a failure by id and never describes one: the evidence is assembled by the main process at the moment of failure, so nothing running in a window chooses the config folder a repair writes into or the world folders it must keep away from.",
                        "The agent is invoked with the prompt as a single argv element and no shell, so nothing in a path or a log line can become a second command.",
                        "The agent has no network, no process and no git channel of its own, and the prompt forbids sending the config, logs or paths anywhere: the same list the guard enforces, built from one constant so the two cannot drift apart.",
                        "The agent is opt-in: handing even a masked failure report to a program that may send it to a model is a decision made once, knowingly, not a side effect of a render failing.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "table",
                    caption: "What the repair suite covers",
                    columns: ["File", "What it proves"],
                    rows: [
                        [
                            { code: "diagnose.test.ts" },
                            "Every failure class, in and correct diagnosis out, including both wordings of a port conflict, the exit-137 container kill that prints no Java error, several causes at once, and the two cases that must yield nothing: a cancelled run and an unrecognised exception.",
                        ],
                        [
                            { code: "guardrails.test.ts" },
                            "Deletion, traversal, an absolute path outside the folder, a file inside a world, a non-config file, an oversized file, and a file named twice.",
                        ],
                        [
                            { code: "pass.test.ts" },
                            "The agent is never consulted for an explained failure, “I do not know” is accepted, a refused edit writes nothing while a good one beside it still applies, and a failed write or history write is reported rather than hidden.",
                        ],
                        [
                            { code: "agent.test.ts" },
                            "Detection when opencode is absent, the prompt naming every prohibition, and a reply parser that refuses prose.",
                        ],
                        [
                            { code: "evidence.test.ts" },
                            "Credentials masked in every place they hide, and never present anywhere in the serialised record.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What the tests do not show",
                    content: [
                        "Every test in this suite runs without opencode installed. Nobody has driven the ",
                        "agent path against a real installed copy of it, the web server's own failure path ",
                        "is not yet wired to file evidence the way a render's is, and there is no committed ",
                        "capture of the Diagnostics panel with a failure on record.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The long form, including the exact evidence fields and the full failure-mode table, ",
                        "is in ",
                        { link: "docs/automatic-repair.md", href: AUTOMATIC_REPAIR_DOC_URL, external: true },
                        ".",
                    ],
                },
                {
                    kind: "code",
                    language: "text",
                    code: "pnpm exec vitest run packages/app/src/main/repair packages/ui/src/components/repair --silent",
                    caption: "Focused repair verification",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "config-history",
            reason: "Where an automatic change is recorded, and how it is undone.",
        },
        {
            articleId: "render-console",
            reason: "The log a failed render leaves behind, which the deterministic diagnosis reads.",
        },
        {
            articleId: "options-gui",
            reason: "The same guarded config write path a repair's edits go through.",
        },
    ],
    sources: [
        { label: "docs/automatic-repair.md", href: AUTOMATIC_REPAIR_DOC_URL },
        { label: "packages/app/src/main/repair", href: repoFile("design/packages/app/src/main/repair") },
        { label: "packages/ui/src/components/repair", href: repoFile("design/packages/ui/src/components/repair") },
        { label: "docs/config-history.md", href: CONFIG_HISTORY_DOC_URL },
    ],
};

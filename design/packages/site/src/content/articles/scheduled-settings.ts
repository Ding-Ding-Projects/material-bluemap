import type { Article } from "../types.js";
import { repoFile, SCHEDULED_SETTINGS_DOC_URL } from "../links.js";

export const scheduledSettings: Article = {
    id: "scheduled-settings",
    title: "Scheduled language and appearance settings",
    summary:
        "Versioned rules apply the site's real settings by date, time, weekday and timezone, optionally gated by a bounded JSON API or Home Assistant boolean entity.",
    category: "application",
    status: "shipped",
    statusNote:
        "The schedule engine, guided editor, local history, export/import, API and Home Assistant boundaries, search destinations, tests and compact runtime proof are implemented. A live Pages deployment is recorded only after default-branch integration.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "Each enabled rule has a stable ID, visible name, priority, optional date bounds, a timezone, a daily or weekday window and one or more real site-setting values. Equal times mean a full selected day; a cross-midnight window belongs to its starting weekday. Higher priority wins, then the later rule. Scheduled values form a temporary layer, so the stored base returns when no rule matches.",
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Open Settings → Schedules and add a rule; all targets come from the live settings schema.",
                        "Local rules use the values in the form. Versioned JSON API rules read a version 1 values object.",
                        "Home Assistant rules accept input_boolean or binary_sensor entities. On applies the rule values; off makes that rule a non-match and evaluation continues with the next lower-priority matching rule.",
                        "Enter a Home Assistant token in the password field for the current page session. It stays only in memory; reload, page close, Clear this token, or Clear all session tokens removes it.",
                        "Export and import use validated UTF-8 JSON. The bounded history restores an earlier complete document as a new revision.",
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Invalid IDs, labels, priorities, dates, times, timezones, weekdays, setting values, source URLs, entities and refresh intervals are named before save.",
                        "External sources fail closed on cleartext non-loopback HTTP, URL credentials, fragments, redirects, authentication, rate limiting, malformed JSON, responses over 64 KiB or eight-second timeouts.",
                        "A new refresh aborts an older generation; an external failure restores base values and leaves a nearby retry action.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "A Home Assistant rule stores only a stable non-secret lookup key. Its token is held in a page-lifetime memory map and is absent from local/session storage, the rule schema, exports, history, URLs, logs and errors. Requests omit ambient credentials, refuse redirects, cap time and size, and apply only setting IDs allowlisted by the real site schema.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The model suite covers matching, precedence, versioning, history, bounds, API states, cancellation and base recovery. A real loopback Home Assistant server verifies on, off fallthrough, unavailable and authentication paths plus token non-persistence/export/logging. The page suite covers the session-only password controls. The compact driver opens a real rule form at 390×844 bilingual and checks every visible control and overflow classification.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "pages-feature-parity",
            reason: "The complete browser feature inventory and compact proof.",
        },
        { articleId: "language-and-tone", reason: "The language values a rule can schedule." },
        { articleId: "appearance-editor", reason: "The appearance values a rule can schedule." },
        {
            articleId: "notification-centre",
            reason: "Where persistent external-source failures remain reviewable.",
        },
    ],
    sources: [
        {
            label: "docs/scheduled-settings-and-external-sources.md",
            href: SCHEDULED_SETTINGS_DOC_URL,
        },
        {
            label: "Schedule engine",
            href: repoFile("design/packages/site/src/settings/schedule.ts"),
        },
        {
            label: "Guided editor",
            href: repoFile("design/packages/site/src/settings/schedulePanel.ts"),
        },
    ],
};

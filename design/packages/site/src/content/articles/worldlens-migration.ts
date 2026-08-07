import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const worldlensMigration: Article = {
    id: "worldlens-migration",
    title: "Migrating safely to Worldlens",
    summary:
        "How legacy profiles, preferences, project files, markers and environment variables move to Worldlens without deleting the old copy.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The adapters, package build, isolated real-profile copy and packaged migration dialog are verified on the phase branch. Repository rename, default-branch integration and release publication are separate gates.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "On first launch Worldlens asks once before copying the legacy profile through a verified staging directory. Before any current-profile rename it flushes a durable phase journal; startup verifies a completed activation or restores the retained current root after a crash. It also migrates browser preferences before stores load, reads old and current repository markers/project files and encrypted private-transport payloads, and writes only current Worldlens identifiers.",
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "BlueMap remains the upstream project",
                    content:
                        "Worldlens is a from-scratch TypeScript port of BlueMap. The rename does not claim the BlueMap name or remove upstream credit. Worldlens stays free and keeps its BlueMap credit visible.",
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "New environment variables use WORLDLENS_. Legacy update-feed, GitHub-client and download-consent variables remain readable, with current names taking precedence. Packaged bridge builds try the Worldlens feed first and retain the former repository only until a current-feed download is durably confirmed. The Product display name is cosmetic: title bar, About, notifications and introductions only; diagnostics and machine identifiers always remain Worldlens.",
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
                        "Divergent old/new profile collisions stop without replacing either root.",
                        "Corrupt consent or receipt files are refused rather than guessed.",
                        "Interrupted staging is quarantined; a failed activation restores the prior Worldlens root.",
                        "Blocked browser storage leaves legacy values intact for a future retry.",
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
                        "Profile migration refuses symbolic links, hashes every copied file, never returns credential contents, and uses atomic consent, journal and receipt writes. Windows artifacts are intentionally unsigned: HTTPS identifies the contacted host and protects transport, while Squirrel metadata and hashes detect changed bytes; neither authenticates the publisher.",
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
                        "The matrix covers old-only, new-only, merge, collision, denial/retry, corrupt records, partial staging, rollback, idempotence, both marker generations, schema field preservation, preference namespaces and environment aliases. An isolated copy of the actual legacy profile migrated 885 files and 347,197,060 bytes with source unchanged and target byte-matched.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "appearance-editor",
            reason: "How migrated and newly exported appearance state is represented.",
        },
        {
            articleId: "release-pipeline",
            reason: "The build and publication gates after the identity migration lands.",
        },
        {
            articleId: "first-run-consent",
            reason: "The existing first-run decision model reused by profile migration.",
        },
    ],
    sources: [
        { label: "docs/worldlens-migration.md", href: repoFile("docs/worldlens-migration.md") },
        {
            label: "profileMigration.ts",
            href: repoFile("design/packages/app/src/main/migration/profileMigration.ts"),
        },
    ],
};

/**
 * Every external URL the content links to, in one place.
 *
 * They are all repository URLs on the project's own forge. The site itself makes no
 * network requests at runtime: these are ordinary links a reader chooses to follow,
 * not resources the page loads.
 */

export const REPO_OWNER = "Ding-Ding-Projects";
export const REPO_NAME = "worldlens";

/** Base path the site is served from. It is a project page, not a domain root. */
export const SITE_BASE_PATH = "/worldlens/";

export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
export const ISSUES_URL = `${REPO_URL}/issues`;
export const RELEASES_URL = `${REPO_URL}/releases`;
export const ACTIONS_URL = `${REPO_URL}/actions`;

/** A file on the default branch. Paths are repository-root relative. */
export function repoFile(path: string): string {
    return `${REPO_URL}/blob/main/${path}`;
}

/** An issue by number. */
export function issue(number: number): string {
    return `${ISSUES_URL}/${number}`;
}

export const PLAN_URL = repoFile("plan.md");
export const ROADMAP_URL = repoFile("design/ROADMAP.md");
export const HANDOFF_URL = repoFile("design/HANDOFF.md");
export const DEVIATIONS_URL = repoFile("design/docs/deviations.md");
export const CONTRACTS_URL = repoFile("design/docs/contracts/README.md");
export const CONVENTIONS_URL = repoFile("design/docs/porting-conventions.md");
export const SECURITY_POLICY_URL = repoFile("SECURITY.md");
export const DECISIONS_URL = repoFile("design/docs/decisions.md");
export const CI_WORKFLOW_URL = repoFile(".github/workflows/ci.yml");
export const PAGES_WORKFLOW_URL = repoFile(".github/workflows/pages.yml");
export const RENDER_WORLD_WORKFLOW_URL = repoFile(".github/workflows/render-world.yml");
export const RENDER_SHARD_WAVE_WORKFLOW_URL = repoFile(".github/workflows/render-shard-wave.yml");
export const RENDER_PRIVATE_WORKFLOW_URL = repoFile(".github/workflows/render-private-world.yml");
export const BUILD_JARS_WORKFLOW_URL = repoFile(".github/workflows/build-jars.yml");

/**
 * The long-form documents in the repository's own `docs/` directory.
 *
 * The site's articles summarise these and link out to them rather than copying them: two
 * copies of the same explanation drift apart, and the one in the repository is the one a
 * contributor edits.
 */
export const DOCS_INDEX_URL = repoFile("docs/README.md");
export const RENDER_IN_ACTIONS_DOC_URL = repoFile("docs/render-in-actions.md");
export const RESUMABLE_RENDERS_DOC_URL = repoFile("docs/resumable-renders.md");
export const LARGE_WORLDS_DOC_URL = repoFile("docs/large-worlds.md");
export const WORLD_SOURCES_DOC_URL = repoFile("docs/world-sources.md");
export const SSH_WORLD_SOURCES_DOC_URL = repoFile("docs/ssh-world-sources.md");
export const PRIVATE_WORLD_DOC_URL = repoFile("docs/private-world-rendering.md");
export const CHANGELOG_VIEWER_DOC_URL = repoFile("docs/changelog-viewer.md");
export const COMMAND_PALETTE_DOC_URL = repoFile("docs/command-palette.md");
export const NOTIFICATION_CENTRE_DOC_URL = repoFile("docs/notification-centre.md");
export const TABBED_NAVIGATION_DOC_URL = repoFile("docs/tabbed-navigation.md");
export const APPEARANCE_EDITORS_DOC_URL = repoFile("docs/appearance-editors.md");
export const SUPER_CONFIRMATION_DOC_URL = repoFile("docs/super-confirmation.md");
export const LANGUAGE_AND_TONE_DOC_URL = repoFile("docs/language-and-tone.md");
export const ACTION_ARTWORK_DOC_URL = repoFile("docs/action-artwork.md");
export const REGEX_BUILDER_DOC_URL = repoFile("docs/regex-builder.md");
export const LEGACY_WORLDS_DOC_URL = repoFile("docs/legacy-1-12-worlds.md");
export const CONFIG_HISTORY_DOC_URL = repoFile("docs/config-history.md");
export const BACKUP_DOC_URL = repoFile("docs/backup.md");
export const RENDER_CONSOLE_DOC_URL = repoFile("docs/render-console.md");
export const PUBLISHING_TO_PAGES_DOC_URL = repoFile("docs/pages-hosting.md");
export const AUTOMATIC_UPDATES_DOC_URL = repoFile("docs/automatic-updates.md");
export const DOCKER_AND_LOCAL_DOC_URL = repoFile("docs/docker-and-local.md");
export const DOCKER_WORLD_SOURCE_DOC_URL = repoFile("docs/docker-world-source.md");
export const REMOTE_RENDER_DOC_URL = repoFile("docs/remote-render.md");
export const REMOTE_HOSTING_DOC_URL = repoFile("docs/remote-hosting.md");
export const AUTOMATIC_REPAIR_DOC_URL = repoFile("docs/automatic-repair.md");
export const FINDING_WORLDS_DOC_URL = repoFile("docs/finding-worlds.md");
export const BEDROCK_WORLDS_DOC_URL = repoFile("docs/bedrock-worlds.md");
export const PAGES_FEATURE_PARITY_DOC_URL = repoFile("docs/pages-feature-parity.md");
export const SCHEDULED_SETTINGS_DOC_URL = repoFile(
    "docs/scheduled-settings-and-external-sources.md",
);
export const PANEL_GEOMETRY_DOC_URL = repoFile("docs/panel-geometry.md");

/** Upstream BlueMap, the project this is a port of. */
export const UPSTREAM_URL = "https://github.com/BlueMap-Minecraft/BlueMap";

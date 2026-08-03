/**
 * Every external URL the content links to, in one place.
 *
 * They are all repository URLs on the project's own forge. The site itself makes no
 * network requests at runtime: these are ordinary links a reader chooses to follow,
 * not resources the page loads.
 */

export const REPO_OWNER = "Ding-Ding-Projects";
export const REPO_NAME = "material-bluemap";

/** Base path the site is served from. It is a project page, not a domain root. */
export const SITE_BASE_PATH = "/material-bluemap/";

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
export const CI_WORKFLOW_URL = repoFile(".github/workflows/ci.yml");
export const PAGES_WORKFLOW_URL = repoFile(".github/workflows/pages.yml");

/** Upstream BlueMap, the project this is a port of. */
export const UPSTREAM_URL = "https://github.com/BlueMap-Minecraft/BlueMap";

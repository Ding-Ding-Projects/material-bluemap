/**
 * The GitHub Actions calls a CI render makes, and nothing else.
 *
 * Six things happen here: the repository's default branch is read (a dispatch is refused
 * without a ref), the **Render world** workflow is dispatched, the run it produced is
 * found, the run and its jobs are read, one failing job's log tail is fetched, and the
 * run's artifacts are listed. Nothing here uploads, downloads a world, or holds a token
 * of its own - the token arrives as an argument on every call, resolved per operation by
 * the caller from `github/session.ts`, exactly as `backup/github.ts` takes it.
 *
 * ## Why the run has to be *found* rather than returned
 *
 * `POST .../dispatches` answers **204 with an empty body**. GitHub does not tell the
 * caller which run it just created, and there is no correlation id to send. The only
 * route back to the run is to list the workflow's runs and take the newest one created
 * at or after the moment of the dispatch, which is what {@link findDispatchedRun} does.
 *
 * That is a real ambiguity and it is handled by refusing to create it: `sync.ts` will not
 * start a second CI render for the same repository and map while one is recorded as in
 * flight. Two dispatches inside the same window would otherwise be indistinguishable, and
 * following the wrong one means reporting somebody else's failure as theirs - or worse,
 * downloading somebody else's map and registering it as this world's.
 *
 * ## Every status is read, never inferred
 *
 * A run's `status` and `conclusion` are reported exactly as GitHub gives them, and a
 * `conclusion` of `null` is passed through as null rather than being softened into
 * "probably fine". A run that is still going has no conclusion; inventing one is the
 * single thing this module must never do.
 */

import { REQUIRED_SCOPE } from "../backup/index.js";
import type { FetchLike } from "../backup/index.js";

export type { FetchLike };

export const GITHUB_API_BASE = "https://api.github.com";

/** The workflow this feature drives. Named once so a rename cannot half-land. */
export const RENDER_WORKFLOW_FILE = "render-world.yml";

/** The artifact a single-group render publishes: the whole webapp with the map inside. */
export const RENDERED_MAP_ARTIFACT = "rendered-map";

export interface ActionsCallOptions {
    readonly fetch: FetchLike;
    readonly token: string;
    readonly signal?: AbortSignal | undefined;
    /** Overridable so a test never touches a real hostname. */
    readonly apiBase?: string | undefined;
}

/**
 * Every status GitHub documents for a run or a job, plus `unknown`.
 *
 * `unknown` is not a GitHub value: it is what an unrecognised string becomes, so a status
 * this build has never heard of is reported as unrecognised rather than quietly mapped
 * onto `completed`. A new status treated as completion would make a running render look
 * finished, which is the exact lie this feature exists not to tell.
 */
export type RunStatus =
    | "queued"
    | "in_progress"
    | "completed"
    | "waiting"
    | "requested"
    | "pending"
    | "unknown";

const KNOWN_STATUSES: readonly RunStatus[] = [
    "queued",
    "in_progress",
    "completed",
    "waiting",
    "requested",
    "pending",
];

export interface WorkflowJob {
    readonly id: number;
    readonly name: string;
    readonly status: RunStatus;
    /** `success`, `failure`, `cancelled`, `skipped`, ... or null while it is still going. */
    readonly conclusion: string | null;
    readonly htmlUrl: string;
    readonly startedAt: string | null;
    readonly completedAt: string | null;
}

export interface WorkflowRun {
    readonly id: number;
    readonly runNumber: number;
    readonly htmlUrl: string;
    readonly status: RunStatus;
    readonly conclusion: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    /** The commit the workflow ran from. This is what identifies the renderer exactly. */
    readonly headSha: string;
    readonly event: string;
}

export interface WorkflowArtifact {
    readonly id: number;
    readonly name: string;
    readonly sizeInBytes: number;
    readonly expired: boolean;
    /**
     * GitHub's own digest, when it published one, in `sha256:<hex>` form.
     *
     * Null on an instance or an artifact that predates the field. A null here is why the
     * collector says "recorded" rather than "verified" for that download: claiming a
     * verification that never happened is worse than admitting there was none.
     */
    readonly digest: string | null;
    readonly archiveDownloadUrl: string;
}

/** An Actions call that did not do what was asked, with the status and a sentence. */
export class ActionsCallError extends Error {
    readonly status: number;
    readonly url: string;
    /** True when the failing surface should offer its GitHub-accounts recovery action. */
    readonly needsSignIn: boolean;

    constructor(message: string, status: number, url: string, needsSignIn = false) {
        super(message);
        this.name = "ActionsCallError";
        this.status = status;
        this.url = url;
        this.needsSignIn = needsSignIn;
    }
}

function headers(token: string): Record<string, string> {
    return {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "worldlens",
        authorization: `Bearer ${token}`,
    };
}

function base(options: ActionsCallOptions): string {
    return options.apiBase ?? GITHUB_API_BASE;
}

function init(options: ActionsCallOptions, extra: RequestInit = {}): RequestInit {
    return {
        ...extra,
        headers: { ...headers(options.token), ...(extra.headers as Record<string, string> | undefined) },
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
}

/**
 * A refusal turned into a sentence somebody can act on.
 *
 * The four statuses that actually happen each mean something specific and none of them is
 * obvious from the number. 403 on a dispatch is nearly always a token without write access
 * to Actions rather than a broken workflow; 404 is GitHub declining to confirm that a
 * private repository - or a workflow file - exists to a token that cannot see it; and 422
 * on a dispatch means the workflow is there but has no `workflow_dispatch` trigger, or the
 * ref does not exist. Reporting the number alone sends people to the wrong place.
 */
async function refuse(response: Response, url: string, what: string): Promise<ActionsCallError> {
    let detail = "";
    try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === "string") detail = ` GitHub said: ${body.message}`;
    } catch {
        // A body that is not JSON is not worth failing over; the status carries the fact.
    }
    const explanation =
        response.status === 401
            ? " The GitHub sign-in on this computer is no longer accepted. Sign in again in Settings."
            : response.status === 403
              ? ` The signed-in account may not have the "${REQUIRED_SCOPE}" permission, which is` +
                " what starting a workflow needs. Sign in again and grant it."
              : response.status === 404
                ? ` Either ${RENDER_WORKFLOW_FILE} is not on the repository's default branch, or the` +
                  " signed-in account cannot see the repository - GitHub answers the same way for" +
                  " both, so a private repository the account has no access to looks exactly like a" +
                  " missing one."
                : response.status === 422
                  ? ` The workflow exists but would not accept the request: ${RENDER_WORKFLOW_FILE}` +
                    " needs a workflow_dispatch trigger, the branch has to exist, and every input" +
                    " has to be one the workflow declares."
                  : "";
    return new ActionsCallError(
        `${what} failed: GitHub answered ${String(response.status)}.${explanation}${detail}`,
        response.status,
        url,
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function text(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function optionalText(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function status(value: unknown): RunStatus {
    const raw = typeof value === "string" ? value : "";
    return KNOWN_STATUSES.find((known) => known === raw) ?? "unknown";
}

/**
 * The branch a dispatch runs on.
 *
 * Read rather than assumed. `main` is the common answer and `master` is a very ordinary
 * one, and a hard-coded guess fails with GitHub's generic 422 - which reads as "the
 * workflow is broken" rather than "that branch does not exist here".
 */
export async function readDefaultBranch(
    owner: string,
    repo: string,
    options: ActionsCallOptions,
): Promise<string> {
    const url = `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const response = await options.fetch(url, init(options));
    if (!response.ok) throw await refuse(response, url, `Reading ${owner}/${repo}`);
    const body: unknown = await response.json();
    const branch = isRecord(body) ? optionalText(body["default_branch"]) : null;
    if (branch === null || branch.length === 0) {
        throw new ActionsCallError(
            `GitHub did not say which branch is default on ${owner}/${repo}, and a workflow ` +
                "cannot be started without one.",
            response.status,
            url,
        );
    }
    return branch;
}

export interface WorkflowSummary {
    readonly id: number;
    readonly name: string;
    /** `active`, or `disabled_manually` for one somebody turned off in the Actions tab. */
    readonly state: string;
    readonly path: string;
}

/**
 * Reads the workflow itself: the cheapest call that proves a credential can see Actions.
 *
 * Used as the **capability probe** that decides which credential route drives a sync. It
 * proves that the workflow exists and is visible to that credential, which is exactly what
 * it claims and no more - a dispatch can still be refused for want of write access, and
 * when it is, the refusal names the route in play so the person knows which credential to
 * fix rather than guessing between two.
 */
export async function readWorkflow(
    owner: string,
    repo: string,
    workflowFile: string,
    options: ActionsCallOptions,
): Promise<WorkflowSummary> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/workflows/${encodeURIComponent(workflowFile)}`;
    const response = await options.fetch(url, init(options));
    if (!response.ok) throw await refuse(response, url, `Reading ${workflowFile} on ${owner}/${repo}`);
    const summary = parseWorkflow(await response.json());
    if (summary === null) {
        throw new ActionsCallError(
            `GitHub described ${workflowFile} in a way this build could not read.`,
            response.status,
            url,
        );
    }
    return summary;
}

/** One workflow's JSON, shared by both credential routes. */
export function parseWorkflow(value: unknown): WorkflowSummary | null {
    if (!isRecord(value)) return null;
    const id = value["id"];
    if (typeof id !== "number") return null;
    return {
        id,
        name: text(value["name"]),
        state: text(value["state"], "active"),
        path: text(value["path"]),
    };
}

/**
 * Starts the workflow. Answers nothing on success, because GitHub answers nothing.
 *
 * 204 and an empty body is the documented success. The run id is not in it, which is why
 * {@link findDispatchedRun} exists at all.
 */
export async function dispatchWorkflow(
    owner: string,
    repo: string,
    workflowFile: string,
    ref: string,
    inputs: Readonly<Record<string, string>>,
    options: ActionsCallOptions,
): Promise<void> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
    const response = await options.fetch(
        url,
        init(options, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ref, inputs }),
        }),
    );
    if (!response.ok) throw await refuse(response, url, `Starting ${workflowFile} on ${owner}/${repo}`);
}

/* -------------------------------------------------------------------------- */
/* Repository variables: how the scheduled render workflow is configured      */
/* -------------------------------------------------------------------------- */

/**
 * Reads one repository variable, or null when it is not set.
 *
 * This is how the desktop app's CI-render screen reads back what
 * `.github/workflows/scheduled-render.yml` last found - `CIRENDER_SCHEDULE_LAST_CHECK_AT`
 * and friends - and how it reads the config it wrote itself. Never a secret: a repository
 * variable is plain text anyone who can see the repository's settings can already read, so
 * nothing here is treated as sensitive the way a token is.
 */
export async function readRepositoryVariable(
    owner: string,
    repo: string,
    name: string,
    options: ActionsCallOptions,
): Promise<string | null> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/variables/${encodeURIComponent(name)}`;
    const response = await options.fetch(url, init(options));
    if (response.status === 404) return null;
    if (!response.ok) throw await refuse(response, url, `Reading the repository variable ${name}`);
    const body: unknown = await response.json();
    const value = isRecord(body) ? body["value"] : null;
    return typeof value === "string" ? value : null;
}

/**
 * Creates or updates one repository variable.
 *
 * GitHub has no single "set this, whether or not it exists yet" endpoint: updating one
 * that is not there answers 404, and creating one that already exists answers 422. So this
 * tries the update first - the common case, once scheduling has been turned on once - and
 * only falls back to creating it on a 404, rather than reading first and racing a second
 * writer between the read and the write.
 */
export async function writeRepositoryVariable(
    owner: string,
    repo: string,
    name: string,
    value: string,
    options: ActionsCallOptions,
): Promise<void> {
    const updateUrl =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/variables/${encodeURIComponent(name)}`;
    const updateResponse = await options.fetch(
        updateUrl,
        init(options, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ value }),
        }),
    );
    if (updateResponse.ok) return;
    if (updateResponse.status !== 404) {
        throw await refuse(updateResponse, updateUrl, `Setting the repository variable ${name}`);
    }

    const createUrl =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables`;
    const createResponse = await options.fetch(
        createUrl,
        init(options, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, value }),
        }),
    );
    if (!createResponse.ok) {
        throw await refuse(createResponse, createUrl, `Creating the repository variable ${name}`);
    }
}

/**
 * The run a dispatch produced, or null while GitHub has not created it yet.
 *
 * Correlation is by creation time, because there is nothing else to correlate on. `since`
 * is nudged back by a few seconds before comparing: GitHub stamps `created_at` from its
 * own clock, and a local clock a second or two ahead would reject the run it just asked
 * for and then wait for it for ever.
 */
export async function findDispatchedRun(
    owner: string,
    repo: string,
    workflowFile: string,
    since: Date,
    options: ActionsCallOptions,
): Promise<WorkflowRun | null> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/workflows/${encodeURIComponent(workflowFile)}/runs?event=workflow_dispatch&per_page=30`;
    const response = await options.fetch(url, init(options));
    if (!response.ok) throw await refuse(response, url, `Listing runs of ${workflowFile}`);

    return pickDispatchedRun(await response.json(), since);
}

/**
 * The correlation itself, over a `/runs` body, shared by both credential routes.
 *
 * One implementation because the two routes fetch the same JSON by different means, and a
 * second copy of "which of these runs is mine" would be a second place for the clock-skew
 * allowance to be forgotten.
 */
export function pickDispatchedRun(body: unknown, since: Date): WorkflowRun | null {
    const raw = isRecord(body) ? body["workflow_runs"] : null;
    if (!Array.isArray(raw)) return null;

    const floor = since.getTime() - CLOCK_SKEW_ALLOWANCE_MS;
    let best: WorkflowRun | null = null;
    for (const item of raw) {
        const run = parseRun(item);
        if (run === null) continue;
        const created = Date.parse(run.createdAt);
        if (!Number.isFinite(created) || created < floor) continue;
        if (best === null || run.id > best.id) best = run;
    }
    return best;
}

/** Five seconds. Enough for an ordinary clock disagreement, far short of a stale run. */
const CLOCK_SKEW_ALLOWANCE_MS = 5000;

/** One run, read fresh. */
export async function readRun(
    owner: string,
    repo: string,
    runId: number,
    options: ActionsCallOptions,
): Promise<WorkflowRun> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/runs/${String(runId)}`;
    const response = await options.fetch(url, init(options));
    if (!response.ok) throw await refuse(response, url, `Reading run ${String(runId)}`);
    const run = parseRun(await response.json());
    if (run === null) {
        throw new ActionsCallError(
            `GitHub described run ${String(runId)} in a way this build could not read.`,
            response.status,
            url,
        );
    }
    return run;
}

/** Every job of a run, in the order GitHub lists them, with their real states. */
export async function readRunJobs(
    owner: string,
    repo: string,
    runId: number,
    options: ActionsCallOptions,
): Promise<readonly WorkflowJob[]> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/runs/${String(runId)}/jobs?per_page=100`;
    const response = await options.fetch(url, init(options));
    if (!response.ok) throw await refuse(response, url, `Reading the jobs of run ${String(runId)}`);
    return parseJobs(await response.json());
}

/** The `/jobs` body, shared by both credential routes. */
export function parseJobs(body: unknown): readonly WorkflowJob[] {
    const raw = isRecord(body) ? body["jobs"] : null;
    if (!Array.isArray(raw)) return [];

    const jobs: WorkflowJob[] = [];
    for (const item of raw) {
        if (!isRecord(item)) continue;
        const id = item["id"];
        if (typeof id !== "number") continue;
        jobs.push({
            id,
            name: text(item["name"], `job ${String(id)}`),
            status: status(item["status"]),
            conclusion: optionalText(item["conclusion"]),
            htmlUrl: text(item["html_url"]),
            startedAt: optionalText(item["started_at"]),
            completedAt: optionalText(item["completed_at"]),
        });
    }
    return jobs;
}

/** How many lines of a failing job's log are carried back. */
export const LOG_TAIL_LINES = 40;

/**
 * The tail of one job's log, or null when it could not be read.
 *
 * **Null is not an error.** A log can be expired, still being written, or refused to a
 * token that may read the run but not its logs, and none of those are what went wrong -
 * the render did. Turning a missing log into a thrown error would replace the real
 * failure with a failure to describe it, which is the more confusing of the two.
 *
 * The tail rather than the whole log: an Actions log is routinely megabytes, and the part
 * that says what happened is at the end.
 */
export async function readJobLogTail(
    owner: string,
    repo: string,
    jobId: number,
    options: ActionsCallOptions,
    maxLines: number = LOG_TAIL_LINES,
): Promise<string | null> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/jobs/${String(jobId)}/logs`;
    let response: Response;
    try {
        response = await options.fetch(url, init(options, { redirect: "follow" }));
    } catch {
        return null;
    }
    if (!response.ok) return null;

    let body: string;
    try {
        body = await response.text();
    } catch {
        return null;
    }
    const lines = body.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return null;
    return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

/** Every artifact a run published, expired ones included and marked as such. */
export async function listRunArtifacts(
    owner: string,
    repo: string,
    runId: number,
    options: ActionsCallOptions,
): Promise<readonly WorkflowArtifact[]> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/runs/${String(runId)}/artifacts?per_page=100`;
    const response = await options.fetch(url, init(options));
    if (!response.ok) throw await refuse(response, url, `Listing the artifacts of run ${String(runId)}`);
    return parseArtifacts(await response.json(), artifactZipUrl(base(options), owner, repo));
}

/** The URL an artifact's zip lives at, when GitHub's own answer did not carry one. */
export function artifactZipUrl(apiBase: string, owner: string, repo: string): (id: number) => string {
    return (id) =>
        `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/actions/artifacts/${String(id)}/zip`;
}

/** The `/artifacts` body, shared by both credential routes. */
export function parseArtifacts(body: unknown, fallbackUrl: (id: number) => string): readonly WorkflowArtifact[] {
    const raw = isRecord(body) ? body["artifacts"] : null;
    if (!Array.isArray(raw)) return [];

    const artifacts: WorkflowArtifact[] = [];
    for (const item of raw) {
        if (!isRecord(item)) continue;
        const id = item["id"];
        const name = item["name"];
        if (typeof id !== "number" || typeof name !== "string") continue;
        artifacts.push({
            id,
            name,
            sizeInBytes: typeof item["size_in_bytes"] === "number" ? item["size_in_bytes"] : 0,
            expired: item["expired"] === true,
            digest: optionalText(item["digest"]),
            archiveDownloadUrl: text(item["archive_download_url"], fallbackUrl(id)),
        });
    }
    return artifacts;
}

/** The headers an artifact download carries. Exported so the collector cannot drift. */
export function artifactDownloadHeaders(token: string): Record<string, string> {
    return { ...headers(token), accept: "application/vnd.github+json" };
}

/* -------------------------------------------------------------------------- */
/* Repository readiness: empty, Actions policy, scopes, and raw file content   */
/* -------------------------------------------------------------------------- */

/**
 * Whether a repository has ever had a commit.
 *
 * A repository somebody just created through `gh repo create` or the GitHub website has
 * **no default-branch ref at all** until its first commit lands - not an empty one, none.
 * `GET /repos/{o}/{r}` still answers with a `default_branch` name in that state (GitHub
 * names what the branch *will be*, not what exists), so that call cannot tell "empty" from
 * "has commits". `GET .../commits` can: GitHub answers `409 Conflict` with "Git Repository
 * is empty." for a repository with no commits, and `200` with a list otherwise. This is the
 * one call the bootstrap flow trusts to tell the two apart.
 */
export async function isRepositoryEmpty(
    owner: string,
    repo: string,
    options: ActionsCallOptions,
): Promise<boolean> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        "/commits?per_page=1";
    const response = await options.fetch(url, init(options));
    if (response.status === 409) return true;
    if (response.ok) return false;
    throw await refuse(response, url, `Reading whether ${owner}/${repo} has any commits`);
}

export type ActionsPolicy =
    /** GitHub confirmed Actions is switched on for this repository. */
    | { readonly state: "enabled" }
    /** GitHub confirmed Actions is switched off - by the repository or by an org policy. */
    | { readonly state: "disabled"; readonly allowedActions: string | null }
    /**
     * GitHub would not say. Reading this endpoint needs admin access to the repository, so
     * a token that can push but is not an admin gets refused here even though it can start
     * a workflow perfectly well - a 403 on this one call is not evidence of anything.
     */
    | { readonly state: "unknown"; readonly reason: string };

/**
 * Whether GitHub will actually run a workflow on this repository at all.
 *
 * Distinct from the workflow file existing: an organisation can disable Actions outright,
 * or restrict it to a list that does not include this workflow, and a perfectly present
 * `render-world.yml` will still never start. `readWorkflow`'s own `state` field only says
 * whether *that one workflow* was switched off in the Actions tab - this is the repository
 * (and, transitively, the organisation policy behind it) - so both are read and reported
 * separately rather than folded into one guess.
 */
export async function readActionsPolicy(
    owner: string,
    repo: string,
    options: ActionsCallOptions,
): Promise<ActionsPolicy> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        "/actions/permissions";
    const response = await options.fetch(url, init(options));
    if (response.status === 403 || response.status === 404) {
        return {
            state: "unknown",
            reason:
                "Reading whether Actions is enabled needs admin access to the repository, and this" +
                " account does not have it here. Actions being disabled would show up as every run" +
                " refusing to start rather than as this call succeeding.",
        };
    }
    if (!response.ok) {
        throw await refuse(response, url, `Reading whether Actions is enabled on ${owner}/${repo}`);
    }
    const body: unknown = await response.json();
    const enabled = isRecord(body) ? body["enabled"] : null;
    const allowedActions = isRecord(body) ? optionalText(body["allowed_actions"]) : null;
    if (enabled === true) return { state: "enabled" };
    if (enabled === false) return { state: "disabled", allowedActions };
    return {
        state: "unknown",
        reason: "GitHub described the repository's Actions setting in a way this build could not read.",
    };
}

/**
 * The OAuth scopes a **classic** personal access token carries, read from the response
 * headers of an ordinary call rather than from a dedicated endpoint - GitHub has none.
 *
 * `null` is not "no scopes"; it is "could not be read", and that happens for the tokens
 * this application increasingly issues by default: a fine-grained personal access token or
 * an OAuth App/GitHub App installation token carries no `x-oauth-scopes` header at all,
 * because scopes are not how those authorize. A `null` here is reported as "could not be
 * checked in advance" rather than as a missing scope - claiming a scope is absent from a
 * header that was never going to be sent would send somebody to re-authorize for no reason.
 */
export async function readTokenScopes(
    options: ActionsCallOptions,
): Promise<{ readonly scopes: readonly string[] | null }> {
    const url = `${base(options)}/rate_limit`;
    const response = await options.fetch(url, init(options));
    const header = response.headers.get("x-oauth-scopes");
    if (header === null) return { scopes: null };
    const scopes = header
        .split(",")
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0);
    return { scopes };
}

/** One file's content, as the Contents API describes it. */
export interface RepositoryFile {
    /** The blob's own git sha, required to update it without racing another writer. */
    readonly sha: string;
    readonly contentBase64: string;
}

/**
 * One file at a path, on a repository's default branch, or null when there is none.
 *
 * `404` is the only "there is nothing here" answer the Contents API gives, and it means
 * exactly that for a bootstrap: no file at this path is not a refusal, it is the case the
 * whole feature exists to fix.
 */
export async function readRepositoryFile(
    owner: string,
    repo: string,
    path: string,
    options: ActionsCallOptions,
): Promise<RepositoryFile | null> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
    const response = await options.fetch(url, init(options));
    if (response.status === 404) return null;
    if (!response.ok) throw await refuse(response, url, `Reading ${path} on ${owner}/${repo}`);
    const body: unknown = await response.json();
    if (!isRecord(body)) return null;
    const sha = body["sha"];
    const content = body["content"];
    if (typeof sha !== "string" || typeof content !== "string") return null;
    // GitHub wraps base64 content at 60 characters with embedded newlines; callers decode
    // it themselves, and the newlines are harmless to a base64 decoder either way.
    return { sha, contentBase64: content };
}

/**
 * Creates or updates one file at a path, on a repository's default branch.
 *
 * This is the one call in this feature that writes a file rather than a repository
 * variable, and it is also the one call that makes the empty-repository case tractable:
 * the Contents API creates a repository's **first commit** from a plain `PUT` with no
 * `sha`, exactly the same call that updates an existing file when one is given. There is no
 * separate "initialize this repository" step to forget.
 *
 * `sha` omitted means "this file does not exist yet, create it" - GitHub answers `422` if
 * it turns out to exist after all, which is the race this refuses to paper over by
 * retrying: the caller asked to create a specific absence and found it gone.
 */
export async function writeRepositoryFile(
    owner: string,
    repo: string,
    path: string,
    contentBase64: string,
    message: string,
    options: ActionsCallOptions,
    sha?: string,
): Promise<{ readonly sha: string; readonly commitSha: string | null }> {
    const url =
        `${base(options)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
    const response = await options.fetch(
        url,
        init(options, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message, content: contentBase64, ...(sha === undefined ? {} : { sha }) }),
        }),
    );
    if (!response.ok) throw await refuse(response, url, `Writing ${path} on ${owner}/${repo}`);
    const body: unknown = await response.json();
    const content = isRecord(body) ? body["content"] : null;
    const newSha = isRecord(content) ? content["sha"] : null;
    const commit = isRecord(body) ? body["commit"] : null;
    const commitSha = isRecord(commit) ? commit["sha"] : null;
    if (typeof newSha !== "string") {
        throw new ActionsCallError(
            `GitHub accepted the write to ${path} on ${owner}/${repo} but did not answer with the` +
                " file's new sha, so a following write to the same path cannot be made safely.",
            response.status,
            url,
        );
    }
    return { sha: newSha, commitSha: typeof commitSha === "string" ? commitSha : null };
}

/** One run's JSON, shared by both credential routes. Null for anything unreadable. */
export function parseRun(value: unknown): WorkflowRun | null {
    if (!isRecord(value)) return null;
    const id = value["id"];
    if (typeof id !== "number") return null;
    return {
        id,
        runNumber: typeof value["run_number"] === "number" ? value["run_number"] : 0,
        htmlUrl: text(value["html_url"]),
        status: status(value["status"]),
        conclusion: optionalText(value["conclusion"]),
        createdAt: text(value["created_at"]),
        updatedAt: text(value["updated_at"]),
        headSha: text(value["head_sha"]),
        event: text(value["event"]),
    };
}

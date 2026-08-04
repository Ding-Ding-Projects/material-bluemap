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

    constructor(message: string, status: number, url: string) {
        super(message);
        this.name = "ActionsCallError";
        this.status = status;
        this.url = url;
    }
}

function headers(token: string): Record<string, string> {
    return {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "material-bluemap",
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

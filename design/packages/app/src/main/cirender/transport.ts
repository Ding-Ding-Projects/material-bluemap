/**
 * The two ways a CI render can reach GitHub, behind one interface.
 *
 * There are two credentials on a typical machine and they are not interchangeable. The
 * application's own sign-in is the ordinary one. `gh` is the other, and it routinely holds
 * things the in-app flow does not: an enterprise host, a SAML/SSO session already
 * authorised for an organisation, a token with scopes nobody thought to ask for. Somebody
 * already signed in to `gh` should not have to sign in twice, and somebody whose in-app
 * token turns out to be short a scope should get a route that works.
 *
 * ## One route drives the whole sync, never a mixture
 *
 * {@link resolveTransport} picks a route **once**, before anything starts, and the same
 * transport then dispatches the workflow, follows the run, reads the failing job's log and
 * downloads the artifact. Mixing them - dispatch through `gh`, download through the API -
 * would work perfectly on a machine where both are authorised and fail halfway through on
 * one where only one is, with a message about the download that is really about the
 * credential. Half a render is the worst outcome available here, so it is designed out.
 *
 * ## The probe proves what it proves, and the refusal says which credential is in play
 *
 * Choosing is not guessing: each candidate is asked to read the workflow, which is the
 * cheapest call that proves a credential can see Actions on that repository. It does not
 * prove a dispatch will be permitted - only a dispatch proves that - so every failure
 * carries the route that produced it. "Permission denied" is unactionable when a person
 * cannot tell which of their two GitHub sign-ins was refused.
 *
 * ## What the route does *not* cover
 *
 * The **upload** is a backup, and a backup is the append-only release machinery in
 * `main/backup/` with its pointer, its sidecar and its resumable part upload. Rerouting
 * that through `gh release upload` would be a second uploader, which this feature is
 * expressly built not to have. So an upload needs the in-app sign-in: with only `gh`
 * available, a world already published can be rendered and a world that needs uploading is
 * refused with that exact sentence rather than a generic one.
 */

import { findReleaseByTag } from "../backup/index.js";
import type { FetchLike } from "../backup/index.js";
import { downloadToFile } from "../download/http.js";
import {
    artifactDownloadHeaders,
    artifactZipUrl,
    dispatchWorkflow,
    findDispatchedRun,
    listRunArtifacts,
    parseArtifacts,
    parseJobs,
    parseRun,
    parseWorkflow,
    pickDispatchedRun,
    readDefaultBranch,
    readJobLogTail,
    readRun,
    readRunJobs,
    readWorkflow,
    LOG_TAIL_LINES,
    ActionsCallError,
} from "./actions.js";
import type { WorkflowArtifact, WorkflowJob, WorkflowRun, WorkflowSummary } from "./actions.js";
import { GH_COMMAND, GH_LOGIN_COMMAND, detectGh, ghApiJson, ghApiPost, ghApiToFile } from "./gh.js";
import type { GhStatus, ProcessRunner } from "./gh.js";

export type CiRoute = "session" | "gh";

/** Everything the sync loop asks of GitHub, in one place, for either credential. */
export interface CiTransport {
    readonly route: CiRoute;
    /** One phrase naming the credential in play, for a message a person has to act on. */
    readonly describe: string;
    /** False when this route cannot upload a world - see the note on `gh` above. */
    readonly canUpload: boolean;

    readWorkflow(owner: string, repo: string, workflowFile: string): Promise<WorkflowSummary>;
    readDefaultBranch(owner: string, repo: string): Promise<string>;
    dispatchWorkflow(
        owner: string,
        repo: string,
        workflowFile: string,
        ref: string,
        inputs: Readonly<Record<string, string>>,
    ): Promise<void>;
    findDispatchedRun(
        owner: string,
        repo: string,
        workflowFile: string,
        since: Date,
    ): Promise<WorkflowRun | null>;
    readRun(owner: string, repo: string, runId: number): Promise<WorkflowRun>;
    readRunJobs(owner: string, repo: string, runId: number): Promise<readonly WorkflowJob[]>;
    readJobLogTail(owner: string, repo: string, jobId: number, maxLines?: number): Promise<string | null>;
    listRunArtifacts(owner: string, repo: string, runId: number): Promise<readonly WorkflowArtifact[]>;
    downloadArtifact(
        owner: string,
        repo: string,
        artifact: WorkflowArtifact,
        destination: string,
        onBytes?: (done: number, total: number) => void,
    ): Promise<void>;
    /** True when that release still carries that asset, in an uploaded state. */
    releaseHasAsset(owner: string, repo: string, tag: string, assetName: string): Promise<boolean>;
}

export interface SessionTransportOptions {
    readonly fetch: FetchLike;
    readonly token: string;
    readonly signal?: AbortSignal | undefined;
    readonly apiBase?: string | undefined;
    /** How the interface names this credential. The account login when it is known. */
    readonly account?: string | null | undefined;
}

/** The application's own sign-in, over the REST API. The ordinary route. */
export function sessionTransport(options: SessionTransportOptions): CiTransport {
    const call = {
        fetch: options.fetch,
        token: options.token,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
    };
    return {
        route: "session",
        describe:
            options.account === null || options.account === undefined
                ? "the GitHub sign-in in this application"
                : `the GitHub sign-in in this application (${options.account})`,
        canUpload: true,
        readWorkflow: (owner, repo, file) => readWorkflow(owner, repo, file, call),
        readDefaultBranch: (owner, repo) => readDefaultBranch(owner, repo, call),
        dispatchWorkflow: (owner, repo, file, ref, inputs) =>
            dispatchWorkflow(owner, repo, file, ref, inputs, call),
        findDispatchedRun: (owner, repo, file, since) => findDispatchedRun(owner, repo, file, since, call),
        readRun: (owner, repo, runId) => readRun(owner, repo, runId, call),
        readRunJobs: (owner, repo, runId) => readRunJobs(owner, repo, runId, call),
        readJobLogTail: (owner, repo, jobId, maxLines) =>
            readJobLogTail(owner, repo, jobId, call, maxLines ?? LOG_TAIL_LINES),
        listRunArtifacts: (owner, repo, runId) => listRunArtifacts(owner, repo, runId, call),
        async downloadArtifact(_owner, _repo, artifact, destination, onBytes): Promise<void> {
            await downloadToFile(artifact.archiveDownloadUrl, destination, {
                fetch: options.fetch,
                headers: artifactDownloadHeaders(options.token),
                ...(options.signal === undefined ? {} : { signal: options.signal }),
                ...(artifact.sizeInBytes > 0 ? { expectedBytes: artifact.sizeInBytes } : {}),
                ...(onBytes === undefined
                    ? {}
                    : { onBytes: (_delta, total) => onBytes(total, artifact.sizeInBytes) }),
            });
        },
        async releaseHasAsset(owner, repo, tag, assetName): Promise<boolean> {
            const release = await findReleaseByTag(owner, repo, tag, call);
            if (release === null) return false;
            return release.assets.some((asset) => asset.name === assetName && asset.state === "uploaded");
        },
    };
}

export interface GhTransportOptions {
    readonly runner: ProcessRunner;
    readonly signal?: AbortSignal | undefined;
    /** The host `gh auth status` reported. Passed through so an enterprise host is kept. */
    readonly host?: string | undefined;
    readonly account?: string | null | undefined;
}

/**
 * The `gh` command-line tool, over `gh api`.
 *
 * Every call goes through `gh api`, not through `gh run view` or `gh run download`. Two
 * reasons. `gh api` returns GitHub's own JSON, so **the same parsers** run for both routes
 * and the two cannot drift about what a job's status means. And `gh run download` unpacks
 * an artifact into a directory, which would skip the zip - and with it the digest check
 * the collector runs before anything is unpacked.
 */
export function ghTransport(options: GhTransportOptions): CiTransport {
    const api = {
        runner: options.runner,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.host === undefined ? {} : { host: options.host }),
    };
    const path = (owner: string, repo: string): string =>
        `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

    return {
        route: "gh",
        describe:
            options.account === null || options.account === undefined
                ? `the ${GH_COMMAND} command-line tool`
                : `the ${GH_COMMAND} command-line tool (${options.account})`,
        // The upload is the backup surface, which speaks to GitHub with the in-app token.
        // Saying so here is what lets the sync refuse with the real reason rather than
        // failing somewhere inside a packer.
        canUpload: false,

        async readWorkflow(owner, repo, file): Promise<WorkflowSummary> {
            const body = await ghApiJson(`${path(owner, repo)}/actions/workflows/${encodeURIComponent(file)}`, api);
            const summary = parseWorkflow(body);
            if (summary === null) {
                throw new ActionsCallError(`${GH_COMMAND} described ${file} unreadably.`, 0, file);
            }
            return summary;
        },

        async readDefaultBranch(owner, repo): Promise<string> {
            const body = await ghApiJson(path(owner, repo), api);
            const branch =
                typeof body === "object" && body !== null
                    ? (body as Record<string, unknown>)["default_branch"]
                    : null;
            if (typeof branch !== "string" || branch.length === 0) {
                throw new ActionsCallError(
                    `${GH_COMMAND} did not say which branch is default on ${owner}/${repo}, and a ` +
                        "workflow cannot be started without one.",
                    0,
                    `${owner}/${repo}`,
                );
            }
            return branch;
        },

        dispatchWorkflow: async (owner, repo, file, ref, inputs): Promise<void> => {
            await ghApiPost(
                `${path(owner, repo)}/actions/workflows/${encodeURIComponent(file)}/dispatches`,
                { ref, inputs },
                api,
            );
        },

        findDispatchedRun: async (owner, repo, file, since): Promise<WorkflowRun | null> =>
            pickDispatchedRun(
                await ghApiJson(
                    `${path(owner, repo)}/actions/workflows/${encodeURIComponent(file)}` +
                        "/runs?event=workflow_dispatch&per_page=30",
                    api,
                ),
                since,
            ),

        async readRun(owner, repo, runId): Promise<WorkflowRun> {
            const run = parseRun(await ghApiJson(`${path(owner, repo)}/actions/runs/${String(runId)}`, api));
            if (run === null) {
                throw new ActionsCallError(
                    `${GH_COMMAND} described run ${String(runId)} unreadably.`,
                    0,
                    String(runId),
                );
            }
            return run;
        },

        readRunJobs: async (owner, repo, runId): Promise<readonly WorkflowJob[]> =>
            parseJobs(await ghApiJson(`${path(owner, repo)}/actions/runs/${String(runId)}/jobs?per_page=100`, api)),

        async readJobLogTail(owner, repo, jobId, maxLines): Promise<string | null> {
            // The same rule as the API route: a log that cannot be read answers null, not
            // an error. A missing log must never replace the render failure it was fetched
            // to explain.
            let raw: unknown;
            try {
                raw = await ghApiJson(`${path(owner, repo)}/actions/jobs/${String(jobId)}/logs`, api);
            } catch {
                return await ghLogText(owner, repo, jobId, api, maxLines ?? LOG_TAIL_LINES);
            }
            return typeof raw === "string" ? tail(raw, maxLines ?? LOG_TAIL_LINES) : null;
        },

        listRunArtifacts: async (owner, repo, runId): Promise<readonly WorkflowArtifact[]> =>
            parseArtifacts(
                await ghApiJson(`${path(owner, repo)}/actions/runs/${String(runId)}/artifacts?per_page=100`, api),
                artifactZipUrl("", owner, repo),
            ),

        async downloadArtifact(owner, repo, artifact, destination, onBytes): Promise<void> {
            const bytes = await ghApiToFile(
                `${path(owner, repo)}/actions/artifacts/${String(artifact.id)}/zip`,
                destination,
                api,
            );
            onBytes?.(bytes, artifact.sizeInBytes);
        },

        async releaseHasAsset(owner, repo, tag, assetName): Promise<boolean> {
            try {
                const body = await ghApiJson(`${path(owner, repo)}/releases/tags/${encodeURIComponent(tag)}`, api);
                const assets =
                    typeof body === "object" && body !== null
                        ? (body as Record<string, unknown>)["assets"]
                        : null;
                if (!Array.isArray(assets)) return false;
                return assets.some((asset) => {
                    if (typeof asset !== "object" || asset === null) return false;
                    const record = asset as Record<string, unknown>;
                    return record["name"] === assetName && record["state"] === "uploaded";
                });
            } catch {
                // A release that cannot be read is treated as gone, so the world is
                // uploaded again. That costs an upload and is always correct; guessing the
                // other way dispatches a run whose first step finds nothing.
                return false;
            }
        },
    };
}

/**
 * `gh api` on a `/logs` endpoint follows the redirect and prints plain text, which is not
 * JSON - so the JSON call throws and this reads the same endpoint as text instead. Both
 * are attempted because `gh` has answered each way across versions, and a log is never
 * worth failing a render report over.
 */
async function ghLogText(
    owner: string,
    repo: string,
    jobId: number,
    api: { runner: ProcessRunner; signal?: AbortSignal | undefined; host?: string | undefined },
    maxLines: number,
): Promise<string | null> {
    const args = ["api", "-H", "Accept: application/vnd.github+json"];
    if (api.host !== undefined && api.host.length > 0) args.push("--hostname", api.host);
    args.push(
        `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/jobs/${String(jobId)}/logs`,
    );
    const result = await api.runner.run(GH_COMMAND, args, {
        ...(api.signal === undefined ? {} : { signal: api.signal }),
    });
    if (!result.started || result.code !== 0) return null;
    return tail(result.stdout, maxLines);
}

function tail(body: string, maxLines: number): string | null {
    const lines = body.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return null;
    return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

/* -------------------------------------------------------------------------- */
/* Choosing                                                                   */
/* -------------------------------------------------------------------------- */

export interface RouteReport {
    readonly route: CiRoute | null;
    /** What the interface shows: which credential is driving, or why none can. */
    readonly describe: string;
    /** The in-app sign-in's own state, so the surface can offer the right button. */
    readonly session: { readonly signedIn: boolean; readonly usable: boolean; readonly reason: string | null };
    readonly gh: GhStatus & { readonly usable: boolean; readonly reason: string | null };
    /** False when neither credential can drive a render, with both reasons above. */
    readonly ready: boolean;
    /** True only when the chosen route can also upload a world. */
    readonly canUpload: boolean;
}

export interface ResolveTransportOptions {
    readonly owner: string;
    readonly repo: string;
    readonly workflowFile: string;
    /** The in-app token, or null when nobody is signed in to the application. */
    readonly token: string | null;
    readonly account?: string | null | undefined;
    readonly fetch: FetchLike;
    readonly runner: ProcessRunner;
    readonly signal?: AbortSignal | undefined;
    readonly apiBase?: string | undefined;
    /** Force a route, for somebody who knows which credential they want. */
    readonly prefer?: CiRoute | undefined;
}

export interface ResolvedTransport {
    readonly report: RouteReport;
    /** Null when neither credential could drive a render. `report` says why. */
    readonly transport: CiTransport | null;
}

/**
 * Picks the credential this sync will run on, and says why.
 *
 * The in-app sign-in is preferred whenever it exists **and** can actually see the
 * workflow, because it is the credential the application manages and can renew. `gh` is
 * the fallback, and it is a real one rather than an error message: an in-app token short
 * a scope, or an organisation that has not authorised it for SSO, both look like a 403 on
 * the probe and both are exactly the case `gh` usually solves.
 *
 * Nothing is chosen silently. The report names the route, names the account, and carries
 * the other route's reason for not being used, so somebody debugging a permission problem
 * can see which of their two GitHub sign-ins was refused and why.
 */
export async function resolveTransport(options: ResolveTransportOptions): Promise<ResolvedTransport> {
    const wantsGh = options.prefer === "gh";
    let sessionUsable = false;
    let sessionReason: string | null = null;

    const session =
        options.token === null
            ? null
            : sessionTransport({
                  fetch: options.fetch,
                  token: options.token,
                  ...(options.signal === undefined ? {} : { signal: options.signal }),
                  ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
                  ...(options.account === undefined ? {} : { account: options.account }),
              });

    if (session === null) {
        sessionReason = "nobody is signed in to GitHub inside this application - sign in from Settings";
    } else if (wantsGh) {
        sessionReason = `The ${GH_COMMAND} route was asked for explicitly.`;
    } else {
        try {
            await session.readWorkflow(options.owner, options.repo, options.workflowFile);
            sessionUsable = true;
        } catch (error) {
            sessionReason = error instanceof Error ? error.message : String(error);
        }
    }

    if (sessionUsable && session !== null) {
        return {
            transport: session,
            report: {
                route: "session",
                describe: `Using ${session.describe}.`,
                session: { signedIn: true, usable: true, reason: null },
                // Not probed at all: `gh` is the fallback, and running two extra processes
                // to describe a route that is not going to be used costs a person time
                // every single sync for information nobody asked for.
                gh: {
                    availability: "not-installed",
                    version: null,
                    account: null,
                    host: null,
                    message: `${GH_COMMAND} was not checked: the sign-in in this application worked.`,
                    usable: false,
                    reason: "not needed",
                },
                ready: true,
                canUpload: true,
            },
        };
    }

    const gh = await detectGh(options.runner, {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    let ghUsable = false;
    let ghReason: string | null = gh.availability === "ready" ? null : gh.message;

    let ghRoute: CiTransport | null = null;
    if (gh.availability === "ready") {
        ghRoute = ghTransport({
            runner: options.runner,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            ...(gh.host === null ? {} : { host: gh.host }),
            account: gh.account,
        });
        try {
            await ghRoute.readWorkflow(options.owner, options.repo, options.workflowFile);
            ghUsable = true;
        } catch (error) {
            ghReason = error instanceof Error ? error.message : String(error);
            ghRoute = null;
        }
    }

    if (ghUsable && ghRoute !== null) {
        return {
            transport: ghRoute,
            report: {
                route: "gh",
                describe:
                    `Using ${ghRoute.describe}` +
                    (sessionReason === null ? "." : `, because the sign-in in this application could not: ${sessionReason}`),
                session: { signedIn: options.token !== null, usable: false, reason: sessionReason },
                gh: { ...gh, usable: true, reason: null },
                ready: true,
                canUpload: false,
            },
        };
    }

    return {
        transport: null,
        report: {
            route: null,
            describe:
                "Neither GitHub route can start a render on this repository. " +
                `The sign-in in this application: ${sessionReason ?? "unavailable"}. ` +
                `${GH_COMMAND}: ${ghReason ?? gh.message}` +
                (gh.availability === "signed-out" ? ` Run \`${GH_LOGIN_COMMAND}\` in a terminal.` : ""),
            session: { signedIn: options.token !== null, usable: false, reason: sessionReason },
            gh: { ...gh, usable: false, reason: ghReason },
            ready: false,
            canUpload: false,
        },
    };
}

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
 * ## The upload too: one packer, two transports
 *
 * The **upload** used to be the one thing a `gh`-only machine could not do, on the grounds
 * that routing it through `gh release upload` would be a second uploader. That reasoning
 * was right about the packer and wrong about the transfer, so the split is now drawn where
 * it belongs.
 *
 * The packing, the splitting, the part naming, the digests, the sidecar and the Cheap LFS
 * pointer all stay in `main/backup/`, are imported rather than restated, and run
 * identically whichever credential is in play - see `upload.ts`. What this interface adds
 * is only the **transfer**: read a repository, create a release, list what a release
 * already holds, put one file on it. The REST calls are that transfer for the in-app
 * session; `gh release create` and `gh release upload --clobber` are that transfer for
 * `gh`. One packer, two transports, and no second set of release rules anywhere.
 */

import { basename } from "node:path";
import {
    createBackupRelease,
    findExistingAssets,
    findReleaseByTag,
    parseRepositoryRecord,
    readRepository as readRepositoryOverRest,
    uploadAsset,
} from "../backup/index.js";
import type { BackupRelease, FetchLike } from "../backup/index.js";
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
    readRepositoryVariable,
    readRun,
    readRunJobs,
    readWorkflow,
    writeRepositoryVariable,
    LOG_TAIL_LINES,
    ActionsCallError,
} from "./actions.js";
import type { WorkflowArtifact, WorkflowJob, WorkflowRun, WorkflowSummary } from "./actions.js";
import { GH_COMMAND, GH_LOGIN_COMMAND, detectGh, ghApiJson, ghApiPost, ghApiSend, ghApiToFile } from "./gh.js";
import type { GhStatus, ProcessRunner } from "./gh.js";

export type CiRoute = "session" | "gh";

/** A repository as GitHub describes it, in the only four facts a sync acts on. */
export interface CiRepositoryFacts {
    readonly owner: string;
    readonly repo: string;
    readonly fullName: string;
    readonly private: boolean;
    /** True only when GitHub says this credential has push access. Never assumed. */
    readonly canWrite: boolean;
    readonly htmlUrl: string;
}

/** The release a world's assets go on. Only what either route can answer for both. */
export interface CiRelease {
    readonly id: number;
    readonly tag: string;
    readonly htmlUrl: string;
}

/**
 * One asset already on a release, as a resumed upload sees it.
 *
 * Only assets GitHub reports as `uploaded` are ever described here. An asset stuck in
 * `starter` or `new` is one whose upload did not finish, and treating it as present
 * because its name matched is exactly how a resumed upload leaves a truncated part that
 * nothing notices until a restore.
 */
export interface CiReleaseAsset {
    readonly name: string;
    readonly size: number;
}

export interface CiUploadProgress {
    readonly bytesSent: number;
    readonly bytesTotal: number;
}

export interface CiAssetUpload {
    readonly release: CiRelease;
    readonly owner: string;
    readonly repo: string;
    /** The name the asset must land under. Derived from the content, never from a guess. */
    readonly assetName: string;
    readonly filePath: string;
    readonly bytes: number;
    readonly onProgress?: ((progress: CiUploadProgress) => void) | undefined;
}

/** Everything the sync loop asks of GitHub, in one place, for either credential. */
export interface CiTransport {
    readonly route: CiRoute;
    /** One phrase naming the credential in play, for a message a person has to act on. */
    readonly describe: string;
    /**
     * False when this route cannot publish a world at all.
     *
     * Both routes can, now that the transfer is route-aware. The flag survives because
     * "can start a render" and "can publish a world" are still two different capabilities,
     * and a future route that only reads must be able to say so here rather than failing
     * somewhere inside a packer.
     */
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

    /* -- the transfer, which is the only part that differs between the routes -- */

    /**
     * The repository, read by **the credential that is about to upload to it**.
     *
     * Deliberately not delegated to the backup surface. The public/private answer decides
     * whether a world is about to become a public download, and reading it with one
     * credential while publishing with another is how a repository that one of them cannot
     * see gets treated as private by default.
     */
    readRepository(owner: string, repo: string): Promise<CiRepositoryFacts>;
    /** One release by its tag, or null when there is none. Read-only, by construction. */
    findRelease(owner: string, repo: string, tag: string): Promise<CiRelease | null>;
    /**
     * Creates a **new** release, and refuses a tag that already exists.
     *
     * The append-only rule `main/backup/` enforces, enforced the same way on both routes:
     * adopting an existing tag is precisely how a second upload's assets land beside - or
     * over - a first one's. Carrying on with an interrupted upload goes through
     * {@link findRelease} instead, which reads and never writes.
     */
    createRelease(
        owner: string,
        repo: string,
        tag: string,
        name: string,
        body: string,
    ): Promise<CiRelease>;
    /**
     * What that release already holds, by asset name, so a resumed upload can skip it.
     *
     * The one call that makes resuming cheap: without it a dropped connection costs the
     * whole world again rather than the part that was in flight.
     */
    listReleaseAssets(owner: string, repo: string, tag: string): Promise<ReadonlyMap<string, CiReleaseAsset>>;
    /** Puts one staged file on the release under `assetName`. */
    uploadReleaseAsset(upload: CiAssetUpload): Promise<void>;

    /* -- scheduled re-rendering: the repository variables that configure it -- */

    /**
     * One repository variable, or null when it is not set.
     *
     * This is how the CI-render screen's scheduling section both writes its own
     * configuration (`CIRENDER_SCHEDULE_ENABLED`, `CIRENDER_SCHEDULE_CADENCE`, ...) and
     * reads back what `.github/workflows/scheduled-render.yml` last found
     * (`CIRENDER_SCHEDULE_LAST_CHECK_AT` and friends) - see `schedule.ts`. Never a secret:
     * a repository variable is plain text visible in the repository's own settings.
     */
    readVariable(owner: string, repo: string, name: string): Promise<string | null>;
    /** Creates or updates one repository variable. */
    writeVariable(owner: string, repo: string, name: string, value: string): Promise<void>;
}

export interface SessionTransportOptions {
    readonly fetch: FetchLike;
    readonly token: string;
    readonly signal?: AbortSignal | undefined;
    readonly apiBase?: string | undefined;
    /**
     * Where release assets are PUT. A second host, because GitHub uploads on one.
     *
     * Overridable for the same reason `apiBase` is: without it a test that exercises an
     * upload would stream bytes at the real `uploads.github.com`.
     */
    readonly uploadsBase?: string | undefined;
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
        ...(options.uploadsBase === undefined ? {} : { uploadsBase: options.uploadsBase }),
    };

    /*
     * Named rather than reached for through `this`, because `releaseHasAsset` is defined
     * as "the listing contains it". One definition of what counts as present is what stops
     * the resumed-upload skip and the unchanged-world check from drifting apart.
     */
    const listReleaseAssets = async (
        owner: string,
        repo: string,
        tag: string,
    ): Promise<ReadonlyMap<string, CiReleaseAsset>> => {
        const found = new Map<string, CiReleaseAsset>();
        try {
            // `findExistingAssets` already keeps only the `uploaded` ones, which is the
            // distinction a resumed upload turns on.
            for (const [name, asset] of await findExistingAssets(owner, repo, tag, call)) {
                found.set(name, { name, size: asset.size });
            }
        } catch {
            // A release that cannot be read is treated as holding nothing, so its contents
            // are uploaded again. That costs an upload and is always correct; guessing the
            // other way dispatches a run whose first step finds nothing.
            return found;
        }
        return found;
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
            // Derived from the listing rather than answered separately, so "is it there"
            // and "may a resumed upload skip it" can never disagree about what counts.
            return (await listReleaseAssets(owner, repo, tag)).has(assetName);
        },

        async readRepository(owner, repo): Promise<CiRepositoryFacts> {
            const repository = await readRepositoryOverRest(owner, repo, call);
            return {
                owner: repository.owner,
                repo: repository.name,
                fullName: repository.fullName,
                private: repository.private,
                canWrite: repository.canWrite,
                htmlUrl: repository.htmlUrl,
            };
        },

        async findRelease(owner, repo, tag): Promise<CiRelease | null> {
            const release = await findReleaseByTag(owner, repo, tag, call);
            return release === null ? null : { id: release.id, tag: release.tag, htmlUrl: release.htmlUrl };
        },

        async createRelease(owner, repo, tag, name, body): Promise<CiRelease> {
            const release = await createBackupRelease(owner, repo, tag, name, body, call);
            return { id: release.id, tag: release.tag, htmlUrl: release.htmlUrl };
        },

        listReleaseAssets,

        async uploadReleaseAsset(upload): Promise<void> {
            // `uploadAsset` streams from disk and only reads the release's id, so the
            // narrow {@link CiRelease} both routes can answer is widened here rather than
            // making every caller carry a whole GitHub release record.
            const release: BackupRelease = {
                id: upload.release.id,
                tag: upload.release.tag,
                name: upload.release.tag,
                htmlUrl: upload.release.htmlUrl,
                uploadUrl: "",
                assets: [],
                createdAt: "",
            };
            await uploadAsset(release, upload.owner, upload.repo, upload.assetName, upload.filePath, {
                ...call,
                ...(upload.onProgress === undefined
                    ? {}
                    : {
                          onProgress: (progress) =>
                              upload.onProgress?.({
                                  bytesSent: progress.bytesSent,
                                  bytesTotal: progress.bytesTotal,
                              }),
                      }),
            });
        },

        readVariable: (owner, repo, name) => readRepositoryVariable(owner, repo, name, call),
        writeVariable: (owner, repo, name, value) => writeRepositoryVariable(owner, repo, name, value, call),
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
 * The `gh` command-line tool, over `gh api` for everything it can express.
 *
 * Every **read** goes through `gh api`, not through `gh run view` or `gh run download`.
 * Two reasons. `gh api` returns GitHub's own JSON, so **the same parsers** run for both
 * routes and the two cannot drift about what a job's status means. And `gh run download`
 * unpacks an artifact into a directory, which would skip the zip - and with it the digest
 * check the collector runs before anything is unpacked.
 *
 * The two **writes** an upload needs are the exception, and deliberately so.
 * `gh release create` and `gh release upload --clobber` are `gh`'s own supported way to put
 * bytes on a release; the equivalent `gh api` call would have to post a binary body to a
 * different host, which `gh api` is not built for. `--clobber` is not a convenience: a part
 * whose previous upload was truncated has to be *replaced*, and without it GitHub refuses
 * the name and a resumed upload can never repair the one asset that is actually broken.
 *
 * Every command is spawned with an argument array and never through a shell, so a tag, an
 * asset name or a repository name cannot become part of a command line. No token is asked
 * for, printed or passed: `gh` uses its own store, and `--show-token` appears nowhere.
 */
export function ghTransport(options: GhTransportOptions): CiTransport {
    const api = {
        runner: options.runner,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.host === undefined ? {} : { host: options.host }),
    };
    const path = (owner: string, repo: string): string =>
        `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

    /** `--repo owner/name`, plus the host when `gh auth status` named an enterprise one. */
    const where = (owner: string, repo: string): string[] => {
        const args = ["--repo", `${owner}/${repo}`];
        if (options.host !== undefined && options.host.length > 0) args.push("--hostname", options.host);
        return args;
    };

    /** Runs one `gh` subcommand, turning a refusal into the error type both routes raise. */
    const runGh = async (args: readonly string[], what: string): Promise<void> => {
        const result = await options.runner.run(GH_COMMAND, args, {
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        if (!result.started) {
            throw new ActionsCallError(
                `The ${GH_COMMAND} command-line tool is no longer on PATH, so ${what} could not be ` +
                    "carried out. Nothing was changed.",
                0,
                what,
            );
        }
        if (result.code !== 0) throw ghCommandFailure(result.stderr, what);
    };

    const readRelease = async (owner: string, repo: string, tag: string): Promise<unknown | null> => {
        try {
            return await ghApiJson(`${path(owner, repo)}/releases/tags/${encodeURIComponent(tag)}`, api);
        } catch (error) {
            // 404 is "there is no release under that tag", which is an answer rather than a
            // failure. Anything else is a real refusal and is not swallowed: reporting a
            // 403 as "no release" would have a resume quietly create a second one.
            if (error instanceof ActionsCallError && error.status === 404) return null;
            throw error;
        }
    };

    const listReleaseAssets = async (
        owner: string,
        repo: string,
        tag: string,
    ): Promise<ReadonlyMap<string, CiReleaseAsset>> => {
        const found = new Map<string, CiReleaseAsset>();
        let body: unknown;
        try {
            body = await readRelease(owner, repo, tag);
        } catch {
            // Same rule as the API route: a release that cannot be read holds nothing as
            // far as this is concerned, so its contents are uploaded again.
            return found;
        }
        if (typeof body !== "object" || body === null) return found;
        const assets = (body as Record<string, unknown>)["assets"];
        if (!Array.isArray(assets)) return found;
        for (const asset of assets) {
            if (typeof asset !== "object" || asset === null) continue;
            const record = asset as Record<string, unknown>;
            const name = record["name"];
            // Only `uploaded`. An asset stuck in `starter` or `new` is a truncated upload,
            // and skipping it because the name matched is how a backup becomes unrestorable.
            if (typeof name !== "string" || record["state"] !== "uploaded") continue;
            found.set(name, { name, size: typeof record["size"] === "number" ? record["size"] : -1 });
        }
        return found;
    };

    return {
        route: "gh",
        describe:
            options.account === null || options.account === undefined
                ? `the ${GH_COMMAND} command-line tool`
                : `the ${GH_COMMAND} command-line tool (${options.account})`,
        // The transfer below is route-aware, so somebody signed in to `gh` and not to this
        // application can publish a world as well as render one. The packer is still the
        // single one in `main/backup/`; only the four calls that move bytes differ.
        canUpload: true,

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
            return (await listReleaseAssets(owner, repo, tag)).has(assetName);
        },

        async readRepository(owner, repo): Promise<CiRepositoryFacts> {
            // Parsed by `main/backup/`'s own reader, so "may this credential write here"
            // and "is this repository public" mean exactly the same thing on both routes.
            // A second parser would be a second definition of PUBLIC.
            const repository = parseRepositoryRecord(await ghApiJson(path(owner, repo), api));
            if (repository === null) {
                throw new ActionsCallError(
                    `${GH_COMMAND} described ${owner}/${repo} in a way this build could not read as a ` +
                        "repository, so whether it is public could not be established. Nothing was uploaded.",
                    0,
                    `${owner}/${repo}`,
                );
            }
            return {
                owner: repository.owner,
                repo: repository.name,
                fullName: repository.fullName,
                private: repository.private,
                canWrite: repository.canWrite,
                htmlUrl: repository.htmlUrl,
            };
        },

        async findRelease(owner, repo, tag): Promise<CiRelease | null> {
            const body = await readRelease(owner, repo, tag);
            if (typeof body !== "object" || body === null) return null;
            const record = body as Record<string, unknown>;
            const id = record["id"];
            if (typeof id !== "number") return null;
            return {
                id,
                tag: typeof record["tag_name"] === "string" ? record["tag_name"] : tag,
                htmlUrl: typeof record["html_url"] === "string" ? record["html_url"] : "",
            };
        },

        async createRelease(owner, repo, tag, name, body): Promise<CiRelease> {
            /*
             * The append-only rule, enforced before the write rather than hoped for.
             *
             * `gh release create` refuses a duplicate tag itself, but its message is about
             * the command; this one is about the backup, and it is the sentence somebody
             * needs to understand that yesterday's upload was left untouched.
             */
            const already = await readRelease(owner, repo, tag);
            if (already !== null) {
                throw new ActionsCallError(
                    `${owner}/${repo} already has a release tagged ${tag}. Nothing was changed: an ` +
                        "upload never edits or replaces an existing release, so this one was left " +
                        "exactly as it was. Start the upload again to get a fresh tag.",
                    422,
                    tag,
                );
            }

            await runGh(
                [
                    "release",
                    "create",
                    tag,
                    ...where(owner, repo),
                    "--title",
                    name,
                    "--notes",
                    body,
                    // A prerelease that is never "latest", exactly as the REST route creates
                    // it: a stored world quietly becoming somebody's latest release would
                    // redirect their installer link at a Minecraft save.
                    "--prerelease",
                    "--latest=false",
                ],
                `creating the release tagged ${tag}`,
            );

            // Read back rather than parsed out of what the command printed: `gh release
            // create` prints a URL, and the id is what an upload needs. Reading it also
            // proves the release really exists before anything is streamed at it.
            const created = await readRelease(owner, repo, tag);
            const id = typeof created === "object" && created !== null ? (created as Record<string, unknown>)["id"] : null;
            if (typeof id !== "number") {
                throw new ActionsCallError(
                    `${GH_COMMAND} reported that it created the release tagged ${tag} on ${owner}/${repo}, ` +
                        "but it could not be read back afterwards, so nothing was uploaded to it.",
                    0,
                    tag,
                );
            }
            const record = created as Record<string, unknown>;
            return {
                id,
                tag: typeof record["tag_name"] === "string" ? record["tag_name"] : tag,
                htmlUrl: typeof record["html_url"] === "string" ? record["html_url"] : "",
            };
        },

        listReleaseAssets,

        async uploadReleaseAsset(upload): Promise<void> {
            /*
             * `gh release upload` names the asset after the file's own basename - the
             * `file#label` form sets a *label*, not a name - so a mismatch here would put a
             * part on the release under a name the Cheap LFS pointer does not mention, and
             * a restore would look for an asset that is not there. The caller stages every
             * file under its final asset name (see `upload.ts`); this refuses rather than
             * silently uploading something the pointer cannot find.
             */
            if (basename(upload.filePath) !== upload.assetName) {
                throw new ActionsCallError(
                    `The ${GH_COMMAND} route uploads a release asset under the staged file's own name, ` +
                        `and ${basename(upload.filePath)} is not ${upload.assetName}. Nothing was ` +
                        "uploaded, because an asset under the wrong name is one a restore cannot find.",
                    0,
                    upload.assetName,
                );
            }

            await runGh(
                [
                    "release",
                    "upload",
                    upload.release.tag,
                    upload.filePath,
                    ...where(upload.owner, upload.repo),
                    // Replaces an asset of the same name. A part left truncated by a dropped
                    // connection is exactly the asset a resumed upload has to overwrite, and
                    // without this GitHub refuses the name and the break can never be repaired.
                    "--clobber",
                ],
                `uploading ${upload.assetName}`,
            );

            /*
             * One progress call, at the end, and it is honest about being one.
             *
             * `gh` writes its own progress to a terminal this process does not have, so
             * there is no byte-by-byte figure to relay. Inventing a moving bar from a timer
             * would make a stalled upload look busy, which is the one thing a progress
             * surface must never do; the bar therefore steps once per asset here and the
             * description beside it names which asset is in flight.
             */
            upload.onProgress?.({ bytesSent: upload.bytes, bytesTotal: upload.bytes });
        },

        async readVariable(owner, repo, name): Promise<string | null> {
            try {
                const body = await ghApiJson(`${path(owner, repo)}/actions/variables/${encodeURIComponent(name)}`, api);
                const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["value"] : null;
                return typeof value === "string" ? value : null;
            } catch (error) {
                // Same rule as `readRelease` above: 404 is "not set", an answer rather than
                // a refusal, and everything else is a real failure that must not be read as one.
                if (error instanceof ActionsCallError && error.status === 404) return null;
                throw error;
            }
        },

        async writeVariable(owner, repo, name, value): Promise<void> {
            try {
                await ghApiSend(
                    `${path(owner, repo)}/actions/variables/${encodeURIComponent(name)}`,
                    "PATCH",
                    { value },
                    api,
                );
                return;
            } catch (error) {
                if (!(error instanceof ActionsCallError) || error.status !== 404) throw error;
            }
            await ghApiSend(`${path(owner, repo)}/actions/variables`, "POST", { name, value }, api);
        },
    };
}

/**
 * A failed `gh` subcommand turned into the same error type every other call raises.
 *
 * `gh release` does not print `(HTTP 403)` the way `gh api` does, so the status is usually
 * unrecoverable and is reported as 0 rather than guessed at. What it does print is the
 * reason, and that is carried through: "release not found", "not authorized" and "asset
 * already exists" are three different problems with three different fixes.
 */
function ghCommandFailure(stderr: string, what: string): ActionsCallError {
    const match = /\(HTTP (\d{3})\)/.exec(stderr);
    const status = match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
    const said = stderr.trim().split(/\r?\n/).slice(0, 4).join(" ").trim();
    const explanation =
        status === 401
            ? ` The \`${GH_COMMAND}\` sign-in is no longer accepted. Run \`${GH_LOGIN_COMMAND}\` in a terminal.`
            : status === 403
              ? ` The account \`${GH_COMMAND}\` is signed in as may not have permission to publish` +
                " releases here, or the organisation needs its SSO authorisation refreshed."
              : "";
    return new ActionsCallError(
        `${GH_COMMAND} failed while ${what}.${explanation}${said === "" ? "" : ` It said: ${said}`}`,
        status,
        what,
    );
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

/**
 * What the report says about `gh`, including the case where it was never asked.
 *
 * `detectGh` answers three states and they are genuinely different remedies - install it,
 * sign in to it in a terminal, or nothing. **"Not checked" is a fourth thing and is not one
 * of them.** When the in-app sign-in works, `gh` is deliberately not probed, and reporting
 * that as "not installed" would put a sentence on the screen telling somebody to install
 * software they already have. So the report widens the state by exactly one value, and the
 * detector's own contract stays honest at three.
 */
export interface RouteGhReport extends Omit<GhStatus, "availability"> {
    readonly availability: GhStatus["availability"] | "not-checked";
    readonly usable: boolean;
    readonly reason: string | null;
}

export interface RouteReport {
    readonly route: CiRoute | null;
    /** What the interface shows: which credential is driving, or why none can. */
    readonly describe: string;
    /** The in-app sign-in's own state, so the surface can offer the right button. */
    readonly session: { readonly signedIn: boolean; readonly usable: boolean; readonly reason: string | null };
    readonly gh: RouteGhReport;
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
    readonly uploadsBase?: string | undefined;
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
                  ...(options.uploadsBase === undefined ? {} : { uploadsBase: options.uploadsBase }),
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
                // every single sync for information nobody asked for. Reported as
                // "not-checked" rather than "not-installed", because telling somebody to
                // install software they may already have is worse than saying nothing.
                gh: {
                    availability: "not-checked",
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
                // A real fallback, not a read-only one: the transfer is route-aware, so
                // this route publishes the world as well as rendering it.
                canUpload: ghRoute.canUpload,
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

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
    githubApiJson,
    githubApiSendJson,
    isRepositoryEmpty,
    listRunArtifacts,
    parseArtifacts,
    parseJobs,
    parseRun,
    parseWorkflow,
    pickDispatchedRun,
    readActionsPolicy,
    readDefaultBranch,
    readJobLogTail,
    readRepositoryFile,
    readRepositoryVariable,
    readRun,
    readRunJobs,
    readTokenScopes,
    readWorkflow,
    writeRepositoryFile,
    writeRepositoryVariable,
    LOG_TAIL_LINES,
    ActionsCallError,
} from "./actions.js";
import type {
    ActionsPolicy,
    RepositoryFile,
    WorkflowArtifact,
    WorkflowJob,
    WorkflowRun,
    WorkflowSummary,
} from "./actions.js";
import {
    GH_COMMAND,
    GH_LOGIN_COMMAND,
    ghApiJson,
    ghApiPost,
    ghApiSend,
    ghApiToFile,
} from "./gh.js";
import type { GhStatus, ProcessRunner } from "./gh.js";
import { listGhCliAccounts, switchGhCliAccount } from "../ghcli/accounts.js";
import type { GhCliAccountSummary, GhCliAccountsStatus } from "../ghcli/accounts.js";

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

/** The exact default-branch tip against which a managed workflow update is planned. */
export interface CiRepositoryHead {
    readonly branch: string;
    readonly sha: string | null;
}

export interface CiAtomicRepositoryFile {
    readonly path: string;
    readonly contentBase64: string;
}

export interface CiAtomicCommitRequest {
    readonly branch: string;
    /** A real parent commit. GitHub's Git Data API cannot create a ref in an empty repository. */
    readonly expectedHeadSha: string;
    readonly files: readonly CiAtomicRepositoryFile[];
    readonly message: string;
}

/** A typed optimistic-concurrency refusal; callers may safely invite a retry. */
export class CiAtomicCommitConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CiAtomicCommitConflictError";
    }
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
    readJobLogTail(
        owner: string,
        repo: string,
        jobId: number,
        maxLines?: number,
    ): Promise<string | null>;
    listRunArtifacts(
        owner: string,
        repo: string,
        runId: number,
    ): Promise<readonly WorkflowArtifact[]>;
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
    listReleaseAssets(
        owner: string,
        repo: string,
        tag: string,
    ): Promise<ReadonlyMap<string, CiReleaseAsset>>;
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

    /* -- repository bootstrap: does the repository even have what a run needs? -- */

    /** True when the repository has never had a commit - no default-branch ref exists yet. */
    isRepositoryEmpty(owner: string, repo: string): Promise<boolean>;
    /** Whether GitHub will run a workflow here at all, independent of the workflow's own state. */
    readActionsPolicy(owner: string, repo: string): Promise<ActionsPolicy>;
    /**
     * The scopes this credential's token carries, when they can be read at all.
     *
     * Session-only in any meaningful sense: `gh` manages its own token and exposes no way
     * to read its scopes back, so this route always answers `null` - "not checked" rather
     * than "none", exactly the distinction {@link RouteGhReport} already draws elsewhere.
     */
    readTokenScopes(): Promise<{ readonly scopes: readonly string[] | null }>;
    /** One file's content at a path, optionally pinned to an exact commit, or null when absent. */
    readFile(
        owner: string,
        repo: string,
        path: string,
        ref?: string,
    ): Promise<RepositoryFile | null>;
    /**
     * Creates or updates one file at a path, on the default branch - including the very
     * first commit of a repository that has none yet. `sha` is required to update a file
     * that already exists and must be omitted to create one that does not.
     */
    writeFile(
        owner: string,
        repo: string,
        path: string,
        contentBase64: string,
        message: string,
        sha?: string,
    ): Promise<{ readonly sha: string; readonly commitSha: string | null }>;
    /** Reads the default branch and its exact current tip; null is a genuinely empty repository. */
    readRepositoryHead?: ((owner: string, repo: string) => Promise<CiRepositoryHead>) | undefined;
    /** Makes every supplied file visible in one guarded Git commit, or makes none visible. */
    commitFilesAtomically?: (
        owner: string,
        repo: string,
        request: CiAtomicCommitRequest,
    ) => Promise<{ readonly commitSha: string }>;
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

interface GitDataApi {
    get(endpoint: string): Promise<unknown>;
    send(endpoint: string, method: "POST" | "PATCH", body: unknown): Promise<unknown>;
}

function recordOf(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown, what: string): string {
    if (typeof value === "string" && value.length > 0) return value;
    throw new ActionsCallError(`GitHub did not answer with ${what}.`, 0, what);
}

function repositoryPath(owner: string, repo: string): string {
    return `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function refPath(branch: string): string {
    return `heads/${branch.split("/").map(encodeURIComponent).join("/")}`;
}

async function readHeadWithApi(
    api: GitDataApi,
    owner: string,
    repo: string,
): Promise<CiRepositoryHead> {
    const root = repositoryPath(owner, repo);
    const repository = recordOf(await api.get(root));
    const branch = requiredString(
        repository["default_branch"],
        `the default branch for ${owner}/${repo}`,
    );
    try {
        const ref = recordOf(await api.get(`${root}/git/ref/${refPath(branch)}`));
        const object = recordOf(ref["object"]);
        return {
            branch,
            sha: requiredString(object["sha"], `the tip of ${owner}/${repo}:${branch}`),
        };
    } catch (error) {
        if (error instanceof ActionsCallError && error.status === 404) return { branch, sha: null };
        throw error;
    }
}

/**
 * Builds blobs, a tree and a commit out of sight, then advances one ref with `force:false`.
 * Object creation may fail or leave unreachable objects, but repository-visible bytes change
 * only at the final ref update, which GitHub applies atomically against the expected parent.
 */
async function commitFilesWithApi(
    api: GitDataApi,
    owner: string,
    repo: string,
    request: CiAtomicCommitRequest,
): Promise<{ readonly commitSha: string }> {
    const root = repositoryPath(owner, repo);
    const current = await readHeadWithApi(api, owner, repo);
    if (current.branch !== request.branch || current.sha !== request.expectedHeadSha) {
        throw new CiAtomicCommitConflictError(
            `${owner}/${repo}:${request.branch} moved while the managed workflows were being checked. Nothing was committed.`,
        );
    }

    const treeEntries: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
    for (const file of request.files) {
        const blob = recordOf(
            await api.send(`${root}/git/blobs`, "POST", {
                content: file.contentBase64,
                encoding: "base64",
            }),
        );
        treeEntries.push({
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: requiredString(blob["sha"], `the blob sha for ${file.path}`),
        });
    }

    const parent = recordOf(
        await api.get(`${root}/git/commits/${encodeURIComponent(request.expectedHeadSha)}`),
    );
    const parentTree = recordOf(parent["tree"]);
    const baseTree = requiredString(parentTree["sha"], `the tree for ${request.expectedHeadSha}`);
    const tree = recordOf(
        await api.send(`${root}/git/trees`, "POST", {
            base_tree: baseTree,
            tree: treeEntries,
        }),
    );
    const treeSha = requiredString(tree["sha"], "the managed workflow tree sha");
    const commit = recordOf(
        await api.send(`${root}/git/commits`, "POST", {
            message: request.message,
            tree: treeSha,
            parents: [request.expectedHeadSha],
        }),
    );
    const commitSha = requiredString(commit["sha"], "the managed workflow commit sha");

    try {
        await api.send(`${root}/git/refs/${refPath(request.branch)}`, "PATCH", {
            sha: commitSha,
            force: false,
        });
    } catch (error) {
        if (error instanceof ActionsCallError && (error.status === 409 || error.status === 422)) {
            throw new CiAtomicCommitConflictError(
                `${owner}/${repo}:${request.branch} changed before the managed workflow commit could land. Nothing was overwritten.`,
            );
        }
        throw error;
    }
    return { commitSha };
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
    const gitDataApi: GitDataApi = {
        get: (endpoint) => githubApiJson(endpoint, call),
        send: (endpoint, method, body) => githubApiSendJson(endpoint, method, body, call),
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
        findDispatchedRun: (owner, repo, file, since) =>
            findDispatchedRun(owner, repo, file, since, call),
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
            return release === null
                ? null
                : { id: release.id, tag: release.tag, htmlUrl: release.htmlUrl };
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
            await uploadAsset(
                release,
                upload.owner,
                upload.repo,
                upload.assetName,
                upload.filePath,
                {
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
                },
            );
        },

        readVariable: (owner, repo, name) => readRepositoryVariable(owner, repo, name, call),
        writeVariable: (owner, repo, name, value) =>
            writeRepositoryVariable(owner, repo, name, value, call),

        isRepositoryEmpty: (owner, repo) => isRepositoryEmpty(owner, repo, call),
        readActionsPolicy: (owner, repo) => readActionsPolicy(owner, repo, call),
        readTokenScopes: () => readTokenScopes(call),
        readFile: (owner, repo, path, ref) => readRepositoryFile(owner, repo, path, call, ref),
        writeFile: (owner, repo, path, contentBase64, message, sha) =>
            writeRepositoryFile(owner, repo, path, contentBase64, message, call, sha),
        readRepositoryHead: (owner, repo) => readHeadWithApi(gitDataApi, owner, repo),
        commitFilesAtomically: (owner, repo, request) =>
            commitFilesWithApi(gitDataApi, owner, repo, request),
    };
}

export interface GhTransportOptions {
    readonly runner: ProcessRunner;
    readonly signal?: AbortSignal | undefined;
    /** A host/account pair read from `gh auth status --json hosts`, never free text. */
    readonly host: string;
    readonly account: string;
}

/**
 * Makes the selected, stored gh account active and proves the identity the next command
 * will actually use. Both host and login came from gh's own account inventory before this
 * function is called; callers never manufacture a token or trust a free-text identity.
 */
async function ensureGhIdentity(options: GhTransportOptions, what: string): Promise<void> {
    const status = await listGhCliAccounts({
        runner: options.runner,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const stored = status.accounts.find(
        (candidate) =>
            candidate.host.toLowerCase() === options.host.toLowerCase() &&
            candidate.login.toLowerCase() === options.account.toLowerCase(),
    );
    if (stored === undefined || !stored.healthy) {
        throw ghAccountRecoveryError(
            stored === undefined
                ? `${options.account} is not signed in to gh on ${options.host}, so ${what} was not attempted.`
                : `${options.account} is signed in to gh on ${options.host}, but gh reports that account as ${stored.stateDetail ?? "unhealthy"}, so ${what} was not attempted.`,
            what,
        );
    }

    if (!stored.active) {
        const switched = await switchGhCliAccount(
            {
                runner: options.runner,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            },
            stored.host,
            stored.login,
        );
        if (!switched.ok)
            throw ghAccountRecoveryError(`${switched.message} ${what} was not attempted.`, what);
    }

    // This uses the same host and credential resolution as the release command. The
    // account-list re-read proves gh's stored active bit; this proves the effective caller,
    // including any environment override inherited by the desktop process.
    const identity = await options.runner.run(
        GH_COMMAND,
        ["api", "--hostname", options.host, "user", "--jq", ".login"],
        options.signal === undefined ? {} : { signal: options.signal },
    );
    const actual = identity.stdout.trim();
    if (
        !identity.started ||
        identity.code !== 0 ||
        actual.toLowerCase() !== options.account.toLowerCase()
    ) {
        const detail =
            actual === ""
                ? firstGhLine(identity.stderr)
                : `gh authenticated as ${actual}, not ${options.account}`;
        throw ghAccountRecoveryError(
            `The active gh identity on ${options.host} could not be verified as ${options.account}, so ${what} was not attempted.` +
                (detail === "" ? "" : ` ${detail}.`),
            what,
        );
    }
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
        host: options.host,
    };
    const path = (owner: string, repo: string): string =>
        `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const gitDataApi: GitDataApi = {
        get: (endpoint) => ghApiJson(endpoint, api),
        async send(endpoint, method, body): Promise<unknown> {
            const raw = await ghApiSend(endpoint, method, body, api);
            if (raw.trim().length === 0) return null;
            try {
                return JSON.parse(raw) as unknown;
            } catch {
                throw new ActionsCallError(
                    `${GH_COMMAND} accepted ${method} ${endpoint} but answered something that was not JSON.`,
                    0,
                    endpoint,
                );
            }
        },
    };

    /**
     * `gh release` has no `--hostname` flag. Its inherited `--repo` flag accepts
     * `[HOST/]OWNER/REPO`, which keeps enterprise routing explicit without depending on the
     * checkout's own repository or silently dropping back to github.com.
     */
    const where = (owner: string, repo: string): string[] => [
        "--repo",
        `${options.host}/${owner}/${repo}`,
    ];

    /**
     * Re-establishes and proves the selected gh identity immediately before a release read
     * or write. Packing a large world can take hours after preflight; trusting the account
     * that was active then would let another terminal's later `gh auth switch` redirect the
     * upload. The selected account is left active, matching gh's existing machine-wide
     * switching contract rather than silently restoring a different identity afterwards.
     */
    const ensureReleaseIdentity = (what: string): Promise<void> => ensureGhIdentity(options, what);

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

    const readRelease = async (
        owner: string,
        repo: string,
        tag: string,
    ): Promise<unknown | null> => {
        await ensureReleaseIdentity(`reading the release tagged ${tag}`);
        try {
            return await ghApiJson(
                `${path(owner, repo)}/releases/tags/${encodeURIComponent(tag)}`,
                api,
            );
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
        } catch (error) {
            // A missing/changed selected account is not an unreadable release. Swallowing
            // that guard would let resume continue under an unverified identity.
            if (error instanceof ActionsCallError && error.needsSignIn) throw error;
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
            found.set(name, {
                name,
                size: typeof record["size"] === "number" ? record["size"] : -1,
            });
        }
        return found;
    };

    return {
        route: "gh",
        describe: `the ${GH_COMMAND} command-line tool (${options.account} on ${options.host})`,
        // The transfer below is route-aware, so somebody signed in to `gh` and not to this
        // application can publish a world as well as render one. The packer is still the
        // single one in `main/backup/`; only the four calls that move bytes differ.
        canUpload: true,

        async readWorkflow(owner, repo, file): Promise<WorkflowSummary> {
            const body = await ghApiJson(
                `${path(owner, repo)}/actions/workflows/${encodeURIComponent(file)}`,
                api,
            );
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
            const run = parseRun(
                await ghApiJson(`${path(owner, repo)}/actions/runs/${String(runId)}`, api),
            );
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
            parseJobs(
                await ghApiJson(
                    `${path(owner, repo)}/actions/runs/${String(runId)}/jobs?per_page=100`,
                    api,
                ),
            ),

        async readJobLogTail(owner, repo, jobId, maxLines): Promise<string | null> {
            // The same rule as the API route: a log that cannot be read answers null, not
            // an error. A missing log must never replace the render failure it was fetched
            // to explain.
            let raw: unknown;
            try {
                raw = await ghApiJson(
                    `${path(owner, repo)}/actions/jobs/${String(jobId)}/logs`,
                    api,
                );
            } catch {
                return await ghLogText(owner, repo, jobId, api, maxLines ?? LOG_TAIL_LINES);
            }
            return typeof raw === "string" ? tail(raw, maxLines ?? LOG_TAIL_LINES) : null;
        },

        listRunArtifacts: async (owner, repo, runId): Promise<readonly WorkflowArtifact[]> =>
            parseArtifacts(
                await ghApiJson(
                    `${path(owner, repo)}/actions/runs/${String(runId)}/artifacts?per_page=100`,
                    api,
                ),
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
            const id =
                typeof created === "object" && created !== null
                    ? (created as Record<string, unknown>)["id"]
                    : null;
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

            await ensureReleaseIdentity(`uploading ${upload.assetName}`);
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
                const body = await ghApiJson(
                    `${path(owner, repo)}/actions/variables/${encodeURIComponent(name)}`,
                    api,
                );
                const value =
                    typeof body === "object" && body !== null
                        ? (body as Record<string, unknown>)["value"]
                        : null;
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

        async isRepositoryEmpty(owner, repo): Promise<boolean> {
            try {
                await ghApiJson(`${path(owner, repo)}/commits?per_page=1`, api);
                return false;
            } catch (error) {
                if (error instanceof ActionsCallError && error.status === 409) return true;
                throw error;
            }
        },

        async readActionsPolicy(owner, repo): Promise<ActionsPolicy> {
            try {
                const body = await ghApiJson(`${path(owner, repo)}/actions/permissions`, api);
                const record =
                    typeof body === "object" && body !== null
                        ? (body as Record<string, unknown>)
                        : {};
                if (record["enabled"] === true) return { state: "enabled" };
                if (record["enabled"] === false) {
                    const allowed = record["allowed_actions"];
                    return {
                        state: "disabled",
                        allowedActions: typeof allowed === "string" ? allowed : null,
                    };
                }
                return {
                    state: "unknown",
                    reason: `${GH_COMMAND} described the Actions setting in a way this build could not read.`,
                };
            } catch (error) {
                if (
                    error instanceof ActionsCallError &&
                    (error.status === 403 || error.status === 404)
                ) {
                    return {
                        state: "unknown",
                        reason:
                            "Reading whether Actions is enabled needs admin access to the repository, and" +
                            ` the account \`${GH_COMMAND}\` is signed in as does not have it here.`,
                    };
                }
                throw error;
            }
        },

        // `gh` manages its own token and has no command that reads its scopes back - see
        // the interface's own note on this method for why `null` is the honest answer here
        // rather than an empty list.
        readTokenScopes: () => Promise.resolve({ scopes: null }),

        async readFile(owner, repo, filePath, ref): Promise<RepositoryFile | null> {
            try {
                const body = await ghApiJson(
                    `${path(owner, repo)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}` +
                        (ref === undefined ? "" : `?ref=${encodeURIComponent(ref)}`),
                    api,
                );
                const record =
                    typeof body === "object" && body !== null
                        ? (body as Record<string, unknown>)
                        : {};
                const sha = record["sha"];
                const content = record["content"];
                if (typeof sha !== "string" || typeof content !== "string") return null;
                return { sha, contentBase64: content };
            } catch (error) {
                if (error instanceof ActionsCallError && error.status === 404) return null;
                throw error;
            }
        },

        async writeFile(owner, repo, filePath, contentBase64, message, sha) {
            const raw = await ghApiSend(
                `${path(owner, repo)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`,
                "PUT",
                { message, content: contentBase64, ...(sha === undefined ? {} : { sha }) },
                api,
            );
            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                throw new ActionsCallError(
                    `${GH_COMMAND} accepted the write to ${filePath} on ${owner}/${repo} but answered` +
                        " something that was not JSON, so the file's new sha could not be read.",
                    0,
                    filePath,
                );
            }
            const record =
                typeof parsed === "object" && parsed !== null
                    ? (parsed as Record<string, unknown>)
                    : {};
            const content = record["content"];
            const newSha =
                typeof content === "object" && content !== null
                    ? (content as Record<string, unknown>)["sha"]
                    : null;
            const commit = record["commit"];
            const commitSha =
                typeof commit === "object" && commit !== null
                    ? (commit as Record<string, unknown>)["sha"]
                    : null;
            if (typeof newSha !== "string") {
                throw new ActionsCallError(
                    `${GH_COMMAND} accepted the write to ${filePath} on ${owner}/${repo} but did not` +
                        " answer with the file's new sha.",
                    0,
                    filePath,
                );
            }
            return { sha: newSha, commitSha: typeof commitSha === "string" ? commitSha : null };
        },
        async readRepositoryHead(owner, repo) {
            await ensureGhIdentity(options, `reading the branch head for ${owner}/${repo}`);
            return await readHeadWithApi(gitDataApi, owner, repo);
        },
        async commitFilesAtomically(owner, repo, request) {
            await ensureGhIdentity(options, `updating managed workflows on ${owner}/${repo}`);
            return await commitFilesWithApi(gitDataApi, owner, repo, request);
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

function firstGhLine(text: string): string {
    return (text.split(/\r?\n/)[0] ?? "").trim();
}

/** A selected gh account needs attention; the visible failure card offers Settings beside it. */
function ghAccountRecoveryError(message: string, what: string): ActionsCallError {
    return new ActionsCallError(
        `${message} Open Settings → GitHub, repair or add that gh command-line account, then carry on; no release data was changed.`,
        401,
        what,
        true,
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
    /** The same-surface recovery the renderer should offer when this route is blocked. */
    readonly recovery: "github-settings" | "dependencies" | null;
}

export interface RouteReport {
    readonly route: CiRoute | null;
    /** What the interface shows: which credential is driving, or why none can. */
    readonly describe: string;
    /** The in-app sign-in's own state, so the surface can offer the right button. */
    readonly session: {
        readonly signedIn: boolean;
        readonly usable: boolean;
        readonly reason: string | null;
    };
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
    /**
     * An explicit gh identity selected from `gh auth status --json hosts`.
     * It is still revalidated against the live inventory before use; callers cannot turn a
     * free-text login or host into authority merely by putting it here.
     */
    readonly ghTarget?: { readonly host: string; readonly login: string } | undefined;
    readonly fetch: FetchLike;
    readonly runner: ProcessRunner;
    readonly signal?: AbortSignal | undefined;
    readonly apiBase?: string | undefined;
    readonly uploadsBase?: string | undefined;
    /** Force a route, for somebody who knows which credential they want. */
    readonly prefer?: CiRoute | undefined;
    /**
     * The capability probe used to decide whether a candidate route is usable.
     *
     * Defaults to `readWorkflow(owner, repo, workflowFile)` - the cheapest call that proves
     * a credential can see Actions on a repository that already has the workflow. A
     * repository being **bootstrapped** does not have it yet by definition, so
     * `bootstrap.ts` passes a weaker probe here (`readRepository`) that only asks whether
     * the credential can see the repository at all, which is everything a write needs to
     * start with.
     */
    readonly probe?:
        ((transport: CiTransport, owner: string, repo: string) => Promise<unknown>) | undefined;
}

interface GhAccountChoice {
    readonly account: GhCliAccountSummary | null;
    readonly reason: string | null;
    readonly recovery: "github-settings" | "dependencies" | null;
}

/** Selects only from gh's live signed-in inventory; never fabricates an identity. */
function chooseGhAccount(
    status: GhCliAccountsStatus,
    target: { readonly host?: string | undefined; readonly login: string } | null,
): GhAccountChoice {
    if (status.availability !== "ready") {
        return {
            account: null,
            reason: status.message,
            recovery: status.availability === "not-installed" ? "dependencies" : "github-settings",
        };
    }

    const healthy = status.accounts.filter((candidate) => candidate.healthy);
    if (target !== null) {
        const matching = healthy.filter(
            (candidate) =>
                candidate.login.toLowerCase() === target.login.toLowerCase() &&
                (target.host === undefined ||
                    candidate.host.toLowerCase() === target.host.toLowerCase()),
        );
        const onGithubCom = matching.filter(
            (candidate) => candidate.host.toLowerCase() === "github.com",
        );
        const active = matching.filter((candidate) => candidate.active);
        const picked =
            matching.length === 1
                ? matching[0]!
                : onGithubCom.length === 1
                  ? onGithubCom[0]!
                  : active.length === 1
                    ? active[0]!
                    : null;
        if (picked !== null) return { account: picked, reason: null, recovery: null };
        if (matching.length === 0) {
            return {
                account: null,
                reason:
                    `${target.login}` +
                    (target.host === undefined ? "" : ` on ${target.host}`) +
                    " is not a healthy account in gh's signed-in account list. Open GitHub settings, sign it in or repair it, then check again.",
                recovery: "github-settings",
            };
        }
        return {
            account: null,
            reason:
                `${target.login} is signed in to gh on more than one host, so the application will not guess which account should publish the release. ` +
                "Choose the exact gh account in GitHub settings, then check again.",
            recovery: "github-settings",
        };
    }

    const active = healthy.filter((candidate) => candidate.active);
    const activeGithubCom = active.filter(
        (candidate) => candidate.host.toLowerCase() === "github.com",
    );
    const picked =
        activeGithubCom.length === 1
            ? activeGithubCom[0]!
            : active.length === 1
              ? active[0]!
              : null;
    if (picked !== null) return { account: picked, reason: null, recovery: null };
    return {
        account: null,
        reason: "gh has more than one possible active host and no exact account was selected, so the application will not guess which identity should publish the release. Choose an account in GitHub settings, then check again.",
        recovery: "github-settings",
    };
}

function ghStatusFrom(status: GhCliAccountsStatus, account: GhCliAccountSummary | null): GhStatus {
    if (account !== null) {
        return {
            availability: "ready",
            version: status.version,
            account: account.login,
            host: account.host,
            scopes: account.scopesReported ? account.scopes : null,
            message: `${GH_COMMAND} is signed in as ${account.login} on ${account.host}.`,
        };
    }
    return {
        availability: status.availability === "not-installed" ? "not-installed" : "signed-out",
        version: status.version,
        account: null,
        host: null,
        scopes: null,
        message: status.message,
    };
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
export async function resolveTransport(
    options: ResolveTransportOptions,
): Promise<ResolvedTransport> {
    const probe =
        options.probe ??
        ((transport, owner, repo) => transport.readWorkflow(owner, repo, options.workflowFile));
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
                  ...(options.uploadsBase === undefined
                      ? {}
                      : { uploadsBase: options.uploadsBase }),
                  ...(options.account === undefined ? {} : { account: options.account }),
              });

    if (session === null) {
        sessionReason =
            "nobody is signed in to GitHub inside this application - sign in from Settings";
    } else if (wantsGh) {
        sessionReason = `The ${GH_COMMAND} route was asked for explicitly.`;
    } else {
        try {
            await probe(session, options.owner, options.repo);
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
                    scopes: null,
                    message: `${GH_COMMAND} was not checked: the sign-in in this application worked.`,
                    usable: false,
                    reason: "not needed",
                    recovery: null,
                },
                ready: true,
                canUpload: true,
            },
        };
    }

    const ghAccounts = await listGhCliAccounts({
        runner: options.runner,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const selected = chooseGhAccount(
        ghAccounts,
        options.ghTarget ??
            (options.account !== null && options.account !== undefined
                ? { login: options.account }
                : null),
    );
    const gh = ghStatusFrom(ghAccounts, selected.account);
    let ghUsable = false;
    let ghReason: string | null =
        selected.reason ?? (gh.availability === "ready" ? null : gh.message);
    let ghRecovery = selected.recovery;

    let ghRoute: CiTransport | null = null;
    if (selected.account !== null) {
        const ghOptions: GhTransportOptions = {
            runner: options.runner,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            host: selected.account.host,
            account: selected.account.login,
        };
        try {
            await ensureGhIdentity(ghOptions, `checking ${options.owner}/${options.repo}`);
            ghRoute = ghTransport(ghOptions);
            await probe(ghRoute, options.owner, options.repo);
            ghUsable = true;
        } catch (error) {
            ghReason = error instanceof Error ? error.message : String(error);
            if (error instanceof ActionsCallError && error.needsSignIn)
                ghRecovery = "github-settings";
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
                    (sessionReason === null
                        ? "."
                        : `, because the sign-in in this application could not: ${sessionReason}`),
                session: { signedIn: options.token !== null, usable: false, reason: sessionReason },
                gh: { ...gh, usable: true, reason: null, recovery: null },
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
                (gh.availability === "signed-out"
                    ? ` Run \`${GH_LOGIN_COMMAND}\` in a terminal.`
                    : ""),
            session: { signedIn: options.token !== null, usable: false, reason: sessionReason },
            gh: { ...gh, usable: false, reason: ghReason, recovery: ghRecovery },
            ready: false,
            canUpload: false,
        },
    };
}

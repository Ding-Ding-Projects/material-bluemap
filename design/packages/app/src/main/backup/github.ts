/**
 * The GitHub calls a backup makes, and the rules it will not break to make them.
 *
 * Four things happen here and nothing else: the repositories somebody can actually write
 * to are listed, one repository is read so its visibility can be stated before anything
 * leaves the machine, a **new** release is created, and assets are uploaded to it as
 * streams. Reading releases back for a listing is the fifth.
 *
 * ## Append-only, and it is enforced here rather than remembered
 *
 * Every backup is its own release under its own unique tag. Nothing in this file updates
 * a release, deletes one, deletes an asset, or replaces an asset's bytes - there is no
 * function that could. {@link createBackupRelease} refuses a tag that already exists
 * instead of adopting it, so the failure mode where a retry quietly writes over yesterday
 * 's backup is not a bug that could be introduced by a wrong argument; the call it would
 * need does not exist in this module.
 *
 * The one deliberate exception is {@link findExistingAssets}, which *reads* a release this
 * run created so an interrupted upload can skip the parts it already put there. Reading
 * is not writing, and resuming a 20 GB upload from part 31 rather than part 1 is the
 * difference between a backup that completes on a home connection and one that does not.
 *
 * ## Nothing here holds a payload in memory
 *
 * `uploadAsset` takes a path and streams the file into the request body. A part is 500
 * MiB and an archive is many of them; the whole point of the split is that nothing ever
 * has to hold one. `fetch` with a stream body needs `duplex: "half"`, which is not in the
 * DOM lib's `RequestInit`, so it is attached through a narrow cast at the one call site
 * rather than by widening the type everywhere.
 *
 * ## The token never comes from here
 *
 * Every function takes the token as an argument, resolved per call by the caller from
 * `github/session.ts`. A token captured once would be the one thing in a multi-hour
 * upload that cannot renew - stale after a refresh, and absent for ever for somebody who
 * signed in a minute after the window opened.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const GITHUB_API_BASE = "https://api.github.com";
export const GITHUB_UPLOADS_BASE = "https://uploads.github.com";

/** The scope a backup needs. Stated so a refusal can name it rather than say "403". */
export const REQUIRED_SCOPE = "repo";

export interface GitHubCallOptions {
    readonly fetch: FetchLike;
    readonly token: string;
    readonly signal?: AbortSignal | undefined;
    /** Overridable so a test never touches a real hostname. */
    readonly apiBase?: string | undefined;
    readonly uploadsBase?: string | undefined;
}

/** A repository somebody signed in can see, with whether they may write to it. */
export interface RepositoryChoice {
    readonly owner: string;
    readonly name: string;
    /** `owner/name`, which is what every other call takes. */
    readonly fullName: string;
    readonly private: boolean;
    /** True only when GitHub says this account has push access. */
    readonly canWrite: boolean;
    readonly htmlUrl: string;
}

export interface ReleaseAssetInfo {
    readonly id: number;
    readonly name: string;
    readonly size: number;
    readonly state: string;
    readonly downloadUrl: string;
}

export interface BackupRelease {
    readonly id: number;
    readonly tag: string;
    readonly name: string;
    readonly htmlUrl: string;
    readonly uploadUrl: string;
    readonly assets: readonly ReleaseAssetInfo[];
    readonly createdAt: string;
}

/** A GitHub call that did not do what was asked, with the status and a sentence. */
export class GitHubCallError extends Error {
    readonly status: number;
    readonly url: string;

    constructor(message: string, status: number, url: string) {
        super(message);
        this.name = "GitHubCallError";
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

/**
 * A refusal turned into a sentence somebody can act on.
 *
 * The three statuses that actually happen each mean something specific and none of them
 * is obvious from the number: 401 is a token that is no longer good, 403 is very often a
 * token that never had `repo`, and 404 on a repository the person can see in a browser is
 * GitHub's way of not confirming a private repository exists to a token that cannot read
 * it. Reporting the number alone sends people to the wrong place.
 */
async function refuse(response: Response, url: string, what: string): Promise<GitHubCallError> {
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
                " what publishing a release needs. Sign in again and grant it."
              : response.status === 404
                ? " Either it does not exist, or the signed-in account cannot see it - GitHub" +
                  " answers the same way for both, so a private repository the account has no" +
                  " access to looks exactly like a missing one."
                : "";
    return new GitHubCallError(
        `${what} failed: GitHub answered ${String(response.status)}.${explanation}${detail}`,
        response.status,
        url,
    );
}

/**
 * Turns a 422 from release creation into the *right* sentence, which needs GitHub's
 * structured error rather than the status code alone - see {@link createBackupRelease}'s
 * own doc comment for why a live run needed this: a brand-new, never-pushed-to repository
 * answers the same 422 that a genuine tag collision does, with a body that says
 * `"Repository is empty."` rather than naming the tag at all.
 */
async function refuseReleaseCreation(
    response: Response,
    url: string,
    owner: string,
    repo: string,
    tag: string,
): Promise<GitHubCallError> {
    let errors: readonly {
        readonly resource?: unknown;
        readonly code?: unknown;
        readonly field?: unknown;
        readonly message?: unknown;
    }[] = [];
    let topMessage = "";
    try {
        const body = (await response.json()) as {
            message?: unknown;
            errors?: readonly { resource?: unknown; code?: unknown; field?: unknown; message?: unknown }[];
        };
        if (typeof body.message === "string") topMessage = body.message;
        if (Array.isArray(body.errors)) errors = body.errors;
    } catch {
        // A body that is not JSON falls through to the generic sentence below.
    }

    const tagCollision = errors.some(
        (entry) => entry.code === "already_exists" || entry.field === "tag_name",
    );
    if (tagCollision) {
        return new GitHubCallError(
            `${owner}/${repo} already has a release tagged ${tag}. Nothing was changed: a backup ` +
                "never edits or replaces an existing release, so this one was left exactly as it " +
                "was. Start the backup again to get a fresh tag.",
            response.status,
            url,
        );
    }

    const detailText = errors
        .map((entry) => (typeof entry.message === "string" ? entry.message : null))
        .filter((entry): entry is string => entry !== null)
        .join(" ");
    const empty = /repository is empty/i.test(detailText) || /repository is empty/i.test(topMessage);
    if (empty) {
        return new GitHubCallError(
            `${owner}/${repo} has no commits yet, so GitHub cannot create a release on it. Push ` +
                "anything to it - even one commit - and start the backup again; nothing was" +
                " uploaded.",
            response.status,
            url,
        );
    }

    const said = detailText.length > 0 ? detailText : topMessage;
    return new GitHubCallError(
        `Creating a release on ${owner}/${repo} failed: GitHub answered 422.` +
            (said.length > 0 ? ` GitHub said: ${said}` : ""),
        response.status,
        url,
    );
}

function bases(options: GitHubCallOptions): { api: string; uploads: string } {
    return {
        api: options.apiBase ?? GITHUB_API_BASE,
        uploads: options.uploadsBase ?? GITHUB_UPLOADS_BASE,
    };
}

/**
 * Every repository the signed-in account can write to, newest activity first.
 *
 * Paged, and **bounded**. Somebody with six hundred repositories does not need all of
 * them in a picker to find the one they back up to, and an unbounded walk of `/user/repos`
 * is a dozen requests against a rate limit before a dialog can open. The list is a
 * convenience beside a field somebody can type into, which is why running out of pages
 * early is acceptable and inventing a repository never is.
 */
export async function listWritableRepositories(
    options: GitHubCallOptions & { readonly maxPages?: number },
): Promise<readonly RepositoryChoice[]> {
    const { api } = bases(options);
    const maxPages = options.maxPages ?? 3;
    const found: RepositoryChoice[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
        const url =
            `${api}/user/repos?per_page=100&page=${String(page)}` +
            "&sort=pushed&affiliation=owner,collaborator,organization_member";
        const response = await options.fetch(url, {
            headers: headers(options.token),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        if (!response.ok) throw await refuse(response, url, "Listing your repositories");

        const body: unknown = await response.json();
        if (!Array.isArray(body) || body.length === 0) break;

        for (const item of body) {
            const choice = readRepositoryRecord(item);
            if (choice !== null) found.push(choice);
        }
        if (body.length < 100) break;
    }

    return found.filter((repository) => repository.canWrite);
}

/**
 * One repository, read so its visibility can be stated before anything is uploaded.
 *
 * This is the call behind the public-repository warning, and it is made against GitHub
 * rather than guessed from a name, because the guess is the failure: somebody types a
 * repository they believe is private, and a world with their coordinates, their builds
 * and whatever a friend left in a chest becomes a public download.
 */
export async function readRepository(
    owner: string,
    repo: string,
    options: GitHubCallOptions,
): Promise<RepositoryChoice> {
    const { api } = bases(options);
    const url = `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const response = await options.fetch(url, {
        headers: headers(options.token),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!response.ok) throw await refuse(response, url, `Reading ${owner}/${repo}`);

    const choice = readRepositoryRecord(await response.json());
    if (choice === null) {
        throw new GitHubCallError(
            `GitHub's answer for ${owner}/${repo} was not a repository this build understands.`,
            response.status,
            url,
        );
    }
    return choice;
}

function readRepositoryRecord(value: unknown): RepositoryChoice | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const fullName = record["full_name"];
    const owner = record["owner"];
    const name = record["name"];
    if (typeof fullName !== "string" || typeof name !== "string") return null;
    const login =
        typeof owner === "object" && owner !== null
            ? (owner as Record<string, unknown>)["login"]
            : null;
    if (typeof login !== "string") return null;
    const permissions = record["permissions"];
    const push =
        typeof permissions === "object" && permissions !== null
            ? (permissions as Record<string, unknown>)["push"]
            : null;
    return {
        owner: login,
        name,
        fullName,
        private: record["private"] === true,
        // Absent permissions mean "GitHub did not say", which is not the same as yes.
        canWrite: push === true,
        htmlUrl: typeof record["html_url"] === "string" ? record["html_url"] : "",
    };
}

/**
 * Creates a **new** release for one backup, and refuses a tag that already exists.
 *
 * GitHub answers 422 for a tag that is already taken, and this is turned into a sentence
 * saying so rather than being retried against the existing release, because adopting it
 * is precisely the behaviour that would let a second backup's assets land beside - or
 * over - a first one's. Every backup gets its own release; a tag collision means
 * something is wrong with the naming, not that the release should be reused.
 *
 * ## 422 is not only a tag collision
 *
 * A live run against an empty repository - one created but never pushed to - found this
 * the hard way: GitHub answers the *same* status, 422, for "this tag already exists" and
 * for "this repository has no commits yet, so there is nothing to tag." Assuming the first
 * for every 422 (as this function used to) tells somebody backing up to a brand-new
 * repository for the first time that a release "already exists" and to "start the backup
 * again to get a fresh tag" - advice that fails identically forever, because the real
 * problem is that the repository is empty, not that a tag collided. The two are told apart
 * by GitHub's own structured `errors[].code`: `already_exists` for a real collision,
 * anything else read for what it actually says.
 *
 * The release is created as a **prerelease** and marked in its body. A repository's
 * "latest release" is what an installer link and a release feed point at, and a backup
 * quietly becoming the latest release of somebody's project would be a real nuisance
 * caused by a feature they only wanted for storage.
 */
export async function createBackupRelease(
    owner: string,
    repo: string,
    tag: string,
    name: string,
    body: string,
    options: GitHubCallOptions,
): Promise<BackupRelease> {
    const { api } = bases(options);
    const url = `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`;
    const response = await options.fetch(url, {
        method: "POST",
        headers: { ...headers(options.token), "content-type": "application/json" },
        body: JSON.stringify({
            tag_name: tag,
            name,
            body,
            draft: false,
            prerelease: true,
            make_latest: "false",
        }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    if (response.status === 422) {
        throw await refuseReleaseCreation(response, url, owner, repo, tag);
    }
    if (!response.ok) throw await refuse(response, url, `Creating a release on ${owner}/${repo}`);

    const release = readRelease(await response.json());
    if (release === null) {
        throw new GitHubCallError(
            "GitHub created something that this build could not read back as a release.",
            response.status,
            url,
        );
    }
    return release;
}

/** What creating a new repository needs: who it belongs to, its name, and its visibility. */
export interface CreateRepositoryRequest {
    readonly ownerLogin: string;
    readonly ownerKind: "user" | "organization";
    readonly name: string;
    readonly private: boolean;
}

/**
 * Creates a brand-new repository for the person or one of the organisations they belong
 * to, and initialises it with one starter commit.
 *
 * ## Why `auto_init: true` is not a default worth reconsidering
 *
 * A repository with no commits at all answers a very specific 422 the moment anything
 * tries to create a release on it - `"Repository is empty."` - which
 * {@link createBackupRelease}'s own doc comment already had to explain once, learned the
 * hard way against a real, freshly created, never-pushed-to repository. Initialising with
 * GitHub's own starter commit sidesteps that trap entirely, for the very first repository
 * somebody creates from this screen, at no cost to anything else: the one starter commit
 * is simply the first thing a backup's release sits alongside.
 *
 * ## What GitHub needs told apart
 *
 * A personal repository is created at `POST /user/repos`; one under an organisation is
 * created at `POST /orgs/{org}/repos` instead - two different endpoints, not one endpoint
 * with an `org` field, which is why {@link CreateRepositoryRequest.ownerKind} exists at
 * all rather than being inferred from the login.
 */
export async function createRepository(
    request: CreateRepositoryRequest,
    options: GitHubCallOptions,
): Promise<RepositoryChoice> {
    const { api } = bases(options);
    const name = request.name.trim();
    const url =
        request.ownerKind === "organization"
            ? `${api}/orgs/${encodeURIComponent(request.ownerLogin)}/repos`
            : `${api}/user/repos`;
    const response = await options.fetch(url, {
        method: "POST",
        headers: { ...headers(options.token), "content-type": "application/json" },
        body: JSON.stringify({ name, private: request.private, auto_init: true }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    if (response.status === 422) throw await refuseRepositoryCreation(response, url, name);
    if (!response.ok) {
        throw await refuse(response, url, `Creating ${request.ownerLogin}/${name}`);
    }

    const choice = readRepositoryRecord(await response.json());
    if (choice === null) {
        throw new GitHubCallError(
            "GitHub created the repository but described it in a way this build could not read.",
            response.status,
            url,
        );
    }
    return choice;
}

/**
 * Turns a 422 from repository creation into the sentence a person actually needs, telling
 * a genuine name collision apart from every other validation refusal GitHub answers the
 * same status for - an invalid character, a name that is only punctuation, a name past the
 * length limit.
 */
async function refuseRepositoryCreation(
    response: Response,
    url: string,
    name: string,
): Promise<GitHubCallError> {
    let errors: readonly { readonly field?: unknown; readonly code?: unknown; readonly message?: unknown }[] = [];
    let topMessage = "";
    try {
        const body = (await response.json()) as {
            message?: unknown;
            errors?: readonly { field?: unknown; code?: unknown; message?: unknown }[];
        };
        if (typeof body.message === "string") topMessage = body.message;
        if (Array.isArray(body.errors)) errors = body.errors;
    } catch {
        // A body that is not JSON falls through to the generic sentence below.
    }

    const nameTaken = errors.some(
        (entry) =>
            entry.field === "name" &&
            (entry.code === "already_exists" ||
                (typeof entry.message === "string" && /already exists/i.test(entry.message))),
    );
    if (nameTaken) {
        return new GitHubCallError(REPOSITORY_NAME_TAKEN_MESSAGE(name), response.status, url);
    }

    const detailText = errors
        .map((entry) => (typeof entry.message === "string" ? entry.message : null))
        .filter((entry): entry is string => entry !== null)
        .join(" ");
    const said = detailText.length > 0 ? detailText : topMessage;
    return new GitHubCallError(
        `Creating "${name}" failed: GitHub answered 422.${said.length > 0 ? ` GitHub said: ${said}` : ""}`,
        response.status,
        url,
    );
}

/**
 * The exact sentence a name collision produces, exported so a caller can recognise it
 * without re-parsing prose - {@link isRepositoryNameTakenError} is the recommended way to
 * ask "was this refused because the name is taken", but the sentence itself is public too
 * because it is what the person actually reads.
 */
function REPOSITORY_NAME_TAKEN_MESSAGE(name: string): string {
    return (
        `A repository named "${name}" already exists there. Choose a different name, or pick ` +
        "it from the list to use it as it is."
    );
}

/**
 * True when a thrown {@link createRepository} failure means specifically "that name is
 * already taken", as opposed to any other 422 GitHub answers for repository creation - a
 * disallowed character, a name that is only punctuation, one past the length limit. Checked
 * by status and by the exact sentence {@link createRepository} itself produced, never by
 * guessing at GitHub's own wording, so this cannot drift from what was actually thrown.
 */
export function isRepositoryNameTakenError(error: unknown): boolean {
    return (
        error instanceof GitHubCallError &&
        error.status === 422 &&
        error.message.startsWith('A repository named "') &&
        error.message.includes("already exists there")
    );
}

/** One release by its tag, or null when there is none. Read-only, by construction. */
export async function findReleaseByTag(
    owner: string,
    repo: string,
    tag: string,
    options: GitHubCallOptions,
): Promise<BackupRelease | null> {
    const { api } = bases(options);
    const url =
        `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/releases/tags/${encodeURIComponent(tag)}`;
    const response = await options.fetch(url, {
        headers: headers(options.token),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw await refuse(response, url, `Reading the release tagged ${tag}`);
    return readRelease(await response.json());
}

/**
 * The assets already on a release, by name, for a resumed upload.
 *
 * Only the ones GitHub reports as `uploaded`. An asset stuck in `starter` or `new` is one
 * whose upload did not finish, and skipping it because a name matched is exactly how a
 * resumed backup ends up with a truncated part that nothing notices until a restore.
 */
export async function findExistingAssets(
    owner: string,
    repo: string,
    tag: string,
    options: GitHubCallOptions,
): Promise<ReadonlyMap<string, ReleaseAssetInfo>> {
    const release = await findReleaseByTag(owner, repo, tag, options);
    const assets = new Map<string, ReleaseAssetInfo>();
    if (release === null) return assets;
    for (const asset of release.assets) {
        if (asset.state === "uploaded") assets.set(asset.name, asset);
    }
    return assets;
}

/** Every release on a repository, newest first, bounded the same way the repo list is. */
export async function listReleases(
    owner: string,
    repo: string,
    options: GitHubCallOptions & { readonly maxPages?: number },
): Promise<readonly BackupRelease[]> {
    const { api } = bases(options);
    const maxPages = options.maxPages ?? 2;
    const found: BackupRelease[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
        const url =
            `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
            `/releases?per_page=100&page=${String(page)}`;
        const response = await options.fetch(url, {
            headers: headers(options.token),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        if (!response.ok) throw await refuse(response, url, `Listing releases on ${owner}/${repo}`);

        const body: unknown = await response.json();
        if (!Array.isArray(body) || body.length === 0) break;
        for (const item of body) {
            const release = readRelease(item);
            if (release !== null) found.push(release);
        }
        if (body.length < 100) break;
    }

    return found;
}

/**
 * Downloads one small asset as text.
 *
 * Small is enforced by the caller passing a bound, because this is how a pointer and a
 * sidecar are read out of a release that anyone with write access could have put anything
 * on. An asset that is bigger than the bound is refused without being read, rather than
 * streamed into memory to find out.
 */
export async function readTextAsset(
    asset: ReleaseAssetInfo,
    maxBytes: number,
    options: GitHubCallOptions,
): Promise<string | null> {
    if (asset.size > maxBytes) return null;
    const response = await options.fetch(asset.downloadUrl, {
        headers: { ...headers(options.token), accept: "application/octet-stream" },
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) return null;
    return buffer.toString("utf8");
}

export interface UploadProgress {
    readonly bytesSent: number;
    readonly bytesTotal: number;
}

export interface UploadOptions extends GitHubCallOptions {
    readonly onProgress?: ((progress: UploadProgress) => void) | undefined;
}

/**
 * Uploads one file as a release asset, streamed from disk.
 *
 * `Content-Length` is set from the file's own size so GitHub knows what is coming, and
 * the body is a stream so nothing larger than a read chunk is ever in memory. Progress is
 * counted from what has actually been handed to the request rather than from a timer,
 * which is what makes a stalled connection look stalled instead of looking finished.
 *
 * A **text** asset (the pointer, the sidecar) goes up the same way. There is no separate
 * small-file path, because a second path is a second place for the authentication, the
 * naming and the failure reporting to drift.
 */
export async function uploadAsset(
    release: BackupRelease,
    owner: string,
    repo: string,
    assetName: string,
    filePath: string,
    options: UploadOptions,
): Promise<ReleaseAssetInfo> {
    const { uploads } = bases(options);
    const stats = await stat(filePath);
    const url =
        `${uploads}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/releases/${String(release.id)}/assets?name=${encodeURIComponent(assetName)}`;

    /**
     * Counted as the request consumes it, not as the file emits it.
     *
     * The obvious spelling - attach a `data` listener to the read stream and wrap it -
     * is wrong twice over. It puts the stream into flowing mode *before* the body wrapper
     * subscribes, so the first chunks can be emitted into nothing and lost; and it counts
     * bytes as they leave the disk rather than as they are handed to the request, which
     * on a fast disk and a slow link means the bar reaches 100% minutes before the upload
     * does. A generator counts at exactly the moment the body is pulled, which is both
     * safe and the number somebody actually wants.
     */
    const source = createReadStream(filePath);
    async function* counting(): AsyncGenerator<Buffer> {
        let sent = 0;
        for await (const chunk of source) {
            const buffer = chunk as Buffer;
            sent += buffer.length;
            options.onProgress?.({ bytesSent: sent, bytesTotal: stats.size });
            yield buffer;
        }
    }

    // Two things here are outside `RequestInit` as this project's TypeScript sees it: a
    // web `ReadableStream` as the body, and `duplex`, which the fetch specification
    // requires for a streaming body and which the type does not carry. Both are real at
    // run time. One cast at the one place that needs it is better than widening the type
    // for the whole module and losing the checking everywhere else.
    const init = {
        method: "POST",
        headers: {
            ...headers(options.token),
            "content-type": "application/octet-stream",
            "content-length": String(stats.size),
        },
        body: Readable.toWeb(Readable.from(counting())),
        duplex: "half",
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    } as unknown as RequestInit;

    const response = await options.fetch(url, init);
    if (!response.ok) {
        throw await refuse(response, url, `Uploading ${assetName}`);
    }

    const asset = readAsset(await response.json());
    if (asset === null) {
        throw new GitHubCallError(
            `GitHub accepted ${assetName} but described it in a way this build could not read.`,
            response.status,
            url,
        );
    }
    return asset;
}

function readRelease(value: unknown): BackupRelease | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const id = record["id"];
    const tag = record["tag_name"];
    if (typeof id !== "number" || typeof tag !== "string") return null;

    const rawAssets = record["assets"];
    const assets: ReleaseAssetInfo[] = [];
    if (Array.isArray(rawAssets)) {
        for (const item of rawAssets) {
            const asset = readAsset(item);
            if (asset !== null) assets.push(asset);
        }
    }

    return {
        id,
        tag,
        name: typeof record["name"] === "string" ? record["name"] : tag,
        htmlUrl: typeof record["html_url"] === "string" ? record["html_url"] : "",
        uploadUrl: typeof record["upload_url"] === "string" ? record["upload_url"] : "",
        assets,
        createdAt: typeof record["created_at"] === "string" ? record["created_at"] : "",
    };
}

function readAsset(value: unknown): ReleaseAssetInfo | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const id = record["id"];
    const name = record["name"];
    const size = record["size"];
    if (typeof id !== "number" || typeof name !== "string" || typeof size !== "number") return null;
    return {
        id,
        name,
        size,
        state: typeof record["state"] === "string" ? record["state"] : "uploaded",
        downloadUrl:
            typeof record["browser_download_url"] === "string" ? record["browser_download_url"] : "",
    };
}

/**
 * The record reader, exported so a test can prove the listing and the single-repository
 * call agree about what "may write to this" means without standing up two fake responses.
 */
export { readRepositoryRecord as parseRepositoryRecord };

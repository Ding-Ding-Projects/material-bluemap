/**
 * Putting a locally rendered map on GitHub Pages, from the application, end to end.
 *
 * ## What this is for
 *
 * A render finishes and the map is served at `http://127.0.0.1:<port>/local/<renderId>/`,
 * which is a URL nobody else can open. Showing it to somebody means either leaving this
 * computer running as a web server or copying a tile tree by hand into a repository and
 * hoping the viewer can still find its files. This is the second of those, done properly:
 * one action that prepares the render for a dumb static host, pushes it, turns Pages on,
 * waits for the build and then **fetches the published URL to check it really answers**.
 *
 * ## The fact the whole feature rests on
 *
 * `@worldlens/render-actions`'s `prepareStaticHost` carries the explanation in full,
 * and it is worth repeating in one line because everything here is downstream of it: the
 * engine writes `0.prbm.gz`, the viewer asks for `0.prbm`, and only a web server that
 * rewrites the name makes those two agree. GitHub Pages does not rewrite anything. So the
 * viewer has to be told to ask for the compressed names and inflate them itself, and this
 * module refuses to publish a map where flipping that switch would point the viewer at
 * files nobody wrote.
 *
 * ## Where the git directory lives, and why the render output is still safe
 *
 * There is no `.git` inside the render output, ever. The repository lives in the
 * application's own work area, and every git command names it explicitly:
 *
 * ```
 * git -C <webRoot> --git-dir=<workDir>/.git --work-tree=<webRoot> ...
 * ```
 *
 * The alternative - copying the tile tree into a staging directory first - was rejected on
 * arithmetic rather than taste. A rendered map is routinely several gigabytes across tens of
 * thousands of small files, and copying it doubles both the disk it needs and the time before
 * anything is pushed, to produce a byte-for-byte duplicate of a directory that is already
 * sitting there. Git never writes into a work tree during `add`, `commit` or `push`, so the
 * only thing this puts into the render output is the marker file below, beside the
 * `.nojekyll` that `prepareStaticHost` already writes there.
 *
 * ## The marker, which is the guard that stops this eating somebody's repository
 *
 * Every publish writes {@link PAGES_MARKER_FILE} at the site root, naming this tool, the
 * render and the maps it carries. Before anything is pushed, and again before anything is
 * deleted, the target branch is read: **if the branch exists and does not carry that marker,
 * this refuses**. A publishing branch is force-replaced on every run - a republished map is a
 * replacement, and keeping the history of a million tiles would grow a repository without
 * bound - so without that check one wrong repository name would destroy somebody's site with
 * no way back. It is the one guard in this file that has no fallback and no override.
 *
 * ## Honesty
 *
 * `status` is what GitHub said, and `verified` is true only when a request to the published
 * URL came back `200`. "Queued" and "building" are reported as themselves. A push is reported
 * as landed only after the branch on GitHub is read back and its head matches the commit that
 * was just made. Nothing here guesses, and nothing here waits a while and then assumes.
 *
 * ## Secrets
 *
 * No token is read, held, logged or passed as an argument. Authentication for both the API
 * and the push is `gh`'s own credential store, reached through `gh api` and through git's
 * `credential.helper` mechanism pointed at `gh auth git-credential` for the one command that
 * needs it. `gh auth login` is never driven from here - see `cirender/gh.ts` for why that is
 * a hard-won rule rather than a preference.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareStaticHost, StaticHostError } from "@worldlens/render-actions";
import type { StaticHostReport } from "@worldlens/render-actions";
import { ActionsCallError } from "../cirender/actions.js";
import { GH_COMMAND, detectGh, ghApiJson, ghApiSend, nodeProcessRunner } from "../cirender/gh.js";
import type { GhStatus, ProcessRunner } from "../cirender/gh.js";
import { listRenderIds, renderWorkspace } from "../render/workspace.js";

/** The executable, named once so a test and the real runner cannot drift. */
export const GIT_COMMAND = "git";

/** Where a published map lands. GitHub's own conventional publishing branch. */
export const DEFAULT_PAGES_BRANCH = "gh-pages";

/** The file that says a branch belongs to this application, and to which render. */
export const PAGES_MARKER_FILE = ".worldlens-map.json";
export const LEGACY_PAGES_MARKER_FILE = ".material-bluemap-map.json";

/** Bumped only if the marker's shape changes. An unknown version is still *ours*. */
export const PAGES_MARKER_VERSION = 1;

/** The value of the marker's `tool` field. Nothing else is accepted as ours. */
export const PAGES_MARKER_TOOL = "worldlens";
export const LEGACY_PAGES_MARKER_TOOL = "material-bluemap";

/** How long a Pages build is waited for before the result is reported as still building. */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_POLL_ATTEMPTS = 60;

/**
 * How many paths are handed to one `git add`.
 *
 * Batched rather than `git add -A` for one reason: a person watching tens of thousands of
 * tiles being staged needs a number that moves, and `git add -A` produces exactly one line
 * of output at the end. Paths go in on stdin, NUL-separated, so a batch this size is one
 * short command line whatever the paths look like.
 */
export const STAGE_BATCH = 2_000;

/* -------------------------------------------------------------------------- */
/* What crosses                                                               */
/* -------------------------------------------------------------------------- */

export interface PagesMarker {
    readonly tool: string;
    readonly version: number;
    readonly renderId: string;
    readonly maps: readonly string[];
    readonly publishedAt: string;
}

/** A finished render that could be published. */
export interface PagesCandidate {
    readonly renderId: string;
    readonly webRoot: string;
    /** The map ids the web app lists, or an empty array when it could not be read. */
    readonly maps: readonly string[];
    /** Why this render cannot be read at all, when that is the case. */
    readonly problem: string | null;
}

export interface PagesOwner {
    readonly login: string;
    readonly kind: "user" | "organization";
}

export type PagesPhase =
    | "preparing"
    | "checking"
    | "staging"
    | "pushing"
    | "enabling"
    | "waiting"
    | "verifying"
    | "finished";

/**
 * What GitHub says the site is, said in GitHub's own words.
 *
 * `live` is not one of GitHub's words and is not taken from it: it is set here, and only
 * after a request to the published URL answered `200`. Everything else is reported exactly as
 * it arrived, because "built" from the API and "a browser can open it" are two claims and
 * only the second one is what somebody is about to send to a friend.
 */
export type PagesSiteStatus = "live" | "built" | "building" | "queued" | "errored" | "unknown";

/** The last durable boundary reached by a publish. Older records are treated as finished. */
export type PagesPublishStage = PagesPhase | "finished";

export interface PagesFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    /** True when running `gh auth login` in a terminal is what would fix it. */
    readonly needsGhSignIn: boolean;
}

export interface PagesTarget {
    readonly renderId: string;
    readonly owner: string;
    readonly repo: string;
    /** Defaults to {@link DEFAULT_PAGES_BRANCH}. */
    readonly branch?: string;
}

export interface PagesPublishRequest extends PagesTarget {
    /** Only consulted when the repository has to be created. Existing ones are left alone. */
    readonly visibility?: "public" | "private";
    /** Set by the surface once the person has seen the preflight. Refused without it. */
    readonly acknowledgePublish?: boolean;
}

export interface PagesRepositoryReport {
    readonly fullName: string;
    readonly exists: boolean;
    readonly private: boolean | null;
    readonly canWrite: boolean | null;
    readonly htmlUrl: string | null;
    /** What was learned about the publishing branch, before anything is written. */
    readonly branchExists: boolean;
    readonly branchIsOurs: boolean | null;
    readonly branchMarker: PagesMarker | null;
    readonly failure: string | null;
}

export interface PagesPreflight {
    readonly renderId: string;
    readonly webRoot: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    /** `prepareStaticHost` with `write: false`: a preview that touched nothing. */
    readonly site: StaticHostReport | null;
    readonly siteFailure: string | null;
    readonly gh: GhStatus;
    readonly gitVersion: string | null;
    readonly repository: PagesRepositoryReport | null;
    /** Anything that would stop a publish. Non-empty means the button must not be pressed. */
    readonly blockers: readonly string[];
    /** True, expensive or surprising, but not a refusal. */
    readonly warnings: readonly string[];
    /** What is already recorded as published for this render, if anything. */
    readonly published: PagesRecord | null;
}

/** What this computer remembers about a render it published. */
export interface PagesRecord {
    readonly version: number;
    readonly renderId: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    /** Durable progress marker used to resume an interrupted publish. */
    readonly stage: PagesPublishStage;
    readonly url: string | null;
    readonly commit: string | null;
    readonly status: PagesSiteStatus;
    readonly verified: boolean;
    readonly publishedAt: string;
}

export interface PagesPublishReport {
    readonly renderId: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly repositoryUrl: string;
    /** The orphan commit that was pushed, read back from git rather than assumed. */
    readonly commit: string;
    /** True only once GitHub reported that branch's head as this commit. */
    readonly pushVerified: boolean;
    readonly status: PagesSiteStatus;
    readonly url: string | null;
    /** True only when a request to {@link url} answered 200. */
    readonly verified: boolean;
    readonly httpStatus: number | null;
    readonly site: StaticHostReport;
    readonly notes: readonly string[];
}

export type PagesResult =
    | { readonly ok: true; readonly report: PagesPublishReport; readonly durationMs: number }
    | { readonly ok: false; readonly failure: PagesFailure };

export interface PagesStopReport {
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly pagesDisabled: boolean;
    readonly branchDeleted: boolean;
    readonly notes: readonly string[];
}

export type PagesStopResult =
    | { readonly ok: true; readonly report: PagesStopReport }
    | { readonly ok: false; readonly failure: PagesFailure };

export type PagesEvent =
    | { readonly type: "started"; readonly renderId: string; readonly target: string; readonly at: string }
    | { readonly type: "phase"; readonly renderId: string; readonly phase: PagesPhase; readonly at: string }
    /**
     * Real progress with real numbers.
     *
     * Tens of thousands of small files is the ordinary case for a rendered map, so a spinner
     * over the staging step is indistinguishable from a hang for several minutes. `done` and
     * `total` are files while staging and seconds-shaped attempt counts while waiting for a
     * build; `description` says which.
     */
    | {
          readonly type: "progress";
          readonly renderId: string;
          readonly phase: PagesPhase;
          readonly description: string;
          readonly done: number;
          readonly total: number;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly renderId: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly renderId: string;
          readonly report: PagesPublishReport;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly renderId: string; readonly failure: PagesFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly renderId: string; readonly at: string };

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

export interface PagesHostOptions {
    /** Where renders live. A function, so a moved storage folder takes effect. */
    readonly storageDir: () => string;
    /**
     * Where the git directories live. **Never inside a render, and never inside a world.**
     * The application passes a folder under its own data directory.
     */
    readonly workRoot: () => string;
    /** How `git` and `gh` are run. Left out, real child processes; injected in every test. */
    readonly runner?: ProcessRunner | undefined;
    readonly onEvent?: ((event: PagesEvent) => void) | undefined;
    /**
     * Fetches the published URL and answers its HTTP status, or null when it could not be
     * reached at all. Overridable so no test ever touches the network.
     */
    readonly probe?: ((url: string, signal?: AbortSignal) => Promise<number | null>) | undefined;
    readonly sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
    readonly pollIntervalMs?: number | undefined;
    readonly pollAttempts?: number | undefined;
    readonly now?: (() => Date) | undefined;
    /** The name on the generated commit. Never a person's git identity, which is not ours. */
    readonly committer?: { readonly name: string; readonly email: string } | undefined;
}

const DEFAULT_COMMITTER = {
    name: "Worldlens",
    email: "worldlens@users.noreply.github.com",
} as const;

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const text = String(error);
    return text.length > 0 ? text : "The map could not be published, and nothing said why.";
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

/** A GET whose 404 is an answer rather than a failure. Every other refusal still throws. */
async function ghJsonOrNull(
    endpoint: string,
    options: { readonly runner: ProcessRunner; readonly signal?: AbortSignal | undefined },
): Promise<unknown | null> {
    try {
        return await ghApiJson(endpoint, options);
    } catch (error) {
        if (error instanceof ActionsCallError && error.status === 404) return null;
        throw error;
    }
}

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function text(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The marker, read from whatever `gh api .../contents/...` answered.
 *
 * Returns null for "there is no marker" and for "there is a file there that is not one",
 * because those two lead to the same refusal: a branch this cannot prove it wrote is a branch
 * it must not replace.
 */
export function readMarker(payload: unknown): PagesMarker | null {
    const outer = record(payload);
    if (outer === null) return null;

    let source: Record<string, unknown> | null = outer;
    const encoded = text(outer["content"]);
    if (encoded !== null) {
        try {
            source = record(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
        } catch {
            return null;
        }
    }
    if (source === null) return null;
    if (source["tool"] !== PAGES_MARKER_TOOL && source["tool"] !== LEGACY_PAGES_MARKER_TOOL) {
        return null;
    }

    const renderId = text(source["renderId"]);
    const publishedAt = text(source["publishedAt"]);
    const maps = Array.isArray(source["maps"])
        ? source["maps"].filter((entry): entry is string => typeof entry === "string")
        : [];
    const version = typeof source["version"] === "number" ? source["version"] : 0;

    return {
        tool: PAGES_MARKER_TOOL,
        version,
        renderId: renderId ?? "",
        maps,
        publishedAt: publishedAt ?? "",
    };
}

/** Every file under a directory, as forward-slashed paths relative to it. */
async function walkFiles(root: string, relative = ""): Promise<string[]> {
    const found: string[] = [];
    const entries = await readdir(join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
        const next = relative === "" ? entry.name : `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
            found.push(...(await walkFiles(root, next)));
            continue;
        }
        if (entry.isFile()) found.push(next);
    }
    return found;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new Error("cancelled"));
            },
            { once: true },
        );
    });
}

/**
 * The real probe: one request, following redirects, reporting the status and nothing else.
 *
 * `null` means the request never got an answer - DNS, a dead connection, a certificate. That
 * is deliberately not folded into a status code, because "the site is not there yet" and "the
 * site answered 404" want different sentences and only one of them is worth waiting through.
 */
async function defaultProbe(url: string, signal?: AbortSignal): Promise<number | null> {
    try {
        const response = await fetch(url, {
            method: "GET",
            redirect: "follow",
            ...(signal === undefined ? {} : { signal }),
        });
        return response.status;
    } catch {
        return null;
    }
}

class Cancelled extends Error {
    constructor() {
        super("cancelled");
        this.name = "Cancelled";
    }
}

/* -------------------------------------------------------------------------- */
/* The host                                                                   */
/* -------------------------------------------------------------------------- */

export class PagesHost {
    private readonly options: PagesHostOptions;
    private readonly runner: ProcessRunner;
    private readonly running = new Map<string, AbortController>();

    constructor(options: PagesHostOptions) {
        this.options = options;
        this.runner = options.runner ?? nodeProcessRunner();
    }

    /* ---------------------------------------------------------------- */
    /* Reading                                                          */
    /* ---------------------------------------------------------------- */

    /** Every render on this computer that has a web root worth publishing. */
    async candidates(): Promise<PagesCandidate[]> {
        const storage = this.options.storageDir();
        const found: PagesCandidate[] = [];
        for (const renderId of await listRenderIds(storage)) {
            const workspace = renderWorkspace(storage, renderId);
            const settings = join(workspace.webRoot, "settings.json");
            if (!(await exists(settings))) continue;
            try {
                const parsed: unknown = JSON.parse(await readFile(settings, "utf8"));
                const maps = record(parsed)?.["maps"];
                found.push({
                    renderId,
                    webRoot: workspace.webRoot,
                    maps: Array.isArray(maps)
                        ? maps
                              .map((entry) =>
                                  typeof entry === "string" ? entry : text(record(entry)?.["id"]),
                              )
                              .filter((entry): entry is string => entry !== null)
                        : [],
                    problem: null,
                });
            } catch (error) {
                // Listed with its problem rather than dropped. A render that vanishes from
                // the list reads as a render that was lost.
                found.push({ renderId, webRoot: workspace.webRoot, maps: [], problem: sentence(error) });
            }
        }
        return found;
    }

    /** Accounts this `gh` sign-in can create a repository under: the person, and their orgs. */
    async owners(signal?: AbortSignal): Promise<PagesOwner[]> {
        const runner = this.runner;
        const owners: PagesOwner[] = [];
        const me = record(await ghApiJson("user", { runner, ...(signal ? { signal } : {}) }));
        const login = text(me?.["login"]);
        if (login !== null) owners.push({ login, kind: "user" });

        const orgs: unknown = await ghApiJson("user/orgs?per_page=100", {
            runner,
            ...(signal ? { signal } : {}),
        });
        if (Array.isArray(orgs)) {
            for (const entry of orgs) {
                const name = text(record(entry)?.["login"]);
                if (name !== null) owners.push({ login: name, kind: "organization" });
            }
        }
        return owners;
    }

    /** What this computer remembers publishing, newest first. */
    async records(): Promise<PagesRecord[]> {
        const root = this.options.workRoot();
        const found: PagesRecord[] = [];
        let names: string[];
        try {
            names = (await readdir(root, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name);
        } catch {
            return [];
        }
        for (const name of names) {
            const value = await this.readRecord(name);
            if (value !== null) found.push(value);
        }
        return found.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
    }

    async readRecord(renderId: string): Promise<PagesRecord | null> {
        try {
            const parsed: unknown = JSON.parse(
                await readFile(join(this.options.workRoot(), renderId, "publish.json"), "utf8"),
            );
            const row = record(parsed);
            const owner = text(row?.["owner"]);
            const repo = text(row?.["repo"]);
            if (row === null || owner === null || repo === null) return null;
            return {
                version: typeof row["version"] === "number" ? row["version"] : 1,
                renderId,
                owner,
                repo,
                branch: text(row["branch"]) ?? DEFAULT_PAGES_BRANCH,
                stage: (text(row["stage"]) ?? "finished") as PagesPublishStage,
                url: text(row["url"]),
                commit: text(row["commit"]),
                status: (text(row["status"]) ?? "unknown") as PagesSiteStatus,
                verified: row["verified"] === true,
                publishedAt: text(row["publishedAt"]) ?? "",
            };
        } catch {
            return null;
        }
    }

    /* ---------------------------------------------------------------- */
    /* Preflight                                                        */
    /* ---------------------------------------------------------------- */

    /**
     * Everything a person needs before agreeing, and nothing that changes anything.
     *
     * `prepareStaticHost` runs with `write: false`, so this is a preview: it reports what
     * would be flipped and what is missing without touching a byte. The repository is read
     * only if `gh` is signed in, because every answer it could give is unknowable otherwise
     * and a report full of "could not check" reads as a report of problems.
     */
    async preflight(request: PagesTarget, signal?: AbortSignal): Promise<PagesPreflight> {
        const branch = normaliseBranch(request.branch);
        const webRoot = renderWorkspace(this.options.storageDir(), request.renderId).webRoot;
        const blockers: string[] = [];
        const warnings: string[] = [];

        let site: StaticHostReport | null = null;
        let siteFailure: string | null = null;
        try {
            site = await prepareStaticHost({ webRoot, write: false });
        } catch (error) {
            siteFailure = error instanceof StaticHostError ? error.message : sentence(error);
            blockers.push(siteFailure);
        }

        if (site !== null) {
            for (const map of site.maps) {
                if (map.missing.length > 0) {
                    blockers.push(
                        `The map ${map.id} is missing ${map.missing.join(", ")}. Published as it ` +
                            "stands, the site would load and then show nothing.",
                    );
                }
            }
            for (const file of site.oversizedFiles) {
                blockers.push(
                    `${file.path} is ${String(file.bytes)} bytes, past GitHub's 100 MB per-file ` +
                        "limit. It cannot be pushed at all, so this map cannot be hosted this way.",
                );
            }
            if (site.maps.length === 0) {
                blockers.push("This render lists no maps, so there would be nothing to look at.");
            }
            if (site.overSoftLimit) {
                warnings.push(
                    "This site is over the 1 GB GitHub asks Pages sites to stay under. Publishing " +
                        "may be refused or throttled, and rendering a smaller area is the usual way down.",
                );
            }
            if (site.fileCount > 20_000) {
                warnings.push(
                    `${String(site.fileCount)} files will be pushed. Tens of thousands of small ` +
                        "files take a while whatever the total size says.",
                );
            }
        }

        const gh = await detectGh(this.runner, signal === undefined ? {} : { signal });
        if (gh.availability === "not-installed") blockers.push(gh.message);
        if (gh.availability === "signed-out") blockers.push(gh.message);

        const gitProbe = await this.runner.run(GIT_COMMAND, ["--version"], signal ? { signal } : {});
        const gitVersion = gitProbe.started && gitProbe.code === 0 ? gitProbe.stdout.trim() : null;
        if (!gitProbe.started) {
            blockers.push(
                "git is not on this computer's PATH, and publishing a map is a push. Install it " +
                    "from git-scm.com and check again.",
            );
        }

        let repository: PagesRepositoryReport | null = null;
        if (gh.availability === "ready" && request.owner.length > 0 && request.repo.length > 0) {
            repository = await this.readRepository(request.owner, request.repo, branch, signal);
            if (repository.failure !== null) warnings.push(repository.failure);
            if (repository.exists && repository.canWrite === false) {
                blockers.push(
                    `${repository.fullName} exists and this account cannot write to it, so nothing ` +
                        "can be published there.",
                );
            }
            if (repository.branchExists && repository.branchIsOurs === false) {
                blockers.push(
                    `${repository.fullName} already has a ${branch} branch that this application ` +
                        "did not write. Publishing replaces that branch outright, so it refuses " +
                        "rather than destroy somebody else's site. Choose another branch or another " +
                        "repository.",
                );
            }
            if (repository.private === true) {
                warnings.push(
                    "GitHub Pages on a private repository needs a paid plan (Pro, Team or " +
                        "Enterprise). On a free account, turning Pages on here will be refused.",
                );
            }
            if (repository.private === false) {
                warnings.push(
                    "This repository is public, so the published map - every tile, marker and " +
                        "coordinate in it - can be downloaded by anybody who finds the URL.",
                );
            }
            if (repository.branchExists && repository.branchIsOurs === true) {
                warnings.push(
                    "The publishing branch already carries a map from this application and will be " +
                        "replaced outright. Nothing else in the repository is touched.",
                );
            }
        }

        return {
            renderId: request.renderId,
            webRoot,
            owner: request.owner,
            repo: request.repo,
            branch,
            site,
            siteFailure,
            gh,
            gitVersion,
            repository,
            blockers,
            warnings,
            published: await this.readRecord(request.renderId),
        };
    }

    private async readRepository(
        owner: string,
        repo: string,
        branch: string,
        signal?: AbortSignal,
    ): Promise<PagesRepositoryReport> {
        const runner = this.runner;
        const call = { runner, ...(signal ? { signal } : {}) };
        const fullName = `${owner}/${repo}`;
        try {
            const found = record(await ghJsonOrNull(`repos/${owner}/${repo}`, call));
            if (found === null) {
                return {
                    fullName,
                    exists: false,
                    private: null,
                    canWrite: null,
                    htmlUrl: null,
                    branchExists: false,
                    branchIsOurs: null,
                    branchMarker: null,
                    failure: null,
                };
            }

            const permissions = record(found["permissions"]);
            const branchInfo = await ghJsonOrNull(`repos/${owner}/${repo}/branches/${branch}`, call);
            let marker: PagesMarker | null = null;
            if (branchInfo !== null) {
                const currentMarker = await ghJsonOrNull(
                    `repos/${owner}/${repo}/contents/${PAGES_MARKER_FILE}?ref=${branch}`,
                    call,
                );
                const markerPayload =
                    currentMarker ??
                    (await ghJsonOrNull(
                        `repos/${owner}/${repo}/contents/${LEGACY_PAGES_MARKER_FILE}?ref=${branch}`,
                        call,
                    ));
                marker = readMarker(markerPayload);
            }

            return {
                fullName,
                exists: true,
                private: found["private"] === true,
                canWrite: permissions === null ? null : permissions["push"] === true,
                htmlUrl: text(found["html_url"]),
                branchExists: branchInfo !== null,
                branchIsOurs: branchInfo === null ? null : marker !== null,
                branchMarker: marker,
                failure: null,
            };
        } catch (error) {
            return {
                fullName,
                exists: false,
                private: null,
                canWrite: null,
                htmlUrl: null,
                branchExists: false,
                branchIsOurs: null,
                branchMarker: null,
                failure: sentence(error),
            };
        }
    }

    /* ---------------------------------------------------------------- */
    /* Publishing                                                       */
    /* ---------------------------------------------------------------- */

    activeRenderIds(): string[] {
        return [...this.running.keys()];
    }

    cancel(renderId: string): boolean {
        const controller = this.running.get(renderId);
        if (controller === undefined) return false;
        controller.abort();
        return true;
    }

    /** Continue a publish that left a durable record before the application stopped. */
    async resume(renderId: string): Promise<PagesResult> {
        const saved = await this.readRecord(renderId);
        if (saved === null || saved.stage === "finished") {
            return {
                ok: false,
                failure: {
                    code: "not-resumable",
                    message: "There is no interrupted Pages publish to resume for this render.",
                    detail: null,
                    needsGhSignIn: false,
                },
            };
        }
        return this.publish({
            renderId: saved.renderId,
            owner: saved.owner,
            repo: saved.repo,
            branch: saved.branch,
            acknowledgePublish: true,
        });
    }

    /** Re-read GitHub's Pages status and the published URL for one recorded site. */
    async refreshStatus(renderId: string, signal?: AbortSignal): Promise<PagesRecord | null> {
        const saved = await this.readRecord(renderId);
        if (saved === null) return null;
        const call = { runner: this.runner, ...(signal === undefined ? {} : { signal }) };
        try {
            const site = record(await ghJsonOrNull(`repos/${saved.owner}/${saved.repo}/pages`, call));
            const url = text(site?.["html_url"]) ?? saved.url;
            let status = siteStatus(text(site?.["status"]));
            const probe = this.options.probe ?? defaultProbe;
            const httpStatus = url === null ? null : await probe(url, signal);
            const verified = httpStatus === 200;
            if (verified) status = "live";
            const refreshed: PagesRecord = {
                ...saved,
                url,
                status,
                verified,
                stage: "finished",
                publishedAt: this.stamp(),
            };
            await this.writeRecordValue(refreshed);
            return refreshed;
        } catch (error) {
            throw new PagesRefusal(
                "pages-status-failed",
                `The current Pages status for ${saved.owner}/${saved.repo} could not be read.`,
                sentence(error),
            );
        }
    }

    async publish(request: PagesPublishRequest): Promise<PagesResult> {
        if (this.running.has(request.renderId)) {
            return this.fail(request.renderId, {
                code: "already-running",
                message: "This render is already being published. Wait for it, or stop it first.",
                detail: null,
                needsGhSignIn: false,
            });
        }

        const controller = new AbortController();
        this.running.set(request.renderId, controller);
        const startedAt = this.clock();
        try {
            const report = await this.runPublish(request, controller.signal);
            const durationMs = this.clock().getTime() - startedAt.getTime();
            this.emit({
                type: "finished",
                renderId: request.renderId,
                report,
                durationMs,
                at: this.stamp(),
            });
            return { ok: true, report, durationMs };
        } catch (error) {
            if (error instanceof Cancelled || controller.signal.aborted) {
                this.emit({ type: "cancelled", renderId: request.renderId, at: this.stamp() });
                return {
                    ok: false,
                    failure: {
                        code: "cancelled",
                        message: "Publishing was stopped. Nothing further was pushed.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }
            return this.fail(request.renderId, toFailure(error));
        } finally {
            this.running.delete(request.renderId);
        }
    }

    private async runPublish(
        request: PagesPublishRequest,
        signal: AbortSignal,
    ): Promise<PagesPublishReport> {
        const branch = normaliseBranch(request.branch);
        const owner = request.owner.trim();
        const repo = request.repo.trim();
        const renderId = request.renderId;
        const notes: string[] = [];

        const saved = await this.readRecord(renderId);
        const resumeAfterCommit =
            saved !== null &&
            saved.stage !== "finished" &&
            ["pushing", "enabling", "waiting", "verifying"].includes(saved.stage) &&
            saved.commit !== null;

        if (owner.length === 0 || repo.length === 0 || renderId.length === 0) {
            throw new PagesRefusal("invalid-request", "A render, an owner and a repository name are required.");
        }
        if (request.acknowledgePublish !== true) {
            throw new PagesRefusal(
                "not-acknowledged",
                "Publishing has not been agreed to. The preflight report has to be seen and accepted first.",
            );
        }

        this.emit({ type: "started", renderId, target: `${owner}/${repo}`, at: this.stamp() });

        await this.writeStageRecord({
            renderId,
            owner,
            repo,
            branch,
            stage: resumeAfterCommit ? saved.stage : "preparing",
            url: saved?.url ?? null,
            commit: saved?.commit ?? null,
            status: saved?.status ?? "unknown",
            verified: saved?.verified ?? false,
        });

        const webRoot = renderWorkspace(this.options.storageDir(), renderId).webRoot;

        /* -- prepare ---------------------------------------------------- */
        this.phase(renderId, "preparing");
        const site = await prepareStaticHost({ webRoot, write: true });
        for (const note of site.notes) this.log(renderId, "info", note);
        if (!site.servable) {
            throw new PagesRefusal(
                "not-servable",
                "This map cannot be served as plain files as it stands, so publishing it would " +
                    "produce a site that loads and shows nothing.",
                site.notes.join(" "),
            );
        }
        if (site.oversizedFiles.length > 0) {
            throw new PagesRefusal(
                "file-too-large",
                `${site.oversizedFiles[0]?.path ?? "A file"} is past GitHub's 100 MB per-file limit ` +
                    "and cannot be pushed at all.",
            );
        }
        this.stop(signal);

        await this.writeStageRecord({
            renderId,
            owner,
            repo,
            branch,
            stage: "checking",
            url: saved?.url ?? null,
            commit: saved?.commit ?? null,
            status: saved?.status ?? "unknown",
            verified: saved?.verified ?? false,
        });

        /* -- check the target ------------------------------------------- */
        this.phase(renderId, "checking");
        const gh = await detectGh(this.runner, { signal });
        if (gh.availability !== "ready") {
            throw new PagesRefusal(
                gh.availability === "signed-out" ? "gh-signed-out" : "gh-missing",
                gh.message,
                null,
                gh.availability === "signed-out",
            );
        }

        const gitProbe = await this.runner.run(GIT_COMMAND, ["--version"], { signal });
        if (!gitProbe.started) {
            throw new PagesRefusal(
                "git-missing",
                "git is not on this computer's PATH, and publishing a map is a push.",
            );
        }

        const repository = await this.ensureRepository(owner, repo, request.visibility, signal, notes);
        const guard = await this.readRepository(owner, repo, branch, signal);
        if (guard.branchExists && guard.branchIsOurs !== true) {
            throw new PagesRefusal(
                "not-ours",
                `${owner}/${repo} already has a ${branch} branch that this application did not ` +
                    "write. Publishing replaces that branch outright, so it refuses rather than " +
                    "destroy a site somebody else made.",
            );
        }
        if (guard.branchMarker !== null && guard.branchMarker.renderId !== renderId) {
            notes.push(
                `That branch was carrying the render ${guard.branchMarker.renderId}, which this ` +
                    "publish replaces.",
            );
        }
        this.stop(signal);

        /* -- stage ------------------------------------------------------ */
        // A resumed publish that already made it past this checkpoint has a commit sitting in
        // the working repository already; `files` below is left empty for exactly that reason,
        // so no `git add` is ever going to run. Announcing "staging" here would be reporting a
        // step as running that this call never performs - say plainly that it is being reused.
        if (resumeAfterCommit) {
            const skipped =
                "The map's files were already staged and committed by the interrupted attempt " +
                "this is resuming; nothing was staged again.";
            this.log(renderId, "info", skipped);
            notes.push(skipped);
        } else {
            this.phase(renderId, "staging");
        }
        await writeFile(
            join(webRoot, PAGES_MARKER_FILE),
            `${JSON.stringify(
                {
                    tool: PAGES_MARKER_TOOL,
                    version: PAGES_MARKER_VERSION,
                    renderId,
                    maps: site.maps.map((map) => map.id),
                    publishedAt: this.stamp(),
                } satisfies PagesMarker,
                null,
                2,
            )}\n`,
            "utf8",
        );

        const gitDir = resumeAfterCommit
            ? join(this.options.workRoot(), renderId, ".git")
            : await this.prepareGitDir(renderId, branch, signal);
        const files = resumeAfterCommit ? [] : await walkFiles(webRoot);
        let staged = 0;
        for (let index = 0; index < files.length; index += STAGE_BATCH) {
            this.stop(signal);
            const batch = files.slice(index, index + STAGE_BATCH);
            const result = await this.git(
                webRoot,
                gitDir,
                ["add", "--force", "--pathspec-from-file=-", "--pathspec-file-nul"],
                { signal, input: `${batch.join("\0")}\0` },
            );
            if (result.code !== 0) {
                throw new PagesRefusal("stage-failed", "git could not stage the map's files.", result.stderr);
            }
            staged += batch.length;
            this.emit({
                type: "progress",
                renderId,
                phase: "staging",
                description: "Staging the map's files",
                done: staged,
                total: files.length,
                at: this.stamp(),
            });
        }

        let commit: string;
        if (resumeAfterCommit) {
            commit = saved.commit as string;
        } else {
            const committer = this.options.committer ?? DEFAULT_COMMITTER;
            const commitResult = await this.git(
                webRoot,
                gitDir,
                [
                    "-c",
                    `user.name=${committer.name}`,
                    "-c",
                    `user.email=${committer.email}`,
                    "commit",
                    "--quiet",
                    "-m",
                    `Publish ${renderId} as a static map`,
                ],
                { signal },
            );
            if (commitResult.code !== 0) {
                throw new PagesRefusal(
                    "commit-failed",
                    "git could not record the map as a commit.",
                    commitResult.stderr,
                );
            }

            const headResult = await this.git(webRoot, gitDir, ["rev-parse", "HEAD"], { signal });
            commit = headResult.stdout.trim();
            if (headResult.code !== 0 || commit.length === 0) {
                throw new PagesRefusal("commit-failed", "git made a commit it could not then name.");
            }
        }
        await this.writeStageRecord({
            renderId,
            owner,
            repo,
            branch,
            stage: "pushing",
            url: saved?.url ?? null,
            commit,
            status: saved?.status ?? "unknown",
            verified: saved?.verified ?? false,
        });
        this.stop(signal);

        /* -- push ------------------------------------------------------- */
        // Whether this landed already is only knowable after asking GitHub, so that has to run
        // before deciding what to announce - phase("pushing") means a push is about to happen,
        // and a resume whose commit is already on the branch never makes one.
        const beforePush = record(
            await ghJsonOrNull(`repos/${owner}/${repo}/branches/${branch}`, {
                runner: this.runner,
                signal,
            }),
        );
        const pushAlreadyLanded =
            resumeAfterCommit && text(record(beforePush?.["commit"])?.["sha"]) === commit;
        if (pushAlreadyLanded) {
            const skipped =
                "That commit had already reached GitHub before the interrupted attempt this is " +
                "resuming stopped; nothing was pushed again.";
            this.log(renderId, "info", skipped);
            notes.push(skipped);
        } else {
            this.phase(renderId, "pushing");
            const pushResult = await this.git(
                webRoot,
                gitDir,
                [
                // Exactly what `gh auth setup-git` writes, passed for this one command rather
                // than written into the person's global git config. The empty value first
                // clears any inherited helper, so nothing else on the machine is consulted.
                "-c",
                "credential.helper=",
                "-c",
                `credential.helper=!${GH_COMMAND} auth git-credential`,
                "push",
                "--force",
                `https://github.com/${owner}/${repo}.git`,
                `HEAD:refs/heads/${branch}`,
                ],
                { signal },
            );
            if (pushResult.code !== 0) {
                throw new PagesRefusal(
                    "push-refused",
                    `GitHub refused the push to ${owner}/${repo}.`,
                    pushResult.stderr.trim(),
                );
            }
        }

        // Read back rather than assume. A zero exit from `git push` is good evidence and not
        // proof, and "the map is on GitHub" is exactly the claim nobody can check from here.
        const landed = pushAlreadyLanded
            ? beforePush
            : record(
                  await ghJsonOrNull(`repos/${owner}/${repo}/branches/${branch}`, {
                      runner: this.runner,
                      signal,
                  }),
              );
        const pushVerified = text(record(landed?.["commit"])?.["sha"]) === commit;
        if (!pushVerified) {
            notes.push(
                "The push reported success but GitHub does not yet show that commit on the " +
                    "branch, so it is reported as unverified rather than as landed.",
            );
        }
        await this.writeStageRecord({
            renderId,
            owner,
            repo,
            branch,
            stage: "enabling",
            url: saved?.url ?? null,
            commit,
            status: saved?.status ?? "unknown",
            verified: saved?.verified ?? false,
        });
        this.stop(signal);

        /* -- enable ----------------------------------------------------- */
        this.phase(renderId, "enabling");
        await this.enablePages(owner, repo, branch, signal, notes);
        await this.writeStageRecord({
            renderId,
            owner,
            repo,
            branch,
            stage: "waiting",
            url: saved?.url ?? null,
            commit,
            status: saved?.status ?? "unknown",
            verified: saved?.verified ?? false,
        });
        this.stop(signal);

        /* -- wait ------------------------------------------------------- */
        this.phase(renderId, "waiting");
        const built = await this.waitForBuild(renderId, owner, repo, signal);
        let status: PagesSiteStatus = built.status;
        const url = built.url;

        /* -- verify ----------------------------------------------------- */
        await this.writeStageRecord({
            renderId,
            owner,
            repo,
            branch,
            stage: "verifying",
            url,
            commit,
            status,
            verified: false,
        });
        this.phase(renderId, "verifying");
        let httpStatus: number | null = null;
        let verified = false;
        if (url !== null) {
            const probe = this.options.probe ?? defaultProbe;
            httpStatus = await probe(url, signal);
            verified = httpStatus === 200;
            if (verified) status = "live";
            else {
                notes.push(
                    httpStatus === null
                        ? `The published URL could not be reached from this computer, so it is not ` +
                          "reported as live. A first Pages build often takes a minute or two."
                        : `The published URL answered ${String(httpStatus)} rather than 200, so it ` +
                          "is not reported as live.",
                );
            }
        } else {
            notes.push("GitHub has not published a URL for this site yet.");
        }

        this.phase(renderId, "finished");

        const report: PagesPublishReport = {
            renderId,
            owner,
            repo,
            branch,
            repositoryUrl: repository ?? `https://github.com/${owner}/${repo}`,
            commit,
            pushVerified,
            status,
            url,
            verified,
            httpStatus,
            site,
            notes,
        };
        await this.writeRecord(report);
        return report;
    }

    /* ---------------------------------------------------------------- */
    /* Stop hosting                                                     */
    /* ---------------------------------------------------------------- */

    /**
     * Takes the site down: Pages off, then the publishing branch deleted.
     *
     * The marker is checked **again** here rather than trusted from the preflight. The two
     * happen minutes apart and the interesting failure is somebody typing a different
     * repository name in between, so a branch that cannot be proved to be ours is left
     * exactly where it is.
     */
    async stopHosting(request: PagesTarget, signal?: AbortSignal): Promise<PagesStopResult> {
        const branch = normaliseBranch(request.branch);
        const owner = request.owner.trim();
        const repo = request.repo.trim();
        const notes: string[] = [];
        const call = { runner: this.runner, ...(signal ? { signal } : {}) };

        if (owner.length === 0 || repo.length === 0) {
            return {
                ok: false,
                failure: {
                    code: "invalid-request",
                    message: "An owner and a repository name are required.",
                    detail: null,
                    needsGhSignIn: false,
                },
            };
        }

        try {
            const guard = await this.readRepository(owner, repo, branch, signal);
            if (guard.branchExists && guard.branchIsOurs !== true) {
                return {
                    ok: false,
                    failure: {
                        code: "not-ours",
                        message:
                            `The ${branch} branch of ${owner}/${repo} does not carry this ` +
                            "application's marker, so it is not a map this published and nothing " +
                            "was deleted.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }

            let pagesDisabled = false;
            try {
                await ghApiSend(`repos/${owner}/${repo}/pages`, "DELETE", undefined, call);
                pagesDisabled = true;
            } catch (error) {
                if (error instanceof ActionsCallError && error.status === 404) {
                    notes.push("Pages was already off for this repository.");
                } else {
                    throw error;
                }
            }

            let branchDeleted = false;
            if (guard.branchExists) {
                try {
                    await ghApiSend(
                        `repos/${owner}/${repo}/git/refs/heads/${branch}`,
                        "DELETE",
                        undefined,
                        call,
                    );
                    branchDeleted = true;
                } catch (error) {
                    if (error instanceof ActionsCallError && error.status === 404) {
                        notes.push("The publishing branch was already gone.");
                    } else {
                        throw error;
                    }
                }
            } else {
                notes.push("There was no publishing branch to delete.");
            }

            await rm(join(this.options.workRoot(), request.renderId, "publish.json"), {
                force: true,
            });

            return {
                ok: true,
                report: { owner, repo, branch, pagesDisabled, branchDeleted, notes },
            };
        } catch (error) {
            return { ok: false, failure: toFailure(error) };
        }
    }

    /* ---------------------------------------------------------------- */
    /* The pieces                                                       */
    /* ---------------------------------------------------------------- */

    /** The repository's URL, creating it first when it does not exist. */
    private async ensureRepository(
        owner: string,
        repo: string,
        visibility: "public" | "private" | undefined,
        signal: AbortSignal,
        notes: string[],
    ): Promise<string | null> {
        const call = { runner: this.runner, signal };
        const found = record(await ghJsonOrNull(`repos/${owner}/${repo}`, call));
        if (found !== null) return text(found["html_url"]);

        const wanted = visibility ?? "public";
        const result = await this.runner.run(
            GH_COMMAND,
            [
                "repo",
                "create",
                `${owner}/${repo}`,
                wanted === "private" ? "--private" : "--public",
                "--description",
                "A BlueMap map published by Worldlens",
            ],
            { signal },
        );
        if (!result.started || result.code !== 0) {
            throw new PagesRefusal(
                "repo-refused",
                `${owner}/${repo} does not exist and could not be created.`,
                result.stderr.trim(),
            );
        }
        notes.push(`Created ${owner}/${repo} as a ${wanted} repository.`);
        if (wanted === "private") {
            notes.push(
                "GitHub Pages on a private repository needs a paid plan. On a free account, " +
                    "turning Pages on will be refused.",
            );
        }
        return `https://github.com/${owner}/${repo}`;
    }

    /**
     * A git directory for this render, with HEAD pointed at an unborn publishing branch.
     *
     * Unborn is the whole point: committing onto a branch with no commits produces a root
     * commit, which is the orphan the branch is then force-pushed as. Deleting the index is
     * what makes it a clean one rather than an addition to whatever was staged last time.
     */
    private async prepareGitDir(renderId: string, branch: string, signal: AbortSignal): Promise<string> {
        const workDir = join(this.options.workRoot(), renderId);
        const gitDir = join(workDir, ".git");
        await mkdir(workDir, { recursive: true });

        if (!(await exists(join(gitDir, "HEAD")))) {
            const init = await this.runner.run(GIT_COMMAND, ["-C", workDir, "init", "--quiet"], {
                signal,
            });
            if (!init.started || init.code !== 0) {
                throw new PagesRefusal(
                    "git-init-failed",
                    "git could not create the working repository this publish stages into.",
                    init.stderr,
                );
            }
        }

        // Both are allowed to fail: a branch that does not exist cannot be deleted, and an
        // index that was never written cannot be removed. Neither is a problem for a run that
        // is about to build both from nothing.
        await this.runner.run(
            GIT_COMMAND,
            ["--git-dir", gitDir, "update-ref", "-d", `refs/heads/${branch}`],
            { signal },
        );
        await rm(join(gitDir, "index"), { force: true });

        const head = await this.runner.run(
            GIT_COMMAND,
            ["--git-dir", gitDir, "symbolic-ref", "HEAD", `refs/heads/${branch}`],
            { signal },
        );
        if (!head.started || head.code !== 0) {
            throw new PagesRefusal(
                "git-init-failed",
                "git could not point the working repository at the publishing branch.",
                head.stderr,
            );
        }
        return gitDir;
    }

    private git(
        webRoot: string,
        gitDir: string,
        args: readonly string[],
        options: { readonly signal: AbortSignal; readonly input?: string },
    ): ReturnType<ProcessRunner["run"]> {
        return this.runner.run(
            GIT_COMMAND,
            ["-C", webRoot, "--git-dir", gitDir, "--work-tree", webRoot, ...args],
            {
                signal: options.signal,
                ...(options.input === undefined ? {} : { input: options.input }),
            },
        );
    }

    /** Turns Pages on, or points an existing site at this branch. */
    private async enablePages(
        owner: string,
        repo: string,
        branch: string,
        signal: AbortSignal,
        notes: string[],
    ): Promise<void> {
        const call = { runner: this.runner, signal };
        const source = { source: { branch, path: "/" } };
        const existing = record(await ghJsonOrNull(`repos/${owner}/${repo}/pages`, call));

        try {
            if (existing === null) {
                await ghApiSend(`repos/${owner}/${repo}/pages`, "POST", source, call);
                notes.push(`Turned GitHub Pages on for ${owner}/${repo}, serving ${branch}.`);
                return;
            }
            const current = record(existing["source"]);
            if (text(current?.["branch"]) === branch && text(current?.["path"]) === "/") {
                notes.push("Pages was already serving that branch, so nothing was changed.");
                return;
            }
            await ghApiSend(`repos/${owner}/${repo}/pages`, "PUT", source, call);
            notes.push(`Pointed the existing Pages site at ${branch}.`);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            const status = error instanceof ActionsCallError ? error.status : 0;
            throw new PagesRefusal(
                "pages-refused",
                status === 403 || status === 422
                    ? `GitHub refused to turn Pages on for ${owner}/${repo}. On a free plan this is ` +
                      "what a private repository answers; Pages there needs Pro, Team or Enterprise."
                    : `GitHub refused to turn Pages on for ${owner}/${repo}.`,
                detail,
            );
        }
    }

    /** Polls until GitHub says the site is built, or until the attempts run out. */
    private async waitForBuild(
        renderId: string,
        owner: string,
        repo: string,
        signal: AbortSignal,
    ): Promise<{ status: PagesSiteStatus; url: string | null }> {
        const attempts = this.options.pollAttempts ?? DEFAULT_POLL_ATTEMPTS;
        const interval = this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        const sleep = this.options.sleep ?? defaultSleep;
        const call = { runner: this.runner, signal };

        let status: PagesSiteStatus = "unknown";
        let url: string | null = null;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            this.stop(signal);
            const site = record(await ghJsonOrNull(`repos/${owner}/${repo}/pages`, call));
            url = text(site?.["html_url"]) ?? url;
            status = siteStatus(text(site?.["status"]));

            this.emit({
                type: "progress",
                renderId,
                phase: "waiting",
                description: `GitHub is building the site (${status})`,
                done: attempt,
                total: attempts,
                at: this.stamp(),
            });

            if (status === "built") return { status, url };
            if (status === "errored") {
                throw new PagesRefusal(
                    "pages-build-failed",
                    `GitHub's Pages build for ${owner}/${repo} failed. The repository's Pages ` +
                        "settings page carries the reason.",
                );
            }
            if (attempt < attempts) await sleep(interval, signal);
        }
        return { status, url };
    }

    private async writeRecord(report: PagesPublishReport): Promise<void> {
        await this.writeRecordValue({
            version: 1,
            renderId: report.renderId,
            owner: report.owner,
            repo: report.repo,
            branch: report.branch,
            stage: "finished",
            url: report.url,
            commit: report.commit,
            status: report.status,
            verified: report.verified,
            publishedAt: this.stamp(),
        });
    }

    private async writeRecordValue(value: PagesRecord): Promise<void> {
        const workDir = join(this.options.workRoot(), value.renderId);
        await mkdir(workDir, { recursive: true });
        await writeFile(join(workDir, "publish.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
    }

    /** Persist a stage before entering it; a crash after this point is discoverable and resumable. */
    private async writeStageRecord(input: {
        readonly renderId: string;
        readonly owner: string;
        readonly repo: string;
        readonly branch: string;
        readonly stage: PagesPublishStage;
        readonly url: string | null;
        readonly commit: string | null;
        readonly status: PagesSiteStatus;
        readonly verified: boolean;
    }): Promise<void> {
        try {
            await this.writeRecordValue({
                version: 1,
                renderId: input.renderId,
                owner: input.owner,
                repo: input.repo,
                branch: input.branch,
                stage: input.stage,
                url: input.url,
                commit: input.commit,
                status: input.status,
                verified: input.verified,
                publishedAt: this.stamp(),
            });
        } catch (error) {
            // A history write must not make the actual publish fail; the event stream still
            // reports the operation and the next attempt can write a fresh boundary.
            this.log(input.renderId, "warning", `Could not save the Pages resume marker: ${sentence(error)}`);
        }
    }

    /* ---------------------------------------------------------------- */
    /* Plumbing                                                         */
    /* ---------------------------------------------------------------- */

    private clock(): Date {
        return this.options.now?.() ?? new Date();
    }

    private stamp(): string {
        return this.clock().toISOString();
    }

    private emit(event: PagesEvent): void {
        this.options.onEvent?.(event);
    }

    private phase(renderId: string, phase: PagesPhase): void {
        this.emit({ type: "phase", renderId, phase, at: this.stamp() });
    }

    private log(renderId: string, level: "info" | "warning" | "error", message: string): void {
        this.emit({ type: "log", renderId, level, message, at: this.stamp() });
    }

    private stop(signal: AbortSignal): void {
        if (signal.aborted) throw new Cancelled();
    }

    private fail(renderId: string, failure: PagesFailure): PagesResult {
        this.emit({ type: "failed", renderId, failure, at: this.stamp() });
        return { ok: false, failure };
    }
}

/* -------------------------------------------------------------------------- */
/* Failures                                                                   */
/* -------------------------------------------------------------------------- */

export class PagesRefusal extends Error {
    readonly code: string;
    readonly detail: string | null;
    readonly needsGhSignIn: boolean;

    constructor(code: string, message: string, detail: string | null = null, needsGhSignIn = false) {
        super(message);
        this.name = "PagesRefusal";
        this.code = code;
        this.detail = detail;
        this.needsGhSignIn = needsGhSignIn;
    }
}

function toFailure(error: unknown): PagesFailure {
    if (error instanceof PagesRefusal) {
        return {
            code: error.code,
            message: error.message,
            detail: error.detail,
            needsGhSignIn: error.needsGhSignIn,
        };
    }
    if (error instanceof ActionsCallError) {
        return {
            code: `http-${String(error.status)}`,
            message: error.message,
            detail: error.url,
            needsGhSignIn: error.status === 401,
        };
    }
    if (error instanceof StaticHostError) {
        return {
            code: "not-servable",
            message: error.message,
            detail: error.detail.join(" "),
            needsGhSignIn: false,
        };
    }
    return { code: "failed", message: sentence(error), detail: null, needsGhSignIn: false };
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A branch name that cannot become part of a URL path or a ref it was not meant to be.
 *
 * Everything here goes into `gh api repos/o/r/branches/<branch>` as a path segment and into
 * `HEAD:refs/heads/<branch>` as a ref, so a name carrying `..`, a slash or a space is not a
 * branch name this will use. It falls back rather than throwing, because the caller that gets
 * this wrong is a renderer sending an empty string.
 */
export function normaliseBranch(value: string | undefined): string {
    const trimmed = (value ?? "").trim();
    if (trimmed.length === 0) return DEFAULT_PAGES_BRANCH;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(trimmed)) return DEFAULT_PAGES_BRANCH;
    if (trimmed.includes("..")) return DEFAULT_PAGES_BRANCH;
    return trimmed;
}

function siteStatus(value: string | null): PagesSiteStatus {
    switch (value) {
        case "built":
            return "built";
        case "building":
            return "building";
        case "queued":
            return "queued";
        case "errored":
            return "errored";
        default:
            return "unknown";
    }
}

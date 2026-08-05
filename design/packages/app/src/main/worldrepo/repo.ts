/**
 * Keeping a Minecraft world in a git repository, so a render never has to re-zip it.
 *
 * ## The fact this whole feature rests on
 *
 * git deduplicates by content hash. A world is thousands of `.mca` region files; when a
 * world changes, only a handful of them do, and git only ever transfers the objects the
 * remote does not already have. Kept in a repository, a world updates the way the rest of
 * this project already does its own releases: incrementally, with nothing re-uploaded that
 * has not changed.
 *
 * ## Why this reuses the Pages publisher's shape, almost move for move
 *
 * `pages/hosting.ts` solved the identical structural problem for a rendered map: a git
 * directory kept outside the payload, a marker file that proves ownership before a branch
 * is ever touched, batched staging so a person watching thousands of files sees a number
 * move, a push read back from GitHub rather than assumed, and a durable stage record so an
 * interrupted publish can resume. Every one of those is reused here unchanged in spirit.
 *
 * What is different, and worth stating precisely, is *why an orphan commit is still the
 * right choice for a world and not merely a copy of the map's design*:
 *
 * - **The remote never grows.** Every sync force-replaces the branch with one commit, so a
 *   world synced daily for a year is one commit, not 365 - which is exactly "the trap this
 *   project already solved once" the whole feature exists to avoid.
 * - **The push still only sends what changed.** git's push negotiation excludes every
 *   object reachable from a ref the remote currently advertises, *independent of whether
 *   the new commit is a child of the old one*. The client only needs to still know those
 *   old objects locally - which it does, because {@link WorldRepoHost} keeps the same git
 *   directory (and so the same object database) across every sync of the same target,
 *   exactly the way `pages/hosting.ts` keeps the same one across every publish of the same
 *   render. Deleting only the branch ref and the index before each sync (never the object
 *   database) is what makes an "orphan" commit still cost only the bytes that changed.
 * - **The one gap that design leaves** is a local git directory that was never populated
 *   with the remote's current state - a first sync against a repository something else
 *   already wrote to, or this computer's own copy having been lost. {@link WorldRepoHost}
 *   closes it with one addition `pages/hosting.ts` does not need: before resetting the
 *   branch, it fetches the remote branch's objects into the local database (best-effort; a
 *   failure here costs one sync's worth of bandwidth, never correctness) so the exclusion
 *   above has something to exclude against even on a machine that has never synced this
 *   target before.
 *
 * ## The marker, again
 *
 * `WORLD_REPO_MARKER_FILE` plays the same role `PAGES_MARKER_FILE` does: a branch that does
 * not carry it is never replaced and never deleted. It has to live inside the world folder
 * itself, because it has to be part of the pushed tree for the guard to read it back off
 * GitHub - the same reason `pages/hosting.ts` writes its marker into the render's own
 * output rather than beside it.
 *
 * ## Honesty this module owes the person publishing
 *
 * A live Minecraft server's world folder is being written to while a sync reads it, and a
 * region file mid-save can be caught torn - {@link WorldRepoHost.preflight} says so. GitHub
 * blocks any single file over 100 MB outright and recommends repositories stay under
 * roughly a gigabyte; both are checked and reported rather than discovered from a rejected
 * push. A push GitHub refuses - a branch protection rule, a size limit, an expired sign-in
 * - is reported with GitHub's own words, never guessed at.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findWorldDirectories } from "@material-bluemap/render-actions";
import { ActionsCallError } from "../cirender/actions.js";
import { GH_COMMAND, detectGh, ghApiJson, ghApiSend, nodeProcessRunner } from "../cirender/gh.js";
import type { GhStatus, ProcessRunner } from "../cirender/gh.js";
import { GIT_COMMAND } from "../pages/hosting.js";

/** Where a world lands when nobody says otherwise. */
export const DEFAULT_WORLD_BRANCH = "world";

/** The file that says a branch belongs to this application, and to which sync target. */
export const WORLD_REPO_MARKER_FILE = ".material-bluemap-world.json";

/** Bumped only if the marker's shape changes. An unknown version is still *ours*. */
export const WORLD_REPO_MARKER_VERSION = 1;

/** The value of the marker's `tool` field. Nothing else is accepted as ours. */
export const WORLD_REPO_MARKER_TOOL = "material-bluemap";

/** How many paths are handed to one `git add`. Same number, same reason, as `pages/hosting.ts`. */
export const STAGE_BATCH = 2_000;

/** GitHub's hard per-file push limit. A file past this cannot be pushed at all. */
export const GITHUB_FILE_LIMIT_BYTES = 100 * 1024 * 1024;

/** GitHub's own published guidance: repositories much past this get slow to work with. */
export const REPO_SOFT_LIMIT_BYTES = 1 * 1024 * 1024 * 1024;

/** Past this, publishing a world as a repository is very likely the wrong tool. */
export const REPO_HEAVY_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* What crosses                                                               */
/* -------------------------------------------------------------------------- */

export interface WorldRepoMarker {
    readonly tool: string;
    readonly version: number;
    readonly branch: string;
    readonly updatedAt: string;
}

export interface WorldRepoOwner {
    readonly login: string;
    readonly kind: "user" | "organization";
}

export type WorldRepoPhase =
    | "preparing"
    | "checking"
    | "staging"
    | "committing"
    | "pushing"
    | "verifying"
    | "finished";

export interface WorldRepoFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    /** True when running `gh auth login` in a terminal is what would fix it. */
    readonly needsGhSignIn: boolean;
}

export interface WorldRepoTarget {
    /** Absolute path to the world folder on disk. Never copied; the git work-tree itself. */
    readonly worldPath: string;
    readonly owner: string;
    readonly repo: string;
    /** Defaults to {@link DEFAULT_WORLD_BRANCH}. */
    readonly branch?: string;
}

export interface WorldRepoSyncRequest extends WorldRepoTarget {
    readonly visibility?: "public" | "private";
    /** Set by the surface once the person has seen the preflight. Refused without it. */
    readonly acknowledgeSync?: boolean;
}

export interface WorldRepoReport {
    readonly fileCount: number;
    readonly bytes: number;
    readonly oversizedFiles: readonly { readonly path: string; readonly bytes: number }[];
    /** False when nothing under the folder looked like a Minecraft world (a `level.dat`). */
    readonly looksLikeWorld: boolean;
    readonly overSoftLimit: boolean;
    readonly overHeavyLimit: boolean;
}

export interface WorldRepoRepositoryReport {
    readonly fullName: string;
    readonly exists: boolean;
    readonly private: boolean | null;
    readonly canWrite: boolean | null;
    readonly htmlUrl: string | null;
    readonly branchExists: boolean;
    readonly branchIsOurs: boolean | null;
    readonly branchMarker: WorldRepoMarker | null;
    /** The branch's current commit, when it has one. The cheap change check other lanes want. */
    readonly branchSha: string | null;
    readonly failure: string | null;
}

export interface WorldRepoPreflight {
    readonly worldPath: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly world: WorldRepoReport | null;
    readonly worldFailure: string | null;
    readonly gh: GhStatus;
    readonly gitVersion: string | null;
    readonly repository: WorldRepoRepositoryReport | null;
    /** Anything that would stop a sync. Non-empty means the button must not be pressed. */
    readonly blockers: readonly string[];
    /** True, expensive or surprising, but not a refusal. */
    readonly warnings: readonly string[];
    readonly published: WorldRepoRecord | null;
}

export type WorldRepoSyncStage = WorldRepoPhase | "finished";

/** What this computer remembers about a world it synced. */
export interface WorldRepoRecord {
    readonly version: number;
    readonly worldPath: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly stage: WorldRepoSyncStage;
    readonly commit: string | null;
    readonly pushVerified: boolean;
    readonly bytes: number;
    readonly fileCount: number;
    readonly syncedAt: string;
}

export interface WorldRepoSyncReport {
    readonly worldPath: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly repositoryUrl: string;
    /** The commit that was pushed, read back from git rather than assumed. */
    readonly commit: string;
    /** True only once GitHub reported that branch's head as this commit. */
    readonly pushVerified: boolean;
    readonly bytes: number;
    readonly fileCount: number;
    readonly notes: readonly string[];
}

export type WorldRepoSyncResult =
    | { readonly ok: true; readonly report: WorldRepoSyncReport; readonly durationMs: number }
    | { readonly ok: false; readonly failure: WorldRepoFailure };

export interface WorldRepoRemoveReport {
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly branchDeleted: boolean;
    readonly notes: readonly string[];
}

export type WorldRepoRemoveResult =
    | { readonly ok: true; readonly report: WorldRepoRemoveReport }
    | { readonly ok: false; readonly failure: WorldRepoFailure };

export type WorldRepoEvent =
    | { readonly type: "started"; readonly key: string; readonly target: string; readonly at: string }
    | { readonly type: "phase"; readonly key: string; readonly phase: WorldRepoPhase; readonly at: string }
    | {
          readonly type: "progress";
          readonly key: string;
          readonly phase: WorldRepoPhase;
          readonly description: string;
          readonly done: number;
          readonly total: number;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly key: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly key: string;
          readonly report: WorldRepoSyncReport;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly key: string; readonly failure: WorldRepoFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly key: string; readonly at: string };

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

export interface WorldRepoHostOptions {
    /**
     * Where the git directories live. **Never inside a world, and never inside a render.**
     * The application passes a folder under its own data directory, exactly like
     * `pages/hosting.ts`'s `workRoot`.
     */
    readonly workRoot: () => string;
    /** How `git` and `gh` are run. Left out, real child processes; injected in every test. */
    readonly runner?: ProcessRunner | undefined;
    readonly onEvent?: ((event: WorldRepoEvent) => void) | undefined;
    readonly now?: (() => Date) | undefined;
    /** The name on the generated commit. Never a person's git identity, which is not ours. */
    readonly committer?: { readonly name: string; readonly email: string } | undefined;
    /**
     * Where a `push` and a `fetch` go. Overridable so a test can push to a local bare
     * repository instead of `https://github.com/<owner>/<repo>.git`.
     */
    readonly remoteUrl?: ((owner: string, repo: string) => string) | undefined;
}

const DEFAULT_COMMITTER = {
    name: "Material BlueMap",
    email: "material-bluemap@users.noreply.github.com",
} as const;

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const text = String(error);
    return text.length > 0 ? text : "The world could not be synced, and nothing said why.";
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

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
 * Same rule `pages/hosting.ts`'s `readMarker` follows: "there is no marker" and "there is a
 * file there that is not one" lead to the same refusal, so both return null.
 */
export function readWorldMarker(payload: unknown): WorldRepoMarker | null {
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
    if (source["tool"] !== WORLD_REPO_MARKER_TOOL) return null;

    const branch = text(source["branch"]);
    const updatedAt = text(source["updatedAt"]);
    const version = typeof source["version"] === "number" ? source["version"] : 0;

    return {
        tool: WORLD_REPO_MARKER_TOOL,
        version,
        branch: branch ?? "",
        updatedAt: updatedAt ?? "",
    };
}

/** Every file under a directory, as forward-slashed paths relative to it. `.git` is skipped. */
async function walkFiles(root: string, relative = ""): Promise<string[]> {
    const found: string[] = [];
    const entries = await readdir(join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
        if (relative === "" && entry.name === ".git") continue;
        const next = relative === "" ? entry.name : `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
            found.push(...(await walkFiles(root, next)));
            continue;
        }
        if (entry.isFile()) found.push(next);
    }
    return found;
}

/**
 * A branch name that cannot become part of a URL path or a ref it was not meant to be.
 *
 * The same grammar `pages/hosting.ts`'s `normaliseBranch` checks against, kept as its own
 * small copy here rather than imported: that function's fallback is hard-coded to
 * `gh-pages`, which is exactly wrong for a world - it would silently start naming and
 * looking up the wrong branch the moment nobody typed one.
 */
export function normaliseBranch(value: string | undefined): string {
    const trimmed = (value ?? "").trim();
    if (trimmed.length === 0) return DEFAULT_WORLD_BRANCH;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(trimmed)) return DEFAULT_WORLD_BRANCH;
    if (trimmed.includes("..")) return DEFAULT_WORLD_BRANCH;
    return trimmed;
}

/** A stable, filesystem-safe folder name for one sync target's own git directory. */
export function targetKey(owner: string, repo: string, branch: string): string {
    const safe = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, "_");
    return `${safe(owner)}__${safe(repo)}__${safe(branch)}`;
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

export class WorldRepoHost {
    private readonly options: WorldRepoHostOptions;
    private readonly runner: ProcessRunner;
    private readonly running = new Map<string, AbortController>();

    constructor(options: WorldRepoHostOptions) {
        this.options = options;
        this.runner = options.runner ?? nodeProcessRunner();
    }

    /* ---------------------------------------------------------------- */
    /* Reading                                                          */
    /* ---------------------------------------------------------------- */

    /** Accounts this `gh` sign-in can create a repository under: the person, and their orgs. */
    async owners(signal?: AbortSignal): Promise<WorldRepoOwner[]> {
        const runner = this.runner;
        const owners: WorldRepoOwner[] = [];
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

    /**
     * The cheap change check other lanes should reach for before downloading anything.
     *
     * One `gh api` call for the branch's current commit SHA - nothing is cloned, nothing is
     * downloaded. A scheduled render can compare this against the SHA it rendered last time
     * and skip the whole run when they match.
     */
    async remoteTip(
        owner: string,
        repo: string,
        branch?: string,
        signal?: AbortSignal,
    ): Promise<{ readonly exists: boolean; readonly sha: string | null }> {
        const call = { runner: this.runner, ...(signal ? { signal } : {}) };
        const info = record(
            await ghJsonOrNull(`repos/${owner}/${repo}/branches/${normaliseBranch(branch)}`, call),
        );
        if (info === null) return { exists: false, sha: null };
        return { exists: true, sha: text(record(info["commit"])?.["sha"]) };
    }

    /** What this computer remembers syncing, newest first. */
    async records(): Promise<WorldRepoRecord[]> {
        const root = this.options.workRoot();
        const found: WorldRepoRecord[] = [];
        let names: string[];
        try {
            names = (await readdir(root, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name);
        } catch {
            return [];
        }
        for (const name of names) {
            const value = await this.readRecordByKey(name);
            if (value !== null) found.push(value);
        }
        return found.sort((left, right) => right.syncedAt.localeCompare(left.syncedAt));
    }

    async readRecord(target: WorldRepoTarget): Promise<WorldRepoRecord | null> {
        return this.readRecordByKey(targetKey(target.owner, target.repo, normaliseBranch(target.branch)));
    }

    private async readRecordByKey(key: string): Promise<WorldRepoRecord | null> {
        try {
            const parsed: unknown = JSON.parse(
                await readFile(join(this.options.workRoot(), key, "sync.json"), "utf8"),
            );
            const row = record(parsed);
            const owner = text(row?.["owner"]);
            const repo = text(row?.["repo"]);
            const worldPath = text(row?.["worldPath"]);
            if (row === null || owner === null || repo === null || worldPath === null) return null;
            return {
                version: typeof row["version"] === "number" ? row["version"] : 1,
                worldPath,
                owner,
                repo,
                branch: text(row["branch"]) ?? DEFAULT_WORLD_BRANCH,
                stage: (text(row["stage"]) ?? "finished") as WorldRepoSyncStage,
                commit: text(row["commit"]),
                pushVerified: row["pushVerified"] === true,
                bytes: typeof row["bytes"] === "number" ? row["bytes"] : 0,
                fileCount: typeof row["fileCount"] === "number" ? row["fileCount"] : 0,
                syncedAt: text(row["syncedAt"]) ?? "",
            };
        } catch {
            return null;
        }
    }

    /* ---------------------------------------------------------------- */
    /* Preflight                                                        */
    /* ---------------------------------------------------------------- */

    async preflight(request: WorldRepoTarget, signal?: AbortSignal): Promise<WorldRepoPreflight> {
        const branch = normaliseBranch(request.branch);
        const blockers: string[] = [];
        const warnings: string[] = [];

        let world: WorldRepoReport | null = null;
        let worldFailure: string | null = null;
        try {
            world = await this.worldStats(request.worldPath);
        } catch (error) {
            worldFailure = sentence(error);
            blockers.push(worldFailure);
        }

        if (world !== null) {
            if (!world.looksLikeWorld) {
                warnings.push(
                    "No level.dat was found under this folder, so it may not be a Minecraft world " +
                        "save. It will still be synced exactly as it is.",
                );
            }
            for (const file of world.oversizedFiles) {
                blockers.push(
                    `${file.path} is ${String(file.bytes)} bytes, past GitHub's 100 MB per-file limit. ` +
                        "It cannot be pushed at all, so this world cannot be kept in a repository as it stands.",
                );
            }
            if (world.overHeavyLimit) {
                warnings.push(
                    "This world is several gigabytes. GitHub repositories that large are slow to " +
                        "clone and work with, and a git repository may not be the right place for a " +
                        "world this size at all - the release-asset route this application also " +
                        "offers has no such limit.",
                );
            } else if (world.overSoftLimit) {
                warnings.push(
                    "This world is over the 1 GB GitHub asks repositories to stay under. It can still " +
                        "be pushed, but clones and future syncs will be slower than a smaller world's.",
                );
            }
            if (world.fileCount > 20_000) {
                warnings.push(
                    `${String(world.fileCount)} files will be staged. Tens of thousands of small ` +
                        "files take a while to add and commit whatever the total size says.",
                );
            }
            warnings.push(
                "If a Minecraft server is running against this folder while it syncs, a region file " +
                    "being saved at that moment can be captured mid-write. Turning the server's " +
                    "auto-save off first, or syncing between server stops, avoids that.",
            );
        }

        const gh = await detectGh(this.runner, signal === undefined ? {} : { signal });
        if (gh.availability === "not-installed") blockers.push(gh.message);
        if (gh.availability === "signed-out") blockers.push(gh.message);

        const gitProbe = await this.runner.run(GIT_COMMAND, ["--version"], signal ? { signal } : {});
        const gitVersion = gitProbe.started && gitProbe.code === 0 ? gitProbe.stdout.trim() : null;
        if (!gitProbe.started) {
            blockers.push(
                "git is not on this computer's PATH, and keeping a world in a repository is a push. " +
                    "Install it from git-scm.com and check again.",
            );
        }

        let repository: WorldRepoRepositoryReport | null = null;
        if (gh.availability === "ready" && request.owner.length > 0 && request.repo.length > 0) {
            repository = await this.readRepository(request.owner, request.repo, branch, signal);
            if (repository.failure !== null) warnings.push(repository.failure);
            if (repository.exists && repository.canWrite === false) {
                blockers.push(
                    `${repository.fullName} exists and this account cannot write to it, so this ` +
                        "world cannot be kept there.",
                );
            }
            if (repository.branchExists && repository.branchIsOurs === false) {
                blockers.push(
                    `${repository.fullName} already has a ${branch} branch that this application did ` +
                        "not write. Syncing replaces that branch outright, so it refuses rather than " +
                        "destroy something else. Choose another branch or another repository.",
                );
            }
            if (repository.private === false) {
                warnings.push(
                    "This repository is public, so every block, chest and coordinate in this world " +
                        "can be downloaded by anybody who finds it.",
                );
            }
            if (repository.branchExists && repository.branchIsOurs === true) {
                warnings.push(
                    "The target branch already carries a world from this application and will be " +
                        "replaced outright with this one. Nothing else in the repository is touched.",
                );
            }
        }

        return {
            worldPath: request.worldPath,
            owner: request.owner,
            repo: request.repo,
            branch,
            world,
            worldFailure,
            gh,
            gitVersion,
            repository,
            blockers,
            warnings,
            published: await this.readRecord(request),
        };
    }

    private async worldStats(worldPath: string): Promise<WorldRepoReport> {
        const info = await stat(worldPath).catch(() => null);
        if (info === null || !info.isDirectory()) {
            throw new WorldRepoRefusal(
                "world-missing",
                `${worldPath} is not a folder on this computer, so there is nothing to sync.`,
            );
        }
        const worlds = await findWorldDirectories(worldPath);
        const files = await walkFiles(worldPath);
        let bytes = 0;
        const oversizedFiles: { path: string; bytes: number }[] = [];
        for (const file of files) {
            const size = (await stat(join(worldPath, file)).catch(() => null))?.size ?? 0;
            bytes += size;
            if (size > GITHUB_FILE_LIMIT_BYTES) oversizedFiles.push({ path: file, bytes: size });
        }
        return {
            fileCount: files.length,
            bytes,
            oversizedFiles,
            looksLikeWorld: worlds.length > 0,
            overSoftLimit: bytes > REPO_SOFT_LIMIT_BYTES,
            overHeavyLimit: bytes > REPO_HEAVY_LIMIT_BYTES,
        };
    }

    private async readRepository(
        owner: string,
        repo: string,
        branch: string,
        signal?: AbortSignal,
    ): Promise<WorldRepoRepositoryReport> {
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
                    branchSha: null,
                    failure: null,
                };
            }

            const permissions = record(found["permissions"]);
            const branchInfo = record(await ghJsonOrNull(`repos/${owner}/${repo}/branches/${branch}`, call));
            let marker: WorldRepoMarker | null = null;
            if (branchInfo !== null) {
                marker = readWorldMarker(
                    await ghJsonOrNull(
                        `repos/${owner}/${repo}/contents/${WORLD_REPO_MARKER_FILE}?ref=${branch}`,
                        call,
                    ),
                );
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
                branchSha: branchInfo === null ? null : text(record(branchInfo["commit"])?.["sha"]),
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
                branchSha: null,
                failure: sentence(error),
            };
        }
    }

    /* ---------------------------------------------------------------- */
    /* Syncing                                                          */
    /* ---------------------------------------------------------------- */

    activeKeys(): string[] {
        return [...this.running.keys()];
    }

    cancel(key: string): boolean {
        const controller = this.running.get(key);
        if (controller === undefined) return false;
        controller.abort();
        return true;
    }

    async resume(target: WorldRepoTarget): Promise<WorldRepoSyncResult> {
        const saved = await this.readRecord(target);
        if (saved === null || saved.stage === "finished") {
            return {
                ok: false,
                failure: {
                    code: "not-resumable",
                    message: "There is no interrupted world sync to resume for this target.",
                    detail: null,
                    needsGhSignIn: false,
                },
            };
        }
        return this.sync({
            worldPath: saved.worldPath,
            owner: saved.owner,
            repo: saved.repo,
            branch: saved.branch,
            acknowledgeSync: true,
        });
    }

    async sync(request: WorldRepoSyncRequest): Promise<WorldRepoSyncResult> {
        const key = targetKey(request.owner, request.repo, normaliseBranch(request.branch));
        if (this.running.has(key)) {
            return this.fail(key, {
                code: "already-running",
                message: "This world is already being synced. Wait for it, or stop it first.",
                detail: null,
                needsGhSignIn: false,
            });
        }

        const controller = new AbortController();
        this.running.set(key, controller);
        const startedAt = this.clock();
        try {
            const report = await this.runSync(request, key, controller.signal);
            const durationMs = this.clock().getTime() - startedAt.getTime();
            this.emit({ type: "finished", key, report, durationMs, at: this.stamp() });
            return { ok: true, report, durationMs };
        } catch (error) {
            if (error instanceof Cancelled || controller.signal.aborted) {
                this.emit({ type: "cancelled", key, at: this.stamp() });
                return {
                    ok: false,
                    failure: {
                        code: "cancelled",
                        message: "Syncing was stopped. Nothing further was pushed.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }
            return this.fail(key, toFailure(error));
        } finally {
            this.running.delete(key);
        }
    }

    private async runSync(
        request: WorldRepoSyncRequest,
        key: string,
        signal: AbortSignal,
    ): Promise<WorldRepoSyncReport> {
        const branch = normaliseBranch(request.branch);
        const owner = request.owner.trim();
        const repo = request.repo.trim();
        const worldPath = request.worldPath;
        const notes: string[] = [];

        if (owner.length === 0 || repo.length === 0 || worldPath.length === 0) {
            throw new WorldRepoRefusal("invalid-request", "A world folder, an owner and a repository name are required.");
        }
        if (request.acknowledgeSync !== true) {
            throw new WorldRepoRefusal(
                "not-acknowledged",
                "Syncing has not been agreed to. The preflight report has to be seen and accepted first.",
            );
        }

        this.emit({ type: "started", key, target: `${owner}/${repo}#${branch}`, at: this.stamp() });
        await this.writeStageRecord(key, {
            worldPath,
            owner,
            repo,
            branch,
            stage: "preparing",
            commit: null,
            pushVerified: false,
            bytes: 0,
            fileCount: 0,
        });

        /* -- prepare ------------------------------------------------------ */
        this.phase(key, "preparing");
        const world = await this.worldStats(worldPath);
        if (world.oversizedFiles.length > 0) {
            const first = world.oversizedFiles[0];
            throw new WorldRepoRefusal(
                "file-too-large",
                `${first?.path ?? "A file"} is past GitHub's 100 MB per-file limit and cannot be ` +
                    "pushed at all.",
            );
        }
        this.stop(signal);

        /* -- check the target ---------------------------------------------- */
        this.phase(key, "checking");
        const gh = await detectGh(this.runner, { signal });
        if (gh.availability !== "ready") {
            throw new WorldRepoRefusal(
                gh.availability === "signed-out" ? "gh-signed-out" : "gh-missing",
                gh.message,
                null,
                gh.availability === "signed-out",
            );
        }
        const gitProbe = await this.runner.run(GIT_COMMAND, ["--version"], { signal });
        if (!gitProbe.started) {
            throw new WorldRepoRefusal(
                "git-missing",
                "git is not on this computer's PATH, and keeping a world in a repository is a push.",
            );
        }

        const repositoryUrl = await this.ensureRepository(owner, repo, request.visibility, signal, notes);
        const guard = await this.readRepository(owner, repo, branch, signal);
        if (guard.branchExists && guard.branchIsOurs !== true) {
            throw new WorldRepoRefusal(
                "not-ours",
                `${owner}/${repo} already has a ${branch} branch that this application did not write. ` +
                    "Syncing replaces that branch outright, so it refuses rather than destroy something " +
                    "else made.",
            );
        }
        this.stop(signal);

        /* -- git directory, and the remote's objects if this needs them --- */
        const remoteUrl = (this.options.remoteUrl ?? defaultRemoteUrl)(owner, repo);
        const workDir = join(this.options.workRoot(), targetKey(owner, repo, branch));
        const gitDir = join(workDir, ".git");
        await mkdir(workDir, { recursive: true });
        const freshGitDir = !(await exists(join(gitDir, "HEAD")));
        if (freshGitDir) {
            const init = await this.runner.run(GIT_COMMAND, ["-C", workDir, "init", "--quiet"], { signal });
            if (!init.started || init.code !== 0) {
                throw new WorldRepoRefusal(
                    "git-init-failed",
                    "git could not create the working repository this sync stages into.",
                    init.stderr,
                );
            }
        }

        // The one addition this makes to the orphan pattern `pages/hosting.ts` uses: if the
        // remote branch already exists and this local repository has never fetched it (a
        // fresh git directory, or a target this computer has not synced before), pull its
        // objects in now so the push below has something to exclude. Best-effort: a failure
        // here costs bandwidth on this one sync, never correctness - the orphan reset and
        // force-push below are correct with or without it.
        if (guard.branchExists) {
            const fetch = await this.git(worldPath, gitDir, ["fetch", "--quiet", remoteUrl, branch], {
                signal,
            });
            if (fetch.code !== 0) {
                this.log(
                    key,
                    "warning",
                    "Could not fetch the branch's current objects before syncing; this sync may " +
                        "transfer more than strictly changed.",
                );
            }
        }

        // Same ceremony `pages/hosting.ts`'s `prepareGitDir` uses, and the same reason: a
        // branch with no commits produces a root commit on the next `git commit`, which is
        // the orphan the branch is then force-pushed as. The object database above is never
        // touched by any of this.
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
            throw new WorldRepoRefusal(
                "git-init-failed",
                "git could not point the working repository at the target branch.",
                head.stderr,
            );
        }
        this.stop(signal);

        /* -- stage ---------------------------------------------------------- */
        this.phase(key, "staging");
        await writeFile(
            join(worldPath, WORLD_REPO_MARKER_FILE),
            `${JSON.stringify(
                {
                    tool: WORLD_REPO_MARKER_TOOL,
                    version: WORLD_REPO_MARKER_VERSION,
                    branch,
                    updatedAt: this.stamp(),
                } satisfies WorldRepoMarker,
                null,
                2,
            )}\n`,
            "utf8",
        );
        const files = await walkFiles(worldPath);
        let staged = 0;
        for (let index = 0; index < files.length; index += STAGE_BATCH) {
            this.stop(signal);
            const batch = files.slice(index, index + STAGE_BATCH);
            const result = await this.git(
                worldPath,
                gitDir,
                ["add", "--force", "--pathspec-from-file=-", "--pathspec-file-nul"],
                { signal, input: `${batch.join("\0")}\0` },
            );
            if (result.code !== 0) {
                throw new WorldRepoRefusal("stage-failed", "git could not stage the world's files.", result.stderr);
            }
            staged += batch.length;
            this.emit({
                type: "progress",
                key,
                phase: "staging",
                description: "Staging the world's files",
                done: staged,
                total: files.length,
                at: this.stamp(),
            });
        }

        /* -- commit ----------------------------------------------------------- */
        this.phase(key, "committing");
        const committer = this.options.committer ?? DEFAULT_COMMITTER;
        const commitResult = await this.git(
            worldPath,
            gitDir,
            [
                "-c",
                `user.name=${committer.name}`,
                "-c",
                `user.email=${committer.email}`,
                "commit",
                "--quiet",
                "-m",
                `Sync world as of ${this.stamp()}`,
            ],
            { signal },
        );
        if (commitResult.code !== 0) {
            throw new WorldRepoRefusal("commit-failed", "git could not record the world as a commit.", commitResult.stderr);
        }
        const headResult = await this.git(worldPath, gitDir, ["rev-parse", "HEAD"], { signal });
        const commit = headResult.stdout.trim();
        if (headResult.code !== 0 || commit.length === 0) {
            throw new WorldRepoRefusal("commit-failed", "git made a commit it could not then name.");
        }
        await this.writeStageRecord(key, {
            worldPath,
            owner,
            repo,
            branch,
            stage: "pushing",
            commit,
            pushVerified: false,
            bytes: world.bytes,
            fileCount: world.fileCount,
        });
        this.stop(signal);

        /* -- push --------------------------------------------------------------- */
        this.phase(key, "pushing");
        const pushResult = await this.git(
            worldPath,
            gitDir,
            [
                "-c",
                "credential.helper=",
                "-c",
                `credential.helper=!${GH_COMMAND} auth git-credential`,
                "push",
                "--force",
                remoteUrl,
                `HEAD:refs/heads/${branch}`,
            ],
            { signal },
        );
        if (pushResult.code !== 0) {
            throw new WorldRepoRefusal(
                "push-refused",
                `GitHub refused the push to ${owner}/${repo}.`,
                pushResult.stderr.trim(),
            );
        }
        this.stop(signal);

        /* -- verify ---------------------------------------------------------------- */
        this.phase(key, "verifying");
        const landed = record(
            await ghJsonOrNull(`repos/${owner}/${repo}/branches/${branch}`, { runner: this.runner, signal }),
        );
        const pushVerified = text(record(landed?.["commit"])?.["sha"]) === commit;
        if (!pushVerified) {
            notes.push(
                "The push reported success but GitHub does not yet show that commit on the branch, " +
                    "so it is reported as unverified rather than as landed.",
            );
        }

        this.phase(key, "finished");
        const report: WorldRepoSyncReport = {
            worldPath,
            owner,
            repo,
            branch,
            repositoryUrl: repositoryUrl ?? `https://github.com/${owner}/${repo}`,
            commit,
            pushVerified,
            bytes: world.bytes,
            fileCount: world.fileCount,
            notes,
        };
        await this.writeRecordFinished(key, report);
        return report;
    }

    /* ---------------------------------------------------------------- */
    /* Removal                                                          */
    /* ---------------------------------------------------------------- */

    async remove(target: WorldRepoTarget, signal?: AbortSignal): Promise<WorldRepoRemoveResult> {
        const branch = normaliseBranch(target.branch);
        const owner = target.owner.trim();
        const repo = target.repo.trim();
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
                            `The ${branch} branch of ${owner}/${repo} does not carry this application's ` +
                            "marker, so it is not a world this application published, and nothing was deleted.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }

            let branchDeleted = false;
            if (guard.branchExists) {
                try {
                    await ghApiSend(`repos/${owner}/${repo}/git/refs/heads/${branch}`, "DELETE", undefined, call);
                    branchDeleted = true;
                } catch (error) {
                    if (error instanceof ActionsCallError && error.status === 404) {
                        notes.push("The branch was already gone.");
                    } else {
                        throw error;
                    }
                }
            } else {
                notes.push("There was no branch to delete.");
            }

            await rm(join(this.options.workRoot(), targetKey(owner, repo, branch), "sync.json"), {
                force: true,
            });

            return { ok: true, report: { owner, repo, branch, branchDeleted, notes } };
        } catch (error) {
            return { ok: false, failure: toFailure(error) };
        }
    }

    /* ---------------------------------------------------------------- */
    /* The pieces                                                       */
    /* ---------------------------------------------------------------- */

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

        const wanted = visibility ?? "private";
        const result = await this.runner.run(
            GH_COMMAND,
            [
                "repo",
                "create",
                `${owner}/${repo}`,
                wanted === "public" ? "--public" : "--private",
                "--description",
                "A Minecraft world kept by Material BlueMap",
            ],
            { signal },
        );
        if (!result.started || result.code !== 0) {
            throw new WorldRepoRefusal(
                "repo-refused",
                `${owner}/${repo} does not exist and could not be created.`,
                result.stderr.trim(),
            );
        }
        notes.push(`Created ${owner}/${repo} as a ${wanted} repository.`);
        return `https://github.com/${owner}/${repo}`;
    }

    private git(
        worldPath: string,
        gitDir: string,
        args: readonly string[],
        options: { readonly signal: AbortSignal; readonly input?: string },
    ): ReturnType<ProcessRunner["run"]> {
        return this.runner.run(
            GIT_COMMAND,
            ["-C", worldPath, "--git-dir", gitDir, "--work-tree", worldPath, ...args],
            {
                signal: options.signal,
                ...(options.input === undefined ? {} : { input: options.input }),
            },
        );
    }

    private async writeRecordFinished(key: string, report: WorldRepoSyncReport): Promise<void> {
        await this.writeRecordValue(key, {
            version: 1,
            worldPath: report.worldPath,
            owner: report.owner,
            repo: report.repo,
            branch: report.branch,
            stage: "finished",
            commit: report.commit,
            pushVerified: report.pushVerified,
            bytes: report.bytes,
            fileCount: report.fileCount,
            syncedAt: this.stamp(),
        });
    }

    private async writeRecordValue(key: string, value: WorldRepoRecord): Promise<void> {
        const workDir = join(this.options.workRoot(), key);
        await mkdir(workDir, { recursive: true });
        await writeFile(join(workDir, "sync.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
    }

    private async writeStageRecord(
        key: string,
        input: {
            readonly worldPath: string;
            readonly owner: string;
            readonly repo: string;
            readonly branch: string;
            readonly stage: WorldRepoSyncStage;
            readonly commit: string | null;
            readonly pushVerified: boolean;
            readonly bytes: number;
            readonly fileCount: number;
        },
    ): Promise<void> {
        try {
            await this.writeRecordValue(key, {
                version: 1,
                worldPath: input.worldPath,
                owner: input.owner,
                repo: input.repo,
                branch: input.branch,
                stage: input.stage,
                commit: input.commit,
                pushVerified: input.pushVerified,
                bytes: input.bytes,
                fileCount: input.fileCount,
                syncedAt: this.stamp(),
            });
        } catch (error) {
            this.log(key, "warning", `Could not save the sync resume marker: ${sentence(error)}`);
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

    private emit(event: WorldRepoEvent): void {
        this.options.onEvent?.(event);
    }

    private phase(key: string, phase: WorldRepoPhase): void {
        this.emit({ type: "phase", key, phase, at: this.stamp() });
    }

    private log(key: string, level: "info" | "warning" | "error", message: string): void {
        this.emit({ type: "log", key, level, message, at: this.stamp() });
    }

    private stop(signal: AbortSignal): void {
        if (signal.aborted) throw new Cancelled();
    }

    private fail(key: string, failure: WorldRepoFailure): WorldRepoSyncResult {
        this.emit({ type: "failed", key, failure, at: this.stamp() });
        return { ok: false, failure };
    }
}

function defaultRemoteUrl(owner: string, repo: string): string {
    return `https://github.com/${owner}/${repo}.git`;
}

/* -------------------------------------------------------------------------- */
/* Failures                                                                   */
/* -------------------------------------------------------------------------- */

export class WorldRepoRefusal extends Error {
    readonly code: string;
    readonly detail: string | null;
    readonly needsGhSignIn: boolean;

    constructor(code: string, message: string, detail: string | null = null, needsGhSignIn = false) {
        super(message);
        this.name = "WorldRepoRefusal";
        this.code = code;
        this.detail = detail;
        this.needsGhSignIn = needsGhSignIn;
    }
}

function toFailure(error: unknown): WorldRepoFailure {
    if (error instanceof WorldRepoRefusal) {
        return { code: error.code, message: error.message, detail: error.detail, needsGhSignIn: error.needsGhSignIn };
    }
    if (error instanceof ActionsCallError) {
        return {
            code: `http-${String(error.status)}`,
            message: error.message,
            detail: error.url,
            needsGhSignIn: error.status === 401,
        };
    }
    return { code: "failed", message: sentence(error), detail: null, needsGhSignIn: false };
}

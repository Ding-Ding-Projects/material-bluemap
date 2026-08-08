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
 * What is different is the bounded staging chain used for a world:
 *
 * - **Every generated commit and push stays below decimal 1.5 GB.** Files are ordered by
 *   UTF-8 bytes, planned below 1.4 GB, committed as a linear chain, then measured from the
 *   exact objects each commit introduces. A candidate over either hard ceiling is refused
 *   before any data is uploaded.
 * - **The target stays atomic.** Each bounded commit advances a unique staging ref under an
 *   exact force-with-lease and is read back before the next begins. Only after every batch
 *   is verified does one final leased ref update publish the complete tree.
 * - **The repository does not grow by one permanent chain per sync.** The target is replaced
 *   with the new snapshot chain and the temporary staging ref is removed after verification;
 *   the previous snapshot becomes unreachable just as the old one-commit design intended.
 * - **Incremental transfer is still preserved.** The current target is fetched before a new
 *   root chain is built, and Git's negotiation can reuse every identical object already on
 *   the server. A failed fetch is now a refusal rather than an unbounded fallback.
 *
 * ## The marker, again
 *
 * `WORLD_REPO_MARKER_FILE` plays the same ownership role `PAGES_MARKER_FILE` does: a branch
 * that does not carry it is never replaced or deleted. It is synthesized directly into
 * Git's private index, so neither it nor the partial-upload marker is ever written into the
 * person's live world folder.
 *
 * ## Honesty this module owes the person publishing
 *
 * A live Minecraft server's world folder is being written to while a sync reads it, and a
 * region file mid-save can be caught torn - {@link WorldRepoHost.preflight} says so. GitHub
 * blocks any single file over 100 MB outright and recommends repositories stay under
 * roughly a gigabyte; both are checked and reported rather than discovered from a rejected
 * push. Worldlens additionally enforces its decimal 1.5 GB commit/pack ceiling locally. A
 * push GitHub refuses - a branch rule, a size limit, an expired sign-in - is reported with
 * GitHub's own words, never guessed at.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findWorldDirectories } from "@worldlens/render-actions";
import { ActionsCallError } from "../cirender/actions.js";
import { GH_COMMAND, detectGh, ghApiJson, ghApiSend, nodeProcessRunner } from "../cirender/gh.js";
import type { GhStatus, ProcessRunner } from "../cirender/gh.js";
import { GIT_COMMAND } from "../pages/hosting.js";
import {
    WORLD_REPO_MAX_INTRODUCED_BYTES,
    WORLD_REPO_MAX_PUSH_BYTES,
    WORLD_REPO_PLANNING_TARGET_BYTES,
    compareWorldRepoPaths,
    gitPackUpperBound,
    planWorldRepoBatches,
} from "./batches.js";
import type { WorldRepoBatchFile, WorldRepoBatchPlan } from "./batches.js";

export {
    WORLD_REPO_MAX_INTRODUCED_BYTES,
    WORLD_REPO_MAX_PUSH_BYTES,
    WORLD_REPO_PLANNING_TARGET_BYTES,
} from "./batches.js";

/** Where a world lands when nobody says otherwise. */
export const DEFAULT_WORLD_BRANCH = "world";

/** The file that says a branch belongs to this application, and to which sync target. */
export const WORLD_REPO_MARKER_FILE = ".worldlens-world.json";
export const LEGACY_WORLD_REPO_MARKER_FILE = ".material-bluemap-world.json";
/** Internal marker synthesized into partial staging commits; never written into the world. */
export const WORLD_REPO_UPLOAD_MARKER_FILE = ".worldlens-upload.json";

/** Bumped only if the marker's shape changes. An unknown version is still *ours*. */
export const WORLD_REPO_MARKER_VERSION = 2;

/** The value of the marker's `tool` field. Nothing else is accepted as ours. */
export const WORLD_REPO_MARKER_TOOL = "worldlens";
export const LEGACY_WORLD_REPO_MARKER_TOOL = "material-bluemap";

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
    readonly snapshotId?: string;
    readonly batchCount?: number;
    readonly bytes?: number;
}

export interface WorldRepoOwner {
    readonly login: string;
    readonly kind: "user" | "organization";
}

export type WorldRepoPhase =
    "preparing" | "checking" | "staging" | "committing" | "pushing" | "verifying" | "finished";

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
    readonly batchCount: number;
    readonly maxCommitBytes: number;
    readonly maxPushBytes: number;
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
    | {
          readonly type: "started";
          readonly key: string;
          readonly target: string;
          readonly at: string;
      }
    | {
          readonly type: "phase";
          readonly key: string;
          readonly phase: WorldRepoPhase;
          readonly at: string;
      }
    | {
          readonly type: "progress";
          readonly key: string;
          readonly phase: WorldRepoPhase;
          readonly description: string;
          readonly done: number;
          readonly total: number;
          readonly unit?: "files" | "bytes" | "batches";
          readonly batch?: number;
          readonly batches?: number;
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
    | {
          readonly type: "failed";
          readonly key: string;
          readonly failure: WorldRepoFailure;
          readonly at: string;
      }
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
    /** May lower the 1.4 GB planning target for tests; it can never raise production limits. */
    readonly planningTargetBytes?: number | undefined;
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

function finiteInteger(value: unknown): number | null {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

const GIT_OBJECT_ID_PATTERN = /^[0-9a-f]{40,64}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface WorldFileSnapshot extends WorldRepoBatchFile {
    readonly mtimeMs: number;
}

interface WorldRepoBatchState {
    readonly index: number;
    readonly commit: string;
    readonly parent: string | null;
    readonly sourceBytes: number;
    readonly fileCount: number;
    readonly introducedBytes: number;
    readonly pushBytes: number;
    readonly verified: boolean;
}

interface WorldRepoSyncStateV2 {
    readonly version: 2;
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
    readonly snapshotId: string;
    readonly attemptId: string;
    readonly sourceFingerprint: string;
    readonly originalTargetSha: string | null;
    readonly stagingRef: string;
    readonly batches: readonly WorldRepoBatchState[];
    readonly nextBatch: number;
}

function fingerprintWorldFiles(files: readonly WorldFileSnapshot[]): string {
    const hash = createHash("sha256");
    for (const file of files) {
        hash.update(file.path, "utf8");
        hash.update("\0");
        hash.update(String(file.bytes), "utf8");
        hash.update("\0");
        hash.update(String(file.mtimeMs), "utf8");
        hash.update("\0");
    }
    return hash.digest("hex");
}

function parseBatchState(value: unknown): WorldRepoBatchState | null {
    const row = record(value);
    const index = finiteInteger(row?.["index"]);
    const commit = text(row?.["commit"]);
    const parentValue = row?.["parent"];
    const parent = parentValue === null ? null : text(parentValue);
    const sourceBytes = finiteInteger(row?.["sourceBytes"]);
    const fileCount = finiteInteger(row?.["fileCount"]);
    const introducedBytes = finiteInteger(row?.["introducedBytes"]);
    const pushBytes = finiteInteger(row?.["pushBytes"]);
    if (
        row === null ||
        index === null ||
        commit === null ||
        !GIT_OBJECT_ID_PATTERN.test(commit) ||
        !("parent" in row) ||
        (parentValue !== null && (parent === null || !GIT_OBJECT_ID_PATTERN.test(parent))) ||
        sourceBytes === null ||
        fileCount === null ||
        introducedBytes === null ||
        introducedBytes > WORLD_REPO_MAX_INTRODUCED_BYTES ||
        pushBytes === null ||
        pushBytes > WORLD_REPO_MAX_PUSH_BYTES ||
        typeof row["verified"] !== "boolean"
    ) {
        return null;
    }
    return {
        index,
        commit,
        parent,
        sourceBytes,
        fileCount,
        introducedBytes,
        pushBytes,
        verified: row["verified"] === true,
    };
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
    if (
        source["tool"] !== WORLD_REPO_MARKER_TOOL &&
        source["tool"] !== LEGACY_WORLD_REPO_MARKER_TOOL
    ) {
        return null;
    }

    const branch = text(source["branch"]);
    const updatedAt = text(source["updatedAt"]);
    const version = typeof source["version"] === "number" ? source["version"] : 0;
    const snapshotId = text(source["snapshotId"]);
    const batchCount = finiteInteger(source["batchCount"]);
    const bytes = finiteInteger(source["bytes"]);

    return {
        tool: WORLD_REPO_MARKER_TOOL,
        version,
        branch: branch ?? "",
        updatedAt: updatedAt ?? "",
        ...(snapshotId === null ? {} : { snapshotId }),
        ...(batchCount === null ? {} : { batchCount }),
        ...(bytes === null ? {} : { bytes }),
    };
}

/** Every file under a directory, as forward-slashed paths relative to it. `.git` is skipped. */
async function walkFiles(root: string, relative = ""): Promise<string[]> {
    const found: string[] = [];
    const entries = (await readdir(join(root, relative), { withFileTypes: true })).sort(
        (left, right) => compareWorldRepoPaths(left.name, right.name),
    );
    for (const entry of entries) {
        if (relative === "" && entry.name === ".git") continue;
        if (
            relative === "" &&
            (entry.name === WORLD_REPO_MARKER_FILE || entry.name === WORLD_REPO_UPLOAD_MARKER_FILE)
        ) {
            continue;
        }
        const next = relative === "" ? entry.name : `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
            found.push(...(await walkFiles(root, next)));
            continue;
        }
        if (entry.isFile()) found.push(next);
    }
    return found.sort(compareWorldRepoPaths);
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
        return this.readRecordByKey(
            targetKey(target.owner, target.repo, normaliseBranch(target.branch)),
        );
    }

    private async readRecordByKey(key: string): Promise<WorldRepoRecord | null> {
        const row = await this.readRecordRow(key);
        try {
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

    private async readRecordRow(key: string): Promise<Record<string, unknown> | null> {
        try {
            return record(
                JSON.parse(await readFile(join(this.options.workRoot(), key, "sync.json"), "utf8")),
            );
        } catch {
            return null;
        }
    }

    private async readSyncStateByKey(key: string): Promise<WorldRepoSyncStateV2 | null> {
        const row = await this.readRecordRow(key);
        if (row === null || row["version"] !== 2 || !Array.isArray(row["batches"])) return null;
        const worldPath = text(row["worldPath"]);
        const owner = text(row["owner"]);
        const repo = text(row["repo"]);
        const branch = text(row["branch"]);
        const stage = text(row["stage"]);
        const snapshotId = text(row["snapshotId"]);
        const attemptId = text(row["attemptId"]);
        const sourceFingerprint = text(row["sourceFingerprint"]);
        const stagingRef = text(row["stagingRef"]);
        const bytes = finiteInteger(row["bytes"]);
        const fileCount = finiteInteger(row["fileCount"]);
        const nextBatch = finiteInteger(row["nextBatch"]);
        const batches = row["batches"].map(parseBatchState);
        const commit = text(row["commit"]);
        const originalTargetValue = row["originalTargetSha"];
        const originalTargetSha = originalTargetValue === null ? null : text(originalTargetValue);
        const parsedBatches = batches.every((batch) => batch !== null)
            ? (batches as WorldRepoBatchState[])
            : null;
        const expectedStagingRef =
            attemptId === null
                ? null
                : `refs/heads/worldlens-upload/${createHash("sha256")
                      .update(key, "utf8")
                      .digest("hex")
                      .slice(0, 16)}/${attemptId}`;
        const chainIsValid =
            parsedBatches !== null &&
            parsedBatches.length > 0 &&
            parsedBatches.every((batch, index) => {
                const previous = index === 0 ? null : (parsedBatches[index - 1]?.commit ?? null);
                return batch.index === index && batch.parent === previous;
            }) &&
            new Set(parsedBatches.map((batch) => batch.commit)).size === parsedBatches.length;
        const sourceBytes = parsedBatches?.reduce((total, batch) => total + batch.sourceBytes, 0);
        const countedFiles = parsedBatches?.reduce((total, batch) => total + batch.fileCount, 0);
        if (
            worldPath === null ||
            owner === null ||
            repo === null ||
            branch === null ||
            stage === null ||
            snapshotId === null ||
            attemptId === null ||
            sourceFingerprint === null ||
            !/^[0-9a-f]{64}$/i.test(sourceFingerprint) ||
            stagingRef === null ||
            expectedStagingRef === null ||
            stagingRef !== expectedStagingRef ||
            !UUID_PATTERN.test(attemptId ?? "") ||
            !UUID_PATTERN.test(snapshotId ?? "") ||
            bytes === null ||
            fileCount === null ||
            nextBatch === null ||
            commit === null ||
            originalTargetValue === undefined ||
            (originalTargetValue !== null &&
                (originalTargetSha === null || !GIT_OBJECT_ID_PATTERN.test(originalTargetSha))) ||
            (stage !== "pushing" && stage !== "finished") ||
            typeof row["pushVerified"] !== "boolean" ||
            !chainIsValid ||
            parsedBatches === null ||
            nextBatch > parsedBatches.length ||
            commit !== parsedBatches.at(-1)?.commit ||
            sourceBytes !== bytes ||
            countedFiles !== fileCount ||
            parsedBatches.some((batch, index) => batch.verified !== (index < nextBatch)) ||
            (stage === "finished" && (row["pushVerified"] !== true || nextBatch !== parsedBatches.length)) ||
            (stage === "pushing" && row["pushVerified"] !== false)
        ) {
            return null;
        }
        return {
            version: 2,
            worldPath,
            owner,
            repo,
            branch,
            stage: stage as WorldRepoSyncStage,
            commit,
            pushVerified: row["pushVerified"] === true,
            bytes,
            fileCount,
            syncedAt: text(row["syncedAt"]) ?? "",
            snapshotId,
            attemptId,
            sourceFingerprint,
            originalTargetSha,
            stagingRef,
            batches: parsedBatches,
            nextBatch,
        };
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

        const gitProbe = await this.runner.run(
            GIT_COMMAND,
            ["--version"],
            signal ? { signal } : {},
        );
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
        const files = await this.snapshotFiles(worldPath);
        const worlds = await findWorldDirectories(worldPath);
        return this.reportForFiles(files, worlds.length > 0);
    }

    private async snapshotFiles(worldPath: string): Promise<WorldFileSnapshot[]> {
        const info = await stat(worldPath).catch(() => null);
        if (info === null || !info.isDirectory()) {
            throw new WorldRepoRefusal(
                "world-missing",
                `${worldPath} is not a folder on this computer, so there is nothing to sync.`,
            );
        }
        const paths = await walkFiles(worldPath);
        const files: WorldFileSnapshot[] = [];
        for (const path of paths) {
            const info = await stat(join(worldPath, path));
            files.push({ path, bytes: info.size, mtimeMs: info.mtimeMs });
        }
        return files;
    }

    private reportForFiles(
        files: readonly WorldFileSnapshot[],
        looksLikeWorld: boolean,
    ): WorldRepoReport {
        let bytes = 0;
        const oversizedFiles: { path: string; bytes: number }[] = [];
        for (const file of files) {
            bytes += file.bytes;
            if (file.bytes > GITHUB_FILE_LIMIT_BYTES)
                oversizedFiles.push({ path: file.path, bytes: file.bytes });
        }
        return {
            fileCount: files.length,
            bytes,
            oversizedFiles,
            looksLikeWorld,
            overSoftLimit: bytes > REPO_SOFT_LIMIT_BYTES,
            overHeavyLimit: bytes > REPO_HEAVY_LIMIT_BYTES,
        };
    }

    /**
     * The repository's own state and its marker on one branch: exists, writable, and
     * whether that branch already carries this application's mark.
     *
     * Public rather than a `preflight()`-only implementation detail because it is also the
     * one honest signal `worldrepo/adopt.ts` has for "does this repository look like one
     * this application already prepared" - the same question asked here for a sync about to
     * happen is asked there for a repository picked from a list on a computer that has
     * never synced anything. Reused rather than duplicated, so the two can never disagree
     * about what counts as "ours".
     */
    async readRepository(
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
            const branchInfo = record(
                await ghJsonOrNull(`repos/${owner}/${repo}/branches/${branch}`, call),
            );
            let marker: WorldRepoMarker | null = null;
            if (branchInfo !== null) {
                const currentMarker = await ghJsonOrNull(
                    `repos/${owner}/${repo}/contents/${WORLD_REPO_MARKER_FILE}?ref=${branch}`,
                    call,
                );
                const markerPayload =
                    currentMarker ??
                    (await ghJsonOrNull(
                        `repos/${owner}/${repo}/contents/${LEGACY_WORLD_REPO_MARKER_FILE}?ref=${branch}`,
                        call,
                    ));
                marker = readWorldMarker(markerPayload);
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
        const key = targetKey(target.owner, target.repo, normaliseBranch(target.branch));
        const row = await this.readRecordRow(key);
        const resumeState = await this.readSyncStateByKey(key);
        if (row?.["version"] === 2 && resumeState === null) {
            return this.fail(key, {
                code: "resume-state-invalid",
                message: "The saved version-two upload state is incomplete or inconsistent. Start a new sync rather than guessing which commits landed.",
                detail: null,
                needsGhSignIn: false,
            });
        }
        const saved = await this.readRecordByKey(key);
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
        return this.startSync(
            {
                worldPath: saved.worldPath,
                owner: saved.owner,
                repo: saved.repo,
                branch: saved.branch,
                acknowledgeSync: true,
            },
            resumeState,
        );
    }

    async sync(request: WorldRepoSyncRequest): Promise<WorldRepoSyncResult> {
        return this.startSync(request, null);
    }

    private async startSync(
        request: WorldRepoSyncRequest,
        resumeState: WorldRepoSyncStateV2 | null,
    ): Promise<WorldRepoSyncResult> {
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
            const report = await this.runSync(request, key, controller.signal, resumeState);
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
        resumeState: WorldRepoSyncStateV2 | null,
    ): Promise<WorldRepoSyncReport> {
        const branch = normaliseBranch(request.branch);
        const owner = request.owner.trim();
        const repo = request.repo.trim();
        const worldPath = request.worldPath;
        const notes: string[] = [];

        if (owner.length === 0 || repo.length === 0 || worldPath.length === 0) {
            throw new WorldRepoRefusal(
                "invalid-request",
                "A world folder, an owner and a repository name are required.",
            );
        }
        if (request.acknowledgeSync !== true) {
            throw new WorldRepoRefusal(
                "not-acknowledged",
                "Syncing has not been agreed to. The preflight report has to be seen and accepted first.",
            );
        }

        this.emit({ type: "started", key, target: `${owner}/${repo}#${branch}`, at: this.stamp() });
        if (resumeState === null) {
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
        }

        /* -- prepare ------------------------------------------------------ */
        this.phase(key, "preparing");
        const snapshotFiles = await this.snapshotFiles(worldPath);
        const worldDirectories = await findWorldDirectories(worldPath);
        const world = this.reportForFiles(snapshotFiles, worldDirectories.length > 0);
        if (world.oversizedFiles.length > 0) {
            const first = world.oversizedFiles[0];
            throw new WorldRepoRefusal(
                "file-too-large",
                `${first?.path ?? "A file"} is past GitHub's 100 MB per-file limit and cannot be ` +
                    "pushed at all.",
            );
        }
        const sourceFingerprint = fingerprintWorldFiles(snapshotFiles);
        if (resumeState !== null && sourceFingerprint !== resumeState.sourceFingerprint) {
            throw new WorldRepoRefusal(
                "world-changed",
                "The world changed after this upload was prepared. Start a new sync so every batch belongs to one snapshot.",
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

        const repositoryUrl = await this.ensureRepository(
            owner,
            repo,
            request.visibility,
            signal,
            notes,
        );
        const guard = await this.readRepository(owner, repo, branch, signal);
        if (guard.branchExists && guard.branchIsOurs !== true && resumeState === null) {
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
            const init = await this.runner.run(GIT_COMMAND, ["-C", workDir, "init", "--quiet"], {
                signal,
            });
            if (!init.started || init.code !== 0) {
                throw new WorldRepoRefusal(
                    "git-init-failed",
                    "git could not create the working repository this sync stages into.",
                    init.stderr,
                );
            }
        }

        const targetRef = `refs/heads/${branch}`;
        const currentTargetSha = await this.remoteRef(
            worldPath,
            gitDir,
            remoteUrl,
            targetRef,
            signal,
        );
        if (guard.branchExists && currentTargetSha === null) {
            throw new WorldRepoRefusal(
                "target-unreadable",
                `The ${branch} branch exists but Git could not read its current commit, so no leased update is safe.`,
            );
        }
        const resumeFinalCommit = resumeState?.batches.at(-1)?.commit ?? null;
        if (
            guard.branchExists &&
            guard.branchIsOurs !== true &&
            currentTargetSha !== resumeFinalCommit
        ) {
            throw new WorldRepoRefusal(
                "not-ours",
                `The ${branch} branch does not carry this application's marker. Nothing was replaced.`,
            );
        }
        if (
            !guard.branchExists &&
            currentTargetSha !== null &&
            currentTargetSha !== resumeFinalCommit
        ) {
            throw new WorldRepoRefusal(
                "not-ours",
                `The ${branch} branch appeared after the ownership check. Nothing was replaced.`,
            );
        }

        let state: WorldRepoSyncStateV2;
        if (resumeState === null) {
            if (currentTargetSha !== null) {
                const fetch = await this.git(
                    worldPath,
                    gitDir,
                    [
                        ...this.credentialArgs(),
                        "fetch",
                        "--quiet",
                        remoteUrl,
                        `${targetRef}:refs/worldlens/base/${randomUUID()}`,
                    ],
                    { signal },
                );
                if (!fetch.started || fetch.code !== 0) {
                    throw new WorldRepoRefusal(
                        "fetch-failed",
                        "The current world branch could not be fetched, so a bounded incremental upload cannot be proven safe.",
                        fetch.stderr.trim(),
                    );
                }
            }
            state = await this.prepareSnapshot({
                key,
                worldPath,
                owner,
                repo,
                branch,
                gitDir,
                files: snapshotFiles,
                world,
                sourceFingerprint,
                originalTargetSha: currentTargetSha,
                signal,
            });
        } else {
            if (
                resumeState.worldPath !== worldPath ||
                resumeState.owner !== owner ||
                resumeState.repo !== repo ||
                resumeState.branch !== branch
            ) {
                throw new WorldRepoRefusal(
                    "resume-mismatch",
                    "The saved upload belongs to a different world target.",
                );
            }
            const finalCommit = resumeState.batches.at(-1)?.commit ?? null;
            if (
                currentTargetSha !== resumeState.originalTargetSha &&
                currentTargetSha !== finalCommit
            ) {
                throw new WorldRepoRefusal(
                    "target-diverged",
                    `The ${branch} branch changed after this upload began. Its newer commit was left untouched.`,
                );
            }
            const localCommit =
                finalCommit === null
                    ? null
                    : await this.git(
                          worldPath,
                          gitDir,
                          ["cat-file", "-e", `${finalCommit}^{commit}`],
                          { signal },
                      );
            if (localCommit === null || !localCommit.started || localCommit.code !== 0) {
                throw new WorldRepoRefusal(
                    "resume-objects-missing",
                    "The saved upload's local Git objects are missing. Start a new sync to rebuild the bounded commits.",
                );
            }
            state =
                currentTargetSha === finalCommit
                    ? {
                          ...resumeState,
                          batches: resumeState.batches.map((batch) => ({
                              ...batch,
                              verified: true,
                          })),
                          nextBatch: resumeState.batches.length,
                      }
                    : await this.reconcileStagingState(
                          key,
                          worldPath,
                          gitDir,
                          remoteUrl,
                          resumeState,
                          signal,
                      );
        }

        state = await this.uploadBatches(key, worldPath, gitDir, remoteUrl, state, signal);
        const commit = state.batches.at(-1)?.commit;
        if (commit === undefined) {
            throw new WorldRepoRefusal(
                "commit-failed",
                "The bounded upload plan produced no final commit.",
            );
        }

        /* -- atomically publish the verified snapshot ------------------------ */
        this.phase(key, "verifying");
        let targetLanded = currentTargetSha === commit;
        if (!targetLanded) {
            const targetPush = await this.pushRef(
                worldPath,
                gitDir,
                remoteUrl,
                targetRef,
                commit,
                state.originalTargetSha,
                signal,
            );
            const landed = await this.remoteRef(worldPath, gitDir, remoteUrl, targetRef);
            targetLanded = landed === commit;
            if (!targetLanded) {
                if (signal.aborted) throw new Cancelled();
                throw new WorldRepoRefusal(
                    targetPush.code === 0 ? "push-unverified" : "target-diverged",
                    targetPush.code === 0
                        ? "The final branch update reported success but its exact commit could not be read back."
                        : `GitHub refused the leased update to ${owner}/${repo} because the target changed or its rules rejected it.`,
                    targetPush.stderr.trim(),
                );
            }
        }

        const stagingBeforeCleanup = await this.remoteRef(
            worldPath,
            gitDir,
            remoteUrl,
            state.stagingRef,
        );
        const cleanup =
            stagingBeforeCleanup === commit
                ? await this.deleteRef(worldPath, gitDir, remoteUrl, state.stagingRef, commit)
                : null;
        const stagingAfterCleanup = await this.remoteRef(
            worldPath,
            gitDir,
            remoteUrl,
            state.stagingRef,
        );
        if ((cleanup !== null && cleanup.code !== 0) || stagingAfterCleanup !== null) {
            notes.push(
                "The world branch is verified, but its temporary staging branch still needs cleanup.",
            );
        }

        state = {
            ...state,
            stage: "finished",
            commit,
            pushVerified: true,
            nextBatch: state.batches.length,
            syncedAt: this.stamp(),
        };
        await this.writeSyncState(key, state);
        this.phase(key, "finished");
        const report: WorldRepoSyncReport = {
            worldPath,
            owner,
            repo,
            branch,
            repositoryUrl: repositoryUrl ?? `https://github.com/${owner}/${repo}`,
            commit,
            pushVerified: true,
            bytes: world.bytes,
            fileCount: world.fileCount,
            batchCount: state.batches.length,
            maxCommitBytes: Math.max(...state.batches.map((batch) => batch.introducedBytes)),
            maxPushBytes: Math.max(...state.batches.map((batch) => batch.pushBytes)),
            notes,
        };
        return report;
    }

    private async prepareSnapshot(input: {
        readonly key: string;
        readonly worldPath: string;
        readonly owner: string;
        readonly repo: string;
        readonly branch: string;
        readonly gitDir: string;
        readonly files: readonly WorldFileSnapshot[];
        readonly world: WorldRepoReport;
        readonly sourceFingerprint: string;
        readonly originalTargetSha: string | null;
        readonly signal: AbortSignal;
    }): Promise<WorldRepoSyncStateV2> {
        const attemptId = randomUUID();
        const snapshotId = randomUUID();
        const targetDigest = createHash("sha256")
            .update(input.key, "utf8")
            .digest("hex")
            .slice(0, 16);
        const stagingRef = `refs/heads/worldlens-upload/${targetDigest}/${attemptId}`;
        const plans = planWorldRepoBatches(
            input.files,
            this.options.planningTargetBytes ?? WORLD_REPO_PLANNING_TARGET_BYTES,
        );

        await this.runner.run(
            GIT_COMMAND,
            ["--git-dir", input.gitDir, "update-ref", "-d", stagingRef],
            {
                signal: input.signal,
            },
        );
        await rm(join(input.gitDir, "index"), { force: true });
        const head = await this.runner.run(
            GIT_COMMAND,
            ["--git-dir", input.gitDir, "symbolic-ref", "HEAD", stagingRef],
            { signal: input.signal },
        );
        if (!head.started || head.code !== 0) {
            throw new WorldRepoRefusal(
                "git-init-failed",
                "Git could not create the temporary staging branch for this snapshot.",
                head.stderr,
            );
        }

        const batches: WorldRepoBatchState[] = [];
        let parent: string | null = null;
        let stagedBytes = 0;
        for (const plan of plans) {
            this.stop(input.signal);
            this.phase(input.key, "staging");
            for (let index = 0; index < plan.files.length; index += STAGE_BATCH) {
                this.stop(input.signal);
                const paths = plan.files.slice(index, index + STAGE_BATCH);
                const result = await this.git(
                    input.worldPath,
                    input.gitDir,
                    ["add", "--force", "--pathspec-from-file=-", "--pathspec-file-nul"],
                    {
                        signal: input.signal,
                        input: `${paths.map((file) => file.path).join("\0")}\0`,
                    },
                );
                if (!result.started || result.code !== 0) {
                    throw new WorldRepoRefusal(
                        "stage-failed",
                        "Git could not stage the world's files.",
                        result.stderr,
                    );
                }
                stagedBytes += paths.reduce((total, file) => total + file.bytes, 0);
                this.emit({
                    type: "progress",
                    key: input.key,
                    phase: "staging",
                    description: `Preparing batch ${String(plan.index + 1)} of ${String(plans.length)}`,
                    done: stagedBytes,
                    total: input.world.bytes,
                    unit: "bytes",
                    batch: plan.index + 1,
                    batches: plans.length,
                    at: this.stamp(),
                });
            }

            const finalBatch = plan.index === plans.length - 1;
            if (finalBatch) {
                await this.removeIndexPath(
                    input.worldPath,
                    input.gitDir,
                    WORLD_REPO_UPLOAD_MARKER_FILE,
                    input.signal,
                );
                await this.stageSyntheticFile(
                    input.worldPath,
                    input.gitDir,
                    WORLD_REPO_MARKER_FILE,
                    {
                        tool: WORLD_REPO_MARKER_TOOL,
                        version: WORLD_REPO_MARKER_VERSION,
                        branch: input.branch,
                        updatedAt: this.stamp(),
                        snapshotId,
                        batchCount: plans.length,
                        bytes: input.world.bytes,
                    } satisfies WorldRepoMarker,
                    input.signal,
                );
            } else {
                await this.stageSyntheticFile(
                    input.worldPath,
                    input.gitDir,
                    WORLD_REPO_UPLOAD_MARKER_FILE,
                    {
                        tool: WORLD_REPO_MARKER_TOOL,
                        version: 1,
                        snapshotId,
                        attemptId,
                        batch: plan.index + 1,
                        batches: plans.length,
                    },
                    input.signal,
                );
            }

            this.phase(input.key, "committing");
            const committer = this.options.committer ?? DEFAULT_COMMITTER;
            const commitResult = await this.git(
                input.worldPath,
                input.gitDir,
                [
                    "-c",
                    `user.name=${committer.name}`,
                    "-c",
                    `user.email=${committer.email}`,
                    "commit",
                    "--quiet",
                    "--allow-empty",
                    "-m",
                    `Sync world snapshot ${snapshotId} batch ${String(plan.index + 1)}/${String(plans.length)}`,
                ],
                { signal: input.signal },
            );
            if (!commitResult.started || commitResult.code !== 0) {
                throw new WorldRepoRefusal(
                    "commit-failed",
                    "Git could not record a bounded world batch.",
                    commitResult.stderr,
                );
            }
            const headResult = await this.git(
                input.worldPath,
                input.gitDir,
                ["rev-parse", "HEAD"],
                {
                    signal: input.signal,
                },
            );
            const commit = headResult.stdout.trim();
            if (
                !headResult.started ||
                headResult.code !== 0 ||
                !/^[0-9a-f]{40,64}$/i.test(commit)
            ) {
                throw new WorldRepoRefusal(
                    "commit-failed",
                    "Git made a batch commit it could not then name.",
                );
            }
            const measured = await this.measureCommit(
                input.worldPath,
                input.gitDir,
                commit,
                parent,
                input.signal,
            );
            if (measured.introducedBytes > WORLD_REPO_MAX_INTRODUCED_BYTES) {
                throw new WorldRepoRefusal(
                    "commit-too-large",
                    `Batch ${String(plan.index + 1)} introduced ${String(measured.introducedBytes)} bytes, past the 1.5 GB limit.`,
                );
            }
            if (measured.pushBytes > WORLD_REPO_MAX_PUSH_BYTES) {
                throw new WorldRepoRefusal(
                    "push-too-large",
                    `Batch ${String(plan.index + 1)} could create a ${String(measured.pushBytes)} byte Git pack, past the 1.5 GB limit.`,
                );
            }
            batches.push({
                index: plan.index,
                commit,
                parent,
                sourceBytes: plan.sourceBytes,
                fileCount: plan.files.length,
                introducedBytes: measured.introducedBytes,
                pushBytes: measured.pushBytes,
                verified: false,
            });
            parent = commit;
            this.emit({
                type: "progress",
                key: input.key,
                phase: "committing",
                description: "Recording bounded world commits",
                done: plan.index + 1,
                total: plans.length,
                unit: "batches",
                batch: plan.index + 1,
                batches: plans.length,
                at: this.stamp(),
            });
        }

        const after = await this.snapshotFiles(input.worldPath);
        if (fingerprintWorldFiles(after) !== input.sourceFingerprint) {
            throw new WorldRepoRefusal(
                "world-changed",
                "The world changed while its bounded commits were being prepared. Nothing was uploaded.",
            );
        }

        const state: WorldRepoSyncStateV2 = {
            version: 2,
            worldPath: input.worldPath,
            owner: input.owner,
            repo: input.repo,
            branch: input.branch,
            stage: "pushing",
            commit: batches.at(-1)?.commit ?? null,
            pushVerified: false,
            bytes: input.world.bytes,
            fileCount: input.world.fileCount,
            syncedAt: this.stamp(),
            snapshotId,
            attemptId,
            sourceFingerprint: input.sourceFingerprint,
            originalTargetSha: input.originalTargetSha,
            stagingRef,
            batches,
            nextBatch: 0,
        };
        await this.writeSyncState(input.key, state);
        return state;
    }

    private async stageSyntheticFile(
        worldPath: string,
        gitDir: string,
        path: string,
        value: unknown,
        signal: AbortSignal,
    ): Promise<void> {
        const payload = `${JSON.stringify(value, null, 2)}\n`;
        const hashed = await this.git(worldPath, gitDir, ["hash-object", "-w", "--stdin"], {
            signal,
            input: payload,
        });
        const object = hashed.stdout.trim();
        if (!hashed.started || hashed.code !== 0 || !/^[0-9a-f]{40,64}$/i.test(object)) {
            throw new WorldRepoRefusal(
                "stage-failed",
                `Git could not create ${path} in its private index.`,
                hashed.stderr,
            );
        }
        const staged = await this.git(
            worldPath,
            gitDir,
            ["update-index", "--add", "--cacheinfo", `100644,${object},${path}`],
            { signal },
        );
        if (!staged.started || staged.code !== 0) {
            throw new WorldRepoRefusal(
                "stage-failed",
                `Git could not stage ${path} in its private index.`,
                staged.stderr,
            );
        }
    }

    private async removeIndexPath(
        worldPath: string,
        gitDir: string,
        path: string,
        signal: AbortSignal,
    ): Promise<void> {
        const result = await this.git(
            worldPath,
            gitDir,
            ["update-index", "--force-remove", "--", path],
            { signal },
        );
        if (!result.started || result.code !== 0) {
            throw new WorldRepoRefusal(
                "stage-failed",
                `Git could not remove ${path} from its private index.`,
                result.stderr,
            );
        }
    }

    private async measureCommit(
        worldPath: string,
        gitDir: string,
        commit: string,
        parent: string | null,
        signal: AbortSignal,
    ): Promise<{ readonly introducedBytes: number; readonly pushBytes: number }> {
        const listed = await this.git(
            worldPath,
            gitDir,
            ["rev-list", "--objects", commit, ...(parent === null ? [] : [`^${parent}`])],
            { signal },
        );
        if (!listed.started || listed.code !== 0) {
            throw new WorldRepoRefusal(
                "measure-failed",
                "Git could not enumerate a batch's introduced objects.",
                listed.stderr,
            );
        }
        const objects = [
            ...new Set(
                listed.stdout
                    .split(/\r?\n/)
                    .map((line) => line.trim().split(/\s+/, 1)[0] ?? "")
                    .filter((value) => /^[0-9a-f]{40,64}$/i.test(value)),
            ),
        ];
        if (objects.length === 0) {
            throw new WorldRepoRefusal(
                "measure-failed",
                "Git reported no objects for a generated batch commit.",
            );
        }
        const checked = await this.git(
            worldPath,
            gitDir,
            ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
            { signal, input: `${objects.join("\n")}\n` },
        );
        if (!checked.started || checked.code !== 0) {
            throw new WorldRepoRefusal(
                "measure-failed",
                "Git could not measure a batch's introduced objects.",
                checked.stderr,
            );
        }
        const sizes = checked.stdout
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0)
            .map((line) => Number(line.trim().split(/\s+/).at(-1)))
            .filter((size) => Number.isSafeInteger(size) && size >= 0);
        if (sizes.length !== objects.length) {
            throw new WorldRepoRefusal(
                "measure-failed",
                "Git returned an incomplete object-size report for a batch.",
            );
        }
        return {
            introducedBytes: sizes.reduce((total, size) => total + size, 0),
            pushBytes: gitPackUpperBound(sizes),
        };
    }

    private async reconcileStagingState(
        key: string,
        worldPath: string,
        gitDir: string,
        remoteUrl: string,
        state: WorldRepoSyncStateV2,
        signal: AbortSignal,
    ): Promise<WorldRepoSyncStateV2> {
        const tip = await this.remoteRef(worldPath, gitDir, remoteUrl, state.stagingRef, signal);
        if (tip === null) {
            if (state.nextBatch > 0) {
                throw new WorldRepoRefusal(
                    "staging-diverged",
                    "The saved staging branch disappeared after verified batches landed. Nothing was overwritten.",
                );
            }
            return state;
        }
        const remoteIndex = state.batches.findIndex((batch) => batch.commit === tip);
        if (remoteIndex < 0 || state.nextBatch > remoteIndex + 1) {
            throw new WorldRepoRefusal(
                "staging-diverged",
                "The staging branch no longer matches this upload's exact commit chain. Nothing was overwritten.",
            );
        }
        const reconciled: WorldRepoSyncStateV2 = {
            ...state,
            batches: state.batches.map((batch) => ({
                ...batch,
                verified: batch.index <= remoteIndex,
            })),
            nextBatch: remoteIndex + 1,
            syncedAt: this.stamp(),
        };
        await this.writeSyncState(key, reconciled);
        return reconciled;
    }

    private async uploadBatches(
        key: string,
        worldPath: string,
        gitDir: string,
        remoteUrl: string,
        initial: WorldRepoSyncStateV2,
        signal: AbortSignal,
    ): Promise<WorldRepoSyncStateV2> {
        let state = initial;
        let completedBytes = state.batches
            .slice(0, state.nextBatch)
            .reduce((total, batch) => total + batch.sourceBytes, 0);
        for (let index = state.nextBatch; index < state.batches.length; index++) {
            const batch = state.batches[index];
            if (batch === undefined) break;
            this.phase(key, "pushing");
            this.emit({
                type: "progress",
                key,
                phase: "pushing",
                description: `Uploading batch ${String(index + 1)} of ${String(state.batches.length)}`,
                done: completedBytes,
                total: state.bytes,
                unit: "bytes",
                batch: index + 1,
                batches: state.batches.length,
                at: this.stamp(),
            });
            const expected = index === 0 ? null : (state.batches[index - 1]?.commit ?? null);
            const pushed = await this.pushRef(
                worldPath,
                gitDir,
                remoteUrl,
                state.stagingRef,
                batch.commit,
                expected,
                signal,
            );
            // Always read back without the cancelled signal. A server can accept the ref
            // immediately before the local process observes cancellation or a lost reply.
            const landed = await this.remoteRef(worldPath, gitDir, remoteUrl, state.stagingRef);
            if (landed !== batch.commit) {
                if (signal.aborted) throw new Cancelled();
                if (landed !== expected) {
                    throw new WorldRepoRefusal(
                        "staging-diverged",
                        "The temporary staging branch changed unexpectedly. The target branch was left untouched.",
                    );
                }
                throw new WorldRepoRefusal(
                    pushed.code === 0 ? "push-unverified" : "push-refused",
                    pushed.code === 0
                        ? `Batch ${String(index + 1)} could not be read back after upload.`
                        : `GitHub refused batch ${String(index + 1)} of this world upload.`,
                    pushed.stderr.trim(),
                );
            }
            completedBytes += batch.sourceBytes;
            state = {
                ...state,
                batches: state.batches.map((entry) =>
                    entry.index === index ? { ...entry, verified: true } : entry,
                ),
                nextBatch: index + 1,
                syncedAt: this.stamp(),
            };
            await this.writeSyncState(key, state);
            this.emit({
                type: "progress",
                key,
                phase: "pushing",
                description: `Verified batch ${String(index + 1)} of ${String(state.batches.length)}`,
                done: completedBytes,
                total: state.bytes,
                unit: "bytes",
                batch: index + 1,
                batches: state.batches.length,
                at: this.stamp(),
            });
            if (signal.aborted) throw new Cancelled();
        }
        return state;
    }

    private credentialArgs(): readonly string[] {
        return [
            "-c",
            "credential.helper=",
            "-c",
            `credential.helper=!${GH_COMMAND} auth git-credential`,
        ];
    }

    private packArgs(): readonly string[] {
        return [
            "-c",
            "pack.window=0",
            "-c",
            "pack.reuseDeltas=false",
            "-c",
            "pack.reuseObjects=false",
            "-c",
            "pack.compression=0",
        ];
    }

    private pushRef(
        worldPath: string,
        gitDir: string,
        remoteUrl: string,
        ref: string,
        commit: string,
        expected: string | null,
        signal: AbortSignal,
    ): ReturnType<ProcessRunner["run"]> {
        return this.git(
            worldPath,
            gitDir,
            [
                ...this.credentialArgs(),
                ...this.packArgs(),
                "push",
                "--porcelain",
                "--progress",
                `--force-with-lease=${ref}:${expected ?? ""}`,
                remoteUrl,
                `${commit}:${ref}`,
            ],
            { signal },
        );
    }

    private deleteRef(
        worldPath: string,
        gitDir: string,
        remoteUrl: string,
        ref: string,
        expected: string,
    ): ReturnType<ProcessRunner["run"]> {
        return this.git(
            worldPath,
            gitDir,
            [
                ...this.credentialArgs(),
                "push",
                "--porcelain",
                `--force-with-lease=${ref}:${expected}`,
                remoteUrl,
                `:${ref}`,
            ],
            {},
        );
    }

    private async remoteRef(
        worldPath: string,
        gitDir: string,
        remoteUrl: string,
        ref: string,
        signal?: AbortSignal,
    ): Promise<string | null> {
        const result = await this.git(
            worldPath,
            gitDir,
            [...this.credentialArgs(), "ls-remote", "--refs", remoteUrl, ref],
            signal === undefined ? {} : { signal },
        );
        if (!result.started || result.code !== 0) {
            throw new WorldRepoRefusal(
                "remote-read-failed",
                `Git could not read ${ref} back from the repository.`,
                result.stderr.trim(),
            );
        }
        for (const line of result.stdout.split(/\r?\n/)) {
            const [sha, foundRef] = line.trim().split(/\s+/, 2);
            if (foundRef === ref && sha !== undefined && /^[0-9a-f]{40,64}$/i.test(sha)) return sha;
        }
        return null;
    }

    private writeSyncState(key: string, state: WorldRepoSyncStateV2): Promise<void> {
        return this.writeRecordValue(key, state);
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
                    await ghApiSend(
                        `repos/${owner}/${repo}/git/refs/heads/${branch}`,
                        "DELETE",
                        undefined,
                        call,
                    );
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
                "A Minecraft world kept by Worldlens",
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
        options: { readonly signal?: AbortSignal; readonly input?: string },
    ): ReturnType<ProcessRunner["run"]> {
        return this.runner.run(
            GIT_COMMAND,
            ["-C", worldPath, "--git-dir", gitDir, "--work-tree", worldPath, ...args],
            {
                ...(options.signal === undefined ? {} : { signal: options.signal }),
                ...(options.input === undefined ? {} : { input: options.input }),
            },
        );
    }

    private async writeRecordValue(
        key: string,
        value: WorldRepoRecord | WorldRepoSyncStateV2,
    ): Promise<void> {
        const workDir = join(this.options.workRoot(), key);
        await mkdir(workDir, { recursive: true });
        const destination = join(workDir, "sync.json");
        const temporary = `${destination}.tmp`;
        await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
        await rename(temporary, destination);
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

    constructor(
        code: string,
        message: string,
        detail: string | null = null,
        needsGhSignIn = false,
    ) {
        super(message);
        this.name = "WorldRepoRefusal";
        this.code = code;
        this.detail = detail;
        this.needsGhSignIn = needsGhSignIn;
    }
}

function toFailure(error: unknown): WorldRepoFailure {
    if (error instanceof WorldRepoRefusal) {
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
    return { code: "failed", message: sentence(error), detail: null, needsGhSignIn: false };
}

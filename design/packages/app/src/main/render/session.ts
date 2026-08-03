/**
 * The record of a render that is happening, or was happening when the lights went out.
 *
 * A render of a large world takes hours. In that time the app can be closed, the machine
 * can sleep, the power can go out and a CI job can hit its ceiling. None of that may cost
 * the work already done, and almost none of it has to: **BlueMap already renders
 * incrementally**. It keeps its own bookkeeping under `<map>/rstate/` -
 * `MapTileState`, `MapChunkState` and `MapRegionState`, each a `CellStorage` of small
 * per-region cells - and a plain `-r` re-run consults `TileActionResolver` and renders
 * only what has actually changed. Everything already on disk is skipped.
 *
 * So resuming is not checkpointing. Nothing here snapshots tiles, copies state or invents
 * a format. What is missing from upstream's model is only this: **knowing that a render
 * was left unfinished**, and knowing enough about it to offer it back. A workspace on disk
 * cannot answer that on its own. `render.json` is close, and deliberately not the answer:
 * it is the provenance record, it says which engine produced these tiles, and widening it
 * into a live progress file would mean rewriting the attribution record every ten seconds
 * for the whole of a six hour render.
 *
 * This file is the other half of that pair. It is written the moment a render starts,
 * updated as it goes, and finished when it ends:
 *
 * ```
 * <storageDir>/<renderId>/
 *   render.json     which engine rendered this, and how it ended       (provenance.ts)
 *   session.json    what is running right now, and how far it got      (this file)
 * ```
 *
 * ## Two things worth being precise about
 *
 * **Crash safety.** Every write is staged and renamed, exactly as `consent.ts` does it,
 * so the file is never readable in a half-written state. That matters more here than
 * almost anywhere else: this is the file read by an app that has just come back from a
 * crash, which is precisely the moment a half-written file from *before* the crash would
 * be sitting on disk. A record that will not parse is treated as absent rather than
 * guessed at; the failure mode of guessing is offering somebody a resume of a render
 * whose settings are half read.
 *
 * **How a crash is detected at all.** Not by process id: pids are reused, and a stale one
 * that happens to match some unrelated process would make a dead render look alive
 * forever. Instead each session records the id of the **app instance** that owns it. That
 * id is fresh on every launch, and a render only lives as long as the app that spawned
 * it. So a session still marked `running` whose owner is not this instance is, by
 * construction, a render whose app is gone: the app died, or the machine did. The pid is
 * recorded too, but only as evidence for a support question, never as the test.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { RenderMapRequest } from "./config.js";
import type { RenderTaskProgress } from "./progress.js";
import type { RenderEngineId } from "./provenance.js";

/** Bumped when the shape below changes incompatibly. An older file reads as absent. */
export const RENDER_SESSION_VERSION = 1;

/** The file name inside a render's workspace. Beside `render.json`, never inside it. */
export const RENDER_SESSION_FILE = "session.json";

/**
 * Three states, and only three.
 *
 * `interrupted` covers every way a render can stop without producing a finished map:
 * cancelled by a person, failed, or cut off by a crash. They are not the same event and
 * are not shown as the same event, which is what `RenderInterruptionReason` is for; but
 * they are the same *state*, because the answer to all three is the same offer.
 */
export type RenderSessionStatus = "running" | "completed" | "interrupted";

/**
 * Why a render stopped.
 *
 * `cancelled` is a first-class outcome and must never be reported as an error: somebody
 * pressed Cancel and got what they asked for. It still leaves a resumable render behind,
 * because the tiles that were finished are finished either way.
 */
export type RenderInterruptionReason = "cancelled" | "failed" | "process-gone";

export interface RenderSessionMap {
    readonly id: string;
    readonly world: string;
    readonly dimension: string;
    readonly name: string;
    /**
     * The complete `maps/<id>.conf` body the render was started with, when it had one.
     *
     * Kept because a resume is a re-run: it writes the config again and hands it to the
     * engine again, so a session that remembered only the four fields above would carry
     * on a ninety-key render with a six-key file. The tiles already on disk would then
     * be from one description of the map and the new ones from another - the exact
     * half-and-half outcome `config-changed` exists to prevent, arrived at by the resume
     * itself rather than by anybody editing anything.
     *
     * Absent for a render started without one, which is what every session written
     * before this field existed reads back as, and is the truth about them.
     */
    readonly config?: string;
}

/** The last progress line the engine printed before the session stopped moving. */
export interface RenderSessionProgress {
    /** 0 to 100, with upstream's decimals preserved. */
    readonly percent: number;
    /** Upstream's own wording, e.g. `updating map 'overworld'`. */
    readonly description: string;
    readonly mapId: string | null;
    readonly etaSeconds: number | null;
    readonly at: string;
}

export interface RenderSession {
    readonly sessionVersion: number;
    readonly renderId: string;
    /**
     * Every map in the render, each carrying its own world folder and map id.
     *
     * A list rather than one world path and one map id, because a render takes a list of
     * maps and the CLI is pointed at all of them at once. Storing a single pair and
     * calling it "the" world would be true only for the common case and quietly wrong for
     * the rest, which is the worst kind of record to read after a crash.
     */
    readonly maps: readonly RenderSessionMap[];
    /** `<workspace>/config`, the folder the CLI was pointed at with `-c`. */
    readonly configDir: string;
    /** `<workspace>/web`, the root the tiles and `rstate` live under. */
    readonly outputRoot: string;
    /**
     * A hash of the settings this render was started with.
     *
     * Resuming re-runs the render on top of the tiles already on disk. Doing that with
     * different settings produces a map that is half one thing and half the other, with
     * nothing on screen to say so, so a resume compares this and refuses on a mismatch.
     * See `renderConfigFingerprint` for exactly what is and is not in it.
     */
    readonly configHash: string;
    readonly engine: RenderEngineId;
    readonly engineVersion: string;
    readonly javaVersion: string | null;
    readonly startedAt: string;
    /** Moved forward on every write, so "how long has this been stuck" is answerable. */
    readonly updatedAt: string;
    readonly endedAt: string | null;
    readonly status: RenderSessionStatus;
    readonly reason: RenderInterruptionReason | null;
    /** A failure code or a short sentence, when there is one worth keeping. */
    readonly detail: string | null;
    readonly progress: RenderSessionProgress | null;
    /** The app instance that owns this session. See the note at the top of the file. */
    readonly ownerInstance: string;
    readonly ownerPid: number | null;
    /** Set when somebody declines the resume, so the offer is made once and not forever. */
    readonly dismissed: boolean;
}

/** `<storageDir>/<renderId>/session.json`, absolute. */
export function sessionFile(storageDir: string, renderId: string): string {
    return join(resolve(storageDir, renderId), RENDER_SESSION_FILE);
}

/**
 * The hash a resume is checked against.
 *
 * What goes in is everything that changes what a tile contains: the map ids, the world
 * folders, the dimensions, the display names, the sort order, the start positions and
 * the supplied config body. Change any of those and the tiles already on disk were
 * rendered from a different description of the map than the one about to be rendered on
 * top of them.
 *
 * The config body is in it whole rather than as a summary of the keys this module
 * happens to know. It carries the other ninety-odd settings - lighting, sky colour,
 * render bounds, markers - and every one of them changes what a tile contains, so
 * hashing anything less would let somebody dim the ambient light and resume onto tiles
 * rendered bright.
 *
 * What stays out, deliberately:
 *
 * - **Render threads and metrics.** They change how fast the render goes and whether
 *   upstream is pinged. Neither changes a single byte of a tile, and refusing a resume
 *   over them would be refusing for no reason.
 * - **`-f` and `-e`.** They are arguments to a run, not settings of a map. `-f` is in
 *   fact the opposite of a resume, and a person who passes it is asking for the work to
 *   be redone.
 * - **The engine version.** Recorded in the session and reported with the offer, but not
 *   a refusal: an app update between two halves of a long render is ordinary, and
 *   refusing every resume after every update would make the feature useless. The
 *   interface has the version and can say it changed.
 *
 * Paths are resolved first, and case-folded on the platforms whose file systems are, for
 * the same reason `renderIdForWorld` does it: `C:\World` and `c:\world` are one folder,
 * and treating them as two would refuse a resume that is perfectly safe.
 */
export function renderConfigFingerprint(maps: readonly RenderMapRequest[]): string {
    const canonical = maps.map((map, index) => ({
        id: map.id,
        world: worldKey(map.world),
        name: map.name ?? map.id,
        dimension: map.dimension ?? "minecraft:overworld",
        // `config.ts` defaults `sorting` to the map's position in the list, so the
        // resolved value is what lands in the config file and what belongs in the hash.
        sorting: map.sorting ?? index,
        startPos: map.startPos === undefined ? null : { x: map.startPos.x, z: map.startPos.z },
        config: map.config ?? null,
    }));
    // Sorted by id after resolving, so listing the same maps in a different order does
    // not read as a different config while a genuinely different sort order still does.
    canonical.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    // Version 2 added the config body. The number is bumped rather than left alone
    // because the payload's shape genuinely changed, and a hash whose input shape moved
    // without saying so is a hash nobody can reason about later.
    const payload = JSON.stringify({ fingerprintVersion: 2, maps: canonical });
    return createHash("sha256").update(payload).digest("hex");
}

function worldKey(worldPath: string): string {
    const absolute = resolve(worldPath);
    const caseInsensitive = process.platform === "win32" || process.platform === "darwin";
    return caseInsensitive ? absolute.toLowerCase() : absolute;
}

export interface NewSessionInput {
    readonly renderId: string;
    readonly maps: readonly RenderMapRequest[];
    readonly configDir: string;
    readonly outputRoot: string;
    readonly engine: RenderEngineId;
    readonly engineVersion: string;
    readonly javaVersion: string | null;
    readonly startedAt: string;
    readonly ownerInstance: string;
    readonly ownerPid?: number | null;
}

export function newRenderSession(input: NewSessionInput): RenderSession {
    return {
        sessionVersion: RENDER_SESSION_VERSION,
        renderId: input.renderId,
        maps: input.maps.map((map) => ({
            id: map.id,
            world: map.world,
            dimension: map.dimension ?? "minecraft:overworld",
            name: map.name ?? map.id,
            ...(map.config === undefined ? {} : { config: map.config }),
        })),
        configDir: input.configDir,
        outputRoot: input.outputRoot,
        configHash: renderConfigFingerprint(input.maps),
        engine: input.engine,
        engineVersion: input.engineVersion,
        javaVersion: input.javaVersion,
        startedAt: input.startedAt,
        updatedAt: input.startedAt,
        endedAt: null,
        status: "running",
        reason: null,
        detail: null,
        progress: null,
        ownerInstance: input.ownerInstance,
        ownerPid: input.ownerPid ?? null,
        dismissed: false,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function isStatus(value: string | null): value is RenderSessionStatus {
    return value === "running" || value === "completed" || value === "interrupted";
}

function isReason(value: string | null): value is RenderInterruptionReason {
    return value === "cancelled" || value === "failed" || value === "process-gone";
}

function readMaps(value: unknown): RenderSessionMap[] {
    if (!Array.isArray(value)) return [];
    const maps: RenderSessionMap[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) continue;
        const id = readString(entry.id);
        const world = readString(entry.world);
        if (id === null || world === null) continue;
        const config = readString(entry.config);
        maps.push({
            id,
            world,
            name: readString(entry.name) ?? id,
            dimension: readString(entry.dimension) ?? "minecraft:overworld",
            // Absent rather than empty for a session written before this field existed,
            // which is the truth about it: that render had no config body.
            ...(config === null ? {} : { config }),
        });
    }
    return maps;
}

function readProgress(value: unknown): RenderSessionProgress | null {
    if (!isRecord(value)) return null;
    if (typeof value.percent !== "number" || !Number.isFinite(value.percent)) return null;
    const at = readString(value.at);
    if (at === null) return null;
    return {
        percent: value.percent,
        description: readString(value.description) ?? "",
        mapId: readString(value.mapId),
        etaSeconds:
            typeof value.etaSeconds === "number" && Number.isFinite(value.etaSeconds)
                ? value.etaSeconds
                : null,
        at,
    };
}

/**
 * Reads a session back.
 *
 * A missing, unreadable, truncated or malformed file is **absent**, never a partial
 * answer. This is the read that happens right after a crash, so the half-written file is
 * not a hypothetical: it is the exact thing this is likely to meet. Parsing one leniently
 * would produce a session with a real render id, no config hash and an empty map list,
 * which is worse than nothing because it would be *offered* to somebody.
 *
 * The staged-write below is what makes that case rare; this is what makes it harmless.
 */
export async function readRenderSession(path: string): Promise<RenderSession | null> {
    let raw: string;
    try {
        raw = await readFile(path, "utf8");
    } catch {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    if (parsed.sessionVersion !== RENDER_SESSION_VERSION) return null;

    const renderId = readString(parsed.renderId);
    const configDir = readString(parsed.configDir);
    const outputRoot = readString(parsed.outputRoot);
    const configHash = readString(parsed.configHash);
    const startedAt = readString(parsed.startedAt);
    const ownerInstance = readString(parsed.ownerInstance);
    const status = readString(parsed.status);
    const engine = readString(parsed.engine);
    const maps = readMaps(parsed.maps);

    if (
        renderId === null ||
        configDir === null ||
        outputRoot === null ||
        configHash === null ||
        startedAt === null ||
        ownerInstance === null ||
        !isStatus(status) ||
        (engine !== "upstream-java" && engine !== "typescript") ||
        maps.length === 0
    ) {
        return null;
    }

    const reason = readString(parsed.reason);
    return {
        sessionVersion: RENDER_SESSION_VERSION,
        renderId,
        maps,
        configDir,
        outputRoot,
        configHash,
        engine,
        engineVersion: readString(parsed.engineVersion) ?? "unknown",
        javaVersion: readString(parsed.javaVersion),
        startedAt,
        updatedAt: readString(parsed.updatedAt) ?? startedAt,
        endedAt: readString(parsed.endedAt),
        status,
        reason: isReason(reason) ? reason : null,
        detail: readString(parsed.detail),
        progress: readProgress(parsed.progress),
        ownerInstance,
        ownerPid: typeof parsed.ownerPid === "number" ? parsed.ownerPid : null,
        dismissed: parsed.dismissed === true,
    };
}

/**
 * Writes a session, staged and renamed.
 *
 * The same shape as `writeRenderRecord` and `consent.ts` on purpose: a rename is atomic
 * on every file system this app runs on, so a reader sees either the previous complete
 * file or the new complete file, and never the bytes in between.
 */
export async function writeRenderSession(path: string, session: RenderSession): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const staging = `${path}.writing`;
    await writeFile(staging, `${JSON.stringify(session, null, 4)}\n`, "utf8");
    await rename(staging, path);
}

/**
 * Every session on disk, newest first.
 *
 * A directory walk rather than an index, for the reason `listRenderIds` gives: an index
 * is a second thing that can disagree with the first, and the disagreement always
 * resolves in favour of what is actually there.
 */
export async function listRenderSessions(storageDir: string): Promise<RenderSession[]> {
    let entries;
    try {
        entries = await readdir(storageDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const sessions: RenderSession[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const session = await readRenderSession(sessionFile(storageDir, entry.name));
        if (session !== null) sessions.push(session);
    }
    sessions.sort((left, right) => (left.startedAt < right.startedAt ? 1 : -1));
    return sessions;
}

export interface RenderSessionStoreOptions {
    /**
     * Where renders are written. A function is accepted for the same reason the
     * orchestrator accepts one: the folder can change from the setup step while the app
     * is running, and a value captured at construction would keep writing to the old one.
     */
    readonly storageDir: string | (() => string);
    /** Overridable so a test can pretend to be a previous launch. */
    readonly instanceId?: string;
    readonly now?: () => Date;
    /**
     * How often progress is allowed to reach the disk, in milliseconds.
     *
     * The engine prints progress every ten seconds or so and a long render prints it for
     * hours. Writing every line would be thousands of writes to say roughly the same
     * thing; writing none would mean a crash reports the render as having got nowhere.
     * The default lands between the two, and the last progress before an ending is always
     * written regardless, because that is the number somebody is actually shown.
     */
    readonly progressIntervalMs?: number;
}

const DEFAULT_PROGRESS_INTERVAL_MS = 5_000;

/**
 * The live sessions of one app instance.
 *
 * Holds each running session in memory and mirrors it to disk, so the orchestrator only
 * has to say what happened and never has to think about the file. Every method swallows
 * its own write failures: a session record that cannot be written must not fail the
 * render it describes, for the same reason `saveRecord` does not. Losing the note about
 * where a render got to is a far smaller harm than losing the render.
 */
export class RenderSessionStore {
    private readonly options: RenderSessionStoreOptions;
    private readonly live = new Map<string, RenderSession>();
    private readonly lastProgressWrite = new Map<string, number>();
    /** Fresh on every launch. A session owned by any other value is from a dead app. */
    readonly instanceId: string;

    constructor(options: RenderSessionStoreOptions) {
        this.options = options;
        this.instanceId = options.instanceId ?? randomUUID();
    }

    storageDir(): string {
        const configured = this.options.storageDir;
        return typeof configured === "string" ? configured : configured();
    }

    async start(input: Omit<NewSessionInput, "ownerInstance" | "ownerPid">): Promise<RenderSession> {
        const session = newRenderSession({
            ...input,
            ownerInstance: this.instanceId,
            ownerPid: process.pid,
        });
        this.live.set(session.renderId, session);
        this.lastProgressWrite.set(session.renderId, 0);
        await this.save(session);
        return session;
    }

    /**
     * Records how far the render has got. Throttled; see `progressIntervalMs`.
     *
     * Never awaited by the orchestrator's signal handler, which is why it can never
     * reject: a slow disk must not back up the stream the engine is writing to.
     */
    async progress(renderId: string, task: RenderTaskProgress): Promise<void> {
        const session = this.live.get(renderId);
        if (session === undefined) return;

        const at = this.timestamp();
        const updated: RenderSession = {
            ...session,
            updatedAt: at,
            progress: {
                percent: task.percent,
                description: task.description,
                mapId: task.mapId,
                etaSeconds: task.etaSeconds,
                at,
            },
        };
        this.live.set(renderId, updated);

        const interval = this.options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
        const previous = this.lastProgressWrite.get(renderId) ?? 0;
        const nowMs = Date.parse(at);
        if (Number.isFinite(nowMs) && nowMs - previous < interval) return;
        this.lastProgressWrite.set(renderId, Number.isFinite(nowMs) ? nowMs : previous);
        await this.save(updated);
    }

    /** The render produced a map. Nothing is offered for a completed session. */
    async complete(renderId: string): Promise<void> {
        await this.end(renderId, "completed", null, null);
    }

    /**
     * The render stopped without producing a map, and says why.
     *
     * `cancelled` and `failed` are both interruptions and both leave a resumable render
     * behind. Keeping the reason is what lets the interface say "you cancelled this"
     * rather than showing somebody a crash they did not have.
     */
    async interrupt(
        renderId: string,
        reason: RenderInterruptionReason,
        detail?: string | null,
    ): Promise<void> {
        await this.end(renderId, "interrupted", reason, detail ?? null);
    }

    /** The session for a render id, from memory when it is live and disk otherwise. */
    async read(renderId: string): Promise<RenderSession | null> {
        const live = this.live.get(renderId);
        if (live !== undefined) return live;
        return await readRenderSession(sessionFile(this.storageDir(), renderId));
    }

    /** Every session on disk, with any live one preferred over its saved copy. */
    async list(): Promise<RenderSession[]> {
        const sessions = await listRenderSessions(this.storageDir());
        return sessions.map((session) => this.live.get(session.renderId) ?? session);
    }

    /** True while this instance is the one running that render. */
    isLive(renderId: string): boolean {
        return this.live.has(renderId);
    }

    /** Records that the offer was declined, so it is not made again on every launch. */
    async dismiss(renderId: string): Promise<boolean> {
        const session = await this.read(renderId);
        if (session === null || session.dismissed) return false;
        await this.save({ ...session, dismissed: true, updatedAt: this.timestamp() });
        return true;
    }

    /**
     * Writes a session back exactly as given.
     *
     * Used by the launch-time reconciliation in `resume.ts`, which turns a session left
     * `running` by a dead app instance into an honest `interrupted`.
     */
    async put(session: RenderSession): Promise<void> {
        await this.save(session);
    }

    private async end(
        renderId: string,
        status: RenderSessionStatus,
        reason: RenderInterruptionReason | null,
        detail: string | null,
    ): Promise<void> {
        const session = this.live.get(renderId) ?? (await this.read(renderId));
        if (session === null || session === undefined) return;
        const at = this.timestamp();
        this.live.delete(renderId);
        this.lastProgressWrite.delete(renderId);
        await this.save({ ...session, status, reason, detail, endedAt: at, updatedAt: at });
    }

    private async save(session: RenderSession): Promise<void> {
        try {
            await writeRenderSession(sessionFile(this.storageDir(), session.renderId), session);
        } catch {
            // Deliberately swallowed. See the class comment: the render matters more than
            // the note about it, and the note is the only thing that failed.
        }
    }

    private timestamp(): string {
        return (this.options.now?.() ?? new Date()).toISOString();
    }
}

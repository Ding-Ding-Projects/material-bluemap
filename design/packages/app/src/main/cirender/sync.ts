/**
 * The CI render loop: upload the world, start the workflow, follow it, collect the map.
 *
 * This is the piece that connects five subsystems that already existed and adds no sixth.
 * The world goes up through `backup/` - the same packer, the same splitter, the same
 * append-only release rules, the same public-repository warning. The run is started and
 * watched through `actions.ts`. The map comes back through `download/`'s own transfer and
 * extractor. It is registered through `render/`, so it appears in the map list beside
 * every locally rendered map. The token comes from `github/`, resolved per operation and
 * never held here.
 *
 * ## Honest, which mostly means refusing to guess
 *
 * Four rules, each of them the answer to a way this could lie:
 *
 * - **A run that is still going is reported as still going**, with GitHub's own per-job
 *   statuses. No conclusion is invented for a run that has not reached one.
 * - **A failed run registers nothing.** The failing job is named and the tail of its log
 *   is carried back, because "the render failed" with no evidence is a message somebody
 *   can do nothing with.
 * - **An unchanged world is not uploaded again**, and "unchanged" is checked against the
 *   release actually still being there rather than against a note in a local file.
 * - **Nothing leaves this computer without being said first.** Uploading a world is
 *   uploading a world; a public repository is called PUBLIC, in the words `backup/` already
 *   uses; and Mojang's EULA is never accepted on anybody's behalf.
 *
 * ## Resumable, because `start` reads the record first
 *
 * There is no separate resume entry point. {@link CiRenderSync.sync} loads the sync's
 * record before it does anything, and every durable fact in it - the fingerprint, the
 * release, the run id - lets it skip a step it has already done. Closing the application
 * during a four-hour render and reopening it afterwards therefore carries on: the run is
 * found by its recorded id, its outcome is read, and the map is collected. That is also
 * what makes a retry after a failure cheap.
 *
 * ## Upload progress lives on the backup channel, deliberately
 *
 * The upload is a backup, run by the one {@link BackupSurface} the application owns, and
 * its byte-by-byte progress is already pushed on `backup:event`. Re-emitting it here would
 * be a second progress stream for one transfer, which is two chances to disagree about how
 * far it has got. The sync's own events name the backup id instead, so a surface can show
 * one bar by following the channel that already has it.
 */

import { CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES, inspectBackupSource } from "../backup/index.js";
import type { BackupRequest, BackupResult, FetchLike, RepositoryReport } from "../backup/index.js";
import type { ProjectFile, ProjectMap } from "@material-bluemap/config";
import type { LocalMapHandler } from "../render/LocalMapHandler.js";
import { ActionsCallError, RENDER_WORKFLOW_FILE } from "./actions.js";
import type { RunStatus, WorkflowJob, WorkflowRun } from "./actions.js";
import { nodeProcessRunner } from "./gh.js";
import type { ProcessRunner } from "./gh.js";
import { resolveTransport } from "./transport.js";
import type { CiRoute, CiTransport, RouteReport } from "./transport.js";
import { collectRenderedMap } from "./collect.js";
import { fingerprintWorld, isUnchanged } from "./fingerprint.js";
import type { WorldFingerprint } from "./fingerprint.js";
import { chooseProjectMap, planCiRender, readProjectAt } from "./plan.js";
import type { CiRenderOutput, CiRenderPlan } from "./plan.js";
import {
    ciRenderIdFor,
    ciSyncWorkspace,
    listCiSyncIds,
    newCiSyncState,
    readCiSyncState,
    syncIdFor,
    writeCiSyncState,
} from "./state.js";
import type { CiSyncState } from "./state.js";

/**
 * The largest world this feature will upload, and why there is a ceiling at all.
 *
 * The workflow's `release-asset` source runs `gh release download --pattern`, finds one
 * `.zip` and unzips it. A world large enough for the backup to split into parts therefore
 * cannot be dispatched at all: the parts are named `world.zip.000-<digest>` and there is
 * no `.zip` for the workflow to find. So the archive has to fit in **one** release asset,
 * and GitHub caps an asset at 2 GiB.
 *
 * The check runs before anything is packed, using the source folder's own byte total plus
 * an allowance for the zip's per-entry overhead. It errs towards refusing early, because
 * the alternative is discovering it after an hour of packing and an evening of uploading.
 *
 * The number is the Cheap LFS reader's own ceiling, which is 2 GiB for exactly the same
 * reason: it is what GitHub accepts as one asset.
 */
export const CI_MAX_WORLD_BYTES = CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES;

/** Local and central headers plus a data descriptor, per entry. Deliberately generous. */
const ZIP_ENTRY_OVERHEAD_BYTES = 256;

/**
 * The part size the CI upload asks the backup for.
 *
 * Larger than the backup's own 500 MiB default, on purpose: that default is sized for a
 * laptop uploading over a home connection and splitting is a *feature* there, because a
 * dropped connection costs one part rather than the whole archive. Here a split archive
 * is unusable, so the split point is pushed out to the asset ceiling and the size guard
 * above is what keeps anything larger from being attempted.
 */
export const CI_UPLOAD_PART_SIZE_BYTES = CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES;

export type CiSyncPhase =
    | "checking"
    | "uploading"
    | "dispatching"
    | "waiting"
    | "rendering"
    | "downloading"
    | "registering"
    | "finished";

export interface CiJobReport {
    /** GitHub's own job id, carried so a log can be fetched without guessing at a URL. */
    readonly id: number;
    readonly name: string;
    readonly status: RunStatus;
    readonly conclusion: string | null;
    readonly htmlUrl: string;
    readonly startedAt: string | null;
    readonly completedAt: string | null;
}

/** A run exactly as GitHub describes it. Nothing here is inferred. */
export interface CiRunReport {
    readonly runId: number;
    readonly runNumber: number;
    readonly htmlUrl: string;
    readonly status: RunStatus;
    readonly conclusion: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    /** The commit the workflow ran from. What identifies the renderer that made the map. */
    readonly headSha: string;
    readonly jobs: readonly CiJobReport[];
}

export interface CiSyncFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    readonly status: number | null;
    /** True when signing in again in Settings is the thing that would fix it. */
    readonly needsSignIn: boolean;
    /** True when the Mojang download consent has not been given on this computer. */
    readonly needsEula: boolean;
    /**
     * Which credential was in play, when one had been chosen.
     *
     * Carried on every failure because "permission denied" is unactionable when a machine
     * has two GitHub sign-ins and the message does not say which one was refused.
     */
    readonly route: CiRoute | null;
    /** The run as it stood when this failed, when there was one. */
    readonly run: CiRunReport | null;
    readonly failingJob: string | null;
    readonly logExcerpt: string | null;
}

export interface CiSyncSummary {
    readonly syncId: string;
    readonly repository: string;
    readonly releaseTag: string;
    readonly assetName: string;
    readonly runId: number;
    readonly runUrl: string;
    readonly renderId: string;
    /** What the viewer opens the map with, exactly as a local render's. */
    readonly dataRoot: string;
    readonly mapId: string;
    readonly mapName: string;
    /** Which credential drove it, so a support question has an answer. */
    readonly route: CiRoute;
    /** False when the world was already on GitHub and nothing was uploaded. */
    readonly uploaded: boolean;
    readonly artifactBytes: number;
    readonly artifactSha256: string;
    /** True only when GitHub published a digest for the artifact and it matched. */
    readonly verified: boolean;
}

export type CiSyncEvent =
    | {
          readonly type: "started";
          readonly syncId: string;
          readonly repository: string;
          readonly mapId: string;
          readonly worldFolder: string;
          readonly at: string;
      }
    | { readonly type: "phase"; readonly syncId: string; readonly phase: CiSyncPhase; readonly at: string }
    | {
          readonly type: "log";
          readonly syncId: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    | { readonly type: "run"; readonly syncId: string; readonly run: CiRunReport; readonly at: string }
    | {
          readonly type: "finished";
          readonly syncId: string;
          readonly summary: CiSyncSummary;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly syncId: string; readonly failure: CiSyncFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly syncId: string; readonly at: string };

export interface CiSyncRequest {
    /** The Minecraft world, absolute. Its project file is what the render repeats. */
    readonly worldFolder: string;
    readonly owner: string;
    readonly repo: string;
    /** Which map in the project. Omitted, its first enabled map. */
    readonly mapId?: string | undefined;
    /**
     * Set only once the person has been told, in as many words, that starting this sends
     * their world to GitHub.
     *
     * Absent is a **refusal**, not a prompt, and only when an upload would actually
     * happen: a re-sync of an unchanged world sends nothing, so asking again would be
     * asking for consent to something that is not going to occur.
     */
    readonly acknowledgeUpload?: boolean | undefined;
    /** Set only once the PUBLIC-repository warning has been shown and accepted. */
    readonly acknowledgePublic?: boolean | undefined;
    /** Upload even when the world looks unchanged. The manual override for the detector. */
    readonly forceUpload?: boolean | undefined;
    readonly budgetMinutes?: number | undefined;
    readonly maxJobs?: number | undefined;
    readonly output?: CiRenderOutput | undefined;
    /**
     * Force a credential route rather than letting the probe choose.
     *
     * For somebody who knows which of their two GitHub sign-ins they want - most often
     * because the in-app one works for reading and the `gh` one is the one their
     * organisation has authorised for SSO.
     */
    readonly route?: CiRoute | undefined;
    /**
     * False returns as soon as the run's state has been read once, rather than polling
     * until it ends. The result then carries `outcome: "running"`, which is a true
     * statement about a run in flight and not a failure.
     */
    readonly follow?: boolean | undefined;
}

export type CiSyncResult =
    | {
          readonly ok: true;
          readonly syncId: string;
          readonly outcome: "rendered";
          readonly summary: CiSyncSummary;
          readonly durationMs: number;
      }
    | {
          readonly ok: true;
          readonly syncId: string;
          readonly outcome: "running";
          readonly run: CiRunReport | null;
          readonly state: CiSyncState;
      }
    | { readonly ok: false; readonly syncId: string; readonly failure: CiSyncFailure };

/** What a sync would do, read before anything is packed, uploaded or started. */
export interface CiPreflight {
    readonly syncId: string;
    /**
     * The repository and what publishing to it would mean, from the backup surface.
     *
     * Null when the application's own sign-in could not read it - which is the ordinary
     * case for somebody driving a render entirely through `gh`. `repositoryFailure` says
     * why, and nothing invents a public/private answer in its place.
     */
    readonly repository: RepositoryReport | null;
    readonly repositoryFailure: string | null;
    /**
     * Which credential would drive this sync, and why the other one would not.
     *
     * On the surface before the button, not in the failure afterwards: somebody whose
     * organisation has only authorised `gh` for SSO should see that this is about to run
     * on `gh` rather than discover it from a 403.
     */
    readonly routeReport: RouteReport;
    /** True when Mojang's EULA has been accepted on this computer. Never set from here. */
    readonly eulaAccepted: boolean;
    readonly plan: CiRenderPlan | null;
    readonly planFailure: string | null;
    readonly world: {
        readonly label: string;
        readonly files: number;
        readonly bytes: number;
    } | null;
    readonly worldFailure: string | null;
    /** False when the world's fingerprint matches the one that was last uploaded. */
    readonly worldChanged: boolean;
    /** True when this sync would send the world to GitHub. */
    readonly uploadNeeded: boolean;
    /** The estimated archive size, and whether it is past a release asset's ceiling. */
    readonly estimatedArchiveBytes: number;
    readonly tooLargeToUpload: boolean;
    readonly state: CiSyncState | null;
    /** The recorded run's current state, when there is a recorded run. */
    readonly run: CiRunReport | null;
}

/**
 * The parts of the backup runner a CI render uses.
 *
 * An interface rather than the class, so this module cannot reach for anything else on it
 * and a test can stand one up in six lines. `BackupRunner` satisfies it structurally, and
 * the application passes the one instance it already owns - which is what keeps a single
 * upload with a single progress stream rather than two runners racing for one release tag.
 */
export interface BackupSurface {
    inspectRepository(owner: string, repo: string): Promise<RepositoryReport>;
    backup(request: BackupRequest): Promise<BackupResult>;
    cancel(backupId: string): boolean;
}

export interface CiRenderSyncOptions {
    /** Where maps and sync records live. A function, so a moved folder takes effect. */
    readonly storageDir: () => string;
    /** The signed-in token, resolved per operation. Null means nobody is signed in. */
    readonly token: () => Promise<string | null> | string | null;
    /**
     * Whether Mojang's EULA has been accepted on this computer.
     *
     * A **reader**, never a setter, and that is the whole point of it being here. The
     * workflow accepts the EULA on the repository owner's behalf, which is a real legal
     * acceptance; this module will not make it for somebody by defaulting either way, and
     * refuses with a message pointing at the consent surface that already exists.
     */
    readonly eulaAccepted: () => boolean | Promise<boolean>;
    readonly backup: BackupSurface;
    /**
     * The login the in-app session belongs to, for a message naming which credential ran.
     *
     * A login, never a token: the credential itself is resolved by `token` and never
     * stored, logged or described anywhere in this feature.
     */
    readonly account?: (() => string | null | Promise<string | null>) | undefined;
    /**
     * How `gh` is run. Injected so every test in this folder runs on a machine that does
     * not have it installed - which is the only way "not installed" gets tested at all.
     */
    readonly runner?: ProcessRunner | undefined;
    readonly mounts?: LocalMapHandler | undefined;
    readonly fetch?: FetchLike | undefined;
    readonly onEvent?: ((event: CiSyncEvent) => void) | undefined;
    readonly appVersion?: string | null | undefined;
    readonly apiBase?: string | undefined;
    readonly workflowFile?: string | undefined;
    readonly now?: (() => number) | undefined;
    /** Overridable so a test does not wait. Defaults to a real timer. */
    readonly sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
    /** How often a run in flight is re-read. Fifteen seconds by default. */
    readonly pollIntervalMs?: number | undefined;
    /** How many times the freshly dispatched run is looked for before giving up. */
    readonly runLookupAttempts?: number | undefined;
}

export class CiRenderSync {
    readonly #options: CiRenderSyncOptions;
    readonly #running = new Map<string, AbortController>();

    constructor(options: CiRenderSyncOptions) {
        this.#options = options;
    }

    /** The ids of syncs this process is actively driving right now. */
    activeSyncIds(): string[] {
        return [...this.#running.keys()];
    }

    /**
     * Stops following one.
     *
     * Two things it deliberately does not do, and the message says both.
     *
     * It does **not** cancel the run on GitHub: a run that is already rendering has done
     * work a later `sync` can still collect, and cancelling somebody's Actions run from a
     * desktop application is a larger authority than "stop watching this" reads as.
     *
     * It does **not** stop an upload in flight either. The upload is a backup, owned by
     * the backup surface, and it has its own stop control there with its own progress
     * beside it. Reaching across to abort it from here would be a second way to stop one
     * transfer, and the two would disagree about what "stopped" left on the release.
     */
    cancel(syncId: string): boolean {
        const controller = this.#running.get(syncId);
        if (controller === undefined) return false;
        controller.abort();
        return true;
    }

    /** Every sync this computer has a record of, whether or not it is running. */
    async knownSyncIds(): Promise<string[]> {
        return await listCiSyncIds(this.#options.storageDir());
    }

    /** One sync's record, or null when there is none under that id. */
    async readState(syncId: string): Promise<CiSyncState | null> {
        return await readCiSyncState(ciSyncWorkspace(this.#options.storageDir(), syncId).stateFile);
    }

    /* ---------------------------------------------------------------------- */
    /* Before anything happens                                                */
    /* ---------------------------------------------------------------------- */

    /**
     * Everything a person needs to decide, gathered before a single byte moves.
     *
     * Deliberately the only call that reads the repository for the interface: the warning
     * about a public repository has to arrive *before* the upload, and a warning that
     * arrives after is not a warning. `sync` reads it again and refuses without the
     * acknowledgement, because a guard that lives only in the interface is not a guard.
     */
    async preflight(request: CiSyncRequest): Promise<
        { readonly ok: true; readonly preflight: CiPreflight } | { readonly ok: false; readonly failure: CiSyncFailure }
    > {
        const owner = request.owner.trim();
        const repo = request.repo.trim();
        if (owner === "" || repo === "") {
            return { ok: false, failure: failure("no-repository", "A repository owner and name are required.") };
        }

        // No early refusal for a missing in-app token: `gh` may well be signed in, and
        // finding that out is the whole point of resolving a route before anything else.
        const resolved = await this.#resolveRoute(owner, repo, request);

        // The public/private warning comes from the backup surface and needs the
        // application's own sign-in. When there is none, that is reported as a gap rather
        // than invented from somewhere else: one description of what "PUBLIC" means, in
        // one place, is worth more than a second one that could drift from it.
        let repository: RepositoryReport | null = null;
        let repositoryFailure: string | null = null;
        try {
            repository = await this.#options.backup.inspectRepository(owner, repo);
        } catch (error) {
            repositoryFailure = error instanceof Error ? error.message : String(error);
        }

        const project = await readProjectAt(request.worldFolder);
        let plan: CiRenderPlan | null = null;
        let planFailure: string | null = null;
        if (project.ok) {
            const picked = chooseProjectMap(project.project, request.mapId);
            if (!picked.ok) planFailure = picked.failure.message;
            else {
                const planned = planCiRender({
                    project: project.project,
                    ...(request.mapId === undefined ? {} : { mapId: request.mapId }),
                    releaseTag: "(not uploaded yet)",
                    assetName: "(not uploaded yet)",
                    ...(request.budgetMinutes === undefined ? {} : { budgetMinutes: request.budgetMinutes }),
                    ...(request.maxJobs === undefined ? {} : { maxJobs: request.maxJobs }),
                    ...(request.output === undefined ? {} : { output: request.output }),
                });
                if (planned.ok) plan = planned.plan;
                else planFailure = planned.failure.message;
            }
        } else {
            planFailure = project.failure.message;
        }

        const mapId = plan?.mapId ?? request.mapId ?? "map";
        const syncId = syncIdFor(owner, repo, request.worldFolder, mapId);
        const state = await this.readState(syncId);

        const inspected = await inspectBackupSource("world", request.worldFolder);
        let world: CiPreflight["world"] = null;
        let worldFailure: string | null = null;
        let estimated = 0;
        let changed = true;
        if (inspected.ok) {
            world = {
                label: inspected.source.label,
                files: inspected.source.files,
                bytes: inspected.source.bytes,
            };
            estimated = estimateArchiveBytes(inspected.source.bytes, inspected.source.files);
            const fresh = await fingerprintWorld(request.worldFolder).catch(() => null);
            changed = fresh === null || !isUnchanged(state?.fingerprint ?? null, fresh);
        } else {
            worldFailure = inspected.failure.message;
        }

        let run: CiRunReport | null = null;
        const recordedRun = state?.runId ?? null;
        if (recordedRun !== null && resolved.transport !== null) {
            run = await this.#readRunReport(resolved.transport, owner, repo, recordedRun).catch(() => null);
        }

        return {
            ok: true,
            preflight: {
                syncId,
                repository,
                repositoryFailure,
                routeReport: resolved.report,
                eulaAccepted: await this.#options.eulaAccepted(),
                plan,
                planFailure,
                world,
                worldFailure,
                worldChanged: changed,
                uploadNeeded:
                    changed || request.forceUpload === true || (state?.releaseTag ?? null) === null,
                estimatedArchiveBytes: estimated,
                tooLargeToUpload: estimated >= CI_MAX_WORLD_BYTES,
                state,
                run,
            },
        };
    }

    /**
     * Resolves the credential route for one repository.
     *
     * Kept in one place so `preflight` and `sync` cannot disagree about which credential
     * would be used - a preflight that says "gh" followed by a sync that quietly used the
     * in-app token would make every message about permissions untrustworthy.
     */
    async #resolveRoute(
        owner: string,
        repo: string,
        request: Pick<CiSyncRequest, "route">,
        signal?: AbortSignal,
    ): Promise<{ transport: CiTransport | null; report: RouteReport }> {
        return await resolveTransport({
            owner,
            repo,
            workflowFile: this.#options.workflowFile ?? RENDER_WORKFLOW_FILE,
            token: await this.#token(),
            account: (await this.#options.account?.()) ?? null,
            fetch: this.#fetch(),
            runner: this.#options.runner ?? nodeProcessRunner(),
            ...(signal === undefined ? {} : { signal }),
            ...(this.#options.apiBase === undefined ? {} : { apiBase: this.#options.apiBase }),
            ...(request.route === undefined ? {} : { prefer: request.route }),
        });
    }

    /* ---------------------------------------------------------------------- */
    /* The loop                                                               */
    /* ---------------------------------------------------------------------- */

    /**
     * Runs the whole loop, picking up wherever the record left off.
     *
     * Resolves when it is over, whichever way it went. A refusal is a value, never a
     * rejection, so every caller - the channel included - has exactly one shape to handle.
     */
    async sync(request: CiSyncRequest): Promise<CiSyncResult> {
        const startedAt = this.#clock();
        const owner = request.owner.trim();
        const repo = request.repo.trim();

        if (owner === "" || repo === "") {
            return this.#failed("nowhere", failure("no-repository", "A repository owner and name are required."));
        }

        // Read before anything else that costs money or time. The workflow accepts
        // Mojang's EULA on the repository owner's behalf and cannot render without the
        // client jar it permits downloading; starting a run for somebody who has never
        // been shown that document would be accepting it in their name.
        if (!(await this.#options.eulaAccepted())) {
            return this.#failed(
                "nowhere",
                failure("eula-not-accepted", EULA_MESSAGE, { needsEula: true }),
            );
        }

        const project = await readProjectAt(request.worldFolder);
        if (!project.ok) return this.#failed("nowhere", failure(project.failure.code, project.failure.message));

        const picked = chooseProjectMap(project.project, request.mapId);
        if (!picked.ok) return this.#failed("nowhere", failure(picked.failure.code, picked.failure.message));

        const syncId = syncIdFor(owner, repo, request.worldFolder, picked.map.id);
        if (this.#running.has(syncId)) {
            return this.#failed(
                syncId,
                failure(
                    "already-running",
                    "This world and map are already being synced to that repository. Watch the one " +
                        "in flight rather than starting a second, which would dispatch a second run " +
                        "and make the two impossible to tell apart.",
                ),
            );
        }

        const workspace = ciSyncWorkspace(this.#options.storageDir(), syncId);
        let state =
            (await readCiSyncState(workspace.stateFile)) ??
            newCiSyncState({
                syncId,
                owner,
                repo,
                worldFolder: request.worldFolder,
                mapId: picked.map.id,
                mapName: picked.map.name,
                dimension: picked.map.dimension,
                at: this.#timestamp(),
            });

        const controller = new AbortController();
        this.#running.set(syncId, controller);
        this.emit({
            type: "started",
            syncId,
            repository: `${owner}/${repo}`,
            mapId: picked.map.id,
            worldFolder: request.worldFolder,
            at: this.#timestamp(),
        });

        try {
            // The credential is chosen once, here, and drives every call that follows.
            // Choosing per operation would let a sync dispatch on one sign-in and download
            // on another, which works on a machine where both are authorised and fails
            // halfway through on one where only one is.
            const routed = await this.#resolveRoute(owner, repo, request, controller.signal);
            if (routed.transport === null) {
                return this.#failed(
                    syncId,
                    failure("no-route", routed.report.describe, {
                        needsSignIn: !routed.report.session.signedIn,
                    }),
                );
            }
            this.#log(syncId, "info", routed.report.describe);

            const result = await this.#run({
                request,
                owner,
                repo,
                transport: routed.transport,
                syncId,
                state,
                workspace,
                map: picked.map,
                project: project.project,
                signal: controller.signal,
                startedAt,
            });
            return result;
        } catch (error) {
            if (controller.signal.aborted) {
                state = { ...state, updatedAt: this.#timestamp() };
                await this.#save(workspace.stateFile, state);
                this.emit({ type: "cancelled", syncId, at: this.#timestamp() });
                return this.#failed(syncId, failure("cancelled", CANCELLED_MESSAGE));
            }
            return this.#failed(syncId, fromError(error));
        } finally {
            this.#running.delete(syncId);
        }
    }

    /**
     * One poll of a recorded run, changing nothing.
     *
     * The cheap "is it done yet" for a surface that does not want to hold a following
     * call open. It never downloads and never registers a map: collecting is `sync`'s job,
     * so a person always knows which button caused a map to appear.
     */
    async check(syncId: string): Promise<CiSyncResult> {
        const state = await this.readState(syncId);
        if (state === null) {
            return this.#failed(syncId, failure("no-such-sync", `There is no CI render recorded under ${syncId}.`));
        }
        if (state.runId === null) {
            return { ok: true, syncId, outcome: "running", run: null, state };
        }

        const routed = await this.#resolveRoute(state.owner, state.repo, {});
        if (routed.transport === null) {
            return this.#failed(
                syncId,
                failure("no-route", routed.report.describe, {
                    needsSignIn: !routed.report.session.signedIn,
                }),
            );
        }

        try {
            const run = await this.#readRunReport(routed.transport, state.owner, state.repo, state.runId);
            this.emit({ type: "run", syncId, run, at: this.#timestamp() });
            return { ok: true, syncId, outcome: "running", run, state };
        } catch (error) {
            return this.#failed(syncId, fromError(error, routed.transport.route));
        }
    }

    /** Forgets a sync's record. The map it produced, if any, is left exactly where it is. */
    async forget(syncId: string): Promise<boolean> {
        const workspace = ciSyncWorkspace(this.#options.storageDir(), syncId);
        const state = await readCiSyncState(workspace.stateFile);
        if (state === null) return false;
        await writeCiSyncState(workspace.stateFile, {
            ...newCiSyncState({
                syncId,
                owner: state.owner,
                repo: state.repo,
                worldFolder: state.worldFolder,
                mapId: state.mapId,
                mapName: state.mapName,
                dimension: state.dimension,
                at: this.#timestamp(),
            }),
        });
        return true;
    }

    /* ---------------------------------------------------------------------- */

    async #run(context: {
        request: CiSyncRequest;
        owner: string;
        repo: string;
        transport: CiTransport;
        syncId: string;
        state: CiSyncState;
        workspace: ReturnType<typeof ciSyncWorkspace>;
        map: ProjectMap;
        project: ProjectFile;
        signal: AbortSignal;
        startedAt: number;
    }): Promise<CiSyncResult> {
        const { owner, repo, syncId, workspace, signal, transport } = context;
        const route = transport.route;
        let state = context.state;

        /* -- what leaves this computer, said before it does ----------------- */

        this.#phase(syncId, "checking");

        // The application's own sign-in is what can read a repository's visibility, and
        // what the PUBLIC warning is worded by. A `gh`-only machine has no such reading,
        // which is survivable *only* because a `gh`-only machine also cannot upload: the
        // guard below refuses an upload outright, so nothing is published unwarned.
        let repository: RepositoryReport | null = null;
        let repositoryFailure: string | null = null;
        try {
            repository = await this.#options.backup.inspectRepository(owner, repo);
        } catch (error) {
            repositoryFailure = error instanceof Error ? error.message : String(error);
        }

        if (repository !== null && !repository.canWrite) {
            return this.#failed(
                syncId,
                failure(
                    "read-only",
                    `The signed-in account cannot write to ${repository.fullName}, so it cannot ` +
                        "publish the world there or start a workflow on it. Nothing was uploaded.",
                    { route },
                ),
            );
        }

        if (repository !== null && !repository.private && context.request.acknowledgePublic !== true) {
            return this.#failed(
                syncId,
                failure(
                    "public-not-acknowledged",
                    // The warning itself comes from `backup/`, word for word. One
                    // description of what a public repository means, in one place.
                    `${repository.fullName} is a PUBLIC repository. ` +
                        (repository.warning?.message ?? "") +
                        " Nothing was uploaded and no render was started: confirm that you mean to " +
                        "publish this world, or choose a private repository instead.",
                    { route },
                ),
            );
        }

        const inspected = await inspectBackupSource("world", context.request.worldFolder, signal);
        if (!inspected.ok) {
            return this.#failed(syncId, failure(inspected.failure.code, inspected.failure.message, { route }));
        }
        const source = inspected.source;

        /* -- has it changed? ------------------------------------------------ */

        let fresh: WorldFingerprint | null = null;
        try {
            fresh = await fingerprintWorld(context.request.worldFolder, signal);
        } catch (error) {
            return this.#failed(syncId, fromError(error, route));
        }

        /*
         * The local record says what *was* uploaded; only GitHub can say what is still
         * there. A release deleted by hand - to reclaim storage, or by somebody tidying -
         * would otherwise have a re-sync skip the upload and dispatch a run whose first
         * step cannot find the world, failing minutes later with a message about the
         * workflow. The transport answers false for anything it could not read, so a
         * network problem costs an upload rather than a wasted run.
         */
        const reusable =
            context.request.forceUpload !== true &&
            isUnchanged(state.fingerprint, fresh) &&
            state.releaseTag !== null &&
            state.assetName !== null &&
            (await transport.releaseHasAsset(owner, repo, state.releaseTag, state.assetName));

        /* -- upload, or say why it was skipped ------------------------------ */

        let uploaded = false;
        if (reusable) {
            this.#log(
                syncId,
                "info",
                `The world has not changed since it was uploaded as ${String(state.assetName)} on ` +
                    `${String(state.releaseTag)}, and that release still holds it, so nothing was ` +
                    "uploaded again.",
            );
        } else {
            // The upload is the backup surface, which speaks to GitHub with the
            // application's own sign-in. `gh` cannot stand in for it without becoming a
            // second uploader with its own release rules, so this refuses with the real
            // reason rather than failing somewhere inside a packer.
            if (!transport.canUpload || repository === null) {
                return this.#failed(
                    syncId,
                    failure(
                        "upload-needs-app-sign-in",
                        "This world has to be uploaded before GitHub can render it, and an upload " +
                            "goes through this application's own GitHub sign-in - the same machinery " +
                            "that makes a backup, with its checksummed parts and its release rules. " +
                            `The ${transport.route === "gh" ? "gh command-line tool" : "current route"} ` +
                            "can start and follow a render, but not publish a world. Sign in to GitHub " +
                            "in Settings and try again; a world that is already published renders " +
                            `without this step.${repositoryFailure === null ? "" : ` (${repositoryFailure})`}`,
                        { route, needsSignIn: true },
                    ),
                );
            }

            if (context.request.acknowledgeUpload !== true) {
                return this.#failed(
                    syncId,
                    failure("upload-not-acknowledged", uploadConsentMessage(repository.fullName, source.bytes), {
                        route,
                    }),
                );
            }

            const estimated = estimateArchiveBytes(source.bytes, source.files);
            if (estimated >= CI_MAX_WORLD_BYTES) {
                return this.#failed(
                    syncId,
                    failure(
                        "world-too-large",
                        `${source.label} packs to roughly ${describeBytes(estimated)}, and a GitHub ` +
                            `release asset stops at ${describeBytes(CI_MAX_WORLD_BYTES)}. The render ` +
                            "workflow fetches one zip from a release, so a world that has to be split " +
                            "into several assets cannot be dispatched at all. Nothing was packed. " +
                            "Render this world on this computer, or render one dimension at a time.",
                        { route },
                    ),
                );
            }

            this.#phase(syncId, "uploading");
            const backupRequest: BackupRequest = {
                kind: "world",
                folder: context.request.worldFolder,
                owner,
                repo,
                partSize: CI_UPLOAD_PART_SIZE_BYTES,
                ...(context.request.acknowledgePublic === undefined
                    ? {}
                    : { acknowledgePublic: context.request.acknowledgePublic }),
            };
            const result = await this.#options.backup.backup(backupRequest);
            if (!result.ok) {
                state = {
                    ...state,
                    stage: "failed",
                    failureCode: result.failure.code,
                    failureMessage: result.failure.message,
                    updatedAt: this.#timestamp(),
                };
                await this.#save(workspace.stateFile, state);
                return this.#failed(
                    syncId,
                    failure(result.failure.code, result.failure.message, {
                        detail: result.failure.detail,
                        status: result.failure.status,
                        needsSignIn: result.failure.needsSignIn,
                        route,
                    }),
                );
            }

            // The guard above should have caught this, and this is the belt to its
            // braces. A split archive on the release would dispatch a run that downloads
            // no zip and fails in the workflow's fetch step, minutes later, with a
            // message about the workflow rather than about the world.
            if (result.summary.parts !== 1) {
                return this.#failed(
                    syncId,
                    failure(
                        "world-split-into-parts",
                        `The world was uploaded as ${String(result.summary.parts)} parts, and the ` +
                            "render workflow reads a single zip from a release. The upload is on " +
                            `${result.summary.tag} and is a perfectly good backup; it just cannot be ` +
                            "rendered by GitHub. Render this world on this computer instead.",
                        { route },
                    ),
                );
            }

            uploaded = true;
            state = {
                ...state,
                fingerprint: fresh.digest,
                releaseTag: result.summary.tag,
                assetName: result.summary.archive,
                archiveBytes: result.summary.bytes,
                archiveSha256: result.summary.sha256,
                stage: "uploaded",
                // A fresh upload is a fresh world, so the run that rendered the old one is
                // no longer this sync's run. Keeping it would have `check` report a green
                // run for a world that is no longer what is on GitHub.
                runId: null,
                runNumber: null,
                runUrl: null,
                failureCode: null,
                failureMessage: null,
                updatedAt: this.#timestamp(),
            };
            await this.#save(workspace.stateFile, state);
        }

        const releaseTag = state.releaseTag;
        const assetName = state.assetName;
        if (releaseTag === null || assetName === null) {
            return this.#failed(
                syncId,
                failure(
                    "nothing-uploaded",
                    "There is no uploaded world to render: nothing was published and no earlier " +
                        "upload could be reused.",
                    { route },
                ),
            );
        }

        /* -- start the run, or pick up the one already recorded -------------- */

        const planned = planCiRender({
            project: context.project,
            mapId: context.map.id,
            releaseTag,
            assetName,
            ...(context.request.budgetMinutes === undefined ? {} : { budgetMinutes: context.request.budgetMinutes }),
            ...(context.request.maxJobs === undefined ? {} : { maxJobs: context.request.maxJobs }),
            ...(context.request.output === undefined ? {} : { output: context.request.output }),
        });
        if (!planned.ok) {
            return this.#failed(syncId, failure(planned.failure.code, planned.failure.message, { route }));
        }

        if (planned.plan.notCarried.length > 0) {
            this.#log(
                syncId,
                "warning",
                `The workflow has no input for the map's own settings, so ${planned.plan.notCarried.join(", ")} ` +
                    "will not be applied to this render. It uses BlueMap's defaults for them.",
            );
        }

        const workflowFile = this.#options.workflowFile ?? RENDER_WORKFLOW_FILE;
        let runId = state.runId;

        if (runId === null) {
            this.#phase(syncId, "dispatching");
            const ref = await transport.readDefaultBranch(owner, repo);
            const dispatchedAt = new Date(this.#clock());
            await transport.dispatchWorkflow(owner, repo, workflowFile, ref, planned.plan.inputs);
            this.#log(syncId, "info", `Started ${workflowFile} on ${owner}/${repo} against ${ref}.`);
            state = { ...state, stage: "dispatched", dispatchedAt: dispatchedAt.toISOString(), updatedAt: this.#timestamp() };
            await this.#save(workspace.stateFile, state);

            this.#phase(syncId, "waiting");
            const found = await this.#awaitRun(transport, owner, repo, workflowFile, dispatchedAt, signal);
            if (found === null) {
                return this.#failed(
                    syncId,
                    failure(
                        "run-not-found",
                        `GitHub accepted the request to start ${workflowFile} but has not listed a run ` +
                            "for it yet, so there is nothing to follow. The workflow may well be about " +
                            "to start: nothing here failed, and this call simply stopped waiting. " +
                            `Check ${owner}/${repo} in the Actions tab, and press sync again to pick ` +
                            "the run up.",
                        { route },
                    ),
                );
            }
            runId = found.id;
            state = {
                ...state,
                runId: found.id,
                runNumber: found.runNumber,
                runUrl: found.htmlUrl,
                updatedAt: this.#timestamp(),
            };
            await this.#save(workspace.stateFile, state);
        } else {
            this.#log(syncId, "info", `Carrying on with run ${String(runId)}, which this world was already sent to.`);
        }

        /* -- follow it, honestly -------------------------------------------- */

        this.#phase(syncId, "rendering");
        let report = await this.#readRunReport(transport, owner, repo, runId);
        this.emit({ type: "run", syncId, run: report, at: this.#timestamp() });

        while (report.status !== "completed") {
            if (context.request.follow === false) {
                state = { ...state, stage: "dispatched", updatedAt: this.#timestamp() };
                await this.#save(workspace.stateFile, state);
                return { ok: true, syncId, outcome: "running", run: report, state };
            }
            signal.throwIfAborted();
            await this.#sleep(this.#options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, signal);
            report = await this.#readRunReport(transport, owner, repo, runId);
            this.emit({ type: "run", syncId, run: report, at: this.#timestamp() });
        }

        if (report.conclusion !== "success") {
            const failing = firstUnsuccessfulJob(report.jobs);
            const excerpt =
                failing === null || failing.id <= 0
                    ? null
                    : await transport.readJobLogTail(owner, repo, failing.id);
            state = {
                ...state,
                stage: report.conclusion === "cancelled" ? "cancelled" : "failed",
                failureCode: `run-${report.conclusion ?? "unknown"}`,
                failureMessage: `Run ${String(runId)} ended as ${report.conclusion ?? "an unrecognised state"}.`,
                updatedAt: this.#timestamp(),
            };
            await this.#save(workspace.stateFile, state);
            // Nothing is downloaded and nothing is mounted. A map from a failed run would
            // be a partial map presented as a finished one, which is the failure this
            // whole feature is least able to survive.
            return this.#failed(
                syncId,
                failure(
                    `run-${report.conclusion ?? "unknown"}`,
                    `The render on GitHub ended as ${report.conclusion ?? "an unrecognised state"}` +
                        (failing === null ? "" : `, in the job "${failing.name}"`) +
                        ". No map was downloaded and nothing was added to the map list. The run is at " +
                        `${report.htmlUrl}.`,
                    {
                        route,
                        run: report,
                        failingJob: failing?.name ?? null,
                        logExcerpt: excerpt,
                        detail: report.htmlUrl,
                    },
                ),
            );
        }

        /* -- collect and register -------------------------------------------- */

        this.#phase(syncId, "downloading");
        const renderId = ciRenderIdFor(syncId);
        const collected = await collectRenderedMap(owner, repo, runId, {
            transport,
            signal,
            storageDir: this.#options.storageDir(),
            artifactFile: workspace.artifactFile,
            renderId,
            mapId: context.map.id,
            mapName: context.map.name,
            dimension: context.map.dimension,
            worldFolder: context.request.worldFolder,
            headSha: report.headSha,
            repository: `${owner}/${repo}`,
            ...(this.#options.mounts === undefined ? {} : { mounts: this.#options.mounts }),
            ...(this.#options.appVersion === undefined ? {} : { appVersion: this.#options.appVersion }),
            startedAt: report.createdAt,
        });

        if (!collected.ok) {
            state = {
                ...state,
                stage: "failed",
                failureCode: collected.failure.code,
                failureMessage: collected.failure.message,
                updatedAt: this.#timestamp(),
            };
            await this.#save(workspace.stateFile, state);
            return this.#failed(
                syncId,
                failure(collected.failure.code, collected.failure.message, {
                    route,
                    run: report,
                    detail: report.htmlUrl,
                }),
            );
        }

        this.#phase(syncId, "registering");
        if (!collected.verified) {
            this.#log(
                syncId,
                "info",
                "GitHub published no checksum for this artifact, so its SHA-256 was recorded rather " +
                    `than verified: ${collected.sha256}.`,
            );
        }

        state = {
            ...state,
            stage: "rendered",
            renderId: collected.renderId,
            artifactSha256: collected.sha256,
            failureCode: null,
            failureMessage: null,
            updatedAt: this.#timestamp(),
        };
        await this.#save(workspace.stateFile, state);

        this.#phase(syncId, "finished");
        const summary: CiSyncSummary = {
            syncId,
            repository: `${owner}/${repo}`,
            releaseTag,
            assetName,
            runId,
            runUrl: report.htmlUrl,
            renderId: collected.renderId,
            dataRoot: collected.dataRoot,
            mapId: context.map.id,
            mapName: context.map.name,
            route,
            uploaded,
            artifactBytes: collected.bytes,
            artifactSha256: collected.sha256,
            verified: collected.verified,
        };
        const durationMs = this.#clock() - context.startedAt;
        this.emit({ type: "finished", syncId, summary, durationMs, at: this.#timestamp() });
        return { ok: true, syncId, outcome: "rendered", summary, durationMs };
    }

    /** Looks for the run a dispatch produced, a few times, with a wait between. */
    async #awaitRun(
        transport: CiTransport,
        owner: string,
        repo: string,
        workflowFile: string,
        since: Date,
        signal: AbortSignal,
    ): Promise<WorkflowRun | null> {
        const attempts = Math.max(1, this.#options.runLookupAttempts ?? DEFAULT_RUN_LOOKUP_ATTEMPTS);
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            signal.throwIfAborted();
            const found = await transport.findDispatchedRun(owner, repo, workflowFile, since);
            if (found !== null) return found;
            await this.#sleep(RUN_LOOKUP_INTERVAL_MS, signal);
        }
        return null;
    }

    async #readRunReport(
        transport: CiTransport,
        owner: string,
        repo: string,
        runId: number,
    ): Promise<CiRunReport> {
        const run = await transport.readRun(owner, repo, runId);
        const jobs = await transport.readRunJobs(owner, repo, runId);
        return {
            runId: run.id,
            runNumber: run.runNumber,
            htmlUrl: run.htmlUrl,
            status: run.status,
            conclusion: run.conclusion,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
            headSha: run.headSha,
            jobs: jobs.map((job: WorkflowJob) => ({
                id: job.id,
                name: job.name,
                status: job.status,
                conclusion: job.conclusion,
                htmlUrl: job.htmlUrl,
                startedAt: job.startedAt,
                completedAt: job.completedAt,
            })),
        };
    }

    async #save(path: string, state: CiSyncState): Promise<void> {
        try {
            await writeCiSyncState(path, state);
        } catch {
            // A record that cannot be written must never fail the sync that produced it.
            // Losing the note costs a resume; losing the render costs the render.
        }
    }

    #fetch(): FetchLike {
        return this.#options.fetch ?? ((url, init) => fetch(url, init));
    }

    async #token(): Promise<string | null> {
        const value = await this.#options.token();
        return typeof value === "string" && value.length > 0 ? value : null;
    }

    async #sleep(ms: number, signal?: AbortSignal): Promise<void> {
        if (this.#options.sleep !== undefined) {
            await this.#options.sleep(ms, signal);
            return;
        }
        await new Promise<void>((done, fail) => {
            const timer = setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                done();
            }, ms);
            const onAbort = (): void => {
                clearTimeout(timer);
                fail(signal?.reason ?? new Error("aborted"));
            };
            signal?.addEventListener("abort", onAbort, { once: true });
        });
    }

    #phase(syncId: string, phase: CiSyncPhase): void {
        this.emit({ type: "phase", syncId, phase, at: this.#timestamp() });
    }

    #log(syncId: string, level: "info" | "warning" | "error", message: string): void {
        this.emit({ type: "log", syncId, level, message, at: this.#timestamp() });
    }

    #failed(syncId: string, value: CiSyncFailure): { ok: false; syncId: string; failure: CiSyncFailure } {
        this.emit({ type: "failed", syncId, failure: value, at: this.#timestamp() });
        return { ok: false, syncId, failure: value };
    }

    protected emit(event: CiSyncEvent): void {
        this.#options.onEvent?.(event);
    }

    #clock(): number {
        return (this.#options.now ?? Date.now)();
    }

    #timestamp(): string {
        return new Date(this.#clock()).toISOString();
    }
}

/* -------------------------------------------------------------------------- */

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const RUN_LOOKUP_INTERVAL_MS = 3_000;
/** Six tries at three seconds: GitHub usually lists a dispatched run within one. */
const DEFAULT_RUN_LOOKUP_ATTEMPTS = 6;

/*
 * There is deliberately no "nobody is signed in" constant here any more.
 *
 * A missing in-app sign-in is no longer the end of the story: `gh` may well be signed in,
 * and the route resolver's own message names both credentials and what each of them would
 * need. A single canned sentence about one of the two would have been wrong for exactly
 * the person this fallback exists for.
 */

/**
 * Why the EULA is a refusal rather than a tick box on this screen.
 *
 * The consent already exists, it is asked once at first run, and it is stored. Asking
 * again here would be a second place the answer lives and a second document somebody
 * clicks past. The message points at the setting instead.
 */
const EULA_MESSAGE =
    "Mojang's End User Licence Agreement has not been accepted on this computer, and the render" +
    " workflow accepts it on the repository owner's behalf in order to download the Minecraft" +
    " client jar it needs for block models and textures. This application will not accept it for" +
    " you. Accept it in Settings, under the Mojang download consent, and start the sync again.";

const CANCELLED_MESSAGE =
    "The sync was stopped. Anything already uploaded is kept, and a run already started on GitHub" +
    " carries on there - stopping here stops watching it, not the render. Sync again to pick it up.";

/** The sentence somebody reads before their world leaves this computer. */
function uploadConsentMessage(repository: string, bytes: number): string {
    return (
        `Starting this will upload the whole world - ${describeBytes(bytes)} of region files, ` +
        `player data and everything else in the folder - to ${repository} on GitHub, as a release ` +
        "asset, so that GitHub's runners can render it. Nothing was uploaded: confirm that you " +
        "mean to send it."
    );
}

function estimateArchiveBytes(sourceBytes: number, files: number): number {
    // The archive stores rather than deflates, so its size is the content plus per-entry
    // headers. Deliberately an over-estimate: erring high refuses a borderline world
    // before it is packed, and erring low would discover the problem after the pack.
    return sourceBytes + files * ZIP_ENTRY_OVERHEAD_BYTES;
}

/** Three significant figures, the same shape the download and backup surfaces use. */
function describeBytes(bytes: number): string {
    const units = ["bytes", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit += 1;
    }
    const rendered = unit === 0 ? String(Math.round(value)) : value.toFixed(value < 10 ? 1 : 0);
    return `${rendered} ${units[unit] ?? "bytes"}`;
}

/**
 * The job worth naming when a run failed.
 *
 * `failure` first, because that is the one that says what broke. A `cancelled` or
 * `timed_out` job is reported only when nothing actually failed, since a cancellation
 * cascades - one failing shard cancels its siblings, and naming a cancelled sibling would
 * send somebody to a log that only says it was cancelled.
 */
export function firstUnsuccessfulJob(jobs: readonly CiJobReport[]): CiJobReport | null {
    const failed = jobs.find((job) => job.conclusion === "failure");
    if (failed !== undefined) return failed;
    return (
        jobs.find(
            (job) =>
                job.conclusion !== null && job.conclusion !== "success" && job.conclusion !== "skipped",
        ) ?? null
    );
}

function failure(
    code: string,
    message: string,
    extra: Partial<Omit<CiSyncFailure, "code" | "message">> = {},
): CiSyncFailure {
    return {
        code,
        message,
        detail: extra.detail ?? null,
        status: extra.status ?? null,
        needsSignIn: extra.needsSignIn ?? false,
        needsEula: extra.needsEula ?? false,
        route: extra.route ?? null,
        run: extra.run ?? null,
        failingJob: extra.failingJob ?? null,
        logExcerpt: extra.logExcerpt ?? null,
    };
}

/** Every thrown thing turned into one sentence, with the GitHub status when there was one. */
function fromError(error: unknown, route: CiRoute | null = null): CiSyncFailure {
    if (error instanceof ActionsCallError) {
        return failure(error.status === 401 ? "signed-out" : `github-${String(error.status)}`, error.message, {
            detail: error.url === "" ? null : error.url,
            status: error.status,
            // A 403 on the `gh` route is very often an organisation that has not
            // authorised that credential for SSO rather than a missing scope, so signing
            // in to the application again would not help and is not offered.
            needsSignIn: route !== "gh" && (error.status === 401 || error.status === 403),
            route,
        });
    }
    return failure("failed", error instanceof Error ? error.message : String(error), { route });
}

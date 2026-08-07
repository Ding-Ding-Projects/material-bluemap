/**
 * Recognising a repository this application already prepared, on a computer that has
 * never touched it - and turning that recognition into a local project without ever
 * pretending machine-specific state crossed over with it.
 *
 * ## The scenario this exists for
 *
 * Somebody sets up CI rendering on one computer, then installs the app on a second one.
 * The new install has no local state at all: no sync record, no world folder, no project.
 * Signing in to GitHub there shows every repository the account can write to - which, for
 * somebody with more than a handful, is a list where the one they actually prepared is not
 * obviously the one on top. Picking wrong, or spending ten minutes re-answering the wizard
 * for a repository that already carries the real settings, is the failure this closes.
 *
 * ## What "prepared" means, and how little that promises
 *
 * `WorldRepoHost.readRepository()` already answers the one honest question this needs: does
 * a given branch of a given repository carry {@link WORLD_REPO_MARKER_FILE}, this
 * application's own file, naming its own tool string. That function is reused here rather
 * than re-implemented, so the marker check a sync performs before touching a branch and the
 * marker check this module performs before offering to adopt one can never quietly drift
 * apart on what counts as "ours".
 *
 * A marker found is still only ever described as *looking like* a match, never as a
 * certainty - the same discipline `remote/browse.ts` holds its own "is this a Minecraft
 * world" signal to. A `tool` string matching is real evidence, stronger than the partial
 * `level.dat`-without-a-region-folder signal that module reports honestly rather than
 * upgrading to certainty, but it is still a claim read out of a file's own bytes, not a
 * proof that this is the repository the person sitting at this computer means. See
 * {@link describeAdoptionSignal}'s wording for exactly how each state is worded.
 *
 * ## Two markers, because two different things get prepared
 *
 * `cirender/bootstrap.ts` writes a second, separate marker - {@link CI_BOOTSTRAP_MARKER_FILE}
 * - at a repository's root on its *default* branch, recording which files its own bootstrap
 * committed (chiefly `.github/workflows/render-world.yml`) so the ordinary "Render on
 * GitHub" archive-upload flow has something to dispatch. `WORLD_REPO_MARKER_FILE` marks a
 * different, optional thing entirely: an incrementally-synced copy of the *world itself*,
 * kept on a `world` branch, which is where a project's settings file
 * ({@link PROJECT_FILE_NAME}) actually travels, because it lives at the root of the world
 * folder that branch carries.
 *
 * A repository can carry either marker, both, or neither, and this module checks for both -
 * see {@link probeAdoptionCandidates} and {@link buildAdoptionPlan}. The distinction matters
 * to what adoption can honestly promise: a repository bootstrapped only for CI rendering
 * *is* recognisably this application's, but carries no project settings to restore, because
 * the ordinary render flow never stores them there - they lived only on the old computer's
 * local project file. A repository that also carries a world-repo marker is the one that can
 * restore maps, storages and render options, because those travelled inside the synced world
 * tree the whole time.
 *
 * ## What actually crosses the wire, and what deliberately does not
 *
 * `WorldRepoMarker` is `{ tool, version, branch, updatedAt }` and `CiBootstrapMarker` is
 * `{ tool, version, templateVersion, files, preparedAt }` - no path, no username, no host,
 * nothing machine-specific in either, because both live inside a tree that may sit in a
 * public repository (`repo.ts`'s own doc comment says as much for the identical Pages marker
 * both are modelled on). The project file this module reads alongside the world-repo marker
 * ({@link PROJECT_FILE_NAME}, `@worldlens/config`'s own schema) was designed the same
 * way for the same reason: `project.ts`'s doc comment states outright that the world path is
 * "deliberately" left out, because "storing it as well would create a second source of truth
 * that goes wrong the moment somebody moves or copies the folder". Adoption leans on exactly
 * that design rather than working around it - see "What is never adopted" below.
 *
 * Two fields the schema does still permit are absolute paths on the *old* computer, and
 * both are actively dangerous to restore silently rather than merely unhelpful: a map's
 * `world` field, when it names a different world by an absolute path rather than "the world
 * this project lives in"; and `render.outputFolder`. Neither is stripped from the restored
 * project - the settings themselves are not wrong, only unusable here - but both are named
 * in {@link AdoptionPlan.needsAttention} exactly like the world folder itself, because an
 * absolute path from another computer is exactly as machine-specific as the folder is, and
 * silently keeping it would mean a first render either fails against a path that does not
 * exist here or, worse, succeeds by writing into a folder that exists for an unrelated
 * reason.
 *
 * ## What is never adopted, and why each one is named rather than guessed
 *
 * - **The Minecraft world folder itself.** It is never in the project file to begin with
 *   (see above), so there is nothing to silently get wrong here - but a plan that said
 *   nothing about it would still read as "this is fully restored", which it is not. Every
 *   successful plan names it.
 * - **Local dependencies** - a Java runtime, Docker's availability, anything this build
 *   provisions or detects on the machine it runs on. None of that is repository state.
 * - **Remote host or SSH configuration.** Tied to keys that belong to the old computer and
 *   were never written anywhere this module reads.
 *
 * ## What this module never does
 *
 * It never writes to the repository - every call here is a read (`GET`), and the marker and
 * project file it reads are exactly the bytes a sync already pushed; adopting a repository
 * changes nothing about it. It never overwrites a local project already bound to the same
 * repository: {@link buildAdoptionPlan} cross-checks `WorldRepoHost.records()`, which is
 * this computer's own memory of what it has already synced, and reports the existing local
 * `worldPath` rather than proposing a second, duplicate binding to the same remote target.
 */

import {
    PROJECT_FILE_NAME,
    PROJECT_FORMAT_VERSION,
    parseProjectFile,
    type ProjectFile,
    type ProjectReadFailure,
} from "@worldlens/config";
import { ActionsCallError } from "../cirender/actions.js";
import { CI_BOOTSTRAP_MARKER_FILE, CI_BOOTSTRAP_MARKER_TOOL, CI_BOOTSTRAP_MARKER_VERSION } from "../cirender/bootstrap.js";
import type { CiBootstrapMarker } from "../cirender/bootstrap.js";
import { ghApiJson } from "../cirender/gh.js";
import type { ProcessRunner } from "../cirender/gh.js";
import {
    WORLD_REPO_MARKER_FILE,
    WORLD_REPO_MARKER_VERSION,
    normaliseBranch,
    type WorldRepoHost,
    type WorldRepoMarker,
    type WorldRepoRepositoryReport,
} from "./repo.js";

/* -------------------------------------------------------------------------------------- */
/* Recognising a candidate in a list                                                       */
/* -------------------------------------------------------------------------------------- */

export type AdoptionSignalStatus =
    /** The marker was found and this build understands its version fully. */
    | "prepared"
    /** The marker was found, written by a version newer than this one. Still likely ours. */
    | "prepared-newer-version"
    /** Checked, and no marker was found on the branch this looks at. */
    | "not-prepared"
    /** Never asked - past the bound on how many repositories one list check reads. */
    | "not-checked"
    /** Asked, and the network, the account, or GitHub itself would not say either way. */
    | "unknown";

/**
 * What is known about whether one repository is one this application prepared.
 *
 * Never a bare boolean, for the same reason {@link WorldRepoRepositoryReport} and
 * `RemoteWorldSignal` (`remote/browse.ts`) are not: a caller - and the person reading the
 * repository picker - has to be able to tell "checked, and no" apart from "never checked"
 * apart from "checked, but the network would not say". Folding any of those into a plain
 * false is exactly the guess this application's own conventions refuse to make.
 */
export interface AdoptionSignal {
    readonly fullName: string;
    /** The world-repo branch this signal checked. */
    readonly branch: string;
    readonly status: AdoptionSignalStatus;
    /** The world-repo marker, when found - the one whose branch also carries a project. */
    readonly marker: WorldRepoMarker | null;
    /** The CI-bootstrap marker, when found - recognised, but with nothing to restore. */
    readonly bootstrapMarker: CiBootstrapMarker | null;
    /** One sentence, hedged with "looks like" rather than asserted as certain. */
    readonly message: string;
}

/** What checking one repository for {@link CI_BOOTSTRAP_MARKER_FILE} found. */
type CiBootstrapProbe =
    | { readonly outcome: "found"; readonly marker: CiBootstrapMarker }
    | { readonly outcome: "absent" }
    | { readonly outcome: "unknown"; readonly message: string };

/**
 * Reads `cirender/bootstrap.ts`'s own marker out of whatever the contents API answered.
 *
 * The same "there is no marker" / "there is a file there that is not one" rule every marker
 * reader in this application follows: both return null, because a file that exists but does
 * not name this application's tool is not this application's file, and treating it as a
 * damaged marker rather than as "no marker" would be guessing at bytes nothing wrote for
 * this purpose.
 */
function readCiBootstrapMarker(payload: unknown): CiBootstrapMarker | null {
    const row = record(payload);
    if (row === null) return null;
    const encoded = text(row["content"]);
    if (encoded === null) return null;
    const decoded = decodeBase64(encoded);
    if (decoded === null) return null;
    let source: unknown;
    try {
        source = JSON.parse(decoded);
    } catch {
        return null;
    }
    const body = record(source);
    if (body === null || body["tool"] !== CI_BOOTSTRAP_MARKER_TOOL) return null;

    const templateVersion = text(body["templateVersion"]) ?? "";
    const preparedAt = text(body["preparedAt"]) ?? "";
    const version = typeof body["version"] === "number" ? body["version"] : 0;
    const files = Array.isArray(body["files"]) ? body["files"].filter((entry): entry is string => typeof entry === "string") : [];
    return { tool: CI_BOOTSTRAP_MARKER_TOOL, version, templateVersion, files, preparedAt };
}

/**
 * Checks one repository for the CI-bootstrap marker, on its default branch - the marker
 * `cirender/bootstrap.ts` writes beside `.github/workflows/render-world.yml`, never on the
 * `world` branch the rest of this module otherwise looks at.
 *
 * No `ref` is passed, so the Contents API answers for whatever the repository's own default
 * branch is - this module never assumes a name for it the way {@link normaliseBranch} does
 * for the world-repo branch.
 */
async function probeCiBootstrapMarker(
    owner: string,
    repo: string,
    runner: ProcessRunner,
    signal: AbortSignal | undefined,
): Promise<CiBootstrapProbe> {
    let payload: unknown;
    try {
        payload = await ghJsonOrNull(`repos/${owner}/${repo}/contents/${CI_BOOTSTRAP_MARKER_FILE}`, runner, signal);
    } catch (error) {
        return { outcome: "unknown", message: sentence(error) };
    }
    if (payload === null) return { outcome: "absent" };
    const marker = readCiBootstrapMarker(payload);
    return marker === null ? { outcome: "absent" } : { outcome: "found", marker };
}

/** One repository to check, exactly as much as the check needs. */
export interface AdoptionCandidateInput {
    readonly owner: string;
    readonly repo: string;
}

/**
 * Bounded the same way {@link listCiOwnerChoices}'s `maxOrganizations` and every other
 * convenience list in this application already is - a marker check is a real network call
 * per repository, and a person with hundreds of them must never wait on hundreds of round
 * trips just to open the picker. Every candidate past the bound is answered `"not-checked"`,
 * not silently skipped and not guessed at.
 */
export const DEFAULT_MAX_ADOPTION_PROBES = 24;

export interface AdoptionProbeOptions {
    /** Defaults to {@link DEFAULT_WORLD_BRANCH} by way of {@link normaliseBranch}. */
    readonly branch?: string | undefined;
    readonly maxProbes?: number | undefined;
    readonly signal?: AbortSignal | undefined;
}

/**
 * Turns one {@link WorldRepoRepositoryReport} - already read for a specific branch - plus
 * whatever the CI-bootstrap marker check found, into one honest, worded signal.
 *
 * Pure and exported on its own so the wording can be tested without a network double: the
 * one thing worth proving here is that "found on the world branch", "found only as a
 * CI-bootstrap marker", "found on neither", "found but from the future" and "could not tell"
 * each say a different, honest sentence rather than collapsing two of them into one claim.
 * `bootstrap` defaults to "absent" so every existing caller that only ever checked the
 * world-repo marker keeps working unchanged.
 */
export function describeAdoptionSignal(
    fullName: string,
    branch: string,
    report: WorldRepoRepositoryReport,
    bootstrap: CiBootstrapProbe = { outcome: "absent" },
): AdoptionSignal {
    if (!report.exists) {
        return report.failure !== null
            ? {
                  fullName,
                  branch,
                  status: "unknown",
                  marker: null,
                  bootstrapMarker: null,
                  message: `${fullName} could not be checked: ${report.failure}`,
              }
            : {
                  fullName,
                  branch,
                  status: "not-prepared",
                  marker: null,
                  bootstrapMarker: null,
                  message: `${fullName} does not exist, or this account cannot see it.`,
              };
    }

    const worldMarker = report.branchExists ? report.branchMarker : null;
    // A failure worth reporting only when the branch itself was found but the marker inside
    // it could not be read - a branch that simply does not exist is an honest "no", not a
    // failure to check one.
    const worldBranchFailure = report.branchExists && worldMarker === null ? report.failure : null;
    const worldNewer = worldMarker !== null && worldMarker.version > WORLD_REPO_MARKER_VERSION;

    const bootstrapMarker = bootstrap.outcome === "found" ? bootstrap.marker : null;
    const bootstrapNewer = bootstrapMarker !== null && bootstrapMarker.version > CI_BOOTSTRAP_MARKER_VERSION;

    if (worldMarker !== null || bootstrapMarker !== null) {
        const found: string[] = [];
        if (worldMarker !== null) {
            found.push(
                worldNewer
                    ? `its ${branch} branch carries this application's world marker, written by a newer version than this one`
                    : `its ${branch} branch carries this application's world marker`,
            );
        }
        if (bootstrapMarker !== null) {
            found.push(
                bootstrapNewer
                    ? "its default branch carries this application's CI-bootstrap marker, written by a newer version than this one"
                    : "its default branch carries this application's CI-bootstrap marker",
            );
        }
        return {
            fullName,
            branch,
            status: worldNewer || bootstrapNewer ? "prepared-newer-version" : "prepared",
            marker: worldMarker,
            bootstrapMarker,
            message: `${fullName}: ${found.join(", and ")} - it looks like a repository this application prepared.`,
        };
    }

    if (worldBranchFailure !== null || bootstrap.outcome === "unknown") {
        const reasons = [worldBranchFailure, bootstrap.outcome === "unknown" ? bootstrap.message : null].filter(
            (value): value is string => value !== null,
        );
        return {
            fullName,
            branch,
            status: "unknown",
            marker: null,
            bootstrapMarker: null,
            message: `${fullName} could not be fully checked: ${reasons.join("; ")}`,
        };
    }

    return {
        fullName,
        branch,
        status: "not-prepared",
        marker: null,
        bootstrapMarker: null,
        message: `${fullName} carries neither this application's world marker nor its CI-bootstrap marker, so it does not look like one it prepared.`,
    };
}

/**
 * Checks a list of candidate repositories for either of this application's markers, bounded
 * so a long list never turns into hundreds of round trips.
 *
 * Reuses {@link WorldRepoHost.readRepository} for the world-repo half of the check - the
 * exact same method a sync's own preflight already calls, so "does this look prepared" can
 * never answer differently here than it would the moment before a sync touched the same
 * branch - and checks {@link CI_BOOTSTRAP_MARKER_FILE} on the default branch alongside it,
 * through the same `runner` `host` itself was constructed with.
 */
export async function probeAdoptionCandidates(
    host: WorldRepoHost,
    runner: ProcessRunner,
    candidates: readonly AdoptionCandidateInput[],
    options: AdoptionProbeOptions = {},
): Promise<AdoptionSignal[]> {
    const branch = normaliseBranch(options.branch);
    const maxProbes = options.maxProbes ?? DEFAULT_MAX_ADOPTION_PROBES;
    const results: AdoptionSignal[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (candidate === undefined) continue;
        const fullName = `${candidate.owner}/${candidate.repo}`;

        if (index >= maxProbes) {
            results.push({
                fullName,
                branch,
                status: "not-checked",
                marker: null,
                bootstrapMarker: null,
                message:
                    "Not checked for this application's marker - the check only looks at the first " +
                    `${String(maxProbes)} repositories in the list.`,
            });
            continue;
        }
        if (options.signal?.aborted === true) {
            results.push({
                fullName,
                branch,
                status: "not-checked",
                marker: null,
                bootstrapMarker: null,
                message: "The check was stopped before this repository was reached.",
            });
            continue;
        }

        const [report, bootstrap] = await Promise.all([
            host.readRepository(candidate.owner, candidate.repo, branch, options.signal),
            probeCiBootstrapMarker(candidate.owner, candidate.repo, runner, options.signal),
        ]);
        results.push(describeAdoptionSignal(fullName, branch, report, bootstrap));
    }

    return results;
}

/* -------------------------------------------------------------------------------------- */
/* Building a plan for one repository                                                      */
/* -------------------------------------------------------------------------------------- */

/** Which kind of machine-specific gap a needs-attention item names. */
export type AdoptionAttentionId =
    | "world-folder"
    | "dependencies"
    | "remote-host"
    | "output-folder"
    | "linked-world";

export interface AdoptionAttentionItem {
    readonly id: AdoptionAttentionId;
    /** The map this concerns, for `linked-world`; null for every project-wide item. */
    readonly mapId: string | null;
    readonly message: string;
}

export interface AdoptionRestoreSummary {
    readonly projectName: string;
    /** True when the project was never opened in the full editor - see `project.ts`. */
    readonly fromWizard: boolean;
    readonly maps: readonly { readonly id: string; readonly name: string; readonly dimension: string }[];
    readonly storageIds: readonly string[];
    /** Short, human sentences naming the non-default render options this project set. */
    readonly renderNotes: readonly string[];
    readonly coreCustomized: boolean;
    readonly webappCustomized: boolean;
    readonly webserverCustomized: boolean;
    readonly pluginCustomized: boolean;
}

/** A local project already bound to the same repository, so adoption never duplicates it. */
export interface AdoptionAlreadyLocal {
    readonly worldPath: string;
    readonly branch: string;
    readonly syncedAt: string;
}

export type AdoptionPlanFailureReason =
    | "repository-unreadable"
    | "not-prepared"
    | "project-absent"
    | "project-unreadable"
    | "project-too-new"
    /**
     * The repository is recognisably this application's - it carries a CI-bootstrap marker
     * - but no world-repo marker, so there is no project file anywhere in it to restore
     * settings from. `cirender/bootstrap.ts`'s ordinary render flow never stores maps,
     * storages or render options in the repository; they exist only on whichever computer's
     * local project last held them. Recognised, not restorable - see this module's own doc
     * comment for why the two markers promise different things.
     */
    | "ci-bootstrap-only";

export type AdoptionPlan =
    | {
          readonly ok: true;
          readonly owner: string;
          readonly repo: string;
          readonly branch: string;
          readonly marker: WorldRepoMarker;
          readonly bootstrapMarker: CiBootstrapMarker | null;
          readonly preparedByNewerMarkerVersion: boolean;
          readonly project: ProjectFile;
          readonly restoring: AdoptionRestoreSummary;
          readonly needsAttention: readonly AdoptionAttentionItem[];
          readonly alreadyLocal: AdoptionAlreadyLocal | null;
      }
    | {
          readonly ok: false;
          readonly owner: string;
          readonly repo: string;
          readonly branch: string;
          readonly reason: AdoptionPlanFailureReason;
          readonly message: string;
          /** Present whenever a world marker was found, even alongside a later refusal. */
          readonly marker: WorldRepoMarker | null;
          /** Present whenever a CI-bootstrap marker was found, including for `ci-bootstrap-only`. */
          readonly bootstrapMarker: CiBootstrapMarker | null;
          /** Set only for `project-too-new`. */
          readonly foundFormatVersion: number | null;
      };

export interface AdoptionTarget {
    readonly owner: string;
    readonly repo: string;
    readonly branch?: string | undefined;
}

export interface AdoptionPlanOptions {
    readonly signal?: AbortSignal | undefined;
}

function looksLikeAbsolutePath(value: string): boolean {
    // Cross-platform on purpose: this runs against text that was written on whatever
    // computer synced it, not against this process's own `path.isAbsolute`, which only
    // recognises the convention of the platform it is running on.
    return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\");
}

function summarizeRestore(project: ProjectFile): AdoptionRestoreSummary {
    const renderNotes: string[] = [];
    if (project.render.threads !== null) {
        renderNotes.push(`${String(project.render.threads)} render thread(s)`);
    }
    if (project.render.force) renderNotes.push("force re-render every tile");
    if (project.render.fixEdges) renderNotes.push("fix map edges");
    if (project.render.metrics) renderNotes.push("render metrics recording enabled");

    return {
        projectName: project.name,
        fromWizard: project.fromWizard,
        maps: project.maps.map((entry) => ({ id: entry.id, name: entry.name, dimension: entry.dimension })),
        storageIds: project.storages.map((entry) => entry.id),
        renderNotes,
        coreCustomized: project.core !== null,
        webappCustomized: project.webapp !== null,
        webserverCustomized: project.webserver !== null,
        pluginCustomized: project.plugin !== null,
    };
}

/**
 * The machine-specific gaps every successful plan names, plus whatever this specific
 * project adds on top.
 *
 * The first three are unconditional - present in every plan this function ever returns -
 * because a world folder, a local dependency and a remote host binding are never in a
 * project file to begin with (see this module's own doc comment), so there is never a
 * project for which "nothing needs attention here" would be the honest answer.
 */
function buildAttentionItems(project: ProjectFile): AdoptionAttentionItem[] {
    const items: AdoptionAttentionItem[] = [
        {
            id: "world-folder",
            mapId: null,
            message:
                "The Minecraft world folder itself travels separately from this repository and this " +
                "project - it will not be at the same path on this computer, and it may not exist here " +
                "at all yet. Choose or create it next, and this project will be linked to it.",
        },
        {
            id: "dependencies",
            mapId: null,
            message:
                "A local Java runtime, Docker's availability and any other installed dependency belong " +
                "to the old computer and were never part of what this repository stored. Check this " +
                "computer's own dependency readiness before rendering locally.",
        },
        {
            id: "remote-host",
            mapId: null,
            message:
                "Any remote host or SSH configuration used to render or host this map is tied to the " +
                "old computer's own keys and is not stored in this repository. Set one up again from " +
                "Settings if this project uses one.",
        },
    ];

    if (project.render.outputFolder !== null && looksLikeAbsolutePath(project.render.outputFolder)) {
        items.push({
            id: "output-folder",
            mapId: null,
            message:
                `This project's render output was set to ${project.render.outputFolder} on the old ` +
                "computer, which will not resolve here. Choose where the rendered map is written again " +
                "before the first render.",
        });
    }

    for (const map of project.maps) {
        if (map.world !== null && looksLikeAbsolutePath(map.world)) {
            items.push({
                id: "linked-world",
                mapId: map.id,
                message:
                    `The map "${map.name}" points at another world by its exact path on the old ` +
                    `computer (${map.world}), which will not resolve here either. Point it at that ` +
                    "world's location on this computer once you know it.",
            });
        }
    }

    return items;
}

function describeProjectFailure(failure: ProjectReadFailure): string {
    switch (failure.kind) {
        case "absent":
            return `No ${PROJECT_FILE_NAME} was found on that branch, so there are no settings to restore.`;
        case "unreadable":
            return failure.message;
        case "not-json":
            return `${PROJECT_FILE_NAME} was not valid JSON: ${failure.message}`;
        case "too-new":
            return (
                `This project was written by a newer version of Worldlens (format ` +
                `${String(failure.version)}).`
            );
        case "invalid":
            return `${PROJECT_FILE_NAME} did not match the shape this build expects: ${failure.problems.join("; ")}`;
    }
}

/**
 * Fetches one file's text out of a repository branch through `gh api`, transparently
 * falling back to the Git Blob API for anything past the Contents API's 1 MB inline limit.
 *
 * A project file is ordinary JSON and almost always well under that ceiling, but a project
 * with many maps and long `marker-sets` HOCON blocks is not bounded to stay under it either
 * (`project/file.ts`'s own `MAX_PROJECT_BYTES` allows up to 4 MB) - so this does not simply
 * assume the inline path always answers.
 */
async function fetchRepositoryFileText(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    runner: ProcessRunner,
    signal: AbortSignal | undefined,
): Promise<{ readonly ok: true; readonly text: string } | { readonly ok: false; readonly absent: boolean; readonly message: string }> {
    let payload: unknown;
    try {
        payload = await ghJsonOrNull(
            `repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
            runner,
            signal,
        );
    } catch (error) {
        return { ok: false, absent: false, message: sentence(error) };
    }
    if (payload === null) {
        return { ok: false, absent: true, message: `${path} was not found on ${branch}.` };
    }

    const row = record(payload);
    if (row === null) {
        return { ok: false, absent: false, message: `${path} did not answer with a file.` };
    }

    const inline = text(row["content"]);
    if (inline !== null && inline.length > 0) {
        const decoded = decodeBase64(inline);
        return decoded === null
            ? { ok: false, absent: false, message: `${path} could not be decoded.` }
            : { ok: true, text: decoded };
    }

    // Past the Contents API's 1 MB inline limit: `content` comes back empty but the blob's
    // own sha is still on the response, and the Git Blob API reads up to 100 MB the same way.
    const sha = text(row["sha"]);
    if (sha === null) {
        return { ok: false, absent: false, message: `${path} carried no readable content.` };
    }
    let blob: unknown;
    try {
        blob = await ghJsonOrNull(`repos/${owner}/${repo}/git/blobs/${sha}`, runner, signal);
    } catch (error) {
        return { ok: false, absent: false, message: sentence(error) };
    }
    const blobContent = text(record(blob)?.["content"]);
    if (blobContent === null) {
        return { ok: false, absent: false, message: `${path} could not be read past the inline size limit.` };
    }
    const decoded = decodeBase64(blobContent);
    return decoded === null
        ? { ok: false, absent: false, message: `${path} could not be decoded.` }
        : { ok: true, text: decoded };
}

/**
 * Reads a repository's marker and project file and turns them into a plan a person can read
 * before anything local changes - or an honest refusal, including the reverse-compatibility
 * case where the project itself is from a build newer than this one.
 *
 * Never writes anything: every call inside this function is a `GET`. Adopting a repository
 * this way changes nothing about it, which is worth stating because {@link WorldRepoHost}'s
 * other methods on the same class very much do write.
 */
export async function buildAdoptionPlan(
    host: WorldRepoHost,
    runner: ProcessRunner,
    target: AdoptionTarget,
    options: AdoptionPlanOptions = {},
): Promise<AdoptionPlan> {
    const owner = target.owner.trim();
    const repo = target.repo.trim();
    const branch = normaliseBranch(target.branch);
    const signal = options.signal;

    const report = await host.readRepository(owner, repo, branch, signal);

    if (!report.exists) {
        return {
            ok: false,
            owner,
            repo,
            branch,
            reason: "repository-unreadable",
            message: report.failure ?? `${owner}/${repo} does not exist, or this account cannot see it.`,
            marker: null,
            bootstrapMarker: null,
            foundFormatVersion: null,
        };
    }

    // No world-repo marker on this branch - check the CI-bootstrap marker before concluding
    // this is not a repository this application prepared at all. The two promise different
    // things (see this module's own doc comment): a bootstrap-only repository is genuinely
    // recognisable, it just has no project file anywhere in it to restore settings from.
    if (!report.branchExists || report.branchMarker === null) {
        const bootstrap = await probeCiBootstrapMarker(owner, repo, runner, signal);
        if (bootstrap.outcome === "found") {
            return {
                ok: false,
                owner,
                repo,
                branch,
                reason: "ci-bootstrap-only",
                message:
                    `${owner}/${repo} carries this application's CI-bootstrap marker on its default ` +
                    "branch, so it is recognisably one this application set up to render on GitHub - but " +
                    `it has no ${branch} branch carrying a project, so there are no maps, storages or ` +
                    "render settings stored in the repository to restore. Those lived only on the old " +
                    "computer's local project.",
                marker: null,
                bootstrapMarker: bootstrap.marker,
                foundFormatVersion: null,
            };
        }
        return {
            ok: false,
            owner,
            repo,
            branch,
            reason: "not-prepared",
            message: !report.branchExists
                ? `${owner}/${repo} has no ${branch} branch and no CI-bootstrap marker, so it does not ` +
                  "look like a repository this application prepared."
                : `${owner}/${repo}'s ${branch} branch carries no marker from this application, and its ` +
                  "default branch carries no CI-bootstrap marker either, so it does not look like one " +
                  "this application prepared.",
            marker: null,
            bootstrapMarker: null,
            foundFormatVersion: null,
        };
    }

    const marker = report.branchMarker;
    // The bootstrap marker is read alongside the world marker whenever both might be
    // present, purely to report it - it never gates whether adoption can proceed here,
    // because the world-repo marker and its project file are what adoption actually needs.
    const bootstrap = await probeCiBootstrapMarker(owner, repo, runner, signal);
    const bootstrapMarker = bootstrap.outcome === "found" ? bootstrap.marker : null;

    const projectFile = await fetchRepositoryFileText(owner, repo, PROJECT_FILE_NAME, branch, runner, signal);
    if (!projectFile.ok) {
        return {
            ok: false,
            owner,
            repo,
            branch,
            reason: projectFile.absent ? "project-absent" : "project-unreadable",
            message: projectFile.absent
                ? `This repository carries this application's marker, but no ${PROJECT_FILE_NAME} was found ` +
                  `on ${branch}, so there are no settings to restore. The marker alone still says this is ` +
                  "likely a repository this application prepared."
                : projectFile.message,
            marker,
            bootstrapMarker,
            foundFormatVersion: null,
        };
    }

    const parsed = parseProjectFile(projectFile.text);
    if (!parsed.ok) {
        return {
            ok: false,
            owner,
            repo,
            branch,
            reason: parsed.failure.kind === "too-new" ? "project-too-new" : "project-unreadable",
            message:
                parsed.failure.kind === "too-new"
                    ? `This repository's project was written by a newer version of Worldlens ` +
                      `(format ${String(parsed.failure.version)}; this build reads up to ` +
                      `${String(PROJECT_FORMAT_VERSION)}). Update the app to adopt it rather than ` +
                      "guessing at settings this build does not understand."
                    : describeProjectFailure(parsed.failure),
            marker,
            bootstrapMarker,
            foundFormatVersion: parsed.failure.kind === "too-new" ? parsed.failure.version : null,
        };
    }

    const project = parsed.project;
    const records = await host.records();
    const existing = records.find(
        (candidate) => sameName(candidate.owner, owner) && sameName(candidate.repo, repo),
    );

    return {
        ok: true,
        owner,
        repo,
        branch,
        marker,
        bootstrapMarker,
        preparedByNewerMarkerVersion: marker.version > WORLD_REPO_MARKER_VERSION,
        project,
        restoring: summarizeRestore(project),
        needsAttention: buildAttentionItems(project),
        alreadyLocal:
            existing === undefined
                ? null
                : { worldPath: existing.worldPath, branch: existing.branch, syncedAt: existing.syncedAt },
    };
}

/* -------------------------------------------------------------------------------------- */
/* Small shared helpers                                                                    */
/* -------------------------------------------------------------------------------------- */

function sameName(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function text(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function decodeBase64(value: string): string | null {
    try {
        return Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
        return null;
    }
}

function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const value = String(error);
    return value.length > 0 ? value : "GitHub could not be reached, and said no more.";
}

/**
 * `gh api <endpoint>`, answered as parsed JSON, with a 404 turned into `null`.
 *
 * A small, deliberate duplicate of `repo.ts`'s own private `ghJsonOrNull` - restated rather
 * than imported for the same reason `remote/browse.ts` restates three literals from
 * `world/inspect.ts` instead of importing them: `repo.ts` does not export it, and the two
 * copies are kept honest with each other by staying next to the same {@link ActionsCallError}
 * import and the same "404 means null, nothing else does" rule, spelled out in one place.
 */
async function ghJsonOrNull(
    endpoint: string,
    runner: ProcessRunner,
    signal: AbortSignal | undefined,
): Promise<unknown | null> {
    try {
        return await ghApiJson(endpoint, { runner, ...(signal ? { signal } : {}) });
    } catch (error) {
        if (error instanceof ActionsCallError && error.status === 404) return null;
        throw error;
    }
}

// Re-exported so a caller of this module never has to import `repo.js` and `bootstrap.js` a
// second time just to name the two files this checks for.
export { WORLD_REPO_MARKER_FILE };
export { CI_BOOTSTRAP_MARKER_FILE };

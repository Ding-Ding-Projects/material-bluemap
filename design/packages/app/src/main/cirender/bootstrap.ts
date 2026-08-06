/**
 * Making a repository able to run a CI render, from nothing.
 *
 * ## The bug this exists to fix
 *
 * `resolveTransport` picked a credential by probing `readWorkflow` -
 * `GET .../actions/workflows/render-world.yml` - and nothing else. A repository that has
 * never had that file committed to it 404s on that probe exactly the way a repository the
 * signed-in account cannot see does, so `resolveTransport` reported `ready: false` with a
 * message that reads like a permissions problem, and `CiRenderScreen.vue` disabled the
 * render button on the strength of it. A brand-new repository - which is precisely what
 * somebody following the guided "What, and where" setup card is expected to point this at
 * - could therefore never be rendered on, because nothing in this codebase ever put the
 * workflow there. This module is that missing piece: given a repository somebody can write
 * to, it commits what a render needs and reports honestly what happened.
 *
 * `resolveTransport` now takes an optional `probe` (see `transport.ts`), and this module is
 * the reason: it resolves a transport with `probe: (transport, owner, repo) =>
 * transport.readRepository(owner, repo)` - "can this credential see the repository at all",
 * which is everything a *write* needs to start with, rather than "can it already see a file
 * that is not there yet."
 *
 * ## Four starting states, one operation
 *
 * 1. **Truly empty** - zero commits, no default branch ref yet. `CiTransport.isRepositoryEmpty`
 *    tells this apart from every other 404 (see its own doc comment for why `GET
 *    /repos/{o}/{r}` alone cannot). `CiTransport.writeFile` with no `sha` on an empty
 *    repository creates the very first commit and, with it, the default branch - nothing
 *    here needs a branch to already exist.
 * 2. **Has content, no workflow.** The same `writeFile` with no `sha` creates the file
 *    alongside whatever is already there; nothing else in the repository is read or
 *    written.
 * 3. **This application prepared it before, and the shipped workflow has moved on.**
 *    Detected by comparing the committed file's content against the current template - not
 *    a version number alone, so a hand-edited file compares as changed too - and updated
 *    with the file's current `sha`, which is GitHub's own optimistic-concurrency check
 *    against clobbering a write that landed after this one was read.
 * 4. **Looks prepared, cannot run.** `CiTransport.readActionsPolicy` is read after the
 *    files are in place, and a `disabled` state is reported as `ready: false` with the
 *    actual policy named - never smoothed into a green tick. An `unknown` state (this
 *    credential is not an admin on the repository) does not block readiness: it is simply
 *    not evidence either way.
 *
 * ## Never a guessed verdict, and never a clobber
 *
 * Every file this writes is guarded the same way `pages/hosting.ts` guards its publishing
 * branch: a marker (`CI_BOOTSTRAP_MARKER_FILE`) records which paths this application put
 * there, and a file that exists, differs from the template, and is **not** listed in that
 * marker is refused rather than overwritten - it is somebody else's file that happens to
 * share a path. Token scopes are checked before a single byte is written, because a token
 * with `repo` but not `workflow` fails specifically and only on the workflow file, leaving
 * a half-prepared repository behind; catching that first means nothing is half-prepared at
 * all. A conflict on any one managed file is treated the same way: every template is
 * *planned* (read-only) before any of them is written, so a conflict on the second of two
 * files never leaves the first one already changed - see {@link planTemplate}.
 *
 * ## What crosses, and what does not
 *
 * The token, like everywhere else in `cirender/`, is resolved per call by the caller and
 * never held here. Nothing here logs, prints, or otherwise carries a credential past the
 * one request it authorizes.
 */

import type { FetchLike } from "../backup/index.js";
import { ActionsCallError, RENDER_WORKFLOW_FILE } from "./actions.js";
import type { ProcessRunner } from "./gh.js";
import { resolveTransport } from "./transport.js";
import type { CiRoute, CiTransport } from "./transport.js";

/** The file that says a path belongs to this application, and which paths those are. */
export const CI_BOOTSTRAP_MARKER_FILE = ".material-bluemap-ci.json";

/** The value of the marker's `tool` field. Nothing else is accepted as ours. */
export const CI_BOOTSTRAP_MARKER_TOOL = "material-bluemap";

/** Bumped only if the marker's shape changes. An unknown version is still *ours*. */
export const CI_BOOTSTRAP_MARKER_VERSION = 1;

/**
 * The two scopes preparing a repository needs. `repo` is what every other write in this
 * application already needs; `workflow` is the one a plain `repo` token does not carry,
 * and the one whose absence turns "everything else worked" into "the workflow file alone
 * was refused" with no obvious reason why.
 */
export const REQUIRED_CI_BOOTSTRAP_SCOPES = ["repo", "workflow"] as const;

/* -------------------------------------------------------------------------------------- */
/* What crosses                                                                             */
/* -------------------------------------------------------------------------------------- */

/** One file this application ships and wants committed. */
export interface CiWorkflowTemplate {
    /** Repository-relative, e.g. `.github/workflows/render-world.yml`. */
    readonly path: string;
    /** The exact bytes to write, as text. */
    readonly content: string;
}

export interface CiBootstrapMarker {
    readonly tool: string;
    readonly version: number;
    /** Identifies the shipped template set that produced the files this marker lists. */
    readonly templateVersion: string;
    readonly files: readonly string[];
    readonly preparedAt: string;
}

export type CiBootstrapFileAction = "created" | "updated" | "unchanged" | "refused";

export interface CiBootstrapFileOutcome {
    readonly path: string;
    readonly action: CiBootstrapFileAction;
    /** Populated for `updated` (what changed) and `refused` (why). Null otherwise. */
    readonly reason: string | null;
}

export interface CiBootstrapReport {
    readonly owner: string;
    readonly repo: string;
    readonly route: CiRoute;
    /** The credential in play, in a sentence a person can act on. */
    readonly credentialDescribe: string;
    readonly files: readonly CiBootstrapFileOutcome[];
    readonly markerWritten: boolean;
    /** Null when this could not be determined - see `CiTransport.readActionsPolicy`. */
    readonly actionsEnabled: boolean | null;
    readonly actionsMessage: string;
    /** True only when every file landed and Actions is not known to be disabled. */
    readonly ready: boolean;
    readonly notes: readonly string[];
}

export type CiBootstrapFailureCode =
    | "invalid-request"
    | "missing-scope"
    | "no-route"
    | "repository-not-writable"
    | "user-authored-conflict"
    | "http-error";

export interface CiBootstrapFailure {
    readonly code: CiBootstrapFailureCode;
    readonly message: string;
    /** Populated only for `missing-scope`: the scopes this token is missing. */
    readonly missingScopes: readonly string[] | null;
}

export type CiBootstrapResult =
    | { readonly ok: true; readonly report: CiBootstrapReport }
    | { readonly ok: false; readonly failure: CiBootstrapFailure };

export type CiBootstrapPhase =
    | "resolving-credential"
    | "checking-scopes"
    | "reading-repository"
    | "writing-files"
    | "checking-actions"
    | "finished";

export type CiBootstrapEvent =
    | { readonly type: "started"; readonly owner: string; readonly repo: string; readonly at: string }
    | { readonly type: "phase"; readonly phase: CiBootstrapPhase; readonly at: string }
    | { readonly type: "file"; readonly outcome: CiBootstrapFileOutcome; readonly at: string }
    | { readonly type: "log"; readonly level: "info" | "warning" | "error"; readonly message: string; readonly at: string }
    | { readonly type: "finished"; readonly report: CiBootstrapReport; readonly at: string }
    | { readonly type: "failed"; readonly failure: CiBootstrapFailure; readonly at: string };

/* -------------------------------------------------------------------------------------- */
/* The operation                                                                            */
/* -------------------------------------------------------------------------------------- */

export interface CiBootstrapRequest {
    readonly owner: string;
    readonly repo: string;
}

export interface CiBootstrapOptions {
    /** The in-app token, or null when nobody is signed in to the application. */
    readonly token: string | null;
    readonly account?: string | null | undefined;
    readonly fetch: FetchLike;
    readonly runner: ProcessRunner;
    readonly signal?: AbortSignal | undefined;
    readonly apiBase?: string | undefined;
    readonly uploadsBase?: string | undefined;
    readonly prefer?: CiRoute | undefined;
    /** The workflow files to commit. Real content comes from `workflowTemplates.ts`. */
    readonly templates: readonly CiWorkflowTemplate[];
    /** Identifies the shipped template set, for the marker and for staleness reporting. */
    readonly templateVersion: string;
    readonly onEvent?: ((event: CiBootstrapEvent) => void) | undefined;
    readonly now?: (() => Date) | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Brings a repository to a state where a CI render can actually run.
 *
 * See the module doc comment for the four starting states this handles and why each one
 * needs what it needs. Every write is additive: nothing here ever deletes, force-pushes,
 * or overwrites a path this application did not itself place there (tracked by
 * {@link CI_BOOTSTRAP_MARKER_FILE}), and running this twice in a row against an unchanged
 * template performs no writes at all on the second run.
 */
export async function bootstrapCiRepository(
    request: CiBootstrapRequest,
    options: CiBootstrapOptions,
): Promise<CiBootstrapResult> {
    const owner = request.owner.trim();
    const repo = request.repo.trim();
    const emit = (event: CiBootstrapEvent): void => options.onEvent?.(event);
    const stamp = (): string => (options.now?.() ?? new Date()).toISOString();
    const fail = (failure: CiBootstrapFailure): CiBootstrapResult => {
        emit({ type: "failed", failure, at: stamp() });
        return { ok: false, failure };
    };

    if (owner.length === 0 || repo.length === 0) {
        return fail({
            code: "invalid-request",
            message: "An owner and a repository name are required to prepare a repository for CI rendering.",
            missingScopes: null,
        });
    }
    if (options.templates.length === 0) {
        return fail({
            code: "invalid-request",
            message: "No workflow templates were supplied, so there was nothing to prepare.",
            missingScopes: null,
        });
    }

    emit({ type: "started", owner, repo, at: stamp() });

    /* -- pick a credential, without needing the workflow to already exist --------------- */
    emit({ type: "phase", phase: "resolving-credential", at: stamp() });
    const resolved = await resolveTransport({
        owner,
        repo,
        // Required by the interface but unused by the probe below; kept as the real
        // workflow name so a caller inspecting the report sees something meaningful.
        workflowFile: RENDER_WORKFLOW_FILE,
        token: options.token,
        fetch: options.fetch,
        runner: options.runner,
        ...(options.account === undefined ? {} : { account: options.account }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
        ...(options.uploadsBase === undefined ? {} : { uploadsBase: options.uploadsBase }),
        ...(options.prefer === undefined ? {} : { prefer: options.prefer }),
        // The whole fix: proves a credential can see the repository, not that it can
        // already see a workflow file a bootstrap exists precisely because is not there.
        probe: (transport, probeOwner, probeRepo) => transport.readRepository(probeOwner, probeRepo),
    });
    if (resolved.transport === null) {
        return fail({ code: "no-route", message: resolved.report.describe, missingScopes: null });
    }
    const transport = resolved.transport;
    const route = resolved.report.route ?? transport.route;

    /* -- scopes, before a single byte is written --------------------------------------- */
    emit({ type: "phase", phase: "checking-scopes", at: stamp() });
    const { scopes } = await transport.readTokenScopes();
    if (scopes !== null) {
        const missing = REQUIRED_CI_BOOTSTRAP_SCOPES.filter((scope) => !scopes.includes(scope));
        if (missing.length > 0) {
            return fail({
                code: "missing-scope",
                message:
                    `${transport.describe} is missing the ${missing.map((scope) => `"${scope}"`).join(" and ")} ` +
                    `permission${missing.length > 1 ? "s" : ""}. Preparing a repository needs "repo" to write to ` +
                    'it at all, and "workflow" specifically to commit anything under .github/workflows/ - a ' +
                    "token with only \"repo\" will create everything else and then fail on the workflow file " +
                    "alone. Sign in again and grant it; nothing was written this attempt.",
                missingScopes: missing,
            });
        }
    } else {
        emit({
            type: "log",
            level: "info",
            message:
                `${transport.describe} did not report its token scopes, so they could not be checked in ` +
                "advance. If writing the workflow file is refused, a missing \"workflow\" scope is the usual reason.",
            at: stamp(),
        });
    }

    /* -- the repository itself ---------------------------------------------------------- */
    emit({ type: "phase", phase: "reading-repository", at: stamp() });
    let canWrite: boolean;
    let isPrivate: boolean;
    try {
        const repository = await transport.readRepository(owner, repo);
        canWrite = repository.canWrite;
        isPrivate = repository.private;
    } catch (error) {
        return fail(toHttpFailure(error));
    }
    if (!canWrite) {
        return fail({
            code: "repository-not-writable",
            message:
                `${owner}/${repo} exists, and ${transport.describe} cannot write to it, so a workflow ` +
                "cannot be committed there.",
            missingScopes: null,
        });
    }

    const notes: string[] = [];
    if (isPrivate) {
        notes.push(
            "This repository is private, so a CI render here spends the account's own Actions minutes. " +
                "A public repository gets unlimited standard-runner minutes instead.",
        );
    }

    /* -- the files, planned first and written only when nothing conflicts --------------- */
    //
    // Reading every template's target before writing any of it is what makes a conflict
    // atomic: a repository with two managed files, one of them somebody else's, ends this
    // call having written *neither*, rather than one already committed and the other
    // refused - a half-prepared repository is exactly what checking scopes up front (see
    // above) is meant to avoid, and a conflict deserves the same treatment.
    emit({ type: "phase", phase: "writing-files", at: stamp() });
    let plans: readonly TemplatePlan[];
    try {
        const empty = await transport.isRepositoryEmpty(owner, repo);
        plans = await Promise.all(
            options.templates.map((template) => planTemplate(transport, owner, repo, template, empty)),
        );
    } catch (error) {
        return fail(toHttpFailure(error));
    }

    const outcomes: CiBootstrapFileOutcome[] = plans.map((plan) => ({
        path: plan.template.path,
        action: planAction(plan.kind),
        reason: plan.reason,
    }));
    for (const outcome of outcomes) emit({ type: "file", outcome, at: stamp() });

    const refused = outcomes.filter((outcome) => outcome.action === "refused");
    if (refused.length > 0) {
        return fail({
            code: "user-authored-conflict",
            message:
                `${refused.map((outcome) => outcome.path).join(", ")} already exist${refused.length === 1 ? "s" : ""} ` +
                `on ${owner}/${repo} and ${refused.length === 1 ? "was" : "were"} not written by this ` +
                "application, so nothing there was overwritten. Move or rename the existing file and " +
                "prepare again, or add the render workflow to it by hand.",
            missingScopes: null,
        });
    }

    const toWrite = plans.filter((plan) => plan.kind === "create" || plan.kind === "update");
    try {
        for (const plan of toWrite) {
            await transport.writeFile(
                owner,
                repo,
                plan.template.path,
                base64Of(plan.template.content),
                `${plan.kind === "create" ? "Add" : "Update"} ${plan.template.path} for CI rendering ` +
                    `(material-bluemap ${options.templateVersion})`,
                plan.kind === "update" && plan.existingSha !== null ? plan.existingSha : undefined,
            );
        }
    } catch (error) {
        return fail(toHttpFailure(error));
    }

    let markerWritten = false;
    if (toWrite.length > 0) {
        try {
            // The marker always names the *whole* managed set, not only what changed this
            // run - a run that updates one file and leaves another unchanged must not drop
            // the unchanged one from the ownership list, or a later run would see it as a
            // file it never wrote and refuse to touch it.
            markerWritten = await writeMarker(
                transport,
                owner,
                repo,
                options.templates,
                options.templateVersion,
                stamp(),
            );
        } catch (error) {
            return fail(toHttpFailure(error));
        }
    } else {
        notes.push("Every file this application manages was already up to date, so nothing was written.");
    }

    /* -- Actions enablement, checked and reported rather than assumed --------------------- */
    emit({ type: "phase", phase: "checking-actions", at: stamp() });
    let actionsEnabled: boolean | null;
    let actionsMessage: string;
    try {
        const policy = await transport.readActionsPolicy(owner, repo);
        if (policy.state === "enabled") {
            actionsEnabled = true;
            actionsMessage = "GitHub Actions is enabled for this repository.";
        } else if (policy.state === "disabled") {
            actionsEnabled = false;
            actionsMessage =
                `GitHub Actions is turned off for ${owner}/${repo} (Settings -> Actions -> General is set ` +
                `to disable Actions${
                    policy.allowedActions === null ? "" : `, allowed actions: ${policy.allowedActions}`
                }). Turn it on there before a render can run.`;
        } else {
            actionsEnabled = null;
            actionsMessage = policy.reason;
        }
    } catch (error) {
        return fail(toHttpFailure(error));
    }

    const report: CiBootstrapReport = {
        owner,
        repo,
        route,
        credentialDescribe: transport.describe,
        files: outcomes,
        markerWritten,
        actionsEnabled,
        actionsMessage,
        ready: actionsEnabled !== false,
        notes,
    };
    emit({ type: "phase", phase: "finished", at: stamp() });
    emit({ type: "finished", report, at: stamp() });
    return { ok: true, report };
}

/* -------------------------------------------------------------------------------------- */
/* Planning, so a conflict never leaves a partial write behind                             */
/* -------------------------------------------------------------------------------------- */

type TemplatePlanKind = "create" | "update" | "unchanged" | "refuse";

interface TemplatePlan {
    readonly template: CiWorkflowTemplate;
    readonly kind: TemplatePlanKind;
    /** The sha to send back with an update. Null for everything else. */
    readonly existingSha: string | null;
    readonly reason: string | null;
}

function planAction(kind: TemplatePlanKind): CiBootstrapFileAction {
    switch (kind) {
        case "create":
            return "created";
        case "update":
            return "updated";
        case "unchanged":
            return "unchanged";
        case "refuse":
            return "refused";
    }
}

function base64Of(text: string): string {
    return Buffer.from(text, "utf8").toString("base64");
}

function textOf(contentBase64: string): string {
    return Buffer.from(contentBase64, "base64").toString("utf8");
}

/**
 * Decides what would happen to one template, without writing anything.
 *
 * Read-only by construction - this is what lets {@link bootstrapCiRepository} plan every
 * template before committing to any write, so a conflict on the second of two files never
 * leaves the first one already changed. `empty` is read once by the caller and passed in
 * rather than re-checked per template, because nothing written during planning could ever
 * change it.
 */
async function planTemplate(
    transport: CiTransport,
    owner: string,
    repo: string,
    template: CiWorkflowTemplate,
    empty: boolean,
): Promise<TemplatePlan> {
    if (empty) return { template, kind: "create", existingSha: null, reason: null };

    const existing = await transport.readFile(owner, repo, template.path);
    if (existing === null) return { template, kind: "create", existingSha: null, reason: null };

    const existingContent = textOf(existing.contentBase64);
    if (existingContent === template.content) {
        return { template, kind: "unchanged", existingSha: existing.sha, reason: null };
    }

    const ownedByApp = await isAppOwnedFile(transport, owner, repo, template.path);
    if (!ownedByApp) {
        return {
            template,
            kind: "refuse",
            existingSha: existing.sha,
            reason: `${template.path} already exists on ${owner}/${repo} and was not written by this application.`,
        };
    }

    return {
        template,
        kind: "update",
        existingSha: existing.sha,
        reason:
            `The copy of ${template.path} already on ${owner}/${repo} was from an earlier version of this ` +
            "application. It has been brought up to date; nothing else on the repository was touched.",
    };
}

/** True only when the marker names this exact path as one this application placed. */
async function isAppOwnedFile(
    transport: CiTransport,
    owner: string,
    repo: string,
    path: string,
): Promise<boolean> {
    const marker = await transport.readFile(owner, repo, CI_BOOTSTRAP_MARKER_FILE);
    if (marker === null) return false;
    try {
        const parsed = JSON.parse(textOf(marker.contentBase64)) as Partial<CiBootstrapMarker>;
        if (parsed.tool !== CI_BOOTSTRAP_MARKER_TOOL) return false;
        return Array.isArray(parsed.files) && parsed.files.includes(path);
    } catch {
        return false;
    }
}

async function writeMarker(
    transport: CiTransport,
    owner: string,
    repo: string,
    templates: readonly CiWorkflowTemplate[],
    templateVersion: string,
    preparedAt: string,
): Promise<boolean> {
    const marker: CiBootstrapMarker = {
        tool: CI_BOOTSTRAP_MARKER_TOOL,
        version: CI_BOOTSTRAP_MARKER_VERSION,
        templateVersion,
        files: templates.map((template) => template.path),
        preparedAt,
    };
    const existing = await transport.readFile(owner, repo, CI_BOOTSTRAP_MARKER_FILE);
    await transport.writeFile(
        owner,
        repo,
        CI_BOOTSTRAP_MARKER_FILE,
        base64Of(`${JSON.stringify(marker, null, 2)}\n`),
        "Record what material-bluemap prepared for CI rendering",
        existing === null ? undefined : existing.sha,
    );
    return true;
}

function toHttpFailure(error: unknown): CiBootstrapFailure {
    if (error instanceof ActionsCallError) {
        return { code: "http-error", message: error.message, missingScopes: null };
    }
    if (isRecord(error) && typeof error["message"] === "string" && error["message"].length > 0) {
        return { code: "http-error", message: error["message"], missingScopes: null };
    }
    const message = String(error);
    return {
        code: "http-error",
        message: message.length > 0 ? message : "This repository could not be prepared, and nothing said why.",
        missingScopes: null,
    };
}

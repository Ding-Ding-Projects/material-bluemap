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
 * 1. **Truly empty** - zero commits, no default branch ref yet. GitHub's Git Data API cannot
 *    create that first ref, so the operation fails closed and asks for one starter commit.
 * 2. **Has content, no workflow.** A new tree is based on the current default-branch tree,
 *    preserving every unrelated path and adding the complete managed set in one commit.
 * 3. **This application prepared it before, and the shipped workflow has moved on.**
 *    Updated only when the current bytes still equal the exact SHA-256 recorded at install
 *    time. A later edit or deletion is a typed conflict, and a newer marker/template version
 *    is never downgraded by an older build.
 * 4. **Looks prepared, cannot run.** `CiTransport.readActionsPolicy` is read after the
 *    files are in place, and a `disabled` state is reported as `ready: false` with the
 *    actual policy named - never smoothed into a green tick. An `unknown` state (this
 *    credential is not an admin on the repository) does not block readiness: it is simply
 *    not evidence either way.
 *
 * ## Never a guessed verdict, and never a clobber
 *
 * A marker (`CI_BOOTSTRAP_MARKER_FILE`) records each path and the exact SHA-256 installed
 * there. Every template is planned read-only, candidate Git objects are created off-ref,
 * and one non-force ref update guarded by the expected branch-head SHA makes the whole set
 * visible. A conflict, concurrent writer, or injected failure therefore exposes either the
 * old complete tree or the new complete tree, never a half-prepared repository.
 *
 * ## What crosses, and what does not
 *
 * The token, like everywhere else in `cirender/`, is resolved per call by the caller and
 * never held here. Nothing here logs, prints, or otherwise carries a credential past the
 * one request it authorizes.
 */

import { createHash } from "node:crypto";
import type { FetchLike } from "../backup/index.js";
import { ActionsCallError, RENDER_WORKFLOW_FILE } from "./actions.js";
import type { ProcessRunner } from "./gh.js";
import { CiAtomicCommitConflictError, resolveTransport } from "./transport.js";
import type { CiRoute, CiTransport } from "./transport.js";

/** The file that says a path belongs to this application, and which paths those are. */
export const CI_BOOTSTRAP_MARKER_FILE = ".worldlens-ci.json";
export const LEGACY_CI_BOOTSTRAP_MARKER_FILE = ".material-bluemap-ci.json";

/** The value of the marker's `tool` field. Nothing else is accepted as ours. */
export const CI_BOOTSTRAP_MARKER_TOOL = "worldlens";
export const LEGACY_CI_BOOTSTRAP_MARKER_TOOL = "material-bluemap";

/** Bumped only if the marker's shape changes. An unknown version is still *ours*. */
export const CI_BOOTSTRAP_MARKER_VERSION = 2;

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
    /** Numeric in schema 2; string remains readable for schema-1 adoption compatibility. */
    readonly templateVersion: number | string;
    readonly files: readonly string[];
    /** Exact SHA-256 of the UTF-8 bytes installed at each managed workflow path. */
    readonly fileHashes?: Readonly<Record<string, string>>;
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
    | "empty-repository"
    | "user-authored-conflict"
    | "managed-file-modified"
    | "newer-marker-version"
    | "newer-template-version"
    | "concurrent-update"
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
    | {
          readonly type: "started";
          readonly owner: string;
          readonly repo: string;
          readonly at: string;
      }
    | { readonly type: "phase"; readonly phase: CiBootstrapPhase; readonly at: string }
    | { readonly type: "file"; readonly outcome: CiBootstrapFileOutcome; readonly at: string }
    | {
          readonly type: "log";
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
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
    readonly templateVersion: number;
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
            message:
                "An owner and a repository name are required to prepare a repository for CI rendering.",
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
    if (!Number.isSafeInteger(options.templateVersion) || options.templateVersion < 1) {
        return fail({
            code: "invalid-request",
            message: "The managed workflow template version must be a positive monotonic integer.",
            missingScopes: null,
        });
    }
    if (
        new Set(options.templates.map((template) => template.path)).size !==
        options.templates.length
    ) {
        return fail({
            code: "invalid-request",
            message:
                "The managed workflow set contains duplicate repository paths, so nothing was changed.",
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
        probe: (transport, probeOwner, probeRepo) =>
            transport.readRepository(probeOwner, probeRepo),
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
                    'token with only "repo" will create everything else and then fail on the workflow file ' +
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
                'advance. If writing the workflow file is refused, a missing "workflow" scope is the usual reason.',
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

    /* -- the files, planned first and made visible in one guarded Git commit ------------ */
    emit({ type: "phase", phase: "writing-files", at: stamp() });
    if (
        transport.readRepositoryHead === undefined ||
        transport.commitFilesAtomically === undefined
    ) {
        return fail({
            code: "invalid-request",
            message:
                `${transport.describe} cannot make a guarded multi-file Git commit, so the managed workflows ` +
                "were not changed one file at a time.",
            missingScopes: null,
        });
    }

    let plans: readonly TemplatePlan[];
    let markerState: ManagedMarkerState;
    let expectedHead: Awaited<ReturnType<NonNullable<CiTransport["readRepositoryHead"]>>>;
    let expectedHeadSha: string;
    try {
        expectedHead = await transport.readRepositoryHead(owner, repo);
        if (expectedHead.sha === null) {
            return fail({
                code: "empty-repository",
                message:
                    `${owner}/${repo} has no first commit yet. GitHub does not allow its Git Data API to create ` +
                    "the first branch ref, so the managed workflows cannot be installed atomically. Create one " +
                    "starter commit (the in-app repository creator does this automatically), then try again. Nothing was changed.",
                missingScopes: null,
            });
        }
        expectedHeadSha = expectedHead.sha;
        markerState = await readManagedMarker(transport, owner, repo, expectedHeadSha);
        if (markerState.kind === "foreign") {
            return fail({
                code: "user-authored-conflict",
                message:
                    `${markerState.path} already exists on ${owner}/${repo} but is not a valid marker written ` +
                    "by this application. Nothing was changed; move or rename that file before preparing again.",
                missingScopes: null,
            });
        }
        if (
            markerState.kind === "ours" &&
            markerState.marker.version > CI_BOOTSTRAP_MARKER_VERSION
        ) {
            return fail({
                code: "newer-marker-version",
                message:
                    `${owner}/${repo} was prepared with marker schema ${markerState.marker.version}, newer than ` +
                    `schema ${CI_BOOTSTRAP_MARKER_VERSION} understood by this build. This older build will not downgrade it.`,
                missingScopes: null,
            });
        }
        if (
            markerState.kind === "ours" &&
            markerState.marker.version === CI_BOOTSTRAP_MARKER_VERSION &&
            markerState.marker.templateVersion > options.templateVersion
        ) {
            return fail({
                code: "newer-template-version",
                message:
                    `${owner}/${repo} has managed workflow template version ${markerState.marker.templateVersion}, ` +
                    `newer than version ${options.templateVersion} in this build. This older build will not downgrade it.`,
                missingScopes: null,
            });
        }
        plans = await Promise.all(
            options.templates.map((template) =>
                planTemplate(
                    transport,
                    owner,
                    repo,
                    template,
                    markerState.kind === "ours" ? markerState.marker : null,
                    expectedHeadSha,
                ),
            ),
        );
    } catch (error) {
        return fail(toHttpFailure(error));
    }

    const outcomes: CiBootstrapFileOutcome[] = plans.map((plan) => ({
        path: plan.template.path,
        action: planAction(plan.kind),
        reason: plan.reason,
    }));
    const refused = outcomes.filter((outcome) => outcome.action === "refused");
    if (refused.length > 0) {
        for (const outcome of outcomes) emit({ type: "file", outcome, at: stamp() });
        const modified = plans.some((plan) => plan.failureCode === "managed-file-modified");
        return fail({
            code: modified ? "managed-file-modified" : "user-authored-conflict",
            message:
                `${refused.map((outcome) => outcome.path).join(", ")} ${modified ? "no longer match the exact bytes this application installed" : "cannot be claimed as application-managed files"}. ` +
                "Nothing was overwritten. Keep the edits and manage the workflows yourself, or restore the installed bytes before trying again.",
            missingScopes: null,
        });
    }

    const desiredHashes = Object.fromEntries(
        options.templates.map((template) => [template.path, sha256Of(template.content)]),
    );
    const markerCurrent =
        markerState.kind === "ours" &&
        markerState.path === CI_BOOTSTRAP_MARKER_FILE &&
        markerMatches(
            markerState.marker,
            options.templates,
            options.templateVersion,
            desiredHashes,
        );
    const needsCommit =
        plans.some((plan) => plan.kind === "create" || plan.kind === "update") || !markerCurrent;
    let markerWritten = false;
    if (needsCommit) {
        const marker: CiBootstrapMarker = {
            tool: CI_BOOTSTRAP_MARKER_TOOL,
            version: CI_BOOTSTRAP_MARKER_VERSION,
            templateVersion: options.templateVersion,
            files: options.templates.map((template) => template.path),
            fileHashes: desiredHashes,
            preparedAt: stamp(),
        };
        try {
            await transport.commitFilesAtomically(owner, repo, {
                branch: expectedHead.branch,
                expectedHeadSha,
                files: [
                    ...options.templates.map((template) => ({
                        path: template.path,
                        contentBase64: base64Of(template.content),
                    })),
                    {
                        path: CI_BOOTSTRAP_MARKER_FILE,
                        contentBase64: base64Of(`${JSON.stringify(marker, null, 2)}\n`),
                    },
                ],
                message: `Update managed CI render workflows (WorldLens template ${options.templateVersion})`,
            });
            markerWritten = true;
        } catch (error) {
            if (error instanceof CiAtomicCommitConflictError) {
                return fail({
                    code: "concurrent-update",
                    message: error.message,
                    missingScopes: null,
                });
            }
            return fail(toHttpFailure(error));
        }
    } else {
        notes.push(
            "Every file this application manages was already up to date, so nothing was written.",
        );
    }
    // A planned create/update is not reported as completed until the guarded ref update
    // succeeds. On a conflict or injected object-write failure, no progress event claims
    // repository-visible bytes changed when they did not.
    for (const outcome of outcomes) emit({ type: "file", outcome, at: stamp() });

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
                    policy.allowedActions === null
                        ? ""
                        : `, allowed actions: ${policy.allowedActions}`
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
    readonly reason: string | null;
    readonly failureCode: "user-authored-conflict" | "managed-file-modified" | null;
}

interface StoredManagedMarker {
    readonly tool: string;
    readonly version: number;
    readonly templateVersion: number;
    readonly files: readonly string[];
    readonly fileHashes: Readonly<Record<string, string>>;
}

type ManagedMarkerState =
    | { readonly kind: "absent" }
    | { readonly kind: "foreign"; readonly path: string }
    | { readonly kind: "ours"; readonly path: string; readonly marker: StoredManagedMarker };

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

function sha256Of(text: string): string {
    return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

/**
 * Decides what would happen to one template, without writing anything.
 *
 * Read-only by construction - this is what lets {@link bootstrapCiRepository} plan every
 * template before committing to any write, so a conflict on a later file never leaves the
 * first one already changed.
 */
async function planTemplate(
    transport: CiTransport,
    owner: string,
    repo: string,
    template: CiWorkflowTemplate,
    marker: StoredManagedMarker | null,
    ref: string,
): Promise<TemplatePlan> {
    const existing = await transport.readFile(owner, repo, template.path, ref);
    const markerOwnsPath = marker?.files.includes(template.path) === true;
    if (existing === null) {
        if (markerOwnsPath) {
            return {
                template,
                kind: "refuse",
                reason:
                    `${template.path} was previously installed by this application but is now missing. ` +
                    "Its deletion is treated as a user edit and will not be reversed automatically.",
                failureCode: "managed-file-modified",
            };
        }
        return { template, kind: "create", reason: null, failureCode: null };
    }

    const existingContent = textOf(existing.contentBase64);
    if (existingContent === template.content) {
        if (!markerOwnsPath) {
            return {
                template,
                kind: "refuse",
                reason:
                    `${template.path} already exists but no valid marker claims it. Matching bytes are not ` +
                    "enough to take ownership of a user-authored file.",
                failureCode: "user-authored-conflict",
            };
        }
        return { template, kind: "unchanged", reason: null, failureCode: null };
    }

    if (!markerOwnsPath) {
        return {
            template,
            kind: "refuse",
            reason: `${template.path} already exists on ${owner}/${repo} and was not written by this application.`,
            failureCode: "user-authored-conflict",
        };
    }

    const installedHash = marker?.fileHashes[template.path];
    if (
        marker?.version !== CI_BOOTSTRAP_MARKER_VERSION ||
        installedHash === undefined ||
        sha256Of(existingContent) !== installedHash
    ) {
        return {
            template,
            kind: "refuse",
            reason:
                `${template.path} differs from the exact SHA-256 recorded when it was installed. ` +
                "It is treated as user-edited and will not be overwritten.",
            failureCode: "managed-file-modified",
        };
    }

    return {
        template,
        kind: "update",
        reason:
            `The copy of ${template.path} already on ${owner}/${repo} was from an earlier version of this ` +
            "application. It has been brought up to date; nothing else on the repository was touched.",
        failureCode: null,
    };
}

function parseManagedMarker(contentBase64: string): StoredManagedMarker | null {
    try {
        const parsed = JSON.parse(textOf(contentBase64)) as Record<string, unknown>;
        if (
            parsed["tool"] !== CI_BOOTSTRAP_MARKER_TOOL &&
            parsed["tool"] !== LEGACY_CI_BOOTSTRAP_MARKER_TOOL
        ) {
            return null;
        }
        const version = parsed["version"];
        const files = parsed["files"];
        if (!Number.isSafeInteger(version) || (version as number) < 1) return null;
        // A future schema is still recognisably ours from its stable tool/version header.
        // Its remaining shape is deliberately not interpreted by this older build; the
        // caller will issue the typed no-downgrade refusal before planning any file.
        if ((version as number) > CI_BOOTSTRAP_MARKER_VERSION) {
            return {
                tool: parsed["tool"] as string,
                version: version as number,
                templateVersion:
                    typeof parsed["templateVersion"] === "number" ? parsed["templateVersion"] : 0,
                files: [],
                fileHashes: {},
            };
        }
        if (!Array.isArray(files)) return null;
        if (!files.every((path) => typeof path === "string" && path.length > 0)) return null;

        const rawTemplateVersion = parsed["templateVersion"];
        const templateVersion =
            typeof rawTemplateVersion === "number" && Number.isSafeInteger(rawTemplateVersion)
                ? rawTemplateVersion
                : 0;
        const rawHashes = parsed["fileHashes"];
        const fileHashes: Record<string, string> = {};
        if (typeof rawHashes === "object" && rawHashes !== null) {
            for (const [path, hash] of Object.entries(rawHashes)) {
                if (typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash))
                    fileHashes[path] = hash;
            }
        }
        if ((version as number) >= CI_BOOTSTRAP_MARKER_VERSION) {
            if (
                templateVersion < 1 ||
                (files as string[]).some((path) => fileHashes[path] === undefined)
            )
                return null;
        }
        return {
            tool: parsed["tool"] as string,
            version: version as number,
            templateVersion,
            files: files as string[],
            fileHashes,
        };
    } catch {
        return null;
    }
}

async function readManagedMarker(
    transport: CiTransport,
    owner: string,
    repo: string,
    ref: string,
): Promise<ManagedMarkerState> {
    for (const path of [CI_BOOTSTRAP_MARKER_FILE, LEGACY_CI_BOOTSTRAP_MARKER_FILE]) {
        const file = await transport.readFile(owner, repo, path, ref);
        if (file === null) continue;
        const marker = parseManagedMarker(file.contentBase64);
        return marker === null ? { kind: "foreign", path } : { kind: "ours", path, marker };
    }
    return { kind: "absent" };
}

function markerMatches(
    marker: StoredManagedMarker,
    templates: readonly CiWorkflowTemplate[],
    templateVersion: number,
    hashes: Readonly<Record<string, string>>,
): boolean {
    if (
        marker.tool !== CI_BOOTSTRAP_MARKER_TOOL ||
        marker.version !== CI_BOOTSTRAP_MARKER_VERSION ||
        marker.templateVersion !== templateVersion
    ) {
        return false;
    }
    const paths = templates.map((template) => template.path);
    if (
        marker.files.length !== paths.length ||
        marker.files.some((path, index) => path !== paths[index])
    )
        return false;
    return paths.every((path) => marker.fileHashes[path] === hashes[path]);
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
        message:
            message.length > 0
                ? message
                : "This repository could not be prepared, and nothing said why.",
        missingScopes: null,
    };
}

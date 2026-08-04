/**
 * Why a render did not happen, in a form the interface can act on.
 *
 * A render can fail for reasons the person is expected to fix, and every one of them
 * has a different remedy: accept the Mojang licence, install a JDK, build the jars,
 * point the map at a world that exists. A single `Error` with a sentence in it forces
 * the interface to match on prose, so the code is the contract and the message is the
 * explanation beside it.
 *
 * Every failure that a setting can fix carries the setting, because a report that says
 * what is wrong and not where to change it is a dead end at the exact moment somebody
 * knows what they want to do.
 */

export type RenderFailureCode =
    /** Mojang download consent has not been given. Nothing was spawned. */
    | "consent-required"
    /** No JDK new enough to run the CLI, and provisioning was not permitted or failed. */
    | "java-unavailable"
    /** The BlueMap CLI jar is not present; in a checkout it has not been built yet. */
    | "cli-jar-missing"
    /** A map's world folder does not exist or is not readable. */
    | "world-not-found"
    /** The render workspace could not be created or written. */
    | "workspace-unwritable"
    /** The request itself is not renderable: no maps, a duplicate id, a bad id. */
    | "invalid-request"
    /** A render for this id is already in flight. */
    | "already-running"
    /**
     * The CLI ran and updated nothing.
     *
     * This is its own code because the CLI reports it as success. A misconfigured map
     * makes it print a warning banner, then `Start updating 0 maps ...`, then
     * `Your maps are now all up-to-date!`, and then exit **0**. Treating that exit code
     * as the answer would report a render that produced no tiles as a completed render.
     */
    | "no-maps-rendered"
    /** The CLI exited non-zero, or could not be spawned at all. */
    | "cli-failed"
    /**
     * A container render was asked for and Docker cannot take one right now.
     *
     * Its own code because the answer is never "render it locally instead". A silent
     * fallback would hand somebody a finished map and let them believe they had tested
     * the container path; the first time they relied on it would be the first time they
     * found out they never had. Nothing was spawned.
     */
    | "docker-unavailable"
    /**
     * A folder a container render needs may not be shared with a container.
     *
     * Separate from `world-not-found` because the folder is there - it is the *choice*
     * that is refused. Pointing the world picker at a home directory one level too high
     * would otherwise hand a container an entire profile.
     */
    | "container-mount-refused"
    /** The person cancelled it. */
    | "cancelled";

/**
 * A place in the interface that fixes a failure.
 *
 * Deliberately not a URL. The shell has no router; it is a tabbed surface whose
 * destinations are components, and `ConsentSettingsRow` already takes a `missing` prop
 * for exactly this arrival. An identifier the shell resolves cannot rot into a link to
 * a page that no longer exists.
 */
export interface SettingsTarget {
    readonly surface: "settings";
    /** The control to reveal and draw attention to. */
    readonly anchor: SettingsAnchor;
    /** Tells the destination it was opened because the setting is missing. */
    readonly missing: boolean;
}

export type SettingsAnchor =
    | "mojang-download-consent"
    | "java-runtime"
    | "map-storage-directory"
    | "world-folder";

export interface RenderFailure {
    readonly code: RenderFailureCode;
    /** One sentence naming what is wrong, in words a person can act on. */
    readonly message: string;
    /** Where to send somebody to fix it, or null when no setting would help. */
    readonly settings: SettingsTarget | null;
    /**
     * Supporting evidence: the CLI's own warning banner, the directories that were
     * searched for a jar, the discovery report for a missing JDK. Null when there is
     * nothing more to say than the message.
     */
    readonly detail: string | null;
    /** The CLI's exit code when it ran and failed, null when it never ran. */
    readonly exitCode: number | null;
}

/** True when nothing was spawned, so the failure cost nothing and changed nothing. */
export function failedBeforeSpawning(failure: RenderFailure): boolean {
    return failure.exitCode === null && failure.code !== "cli-failed";
}

function failure(
    code: RenderFailureCode,
    message: string,
    extra: {
        readonly settings?: SettingsTarget;
        readonly detail?: string;
        readonly exitCode?: number;
    } = {},
): RenderFailure {
    return {
        code,
        message,
        settings: extra.settings ?? null,
        detail: extra.detail ?? null,
        exitCode: extra.exitCode ?? null,
    };
}

/**
 * Consent was never given, so no render was started.
 *
 * The wording is what the interface shows, and it is deliberately not a request. The
 * question was asked once at first launch and answered; asking it again here, on top
 * of a world somebody has just chosen, is the nagging the consent module exists to
 * prevent. This says what is missing and points at the row that changes it.
 */
export function consentRequired(): RenderFailure {
    return failure(
        "consent-required",
        "Rendering needs the Minecraft client files, and the Mojang download has not been accepted. " +
            "Accept it in Settings and start the render again.",
        {
            settings: { surface: "settings", anchor: "mojang-download-consent", missing: true },
        },
    );
}

export function javaUnavailable(detail: string): RenderFailure {
    return failure(
        "java-unavailable",
        "No Java runtime new enough to run the BlueMap engine was found.",
        { settings: { surface: "settings", anchor: "java-runtime", missing: true }, detail },
    );
}

export function cliJarMissing(detail: string): RenderFailure {
    return failure("cli-jar-missing", "The BlueMap engine is not installed.", { detail });
}

export function worldNotFound(mapId: string, world: string): RenderFailure {
    return failure(
        "world-not-found",
        `The world folder for map '${mapId}' does not exist.`,
        {
            settings: { surface: "settings", anchor: "world-folder", missing: true },
            detail: world,
        },
    );
}

export function workspaceUnwritable(directory: string, detail: string): RenderFailure {
    return failure(
        "workspace-unwritable",
        "The render workspace could not be written.",
        {
            settings: { surface: "settings", anchor: "map-storage-directory", missing: false },
            detail: `${directory}: ${detail}`,
        },
    );
}

export function invalidRequest(message: string): RenderFailure {
    return failure("invalid-request", message);
}

export function alreadyRunning(renderId: string): RenderFailure {
    return failure("already-running", `A render of '${renderId}' is already in progress.`);
}

export function noMapsRendered(detail: string | null): RenderFailure {
    return failure(
        "no-maps-rendered",
        "The engine ran but updated no maps, so nothing was rendered.",
        {
            exitCode: 0,
            ...(detail === null ? {} : { detail }),
        },
    );
}

export function cliFailed(exitCode: number, detail: string | null): RenderFailure {
    return failure("cli-failed", `The BlueMap engine exited with code ${String(exitCode)}.`, {
        exitCode,
        ...(detail === null ? {} : { detail }),
    });
}

export function spawnFailed(detail: string): RenderFailure {
    return failure("cli-failed", "The BlueMap engine could not be started.", { detail });
}

export function cancelled(): RenderFailure {
    return failure("cancelled", "The render was cancelled.");
}

/**
 * A container render was asked for and Docker will not take one.
 *
 * The probe's own sentence travels inside this one rather than being replaced by a
 * generic "Docker is unavailable". Those two states - not installed, and installed with
 * its daemon stopped - have completely different remedies, and the second one is the
 * common one: telling somebody who has just closed Docker Desktop to go and install
 * Docker sends them to download software they already have. `runtime/docker.ts` is what
 * distinguishes the five states, and this is where its work reaches a person.
 *
 * `settings` is null. None of the anchors this file owns is where a render's runtime is
 * chosen, and a link that opens the wrong screen at the exact moment somebody knows what
 * they want to change is worse than no link.
 */
export function dockerUnavailable(message: string, detail: string | null): RenderFailure {
    return failure(
        "docker-unavailable",
        `This render was asked to run in a container, and it cannot: ${message}`,
        detail === null ? {} : { detail },
    );
}

/**
 * A folder may not be handed to a container. Carries `runtime/mounts.ts`'s own sentence.
 *
 * That sentence already names the folder and says what to choose instead, so it is shown
 * as written rather than wrapped: rephrasing it here would produce two places to keep the
 * explanation of a refusal correct, and they would drift.
 */
export function containerMountRefused(reason: string): RenderFailure {
    return failure("container-mount-refused", reason);
}

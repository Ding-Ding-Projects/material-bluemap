/**
 * Where a render runs, as a choice somebody actually makes.
 *
 * Three places, and the honest difference between them is not the one people expect:
 *
 * ```
 * local     the engine as an ordinary program on this computer, on the Java this app found
 * docker    the same engine, in a container on this computer, on the Java in the image
 * remote    the same engine, in a container on another machine, over SSH
 * ```
 *
 * ## Docker is not a speed setting, and the copy says so
 *
 * A container runs on the same cores, reads the same disk and gets the same memory. On
 * Windows it runs inside a Linux virtual machine and reaches the world folder through a
 * file-sharing layer, so a render of a large world is usually **slower** there than the same
 * render run locally. What it changes is *isolation* - the container sees the world folder
 * read-only, the output folder, and nothing else on this computer - and *which Java runs*,
 * so a machine with no JDK, or one too old, can still render.
 *
 * Somebody who chooses Docker for speed has chosen it for the one thing it cannot do, and an
 * interface that lets them is an interface that misled them. So the description below says
 * it in the same breath as the benefit rather than in a footnote.
 *
 * ## Availability is three separate questions
 *
 * A place can be unavailable because the tool is not there, because the tool is there and
 * not running, or because *this build* has no way to hand a render to it. They are not the
 * same and they do not have the same fix, so {@link RunPlaceState} keeps them apart and the
 * surface renders each with its own sentence.
 */

import type { Translate } from "../world/worldFolder.js";
import type { DockerNote } from "./dockerStates.js";

export type RunLocation = "local" | "docker" | "remote";

export const RUN_LOCATIONS: readonly RunLocation[] = ["local", "docker", "remote"];

/** Local, always, unless somebody chooses otherwise. Matches `DEFAULT_RUNTIME_MODE`. */
export const DEFAULT_RUN_LOCATION: RunLocation = "local";

export type RunPlaceState =
    /** It can take a render right now. */
    | "ready"
    /** The tool is here and something about its state stops it. */
    | "blocked"
    /** This build has no channel to hand a render to it, whatever the tool's state. */
    | "unsupported"
    /** It could take a render once something has been chosen or checked first. */
    | "needs-setup";

export interface RunPlace {
    readonly id: RunLocation;
    readonly title: string;
    /** What choosing this actually means, benefits and costs in the same sentence. */
    readonly summary: string;
    readonly state: RunPlaceState;
    /** Why it is not ready, or empty when it is. Never a bare "unavailable". */
    readonly reason: string;
    readonly selectable: boolean;
}

export interface RunPlaceInput {
    /** True when the ordinary local render path exists in this build. */
    readonly canRenderLocally: boolean;
    /** True when this build's `startRender` genuinely honours a Docker choice. */
    readonly canRenderInDocker: boolean;
    /** Docker's own state on this machine, or null when it has not been read yet. */
    readonly docker: DockerNote | null;
    /** True when this build can hand a render to another machine over SSH. */
    readonly canRenderRemotely: boolean;
    /** True when a remote target has been chosen. */
    readonly hasTarget: boolean;
    /** True when the chosen target's preflight has passed in full. */
    readonly preflightPassed: boolean;
}

/**
 * The three places, each with its state and the reason for it.
 *
 * Computed rather than held, so a Docker daemon started while the app is open changes the
 * screen the next time it is probed instead of at the next launch.
 */
export function runPlaces(input: RunPlaceInput, t: Translate): readonly RunPlace[] {
    return [localPlace(input, t), dockerPlace(input, t), remotePlace(input, t)];
}

function localPlace(input: RunPlaceInput, t: Translate): RunPlace {
    const ready = input.canRenderLocally;
    return {
        id: "local",
        title: t("remote.place.local.title", "On this computer"),
        summary: t(
            "remote.place.local.summary",
            "The engine runs as an ordinary program, on the Java this application found or installed. Fastest of the three, because nothing sits between it and your disk.",
        ),
        state: ready ? "ready" : "unsupported",
        reason: ready
            ? ""
            : t(
                  "remote.place.local.unsupported",
                  "This build cannot start a render at all. Rendering is what the desktop application does; a browser tab has no engine to run.",
              ),
        selectable: ready,
    };
}

function dockerPlace(input: RunPlaceInput, t: Translate): RunPlace {
    const summary = t(
        "remote.place.docker.summary",
        "The same engine, in a container on this computer. It gets you isolation - the container sees the world folder read-only, the output folder, and nothing else here - and the Java inside the image rather than the one on your machine. It does not get you more processors: on Windows the container reaches your world through the virtual machine's file sharing, so a large world usually renders slower this way than locally.",
    );

    if (!input.canRenderInDocker) {
        return {
            id: "docker",
            title: t("remote.place.docker.title", "In a container on this computer"),
            summary,
            state: "unsupported",
            reason: t(
                "remote.place.docker.unsupported",
                "This build of the shell does not offer to hand a render to a container on this machine, so choosing it would render locally instead - which is why it is not offered. Docker's state is still reported below, and rendering on a remote host does use a container.",
            ),
            selectable: false,
        };
    }

    const docker = input.docker;
    if (docker === null) {
        return {
            id: "docker",
            title: t("remote.place.docker.title", "In a container on this computer"),
            summary,
            state: "needs-setup",
            reason: t("remote.place.docker.unchecked", "Docker has not been checked yet."),
            selectable: false,
        };
    }

    return {
        id: "docker",
        title: t("remote.place.docker.title", "In a container on this computer"),
        summary,
        state: docker.usable ? "ready" : "blocked",
        // The Docker note already says the state and the next step in its own words, and
        // saying it twice in two different phrasings is how the two drift apart.
        reason: docker.usable ? "" : docker.headline,
        selectable: docker.usable,
    };
}

function remotePlace(input: RunPlaceInput, t: Translate): RunPlace {
    const summary = t(
        "remote.place.remote.summary",
        "The world is copied to a Linux machine you name, rendered in a container there, and the finished tiles are copied back. Worth it when that machine is faster than this one, or when you would rather not tie this one up for hours. It costs an upload of the whole world first.",
    );
    const title = t("remote.place.remote.title", "On another machine, over SSH");

    if (!input.canRenderRemotely) {
        return {
            id: "remote",
            title,
            summary,
            state: "unsupported",
            reason: t(
                "remote.place.remote.unsupported",
                "This build cannot reach another machine. The desktop application is what runs ssh, checks the host key and copies the world; a browser tab can do none of those.",
            ),
            selectable: false,
        };
    }
    if (!input.hasTarget) {
        return {
            id: "remote",
            title,
            summary,
            state: "needs-setup",
            reason: t(
                "remote.place.remote.noTarget",
                "No machine has been set up yet. Add one below: a host, a user, and either your SSH agent or the path to a key file.",
            ),
            selectable: false,
        };
    }
    if (!input.preflightPassed) {
        return {
            id: "remote",
            title,
            summary,
            state: "needs-setup",
            reason: t(
                "remote.place.remote.noPreflight",
                "That machine has not passed its checks yet. Nothing is uploaded until ssh, the host key, Docker and free disk have all been proved, in that order.",
            ),
            selectable: false,
        };
    }
    return { id: "remote", title, summary, state: "ready", reason: "", selectable: true };
}

/**
 * The place that is actually going to be used.
 *
 * A choice that has stopped being selectable - the Docker daemon was stopped, the target
 * was deleted, the preflight was invalidated - falls back to local rather than being
 * carried into a render that would then fail. The surface says when this happens; silently
 * running somewhere other than where the person chose is the failure this exists to prevent.
 */
export function effectiveLocation(
    chosen: RunLocation,
    places: readonly RunPlace[],
): RunLocation {
    const place = places.find((candidate) => candidate.id === chosen);
    return place !== undefined && place.selectable ? chosen : DEFAULT_RUN_LOCATION;
}

/** One line naming where the render is about to go, for the review of what will happen. */
export function describeChoice(
    location: RunLocation,
    targetLabel: string | null,
    t: Translate,
): string {
    switch (location) {
        case "local":
            return t("remote.choice.local", "This render will run on this computer, as an ordinary program.");
        case "docker":
            return t(
                "remote.choice.docker",
                "This render will run in a container on this computer. Same cores, same disk, different Java.",
            );
        case "remote":
            return targetLabel === null
                ? t("remote.choice.remoteUnnamed", "This render will run on another machine over SSH.")
                : t(
                      "remote.choice.remote",
                      { target: targetLabel },
                      "This render will run on {target}, in a container, over SSH. The world is uploaded there first.",
                  );
    }
}

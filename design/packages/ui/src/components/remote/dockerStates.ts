/**
 * Docker's five states, each said differently.
 *
 * `main/runtime/docker.ts` goes to real trouble to tell these apart, and the whole value of
 * that work is lost if the interface collapses them back into one red line. The two that
 * matter most look identical to a naive reader and have opposite fixes:
 *
 * - **Docker 29.6.1 is installed and its daemon is not running.** The fix is to start
 *   Docker Desktop. It is already downloaded, already installed, already on the PATH.
 * - **Docker is not installed.** The fix is to install it, or to stop trying and render
 *   locally, which needs nothing.
 *
 * Telling somebody in the first state that "Docker is not available" sends them to download
 * an installer for software sitting in their applications folder. So each state below has
 * its own headline, its own explanation and its own next step, and every one of them names
 * the client version when Docker was willing to say it - because "Docker 29.6.1 is
 * installed, and..." is the half of the sentence that makes the rest of it credible.
 *
 * Nothing here is translated at the point of use. The keys and their English fallbacks live
 * together so a caller with a translator renders one and a caller without renders the other,
 * and the two cannot say different things.
 */

import type { DockerSummary, DockerStatus } from "./remoteBridge.js";
import type { Translate } from "../world/worldFolder.js";

/** How the note should look, in the alert vocabulary the rest of the app already uses. */
export type DockerTone = "success" | "info" | "warning" | "error";

export interface DockerNote {
    readonly status: DockerStatus;
    readonly tone: DockerTone;
    /** One line naming the state, with the version in it whenever there is one. */
    readonly headline: string;
    /** What it means, in this application's terms rather than Docker's. */
    readonly explanation: string;
    /** The single next thing to do. Never empty; "nothing" is said as a sentence. */
    readonly nextStep: string;
    /** Docker's own words, for a disclosure. Null when it had none. */
    readonly detail: string | null;
    /** True only when a container can be started right now. */
    readonly usable: boolean;
}

/** `Docker 29.6.1` when it said, `Docker` when it did not. Used by four of the five. */
export function dockerName(summary: DockerSummary, t: Translate): string {
    return summary.clientVersion === null
        ? t("remote.docker.plainName", "Docker")
        : t("remote.docker.versionedName", { version: summary.clientVersion }, "Docker {version}");
}

/**
 * The note for one probe result.
 *
 * `summary.message` from the main process is deliberately *not* used as the headline. It is
 * a good sentence and it is kept as {@link DockerNote.detail}'s neighbour where it is
 * useful, but a headline that is whatever the main process last worded is a headline the
 * interface cannot lay out, translate or test. The status is the contract; the prose here
 * is the interface's own.
 */
export function describeDocker(summary: DockerSummary, t: Translate): DockerNote {
    const name = dockerName(summary, t);
    const detail = summary.detail;

    switch (summary.status) {
        case "available":
            return {
                status: "available",
                tone: "success",
                headline:
                    summary.serverVersion === null
                        ? t(
                              "remote.docker.available.headline",
                              { name },
                              "{name} is installed and its daemon is running.",
                          )
                        : t(
                              "remote.docker.available.headlineServer",
                              { name, server: summary.serverVersion },
                              "{name} is installed and its daemon ({server}) is running.",
                          ),
                explanation: t(
                    "remote.docker.available.explanation",
                    "A container can be started right now. The engine would run on the Java inside the image rather than the Java on this machine, and it would see the world folder, the output folder and nothing else here.",
                ),
                nextStep: t(
                    "remote.docker.available.next",
                    "Nothing to do. Choose it below if you want the isolation; local is faster.",
                ),
                detail,
                usable: true,
            };

        case "daemon-unreachable":
            return {
                status: "daemon-unreachable",
                tone: "warning",
                headline: t(
                    "remote.docker.daemonDown.headline",
                    { name },
                    "{name} is installed, and its daemon is not running.",
                ),
                explanation: t(
                    "remote.docker.daemonDown.explanation",
                    "The 'docker' command is here and answered about itself, but the engine behind it did not answer at all. Nothing is missing and nothing needs downloading: the part that actually runs containers is switched off.",
                ),
                nextStep: t(
                    "remote.docker.daemonDown.next",
                    "Start Docker Desktop (or the docker service), wait for it to finish starting, and check again.",
                ),
                detail,
                usable: false,
            };

        case "not-installed":
            return {
                status: "not-installed",
                tone: "info",
                headline: t(
                    "remote.docker.missing.headline",
                    "Docker is not installed on this computer.",
                ),
                explanation: t(
                    "remote.docker.missing.explanation",
                    "There is no 'docker' command on this account's PATH, so there is nothing here to start a container with. This is not a fault: rendering on this machine as an ordinary program needs none of it.",
                ),
                nextStep: t(
                    "remote.docker.missing.next",
                    "Install Docker Desktop if you want container isolation, or leave this alone and render locally.",
                ),
                detail,
                usable: false,
            };

        case "refused":
            return {
                status: "refused",
                tone: "warning",
                headline: t(
                    "remote.docker.refused.headline",
                    { name },
                    "{name} is installed, and this account may not talk to its daemon.",
                ),
                explanation: t(
                    "remote.docker.refused.explanation",
                    "The daemon is running and it refused this account rather than failing to answer. That is a permission on the daemon's socket, not a problem with Docker or with this application.",
                ),
                nextStep: t(
                    "remote.docker.refused.next",
                    "Add this account to the group that may use Docker (on Linux, usually 'docker'), then sign out and in again so the new group takes effect.",
                ),
                detail,
                usable: false,
            };

        case "unusable":
            return {
                status: "unusable",
                tone: "error",
                headline: t(
                    "remote.docker.unusable.headline",
                    { name },
                    "{name} answered with something this application does not recognise.",
                ),
                explanation: t(
                    "remote.docker.unusable.explanation",
                    "The command ran and its answer was neither a working daemon nor any of the failures this application knows how to explain. Docker's own words are below, and they are the precise thing to search for.",
                ),
                nextStep: t(
                    "remote.docker.unusable.next",
                    "Run 'docker version' in a terminal and read what it says. Rendering locally is unaffected.",
                ),
                detail,
                usable: false,
            };
    }
}

/**
 * The note for a build that cannot look at all.
 *
 * Kept apart from {@link describeDocker} rather than folded into `unusable`, because
 * "Docker answered strangely" and "nobody asked Docker anything" are different facts and
 * only one of them is about Docker. A surface that reports the second as the first sends
 * somebody to debug an installation that may be perfectly fine.
 */
export function dockerNotProbed(t: Translate): DockerNote {
    return {
        status: "unusable",
        tone: "info",
        headline: t(
            "remote.docker.unprobed.headline",
            "This build cannot check whether Docker is here.",
        ),
        explanation: t(
            "remote.docker.unprobed.explanation",
            "Nothing has been asked of Docker, so nothing is known about it. This is a limit of the build you are running, not a statement about your machine.",
        ),
        nextStep: t(
            "remote.docker.unprobed.next",
            "Open this in the desktop application to see Docker's real state. Rendering locally works either way.",
        ),
        detail: null,
        usable: false,
    };
}

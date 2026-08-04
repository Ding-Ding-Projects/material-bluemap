/**
 * The three places a render can be sent, and what the interface is allowed to claim.
 *
 * Two properties matter more than the rest and both are about not misleading somebody:
 *
 * 1. **Docker is never sold as speed.** Its description has to name the cost in the same
 *    breath as the benefit, because somebody choosing a container to render faster has
 *    chosen it for the one thing it cannot do.
 * 2. **A place that cannot take a render is never selectable.** A choice that silently
 *    falls back to the local engine leaves the person believing they chose, which is worse
 *    than the choice not being offered.
 */

import { describe, expect, it } from "vitest";
import { describeDocker } from "./dockerStates.js";
import {
    DEFAULT_RUN_LOCATION,
    describeChoice,
    effectiveLocation,
    runPlaces,
    type RunPlaceInput,
} from "./runtimeChoice.js";
import type { DockerSummary } from "./remoteBridge.js";
import { t } from "./testTranslate.js";

const dockerReady: DockerSummary = {
    status: "available",
    available: true,
    clientVersion: "29.6.1",
    serverVersion: "29.6.1",
    message: "",
    detail: null,
};

const dockerStopped: DockerSummary = { ...dockerReady, status: "daemon-unreachable", available: false, serverVersion: null };

const everything: RunPlaceInput = {
    canRenderLocally: true,
    canRenderInDocker: true,
    docker: describeDocker(dockerReady, t),
    canRenderRemotely: true,
    hasTarget: true,
    preflightPassed: true,
};

function place(input: Partial<RunPlaceInput>, id: "local" | "docker" | "remote") {
    const found = runPlaces({ ...everything, ...input }, t).find((entry) => entry.id === id);
    if (found === undefined) throw new Error(`no place ${id}`);
    return found;
}

describe("what each place is honestly worth", () => {
    it("names Docker's cost in the same sentence as its benefit", () => {
        const docker = place({}, "docker");

        expect(docker.summary).toMatch(/isolation/i);
        expect(docker.summary).toMatch(/Java/);
        // The load-bearing half. Without this the description reads as an upgrade.
        expect(docker.summary).toMatch(/does not get you more processors/i);
        expect(docker.summary).toMatch(/slower/i);
    });

    it("does not describe a remote machine as free", () => {
        // Somebody's whole world goes up the wire first, and on a domestic connection that
        // is the expensive part of the whole exercise.
        expect(place({}, "remote").summary).toMatch(/upload/i);
    });

    it("says the local engine is the fast one, because it is", () => {
        expect(place({}, "local").summary).toMatch(/fastest/i);
    });
});

describe("what may be chosen", () => {
    it("offers all three when everything is ready", () => {
        expect(runPlaces(everything, t).map((entry) => entry.selectable)).toEqual([true, true, true]);
    });

    it("refuses Docker with the daemon's own state as the reason, not a bare 'unavailable'", () => {
        const docker = place({ docker: describeDocker(dockerStopped, t) }, "docker");

        expect(docker.selectable).toBe(false);
        expect(docker.state).toBe("blocked");
        expect(docker.reason).toContain("29.6.1");
        expect(docker.reason).toMatch(/daemon is not running/i);
    });

    it("refuses Docker outright when this build has no channel to hand a render to it", () => {
        // The failure this prevents: a selectable Docker option that quietly renders
        // locally, leaving somebody certain they used a container when they did not.
        const docker = place({ canRenderInDocker: false }, "docker");

        expect(docker.selectable).toBe(false);
        expect(docker.state).toBe("unsupported");
        expect(docker.reason).toMatch(/no way to hand a render to a container/i);
        expect(docker.reason).toMatch(/quietly render locally/i);
    });

    it("keeps Docker unselectable while its state is simply unknown", () => {
        const docker = place({ docker: null }, "docker");

        expect(docker.selectable).toBe(false);
        expect(docker.state).toBe("needs-setup");
    });

    it("will not send a render to a machine that has not been chosen or has not been checked", () => {
        expect(place({ hasTarget: false }, "remote").selectable).toBe(false);
        expect(place({ hasTarget: false }, "remote").reason).toMatch(/No machine has been set up/i);

        const unchecked = place({ preflightPassed: false }, "remote");
        expect(unchecked.selectable).toBe(false);
        expect(unchecked.reason).toMatch(/Nothing is uploaded until/i);
    });

    it("says a browser build cannot reach another machine, rather than showing an empty list", () => {
        const remote = place({ canRenderRemotely: false }, "remote");

        expect(remote.state).toBe("unsupported");
        expect(remote.reason).toMatch(/desktop application/i);
    });
});

describe("the choice that would actually be used", () => {
    it("is the chosen one while it can take a render", () => {
        expect(effectiveLocation("remote", runPlaces(everything, t))).toBe("remote");
    });

    it("falls back to local the moment the chosen place stops being usable", () => {
        // The daemon stopped, or the machine was forgotten, while the choice sat on screen.
        const places = runPlaces({ ...everything, preflightPassed: false }, t);

        expect(effectiveLocation("remote", places)).toBe(DEFAULT_RUN_LOCATION);
        expect(effectiveLocation("remote", places)).toBe("local");
    });
});

describe("the line that says where this render is going", () => {
    it("names the machine when there is one", () => {
        expect(describeChoice("remote", "the build server", t)).toContain("the build server");
        expect(describeChoice("remote", "the build server", t)).toMatch(/uploaded/i);
    });

    it("still says something true when the machine has no name yet", () => {
        const line = describeChoice("remote", null, t);

        expect(line).toMatch(/another machine/i);
        expect(line).not.toContain("{");
        expect(line).not.toContain("null");
    });

    it("repeats that a container is the same cores and the same disk", () => {
        expect(describeChoice("docker", null, t)).toMatch(/same cores, same disk/i);
    });
});

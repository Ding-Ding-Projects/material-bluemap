/**
 * Docker's five states, and the property that makes distinguishing them worth the trouble.
 *
 * `main/runtime/docker.ts` tells five states apart and reports a client version even in the
 * failure ones. All of that work is thrown away the moment the interface renders two of
 * them with the same words, so the assertion that matters here is not "the wording is nice"
 * but **no two states produce the same headline, explanation or next step**. That is
 * checkable, and it is exactly what regresses when somebody tidies five branches into two.
 *
 * The pair worth naming: a stopped daemon and a missing installation have opposite fixes.
 * Telling somebody in the first that "Docker is not available" sends them to download
 * software already sitting on their disk.
 */

import { describe, expect, it } from "vitest";
import { describeDocker, dockerNotProbed } from "./dockerStates.js";
import type { DockerStatus, DockerSummary } from "./remoteBridge.js";
import { t } from "./testTranslate.js";

const STATES: readonly DockerStatus[] = [
    "available",
    "daemon-unreachable",
    "not-installed",
    "refused",
    "unusable",
];

function summary(status: DockerStatus, overrides: Partial<DockerSummary> = {}): DockerSummary {
    return {
        status,
        available: status === "available",
        clientVersion: "29.6.1",
        serverVersion: status === "available" ? "29.6.1" : null,
        message: "whatever the main process said",
        detail: null,
        ...overrides,
    };
}

describe("the five Docker states", () => {
    it("gives every state its own headline, its own explanation and its own next step", () => {
        const notes = STATES.map((status) => describeDocker(summary(status), t));

        for (const field of ["headline", "explanation", "nextStep"] as const) {
            const said = notes.map((note) => note[field]);
            expect(new Set(said).size, `two states share the same ${field}`).toBe(STATES.length);
            expect(said.every((line) => line.trim() !== "")).toBe(true);
        }
    });

    it("says a stopped daemon and a missing installation completely differently", () => {
        // The two that look alike to a naive reader and have opposite fixes. This is the
        // regression the whole file exists to catch.
        const stopped = describeDocker(summary("daemon-unreachable"), t);
        const missing = describeDocker(summary("not-installed"), t);

        expect(stopped.headline).toContain("29.6.1");
        expect(stopped.headline).toContain("installed");
        expect(stopped.nextStep).toMatch(/start/i);

        expect(missing.headline).not.toContain("29.6.1");
        expect(missing.headline).toMatch(/not installed/i);
        expect(missing.nextStep).toMatch(/install/i);
        expect(missing.nextStep).not.toMatch(/^start/i);
    });

    it("names the client version in every state where Docker was willing to say one", () => {
        // The whole reason the probe reports a client version from a failed run: "Docker
        // 29.6.1 is installed, and..." is the half of the sentence that makes the rest
        // credible. Only the not-installed case has no version to name, by definition.
        for (const status of ["available", "daemon-unreachable", "refused", "unusable"] as const) {
            expect(describeDocker(summary(status), t).headline).toContain("29.6.1");
        }
    });

    it("falls back to a plain name rather than an empty gap when no version was reported", () => {
        const note = describeDocker(summary("daemon-unreachable", { clientVersion: null }), t);

        expect(note.headline).toContain("Docker");
        expect(note.headline).not.toContain("undefined");
        expect(note.headline).not.toContain("null");
    });

    it("names the daemon's version too, but only when the daemon actually answered", () => {
        expect(describeDocker(summary("available"), t).headline).toContain("29.6.1");
        expect(
            describeDocker(summary("available", { serverVersion: null }), t).headline,
        ).not.toContain("(");
    });

    it("marks only the available state as usable", () => {
        for (const status of STATES) {
            expect(describeDocker(summary(status), t).usable).toBe(status === "available");
        }
    });

    it("carries Docker's own words through untouched rather than into the sentence", () => {
        const note = describeDocker(
            summary("daemon-unreachable", { detail: "error during connect: open //./pipe/dockerDesktopLinuxEngine" }),
            t,
        );

        expect(note.detail).toBe("error during connect: open //./pipe/dockerDesktopLinuxEngine");
        expect(note.explanation).not.toContain("//./pipe");
    });

    it("does not treat a state as an error just because it stops a container starting", () => {
        // Docker not being installed is not a fault on a machine that renders locally, and
        // an angry red alert about it would be the interface inventing a problem.
        expect(describeDocker(summary("not-installed"), t).tone).toBe("info");
        expect(describeDocker(summary("available"), t).tone).toBe("success");
        expect(describeDocker(summary("unusable"), t).tone).toBe("error");
    });
});

describe("a build that cannot look at all", () => {
    it("says nobody asked, rather than reporting Docker as broken", () => {
        // "Docker answered strangely" and "nothing asked Docker anything" are different
        // facts and only one of them is about Docker. Reporting the second as the first
        // sends somebody to debug an installation that may be perfectly fine.
        const note = dockerNotProbed(t);

        expect(note.usable).toBe(false);
        expect(note.headline).toMatch(/cannot check/i);
        expect(note.headline).not.toMatch(/not installed|daemon/i);
        expect(note.headline).not.toBe(describeDocker(summary("unusable"), t).headline);
    });
});

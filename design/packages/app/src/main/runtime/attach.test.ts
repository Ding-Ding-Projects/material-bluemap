/**
 * Reading what the daemon said, and turning it into the one sentence a person gets.
 *
 * Every branch below is a decision about one `CommandOutput`, so all of them are exercised
 * with no Docker anywhere near the test machine - which matters here more than usual,
 * because two of the three states this file distinguishes only ever occur on a machine
 * that has just come back from a crash.
 */

import { describe, expect, it } from "vitest";
import type { CommandOutput } from "./command.js";
import {
    attachArguments,
    decideReattach,
    inspectArguments,
    listArguments,
    readInspection,
    type ContainerInspection,
} from "./attach.js";
import { newContainerHandoff, type ContainerHandoff } from "./handoff.js";

function output(partial: Partial<CommandOutput> = {}): CommandOutput {
    return {
        ok: partial.ok ?? true,
        exitCode: partial.exitCode ?? (partial.ok === false ? 1 : 0),
        stdout: partial.stdout ?? "",
        stderr: partial.stderr ?? "",
        spawnError: partial.spawnError ?? null,
    };
}

const RECORD: ContainerHandoff = newContainerHandoff({
    renderId: "world-abc123",
    containerName: "worldlens-world-abc123",
    mode: "docker",
    mapIds: ["overworld"],
    docker: "docker",
    storageRoot: "/renders/world-abc123/web/maps",
    webRoot: "/renders/world-abc123/web",
    cwd: "/renders/world-abc123",
    engine: { id: "upstream-java", label: "BlueMap engine (Java) 5.22-27", version: "5.22-27", javaVersion: null },
    startedAt: "2026-08-04T10:00:00.000Z",
    ownerInstance: "a-dead-app",
});

function inspection(partial: Partial<ContainerInspection>): ContainerInspection {
    return {
        name: RECORD.containerName,
        state: "absent",
        status: null,
        exitCode: null,
        detail: null,
        ...partial,
    };
}

describe("the commands", () => {
    it("asks for the status and the exit code in one call, so they describe one moment", () => {
        // Two calls could straddle the container exiting, and a status read before an exit
        // code read after is a pair of facts about two different containers.
        expect(inspectArguments("c")).toEqual([
            "inspect",
            "--format",
            "{{.State.Status}}|{{.State.ExitCode}}",
            "c",
        ]);
    });

    it("replays the container's whole log rather than only what arrives from now on", () => {
        // `--tail all` is what stops a reattached render showing a bar at zero: the tracker
        // sees every line since the container started and arrives at the real percentage.
        expect(attachArguments("c")).toEqual(["logs", "--follow", "--tail", "all", "c"]);
    });

    it("lists exited containers too, because one that ended is exactly what is being looked for", () => {
        expect(listArguments("worldlens")).toContain("-a");
        expect(listArguments("worldlens")).toContain("name=worldlens");
    });
});

describe("reading one inspection", () => {
    it("reads a running container, and keeps Docker's own status word", () => {
        const read = readInspection("c", output({ stdout: "running|0\n" }));
        expect(read.state).toBe("running");
        expect(read.status).toBe("running");
    });

    it("counts a paused or restarting container as still there, because it can still be stopped", () => {
        expect(readInspection("c", output({ stdout: "paused|0" })).state).toBe("running");
        expect(readInspection("c", output({ stdout: "restarting|0" })).state).toBe("running");
    });

    it("reads an exited container with its exit code", () => {
        const read = readInspection("c", output({ stdout: "exited|137" }));
        expect(read.state).toBe("exited");
        expect(read.exitCode).toBe(137);
    });

    it("reads Docker's 'no such object' as the container being gone", () => {
        const read = readInspection(
            "c",
            output({ ok: false, exitCode: 1, stderr: "Error: No such object: c" }),
        );
        expect(read.state).toBe("absent");
    });

    it("never reads a daemon that is down as a container that is gone", () => {
        // "The container is gone" means collect the output and finish. "The machine that
        // knows about the container did not answer" means the render may well still be
        // going. Reporting the second as the first writes off a running render.
        const down = readInspection(
            "c",
            output({
                ok: false,
                exitCode: 1,
                stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock.",
            }),
        );
        expect(down.state).toBe("unknown");

        const missing = readInspection("c", output({ ok: false, spawnError: "ENOENT" }));
        expect(missing.state).toBe("unknown");
        expect(missing.detail).toContain("no docker command");
    });
});

describe("deciding what to do", () => {
    it("attaches to a container that is still going, and says why it is not starting a second one", () => {
        const decision = decideReattach(RECORD, inspection({ state: "running" }), "this computer");
        expect(decision.action).toBe("attach");
        expect(decision.suggestRestart).toBe(false);
        expect(decision.message).toContain("still going");
        expect(decision.message).toContain("this computer");
    });

    it("collects from a container that finished while the app was away, and names its exit code", () => {
        const decision = decideReattach(
            RECORD,
            inspection({ state: "exited", exitCode: 0 }),
            "renderer@render.example:2222",
        );
        expect(decision.action).toBe("collect");
        expect(decision.message).toContain("finished while the app was closed");
        expect(decision.message).toContain("exit code 0");
    });

    it("suggests starting again only when the container actually failed", () => {
        expect(
            decideReattach(RECORD, inspection({ state: "exited", exitCode: 0 }), "this computer")
                .suggestRestart,
        ).toBe(false);
        expect(
            decideReattach(RECORD, inspection({ state: "exited", exitCode: 137 }), "this computer")
                .suggestRestart,
        ).toBe(true);
    });

    it("says plainly that a removed container's exit status is not knowable", () => {
        const decision = decideReattach(RECORD, inspection({ state: "absent" }), "this computer");
        expect(decision.action).toBe("collect");
        expect(decision.message).toContain("--rm");
        expect(decision.message).toContain("whether it got to the end");
    });

    it("throws nothing away when the daemon did not answer, and says which machine did not", () => {
        const decision = decideReattach(
            RECORD,
            inspection({ state: "unknown", detail: "the daemon is not running" }),
            "renderer@render.example:2222",
        );
        expect(decision.action).toBe("unknown");
        expect(decision.message).toContain("renderer@render.example:2222");
        expect(decision.message).toContain("the daemon is not running");
        expect(decision.message).toContain("nothing is collected");
    });
});

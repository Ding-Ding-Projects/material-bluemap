/**
 * Reaching a container on another machine, with no other machine.
 *
 * The three refusals here are the ones that only ever happen on a real server months
 * apart - a host key that changed, a staging directory somebody cleaned up, a record that
 * an old build or a hand edit left unusable - and every one of them is a sentence a person
 * has to be able to act on. A fake runner is what makes them ordinary tests.
 */

import { describe, expect, it } from "vitest";
import {
    newContainerHandoff,
    type ContainerHandoff,
    type RemoteHandoffTarget,
} from "../runtime/handoff.js";
import { containerAccessFor, remoteContainerAccess, targetFromRecord } from "./reattach.js";
import type { ContainerAccess } from "../runtime/reattach.js";
import type { FileTransfer } from "./transfer.js";
import {
    fakeRunner,
    fakeTransfer,
    output,
    SSH_HOST_KEY_CHANGED,
    SSH_UNREACHABLE,
} from "./fakes.js";

const REMOTE: RemoteHandoffTarget = {
    id: "render-box",
    host: "render.example",
    port: 2222,
    user: "renderer",
    identityFile: null,
    docker: "docker",
    keepRemoteFiles: false,
    root: "/srv/material-bluemap/world-abc123",
    storageRoot: "/srv/material-bluemap/world-abc123/web/maps",
};

function record(overrides: Partial<ContainerHandoff> = {}): ContainerHandoff {
    return {
        ...newContainerHandoff({
            renderId: "world-abc123",
            containerName: "material-bluemap-remote-world-abc123",
            mode: "remote",
            mapIds: ["overworld"],
            docker: "ssh",
            storageRoot: "C:\\renders\\world-abc123\\web\\maps",
            webRoot: "C:\\renders\\world-abc123\\web",
            cwd: "C:\\renders\\world-abc123",
            engine: {
                id: "upstream-java",
                label: "BlueMap engine (Java) 5.22-27 in a container on a remote host",
                version: "5.22-27",
                javaVersion: null,
            },
            startedAt: "2026-08-04T10:00:00.000Z",
            ownerInstance: "a-dead-app",
            remote: REMOTE,
        }),
        ...overrides,
    };
}

/** An access built over a runner that answers exactly what a given `ssh` call would. */
function access(
    table: readonly { readonly when: RegExp; readonly answer: ReturnType<typeof output> }[],
    transfer?: FileTransfer,
): { readonly subject: ContainerAccess; readonly runner: ReturnType<typeof fakeRunner> } {
    const runner = fakeRunner(table);
    const subject = remoteContainerAccess(record(), {
        knownHostsFile: "/app/known_hosts",
        runner: runner.runner,
        ...(transfer === undefined
            ? {}
            : {
                  transfer: () =>
                      Promise.resolve({ transfer, message: "Sending with rsync 3.2.7." }),
              }),
    });
    return { subject, runner };
}

describe("rebuilding the target from the record", () => {
    it("puts a record's host, port and user back through the same validation a typed one gets", () => {
        const target = targetFromRecord(REMOTE);
        expect(target?.host).toBe("render.example");
        expect(target?.port).toBe(2222);
        expect(target?.user).toBe("renderer");
    });

    it("refuses a record whose host would be read by ssh as an option", () => {
        // A record is a file, so an old build, a hand edit or a restored backup can have
        // put anything in it. `-oProxyCommand=...` in the host field is how a settings
        // value becomes an arbitrary local command.
        expect(targetFromRecord({ ...REMOTE, host: "-oProxyCommand=calc" })).toBeNull();
    });
});

describe("asking the remote daemon", () => {
    it("asks by name, through ssh, with the remote host's own docker binary", async () => {
        const { subject, runner } = access([
            { when: /inspect/, answer: output({ stdout: "running|0" }) },
        ]);
        const inspection = await subject.inspect("material-bluemap-remote-world-abc123");

        expect(inspection.state).toBe("running");
        expect(runner.text()).toContain("'docker' 'inspect'");
        expect(runner.text()).toContain("StrictHostKeyChecking=yes");
    });

    it("reads a removed container as gone", async () => {
        const { subject } = access([
            {
                when: /inspect/,
                answer: output({
                    ok: false,
                    exitCode: 1,
                    stderr: "Error: No such object: material-bluemap-remote-world-abc123",
                }),
            },
        ]);
        expect((await subject.inspect("material-bluemap-remote-world-abc123")).state).toBe("absent");
    });

    it("reports a changed host key as itself, and never as a container that is gone", async () => {
        // Reading `ssh` failing as "no such container" would collect an empty output folder
        // and report a render as finished - over a connection that may not be the server.
        const { subject } = access([{ when: /inspect/, answer: SSH_HOST_KEY_CHANGED }]);
        const inspection = await subject.inspect("material-bluemap-remote-world-abc123");

        expect(inspection.state).toBe("unknown");
        expect(inspection.detail).toContain("different host key");
        expect(inspection.detail).toContain("removed deliberately");
    });

    it("reports a host that did not answer as unreachable rather than as an empty answer", async () => {
        const { subject } = access([{ when: /inspect/, answer: SSH_UNREACHABLE }]);
        const inspection = await subject.inspect("material-bluemap-remote-world-abc123");
        expect(inspection.state).toBe("unknown");
        expect(inspection.detail).toContain("did not answer");
    });
});

describe("reading and stopping", () => {
    it("streams the container's whole log over ssh, as an ordinary engine launch", async () => {
        const { subject } = access([{ when: /.*/, answer: output() }]);
        const launch = subject.attachLaunch(record());

        expect(launch.command).toBe("ssh");
        expect(launch.args.at(-1)).toContain("'logs' '--follow' '--tail' 'all'");
        // Named, so the cancel below can reach it. A launch with no container name is a
        // render nothing can stop.
        expect(launch.containerName).toBe("material-bluemap-remote-world-abc123");
    });

    it("asks the remote daemon to stop it, with the grace period the JVM needs to save", async () => {
        const { subject, runner } = access([{ when: /.*/, answer: output() }]);
        await subject.stop("material-bluemap-remote-world-abc123");
        expect(runner.text()).toContain(
            "'docker' 'stop' '--time' '8' 'material-bluemap-remote-world-abc123'",
        );
    });
});

describe("bringing the map home", () => {
    it("fetches the staging directory's maps into this render's own web folder", async () => {
        const transfer = fakeTransfer();
        const { subject } = access([{ when: /.*/, answer: output() }], transfer);

        const report = await subject.collect(record());
        expect(report.ok).toBe(true);
        expect(transfer.log).toContain(
            "download-dir /srv/material-bluemap/world-abc123/web/maps -> C:\\renders\\world-abc123\\web",
        );
        // Which tool moved it is in the sentence, because whether an interruption is
        // survivable is a fact the person is entitled to.
        expect(report.message).toContain("rsync");
    });

    it("says the tiles are gone when the staging directory is not there any more", async () => {
        const transfer = fakeTransfer();
        transfer.failOn(/download-dir/, new Error("No such file or directory"));
        const { subject } = access([{ when: /.*/, answer: output() }], transfer);

        const report = await subject.collect(record());
        expect(report.ok).toBe(false);
        expect(report.message).toContain("has to be started again");
    });

    it("removes the staging directory afterwards, unless the target keeps its files", async () => {
        const transfer = fakeTransfer();
        const { subject } = access([{ when: /.*/, answer: output() }], transfer);
        const report = await subject.cleanUp?.(record());
        expect(report?.ok).toBe(true);
        expect(transfer.log).toContain("rm /srv/material-bluemap/world-abc123");

        const keeping = remoteContainerAccess(
            record({ remote: { ...REMOTE, keepRemoteFiles: true } }),
            { knownHostsFile: "/app/known_hosts", runner: fakeRunner([]).runner },
        );
        const kept = await keeping.cleanUp?.(record());
        expect(kept?.message).toContain("including a copy of the world");
    });
});

describe("a record that cannot be used", () => {
    it("refuses every operation with the reason, rather than failing without one", async () => {
        const subject = remoteContainerAccess(record({ remote: { ...REMOTE, host: "-oProxyCommand=x" } }), {
            knownHostsFile: "/app/known_hosts",
            runner: fakeRunner([]).runner,
        });

        const inspection = await subject.inspect("c");
        expect(inspection.state).toBe("unknown");
        expect(inspection.detail).toContain("has to be started again");
        expect((await subject.collect(record())).ok).toBe(false);
    });

    it("refuses a record with no remote half rather than reaching for the local daemon", async () => {
        const subject = remoteContainerAccess(record({ mode: "docker", remote: null }), {
            knownHostsFile: "/app/known_hosts",
            runner: fakeRunner([]).runner,
        });
        expect((await subject.inspect("c")).detail).toContain("does not name a remote host");
    });
});

describe("choosing which daemon a record belongs to", () => {
    it("sends a local record to the local access and a remote one over ssh", async () => {
        const local: ContainerAccess = {
            describe: () => "this computer",
            inspect: (name) =>
                Promise.resolve({ name, state: "running", status: "running", exitCode: null, detail: null }),
            attachLaunch: () => {
                throw new Error("not used");
            },
            stop: () => Promise.resolve(),
            collect: () => Promise.resolve({ ok: true, message: "local" }),
        };
        const choose = containerAccessFor({
            local,
            remote: { knownHostsFile: "/app/known_hosts", runner: fakeRunner([]).runner },
        });

        expect(choose(record({ mode: "docker", remote: null })).describe()).toBe("this computer");
        expect(choose(record()).describe()).toBe("renderer@render.example:2222");
    });
});

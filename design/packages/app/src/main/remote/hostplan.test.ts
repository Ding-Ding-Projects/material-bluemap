/**
 * The staging layout and the exact `docker run` a remote host is asked to execute in order
 * to serve an already-rendered map.
 *
 * All string decisions, so the whole command is provable without Docker, a daemon or a host.
 * The assertions worth reading are the ones that distinguish this from a render's own
 * `remoteDockerRunArguments`: detached rather than `--rm`, a published port, and the bind
 * address a `loopback`/`public` choice actually produces.
 */

import { describe, expect, it } from "vitest";
import { remotePaths } from "./plan.js";
import { testTarget } from "./fakes.js";
import {
    publishBindAddress,
    remoteHostingContainerName,
    remoteHostingStatusArguments,
    remoteHostingTeardownArguments,
    remoteServeDockerRunArguments,
    REMOTE_HOSTING_CONTAINER_PORT,
} from "./hostplan.js";

const PATHS = remotePaths("/home/renderer/renders", "host-overworld-abc123");

describe("publishBindAddress", () => {
    it("binds loopback-only by default", () => {
        expect(publishBindAddress({ hostPort: 8100, bindMode: "loopback" })).toBe("127.0.0.1");
    });

    it("binds every interface only when public was chosen explicitly", () => {
        expect(publishBindAddress({ hostPort: 8100, bindMode: "public" })).toBe("0.0.0.0");
    });
});

describe("remoteHostingContainerName", () => {
    it("is never confusable with a render's own container, on the same host", () => {
        const name = remoteHostingContainerName("overworld-abc123");
        expect(name).toContain("material-bluemap-host");
        expect(name).not.toContain("material-bluemap-remote");
    });
});

describe("remoteServeDockerRunArguments", () => {
    const args = remoteServeDockerRunArguments({
        target: testTarget(),
        paths: PATHS,
        containerName: "material-bluemap-host-overworld-abc123",
        mapIds: ["overworld", "nether"],
        publish: { hostPort: 8123, bindMode: "loopback" },
    });
    const line = args.join(" ");

    it("is detached and set to survive a reboot, never --rm", () => {
        expect(line).toContain("run -d --restart unless-stopped --name material-bluemap-host-overworld-abc123");
        expect(line).not.toContain("--rm");
    });

    it("publishes the chosen port at the chosen bind address", () => {
        expect(line).toContain(`-p 127.0.0.1:8123:${String(REMOTE_HOSTING_CONTAINER_PORT)}`);
    });

    it("binds every interface when the target chose a public host", () => {
        const publicArgs = remoteServeDockerRunArguments({
            target: testTarget(),
            paths: PATHS,
            containerName: "material-bluemap-host-overworld-abc123",
            mapIds: ["overworld"],
            publish: { hostPort: 8100, bindMode: "public" },
        }).join(" ");
        expect(publicArgs).toContain(`-p 0.0.0.0:8100:${String(REMOTE_HOSTING_CONTAINER_PORT)}`);
    });

    it("mounts every world read-only, exactly as a render does", () => {
        expect(line).toContain(
            "-v /home/renderer/renders/host-overworld-abc123/worlds/overworld:/worlds/overworld:ro",
        );
        expect(line).toContain(
            "-v /home/renderer/renders/host-overworld-abc123/worlds/nether:/worlds/nether:ro",
        );
    });

    it("mounts the already-rendered web root read-write and the jar read-only", () => {
        expect(line).toContain("-v /home/renderer/renders/host-overworld-abc123/web:/bluemap/web");
        expect(line).not.toContain("/bluemap/web:ro");
        expect(line).toContain("-v /home/renderer/renders/host-overworld-abc123/cli.jar:/bluemap/cli.jar:ro");
    });

    it("runs the engine in web-server mode, not render mode", () => {
        expect(line).toContain(" -w");
        expect(line).not.toContain(" -r ");
        expect(line).not.toContain(" -s");
    });

    it("passes memory and user only when given", () => {
        expect(line).not.toContain("--user");
        expect(line).not.toContain("-m ");

        const withLimits = remoteServeDockerRunArguments({
            target: testTarget(),
            paths: PATHS,
            containerName: "x",
            mapIds: ["overworld"],
            publish: { hostPort: 8100, bindMode: "loopback" },
            memory: "2g",
            user: "1000:1000",
        }).join(" ");
        expect(withLimits).toContain("-m 2g");
        expect(withLimits).toContain("--user 1000:1000");
    });

    it("uses the target's own docker binary and image", () => {
        const custom = remoteServeDockerRunArguments({
            target: testTarget({ docker: "podman", image: "my/custom-jre" }),
            paths: PATHS,
            containerName: "x",
            mapIds: ["overworld"],
            publish: { hostPort: 8100, bindMode: "loopback" },
        });
        expect(custom[0]).toBe("podman");
        expect(custom).toContain("my/custom-jre");
    });
});

describe("remoteHostingTeardownArguments", () => {
    it("is one idempotent command: force-remove by name", () => {
        expect(remoteHostingTeardownArguments(testTarget(), "material-bluemap-host-x")).toEqual([
            "docker",
            "rm",
            "-f",
            "material-bluemap-host-x",
        ]);
    });
});

describe("remoteHostingStatusArguments", () => {
    it("filters ps to exactly this container's name", () => {
        const args = remoteHostingStatusArguments(testTarget(), "material-bluemap-host-x");
        expect(args).toEqual([
            "docker",
            "ps",
            "--filter",
            "name=^/material-bluemap-host-x$",
            "--format",
            "{{.Status}}",
        ]);
    });
});

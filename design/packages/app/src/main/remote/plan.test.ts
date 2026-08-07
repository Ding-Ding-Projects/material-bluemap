/**
 * The staging layout and the exact `docker run` a remote host is asked to execute.
 *
 * All string decisions, so the whole command is provable without Docker, a daemon or a
 * host. The assertions worth reading are the ones about isolation: the world read-only,
 * nothing published, and a container that can be stopped by name.
 */

import { describe, expect, it } from "vitest";
import {
    remoteContainerName,
    remoteDockerRunArguments,
    remotePaths,
    remoteStopArguments,
    remoteWorldPath,
} from "./plan.js";
import { testTarget } from "./fakes.js";

const PATHS = remotePaths("/home/renderer/renders", "overworld-abc123");

describe("remotePaths", () => {
    it("puts everything for one render under one directory that can be removed whole", () => {
        expect(PATHS.root).toBe("/home/renderer/renders/overworld-abc123");
        expect(PATHS.configDir).toBe("/home/renderer/renders/overworld-abc123/config");
        expect(PATHS.storageRoot).toBe("/home/renderer/renders/overworld-abc123/web/maps");
        expect(PATHS.jarPath).toBe("/home/renderer/renders/overworld-abc123/cli.jar");
        expect(remoteWorldPath(PATHS, "overworld")).toBe(
            "/home/renderer/renders/overworld-abc123/worlds/overworld",
        );
    });

    it("joins as text, never with the host's path grammar", () => {
        // `node:path.join` on Windows would produce `\home\renderer\...`, which is a
        // perfectly good Windows path and a completely wrong remote one.
        expect(PATHS.root.includes("\\")).toBe(false);
    });

    it("does not double a separator when the work directory has a trailing slash", () => {
        expect(remotePaths("/srv/renders/", "x").root).toBe("/srv/renders/x");
    });
});

describe("remoteDockerRunArguments", () => {
    const args = remoteDockerRunArguments({
        target: testTarget(),
        paths: PATHS,
        containerName: "worldlens-remote-overworld-abc123",
        mapIds: ["overworld", "nether"],
    });
    const line = args.join(" ");

    it("mounts every world read-only, always", () => {
        // A render reads chunks and writes tiles. Read-only is the difference between an
        // engine bug corrupting a copy of a save and an engine bug printing an error.
        expect(line).toContain(
            "-v /home/renderer/renders/overworld-abc123/worlds/overworld:/worlds/overworld:ro",
        );
        expect(line).toContain(
            "-v /home/renderer/renders/overworld-abc123/worlds/nether:/worlds/nether:ro",
        );
    });

    it("mounts the engine read-only and the output writable", () => {
        expect(line).toContain("cli.jar:/bluemap/cli.jar:ro");
        expect(line).toContain("/web:/bluemap/web");
        expect(line).not.toContain("/web:/bluemap/web:ro");
    });

    it("publishes no port at all", () => {
        // A remote render has no web server. Opening a port on somebody's server as a side
        // effect of pressing Render is not a thing this app does.
        expect(args).not.toContain("-p");
        expect(line).not.toContain("--publish");
    });

    it("names the container and cleans it up, with a real init at PID 1", () => {
        expect(args).toContain("--name");
        expect(args).toContain("worldlens-remote-overworld-abc123");
        expect(args).toContain("--rm");
        // Without `--init` the JVM is PID 1, ignores SIGTERM, and every cancellation waits
        // out the full stop timeout before the container is killed.
        expect(args).toContain("--init");
    });

    it("ends in the engine's own command line, from the shared argument builder", () => {
        expect(line).toContain("java");
        expect(line).toContain("-jar /bluemap/cli.jar");
        expect(line).toContain("-c /bluemap/config");
        expect(line).toContain("-r -s");
        expect(line).toContain("-m overworld,nether");
    });

    it("passes force and fix-edges through when they were asked for", () => {
        const forced = remoteDockerRunArguments({
            target: testTarget(),
            paths: PATHS,
            containerName: "c",
            mapIds: ["overworld"],
            force: true,
            fixEdges: true,
        });
        expect(forced).toContain("-f");
        expect(forced).toContain("-e");
    });

    it("uses the target's own docker binary and image", () => {
        const custom = remoteDockerRunArguments({
            target: testTarget({ docker: "podman", image: "eclipse-temurin:21-jre" }),
            paths: PATHS,
            containerName: "c",
            mapIds: ["overworld"],
        });
        expect(custom[0]).toBe("podman");
        expect(custom).toContain("eclipse-temurin:21-jre");
    });
});

describe("remoteStopArguments", () => {
    it("asks the remote daemon to stop the container by name, politely", () => {
        // This is the whole of remote cancellation. Killing the local ssh kills a viewer;
        // the daemon on the other machine owns the container and never hears about it.
        expect(remoteStopArguments(testTarget(), "c")).toEqual(["docker", "stop", "--time", "8", "c"]);
    });
});

describe("remoteContainerName", () => {
    it("is prefixed, so it is obvious on a host somebody else also uses", () => {
        expect(remoteContainerName("overworld-abc123")).toBe(
            "worldlens-remote-overworld-abc123",
        );
    });

    it("is always a name Docker will accept", () => {
        expect(remoteContainerName("a world/with:odd chars")).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
    });
});

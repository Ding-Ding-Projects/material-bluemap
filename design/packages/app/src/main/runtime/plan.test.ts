import { describe, expect, it } from "vitest";
import { MountRefusedError } from "./mounts.js";
import {
    DEFAULT_DOCKER_IMAGE,
    DEFAULT_RUNTIME_MODE,
    containerName,
    engineArguments,
    planDockerLaunch,
    planLocalLaunch,
    stopContainerArguments,
} from "./plan.js";

const LINUX = { platform: "linux" as const, home: "/home/somebody" };

function dockerOptions(overrides: Record<string, unknown> = {}): Parameters<typeof planDockerLaunch>[0] {
    return {
        role: "render",
        containerName: "worldlens-render-world-abc",
        jarPath: "/opt/app/cli.jar",
        hostConfigDir: "/srv/renders/world/config-container",
        hostDataDir: "/srv/renders/world/data",
        hostWebRoot: "/srv/renders/world/web",
        worlds: [{ mapId: "overworld", hostPath: "/srv/saves/world" }],
        cwd: "/srv/renders/world",
        mountOptions: LINUX,
        ...overrides,
    } as Parameters<typeof planDockerLaunch>[0];
}

describe("the engine's own arguments", () => {
    it("renders and writes settings.json, and never unpacks upstream's webapp", () => {
        const args = engineArguments({ role: "render", configDir: "/c", jarPath: "/j.jar" });
        expect(args).toEqual(["-jar", "/j.jar", "-c", "/c", "-r", "-s"]);
        expect(args).not.toContain("-g");
    });

    it("passes the render's own flags in upstream's spelling", () => {
        expect(
            engineArguments({
                role: "render",
                configDir: "/c",
                jarPath: "/j.jar",
                jvmArgs: ["-Xmx4G"],
                force: true,
                fixEdges: true,
                maps: ["overworld", "nether"],
            }),
        ).toEqual(["-Xmx4G", "-jar", "/j.jar", "-c", "/c", "-r", "-s", "-f", "-e", "-m", "overworld,nether"]);
    });

    it("starts only the web server for the web-server role", () => {
        expect(engineArguments({ role: "web-server", configDir: "/c", jarPath: "/j.jar" })).toEqual([
            "-jar",
            "/j.jar",
            "-c",
            "/c",
            "-w",
        ]);
    });
});

describe("a local launch", () => {
    it("spawns the JVM itself, with no container and no mounts", () => {
        const launch = planLocalLaunch({
            role: "render",
            javaExecutable: "/opt/jdk/bin/java",
            jarPath: "/opt/app/cli.jar",
            configDir: "/srv/renders/world/config",
            cwd: "/srv/renders/world",
        });
        expect(launch.mode).toBe("local");
        expect(launch.command).toBe("/opt/jdk/bin/java");
        expect(launch.mounts).toEqual([]);
        expect(launch.containerName).toBeNull();
        expect(launch.engineConfigDir).toBe(launch.hostConfigDir);
        expect(launch.url).toBeNull();
    });

    it("reports a loopback URL for a web server, on the port it was configured with", () => {
        const launch = planLocalLaunch({
            role: "web-server",
            javaExecutable: "/opt/jdk/bin/java",
            jarPath: "/opt/app/cli.jar",
            configDir: "/srv/renders/world/config",
            cwd: "/srv/renders/world",
            port: 8123,
        });
        expect(launch.url).toBe("http://127.0.0.1:8123/");
        expect(launch.hostPort).toBe(8123);
    });

    it("keeps local the default, so Docker is opted into rather than out of", () => {
        expect(DEFAULT_RUNTIME_MODE).toBe("local");
    });
});

describe("a Docker launch", () => {
    it("mounts exactly the config, the data folder, the output, the jar and the world", () => {
        const launch = planDockerLaunch(dockerOptions());
        expect(launch.mounts.map((mount) => mount.containerPath)).toEqual([
            "/bluemap/config",
            "/bluemap/data",
            "/bluemap/web",
            "/bluemap/cli.jar",
            "/worlds/overworld",
        ]);
    });

    it("mounts the world read-only and the jar read-only, and nothing else read-only", () => {
        const launch = planDockerLaunch(dockerOptions());
        const readOnly = launch.mounts.filter((mount) => mount.readOnly).map((mount) => mount.containerPath);
        expect(readOnly).toEqual(["/bluemap/cli.jar", "/worlds/overworld"]);
    });

    it("never mounts a home folder, and says so rather than dropping the mount", () => {
        expect(() =>
            planDockerLaunch(dockerOptions({ worlds: [{ mapId: "overworld", hostPath: "/home/somebody" }] })),
        ).toThrow(MountRefusedError);
    });

    it("runs the same engine arguments inside the container, against container paths", () => {
        const launch = planDockerLaunch(dockerOptions({ jvmArgs: ["-Xmx6G"] }));
        const tail = launch.args.slice(launch.args.indexOf(DEFAULT_DOCKER_IMAGE));
        expect(tail).toEqual([
            DEFAULT_DOCKER_IMAGE,
            "java",
            "-Xmx6G",
            "-jar",
            "/bluemap/cli.jar",
            "-c",
            "/bluemap/config",
            "-r",
            "-s",
        ]);
    });

    it("removes the container when it ends and gives it a name it can be stopped by", () => {
        const launch = planDockerLaunch(dockerOptions());
        expect(launch.args.slice(0, 4)).toEqual(["run", "--rm", "--name", "worldlens-render-world-abc"]);
        expect(launch.containerName).toBe("worldlens-render-world-abc");
    });

    it("puts an init process at PID 1, so a stop reaches the JVM", () => {
        expect(planDockerLaunch(dockerOptions()).args).toContain("--init");
    });

    it("publishes a web server's port to loopback only, and reports that address", () => {
        const launch = planDockerLaunch(
            dockerOptions({
                role: "web-server",
                publish: { hostPort: 8123, containerPort: 8100 },
            }),
        );
        expect(launch.args).toContain("-p");
        expect(launch.args[launch.args.indexOf("-p") + 1]).toBe("127.0.0.1:8123:8100");
        expect(launch.url).toBe("http://127.0.0.1:8123/");
        expect(launch.hostPort).toBe(8123);
    });

    it("passes a memory limit and a user only when it was given one", () => {
        const bare = planDockerLaunch(dockerOptions());
        expect(bare.args).not.toContain("-m");
        expect(bare.args).not.toContain("--user");

        const limited = planDockerLaunch(dockerOptions({ memory: "4g", user: "1000:1000" }));
        expect(limited.args[limited.args.indexOf("-m") + 1]).toBe("4g");
        expect(limited.args[limited.args.indexOf("--user") + 1]).toBe("1000:1000");
    });

    it("uses the image it was given", () => {
        const launch = planDockerLaunch(dockerOptions({ image: "eclipse-temurin:21-jre" }));
        expect(launch.args).toContain("eclipse-temurin:21-jre");
        expect(launch.args).not.toContain(DEFAULT_DOCKER_IMAGE);
    });

    it("keeps the host config folder in the launch, because that is what a repair may edit", () => {
        const launch = planDockerLaunch(dockerOptions());
        expect(launch.hostConfigDir).toBe("/srv/renders/world/config-container");
        expect(launch.engineConfigDir).toBe("/bluemap/config");
    });
});

describe("naming and stopping a container", () => {
    it("keeps a name Docker will accept", () => {
        expect(containerName("worldlens-render", "world-9f2c1a")).toBe(
            "worldlens-render-world-9f2c1a",
        );
        expect(containerName("worldlens-render", "my world!")).toBe("worldlens-render-my-world-");
        expect(containerName("", "")).toBe("worldlens");
    });

    it("stops politely, with a deadline", () => {
        expect(stopContainerArguments("c", 8)).toEqual(["stop", "--time", "8", "c"]);
    });
});

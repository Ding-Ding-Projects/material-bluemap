import { describe, expect, it } from "vitest";
import type { DockerReport } from "../runtime/docker.js";
import { diagnose, explained, javaFeature, suggestedHeap, type RepairDiagnosisCode } from "./diagnose.js";
import type { RepairEvidence } from "./evidence.js";

/**
 * A failure that happened, with nothing in it that would be diagnosed.
 *
 * Every test below adds exactly the evidence of one failure class, so a diagnosis that
 * appears is caused by what the test put there and not by the fixture.
 */
function evidence(overrides: Partial<RepairEvidence> = {}): RepairEvidence {
    return {
        subject: "render",
        mode: "local",
        command: "/opt/jdk/bin/java",
        args: ["-jar", "/opt/app/cli.jar", "-c", "/srv/render/config", "-r", "-s"],
        exitCode: 1,
        signal: null,
        spawnError: null,
        cancelled: false,
        stderr: [],
        diagnostics: [],
        setupProblems: [],
        consentMissing: false,
        mapsScheduled: null,
        config: [],
        hostConfigDir: "/srv/render/config",
        outputRoot: "/srv/render/web",
        worlds: [{ mapId: "overworld", path: "/srv/saves/world" }],
        javaExecutable: "/opt/jdk/bin/java",
        javaVersion: "25.0.3",
        requiredJavaFeature: 25,
        docker: null,
        port: null,
        host: null,
        at: "2026-08-04T10:00:00.000Z",
        ...overrides,
    };
}

const codes = (found: readonly { readonly code: RepairDiagnosisCode }[]): RepairDiagnosisCode[] =>
    found.map((entry) => entry.code);

describe("the eight failures this app knows how to recognise", () => {
    it("the Mojang download was not accepted", () => {
        const found = diagnose(evidence({ consentMissing: true, exitCode: 2 }));
        expect(codes(found)).toEqual(["download-not-accepted"]);
        expect(found[0]?.remedy.kind).toBe("setting");
        expect(found[0]?.remedy.settings?.anchor).toBe("mojang-download-consent");
    });

    it("the Mojang download was not accepted, recognised from the engine's own line", () => {
        const found = diagnose(
            evidence({
                diagnostics: [
                    "[WARNING] You must accept the required file download in order for BlueMap to work!",
                ],
            }),
        );
        expect(codes(found)).toContain("download-not-accepted");
        expect(found[0]?.because).toContain("You must accept the required file download");
    });

    it("the port is already in use, in upstream's own wording", () => {
        const found = diagnose(
            evidence({
                subject: "web-server",
                port: 8100,
                diagnostics: [
                    "BlueMap failed to bind to the configured address.",
                    "This usually happens when the configured port (8100) is already in use by some other program.",
                ],
            }),
        );
        expect(codes(found)).toEqual(["port-in-use"]);
        expect(found[0]?.message).toContain("8100");
        // Port 0 is the operating system's own answer, and the only one that cannot
        // collide again with whatever took the last port.
        expect(found[0]?.remedy.retry?.port).toBe(0);
    });

    it("the port is already in use, in the JVM's wording", () => {
        const found = diagnose(
            evidence({ subject: "web-server", stderr: ["java.net.BindException: Address already in use"] }),
        );
        expect(codes(found)).toEqual(["port-in-use"]);
    });

    it("the port is already in use, in Docker's wording", () => {
        const found = diagnose(
            evidence({
                mode: "docker",
                subject: "web-server",
                docker: available(),
                port: 8100,
                stderr: [
                    "docker: Error response from daemon: Bind for 127.0.0.1:8100 failed: port is already allocated.",
                ],
            }),
        );
        expect(codes(found)).toContain("port-in-use");
    });

    it("there is no Java", () => {
        const found = diagnose(evidence({ spawnError: "ENOENT", javaVersion: null }));
        expect(codes(found)).toEqual(["java-missing"]);
        expect(found[0]?.remedy.settings?.anchor).toBe("java-runtime");
    });

    it("there is no Java, recognised from a shell's own complaint", () => {
        const found = diagnose(
            evidence({
                javaVersion: null,
                stderr: ["'java' is not recognized as an internal or external command, operable program or batch file."],
            }),
        );
        expect(codes(found)).toEqual(["java-missing"]);
    });

    it("Java is too old, from the JVM's refusal to load the class", () => {
        const found = diagnose(
            evidence({
                javaVersion: null,
                stderr: [
                    "Exception in thread \"main\" java.lang.UnsupportedClassVersionError: de/bluecolored/bluemap/cli/BlueMapCLI has been compiled by a more recent version of the Java Runtime (class file version 69.0), this version of the Java Runtime only recognizes class file versions up to 61.0",
                ],
            }),
        );
        expect(codes(found)).toEqual(["java-too-old"]);
        expect(found[0]?.message).toContain("Java 25 or newer");
    });

    it("Java is too old, from the version alone, before anything was printed", () => {
        const found = diagnose(evidence({ javaVersion: "17.0.9", stderr: [], diagnostics: [] }));
        expect(codes(found)).toEqual(["java-too-old"]);
        expect(found[0]?.message).toContain("Java 17 ran it");
    });

    it("does not mistake Java 8's version spelling for version 1", () => {
        expect(javaFeature("1.8.0_452")).toBe(8);
        expect(javaFeature("25.0.3")).toBe(25);
        expect(javaFeature(null)).toBeNull();
    });

    it("the world folder cannot be read", () => {
        const found = diagnose(
            evidence({
                setupProblems: [
                    "There is a problem with your BlueMap setup!\n'/srv/saves/world' does not exist or is no directory!\nCheck if the 'world' setting in the config-file for that map is correct",
                ],
            }),
        );
        expect(codes(found)).toEqual(["world-unreadable"]);
        expect(found[0]?.message).toContain("/srv/saves/world");
        expect(found[0]?.remedy.settings?.anchor).toBe("world-folder");
    });

    it("the world folder cannot be read, and says why that is different in a container", () => {
        const found = diagnose(
            evidence({
                mode: "docker",
                docker: available(),
                diagnostics: ["[ERROR] Failed to load world overworld!"],
            }),
        );
        expect(codes(found)).toContain("world-unreadable");
        expect(found.find((entry) => entry.code === "world-unreadable")?.remedy.summary).toContain(
            "shared read-only",
        );
    });

    it("the output folder cannot be written", () => {
        const found = diagnose(
            evidence({
                stderr: ["java.nio.file.AccessDeniedException: /srv/render/web/maps/overworld/tiles"],
            }),
        );
        expect(codes(found)).toEqual(["output-not-writable"]);
        expect(found[0]?.remedy.settings?.anchor).toBe("map-storage-directory");
    });

    it("the disk the output is written to is full, and says so rather than blaming permissions", () => {
        const found = diagnose(
            evidence({ stderr: ["java.io.IOException: No space left on device"] }),
        );
        expect(codes(found)).toEqual(["output-not-writable"]);
        expect(found[0]?.message).toContain("full");
    });

    it("the engine ran out of memory", () => {
        const found = diagnose(
            evidence({ stderr: ["java.lang.OutOfMemoryError: Java heap space"] }),
        );
        expect(codes(found)).toEqual(["out-of-memory"]);
        expect(found[0]?.remedy.retry?.heapMegabytes).toBe(4096);
    });

    it("the container was killed for using too much memory, which prints no Java error at all", () => {
        const found = diagnose(
            evidence({ mode: "docker", docker: available(), exitCode: 137, args: ["-Xmx2G"] }),
        );
        expect(codes(found)).toContain("out-of-memory");
        const memory = found.find((entry) => entry.code === "out-of-memory");
        expect(memory?.message).toContain("memory limit");
        expect(memory?.remedy.retry?.heapMegabytes).toBe(4096);
    });

    it("BlueMap refused the config with a parse error", () => {
        const found = diagnose(
            evidence({
                setupProblems: [
                    "BlueMap failed to parse this file:\n/srv/render/config/maps/overworld.conf\nCheck if the file is correctly formatted.\n(for example there might be a } or ] or , missing somewhere)",
                ],
            }),
        );
        expect(codes(found)).toEqual(["config-rejected"]);
        expect(found[0]?.remedy.kind).toBe("config");
        expect(found[0]?.because).toContain("failed to parse this file");
    });

    it("BlueMap could not read a config file, which is a different sentence", () => {
        const found = diagnose(
            evidence({
                setupProblems: [
                    "BlueMap tried to read this file, but can not access it:\n/srv/render/config/core.conf",
                ],
            }),
        );
        expect(codes(found)).toEqual(["config-rejected"]);
        expect(found[0]?.message).toContain("could not read");
    });
});

describe("the Docker failures", () => {
    it("says Docker is not usable, using the report's own honest sentence", () => {
        const found = diagnose(
            evidence({
                mode: "docker",
                spawnError: "ENOENT",
                docker: {
                    status: "daemon-unreachable",
                    clientVersion: "27.4.0",
                    serverVersion: null,
                    message: "Docker 27.4.0 is installed, but its daemon is not running. Start Docker and try again.",
                    detail: "Cannot connect to the Docker daemon.",
                },
            }),
        );
        expect(codes(found)).toEqual(["docker-unavailable"]);
        expect(found[0]?.message).toContain("daemon is not running");
    });

    it("never tells somebody to install Java when it was Docker that was missing", () => {
        const found = diagnose(
            evidence({ mode: "docker", spawnError: "ENOENT", javaVersion: null, docker: null }),
        );
        expect(codes(found)).toEqual(["docker-unavailable"]);
        expect(codes(found)).not.toContain("java-missing");
    });

    it("recognises an image that could not be pulled", () => {
        const found = diagnose(
            evidence({
                mode: "docker",
                docker: available(),
                stderr: [
                    "docker: Error response from daemon: pull access denied for eclipse-temurin, repository does not exist",
                ],
            }),
        );
        expect(codes(found)).toContain("docker-image-unavailable");
    });
});

describe("what it deliberately does not diagnose", () => {
    it("says nothing about a cancelled run, because cancelling is a decision", () => {
        const found = diagnose(
            evidence({
                cancelled: true,
                stderr: ["java.net.BindException: Address already in use"],
            }),
        );
        expect(found).toEqual([]);
        expect(explained(found)).toBe(false);
    });

    it("leaves an unrecognised failure unexplained rather than picking the nearest match", () => {
        const found = diagnose(
            evidence({
                exitCode: 1,
                stderr: ["java.lang.IllegalStateException: something nobody has seen before"],
            }),
        );
        expect(found).toEqual([]);
        expect(explained(found)).toBe(false);
    });

    it("says nothing at all about a run that reported no problem", () => {
        expect(diagnose(evidence({ exitCode: 0 }))).toEqual([]);
    });
});

describe("more than one cause at once", () => {
    it("reports every one it recognised rather than choosing between them", () => {
        const found = diagnose(
            evidence({
                subject: "web-server",
                consentMissing: true,
                port: 8100,
                stderr: [
                    "java.net.BindException: Address already in use",
                    "java.lang.OutOfMemoryError: Java heap space",
                ],
            }),
        );
        expect(codes(found).sort()).toEqual(["download-not-accepted", "out-of-memory", "port-in-use"]);
        expect(explained(found)).toBe(true);
    });
});

describe("the heap it suggests next", () => {
    it("doubles whatever was asked for, in whichever unit it was written", () => {
        expect(suggestedHeap(evidence({ args: ["-Xmx2G", "-jar", "x.jar"] }))).toBe(4096);
        expect(suggestedHeap(evidence({ args: ["-Xmx512m"] }))).toBe(1024);
        expect(suggestedHeap(evidence({ args: ["-jar", "x.jar"] }))).toBe(4096);
    });
});

function available(): DockerReport {
    return {
        status: "available",
        clientVersion: "27.4.0",
        serverVersion: "27.4.0",
        message: "Docker 27.4.0 is installed and its daemon (27.4.0) is running.",
        detail: null,
    };
}

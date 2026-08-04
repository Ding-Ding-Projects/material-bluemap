import { describe, expect, it } from "vitest";
import type { EngineRunResult } from "../runtime/process.js";
import { collectEvidence, describeEvidence, evidenceText, redactSecrets } from "./evidence.js";

function result(overrides: Partial<EngineRunResult> = {}): EngineRunResult {
    return {
        exitCode: 1,
        signal: null,
        spawnError: null,
        cancelled: false,
        upToDate: false,
        mapsScheduled: null,
        mapsLoaded: [],
        consentMissing: false,
        setupProblems: [],
        diagnostics: [],
        stderr: [],
        durationMs: 1200,
        ...overrides,
    };
}

const STORAGE_CONFIG = [
    "storage-type: sql",
    'connection-url: "jdbc:mysql://db.example:3306/bluemap?user=bluemap&password=hunter2"',
    "connection-properties: {",
    '  user: "bluemap"',
    '  password: "hunter2"',
    "}",
].join("\n");

describe("masking credentials", () => {
    it("keeps every key and replaces only the value", () => {
        const masked = redactSecrets(STORAGE_CONFIG);
        expect(masked).not.toContain("hunter2");
        expect(masked).toContain("password: ");
        expect(masked).toContain("storage-type: sql");
    });

    it("masks a password hidden in a JDBC query string", () => {
        expect(redactSecrets('connection-url: "jdbc:mysql://db/bluemap?password=hunter2"')).not.toContain(
            "hunter2",
        );
    });

    it("masks a password hidden in a URL's user information", () => {
        expect(redactSecrets('url: "https://someone:hunter2@example.com/feed"')).not.toContain("hunter2");
    });

    it("leaves an ordinary config untouched", () => {
        const text = 'world: "C:\\\\saves\\\\world"\ndimension: "minecraft:overworld"\n';
        expect(redactSecrets(text)).toBe(text);
    });
});

describe("collecting the evidence", () => {
    it("masks config text on the way in, so nothing downstream can hold the original", () => {
        const evidence = collectEvidence({
            subject: "render",
            mode: "local",
            command: "java",
            args: ["-jar", "cli.jar"],
            result: result(),
            config: [{ path: "storages/sql.conf", text: STORAGE_CONFIG }],
            hostConfigDir: "/srv/render/config",
            requiredJavaFeature: 25,
        });
        expect(evidence.config[0]?.text).not.toContain("hunter2");
        expect(JSON.stringify(evidence)).not.toContain("hunter2");
    });

    it("keeps the last lines rather than the first, because a JVM says why at the end", () => {
        const lines = Array.from({ length: 200 }, (_, index) => `line ${String(index)}`);
        const evidence = collectEvidence({
            subject: "render",
            mode: "local",
            command: "java",
            args: [],
            result: result({ stderr: lines }),
            hostConfigDir: "/srv/render/config",
            requiredJavaFeature: 25,
        });
        expect(evidence.stderr).toHaveLength(80);
        expect(evidence.stderr[evidence.stderr.length - 1]).toBe("line 199");
    });

    it("puts every stream into one haystack, because the reason lands on any of them", () => {
        const evidence = collectEvidence({
            subject: "render",
            mode: "local",
            command: "java",
            args: [],
            result: result({
                diagnostics: ["[WARNING] one"],
                stderr: ["two"],
                setupProblems: ["three"],
            }),
            hostConfigDir: "/srv/render/config",
            requiredJavaFeature: 25,
        });
        expect(evidenceText(evidence).split("\n")).toEqual(["[WARNING] one", "two", "three"]);
    });

    it("records the time it was collected, not the time it is read", () => {
        const evidence = collectEvidence({
            subject: "web-server",
            mode: "docker",
            command: "docker",
            args: ["run"],
            result: result(),
            hostConfigDir: "/srv/render/config",
            requiredJavaFeature: 25,
            now: () => new Date("2026-08-04T09:30:00.000Z"),
        });
        expect(evidence.at).toBe("2026-08-04T09:30:00.000Z");
    });
});

describe("writing it out", () => {
    it("names the mode, the command, the exit code and the config, with credentials gone", () => {
        const evidence = collectEvidence({
            subject: "web-server",
            mode: "docker",
            command: "docker",
            args: ["run", "--rm"],
            result: result({ exitCode: 1, stderr: ["java.net.BindException: Address already in use"] }),
            config: [{ path: "storages/sql.conf", text: STORAGE_CONFIG }],
            hostConfigDir: "/srv/render/config",
            outputRoot: "/srv/render/web",
            worlds: [{ mapId: "overworld", path: "/srv/saves/world" }],
            javaVersion: "25.0.3",
            requiredJavaFeature: 25,
            port: 8100,
        });
        const text = describeEvidence(evidence);

        expect(text).toContain("in a Docker container");
        expect(text).toContain("docker run --rm");
        expect(text).toContain("Exit code: 1");
        expect(text).toContain("Port: 8100");
        expect(text).toContain("World for map 'overworld': /srv/saves/world");
        expect(text).toContain("--- storages/sql.conf ---");
        expect(text).not.toContain("hunter2");
    });
});

import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { describeDiscoveryFailure, discoverJava, javaFromHome, javaOnPath } from "./discovery.js";
import type { JavaProbeOutput, JavaRunner } from "./probe.js";
import { probeJava } from "./probe.js";

/**
 * Fixtures are built with the path flavour of the platform **under test**, never with
 * node's native `join` and `delimiter`.
 *
 * Using the native ones looks platform-agnostic and is the opposite: on Linux the
 * delimiter is `:`, so a Windows `PATH` fixture splits through its drive letters and
 * `C:\jdkin` becomes `C` and `\jdkin`, while `join` produces the mixed
 * `C:\jdkin/java.exe`. Both pass on Windows and fail on the CI runner.
 */
const flavour = (platform: NodeJS.Platform) => (platform === "win32" ? win32 : posix);

/** Every bare `join` below builds a POSIX fixture path; Windows ones say `win32` outright. */
const join = posix.join;

const jdkBinary = (home: string, platform: NodeJS.Platform = "linux"): string =>
    flavour(platform).join(home, "bin", platform === "win32" ? "java.exe" : "java");

const pathOf = (...directories: string[]): string => directories.join(posix.delimiter);

const winPathOf = (...directories: string[]): string => directories.join(win32.delimiter);

const banner = (version: string) =>
    `openjdk version "${version}" 2026-04-21 LTS\nOpenJDK Runtime Environment Temurin-${version}+9 (build ${version}+9-LTS)\n`;

const properties = (home: string, version: string) =>
    `Property settings:\n    java.home = ${home}\n\n${banner(version)}`;

interface FakeJvm {
    /** Version reported by this executable, or null when it is not a JVM at all. */
    readonly version: string | null;
    readonly home?: string;
    /** Simulates a JVM that refuses -XshowSettings. */
    readonly rejectsShowSettings?: boolean;
}

/** A runner backed by a map of executable path to what that binary pretends to be. */
function fakeRunner(jvms: Record<string, FakeJvm>): { runner: JavaRunner; calls: string[] } {
    const calls: string[] = [];
    const runner: JavaRunner = (executable, args) => {
        calls.push(`${executable} ${args.join(" ")}`);
        const jvm = jvms[executable];
        const miss: JavaProbeOutput = {
            ok: false,
            stdout: "",
            stderr: "",
            error: `spawn ${executable} ENOENT`,
        };
        if (jvm === undefined) return Promise.resolve(miss);
        if (jvm.version === null) {
            return Promise.resolve({ ok: true, stdout: "", stderr: "not a jvm\n", error: null });
        }
        const wantsSettings = args.includes("-XshowSettings:properties");
        if (wantsSettings && jvm.rejectsShowSettings === true) {
            return Promise.resolve({
                ok: false,
                stdout: "",
                stderr: "Unrecognized option: -XshowSettings:properties\n",
                error: "exit 1",
            });
        }
        const stderr =
            wantsSettings && jvm.home !== undefined
                ? properties(jvm.home, jvm.version)
                : banner(jvm.version);
        return Promise.resolve({ ok: true, stdout: "", stderr, error: null });
    };
    return { runner, calls };
}

const existsIn = (paths: string[]) => (path: string) => paths.includes(path);

describe("javaFromHome", () => {
    it("builds the executable path under JAVA_HOME", () => {
        const found = javaFromHome({ JAVA_HOME: "/opt/jdk-25" }, "linux", existsIn([jdkBinary("/opt/jdk-25")]));
        expect(found?.executable).toBe(jdkBinary("/opt/jdk-25"));
        expect(found?.missing).toBeNull();
    });

    it("uses java.exe on Windows", () => {
        const expected = jdkBinary("C:\\jdk", "win32");
        const found = javaFromHome({ JAVA_HOME: "C:\\jdk" }, "win32", existsIn([expected]));
        expect(found?.executable).toBe(expected);
    });

    it("reports a JAVA_HOME whose JDK is gone rather than silently skipping it", () => {
        const found = javaFromHome({ JAVA_HOME: "/opt/removed-jdk" }, "linux", () => false);
        expect(found?.missing).toBe("/opt/removed-jdk");
    });

    it("ignores an unset or blank JAVA_HOME", () => {
        expect(javaFromHome({}, "linux", () => true)).toBeNull();
        expect(javaFromHome({ JAVA_HOME: "   " }, "linux", () => true)).toBeNull();
    });
});

describe("javaOnPath", () => {
    it("returns the first PATH entry that actually contains java", () => {
        const env = { PATH: pathOf("/usr/local/bin", "/opt/jdk-25/bin", "/usr/bin") };
        const found = javaOnPath(
            env,
            "linux",
            existsIn([join("/opt/jdk-25/bin", "java"), join("/usr/bin", "java")]),
        );
        expect(found).toBe(join("/opt/jdk-25/bin", "java"));
    });

    it("honours a lower-case Path, which is what Windows often provides", () => {
        const expected = win32.join("C:\\jdk\\bin", "java.exe");
        const env = { Path: winPathOf("C:\\Windows", "C:\\jdk\\bin") };
        expect(javaOnPath(env, "win32", existsIn([expected]))).toBe(expected);
    });

    it("strips quotes and skips empty entries", () => {
        const env = { PATH: pathOf("", "", '"/opt/jdk/bin"', "") };
        expect(javaOnPath(env, "linux", existsIn([join("/opt/jdk/bin", "java")]))).toBe(
            join("/opt/jdk/bin", "java"),
        );
    });

    it("returns null when nothing on PATH has a java", () => {
        expect(javaOnPath({ PATH: pathOf("/usr/bin", "/bin") }, "linux", () => false)).toBeNull();
        expect(javaOnPath({}, "linux", () => true)).toBeNull();
    });
});

describe("probeJava", () => {
    it("gets the version and the home from one invocation", async () => {
        const executable = jdkBinary("/opt/jdk");
        const { runner, calls } = fakeRunner({ [executable]: { version: "25.0.3", home: "/opt/jdk" } });
        const report = await probeJava(executable, runner);
        expect(report.version?.feature).toBe(25);
        expect(report.home).toBe("/opt/jdk");
        expect(calls).toHaveLength(1);
    });

    it("falls back to plain -version when -XshowSettings is refused", async () => {
        const executable = jdkBinary("/opt/jdk");
        const { runner, calls } = fakeRunner({
            [executable]: { version: "25.0.3", rejectsShowSettings: true },
        });
        const report = await probeJava(executable, runner);
        expect(report.version?.version).toBe("25.0.3");
        expect(report.home).toBeNull();
        expect(calls).toHaveLength(2);
    });

    it("reports a launch failure as such", async () => {
        const { runner } = fakeRunner({});
        const report = await probeJava("/nowhere/java", runner);
        expect(report.version).toBeNull();
        expect(report.failure).toContain("ENOENT");
    });

    it("distinguishes 'ran but is not a JVM' from 'could not run'", async () => {
        const { runner } = fakeRunner({ "/bin/true": { version: null } });
        const report = await probeJava("/bin/true", runner);
        expect(report.version).toBeNull();
        expect(report.failure).toContain("no recognizable version");
        expect(report.failure).toContain("not a jvm");
    });
});

describe("discoverJava", () => {
    it("prefers JAVA_HOME over PATH", async () => {
        const home = jdkBinary("/opt/jdk-25");
        const onPath = join("/usr/bin", "java");
        const { runner } = fakeRunner({
            [home]: { version: "25.0.3", home: "/opt/jdk-25" },
            [onPath]: { version: "25.0.4", home: "/usr" },
        });

        const discovery = await discoverJava({
            env: { JAVA_HOME: "/opt/jdk-25", PATH: pathOf("/usr/bin") },
            platform: "linux",
            runner,
            exists: existsIn([home, onPath]),
        });

        // Someone who set JAVA_HOME told their whole machine which JDK to use.
        expect(discovery.installation?.source).toBe("JAVA_HOME");
        expect(discovery.installation?.executable).toBe(home);
    });

    it("falls through to PATH when JAVA_HOME is too old, and says why", async () => {
        const home = jdkBinary("/opt/jdk-17");
        const onPath = join("/usr/bin", "java");
        const { runner } = fakeRunner({
            [home]: { version: "17.0.9", home: "/opt/jdk-17" },
            [onPath]: { version: "25.0.3", home: "/usr" },
        });

        const discovery = await discoverJava({
            env: { JAVA_HOME: "/opt/jdk-17", PATH: pathOf("/usr/bin") },
            platform: "linux",
            runner,
            exists: existsIn([home, onPath]),
        });

        expect(discovery.installation?.source).toBe("PATH");
        expect(discovery.rejected).toHaveLength(1);
        expect(discovery.rejected[0]?.source).toBe("JAVA_HOME");
        expect(discovery.rejected[0]?.reason).toContain("Java 17");
    });

    it("does not conclude anything from a directory name", async () => {
        // A folder called jdk-25 that in fact holds a JDK 17. Only running it tells.
        const home = jdkBinary("/opt/jdk-25");
        const { runner } = fakeRunner({ [home]: { version: "17.0.9" } });

        const discovery = await discoverJava({
            env: { JAVA_HOME: "/opt/jdk-25" },
            platform: "linux",
            runner,
            exists: existsIn([home]),
        });

        expect(discovery.installation).toBeNull();
        expect(discovery.rejected[0]?.reason).toContain("Java 17");
    });

    it("reports a stale JAVA_HOME without probing it", async () => {
        const onPath = join("/usr/bin", "java");
        const { runner, calls } = fakeRunner({ [onPath]: { version: "25.0.3" } });

        const discovery = await discoverJava({
            env: { JAVA_HOME: "/opt/deleted", PATH: pathOf("/usr/bin") },
            platform: "linux",
            runner,
            exists: existsIn([onPath]),
        });

        expect(discovery.installation?.source).toBe("PATH");
        expect(discovery.rejected[0]?.reason).toContain("no java executable there");
        expect(calls.every((call) => !call.includes("deleted"))).toBe(true);
    });

    it("probes a JDK reachable as both JAVA_HOME and PATH only once", async () => {
        const executable = jdkBinary("/opt/jdk");
        const { runner, calls } = fakeRunner({ [executable]: { version: "25.0.3", home: "/opt/jdk" } });

        await discoverJava({
            env: { JAVA_HOME: "/opt/jdk", PATH: pathOf("/opt/jdk/bin") },
            platform: "linux",
            runner,
            exists: existsIn([executable]),
        });

        expect(calls).toHaveLength(1);
    });

    it("finds nothing, and collects every rejection, when no JVM is suitable", async () => {
        const home = jdkBinary("/opt/jdk-21");
        const onPath = join("/usr/bin", "java");
        const { runner } = fakeRunner({
            [home]: { version: "21.0.5" },
            [onPath]: { version: "17.0.9" },
        });

        const discovery = await discoverJava({
            env: { JAVA_HOME: "/opt/jdk-21", PATH: pathOf("/usr/bin") },
            platform: "linux",
            runner,
            exists: existsIn([home, onPath]),
        });

        expect(discovery.installation).toBeNull();
        expect(discovery.rejected).toHaveLength(2);

        // "No Java found" on a machine with two JDKs installed is baffling; naming
        // both and their versions is something a person can act on.
        const message = describeDiscoveryFailure(discovery);
        expect(message).toContain("Java 25 or newer was found");
        expect(message).toContain(home);
        expect(message).toContain(onPath);
        expect(message).toContain("Java 21");
        expect(message).toContain("Java 17");
    });

    it("says so plainly when there is nothing to check at all", async () => {
        const { runner } = fakeRunner({});
        const discovery = await discoverJava({ env: {}, platform: "linux", runner, exists: () => false });
        expect(describeDiscoveryFailure(discovery)).toContain("JAVA_HOME is not set");
    });

    it("never downloads: with nothing found it simply reports nothing found", async () => {
        const { runner, calls } = fakeRunner({});
        const discovery = await discoverJava({ env: {}, platform: "linux", runner, exists: () => false });
        expect(discovery.installation).toBeNull();
        expect(calls).toHaveLength(0);
    });
});

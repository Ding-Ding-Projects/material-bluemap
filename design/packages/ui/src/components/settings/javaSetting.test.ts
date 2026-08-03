import { describe, expect, it } from "vitest";
import {
    createJavaSetting,
    describeJavaInstallation,
    describeJavaRejections,
    newestRender,
} from "./javaSetting.js";
import type { JavaRuntimeReadout, RenderSummaryReadout, SettingsBridge } from "./settingsBridge.js";

const FOUND: JavaRuntimeReadout = {
    installation: {
        source: "JAVA_HOME",
        executable: "/opt/jdk-25/bin/java",
        home: "/opt/jdk-25",
        version: { feature: 25, version: "25.0.3", runtime: "OpenJDK Runtime Environment Temurin-25.0.3+9" },
    },
    rejected: [],
    required: 25,
};

const NOTHING_SUITABLE: JavaRuntimeReadout = {
    installation: null,
    rejected: [
        { source: "JAVA_HOME", executable: "/opt/jdk-17/bin/java", reason: "is Java 17, which is too old" },
        { source: "PATH", executable: "/usr/bin/java", reason: "could not be identified as a Java runtime" },
    ],
    required: 25,
};

const RENDERS: RenderSummaryReadout[] = [
    {
        renderId: "r-1",
        outcome: "finished",
        engine: "BlueMap engine (Java) 5.22-27 on Java 24.0.1",
        startedAt: "2026-07-30T10:00:00.000Z",
    },
    {
        renderId: "r-2",
        outcome: "finished",
        engine: "BlueMap engine (Java) 5.22-27 on Java 25.0.3",
        startedAt: "2026-08-02T18:30:00.000Z",
    },
];

describe("a build whose preload cannot be asked", () => {
    it("says so rather than reporting a runtime nobody measured", async () => {
        const setting = createJavaSetting({ bridge: null });

        expect(setting.supported).toBe(false);
        expect(setting.state.value).toBe("unsupported");

        await setting.load();

        expect(setting.state.value).toBe("unsupported");
        expect(setting.report.value).toBeNull();
        expect(setting.failure.value).toBeNull();
    });

    it("is still unsupported when the preload exists but has no java method", async () => {
        const bridge: SettingsBridge = { listRenders: () => Promise.resolve(RENDERS) };
        const setting = createJavaSetting({ bridge });

        await setting.load();

        expect(setting.state.value).toBe("unsupported");
        expect(setting.report.value).toBeNull();
    });

    it("still quotes the engine the most recent render ran with, which is a real fact", async () => {
        const bridge: SettingsBridge = { listRenders: () => Promise.resolve(RENDERS) };
        const setting = createJavaSetting({ bridge });

        expect(setting.canQuoteRenders).toBe(true);
        await setting.load();

        expect(setting.lastRender.value).toEqual({
            renderId: "r-2",
            engine: "BlueMap engine (Java) 5.22-27 on Java 25.0.3",
            startedAt: "2026-08-02T18:30:00.000Z",
        });
    });

    it("has no render to quote when the list is empty, and does not invent one", async () => {
        const bridge: SettingsBridge = { listRenders: () => Promise.resolve([]) };
        const setting = createJavaSetting({ bridge });

        await setting.load();

        expect(setting.lastRender.value).toBeNull();
    });

    it("treats a render list that threw as one fewer fact, not as a Java failure", async () => {
        const bridge: SettingsBridge = { listRenders: () => Promise.reject(new Error("no ipc")) };
        const setting = createJavaSetting({ bridge });

        await setting.load();

        expect(setting.lastRender.value).toBeNull();
        expect(setting.state.value).toBe("unsupported");
        expect(setting.failure.value).toBeNull();
    });
});

describe("a build that can report the runtime", () => {
    it("reports the installation that was found", async () => {
        const bridge: SettingsBridge = { javaRuntime: () => Promise.resolve(FOUND) };
        const setting = createJavaSetting({ bridge });

        expect(setting.supported).toBe(true);
        await setting.load();

        expect(setting.state.value).toBe("found");
        expect(setting.report.value?.installation?.version.version).toBe("25.0.3");
        expect(setting.required.value).toBe(25);
        expect(setting.rejected.value).toEqual([]);
    });

    it("reports every candidate it turned down when none was suitable", async () => {
        const bridge: SettingsBridge = { javaRuntime: () => Promise.resolve(NOTHING_SUITABLE) };
        const setting = createJavaSetting({ bridge });

        await setting.load();

        expect(setting.state.value).toBe("missing");
        expect(setting.required.value).toBe(25);
        expect(describeJavaRejections(setting.report.value)).toEqual([
            "JAVA_HOME: /opt/jdk-17/bin/java — is Java 17, which is too old",
            "PATH: /usr/bin/java — could not be identified as a Java runtime",
        ]);
    });

    it("reports a call that threw rather than showing an empty readout", async () => {
        const bridge: SettingsBridge = { javaRuntime: () => Promise.reject(new Error("handler missing")) };
        const setting = createJavaSetting({ bridge });

        await setting.load();

        expect(setting.state.value).toBe("failed");
        expect(setting.failure.value).toBe("handler missing");
        expect(setting.report.value).toBeNull();
    });
});

describe("describing a discovery", () => {
    it("has nothing to say about a report that does not exist", () => {
        expect(describeJavaRejections(null)).toEqual([]);
        expect(describeJavaInstallation(null)).toBeNull();
        expect(describeJavaInstallation(NOTHING_SUITABLE)).toBeNull();
    });

    it("names the version and where it was found", () => {
        expect(describeJavaInstallation(FOUND)).toBe("Java 25.0.3 (JAVA_HOME)");
    });

    it("picks the newest render by start time, not by list order", () => {
        expect(newestRender(RENDERS)?.renderId).toBe("r-2");
        expect(newestRender([...RENDERS].reverse())?.renderId).toBe("r-2");
        expect(newestRender([])).toBeNull();
    });
});

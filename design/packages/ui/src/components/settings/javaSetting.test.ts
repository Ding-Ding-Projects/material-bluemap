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

    it("strips Electron's invoke plumbing from a failure before the row renders it", async () => {
        // In the real app the rejection crosses ipcRenderer.invoke, which re-wraps it
        // as "Error invoking remote method '<channel>': Error: <message>". The channel
        // name and the doubled "Error:" are transport, not the sentence somebody wrote.
        const bridge: SettingsBridge = {
            javaRuntime: () =>
                Promise.reject(
                    new Error(
                        "Error invoking remote method 'java:runtime': " +
                            "Error: EACCES: permission denied, open '[a path]'",
                    ),
                ),
        };
        const setting = createJavaSetting({ bridge });

        await setting.load();

        expect(setting.state.value).toBe("failed");
        expect(setting.failure.value).toBe("EACCES: permission denied, open '[a path]'");
    });

    it("answers discovery even while the render list is still hanging", async () => {
        // The render list is a separate IPC that only decorates the section. A slow or
        // hung listRenders must not delay the answer the row exists for, and the row
        // must say `loading` from the first synchronous moment so the button's guard
        // holds.
        let resolveRenders: (value: RenderSummaryReadout[]) => void = () => {};
        const bridge: SettingsBridge = {
            listRenders: () =>
                new Promise<RenderSummaryReadout[]>((resolve) => {
                    resolveRenders = resolve;
                }),
            javaRuntime: () => Promise.resolve(FOUND),
        };
        const setting = createJavaSetting({ bridge });

        const loading = setting.load();
        expect(setting.state.value).toBe("loading");

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(setting.state.value).toBe("found");
        expect(setting.lastRender.value).toBeNull();

        resolveRenders(RENDERS);
        await loading;
        expect(setting.lastRender.value?.renderId).toBe("r-2");
    });
});

describe("downloading a Java runtime the app fetches for itself", () => {
    function provisionBridge(overrides: Partial<SettingsBridge> = {}): SettingsBridge {
        return {
            javaRuntime: () => Promise.resolve(NOTHING_SUITABLE),
            javaDownloadConsent: () => Promise.resolve({ accepted: false, acceptedAt: null }),
            acceptJavaDownloadConsent: () =>
                Promise.resolve({ accepted: true, acceptedAt: "2026-08-05T00:00:00.000Z" }),
            provisionJavaRuntime: () =>
                Promise.resolve({
                    ok: true,
                    provisioned: true,
                    installation: {
                        source: "provisioned",
                        executable: "/userData/java/temurin-25/bin/java",
                        home: "/userData/java/temurin-25",
                        version: { feature: 25, version: "25.0.4+7", runtime: null },
                    },
                }),
            onJavaProvisionEvent: () => () => undefined,
            ...overrides,
        };
    }

    it("cannot provision when the bridge is missing any of the three channels", () => {
        expect(createJavaSetting({ bridge: null }).canProvision).toBe(false);
        expect(
            createJavaSetting({ bridge: { javaRuntime: () => Promise.resolve(FOUND) } }).canProvision,
        ).toBe(false);
        expect(
            createJavaSetting({
                bridge: {
                    javaDownloadConsent: () => Promise.resolve({ accepted: false, acceptedAt: null }),
                },
            }).canProvision,
        ).toBe(false);
    });

    it("can provision once the bridge exposes consent and provisioning together", () => {
        const setting = createJavaSetting({ bridge: provisionBridge() });
        expect(setting.canProvision).toBe(true);
    });

    it("reads not-accepted consent without starting a download", async () => {
        const setting = createJavaSetting({ bridge: provisionBridge() });
        await setting.loadConsent();

        expect(setting.consent.value).toEqual({ accepted: false, acceptedAt: null });
        expect(setting.provisioning.value).toBe(false);
    });

    it("treats a consent read that threw as not knowing, never as accepted", async () => {
        const setting = createJavaSetting({
            bridge: provisionBridge({ javaDownloadConsent: () => Promise.reject(new Error("no ipc")) }),
        });
        await setting.loadConsent();
        expect(setting.consent.value).toBeNull();
    });

    it("records consent as part of the download click, then provisions and reloads discovery", async () => {
        let accepted = false;
        let provisioned = false;
        const setting = createJavaSetting({
            bridge: provisionBridge({
                acceptJavaDownloadConsent: () => {
                    accepted = true;
                    return Promise.resolve({ accepted: true, acceptedAt: "2026-08-05T00:00:00.000Z" });
                },
                provisionJavaRuntime: () => {
                    // The consent has to have been recorded before provisioning starts.
                    expect(accepted).toBe(true);
                    provisioned = true;
                    return Promise.resolve({
                        ok: true,
                        provisioned: true,
                        installation: {
                            source: "provisioned",
                            executable: "/userData/java/temurin-25/bin/java",
                            home: "/userData/java/temurin-25",
                            version: { feature: 25, version: "25.0.4+7", runtime: null },
                        },
                    });
                },
                // After a successful provision, `requestProvision` reloads discovery.
                javaRuntime: () => Promise.resolve(FOUND),
            }),
        });
        await setting.loadConsent();

        await setting.requestProvision();

        expect(accepted).toBe(true);
        expect(provisioned).toBe(true);
        expect(setting.provisioning.value).toBe(false);
        expect(setting.provisionFailure.value).toBeNull();
        // The row moved straight to "found" without a second manual refresh.
        expect(setting.state.value).toBe("found");
    });

    it("does not re-record consent on a second download once it was already accepted", async () => {
        let acceptCalls = 0;
        const setting = createJavaSetting({
            bridge: provisionBridge({
                acceptJavaDownloadConsent: () => {
                    acceptCalls += 1;
                    return Promise.resolve({ accepted: true, acceptedAt: "2026-08-05T00:00:00.000Z" });
                },
            }),
        });
        await setting.loadConsent();
        setting.consent.value = { accepted: true, acceptedAt: "2026-08-01T00:00:00.000Z" };

        await setting.requestProvision();

        expect(acceptCalls).toBe(0);
    });

    it("reports a refusal from the main process as provisionFailure, without touching state", async () => {
        const setting = createJavaSetting({
            bridge: provisionBridge({
                provisionJavaRuntime: () =>
                    Promise.resolve({ ok: false, message: "Downloading a Java runtime has to be agreed to first." }),
            }),
        });

        await setting.requestProvision();

        expect(setting.provisionFailure.value).toBe("Downloading a Java runtime has to be agreed to first.");
        expect(setting.provisioning.value).toBe(false);
    });

    it("reports a thrown provisioning error rather than swallowing it", async () => {
        const setting = createJavaSetting({
            bridge: provisionBridge({
                provisionJavaRuntime: () => Promise.reject(new Error("digest mismatch")),
            }),
        });

        await setting.requestProvision();

        expect(setting.provisionFailure.value).toBe("digest mismatch");
    });

    it("streams progress events while a download is in flight, and unsubscribes when it ends", async () => {
        type Listener = (event: { stage: string; message: string; received: number | null; total: number | null }) => void;
        // A holder object rather than reassigned `let` bindings: both callbacks below run
        // inside nested closures, and mutating a property sidesteps TypeScript's control-flow
        // narrowing giving the later optional calls a spuriously narrowed `never` type.
        const state: { delivered: Listener | null; resolve: (() => void) | null; unsubscribed: boolean } = {
            delivered: null,
            resolve: null,
            unsubscribed: false,
        };

        const setting = createJavaSetting({
            bridge: provisionBridge({
                onJavaProvisionEvent: (listener) => {
                    state.delivered = listener as Listener;
                    return () => {
                        state.unsubscribed = true;
                    };
                },
                provisionJavaRuntime: () =>
                    new Promise((resolve) => {
                        state.resolve = () =>
                            resolve({
                                ok: true,
                                provisioned: true,
                                installation: {
                                    source: "provisioned",
                                    executable: "/userData/java/temurin-25/bin/java",
                                    home: "/userData/java/temurin-25",
                                    version: { feature: 25, version: "25.0.4+7", runtime: null },
                                },
                            });
                    }),
                javaRuntime: () => Promise.resolve(FOUND),
            }),
        });

        const running = setting.requestProvision();
        await Promise.resolve();
        expect(setting.provisioning.value).toBe(true);
        expect(state.delivered).not.toBeNull();

        state.delivered?.({ stage: "downloading", message: "Downloading Temurin 25", received: 10, total: 100 });
        expect(setting.provisionEvent.value?.message).toBe("Downloading Temurin 25");
        expect(state.unsubscribed).toBe(false);

        state.resolve?.();
        await running;

        expect(state.unsubscribed).toBe(true);
        expect(setting.provisioning.value).toBe(false);
    });

    it("refuses a second concurrent download while one is already running", async () => {
        const state: { calls: number; resolve: (() => void) | null } = { calls: 0, resolve: null };
        const setting = createJavaSetting({
            bridge: provisionBridge({
                provisionJavaRuntime: () => {
                    state.calls += 1;
                    return new Promise((resolve) => {
                        state.resolve = () =>
                            resolve({
                                ok: true,
                                provisioned: true,
                                installation: {
                                    source: "provisioned",
                                    executable: "/userData/java/temurin-25/bin/java",
                                    home: "/userData/java/temurin-25",
                                    version: { feature: 25, version: "25.0.4+7", runtime: null },
                                },
                            });
                    });
                },
                javaRuntime: () => Promise.resolve(FOUND),
            }),
        });
        // Pre-accepted, so `requestProvision` reaches `provision()` on its very first
        // microtask hop rather than pausing at `acceptJavaDownloadConsent()` first.
        setting.consent.value = { accepted: true, acceptedAt: "2026-08-01T00:00:00.000Z" };

        const first = setting.requestProvision();
        const second = setting.requestProvision();
        // Let the first call's async work reach `provision()` and capture the resolver
        // before this test tries to call it.
        await Promise.resolve();
        await Promise.resolve();
        state.resolve?.();
        await Promise.all([first, second]);

        expect(state.calls).toBe(1);
    });

    it("says it cannot download when the bridge has no provisioning channel at all", async () => {
        const setting = createJavaSetting({ bridge: { javaRuntime: () => Promise.resolve(NOTHING_SUITABLE) } });

        await setting.requestProvision();

        expect(setting.provisionFailure.value).toBe("This build cannot download a Java runtime from here.");
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

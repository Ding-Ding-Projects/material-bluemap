import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { DiscoverJavaOptions, JavaDiscovery, JavaInstallation } from "./discovery.js";
import { acceptJavaDownloadConsent } from "./consent.js";
import {
    JAVA_CHANNELS,
    MAX_REASON_LENGTH,
    PATH_PLACEHOLDER,
    registerJavaHandlers,
    summariseDiscovery,
    summariseReason,
    type JavaDownloadConsentSummary,
    type JavaProvisionOutcome,
    type JavaRuntimeSummary,
} from "./ipc.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/**
 * Just enough of `ipcMain` to register against.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so the
 * channel can be exercised exactly as the renderer would reach it without an Electron
 * runtime anywhere near the test.
 */
function fakeIpcMain(): IpcMain & { readonly handlers: Map<string, Handler> } {
    const handlers = new Map<string, Handler>();
    return {
        handlers,
        handle(channel: string, handler: Handler): void {
            if (handlers.has(channel)) throw new Error(`second handler for '${channel}'`);
            handlers.set(channel, handler);
        },
        removeHandler(channel: string): void {
            handlers.delete(channel);
        },
    } as unknown as IpcMain & { readonly handlers: Map<string, Handler> };
}

const noEvent = {} as IpcMainInvokeEvent;

const FOUND: JavaDiscovery = {
    installation: {
        source: "JAVA_HOME",
        executable: "C:\\jdk-25\\bin\\java.exe",
        home: "C:\\jdk-25",
        version: {
            feature: 25,
            version: "25.0.3",
            runtime: "OpenJDK Runtime Environment Temurin-25.0.3+9 (build 25.0.3+9-LTS)",
        },
    },
    rejected: [],
    required: 25,
};

/** Registers against a fresh fake and hands back the one channel this module owns. */
function ask(discovery: JavaDiscovery | (() => Promise<JavaDiscovery>)): () => Promise<unknown> {
    const ipcMain = fakeIpcMain();
    registerJavaHandlers(ipcMain, {
        dataDir: "/userData",
        discover: typeof discovery === "function" ? discovery : () => Promise.resolve(discovery),
    });
    const handler = ipcMain.handlers.get("java:runtime");
    if (handler === undefined) throw new Error("java:runtime was not registered");
    return () => Promise.resolve(handler(noEvent));
}

describe("registerJavaHandlers", () => {
    it("registers exactly the channels it names, and takes them off again", () => {
        const ipcMain = fakeIpcMain();

        const java = registerJavaHandlers(ipcMain, { dataDir: "/userData" });
        expect([...ipcMain.handlers.keys()]).toEqual([...JAVA_CHANNELS]);

        // `ipcMain.handle` throws on a channel that already has a handler, so a
        // `dispose` that missed one would turn a reopened window into a crash.
        java.dispose();
        expect(ipcMain.handlers.size).toBe(0);
        expect(() => registerJavaHandlers(ipcMain, { dataDir: "/userData" })).not.toThrow();
    });

    it("answers java:runtime with the installation discovery found", async () => {
        const answer = (await ask(FOUND)()) as JavaRuntimeSummary;

        expect(answer).toEqual({
            installation: {
                source: "JAVA_HOME",
                executable: "C:\\jdk-25\\bin\\java.exe",
                home: "C:\\jdk-25",
                version: {
                    feature: 25,
                    version: "25.0.3",
                    runtime: "OpenJDK Runtime Environment Temurin-25.0.3+9 (build 25.0.3+9-LTS)",
                },
            },
            rejected: [],
            required: 25,
        });
    });

    it("looks for a provisioned JDK under the userData it was given", async () => {
        const seen: DiscoverJavaOptions[] = [];
        const ipcMain = fakeIpcMain();
        registerJavaHandlers(ipcMain, {
            dataDir: "/somewhere/userData",
            discover: (options) => {
                seen.push(options);
                return Promise.resolve(FOUND);
            },
        });

        await ipcMain.handlers.get("java:runtime")?.(noEvent);

        expect(seen).toEqual([{ dataDir: "/somewhere/userData" }]);
    });

    it("reports a machine with no suitable Java, carrying every candidate it turned down", async () => {
        const answer = (await ask({
            installation: null,
            rejected: [
                {
                    source: "JAVA_HOME",
                    executable: "C:\\jdk-17\\bin\\java.exe",
                    reason: "Java 17 (17.0.9), but Java 25 or newer is required",
                },
                {
                    source: "PATH",
                    executable: "C:\\shims\\java.exe",
                    reason: "ran but printed no version",
                },
            ],
            required: 25,
        })()) as JavaRuntimeSummary;

        expect(answer.installation).toBeNull();
        expect(answer.required).toBe(25);
        // The sentences this layer writes itself carry no path and survive untouched;
        // they are the ones that make a failure actionable.
        expect(answer.rejected).toEqual([
            {
                source: "JAVA_HOME",
                executable: "C:\\jdk-17\\bin\\java.exe",
                reason: "Java 17 (17.0.9), but Java 25 or newer is required",
            },
            {
                source: "PATH",
                executable: "C:\\shims\\java.exe",
                reason: "ran but printed no version",
            },
        ]);
    });

    it("sends a plain structured-cloneable object rather than the discovery it was handed", async () => {
        const answer = (await ask(FOUND)()) as JavaRuntimeSummary;

        // Electron structured-clones what crosses, and refuses anything it cannot. A
        // getter, a class instance or a function reaching this point is a channel that
        // throws at the boundary rather than a channel that sends slightly too much.
        expect(() => structuredClone(answer)).not.toThrow();
        expect(answer).not.toBe(FOUND);
        expect(answer.installation).not.toBe(FOUND.installation);
        expect(answer.installation?.version).not.toBe(FOUND.installation?.version);
        expect(answer.rejected).not.toBe(FOUND.rejected);
    });

    it("keeps a stray path out of a rejection reason while keeping the candidate's own", async () => {
        const answer = (await ask({
            installation: null,
            rejected: [
                {
                    source: "PATH",
                    executable: "C:\\shims\\java.exe",
                    reason:
                        "could not be run (Command failed: C:\\shims\\java.exe -version " +
                        "The system cannot find C:\\Users\\someone\\.jabba\\config.json)",
                },
            ],
            required: 25,
        })()) as JavaRuntimeSummary;

        const rejection = answer.rejected[0];
        expect(rejection?.reason).not.toContain("someone");
        expect(rejection?.reason).not.toContain("C:\\shims");
        expect(rejection?.reason).toContain(PATH_PLACEHOLDER);
        // The rejected candidate is still named - one field away, in the field that
        // exists to carry a path.
        expect(rejection?.executable).toBe("C:\\shims\\java.exe");
    });

    it("flattens a multi-line failure onto one line and bounds how much of it is repeated", async () => {
        const answer = (await ask({
            installation: null,
            rejected: [
                {
                    source: "provisioned",
                    executable: "/userData/java/temurin-25/bin/java",
                    reason: `ran but printed no recognizable version: Exception in thread "main"\n${"very noisy output ".repeat(40)}`,
                },
            ],
            required: 25,
        })()) as JavaRuntimeSummary;

        const reason = answer.rejected[0]?.reason ?? "";
        expect(reason).not.toContain("\n");
        expect(reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
        expect(reason.endsWith("…")).toBe(true);
        expect(reason.startsWith("ran but printed no recognizable version:")).toBe(true);
    });

    it("reports a discovery that threw, without repeating the path it threw about", async () => {
        const call = ask(() =>
            Promise.reject(
                new Error("EACCES: permission denied, open '/home/someone/.secrets/keyring'"),
            ),
        );

        const thrown = await call().then(
            () => new Error("the handler resolved instead of rejecting"),
            (error: unknown) => error,
        );

        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toContain("permission denied");
        expect((thrown as Error).message).not.toContain("someone");
        expect((thrown as Error).message).toContain(PATH_PLACEHOLDER);
    });

    it("folds concurrent asks into one discovery, and still answers a later one freshly", async () => {
        let runs = 0;
        const call = ask(() => {
            runs += 1;
            return Promise.resolve(FOUND);
        });

        // A screen that mounts and immediately refreshes must not start six JVMs.
        await Promise.all([call(), call(), call()]);
        expect(runs).toBe(1);

        // But nothing is cached: "Look again" after somebody installed a JDK has to be
        // able to see it.
        await call();
        expect(runs).toBe(2);
    });
});

describe("java:downloadConsent, java:acceptDownloadConsent, java:provision", () => {
    let dataDir: string;

    beforeEach(async () => {
        dataDir = await mkdtemp(join(tmpdir(), "mb-java-ipc-"));
    });

    afterEach(async () => {
        await rm(dataDir, { recursive: true, force: true });
    });

    const PROVISIONED: JavaInstallation = {
        source: "provisioned",
        executable: "/userData/java/temurin-25/bin/java",
        home: "/userData/java/temurin-25",
        version: { feature: 25, version: "25.0.4+7", runtime: "OpenJDK Runtime Environment Temurin-25.0.4+7" },
    };

    it("reports not accepted, and then accepted, through the two consent channels", async () => {
        const ipcMain = fakeIpcMain();
        registerJavaHandlers(ipcMain, { dataDir });

        const before = (await ipcMain.handlers.get("java:downloadConsent")?.(noEvent)) as JavaDownloadConsentSummary;
        expect(before.accepted).toBe(false);

        const accepted = (await ipcMain.handlers.get("java:acceptDownloadConsent")?.(
            noEvent,
        )) as JavaDownloadConsentSummary;
        expect(accepted.accepted).toBe(true);
        expect(accepted.acceptedAt).not.toBeNull();

        const after = (await ipcMain.handlers.get("java:downloadConsent")?.(noEvent)) as JavaDownloadConsentSummary;
        expect(after.accepted).toBe(true);
    });

    it("refuses java:provision when consent has not been given, without touching ensure", async () => {
        let called = false;
        const ipcMain = fakeIpcMain();
        registerJavaHandlers(ipcMain, {
            dataDir,
            ensure: () => {
                called = true;
                return Promise.resolve({ installation: PROVISIONED, provisioned: true });
            },
        });

        const outcome = (await ipcMain.handlers.get("java:provision")?.(noEvent)) as JavaProvisionOutcome;
        expect(outcome.ok).toBe(false);
        expect(called).toBe(false);
        if (outcome.ok) throw new Error("should have refused");
        expect(outcome.message).toContain("agreed to");
    });

    it("refuses java:provision honestly when no ensure was wired in, even with consent", async () => {
        acceptJavaDownloadConsent(dataDir);
        const ipcMain = fakeIpcMain();
        registerJavaHandlers(ipcMain, { dataDir });

        const outcome = (await ipcMain.handlers.get("java:provision")?.(noEvent)) as JavaProvisionOutcome;
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("should have refused");
        expect(outcome.message).toContain("cannot download");
    });

    it("provisions once consent is given, and streams progress through broadcast", async () => {
        acceptJavaDownloadConsent(dataDir);
        const events: unknown[] = [];
        const ipcMain = fakeIpcMain();
        registerJavaHandlers(ipcMain, {
            dataDir,
            broadcast: (event) => events.push(event),
            ensure: (options) => {
                options.onEvent({ stage: "downloading", message: "Downloading", received: 1, total: 2 });
                options.onEvent({ stage: "done", message: "Java 25.0.4+7 is ready", received: null, total: null });
                return Promise.resolve({ installation: PROVISIONED, provisioned: true });
            },
        });

        const outcome = (await ipcMain.handlers.get("java:provision")?.(noEvent)) as JavaProvisionOutcome;
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) throw new Error("should have provisioned");
        expect(outcome.provisioned).toBe(true);
        expect(outcome.installation.source).toBe("provisioned");
        expect(outcome.installation.version.version).toBe("25.0.4+7");
        expect(events).toHaveLength(2);
    });

    it("reports a provisioning failure as a message rather than a thrown rejection", async () => {
        acceptJavaDownloadConsent(dataDir);
        const ipcMain = fakeIpcMain();
        registerJavaHandlers(ipcMain, {
            dataDir,
            ensure: () => Promise.reject(new Error("digest mismatch for /some/secret/path/archive.zip")),
        });

        const outcome = (await ipcMain.handlers.get("java:provision")?.(noEvent)) as JavaProvisionOutcome;
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("should have failed");
        expect(outcome.message).toContain("digest mismatch");
        // Same path-cleaning as every other failure surface in this module.
        expect(outcome.message).not.toContain("/some/secret/path");
    });

    it("folds concurrent provision calls into one ensure() run", async () => {
        acceptJavaDownloadConsent(dataDir);
        let runs = 0;
        const ipcMain = fakeIpcMain();
        registerJavaHandlers(ipcMain, {
            dataDir,
            ensure: () => {
                runs += 1;
                return Promise.resolve({ installation: PROVISIONED, provisioned: true });
            },
        });

        await Promise.all([
            ipcMain.handlers.get("java:provision")?.(noEvent),
            ipcMain.handlers.get("java:provision")?.(noEvent),
        ]);
        expect(runs).toBe(1);

        await ipcMain.handlers.get("java:provision")?.(noEvent);
        expect(runs).toBe(2);
    });
});

describe("summariseReason", () => {
    it("leaves prose that merely contains a slash alone", () => {
        // A single-segment `/…` run matches ordinary text. Mangling a sentence to
        // protect nothing is worse than the leak this guards against.
        expect(summariseReason("ran but printed no version and/or exited 24/7")).toBe(
            "ran but printed no version and/or exited 24/7",
        );
    });

    it("replaces POSIX, Windows and UNC paths alike", () => {
        expect(summariseReason("could not be run (spawn /opt/jdk-25/bin/java ENOENT)")).toBe(
            `could not be run (spawn ${PATH_PLACEHOLDER} ENOENT)`,
        );
        expect(summariseReason("no java executable at C:\\jdk17\\bin")).toBe(
            `no java executable at ${PATH_PLACEHOLDER}`,
        );
        expect(summariseReason("no java executable at \\\\build\\share\\jdk")).toBe(
            `no java executable at ${PATH_PLACEHOLDER}`,
        );
    });

    it("replaces the whole of a Windows path that contains spaces", () => {
        // The single-token pass stops at the first space, so without the fragment pass
        // "C:\Program" would be replaced and "Files\Eclipse Adoptium\jdk-…" would leak.
        expect(
            summariseReason(
                "JAVA_HOME is set to C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.9.9-hotspot but there is no java executable there",
            ),
        ).toBe(`JAVA_HOME is set to ${PATH_PLACEHOLDER} but there is no java executable there`);
    });

    it("keeps half a name out of a quoted profile path", () => {
        const summarised = summariseReason(
            "The system cannot find 'C:\\Users\\John Smith\\.jabba\\config.json'",
        );
        expect(summarised).not.toContain("Smith");
        expect(summarised).toBe(`The system cannot find '${PATH_PLACEHOLDER}'`);
    });

    it("leaves a URL alone, because the 's://' in 'https://' is not a drive", () => {
        expect(summariseReason("see https://adoptium.net/install/ for downloads")).toBe(
            "see https://adoptium.net/install/ for downloads",
        );
    });

    it("still replaces the local path inside a file:// URL", () => {
        expect(summariseReason("opened file:///C:/jdk/bin/java instead")).toBe(
            `opened file:///${PATH_PLACEHOLDER} instead`,
        );
    });

    it("keeps a relative path's tail, because 'jre/lib/…' names no machine", () => {
        expect(summariseReason("could not open jre/lib/amd64/server/libjvm.so")).toBe(
            "could not open jre/lib/amd64/server/libjvm.so",
        );
    });

    it("truncates on code points, never stranding half a surrogate pair", () => {
        // "xy" plus astral characters puts the 239th UTF-16 unit inside a pair, which a
        // unit-indexed slice would cut through; a lone surrogate makes the string
        // ill-formed, which is exactly what encodeURIComponent refuses.
        const summarised = summariseReason(`xy${"🀄".repeat(300)}`);
        expect(summarised.endsWith("…")).toBe(true);
        expect([...summarised].length).toBe(MAX_REASON_LENGTH);
        expect(() => encodeURIComponent(summarised)).not.toThrow();
    });
});

describe("summariseDiscovery", () => {
    it("carries the JDK's own paths through, because that is what the row exists to show", () => {
        const summary = summariseDiscovery(FOUND);

        expect(summary.installation?.executable).toBe("C:\\jdk-25\\bin\\java.exe");
        expect(summary.installation?.home).toBe("C:\\jdk-25");
    });

    it("keeps a JVM that would not say where its home is as null rather than guessing", () => {
        const found = FOUND.installation;
        if (found === null) throw new Error("the fixture lost its installation");

        const summary = summariseDiscovery({ ...FOUND, installation: { ...found, home: null } });

        expect(summary.installation?.home).toBeNull();
    });
});

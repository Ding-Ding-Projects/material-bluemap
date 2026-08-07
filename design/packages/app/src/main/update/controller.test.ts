import { describe, expect, it } from "vitest";
import { UpdateController, type UpdateEngine, type UpdateTimers } from "./controller.js";
import { resolveFeed, type FeedResolution } from "./feed.js";
import type { UpdateFeedHandoff } from "./feedHandoff.js";
import type { UpdateState } from "./state.js";

/**
 * A stand-in for Electron's `autoUpdater`.
 *
 * The whole reason the engine is a seam: every case below - a signature that does not
 * verify, a truncated download, a machine with no network - is a case no test could reach
 * against a real update server, and the ones that could be reached would need a released
 * build and an installer to reach them.
 */
class FakeEngine implements UpdateEngine {
    feed: {
        url: string;
        headers?: Record<string, string>;
        serverType?: "default" | "json";
    } | null = null;
    readonly feeds: {
        url: string;
        headers?: Record<string, string>;
        serverType?: "default" | "json";
    }[] = [];
    checks = 0;
    installs = 0;
    setFeedThrows: Error | null = null;
    setFeedThrowsFor: string | null = null;
    installThrows: Error | null = null;

    private readonly listeners = new Map<string, ((...args: unknown[]) => void)[]>();

    setFeedURL(options: {
        url: string;
        headers?: Record<string, string>;
        serverType?: "default" | "json";
    }): void {
        if (
            this.setFeedThrows !== null ||
            (this.setFeedThrowsFor !== null && options.url.includes(this.setFeedThrowsFor))
        ) {
            throw this.setFeedThrows ?? new Error(`refused feed ${options.url}`);
        }
        this.feed = options;
        this.feeds.push(options);
    }

    checkForUpdates(): void {
        this.checks += 1;
    }

    quitAndInstall(): void {
        if (this.installThrows !== null) throw this.installThrows;
        this.installs += 1;
    }

    on(event: string, listener: (...args: never[]) => void): unknown {
        const existing = this.listeners.get(event) ?? [];
        existing.push(listener as (...args: unknown[]) => void);
        this.listeners.set(event, existing);
        return this;
    }

    emit(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }
}

interface Scheduled {
    readonly handler: () => void;
    readonly ms: number;
}

function fakeTimers(): UpdateTimers & { readonly pending: Map<number, Scheduled>; fire(): void } {
    const pending = new Map<number, Scheduled>();
    let next = 1;
    return {
        pending,
        setTimeout(handler, ms) {
            const handle = next++;
            pending.set(handle, { handler, ms });
            return handle;
        },
        clearTimeout(handle) {
            pending.delete(handle as number);
        },
        fire() {
            const entries = [...pending.entries()];
            pending.clear();
            for (const [, entry] of entries) entry.handler();
        },
    };
}

const workingFeed: FeedResolution = resolveFeed({
    packaged: true,
    platform: "win32",
    arch: "x64",
    version: "0.1.0",
    repository: "Ding-Ding-Projects/material-bluemap",
    environment: {},
});

function bridgedFeedFor(version: string): FeedResolution {
    return resolveFeed({
        packaged: true,
        platform: "win32",
        arch: "x64",
        version,
        repository: "Ding-Ding-Projects/worldlens",
        legacyRepository: "Ding-Ding-Projects/material-bluemap",
        environment: {},
    });
}

const bridgedFeed: FeedResolution = bridgedFeedFor("0.1.0");

class MemoryHandoff implements UpdateFeedHandoff {
    private pair: string | null = null;
    confirmations = 0;

    get confirmed(): boolean {
        return this.pair !== null;
    }

    isCurrentConfirmed(currentIdentity: string, legacyIdentity: string): boolean {
        return this.pair === `${currentIdentity}\n${legacyIdentity}`;
    }

    confirmCurrent(currentIdentity: string, legacyIdentity: string): void {
        this.pair = `${currentIdentity}\n${legacyIdentity}`;
        this.confirmations += 1;
    }
}

interface Harness {
    readonly controller: UpdateController;
    readonly engine: FakeEngine;
    readonly timers: ReturnType<typeof fakeTimers>;
    readonly published: UpdateState[];
    rendering: boolean;
}

function harness(
    options: {
        readonly feed?: FeedResolution;
        readonly engine?: FakeEngine | null;
        readonly feedHandoff?: UpdateFeedHandoff;
    } = {},
): Harness {
    const engine = options.engine === undefined ? new FakeEngine() : options.engine;
    const timers = fakeTimers();
    const published: UpdateState[] = [];
    const state = { rendering: false };

    const controller = new UpdateController({
        currentVersion: "0.1.0",
        feed: options.feed ?? workingFeed,
        engine,
        renderInProgress: () => state.rendering,
        onChange: (next) => published.push(next),
        ...(options.feedHandoff === undefined ? {} : { feedHandoff: options.feedHandoff }),
        timers,
        now: () => new Date("2026-08-04T10:00:00Z"),
    });

    return {
        controller,
        engine: engine ?? new FakeEngine(),
        timers,
        published,
        get rendering(): boolean {
            return state.rendering;
        },
        set rendering(value: boolean) {
            state.rendering = value;
        },
    };
}

describe("UpdateController", () => {
    it("sets the feed and arms a delayed first check rather than checking at launch", () => {
        const test = harness();
        test.controller.start();

        expect(test.engine.feed?.url).toContain("update.electronjs.org");
        // Delayed: an update check is the least urgent thing happening while the window,
        // the embedded server and the render restore are all starting.
        expect(test.timers.pending.size).toBe(1);
        expect(test.engine.checks).toBe(0);

        test.timers.fire();
        expect(test.engine.checks).toBe(1);
    });

    it("falls back to the legacy feed for an unconfirmed profile, then restores current", () => {
        const test = harness({ feed: bridgedFeed, feedHandoff: new MemoryHandoff() });
        test.controller.start();
        test.controller.check({ manual: true });
        test.engine.emit("error", new Error("404 from current feed"));

        expect(test.engine.feeds.map((feed) => feed.url)).toEqual([
            expect.stringContaining("Ding-Ding-Projects/worldlens"),
            expect.stringContaining("Ding-Ding-Projects/material-bluemap"),
        ]);
        expect(test.engine.checks).toBe(2);

        test.engine.emit("update-not-available");
        expect(test.controller.current().status).toBe("up-to-date");
        expect(test.engine.feed?.url).toContain("Ding-Ding-Projects/worldlens");
    });

    it("keeps the current no-update result when selecting the legacy bridge is refused", () => {
        const engine = new FakeEngine();
        const test = harness({ feed: bridgedFeed, feedHandoff: new MemoryHandoff(), engine });
        test.controller.start();
        test.controller.check({ manual: true });
        engine.setFeedThrowsFor = "Ding-Ding-Projects/material-bluemap";

        engine.emit("update-not-available");

        expect(test.controller.current().status).toBe("up-to-date");
        expect(engine.feed?.url).toContain("Ding-Ding-Projects/worldlens");
    });

    it("persists a current-feed download and skips the legacy bridge on the next launch", () => {
        const handoff = new MemoryHandoff();
        const first = harness({ feed: bridgedFeed, feedHandoff: handoff });
        first.controller.start();
        first.controller.check({ manual: true });
        first.engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);
        expect(handoff.confirmed).toBe(true);
        expect(handoff.confirmations).toBe(1);

        const next = harness({ feed: bridgedFeed, feedHandoff: handoff });
        next.controller.start();
        next.controller.check({ manual: true });
        next.engine.emit("error", new Error("current feed offline"));

        expect(next.engine.feeds).toHaveLength(1);
        expect(next.engine.feed?.url).toContain("Ding-Ding-Projects/worldlens");
        expect(next.controller.current().status).toBe("failed");
    });

    it("keeps the current-feed confirmation across an installed-version change", () => {
        const handoff = new MemoryHandoff();
        const build100 = harness({
            feed: bridgedFeedFor("0.1.0-build.100"),
            feedHandoff: handoff,
        });
        build100.controller.start();
        build100.controller.check({ manual: true });
        build100.engine.emit("update-downloaded", {}, null, "0.1.0-build.101", new Date(), null);

        const build101 = harness({
            feed: bridgedFeedFor("0.1.0-build.101"),
            feedHandoff: handoff,
        });
        build101.controller.start();
        build101.controller.check({ manual: true });
        build101.engine.emit("error", new Error("current feed offline"));

        expect(build101.engine.feeds).toHaveLength(1);
        expect(build101.engine.feed?.url).toContain("Ding-Ding-Projects/worldlens");
        expect(build101.controller.current().status).toBe("failed");
    });

    it("does not confirm the current feed when the bridge release came from legacy", () => {
        const handoff = new MemoryHandoff();
        const test = harness({ feed: bridgedFeed, feedHandoff: handoff });
        test.controller.start();
        test.controller.check({ manual: true });
        test.engine.emit("error", new Error("current feed not ready"));
        test.engine.emit("update-downloaded", {}, null, "0.1.1", new Date(), null);

        expect(test.engine.feed?.url).toContain("Ding-Ding-Projects/material-bluemap");
        expect(handoff.confirmed).toBe(false);
    });

    it("reports up to date when there is no update", () => {
        const test = harness();
        test.controller.start();
        test.controller.check({ manual: true });
        test.engine.emit("update-not-available");

        const state = test.controller.current();
        expect(state.status).toBe("up-to-date");
        expect(state.checking).toBe(false);
        expect(state.lastCheckedAt).not.toBeNull();
    });

    it("reports downloading while the bytes come down, and never restarts by itself", () => {
        const test = harness();
        test.controller.start();
        test.controller.check({ manual: true });
        test.engine.emit("update-available");

        expect(test.controller.current().status).toBe("downloading");
        // The one guarantee that makes this non-interrupting: nothing installs unless the
        // user asks for it.
        expect(test.engine.installs).toBe(0);
    });

    it("reports ready with the exact version and the notes link", () => {
        const test = harness();
        test.controller.start();
        test.engine.emit("update-available");
        test.engine.emit(
            "update-downloaded",
            {},
            "Fixed the thing",
            "0.2.0",
            new Date(),
            "https://github.com/example/releases/tag/v0.2.0",
        );

        const state = test.controller.current();
        expect(state.status).toBe("ready");
        expect(state.readyVersion).toBe("0.2.0");
        expect(state.releaseNotes).toBe("Fixed the thing");
        expect(state.releaseNotesUrl).toBe("https://github.com/example/releases/tag/v0.2.0");
        // Nothing left to check for, so no timer is left running.
        expect(test.timers.pending.size).toBe(0);
    });

    it("refuses a non-https notes link rather than handing one to the shell", () => {
        const test = harness();
        test.controller.start();
        test.engine.emit("update-downloaded", {}, "", "0.2.0", new Date(), "file:///C:/evil.html");
        expect(test.controller.current().releaseNotesUrl).toBeNull();
    });

    it("installs only when asked, and reports the version it installed", () => {
        const test = harness();
        test.controller.start();
        test.engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);

        const result = test.controller.restart();
        expect(result).toEqual({ ok: true, version: "0.2.0" });
        expect(test.engine.installs).toBe(1);
    });

    it("declining a restart leaves the update staged and installs nothing", () => {
        const test = harness();
        test.controller.start();
        test.engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);

        // "Later" is simply not calling restart. The state must survive it untouched, so
        // the banner can be brought back and pressed tomorrow.
        expect(test.engine.installs).toBe(0);
        expect(test.controller.current().status).toBe("ready");
        expect(test.controller.current().readyVersion).toBe("0.2.0");
    });

    it("refuses to restart while a render is running, and says why", () => {
        const test = harness();
        test.controller.start();
        test.engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);
        test.rendering = true;

        const result = test.controller.restart();
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("render-in-progress");
        expect(result.message).toContain("throw that render away");
        expect(test.engine.installs).toBe(0);
        // And the update is still there afterwards, so the person loses nothing by trying.
        expect(test.controller.current().readyVersion).toBe("0.2.0");
    });

    it("treats a render that starts after the banner was drawn as a render in progress", () => {
        const test = harness();
        test.controller.start();
        test.engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);
        const drawn = test.controller.current();
        expect(drawn.renderInProgress).toBe(false);

        test.rendering = true;
        // Re-read at the moment of pressing rather than trusted from the published state.
        expect(test.controller.restart().ok).toBe(false);
    });

    it("treats a broken activity probe as busy rather than as free", () => {
        const timers = fakeTimers();
        const controller = new UpdateController({
            currentVersion: "0.1.0",
            feed: workingFeed,
            engine: new FakeEngine(),
            renderInProgress: () => {
                throw new Error("probe exploded");
            },
            onChange: () => {},
            timers,
        });
        controller.start();
        expect(controller.current().renderInProgress).toBe(true);
    });

    it("refuses to restart when nothing is staged", () => {
        const test = harness();
        test.controller.start();
        const result = test.controller.restart();
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("nothing-ready");
        expect(test.engine.installs).toBe(0);
    });

    it("reports an offline machine honestly and schedules a later attempt", () => {
        const test = harness();
        test.controller.start();
        test.timers.fire();
        test.engine.emit("error", new Error("getaddrinfo ENOTFOUND update.electronjs.org"));

        const state = test.controller.current();
        expect(state.status).toBe("failed");
        expect(state.failure?.code).toBe("offline");
        expect(state.checking).toBe(false);
        // Backed off rather than abandoned.
        expect(test.timers.pending.size).toBe(1);
    });

    it("reports a corrupt asset as a download that will probably fix itself", () => {
        const test = harness();
        test.controller.start();
        test.engine.emit("update-available");
        test.engine.emit("error", new Error("SHA1 of full.nupkg does not match RELEASES"));

        const state = test.controller.current();
        expect(state.failure?.code).toBe("corrupt-asset");
        expect(state.failure?.retryable).toBe(true);
    });

    it("never hides a failure behind a spinner", () => {
        const test = harness();
        test.controller.start();
        test.controller.check({ manual: true });
        expect(test.controller.current().checking).toBe(true);
        test.engine.emit("error", new Error("404 Not Found"));
        // The one rule the whole subsystem exists to keep: a check that fails stops looking
        // like a check that is still running.
        expect(test.controller.current().checking).toBe(false);
        expect(test.controller.current().status).toBe("failed");
    });

    it("cancels cleanly: after dispose, nothing is published and no timer survives", () => {
        const test = harness();
        test.controller.start();
        test.controller.check({ manual: true });
        const before = test.published.length;

        test.controller.dispose();
        expect(test.timers.pending.size).toBe(0);

        // An update in flight when the app quits must not write to a window that is gone.
        test.engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);
        test.engine.emit("error", new Error("ENOTFOUND"));
        expect(test.published.length).toBe(before);
    });

    it("ends in unsupported, with the feed's own reason, when there is nothing to drive", () => {
        const test = harness({
            feed: resolveFeed({
                packaged: false,
                platform: "win32",
                arch: "x64",
                version: "0.1.0",
                repository: "a/b",
                environment: {},
            }),
        });
        test.controller.start();

        const state = test.controller.current();
        expect(state.status).toBe("unsupported");
        expect(state.unsupportedReason).toContain("not installed by the setup program");
        // No schedule, no button that does nothing: a manual check is a no-op that keeps
        // the explanation rather than replacing it with an error.
        expect(test.timers.pending.size).toBe(0);
        test.controller.check({ manual: true });
        expect(test.controller.current().status).toBe("unsupported");
        expect(test.controller.current().unsupportedReason).toContain("not installed");
    });

    it("still reports a newer version on a build that cannot install one", () => {
        const timers = fakeTimers();
        const published: UpdateState[] = [];
        const controller = new UpdateController({
            currentVersion: "0.1.0",
            feed: { ok: false, reason: "Not packaged." },
            engine: null,
            renderInProgress: () => false,
            onChange: (state) => published.push(state),
            timers,
            probe: () =>
                Promise.resolve({
                    newer: true,
                    version: "0.2.0",
                    notesUrl: "https://example.test/r",
                }),
        });
        controller.start();

        return Promise.resolve().then(() => {
            const state = controller.current();
            expect(state.status).toBe("unsupported");
            expect(state.newVersion).toBe("0.2.0");
        });
    });

    it("does not turn a feed the updater refuses into a six-hourly retry", () => {
        const engine = new FakeEngine();
        engine.setFeedThrows = new Error("Can not find Update.exe");
        const test = harness({ engine });
        test.controller.start();

        expect(test.controller.current().status).toBe("failed");
        expect(test.controller.current().failure?.code).toBe("not-installed");
        expect(test.timers.pending.size).toBe(0);
    });

    it("turns a refusal from quitAndInstall into a value rather than an exception", () => {
        const engine = new FakeEngine();
        engine.installThrows = new Error("ENOSPC: no space left on device");
        const test = harness({ engine });
        test.controller.start();
        engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);

        const result = test.controller.restart();
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("failed");
        expect(result.message).toContain("could not be written to disk");
    });

    it("never asks the engine twice for one check", () => {
        const test = harness();
        test.controller.start();
        test.controller.check({ manual: true });
        test.controller.check({ manual: true });
        expect(test.engine.checks).toBe(1);
    });

    it("never checks again once an update is staged", () => {
        const test = harness();
        test.controller.start();
        test.engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);
        const before = test.engine.checks;
        test.controller.check({ manual: true });
        expect(test.engine.checks).toBe(before);
        expect(test.controller.current().status).toBe("ready");
    });
});

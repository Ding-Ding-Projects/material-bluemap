import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import { createUpdates } from "./useUpdates.js";
import { resolveUpdateBridge, type UpdateBridge, type UpdateRestartResult, type UpdateState } from "./updateBridge.js";
import { unknownUpdateState } from "./updateModel.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
});

afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

function ready(overrides: Partial<UpdateState> = {}): UpdateState {
    return { ...unknownUpdateState("0.1.0"), status: "ready", readyVersion: "0.2.0", ...overrides };
}

interface Fake {
    readonly bridge: UpdateBridge;
    push(state: UpdateState): void;
    readonly checks: number;
    readonly restarts: number;
    readonly listeners: number;
}

function fakeBridge(
    options: {
        readonly restart?: UpdateRestartResult;
        readonly first?: UpdateState;
        readonly canRestart?: boolean;
        readonly canCheck?: boolean;
    } = {},
): Fake {
    const listeners: ((state: UpdateState) => void)[] = [];
    const counters = { checks: 0, restarts: 0 };

    const bridge: UpdateBridge = {
        state: () => Promise.resolve(options.first ?? unknownUpdateState("0.1.0")),
        check: () => {
            counters.checks += 1;
            return Promise.resolve({ ...unknownUpdateState("0.1.0"), checking: true });
        },
        restart: () => {
            counters.restarts += 1;
            return Promise.resolve(options.restart ?? { ok: true, version: "0.2.0" });
        },
        onUpdateEvent: (listener) => {
            listeners.push(listener);
            return () => {
                const at = listeners.indexOf(listener);
                if (at >= 0) listeners.splice(at, 1);
            };
        },
        canRestart: options.canRestart ?? true,
        canCheck: options.canCheck ?? true,
    };

    return {
        bridge,
        push: (state) => {
            for (const listener of [...listeners]) listener(state);
        },
        get checks(): number {
            return counters.checks;
        },
        get restarts(): number {
            return counters.restarts;
        },
        get listeners(): number {
            return listeners.length;
        },
    };
}

describe("createUpdates", () => {
    it("reports no updater at all when there is no bridge", async () => {
        const updates = createUpdates({ bridge: null });
        expect(updates.available).toBe(false);
        expect(updates.banner.value.visible).toBe(false);
        // A build with no updater must not present a Restart button that throws.
        const answer = await updates.restart();
        expect(answer.ok).toBe(false);
    });

    it("subscribes before its first read, so a download that lands between the two is kept", async () => {
        const fake = fakeBridge();
        const updates = createUpdates({ bridge: fake.bridge });
        expect(fake.listeners).toBe(1);

        fake.push(ready());
        await Promise.resolve();
        expect(updates.banner.value.visible).toBe(true);
        updates.stop();
        expect(fake.listeners).toBe(0);
    });

    it("shows the banner when a version is staged, and hides it once dismissed", () => {
        const fake = fakeBridge();
        const updates = createUpdates({ bridge: fake.bridge });
        fake.push(ready());
        expect(updates.banner.value.visible).toBe(true);

        updates.dismiss();
        expect(updates.banner.value.visible).toBe(false);

        // Reachable again, which is what makes dismissing it safe to offer at all.
        updates.showAgain();
        expect(updates.banner.value.visible).toBe(true);
    });

    it("remembers a dismissal across a restart of the interface", () => {
        const fake = fakeBridge();
        const first = createUpdates({ bridge: fake.bridge });
        fake.push(ready());
        first.dismiss();
        first.stop();

        const second = createUpdates({ bridge: fake.bridge });
        fake.push(ready());
        expect(second.banner.value.visible).toBe(false);
    });

    it("reports a refused restart rather than pretending it worked", async () => {
        const seen: string[] = [];
        const fake = fakeBridge({
            restart: {
                ok: false,
                code: "render-in-progress",
                message: "A render is running.",
            },
        });
        const updates = createUpdates({ bridge: fake.bridge, onRefusal: (message) => seen.push(message) });
        fake.push(ready({ renderInProgress: true }));

        const answer = await updates.restart();
        expect(answer.ok).toBe(false);
        expect(updates.refusal.value).toBe("A render is running.");
        expect(seen).toEqual(["A render is running."]);
    });

    it("passes a manual check through, and clears the last refusal", async () => {
        const fake = fakeBridge();
        const updates = createUpdates({ bridge: fake.bridge });
        await updates.check();
        expect(fake.checks).toBe(1);
        expect(updates.state.value.checking).toBe(true);
        expect(updates.refusal.value).toBeNull();
    });

    it("turns a bridge that rejects into a refusal instead of an unhandled rejection", async () => {
        const fake = fakeBridge();
        const broken: UpdateBridge = {
            ...fake.bridge,
            check: () => Promise.reject(new Error("older preload")),
        };
        const updates = createUpdates({ bridge: broken });
        await updates.check();
        expect(updates.refusal.value).toBe("older preload");
    });

    it("hides Restart when the build can report but not install", () => {
        const fake = fakeBridge({ canRestart: false });
        const updates = createUpdates({ bridge: fake.bridge });
        fake.push(ready());
        expect(updates.banner.value.canRestart).toBe(false);
        expect(updates.status.value.canRestart).toBe(false);
    });
});

describe("resolveUpdateBridge", () => {
    it("answers null when the shell has no updater methods", () => {
        expect(resolveUpdateBridge()).toBeNull();
        (globalThis as { worldlens?: unknown }).worldlens = {};
        expect(resolveUpdateBridge()).toBeNull();
    });

    it("answers null when it can read the state but never hear about a change", () => {
        // A banner that has to poll is either stale or a timer nobody asked for, and the
        // whole point of this one is that it appears the moment the download finishes.
        (globalThis as { worldlens?: unknown }).worldlens = {
            updateState: () => Promise.resolve(unknownUpdateState("0.1.0")),
        };
        expect(resolveUpdateBridge()).toBeNull();
    });

    it("reports a partly wired shell as partly wired rather than refusing outright", async () => {
        (globalThis as { worldlens?: unknown }).worldlens = {
            updateState: () => Promise.resolve(unknownUpdateState("0.1.0")),
            onUpdateEvent: () => () => {},
        };
        const bridge = resolveUpdateBridge();
        expect(bridge).not.toBeNull();
        expect(bridge?.canRestart).toBe(false);
        expect(bridge?.canCheck).toBe(false);

        const refusal = await bridge?.restart();
        expect(refusal?.ok).toBe(false);
    });
});

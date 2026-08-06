import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewHost } from "./previewHost.js";
import type {
    PreviewAvailability,
    PreviewBridge,
    PreviewEvent,
    PreviewNetworkReadout,
    PreviewStartAnswer,
    PreviewStatus,
} from "./previewBridge.js";

function fakeBridge(overrides: Partial<PreviewBridge> = {}): PreviewBridge & {
    listeners: ((event: PreviewEvent) => void)[];
    started: { renderId: string; allowNetwork: boolean }[];
} {
    const listeners: ((event: PreviewEvent) => void)[] = [];
    const started: { renderId: string; allowNetwork: boolean }[] = [];
    let status: PreviewStatus = {
        running: false,
        renderId: null,
        url: null,
        host: null,
        port: null,
        renderActive: false,
    };

    const base: PreviewBridge & { listeners: typeof listeners; started: typeof started } = {
        listeners,
        started,
        canOpenInBrowser: true,
        listRenders: async () => [
            { renderId: "world-a", label: "world-a (overworld)", running: false },
            { renderId: "world-b", label: "world-b (overworld)", running: true },
        ],
        availability: async (): Promise<PreviewAvailability> => ({ ok: true }),
        start: async (renderId, allowNetwork): Promise<PreviewStartAnswer> => {
            started.push({ renderId, allowNetwork });
            status = { running: true, renderId, url: "http://127.0.0.1:48100/", host: "127.0.0.1", port: 48100, renderActive: true };
            return { ok: true, renderId, url: status.url as string, host: "127.0.0.1", port: 48100 };
        },
        stop: async () => {
            status = { running: false, renderId: null, url: null, host: null, port: null, renderActive: false };
            return true;
        },
        status: async () => status,
        openInBrowser: async () => true,
        networkDefault: async (): Promise<PreviewNetworkReadout> => ({ allowNetwork: false, isDefault: true }),
        setNetworkDefault: async (allowNetwork): Promise<PreviewNetworkReadout> => ({
            allowNetwork,
            isDefault: !allowNetwork,
        }),
        onEvent: (listener) => {
            listeners.push(listener);
            return () => {
                const index = listeners.indexOf(listener);
                if (index >= 0) listeners.splice(index, 1);
            };
        },
    };
    return { ...base, ...overrides, listeners, started };
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("with no bridge at all", () => {
    it("reports itself unavailable rather than throwing", async () => {
        const host = createPreviewHost({ bridge: null });
        await flush();
        expect(host.available).toBe(false);
        expect(host.canStart.value).toBe(false);
        await host.start();
        expect(host.status.value.running).toBe(false);
        host.dispose();
    });
});

describe("loading renders", () => {
    it("loads the list and auto-selects the first, checking its availability", async () => {
        const bridge = fakeBridge();
        const host = createPreviewHost({ bridge });
        await flush();
        expect(host.renders.value).toHaveLength(2);
        expect(host.selectedRenderId.value).toBe("world-a");
        expect(host.availability.value).toEqual({ ok: true });
        host.dispose();
    });

    it("carries the failure when the render list cannot be read, rather than throwing", async () => {
        const bridge = fakeBridge({
            listRenders: async () => {
                throw new Error("disk unreadable");
            },
        });
        const host = createPreviewHost({ bridge });
        await flush();
        expect(host.rendersFailure.value).toContain("disk unreadable");
        host.dispose();
    });
});

describe("availability gates starting", () => {
    it("cannot start when the selected render is unavailable", async () => {
        const bridge = fakeBridge({
            availability: async (): Promise<PreviewAvailability> => ({
                ok: false,
                code: "on-github-runners",
                reason: "running on GitHub's own servers",
            }),
        });
        const host = createPreviewHost({ bridge });
        await flush();
        expect(host.canStart.value).toBe(false);
        await host.start();
        expect(bridge.started).toHaveLength(0);
        host.dispose();
    });

    it("switching the selected render re-checks availability for the new one", async () => {
        const calls: string[] = [];
        const bridge = fakeBridge({
            availability: async (renderId): Promise<PreviewAvailability> => {
                calls.push(renderId);
                return { ok: true };
            },
        });
        const host = createPreviewHost({ bridge });
        await flush();
        await host.selectRender("world-b");
        expect(calls).toEqual(["world-a", "world-b"]);
        expect(host.selectedRenderId.value).toBe("world-b");
        host.dispose();
    });
});

describe("starting and stopping", () => {
    it("starts, passes the network opt-in through exactly, and updates status", async () => {
        const bridge = fakeBridge();
        const host = createPreviewHost({ bridge });
        await flush();
        await host.setAllowNetwork(true);
        await host.start();
        expect(bridge.started).toEqual([{ renderId: "world-a", allowNetwork: true }]);
        expect(host.status.value.running).toBe(true);
        expect(host.status.value.url).toBe("http://127.0.0.1:48100/");
        host.dispose();
    });

    it("a refused start is reported and never silently swallowed", async () => {
        const bridge = fakeBridge({
            start: async () => ({ ok: false, reason: "port trouble" }),
        });
        const host = createPreviewHost({ bridge });
        await flush();
        await host.start();
        expect(host.startFailure.value).toBe("port trouble");
        expect(host.status.value.running).toBe(false);
        host.dispose();
    });

    it("stopping resets status back to not running", async () => {
        const bridge = fakeBridge();
        const host = createPreviewHost({ bridge });
        await flush();
        await host.start();
        expect(host.status.value.running).toBe(true);
        await host.stop();
        expect(host.status.value.running).toBe(false);
        host.dispose();
    });
});

describe("the network-exposure default", () => {
    it("loads the persisted default on construction", async () => {
        const bridge = fakeBridge({
            networkDefault: async (): Promise<PreviewNetworkReadout> => ({ allowNetwork: true, isDefault: false }),
        });
        const host = createPreviewHost({ bridge });
        await flush();
        expect(host.allowNetwork.value).toBe(true);
        expect(host.networkReadout.value?.isDefault).toBe(false);
        host.dispose();
    });

    it("persists a change through the bridge", async () => {
        const bridge = fakeBridge();
        const host = createPreviewHost({ bridge });
        await flush();
        await host.setAllowNetwork(true);
        expect(host.networkReadout.value).toEqual({ allowNetwork: true, isDefault: false });
        host.dispose();
    });
});

describe("events pushed from the main process", () => {
    it("surfaces the latest event and refreshes status when one arrives", async () => {
        const bridge = fakeBridge();
        const host = createPreviewHost({ bridge });
        await flush();
        const event: PreviewEvent = {
            type: "started",
            renderId: "world-a",
            url: "http://127.0.0.1:48100/",
            host: "127.0.0.1",
            port: 48100,
            at: "2026-01-01T00:00:00.000Z",
        };
        bridge.listeners[0]?.(event);
        await flush();
        expect(host.lastEvent.value).toEqual(event);
        host.dispose();
    });
});

describe("disposing", () => {
    it("stops polling status and unsubscribes from events", async () => {
        const statusCalls: number[] = [];
        const bridge = fakeBridge();
        const originalStatus = bridge.status;
        bridge.status = async () => {
            statusCalls.push(1);
            return await originalStatus();
        };
        const host = createPreviewHost({ bridge, pollIntervalMs: 1000 });
        await flush();
        const before = statusCalls.length;
        host.dispose();
        expect(bridge.listeners).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(5000);
        expect(statusCalls.length).toBe(before);
    });
});

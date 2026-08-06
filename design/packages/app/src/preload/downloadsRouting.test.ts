/**
 * The downloads bridge routes through `worldsource:*`, and this is the test that fails when
 * it stops.
 *
 * `worldSourceBridge.test.ts` beside this one proves the *mapping* - that a source's `kind`
 * becomes the panel's `split` flag - but it would pass unchanged if somebody reverted
 * `preload/index.ts`'s `discoverRelease` from `worldsource:discover` back to
 * `download:discover`. The mapping is not the wiring. This is: it takes the actual object
 * the preload hands to `contextBridge.exposeInMainWorld` and checks which channel each
 * download method invokes, so a revert to `download:*` - the exact regression
 * `docs/world-sources.md` used to warn about, and the one the checksum-list layout is
 * invisible through - turns this red.
 *
 * The sibling file's doc comment says the preload "cannot be exercised by a plain Node
 * test", because requiring the real `electron` package outside Electron returns a path
 * string rather than the API surface. That is true of the *real* package; `vi.mock`
 * replaces it wholesale, so `contextBridge`, `ipcRenderer` and `webUtils` are the stubs
 * below and the module loads. The only top-level side effect the preload has is the single
 * `exposeInMainWorld` call at the end, so importing it here does exactly one thing:
 * builds the bridge object and hands it to a mock we can then read back.
 *
 * Why route through `worldsource:*` at all: it is `download:*`'s superset. A manifest-shaped
 * or unsplit release is handed straight to the same `ReleaseDownloader`, and a checksum-list
 * release from any public repository is additionally understood; `cancel`/`active` are the
 * union of what the checksum-list fetcher and the shared downloader each have in flight, so
 * asking only `download:*` would silently fail to stop or list a checksum-list download.
 * `list` stays on `download:list` and the event stream stays on `download:event` on purpose,
 * because both paths write the same record into the same workspace and broadcast on the same
 * channel - so those two are asserted to have *not* moved, which is as much a part of the
 * contract as the four that did.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() },
    webUtils: { getPathForFile: vi.fn(() => "") },
}));

import { contextBridge, ipcRenderer } from "electron";
// Side-effect import: evaluating the preload runs its one top-level statement,
// `exposeInMainWorld("materialBluemap", bridge)`, against the mock above.
import "./index.js";

/** Only the download methods this test drives, cast off the exposed bridge object. */
interface DownloadsBridge {
    discoverRelease(request: { owner: string; repo: string; tag?: string }): Promise<unknown>;
    startDownload(request: unknown): Promise<unknown>;
    cancelDownload(downloadId: string): Promise<unknown>;
    activeDownloads(): Promise<unknown>;
    listDownloads(): Promise<unknown>;
    onDownloadEvent(listener: (event: unknown) => void): () => void;
}

/** A valid discover answer, so the real `toBridgeDiscoveryResult` seam has something to map. */
const DISCOVER_ANSWER = {
    ok: true,
    release: { owner: "o", repo: "r", tag: "v1", name: "v1", htmlUrl: "", sources: [] },
} as const;

let bridge: DownloadsBridge;

beforeAll(() => {
    const calls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls;
    // Exactly one bridge is exposed, under the one key the renderer reads it back from.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("materialBluemap");
    bridge = calls[0]?.[1] as DownloadsBridge;
});

beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset();
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcRenderer.on).mockReset();
});

describe("the downloads bridge routes through worldsource:*", () => {
    it("discoverRelease reads the release through worldsource:discover, mapped", async () => {
        vi.mocked(ipcRenderer.invoke).mockResolvedValue(DISCOVER_ANSWER);
        const request = { owner: "cafepromenade", repo: "Andyville-World", tag: "backup-1" };

        const result = await bridge.discoverRelease(request);

        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:discover", request);
        // The seam ran too: the raw `sources` answer came back as the flat `downloads`
        // shape the panel reads, not as the worldsource `sources`/`kind` shape it cannot.
        expect(result).toEqual({ ok: true, release: { tag: "v1", name: "v1", htmlUrl: "", downloads: [] } });
    });

    it("startDownload fetches through worldsource:fetch", async () => {
        const request = { owner: "o", repo: "r", tag: "v1", asset: "world.zip" };

        await bridge.startDownload(request);

        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:fetch", request);
    });

    it("cancelDownload stops through worldsource:cancel, which asks both in-flight maps", async () => {
        await bridge.cancelDownload("download-42");

        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:cancel", "download-42");
    });

    it("activeDownloads lists in-flight ids through worldsource:active", async () => {
        await bridge.activeDownloads();

        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:active");
    });
});

describe("the two paths that must not move", () => {
    it("listDownloads stays on download:list, because both paths write the same record", async () => {
        await bridge.listDownloads();

        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("download:list");
    });

    it("onDownloadEvent stays subscribed to download:event, the one shared progress stream", () => {
        const unsubscribe = bridge.onDownloadEvent(() => undefined);

        expect(ipcRenderer.on).toHaveBeenCalledTimes(1);
        expect(vi.mocked(ipcRenderer.on).mock.calls[0]?.[0]).toBe("download:event");
        expect(typeof unsubscribe).toBe("function");
    });
});

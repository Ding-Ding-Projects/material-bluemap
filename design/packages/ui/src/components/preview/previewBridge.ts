/**
 * Typed access to "host this render live", mirroring `pagesBridge.ts`'s own shape:
 * `resolvePreviewBridge()` probes the real Electron preload and returns `null` when this
 * build cannot host a render at all (a browser tab with no bridge, for instance), so a
 * component never has to guess whether a method exists before calling it.
 */

export type PreviewAvailability =
    | { readonly ok: true }
    | { readonly ok: false; readonly code: "on-github-runners" | "not-found"; readonly reason: string };

/** One render this computer knows about, shaped for a picker rather than for a details view. */
export interface PreviewRenderOption {
    readonly renderId: string;
    /** The render id plus its map names, when known - what a person actually recognises. */
    readonly label: string;
    /** Still being written to, right now, by this process. */
    readonly running: boolean;
}

export type PreviewStartAnswer =
    | { readonly ok: true; readonly renderId: string; readonly url: string; readonly host: string; readonly port: number }
    | { readonly ok: false; readonly reason: string };

export interface PreviewStatus {
    readonly running: boolean;
    readonly renderId: string | null;
    readonly url: string | null;
    readonly host: string | null;
    readonly port: number | null;
    readonly renderActive: boolean;
}

export type PreviewEvent =
    | {
          readonly type: "started";
          readonly renderId: string;
          readonly url: string;
          readonly host: string;
          readonly port: number;
          readonly at: string;
      }
    | { readonly type: "stopped"; readonly renderId: string; readonly at: string }
    | { readonly type: "failed"; readonly renderId: string; readonly reason: string; readonly at: string };

export interface PreviewNetworkReadout {
    readonly allowNetwork: boolean;
    readonly isDefault: boolean;
}

const UNSUPPORTED_NETWORK_READOUT: PreviewNetworkReadout = { allowNetwork: false, isDefault: true };

export interface PreviewBridge {
    /** Every render this computer knows about, newest-looking first. */
    listRenders(): Promise<readonly PreviewRenderOption[]>;
    availability(renderId: string): Promise<PreviewAvailability>;
    start(renderId: string, allowNetwork: boolean): Promise<PreviewStartAnswer>;
    /** Stops whatever is currently hosted. False when nothing was running. */
    stop(): Promise<boolean>;
    status(): Promise<PreviewStatus>;
    /** True when this build can hand a URL to the system browser for you. */
    readonly canOpenInBrowser: boolean;
    openInBrowser(): Promise<boolean>;
    networkDefault(): Promise<PreviewNetworkReadout>;
    setNetworkDefault(allowNetwork: boolean): Promise<PreviewNetworkReadout>;
    onEvent(listener: (event: PreviewEvent) => void): () => void;
}

interface RawRenderSummary {
    readonly renderId?: unknown;
    readonly maps?: unknown;
}

/** The shape a preload is probed against, one method at a time. */
type Host = Partial<{
    listRenders: () => Promise<readonly RawRenderSummary[]>;
    activeRenders: () => Promise<readonly string[]>;
    previewAvailability: (renderId: string) => Promise<PreviewAvailability>;
    startPreview: (request: { renderId: string; allowNetwork?: boolean }) => Promise<PreviewStartAnswer>;
    stopPreview: () => Promise<boolean>;
    previewStatus: () => Promise<PreviewStatus>;
    openPreviewInBrowser: () => Promise<boolean>;
    previewNetworkDefault: () => Promise<PreviewNetworkReadout>;
    setPreviewNetworkDefault: (allowNetwork: boolean) => Promise<PreviewNetworkReadout>;
    onPreviewEvent: (listener: (event: PreviewEvent) => void) => () => void;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

function mapLabel(entry: unknown): string {
    if (typeof entry === "string") return entry;
    if (typeof entry === "object" && entry !== null && "id" in entry) {
        const id = (entry as { id: unknown }).id;
        return typeof id === "string" ? id : "";
    }
    return "";
}

function labelFor(summary: RawRenderSummary): string {
    const id = typeof summary.renderId === "string" ? summary.renderId : "";
    const maps = Array.isArray(summary.maps)
        ? summary.maps.map(mapLabel).filter((name) => name.length > 0).join(", ")
        : "";
    return maps.length > 0 ? `${id} (${maps})` : id;
}

/**
 * The bridge, or `null` when this build cannot host a render live at all. Requires the four
 * calls with no honest fallback - checking whether a render can be hosted, starting it,
 * stopping it, and hearing what happened - the same "all or nothing for what cannot degrade"
 * rule `pagesBridge.ts` applies to its own four.
 */
export function resolvePreviewBridge(): PreviewBridge | null {
    const host = (globalThis as { worldlens?: Host }).worldlens;
    if (host === undefined) return null;

    const { previewAvailability, startPreview, stopPreview, previewStatus, onPreviewEvent } = host;
    if (
        !isFunction(previewAvailability) ||
        !isFunction(startPreview) ||
        !isFunction(stopPreview) ||
        !isFunction(previewStatus) ||
        !isFunction(onPreviewEvent)
    ) {
        return null;
    }

    const canOpenInBrowser = isFunction(host.openPreviewInBrowser);

    return {
        canOpenInBrowser,
        listRenders: async () => {
            const listRenders = host.listRenders;
            if (!isFunction(listRenders)) return [];
            const activeRenders = host.activeRenders;
            const [summaries, active] = await Promise.all([
                listRenders(),
                isFunction(activeRenders) ? activeRenders() : Promise.resolve([]),
            ]);
            const activeSet = new Set(active);
            const options: PreviewRenderOption[] = [];
            for (const summary of summaries) {
                if (typeof summary.renderId !== "string") continue;
                options.push({
                    renderId: summary.renderId,
                    label: labelFor(summary),
                    running: activeSet.has(summary.renderId),
                });
            }
            return options;
        },
        availability: (renderId) => previewAvailability(renderId),
        start: (renderId, allowNetwork) => startPreview({ renderId, allowNetwork }),
        stop: () => stopPreview(),
        status: () => previewStatus(),
        openInBrowser: () => {
            const call = host.openPreviewInBrowser;
            return isFunction(call) ? call() : Promise.resolve(false);
        },
        networkDefault: () => {
            const call = host.previewNetworkDefault;
            return isFunction(call) ? call() : Promise.resolve(UNSUPPORTED_NETWORK_READOUT);
        },
        setNetworkDefault: (allowNetwork) => {
            const call = host.setPreviewNetworkDefault;
            return isFunction(call) ? call(allowNetwork) : Promise.resolve(UNSUPPORTED_NETWORK_READOUT);
        },
        onEvent: (listener) => onPreviewEvent(listener),
    };
}

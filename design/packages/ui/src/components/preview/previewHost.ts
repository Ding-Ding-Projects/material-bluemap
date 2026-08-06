/**
 * State for the "watch it live" panel: which render is picked, whether it can be hosted,
 * whether it currently is, and the persisted network-exposure default.
 *
 * Framework-light on purpose, the same way `pagesHosting.ts` is: every reactive piece is a
 * plain `ref`/`computed`, nothing here calls `useI18n()` or raises a notice itself, and the
 * whole thing is constructed from a `PreviewBridge` a test can fake with no Electron and no
 * mounted component anywhere near it. `PreviewScreen.vue` watches `lastEvent` and turns it
 * into the actual on-screen notices, in the user's own language and funny level.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
    resolvePreviewBridge,
    type PreviewAvailability,
    type PreviewBridge,
    type PreviewEvent,
    type PreviewNetworkReadout,
    type PreviewRenderOption,
    type PreviewStatus,
} from "./previewBridge.js";

export interface PreviewHostOptions {
    /** Injected in tests. Left out, the real Electron bridge is probed. */
    bridge?: PreviewBridge | null;
    /** How often the running server's own status is re-read, in milliseconds. */
    pollIntervalMs?: number;
}

export interface PreviewHost {
    /** True when this build can host a render live at all. */
    readonly available: boolean;
    /** True when this build can hand the address to the system browser. */
    readonly canOpenInBrowser: boolean;

    readonly renders: Ref<readonly PreviewRenderOption[]>;
    readonly rendersFailure: Ref<string | null>;
    readonly selectedRenderId: Ref<string>;

    /** Whether the selected render can be hosted right now, and why not when it cannot. */
    readonly availability: Ref<PreviewAvailability | null>;
    readonly checkingAvailability: Ref<boolean>;

    readonly status: Ref<PreviewStatus>;
    readonly starting: Ref<boolean>;
    readonly stopping: Ref<boolean>;
    readonly startFailure: Ref<string | null>;

    /** The network-exposure checkbox's own value. Starts at the persisted default. */
    readonly allowNetwork: Ref<boolean>;
    readonly networkReadout: Ref<PreviewNetworkReadout | null>;

    /** The most recent event pushed from the main process. Watch it to raise notices. */
    readonly lastEvent: Ref<PreviewEvent | null>;

    readonly canStart: ComputedRef<boolean>;

    loadRenders(): Promise<void>;
    selectRender(renderId: string): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    openInBrowser(): Promise<boolean>;
    setAllowNetwork(value: boolean): Promise<void>;
    refreshStatus(): Promise<void>;
    dispose(): void;
}

const EMPTY_STATUS: PreviewStatus = {
    running: false,
    renderId: null,
    url: null,
    host: null,
    port: null,
    renderActive: false,
};

const DEFAULT_POLL_INTERVAL_MS = 5000;

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createPreviewHost(options: PreviewHostOptions = {}): PreviewHost {
    const bridge = options.bridge !== undefined ? options.bridge : resolvePreviewBridge();
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    const renders = ref<readonly PreviewRenderOption[]>([]);
    const rendersFailure = ref<string | null>(null);
    const selectedRenderId = ref("");

    const availability = ref<PreviewAvailability | null>(null);
    const checkingAvailability = ref(false);

    const status = ref<PreviewStatus>(EMPTY_STATUS);
    const starting = ref(false);
    const stopping = ref(false);
    const startFailure = ref<string | null>(null);

    const allowNetwork = ref(false);
    const networkReadout = ref<PreviewNetworkReadout | null>(null);

    const lastEvent = ref<PreviewEvent | null>(null);

    let checkToken = 0;
    let statusTimer: ReturnType<typeof setInterval> | null = null;

    async function checkAvailability(): Promise<void> {
        if (bridge === null || selectedRenderId.value === "") {
            availability.value = null;
            return;
        }
        const token = ++checkToken;
        checkingAvailability.value = true;
        try {
            const answer = await bridge.availability(selectedRenderId.value);
            if (token === checkToken) availability.value = answer;
        } catch (error) {
            if (token === checkToken) {
                availability.value = { ok: false, code: "not-found", reason: describe(error) };
            }
        } finally {
            if (token === checkToken) checkingAvailability.value = false;
        }
    }

    async function selectRender(renderId: string): Promise<void> {
        selectedRenderId.value = renderId;
        startFailure.value = null;
        await checkAvailability();
    }

    async function loadRenders(): Promise<void> {
        if (bridge === null) return;
        try {
            renders.value = await bridge.listRenders();
            rendersFailure.value = null;
        } catch (error) {
            rendersFailure.value = describe(error);
            return;
        }
        if (selectedRenderId.value === "") {
            const first = renders.value[0];
            if (first !== undefined) await selectRender(first.renderId);
        }
    }

    async function refreshStatus(): Promise<void> {
        if (bridge === null) return;
        try {
            status.value = await bridge.status();
        } catch {
            // A failed status read must never stop the panel from working - the last known
            // state stays on screen until the next poll succeeds.
        }
    }

    function ensurePolling(): void {
        if (statusTimer !== null || bridge === null) return;
        statusTimer = setInterval(() => void refreshStatus(), pollIntervalMs);
    }

    const canStart = computed(
        () =>
            bridge !== null &&
            selectedRenderId.value !== "" &&
            availability.value?.ok === true &&
            !status.value.running &&
            !starting.value,
    );

    async function start(): Promise<void> {
        if (bridge === null || !canStart.value) return;
        starting.value = true;
        startFailure.value = null;
        try {
            const answer = await bridge.start(selectedRenderId.value, allowNetwork.value);
            if (!answer.ok) {
                startFailure.value = answer.reason;
                return;
            }
            await refreshStatus();
        } catch (error) {
            startFailure.value = describe(error);
        } finally {
            starting.value = false;
        }
    }

    async function stop(): Promise<void> {
        if (bridge === null) return;
        stopping.value = true;
        try {
            await bridge.stop();
            await refreshStatus();
        } finally {
            stopping.value = false;
        }
    }

    async function openInBrowser(): Promise<boolean> {
        if (bridge === null) return false;
        return await bridge.openInBrowser();
    }

    async function loadNetworkDefault(): Promise<void> {
        if (bridge === null) return;
        const readout = await bridge.networkDefault();
        networkReadout.value = readout;
        allowNetwork.value = readout.allowNetwork;
    }

    async function setAllowNetwork(value: boolean): Promise<void> {
        allowNetwork.value = value;
        if (bridge === null) return;
        networkReadout.value = await bridge.setNetworkDefault(value);
    }

    const unsubscribe =
        bridge === null
            ? null
            : bridge.onEvent((event) => {
                  lastEvent.value = event;
                  void refreshStatus();
              });

    void loadRenders();
    void loadNetworkDefault();
    void refreshStatus();
    ensurePolling();

    return {
        available: bridge !== null,
        canOpenInBrowser: bridge?.canOpenInBrowser ?? false,
        renders,
        rendersFailure,
        selectedRenderId,
        availability,
        checkingAvailability,
        status,
        starting,
        stopping,
        startFailure,
        allowNetwork,
        networkReadout,
        lastEvent,
        canStart,
        loadRenders,
        selectRender,
        start,
        stop,
        openInBrowser,
        setAllowNetwork,
        refreshStatus,
        dispose(): void {
            unsubscribe?.();
            if (statusTimer !== null) {
                clearInterval(statusTimer);
                statusTimer = null;
            }
        },
    };
}

/**
 * Watching a render live, in a real browser tab, on this machine or on another device on
 * this network - explicit opt-in only. See `server.ts` for the handler and the port/bind
 * logic, `ipc.ts` for the channel the interface drives it through, and
 * `networkExposure.ts` for the one persisted setting this feature has.
 */

export {
    DEFAULT_PREVIEW_PORT,
    LOOPBACK_HOST,
    NETWORK_HOST,
    PREVIEW_STATUS_PATH,
    RenderPreviewHandler,
    injectLiveBanner,
    startPreviewServer,
} from "./server.js";
export type {
    PreviewBindHost,
    PreviewServerHandle,
    RenderPreviewHandlerOptions,
    StartPreviewServerOptions,
} from "./server.js";

export { DEFAULT_ALLOW_NETWORK, PREVIEW_NETWORK_FILE, PreviewNetworkStore } from "./networkExposure.js";
export type { PreviewNetworkSetting, PreviewNetworkStoreOptions } from "./networkExposure.js";

export { PREVIEW_CHANNELS, PREVIEW_EVENT_CHANNEL, installPreviewIpc } from "./ipc.js";
export type {
    PreviewAvailability,
    PreviewEvent,
    PreviewIpc,
    PreviewIpcOptions,
    PreviewNetworkReadout,
    PreviewStartAnswer,
    PreviewStartRequest,
    PreviewStatusAnswer,
} from "./ipc.js";

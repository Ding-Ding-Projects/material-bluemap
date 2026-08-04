/**
 * The window itself.
 *
 * `AppTitleBar` is the application's own caption bar, drawn because the Electron window
 * is frameless and the operating system's grey strip is never shown as product chrome.
 * Mount it once, as a direct child of `v-app` and above `v-main`; it renders nothing at
 * all in a browser build, where there is no window to minimise or close.
 *
 * The rest is exported for tests and for anything that needs the window state without
 * the bar.
 */

export { default as AppTitleBar } from "./AppTitleBar.vue";

export { createWindowControls, resolveWindowBridge } from "./windowControls.js";
export type { WindowBridge, WindowControls } from "./windowControls.js";

export { onRevealRequested, requestReveal, resetRevealRequests, revealCount } from "./revealRequests.js";
export type { RevealRequest } from "./revealRequests.js";

/**
 * The control bar is mounted as a single component; everything else in this folder is an
 * implementation detail of it. The shell only ever needs `ControlBar`.
 */
export { default as ControlBar } from "./ControlBar.vue";
export { useControlBarApp, prefersReducedMotion } from "./useControlBarApp.js";

/**
 * Public surface of the package-manager provisioning engine.
 *
 * See `types.ts` for the event/outcome vocabulary, `registry.ts` for the
 * per-dependency route table, and `install.ts` for the one operation everything
 * else should call.
 */

export * from "./types.js";
export * from "./process.js";
export * from "./winget.js";
export * from "./chocolatey.js";
export * from "./registry.js";
export * from "./verify.js";
export * from "./install.js";

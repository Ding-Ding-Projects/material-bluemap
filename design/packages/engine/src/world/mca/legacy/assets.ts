import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves files bundled with the engine package (packages/engine/assets/...).
 *
 * The package root is resolved relative to this module: both the source tree
 * (src/world/mca/legacy/) and the build output (dist/world/mca/legacy/) sit four
 * directories below the package root, so the same relative walk works for either.
 */
const PACKAGE_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
);

/** Absolute path of a file inside the engine package's assets directory */
export function engineAssetPath(...segments: string[]): string {
    return path.join(PACKAGE_ROOT, "assets", ...segments);
}

/**
 * Reads and parses one of the legacy (pre-1.13) resource-mapping json files
 * (assets/legacy/, extracted from the BlueMap v0.10.3-mc1.12 default configs).
 */
export function readLegacyJsonAsset(name: string): unknown {
    return JSON.parse(readFileSync(engineAssetPath("legacy", name), "utf-8"));
}

/**
 * Worldlens product identity.
 *
 * A product name has two very different jobs in this application:
 *
 * - {@link WORLDLENS_IDENTITY} is the immutable machine identity. It names packages,
 *   storage, update channels, repository markers, schemas and diagnostics. Changing one
 *   of these values is a compatibility migration.
 * - {@link resolveDisplayName} is presentation only. A person may change the name shown
 *   in the title bar, About surface, notifications and introductory copy without moving
 *   data or making an installed application look like a different product to its updater.
 *
 * Keep that split structural. Code that needs a machine identifier imports the constant
 * directly; it never accepts a display name as an argument.
 */

export const WORLDLENS_IDENTITY = Object.freeze({
    shippedName: "Worldlens",
    packageScope: "@worldlens",
    appPackageName: "@worldlens/app",
    applicationId: "dev.worldlens.desktop",
    squirrelPackageId: "Worldlens",
    executableName: "Worldlens",
    dataDirectoryName: "Worldlens",
    diagnosticsProductName: "Worldlens",
    repository: "Ding-Ding-Projects/worldlens",
    updateEnvironmentPrefix: "WORLDLENS",
    bridgeGlobal: "worldlens",
    markerTool: "worldlens",
    ciMarkerFile: ".worldlens-ci.json",
    worldMarkerFile: ".worldlens-world.json",
    mapMarkerFile: ".worldlens-map.json",
    projectFileName: "worldlens.project.json",
    projectSchemaId: "worldlens.project",
} as const);

/** Compatibility identifiers read during the migration window, never written anew. */
export const LEGACY_MATERIAL_BLUEMAP_IDENTITY = Object.freeze({
    shippedName: "Material BlueMap",
    packageScope: "@material-bluemap",
    appPackageName: "@material-bluemap/app",
    dataDirectorySegments: ["@material-bluemap", "app"] as const,
    repository: "Ding-Ding-Projects/material-bluemap",
    updateEnvironmentPrefix: "MATERIAL_BLUEMAP",
    bridgeGlobal: "materialBluemap",
    markerTool: "material-bluemap",
    ciMarkerFile: ".material-bluemap-ci.json",
    worldMarkerFile: ".material-bluemap-world.json",
    mapMarkerFile: ".material-bluemap-map.json",
    projectFileName: "material-bluemap.project.json",
    projectSchemaId: "material-bluemap.project",
} as const);

export const DISPLAY_NAME_STORAGE_KEY = "worldlens.display-name";
export const DISPLAY_NAME_MAX_LENGTH = 80;

/**
 * Returns a safe cosmetic name, or the shipped name when a stored value is unusable.
 *
 * Newlines and control characters are removed because the same value appears in compact
 * chrome and notification headings. This is not a machine identifier sanitizer: callers
 * must never derive an identifier from this result at all.
 */
export function resolveDisplayName(value: unknown): string {
    if (typeof value !== "string") return WORLDLENS_IDENTITY.shippedName;
    const normalized = value
        .normalize("NFC")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, DISPLAY_NAME_MAX_LENGTH)
        .trim();
    return normalized === "" ? WORLDLENS_IDENTITY.shippedName : normalized;
}

/** The only product names a diagnostic payload may expose. */
export interface ProductNames {
    /** Cosmetic and user-configurable. Never use as an identifier. */
    readonly displayName: string;
    /** Immutable shipped identity used in diagnostics and issue reports. */
    readonly diagnosticsProductName: typeof WORLDLENS_IDENTITY.diagnosticsProductName;
}

export function productNames(displayName: unknown): ProductNames {
    return {
        displayName: resolveDisplayName(displayName),
        diagnosticsProductName: WORLDLENS_IDENTITY.diagnosticsProductName,
    };
}


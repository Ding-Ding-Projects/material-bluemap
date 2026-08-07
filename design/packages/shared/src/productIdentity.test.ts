import { describe, expect, it } from "vitest";
import {
    DISPLAY_NAME_MAX_LENGTH,
    LEGACY_MATERIAL_BLUEMAP_IDENTITY,
    WORLDLENS_IDENTITY,
    productNames,
    resolveDisplayName,
} from "./productIdentity.js";

describe("Worldlens product identity", () => {
    it("freezes every machine identity at the Worldlens values", () => {
        expect(WORLDLENS_IDENTITY).toEqual({
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
        });
        expect(Object.isFrozen(WORLDLENS_IDENTITY)).toBe(true);
    });

    it("keeps the complete legacy read-only identity in one compatibility record", () => {
        expect(LEGACY_MATERIAL_BLUEMAP_IDENTITY.dataDirectorySegments).toEqual([
            "@material-bluemap",
            "app",
        ]);
        expect(LEGACY_MATERIAL_BLUEMAP_IDENTITY.projectFileName).toBe(
            "material-bluemap.project.json",
        );
        expect(LEGACY_MATERIAL_BLUEMAP_IDENTITY.markerTool).toBe("material-bluemap");
        expect(Object.isFrozen(LEGACY_MATERIAL_BLUEMAP_IDENTITY)).toBe(true);
    });

    it("treats a user name as presentation and preserves the shipped diagnostic name", () => {
        const names = productNames("Steve's Map Thing");
        expect(names).toEqual({
            displayName: "Steve's Map Thing",
            diagnosticsProductName: "Worldlens",
        });
        expect(WORLDLENS_IDENTITY.dataDirectoryName).toBe("Worldlens");
        expect(WORLDLENS_IDENTITY.repository).toBe("Ding-Ding-Projects/worldlens");
        expect(WORLDLENS_IDENTITY.ciMarkerFile).toBe(".worldlens-ci.json");
        expect(WORLDLENS_IDENTITY.appPackageName).toBe("@worldlens/app");
    });

    it("normalizes display text without turning it into an identifier", () => {
        expect(resolveDisplayName("  My\nMap\tWorkbench  ")).toBe("My Map Workbench");
        expect(resolveDisplayName("\u0000\u0007")).toBe("Worldlens");
        expect(resolveDisplayName(null)).toBe("Worldlens");
        expect(resolveDisplayName("x".repeat(DISPLAY_NAME_MAX_LENGTH + 20))).toHaveLength(
            DISPLAY_NAME_MAX_LENGTH,
        );
    });
});

import { describe, expect, it } from "vitest";
import { migrationEnvironment } from "./captureTarget.js";

describe("Worldlens capture environment migration", () => {
    it("reads the current variable before the legacy alias", () => {
        expect(
            migrationEnvironment(
                { WORLDLENS_CAPTURE_MAP: " current ", MATERIAL_BLUEMAP_CAPTURE_MAP: "legacy" },
                "WORLDLENS_CAPTURE_MAP",
                "MATERIAL_BLUEMAP_CAPTURE_MAP",
            ),
        ).toBe("current");
    });

    it("keeps the former variable as a read-only fallback", () => {
        expect(
            migrationEnvironment(
                { MATERIAL_BLUEMAP_CAPTURE_MAP: " legacy " },
                "WORLDLENS_CAPTURE_MAP",
                "MATERIAL_BLUEMAP_CAPTURE_MAP",
            ),
        ).toBe("legacy");
    });

    it("does not invent a value when neither generation is set", () => {
        expect(
            migrationEnvironment({}, "WORLDLENS_CAPTURE_MAP", "MATERIAL_BLUEMAP_CAPTURE_MAP"),
        ).toBeNull();
    });
});

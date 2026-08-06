import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const panel = readFileSync(
    fileURLToPath(new URL("./DockerWorldSourcePanel.vue", import.meta.url)),
    "utf8",
);
const copy = readFileSync(
    fileURLToPath(new URL("../../../../app/src/main/dockerworld/copy.ts", import.meta.url)),
    "utf8",
);

describe("Docker world-source safety policy", () => {
    it("declares super confirmation not applicable only because every source operation is read-only and additive", () => {
        expect(copy).toContain("${volumeName}:/mb-source:ro");
        expect(copy).toContain("dockerCopyToStaging");
        expect(copy).not.toMatch(/\["cp",\s*stagingPath,\s*source\]/);
        expect(panel).toContain("The fetch is additive and read-only at the source");
        expect(panel).not.toContain("ConfigSuperConfirm");
    });

    it("keeps the live-copy gate fresh, exact and non-persistent", () => {
        expect(panel).toContain("torn .mca region file");
        expect(panel).toContain("Stop the server first");
        expect(panel).toContain("known-good backup");
        expect(panel).toContain("for this fetch only");
        expect(panel).toContain("acknowledgeLiveRisk.value = false");
        expect(panel).not.toMatch(
            /localStorage.*acknowledgeLiveRisk|acknowledgeLiveRisk.*localStorage/s,
        );
    });
});

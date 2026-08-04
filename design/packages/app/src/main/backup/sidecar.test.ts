/**
 * `backup.json`, and the reason it is read suspiciously.
 *
 * This text comes off a release. Anybody with write access to that repository could have
 * replaced it, and a listing that trusted it would render a stranger's strings as though
 * this application had written them. So every field is proved, and anything doubtful makes
 * the whole record null rather than a half-populated row.
 */

import { describe, expect, it } from "vitest";
import {
    BACKUP_SIDECAR_VERSION,
    MAX_SIDECAR_BYTES,
    SIDECAR_ASSET_NAME,
    parseSidecar,
    serializeSidecar,
} from "./sidecar.js";
import type { BackupSidecar } from "./sidecar.js";

const sidecar: BackupSidecar = {
    sidecarVersion: BACKUP_SIDECAR_VERSION,
    kind: "world",
    label: "Overworld",
    archive: "world-overworld-20260804T101500Z.zip",
    pointer: "world-overworld-20260804T101500Z.zip.cheaplfs",
    bytes: 1_100_000_000,
    sha256: "a".repeat(64),
    parts: 3,
    files: 4821,
    contentBytes: 1_098_000_000,
    createdAt: "2026-08-04T10:15:00.000Z",
    appVersion: "0.1.0",
    sourceFolder: "C:\\Users\\someone\\saves\\Overworld",
    skipped: [{ name: "region/link.mca", reason: "It is a link." }],
};

describe("the sidecar is a separate asset, never part of the pointer", () => {
    it("is named exactly backup.json, which is what marks a backup release", () => {
        expect(SIDECAR_ASSET_NAME).toBe("backup.json");
    });

    it("round-trips every field it carries", () => {
        expect(parseSidecar(serializeSidecar(sidecar))).toEqual(sidecar);
    });

    it("writes pretty JSON ending in a newline", () => {
        const text = serializeSidecar(sidecar);
        expect(text.endsWith("\n")).toBe(true);
        expect(text).toContain('\n    "kind": "world"');
    });
});

describe("reading one back", () => {
    it("refuses a version it does not understand rather than guessing", () => {
        const text = serializeSidecar(sidecar).replace('"sidecarVersion": 1', '"sidecarVersion": 99');
        expect(parseSidecar(text)).toBeNull();
    });

    it("refuses a kind that is not one of the two", () => {
        const text = serializeSidecar(sidecar).replace('"kind": "world"', '"kind": "everything"');
        expect(parseSidecar(text)).toBeNull();
    });

    it("refuses a digest that is not a lowercase hex SHA-256", () => {
        const text = serializeSidecar(sidecar).replace("a".repeat(64), "not-a-digest");
        expect(parseSidecar(text)).toBeNull();
    });

    it("refuses a negative or fractional byte count", () => {
        expect(parseSidecar(serializeSidecar(sidecar).replace("1100000000", "-5"))).toBeNull();
        expect(parseSidecar(serializeSidecar(sidecar).replace("1100000000", "1.5"))).toBeNull();
    });

    it("refuses text that is not JSON, and text that is an array", () => {
        expect(parseSidecar("not json at all")).toBeNull();
        expect(parseSidecar("[]")).toBeNull();
    });

    it("refuses anything past the bound without parsing it", () => {
        expect(parseSidecar("x".repeat(MAX_SIDECAR_BYTES + 1))).toBeNull();
    });

    it("drops a malformed skip list rather than refusing the whole record", () => {
        const text = serializeSidecar(sidecar).replace(
            '"skipped": [',
            '"skipped": [1, null, {"name": "x"}, ',
        );
        const read = parseSidecar(text);
        expect(read?.skipped).toEqual([{ name: "region/link.mca", reason: "It is a link." }]);
    });

    it("keeps a null appVersion rather than inventing one", () => {
        const read = parseSidecar(serializeSidecar({ ...sidecar, appVersion: null }));
        expect(read?.appVersion).toBeNull();
    });
});

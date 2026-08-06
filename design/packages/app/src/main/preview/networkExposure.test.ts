import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ALLOW_NETWORK, PREVIEW_NETWORK_FILE, PreviewNetworkStore } from "./networkExposure.js";

let dir = "";

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mbm-preview-net-"));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("reading with nothing stored yet", () => {
    it("defaults to loopback-only, and says it is the default", () => {
        const store = new PreviewNetworkStore({ dataDir: dir });
        const setting = store.read();
        expect(setting.allowNetwork).toBe(DEFAULT_ALLOW_NETWORK);
        expect(setting.allowNetwork).toBe(false);
        expect(setting.isDefault).toBe(true);
    });
});

describe("writing and reading a real choice back", () => {
    it("remembers an explicit opt-in across a fresh store instance", () => {
        new PreviewNetworkStore({ dataDir: dir }).write(true);
        const reread = new PreviewNetworkStore({ dataDir: dir }).read();
        expect(reread.allowNetwork).toBe(true);
        expect(reread.isDefault).toBe(false);
    });

    it("writing the default value back still reports it as the default", () => {
        const store = new PreviewNetworkStore({ dataDir: dir });
        store.write(true);
        const written = store.write(false);
        expect(written.allowNetwork).toBe(false);
        expect(written.isDefault).toBe(true);
    });
});

describe("degrading safely rather than trusting a bad file", () => {
    it("a corrupt file degrades to the safe default, not a crash", async () => {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, PREVIEW_NETWORK_FILE), "{ not json", "utf8");
        const setting = new PreviewNetworkStore({ dataDir: dir }).read();
        expect(setting.allowNetwork).toBe(false);
    });

    it("a value of the wrong type degrades to the safe default", async () => {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, PREVIEW_NETWORK_FILE), JSON.stringify({ allowNetwork: "yes" }), "utf8");
        const setting = new PreviewNetworkStore({ dataDir: dir }).read();
        expect(setting.allowNetwork).toBe(false);
    });

    it("a missing file is simply the default, not an error", () => {
        const setting = new PreviewNetworkStore({ dataDir: join(dir, "does-not-exist") }).read();
        expect(setting.allowNetwork).toBe(false);
        expect(setting.isDefault).toBe(true);
    });
});

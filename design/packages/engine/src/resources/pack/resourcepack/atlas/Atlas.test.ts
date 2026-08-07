import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Key } from "@worldlens/shared";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonParseError, parse } from "../../../adapter/JsonMapper.js";
import { ResourcePool } from "../../ResourcePool.js";
import { DirFileSystem } from "../../vfs/DirFileSystem.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import type { Texture } from "../texture/Texture.js";
import { Atlas } from "./Atlas.js";
import { SingleSource } from "./SingleSource.js";
import { Source } from "./Source.js";

const workDir = mkdtempSync(join(tmpdir(), "bluemap-atlas-"));

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

function emptyRoot(): PackPath {
    return new DirFileSystem(workDir).getRoot();
}

let debugSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
    debugSpy.mockRestore();
});

function debugMessages(): string[] {
    return debugSpy.mock.calls.map((call) => String(call[0]));
}

/** records the calls the atlas makes, and can fail on demand */
class RecordingSource extends Source {
    readonly calls: string[] = [];

    constructor(
        private readonly name: string,
        private readonly fail: boolean = false,
    ) {
        super();
    }

    override async load(
        _root: PackPath,
        _textures: ResourcePool<Texture>,
        _textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        this.calls.push("load");
        if (this.fail) throw new Error("load failed: " + this.name);
    }

    override async bake(
        _textures: ResourcePool<Texture>,
        _textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        this.calls.push("bake");
        if (this.fail) throw new Error("bake failed: " + this.name);
    }

    override equalityKey(): string {
        return this.identityKey();
    }
}

/**
 * An Atlas is only ever filled by its Adapter (upstream: by gson), so a hand-built source
 * goes into the private set directly.
 */
function atlasOf(...sources: Source[]): Atlas {
    const atlas = new Atlas();
    const set = (atlas as unknown as { sources: Map<string, Source> }).sources;
    for (const source of sources) set.set(source.equalityKey(), source);
    return atlas;
}

describe("Atlas.Adapter", () => {
    it("reads an empty atlas", () => {
        expect(Atlas.Adapter.read(parse("{}")).getSources()).toEqual([]);
        expect(Atlas.Adapter.read(parse('{"sources": []}')).getSources()).toEqual([]);
    });

    it("keeps the source order", () => {
        const atlas = Atlas.Adapter.read(
            parse(`{"sources": [
                {"type": "minecraft:single", "resource": "minecraft:block/a"},
                {"type": "minecraft:single", "resource": "minecraft:block/b"},
                {"type": "minecraft:single", "resource": "minecraft:block/c"}
            ]}`),
        );

        expect(
            atlas
                .getSources()
                .map((source) => (source as SingleSource).getResource()?.getFormatted()),
        ).toEqual(["minecraft:block/a", "minecraft:block/b", "minecraft:block/c"]);
    });

    it("de-duplicates bare sources of the same type", () => {
        const atlas = Atlas.Adapter.read(
            parse(`{"sources": [
                {"type": "minecraft:filter", "pattern": {"namespace": "a"}},
                {"type": "minecraft:filter", "pattern": {"namespace": "b"}},
                {"type": "mymod:unknown"}
            ]}`),
        );

        // both filters collapse into the first one, the unknown type stays separate
        expect(atlas.getSources().map((source) => source.getType()?.getFormatted())).toEqual([
            "minecraft:filter",
            "mymod:unknown",
        ]);
    });

    it("keeps structurally identical concrete sources apart (upstream equals is identity)", () => {
        const atlas = Atlas.Adapter.read(
            parse(`{"sources": [
                {"type": "minecraft:single", "resource": "minecraft:block/a"},
                {"type": "minecraft:single", "resource": "minecraft:block/a"}
            ]}`),
        );

        expect(atlas.getSources()).toHaveLength(2);
    });

    it("rejects a non-array sources member", () => {
        expect(() => Atlas.Adapter.read(parse('{"sources": {}}'))).toThrow(JsonParseError);
    });
});

describe("Atlas#add", () => {
    it("appends the other atlas' sources in order", () => {
        const a = Atlas.Adapter.read(
            parse('{"sources": [{"type": "minecraft:single", "resource": "minecraft:block/a"}]}'),
        );
        const b = Atlas.Adapter.read(
            parse(`{"sources": [
                {"type": "minecraft:single", "resource": "minecraft:block/b"},
                {"type": "minecraft:single", "resource": "minecraft:block/c"}
            ]}`),
        );

        expect(a.add(b)).toBe(a);
        expect(
            a.getSources().map((source) => (source as SingleSource).getResource()?.getFormatted()),
        ).toEqual(["minecraft:block/a", "minecraft:block/b", "minecraft:block/c"]);
    });

    it("keeps the already-present source instead of the merged-in equal one", () => {
        const a = Atlas.Adapter.read(parse('{"sources": [{"type": "minecraft:filter"}]}'));
        const b = Atlas.Adapter.read(parse('{"sources": [{"type": "minecraft:filter"}]}'));
        const kept = a.getSources()[0];

        a.add(b);

        expect(a.getSources()).toHaveLength(1);
        expect(a.getSources()[0]).toBe(kept);
    });
});

describe("Atlas#load / Atlas#bake", () => {
    it("calls every source in order", async () => {
        const first = new RecordingSource("first");
        const second = new RecordingSource("second");
        const atlas = atlasOf(first, second);
        const textures = new ResourcePool<Texture>();

        await atlas.load(emptyRoot(), textures, () => true);
        await atlas.bake(textures, () => true);

        expect(atlas.getSources()).toEqual([first, second]);
        expect(first.calls).toEqual(["load", "bake"]);
        expect(second.calls).toEqual(["load", "bake"]);
    });

    it("swallows a failing source into a debug-log and keeps going", async () => {
        const failing = new RecordingSource("boom", true);
        const following = new RecordingSource("following");
        const atlas = atlasOf(failing, following);
        const textures = new ResourcePool<Texture>();

        await atlas.load(emptyRoot(), textures, () => true);
        await atlas.bake(textures, () => true);

        expect(following.calls).toEqual(["load", "bake"]);
        expect(debugMessages()).toEqual([
            "Failed to load atlas-source: Error: load failed: boom",
            "Failed to bake atlas-source: Error: bake failed: boom",
        ]);
    });
});

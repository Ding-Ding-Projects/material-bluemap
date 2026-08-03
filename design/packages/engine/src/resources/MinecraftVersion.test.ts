import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildZip } from "./pack/vfs/zipTestUtil.js";
import type { FetchFunction, HttpResponse } from "./VersionManifest.js";

const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest.json";

const tempDirs: string[] = [];
afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "bluemap-mcversion-"));
    tempDirs.push(dir);
    return dir;
}

/**
 * A fresh copy of the module (and therefore of {@link VersionManifest}'s static
 * manifest-cache) per test, so no test can be affected by a manifest another one
 * fetched.
 */
async function freshMinecraftVersion() {
    vi.resetModules();
    return (await import("./MinecraftVersion.js")).MinecraftVersion;
}

// -- the stubbed mojang endpoints (no test ever touches the network) --

interface Endpoints {
    /** url → response payload; a missing url answers 404 */
    routes: Map<string, Buffer | string>;
    /** every url the code under test asked for, in order */
    requested: string[];
    fetch: FetchFunction;
}

function endpoints(routes: Map<string, Buffer | string>): Endpoints {
    const requested: string[] = [];
    const fetchFunction: FetchFunction = async (url: string): Promise<HttpResponse> => {
        requested.push(url);
        const payload = routes.get(url);
        if (payload === undefined)
            return { ok: false, status: 404, text: async () => "not found", body: null };

        const buffer = typeof payload === "string" ? Buffer.from(payload, "utf-8") : payload;
        return {
            ok: true,
            status: 200,
            text: async () => buffer.toString("utf-8"),
            // handed out in two chunks so the digest/write loop is actually exercised
            body: (async function* () {
                const half = Math.ceil(buffer.length / 2);
                yield buffer.subarray(0, half);
                yield buffer.subarray(half);
            })(),
        };
    };
    return { routes, requested, fetch: fetchFunction };
}

interface VersionFixture {
    id: string;
    releaseTime: string;
    /** the client-jar this version's detail-document points at (absent: no download) */
    jar?: Buffer;
    /** overrides the sha1 the detail-document declares (to force a mismatch) */
    sha1?: string;
}

function detailUrl(id: string): string {
    return "https://piston-meta.mojang.com/v1/packages/" + id + ".json";
}

function clientUrl(id: string): string {
    return "https://piston-data.mojang.com/v1/objects/client-" + id + ".jar";
}

function mojang(versions: VersionFixture[], latestRelease: string): Endpoints {
    const routes = new Map<string, Buffer | string>();

    routes.set(
        MANIFEST_URL,
        JSON.stringify({
            latest: { release: latestRelease, snapshot: latestRelease },
            versions: versions.map((version) => ({
                id: version.id,
                type: "release",
                url: detailUrl(version.id),
                time: version.releaseTime,
                releaseTime: version.releaseTime,
            })),
        }),
    );

    for (const version of versions) {
        const jar = version.jar;
        if (jar === undefined) continue;
        routes.set(
            detailUrl(version.id),
            JSON.stringify({
                id: version.id,
                type: "release",
                downloads: {
                    client: {
                        url: clientUrl(version.id),
                        size: jar.length,
                        sha1: version.sha1 ?? createHash("sha1").update(jar).digest("hex"),
                    },
                },
            }),
        );
        routes.set(clientUrl(version.id), jar);
    }

    return endpoints(routes);
}

/** a client-jar carrying the given version.json body (omit for a jar without one) */
function clientJar(versionJson?: object): Buffer {
    if (versionJson === undefined)
        return buildZip([{ name: "assets/", data: "" }, { name: "assets/pack.png", data: "png" }]);
    return buildZip([
        { name: "assets/pack.png", data: "png" },
        { name: "version.json", data: JSON.stringify(versionJson), deflate: true },
    ]);
}

// releaseTimes are what the version-comparison orders by
const V_1_12 = { id: "1.12", releaseTime: "2017-06-02T13:50:27+00:00" };
const V_1_13 = { id: "1.13", releaseTime: "2018-07-18T15:11:46+00:00" };
const V_1_16 = { id: "1.16", releaseTime: "2020-06-23T16:20:52+00:00" };
const V_1_19_4 = { id: "1.19.4", releaseTime: "2023-03-14T12:56:18+00:00" };
const V_1_21 = { id: "1.21", releaseTime: "2024-06-13T08:24:03+00:00" };

beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("MinecraftVersion download consent-gate (accept-download)", () => {
    it("does not fetch a client-jar when allowDownload is false", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        const mc = mojang(
            [
                { ...V_1_13, jar: clientJar() },
                { ...V_1_19_4, jar: clientJar() },
                { ...V_1_21, jar: clientJar() },
            ],
            "1.21",
        );

        await expect(
            MinecraftVersion.load("1.21", dataRoot, false, mc.fetch),
        ).rejects.toThrow(/Resource-File missing/);

        // the manifest itself is not gated upstream — the jar download is
        expect(mc.requested).toEqual([MANIFEST_URL]);
        expect(readdirSync(dataRoot)).toEqual([]);
    });

    it("fetches the client-jar once allowDownload is true", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        const jar = clientJar({ pack_version: { resource_major: 34, data_major: 57 } });
        const mc = mojang(
            [
                { ...V_1_13, jar: clientJar() },
                { ...V_1_19_4, jar: clientJar() },
                { ...V_1_21, jar },
            ],
            "1.21",
        );

        const version = await MinecraftVersion.load("1.21", dataRoot, true, mc.fetch);

        expect(mc.requested).toEqual([MANIFEST_URL, detailUrl("1.21"), clientUrl("1.21")]);
        expect(version.getId()).toBe("1.21");
    });
});

describe("MinecraftVersion.load download verification", () => {
    it("moves a sha1-verified download into place atomically", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        const jar = clientJar({
            pack_version: { resource_major: 34, resource_minor: 1, data_major: 57, data_minor: 2 },
        });
        const mc = mojang(
            [
                { ...V_1_13, jar: clientJar() },
                { ...V_1_19_4, jar: clientJar() },
                { ...V_1_21, jar },
            ],
            "1.21",
        );

        const version = await MinecraftVersion.load("1.21", dataRoot, true, mc.fetch);

        const target = join(dataRoot, "minecraft-client-1.21.jar");
        expect(version.getResourcePack()).toBe(target);
        expect(version.getDataPack()).toBe(target);
        expect(readFileSync(target).equals(jar)).toBe(true);
        // nothing but the finished jar is left behind — no ".unverified" remains
        expect(readdirSync(dataRoot)).toEqual(["minecraft-client-1.21.jar"]);

        expect(version.getResourcePackVersion().getMajor()).toBe(34);
        expect(version.getResourcePackVersion().getMinor()).toBe(1);
        expect(version.getDataPackVersion().getMajor()).toBe(57);
        expect(version.getDataPackVersion().getMinor()).toBe(2);
    });

    it("rejects a sha1-mismatching download and leaves no file behind", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        const mc = mojang(
            [
                { ...V_1_13, jar: clientJar() },
                { ...V_1_19_4, jar: clientJar() },
                { ...V_1_21, jar: clientJar(), sha1: "0".repeat(40) },
            ],
            "1.21",
        );

        // upstream only *logs* the failed download; the missing resource-file is what fails
        await expect(MinecraftVersion.load("1.21", dataRoot, true, mc.fetch)).rejects.toThrow(
            /Resource-File missing/,
        );

        expect(readdirSync(dataRoot)).toEqual([]);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining("SHA-1 of the downloaded file does not match!"),
        );
    });

    it("keeps a download whose sha1 differs only in hex-case", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        const jar = clientJar({ pack_version: 15 });
        const mc = mojang(
            [
                { ...V_1_13, jar: clientJar() },
                { ...V_1_19_4, jar: clientJar() },
                {
                    ...V_1_21,
                    jar,
                    sha1: createHash("sha1").update(jar).digest("hex").toUpperCase(),
                },
            ],
            "1.21",
        );

        const version = await MinecraftVersion.load("1.21", dataRoot, true, mc.fetch);
        expect(readdirSync(dataRoot)).toEqual(["minecraft-client-1.21.jar"]);
        // the legacy bare-int form: "pack_version": 15 means resource 15, data 4
        expect(version.getResourcePackVersion().getMajor()).toBe(15);
        expect(version.getDataPackVersion().getMajor()).toBe(4);
    });
});

describe("MinecraftVersion.load pack-version floors", () => {
    /** places a pre-downloaded client-jar in dataRoot, so nothing has to be downloaded */
    function placeJar(dataRoot: string, id: string, versionJson?: object): void {
        writeFileSync(join(dataRoot, "minecraft-client-" + id + ".jar"), clientJar(versionJson));
    }

    const ALL = [V_1_12, V_1_13, V_1_16, V_1_19_4, V_1_21];

    it("uses two different jars when the version is between the two floors", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        // 1.16 is newer than the resourcepack-floor (1.13) but older than the
        // datapack-floor (1.19.4), so the resources come from two different jars
        placeJar(dataRoot, "1.16", { pack_version: { resource_major: 6, resource_minor: 1 } });
        placeJar(dataRoot, "1.19.4", { pack_version: { data_major: 12, data_minor: 3 } });

        const mc = mojang(ALL, "1.21");
        const version = await MinecraftVersion.load("1.16", dataRoot, false, mc.fetch);

        expect(version.getId()).toBe("1.16");
        expect(version.getResourcePack()).toBe(join(dataRoot, "minecraft-client-1.16.jar"));
        expect(version.getDataPack()).toBe(join(dataRoot, "minecraft-client-1.19.4.jar"));
        expect(version.getResourcePackVersion().getMajor()).toBe(6);
        expect(version.getResourcePackVersion().getMinor()).toBe(1);
        expect(version.getDataPackVersion().getMajor()).toBe(12);
        expect(version.getDataPackVersion().getMinor()).toBe(3);
    });

    it("uses the floors themselves when the version is older than both", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        placeJar(dataRoot, "1.13");
        placeJar(dataRoot, "1.19.4");

        const mc = mojang(ALL, "1.21");
        const version = await MinecraftVersion.load("1.12", dataRoot, false, mc.fetch);

        expect(version.getId()).toBe("1.12");
        expect(version.getResourcePack()).toBe(join(dataRoot, "minecraft-client-1.13.jar"));
        expect(version.getDataPack()).toBe(join(dataRoot, "minecraft-client-1.19.4.jar"));
    });

    it("uses one jar for both packs when the version is newer than both floors", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        placeJar(dataRoot, "1.21", {
            pack_version: { resource_major: 34, resource_minor: 1, data_major: 57, data_minor: 2 },
        });

        const mc = mojang(ALL, "1.21");
        const version = await MinecraftVersion.load("1.21", dataRoot, false, mc.fetch);

        const target = join(dataRoot, "minecraft-client-1.21.jar");
        expect(version.getResourcePack()).toBe(target);
        expect(version.getDataPack()).toBe(target);
        expect(version.getResourcePackVersion().getMajor()).toBe(34);
        expect(version.getDataPackVersion().getMajor()).toBe(57);
    });

    it("defaults the id to the manifest's latest release", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        placeJar(dataRoot, "1.21");

        const mc = mojang(ALL, "1.21");
        const version = await MinecraftVersion.load(null, dataRoot, false, mc.fetch);

        expect(version.getId()).toBe("1.21");
        expect(version.getResourcePack()).toBe(join(dataRoot, "minecraft-client-1.21.jar"));
    });
});

describe("MinecraftVersion version.json parsing", () => {
    async function packVersionsOf(versionJson?: object) {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        writeFileSync(join(dataRoot, "minecraft-client-1.21.jar"), clientJar(versionJson));

        const mc = mojang([V_1_13, V_1_19_4, V_1_21], "1.21");
        const version = await MinecraftVersion.load("1.21", dataRoot, false, mc.fetch);
        return {
            resource: version.getResourcePackVersion(),
            data: version.getDataPackVersion(),
        };
    }

    it("assumes 1.13 - 1.14.4 defaults (4, 0) when there is no version.json", async () => {
        const { resource, data } = await packVersionsOf();
        expect([resource.getMajor(), resource.getMinor()]).toEqual([4, 0]);
        expect([data.getMajor(), data.getMinor()]).toEqual([4, 0]);
    });

    it("keeps the (4, 0) defaults for members version.json omits", async () => {
        const { resource, data } = await packVersionsOf({ pack_version: { resource_minor: 7 } });
        expect([resource.getMajor(), resource.getMinor()]).toEqual([4, 7]);
        expect([data.getMajor(), data.getMinor()]).toEqual([4, 0]);
    });

    it("reads the legacy 'resource'/'data' member-aliases", async () => {
        const { resource, data } = await packVersionsOf({ pack_version: { resource: 8, data: 9 } });
        expect([resource.getMajor(), resource.getMinor()]).toEqual([8, 0]);
        expect([data.getMajor(), data.getMinor()]).toEqual([9, 0]);
    });

    it("reads the bare-int form as the resource-version, with data defaulting to 4", async () => {
        const { resource, data } = await packVersionsOf({ pack_version: 6 });
        expect([resource.getMajor(), resource.getMinor()]).toEqual([6, 0]);
        expect([data.getMajor(), data.getMinor()]).toEqual([4, 0]);
    });

    it("reads the full major/minor form", async () => {
        const { resource, data } = await packVersionsOf({
            pack_version: {
                resource_major: 34,
                resource_minor: 1,
                data_major: 57,
                data_minor: 2,
            },
        });
        expect([resource.getMajor(), resource.getMinor()]).toEqual([34, 1]);
        expect([data.getMajor(), data.getMinor()]).toEqual([57, 2]);
    });

    it("deletes both jars when reading them fails and downloading is allowed", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        // not a zip at all — mounting it throws
        writeFileSync(join(dataRoot, "minecraft-client-1.16.jar"), "definitely not a jar");
        writeFileSync(join(dataRoot, "minecraft-client-1.19.4.jar"), "definitely not a jar");

        const mc = mojang([V_1_12, V_1_13, V_1_16, V_1_19_4, V_1_21], "1.21");
        await expect(MinecraftVersion.load("1.16", dataRoot, true, mc.fetch)).rejects.toThrow();

        expect(readdirSync(dataRoot)).toEqual([]);
    });

    it("keeps the jars when reading them fails and downloading is not allowed", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        writeFileSync(join(dataRoot, "minecraft-client-1.16.jar"), "definitely not a jar");
        writeFileSync(join(dataRoot, "minecraft-client-1.19.4.jar"), "definitely not a jar");

        const mc = mojang([V_1_12, V_1_13, V_1_16, V_1_19_4, V_1_21], "1.21");
        await expect(MinecraftVersion.load("1.16", dataRoot, false, mc.fetch)).rejects.toThrow();

        expect(readdirSync(dataRoot).sort()).toEqual([
            "minecraft-client-1.16.jar",
            "minecraft-client-1.19.4.jar",
        ]);
    });
});

describe("MinecraftVersion.load manifest failure", () => {
    it("degrades to the local jar of the requested id", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        writeFileSync(
            join(dataRoot, "minecraft-client-1.16.jar"),
            clientJar({ pack_version: { resource_major: 6, data_major: 9 } }),
        );

        // no routes at all: the manifest request answers 404
        const mc = endpoints(new Map());
        const version = await MinecraftVersion.load("1.16", dataRoot, false, mc.fetch);

        const target = join(dataRoot, "minecraft-client-1.16.jar");
        expect(version.getResourcePack()).toBe(target);
        expect(version.getDataPack()).toBe(target);
        expect(version.getResourcePackVersion().getMajor()).toBe(6);
        expect(version.getDataPackVersion().getMajor()).toBe(9);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining("Failed to fetch version-info from mojang-servers"),
        );
    });

    it("rethrows when no id was given", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const mc = endpoints(new Map());
        await expect(MinecraftVersion.load(null, tempDir(), false, mc.fetch)).rejects.toThrow(
            /Server returned HTTP response code: 404/,
        );
    });
});

describe("MinecraftVersion.hexStringToByteArray", () => {
    it("decodes a hex-string", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        expect(Array.from(MinecraftVersion.hexStringToByteArray("00ff10AB"))).toEqual([
            0x00, 0xff, 0x10, 0xab,
        ]);
    });

    it("rejects an odd-length hex-string", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        expect(() => MinecraftVersion.hexStringToByteArray("abc")).toThrow(/Invalid hex-string/);
    });
});

describe("MinecraftVersion identity", () => {
    it("compares by id only", async () => {
        const MinecraftVersion = await freshMinecraftVersion();
        const dataRoot = tempDir();
        writeFileSync(join(dataRoot, "minecraft-client-1.21.jar"), clientJar());

        const mc = mojang([V_1_13, V_1_19_4, V_1_21], "1.21");
        const a = await MinecraftVersion.load("1.21", dataRoot, false, mc.fetch);
        const b = await MinecraftVersion.load("1.21", dataRoot, false, mc.fetch);

        expect(a.equals(b)).toBe(true);
        expect(a.equals(a)).toBe(true);
        expect(a.equals("1.21")).toBe(false);
        expect(a.hashCode()).toBe(b.hashCode());
    });
});

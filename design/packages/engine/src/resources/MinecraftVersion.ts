/*
 * upstream: resources/MinecraftVersion.java
 *
 * java.nio {@code Path}s become OS path-strings, the jar is mounted through the
 * pack-vfs {@link ZipFileSystem} instead of {@code FileSystems.newFileSystem}, and the
 * network surface is the injectable {@link FetchFunction} {@link VersionManifest}
 * already uses (so nothing here ever touches the real network in a test).
 */

import { createHash } from "node:crypto";
import { open, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { logWarning } from "../world/mca/MCAUtil.js";
import { atomicMove, createDirectories } from "../util/FileHelper.js";
import { asObject, nextInt, parse, type JsonValue } from "./adapter/JsonMapper.js";
import { PackVersion } from "./pack/PackVersion.js";
import { ZipFileSystem } from "./pack/vfs/ZipFileSystem.js";
import {
    VersionManifest,
    type Download,
    type FetchFunction,
    type Version,
} from "./VersionManifest.js";

/** upstream: Logger.global.logInfo — the logger-package is not part of this port (yet) */
function logInfo(message: string): void {
    console.info(message);
}

const EARLIEST_RESOURCEPACK_VERSION = "1.13";
const EARLIEST_DATAPACK_VERSION = "1.19.4";

const DEFAULT_FETCH: FetchFunction = (url) => globalThis.fetch(url);

export class MinecraftVersion {
    private readonly id: string;

    private readonly resourcePack: string;
    private readonly resourcePackVersion: PackVersion;

    private readonly dataPack: string;
    private readonly dataPackVersion: PackVersion;

    private constructor(
        id: string,
        resourcePack: string,
        resourcePackVersion: PackVersion,
        dataPack: string,
        dataPackVersion: PackVersion,
    ) {
        this.id = id;
        this.resourcePack = resourcePack;
        this.resourcePackVersion = resourcePackVersion;
        this.dataPack = dataPack;
        this.dataPackVersion = dataPackVersion;
    }

    getId(): string {
        return this.id;
    }

    /** the client-jar the resource-pack resources are read from */
    getResourcePack(): string {
        return this.resourcePack;
    }

    getResourcePackVersion(): PackVersion {
        return this.resourcePackVersion;
    }

    /** the client-jar the data-pack resources are read from */
    getDataPack(): string {
        return this.dataPack;
    }

    getDataPackVersion(): PackVersion {
        return this.dataPackVersion;
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof MinecraftVersion)) return false;
        return this.id === o.id;
    }

    hashCode(): number {
        // Java String#hashCode of the id
        let h = 0;
        for (let i = 0; i < this.id.length; i++) h = (Math.imul(31, h) + this.id.charCodeAt(i)) | 0;
        return h;
    }

    toString(): string {
        return "MinecraftVersion(id=" + this.id + ")";
    }

    /**
     * Resolves the minecraft client-jar(s) the given version needs.
     *
     * <b>{@code allowDownload} is a legal consent gate, not a convenience flag.</b> It is
     * the {@code accept-download} core-config option (upstream
     * {@code common/.../config/CoreConfig.java}, default {@code false}), whose
     * configuration comment reads: "By changing the setting (accept-download) below to
     * TRUE you are indicating that you have accepted Mojang's EULA
     * (https://account.mojang.com/documents/minecraft_eula), you confirm that you own a
     * license to Minecraft (Java Edition), and you agree that BlueMap will download and
     * use a Minecraft client file […] from Mojang's servers". It therefore has no default
     * here and must never be defaulted to {@code true} anywhere, tests included. Only the
     * jar download is gated — fetching the (public) version-manifest is not gated
     * upstream either.
     */
    static async load(
        id: string | null,
        dataRoot: string,
        allowDownload: boolean,
        fetchFunction: FetchFunction = DEFAULT_FETCH,
    ): Promise<MinecraftVersion> {
        let resourcePack: string;
        let dataPack: string;

        try {
            const manifest = await VersionManifest.getOrFetch(fetchFunction);
            if (id == null) id = manifest.getLatest().getRelease();

            const version = manifest.getVersion(id);
            let resourcePackVersion = manifest.getVersion(EARLIEST_RESOURCEPACK_VERSION);
            let dataPackVersion = manifest.getVersion(EARLIEST_DATAPACK_VERSION);

            if (version.compareTo(resourcePackVersion) > 0) resourcePackVersion = version;
            if (version.compareTo(dataPackVersion) > 0) dataPackVersion = version;

            resourcePack = join(dataRoot, getClientVersionFileName(resourcePackVersion.getId()));
            dataPack = join(dataRoot, getClientVersionFileName(dataPackVersion.getId()));

            if (allowDownload) {
                if (!(await exists(resourcePack)))
                    await download(resourcePackVersion, resourcePack, fetchFunction);
                if (!(await exists(dataPack)))
                    await download(dataPackVersion, dataPack, fetchFunction);
            }
        } catch (ex) {
            if (id == null) throw ex;

            logWarning("Failed to fetch version-info from mojang-servers: " + String(ex));

            resourcePack = join(dataRoot, getClientVersionFileName(id));
            dataPack = resourcePack;
        }

        if (!(await exists(resourcePack))) throw new Error("Resource-File missing: " + resourcePack);
        if (!(await exists(dataPack))) throw new Error("Resource-File missing: " + dataPack);

        try {
            const resourcePackVersionInfo = await loadVersionInfo(resourcePack);
            const dataPackVersionInfo =
                resourcePack === dataPack
                    ? resourcePackVersionInfo
                    : await loadVersionInfo(dataPack);

            return new MinecraftVersion(
                id,
                resourcePack,
                resourcePackVersionInfo.getPackVersion().getResource(),
                dataPack,
                dataPackVersionInfo.getPackVersion().getData(),
            );
        } catch (ex) {
            // If something went wrong with reading the resource-files, delete them so they will be re-downloaded on the next try.
            if (allowDownload) {
                await deleteIfExists(resourcePack);
                await deleteIfExists(dataPack);
            }
            throw ex;
        }
    }

    static hexStringToByteArray(hexString: string): Uint8Array {
        const length = hexString.length;
        if (length % 2 !== 0) throw new Error("Invalid hex-string.");

        const halfLength = length / 2;

        const data = new Uint8Array(halfLength);
        let c: number;
        for (let i = 0; i < halfLength; i += 1) {
            c = i * 2;
            data[i] =
                ((characterDigit(hexString.charAt(c), 16) << 4) +
                    characterDigit(hexString.charAt(c + 1), 16)) &
                0xff;
        }

        return data;
    }
}

/** upstream: Character.digit(char, radix) — -1 when the character is not a digit */
function characterDigit(char: string, radix: number): number {
    const digit = Number.parseInt(char, radix);
    return Number.isNaN(digit) ? -1 : digit;
}

/**
 * Streams the client-jar of the given version through a SHA-1 digest into
 * {@code <file>.unverified}, and only moves it into place once the digest matches the
 * one the manifest declares.
 *
 * Note the upstream control-flow: a failed or mismatching download is only <i>logged</i>
 * here — it is the "Resource-File missing" check in {@link MinecraftVersion.load} that
 * turns it into a failure.
 */
async function download(version: Version, file: string, fetchFunction: FetchFunction): Promise<void> {
    const downloadInfo: Download = (await version.fetchDetail(fetchFunction))
        .getDownloads()
        .getClient();
    logInfo("Downloading '" + downloadInfo.getUrl() + "' to '" + file + "'...");

    await createDirectories(dirname(resolve(file)));
    const unverifiedFile = file + ".unverified";

    try {
        const digest = createHash("sha1");
        const input = await downloadInfo.createInputStream(fetchFunction);

        const out = await open(unverifiedFile, "w");
        try {
            // download
            for await (const chunk of input) {
                digest.update(chunk);
                await out.write(chunk);
            }
        } finally {
            await out.close();
        }

        // verify sha-1
        if (!digest.digest().equals(MinecraftVersion.hexStringToByteArray(downloadInfo.getSha1())))
            throw new Error("SHA-1 of the downloaded file does not match!");

        // rename once verified
        await atomicMove(unverifiedFile, file);
    } catch (ex) {
        logWarning("Failed to download '" + downloadInfo.getUrl() + "': " + String(ex));
    } finally {
        await deleteIfExists(unverifiedFile);
    }
}

function getClientVersionFileName(versionId: string): string {
    return "minecraft-client-" + versionId + ".jar";
}

/** upstream: Files#exists */
async function exists(file: string): Promise<boolean> {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}

/** upstream: Files#deleteIfExists */
async function deleteIfExists(file: string): Promise<void> {
    await rm(file, { force: true });
}

async function loadVersionInfo(file: string): Promise<VersionInfo> {
    const fileSystem = await ZipFileSystem.openFile(file);
    try {
        for (const fsRoot of fileSystem.getRootDirectories()) {
            if (!(await fsRoot.isDirectory())) continue;

            const versionFile = fsRoot.resolve("version.json");
            if (!(await versionFile.exists())) continue;

            return VersionInfo.fromJson(parse(await versionFile.readText()));
        }

        // no version.json found, assume 1.13 - 1.14.4
        return new VersionInfo();
    } finally {
        await fileSystem.close();
    }
}

class VersionInfo {
    private packVersion: PackVersions = new PackVersions();

    getPackVersion(): PackVersions {
        return this.packVersion;
    }

    static fromJson(json: JsonValue): VersionInfo {
        const versionInfo = new VersionInfo();
        const packVersion = asObject(json)["pack_version"];
        if (packVersion !== undefined) versionInfo.packVersion = PackVersions.Adapter.read(packVersion);
        return versionInfo;
    }
}

class PackVersions {
    // @SerializedName(value = "resource_major", alternate = "resource")
    private resourceMajor: number = 4;
    private resourceMinor: number = 0;
    // @SerializedName(value = "data_major", alternate = "data")
    private dataMajor: number = 4;
    private dataMinor: number = 0;

    constructor();
    constructor(resource: number, data: number);
    constructor(resource?: number, data?: number) {
        if (resource !== undefined) this.resourceMajor = resource;
        if (data !== undefined) this.dataMajor = data;
    }

    getResource(): PackVersion {
        return new PackVersion(this.resourceMajor, this.resourceMinor);
    }

    getData(): PackVersion {
        return new PackVersion(this.dataMajor, this.dataMinor);
    }

    /** upstream: PackVersions.Adapter */
    static readonly Adapter = {
        read(json: JsonValue): PackVersions {
            // a bare number is the legacy "pack_version": <resource> form
            if (typeof json === "number") return new PackVersions(nextInt(json), 4);

            const packVersions = new PackVersions();
            for (const [name, member] of Object.entries(asObject(json))) {
                switch (name) {
                    case "resource_major":
                    case "resource":
                        packVersions.resourceMajor = nextInt(member);
                        break;
                    case "resource_minor":
                        packVersions.resourceMinor = nextInt(member);
                        break;
                    case "data_major":
                    case "data":
                        packVersions.dataMajor = nextInt(member);
                        break;
                    case "data_minor":
                        packVersions.dataMinor = nextInt(member);
                        break;
                    default:
                        break;
                }
            }
            return packVersions;
        },
    };
}

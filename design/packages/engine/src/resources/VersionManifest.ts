import { LocalDateTimeAdapter } from "./adapter/LocalDateTimeAdapter.js";
import { asObject, nextDouble, nextString, parse, type JsonValue } from "./adapter/JsonMapper.js";

/**
 * The injectable network-surface (upstream: URLConnection via openInputStream) —
 * structurally compatible with the global {@code fetch}, narrow enough to mock in
 * tests.
 */
export interface HttpResponse {
    readonly ok: boolean;
    readonly status: number;
    text(): Promise<string>;
    readonly body: AsyncIterable<Uint8Array> | null;
}
export type FetchFunction = (url: string) => Promise<HttpResponse>;

/**
 * upstream: CONNECTION_TIMEOUT (connect/read-timeout of 10s on the URLConnection).
 * The fetch-API has no per-read timeout equivalent — an AbortSignal.timeout would
 * abort large (client.jar) downloads mid-body — so timeouts are left to the injected
 * fetch implementation; the constant is kept for implementations that want it.
 */
export const CONNECTION_TIMEOUT = 10000;

const GSON = new LocalDateTimeAdapter();

async function openInputStream(
    urlPath: string,
    fetchFunction: FetchFunction
): Promise<HttpResponse> {
    const response = await fetchFunction(urlPath);
    // upstream: HttpURLConnection#getInputStream throws on http error-status
    if (!response.ok)
        throw new Error("Server returned HTTP response code: " + response.status + " for URL: " + urlPath);
    return response;
}

export class Latest {
    private readonly release: string;
    private readonly snapshot: string;

    constructor(release: string, snapshot: string) {
        this.release = release;
        this.snapshot = snapshot;
    }

    getRelease(): string {
        return this.release;
    }

    getSnapshot(): string {
        return this.snapshot;
    }
}

export class Version {
    private readonly id: string;
    private readonly type: string;
    private readonly url: string;
    private readonly time: Date;
    private readonly releaseTime: Date;

    private detail: VersionDetail | null = null;
    private readonly fetchFunction: FetchFunction;

    constructor(
        id: string,
        type: string,
        url: string,
        time: Date,
        releaseTime: Date,
        fetchFunction: FetchFunction = (u) => globalThis.fetch(u)
    ) {
        this.id = id;
        this.type = type;
        this.url = url;
        this.time = time;
        this.releaseTime = releaseTime;
        this.fetchFunction = fetchFunction;
    }

    getId(): string {
        return this.id;
    }

    getType(): string {
        return this.type;
    }

    getUrl(): string {
        return this.url;
    }

    getTime(): Date {
        return this.time;
    }

    getReleaseTime(): Date {
        return this.releaseTime;
    }

    async fetchDetail(fetchFunction: FetchFunction = this.fetchFunction): Promise<VersionDetail> {
        if (this.detail == null) {
            const response = await openInputStream(this.url, fetchFunction);
            this.detail = VersionDetail.fromJson(parse(await response.text()), fetchFunction);
        }

        return this.detail;
    }

    compareTo(version: Version): number {
        const a = this.releaseTime.getTime();
        const b = version.releaseTime.getTime();
        return a < b ? -1 : a > b ? 1 : 0;
    }

    static fromJson(json: JsonValue, fetchFunction: FetchFunction): Version {
        const object = asObject(json);
        return new Version(
            nextString(object["id"] ?? null),
            nextString(object["type"] ?? null),
            nextString(object["url"] ?? null),
            GSON.read(object["time"] ?? null),
            GSON.read(object["releaseTime"] ?? null),
            fetchFunction
        );
    }
}

export class VersionDetail {
    private readonly id: string;
    private readonly type: string;
    private readonly downloads: Downloads;

    constructor(id: string, type: string, downloads: Downloads) {
        this.id = id;
        this.type = type;
        this.downloads = downloads;
    }

    getId(): string {
        return this.id;
    }

    getType(): string {
        return this.type;
    }

    getDownloads(): Downloads {
        return this.downloads;
    }

    static fromJson(json: JsonValue, fetchFunction: FetchFunction): VersionDetail {
        const object = asObject(json);
        return new VersionDetail(
            nextString(object["id"] ?? null),
            nextString(object["type"] ?? null),
            Downloads.fromJson(asObject(object["downloads"] ?? null), fetchFunction)
        );
    }
}

export class Downloads {
    private readonly client: Download;
    private readonly server: Download | null;

    constructor(client: Download, server: Download | null) {
        this.client = client;
        this.server = server;
    }

    getClient(): Download {
        return this.client;
    }

    getServer(): Download | null {
        return this.server;
    }

    static fromJson(json: JsonValue, fetchFunction: FetchFunction): Downloads {
        const object = asObject(json);
        return new Downloads(
            Download.fromJson(asObject(object["client"] ?? null), fetchFunction),
            object["server"] === undefined ? null : Download.fromJson(asObject(object["server"] ?? null), fetchFunction)
        );
    }
}

export class Download {
    private readonly url: string;
    private readonly size: number;
    private readonly sha1: string;
    private readonly fetchFunction: FetchFunction;

    constructor(
        url: string,
        size: number,
        sha1: string,
        fetchFunction: FetchFunction = (u) => globalThis.fetch(u)
    ) {
        this.url = url;
        this.size = size;
        this.sha1 = sha1;
        this.fetchFunction = fetchFunction;
    }

    getUrl(): string {
        return this.url;
    }

    getSize(): number {
        return this.size;
    }

    getSha1(): string {
        return this.sha1;
    }

    async createInputStream(
        fetchFunction: FetchFunction = this.fetchFunction
    ): Promise<AsyncIterable<Uint8Array>> {
        const response = await openInputStream(this.url, fetchFunction);
        if (response.body == null) throw new Error("Response has no body: " + this.url);
        return response.body;
    }

    static fromJson(json: JsonValue, fetchFunction: FetchFunction): Download {
        const object = asObject(json);
        return new Download(
            nextString(object["url"] ?? null),
            nextDouble(object["size"] ?? null),
            nextString(object["sha1"] ?? null),
            fetchFunction
        );
    }
}

export class VersionManifest {
    static readonly DOMAIN: string = "https://piston-meta.mojang.com/";
    static readonly MANIFEST_URL: string = VersionManifest.DOMAIN + "mc/game/version_manifest.json";

    private static instance: VersionManifest | null = null;

    private readonly latest: Latest;
    private readonly versions: Version[];

    private versionMap: Map<string, Version> | null = null;
    private readonly sorted: boolean = false;

    constructor(latest: Latest, versions: Version[]) {
        this.latest = latest;
        this.versions = versions;
    }

    static async getOrFetch(
        fetchFunction: FetchFunction = (u) => globalThis.fetch(u)
    ): Promise<VersionManifest> {
        if (VersionManifest.instance == null) return VersionManifest.fetch(fetchFunction);
        return VersionManifest.instance;
    }

    static async fetch(
        fetchFunction: FetchFunction = (u) => globalThis.fetch(u)
    ): Promise<VersionManifest> {
        const response = await openInputStream(VersionManifest.MANIFEST_URL, fetchFunction);
        VersionManifest.instance = VersionManifest.fromJson(
            parse(await response.text()),
            fetchFunction
        );
        return VersionManifest.instance;
    }

    getLatest(): Latest {
        return this.latest;
    }

    /**
     * An array of versions, ordered newest first
     */
    getVersions(): Version[] {
        // note: upstream never assigns `sorted`, re-sorting the (then already
        // sorted) array on every call — kept bug-for-bug
        if (!this.sorted) this.versions.sort((a, b) => b.compareTo(a)); // Comparator.reverseOrder()
        return this.versions;
    }

    getVersion(id: string): Version {
        if (this.versionMap == null) {
            this.versionMap = new Map();
            for (const version of this.versions) this.versionMap.set(version.getId(), version);
        }

        const version = this.versionMap.get(id);
        if (version === undefined) throw new Error(`There is no version '${id}' in manifest.`);
        return version;
    }

    static fromJson(json: JsonValue, fetchFunction: FetchFunction): VersionManifest {
        const object = asObject(json);
        const latestObject = asObject(object["latest"] ?? null);
        const latest = new Latest(
            nextString(latestObject["release"] ?? null),
            nextString(latestObject["snapshot"] ?? null)
        );
        const versionsJson = object["versions"];
        if (!Array.isArray(versionsJson)) throw new Error("Expected 'versions' array in manifest");
        return new VersionManifest(
            latest,
            versionsJson.map((versionJson) => Version.fromJson(versionJson, fetchFunction))
        );
    }
}

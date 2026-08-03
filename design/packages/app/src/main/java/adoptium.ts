/**
 * Asking Adoptium which Temurin build to fetch for this machine.
 *
 * Only the *metadata* is resolved here; nothing is downloaded. The point of the
 * separation is that the digest arrives with the download link, from the same
 * response, before any bytes are requested. Fetching first and looking for a
 * checksum afterwards is how "verified" quietly becomes "verified if one happened to
 * be published", and the rule for this layer is that an artefact with no usable
 * digest is not downloaded at all.
 */

/** Adoptium's public API. Documented at https://api.adoptium.net/q/swagger-ui/ */
export const ADOPTIUM_API_BASE = "https://api.adoptium.net/v3";

/**
 * The injectable network surface, mirroring `packages/engine`'s `FetchFunction`:
 * structurally satisfied by the global `fetch`, narrow enough to fake in a test.
 */
export interface HttpTextResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText?: string;
    text(): Promise<string>;
}
export type FetchText = (url: string) => Promise<HttpTextResponse>;

export interface TemurinTarget {
    /** Adoptium's OS name. */
    readonly os: string;
    /** Adoptium's architecture name. */
    readonly architecture: string;
}

/**
 * Node's platform and architecture names are not Adoptium's, and the differences are
 * not guessable: `darwin` is `mac`, `arm64` is `aarch64`, `ia32` is `x86`, and
 * `ppc64` on Linux means the little-endian `ppc64le` builds. Asking the API with
 * Node's own spelling returns an empty array, which looks exactly like "no build
 * exists for your machine" and is in fact "you asked the wrong question".
 */
const OS_NAMES: Partial<Record<NodeJS.Platform, string>> = {
    win32: "windows",
    darwin: "mac",
    linux: "linux",
    aix: "aix",
    sunos: "solaris",
};

const ARCHITECTURE_NAMES: Record<string, string> = {
    x64: "x64",
    arm64: "aarch64",
    ia32: "x86",
    arm: "arm",
    ppc64: "ppc64le",
    s390x: "s390x",
    riscv64: "riscv64",
};

/**
 * Maps this machine onto Adoptium's names.
 *
 * Throws rather than falling back to x64, because the fallback would download a
 * couple of hundred megabytes of binaries that cannot execute here and then fail
 * with a confusing exec-format error at launch instead of a clear one now.
 */
export function temurinTarget(
    platform: NodeJS.Platform = process.platform,
    architecture: string = process.arch,
): TemurinTarget {
    const os = OS_NAMES[platform];
    if (os === undefined) {
        throw new Error(
            `No Eclipse Temurin builds are published for platform '${platform}'. ` +
                "Install a Java 25 JDK and point JAVA_HOME at it.",
        );
    }
    const arch = ARCHITECTURE_NAMES[architecture];
    if (arch === undefined) {
        throw new Error(
            `No Eclipse Temurin builds are published for architecture '${architecture}'. ` +
                "Install a Java 25 JDK and point JAVA_HOME at it.",
        );
    }
    return { os, architecture: arch };
}

export interface TemurinRelease {
    readonly feature: number;
    /** Adoptium's release name, e.g. `jdk-25.0.4+7`. */
    readonly releaseName: string;
    /** The OpenJDK version, e.g. `25.0.4+7-LTS`. */
    readonly version: string;
    readonly os: string;
    readonly architecture: string;
    readonly fileName: string;
    readonly url: string;
    /** Lower-case hex SHA-256 of the archive, published alongside the link. */
    readonly sha256: string;
    /** Bytes, as the API reports them. Used for progress, never as a substitute for the digest. */
    readonly size: number;
}

/** The API returns the digest as hex; anything else is not something to trust. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

export function assetsLatestUrl(feature: number, target: TemurinTarget, base = ADOPTIUM_API_BASE): string {
    const query = new URLSearchParams({
        architecture: target.architecture,
        image_type: "jdk",
        os: target.os,
        vendor: "eclipse",
    });
    return `${base}/assets/latest/${String(feature)}/hotspot?${query.toString()}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

export interface ResolveTemurinOptions {
    readonly feature?: number;
    readonly platform?: NodeJS.Platform;
    readonly architecture?: string;
    readonly fetchText?: FetchText;
    readonly apiBase?: string;
}

/**
 * Resolves the newest general-availability Temurin JDK for this machine.
 *
 * Every failure names the exact URL that was asked and what came back, because the
 * realistic causes - a corporate proxy returning HTML, an offline machine, an
 * architecture with no published build - are indistinguishable from each other in a
 * message that only says the download failed.
 */
export async function resolveTemurinRelease(
    options: ResolveTemurinOptions = {},
): Promise<TemurinRelease> {
    const feature = options.feature ?? 25;
    const target = temurinTarget(options.platform, options.architecture);
    const fetchText = options.fetchText ?? ((url: string) => globalThis.fetch(url));
    const url = assetsLatestUrl(feature, target, options.apiBase ?? ADOPTIUM_API_BASE);

    const response = await fetchText(url);
    if (!response.ok) {
        throw new Error(
            `Adoptium returned HTTP ${String(response.status)}${
                response.statusText === undefined ? "" : ` ${response.statusText}`
            } for ${url}`,
        );
    }

    const body = await response.text();
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error(`Adoptium returned a body that is not JSON for ${url}`);
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error(
            `Adoptium published no Java ${String(feature)} JDK for ${target.os}/${target.architecture} (${url})`,
        );
    }

    const asset = asRecord(parsed[0]);
    const binary = asset === null ? null : asRecord(asset["binary"]);
    const pkg = binary === null ? null : asRecord(binary["package"]);
    if (asset === null || binary === null || pkg === null) {
        throw new Error(`Adoptium returned an unexpected asset shape for ${url}`);
    }

    const link = pkg["link"];
    const name = pkg["name"];
    const checksum = pkg["checksum"];
    const size = pkg["size"];
    if (typeof link !== "string" || typeof name !== "string") {
        throw new Error(`Adoptium asset has no download link for ${url}`);
    }
    if (typeof checksum !== "string" || !SHA256_HEX.test(checksum.toLowerCase())) {
        // The one thing this layer will not do. Downloading an unverifiable archive
        // and extracting it into the app's data directory is exactly the outcome the
        // checksum exists to prevent, so a missing digest ends the operation.
        throw new Error(
            `Adoptium published no SHA-256 for ${link}; refusing to download an unverifiable JDK`,
        );
    }

    const versionRecord = asRecord(asset["version"]);
    const openjdkVersion = versionRecord?.["openjdk_version"];
    const releaseName = asset["release_name"];

    return {
        feature,
        releaseName: typeof releaseName === "string" ? releaseName : `jdk-${String(feature)}`,
        version: typeof openjdkVersion === "string" ? openjdkVersion : String(feature),
        os: target.os,
        architecture: target.architecture,
        fileName: name,
        url: link,
        sha256: checksum.toLowerCase(),
        size: typeof size === "number" && Number.isFinite(size) ? size : 0,
    };
}

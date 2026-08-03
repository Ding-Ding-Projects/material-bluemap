import { describe, expect, it } from "vitest";
import type { FetchText, HttpTextResponse } from "./adoptium.js";
import { assetsLatestUrl, resolveTemurinRelease, temurinTarget } from "./adoptium.js";

/**
 * A trimmed copy of a real `GET /v3/assets/latest/25/hotspot` response. The shape is
 * what matters, so it is kept as the API actually returns it rather than reduced to
 * the two fields the parser happens to read today.
 */
const REAL_RESPONSE = [
    {
        release_name: "jdk-25.0.4+7",
        version: { major: 25, minor: 0, security: 4, build: 7, openjdk_version: "25.0.4+7-LTS" },
        binary: {
            os: "windows",
            architecture: "x64",
            image_type: "jdk",
            package: {
                checksum: "7caab7db43bf4b94a2e6252c699e70d90084f9aa7c943cd3414761fd540937ae",
                link: "https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.4%2B7/OpenJDK25U-jdk_x64_windows_hotspot_25.0.4_7.zip",
                name: "OpenJDK25U-jdk_x64_windows_hotspot_25.0.4_7.zip",
                size: 141164204,
            },
        },
    },
];

function respondWith(body: unknown, status = 200): { fetchText: FetchText; urls: string[] } {
    const urls: string[] = [];
    const fetchText: FetchText = (url) => {
        urls.push(url);
        const response: HttpTextResponse = {
            ok: status >= 200 && status < 300,
            status,
            statusText: status === 200 ? "OK" : "Service Unavailable",
            text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
        };
        return Promise.resolve(response);
    };
    return { fetchText, urls };
}

describe("temurinTarget", () => {
    it("translates Node's names into Adoptium's", () => {
        expect(temurinTarget("win32", "x64")).toEqual({ os: "windows", architecture: "x64" });
        expect(temurinTarget("darwin", "arm64")).toEqual({ os: "mac", architecture: "aarch64" });
        expect(temurinTarget("linux", "x64")).toEqual({ os: "linux", architecture: "x64" });
        // ia32 is x86, and ppc64 on Linux means the little-endian builds.
        expect(temurinTarget("linux", "ia32").architecture).toBe("x86");
        expect(temurinTarget("linux", "ppc64").architecture).toBe("ppc64le");
    });

    it("refuses rather than falling back to x64 on an unsupported machine", () => {
        // Downloading x64 binaries for a machine that cannot run them turns a clear
        // failure now into an exec-format error later.
        expect(() => temurinTarget("linux", "mips")).toThrow(/architecture 'mips'/);
        expect(() => temurinTarget("android", "x64")).toThrow(/platform 'android'/);
    });
});

describe("assetsLatestUrl", () => {
    it("asks for a GA JDK from Eclipse for the given target", () => {
        const url = assetsLatestUrl(25, { os: "linux", architecture: "aarch64" });
        expect(url).toContain("/assets/latest/25/hotspot");
        expect(url).toContain("architecture=aarch64");
        expect(url).toContain("os=linux");
        expect(url).toContain("image_type=jdk");
        expect(url).toContain("vendor=eclipse");
    });
});

describe("resolveTemurinRelease", () => {
    it("reads the link, digest, size and version out of a real response", async () => {
        const { fetchText, urls } = respondWith(REAL_RESPONSE);
        const release = await resolveTemurinRelease({
            feature: 25,
            platform: "win32",
            architecture: "x64",
            fetchText,
        });

        expect(release.releaseName).toBe("jdk-25.0.4+7");
        expect(release.version).toBe("25.0.4+7-LTS");
        expect(release.fileName).toBe("OpenJDK25U-jdk_x64_windows_hotspot_25.0.4_7.zip");
        expect(release.sha256).toBe("7caab7db43bf4b94a2e6252c699e70d90084f9aa7c943cd3414761fd540937ae");
        expect(release.size).toBe(141164204);
        expect(release.os).toBe("windows");
        expect(urls[0]).toContain("os=windows");
    });

    it("names the URL and the status when the API refuses", async () => {
        const { fetchText } = respondWith("", 503);
        await expect(
            resolveTemurinRelease({ platform: "linux", architecture: "x64", fetchText }),
        ).rejects.toThrow(/HTTP 503.*api\.adoptium\.net/s);
    });

    it("names the URL when a proxy returns something that is not JSON", async () => {
        const { fetchText } = respondWith("<html>Corporate proxy sign-in</html>");
        await expect(
            resolveTemurinRelease({ platform: "linux", architecture: "x64", fetchText }),
        ).rejects.toThrow(/not JSON/);
    });

    it("reports an empty result as 'no build published', naming the target", async () => {
        const { fetchText } = respondWith([]);
        await expect(
            resolveTemurinRelease({ feature: 25, platform: "linux", architecture: "riscv64", fetchText }),
        ).rejects.toThrow(/published no Java 25 JDK for linux\/riscv64/);
    });

    it("refuses to hand back an asset with no checksum", async () => {
        // The whole point of the layer: an artefact that cannot be verified is not an
        // artefact this app downloads.
        const withoutChecksum = structuredClone(REAL_RESPONSE);
        delete (withoutChecksum[0]!.binary.package as Partial<{ checksum: string }>).checksum;
        const { fetchText } = respondWith(withoutChecksum);
        await expect(
            resolveTemurinRelease({ platform: "win32", architecture: "x64", fetchText }),
        ).rejects.toThrow(/refusing to download an unverifiable JDK/);
    });

    it("refuses a checksum that is not a SHA-256", async () => {
        const shortChecksum = structuredClone(REAL_RESPONSE);
        shortChecksum[0]!.binary.package.checksum = "deadbeef";
        const { fetchText } = respondWith(shortChecksum);
        await expect(
            resolveTemurinRelease({ platform: "win32", architecture: "x64", fetchText }),
        ).rejects.toThrow(/refusing to download an unverifiable JDK/);
    });

    it("refuses an asset with no download link", async () => {
        const withoutLink = structuredClone(REAL_RESPONSE);
        delete (withoutLink[0]!.binary.package as Partial<{ link: string }>).link;
        const { fetchText } = respondWith(withoutLink);
        await expect(
            resolveTemurinRelease({ platform: "win32", architecture: "x64", fetchText }),
        ).rejects.toThrow(/no download link/);
    });
});

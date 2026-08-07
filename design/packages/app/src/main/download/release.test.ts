import { describe, expect, it } from "vitest";
import {
    ReleaseRequestError,
    apiHeaders,
    availableDownloads,
    fetchRelease,
    findDownload,
} from "./release.js";
import type { FetchLike, ReleaseInfo } from "./release.js";

function asset(name: string, size: number): Record<string, unknown> {
    return {
        name,
        size,
        browser_download_url: `https://github.com/o/r/releases/download/v1/${name}`,
        url: `https://api.github.com/repos/o/r/releases/assets/${name}`,
    };
}

function releaseBody(names: [string, number][]): Record<string, unknown> {
    return {
        tag_name: "v0.1.0-build.7",
        name: "worldlens v0.1.0-build.7",
        html_url: "https://github.com/o/r/releases/tag/v0.1.0-build.7",
        assets: names.map(([name, size]) => asset(name, size)),
    };
}

function stubFetch(body: unknown, status = 200): { fetch: FetchLike; urls: string[] } {
    const urls: string[] = [];
    const fetch: FetchLike = (url) => {
        urls.push(url);
        return Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
            }),
        );
    };
    return { fetch, urls };
}

function info(names: [string, number][]): ReleaseInfo {
    return {
        owner: "o",
        repo: "r",
        tag: "v1",
        name: "v1",
        htmlUrl: "",
        assets: names.map(([name, size]) => ({
            name,
            size,
            downloadUrl: `https://github.com/o/r/releases/download/v1/${name}`,
            apiUrl: `https://api.github.com/repos/o/r/releases/assets/${name}`,
        })),
    };
}

describe("fetchRelease", () => {
    it("asks for the latest release when no tag is given", async () => {
        const { fetch, urls } = stubFetch(releaseBody([["installer.exe", 120]]));

        const release = await fetchRelease("o", "r", undefined, { fetch });

        expect(urls).toEqual(["https://api.github.com/repos/o/r/releases/latest"]);
        expect(release.tag).toBe("v0.1.0-build.7");
        expect(release.assets).toHaveLength(1);
    });

    it("asks for a named tag, encoded", async () => {
        const { fetch, urls } = stubFetch(releaseBody([]));

        await fetchRelease("o", "r", "v1.0+build 2", { fetch });

        expect(urls[0]).toBe("https://api.github.com/repos/o/r/releases/tags/v1.0%2Bbuild%202");
    });

    it("reports the status rather than a guess when the release is not there", async () => {
        const { fetch } = stubFetch({ message: "Not Found" }, 404);

        const error = await fetchRelease("o", "r", "v9", { fetch }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ReleaseRequestError);
        expect((error as ReleaseRequestError).status).toBe(404);
    });

    it("skips assets that are missing the fields a download needs", async () => {
        const { fetch } = stubFetch({
            tag_name: "v1",
            assets: [asset("good.zip", 10), { name: "bad.zip" }, null, "nonsense"],
        });

        const release = await fetchRelease("o", "r", "v1", { fetch });

        expect(release.assets.map((entry) => entry.name)).toEqual(["good.zip"]);
    });

    it("sends no authorization header without a token, and one with", () => {
        expect(apiHeaders(null)["authorization"]).toBeUndefined();
        expect(apiHeaders("")["authorization"]).toBeUndefined();
        expect(apiHeaders("abc")["authorization"]).toBe("Bearer abc");
    });
});

describe("availableDownloads", () => {
    it("presents a split asset as the one file it really is", () => {
        const downloads = availableDownloads(
            info([
                ["world.zip.parts.json", 400],
                ["world.zip.001", 1_700],
                ["world.zip.002", 1_700],
                ["world.zip.003", 500],
                ["installer.exe", 120],
            ]),
        );

        expect(downloads).toHaveLength(2);
        const split = downloads[0];
        expect(split?.kind).toBe("split");
        expect(split?.name).toBe("world.zip");
        expect(split?.bytes).toBe(3_900);
        if (split?.kind === "split") {
            expect(split.parts.map((part) => part.name)).toEqual([
                "world.zip.001",
                "world.zip.002",
                "world.zip.003",
            ]);
        }
        expect(downloads[1]?.name).toBe("installer.exe");
    });

    it("orders parts numerically rather than as text", () => {
        const names: [string, number][] = [["world.zip.parts.json", 1]];
        for (let i = 1; i <= 12; i++) {
            names.push([`world.zip.${String(i).padStart(3, "0")}`, 10]);
        }
        const downloads = availableDownloads(info(names));
        const split = downloads[0];

        expect(split?.kind).toBe("split");
        if (split?.kind === "split") {
            expect(split.parts[9]?.name).toBe("world.zip.010");
            expect(split.parts[11]?.name).toBe("world.zip.012");
        }
    });

    it("still offers the parts on their own names when the manifest is missing", () => {
        const downloads = availableDownloads(
            info([
                ["world.zip.001", 10],
                ["world.zip.002", 10],
            ]),
        );

        // A release that lost its manifest should show two files somebody can still
        // fetch by hand, not nothing at all.
        expect(downloads.map((entry) => entry.name)).toEqual(["world.zip.001", "world.zip.002"]);
        expect(downloads.every((entry) => entry.kind === "whole")).toBe(true);
    });

    it("ignores a manifest whose parts were never uploaded", () => {
        const downloads = availableDownloads(info([["world.zip.parts.json", 400]]));

        expect(downloads).toHaveLength(1);
        expect(downloads[0]?.kind).toBe("whole");
    });

    it("finds a download by the name it presents", () => {
        const downloads = availableDownloads(
            info([
                ["world.zip.parts.json", 1],
                ["world.zip.001", 10],
            ]),
        );

        expect(findDownload(downloads, "world.zip")?.kind).toBe("split");
        expect(findDownload(downloads, "world.zip.001")).toBeNull();
        expect(findDownload(downloads, "nothing")).toBeNull();
    });
});

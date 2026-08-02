import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache } from "three";
import { RevalidatingFileLoader } from "./RevalidatingFileLoader";

interface FakeResponseInit {
    status?: number;
    statusText?: string;
    text?: string;
}

/**
 * Minimal Response-like object without a body stream, so the loader takes the
 * "response.body === undefined" workaround path (no ProgressEvent in node).
 */
function fakeResponse(url: string, init: FakeResponseInit = {}) {
    return {
        status: init.status ?? 200,
        statusText: init.statusText ?? "OK",
        url,
        headers: new Headers(),
        body: undefined,
        text: () => Promise.resolve(init.text ?? "content"),
    };
}

function loadAsync(loader: RevalidatingFileLoader, url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
    });
}

const URL_A = "https://bluemap.invalid/maps/world/tiles/x0z0.json";
const URL_B = "https://bluemap.invalid/maps/world/tiles/x1z0.json";

describe("RevalidatingFileLoader", () => {
    let requests: Request[];

    beforeEach(() => {
        requests = [];
        vi.stubGlobal("fetch", (req: Request) => {
            requests.push(req);
            return Promise.resolve(fakeResponse(req.url) as unknown as Response);
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        Cache.enabled = false;
        Cache.clear();
    });

    it("loads text responses", async () => {
        const loader = new RevalidatingFileLoader();

        const data = await loadAsync(loader, URL_A);

        expect(data).toBe("content");
        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe(URL_A);
    });

    it("does not force revalidation without a revalidated-urls set", async () => {
        const loader = new RevalidatingFileLoader();

        await loadAsync(loader, URL_A);

        expect(requests[0]!.cache).not.toBe("no-cache");
    });

    it("requests no-cache for urls not yet revalidated", async () => {
        const loader = new RevalidatingFileLoader();
        loader.setRevalidatedUrls(new Set());

        await loadAsync(loader, URL_A);

        expect(requests[0]!.cache).toBe("no-cache");
    });

    it("does not force revalidation for already revalidated urls", async () => {
        const loader = new RevalidatingFileLoader();
        loader.setRevalidatedUrls(new Set([URL_A]));

        await loadAsync(loader, URL_A);

        expect(requests[0]!.cache).not.toBe("no-cache");
    });

    it("deduplicates concurrent requests for the same url", async () => {
        const loader = new RevalidatingFileLoader();

        const [first, second] = await Promise.all([
            loadAsync(loader, URL_A),
            loadAsync(loader, URL_A),
        ]);

        expect(first).toBe("content");
        expect(second).toBe("content");
        expect(requests).toHaveLength(1);
    });

    it("keeps requests for different urls separate", async () => {
        const loader = new RevalidatingFileLoader();

        await Promise.all([loadAsync(loader, URL_A), loadAsync(loader, URL_B)]);

        expect(requests).toHaveLength(2);
    });

    it("rejects with an error carrying the response on http failure", async () => {
        vi.stubGlobal("fetch", (req: Request) => {
            requests.push(req);
            return Promise.resolve(
                fakeResponse(req.url, {
                    status: 404,
                    statusText: "Not Found",
                }) as unknown as Response,
            );
        });
        const loader = new RevalidatingFileLoader();

        const error = (await loadAsync(loader, URL_A).catch((e: unknown) => e)) as Error & {
            response: { status: number };
        };

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain("404");
        expect(error.response.status).toBe(404);
    });

    it("parses json responses when responseType is json", async () => {
        vi.stubGlobal("fetch", (req: Request) => {
            requests.push(req);
            const response = fakeResponse(req.url) as unknown as Response & {
                json: () => Promise<unknown>;
            };
            response.json = () => Promise.resolve({ tile: true });
            return Promise.resolve(response);
        });
        const loader = new RevalidatingFileLoader();
        loader.setResponseType("json");

        const data = await loadAsync(loader, URL_A);

        expect(data).toEqual({ tile: true });
    });

    it("serves subsequent loads from the three.js cache when enabled", async () => {
        Cache.enabled = true;
        const loader = new RevalidatingFileLoader();

        await loadAsync(loader, URL_A);
        const cached = await loadAsync(loader, URL_A);

        expect(cached).toBe("content");
        expect(requests).toHaveLength(1);
        expect(Cache.get(`file:${URL_A}`)).toBe("content");
    });

    it("bypasses the cache for urls that still need revalidation", async () => {
        Cache.enabled = true;
        const loader = new RevalidatingFileLoader();
        const revalidatedUrls = new Set<string>();
        loader.setRevalidatedUrls(revalidatedUrls);

        await loadAsync(loader, URL_A);
        await loadAsync(loader, URL_A); // still not in the set -> fetches again

        expect(requests).toHaveLength(2);

        revalidatedUrls.add(URL_A);
        await loadAsync(loader, URL_A); // now served from cache

        expect(requests).toHaveLength(2);
    });
});

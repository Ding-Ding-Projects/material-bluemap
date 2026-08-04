/**
 * Tests for fetching, extracting and caching Mojang's EULA.
 *
 * The interesting property here is not "does it download a file". It is that the app can
 * never describe one thing as another: a cached copy is never reported as live, a page
 * that is not the licence is never reported as the licence, and a failure is never
 * reported as anything but a failure. Each of those is a sentence somebody reads before
 * agreeing to a legal document, so each gets a test that would fail if the sentence
 * became wrong.
 *
 * Nothing here touches the network. `fetch` is a parameter for exactly that reason, and
 * `electron` is never imported: `document.ts`, `cache.ts` and `text.ts` are deliberately
 * free of it so this file runs in a plain Node environment.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { eulaCacheFile, readCachedEula, writeCachedEula } from "./cache.js";
import { CACHE_MAX_AGE_MS, loadEulaDocument, type FetchLike } from "./document.js";
import { decodeEntities, extractDocumentText, looksLikeTheEula, normaliseWhitespace } from "./text.js";

const URL_UNDER_TEST = "https://account.mojang.com/documents/minecraft_eula";

let directory = "";

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "mb-eula-"));
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

/** A body long enough and worded enough to pass the plausibility rules. */
function plausibleEula(marker = "one"): string {
    const clause =
        "You may not distribute anything we have made unless we specifically agree to it. " +
        "Mojang owns the game and you own your account. ";
    return `MINECRAFT END USER LICENCE AGREEMENT (${marker})\n\n${clause.repeat(30)}`;
}

function page(body: string): string {
    return `<!doctype html><html><head><title>EULA</title></head><body><main><p>${body
        .split("\n\n")
        .join("</p><p>")}</p></main></body></html>`;
}

function respondWith(html: string, status = 200): FetchLike {
    return () =>
        Promise.resolve(
            new Response(html, { status, statusText: status === 200 ? "OK" : "Not Found" }),
        );
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

describe("turning the page into the document", () => {
    it("keeps the prose and drops the machinery around it", () => {
        const text = extractDocumentText(
            "<html><head><title>t</title></head><body><script>var a = 1;</script>" +
                "<style>p{color:red}</style><nav>Home</nav><p>You may play the game.</p>" +
                "<p>You may not sell it.</p></body></html>",
        );

        expect(text).toContain("You may play the game.");
        expect(text).toContain("You may not sell it.");
        expect(text).not.toContain("var a");
        expect(text).not.toContain("color:red");
    });

    it("keeps paragraph boundaries, because the viewer navigates by them", () => {
        const text = extractDocumentText("<body><p>First clause.</p><p>Second clause.</p></body>");
        expect(text).toBe("First clause.\n\nSecond clause.");
    });

    it("decodes the entities a legal document actually contains", () => {
        expect(decodeEntities("Mojang&nbsp;AB &amp; you &mdash; &copy; 2026")).toBe(
            "Mojang AB & you — © 2026",
        );
        expect(decodeEntities("&#65;&#x42;")).toBe("AB");
        // An entity this build does not know stays visible rather than becoming a
        // replacement character in the middle of a licence.
        expect(decodeEntities("&notarealentity;")).toBe("&notarealentity;");
    });

    it("normalises whitespace so an unchanged page produces identical text twice", () => {
        expect(normaliseWhitespace("  a   b  \r\n\r\n\r\n c \n")).toBe("a b\n\nc");
    });
});

describe("deciding whether what arrived is the licence", () => {
    it("accepts a document that reads like one", () => {
        expect(looksLikeTheEula(plausibleEula()).ok).toBe(true);
    });

    it("refuses something too short to be a licence, and says so", () => {
        const verdict = looksLikeTheEula("Minecraft. Mojang. You.");
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toContain("too short");
    });

    it("refuses a long page that never mentions what a licence must mention", () => {
        const verdict = looksLikeTheEula("Cookies and preferences. ".repeat(200));
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toContain("does not read like");
        expect(verdict.reason).toContain("minecraft");
    });
});

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

describe("loading the document", () => {
    it("fetches it, reports it as live, and writes it to the cache", async () => {
        const result = await loadEulaDocument({
            fetch: respondWith(page(plausibleEula())),
            dataDirectory: directory,
            documentUrl: URL_UNDER_TEST,
            now: () => new Date("2026-08-04T10:00:00.000Z"),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.document.source).toBe("live");
        expect(result.document.fetchedAt).toBe("2026-08-04T10:00:00.000Z");
        expect(result.document.text).toContain("MINECRAFT END USER LICENCE AGREEMENT");
        expect(result.document.characters).toBe(result.document.text.length);

        const onDisk = JSON.parse(await readFile(eulaCacheFile(directory), "utf8")) as {
            text: string;
            fetchedAt: string;
        };
        expect(onDisk.text).toBe(result.document.text);
        expect(onDisk.fetchedAt).toBe("2026-08-04T10:00:00.000Z");
    });

    it("serves a fresh cache without a request, and still calls it cached", async () => {
        writeCachedEula(directory, {
            text: plausibleEula("cached"),
            documentUrl: URL_UNDER_TEST,
            fetchedAt: "2026-08-01T10:00:00.000Z",
            characters: 0,
        });

        let requests = 0;
        const result = await loadEulaDocument({
            fetch: () => {
                requests += 1;
                return Promise.resolve(new Response(page(plausibleEula("live"))));
            },
            dataDirectory: directory,
            documentUrl: URL_UNDER_TEST,
            now: () => new Date("2026-08-02T10:00:00.000Z"),
        });

        expect(requests).toBe(0);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // The distinction this whole module exists for: it is on screen, it is honest
        // about being a copy, and it carries the date it was actually fetched.
        expect(result.document.source).toBe("cache");
        expect(result.document.fetchedAt).toBe("2026-08-01T10:00:00.000Z");
        expect(result.document.text).toContain("cached");
    });

    it("goes back to the network once the cache is older than its maximum age", async () => {
        writeCachedEula(directory, {
            text: plausibleEula("cached"),
            documentUrl: URL_UNDER_TEST,
            fetchedAt: new Date(Date.now() - CACHE_MAX_AGE_MS - 1000).toISOString(),
            characters: 0,
        });

        const result = await loadEulaDocument({
            fetch: respondWith(page(plausibleEula("live"))),
            dataDirectory: directory,
            documentUrl: URL_UNDER_TEST,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.document.source).toBe("live");
        expect(result.document.text).toContain("live");
    });

    it("refreshes on demand even when the cache is fresh", async () => {
        writeCachedEula(directory, {
            text: plausibleEula("cached"),
            documentUrl: URL_UNDER_TEST,
            fetchedAt: new Date().toISOString(),
            characters: 0,
        });

        const result = await loadEulaDocument({
            fetch: respondWith(page(plausibleEula("live"))),
            dataDirectory: directory,
            documentUrl: URL_UNDER_TEST,
            refresh: true,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.document.source).toBe("live");
    });
});

/* -------------------------------------------------------------------------- */
/* Failing                                                                    */
/* -------------------------------------------------------------------------- */

describe("when the document cannot be fetched", () => {
    it("says so plainly, with no document at all, when nothing was ever cached", async () => {
        const result = await loadEulaDocument({
            fetch: () => Promise.reject(new Error("getaddrinfo ENOTFOUND account.mojang.com")),
            dataDirectory: directory,
            documentUrl: URL_UNDER_TEST,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("ENOTFOUND");
        // Null rather than an empty document: the renderer's fallback to BlueMap's own
        // quotation has to be a deliberate branch, not something it stumbles into by
        // rendering a document that happens to be blank.
        expect(result.cached).toBeNull();
    });

    it("hands back the stale copy, labelled cached, rather than presenting it as live", async () => {
        writeCachedEula(directory, {
            text: plausibleEula("cached"),
            documentUrl: URL_UNDER_TEST,
            fetchedAt: "2020-01-01T00:00:00.000Z",
            characters: 0,
        });

        const result = await loadEulaDocument({
            fetch: () => Promise.reject(new Error("network unreachable")),
            dataDirectory: directory,
            documentUrl: URL_UNDER_TEST,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("network unreachable");
        expect(result.cached?.source).toBe("cache");
        expect(result.cached?.fetchedAt).toBe("2020-01-01T00:00:00.000Z");
    });

    it("treats a non-200 answer as a failure and names the status", async () => {
        const result = await loadEulaDocument({
            fetch: respondWith("<body>gone</body>", 404),
            dataDirectory: directory,
            documentUrl: URL_UNDER_TEST,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("404");
    });

    it("refuses a page that is not the licence, and does not cache it", async () => {
        const result = await loadEulaDocument({
            fetch: respondWith(page("Cookies and preferences. ".repeat(200))),
            dataDirectory: directory,
            documentUrl: URL_UNDER_TEST,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("does not read like");
        expect(readCachedEula(directory, URL_UNDER_TEST)).toBeNull();
    });

    it("reports a timeout as a timeout rather than as an unexplained abort", async () => {
        const abort = new Error("aborted");
        abort.name = "TimeoutError";
        const result = await loadEulaDocument({
            fetch: () => Promise.reject(abort),
            dataDirectory: directory,
            documentUrl: URL_UNDER_TEST,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("did not answer in time");
    });
});

/* -------------------------------------------------------------------------- */
/* The cache file itself                                                      */
/* -------------------------------------------------------------------------- */

describe("reading a cache file back", () => {
    it("round-trips a document it wrote", () => {
        const written = writeCachedEula(directory, {
            text: "A licence.",
            documentUrl: URL_UNDER_TEST,
            fetchedAt: "2026-08-04T10:00:00.000Z",
            characters: 0,
        });
        expect(written.characters).toBe("A licence.".length);
        expect(readCachedEula(directory, URL_UNDER_TEST)).toEqual({
            text: "A licence.",
            documentUrl: URL_UNDER_TEST,
            fetchedAt: "2026-08-04T10:00:00.000Z",
            characters: "A licence.".length,
        });
    });

    it("refuses a cache written about a different document", () => {
        writeCachedEula(directory, {
            text: "A licence.",
            documentUrl: "https://example.invalid/other",
            fetchedAt: "2026-08-04T10:00:00.000Z",
            characters: 0,
        });
        expect(readCachedEula(directory, URL_UNDER_TEST)).toBeNull();
    });

    it("refuses a cache with an unusable timestamp, because the date is the point", async () => {
        await writeFile(
            eulaCacheFile(directory),
            JSON.stringify({ version: 1, text: "A licence.", documentUrl: URL_UNDER_TEST, fetchedAt: "soon" }),
            "utf8",
        );
        expect(readCachedEula(directory, URL_UNDER_TEST)).toBeNull();
    });

    it("refuses a cache whose recorded length disagrees with its text", async () => {
        await writeFile(
            eulaCacheFile(directory),
            JSON.stringify({
                version: 1,
                text: "A licence.",
                documentUrl: URL_UNDER_TEST,
                fetchedAt: "2026-08-04T10:00:00.000Z",
                characters: 9999,
            }),
            "utf8",
        );
        expect(readCachedEula(directory, URL_UNDER_TEST)).toBeNull();
    });

    it("refuses junk, a missing file and a future schema alike", async () => {
        expect(readCachedEula(directory, URL_UNDER_TEST)).toBeNull();

        await writeFile(eulaCacheFile(directory), "{not json", "utf8");
        expect(readCachedEula(directory, URL_UNDER_TEST)).toBeNull();

        await writeFile(
            eulaCacheFile(directory),
            JSON.stringify({ version: 99, text: "x", documentUrl: URL_UNDER_TEST, fetchedAt: "2026-08-04T10:00:00.000Z" }),
            "utf8",
        );
        expect(readCachedEula(directory, URL_UNDER_TEST)).toBeNull();
    });
});

import { describe, expect, it } from "vitest";
import {
    FEED_DISABLE_VARIABLE,
    FEED_TOKEN_VARIABLE,
    FEED_URL_VARIABLE,
    describeFeed,
    isSecureFeedUrl,
    resolveFeed,
    type FeedInputs,
} from "./feed.js";

const packagedWindows: FeedInputs = {
    packaged: true,
    platform: "win32",
    arch: "x64",
    version: "0.1.0",
    repository: "Ding-Ding-Projects/material-bluemap",
    environment: {},
};

describe("resolveFeed", () => {
    it("builds a Squirrel-speaking feed for a packaged Windows build", () => {
        const resolution = resolveFeed(packagedWindows);
        expect(resolution.ok).toBe(true);
        if (!resolution.ok) return;
        expect(resolution.feed.url).toBe(
            "https://update.electronjs.org/Ding-Ding-Projects/material-bluemap/win32-x64/0.1.0",
        );
        expect(resolution.feed.serverType).toBe("default");
        expect(resolution.feed.headers).toEqual({});
    });

    it("refuses, with a reason, when the build was not installed by its installer", () => {
        const resolution = resolveFeed({ ...packagedWindows, packaged: false });
        expect(resolution.ok).toBe(false);
        if (resolution.ok) return;
        // The reason has to be a sentence, because it is shown as the whole explanation of
        // why there is no Check for updates result.
        expect(resolution.reason).toContain("not installed by the setup program");
    });

    it("refuses on a platform this app has no installer for", () => {
        const resolution = resolveFeed({ ...packagedWindows, platform: "linux" });
        expect(resolution.ok).toBe(false);
        if (resolution.ok) return;
        expect(resolution.reason).toContain("Nothing is wrong");
    });

    it("refuses when no release repository is configured rather than guessing a host", () => {
        for (const repository of [null, "", "not-a-repo", "owner/repo/extra"]) {
            const resolution = resolveFeed({ ...packagedWindows, repository });
            expect(resolution.ok).toBe(false);
        }
    });

    it("takes an https override, and lets it work on an unpackaged build", () => {
        const resolution = resolveFeed({
            ...packagedWindows,
            packaged: false,
            platform: "linux",
            environment: { [FEED_URL_VARIABLE]: "https://feed.example/win32-x64/0.1.0" },
        });
        expect(resolution.ok).toBe(true);
        if (!resolution.ok) return;
        expect(resolution.feed.url).toBe("https://feed.example/win32-x64/0.1.0");
    });

    it("refuses a plain-http override, because an update fetched over http can be replaced", () => {
        const resolution = resolveFeed({
            ...packagedWindows,
            environment: { [FEED_URL_VARIABLE]: "http://feed.example/win32-x64/0.1.0" },
        });
        expect(resolution.ok).toBe(false);
        if (resolution.ok) return;
        expect(resolution.reason).toContain("replaced in transit");
    });

    it("allows http on loopback, so a test feed needs no certificate", () => {
        const resolution = resolveFeed({
            ...packagedWindows,
            environment: { [FEED_URL_VARIABLE]: "http://127.0.0.1:8123/feed" },
        });
        expect(resolution.ok).toBe(true);
    });

    it("switches updates off entirely when the machine says so", () => {
        const resolution = resolveFeed({
            ...packagedWindows,
            environment: { [FEED_DISABLE_VARIABLE]: "1" },
        });
        expect(resolution.ok).toBe(false);
        if (resolution.ok) return;
        expect(resolution.reason).toContain(FEED_DISABLE_VARIABLE);
    });

    it("attaches a credential as a header and never anywhere else", () => {
        const resolution = resolveFeed({
            ...packagedWindows,
            environment: { [FEED_TOKEN_VARIABLE]: "s3cret-token" },
        });
        expect(resolution.ok).toBe(true);
        if (!resolution.ok) return;
        expect(resolution.feed.headers["Authorization"]).toBe("Bearer s3cret-token");
        // The URL is the value that reaches the interface, so the token must not be in it.
        expect(resolution.feed.url).not.toContain("s3cret-token");
    });
});

describe("describeFeed", () => {
    it("reports the address and the fact of a credential, never the credential", () => {
        const resolution = resolveFeed({
            ...packagedWindows,
            environment: { [FEED_TOKEN_VARIABLE]: "s3cret-token" },
        });
        expect(resolution.ok).toBe(true);
        if (!resolution.ok) return;

        const described = describeFeed(resolution.feed);
        expect(described.hasCredential).toBe(true);
        // The whole point of this function: everything it returns is safe to send to a
        // renderer and to appear in a screenshot.
        expect(JSON.stringify(described)).not.toContain("s3cret-token");
    });
});

describe("isSecureFeedUrl", () => {
    it("accepts https and loopback http, and refuses everything else", () => {
        expect(isSecureFeedUrl("https://example.test/feed")).toBe(true);
        expect(isSecureFeedUrl("http://localhost:9/feed")).toBe(true);
        expect(isSecureFeedUrl("http://example.test/feed")).toBe(false);
        expect(isSecureFeedUrl("file:///C:/feed")).toBe(false);
        expect(isSecureFeedUrl("not a url")).toBe(false);
    });
});

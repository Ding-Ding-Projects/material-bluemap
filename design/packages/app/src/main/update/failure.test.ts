import { describe, expect, it } from "vitest";
import { classifyUpdateFailure, errorText, updateFailure } from "./failure.js";

/**
 * The classifier is the thing standing between Squirrel's own vocabulary and the sentence
 * a person reads, so every rule gets a real message from the wild rather than a string
 * written to satisfy the regex it is being matched against.
 */
describe("classifyUpdateFailure", () => {
    it("reads an offline machine as offline, and says the app will retry", () => {
        const failure = classifyUpdateFailure(
            new Error("getaddrinfo ENOTFOUND update.electronjs.org"),
        );
        expect(failure.code).toBe("offline");
        expect(failure.retryable).toBe(true);
        expect(failure.message).toContain("could not be reached");
        expect(failure.detail).toContain("ENOTFOUND");
    });

    it("reads a 404 as a server problem rather than a machine problem", () => {
        const failure = classifyUpdateFailure(new Error("Unexpected HTTP response 404 from update server"));
        expect(failure.code).toBe("feed-unavailable");
        expect(failure.message).toContain("at the server rather than on this machine");
    });

    it("reads an unverifiable signature as not retryable, and says nothing was installed", () => {
        const failure = classifyUpdateFailure(
            new Error("Authenticode signature of the downloaded package could not be verified"),
        );
        expect(failure.code).toBe("invalid-signature");
        // The one rule with a security consequence: retrying a tampered installer forever
        // is worse than stopping, so this must never be marked retryable.
        expect(failure.retryable).toBe(false);
        expect(failure.message).toContain("Nothing has changed on this machine");
    });

    it("prefers the signature rule over the corrupt rule when a message mentions both", () => {
        const failure = classifyUpdateFailure(
            new Error("hash of downloaded file does not match; authenticode signature is not valid"),
        );
        expect(failure.code).toBe("invalid-signature");
    });

    it("reads a hash mismatch as a corrupt download that normally fixes itself", () => {
        const failure = classifyUpdateFailure(
            new Error("SHA1 of MaterialBlueMap-0.2.0-full.nupkg does not match the RELEASES entry"),
        );
        expect(failure.code).toBe("corrupt-asset");
        expect(failure.retryable).toBe(true);
    });

    it("reads a missing Update.exe as a copy that was never installed", () => {
        const failure = classifyUpdateFailure(
            new Error("Can not find Squirrel's Update.exe beside the application"),
        );
        expect(failure.code).toBe("not-installed");
        expect(failure.retryable).toBe(false);
    });

    it("reads a full disk as a staging failure", () => {
        const failure = classifyUpdateFailure(new Error("ENOSPC: no space left on device, write"));
        expect(failure.code).toBe("staging-failed");
    });

    it("admits when it does not recognise something, and keeps the original text", () => {
        const failure = classifyUpdateFailure(new Error("something nobody has seen before"));
        expect(failure.code).toBe("unknown");
        expect(failure.message).toContain("not one this app recognises");
        expect(failure.detail).toBe("something nobody has seen before");
    });

    it("never throws, whatever it is handed", () => {
        expect(classifyUpdateFailure(undefined).code).toBe("unknown");
        expect(classifyUpdateFailure(null).code).toBe("unknown");
        expect(classifyUpdateFailure({ nope: 1 }).code).toBe("unknown");
        expect(classifyUpdateFailure("404 Not Found").code).toBe("feed-unavailable");
    });

    it("collapses a multi-line banner so it cannot become the whole screen", () => {
        const failure = classifyUpdateFailure(new Error("line one\n   line two\n\nline three"));
        expect(failure.detail).toBe("line one line two line three");
    });
});

describe("errorText", () => {
    it("reads a message off anything that carries one", () => {
        expect(errorText(new Error("  spaced  out  "))).toBe("spaced out");
        expect(errorText("plain")).toBe("plain");
        expect(errorText({ message: "shaped like an error" })).toBe("shaped like an error");
        expect(errorText(42)).toBe("42");
    });
});

describe("updateFailure", () => {
    it("builds a failure this app raised itself, with no detail when there is none", () => {
        const failure = updateFailure("not-installed", "No updater here.", { retryable: false });
        expect(failure).toEqual({
            code: "not-installed",
            message: "No updater here.",
            detail: null,
            retryable: false,
        });
    });
});

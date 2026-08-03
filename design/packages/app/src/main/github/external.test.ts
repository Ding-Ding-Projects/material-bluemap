/**
 * Tests for the one door out to the internet.
 *
 * `shell.openExternal` hands a URL to the operating system, which will happily launch
 * things that are not browsers. So the scheme check is the guard, and it is done by
 * parsing rather than by matching a prefix: several spellings pass a
 * `startsWith("https://")` test without being https URLs, and a prefix test is exactly
 * the kind of check that looks correct in review.
 */

import { describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({ opened: [] as string[], throws: false }));

vi.mock("electron", () => ({
    shell: {
        openExternal: (url: string): Promise<void> => {
            if (electron.throws) return Promise.reject(new Error("no browser configured"));
            electron.opened.push(url);
            return Promise.resolve();
        },
    },
}));

import { isExternalUrlAllowed, openExternalHttps } from "./external.js";

describe("isExternalUrlAllowed", () => {
    it("allows https and nothing else", () => {
        expect(isExternalUrlAllowed("https://github.com/login/device")).toBe(true);

        expect(isExternalUrlAllowed("http://github.com/login/device")).toBe(false);
        expect(isExternalUrlAllowed("file:///C:/Windows/System32/cmd.exe")).toBe(false);
        expect(isExternalUrlAllowed("javascript:alert(1)")).toBe(false);
        expect(isExternalUrlAllowed("ms-settings:privacy")).toBe(false);
        expect(isExternalUrlAllowed("not a url at all")).toBe(false);
        expect(isExternalUrlAllowed("")).toBe(false);
    });

    it("is not fooled by a string that merely starts like an https URL", () => {
        // Parses as a `https+evil:` scheme rather than as https, which a prefix check
        // would have waved through.
        expect(isExternalUrlAllowed("https+evil://github.com")).toBe(false);
    });
});

describe("openExternalHttps", () => {
    it("opens an https address", async () => {
        electron.opened = [];
        electron.throws = false;

        await expect(openExternalHttps("https://github.com/login/device")).resolves.toBe(true);
        expect(electron.opened).toEqual(["https://github.com/login/device"]);
    });

    it("refuses anything else without opening it", async () => {
        electron.opened = [];
        electron.throws = false;

        await expect(openExternalHttps("file:///etc/passwd")).resolves.toBe(false);
        expect(electron.opened).toEqual([]);
    });

    it("reports a machine with no browser rather than throwing at the caller", async () => {
        // A real configuration, not a crash: the sign-in screen shows the address and the
        // code, and somebody types them somewhere else.
        electron.opened = [];
        electron.throws = true;

        await expect(openExternalHttps("https://github.com/login/device")).resolves.toBe(false);
    });
});

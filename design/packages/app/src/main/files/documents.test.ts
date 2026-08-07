import { describe, expect, it } from "vitest";
import {
    defaultMapStorageDirectory,
    resolveDocumentsDirectory,
    windowsMapStorageDefault,
} from "./documents.js";

const always = (): boolean => true;
const never = (): boolean => false;

describe("resolveDocumentsDirectory", () => {
    it("leaves an ordinary Documents folder exactly where it is", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "C:\\Users\\ada\\Documents",
            home: "C:\\Users\\ada",
            platform: "win32",
            directoryExists: always,
        });
        expect(resolution.redirected).toBe(false);
        expect(resolution.resolved).toBe("C:\\Users\\ada\\Documents");
        expect(resolution.explanation).toBeNull();
    });

    it("redirects a Documents folder that Windows moved into OneDrive", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "C:\\Users\\ada\\OneDrive\\Documents",
            home: "C:\\Users\\ada",
            platform: "win32",
            directoryExists: always,
        });
        expect(resolution.redirected).toBe(true);
        expect(resolution.reason).toBe("onedrive");
        expect(resolution.resolved).toBe("C:\\Users\\ada\\Documents");
    });

    it("explains the redirect rather than doing it silently", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "C:\\Users\\ada\\OneDrive\\Documents",
            home: "C:\\Users\\ada",
            platform: "win32",
            directoryExists: always,
        });
        // An app that quietly writes somewhere other than where the user was told is a
        // worse problem than the one it was avoiding.
        expect(resolution.explanation).toContain("OneDrive");
        expect(resolution.explanation).toContain("C:\\Users\\ada\\Documents");
        expect(resolution.explanation).toContain("You can change this");
    });

    it("catches a work or school OneDrive too", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "C:\\Users\\ada\\OneDrive - Contoso Ltd\\Documents",
            home: "C:\\Users\\ada",
            platform: "win32",
            directoryExists: always,
        });
        expect(resolution.redirected).toBe(true);
        expect(resolution.resolved).toBe("C:\\Users\\ada\\Documents");
    });

    it("does not redirect a user who is actually called OneDrive", () => {
        // `C:\Users\OneDrive\Documents` is that person's real, local Documents folder. A
        // naive "does the path contain OneDrive" check sends them out of it, into itself,
        // forever.
        const resolution = resolveDocumentsDirectory({
            reported: "C:\\Users\\OneDrive\\Documents",
            home: "C:\\Users\\OneDrive",
            platform: "win32",
            directoryExists: always,
        });
        expect(resolution.redirected).toBe(false);
        expect(resolution.explanation).toBeNull();
        expect(resolution.resolved).toBe("C:\\Users\\OneDrive\\Documents");
    });

    it("still redirects a user called OneDrive whose Documents really is synced", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "C:\\Users\\OneDrive\\OneDrive\\Documents",
            home: "C:\\Users\\OneDrive",
            platform: "win32",
            directoryExists: always,
        });
        expect(resolution.redirected).toBe(true);
        expect(resolution.resolved).toBe("C:\\Users\\OneDrive\\Documents");
    });

    it("does not invent a folder that is not there, and says so", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "C:\\Users\\ada\\OneDrive\\Documents",
            home: "C:\\Users\\ada",
            platform: "win32",
            directoryExists: never,
        });
        // Moving somebody's maps into a directory that does not exist would turn a
        // performance problem into a failed render.
        expect(resolution.redirected).toBe(false);
        expect(resolution.resolved).toBe("C:\\Users\\ada\\OneDrive\\Documents");
        expect(resolution.explanation).toContain("does not exist on this machine");
    });

    it("says something useful when there is no home directory to fall back to", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "D:\\OneDrive\\Documents",
            home: "",
            platform: "win32",
            directoryExists: always,
        });
        expect(resolution.redirected).toBe(false);
        expect(resolution.explanation).toContain("choose a folder on this machine yourself");
    });

    it("handles a Documents folder on a completely different drive from the profile", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "D:\\OneDrive\\Documents",
            home: "C:\\Users\\ada",
            platform: "win32",
            directoryExists: always,
        });
        expect(resolution.redirected).toBe(true);
        expect(resolution.resolved).toBe("C:\\Users\\ada\\Documents");
    });

    it("does nothing at all off Windows, which does not have this problem", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "/home/ada/OneDrive/Documents",
            home: "/home/ada",
            platform: "linux",
            directoryExists: always,
        });
        expect(resolution.redirected).toBe(false);
        expect(resolution.explanation).toBeNull();
    });
});

describe("defaultMapStorageDirectory", () => {
    it("puts maps somewhere a person can find them, under the resolved Documents", () => {
        const resolution = resolveDocumentsDirectory({
            reported: "C:\\Users\\ada\\OneDrive\\Documents",
            home: "C:\\Users\\ada",
            platform: "win32",
            directoryExists: always,
        });
        expect(defaultMapStorageDirectory(resolution)).toBe(
            "C:\\Users\\ada\\Documents\\Worldlens\\maps",
        );
    });
});

describe("windowsMapStorageDefault", () => {
    it("answers with a path and its explanation on Windows", () => {
        const answer = windowsMapStorageDefault({
            reported: "C:\\Users\\ada\\OneDrive\\Documents",
            home: "C:\\Users\\ada",
            platform: "win32",
            directoryExists: always,
        });
        expect(answer?.directory).toBe("C:\\Users\\ada\\Documents\\Worldlens\\maps");
        expect(answer?.resolution.redirected).toBe(true);
    });

    it("answers null elsewhere, so a caller keeps its own default", () => {
        // Building a `C:\`-shaped path with `win32.join` on a machine using `/` would be a
        // default nobody could write to.
        expect(
            windowsMapStorageDefault({
                reported: "/home/ada/Documents",
                home: "/home/ada",
                platform: "linux",
            }),
        ).toBeNull();
    });
});

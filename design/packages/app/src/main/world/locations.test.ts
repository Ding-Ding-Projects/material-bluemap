/**
 * Where Minecraft would be, for a platform this test is almost certainly not running on.
 *
 * Every case names its platform, its environment and its home directory, which is the
 * whole reason `defaultMinecraftFolders` takes all three as parameters. The alternative -
 * reading `process.platform` inside - produces exactly the failure `java/discovery.ts`
 * carries a note about: path code that passes on a Windows desktop and fails on a Linux
 * CI runner, or the reverse, with nothing in the test able to say which.
 */

import { describe, expect, it } from "vitest";
import { defaultLauncherRoots, defaultMinecraftFolders, describeOrigin } from "./locations.js";

describe("the default Minecraft folder, per platform", () => {
    it("finds it under APPDATA on Windows", () => {
        expect(
            defaultMinecraftFolders({
                platform: "win32",
                env: { APPDATA: "C:\\Users\\ada\\AppData\\Roaming" },
            }),
        ).toEqual([
            {
                id: "default:appdata",
                installationPath: "C:\\Users\\ada\\AppData\\Roaming\\.minecraft",
                savesPath: "C:\\Users\\ada\\AppData\\Roaming\\.minecraft\\saves",
                origin: "appdata",
            },
        ]);
    });

    it("reads an APPDATA the shell spelled in a different case", () => {
        // Node preserves whatever case the process was handed, and Windows itself does not
        // care, so a shell that set `AppData` must not read as a machine with no Minecraft.
        const found = defaultMinecraftFolders({
            platform: "win32",
            env: { AppData: "C:\\Users\\ada\\AppData\\Roaming" },
        });

        expect(found[0]?.savesPath).toBe("C:\\Users\\ada\\AppData\\Roaming\\.minecraft\\saves");
    });

    it("builds the path APPDATA would have expanded to when the variable is missing", () => {
        const found = defaultMinecraftFolders({ platform: "win32", env: {}, home: "C:\\Users\\ada" });

        expect(found[0]?.savesPath).toBe("C:\\Users\\ada\\AppData\\Roaming\\.minecraft\\saves");
    });

    it("uses Application Support on macOS, with the lower-case undotted name", () => {
        const found = defaultMinecraftFolders({ platform: "darwin", home: "/Users/ada" });

        expect(found).toEqual([
            {
                id: "default:application-support",
                installationPath: "/Users/ada/Library/Application Support/minecraft",
                savesPath: "/Users/ada/Library/Application Support/minecraft/saves",
                origin: "application-support",
            },
        ]);
    });

    it("uses a dotted .minecraft in the home directory everywhere else", () => {
        const found = defaultMinecraftFolders({ platform: "linux", home: "/home/ada" });

        expect(found[0]?.savesPath).toBe("/home/ada/.minecraft/saves");
        expect(found[0]?.origin).toBe("home");
    });

    it("uses the platform's own separators, not the running platform's", () => {
        // The trap this whole parameterisation exists to avoid. Asked about Windows from a
        // Linux runner it must still answer with backslashes, and the reverse.
        const windows = defaultMinecraftFolders({ platform: "win32", env: { APPDATA: "C:\\x" } });
        const linux = defaultMinecraftFolders({ platform: "linux", home: "/home/ada" });

        expect(windows[0]?.savesPath).not.toContain("/");
        expect(linux[0]?.savesPath).not.toContain("\\");
    });
});

describe("a portable installation beside the executable", () => {
    it("is offered as well as the platform default", () => {
        const found = defaultMinecraftFolders({
            platform: "win32",
            env: { APPDATA: "C:\\Users\\ada\\AppData\\Roaming" },
            executableDirectory: "D:\\Games\\Launcher",
        });

        expect(found.map((folder) => folder.origin)).toEqual(["appdata", "beside-executable"]);
        expect(found[1]?.savesPath).toBe("D:\\Games\\Launcher\\.minecraft\\saves");
    });

    it("is not offered twice when it is the default location", () => {
        const found = defaultMinecraftFolders({
            platform: "linux",
            home: "/home/ada",
            executableDirectory: "/home/ada",
        });

        expect(found).toHaveLength(1);
        expect(found[0]?.origin).toBe("home");
    });
});

describe("a machine with nothing to go on", () => {
    it("answers with an empty list rather than an error", () => {
        // Not having Minecraft installed, and not having a home directory to look in, are
        // both ordinary states. Neither is a failure the wizard has to recover from.
        expect(defaultMinecraftFolders({ platform: "linux", env: {} })).toEqual([]);
        expect(defaultMinecraftFolders({ platform: "win32", env: {}, home: "  " })).toEqual([]);
    });
});

describe("naming a place in a message", () => {
    it("has words for every origin it can report", () => {
        for (const origin of [
            "appdata",
            "home",
            "application-support",
            "beside-executable",
            "bedrock-appdata",
            "curseforge-default",
        ] as const) {
            expect(describeOrigin(origin).length).toBeGreaterThan(10);
        }
    });
});

describe("Bedrock Edition's worlds folder, Windows only", () => {
    it("is built from LOCALAPPDATA's packaged-app storage, beside the Java default", () => {
        const found = defaultMinecraftFolders({
            platform: "win32",
            env: { APPDATA: "C:\\Users\\ada\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\ada\\AppData\\Local" },
        });

        expect(found.map((folder) => folder.origin)).toEqual(["appdata", "bedrock-appdata"]);
        expect(found[1]?.savesPath).toBe(
            "C:\\Users\\ada\\AppData\\Local\\Packages\\Microsoft.MinecraftUWP_8wekyb3d8bbwe\\LocalState\\games\\com.mojang\\minecraftWorlds",
        );
    });

    it("builds the path LOCALAPPDATA would have expanded to when the variable is missing", () => {
        const found = defaultMinecraftFolders({ platform: "win32", env: {}, home: "C:\\Users\\ada" });

        const bedrock = found.find((folder) => folder.origin === "bedrock-appdata");
        expect(bedrock?.savesPath).toBe(
            "C:\\Users\\ada\\AppData\\Local\\Packages\\Microsoft.MinecraftUWP_8wekyb3d8bbwe\\LocalState\\games\\com.mojang\\minecraftWorlds",
        );
    });

    it("is not offered on macOS or Linux, where this packaged-app storage shape does not exist", () => {
        expect(defaultMinecraftFolders({ platform: "darwin", home: "/Users/ada" })).toHaveLength(1);
        expect(defaultMinecraftFolders({ platform: "linux", home: "/home/ada" })).toHaveLength(1);
    });

    it("is absent, not merely empty, when there is no APPDATA, no LOCALAPPDATA and no home", () => {
        expect(defaultMinecraftFolders({ platform: "win32", env: {} })).toEqual([]);
    });
});

describe("the CurseForge default root candidate", () => {
    it("is offered under the user's home directory, on Windows, when a home is known", () => {
        const found = defaultLauncherRoots({ platform: "win32", home: "C:\\Users\\ada" });

        expect(found).toEqual([{ root: "C:\\Users\\ada\\curseforge\\minecraft", origin: "curseforge-default" }]);
    });

    it("is not offered on a platform where it was never verified, or with no home directory", () => {
        expect(defaultLauncherRoots({ platform: "darwin", home: "/Users/ada" })).toEqual([]);
        expect(defaultLauncherRoots({ platform: "linux", home: "/home/ada" })).toEqual([]);
        expect(defaultLauncherRoots({ platform: "win32", home: "" })).toEqual([]);
        expect(defaultLauncherRoots({ platform: "win32" })).toEqual([]);
    });
});

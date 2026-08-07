import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import { memoryStorage, setSetupStorage, setupStorage } from "./setupPrefs.js";
import {
    clearMapStorageDir,
    defaultMapStorageDir,
    detectPlatform,
    expandsAtRenderTime,
    isAbsolutePath,
    joinMapStorageDir,
    mapStorageExample,
    normalizeMapStorageDir,
    pathSeparator,
    pathToken,
    readMapStorageDir,
    validateMapStorageDir,
    writeMapStorageDir,
} from "./mapStorage.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
});

describe("platform detection", () => {
    it("reads the platform out of a user-agent string", () => {
        expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
        expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macos");
        expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    });

    it("treats anything else as Linux rather than guessing", () => {
        expect(detectPlatform("")).toBe("linux");
    });
});

describe("the default folder", () => {
    it("sits beside the app's own data on each platform", () => {
        // Windows names the real userData leaf - @worldlens\app, from this app's own
        // package.json "name" field, never renamed via app.setName() - not the display name.
        expect(defaultMapStorageDir("windows")).toBe("%APPDATA%\\@worldlens\\app\\maps");
        expect(defaultMapStorageDir("macos")).toBe(
            "~/Library/Application Support/Worldlens/maps",
        );
        expect(defaultMapStorageDir("linux")).toBe("~/.config/Worldlens/maps");
    });

    it("is a valid answer on every platform", () => {
        for (const platform of ["windows", "macos", "linux"] as const) {
            expect(validateMapStorageDir(defaultMapStorageDir(platform), platform)).toBeNull();
        }
    });

    it("still carries the token the main process expands", () => {
        for (const platform of ["windows", "macos", "linux"] as const) {
            expect(expandsAtRenderTime(defaultMapStorageDir(platform), platform)).toBe(true);
            expect(defaultMapStorageDir(platform).startsWith(pathToken(platform))).toBe(true);
        }
    });

    it("uses the platform's own separator", () => {
        expect(pathSeparator("windows")).toBe("\\");
        expect(pathSeparator("linux")).toBe("/");
    });
});

describe("absolute paths", () => {
    it("accepts a Windows drive letter and a UNC share", () => {
        expect(isAbsolutePath("C:\\maps", "windows")).toBe(true);
        expect(isAbsolutePath("d:/maps", "windows")).toBe(true);
        expect(isAbsolutePath("\\\\nas\\maps", "windows")).toBe(true);
    });

    it("accepts a POSIX root", () => {
        expect(isAbsolutePath("/home/you/maps", "linux")).toBe(true);
        expect(isAbsolutePath("/Users/you/maps", "macos")).toBe(true);
    });

    it("accepts an environment token that expands into one", () => {
        expect(isAbsolutePath("%LOCALAPPDATA%\\maps", "windows")).toBe(true);
        expect(isAbsolutePath("~/maps", "linux")).toBe(true);
        expect(isAbsolutePath("$HOME/maps", "linux")).toBe(true);
        expect(isAbsolutePath("${HOME}/maps", "linux")).toBe(true);
    });

    it("rejects a relative path, which would land wherever the process happened to be", () => {
        // The CLI resolves its storage root against the working directory, so a relative
        // answer here is how tiles end up somewhere nobody chose.
        expect(isAbsolutePath("maps", "windows")).toBe(false);
        expect(isAbsolutePath("./maps", "linux")).toBe(false);
        expect(isAbsolutePath("../maps", "macos")).toBe(false);
        expect(isAbsolutePath("C:maps", "windows")).toBe(false);
    });

    it("rejects an empty answer", () => {
        expect(isAbsolutePath("", "linux")).toBe(false);
        expect(isAbsolutePath("   ", "linux")).toBe(false);
    });
});

describe("validation", () => {
    it("names the problem rather than just refusing", () => {
        expect(validateMapStorageDir("", "linux")).toBe("empty");
        expect(validateMapStorageDir("   ", "linux")).toBe("empty");
        expect(validateMapStorageDir("maps", "linux")).toBe("relative");
        expect(validateMapStorageDir("/srv/maps", "linux")).toBeNull();
    });

    it("offers an example in the platform's own notation", () => {
        expect(mapStorageExample("windows")).toContain("\\");
        expect(mapStorageExample("linux")).toContain("/");
    });
});

describe("normalisation", () => {
    it("trims and drops trailing separators", () => {
        expect(normalizeMapStorageDir("  /srv/maps/  ", "linux")).toBe("/srv/maps");
        expect(normalizeMapStorageDir("C:\\maps\\", "windows")).toBe("C:\\maps");
        expect(normalizeMapStorageDir("C:\\maps///", "windows")).toBe("C:\\maps");
    });

    it("keeps a bare root intact", () => {
        expect(normalizeMapStorageDir("/", "linux")).toBe("/");
        expect(normalizeMapStorageDir("C:\\", "windows")).toBe("C:\\");
    });

    it("returns nothing for an empty answer", () => {
        expect(normalizeMapStorageDir("   ", "linux")).toBe("");
    });

    it("joins a chosen parent to the product's own subfolder", () => {
        expect(joinMapStorageDir("/srv", "linux")).toBe("/srv/maps");
        expect(joinMapStorageDir("D:\\games\\", "windows")).toBe("D:\\games\\maps");
        expect(joinMapStorageDir("C:\\", "windows")).toBe("C:\\maps");
        expect(joinMapStorageDir("", "linux")).toBe("");
    });
});

describe("persistence", () => {
    it("has no answer before setup makes one", () => {
        expect(readMapStorageDir()).toBeNull();
    });

    it("stores the normalised answer", () => {
        expect(writeMapStorageDir("  /srv/maps/ ", "linux")).toBe("/srv/maps");
        expect(readMapStorageDir()).toBe("/srv/maps");
        expect(setupStorage().read("worldlens.maps.directory")).toBe("/srv/maps");
    });

    it("treats a blank stored value as no answer", () => {
        setSetupStorage(memoryStorage({ "worldlens.maps.directory": "   " }));
        expect(readMapStorageDir()).toBeNull();
    });

    it("can be cleared", () => {
        writeMapStorageDir("/srv/maps", "linux");
        clearMapStorageDir();
        expect(readMapStorageDir()).toBeNull();
    });
});

describe("mirroring into the application-settings history", () => {
    beforeEach(() => {
        vi.mocked(recordAppSetting).mockClear();
    });

    it("mirrors the normalised directory under the mapStorageDir key", () => {
        writeMapStorageDir("  /srv/maps/ ", "linux");
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("mapStorageDir", "/srv/maps");
    });
});

import { describe, expect, it } from "vitest";
import {
    MountRefusedError,
    checkMountSource,
    containerWorldPath,
    mountArgument,
    mountArguments,
    requireMountSource,
} from "./mounts.js";

const WINDOWS = { platform: "win32" as const, home: "C:\\Users\\somebody" };
const LINUX = { platform: "linux" as const, home: "/home/somebody" };

describe("what a container may be shown", () => {
    it("accepts an ordinary world folder on either platform", () => {
        expect(checkMountSource("C:\\Users\\somebody\\saves\\world", WINDOWS)).toEqual({
            ok: true,
            path: "C:\\Users\\somebody\\saves\\world",
        });
        expect(checkMountSource("/home/somebody/saves/world", LINUX)).toEqual({
            ok: true,
            path: "/home/somebody/saves/world",
        });
    });

    it("normalises a trailing separator without turning a drive root into a name", () => {
        expect(checkMountSource("C:\\worlds\\", WINDOWS)).toEqual({ ok: true, path: "C:\\worlds" });
        const root = checkMountSource("C:\\", WINDOWS);
        expect(root.ok).toBe(false);
    });

    it("refuses the home folder itself", () => {
        const refused = checkMountSource("C:\\Users\\somebody", WINDOWS);
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.reason).toContain("home folder");
    });

    it("refuses a folder that contains the home folder", () => {
        // The mistake this exists for: picking one level too high in a folder picker.
        const refused = checkMountSource("/home", LINUX);
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.reason).toContain("home folder");
    });

    it("refuses a drive root and a filesystem root", () => {
        expect(checkMountSource("C:\\", WINDOWS).ok).toBe(false);
        expect(checkMountSource("/", LINUX).ok).toBe(false);
    });

    it("refuses a system folder", () => {
        const windows = checkMountSource("C:\\Windows", WINDOWS);
        expect(windows.ok).toBe(false);
        expect(windows.ok === false && windows.reason).toContain("system folder");
        expect(checkMountSource("/etc", LINUX).ok).toBe(false);
    });

    it("still allows a world that happens to live under a system folder's children", () => {
        // A server installed in Program Files is ordinary; refusing its world would be
        // refusing a real setup to satisfy a rule about the folder above it.
        expect(checkMountSource("C:\\Program Files\\server\\world", WINDOWS).ok).toBe(true);
        expect(checkMountSource("/var/minecraft/world", LINUX).ok).toBe(true);
    });

    it("refuses a relative path, because where it points depends on the app's own directory", () => {
        const refused = checkMountSource("saves/world", LINUX);
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.reason).toContain("not a full path");
    });

    it("refuses an empty path", () => {
        expect(checkMountSource("   ", LINUX).ok).toBe(false);
    });

    it("refuses a colon past a drive prefix, which would truncate the mount argument", () => {
        const refused = checkMountSource("/srv/data:extra/world", LINUX);
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.reason).toContain("':'");
    });

    it("refuses a control character in a path", () => {
        const refused = checkMountSource("/srv/wo\u0007rld", LINUX);
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.reason).toContain("control character");
    });

    it("keeps a folder whose name merely contains two dots", () => {
        expect(checkMountSource("/srv/saves..old", LINUX).ok).toBe(true);
    });

    it("refuses a bare UNC server with no share", () => {
        expect(checkMountSource("\\\\fileserver", WINDOWS).ok).toBe(false);
        expect(checkMountSource("\\\\fileserver\\worlds\\world", WINDOWS).ok).toBe(true);
    });

    it("throws a refusal with the reason when a caller demands a source", () => {
        expect(() => requireMountSource("/", LINUX)).toThrow(MountRefusedError);
        expect(requireMountSource("/srv/world", LINUX)).toBe("/srv/world");
    });
});

describe("writing the mount arguments", () => {
    it("adds :ro only for a read-only mount", () => {
        expect(
            mountArgument({ hostPath: "/srv/world", containerPath: "/worlds/overworld", readOnly: true }),
        ).toBe("/srv/world:/worlds/overworld:ro");
        expect(mountArgument({ hostPath: "/srv/web", containerPath: "/bluemap/web", readOnly: false })).toBe(
            "/srv/web:/bluemap/web",
        );
    });

    it("keeps a Windows drive letter intact", () => {
        expect(
            mountArgument({
                hostPath: "C:\\worlds\\world",
                containerPath: "/worlds/overworld",
                readOnly: true,
            }),
        ).toBe("C:\\worlds\\world:/worlds/overworld:ro");
    });

    it("pairs each mount with its own -v", () => {
        expect(
            mountArguments([
                { hostPath: "/a", containerPath: "/bluemap/config", readOnly: false },
                { hostPath: "/b", containerPath: "/worlds/x", readOnly: true },
            ]),
        ).toEqual(["-v", "/a:/bluemap/config", "-v", "/b:/worlds/x:ro"]);
    });

    it("puts each world in its own directory outside the engine's own tree", () => {
        expect(containerWorldPath("overworld")).toBe("/worlds/overworld");
        expect(containerWorldPath("the_end")).toBe("/worlds/the_end");
    });
});

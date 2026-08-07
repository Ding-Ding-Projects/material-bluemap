/**
 * The refusals that stand between a settings field and an `ssh` argument.
 *
 * Nothing here touches a network or a disk, so every grammar is provable from any machine.
 * The cases worth reading are the ones where a field would stop being a field: a host that
 * is an option, a work directory that ends a mount specification early.
 */

import { describe, expect, it } from "vitest";
import {
    DEFAULT_REMOTE_IMAGE,
    DEFAULT_SSH_PORT,
    checkWorkDir,
    describeTarget,
    destination,
    validateTarget,
} from "./target.js";

const GOOD = {
    id: "render-box",
    host: "render.example",
    user: "renderer",
    port: 2222,
    workDir: "/srv/worldlens",
};

describe("validateTarget", () => {
    it("accepts an ordinary target and fills in the defaults", () => {
        const checked = validateTarget({ id: "box", host: "render.example", user: "renderer" });
        expect(checked.ok).toBe(true);
        if (!checked.ok) return;
        expect(checked.target.port).toBe(DEFAULT_SSH_PORT);
        expect(checked.target.image).toBe(DEFAULT_REMOTE_IMAGE);
        expect(checked.target.docker).toBe("docker");
        expect(checked.target.keepRemoteFiles).toBe(false);
        expect(checked.target.identityFile).toBeNull();
        expect(checked.target.label).toBe("renderer@render.example");
    });

    it("has nowhere to put a password, whatever a stored target holds", () => {
        const checked = validateTarget({
            ...GOOD,
            // A field written by an older build, by hand, or by an import. It must not
            // survive into anything that becomes an ssh invocation.
            password: "hunter2",
            passphrase: "hunter2",
        } as never);
        expect(checked.ok).toBe(true);
        if (!checked.ok) return;
        expect(JSON.stringify(checked.target)).not.toContain("hunter2");
        expect(Object.keys(checked.target)).not.toContain("password");
        expect(Object.keys(checked.target)).not.toContain("passphrase");
    });

    it("refuses a host that ssh would read as an option", () => {
        // `-oProxyCommand=...` in a host field is how a settings screen becomes a way to
        // run an arbitrary local command.
        const checked = validateTarget({ ...GOOD, host: "-oProxyCommand=calc.exe" });
        expect(checked.ok).toBe(false);
        if (checked.ok) return;
        expect(checked.failure.remoteCode).toBe("invalid-target");
        expect(checked.failure.message).toContain("read by ssh as an option");
    });

    it("refuses hosts and users carrying anything that would split an argument", () => {
        for (const host of ["render example", "a;b", "a|b", "host$(id)", "a@b", ""]) {
            expect(validateTarget({ ...GOOD, host }).ok).toBe(false);
        }
        for (const user of ["render er", "-l", "a;b", ""]) {
            expect(validateTarget({ ...GOOD, user }).ok).toBe(false);
        }
    });

    it("accepts an IPv6 address in brackets, which is how ssh takes one", () => {
        expect(validateTarget({ ...GOOD, host: "[2001:db8::1]" }).ok).toBe(true);
    });

    it("refuses a port that is not one", () => {
        for (const port of [0, -1, 65_536, 1.5, "twenty-two"]) {
            expect(validateTarget({ ...GOOD, port }).ok).toBe(false);
        }
    });

    it("keeps the identity file as a path and never as contents", () => {
        const checked = validateTarget({ ...GOOD, identityFile: "C:\\Users\\me\\.ssh\\id_ed25519" });
        expect(checked.ok).toBe(true);
        if (!checked.ok) return;
        expect(checked.target.identityFile).toBe("C:\\Users\\me\\.ssh\\id_ed25519");
    });
});

describe("describeTarget and destination", () => {
    it("say what a message and an ssh argument each need, and nothing else", () => {
        const checked = validateTarget({ ...GOOD, identityFile: "/home/me/.ssh/id_ed25519" });
        expect(checked.ok).toBe(true);
        if (!checked.ok) return;
        expect(describeTarget(checked.target)).toBe("renderer@render.example:2222");
        expect(destination(checked.target)).toBe("renderer@render.example");
        // A message about a target never names the key.
        expect(describeTarget(checked.target)).not.toContain("id_ed25519");
    });
});

describe("checkWorkDir", () => {
    it("accepts a path under the remote account's own home", () => {
        // The local mount checker refuses `/home` outright, which is correct for a laptop
        // sharing a folder with a container and wrong for a server whose accounts live
        // there. That is why this is a separate checker.
        expect(checkWorkDir("/home/renderer/renders")).toEqual({
            ok: true,
            path: "/home/renderer/renders",
        });
        expect(checkWorkDir("/var/lib/worldlens")).toEqual({
            ok: true,
            path: "/var/lib/worldlens",
        });
    });

    it("accepts the tilde form, which is resolved later against the real home", () => {
        expect(checkWorkDir("~/renders")).toEqual({ ok: true, path: "~/renders" });
        expect(checkWorkDir("~")).toEqual({ ok: true, path: "~" });
        // Another account's home is not somewhere this app creates directories.
        expect(checkWorkDir("~someone/renders").ok).toBe(false);
    });

    it("refuses a colon, which ends the source half of a container mount early", () => {
        const checked = checkWorkDir("/srv/a:b");
        expect(checked.ok).toBe(false);
        if (checked.ok) return;
        expect(checked.reason).toContain("container mount");
    });

    it("refuses the filesystem root and the system directories", () => {
        for (const path of ["/", "/etc", "/usr/lib", "/bin", "/proc/self"]) {
            expect(checkWorkDir(path).ok).toBe(false);
        }
    });

    it("refuses a relative path, a traversal and a shell metacharacter", () => {
        for (const path of ["renders", "./renders", "/srv/../../etc", "/srv/$(id)", "/srv/a b", ""]) {
            expect(checkWorkDir(path).ok).toBe(false);
        }
    });

    it("trims a trailing slash so a path is one string rather than two", () => {
        expect(checkWorkDir("/srv/renders/")).toEqual({ ok: true, path: "/srv/renders" });
    });
});

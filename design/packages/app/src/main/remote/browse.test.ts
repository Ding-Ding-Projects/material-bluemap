/**
 * Listing a remote directory for the Explorer-style browser, and the world signal it reads
 * for free while it is there.
 *
 * No SSH client, no server, no PowerShell and no `sh` anywhere in these tests - the same
 * discipline every other file in this folder holds to. `fakeRunner` answers exactly what a
 * real Linux or Windows remote's script would print, and every assertion is about what
 * `browseRemoteDirectory` does with that answer, never about whether the scripts themselves
 * can be executed on this machine.
 */

import { describe, expect, it } from "vitest";
import {
    DEFAULT_MAX_ENTRIES,
    browseRemoteDirectory,
    detectRemoteOs,
    parseLinuxListing,
    remoteSeparator,
    type RemoteEntry,
} from "./browse.js";
import { SSH_UNREACHABLE, fakeRunner, output, testTarget } from "./fakes.js";

function options(runner: ReturnType<typeof fakeRunner>, extra: Record<string, unknown> = {}) {
    return {
        target: testTarget(),
        knownHostsFile: "C:\\app\\known_hosts",
        runner: runner.runner,
        ...extra,
    };
}

function entryNamed(entries: readonly RemoteEntry[], name: string): RemoteEntry {
    const found = entries.find((entry) => entry.name === name);
    if (found === undefined) throw new Error(`no entry named ${name} in [${entries.map((e) => e.name).join(", ")}]`);
    return found;
}

/* -------------------------------------------------------------------------- */
/* Telling the two remotes apart                                              */
/* -------------------------------------------------------------------------- */

describe("detecting the remote OS", () => {
    it("reads a Linux answer to uname -s", async () => {
        const runner = fakeRunner([{ when: /uname -s/, answer: output({ stdout: "Linux\n" }) }]);
        await expect(detectRemoteOs(runner.runner)).resolves.toBe("linux");
    });

    it("reads a missing uname as Windows, not as a rejection", async () => {
        const runner = fakeRunner([
            { when: /uname -s/, answer: output({ ok: false, exitCode: 127, stderr: "bash: uname: command not found" }) },
        ]);
        await expect(detectRemoteOs(runner.runner)).resolves.toBe("windows");
    });

    it("reads an unrecognised answer as Windows rather than as a fourth OS", async () => {
        const runner = fakeRunner([{ when: /uname -s/, answer: output({ stdout: "SunOS\n" }) }]);
        await expect(detectRemoteOs(runner.runner)).resolves.toBe("windows");
    });
});

/* -------------------------------------------------------------------------- */
/* A Linux remote                                                             */
/* -------------------------------------------------------------------------- */

/** Exactly the shape `linuxListingScript` prints, for a folder with every signal case in it. */
const LINUX_LISTING = [
    "E\td\t0\t4096\t1690000000\t1\tregion,DIM-1/region,\tBastion",
    "E\td\t0\t4096\t1690000001\t1\t\tFreshWorld",
    "E\td\t0\t4096\t1690000002\t0\tregion,\tJustARegionHolder",
    "E\tf\t0\t1234\t1690000003\t0\t\tnotes.txt",
    "E\td\t1\t0\t1690000004\t0\t\tLinkedFolder",
    "T\t5\t5",
    "",
].join("\n");

describe("a Linux remote", () => {
    it("parses directories, files and their sizes and dates", async () => {
        const runner = fakeRunner([{ when: /'sh' '-c'/, answer: output({ stdout: LINUX_LISTING }) }]);
        const outcome = await browseRemoteDirectory("/srv/saves", options(runner, { os: "linux" }));
        if (!outcome.ok) throw new Error(outcome.message);

        expect(outcome.listing.os).toBe("linux");
        expect(outcome.listing.separator).toBe("/");
        expect(outcome.listing.truncated).toBe(false);
        expect(outcome.listing.totalEntries).toBe(5);
        expect(outcome.listing.entries).toHaveLength(5);

        const notes = entryNamed(outcome.listing.entries, "notes.txt");
        expect(notes.directory).toBe(false);
        expect(notes.sizeBytes).toBe(1234);
        expect(notes.modifiedAt).toBe(new Date(1690000003 * 1000).toISOString());
    });

    it("recognises a folder with level.dat and a region folder as a world, and says why", async () => {
        const runner = fakeRunner([{ when: /'sh' '-c'/, answer: output({ stdout: LINUX_LISTING }) }]);
        const outcome = await browseRemoteDirectory("/srv/saves", options(runner, { os: "linux" }));
        if (!outcome.ok) throw new Error(outcome.message);

        const bastion = entryNamed(outcome.listing.entries, "Bastion");
        expect(bastion.world.hasLevelDat).toBe(true);
        expect(bastion.world.regionDimensions).toEqual(["region", "DIM-1/region"]);
        expect(bastion.world.looksLikeWorld).toBe(true);
    });

    it("never claims a world from level.dat alone", async () => {
        const runner = fakeRunner([{ when: /'sh' '-c'/, answer: output({ stdout: LINUX_LISTING }) }]);
        const outcome = await browseRemoteDirectory("/srv/saves", options(runner, { os: "linux" }));
        if (!outcome.ok) throw new Error(outcome.message);

        const fresh = entryNamed(outcome.listing.entries, "FreshWorld");
        expect(fresh.world.hasLevelDat).toBe(true);
        expect(fresh.world.regionDimensions).toEqual([]);
        expect(fresh.world.looksLikeWorld).toBe(false);
    });

    it("never claims a world from a region folder alone", async () => {
        const runner = fakeRunner([{ when: /'sh' '-c'/, answer: output({ stdout: LINUX_LISTING }) }]);
        const outcome = await browseRemoteDirectory("/srv/saves", options(runner, { os: "linux" }));
        if (!outcome.ok) throw new Error(outcome.message);

        const holder = entryNamed(outcome.listing.entries, "JustARegionHolder");
        expect(holder.world.hasLevelDat).toBe(false);
        expect(holder.world.regionDimensions).toEqual(["region"]);
        expect(holder.world.looksLikeWorld).toBe(false);
    });

    it("never probes the world signal through a symlink", async () => {
        const runner = fakeRunner([{ when: /'sh' '-c'/, answer: output({ stdout: LINUX_LISTING }) }]);
        const outcome = await browseRemoteDirectory("/srv/saves", options(runner, { os: "linux" }));
        if (!outcome.ok) throw new Error(outcome.message);

        const link = entryNamed(outcome.listing.entries, "LinkedFolder");
        expect(link.symlink).toBe(true);
        expect(link.world.looksLikeWorld).toBe(false);
        expect(link.world.hasLevelDat).toBe(false);
    });

    it("reports a path that does not exist", async () => {
        const runner = fakeRunner([
            { when: /'sh' '-c'/, answer: output({ ok: false, exitCode: 2, stdout: "MB_ERR:NOENT\n" }) },
        ]);
        const outcome = await browseRemoteDirectory("/srv/gone", options(runner, { os: "linux" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("not-found");
    });

    it("reports a path that is a file rather than a folder", async () => {
        const runner = fakeRunner([
            { when: /'sh' '-c'/, answer: output({ ok: false, exitCode: 3, stdout: "MB_ERR:NOTDIR\n" }) },
        ]);
        const outcome = await browseRemoteDirectory("/srv/a-file", options(runner, { os: "linux" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("not-a-directory");
    });

    it("reports a folder this account is not allowed to read", async () => {
        const runner = fakeRunner([
            { when: /'sh' '-c'/, answer: output({ ok: false, exitCode: 4, stdout: "MB_ERR:DENIED\n" }) },
        ]);
        const outcome = await browseRemoteDirectory("/root/private", options(runner, { os: "linux" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("permission-denied");
    });

    it("reports a symlink that never resolves, distinctly from a missing path", async () => {
        const runner = fakeRunner([
            { when: /'sh' '-c'/, answer: output({ ok: false, exitCode: 5, stdout: "MB_ERR:LOOP\n" }) },
        ]);
        const outcome = await browseRemoteDirectory("/srv/loopy", options(runner, { os: "linux" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("symlink-loop");
    });

    it("reports the connection itself being unreachable, not a missing folder", async () => {
        const runner = fakeRunner([{ when: /'sh' '-c'/, answer: SSH_UNREACHABLE }]);
        const outcome = await browseRemoteDirectory("/srv/saves", options(runner, { os: "linux" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("unreachable");
    });

    it("stays fast and reports truncation for a directory of thousands of entries", async () => {
        const rows: string[] = [];
        for (let index = 0; index < DEFAULT_MAX_ENTRIES; index += 1) {
            rows.push(`E\tf\t0\t10\t1690000000\t0\t\tfile-${String(index)}.txt`);
        }
        rows.push(`T\t3000\t${String(DEFAULT_MAX_ENTRIES)}`);
        const stdout = `${rows.join("\n")}\n`;

        const runner = fakeRunner([{ when: /'sh' '-c'/, answer: output({ stdout }) }]);
        const started = Date.now();
        const outcome = await browseRemoteDirectory("/srv/huge", options(runner, { os: "linux" }));
        expect(Date.now() - started).toBeLessThan(2000);
        if (!outcome.ok) throw new Error(outcome.message);
        expect(outcome.listing.entries).toHaveLength(DEFAULT_MAX_ENTRIES);
        expect(outcome.listing.totalEntries).toBe(3000);
        expect(outcome.listing.truncated).toBe(true);
    });

    it("dispatches to the Linux script when detection says Linux", async () => {
        const runner = fakeRunner([
            { when: /'uname' '-s'/, answer: output({ stdout: "Linux\n" }) },
            { when: /'sh' '-c'/, answer: output({ stdout: LINUX_LISTING }) },
        ]);
        const outcome = await browseRemoteDirectory("/srv/saves", options(runner));
        expect(outcome.ok).toBe(true);
        if (outcome.ok) expect(outcome.listing.os).toBe("linux");
    });
});

/* -------------------------------------------------------------------------- */
/* A Windows remote                                                           */
/* -------------------------------------------------------------------------- */

function windowsSuccessJson(): string {
    return JSON.stringify({
        ok: true,
        total: 4,
        truncated: false,
        entries: [
            {
                name: "Bastion",
                directory: true,
                symlink: false,
                size: null,
                modified: "2023-07-22T00:00:00.000Z",
                hasLevelDat: true,
                regionDims: ["region", "DIM-1/region"],
            },
            {
                name: "FreshWorld",
                directory: true,
                symlink: false,
                size: null,
                modified: "2023-07-22T00:00:01.000Z",
                hasLevelDat: true,
                regionDims: [],
            },
            {
                name: "notes.txt",
                directory: false,
                symlink: false,
                size: 4321,
                modified: "2023-07-22T00:00:02.000Z",
                hasLevelDat: false,
                regionDims: [],
            },
            {
                name: "LinkedFolder",
                directory: true,
                symlink: true,
                size: null,
                modified: "2023-07-22T00:00:03.000Z",
                hasLevelDat: false,
                regionDims: [],
            },
        ],
    });
}

describe("a Windows remote", () => {
    it("parses the PowerShell script's JSON, over -EncodedCommand rather than remote quoting", async () => {
        const runner = fakeRunner([
            { when: /powershell.*-EncodedCommand/, answer: output({ stdout: windowsSuccessJson() }) },
        ]);
        const outcome = await browseRemoteDirectory("C:\\Users\\renderer\\saves", options(runner, { os: "windows" }));
        if (!outcome.ok) throw new Error(outcome.message);

        expect(outcome.listing.os).toBe("windows");
        expect(outcome.listing.separator).toBe("\\");
        expect(outcome.listing.entries).toHaveLength(4);

        const bastion = entryNamed(outcome.listing.entries, "Bastion");
        expect(bastion.world.looksLikeWorld).toBe(true);
        expect(bastion.world.regionDimensions).toEqual(["region", "DIM-1/region"]);

        const fresh = entryNamed(outcome.listing.entries, "FreshWorld");
        expect(fresh.world.looksLikeWorld).toBe(false);

        const notes = entryNamed(outcome.listing.entries, "notes.txt");
        expect(notes.sizeBytes).toBe(4321);
        expect(notes.directory).toBe(false);

        const link = entryNamed(outcome.listing.entries, "LinkedFolder");
        expect(link.world.looksLikeWorld).toBe(false);
    });

    it("never quotes the encoded command, so it survives cmd.exe as the login shell", async () => {
        const runner = fakeRunner([
            { when: /powershell.*-EncodedCommand/, answer: output({ stdout: windowsSuccessJson() }) },
        ]);
        await browseRemoteDirectory("C:\\Users\\renderer\\saves", options(runner, { os: "windows" }));
        const sent = runner.text();
        // The encoded blob and every surrounding word arrive completely unquoted: no `'`
        // wraps `powershell` or the blob, which is what makes this survive a cmd.exe login
        // shell that has no idea what a single-quoted argument means.
        expect(sent).toMatch(/(?<!')\bpowershell\b(?!')/);
        expect(sent).not.toMatch(/'powershell'/);
    });

    it("reports a path that does not exist", async () => {
        const runner = fakeRunner([
            {
                when: /powershell.*-EncodedCommand/,
                answer: output({ stdout: JSON.stringify({ ok: false, error: "NOENT" }) }),
            },
        ]);
        const outcome = await browseRemoteDirectory("C:\\gone", options(runner, { os: "windows" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("not-found");
    });

    it("reports a path that is a file rather than a folder", async () => {
        const runner = fakeRunner([
            {
                when: /powershell.*-EncodedCommand/,
                answer: output({ stdout: JSON.stringify({ ok: false, error: "NOTDIR" }) }),
            },
        ]);
        const outcome = await browseRemoteDirectory("C:\\a-file.txt", options(runner, { os: "windows" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("not-a-directory");
    });

    it("reports a folder this account is not allowed to read", async () => {
        const runner = fakeRunner([
            {
                when: /powershell.*-EncodedCommand/,
                answer: output({ stdout: JSON.stringify({ ok: false, error: "DENIED" }) }),
            },
        ]);
        const outcome = await browseRemoteDirectory("C:\\Windows\\System32\\config", options(runner, { os: "windows" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("permission-denied");
    });

    it("reports a symlink that never resolves", async () => {
        const runner = fakeRunner([
            {
                when: /powershell.*-EncodedCommand/,
                answer: output({ stdout: JSON.stringify({ ok: false, error: "LOOP" }) }),
            },
        ]);
        const outcome = await browseRemoteDirectory("C:\\loopy", options(runner, { os: "windows" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("symlink-loop");
    });

    it("reports the connection itself being unreachable", async () => {
        const runner = fakeRunner([{ when: /powershell.*-EncodedCommand/, answer: SSH_UNREACHABLE }]);
        const outcome = await browseRemoteDirectory("C:\\saves", options(runner, { os: "windows" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("unreachable");
    });

    it("reports truncation for a directory of thousands of entries", async () => {
        const entries = [];
        for (let index = 0; index < DEFAULT_MAX_ENTRIES; index += 1) {
            entries.push({
                name: `file-${String(index)}.txt`,
                directory: false,
                symlink: false,
                size: 10,
                modified: "2023-07-22T00:00:00.000Z",
                hasLevelDat: false,
                regionDims: [],
            });
        }
        const json = JSON.stringify({ ok: true, total: 5000, truncated: true, entries });
        const runner = fakeRunner([{ when: /powershell.*-EncodedCommand/, answer: output({ stdout: json }) }]);
        const outcome = await browseRemoteDirectory("C:\\huge", options(runner, { os: "windows" }));
        if (!outcome.ok) throw new Error(outcome.message);
        expect(outcome.listing.entries).toHaveLength(DEFAULT_MAX_ENTRIES);
        expect(outcome.listing.totalEntries).toBe(5000);
        expect(outcome.listing.truncated).toBe(true);
    });

    it("dispatches to the Windows script when detection finds no uname", async () => {
        const runner = fakeRunner([
            { when: /'uname' '-s'/, answer: output({ ok: false, exitCode: 127, stderr: "not found" }) },
            { when: /powershell.*-EncodedCommand/, answer: output({ stdout: windowsSuccessJson() }) },
        ]);
        const outcome = await browseRemoteDirectory("C:\\Users\\renderer\\saves", options(runner));
        expect(outcome.ok).toBe(true);
        if (outcome.ok) expect(outcome.listing.os).toBe("windows");
    });
});

/* -------------------------------------------------------------------------- */
/* Path handling                                                              */
/* -------------------------------------------------------------------------- */

describe("remoteSeparator", () => {
    it("is a forward slash for Linux and a backslash for Windows", () => {
        expect(remoteSeparator("linux")).toBe("/");
        expect(remoteSeparator("windows")).toBe("\\");
    });
});

describe("browseRemoteDirectory", () => {
    it("refuses an empty path without ever spawning a command", async () => {
        const runner = fakeRunner([]);
        const outcome = await browseRemoteDirectory("   ", options(runner, { os: "linux" }));
        expect(outcome.ok).toBe(false);
        if (outcome.ok) throw new Error("expected a failure");
        expect(outcome.code).toBe("not-found");
        expect(runner.calls).toHaveLength(0);
    });
});

describe("parseLinuxListing", () => {
    it("rejoins a name that contains a tab from the fields past the fixed six", () => {
        const { rows } = parseLinuxListing("E\tf\t0\t1\t1690000000\t0\t\tweird\tname.txt\n");
        expect(rows).toHaveLength(1);
        expect(rows[0]?.name).toBe("weird\tname.txt");
    });

    it("ignores a blank line and an unrecognised record type", () => {
        const { rows, total } = parseLinuxListing("\nX\tsomething\nT\t2\t2\n");
        expect(rows).toHaveLength(0);
        expect(total).toBe(2);
    });
});

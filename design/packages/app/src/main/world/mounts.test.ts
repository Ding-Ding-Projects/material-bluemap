/**
 * The list of Minecraft folders worlds are offered from.
 *
 * Three properties are worth more than the rest and each has its own case below: that a
 * folder handed over at either level resolves to the same place, that the list survives a
 * restart, and that unmounting is not a deletion. The last one is checked the only way it
 * can honestly be checked - by looking at the disk afterwards - because "it does not
 * delete anything" is exactly the sort of claim a comment can make and a bug can break.
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    defaultLabelFor,
    folderIdFor,
    labelMinecraftFolder,
    listMinecraftFolders,
    mountMinecraftFolder,
    resolveMinecraftFolder,
    unmountMinecraftFolder,
} from "./mounts.js";

let root = "";
let storeFile = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-mounts-"));
    storeFile = join(root, "userData", "minecraft-folders.json");
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** A `.minecraft` with a `saves` inside it and the named worlds in that. */
async function makeInstallation(name: string, worlds: readonly string[]): Promise<string> {
    const installation = join(root, name);
    for (const world of worlds) {
        await mkdir(join(installation, "saves", world), { recursive: true });
        await writeFile(join(installation, "saves", world, "level.dat"), "");
    }
    if (worlds.length === 0) await mkdir(join(installation, "saves"), { recursive: true });
    return installation;
}

/** The list options for a machine with no Minecraft of its own, so only mounts show up. */
function options(): { platform: NodeJS.Platform; env: NodeJS.ProcessEnv; home: string; storeFile: string } {
    return { platform: "linux", env: {}, home: "", storeFile };
}

/* -------------------------------------------------------------------------- */

describe("mounting a folder at either level", () => {
    it("takes a Minecraft installation and finds the saves folder inside it", async () => {
        const installation = await makeInstallation("modded", ["Bastion"]);

        const resolved = await resolveMinecraftFolder(installation);

        expect(resolved).toEqual({
            ok: true,
            savesPath: join(installation, "saves"),
            resolution: "installation",
        });
    });

    it("takes the saves folder directly, which is the same intent", async () => {
        const installation = await makeInstallation("vanilla", ["Bastion"]);

        const resolved = await resolveMinecraftFolder(join(installation, "saves"));

        expect(resolved).toEqual({
            ok: true,
            savesPath: join(installation, "saves"),
            resolution: "saves",
        });
    });

    it("takes an empty saves folder, because a fresh installation has one", async () => {
        const installation = await makeInstallation("fresh", []);

        const resolved = await resolveMinecraftFolder(join(installation, "saves"));

        expect(resolved.ok).toBe(true);
    });

    it("refuses one world with a sentence saying so, since that is the mistake people make", async () => {
        const installation = await makeInstallation("vanilla", ["Bastion"]);
        const world = join(installation, "saves", "Bastion");

        const resolved = await resolveMinecraftFolder(world);

        expect(resolved.ok).toBe(false);
        if (!resolved.ok) {
            expect(resolved.message).toContain("one world rather than a folder of worlds");
            // It names the folder to mount instead, rather than leaving them to work it out.
            expect(resolved.message).toContain(join(installation, "saves"));
        }
    });

    it("refuses a folder that is neither, naming what was expected", async () => {
        const elsewhere = join(root, "documents");
        await mkdir(elsewhere, { recursive: true });

        const resolved = await resolveMinecraftFolder(elsewhere);

        expect(resolved.ok).toBe(false);
        if (!resolved.ok) expect(resolved.message).toContain("neither a Minecraft installation nor a saves folder");
    });

    it("refuses a relative path rather than resolving it against wherever the app started", async () => {
        const resolved = await resolveMinecraftFolder("saves");

        expect(resolved.ok).toBe(false);
        if (!resolved.ok) expect(resolved.message).toContain("not a full path");
    });

    it("refuses a folder that is not there, by name", async () => {
        const resolved = await resolveMinecraftFolder(join(root, "unplugged"));

        expect(resolved.ok).toBe(false);
        if (!resolved.ok) expect(resolved.message).toContain("There is no folder at");
    });
});

describe("the stored list", () => {
    it("keeps a mounted folder across a restart", async () => {
        const installation = await makeInstallation("modded", ["Bastion"]);
        await mountMinecraftFolder(installation, options());

        // A second read with nothing in memory, which is what the next launch is.
        const folders = await listMinecraftFolders(options());

        expect(folders).toHaveLength(1);
        expect(folders[0]).toMatchObject({
            savesPath: join(installation, "saves"),
            resolution: "installation",
            builtIn: false,
            state: "ok",
        });
    });

    it("names a folder after the directory above saves, since every one of them is called saves", async () => {
        expect(defaultLabelFor("/home/ada/.minecraft/saves")).toBe(".minecraft");
        expect(defaultLabelFor("D:\\Instances\\Modded 1.20\\.minecraft\\saves")).toBe(".minecraft");
    });

    it("does not add the same folder twice, however it was named the second time", async () => {
        const installation = await makeInstallation("modded", ["Bastion"]);
        await mountMinecraftFolder(installation, options());

        // The same folder, reached at the other level. One folder, one row.
        const again = await mountMinecraftFolder(join(installation, "saves"), options());

        expect(again.ok).toBe(true);
        if (again.ok) expect(again.alreadyMounted).toBe(true);
        expect(await listMinecraftFolders(options())).toHaveLength(1);
    });

    it("renames a folder, and puts the generated name back when the label is emptied", async () => {
        const installation = await makeInstallation("modded", ["Bastion"]);
        const mounted = await mountMinecraftFolder(installation, options());
        expect(mounted.ok).toBe(true);

        const id = folderIdFor(join(installation, "saves"));
        await labelMinecraftFolder(id, "Modded 1.20", storeFile);
        expect((await listMinecraftFolders(options()))[0]?.label).toBe("Modded 1.20");

        await labelMinecraftFolder(id, "   ", storeFile);
        expect((await listMinecraftFolders(options()))[0]?.label).toBe("modded");
    });

    it("survives a store file that is missing, empty or nonsense", async () => {
        expect(await listMinecraftFolders(options())).toEqual([]);

        await mkdir(join(root, "userData"), { recursive: true });
        await writeFile(storeFile, "");
        expect(await listMinecraftFolders(options())).toEqual([]);

        await writeFile(storeFile, "{ this is not json");
        expect(await listMinecraftFolders(options())).toEqual([]);

        await writeFile(storeFile, JSON.stringify({ version: 1, mounts: [{ nonsense: true }, 7, null] }));
        expect(await listMinecraftFolders(options())).toEqual([]);
    });

    it("remembers nothing, and says so, when there is nowhere to remember it", async () => {
        const installation = await makeInstallation("modded", ["Bastion"]);

        const mounted = await mountMinecraftFolder(installation, { ...options(), storeFile: null });

        // The mount itself still resolves, so the caller can report honestly rather than
        // pretending; what it must not do is claim to have stored something it did not.
        expect(mounted.ok).toBe(true);
        expect(await listMinecraftFolders({ ...options(), storeFile: null })).toEqual([]);
    });
});

describe("unmounting", () => {
    it("takes the row off the list", async () => {
        const installation = await makeInstallation("modded", ["Bastion"]);
        await mountMinecraftFolder(installation, options());
        const id = folderIdFor(join(installation, "saves"));

        expect(await unmountMinecraftFolder(id, storeFile)).toBe(true);
        expect(await listMinecraftFolders(options())).toEqual([]);
    });

    it("leaves every world exactly where it was", async () => {
        // The claim the whole feature's copy rests on, checked against the disk rather
        // than against a comment. "Unmount", next to a list of somebody's worlds, reads as
        // "delete" to a reasonable person, and being right about that is the point.
        const installation = await makeInstallation("modded", ["Bastion", "Creative Test"]);
        await mountMinecraftFolder(installation, options());

        await unmountMinecraftFolder(folderIdFor(join(installation, "saves")), storeFile);

        expect((await readdir(join(installation, "saves"))).sort()).toEqual(["Bastion", "Creative Test"]);
    });

    it("reports false for a folder that was never in the list", async () => {
        expect(await unmountMinecraftFolder("mount:deadbeef", storeFile)).toBe(false);
    });
});

describe("a folder that has gone away", () => {
    it("keeps its row and says it is missing, rather than quietly forgetting it", async () => {
        // A world archive on an external drive is missing every time the drive is
        // unplugged. An application that unmounts it over that has thrown away a setting
        // on the strength of a cable.
        const installation = await makeInstallation("external", ["Bastion"]);
        await mountMinecraftFolder(installation, options());
        await rm(installation, { recursive: true, force: true });

        const folders = await listMinecraftFolders(options());

        expect(folders).toHaveLength(1);
        expect(folders[0]?.state).toBe("missing");
        expect(folders[0]?.savesPath).toBe(join(installation, "saves"));
    });

    it("reports a path that is a file as one, rather than as missing", async () => {
        const file = join(root, "not-a-folder");
        await writeFile(file, "");
        await mkdir(join(root, "pretend", "saves", "Bastion"), { recursive: true });
        await writeFile(join(root, "pretend", "saves", "Bastion", "level.dat"), "");
        await mountMinecraftFolder(join(root, "pretend"), options());

        // Replace the saves folder with a file, which is what an interrupted copy leaves.
        await rm(join(root, "pretend", "saves"), { recursive: true, force: true });
        await writeFile(join(root, "pretend", "saves"), "");

        expect((await listMinecraftFolders(options()))[0]?.state).toBe("not-a-folder");
    });
});

describe("mounting a launcher root with several instances", () => {
    /** `<root>/minecraft/Instances/<name>/saves`, mirroring CurseForge's real layout. */
    async function makeLauncherRoot(rootName: string, instances: Record<string, readonly string[]>): Promise<string> {
        const launcherRoot = join(root, rootName);
        for (const [name, worlds] of Object.entries(instances)) {
            const instance = join(launcherRoot, "minecraft", "Instances", name);
            for (const world of worlds) {
                await mkdir(join(instance, "saves", world), { recursive: true });
                await writeFile(join(instance, "saves", world, "level.dat"), "");
            }
            if (worlds.length === 0) await mkdir(join(instance, "saves"), { recursive: true });
        }
        return launcherRoot;
    }

    it("mounts every instance as its own folder, in one call", async () => {
        const launcherRoot = await makeLauncherRoot("curseforge", {
            "Day Teet": ["Bastion"],
            "All the Mods 9": [],
        });

        const result = await mountMinecraftFolder(launcherRoot, options());

        expect(result.ok).toBe(true);
        const folders = await listMinecraftFolders(options());
        expect(folders.map((folder) => folder.label).sort()).toEqual(["All the Mods 9", "Day Teet"]);
        expect(folders.every((folder) => folder.builtIn === false)).toBe(true);
    });

    it("finds worlds in each instance separately, once scanned", async () => {
        const launcherRoot = await makeLauncherRoot("curseforge", {
            "Day Teet": ["Bastion", "Creative Test"],
            "All the Mods 9": ["Base Camp"],
        });

        await mountMinecraftFolder(launcherRoot, options());
        const folders = await listMinecraftFolders(options());

        const dayTeet = folders.find((folder) => folder.label === "Day Teet");
        const atm9 = folders.find((folder) => folder.label === "All the Mods 9");
        expect(dayTeet?.savesPath.endsWith(join("Day Teet", "saves"))).toBe(true);
        expect(atm9?.savesPath.endsWith(join("All the Mods 9", "saves"))).toBe(true);
        expect(dayTeet?.savesPath).not.toBe(atm9?.savesPath);
    });

    it("mounts only the new instance when the root is mounted again after a new one appears", async () => {
        const launcherRoot = await makeLauncherRoot("curseforge", { "Day Teet": ["Bastion"] });
        await mountMinecraftFolder(launcherRoot, options());

        await mkdir(join(launcherRoot, "minecraft", "Instances", "New Pack", "saves"), { recursive: true });
        const second = await mountMinecraftFolder(launcherRoot, options());

        expect(second.ok).toBe(true);
        if (second.ok) expect(second.folder.label).toBe("New Pack");
        const folders = await listMinecraftFolders(options());
        expect(folders.map((folder) => folder.label).sort()).toEqual(["Day Teet", "New Pack"]);
    });

    it("reports already mounted when every instance is already in the list", async () => {
        const launcherRoot = await makeLauncherRoot("curseforge", { "Day Teet": ["Bastion"] });
        await mountMinecraftFolder(launcherRoot, options());

        const second = await mountMinecraftFolder(launcherRoot, options());

        expect(second.ok).toBe(true);
        if (second.ok) expect(second.alreadyMounted).toBe(true);
        expect(await listMinecraftFolders(options())).toHaveLength(1);
    });

    it("unmounting one instance leaves the others, and touches nothing on disk", async () => {
        const launcherRoot = await makeLauncherRoot("curseforge", {
            "Day Teet": ["Bastion"],
            "All the Mods 9": ["Base"],
        });
        await mountMinecraftFolder(launcherRoot, options());
        const folders = await listMinecraftFolders(options());
        const dayTeet = folders.find((folder) => folder.label === "Day Teet");
        expect(dayTeet).toBeDefined();

        await unmountMinecraftFolder(dayTeet!.id, storeFile);

        const after = await listMinecraftFolders(options());
        expect(after.map((folder) => folder.label)).toEqual(["All the Mods 9"]);
        expect(await readdir(join(launcherRoot, "minecraft", "Instances", "Day Teet", "saves"))).toEqual(["Bastion"]);
    });
});

describe("the detected default folder", () => {
    it("is listed even when it does not exist, so the interface can say where it looked", async () => {
        const home = join(root, "home", "ada");
        const folders = await listMinecraftFolders({ platform: "linux", env: {}, home, storeFile });

        expect(folders).toHaveLength(1);
        expect(folders[0]).toMatchObject({
            builtIn: true,
            origin: "home",
            state: "missing",
            // Built with posix rules deliberately: the platform being asked about is Linux,
            // and answering with this runner's separators is exactly the bug the platform
            // parameter exists to prevent.
            savesPath: posix.join(home, ".minecraft", "saves"),
        });
    });

    it("is renameable, and keeps that name across a restart", async () => {
        const listOptions = { platform: "linux" as const, env: {}, home: join(root, "home", "ada"), storeFile };
        await labelMinecraftFolder("default:home", "My install", storeFile);

        const folders = await listMinecraftFolders(listOptions);

        expect(folders[0]?.label).toBe("My install");
        expect(folders[0]?.labelled).toBe(true);
    });

    it("swallows a mounted folder that is the same place, so it appears once", async () => {
        const home = join(root, "home", "ada");
        await mkdir(join(home, ".minecraft", "saves", "Bastion"), { recursive: true });
        await writeFile(join(home, ".minecraft", "saves", "Bastion", "level.dat"), "");
        const listOptions = { platform: "linux" as const, env: {}, home, storeFile };

        await mountMinecraftFolder(join(home, ".minecraft"), listOptions);

        const folders = await listMinecraftFolders(listOptions);
        expect(folders).toHaveLength(1);
        expect(folders[0]?.builtIn).toBe(true);
    });

    /**
     * The three cases below (`expands the CurseForge default root...`, `picks up a new
     * CurseForge instance...`, `lists Bedrock's worlds folder...`) can only be proven for
     * real on an actual Windows machine, and are gated to run only there.
     *
     * `locations.ts`'s `defaultLauncherRoots`/`defaultMinecraftFolders` deliberately build
     * these two candidates with `path.win32.join` whenever `platform: "win32"` is asked
     * for, precisely so the *string* is honest about Windows from a Linux runner too - see
     * that file's own header and `locations.test.ts`, which already proves that string
     * construction on every platform with no disk involved. The trap is one level up: this
     * file's `folderState`/`detectLauncherRoot` then hand that backslash-joined string
     * straight to real `fs.lstat`/`fs.opendir`. On Windows a backslash is a real separator
     * and the call resolves. On a POSIX runner it is an ordinary filename character, not a
     * separator - `fs.lstat("\\tmp\\...\\curseforge\\minecraft")` looks for one file
     * literally named that, relative to the working directory, and never finds the fixture
     * this test built with `mkdir`/`join` (which used real `/` on that runner). No amount
     * of fixture engineering closes that gap: a win32-shaped nested directory tree cannot
     * be created, or found again, on a filesystem where `\` is not a separator. Rather than
     * let that architecture mismatch read as a passing test that proves nothing (or a
     * failing one that blames the code), these three are `skipIf`'d off of every runner but
     * a real Windows one - the same "real machine, opt-in, never decides the CI verdict"
     * shape `bedrock/convert.e2e.test.ts` and `render/orchestrator.realJvm.test.ts` already
     * use, just gated on the platform capability rather than an environment flag.
     *
     * The recursive scanning these candidates share (`detectLauncherRoot`: case-insensitive
     * `Instances` lookup, three ways in, the `MAX_INSTANCES` cap) is proven on every
     * platform already, in `launcherRoots.test.ts`, and the "offer it only when it is
     * really there" loop these two feed into is proven on every platform too, by "only
     * offers a portable installation that is really there" below. What only a real Windows
     * machine can additionally prove is that the win32-joined candidate this file computes
     * really does resolve against a real Windows filesystem end to end.
     */
    it.skipIf(process.platform !== "win32")(
        "expands the CurseForge default root into one row per instance, unprompted",
        async () => {
            const home = join(root, "home", "ada");
            const instancesRoot = join(home, "curseforge", "minecraft", "Instances");
            await mkdir(join(instancesRoot, "Day Teet", "saves", "Bastion"), { recursive: true });
            await writeFile(join(instancesRoot, "Day Teet", "saves", "Bastion", "level.dat"), "");
            await mkdir(join(instancesRoot, "All the Mods 9", "saves"), { recursive: true });

            const folders = await listMinecraftFolders({ platform: "win32", env: {}, home, storeFile });
            const curseforge = folders.filter((folder) => folder.origin === "curseforge-default");

            const labels = curseforge.map((folder) => folder.label).sort();
            expect(labels).toEqual(["All the Mods 9", "Day Teet"]);
            expect(curseforge.every((folder) => folder.builtIn)).toBe(true);
        },
    );

    it("says nothing at all about CurseForge when it is not installed, rather than a permanent missing row", async () => {
        const home = join(root, "home", "ada");
        const folders = await listMinecraftFolders({ platform: "win32", env: {}, home, storeFile });

        expect(folders.some((folder) => folder.origin === "curseforge-default")).toBe(false);
    });

    // Same real-Windows-only constraint as "expands the CurseForge default root..." above:
    // this reads the win32-joined candidate against a real filesystem a second time, to
    // prove the list is recomputed rather than cached, which needs the same real disk.
    it.skipIf(process.platform !== "win32")(
        "picks up a new CurseForge instance on the very next read, with nothing remounted",
        async () => {
            const home = join(root, "home", "ada");
            const instancesRoot = join(home, "curseforge", "minecraft", "Instances");
            await mkdir(join(instancesRoot, "Day Teet", "saves"), { recursive: true });

            const before = await listMinecraftFolders({ platform: "win32", env: {}, home, storeFile });
            expect(before.filter((folder) => folder.origin === "curseforge-default")).toHaveLength(1);

            await mkdir(join(instancesRoot, "New Pack", "saves"), { recursive: true });
            const after = await listMinecraftFolders({ platform: "win32", env: {}, home, storeFile });

            const curseforge = after.filter((folder) => folder.origin === "curseforge-default");
            expect(curseforge.map((folder) => folder.label).sort()).toEqual(["Day Teet", "New Pack"]);
        },
    );

    it("is absent, not a missing row, when Bedrock's package folder is not on this machine", async () => {
        const folders = await listMinecraftFolders({
            platform: "win32",
            env: { APPDATA: join(root, "appdata") },
            home: join(root, "home", "ada"),
            storeFile,
        });

        expect(folders.some((folder) => folder.origin === "bedrock-appdata")).toBe(false);
    });

    // Same real-Windows-only constraint as the CurseForge cases above: `defaultMinecraftFolders`
    // builds this candidate with `path.win32.join` too, for the identical reason, and it needs
    // the identical real filesystem to resolve against the fixture below.
    it.skipIf(process.platform !== "win32")(
        "lists Bedrock's worlds folder when the packaged-app storage is really there",
        async () => {
            const localAppData = join(root, "local");
            await mkdir(
                join(localAppData, "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe", "LocalState", "games", "com.mojang", "minecraftWorlds"),
                { recursive: true },
            );

            const folders = await listMinecraftFolders({
                platform: "win32",
                env: { APPDATA: join(root, "appdata"), LOCALAPPDATA: localAppData },
                storeFile,
            });

            const bedrock = folders.find((folder) => folder.origin === "bedrock-appdata");
            expect(bedrock?.state).toBe("ok");
            expect(bedrock?.savesPath.endsWith("minecraftWorlds")).toBe(true);
        },
    );

    it("only offers a portable installation that is really there", async () => {
        const beside = join(root, "portable");
        const absent = await listMinecraftFolders({
            platform: "linux",
            env: {},
            home: "",
            executableDirectory: beside,
            storeFile,
        });
        expect(absent).toEqual([]);

        await mkdir(join(beside, ".minecraft", "saves"), { recursive: true });
        const present = await listMinecraftFolders({
            platform: "linux",
            env: {},
            home: "",
            executableDirectory: beside,
            storeFile,
        });
        expect(present.map((folder) => folder.origin)).toEqual(["beside-executable"]);
    });
});

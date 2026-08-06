/**
 * The launcher-root shape, built from real files rather than guessed at.
 *
 * The directory tree these tests build under a temp folder mirrors what was actually found
 * on a development machine with CurseForge installed: `minecraft/Instances/<name>/saves`,
 * each instance carrying a `minecraftinstance.json` beside its `saves`. That file is never
 * read here - only its presence on the real machine is why this shape is trusted at all.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectLauncherRoot } from "./launcherRoots.js";

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-launcher-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** One instance folder, with a `saves` holding the named worlds and a marker file beside it. */
async function makeInstance(instancesRoot: string, name: string, worlds: readonly string[]): Promise<void> {
    const instance = join(instancesRoot, name);
    await mkdir(instance, { recursive: true });
    await writeFile(join(instance, "minecraftinstance.json"), "{}");
    for (const world of worlds) {
        await mkdir(join(instance, "saves", world), { recursive: true });
        await writeFile(join(instance, "saves", world, "level.dat"), "");
    }
    if (worlds.length === 0) await mkdir(join(instance, "saves"), { recursive: true });
}

describe("a launcher root shaped like CurseForge's real layout", () => {
    it("finds every instance when pointed at the launcher's per-game folder", async () => {
        const minecraftFolder = join(root, "curseforge", "minecraft");
        await makeInstance(join(minecraftFolder, "Instances"), "Day Teet", ["Bastion"]);
        await makeInstance(join(minecraftFolder, "Instances"), "All the Mods 9", []);

        const found = await detectLauncherRoot(minecraftFolder);

        expect(found).not.toBeNull();
        expect(found?.map((instance) => instance.name).sort()).toEqual(["All the Mods 9", "Day Teet"]);
        expect(found?.find((instance) => instance.name === "Day Teet")?.savesPath).toBe(
            join(minecraftFolder, "Instances", "Day Teet", "saves"),
        );
    });

    it("finds them from the outer launcher root too, one level above the per-game folder", async () => {
        const curseforgeRoot = join(root, "curseforge");
        await makeInstance(join(curseforgeRoot, "minecraft", "Instances"), "Day Teet", ["Bastion"]);

        const found = await detectLauncherRoot(curseforgeRoot);

        expect(found?.map((instance) => instance.name)).toEqual(["Day Teet"]);
    });

    it("finds them when pointed straight at the Instances directory", async () => {
        const instancesDir = join(root, "curseforge", "minecraft", "Instances");
        await makeInstance(instancesDir, "Day Teet", ["Bastion"]);

        const found = await detectLauncherRoot(instancesDir);

        expect(found?.map((instance) => instance.name)).toEqual(["Day Teet"]);
    });

    it("is case-insensitive about the Instances directory name, as Windows itself is", async () => {
        const minecraftFolder = join(root, "curseforge", "minecraft");
        await makeInstance(join(minecraftFolder, "instances"), "Day Teet", ["Bastion"]);

        const found = await detectLauncherRoot(minecraftFolder);

        expect(found?.map((instance) => instance.name)).toEqual(["Day Teet"]);
    });

    it("recognises the shape regardless of the launcher's own name", async () => {
        // The check is the shape, not a hardcoded launcher name - a folder from a launcher
        // this repository never verified, but that happens to share the same
        // Instances/<name>/saves convention, is still recognised.
        const root2 = join(root, "some-other-launcher");
        await makeInstance(join(root2, "Instances"), "My Pack", ["World"]);

        const found = await detectLauncherRoot(root2);

        expect(found?.map((instance) => instance.name)).toEqual(["My Pack"]);
    });

    it("lists an instance even before it has ever been played, saves folder and all", async () => {
        const minecraftFolder = join(root, "curseforge", "minecraft");
        await makeInstance(join(minecraftFolder, "Instances"), "Fresh Pack", []);

        const found = await detectLauncherRoot(minecraftFolder);

        expect(found?.map((instance) => instance.name)).toEqual(["Fresh Pack"]);
    });
});

describe("something that is not a launcher root", () => {
    it("returns null for a folder with no Instances directory anywhere near it", async () => {
        const elsewhere = join(root, "documents");
        await mkdir(elsewhere, { recursive: true });

        expect(await detectLauncherRoot(elsewhere)).toBeNull();
    });

    it("returns null for a folder that does not exist", async () => {
        expect(await detectLauncherRoot(join(root, "nowhere"))).toBeNull();
    });

    it("returns null for an Instances directory with nothing inside it", async () => {
        const instancesDir = join(root, "minecraft", "Instances");
        await mkdir(instancesDir, { recursive: true });

        expect(await detectLauncherRoot(instancesDir)).toBeNull();
    });

    it("caps the number of instances read from one root", async () => {
        const instancesDir = join(root, "minecraft", "Instances");
        for (let index = 0; index < 130; index += 1) {
            await mkdir(join(instancesDir, `Pack ${index}`), { recursive: true });
        }

        const found = await detectLauncherRoot(instancesDir);

        expect(found?.length).toBe(128);
    });
});

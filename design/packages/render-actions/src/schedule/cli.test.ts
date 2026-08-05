/**
 * The argument-parsing and I/O layer around `fingerprint`, `schedule-due` and
 * `schedule-check` - the three commands `.github/workflows/scheduled-render.yml` calls.
 * The decisions themselves are covered in `cadence.test.ts` and `changeCheck.test.ts`; this
 * checks that the CLI wires flags to those functions and writes what `$GITHUB_OUTPUT`
 * needs, the same way `cli.test.ts` covers `resolveShardDirectories`.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Args } from "../cli.js";
import { commandFingerprint, commandScheduleCheck, commandScheduleDue } from "../cli.js";

function args(flags: Record<string, string> = {}, booleans: string[] = []): Args {
    return {
        flags: new Map(Object.entries(flags)),
        repeated: new Map(),
        booleans: new Set(booleans),
    };
}

async function readOutputs(path: string): Promise<Record<string, string>> {
    const raw = await readFile(path, "utf8");
    const values: Record<string, string> = {};
    for (const line of raw.split("\n")) {
        if (line.trim() === "") continue;
        const [key, ...rest] = line.split("=");
        if (key !== undefined) values[key] = rest.join("=");
    }
    return values;
}

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "render-actions-schedule-cli-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("fingerprint command", () => {
    it("hashes a checked-out world and writes digest/files/bytes to $GITHUB_OUTPUT", async () => {
        const world = join(root, "world");
        await mkdir(join(world, "region"), { recursive: true });
        await writeFile(join(world, "level.dat"), "level");
        await writeFile(join(world, "region", "r.0.0.mca"), "aaaa");

        const outputPath = join(root, "gh-output");
        const code = await commandFingerprint(args({ world, "github-output": outputPath }));
        expect(code).toBe(0);

        const outputs = await readOutputs(outputPath);
        expect(outputs["digest"]).toMatch(/^v1:[0-9a-f]{64}$/);
        expect(outputs["files"]).toBe("2");
    });

    it("also writes the full fingerprint json to --out when given", async () => {
        const world = join(root, "world");
        await mkdir(world, { recursive: true });
        await writeFile(join(world, "level.dat"), "level");

        const outPath = join(root, "fingerprint.json");
        await commandFingerprint(args({ world, out: outPath }));

        const written = JSON.parse(await readFile(outPath, "utf8")) as { digest: string };
        expect(written.digest).toMatch(/^v1:/);
    });
});

describe("schedule-due command", () => {
    it("refuses a cadence outside the small honest set", async () => {
        const code = await commandScheduleDue(args({ cadence: "0 * * * *" }));
        expect(code).toBe(2);
    });

    it("is due when nothing was checked before, and says so on $GITHUB_OUTPUT", async () => {
        const outputPath = join(root, "gh-output");
        const code = await commandScheduleDue(args({ cadence: "daily", "github-output": outputPath }));
        expect(code).toBe(0);
        expect((await readOutputs(outputPath))["due"]).toBe("true");
    });

    it("is not due before the cadence's interval has passed", async () => {
        const outputPath = join(root, "gh-output");
        await commandScheduleDue(
            args({
                cadence: "daily",
                "last-check-at": "2026-08-05T00:00:00Z",
                now: "2026-08-05T01:00:00Z",
                "github-output": outputPath,
            }),
        );
        expect((await readOutputs(outputPath))["due"]).toBe("false");
    });
});

describe("schedule-check command", () => {
    it("treats a missing --current as the world not being found, and fails the step", async () => {
        const previousPath = join(root, "previous.json");
        await writeFile(previousPath, JSON.stringify({ digest: "v1:aa" }));

        const outputPath = join(root, "gh-output");
        const code = await commandScheduleCheck(
            args({ kind: "repository", previous: previousPath, "github-output": outputPath }),
        );
        expect(code).toBe(1);
        expect((await readOutputs(outputPath))["result"]).toBe("error");
    });

    it("reads two snapshot files and reports 'changed' on $GITHUB_OUTPUT", async () => {
        const previousPath = join(root, "previous.json");
        const currentPath = join(root, "current.json");
        await writeFile(previousPath, JSON.stringify({ digest: "v1:aa" }));
        await writeFile(currentPath, JSON.stringify({ digest: "v1:bb" }));

        const outputPath = join(root, "gh-output");
        const code = await commandScheduleCheck(
            args({
                kind: "repository",
                previous: previousPath,
                current: currentPath,
                "github-output": outputPath,
            }),
        );
        expect(code).toBe(0);
        const outputs = await readOutputs(outputPath);
        expect(outputs["result"]).toBe("changed");
        expect(outputs["changed"]).toBe("true");
    });

    it("treats an omitted --previous as no earlier baseline, which is also 'changed'", async () => {
        const currentPath = join(root, "current.json");
        await writeFile(currentPath, JSON.stringify({ digest: "v1:aa" }));

        const outputPath = join(root, "gh-output");
        await commandScheduleCheck(args({ kind: "repository", current: currentPath, "github-output": outputPath }));
        expect((await readOutputs(outputPath))["result"]).toBe("changed");
    });
});

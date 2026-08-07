/**
 * The packaged app has to actually carry a CLI jar, or every local render fails
 * instantly with "The BlueMap engine is not installed" on every installer this
 * project has ever produced. Regression coverage for that: the packaging config and
 * the CI workflow that feeds it are wired to the same staging directory `jars.ts`
 * resolves at runtime, so a future edit to either side that breaks the link is caught
 * here rather than on a fresh install months later.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { bundledJarDirectory, findRepoRoot, stagingJarDirectory } from "./jars.js";

const require = createRequire(import.meta.url);

// This module lives at <repo>/design/packages/app/src/main/java/.
const thisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(thisDir, "../../../../../..");
const appDir = resolve(repoRoot, "design", "packages", "app");
const packagingConfigPath = resolve(appDir, "electron-builder.config.cjs");

describe("electron-builder bundles the CLI jar into resources/jars", () => {
    // Sanity check on the fixture itself: findRepoRoot has to actually reach this
    // checkout's root, or the rest of this test would be comparing paths that were
    // never going to match anyway.
    it("finds this checkout's root from this module's own directory", () => {
        expect(findRepoRoot(thisDir)).toBe(repoRoot);
    });

    it("has an extraResources entry whose destination is \"jars\"", () => {
        const config = require(packagingConfigPath);
        const entries: { from: string; to: string }[] = config.extraResources ?? [];
        const jarsEntry = entries.find((entry) => entry.to === "jars");

        expect(jarsEntry, "electron-builder.config.cjs has no extraResources entry copying to \"jars\"").toBeDefined();

        // `bundledJarDirectory` is what a packaged app reads back at runtime
        // (`resourcesPath/jars`), so the "to" side is fixed by that contract: it must
        // land at the last path segment of whatever bundledJarDirectory produces.
        expect(jarsEntry!.to).toBe(bundledJarDirectory("").replace(/^[/\\]/, ""));

        // The "from" side must be the exact directory `tools/build-jars.mjs` stages
        // into on a workstation - the same one `stagingJarDirectory` resolves at
        // runtime for a checkout - so CI staging the jar there before packaging is
        // what electron-builder actually bundles, and a developer's local
        // `tools/build-jars.mjs` run bundles the same way.
        const resolvedFrom = resolve(appDir, jarsEntry!.from);
        expect(resolvedFrom).toBe(stagingJarDirectory(repoRoot));
    });

    it("keeps every Windows signing route disabled and clears inherited signing inputs", () => {
        const signingKeys = [
            "CSC_LINK",
            "CSC_KEY_PASSWORD",
            "WIN_CSC_LINK",
            "WIN_CSC_KEY_PASSWORD",
            "CSC_IDENTITY_AUTO_DISCOVERY",
        ] as const;
        const previous = new Map(signingKeys.map((key) => [key, process.env[key]]));
        try {
            for (const key of signingKeys) process.env[key] = "must-not-reach-the-packager";
            delete require.cache[require.resolve(packagingConfigPath)];
            const config = require(packagingConfigPath);

            expect(config.forceCodeSigning).toBe(false);
            expect(config.win?.signExecutable).toBe(false);
            expect(config.win?.signAndEditExecutable).toBe(false);
            for (const key of signingKeys) expect(process.env[key], key).toBeUndefined();
        } finally {
            for (const [key, value] of previous) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
            delete require.cache[require.resolve(packagingConfigPath)];
        }
    });
});

describe("CI stages the CLI jar before packaging", () => {
    const workflowPath = resolve(repoRoot, ".github", "workflows", "ci.yml");
    const workflow = readFileSync(workflowPath, "utf8");

    /** The `package:` job block, up to the next top-level (unindented) job key. */
    function packageJobBlock(): string {
        const lines = workflow.split("\n");
        const start = lines.findIndex((line) => /^  package:\s*$/.test(line));
        expect(start, "ci.yml has no top-level \"package:\" job").toBeGreaterThanOrEqual(0);
        let end = lines.length;
        for (let i = start + 1; i < lines.length; i++) {
            const line = lines[i] ?? "";
            if (/^  [A-Za-z][\w-]*:\s*$/.test(line)) {
                end = i;
                break;
            }
        }
        return lines.slice(start, end).join("\n");
    }

    it("makes the Windows installer job depend on the jars job", () => {
        const block = packageJobBlock();
        expect(
            block,
            "the package job does not declare a dependency on the jars job, so it can run and " +
                "package an installer before the CLI jar even exists",
        ).toMatch(/needs:\s*\[[^\]]*\bjars\b[^\]]*\]/);
    });

    it("downloads the bluemap-jar-cli artifact somewhere before packaging runs", () => {
        const block = packageJobBlock();
        const downloadIndex = block.search(/name:\s*bluemap-jar-cli/);
        const makeIndex = block.indexOf("pnpm run make");
        expect(downloadIndex, "the package job never downloads the bluemap-jar-cli artifact").toBeGreaterThan(-1);
        expect(makeIndex, "the package job never runs \"pnpm run make\"").toBeGreaterThan(-1);
        expect(
            downloadIndex,
            "the CLI jar is downloaded after electron-builder already ran, which is too late to be bundled",
        ).toBeLessThan(makeIndex);
    });

    it("stages the downloaded jar into the same directory jars.ts resolves for a checkout", () => {
        const block = packageJobBlock();
        // The relative path from tools/oracle/out/jars, expressed the way the workflow
        // writes it (repository-root relative, forward slashes).
        expect(
            block,
            "the package job never stages a jar into tools/oracle/out/jars, which is the directory " +
                "both jars.ts and electron-builder.config.cjs expect",
        ).toContain("tools/oracle/out/jars");
    });
});

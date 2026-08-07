/**
 * Regression coverage for the repository this build's update feed asks.
 *
 * `main/index.ts:611` used to hardcode `"Ding-Ding-Projects/worldlens"` as the
 * literal passed to `resolveFeed`'s `repository` field - baked into all 114 installers
 * published so far. `build.mjs` now decides that value once, at bundle time, with
 * `resolveBuildRepository`, and hands it to esbuild's `define` so every occurrence of the
 * `__WORLDLENS_REPOSITORY__` identifier in the bundled source is replaced with it
 * before the file is written (see `src/main/globals.d.ts` for why the identifier needs no
 * import, and `build.mjs` for the CI/override/fallback rules).
 *
 * Two things could make that silently wrong, and each gets its own coverage here:
 *
 *  1. The value `resolveBuildRepository` picks might never actually reach the URL the
 *     bundle asks - a typo in the `define` key, or `index.ts` reading the identifier under
 *     a different name, would leave the feed pointed nowhere without any test noticing.
 *     `bundleAndResolveFeed` below reproduces the exact esbuild shape `build.mjs` uses (same
 *     `platform`/`format`/`target`, real `resolveFeed` import, real `define`) against a
 *     throwaway entry point and runs it in a genuine child `node` process, the same
 *     genuine-process discipline `test/zstdMainBundle.test.ts` uses and explains why it
 *     matters for a bundle this shape.
 *  2. The whole point of baking a value in at bundle time is that it can go stale - a
 *     rename, a fork, a second repository publishing the same code - so the runtime escape
 *     hatch (`WORLDLENS_UPDATE_FEED`, plus its legacy alias) has to keep working *no matter what got baked
 *     in*, including a repository that is wrong. The second test below bakes in a
 *     deliberately different, stale-looking repository and proves the override still wins
 *     and the stale value never reaches the URL.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative as relativePath } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { afterAll, describe, expect, it } from "vitest";

import {
    BUILD_LEGACY_REPOSITORY_VARIABLE,
    BUILD_REPOSITORY_VARIABLE,
    DEFAULT_LEGACY_REPOSITORY,
    DEFAULT_REPOSITORY,
    LEGACY_BUILD_REPOSITORY_VARIABLE,
    resolveBuildRepositories,
    resolveBuildRepository,
} from "../build.mjs";

/** `packages/app/`, matching zstdMainBundle.test.ts's own resolution of the same root. */
const appPackageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const feedTsPath = join(appPackageDir, "src", "main", "update", "feed.ts");

const scratchRoot = join(appPackageDir, "test", ".update-feed-injection-scratch");
mkdirSync(scratchRoot, { recursive: true });

interface FeedBundleResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

/**
 * Bundles a throwaway entry point that calls the real `resolveFeed` with a `repository`
 * read from the injected `__WORLDLENS_REPOSITORY__` identifier - exactly how
 * `main/index.ts` does it - defines that identifier the same way `build.mjs` does, and runs
 * the result in a real `node` child process so the reported feed reflects what a genuine
 * bundle would compute, not vite-node's own module semantics.
 */
/**
 * `process.env` with `overrides` layered on top - `undefined` deletes a key rather than
 * setting it to the string `"undefined"`. The child always inherits the parent's real
 * environment (never a bare `{}`), because on Windows a process spawned with no environment
 * at all can fail before it even reaches this test's code, for reasons that have nothing to
 * do with what this test is checking.
 */
function childEnvironment(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
    const env: Record<string, string | undefined> = { ...process.env, ...overrides };
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete env[key];
    }
    return env as NodeJS.ProcessEnv;
}

async function bundleAndResolveFeed(options: {
    workDirPrefix: string;
    injectedRepository: string;
    injectedLegacyRepository: string | null;
    envOverrides: Record<string, string | undefined>;
}): Promise<FeedBundleResult> {
    const workDir = mkdtempSync(join(scratchRoot, `${options.workDirPrefix}-`));
    const entry = join(workDir, "entry.ts");
    const importSpecifier = relativePath(workDir, feedTsPath).split("\\").join("/");

    writeFileSync(
        entry,
        [
            `import { resolveFeed } from ${JSON.stringify(importSpecifier)};`,
            "const resolution = resolveFeed({",
            "  packaged: true,",
            '  platform: "win32",',
            '  arch: "x64",',
            '  version: "9.9.9",',
            "  repository: __WORLDLENS_REPOSITORY__,",
            "  legacyRepository: __WORLDLENS_LEGACY_REPOSITORY__,",
            "  environment: process.env,",
            "});",
            "process.stdout.write(JSON.stringify(resolution));",
            "",
        ].join("\n"),
    );

    const outfile = join(workDir, "bundle.mjs");
    await build({
        entryPoints: [entry],
        outfile,
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node22",
        // Exactly the substitution build.mjs performs for the real bundle.
        define: {
            __WORLDLENS_REPOSITORY__: JSON.stringify(options.injectedRepository),
            __WORLDLENS_LEGACY_REPOSITORY__: JSON.stringify(options.injectedLegacyRepository),
        },
    });

    try {
        const stdout = execFileSync(process.execPath, [outfile], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            env: childEnvironment(options.envOverrides),
        });
        return { status: 0, stdout, stderr: "" };
    } catch (error) {
        const failure = error as { status: number | null; stdout: string; stderr: string };
        return { status: failure.status, stdout: failure.stdout, stderr: failure.stderr };
    }
}

describe("resolveBuildRepository", () => {
    it("prefers an explicit WORLDLENS_BUILD_REPOSITORY over everything else", () => {
        expect(
            resolveBuildRepository({
                WORLDLENS_BUILD_REPOSITORY: "Some-Fork/worldlens",
                GITHUB_REPOSITORY: "Ding-Ding-Projects/worldlens",
                CI: "true",
            }),
        ).toBe("Some-Fork/worldlens");
    });

    it("keeps the legacy build override as the bridge repository", () => {
        expect(
            resolveBuildRepositories({
                [LEGACY_BUILD_REPOSITORY_VARIABLE]: "Some-Fork/material-bluemap",
            }),
        ).toEqual({
            current: DEFAULT_REPOSITORY,
            legacy: "Some-Fork/material-bluemap",
        });
        expect(BUILD_REPOSITORY_VARIABLE).toBe("WORLDLENS_BUILD_REPOSITORY");
        expect(BUILD_LEGACY_REPOSITORY_VARIABLE).toBe("WORLDLENS_LEGACY_BUILD_REPOSITORY");
    });

    it("turns the pre-rename CI repository into the legacy bridge", () => {
        expect(
            resolveBuildRepositories({
                GITHUB_REPOSITORY: DEFAULT_LEGACY_REPOSITORY,
                CI: "true",
            }),
        ).toEqual({ current: DEFAULT_REPOSITORY, legacy: DEFAULT_LEGACY_REPOSITORY });
    });

    it("keeps the old repository as fallback after CI moves to Worldlens", () => {
        expect(
            resolveBuildRepositories({
                GITHUB_REPOSITORY: DEFAULT_REPOSITORY,
                CI: "true",
            }),
        ).toEqual({ current: DEFAULT_REPOSITORY, legacy: DEFAULT_LEGACY_REPOSITORY });
    });

    it("uses an unrelated fork as current without silently falling back to this project's legacy host", () => {
        expect(
            resolveBuildRepositories({ GITHUB_REPOSITORY: "Some-Fork/worldlens", CI: "true" }),
        ).toEqual({ current: "Some-Fork/worldlens", legacy: null });
    });

    it("falls back to the real default repository for a plain local build with no CI signal", () => {
        expect(resolveBuildRepository({})).toBe(DEFAULT_REPOSITORY);
    });

    it("throws rather than guessing when CI is set but GITHUB_REPOSITORY is missing", () => {
        expect(() => resolveBuildRepository({ CI: "true" })).toThrow(/GITHUB_REPOSITORY/);
        expect(() => resolveBuildRepository({ GITHUB_ACTIONS: "true" })).toThrow(
            /GITHUB_REPOSITORY/,
        );
    });

    it("throws on a malformed explicit override instead of shipping it", () => {
        expect(() => resolveBuildRepository({ WORLDLENS_BUILD_REPOSITORY: "not-a-repo" })).toThrow(
            /WORLDLENS_BUILD_REPOSITORY/,
        );
    });

    it("throws on a malformed GITHUB_REPOSITORY instead of shipping it", () => {
        expect(() =>
            resolveBuildRepository({ GITHUB_REPOSITORY: "not-a-repo", CI: "true" }),
        ).toThrow(/GITHUB_REPOSITORY/);
    });
});

describe("the repository build.mjs bakes into the bundle", () => {
    afterAll(() => {
        rmSync(scratchRoot, { recursive: true, force: true });
    });

    it("reaches the update feed URL a real bundle would compute", async () => {
        const injectedRepository = "Ding-Ding-Projects/worldlens";
        const result = await bundleAndResolveFeed({
            workDirPrefix: "reaches-url",
            injectedRepository,
            injectedLegacyRepository: DEFAULT_LEGACY_REPOSITORY,
            // Cleared explicitly so a developer's own shell environment can never leak an
            // override into what is supposed to be the un-overridden case.
            envOverrides: {
                WORLDLENS_UPDATE_FEED: undefined,
                WORLDLENS_DISABLE_UPDATES: undefined,
                MATERIAL_BLUEMAP_UPDATE_FEED: undefined,
                MATERIAL_BLUEMAP_DISABLE_UPDATES: undefined,
            },
        });

        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        const resolution = JSON.parse(result.stdout) as {
            ok: boolean;
            feed?: { url: string };
            legacyFallback?: { url: string } | null;
        };
        expect(resolution.ok).toBe(true);
        expect(resolution.feed?.url).toBe(
            `https://update.electronjs.org/${injectedRepository}/win32-x64/9.9.9`,
        );
        expect(resolution.legacyFallback?.url).toBe(
            `https://update.electronjs.org/${DEFAULT_LEGACY_REPOSITORY}/win32-x64/9.9.9`,
        );
    });

    it("still lets WORLDLENS_UPDATE_FEED override a stale baked-in repository", async () => {
        // Deliberately a repository nobody would want live, so the assertion below proves
        // the override actually replaced it rather than merely matching by coincidence.
        const staleInjectedRepository = "Stale-Owner/pre-rename-repo";
        const overrideUrl = "https://feed.example.test/win32-x64/9.9.9";

        const result = await bundleAndResolveFeed({
            workDirPrefix: "override-wins",
            injectedRepository: staleInjectedRepository,
            injectedLegacyRepository: DEFAULT_LEGACY_REPOSITORY,
            envOverrides: { WORLDLENS_UPDATE_FEED: overrideUrl },
        });

        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        const resolution = JSON.parse(result.stdout) as {
            ok: boolean;
            feed?: { url: string };
            legacyFallback?: { url: string } | null;
        };
        expect(resolution.ok).toBe(true);
        expect(resolution.feed?.url).toBe(overrideUrl);
        expect(resolution.feed?.url).not.toContain("Stale-Owner");
        expect(resolution.legacyFallback).toBeNull();
    });
});

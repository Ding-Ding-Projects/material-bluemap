import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import type { JarFs } from "./jars.js";
import {
    BLUEMAP_IMPLEMENTATIONS,
    bundledJarDirectory,
    findRepoRoot,
    gradleJarDirectory,
    isBlueMapImplementation,
    listBlueMapJars,
    parseJarVersion,
    resolveBlueMapJar,
    resolveCliJar,
    stagingJarDirectory,
    surveyBlueMapJars,
} from "./jars.js";

/**
 * An absolute repository root that is absolute on **both** platforms.
 *
 * `join("C:", "repo")` looks absolute and is not one on POSIX, so `findRepoRoot`'s
 * `resolve()` prefixed the runner's working directory, the walk never reached the
 * anchor, and every assertion here returned null on Linux while passing on Windows.
 * `resolve(sep, "repo")` gives `C:epo` on Windows and `/repo` on Linux.
 */
const REPO = resolve(sep, "repo");

/** A filesystem described as directory -> [file, ...], with modification times. */
function fakeFs(
    tree: Record<string, string[]>,
    mtimes: Record<string, number> = {},
): JarFs {
    const directories = new Set(Object.keys(tree));
    return {
        exists: (path) => directories.has(path) || path === join(REPO, "vendor", "BlueMap", "settings.gradle.kts"),
        readdir: (path) => tree[path] ?? [],
        mtimeMs: (path) => mtimes[path] ?? 0,
    };
}

describe("BLUEMAP_IMPLEMENTATIONS", () => {
    it("carries the CLI and all six platform adapters that D18 commits to", () => {
        expect([...BLUEMAP_IMPLEMENTATIONS]).toEqual([
            "cli",
            "fabric",
            "forge",
            "neoforge",
            "paper",
            "spigot",
            "sponge",
        ]);
    });

    it("narrows a string safely", () => {
        expect(isBlueMapImplementation("cli")).toBe(true);
        expect(isBlueMapImplementation("bukkit")).toBe(false);
    });
});

describe("parseJarVersion", () => {
    it("reads the version out of a shadow jar name", () => {
        // The exact artefact this machine has already built and rendered with.
        expect(parseJarVersion("cli-5.22-27-shadow.jar", "cli")).toBe("5.22-27");
        expect(parseJarVersion("paper-5.22-27-shadow.jar", "paper")).toBe("5.22-27");
    });

    it("reads the version out of upstream's release naming", () => {
        expect(parseJarVersion("bluemap-5.22-27-cli.jar", "cli")).toBe("5.22-27");
    });

    it("ignores the thin jar sitting next to the shadow jar", () => {
        // Running cli-5.22-27.jar fails with NoClassDefFoundError, which reads like a
        // broken install rather than the wrong file having been picked.
        expect(parseJarVersion("cli-5.22-27.jar", "cli")).toBeNull();
        expect(parseJarVersion("cli-5.22-27-sources.jar", "cli")).toBeNull();
        expect(parseJarVersion("cli-5.22-27-javadoc.jar", "cli")).toBeNull();
    });

    it("does not match another implementation's jar", () => {
        expect(parseJarVersion("paper-5.22-27-shadow.jar", "cli")).toBeNull();
        expect(parseJarVersion("bluemap-5.22-27-paper.jar", "cli")).toBeNull();
    });
});

describe("findRepoRoot", () => {
    it("walks up until it sees Git's repository marker", () => {
        const marker = join(REPO, ".git");
        const found = findRepoRoot(
            join(REPO, "design", "packages", "app", "src", "main", "java"),
            (path) => path === marker,
        );
        expect(found).toBe(REPO);
    });

    it("keeps the vendored upstream source as a fallback for exported trees", () => {
        const anchor = join(REPO, "vendor", "BlueMap", "settings.gradle.kts");
        const found = findRepoRoot(
            join(REPO, "design", "packages", "app", "src", "main", "java"),
            (path) => path === anchor,
        );
        expect(found).toBe(REPO);
    });

    it("works from the bundled dist layout too", () => {
        // src/main/java and dist/main are different depths, which is exactly why this
        // is anchored on a marker file rather than on a count of `..` segments.
        const anchor = join(REPO, "vendor", "BlueMap", "settings.gradle.kts");
        expect(findRepoRoot(join(REPO, "design", "packages", "app", "dist", "main"), (path) => path === anchor)).toBe(
            REPO,
        );
    });

    it("returns null outside a checkout instead of walking forever", () => {
        expect(findRepoRoot(join("C:", "Program Files", "Material BlueMap"), () => false)).toBeNull();
    });
});

describe("listBlueMapJars", () => {
    it("finds a jar Gradle left in build/libs", () => {
        const libs = gradleJarDirectory(REPO, "cli");
        const fs = fakeFs({
            [libs]: [
                "cli-5.22-27-shadow.jar",
                "cli-5.22-27.jar",
                "cli-5.22-27-sources.jar",
                "cli-5.22-27-javadoc.jar",
            ],
        });

        const jars = listBlueMapJars("cli", { repoRoot: REPO, fs });
        expect(jars).toHaveLength(1);
        expect(jars[0]?.version).toBe("5.22-27");
        expect(jars[0]?.source).toBe("gradle");
        expect(jars[0]?.path).toBe(join(libs, "cli-5.22-27-shadow.jar"));
    });

    it("prefers the newest when build/libs holds several versions", () => {
        // `git describe` moves the version on every commit, so build/libs accumulates
        // one jar per build. Comparing 5.22-9 against 5.22-27 as text picks the wrong one.
        const libs = gradleJarDirectory(REPO, "cli");
        const fs = fakeFs(
            { [libs]: ["cli-5.22-9-shadow.jar", "cli-5.22-27-shadow.jar"] },
            {
                [join(libs, "cli-5.22-9-shadow.jar")]: 1_000,
                [join(libs, "cli-5.22-27-shadow.jar")]: 2_000,
            },
        );
        expect(listBlueMapJars("cli", { repoRoot: REPO, fs })[0]?.version).toBe("5.22-27");
    });

    it("prefers the packaged app's bundled jars over a checkout on the same machine", () => {
        const resources = join("C:", "Program Files", "Material BlueMap", "resources");
        const fs = fakeFs(
            {
                [bundledJarDirectory(resources)]: ["cli-5.22-30-shadow.jar"],
                [gradleJarDirectory(REPO, "cli")]: ["cli-5.22-27-shadow.jar"],
            },
            {
                [join(bundledJarDirectory(resources), "cli-5.22-30-shadow.jar")]: 1,
                [join(gradleJarDirectory(REPO, "cli"), "cli-5.22-27-shadow.jar")]: 1,
            },
        );

        const jars = listBlueMapJars("cli", { resourcesPath: resources, repoRoot: REPO, fs });
        expect(jars[0]?.source).toBe("bundled");
    });

    it("prefers the staging directory over a raw build directory", () => {
        const fs = fakeFs(
            {
                [stagingJarDirectory(REPO)]: ["cli-5.22-27-shadow.jar"],
                [gradleJarDirectory(REPO, "cli")]: ["cli-5.22-27-shadow.jar"],
            },
            {
                [join(stagingJarDirectory(REPO), "cli-5.22-27-shadow.jar")]: 5,
                [join(gradleJarDirectory(REPO, "cli"), "cli-5.22-27-shadow.jar")]: 5,
            },
        );
        expect(listBlueMapJars("cli", { repoRoot: REPO, fs })[0]?.source).toBe("staged");
    });

    it("returns nothing when nothing has been built", () => {
        expect(listBlueMapJars("cli", { repoRoot: REPO, fs: fakeFs({}) })).toEqual([]);
    });
});

describe("resolveBlueMapJar", () => {
    it("answers for a packaged app and a checkout through the same call", () => {
        const resources = join("C:", "app", "resources");
        const packaged = resolveBlueMapJar("cli", {
            resourcesPath: resources,
            repoRoot: null,
            fs: fakeFs({ [bundledJarDirectory(resources)]: ["cli-5.22-27-shadow.jar"] }),
        });
        expect(packaged.source).toBe("bundled");

        const development = resolveCliJar({
            repoRoot: REPO,
            fs: fakeFs({ [gradleJarDirectory(REPO, "cli")]: ["cli-5.22-27-shadow.jar"] }),
        });
        expect(development.source).toBe("gradle");
        expect(development.version).toBe(packaged.version);
    });

    it("names every directory it searched, and how to fix it", () => {
        let message = "";
        try {
            resolveBlueMapJar("paper", { repoRoot: REPO, fs: fakeFs({}) });
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }
        expect(message).toContain(stagingJarDirectory(REPO));
        expect(message).toContain(gradleJarDirectory(REPO, "paper"));
        expect(message).toContain("node tools/build-jars.mjs");
    });

    it("says so when there is neither a packaged app nor a checkout", () => {
        expect(() => resolveBlueMapJar("cli", { repoRoot: null, fs: fakeFs({}) })).toThrow(
            /no candidate directories exist/,
        );
    });
});

describe("surveyBlueMapJars", () => {
    it("reports present and absent implementations honestly", () => {
        const fs = fakeFs({
            [stagingJarDirectory(REPO)]: ["cli-5.22-27-shadow.jar", "paper-5.22-27-shadow.jar"],
        });
        const survey = surveyBlueMapJars({ repoRoot: REPO, fs });

        expect(survey.cli?.version).toBe("5.22-27");
        expect(survey.paper?.version).toBe("5.22-27");
        expect(survey.sponge).toBeNull();
        expect(Object.keys(survey)).toHaveLength(BLUEMAP_IMPLEMENTATIONS.length);
    });
});

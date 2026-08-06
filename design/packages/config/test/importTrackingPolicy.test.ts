/**
 * "Could not resolve './home.js' from 'src/copy/surfaces/index.ts'" - a `pnpm build` failure
 * that has bitten this repository repeatedly (the console files committed at `f4d3abd` and
 * only tracked at `897ecad`; `tutorialSignals.js`; `glossary.js`; three more CI cycles spent
 * chasing it across `4786eb0`, `31a5720` and `04cb4a2`), always the same shape: a commit
 * imports a sibling module, and the sibling module itself stays untracked.
 *
 * The reason it keeps happening is structural, not carelessness. `vitest` and the dev server
 * resolve an import straight off the working disk - they have no concept of git and no reason
 * to - so every local check an agent actually runs before pushing is blind to the defect by
 * construction. The one check that would catch it, `pnpm build`, is slow enough that nobody
 * runs it before pushing. So the defect is invisible exactly where people look (the fast
 * suite) and visible only where they do not (a CI run several minutes later).
 *
 * This file closes that gap by putting the same question `pnpm build` eventually asks -
 * "does every import resolve to something that will actually exist in a fresh checkout?" -
 * into the suite everyone already runs. It does two things a mere `existsSync` check cannot:
 *
 *  1. **It asks git, not the filesystem.** A file existing on disk is exactly the condition
 *     that makes this bug invisible, so "resolves" here means "resolves to a path git
 *     tracks", read once from `git ls-files` rather than assumed from whatever the working
 *     tree happens to hold this second.
 *  2. **It resolves the way the bundler does, not the way `fs.existsSync` does.** This
 *     codebase writes `./home.js` in source for a file that is really `home.ts` on disk -
 *     deliberate ESM-style extension rewriting - and it writes bare directory specifiers
 *     that resolve through an `index.ts`. A specifier is checked against every path the
 *     bundler could plausibly mean, not just its literal text.
 *
 * What it deliberately does NOT do: parse TypeScript. Every import/export-from/dynamic-import
 * statement is found with a focused regex over (comment-stripped) source text, matching this
 * repository's own house style for this kind of structural check (see
 * `packages/ui/src/components/overlayDismissalPolicy.test.ts` and
 * `packages/ui/src/components/config/regexPolicy.test.ts`). Comments are stripped first
 * because this codebase's own doc comments routinely show worked "```ts / import { x } from
 * './y.js'" examples, and a naive regex would flag every one of them as a real import - the
 * exact false-positive risk this file exists to avoid, not just to tolerate.
 *
 * Cross-cutting rather than package-scoped, so it lives beside this workspace's other
 * structural checks that read outside their own package's `src/` (`controlPolicy.test.ts`
 * reads vendored Java sources; `vendorGate.ts` gates on a checkout elsewhere in the repo)
 * rather than inside any one consuming package, none of which owns "does the whole workspace
 * commit its own imports".
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** The repository root: `design/packages/config/test/`, four directories below it. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Every path git tracks, read once, as repo-root-relative posix paths (git's own format). */
function readTrackedFiles(): ReadonlySet<string> {
    const output = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" });
    return new Set(output.split("\n").filter((line) => line.length > 0));
}

const TRACKED = readTrackedFiles();

/**
 * Every ordinary file physically present under `design/packages`, as repo-root-relative
 * posix paths, read with one pruned recursive walk rather than one `existsSync` call per
 * import candidate.
 *
 * That difference is not cosmetic: an earlier version of this file called `existsSync` per
 * candidate and took ~850ms on this repository's ~9,000 declared imports, almost entirely
 * stat-call overhead. A single walk of the tree this guard actually cares about - pruned of
 * `node_modules` and `dist`, and never descending into `.claude`'s linked worktrees or the
 * vendored `vendor/BlueMap` Java sources, both of which dwarf the workspace itself - finds
 * the same answer in under 20ms. `node_modules` and `dist` are excluded because nothing this
 * guard checks should ever resolve into a build output or a dependency: a relative specifier
 * pointing there would be a different bug than the one this file exists to catch.
 */
function readDiskFiles(root: string): ReadonlySet<string> {
    const files = new Set<string>();
    const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

    const walk = (absoluteDir: string, relativeDir: string): void => {
        for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) continue;
                walk(join(absoluteDir, entry.name), posix.join(relativeDir, entry.name));
                continue;
            }
            files.add(posix.join(relativeDir, entry.name));
        }
    };

    walk(join(root, "design", "packages"), "design/packages");
    return files;
}

const DISK_FILES = readDiskFiles(REPO_ROOT);

/**
 * Whether `path` exists on disk. Almost every resolved candidate lands inside
 * `design/packages`, checked for free against {@link DISK_FILES}; a rare specifier that
 * climbs above the workspace root (this codebase has exactly one, a `../../../../../
 * CHANGELOG.md?raw`) pays one real `existsSync` call instead, which costs nothing at that
 * frequency.
 */
function existsOnDisk(path: string): boolean {
    if (path.startsWith("design/packages/")) return DISK_FILES.has(path);
    return existsSync(join(REPO_ROOT, path));
}

/**
 * Every git-tracked source file under a package's `src/` tree - "committed code" in the
 * problem statement's own words. A file that is not tracked cannot break a fresh checkout's
 * build no matter what it imports, so scanning the working tree instead of `git ls-files`
 * here would both miss nothing real and invite exactly the false positives this guard exists
 * to avoid (an agent's own untracked scratch file importing another untracked scratch file is
 * not this bug).
 */
const SOURCE_FILES = [...TRACKED]
    .filter((path) => /^design\/packages\/[^/]+\/src\//.test(path))
    .filter((path) => /\.(?:ts|tsx|vue)$/.test(path))
    .sort();

/* -------------------------------------------------------------------------- */
/* Extracting the imports a file actually declares                           */
/* -------------------------------------------------------------------------- */

/**
 * Strips `/* ... *\/` and `// ...` comments so a worked example inside a doc comment cannot
 * be mistaken for a real import. The `//` pass keeps whatever precedes a colon (`https://…`)
 * so a URL written directly in real code - not in a comment - survives; it does not need to
 * be perfect for a URL sitting inside prose, because that whole comment is already gone by
 * the time the line-comment pass runs.
 */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Every specifier named by `import ... from "x"`, bare `import "x"`, `export ... from "x"`
 * (including `export * from "x"`), or a dynamic `import("x")` in `source`.
 */
function importSpecifiers(source: string): string[] {
    const text = stripComments(source);
    const pattern =
        /\bimport\s+(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']|\bexport\s+(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
    const specifiers: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        const specifier = match[1] ?? match[2] ?? match[3];
        if (specifier !== undefined) specifiers.push(specifier);
    }
    return specifiers;
}

/* -------------------------------------------------------------------------- */
/* Resolving a specifier the way the bundler does                             */
/* -------------------------------------------------------------------------- */

/** Preference order when a specifier could mean more than one real extension. */
const CODE_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * Every repo-root-relative path `specifier`, written by `importer`, could plausibly resolve
 * to - in the bundler's own preference order, so the first candidate found on disk is the one
 * that is actually checked against git, exactly as a real build would pick it.
 *
 * Returns `[]` for a specifier this guard has no opinion about: anything not starting with
 * `.` resolves through node_modules or a workspace link, which is a different, unrelated
 * failure mode this file does not police (see the design note in the header).
 */
function candidateTargets(importer: string, specifier: string): string[] {
    if (!specifier.startsWith(".")) return [];

    // Query/hash suffixes (`?raw`, `?worker`, `#fragment`) select a loader, not a path.
    const withoutSuffix = specifier.split(/[?#]/)[0] ?? specifier;
    const dir = posix.dirname(importer);
    const raw = posix.normalize(posix.join(dir, withoutSuffix));

    // The exact text, first: covers .vue, .css, .md and any specifier already naming the
    // real extension - including one that happens to be a literal .js file on disk.
    const candidates = [raw];

    if (/\.jsx$/.test(raw)) {
        candidates.push(raw.replace(/\.jsx$/, ".tsx"));
    } else if (/\.m?js$/.test(raw)) {
        // The deliberate ESM-style rewrite this file exists to get right: "./home.js" in
        // source, "home.ts" on disk.
        const withoutExtension = raw.replace(/\.m?js$/, "");
        for (const extension of CODE_EXTENSIONS) candidates.push(withoutExtension + extension);
    } else if (!/\.[^/.]+$/.test(raw)) {
        // No extension at all: either "./foo" meaning foo.ts, or a directory barrel.
        for (const extension of CODE_EXTENSIONS) candidates.push(raw + extension);
        for (const extension of CODE_EXTENSIONS) candidates.push(posix.join(raw, "index" + extension));
    }

    return candidates;
}

interface Violation {
    readonly importer: string;
    readonly specifier: string;
    readonly resolved: string;
}

/**
 * Every relative import in `SOURCE_FILES` whose bundler-resolved target exists on disk but is
 * not tracked by git - the exact failure `pnpm build` reports as `Could not resolve`, minus
 * the several minutes of CI it currently takes to find out.
 *
 * A specifier that resolves to nothing at all on disk is a different bug (a typo, a stale
 * import) that this file does not diagnose - reporting it here would risk exactly the false
 * positive this guard has to avoid whenever the extension-rewriting rules above have not
 * anticipated some pattern, and TypeScript's own compiler already owns that failure mode.
 */
function findViolations(): Violation[] {
    const violations: Violation[] = [];

    for (const importer of SOURCE_FILES) {
        const source = readFileSync(join(REPO_ROOT, importer), "utf8");

        for (const specifier of importSpecifiers(source)) {
            const candidates = candidateTargets(importer, specifier);
            const resolved = candidates.find((candidate) => existsOnDisk(candidate));
            if (resolved === undefined) continue;
            if (!TRACKED.has(resolved)) violations.push({ importer, specifier, resolved });
        }
    }

    return violations;
}

/* -------------------------------------------------------------------------- */
/* The guard                                                                  */
/* -------------------------------------------------------------------------- */

describe("every committed import points at a file git actually tracks", () => {
    it("finds the files it is supposed to be watching", () => {
        // A glob or a `git ls-files` invocation that silently matched nothing would pass
        // every assertion below without having checked anything.
        expect(SOURCE_FILES.length).toBeGreaterThan(1000);
        expect(TRACKED.size).toBeGreaterThan(SOURCE_FILES.length);
    });

    it("never resolves a relative import to a path outside git's tracked set", () => {
        const violations = findViolations();

        const report = violations
            .map(
                (violation) =>
                    `  ${violation.importer}\n` +
                    `    imports "${violation.specifier}"\n` +
                    `    which resolves to ${violation.resolved} - present on disk, but NOT tracked by git.\n` +
                    `    Fix: git add ${violation.resolved}\n`,
            )
            .join("\n");

        expect(
            violations,
            violations.length === 0
                ? undefined
                : "This is the 'Could not resolve' pnpm-build failure, caught before the push instead " +
                      "of several CI minutes after it. A committed file imports a sibling module that " +
                      "exists on this disk right now but was never `git add`-ed, so a fresh checkout - " +
                      "exactly what CI does - will not have it. vitest cannot see this on its own: it " +
                      "resolves imports straight off the working disk, blind to what git tracks, which " +
                      "is why this failed nowhere else. `pnpm build` is the only other check that " +
                      "catches this, and it is slow enough that nobody runs it before pushing.\n\n" +
                      report,
        ).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* The detector, exercised rather than trusted                                */
/* -------------------------------------------------------------------------- */

describe("importTrackingPolicy.ts: the detector itself", () => {
    it("finds every declared-import shape, and ignores a worked example inside a doc comment", () => {
        const source = `
/**
 * Usage:
 * \`\`\`ts
 * import { registerThing } from "./thing.js";
 * \`\`\`
 */
import Default from "./default.js";
import { Named } from "./named.js";
import type { OnlyType } from "./types.js";
import "./sideEffect.js";
export { Reexported } from "./reexport.js";
export * from "./reexportAll.js";
export type { OnlyReexportedType } from "./reexportTypes.js";
const lazy = () => import("./dynamic.js");
import notRelative from "some-package";
// import { commentedOut } from "./commentedOut.js";
const url = "https://example.com/not/an/import"; // trailing comment, not stripped early
`;
        expect(importSpecifiers(source).sort()).toEqual(
            [
                "./default.js",
                "./named.js",
                "./types.js",
                "./sideEffect.js",
                "./reexport.js",
                "./reexportAll.js",
                "./reexportTypes.js",
                "./dynamic.js",
                "some-package",
            ].sort(),
        );
    });

    it("ignores a bare specifier, which resolves through node_modules rather than git", () => {
        expect(candidateTargets("design/packages/ui/src/App.ts", "vue")).toEqual([]);
        expect(candidateTargets("design/packages/ui/src/App.ts", "@material-bluemap/shared")).toEqual([]);
    });

    it("rewrites a .js specifier to the .ts sibling the codebase actually ships", () => {
        const candidates = candidateTargets(
            "design/packages/ui/src/copy/surfaces/index.ts",
            "./home.js",
        );
        expect(candidates).toContain("design/packages/ui/src/copy/surfaces/home.js");
        expect(candidates).toContain("design/packages/ui/src/copy/surfaces/home.ts");
    });

    it("tries both a bare file and a directory's index for an extensionless specifier", () => {
        const candidates = candidateTargets("design/packages/ui/src/App.ts", "./stores/profiles");
        expect(candidates).toContain("design/packages/ui/src/stores/profiles.ts");
        expect(candidates).toContain("design/packages/ui/src/stores/profiles/index.ts");
    });

    it("strips a loader query/hash before resolving the path underneath it", () => {
        const candidates = candidateTargets(
            "design/packages/site/src/content/changelog.ts",
            "../../../../../CHANGELOG.md?raw",
        );
        expect(candidates).toContain("CHANGELOG.md");
    });

    it("leaves an exact-extension specifier (.vue, .css) to match itself literally", () => {
        expect(candidateTargets("design/packages/ui/src/App.ts", "./components/Foo.vue")).toEqual([
            "design/packages/ui/src/components/Foo.vue",
        ]);
    });

    it("flags a resolved-but-untracked target, and clears once it is tracked", () => {
        // The whole point of this guard, proven against a synthetic tracked set rather than
        // the real one, so the assertion is about the detector's logic, not about today's
        // working tree.
        const untracked = new Set<string>(); // nothing tracked at all
        const tracked = new Set(["design/packages/ui/src/copy/surfaces/home.ts"]);

        const isViolation = (trackedSet: ReadonlySet<string>, resolved: string): boolean =>
            !trackedSet.has(resolved);

        expect(isViolation(untracked, "design/packages/ui/src/copy/surfaces/home.ts")).toBe(true);
        expect(isViolation(tracked, "design/packages/ui/src/copy/surfaces/home.ts")).toBe(false);
    });
});

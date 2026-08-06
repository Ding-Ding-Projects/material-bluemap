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
        for (const extension of CODE_EXTENSIONS)
            candidates.push(posix.join(raw, "index" + extension));
    }

    return candidates;
}

/**
 * The first of `candidateTargets(importer, specifier)` that satisfies `exists` - the bundler's
 * own "try the candidates in preference order, take the first real one" resolution, generalized
 * over what "real" means to the caller. The untracked-target guard just below asks the question
 * the working disk can answer (`existsOnDisk`); the binding-level guard further down asks the
 * question only git can answer ("exists in what HEAD actually tracks"). Same walk, different
 * oracle - this is the one piece of resolution logic both checks share, rather than each guard
 * keeping its own copy of `candidateTargets(...).find(...)`.
 */
function resolveTarget(
    importer: string,
    specifier: string,
    exists: (candidate: string) => boolean,
): string | undefined {
    return candidateTargets(importer, specifier).find(exists);
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
            const resolved = resolveTarget(importer, specifier, existsOnDisk);
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

/**
 * `"releaseAppearancePopup" is not exported by "src/components/appearance/useAppearance.ts",
 * imported by "src/components/appearance/AppearanceTarget.vue"` - the `pnpm build` failure that
 * got past the guard above on commit `75f85db`, an hour after that guard landed. The importing
 * file, `AppearanceTarget.vue`, was and is completely innocent: it is tracked, its import is
 * spelled correctly, and it resolves to a tracked target - every question the guard above knows
 * how to ask comes back clean. What was missing was the EXPORT *inside* `useAppearance.ts`: an
 * agent had added the binding on disk, wired the importer to it, committed the importer, and
 * left the file that actually needed to gain the export sitting uncommitted. `useAppearance.ts`
 * was already tracked - not a new file, not a rename - so nothing about "is this path in git"
 * had anything to say about it (the fix for this exact pair of files landed at `2f3f22e`, and
 * this guard exists so the next such pair gets caught here instead of on `pnpm build`).
 *
 * Both bugs are the same species - a commit ships an import without shipping what it imports -
 * wearing a different symptom depending on whether the missing half is a FILE or a BINDING
 * inside an already-tracked file. `git ls-files` only answers the first question. Answering the
 * second means reading the actual committed CONTENT of both sides, which is why every read
 * below goes through `git show`/`git cat-file` rather than `readFileSync`: the working disk is
 * exactly what makes this invisible (it already has the fix, mid-edit, the whole time CI is
 * red), so this is the one place in the file that must never look at it.
 */

/* -------------------------------------------------------------------------- */
/* Binding-level check: does the committed target actually export it?         */
/* -------------------------------------------------------------------------- */

/**
 * The committed (`git show HEAD:<path>`) content of every path in `paths`, read with one
 * `git cat-file --batch` invocation fed `HEAD:<path>` lines on stdin - not one `git show`
 * subprocess per file, which at `SOURCE_FILES`' scale (over a thousand files) would spend most
 * of this guard's runtime on process-spawn overhead rather than on git actually doing anything.
 * `--batch`'s own wire format is length-prefixed (`<sha> <type> <size>\n<contents>\n`, or
 * `<given-name> missing\n` when a path does not exist at that ref), so parsing is done on the
 * raw `Buffer` rather than a decoded string - content is never split on newlines to find where
 * it ends, because the content itself may contain any byte, including a newline that means
 * nothing about where the *next* header begins.
 *
 * A path absent at `HEAD` (impossible for an ordinary `git ls-files` entry, but reachable if a
 * file was `git add`-ed and not yet committed) maps to `undefined` rather than throwing, so
 * every caller skips it the same conservative way as every other "cannot know locally" case in
 * this file.
 */
function readCommittedContents(paths: readonly string[]): ReadonlyMap<string, string | undefined> {
    const result = new Map<string, string | undefined>();
    if (paths.length === 0) return result;

    const input = paths.map((path) => `HEAD:${path}\n`).join("");
    const output = execFileSync("git", ["cat-file", "--batch"], {
        cwd: REPO_ROOT,
        input,
        maxBuffer: 1024 * 1024 * 256,
    });

    const NEWLINE = 0x0a;
    let offset = 0;
    for (const path of paths) {
        const headerEnd = output.indexOf(NEWLINE, offset);
        const header = output.toString("utf8", offset, headerEnd);
        offset = headerEnd + 1;

        if (header.endsWith(" missing")) {
            result.set(path, undefined);
            continue;
        }

        const size = Number(header.slice(header.lastIndexOf(" ") + 1));
        result.set(path, output.toString("utf8", offset, offset + size));
        offset += size + 1; // the object's own trailing LF that `--batch` appends after content
    }

    return result;
}

/** Splits the inside of a `{ ... }` import/export clause into trimmed, non-empty entries. */
function braceEntries(braceContent: string): string[] {
    return braceContent
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

/** An entry beginning with the inline `type` modifier (`{ type X }`, `{ type X as Y }`). */
const TYPE_PREFIX = /^type\s+/;

/**
 * The names required FROM the module a `{ ... }` clause names - the identifier before `as` when
 * present (what the clause asks the target to provide), never the local alias after it. An
 * entry marked `type` is dropped: it is erased before the bundler ever looks for the binding, so
 * it can never be the missing half of this specific bug.
 */
function requiredNamesFromBrace(braceContent: string): string[] {
    const names: string[] = [];
    for (const entry of braceEntries(braceContent)) {
        if (TYPE_PREFIX.test(entry)) continue;
        const name = entry.split(/\s+as\s+/)[0]?.trim();
        if (name) names.push(name);
    }
    return names;
}

interface RequiredBinding {
    readonly specifier: string;
    readonly importedName: string;
}

/**
 * Every named, non-type binding `text` asks a `from "spec"` clause to provide - both an
 * ordinary `import { ... } from "spec"` and a re-export `export { ... } from "spec"`, since
 * both equally require `spec` to actually export the name (rollup reports the re-exporting file
 * as the importer in exactly the same way). A whole-statement `import type { ... }` or
 * `export type { ... } from` contributes nothing, matching the inline-`type` skip above.
 *
 * The import-clause pattern deliberately excludes `;` from what it can cross while hunting for
 * `from`: without that bound, a side-effect-only `import "./x.js";` with no `from` of its own
 * would let the non-greedy search run on into the NEXT statement and misattribute that
 * statement's bindings to whatever `from` it happens to find first. Real statements in this
 * codebase are semicolon-terminated (`.prettierrc.json` sets `"semi": true`), so stopping at the
 * next `;` is exactly the boundary a real import clause never needs to cross.
 */
function requiredBindings(text: string): RequiredBinding[] {
    const required: RequiredBinding[] = [];

    const importFrom = /\bimport\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = importFrom.exec(text)) !== null) {
        const [, wholeType, clause, specifier] = match;
        if (wholeType !== undefined || clause === undefined || specifier === undefined) continue;
        const brace = /\{([^}]*)\}/.exec(clause);
        if (brace?.[1] === undefined) continue;
        for (const importedName of requiredNamesFromBrace(brace[1]))
            required.push({ specifier, importedName });
    }

    const reexportFrom = /\bexport\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
    while ((match = reexportFrom.exec(text)) !== null) {
        const [, wholeType, braceContent, specifier] = match;
        if (wholeType !== undefined || braceContent === undefined || specifier === undefined)
            continue;
        for (const importedName of requiredNamesFromBrace(braceContent))
            required.push({ specifier, importedName });
    }

    return required;
}

interface ExportInfo {
    /** Every name `text` offers as a named export - declared, re-exported, or aliased. */
    readonly names: ReadonlySet<string>;
    /**
     * Whether `text` contains an `export * from "..."` barrel. A binding this file's own
     * patterns cannot find might still flow through that barrel - this file cannot know without
     * chasing the re-export, so a caller must treat the whole file as unable to say a name is
     * missing, not just fall back to "not found".
     */
    readonly opaque: boolean;
}

const STAR_REEXPORT = /\bexport\s*\*\s*(?:as\s+[A-Za-z_$][\w$]*\s+)?from\s*["'][^"']+["']/;

const DECLARATION_EXPORT =
    /\bexport\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function(?:\s*\*\s*|\s+)|class\s+|const\s+enum\s+|const\s+|let\s+|var\s+|type\s+|interface\s+|enum\s+|namespace\s+|module\s+)([A-Za-z_$][\w$]*)/g;

const BRACE_EXPORT = /\bexport\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*["'][^"']*["'])?/g;

/**
 * Every name `text` (a file's own committed content) offers as a named export: `export const X`
 * / `function X` / `class X` / `type X` / `interface X` / `enum X` / `namespace X`, plus every
 * brace form - `export { X }`, `export { Y as X }`, `export { X } from "./other.js"` - taking
 * the identifier AFTER `as` when present, since that is the public name the brace form actually
 * offers (the mirror image of {@link requiredNamesFromBrace}, which wants the name BEFORE `as`).
 *
 * `export default` contributes nothing on purpose: this guard already skips default imports
 * everywhere else (the local name is arbitrary), so a default export never needs to appear in
 * this set. A brace entry's own `type` marker is NOT filtered here, unlike on the import side -
 * a name exported only as a type still occupies this bucket, which is the deliberately lenient
 * half of this file's design: it means a value-import against a type-only export can slip past
 * undetected, but the alternative (also tracking type-vs-value on the export side) risks a wrong
 * classification turning into a false alarm, and this file's standing rule is that a false
 * positive costs more than a rare missed case.
 */
function exportedBindings(text: string): ExportInfo {
    const names = new Set<string>();

    let match: RegExpExecArray | null;
    const declaration = new RegExp(DECLARATION_EXPORT.source, "g");
    while ((match = declaration.exec(text)) !== null) {
        if (match[1]) names.add(match[1]);
    }

    const brace = new RegExp(BRACE_EXPORT.source, "g");
    while ((match = brace.exec(text)) !== null) {
        for (const entry of braceEntries(match[1] ?? "")) {
            const withoutType = entry.replace(TYPE_PREFIX, "");
            const parts = withoutType.split(/\s+as\s+/);
            const exportedName = (parts[parts.length - 1] ?? "").trim();
            if (exportedName) names.add(exportedName);
        }
    }

    return { names, opaque: STAR_REEXPORT.test(text) };
}

interface MissingExportViolation {
    readonly importer: string;
    readonly importedName: string;
    readonly specifier: string;
    readonly target: string;
}

/**
 * Whether `target`'s CURRENT WORKING-TREE content (as opposed to the committed content this
 * whole check is otherwise built to avoid) already has `importedName` - purely to make the
 * failure message honest about which of the two real situations a violation is in: the ordinary
 * "someone forgot to commit the fix" case, versus the export genuinely not existing anywhere
 * yet. Used only for the message; never for the pass/fail decision itself.
 */
function diskExportStatus(target: string, importedName: string): string {
    const absolute = join(REPO_ROOT, target);
    if (!existsSync(absolute)) return "that file does not even exist on this disk right now";
    const info = exportedBindings(stripComments(readFileSync(absolute, "utf8")));
    if (info.opaque) {
        return "the working-tree file re-exports via `export *`, so this cannot be confirmed locally";
    }
    return info.names.has(importedName)
        ? `it DOES exist right there in the working tree - the fix is to \`git add\` and commit ${target}`
        : "it does NOT exist in the working tree either - this export has never actually been written";
}

/**
 * Every named, non-type binding a committed source file imports (or re-exports) from a
 * committed relative target whose own COMMITTED content does not export it - the sibling of
 * {@link findViolations} above, one level deeper. That guard proves the target FILE is tracked;
 * this one proves the target file's committed CONTENT actually has the binding being asked for.
 *
 * Both the importer and every candidate target are read via {@link readCommittedContents}
 * (`git show`/`git cat-file`), never `readFileSync` - the whole point is to answer "what would a
 * fresh clone of this exact commit see", and the working disk is precisely the thing that hides
 * this bug from every other local check. Resolution reuses {@link resolveTarget} with a
 * TRACKED-based existence predicate rather than `existsOnDisk`, for the same reason: candidate
 * selection has to model what a fresh clone's bundler would find, not what this machine's disk
 * happens to hold this second.
 */
function findMissingExportViolations(): MissingExportViolation[] {
    const importerContents = readCommittedContents(SOURCE_FILES);

    const pending: MissingExportViolation[] = [];
    const targetsNeeded = new Set<string>();

    for (const importer of SOURCE_FILES) {
        const committed = importerContents.get(importer);
        if (committed === undefined) continue; // staged but not yet committed: nothing at HEAD to compare

        for (const { specifier, importedName } of requiredBindings(stripComments(committed))) {
            if (!specifier.startsWith(".")) continue;
            const target = resolveTarget(importer, specifier, (candidate) =>
                TRACKED.has(candidate),
            );
            if (target === undefined) continue; // not resolvable against HEAD's own tree - not this check's job
            if (!/\.tsx?$/.test(target)) continue; // export syntax is only regex-legible out of plain TS/TSX
            pending.push({ importer, specifier, importedName, target });
            targetsNeeded.add(target);
        }
    }

    // Almost every resolved target is itself a `SOURCE_FILES` entry - a relative import from
    // one package's `src/` overwhelmingly lands inside a `src/` tree, its own or a sibling's -
    // so its committed content is already sitting in `importerContents` from the read above.
    // Only the rare target that is NOT already in hand (a relative import that climbs outside
    // every `src/` tree entirely) pays for a second, much smaller batch call, rather than every
    // target paying for a second full read of content this function already has.
    const targetContents = new Map<string, string | undefined>(importerContents);
    const stillNeeded = [...targetsNeeded].filter((target) => !targetContents.has(target)).sort();
    for (const [target, content] of readCommittedContents(stillNeeded))
        targetContents.set(target, content);

    const exportsByTarget = new Map<string, ExportInfo>();
    for (const target of targetsNeeded) {
        const content = targetContents.get(target);
        if (content !== undefined)
            exportsByTarget.set(target, exportedBindings(stripComments(content)));
    }

    const violations: MissingExportViolation[] = [];
    for (const { importer, specifier, importedName, target } of pending) {
        const info = exportsByTarget.get(target);
        if (info === undefined) continue; // target's committed content unavailable; nothing to check it against
        if (info.opaque) continue; // `export *` barrel: cannot know locally whether the binding flows through
        if (info.names.has(importedName)) continue;
        violations.push({ importer, importedName, specifier, target });
    }

    return violations;
}

describe("every committed named import binding exists in the committed target", () => {
    it("reads committed content for files it already knows are tracked", () => {
        // A wrong git invocation (bad flags, wrong cwd, an off-by-one in the batch parser) that
        // silently returned nothing for everything would make every assertion below pass
        // without having read anything - the same sanity gate the guard above starts with.
        const [sample] = SOURCE_FILES;
        expect(sample).toBeDefined();
        const content = readCommittedContents([sample as string]).get(sample as string);
        expect(content).toBeDefined();
        expect((content as string).length).toBeGreaterThan(0);
    });

    it("never imports a named, non-type binding that the committed target does not (yet) export", () => {
        const violations = findMissingExportViolations();

        const report = violations
            .map(
                (violation) =>
                    `  ${violation.importer}\n` +
                    `    imports { ${violation.importedName} } from "${violation.specifier}"\n` +
                    `    which resolves to the committed file ${violation.target},\n` +
                    `    but that file's COMMITTED (git HEAD) content does not export "${violation.importedName}".\n` +
                    `    On this disk right now, ${diskExportStatus(violation.target, violation.importedName)}.\n` +
                    `    Fix: commit ${violation.target} - ${violation.importer} is already fine as-is.\n`,
            )
            .join("\n");

        expect(
            violations,
            violations.length === 0
                ? undefined
                : "This is the '\"X\" is not exported by Y, imported by Z' pnpm-build failure - the " +
                      "sibling of the untracked-import guard above, wearing a different symptom. The " +
                      "IMPORTING file is tracked and its import statement is fine; what is missing is the " +
                      "EXPORT inside the target file, which most likely already exists on this disk right " +
                      "now but was never committed. vitest and the dev server resolve straight off the " +
                      "working disk, so they cannot see this any more than the guard above can see an " +
                      "untracked file - and `pnpm build` is, again, the only other check that catches it, " +
                      "several CI minutes later. The fix is always to commit the file that is MISSING the " +
                      "export, never the file that imports it (which is already correct).\n\n" +
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
        expect(
            candidateTargets("design/packages/ui/src/App.ts", "@material-bluemap/shared"),
        ).toEqual([]);
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

describe("importTrackingPolicy.ts: the binding detector itself", () => {
    it("extracts the required (non-type) binding names from import and re-export-from clauses", () => {
        const source = `
import { A, B as C } from "./target.js";
import type { OnlyType } from "./types.js";
import { type InlineType, D } from "./mixed.js";
import Default from "./default.js";
import * as ns from "./namespace.js";
import "./sideEffect.js";
export { E, F as G } from "./barrel.js";
export type { OnlyReexportedType } from "./typesOnly.js";
`;
        expect(
            requiredBindings(source)
                .map((b) => `${b.specifier}:${b.importedName}`)
                .sort(),
        ).toEqual(
            [
                "./target.js:A",
                "./target.js:B",
                "./mixed.js:D",
                "./barrel.js:E",
                "./barrel.js:F",
            ].sort(),
        );
    });

    it("does not let a from-less side-effect import steal a later statement's `from` clause", () => {
        // The exact failure mode the `[^;]*?` bound in requiredBindings exists to prevent: a
        // naive `[\\s\\S]*?` non-greedy search would run straight through the semicolon here
        // looking for the nearest "from", and misattribute the real import below to nothing at
        // all (or worse, duplicate it) instead of leaving the side-effect import contributing
        // nothing, as it should.
        const source = `
import "./sideEffect.js";
import { X } from "./real.js";
`;
        expect(requiredBindings(source)).toEqual([{ specifier: "./real.js", importedName: "X" }]);
    });

    it("extracts every exported name a file offers, taking the alias for `as`, and flags any `export *` as opaque", () => {
        const plain = exportedBindings(`
export const A = 1;
export function B() {}
export class C {}
export type D = string;
export interface E {}
export enum F { X }
export { G };
export { H as I };
export { J } from "./other.js";
export { K as L } from "./other.js";
`);
        expect([...plain.names].sort()).toEqual(
            ["A", "B", "C", "D", "E", "F", "G", "I", "J", "L"].sort(),
        );
        expect(plain.opaque).toBe(false);

        const barrel = exportedBindings(`export * from "./everything.js";`);
        expect(barrel.opaque).toBe(true);
    });

    it("reproduces the real regression: AppearanceTarget.vue importing releaseAppearancePopup from a useAppearance.ts that does not export it yet", () => {
        // The exact shape of commit 75f85db's failure, trimmed to what this file checks.
        const importerText = `
import {
    claimAppearancePopup,
    releaseAppearancePopup,
    useAppearanceTarget,
} from "./useAppearance.js";
`;
        const targetTextBeforeTheFix = `
export function useAppearanceTarget(id: string) { /* ... */ }
export function useRegisteredTarget(info: unknown): void {}
`;

        const required = requiredBindings(importerText);
        const missing = (exported: ExportInfo) =>
            required.filter(
                (binding) => !exported.opaque && !exported.names.has(binding.importedName),
            );

        expect(
            missing(exportedBindings(targetTextBeforeTheFix))
                .map((b) => b.importedName)
                .sort(),
        ).toEqual(["claimAppearancePopup", "releaseAppearancePopup"].sort());

        // And once the fix commit's export lands, both clear - proving this is a live detector
        // of the binding, not a permanent false alarm baked into this pair of files.
        const targetTextAfterTheFix = `${targetTextBeforeTheFix}
export function claimAppearancePopup(close: () => void): void {}
export function releaseAppearancePopup(close: () => void): void {}
`;
        expect(missing(exportedBindings(targetTextAfterTheFix))).toEqual([]);
    });

    it("does not flag a binding exported under an alias via `export { X as Y }`", () => {
        const required = requiredBindings(`import { Y } from "./target.js";`);
        const exported = exportedBindings(`const localName = 1;\nexport { localName as Y };`);
        expect(required.every((b) => exported.names.has(b.importedName))).toBe(true);
    });

    it("does not flag a binding potentially re-exported through an `export *` barrel", () => {
        const required = requiredBindings(`import { AnythingAtAll } from "./barrel.js";`);
        const exported = exportedBindings(`export * from "./somewhereElse.js";`);
        expect(exported.opaque).toBe(true);
        // The guard's own decision logic skips the whole file once it is opaque, regardless of
        // whether the name happens to be in `exported.names` - proven directly, since that is
        // the actual branch `findMissingExportViolations` takes.
        const wouldFlag = required.some(
            (b) => !exported.opaque && !exported.names.has(b.importedName),
        );
        expect(wouldFlag).toBe(false);
    });

    it("ignores a type-only import entirely, whole-statement and inline alike", () => {
        expect(requiredBindings(`import type { NeverChecked } from "./types.js";`)).toEqual([]);
        expect(
            requiredBindings(`import { type NeverChecked, ButThisOne } from "./mixed.js";`).map(
                (b) => b.importedName,
            ),
        ).toEqual(["ButThisOne"]);
    });

    it("reads a batch of committed blobs correctly, including a path missing at HEAD", () => {
        const contents = readCommittedContents([
            "design/packages/config/test/importTrackingPolicy.test.ts",
            "design/packages/__this_path_does_not_exist_anywhere__.ts",
        ]);
        expect(contents.get("design/packages/config/test/importTrackingPolicy.test.ts")).toContain(
            "every committed import points at a file git actually tracks",
        );
        expect(
            contents.get("design/packages/__this_path_does_not_exist_anywhere__.ts"),
        ).toBeUndefined();
    });
});

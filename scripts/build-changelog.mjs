#!/usr/bin/env node
/**
 * Build the changelog from this repository's own git history and its release tags.
 *
 * Nothing here is written by hand and nothing here is invented. Every version comes from a
 * tag that CI actually published, every entry comes from a commit that is actually in the
 * history, and every entry carries the full SHA of that commit so a reader can go and look
 * at it. A version with no commits of its own says exactly that rather than borrowing a
 * neighbour's, and generation fails outright rather than emitting a reference to a commit
 * that cannot be resolved - a wrong SHA is worse than no SHA, because it sends the reader
 * somewhere confidently irrelevant.
 *
 * ### Where the versions come from
 *
 * The release workflow tags every successful build as `v<version>-build.<run>` and publishes
 * a GitHub Release for that tag. The tags are therefore the release record, and they are
 * lightweight tags on the commit that was built, so the date recorded for a version is that
 * commit's own committer date. The GitHub Release itself is published a few minutes later by
 * the same run; that publication timestamp is not recorded here, because taking it would
 * make generation depend on the network and produce a different file offline.
 *
 * A version's entries are the commits reachable from its tag and from no earlier tag. That
 * is deliberately not `previous..current`: three of this repository's tags sit on a side
 * branch that was merged later, and a range expression against the immediately preceding tag
 * alone would either lose those versions' commits or replay them under a later version.
 *
 * ### Where the categories come from
 *
 * From the paths each commit touched, which is a fact about the commit, using the fixed table
 * in {@link CATEGORY_RULES}. The commits in this repository are prose sentences with no
 * `feat:`/`fix:` convention, so an Added/Changed/Fixed classification would have to be
 * inferred from the wording of a subject line - that is interpretation, and interpretation is
 * how a changelog starts saying things nobody wrote. The area a commit changed is derivable
 * without guessing, so that is what is recorded.
 *
 * ### Merge commits
 *
 * A merge is kept as an entry of its own, marked as a summary, carrying the number of commits
 * it brought to the mainline. Its SHA is the commit that completed the change, which is what
 * the entry links, and the commits it summarises are listed under the same version alongside
 * it. Its files are the diff against its first parent, so it is categorised by what it
 * actually brought in rather than by nothing at all.
 *
 * ### Outputs
 *
 * - `CHANGELOG.md` at the repository root: the scannable record, subject plus commit link,
 *   grouped by category under each version.
 * - `design/packages/ui/src/components/changelog/changelogData.ts`: the same record plus each
 *   commit's full message body, which is what the in-app viewer renders and searches.
 *
 * Both are deterministic: no timestamps, no run ids, nothing that changes between two runs
 * over the same history. That is what makes `--check` meaningful in CI.
 *
 * Usage:
 *   node scripts/build-changelog.mjs            # write both outputs
 *   node scripts/build-changelog.mjs --check    # fail if either output is out of date
 *   node scripts/build-changelog.mjs --quiet    # write, without the summary on stdout
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, one level above `scripts/`. */
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Where the commit links resolve. The changelog is useless if they point at a fork. */
const REPOSITORY_URL = "https://github.com/Ding-Ding-Projects/material-bluemap";

const CHANGELOG_PATH = join(REPO_ROOT, "CHANGELOG.md");
const DATA_PATH = join(
    REPO_ROOT,
    "design",
    "packages",
    "ui",
    "src",
    "components",
    "changelog",
    "changelogData.ts",
);

/** Tags this generator recognises as releases. Anything else in `refs/tags` is ignored. */
const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/** Characters that cannot appear in a commit message, used to frame `git log` records. */
const RECORD = "\x1e";
const FIELD = "\x1f";

/**
 * How many hex digits a rendered commit reference uses.
 *
 * Ten is comfortably unambiguous for a repository of this size, and uniqueness across the
 * emitted set is asserted before anything is written, so a future history that manages a
 * collision fails generation instead of shipping two links that look identical.
 */
const SHORT_SHA_LENGTH = 10;

/**
 * The category identifiers, in the order ties are broken and sections are rendered.
 *
 * `design/packages/ui/src/components/changelog/changelogModel.ts` declares the same list as a
 * TypeScript union and the generated module is typed against it, so a category added here and
 * not there fails the type check rather than reaching a viewer that cannot label it.
 */
const CATEGORIES = [
    { id: "interface", label: "Interface" },
    { id: "engine", label: "Rendering and world data" },
    { id: "services", label: "Server, CLI and configuration" },
    { id: "shell", label: "Desktop shell" },
    { id: "site", label: "Landing page and documentation site" },
    { id: "build", label: "Build, release and tooling" },
    { id: "docs", label: "Documentation" },
    { id: "other", label: "Elsewhere in the repository" },
];

const CATEGORY_IDS = CATEGORIES.map((category) => category.id);

/**
 * Path rules, evaluated in this order, first match wins for each changed file.
 *
 * The last rule matches everything, so no file is ever silently dropped from the count. A
 * path that reaches it lands in `other`, which is a visible row in the output rather than a
 * quiet omission - a category table with no catch-all is a table that lies about its total.
 */
const CATEGORY_RULES = [
    { id: "docs", test: (path) => path.endsWith(".md") || path.startsWith("docs/") },
    {
        id: "build",
        test: (path) =>
            path.startsWith(".github/") ||
            path.startsWith("scripts/") ||
            path.startsWith("tools/") ||
            path.startsWith("vendor/") ||
            /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*\.json|eslint\.config\.js|vitest\.config\.ts|vite\.config\.ts|forge\.config\.[cm]?js|\.gitignore|\.gitattributes|\.npmrc)$/.test(
                path,
            ),
    },
    { id: "interface", test: (path) => path.startsWith("design/packages/ui/") },
    { id: "site", test: (path) => path.startsWith("design/packages/site/") },
    { id: "shell", test: (path) => path.startsWith("design/packages/app/") },
    {
        id: "engine",
        test: (path) =>
            /^design\/packages\/(engine|viewer|worldgen|nbt|render-actions|parts)\//.test(path),
    },
    {
        id: "services",
        test: (path) => /^design\/packages\/(server|cli|config|shared)\//.test(path),
    },
    { id: "other", test: () => true },
];

/* -------------------------------------------------------------------------- */
/* git                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One git invocation, decoded as UTF-8.
 *
 * The buffer is raised well past the default megabyte because a single `git log` here carries
 * every commit message in the repository, and the failure mode of the default is a truncated
 * read that parses cleanly into a changelog missing its oldest half.
 */
function git(args) {
    return execFileSync("git", args, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
    });
}

function gitLines(args) {
    return git(args)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

/**
 * Trailing git trailers, removed from a body.
 *
 * `Co-Authored-By:` and friends are metadata about who wrote the commit, not a description of
 * what changed, and leaving them in means every search for a word that happens to appear in a
 * name matches half the changelog. Only a trailing run of `Key: value` lines is removed, so a
 * body that merely contains a colon keeps every word of it.
 */
function stripTrailers(body) {
    const lines = body.replace(/\r\n/g, "\n").split("\n");
    while (lines.length > 0 && (lines.at(-1) ?? "").trim() === "") lines.pop();
    while (lines.length > 0 && /^[A-Za-z][A-Za-z-]*:\s/.test(lines.at(-1) ?? "")) lines.pop();
    while (lines.length > 0 && (lines.at(-1) ?? "").trim() === "") lines.pop();
    return lines.join("\n").trim();
}

/**
 * Every commit reachable from HEAD, with the files it changed.
 *
 * One `git log` rather than one invocation per commit: on Windows the per-process cost of the
 * latter is most of this script's runtime, and the parse is only awkward because a commit body
 * may contain anything at all - hence the ASCII record and field separators, which a commit
 * message cannot contain.
 */
function readCommits() {
    const format = `${RECORD}%H${FIELD}%cI${FIELD}%P${FIELD}%s${FIELD}%b${FIELD}`;
    const raw = git(["log", `--format=${format}`, "--name-only", "--no-renames", "HEAD"]);

    const commits = new Map();
    for (const record of raw.split(RECORD)) {
        if (record.trim().length === 0) continue;
        const parts = record.split(FIELD);
        if (parts.length < 6) throw new Error(`unparsable git log record: ${record.slice(0, 120)}`);
        const [sha, date, parents, subject, body] = parts;
        const files = (parts[5] ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        commits.set(sha, {
            sha,
            date,
            parents: parents.length > 0 ? parents.split(" ") : [],
            subject,
            details: stripTrailers(body ?? ""),
            files,
        });
    }
    return commits;
}

/**
 * Fills in what a merge commit brought to the mainline.
 *
 * `git log --name-only` prints nothing for a merge, which would categorise every merge as
 * having touched no files at all. The diff against the first parent is what the merge actually
 * added to the branch it landed on, and it is also the honest answer to "what did this entry
 * change" for an entry the reader will see linked from the changelog.
 */
function fillMergeFiles(commit) {
    if (commit.parents.length < 2) return;
    commit.files = gitLines([
        "diff",
        "--name-only",
        "--no-renames",
        `${commit.sha}^1`,
        commit.sha,
    ]);
    commit.summarizes = Number(
        git(["rev-list", "--count", `${commit.sha}^1..${commit.sha}`]).trim(),
    );
}

/** Release tags, oldest first, each with the commit it points at. */
function readVersions() {
    const format = ["%(refname:short)", "%(creatordate:iso-strict)", "%(objecttype)", "%(objectname)", "%(*objectname)"].join(FIELD);
    const versions = [];
    for (const line of git(["for-each-ref", "--sort=creatordate", `--format=${format}`, "refs/tags"]).split("\n")) {
        if (line.trim().length === 0) continue;
        const [tag, date, type, objectName, dereferenced] = line.split(FIELD);
        if (!RELEASE_TAG.test(tag ?? "")) continue;
        // An annotated tag's own object is not the commit, so the dereferenced name is used
        // when there is one. Both forms appear in repositories that changed CI along the way.
        const commit = type === "tag" ? (dereferenced ?? "") : (objectName ?? "");
        if (commit.length === 0) throw new Error(`tag ${tag} does not resolve to a commit`);
        versions.push({ tag, version: (tag ?? "").replace(/^v/, ""), date, commit });
    }
    return versions;
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

function categoriseFile(path) {
    for (const rule of CATEGORY_RULES) if (rule.test(path)) return rule.id;
    return "other";
}

/**
 * The category a commit is filed under, and every category it touched.
 *
 * The primary is whichever category holds the most of the commit's changed files, ties broken
 * by the fixed order of {@link CATEGORIES} so the same history always produces the same file.
 * A commit that changed nothing at all - an empty merge, for instance - is `other` rather than
 * being dropped, because dropping it would make the version's entry count disagree with git.
 */
function categorise(files) {
    const counts = new Map();
    for (const path of files) {
        const id = categoriseFile(path);
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const areas = CATEGORY_IDS.filter((id) => counts.has(id)).sort(
        (a, b) =>
            (counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
            CATEGORY_IDS.indexOf(a) - CATEGORY_IDS.indexOf(b),
    );
    return { category: areas[0] ?? "other", areas };
}

function toEntry(commit) {
    const { category, areas } = categorise(commit.files);
    return {
        sha: commit.sha,
        shortSha: commit.sha.slice(0, SHORT_SHA_LENGTH),
        date: commit.date,
        subject: commit.subject,
        details: commit.details,
        category,
        areas,
        files: commit.files.length,
        ...(commit.parents.length > 1 ? { summarizes: commit.summarizes ?? 0 } : {}),
    };
}

/*
 * The generated files cannot describe their own commit without creating a fixed-point loop:
 * writing the changelog changes the commit SHA, which would immediately make the changelog
 * stale again. A commit that changes only these two generated outputs is therefore maintenance
 * noise for this record; the source commit that caused it remains fully represented.
 */
function isGeneratedOnlyCommit(commit) {
    return commit.files.length > 0 && commit.files.every((path) =>
        path === "CHANGELOG.md" || path === "design/packages/ui/src/components/changelog/changelogData.ts",
    );
}

function keepCommit(sha, commits) {
    const commit = commits.get(sha);
    return commit !== undefined && !isGeneratedOnlyCommit(commit);
}

/**
 * Groups a version's commits into their categories, in the fixed category order.
 */
function group(entries) {
    return CATEGORIES.map(({ id, label }) => ({
        id,
        label,
        entries: entries.filter((entry) => entry.category === id),
    })).filter((section) => section.entries.length > 0);
}

/**
 * Assembles every version, newest first, plus whatever sits ahead of the newest tag.
 *
 * The unreleased section is not decoration: work is committed here long before the run that
 * tags it, and a changelog that showed only tagged work would be describing the past while
 * the reader is looking at the present.
 */
function assemble(commits, versions) {
    const seen = new Set();
    const built = [];

    for (const [index, version] of versions.entries()) {
        const exclusions = versions.slice(0, index).map((earlier) => `^${earlier.commit}`);
        const shas = gitLines(["rev-list", "--topo-order", version.commit, ...exclusions])
            .filter((sha) => keepCommit(sha, commits));
        const entries = shas.map((sha) => {
            const commit = commits.get(sha);
            if (commit === undefined) throw new Error(`commit ${sha} is missing from the log`);
            fillMergeFiles(commit);
            seen.add(sha);
            return toEntry(commit);
        });
        built.push({ ...version, entries, sections: group(entries) });
    }

    const head = git(["rev-parse", "HEAD"]).trim();
    const exclusions = versions.map((version) => `^${version.commit}`);
    const unreleasedShas = gitLines(["rev-list", "--topo-order", head, ...exclusions])
        .filter((sha) => keepCommit(sha, commits));
    const unreleasedEntries = unreleasedShas.map((sha) => {
        const commit = commits.get(sha);
        if (commit === undefined) throw new Error(`commit ${sha} is missing from the log`);
        fillMergeFiles(commit);
        seen.add(sha);
        return toEntry(commit);
    });

    built.reverse();
    return {
        unreleased: { entries: unreleasedEntries, sections: group(unreleasedEntries) },
        versions: built,
        covered: seen.size,
    };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Proves every SHA the changelog is about to reference resolves to a commit in this
 * repository, and that no two references render the same.
 *
 * This is the check the whole file exists to pass. `git cat-file --batch-check` is fed every
 * SHA in one pass and answers `missing` for anything it cannot resolve; one missing object
 * aborts generation with the offending reference named, rather than writing a link that would
 * take a reader to a 404 and leave them doubting the entries that were correct.
 */
function validate(model) {
    const entries = [
        ...model.unreleased.entries,
        ...model.versions.flatMap((version) => version.entries),
    ];

    const shas = [...entries.map((entry) => entry.sha), ...model.versions.map((v) => v.commit)];
    const answers = execFileSync("git", ["cat-file", "--batch-check"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        input: shas.map((sha) => `${sha}^{commit}`).join("\n") + "\n",
        maxBuffer: 32 * 1024 * 1024,
    })
        .split("\n")
        .filter((line) => line.trim().length > 0);

    if (answers.length !== shas.length) {
        throw new Error(`cat-file answered ${answers.length} of ${shas.length} references`);
    }
    const dead = [];
    for (const [index, answer] of answers.entries()) {
        if (!/^[0-9a-f]{40} commit \d+$/.test(answer)) dead.push(`${shas[index]}: ${answer}`);
    }
    if (dead.length > 0) {
        throw new Error(
            `refusing to write a changelog with ${dead.length} unresolvable commit reference(s):\n  ` +
                dead.join("\n  "),
        );
    }

    const short = new Map();
    for (const entry of entries) {
        const existing = short.get(entry.shortSha);
        if (existing !== undefined && existing !== entry.sha) {
            throw new Error(
                `two commits render as ${entry.shortSha}: ${existing} and ${entry.sha}. ` +
                    `Raise SHORT_SHA_LENGTH.`,
            );
        }
        short.set(entry.shortSha, entry.sha);
    }

    for (const entry of entries) {
        if (!CATEGORY_IDS.includes(entry.category)) {
            throw new Error(`commit ${entry.sha} has unknown category ${entry.category}`);
        }
    }
    return entries.length;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/** `2026-08-04T00:04:51-04:00` as `2026-08-04`, in the commit's own offset rather than UTC. */
function day(iso) {
    return iso.slice(0, 10);
}

function commitLink(entry) {
    return `[\`${entry.shortSha}\`](${REPOSITORY_URL}/commit/${entry.sha})`;
}

function renderMarkdownEntry(entry) {
    const summary =
        entry.summarizes === undefined
            ? ""
            : ` _(summary of ${entry.summarizes} commit${entry.summarizes === 1 ? "" : "s"}, also listed here)_`;
    return `- ${entry.subject} - ${commitLink(entry)}${summary}`;
}

function renderMarkdownSections(sections, emptyLine) {
    if (sections.length === 0) return `${emptyLine}\n`;
    return sections
        .map(
            (section) =>
                `### ${section.label}\n\n${section.entries.map(renderMarkdownEntry).join("\n")}\n`,
        )
        .join("\n");
}

function renderMarkdown(model) {
    const newest = model.versions[0];
    const head = [
        "# Changelog",
        "",
        "Every entry here is one commit from this repository's history, carrying the full SHA of",
        "that commit so the claim can be checked. Versions are the tags the release workflow",
        "published; a version's entries are the commits reachable from its tag and from no earlier",
        "tag. The date shown is the tagged commit's own date, because the tags are lightweight and",
        "the GitHub Release for a tag is published minutes later by the same run.",
        "",
        "Entries are grouped by the area of the repository they changed, which is derived from the",
        "paths each commit touched. They are deliberately not classified as features or fixes: the",
        "commits here carry no such marker, so any such label would be inferred from the wording of",
        "a subject line, and a changelog that infers is a changelog that eventually says something",
        "nobody wrote.",
        "",
        "This file is generated. Run `node scripts/build-changelog.mjs` to rebuild it, and",
        "`node scripts/build-changelog.mjs --check` to prove it is current. Generation fails rather",
        "than emitting a reference to a commit that cannot be resolved. The same command writes",
        "`design/packages/ui/src/components/changelog/changelogData.ts`, which carries each commit's",
        "full message for the in-app changelog viewer.",
        "",
    ].join("\n");

    const unreleased = [
        "## Unreleased",
        "",
        renderMarkdownSections(
            model.unreleased.sections,
            newest === undefined
                ? "_No commits are recorded yet._"
                : `_No changes have been committed since \`${newest.tag}\`._`,
        ),
    ].join("\n");

    const versions = model.versions.map((version) => {
        const tagged = `Tagged at [\`${version.commit.slice(0, SHORT_SHA_LENGTH)}\`](${REPOSITORY_URL}/commit/${version.commit}).`;
        return [
            `## ${version.version} - ${day(version.date)}`,
            "",
            tagged,
            "",
            renderMarkdownSections(
                version.sections,
                "_No changes were recorded for this version: its tag points at a commit that an earlier tag already covered._",
            ),
        ].join("\n");
    });

    return [head, unreleased, ...versions].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/* -------------------------------------------------------------------------- */
/* The generated TypeScript module                                            */
/* -------------------------------------------------------------------------- */

function literal(value) {
    return JSON.stringify(value);
}

function renderEntry(entry, indent) {
    const pad = " ".repeat(indent);
    const inner = " ".repeat(indent + 4);
    const lines = [
        `${inner}sha: ${literal(entry.sha)},`,
        `${inner}shortSha: ${literal(entry.shortSha)},`,
        `${inner}date: ${literal(entry.date)},`,
        `${inner}subject: ${literal(entry.subject)},`,
        `${inner}details: ${literal(entry.details)},`,
        `${inner}category: ${literal(entry.category)},`,
        `${inner}areas: [${entry.areas.map(literal).join(", ")}],`,
        `${inner}files: ${entry.files},`,
    ];
    if (entry.summarizes !== undefined) lines.push(`${inner}summarizes: ${entry.summarizes},`);
    return `${pad}{\n${lines.join("\n")}\n${pad}}`;
}

function renderData(model) {
    const versions = model.versions
        .map((version) =>
            [
                "    {",
                `        version: ${literal(version.version)},`,
                `        tag: ${literal(version.tag)},`,
                `        date: ${literal(version.date)},`,
                `        commit: ${literal(version.commit)},`,
                "        entries: [",
                version.entries.map((entry) => renderEntry(entry, 12)).join(",\n"),
                "        ],",
                "    }",
            ]
                .filter((line) => line !== "")
                .join("\n"),
        )
        .join(",\n");

    const unreleased =
        model.unreleased.entries.length === 0
            ? "[]"
            : `[\n${model.unreleased.entries.map((entry) => renderEntry(entry, 4)).join(",\n")}\n]`;

    return `/**
 * The changelog, generated from this repository's git history and release tags.
 *
 * Do not edit this file. Run \`node scripts/build-changelog.mjs\` to rebuild it, and
 * \`node scripts/build-changelog.mjs --check\` to prove it is current. That script validates
 * every SHA below against \`git cat-file\` and refuses to write anything it cannot resolve, so
 * every commit reference here is a commit that exists in this repository.
 *
 * The types live in \`./changelogModel.js\` rather than here, so that a category this file
 * cannot name fails the type check instead of reaching a viewer with no label for it.
 */

import type { ChangelogEntry, ChangelogVersion } from "./changelogModel.js";

/** Where a commit reference resolves. */
export const CHANGELOG_REPOSITORY_URL = ${literal(REPOSITORY_URL)};

/**
 * Commits that are in the history but not yet in any tagged release.
 *
 * Empty is the normal state right after a release; it is rendered as an honest "nothing since
 * the last release" line rather than being hidden, because a missing section and an empty one
 * read very differently to somebody checking whether their fix shipped.
 */
export const CHANGELOG_UNRELEASED: readonly ChangelogEntry[] = ${unreleased};

/** Every released version, newest first. */
export const CHANGELOG_VERSIONS: readonly ChangelogVersion[] = [
${versions},
];
`;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

function readIfPresent(path) {
    try {
        return readFileSync(path, "utf8");
    } catch {
        return null;
    }
}

function main(argv) {
    const check = argv.includes("--check");
    const quiet = argv.includes("--quiet");
    for (const arg of argv.slice(2)) {
        if (!["--check", "--quiet"].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    }

    const commits = readCommits();
    const versions = readVersions();
    if (versions.length === 0 && commits.size === 0) {
        throw new Error("this repository has no commits and no release tags to describe");
    }

    const model = assemble(commits, versions);
    const entryCount = validate(model);

    const outputs = [
        { path: CHANGELOG_PATH, text: renderMarkdown(model) },
        { path: DATA_PATH, text: renderData(model) },
    ];

    if (check) {
        const stale = outputs.filter((output) => readIfPresent(output.path) !== output.text);
        if (stale.length > 0) {
            const names = stale.map((output) => output.path.replace(REPO_ROOT, "")).join(", ");
            throw new Error(
                `${names} is out of date. Run \`node scripts/build-changelog.mjs\` and commit the result.`,
            );
        }
        if (!quiet) {
            console.log(`changelog is current: ${versions.length} versions, ${entryCount} entries`);
        }
        return;
    }

    for (const output of outputs) writeFileSync(output.path, output.text, "utf8");

    if (!quiet) {
        const unreleased = model.unreleased.entries.length;
        console.log(
            `wrote ${outputs.length} files: ${versions.length} versions, ${entryCount} entries ` +
                `(${unreleased} unreleased), every SHA resolved`,
        );
        for (const output of outputs) console.log(`  ${output.path.replace(REPO_ROOT, "")}`);
    }
}

try {
    main(process.argv);
} catch (error) {
    console.error(`build-changelog: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}

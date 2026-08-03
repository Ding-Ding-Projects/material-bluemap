#!/usr/bin/env node
/**
 * count-lines.mjs — the committed line counter for material-bluemap.
 *
 * This is the single source of the line-count table that a release publishes. CI runs
 * it over the tagged commit and pastes `--format=markdown` into the release notes, so
 * the number in the notes is produced by the same run that built the artefacts, at
 * exactly the commit being released. Run it locally with no arguments to get the same
 * figures in a human-readable table.
 *
 * Design notes that matter for correctness:
 *
 *  - Lines are counted the way git counts them. A trailing newline terminates the last
 *    line; it does not start a new empty one. `git blame` agrees, which is what lets the
 *    authorship totals balance against the line totals.
 *  - Authorship is per SURVIVING line, via `git blame --line-porcelain` on the working
 *    tree, never by summing added lines from the log. Churn is not authorship: a line
 *    written and later deleted belongs to nobody.
 *  - Nothing is dropped silently. Every tracked path lands in exactly one category row
 *    (there is a catch-all), and every exclusion is printed with the number of tracked
 *    files it removed.
 *
 * Usage:
 *   node scripts/count-lines.mjs                 human-readable table (default)
 *   node scripts/count-lines.mjs --format=markdown
 *   node scripts/count-lines.mjs --no-blame      skip authorship (fast; says so in output)
 *   node scripts/count-lines.mjs --concurrency=8
 *
 * Exits non-zero if the self-check fails, i.e. if the category totals and the authorship
 * totals disagree. An unexplained gap between two numbers in the same table destroys the
 * credibility of both, so a mismatch is a build failure rather than a footnote.
 */

import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const NUL = "\0";
const RECORD_SEPARATOR = "\x1e";
const UNIT_SEPARATOR = "\x1f";
const ZERO_SHA = "0".repeat(40);
const MAX_GIT_BUFFER = 256 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Exclusions — stated, never silent                                          */
/* -------------------------------------------------------------------------- */

/**
 * Paths removed before anything is counted. Each entry reports how many tracked files
 * it actually removed, so "excluded" never means "quietly missing".
 */
const EXCLUSIONS = [
    {
        label: "vendor/ (git submodule)",
        reason: "vendored upstream BlueMap Java sources — read as reference, not this project's code",
        match: (relPath, mode) => mode === "160000" || relPath === "vendor" || relPath.startsWith("vendor/"),
    },
    {
        label: "node_modules/",
        reason: "installed third-party dependencies",
        match: (relPath) => relPath.split("/").includes("node_modules"),
    },
    {
        label: "dist/, out/, release/, .vite/",
        reason: "build output, regenerated from the sources counted below",
        match: (relPath) => {
            const segments = relPath.split("/");
            return ["dist", "out", "release", ".vite"].some((dir) => segments.includes(dir));
        },
    },
    {
        label: "coverage/",
        reason: "test coverage output",
        match: (relPath) => relPath.split("/").includes("coverage"),
    },
    {
        label: "pnpm-lock.yaml, package-lock.json, yarn.lock",
        reason: "dependency lockfiles — a resolver's output, not code anyone wrote",
        match: (relPath) => {
            const base = relPath.split("/").pop();
            return base === "pnpm-lock.yaml" || base === "package-lock.json" || base === "yarn.lock";
        },
    },
];

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `inProjectTotal: false` rows are still counted and still shown — they are simply held
 * out of the "project" total, so a reader can see both what the project is and what the
 * repository holds.
 */
const CATEGORIES = [
    { id: "source", label: "Source (TypeScript / JavaScript)", inProjectTotal: true },
    { id: "tests", label: "Tests", inProjectTotal: true },
    { id: "markup", label: "Styles & markup (SCSS, CSS, HTML, Vue, SVG)", inProjectTotal: true },
    { id: "config", label: "Config & build", inProjectTotal: true },
    { id: "docs", label: "Docs", inProjectTotal: true },
    { id: "other", label: "Other tracked text", inProjectTotal: true },
    { id: "data", label: "Bundled data (not hand-written)", inProjectTotal: false },
    { id: "binary", label: "Binary assets (0 lines by definition)", inProjectTotal: false },
];

const SOURCE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"]);
const MARKUP_EXTENSIONS = new Set(["scss", "css", "sass", "less", "html", "htm", "vue", "svg"]);
const DOC_EXTENSIONS = new Set(["md", "markdown", "txt", "adoc"]);
const DOC_BASENAMES = new Set(["LICENSE", "NOTICE", "COPYING", "AUTHORS", "CHANGELOG"]);
const CONFIG_EXTENSIONS = new Set(["json", "json5", "yaml", "yml", "toml", "ini", "editorconfig"]);
const CONFIG_BASENAMES = new Set([
    ".gitattributes",
    ".gitignore",
    ".gitmodules",
    ".npmrc",
    ".nvmrc",
    "build.mjs",
]);
const DATA_EXTENSIONS = new Set(["conf", "mcmeta", "properties", "lang", "csv", "tsv"]);

/**
 * Trees that hold data rather than code. These are reported on their own row and held
 * out of the project total.
 *
 *  - engine/assets: 366 bundled resource-pack JSONs plus the legacy id/biome/property
 *    mapping tables. Data the renderer reads, not code anybody wrote line by line.
 *  - ui/public: upstream BlueMap's bundled web assets and its 30 translation tables.
 *  - any `fixtures` or `__fixtures__` directory: recorded test inputs.
 */
const DATA_PREFIXES = [
    { prefix: "design/packages/engine/assets/", note: "bundled resource-pack + legacy mapping JSON" },
    { prefix: "design/packages/ui/public/", note: "upstream web assets and translation tables" },
];

/** Packages listed first, in the order the port actually builds them. */
const PACKAGE_ORDER = ["shared", "nbt", "engine", "viewer", "server", "ui", "app", "cli"];

/* -------------------------------------------------------------------------- */
/* Authorship rule                                                             */
/* -------------------------------------------------------------------------- */

/** Author e-mail addresses that identify an automation, not a person. */
const AGENT_EMAIL_PATTERNS = [
    /^noreply@anthropic\.com$/i,
    /\[bot\]@users\.noreply\.github\.com$/i,
    /^[^@]*bot@users\.noreply\.github\.com$/i,
    /@openai\.com$/i,
];

/** Display names that identify an automation, used for authors and for co-author trailers. */
const AGENT_NAME_PATTERNS = [
    /\bclaude\b/i,
    /\bcodex\b/i,
    /\bcopilot\b/i,
    /\bopencode\b/i,
    /\bcursor\b/i,
    /\bdevin\b/i,
    /\baider\b/i,
    /\[bot\]/i,
    /(^|[\s-])bot$/i,
];

const ATTRIBUTION_RULE_TEXT = [
    "Per SURVIVING line, from `git blame --line-porcelain` over the working tree —",
    "never by summing added lines from the log, because churn is not authorship.",
    "A commit counts as agent-written when EITHER",
    "  (1) its author identity is an automation identity — noreply@anthropic.com,",
    "      *[bot]@users.noreply.github.com, or an author name matching",
    "      claude / codex / copilot / opencode / cursor / devin / aider / *[bot]; OR",
    "  (2) its message carries a Co-Authored-By: trailer naming an agent by those same",
    "      patterns.",
    "Everything else counts as human-written.",
];

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Count lines the way git does: a trailing newline terminates the final line rather than
 * starting an empty one. Getting this wrong is the classic cause of the line total and
 * the blame total disagreeing by one per file.
 */
function countLines(text) {
    if (text.length === 0) return { total: 0, nonBlank: 0 };
    let total = 0;
    let nonBlank = 0;
    let start = 0;
    while (start <= text.length) {
        let end = text.indexOf("\n", start);
        const isLast = end === -1;
        if (isLast) end = text.length;
        if (isLast && start === text.length) break; // trailing newline: no extra line
        total += 1;
        // Cheap blank test without allocating a substring for every line.
        let blank = true;
        for (let i = start; i < end; i += 1) {
            const c = text.charCodeAt(i);
            if (c !== 32 && c !== 9 && c !== 13 && c !== 0x0b && c !== 0x0c) {
                blank = false;
                break;
            }
        }
        if (!blank) nonBlank += 1;
        start = end + 1;
    }
    return { total, nonBlank };
}

const utf8Validator = new TextDecoder("utf-8", { fatal: true });

/**
 * Whether a tracked file is binary, i.e. contributes zero lines.
 *
 * "Contains a NUL byte" — git's own quick heuristic — is not good enough here: this
 * repository has a compression test that embeds literal NUL bytes in a string literal,
 * and dropping a 250-line test file out of the count because of three bytes is exactly
 * the kind of silent loss these numbers are supposed to rule out. So a file is binary
 * only when it fails UTF-8 decoding outright, or when NUL bytes are dense enough that it
 * cannot plausibly be text.
 */
function isBinary(buffer) {
    if (buffer.length === 0) return false;
    try {
        utf8Validator.decode(buffer);
    } catch {
        return true;
    }
    let nuls = 0;
    for (let i = 0; i < buffer.length; i += 1) {
        if (buffer[i] === 0) nuls += 1;
    }
    return nuls / buffer.length > 0.01;
}

function extensionOf(basename) {
    const dot = basename.lastIndexOf(".");
    if (dot <= 0) return "";
    return basename.slice(dot + 1).toLowerCase();
}

function dataNoteFor(relPath) {
    for (const entry of DATA_PREFIXES) {
        if (relPath.startsWith(entry.prefix)) return entry.note;
    }
    const segments = relPath.split("/");
    if (segments.includes("fixtures") || segments.includes("__fixtures__")) {
        return "recorded test fixtures";
    }
    return null;
}

function classify(relPath, binary) {
    if (binary) return "binary";
    if (dataNoteFor(relPath) !== null) return "data";

    const segments = relPath.split("/");
    const basename = segments[segments.length - 1];
    const ext = extensionOf(basename);

    if (/\.(test|spec)\.[cm]?[jt]sx?$/i.test(basename)) return "tests";
    if (segments.some((s) => s === "test" || s === "tests" || s === "__tests__")) return "tests";

    if (
        CONFIG_BASENAMES.has(basename) ||
        /^tsconfig(\..+)?\.json$/i.test(basename) ||
        /^\.[\w.-]+rc(\.[\w]+)?$/i.test(basename) ||
        /\.config\.[cm]?[jt]s$/i.test(basename) ||
        CONFIG_EXTENSIONS.has(ext)
    ) {
        return "config";
    }

    if (DOC_BASENAMES.has(basename) || DOC_EXTENSIONS.has(ext)) return "docs";
    if (MARKUP_EXTENSIONS.has(ext)) return "markup";
    if (SOURCE_EXTENSIONS.has(ext)) return "source";
    if (DATA_EXTENSIONS.has(ext)) return "data";
    return "other";
}

function packageOf(relPath) {
    const match = /^design\/packages\/([^/]+)\//.exec(relPath);
    if (match) return match[1];
    if (relPath.startsWith("design/tools/")) return "(tools)";
    if (relPath.startsWith("design/")) return "(workspace)";
    return "(repo root)";
}

function comparePackages(a, b) {
    const ia = PACKAGE_ORDER.indexOf(a);
    const ib = PACKAGE_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) {
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    }
    const aMeta = a.startsWith("(");
    const bMeta = b.startsWith("(");
    if (aMeta !== bMeta) return aMeta ? 1 : -1;
    return a.localeCompare(b);
}

async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const width = Math.max(1, Math.min(limit, items.length));
    const workers = Array.from({ length: width }, async () => {
        for (;;) {
            const index = next;
            next += 1;
            if (index >= items.length) return;
            results[index] = await fn(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

const numberFormat = new Intl.NumberFormat("en-US");
const fmt = (n) => numberFormat.format(n);
const pct = (part, whole) => (whole === 0 ? "—" : `${((part / whole) * 100).toFixed(1)}%`);

/* -------------------------------------------------------------------------- */
/* Git                                                                         */
/* -------------------------------------------------------------------------- */

function git(repoRoot, args) {
    return execFileSync("git", ["-C", repoRoot, ...args], {
        encoding: "utf8",
        maxBuffer: MAX_GIT_BUFFER,
    });
}

function repositoryRoot() {
    const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    return execFileSync("git", ["-C", scriptDir, "rev-parse", "--show-toplevel"], {
        encoding: "utf8",
    }).trim();
}

/** `git ls-files -s -z` → `{ mode, relPath }`, i.e. exactly what the tag's tree contains. */
function trackedEntries(repoRoot) {
    const raw = git(repoRoot, ["ls-files", "-s", "-z"]);
    const entries = [];
    for (const record of raw.split(NUL)) {
        if (record.length === 0) continue;
        const tab = record.indexOf("\t");
        if (tab === -1) continue;
        const mode = record.slice(0, record.indexOf(" "));
        entries.push({ mode, relPath: record.slice(tab + 1) });
    }
    return entries;
}

/**
 * Every commit reachable from HEAD, with the author identity and full message needed to
 * decide agent versus human. One git call, not one per commit.
 */
function commitTable(repoRoot) {
    const raw = git(repoRoot, [
        "log",
        `--format=%H${UNIT_SEPARATOR}%an${UNIT_SEPARATOR}%ae${UNIT_SEPARATOR}%B${RECORD_SEPARATOR}`,
        "HEAD",
    ]);
    const commits = new Map();
    for (const record of raw.split(RECORD_SEPARATOR)) {
        const trimmed = record.replace(/^\s+/, "");
        if (trimmed.length === 0) continue;
        const [sha, name = "", email = "", body = ""] = trimmed.split(UNIT_SEPARATOR);
        if (!sha || !/^[0-9a-f]{40}$/.test(sha)) continue;
        commits.set(sha, { sha, name, email, body });
    }
    return commits;
}

function looksLikeAgentIdentity(name, email) {
    if (AGENT_EMAIL_PATTERNS.some((re) => re.test(email))) return true;
    return AGENT_NAME_PATTERNS.some((re) => re.test(name));
}

/** @returns {"identity" | "coauthor" | null} which rule fired, so the report can say so. */
function agentRuleFor(commit) {
    if (looksLikeAgentIdentity(commit.name, commit.email)) return "identity";
    for (const line of commit.body.split("\n")) {
        const match = /^\s*co-authored-by:\s*(.+?)\s*$/i.exec(line);
        if (!match) continue;
        const trailer = match[1];
        const emailMatch = /<([^>]*)>/.exec(trailer);
        const trailerName = trailer.replace(/<[^>]*>/, "").trim();
        if (looksLikeAgentIdentity(trailerName, emailMatch ? emailMatch[1] : "")) return "coauthor";
    }
    return null;
}

/**
 * One `git blame --line-porcelain` per file (never per line), parsed into a
 * commit-sha → surviving-line-count map. `--line-porcelain` repeats the header block for
 * every line, so counting the header lines counts the lines.
 */
async function blameFile(repoRoot, relPath) {
    const { stdout } = await execFileAsync(
        "git",
        ["-C", repoRoot, "blame", "--line-porcelain", "--", relPath],
        { encoding: "utf8", maxBuffer: MAX_GIT_BUFFER },
    );
    const perCommit = new Map();
    let start = 0;
    while (start < stdout.length) {
        let end = stdout.indexOf("\n", start);
        if (end === -1) end = stdout.length;
        // Content lines are TAB-prefixed; header blocks are not.
        if (stdout.charCodeAt(start) !== 9 && end - start >= 40) {
            const sha = stdout.slice(start, start + 40);
            if (stdout.charCodeAt(start + 40) === 32 && /^[0-9a-f]{40}$/.test(sha)) {
                perCommit.set(sha, (perCommit.get(sha) ?? 0) + 1);
            }
        }
        start = end + 1;
    }
    return perCommit;
}

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

function emptyBucket() {
    return { files: 0, total: 0, nonBlank: 0, agent: 0, human: 0, uncommitted: 0 };
}

function addTo(bucket, file) {
    bucket.files += 1;
    bucket.total += file.total;
    bucket.nonBlank += file.nonBlank;
    bucket.agent += file.agent;
    bucket.human += file.human;
    bucket.uncommitted += file.uncommitted;
}

async function collect(options) {
    const repoRoot = repositoryRoot();
    const head = git(repoRoot, ["rev-parse", "HEAD"]).trim();
    const headShort = head.slice(0, 8);
    const headDate = git(repoRoot, ["log", "-1", "--format=%cI", "HEAD"]).trim();
    const dirty = git(repoRoot, ["status", "--porcelain"]).trim().length > 0;

    const entries = trackedEntries(repoRoot);
    const exclusionCounts = EXCLUSIONS.map(() => 0);
    const counted = [];

    outer: for (const entry of entries) {
        for (let i = 0; i < EXCLUSIONS.length; i += 1) {
            if (EXCLUSIONS[i].match(entry.relPath, entry.mode)) {
                exclusionCounts[i] += 1;
                continue outer;
            }
        }
        counted.push(entry);
    }

    const missing = [];
    const files = [];
    for (const entry of counted) {
        let buffer;
        try {
            buffer = readFileSync(path.join(repoRoot, entry.relPath));
        } catch {
            missing.push(entry.relPath);
            continue;
        }
        const binary = isBinary(buffer);
        const { total, nonBlank } = binary ? { total: 0, nonBlank: 0 } : countLines(buffer.toString("utf8"));
        files.push({
            relPath: entry.relPath,
            binary,
            category: classify(entry.relPath, binary),
            pkg: packageOf(entry.relPath),
            total,
            nonBlank,
            agent: 0,
            human: 0,
            uncommitted: 0,
        });
    }

    const ruleCounts = { identity: 0, coauthor: 0 };
    const unknownShas = new Set();
    if (options.blame) {
        const commits = commitTable(repoRoot);
        const agentRule = new Map();
        for (const [sha, commit] of commits) agentRule.set(sha, agentRuleFor(commit));

        const blamable = files.filter((f) => !f.binary && f.total > 0);
        const blames = await mapWithConcurrency(blamable, options.concurrency, (file) =>
            blameFile(repoRoot, file.relPath),
        );
        for (let i = 0; i < blamable.length; i += 1) {
            const file = blamable[i];
            for (const [sha, lines] of blames[i]) {
                if (sha === ZERO_SHA) {
                    file.uncommitted += lines;
                    continue;
                }
                // Blame only ever names commits reachable from the blamed rev, so this
                // should be unreachable; if it ever fires, say so rather than guessing.
                if (!agentRule.has(sha)) unknownShas.add(sha);
                const rule = agentRule.get(sha) ?? null;
                if (rule === null) {
                    file.human += lines;
                } else {
                    file.agent += lines;
                    ruleCounts[rule] += lines;
                }
            }
        }
    }

    const byCategory = new Map(CATEGORIES.map((c) => [c.id, emptyBucket()]));
    const byPackage = new Map();
    const project = emptyBucket();
    const held = emptyBucket();
    const grand = emptyBucket();

    for (const file of files) {
        addTo(byCategory.get(file.category), file);
        if (!byPackage.has(file.pkg)) byPackage.set(file.pkg, emptyBucket());
        addTo(byPackage.get(file.pkg), file);
        addTo(grand, file);
        const category = CATEGORIES.find((c) => c.id === file.category);
        addTo(category.inProjectTotal ? project : held, file);
    }

    return {
        repoRoot,
        head,
        headShort,
        headDate,
        dirty,
        blame: options.blame,
        exclusions: EXCLUSIONS.map((e, i) => ({ ...e, files: exclusionCounts[i] })),
        missing,
        files,
        byCategory,
        byPackage,
        project,
        held,
        grand,
        ruleCounts,
        unknownShas: [...unknownShas],
    };
}

/* -------------------------------------------------------------------------- */
/* Self-check                                                                  */
/* -------------------------------------------------------------------------- */

function selfCheck(report) {
    const problems = [];

    let categoryTotal = 0;
    let categoryFiles = 0;
    for (const bucket of report.byCategory.values()) {
        categoryTotal += bucket.total;
        categoryFiles += bucket.files;
    }
    if (categoryTotal !== report.grand.total) {
        problems.push(
            `category rows sum to ${categoryTotal} lines but the grand total is ${report.grand.total}`,
        );
    }
    if (categoryFiles !== report.grand.files) {
        problems.push(
            `category rows sum to ${categoryFiles} files but the grand total is ${report.grand.files}`,
        );
    }

    let packageTotal = 0;
    for (const bucket of report.byPackage.values()) packageTotal += bucket.total;
    if (packageTotal !== report.grand.total) {
        problems.push(
            `package rows sum to ${packageTotal} lines but the grand total is ${report.grand.total}`,
        );
    }

    if (report.project.total + report.held.total !== report.grand.total) {
        problems.push(
            `project (${report.project.total}) + held-out (${report.held.total}) !== grand total (${report.grand.total})`,
        );
    }

    if (report.blame) {
        if (report.unknownShas.length > 0) {
            problems.push(
                `blame named ${report.unknownShas.length} commit(s) absent from the HEAD log, ` +
                    `so their authorship was guessed: ${report.unknownShas.slice(0, 5).join(", ")}`,
            );
        }
        for (const [name, bucket] of [
            ["grand total", report.grand],
            ["project total", report.project],
            ["held-out rows", report.held],
        ]) {
            const attributed = bucket.agent + bucket.human + bucket.uncommitted;
            if (attributed !== bucket.total) {
                problems.push(
                    `${name}: authorship sums to ${attributed} lines but the line count is ${bucket.total} ` +
                        `(agent ${bucket.agent} + human ${bucket.human} + uncommitted ${bucket.uncommitted})`,
                );
            }
        }
    }

    return problems;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

function renderTextTable(headers, rows, aligns) {
    const widths = headers.map((h, i) =>
        Math.max(h.length, ...rows.map((r) => (r === null ? 0 : String(r[i]).length))),
    );
    const pad = (value, i) =>
        aligns[i] === "right" ? String(value).padStart(widths[i]) : String(value).padEnd(widths[i]);
    const lines = [];
    lines.push(headers.map(pad).join("  ").trimEnd());
    lines.push(widths.map((w) => "-".repeat(w)).join("  "));
    for (const row of rows) {
        if (row === null) {
            lines.push(widths.map((w) => "-".repeat(w)).join("  "));
            continue;
        }
        lines.push(row.map(pad).join("  ").trimEnd());
    }
    return lines.join("\n");
}

function renderMarkdownTable(headers, rows, aligns) {
    const lines = [];
    lines.push(`| ${headers.join(" | ")} |`);
    lines.push(`| ${aligns.map((a) => (a === "right" ? "---:" : ":---")).join(" | ")} |`);
    // Markdown has no rule row, so the rows below the separator are bolded instead —
    // otherwise the totals read as just more data rows.
    let isTotalRow = false;
    for (const row of rows) {
        if (row === null) {
            isTotalRow = true;
            continue;
        }
        const cells = row.map((cell) => (isTotalRow ? `**${cell}**` : String(cell)));
        lines.push(`| ${cells.join(" | ")} |`);
    }
    return lines.join("\n");
}

function categoryRows(report) {
    const rows = [];
    for (const category of CATEGORIES) {
        const bucket = report.byCategory.get(category.id);
        if (bucket.files === 0) continue;
        rows.push([
            category.label,
            fmt(bucket.files),
            fmt(bucket.total),
            fmt(bucket.nonBlank),
            category.inProjectTotal ? "yes" : "no",
        ]);
    }
    rows.push(null);
    rows.push([
        "PROJECT TOTAL (hand-written rows)",
        fmt(report.project.files),
        fmt(report.project.total),
        fmt(report.project.nonBlank),
        "—",
    ]);
    rows.push([
        "GRAND TOTAL (everything counted)",
        fmt(report.grand.files),
        fmt(report.grand.total),
        fmt(report.grand.nonBlank),
        "—",
    ]);
    return rows;
}

function packageRows(report) {
    const names = [...report.byPackage.keys()].sort(comparePackages);
    const rows = [];
    for (const name of names) {
        const bucket = report.byPackage.get(name);
        const filesInPackage = report.files.filter((f) => f.pkg === name);
        const dataLines = filesInPackage
            .filter((f) => !CATEGORIES.find((c) => c.id === f.category).inProjectTotal)
            .reduce((sum, f) => sum + f.total, 0);
        rows.push([
            name,
            fmt(bucket.files),
            fmt(bucket.total),
            fmt(bucket.nonBlank),
            fmt(bucket.total - dataLines),
            fmt(dataLines),
        ]);
    }
    rows.push(null);
    rows.push([
        "ALL",
        fmt(report.grand.files),
        fmt(report.grand.total),
        fmt(report.grand.nonBlank),
        fmt(report.project.total),
        fmt(report.held.total),
    ]);
    return rows;
}

function authorshipRows(report) {
    const rows = [];
    for (const [label, key] of [
        ["Agent-written", "agent"],
        ["Human-written", "human"],
        ["Uncommitted (working tree)", "uncommitted"],
    ]) {
        if (key === "uncommitted" && report.grand.uncommitted === 0) continue;
        rows.push([
            label,
            fmt(report.project[key]),
            fmt(report.held[key]),
            fmt(report.grand[key]),
            pct(report.grand[key], report.grand.total),
        ]);
    }
    rows.push(null);
    rows.push([
        "TOTAL (must equal the line totals)",
        fmt(report.project.agent + report.project.human + report.project.uncommitted),
        fmt(report.held.agent + report.held.human + report.held.uncommitted),
        fmt(report.grand.agent + report.grand.human + report.grand.uncommitted),
        "100.0%",
    ]);
    return rows;
}

const CATEGORY_HEADERS = ["Category", "Files", "Lines", "Non-blank", "In project total"];
const CATEGORY_ALIGNS = ["left", "right", "right", "right", "right"];
const PACKAGE_HEADERS = ["Package", "Files", "Lines", "Non-blank", "Project lines", "Data lines"];
const PACKAGE_ALIGNS = ["left", "right", "right", "right", "right", "right"];
const AUTHOR_HEADERS = ["Authorship", "Project", "Held out", "Grand total", "Share"];
const AUTHOR_ALIGNS = ["left", "right", "right", "right", "right"];

function renderText(report) {
    const out = [];
    out.push("material-bluemap — lines of code");
    out.push(
        `commit ${report.headShort}  ${report.headDate}${report.dirty ? "  (working tree is DIRTY — these are not a commit's numbers)" : ""}`,
    );
    out.push("");
    out.push("By category");
    out.push(renderTextTable(CATEGORY_HEADERS, categoryRows(report), CATEGORY_ALIGNS));
    out.push("");
    out.push("By package");
    out.push(renderTextTable(PACKAGE_HEADERS, packageRows(report), PACKAGE_ALIGNS));
    out.push("");
    if (report.blame) {
        out.push("Authorship (surviving lines)");
        out.push(renderTextTable(AUTHOR_HEADERS, authorshipRows(report), AUTHOR_ALIGNS));
        out.push("");
        out.push("Rule used");
        for (const line of ATTRIBUTION_RULE_TEXT) out.push(`  ${line}`);
        out.push(
            `  Matched by author identity: ${fmt(report.ruleCounts.identity)} lines; ` +
                `by Co-Authored-By trailer: ${fmt(report.ruleCounts.coauthor)} lines.`,
        );
    } else {
        out.push("Authorship: SKIPPED (--no-blame). Run without --no-blame for the attributed figures.");
    }
    out.push("");
    out.push("Excluded from every number above (stated, not silent)");
    const exclusionRows = report.exclusions.map((e) => [e.label, fmt(e.files), e.reason]);
    out.push(
        renderTextTable(["Excluded", "Tracked files removed", "Why"], exclusionRows, [
            "left",
            "right",
            "left",
        ]),
    );
    out.push("");
    out.push("Held out of the project total but included in the grand total");
    for (const entry of DATA_PREFIXES) out.push(`  ${entry.prefix}  — ${entry.note}`);
    out.push("  **/fixtures/**  — recorded test fixtures");
    out.push("  binary files (images, .dat) count as 0 lines");
    if (report.missing.length > 0) {
        out.push("");
        out.push(`Tracked but missing from the working tree (not counted): ${report.missing.length}`);
        for (const relPath of report.missing.slice(0, 20)) out.push(`  ${relPath}`);
    }
    out.push("");
    out.push("Reproduce: node scripts/count-lines.mjs");
    return out.join("\n");
}

function renderMarkdown(report) {
    const out = [];
    out.push("### Lines of code");
    out.push("");
    out.push(
        `Measured at commit \`${report.headShort}\` (${report.headDate}) by \`node scripts/count-lines.mjs --format=markdown\`.` +
            (report.dirty ? " **Working tree was dirty when this ran.**" : ""),
    );
    out.push("");
    out.push("#### By category");
    out.push("");
    out.push(renderMarkdownTable(CATEGORY_HEADERS, categoryRows(report), CATEGORY_ALIGNS));
    out.push("");
    out.push("#### By package");
    out.push("");
    out.push(renderMarkdownTable(PACKAGE_HEADERS, packageRows(report), PACKAGE_ALIGNS));
    out.push("");
    out.push("#### Authorship");
    out.push("");
    if (report.blame) {
        out.push(renderMarkdownTable(AUTHOR_HEADERS, authorshipRows(report), AUTHOR_ALIGNS));
        out.push("");
        out.push("<details><summary>Which rule was used</summary>");
        out.push("");
        out.push("```");
        for (const line of ATTRIBUTION_RULE_TEXT) out.push(line);
        out.push("```");
        out.push("");
        out.push(
            `Matched by author identity: **${fmt(report.ruleCounts.identity)}** lines; by \`Co-Authored-By\` trailer: **${fmt(report.ruleCounts.coauthor)}** lines. ` +
                "This is stated without spin in either direction: a high agent share is not a boast and not an apology.",
        );
        out.push("");
        out.push("</details>");
    } else {
        out.push("_Skipped (`--no-blame`)._");
    }
    out.push("");
    out.push("#### What is excluded, and why");
    out.push("");
    out.push(
        renderMarkdownTable(
            ["Excluded", "Tracked files removed", "Why"],
            report.exclusions.map((e) => [e.label, fmt(e.files), e.reason]),
            ["left", "right", "left"],
        ),
    );
    out.push("");
    out.push("Held out of the **project total** but present in the **grand total**:");
    out.push("");
    for (const entry of DATA_PREFIXES) out.push(`- \`${entry.prefix}\` — ${entry.note}`);
    out.push("- `**/fixtures/**` — recorded test fixtures");
    out.push("- binary files (images, `.dat`) count as 0 lines");
    if (report.missing.length > 0) {
        out.push("");
        out.push(`Tracked but missing from the working tree (not counted): ${report.missing.length}.`);
    }
    return out.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const HELP = `count-lines.mjs — the committed line counter for material-bluemap

  node scripts/count-lines.mjs [options]

  --format=text|markdown   output format (default: text)
  --no-blame               skip per-line authorship (fast; the report says it was skipped)
  --concurrency=N          parallel git blame processes (default: available parallelism, max 12)
  -h, --help               this message

Exits non-zero when the category totals and the authorship totals disagree.
`;

function parseArgs(argv) {
    const options = {
        format: "text",
        blame: true,
        concurrency: Math.min(12, Math.max(1, availableParallelism())),
    };
    for (const arg of argv) {
        if (arg === "-h" || arg === "--help") {
            process.stdout.write(HELP);
            process.exit(0);
        } else if (arg.startsWith("--format=")) {
            const value = arg.slice("--format=".length);
            if (value !== "text" && value !== "markdown") {
                process.stderr.write(`count-lines: unknown format "${value}"\n`);
                process.exit(2);
            }
            options.format = value;
        } else if (arg === "--no-blame") {
            options.blame = false;
        } else if (arg.startsWith("--concurrency=")) {
            const value = Number.parseInt(arg.slice("--concurrency=".length), 10);
            if (!Number.isFinite(value) || value < 1) {
                process.stderr.write("count-lines: --concurrency must be a positive integer\n");
                process.exit(2);
            }
            options.concurrency = value;
        } else {
            process.stderr.write(`count-lines: unknown argument "${arg}"\n${HELP}`);
            process.exit(2);
        }
    }
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await collect(options);
    const problems = selfCheck(report);

    process.stdout.write(
        (options.format === "markdown" ? renderMarkdown(report) : renderText(report)) + "\n",
    );

    if (problems.length > 0) {
        process.stderr.write("\ncount-lines: SELF-CHECK FAILED — the table does not balance:\n");
        for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
        process.stderr.write(
            "Fix the counter before publishing the figure; an unexplained gap between two numbers " +
                "in the same table destroys the credibility of both.\n",
        );
        process.exit(1);
    }
}

await main();

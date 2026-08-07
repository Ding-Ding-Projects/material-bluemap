/**
 * The history repository itself: what a snapshot is, what a restore is, and why neither
 * of them ever throws away a revision.
 *
 * ## Append-only, without exception
 *
 * Every operation here that changes anything adds a commit on top of the current tip.
 * Nothing resets, nothing rebases, nothing amends, nothing checks out an old revision as
 * the new state of the branch. That is not a stylistic preference; it is the single
 * property that makes a history panel safe to press buttons in.
 *
 * Consider the alternative for a moment, because it is the design somebody reaches for
 * first. A "restore" implemented as `git reset --hard <old>` looks correct: the files come
 * back, the panel shows the old revision as current, everything the user asked for
 * happened. What also happened is that every revision after `<old>` left the branch. The
 * user now cannot undo their undo. Worse, they cannot *find out* that they cannot, until
 * they try - and the moment they try is the moment they have already lost the newer state
 * they were experimenting away from. A history that punishes experimentation is a history
 * nobody experiments with, which means it is a history nobody uses.
 *
 * So {@link restoreRevision} writes the old files back and then takes an ordinary snapshot
 * of the result. The revision it came from is still there. The revision it replaced is
 * still there. Undoing the restore is another restore, and undoing *that* is another one
 * again, each recorded, forever, in the order they happened.
 *
 * The one operation that genuinely removes revisions is {@link discardOlderRevisions}, and
 * it is not an undo at all - it is the retention control, it is destructive by definition,
 * and it is the only thing in this module that is gated behind super-confirmation in the
 * interface.
 *
 * ## An unchanged state records nothing
 *
 * {@link snapshotProject} stages the mirror and asks git whether anything actually differs.
 * When nothing does, it commits nothing and says so. Pressing Save twice should not put two
 * rows in the panel, because the second one would be a row describing an event that did not
 * happen, and a panel full of those is a panel where the real events are hidden among
 * decoys.
 *
 * ## Nothing here reaches a network
 *
 * There is no fetch, no push, no remote, no clone. A history repository is created with
 * `git init` and never given a remote, and no channel in this module accepts one. The local
 * repository is the whole of it, which is what the contract means by local-only: syncing a
 * config history somewhere would move a person's server addresses, database URLs and, in
 * the case of a storage config, their credentials.
 */

import { mkdir, opendir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { checkConfigPath, deleteConfigFiles, readConfigFolder, writeConfigFiles } from "../config/ipc.js";

import {
    BASE_CONFIG,
    isolationEnv,
    type GitResult,
    type GitRunner,
} from "./git.js";
import {
    describeChanges,
    describeFileRestore,
    describeRestore,
    describeSettingRestore,
    type ChangeStatus,
    type FileChange,
    type HistoryAction,
} from "./describe.js";

/**
 * Field and record separators inside a `git log` format.
 *
 * ASCII 31 and 30 - the unit and record separators - because a commit subject, a label and
 * a body can all contain newlines, tabs, commas and every other character somebody might
 * reach for first. These two exist for exactly this purpose and cannot appear in a config
 * file this editor will write, which is what makes splitting on them safe.
 */
const UNIT = "\u001f";
const RECORD = "\u001e";

/** Where a revision's user-written label is kept. See {@link setRevisionLabel}. */
export const LABEL_NOTES_REF = "refs/notes/labels";

/** The branch a history is kept on. Named rather than `main`, so it reads as what it is. */
export const HISTORY_BRANCH = "history";

/** How many revisions a listing returns unless asked for fewer. */
export const DEFAULT_REVISION_LIMIT = 2000;

/** The fewest revisions {@link discardOlderRevisions} will leave behind. */
export const MIN_RETAINED_REVISIONS = 1;

/* -------------------------------------------------------------------------- */
/* What crosses back out of this module                                       */
/* -------------------------------------------------------------------------- */

export interface HistoryRevision {
    /** The full commit hash. Stable, and what every other call takes. */
    readonly id: string;
    /** The first twelve characters, which is what the panel shows. */
    readonly shortId: string;
    /** ISO 8601, from the commit's author date. */
    readonly at: string;
    /** The one-line label. Always names what changed. */
    readonly label: string;
    /** The grouping word the panel derives its action filter from. */
    readonly action: HistoryAction;
    /** Every file this revision touched, with how it changed. */
    readonly changes: readonly FileChange[];
    /** The user's own label for this revision, or null. */
    readonly note: string | null;
    /** Set on a restore: the revision whose contents were written back. */
    readonly restoredFrom: string | null;
}

/**
 * The result of anything that writes.
 *
 * It never rejects and it is never a bare boolean. A caller has to be able to tell three
 * outcomes apart: it worked and here is the new revision; it worked and there was nothing
 * to record; it did not work and here is the sentence to show. Collapsing the middle case
 * into either of the others produces a panel that either invents revisions or reports
 * failures for saves that were fine.
 */
export type HistoryWrite =
    | { readonly ok: true; readonly revision: HistoryRevision | null; readonly message: string }
    | { readonly ok: false; readonly message: string };

/** A file a restore could not write back, and the reason, stated rather than skipped. */
export interface SkippedFile {
    readonly path: string;
    readonly reason: string;
}

export type RestoreResult =
    | {
          readonly ok: true;
          readonly revision: HistoryRevision | null;
          readonly message: string;
          readonly skipped: readonly SkippedFile[];
      }
    | { readonly ok: false; readonly message: string };

/* -------------------------------------------------------------------------- */
/* Running git inside one repository                                          */
/* -------------------------------------------------------------------------- */

/** A git runner already bound to one repository, with the isolation flags applied. */
export interface RepoGit {
    readonly path: string;
    run(args: readonly string[], extraEnv?: Readonly<Record<string, string>>): Promise<GitResult>;
}

export function repoGit(run: GitRunner, root: string, repository: string): RepoGit {
    const env = isolationEnv(root);
    return {
        path: repository,
        run: (args, extraEnv) =>
            run([...BASE_CONFIG, ...args], {
                cwd: repository,
                env: extraEnv === undefined ? env : { ...env, ...extraEnv },
            }),
    };
}

/** One sentence naming what git refused to do, with git's own words behind it. */
function gitFailure(what: string, result: GitResult): string {
    if (result.spawnError === "ENOENT") {
        return `${what} because Git is not installed on this machine.`;
    }
    if (result.spawnError !== null) {
        return `${what} because Git could not be started (${result.spawnError}).`;
    }
    const said = (result.stderr.trim() === "" ? result.stdout : result.stderr).trim().split("\n")[0] ?? "";
    return said === "" ? `${what}.` : `${what}: ${said}`;
}

/* -------------------------------------------------------------------------- */
/* Creating the repository                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates the repository if it is not there, and answers whether it is usable.
 *
 * `git init` on a directory that already holds a repository is a no-operation, so this is
 * safe to call before every snapshot rather than tracked with a flag that could go stale
 * against a directory somebody deleted while the application was running.
 */
export async function ensureRepository(git: RepoGit): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
        await mkdir(git.path, { recursive: true });
    } catch (error) {
        return {
            ok: false,
            message: `The history folder ${git.path} could not be created: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    const inside = await git.run(["rev-parse", "--git-dir"]);
    if (inside.ok) return { ok: true };
    if (inside.spawnError !== null) {
        return { ok: false, message: gitFailure("The history could not be opened", inside) };
    }

    const init = await git.run(["-c", `init.defaultBranch=${HISTORY_BRANCH}`, "init", "--quiet"]);
    if (!init.ok) return { ok: false, message: gitFailure("The history repository could not be created", init) };

    return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Mirroring the project into the repository                                  */
/* -------------------------------------------------------------------------- */

export interface MirrorFile {
    readonly path: string;
    readonly text: string;
}

/**
 * What a history is a history *of*.
 *
 * Everything below this point - snapshotting, restoring, pruning - is the same work
 * whatever is being tracked, and originally it was written straight against the config
 * channel. A world's project file needs the identical machinery over a different thing on
 * disk, so the four operations that actually touch the user's files were lifted out into
 * this interface rather than copied into a second module. A fork would have been the larger
 * change and the worse one: the append-only rules, the drift capture before a restore, and
 * the "a failed history write is a value" contract would then exist twice, and the second
 * copy is the one that quietly stops matching.
 *
 * {@link configFolderSource} is the default, so every existing caller behaves exactly as it
 * did before this seam existed.
 */
export interface HistorySource {
    /**
     * What this source is, in the words a failure message uses: `config folder`, `project
     * file`. Written into sentences the user reads, so it is a noun phrase, not an
     * identifier.
     */
    readonly what: string;
    /** Everything this history tracks, read from disk. Rejects when it cannot be read. */
    read(folder: string): Promise<{ readonly files: readonly MirrorFile[] }>;
    /**
     * Whether a path taken out of a revision may be written back to the user's folder.
     *
     * A restore writes paths that came from a *previous* snapshot, which is not the same as
     * trusting them: a repository is a directory on the same disk as everything else, so
     * this is the check that keeps a restore inside the folder it belongs to.
     */
    check(path: string): { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: string };
    write(folder: string, files: readonly MirrorFile[]): Promise<void>;
    remove(folder: string, paths: readonly string[]): Promise<void>;
}

/** The original behaviour of this module: a BlueMap config folder and its `.conf` files. */
export const configFolderSource: HistorySource = {
    what: "config folder",
    read: readConfigFolder,
    check: checkConfigPath,
    write: writeConfigFiles,
    remove: deleteConfigFiles,
};

/** Every file under a directory, relative and slash-separated, skipping `.git`. */
async function treeFiles(root: string, prefix = ""): Promise<string[]> {
    const found: string[] = [];
    const opened = await opendir(join(root, prefix)).catch(() => null);
    if (opened === null) return found;

    for await (const child of opened) {
        if (prefix === "" && child.name === ".git") continue;
        const relative = prefix === "" ? child.name : `${prefix}/${child.name}`;
        if (child.isDirectory()) found.push(...(await treeFiles(root, relative)));
        else if (child.isFile()) found.push(relative);
    }
    return found;
}

/**
 * Makes the repository's working tree hold exactly these files and nothing else.
 *
 * The deletions are what make a snapshot *complete* rather than cumulative. Without them a
 * map the user removed would live on in every future snapshot, and restoring any later
 * revision would silently bring it back - a history that quietly resurrects deleted things
 * is worse than none, because the user has no reason to check.
 */
export async function mirrorInto(repository: string, files: readonly MirrorFile[]): Promise<void> {
    const wanted = new Map(files.map((file) => [file.path, file.text]));

    for (const existing of await treeFiles(repository)) {
        if (wanted.has(existing)) continue;
        await rm(join(repository, ...existing.split("/")), { force: true });
    }

    for (const [path, text] of wanted) {
        const target = join(repository, ...path.split("/"));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, text, "utf8");
    }

    // Directories left empty by a deletion. Git does not track them, so leaving them would
    // not change a snapshot, but it would leave a `maps` folder in the history root long
    // after the last map went, which reads as a bug to anybody who looks.
    const seen = new Set([...wanted.keys()].map((path) => path.split("/").slice(0, -1).join("/")));
    for (const directory of new Set([...(await directoriesIn(repository))])) {
        if (directory === "" || seen.has(directory)) continue;
        await rmdir(join(repository, ...directory.split("/"))).catch(() => undefined);
    }
}

async function directoriesIn(root: string, prefix = ""): Promise<string[]> {
    const found: string[] = [];
    const opened = await opendir(join(root, prefix)).catch(() => null);
    if (opened === null) return found;
    for await (const child of opened) {
        if (prefix === "" && child.name === ".git") continue;
        if (!child.isDirectory()) continue;
        const relative = prefix === "" ? child.name : `${prefix}/${child.name}`;
        found.push(...(await directoriesIn(root, relative)), relative);
    }
    return found;
}

/* -------------------------------------------------------------------------- */
/* Reading what is staged                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The staged changes, read from `git status` rather than `git diff`.
 *
 * `git diff --cached` needs a `HEAD` to compare against and there is none in a repository
 * whose first commit has not happened yet, which is exactly the moment a project's history
 * begins. `git status --porcelain` reports the same information and is defined for an
 * unborn branch, where it simply calls everything added.
 */
export function parseStatus(output: string): FileChange[] {
    const changes: FileChange[] = [];
    for (const record of output.split("\0")) {
        if (record.length < 4) continue;
        const index = record.charAt(0);
        const worktree = record.charAt(1);
        const path = record.slice(3);
        const mark = index === " " || index === "?" ? worktree : index;

        let status: ChangeStatus | null = null;
        if (mark === "A" || mark === "?") status = "added";
        else if (mark === "M" || mark === "T") status = "modified";
        else if (mark === "D") status = "deleted";
        if (status === null) continue;

        changes.push({ path, status });
    }
    return changes.sort((left, right) => left.path.localeCompare(right.path));
}

/* -------------------------------------------------------------------------- */
/* Reading the log                                                            */
/* -------------------------------------------------------------------------- */

const LOG_FORMAT = `%H${UNIT}%aI${UNIT}%s${UNIT}%N${UNIT}%b${RECORD}`;

/** Pulls a trailer's values out of a commit body. */
function trailer(body: string, key: string): string[] {
    const values: string[] = [];
    for (const line of body.split("\n")) {
        const match = new RegExp(`^${key}:\\s*(.*)$`).exec(line.trim());
        if (match !== null && match[1] !== undefined) values.push(match[1].trim());
    }
    return values;
}

/** The action a commit recorded, falling back to a word rather than to nothing. */
function actionOf(body: string): HistoryAction {
    const recorded = trailer(body, "Change-Action")[0];
    const known: readonly HistoryAction[] = [
        "started",
        "created",
        "changed",
        "deleted",
        "mixed",
        "restored",
        "pruned",
    ];
    return known.find((action) => action === recorded) ?? "changed";
}

function changesOf(body: string): FileChange[] {
    const changes: FileChange[] = [];
    for (const line of trailer(body, "Changed-File")) {
        const space = line.indexOf(" ");
        if (space <= 0) continue;
        const status = line.slice(0, space);
        const path = line.slice(space + 1);
        if (status !== "added" && status !== "modified" && status !== "deleted") continue;
        changes.push({ path, status });
    }
    return changes;
}

export function parseLog(output: string): HistoryRevision[] {
    const revisions: HistoryRevision[] = [];
    for (const record of output.split(RECORD)) {
        const trimmed = record.replace(/^\n+/, "");
        if (trimmed.trim() === "") continue;
        const fields = trimmed.split(UNIT);
        const id = fields[0] ?? "";
        if (id === "") continue;
        const body = fields[4] ?? "";
        const note = (fields[3] ?? "").trim();
        const restored = trailer(body, "Restored-From")[0] ?? null;

        revisions.push({
            id,
            shortId: id.slice(0, 12),
            at: fields[1] ?? "",
            label: fields[2] ?? "",
            action: actionOf(body),
            changes: changesOf(body),
            note: note === "" ? null : note,
            restoredFrom: restored,
        });
    }
    return revisions;
}

/** Every revision, newest first. An empty history is an empty list, never an error. */
export async function listRevisions(git: RepoGit, limit = DEFAULT_REVISION_LIMIT): Promise<HistoryRevision[]> {
    const result = await git.run([
        "log",
        `--max-count=${String(Math.max(1, limit))}`,
        `--notes=${LABEL_NOTES_REF}`,
        `--format=${LOG_FORMAT}`,
    ]);
    // An unborn branch makes `git log` fail with "does not have any commits yet", which is
    // not a failure: it is a project whose history has not started.
    if (!result.ok) return [];
    return parseLog(result.stdout);
}

/* -------------------------------------------------------------------------- */
/* Taking a snapshot                                                          */
/* -------------------------------------------------------------------------- */

/** How a snapshot should present itself, when the caller knows better than the diff. */
export interface SnapshotOverride {
    readonly label: string;
    readonly action: HistoryAction;
    /** Written as a `Restored-From` trailer, so a restore can point at its source. */
    readonly restoredFrom?: string;
}

function commitMessage(
    label: string,
    action: HistoryAction,
    changes: readonly FileChange[],
    restoredFrom: string | null,
): string[] {
    const trailers = [
        `Change-Action: ${action}`,
        ...(restoredFrom === null ? [] : [`Restored-From: ${restoredFrom}`]),
        ...changes.map((change) => `Changed-File: ${change.status} ${change.path}`),
    ];
    return ["-m", label, "-m", trailers.join("\n")];
}

/**
 * Mirrors the folder into the repository and commits whatever changed.
 *
 * Reads the folder from disk rather than taking the caller's word for its contents. That
 * matters: the interface's idea of a config folder is what it wrote, and what a snapshot
 * has to record is what is actually there - including a file another program changed while
 * the editor was open, which is precisely the change a user would most want to find later.
 */
export async function snapshotProject(
    git: RepoGit,
    folder: string,
    override?: SnapshotOverride,
    source: HistorySource = configFolderSource,
): Promise<HistoryWrite> {
    const ready = await ensureRepository(git);
    if (!ready.ok) return { ok: false, message: ready.message };

    let contents;
    try {
        contents = await source.read(folder);
    } catch (error) {
        return {
            ok: false,
            message: `The ${source.what} could not be read, so no history was recorded: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    try {
        await mirrorInto(git.path, contents.files);
    } catch (error) {
        return {
            ok: false,
            message: `The history copy of this folder could not be updated: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    const added = await git.run(["add", "-A", "--", "."]);
    if (!added.ok) return { ok: false, message: gitFailure("The changes could not be staged", added) };

    const status = await git.run(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
    if (!status.ok) return { ok: false, message: gitFailure("The changes could not be read", status) };

    const changes = parseStatus(status.stdout);
    if (changes.length === 0) {
        return { ok: true, revision: null, message: "Nothing had changed, so no revision was recorded." };
    }

    const existing = await git.run(["rev-parse", "--verify", "--quiet", "HEAD"]);
    const first = !existing.ok || existing.stdout.trim() === "";

    const described = describeChanges(changes, first);
    const label = override?.label ?? described.label;
    const action = override?.action ?? described.action;
    const restoredFrom = override?.restoredFrom ?? null;

    const commit = await git.run([
        "commit",
        "--no-verify",
        "--quiet",
        ...commitMessage(label, action, changes, restoredFrom),
    ]);
    if (!commit.ok) return { ok: false, message: gitFailure("The revision could not be recorded", commit) };

    const [revision] = await listRevisions(git, 1);
    return {
        ok: true,
        revision: revision ?? null,
        message: label,
    };
}

/* -------------------------------------------------------------------------- */
/* Reading one revision                                                       */
/* -------------------------------------------------------------------------- */

export interface RevisionFile {
    readonly path: string;
    readonly text: string;
}

/** Every config file exactly as it was at one revision. */
export async function readRevisionFiles(
    git: RepoGit,
    id: string,
): Promise<{ ok: true; files: RevisionFile[] } | { ok: false; message: string }> {
    const listed = await git.run(["ls-tree", "-r", "-z", "--name-only", id]);
    if (!listed.ok) return { ok: false, message: gitFailure("That revision could not be read", listed) };

    const files: RevisionFile[] = [];
    for (const path of listed.stdout.split("\0")) {
        if (path === "") continue;
        const shown = await git.run(["show", `${id}:${path}`]);
        if (!shown.ok) return { ok: false, message: gitFailure(`${path} could not be read at that revision`, shown) };
        files.push({ path, text: shown.stdout });
    }
    return { ok: true, files };
}

export interface RevisionDiffFile {
    readonly path: string;
    readonly status: ChangeStatus;
    /** A unified diff, exactly as git wrote it. Empty when git produced none. */
    readonly patch: string;
}

/**
 * The whole text of a file at each end of a comparison, so the interface can say what
 * *setting* changed rather than which lines moved.
 *
 * A unified patch is the wrong unit for a config file and everybody who has read one knows
 * it. `-sky-color: "#7dabff"` / `+sky-color: "#ffffff"` is two lines a person has to diff in
 * their head to learn one fact; "sky-color: #7dabff to #ffffff" is the fact. Producing the
 * second needs both files whole, because a setting's value can be spread over several lines
 * and a patch only carries the lines that changed.
 *
 * The reader of these is `packages/ui`, which owns the HOCON model. This layer deliberately
 * does not parse anything: it hands over the bytes and the patch, and the honest fallback
 * when the bytes cannot be parsed is the patch, which is always there.
 */
export interface RevisionComparisonFile extends RevisionDiffFile {
    /** The file's whole text at the older end, or null when it was not there or was withheld. */
    readonly before: string | null;
    /** The file's whole text at the newer end, or null when it was not there or was withheld. */
    readonly after: string | null;
    /**
     * Why a side's text is null despite the file existing there. Null when nothing was held
     * back. Stated rather than silent: an interface that quietly showed a raw patch for a
     * file it usually explains would read as a bug in the explainer.
     */
    readonly withheld: string | null;
}

/**
 * The largest file this layer will send whole for the readable diff.
 *
 * A BlueMap config is a few kilobytes; anything approaching this is not a config file the
 * interface can explain anyway, and sending megabytes across the IPC channel to produce a
 * fallback to the patch would be paying a lot for nothing.
 */
export const MAX_READABLE_BYTES = 512 * 1024;

/** The text of one path at one revision, or a stated reason for not sending it. */
async function textAt(
    git: RepoGit,
    revision: string | null,
    path: string,
): Promise<{ text: string | null; withheld: string | null }> {
    if (revision === null) return { text: null, withheld: null };

    const shown = await git.run(["show", `${revision}:${path}`]);
    if (!shown.ok) return { text: null, withheld: null };

    if (shown.stdout.length > MAX_READABLE_BYTES) {
        return {
            text: null,
            withheld: `${path} is larger than this editor reads whole, so only the raw patch is shown.`,
        };
    }
    // A NUL byte means this is not text, and every reader above expects text. Handing a
    // binary blob to a HOCON parser produces a parse error that reads as a broken config
    // file rather than as "this is not a config file".
    if (shown.stdout.includes("\u0000")) {
        return { text: null, withheld: `${path} is not a text file, so only the raw patch is shown.` };
    }
    return { text: shown.stdout, withheld: null };
}

/**
 * What changed between any two revisions, file by file.
 *
 * `from` may be null, which means "whatever came before `to`" - the parent, or the empty
 * tree for the very first revision. That case is not a convenience: the first revision has
 * no parent, `HEAD^` does not resolve, and without the empty-tree fallback the one revision
 * a user most wants to open would be the one that cannot be.
 *
 * Everything else here is the same shape as comparing a revision with its parent, which is
 * the whole point. Once two arbitrary endpoints work, "what did this revision do" is just
 * the case where the older endpoint happens to be the parent, so there is one code path
 * rather than two that can drift.
 *
 * The file list and each patch are fetched separately rather than split out of one big
 * diff. Splitting is where this kind of code goes wrong: a `diff --git` line inside a
 * config file's own contents is perfectly legal text, and a parser that cuts on it hands
 * the user a patch chopped in half at a line they wrote themselves.
 */
export async function compareRevisions(
    git: RepoGit,
    from: string | null,
    to: string,
): Promise<{ ok: true; files: RevisionComparisonFile[] } | { ok: false; message: string }> {
    let base: string | null = from;
    if (base === null) {
        const parent = await git.run(["rev-parse", "--verify", "--quiet", `${to}^`]);
        base = parent.ok && parent.stdout.trim() !== "" ? `${to}^` : null;
    }

    const range = base === null ? ["--root", to] : [base, to];

    const listed = await git.run([
        "diff-tree",
        "-r",
        "-z",
        "--no-renames",
        "--no-commit-id",
        "--name-status",
        ...range,
    ]);
    if (!listed.ok) return { ok: false, message: gitFailure("Those revisions could not be compared", listed) };

    const fields = listed.stdout.split("\0").filter((field) => field !== "");
    const files: RevisionComparisonFile[] = [];

    for (let index = 0; index + 1 < fields.length; index += 2) {
        const mark = (fields[index] ?? "").charAt(0);
        const path = fields[index + 1] ?? "";
        const status: ChangeStatus = mark === "A" ? "added" : mark === "D" ? "deleted" : "modified";

        const patch =
            base === null
                ? await git.run(["show", "--no-color", "--format=", "--no-renames", to, "--", path])
                : await git.run(["diff", "--no-color", "--no-renames", base, to, "--", path]);

        const older = status === "added" ? { text: null, withheld: null } : await textAt(git, base, path);
        const newer = status === "deleted" ? { text: null, withheld: null } : await textAt(git, to, path);

        files.push({
            path,
            status,
            patch: patch.ok ? patch.stdout : "",
            before: older.text,
            after: newer.text,
            withheld: older.withheld ?? newer.withheld,
        });
    }

    return { ok: true, files: files.sort((left, right) => left.path.localeCompare(right.path)) };
}

/**
 * What one revision changed, file by file, as a unified diff.
 *
 * Kept as its own name because it is what nearly every caller wants, and implemented on
 * {@link compareRevisions} so there is no second traversal to get subtly different.
 */
export async function revisionDiff(
    git: RepoGit,
    id: string,
): Promise<{ ok: true; files: RevisionDiffFile[] } | { ok: false; message: string }> {
    const compared = await compareRevisions(git, null, id);
    if (!compared.ok) return compared;
    return {
        ok: true,
        files: compared.files.map((file) => ({ path: file.path, status: file.status, patch: file.patch })),
    };
}

/* -------------------------------------------------------------------------- */
/* Restoring, which is itself a revision                                      */
/* -------------------------------------------------------------------------- */

/** The revision a restore is anchored to, or a sentence saying it is not in this history. */
async function findTarget(
    git: RepoGit,
    id: string,
): Promise<{ ok: true; target: HistoryRevision } | { ok: false; message: string }> {
    const revisions = await listRevisions(git);
    const target = revisions.find((revision) => revision.id === id || revision.shortId === id);
    if (target === undefined) {
        return { ok: false, message: "That revision is not in this folder's history, so nothing was changed." };
    }
    return { ok: true, target };
}

/** The files a restore intends to write, and the ones it intends to take away. */
interface RestorePlan {
    readonly write: readonly RevisionFile[];
    readonly discard: readonly string[];
    readonly skipped: readonly SkippedFile[];
}

/**
 * Performs a planned restore: snapshot, write, record.
 *
 * Every restore in this module funnels through here, and that is the point. The pre-write
 * snapshot, the append-only recording and the honest report of a record that failed after a
 * write that worked are the three properties that make restoring safe, and a second restore
 * entry point that reimplemented two of them would be the obvious way to lose the third.
 *
 * ## What is on disk is recorded *before* anything is written over it
 *
 * Usually this records nothing, because the newest revision already is what is on disk. The
 * case it exists for is the one nobody thinks about: somebody edited a file in another
 * program, or the editor has not snapshotted since the last save, and the folder holds a
 * state the history has never seen. Without this, restoring would write over a state that
 * was never recorded anywhere, which is the one way this feature could lose data - and it
 * would do it inside the button whose whole promise is that nothing gets lost.
 *
 * A failure there stops the restore rather than being carried past. That is the opposite of
 * the rule for a save, and correctly so: a save is the user's operation and a history
 * failure must not break it, whereas a restore *is* a history operation, and performing one
 * whose safety net could not be put up would be doing the dangerous half of it.
 */
async function performRestore(
    git: RepoGit,
    folder: string,
    target: HistoryRevision,
    plan: RestorePlan,
    label: string,
    source: HistorySource = configFolderSource,
): Promise<RestoreResult> {
    const before = await snapshotProject(git, folder, undefined, source);
    if (!before.ok) {
        return {
            ok: false,
            message:
                `What is in the folder now could not be recorded first, so nothing was ` +
                `overwritten: ${before.message}`,
        };
    }

    try {
        if (plan.write.length > 0) await source.write(folder, plan.write);
        if (plan.discard.length > 0) await source.remove(folder, plan.discard);
    } catch (error) {
        return {
            ok: false,
            message: `The ${source.what} could not be written, so the restore stopped part way: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    const recorded = await snapshotProject(
        git,
        folder,
        {
            label,
            action: "restored",
            restoredFrom: target.id,
        },
        source,
    );

    if (!recorded.ok) {
        // The files really were put back; only the record of it failed. Saying so is the
        // honest answer, and it is a different sentence to "the restore failed".
        return {
            ok: true,
            revision: null,
            message: `The files were restored, but the history could not record it: ${recorded.message}`,
            skipped: plan.skipped,
        };
    }

    return {
        ok: true,
        revision: recorded.revision,
        message:
            recorded.revision === null
                ? "That is already what is on disk, so nothing changed."
                : recorded.message,
        skipped: plan.skipped,
    };
}

/**
 * Writes a revision's files back into the config folder and records that as a new revision.
 *
 * Read the module doc comment for why this is not `git reset`. In short: the revision this
 * came from, the revision it replaced, and every revision in between all still exist
 * afterwards, so the user can go back to any of them - including the one they just left.
 *
 * Files the config channel will not write are skipped and *named*, not swallowed. A config
 * folder can hold a `.conf` this editor does not model, and a restore that silently failed
 * to put one back would leave the user believing the folder had been returned to a state it
 * has not been returned to.
 */
export async function restoreRevision(
    git: RepoGit,
    folder: string,
    id: string,
    source: HistorySource = configFolderSource,
    label?: string,
): Promise<RestoreResult> {
    const found = await findTarget(git, id);
    if (!found.ok) return { ok: false, message: found.message };
    const target = found.target;

    const at = await readRevisionFiles(git, target.id);
    if (!at.ok) return { ok: false, message: at.message };

    let current;
    try {
        current = await source.read(folder);
    } catch (error) {
        return {
            ok: false,
            message: `The ${source.what} could not be read, so nothing was restored: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    const skipped: SkippedFile[] = [];
    const write: RevisionFile[] = [];
    for (const file of at.files) {
        const checked = source.check(file.path);
        if (checked.ok) write.push(file);
        else skipped.push({ path: file.path, reason: checked.reason });
    }

    const wanted = new Set(at.files.map((file) => file.path));
    const discard: string[] = [];
    for (const file of current.files) {
        if (wanted.has(file.path)) continue;
        const checked = source.check(file.path);
        if (checked.ok) discard.push(file.path);
        else skipped.push({ path: file.path, reason: checked.reason });
    }

    return await performRestore(
        git,
        folder,
        target,
        { write, discard, skipped },
        // `describeRestore` says "the config", which is the wrong noun for anything else, so
        // a source that is not a config folder brings its own sentence.
        label ?? describeRestore(target),
        source,
    );
}

/**
 * Puts *some* of a revision back: the named files only, leaving every other file alone.
 *
 * This is the call that makes the history panel usable on a real folder rather than a demo
 * one. All-or-nothing restore has a failure mode that looks like success: somebody wants the
 * nether map back as it was on Tuesday, restores Tuesday, and silently loses the webserver
 * port they fixed on Wednesday. They find out weeks later, if at all. Naming the files is the
 * difference between undoing one mistake and undoing everything since one mistake.
 *
 * A named file that did not exist at that revision is *taken off the disk*, not ignored.
 * That is the honest meaning of "put this file back as it was then": it was not there then.
 * Files that are not named are not touched at all, in either direction.
 *
 * Still append-only, still snapshotted first, still recorded as a new revision - a partial
 * restore is no less undoable than a whole one.
 */
export async function restoreRevisionFiles(
    git: RepoGit,
    folder: string,
    id: string,
    paths: readonly string[],
    source: HistorySource = configFolderSource,
): Promise<RestoreResult> {
    if (paths.length === 0) {
        return { ok: false, message: "No files were chosen, so nothing was restored." };
    }

    const found = await findTarget(git, id);
    if (!found.ok) return { ok: false, message: found.message };
    const target = found.target;

    const at = await readRevisionFiles(git, target.id);
    if (!at.ok) return { ok: false, message: at.message };

    let current;
    try {
        current = await source.read(folder);
    } catch (error) {
        return {
            ok: false,
            message: `The ${source.what} could not be read, so nothing was restored: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    const atRevision = new Map(at.files.map((file) => [file.path, file.text]));
    const onDisk = new Set(current.files.map((file) => file.path));

    const skipped: SkippedFile[] = [];
    const write: RevisionFile[] = [];
    const discard: string[] = [];

    for (const path of new Set(paths)) {
        const checked = source.check(path);
        if (!checked.ok) {
            skipped.push({ path, reason: checked.reason });
            continue;
        }

        const text = atRevision.get(path);
        if (text !== undefined) {
            write.push({ path, text });
            continue;
        }
        if (onDisk.has(path)) {
            discard.push(path);
            continue;
        }
        skipped.push({
            path,
            reason: "That file was not in the chosen revision and is not in the folder now, so there was nothing to put back.",
        });
    }

    if (write.length === 0 && discard.length === 0) {
        return { ok: true, revision: null, message: "Nothing could be put back.", skipped };
    }

    const named = [...write.map((file) => file.path), ...discard].sort((left, right) =>
        left.localeCompare(right),
    );
    return await performRestore(
        git,
        folder,
        target,
        { write, discard, skipped },
        describeFileRestore(target, named),
        source,
    );
}

/**
 * Puts individual settings back, by writing files the editor has already merged.
 *
 * ### Why the merged text arrives from the caller
 *
 * Putting one setting back is not a copy, it is a merge: the file keeps every other setting,
 * every comment, and its formatting, and only the chosen keys take their old values. Doing
 * that correctly needs a HOCON reader and writer that round-trip, which is
 * `@worldlens/config`, and that package belongs to the editor rather than to this
 * process. Duplicating it here would give this feature a second HOCON implementation to
 * disagree with the one that writes every save, which is a worse outcome than the one this
 * paragraph exists to explain.
 *
 * So the editor merges and this layer writes. What the history layer still guarantees, and
 * checks rather than assumes, is everything that makes the write safe:
 *
 *  - the revision the change is attributed to **exists in this folder's history**, so a
 *    "restored from" trailer can never point at a moment that never happened;
 *  - every path is one this editor would write anyway, through `checkConfigPath`, so no
 *    crafted argument reaches outside the config folder;
 *  - every path is one that **exists at that revision or in the folder now**, so this is not
 *    a general-purpose file-creation channel wearing a restore's clothes;
 *  - what is on disk is **snapshotted first**, so the state being merged into is recoverable;
 *  - the result is recorded as a **new revision** with the `Restored-From` trailer, so it can
 *    itself be undone.
 *
 * This grants the renderer nothing it does not already have - it writes config files through
 * `config/ipc.ts` on every save - and it buys the one thing that channel cannot give: the
 * write is anchored, recorded, and reversible.
 */
export async function restoreRevisionSettings(
    git: RepoGit,
    folder: string,
    id: string,
    files: readonly RevisionFile[],
    keys: readonly string[],
    source: HistorySource = configFolderSource,
): Promise<RestoreResult> {
    if (files.length === 0) {
        return { ok: false, message: "No settings were chosen, so nothing was restored." };
    }

    const found = await findTarget(git, id);
    if (!found.ok) return { ok: false, message: found.message };
    const target = found.target;

    const at = await readRevisionFiles(git, target.id);
    if (!at.ok) return { ok: false, message: at.message };

    let current;
    try {
        current = await source.read(folder);
    } catch (error) {
        return {
            ok: false,
            message: `The ${source.what} could not be read, so nothing was restored: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    const known = new Set([...at.files.map((file) => file.path), ...current.files.map((file) => file.path)]);

    const skipped: SkippedFile[] = [];
    const write: RevisionFile[] = [];
    for (const file of files) {
        const checked = source.check(file.path);
        if (!checked.ok) {
            skipped.push({ path: file.path, reason: checked.reason });
            continue;
        }
        if (!known.has(file.path)) {
            skipped.push({
                path: file.path,
                reason:
                    "That file is neither in the chosen revision nor in the folder now, so a " +
                    "setting from it could not be put back.",
            });
            continue;
        }
        write.push({ path: file.path, text: file.text });
    }

    if (write.length === 0) {
        return { ok: true, revision: null, message: "No setting could be put back.", skipped };
    }

    return await performRestore(
        git,
        folder,
        target,
        { write, discard: [], skipped },
        describeSettingRestore(target, keys),
        source,
    );
}

/* -------------------------------------------------------------------------- */
/* Labelling a revision                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Attaches the user's own words to a revision, or takes them off again.
 *
 * A git note rather than a tag, for two reasons. A tag name has to be a valid ref, so
 * "before I broke the nether" would need mangling into something the user did not write;
 * and a note is metadata hanging off a commit rather than part of the commit, so labelling
 * changes no hash and re-labelling rewrites no history.
 */
export async function setRevisionLabel(git: RepoGit, id: string, label: string): Promise<HistoryWrite> {
    // Control characters would break the log format this module parses its own output with.
    const clean = label.replace(/[\u0000-\u001f]/g, " ").trim();

    if (clean === "") {
        const cleared = await git.run(["notes", `--ref=${LABEL_NOTES_REF}`, "remove", "--ignore-missing", id]);
        if (!cleared.ok) return { ok: false, message: gitFailure("The label could not be taken off", cleared) };
        return { ok: true, revision: null, message: "The label was taken off that revision." };
    }

    const written = await git.run(["notes", `--ref=${LABEL_NOTES_REF}`, "add", "-f", "-m", clean, id]);
    if (!written.ok) return { ok: false, message: gitFailure("The label could not be saved", written) };
    return { ok: true, revision: null, message: `That revision is now labelled "${clean}".` };
}

/* -------------------------------------------------------------------------- */
/* Retention                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Keeps the newest `keep` revisions and drops the rest. **This is destructive.**
 *
 * It is the one operation in this module that removes something a user could otherwise get
 * back, which is why the interface puts it behind the two-key gate rather than a checkbox.
 * Everything else here only ever adds.
 *
 * The rebuild is done with `commit-tree`, which is the reason this is short. Every snapshot
 * in this history is a *complete* tree rather than a delta, so the kept revisions can be
 * re-committed in order against their existing trees, preserving each one's message and
 * timestamp exactly. There is no rebase, no filter-branch, and no moment where the working
 * tree holds a state that was never a real revision.
 *
 * The old commits become unreachable and are then expired, which is what actually reclaims
 * the space; skipping that step would leave a "prune" that reported success and freed
 * nothing.
 */
export async function discardOlderRevisions(git: RepoGit, keep: number): Promise<HistoryWrite> {
    const wanted = Math.max(MIN_RETAINED_REVISIONS, Math.floor(keep));
    const revisions = await listRevisions(git);

    if (revisions.length <= wanted) {
        return {
            ok: true,
            revision: null,
            message: `This history holds ${String(revisions.length)} revisions, so nothing was removed.`,
        };
    }

    const kept = revisions.slice(0, wanted).reverse();
    const dropped = revisions.length - kept.length;

    let parent: string | null = null;
    const labels: { readonly id: string; readonly note: string }[] = [];

    for (const revision of kept) {
        const message = await git.run(["log", "-1", "--format=%B", revision.id]);
        if (!message.ok) return { ok: false, message: gitFailure("A revision could not be re-read", message) };

        const tree = await git.run(["rev-parse", `${revision.id}^{tree}`]);
        if (!tree.ok) return { ok: false, message: gitFailure("A revision's files could not be read", tree) };

        const written = await git.run(
            ["commit-tree", tree.stdout.trim(), ...(parent === null ? [] : ["-p", parent]), "-m", message.stdout.replace(/\n+$/, "")],
            { GIT_AUTHOR_DATE: revision.at, GIT_COMMITTER_DATE: revision.at },
        );
        if (!written.ok) return { ok: false, message: gitFailure("The trimmed history could not be built", written) };

        parent = written.stdout.trim();
        if (revision.note !== null) labels.push({ id: parent, note: revision.note });
    }

    if (parent === null) {
        return { ok: false, message: "The trimmed history came out empty, so nothing was changed." };
    }

    const branch = await git.run(["symbolic-ref", "--short", "HEAD"]);
    const name = branch.ok && branch.stdout.trim() !== "" ? branch.stdout.trim() : HISTORY_BRANCH;

    const moved = await git.run(["update-ref", `refs/heads/${name}`, parent]);
    if (!moved.ok) return { ok: false, message: gitFailure("The trimmed history could not be put in place", moved) };

    // The tip's tree is unchanged, so this moves no file on disk; it re-points the index at
    // the rebuilt commit so the next snapshot compares against the right thing.
    await git.run(["reset", "--quiet", "--hard", name]);

    // Labels hang off commit hashes, and every kept commit has a new one.
    await git.run(["notes", `--ref=${LABEL_NOTES_REF}`, "prune"]);
    for (const label of labels) {
        await git.run(["notes", `--ref=${LABEL_NOTES_REF}`, "add", "-f", "-m", label.note, label.id]);
    }

    await git.run(["reflog", "expire", "--expire=now", "--all"]);
    await git.run(["gc", "--prune=now", "--quiet"]);

    return {
        ok: true,
        revision: null,
        message: `${String(dropped)} older revisions were removed. The newest ${String(kept.length)} were kept.`,
    };
}

/* -------------------------------------------------------------------------- */
/* Proving it stayed local                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The remotes this repository has, which is expected to be none.
 *
 * Exposed so the interface can *show* that a history is local rather than assert it, and
 * so a test can prove it. Nothing in this module ever adds one, and no channel accepts one;
 * this is the observation, not the guarantee.
 */
export async function remoteNames(git: RepoGit): Promise<string[]> {
    const result = await git.run(["remote"]);
    if (!result.ok) return [];
    return result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
}

/** Reads a file out of the repository's working mirror. Used only by tests and diagnostics. */
export async function readMirroredFile(repository: string, path: string): Promise<string | null> {
    return await readFile(join(repository, ...path.split("/")), "utf8").catch(() => null);
}

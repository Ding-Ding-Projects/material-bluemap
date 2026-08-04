/**
 * What an automatic repair is allowed to do, and everything it is not.
 *
 * The repair pass can call a coding agent, and a coding agent is a program that writes
 * files. The whole safety of the feature is this file: an edit that does not pass
 * {@link checkEdit} is never applied, whatever the agent said, however confidently, and
 * whatever the prompt asked for. The prompt in `agent.ts` forbids the same things in
 * words, because an agent told the rules is likelier to follow them - but the words are a
 * courtesy and this is the enforcement.
 *
 * ## The rules, and the harm each one prevents
 *
 * - **Only files inside the config folder this run used.** Not the world, not the app's
 *   own installation, not anything else on the disk. An edit outside it is refused by
 *   path before anything is opened.
 * - **Only files BlueMap loads as config.** `core.conf`, `webapp.conf`, `webserver.conf`,
 *   `plugin.conf`, `maps/<name>.conf`, `storages/<name>.conf`, in either supported
 *   spelling - the same set the options editor writes, checked by the same function. A
 *   config folder somebody chose by mistake can then only cost them a file that was
 *   already a config file.
 * - **Nothing is ever deleted.** Not a config, not a tile, not a backup, not a world.
 *   Deletion is refused as a category rather than gated, because a repair pass that can
 *   delete is a repair pass nobody can safely leave switched on, and every fix these
 *   failures actually need is a write.
 * - **Nothing outside the file system at all.** No git, no network, no process. This
 *   module hands back paths and text; it has no channel to do anything else with.
 *
 * The world folder is named separately in the scope and refused explicitly even though
 * the config-folder rule already excludes it. That is deliberate belt and braces: a
 * config folder inside a world folder is an odd thing to have, and "the guard would have
 * caught it anyway" is the sentence that precedes every incident report.
 */

import { isAbsolute, join, relative, resolve } from "node:path";
import { checkConfigPath } from "../config/ipc.js";

/** A change the repair pass has been asked to make. */
export interface ProposedEdit {
    /** Only `write` is ever allowed. `delete` exists so it can be refused by name. */
    readonly kind: "write" | "delete";
    /** Relative to the config folder, or absolute inside it. */
    readonly path: string;
    /** The whole new contents of the file. Repairs replace files; they do not patch. */
    readonly text?: string;
}

export interface RepairScope {
    /** The config folder the failed run used. The only folder that may be written. */
    readonly configDir: string;
    /** World folders, refused explicitly however they are reached. */
    readonly worldPaths: readonly string[];
    /** Largest file a repair may write. A config is kilobytes. */
    readonly maxBytes?: number;
}

/** Largest config file a repair may write, matching the options editor's own cap. */
export const MAX_REPAIR_BYTES = 4 * 1024 * 1024;

export type EditCheck =
    | { readonly ok: true; readonly relativePath: string; readonly absolutePath: string; readonly text: string }
    | { readonly ok: false; readonly reason: string };

/**
 * The things an automatic repair must never do, in the words the prompt uses.
 *
 * Exported so the prompt and the enforcement are built from one list rather than two that
 * drift. A rule that is in the guard and not in the prompt produces an agent that keeps
 * proposing refused edits; one in the prompt and not in the guard produces an agent that
 * is trusted to obey it.
 */
export const FORBIDDEN_ACTIONS: readonly string[] = [
    "Do not read, write, move, rename or delete anything inside the Minecraft world folder, or anywhere else outside the config folder named below.",
    "Do not delete any file or folder, anywhere, for any reason.",
    "Do not run git. No commit, no checkout, no branch switch, no reset, no rebase, no revert, no stash, no clean, no push, no force-push, no history rewriting of any kind.",
    "Do not send the config, the logs, the paths or any part of this report anywhere: no HTTP request, no upload, no paste service, no issue, no telemetry.",
    "Do not install, update or remove software, and do not change anything outside the config folder.",
    "Do not start, stop or restart the application, the render, the web server, Docker or any container.",
    "Do not invent a cause. If the evidence does not say why this failed, answer that you do not know.",
];

/** Every world folder, resolved once so the check below is a comparison. */
function resolvedWorlds(scope: RepairScope): string[] {
    return scope.worldPaths.map((path) => resolve(path));
}

/** True when `child` is `parent` or lives inside it, case-insensitively on Windows. */
function inside(parent: string, child: string): boolean {
    const step = relative(parent, child);
    if (step === "") return true;
    return !step.startsWith("..") && !isAbsolute(step);
}

/**
 * Decides whether one proposed edit may be applied.
 *
 * Nothing here touches a disk. The decision is made about strings, so a refused edit is
 * refused before a file handle exists - which is what makes "it was never applied" a
 * property of the code rather than a claim about the order of some statements.
 */
export function checkEdit(edit: ProposedEdit, scope: RepairScope): EditCheck {
    if (edit.kind === "delete") {
        return {
            ok: false,
            reason: `Deleting ${edit.path} was refused. The repair pass never deletes anything.`,
        };
    }
    if (typeof edit.text !== "string") {
        return {
            ok: false,
            reason: `${edit.path} came with no new contents, so there was nothing to write.`,
        };
    }
    const bytes = Buffer.byteLength(edit.text, "utf8");
    const cap = scope.maxBytes ?? MAX_REPAIR_BYTES;
    if (bytes > cap) {
        return {
            ok: false,
            reason: `${edit.path} is ${String(bytes)} bytes, larger than the ${String(cap)} a config file may be.`,
        };
    }

    const configDir = resolve(scope.configDir);
    let relativePath = edit.path.trim();
    if (relativePath === "") {
        return { ok: false, reason: "An edit named an empty path, so there was nothing to change." };
    }

    if (isAbsolute(relativePath)) {
        // An absolute path is accepted only when it is genuinely inside the config folder,
        // and is then reduced to a relative name so it goes through exactly the same
        // check as one that arrived relative. Two paths into the same guard is one path
        // too many.
        const step = relative(configDir, resolve(relativePath));
        if (step === "" || step.startsWith("..") || isAbsolute(step)) {
            return {
                ok: false,
                reason: `${edit.path} is outside the config folder for this run (${scope.configDir}), so it was not changed.`,
            };
        }
        relativePath = step;
    }

    const checked = checkConfigPath(relativePath);
    if (!checked.ok) return { ok: false, reason: checked.reason };

    const absolutePath = join(configDir, checked.path);

    for (const world of resolvedWorlds(scope)) {
        if (inside(world, absolutePath)) {
            return {
                ok: false,
                reason: `${edit.path} is inside a Minecraft world folder (${world}). Nothing in a world is ever changed.`,
            };
        }
    }

    return { ok: true, relativePath: checked.path, absolutePath, text: edit.text };
}

export interface AllowedEdit {
    readonly relativePath: string;
    readonly absolutePath: string;
    readonly text: string;
}

export interface RefusedEdit {
    readonly path: string;
    readonly reason: string;
}

/**
 * Splits proposed edits into the ones that may be applied and the ones that may not.
 *
 * A refusal never fails the whole batch. An agent that proposes one good edit and one
 * that reaches outside the folder has still worked out something useful, and throwing the
 * good one away to punish the bad one helps nobody - but every refusal is reported, in
 * full, beside what was applied, so nothing is silently dropped.
 */
export function partitionEdits(
    edits: readonly ProposedEdit[],
    scope: RepairScope,
): { readonly allowed: AllowedEdit[]; readonly refused: RefusedEdit[] } {
    const allowed: AllowedEdit[] = [];
    const refused: RefusedEdit[] = [];

    // Checked in full first, so a file named twice can refuse *both* versions rather than
    // letting the first one through. Two writes to one file in one pass means the second
    // silently wins, and which one that is depends on the order an agent happened to emit
    // them - a repair whose result depends on that is a repair nobody can review.
    const checked = edits.map((edit) => ({ edit, check: checkEdit(edit, scope) }));
    const counts = new Map<string, number>();
    for (const entry of checked) {
        if (!entry.check.ok) continue;
        counts.set(entry.check.relativePath, (counts.get(entry.check.relativePath) ?? 0) + 1);
    }

    for (const { edit, check } of checked) {
        if (!check.ok) {
            refused.push({ path: edit.path, reason: check.reason });
            continue;
        }
        if ((counts.get(check.relativePath) ?? 0) > 1) {
            refused.push({
                path: edit.path,
                reason: `${check.relativePath} was named more than once in one repair, so no version of it was written.`,
            });
            continue;
        }
        allowed.push({
            relativePath: check.relativePath,
            absolutePath: check.absolutePath,
            text: check.text,
        });
    }

    return { allowed, refused };
}

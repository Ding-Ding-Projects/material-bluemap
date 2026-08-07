/**
 * Saving a project: the write, then the record of it, in that order and never the reverse.
 *
 * The ordering is the whole of this file. The write is what the person asked for; the
 * revision is the application's own bookkeeping. Recording first would mean a history
 * holding a revision for a save that then failed - a row describing an event that did not
 * happen, in the one panel whose value is that its rows are true.
 *
 * ## A failed history write never fails the save
 *
 * The file is on disk by the time the snapshot is attempted, and nothing after that point
 * can un-save it. So a history failure comes back as `historyOk: false` beside `ok: true`,
 * with the sentence to show, and the caller is left holding a result that says plainly:
 * your project is saved, and this build could not keep a record of it. Collapsing those two
 * into one boolean would force the interface to choose between telling somebody their save
 * failed when it did not, and hiding a broken history until they need it.
 */

import type { ProjectFile } from "@worldlens/config";

import type { HistoryRevision } from "../history/index.js";

import { checkWorldFolder, writeProject, type ProjectWriteOptions } from "./file.js";
import { recordProjectRevision, type ProjectHistoryOptions } from "./history.js";

export type ProjectSaveResult =
    | {
          readonly ok: true;
          /** The file that now holds this project, absolute. */
          readonly path: string;
          readonly project: ProjectFile;
          /** True when a revision was recorded, or when there was nothing new to record. */
          readonly historyOk: boolean;
          /** The revision this save created, or null when nothing had changed. */
          readonly revision: HistoryRevision | null;
          /** What the history did or could not do, in one sentence, always present. */
          readonly historyMessage: string;
      }
    | {
          readonly ok: false;
          /** Why nothing was written. The project already in the world is untouched. */
          readonly reason: string;
      };

export interface ProjectSaveOptions extends ProjectHistoryOptions {
    /** Passed through to the write guard. See {@link ProjectWriteOptions}. */
    readonly write?: ProjectWriteOptions;
}

/**
 * Writes a project into a world folder and records one revision of it.
 *
 * Exactly one revision, which is worth stating because the number is a contract rather than
 * an implementation detail: the history panel's rows have to correspond to things people
 * did, and a save that produced two rows would make every count in the interface wrong.
 * `snapshotProject` commits only when something differs, so a save that changes nothing at
 * all produces `revision: null` and says so instead of inventing a row.
 */
export async function saveProject(
    options: ProjectSaveOptions,
    worldFolder: string,
    project: ProjectFile,
): Promise<ProjectSaveResult> {
    const checked = checkWorldFolder(worldFolder);
    if (!checked.ok) return { ok: false, reason: checked.reason };

    const written = await writeProject(checked.folder, project, options.write ?? {});
    if (!written.ok) return { ok: false, reason: written.reason };

    // Past this line the save has happened. Nothing below may turn it back into a failure.
    const recorded = await recordProjectRevision(options, checked.folder, project);

    return {
        ok: true,
        path: written.path,
        project: written.project,
        historyOk: recorded.ok,
        revision: recorded.ok ? recorded.revision : null,
        historyMessage: recorded.message,
    };
}

/**
 * How large a piece a split archive is cut into, remembered per installation.
 *
 * A release asset is refused above 2 GB, so anything bigger than that has to ship as
 * numbered parts. What size those parts are is a genuine trade rather than a detail:
 *
 *  - **Smaller parts** mean a failed transfer costs less. Somebody on a connection that
 *    drops loses 500 MB and retries, rather than losing 1.7 GB and retrying that. They also
 *    need less room on the machine that joins them back together.
 *  - **Larger parts** mean fewer uploads, fewer digests and fewer requests on the way back
 *    down, and every one of those is another opportunity for something to go wrong.
 *
 * Neither is correct in general, which is why this is a setting. The default stays where it
 * has always been so an existing installation does not silently change what it publishes.
 *
 * The bounds are not this file's to invent: `@material-bluemap/parts` owns them, because it
 * owns the manifest that has to be honoured on the way back in. A second opinion here about
 * what fits under the cap is a second thing to keep correct.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
    DEFAULT_PART_SIZE,
    MAX_PART_SIZE,
    MIN_PART_SIZE,
    PART_SIZE_CHOICES,
    checkPartSize,
} from "@material-bluemap/parts";

/** Beside the app's other remembered settings, not in a config folder somebody else owns. */
export const PART_SIZE_FILE = "part-size.json";

export interface PartSizeReadout {
    readonly bytes: number;
    /** True when nothing has been chosen and this is the shipped default. */
    readonly isDefault: boolean;
    readonly defaultBytes: number;
    readonly minimumBytes: number;
    readonly maximumBytes: number;
    /** The offered sizes, each with the reason it exists, for the settings row. */
    readonly choices: readonly { readonly bytes: number; readonly label: string; readonly why: string }[];
    /** One paragraph a settings row can render without composing it itself. */
    readonly explanation: string;
}

export type PartSizeWriteResult = { readonly ok: true; readonly bytes: number } | { readonly ok: false; readonly reason: string };

interface StoredSetting {
    readonly bytes?: unknown;
}

function explain(bytes: number): string {
    const mb = Math.round(bytes / 1_000_000);
    return (
        `Archives larger than a release asset allows are cut into pieces of about ${String(mb)} MB. ` +
        "Smaller pieces mean a failed transfer costs less and the machine joining them needs less room at once; " +
        "larger pieces mean fewer uploads and fewer requests. Neither is better in general, so this is left to you."
    );
}

export class PartSizeStore {
    private readonly file: string;

    constructor(options: { readonly dataDir: string }) {
        this.file = join(options.dataDir, PART_SIZE_FILE);
    }

    read(): PartSizeReadout {
        let bytes = DEFAULT_PART_SIZE;
        let isDefault = true;

        try {
            const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
            if (typeof parsed === "object" && parsed !== null) {
                const stored = (parsed as StoredSetting).bytes;
                const checked = checkPartSize(stored);
                // A stored value outside the bounds is treated as no value rather than
                // honoured or reported: the bounds can tighten between versions, and a
                // setting that was legal when it was written should degrade to the default
                // rather than refusing every publish until somebody finds the file.
                if (checked.ok) {
                    bytes = checked.bytes;
                    isDefault = false;
                }
            }
        } catch {
            // No file, unreadable file, or not JSON. All three mean "nothing was chosen".
        }

        return {
            bytes,
            isDefault,
            defaultBytes: DEFAULT_PART_SIZE,
            minimumBytes: MIN_PART_SIZE,
            maximumBytes: MAX_PART_SIZE,
            choices: PART_SIZE_CHOICES.map((choice) => ({ ...choice })),
            explanation: explain(bytes),
        };
    }

    write(bytes: unknown): PartSizeWriteResult {
        const checked = checkPartSize(bytes);
        if (!checked.ok) return { ok: false, reason: checked.message };

        try {
            writeFileSync(this.file, `${JSON.stringify({ bytes: checked.bytes }, null, 4)}\n`, "utf8");
        } catch (error) {
            // Reported rather than thrown, and deliberately not fatal: the size is usable
            // for this session even when it could not be remembered, and a publish that
            // refused to start because a preferences file is read-only would be a worse
            // outcome than one that forgets the preference.
            return {
                ok: false,
                reason: `The size could not be remembered: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
        return { ok: true, bytes: checked.bytes };
    }
}

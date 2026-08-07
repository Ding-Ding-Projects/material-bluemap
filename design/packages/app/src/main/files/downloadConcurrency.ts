/**
 * How many release-asset parts a download fetches at once, remembered per installation.
 *
 * `download/downloader.ts` has always accepted a `concurrency` option and honoured it
 * correctly inside `fetchParts` - the plumbing was never the problem. What was missing is
 * that the option was a plain number, captured once in `download/ipc.ts` when
 * `installDownloadIpc` was called at app launch, so nothing could ever change it short of
 * restarting the application. A settings-exposure audit flagged exactly that: a genuine
 * "how many parallel workers" decision - it trades download speed against bandwidth and
 * disk contention - sitting behind a control that would not have worked if it had been
 * built, because the value it would have written was never read again.
 *
 * This file is the other half: a persisted, bounded choice, read fresh on every download
 * the same way `renderMemory.ts`'s ceiling is read fresh on every render. See
 * `downloader.ts`'s own `ReleaseDownloaderOptions.concurrency`, which now accepts a
 * function for exactly this reason.
 *
 * ## Where the bounds come from
 *
 * Not the release format and not a shared package's default - there is no such package
 * here, unlike the part-size settings this audit also looked at and did not turn into
 * controls (see `docs/backup.md` and `cirender/sync.ts` for why not). This is a plain
 * "how many things happen at once" knob, so the bounds are worked out from what actually
 * happens on either side of it:
 *
 *  - **One** is always a safe floor: a fully sequential download, the same shape a
 *    resumed transfer already falls back to when everything but the part in flight is
 *    still on disk. Nothing below it is meaningful - zero workers download nothing.
 *  - **Sixteen** is the ceiling. A rendered world is rarely more than a handful of parts
 *    even at the small end of the part-size range (`@worldlens/parts`' own
 *    `MIN_PART_SIZE` is 100 MB, so even a modest multi-gigabyte world is a few dozen parts
 *    at most), so a number far past that buys nothing: the workers past the part count are
 *    already unused by `Math.min(concurrency, queue.length)` in `fetchParts`. What a very
 *    high number *does* do is open that many sockets against the same host at once and
 *    write that many files to the same disk at once, competing for the one connection and
 *    the one disk a typical desktop actually has, which is the "disk contention" half of
 *    the trade-off this setting exists to let somebody make on purpose rather than by
 *    accident.
 *
 * ## The default stays where it has always been
 *
 * Four, unchanged, so an existing installation's downloads do not silently get faster or
 * slower the day this setting ships - the same reasoning `PartSizeStore` used to state for
 * a setting that never actually shipped anywhere.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The smallest number of parts worth fetching at once: one, i.e. sequential. */
export const MIN_CONCURRENCY = 1;

/** The largest number this setting will accept. See the file doc for why. */
export const MAX_CONCURRENCY = 16;

/** What `downloader.ts` has always defaulted to. Unchanged, so nothing gets faster or slower unasked. */
export const DEFAULT_CONCURRENCY = 4;

export interface DownloadConcurrencySetting {
    readonly workers: number;
    /** True when nothing has been chosen and this is the shipped default. */
    readonly isDefault: boolean;
}

export type ConcurrencyProblem =
    | { readonly ok: true; readonly workers: number }
    | { readonly ok: false; readonly reason: string };

/**
 * Checks a number somebody typed, and says plainly why it cannot be used.
 *
 * Refused here costs nothing; the same number discovered mid-download has already opened
 * sockets and started writing files before anybody could tell it was a bad idea.
 */
export function validateConcurrency(workers: unknown): ConcurrencyProblem {
    if (typeof workers !== "number" || !Number.isFinite(workers)) {
        return { ok: false, reason: "A worker count has to be a whole number." };
    }
    const rounded = Math.round(workers);
    if (rounded < MIN_CONCURRENCY) {
        return {
            ok: false,
            reason: `At least ${String(MIN_CONCURRENCY)} part has to be fetched at a time - zero workers download nothing.`,
        };
    }
    if (rounded > MAX_CONCURRENCY) {
        return {
            ok: false,
            reason:
                `${String(rounded)} is more than the ${String(MAX_CONCURRENCY)} this setting allows. ` +
                "A download rarely has more parts than that to begin with, and past it every extra " +
                "worker only opens another connection to the same host and writes to the same disk, " +
                "competing with the workers already running rather than finishing anything sooner.",
        };
    }
    return { ok: true, workers: rounded };
}

/**
 * The plain explanation shown beside the control.
 *
 * States the trade-off in both directions, because a number with no explanation is one
 * people either leave alone out of caution or max out hoping for speed.
 */
export function describeConcurrency(workers: number): string {
    const parts = workers === 1 ? "one part" : `${String(workers)} parts`;
    return (
        `Up to ${parts} of a split download are fetched at once. More at a time can finish a fast, ` +
        "reliable connection sooner; too many compete for the same bandwidth and write to the same " +
        "disk at the same time, which can make every part crawl instead of one at a time finishing " +
        "quickly - the setting to lower on a slow, metered or flaky connection."
    );
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/** Beside the app's other remembered settings, not in a config folder somebody else owns. */
export const DOWNLOAD_CONCURRENCY_FILE = "download-concurrency.json";

interface StoredSetting {
    readonly workers?: unknown;
}

export interface DownloadConcurrencyStoreOptions {
    /** Electron's `userData`. */
    readonly dataDir: string;
}

/**
 * Reads and writes how many parts a download fetches at once, and can always answer.
 *
 * A missing, unreadable or nonsensical file means the shipped default, never a stored
 * number that happened to parse: a corrupted settings file must not be able to hand a
 * download a worker count outside the bounds this store itself enforces on the way in.
 */
export class DownloadConcurrencyStore {
    private readonly file: string;

    constructor(options: DownloadConcurrencyStoreOptions) {
        this.file = join(options.dataDir, DOWNLOAD_CONCURRENCY_FILE);
    }

    read(): DownloadConcurrencySetting {
        const workers = this.storedWorkers();
        return { workers, isDefault: workers === DEFAULT_CONCURRENCY };
    }

    private storedWorkers(): number {
        let parsed: unknown;
        try {
            parsed = JSON.parse(readFileSync(this.file, "utf8"));
        } catch {
            return DEFAULT_CONCURRENCY;
        }
        if (typeof parsed !== "object" || parsed === null) return DEFAULT_CONCURRENCY;

        const checked = validateConcurrency((parsed as StoredSetting).workers);
        // A stored value outside today's bounds - the bounds tightened between versions,
        // or the file was hand-edited - degrades to the default rather than refusing every
        // download until somebody finds the file.
        return checked.ok ? checked.workers : DEFAULT_CONCURRENCY;
    }

    /**
     * Records a choice, and answers with what was actually stored. Never throws.
     *
     * There is no separate "reset" method: the default is a plain number like any other
     * choice, not a distinct mode the way `RenderMemoryStore`'s machine-derived
     * "automatic" is, so writing {@link DEFAULT_CONCURRENCY} back is a normal write and
     * {@link read} already reports it as the default by value.
     */
    write(workers: unknown): ConcurrencyProblem {
        const checked = validateConcurrency(workers);
        if (!checked.ok) return checked;
        this.persist({ workers: checked.workers });
        return checked;
    }

    /** The worker count a download should be started with right now. */
    concurrency(): number {
        return this.read().workers;
    }

    private persist(setting: { readonly workers: number }): void {
        try {
            mkdirSync(dirname(this.file), { recursive: true });
            // Staged then renamed, so a crash mid-write cannot leave a half-written file
            // that parses as a different, smaller number than the one that was chosen.
            const staging = `${this.file}.writing`;
            writeFileSync(staging, `${JSON.stringify(setting, null, 4)}\n`, "utf8");
            renameSync(staging, this.file);
        } catch {
            // A settings file that cannot be written must never stop a download from
            // starting. The choice applies for this session and is reported as unsaved by
            // the caller reading it back.
        }
    }
}

/**
 * How much memory the render JVM is allowed to take, as a setting somebody chose.
 *
 * `render/orchestrator.ts` has always forwarded `jvmArgs` to `render/runner.ts`, which
 * places them before `-jar` exactly where a JVM wants them - and nothing has ever passed
 * any. The only caller was a unit test asserting `-Xmx4G` reached the argument list. So the
 * plumbing shipped, the setting did not, and every render this app has ever run used
 * whatever heap the JVM picked for itself.
 *
 * That default is a quarter of physical memory on most machines, and BlueMap will use all
 * of it: a render of a large world with an unbounded heap is the classic "my whole computer
 * froze" report, because the JVM takes the memory, the operating system starts swapping,
 * and every other application on the machine stops responding while a background render
 * finishes. A ceiling is what turns that into a render that is merely slower.
 *
 * ## `-Xmx`, not `-XX:MaxRAM`
 *
 * They are not the same control and picking the wrong one produces a setting that does
 * nothing. `-XX:MaxRAM` tells the JVM how much memory to *pretend* the machine has when it
 * derives its own ergonomic defaults; the heap it then chooses is a fraction of that, and
 * it may still grow past it under pressure. `-Xmx` is the hard ceiling: the heap never
 * exceeds it, and a render that needs more fails with an `OutOfMemoryError` rather than
 * taking the machine down with it. A failed render somebody can retry with a bigger number
 * is a far better outcome than a frozen desktop.
 *
 * ## Where this file lives
 *
 * Beside the path resolution rather than inside `render/`, because it is a small persisted
 * settings file this application owns on disk - the same category as everything else in
 * this directory - and because `render/` is written to be driven by its caller rather than
 * to read settings of its own.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Bytes in a mebibyte, spelled once so the arithmetic below reads as arithmetic. */
const MB = 1024 * 1024;

/**
 * The smallest ceiling worth offering.
 *
 * BlueMap loads resource packs, block models and a chunk cache before it renders anything;
 * below a gibibyte it does not fail gracefully, it thrashes the garbage collector for hours
 * and then fails anyway. Refusing the number is more useful than accepting it.
 */
export const MIN_CEILING_MB = 1024;

/**
 * The largest ceiling the automatic default will ever pick for somebody.
 *
 * Not a limit on what a person may type - a 128 GB machine rendering a huge world may well
 * want more - but a limit on what the app decides on their behalf without being asked.
 */
export const MAX_AUTOMATIC_MB = 8192;

/** Memory left for Windows, this app, and whatever else the person is doing. */
export const RESERVED_FOR_SYSTEM_MB = 2048;

/** Ceilings are rounded to this, so the settings row shows round numbers. */
const STEP_MB = 256;

export type MemoryMode = "automatic" | "manual";

export interface RenderMemorySetting {
    readonly mode: MemoryMode;
    /** The ceiling in mebibytes. For `automatic` this is the derived recommendation. */
    readonly megabytes: number;
}

/** Total physical memory in mebibytes, from `os.totalmem()`. */
export function totalMemoryMb(totalBytes: number): number {
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return 0;
    return Math.floor(totalBytes / MB);
}

/**
 * What to give the JVM on this machine when nobody has chosen.
 *
 * Half of physical memory, rounded down to a round number, never more than
 * {@link MAX_AUTOMATIC_MB}, and never so much that less than
 * {@link RESERVED_FOR_SYSTEM_MB} is left for everything else. On a machine too small to
 * satisfy both, the floor wins: a render that might fail is better than a machine that
 * certainly stalls, and the settings row says the number is the minimum rather than a
 * recommendation.
 */
export function recommendedCeilingMb(totalBytes: number): number {
    const total = totalMemoryMb(totalBytes);
    if (total <= 0) return MIN_CEILING_MB;

    const half = Math.floor(total / 2 / STEP_MB) * STEP_MB;
    const leavingRoom = Math.floor((total - RESERVED_FOR_SYSTEM_MB) / STEP_MB) * STEP_MB;
    const chosen = Math.min(half, leavingRoom, MAX_AUTOMATIC_MB);
    return Math.max(MIN_CEILING_MB, chosen);
}

export type MemoryProblem =
    | { readonly ok: true; readonly megabytes: number }
    | { readonly ok: false; readonly reason: string };

/**
 * Checks a number somebody typed, and says plainly why it cannot be used.
 *
 * The upper bound is physical memory, not `MAX_AUTOMATIC_MB`: a person with 64 GB may
 * deliberately want 32, and the automatic cap exists to stop the app deciding that, not to
 * stop them. What is refused is a heap larger than the machine has, because that is not a
 * bold choice - the JVM either refuses to start or starts and swaps.
 */
export function validateCeiling(megabytes: unknown, totalBytes: number): MemoryProblem {
    if (typeof megabytes !== "number" || !Number.isFinite(megabytes)) {
        return { ok: false, reason: "A memory limit has to be given as a number of megabytes." };
    }
    const rounded = Math.round(megabytes);
    if (rounded < MIN_CEILING_MB) {
        return {
            ok: false,
            reason:
                `${String(rounded)} MB is below the ${String(MIN_CEILING_MB)} MB BlueMap needs to load its ` +
                "resources at all. A render at that size does not run slowly, it fails after a long wait.",
        };
    }
    const total = totalMemoryMb(totalBytes);
    if (total > 0 && rounded > total) {
        return {
            ok: false,
            reason:
                `${String(rounded)} MB is more memory than this machine has (${describeMegabytes(total)}). ` +
                "The render would either refuse to start or spend its time swapping to disk.",
        };
    }
    return { ok: true, megabytes: rounded };
}

/** `4096 MB (4.0 GB)`, so the unit is never in doubt and the number is never rounded away. */
export function describeMegabytes(megabytes: number): string {
    const gigabytes = megabytes / 1024;
    return `${String(megabytes)} MB (${gigabytes.toFixed(1)} GB)`;
}

/**
 * The plain explanation shown beside the control.
 *
 * States the number, the unit, what it does and what happens when it is too small, because
 * a memory setting with no explanation is a number people either ignore or maximise.
 */
export function describeCeiling(setting: RenderMemorySetting, totalBytes: number): string {
    const total = totalMemoryMb(totalBytes);
    const machine = total > 0 ? ` of this machine's ${describeMegabytes(total)}` : "";
    const chosen = setting.mode === "automatic" ? "Chosen automatically" : "Set by you";
    return (
        `${chosen}: the render may use up to ${describeMegabytes(setting.megabytes)}${machine}. ` +
        "Rendering a large world with no limit is how a background render makes the whole machine unresponsive. " +
        "If a render stops with an out-of-memory error, raise this; if the machine struggles while one runs, lower it."
    );
}

/**
 * The JVM arguments for a ceiling, ready for `RenderRequest.jvmArgs`.
 *
 * `runner.ts` places these before `-jar`, which is where the JVM reads them; anything after
 * it is an argument to BlueMap instead and is silently ignored by the JVM. That ordering is
 * already correct there and this function relies on it rather than restating it.
 */
export function jvmArgsForCeiling(setting: RenderMemorySetting): readonly string[] {
    return [`-Xmx${String(Math.round(setting.megabytes))}m`];
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/** The file name, under the app's own data directory and nowhere near a user's folder. */
export const RENDER_MEMORY_FILE = "render-memory.json";

interface StoredSetting {
    readonly mode?: unknown;
    readonly megabytes?: unknown;
}

export interface RenderMemoryStoreOptions {
    /** Electron's `userData`. */
    readonly dataDir: string;
    /** `os.totalmem()`, injected so the whole store is testable on any machine. */
    readonly totalMemoryBytes: number;
}

/**
 * Reads and writes the ceiling, and can always answer.
 *
 * A missing, unreadable or nonsensical file means "automatic", never a stored number that
 * happened to parse: a corrupted settings file must not be able to hand the JVM a heap
 * larger than the machine, which is the one failure mode this setting exists to prevent.
 */
export class RenderMemoryStore {
    private readonly file: string;
    private readonly totalMemoryBytes: number;

    constructor(options: RenderMemoryStoreOptions) {
        this.file = join(options.dataDir, RENDER_MEMORY_FILE);
        this.totalMemoryBytes = options.totalMemoryBytes;
    }

    /** The machine's memory, so the settings row can state it without asking `os` itself. */
    machineMemoryBytes(): number {
        return this.totalMemoryBytes;
    }

    read(): RenderMemorySetting {
        const automatic: RenderMemorySetting = {
            mode: "automatic",
            megabytes: recommendedCeilingMb(this.totalMemoryBytes),
        };

        let parsed: unknown;
        try {
            parsed = JSON.parse(readFileSync(this.file, "utf8"));
        } catch {
            return automatic;
        }
        if (typeof parsed !== "object" || parsed === null) return automatic;

        const stored = parsed as StoredSetting;
        if (stored.mode !== "manual") return automatic;

        const checked = validateCeiling(stored.megabytes, this.totalMemoryBytes);
        // A stored value the machine can no longer honour - the file came from a bigger
        // machine, or memory was removed - falls back rather than being handed to a JVM
        // that would refuse to start with it.
        if (!checked.ok) return automatic;
        return { mode: "manual", megabytes: checked.megabytes };
    }

    /** Records a choice, and answers with what was actually stored. Never throws. */
    write(setting: RenderMemorySetting): MemoryProblem {
        if (setting.mode === "automatic") {
            this.persist({ mode: "automatic", megabytes: recommendedCeilingMb(this.totalMemoryBytes) });
            return { ok: true, megabytes: recommendedCeilingMb(this.totalMemoryBytes) };
        }
        const checked = validateCeiling(setting.megabytes, this.totalMemoryBytes);
        if (!checked.ok) return checked;
        this.persist({ mode: "manual", megabytes: checked.megabytes });
        return checked;
    }

    /** The arguments a render should be started with right now. */
    jvmArgs(): readonly string[] {
        return jvmArgsForCeiling(this.read());
    }

    private persist(setting: RenderMemorySetting): void {
        try {
            mkdirSync(dirname(this.file), { recursive: true });
            // Staged then renamed, so a crash mid-write cannot leave a half-written file
            // that parses as a different, smaller number than the one that was chosen.
            const staging = `${this.file}.writing`;
            writeFileSync(staging, `${JSON.stringify(setting, null, 4)}\n`, "utf8");
            renameSync(staging, this.file);
        } catch {
            // A settings file that cannot be written must never stop a render from
            // starting. The choice applies for this session and is reported as unsaved by
            // the caller reading it back.
        }
    }
}

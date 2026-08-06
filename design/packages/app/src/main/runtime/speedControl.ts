/**
 * Adjusting a running render's speed, live, for exactly the two levers that can genuinely
 * move while the process is already going: this machine's own OS scheduling priority for
 * a local JVM, and the CPU quota Docker's daemon enforces on a running container.
 *
 * ## What this deliberately does not touch
 *
 * The novice "Speed" dial (`ui/src/components/config/speedLevels.ts`) writes two raw
 * `core.conf` fields, `render-thread-count` and `render-thread-priority`. Both are read by
 * BlueMap's own Java process exactly once, at startup, to size a fixed thread pool - there
 * is no reload hook, no signal, no config-watch, nothing this application or upstream
 * exposes that reaches into a running JVM and resizes that pool or re-primes its threads'
 * priorities. So neither of those two numbers is touched here, ever, no matter what level
 * is asked for. What changes here is coarser and outside the JVM entirely: how much of the
 * host's scheduler attention the whole process gets (local), or how much of the host's CPU
 * the container's cgroup is allowed to spend (Docker). That is real, it is live, and it is
 * everything this file claims to do - never more.
 *
 * ## Why the mapping stops short of the OS's own maximum
 *
 * `os.constants.priority.PRIORITY_HIGHEST` exists and Node will accept it, but on Windows
 * raising a process there needs a privilege this application must never ask for, and an
 * unprivileged request is *silently* reduced to `PRIORITY_HIGH` - see `node:os`'s own
 * documentation on `setPriority`. Stopping the mapping at `PRIORITY_HIGH` for level 5 is
 * not a missed opportunity; it is naming the level an unprivileged process can actually
 * reach as the level the dial's top rung asks for, rather than asking for a level that
 * quietly becomes a different one and reporting the request as though it landed.
 *
 * ## Why Docker's mapping only really moves in its lower half
 *
 * `docker update --cpus` sets a cgroup quota, and a container can never be handed more CPU
 * than the host reports having. Before this feature existed no render ever set `--cpus` at
 * all, so the container's real starting condition is already "every core the host has" -
 * which is also the only honest value for the top of this dial. Levels 4 and 5 therefore
 * both resolve to the same quota as the unthrottled baseline: there is nothing further to
 * grant, and pretending otherwise by inventing a number past the host's own core count
 * would be exactly the "control that moves and changes nothing real" failure this feature
 * exists to avoid. Levels 1-2 are where the dial does something a container can actually
 * feel.
 */

import { constants as osConstants, cpus, getPriority as osGetPriority, setPriority as osSetPriority } from "node:os";
import { execFileCommandRunner, type CommandOutput, type CommandRunner } from "./command.js";

/** One rung of the live speed dial. Deliberately the same five numbers as the novice dial. */
export type SpeedLevelNumber = 1 | 2 | 3 | 4 | 5;

/** True for exactly the five integers a live speed request may name. */
export function isSpeedLevel(value: unknown): value is SpeedLevelNumber {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

/* ----------------------------------------------------------------- local: OS priority ---- */

export interface LocalPriorityLevel {
    readonly level: SpeedLevelNumber;
    /** The `os.constants.priority.*` value this level asks for. */
    readonly priority: number;
    /** What to call it on screen. */
    readonly label: string;
}

/**
 * The five OS priority classes a live level can ask for, gentlest to fastest.
 *
 * Bounded at `PRIORITY_HIGH` rather than `PRIORITY_HIGHEST` - see this file's own header
 * comment for why reaching further would mean silently asking for a level the OS quietly
 * substitutes on Windows without elevation.
 */
export const LOCAL_PRIORITY_LEVELS: readonly LocalPriorityLevel[] = [
    { level: 1, priority: osConstants.priority.PRIORITY_LOW, label: "Low (background)" },
    { level: 2, priority: osConstants.priority.PRIORITY_BELOW_NORMAL, label: "Below normal" },
    { level: 3, priority: osConstants.priority.PRIORITY_NORMAL, label: "Normal" },
    { level: 4, priority: osConstants.priority.PRIORITY_ABOVE_NORMAL, label: "Above normal" },
    { level: 5, priority: osConstants.priority.PRIORITY_HIGH, label: "High" },
];

/** The priority level 3 asks for - the OS's own default, and this dial's baseline. */
export const LOCAL_PRIORITY_BASELINE_LEVEL: SpeedLevelNumber = 3;

export function localPriorityForLevel(level: SpeedLevelNumber): LocalPriorityLevel {
    const found = LOCAL_PRIORITY_LEVELS.find((entry) => entry.level === level);
    if (found === undefined) throw new Error(`No such speed level: ${String(level)}`);
    return found;
}

/** The level whose priority matches a raw OS priority value exactly, or null for none. */
export function localPriorityLevelFor(priority: number): LocalPriorityLevel | null {
    return LOCAL_PRIORITY_LEVELS.find((entry) => entry.priority === priority) ?? null;
}

export interface PriorityControl {
    readonly setPriority?: (pid: number, priority: number) => void;
    readonly getPriority?: (pid: number) => number;
}

export interface LocalPriorityResult {
    readonly ok: boolean;
    readonly requested: LocalPriorityLevel;
    /** What the OS actually holds after the attempt, or null when it could not be read. */
    readonly applied: number | null;
    /**
     * True when the OS accepted the call but gave the process a *lower* priority than was
     * asked for - the documented Windows behaviour for a request past what an unprivileged
     * process may hold. Never a thrown error: a refused raise is a normal outcome with an
     * explanation, not a failure.
     */
    readonly refused: boolean;
    /** Set only when the call itself threw - e.g. the process has already exited. */
    readonly error: string | null;
}

/**
 * Sets a live process's OS scheduling priority for one speed level.
 *
 * Never throws. `os.setPriority` can fail for reasons entirely outside anyone's control -
 * most commonly that the process named by `pid` ended in the instant between the caller
 * checking it was alive and this call reaching the kernel - and that race is exactly why
 * the failure is returned as a value rather than allowed to become an unhandled exception
 * three frames above a person who only dragged a slider.
 */
export function applyLocalPriority(
    pid: number,
    level: SpeedLevelNumber,
    control: PriorityControl = {},
): LocalPriorityResult {
    const requested = localPriorityForLevel(level);
    const setPriority = control.setPriority ?? osSetPriority;
    const getPriority = control.getPriority ?? osGetPriority;

    try {
        setPriority(pid, requested.priority);
    } catch (error) {
        return { ok: false, requested, applied: null, refused: false, error: describe(error) };
    }

    let applied: number | null = null;
    try {
        applied = getPriority(pid);
    } catch {
        // The set above succeeded; a read failing right after is not the set's failure to
        // report, so this keeps `ok: true` and simply cannot say what landed.
        applied = null;
    }

    // Lower priority classes carry a *larger* nice-style number (see LOCAL_PRIORITY_LEVELS'
    // own values, from node:os): PRIORITY_LOW is 19, PRIORITY_HIGH is -14. A refusal shows
    // up as the OS holding a larger number than the one that was asked for.
    const refused = applied !== null && applied > requested.priority;
    return { ok: true, requested, applied, refused, error: null };
}

/* -------------------------------------------------------------- docker: --cpus quota ---- */

export interface DockerCpuQuota {
    readonly level: SpeedLevelNumber;
    /** The exact value passed to `docker update --cpus`. */
    readonly cpus: number;
    /** True for the levels that mean "every core the host has", i.e. no cap at all. */
    readonly unlimited: boolean;
}

/**
 * The `--cpus` quota a live level asks a container for, given how many logical cores this
 * host reports (`node:os`'s own `cpus().length`, the same figure the novice dial's own
 * `-N`-relative thread counts are documented against).
 *
 * Levels 3 through 5 all resolve to `unlimited: true` - see this file's header comment for
 * why a container cannot be handed more than the host has, and why that makes the
 * unthrottled state both the ceiling and this render's condition before the feature
 * existed. `docker update --cpus 0` is Docker's own documented way to remove a quota
 * entirely (`docker update --help`: "0 means no limit"), used here in preference to naming
 * the host's core count explicitly, so a container already throttled by an earlier level
 * genuinely returns to "uncapped" rather than to "capped at today's core count".
 */
export function dockerCpuQuotaForLevel(level: SpeedLevelNumber, totalCpus: number): DockerCpuQuota {
    const total = Math.max(1, Math.floor(totalCpus));
    if (level >= LOCAL_PRIORITY_BASELINE_LEVEL) return { level, cpus: 0, unlimited: true };

    const fraction = level === 1 ? 0.25 : 0.5;
    // Rounded to the nearest half core - Docker accepts fractional `--cpus` - and never
    // below half a core, so "gentle" still means "makes progress" rather than "stalled".
    const quota = Math.max(0.5, Math.round(total * fraction * 2) / 2);
    return { level, cpus: quota, unlimited: false };
}

export interface DockerCpuControl {
    readonly docker?: string;
    readonly runner?: CommandRunner;
}

export interface DockerCpuResult {
    readonly ok: boolean;
    readonly quota: DockerCpuQuota;
    /** Docker's own complaint, when the update was refused - a stopped container, usually. */
    readonly error: string | null;
}

/**
 * Asks the *daemon* to change a running container's CPU quota, by name.
 *
 * The same reasoning as cancellation elsewhere in `runtime/`: a container is addressed by
 * name because the daemon, not this application, owns its lifetime, and the same
 * injectable {@link CommandRunner} every other Docker call in this codebase uses is used
 * here too, so a test can prove the exact command without a daemon anywhere near the test
 * machine, and so a container that has already stopped reports a normal, explained refusal
 * rather than throwing.
 */
export async function applyDockerCpuQuota(
    containerName: string,
    level: SpeedLevelNumber,
    totalCpus: number,
    control: DockerCpuControl = {},
): Promise<DockerCpuResult> {
    const quota = dockerCpuQuotaForLevel(level, totalCpus);
    const runner = control.runner ?? execFileCommandRunner;
    const docker = control.docker ?? "docker";
    const output = await runner(docker, dockerUpdateCpusArguments(containerName, quota.cpus), {});
    if (output.ok) return { ok: true, quota, error: null };
    return { ok: false, quota, error: firstLine(output) };
}

/** `docker update --cpus <value> <name>`, exposed so a test can assert the exact command. */
export function dockerUpdateCpusArguments(containerName: string, quotaCpus: number): string[] {
    return ["update", "--cpus", String(quotaCpus), containerName];
}

/** The host's own logical core count, for the caller that has not already measured it. */
export function hostCpuCount(): number {
    return Math.max(1, cpus().length);
}

function firstLine(output: CommandOutput): string {
    const text = output.stderr.trim() !== "" ? output.stderr : output.stdout;
    const line = text
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);
    if (line !== undefined) return line;
    if (output.spawnError !== null) return `Docker could not be started (${output.spawnError}).`;
    return `docker update exited${output.exitCode === null ? "" : ` with code ${String(output.exitCode)}`}.`;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

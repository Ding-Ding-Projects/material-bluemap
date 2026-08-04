/**
 * Working out why a run failed, without asking anything that can guess.
 *
 * This module is the reason the repair pass is safe to switch on. Every failure below is
 * one this project already knows the shape of: the engine prints a specific sentence, or
 * the operating system returns a specific code, and the fix follows from that with no
 * judgement involved. A language model adds nothing to "the port is in use" except the
 * chance of being confidently wrong about it, and it is precisely the confident wrongness
 * that would edit somebody's config.
 *
 * So the order is: **decide here first, ask nothing if this decided.** The coding agent in
 * `agent.ts` is only ever reached for a failure that matches none of these patterns.
 *
 * ## The patterns are quoted from upstream, not invented
 *
 * Each one below is taken from the vendored BlueMap source that prints it, with the file
 * named in the comment above it, so a reader can check the claim and an upstream bump can
 * be checked against it. Matching prose is fragile by nature - that is the cost of an
 * engine whose only failure channel is a log - and the mitigation is that the fragility is
 * visible and tested rather than spread through the codebase as hopeful `includes` calls.
 *
 * A pattern that stops matching after an upstream change degrades to "unexplained", which
 * is the correct failure mode: the pass says it could not work out why, rather than
 * matching something else by accident.
 */

import type { SettingsTarget } from "../render/failure.js";
import type { RepairEvidence } from "./evidence.js";
import { evidenceText } from "./evidence.js";

export type RepairDiagnosisCode =
    /** The Mojang download was never accepted, so the engine refused to start. */
    | "download-not-accepted"
    /** Something is already listening on the port the web server wanted. */
    | "port-in-use"
    /** There is no Java to run, or the `java` this app was told to use is not there. */
    | "java-missing"
    /** Java is there and is older than the engine's class files. */
    | "java-too-old"
    /** The JVM ran out of heap, or the container was killed for using too much. */
    | "out-of-memory"
    /** A world folder is missing, is not a folder, or cannot be read. */
    | "world-unreadable"
    /** The output folder cannot be written: permission, read-only disk, or full disk. */
    | "output-not-writable"
    /** BlueMap itself refused the config with a parse or access error. */
    | "config-rejected"
    /** The run asked for Docker and Docker is not usable. */
    | "docker-unavailable"
    /** Docker is running but the image could not be obtained. */
    | "docker-image-unavailable";

/** What would fix it, and how much of that this app can do by itself. */
export type RepairRemedyKind =
    /** Start it again with a changed setting, which this app can do unattended. */
    | "retry"
    /** A person has to change something in Settings; the anchor says where. */
    | "setting"
    /** A config file needs editing, and the edit is known. */
    | "config"
    /** Nothing here can act; the sentence says what a person has to do. */
    | "manual";

export interface RetryAdjustment {
    /**
     * The port to try instead.
     *
     * `0` means "ask the operating system for a free one", which is a real port number to
     * bind and the only choice that cannot collide with whatever took the last one.
     */
    readonly port: number | null;
    /** A larger heap, in megabytes, for a run that ran out of one. */
    readonly heapMegabytes: number | null;
}

export interface RepairRemedy {
    readonly kind: RepairRemedyKind;
    /** One sentence naming the fix, in words somebody can act on. */
    readonly summary: string;
    /** Where in Settings this is changed, when a setting is what changes it. */
    readonly settings: SettingsTarget | null;
    readonly retry: RetryAdjustment | null;
}

export interface RepairDiagnosis {
    readonly code: RepairDiagnosisCode;
    /** What is wrong, said plainly. */
    readonly message: string;
    /**
     * The evidence this was decided from, quoted.
     *
     * Never a paraphrase. A diagnosis a person cannot check against the engine's own
     * words is a diagnosis they have to take on trust, and this pass is going to offer to
     * change their files.
     */
    readonly because: string;
    readonly remedy: RepairRemedy;
}

/* -------------------------------------------------------------------------- */
/* The patterns                                                               */
/* -------------------------------------------------------------------------- */

/** `BlueMapCLI.startWebserver` catches `BindException` and prints this. */
const BIND_REFUSED =
    /BlueMap failed to bind to the configured address|already in use by some other program|java\.net\.BindException|Address already in use|EADDRINUSE/i;

/** Docker refuses the publish before the container starts, with its own wording. */
const DOCKER_PORT_TAKEN = /port is already allocated|Bind for [^\s]+ failed/i;

/** What a shell says when `java` is not where it was told to look. */
const JAVA_NOT_FOUND =
    /is not recognized as an internal or external command|java: command not found|command not found: java|No such file or directory[^\n]*java/i;

/** `UnsupportedClassVersionError` is the JVM's own words for "this jar is newer than me". */
const JAVA_TOO_OLD =
    /UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime|class file version \d+(?:\.\d+)?/i;

const OUT_OF_MEMORY =
    /java\.lang\.OutOfMemoryError|Could not reserve enough space for object heap|There is insufficient memory for the Java Runtime Environment|GC overhead limit exceeded|Java heap space/i;

/** `BlueMapService.loadMap`: the world folder is missing or is not a folder. */
const WORLD_MISSING =
    /does not exist or is no directory|Check if the 'world' setting in the config-file|Failed to load world/i;

/** `ConfigManager.loadConfigFile` and `BlueMapConfigManager.loadMapConfigs`. */
const CONFIG_PARSE =
    /BlueMap failed to parse this file|Failed to load map-config|ambiguous map-id|SerializationException|org\.spongepowered\.configurate/i;

/** `ConfigManager.loadConfigFile` again, for the file it may not read. */
const CONFIG_UNREADABLE =
    /BlueMap tried to read this file, but can not access it|BlueMap tried to find this file, but it does not exist/i;

/** Everything the JVM and the OS say when a path cannot be written. */
const WRITE_REFUSED =
    /AccessDeniedException|Read-only file system|EROFS|EACCES|No space left on device|ENOSPC|permission to create and read from this folder|FileSystemException/i;

const DOCKER_DAEMON_DOWN = /Cannot connect to the Docker daemon|is the docker daemon running/i;

const DOCKER_IMAGE_MISSING =
    /pull access denied|manifest unknown|manifest for [^\s]+ not found|repository does not exist|failed to resolve reference|no such host|Error response from daemon: (?:pull|Get)/i;

/**
 * The exit code a container gets when the kernel's OOM killer takes it.
 *
 * 137 is 128 + 9: killed by SIGKILL. Docker reports it for a container that exceeded its
 * memory limit, and the JVM inside never gets to print an `OutOfMemoryError` - which is
 * exactly why the code has to be read as well as the log.
 */
const SIGKILL_EXIT = 137;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Path comparison that survives separators and Windows' case-insensitivity. */
function normalisePath(path: string): string {
    return path.replace(/\\/g, "/").toLowerCase();
}

function mentions(haystack: string, path: string | null): boolean {
    if (path === null || path.trim() === "") return false;
    return normalisePath(haystack).includes(normalisePath(path));
}

/** The first line of the haystack matching a pattern, so a diagnosis can quote it. */
function quote(haystack: string, pattern: RegExp): string {
    for (const line of haystack.split("\n")) {
        if (pattern.test(line)) return line.trim();
    }
    // The pattern matched across a line break - upstream's messages are multi-line - so
    // the whole match is the honest quotation rather than a line that does not contain it.
    const match = pattern.exec(haystack);
    return match === null ? haystack.trim().slice(0, 400) : match[0].trim();
}

/**
 * The feature version of a Java version string.
 *
 * `25.0.3` is 25 and `1.8.0_452` is 8. Both spellings are in the wild and a comparison
 * that reads the first number of the second one concludes that Java 8 is version 1 - and
 * then reports every modern JDK as too old.
 */
export function javaFeature(version: string | null): number | null {
    if (version === null) return null;
    const legacy = /^1\.(\d+)/.exec(version.trim());
    if (legacy !== null && legacy[1] !== undefined) return Number.parseInt(legacy[1], 10);
    const modern = /^(\d+)/.exec(version.trim());
    if (modern !== null && modern[1] !== undefined) return Number.parseInt(modern[1], 10);
    return null;
}

function remedy(
    kind: RepairRemedyKind,
    summary: string,
    extra: { readonly settings?: SettingsTarget; readonly retry?: RetryAdjustment } = {},
): RepairRemedy {
    return {
        kind,
        summary,
        settings: extra.settings ?? null,
        retry: extra.retry ?? null,
    };
}

/* -------------------------------------------------------------------------- */
/* The diagnosis                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every known failure this evidence shows, most specific first. Never throws.
 *
 * More than one can be true at once - a container that could not start because Docker is
 * down will also have no Java version to report - and returning all of them is more
 * useful than picking a winner, because the interface shows a list and the agent is
 * skipped if the list is not empty.
 *
 * A cancelled run is deliberately diagnosed as nothing at all. Cancellation is not a
 * failure, and offering to repair it would be offering to repair a decision.
 */
export function diagnose(evidence: RepairEvidence): RepairDiagnosis[] {
    if (evidence.cancelled) return [];

    const found: RepairDiagnosis[] = [];
    const text = evidenceText(evidence);

    /* --- Consent ------------------------------------------------------- */
    // First because it is the only failure that is a decision rather than a fault, and
    // because the engine's own exit code for it (2) means nothing on its own.
    if (evidence.consentMissing || /You must accept the required file download/i.test(text)) {
        found.push({
            code: "download-not-accepted",
            message:
                "The engine needs the Minecraft client files, and the Mojang download has not been accepted.",
            because: evidence.consentMissing
                ? "The engine reported that the required file download was not accepted."
                : quote(text, /You must accept the required file download[^\n]*/i),
            remedy: remedy("setting", "Accept the Mojang download in Settings, then start the run again.", {
                settings: { surface: "settings", anchor: "mojang-download-consent", missing: true },
            }),
        });
    }

    /* --- Docker --------------------------------------------------------- */
    if (evidence.mode === "docker") {
        const report = evidence.docker;
        const daemonDown = DOCKER_DAEMON_DOWN.test(text);
        if ((report !== null && report.status !== "available") || daemonDown) {
            const said =
                report !== null && report.status !== "available"
                    ? report.message
                    : "Docker's daemon did not answer.";
            found.push({
                code: "docker-unavailable",
                message: `This run asked to use Docker, and Docker is not usable right now. ${said}`,
                because:
                    report?.detail ??
                    (daemonDown ? quote(text, DOCKER_DAEMON_DOWN) : said),
                remedy: remedy(
                    "retry",
                    report?.status === "not-installed"
                        ? "Run it on this computer instead, or install Docker."
                        : "Start Docker and try again, or run it on this computer instead.",
                ),
            });
        }
        if (evidence.spawnError === "ENOENT" && found.every((entry) => entry.code !== "docker-unavailable")) {
            found.push({
                code: "docker-unavailable",
                message: "The `docker` command could not be found, so nothing could be started in a container.",
                because: "Starting the docker command failed with ENOENT.",
                remedy: remedy("retry", "Run it on this computer instead, or install Docker."),
            });
        }
        if (DOCKER_IMAGE_MISSING.test(text)) {
            found.push({
                code: "docker-image-unavailable",
                message: "Docker could not get the image the engine runs in.",
                because: quote(text, DOCKER_IMAGE_MISSING),
                remedy: remedy(
                    "manual",
                    "Check this computer's connection to the image registry, then try again. Running on this computer needs no image.",
                ),
            });
        }
    }

    /* --- Java ----------------------------------------------------------- */
    // Only for a local run: in a container the JVM comes from the image, so an ENOENT
    // there is Docker missing rather than Java missing - and telling somebody to install
    // Java when Docker is what is absent sends them a long way in the wrong direction.
    if (evidence.mode === "local" && (evidence.spawnError === "ENOENT" || JAVA_NOT_FOUND.test(text))) {
        found.push({
            code: "java-missing",
            message:
                evidence.javaExecutable === null
                    ? "There is no Java runtime to run the engine with."
                    : `The Java runtime at ${evidence.javaExecutable} is not there any more.`,
            because:
                evidence.spawnError === "ENOENT"
                    ? "Starting the Java runtime failed with ENOENT, which means the file is not at that path."
                    : quote(text, JAVA_NOT_FOUND),
            remedy: remedy("setting", "Choose or download a Java runtime in Settings, then start the run again.", {
                settings: { surface: "settings", anchor: "java-runtime", missing: true },
            }),
        });
    }

    const feature = javaFeature(evidence.javaVersion);
    const tooOldByVersion = feature !== null && feature < evidence.requiredJavaFeature;
    if (JAVA_TOO_OLD.test(text) || tooOldByVersion) {
        found.push({
            code: "java-too-old",
            message:
                `The engine needs Java ${String(evidence.requiredJavaFeature)} or newer` +
                (feature === null
                    ? ", and the Java that ran it is older."
                    : `, and Java ${String(feature)} ran it.`),
            because: JAVA_TOO_OLD.test(text)
                ? quote(text, JAVA_TOO_OLD)
                : `The runtime reported version ${String(evidence.javaVersion)}.`,
            remedy: remedy(
                "setting",
                "Choose or download a newer Java runtime in Settings. Running in a container also supplies one.",
                { settings: { surface: "settings", anchor: "java-runtime", missing: true } },
            ),
        });
    }

    /* --- Memory --------------------------------------------------------- */
    if (OUT_OF_MEMORY.test(text) || evidence.exitCode === SIGKILL_EXIT) {
        const killed = evidence.exitCode === SIGKILL_EXIT && !OUT_OF_MEMORY.test(text);
        found.push({
            code: "out-of-memory",
            message: killed
                ? "The run was killed for using too much memory. In a container that is the memory limit, not the machine's."
                : "The engine ran out of memory.",
            because: killed
                ? `The process ended with exit code ${String(SIGKILL_EXIT)}, which is a kill signal - what a container gets when it passes its memory limit.`
                : quote(text, OUT_OF_MEMORY),
            remedy: remedy("retry", "Start it again with a larger heap.", {
                retry: { port: null, heapMegabytes: suggestedHeap(evidence) },
            }),
        });
    }

    /* --- Ports ---------------------------------------------------------- */
    if (BIND_REFUSED.test(text) || DOCKER_PORT_TAKEN.test(text)) {
        const which = DOCKER_PORT_TAKEN.test(text) ? DOCKER_PORT_TAKEN : BIND_REFUSED;
        found.push({
            code: "port-in-use",
            message:
                evidence.port === null
                    ? "Something else is already listening on the port the web server wanted."
                    : `Something else is already listening on port ${String(evidence.port)}.`,
            because: quote(text, which),
            // Port 0 rather than "the next one up": incrementing collides again the moment
            // two of these are started at once, and the operating system's own answer
            // cannot.
            remedy: remedy("retry", "Start the web server on a port the operating system picks.", {
                retry: { port: 0, heapMegabytes: null },
            }),
        });
    }

    /* --- The world ------------------------------------------------------ */
    if (WORLD_MISSING.test(text)) {
        const named = evidence.worlds.find((world) => mentions(text, world.path));
        found.push({
            code: "world-unreadable",
            message:
                named === undefined
                    ? "A world folder could not be read, so there was nothing to render."
                    : `The world folder for map '${named.mapId}' could not be read: ${named.path}`,
            because: quote(text, WORLD_MISSING),
            remedy: remedy(
                "setting",
                evidence.mode === "docker"
                    ? "Check the world folder in Settings. In a container the world is shared read-only, so a folder outside what was shared is invisible to it."
                    : "Choose the world folder again in Settings, then start the run again.",
                { settings: { surface: "settings", anchor: "world-folder", missing: true } },
            ),
        });
    }

    /* --- Writing output -------------------------------------------------- */
    if (WRITE_REFUSED.test(text)) {
        const line = quote(text, WRITE_REFUSED);
        const aboutConfig = mentions(line, evidence.hostConfigDir);
        const aboutOutput = mentions(line, evidence.outputRoot) || !aboutConfig;
        if (aboutOutput) {
            const full = /No space left on device|ENOSPC/i.test(line);
            found.push({
                code: "output-not-writable",
                message: full
                    ? "The disk the rendered map is written to is full."
                    : evidence.outputRoot === null
                      ? "The folder the rendered map is written to cannot be written."
                      : `The folder the rendered map is written to cannot be written: ${evidence.outputRoot}`,
                because: line,
                remedy: remedy(
                    "setting",
                    full
                        ? "Free some space, or choose a different folder for rendered maps in Settings."
                        : "Choose a different folder for rendered maps in Settings, or fix the permissions on this one.",
                    { settings: { surface: "settings", anchor: "map-storage-directory", missing: false } },
                ),
            });
        }
    }

    /* --- The config itself ------------------------------------------------ */
    if (CONFIG_PARSE.test(text) || CONFIG_UNREADABLE.test(text)) {
        const parse = CONFIG_PARSE.test(text);
        found.push({
            code: "config-rejected",
            message: parse
                ? "The engine refused the config: one of the files could not be parsed."
                : "The engine could not read one of the config files.",
            because: quote(text, parse ? CONFIG_PARSE : CONFIG_UNREADABLE),
            remedy: remedy(
                "config",
                parse
                    ? "Restore the config folder's last working revision from its history, or fix the file the engine named."
                    : "Check that this account can read the config folder, then start the run again.",
            ),
        });
    }

    return found;
}

/**
 * A heap to try next, in megabytes.
 *
 * Doubling whatever `-Xmx` was passed, or 4096 when none was. Not unbounded: a heap
 * larger than the machine has produces a JVM that refuses to start at all, which is a
 * worse failure than the one being repaired, so the caller is expected to clamp this to
 * what the machine actually has.
 */
export function suggestedHeap(evidence: RepairEvidence): number {
    for (const argument of evidence.args) {
        const match = /^-Xmx(\d+)([kKmMgG]?)$/.exec(argument);
        if (match === null) continue;
        const value = Number.parseInt(match[1] ?? "0", 10);
        const unit = (match[2] ?? "m").toLowerCase();
        const megabytes = unit === "g" ? value * 1024 : unit === "k" ? Math.ceil(value / 1024) : value;
        if (megabytes > 0) return megabytes * 2;
    }
    return 4096;
}

/** True when the deterministic pass explained the failure, so no agent is needed. */
export function explained(diagnoses: readonly RepairDiagnosis[]): boolean {
    return diagnoses.length > 0;
}

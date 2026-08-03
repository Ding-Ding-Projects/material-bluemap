/**
 * What a JVM says about itself, read rather than assumed.
 *
 * Decision D17 runs local rendering on upstream BlueMap's Java engine, and upstream
 * pins `JavaLanguageVersion.of(25)` in `buildSrc/src/main/kotlin/bluemap.java.gradle.kts`.
 * A jar compiled at that level refuses to load on anything older with a
 * `UnsupportedClassVersionError`, which is a confusing crash rather than a useful
 * message, so the version is checked before anything is launched.
 *
 * The check is deliberately made by *running* the executable. A path is not evidence:
 * `JAVA_HOME` routinely points at a JDK that was upgraded, removed or replaced, a
 * directory called `jdk-25` can contain anything at all, and a `java` on `PATH` says
 * nothing about which JVM it will hand off to. Only asking the binary is honest.
 */

/** Upstream's toolchain pin. Everything the app launches is compiled at this level. */
export const REQUIRED_JAVA_FEATURE = 25;

export interface JavaVersionInfo {
    /**
     * The feature (major) release: 8, 17, 21, 25. Normalized across both numbering
     * schemes, so a legacy `1.8.0_402` reports 8 rather than 1.
     */
    readonly feature: number;
    /** The version string exactly as the JVM printed it, e.g. `25.0.3`. */
    readonly version: string;
    /** The runtime line, e.g. `OpenJDK Runtime Environment Temurin-25.0.3+9 (build ...)`. */
    readonly runtime: string | null;
}

/**
 * `java -version` prints something like:
 *
 * ```
 * openjdk version "25.0.3" 2026-04-21 LTS
 * OpenJDK Runtime Environment Temurin-25.0.3+9 (build 25.0.3+9-LTS)
 * OpenJDK 64-Bit Server VM Temurin-25.0.3+9 (build 25.0.3+9-LTS, mixed mode, sharing)
 * ```
 *
 * on **stderr**, not stdout, which is the single most common reason a version probe
 * appears to return nothing. Vendors vary the first word (`openjdk`, `java`, and
 * assorted branded builds), so the match keys on the quoted value rather than on
 * whichever name a distributor chose.
 */
const VERSION_LINE = /(?:^|\n)[^\n"]*\bversion\s+"([^"]+)"/;

/** `java.home = C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot` */
const JAVA_HOME_PROPERTY = /(?:^|\n)[ \t]*java\.home[ \t]*=[ \t]*(.+?)[ \t]*(?:\r?\n|$)/;

/** The runtime line, which carries the vendor build id worth reporting back. */
const RUNTIME_LINE = /(?:^|\n)([^\n]*Runtime Environment[^\n]*)/;

/**
 * Turns a version string into its feature number.
 *
 * Two numbering schemes exist and both are still in the wild: JEP 223's `1.8.0_402`
 * where the feature number is the *second* component, and the current `25.0.3` where
 * it is the first. Reading the first component in both cases is the classic bug that
 * makes a Java 8 install look like a Java 1 install.
 */
export function javaFeatureVersion(version: string): number | null {
    const trimmed = version.trim();
    if (trimmed.length === 0) return null;

    const components = trimmed.split(".");
    const first = components[0];
    if (first === undefined) return null;

    if (first === "1") {
        const second = components[1];
        if (second === undefined) return null;
        const legacy = /^\d+/.exec(second);
        return legacy === null ? null : Number.parseInt(legacy[0], 10);
    }

    // `25`, `25.0.3`, `26-ea`, `25-internal` all report 25.
    const modern = /^\d+/.exec(first);
    return modern === null ? null : Number.parseInt(modern[0], 10);
}

/**
 * Parses the combined stdout+stderr of a `java -version` invocation.
 *
 * Returns null rather than throwing when nothing recognizable is present: a
 * candidate that cannot be identified is a candidate to reject and report, not an
 * exception to unwind the whole discovery pass.
 */
export function parseJavaVersion(output: string): JavaVersionInfo | null {
    const match = VERSION_LINE.exec(output);
    if (match === null) return null;

    const version = match[1];
    if (version === undefined) return null;

    const feature = javaFeatureVersion(version);
    if (feature === null) return null;

    const runtimeMatch = RUNTIME_LINE.exec(output);
    const runtime = runtimeMatch?.[1]?.trim() ?? null;

    return { feature, version, runtime };
}

/**
 * Pulls `java.home` out of a `-XshowSettings:properties` dump.
 *
 * This is how a `java` found on `PATH` gets a home directory attached to it without
 * guessing from the executable's location, which is wrong for symlinks, shims and
 * every wrapper script a version manager installs.
 */
export function parseJavaHome(output: string): string | null {
    const match = JAVA_HOME_PROPERTY.exec(output);
    const home = match?.[1]?.trim();
    return home === undefined || home.length === 0 ? null : home;
}

/**
 * Whether a JVM is new enough to run what the app launches.
 *
 * Newer is accepted. The requirement is a class-file floor, not an exact match: a
 * jar built for 25 runs on 26, and refusing a perfectly good JDK because it is not
 * the exact number would send people downloading a second one for nothing.
 */
export function satisfiesRequirement(
    version: JavaVersionInfo,
    required: number = REQUIRED_JAVA_FEATURE,
): boolean {
    return version.feature >= required;
}

/** The message shown when a JVM is present but too old, phrased so it can be acted on. */
export function tooOldReason(version: JavaVersionInfo, required: number): string {
    return `Java ${String(version.feature)} (${version.version}), but Java ${String(required)} or newer is required`;
}

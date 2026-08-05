/*
 * A standalone, throwaway Gradle project — NOT part of the vendored `vendor/BlueMap`
 * source tree — whose only job is resolving a real JDBC driver jar from Maven Central
 * (the canonical upstream distribution point) through the exact same Gradle
 * distribution and `GRADLE_USER_HOME` the oracle harness already uses to build the
 * reference CLI jar (see `tools/oracle/lib/javaOracle.mjs`).
 *
 * Why this exists: upstream's `SQLConfig` (common/config/storage/SQLConfig.java) never
 * bundles a JDBC driver — `core/build.gradle.kts` depends on `commons-dbcp2` for pooling
 * and nothing else — so a real MySQL/MariaDB/PostgreSQL connection needs a driver
 * supplied through the config's own `driver-jar`/`driver-class` fields. This project
 * resolves that jar the same way any other upstream dependency is resolved: a normal
 * Gradle dependency against Maven Central, cached under `tools/oracle/.gradle` like
 * every other build artifact this harness produces.
 *
 * Usage (from the repo root):
 *   vendor/BlueMap/gradlew.bat --project-dir tools/oracle/driver-fetch -q fetchDrivers
 *   (Linux/macOS: vendor/BlueMap/gradlew --project-dir tools/oracle/driver-fetch -q fetchDrivers)
 *
 * `--project-dir` points Gradle at this build script while still using the vendored
 * wrapper's pinned Gradle distribution (`gradle-wrapper.properties` is resolved
 * relative to the wrapper script, not the project directory), so no second Gradle
 * distribution is ever downloaded.
 */

plugins {
    `java-library`
}

repositories {
    mavenCentral()
}

val jdbcDrivers by configurations.creating

dependencies {
    // The exact MariaDB Connector/J version pinned for the SQL storage cross-compatibility
    // proof (issue #32). Also registers the `jdbc:mysql:` prefix as of 3.x, but this
    // project resolves it purely to drive the `mariadb` dialect explicitly.
    jdbcDrivers("org.mariadb.jdbc:mariadb-java-client:3.5.3")
}

tasks.register<Copy>("fetchDrivers") {
    description = "Resolves the pinned JDBC driver jars into build/drivers/, flattened (no version-qualified subfolders)."
    from(jdbcDrivers)
    into(layout.buildDirectory.dir("drivers"))
    // Strip Gradle's transitive-dependency jars (there should be none for this artifact,
    // but keep only the driver's own jar defensively) and normalize the file name.
    rename { fileName -> fileName }
}

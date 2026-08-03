import { describe, expect, it } from "vitest";
import {
    REQUIRED_JAVA_FEATURE,
    javaFeatureVersion,
    parseJavaHome,
    parseJavaVersion,
    satisfiesRequirement,
    tooOldReason,
} from "./version.js";

/** Exactly what the host's Temurin 25 prints, captured rather than invented. */
const TEMURIN_25 = `openjdk version "25.0.3" 2026-04-21 LTS
OpenJDK Runtime Environment Temurin-25.0.3+9 (build 25.0.3+9-LTS)
OpenJDK 64-Bit Server VM Temurin-25.0.3+9 (build 25.0.3+9-LTS, mixed mode, sharing)
`;

const ORACLE_8 = `java version "1.8.0_402"
Java(TM) SE Runtime Environment (build 1.8.0_402-b06)
Java HotSpot(TM) 64-Bit Server VM (build 25.402-b06, mixed mode)
`;

describe("javaFeatureVersion", () => {
    it("reads the modern scheme from the first component", () => {
        expect(javaFeatureVersion("25.0.3")).toBe(25);
        expect(javaFeatureVersion("21")).toBe(21);
        expect(javaFeatureVersion("26-ea")).toBe(26);
        expect(javaFeatureVersion("25-internal")).toBe(25);
    });

    it("reads the legacy 1.x scheme from the second component", () => {
        // The classic bug: reading the first component here reports Java 1.
        expect(javaFeatureVersion("1.8.0_402")).toBe(8);
        expect(javaFeatureVersion("1.7.0_80")).toBe(7);
    });

    it("returns null for anything it cannot read", () => {
        expect(javaFeatureVersion("")).toBeNull();
        expect(javaFeatureVersion("   ")).toBeNull();
        expect(javaFeatureVersion("banana")).toBeNull();
        expect(javaFeatureVersion("1")).toBeNull();
    });
});

describe("parseJavaVersion", () => {
    it("parses a Temurin 25 banner", () => {
        const parsed = parseJavaVersion(TEMURIN_25);
        expect(parsed).not.toBeNull();
        expect(parsed?.feature).toBe(25);
        expect(parsed?.version).toBe("25.0.3");
        expect(parsed?.runtime).toBe("OpenJDK Runtime Environment Temurin-25.0.3+9 (build 25.0.3+9-LTS)");
    });

    it("parses a legacy Oracle 8 banner as feature 8", () => {
        expect(parseJavaVersion(ORACLE_8)?.feature).toBe(8);
    });

    it("finds the banner after a -XshowSettings:properties dump", () => {
        const output = `Property settings:
    java.home = C:\\Program Files\\Eclipse Adoptium\\jdk-25.0.3.9-hotspot
    java.runtime.name = OpenJDK Runtime Environment
    java.runtime.version = 25.0.3+9-LTS
    java.version = 25.0.3

openjdk version "25.0.3" 2026-04-21 LTS
OpenJDK Runtime Environment Temurin-25.0.3+9 (build 25.0.3+9-LTS)
`;
        const parsed = parseJavaVersion(output);
        // The property lines contain the word "version" without quotes, so they must
        // not be mistaken for the banner.
        expect(parsed?.version).toBe("25.0.3");
        // `java.runtime.name` matches the words "Runtime Environment" but carries no
        // build id, which is the only reason the line is captured at all.
        expect(parsed?.runtime).toBe("OpenJDK Runtime Environment Temurin-25.0.3+9 (build 25.0.3+9-LTS)");
    });

    it("returns null when nothing identifiable was printed", () => {
        expect(parseJavaVersion("")).toBeNull();
        expect(parseJavaVersion("bash: java: command not found")).toBeNull();
        expect(parseJavaVersion('Error: version "" is not valid')).toBeNull();
    });
});

describe("parseJavaHome", () => {
    it("reads java.home out of a properties dump", () => {
        const output = `Property settings:
    java.home = C:\\Program Files\\Eclipse Adoptium\\jdk-25.0.3.9-hotspot
    java.io.tmpdir = C:\\Temp\\
`;
        expect(parseJavaHome(output)).toBe("C:\\Program Files\\Eclipse Adoptium\\jdk-25.0.3.9-hotspot");
    });

    it("handles a POSIX home and CRLF line endings", () => {
        expect(parseJavaHome("    java.home = /usr/lib/jvm/temurin-25\r\n    java.vendor = Eclipse\r\n")).toBe(
            "/usr/lib/jvm/temurin-25",
        );
    });

    it("returns null when the dump was not asked for or was refused", () => {
        expect(parseJavaHome(TEMURIN_25)).toBeNull();
        expect(parseJavaHome("")).toBeNull();
    });
});

describe("satisfiesRequirement", () => {
    const at = (feature: number) => ({ feature, version: String(feature), runtime: null });

    it("accepts the pinned version and anything newer", () => {
        expect(satisfiesRequirement(at(REQUIRED_JAVA_FEATURE))).toBe(true);
        expect(satisfiesRequirement(at(REQUIRED_JAVA_FEATURE + 1))).toBe(true);
    });

    it("rejects anything older", () => {
        expect(satisfiesRequirement(at(REQUIRED_JAVA_FEATURE - 1))).toBe(false);
        expect(satisfiesRequirement(at(8))).toBe(false);
    });

    it("tracks upstream's toolchain pin", () => {
        expect(REQUIRED_JAVA_FEATURE).toBe(25);
    });
});

describe("tooOldReason", () => {
    it("names both the version found and the version needed", () => {
        const reason = tooOldReason({ feature: 17, version: "17.0.9", runtime: null }, 25);
        expect(reason).toContain("Java 17");
        expect(reason).toContain("17.0.9");
        expect(reason).toContain("25");
    });
});

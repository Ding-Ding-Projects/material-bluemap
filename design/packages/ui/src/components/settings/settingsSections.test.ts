import { describe, expect, it } from "vitest";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    SETTINGS_ANCHORS,
    SETTINGS_SECTIONS,
    filterSections,
    isSettingsAnchor,
    isSettingsSection,
    sectionHaystack,
    sectionSample,
    type SettingsSectionText,
} from "./settingsSections.js";
import {
    githubSectionCopy,
    javaUnsupportedCopy,
    sectionCopy,
    worldFolderCopy,
} from "./settingsCopy.js";

/** The translator the app passes in: key first, English fallback second. */
const t = (_key: string, fallback: string): string => fallback;

const SECTIONS: SettingsSectionText[] = [
    {
        anchor: "mojang-download-consent",
        title: "Mojang download consent",
        description: "Whether this app may download Minecraft's own client files.",
        values: ["Accepted", "3 August 2026"],
    },
    {
        anchor: "java-runtime",
        title: "Java runtime",
        description: "It looks at JAVA_HOME, then java on PATH.",
        values: ["25.0.3"],
    },
    {
        anchor: "map-storage-directory",
        title: "Where rendered maps go",
        description: "The folder every rendered map is written into.",
        values: ["D:\\minecraft\\maps"],
    },
    {
        anchor: "world-folder",
        title: "World folder",
        description: "Set per map in the map wizard.",
        values: [],
    },
    {
        anchor: "github-account",
        title: "GitHub account",
        description: "Signing in lets the app reach private repositories.",
        values: ["octocat", "oauth-app", "repo"],
    },
];

describe("the anchors a render can point at", () => {
    it("is exactly the four the bridge contract carries", () => {
        expect([...SETTINGS_ANCHORS]).toEqual([
            "mojang-download-consent",
            "java-runtime",
            "map-storage-directory",
            "world-folder",
        ]);
    });

    it("recognises its own anchors and nothing else", () => {
        for (const anchor of SETTINGS_ANCHORS) expect(isSettingsAnchor(anchor)).toBe(true);
        expect(isSettingsAnchor("appearance")).toBe(false);
        expect(isSettingsAnchor("")).toBe(false);
        expect(isSettingsAnchor(null)).toBe(false);
        expect(isSettingsAnchor(undefined)).toBe(false);
        expect(isSettingsAnchor(42)).toBe(false);
    });

    it("has copy for every one of them", () => {
        const copy = sectionCopy(t);
        for (const anchor of SETTINGS_ANCHORS) {
            expect(copy[anchor].title.length).toBeGreaterThan(0);
            expect(copy[anchor].description.length).toBeGreaterThan(0);
        }
    });
});

describe("every section the surface renders", () => {
    /*
     * The surface shows more than the bridge can point at. GitHub sign-in is here because
     * it is an app-wide setting, and no render can link to it: a job that cannot reach a
     * private repository fails on the repository, not on a settings row. Widening the
     * bridge contract to make one list would be widening a contract to suit a layout.
     */
    it("is the four a render can point at, plus the ones only Settings reaches", () => {
        expect([...SETTINGS_SECTIONS]).toEqual([
            "mojang-download-consent",
            "java-runtime",
            "map-storage-directory",
            "world-folder",
            "github-account",
        ]);
    });

    it("keeps the render-reachable anchors a closed set, GitHub included out of it", () => {
        expect(isSettingsSection("github-account")).toBe(true);
        expect(isSettingsAnchor("github-account")).toBe(false);
        expect(isSettingsSection("appearance")).toBe(false);
        expect(isSettingsSection(null)).toBe(false);
    });

    it("has copy for every section, not only the render-reachable ones", () => {
        const copy = sectionCopy(t);
        for (const anchor of SETTINGS_SECTIONS) {
            expect(copy[anchor].title.length).toBeGreaterThan(0);
            expect(copy[anchor].description.length).toBeGreaterThan(0);
        }
        expect(copy["github-account"].title).toContain("GitHub");
    });

    it("finds the GitHub section by the login on screen, and by the word GitHub", () => {
        expect(filterSections(SECTIONS, createSettingMatcher("octocat", false, "im"))).toEqual([
            "github-account",
        ]);
        expect(filterSections(SECTIONS, createSettingMatcher("github", false, "im"))).toEqual([
            "github-account",
        ]);
    });

    it("gives the GitHub row words the search will be asked for", () => {
        const copy = githubSectionCopy(t);
        expect(copy.unsupported).toContain("cannot sign in to GitHub");
        expect(copy.whatItIsFor).toContain("private repositories");
        expect(copy.signedOut).toContain("Not signed in");
    });
});

describe("what a section can be found by", () => {
    it("includes the anchor, the title, the explanation and every current value", () => {
        const haystack = sectionHaystack(SECTIONS[1] as SettingsSectionText);
        expect(haystack).toContain("java-runtime");
        expect(haystack).toContain("Java runtime");
        expect(haystack).toContain("JAVA_HOME");
        expect(haystack).toContain("25.0.3");
    });

    it("drops empty values rather than leaving blank lines a pattern can match", () => {
        const haystack = sectionHaystack({
            anchor: "world-folder",
            title: "World folder",
            description: "",
            values: ["", "   "],
        });
        expect(haystack).toBe("world-folder\nWorld folder");
    });
});

describe("filtering the surface", () => {
    it("shows every section when the search bar is empty", () => {
        const matcher = createSettingMatcher("", false, "im");
        expect(filterSections(SECTIONS, matcher)).toEqual([...SETTINGS_SECTIONS]);
    });

    it("matches plain text case-insensitively, which is the default", () => {
        expect(filterSections(SECTIONS, createSettingMatcher("java_home", false, "im"))).toEqual([
            "java-runtime",
        ]);
    });

    it("finds a section by a value that is on screen, not only by its title", () => {
        expect(filterSections(SECTIONS, createSettingMatcher("minecraft\\maps", false, "im"))).toEqual([
            "map-storage-directory",
        ]);
    });

    it("uses the pattern when regex is explicitly turned on", () => {
        expect(filterSections(SECTIONS, createSettingMatcher("^Java runtime$", true, "im"))).toEqual([
            "java-runtime",
        ]);
    });

    it("shows nothing for a pattern that does not compile, rather than everything", () => {
        const matcher = createSettingMatcher("(unclosed", true, "im");
        expect(matcher.error).not.toBeNull();
        expect(filterSections(SECTIONS, matcher)).toEqual([]);
    });

    it("shows nothing when nothing matches", () => {
        expect(filterSections(SECTIONS, createSettingMatcher("kubernetes", false, "im"))).toEqual([]);
    });
});

describe("the sample the regex builder previews against", () => {
    it("is one line per section, so a section is one candidate", () => {
        const lines = sectionSample(SECTIONS).split("\n");
        expect(lines).toHaveLength(SECTIONS.length);
        expect(lines[1]).toContain("JAVA_HOME");
        expect(lines.every((line) => !line.includes("\n"))).toBe(true);
    });
});

describe("copy shared between a row and the search", () => {
    it("gives the Java row the words the search will be asked for", () => {
        const copy = javaUnsupportedCopy(t);
        expect(copy.headline).toContain("cannot report the Java runtime");
        expect(copy.discoveryOrder).toContain("JAVA_HOME");
        expect(copy.discoveryOrder).toContain("PATH");
    });

    it("says the world folder is per map and where it is actually set", () => {
        const copy = worldFolderCopy(t);
        expect(copy.perMap).toContain("own world folder");
        expect(copy.perMap).toContain("wizard");
        expect(copy.where).toContain("world");
    });
});

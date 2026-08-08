import { describe, expect, it } from "vitest";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    capabilityHaystack,
    capabilityMatchesText,
    filterCapabilities,
    groupCapabilities,
    homeSampleText,
    type HomeCapability,
} from "./homeCatalog.js";

function capability(overrides: Partial<HomeCapability> = {}): HomeCapability {
    return {
        id: "world",
        group: "Get started",
        title: "Make a map",
        description: "The guide that turns a world folder into a rendered map.",
        icon: "M0 0",
        keywords: ["render", "wizard"],
        disabledReason: null,
        actionLabel: "Make a map",
        remedyLabel: null,
        primary: true,
        action: () => {},
        remedyAction: null,
        ...overrides,
    };
}

describe("capabilityHaystack", () => {
    it("joins the group, title, description and keywords a search should find a card by", () => {
        const haystack = capabilityHaystack(capability());
        expect(haystack).toContain("Get started");
        expect(haystack).toContain("Make a map");
        expect(haystack).toContain("The guide that turns a world folder into a rendered map.");
        expect(haystack).toContain("render");
        expect(haystack).toContain("wizard");
    });

    it("includes the disabled reason, so 'render a map first' is itself searchable", () => {
        const haystack = capabilityHaystack(
            capability({ id: "backups", title: "Backups", disabledReason: "Render a map first, then come back." }),
        );
        expect(haystack).toContain("Render a map first, then come back.");
    });

    it("drops a blank disabled reason rather than adding an empty line", () => {
        const haystack = capabilityHaystack(capability({ disabledReason: null }));
        expect(haystack.split("\n").some((line) => line.trim() === "")).toBe(false);
    });

    it("carries no keywords line at all when there are none, rather than an empty entry", () => {
        const haystack = capabilityHaystack(capability({ keywords: [] }));
        expect(haystack.split("\n").filter((line) => line.trim() === "")).toHaveLength(0);
    });
});

describe("homeSampleText", () => {
    it("gives one line per card, group and title, for the regex builder's preview", () => {
        const sample = homeSampleText([
            capability({ id: "world", group: "Get started", title: "Make a map" }),
            capability({ id: "map", group: "Make and manage maps", title: "Map" }),
        ]);
        expect(sample.split("\n")).toEqual(["Get started: Make a map", "Make and manage maps: Map"]);
    });

    it("is empty for an empty catalogue", () => {
        expect(homeSampleText([])).toBe("");
    });
});

describe("filterCapabilities", () => {
    const catalogue = [
        capability({ id: "world", title: "Make a map", group: "Get started", keywords: ["wizard", "render"] }),
        capability({ id: "backups", title: "Backups", group: "Share and back up", keywords: ["archive"] }),
        capability({ id: "docs", title: "Docs", group: "Learn", keywords: ["documentation", "articles"] }),
    ];

    it("returns everything when the matcher is inactive (an empty query)", () => {
        const matcher = createSettingMatcher("", false, "i");
        expect(filterCapabilities(catalogue, matcher)).toEqual(catalogue);
    });

    it("matches on the title", () => {
        const matcher = createSettingMatcher("backups", false, "i");
        const result = filterCapabilities(catalogue, matcher);
        expect(result.map((item) => item.id)).toEqual(["backups"]);
    });

    it("matches on a keyword that never appears in the title or description", () => {
        const matcher = createSettingMatcher("wizard", false, "i");
        const result = filterCapabilities(catalogue, matcher);
        expect(result.map((item) => item.id)).toEqual(["world"]);
    });

    it("matches case-insensitively in plain-text mode", () => {
        const matcher = createSettingMatcher("BACKUPS", false, "i");
        expect(filterCapabilities(catalogue, matcher).map((item) => item.id)).toEqual(["backups"]);
    });

    it("keeps nothing when the query matches nothing at all", () => {
        const matcher = createSettingMatcher("no such capability exists", false, "i");
        expect(filterCapabilities(catalogue, matcher)).toEqual([]);
    });

    it("matches with an explicit regex pattern", () => {
        // "m" because the haystack is several lines (group, title, description, keywords)
        // joined with newlines, the same "^" and "$" are per-line rather than per-card
        // convention `CommandPalette.vue`'s own default flags use.
        const matcher = createSettingMatcher("^Backups$", true, "im");
        expect(filterCapabilities(catalogue, matcher).map((item) => item.id)).toEqual(["backups"]);
    });

    it("keeps nothing rather than guessing when the pattern fails to compile", () => {
        const matcher = createSettingMatcher("(unclosed", true, "i");
        expect(filterCapabilities(catalogue, matcher)).toEqual([]);
    });

    it("preserves catalogue order rather than sorting by relevance", () => {
        const matcher = createSettingMatcher("a", false, "i");
        const result = filterCapabilities(catalogue, matcher);
        expect(result.map((item) => item.id)).toEqual(["world", "backups", "docs"]);
    });
});

describe("groupCapabilities", () => {
    const catalogue = [
        capability({ id: "world", title: "Make a map", group: "Get started" }),
        capability({ id: "backups", title: "Backups", group: "Share and back up" }),
        capability({ id: "pages", title: "Publish to Pages", group: "Share and back up" }),
        capability({ id: "docs", title: "Docs", group: "Learn" }),
    ];

    const definitions = [
        { id: "share", heading: "Share and back up" },
        { id: "learn", heading: "Learn" },
        { id: "viewer", heading: "The open map" },
    ];

    it("files each card under the section whose heading it names", () => {
        const sections = groupCapabilities(catalogue, definitions);
        expect(sections.map((section) => section.id)).toEqual(["share", "learn"]);
        expect(sections[0]?.items.map((item) => item.id)).toEqual(["backups", "pages"]);
        expect(sections[1]?.items.map((item) => item.id)).toEqual(["docs"]);
    });

    it("keeps the declared section order rather than the catalogue's", () => {
        const sections = groupCapabilities(catalogue, [
            { id: "learn", heading: "Learn" },
            { id: "share", heading: "Share and back up" },
        ]);
        expect(sections.map((section) => section.id)).toEqual(["learn", "share"]);
    });

    it("drops a section with nothing in it rather than heading an empty one", () => {
        // "The open map" with no map open is not an honest "(0)", it is a control wired to
        // nothing - the same rule the command palette holds the viewer menu to.
        expect(groupCapabilities(catalogue, definitions).some((section) => section.id === "viewer")).toBe(
            false,
        );
    });

    it("carries the count a collapsed heading has to state", () => {
        const share = groupCapabilities(catalogue, definitions).find((section) => section.id === "share");
        expect(share?.items).toHaveLength(2);
        expect(share?.heading).toBe("Share and back up");
    });

    it("leaves a card whose group no section claims out of every section", () => {
        const filed = groupCapabilities(catalogue, definitions).flatMap((section) =>
            section.items.map((item) => item.id),
        );
        expect(filed).not.toContain("world");
    });

    it("is empty for an empty catalogue rather than a row of empty headings", () => {
        expect(groupCapabilities([], definitions)).toEqual([]);
    });
});

describe("capabilityMatchesText", () => {
    it("matches everything for an empty query", () => {
        expect(capabilityMatchesText(capability(), "")).toBe(true);
    });

    it("matches the description text case-insensitively", () => {
        expect(capabilityMatchesText(capability(), "WORLD FOLDER")).toBe(true);
    });

    it("does not match unrelated text", () => {
        expect(capabilityMatchesText(capability(), "publish to pages")).toBe(false);
    });
});

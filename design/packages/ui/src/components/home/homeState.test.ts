import { describe, expect, it } from "vitest";
import { memoryStorage } from "../setup/setupPrefs.js";
import {
    homeExpandedSections,
    homeIntroCollapsed,
    homeSectionExpanded,
    setHomeIntroCollapsed,
    setHomeSectionExpanded,
} from "./homeState.js";

describe("whether Home's own introduction is collapsed", () => {
    it("defaults to expanded - a newcomer's first look is exactly what the explanation is for", () => {
        expect(homeIntroCollapsed(memoryStorage())).toBe(false);
    });

    it("round-trips a collapse", () => {
        const storage = memoryStorage();
        setHomeIntroCollapsed(true, storage);
        expect(homeIntroCollapsed(storage)).toBe(true);
    });

    it("round-trips an explicit expand, after having been collapsed", () => {
        const storage = memoryStorage();
        setHomeIntroCollapsed(true, storage);
        setHomeIntroCollapsed(false, storage);
        expect(homeIntroCollapsed(storage)).toBe(false);
    });

    it("treats a junk stored value as expanded rather than as collapsed", () => {
        const storage = memoryStorage({ "worldlens.home.introCollapsed": "yes please" });
        expect(homeIntroCollapsed(storage)).toBe(false);
    });

    it("removes the record on expand rather than writing a second falsy value", () => {
        const storage = memoryStorage();
        setHomeIntroCollapsed(true, storage);
        setHomeIntroCollapsed(false, storage);
        expect(storage.read("worldlens.home.introCollapsed")).toBeNull();
    });
});

describe("which of Home's secondary sections are open", () => {
    it("opens none of them for a newcomer, which is what makes the first view short", () => {
        const storage = memoryStorage();
        expect(homeExpandedSections(storage)).toEqual([]);
        expect(homeSectionExpanded("share", storage)).toBe(false);
    });

    it("round-trips one section being opened, without opening its neighbours", () => {
        const storage = memoryStorage();
        setHomeSectionExpanded("share", true, storage);
        expect(homeSectionExpanded("share", storage)).toBe(true);
        expect(homeSectionExpanded("learn", storage)).toBe(false);
    });

    it("remembers several, and forgets one again without disturbing the rest", () => {
        const storage = memoryStorage();
        setHomeSectionExpanded("share", true, storage);
        setHomeSectionExpanded("learn", true, storage);
        setHomeSectionExpanded("settings", true, storage);
        setHomeSectionExpanded("learn", false, storage);

        expect([...homeExpandedSections(storage)].sort()).toEqual(["settings", "share"]);
    });

    it("records one id once, however many times it is opened", () => {
        const storage = memoryStorage();
        setHomeSectionExpanded("share", true, storage);
        setHomeSectionExpanded("share", true, storage);
        expect(homeExpandedSections(storage)).toEqual(["share"]);
    });

    it("removes the record once the last section is closed again", () => {
        const storage = memoryStorage();
        setHomeSectionExpanded("share", true, storage);
        setHomeSectionExpanded("share", false, storage);
        expect(storage.read("worldlens.home.expandedSections")).toBeNull();
        expect(homeExpandedSections(storage)).toEqual([]);
    });

    it("reads a record with stray whitespace and empty entries as the ids it names", () => {
        const storage = memoryStorage({ "worldlens.home.expandedSections": " share , ,learn," });
        expect(homeExpandedSections(storage)).toEqual(["share", "learn"]);
    });

    it("treats a section the record has never heard of as closed, not as open", () => {
        const storage = memoryStorage({ "worldlens.home.expandedSections": "share" });
        // A section added by a later build starts closed like every other one, rather than
        // inheriting an answer from a record written before it existed.
        expect(homeSectionExpanded("a-section-invented-tomorrow", storage)).toBe(false);
    });

    it("keeps the two preferences independent of each other", () => {
        const storage = memoryStorage();
        setHomeIntroCollapsed(true, storage);
        setHomeSectionExpanded("share", true, storage);

        expect(homeIntroCollapsed(storage)).toBe(true);
        expect(homeSectionExpanded("share", storage)).toBe(true);

        setHomeIntroCollapsed(false, storage);
        expect(homeSectionExpanded("share", storage)).toBe(true);
    });
});

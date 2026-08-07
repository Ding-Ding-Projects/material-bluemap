import { describe, expect, it } from "vitest";
import { memoryStorage } from "../setup/setupPrefs.js";
import { homeIntroCollapsed, setHomeIntroCollapsed } from "./homeState.js";

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

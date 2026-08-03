import { describe, expect, it } from "vitest";
import {
    compileSearchPattern,
    countListedMarkerSets,
    countListedMarkers,
    createMarkerMatcher,
    distanceToSquared,
    filterMarkerSets,
    filterMarkers,
    findMarkerSetById,
    findPathToSet,
    includesCI,
    isMarkerSetActive,
    markerDisplayLabel,
    markerSearchFields,
} from "./markerFilter.js";
import {
    MAX_MATCHES,
    escapeLiteral,
    evaluatePattern,
} from "./regexEngine.js";
import type { AnyMarkerData, AnyMarkerSetData } from "./markerTypes.js";

function marker(partial: Partial<AnyMarkerData> & { id: string }): AnyMarkerData {
    return {
        type: "poi",
        sorting: 0,
        listed: true,
        visible: true,
        position: { x: 0, y: 0, z: 0 } as AnyMarkerData["position"],
        ...partial,
    };
}

function set(partial: Partial<AnyMarkerSetData> & { id: string }): AnyMarkerSetData {
    return {
        label: partial.id,
        toggleable: true,
        defaultHide: false,
        sorting: 0,
        markerSets: [],
        markers: [],
        visible: true,
        listed: true,
        saveState: () => {},
        ...partial,
    };
}

const origin = { x: 0, y: 0, z: 0 };

describe("includesCI", () => {
    it("matches regardless of case, like upstream's String.prototype.includesCI", () => {
        expect(includesCI("Spawn Point", "spawn")).toBe(true);
        expect(includesCI("spawn point", "SPAWN")).toBe(true);
        expect(includesCI("spawn", "town")).toBe(false);
    });
});

describe("markerDisplayLabel", () => {
    it("uses the player name for player markers", () => {
        expect(markerDisplayLabel(marker({ id: "bm-player-1", type: "player", name: "Steve" }))).toBe(
            "Steve",
        );
    });

    it("strips the outer html tag from a label", () => {
        expect(markerDisplayLabel(marker({ id: "a", label: "<b>Town Hall</b>" }))).toBe("Town Hall");
        expect(markerDisplayLabel(marker({ id: "a", label: "<div><b>Nested</b></div>" }))).toBe(
            "Nested",
        );
    });

    it("keeps a plain label untouched", () => {
        expect(markerDisplayLabel(marker({ id: "a", label: "Plain" }))).toBe("Plain");
    });

    it("falls back to the id when there is no usable label", () => {
        expect(markerDisplayLabel(marker({ id: "fallback-id" }))).toBe("fallback-id");
        expect(markerDisplayLabel(marker({ id: "fallback-id", label: "<b></b>" }))).toBe(
            "fallback-id",
        );
    });
});

describe("markerSearchFields", () => {
    it("searches id and label for ordinary markers", () => {
        expect(markerSearchFields(marker({ id: "poi-1", label: "Mine" }))).toEqual(["poi-1", "Mine"]);
    });

    it("adds the player name and uuid for players", () => {
        expect(
            markerSearchFields(
                marker({ id: "bm-player-x", type: "player", name: "Alex", playerUuid: "uuid-1" }),
            ),
        ).toEqual(["bm-player-x", "Alex", "uuid-1"]);
    });
});

describe("createMarkerMatcher", () => {
    const town = marker({ id: "town-1", label: "Riverwood" });
    const player = marker({
        id: "bm-player-9",
        type: "player",
        name: "Alex",
        playerUuid: "abc-123",
    });

    it("matches everything when the query is empty", () => {
        const matcher = createMarkerMatcher("", "text", "i");
        expect(matcher.active).toBe(false);
        expect(matcher.match(town)).toBe(true);
    });

    it("matches plain text case-insensitively across every field", () => {
        expect(createMarkerMatcher("river", "text", "i").match(town)).toBe(true);
        expect(createMarkerMatcher("TOWN-1", "text", "i").match(town)).toBe(true);
        expect(createMarkerMatcher("abc-1", "text", "i").match(player)).toBe(true);
        expect(createMarkerMatcher("nothing", "text", "i").match(town)).toBe(false);
    });

    it("does not treat a plain-text query as a pattern", () => {
        expect(createMarkerMatcher("river.ood", "text", "i").match(town)).toBe(false);
    });

    it("matches with a regular expression when regex mode is on", () => {
        expect(createMarkerMatcher("^River", "regex", "").match(town)).toBe(true);
        expect(createMarkerMatcher("^river", "regex", "").match(town)).toBe(false);
        expect(createMarkerMatcher("^river", "regex", "i").match(town)).toBe(true);
    });

    it("reports a syntax error and matches nothing instead of running a stale pattern", () => {
        const matcher = createMarkerMatcher("([", "regex", "i");
        expect(matcher.error).toBeTruthy();
        expect(matcher.match(town)).toBe(false);
    });

    it("drops the stateful g and y flags so every field is tested independently", () => {
        const matcher = createMarkerMatcher("a", "regex", "gi");
        expect(matcher.match(player)).toBe(true);
        expect(matcher.match(player)).toBe(true);
        expect(matcher.match(player)).toBe(true);
    });

    it("supports unicode patterns", () => {
        const cafe = marker({ id: "cafe", label: "Café Grün" });
        expect(createMarkerMatcher("\\p{Letter}+", "regex", "u").match(cafe)).toBe(true);
        expect(createMarkerMatcher("grün", "regex", "iu").match(cafe)).toBe(true);
    });
});

describe("filterMarkers", () => {
    const a = marker({ id: "a", label: "Bravo", sorting: 2, position: { x: 30, y: 0, z: 0 } as AnyMarkerData["position"] });
    const b = marker({ id: "b", label: "alpha", sorting: 1, position: { x: 10, y: 0, z: 0 } as AnyMarkerData["position"] });
    const c = marker({ id: "c", label: "Charlie", sorting: 3, position: { x: 20, y: 0, z: 0 } as AnyMarkerData["position"] });
    const hidden = marker({ id: "d", label: "Delta", listed: false });
    const all = [a, b, c, hidden];
    const matchAll = createMarkerMatcher("", "text", "i");

    it("drops unlisted markers", () => {
        expect(filterMarkers(all, matchAll, "default", origin).map((m) => m.id)).not.toContain("d");
    });

    it("sorts by the sorting field by default", () => {
        expect(filterMarkers(all, matchAll, "default", origin).map((m) => m.id)).toEqual([
            "b",
            "a",
            "c",
        ]);
    });

    it("sorts by lowercased label", () => {
        expect(filterMarkers(all, matchAll, "label", origin).map((m) => m.id)).toEqual([
            "b",
            "a",
            "c",
        ]);
    });

    it("sorts by distance to the camera", () => {
        expect(filterMarkers(all, matchAll, "distance", { x: 31, y: 0, z: 0 }).map((m) => m.id)).toEqual(
            ["a", "c", "b"],
        );
    });

    it("does not mutate the source array", () => {
        const source = [a, b, c];
        filterMarkers(source, matchAll, "label", origin);
        expect(source.map((m) => m.id)).toEqual(["a", "b", "c"]);
    });
});

describe("marker set helpers", () => {
    const child = set({ id: "child", markers: [marker({ id: "m1" })] });
    const emptyChild = set({ id: "empty" });
    const unlisted = set({ id: "unlisted", listed: false });
    const parent = set({
        id: "parent",
        markerSets: [child, emptyChild, unlisted],
        markers: [marker({ id: "p1" }), marker({ id: "p2", listed: false })],
    });
    const root = set({ id: "bm-root", markerSets: [parent] });

    it("counts only listed children", () => {
        expect(countListedMarkers(parent)).toBe(1);
        expect(countListedMarkerSets(parent)).toBe(2);
    });

    it("reports a set as active when anything listed is inside it", () => {
        expect(isMarkerSetActive(parent)).toBe(true);
        expect(isMarkerSetActive(child)).toBe(true);
        expect(isMarkerSetActive(emptyChild)).toBe(false);
    });

    it("keeps only listed sets, in sorting order", () => {
        const ordered = set({
            id: "ordered",
            markerSets: [
                set({ id: "second", sorting: 2 }),
                set({ id: "first", sorting: 1 }),
                unlisted,
            ],
        });
        expect(filterMarkerSets(ordered.markerSets).map((s) => s.id)).toEqual(["first", "second"]);
    });

    it("finds the path from the root to a nested set", () => {
        expect(findPathToSet(root, child)?.map((s) => s.id)).toEqual(["bm-root", "parent", "child"]);
        expect(findPathToSet(root, root)?.map((s) => s.id)).toEqual(["bm-root"]);
        expect(findPathToSet(child, root)).toBeNull();
    });

    it("finds a set by id anywhere in the tree", () => {
        expect(findMarkerSetById(root, "child")?.id).toBe("child");
        expect(findMarkerSetById(root, "nope")).toBeNull();
    });
});

describe("compileSearchPattern", () => {
    it("rejects an over-long pattern instead of compiling it", () => {
        const { regexp, error } = compileSearchPattern("a".repeat(600), "");
        expect(regexp).toBeNull();
        expect(error).toContain("512");
    });

    it("returns the engine's own error message for invalid syntax", () => {
        expect(compileSearchPattern("(", "").error).toBeTruthy();
    });
});

describe("escapeLiteral", () => {
    it("makes a literal match itself", () => {
        const escaped = escapeLiteral("a.b(c)[d]|e*");
        expect(new RegExp(escaped).test("a.b(c)[d]|e*")).toBe(true);
        expect(new RegExp(escaped).test("axbxcxdxe")).toBe(false);
    });
});

describe("evaluatePattern", () => {
    it("finds every match with capture groups", () => {
        const result = evaluatePattern("(\\w)(\\d)", "", "a1 b2 c3");
        expect(result.error).toBeNull();
        expect(result.matches.map((m) => m.text)).toEqual(["a1", "b2", "c3"]);
        expect(result.matches[0]?.groups.map((g) => g.value)).toEqual(["a", "1"]);
    });

    it("reports named capture groups", () => {
        const result = evaluatePattern("(?<letter>[a-z])", "", "q");
        expect(result.matches[0]?.groups.some((g) => g.name === "letter")).toBe(true);
    });

    it("terminates on a zero-width pattern", () => {
        const result = evaluatePattern("(?:)", "", "abc");
        expect(result.matches.length).toBe(4);
        expect(result.matches.every((m) => m.text === "")).toBe(true);
    });

    it("reports a compile error rather than throwing", () => {
        const result = evaluatePattern("(?<", "", "abc");
        expect(result.error).toBeTruthy();
        expect(result.matches).toEqual([]);
    });

    it("finds nothing for an empty pattern", () => {
        expect(evaluatePattern("", "", "abc").matches).toEqual([]);
    });

    it("truncates at the match limit", () => {
        const result = evaluatePattern("a", "", "a".repeat(MAX_MATCHES + 50));
        expect(result.truncated).toBe(true);
        expect(result.matches.length).toBe(MAX_MATCHES);
    });

    it("cuts an over-long sample and says so", () => {
        const result = evaluatePattern("x", "", "x".repeat(6000));
        expect(result.sampleTruncated).toBe(true);
    });

    it("honours multiline anchors", () => {
        expect(evaluatePattern("^b", "m", "a\nb\nc").matches.length).toBe(1);
        expect(evaluatePattern("^b", "", "a\nb\nc").matches.length).toBe(0);
    });
});

describe("distanceToSquared", () => {
    it("matches three.js semantics", () => {
        expect(distanceToSquared({ x: 3, y: 4, z: 0 }, origin)).toBe(25);
    });
});

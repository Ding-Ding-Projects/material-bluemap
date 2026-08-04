/**
 * What the viewer says it is showing, and whether that is true.
 *
 * Three states and three different sentences: the live document, a copy fetched earlier,
 * and BlueMap's own wording shown because nothing could be fetched. Every test below is
 * really one assertion in disguise - a stale or substituted copy must never come out of
 * this module wearing `source: "live"`, because that is the single sentence a person
 * relies on before agreeing to a legal document.
 *
 * The search and export helpers are here too, for the same kind of reason: highlighting
 * must not be able to change a word, and an exported fragment must not be able to look
 * like a whole licence.
 */

import { describe, expect, it } from "vitest";

import {
    FALLBACK_TEXT,
    createEulaController,
    formatFetchedAt,
    interpretResult,
    unavailableState,
    type EulaLoadResultLike,
} from "./eulaBridge.js";
import { exportEula, exportFilename, exportHeaderLines } from "./eulaExport.js";
import { categoriseEula } from "./eulaSections.js";
import { highlightRuns, reportSectionMatches, runsPreserve } from "./eulaSearch.js";
import { createSettingMatcher } from "../config/regexEngine.js";

const URL_UNDER_TEST = "https://account.mojang.com/documents/minecraft_eula";

const LIVE: EulaLoadResultLike = {
    ok: true,
    document: {
        source: "live",
        text: "MINECRAFT EULA\n\nYou may play. You may not sell.",
        documentUrl: URL_UNDER_TEST,
        fetchedAt: "2026-08-04T10:00:00.000Z",
        characters: 46,
    },
};

describe("what came back over the bridge", () => {
    it("reports a live fetch as live, with its time", () => {
        const state = interpretResult(LIVE, unavailableState("not yet"));
        expect(state.source).toBe("live");
        expect(state.fetchedAt).toBe("2026-08-04T10:00:00.000Z");
        expect(state.failure).toBeNull();
        expect(state.text).toContain("MINECRAFT EULA");
    });

    it("reports a cached copy as cached, never as live", () => {
        const state = interpretResult(
            { ...LIVE, document: { ...LIVE.document, source: "cache" } } as EulaLoadResultLike,
            unavailableState("not yet"),
        );
        expect(state.source).toBe("cache");
    });

    it("shows a stale copy after a failure, with the failure beside it", () => {
        const state = interpretResult(
            {
                ok: false,
                reason: "network unreachable",
                cached: {
                    source: "cache",
                    text: "An older licence.",
                    documentUrl: URL_UNDER_TEST,
                    fetchedAt: "2020-01-01T00:00:00.000Z",
                    characters: 17,
                },
            },
            unavailableState("not yet"),
        );

        // Both facts at once. The copy is on screen and the reason it is not newer is
        // beside it; describing it as live would be the one genuinely harmful outcome.
        expect(state.source).toBe("cache");
        expect(state.text).toBe("An older licence.");
        expect(state.fetchedAt).toBe("2020-01-01T00:00:00.000Z");
        expect(state.failure).toBe("network unreachable");
    });

    it("falls back to BlueMap's own quotation when a failure leaves nothing at all", () => {
        const state = interpretResult(
            { ok: false, reason: "getaddrinfo ENOTFOUND", cached: null },
            unavailableState("not yet"),
        );
        expect(state.source).toBe("fallback");
        expect(state.text).toBe(FALLBACK_TEXT);
        expect(state.failure).toBe("getaddrinfo ENOTFOUND");
        // The fallback is BlueMap's wording, and it says so by being exactly that text.
        expect(state.text).toContain("accept-download");
    });

    it("refuses a result it cannot read rather than rendering undefined at somebody", () => {
        const state = interpretResult({ ok: true, document: { text: "" } }, unavailableState("not yet"));
        expect(state.source).toBe("fallback");
        expect(state.failure).toContain("no readable text");

        expect(interpretResult(null, unavailableState("not yet")).source).toBe("fallback");
        expect(interpretResult("a string", unavailableState("not yet")).failure).toContain(
            "nothing this build can read",
        );
    });

    it("refuses a document whose timestamp is not a date, because the date is the point", () => {
        const state = interpretResult(
            { ok: true, document: { ...LIVE.document, fetchedAt: "soon" } } as unknown,
            unavailableState("not yet"),
        );
        expect(state.source).toBe("fallback");
    });
});

describe("a build with no way to fetch", () => {
    it("starts in the fallback state and says why, without throwing", async () => {
        const controller = createEulaController({ bridge: {} });
        expect(controller.available).toBe(false);
        expect(controller.state.value.source).toBe("fallback");
        expect(controller.state.value.failure).toContain("no way to fetch");
        expect(controller.isTheDocument.value).toBe(false);

        // Loading is a no-op rather than an error: a browser tab has no main process and
        // that is a fact about the build, not a failure worth reporting twice.
        await controller.load();
        expect(controller.state.value.source).toBe("fallback");
    });

    it("keeps the document on screen when a later refresh rejects", async () => {
        let calls = 0;
        const controller = createEulaController({
            bridge: {
                readEulaDocument: () => {
                    calls += 1;
                    return calls === 1 ? Promise.resolve(LIVE) : Promise.reject(new Error("gone"));
                },
            },
        });

        await controller.load();
        expect(controller.state.value.source).toBe("live");

        await controller.load({ refresh: true });
        // Still the text that was fetched, still labelled as fetched then, plus the
        // failure. Blanking the panel would be losing a document the user already had.
        expect(controller.state.value.text).toContain("MINECRAFT EULA");
        expect(controller.state.value.failure).toBe("gone");
    });
});

describe("timestamps", () => {
    it("formats an ISO time in the viewer's locale", () => {
        expect(formatFetchedAt("2026-08-04T10:00:00.000Z", "en-GB")).toContain("2026");
    });

    it("survives BlueMap's own locale names, which are not BCP 47 tags", () => {
        expect(formatFetchedAt("2026-08-04T10:00:00.000Z", "zh_cn")).not.toBeNull();
    });

    it("returns null rather than a wrong date for nothing and for junk", () => {
        expect(formatFetchedAt(null, "en")).toBeNull();
        expect(formatFetchedAt("soon", "en")).toBeNull();
    });
});

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

describe("highlighting a match", () => {
    const PARAGRAPH = "You may not sell it, and you may not give it away.";

    it("splits into runs that put the paragraph back together exactly", () => {
        for (const [query, regex, flags] of [
            ["may not", false, "i"],
            ["MAY NOT", false, "i"],
            ["you", false, "i"],
            ["\\bmay\\b", true, "gi"],
            ["^You", true, "i"],
            ["away\\.$", true, "i"],
            ["nothing here", false, "i"],
            ["", false, "i"],
            ["\\b", true, "gi"],
            ["(", true, "i"],
        ] as const) {
            const runs = highlightRuns(PARAGRAPH, query, regex, flags);
            expect(runsPreserve(PARAGRAPH, runs), `${query} preserved`).toBe(true);
        }
    });

    it("marks the occurrences and nothing else", () => {
        const runs = highlightRuns(PARAGRAPH, "may not", false, "i");
        expect(runs.filter((run) => run.hit).map((run) => run.text)).toEqual(["may not", "may not"]);
    });

    it("draws nothing for a zero-width match rather than an invisible mark in every gap", () => {
        const runs = highlightRuns("abc", "\\b", true, "gi");
        expect(runs.some((run) => run.hit)).toBe(false);
        expect(runsPreserve("abc", runs)).toBe(true);
    });

    it("leaves an invalid pattern's paragraph completely untouched", () => {
        const runs = highlightRuns(PARAGRAPH, "(unclosed", true, "i");
        expect(runs).toEqual([{ text: PARAGRAPH, hit: false }]);
    });
});

describe("searching across sections", () => {
    const DOCUMENT = "1. Permission\n\nYou may play.\n\n2. Restriction\n\nYou may not sell.";

    it("marks the sections that match and hides none of them", () => {
        const sections = categoriseEula(DOCUMENT);
        const report = reportSectionMatches(DOCUMENT, sections, createSettingMatcher("may not", false, "i"));
        expect(report.total).toBe(sections.length);
        expect(report.matching.size).toBeGreaterThan(0);
        expect(report.matching.size).toBeLessThan(sections.length + 1);
    });

    it("matches every section when the query is empty", () => {
        const sections = categoriseEula(DOCUMENT);
        const report = reportSectionMatches(DOCUMENT, sections, createSettingMatcher("", false, "i"));
        expect(report.matching.size).toBe(sections.length);
    });
});

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

describe("exporting", () => {
    const DOCUMENT = "1. Permission\n\nYou may play.\n\n2. Restriction\n\nYou may not sell.";
    const sections = categoriseEula(DOCUMENT);

    const context = {
        documentUrl: URL_UNDER_TEST,
        source: "live" as const,
        fetchedAt: "2026-08-04T10:00:00.000Z",
        text: DOCUMENT,
        sections,
        categoryLabel: (section: (typeof sections)[number]): string => section.category,
    };

    it("says which section a fragment is, and out of how many", () => {
        const first = sections[0];
        expect(first).toBeDefined();
        if (first === undefined) return;
        const lines = exportHeaderLines(context, first);
        expect(lines[0]).toContain(`Section 1 of ${String(sections.length)}`);
        expect(lines.join("\n")).toContain(URL_UNDER_TEST);
        expect(lines.join("\n")).toContain("2026-08-04T10:00:00.000Z");
        expect(lines.join("\n")).toContain("authoritative");
    });

    it("says plainly when the export is a cached copy or is not Mojang's document", () => {
        expect(exportHeaderLines({ ...context, source: "cache" }, null).join("\n")).toContain(
            "may not be the current wording",
        );
        expect(
            exportHeaderLines({ ...context, source: "fallback", fetchedAt: null }, null).join("\n"),
        ).toContain("Not Mojang's document");
    });

    it("exports the section's own characters and adds nothing to them", () => {
        const first = sections[0];
        expect(first).toBeDefined();
        if (first === undefined) return;
        const body = DOCUMENT.slice(first.start, first.end).trim();
        expect(exportEula(context, first, "text")).toContain(body);
        expect(exportEula(context, first, "markdown")).toContain(body);
    });

    it("names the file after what is inside it", () => {
        const first = sections[0];
        expect(first).toBeDefined();
        if (first === undefined) return;
        expect(exportFilename(null, "markdown")).toBe("minecraft-eula-full.md");
        expect(exportFilename(first, "text")).toContain(first.category);
    });
});

import { describe, expect, it } from "vitest";
import {
    LineSplitter,
    RenderOutputTracker,
    classifyTaskDescription,
    parseEta,
    parseLogLine,
    parseProgress,
} from "./progress.js";
import type { RenderSignal } from "./progress.js";

/**
 * Every string in this file is a real line, copied out of output captured from
 * `cli-5.22-27-shadow.jar` running on this machine. Nothing here is a line the format
 * "probably" produces.
 *
 * Two captures. A 1800-block world rendered into two maps, which is where the ten-second
 * progress ticks and every ETA shape come from; and a 400-block world, which finished
 * fast enough to show what the completion line looks like.
 */
const TWO_MAP_RENDER = [
    "[12:36:12 INFO] Loading resources...",
    "[12:36:13 INFO] Resources loaded.",
    "[12:36:13 INFO] Initializing Storage: 'file' (Type: 'bluemap:file')",
    "[12:36:13 INFO] Loading map 'nether'...",
    "[12:36:13 INFO] Loading map 'overworld'...",
    "[12:36:13 INFO] Start updating 2 maps ...",
    "[12:36:23 INFO] updating map 'overworld': 8.535% (ETA: 3 minutes)",
    "[12:39:53 INFO] updating map 'overworld': 68.224% (ETA: 1.9 minutes)",
    "[12:40:13 INFO] updating map 'overworld': 79.066% (ETA: 1.0 minutes)",
    "[12:40:23 INFO] updating map 'overworld': 84.429% (ETA: 41 seconds)",
    "[12:40:33 INFO] updating map 'overworld': 88.601% (ETA: 29 seconds)",
    "[12:40:43 INFO] updating map 'nether': 6.267% (ETA: 27 seconds)",
    "[12:44:33 INFO] updating map 'nether': 67.474% (ETA: 2.0 minutes)",
    "[12:45:23 INFO] updating map 'nether': 100.0%",
    "[12:45:23 INFO] Your maps are now all up-to-date!",
    "[12:45:23 INFO] Stopping...",
    "[12:45:23 INFO] Saving...",
    "[12:45:23 INFO] Stopped.",
];

const FIRST_RENDER_WITH_DOWNLOAD = [
    "[12:35:06 INFO] Downloading 'https://piston-data.mojang.com/v1/objects/2dc72797acbc1b63fc16a11c4ac393605f453754/client.jar' to 'C:\\renders\\probe\\data\\minecraft-client-26.2.jar'...",
    "[12:35:08 INFO] Loading resources...",
    "[12:35:09 INFO] Resources loaded.",
    "[12:35:09 INFO] Initializing Storage: 'file' (Type: 'bluemap:file')",
    "[12:35:09 INFO] Loading map 'overworld'...",
    "[12:35:09 INFO] Start updating 1 maps ...",
    "[12:35:19 INFO] updating map 'overworld': 100.0%",
    "[12:35:19 INFO] Your maps are now all up-to-date!",
];

/** What the CLI prints when `accept-download` is false. It then exits with code 2. */
const CONSENT_REFUSED = [
    "[12:45:47 WARNING] BlueMap is missing important resources!",
    "[12:45:47 WARNING] You must accept the required file download in order for BlueMap to work!",
    "[12:45:47 WARNING] Please check: C:\\renders\\probe\\config\\core.conf",
];

/** A map pointed at a world that does not exist. Note it still exits **0**. */
const MISSING_WORLD = [
    "[12:45:57 INFO] Loading resources...",
    "[12:45:58 INFO] Resources loaded.",
    "[12:45:58 WARNING] ",
    "################################",
    " There is a problem with your BlueMap setup!",
    "",
    " 'C:\\renders\\probe\\does-not-exist' does not exist or is no directory!",
    " Check if the 'world' setting in the config-file for that map is correct, or remove the entire config-file if you don't want that map.",
    "################################",
    "[12:45:58 INFO] Start updating 0 maps ...",
    "[12:45:58 INFO] Your maps are now all up-to-date!",
];

function run(lines: readonly string[]): RenderSignal[] {
    const tracker = new RenderOutputTracker();
    const signals: RenderSignal[] = [];
    for (const line of lines) signals.push(...tracker.push(line));
    signals.push(...tracker.finish());
    return signals;
}

describe("parseLogLine", () => {
    it("reads the prefix PrintStreamLogger writes", () => {
        expect(parseLogLine("[12:36:23 INFO] Start updating 2 maps ...")).toEqual({
            time: "12:36:23",
            level: "INFO",
            message: "Start updating 2 maps ...",
            continuation: false,
        });
    });

    it("reads every level, including ERROR which arrives on stderr", () => {
        for (const level of ["INFO", "WARNING", "ERROR", "DEBUG"] as const) {
            expect(parseLogLine(`[01:02:03 ${level}] hello`)?.level).toBe(level);
        }
    });

    it("accepts the empty message that opens a multi-line warning", () => {
        expect(parseLogLine("[12:45:58 WARNING] ")).toEqual({
            time: "12:45:58",
            level: "WARNING",
            message: "",
            continuation: false,
        });
    });

    it("returns null for a line with no prefix", () => {
        expect(parseLogLine("################################")).toBeNull();
        expect(parseLogLine("\tat java.base/java.lang.Thread.run(Thread.java:1447)")).toBeNull();
    });
});

describe("parseProgress", () => {
    it("parses the line the task description says it should", () => {
        expect(parseProgress("updating map 'overworld': 25.663% (ETA: 47 seconds)")).toEqual({
            kind: "updating-map",
            mapId: "overworld",
            description: "updating map 'overworld'",
            percent: 25.663,
            etaSeconds: 47,
            etaText: "47 seconds",
        });
    });

    it("parses the completion line, which carries no ETA", () => {
        expect(parseProgress("updating map 'nether': 100.0%")).toEqual({
            kind: "updating-map",
            mapId: "nether",
            description: "updating map 'nether'",
            percent: 100,
            etaSeconds: null,
            etaText: null,
        });
    });

    it("keeps the fractional minutes upstream prints below two minutes", () => {
        expect(parseProgress("updating map 'overworld': 68.224% (ETA: 1.9 minutes)")).toMatchObject({
            percent: 68.224,
            etaSeconds: 114,
            etaText: "1.9 minutes",
        });
        expect(parseProgress("updating map 'nether': 67.474% (ETA: 2.0 minutes)")).toMatchObject({
            etaSeconds: 120,
        });
    });

    it("recognises every task description upstream can print", () => {
        expect(classifyTaskDescription("updating map 'a'")).toEqual({
            kind: "updating-map",
            mapId: "a",
        });
        expect(classifyTaskDescription("preparing map 'a' update")).toEqual({
            kind: "preparing-map",
            mapId: "a",
        });
        expect(classifyTaskDescription("saving map 'a'")).toEqual({ kind: "saving-map", mapId: "a" });
        expect(classifyTaskDescription("purging map 'a'")).toEqual({ kind: "purging-map", mapId: "a" });
        expect(classifyTaskDescription("deleting map 'a'")).toEqual({
            kind: "deleting-map",
            mapId: "a",
        });
        // A region task names a region, not a map, so it must not claim a map id.
        expect(classifyTaskDescription("updating region (3, -4)")).toEqual({
            kind: "updating-region",
            mapId: null,
        });
    });

    it("keeps an unrecognised description rather than guessing at it", () => {
        expect(parseProgress("doing something new: 12.5% (ETA: 4 minutes)")).toMatchObject({
            kind: "unknown",
            mapId: null,
            description: "doing something new",
            percent: 12.5,
        });
    });

    it("is not fooled by ordinary log lines that contain a colon", () => {
        expect(parseProgress("Initializing Storage: 'file' (Type: 'bluemap:file')")).toBeNull();
        expect(parseProgress("Your maps are now all up-to-date!")).toBeNull();
        expect(parseProgress("Loading map 'overworld'...")).toBeNull();
    });
});

describe("parseEta", () => {
    it("converts every unit TextFormat.duration can emit", () => {
        expect(parseEta("41 seconds")).toBe(41);
        expect(parseEta("3 minutes")).toBe(180);
        expect(parseEta("1.0 minutes")).toBe(60);
        expect(parseEta("2 hours")).toBe(7200);
        expect(parseEta("1.5 days")).toBe(129600);
    });

    it("accepts a comma decimal separator, which a non-English JVM locale prints", () => {
        expect(parseEta("1,9 minutes")).toBe(114);
    });

    it("returns null rather than a wrong number for anything else", () => {
        expect(parseEta("soon")).toBeNull();
        expect(parseEta("3 fortnights")).toBeNull();
        expect(parseEta("")).toBeNull();
    });
});

describe("RenderOutputTracker", () => {
    it("walks the phases of a real two-map render in order", () => {
        const phases = run(TWO_MAP_RENDER)
            .filter((signal) => signal.kind === "phase")
            .map((signal) => (signal.kind === "phase" ? signal.phase : ""));
        expect(phases).toEqual(["loading-resources", "loading-maps", "rendering", "stopping", "finished"]);
    });

    it("reports every progress line with its map, percent and estimate", () => {
        const progress = run(TWO_MAP_RENDER).flatMap((signal) =>
            signal.kind === "progress" ? [signal.progress] : [],
        );
        expect(progress).toHaveLength(8);
        expect(progress[0]).toMatchObject({ mapId: "overworld", percent: 8.535, etaSeconds: 180 });
        expect(progress.at(-1)).toMatchObject({
            mapId: "nether",
            percent: 100,
            etaSeconds: null,
        });
    });

    it("never assumes a map reaches 100 percent", () => {
        // The real capture switched from overworld at 88.601% straight to nether. A
        // caller waiting for overworld to report 100% would wait for ever.
        const overworld = run(TWO_MAP_RENDER).flatMap((signal) =>
            signal.kind === "progress" && signal.progress.mapId === "overworld"
                ? [signal.progress.percent]
                : [],
        );
        expect(Math.max(...overworld)).toBeCloseTo(88.601);
    });

    it("reports the maps it was told about and the completion line", () => {
        const signals = run(TWO_MAP_RENDER);
        expect(signals.filter((signal) => signal.kind === "maps-scheduled")).toEqual([
            { kind: "maps-scheduled", count: 2 },
        ]);
        expect(
            signals.flatMap((signal) => (signal.kind === "map-loaded" ? [signal.mapId] : [])),
        ).toEqual(["nether", "overworld"]);
        expect(signals.some((signal) => signal.kind === "up-to-date")).toBe(true);
    });

    it("reports the Mojang download before the resources load", () => {
        const signals = run(FIRST_RENDER_WITH_DOWNLOAD);
        const downloading = signals.find((signal) => signal.kind === "downloading");
        expect(downloading).toMatchObject({
            kind: "downloading",
            url: "https://piston-data.mojang.com/v1/objects/2dc72797acbc1b63fc16a11c4ac393605f453754/client.jar",
            target: "C:\\renders\\probe\\data\\minecraft-client-26.2.jar",
        });
        const phases = signals.flatMap((signal) => (signal.kind === "phase" ? [signal.phase] : []));
        expect(phases[0]).toBe("downloading-resources");
        expect(phases[1]).toBe("loading-resources");
    });

    it("recognises the CLI's own complaint about a refused download", () => {
        const signals = run(CONSENT_REFUSED);
        expect(signals.some((signal) => signal.kind === "consent-missing")).toBe(true);
    });

    it("collects the multi-line setup banner instead of dropping its continuation lines", () => {
        const signals = run(MISSING_WORLD);
        const problem = signals.find((signal) => signal.kind === "setup-problem");
        expect(problem?.kind).toBe("setup-problem");
        if (problem?.kind === "setup-problem") {
            expect(problem.text).toContain("There is a problem with your BlueMap setup!");
            expect(problem.text).toContain("does not exist or is no directory!");
            expect(problem.text).not.toContain("####");
        }
        expect(signals.filter((signal) => signal.kind === "maps-scheduled")).toEqual([
            { kind: "maps-scheduled", count: 0 },
        ]);
    });

    it("gives an unprefixed line the level of the line before it", () => {
        const tracker = new RenderOutputTracker();
        tracker.push("[12:00:00 ERROR] Failed to serve file");
        const [log] = tracker.push("\tat java.base/java.lang.Thread.run(Thread.java:1447)");
        expect(log).toEqual({
            kind: "log",
            line: {
                time: "12:00:00",
                level: "ERROR",
                message: "\tat java.base/java.lang.Thread.run(Thread.java:1447)",
                continuation: true,
            },
        });
    });

    it("survives Windows line endings, which arrive on the pipe", () => {
        const tracker = new RenderOutputTracker();
        const signals = tracker.push("[12:36:23 INFO] updating map 'overworld': 8.535% (ETA: 3 minutes)\r");
        expect(signals.some((signal) => signal.kind === "progress")).toBe(true);
    });
});

describe("LineSplitter", () => {
    it("holds back a line that arrived in two chunks", () => {
        const splitter = new LineSplitter();
        expect(splitter.push("[12:36:23 INFO] updating map 'over")).toEqual([]);
        expect(splitter.push("world': 8.535%\n")).toEqual([
            "[12:36:23 INFO] updating map 'overworld': 8.535%",
        ]);
        expect(splitter.flush()).toEqual([]);
    });

    it("splits several lines out of one chunk", () => {
        const splitter = new LineSplitter();
        expect(splitter.push("a\nb\nc\n")).toEqual(["a", "b", "c"]);
    });

    it("returns a final line that never got its newline", () => {
        const splitter = new LineSplitter();
        expect(splitter.push("Stopped.")).toEqual([]);
        expect(splitter.flush()).toEqual(["Stopped."]);
        expect(splitter.flush()).toEqual([]);
    });
});

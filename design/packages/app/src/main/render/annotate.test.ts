/**
 * The advice table, rule by rule.
 *
 * Every rule is tested twice: once with a line it must recognise, and once with a line
 * that looks like it and must be left alone. The second half is the half that matters.
 * A pattern that fires too readily is worse than no pattern at all, because advice
 * attached to the wrong line is advice a person acts on and is misled by, and the whole
 * value of this table is that a reader can trust the annotation belongs to the sentence
 * above it.
 *
 * The sample lines are quoted from the formats `progress.ts` documents against a real
 * render, not invented to fit the patterns.
 */

import { describe, expect, it } from "vitest";
import { ADVICE_RULES, adviseOnLine, createAdvisor } from "./annotate.js";
import type { RenderAdviceKind } from "./annotate.js";

/** The kinds one line produces, which is the whole observable answer for a pure match. */
function kinds(message: string): RenderAdviceKind[] {
    return adviseOnLine(message).map((advice) => advice.kind);
}

describe("a port conflict", () => {
    it("is recognised in each of the three shapes the JVM and BlueMap print it in", () => {
        expect(kinds("java.net.BindException: Address already in use: bind")).toEqual(["port-conflict"]);
        expect(kinds("Address already in use")).toEqual(["port-conflict"]);
        expect(kinds("Failed to bind to 0.0.0.0:8100")).toEqual(["port-conflict"]);
    });

    it("is not read into a line that merely mentions something being used", () => {
        expect(kinds("Loading resources: 4 resource packs in use")).toEqual([]);
        expect(kinds("The address is 0.0.0.0:8100")).toEqual([]);
    });

    it("offers no setting, because no setting in this app frees a port", () => {
        const [advice] = adviseOnLine("Address already in use");
        expect(advice?.settings).toBeNull();
    });
});

describe("the estimate tip", () => {
    it("fires on a progress line that carries an estimate", () => {
        expect(kinds("updating map 'overworld': 25.663% (ETA: 47 seconds)")).toEqual(["render-threads"]);
        expect(kinds("updating map 'nether': 6.267% (ETA: 1.9 minutes)")).toEqual(["render-threads"]);
    });

    it("does not fire on a progress line with no estimate, which reports no remaining work", () => {
        // The last tick of a map looks exactly like this: `BlueMapCLI` omits the
        // estimate entirely once `etaMs` is not positive.
        expect(kinds("updating map 'nether': 100.0%")).toEqual([]);
        expect(kinds("updating map 'overworld': 88.601%")).toEqual([]);
    });
});

describe("a render that is updating no maps", () => {
    it("is recognised, because the engine reports it as ordinary progress", () => {
        expect(kinds("Start updating 0 maps ...")).toEqual(["no-maps-updating"]);
    });

    it("is not read into a render that is updating some", () => {
        // The one that would break a naive "starts with a zero" check.
        expect(kinds("Start updating 10 maps ...")).toEqual([]);
        expect(kinds("Start updating 1 map ...")).toEqual([]);
        expect(kinds("Start updating 3 maps ...")).toEqual([]);
    });

    it("points at the world folder, where a map that renders nothing is actually fixed", () => {
        const [advice] = adviseOnLine("Start updating 0 maps ...");
        expect(advice?.settings?.anchor).toBe("world-folder");
    });
});

describe("the web server coming up", () => {
    it("captures the address, so the advice can say where the map is", () => {
        const [advice] = adviseOnLine("WebServer bound to /0.0.0.0:8100");
        expect(advice?.kind).toBe("web-server-started");
        expect(advice?.values.address).toBe("/0.0.0.0:8100");
    });

    it("is not read into the server being disabled or shut down", () => {
        expect(kinds("WebServer is disabled")).toEqual([]);
        expect(kinds("Stopping WebServer...")).toEqual([]);
    });
});

describe("a configuration problem", () => {
    it("is recognised from the banner heading and from the load failure", () => {
        expect(kinds("There is a problem with your BlueMap setup!")).toEqual(["config-error"]);
        expect(kinds("Failed to load map config for 'overworld'")).toEqual(["config-error"]);
        expect(kinds("Failed to load configs")).toEqual(["config-error"]);
    });

    it("is not read into a config being loaded successfully", () => {
        expect(kinds("Loading map config 'overworld'")).toEqual([]);
        expect(kinds("Initializing Storage: 'file' (Type: 'FILE')")).toEqual([]);
    });
});

describe("the engine's own line", () => {
    it("is carried through exactly as it arrived, never rewritten", () => {
        const line = "java.net.BindException: Address already in use: bind";
        expect(adviseOnLine(line)[0]?.quoted).toBe(line);
    });

    it("produces nothing at all for the lines that make up most of a render", () => {
        expect(kinds("Loading resources...")).toEqual([]);
        expect(kinds("Loading map 'overworld'...")).toEqual([]);
        expect(kinds("Your maps are now all up-to-date!")).toEqual([]);
        expect(kinds("Stopped.")).toEqual([]);
        expect(kinds("")).toEqual([]);
    });
});

describe("saying a thing once", () => {
    it("offers the estimate tip on the first estimate and never again", () => {
        // A four-minute render prints one of these every ten seconds. Without this the
        // console would carry two dozen copies of the same paragraph.
        const advisor = createAdvisor();

        expect(advisor.advise("updating map 'overworld': 5.0% (ETA: 47 seconds)")).toHaveLength(1);
        expect(advisor.advise("updating map 'overworld': 15.0% (ETA: 41 seconds)")).toHaveLength(0);
        expect(advisor.advise("updating map 'nether': 6.2% (ETA: 27 seconds)")).toHaveLength(0);
    });

    it("keeps repeating the advice a rule declares as worth repeating", () => {
        const advisor = createAdvisor();

        expect(advisor.advise("Start updating 0 maps ...")).toHaveLength(1);
        expect(advisor.advise("Start updating 0 maps ...")).toHaveLength(1);
    });

    it("offers a one-shot tip again to the next render", () => {
        const advisor = createAdvisor();

        expect(advisor.advise("updating map 'overworld': 5.0% (ETA: 47 seconds)")).toHaveLength(1);
        advisor.reset();
        expect(advisor.advise("updating map 'overworld': 5.0% (ETA: 47 seconds)")).toHaveLength(1);
    });

    it("spends one rule without spending another", () => {
        const advisor = createAdvisor();

        advisor.advise("updating map 'overworld': 5.0% (ETA: 47 seconds)");
        expect(advisor.advise("Address already in use")).toHaveLength(1);
    });
});

describe("the table itself", () => {
    it("names every rule once, so one cannot quietly shadow another", () => {
        const seen = new Set(ADVICE_RULES.map((rule) => rule.kind));
        expect(seen.size).toBe(ADVICE_RULES.length);
    });

    it("carries no global or sticky pattern, which would match only every other time", () => {
        for (const rule of ADVICE_RULES) {
            expect(rule.pattern.global, rule.kind).toBe(false);
            expect(rule.pattern.sticky, rule.kind).toBe(false);
        }
    });
});

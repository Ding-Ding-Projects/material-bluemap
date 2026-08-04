/**
 * The advice table, rule by rule.
 *
 * Every rule is tested twice: once with a line it must recognise, and once with a line
 * that looks like it and must be left alone. The second half is the half that matters. A
 * pattern that fires too readily is worse than no pattern, because advice attached to
 * the wrong line is advice somebody acts on and is misled by, and the entire value of
 * this table is that the annotation can be trusted to belong to the sentence above it.
 *
 * The sample lines are quoted from the formats the main process documents against a real
 * render (`app/src/main/render/progress.ts`), not invented to fit the patterns.
 *
 * The same table exists in `app/src/main/render/annotate.ts`, because the two packages
 * compile under separate roots. These cases are deliberately the same cases as the ones
 * over there, so a pattern changed on one side and not the other fails a test rather
 * than producing advice in one half of the app and not the other.
 */

import { describe, expect, it } from "vitest";
import { ANNOTATION_RULES, annotationsFor, createAnnotator } from "./annotations.js";
import type { AnnotationKind } from "./annotations.js";

function kinds(message: string): AnnotationKind[] {
    return annotationsFor(message).map((annotation) => annotation.kind);
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

    it("names both of the two things that actually cause it", () => {
        const [annotation] = annotationsFor("Address already in use");

        // The whole point of the rule: the CLI's sentence is true and useless, and these
        // two sentences are the ones somebody needs.
        expect(annotation?.text.fallback).toContain("mod on the Minecraft server");
        expect(annotation?.text.fallback).toContain("earlier run is still alive");
        expect(annotation?.tone).toBe("warning");
        // No setting in this app frees a port, and a button that went somewhere useless
        // would be worse than no button.
        expect(annotation?.settings).toBeNull();
    });
});

describe("the estimate tip", () => {
    it("fires on a progress line that carries an estimate", () => {
        expect(kinds("updating map 'overworld': 25.663% (ETA: 47 seconds)")).toEqual(["render-threads"]);
        expect(kinds("updating map 'nether': 6.267% (ETA: 1.9 minutes)")).toEqual(["render-threads"]);
    });

    it("does not fire on a progress line with no estimate, which reports no remaining work", () => {
        // The last tick of a map looks exactly like this: the CLI omits the estimate
        // entirely once the remaining time is not positive.
        expect(kinds("updating map 'nether': 100.0%")).toEqual([]);
        expect(kinds("updating map 'overworld': 88.601%")).toEqual([]);
    });

    it("names the setting and where it is, rather than saying to use more threads", () => {
        const [annotation] = annotationsFor("updating map 'overworld': 5.0% (ETA: 47 seconds)");

        expect(annotation?.text.fallback).toContain("Render threads");
        expect(annotation?.text.fallback).toContain("map wizard");
        expect(annotation?.tone).toBe("tip");
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

    it("says that the engine will still report success, and points at the world", () => {
        const [annotation] = annotationsFor("Start updating 0 maps ...");

        expect(annotation?.text.fallback).toContain("report");
        expect(annotation?.settings?.anchor).toBe("world-folder");
        expect(annotation?.tone).toBe("warning");
    });
});

describe("the web server coming up", () => {
    it("captures the address, so the advice can say where the map is", () => {
        const [annotation] = annotationsFor("WebServer bound to /0.0.0.0:8100");

        expect(annotation?.kind).toBe("web-server-started");
        expect(annotation?.text.values.address).toBe("/0.0.0.0:8100");
        // The address travels as a named argument rather than being written into the
        // string, so a funny level can restyle the sentence without losing it.
        expect(annotation?.text.fallback).toContain("{address}");
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

    it("sends the reader to this app's own settings rather than to a text editor", () => {
        // This app writes BlueMap's config files from the map settings, so "edit
        // core.conf" would be advice for a different application.
        const [annotation] = annotationsFor("There is a problem with your BlueMap setup!");

        expect(annotation?.settings?.surface).toBe("settings");
        expect(annotation?.settings?.anchor).toBe("world-folder");
    });
});

describe("the ordinary output of a render", () => {
    it("produces nothing at all, which is most of the log", () => {
        expect(kinds("Loading resources...")).toEqual([]);
        expect(kinds("Loading map 'overworld'...")).toEqual([]);
        expect(kinds("Your maps are now all up-to-date!")).toEqual([]);
        expect(kinds("Waiting for changes on the world-files...")).toEqual([]);
        expect(kinds("Stopped.")).toEqual([]);
        expect(kinds("")).toEqual([]);
    });
});

describe("saying a thing once", () => {
    it("offers the estimate tip on the first estimate and never again", () => {
        // A four-minute render prints one of these every ten seconds. Without this the
        // console would carry two dozen copies of the same paragraph.
        const annotator = createAnnotator();

        expect(annotator.annotate("updating map 'overworld': 5.0% (ETA: 47 seconds)")).toHaveLength(1);
        expect(annotator.annotate("updating map 'overworld': 15.0% (ETA: 41 seconds)")).toHaveLength(0);
        expect(annotator.annotate("updating map 'nether': 6.2% (ETA: 27 seconds)")).toHaveLength(0);
    });

    it("keeps repeating the advice a rule declares as worth repeating", () => {
        const annotator = createAnnotator();

        expect(annotator.annotate("Start updating 0 maps ...")).toHaveLength(1);
        expect(annotator.annotate("Start updating 0 maps ...")).toHaveLength(1);
    });

    it("offers a one-shot tip again to the next render", () => {
        const annotator = createAnnotator();

        expect(annotator.annotate("updating map 'overworld': 5.0% (ETA: 47 seconds)")).toHaveLength(1);
        annotator.reset();
        expect(annotator.annotate("updating map 'overworld': 5.0% (ETA: 47 seconds)")).toHaveLength(1);
    });

    it("spends one rule without spending another", () => {
        const annotator = createAnnotator();

        annotator.annotate("updating map 'overworld': 5.0% (ETA: 47 seconds)");
        expect(annotator.annotate("Address already in use")).toHaveLength(1);
    });
});

describe("the table itself", () => {
    it("names every rule once, so one cannot quietly shadow another", () => {
        const seen = new Set(ANNOTATION_RULES.map((rule) => rule.kind));
        expect(seen.size).toBe(ANNOTATION_RULES.length);
    });

    it("carries no global or sticky pattern, which would match only every other time", () => {
        for (const rule of ANNOTATION_RULES) {
            expect(rule.pattern.global, rule.kind).toBe(false);
            expect(rule.pattern.sticky, rule.kind).toBe(false);
        }
    });

    it("gives every rule a key and a fallback long enough to be advice", () => {
        for (const rule of ANNOTATION_RULES) {
            expect(rule.key, rule.kind).toMatch(/^world\.console\.advice\./);
            // A one-line restatement of the engine's own sentence would satisfy the type
            // and help nobody, so the bar is a length that forces a real explanation.
            expect(rule.fallback.length, rule.kind).toBeGreaterThan(80);
        }
    });
});

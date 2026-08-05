/**
 * The tour's words, resolved from a step id.
 *
 * `renderRun.ts`'s `phaseLabel`/`adviseOnFailure` are the model this follows: a plain
 * function taking the real `t`, with one literal, quoted-string `t()` call per case rather
 * than a call built from two variables. `appCopy.test.ts` and `catalogueCoverage.test.ts`
 * both find a key's real call site by reading source text for a quoted string argument, so a
 * call whose key and fallback both come out of a variable would be invisible to that scan -
 * and a catalogue entry with no call site the scanner can find is exactly the "translates
 * nothing" failure those tests exist to catch.
 *
 * `tutorialSteps.ts` stays plain data on purpose; this is the one place its step ids turn
 * into words, so the catalogue keys are declared exactly once each.
 */

import type { TutorialStepId } from "./tutorialSteps.js";

/** The translator the tour takes, so it works with or without a real vue-i18n instance. */
export type Translate = {
    (key: string, fallback: string): string;
    (key: string, named: Readonly<Record<string, unknown>>, fallback: string): string;
};

export function tutorialStepTitle(id: TutorialStepId, t: Translate): string {
    switch (id) {
        case "welcome":
            return t("tutorial.step.welcome.title", "Welcome to BlueMap");
        case "makeAMap":
            return t("tutorial.step.makeAMap.title", "Make a map");
        case "findWorld":
            return t("tutorial.step.findWorld.title", "Finding a world");
        case "rendering":
            return t("tutorial.step.rendering.title", "What rendering does");
        case "openMap":
            return t("tutorial.step.openMap.title", "Opening the finished map");
        case "publish":
            return t("tutorial.step.publish.title", "Sharing it, if you want to");
        case "wrapUp":
            return t("tutorial.step.wrapUp.title", "Come back any time");
        default:
            return id;
    }
}

export function tutorialStepBody(id: TutorialStepId, t: Translate): string {
    switch (id) {
        case "welcome":
            return t(
                "tutorial.step.welcome.body",
                "BlueMap turns a Minecraft world into a map you can pan, zoom and explore, right here on the Map tab.",
            );
        case "makeAMap":
            return t(
                "tutorial.step.makeAMap.body",
                "This tab is where you turn a Minecraft world into a map: point BlueMap at one, answer a few short questions, and it renders.",
            );
        case "findWorld":
            return t(
                "tutorial.step.findWorld.body",
                "BlueMap looks in this computer's default Minecraft folder automatically, with nothing to configure, and lists what it finds below. Nothing there? Browse for a folder, type a path, or drag one in.",
            );
        case "rendering":
            return t(
                "tutorial.step.rendering.body",
                "Rendering reads the world and draws it into map tiles on disk. There is no fixed time for it: a small world can take minutes, a huge one can take hours. Once it starts, you will see a percentage and, after a while, an estimate of what is left.",
            );
        case "openMap":
            return t(
                "tutorial.step.openMap.body",
                "When a render finishes, its tiles are written straight into your maps folder, and an Open the map button appears. Come back to this tab any time to open what BlueMap made.",
            );
        case "publish":
            return t(
                "tutorial.step.publish.body",
                "By default a finished map only opens on this computer. This tab can publish it to GitHub Pages instead: a real, free address anyone can open, still nothing but files.",
            );
        case "wrapUp":
            return t(
                "tutorial.step.wrapUp.body",
                "That is the whole loop: find a world, render it, open it, and publish it if you want to. Replay this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            );
        default:
            return "";
    }
}

/** "Step {n} of {m}." - the progress line read out alongside each step's own title. */
export function tutorialProgressText(n: number, m: number, t: Translate): string {
    return t("tutorial.progress", { n, m }, "Step {n} of {m}.");
}

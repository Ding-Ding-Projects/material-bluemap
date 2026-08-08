/**
 * The motion layer, held to the three promises that make it safe to ship.
 *
 * `vuetify.test.ts` proves the motion *tokens* exist and carry MD3 Expressive's own values.
 * This file is about the rules that spend them on the moments that carry meaning - a tab
 * panel arriving, a group opening, a list painting, a toast joining or leaving the corner -
 * and about the three ways that kind of work goes wrong:
 *
 *  1. **A number gets typed in.** One `0.2s` in one component is how a token system stops
 *     being a system: the app can no longer be slowed down, sped up or retuned from one
 *     place, and nothing reports it. Every duration and every curve in `motion.scss` is
 *     asserted to be a `var(--md-sys-motion-*)`, and every name it uses is asserted to
 *     actually exist in `md3.scss` - a `var()` pointing at a token nobody declared resolves
 *     to nothing and silently animates instantly.
 *
 *  2. **Somebody who asked for no motion gets motion anyway.** This is the completion
 *     blocker, not a nice-to-have, and it has two halves here. `global.scss`'s kill switch
 *     zeroes `transition-duration` and `animation-duration` under `#app` - so it reaches
 *     every class below, but it does *not* zero delays, and it cannot reach the overlay
 *     layer at all because Vuetify teleports that to a `.v-overlay-container` appended to
 *     `<body>`. Both gaps are closed inside `motion.scss` itself, and both are asserted
 *     here: a `reduce` block that turns the animations and transitions off with the
 *     shorthand (which resets the delay too), and the one overlay rule written inside
 *     `@media (prefers-reduced-motion: no-preference)` so that under `reduce` it does not
 *     exist rather than being overridden.
 *
 *  3. **The motion gets in the way.** Nothing may animate a property that reflows the page,
 *     nothing may outlast `long4`, and nothing may sit over a control while it plays.
 *
 * Read as source, for the reason `App.shellFabClearance.test.ts` and
 * `AppTitleBar.shape.test.ts` already state: jsdom computes no layout and attaches no
 * stylesheet, so `getComputedStyle` in a mounted test returns the empty string whether these
 * rules are right, wrong or absent. The mounted half of this - that a page switch does not
 * remount a shared page and does not block interaction - is next door in
 * `components/tabs/TabbedNavigation.motion.test.ts` and
 * `components/config/ConfigNotifications.motion.test.ts`, where mounting really is the only
 * way to see it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

/**
 * The same source with its comments removed.
 *
 * `motion.scss` explains itself at length and several of those explanations quote the very
 * numbers they exist to warn about - "0.01ms", "0.3s on `cubic-bezier(0.4, 0, 0.2, 1)`". An
 * assertion about what a stylesheet *does* has to read what it does. Same helper, same
 * reason, as `vuetify.test.ts`.
 */
function code(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

const motion = read("./styles/motion.scss");
const md3 = read("./styles/md3.scss");
const rules = code(motion);

/** Every `property: value` pair in the sheet, comments already gone. */
function declarations(source: string): { property: string; value: string }[] {
    return [...source.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((match) => ({
        property: match[1] ?? "",
        value: (match[2] ?? "").replace(/\s+/g, " ").trim(),
    }));
}

/** The declared value of one `--md-sys-motion-duration-*` token, in milliseconds. */
function durationMs(step: string): number {
    const declared = md3.match(
        new RegExp(`--md-sys-motion-duration-${step}\\s*:\\s*(\\d+)ms;`),
    )?.[1];
    expect(declared, `md3.scss declares no duration ${step}`).toBeDefined();
    return Number(declared);
}

/** The properties a rule may put in motion: both composited, neither reflows. */
const ANIMATABLE = new Set(["opacity", "transform", "none"]);

describe("every duration and every curve in the motion sheet comes from a token", () => {
    /** The declarations that decide how long something takes or what shape it moves in. */
    const timed = declarations(rules).filter(({ property }) =>
        /^(transition|animation)(-duration|-delay|-timing-function)?$/.test(property),
    );

    it("has something to check in the first place", () => {
        // A regex suite that passes because it matched nothing is the failure mode every
        // assertion below shares, so the count is pinned rather than assumed.
        expect(timed.length).toBeGreaterThanOrEqual(10);
    });

    it("never hard-codes a duration", () => {
        for (const { property, value } of timed) {
            expect(value, `${property}: ${value} hard-codes a time`).not.toMatch(/\d+\s*m?s\b/);
        }
    });

    it("never hard-codes an easing curve, or falls back to a browser keyword", () => {
        expect(rules, "a raw cubic-bezier() is a curve that agrees with nothing").not.toMatch(
            /cubic-bezier\(/,
        );
        for (const { property, value } of timed) {
            expect(value, `${property}: ${value} names a browser easing keyword`).not.toMatch(
                /\b(ease|ease-in|ease-out|ease-in-out|step-start|step-end)\b/,
            );
        }
    });

    it("says every one of them with a --md-sys-motion-* token", () => {
        for (const { property, value } of timed) {
            // `none` is the reduced-motion block turning a whole shorthand off; it names no
            // duration and no curve, so there is nothing in it for a token to feed.
            if (value === "none") continue;
            expect(value, `${property}: ${value} spends no motion token`).toMatch(
                /var\(--md-sys-motion-(?:duration|easing)-[a-z0-9-]+\)/,
            );
        }
    });

    it("names only tokens `md3.scss` actually declares", () => {
        const named = new Set(
            [...rules.matchAll(/var\((--md-sys-motion-[a-z0-9-]+)\)/g)].map(
                (match) => match[1] ?? "",
            ),
        );
        expect(named.size).toBeGreaterThanOrEqual(4);
        for (const name of named) {
            // A `var()` pointing at a token nobody declared resolves to nothing, and the
            // declaration it is in is dropped - which reads on screen as "no animation",
            // exactly the state this whole sheet exists to leave behind.
            expect(md3, `${name} is not declared in md3.scss`).toMatch(
                new RegExp(`\\${name}\\s*:`),
            );
        }
    });
});

describe("no piece of motion outstays its welcome or reflows the page", () => {
    it("keeps every single step inside the duration ladder", () => {
        const steps = [...rules.matchAll(/var\(--md-sys-motion-duration-([a-z0-9]+)\)/g)].map(
            (match) => match[1] ?? "",
        );
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
            expect(durationMs(step), `duration ${step} is longer than long4`).toBeLessThanOrEqual(
                durationMs("long4"),
            );
        }
    });

    it("keeps the staggered list's last row inside long4 too, delay included", () => {
        // The cascade is the only thing here that adds a delay to a duration, and it is the
        // only way a 250ms animation can end up finishing 450ms after it was asked for. The
        // cap has to hold on the *last* row, which is the one the `n + 5` rule catches.
        const delays = [...rules.matchAll(/animation-delay:\s*([^;]+);/g)].map(
            (match) => match[1] ?? "",
        );
        expect(delays.length).toBeGreaterThan(0);

        const longestDelay = Math.max(
            ...delays.map((value) => {
                const step = /--md-sys-motion-duration-([a-z0-9]+)/.exec(value)?.[1] ?? "short1";
                const multiplier = Number(/\*\s*(\d+)/.exec(value)?.[1] ?? 1);
                return durationMs(step) * multiplier;
            }),
        );
        const longestDuration = Math.max(
            ...[...rules.matchAll(/var\(--md-sys-motion-duration-([a-z0-9]+)\)/g)].map((match) =>
                durationMs(match[1] ?? "short1"),
            ),
        );

        expect(longestDelay + longestDuration).toBeLessThanOrEqual(durationMs("long4"));
    });

    it("puts only opacity and transform in motion, never a property that reflows", () => {
        // `width`, `height`, `top` and `left` all move other elements when they change, on
        // the main thread, every frame. `transform` and `opacity` are composited and move
        // nothing but themselves.
        for (const { property, value } of declarations(rules)) {
            if (!/^transition(-property)?$/.test(property)) continue;
            const moved = value
                .split(",")
                .map((part) => part.trim().split(/\s+/)[0] ?? "")
                .filter((name) => name !== "");
            for (const name of moved) {
                expect(ANIMATABLE.has(name), `transition moves ${name}`).toBe(true);
            }
        }
    });

    it("moves only opacity and transform in its keyframes, for the same reason", () => {
        const frames = [...rules.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)];
        expect(frames.length).toBeGreaterThan(0);
        for (const frame of frames) {
            for (const { property } of declarations(frame[1] ?? "")) {
                expect(ANIMATABLE.has(property), `a keyframe animates ${property}`).toBe(true);
            }
        }
    });

    it("stops a toast on its way out from taking an interaction with it", () => {
        // For the 150ms of its exit the toast is still painted and still carries a dismiss
        // button and possibly a "Retry", all of them attached to a notice the user has
        // already sent away. Clicks pass through instead: motion may never be the reason a
        // control does not respond.
        const leaving = /\.mb-notice-leave-active\s*\{[^}]*\}/.exec(rules)?.[0] ?? "";
        expect(leaving).toMatch(/pointer-events:\s*none/);
        // And it stays in flow while it goes - see the sheet's own comment on why animating
        // the reflow would need the leaver out of flow, and why that is the wrong trade here.
        expect(leaving).not.toMatch(/position:\s*absolute/);
    });
});

describe("prefers-reduced-motion: reduce removes all of it", () => {
    const reduceAt = rules.indexOf("@media (prefers-reduced-motion: reduce)");

    it("has a reduce block, and has it last so it wins without an !important", () => {
        expect(reduceAt).toBeGreaterThan(0);
        // Everything it turns off is declared above it at the same specificity, so source
        // order is what settles it. A rule added after this block would silently escape.
        expect(rules.trim().endsWith("}")).toBe(true);
        // Every rule in this sheet is written at column zero unless it is inside a block, so
        // an unindented selector after the reduce block is a rule that escaped it.
        expect(rules.slice(reduceAt)).not.toMatch(/\n\.[a-z-]/);
        expect(rules.lastIndexOf("@media")).toBe(reduceAt);
    });

    it("turns motion off with the shorthand, so the delay goes with the duration", () => {
        const block = rules.slice(reduceAt);
        // `global.scss`'s kill switch zeroes durations but not delays. A 0.01ms animation
        // with a 200ms delay and `animation-fill-mode: both` is content held invisible for a
        // fifth of a second: motion removed, and a new defect put in its place. The
        // shorthand resets the delay too, which is why it is the shorthand.
        expect(block).toMatch(/animation:\s*none/);
        expect(block).toMatch(/transition:\s*none/);
        expect(block).not.toMatch(/animation-duration|transition-duration/);
    });

    it("names every class family the sheet declares above it", () => {
        const declared = new Set(
            [...rules.slice(0, reduceAt).matchAll(/\.(mb-[a-z-]+?)(?:-(?:enter|leave|move))/g)].map(
                (match) => match[1] ?? "",
            ),
        );
        // The three families: the page arrival, the list entry, the notification stack.
        expect(declared.size).toBeGreaterThanOrEqual(2);

        const block = rules.slice(reduceAt);
        for (const family of [...declared, "mb-motion-enter", "mb-motion-stagger"]) {
            expect(block, `${family} survives prefers-reduced-motion`).toContain(family);
        }
    });

    it("also puts every from-state back, so nothing is left painted at opacity 0", () => {
        // With the transition gone, an element still carries its `-enter-from` class for the
        // frame before Vue swaps it. Left at `opacity: 0` that is a flash of nothing; this is
        // what makes the degraded path an instant appearance rather than a blink.
        const block = rules.slice(reduceAt);
        expect(block).toMatch(/\.mb-page-enter-from/);
        expect(block).toMatch(/opacity:\s*1/);
        expect(block).toMatch(/transform:\s*none/);
    });

    it("writes the one rule the #app kill switch cannot reach so that reduce deletes it", () => {
        // Vuetify's `useTeleport` appends `.v-overlay-container` to `<body>`, a sibling of
        // `#app`, so `global.scss`'s `#app *` kill switch reaches no menu, dialog or scrim.
        // The scrim rule is therefore inside `no-preference`, exactly as Vuetify writes its
        // own: under `reduce` the declaration is not overridden, it is not there.
        const noPreference =
            /@media \(prefers-reduced-motion: no-preference\)\s*\{([\s\S]*?)\n\}/.exec(
                rules,
            )?.[1] ?? "";
        expect(noPreference).toContain(".v-overlay__scrim");
        const scrimRules = [...rules.matchAll(/\.v-overlay__scrim[^{]*\{[^}]*\}/g)];
        expect(scrimRules).toHaveLength(2);
        for (const rule of scrimRules) {
            expect(noPreference, "an overlay rule escaped the no-preference wrapper").toContain(
                rule[0],
            );
        }
    });

    it("is backed up by global.scss's own kill switch, which every class here sits under", () => {
        const global = read("./styles/global.scss");
        expect(global).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
        expect(global.slice(global.indexOf("@media (prefers-reduced-motion: reduce)"))).toMatch(
            /transition-duration:\s*0\.01ms\s*!important/,
        );
    });
});

describe("the appearance editor still wins", () => {
    it("adds no !important except on the two Vuetify motion classes that already had one", () => {
        // An `!important` outranks an inline style, and the appearance editor applies a
        // user's overrides inline - which is why `global.scss` bans them outright except
        // where a Vuetify utility is already `!important` and cannot be re-pointed any other
        // way. `.fade-transition-*-active` ships `transition-duration: 0.3s !important`, so
        // it is that exact exception; nothing else here may borrow it.
        const important = rules.match(/^.*!important.*$/gm) ?? [];
        expect(important).toHaveLength(4);
        for (const line of important) {
            expect(
                /transition-duration|transition-timing-function/.test(line),
                `unexpected !important: ${line.trim()}`,
            ).toBe(true);
        }
        for (const rule of rules.matchAll(/([^{}]*)\{([^{}]*!important[^{}]*)\}/g)) {
            expect((rule[1] ?? "").trim(), "an !important outside the scrim rules").toMatch(
                /\.v-overlay__scrim/,
            );
        }
    });
});

describe("the sheet reaches a running application", () => {
    it("is imported, after global.scss so the kill switch is already in force", () => {
        const main = read("./main.ts");
        expect(main).toMatch(/import "\.\/styles\/motion\.scss"/);
        expect(main.indexOf('import "./styles/motion.scss"')).toBeGreaterThan(
            main.indexOf('import "./styles/global.scss"'),
        );
    });
});

/**
 * The other half: the components that opt in.
 *
 * A vocabulary nothing uses is the same defect this project keeps finding one layer down -
 * built, correct, and reachable by nobody. These are deliberately shallow assertions about
 * which surface spends which class, so a class renamed on one side of the seam fails here
 * rather than quietly animating nothing.
 */
describe("the surfaces that spend it", () => {
    it("animates the tab panel's arrival, without ever mounting two pages at once", () => {
        const source = read("./components/tabs/TabbedNavigation.vue");
        expect(source).toMatch(/<Transition name="mb-page" mode="out-in">/);
        // `out-in` is what keeps "only the active page is rendered" true - the default mode
        // overlaps them, and one of this application's pages owns a map renderer.
        expect(source).toMatch(/:key="activePage\.id"/);
        // Keyed by the page rather than the tab: two tabs may name the same page, and
        // switching between them must not tear that page down and build it again.
        expect(source).not.toMatch(/:key="activeTab\.id"/);
        // No leave rule exists, so the leave costs a frame rather than an animation.
        expect(rules).not.toMatch(/\.mb-page-leave/);
    });

    it("drives that transition from CSS classes alone, which is what the media query switches off", () => {
        // `styles/motion.scss` deletes `.mb-page-enter-*` under `prefers-reduced-motion:
        // reduce`. That is only decisive while the transition has nothing else driving it: a
        // `@enter` hook or `:css="false"` would animate straight past the media query, in JS,
        // for somebody who asked for no motion. That is the exact defect this project treats
        // as a completion blocker, so the absence of both is asserted rather than assumed.
        const source = read("./components/tabs/TabbedNavigation.vue");
        const transition = /<Transition\b[^>]*>/.exec(source)?.[0] ?? "";
        expect(transition).not.toBe("");
        expect(transition).not.toMatch(/:css/);
        for (const hook of [
            "before-enter",
            "enter",
            "after-enter",
            "before-leave",
            "leave",
            "after-leave",
            "appear",
        ]) {
            expect(transition, `the panel transition takes a JS ${hook} hook`).not.toMatch(
                new RegExp(`[@:]${hook}\\b`),
            );
        }

        // Same for the notification stack, which is the other `<Transition>` in the tree.
        const stack =
            /<TransitionGroup\b[\s\S]*?>/.exec(
                read("./components/config/ConfigNotifications.vue"),
            )?.[0] ?? "";
        expect(stack).not.toBe("");
        expect(stack).not.toMatch(/:css|[@:](?:before-)?(?:enter|leave)\b/);
    });

    it("animates a tab group's tabs into the strip on entry only", () => {
        expect(read("./components/tabs/TabStrip.vue")).toMatch(/class="mb-motion-enter"/);
    });

    it("animates the lists that build a list, staggered, on the container", () => {
        expect(read("./components/renders/RendersScreen.vue")).toMatch(
            /class="mb-renders__list mb-motion-stagger"/,
        );
        expect(read("./components/notifications/NoticeCentrePanel.vue")).toMatch(
            /class="mb-notice-centre__list mb-motion-stagger"/,
        );
        // Downloads takes the single-element form: its cards share a parent with the search
        // field and two notes, which an `nth-child` cascade would count as rows.
        expect(read("./components/downloads/ReleaseDownloads.vue")).toMatch(
            /class="mb-motion-enter"/,
        );
    });

    it("gives the notification stack a transition group, keeping the element it always had", () => {
        const source = read("./components/config/ConfigNotifications.vue");
        expect(source).toMatch(/<TransitionGroup[\s\S]*?name="mb-notice"/);
        expect(source).toMatch(/<TransitionGroup[\s\S]*?tag="div"/);
        // The live region and the class are what the rest of the app and its tests know this
        // element by; a transition may not quietly rename either.
        expect(source).toMatch(/class="mb-config-notices__stack"/);
        expect(source).toMatch(/aria-live="polite"/);
    });

    it("re-points Home's section reveal at the tokens instead of its own 160ms", () => {
        const home = code(read("./components/home/HomeScreen.vue"));
        const rule = /\.mb-home__panel--open\s*\{[^}]*\}/.exec(home)?.[0] ?? "";
        expect(rule).toMatch(/var\(--md-sys-motion-duration-[a-z0-9]+\)/);
        expect(rule).toMatch(/var\(--md-sys-motion-easing-[a-z-]+\)/);
        expect(rule, "the magic number is back").not.toMatch(/\d+\s*m?s\b/);
        expect(rule).not.toMatch(/\bease\b/);
        // Its own reduced-motion escape hatch predates all of this and has to stay.
        expect(home).toMatch(
            /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.mb-home__panel--open\s*\{\s*animation: none;/,
        );
    });
});

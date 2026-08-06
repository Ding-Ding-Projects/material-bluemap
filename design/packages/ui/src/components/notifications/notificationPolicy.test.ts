/**
 * The two clauses of issue #13 that are promises about code nobody has written yet.
 *
 * "Everything that only informs becomes a notification" is a claim about every future
 * surface as much as about the existing ones, so it is enforced as an inventory: every
 * blocking surface in this package is declared below with the decision it asks the user to
 * make, and a new one fails this file until somebody writes that sentence down. The
 * declaration is the whole mechanism. It is very easy to reach for a dialog to say "saved",
 * and very hard to fill in "the decision the user must make before continuing" for one.
 *
 * "No nagging. Not now, not later" is the same shape for the same reason. It is a promise
 * about copy, so it is a scan for the copy: nothing in this package asks for money,
 * sponsorship, a rating, a review, a subscription or an upgrade, and the day somebody adds
 * it, this test says so with the file and the line.
 *
 * A handful of layout guarantees are here too, because jsdom computes no layout and the
 * stylesheet is therefore the only honest evidence for them: a corner that lets pointer
 * events through, a dismiss target big enough to hit, and a stack that cannot overlap
 * because it is a flow column rather than positioned boxes.
 *
 * This file is deliberately not in the jsdom environment its neighbour uses: under jsdom
 * `import.meta.url` is not a `file:` URL, so `fileURLToPath` throws before a single
 * assertion runs.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
    GENERATED_STATIC_DATA_BANNER,
    isGeneratedStaticDataSource,
} from "../generatedStaticDataPolicy.js";

/** `packages/ui/src`, two levels above this file. */
const uiSource = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string, extensions: readonly string[]): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) found.push(...sourceFiles(path, extensions));
        else if (extensions.some((extension) => name.endsWith(extension))) found.push(path);
    }
    return found;
}

function relativeToSource(path: string): string {
    return relative(uiSource, path).replaceAll("\\", "/");
}

function read(path: string): string {
    return readFileSync(join(uiSource, path), "utf8");
}

/** The files this feature owns, named once so every policy below covers the same set. */
const NOTIFICATION_FILES = [
    "components/config/ConfigNotifications.vue",
    "components/config/notifications.ts",
    "components/notifications/NotificationCentre.vue",
    "components/notifications/NoticeCentrePanel.vue",
    "components/notifications/noticeCentre.ts",
    "stores/notices.ts",
] as const;

/* -------------------------------------------------------------------------- */
/* Which surfaces are allowed to block                                        */
/* -------------------------------------------------------------------------- */

interface BlockingSurface {
    /** How many blocking surfaces the file is expected to contain. */
    readonly count: number;
    /** The decision the user must make before work can continue. */
    readonly decision: string;
}

/**
 * Every surface in this package that halts the user, and why it is entitled to.
 *
 * Each entry has to name a decision the user must make before work can continue: a
 * confirmation, an unsaved-work prompt, a destructive gate, a consent step. The one other
 * thing a blocking surface may be is one the user opened themselves and can close again,
 * which is not an interruption at all; those say so in the same field.
 *
 * What no entry may say is that it reports something. "Telling them it worked" is not a
 * decision, a failure is not a decision, and progress is certainly not a decision. An entry
 * that cannot fill this field honestly is a surface that should have been a notification.
 */
const BLOCKING_SURFACES: Record<string, BlockingSurface> = {
    "components/config/ConfigApplyDialog.vue": {
        count: 1,
        decision: "Write these files to disk, or go back. The plan is stated before anything is written.",
    },
    "components/config/MapsScreen.vue": {
        count: 2,
        decision: "Name and create a map, or clone one. Both are forms the user must complete or cancel.",
    },
    "components/config/StoragesScreen.vue": {
        count: 1,
        decision: "Name and create a storage, which the user must complete or cancel.",
    },
    "components/menu/MenuSuperConfirm.vue": {
        count: 1,
        decision: "The destructive-action gate: two keys and a slider before anything irreversible happens.",
    },
    "components/setup/FirstRunSetup.vue": {
        count: 1,
        decision: "First-run consent, which cannot be assumed and cannot be deferred.",
    },
    /*
     * `App.vue` was here for the server-profile manager's overlay and no longer is. The
     * maps-and-servers list is a tab now, so the shell opens nothing the user cannot see past
     * at all - which is the outcome this inventory exists to push code towards, and the
     * declaration is removed rather than left at zero so the count check keeps meaning
     * something.
     */
    "components/palette/CommandPalette.vue": {
        count: 1,
        decision:
            "The command palette, which the user summons by shortcut and closes with Escape. It " +
            "takes the keyboard on purpose because typing a command is the whole point of it.",
    },
    "components/remote/RemoteTargetEditor.vue": {
        count: 1,
        decision:
            "The remote file browser opened by the work directory's Browse button: choose a " +
            "folder on that machine to use as the work directory, or cancel and keep the typed " +
            "value. The user opens it themselves and closes it with Cancel, Escape, or by " +
            "choosing a folder - it never appears on its own.",
    },
    "components/world/SshWorldSourcePanel.vue": {
        count: 1,
        decision:
            "Choose the world folder on that SSH machine, or cancel and keep the current path. " +
            "The browser opens only after the user presses Browse and never interrupts startup.",
    },
};

/** Opens something the user cannot see past. */
const BLOCKING_TAG = /<v-dialog\b|<v-overlay\b|<v-bottom-sheet\b/g;

describe("a dialog is for a decision, and only for a decision", () => {
    const files = sourceFiles(uiSource, [".vue"]);

    const found = new Map<string, number>();
    for (const file of files) {
        const count = readFileSync(file, "utf8").match(BLOCKING_TAG)?.length ?? 0;
        if (count > 0) found.set(relativeToSource(file), count);
    }

    it("finds the surfaces it is supposed to be watching", () => {
        expect(files.length).toBeGreaterThan(20);
        expect(found.size).toBeGreaterThan(0);
    });

    it("has no blocking surface that is not declared with the decision it asks for", () => {
        const undeclared = [...found]
            .filter(([file]) => BLOCKING_SURFACES[file] === undefined)
            .map(([file, count]) => `${file} opens ${count} blocking surface(s)`);

        expect(
            undeclared,
            "A dialog halts the application, so it is reserved for a decision the user must " +
                "make before continuing. Anything that only informs (progress, success, a " +
                "storage failure, a disconnect) belongs in the notification corner through " +
                "notify() or raiseNotice(). If this really is a decision, declare it in " +
                "BLOCKING_SURFACES with the decision it asks.",
        ).toEqual([]);
    });

    it("counts the same number in each declared file, so a new one cannot hide beside an old one", () => {
        const drifted = Object.entries(BLOCKING_SURFACES)
            .map(([file, surface]) => ({ file, want: surface.count, have: found.get(file) ?? 0 }))
            .filter((entry) => entry.want !== entry.have)
            .map((entry) => `${entry.file}: declared ${entry.want}, found ${entry.have}`);

        expect(
            drifted,
            "Either a blocking surface was added to a file that already had one, or one was " +
                "removed and the declaration is now stale. Both need the count updating, and " +
                "an addition needs its decision stated.",
        ).toEqual([]);
    });

    it("makes every declaration state an actual decision rather than an empty string", () => {
        for (const [file, surface] of Object.entries(BLOCKING_SURFACES)) {
            expect(surface.decision.length, `${file} declares no decision`).toBeGreaterThan(20);
        }
    });

    it("keeps the notification path itself free of every one of them", () => {
        for (const path of NOTIFICATION_FILES) {
            const text = read(path);
            expect(text.match(BLOCKING_TAG), `${path} opens a blocking surface`).toBeNull();
            expect(text, `${path} claims a modal role`).not.toContain('role="dialog"');
            expect(text, `${path} marks itself modal`).not.toContain("aria-modal");
        }
    });
});

/* -------------------------------------------------------------------------- */
/* No nagging                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Copy this application will never contain.
 *
 * Deliberately phrases rather than words. "Review" is in this package already, in "Review
 * this app's access on GitHub", which is a destination and not a plea for five stars, and
 * "subscription" appears half a dozen times for an event listener that has to be detached.
 * A guard that fires on either is a guard somebody switches off, so each pattern below is
 * worded so that a match is a nag or nothing.
 */
const NAG_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
    { label: "asking for money", pattern: /\bdonat(?:e|ion|ions)\b/i },
    { label: "asking for sponsorship", pattern: /\bsponsors?(?:hip)?\b/i },
    { label: "a funding platform", pattern: /\bpatreon\b|\bko-?fi\b|\bpaypal\b|\bopen ?collective\b/i },
    { label: "a tip jar", pattern: /\bbuy me a coffee\b|\btip jar\b/i },
    {
        label: "asking to be supported",
        pattern: /\bsupport (?:us|the project|development)\b|\bbecome a (?:supporter|backer)\b/i,
    },
    {
        label: "asking for a rating",
        pattern: /\brate (?:us|this app|the app)\b|\bleave a (?:review|rating)\b|\bwrite a review\b/i,
    },
    {
        label: "selling an upgrade",
        pattern:
            /\bupgrade to (?:pro|premium|plus)\b|\b(?:pro|premium) version\b|\bgo premium\b|\bunlock (?:the )?(?:full|pro|premium)\b/i,
    },
    {
        label: "selling a subscription",
        pattern:
            /\bsubscribe now\b|\bfree trial\b|\bstart (?:your|a) (?:free )?trial\b|\bsubscription plan\b|\bmanage (?:your )?subscription\b|\bsubscribe to (?:pro|premium|plus)\b/i,
    },
    {
        label: "selling a licence",
        pattern: /\bbuy now\b|\bpurchase a lic[es]nce\b|\benter your lic[es]nce key\b/i,
    },
];

describe("this application never asks the user for anything it does not need", () => {
    /**
     * Tests are excluded, and this file is why: a guard that scans for the words it is made
     * of reports itself. Shipped copy lives in `.vue` and non-test `.ts`, which is what is
     * scanned, so nothing a user can read is left out by the exclusion.
     */
    const allFiles = sourceFiles(uiSource, [".ts", ".vue"]);
    const generatedStaticFiles = allFiles.filter((file) =>
        isGeneratedStaticDataSource(relativeToSource(file), readFileSync(file, "utf8")),
    );
    const files = allFiles.filter(
        (file) =>
            !file.endsWith(".test.ts") &&
            !isGeneratedStaticDataSource(relativeToSource(file), readFileSync(file, "utf8")),
    );

    it("scans the whole package rather than one folder", () => {
        expect(files.length).toBeGreaterThan(40);
        expect(files.map(relativeToSource)).toContain("App.vue");
    });

    it("keeps passive generated history while scanning every executable source file", () => {
        const paths = generatedStaticFiles.map(relativeToSource);
        const changelog = "components/changelog/changelogData.generated.ts";

        expect(paths).toContain(changelog);
        expect(files.map(relativeToSource)).not.toContain(changelog);
        expect(read(changelog)).toContain("sponsorship");
        expect(
            isGeneratedStaticDataSource(
                "components/example.generated.ts",
                "export const prompt = 'Sponsor this project';",
            ),
            "a suffix alone must not exempt real prompt copy",
        ).toBe(false);
        expect(
            isGeneratedStaticDataSource(
                "components/example.ts",
                `/** ${GENERATED_STATIC_DATA_BANNER} */\nexport const prompt = 'Sponsor this project';`,
            ),
            "a banner alone must not exempt an ordinary source file",
        ).toBe(false);
    });

    it("has no prompt for payment, sponsorship, a rating, a subscription or an upgrade", () => {
        const hits: string[] = [];

        for (const file of files) {
            readFileSync(file, "utf8")
                .split("\n")
                .forEach((line, index) => {
                    for (const nag of NAG_PATTERNS) {
                        if (nag.pattern.test(line)) {
                            hits.push(`${relativeToSource(file)}:${index + 1} (${nag.label}) ${line.trim()}`);
                        }
                    }
                });
        }

        expect(
            hits,
            "Issue #13: no unsolicited prompts for payment, donations, sponsorship, reviews, " +
                "ratings, upgrades or subscriptions. Not now, not later. A user-initiated " +
                "account or billing flow may explain itself in context, but nothing may " +
                "interrupt to ask.",
        ).toEqual([]);
    });

    it("catches such copy when it is added, rather than passing because it looks for nothing", () => {
        const invented = [
            'const a = t("nag.donate", "Support us with a donation.");',
            "<v-btn>Upgrade to Pro</v-btn>",
            "<p>Enjoying this? Rate us five stars.</p>",
            "Start your trial today",
            "Sponsor this project on GitHub",
        ];

        for (const line of invented) {
            expect(
                NAG_PATTERNS.some((nag) => nag.pattern.test(line)),
                line,
            ).toBe(true);
        }
    });

    it("leaves the legitimate neighbours of those words alone", () => {
        const innocent = [
            "Review this app's access on GitHub",
            "// Subscribes to sign-in progress. Returns the unsubscribe function.",
            "// A leaked subscription would keep writing after the bar is gone.",
        ];

        for (const line of innocent) {
            expect(
                NAG_PATTERNS.some((nag) => nag.pattern.test(line)),
                line,
            ).toBe(false);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* The layout guarantees jsdom cannot measure                                 */
/* -------------------------------------------------------------------------- */

/** The body of the first rule for `selector`, so an assertion means that rule and no other. */
function ruleBody(source: string, selector: string): string {
    const start = source.indexOf(`${selector} {`);
    expect(start, `${selector} has no rule`).toBeGreaterThan(-1);
    const rest = source.slice(start);
    return rest.slice(0, rest.indexOf("}"));
}

describe("the corner's layout, read from the stylesheet because jsdom computes none", () => {
    const corner = read("components/config/ConfigNotifications.vue");

    it("lets pointer events through everywhere except the toasts and the tools", () => {
        expect(ruleBody(corner, ".mb-config-notices")).toContain("pointer-events: none");
        expect(ruleBody(corner, ".mb-config-notices__stack")).toContain("pointer-events: auto");
        expect(ruleBody(corner, ".mb-config-notices__tools")).toContain("pointer-events: auto");
    });

    it("stacks with flow rather than by positioning boxes, which is how two would overlap", () => {
        const stack = ruleBody(corner, ".mb-config-notices__stack");
        expect(stack).toContain("flex-direction: column");
        expect(stack).toMatch(/gap:\s*\d/);
        expect(stack).not.toContain("position: absolute");
        expect(ruleBody(corner, ".mb-config-notices__toast")).not.toContain("position:");
    });

    it("paints its own surface, so the page underneath cannot read through it", () => {
        // A toast lands on top of content by definition. Vuetify's tonal variant is a
        // tinted film rather than a background, and over a paragraph it printed the page's
        // words and the notification's words on top of each other - caught in a screenshot
        // of the options editor, where both became unreadable.
        const toast = ruleBody(corner, ".mb-config-notices__toast");
        expect(toast).toContain("background-color:");
        // A tint, however pretty, is not a surface: the fill has to be opaque.
        expect(toast).not.toMatch(/background-color:[^;]*(transparent|rgba?\([^)]*0?\.\d)/);
        // And it has to read as something lying on the page rather than part of it.
        expect(toast).toContain("box-shadow:");
    });

    it("gives the dismiss control a 40px target rather than the 24px one it had", () => {
        const dismiss = ruleBody(corner, ".mb-config-notices__dismiss");
        expect(dismiss).toContain("min-height: 40px");
        expect(dismiss).toContain("min-width: 40px");
        expect(ruleBody(corner, ".mb-config-notices__dismiss-all")).toContain("min-height: 40px");
    });

    it("gives the bell and the centre's own icon controls the same floor", () => {
        expect(ruleBody(read("components/notifications/NotificationCentre.vue"), ".mb-notice-bell")).toContain(
            "min-height: 40px",
        );
        const panel = read("components/notifications/NoticeCentrePanel.vue");
        expect(ruleBody(panel, ".mb-notice-centre__icon-button")).toContain("min-height: 40px");
    });

    it("respects a reduced-motion preference in both surfaces", () => {
        expect(corner).toContain("prefers-reduced-motion: reduce");
        expect(read("components/notifications/NoticeCentrePanel.vue")).toContain(
            "prefers-reduced-motion: reduce",
        );
    });

    it("bounds the centre so a long history scrolls inside it rather than off the screen", () => {
        const panel = ruleBody(read("components/notifications/NoticeCentrePanel.vue"), ".mb-notice-centre");
        expect(panel).toMatch(/max-height:/);
        expect(panel).toContain("overflow-y: auto");
    });
});

/* -------------------------------------------------------------------------- */
/* House style in the copy this feature added                                 */
/* -------------------------------------------------------------------------- */

describe("the notification copy", () => {
    it("uses no em-dashes, in any of the files this feature owns", () => {
        for (const path of NOTIFICATION_FILES) {
            expect(read(path), path).not.toContain("—");
        }
    });
});

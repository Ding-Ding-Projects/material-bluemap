/**
 * The site's own copy of the two promises `packages/ui`'s `notificationPolicy.test.ts`
 * enforces, closing the same coverage gap `settings/destructiveActionPolicy.test.ts` closes
 * for destructive actions: a no-regression audit found both of the UI package's guards sweep
 * only `packages/ui/src`, so a blocking dialog could ship in `design/packages/site/src` in
 * place of a non-blocking toast and every existing guard would stay green.
 *
 * "Everything that only informs becomes a notification" is a claim about every future surface
 * as much as about the existing ones, so -- exactly like the UI package's version -- it is
 * enforced as an inventory: every application-modal surface in this package is declared below
 * with the decision it asks the user to make, and a new one fails this file until somebody
 * writes that sentence down.
 *
 * "No nagging. Not now, not later" is the same shape for the same reason: a scan for the copy,
 * over every shipped file in the package including the marketing and documentation content
 * this package renders that the UI package has no equivalent of.
 *
 * This file is deliberately not in the jsdom environment `Notifications.test.ts` uses: under
 * jsdom `import.meta.url` is not a `file:` URL, so `fileURLToPath` throws before a single
 * assertion runs.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** `packages/site/src`, one level above this file (`notifications/` sits directly inside it). */
const siteSource = fileURLToPath(new URL("..", import.meta.url));

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
    return relative(siteSource, path).replaceAll("\\", "/");
}

function read(path: string): string {
    return readFileSync(join(siteSource, path), "utf8");
}

/** The file this feature owns. There is one notifier in this package, not several. */
const NOTIFICATION_FILES = ["notifications/Notifications.ts"] as const;

/* -------------------------------------------------------------------------- */
/* Which surfaces are allowed to become application-modal                     */
/* -------------------------------------------------------------------------- */

interface BlockingSurface {
    /** How many application-modal markers the file is expected to contain. */
    readonly count: number;
    /** The decision the visitor must make before work can continue. */
    readonly decision: string;
}

/**
 * What "becomes application-modal" means in vanilla DOM, where there is no `<v-dialog>` tag
 * to watch the way the UI package's own sweep does.
 *
 * A native `<dialog>` opened with `.showModal()` blocks the page by definition, so both of
 * those are in the net. `role="dialog"` alone is not: this package's shared `Overlay` (see
 * `platform/Overlay.ts`) uses that role for every anchored popover it renders -- context
 * menus, the tab-group name prompt, search results -- and documents itself as "deliberately
 * not a modal. Nothing here traps focus or blocks the page, because nothing that only shows
 * information should." `Overlay` never sets `aria-modal` at all, so sweeping on the role alone
 * would flag every one of those popovers and train the next reader to ignore this file's
 * output. `aria-modal` set to `"true"` -- literally, or by a variable that can resolve to it on
 * the same line -- is the actual browser signal this net watches for.
 */
const BLOCKING_MARKER = /el\("dialog"|\.showModal\(|aria-modal[^\n]*true/g;

/**
 * Every surface in this package that can become application-modal, and why it is entitled to.
 *
 * Each entry has to name a decision the visitor must make before work can continue, the same
 * rule the UI package's inventory holds itself to: "telling them it worked" is not a decision,
 * and an entry that cannot fill this field honestly is a surface that should have been a
 * notification instead.
 */
const BLOCKING_SURFACES: Record<string, BlockingSurface> = {
    "search/anchoredPanel.ts": {
        count: 2,
        decision:
            "Finish editing the regex pattern, or the appearance target's typography/box/colours, " +
            "or cancel. Only at widths too narrow to keep the panel anchored beside its field does " +
            "it become a full-screen sheet instead of staying beside the control that opened it; at " +
            "every wider viewport this same element stays non-modal and tracks its anchor.",
    },
    "settings/confirm.ts": {
        count: 2,
        decision: "The destructive-action gate: two independent key challenges and a full-range slider before anything irreversible happens.",
    },
    "shell/commandPalette.ts": {
        count: 1,
        decision:
            "The command palette, which the visitor summons by shortcut and closes with Escape or a " +
            "click outside. It takes the keyboard on purpose because typing a command is the whole " +
            "point of it, the same reasoning the UI package's own CommandPalette.vue entry gives.",
    },
    "tabs/BulkCloseDialog.ts": {
        count: 2,
        decision:
            "Close every open tab matching (or not matching) the typed text, or cancel. The exact " +
            "tabs that would close are listed, with pinned tabs excluded by default, before anything " +
            "closes.",
    },
};

describe("an application-modal surface is for a decision, and only for a decision", () => {
    const files = sourceFiles(siteSource, [".ts"]).filter((file) => !file.endsWith(".test.ts"));

    const found = new Map<string, number>();
    for (const file of files) {
        BLOCKING_MARKER.lastIndex = 0;
        const count = readFileSync(file, "utf8").match(BLOCKING_MARKER)?.length ?? 0;
        if (count > 0) found.set(relativeToSource(file), count);
    }

    it("finds the surfaces it is supposed to be watching", () => {
        expect(files.length).toBeGreaterThan(80);
        expect(found.size).toBeGreaterThan(0);
    });

    it("has no application-modal surface that is not declared with the decision it asks for", () => {
        const undeclared = [...found]
            .filter(([file]) => BLOCKING_SURFACES[file] === undefined)
            .map(([file, count]) => `${file} carries ${count} application-modal marker(s)`);

        expect(
            undeclared,
            "A surface that blocks the whole page is reserved for a decision the visitor must " +
                "make before continuing. Anything that only informs (progress, success, an " +
                "import result, a storage failure) belongs in the notification corner through " +
                "Notifications.notify(). If this really is a decision, declare it in " +
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
            "Either an application-modal marker was added to a file that already had one, or " +
                "one was removed and the declaration is now stale. Both need the count updating, " +
                "and an addition needs its decision stated.",
        ).toEqual([]);
    });

    it("makes every declaration state an actual decision rather than an empty string", () => {
        for (const [file, surface] of Object.entries(BLOCKING_SURFACES)) {
            expect(surface.decision.length, `${file} declares no decision`).toBeGreaterThan(20);
        }
    });

    it("keeps the notification path itself free of every one of them", () => {
        for (const path of NOTIFICATION_FILES) {
            BLOCKING_MARKER.lastIndex = 0;
            const text = read(path);
            expect(text.match(BLOCKING_MARKER), `${path} carries an application-modal marker`).toBeNull();
            expect(text, `${path} claims a modal role`).not.toContain('role="dialog"');
            expect(text, `${path} marks itself modal`).not.toContain("aria-modal");
        }
    });
});

describe("the detector, on cases it has to get right", () => {
    it("catches a new native <dialog>, an explicit showModal, and a literal aria-modal true", () => {
        const invented = [
            'const dialog = el("dialog", { class: "confirm" });',
            "dialog.showModal();",
            'attrs: { role: "dialog", "aria-modal": "true" },',
            'this.element.setAttribute("aria-modal", condition ? "true" : "false");',
        ];

        for (const line of invented) {
            BLOCKING_MARKER.lastIndex = 0;
            expect(line.match(BLOCKING_MARKER), line).not.toBeNull();
        }
    });

    it("leaves a non-modal role dialog popover and an explicit aria-modal false alone", () => {
        const innocent = [
            'this.element.setAttribute("role", options.role ?? "dialog");',
            'this.element.setAttribute("aria-modal", "false");',
            "surface?.destroy();",
        ];

        for (const line of innocent) {
            BLOCKING_MARKER.lastIndex = 0;
            expect(line.match(BLOCKING_MARKER), line).toBeNull();
        }
    });
});

/* -------------------------------------------------------------------------- */
/* No nagging                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Copy this package will never contain, carried over verbatim from the UI package's own list
 * so the two guards enforce the identical policy rather than two policies that can drift.
 *
 * Deliberately phrases rather than words, for the same reason the UI package's version is:
 * "review" appears in this package's own documentation content in the ordinary sense of the
 * word, and a guard that fires on either word alone is a guard somebody switches off.
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

describe("this site never asks the visitor for anything it does not need", () => {
    /**
     * Tests are excluded, and this file is why: a guard that scans for the words it is made of
     * reports itself. Shipped copy lives in the non-test `.ts` files, which is what is scanned
     * -- including `content/articles/**`, the documentation this package renders that the UI
     * package has no equivalent of, so an article that describes payment or sponsorship in the
     * ordinary course of documenting the project (rather than asking for either) still has to
     * phrase itself around these patterns the same as shipped UI copy does.
     */
    const files = sourceFiles(siteSource, [".ts"]).filter((file) => !file.endsWith(".test.ts"));

    it("scans the whole package rather than one folder", () => {
        expect(files.length).toBeGreaterThan(80);
        expect(files.map(relativeToSource)).toContain("main.ts");
        expect(files.map(relativeToSource).some((file) => file.startsWith("content/articles/"))).toBe(true);
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
            "No unsolicited prompts for payment, donations, sponsorship, reviews, ratings, " +
                "upgrades or subscriptions. Not now, not later. A visitor-initiated flow may " +
                "explain itself in context, but nothing may interrupt to ask.",
        ).toEqual([]);
    });

    it("catches such copy when it is added, rather than passing because it looks for nothing", () => {
        const invented = [
            'const a = t("nag.donate", "Support us with a donation.");',
            "<button>Upgrade to Pro</button>",
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
            "// Subscribes to the theme controller. Returns the unsubscribe function.",
            "// A leaked subscription would keep writing after the toast is gone.",
        ];

        for (const line of innocent) {
            expect(
                NAG_PATTERNS.some((nag) => nag.pattern.test(line)),
                line,
            ).toBe(false);
        }
    });
});

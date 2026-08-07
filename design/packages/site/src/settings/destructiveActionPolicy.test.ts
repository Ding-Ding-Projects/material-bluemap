/**
 * The site's own copy of the promise `packages/ui`'s `superConfirmPolicy.test.ts` enforces:
 * every destructive action is behind the gate, including the next one nobody has written yet.
 *
 * A no-regression audit found that guard, and its neighbour `notificationPolicy.test.ts`,
 * sweep only `packages/ui/src`. `design/packages/site/src` is a separate package with its own
 * destructive actions -- deleting an appearance preset, forgetting every stored preference,
 * closing a batch of tabs -- and none of it was covered: a new destructive control could ship
 * here ungated and every existing guard would stay green, because none of them were ever
 * pointed at this source tree. This file closes that gap for the site the same way the UI
 * package's own file does: as an inventory. Every call site in this package that destroys or
 * forgets something is declared below with what it destroys and where it stands, and a new one
 * fails this file until somebody writes that sentence down.
 *
 * The declaration is deliberately awkward to fill in dishonestly, for the same reason the UI
 * package's version is: it is easy to wire a delete button to a store method, and much harder
 * to write, in a file a reviewer reads, that the thing being removed is unrecoverable and that
 * nothing stands in front of it. An entry may say a gate is not needed, but only in one of a
 * fixed set of words, each checkable. Inventing a sixth excuse means editing the union type,
 * which shows up in the diff.
 *
 * The site has one gate rather than the UI package's two: `settings/confirm.ts`'s
 * `confirmDestructive`, a modal two-key-and-slider dialog. There is no anchored variant here
 * because the site never has "nowhere to anchor" -- everything that can destroy something is
 * already inside a page with room for a dialog -- so a second presentation would be a
 * distinction with no surface that needs it.
 *
 * This file is deliberately not in the jsdom environment its neighbour uses: under jsdom
 * `import.meta.url` is not a `file:` URL, so `fileURLToPath` throws before a single assertion
 * runs. `settings/confirm.test.ts` already covers the gate's own behaviour under jsdom; this
 * file only ever reads source text.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** `packages/site/src`, one level above this file (`settings/` sits directly inside it). */
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

/** The one gate this package has. */
const GATE_FILE = "settings/confirm.ts";

/* -------------------------------------------------------------------------- */
/* Finding the destructive call sites                                         */
/* -------------------------------------------------------------------------- */

/**
 * What a destructive call site looks like, adapted from the UI package's own net.
 *
 * The first pattern is the same net for the same reason: `deleteSomething(`, `removeSomething(`,
 * `purgeSomething(` and their siblings are caught the day they are written without this file
 * having to know they exist, because a list of known primitives only ever protects against the
 * deletes somebody already thought about. The same five DOM/URL cleanup methods are cut out by
 * exact identifier -- `removeEventListener`, `removeProperty`, `removeChild`, `removeAttribute`,
 * `revokeObjectURL` -- because this package tidies up after itself with all five and a guard
 * that reports every teardown is a guard nobody reads.
 *
 * The rest are this package's own named primitives that do not follow the verb-prefix
 * convention and would otherwise slip past: forgetting every stored preference or every
 * customised element, and closing a batch of tabs in one call. They are matched narrowly for
 * the same reason the UI package's own narrow patterns are: a guard that fired on `reset()` in
 * general would fire on every form's Cancel-and-reset button in the package.
 */
const DESTRUCTIVE_CALLS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
    {
        label: "a delete/remove/purge-shaped call",
        pattern:
            /(?<![A-Za-z0-9_$])(?:delete|remove|destroy|purge|wipe|erase|revoke|discard)(?!(?:EventListener|Property|Child|Attribute|ObjectURL)\s*\()[A-Z][A-Za-z0-9_$]*\s*\(/g,
    },
    {
        label: "forgets every stored preference",
        pattern: /(?<![A-Za-z0-9_$])resetAll(?!Elements)\s*\(/g,
    },
    {
        label: "forgets every customised element's appearance",
        pattern: /(?<![A-Za-z0-9_$])resetAllElements\s*\(/g,
    },
    { label: "closes a batch of tabs at once", pattern: /(?<![A-Za-z0-9_$])applyBulkClose\s*\(/g },
    { label: "empties the notification history", pattern: /(?<![A-Za-z0-9_$])clearAll\s*\(/g },
    { label: "empties web storage outright", pattern: /(?:local|session)Storage\.clear\s*\(/g },
];

function destructiveHits(text: string): number {
    let count = 0;
    for (const call of DESTRUCTIVE_CALLS) {
        call.pattern.lastIndex = 0;
        count += text.match(call.pattern)?.length ?? 0;
    }
    return count;
}

/* -------------------------------------------------------------------------- */
/* The inventory                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Where a destructive call site stands with respect to the contract. The same closed set the
 * UI package's inventory uses, so the two files read as one convention rather than two.
 *
 *  - `gated`      `confirmDestructive` stands in front of it. `gatedIn` names the file holding
 *                 that call, which is not always the file making the destructive call itself:
 *                 a store's own method is often gated by the screen that calls it.
 *  - `reversible` The visitor can put the state straight back through the same control. A
 *                 forgotten preference is written again the moment its control is touched.
 *  - `unwired`    Model code with no user-facing caller yet. The gate is owed by whoever wires
 *                 it, and this declaration is what makes them notice.
 *  - `gap`        Shipped, reachable, and not behind the gate. A defect, named as one.
 */
type Standing = "gated" | "reversible" | "unwired" | "gap";

interface DestructiveFile {
    /** How many destructive call sites the file is expected to contain. */
    readonly count: number;
    /** What is destroyed, in the words a visitor would recognise. */
    readonly destroys: string;
    readonly standing: Standing;
    /** Required when `standing` is `gated`: the file holding the `confirmDestructive` call. */
    readonly gatedIn?: string;
    /** Required for every other standing: why that word is the true one here. */
    readonly note?: string;
}

/**
 * Every destructive call site in this package, and where it stands.
 *
 * Ordered by path so the diff of adding one reads as an addition rather than a reshuffle.
 */
const DESTRUCTIVE_FILES: Record<string, DestructiveFile> = {
    "appearance/presetsPanel.ts": {
        count: 3,
        destroys:
            "a user-saved appearance preset, every customised element's appearance at once, or a " +
            "bulk-selected subset of saved presets, and with any of the three the settings every " +
            "element following it was inheriting",
        standing: "gated",
        gatedIn: "appearance/presetsPanel.ts",
        note:
            "All three calls -- the reset-all button, a preset's own delete icon, and the new " +
            "delete-selected button over the bulk-selection checkboxes -- run inside this file's " +
            "own `void (async () => { const confirmed = await options.confirmDestructive(...` " +
            "block and only mutate the store once that promise resolves true.",
    },
    "appearance/store.ts": {
        count: 3,
        destroys:
            "a saved appearance preset, every customised element's appearance at once, or a bulk-" +
            "selected subset of saved presets, through the store every appearance surface shares",
        standing: "gated",
        gatedIn: "appearance/presetsPanel.ts",
        note:
            "The store's own methods, not calls to the gate: `deletePreset`, `resetAllElements` " +
            "and the new `deletePresets` all run the moment they are called, so the gate has to " +
            "stand at every caller instead. `deletePreset` and `deletePresets` each have their one " +
            "caller in presetsPanel.ts, gated. `resetAllElements` has two callers -- presetsPanel." +
            "ts's own reset-all button, and settings/page.ts's global reset -- and both are gated " +
            "independently; presetsPanel.ts is named here because it is this file's more direct " +
            "neighbour, and settings/page.ts's copy of the same call is declared in its own right " +
            "below.",
    },
    "main.ts": {
        count: 2,
        destroys:
            "every notification this session raised, from the notifications tab's clear button, or " +
            "only the bulk-selected subset of them from the same tab's delete-selected button",
        standing: "gated",
        gatedIn: "main.ts",
        note:
            "Both calls -- the whole-history clear button and the new bulk-selection delete-selected " +
            "button -- run inside this file's own `await confirmDestructive(...)` block and only " +
            "mutate the notification store once that promise resolves true.",
    },
    "notifications/Notifications.ts": {
        count: 2,
        destroys:
            "every notification this session raised, or only a chosen subset of them, through the " +
            "store every notifier shares",
        standing: "gated",
        gatedIn: "main.ts",
        note:
            "Two of the store's own methods, not calls to the gate: `clearAll` empties the live " +
            "toasts and the whole history the moment it runs, and `removeMany` forgets only the " +
            "history records named by id, leaving any of their toasts still on screen to dismiss " +
            "themselves. Both have their one caller in main.ts's notifications tab, gated.",
    },
    "platform/Preferences.ts": {
        count: 4,
        destroys: "one stored preference, or every preference this site owns",
        standing: "reversible",
        note:
            "Four calls with three different weights. The one inside `openStorage()` writes a " +
            "throw-away probe key and immediately removes it before anything real is ever stored " +
            "under it, to test whether storage works at all -- it destroys nothing. `remove(key)` " +
            "forgets one preference and is exercised constantly (theme, density, language mode, " +
            "both funny levels, every settings-store key with no bridge): the owning control writes " +
            "the value again the moment it is touched, so nothing is lost for longer than the next " +
            "interaction. `resetAll()` forgets every preference this site owns in one call and is " +
            "the fourth site -- it is presently unwired (nothing in this package calls " +
            "`Preferences.prototype.resetAll`; `settings/store.ts`'s own `resetAll` is a different " +
            "method on a different class, and is declared in its own right below). Recorded here " +
            "anyway so wiring it up is the moment this note gets read rather than the moment a gate " +
            "goes missing.",
    },
    "search/preferences.ts": {
        count: 1,
        destroys: "the regex builder's own remembered flags and history for this search field",
        standing: "reversible",
        note:
            "Forgets one stored preference, the same shape as `platform/Preferences.ts`'s own " +
            "`remove`. The next pattern typed writes it again.",
    },
    "settings/page.ts": {
        count: 2,
        destroys:
            "every settings-store value with a bridge, and every customised element's appearance, " +
            "in the same global reset",
        standing: "gated",
        gatedIn: "settings/page.ts",
        note:
            "Both calls -- `store.resetAll()` and `options.appearance.store.resetAllElements()` -- " +
            "run one after the other inside `buildGlobalReset()`'s click handler, behind the same " +
            "`await confirmDestructive(...)`, so one confirmation covers both.",
    },
    "settings/schedulePanel.ts": {
        count: 2,
        destroys:
            "one saved scheduled-settings rule and its future automatic changes to language or appearance",
        standing: "gated",
        gatedIn: "settings/page.ts",
        note:
            "The detector sees both the delete button's `deleteRule(current)` call and the private " +
            "`deleteRule` function that performs the repository save. That function awaits the " +
            "injected `confirmDelete` callback before removing the rule; settings/page.ts injects " +
            "the site's one `confirmDestructive` gate as that callback.",
    },
    "settings/store.ts": {
        count: 1,
        destroys:
            "every settings-store value: everything bridged to another controller and every plain key",
        standing: "gated",
        gatedIn: "settings/page.ts",
        note: "The store's own method. Its one caller is settings/page.ts's global reset, gated.",
    },
    "tabs/BulkCloseDialog.ts": {
        count: 1,
        destroys:
            "every open tab matching (or not matching) the typed text, along with any unsaved work",
        standing: "gated",
        gatedIn: "tabs/BulkCloseDialog.ts",
        note:
            "Runs inside this file's own confirm-button handler, after the reviewable preview list " +
            "and only once `confirmDestructive` resolves true.",
    },
    "tabs/TabModel.ts": {
        count: 2,
        destroys:
            "a tab group, which is a label and an ordering rather than any content, or every open " +
            "tab a bulk-close plan matched",
        standing: "gated",
        gatedIn: "tabs/TabStrip.ts",
        note:
            "The model's own methods. `removeGroup`'s one caller is TabStrip.ts's own gated " +
            "`removeGroup` (its members become lone tabs in the slot the group held; nothing " +
            "closes). `applyBulkClose`'s one caller is tabs/BulkCloseDialog.ts, gated in its own " +
            "right below; TabStrip.ts is named here because it is this file's more direct neighbour " +
            "for the group removal, which is what the count's first hit is.",
    },
    "tabs/TabStrip.ts": {
        count: 3,
        destroys: "a tab group, which is a label and an ordering rather than any content",
        standing: "gated",
        gatedIn: "tabs/TabStrip.ts",
        note:
            "One context-menu wiring (`onSelect: () => this.removeGroup(groupId)`) and the private " +
            "`removeGroup` method it calls, which awaits `this.deps.confirmDestructive(...)` and " +
            "only then calls `this.deps.model.removeGroup(groupId)` -- the pattern's third hit in " +
            "this file. Closing a single tab, closing others, and closing to the right all also run " +
            "behind this same gate in this file, but none of their names matches the delete-shaped " +
            "net: they call the model's plain `close(id)`, which this guard does not watch, the same " +
            "restraint the UI package's own net uses so it does not fire on every Cancel button.",
    },
};

/**
 * The defects, listed once in the open.
 *
 * Held apart from the inventory so that adding a `gap` entry is not a quiet edit to a long
 * object but a change to a short list a reviewer reads in full.
 */
const KNOWN_GAPS: readonly string[] = [];

/* -------------------------------------------------------------------------- */

describe("every destructive action in the site package is declared with where it stands", () => {
    const files = sourceFiles(siteSource, [".ts"]).filter((file) => !file.endsWith(".test.ts"));

    const found = new Map<string, number>();
    for (const file of files) {
        const count = destructiveHits(readFileSync(file, "utf8"));
        if (count > 0) found.set(relativeToSource(file), count);
    }

    it("finds the call sites it is supposed to be watching", () => {
        expect(files.length).toBeGreaterThan(80);
        expect(found.size).toBeGreaterThan(5);
    });

    it("has no destructive call site that is not declared", () => {
        const undeclared = [...found]
            .filter(([file]) => DESTRUCTIVE_FILES[file] === undefined)
            .map(([file, count]) => `${file} makes ${count} destructive call(s)`);

        expect(
            undeclared,
            "A destructive action in the site package is only allowed behind " +
                "confirmDestructive (settings/confirm.ts). Wire it up, then declare it in " +
                "DESTRUCTIVE_FILES as `gated` with the file holding that call. If it genuinely " +
                "destroys nothing the visitor cannot get back through the same control, " +
                "`reversible` may apply, and the note has to say why that word is the true one.",
        ).toEqual([]);
    });

    it("counts the same number in each declared file, so a new delete cannot hide beside an old one", () => {
        const drifted = Object.entries(DESTRUCTIVE_FILES)
            .map(([file, entry]) => ({ file, want: entry.count, have: found.get(file) ?? 0 }))
            .filter((entry) => entry.want !== entry.have)
            .map((entry) => `${entry.file}: declared ${entry.want}, found ${entry.have}`);

        expect(
            drifted,
            "Either a destructive call was added to a file that already had one, or one was " +
                "removed and the declaration is now stale. Both need the count updating, and " +
                "an addition needs its standing stated.",
        ).toEqual([]);
    });

    it("makes every declaration name what it destroys rather than an empty string", () => {
        for (const [file, entry] of Object.entries(DESTRUCTIVE_FILES)) {
            expect(entry.destroys.length, `${file} declares nothing destroyed`).toBeGreaterThan(15);
        }
    });

    it("points every gated entry at a file that really does call confirmDestructive", () => {
        const wrong: string[] = [];

        for (const [file, entry] of Object.entries(DESTRUCTIVE_FILES)) {
            if (entry.standing !== "gated") continue;
            const host = entry.gatedIn;
            if (host === undefined) {
                wrong.push(`${file} is declared gated and names no gate file`);
                continue;
            }
            const text = read(host);
            if (!text.includes("confirmDestructive")) {
                wrong.push(
                    `${file} claims a gate in ${host}, which never mentions confirmDestructive`,
                );
            }
        }

        expect(wrong).toEqual([]);
    });

    it("makes every ungated entry say why, at length, rather than leaving the field off", () => {
        const silent = Object.entries(DESTRUCTIVE_FILES)
            .filter(([, entry]) => entry.standing !== "gated")
            .filter(([, entry]) => (entry.note ?? "").length < 60)
            .map(([file]) => file);

        expect(
            silent,
            "An entry that is not behind the gate has to justify the word it chose. The " +
                "standings are a closed set precisely so that the justification is checkable.",
        ).toEqual([]);
    });

    it("keeps the list of known gaps exactly as long as the gaps themselves", () => {
        const declared = Object.entries(DESTRUCTIVE_FILES)
            .filter(([, entry]) => entry.standing === "gap")
            .map(([file]) => file)
            .sort();

        expect(
            declared,
            "A new `gap` means something destructive shipped without its gate. Add it to " +
                "KNOWN_GAPS deliberately, or gate it. A gap that was fixed comes off both.",
        ).toEqual([...KNOWN_GAPS].sort());
    });
});

describe("the detector, on cases it has to get right", () => {
    it("catches a new delete, whatever it is called and wherever it is written", () => {
        const invented = [
            "const a = deletePreset(id);",
            'button.addEventListener("click", () => removeDownload(row.id));',
            "await host.purgeTiles(mapId);",
            "prefs.resetAll();",
            "store.resetAllElements();",
            "const result = model.applyBulkClose(preview);",
            "notifications.clearAll();",
        ];

        for (const line of invented) expect(destructiveHits(line), line).toBeGreaterThan(0);
    });

    it("leaves the innocent neighbours of those words alone", () => {
        const innocent = [
            "const can = canRemoveEntry(workspace, key);",
            "function reset(): void { input.value = ''; }",
            "const removed = list.filter((row) => row.id !== id);",
            "model.close(id);",
            "surface?.destroy();",
            "window.removeEventListener('touchend', onTouchStop);",
            "document.documentElement.style.removeProperty('--mb-titlebar-height');",
            "URL.revokeObjectURL(url);",
        ];

        for (const line of innocent) expect(destructiveHits(line), line).toBe(0);
    });
});

/* -------------------------------------------------------------------------- */
/* One gate, not a second one forked in quietly                               */
/* -------------------------------------------------------------------------- */

describe("there is exactly one destructive-action gate in this package", () => {
    it("finds confirmDestructive's only definition where the inventory above expects it", () => {
        const files = sourceFiles(siteSource, [".ts"])
            .map(relativeToSource)
            .filter(
                (file) =>
                    !file.endsWith(".test.ts") &&
                    read(file).includes("export function confirmDestructive"),
            );

        expect(
            files,
            "A second `confirmDestructive` definition is a second gate. Reuse or extend " +
                "settings/confirm.ts's gate rather than writing a new one; the contract is one " +
                "state machine, and a second implementation of the rule is not that.",
        ).toEqual([GATE_FILE]);
    });

    it("finds no second native <dialog> element playing the same role", () => {
        // settings/confirm.ts is the two-key-and-slider gate itself. tabs/BulkCloseDialog.ts
        // is a real second <dialog>, but it is the reviewable bulk-close preview, not a second
        // gate: its own confirm button calls into this same confirmDestructive before it acts,
        // which the destructive-call inventory above already checks. Naming both here means a
        // third native dialog is what this test would actually catch.
        const files = sourceFiles(siteSource, [".ts"])
            .map(relativeToSource)
            .filter((file) => !file.endsWith(".test.ts") && read(file).includes('el("dialog"'));

        expect(files.sort()).toEqual([GATE_FILE, "tabs/BulkCloseDialog.ts"].sort());
    });
});

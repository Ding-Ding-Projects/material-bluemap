/**
 * The guard that stops the catalogue quietly emptying itself out again.
 *
 * `i18nFallback.test.ts` next door asks whether a fallback string is *shaped* correctly. It
 * never asks whether the key has a catalogue entry at all, and that is the gap this file
 * closes. The two failures are unrelated and only one of them is visible:
 *
 *   - a malformed fallback renders a value as nothing, and somebody eventually notices a
 *     sentence with a hole in it;
 *   - a *missing* catalogue entry renders the English fallback, perfectly, in English, to
 *     somebody who chose 廣東話. Nothing is malformed. Nothing is empty. Both funny sliders
 *     move and this string does not. It reads as a half-finished translation, and no test
 *     had ever asked the question.
 *
 * That is how the catalogue came to answer thirty-five keys out of fifteen hundred while
 * every test in the package passed. A screen added tomorrow with no voiced copy would have
 * done exactly the same thing, silently, forever.
 *
 * ## What this file asserts, and why it is a list rather than a number
 *
 * A percentage would be the obvious assertion and it is the wrong one, because a percentage
 * that drifts down by half a point per screen never fails and never gets fixed. So the
 * assertion is a **named list of surfaces that are finished**, and for each of them the rule
 * is absolute: every key that surface renders has a catalogue entry. Add a key to a finished
 * surface without voicing it and this test names the key, the surface and the file.
 *
 * `COVERED_SURFACES` is expected to grow, one entry per screen, until it is every surface in
 * the package. It is deliberately not the whole package today: this catalogue is being
 * filled a screen at a time, and a test that failed on all of it at once would be switched
 * off within the week. What it must never do is shrink, and it must never be allowed to
 * become vacuous -- `the covered list is real` below fails if a named surface has no keys or
 * no prose, which is what would happen if somebody "fixed" a failure by renaming a folder.
 *
 * ## The other half: keys this catalogue must NOT answer
 *
 * About eighty keys that look exactly like ours belong to upstream BlueMap's viewer, and the
 * thirty `public/lang/*.conf` files translate them into thirty languages. `mergeVoiceInto`
 * merges our catalogue *on top of* the loaded locale, so an entry here for `maps.title`
 * replaces a real German string with an English one. Voicing them would look like progress
 * on this test's own numbers while making the app worse in twenty-nine languages, so the
 * rule is enforced rather than remembered.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { parseHocon } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";

import { APP_VOICED, appCopyKeys } from "./appCopy.js";

/* -------------------------------------------------------------------------- */
/* The surfaces that are finished                                             */
/* -------------------------------------------------------------------------- */

/**
 * Paths under `src/`, relative and with forward slashes. A surface is finished when every
 * `t()` key rendered from anywhere inside it resolves in the catalogue.
 *
 * THIS LIST IS EXPECTED TO GROW. Adding a screen's copy to `copy/surfaces/` and its path
 * here is one change, and the second half is the half that keeps it true. Removing an entry
 * is not a way to fix a failure: it is a statement that the screen went back to speaking
 * English at people who did not choose English.
 */
const COVERED_SURFACES = [
    "App.vue",
    "components/controls",
    "components/eula",
    "components/notifications",
    "components/progress",
    "components/shell",
] as const;

/**
 * Covered surfaces that legitimately render no prose at all, with the reason.
 *
 * The vacuity check below insists a covered surface have at least one voiced entry, because
 * a surface listed as done on the strength of four button captions makes this list longer
 * than the work behind it. These two are the honest exception rather than a way around the
 * rule: they are strips of icon buttons whose entire text content is the accessible name of
 * each button. There is no sentence on either of them for a funny level to style, and
 * inventing one to satisfy a test would put prose on a toolbar.
 *
 * An entry here is a claim that has to stay true. If one of these surfaces grows a sentence,
 * it needs voiced copy and it comes off this list.
 */
const LABEL_ONLY_SURFACES = new Set<string>([
    // The custom title bar's minimise, restore, maximise and close buttons.
    "components/shell",
    // Zoom in/out and the free-flight movement buttons.
    "components/controls",
]);

/* -------------------------------------------------------------------------- */
/* Finding the keys a surface renders                                         */
/* -------------------------------------------------------------------------- */

/** `packages/ui/src`, one level above this file. */
const sourceRoot = fileURLToPath(new URL("..", import.meta.url));

/** `packages/ui`, two levels above. */
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
        else if (name.endsWith(".ts") || name.endsWith(".vue")) found.push(path);
    }
    return found;
}

/**
 * A call to vue-i18n's `t` or the template's `$t` with a literal key.
 *
 * The lookbehind drops `i18n.t(`, which is `components/setup/`'s own hand-rolled string
 * store with an identical call shape and no vue-i18n underneath it, and drops the
 * `markers/` `tx`/`tp` wrappers, which gate on `te(key)` and never reach this catalogue.
 * A key built by template substitution is not literal and is invisible here, which is a
 * known and accepted blind spot rather than an oversight: there is nothing to look up.
 */
const CALL_TO_T = /(?<![\w$.])\$?t\s*\(\s*(["'])([A-Za-z0-9_.\-]+)\1\s*[,)]/g;

interface Site {
    /** Path under `src/`, forward slashes. */
    file: string;
    key: string;
}

function callSites(): Site[] {
    const sites: Site[] = [];
    for (const path of sourceFiles(sourceRoot)) {
        const file = relative(sourceRoot, path).replaceAll("\\", "/");
        // Test files may call a key with a fabricated fallback to prove a point about
        // resolution, which is not a statement about what the product renders. `copy/`
        // itself is skipped because its own doc comments quote call sites as examples.
        if (file.endsWith(".test.ts") || file.startsWith("copy/")) continue;

        const text = readFileSync(path, "utf8");
        CALL_TO_T.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = CALL_TO_T.exec(text)) !== null) {
            sites.push({ file, key: match[2] as string });
        }
    }
    return sites;
}

function inSurface(file: string, surface: string): boolean {
    return file === surface || file.startsWith(`${surface}/`);
}

/* -------------------------------------------------------------------------- */
/* The keys upstream owns                                                     */
/* -------------------------------------------------------------------------- */

/** Every dotted key any bundled viewer locale defines, via the app's own HOCON parser. */
function upstreamViewerKeys(): Set<string> {
    const dir = join(packageRoot, "public", "lang");
    const keys = new Set<string>();

    const walk = (node: unknown, path: string): void => {
        if (typeof node !== "object" || node === null || Array.isArray(node)) {
            if (path !== "") keys.add(path);
            return;
        }
        for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
            walk(value, path === "" ? name : `${path}.${name}`);
        }
    };

    for (const name of readdirSync(dir)) {
        if (!name.endsWith(".conf") || name === "settings.conf") continue;
        walk(parseHocon(readFileSync(join(dir, name), "utf8")), "");
    }
    return keys;
}

/* -------------------------------------------------------------------------- */
/* The assertions                                                             */
/* -------------------------------------------------------------------------- */

describe("the catalogue covers the surfaces it claims to cover", () => {
    const sites = callSites();
    const catalogue = new Set<string>(appCopyKeys());
    const upstream = upstreamViewerKeys();

    it("finds the call sites at all, so a broken scan cannot pass as full coverage", () => {
        // A regex that silently stopped matching would make every surface below look
        // perfectly covered. The package had roughly two thousand sites when this was
        // written; anything near zero means the scanner broke, not that the work is done.
        expect(sites.length).toBeGreaterThan(1000);
    });

    it("does not exempt a surface it never covered in the first place", () => {
        // A stale entry here would silently waive the prose requirement for a surface that
        // is not even claimed, which is the quiet way this whole check stops meaning
        // anything.
        const orphaned = [...LABEL_ONLY_SURFACES].filter(
            (surface) => !(COVERED_SURFACES as readonly string[]).includes(surface),
        );
        expect(orphaned).toEqual([]);
    });

    it("the covered list is real: every named surface exists and renders prose", () => {
        const empty: string[] = [];
        for (const surface of COVERED_SURFACES) {
            const keys = sites.filter((site) => inSurface(site.file, surface));
            // Prose, not just labels. A surface listed as covered because it renders four
            // button captions and nothing else would make the list look longer than the
            // work behind it.
            const voiced = keys.filter(
                (site) => site.key in (APP_VOICED as Record<string, unknown>),
            );
            const needsProse = !LABEL_ONLY_SURFACES.has(surface);
            if (keys.length === 0 || (needsProse && voiced.length === 0)) {
                empty.push(`${surface}: ${keys.length} keys, ${voiced.length} voiced`);
            }
        }
        expect(
            empty,
            "a surface on the covered list with no keys, or with no voiced prose, is a " +
                "surface whose folder was renamed or whose copy was never really written. " +
                "Either way this test stopped guarding it without ever going red. A surface " +
                "that genuinely renders only button labels belongs in LABEL_ONLY_SURFACES, " +
                "with the reason written down.",
        ).toEqual([]);
    });

    it("has a catalogue entry for every key a covered surface renders", () => {
        const missing: string[] = [];
        for (const surface of COVERED_SURFACES) {
            const gaps = new Map<string, Set<string>>();
            for (const site of sites) {
                if (!inSurface(site.file, surface)) continue;
                if (catalogue.has(site.key) || upstream.has(site.key)) continue;
                const files = gaps.get(site.key) ?? new Set<string>();
                files.add(site.file);
                gaps.set(site.key, files);
            }
            for (const [key, files] of [...gaps].sort()) {
                missing.push(`${surface}: ${key}  (${[...files].sort().join(", ")})`);
            }
        }
        expect(
            missing,
            "these keys render their English fallback in every language and at every funny " +
                "level, because the catalogue has nothing on the other side of the call. Add " +
                "them to the surface's module under copy/surfaces/, or -- if the surface is " +
                "genuinely not finished yet -- take it off COVERED_SURFACES and say so.",
        ).toEqual([]);
    });

    it("never answers a key upstream BlueMap's viewer already translates", () => {
        const stolen = appCopyKeys().filter((key) => upstream.has(key));
        expect(
            stolen,
            "the catalogue merges on top of the loaded locale, so an entry for one of these " +
                "replaces upstream's real translation with ours in all thirty languages. A " +
                "German reader would get English in the name of localization. If the app " +
                "needs different wording, use a key of its own.",
        ).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Where the rest of the package stands                                       */
/* -------------------------------------------------------------------------- */

describe("the surfaces that are not covered yet", () => {
    const sites = callSites();
    const catalogue = new Set<string>(appCopyKeys());
    const upstream = upstreamViewerKeys();

    /**
     * Not an assertion about the number, on purpose. A threshold on overall coverage is
     * satisfied by any screen at all and so pins nothing about the screens that matter;
     * `COVERED_SURFACES` above is where the real guarantee lives. This reports the shape of
     * the remaining work so that whoever picks it up can see it without writing a script,
     * and it fails only if the catalogue is somehow answering keys nobody calls.
     */
    it("reports what is left, and proves every catalogue key is still reachable", () => {
        const ours = new Set(sites.map((site) => site.key).filter((key) => !upstream.has(key)));
        const covered = [...ours].filter((key) => catalogue.has(key));

        const byArea = new Map<string, { total: number; done: number }>();
        for (const key of ours) {
            const file = sites.find((site) => site.key === key)?.file ?? "";
            const area = file.startsWith("components/")
                ? file.split("/").slice(0, 2).join("/")
                : file;
            const row = byArea.get(area) ?? { total: 0, done: 0 };
            row.total++;
            if (catalogue.has(key)) row.done++;
            byArea.set(area, row);
        }

        const report = [...byArea]
            .filter(([, row]) => row.done < row.total)
            .sort((a, b) => b[1].total - b[1].done - (a[1].total - a[1].done))
            .map(([area, row]) => `  ${area}: ${row.done}/${row.total}`)
            .join("\n");

        console.info(
            `catalogue coverage: ${covered.length}/${ours.size} keys ` +
                `(${((covered.length / ours.size) * 100).toFixed(1)}%)\n` +
                `surfaces with work remaining:\n${report}`,
        );

        expect(covered.length).toBeGreaterThan(0);
    });
});

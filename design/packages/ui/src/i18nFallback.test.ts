/**
 * The guard against handing vue-i18n a placeholder it will eat.
 *
 * `i18n.ts` creates vue-i18n with no messages and `silentFallbackWarn`, so nearly every
 * call in this package carries an English fallback. vue-i18n compiles that fallback as a
 * *message format*, exactly as it compiles a loaded locale string, which means it consumes
 * a `{placeholder}` and renders the empty interpolation. A `.replace(...)` chained onto the
 * result then finds nothing left to replace and the value vanishes — silently, with the
 * sentence still reading like a sentence. Ninety-two call sites shipped that way and every
 * test passed, because no test had ever asserted the rendered text of a fallback message.
 *
 * So this file does two things. It asserts that rendered text against the real vue-i18n,
 * pinning the behaviour that makes the idiom wrong rather than asking anyone to take it on
 * trust, and it scans every package that depends on vue-i18n for the idiom, so a new one
 * cannot land quietly.
 *
 * The correct call passes the values as vue-i18n's own named arguments and demotes the
 * English string to the third argument, where it is used only when the key is missing.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

/* -------------------------------------------------------------------------- */
/* What vue-i18n actually does with a fallback                                */
/* -------------------------------------------------------------------------- */

describe("a fallback message is compiled, not passed through", () => {
    /** The options `i18n.ts` ships, so this measures the app's own configuration. */
    const i18n = createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });

    it("eats the placeholder, so a chained replace has nothing left to find", () => {
        // Written through `i18n.global.t` rather than a destructured `t` because the scan
        // below flags exactly this shape, and a guard that exempts its own demonstration
        // would be reporting on a rule it does not itself run.
        const rendered = i18n.global
            .t("guard.absent", "The most recent render ran on: {engine}.")
            .replace("{engine}", "BlueMap 5.22");

        expect(rendered).toBe("The most recent render ran on: .");
        expect(rendered).not.toContain("BlueMap 5.22");
    });

    it("interpolates named arguments, with the English string as the third argument", () => {
        expect(
            i18n.global.t(
                "guard.absent",
                { engine: "BlueMap 5.22" },
                "The most recent render ran on: {engine}.",
            ),
        ).toBe("The most recent render ran on: BlueMap 5.22.");
    });

    it("leaves a fallback with no placeholder alone, which is why those calls are fine", () => {
        const { t } = i18n.global;
        expect(t("guard.absent", "Pick the world folder.")).toBe("Pick the world folder.");
    });

    it("still interpolates once a real translation exists, so this is not a fallback-only bug", () => {
        i18n.global.setLocaleMessage("de", { "guard.present": "Zuletzt gerendert mit {engine}." });
        i18n.global.locale.value = "de";

        expect(
            i18n.global.t("guard.present", "Rendered with {engine}.").replace("{engine}", "x"),
        ).toBe("Zuletzt gerendert mit .");
    });
});

/* -------------------------------------------------------------------------- */
/* Finding the idiom in source                                                */
/* -------------------------------------------------------------------------- */

/*
 * ESLint would be the better home for this and is not available: the flat config in
 * `design/eslint.config.js` has no Vue parser, so `eslint .` skips every `.vue` file
 * outright ("File ignored because no matching configuration was supplied"). Nine in ten of
 * the sites live in `.vue`, and roughly half of those sit in `<template>` rather than
 * `<script>`, so a lint rule would first need `vue-eslint-parser`, `eslint-plugin-vue` and
 * a template-body visitor — three new moving parts before it saw the majority of the bug.
 * A scan reads both regions of both file types with no new dependency, and runs under
 * `pnpm test`, which already gates CI.
 */

/**
 * The index of the closing quote of the string literal opening at `start`, or -1 when it
 * never closes. Template literals are followed through `${…}`, which may nest strings of
 * its own, so a `${'}'}` cannot end the literal early.
 */
function endOfString(text: string, start: number): number {
    const quote = text[start];
    for (let i = start + 1; i < text.length; i++) {
        const ch = text[i];
        if (ch === "\\") {
            i++;
            continue;
        }
        if (quote === "`" && ch === "$" && text[i + 1] === "{") {
            let depth = 1;
            i += 2;
            while (i < text.length && depth > 0) {
                const inner = text[i];
                if (inner === "\\") {
                    i += 2;
                } else if (inner === '"' || inner === "'" || inner === "`") {
                    const end = endOfString(text, i);
                    if (end === -1) return -1;
                    i = end + 1;
                } else {
                    if (inner === "{") depth++;
                    else if (inner === "}") depth--;
                    i++;
                }
            }
            i--;
            continue;
        }
        if (ch === quote) return i;
        // An ordinary literal cannot span a line, so a newline means the opening quote was
        // never a literal — apostrophes in `<template>` prose reach here constantly.
        if (quote !== "`" && ch === "\n") return -1;
    }
    return -1;
}

/** The index of the closing `/` of the regex literal opening at `start`, or -1. */
function endOfRegex(text: string, start: number): number {
    let inClass = false;
    for (let i = start + 1; i < text.length; i++) {
        const ch = text[i];
        if (ch === "\\") i++;
        else if (ch === "\n") return -1;
        else if (inClass) inClass = ch !== "]";
        else if (ch === "[") inClass = true;
        else if (ch === "/") return i;
    }
    return -1;
}

/**
 * The tokens a `/` may follow when it opens a regex literal rather than dividing.
 *
 * Nothing else distinguishes the two, and guessing wrong is expensive rather than merely
 * imprecise: `STRING_LITERAL` below is a regex full of quote characters, and read as
 * division its first `"` opens a string that runs on until the next one, shifting every
 * mask boundary after it. A package that ships a regex builder has plenty of these.
 */
const OPENS_A_REGEX =
    /[([{,;:=!&|?+\-*%~^<>]$|\b(?:return|typeof|case|delete|void|in|of|new|do|else|yield|await)$/;

/** Blanks out comments, string literals and regex literals between `from` and `to`. */
function maskCode(text: string, mask: Uint8Array, from: number, to: number): void {
    let previous = -1;
    for (let i = from; i < to; i++) {
        const ch = text[i];
        if (ch === undefined || ch === " " || ch === "\t" || ch === "\r" || ch === "\n") continue;

        if (ch === "/" && text[i + 1] === "/") {
            const newline = text.indexOf("\n", i);
            const end = newline === -1 ? to : newline;
            mask.fill(0, i, end);
            i = end;
            continue; // A comment is not a token, so it does not decide the next `/`.
        }
        if (ch === "/" && text[i + 1] === "*") {
            const close = text.indexOf("*/", i + 2);
            const end = close === -1 ? to : close + 2;
            mask.fill(0, i, end);
            i = end - 1;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
            const end = endOfString(text, i);
            if (end !== -1) {
                mask.fill(0, i, end + 1);
                i = end;
            }
        } else if (ch === "/") {
            const window = text.slice(Math.max(from, previous - 9), previous + 1);
            if (previous === -1 || OPENS_A_REGEX.test(window)) {
                const end = endOfRegex(text, i);
                if (end !== -1) {
                    mask.fill(0, i, end + 1);
                    i = end;
                }
            }
        }
        previous = i;
    }
}

/**
 * A byte per character: 1 where a `t(` would be live code, 0 inside a comment or a string.
 *
 * A `.ts` file is masked whole. A `.vue` file is masked only inside its `<script>` blocks,
 * because an attribute value such as `:label="t('config.list.remove', 'Remove {item}')"` is
 * a quoted HTML attribute whose contents are code — masking string literals across a
 * template would hide about half the call sites in this package.
 */
function scannable(text: string, isVue: boolean): Uint8Array {
    const mask = new Uint8Array(text.length).fill(1);

    for (let i = text.indexOf("<!--"); i !== -1; i = text.indexOf("<!--", i + 1)) {
        const close = text.indexOf("-->", i + 4);
        const end = close === -1 ? text.length : close + 3;
        mask.fill(0, i, end);
        i = end - 1;
    }

    if (!isVue) {
        maskCode(text, mask, 0, text.length);
        return mask;
    }

    const script = /<script\b[^>]*>/g;
    let open: RegExpExecArray | null;
    while ((open = script.exec(text)) !== null) {
        const from = open.index + open[0].length;
        const close = text.indexOf("</script>", from);
        maskCode(text, mask, from, close === -1 ? text.length : close);
    }
    return mask;
}

/**
 * The top-level arguments of the call whose `(` sits at `open`, as raw source text, or null
 * when it does not close cleanly. Splitting on nesting depth rather than on lines is what
 * makes a wrapped call one site: a chain formatted as
 * `t(\n  "key",\n  "…{item}…",\n).replace(\n  "{item}",\n  value,\n)` is a single call, and
 * a line-based search sees several unrelated fragments and undercounts.
 */
function callArguments(text: string, open: number): string[] | null {
    const args: string[] = [];
    let depth = 0;
    let start = open + 1;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' || ch === "'" || ch === "`") {
            const end = endOfString(text, i);
            if (end === -1) return null;
            i = end;
        } else if (ch === "/" && text[i + 1] === "/") {
            const newline = text.indexOf("\n", i);
            if (newline === -1) return null;
            i = newline;
        } else if (ch === "/" && text[i + 1] === "*") {
            const end = text.indexOf("*/", i + 2);
            if (end === -1) return null;
            i = end + 1;
        } else if (ch === "(" || ch === "[" || ch === "{") {
            depth++;
        } else if (ch === ")" || ch === "]" || ch === "}") {
            depth--;
            if (depth === 0) {
                args.push(text.slice(start, i));
                // Prettier wraps a long call and leaves a trailing comma, which would
                // otherwise read as an empty third argument and make the broken two-argument
                // form look like the correct three-argument one. Every multi-line site in
                // this package is formatted that way, so dropping it is not an edge case.
                if (args.length > 1 && (args.at(-1) ?? "").trim() === "") args.pop();
                return args;
            }
        } else if (ch === "," && depth === 1) {
            args.push(text.slice(start, i));
            start = i + 1;
        }
    }
    return null;
}

/**
 * A call to a bare `t`. The leading class excludes `i18n.t`, which is `components/setup/`'s
 * own hand-rolled string store with the same call shape and no vue-i18n underneath it, and
 * excludes `tx`/`tp`, the `components/markers/` wrappers that gate on `te(key)` so their
 * fallback never reaches vue-i18n's compiler at all.
 */
const CALL_TO_T = /(^|[^\w$.])t\s*\(/g;

/** One whole literal, so an argument that merely begins with a string is not mistaken for one. */
const STRING_LITERAL = /^(?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|`(?:[^`\\]|\\[\s\S])*`)$/;

/**
 * A vue-i18n named placeholder. `${…}` is excluded because a template literal substitutes
 * it before vue-i18n ever sees the string, so it is not a placeholder to vue-i18n.
 */
const PLACEHOLDER = /(?<!\$)\{\s*[A-Za-z_$][\w$]*\s*\}/g;

interface Site {
    file: string;
    line: number;
    key: string;
    fallback: string;
    placeholders: string[];
}

function findSites(file: string, text: string): Site[] {
    const mask = scannable(text, file.endsWith(".vue"));
    const sites: Site[] = [];

    CALL_TO_T.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CALL_TO_T.exec(text)) !== null) {
        const open = match.index + match[0].length - 1;
        if (mask[open - 1] === 0) continue;

        const args = callArguments(text, open);
        // Three arguments is the correct form, and one argument carries no fallback.
        if (args === null || args.length !== 2) continue;

        const fallback = (args[1] ?? "").trim();
        if (!STRING_LITERAL.test(fallback)) continue;
        const placeholders = fallback.match(PLACEHOLDER);
        if (placeholders === null) continue;

        sites.push({
            file,
            line: text.slice(0, match.index).split("\n").length,
            key: (args[0] ?? "").trim(),
            fallback,
            placeholders,
        });
    }
    return sites;
}

/** The rewrite, so a failure says what to type instead of only what to stop doing. */
function correction(site: Site): string {
    const names = site.placeholders.map((token) => token.slice(1, -1).trim());
    return `t(${site.key}, { ${names.join(", ")} }, ${site.fallback})`;
}

/* -------------------------------------------------------------------------- */
/* The detector, on cases it has to get right                                 */
/* -------------------------------------------------------------------------- */

describe("the scan itself", () => {
    const sitesIn = (source: string, file = "sample.vue"): string[] =>
        findSites(file, source).map((site) => correction(site));

    it("catches the idiom, wrapped across lines and in a template attribute alike", () => {
        expect(
            sitesIn(`
                <template>
                  <v-btn :aria-label="t('config.list.remove', 'Remove {item}').replace('{item}', x)" />
                </template>
                <script setup lang="ts">
                const a = t(
                    "world.run.finishedLine",
                    "Finished in {duration}. The tiles are in {root}.",
                )
                    .replace("{duration}", d)
                    .replace("{root}", r);
                </script>
            `),
        ).toEqual([
            "t('config.list.remove', { item }, 'Remove {item}')",
            't("world.run.finishedLine", { duration, root }, "Finished in {duration}. The tiles are in {root}.")',
        ]);
    });

    it("passes the correct three-argument form", () => {
        expect(
            sitesIn(`const a = t("k", { name }, "There is already a maps/{name}.conf.");`),
        ).toEqual([]);
    });

    it("passes a fallback with no placeholder, which most calls in this package are", () => {
        expect(
            sitesIn(`const a = t("k", "Give the file a name. It becomes the map id.");`),
        ).toEqual([]);
    });

    it("passes the wrappers that never reach vue-i18n's compiler", () => {
        expect(
            sitesIn(`
                const a = tx("markers.count", "{n} markers", { n });
                const b = tp("markers.marker", n, "marker | markers");
                const c = i18n.t("setup.welcome", { name });
                const d = i18n.t("setup.welcome", "Hello {name}");
            `),
        ).toEqual([]);
    });

    it("passes a template expression, whose ${…} is substituted before vue-i18n sees it", () => {
        expect(sitesIn("const a = t(`k.${id}`, `Rendered ${count} tiles`);")).toEqual([]);
    });

    it("ignores the idiom quoted inside a comment or a string in a .ts file", () => {
        expect(
            sitesIn(
                [
                    `// t("k", "Finished in {duration}.")`,
                    `/** t("k", "Finished in {duration}.") */`,
                    `const doc = 'call t("k", "Finished in {duration}.") like this';`,
                ].join("\n"),
                "sample.ts",
            ),
        ).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* The package                                                                */
/* -------------------------------------------------------------------------- */

/** `packages/`, two levels above this file. */
const packagesRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Every package that declares vue-i18n, rather than a hard-coded `packages/ui`, so a
 * package that picks the dependency up later is covered on the day it does.
 */
function packagesUsingVueI18n(): string[] {
    return readdirSync(packagesRoot).filter((name) => {
        const manifest = join(packagesRoot, name, "package.json");
        if (!statSync(join(packagesRoot, name)).isDirectory()) return false;
        try {
            const json: unknown = JSON.parse(readFileSync(manifest, "utf8"));
            return JSON.stringify(json).includes('"vue-i18n"');
        } catch {
            return false;
        }
    });
}

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

describe("no call site hands a placeholder to vue-i18n as a fallback", () => {
    const packages = packagesUsingVueI18n();

    it("finds the packages it is supposed to be watching", () => {
        expect(packages).toContain("ui");
    });

    it("has no two-argument t() whose fallback carries a {placeholder}", () => {
        const sites = packages.flatMap((name) =>
            sourceFiles(join(packagesRoot, name, "src")).flatMap((file) =>
                findSites(
                    relative(packagesRoot, file).replaceAll("\\", "/"),
                    readFileSync(file, "utf8"),
                ),
            ),
        );

        const report = sites.map(
            (site) =>
                `${site.file}:${site.line}\n` +
                `      is   t(${site.key}, ${site.fallback})\n` +
                `      want ${correction(site)}`,
        );

        expect(
            report,
            "vue-i18n compiles the fallback, so these placeholders are consumed before any " +
                "chained .replace() runs and the values render as nothing. Pass the values as " +
                "named arguments and move the English string to the third argument.",
        ).toEqual([]);
    });
});

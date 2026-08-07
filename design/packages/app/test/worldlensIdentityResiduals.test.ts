import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// This list is intentionally handwritten. A pattern that guesses which files carry current
// identity can stop matching after a rename and silently stop guarding the surface.
const CURRENT_WRITE_AND_DISPLAY_FILES = [
    ".github/workflows/ci.yml",
    ".github/workflows/render-private-world.yml",
    "scripts/count-lines.mjs",
    "scripts/build-changelog.mjs",
    "scripts/pick-dim-sum.mjs",
    "scripts/bootstrap.mjs",
    "scripts/sync-screenshots.mjs",
    "tools/describe-jars.mjs",
    "design/packages/app/src/main/index.ts",
    "design/packages/site/index.html",
    "design/packages/site/src/content/home.ts",
    "design/packages/site/src/content/links.ts",
    "design/packages/site/src/main.ts",
    "design/packages/site/scripts/compact-proof.mjs",
    "design/tools/regex-builder-reference/regex-builder.html",
    "design/tools/regex-builder-reference/regex-builder.js",
    "design/packages/app/test/captureTarget.ts",
    "design/packages/app/test/screenshots.spec.ts",
    "design/packages/ui/src/components/changelog/changelogData.test.ts",
    "docs/config-history.md",
    "docs/ci-repository-setup.md",
    "docs/eula-and-consent.md",
    "docs/remote-render.md",
    "docs/render-mask-drawing.md",
    "docs/bluemapgui-parity.md",
    "docs/repository-adoption.md",
    "docs/live-preview.md",
    "docs/world-git-repository.md",
    "docs/pages-hosting.md",
    "design/docs/contracts/README.md",
] as const;

// Legacy strings are allowed only where they are an explicit read-only compatibility input or
// a still-live hosting URL covered by the rename finalizer. Historical records are intentionally
// outside the current-write/current-display inventory and remain untouched.
interface LegacyAllowance {
    readonly pattern: RegExp;
    readonly expectedMatches: number;
    readonly reason: string;
    readonly phase?: "rename-time";
}

const LEGACY_ALLOWLIST: Readonly<Record<string, readonly LegacyAllowance[]>> = {
    "scripts/build-changelog.mjs": [
        {
            pattern: /https:\/\/github\.com\/Ding-Ding-Projects\/material-bluemap/g,
            expectedMatches: 1,
            reason: "current physical repository URL until the atomic rename finalizer runs",
            phase: "rename-time",
        },
    ],
    "design/packages/app/src/main/index.ts": [
        {
            pattern: /Material BlueMap/g,
            expectedMatches: 2,
            reason: "legacy product name shown in the migration consent and retained-profile error",
        },
        {
            pattern: /LEGACY_MATERIAL_BLUEMAP_IDENTITY/g,
            expectedMatches: 2,
            reason: "read-only profile migration identity used at its two exact call sites",
        },
        {
            pattern:
                /https:\/\/github\.com\/Ding-Ding-Projects\/material-bluemap\/issues/g,
            expectedMatches: 1,
            reason: "rename-time crash-report destination covered by the atomic finalizer",
            phase: "rename-time",
        },
    ],
    "design/packages/site/index.html": [
        {
            pattern: /https:\/\/github\.com\/Ding-Ding-Projects\/material-bluemap/g,
            expectedMatches: 1,
            reason: "rename-time noscript repository destination covered by the atomic finalizer",
            phase: "rename-time",
        },
    ],
    "design/packages/site/src/content/home.ts": [
        {
            pattern:
                /https:\/\/github\.com\/Ding-Ding-Projects\/material-bluemap\.git/g,
            expectedMatches: 1,
            reason: "rename-time clone destination covered by the atomic finalizer",
            phase: "rename-time",
        },
        {
            pattern: /cd material-bluemap/g,
            expectedMatches: 1,
            reason: "rename-time clone directory covered by the atomic finalizer",
            phase: "rename-time",
        },
    ],
    "design/packages/site/src/content/links.ts": [
        {
            pattern: /REPO_NAME = "material-bluemap"/g,
            expectedMatches: 1,
            reason: "rename-time repository-name source covered by the atomic finalizer",
            phase: "rename-time",
        },
        {
            pattern: /SITE_BASE_PATH = "\/material-bluemap\/"/g,
            expectedMatches: 1,
            reason: "rename-time Pages base source covered by the atomic finalizer",
            phase: "rename-time",
        },
    ],
    "design/packages/site/src/main.ts": [
        {
            pattern:
                /https:\/\/github\.com\/Ding-Ding-Projects\/material-bluemap\/issues/g,
            expectedMatches: 1,
            reason: "rename-time site issue destination covered by the atomic finalizer",
            phase: "rename-time",
        },
    ],
    "design/packages/site/scripts/compact-proof.mjs": [
        {
            pattern: /candidate\.url\.includes\("\/material-bluemap\/"\)/g,
            expectedMatches: 1,
            reason: "rename-time proof target covered by the atomic finalizer",
            phase: "rename-time",
        },
    ],
    "design/tools/regex-builder-reference/regex-builder.html": [
        {
            pattern: /https:\/\/github\.com\/Ding-Ding-Projects\/material-bluemap/g,
            expectedMatches: 4,
            reason: "rename-time repository links covered by the atomic finalizer",
            phase: "rename-time",
        },
    ],
    "design/tools/regex-builder-reference/regex-builder.js": [
        {
            pattern: /material-bluemap-regex-language/g,
            expectedMatches: 1,
            reason: "read-only local-storage migration key",
        },
    ],
    "design/packages/app/test/captureTarget.ts": [
        {
            pattern: /The former `MATERIAL_BLUEMAP_CAPTURE_\*` names remain read-only aliases\./g,
            expectedMatches: 1,
            reason: "documentation for the four explicit read-only aliases below",
        },
        {
            pattern:
                /migrationEnvironment\(\s*process\.env,\s*"WORLDLENS_CAPTURE_MODE",\s*"MATERIAL_BLUEMAP_CAPTURE_MODE",\s*\)/g,
            expectedMatches: 1,
            reason: "read-only mode alias at its exact current-first lookup site",
        },
        {
            pattern:
                /migrationEnvironment\(\s*process\.env,\s*"WORLDLENS_CAPTURE_REMOTE_URL",\s*"MATERIAL_BLUEMAP_CAPTURE_REMOTE_URL",\s*\)/g,
            expectedMatches: 1,
            reason: "read-only remote URL alias at its exact current-first lookup site",
        },
        {
            pattern:
                /migrationEnvironment\(\s*process\.env,\s*"WORLDLENS_CAPTURE_MAP",\s*"MATERIAL_BLUEMAP_CAPTURE_MAP",\s*\)/g,
            expectedMatches: 1,
            reason: "read-only map alias at its exact current-first lookup site",
        },
        {
            pattern:
                /migrationEnvironment\(\s*process\.env,\s*"WORLDLENS_CAPTURE_PROVENANCE",\s*"MATERIAL_BLUEMAP_CAPTURE_PROVENANCE",\s*\)/g,
            expectedMatches: 1,
            reason: "read-only provenance alias at its exact current-first lookup site",
        },
    ],
    "design/packages/app/test/screenshots.spec.ts": [
        {
            pattern:
                /migrationEnvironment\(\s*process\.env,\s*"WORLDLENS_CAPTURE_WORLD",\s*"MATERIAL_BLUEMAP_CAPTURE_WORLD",\s*\)/g,
            expectedMatches: 1,
            reason: "read-only world alias at its exact current-first lookup site",
        },
    ],
    "docs/repository-adoption.md": [
        {
            pattern: /\.material-bluemap-(?:world|ci)\.json/g,
            expectedMatches: 2,
            reason: "documented legacy filenames accepted for import",
        },
    ],
    "docs/world-git-repository.md": [
        {
            pattern: /\.material-bluemap-world\.json/g,
            expectedMatches: 1,
            reason: "documented legacy filename accepted for import",
        },
    ],
    "docs/pages-hosting.md": [
        {
            pattern: /\.material-bluemap-map\.json/g,
            expectedMatches: 1,
            reason: "documented legacy filename accepted for import",
        },
    ],
};

const OLD_IDENTITY = /material[-_ ]bluemap|materialbluemap|@material-bluemap|MATERIAL_BLUEMAP/gi;
const root = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

interface FinalizationReplacement {
    readonly file: string;
    readonly changes: readonly (readonly [from: string, to: string, expected: number])[];
}

interface FinalizerModule {
    readonly FINALIZATION_REPLACEMENTS: readonly FinalizationReplacement[];
    finalizeText(file: string, text: string): string;
    verifyFinalText(file: string, text: string): void;
}

type FinalizationState = "ready" | "finalized";

async function loadFinalizer(): Promise<FinalizerModule> {
    // @ts-expect-error This committed plain-JavaScript CLI intentionally has no declaration file.
    return import("../../../../scripts/finalize-worldlens-repository.mjs");
}

async function finalizationState(
    supplied = new Map<string, string>(),
): Promise<FinalizationState> {
    const finalizer = await loadFinalizer();
    const states: { file: string; state: FinalizationState }[] = [];
    for (const entry of finalizer.FINALIZATION_REPLACEMENTS) {
        const source =
            supplied.get(entry.file) ?? (await readFile(resolve(root, entry.file), "utf8"));
        try {
            finalizer.finalizeText(entry.file, source);
            states.push({ file: entry.file, state: "ready" });
            continue;
        } catch {
            // A finalized file has no former value, so readiness is expected to fail.
        }
        try {
            finalizer.verifyFinalText(entry.file, source);
            states.push({ file: entry.file, state: "finalized" });
        } catch (error) {
            throw new Error(
                `${entry.file} is neither exactly ready nor verified-final: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
    const distinct = new Set(states.map(({ state }) => state));
    if (distinct.size !== 1) {
        const summary = states.map(({ file, state }) => `${file}=${state}`).join(", ");
        throw new Error(`Worldlens repository finalization is mixed: ${summary}`);
    }
    return states[0]!.state;
}

function syntheticReadyText(entry: FinalizationReplacement): string {
    return entry.changes
        .flatMap(([from, _to, expected], changeIndex) =>
            Array.from(
                { length: expected },
                (_, occurrenceIndex) =>
                    `probe-${changeIndex}-${occurrenceIndex}-before\n${from}\nprobe-${changeIndex}-${occurrenceIndex}-after`,
            ),
        )
        .join("\n");
}

function unallowlistedFormerIdentity(file: string, source: string): string[] {
    let remainder = source;
    for (const { pattern } of LEGACY_ALLOWLIST[file] ?? []) {
        remainder = remainder.replace(pattern, "");
    }
    return remainder.match(OLD_IDENTITY) ?? [];
}

describe("the current Worldlens identity inventory", () => {
    for (const file of CURRENT_WRITE_AND_DISPLAY_FILES) {
        it(`${file} contains no unallowlisted former current identity`, async () => {
            const text = await readFile(resolve(root, file), "utf8");
            expect(unallowlistedFormerIdentity(file, text)).toEqual([]);
        });
    }

    it("keeps every compatibility exception attached to an inventoried file", () => {
        expect(
            Object.keys(LEGACY_ALLOWLIST).every((file) =>
                CURRENT_WRITE_AND_DISPLAY_FILES.includes(file as never),
            ),
        ).toBe(true);
    });

    it("keeps each compatibility allowance pinned to its documented exact site", async () => {
        const state = await finalizationState();
        for (const [file, allowances] of Object.entries(LEGACY_ALLOWLIST)) {
            const source = await readFile(resolve(root, file), "utf8");
            for (const allowance of allowances) {
                const expected =
                    allowance.phase === "rename-time" && state === "finalized"
                        ? 0
                        : allowance.expectedMatches;
                expect(source.match(allowance.pattern)?.length ?? 0, allowance.reason).toBe(expected);
            }
        }
    });

    it("rejects a new current write through a former capture variable", async () => {
        const file = "design/packages/app/test/captureTarget.ts";
        const source = await readFile(resolve(root, file), "utf8");
        const negativeProbe = `${source}\nprocess.env.MATERIAL_BLUEMAP_CAPTURE_MODE = "remote";\n`;
        expect(unallowlistedFormerIdentity(file, negativeProbe)).toEqual(["MATERIAL_BLUEMAP"]);
    });

    it("classifies the two former repository names in AGENTS.md as preserved instruction metadata", async () => {
        const source = await readFile(resolve(root, "AGENTS.md"), "utf8");
        // These label the mirror's repository-specific instruction provenance, not a current
        // product write or display. AGENTS.md stays untouched so the managed mirror is preserved.
        const preservedMetadata = [
            "It is specific to material-bluemap and it is where the porting discipline lives.",
            "They are how material-bluemap is built, and they win over",
        ] as const;
        for (const text of preservedMetadata) {
            expect(source.split(text).length - 1).toBe(1);
        }
        expect(source).toContain("## Repository-specific rules");
        expect(source.indexOf(preservedMetadata[0])).toBeLessThan(
            source.indexOf("## Repository-specific rules"),
        );
        expect(source.indexOf(preservedMetadata[1])).toBeGreaterThan(
            source.indexOf("## Repository-specific rules"),
        );
    });

    it("migrates the standalone builder language into the current key without deleting legacy state", async () => {
        const source = await readFile(
            resolve(root, "design/tools/regex-builder-reference/regex-builder.js"),
            "utf8",
        );
        expect(source).toContain('const LANGUAGE_STORAGE_KEY = "worldlens-regex-language";');
        expect(source).toContain(
            'const LEGACY_LANGUAGE_STORAGE_KEY = "material-bluemap-regex-language";',
        );
        expect(source.indexOf("getItem(LANGUAGE_STORAGE_KEY)")).toBeLessThan(
            source.indexOf("getItem(LEGACY_LANGUAGE_STORAGE_KEY)"),
        );
        expect(source).toContain("setItem(LANGUAGE_STORAGE_KEY, legacy)");
        expect(source).not.toContain("removeItem(LEGACY_LANGUAGE_STORAGE_KEY)");
    });

    it("uses the repository address for the current atomic state in generated changelog links", async () => {
        const state = await finalizationState();
        const generated = await readFile(
            resolve(root, "design/packages/ui/src/components/changelog/changelogData.generated.ts"),
            "utf8",
        );
        const repository =
            state === "ready"
                ? "https://github.com/Ding-Ding-Projects/material-bluemap"
                : "https://github.com/Ding-Ding-Projects/worldlens";
        expect(generated.split(`CHANGELOG_REPOSITORY_URL = "${repository}"`).length - 1).toBe(1);
    });
});

describe("the atomic repository-rename finalizer", () => {
    it("accepts only one complete pre-cutover or finalized repository state", async () => {
        const { FINALIZATION_REPLACEMENTS, finalizeText, verifyFinalText } = await loadFinalizer();
        expect(FINALIZATION_REPLACEMENTS.map((entry: { file: string }) => entry.file)).toEqual([
            "README.md",
            "CONTRIBUTING.md",
            "CODE_OF_CONDUCT.md",
            "SECURITY.md",
            "LICENSE",
            "design/LICENSE",
            "design/NOTICE",
            "design/tools/regex-builder-reference/regex-builder.html",
            "design/packages/app/src/main/index.ts",
            "design/packages/site/index.html",
            "design/packages/site/src/content/home.ts",
            "design/packages/site/src/content/links.ts",
            "design/packages/site/src/main.ts",
            "design/packages/site/scripts/compact-proof.mjs",
            "scripts/build-changelog.mjs",
            "CHANGELOG.md",
            "design/packages/ui/src/components/changelog/changelogData.generated.ts",
        ]);
        const state = await finalizationState();
        for (const entry of FINALIZATION_REPLACEMENTS as readonly { file: string }[]) {
            const current = await readFile(resolve(root, entry.file), "utf8");
            if (state === "ready") {
                const finalized = finalizeText(entry.file, current);
                expect(finalized).not.toBe(current);
                expect(() => verifyFinalText(entry.file, finalized)).not.toThrow();
            } else {
                expect(() => verifyFinalText(entry.file, current)).not.toThrow();
            }
        }
    });

    it("rejects a deliberately mixed pre-cutover and finalized inventory", async () => {
        const finalizer = await loadFinalizer();
        const sources = new Map(
            finalizer.FINALIZATION_REPLACEMENTS.map((entry) => [
                entry.file,
                syntheticReadyText(entry),
            ]),
        );
        const first = finalizer.FINALIZATION_REPLACEMENTS[0]!;
        sources.set(first.file, finalizer.finalizeText(first.file, sources.get(first.file)!));
        await expect(finalizationState(sources)).rejects.toThrow(
            "Worldlens repository finalization is mixed",
        );
    });

    it("accepts complete synthetic inventories on both sides of the cutover", async () => {
        const finalizer = await loadFinalizer();
        const ready = new Map(
            finalizer.FINALIZATION_REPLACEMENTS.map((entry) => [
                entry.file,
                syntheticReadyText(entry),
            ]),
        );
        await expect(finalizationState(ready)).resolves.toBe("ready");

        const finalized = new Map(
            finalizer.FINALIZATION_REPLACEMENTS.map((entry) => [
                entry.file,
                finalizer.finalizeText(entry.file, ready.get(entry.file)!),
            ]),
        );
        await expect(finalizationState(finalized)).resolves.toBe("finalized");
    });
});

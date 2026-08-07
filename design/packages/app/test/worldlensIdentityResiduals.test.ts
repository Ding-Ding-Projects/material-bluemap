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
}

const LEGACY_ALLOWLIST: Readonly<Record<string, readonly LegacyAllowance[]>> = {
    "design/tools/regex-builder-reference/regex-builder.html": [
        {
            pattern: /https:\/\/github\.com\/Ding-Ding-Projects\/material-bluemap/g,
            expectedMatches: 4,
            reason: "rename-time repository links covered by the atomic finalizer",
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
        for (const [file, allowances] of Object.entries(LEGACY_ALLOWLIST)) {
            const source = await readFile(resolve(root, file), "utf8");
            for (const allowance of allowances) {
                expect(source.match(allowance.pattern)?.length ?? 0, allowance.reason).toBe(
                    allowance.expectedMatches,
                );
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

    it("uses the current physical repository for newly generated changelog links", async () => {
        const generated = await readFile(
            resolve(root, "design/packages/ui/src/components/changelog/changelogData.generated.ts"),
            "utf8",
        );
        expect(generated).toContain(
            'CHANGELOG_REPOSITORY_URL = "https://github.com/Ding-Ding-Projects/material-bluemap"',
        );
    });
});

describe("the atomic repository-rename finalizer", () => {
    it("preflights every current live URL and legal name without changing a file", async () => {
        // @ts-expect-error This committed plain-JavaScript CLI intentionally has no declaration file.
        const { FINALIZATION_REPLACEMENTS, finalizeText, verifyFinalText } =
            await import("../../../../scripts/finalize-worldlens-repository.mjs");
        expect(FINALIZATION_REPLACEMENTS.map((entry: { file: string }) => entry.file)).toEqual([
            "README.md",
            "CONTRIBUTING.md",
            "CODE_OF_CONDUCT.md",
            "SECURITY.md",
            "LICENSE",
            "design/LICENSE",
            "design/NOTICE",
            "design/tools/regex-builder-reference/regex-builder.html",
        ]);
        for (const entry of FINALIZATION_REPLACEMENTS as readonly { file: string }[]) {
            const current = await readFile(resolve(root, entry.file), "utf8");
            const finalized = finalizeText(entry.file, current);
            expect(finalized).not.toBe(current);
            expect(() => verifyFinalText(entry.file, finalized)).not.toThrow();
        }
    });
});

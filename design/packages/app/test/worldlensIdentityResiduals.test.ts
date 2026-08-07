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
const LEGACY_ALLOWLIST: Readonly<Record<string, readonly RegExp[]>> = {
    "design/tools/regex-builder-reference/regex-builder.html": [
        /https:\/\/github\.com\/Ding-Ding-Projects\/material-bluemap/g,
    ],
    "design/tools/regex-builder-reference/regex-builder.js": [/material-bluemap-regex-language/g],
    "design/packages/app/test/captureTarget.ts": [/MATERIAL_BLUEMAP_CAPTURE_/g],
    "design/packages/app/test/screenshots.spec.ts": [/MATERIAL_BLUEMAP_CAPTURE_WORLD/g],
    "docs/repository-adoption.md": [/\.material-bluemap-(?:world|ci)\.json/g],
    "docs/world-git-repository.md": [/\.material-bluemap-world\.json/g],
    "docs/pages-hosting.md": [/\.material-bluemap-map\.json/g],
};

const OLD_IDENTITY = /material[-_ ]bluemap|materialbluemap|@material-bluemap|MATERIAL_BLUEMAP/gi;
const root = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

describe("the current Worldlens identity inventory", () => {
    for (const file of CURRENT_WRITE_AND_DISPLAY_FILES) {
        it(`${file} contains no unallowlisted former current identity`, async () => {
            let text = await readFile(resolve(root, file), "utf8");
            for (const allowed of LEGACY_ALLOWLIST[file] ?? []) text = text.replace(allowed, "");
            expect(text.match(OLD_IDENTITY) ?? []).toEqual([]);
        });
    }

    it("keeps every compatibility exception attached to an inventoried file", () => {
        expect(
            Object.keys(LEGACY_ALLOWLIST).every((file) =>
                CURRENT_WRITE_AND_DISPLAY_FILES.includes(file as never),
            ),
        ).toBe(true);
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

    it("uses the final Worldlens repository for newly generated changelog links", async () => {
        const generated = await readFile(
            resolve(root, "design/packages/ui/src/components/changelog/changelogData.generated.ts"),
            "utf8",
        );
        expect(generated).toContain(
            'CHANGELOG_REPOSITORY_URL = "https://github.com/Ding-Ding-Projects/worldlens"',
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

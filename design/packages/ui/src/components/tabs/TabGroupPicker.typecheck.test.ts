/**
 * Regression test for a `vue-tsc`-only parse bug in `TabGroupPicker.vue`'s template: an
 * inline `entry as TabGroupPickerEntry & { kind: "group" }` cast inside a template attribute
 * expression, which `vue-tsc`'s stricter template-expression parser could not parse
 * (TS1005/TS1128), even though Vite/esbuild's looser transform tolerated it fine and every
 * mount test kept passing the whole time.
 *
 * A component-mount test cannot catch this class of bug at all -- the rendered output is
 * identical either way, since the parse failure only exists inside `vue-tsc`'s own virtual
 * TypeScript codegen for the template, never in what Vite actually ships. So this test runs
 * the real tool that found the bug, `vue-tsc --noEmit`, over the real project config, and
 * checks its diagnostics for this file rather than re-mounting the component.
 *
 * Scoped to this file's own diagnostic codes on purpose: the workspace can have other,
 * unrelated typecheck findings in flight (for example a separate `TS6307` project-graph
 * finding reported alongside this fix, about `tabGroupPicker.ts` not being listed in the
 * composite project's file list). Asserting a clean overall `vue-tsc` exit code would make
 * this test fail on problems this fix has nothing to do with; asserting "no TS1005/TS1128 on
 * TabGroupPicker.vue" tests exactly the bug this file exists to guard.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

/** `packages/ui`, the project `vue-tsc` actually checks -- `tsconfig.json` lives here. */
const uiPackageRoot = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * `vue-tsc`'s own CLI entry point, resolved directly rather than through a shell or `npx`
 * wrapper: the `.CMD` shim this package installs on Windows needs `shell: true` to run at
 * all, and going through `npx` adds its own resolution work on every call for no benefit
 * here. Returns null (rather than throwing) when the toolchain in front of this test
 * genuinely lacks `vue-tsc`, so the test below can skip instead of failing the whole run.
 */
function resolveVueTscBin(): string | null {
    try {
        const pkgPath = require.resolve("vue-tsc/package.json");
        const pkg = require("vue-tsc/package.json") as { bin?: Record<string, string> };
        const relative = pkg.bin?.["vue-tsc"];
        if (relative === undefined) return null;
        const binPath = join(dirname(pkgPath), relative);
        return existsSync(binPath) ? binPath : null;
    } catch {
        return null;
    }
}

const vueTscBin = resolveVueTscBin();

/**
 * Runs `vue-tsc --noEmit -p tsconfig.json` over the real `packages/ui` project and returns
 * everything it printed, whether or not it exited cleanly. `execFileSync` throws on a
 * non-zero exit, which every run of this command hits whenever the workspace has any
 * typecheck error anywhere -- this test needs the diagnostics either way, not a clean exit.
 */
function runVueTsc(bin: string): string {
    try {
        return execFileSync(process.execPath, [bin, "--noEmit", "-p", "tsconfig.json"], {
            cwd: uiPackageRoot,
            encoding: "utf8",
        });
    } catch (error) {
        const execError = error as { stdout?: string; stderr?: string };
        return `${execError.stdout ?? ""}${execError.stderr ?? ""}`;
    }
}

describe("TabGroupPicker.vue vue-tsc parse regression", () => {
    it.runIf(vueTscBin !== null)(
        "reports no TS1005/TS1128 parse errors for TabGroupPicker.vue (the inline-cast template bug)",
        () => {
            const output = runVueTsc(vueTscBin as string);
            const thisFileLines = output.split(/\r?\n/).filter((line) => line.includes("TabGroupPicker.vue("));
            const parseFailureLines = thisFileLines.filter((line) => /TS1005|TS1128/.test(line));
            expect(parseFailureLines).toEqual([]);
        },
        // vue-tsc typechecks the whole `packages/ui` project (measured ~17s on a quiet
        // machine); a generous ceiling keeps this a real hang detector rather than a flake
        // under CI's usual multi-worker disk contention.
        120_000,
    );
});

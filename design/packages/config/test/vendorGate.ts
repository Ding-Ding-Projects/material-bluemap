/**
 * The one gate every cross-check against `vendor/BlueMap` shares.
 *
 * The submodule is what proves this package's defaults, controls and doc text against
 * upstream's own Java rather than against a hand-transcribed copy of it - see this
 * file's own callers (`schema.test.ts`, `controlPolicy.test.ts`) for what that actually
 * catches: a default that drifted from `CoreConfig.java`, a control that cannot express
 * a type `MapConfig.java` declares, and so on. It is genuinely optional to have checked
 * out - a contributor working on something unrelated should not be forced to fetch a
 * multi-hundred-megabyte Java repository just to run `vitest` - so its absence is never
 * a silent pass. Locally, an absent submodule shows up as a skip whose own name says so
 * in words. In CI, once the workflow actually fetches it (see `MBM_VENDOR_REQUIRED`'s own
 * comment), the same absence becomes a real, named failure instead of a skip sitting
 * quietly in a wall of green that nobody reads line by line.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, "..", "..", "..", "..");

/** Where the vendored Java config classes live, once the submodule is checked out. */
export const configJavaDir = join(
    repoRoot,
    "vendor",
    "BlueMap",
    "common",
    "src",
    "main",
    "java",
    "de",
    "bluecolored",
    "bluemap",
    "common",
    "config",
);

/** True once `vendor/BlueMap` has actually been fetched into this checkout. */
export const vendorAvailable = existsSync(configJavaDir);

/**
 * Set by the CI job that has fetched the submodule, so a checkout that silently failed
 * to bring it in fails a real test rather than skipping every vendor cross-check with
 * nobody watching for the difference between "skipped because optional" and "skipped
 * because the fetch broke".
 *
 * **The workflow line this needs, once added:** the test job's checkout step needs
 * `submodules: true` (or a separate `git submodule update --init --recursive` step)
 * *and* `env: { MBM_VENDOR_REQUIRED: "1" }` on the step that runs `packages/config`'s
 * tests. Until both exist, this stays unset, CI has no stronger a guarantee than a local
 * run does, and an absent submodule is reported as a named, visible skip instead - see
 * {@link vendorSuffix}. This repository's `.github/workflows` are out of scope for
 * whatever touched this file; adding that line is a separate, owned change.
 */
const vendorRequired = process.env.MBM_VENDOR_REQUIRED === "1";

/**
 * Appended to a cross-check `describe`'s own name, so a skip is never invisible: vitest
 * prints every test and describe name it collects, skipped or not, and a name that says
 * *why* it was skipped survives being read out of a long CI log with nothing else to go
 * on.
 */
export const vendorSuffix = vendorAvailable
    ? ""
    : " [SKIPPED: vendor/BlueMap submodule not checked out - run `git submodule update --init`]";

/**
 * Registers the one assertion that turns a broken CI fetch into a real failure.
 *
 * Call this once per file that also registers `describe.skipIf(!vendorAvailable)(...)`
 * blocks, so every file with a vendor cross-check carries its own guarantee rather than
 * relying on some other file's copy of this test to have run first. While
 * `MBM_VENDOR_REQUIRED` is unset - true for every local run, and for CI until the
 * workflow line above is added - this has nothing to check and passes trivially, the
 * same way a test behind a disabled feature flag does.
 */
export function requireVendorInCi(): void {
    it("has the vendor/BlueMap submodule checked out, because MBM_VENDOR_REQUIRED says CI must", () => {
        if (!vendorRequired) return;
        expect(
            vendorAvailable,
            "MBM_VENDOR_REQUIRED=1 but vendor/BlueMap is not checked out. The workflow's " +
                "checkout step needs submodules: true (or a `git submodule update --init " +
                "--recursive` step) before this test job runs.",
        ).toBe(true);
    });
}

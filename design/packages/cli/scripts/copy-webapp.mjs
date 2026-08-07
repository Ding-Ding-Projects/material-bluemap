#!/usr/bin/env node
/**
 * Copies upstream's already-built webapp bundle (`vendor/BlueMap/common/webapp/dist` —
 * the same HTML/JS/CSS `BlueMapCLI`'s own `-g`/`createOrUpdateWebApp` copies out of the
 * jar's resources) into this package's `dist/webapp`, so a built `@worldlens/cli`
 * can serve a real map viewer without depending on the `vendor/BlueMap` submodule being
 * checked out at runtime.
 *
 * This repository has not ported the browser-facing map viewer to a standalone static
 * bundle of its own (`packages/viewer` is a three.js *library*, not a built site;
 * `packages/ui` is the Electron app's own renderer). Until that exists, upstream's own
 * MIT-licensed webapp is the honest thing to serve — it is the *exact* artifact upstream's
 * CLI ships, not a placeholder.
 *
 * Deliberately non-fatal when the source is missing (e.g. a shallow checkout without
 * submodules): the rest of the package still builds and its other commands still work.
 * `src/webapp.ts`'s `-g` implementation is what fails loudly, at run time, if this step
 * never ran — see its own doc comment.
 */

import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
// design/packages/cli/scripts -> design/packages/cli -> design/packages -> design -> repo root
const repoRoot = join(packageRoot, "..", "..", "..");
const source = join(repoRoot, "vendor", "BlueMap", "common", "webapp", "dist");
const destination = join(packageRoot, "dist", "webapp");

if (!existsSync(source)) {
    console.warn(
        `[copy-webapp] ${source} does not exist (vendor/BlueMap not checked out?) - ` +
            "skipping. 'bluemap-cli -g' will fail loudly at run time until this is fixed " +
            "and the package is rebuilt.",
    );
    process.exit(0);
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`[copy-webapp] copied ${source} -> ${destination}`);

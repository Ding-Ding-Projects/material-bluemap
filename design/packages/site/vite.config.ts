import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

/** The pnpm workspace root, `design/`, which is what Vite would allow on its own. */
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The capture PNGs committed at the top of the repository.
 *
 * `src/content/captures.ts` bundles them so the landing page has pictures in a fresh
 * clone, rather than depending on a workflow artifact that a clone does not have. They sit
 * above the workspace root, where the dev server's file-serving allow-list stops, so the
 * one directory is named here. The production build is unaffected either way; this is what
 * keeps `pnpm dev` able to serve them.
 */
const committedScreenshots = fileURLToPath(new URL("../../../docs/screenshots", import.meta.url));

/**
 * The site is served from a **project subpath** - https://<owner>.github.io/<repo>/ - and
 * not from a domain root, so `base` has to carry that prefix or every emitted asset URL
 * points at the account root and 404s while the deploy itself stays green.
 *
 * The repository name is read from the environment rather than written in, because it is
 * not a constant: a fork, a rename or a second repository publishing the same site all
 * serve it from a different prefix. A CI probe in a repository named
 * `worldlens-ci-probe` built a site whose every asset pointed at
 * `/worldlens/`, which is exactly the silent failure the base-path gate exists to
 * catch, arriving through the one door the gate could not see because it was checking
 * against the same hard-coded value.
 *
 * `SITE_BASE` wins when set. Otherwise the GitHub Actions-provided `GITHUB_REPOSITORY`
 * ("owner/name") supplies the name. Outside CI, with neither set, the default keeps a
 * plain `pnpm build` working the way it always did.
 */
const repositoryName = process.env["GITHUB_REPOSITORY"]?.split("/")[1];
const base = process.env["SITE_BASE"] ?? (repositoryName ? `/${repositoryName}/` : "/worldlens/");

export default defineConfig({
    base,
    server: {
        fs: {
            // Setting `allow` replaces the default rather than adding to it, so the
            // workspace root is restated alongside the one directory being opened.
            allow: [workspaceRoot, committedScreenshots],
        },
    },
    build: {
        target: "es2022",
        sourcemap: true,
        // Everything ships as a real file. Inlining assets as data URIs would bloat the
        // entry chunk that every visitor downloads, for images only 10% of loads ever show.
        assetsInlineLimit: 0,
    },
});

import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

/** The pnpm workspace root, `design/`, which is what Vite would allow on its own. */
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * `docs/*.md` at the top of the repository, bundled into the in-app docs browser by
 * `src/components/docs/docsContent.ts` via `import.meta.glob`. It sits above the workspace
 * root, where the dev server's file-serving allow-list stops by default, so it is named here
 * exactly as `packages/site/vite.config.ts` names `docs/screenshots` for the same reason.
 * The production build is unaffected either way; this is what keeps `pnpm dev` able to read
 * the articles.
 */
const docsDirectory = fileURLToPath(new URL("../../../docs", import.meta.url));

export default defineConfig({
    plugins: [vue()],
    base: "./",
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    define: {
        __VUE_I18N_FULL_INSTALL__: true,
        __VUE_I18N_LEGACY_API__: false,
        __INTLIFY_PROD_DEVTOOLS__: false,
        // Without this, vue-i18n registers `compileToFunction`, which compiles every message
        // string with `new Function`. The Electron shell serves the app under a CSP with
        // `script-src 'self'` and no `unsafe-eval`, so that call is refused at runtime and the
        // UI renders blank, exactly as the eval-based HOCON parser used to (see #16).
        // JIT compilation walks a message AST instead, so no code is generated at runtime.
        __INTLIFY_JIT_COMPILATION__: true,
    },
    build: {
        sourcemap: true,
    },
    server: {
        fs: {
            // Setting `allow` replaces the default rather than adding to it, so the
            // workspace root is restated alongside the one directory being opened.
            allow: [workspaceRoot, docsDirectory],
        },
        proxy: {
            // Dev-mode: forward remote-profile traffic to the public demo, mirroring the
            // embedded server's /remote/{profile} mount (upstream used the same trick).
            "/remote/demo": {
                target: "https://bluecolored.de/bluemap",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/remote\/demo/, ""),
            },
        },
    },
});

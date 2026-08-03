import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

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

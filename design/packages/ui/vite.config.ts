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

import { createApp, reactive } from "vue";
import { setI18nAdapter, setReactiveFactory } from "@material-bluemap/viewer";
import type { ReactiveFactory } from "@material-bluemap/viewer";
import App from "./App.vue";
import { vuetify } from "./vuetify.js";
import { i18nModule, loadLanguage, setLanguage } from "./i18n.js";
// Roboto is what every MD3 typescale here names (Vuetify's md3 blueprint emits
// `font-family: Roboto, sans-serif` and markers.scss matches it), and Windows ships no
// Roboto - without these imports the entire chrome silently fell back to Arial. Bundled
// locally through @fontsource so the CSP's `font-src 'self'` holds and nothing is fetched.
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
// Roboto Mono is named first in the monospace stack by nineteen declarations across
// fourteen components - every path, config preview, engine log, regex match and <kbd> in
// the interface - and was bundled nowhere, so all of them fell through to
// `ui-monospace, monospace` and rendered in whatever the platform happened to pick.
// Two weights, because those are the two the surfaces actually ask for: none of the
// declarations sets a `font-weight`, so each inherits, and the inherited value is 400
// everywhere except `.mb-config-control__swatch-text`, which sits inside a `v-btn` and
// therefore inherits Vuetify's `font-weight: 500`. Nothing renders monospace bold today;
// a surface that starts to would need `700.css` added here rather than left to the
// browser's synthetic bold.
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/500.css";
import "./styles/global.scss";
import "./styles/markers.scss";

// Install Vue's reactivity into the framework-free viewer BEFORE any viewer object is
// constructed (upstream wrapped its data objects with reactive() directly).
// The cast is unavoidable: Vue types `reactive` as returning `Reactive<T>` rather than `T`,
// which is the same object with a branded type the seam deliberately does not know about.
setReactiveFactory(reactive as ReactiveFactory);

// Install the UI's vue-i18n instance into the viewer's i18n seam. Without this the viewer
// runs on its identity adapter: `i18n.t()` returns the key (so `document.title` reads the
// literal string "pageTitle") and its `setLanguage()` is a no-op, which also leaves the
// settings menu's language group unable to switch language through the viewer.
setI18nAdapter(
    {
        get locale() {
            return i18nModule.global.locale as unknown as { value: string };
        },
        t: (key: string, values?: Record<string, unknown>) =>
            values === undefined
                ? i18nModule.global.t(key)
                : i18nModule.global.t(key, values as Record<string, unknown>),
    },
    (lang: string) => setLanguage(i18nModule, lang),
);

const app = createApp(App);
app.use(vuetify);
app.use(i18nModule);
app.mount("#app");

void loadLanguage(i18nModule);

import { createApp, reactive } from "vue";
import { setI18nAdapter, setReactiveFactory } from "@material-bluemap/viewer";
import type { ReactiveFactory } from "@material-bluemap/viewer";
import App from "./App.vue";
import { vuetify } from "./vuetify.js";
import { i18nModule, loadLanguage, setLanguage } from "./i18n.js";
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

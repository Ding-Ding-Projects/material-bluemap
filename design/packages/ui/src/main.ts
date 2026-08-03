import { createApp, reactive } from "vue";
import { setReactiveFactory } from "@material-bluemap/viewer";
import App from "./App.vue";
import { vuetify } from "./vuetify";
import { i18nModule, loadLanguage } from "./i18n";
import "./styles/global.scss";
import "./styles/markers.scss";

// Install Vue's reactivity into the framework-free viewer BEFORE any viewer object is
// constructed (upstream wrapped its data objects with reactive() directly).
setReactiveFactory(reactive);

const app = createApp(App);
app.use(vuetify);
app.use(i18nModule);
app.mount("#app");

void loadLanguage(i18nModule);

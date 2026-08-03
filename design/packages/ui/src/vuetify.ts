import "vuetify/styles";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { md3 } from "vuetify/blueprints";
import { aliases, mdi } from "vuetify/iconsets/mdi-svg";

/**
 * MD3 token bridge: these palettes drive Vuetify AND are exported as CSS custom
 * properties (--md-sys-color-*) so the viewer's raw-DOM marker elements can share the
 * theme (see styles/markers.scss). Three themes preserve upstream's dark/light/contrast.
 */
export const vuetify = createVuetify({
    blueprint: md3,
    // `createVuetify` registers NOTHING by itself: it only calls app.component() for what it
    // is handed here. Without this the whole UI compiled down to resolveComponent("v-app-bar")
    // calls that resolved to nothing, so every Vuetify tag rendered as an unknown inline HTML
    // element with no layout, no z-index and no surface -- and the fixed map canvas painted
    // straight over it. Importing the component modules is also what pulls each component's
    // stylesheet in; `vuetify/styles` alone carries none of it.
    components,
    directives,
    icons: {
        defaultSet: "mdi",
        aliases,
        sets: { mdi },
    },
    theme: {
        defaultTheme: "dark",
        themes: {
            dark: {
                dark: true,
                colors: {
                    primary: "#8FCDFF",
                    secondary: "#B7C9D9",
                    surface: "#101418",
                    background: "#0B0E11",
                    error: "#FFB4AB",
                },
            },
            light: {
                dark: false,
                colors: {
                    primary: "#00639B",
                    secondary: "#51606F",
                    surface: "#F8F9FB",
                    background: "#FFFFFF",
                    error: "#BA1A1A",
                },
            },
            contrast: {
                dark: true,
                colors: {
                    primary: "#FFFFFF",
                    secondary: "#FFFF00",
                    surface: "#000000",
                    background: "#000000",
                    error: "#FF5449",
                },
            },
        },
    },
});

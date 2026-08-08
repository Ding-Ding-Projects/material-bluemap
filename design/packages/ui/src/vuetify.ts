import "vuetify/styles";
import { createVuetify } from "vuetify";
import type { ThemeDefinition } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { md3 } from "vuetify/blueprints";
import { aliases, mdi } from "vuetify/iconsets/mdi-svg";

/**
 * MD3 token bridge: these palettes drive Vuetify AND are exported as CSS custom
 * properties (--v-theme-*, mapped onto --md-sys-color-* in styles/markers.scss) so the
 * viewer's raw-DOM marker elements can share the theme. Three themes preserve upstream's
 * dark/light/contrast.
 *
 * ## The complete Material Design 3 colour system, not five colours and a guess
 *
 * Each theme used to name five colours and let Vuetify's own grey defaults answer for
 * every other role - so `surface-variant`, `outline` and the container tiers came from
 * Vuetify's reference palette rather than from this product's, and every surface that
 * asked for an M3 role it could not find approximated one. The schemes below are the
 * full M3 role set, generated from the tonal palettes of the blue seed the app has
 * always used (#00639B is that palette's tone 40, #8FCDFF its tone 80 - the two values
 * that were already here). Nothing that was shipping changed hue; the other thirty roles
 * now come from the same family instead of from a neutral guess.
 *
 * Tone recipe, per the M3 spec: light schemes take primary/secondary/tertiary at tone
 * 40 on containers at 90, dark schemes tone 80 on containers at 30; neutral surfaces run
 * N99..N10 in light and N6..N90 in dark, with the container ladder
 * (lowest/low/default/high/highest) as the spec's five surface steps; `outline` is NV50
 * against `outline-variant` NV80 (light) / NV30 (dark); error is the spec's own red
 * ramp, unchanged.
 *
 * ## The contrast theme is deliberate, not tonal
 *
 * It answers the same role names with the highest-contrast values that keep their
 * meaning: black surfaces at every tier, white text and outlines, white primary, yellow
 * secondary, and the error red on black. Deriving it from a seed would defeat the one
 * thing it exists for.
 */
const darkScheme: ThemeDefinition = {
    dark: true,
    colors: {
        "primary": "#8FCDFF",
        "on-primary": "#003351",
        "primary-container": "#004B73",
        "on-primary-container": "#CEE5FF",
        "secondary": "#B7C9D9",
        "on-secondary": "#22323F",
        "secondary-container": "#384956",
        "on-secondary-container": "#D3E5F5",
        "tertiary": "#D1BFE7",
        "on-tertiary": "#372A49",
        "tertiary-container": "#4E4161",
        "on-tertiary-container": "#EDDCFF",
        "error": "#FFB4AB",
        "on-error": "#690005",
        "error-container": "#93000A",
        "on-error-container": "#FFDAD6",
        "background": "#0B0E11",
        "on-background": "#E1E2E8",
        "surface": "#101418",
        "on-surface": "#E1E2E8",
        "surface-dim": "#101418",
        "surface-bright": "#37393E",
        "surface-light": "#272A2E",
        "surface-container-lowest": "#0B0E11",
        "surface-container-low": "#191C20",
        "surface-container": "#1D2024",
        "surface-container-high": "#272A2E",
        "surface-container-highest": "#323539",
        "surface-variant": "#42474E",
        "on-surface-variant": "#C2C7CF",
        "outline": "#8C9199",
        "outline-variant": "#42474E",
        "inverse-surface": "#E1E2E8",
        "inverse-on-surface": "#2E3135",
        "inverse-primary": "#00639B",
        "surface-tint": "#8FCDFF",
        "scrim": "#000000",
        "shadow": "#000000",
    },
};

const lightScheme: ThemeDefinition = {
    dark: false,
    colors: {
        "primary": "#00639B",
        "on-primary": "#FFFFFF",
        "primary-container": "#CEE5FF",
        "on-primary-container": "#001D31",
        "secondary": "#51606F",
        "on-secondary": "#FFFFFF",
        "secondary-container": "#D3E5F5",
        "on-secondary-container": "#0C1D2A",
        "tertiary": "#67587A",
        "on-tertiary": "#FFFFFF",
        "tertiary-container": "#EDDCFF",
        "on-tertiary-container": "#221534",
        "error": "#BA1A1A",
        "on-error": "#FFFFFF",
        "error-container": "#FFDAD6",
        "on-error-container": "#410002",
        "background": "#FFFFFF",
        "on-background": "#191C20",
        "surface": "#F8F9FB",
        "on-surface": "#191C20",
        "surface-dim": "#D8DAE0",
        "surface-bright": "#F8F9FB",
        "surface-light": "#ECEEF4",
        "surface-container-lowest": "#FFFFFF",
        "surface-container-low": "#F2F3F9",
        "surface-container": "#ECEEF4",
        "surface-container-high": "#E7E8EE",
        "surface-container-highest": "#E1E2E8",
        "surface-variant": "#DEE3EA",
        "on-surface-variant": "#42474E",
        "outline": "#72777F",
        "outline-variant": "#C2C7CF",
        "inverse-surface": "#2E3135",
        "inverse-on-surface": "#EFF1F6",
        "inverse-primary": "#8FCDFF",
        "surface-tint": "#00639B",
        "scrim": "#000000",
        "shadow": "#000000",
    },
};

const contrastScheme: ThemeDefinition = {
    dark: true,
    colors: {
        "primary": "#FFFFFF",
        "on-primary": "#000000",
        "primary-container": "#FFFFFF",
        "on-primary-container": "#000000",
        "secondary": "#FFFF00",
        "on-secondary": "#000000",
        "secondary-container": "#FFFF00",
        "on-secondary-container": "#000000",
        "tertiary": "#FFFFFF",
        "on-tertiary": "#000000",
        "tertiary-container": "#FFFFFF",
        "on-tertiary-container": "#000000",
        "error": "#FF5449",
        "on-error": "#000000",
        "error-container": "#FF5449",
        "on-error-container": "#000000",
        "background": "#000000",
        "on-background": "#FFFFFF",
        "surface": "#000000",
        "on-surface": "#FFFFFF",
        "surface-dim": "#000000",
        "surface-bright": "#000000",
        "surface-light": "#000000",
        "surface-container-lowest": "#000000",
        "surface-container-low": "#000000",
        "surface-container": "#000000",
        "surface-container-high": "#000000",
        "surface-container-highest": "#000000",
        "surface-variant": "#000000",
        "on-surface-variant": "#FFFFFF",
        "outline": "#FFFFFF",
        "outline-variant": "#FFFFFF",
        "inverse-surface": "#FFFFFF",
        "inverse-on-surface": "#000000",
        "inverse-primary": "#000000",
        "surface-tint": "#FFFFFF",
        "scrim": "#000000",
        "shadow": "#000000",
    },
};

/** The three schemes, exported for the completeness test rather than re-parsed from CSS. */
export const THEME_SCHEMES: Readonly<Record<"dark" | "light" | "contrast", ThemeDefinition>> = {
    dark: darkScheme,
    light: lightScheme,
    contrast: contrastScheme,
};

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
            dark: darkScheme,
            light: lightScheme,
            contrast: contrastScheme,
        },
    },
});

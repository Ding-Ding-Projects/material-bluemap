/**
 * Every viewer setting, as a palette row that holds the real control.
 *
 * These are the settings on the viewer's own settings page: theme, resolution, language,
 * lighting, render distance, the free-flight controls, and the debug switches. The palette
 * does not link to that page and describe them; it renders them, and every `set` below
 * writes through the same `BlueMapApp` method the settings page writes through, so the two
 * surfaces are two views of one setting rather than two settings that usually agree.
 *
 * **Why the write paths are spelled out again here rather than imported.** The settings page
 * is a single-file component: its `setTheme`, `toggleDebug` and the rest are local functions
 * inside `<script setup>`, reachable only by mounting it. Nothing in this folder can call
 * them. What is shared - and what actually matters - is the layer underneath: `setTheme`,
 * `setDebug`, `setChunkBorders`, `saveUserSettings`, `updateControlsSettings` and the
 * `appState`/`mapViewer.data` fields are all public on the one live `BlueMapApp`, and that
 * is the thing that persists under the `bluemap-*` keys. So both surfaces end at the same
 * method with the same persistence; only the two-line wrapper is written twice. Lifting
 * those wrappers into a module both can import is the right cleanup and it belongs in the
 * settings page's own folder, which this work does not own.
 *
 * **Persistence is part of every `set`, never a step the caller has to remember.** The
 * settings page can afford to split "apply while the slider moves" from "save when it is
 * let go", because a drag is sixty writes. A palette row is a number box that commits once,
 * on blur or Enter, so applying and saving collapse into the one call - and a row that
 * applied without saving would be a setting that silently forgets itself on restart, which
 * is the worst of the three possible bugs here because nothing looks wrong at the time.
 *
 * **Nothing is listed when no map is open.** `blueMapApp` is null until a profile is active,
 * and a theme select wired to nothing would be exactly the decorative control this project
 * keeps finding. The palette says so in a line of its own instead.
 */

import type { BlueMapApp } from "@worldlens/viewer";
import { i18nModule, languages, setLanguage } from "../../i18n.js";
import type { PaletteChoice, PaletteItem, PaletteSetting, Translate } from "./paletteItems.js";

/** The group headings viewer settings are listed under, resolved once per build. */
interface ViewerGroups {
    readonly view: string;
    readonly lighting: string;
    readonly resolution: string;
    readonly renderDistance: string;
    readonly mapControls: string;
    readonly freeFlight: string;
    readonly appearance: string;
    readonly debug: string;
}

function groupsFor(t: Translate): ViewerGroups {
    return {
        view: t("controls.title", "View / Controls"),
        lighting: t("lighting.title", "Lighting"),
        resolution: t("resolution.title", "Resolution"),
        renderDistance: t("renderDistance.title", "Render Distance"),
        mapControls: t("mapControls.title", "Map Controls"),
        freeFlight: t("freeFlightControls.title", "Free-Flight Controls"),
        appearance: t("theme.title", "Theme"),
        debug: t("debug.button", "Debug"),
    };
}

/** A toggle row, with the write and its persistence in one place. */
function toggle(
    id: string,
    group: string,
    title: string,
    description: string,
    keywords: readonly string[],
    value: boolean,
    set: (value: boolean) => void,
): PaletteSetting {
    return { kind: "setting", id, group, title, description, keywords, control: { kind: "toggle", value, set } };
}

/** A number row. `unit` is rendered beside the box and searched, so "blocks" finds it. */
function number(
    id: string,
    group: string,
    title: string,
    description: string,
    keywords: readonly string[],
    value: number,
    bounds: { min: number; max: number; step: number; unit: string },
    set: (value: number) => void,
): PaletteSetting {
    return {
        kind: "setting",
        id,
        group,
        title,
        description,
        keywords,
        control: { kind: "number", value, min: bounds.min, max: bounds.max, step: bounds.step, unit: bounds.unit, set },
    };
}

/** A select row. */
function choice(
    id: string,
    group: string,
    title: string,
    description: string,
    keywords: readonly string[],
    value: string | null,
    options: readonly PaletteChoice[],
    set: (option: string) => void,
): PaletteSetting {
    return { kind: "setting", id, group, title, description, keywords, control: { kind: "choice", value, options, set } };
}

/**
 * Every viewer setting the running app can currently offer.
 *
 * `locale` is passed rather than read from the module so the language row re-renders when
 * the language actually changes: reading `useI18n().locale` in the caller's computed is what
 * makes this list reactive to it, and reading it here would not be, because the loader
 * mutates a ref this module only ever read once.
 */
export function viewerSettingItems(app: BlueMapApp | null, t: Translate, locale: string): PaletteItem[] {
    if (app === null) return [];

    const group = groupsFor(t);
    const items: PaletteItem[] = [];

    /*
     * View mode. Only offered when the map has more than one view to switch between, which
     * is the same condition the settings page applies: a map with a single view would give a
     * select with one option and no effect.
     */
    const map = app.mapViewer.data.map;
    if (map !== null && map !== undefined && map.views.length > 1) {
        const options: PaletteChoice[] = [];
        if (map.perspectiveView) options.push({ id: "perspective", label: t("controls.perspective.button", "Perspective") });
        if (map.flatView) options.push({ id: "flat", label: t("controls.flatView.button", "Flat") });
        if (map.freeFlightView) options.push({ id: "free", label: t("controls.freeFlight.button", "Free-Flight") });

        items.push(
            choice(
                "viewer.view",
                group.view,
                t("controls.title", "View / Controls"),
                t(
                    "palette.view.description",
                    "How the camera looks at the world: an angled perspective, straight down, or free flight.",
                ),
                ["camera", "perspective", "flat", "free flight"],
                app.appState.controls.state,
                options,
                (id) => {
                    // Coming out of free flight the settings page lifts the camera to a
                    // minimum distance of 100, or a perspective view starts inside a hill.
                    const fromFreeFlight = app.appState.controls.state === "free";
                    if (id === "perspective") app.setPerspectiveView(500, fromFreeFlight ? 100 : 0);
                    else if (id === "flat") app.setFlatView(500, fromFreeFlight ? 100 : 0);
                    else if (id === "free") app.setFreeFlight(500);
                },
            ),
        );
    }

    /* Lighting. Both uniforms need an explicit redraw or the change waits for a camera move. */
    items.push(
        number(
            "viewer.sunlight",
            group.lighting,
            t("lighting.sunlight", "Sunlight"),
            t("palette.sunlight.description", "How strong the directional daylight is, from none to full."),
            ["light", "day", "night", "brightness"],
            app.mapViewer.data.uniforms.sunlightStrength.value,
            { min: 0, max: 1, step: 0.01, unit: "" },
            (value) => {
                app.mapViewer.data.uniforms.sunlightStrength.value = value;
                app.mapViewer.redraw();
            },
        ),
        number(
            "viewer.ambientLight",
            group.lighting,
            t("lighting.ambientLight", "Ambient-Light"),
            t("palette.ambientLight.description", "How much light reaches surfaces the sun is not hitting."),
            ["light", "shadow", "brightness"],
            app.mapViewer.data.uniforms.ambientLight.value,
            { min: 0, max: 1, step: 0.01, unit: "" },
            (value) => {
                app.mapViewer.data.uniforms.ambientLight.value = value;
                app.mapViewer.redraw();
            },
        ),
    );

    /* Resolution. The setter on MapViewer also resizes the render target; `data` would not. */
    items.push(
        choice(
            "viewer.resolution",
            group.resolution,
            t("resolution.title", "Resolution"),
            t(
                "palette.resolution.description",
                "How many pixels are rendered per screen pixel. Higher looks sharper and costs more.",
            ),
            ["quality", "ssaa", "upscaling", "performance", "fps"],
            String(app.mapViewer.data.superSampling),
            [
                { id: "2", label: t("resolution.high", "High (SSAA x2)") },
                { id: "1", label: t("resolution.normal", "Normal (Native x1)") },
                { id: "0.5", label: t("resolution.low", "Low (Upscaling x0.5)") },
            ],
            (id) => {
                app.mapViewer.superSampling = parseFloat(id);
                app.saveUserSettings();
                app.mapViewer.redraw();
            },
        ),
    );

    /* Render distance. The bounds are the ones the server published, not invented here. */
    const settings = app.settings;
    items.push(
        number(
            "viewer.hiresDistance",
            group.renderDistance,
            t("renderDistance.hiresLayer", "Hires layer"),
            t(
                "palette.hires.description",
                "How far the detailed tiles are loaded. Zero turns the detailed layer off entirely.",
            ),
            ["detail", "distance", "performance"],
            app.mapViewer.data.loadedHiresViewDistance,
            { min: settings?.hiresSliderMin ?? 50, max: settings?.hiresSliderMax ?? 500, step: 10, unit: t("palette.blocks", "blocks") },
            (value) => {
                app.mapViewer.data.loadedHiresViewDistance = value;
                app.mapViewer.updateLoadedMapArea();
                app.saveUserSettings();
            },
        ),
        number(
            "viewer.lowresDistance",
            group.renderDistance,
            t("renderDistance.lowersLayer", "Lowres layer"),
            t("palette.lowres.description", "How far the coarse tiles are loaded, which is what fills the horizon."),
            ["distance", "horizon", "performance"],
            app.mapViewer.data.loadedLowresViewDistance,
            {
                min: settings?.lowresSliderMin ?? 500,
                max: settings?.lowresSliderMax ?? 10000,
                step: 100,
                unit: t("palette.blocks", "blocks"),
            },
            (value) => {
                app.mapViewer.data.loadedLowresViewDistance = value;
                app.mapViewer.updateLoadedMapArea();
                app.saveUserSettings();
            },
        ),
        toggle(
            "viewer.loadHiresWhileMoving",
            group.renderDistance,
            t("renderDistance.loadHiresWhileMoving", "Load hires while moving"),
            t(
                "palette.loadHires.description",
                "Whether detailed tiles keep loading while the camera moves. Off is smoother on a slow machine.",
            ),
            ["pause", "tile", "performance"],
            !app.appState.controls.pauseTileLoading,
            (value) => {
                app.appState.controls.pauseTileLoading = !value;
                app.saveUserSettings();
            },
        ),
    );

    /* Map controls and free flight. */
    items.push(
        toggle(
            "viewer.showZoomButtons",
            group.mapControls,
            t("mapControls.showZoomButtons", "Show Zoom Buttons"),
            t("palette.zoomButtons.description", "Whether the plus and minus buttons sit over the map."),
            ["zoom", "buttons", "chrome"],
            app.appState.controls.showZoomButtons,
            (value) => {
                app.appState.controls.showZoomButtons = value;
                app.saveUserSettings();
            },
        ),
        number(
            "viewer.mouseSensitivity",
            group.freeFlight,
            t("freeFlightControls.mouseSensitivity", "Mouse-Sensitivity"),
            t("palette.sensitivity.description", "How far the free-flight camera turns for a given mouse movement."),
            ["mouse", "look", "speed"],
            app.appState.controls.mouseSensitivity,
            { min: 0.1, max: 5, step: 0.05, unit: "" },
            (value) => {
                app.appState.controls.mouseSensitivity = value;
                app.updateControlsSettings();
                app.saveUserSettings();
            },
        ),
        toggle(
            "viewer.invertMouse",
            group.freeFlight,
            t("freeFlightControls.invertMouseY", "Invert Mouse Y"),
            t("palette.invertMouse.description", "Whether moving the mouse up looks down in free flight."),
            ["mouse", "invert", "y axis"],
            app.appState.controls.invertMouse,
            (value) => {
                app.appState.controls.invertMouse = value;
                app.updateControlsSettings();
                app.saveUserSettings();
            },
        ),
    );

    /* Appearance: theme, language and the screenshot destination. */
    items.push(
        choice(
            "viewer.theme",
            group.appearance,
            t("theme.title", "Theme"),
            t("palette.theme.description", "Light, dark, high contrast, or whatever the operating system is set to."),
            ["dark", "light", "contrast", "colour", "color", "appearance"],
            app.appState.theme ?? "default",
            [
                { id: "default", label: t("theme.default", "Default (System/Browser)") },
                { id: "dark", label: t("theme.dark", "Dark") },
                { id: "light", label: t("theme.light", "Light") },
                { id: "contrast", label: t("theme.contrast", "Contrast") },
            ],
            (id) => {
                app.setTheme(id === "default" ? null : id);
                app.saveUserSettings();
            },
        ),
        toggle(
            "viewer.screenshotClipboard",
            group.appearance,
            t("screenshot.clipboard", "Copy to Clipboard"),
            t("palette.screenshot.description", "Whether a screenshot goes to the clipboard instead of being downloaded."),
            ["screenshot", "clipboard", "copy", "image"],
            app.appState.screenshot.clipboard,
            (value) => {
                app.appState.screenshot.clipboard = value;
                app.saveUserSettings();
            },
        ),
    );

    if (languages.length > 1) {
        items.push(
            choice(
                "viewer.language",
                group.appearance,
                t("language.title", "Language"),
                t("palette.language.description", "The language the interface is written in."),
                ["locale", "translation", ...languages.map((language) => language.name)],
                locale,
                languages.map((language) => ({ id: language.locale, label: language.name })),
                (id) => {
                    void setLanguage(i18nModule, id).then(() => {
                        app.updatePageAddress();
                        app.saveUserSettings();
                        // `saveUserSettings()` reads the viewer's own i18n adapter, which the
                        // shell may not have installed; write the key the loader reads back.
                        app.saveUserSetting("lang", id);
                    });
                },
            ),
        );
    }

    /* Debug. */
    items.push(
        toggle(
            "viewer.chunkBorders",
            group.debug,
            t("chunkBorders.button", "Show chunk borders"),
            t("palette.chunkBorders.description", "Draws the sixteen-block chunk grid over the world."),
            ["grid", "chunk", "debug"],
            app.mapViewer.data.uniforms.chunkBorders.value,
            (value) => {
                app.setChunkBorders(value);
                app.saveUserSettings();
                // A uniform change needs a frame; left alone it waits for a camera move.
                app.mapViewer.redraw();
            },
        ),
        toggle(
            "viewer.debug",
            group.debug,
            t("debug.button", "Debug"),
            t("palette.debug.description", "Shows the viewer's own diagnostics and logs more to the console."),
            ["diagnostics", "developer", "console"],
            app.appState.debug,
            (value) => {
                app.setDebug(value);
                app.saveUserSettings();
            },
        ),
    );

    return items;
}

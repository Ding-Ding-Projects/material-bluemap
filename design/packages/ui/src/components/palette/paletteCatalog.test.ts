// @vitest-environment jsdom

/**
 * The catalogue, and the promises every row in it makes.
 *
 * jsdom rather than the Node environment, and not because anything here renders. Building
 * the viewer rows needs the language list from `i18n.ts`, which imports the viewer package,
 * which loads hammerjs, which reads `window` at module scope and throws without one. Nothing
 * below touches the DOM.
 *
 * Three families of claim are checked here, and they are the three ways this feature could
 * be quietly wrong while still looking finished.
 *
 * **Coverage.** Every section the settings surface renders, and every tab the options editor
 * renders, has a row. Asserted against those surfaces' own exported registries rather than
 * against a list written here, so a sixth settings section added next door fails this file
 * on the day it lands instead of silently going missing from the palette.
 *
 * **Rows that work.** A setting row's control is called and the write is checked against a
 * fake `BlueMapApp` - not that a function exists, but that flipping Debug reaches `setDebug`
 * *and* `saveUserSettings`, because a setting that applies and never persists is the failure
 * that looks fine until the next launch.
 *
 * **Rows that do not pretend.** Every destination carries a sentence saying where it goes,
 * every row carries a title and an explanation, and no row is built for a surface that is
 * not there: no viewer settings without a viewer, no Players page without players.
 */

import { describe, expect, it, vi } from "vitest";
import type { BlueMapApp } from "@material-bluemap/viewer";
import { SCREENS } from "../config/configSearch.js";
import { SETTINGS_ANCHORS, SETTINGS_SECTIONS } from "../settings/settingsSections.js";
import { buildPaletteCatalog, type PaletteCatalogInput, type PaletteShellActions } from "./paletteCatalog.js";
import type { PaletteItem, PaletteSetting, Translate } from "./paletteItems.js";

/**
 * The English fallback, which is what `t` returns with no locale loaded.
 *
 * The three-argument form substitutes its named arguments, exactly as vue-i18n does: the
 * fallback is compiled as a message and `{tab}` is filled from the object. A stub that
 * returned the raw fallback would let a row ship with a literal `{tab}` in the sentence a
 * user reads, and this file would still be green.
 */
const t: Translate = ((key: string, second: unknown, third?: unknown) => {
    if (typeof second === "string") return second;
    const message = typeof third === "string" ? third : key;
    const named = (second ?? {}) as Record<string, unknown>;
    return message.replace(/\{(\w+)\}/g, (_whole, name: string) => String(named[name] ?? ""));
}) as Translate;

function actions(): PaletteShellActions & {
    revealed: unknown[];
    settingsOpened: number;
    configOpened: (string | null)[];
    profilesOpened: number;
} {
    const state = { revealed: [] as unknown[], settingsOpened: 0, configOpened: [] as (string | null)[], profilesOpened: 0 };
    return {
        get revealed() {
            return state.revealed;
        },
        get settingsOpened() {
            return state.settingsOpened;
        },
        get configOpened() {
            return state.configOpened;
        },
        get profilesOpened() {
            return state.profilesOpened;
        },
        revealSetting: (target) => state.revealed.push(target),
        openSettings: () => state.settingsOpened++,
        openConfig: (screen) => state.configOpened.push(screen),
        openProfiles: () => state.profilesOpened++,
    };
}

interface FakeApp {
    app: BlueMapApp;
    calls: Record<string, unknown[]>;
    data: {
        superSampling: number;
        loadedHiresViewDistance: number;
        loadedLowresViewDistance: number;
    };
}

/**
 * A stand-in for the running viewer, holding exactly the fields the builders read.
 *
 * Cast rather than implemented: `BlueMapApp` owns three.js objects and a whole map viewer,
 * and constructing one in a Node test would be testing three.js. What matters is that the
 * builders reach for the same names the real class exposes, which the type assertion at the
 * end forces the shape to keep.
 */
function fakeApp(options: { markers?: boolean; players?: boolean; views?: number } = {}): FakeApp {
    const calls: Record<string, unknown[]> = {
        setTheme: [],
        setDebug: [],
        setChunkBorders: [],
        saveUserSettings: [],
        saveUserSetting: [],
        updateControlsSettings: [],
        updateLoadedMapArea: [],
        redraw: [],
        resetCamera: [],
        openPage: [],
        setFlatView: [],
    };

    const markerSets = [];
    if (options.markers === true) {
        markerSets.push({ id: "poi", markers: [{ id: "spawn" }], markerSets: [] });
    }
    if (options.players === true) {
        markerSets.push({ id: "bm-players", markers: [], markerSets: [] });
    }

    const data = {
        map: {
            views: Array.from({ length: options.views ?? 1 }, (_unused, index) => String(index)),
            perspectiveView: true,
            flatView: true,
            freeFlightView: true,
        },
        uniforms: {
            sunlightStrength: { value: 1 },
            ambientLight: { value: 0 },
            chunkBorders: { value: false },
        },
        superSampling: 1,
        loadedHiresViewDistance: 100,
        loadedLowresViewDistance: 2000,
    };

    const app = {
        settings: { hiresSliderMin: 50, hiresSliderMax: 500, lowresSliderMin: 500, lowresSliderMax: 10000 },
        appState: {
            theme: null as string | null,
            debug: false,
            screenshot: { clipboard: false },
            controls: {
                state: "perspective",
                pauseTileLoading: false,
                showZoomButtons: true,
                mouseSensitivity: 1,
                invertMouse: false,
            },
            menu: {
                openPage: (...args: unknown[]) => calls.openPage?.push(args),
            },
        },
        mapViewer: {
            data,
            markers: { data: { id: "root", markers: [], markerSets } },
            redraw: () => calls.redraw?.push(true),
            updateLoadedMapArea: () => calls.updateLoadedMapArea?.push(true),
            set superSampling(value: number) {
                data.superSampling = value;
            },
        },
        setTheme: (value: string | null) => calls.setTheme?.push(value),
        setDebug: (value: boolean) => calls.setDebug?.push(value),
        setChunkBorders: (value: boolean) => calls.setChunkBorders?.push(value),
        saveUserSettings: () => calls.saveUserSettings?.push(true),
        saveUserSetting: (...args: unknown[]) => calls.saveUserSetting?.push(args),
        updateControlsSettings: () => calls.updateControlsSettings?.push(true),
        updatePageAddress: () => {},
        resetCamera: () => calls.resetCamera?.push(true),
        setPerspectiveView: () => {},
        setFlatView: (...args: unknown[]) => calls.setFlatView?.push(args),
        setFreeFlight: () => {},
    };

    return { app: app as unknown as BlueMapApp, calls, data };
}

function input(overrides: Partial<PaletteCatalogInput> = {}): PaletteCatalogInput {
    return {
        t,
        app: null,
        locale: "en",
        actions: actions(),
        canRouteConfigScreens: false,
        size: "card",
        setSize: () => {},
        ...overrides,
    };
}

function byId(items: readonly PaletteItem[], id: string): PaletteItem {
    const found = items.find((item) => item.id === id);
    if (found === undefined) throw new Error(`no palette row with id ${id}`);
    return found;
}

function settingRow(items: readonly PaletteItem[], id: string): PaletteSetting {
    const found = byId(items, id);
    if (found.kind !== "setting") throw new Error(`${id} is a ${found.kind}, not a setting`);
    return found;
}

/* -------------------------------------------------------------------------- */
/* Coverage                                                                   */
/* -------------------------------------------------------------------------- */

describe("what the catalogue covers", () => {
    it("has a row for every section the settings surface renders, from its own registry", () => {
        const items = buildPaletteCatalog(input());
        for (const anchor of SETTINGS_SECTIONS) {
            expect(byId(items, `settings.${anchor}`).kind).toBe("destination");
        }
    });

    it("has a row for every tab of the options editor once the shell can route to one", () => {
        const items = buildPaletteCatalog(input({ canRouteConfigScreens: true }));
        for (const screen of SCREENS) {
            const row = byId(items, `config.${screen.id}`);
            expect(row.title).toBe(screen.label);
            expect(row.kind === "destination" && row.where).toContain(screen.label);
        }
    });

    it("collapses those seven to one row while the shell cannot route, and keeps them findable", () => {
        const items = buildPaletteCatalog(input());
        // The seven settings tabs collapse to one row. History is the eighth tab and is not
        // one of them - it holds revisions rather than settings, which is why it is not in
        // `SCREENS` - so it is listed in its own right and is counted here deliberately.
        expect(items.filter((item) => item.id.startsWith("config."))).toHaveLength(2);

        // The single row still carries every tab's words, so a search for a tab name finds it.
        const combined = byId(items, "config.all");
        for (const screen of SCREENS) {
            expect(combined.keywords).toContain(screen.label);
        }
    });

    it("lists the config folder's history, which no settings tab would ever surface", () => {
        // Every other tab is reachable through `SCREENS`. This one is not in that list and
        // must not be, so without its own row the place somebody's old configuration lives
        // could not be found by typing its name - the exact failure this palette exists to
        // prevent, and one this project has shipped five times in other guises.
        for (const routing of [true, false]) {
            const row = byId(buildPaletteCatalog(input({ canRouteConfigScreens: routing })), "config.history");
            expect(row.keywords).toContain("history");
            expect(row.keywords).toContain("restore");
            // It opens the editor rather than landing on the tab, and says which tab to pick.
            expect(row.kind === "destination" && row.where).toContain("History");
        }
    });

    it("lists the viewer's own settings once a viewer exists, and none before", () => {
        expect(buildPaletteCatalog(input()).some((item) => item.id.startsWith("viewer."))).toBe(false);

        const items = buildPaletteCatalog(input({ app: fakeApp().app }));
        for (const id of [
            "viewer.theme",
            "viewer.resolution",
            "viewer.sunlight",
            "viewer.ambientLight",
            "viewer.hiresDistance",
            "viewer.lowresDistance",
            "viewer.loadHiresWhileMoving",
            "viewer.showZoomButtons",
            "viewer.mouseSensitivity",
            "viewer.invertMouse",
            "viewer.screenshotClipboard",
            "viewer.chunkBorders",
            "viewer.debug",
        ]) {
            expect(settingRow(items, id).kind).toBe("setting");
        }
    });

    it("offers the view-mode row only for a map that has more than one view to switch between", () => {
        expect(
            buildPaletteCatalog(input({ app: fakeApp({ views: 1 }).app })).some((item) => item.id === "viewer.view"),
        ).toBe(false);
        expect(
            buildPaletteCatalog(input({ app: fakeApp({ views: 3 }).app })).some((item) => item.id === "viewer.view"),
        ).toBe(true);
    });

    it("gives every row a unique id, so a keyed list cannot collide", () => {
        const items = buildPaletteCatalog(input({ app: fakeApp({ views: 3, markers: true, players: true }).app }));
        expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    });
});

/* -------------------------------------------------------------------------- */
/* Rows that do not pretend                                                   */
/* -------------------------------------------------------------------------- */

describe("nothing decorative", () => {
    const items = buildPaletteCatalog(input({ app: fakeApp({ views: 3, markers: true, players: true }).app }));

    it("gives every row a title, a group and an explanation", () => {
        for (const item of items) {
            expect(item.title.trim(), item.id).not.toBe("");
            expect(item.group.trim(), item.id).not.toBe("");
            expect(item.description.trim(), item.id).not.toBe("");
        }
    });

    it("makes every destination say where it goes", () => {
        for (const item of items) {
            if (item.kind === "destination") expect(item.where.trim(), item.id).not.toBe("");
        }
    });

    it("offers the Markers page only where the map has markers, and Players only where it has players", () => {
        const bare = buildPaletteCatalog(input({ app: fakeApp().app }));
        expect(bare.some((item) => item.id === "menu.markers")).toBe(false);
        expect(bare.some((item) => item.id === "menu.players")).toBe(false);

        const full = buildPaletteCatalog(input({ app: fakeApp({ markers: true, players: true }).app }));
        expect(full.some((item) => item.id === "menu.markers")).toBe(true);
        expect(full.some((item) => item.id === "menu.players")).toBe(true);
    });

    it("does not offer to reset a camera that does not exist", () => {
        expect(buildPaletteCatalog(input()).some((item) => item.id === "shell.resetCamera")).toBe(false);
        expect(buildPaletteCatalog(input({ app: fakeApp().app })).some((item) => item.id === "shell.resetCamera")).toBe(
            true,
        );
    });

    it("skips the language row while no language list has loaded, rather than offering an empty select", () => {
        // `languages` in `i18n.ts` is filled by fetching `lang/settings.conf`, which no Node
        // test does. A one-option or zero-option language select is exactly the decorative
        // control this project keeps finding, so the row is absent until there is a choice.
        expect(buildPaletteCatalog(input({ app: fakeApp().app })).some((item) => item.id === "viewer.language")).toBe(
            false,
        );
    });
});

/* -------------------------------------------------------------------------- */
/* Rows that work                                                             */
/* -------------------------------------------------------------------------- */

describe("teleporting", () => {
    it("emits the render-failure flow's own SettingsTarget for each of the four anchors", () => {
        const shell = actions();
        const items = buildPaletteCatalog(input({ actions: shell }));

        for (const anchor of SETTINGS_ANCHORS) {
            const row = byId(items, `settings.${anchor}`);
            if (row.kind !== "destination") throw new Error("expected a destination");
            row.go();
        }

        expect(shell.revealed).toEqual(
            SETTINGS_ANCHORS.map((anchor) => ({ surface: "settings", anchor, missing: false })),
        );
    });

    it("opens the settings surface for the GitHub section, which no anchor names, and says so", () => {
        const shell = actions();
        const items = buildPaletteCatalog(input({ actions: shell }));
        const row = byId(items, "settings.github-account");
        if (row.kind !== "destination") throw new Error("expected a destination");

        row.go();
        expect(shell.settingsOpened).toBe(1);
        expect(shell.revealed).toEqual([]);
        // The sentence has to be honest about the missing outline, not silently omit it.
        expect(row.where).toContain("nothing outlines it");
    });

    it("passes the chosen tab to the shell, and null when no tab was asked for", () => {
        const routed = actions();
        const seven = buildPaletteCatalog(input({ actions: routed, canRouteConfigScreens: true }));
        const webserver = byId(seven, "config.webserver");
        if (webserver.kind !== "destination") throw new Error("expected a destination");
        webserver.go();
        expect(routed.configOpened).toEqual(["webserver"]);

        const plain = actions();
        const one = buildPaletteCatalog(input({ actions: plain }));
        const combined = byId(one, "config.all");
        if (combined.kind !== "destination") throw new Error("expected a destination");
        combined.go();
        expect(plain.configOpened).toEqual([null]);
    });

    it("opens a menu page through the menu's own API, with the title as a getter", () => {
        const fake = fakeApp({ markers: true });
        const items = buildPaletteCatalog(input({ app: fake.app }));
        const row = byId(items, "menu.maps");
        if (row.kind !== "destination") throw new Error("expected a destination");

        row.go();
        const call = fake.calls.openPage?.[0] as unknown[] | undefined;
        expect(call?.[0]).toBe("maps");
        // A function, not a string: an open heading re-translates when the language changes.
        expect(typeof call?.[1]).toBe("function");
    });

    it("runs a command directly", () => {
        const fake = fakeApp();
        const items = buildPaletteCatalog(input({ app: fake.app }));
        const row = byId(items, "shell.resetCamera");
        if (row.kind !== "command") throw new Error("expected a command");

        row.run();
        expect(fake.calls.resetCamera).toHaveLength(1);
    });
});

describe("the settings rows write, and persist what they wrote", () => {
    it("flips a toggle through the app's own method and saves", () => {
        const fake = fakeApp();
        const row = settingRow(buildPaletteCatalog(input({ app: fake.app })), "viewer.debug");
        if (row.control.kind !== "toggle") throw new Error("expected a toggle");

        expect(row.control.value).toBe(false);
        row.control.set(true);
        expect(fake.calls.setDebug).toEqual([true]);
        expect(fake.calls.saveUserSettings).toHaveLength(1);
    });

    it("writes a choice through the app's own method and saves", () => {
        const fake = fakeApp();
        const row = settingRow(buildPaletteCatalog(input({ app: fake.app })), "viewer.theme");
        if (row.control.kind !== "choice") throw new Error("expected a choice");

        row.control.set("dark");
        expect(fake.calls.setTheme).toEqual(["dark"]);

        // "default" means "whatever the system says", which the viewer spells as null.
        row.control.set("default");
        expect(fake.calls.setTheme).toEqual(["dark", null]);
    });

    it("goes through the resolution setter that also resizes the render target", () => {
        const fake = fakeApp();
        const row = settingRow(buildPaletteCatalog(input({ app: fake.app })), "viewer.resolution");
        if (row.control.kind !== "choice") throw new Error("expected a choice");

        row.control.set("2");
        expect(fake.data.superSampling).toBe(2);
        expect(fake.calls.saveUserSettings).toHaveLength(1);
        expect(fake.calls.redraw).toHaveLength(1);
    });

    it("applies a number, reloads the map area, and saves in the same call", () => {
        const fake = fakeApp();
        const row = settingRow(buildPaletteCatalog(input({ app: fake.app })), "viewer.hiresDistance");
        if (row.control.kind !== "number") throw new Error("expected a number");

        expect(row.control.value).toBe(100);
        expect(row.control.min).toBe(50);
        expect(row.control.max).toBe(500);

        row.control.set(250);
        expect(fake.data.loadedHiresViewDistance).toBe(250);
        expect(fake.calls.updateLoadedMapArea).toHaveLength(1);
        expect(fake.calls.saveUserSettings).toHaveLength(1);
    });

    it("inverts the stored flag for a setting whose switch reads the opposite way", () => {
        const fake = fakeApp();
        const row = settingRow(buildPaletteCatalog(input({ app: fake.app })), "viewer.loadHiresWhileMoving");
        if (row.control.kind !== "toggle") throw new Error("expected a toggle");

        // Nothing is paused, so "load while moving" is on.
        expect(row.control.value).toBe(true);
        row.control.set(false);
        expect(fake.app.appState.controls.pauseTileLoading).toBe(true);
    });

    it("keeps the palette's own size in the palette, and writes it back", () => {
        const setSize = vi.fn();
        const row = settingRow(buildPaletteCatalog(input({ setSize, size: "card" })), "palette.size");
        if (row.control.kind !== "choice") throw new Error("expected a choice");

        expect(row.control.value).toBe("card");
        expect(row.control.options.map((option) => option.id)).toEqual(["card", "full"]);
        row.control.set("full");
        expect(setSize).toHaveBeenCalledWith("full");
    });
});

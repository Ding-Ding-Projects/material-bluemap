import "./BlueMap";
import { MapViewer } from "./MapViewer";
import { MapControls } from "./controls/map/MapControls";
import { FreeFlightControls } from "./controls/freeflight/FreeFlightControls";
import { MathUtils, Vector3 } from "three";
import type { Intersection, Object3D } from "three";
import { Map as BlueMapMap } from "./map/Map";
import type { MapData } from "./map/Map";
import { alert, animate, EasingFunctions, hashTile } from "./util/Utils";
import type { Animation } from "./util/Utils";
import { MainMenu } from "./MainMenu";
import { PopupMarker } from "./PopupMarker";
import { MarkerSet } from "./markers/MarkerSet";
import { getLocalStorage, round, setLocalStorage } from "./Utils";
import { RevalidatingFileLoader } from "./util/RevalidatingFileLoader";
import { i18n, setLanguage } from "./util/i18n";
import { PlayerMarkerManager } from "./markers/PlayerMarkerManager";
import { NormalMarkerManager } from "./markers/NormalMarkerManager";
import { makeReactive } from "./util/reactivity";
import type { ControlsLike } from "./controls/ControlsManager";

export interface BlueMapAppSettings {
    version: string;
    useCookies: boolean;
    defaultToFlatView: boolean;
    resolutionDefault: number;
    minZoomDistance: number;
    maxZoomDistance: number;
    hiresSliderMax: number;
    hiresSliderDefault: number;
    hiresSliderMin: number;
    lowresSliderMax: number;
    lowresSliderDefault: number;
    lowresSliderMin: number;
    startLocation?: string;
    mapDataRoot: string;
    liveDataRoot: string;
    maps: string[];
    scripts: string[];
    styles: string[];
    clientDecompression: boolean;
}

export interface BlueMapAppState {
    controls: {
        state: string;
        mouseSensitivity: number;
        showZoomButtons: boolean;
        invertMouse: boolean;
        pauseTileLoading: boolean;
    };
    menu: MainMenu;
    maps: MapData[];
    theme: string | null;
    screenshot: {
        clipboard: boolean;
    };
    debug: boolean;
}

export interface BlueMapAppOptions {
    /**
     * Security deviation: upstream injects the "scripts" and "styles" listed in
     * settings.json straight into the document. This port only injects them if this
     * callback explicitly allows it; by default everything is blocked (with a
     * console.warn).
     */
    allowRemoteInjection?: (kind: "script" | "style", url: string) => boolean;
    /**
     * Port addition: base path that settings.json and relative mapDataRoot/liveDataRoot
     * values resolve against (e.g. "/remote/{profile}" behind the desktop app's embedded
     * proxy). Upstream always loads relative to the document; an empty value keeps that
     * behavior.
     */
    dataRoot?: string;
}

interface PlayerLike {
    playerUuid: string;
    foreign?: boolean;
}

interface PlayerDataEntry {
    uuid: string;
    foreign: boolean;
}

export interface PlayerData {
    players?: PlayerDataEntry[];
}

type FollowControls = ControlsLike & {
    data?: { followingPlayer?: PlayerLike | null };
    followPlayerMarker?(marker: object): void;
    stopFollowingPlayerMarker?(): void;
};

export class BlueMapApp {
    events: Element;
    mapViewer: MapViewer;
    mapControls: MapControls;
    freeFlightControls: FreeFlightControls;

    playerMarkerManager: PlayerMarkerManager | null;
    markerFileManager: NormalMarkerManager | null;

    mapEventSource: EventSource | null;

    settings: BlueMapAppSettings | null;
    savedUserSettings: Map<string, unknown>;

    maps: BlueMapMap[];
    mapsMap: Map<string, BlueMapMap>;

    lastCameraMove: number;

    mainMenu: MainMenu;
    appState: BlueMapAppState;

    popupMarkerSet: MarkerSet;
    popupMarker: PopupMarker;

    updateLoop: ReturnType<typeof setTimeout> | null;

    hashUpdateTimeout: ReturnType<typeof setTimeout> | null;
    viewAnimation: Animation | null;

    allowRemoteInjection: (kind: "script" | "style", url: string) => boolean;
    dataRoot: string;

    constructor(rootElement: Element, options: BlueMapAppOptions = {}) {
        this.events = rootElement;

        this.allowRemoteInjection = options.allowRemoteInjection ?? (() => false);
        this.dataRoot = (options.dataRoot ?? "").replace(/\/+$/, "");

        this.mapViewer = new MapViewer(rootElement, this.events);

        this.mapControls = new MapControls(this.mapViewer.renderer.domElement, rootElement);
        this.freeFlightControls = new FreeFlightControls(this.mapViewer.renderer.domElement);

        this.playerMarkerManager = null;
        this.markerFileManager = null;

        this.mapEventSource = null;

        this.settings = null;
        this.savedUserSettings = new Map();

        this.maps = [];
        this.mapsMap = new Map();

        this.lastCameraMove = 0;

        this.mainMenu = makeReactive(new MainMenu());

        this.appState = makeReactive<BlueMapAppState>({
            controls: {
                state: "perspective",
                mouseSensitivity: 1,
                showZoomButtons: true,
                invertMouse: false,
                pauseTileLoading: false,
            },
            menu: this.mainMenu,
            maps: [],
            theme: null,
            screenshot: {
                clipboard: true,
            },
            debug: false,
        });

        // close SSE connection when the page is closed
        window.addEventListener("beforeunload", () => {
            if (this.mapEventSource) this.mapEventSource.close();
        });

        // init
        this.updateControlsSettings();
        this.initGeneralEvents();

        // popup on click
        this.popupMarkerSet = new MarkerSet("bm-popup-set");
        this.popupMarkerSet.data.toggleable = false;
        this.popupMarker = new PopupMarker("bm-popup", this.appState, this.events);
        this.popupMarkerSet.add(this.popupMarker);
        this.mapViewer.markers.add(this.popupMarkerSet);

        this.updateLoop = null;

        this.hashUpdateTimeout = null;
        this.viewAnimation = null;
    }

    async load(): Promise<void> {
        const oldMaps = this.maps;
        this.maps = [];
        this.appState.maps.splice(0, this.appState.maps.length);
        this.mapsMap.clear();

        // load settings
        await this.getSettings();
        this.mapControls.minDistance = this.settings!.minZoomDistance;
        this.mapControls.maxDistance = this.settings!.maxZoomDistance;

        // load settings-styles
        if (this.settings!.styles)
            for (const styleUrl of this.settings!.styles) {
                // security deviation: only inject remote styles if explicitly allowed
                if (!this.allowRemoteInjection("style", styleUrl)) {
                    console.warn(`[BlueMap] Blocked injection of settings.json style: ${styleUrl}`);
                    continue;
                }
                const styleElement = document.createElement("link");
                styleElement.rel = "stylesheet";
                styleElement.href = styleUrl;
                alert(this.events, "Loading style: " + styleUrl, "fine");
                document.head.appendChild(styleElement);
            }

        // unload loaded maps
        await this.mapViewer.switchMap(null);
        oldMaps.forEach((map) => map.dispose());

        // load user settings
        await this.loadUserSettings();

        // load maps
        this.maps = await this.loadMaps();
        for (const map of this.maps) {
            this.mapsMap.set(map.data.id, map);
            this.appState.maps.push(map.data);
        }

        // switch to map
        try {
            if (!(await this.loadPageAddress())) {
                if (this.maps.length > 0) await this.switchMap(this.maps[0]!.data.id);
                this.resetCamera();
            }
        } catch (e) {
            console.error("Failed to load map!", e);
        }

        // map position address
        window.addEventListener("hashchange", this.loadPageAddress);
        this.events.addEventListener("bluemapCameraMoved", this.cameraMoved);
        this.events.addEventListener("bluemapMapInteraction", this.mapInteraction);

        // start app update loop
        if (this.updateLoop) clearTimeout(this.updateLoop);
        this.updateLoop = setTimeout(this.update, 1000);

        // save user settings
        this.saveUserSettings();

        // load settings-scripts
        if (this.settings!.scripts)
            for (const scriptUrl of this.settings!.scripts) {
                // security deviation: only inject remote scripts if explicitly allowed
                if (!this.allowRemoteInjection("script", scriptUrl)) {
                    console.warn(
                        `[BlueMap] Blocked injection of settings.json script: ${scriptUrl}`,
                    );
                    continue;
                }
                const scriptElement = document.createElement("script");
                scriptElement.src = scriptUrl;
                alert(this.events, "Loading script: " + scriptUrl, "fine");
                document.body.appendChild(scriptElement);
            }
    }

    update = async (): Promise<void> => {
        await this.followPlayerMarkerWorld();
        this.updateLoop = setTimeout(this.update, 1000);
    };

    async followPlayerMarkerWorld(): Promise<void> {
        const player = (this.mapViewer.controlsManager.controls as FollowControls | null)?.data
            ?.followingPlayer;

        if (this.mapViewer.map && player) {
            if (player.foreign) {
                const matchingMap = await this.findPlayerMap(player.playerUuid);
                if (matchingMap) {
                    this.mainMenu.closeAll();
                    await this.switchMap(matchingMap.data.id, false);
                    const playerMarker = this.playerMarkerManager!.getPlayerMarker(
                        player.playerUuid,
                    );
                    const controls = this.mapViewer.controlsManager.controls as FollowControls;
                    if (playerMarker && controls.followPlayerMarker)
                        controls.followPlayerMarker(playerMarker);
                } else {
                    const controls = this.mapViewer.controlsManager.controls as FollowControls;
                    if (controls.stopFollowingPlayerMarker) controls.stopFollowingPlayerMarker();
                }
            }
        }
    }

    async findPlayerMap(playerUuid: string): Promise<BlueMapMap | null> {
        let matchingMap: BlueMapMap | null = null;

        // search for the map that contains the player
        if (this.maps.length < 20) {
            for (const map of this.maps) {
                const playerData = await this.loadPlayerData(map);
                if (!Array.isArray(playerData.players)) continue;
                for (const p of playerData.players) {
                    if (p.uuid === playerUuid && !p.foreign) {
                        matchingMap = map;
                        break;
                    }
                }

                if (matchingMap) break;
            }
        }

        return matchingMap;
    }

    async switchMap(mapId: string, resetCamera: boolean = true): Promise<void> {
        const map = this.mapsMap.get(mapId);
        if (!map) return Promise.reject(`There is no map with the id "${mapId}" loaded!`);

        if (this.playerMarkerManager) this.playerMarkerManager.dispose();
        if (this.markerFileManager) this.markerFileManager.dispose();

        await this.mapViewer.switchMap(map);

        if (resetCamera || !this.mapViewer.map!.hasView(this.appState.controls.state))
            this.resetCamera();

        this.updatePageAddress();

        await Promise.all([
            this.initPlayerMarkerManager(),
            this.initMarkerFileManager(),
            this.initEventSource(),
        ]);
    }

    resetCamera(): void {
        const map = this.mapViewer.map;
        const controls = this.mapViewer.controlsManager;

        if (map) {
            controls.position.set(map.data.startPos.x, 0, map.data.startPos.z);
            controls.distance = 1500;
            controls.angle = 0;
            controls.rotation = 0;
            controls.tilt = 0;
            controls.ortho = 0;
        }

        controls.controls = this.mapControls;
        this.appState.controls.state = "perspective";

        if (this.settings!.defaultToFlatView && map!.hasView("flat")) {
            this.setFlatView();
        } else if (!map!.hasView("perspective")) {
            if (map!.hasView("flat")) this.setFlatView();
            else this.setFreeFlight();
        }

        this.updatePageAddress();
    }

    async loadMaps(): Promise<BlueMapMap[]> {
        const settings = this.settings!;
        const maps: BlueMapMap[] = [];

        // create maps
        if (settings.maps !== undefined) {
            const loadingPromises = settings.maps.map((mapId) => {
                const map = new BlueMapMap(
                    mapId,
                    settings.mapDataRoot + "/" + mapId,
                    settings.liveDataRoot + "/" + mapId,
                    this.loadBlocker,
                    this.mapViewer.events,
                    this.settings!.clientDecompression,
                );
                maps.push(map);

                return map.loadSettings(this.mapViewer.revalidatedUrls).catch((error) => {
                    alert(
                        this.events,
                        `Failed to load settings for map '${map.data.id}':` + error,
                        "warning",
                    );
                });
            });

            await Promise.all(loadingPromises);
        }

        // sort maps
        maps.sort((map1, map2) => {
            const sort = map1.data.sorting - map2.data.sorting;
            if (isNaN(sort)) return 0;
            return sort;
        });

        return maps;
    }

    async getSettings(): Promise<BlueMapAppSettings> {
        if (!this.settings) {
            const loaded = await this.loadSettings();
            this.settings = {
                version: "?",
                useCookies: false,
                defaultToFlatView: false,
                resolutionDefault: 1.0,
                minZoomDistance: 5,
                maxZoomDistance: 100000,
                hiresSliderMax: 500,
                hiresSliderDefault: 100,
                hiresSliderMin: 0,
                lowresSliderMax: 7000,
                lowresSliderDefault: 2000,
                lowresSliderMin: 500,
                mapDataRoot: "maps",
                liveDataRoot: "maps",
                maps: ["world", "world_the_end", "world_nether"],
                scripts: [],
                styles: [],
                clientDecompression: false,
                ...loaded,
            };
            // Port addition: resolve relative data roots against the configured dataRoot
            // so the whole HTTP surface can be mounted behind a prefix (remote proxy).
            this.settings.mapDataRoot = this.resolveDataUrl(this.settings.mapDataRoot);
            this.settings.liveDataRoot = this.resolveDataUrl(this.settings.liveDataRoot);
        }

        return this.settings;
    }

    /** Prefixes a relative path with this.dataRoot; absolute URLs/paths pass through. */
    resolveDataUrl(path: string): string {
        if (!this.dataRoot) return path;
        if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(path)) return path;
        return this.dataRoot + "/" + path;
    }

    /**
     * Port addition: tears down timers, live connections, and marker managers so the
     * host UI can discard this instance (e.g. when switching server profiles). Upstream
     * instances live for the whole page lifetime and have no equivalent.
     */
    dispose(): void {
        if (this.updateLoop) {
            clearTimeout(this.updateLoop);
            this.updateLoop = null;
        }
        if (this.hashUpdateTimeout) {
            clearTimeout(this.hashUpdateTimeout);
            this.hashUpdateTimeout = null;
        }
        this.mapEventSource?.close();
        this.mapEventSource = null;
        this.playerMarkerManager?.dispose();
        this.markerFileManager?.dispose();
    }

    loadSettings(): Promise<Partial<BlueMapAppSettings>> {
        return new Promise((resolve, reject) => {
            const loader = new RevalidatingFileLoader();
            loader.setRevalidatedUrls(new Set()); // force no-cache requests
            loader.setResponseType("json");
            loader.load(
                this.resolveDataUrl("settings.json"),
                (data) => resolve(data as Partial<BlueMapAppSettings>),
                () => {},
                () => reject("Failed to load the settings.json!"),
            );
        });
    }

    loadPlayerData(map: BlueMapMap): Promise<PlayerData> {
        return new Promise((resolve, reject) => {
            const loader = new RevalidatingFileLoader();
            loader.setRevalidatedUrls(new Set()); // force no-cache requests
            loader.setResponseType("json");
            loader.load(
                map.data.liveDataRoot + "/live/players.json",
                (fileData) => {
                    if (!fileData)
                        reject(
                            `Failed to parse '${(this as unknown as { fileUrl?: string }).fileUrl}'!`,
                        );
                    else resolve(fileData as PlayerData);
                },
                () => {},
                () =>
                    reject(
                        `Failed to load '${(this as unknown as { fileUrl?: string }).fileUrl}'!`,
                    ),
            );
        });
    }

    initEventSource(): void {
        if (this.mapEventSource) {
            this.mapEventSource.close();
        }

        const map = this.mapViewer.map;
        if (!map) return;

        this.mapEventSource = new EventSource(map.data.liveDataRoot + "/live/sse");
        this.mapEventSource.addEventListener("error", () => {
            alert(this.events, "SSE event source error - enabling polling", "debug");
            this.playerMarkerManager!.resumeAutoUpdates();
            this.markerFileManager!.resumeAutoUpdates();
        });
        this.mapEventSource.addEventListener("open", () => {
            alert(this.events, "Connected to SSE event source - disabling polling", "debug");
            this.playerMarkerManager!.pauseAutoUpdates();
            this.markerFileManager!.pauseAutoUpdates();
        });

        this.mapEventSource.addEventListener("tile", ({ data }) => {
            const parsed = JSON.parse(data) as { lod: number; x: number; y: number };

            const mgr =
                parsed.lod > 0 ? map.lowresTileManager![parsed.lod - 1] : map.hiresTileManager;
            if (mgr && !mgr.unloaded) {
                const tilehash = hashTile(parsed.x, parsed.y);
                const tile = mgr.tiles.get(tilehash);
                if (tile && !tile.loading) {
                    tile.load(mgr.tileLoader, true);
                }
            }
        });

        this.mapEventSource.addEventListener("player", ({ data }) => {
            this.playerMarkerManager!.updateFromData(JSON.parse(data));
        });

        this.mapEventSource.addEventListener("marker", ({ data }) => {
            this.markerFileManager!.updateFromData(JSON.parse(data));
        });
    }

    initPlayerMarkerManager(): Promise<void> | void {
        if (this.playerMarkerManager) this.playerMarkerManager.dispose();

        const map = this.mapViewer.map;
        if (!map) return;

        this.playerMarkerManager = new PlayerMarkerManager(
            this.mapViewer.markers,
            map.data.liveDataRoot + "/live/players.json",
            map.data.mapDataRoot + "/assets/playerheads/",
            this.events,
            true,
        );
        this.playerMarkerManager.setAutoUpdateInterval(0);
        return this.playerMarkerManager
            .update()
            .then(() => {
                this.playerMarkerManager!.setAutoUpdateInterval(1000);
            })
            .catch((e: unknown) => {
                alert(this.events, e, "warning");
                this.playerMarkerManager!.dispose();
            });
    }

    initMarkerFileManager(): Promise<void> | void {
        if (this.markerFileManager) this.markerFileManager.dispose();

        const map = this.mapViewer.map;
        if (!map) return;

        this.markerFileManager = new NormalMarkerManager(
            this.mapViewer.markers,
            map.data.liveDataRoot + "/live/markers.json",
            this.events,
            true,
        );
        return this.markerFileManager
            .update()
            .then(() => {
                this.markerFileManager!.setAutoUpdateInterval(1000 * 10);
            })
            .catch((e: unknown) => {
                alert(this.events, e, "warning");
                this.markerFileManager!.dispose();
            });
    }

    updateControlsSettings(): void {
        const mouseInvert = this.appState.controls.invertMouse ? -1 : 1;

        this.freeFlightControls.mouseRotate.speedCapture =
            -1.5 * this.appState.controls.mouseSensitivity;
        this.freeFlightControls.mouseAngle.speedCapture =
            -1.5 * this.appState.controls.mouseSensitivity * mouseInvert;
        this.freeFlightControls.mouseRotate.speedRight =
            -2 * this.appState.controls.mouseSensitivity;
        this.freeFlightControls.mouseAngle.speedRight =
            -2 * this.appState.controls.mouseSensitivity * mouseInvert;
    }

    initGeneralEvents(): void {
        //close menu on fullscreen
        document.addEventListener("fullscreenchange", () => {
            if (document.fullscreenElement) {
                this.mainMenu.closeAll();
            }
        });
    }

    setPerspectiveView(transition: number = 0, minDistance: number = 5): void {
        if (!this.mapViewer.map) return;
        if (!this.mapViewer.map.data.perspectiveView) return;
        if (this.viewAnimation) this.viewAnimation.cancel();

        const cm = this.mapViewer.controlsManager;
        cm.controls = null;

        const startDistance = cm.distance;
        const targetDistance = Math.max(5, minDistance, startDistance);

        const startY = cm.position.y;
        const targetY = MathUtils.lerp(
            (this.mapViewer.map.terrainHeightAt(cm.position.x, cm.position.z) as number) + 3,
            0,
            targetDistance / 500,
        );

        const startAngle = cm.angle;
        const targetAngle = Math.min(
            Math.PI / 2,
            startAngle,
            MapControls.getMaxPerspectiveAngleForDistance(targetDistance),
        );

        const startOrtho = cm.ortho;
        const startTilt = cm.tilt;

        this.viewAnimation = animate(
            (p) => {
                const ep = EasingFunctions.easeInOutQuad!(p);
                cm.position.y = MathUtils.lerp(startY, targetY, ep);
                cm.distance = MathUtils.lerp(startDistance, targetDistance, ep);
                cm.angle = MathUtils.lerp(startAngle, targetAngle, ep);
                cm.ortho = MathUtils.lerp(startOrtho, 0, p);
                cm.tilt = MathUtils.lerp(startTilt, 0, ep);
            },
            transition,
            (finished) => {
                this.mapControls.reset();
                if (finished) {
                    cm.controls = this.mapControls;
                    this.updatePageAddress();
                }
            },
        );

        this.appState.controls.state = "perspective";
    }

    setFlatView(transition: number = 0, minDistance: number = 5): void {
        if (!this.mapViewer.map) return;
        if (!this.mapViewer.map.data.flatView) return;
        if (this.viewAnimation) this.viewAnimation.cancel();

        const cm = this.mapViewer.controlsManager;
        cm.controls = null;

        const startDistance = cm.distance;
        const targetDistance = Math.max(5, minDistance, startDistance);

        const startRotation = cm.rotation;
        const startAngle = cm.angle;
        const startOrtho = cm.ortho;
        const startTilt = cm.tilt;

        this.viewAnimation = animate(
            (p) => {
                const ep = EasingFunctions.easeInOutQuad!(p);
                cm.distance = MathUtils.lerp(startDistance, targetDistance, ep);
                cm.rotation = MathUtils.lerp(startRotation, 0, ep);
                cm.angle = MathUtils.lerp(startAngle, 0, ep);
                cm.ortho = MathUtils.lerp(startOrtho, 1, p);
                cm.tilt = MathUtils.lerp(startTilt, 0, ep);
            },
            transition,
            (finished) => {
                this.mapControls.reset();
                if (finished) {
                    cm.controls = this.mapControls;
                    this.updatePageAddress();
                }
            },
        );

        this.appState.controls.state = "flat";
    }

    setFreeFlight(transition: number = 0, targetY: number | undefined = undefined): void {
        if (!this.mapViewer.map) return;
        if (!this.mapViewer.map.data.freeFlightView) return;
        if (this.viewAnimation) this.viewAnimation.cancel();

        const cm = this.mapViewer.controlsManager;
        cm.controls = null;

        const startDistance = cm.distance;

        const startY = cm.position.y;
        if (!targetY)
            targetY =
                (this.mapViewer.map.terrainHeightAt(cm.position.x, cm.position.z) as number) + 3 ||
                startY;

        const startAngle = cm.angle;
        const targetAngle = Math.PI / 2;

        const startOrtho = cm.ortho;
        const startTilt = cm.tilt;

        this.viewAnimation = animate(
            (p) => {
                const ep = EasingFunctions.easeInOutQuad!(p);
                cm.position.y = MathUtils.lerp(startY, targetY!, ep);
                cm.distance = MathUtils.lerp(startDistance, 0, ep);
                cm.angle = MathUtils.lerp(startAngle, targetAngle, ep);
                cm.ortho = MathUtils.lerp(startOrtho, 0, Math.min(p * 2, 1));
                cm.tilt = MathUtils.lerp(startTilt, 0, ep);
            },
            transition,
            (finished) => {
                if (finished) {
                    cm.controls = this.freeFlightControls;
                    this.updatePageAddress();
                }
            },
        );

        this.appState.controls.state = "free";
    }

    setChunkBorders(chunkBorders: boolean): void {
        this.mapViewer.data.uniforms.chunkBorders.value = chunkBorders;
    }

    setDebug(debug: boolean): void {
        this.appState.debug = debug;

        if (debug) {
            this.mapViewer.stats.showPanel(0);
        } else {
            this.mapViewer.stats.showPanel(-1);
        }
    }

    setTheme(theme: string | null): void {
        this.appState.theme = theme;

        if (theme === "light") {
            this.mapViewer.rootElement.classList.remove("theme-dark");
            this.mapViewer.rootElement.classList.remove("theme-contrast");
            this.mapViewer.rootElement.classList.add("theme-light");
        } else if (theme === "dark") {
            this.mapViewer.rootElement.classList.remove("theme-light");
            this.mapViewer.rootElement.classList.remove("theme-contrast");
            this.mapViewer.rootElement.classList.add("theme-dark");
        } else if (theme === "contrast") {
            this.mapViewer.rootElement.classList.remove("theme-light");
            this.mapViewer.rootElement.classList.remove("theme-dark");
            this.mapViewer.rootElement.classList.add("theme-contrast");
        } else {
            this.mapViewer.rootElement.classList.remove("theme-light");
            this.mapViewer.rootElement.classList.remove("theme-dark");
            this.mapViewer.rootElement.classList.remove("theme-contrast");
        }
    }

    setScreenshotClipboard(clipboard: boolean): void {
        this.appState.screenshot.clipboard = clipboard;
    }

    async updateMap(): Promise<void> {
        try {
            this.mapViewer.clearTileCache();
            if (this.mapViewer.map) {
                await this.switchMap(this.mapViewer.map.data.id, false);
            }
            this.saveUserSettings();
        } catch (e) {
            alert(this.events, e, "error");
        }
    }

    resetSettings(): void {
        this.saveUserSetting("resetSettings", true);
        location.reload();
    }

    async loadUserSettings(): Promise<void> {
        if (!isNaN(this.settings!.resolutionDefault))
            this.mapViewer.data.superSampling = this.settings!.resolutionDefault;
        if (!isNaN(this.settings!.hiresSliderDefault))
            this.mapViewer.data.loadedHiresViewDistance = this.settings!.hiresSliderDefault;
        if (!isNaN(this.settings!.lowresSliderDefault))
            this.mapViewer.data.loadedLowresViewDistance = this.settings!.lowresSliderDefault;

        if (!this.settings!.useCookies) return;

        if (this.loadUserSetting("resetSettings", false)) {
            alert(this.events, "Settings reset!", "info");
            this.saveUserSettings();
            return;
        }

        // If it's a reload, we assume the user is troubleshooting and actually
        // wants to fully refresh the map.
        const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        if (entry!.type === "reload") {
            this.mapViewer.clearTileCache();
        }

        this.mapViewer.superSampling = this.loadUserSetting(
            "superSampling",
            this.mapViewer.data.superSampling,
        );
        this.mapViewer.data.loadedHiresViewDistance = this.loadUserSetting(
            "hiresViewDistance",
            this.mapViewer.data.loadedHiresViewDistance,
        );
        this.mapViewer.data.loadedLowresViewDistance = this.loadUserSetting(
            "lowresViewDistance",
            this.mapViewer.data.loadedLowresViewDistance,
        );
        this.mapViewer.updateLoadedMapArea();
        this.appState.controls.mouseSensitivity = this.loadUserSetting(
            "mouseSensitivity",
            this.appState.controls.mouseSensitivity,
        );
        this.appState.controls.invertMouse = this.loadUserSetting(
            "invertMouse",
            this.appState.controls.invertMouse,
        );
        this.appState.controls.pauseTileLoading = this.loadUserSetting(
            "pauseTileLoading",
            this.appState.controls.pauseTileLoading,
        );
        this.appState.controls.showZoomButtons = this.loadUserSetting(
            "showZoomButtons",
            this.appState.controls.showZoomButtons,
        );
        this.updateControlsSettings();
        this.setTheme(this.loadUserSetting("theme", this.appState.theme));
        this.setScreenshotClipboard(
            this.loadUserSetting("screenshotClipboard", this.appState.screenshot.clipboard),
        );
        await setLanguage(this.loadUserSetting("lang", i18n.locale.value));
        this.setChunkBorders(
            this.loadUserSetting("chunkBorders", this.mapViewer.data.uniforms.chunkBorders.value),
        );
        this.setDebug(this.loadUserSetting("debug", this.appState.debug));

        alert(this.events, "Settings loaded!", "info");
    }

    saveUserSettings(): void {
        if (!this.settings!.useCookies) return;

        this.saveUserSetting("resetSettings", false);

        this.saveUserSetting("superSampling", this.mapViewer.data.superSampling);
        this.saveUserSetting("hiresViewDistance", this.mapViewer.data.loadedHiresViewDistance);
        this.saveUserSetting("lowresViewDistance", this.mapViewer.data.loadedLowresViewDistance);
        this.saveUserSetting("mouseSensitivity", this.appState.controls.mouseSensitivity);
        this.saveUserSetting("invertMouse", this.appState.controls.invertMouse);
        this.saveUserSetting("pauseTileLoading", this.appState.controls.pauseTileLoading);
        this.saveUserSetting("showZoomButtons", this.appState.controls.showZoomButtons);
        this.saveUserSetting("theme", this.appState.theme);
        this.saveUserSetting("screenshotClipboard", this.appState.screenshot.clipboard);
        this.saveUserSetting("lang", i18n.locale.value);
        this.saveUserSetting("chunkBorders", this.mapViewer.data.uniforms.chunkBorders.value);
        this.saveUserSetting("debug", this.appState.debug);

        alert(this.events, "Settings saved!", "info");
    }

    loadUserSetting<T>(key: string, defaultValue: T): T {
        const value = getLocalStorage("bluemap-" + key);

        if (value === undefined) return defaultValue;
        return value as T;
    }

    saveUserSetting(key: string, value: unknown): void {
        if (this.savedUserSettings.get(key) !== value) {
            this.savedUserSettings.set(key, value);
            setLocalStorage("bluemap-" + key, value);
        }
    }

    cameraMoved = (): void => {
        if (this.hashUpdateTimeout) clearTimeout(this.hashUpdateTimeout);
        this.hashUpdateTimeout = setTimeout(this.updatePageAddress, 1500);
        this.lastCameraMove = Date.now();
    };

    loadBlocker = async (): Promise<void> => {
        if (!this.appState.controls.pauseTileLoading) return;

        let timeToWait;
        do {
            const timeSinceLastMove = Date.now() - this.lastCameraMove;
            timeToWait = 250 - timeSinceLastMove;
            if (timeToWait > 0) await this.sleep(timeToWait);
        } while (timeToWait > 0);
    };

    sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    updatePageAddress = (): void => {
        let hash = "#";

        if (this.mapViewer.map) {
            hash += this.mapViewer.map.data.id;

            const controls = this.mapViewer.controlsManager;
            hash += ":" + round(controls.position.x, 0);
            hash += ":" + round(controls.position.y, 0);
            hash += ":" + round(controls.position.z, 0);
            hash += ":" + round(controls.distance, 0);
            hash += ":" + round(controls.rotation, 2);
            hash += ":" + round(controls.angle, 2);
            hash += ":" + round(controls.tilt, 2);
            hash += ":" + round(controls.ortho, 0);
            hash += ":" + this.appState.controls.state;
        }

        history.replaceState(undefined, undefined as unknown as string, hash);

        document.title = i18n.t("pageTitle", {
            map: this.mapViewer.map ? this.mapViewer.map.data.name : "?",
            version: this.settings!.version,
        });
    };

    loadPageAddress = async (): Promise<boolean> => {
        const hash = window.location.hash?.substring(1) || this.settings!.startLocation || "";
        const values = hash.split(":");

        // only world is provided
        if (
            values.length === 1 &&
            (!this.mapViewer.map || this.mapViewer.map.data.id !== values[0])
        ) {
            try {
                await this.switchMap(values[0]!);
            } catch {
                return false;
            }

            return true;
        }

        // load full location
        if (values.length !== 10) return false;

        const controls = this.mapViewer.controlsManager;
        controls.controls = null;

        if (!this.mapViewer.map || this.mapViewer.map.data.id !== values[0]) {
            try {
                await this.switchMap(values[0]!);
            } catch {
                return false;
            }
        }

        switch (values[9]) {
            case "flat":
                this.setFlatView(0);
                break;
            case "free":
                this.setFreeFlight(0, controls.position.y);
                break;
            default:
                this.setPerspectiveView(0);
                break;
        }

        controls.position.x = parseFloat(values[1]!);
        controls.position.y = parseFloat(values[2]!);
        controls.position.z = parseFloat(values[3]!);
        controls.distance = parseFloat(values[4]!);
        controls.rotation = parseFloat(values[5]!);
        controls.angle = parseFloat(values[6]!);
        controls.tilt = parseFloat(values[7]!);
        controls.ortho = parseFloat(values[8]!);

        this.updatePageAddress();
        this.mapViewer.updateLoadedMapArea();

        return true;
    };

    mapInteraction = (event: Event): void => {
        const detail = (
            event as CustomEvent<{
                data: { doubleTap?: boolean };
                hit?: Intersection | null;
                object?: Object3D;
            }>
        ).detail;

        if (detail.data.doubleTap) {
            const cm = this.mapViewer.controlsManager;
            const pos = detail.hit?.point || detail.object?.getWorldPosition(new Vector3());
            if (!pos) return;

            const startDistance = cm.distance;
            const targetDistance = Math.max(startDistance * 0.25, 5);

            const startX = cm.position.x;
            const targetX = pos.x;

            const startZ = cm.position.z;
            const targetZ = pos.z;

            this.viewAnimation = animate((p) => {
                const ep = EasingFunctions.easeInOutQuad!(p);
                cm.distance = MathUtils.lerp(startDistance, targetDistance, ep);
                cm.position.x = MathUtils.lerp(startX, targetX, ep);
                cm.position.z = MathUtils.lerp(startZ, targetZ, ep);
            }, 500);
        }
    };

    takeScreenshot = (): void => {
        const link = document.createElement("a");
        link.download = "bluemap-screenshot.png";
        link.href = this.mapViewer.renderer.domElement.toDataURL("image/png");
        link.click();

        if (this.appState.screenshot.clipboard) {
            this.mapViewer.renderer.domElement.toBlob((blob) => {
                navigator.clipboard
                    .write([new ClipboardItem({ ["image/png"]: blob! })])
                    .catch((e) => {
                        alert(this.events, "Failed to copy screenshot to clipboard: " + e, "error");
                    });
            });
        }
    };
}

import {
    ClampToEdgeWrapping,
    Color,
    FrontSide,
    NearestFilter,
    NearestMipMapLinearFilter,
    Raycaster,
    ShaderMaterial,
    Texture,
    Vector3,
} from "three";
import type { IUniform } from "three";
import { RevalidatingFileLoader } from "../util/RevalidatingFileLoader";
import { alert, dispatchEvent, getPixel, hashTile, stringToImage, vecArrToObj } from "../util/Utils";
import { TileManager } from "./TileManager";
import { TileLoader } from "./TileLoader";
import { LowresTileLoader } from "./LowresTileLoader";
import { makeReactive } from "../util/reactivity";
import { TextureAnimation } from "./TextureAnimation";
import type { TextureAnimationData } from "./TextureAnimation";
import type { Tile } from "./Tile";

export interface MapData {
    id: string;
    sorting: number;
    mapDataRoot: string;
    liveDataRoot: string;
    settingsUrl: string;
    texturesUrl: string;
    name: string;
    startPos: { x: number; z: number };
    skyColor: Color;
    voidColor: Color;
    ambientLight: number;
    skyLight: number;
    hires: {
        tileSize: { x: number; z: number };
        scale: { x: number; z: number };
        translate: { x: number; z: number };
    };
    lowres: {
        tileSize: { x: number; z: number };
        lodFactor: number;
        lodCount: number;
    };
    perspectiveView: boolean;
    flatView: boolean;
    freeFlightView: boolean;
    views: string[];
    clientDecompression: boolean;
}

export interface MapSettings {
    name?: string;
    sorting?: number;
    startPos?: number[];
    skyColor?: number[];
    voidColor?: number[];
    ambientLight?: number;
    skyLight?: number;
    hires?: {
        tileSize?: number[];
        scale?: number[];
        translate?: number[];
    };
    lowres?: {
        tileSize?: number[];
        lodFactor?: number;
        lodCount?: number;
    };
    perspectiveView?: boolean;
    flatView?: boolean;
    freeFlightView?: boolean;
}

export interface TextureData {
    resourcePath: string;
    color: number[];
    halfTransparent: boolean;
    texture: string;
    animation?: Partial<TextureAnimationData> | undefined;
}

export class Map {
    declare readonly isMap: boolean;

    loadBlocker: () => Promise<void>;
    events: EventTarget | null;

    data: MapData;

    raycaster: Raycaster;

    hiresMaterial: ShaderMaterial[] | null;
    lowresMaterial: ShaderMaterial | null;
    loadedTextures: Texture[];

    animations: TextureAnimation[];

    hiresTileManager: TileManager | null;
    lowresTileManager: TileManager[] | null;

    constructor(
        id: string,
        mapDataRoot: string,
        liveDataRoot: string,
        loadBlocker: () => Promise<void>,
        events: EventTarget | null = null,
        clientDecompression: boolean
    ) {
        Object.defineProperty(this, "isMap", { value: true });

        this.loadBlocker = loadBlocker;
        this.events = events;

        this.data = makeReactive({
            id: id,
            sorting: 1000000,
            mapDataRoot: mapDataRoot,
            liveDataRoot: liveDataRoot,
            settingsUrl: mapDataRoot + "/settings.json",
            texturesUrl: mapDataRoot + (clientDecompression ? "/textures.json.gz" : "/textures.json"),
            name: id,
            startPos: { x: 0, z: 0 },
            skyColor: new Color(),
            voidColor: new Color(0, 0, 0),
            ambientLight: 0,
            skyLight: 1,
            hires: {
                tileSize: { x: 32, z: 32 },
                scale: { x: 1, z: 1 },
                translate: { x: 2, z: 2 },
            },
            lowres: {
                tileSize: { x: 32, z: 32 },
                lodFactor: 5,
                lodCount: 3,
            },
            perspectiveView: false,
            flatView: false,
            freeFlightView: false,
            views: ["perspective", "flat", "free"],
            clientDecompression: clientDecompression,
        });

        this.raycaster = new Raycaster();

        this.hiresMaterial = null;
        this.lowresMaterial = null;
        this.loadedTextures = [];

        this.animations = [];

        this.hiresTileManager = null;
        this.lowresTileManager = null;
    }

    /**
     * Loads textures and materials for this map so it is ready to load map-tiles
     */
    load(
        hiresVertexShader: string,
        hiresFragmentShader: string,
        lowresVertexShader: string,
        lowresFragmentShader: string,
        uniforms: { [uniform: string]: IUniform },
        revalidatedUrls: Set<string> | undefined
    ): Promise<void> {
        this.unload();

        let settingsPromise = this.loadSettings(revalidatedUrls);
        let textureFilePromise = this.loadTexturesFile(revalidatedUrls);

        this.lowresMaterial = this.createLowresMaterial(lowresVertexShader, lowresFragmentShader, uniforms);

        return Promise.all([settingsPromise, textureFilePromise])
            .then((values) => {
                let textures = values[1] as TextureData[] | null;
                if (textures === null) throw new Error("Failed to parse textures.json!");

                this.hiresMaterial = this.createHiresMaterial(hiresVertexShader, hiresFragmentShader, uniforms, textures);

                this.hiresTileManager = new TileManager(new TileLoader(
                    `${this.data.mapDataRoot}/tiles/0/`,
                    this.hiresMaterial,
                    this.data.hires,
                    this.loadBlocker,
                    revalidatedUrls,
                    this.data.clientDecompression
                ), this.onTileLoad("hires"), this.onTileUnload("hires"), this.events);
                this.hiresTileManager.scene.matrixWorldAutoUpdate = false;

                this.lowresTileManager = [];
                for (let i = 0; i < this.data.lowres.lodCount; i++) {
                    this.lowresTileManager[i] = new TileManager(new LowresTileLoader(
                        `${this.data.mapDataRoot}/tiles/`,
                        this.data.lowres,
                        i + 1,
                        lowresVertexShader,
                        lowresFragmentShader,
                        uniforms,
                        async () => {},
                        revalidatedUrls
                    ), this.onTileLoad("lowres"), this.onTileUnload("lowres"), this.events);
                    this.lowresTileManager[i]!.scene.matrixWorldAutoUpdate = false;
                }

                alert(this.events, `Map '${this.data.id}' is loaded.`, "fine");
            });
    }

    /**
     * Loads the settings of this map
     */
    loadSettings(revalidatedUrls: Set<string> | undefined): Promise<void> {
        return this.loadSettingsFile(revalidatedUrls)
            .then((worldSettings: MapSettings) => {
                this.data.name = worldSettings.name ? worldSettings.name : this.data.name;

                this.data.sorting = Number.isInteger(worldSettings.sorting) ? worldSettings.sorting! : this.data.sorting;

                this.data.startPos = { ...this.data.startPos, ...vecArrToObj(worldSettings.startPos, true) };

                if (worldSettings.skyColor && worldSettings.skyColor.length >= 3) {
                    this.data.skyColor.setRGB(
                        worldSettings.skyColor[0]!,
                        worldSettings.skyColor[1]!,
                        worldSettings.skyColor[2]!
                    );
                }

                if (worldSettings.voidColor && worldSettings.voidColor.length >= 3) {
                    this.data.voidColor.setRGB(
                        worldSettings.voidColor[0]!,
                        worldSettings.voidColor[1]!,
                        worldSettings.voidColor[2]!
                    );
                }

                this.data.ambientLight = worldSettings.ambientLight ? worldSettings.ambientLight : this.data.ambientLight;
                this.data.skyLight = worldSettings.skyLight ? worldSettings.skyLight : this.data.skyLight;

                if (worldSettings.hires === undefined) worldSettings.hires = {};
                if (worldSettings.lowres === undefined) worldSettings.lowres = {};

                this.data.hires = {
                    tileSize: { ...this.data.hires.tileSize, ...vecArrToObj(worldSettings.hires.tileSize, true) },
                    scale: { ...this.data.hires.scale, ...vecArrToObj(worldSettings.hires.scale, true) },
                    translate: { ...this.data.hires.translate, ...vecArrToObj(worldSettings.hires.translate, true) },
                };
                this.data.lowres = {
                    tileSize: { ...this.data.lowres.tileSize, ...vecArrToObj(worldSettings.lowres.tileSize, true) },
                    lodFactor: worldSettings.lowres.lodFactor !== undefined ? worldSettings.lowres.lodFactor : this.data.lowres.lodFactor,
                    lodCount: worldSettings.lowres.lodCount !== undefined ? worldSettings.lowres.lodCount : this.data.lowres.lodCount,
                };

                this.data.perspectiveView = worldSettings.perspectiveView !== undefined ? worldSettings.perspectiveView : this.data.perspectiveView;
                this.data.flatView = worldSettings.flatView !== undefined ? worldSettings.flatView : this.data.flatView;
                this.data.freeFlightView = worldSettings.freeFlightView !== undefined ? worldSettings.freeFlightView : this.data.freeFlightView;

                this.data.views = [];
                if (this.data.perspectiveView) this.data.views.push("perspective");
                if (this.data.flatView) this.data.views.push("flat");
                if (this.data.freeFlightView) this.data.views.push("free");

                alert(this.events, `Settings for map '${this.data.id}' loaded.`, "fine");
            });
    }

    onTileLoad = (layer: string) => (tile: Tile): void => {
        dispatchEvent(this.events, "bluemapMapTileLoaded", {
            tile: tile,
            layer: layer,
        });
    };

    onTileUnload = (layer: string) => (tile: Tile): void => {
        dispatchEvent(this.events, "bluemapMapTileUnloaded", {
            tile: tile,
            layer: layer,
        });
    };

    loadMapArea(x: number, z: number, hiresViewDistance: number, lowresViewDistance: number): void {
        if (!this.isLoaded) return;

        for (let i = this.lowresTileManager!.length - 1; i >= 0; i--) {
            const lod = i + 1;
            const scale = Math.pow(this.data.lowres.lodFactor, lod - 1);
            const lowresX = Math.floor(x / (this.data.lowres.tileSize.x * scale));
            const lowresZ = Math.floor(z / (this.data.lowres.tileSize.z * scale));
            const lowresViewX = Math.floor(lowresViewDistance / this.data.lowres.tileSize.x);
            const lowresViewZ = Math.floor(lowresViewDistance / this.data.lowres.tileSize.z);
            this.lowresTileManager![i]!.loadAroundTile(lowresX, lowresZ, lowresViewX, lowresViewZ);
        }

        const hiresX = Math.floor((x - this.data.hires.translate.x) / this.data.hires.tileSize.x);
        const hiresZ = Math.floor((z - this.data.hires.translate.z) / this.data.hires.tileSize.z);
        const hiresViewX = Math.floor(hiresViewDistance / this.data.hires.tileSize.x);
        const hiresViewZ = Math.floor(hiresViewDistance / this.data.hires.tileSize.z);
        this.hiresTileManager!.loadAroundTile(hiresX, hiresZ, hiresViewX, hiresViewZ);
    }

    /**
     * Loads the settings.json file for this map
     */
    loadSettingsFile(revalidatedUrls: Set<string> | undefined): Promise<MapSettings> {
        return new Promise((resolve, reject) => {
            alert(this.events, `Loading settings for map '${this.data.id}'...`, "fine");

            let loader = new RevalidatingFileLoader();
            loader.setRevalidatedUrls(revalidatedUrls);
            loader.setResponseType("json");
            loader.load(this.data.settingsUrl,
                resolve,
                () => {},
                () => reject(`Failed to load the settings.json for map: ${this.data.id}`)
            );
        });
    }

    /**
     * Loads the textures.json file for this map
     */
    loadTexturesFile(revalidatedUrls: Set<string> | undefined): Promise<TextureData[] | null> {
        return new Promise((resolve, reject) => {
            alert(this.events, `Loading textures for map '${this.data.id}'...`, "fine");

            let loader = new RevalidatingFileLoader();
            loader.setRevalidatedUrls(revalidatedUrls);
            loader.setResponseType("json");
            loader.setClientDecompression(this.data.clientDecompression);
            loader.load(this.data.texturesUrl,
                resolve,
                () => {},
                () => reject(`Failed to load the textures.json for map: ${this.data.id}`)
            );
        });
    }

    /**
     * Creates a hires Material with the given textures
     * @returns the hires Material (array because its a multi-material)
     */
    createHiresMaterial(
        vertexShader: string,
        fragmentShader: string,
        uniforms: { [uniform: string]: IUniform },
        textures: TextureData[]
    ): ShaderMaterial[] {
        let materials: ShaderMaterial[] = [];
        if (!Array.isArray(textures)) throw new Error("Invalid texture.json: 'textures' is not an array!");
        for (let i = 0; i < textures.length; i++) {
            let textureSettings = textures[i]!;

            let color = textureSettings.color;
            if (!Array.isArray(color) || color.length < 4) {
                color = [0, 0, 0, 0];
            }

            let opaque = color[3] === 1;
            let transparent = !!textureSettings.halfTransparent;

            let texture = new Texture();
            texture.image = stringToImage(textureSettings.texture);

            texture.anisotropy = 1;
            texture.generateMipmaps = opaque || transparent;
            texture.magFilter = NearestFilter;
            texture.minFilter = texture.generateMipmaps ? NearestMipMapLinearFilter : NearestFilter;
            texture.wrapS = ClampToEdgeWrapping;
            texture.wrapT = ClampToEdgeWrapping;
            texture.flipY = false;
            (texture as Texture & { flatShading?: boolean }).flatShading = true;

            let animationUniforms = {
                animationFrameHeight: { value: 1 },
                animationFrameIndex: { value: 0 },
                animationInterpolationFrameIndex: { value: 0 },
                animationInterpolation: { value: 0 },
            };

            let animation: TextureAnimation | null = null;
            if (textureSettings.animation) {
                animation = new TextureAnimation(animationUniforms, textureSettings.animation);
                this.animations.push(animation);
            }

            texture.image.addEventListener("load", () => {
                texture.needsUpdate = true;
                if (animation) animation.init(texture.image.naturalWidth, texture.image.naturalHeight);
            });

            this.loadedTextures.push(texture);

            let material = new ShaderMaterial({
                uniforms: {
                    ...uniforms,
                    textureImage: {
                        type: "t",
                        value: texture,
                    } as IUniform,
                    ...animationUniforms,
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                transparent: transparent,
                depthWrite: true,
                depthTest: true,
                vertexColors: true,
                side: FrontSide,
                wireframe: false,
            });

            material.needsUpdate = true;
            materials[i] = material;
        }

        return materials;
    }

    /**
     * Creates a lowres Material
     * @returns the hires Material
     */
    createLowresMaterial(vertexShader: string, fragmentShader: string, uniforms: { [uniform: string]: IUniform }): ShaderMaterial {
        return new ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: false,
            depthWrite: true,
            depthTest: true,
            vertexColors: true,
            side: FrontSide,
            wireframe: false,
        });
    }

    unload(): void {
        if (this.hiresTileManager) this.hiresTileManager.unload();
        this.hiresTileManager = null;

        if (this.lowresTileManager) {
            for (let i = 0; i < this.lowresTileManager.length; i++) {
                this.lowresTileManager[i]!.unload();
            }
            this.lowresTileManager = null;
        }

        if (this.hiresMaterial) this.hiresMaterial.forEach((material) => material.dispose());
        this.hiresMaterial = null;

        if (this.lowresMaterial) this.lowresMaterial.dispose();
        this.lowresMaterial = null;

        this.loadedTextures.forEach((texture) => texture.dispose());
        this.loadedTextures = [];

        this.animations = [];
    }

    /**
     * Ray-traces and returns the terrain-height at a specific location, returns <code>false</code> if there is no map-tile loaded at that location
     */
    terrainHeightAt(x: number, z: number): boolean | number {
        if (!this.isLoaded) return false;

        this.raycaster.set(
            new Vector3(x, 300, z), // ray-start
            new Vector3(0, -1, 0) // ray-direction
        );
        this.raycaster.near = 1;
        this.raycaster.far = 300;
        this.raycaster.layers.enableAll();

        let hiresTileHash = hashTile(Math.floor((x - this.data.hires.translate.x) / this.data.hires.tileSize.x), Math.floor((z - this.data.hires.translate.z) / this.data.hires.tileSize.z));
        let tile: Tile | undefined = this.hiresTileManager!.tiles.get(hiresTileHash);

        if (tile?.model) {
            try {
                let intersects = this.raycaster.intersectObjects([tile.model]);
                if (intersects.length > 0) {
                    return intersects[0]!.point.y;
                }
            } catch (ignore) {
                //empty
            }
        }

        for (let i = 0; i < this.lowresTileManager!.length; i++) {
            const lod = i + 1;
            const scale = Math.pow(this.data.lowres.lodFactor, lod - 1);
            const scaledTileSize = {
                x: this.data.lowres.tileSize.x * scale,
                z: this.data.lowres.tileSize.z * scale,
            };
            const tileX = Math.floor(x / scaledTileSize.x);
            const tileZ = Math.floor(z / scaledTileSize.z);
            let lowresTileHash = hashTile(tileX, tileZ);
            tile = this.lowresTileManager![i]!.tiles.get(lowresTileHash);

            if (!tile || !tile.model) continue;

            const texture = (tile.model.material as ShaderMaterial).uniforms?.textureImage?.value?.image;
            if (texture == null) continue;

            const color = getPixel(texture, x - tileX * scaledTileSize.x, z - tileZ * scaledTileSize.z + this.data.lowres.tileSize.z + 1);

            let heightUnsigned = color[1] * 256.0 + color[2];
            if (heightUnsigned >= 32768.0) {
                return -(65535.0 - heightUnsigned);
            } else {
                return heightUnsigned;
            }
        }

        return false;
    }

    hasView(view: string): boolean {
        return this.data.views.some((v) => v === view);
    }

    dispose(): void {
        this.unload();
    }

    get isLoaded(): boolean {
        return !!(this.hiresMaterial && this.lowresMaterial);
    }
}

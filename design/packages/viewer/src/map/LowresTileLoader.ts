import { pathFromCoords } from "../util/Utils";
import {
    Mesh,
    PlaneGeometry,
    FrontSide,
    ShaderMaterial,
    NearestFilter,
    ClampToEdgeWrapping,
    NearestMipMapLinearFilter,
    Vector2,
} from "three";
import type { IUniform, Texture } from "three";
import { RevalidatingTextureLoader } from "../util/RevalidatingTextureLoader";

export interface LowresTileSettings {
    tileSize: { x: number; z: number };
    lodFactor: number;
    lodCount: number;
}

export class LowresTileLoader {
    declare readonly isLowresTileLoader: boolean;

    tilePath: string;
    tileSettings: LowresTileSettings;
    lod: number;
    loadBlocker: () => Promise<void>;
    revalidatedUrls: Set<string> | undefined;

    vertexShader: string;
    fragmentShader: string;
    uniforms: { [uniform: string]: IUniform };

    textureLoader: RevalidatingTextureLoader;
    geometry: PlaneGeometry;

    constructor(
        tilePath: string,
        tileSettings: LowresTileSettings,
        lod: number,
        vertexShader: string,
        fragmentShader: string,
        uniforms: { [uniform: string]: IUniform },
        loadBlocker: () => Promise<void> = () => Promise.resolve(),
        revalidatedUrls: Set<string> | undefined,
    ) {
        Object.defineProperty(this, "isLowresTileLoader", { value: true });

        this.tilePath = tilePath;
        this.tileSettings = tileSettings;
        this.lod = lod;
        this.loadBlocker = loadBlocker;
        this.revalidatedUrls = revalidatedUrls;

        this.vertexShader = vertexShader;
        this.fragmentShader = fragmentShader;
        this.uniforms = uniforms;

        this.textureLoader = new RevalidatingTextureLoader();
        this.textureLoader.setRevalidatedUrls(this.revalidatedUrls);
        this.geometry = new PlaneGeometry(
            tileSettings.tileSize.x + 1,
            tileSettings.tileSize.z + 1,
            Math.ceil(100 / (lod * 2)),
            Math.ceil(100 / (lod * 2)),
        );
        this.geometry.deleteAttribute("normal");
        this.geometry.deleteAttribute("uv");
        this.geometry.rotateX(-Math.PI / 2);
        this.geometry.translate(
            tileSettings.tileSize.x / 2 + 1,
            0,
            tileSettings.tileSize.x / 2 + 1,
        );
    }

    load = (
        tileX: number,
        tileZ: number,
        cancelCheck: () => boolean = () => false,
        force: boolean = false,
    ): Promise<Mesh> => {
        const tileUrl = this.tilePath + this.lod + "/" + pathFromCoords(tileX, tileZ) + ".png";

        //await this.loadBlocker();
        return new Promise((resolve, reject) => {
            if (force) {
                this.revalidatedUrls!.delete(tileUrl);
            }
            this.textureLoader.setRevalidatedUrls(this.revalidatedUrls);
            this.textureLoader.load(
                tileUrl,
                async (texture: Texture) => {
                    texture.anisotropy = 1;
                    texture.generateMipmaps = false;
                    texture.magFilter = NearestFilter;
                    texture.minFilter = texture.generateMipmaps
                        ? NearestMipMapLinearFilter
                        : NearestFilter;
                    texture.wrapS = ClampToEdgeWrapping;
                    texture.wrapT = ClampToEdgeWrapping;
                    texture.flipY = false;
                    (texture as Texture & { flatShading?: boolean }).flatShading = true;

                    await this.loadBlocker();
                    if (cancelCheck()) {
                        texture.dispose();
                        reject({ status: "cancelled" });
                        return;
                    }

                    const scale = Math.pow(this.tileSettings.lodFactor, this.lod - 1);

                    const material = new ShaderMaterial({
                        uniforms: {
                            ...this.uniforms,
                            tileSize: {
                                value: new Vector2(
                                    this.tileSettings.tileSize.x,
                                    this.tileSettings.tileSize.z,
                                ),
                            },
                            textureSize: {
                                value: new Vector2(texture.image.width, texture.image.height),
                            },
                            textureImage: {
                                type: "t",
                                value: texture,
                            } as IUniform,
                            lod: {
                                value: this.lod,
                            },
                            lodScale: {
                                value: scale,
                            },
                        },
                        vertexShader: this.vertexShader,
                        fragmentShader: this.fragmentShader,
                        depthWrite: true,
                        depthTest: true,
                        vertexColors: true,
                        side: FrontSide,
                        wireframe: false,
                    });

                    const object = new Mesh(this.geometry, material);

                    object.position.set(
                        tileX * this.tileSettings.tileSize.x * scale,
                        0,
                        tileZ * this.tileSettings.tileSize.z * scale,
                    );
                    object.scale.set(scale, 1, scale);

                    object.userData.tileUrl = tileUrl;
                    object.userData.tileType = "lowres";

                    object.updateMatrixWorld(true);

                    resolve(object);
                },
                undefined,
                reject,
            );
        });
    };
}

import { pathFromCoords } from "../util/Utils";
import { Mesh } from "three";
import type { Material } from "three";
import { PRBMLoader } from "./hires/PRBMLoader";
import { RevalidatingFileLoader } from "../util/RevalidatingFileLoader";

export interface HiresTileSettings {
    tileSize: { x: number; z: number };
    scale: { x: number; z: number };
    translate: { x: number; z: number };
}

export class TileLoader {
    declare readonly isTileLoader: boolean;

    tilePath: string;
    material: Material | Material[];
    tileSettings: HiresTileSettings;
    revalidatedUrls: Set<string> | undefined;
    loadBlocker: () => Promise<void>;
    fileLoader: RevalidatingFileLoader;
    clientDecompression: boolean;
    bufferGeometryLoader: PRBMLoader;

    constructor(
        tilePath: string,
        material: Material | Material[],
        tileSettings: HiresTileSettings,
        loadBlocker: () => Promise<void> = () => Promise.resolve(),
        revalidatedUrls: Set<string> | undefined,
        clientDecompression: boolean,
    ) {
        Object.defineProperty(this, "isTileLoader", { value: true });

        this.tilePath = tilePath;
        this.material = material;
        this.tileSettings = tileSettings;

        this.revalidatedUrls = revalidatedUrls;

        this.loadBlocker = loadBlocker;

        this.fileLoader = new RevalidatingFileLoader();
        this.fileLoader.setResponseType("arraybuffer");
        this.fileLoader.setRevalidatedUrls(this.revalidatedUrls);
        this.fileLoader.setClientDecompression(clientDecompression);
        this.clientDecompression = clientDecompression;

        this.bufferGeometryLoader = new PRBMLoader();
    }

    load = (
        tileX: number,
        tileZ: number,
        cancelCheck: () => boolean = () => false,
        force: boolean = false,
    ): Promise<Mesh> => {
        let tileUrl = this.tilePath + pathFromCoords(tileX, tileZ) + ".prbm";
        if (this.clientDecompression) {
            tileUrl += ".gz";
        }

        return new Promise((resolve, reject) => {
            if (force) {
                this.revalidatedUrls!.delete(tileUrl);
            }
            this.fileLoader.setRevalidatedUrls(this.revalidatedUrls);
            this.fileLoader.load(
                tileUrl,
                async (data: unknown) => {
                    await this.loadBlocker();
                    if (cancelCheck()) {
                        reject({ status: "cancelled" });
                        return;
                    }

                    const geometry = this.bufferGeometryLoader.parse(data as ArrayBuffer);

                    const object = new Mesh(geometry, this.material);

                    const tileSize = this.tileSettings.tileSize;
                    const translate = this.tileSettings.translate;
                    const scale = this.tileSettings.scale;
                    object.position.set(
                        tileX * tileSize.x + translate.x,
                        0,
                        tileZ * tileSize.z + translate.z,
                    );
                    object.scale.set(scale.x, 1, scale.z);

                    object.userData.tileUrl = tileUrl;
                    object.userData.tileType = "hires";

                    object.updateMatrixWorld(true);

                    resolve(object);
                },
                () => {},
                reject,
            );
        });
    };
}

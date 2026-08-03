export class LightData {
    private skyLight: number;
    private blockLight: number;

    constructor(skyLight: number, blockLight: number) {
        this.skyLight = skyLight;
        this.blockLight = blockLight;
    }

    set(skyLight: number, blockLight: number): LightData {
        this.skyLight = skyLight;
        this.blockLight = blockLight;
        return this;
    }

    getSkyLight(): number {
        return this.skyLight;
    }

    getBlockLight(): number {
        return this.blockLight;
    }

    toString(): string {
        return "LightData[B:" + this.getBlockLight() + "|S:" + this.getSkyLight() + "]";
    }
}

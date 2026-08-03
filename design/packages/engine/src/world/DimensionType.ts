export interface DimensionType {
    hasSkylight(): boolean;

    hasCeiling(): boolean;

    getAmbientLight(): number;

    getMinY(): number;

    getHeight(): number;

    /** upstream: Long (nullable) — the vanilla values fit a JS number exactly */
    getFixedTime(): number | null;

    getCoordinateScale(): number;
}

/** upstream: DimensionType.Builtin (private constructor, only used for the presets below) */
class Builtin implements DimensionType {
    constructor(
        private readonly skylight: boolean,
        private readonly ceiling: boolean,
        private readonly ambientLight: number,
        private readonly minY: number,
        private readonly height: number,
        private readonly fixedTime: number | null,
        private readonly coordinateScale: number,
    ) {}

    hasSkylight(): boolean {
        return this.skylight;
    }

    hasCeiling(): boolean {
        return this.ceiling;
    }

    getAmbientLight(): number {
        return this.ambientLight;
    }

    getMinY(): number {
        return this.minY;
    }

    getHeight(): number {
        return this.height;
    }

    getFixedTime(): number | null {
        return this.fixedTime;
    }

    getCoordinateScale(): number {
        return this.coordinateScale;
    }
}

export const DimensionType = {
    OVERWORLD: new Builtin(true, false, 0, -64, 384, null, 1.0) as DimensionType,
    OVERWORLD_CAVES: new Builtin(true, true, 0, -64, 384, null, 1.0) as DimensionType,
    // 0.1f widened to a double, like upstream's float ambientLight would be
    NETHER: new Builtin(false, true, Math.fround(0.1), 0, 256, 6000, 8.0) as DimensionType,
    END: new Builtin(true, false, 0, 0, 256, 18000, 1.0) as DimensionType,
};

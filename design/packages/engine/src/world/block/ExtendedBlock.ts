import type { Mask } from "../../map/mask/Mask.js";
import type { RenderSettings } from "../../map/hires/RenderSettings.js";
import type { ResourcePack } from "../../resources/pack/resourcepack/ResourcePack.js";
import type { Biome } from "../biome/Biome.js";
import type { BlockEntity } from "../BlockEntity.js";
import type { BlockProperties } from "../BlockProperties.js";
import { BlockState } from "../BlockState.js";
import type { DimensionType } from "../DimensionType.js";
import type { LightData } from "../LightData.js";
import { flattenLegacyBlockState, isLegacyResourcePack } from "../mca/legacy/FlatteningRename.js";
import type { BlockAccess } from "./BlockAccess.js";

export class ExtendedBlock implements BlockAccess {
    private x = 0;
    private y = 0;
    private z = 0;
    private blockAccess: BlockAccess;

    private resourcePack: ResourcePack;
    private renderSettings: RenderSettings;
    private dimensionType: DimensionType;

    private properties: BlockProperties | null = null;

    private renderMask: Mask | null = null;
    private readonly maskArea = new MaskArea();

    private insideRenderBoundsCalculated = false;
    private insideRenderBounds = false;
    private isCaveCalculated = false;
    private isCave = false;

    constructor(
        blockAccess: BlockAccess,
        resourcePack: ResourcePack,
        renderSettings: RenderSettings,
        dimensionType: DimensionType,
    ) {
        if (blockAccess == null) throw new Error("blockAccess must not be null");
        if (resourcePack == null) throw new Error("resourcePack must not be null");
        if (renderSettings == null) throw new Error("renderSettings must not be null");
        if (dimensionType == null) throw new Error("dimensionType must not be null");
        this.blockAccess = blockAccess;
        this.resourcePack = resourcePack;
        this.renderSettings = renderSettings;
        this.dimensionType = dimensionType;
    }

    set(x: number, y: number, z: number): void {
        if (this.y === y && this.x === x && this.z === z) return;

        this.x = x;
        this.y = y;
        this.z = z;
        this.blockAccess.set(x, y, z);

        this.properties = null;
        this.insideRenderBoundsCalculated = false;
        this.isCaveCalculated = false;
        if (!this.maskArea.isInside(x, z)) this.renderMask = null;
    }

    copy(): ExtendedBlock {
        return new ExtendedBlock(
            this.blockAccess.copy(),
            this.resourcePack,
            this.renderSettings,
            this.dimensionType,
        );
    }

    protected copyFrom(extendedBlock: ExtendedBlock): void {
        this.x = extendedBlock.x;
        this.y = extendedBlock.y;
        this.z = extendedBlock.z;
        this.blockAccess = extendedBlock.blockAccess;
        this.resourcePack = extendedBlock.resourcePack;
        this.renderSettings = extendedBlock.renderSettings;
        this.dimensionType = extendedBlock.dimensionType;
        this.properties = extendedBlock.properties;
        this.insideRenderBoundsCalculated = extendedBlock.insideRenderBoundsCalculated;
        this.insideRenderBounds = extendedBlock.insideRenderBounds;
        this.isCaveCalculated = extendedBlock.isCaveCalculated;
        this.isCave = extendedBlock.isCave;
        this.renderMask = extendedBlock.renderMask;
        this.maskArea.copyFrom(extendedBlock.maskArea);
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    getZ(): number {
        return this.z;
    }

    getResourcePack(): ResourcePack {
        return this.resourcePack;
    }

    getRenderSettings(): RenderSettings {
        return this.renderSettings;
    }

    getDimensionType(): DimensionType {
        return this.dimensionType;
    }

    getBlockState(): BlockState {
        if (this.renderSettings.isRenderEdges() && !this.isInsideRenderBounds()) return BlockState.AIR;
        return this.blockAccess.getBlockState();
    }

    isLegacy(): boolean {
        return this.blockAccess.isLegacy();
    }

    getLightData(): LightData {
        const ld = this.blockAccess.getLightData();
        if (this.renderSettings.isRenderEdges() && !this.isInsideRenderBounds())
            ld.set(
                this.dimensionType.hasSkylight() ? this.renderSettings.getEdgeLightStrength() : 0,
                ld.getBlockLight(),
            );
        return ld;
    }

    getBiome(): Biome {
        return this.blockAccess.getBiome();
    }

    getBlockEntity(): BlockEntity | null {
        return this.blockAccess.getBlockEntity();
    }

    hasOceanFloorY(): boolean {
        return this.blockAccess.hasOceanFloorY();
    }

    getOceanFloorY(): number {
        return this.blockAccess.getOceanFloorY();
    }

    /** (upstream: BlockAccess interface-default) */
    getSunLightLevel(): number {
        return this.getLightData().getSkyLight();
    }

    /** (upstream: BlockAccess interface-default) */
    getBlockLightLevel(): number {
        return this.getLightData().getBlockLight();
    }

    getProperties(): BlockProperties {
        let properties = this.properties;
        if (properties === null) {
            /*
             * Port-only, no upstream analog: BlockProperties (culling/occluding/...) is
             * derived from the resource-pack's model for this block-state — see
             * ResourcePack#getBlockProperties, which itself calls getBlockState — so it
             * needs the exact same pre-flattening-name translation BlockStateModelRenderer
             * applies before its own resource-pack lookup. Skipping this left a legacy
             * grass block resolving the right MODEL (once the renderer's own lookup was
             * fixed) but still deriving its occlusion from the un-renamed "minecraft:grass"
             * — the modern tuft, which does not occlude — so neighbors kept drawing their
             * hidden faces through it.
             *
             * ALSO gated on `!isLegacyResourcePack(this.resourcePack)` (issue #46), the
             * exact same both-eras rule BlockStateModelRenderer applies: against an
             * era-matched pack the rename turns an already-correct name into one that pack
             * has never heard of, so `getBlockProperties` would derive occlusion from
             * nothing instead of from the real model — breaking culling/occlusion the same
             * silent way the renderer's own lookup broke before this fix.
             */
            const blockState = this.getBlockState();
            const lookupState =
                this.isLegacy() && !isLegacyResourcePack(this.resourcePack)
                    ? flattenLegacyBlockState(blockState)
                    : blockState;
            properties = this.resourcePack.getBlockProperties(lookupState);
            this.properties = properties;
        }
        return properties as BlockProperties;
    }

    protected getMaskArea(): MaskArea {
        return this.maskArea;
    }

    /**
     * The returned {@link Mask} is only valid for the area currently defined in {@link #getMaskArea}
     */
    protected getRenderMask(): Mask {
        if (this.renderMask === null) {
            this.maskArea.setAround(this.x, this.z);
            this.renderMask = this.maskArea.apply(this.renderSettings.getRenderMask());
        }
        return this.renderMask;
    }

    isInsideRenderBounds(): boolean {
        if (!this.insideRenderBoundsCalculated) {
            this.insideRenderBounds = this.getRenderMask().test(this.getX(), this.getY(), this.getZ());
            this.insideRenderBoundsCalculated = true;
        }

        return this.insideRenderBounds;
    }

    isRemoveIfCave(): boolean {
        if (!this.isCaveCalculated) {
            this.isCave =
                this.getY() < this.renderSettings.getRemoveCavesBelowY() &&
                (!this.hasOceanFloorY() ||
                    this.getY() <
                        this.getOceanFloorY() + this.renderSettings.getCaveDetectionOceanFloor());
            this.isCaveCalculated = true;
        }

        return this.isCave;
    }
}

/** upstream: ExtendedBlock.MaskArea (protected static nested class) */
export class MaskArea {
    private minX = 0;
    private minZ = 0;
    private maxX = 0;
    private maxZ = 0;

    constructor() {
        this.setAround(0, 0);
    }

    isInside(x: number, z: number): boolean {
        return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ;
    }

    setAround(x: number, z: number): void {
        this.minX = x & 0xfffffff0;
        this.minZ = z & 0xfffffff0;
        this.maxX = this.minX + 15;
        this.maxZ = this.minZ + 15;
    }

    copyFrom(maskArea: MaskArea): void {
        this.minX = maskArea.minX;
        this.minZ = maskArea.minZ;
        this.maxX = maskArea.maxX;
        this.maxZ = maskArea.maxZ;
    }

    apply(mask: Mask): Mask {
        return mask.submask(this.minX, -2147483648, this.minZ, this.maxX, 2147483647, this.maxZ);
    }
}

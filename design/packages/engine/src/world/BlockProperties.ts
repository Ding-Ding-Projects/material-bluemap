import { Tristate } from "../util/Tristate.js";

export class BlockProperties {
    static readonly DEFAULT: BlockProperties = new BlockProperties();

    private culling: Tristate;
    private occluding: Tristate;
    private alwaysWaterlogged: Tristate;
    private randomOffset: Tristate;
    private cullingIdentical: Tristate;

    constructor();
    constructor(
        culling: Tristate,
        occluding: Tristate,
        alwaysWaterlogged: Tristate,
        randomOffset: Tristate,
        cullingIdentical: Tristate,
    );
    constructor(
        culling: Tristate = Tristate.UNDEFINED,
        occluding: Tristate = Tristate.UNDEFINED,
        alwaysWaterlogged: Tristate = Tristate.UNDEFINED,
        randomOffset: Tristate = Tristate.UNDEFINED,
        cullingIdentical: Tristate = Tristate.UNDEFINED,
    ) {
        this.culling = culling;
        this.occluding = occluding;
        this.alwaysWaterlogged = alwaysWaterlogged;
        this.randomOffset = randomOffset;
        this.cullingIdentical = cullingIdentical;
    }

    isCulling(): boolean {
        return this.culling.getOr(false);
    }

    isOccluding(): boolean {
        return this.occluding.getOr(false);
    }

    isAlwaysWaterlogged(): boolean {
        return this.alwaysWaterlogged.getOr(false);
    }

    isRandomOffset(): boolean {
        return this.randomOffset.getOr(false);
    }

    getCullingIdentical(): boolean {
        return this.cullingIdentical.getOr(false);
    }

    toBuilder(): BlockPropertiesBuilder {
        return new BlockPropertiesBuilder(
            new BlockProperties(
                this.culling,
                this.occluding,
                this.alwaysWaterlogged,
                this.randomOffset,
                this.cullingIdentical,
            ),
        );
    }

    static builder(): BlockPropertiesBuilder {
        return new BlockPropertiesBuilder(new BlockProperties());
    }

    toString(): string {
        return (
            "BlockProperties{" +
            "culling=" + this.culling +
            ", occluding=" + this.occluding +
            ", alwaysWaterlogged=" + this.alwaysWaterlogged +
            ", randomOffset=" + this.randomOffset +
            ", cullingIdentical=" + this.cullingIdentical +
            "}"
        );
    }
}

/**
 * upstream: BlockProperties.Builder — a Java inner class mutating its outer
 * BlockProperties instance; ported as a separate class holding that instance
 * (private fields are reached via element access, TS's sanctioned escape hatch)
 */
export class BlockPropertiesBuilder {
    constructor(private readonly instance: BlockProperties) {}

    culling(culling: boolean): BlockPropertiesBuilder {
        this.instance["culling"] = culling ? Tristate.TRUE : Tristate.FALSE;
        return this;
    }

    occluding(occluding: boolean): BlockPropertiesBuilder {
        this.instance["occluding"] = occluding ? Tristate.TRUE : Tristate.FALSE;
        return this;
    }

    alwaysWaterlogged(alwaysWaterlogged: boolean): BlockPropertiesBuilder {
        this.instance["alwaysWaterlogged"] = alwaysWaterlogged ? Tristate.TRUE : Tristate.FALSE;
        return this;
    }

    randomOffset(randomOffset: boolean): BlockPropertiesBuilder {
        this.instance["randomOffset"] = randomOffset ? Tristate.TRUE : Tristate.FALSE;
        return this;
    }

    cullingIdentical(cullingIdentical: boolean): BlockPropertiesBuilder {
        this.instance["cullingIdentical"] = cullingIdentical ? Tristate.TRUE : Tristate.FALSE;
        return this;
    }

    from(other: BlockProperties): BlockPropertiesBuilder {
        this.instance["culling"] = other["culling"].getOr(this.instance["culling"]);
        this.instance["occluding"] = other["occluding"].getOr(this.instance["occluding"]);
        this.instance["alwaysWaterlogged"] = other["alwaysWaterlogged"].getOr(
            this.instance["alwaysWaterlogged"],
        );
        this.instance["randomOffset"] = other["randomOffset"].getOr(this.instance["randomOffset"]);
        this.instance["cullingIdentical"] = other["cullingIdentical"].getOr(
            this.instance["cullingIdentical"],
        );
        return this;
    }

    build(): BlockProperties {
        return this.instance;
    }

    isCulling(): Tristate {
        return this.instance["culling"];
    }

    isOccluding(): Tristate {
        return this.instance["occluding"];
    }

    isAlwaysWaterlogged(): Tristate {
        return this.instance["alwaysWaterlogged"];
    }

    isRandomOffset(): Tristate {
        return this.instance["randomOffset"];
    }

    isCullingIdentical(): Tristate {
        return this.instance["cullingIdentical"];
    }
}

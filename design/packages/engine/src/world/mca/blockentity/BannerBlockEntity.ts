import { STRING, TypeToken, listOf, type BlueNBT, type ObjectSchema } from "@worldlens/nbt";
import { MCABlockEntity, MCA_BLOCK_ENTITY_FIELDS } from "./MCABlockEntity.js";

export const BANNER_BLOCK_ENTITY_TOKEN: TypeToken<BannerBlockEntity> =
    TypeToken.of("BannerBlockEntity");
const PATTERN_TOKEN: TypeToken<Pattern> = TypeToken.of("BannerBlockEntity.Pattern");

/** upstream: BannerBlockEntity.Pattern */
export class Pattern {
    // TODO: proper pattern-data implementation
    pattern: unknown;
    color: unknown;

    getPattern(): unknown {
        return this.pattern;
    }

    getColor(): unknown {
        return this.color;
    }
}

/*
public enum Color {
    WHITE, ORANGE, MAGENTA, LIGHT_BLUE, YELLOW, LIME, PINK, GRAY, LIGHT_GRAY, CYAN, PURPLE, BLUE, BROWN, GREEN,
    RED, BLACK
}
*/

export class BannerBlockEntity extends MCABlockEntity {
    customName: string | null = null; // @NBTName("CustomName")
    patterns: Pattern[] = [];

    getCustomName(): string | null {
        return this.customName;
    }

    getPatterns(): Pattern[] {
        return this.patterns;
    }
}

const PATTERN_SCHEMA: ObjectSchema<Pattern> = {
    create: () => new Pattern(),
    fields: {
        pattern: { type: TypeToken.OBJECT },
        color: { type: TypeToken.OBJECT },
    },
};

const BANNER_BLOCK_ENTITY_SCHEMA: ObjectSchema<BannerBlockEntity> = {
    create: () => new BannerBlockEntity(),
    fields: {
        ...MCA_BLOCK_ENTITY_FIELDS,
        customName: { names: ["CustomName"], type: STRING },
        patterns: { type: listOf(PATTERN_TOKEN) },
    },
};

export function registerBannerBlockEntitySchemas(nbt: BlueNBT): void {
    nbt.register(PATTERN_TOKEN, PATTERN_SCHEMA);
    nbt.register(BANNER_BLOCK_ENTITY_TOKEN, BANNER_BLOCK_ENTITY_SCHEMA);
}

import {
    BOOLEAN,
    STRING,
    TypeToken,
    listOf,
    type BlueNBT,
    type ObjectSchema,
} from "@worldlens/nbt";
import { MCABlockEntity, MCA_BLOCK_ENTITY_FIELDS } from "./MCABlockEntity.js";

export const SIGN_BLOCK_ENTITY_TOKEN: TypeToken<SignBlockEntity> = TypeToken.of("SignBlockEntity");
export const LEGACY_SIGN_BLOCK_ENTITY_TOKEN: TypeToken<LegacySignBlockEntity> = TypeToken.of(
    "SignBlockEntity.LegacySignBlockEntity",
);
const TEXT_DATA_TOKEN: TypeToken<TextData> = TypeToken.of("SignBlockEntity.TextData");

/** upstream: SignBlockEntity.TextData */
export class TextData {
    hasGlowingText = false;
    color: string = "black";
    messages: unknown[] = [];

    constructor(hasGlowingText?: boolean, color?: string, messages?: unknown[]) {
        if (hasGlowingText !== undefined) this.hasGlowingText = hasGlowingText;
        if (color !== undefined) this.color = color;
        if (messages !== undefined) this.messages = messages;
    }

    isHasGlowingText(): boolean {
        return this.hasGlowingText;
    }

    getColor(): string {
        return this.color;
    }

    getMessages(): unknown[] {
        return this.messages;
    }
}

export class SignBlockEntity extends MCABlockEntity {
    frontText: TextData | null = null;
    backText: TextData | null = null;

    getFrontText(): TextData | null {
        return this.frontText;
    }

    getBackText(): TextData | null {
        return this.backText;
    }
}

/** upstream: SignBlockEntity.LegacySignBlockEntity */
export class LegacySignBlockEntity extends SignBlockEntity {
    hasGlowingText = false; // @NBTName("GlowingText")
    color: string = "black"; // @NBTName("Color")
    text1!: string; // @NBTName("Text1")
    text2!: string; // @NBTName("Text2")
    text3!: string; // @NBTName("Text3")
    text4!: string; // @NBTName("Text4")

    override getFrontText(): TextData | null {
        if (this.frontText == null)
            this.frontText = new TextData(this.hasGlowingText, this.color, [
                this.text1,
                this.text2,
                this.text3,
                this.text4,
            ]);
        return this.frontText;
    }
}

const TEXT_DATA_SCHEMA: ObjectSchema<TextData> = {
    create: () => new TextData(),
    fields: {
        hasGlowingText: { type: BOOLEAN },
        color: { type: STRING },
        messages: { type: listOf(TypeToken.OBJECT) },
    },
};

const SIGN_BLOCK_ENTITY_SCHEMA: ObjectSchema<SignBlockEntity> = {
    create: () => new SignBlockEntity(),
    fields: {
        ...MCA_BLOCK_ENTITY_FIELDS,
        frontText: { type: TEXT_DATA_TOKEN },
        backText: { type: TEXT_DATA_TOKEN },
    },
};

const LEGACY_SIGN_BLOCK_ENTITY_SCHEMA: ObjectSchema<LegacySignBlockEntity> = {
    create: () => new LegacySignBlockEntity(),
    fields: {
        ...MCA_BLOCK_ENTITY_FIELDS,
        frontText: { type: TEXT_DATA_TOKEN },
        backText: { type: TEXT_DATA_TOKEN },
        hasGlowingText: { names: ["GlowingText"], type: BOOLEAN },
        color: { names: ["Color"], type: STRING },
        text1: { names: ["Text1"], type: STRING },
        text2: { names: ["Text2"], type: STRING },
        text3: { names: ["Text3"], type: STRING },
        text4: { names: ["Text4"], type: STRING },
    },
};

export function registerSignBlockEntitySchemas(nbt: BlueNBT): void {
    nbt.register(TEXT_DATA_TOKEN, TEXT_DATA_SCHEMA);
    nbt.register(SIGN_BLOCK_ENTITY_TOKEN, SIGN_BLOCK_ENTITY_SCHEMA);
    nbt.register(LEGACY_SIGN_BLOCK_ENTITY_TOKEN, LEGACY_SIGN_BLOCK_ENTITY_SCHEMA);
}

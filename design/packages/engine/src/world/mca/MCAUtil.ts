import { BlueNBT, NamingStrategy } from "@worldlens/nbt";
import { BLOCK_STATE_TOKEN, BlockStateDeserializer } from "./data/BlockStateDeserializer.js";
import { KEY_TOKEN, KeyDeserializer } from "./data/KeyDeserializer.js";
import { UUID_TOKEN, UUIDDeserializer } from "./data/UUIDDeserializer.js";
import { VECTOR3D_TOKEN, Vector3dDeserializer } from "./data/Vector3dDeserializer.js";
import { VECTOR3I_TOKEN, Vector3iDeserializer } from "./data/Vector3iDeserializer.js";
import { VECTOR2I_TOKEN, Vector2iDeserializer } from "./data/Vector2iDeserializer.js";
import { VECTOR2F_TOKEN, Vector2fDeserializer } from "./data/Vector2fDeserializer.js";
import { BLOCK_ENTITY_TOKEN, BlockEntityTypeResolver } from "./data/BlockEntityTypeResolver.js";
import { SignBlockEntityTypeResolver } from "./data/SignBlockEntityTypeResolver.js";
import { SIGN_BLOCK_ENTITY_TOKEN } from "./blockentity/SignBlockEntity.js";
import { ENTITY_TOKEN, EntityTypeResolver } from "./data/EntityTypeResolver.js";
import { registerLevelDataSchemas } from "./data/LevelData.js";
import { registerWorldGenSettingsSchemas } from "./data/WorldGenSettings.js";
import { registerDimensionSettingsSchema } from "./data/DimensionSettings.js";
import { registerMCABlockEntitySchema } from "./blockentity/MCABlockEntity.js";
import { registerSignBlockEntitySchemas } from "./blockentity/SignBlockEntity.js";
import { registerSkullBlockEntitySchemas } from "./blockentity/SkullBlockEntity.js";
import { registerBannerBlockEntitySchemas } from "./blockentity/BannerBlockEntity.js";
import { registerMCAEntitySchema } from "./entity/MCAEntity.js";
import { registerMCAEntityChunkSchema } from "./entity/chunk/MCAEntityChunk.js";
import { registerMCAChunkSchemas } from "./chunk/MCAChunk.js";
import { registerChunk_1_12Schemas } from "./chunk/Chunk_1_12.js";
import { registerChunk_1_13Schemas } from "./chunk/Chunk_1_13.js";
import { registerChunk_1_16Schemas } from "./chunk/Chunk_1_16.js";
import { registerChunk_1_18Schemas } from "./chunk/Chunk_1_18.js";

/**
 * Configures a {@link BlueNBT} instance with everything needed to read mca world-data.
 *
 * Upstream registers only the custom (de)serializers and type-resolvers and lets
 * reflection derive everything else; since the ported BlueNBT has no reflection, the
 * object-schemas of all nbt-mapped mca-types are registered here explicitly as well.
 */
export function addCommonNbtSettings(nbt: BlueNBT): BlueNBT {
    nbt.setNamingStrategy(NamingStrategy.lowerCaseWithDelimiter("_"));

    nbt.register(BLOCK_STATE_TOKEN, new BlockStateDeserializer());
    nbt.register(KEY_TOKEN, new KeyDeserializer());
    nbt.register(UUID_TOKEN, new UUIDDeserializer());
    nbt.register(VECTOR3D_TOKEN, new Vector3dDeserializer());
    nbt.register(VECTOR3I_TOKEN, new Vector3iDeserializer());
    nbt.register(VECTOR2I_TOKEN, new Vector2iDeserializer());
    nbt.register(VECTOR2F_TOKEN, new Vector2fDeserializer());

    nbt.register(BLOCK_ENTITY_TOKEN, new BlockEntityTypeResolver());
    nbt.register(SIGN_BLOCK_ENTITY_TOKEN, new SignBlockEntityTypeResolver());
    nbt.register(ENTITY_TOKEN, new EntityTypeResolver());

    // object-schemas replacing upstream's reflection-driven default-adapters
    registerMCABlockEntitySchema(nbt);
    registerSignBlockEntitySchemas(nbt);
    registerSkullBlockEntitySchemas(nbt);
    registerBannerBlockEntitySchemas(nbt);
    registerMCAEntitySchema(nbt);
    registerMCAEntityChunkSchema(nbt);
    registerMCAChunkSchemas(nbt);
    registerChunk_1_12Schemas(nbt);
    registerChunk_1_13Schemas(nbt);
    registerChunk_1_16Schemas(nbt);
    registerChunk_1_18Schemas(nbt);
    registerLevelDataSchemas(nbt);
    registerWorldGenSettingsSchemas(nbt);
    registerDimensionSettingsSchema(nbt);

    return nbt;
}

// detects the platform byte-order once; the 32bit-half views below depend on it
const LITTLE_ENDIAN: boolean = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** Index-offset of the low 32 bits of a long inside an Int32Array-view over long-data */
export const LONG_LOW_HALF: number = LITTLE_ENDIAN ? 0 : 1;
/** Index-offset of the high 32 bits of a long inside an Int32Array-view over long-data */
export const LONG_HIGH_HALF: number = LITTLE_ENDIAN ? 1 : 0;

const halvesCache = new WeakMap<BigInt64Array, Int32Array>();

/** Returns (and caches) an Int32Array-view of the 32bit-halves of the given long-array. */
export function longArrayHalves(data: BigInt64Array): Int32Array {
    let halves = halvesCache.get(data);
    if (halves === undefined) {
        halves = new Int32Array(data.buffer, data.byteOffset, data.length * 2);
        halvesCache.set(data, halves);
    }
    return halves;
}

/**
 * Treating the long array "data" as a continuous stream of bits, returning the "valueIndex"-th value when each value has "bitsPerValue" bits.
 *
 * (Upstream returns a long; every upstream call-site (int)-casts the result, so this
 * port returns the value's low 32 bits directly — extracted via 32bit-halves without
 * per-element BigInt conversions, see docs/decisions.md D1.)
 */
export function getValueFromLongStream(
    data: BigInt64Array,
    valueIndex: number,
    bitsPerValue: number,
): number {
    const bitIndex = valueIndex * bitsPerValue;
    const firstLong = bitIndex >> 6; // index / 64
    const bitOffset = bitIndex & 0x3f; // Math.floorMod(index, 64)

    if (firstLong >= data.length) return 0;
    const halves = longArrayHalves(data);

    // low 32 bits of: value = data[firstLong] >>> bitOffset
    const lo = halves[firstLong * 2 + LONG_LOW_HALF]!;
    const hi = halves[firstLong * 2 + LONG_HIGH_HALF]!;
    let value: number;
    if (bitOffset === 0) value = lo;
    else if (bitOffset < 32) value = (lo >>> bitOffset) | (hi << (32 - bitOffset));
    else if (bitOffset === 32) value = hi;
    else value = hi >>> (bitOffset - 32);

    if (bitOffset > 0 && firstLong + 1 < data.length) {
        // low 32 bits of: value |= data[firstLong + 1] << -bitOffset
        // (the shifted second long only reaches the low 32 bits when bitOffset > 32)
        if (bitOffset > 32) {
            const lo2 = halves[(firstLong + 1) * 2 + LONG_LOW_HALF]!;
            value = value | (lo2 << (64 - bitOffset));
        }
    }

    // low 32 bits of: value & (0xFFFFFFFFFFFFFFFFL >>> -bitsPerValue)
    const maskWidth = 64 - (-bitsPerValue & 0x3f); // number of low 1-bits in the mask
    if (maskWidth < 32) value = value & ((1 << maskWidth) - 1);
    return value | 0;
}

/**
 * Extracts the 4 bits of the left (largeHalf = <code>true</code>) or the right (largeHalf = <code>false</code>) side of the byte stored in <code>value</code>.<br>
 * The value is treated as an unsigned byte.
 */
export function getByteHalf(value: number, largeHalf: boolean): number {
    if (largeHalf) return (value >> 4) & 0xf;
    return value & 0xf;
}

export function ceilLog2(n: number): number {
    // Integer.SIZE - Integer.numberOfLeadingZeros(n - 1)
    return 32 - Math.clz32(n - 1);
}

/** JDK shim: Java Integer.parseInt — strict decimal syntax, int-range checked (throws otherwise) */
export function javaParseInt(s: string): number {
    if (!/^[+-]?\d+$/.test(s)) throw new NumberFormatError('For input string: "' + s + '"');
    const value = Number.parseInt(s, 10);
    if (value < -2147483648 || value > 2147483647)
        throw new NumberFormatError('For input string: "' + s + '"');
    return value | 0;
}

/** upstream: java.lang.NumberFormatException (as thrown by Integer.parseInt) */
export class NumberFormatError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = "NumberFormatException";
    }
}

/*
 * upstream: Logger.global — the logger-package is not part of this port (yet), so the
 * few log-calls of the mca-package are backed by the console directly.
 */

const noFloodKeys = new Set<string>();

/** upstream: Logger.global.noFloodWarning(key, message) — logs only once per key */
export function noFloodWarning(key: string, message: string): void {
    if (noFloodKeys.has(key)) return;
    noFloodKeys.add(key);
    console.warn(message);
}

/** upstream: Logger.global.logWarning(message) */
export function logWarning(message: string): void {
    console.warn(message);
}

/** upstream: Logger.global.logDebug(message) */
export function logDebug(message: string): void {
    console.debug(message);
}

let blueNbt: BlueNBT | null = null;

export const MCAUtil = {
    /**
     * upstream: {@code public static final BlueNBT BLUENBT} — initialized lazily here so
     * that the module-graph cycle (chunk-schemas are registered from this module while
     * the chunk-modules import helper-functions from it) is initialization-order safe.
     */
    get BLUENBT(): BlueNBT {
        if (blueNbt === null) blueNbt = addCommonNbtSettings(new BlueNBT());
        return blueNbt;
    },

    addCommonNbtSettings,
    getValueFromLongStream,
    getByteHalf,
    ceilLog2,
};

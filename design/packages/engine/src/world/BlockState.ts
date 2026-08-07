import { Key } from "@worldlens/shared";

/**
 * Upstream uses a weak string-interner (StringUtil.intern) so that interned property
 * keys/values can be compared by identity. JavaScript strings already compare by value
 * with {@code ===}, which gives the same semantics, so interning is a no-op here.
 */
function intern(string: string): string {
    return string;
}

/** Java String#hashCode */
function stringHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return h;
}

/** Java String#compareTo (lexicographic by UTF-16 code unit, then by length) */
function compareStrings(a: string, b: string): number {
    const lim = Math.min(a.length, b.length);
    for (let i = 0; i < lim; i++) {
        const c1 = a.charCodeAt(i);
        const c2 = b.charCodeAt(i);
        if (c1 !== c2) return c1 - c2;
    }
    return a.length - b.length;
}

/** Java Integer.parseInt: strict decimal syntax, int-range checked (throws otherwise) */
function javaParseInt(s: string): number {
    if (!/^[+-]?\d+$/.test(s)) throw new Error('For input string: "' + s + '"');
    const value = Number.parseInt(s, 10);
    if (value < -2147483648 || value > 2147483647)
        throw new Error('For input string: "' + s + '"');
    return value | 0;
}

/**
 * Java String#split(regex): trailing empty strings are removed from the result,
 * except that splitting the empty string yields {@code [""]}.
 */
function javaSplit(s: string, separator: string): string[] {
    if (s === "") return [""];
    const parts = s.split(separator);
    while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    return parts;
}

const BLOCKSTATE_SERIALIZATION_PATTERN = /^(.+?)(?:\[(.*)])?$/;

const MISSING_ID = Key.bluemap("missing");
const AIR_ID = Key.minecraft("air");
const CAVE_AIR_ID = Key.minecraft("cave_air");
const VOID_AIR_ID = Key.minecraft("void_air");
const WATER_ID = Key.minecraft("water");

const EMPTY_PROPERTIES: ReadonlyMap<string, string> = new Map();

export class Property {
    private readonly key: string;
    private readonly value: string;

    constructor(key: string, value: string) {
        this.key = intern(key);
        this.value = intern(value);
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Property)) return false;
        // upstream compares the interned strings by identity (==); === on JS strings
        // is the equivalent value comparison
        return this.key === o.key && this.value === o.value;
    }

    hashCode(): number {
        return (Math.imul(stringHash(this.key), 31) ^ stringHash(this.value)) | 0;
    }

    compareTo(o: Property): number {
        const keyCompare = compareStrings(this.key, o.key);
        return keyCompare !== 0 ? keyCompare : compareStrings(this.value, o.value);
    }
}

/**
 * Represents a BlockState<br>
 * It is important that {@link #hashCode} and {@link #equals} are implemented correctly, for the caching to work properly.<br>
 * <br>
 * <i>The implementation of this class has to be thread-save!</i><br>
 */
export class BlockState {
    static readonly AIR: BlockState = new BlockState(AIR_ID);
    static readonly MISSING: BlockState = new BlockState(MISSING_ID);
    static readonly WATER: BlockState = new BlockState(WATER_ID);

    private hashed: boolean;
    private hash: number;

    private readonly id: Key;
    private readonly properties: ReadonlyMap<string, string>;
    private readonly propertiesArray: Property[];

    // note: upstream fields isAir/isWater/isWaterlogged are renamed (air/water/waterlogged)
    // since JS can not have a field and a method of the same name on one class
    private readonly air: boolean;
    private readonly water: boolean;
    private readonly waterlogged: boolean;
    private liquidLevel = -1;
    private redstonePower = -1;

    constructor(id: Key);
    constructor(id: Key, properties: ReadonlyMap<string, string>);
    constructor(id: Key, properties: ReadonlyMap<string, string> = EMPTY_PROPERTIES) {
        this.id = id;
        this.hashed = false;
        this.hash = 0;

        this.properties = properties;
        this.propertiesArray = Array.from(properties.entries(), ([key, value]) => new Property(key, value)).sort(
            (a, b) => a.compareTo(b),
        );

        // special fast-access properties
        this.air = AIR_ID.equals(this.id) || CAVE_AIR_ID.equals(this.id) || VOID_AIR_ID.equals(this.id);

        this.water = WATER_ID.equals(this.id);
        this.waterlogged = "true" === properties.get("waterlogged");
    }

    getId(): Key {
        return this.id;
    }

    /**
     * An immutable map of all properties of this block.<br>
     * <br>
     * For Example:<br>
     * <code>
     * facing = east<br>
     * half = bottom<br>
     * </code>
     */
    getProperties(): ReadonlyMap<string, string> {
        return this.properties;
    }

    isAir(): boolean {
        return this.air;
    }

    isWater(): boolean {
        return this.water;
    }

    isWaterlogged(): boolean {
        return this.waterlogged;
    }

    getLiquidLevel(): number {
        if (this.liquidLevel === -1) {
            try {
                const levelString = this.properties.get("level");
                this.liquidLevel = levelString != null ? javaParseInt(levelString) : 0;
                if (this.liquidLevel > 15) this.liquidLevel = 15;
                if (this.liquidLevel < 0) this.liquidLevel = 0;
            } catch {
                this.liquidLevel = 0;
            }
        }
        return this.liquidLevel;
    }

    getRedstonePower(): number {
        if (this.redstonePower === -1) {
            try {
                const levelString = this.properties.get("power");
                this.redstonePower = levelString != null ? javaParseInt(levelString) : 0;
                if (this.redstonePower > 15) this.redstonePower = 15;
                if (this.redstonePower < 0) this.redstonePower = 0;
            } catch {
                this.redstonePower = 15;
            }
        }
        return this.redstonePower;
    }

    equals(obj: unknown): boolean {
        if (this === obj) return true;
        if (!(obj instanceof BlockState)) return false;
        if (!this.id.equals(obj.id)) return false;
        // Arrays.equals(propertiesArray, b.propertiesArray)
        if (this.propertiesArray.length !== obj.propertiesArray.length) return false;
        for (let i = 0; i < this.propertiesArray.length; i++) {
            if (!this.propertiesArray[i]!.equals(obj.propertiesArray[i])) return false;
        }
        return true;
    }

    hashCode(): number {
        if (!this.hashed) {
            // Objects.hash(id, properties) with java.util.Map hash semantics
            // (sum of entry-hashes, entry-hash = keyHash ^ valueHash)
            let propertiesHash = 0;
            for (const [key, value] of this.properties) {
                propertiesHash = (propertiesHash + (stringHash(key) ^ stringHash(value))) | 0;
            }
            let h = 31 + this.id.hashCode();
            h = (Math.imul(31, h) + propertiesHash) | 0;
            this.hash = h;
            this.hashed = true;
        }

        return this.hash;
    }

    toString(): string {
        const sj: string[] = [];
        for (const [key, value] of this.getProperties()) {
            sj.push(key + "=" + value);
        }

        return this.id.getFormatted() + "[" + sj.join(",") + "]";
    }

    static fromString(serializedBlockState: string): BlockState {
        try {
            const m = BLOCKSTATE_SERIALIZATION_PATTERN.exec(serializedBlockState);

            if (m === null)
                throw new Error("'" + serializedBlockState + "' could not be parsed to a BlockState!");

            const pt = new Map<string, string>();
            const g2 = m[2];
            if (g2 != null && g2 !== "") {
                const propertyStrings = javaSplit(g2.trim(), ",");
                for (const s of propertyStrings) {
                    // String#split("=", 2)
                    const separator = s.indexOf("=");
                    if (separator < 0)
                        throw new Error("Index 1 out of bounds for length 1"); // kv[1]
                    pt.set(s.substring(0, separator), s.substring(separator + 1));
                }
            }

            const blockId = m[1]!.trim();

            return new BlockState(Key.parse(blockId), pt);
        } catch {
            throw new Error("'" + serializedBlockState + "' could not be parsed to a BlockState!");
        }
    }
}

import type { Key } from "@worldlens/shared";
import type { JsonAdapter } from "../adapter/AbstractTypeAdapterFactory.js";
import { KeyAdapter } from "../adapter/KeyAdapter.js";
import {
    asArray,
    asObject,
    nextInt,
    nextString,
    type JsonObject,
    type JsonValue,
} from "../adapter/JsonMapper.js";
import { PackVersion, PackVersionMaxAdapter, PackVersionMinAdapter } from "./PackVersion.js";

/**
 * upstream: resources/pack/PackMeta.java
 *
 * Upstream is a reflective-gson POJO ({@code FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES}),
 * so each class carries a {@code fromJson} reading exactly the members gson would bind
 * ({@code min_format}, {@code max_format}, {@code pack_format}, {@code supported_formats},
 * …) and keeps its field-initializer default for every member that is absent.
 */

/** upstream: java.lang.Integer.MIN_VALUE */
const INTEGER_MIN_VALUE = -2147483648;
/** upstream: java.lang.Integer.MAX_VALUE */
const INTEGER_MAX_VALUE = 2147483647;

/** a json-member, or null when it is absent (see the note in {@link PackMeta}) */
function member(object: JsonObject, name: string): JsonValue | null {
    const value = object[name];
    return value === undefined ? null : value;
}

/** upstream: PackMeta.VersionRange */
export class VersionRange {
    private readonly minInclusive: number;
    private readonly maxInclusive: number;

    constructor(
        minInclusive: number = INTEGER_MIN_VALUE,
        maxInclusive: number = INTEGER_MAX_VALUE,
    ) {
        this.minInclusive = minInclusive;
        this.maxInclusive = maxInclusive;
    }

    getMinInclusive(): number {
        return this.minInclusive;
    }

    getMaxInclusive(): number {
        return this.maxInclusive;
    }

    includes(version: number): boolean {
        return version >= this.minInclusive && version <= this.maxInclusive;
    }

    toString(): string {
        return (
            "VersionRange(minInclusive=" +
            this.minInclusive +
            ", maxInclusive=" +
            this.maxInclusive +
            ")"
        );
    }
}

/** upstream: PackMeta.VersionRange.Adapter */
export class VersionRangeAdapter implements JsonAdapter<VersionRange> {
    write(_value: VersionRange): JsonValue {
        throw new Error("UnsupportedOperationException");
    }

    read(json: JsonValue): VersionRange {
        if (typeof json === "number") {
            const version = nextInt(json);
            return new VersionRange(version, version);
        }

        if (Array.isArray(json)) {
            const range = new VersionRange(nextInt(json[0] ?? null), nextInt(json[1] ?? null));

            // upstream: while (in.peek() != END_ARRAY) in.skipValue();
            // (any further array-elements are ignored)

            return range;
        }

        // upstream: gson.getDelegateAdapter(...) — the reflective object-form
        const object = asObject(json);
        const minInclusive = member(object, "min_inclusive");
        const maxInclusive = member(object, "max_inclusive");
        return new VersionRange(
            minInclusive !== null ? nextInt(minInclusive) : INTEGER_MIN_VALUE,
            maxInclusive !== null ? nextInt(maxInclusive) : INTEGER_MAX_VALUE,
        );
    }
}

const VERSION_RANGE = new VersionRangeAdapter();
const MIN_FORMAT = new PackVersionMinAdapter();
const MAX_FORMAT = new PackVersionMaxAdapter();
const KEY = new KeyAdapter();

/**
 * upstream: PackMeta.Pack (named {@code Pack} upstream; renamed here so it does not
 * collide with the {@link Pack} base-class of the same package — it stays reachable as
 * {@code PackMeta.Pack})
 */
export class PackMetaPack {
    private readonly minFormat: PackVersion | null;
    private readonly maxFormat: PackVersion | null;

    // <= 1.21.8
    private readonly packFormat: VersionRange;
    private readonly supportedFormats: VersionRange | null;

    constructor(
        minFormat: PackVersion | null = null,
        maxFormat: PackVersion | null = null,
        packFormat: VersionRange = new VersionRange(),
        supportedFormats: VersionRange | null = null,
    ) {
        this.minFormat = minFormat;
        this.maxFormat = maxFormat;
        this.packFormat = packFormat;
        this.supportedFormats = supportedFormats;
    }

    getMinFormat(): PackVersion | null {
        return this.minFormat;
    }

    getMaxFormat(): PackVersion | null {
        return this.maxFormat;
    }

    getPackFormat(): VersionRange {
        return this.packFormat;
    }

    getSupportedFormats(): VersionRange | null {
        return this.supportedFormats;
    }

    includes(version: PackVersion): boolean {
        // <= 1.21.8
        if (this.minFormat === null || this.maxFormat === null) {
            if (
                this.supportedFormats !== null &&
                this.supportedFormats.includes(version.getMajor())
            )
                return true;
            return this.packFormat.includes(version.getMajor());
        }

        // note: PackVersion#isGreaterOrEqual / #isSmallerOrEqual compare in the reversed
        // direction upstream (`a.isGreaterOrEqual(b)` is true when *b* is >= *a*), so this
        // matches for `maxFormat <= version <= minFormat`; kept bug-for-bug
        return version.isGreaterOrEqual(this.minFormat) && version.isSmallerOrEqual(this.maxFormat);
    }

    static fromJson(json: JsonValue): PackMetaPack {
        const object = asObject(json);
        const minFormat = member(object, "min_format");
        const maxFormat = member(object, "max_format");
        const packFormat = member(object, "pack_format");
        const supportedFormats = member(object, "supported_formats");
        return new PackMetaPack(
            minFormat !== null ? MIN_FORMAT.read(minFormat) : null,
            maxFormat !== null ? MAX_FORMAT.read(maxFormat) : null,
            packFormat !== null ? VERSION_RANGE.read(packFormat) : new VersionRange(),
            supportedFormats !== null ? VERSION_RANGE.read(supportedFormats) : null,
        );
    }
}

/** upstream: PackMeta.Overlay */
export class Overlay {
    private readonly minFormat: PackVersion | null;
    private readonly maxFormat: PackVersion | null;
    private readonly directory: string | null;

    // <= 1.21.8
    private readonly formats: VersionRange;

    constructor(
        minFormat: PackVersion | null = null,
        maxFormat: PackVersion | null = null,
        directory: string | null = null,
        formats: VersionRange = new VersionRange(),
    ) {
        this.minFormat = minFormat;
        this.maxFormat = maxFormat;
        this.directory = directory;
        this.formats = formats;
    }

    getMinFormat(): PackVersion | null {
        return this.minFormat;
    }

    getMaxFormat(): PackVersion | null {
        return this.maxFormat;
    }

    getDirectory(): string | null {
        return this.directory;
    }

    getFormats(): VersionRange {
        return this.formats;
    }

    includes(version: PackVersion): boolean {
        // <= 1.21.8
        if (this.minFormat === null || this.maxFormat === null) {
            return this.formats.includes(version.getMajor());
        }

        // note: same reversed comparison as PackMetaPack#includes — kept bug-for-bug
        return version.isGreaterOrEqual(this.minFormat) && version.isSmallerOrEqual(this.maxFormat);
    }

    static fromJson(json: JsonValue): Overlay {
        const object = asObject(json);
        const minFormat = member(object, "min_format");
        const maxFormat = member(object, "max_format");
        const directory = member(object, "directory");
        const formats = member(object, "formats");
        return new Overlay(
            minFormat !== null ? MIN_FORMAT.read(minFormat) : null,
            maxFormat !== null ? MAX_FORMAT.read(maxFormat) : null,
            directory !== null ? nextString(directory) : null,
            formats !== null ? VERSION_RANGE.read(formats) : new VersionRange(),
        );
    }
}

/** upstream: PackMeta.Overlays */
export class Overlays {
    private readonly entries: readonly Overlay[];

    constructor(entries: readonly Overlay[] = []) {
        this.entries = entries;
    }

    getEntries(): readonly Overlay[] {
        return this.entries;
    }

    static fromJson(json: JsonValue): Overlays {
        const object = asObject(json);
        const entries = member(object, "entries");
        if (entries === null) return new Overlays();
        return new Overlays(asArray(entries).map((element) => Overlay.fromJson(element)));
    }
}

/** upstream: PackMeta.Features */
export class Features {
    private readonly enabled: readonly Key[];

    constructor(enabled: readonly Key[] = []) {
        this.enabled = enabled;
    }

    getEnabled(): readonly Key[] {
        return this.enabled;
    }

    static fromJson(json: JsonValue): Features {
        const object = asObject(json);
        const enabled = member(object, "enabled");
        if (enabled === null) return new Features();
        return new Features(asArray(enabled).map((element) => KEY.read(element)));
    }
}

export class PackMeta {
    private readonly pack: PackMetaPack;
    private readonly overlays: Overlays;
    private readonly features: Features;

    constructor(
        pack: PackMetaPack = new PackMetaPack(),
        overlays: Overlays = new Overlays(),
        features: Features = new Features(),
    ) {
        this.pack = pack;
        this.overlays = overlays;
        this.features = features;
    }

    getPack(): PackMetaPack {
        return this.pack;
    }

    getOverlays(): Overlays {
        return this.overlays;
    }

    getFeatures(): Features {
        return this.features;
    }

    static fromJson(json: JsonValue): PackMeta {
        const object = asObject(json);
        const pack = member(object, "pack");
        const overlays = member(object, "overlays");
        const features = member(object, "features");
        return new PackMeta(
            pack !== null ? PackMetaPack.fromJson(pack) : new PackMetaPack(),
            overlays !== null ? Overlays.fromJson(overlays) : new Overlays(),
            features !== null ? Features.fromJson(features) : new Features(),
        );
    }

    /* the upstream nested-class names (PackMeta.Pack, PackMeta.Overlay, …) */
    static readonly Pack = PackMetaPack;
    static readonly Overlays = Overlays;
    static readonly Overlay = Overlay;
    static readonly Features = Features;
    static readonly VersionRange = VersionRange;
}

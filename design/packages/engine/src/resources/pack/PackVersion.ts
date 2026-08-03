import {
    JsonParseError,
    nextDouble,
    nextInt,
    type JsonValue,
} from "../adapter/JsonMapper.js";
import type { JsonAdapter } from "../adapter/AbstractTypeAdapterFactory.js";

export class PackVersion {
    private readonly major: number;
    private readonly minor: number;

    constructor(major: number, minor: number) {
        this.major = major;
        this.minor = minor;
    }

    getMajor(): number {
        return this.major;
    }

    getMinor(): number {
        return this.minor;
    }

    isGreaterOrEqual(other: PackVersion): boolean {
        if (other.major === this.major) return other.minor >= this.minor;
        return other.major > this.major;
    }

    isSmallerOrEqual(other: PackVersion): boolean {
        if (other.major === this.major) return other.minor <= this.minor;
        return other.major < this.major;
    }

    toString(): string {
        return "PackVersion(major=" + this.major + ", minor=" + this.minor + ")";
    }
}

const VERSION_STRING_PATTERN = /^(\d+)(?:\.(\d+))?$/;

export class PackVersionAdapter implements JsonAdapter<PackVersion> {
    private readonly defaultMinor: number;

    constructor(defaultMinor: number) {
        this.defaultMinor = defaultMinor;
    }

    write(_value: PackVersion): JsonValue {
        throw new Error("UnsupportedOperationException");
    }

    read(json: JsonValue): PackVersion {
        if (typeof json === "string") return this.parseString(json);
        if (typeof json === "number") {
            const version = json;
            if (version === Math.floor(version))
                return new PackVersion(version | 0, this.defaultMinor);
            // upstream: parseString("%.9f".formatted(version))
            return this.parseString(version.toFixed(9));
        }
        if (Array.isArray(json)) {
            const major = nextInt(json[0] ?? null);
            const minor = json.length > 1 ? nextInt(json[1] ?? null) : this.defaultMinor;
            if (json.length > 2) throw new JsonParseError("Invalid version format!");
            return new PackVersion(major, minor);
        }
        throw new JsonParseError(`Invalid version format: '${json === null ? "NULL" : typeof json}'!`);
    }

    private parseString(versionString: string): PackVersion {
        const versionStringMatcher = VERSION_STRING_PATTERN.exec(versionString);
        if (versionStringMatcher === null)
            throw new JsonParseError(`Invalid version string: '${versionString}'!`);

        const major = versionStringMatcher[1]!;
        const minor = versionStringMatcher[2];
        return new PackVersion(
            nextDouble(major) | 0,
            minor != null && minor !== "" ? nextDouble(minor) | 0 : this.defaultMinor
        );
    }
}

/** upstream: PackVersion.MinAdapter */
export class PackVersionMinAdapter extends PackVersionAdapter {
    constructor() {
        super(0);
    }
}

/** upstream: PackVersion.MaxAdapter */
export class PackVersionMaxAdapter extends PackVersionAdapter {
    constructor() {
        super(2147483647); // Integer.MAX_VALUE
    }
}

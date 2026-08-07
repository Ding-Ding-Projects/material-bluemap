import type { Key } from "@worldlens/shared";
import { ResourcePath } from "../resources/ResourcePath.js";
import { isJsonArray, isJsonObject, type JsonValue } from "../resources/adapter/JsonMapper.js";
import { ResourcePool } from "../resources/pack/ResourcePool.js";
import { Texture } from "../resources/pack/resourcepack/texture/Texture.js";

/**
 * upstream: map/TextureGallery.java
 *
 * The map's texture-index: every {@link Texture} the map uses gets an ordinal, and the
 * rendered tile-models refer to their textures by that ordinal alone. The ordinals are
 * written out as {@code textures.json} — a bare json array indexed by ordinal — which the
 * webapp loads alongside the tiles.
 *
 * Three port-notes:
 * - The upstream {@code Map<Key, TextureMapping>} relies on {@code Key}'s value-equality;
 *   a javascript {@code Map} keys objects by identity, so the map is keyed by
 *   {@code Key#getFormatted()} with the {@link Key} kept alongside the mapping (the same
 *   shape {@code resources/pack/ResourcePool} uses).
 * - Upstream's gson instance here is {@code ResourcesGson.addAdapter(...)} with
 *   {@code FieldNamingPolicy.IDENTITY} and — unlike {@code ResourcesGson.INSTANCE} — NO
 *   {@code setLenient()}, so reading goes through the strict {@code JSON.parse} rather
 *   than the lenient {@code adapter/JsonMapper} parser. The per-element (de)serialization
 *   is {@link Texture.Adapter}, which reproduces that reflective-with-IDENTITY shape.
 * - Upstream's {@code synchronized} on the two {@code put} methods has no counterpart:
 *   javascript has no preemption, so the compute-and-increment below is already atomic
 *   (see docs/deviations.md).
 */
export class TextureGallery {
    /**
     * The map-storage item-name of the textures-file
     * (upstream: {@code FileMapStorage} — {@code "textures.json" + compression.getFileSuffix()}).
     */
    static readonly TEXTURES_FILE_NAME: string = "textures.json";

    /**
     * The on-disk name of the textures-file: map-storages write it gzip-compressed, so
     * the bytes {@link writeTexturesFile} produces are gzipped before they land under
     * this name (and gunzipped before {@link readTexturesFile} sees them).
     */
    static readonly TEXTURES_FILE_NAME_GZIP: string = "textures.json.gz";

    /** upstream: {@code Map<Key, TextureMapping> textureMappings} */
    private readonly textureMappings = new Map<string, MappingEntry>();
    private nextId = 0;

    clear(): void {
        this.textureMappings.clear();
        this.nextId = 0;
    }

    /**
     * upstream: {@code int get(@Nullable Key textureResourcePath)} — the ordinal of the
     * given texture, falling back to 0 (which {@link put} guarantees is the
     * missing-texture) for a null or unknown key.
     */
    get(textureResourcePath: Key | null): number {
        const key = textureResourcePath ?? MISSING_TEXTURE;
        const entry = this.textureMappings.get(key.getFormatted());
        return entry !== undefined ? entry.mapping.getId() : 0;
    }

    /**
     * upstream: {@code synchronized void put(Key key, Texture texture)} — assigns the
     * next free ordinal to a new key, or replaces the texture of an already-known one.
     *
     * The ordinal of an existing key is deliberately PRESERVED across a re-put: tiles
     * that were rendered in an earlier run store texture-ordinals, not texture-keys, so
     * re-loading the same resource-pack has to hand the same key the same ordinal or
     * every already-rendered tile would silently start pointing at a different texture.
     */
    put(key: Key, texture: Texture | null): void;
    /**
     * upstream: {@code synchronized void put(ResourcePool<Texture> texturePool)} —
     * inserts a whole texture-pool in a deterministic order.
     */
    put(texturePool: ResourcePool<Texture>): void;
    put(keyOrPool: Key | ResourcePool<Texture>, texture?: Texture | null): void {
        if (keyOrPool instanceof ResourcePool) {
            // ordinal 0 is guaranteed to be the missing-texture because this goes in
            // before anything else (upstream: "put this first")
            this.put(MISSING_TEXTURE, MISSING_TEXTURE.getResource());

            const entries = keyOrPool.entrySet();
            // upstream: Comparator.comparing(<half-transparent>).thenComparing(<formatted key>)
            // — opaque textures first, each group ordered by its formatted key. Both
            // Stream#sorted and Array#sort are stable, so equal entries keep pool-order.
            entries.sort((a, b) => {
                const halfTransparentA = isHalfTransparent(a[1]) ? 1 : 0;
                const halfTransparentB = isHalfTransparent(b[1]) ? 1 : 0;
                if (halfTransparentA !== halfTransparentB)
                    return halfTransparentA - halfTransparentB;

                // java's String#compareTo: utf-16 code-unit order, never locale-aware
                const formattedA = a[0].getFormatted();
                const formattedB = b[0].getFormatted();
                return formattedA < formattedB ? -1 : formattedA > formattedB ? 1 : 0;
            });

            for (const entry of entries) this.put(entry[0], entry[1]);
            return;
        }

        // upstream: textureMappings.compute(key, ...)
        const formatted = keyOrPool.getFormatted();
        const existing = this.textureMappings.get(formatted);
        if (existing === undefined) {
            this.textureMappings.set(formatted, {
                key: keyOrPool,
                mapping: new TextureMapping(this.nextId++, texture ?? null),
            });
        } else if (texture != null) {
            existing.mapping.setTexture(texture);
        }
    }

    /**
     * upstream: {@code void writeTexturesFile(OutputStream out)} — the textures-file is a
     * bare json array of length {@code nextId} indexed by ordinal; ordinals with no
     * mapping (holes) hold {@link Texture.MISSING} and a mapping with no loaded texture
     * holds {@code Texture.missing(<its key>)}.
     *
     * Upstream writes utf-8 bytes into an {@code OutputStream}; this returns the document
     * as a string, which the (not-yet-ported) map-storage layer encodes and compresses.
     *
     * The document is spelled by {@link writeGsonDocument} rather than by
     * {@code JSON.stringify}, because this file is gated byte for byte against a reference
     * render and the two disagree about how a java {@code double} is written — see
     * {@link javaDoubleToString}.
     */
    writeTexturesFile(): string {
        const textures: Texture[] = Array.from({ length: this.nextId }, () => Texture.MISSING);

        for (const entry of this.textureMappings.values()) {
            const ordinal = entry.mapping.getId();
            const texture = entry.mapping.getTexture();
            textures[ordinal] = texture ?? Texture.missing(entry.key);
        }

        return writeGsonDocument(
            textures.map((texture) => tagColorComponents(Texture.Adapter.write(texture))),
        );
    }

    /**
     * upstream: {@code static TextureGallery readTexturesFile(InputStream in)} — the
     * array-index is the ordinal, and a duplicated key keeps its FIRST occurrence
     * (upstream: {@code Map#putIfAbsent}). {@code nextId} becomes the array length, so a
     * hole (a null element, or the later occurrence of a duplicate) keeps its ordinal
     * reserved instead of handing it to the next {@link put}.
     */
    static readTexturesFile(json: string): TextureGallery {
        const gallery = new TextureGallery();

        let parsed: JsonValue;
        try {
            // gson returns null for an empty document, which upstream turns into the
            // "Texture data is empty!" IOException below
            parsed = json.trim() === "" ? null : (JSON.parse(json) as JsonValue);
        } catch (ex) {
            // upstream: JsonParseException -> IOException
            throw new Error("Failed to parse texture data: " + String(ex));
        }

        if (parsed === null) throw new Error("Texture data is empty!");

        try {
            if (!isJsonArray(parsed))
                throw new Error("Expected BEGIN_ARRAY but was an object or primitive");

            gallery.nextId = parsed.length;
            for (let ordinal = 0; ordinal < parsed.length; ordinal++) {
                const element = parsed[ordinal] ?? null;
                if (element === null) continue; // upstream: `texture != null`

                // upstream also guards `texture.getKey() != null`; gson instantiates a
                // Texture through its private no-args constructor, which always assigns
                // a key (Texture.MISSING's), so the guard can never fail — here as there
                const texture = Texture.Adapter.read(element);
                const formatted = texture.getKey().getFormatted();
                if (gallery.textureMappings.has(formatted)) continue; // putIfAbsent
                gallery.textureMappings.set(formatted, {
                    key: texture.getKey(),
                    mapping: new TextureMapping(ordinal, texture),
                });
            }
        } catch (ex) {
            throw new Error("Failed to parse texture data: " + String(ex));
        }

        return gallery;
    }
}

/**
 * upstream: {@code ResourcePack.MISSING_TEXTURE}
 * ({@code new ResourcePath<>("bluemap", "block/missing")}).
 *
 * Declared locally, exactly as `model/Face.ts` and `entitystate/Part.ts` already declare
 * it, rather than imported from `ResourcePack` — that would pull the whole pack-loader
 * (and its six pools) into the gallery for one constant. Nothing in upstream ever calls
 * {@code setResource} on this path, so its {@code getResource()} is always null and a
 * separate instance is indistinguishable from the pack's: the gallery keys by
 * {@code Key#getFormatted()}, which is value-equal either way. See docs/deviations.md.
 */
const MISSING_TEXTURE: ResourcePath<Texture> = new ResourcePath<Texture>(
    "bluemap",
    "block/missing",
);

/** upstream: the {@code Key} of the {@code Map<Key, TextureMapping>} entry */
interface MappingEntry {
    key: Key;
    mapping: TextureMapping;
}

/** upstream: TextureGallery.TextureMapping (a package-private static nested class) */
class TextureMapping {
    private readonly id: number;
    private texture: Texture | null;

    constructor(id: number, texture: Texture | null) {
        this.id = id;
        this.texture = texture;
    }

    getId(): number {
        return this.id;
    }

    getTexture(): Texture | null {
        return this.texture;
    }

    setTexture(texture: Texture | null): void {
        this.texture = texture;
    }
}

/** upstream: the sort-key of {@code put(ResourcePool)}'s first comparator */
function isHalfTransparent(texture: Texture | null): boolean {
    // upstream guards against a null pool-value, which the ResourcePool type excludes here
    return texture != null && texture.getColorPremultiplied().a < 1;
}

// #region the gson-compatible document writer

/**
 * java's {@code Double.toString(double)} — the spelling gson gives every number it writes
 * through {@code JsonWriter#value(double)}, and therefore the spelling every colour
 * component in the textures-file has.
 *
 * WHY this exists at all: {@code textures.json} is compared byte for byte against a
 * reference render, and {@code JSON.stringify} disagrees with java about the *shell* around
 * a number's digits. Measured over the reference document's 8368 numeric tokens, 713 were
 * spelled differently — 711 of the form {@code 1.0}/{@code 0.0} where javascript writes
 * {@code 1}/{@code 0}, and 2 of the form {@code 4.985044943168759E-4} where javascript
 * writes {@code 0.0004985044943168759}. Not one of them differed in the DIGITS themselves:
 * java (since JDK 19) and javascript both spell a double with the shortest decimal that
 * round-trips to the same bits, so this function reuses javascript's digits and rebuilds
 * only the shell around them. No Ryū reimplementation is needed or wanted here.
 *
 * The shell, transcribed from {@code FloatingDecimal.BinaryToASCIIBuffer#getChars} (and,
 * since JDK 19, the identical thresholds in {@code DoubleToDecimal#toChars}), where
 * {@code decExponent} is the power of ten for which the value is
 * {@code 0.<digits> × 10^decExponent}:
 *
 * - {@code 1 <= decExponent <= 7} — plain decimal at or above one. The digits split around
 *   the point; if there are fewer digits than the exponent the integer part is
 *   zero-padded and the fraction becomes a lone {@code 0} ({@code 100.0}), and if there are
 *   more the remainder becomes the fraction ({@code 9999999.5}).
 * - {@code -2 <= decExponent <= 0} — plain decimal below one: {@code 0.}, the leading
 *   zeros the exponent calls for, then the digits ({@code 0.001},
 *   {@code 0.8335329294204712}).
 * - anything else — one digit, a point, the remaining digits (or a lone {@code 0} when
 *   there are none), {@code E}, and the bare decimal exponent. Never {@code 1E-4}, because
 *   the fraction digit is mandatory; never {@code 1.0E+4}, because java writes no plus.
 *
 * Those two plain ranges are exactly the {@code 10^-3 <= |d| < 10^7} window the
 * {@code Double#toString} javadoc describes — expressed here in the exponent because that
 * is the form the decision is actually made in, and because deriving it from the rounded
 * shortest digits (rather than from the raw value) is what keeps a value like
 * {@code 9999999.99999999999} on the same side of the boundary as java puts it.
 *
 * NaN and the infinities keep java's spelling ({@code NaN}, {@code Infinity},
 * {@code -Infinity}) rather than throwing: {@code Gson#toJson} switches its writer to
 * lenient for the duration of the call, so upstream really would emit those bare literals —
 * technically invalid json that this port has no business "fixing" into something else.
 * A colour component cannot reach them anyway.
 *
 * One caveat worth writing down rather than rediscovering: java's own shortest-digit search
 * was subtly wrong for a handful of doubles before JDK 19 (JDK-4511638), so a reference
 * render produced by an older JDK can disagree with this function in the digits for those
 * values. Every number this file writes is a colour component — a float from a
 * {@code / 255f} division, widened to double — and the measurement above found zero digit
 * differences across the whole reference document, so no workaround is carried for a bug
 * this document cannot reach.
 */
export function javaDoubleToString(value: number): string {
    if (Number.isNaN(value)) return "NaN";
    if (value === Number.POSITIVE_INFINITY) return "Infinity";
    if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
    // java prints the sign of a negative zero; `value < 0` below does not see it
    if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";

    const negative = value < 0;

    // `toExponential()` with no argument is specified to use "as few digits as possible"
    // while still round-tripping — the same shortest-decimal guarantee java makes, which
    // is the whole reason the digits can simply be borrowed.
    const [mantissa = "", exponent = "0"] = Math.abs(value).toExponential().split("e");
    const digits = mantissa.replace(".", "");
    const decExponent = Number(exponent) + 1;

    let text: string;
    if (decExponent > 0 && decExponent < 8) {
        text =
            digits.length <= decExponent
                ? digits.padEnd(decExponent, "0") + ".0"
                : digits.slice(0, decExponent) + "." + digits.slice(decExponent);
    } else if (decExponent <= 0 && decExponent > -3) {
        text = "0." + "0".repeat(-decExponent) + digits;
    } else {
        const fraction = digits.length > 1 ? digits.slice(1) : "0";
        text = digits.charAt(0) + "." + fraction + "E" + String(decExponent - 1);
    }

    return negative ? "-" + text : text;
}

/**
 * A number this document must spell the way java spells a {@code double} rather than the
 * way {@code JSON.stringify} spells a javascript number.
 *
 * The tag is necessary because the distinction is invisible in the value: the four colour
 * components arrive from {@code ColorAdapter#write} as bare javascript numbers, and so do
 * {@code AnimationMeta}'s {@code width}, {@code height} and {@code frametime}. Upstream
 * writes the first four through {@code JsonWriter#value(double)} (gson 2.8.9 has no
 * {@code value(float)} overload, so java's {@code float} fields widen) and the last three
 * through {@code TypeAdapters.INTEGER}, which is plain {@code Integer#toString}. A blanket
 * "format every number as a double" rule in the writer would therefore be wrong in the
 * other direction — it would turn {@code "width":1} into {@code "width":1.0}.
 */
class JavaDouble {
    constructor(readonly value: number) {}
}

/** a {@link JsonValue} tree in which some numbers have been tagged as java doubles */
type GsonValue = JsonValue | JavaDouble | GsonValue[] | { [member: string]: GsonValue };

/**
 * Tags the four members of a written texture's {@code color} array as java doubles.
 *
 * This belongs in {@code resources/adapter/ColorAdapter}'s {@code write} — that is where
 * upstream's {@code ColorAdapter} hands gson four {@code float} fields, and where the
 * knowledge that they are floats actually lives. It sits here instead because the adapter's
 * return type is a plain {@link JsonValue} shared with every other reader in the resources
 * layer; moving the tag there is a wider change than this file. The member name is the only
 * thing linking the two, so: the {@code color} member of a texture is, and is only ever,
 * {@code ColorAdapter}'s four-element array.
 */
function tagColorComponents(element: JsonValue): GsonValue {
    if (!isJsonObject(element)) return element;

    const color = element["color"] ?? null;
    if (!isJsonArray(color)) return element;

    // the spread keeps `color` at its original position, so the member order gson's
    // reflective adapter produced survives
    return {
        ...element,
        color: color.map((component) =>
            typeof component === "number" ? new JavaDouble(component) : component,
        ),
    };
}

/**
 * Writes a json document the way gson's {@code JsonWriter} writes one: compact (no
 * indentation, no space after a separator) and in member-insertion order.
 *
 * Known remaining divergence from upstream's writer, and the reason this is not yet the
 * whole story: gson's default {@code htmlSafe} escapes {@code =}, {@code <}, {@code >},
 * {@code &} and {@code '} inside strings, and the gallery's gson instance never calls
 * {@code disableHtmlEscaping()}. The reference document therefore spells the base64
 * padding of every texture as {@code =} — 2074 times — where this writer emits a
 * literal {@code =}. The note that used to sit at the call-site called that harmless
 * because the parsed json VALUE is identical; that was true before this file was gated on
 * bytes and is not true now. See docs/deviations.md.
 *
 * {@code JSON.stringify} handles the string escaping until then. Its only other departures
 * from gson — U+2028/U+2029, which gson escapes and it does not, and lone surrogates, which
 * it escapes and gson does not — cannot occur in this document, whose strings are resource
 * keys and base64 data-urls.
 */
function writeGsonDocument(value: GsonValue): string {
    const out: string[] = [];
    writeGsonValue(value, out);
    return out.join("");
}

/**
 * A string, spelled the way gson's {@code JsonWriter#string} spells one with the default
 * {@code htmlSafe} on — which the gallery's gson instance never turns off, because it never
 * calls {@code disableHtmlEscaping()}.
 *
 * The whole difference from {@code JSON.stringify} is gson's `HTML_SAFE_REPLACEMENT_CHARS`
 * table: on top of the characters json requires escaping, gson escapes {@code <}, {@code >},
 * {@code &}, {@code =} and {@code '} as {@code \\u00XX}, so that a document embedded in an
 * html page cannot close a tag or an attribute. That is not cosmetic here — the textures
 * file spells every texture as a base64 data-url, and base64 padding is {@code =}. The
 * reference document carries {@code \\u003d} 2074 times where {@code JSON.stringify} writes
 * a literal {@code =}, and that was the first divergence left in this file once the numbers
 * agreed.
 *
 * The rest is transcribed from the same table:
 *
 * - {@code "} and {@code \\} take their short escapes, exactly as json requires.
 * - {@code \\t}, {@code \\b}, {@code \\n}, {@code \\r}, {@code \\f} take theirs.
 * - every other character below {@code 0x20} becomes {@code \\u00XX}, lower-case hex.
 * - {@code U+2028} and {@code U+2029} are escaped, because they terminate a line in
 *   javascript and would break a document embedded in a script; {@code JSON.stringify}
 *   leaves them literal.
 *
 * Everything above {@code 0x1f} that is not in that table is written literally, including
 * every non-ascii character — gson writes utf-8 rather than escaping. Note the one place
 * this deliberately does NOT follow {@code JSON.stringify}: a lone surrogate is written
 * through untouched, because gson writes java {@code char}s and does no pairing check.
 * Neither can occur in this document, whose strings are resource keys and base64 data-urls,
 * but the point of this function is to be right about the writer rather than about the
 * document that happens to be flowing through it today.
 */
function writeGsonString(value: string): string {
    const out: string[] = ['"'];
    for (const character of value) {
        const code = character.codePointAt(0) ?? 0;
        switch (character) {
            case '"':
                out.push('\\"');
                continue;
            case "\\":
                out.push("\\\\");
                continue;
            case "\t":
                out.push("\\t");
                continue;
            case "\b":
                out.push("\\b");
                continue;
            case "\n":
                out.push("\\n");
                continue;
            case "\r":
                out.push("\\r");
                continue;
            case "\f":
                out.push("\\f");
                continue;
            // the htmlSafe five
            case "<":
            case ">":
            case "&":
            case "=":
            case "'":
                out.push("\\u" + code.toString(16).padStart(4, "0"));
                continue;
            // gson escapes U+2028 and U+2029 too, so a document can sit inside a
            // <script>. Written as a code-point test rather than as case labels holding
            // the literal characters: both are invisible in an editor, so a literal one
            // is a character an unrelated edit can delete with nothing looking different.
            case "\u2028":
            case "\u2029":
                out.push("\\u" + code.toString(16).padStart(4, "0"));
                continue;
            default:
                if (code < 0x20) {
                    out.push("\\u" + code.toString(16).padStart(4, "0"));
                    continue;
                }
                out.push(character);
        }
    }
    out.push('"');
    return out.join("");
}

function writeGsonValue(value: GsonValue, out: string[]): void {
    if (value instanceof JavaDouble) {
        out.push(javaDoubleToString(value.value));
        return;
    }

    if (value === null) {
        out.push("null");
        return;
    }

    if (Array.isArray(value)) {
        out.push("[");
        let firstElement = true;
        for (const element of value) {
            if (!firstElement) out.push(",");
            firstElement = false;
            writeGsonValue(element, out);
        }
        out.push("]");
        return;
    }

    switch (typeof value) {
        case "boolean":
            out.push(value ? "true" : "false");
            return;
        case "string":
            out.push(writeGsonString(value));
            return;
        case "number":
            // Every untagged number in this document is a java `int` — AnimationMeta's
            // width/height/frametime and a FrameMeta's index/time — which gson writes as
            // `Integer#toString`. A fractional one would be a java `double` that lost its
            // tag on the way here, and would be written with the wrong spelling and no
            // sign that anything was wrong, so it fails loudly instead.
            if (!Number.isInteger(value))
                throw new Error(
                    "Refusing to write the untagged non-integer " +
                        String(value) +
                        ": a java double must be tagged so it can be spelled like one",
                );
            out.push(String(value));
            return;
        default: {
            out.push("{");
            let first = true;
            // gson's reflective adapter omits a null field rather than writing it
            // (`serializeNulls` is off by default), which the adapters already do — so
            // every member present here is a member upstream writes
            for (const [member, memberValue] of Object.entries(value)) {
                if (!first) out.push(",");
                first = false;
                out.push(writeGsonString(member), ":");
                writeGsonValue(memberValue, out);
            }
            out.push("}");
            return;
        }
    }
}

// #endregion

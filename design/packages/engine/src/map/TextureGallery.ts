import type { Key } from "@material-bluemap/shared";

/**
 * Phase D placeholder — replaced by the full port of map/TextureGallery.java (the
 * texture-id mapping plus its textures.json read/write).
 *
 * The renderer-factory interfaces of this wave only pass the gallery through to the
 * not-yet-ported mesher, so only the id-lookup below is declared — enough to keep the
 * placeholder from being a structurally-empty (any-accepting) type.
 */
export interface TextureGallery {
    /** upstream: {@code int get(@Nullable Key textureResourcePath)} */
    get(textureResourcePath: Key | null): number;
}

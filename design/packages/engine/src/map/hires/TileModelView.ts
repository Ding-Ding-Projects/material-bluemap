/**
 * Phase D placeholder — replaced by the full port of map/hires/TileModelView.java (the
 * windowed view over a {@code TileModel} that the mesher writes geometry through, with
 * the initialize/reset/add/rotate/scale/translate/transform surface).
 *
 * The renderer interfaces of this wave (BlockRenderer / EntityRenderer) only pass the
 * view through to the not-yet-ported mesher, so only the one member below is declared —
 * enough to keep the placeholder from being a structurally-empty (any-accepting) type.
 */
export interface TileModelView {
    /** upstream: {@code int add(int count)} */
    add(count: number): number;
}

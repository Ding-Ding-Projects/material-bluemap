import { parse } from "../../../adapter/JsonMapper.js";
import { PackMeta } from "../../PackMeta.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";

/**
 * upstream: resourcepack/ResourcePack.java @ v0.10.3-mc1.12
 * ({@code MINECRAFT_CLIENT_VERSION = "1.12.2"})
 *
 * The legacy branch of upstream is a *separate* ResourcePack implementation that only ever
 * read 1.12.2-era resources; it never had to tell the two eras apart, because the whole
 * jar was built for one of them. This port has one pipeline for both, so the era has to be
 * detected from the pack itself — {@code pack.mcmeta}'s {@code pack_format}.
 *
 * <p>The flattening (1.13) raised {@code pack_format} from 3 to 4, so
 * {@code pack_format <= 3} is exactly "this pack predates the flattening":
 * 1 = 1.6.1–1.8.9, 2 = 1.9–1.10.2, 3 = 1.11–1.12.2, 4 = 1.13+.</p>
 */

/** the highest {@code pack_format} that still uses pre-flattening resource-names */
export const LEGACY_MAX_PACK_FORMAT = 3;

/**
 * Whether the given pack-meta declares a pre-flattening pack.
 *
 * <p>The test is deliberately conservative: it takes the <em>largest</em> format the meta
 * declares anywhere ({@code pack_format} and, when present, {@code supported_formats}) and
 * only reports legacy when even that is pre-flattening. A pack that declares no format at
 * all reads as modern, because {@link PackMeta}'s absent-{@code pack_format} default is the
 * unbounded range — treating that as legacy would apply the compat layer to every pack
 * with a malformed or missing {@code pack.mcmeta}.</p>
 *
 * <p>The 1.21.9+ {@code min_format}/{@code max_format} members need no handling of their
 * own: a pack new enough to carry them leaves {@code pack_format} absent, and therefore
 * reads as modern through the same default.</p>
 */
export function isLegacyPackMeta(packMeta: PackMeta): boolean {
    const pack = packMeta.getPack();

    let maxFormat = pack.getPackFormat().getMaxInclusive();

    const supportedFormats = pack.getSupportedFormats();
    if (supportedFormats !== null)
        maxFormat = Math.max(maxFormat, supportedFormats.getMaxInclusive());

    return maxFormat <= LEGACY_MAX_PACK_FORMAT;
}

/**
 * Reads the {@code pack.mcmeta} of a pack-root, or null when there is none or it does not
 * parse.
 *
 * <p>upstream: {@code Pack#loadResourcePath} reads the very same file, but keeps the
 * result to itself (it is a local, used only for the feature-gate and the overlays), so
 * the compat layer reads it again rather than reaching into {@code Pack}.</p>
 */
export async function readPackMeta(root: PackPath): Promise<PackMeta | null> {
    const packMetaFile = root.resolve("pack.mcmeta");
    if (!(await packMetaFile.isRegularFile())) return null;

    try {
        return PackMeta.fromJson(parse(await packMetaFile.readText()));
    } catch {
        return null;
    }
}

/** Whether the pack rooted at the given path is a pre-flattening pack. */
export async function isLegacyPackRoot(root: PackPath): Promise<boolean> {
    const packMeta = await readPackMeta(root);
    if (packMeta === null) return false;
    return isLegacyPackMeta(packMeta);
}

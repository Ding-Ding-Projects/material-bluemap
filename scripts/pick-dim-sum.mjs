#!/usr/bin/env node
/**
 * Resolve the dim sum dish for a release, download its photo, and verify it.
 *
 * The photos are not stored in this repository. They live in the public
 * `Ding-Ding-Projects/dim-sum-photos` repository, published as GitHub Release
 * assets in capped volumes (one release cannot hold the whole 4,000-image set).
 * This script fetches the one image a release needs, at release time.
 *
 * Dish selection is derived from the release ordinal rather than from a ledger
 * file. A ledger would have to be committed back by CI, and a workflow that
 * pushes to its own repository is exactly the automation loop the project rules
 * forbid. The ordinal is monotonic, so a dish is never silently reused, and the
 * published releases themselves are the auditable mapping.
 *
 * Nothing here is generated. The image is an existing verified file downloaded
 * unchanged; on any failure this exits non-zero with the exact URL and status
 * rather than substituting anything.
 *
 * Usage:
 *   node scripts/pick-dim-sum.mjs --ordinal 1 --out dist/dim-sum
 *   node scripts/pick-dim-sum.mjs --ordinal 1 --out dist/dim-sum --json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CATALOG_REPO = "Ding-Ding-Projects/dim-sum-photos";
const CATALOG_INDEX_URL = `https://raw.githubusercontent.com/${CATALOG_REPO}/main/catalog/index.json`;
const RELEASES_API = `https://api.github.com/repos/${CATALOG_REPO}/releases?per_page=100`;

const PNG_SIGNATURE = "89504e470d0a1a0a";
const IEND = "49454e44";

function parseArgs(argv) {
    const args = { ordinal: 1, out: "dist/dim-sum", json: false };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--json") args.json = true;
        else if (arg === "--ordinal") args.ordinal = Number(argv[++i]);
        else if (arg.startsWith("--ordinal=")) args.ordinal = Number(arg.slice("--ordinal=".length));
        else if (arg === "--out") args.out = String(argv[++i]);
        else if (arg.startsWith("--out=")) args.out = arg.slice("--out=".length);
        else throw new Error(`unknown argument: ${arg}`);
    }
    if (!Number.isInteger(args.ordinal) || args.ordinal < 1) {
        throw new Error(`--ordinal must be a positive integer, got ${args.ordinal}`);
    }
    return args;
}

/** GitHub asks for a User-Agent; a token is optional since the repo is public. */
function headers(accept = "application/json") {
    const h = { accept, "user-agent": "worldlens-release" };
    const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
    if (token) h.authorization = `Bearer ${token}`;
    return h;
}

async function fetchJson(url) {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    return res.json();
}

/**
 * Build asset-name -> download-url over every `catalog*` release volume.
 * The volumes are not evenly sized (995 / 990 / 943 at time of writing), so the
 * part is resolved by asking, never by dividing the ordinal by a page size.
 */
async function loadAssetIndex() {
    const releases = await fetchJson(RELEASES_API);
    const volumes = releases.filter((r) => String(r.tag_name).startsWith("catalog"));
    if (volumes.length === 0) {
        throw new Error(`no catalog* releases found on ${CATALOG_REPO}`);
    }

    const index = new Map();
    for (const volume of volumes) {
        for (const asset of volume.assets ?? []) {
            if (!index.has(asset.name)) {
                index.set(asset.name, {
                    url: asset.browser_download_url,
                    size: asset.size,
                    volume: volume.tag_name,
                });
            }
        }
    }
    return index;
}

/** Verify the bytes really are a decodable PNG before anything ships them. */
function verifyPng(buffer, expectedSize) {
    const problems = [];
    if (buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
        problems.push("missing PNG signature");
    }
    if (!buffer.subarray(-8).toString("hex").includes(IEND)) {
        problems.push("missing IEND chunk");
    }
    if (typeof expectedSize === "number" && buffer.length !== expectedSize) {
        problems.push(`size ${buffer.length} does not match the manifest size ${expectedSize}`);
    }
    if (problems.length > 0) {
        throw new Error(`downloaded image failed verification: ${problems.join("; ")}`);
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function main() {
    const args = parseArgs(process.argv);
    const id = `hk-dish-${String(args.ordinal).padStart(4, "0")}`;

    const catalog = await fetchJson(CATALOG_INDEX_URL);
    const dishes = catalog.dishes ?? [];
    if (dishes.length === 0) throw new Error("catalog index contains no dishes");

    // Wrap around rather than failing once the ordinal passes the catalog size.
    // Reuse is announced in the output so it is never silent.
    const wrapped = ((args.ordinal - 1) % dishes.length) + 1;
    const wrappedId = `hk-dish-${String(wrapped).padStart(4, "0")}`;
    const dish = dishes.find((d) => d.id === wrappedId);
    if (!dish) throw new Error(`catalog has no record ${wrappedId} (asked for ${id})`);

    const assets = await loadAssetIndex();
    const fileName = `${dish.id}-${dish.slug}.png`;
    const asset = assets.get(fileName);
    if (!asset) {
        throw new Error(
            `no published asset named ${fileName} in any catalog volume. ` +
                `The catalog is still in progress, so this record has no image yet.`
        );
    }

    const res = await fetch(asset.url, { headers: headers("application/octet-stream") });
    if (!res.ok) throw new Error(`GET ${asset.url} -> ${res.status} ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const { width, height } = verifyPng(buffer, asset.size);

    const outPath = join(args.out, fileName);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);

    const result = {
        id: dish.id,
        slug: dish.slug,
        nameEn: dish.name?.en ?? dish.slug,
        nameZh: dish.name?.zhHant ?? "",
        jyutping: dish.jyutping ?? "",
        category: dish.category ?? "",
        altEn: dish.image?.alt?.en ?? `Photograph of ${dish.name?.en ?? dish.slug}`,
        altYue: dish.image?.alt?.yue ?? "",
        file: outPath,
        fileName,
        bytes: buffer.length,
        width,
        height,
        volume: asset.volume,
        sourceUrl: asset.url,
        reusedAfterWrap: wrapped !== args.ordinal,
    };

    if (args.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
        process.stdout.write(
            `${result.nameEn} · ${result.nameZh} (${result.jyutping})\n` +
                `  ${result.fileName}  ${width}x${height}  ${buffer.length} bytes\n` +
                `  volume ${result.volume}\n` +
                `  saved to ${outPath}\n` +
                (result.reusedAfterWrap
                    ? `  NOTE: ordinal ${args.ordinal} wrapped to ${wrapped}; the catalog has ${dishes.length} records\n`
                    : "")
        );
    }

    // Expose the fields the release job needs, without a second parse.
    if (process.env.GITHUB_OUTPUT) {
        const out = Object.entries({
            dish_name_en: result.nameEn,
            dish_name_zh: result.nameZh,
            dish_jyutping: result.jyutping,
            dish_file: result.file,
            dish_file_name: result.fileName,
            dish_alt_en: result.altEn,
            dish_volume: result.volume,
            dish_source_url: result.sourceUrl,
        })
            .map(([k, v]) => `${k}=${String(v).replace(/\r?\n/g, " ")}`)
            .join("\n");
        await writeFile(process.env.GITHUB_OUTPUT, out + "\n", { flag: "a" });
    }
}

main().catch((error) => {
    process.stderr.write(`pick-dim-sum failed: ${error.message}\n`);
    process.exit(1);
});

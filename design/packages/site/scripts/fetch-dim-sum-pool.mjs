#!/usr/bin/env node
/**
 * Build-time download of the dim sum photo pool.
 *
 * The site may not make a network request at runtime, so the dishes it can show are resolved,
 * verified and shrunk here and bundled as ordinary assets. Nothing is generated: every image
 * is an existing verified file from the public `Ding-Ding-Projects/dim-sum-photos` catalog,
 * downloaded unchanged, checked as a real decodable PNG, and then box-filtered down to a size
 * a web page should be shipping. The originals are around 2 MB each at 1254px square, which is
 * a photograph for a release page rather than a corner card that appears on one load in ten.
 *
 * The downloaded images are gitignored and never committed. They belong to that repository.
 *
 * Usage:
 *   node scripts/fetch-dim-sum-pool.mjs                 strict: any failure exits non-zero
 *   node scripts/fetch-dim-sum-pool.mjs --tolerant      warn and continue if the network fails
 *   node scripts/fetch-dim-sum-pool.mjs --count 12 --size 320 --force
 *
 * Tolerant mode exists so a build on a machine with no network still produces a working site.
 * It says loudly what is missing rather than pretending the pool is there.
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const CATALOG_REPO = "Ding-Ding-Projects/dim-sum-photos";
const CATALOG_INDEX_URL = `https://raw.githubusercontent.com/${CATALOG_REPO}/main/catalog/index.json`;
const RELEASES_API = `https://api.github.com/repos/${CATALOG_REPO}/releases?per_page=100`;

const PNG_SIGNATURE = "89504e470d0a1a0a";
const IEND = "49454e44";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(HERE, "..", "src", "dimsum", "generated");

function parseArgs(argv) {
    const args = { count: 12, size: 320, out: DEFAULT_OUT, tolerant: false, force: false };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--tolerant") args.tolerant = true;
        else if (arg === "--force") args.force = true;
        else if (arg === "--count") args.count = Number(argv[++i]);
        else if (arg === "--size") args.size = Number(argv[++i]);
        else if (arg === "--out") args.out = String(argv[++i]);
        else throw new Error(`unknown argument: ${arg}`);
    }
    if (!Number.isInteger(args.count) || args.count < 1 || args.count > 60) {
        throw new Error(`--count must be between 1 and 60, got ${args.count}`);
    }
    if (!Number.isInteger(args.size) || args.size < 64 || args.size > 1024) {
        throw new Error(`--size must be between 64 and 1024, got ${args.size}`);
    }
    return args;
}

function headers(accept = "application/json") {
    const value = { accept, "user-agent": "material-bluemap-site-build" };
    const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
    if (token) value.authorization = `Bearer ${token}`;
    return value;
}

async function fetchJson(url) {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    return res.json();
}

/** asset name -> download url, across every published `catalog*` volume. */
async function loadAssetIndex() {
    const releases = await fetchJson(RELEASES_API);
    const volumes = releases.filter((release) => String(release.tag_name).startsWith("catalog"));
    if (volumes.length === 0) throw new Error(`no catalog* releases found on ${CATALOG_REPO}`);

    const index = new Map();
    for (const volume of volumes) {
        for (const asset of volume.assets ?? []) {
            if (!index.has(asset.name)) {
                index.set(asset.name, { url: asset.browser_download_url, size: asset.size, volume: volume.tag_name });
            }
        }
    }
    return index;
}

/** Prove the bytes are a real PNG before anything is decoded or shipped. */
function verifyPng(buffer, expectedSize) {
    const problems = [];
    if (buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) problems.push("missing PNG signature");
    if (!buffer.subarray(-8).toString("hex").includes(IEND)) problems.push("missing IEND chunk");
    if (typeof expectedSize === "number" && buffer.length !== expectedSize) {
        problems.push(`size ${buffer.length} does not match the manifest size ${expectedSize}`);
    }
    if (problems.length > 0) throw new Error(`downloaded image failed verification: ${problems.join("; ")}`);
}

/**
 * Area-average downscale. A box filter rather than nearest neighbour, because a photograph
 * reduced by point sampling looks like a mistake, and because averaging is what makes the
 * re-encoded PNG small.
 */
function downscale(source, size) {
    const out = new PNG({ width: size, height: size });
    const scaleX = source.width / size;
    const scaleY = source.height / size;
    for (let y = 0; y < size; y++) {
        const y0 = Math.floor(y * scaleY);
        const y1 = Math.min(source.height, Math.max(y0 + 1, Math.ceil((y + 1) * scaleY)));
        for (let x = 0; x < size; x++) {
            const x0 = Math.floor(x * scaleX);
            const x1 = Math.min(source.width, Math.max(x0 + 1, Math.ceil((x + 1) * scaleX)));
            let r = 0;
            let g = 0;
            let b = 0;
            let n = 0;
            for (let sy = y0; sy < y1; sy++) {
                for (let sx = x0; sx < x1; sx++) {
                    const i = (sy * source.width + sx) << 2;
                    r += source.data[i];
                    g += source.data[i + 1];
                    b += source.data[i + 2];
                    n++;
                }
            }
            const o = (y * size + x) << 2;
            out.data[o] = Math.round(r / n);
            out.data[o + 1] = Math.round(g / n);
            out.data[o + 2] = Math.round(b / n);
            out.data[o + 3] = 255;
        }
    }
    return out;
}

/** Spread the choice across the whole catalog rather than taking the first N. */
function chooseDishes(dishes, assets, count) {
    const available = dishes.filter((dish) => assets.has(`${dish.id}-${dish.slug}.png`));
    if (available.length === 0) return [];
    const stride = Math.max(1, Math.floor(available.length / count));
    const chosen = [];
    for (let i = 0; chosen.length < count && i < available.length; i += stride) {
        chosen.push(available[i]);
    }
    return chosen;
}

async function poolIsCurrent(outDir, count, size) {
    try {
        const raw = JSON.parse(await readFile(join(outDir, "pool.json"), "utf8"));
        if (raw.imageSize !== size || raw.dishes?.length !== count) return false;
        for (const dish of raw.dishes) await access(join(outDir, dish.file));
        return true;
    } catch {
        return false;
    }
}

async function main() {
    const args = parseArgs(process.argv);

    if (!args.force && (await poolIsCurrent(args.out, args.count, args.size))) {
        process.stdout.write(`dim sum pool already has ${args.count} verified images at ${args.size}px; nothing to do\n`);
        return;
    }

    const catalog = await fetchJson(CATALOG_INDEX_URL);
    const dishes = catalog.dishes ?? [];
    if (dishes.length === 0) throw new Error("catalog index contains no dishes");

    const assets = await loadAssetIndex();
    const chosen = chooseDishes(dishes, assets, args.count);
    if (chosen.length === 0) throw new Error("no catalog record has a published image asset yet");

    await mkdir(args.out, { recursive: true });
    const records = [];
    for (const dish of chosen) {
        const fileName = `${dish.id}-${dish.slug}.png`;
        const asset = assets.get(fileName);
        const res = await fetch(asset.url, { headers: headers("application/octet-stream") });
        if (!res.ok) throw new Error(`GET ${asset.url} -> ${res.status} ${res.statusText}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        verifyPng(buffer, asset.size);

        const decoded = PNG.sync.read(buffer);
        const resized = downscale(decoded, args.size);
        const encoded = PNG.sync.write(resized, { colorType: 2, deflateLevel: 9, deflateStrategy: 2 });
        verifyPng(encoded);
        await writeFile(join(args.out, fileName), encoded);

        records.push({
            id: dish.id,
            slug: dish.slug,
            file: fileName,
            nameEn: dish.name?.en ?? dish.slug,
            nameZh: dish.name?.zhHant ?? "",
            jyutping: dish.jyutping ?? "",
            category: dish.category ?? "",
            altEn: dish.image?.alt?.en ?? `Photograph of ${dish.name?.en ?? dish.slug}`,
            altYue: dish.image?.alt?.yue ?? `${dish.name?.zhHant ?? dish.slug}嘅相`,
            width: args.size,
            height: args.size,
            bytes: encoded.length,
            originalBytes: buffer.length,
            volume: asset.volume,
            sourceUrl: asset.url,
        });
        process.stdout.write(`  ${records.length}/${chosen.length}  ${fileName}  ${encoded.length} bytes\n`);
    }

    const pool = {
        generatedAt: new Date().toISOString(),
        source: CATALOG_REPO,
        catalogStatus: catalog.catalogStatus ?? "unknown",
        imageSize: args.size,
        dishes: records,
    };
    await writeFile(join(args.out, "pool.json"), `${JSON.stringify(pool, null, 2)}\n`);
    const total = records.reduce((sum, record) => sum + record.bytes, 0);
    process.stdout.write(`dim sum pool: ${records.length} dishes, ${total} bytes total, written to ${args.out}\n`);
}

main().catch(async (error) => {
    const tolerant = process.argv.includes("--tolerant");
    process.stderr.write(`fetch-dim-sum-pool failed: ${error.message}\n`);
    if (!tolerant) process.exit(1);
    const args = parseArgs(process.argv.filter((arg) => arg !== "--tolerant"));
    const stillThere = await poolIsCurrent(args.out, args.count, args.size);
    process.stderr.write(
        stillThere
            ? "  --tolerant: keeping the pool already on disk. The build continues with it.\n"
            : "  --tolerant: no pool on disk. The build continues and the dim sum surprise will not appear.\n",
    );
});

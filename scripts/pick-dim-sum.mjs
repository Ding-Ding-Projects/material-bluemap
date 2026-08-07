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
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CATALOG_REPO = "Ding-Ding-Projects/dim-sum-photos";
const CATALOG_INDEX_URL = `https://raw.githubusercontent.com/${CATALOG_REPO}/main/catalog/index.json`;
const RELEASES_API = `https://api.github.com/repos/${CATALOG_REPO}/releases?per_page=100`;

const PNG_SIGNATURE = "89504e470d0a1a0a";
const MAX_CATALOG_DISHES = 10_000;
const MAX_RELEASES = 100;
const MAX_ASSETS_PER_RELEASE = 1_000;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

// These are deliberately language-friendly and syntax-hostile. The live catalog
// uses Traditional Chinese punctuation, Latin apostrophes, commas, full stops and
// hyphens; none of the workflow fields needs shell or Markdown delimiters.
const SAFE_HUMAN_TEXT = /^[\p{L}\p{M}\p{N} '’.,，。、「」《》·-]+$/u;
const SAFE_ID = /^hk-dish-\d{4}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+){0,20}$/;
const SAFE_VOLUME = /^catalog-v1[A-Za-z0-9._-]{0,88}$/;
const SAFE_FILE_NAME = /^hk-dish-\d{4}-[a-z0-9]+(?:-[a-z0-9]+){0,20}\.png$/;
const CONTROL_OR_SEPARATOR = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const PNG_CHUNK_TYPE = /^[A-Za-z]{4}$/;

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer)
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function metadataError(field, reason) {
  return new Error(
    `catalog metadata field ${field} failed validation: ${reason}`,
  );
}

function requireObject(field, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw metadataError(field, "expected an object");
  }
  return value;
}

function requireArray(field, value, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw metadataError(field, `expected ${min}-${max} records`);
  }
  return value;
}

function requireString(field, value, { min = 1, max, pattern } = {}) {
  if (typeof value !== "string") throw metadataError(field, "expected text");
  const length = [...value].length;
  if (length < min || length > max) {
    throw metadataError(field, `expected ${min}-${max} characters`);
  }
  if (CONTROL_OR_SEPARATOR.test(value)) {
    throw metadataError(
      field,
      "control and line-separator characters are forbidden",
    );
  }
  if (pattern && !pattern.test(value)) {
    throw metadataError(field, "contains characters outside the permitted set");
  }
  return value;
}

function validateDish(dish, expectedId) {
  requireObject("dish", dish);
  const id = requireString("dish.id", dish.id, {
    min: 12,
    max: 12,
    pattern: SAFE_ID,
  });
  if (id !== expectedId)
    throw metadataError("dish.id", "does not match the selected ordinal");
  const slug = requireString("dish.slug", dish.slug, {
    min: 1,
    max: 120,
    pattern: SAFE_SLUG,
  });
  const name = requireObject("dish.name", dish.name);
  const image = requireObject("dish.image", dish.image);
  const alt = requireObject("dish.image.alt", image.alt);

  return {
    id,
    slug,
    nameEn: requireString("dish.name.en", name.en, {
      max: 120,
      pattern: SAFE_HUMAN_TEXT,
    }),
    nameZh: requireString("dish.name.zhHant", name.zhHant, {
      max: 64,
      pattern: SAFE_HUMAN_TEXT,
    }),
    jyutping: requireString("dish.jyutping", dish.jyutping, {
      max: 120,
      pattern: SAFE_HUMAN_TEXT,
    }),
    category: requireString("dish.category", dish.category, {
      max: 80,
      pattern: SAFE_HUMAN_TEXT,
    }),
    // 235 is the longest real catalog alt currently observed. It is a supported
    // boundary, not an arbitrary test-only string.
    altEn: requireString("dish.image.alt.en", alt.en, {
      max: 235,
      pattern: SAFE_HUMAN_TEXT,
    }),
  };
}

function validateAsset(asset, volume, expectedFileName) {
  requireObject("asset", asset);
  const fileName = requireString("asset.name", asset.name, {
    max: 180,
    pattern: SAFE_FILE_NAME,
  });
  if (fileName !== expectedFileName) {
    throw metadataError("asset.name", "does not match the selected dish");
  }
  if (
    !Number.isSafeInteger(asset.size) ||
    asset.size < 24 ||
    asset.size > MAX_IMAGE_BYTES
  ) {
    throw metadataError("asset.size", `expected 24-${MAX_IMAGE_BYTES} bytes`);
  }
  const sourceUrl = requireString(
    "asset.browser_download_url",
    asset.browser_download_url,
    {
      max: 500,
    },
  );
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw metadataError(
      "asset.browser_download_url",
      "expected an absolute URL",
    );
  }
  const expectedPath = `/${CATALOG_REPO}/releases/download/${volume}/${fileName}`;
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== expectedPath
  ) {
    throw metadataError(
      "asset.browser_download_url",
      "expected the selected catalog release asset URL",
    );
  }
  return { fileName, size: asset.size, sourceUrl };
}

function workflowOutputText(result) {
  const entries = {
    dish_name_en: result.nameEn,
    dish_name_zh: result.nameZh,
    dish_file_name: result.fileName,
    dish_alt_en: result.altEn,
    dish_volume: result.volume,
  };
  for (const [key, value] of Object.entries(entries)) {
    requireString(`workflow.${key}`, value, { max: 235 });
  }
  return Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function parseArgs(argv) {
  const args = { ordinal: 1, out: "dist/dim-sum", json: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--ordinal") {
      if (i + 1 >= argv.length) throw new Error("--ordinal requires a value");
      args.ordinal = Number(argv[++i]);
    } else if (arg.startsWith("--ordinal="))
      args.ordinal = Number(arg.slice("--ordinal=".length));
    else if (arg === "--out") {
      if (i + 1 >= argv.length)
        throw metadataError("arguments.out", "requires a value");
      args.out = String(argv[++i]);
    } else if (arg.startsWith("--out=")) args.out = arg.slice("--out=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (
    !Number.isSafeInteger(args.ordinal) ||
    args.ordinal < 1 ||
    args.ordinal > 1_000_000
  ) {
    throw new Error("--ordinal must be an integer from 1 through 1000000");
  }
  requireString("arguments.out", args.out, { max: 1024 });
  return args;
}

/** GitHub asks for a User-Agent; a token is optional since the repo is public. */
function headers(accept = "application/json", authenticated = true) {
  const h = { accept, "user-agent": "material-bluemap-release" };
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (authenticated && token) h.authorization = `Bearer ${token}`;
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
  requireArray("releases", releases, 1, MAX_RELEASES);
  const volumes = releases.filter(
    (release) =>
      typeof release?.tag_name === "string" &&
      release.tag_name.startsWith("catalog"),
  );
  if (volumes.length === 0) {
    throw new Error(`no catalog* releases found on ${CATALOG_REPO}`);
  }

  const index = new Map();
  for (const volume of volumes) {
    const volumeName = requireString("release.tag_name", volume.tag_name, {
      max: 100,
      pattern: SAFE_VOLUME,
    });
    const releaseAssets = requireArray(
      `release.${volumeName}.assets`,
      volume.assets,
      0,
      MAX_ASSETS_PER_RELEASE,
    );
    for (const asset of releaseAssets) {
      if (typeof asset?.name !== "string" || !SAFE_FILE_NAME.test(asset.name))
        continue;
      if (!index.has(asset.name)) {
        index.set(asset.name, { asset, volume: volumeName });
      }
    }
  }
  return index;
}

/**
 * Verify the manifest size and PNG chunk/CRC structure before anything ships it.
 * This parses every chunk, validates every CRC and the critical-chunk ordering,
 * and bounds dimensions. It deliberately does not claim to inflate pixel data.
 */
function verifyPng(buffer, expectedSize) {
  const problems = [];
  if (buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    problems.push("missing PNG signature");
  }
  if (buffer.length < 24)
    problems.push("file is too short to contain PNG dimensions");
  if (typeof expectedSize === "number" && buffer.length !== expectedSize) {
    problems.push(
      `size ${buffer.length} does not match the manifest size ${expectedSize}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `downloaded image failed verification: ${problems.join("; ")}`,
    );
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawPalette = false;
  let sawImageData = false;
  let imageDataEnded = false;
  let sawEnd = false;
  let colorType = -1;
  const allowedCritical = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);

  while (offset < buffer.length) {
    if (buffer.length - offset < 12) {
      throw new Error(
        "downloaded image failed verification: truncated PNG chunk header",
      );
    }
    const length = buffer.readUInt32BE(offset);
    if (length > MAX_IMAGE_BYTES) {
      throw new Error(
        "downloaded image failed verification: PNG chunk exceeds the byte limit",
      );
    }
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > buffer.length) {
      throw new Error(
        "downloaded image failed verification: truncated PNG chunk payload",
      );
    }
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (!PNG_CHUNK_TYPE.test(type)) {
      throw new Error(
        "downloaded image failed verification: invalid PNG chunk type",
      );
    }
    if (type[2] !== type[2].toUpperCase()) {
      throw new Error(
        "downloaded image failed verification: PNG reserved chunk bit is set",
      );
    }
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(buffer.subarray(offset + 4, offset + 8 + length));
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `downloaded image failed verification: ${type} chunk CRC mismatch`,
      );
    }
    if (/[A-Z]/.test(type[0]) && !allowedCritical.has(type)) {
      throw new Error(
        `downloaded image failed verification: unknown critical ${type} chunk`,
      );
    }

    if (type === "IHDR") {
      if (sawHeader || offset !== 8 || length !== 13) {
        throw new Error(
          "downloaded image failed verification: invalid IHDR chunk",
        );
      }
      sawHeader = true;
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      const bitDepth = buffer[offset + 16];
      colorType = buffer[offset + 17];
      const compression = buffer[offset + 18];
      const filter = buffer[offset + 19];
      const interlace = buffer[offset + 20];
      if (
        compression !== 0 ||
        filter !== 0 ||
        (interlace !== 0 && interlace !== 1)
      ) {
        throw new Error(
          "downloaded image failed verification: unsupported IHDR methods",
        );
      }
      const validDepths = new Map([
        [0, [1, 2, 4, 8, 16]],
        [2, [8, 16]],
        [3, [1, 2, 4, 8]],
        [4, [8, 16]],
        [6, [8, 16]],
      ]);
      if (!validDepths.get(colorType)?.includes(bitDepth)) {
        throw new Error(
          "downloaded image failed verification: invalid IHDR bit-depth/color pair",
        );
      }
    } else if (!sawHeader) {
      throw new Error(
        "downloaded image failed verification: IHDR is not the first chunk",
      );
    } else if (type === "PLTE") {
      if (
        sawPalette ||
        sawImageData ||
        colorType === 0 ||
        colorType === 4 ||
        length < 3 ||
        length > 768 ||
        length % 3 !== 0
      ) {
        throw new Error(
          "downloaded image failed verification: invalid PLTE placement or size",
        );
      }
      sawPalette = true;
    } else if (type === "IDAT") {
      if (imageDataEnded || (colorType === 3 && !sawPalette)) {
        throw new Error(
          "downloaded image failed verification: invalid IDAT ordering",
        );
      }
      sawImageData = true;
    } else if (type === "IEND") {
      if (length !== 0 || !sawImageData || chunkEnd !== buffer.length) {
        throw new Error(
          "downloaded image failed verification: invalid terminal IEND chunk",
        );
      }
      sawEnd = true;
    } else if (sawImageData) {
      imageDataEnded = true;
    }
    offset = chunkEnd;
  }

  if (!sawHeader || !sawImageData || !sawEnd) {
    throw new Error(
      "downloaded image failed verification: missing required PNG chunks",
    );
  }
  if (width < 1 || height < 1 || width > 20_000 || height > 20_000) {
    throw new Error(
      "downloaded image failed verification: implausible PNG dimensions",
    );
  }
  return { width, height };
}

async function readBoundedResponse(response, limit = MAX_IMAGE_BYTES) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new Error(
        "downloaded image failed verification: invalid Content-Length",
      );
    }
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared > limit) {
      throw new Error(
        "downloaded image failed verification: Content-Length exceeds byte limit",
      );
    }
  }
  if (!response.body)
    throw new Error(
      "downloaded image failed verification: response has no body",
    );

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error(
          "downloaded image failed verification: streamed body exceeds byte limit",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function main() {
  const args = parseArgs(process.argv);
  const id = `hk-dish-${String(args.ordinal).padStart(4, "0")}`;

  const catalog = requireObject("catalog", await fetchJson(CATALOG_INDEX_URL));
  const dishes = requireArray(
    "catalog.dishes",
    catalog.dishes,
    1,
    MAX_CATALOG_DISHES,
  );

  // Wrap around rather than failing once the ordinal passes the catalog size.
  // Reuse is announced in the output so it is never silent.
  const wrapped = ((args.ordinal - 1) % dishes.length) + 1;
  const wrappedId = `hk-dish-${String(wrapped).padStart(4, "0")}`;
  const rawDish = dishes.find((dish) => dish?.id === wrappedId);
  if (!rawDish)
    throw new Error(`catalog has no record ${wrappedId} (asked for ${id})`);
  const dish = validateDish(rawDish, wrappedId);

  const assets = await loadAssetIndex();
  const fileName = `${dish.id}-${dish.slug}.png`;
  if (!SAFE_FILE_NAME.test(fileName))
    throw metadataError("asset.name", "derived name is invalid");
  const assetEntry = assets.get(fileName);
  if (!assetEntry) {
    throw new Error(
      `no published asset named ${fileName} in any catalog volume. ` +
        `The catalog is still in progress, so this record has no image yet.`,
    );
  }

  const asset = validateAsset(assetEntry.asset, assetEntry.volume, fileName);
  // The photo repository is public. Never forward the release token to a URL
  // obtained from network metadata, even after validating the expected origin.
  const res = await fetch(asset.sourceUrl, {
    headers: headers("application/octet-stream", false),
  });
  if (!res.ok)
    throw new Error(
      `GET ${asset.sourceUrl} -> ${res.status} ${res.statusText}`,
    );
  const buffer = await readBoundedResponse(res);
  const { width, height } = verifyPng(buffer, asset.size);

  const outPath = join(args.out, fileName);
  if (dirname(resolve(outPath)) !== resolve(args.out)) {
    throw metadataError(
      "asset.name",
      "resolved outside the requested output directory",
    );
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buffer);

  const result = {
    id: dish.id,
    slug: dish.slug,
    nameEn: dish.nameEn,
    nameZh: dish.nameZh,
    jyutping: dish.jyutping,
    category: dish.category,
    altEn: dish.altEn,
    file: outPath,
    fileName,
    bytes: buffer.length,
    width,
    height,
    volume: assetEntry.volume,
    sourceUrl: asset.sourceUrl,
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
          : ""),
    );
  }

  // Expose the fields the release job needs, without a second parse.
  if (process.env.GITHUB_OUTPUT) {
    const out = workflowOutputText(result);
    await writeFile(process.env.GITHUB_OUTPUT, out + "\n", { flag: "a" });
  }
}

export {
  parseArgs,
  readBoundedResponse,
  validateAsset,
  validateDish,
  verifyPng,
  workflowOutputText,
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(`pick-dim-sum failed: ${error.message}\n`);
    process.exit(1);
  });
}

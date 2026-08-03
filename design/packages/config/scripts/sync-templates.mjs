/**
 * Copies upstream BlueMap's seven config templates into `src/templates/sources.ts`.
 *
 * The app ships without the vendored Java tree beside it, so the templates have
 * to be embedded. Embedding them by hand would guarantee a typo, and a typo in a
 * template is a config file that reads wrong to every person who opens it, so
 * this script does the copying and `sources.test.ts` proves the copy is still
 * byte for byte identical to the vendored file.
 *
 * Run from anywhere:  node design/packages/config/scripts/sync-templates.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const vendorDir = join(repoRoot, "vendor", "BlueMap", "common", "src", "main", "resources", "de", "bluecolored", "bluemap", "config");
const outFile = join(here, "..", "src", "templates", "sources.ts");

/** [exported constant, path under the vendor config dir, name BlueMap resolves it by] */
const TEMPLATES = [
    ["CORE_TEMPLATE", "core.conf", "core"],
    ["WEBAPP_TEMPLATE", "webapp.conf", "webapp"],
    ["WEBSERVER_TEMPLATE", "webserver.conf", "webserver"],
    ["PLUGIN_TEMPLATE", "plugin.conf", "plugin"],
    ["MAP_TEMPLATE", "maps/map.conf", "maps/map"],
    ["FILE_STORAGE_TEMPLATE", "storages/file.conf", "storages/file"],
    ["SQL_STORAGE_TEMPLATE", "storages/sql.conf", "storages/sql"],
];

/** Emits a template literal, escaping only what JavaScript would otherwise eat. */
function literal(text) {
    return "`" + text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
}

let out = `/**
 * The seven configuration templates, copied byte for byte from upstream BlueMap.
 *
 * Source: \`vendor/BlueMap/common/src/main/resources/de/bluecolored/bluemap/config/\`
 *
 * These are embedded rather than read from disk because the app ships without
 * the vendored Java tree beside it. \`sources.test.ts\` compares every string here
 * against the vendored file byte for byte whenever that tree is present, so the
 * copies cannot quietly drift from upstream.
 *
 * The \`\\\${...}\` sequences below are BlueMap's own template variables, escaped so
 * that JavaScript leaves them alone. See \`template.ts\` for how they expand.
 *
 * DO NOT EDIT BY HAND. Regenerate with:
 *   node design/packages/config/scripts/sync-templates.mjs
 */

`;

for (const [name, file] of TEMPLATES) {
    const text = readFileSync(join(vendorDir, file), "utf8").replaceAll("\r\n", "\n");
    out += `/** Upstream \`${file}\`. */\nexport const ${name} = ${literal(text)};\n\n`;
}

out += "/** Every template, keyed by the config name BlueMap resolves it with. */\nexport const CONFIG_TEMPLATES = {\n";
for (const [name, , key] of TEMPLATES) {
    out += `    ${JSON.stringify(key)}: ${name},\n`;
}
out += "} as const;\n\n/** The config names BlueMap ships a template for. */\nexport type ConfigTemplateName = keyof typeof CONFIG_TEMPLATES;\n";

writeFileSync(outFile, out, "utf8");
process.stdout.write(`wrote ${outFile} (${out.length} bytes, ${TEMPLATES.length} templates)\n`);

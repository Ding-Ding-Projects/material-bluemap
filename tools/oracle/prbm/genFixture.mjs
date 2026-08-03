import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
const dest = process.argv[3];
const text = readFileSync(src, "utf8");

const cases = [];
let current = null;
for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("### ")) {
        current = { name: line.slice(4) };
        cases.push(current);
        continue;
    }
    if (current === null || line === "") continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    if (key === "size") current.size = Number(value);
    else if (key === "materialIndex")
        current.materialIndex = value === "" ? [] : value.split(",").map(Number);
    else if (key === "positionBits")
        current.positionBits = value === "" ? [] : value.split(",").map(Number);
    else if (key === "prbm") current.prbm = value;
}

function wrap(str, indent, width) {
    const parts = [];
    for (let i = 0; i < str.length; i += width) parts.push(str.slice(i, i + width));
    if (parts.length === 0) parts.push("");
    return parts.map((p) => `${indent}"${p}"`).join(" +\n");
}

function numbers(list, indent, perLine) {
    if (list.length === 0) return `${indent}// (none)\n`;
    const lines = [];
    for (let i = 0; i < list.length; i += perLine) {
        lines.push(indent + list.slice(i, i + perLine).join(", ") + ",");
    }
    return lines.join("\n") + "\n";
}

let out = `/**
 * Reference output of the REAL upstream mesher, captured from
 * \`vendor/BlueMap/implementations/cli/build/libs/cli-5.22-27-shadow.jar\` by running
 * \`de.bluecolored.bluemap.core.map.hires.ArrayTileModel\` + \`PRBMWriter\` over the models
 * that \`prbmOracleFixture.ts\` rebuilds. Generated — do not hand-edit; regenerate by
 * re-running the oracle program described in that file's header.
 *
 * \`prbm\` is the writer's complete output as lowercase hex (uncompressed; the storage
 * layer is what gzips it). \`positionBits\` is \`Float.floatToIntBits\` of every entry of
 * the model's position array after \`sort()\`, so a float that is one ulp off is a
 * failing test rather than a tile that merely looks right.
 */

export interface PrbmOracleCase {
    /** upstream \`model.size\` after sort() */
    readonly size: number;
    /** upstream \`model.materialIndex[0..size)\` after sort() */
    readonly materialIndex: readonly number[];
    /** \`Float.floatToIntBits\` of \`model.position[0..size*9)\` after sort() */
    readonly positionBits: readonly number[];
    /** the complete PRBMWriter output, lowercase hex */
    readonly prbm: string;
}

`;

for (const c of cases) {
    out += `export const ${c.name}: PrbmOracleCase = {\n`;
    out += `    size: ${c.size},\n`;
    out += `    materialIndex: [\n${numbers(c.materialIndex, "        ", 20)}    ],\n`;
    out += `    positionBits: [\n${numbers(c.positionBits, "        ", 6)}    ],\n`;
    out += `    prbm:\n${wrap(c.prbm, "        ", 96)},\n`;
    out += `};\n\n`;
}

out += `export const ORACLE_CASES: Readonly<Record<string, PrbmOracleCase>> = {\n`;
for (const c of cases) out += `    ${c.name},\n`;
out += `};\n`;

writeFileSync(dest, out);
console.log("wrote", dest, "cases:", cases.map((c) => c.name).join(", "));

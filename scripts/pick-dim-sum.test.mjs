import assert from "node:assert/strict";
import { test } from "node:test";

import {
    parseArgs,
    validateAsset,
    validateDish,
    workflowOutputText,
} from "./pick-dim-sum.mjs";

function validDish(altEn = "Warm tea-house photograph of Classic Har Gow") {
    return {
        id: "hk-dish-0001",
        slug: "classic-har-gow",
        name: { en: "Classic Har Gow", zhHant: "蝦餃。「茶樓」" },
        jyutping: "haa1 gaau2",
        category: "steamed-dim-sum",
        image: { alt: { en: altEn } },
    };
}

test("legitimate Traditional Chinese punctuation and a real 235-character alt are accepted", () => {
    const prefix = "Warm tea-house photograph of Classic Har Gow, showing ";
    const alt = prefix + "a".repeat(235 - prefix.length);
    assert.equal([...alt].length, 235);
    const result = validateDish(validDish(alt), "hk-dish-0001");
    assert.equal(result.nameZh, "蝦餃。「茶樓」");
    assert.equal(result.altEn, alt);
});

test("an alt beyond the supported catalog boundary is rejected", () => {
    assert.throws(() => validateDish(validDish("a".repeat(236)), "hk-dish-0001"), /235/);
});

test("missing and wrong-type catalog fields are rejected without echoing their values", () => {
    const missing = validDish();
    delete missing.name;
    assert.throws(() => validateDish(missing, "hk-dish-0001"), /dish\.name/);

    const wrongType = validDish();
    wrongType.image.alt.en = 42;
    assert.throws(() => validateDish(wrongType, "hk-dish-0001"), /expected text/);
});

test("control, line-separator, shell and Markdown syntax is rejected without disclosure", () => {
    for (const unsafe of ["\n", "\r", "\0", "\u2028", "`", "$", '"', ";", "&", "|", "<", ">", "[", "]"]) {
        const dish = validDish();
        dish.name.en = `Unsafe${unsafe}metadata`;
        assert.throws(
            () => validateDish(dish, "hk-dish-0001"),
            (error) => {
                assert.match(error.message, /dish\.name\.en/);
                assert.equal(error.message.includes(dish.name.en), false);
                return true;
            },
        );
    }
});

test("asset metadata is bounded to the selected public catalog release", () => {
    const fileName = "hk-dish-0001-classic-har-gow.png";
    const asset = validateAsset(
        {
            name: fileName,
            size: 4096,
            browser_download_url:
                "https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1.1/" +
                fileName,
        },
        "catalog-v1.1",
        fileName,
    );
    assert.equal(asset.fileName, fileName);
    assert.throws(
        () =>
            validateAsset(
                {
                    name: fileName,
                    size: 4096,
                    browser_download_url: `https://example.invalid/${fileName}`,
                },
                "catalog-v1.1",
                fileName,
            ),
        /selected catalog release asset URL/,
    );
});

test("workflow output contains only the five consumed, validated single-line fields", () => {
    const dish = validateDish(validDish(), "hk-dish-0001");
    const output = workflowOutputText({
        ...dish,
        fileName: "hk-dish-0001-classic-har-gow.png",
        volume: "catalog-v1.1",
    });
    assert.deepEqual(
        output.split("\n").map((line) => line.slice(0, line.indexOf("="))),
        ["dish_name_en", "dish_name_zh", "dish_file_name", "dish_alt_en", "dish_volume"],
    );
});

test("argument bounds reject missing values and extreme ordinals", () => {
    assert.throws(() => parseArgs(["node", "script", "--ordinal", "0"]), /1 through 1000000/);
    assert.throws(() => parseArgs(["node", "script", "--ordinal", "1000001"]), /1 through 1000000/);
    assert.throws(() => parseArgs(["node", "script", "--out"]), /arguments\.out/);
});

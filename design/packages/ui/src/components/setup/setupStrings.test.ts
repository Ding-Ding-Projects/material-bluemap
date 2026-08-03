import { describe, expect, it } from "vitest";
import {
    CONSENT_QUOTE,
    CONSENT_QUOTE_TRANSLATION,
    EXACT,
    FIXED,
    MOJANG_DOWNLOAD_HOST,
    MOJANG_EULA_URL,
    VOICED,
    exactKeys,
    isExactKey,
    isVoicedKey,
    voicedKeys,
} from "./setupStrings.js";

/** `{name}` placeholders in a template, as a sorted list. */
function placeholders(template: string): string[] {
    return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
}

describe("the voiced catalogue", () => {
    it("carries five levels in each language for every entry", () => {
        for (const key of voicedKeys()) {
            const entry = VOICED[key];
            expect(entry.en, `${key} english`).toHaveLength(5);
            expect(entry.yue, `${key} cantonese`).toHaveLength(5);
        }
    });

    it("has no empty string at any level", () => {
        for (const key of voicedKeys()) {
            const entry = VOICED[key];
            for (const level of [0, 1, 2, 3, 4]) {
                expect(entry.en[level]?.trim(), `${key} en level ${level + 1}`).toBeTruthy();
                expect(entry.yue[level]?.trim(), `${key} yue level ${level + 1}`).toBeTruthy();
            }
        }
    });

    it("keeps the same placeholders at every level, so a level cannot drop a value", () => {
        for (const key of voicedKeys()) {
            const entry = VOICED[key];
            const expectedEn = placeholders(entry.en[0]);
            const expectedYue = placeholders(entry.yue[0]);
            for (const level of [1, 2, 3, 4]) {
                expect(placeholders(entry.en[level] ?? ""), `${key} en level ${level + 1}`).toEqual(
                    expectedEn,
                );
                expect(
                    placeholders(entry.yue[level] ?? ""),
                    `${key} yue level ${level + 1}`,
                ).toEqual(expectedYue);
            }
        }
    });

    it("uses the same placeholders in both languages", () => {
        for (const key of voicedKeys()) {
            const entry = VOICED[key];
            expect(placeholders(entry.yue[0]), key).toEqual(placeholders(entry.en[0]));
        }
    });
});

describe("the fixed and exact catalogues", () => {
    it("carries both languages for every entry", () => {
        for (const [key, value] of Object.entries({ ...FIXED, ...EXACT })) {
            expect(value.en.trim(), `${key} english`).toBeTruthy();
            expect(value.yue.trim(), `${key} cantonese`).toBeTruthy();
        }
    });

    it("keeps the exact and voiced catalogues disjoint", () => {
        for (const key of exactKeys()) {
            expect(isVoicedKey(key), `${key} must not be voiced`).toBe(false);
            expect(isExactKey(key)).toBe(true);
        }
        for (const key of voicedKeys()) {
            expect(isExactKey(key), `${key} must not be exact`).toBe(false);
        }
    });

    it("states both outcomes of the consent question", () => {
        // Declining is a real choice, so what it costs and what it does not are both
        // written down rather than left for somebody to discover.
        expect(EXACT["consent.ifAccept"].en).toContain("downloads the matching Minecraft client");
        expect(EXACT["consent.ifDecline"].en).toContain("remote BlueMap servers still work");
        expect(EXACT["consent.ifDecline"].en).toContain("until you accept it in Settings");
    });

    it("says the question is asked once and is reversible", () => {
        expect(EXACT["consent.askedOnce"].en).toContain("asked once");
        expect(EXACT["consent.reversible"].en).toContain("Settings");
    });
});

describe("the consent quotation", () => {
    it("is upstream BlueMap's own wording, verbatim", () => {
        // Copied from vendor/BlueMap/common/src/main/resources/de/bluecolored/bluemap/
        // config/core.conf, the comment above `accept-download`. If upstream rewords it,
        // this test fails and the copy is updated, rather than the app quietly quoting a
        // document nobody agreed to.
        expect(CONSENT_QUOTE).toEqual([
            "By changing the setting (accept-download) below to TRUE you are indicating that you have accepted Mojang's EULA (https://account.mojang.com/documents/minecraft_eula),",
            "you confirm that you own a license to Minecraft (Java Edition),",
            "and you agree that BlueMap will download and use a Minecraft client file (depending on the Minecraft version) from Mojang's servers (https://piston-meta.mojang.com/) for you.",
            "This file contains resources that belong to Mojang and you must not redistribute it or do anything else that is not compliant with Mojang's EULA.",
        ]);
    });

    it("names the document and the download host inside the quotation", () => {
        expect(CONSENT_QUOTE.join(" ")).toContain(MOJANG_EULA_URL);
        expect(CONSENT_QUOTE.join(" ")).toContain(MOJANG_DOWNLOAD_HOST);
    });

    it("has one translated line per quoted line", () => {
        expect(CONSENT_QUOTE_TRANSLATION).toHaveLength(CONSENT_QUOTE.length);
        for (const line of CONSENT_QUOTE_TRANSLATION) expect(line.trim()).toBeTruthy();
    });

    it("agrees with the main process about which document is being accepted", () => {
        // packages/app/src/main/consent.ts stores this URL in the record and refuses a
        // stored answer whose document does not match, so the two must not drift.
        expect(MOJANG_EULA_URL).toBe("https://account.mojang.com/documents/minecraft_eula");
    });
});

describe("user-facing copy", () => {
    it("contains no em-dashes", () => {
        const everything = [
            ...CONSENT_QUOTE,
            ...CONSENT_QUOTE_TRANSLATION,
            ...Object.values({ ...FIXED, ...EXACT }).flatMap((entry) => [entry.en, entry.yue]),
            ...Object.values(VOICED).flatMap((entry) => [...entry.en, ...entry.yue]),
        ];
        for (const text of everything) expect(text).not.toContain("—");
    });
});

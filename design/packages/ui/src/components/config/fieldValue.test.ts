import { describe, expect, it } from "vitest";
import { descriptorFor, type FieldMeta } from "@worldlens/config";
import {
    JAVA_DOUBLE_MAX,
    JAVA_INT_MAX,
    JAVA_INT_MIN,
    acceptsAbsence,
    alphaPart,
    blankValueFor,
    decimalsForStep,
    isDefaultValue,
    isUnboundedSentinel,
    normalizeHexColor,
    opaquePart,
    parseNumberInput,
    searchTextForField,
    toControlValue,
    valueToText,
    withAlpha,
} from "./fieldValue.js";

function field(path: string): FieldMeta {
    const found = descriptorFor("map").fields.find((candidate) => candidate.path === path);
    if (found === undefined) throw new Error(`no such field: ${path}`);
    return found;
}

describe("number entry", () => {
    it("reads a plain number", () => {
        expect(parseNumberInput("42", true)).toBe(42);
        expect(parseNumberInput("42.5", false)).toBe(42.5);
    });

    it("truncates toward zero for an integer control rather than rounding", () => {
        expect(parseNumberInput("42.9", true)).toBe(42);
        expect(parseNumberInput("-42.9", true)).toBe(-42);
    });

    it("reads a cleared field as null rather than as zero", () => {
        expect(parseNumberInput("", true)).toBeNull();
        expect(parseNumberInput("   ", true)).toBeNull();
        expect(parseNumberInput(null, true)).toBeNull();
    });

    it("treats a lone sign as still being typed, not as invalid", () => {
        expect(parseNumberInput("-", true)).toBeNull();
        expect(parseNumberInput("+", true)).toBeNull();
    });

    it("refuses text rather than silently coercing it to zero", () => {
        expect(parseNumberInput("north", true)).toBe("invalid");
        expect(parseNumberInput("12abc", true)).toBe("invalid");
    });

    it("refuses infinities, which HOCON cannot represent", () => {
        expect(parseNumberInput("Infinity", false)).toBe("invalid");
    });

    it("accepts a negative coordinate, because zero is a real value and so is -64", () => {
        expect(parseNumberInput("-64", true)).toBe(-64);
    });
});

describe("Java's unbounded sentinels", () => {
    it("recognises the three BlueMap actually writes", () => {
        expect(isUnboundedSentinel(JAVA_INT_MIN)).toBe(true);
        expect(isUnboundedSentinel(JAVA_INT_MAX)).toBe(true);
        expect(isUnboundedSentinel(JAVA_DOUBLE_MAX)).toBe(true);
        expect(isUnboundedSentinel(0)).toBe(false);
    });

    it("renders them as words rather than as coordinates", () => {
        expect(valueToText(JAVA_INT_MIN)).toBe("no limit");
        expect(valueToText(JAVA_DOUBLE_MAX)).toBe("unlimited");
    });
});

describe("colours", () => {
    it("normalises every length BlueMap's own parser accepts", () => {
        expect(normalizeHexColor("#abc")).toBe("#aabbcc");
        expect(normalizeHexColor("#abcd")).toBe("#aabbccdd");
        expect(normalizeHexColor("#7DABFF")).toBe("#7dabff");
        expect(normalizeHexColor("7dabff")).toBe("#7dabff");
        expect(normalizeHexColor("#7dabff80")).toBe("#7dabff80");
    });

    it("refuses something that is not a colour instead of guessing", () => {
        expect(normalizeHexColor("blue")).toBeNull();
        expect(normalizeHexColor("#12")).toBeNull();
        expect(normalizeHexColor("")).toBeNull();
    });

    it("splits and rebuilds alpha without losing the opaque part", () => {
        expect(opaquePart("#7dabff80")).toBe("#7dabff");
        expect(alphaPart("#7dabff80")).toBeCloseTo(128 / 255, 5);
        expect(alphaPart("#7dabff")).toBe(1);
        expect(withAlpha("#7dabff", 1)).toBe("#7dabff");
        expect(withAlpha("#7dabff", 0.5)).toBe("#7dabff80");
    });
});

describe("control values", () => {
    it("fills in a usable value for every control kind when the file says nothing", () => {
        expect(toControlValue({ kind: "switch" }, undefined)).toBe(false);
        expect(toControlValue({ kind: "number", integer: true }, undefined)).toBe(0);
        expect(toControlValue({ kind: "text" }, undefined)).toBe("");
        expect(toControlValue({ kind: "list", itemLabel: "x", unique: false, item: { kind: "text" } }, undefined)).toEqual([]);
        expect(toControlValue({ kind: "key-value", keyLabel: "k", valueLabel: "v", secretKeys: [] }, undefined)).toEqual({});
    });

    it("builds a vector with every axis present", () => {
        const value = toControlValue({ kind: "vector", integer: true, axes: [{ key: "x", label: "X" }, { key: "z", label: "Z" }] }, undefined);
        expect(value).toEqual({ x: 0, z: 0 });
    });

    it("starts a new list item at the control's own minimum rather than zero", () => {
        expect(blankValueFor({ kind: "number", integer: true, min: 5 })).toBe(5);
    });
});

describe("search text", () => {
    it("includes the label, the key, the Java field and upstream's own explanation", () => {
        const text = searchTextForField(field("ambient-light"), 0.1);
        expect(text).toContain("ambient-light");
        expect(text).toContain("ambientLight");
        expect(text.toLowerCase()).toContain("light");
    });

    it("leaves a credential's value out, so typing a password fragment cannot confirm one", () => {
        const secret: FieldMeta = { ...field("storage"), secret: true };
        const text = searchTextForField(secret, "hunter2");
        expect(text).not.toContain("hunter2");
        expect(text).toContain(secret.label);
    });
});

describe("default detection", () => {
    it("compares against the Java class default, structurally", () => {
        expect(isDefaultValue(field("sky-color"), "#7dabff")).toBe(true);
        expect(isDefaultValue(field("sky-color"), "#000000")).toBe(false);
        expect(isDefaultValue(field("start-pos"), { x: 0, z: 0 })).toBe(true);
    });

    it("knows which fields accept being absent entirely", () => {
        expect(acceptsAbsence(field("world"))).toBe(true);
        expect(acceptsAbsence(field("sky-color"))).toBe(false);
    });
});

describe("step precision", () => {
    it("counts the decimals a step implies", () => {
        expect(decimalsForStep(1)).toBe(0);
        expect(decimalsForStep(0.05)).toBe(2);
    });
});

import { describe, expect, it } from "vitest";
import {
    IDENTITY_STEP_PATHS,
    OWNED_BY_OTHER_STEPS,
    REQUEST_BACKED_PATHS,
    STORAGE_STEP_PATHS,
    WIZARD_STEPS,
    WIZARD_STEP_META,
    WORLD_STEP_PATHS,
    defaultOpenGroups,
    mapDescriptor,
    optionFields,
    optionGroups,
    reachesRender,
    stepOf,
} from "./wizardSteps.js";

describe("coverage", () => {
    it("puts every map setting on exactly one step", () => {
        // This is the test the whole design exists for. The options step is the
        // complement of the hand-named sets rather than an enumeration, so a
        // setting added to the schema lands on it automatically; this proves that
        // no setting can fall between the steps, today or after that addition.
        const fields = mapDescriptor().fields;
        const counted = new Map<string, number>();

        for (const field of fields) {
            const step = stepOf(field.path);
            counted.set(step, (counted.get(step) ?? 0) + 1);
        }

        const options = optionFields();
        expect(options).toHaveLength(fields.length - OWNED_BY_OTHER_STEPS.size);
        expect(counted.get("options")).toBe(options.length);

        const reachable = new Set([
            ...WORLD_STEP_PATHS,
            ...IDENTITY_STEP_PATHS,
            ...STORAGE_STEP_PATHS,
            ...options.map((field) => field.path),
        ]);
        for (const field of fields) {
            expect(reachable.has(field.path), `${field.path} is on no step`).toBe(true);
        }
        expect(reachable.size).toBe(fields.length);
    });

    it("shows every option field inside exactly one group", () => {
        const grouped = optionGroups().flatMap((group) => group.fields.map((field) => field.path));

        expect(grouped.slice().sort()).toEqual(
            optionFields()
                .map((field) => field.path)
                .sort(),
        );
        expect(new Set(grouped).size).toBe(grouped.length);
    });

    it("names the paths the earlier steps ask for, and no others", () => {
        const paths = new Set(mapDescriptor().fields.map((field) => field.path));
        for (const path of OWNED_BY_OTHER_STEPS) {
            expect(paths.has(path), `${path} is not a map setting`).toBe(true);
        }
    });

    it("has a title for every step, in order", () => {
        expect(WIZARD_STEP_META.map((meta) => meta.id)).toEqual([...WIZARD_STEPS]);
    });
});

describe("which groups start folded", () => {
    it("folds a group only when every setting left in it is advanced", () => {
        for (const group of optionGroups()) {
            const everyday = group.fields.filter((field) => !field.advanced).length;
            expect(group.advanced).toBe(everyday === 0);
            expect(group.everyday).toBe(everyday);
        }
    });

    it("opens the everyday groups and leaves the expert ones folded", () => {
        const groups = optionGroups();
        const open = defaultOpenGroups(groups);

        expect(open.length).toBeGreaterThan(0);
        expect(open.length).toBeLessThan(groups.length);
        for (const group of groups) {
            expect(open.includes(group.id)).toBe(!group.advanced);
        }
    });

    it("keeps tile geometry out of a first render but still on the step", () => {
        const tiles = optionGroups().find((group) => group.id === "tiles");

        expect(tiles?.advanced).toBe(true);
        expect(tiles?.fields.map((field) => field.path)).toContain("hires-tile-size");
        expect(tiles?.fields.map((field) => field.path)).toContain("lowres-tile-size");
    });

    it("keeps the render mask and its shapes in an everyday group", () => {
        const mask = optionGroups().find((group) => group.id === "mask");

        expect(mask?.advanced).toBe(false);
        expect(mask?.fields.map((field) => field.path)).toContain("render-mask");
    });

    it("drops a group whose every setting an earlier step asks for", () => {
        // `storage` is the one: its only field is asked for on the storage step.
        expect(optionGroups().some((group) => group.id === "storage")).toBe(false);
    });
});

describe("what actually reaches a render", () => {
    it("only claims the settings the request has room for", () => {
        for (const path of REQUEST_BACKED_PATHS) {
            expect(reachesRender(path)).toBe(true);
        }
        expect(reachesRender("ambient-light")).toBe(false);
        expect(reachesRender("hires-tile-size")).toBe(false);
    });

    it("names only real map settings as request-backed", () => {
        const paths = new Set(mapDescriptor().fields.map((field) => field.path));
        for (const path of REQUEST_BACKED_PATHS) {
            expect(paths.has(path), `${path} is not a map setting`).toBe(true);
        }
    });
});

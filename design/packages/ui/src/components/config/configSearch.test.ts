import { describe, expect, it } from "vitest";
import { ALL_DESCRIPTORS, generateConfigSet, renderPluginTemplate } from "@material-bluemap/config";
import {
    SCREENS,
    buildSettingIndex,
    filterFields,
    groupMatchesByScreen,
    sampleTextFor,
    searchSettings,
    settingCountByScreen,
    workspaceSampleText,
} from "./configSearch.js";
import { loadWorkspace, type ConfigWorkspace } from "./configWorkspace.js";
import { createSettingMatcher } from "./regexEngine.js";
import { findEntry } from "./configWorkspace.js";

const OPTIONS = { webroot: "/srv/web", dataFolder: "/srv/data", world: "/srv/world", version: "5.22" };

function workspace(): ConfigWorkspace {
    return loadWorkspace("/cfg", [...generateConfigSet(OPTIONS), { path: "plugin.conf", text: renderPluginTemplate() }]);
}

describe("the index", () => {
    it("holds every field of every open file, so nothing can be unreachable", () => {
        const current = workspace();
        const index = buildSettingIndex(current);
        const expected = current.entries.reduce((total, entry) => total + entry.file.descriptor.fields.length, 0);

        expect(index).toHaveLength(expected);
        expect(expected).toBeGreaterThan(100);
    });

    it("covers every screen the tab strip offers except the run screen, which is not a file", () => {
        const counts = settingCountByScreen(workspace());
        for (const screen of SCREENS) {
            if (screen.id === "run") continue;
            expect(counts[screen.id]).toBeGreaterThan(0);
        }
    });

    it("says which file and which group each setting came from", () => {
        const entry = buildSettingIndex(workspace()).find((candidate) => candidate.field.path === "accept-download");
        expect(entry?.location.screenId).toBe("core");
        expect(entry?.location.entryKey).toBe("core");
        expect(entry?.location.groupLabel).not.toBe("");
    });

    it("names a map by its file rather than lumping every map together", () => {
        const index = buildSettingIndex(workspace());
        const labels = new Set(index.filter((entry) => entry.location.screenId === "maps").map((entry) => entry.location.entryLabel));
        expect([...labels].sort()).toEqual(["Map: end", "Map: nether", "Map: overworld"]);
    });

    it("shows a credential's value as hidden rather than as itself", () => {
        const current = workspace();
        const entry = buildSettingIndex(current).find((candidate) => candidate.field.path === "connection-properties");
        expect(entry?.valueText).toBe("hidden");
        expect(entry?.haystack).not.toContain("root");
    });
});

describe("searching", () => {
    it("returns everything and says it is not filtering when the query is empty", () => {
        const index = buildSettingIndex(workspace());
        const result = searchSettings(index, "", false, "");

        expect(result.active).toBe(false);
        expect(result.matches).toHaveLength(index.length);
    });

    it("finds a setting by its label", () => {
        const result = searchSettings(buildSettingIndex(workspace()), "ambient light", false, "");
        expect(result.matches.some((entry) => entry.field.path === "ambient-light")).toBe(true);
    });

    it("finds a setting by its HOCON key, in every map that has it", () => {
        const result = searchSettings(buildSettingIndex(workspace()), "remove-caves-below-y", false, "");
        const own = result.matches.filter((entry) => entry.field.path === "remove-caves-below-y");

        expect(own).toHaveLength(3);
        expect(new Set(own.map((entry) => entry.location.entryKey)).size).toBe(3);
    });

    it("also finds the settings whose explanation mentions that key, which is usually what was wanted", () => {
        const result = searchSettings(buildSettingIndex(workspace()), "remove-caves-below-y", false, "");
        const related = result.matches.filter((entry) => entry.field.path !== "remove-caves-below-y");
        expect(related.map((entry) => entry.field.path)).toContain("cave-detection-uses-block-light");
    });

    it("finds a setting by its Java field, which is what a stack trace names", () => {
        const result = searchSettings(buildSettingIndex(workspace()), "renderThreadCount", false, "");
        expect(result.matches.some((entry) => entry.field.path === "render-thread-count")).toBe(true);
    });

    it("finds a setting by something in upstream's own explanation of it", () => {
        const result = searchSettings(buildSettingIndex(workspace()), "sunlight", false, "");
        expect(result.matches.length).toBeGreaterThan(0);
    });

    it("takes a regular expression when the user turns it on, anchored per line as the default flags promise", () => {
        const result = searchSettings(buildSettingIndex(workspace()), "^lod-", true, "im");
        const paths = new Set(result.matches.map((entry) => entry.field.path));
        expect([...paths].sort()).toEqual(["lod-count", "lod-factor"]);
    });

    it("reports an invalid pattern and matches nothing", () => {
        const result = searchSettings(buildSettingIndex(workspace()), "(unclosed", true, "");
        expect(result.error).toBeTruthy();
        expect(result.matches).toEqual([]);
    });

    it("reports how many settings were searched, so a zero result reads honestly", () => {
        const index = buildSettingIndex(workspace());
        const result = searchSettings(index, "no-such-setting-anywhere", false, "");
        expect(result.matches).toEqual([]);
        expect(result.searched).toBe(index.length);
    });
});

describe("grouping results", () => {
    it("says which screen each match is on, in tab order", () => {
        const result = searchSettings(buildSettingIndex(workspace()), "storage", false, "");
        const grouped = groupMatchesByScreen(result.matches);

        const order = grouped.map((group) => group.screenId);
        const expected = SCREENS.filter((screen) => order.includes(screen.id)).map((screen) => screen.id);
        expect(order).toEqual(expected);
    });

    it("counts the matches inside each screen", () => {
        const result = searchSettings(buildSettingIndex(workspace()), "remove-caves-below-y", false, "");
        const grouped = groupMatchesByScreen(result.matches);

        expect(grouped).toHaveLength(1);
        expect(grouped[0]?.screenId).toBe("maps");
        // Three map files, two matching settings in each: the key itself and the
        // cave-detection setting whose explanation refers to it.
        expect(grouped[0]?.entries).toHaveLength(3);
        expect(grouped[0]?.count).toBe(6);
    });
});

describe("filtering one form", () => {
    it("hides advanced settings until they are asked for", () => {
        const current = workspace();
        const entry = findEntry(current, "core");
        const fields = entry!.file.descriptor.fields;
        const quiet = createSettingMatcher("", false, "");

        const basic = filterFields(fields, entry!.file, quiet, false);
        const all = filterFields(fields, entry!.file, quiet, true);

        expect(all).toHaveLength(fields.length);
        expect(basic.length).toBeLessThan(all.length);
        expect(basic.every((field) => !field.advanced)).toBe(true);
    });

    it("shows an advanced setting anyway when it matches the query, rather than hiding a result", () => {
        const current = workspace();
        const entry = findEntry(current, "core");
        const advanced = entry!.file.descriptor.fields.find((field) => field.advanced);
        expect(advanced).toBeDefined();

        const matcher = createSettingMatcher(advanced!.path, false, "");
        const shown = filterFields(entry!.file.descriptor.fields, entry!.file, matcher, false);
        expect(shown.map((field) => field.path)).toContain(advanced!.path);
    });
});

describe("the builder's sample text", () => {
    it("is the real labels and keys of the surface that opened it", () => {
        const current = workspace();
        const entry = findEntry(current, "core");
        const sample = sampleTextFor(entry!.file.descriptor.fields);

        expect(sample.split("\n")).toHaveLength(entry!.file.descriptor.fields.length);
        expect(sample).toContain("accept-download");
    });

    it("covers the whole workspace for the search across every screen", () => {
        const sample = workspaceSampleText(workspace());
        expect(sample).toContain("accept-download");
        expect(sample).toContain("remove-caves-below-y");
        expect(sample).toContain("connection-url");
    });
});

describe("coverage against the schema itself", () => {
    it("has a screen for every config file the schema models", () => {
        const modelled = new Set(ALL_DESCRIPTORS.map((descriptor) => descriptor.id));
        const covered = new Set(["core", "webapp", "webserver", "plugin", "map", "storage-file", "storage-sql"]);
        expect([...modelled].sort()).toEqual([...covered].sort());
    });

    /**
     * The generated form renders group by group, so a field whose group is not
     * declared on its descriptor would be in the schema, in the search index, and
     * on no screen at all. That is the one way a setting could go missing without
     * anybody noticing, so it is asserted here rather than assumed.
     */
    it("puts every field of every descriptor in a group the form will render", () => {
        for (const descriptor of ALL_DESCRIPTORS) {
            const groups = new Set(descriptor.groups.map((group) => group.id));
            for (const field of descriptor.fields) {
                expect(groups.has(field.group), `${descriptor.id}.${field.path} is in group ${field.group}, which the form does not render`).toBe(true);
            }
        }
    });

    it("reaches every setting BlueMap reads, which is what the whole editor promises", () => {
        const total = ALL_DESCRIPTORS.reduce((sum, descriptor) => sum + descriptor.fields.length, 0);
        const reachable = ALL_DESCRIPTORS.reduce(
            (sum, descriptor) => sum + descriptor.groups.reduce((count, group) => count + descriptor.fields.filter((field) => field.group === group.id).length, 0),
            0,
        );
        expect(reachable).toBe(total);
    });

    it("keeps the published editor inventory honest: 154 settings over seven config tabs plus History", () => {
        const current = workspace();
        const total = buildSettingIndex(current).length;
        expect(SCREENS).toHaveLength(7);
        expect(total).toBe(154);
    });
});

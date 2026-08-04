// @vitest-environment jsdom

/**
 * The changelog viewer, mounted.
 *
 * Everything asserted here is a property of the rendered component rather than of the pure
 * functions next door, which have their own tests: that every version reaches the DOM rather
 * than only the newest, that a commit reference is a real link to a real commit, that typing in
 * the search really removes entries, that the date range and the search really compose in the
 * component and not only in the model, that the empty state names what filtered the list, and
 * that copying goes through the desktop shell's own clipboard channel when there is one.
 *
 * The viewer is mounted over a fixture rather than over the real 86-commit changelog, so an
 * ordinary commit landing tomorrow cannot turn one of these assertions red for a reason that
 * has nothing to do with the viewer.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ChangelogViewer from "./ChangelogViewer.vue";
import type { ChangelogEntry, ChangelogVersion } from "./changelogModel.js";

beforeAll(() => {
    // jsdom has no layout engine; Vuetify's overlays and fields observe both of these and the
    // mount throws before any assertion runs without them.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
});

const REPO = "https://github.com/Ding-Ding-Projects/material-bluemap";

function entry(overrides: Partial<ChangelogEntry> & { sha: string }): ChangelogEntry {
    return {
        shortSha: overrides.sha.slice(0, 10),
        date: "2026-08-03T12:00:00-04:00",
        subject: "A change",
        details: "",
        category: "interface",
        areas: ["interface"],
        files: 1,
        ...overrides,
    };
}

const roboto = entry({
    sha: "5c899040000000000000000000000000000000a1",
    date: "2026-08-01T10:00:00-04:00",
    subject: "Bundle Roboto, the typeface every surface asked for",
    details: "Windows ships no Roboto, so the chrome rendered in Arial.",
});

const tiles = entry({
    sha: "499e3380000000000000000000000000000000a2",
    date: "2026-08-04T09:00:00-04:00",
    subject: "Load a boundary tile's chunks before judging it ungenerated",
    category: "engine",
    areas: ["engine"],
});

const VERSIONS: ChangelogVersion[] = [
    {
        version: "0.1.0-build.117",
        tag: "v0.1.0-build.117",
        date: "2026-08-04T00:04:51-04:00",
        commit: "7a5682770000000000000000000000000000000b",
        entries: [tiles],
    },
    {
        version: "0.1.0-build.100",
        tag: "v0.1.0-build.100",
        date: "2026-08-01T10:30:00-04:00",
        commit: "744f7da50000000000000000000000000000000c",
        entries: [roboto],
    },
    {
        version: "0.1.0-build.99",
        tag: "v0.1.0-build.99",
        date: "2026-08-01T10:00:00-04:00",
        commit: "744f7da50000000000000000000000000000000c",
        entries: [],
    },
];

const UNRELEASED: ChangelogEntry[] = [
    entry({
        sha: "1997278f000000000000000000000000000000a3",
        date: "2026-08-04T12:00:00-04:00",
        subject: "The Phase D gate is closed",
        category: "docs",
        areas: ["docs"],
    }),
];

function render(): VueWrapper {
    const i18n = createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
    return mount(ChangelogViewer, {
        props: { versions: VERSIONS, unreleased: UNRELEASED, repositoryUrl: REPO },
        global: { plugins: [i18n, createVuetify()] },
    });
}

/** Types into the search field the same way a person does, through its own input element. */
async function search(wrapper: VueWrapper, text: string): Promise<void> {
    const input = wrapper.find('input[type="text"]');
    await input.setValue(text);
    await nextTick();
}

let wrapper: VueWrapper | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    delete (globalThis as { materialBluemap?: unknown }).materialBluemap;
});

describe("the changelog viewer", () => {
    it("renders every released version, not only the newest", () => {
        wrapper = render();
        const text = wrapper.text();
        expect(text).toContain("0.1.0-build.117");
        expect(text).toContain("0.1.0-build.100");
        expect(text).toContain("0.1.0-build.99");
        expect(text).toContain("Unreleased");
    });

    it("links each entry to its own commit, at the full SHA", () => {
        wrapper = render();
        const links = wrapper.findAll("a").map((link) => link.attributes("href"));
        expect(links).toContain(`${REPO}/commit/${roboto.sha}`);
        expect(links).toContain(`${REPO}/commit/${tiles.sha}`);
        // Rendered short, so it can be scanned, and named in full for a screen reader.
        const shaLink = wrapper.findAll("a").find((link) => link.text() === roboto.shortSha);
        expect(shaLink?.attributes("aria-label")).toContain(roboto.sha);
        expect(shaLink?.attributes("rel")).toBe("noopener noreferrer");
    });

    it("says which version shipped with nothing recorded rather than hiding it", () => {
        wrapper = render();
        expect(wrapper.text()).toContain("No changes were recorded for this version");
    });

    it("counts what is on screen against what exists", () => {
        wrapper = render();
        expect(wrapper.text()).toContain("Showing 3 of 3 entries.");
    });

    it("narrows the list as the search is typed, and says what it is filtering by", async () => {
        wrapper = render();
        await search(wrapper, "Roboto");
        expect(wrapper.text()).toContain("Showing 1 of 3 entries.");
        expect(wrapper.text()).toContain("Filtered by");
        expect(wrapper.text()).toContain(roboto.subject);
        expect(wrapper.text()).not.toContain(tiles.subject);
    });

    it("searches the commit body, not only the subject line", async () => {
        wrapper = render();
        await search(wrapper, "Arial");
        expect(wrapper.text()).toContain(roboto.subject);
        expect(wrapper.text()).toContain("Showing 1 of 3 entries.");
    });

    it("composes the date range with the search instead of replacing it", async () => {
        wrapper = render();
        const viewer = wrapper.vm as unknown as { from: string | null; to: string | null };
        viewer.from = "2026-08-04";
        viewer.to = "2026-08-04";
        await nextTick();
        expect(wrapper.text()).toContain("Showing 2 of 3 entries.");

        await search(wrapper, "Roboto");
        // Roboto is the 1st, the range is the 4th: both filters hold, so nothing is left.
        expect(wrapper.text()).toContain("Showing 0 of 3 entries.");
        expect(wrapper.text()).toContain("Nothing in the changelog matches");
    });

    it("names both filters in the empty state, so a stale date range is visible", async () => {
        wrapper = render();
        const viewer = wrapper.vm as unknown as { from: string | null; to: string | null };
        viewer.from = "1999-01-01";
        viewer.to = "1999-12-31";
        await nextTick();
        await search(wrapper, "Roboto");
        const text = wrapper.text();
        expect(text).toContain("the text Roboto");
        expect(text).toContain("dates");
        expect(text).toContain("Clear the filters");
    });

    it("clears both filters from the empty state", async () => {
        wrapper = render();
        const viewer = wrapper.vm as unknown as { from: string | null; to: string | null };
        viewer.from = "1999-01-01";
        await search(wrapper, "nothing matches this");
        expect(wrapper.text()).toContain("Showing 0 of 3 entries.");

        const clear = wrapper.findAll("button").find((button) => button.text().includes("Clear the filters"));
        await clear?.trigger("click");
        await nextTick();
        expect(wrapper.text()).toContain("Showing 3 of 3 entries.");
    });

    it("offers the regex builder from its own search bar, opt-in and off by default", () => {
        wrapper = render();
        const toggle = wrapper
            .findAll("button")
            .find((button) => button.attributes("aria-label")?.includes("regular expression"));
        expect(toggle?.attributes("aria-pressed")).toBe("false");
        const builder = wrapper
            .findAll("button")
            .find((button) => button.attributes("aria-label")?.includes("regex builder"));
        expect(builder).toBeDefined();
    });

    it("keeps the date controls collapsed until they are asked for, and says the range on the button", () => {
        wrapper = render();
        const button = wrapper
            .findAll("button")
            .find((candidate) => candidate.text().startsWith("Dates:"));
        expect(button?.attributes("aria-expanded")).toBe("false");
        expect(button?.text()).toContain("Any date");
    });

    it("copies through the desktop shell's clipboard channel when there is one", async () => {
        const writeClipboardText = vi.fn().mockResolvedValue(undefined);
        (globalThis as { materialBluemap?: unknown }).materialBluemap = { writeClipboardText };

        wrapper = render();
        const copy = (wrapper.vm as unknown as { copy: (kind: "markdown" | "text") => Promise<void> }).copy;
        await copy("markdown");
        await nextTick();

        expect(writeClipboardText).toHaveBeenCalledTimes(1);
        const written = String(writeClipboardText.mock.calls[0]?.[0]);
        expect(written).toContain(roboto.sha);
        expect(written).toContain("0.1.0-build.100");
        // The exported file states its own scope, because it is read where the filters are not.
        expect(written).toContain("This file holds");
        expect(wrapper.text()).toContain("on the clipboard");
    });

    it("exports only the selection once entries are selected", async () => {
        const writeClipboardText = vi.fn().mockResolvedValue(undefined);
        (globalThis as { materialBluemap?: unknown }).materialBluemap = { writeClipboardText };

        wrapper = render();
        const vm = wrapper.vm as unknown as {
            toggle: (sha: string, on: boolean) => void;
            copy: (kind: "markdown" | "text") => Promise<void>;
        };
        vm.toggle(roboto.sha, true);
        await nextTick();
        await vm.copy("text");

        const written = String(writeClipboardText.mock.calls[0]?.[0]);
        expect(written).toContain(roboto.sha);
        expect(written).not.toContain(tiles.sha);
        expect(written).toContain("selected entries");
    });

    it("reports a clipboard that cannot be reached instead of looking like it worked", async () => {
        (globalThis as { materialBluemap?: unknown }).materialBluemap = {
            writeClipboardText: vi.fn().mockRejectedValue(new Error("denied")),
        };
        wrapper = render();
        await (wrapper.vm as unknown as { copy: (kind: "markdown") => Promise<void> }).copy("markdown");
        await nextTick();
        expect(wrapper.text()).toContain("Could not reach the clipboard.");
    });

    it("names the region and its heading for a screen reader", () => {
        wrapper = render();
        const section = wrapper.find("section");
        expect(section.attributes("aria-labelledby")).toBe("mb-changelog-title");
        expect(wrapper.find("#mb-changelog-title").exists()).toBe(true);
        expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true);
    });

    it("gives every entry's checkbox a name that says which entry it selects", () => {
        wrapper = render();
        const labels = wrapper
            .findAll('input[type="checkbox"]')
            .map((input) => input.attributes("aria-label"));
        expect(labels.some((label) => label?.includes(roboto.subject))).toBe(true);
    });
});

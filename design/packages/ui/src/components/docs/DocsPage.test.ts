// @vitest-environment jsdom

/**
 * The docs browser, mounted.
 *
 * This mounts over the real bundled `docs/*.md` content rather than a fixture, deliberately:
 * the property this component has to prove is that it renders and navigates the actual
 * documentation this repository ships, and `docsContent.test.ts` is what already proves that
 * bundle is complete. A handful of real, stable facts about specific articles are asserted
 * here - `docs/README.md`'s own title, that it links to `./command-palette.md`, and what that
 * article's own title is - which is exactly the kind of thing that would break loudly if either
 * article were renamed, which is the point.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import DocsPage from "./DocsPage.vue";
import { DOCS_ARTICLES } from "./docsContent.js";

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

    // jsdom has no layout engine, so it implements no scrolling at all; DocsPage calls this
    // to honour a link's #anchor once the target article has rendered.
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
});

function render(): VueWrapper {
    const i18n = createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
    return mount(DocsPage, { global: { plugins: [i18n, createVuetify()] } });
}

async function search(wrapper: VueWrapper, text: string): Promise<void> {
    const input = wrapper.find('input[type="text"]');
    await input.setValue(text);
    await nextTick();
}

async function toggleRegex(wrapper: VueWrapper): Promise<void> {
    await wrapper.get('[aria-label="Search with a regular expression"]').trigger("click");
    await nextTick();
}

let wrapper: VueWrapper | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

describe("mount and reachability", () => {
    it("mounts without throwing and shows its own title", () => {
        wrapper = render();
        expect(wrapper.text()).toContain("Documentation");
    });

    it("bundles more than a handful of real articles", () => {
        expect(DOCS_ARTICLES.length).toBeGreaterThan(10);
    });
});

describe("the index", () => {
    it("mirrors docs/README.md's two named categories", () => {
        wrapper = render();
        expect(wrapper.text()).toContain("The application");
        expect(wrapper.text()).toContain("Rendering");
    });

    it("lists a known article from the application table by its real title", () => {
        wrapper = render();
        expect(wrapper.text()).toContain("The command palette");
    });

    it("still surfaces an article docs/README.md's own tables do not list", () => {
        wrapper = render();
        // docs/bluemapgui-parity.md is not in either of README's two tables; "full means full"
        // still bundles and shows it, under the fallback category.
        expect(wrapper.text()).toContain("Elsewhere in the documentation");
        expect(wrapper.text()).toContain("Feature parity with BlueMapGUI");
    });
});

describe("opening an article, and the shared renderer", () => {
    it("renders an article's Markdown as real headings and paragraphs, not raw source", async () => {
        wrapper = render();
        await wrapper.get('[aria-label="Open The command palette"]').trigger("click");
        await nextTick();

        expect(wrapper.find(".mb-docs__article-body h2, .mb-docs__article-body h3").exists()).toBe(true);
        // The raw Markdown heading marker must not survive rendering.
        expect(wrapper.find(".mb-docs__article-body").text()).not.toContain("##");
    });

    it("shows a back button that returns to the index", async () => {
        wrapper = render();
        await wrapper.get('[aria-label="Open The command palette"]').trigger("click");
        await nextTick();
        expect(wrapper.find(".mb-docs__article").exists()).toBe(true);

        await wrapper.get(".mb-docs__back").trigger("click");
        await nextTick();
        expect(wrapper.find(".mb-docs__article").exists()).toBe(false);
        expect(wrapper.find(".mb-docs__index").exists()).toBe(true);
    });
});

describe("internal links resolve inside the viewer", () => {
    it("clicking docs/README.md's own link to ./command-palette.md opens that article", async () => {
        wrapper = render();
        // README.md is real content, bundled under "uncategorized" (see docsModel.test.ts for
        // why), and its own first line is this heading.
        await wrapper.get('[aria-label="Open Feature documentation"]').trigger("click");
        await nextTick();

        const link = wrapper.get('a[data-docs-internal][href="./command-palette.md"]');
        await link.trigger("click");
        await nextTick();

        expect(wrapper.get(".mb-docs__article-title").text()).toBe("The command palette");
    });

    it("hardens a real external link with target=_blank and rel=noopener", async () => {
        wrapper = render();
        // docs/bedrock-worlds.md links out to the real Chunker project on GitHub.
        await wrapper.get('[aria-label="Open Bedrock Edition worlds"]').trigger("click");
        await nextTick();

        const externalLinks = wrapper.findAll("a[href^='http']");
        expect(externalLinks.length).toBeGreaterThan(0);
        for (const link of externalLinks) {
            expect(link.attributes("target")).toBe("_blank");
            expect(link.attributes("rel")).toBe("noopener noreferrer");
        }
    });

    it("honours a link's #anchor once the target article has rendered", async () => {
        wrapper = render();
        // The one hand-written anchor link in this repository's real documentation, from
        // docs/render-in-actions.md, at the heading rendered as
        // "### How `rstate` is cached without reintroducing the merge bug" in
        // docs/resumable-renders.md.
        await wrapper.get('[aria-label="Open Rendering a world in GitHub Actions"]').trigger("click");
        await nextTick();

        const link = wrapper.get(
            'a[data-docs-internal][href="resumable-renders.md#how-rstate-is-cached-without-reintroducing-the-merge-bug"]',
        );
        await link.trigger("click");
        await nextTick();

        expect(wrapper.get(".mb-docs__article-title").text()).toBe(
            "Rendering that survives being interrupted",
        );
        expect(
            wrapper
                .find("#how-rstate-is-cached-without-reintroducing-the-merge-bug")
                .exists(),
        ).toBe(true);
    });

    it("does not mark the link that escapes docs/ entirely as an internal navigation", async () => {
        wrapper = render();
        await wrapper.get('[aria-label="Open Large worlds and rendered maps"]').trigger("click");
        await nextTick();

        // docs/large-worlds.md links to ../scripts/README.md, outside docs/ entirely.
        const escaping = wrapper.find('a[href="../scripts/README.md"]');
        expect(escaping.exists()).toBe(true);
        expect(escaping.attributes("data-docs-internal")).toBeUndefined();
        expect(escaping.attributes("target")).toBe("_blank");
    });
});

describe("search", () => {
    it("plain text filters by title", async () => {
        wrapper = render();
        await search(wrapper, "command palette");

        expect(wrapper.text()).toContain("The command palette");
        expect(wrapper.text()).not.toContain("Bedrock Edition worlds");
    });

    it("plain text also matches article body content, not only the title", async () => {
        wrapper = render();
        // A phrase from inside docs/command-palette.md's body rather than its title.
        await search(wrapper, "PaletteItem");

        expect(wrapper.text()).toContain("The command palette");
    });

    it("shows an honest empty state naming the search when nothing matches", async () => {
        wrapper = render();
        await search(wrapper, "zzz-nothing-matches-zzz");

        expect(wrapper.text()).toContain("Nothing in the documentation matches");
        expect(wrapper.get(".mb-docs__clear")).toBeTruthy();
    });

    it("regex mode matches a pattern", async () => {
        wrapper = render();
        await toggleRegex(wrapper);
        await search(wrapper, "^The command palette$");

        expect(wrapper.text()).toContain("The command palette");
    });

    it("switches a currently open article to search results once a query is typed", async () => {
        wrapper = render();
        await wrapper.get('[aria-label="Open The command palette"]').trigger("click");
        await nextTick();
        expect(wrapper.find(".mb-docs__article").exists()).toBe(true);

        await search(wrapper, "worlds");
        expect(wrapper.find(".mb-docs__article").exists()).toBe(false);
        expect(wrapper.find(".mb-docs__results").exists()).toBe(true);
    });
});

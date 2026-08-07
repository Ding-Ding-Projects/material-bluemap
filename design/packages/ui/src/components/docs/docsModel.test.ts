import { describe, expect, it } from "vitest";
import {
    type DocsArticle,
    buildArticle,
    categoryOfFile,
    createDocsFilter,
    docsSampleText,
    filterArticles,
    groupByCategory,
    idFromFile,
    resolveInternalLink,
    titleFromMarkdown,
} from "./docsModel.js";

function article(
    file: string,
    title: string,
    markdown = `# ${title}\n\nBody.`,
): DocsArticle {
    return buildArticle(file, markdown);
}

describe("idFromFile", () => {
    it("strips the extension and lowercases it", () => {
        expect(idFromFile("command-palette.md")).toBe("command-palette");
        expect(idFromFile("README.md")).toBe("readme");
    });
});

describe("titleFromMarkdown", () => {
    it("reads the first level-1 heading", () => {
        expect(titleFromMarkdown("# The command palette\n\nText.", "command-palette")).toBe(
            "The command palette",
        );
    });

    it("falls back to the id when there is no heading", () => {
        expect(titleFromMarkdown("Just a paragraph.", "no-heading")).toBe("no-heading");
    });

    it("does not match a level-2 heading", () => {
        expect(titleFromMarkdown("## Not a title\n\nText.", "fallback")).toBe("fallback");
    });
});

describe("categoryOfFile", () => {
    it("places a file from the application table", () => {
        expect(categoryOfFile("command-palette.md")).toBe("application");
    });

    it("places a file from the rendering table", () => {
        expect(categoryOfFile("large-worlds.md")).toBe("rendering");
        expect(categoryOfFile("cloud-runners.md")).toBe("rendering");
    });

    it("falls back to uncategorized for a file in neither table", () => {
        // Genuinely true today: docs/README.md does not list this file under either heading.
        expect(categoryOfFile("bluemapgui-parity.md")).toBe("uncategorized");
        // README.md is the index, not an entry in its own tables.
        expect(categoryOfFile("README.md")).toBe("uncategorized");
    });
});

describe("groupByCategory", () => {
    it("orders groups application, rendering, uncategorized and drops empty ones", () => {
        const articles = [
            article("bedrock-worlds.md", "Bedrock"),
            article("command-palette.md", "Palette"),
            article("bluemapgui-parity.md", "Parity"),
        ];
        const groups = groupByCategory(articles);
        expect(groups.map((group) => group.id)).toEqual(["application", "rendering", "uncategorized"]);
    });

    it("orders articles within a table category the way README.md lists them", () => {
        const articles = [
            article("notification-centre.md", "Notices"),
            article("command-palette.md", "Palette"),
        ];
        const [group] = groupByCategory(articles);
        expect(group?.articles.map((a) => a.id)).toEqual(["command-palette", "notification-centre"]);
    });

    it("omits a category with no articles rather than showing it empty", () => {
        const groups = groupByCategory([article("bedrock-worlds.md", "Bedrock")]);
        expect(groups.map((group) => group.id)).toEqual(["rendering"]);
    });
});

describe("search", () => {
    const articles = [
        article("command-palette.md", "The command palette", "# The command palette\n\nOne shortcut."),
        article("large-worlds.md", "Large worlds and rendered maps", "# Large worlds\n\nSplitting parts."),
    ];

    it("plain text matches the title case-insensitively", () => {
        const filter = createDocsFilter("PALETTE", false, "i");
        expect(filterArticles(articles, filter).map((a) => a.id)).toEqual(["command-palette"]);
    });

    it("plain text matches article body content, not only the title", () => {
        const filter = createDocsFilter("splitting", false, "i");
        expect(filterArticles(articles, filter).map((a) => a.id)).toEqual(["large-worlds"]);
    });

    it("an empty query matches everything and is inactive", () => {
        const filter = createDocsFilter("", false, "i");
        expect(filter.active).toBe(false);
        expect(filterArticles(articles, filter)).toHaveLength(2);
    });

    it("regex mode matches a pattern", () => {
        const filter = createDocsFilter("^Large", true, "i");
        expect(filterArticles(articles, filter).map((a) => a.id)).toEqual(["large-worlds"]);
    });

    it("an invalid regex matches nothing and reports an error", () => {
        const filter = createDocsFilter("(", true, "i");
        expect(filter.error).not.toBeNull();
        expect(filterArticles(articles, filter)).toHaveLength(0);
    });

    it("the sample text carries one line per article for the builder's preview", () => {
        expect(docsSampleText(articles).split("\n")).toHaveLength(2);
    });
});

describe("resolveInternalLink", () => {
    const knownIds = new Set(["command-palette", "large-worlds"]);

    it("resolves a bare relative link", () => {
        expect(resolveInternalLink("command-palette.md", knownIds)).toEqual({
            id: "command-palette",
            hash: "",
        });
    });

    it("resolves a ./ prefixed link", () => {
        expect(resolveInternalLink("./command-palette.md", knownIds)).toEqual({
            id: "command-palette",
            hash: "",
        });
    });

    it("carries the anchor through", () => {
        expect(resolveInternalLink("large-worlds.md#splitting", knownIds)).toEqual({
            id: "large-worlds",
            hash: "#splitting",
        });
    });

    it("does not resolve a link that escapes the docs directory", () => {
        // docs/large-worlds.md's real link to ../scripts/README.md, outside docs/ entirely.
        expect(resolveInternalLink("../scripts/README.md", knownIds)).toBeNull();
    });

    it("does not resolve an external URL", () => {
        expect(resolveInternalLink("https://example.com/foo.md", knownIds)).toBeNull();
    });

    it("does not resolve a relative link naming a file this build has no article for", () => {
        expect(resolveInternalLink("not-bundled.md", knownIds)).toBeNull();
    });

    it("does not resolve a link into a subdirectory", () => {
        expect(resolveInternalLink("sub/command-palette.md", knownIds)).toBeNull();
    });
});

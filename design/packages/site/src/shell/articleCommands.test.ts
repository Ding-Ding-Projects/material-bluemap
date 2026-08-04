import { describe, expect, it, vi } from "vitest";
import { articles } from "../content/articles/index.js";
import type { Article } from "../content/types.js";
import { articlePaletteCommands } from "./articleCommands.js";

const article = (id: string, title: string): Article => ({
    id,
    title,
    summary: `${title} summary`,
    category: "contracts",
    status: "specified",
    statusNote: "Not built in this surface.",
    sections: [],
    suggested: [],
    sources: [],
});

describe("article command catalog", () => {
    it("creates a searchable destination for every article and preserves exact activation", () => {
        const openArticle = vi.fn();
        const commands = articlePaletteCommands(
            [article("regex", "Regex builder"), article("tabs", "Tabbed navigation")],
            (title) => `Open article: ${title}`,
            openArticle,
        );

        expect(commands).toHaveLength(2);
        expect(commands.map((command) => command.id)).toEqual(["article-regex", "article-tabs"]);
        expect(commands.map((command) => command.kind)).toEqual(["page", "page"]);
        expect(commands[0]?.label).toBe("Open article: Regex builder");
        commands[1]?.run();
        expect(openArticle).toHaveBeenCalledWith("tabs");
    });

    it("covers the complete published article catalog without duplicate destinations", () => {
        const commands = articlePaletteCommands(articles, (title) => title, () => undefined);
        const ids = commands.map((command) => command.id);

        expect(commands).toHaveLength(articles.length);
        expect(new Set(ids).size).toBe(articles.length);
        expect(ids).toContain(`article-${articles[0]?.id}`);
    });
});

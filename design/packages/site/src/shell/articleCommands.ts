import type { Article } from "../content/types.js";
import type { PaletteCommand } from "./commandPalette.js";

/** Build one command-palette destination for every documentation article. */
export function articlePaletteCommands(
    articles: readonly Article[],
    labelFor: (title: string) => string,
    openArticle: (articleRef: string) => void,
): readonly PaletteCommand[] {
    return articles.map((article) => ({
        id: `article-${article.id}`,
        label: labelFor(article.title),
        description: `${article.summary} · ${article.statusNote}`,
        kind: "page",
        run: () => openArticle(article.id),
    }));
}

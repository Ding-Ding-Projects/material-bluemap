import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { onDocsArticleRequested, requestDocsArticle, resetDocsLink, takePendingDocsArticle } from "./docsLink.js";

afterEach(() => {
    resetDocsLink();
});

describe("takePendingDocsArticle", () => {
    it("is null until something asks for an article", () => {
        expect(takePendingDocsArticle()).toBeNull();
    });

    it("returns the requested target once, then clears it", () => {
        requestDocsArticle("glossary", "#storage");
        expect(takePendingDocsArticle()).toEqual({ id: "glossary", hash: "#storage" });
        expect(takePendingDocsArticle()).toBeNull();
    });

    it("defaults the hash to empty, matching DocsPage.openArticle's own default", () => {
        requestDocsArticle("glossary");
        expect(takePendingDocsArticle()).toEqual({ id: "glossary", hash: "" });
    });
});

describe("onDocsArticleRequested", () => {
    it("does not fire for a target that was already pending before the watcher existed", async () => {
        requestDocsArticle("glossary", "#tile");
        const seen: string[] = [];
        onDocsArticleRequested((target) => seen.push(target.id));
        await nextTick();
        expect(seen).toEqual([]);
        // The request is still sitting there for whoever mounts next to read with
        // takePendingDocsArticle - this watcher only catches requests raised afterwards.
        expect(takePendingDocsArticle()).toEqual({ id: "glossary", hash: "#tile" });
    });

    it("fires for every request raised while it is listening", async () => {
        const seen: Array<{ id: string; hash: string }> = [];
        onDocsArticleRequested((target) => seen.push(target));

        requestDocsArticle("glossary", "#project");
        await nextTick();
        requestDocsArticle("glossary", "#profile");
        await nextTick();

        expect(seen).toEqual([
            { id: "glossary", hash: "#project" },
            { id: "glossary", hash: "#profile" },
        ]);
    });
});

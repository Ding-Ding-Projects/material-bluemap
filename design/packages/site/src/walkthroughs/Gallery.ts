import type { I18n, LanguageMode } from "../i18n/I18n.js";
import { ACTION_WALKTHROUGHS, type ActionWalkthrough } from "./manifest.js";

export interface WalkthroughGalleryOptions {
    readonly i18n: I18n;
    readonly openArticle: (articleId: string) => void;
}

interface CopyNodes {
    readonly node: HTMLElement;
    readonly en: string;
    readonly yue: string;
}

function setCopy(node: HTMLElement, mode: LanguageMode, en: string, yue: string): void {
    node.replaceChildren();
    const primary = document.createElement("span");
    primary.textContent = mode === "yue" ? yue : en;
    node.appendChild(primary);
    if (mode === "bilingual") {
        const secondary = document.createElement("span");
        secondary.className = "i18n-secondary";
        secondary.lang = "zh-HK";
        secondary.textContent = yue;
        node.appendChild(secondary);
    }
}

function mediaCard(
    item: ActionWalkthrough,
    options: WalkthroughGalleryOptions,
    copies: CopyNodes[],
): HTMLElement {
    const card = document.createElement("article");
    card.className = "mb-walkthrough-card";
    card.dataset.walkthroughId = item.id;

    const figure = document.createElement("figure");
    figure.className = "mb-walkthrough-figure";
    const picture = document.createElement("picture");
    const reducedSource = document.createElement("source");
    reducedSource.media = "(prefers-reduced-motion: reduce)";
    reducedSource.srcset = item.stillUrl;
    reducedSource.type = "image/png";
    const image = document.createElement("img");
    image.className = "mb-walkthrough-image";
    image.src = item.gifUrl;
    image.dataset.animatedSource = item.gifUrl;
    image.dataset.staticSource = item.stillUrl;
    image.loading = "lazy";
    image.decoding = "async";
    image.width = item.width;
    image.height = item.height;
    image.alt = options.i18n.mode === "yue" ? item.alt.yue : item.alt.en;
    picture.append(reducedSource, image);
    figure.appendChild(picture);

    const caption = document.createElement("figcaption");
    caption.className = "mb-walkthrough-caption";
    const title = document.createElement("h3");
    title.className = "mb-walkthrough-title";
    const description = document.createElement("p");
    description.className = "mb-walkthrough-description";
    copies.push({ node: title, ...item.title }, { node: description, ...item.description });
    setCopy(title, options.i18n.mode, item.title.en, item.title.yue);
    setCopy(description, options.i18n.mode, item.description.en, item.description.yue);

    const actions = document.createElement("div");
    actions.className = "mb-walkthrough-actions";
    const replay = document.createElement("button");
    replay.className = "md-button md-button--text";
    replay.type = "button";
    options.i18n.bindText(replay, "walkthrough.replay");
    options.i18n.bindAttr(replay, "aria-label", "walkthrough.replayNamed", { name: item.title.en });
    replay.addEventListener("click", () => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const source = image.dataset.animatedSource;
        if (source === undefined) return;
        image.src = "";
        window.requestAnimationFrame(() => {
            image.src = source;
        });
    });

    const article = document.createElement("button");
    article.className = "md-button md-button--outlined";
    article.type = "button";
    options.i18n.bindText(article, "walkthrough.readArticle");
    article.addEventListener("click", () => options.openArticle(item.articleId));
    actions.append(replay, article);
    caption.append(title, description, actions);
    figure.appendChild(caption);
    card.appendChild(figure);
    return card;
}

export function createWalkthroughGallery(options: WalkthroughGalleryOptions): HTMLElement {
    const section = document.createElement("section");
    section.className = "mb-walkthroughs mb-section";
    section.setAttribute("aria-labelledby", "walkthrough-gallery-title");

    const heading = document.createElement("h2");
    heading.id = "walkthrough-gallery-title";
    heading.className = "mb-section-title";
    options.i18n.bindText(heading, "walkthrough.heading");
    const lede = document.createElement("p");
    lede.className = "mb-section-lede";
    options.i18n.bindText(lede, "walkthrough.lede");
    const motionNote = document.createElement("p");
    motionNote.className = "mb-walkthrough-motion-note";
    options.i18n.bindText(motionNote, "walkthrough.motionNote");

    const grid = document.createElement("div");
    grid.className = "mb-walkthrough-grid";
    const copies: CopyNodes[] = [];
    for (const item of ACTION_WALKTHROUGHS) grid.appendChild(mediaCard(item, options, copies));
    options.i18n.subscribe(() => {
        for (const copy of copies) setCopy(copy.node, options.i18n.mode, copy.en, copy.yue);
        const images = grid.querySelectorAll<HTMLImageElement>(".mb-walkthrough-image");
        images.forEach((image, index) => {
            const item = ACTION_WALKTHROUGHS[index];
            if (item !== undefined)
                image.alt = options.i18n.mode === "yue" ? item.alt.yue : item.alt.en;
        });
    });

    section.append(heading, lede, motionNote, grid);
    return section;
}

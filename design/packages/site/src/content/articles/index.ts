/**
 * The ordered article list.
 *
 * Order is reading order, not alphabetical: application first because that is what a
 * visitor met on the landing page, then the engine underneath it, then how it is
 * built and delivered, then the contracts that are written down but not built.
 */

import type { Article, ArticleCategory } from "../types.js";

import { install } from "./install.js";
import { viewerRemoteMode } from "./viewer-remote-mode.js";
import { embeddedServer } from "./embedded-server.js";
import { electronSecurity } from "./electron-security.js";
import { worldReading } from "./world-reading.js";
import { resourcePacks } from "./resource-packs.js";
import { releasePipeline } from "./release-pipeline.js";
import { screenshotGallery } from "./screenshot-gallery.js";
import { contractRegexBuilder } from "./contract-regex-builder.js";
import { contractTabNavigation } from "./contract-tab-navigation.js";
import { contractAppearanceEditors } from "./contract-appearance-editors.js";
import { contractLocalization } from "./contract-localization.js";
import { contractSuperConfirmation } from "./contract-super-confirmation.js";

export const articles: readonly Article[] = [
    viewerRemoteMode,
    embeddedServer,
    electronSecurity,
    worldReading,
    resourcePacks,
    install,
    releasePipeline,
    screenshotGallery,
    contractRegexBuilder,
    contractTabNavigation,
    contractAppearanceEditors,
    contractLocalization,
    contractSuperConfirmation,
];

/** Category order for grouped rendering, so the list reads the same way every time. */
export const articleCategoryOrder: readonly ArticleCategory[] = [
    "application",
    "engine",
    "delivery",
    "contracts",
];

/** Look an article up by id. Returns undefined rather than throwing. */
export function findArticle(id: string): Article | undefined {
    return articles.find((article) => article.id === id);
}

/** The articles in a category, in the order above. */
export function articlesInCategory(category: ArticleCategory): readonly Article[] {
    return articles.filter((article) => article.category === category);
}

/**
 * The ordered article list.
 *
 * Order is reading order, not alphabetical: application first because that is what a
 * visitor met on the landing page, then the engine underneath it, then how it is
 * built and delivered, then the contracts, each of which is written down and only
 * partly built.
 *
 * The cross-cutting application features sit together near the end of the application
 * run rather than beside the surface each one happens to appear on, because they are
 * the same shape of thing: one mechanism reached from everywhere. A reader who has
 * just met the palette is far more likely to want the notification centre next than
 * to want the Electron security posture.
 *
 * Each of those has a contract article as its counterpart. They are deliberately not
 * merged: this run says what is built, the contract run says what was asked for, and
 * collapsing the two would leave nowhere to record the difference between them.
 */

import type { Article, ArticleCategory } from "../types.js";

import { glossary } from "./glossary.js";
import { install } from "./install.js";
import { viewerRemoteMode } from "./viewer-remote-mode.js";
import { embeddedServer } from "./embedded-server.js";
import { electronSecurity } from "./electron-security.js";
import { firstRunConsent } from "./first-run-consent.js";
import { desktopShellChrome } from "./desktop-shell-chrome.js";
import { optionsGui } from "./options-gui.js";
import { configRichControls } from "./config-rich-controls.js";
import { configHistory } from "./config-history.js";
import { backups } from "./backups.js";
import { githubSignIn } from "./github-sign-in.js";
import { releaseDownloads } from "./release-downloads.js";
import { worldReading } from "./world-reading.js";
import { worldDiscovery } from "./world-discovery.js";
import { bedrockWorlds } from "./bedrock-worlds.js";
import { javaRenderPath } from "./java-render-path.js";
import { resourcePacks } from "./resource-packs.js";
import { releasePipeline } from "./release-pipeline.js";
import { renderInActions } from "./render-in-actions.js";
import { screenshotGallery } from "./screenshot-gallery.js";
import { testWorldGenerator } from "./test-world-generator.js";
import { commandPalette } from "./command-palette.js";
import { notificationCentre } from "./notification-centre.js";
import { changelogViewer } from "./changelog-viewer.js";
import { tabbedShell } from "./tabbed-shell.js";
import { appearanceEditor } from "./appearance-editor.js";
import { destructiveActionGate } from "./destructive-action-gate.js";
import { languageAndTone } from "./language-and-tone.js";
import { regexBuilderSurfaces } from "./regex-builder-surfaces.js";
import { legacyWorldSupport } from "./legacy-world-support.js";
import { contractRegexBuilder } from "./contract-regex-builder.js";
import { contractTabNavigation } from "./contract-tab-navigation.js";
import { contractAppearanceEditors } from "./contract-appearance-editors.js";
import { contractLocalization } from "./contract-localization.js";
import { contractSuperConfirmation } from "./contract-super-confirmation.js";
import { renderConsole } from "./render-console.js";
import { publishingToPages } from "./publishing-to-pages.js";
import { dockerAndLocal } from "./docker-and-local.js";
import { remoteRender } from "./remote-render.js";
import { remoteHosting } from "./remote-hosting.js";
import { automaticRepair } from "./automatic-repair.js";

export const articles: readonly Article[] = [
    glossary,
    viewerRemoteMode,
    embeddedServer,
    electronSecurity,
    desktopShellChrome,
    firstRunConsent,
    optionsGui,
    configRichControls,
    configHistory,
    automaticRepair,
    releaseDownloads,
    githubSignIn,
    backups,
    tabbedShell,
    commandPalette,
    notificationCentre,
    renderConsole,
    changelogViewer,
    appearanceEditor,
    destructiveActionGate,
    regexBuilderSurfaces,
    languageAndTone,
    worldReading,
    worldDiscovery,
    legacyWorldSupport,
    bedrockWorlds,
    javaRenderPath,
    dockerAndLocal,
    remoteRender,
    remoteHosting,
    resourcePacks,
    install,
    renderInActions,
    publishingToPages,
    releasePipeline,
    screenshotGallery,
    testWorldGenerator,
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

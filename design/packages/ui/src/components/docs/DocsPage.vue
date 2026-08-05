<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowLeft, mdiCompassOutline, mdiFileDocumentOutline } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VList, VListItem } from "vuetify/components";
import { renderMarkdown } from "@material-bluemap/viewer";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { tutorialCompleted } from "../tutorial/tutorialController.js";
import { requestTutorialLaunch } from "../tutorial/tutorialLaunch.js";
import { DOCS_ARTICLES, DOCS_ARTICLES_BY_ID, DOCS_ARTICLE_IDS } from "./docsContent.js";
import { onDocsArticleRequested, takePendingDocsArticle } from "./docsLink.js";
import {
    type DocsArticle,
    type DocsCategoryId,
    createDocsFilter,
    docsSampleText,
    filterArticles,
    groupByCategory,
    resolveInternalLink,
} from "./docsModel.js";

/**
 * The full documentation browser, mounted as its own shell tab.
 *
 * `docs/README.md`'s index is mirrored here rather than duplicated by hand: `docsModel.ts`
 * groups the same bundled articles under the same two headings that file uses, in the same
 * order, so this page and `docs/README.md` cannot drift apart the way two hand-written lists
 * would. `docsContent.test.ts` is what keeps the bundle itself honest; this component only
 * reads what that bundle already carries.
 *
 * ## The one shared renderer
 *
 * `renderMarkdown` from `@material-bluemap/viewer` is the whole rendering path: it runs the
 * article through `marked` and then through the same DOMPurify-based `sanitizeHtml` that
 * `InfoPage.vue` already runs upstream's locale HTML through. Nothing here builds a second
 * parser or a second sanitizer for the app to keep in step. `v-html` is used exactly once,
 * on that already-sanitized output, for the same reason it is used exactly once in
 * `InfoPage.vue`: the content did not come from this component and had to be neutralised
 * before it could be trusted at all.
 *
 * ## Internal links, resolved without leaving the page
 *
 * `docsModel.resolveInternalLink` is run once per rendered `<a href>`, at render time, over the
 * bundled article ids - not over a DOM traversal invented per component. A link that resolves
 * gets a `data-docs-internal` marker and stays a same-page navigation, handled here by one
 * delegated click listener; everything else (a real external URL, or the one link in this
 * repository's docs that escapes `docs/` entirely - `large-worlds.md`'s `../scripts/README.md`)
 * gets `target="_blank" rel="noopener noreferrer"`, exactly the treatment `InfoPage.vue`'s
 * `decorate()` gives every link in upstream's locale content.
 */

const { t } = useI18n();

/**
 * The interactive tour's own reachability path from the docs browser. This page never opens
 * the overlay itself - `requestTutorialLaunch()` is the same doorbell `InfoPage.vue`'s own
 * button rings, and `TutorialOverlay.vue` (mounted at the shell) is what actually answers it.
 */
const tourLabel = computed(() =>
    tutorialCompleted()
        ? t("tutorial.launch.replay", "Replay the tour")
        : t("tutorial.launch.start", "Take the tour"),
);

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

const selectedId = ref<string | null>(null);
const pendingHash = ref<string>("");
const headingRef = ref<HTMLElement | null>(null);

const selectedArticle = computed<DocsArticle | null>(() =>
    selectedId.value === null ? null : (DOCS_ARTICLES_BY_ID.get(selectedId.value) ?? null),
);

/** True once a real id was asked for and this build's bundle has no article for it. */
const articleMissing = computed(() => selectedId.value !== null && selectedArticle.value === null);

async function focusHeading(): Promise<void> {
    await nextTick();
    headingRef.value?.focus();
}

function openArticle(id: string, hash = ""): void {
    selectedId.value = id;
    pendingHash.value = hash;
    void focusHeading();
}

function backToIndex(): void {
    selectedId.value = null;
    pendingHash.value = "";
    void focusHeading();
}

/**
 * A term's "tell me more" link, or anything else that wants this page to open a specific
 * article: see `docsLink.ts` for why this needs both an `onMounted` read and a live watcher.
 * The shell (`App.vue`) is what actually switches to this tab; by the time that switch lands
 * and this component mounts, the same target this reads in `onMounted` is what `App.vue`
 * reacted to, so the two never race.
 */
onMounted(() => {
    const target = takePendingDocsArticle();
    if (target !== null) openArticle(target.id, target.hash);
});
onDocsArticleRequested((target) => {
    openArticle(target.id, target.hash);
});

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regex = ref(false);
const flags = ref("i");

const matcher = computed(() => createDocsFilter(query.value, regex.value, flags.value));
const sample = computed(() => docsSampleText(DOCS_ARTICLES));

const searchResults = computed<readonly DocsArticle[]>(() =>
    matcher.value.active ? filterArticles(DOCS_ARTICLES, matcher.value) : [],
);

/**
 * Typing a query always searches the whole bundle, article content included, so a query typed
 * while an article is open switches straight to results rather than filtering nothing on
 * screen. Clearing the query does not reopen whichever article was last shown - it goes back to
 * the index, which is the surface the query was searched from.
 */
watch(query, (value, previous) => {
    if (value.length > 0 && previous.length === 0 && selectedId.value !== null) {
        selectedId.value = null;
        pendingHash.value = "";
    }
});

function clearSearch(): void {
    query.value = "";
}

const countLine = computed(() =>
    t(
        "docsViewer.showing",
        { shown: searchResults.value.length, total: DOCS_ARTICLES.length },
        "Showing {shown} of {total} articles.",
    ),
);

/* -------------------------------------------------------------------------- */
/* The index                                                                   */
/* -------------------------------------------------------------------------- */

const groups = computed(() => groupByCategory(DOCS_ARTICLES));

function categoryLabel(id: DocsCategoryId): string {
    switch (id) {
        case "application":
            return t("docsViewer.category.application", "The application");
        case "rendering":
            return t("docsViewer.category.rendering", "Rendering");
        case "uncategorized":
            return t("docsViewer.category.uncategorized", "Elsewhere in the documentation");
    }
}

/* -------------------------------------------------------------------------- */
/* Rendering an article, and resolving its links                              */
/* -------------------------------------------------------------------------- */

function decorateArticle(html: string): string {
    const template = document.createElement("template");
    template.innerHTML = html;
    for (const anchor of Array.from(template.content.querySelectorAll("a[href]"))) {
        const href = anchor.getAttribute("href") ?? "";
        if (resolveInternalLink(href, DOCS_ARTICLE_IDS) !== null) {
            anchor.setAttribute("data-docs-internal", "true");
            continue;
        }
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
    }
    return template.innerHTML;
}

const renderedArticle = computed(() => {
    const article = selectedArticle.value;
    if (article === null) return "";
    return decorateArticle(renderMarkdown(article.markdown));
});

/**
 * One delegated listener rather than one per link: the rendered markup is rebuilt on every
 * article change, so a per-anchor listener would have to be re-attached every time anyway.
 */
function onArticleClick(event: MouseEvent): void {
    const origin = event.target;
    if (!(origin instanceof Element)) return;
    const anchor = origin.closest<HTMLAnchorElement>("a[data-docs-internal]");
    if (anchor === null) return;
    const href = anchor.getAttribute("href") ?? "";
    const resolved = resolveInternalLink(href, DOCS_ARTICLE_IDS);
    if (resolved === null) return;
    event.preventDefault();
    openArticle(resolved.id, resolved.hash);
}

/** After the DOM updates for a newly opened article, honour any `#anchor` the link carried. */
const articleBody = ref<HTMLElement | null>(null);
watch([selectedArticle, renderedArticle], async () => {
    if (pendingHash.value.length <= 1) return;
    await nextTick();
    const id = pendingHash.value.slice(1);
    const target = articleBody.value?.querySelector(`#${CSS.escape(id)}`);
    target?.scrollIntoView({ block: "start" });
});
</script>

<template>
    <section class="mb-docs" aria-labelledby="mb-docs-title">
        <header class="mb-docs__header">
            <h2 id="mb-docs-title" class="mb-docs__title">
                {{ t("docsViewer.title", "Documentation") }}
            </h2>
            <p class="mb-docs__lede">
                {{
                    t(
                        "docsViewer.lede",
                        "Every article this project documents, bundled into this build so it can be read with no network at all.",
                    )
                }}
            </p>
            <VBtn
                class="mb-docs__tour-button"
                variant="tonal"
                size="small"
                :prepend-icon="mdiCompassOutline"
                @click="requestTutorialLaunch()"
            >
                {{ tourLabel }}
            </VBtn>
        </header>

        <ConfigSearchField
            v-model="query"
            v-model:regex="regex"
            v-model:flags="flags"
            :label="t('docsViewer.search', 'Search the documentation')"
            :placeholder="t('docsViewer.searchHint', 'An article title or a word in its text')"
            :sample="sample"
            density="compact"
        />

        <p v-if="matcher.active" class="mb-docs__count" aria-live="polite">
            {{ countLine }}
        </p>

        <!-- No articles bundled at all: a defensive, honest state; docsContent.test.ts is the real guard. -->
        <VAlert v-if="DOCS_ARTICLES.length === 0" type="warning" variant="tonal" class="mb-docs__empty">
            {{ t("docsViewer.noArticles", "This build carries no bundled documentation at all.") }}
        </VAlert>

        <!-- An article was asked for that this build's bundle does not carry. -->
        <template v-else-if="articleMissing">
            <VBtn class="mb-docs__back" variant="text" :prepend-icon="mdiArrowLeft" @click="backToIndex">
                {{ t("docsViewer.back", "Back to the index") }}
            </VBtn>
            <VAlert type="warning" variant="tonal" class="mb-docs__empty">
                {{ t("docsViewer.articleMissing", "This article is not available in this build.") }}
            </VAlert>
        </template>

        <!-- An article is open. -->
        <template v-else-if="selectedArticle">
            <VBtn class="mb-docs__back" variant="text" :prepend-icon="mdiArrowLeft" @click="backToIndex">
                {{ t("docsViewer.back", "Back to the index") }}
            </VBtn>
            <article
                ref="articleBody"
                class="mb-docs__article"
                role="article"
                :aria-label="selectedArticle.title"
                @click="onArticleClick"
            >
                <h1 ref="headingRef" tabindex="-1" class="mb-docs__article-title">
                    {{ selectedArticle.title }}
                </h1>
                <!-- eslint-disable-next-line vue/no-v-html -- rendered through renderMarkdown(), which sanitizes before returning -->
                <div class="mb-docs__article-body" v-html="renderedArticle" />
            </article>
        </template>

        <!-- A search is active: a flat, honest result list. -->
        <template v-else-if="matcher.active">
            <p v-if="searchResults.length === 0" class="mb-docs__empty-line">
                {{
                    t(
                        "docsViewer.noMatches",
                        {
                            filters: regex
                                ? t("changelog.filterRegex", { pattern: query }, "the pattern {pattern}")
                                : t("changelog.filterText", { text: query }, "the text {text}"),
                        },
                        "Nothing in the documentation matches. {filters} Clear the search to see the rest.",
                    )
                }}
                <VBtn class="mb-docs__clear" variant="tonal" size="small" @click="clearSearch">
                    {{ t("docsViewer.clearFilters", "Clear the search") }}
                </VBtn>
            </p>
            <VList v-else class="mb-docs__results" density="compact" :aria-label="t('docsViewer.articleNav', 'Documentation articles')">
                <VListItem
                    v-for="article in searchResults"
                    :key="article.id"
                    :prepend-icon="mdiFileDocumentOutline"
                    :aria-label="t('docsViewer.openArticle', { title: article.title }, 'Open {title}')"
                    @click="openArticle(article.id)"
                >
                    <!--
                        `:title` bound directly on `<v-list-item>` binds Vuetify's own `title`
                        *prop* (the text it renders), never an HTML `title` attribute -- so once
                        `.v-list-item-title`'s default `overflow: hidden; text-overflow:
                        ellipsis; white-space: nowrap` truncates a long article title, a sighted
                        mouse user has no hover tooltip to recover it (a screen reader still gets
                        the full title, from the `aria-label` above). The `#title` slot still
                        renders inside Vuetify's own `.v-list-item-title` wrapper, so the same
                        span carries a genuine native `title` here instead.
                    -->
                    <template #title>
                        <span :title="article.title">{{ article.title }}</span>
                    </template>
                </VListItem>
            </VList>
        </template>

        <!-- The index: docs/README.md's own grouping, mirrored rather than duplicated by hand. -->
        <nav v-else class="mb-docs__index" :aria-label="t('docsViewer.articleNav', 'Documentation articles')">
            <h3 class="mb-docs__index-heading">{{ t("docsViewer.indexHeading", "Every article") }}</h3>
            <template v-for="group in groups" :key="group.id">
                <VCard class="mb-docs__category" variant="outlined">
                    <VCardText>
                        <h3 class="mb-docs__category-title">{{ categoryLabel(group.id) }}</h3>
                        <VList density="compact">
                            <VListItem
                                v-for="article in group.articles"
                                :key="article.id"
                                :prepend-icon="mdiFileDocumentOutline"
                                :aria-label="t('docsViewer.openArticle', { title: article.title }, 'Open {title}')"
                                @click="openArticle(article.id)"
                            >
                                <!-- See the search-results list above for why this is a slot, not the `title` prop. -->
                                <template #title>
                                    <span :title="article.title">{{ article.title }}</span>
                                </template>
                            </VListItem>
                        </VList>
                    </VCardText>
                </VCard>
            </template>
        </nav>
    </section>
</template>

<style>
.mb-docs {
    padding: 8px 16px 24px;
    max-width: 56rem;
    margin-inline: auto;
}

.mb-docs__title {
    font-size: 1.125rem;
    font-weight: 500;
    margin-block: 4px 2px;
}

.mb-docs__lede,
.mb-docs__count {
    font-size: 0.75rem;
    line-height: 1.45;
    margin-block: 2px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-docs__tour-button {
    margin-block-start: 8px;
}

.mb-docs__count {
    margin-block-start: 6px;
}

.mb-docs__empty,
.mb-docs__empty-line {
    margin-block-start: 16px;
}

.mb-docs__empty-line {
    font-size: 0.875rem;
}

.mb-docs__clear {
    margin-inline-start: 8px;
}

.mb-docs__back {
    margin-block: 8px 4px;
}

.mb-docs__index {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-block-start: 8px;
}

.mb-docs__index-heading {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-block-end: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-docs__category-title {
    font-size: 0.9375rem;
    font-weight: 500;
    margin-block-end: 4px;
}

.mb-docs__results {
    margin-block-start: 8px;
}

.mb-docs__article-title {
    font-size: 1.375rem;
    font-weight: 500;
    margin-block: 12px 8px;
    outline: none;
}

.mb-docs__article-title:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 4px;
}

.mb-docs__article-body {
    font-size: 0.875rem;
    line-height: 1.6;
    overflow-wrap: anywhere;
}

.mb-docs__article-body :deep(h1),
.mb-docs__article-body :deep(h2),
.mb-docs__article-body :deep(h3) {
    font-weight: 500;
    margin-block: 20px 8px;
}

.mb-docs__article-body :deep(p) {
    margin-block: 8px;
}

.mb-docs__article-body :deep(a) {
    color: rgb(var(--v-theme-primary));
}

.mb-docs__article-body :deep(code) {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.8125rem;
    background: rgba(var(--v-theme-on-surface), 0.08);
    border-radius: 4px;
    padding: 1px 4px;
}

.mb-docs__article-body :deep(pre) {
    overflow-x: auto;
    padding: 12px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.06);
}

.mb-docs__article-body :deep(pre code) {
    background: none;
    padding: 0;
}

.mb-docs__article-body :deep(table) {
    border-collapse: collapse;
    width: 100%;
    display: block;
    overflow-x: auto;
}

.mb-docs__article-body :deep(th),
.mb-docs__article-body :deep(td) {
    padding: 4px 8px;
    border: solid 1px rgba(var(--v-theme-on-surface), 0.12);
    text-align: start;
    vertical-align: top;
}

.mb-docs__article-body :deep(blockquote) {
    margin: 8px 0;
    padding: 4px 12px;
    border-inline-start: solid 3px rgba(var(--v-theme-on-surface), 0.24);
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>

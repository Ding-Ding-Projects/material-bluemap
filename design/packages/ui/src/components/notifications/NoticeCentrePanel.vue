<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiAlertOutline,
    mdiCheckCircleOutline,
    mdiClose,
    mdiContentCopy,
    mdiInformationOutline,
    mdiOpenInNew,
    mdiRestore,
} from "@mdi/js";
import { VBtn, VCard, VDivider, VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { restore, type Notice, type NoticeLevel, type NoticeState } from "../config/notifications.js";
import {
    NOTICE_LEVELS,
    countByLevel,
    filterNotices,
    formatNoticesAsMarkdown,
    noticeSampleText,
} from "./noticeCentre.js";

/**
 * The notification centre: everything this session has reported, still readable.
 *
 * A toast leaves on purpose, and the message somebody wants is reliably the one that left.
 * This is where it goes: every notice raised this session with its level, title, body,
 * detail, timestamp and the actions it offered, none of which the toast disposed of when it
 * faded. Restoring one puts that same notice back in the corner with its actions attached,
 * so a retry dismissed by a stray click is one press away rather than gone.
 *
 * It is a panel and not a dialog. Nothing here is a decision, so nothing here blocks: it
 * opens from the bell in the notification corner, paints over the map, and the map keeps
 * working underneath. The only surfaces in this application that block are the ones that
 * genuinely cannot continue without an answer, and a list of things that already happened is
 * not one of them.
 *
 * The search bar is the settings editor's own `ConfigSearchField`, which brings the regex
 * builder anchored beside it. Reusing it rather than writing a fourth one is not only less
 * code: it is the only way the pattern a user builds here can be guaranteed to behave the
 * way one built in the options search behaves, because it is literally the same field over
 * the same engine.
 */
const props = defineProps<{ state: NoticeState }>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

const query = ref("");
const regex = ref(false);
const flags = ref("i");

/**
 * Empty means "no level filter", not "no levels". The row starts here and a chip toggles
 * itself in and out, so the first press narrows to one level rather than excluding one.
 */
const selectedLevels = ref<NoticeLevel[]>([]);

const copied = ref(false);

const counts = computed(() => countByLevel(props.state.history));

const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));

const visible = computed(() =>
    filterNotices(props.state.history, { levels: selectedLevels.value, matcher: matcher.value }),
);

const sample = computed(() => noticeSampleText(props.state.history));

/** An honest count, so a filter that is hiding things says how many. */
const summary = computed(() =>
    props.state.history.length === 0
        ? ""
        : t(
              "notices.centre.summary",
              { shown: visible.value.length, total: props.state.history.length },
              "Showing {shown} of {total} notifications.",
          ),
);

const LEVEL_ICONS: Record<NoticeLevel, string> = {
    error: mdiAlertCircleOutline,
    warning: mdiAlertOutline,
    success: mdiCheckCircleOutline,
    info: mdiInformationOutline,
};

function levelLabel(level: NoticeLevel): string {
    switch (level) {
        case "error":
            return t("notices.level.error", "Errors");
        case "warning":
            return t("notices.level.warning", "Warnings");
        case "success":
            return t("notices.level.success", "Successes");
        case "info":
            return t("notices.level.info", "Information");
    }
}

function isSelected(level: NoticeLevel): boolean {
    return selectedLevels.value.includes(level);
}

function toggleLevel(level: NoticeLevel): void {
    selectedLevels.value = isSelected(level)
        ? selectedLevels.value.filter((entry) => entry !== level)
        : [...selectedLevels.value, level];
}

/**
 * Whether a notice is on screen right now, which is what decides between offering to show
 * it again and saying it is already showing. Offering "show again" for something already in
 * the corner is a button that appears to do nothing.
 */
function isLive(notice: Notice): boolean {
    return props.state.live.some((entry) => entry.id === notice.id);
}

function showAgain(notice: Notice): void {
    restore(props.state, notice.id);
}

/**
 * Copies what the panel is showing, filter and search included.
 *
 * `navigator.clipboard` is absent in a plain jsdom and can be refused by permission policy,
 * so the failure is reported rather than swallowed: a copy button that silently did nothing
 * is worse than one that says it could not.
 */
async function copyVisible(): Promise<void> {
    const text = formatNoticesAsMarkdown(visible.value);
    try {
        await navigator.clipboard.writeText(text);
        copied.value = true;
        setTimeout(() => {
            copied.value = false;
        }, 2000);
    } catch {
        copied.value = false;
    }
}
</script>

<template>
    <v-card
        class="mb-notice-centre"
        role="region"
        :aria-label="t('notices.centre.title', 'Notification centre')"
    >
        <header class="mb-notice-centre__head">
            <h2 class="mb-notice-centre__heading">{{ t("notices.centre.title", "Notification centre") }}</h2>
            <v-btn
                :icon="mdiClose"
                :aria-label="t('notices.centre.close', 'Close the notification centre')"
                class="mb-notice-centre__icon-button"
                variant="text"
                density="comfortable"
                @click="emit('close')"
            />
        </header>

        <div class="mb-notice-centre__controls">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regex"
                v-model:flags="flags"
                :label="t('notices.centre.search', 'Search notifications')"
                :placeholder="t('notices.centre.searchHint', 'Message, detail, level or timestamp')"
                :sample="sample"
                :summary="summary"
            />

            <div
                class="mb-notice-centre__levels"
                role="group"
                :aria-label="t('notices.centre.filterLevels', 'Filter by level')"
            >
                <v-btn
                    v-for="level in NOTICE_LEVELS"
                    :key="level"
                    class="mb-notice-centre__level"
                    :variant="isSelected(level) ? 'tonal' : 'outlined'"
                    :color="isSelected(level) ? 'primary' : undefined"
                    :aria-pressed="isSelected(level) ? 'true' : 'false'"
                    size="small"
                    density="comfortable"
                    @click="toggleLevel(level)"
                >
                    {{ t("notices.centre.levelChip", { level: levelLabel(level), count: counts[level] }, "{level} ({count})") }}
                </v-btn>
            </div>
        </div>

        <v-divider />

        <!--
            A plain list rather than `<v-list>`: every row carries a heading, a disclosure and
            up to three buttons, and a list component that decides its own roles and its own
            focus order would be fighting all of them. Everything interactive inside is a
            real button, so keyboard reach comes from the document rather than from a widget.
        -->
        <p v-if="state.history.length === 0" class="mb-notice-centre__empty">
            {{ t("notices.centre.empty", "Nothing has been reported yet. Messages appear here after they leave the corner.") }}
        </p>
        <p v-else-if="visible.length === 0" class="mb-notice-centre__empty">
            {{ t("notices.centre.noMatch", "No notification matches this search and these levels.") }}
        </p>
        <ul v-else class="mb-notice-centre__list">
            <li v-for="notice in visible" :key="notice.id" class="mb-notice-centre__item">
                <div class="mb-notice-centre__row">
                    <v-icon :icon="LEVEL_ICONS[notice.level]" :color="notice.level" size="small" aria-hidden="true" />
                    <div class="mb-notice-centre__text">
                        <p class="mb-notice-centre__meta">
                            <span class="mb-notice-centre__level-name">{{ levelLabel(notice.level) }}</span>
                            <span>{{ notice.at }}</span>
                        </p>
                        <p v-if="notice.title" class="mb-notice-centre__title">{{ notice.title }}</p>
                        <p class="mb-notice-centre__message">{{ notice.message }}</p>
                        <details v-if="notice.detail">
                            <summary>{{ t("notices.centre.detail", "Details") }}</summary>
                            <pre class="mb-notice-centre__detail">{{ notice.detail }}</pre>
                        </details>
                    </div>
                </div>

                <div class="mb-notice-centre__actions">
                    <v-btn
                        v-for="action in notice.actions ?? []"
                        :key="action.id"
                        :href="action.href"
                        :target="action.href ? '_blank' : undefined"
                        :rel="action.href ? 'noreferrer' : undefined"
                        :append-icon="action.href ? mdiOpenInNew : undefined"
                        variant="text"
                        size="small"
                        density="comfortable"
                        @click="action.run?.()"
                    >
                        {{ action.label }}
                    </v-btn>

                    <v-btn
                        v-if="!isLive(notice)"
                        :prepend-icon="mdiRestore"
                        variant="text"
                        size="small"
                        density="comfortable"
                        @click="showAgain(notice)"
                    >
                        {{ t("notices.centre.showAgain", "Show again") }}
                    </v-btn>
                    <span v-else class="mb-notice-centre__showing">
                        {{ t("notices.centre.showing", "Showing now") }}
                    </span>
                </div>
            </li>
        </ul>

        <v-divider v-if="visible.length > 0" />

        <footer v-if="visible.length > 0" class="mb-notice-centre__foot">
            <v-btn
                :prepend-icon="mdiContentCopy"
                variant="text"
                size="small"
                density="comfortable"
                @click="copyVisible"
            >
                {{ t("notices.centre.copy", "Copy what is shown") }}
            </v-btn>
            <span v-if="copied" class="mb-notice-centre__copied" role="status" aria-live="polite">
                {{ t("notices.centre.copied", "Copied as Markdown.") }}
            </span>
        </footer>
    </v-card>
</template>

<style>
.mb-notice-centre {
    width: min(440px, calc(100vw - 32px));
    max-height: min(70vh, 640px);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}

.mb-notice-centre__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 12px 0 16px;
}

.mb-notice-centre__heading {
    font-size: 1rem;
    font-weight: 500;
    margin: 0;
}

/*
 * Every icon-only control in this panel is at least a 40px square, so the target is a
 * target rather than a pixel hunt. Vuetify's density shrinks the painted button and this
 * floor stops it shrinking the thing a finger has to hit.
 */
.mb-notice-centre__icon-button {
    min-width: 40px;
    min-height: 40px;
}

.mb-notice-centre__controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 16px 12px;
}

.mb-notice-centre__levels {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.mb-notice-centre__level {
    min-height: 32px;
}

.mb-notice-centre__empty {
    padding: 16px;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-notice-centre__list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
}

.mb-notice-centre__item {
    padding: 10px 16px;
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mb-notice-centre__item:last-child {
    border-block-end: none;
}

.mb-notice-centre__row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
}

.mb-notice-centre__text {
    flex: 1 1 auto;
    min-width: 0;
}

.mb-notice-centre__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-notice-centre__level-name {
    font-weight: 600;
}

.mb-notice-centre__title {
    font-size: 0.875rem;
    font-weight: 500;
}

.mb-notice-centre__message {
    font-size: 0.8125rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
}

.mb-notice-centre__detail {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    white-space: pre-wrap;
    max-height: 10em;
    overflow: auto;
}

.mb-notice-centre__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-block-start: 4px;
}

.mb-notice-centre__showing,
.mb-notice-centre__copied {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-notice-centre__foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-notice-centre * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>

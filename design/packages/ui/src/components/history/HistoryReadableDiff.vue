<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowRightThin, mdiRestore } from "@mdi/js";
import { VBtn, VChip, VIcon } from "vuetify/components";

import {
    diffTotals,
    readableDiff,
    type ConfigFileName,
    type ReadableFileDiff,
    type SettingChange,
} from "./historyDiff.js";
import type { HistoryComparisonFile } from "./historyHost.js";

/**
 * What changed, said as settings rather than as lines.
 *
 * ### The raw patch is behind a disclosure, not gone
 *
 * Somebody who wants the unified diff is usually somebody debugging, and taking it away to
 * make the common case tidy would be trading their worst moment for everyone else's best
 * one. So every file keeps its patch in a `<details>`: closed by default because the
 * settings above it answer the question nine times in ten, and one keystroke away because
 * the tenth time nothing else will do.
 *
 * ### An unreadable file says why
 *
 * A `.conf` this editor cannot parse, a file too large to read whole, a file that is not
 * text at all: each of those is a sentence naming the file and the reason, followed by the
 * patch. The one thing this component never does is show an empty settings list for a file
 * that definitely changed, because that reads as "nothing happened" and something did.
 *
 * ### Restoring one setting is offered here or nowhere
 *
 * The button sits next to the setting it puts back, which is the only place somebody would
 * look for it. It is rendered only when the caller passes `restorable`, because the panel
 * knows two things this component does not: whether the host can perform a setting-level
 * restore at all, and whether this diff is one where restoring makes sense.
 *
 * ### The button names the value it is really going to apply
 *
 * Which of the two values a restore applies depends on which end the caller restores from,
 * and the two callers differ: a revision row shows what that revision *did* and restores to
 * it, so the value applied is the newer one; a comparison of A and B restores back to A, so
 * the value applied is the older one. `restoreSide` is how the caller says which, and it
 * exists because a button promising the wrong one of two similar values is worse than a
 * button with no promise at all - it looks precise and it is wrong.
 */
const props = withDefaults(
    defineProps<{
        /** The files of a comparison, with both sides' text where they could be sent. */
        files: readonly HistoryComparisonFile[];
        /** True when each setting may offer to put its old value back. */
        restorable?: boolean;
        /** Disables the restore buttons while a history operation is in flight. */
        busy?: boolean;
        /** Which end's value a restore from here would apply. */
        restoreSide?: "before" | "after";
        /** The revision a restore takes from, named in the buttons so it is never guessed. */
        sourceLabel?: string;
    }>(),
    { restorable: false, busy: false, restoreSide: "after", sourceLabel: "" },
);

const emit = defineEmits<{
    /** One setting, asked to be put back: the file's path and the dotted key. */
    restoreSetting: [path: string, key: string];
    /** One whole file, asked to be put back. */
    restoreFile: [path: string];
}>();

const { t } = useI18n();

const diffs = computed<ReadableFileDiff[]>(() => readableDiff(props.files));
const totals = computed(() => diffTotals(diffs.value));

const canRestore = computed(() => props.restorable === true);
const isBusy = computed(() => props.busy === true);
const source = computed(() => props.sourceLabel ?? "");

/**
 * The value a restore would apply, which is the one the button has to name.
 *
 * A setting that only exists on the other side has no value on this one, and the button says
 * so in words rather than naming an empty string, because "Put sky-color back to " is a
 * sentence that reads as a rendering bug.
 */
function appliedValue(change: SettingChange): string {
    const value = (props.restoreSide ?? "after") === "before" ? change.before : change.after;
    return value ?? t("history.diff.notSet", "not set");
}

/** The file in the words the rest of the editor uses, falling back to the honest path. */
function fileTitle(file: ConfigFileName): string {
    switch (file.kind) {
        case "map":
            return t("history.file.map", { name: file.name }, "the {name} map");
        case "storage":
            return t("history.file.storage", { name: file.name }, "the {name} storage");
        case "core":
            return t("history.file.core", "the core settings");
        case "webapp":
            return t("history.file.webapp", "the web app settings");
        case "webserver":
            return t("history.file.webserver", "the web server settings");
        case "plugin":
            return t("history.file.plugin", "the plugin settings");
        default:
            return file.path;
    }
}

function statusLabel(status: ReadableFileDiff["status"]): string {
    switch (status) {
        case "added":
            return t("history.diff.added", "Added");
        case "deleted":
            return t("history.diff.removed", "Taken away");
        default:
            return t("history.diff.changed", "Changed");
    }
}

function statusColour(status: ReadableFileDiff["status"]): string | undefined {
    if (status === "added") return "success";
    if (status === "deleted") return "error";
    return undefined;
}

/** Split for colouring, so an added line is not merely a line beginning with a plus. */
function lineClass(line: string): string {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index "))
        return "mb-history-diff__meta";
    if (line.startsWith("@@")) return "mb-history-diff__hunk";
    if (line.startsWith("+")) return "mb-history-diff__added";
    if (line.startsWith("-")) return "mb-history-diff__removed";
    return "";
}

/** The one-line summary above the files, which is what a reader scans first. */
const summary = computed(() => {
    const counts = totals.value;
    if (counts.files === 0) return t("history.diff.nothing", "No file changed.");

    const files = t("history.diff.fileCount", { count: String(counts.files) }, "{count} files");
    if (counts.unreadable === counts.files) {
        return t("history.diff.filesOnly", { files }, "{files} changed.");
    }
    return t(
        "history.diff.summary",
        { files, settings: String(counts.settings) },
        "{files} changed, {settings} settings between them.",
    );
});
</script>

<template>
    <div class="mb-history-readable">
        <p class="mb-history-readable__summary" role="status">{{ summary }}</p>

        <section v-for="file in diffs" :key="file.path" class="mb-history-readable__file">
            <header class="mb-history-readable__fileHead">
                <v-chip :color="statusColour(file.status)" size="x-small" variant="tonal" label>
                    {{ statusLabel(file.status) }}
                </v-chip>
                <h5 class="mb-history-readable__fileName">{{ fileTitle(file.file) }}</h5>
                <code class="mb-history-readable__filePath">{{ file.path }}</code>

                <v-btn
                    v-if="canRestore"
                    :prepend-icon="mdiRestore"
                    variant="text"
                    size="x-small"
                    density="comfortable"
                    :disabled="isBusy"
                    :aria-label="
                        t(
                            'history.diff.restoreFileLong',
                            { path: file.path, source },
                            'Put {path} back as it was at {source}, leaving every other file alone',
                        )
                    "
                    @click="emit('restoreFile', file.path)"
                >
                    {{ t("history.diff.restoreFile", "Put this file back") }}
                </v-btn>
            </header>

            <ul v-if="file.settings && file.settings.length > 0" class="mb-history-readable__settings">
                <li v-for="change in file.settings" :key="change.key" class="mb-history-readable__setting">
                    <code class="mb-history-readable__key">{{ change.key }}</code>

                    <span v-if="change.kind === 'added'" class="mb-history-readable__values">
                        <span class="mb-history-readable__new">{{ change.after }}</span>
                        <span class="mb-history-readable__note">{{
                            t("history.diff.wasUnset", "(was not set)")
                        }}</span>
                    </span>
                    <span v-else-if="change.kind === 'gone'" class="mb-history-readable__values">
                        <span class="mb-history-readable__old">{{ change.before }}</span>
                        <span class="mb-history-readable__note">{{
                            t("history.diff.nowUnset", "(no longer set)")
                        }}</span>
                    </span>
                    <span v-else class="mb-history-readable__values">
                        <span class="mb-history-readable__old">{{ change.before }}</span>
                        <v-icon :icon="mdiArrowRightThin" size="14" aria-hidden="true" />
                        <span class="mb-history-readable__new">{{ change.after }}</span>
                    </span>

                    <v-btn
                        v-if="canRestore"
                        :icon="mdiRestore"
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        :disabled="isBusy"
                        :aria-label="
                            t(
                                'history.diff.restoreSettingLong',
                                { key: change.key, value: appliedValue(change), source },
                                'Put {key} back to {value}, as it was at {source}',
                            )
                        "
                        @click="emit('restoreSetting', file.path, change.key)"
                    />
                </li>
            </ul>

            <p v-else-if="file.settings && file.settings.length === 0" class="mb-history-readable__quiet">
                {{
                    t(
                        "history.diff.noSettings",
                        "No setting changed in this file. Something else did: a comment, an ordering, or the spacing.",
                    )
                }}
            </p>

            <p v-if="file.unreadable" class="mb-history-readable__quiet">{{ file.unreadable }}</p>

            <details v-if="file.patch" class="mb-history-readable__raw">
                <summary>{{ t("history.diff.showRaw", "Show the raw patch") }}</summary>
                <pre
                    class="mb-history-diff__body"
                    tabindex="0"
                    :aria-label="t('history.diff.rawFor', { path: file.path }, 'The raw patch for {path}')"
                ><code><span
                    v-for="(line, index) in file.patch.split('\n')"
                    :key="index"
                    :class="lineClass(line)"
                >{{ line }}
</span></code></pre>
            </details>
        </section>

        <p v-if="diffs.length === 0" class="mb-history-readable__quiet">
            {{ t("history.diff.identical", "These two moments hold exactly the same files.") }}
        </p>
    </div>
</template>

<style>
.mb-history-readable__summary {
    margin: 0 0 6px;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history-readable__file {
    margin-block-start: 10px;
}

.mb-history-readable__fileHead {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.mb-history-readable__fileName {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 500;
}

.mb-history-readable__filePath {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-history-readable__settings {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
}

.mb-history-readable__setting {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding: 2px 0;
    font-size: 0.8125rem;
}

.mb-history-readable__key {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
}

.mb-history-readable__values {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    min-width: 0;
}

.mb-history-readable__old {
    color: rgb(var(--v-theme-error));
    text-decoration: line-through;
    overflow-wrap: anywhere;
}

.mb-history-readable__new {
    color: rgb(var(--v-theme-success));
    overflow-wrap: anywhere;
}

.mb-history-readable__note,
.mb-history-readable__quiet {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history-readable__quiet {
    margin: 4px 0 0;
}

.mb-history-readable__raw {
    margin-block-start: 6px;
    font-size: 0.75rem;
}

.mb-history-readable__raw summary {
    cursor: pointer;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history-readable__raw summary:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

/*
 * Bounded and scrollable rather than clipped. A patch is arbitrarily long and arbitrarily
 * wide, and a block that hides its overflow deletes the end of it with nothing on screen
 * to say anything is missing.
 */
.mb-history-diff__body {
    max-height: 320px;
    margin: 4px 0 0;
    padding: 6px 8px;
    overflow: auto;
    font-size: 0.75rem;
    line-height: 1.45;
    background: rgba(var(--v-theme-on-surface), 0.04);
    border-radius: 6px;
}

.mb-history-diff__body:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-history-diff__added {
    color: rgb(var(--v-theme-success));
}

.mb-history-diff__removed {
    color: rgb(var(--v-theme-error));
}

.mb-history-diff__hunk,
.mb-history-diff__meta {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>

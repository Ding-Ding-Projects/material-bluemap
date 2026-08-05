<script setup lang="ts">
import { computed, useId } from "vue";
import { useI18n } from "vue-i18n";
import { mdiFolderOpenOutline, mdiFileOutline } from "@mdi/js";
import { VBtn, VTextField, VTooltip } from "vuetify/components";
import { resolvePathFieldBridge, type PathFieldBridge } from "./pathFieldHost.js";

/**
 * A path text box with a trailing native browse button, adoptable by any field that names a
 * folder or a file on this machine.
 *
 * Modelled directly on `ConfigControl.vue`'s `kind === 'path'` branch - the same icon choice,
 * the same disabled-with-reason state when there is no bridge, the same tooltip - but reached
 * from `pathFieldHost.ts` rather than `configHost.ts`, because this is meant to be dropped
 * into fields that `configHost.ts` cannot reach: `configHost.ts`'s `useConfigHost()` resolves
 * to `null` outside the three screens that call `provideConfigHost()` (World, Projects,
 * Config), and Settings, Backup and the remote target editor are outside all three.
 * `pathFieldHost.ts` probes `window.materialBluemap.dialog` directly instead, so this works
 * from anywhere with nothing to provide and nothing to inject.
 *
 * A pick writes into `v-model` exactly as typing would: same event
 * (`update:modelValue`), same string, no separate "picked" state. A cancelled dialog changes
 * nothing and reports nothing, matching every other picker in the app (see `pathField.ts`'s
 * file header for why there is deliberately no "cancelled" notice).
 */

export type PathFieldSemantic = "folder" | "file" | "either";

const props = withDefaults(
    defineProps<{
        modelValue: string;
        /**
         * What this path is, in words that read naturally after "Browse for" and after
         * "Choose", e.g. `"world folder"` or `"the SSH identity file"`. Builds the accessible
         * name, the tooltip and the native dialog's title.
         */
        field: string;
        /** The text field's own visible label. Defaults to {@link field}. */
        label?: string;
        /**
         * Which browse button(s) to show. `"either"` shows both a folder button and a file
         * button on the same field, for a setting that could honestly be either.
         */
        semantic: PathFieldSemantic;
        disabled?: boolean;
        /** Inline error text, shown under the control. */
        error?: string | null;
        placeholder?: string;
        /** Extensions without the dot, e.g. `["jar"]`. Only used when a file button shows. */
        extensions?: readonly string[];
        density?: "default" | "comfortable" | "compact";
        /**
         * Injected in tests. Left out, the component probes the Electron bridge itself, which
         * is what the running application does; an explicit `null` says there is deliberately
         * none, and the browse button(s) show the honest disabled state.
         */
        bridge?: PathFieldBridge | null;
    }>(),
    { disabled: false, error: null, density: "compact" },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { t } = useI18n();

const resolvedBridge = computed<PathFieldBridge | null>(() =>
    props.bridge === undefined ? resolvePathFieldBridge() : props.bridge,
);

const path = computed<string>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const displayLabel = computed(() => props.label ?? props.field);
const isDisabled = computed(() => props.disabled === true);

const showFolderButton = computed(() => props.semantic === "folder" || props.semantic === "either");
const showFileButton = computed(() => props.semantic === "file" || props.semantic === "either");

/** "Browse for {field}" when only one button shows; a kind-qualified name when both do. */
const folderAria = computed(() =>
    props.semantic === "either"
        ? t("pathField.browseFolder.eitherAria", { field: props.field }, "Browse for a folder, for {field}")
        : t("pathField.browse.aria", { field: props.field }, "Browse for {field}"),
);
const fileAria = computed(() =>
    props.semantic === "either"
        ? t("pathField.browseFile.eitherAria", { field: props.field }, "Browse for a file, for {field}")
        : t("pathField.browse.aria", { field: props.field }, "Browse for {field}"),
);

const dialogTitle = computed(() => t("pathField.dialogTitle", { field: props.field }, "Choose {field}"));

const unavailableText = computed(() =>
    t(
        "pathField.unavailable",
        { field: props.field },
        "Browsing for {field} needs the desktop app. Type or paste the path here instead.",
    ),
);

/**
 * A native `disabled` `<button>` never fires hover/focus events and drops out of the tab
 * order (Vuetify also sets `pointer-events: none` on it), so a `v-tooltip` anchored to the
 * disabled browse button can never be opened by mouse, touch, or keyboard - the explanation
 * would be unreachable exactly when it's needed. So when there's no bridge, the reason is
 * rendered as always-visible help text instead of a tooltip, and wired to both buttons via
 * `aria-describedby` so a screen reader announces it without requiring the button to be
 * focusable.
 */
const unavailableHintId = useId();

function startInOrNothing(): { startIn?: string } {
    const trimmed = path.value.trim();
    return trimmed === "" ? {} : { startIn: trimmed };
}

async function browseFolder(): Promise<void> {
    const bridge = resolvedBridge.value;
    if (bridge === null || isDisabled.value) return;
    const chosen = await bridge.pickFolder({ title: dialogTitle.value, ...startInOrNothing() });
    if (chosen !== null) emit("update:modelValue", chosen);
}

async function browseFile(): Promise<void> {
    const bridge = resolvedBridge.value;
    if (bridge === null || isDisabled.value) return;
    const chosen = await bridge.pickFile({
        title: dialogTitle.value,
        ...(props.extensions === undefined || props.extensions.length === 0
            ? {}
            : { extensions: props.extensions }),
        ...startInOrNothing(),
    });
    if (chosen !== null) emit("update:modelValue", chosen);
}
</script>

<template>
    <div class="mb-path-field">
        <div class="mb-path-field__row">
            <v-text-field
                v-model="path"
                :label="displayLabel"
                :placeholder="placeholder ?? ''"
                :disabled="isDisabled"
                :error-messages="error ?? undefined"
                class="mb-path-field__mono"
                variant="outlined"
                :density="density"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                hide-details="auto"
            />
            <v-btn
                v-if="showFolderButton"
                :icon="mdiFolderOpenOutline"
                :aria-label="folderAria"
                :aria-describedby="resolvedBridge === null ? unavailableHintId : undefined"
                :disabled="isDisabled || resolvedBridge === null"
                variant="tonal"
                size="small"
                @click="browseFolder"
            >
                <v-tooltip v-if="resolvedBridge !== null" activator="parent" location="top" :text="folderAria" />
            </v-btn>
            <v-btn
                v-if="showFileButton"
                :icon="mdiFileOutline"
                :aria-label="fileAria"
                :aria-describedby="resolvedBridge === null ? unavailableHintId : undefined"
                :disabled="isDisabled || resolvedBridge === null"
                variant="tonal"
                size="small"
                @click="browseFile"
            >
                <v-tooltip v-if="resolvedBridge !== null" activator="parent" location="top" :text="fileAria" />
            </v-btn>
        </div>
        <!--
            Always-visible, not a tooltip on the disabled button: see the `unavailableHintId`
            comment above for why a tooltip anchored there can never be opened.
        -->
        <div
            v-if="resolvedBridge === null && (showFolderButton || showFileButton)"
            :id="unavailableHintId"
            class="mb-path-field__hint text-medium-emphasis"
        >
            {{ unavailableText }}
        </div>
    </div>
</template>

<style>
.mb-path-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-path-field__row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.mb-path-field__row .v-text-field {
    flex: 1 1 220px;
    min-width: 0;
}

.mb-path-field__mono input {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.8125rem;
}

.mb-path-field__hint {
    font-size: 0.75rem;
    line-height: 1.3;
}
</style>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiEye, mdiEyeOff, mdiPlus } from "@mdi/js";
import { VAlert, VBtn, VTextField } from "vuetify/components";
import type { KeyValueControl, PlainValue } from "@material-bluemap/config";

/**
 * An editable string-to-string mapping. In practice this is one setting:
 * `connection-properties` on an SQL storage, which is where the database user
 * and password live.
 *
 * Anything whose key is named in `control.secretKeys` is masked, is never put in
 * the search index (see `fieldValue.ts`), and is never included in an exported
 * diagnostic. The reveal control is deliberate and per row: somebody checking a
 * password they just typed should be able to, and nobody should have it on
 * screen by accident while sharing a window.
 */
const props = withDefaults(
    defineProps<{
        control: KeyValueControl;
        modelValue: Readonly<Record<string, PlainValue>>;
        label: string;
        disabled?: boolean;
    }>(),
    { disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [value: Record<string, PlainValue>] }>();

const { t } = useI18n();

const revealed = ref<Set<string>>(new Set());
const newKey = ref("");
const notice = ref<string | null>(null);
/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const isDisabled = computed(() => props.disabled === true);


const rows = computed(() => Object.entries(props.modelValue).map(([key, value]) => ({ key, value: typeof value === "string" ? value : String(value ?? "") })));

function isSecret(key: string): boolean {
    return props.control.secretKeys.some((candidate) => candidate.toLowerCase() === key.toLowerCase());
}

function commit(next: Record<string, PlainValue>): void {
    emit("update:modelValue", next);
}

function setValue(key: string, value: string): void {
    commit({ ...props.modelValue, [key]: value });
}

function rename(oldKey: string, nextKey: string): void {
    const trimmed = nextKey.trim();
    if (trimmed === "" || trimmed === oldKey) return;
    if (Object.prototype.hasOwnProperty.call(props.modelValue, trimmed)) {
        // `t(key, named, fallback)` throughout this file, never `t(key, fallback).replace(...)`:
        // vue-i18n compiles the message itself, so it consumes `{key}` as its own named
        // parameter and a later `replace` finds nothing left to substitute. The rejection
        // then names no property, which is the only thing it was there to say.
        notice.value = t("config.keyValue.duplicate", { key: trimmed }, "There is already a property called {key}.");
        return;
    }
    notice.value = null;

    const next: Record<string, PlainValue> = {};
    for (const [key, value] of Object.entries(props.modelValue)) next[key === oldKey ? trimmed : key] = value;
    commit(next);
}

function remove(key: string): void {
    notice.value = null;
    const next: Record<string, PlainValue> = {};
    for (const [candidate, value] of Object.entries(props.modelValue)) {
        if (candidate !== key) next[candidate] = value;
    }
    commit(next);
}

function add(): void {
    const key = newKey.value.trim();
    if (key === "") return;
    if (Object.prototype.hasOwnProperty.call(props.modelValue, key)) {
        notice.value = t("config.keyValue.duplicate", { key }, "There is already a property called {key}.");
        return;
    }
    notice.value = null;
    newKey.value = "";
    commit({ ...props.modelValue, [key]: "" });
}

function toggleReveal(key: string): void {
    const next = new Set(revealed.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    revealed.value = next;
}
</script>

<template>
    <div class="mb-config-kv" role="group" :aria-label="label">
        <p v-if="rows.length === 0" class="mb-config-kv__empty">
            {{ t("config.keyValue.empty", "No properties set.") }}
        </p>

        <div v-for="row in rows" :key="row.key" class="mb-config-kv__row">
            <v-text-field
                :model-value="row.key"
                :label="control.keyLabel"
                :disabled="isDisabled"
                variant="outlined"
                density="compact"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                hide-details="auto"
                @change="(event: Event) => rename(row.key, (event.target as HTMLInputElement).value)"
            />
            <v-text-field
                :model-value="row.value"
                :label="control.valueLabel"
                :type="isSecret(row.key) && !revealed.has(row.key) ? 'password' : 'text'"
                :append-inner-icon="isSecret(row.key) ? (revealed.has(row.key) ? mdiEyeOff : mdiEye) : ''"
                :disabled="isDisabled"
                variant="outlined"
                density="compact"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                hide-details="auto"
                @click:append-inner="toggleReveal(row.key)"
                @update:model-value="(value: string) => setValue(row.key, value)"
            />
            <v-btn
                :icon="mdiClose"
                :aria-label="t('config.keyValue.remove', { key: row.key }, 'Remove {key}')"
                :disabled="isDisabled"
                variant="text"
                size="small"
                density="comfortable"
                color="error"
                @click="remove(row.key)"
            />
        </div>

        <v-alert v-if="notice" type="warning" density="compact" variant="tonal" class="mt-2" role="alert">
            {{ notice }}
        </v-alert>

        <div class="mb-config-kv__add">
            <v-text-field
                v-model="newKey"
                :label="t('config.keyValue.newKey', { key: control.keyLabel.toLowerCase() }, 'New {key}')"
                :disabled="isDisabled"
                variant="outlined"
                density="compact"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                hide-details="auto"
                @keydown.enter.prevent="add"
            />
            <v-btn :prepend-icon="mdiPlus" :disabled="isDisabled || newKey.trim() === ''" variant="tonal" size="small" @click="add">
                {{ t("config.keyValue.add", "Add") }}
            </v-btn>
        </div>

        <p v-if="control.secretKeys.length > 0" class="mb-config-kv__note">
            {{
                t(
                    "config.keyValue.secretNote",
                    { keys: control.secretKeys.join(", ") },
                    "Values for {keys} are treated as credentials: masked here, left out of search, and never written to a log or an exported diagnostic.",
                )
            }}
        </p>
    </div>
</template>

<style>
.mb-config-kv__row,
.mb-config-kv__add {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-block-end: 8px;
}

.mb-config-kv__row .v-text-field,
.mb-config-kv__add .v-text-field {
    flex: 1 1 160px;
    min-width: 0;
}

.mb-config-kv__empty,
.mb-config-kv__note {
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>

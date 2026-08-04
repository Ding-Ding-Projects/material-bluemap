<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowRightCircleOutline, mdiFlashOutline, mdiTuneVariant } from "@mdi/js";
import { VIcon, VSelect, VSwitch, VTextField } from "vuetify/components";
import { parseNumberInput, roundToStep } from "../config/fieldValue.js";
import type { PaletteItem } from "./paletteItems.js";

/**
 * One row of the palette, and the place the "no decorative controls" rule is actually kept.
 *
 * A row is drawn from what its item *is*, never from what it looks like it should be. A
 * command or a destination is a single full-width button, because the whole row does one
 * thing when it is pressed and nothing inside it is separately operable. A setting is not a
 * button at all - it is a label beside the real control, so pressing Enter on the switch
 * flips the setting rather than "activating the row", and the palette stays open because
 * somebody adjusting a value usually wants to see it take effect and then adjust it again.
 *
 * **The number box commits, it does not stream.** Typing "1" on the way to "150" would
 * otherwise apply a render distance of one block, redraw, and save that to storage. So the
 * text is held locally while it is being typed and applied on `change` - blur or Enter -
 * which is one write per edit. The value is parsed and rounded through the same helpers the
 * options editor's own numeric fields use, so a value the palette accepts is a value that
 * surface would have accepted; anything that is not a number at all is discarded and the box
 * snaps back to the setting's real value rather than silently writing NaN.
 *
 * **A live value that changes underneath is followed, except while it is being edited.**
 * A theme changed from the viewer's own settings page must show here immediately. A number
 * box the user is halfway through typing into must not be rewritten under the cursor, which
 * is why the watch below refuses to touch a focused field.
 */
const props = defineProps<{ item: PaletteItem }>();

const emit = defineEmits<{
    /** A command was run or a destination chosen. The palette closes on this. */
    activate: [item: PaletteItem];
    /** A setting was written. The palette stays open and announces it. */
    changed: [item: PaletteItem];
}>();

const { t } = useI18n();

const descriptionId = useId();

const icon = computed(() => {
    switch (props.item.kind) {
        case "command":
            return mdiFlashOutline;
        case "setting":
            return mdiTuneVariant;
        case "destination":
            return mdiArrowRightCircleOutline;
    }
});

/**
 * What kind of row this is, in a word, for the badge and for a screen reader.
 *
 * It is part of the accessible name rather than decoration: "Theme, setting" and "Theme,
 * opens" are different promises, and somebody listening rather than looking has no other
 * way to tell which of the two they have landed on.
 */
const kindLabel = computed(() => {
    switch (props.item.kind) {
        case "command":
            return t("palette.kind.command", "Command");
        case "setting":
            return t("palette.kind.setting", "Setting");
        case "destination":
            return t("palette.kind.destination", "Opens");
    }
});

function activate(): void {
    const item = props.item;
    if (item.kind === "command") item.run();
    else if (item.kind === "destination") item.go();
    else return;
    emit("activate", item);
}

/* -------------------------------------------------------------------------- */
/* The live controls                                                          */
/* -------------------------------------------------------------------------- */

const control = computed(() => (props.item.kind === "setting" ? props.item.control : null));

function announce(): void {
    emit("changed", props.item);
}

function setToggle(value: boolean | null): void {
    const live = control.value;
    if (live === null || live.kind !== "toggle") return;
    live.set(value === true);
    announce();
}

function setChoice(value: unknown): void {
    const live = control.value;
    if (live === null || live.kind !== "choice" || typeof value !== "string") return;
    live.set(value);
    announce();
}

/** The number box's own text, so a half-typed value is never written to the setting. */
const draft = ref("");
const editing = ref(false);

watch(
    control,
    (live) => {
        if (live === null || live.kind !== "number") return;
        if (editing.value) return;
        draft.value = String(live.value);
    },
    { immediate: true },
);

function commitNumber(): void {
    const live = control.value;
    if (live === null || live.kind !== "number") return;

    const parsed = parseNumberInput(draft.value, false);
    if (parsed === "invalid" || parsed === null) {
        // Not a number, or emptied. The setting keeps the value it had and the box says so
        // again, because leaving the box blank would read as "this setting has no value".
        draft.value = String(live.value);
        return;
    }

    const clamped = Math.min(live.max, Math.max(live.min, parsed));
    const rounded = roundToStep(clamped, live.step);
    draft.value = String(rounded);
    if (rounded === live.value) return;

    live.set(rounded);
    announce();
}

function endEditing(): void {
    editing.value = false;
    commitNumber();
}
</script>

<template>
    <li class="mb-palette-row" data-palette-row>
        <!--
            A command and a destination are one button covering the whole row: there is
            nothing inside either of them that is separately operable, so a nested control
            would be a second tab stop leading to the same action.
        -->
        <button
            v-if="props.item.kind !== 'setting'"
            type="button"
            class="mb-palette-row__go"
            :aria-describedby="descriptionId"
            @click="activate"
        >
            <v-icon class="mb-palette-row__icon" :icon="icon" size="20" aria-hidden="true" />

            <span class="mb-palette-row__text">
                <span class="mb-palette-row__title">{{ props.item.title }}</span>
                <span :id="descriptionId" class="mb-palette-row__detail">
                    {{ props.item.description }}
                    <template v-if="props.item.kind === 'destination'">
                        {{ " " }}{{ props.item.where }}
                    </template>
                </span>
            </span>

            <span class="mb-palette-row__kind">{{ kindLabel }}</span>
        </button>

        <div v-else class="mb-palette-row__setting">
            <v-icon class="mb-palette-row__icon" :icon="icon" size="20" aria-hidden="true" />

            <span class="mb-palette-row__text">
                <span class="mb-palette-row__title">{{ props.item.title }}</span>
                <span :id="descriptionId" class="mb-palette-row__detail">
                    {{ props.item.description }}
                </span>
            </span>

            <!--
                The control itself, wired straight to the setting. `hide-details` keeps a
                row one line tall; the accessible name comes from the row's own title rather
                than a second visible label beside it, which would read the title twice.
            -->
            <div class="mb-palette-row__control">
                <v-switch
                    v-if="props.item.control.kind === 'toggle'"
                    class="mb-palette-row__switch"
                    :model-value="props.item.control.value"
                    :aria-label="props.item.title"
                    :aria-describedby="descriptionId"
                    color="primary"
                    density="compact"
                    hide-details
                    inset
                    @update:model-value="setToggle"
                />

                <v-select
                    v-else-if="props.item.control.kind === 'choice'"
                    class="mb-palette-row__select"
                    :model-value="props.item.control.value"
                    :items="[...props.item.control.options]"
                    item-title="label"
                    item-value="id"
                    :aria-label="props.item.title"
                    :aria-describedby="descriptionId"
                    variant="outlined"
                    density="compact"
                    hide-details
                    @update:model-value="setChoice"
                />

                <v-text-field
                    v-else
                    v-model="draft"
                    class="mb-palette-row__number"
                    type="number"
                    :min="props.item.control.min"
                    :max="props.item.control.max"
                    :step="props.item.control.step"
                    :suffix="props.item.control.unit"
                    :aria-label="props.item.title"
                    :aria-describedby="descriptionId"
                    variant="outlined"
                    density="compact"
                    hide-details
                    @focus="editing = true"
                    @blur="endEditing"
                    @change="commitNumber"
                    @keydown.enter="commitNumber"
                />
            </div>
        </div>
    </li>
</template>

<style>
.mb-palette-row {
    list-style: none;
}

.mb-palette-row__go,
.mb-palette-row__setting {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 12px;
    border-radius: 12px;
    text-align: start;
    color: rgb(var(--v-theme-on-surface));
}

.mb-palette-row__go {
    background: transparent;
    border: none;
    cursor: pointer;
}

.mb-palette-row__go:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
}

/* Vuetify marks focus with a low-opacity overlay, which is a tint rather than an indicator.
   The rows carry a real ring, on the button and on whatever control a setting row holds. */
.mb-palette-row__go:focus-visible,
.mb-palette-row .v-btn:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-palette-row .v-field:focus-within {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
}

.mb-palette-row__icon {
    flex: none;
    color: rgb(var(--v-theme-primary));
}

.mb-palette-row__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
}

.mb-palette-row__title {
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.3;
    overflow-wrap: anywhere;
}

.mb-palette-row__detail {
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
    overflow-wrap: anywhere;
}

.mb-palette-row__kind {
    flex: none;
    align-self: flex-start;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    font-size: 0.6875rem;
    letter-spacing: 0.02em;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    white-space: nowrap;
}

.mb-palette-row__control {
    flex: none;
    display: flex;
    align-items: center;
}

.mb-palette-row__select {
    min-width: 190px;
}

.mb-palette-row__number {
    min-width: 140px;
}

/* At a narrow window, and at 200% scale where the viewport is effectively half as wide, the
   control drops below the text instead of squeezing the title into one word per line. */
@media (max-width: 560px) {
    .mb-palette-row__setting {
        flex-wrap: wrap;
    }

    .mb-palette-row__control {
        flex: 1 1 100%;
        padding-inline-start: 32px;
    }

    .mb-palette-row__select,
    .mb-palette-row__number {
        min-width: 0;
        width: 100%;
    }
}
</style>

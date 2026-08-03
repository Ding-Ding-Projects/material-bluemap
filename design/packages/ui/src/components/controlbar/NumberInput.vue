<script setup lang="ts">
import { computed, ref } from "vue";
import { VTextField } from "vuetify/components";

/**
 * MD3 replacement for upstream `ControlBar/NumberInput.vue`: one axis of the live coordinate
 * readout, editable.
 *
 * Upstream's version was `<input type="number" :value="Math.floor(value)" @input="write">`,
 * which has three problems this fixes:
 *
 *  - It wrote on every keystroke. Typing `-` or clearing the field ran `parseFloat("")`, wrote
 *    `NaN` into the camera position and broke the view until a reload.
 *  - It committed digit by digit, so typing `120` first teleported to `1`, then `12`. Each of
 *    those moves the camera, which re-renders the field underneath the caret.
 *  - The bound value keeps ticking while the camera moves, so a live update could overwrite
 *    half-typed input.
 *
 * Here the field holds a local draft for as long as it has focus, ignores live camera values
 * while editing, commits on Enter and on blur, reverts an unparseable entry instead of writing
 * `NaN`, and supports Escape to abandon the edit. Up/Down arrows step the value (Shift for x10),
 * which replaces the native number spinners upstream had to hide.
 *
 * `keydown` and `keyup` are stopped: the WASD / arrow-key camera controls listen on `window`,
 * so without this every keystroke in a coordinate field would also drive the camera.
 *
 * `aria-labelledby` is cleared on purpose. Vuetify points the input at its own `-label`
 * element, which is never rendered here because the field carries no visible label, and a
 * dangling reference in front of `aria-label` is a name nobody should have to reason about.
 */
const props = withDefaults(
    defineProps<{
        /** Axis marker rendered in front of the field ("x", "y", "z"). */
        axis: string;
        /** Accessible name of the field, e.g. "Position X". */
        name: string;
        /** Live value from the camera. */
        value: number;
        /** Amount an arrow key adds or subtracts (x10 with Shift). */
        step?: number;
    }>(),
    { step: 1 },
);

const emit = defineEmits<{ commit: [value: number] }>();

/** Optional sign, then digits with an optional fractional part, or a bare fraction. */
const NUMBER_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

const editing = ref(false);
const draft = ref("");
const invalid = ref(false);
/** Set by Escape so the blur it triggers abandons the edit instead of committing it. */
const abandoning = ref(false);

const liveText = computed(() => String(Math.floor(props.value)));
const shown = computed(() => (editing.value ? draft.value : liveText.value));

function parse(text: string): number | null {
    const trimmed = text.trim();
    if (!NUMBER_PATTERN.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function revert(): void {
    draft.value = liveText.value;
    invalid.value = false;
}

/** Writes the draft through if it parses. Returns the committed number, or null. */
function commit(): number | null {
    const parsed = parse(draft.value);
    if (parsed === null) {
        invalid.value = true;
        return null;
    }
    invalid.value = false;
    emit("commit", parsed);
    return parsed;
}

function onFocus(): void {
    abandoning.value = false;
    draft.value = liveText.value;
    invalid.value = false;
    editing.value = true;
}

function onUpdate(text: string): void {
    editing.value = true;
    draft.value = text;
    // An empty or half-typed entry ("-", "12.") is not an error yet, it is unfinished.
    invalid.value = text.trim() !== "" && parse(text) === null;
}

function onBlur(): void {
    if (abandoning.value) {
        abandoning.value = false;
    } else if (commit() === null) {
        revert();
    }
    editing.value = false;
}

function stepBy(amount: number): void {
    const base = parse(draft.value) ?? props.value;
    const next = Math.floor(base) + amount;
    draft.value = String(next);
    invalid.value = false;
    emit("commit", next);
}

function onKeydown(event: KeyboardEvent): void {
    // The camera's keyboard controls are bound to `window`; stop here or typing a coordinate
    // also flies the camera.
    event.stopPropagation();

    if (event.key === "Enter") {
        event.preventDefault();
        const committed = commit();
        if (committed !== null) draft.value = String(committed);
        return;
    }

    if (event.key === "Escape") {
        event.preventDefault();
        abandoning.value = true;
        revert();
        (event.target as HTMLElement | null)?.blur();
        return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const magnitude = props.step * (event.shiftKey ? 10 : 1);
        stepBy(event.key === "ArrowUp" ? magnitude : -magnitude);
    }
}

function onKeyup(event: KeyboardEvent): void {
    event.stopPropagation();
}
</script>

<template>
    <v-text-field
        class="mb-cb-number"
        :model-value="shown"
        :prefix="props.axis"
        :error="invalid"
        :aria-label="props.name"
        :aria-invalid="String(invalid)"
        :aria-labelledby="null"
        variant="outlined"
        density="compact"
        hide-details
        type="text"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="done"
        @update:model-value="onUpdate"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
        @keyup="onKeyup"
    />
</template>

<style>
.mb-cb-number {
    min-width: 4.5rem;
    flex: 1 1 0;
}

.mb-cb-number .v-field__input {
    /* Compact density leaves the value hugging the prefix; give the digits room to breathe. */
    padding-inline-start: 2px;
    min-width: 0;
}

.mb-cb-number .v-field__prefix {
    padding-inline-end: 2px;
    opacity: 0.72;
    text-transform: uppercase;
}
</style>

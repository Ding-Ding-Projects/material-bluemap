<script setup lang="ts">
import { VBtn, VIcon, VTooltip } from "vuetify/components";

/**
 * MD3 replacement for upstream `ControlBar/SvgButton.vue`.
 *
 * Upstream's version was a bare `<div>` with a click handler, and every tooltip in the control
 * bar was a native `title` attribute arriving as a fallthrough attr on that div: no role, no
 * tabindex, no accessible name, no keyboard path. This is a real `<button>` with an accessible
 * name, a visible focus ring, an MD3 state layer, and a `v-tooltip` carrying the same text
 * (Vuetify points `aria-describedby` at it while it is open).
 *
 * The `icon` slot exists for the two icons that are not a static path: the morphing menu
 * button and the compass needle, which rotates with the camera.
 */
const props = withDefaults(
    defineProps<{
        /** Accessible name and tooltip text. Never empty: this is an icon-only button. */
        label: string;
        /** SVG path data, normally an `@mdi/js` constant. Ignored when the `icon` slot is used. */
        icon?: string;
        /** Longer tooltip text when the tooltip should say more than the accessible name. */
        tooltip?: string;
        /** MD3 selected state (used by the view-mode switch). */
        active?: boolean;
        /**
         * Marks this as a toggle button, which is what makes `aria-pressed` appear.
         * It is a separate flag rather than "`pressed` was passed" because Vue casts an
         * absent boolean prop to `false`, so a plain action button would otherwise announce
         * itself to assistive technology as an unpressed toggle.
         */
        toggle?: boolean;
        /** Toggle state, read only when `toggle` is set. */
        pressed?: boolean;
        disabled?: boolean;
    }>(),
    { icon: "", tooltip: "", active: false, toggle: false, pressed: false, disabled: false },
);

const emit = defineEmits<{ action: [event: MouseEvent] }>();
</script>

<template>
    <v-btn
        class="mb-cb-btn"
        icon
        variant="text"
        :color="props.active ? 'primary' : 'on-surface-variant'"
        :active="props.active"
        :disabled="props.disabled"
        :aria-label="props.label"
        :aria-pressed="props.toggle ? String(props.pressed) : undefined"
        @click="emit('action', $event)"
    >
        <slot name="icon">
            <v-icon :icon="props.icon" aria-hidden="true" />
        </slot>
        <v-tooltip
            activator="parent"
            location="bottom"
            :open-delay="400"
            :text="props.tooltip || props.label"
        />
    </v-btn>
</template>

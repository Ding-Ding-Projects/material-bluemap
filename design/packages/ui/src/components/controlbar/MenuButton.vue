<script setup lang="ts">
import { computed } from "vue";
import IconButton from "./IconButton.vue";

/**
 * MD3 replacement for upstream `ControlBar/MenuButton.vue`.
 *
 * The behaviour that matters is the morph, not the drawing: three bars fold into an X while a
 * menu is open, and into a back chevron while a sub-page is open. Upstream drove it with CSS
 * transforms on three SVG paths and so does this, because a cross-fade between three separate
 * icons loses the continuity that makes one button read as one button when the side menu draws
 * its own copy over this one.
 *
 * `back` only applies while `close` is also set, exactly as upstream's `.close.back` selector
 * did: a back arrow with no menu open would point at nothing.
 */
const props = withDefaults(
    defineProps<{
        /** Accessible name and tooltip text. */
        label: string;
        /** A menu is open: the bars fold into an X. */
        close?: boolean;
        /** A sub-page is open: the bars fold into a back chevron (needs `close`). */
        back?: boolean;
        /** Drives `aria-expanded`; pass the menu's open state. */
        expanded?: boolean;
    }>(),
    { close: false, back: false, expanded: false },
);

const emit = defineEmits<{ action: [event: MouseEvent] }>();

const shape = computed(() => {
    if (props.close && props.back) return "back";
    if (props.close) return "close";
    return "menu";
});
</script>

<template>
    <IconButton
        class="mb-cb-menu"
        :label="props.label"
        :aria-expanded="String(props.expanded)"
        @action="emit('action', $event)"
    >
        <template #icon>
            <svg
                class="mb-cb-menu__icon"
                :class="`mb-cb-menu__icon--${shape}`"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
            >
                <rect class="mb-cb-menu__bar mb-cb-menu__bar--1" x="4" y="5" width="16" height="2" rx="1" />
                <rect class="mb-cb-menu__bar mb-cb-menu__bar--2" x="4" y="11" width="16" height="2" rx="1" />
                <rect class="mb-cb-menu__bar mb-cb-menu__bar--3" x="4" y="17" width="16" height="2" rx="1" />
            </svg>
        </template>
    </IconButton>
</template>

<style>
.mb-cb-menu__icon {
    width: 24px;
    height: 24px;
    fill: currentColor;
}

.mb-cb-menu__bar {
    transition:
        transform 0.3s ease,
        opacity 0.3s ease;
}

.mb-cb-menu__bar--1 {
    transform-origin: 12px 6px;
}

.mb-cb-menu__bar--2 {
    transform-origin: 12px 12px;
}

.mb-cb-menu__bar--3 {
    transform-origin: 12px 18px;
}

/* X: the outer bars meet in the middle, the centre bar collapses out of the way. */
.mb-cb-menu__icon--close .mb-cb-menu__bar--1 {
    transform: translate(0, 6px) rotate(45deg);
}

.mb-cb-menu__icon--close .mb-cb-menu__bar--3 {
    transform: translate(0, -6px) rotate(-45deg);
}

/* Back chevron: the outer bars shorten to 10px arms meeting at x=8, y=12. */
.mb-cb-menu__icon--back .mb-cb-menu__bar--1 {
    transform: translate(0, 3px) rotate(-37deg) scaleX(0.625);
}

.mb-cb-menu__icon--back .mb-cb-menu__bar--3 {
    transform: translate(0, -3px) rotate(37deg) scaleX(0.625);
}

.mb-cb-menu__icon--close .mb-cb-menu__bar--2,
.mb-cb-menu__icon--back .mb-cb-menu__bar--2 {
    opacity: 0;
    transform: scaleX(0.1);
}

@media (prefers-reduced-motion: reduce) {
    .mb-cb-menu__bar {
        transition: none;
    }
}
</style>

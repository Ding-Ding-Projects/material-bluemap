<script setup lang="ts">
import { ref, useId } from "vue";
import type { SettingsSectionAnchor } from "./settingsSections.js";

/**
 * One setting on the settings surface, and the thing a failed render actually lands on.
 *
 * `reveal()` is the whole reason this is a component rather than a `<div>`. A render that
 * stops for a fixable reason names the setting that would fix it, and the shell opens
 * this surface at that anchor; landing somebody on the right page and leaving them to
 * find the row is a hint, not a remedy. So revealing does three things together: it
 * scrolls the section into view, it moves focus onto it so the next keystroke acts on
 * the right control and a screen reader announces where it arrived, and it outlines it
 * briefly so an eye that was reading an error message knows where to look.
 *
 * The outline is drawn either way; only its fade is animated, and only when the person
 * has not asked for reduced motion. An attention cue that a reduced-motion setting
 * removes entirely leaves that person with no cue at all, which is the opposite of what
 * the setting is for. The scroll drops to an instant jump for the same reason: it still
 * arrives, it just does not slide.
 */
const props = defineProps<{
    /**
     * Any section the surface renders, not only the four a render can point at: the
     * GitHub sign-in is listed and searched here and nothing in the bridge can link to it.
     */
    anchor: SettingsSectionAnchor;
    title: string;
    description: string;
}>();

const titleId = useId();
const root = ref<HTMLElement | null>(null);
const flash = ref(false);

/** Cleared before each new flash so two reveals in a row do not cancel each other early. */
let flashTimer: ReturnType<typeof setTimeout> | null = null;

function prefersReducedMotion(): boolean {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * `focus: false` when the section delegates focus to a control inside it — the consent
 * row focuses itself, and two elements fighting over focus is how the ring ends up on
 * whichever won the race rather than on the thing that was asked for.
 */
function reveal(options: { focus?: boolean } = {}): void {
    const element = root.value;
    if (element === null) return;

    // jsdom has no layout and therefore no `scrollIntoView`, and neither does an
    // element that has not been attached yet. Optional call rather than a guard clause:
    // failing to scroll must not cost the focus and the outline underneath it.
    element.scrollIntoView?.({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
    });

    if (options.focus !== false) element.focus();

    if (flashTimer !== null) clearTimeout(flashTimer);
    flash.value = true;
    flashTimer = setTimeout(() => {
        flash.value = false;
        flashTimer = null;
    }, 2200);
}

defineExpose({ reveal, element: root });
</script>

<template>
    <section
        :id="`mb-setting-${props.anchor}`"
        ref="root"
        class="mb-setting"
        :class="{ 'mb-setting--flash': flash }"
        tabindex="-1"
        :aria-labelledby="titleId"
        :data-anchor="props.anchor"
    >
        <header class="mb-setting__header">
            <h3 :id="titleId" class="mb-setting__title">{{ props.title }}</h3>
            <slot name="status" />
        </header>

        <p class="mb-setting__description">{{ props.description }}</p>

        <slot />
    </section>
</template>

<style>
.mb-setting {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: 12px;
    /* An MD3 surface tint rather than a hard-coded grey, so it follows the theme and the
       accent the appearance settings are set to. */
    background: rgba(var(--v-theme-on-surface), 0.04);
    /* Reserved so the flash outline does not reflow the column when it appears. */
    outline: 2px solid transparent;
    outline-offset: 2px;
    scroll-margin-block: 12px;
}

.mb-setting:focus-visible,
.mb-setting--flash {
    outline-color: rgb(var(--v-theme-primary));
}

/* The outline itself is never animated away — it is the cue. Only its fade is. */
@media (prefers-reduced-motion: no-preference) {
    .mb-setting {
        transition: outline-color 240ms ease;
    }
}

.mb-setting__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

.mb-setting__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.4;
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

.mb-setting__description {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

/* Vuetify marks focus with a low-opacity overlay, which is a background tint rather than
   a focus indicator. These add a real ring on top of it, on every control a section holds. */
.mb-setting .v-btn:focus-visible,
.mb-setting a:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-setting .v-field:focus-within {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
}
</style>

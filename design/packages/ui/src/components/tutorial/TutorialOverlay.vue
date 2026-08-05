<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose } from "@mdi/js";
import { VBtn, VIcon } from "vuetify/components";
import { prefersReducedMotion } from "../controlbar/useControlBarApp.js";
import { createTutorialController } from "./tutorialController.js";
import { onTutorialLaunchRequested } from "./tutorialLaunch.js";
import { onTutorialSignal } from "./tutorialSignals.js";
import { placeTutorialCard, placeTutorialHighlight, type TutorialPoint, type TutorialRect } from "./tutorialPlacement.js";
import { tutorialProgressText, tutorialStepBody, tutorialStepTitle } from "./tutorialCopy.js";

/**
 * The guided tour itself: a highlighted control and a small card of text beside it, neither
 * of which ever blocks the application underneath.
 *
 * Mounted once at the shell, exactly like `CommandPalette.vue` and `ConfigNotifications.vue`
 * - see `tutorialLaunch.ts` for why three unrelated surfaces (Info, Docs, the command
 * palette) can all open this without any of them being its parent. Every step names a real
 * shell page and a real CSS selector (`tutorialSteps.ts`); this component's whole job is to
 * ask the shell to show that page, find that element, and put a highlight ring and a card of
 * words next to it, moving both as the window scrolls or resizes.
 *
 * ## Why there is no backdrop
 *
 * A coach mark that dims the rest of the screen reads as a dialog, and a dialog is exactly
 * what this must not become: the requirement is that it "must never trap the user or block
 * the control it points at," and the surest way to keep that promise is to never paint
 * anything that would. The highlight ring is `pointer-events: none`; nothing here intercepts
 * a click anywhere outside the card. Choosing a world while step three is open still chooses
 * it, and (see `tutorialSteps.ts`) that is exactly the signal that step is listening for.
 *
 * ## Focus, not a trap
 *
 * `role="dialog"` with `aria-modal="false"`: a screen reader announces it as a dialog, but
 * Tab is never intercepted, so focus can leave the card into the running application at any
 * time. What *is* managed deliberately: focus moves to the card itself the moment a step
 * becomes active (announcing its title and, via `aria-describedby`, the progress line and
 * body together), and moves back to whatever had focus when the tour was opened once it
 * closes - by completion, by Exit, or by Escape.
 */
const props = defineProps<{
    /** Switches the shell to a page, exactly as clicking its tab would. */
    revealPage: (pageId: string) => void;
}>();

const { t } = useI18n();

const controller = createTutorialController();

const titleId = useId();
const progressId = useId();
const bodyId = useId();

const cardEl = ref<HTMLElement | null>(null);
const highlightRect = ref<TutorialRect | null>(null);
const cardPoint = ref<TutorialPoint>({ top: 24, left: 24 });

const stepTitle = computed(() => tutorialStepTitle(controller.currentStep.value.id, t));
const stepBody = computed(() => tutorialStepBody(controller.currentStep.value.id, t));
const progressText = computed(() =>
    tutorialProgressText(controller.stepNumber.value, controller.stepCount, t),
);
const announceText = computed(() => `${progressText.value} ${stepTitle.value}`);

const nextLabel = computed(() =>
    controller.isLastStep.value
        ? t("tutorial.controls.finish", "Finish")
        : t("tutorial.controls.next", "Next"),
);

/* -------------------------------------------------------------------------- */
/* Placement                                                                   */
/* -------------------------------------------------------------------------- */

const HIGHLIGHT_FALLBACK_MARGIN = 24;

function rectOf(el: HTMLElement): TutorialRect {
    const box = el.getBoundingClientRect();
    return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/**
 * Finds the current step's anchor, scrolls it into view, and places the ring and the card.
 *
 * Never throws on a missing anchor. `tutorialAnchors.test.ts` is what proves every shipped
 * step's selector resolves against the real owning surface; this is the runtime fallback for
 * the case that guard exists to make unreachable, and it degrades to an unhighlighted card
 * in the viewport's own corner rather than to nothing on screen at all.
 */
async function recompute(): Promise<void> {
    await nextTick();
    const step = controller.currentStep.value;
    const anchor = document.querySelector<HTMLElement>(step.anchor);

    if (anchor === null) {
        highlightRect.value = null;
    } else {
        anchor.scrollIntoView?.({
            block: "center",
            behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
        await nextTick();
        highlightRect.value = rectOf(anchor);
    }

    const viewport = {
        width: typeof window === "undefined" ? 0 : window.innerWidth,
        height: typeof window === "undefined" ? 0 : window.innerHeight,
    };
    const cardBox = cardEl.value?.getBoundingClientRect();
    const cardSize = {
        width: cardBox !== undefined && cardBox.width > 0 ? cardBox.width : 320,
        height: cardBox !== undefined && cardBox.height > 0 ? cardBox.height : 180,
    };

    cardPoint.value =
        highlightRect.value === null
            ? {
                  top: Math.max(viewport.height - cardSize.height - HIGHLIGHT_FALLBACK_MARGIN, 8),
                  left: Math.max(viewport.width - cardSize.width - HIGHLIGHT_FALLBACK_MARGIN, 8),
              }
            : placeTutorialCard(highlightRect.value, cardSize, viewport);
}

const highlightStyle = computed(() => {
    if (highlightRect.value === null) return { display: "none" };
    const box = placeTutorialHighlight(highlightRect.value);
    return {
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
    };
});

const cardStyle = computed(() => ({
    top: `${cardPoint.value.top}px`,
    left: `${cardPoint.value.left}px`,
}));

/* -------------------------------------------------------------------------- */
/* Focus                                                                       */
/* -------------------------------------------------------------------------- */

let launchedFrom: HTMLElement | null = null;

function restoreFocus(): void {
    if (launchedFrom !== null && document.contains(launchedFrom)) {
        launchedFrom.focus();
    }
    launchedFrom = null;
}

async function afterStepBecameActive(): Promise<void> {
    props.revealPage(controller.currentStep.value.pageId);
    await recompute();
    await nextTick();
    cardEl.value?.focus();
}

watch(
    () => controller.open.value,
    (isOpen) => {
        if (isOpen) {
            launchedFrom =
                typeof document !== "undefined" && document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
            void afterStepBecameActive();
        } else {
            restoreFocus();
        }
    },
);

watch(
    () => controller.stepIndex.value,
    () => {
        if (controller.open.value) void afterStepBecameActive();
    },
);

/* -------------------------------------------------------------------------- */
/* Opening on request, and advancing on a real action                         */
/* -------------------------------------------------------------------------- */

onTutorialLaunchRequested(() => {
    controller.start();
});

onTutorialSignal("world-chosen", () => {
    if (controller.open.value && controller.currentStep.value.signal === "world-chosen") {
        controller.next();
    }
});

function onViewportChange(): void {
    if (controller.open.value) void recompute();
}

onMounted(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("resize", onViewportChange, { passive: true });
    window.addEventListener("scroll", onViewportChange, { passive: true, capture: true });
});

onBeforeUnmount(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, true);
});

function onExit(): void {
    controller.exit();
}
</script>

<template>
    <Teleport to="body">
        <div v-if="controller.open.value" class="mb-tutorial">
            <div class="mb-tutorial__highlight" :style="highlightStyle" aria-hidden="true" />

            <div
                ref="cardEl"
                class="mb-tutorial__card"
                :style="cardStyle"
                role="dialog"
                aria-modal="false"
                tabindex="-1"
                :aria-labelledby="titleId"
                :aria-describedby="`${progressId} ${bodyId}`"
                :aria-label="t('tutorial.region.label', 'Interactive tour')"
                @keydown.esc="onExit"
            >
                <div class="mb-tutorial__head">
                    <p :id="progressId" class="mb-tutorial__progress" aria-live="polite">
                        {{ announceText }}
                    </p>
                    <button
                        type="button"
                        class="mb-tutorial__exit"
                        :aria-label="t('tutorial.controls.exit', 'Exit the tour')"
                        @click="onExit"
                    >
                        <VIcon :icon="mdiClose" size="18" />
                    </button>
                </div>

                <h2 :id="titleId" class="mb-tutorial__title">{{ stepTitle }}</h2>
                <p :id="bodyId" class="mb-tutorial__body">{{ stepBody }}</p>

                <div class="mb-tutorial__actions">
                    <VBtn
                        variant="text"
                        size="small"
                        :disabled="!controller.canGoBack.value"
                        @click="controller.back()"
                    >
                        {{ t("tutorial.controls.back", "Back") }}
                    </VBtn>
                    <VBtn variant="text" size="small" @click="controller.skip()">
                        {{ t("tutorial.controls.skip", "Skip this step") }}
                    </VBtn>
                    <VBtn variant="flat" color="primary" size="small" @click="controller.next()">
                        {{ nextLabel }}
                    </VBtn>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style>
.mb-tutorial {
    position: fixed;
    inset: 0;
    z-index: 2500;
    pointer-events: none;
}

.mb-tutorial__highlight {
    position: fixed;
    border-radius: 10px;
    box-shadow:
        0 0 0 3px rgb(var(--v-theme-primary)),
        0 0 0 9999px rgba(var(--v-theme-on-surface), 0.35);
    transition:
        top 0.15s ease,
        left 0.15s ease,
        width 0.15s ease,
        height 0.15s ease;
    pointer-events: none;
}

.mb-tutorial__card {
    position: fixed;
    max-width: 22rem;
    padding: 14px 16px 12px;
    border-radius: 16px;
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    pointer-events: auto;
    transition:
        top 0.15s ease,
        left 0.15s ease;
}

.mb-tutorial__card:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-tutorial__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
}

.mb-tutorial__progress {
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-tutorial__exit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    cursor: pointer;
}

.mb-tutorial__exit:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.mb-tutorial__exit:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-tutorial__title {
    margin-block: 6px 4px;
    font-size: 1.0625rem;
    font-weight: 500;
    line-height: 1.3;
}

.mb-tutorial__body {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    text-wrap: pretty;
}

.mb-tutorial__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin-block-start: 12px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-tutorial__highlight,
    .mb-tutorial__card {
        transition: none;
    }
}
</style>

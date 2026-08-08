<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiOpenInNew } from "@mdi/js";
import { VAlert, VBtn } from "vuetify/components";
import NotificationCentre from "../notifications/NotificationCentre.vue";
import { dismiss, dismissAll, type Notice, type NoticeState } from "./notifications.js";

/**
 * The notification corner.
 *
 * Toasts stack in the bottom-right, never cover the control that raised them,
 * and never block. Informational and success notices dismiss themselves;
 * warnings and errors stay until dismissed, so a failure cannot scroll past
 * unread. Everything that was raised stays reachable in the history, because a
 * message that vanished and cannot be found again is a message that may as well
 * not have been shown.
 *
 * The history itself is no longer a list in a menu here. The bell opens
 * `components/notifications/NotificationCentre.vue`, which searches, filters by
 * level and can put a notice back on screen; a flat column of message strings
 * was a control that looked like a notification centre in a screenshot and was
 * not one by the tenth entry.
 */
const props = defineProps<{ state: NoticeState }>();

const { t } = useI18n();

const timers = new Map<number, ReturnType<typeof setTimeout>>();

function arm(notice: Notice): void {
    if (notice.timeout === null || timers.has(notice.id)) return;
    timers.set(
        notice.id,
        setTimeout(() => {
            timers.delete(notice.id);
            dismiss(props.state, notice.id);
        }, notice.timeout),
    );
}

watch(
    () => props.state.live.map((notice) => notice.id).join(","),
    () => {
        for (const notice of props.state.live) arm(notice);
    },
    { immediate: true },
);

onBeforeUnmount(() => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
});

function close(id: number): void {
    const timer = timers.get(id);
    if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(id);
    }
    dismiss(props.state, id);
}
</script>

<template>
    <div class="mb-config-notices" role="region" :aria-label="t('config.notices.region', 'Notifications')">
        <!--
            The stack is the same element it always was - `TransitionGroup` renders the
            `tag` it is given, so the class, the live region and the scroll behaviour are
            unchanged - and the toasts inside it now arrive, leave and reflow through
            `styles/motion.scss`'s `mb-notice` class family rather than blinking in and out.

            A group rather than a plain `Transition` because the stack is a list: several
            toasts can be arriving and leaving at once, and each has to be tracked by its own
            key. `styles/motion.scss` explains why the leaving toast stays in flow rather
            than sliding the others into its gap, and why it goes `pointer-events: none` on
            the way out - for those 150ms it is a control panel for a notice the user has
            already sent away.
        -->
        <TransitionGroup
            tag="div"
            name="mb-notice"
            class="mb-config-notices__stack"
            aria-live="polite"
        >
            <v-alert
                v-for="notice in state.live"
                :key="notice.id"
                :type="notice.level"
                variant="tonal"
                density="compact"
                class="mb-config-notices__toast"
                :role="notice.level === 'error' || notice.level === 'warning' ? 'alert' : 'status'"
            >
                <div class="mb-config-notices__body">
                    <div>
                        <p v-if="notice.title" class="mb-config-notices__title">{{ notice.title }}</p>
                        <p>{{ notice.message }}</p>
                        <details v-if="notice.detail">
                            <summary>{{ t("config.notices.detail", "Details") }}</summary>
                            <pre class="mb-config-notices__detail">{{ notice.detail }}</pre>
                        </details>

                        <!--
                            Retry, undo, open. The toast offers what the caller attached and
                            nothing else; the same actions stay attached to the notice in the
                            history, so dismissing one does not throw the offer away.
                        -->
                        <div v-if="notice.actions?.length" class="mb-config-notices__actions">
                            <v-btn
                                v-for="action in notice.actions"
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
                        </div>
                    </div>
                    <!--
                        Dismissal is the one control every toast has, and it was a 24px
                        target. It is now a 40px square: the button somebody aims at to
                        silence a warning must not itself be a test of aim.
                    -->
                    <v-btn
                        :icon="mdiClose"
                        :aria-label="t('config.notices.dismiss', 'Dismiss this notification')"
                        class="mb-config-notices__dismiss"
                        variant="text"
                        size="small"
                        density="comfortable"
                        @click="close(notice.id)"
                    />
                </div>
            </v-alert>
        </TransitionGroup>

        <div class="mb-config-notices__tools">
            <v-btn
                v-if="state.live.length > 1"
                class="mb-config-notices__dismiss-all"
                variant="text"
                size="small"
                density="comfortable"
                @click="dismissAll(state)"
            >
                {{ t("config.notices.dismissAll", "Dismiss all") }}
            </v-btn>

            <!--
                The bell, and behind it the notification centre. It lives in the corner
                rather than in a settings tab because the corner is where somebody is
                looking at the moment they realise the message they wanted has gone.
            -->
            <NotificationCentre :state="state" />
        </div>
    </div>
</template>

<style>
.mb-config-notices {
    position: fixed;
    inset-block-end: 16px;
    inset-inline-end: 16px;
    z-index: 2400;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: none;
    max-width: min(420px, calc(100vw - 32px));
}

.mb-config-notices__stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-height: 60vh;
    overflow-y: auto;
    pointer-events: auto;
}

/*
 * Two class names deep on purpose, and it will look like a mistake to whoever tidies it.
 *
 * Vuetify's tonal variant ships `.v-alert--variant-tonal { background: transparent }` at
 * one class of specificity. A rule of ours at the same specificity loses on source order,
 * silently - which is exactly how the first attempt at this fix passed review, passed its
 * own test, and changed nothing on screen. The extra ancestor is what makes the surface
 * actually win, and the shorthand it has to beat is `background`, so this sets `background`
 * too rather than only `background-color`.
 */
.mb-config-notices .mb-config-notices__toast {
    border-radius: 12px;

    /*
     * An overlay paints its own surface.
     *
     * `variant="tonal"` is a tinted film, not a background: Vuetify draws the level's
     * colour at low opacity and lets whatever sits behind it show through. Over an empty
     * page nobody notices. Over a paragraph - which is exactly where a toast lands, since
     * it is anchored over the content - the page's text reads straight through the
     * notification's text and both become unreadable. A screenshot of the options editor
     * caught it doing precisely that, two sentences printed on top of each other.
     *
     * So the tint keeps its job of saying info from warning from error, and gets an opaque
     * surface underneath to be a tint *of*. The shadow and the hairline are what make it
     * read as a thing lying on top of the page rather than a coloured patch of it.
     */
    background: rgb(var(--v-theme-surface));
    background-color: rgb(var(--v-theme-surface));
    box-shadow:
        0 6px 16px rgb(0 0 0 / 28%),
        0 1px 3px rgb(0 0 0 / 22%);
    border: 1px solid rgb(var(--v-border-color) / 0.22);
}

.mb-config-notices__body {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.8125rem;
    line-height: 1.45;
}

.mb-config-notices__body > div {
    flex: 1 1 auto;
    min-width: 0;
}

.mb-config-notices__title {
    font-weight: 600;
}

.mb-config-notices__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-block-start: 4px;
}

/*
 * The dismiss control is the only way a warning or an error ever leaves the corner, so it
 * gets a full 40px square regardless of the density the toast is painted at. A target that
 * small is not a style choice, it is the difference between silencing a message and
 * clicking the map behind it.
 */
.mb-config-notices__dismiss {
    min-width: 40px;
    min-height: 40px;
}

.mb-config-notices__detail {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    white-space: pre-wrap;
    max-height: 10em;
    overflow: auto;
}

.mb-config-notices__tools {
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: auto;
}

.mb-config-notices__dismiss-all {
    min-height: 40px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-config-notices * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>

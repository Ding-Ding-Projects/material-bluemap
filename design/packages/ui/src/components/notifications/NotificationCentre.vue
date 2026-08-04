<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiBellBadgeOutline, mdiBellOutline } from "@mdi/js";
import { VBtn, VMenu, VTooltip } from "vuetify/components";
import NoticeCentrePanel from "./NoticeCentrePanel.vue";
import { markReviewed, unreadCount, type NoticeState } from "../config/notifications.js";
import { onRevealRequested } from "../shell/revealRequests.js";

/**
 * The bell, and the panel it opens.
 *
 * The affordance already existed in the notification corner and did almost nothing: it
 * showed a count and, behind it, a flat list of message strings with no search, no filter
 * and no way to bring one back. That is the decorative-control failure this project keeps
 * finding, one layer in - the thing looked like a notification centre from a screenshot and
 * was not one.
 *
 * The centre is anchored to this button rather than living in a settings tab, because the
 * bell is where somebody looks the moment they realise the message they wanted has gone. It
 * opens upward and inward from the bottom-right corner so it never covers the button that
 * opened it, and it closes on Escape and on a click outside, both of which return focus to
 * the bell.
 *
 * Opening it is what marks the history read. Not a timer, not a hover: the badge means
 * "raised since you last looked", and only looking can clear it.
 */
const props = defineProps<{ state: NoticeState }>();

const { t } = useI18n();

const open = ref(false);
const buttonRef = ref<InstanceType<typeof VBtn> | null>(null);

const unread = computed(() => unreadCount(props.state));

/**
 * The count on the face of the button.
 *
 * The unread count while there is one, because that is the number somebody is deciding
 * whether to open the panel over. With nothing unread it falls back to the size of the
 * history, so the control still says what it holds rather than reading as an empty button.
 */
const badge = computed(() => (unread.value > 0 ? unread.value : props.state.history.length));

const label = computed(() =>
    t(
        "notices.centre.openLabel",
        { total: props.state.history.length, unread: unread.value },
        "Notification centre. {total} recorded, {unread} new.",
    ),
);

function onToggle(value: boolean): void {
    open.value = value;
    if (value) {
        markReviewed(props.state);
        return;
    }
    // Focus goes back to the bell rather than to the document, so keyboard users are not
    // returned to the top of the page by closing a panel they opened from the corner.
    const element = buttonRef.value?.$el as HTMLElement | undefined;
    element?.focus();
}

/*
 * The command palette can ask for this panel by name, because "notification centre" is a thing
 * people look for and a bell in a corner is a thing people forget the location of. It arrives
 * through the same `onToggle` a click goes through, so the history is marked read exactly as it
 * would have been: opening the centre is what clears the badge, however it was opened.
 */
onRevealRequested("noticeCentre", () => {
    onToggle(true);
});
</script>

<template>
    <v-btn
        ref="buttonRef"
        class="mb-notice-bell"
        :prepend-icon="unread > 0 ? mdiBellBadgeOutline : mdiBellOutline"
        :aria-label="label"
        :aria-expanded="open ? 'true' : 'false'"
        :color="unread > 0 ? 'primary' : undefined"
        variant="tonal"
        size="small"
        density="comfortable"
    >
        {{ badge }}
        <v-tooltip activator="parent" location="top" :text="t('notices.centre.title', 'Notification centre')" />
        <v-menu
            v-model="open"
            activator="parent"
            :close-on-content-click="false"
            location="top end"
            offset="8"
            @update:model-value="onToggle"
        >
            <NoticeCentrePanel :state="state" @close="onToggle(false)" />
        </v-menu>
    </v-btn>
</template>

<style>
/*
 * A real target. Vuetify's small density paints a shorter button than a finger or a shaky
 * pointer can reliably hit, and this is the control somebody reaches for when they have
 * just lost a message, which is the worst moment to make them aim.
 */
.mb-notice-bell {
    min-height: 40px;
}
</style>

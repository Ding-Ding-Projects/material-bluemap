/**
 * The notification centre.
 *
 * `NotificationCentre` is the whole feature: a bell with an unread count and, behind it,
 * the reviewable history. It is mounted inside the notification corner
 * (`components/config/ConfigNotifications.vue`), which is where the bell already appeared
 * and where somebody looks when a toast has gone. A shell that mounts that one corner
 * therefore gets this for free and needs no second mount.
 *
 * `NoticeCentrePanel` is the card on its own, exported so a test can mount the panel
 * without driving a menu overlay, and so a future surface (a settings tab, a wider window)
 * can host the same list without reimplementing it.
 *
 * The queue, its levels, its timings and its bounded history stay in
 * `components/config/notifications.ts`. Nothing here owns state.
 */

export { default as NotificationCentre } from "./NotificationCentre.vue";
export { default as NoticeCentrePanel } from "./NoticeCentrePanel.vue";

export {
    NOTICE_LEVELS,
    countByLevel,
    filterNotices,
    formatNoticesAsMarkdown,
    noticeSampleText,
    noticeSearchText,
} from "./noticeCentre.js";
export type { NoticeFilter } from "./noticeCentre.js";

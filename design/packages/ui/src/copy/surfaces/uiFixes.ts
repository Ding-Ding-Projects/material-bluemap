/**
 * Strings introduced while fixing confirmed UI bugs, staged for later catalogue integration.
 *
 * Deliberately **not** spread into `copy/surfaces/index.ts` — that file is owned by a
 * concurrently running lane, and a fixer touching it risks colliding with in-flight work
 * on the catalogue itself. The keys below already render correctly without this file: every
 * call site reads them through `t(key, englishFallback)`, and vue-i18n falls back to the
 * second argument whenever a key is missing from the compiled messages. This module exists
 * so the Cantonese pairing and the funny-level ladder are not lost between "the bug is
 * fixed" and "somebody folds this into `appCopy.ts`" — copy it into `settings.ts` (or
 * wherever the owning lane lands) and register it there rather than importing from here.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

/* -------------------------------------------------------------------------- */
/* The settings surface's "Updates" section                                   */
/* -------------------------------------------------------------------------- */

/**
 * `settings.updates.title` / `settings.updates.description`: the settings-surface tab that
 * mounts `UpdateStatusRow` — installed version, last check, the feed, a manual check and
 * the recovery action for a dismissed banner. Added alongside the fix that actually wires
 * `UpdateStatusRow` into `AppSettings.vue`; before that fix the component existed and was
 * fully tested but was never reachable from the running app.
 */
export const UIFIXES_FIXED = {
    "settings.updates.title": { en: "Updates", yue: "更新" },
} as const satisfies Record<string, FixedString>;

export const UIFIXES_VOICED = {
    "settings.updates.description": {
        en: [
            "Whether this build is up to date, when it last checked, and where updates come from. Check for updates by hand from here, and bring back an update banner you dismissed.",
            "Whether this build is up to date, when it last checked, and where updates come from. Check for updates by hand from here, and bring back an update banner you dismissed.",
            "Whether this build is up to date, when it last checked, and where updates come from. Check by hand any time from here, and bring back an update banner you put away.",
            "The full story on this build's updates: current, last checked, and where they come from. Poke it for a check whenever you like, and this is also how a dismissed banner comes back.",
            "Everything this build knows about its own updates, all in one row: current or not, last checked, and the address it phones home to. Poke it for a check whenever the mood strikes, and a banner you shooed away comes back from right here.",
        ],
        yue: [
            "呢個版本係咪最新、上次幾時check過、更新從邊度嚟。可以喺度手動check，同埋叫返之前收埋咗嘅更新提示。",
            "呢個版本係咪最新、上次幾時check過、更新從邊度嚟。可以喺度手動check，同埋叫返之前收埋咗嘅更新提示。",
            "呢個版本係咪最新、幾時check過、更新從邊度落。想check幾時都得，收埋咗嘅提示都係喺度叫返出嚟。",
            "呢個版本嘅更新故事全部喺呢一行：新唔新、上次check幾時、由邊度嚟。想check就㩒，之前收埋咗嘅提示都係喺度救返。",
            "呢個版本嘅更新身家全部攤晒喺呢一行俾你睇：新唔新、上次check幾時、成日打電話返嗰個地址係邊。幾時想check就㩒，一個俾你送走咗嘅提示都可以喺度請返嚟。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

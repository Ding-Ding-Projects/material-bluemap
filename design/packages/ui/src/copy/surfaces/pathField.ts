/**
 * `PathField.vue`: the trailing browse button every path text box in the app can adopt.
 *
 * Small on purpose. This is a control, not a screen - the surrounding label, hint and
 * validation still belong to whichever field embeds it (`world.folder.label`,
 * `remote.targets.field.identity`, and so on), so nothing about *what the path is for* lives
 * here. What lives here is the browse affordance itself: the button's own name, the dialog
 * title it opens with, and the one honest sentence for when there is nothing to browse with.
 *
 * `pathField.browse.aria` and `pathField.dialogTitle` are FIXED rather than VOICED. Both are
 * accessible names and window titles - a screen-reader landmark, and a dialog's own caption -
 * and a name that reads differently every time the funny level moves is a name a keyboard or
 * screen-reader user has to re-learn on every visit. `{field}` is filled in by the component
 * with whatever the calling screen says this path is (`"world folder"`, `"the SSH identity
 * file"`), so the rendered name is always concrete: "Browse for world folder", never a bare
 * "Browse".
 *
 * `pathField.unavailable` is the one VOICED entry, because it is an explanation rather than a
 * label - the same shape as `backup.unsupported` and `config.control.pickerUnavailable`, and
 * held to the same rule they are: every level keeps saying it needs the desktop app and that
 * typing or pasting the path still works, because a funny level that stops saying *why* the
 * button is grey is a level that turned a boundary into a mystery.
 *
 * There is deliberately no "cancelled" string. Every existing picker in this app -
 * `ConfigControl.vue`, `WorldFolderStep.vue`, `MapStorageStep.vue` - treats a cancelled
 * dialog as "nothing happened" and leaves the field exactly as it was, with no notice at all.
 * `PathField.vue` matches that: closing the dialog without choosing anything is not an error
 * and not an event worth a sentence, so a fresh "cancelled" toast here would be the one
 * inconsistent picker in the app.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const PATHFIELD_FIXED = {
    /*
     * The accessible name and the tooltip both read this, with `{field}` filled in by the
     * component. `t("pathField.browse.aria", { field: "world folder" })` reads "Browse for
     * world folder" - never a bare "Browse", which is indistinguishable from every other
     * browse button on the same screen to a screen-reader user tabbing through them.
     *
     * Used whenever a field renders exactly one browse button - `semantic: "folder"` or
     * `semantic: "file"`, which is every field in the app today.
     */
    "pathField.browse.aria": { en: "Browse for {field}", yue: "揀 {field}" },
    /*
     * `semantic: "either"` renders both a folder button and a file button on the same field,
     * and the two need names a screen reader can tell apart - two buttons both announced
     * "Browse for the Java runtime" is a pair a keyboard user cannot choose between without
     * guessing from the icon alone. These two only apply in that dual-button case; the plain
     * `pathField.browse.aria` above still names the single button everywhere else.
     */
    "pathField.browseFolder.eitherAria": { en: "Browse for a folder, for {field}", yue: "揀資料夾，俾 {field}" },
    "pathField.browseFile.eitherAria": { en: "Browse for a file, for {field}", yue: "揀檔案，俾 {field}" },
    "pathField.dialogTitle": { en: "Choose {field}", yue: "揀 {field}" },
} as const satisfies Record<string, FixedString>;

export const PATHFIELD_VOICED = {
    "pathField.unavailable": {
        en: [
            "Browsing for {field} needs the desktop app. Type or paste the path here instead.",
            "Browsing for {field} needs the desktop app. Type or paste the path here instead.",
            "Browsing for {field} needs the desktop app, which this build is not. Type or paste the path here instead.",
            "There is no browse button for {field} here, because that needs the desktop app. Type or paste the path instead.",
            "No browse button for {field} in this build, because opening a folder picker needs the desktop app. Type or paste the path here, the old-fashioned way.",
        ],
        yue: [
            "瀏覽 {field} 需要桌面應用程式先得。請喺呢度直接打字或者貼上路徑。",
            "瀏覽 {field} 需要桌面應用程式先得。請喺呢度直接打字或者貼上路徑。",
            "瀏覽 {field} 需要桌面應用程式先得，而呢個版本唔係。請喺呢度打字或者貼上路徑。",
            "{field} 呢度冇瀏覽掣，因為要用桌面應用程式先得。喺呢度打字或者貼上路徑就得。",
            "呢個版本冇瀏覽掣俾 {field} 用，因為開資料夾揀嘢視窗需要桌面應用程式。喺呢度老派咁打字或者貼上路徑啦。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const PATHFIELD_FACTS = {
    // Every level keeps naming the boundary (desktop app) and the working alternative
    // (type or paste), because a funny level that drops either turns an honest disabled
    // state into an unexplained missing button.
    "pathField.unavailable": {
        en: ["desktop app", "Type or paste"],
        yue: ["桌面應用程式", "打字或者貼上"],
    },
} as const satisfies Record<
    keyof typeof PATHFIELD_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;

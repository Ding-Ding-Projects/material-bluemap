/**
 * The clause of issue #10 that is a promise about code nobody has written yet.
 *
 * "Every destructive action in the app is behind the gate" is a claim about the next delete
 * button as much as about the five that exist today, so it is enforced the way its
 * neighbour `components/notifications/notificationPolicy.test.ts` enforces "everything that
 * only informs becomes a notification": as an inventory. Every call site in this package
 * that destroys or forgets something is declared below with what it destroys and where it
 * stands, and a new one fails this file until somebody writes that sentence down.
 *
 * The declaration is the whole mechanism, and it is deliberately awkward to fill in
 * dishonestly. It is very easy to add `@click="remove(id)"` to a row; it is much harder to
 * write, in a file a reviewer reads, that the thing being removed is unrecoverable and that
 * nothing is standing in front of it. An entry may say a gate is not needed, but it may
 * only say so in one of a fixed set of words, each of which means something specific and
 * checkable. Inventing a sixth excuse means editing the union type, which shows up in the
 * diff. "It is only small" is not one of the five.
 *
 * Two further things are pinned here because they are structural rather than behavioural,
 * and a mounted test would not notice either going wrong:
 *
 *  - Both gates run the one shared state machine. Two components drawing two cards is fine;
 *    two components each doing their own key-and-slider arithmetic is how one of them ends
 *    up firing at 90% and nobody finds out for a release.
 *  - Each gate still contains every part the contract lists. Nothing stops somebody
 *    "simplifying" the Emergency exit or the reduced-motion block out of a card that goes
 *    on passing every interaction test, so the parts are asserted by name.
 *
 * This file is deliberately not in the jsdom environment its mounted neighbour uses: under
 * jsdom `import.meta.url` is not a `file:` URL, so `fileURLToPath` throws before a single
 * assertion runs.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** `packages/ui/src`, two levels above this file. */
const uiSource = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string, extensions: readonly string[]): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) found.push(...sourceFiles(path, extensions));
        else if (extensions.some((extension) => name.endsWith(extension))) found.push(path);
    }
    return found;
}

function relativeToSource(path: string): string {
    return relative(uiSource, path).replaceAll("\\", "/");
}

function read(path: string): string {
    return readFileSync(join(uiSource, path), "utf8");
}

/** The two gates, named once so every assertion below covers the same pair. */
const ANCHORED_GATE = "components/config/ConfigSuperConfirm.vue";
const MODAL_GATE = "components/menu/MenuSuperConfirm.vue";
const GATES = [ANCHORED_GATE, MODAL_GATE] as const;

/* -------------------------------------------------------------------------- */
/* Finding the destructive call sites                                         */
/* -------------------------------------------------------------------------- */

/**
 * What a destructive call site looks like.
 *
 * The first pattern is the net, and it is a naming convention rather than a list: anything
 * called `deleteSomething(`, `removeSomething(`, `purgeSomething(` and so on is caught the
 * day it is written, without this file having to know it exists. That is the property that
 * makes the guard worth having, because a list of known primitives only ever protects
 * against the deletes somebody already thought about.
 *
 * Four DOM and URL methods are cut out of that net by name. `removeEventListener`,
 * `removeProperty`, `removeChild`, `removeAttribute` and `revokeObjectURL` are how this
 * package tidies up after itself on unmount, they appear in about a dozen files, and a
 * guard that reports all of them is a guard whose output nobody reads. They are excluded by
 * exact identifier rather than by prefix, so a `removeChildMap(` of our own still matches.
 *
 * The rest are the primitives whose names do not follow the convention and would otherwise
 * slip past: signing out, resetting every setting, emptying a stored directory choice,
 * closing tabs in bulk, and stopping work that is in flight. They are matched narrowly,
 * because a guard that fires on `cancel()` in general fires on the Cancel button of every
 * form in the package and is switched off within a week.
 *
 * Word boundaries are hand-rolled rather than `\b` so that a member call such as
 * `workspace.removeEntry(...)` still matches while `canRemoveEntry(` does not: the leading
 * class excludes an identifier character before the verb, and the verb itself is lower case,
 * so a camel-case prefix cannot produce a match.
 */
const DESTRUCTIVE_CALLS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
    {
        label: "a delete/remove/purge-shaped call",
        pattern:
            /(?<![A-Za-z0-9_$])(?:delete|remove|destroy|purge|wipe|erase|revoke|discard)(?!(?:EventListener|Property|Child|Attribute|ObjectURL)\s*\()[A-Z][A-Za-z0-9_$]*\s*\(/g,
    },
    { label: "signs out of GitHub and revokes the token", pattern: /(?<![A-Za-z0-9_$])signOut\s*\(/g },
    { label: "clears every saved setting", pattern: /(?<![A-Za-z0-9_$])resetSettings\s*\(/g },
    { label: "forgets the map storage directory", pattern: /(?<![A-Za-z0-9_$])clearMapStorageDir\s*\(/g },
    { label: "closes tabs in bulk", pattern: /(?<![A-Za-z0-9_$])applyClosePlan\s*\(/g },
    { label: "stops a render that is running", pattern: /\brun\.cancel\s*\(/g },
    { label: "aborts a download that is running", pattern: /(?<![A-Za-z0-9_$])cancelDownload\s*\(/g },
    { label: "empties web storage outright", pattern: /(?:local|session)Storage\.clear\s*\(/g },
];

function destructiveHits(text: string): number {
    let count = 0;
    for (const call of DESTRUCTIVE_CALLS) {
        call.pattern.lastIndex = 0;
        count += text.match(call.pattern)?.length ?? 0;
    }
    return count;
}

/* -------------------------------------------------------------------------- */
/* The inventory                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Where a destructive call site stands with respect to the contract. Five of these are
 * fine and one is a defect, and they are a closed set on purpose.
 *
 *  - `gated`      The super-confirmation gate stands in front of it. `gatedIn` names the
 *                 file holding that gate, which is not always the file making the call: the
 *                 config editor stages removals in one screen and performs them in another.
 *  - `type-only`  A declaration of a host method rather than a call to one. The preload
 *                 bridge's `.d.ts` destroys nothing by existing; its callers are declared
 *                 separately and carry the gate.
 *  - `buffer`     Mutates the unsaved in-memory config workspace. Nothing has left the disk,
 *                 reopening the folder restores it in full, and the apply dialog names every
 *                 file that would actually be deleted before anything is.
 *  - `reversible` The user can put the state straight back through the same control. A
 *                 withdrawn consent is granted again; a forgotten path is chosen again.
 *  - `resumable`  Survivable rather than destructive. What has already been produced is kept
 *                 on purpose and the work resumes from it.
 *  - `unwired`    Model code with no user-facing caller yet. The gate is owed by whoever
 *                 wires it, and this declaration is what makes them notice.
 *  - `gap`        Shipped, reachable, and not behind the gate. A defect, named as one, with
 *                 the issue it is tracked under.
 */
type Standing = "gated" | "type-only" | "buffer" | "reversible" | "resumable" | "unwired" | "gap";

interface DestructiveFile {
    /** How many destructive call sites the file is expected to contain. */
    readonly count: number;
    /** What is destroyed, in the words a user would recognise. */
    readonly destroys: string;
    readonly standing: Standing;
    /** Required when `standing` is `gated`: the file holding the gate. */
    readonly gatedIn?: string;
    /** Required for every other standing: why that word is the true one here. */
    readonly note?: string;
}

/**
 * Every destructive call site in this package, and where it stands.
 *
 * Ordered by path so the diff of adding one reads as an addition rather than a reshuffle.
 */
const DESTRUCTIVE_FILES: Record<string, DestructiveFile> = {
    "bridge.d.ts": {
        count: 4,
        destroys:
            "config files on disk, the recorded Mojang download consent, older revisions of a " +
            "config folder's version history, and older revisions of a world's project history",
        standing: "type-only",
        note:
            "The preload bridge's shape, not a call to it. All four routes are declared again at " +
            "the files that actually invoke them, and the gate belongs there.",
    },
    "components/ProfileManager.vue": {
        count: 1,
        destroys: "a saved map or server entry, and with it the only route this application keeps to a locally rendered map",
        standing: "gated",
        gatedIn: "components/ProfileManager.vue",
    },

    "components/appearance/AppearanceEditor.vue": {
        count: 2,
        destroys:
            "a user-saved appearance preset, and with it the settings every element following that preset was inheriting",
        standing: "gated",
        gatedIn: "components/appearance/AppearanceEditor.vue",
    },
    "components/config/ConfigMarkerSetsField.vue": {
        count: 2,
        destroys: "a marker set from the map config being edited",
        standing: "buffer",
        note:
            "Edits the unsaved workspace. The file on disk is untouched until the apply " +
            "dialog says so, and that dialog is gated when the plan deletes anything.",
    },
    "components/config/MaskDrawingCanvas.vue": {
        count: 4,
        destroys: "one vertex from the polygon shape being drawn, in the unsaved mask being edited",
        standing: "buffer",
        note:
            "Same buffer as maskCanvas.ts's own removePolygonPoint below, which this file's " +
            "removePoint wraps: its own declaration and the dblclick/click handlers that " +
            "reach it account for three of the four hits, and the removePolygonPoint call " +
            "inside its body is the fourth. Nothing reaches disk -- the toolbar's own Undo " +
            "button (bound to canUndo(history)) restores the vertex in one click, the same " +
            "as every other edit this canvas makes, and ConfigMaskField.vue's own note above " +
            "already covers the same field once it is written back into the config record.",
    },
    "components/config/ConfigMaskField.vue": {
        count: 2,
        destroys: "a render mask shape from the map config being edited",
        standing: "buffer",
        note:
            "Edits the unsaved workspace. The file on disk is untouched until the apply " +
            "dialog says so, and reopening the folder restores every shape.",
    },
    "components/config/ConfigScreen.vue": {
        count: 1,
        destroys: "config files, taken off the disk by the host when a save runs",
        standing: "gated",
        gatedIn: "components/config/ConfigApplyDialog.vue",
    },
    "components/config/MapsScreen.vue": {
        count: 1,
        destroys: "a map config, and the route to the tiles that were rendered from it",
        standing: "gated",
        gatedIn: "components/config/MapsScreen.vue",
    },
    "components/config/StoragesScreen.vue": {
        count: 1,
        destroys: "a storage config that maps may still point at",
        standing: "gated",
        gatedIn: "components/config/StoragesScreen.vue",
    },
    "components/config/configHost.ts": {
        count: 3,
        destroys: "config files on disk, through the host adapter every screen shares",
        standing: "gated",
        gatedIn: "components/config/ConfigApplyDialog.vue",
    },
    "components/config/configModel.ts": {
        count: 1,
        destroys: "one field's value in the config document being edited",
        standing: "buffer",
        note:
            "A pure transform of the in-memory document. Clearing a field is an ordinary " +
            "edit that the user undoes by typing the value again, and nothing is written.",
    },
    "components/config/configWorkspace.ts": {
        count: 1,
        destroys: "a map or storage entry in the unsaved workspace",
        standing: "buffer",
        note:
            "The staging step, not the delete. It moves the entry's file onto the save " +
            "plan's delete list, which the apply dialog shows and gates before running.",
    },
    "components/config/maskCanvas.ts": {
        count: 1,
        destroys: "one vertex from the polygon shape being drawn, in the unsaved mask being edited",
        standing: "buffer",
        note:
            "removePolygonPoint is a pure transform of the in-memory shape, the same " +
            "position as configModel.ts's own field-clearing function above: nothing is " +
            "written until the config's own save runs, and this file's own undo history " +
            "(initHistory/pushHistory/undo, further down) puts the vertex straight back " +
            "with one click through MaskDrawingCanvas.vue's Undo button.",
    },
    "components/downloads/downloadBridge.ts": {
        count: 2,
        destroys: "nothing: it stops a transfer that is running",
        standing: "resumable",
        note:
            "This module's own note says a cancelled download is survivable and must not be " +
            "hidden. The partial file is kept and the row offers to resume from it.",
    },
    "components/downloads/downloads.ts": {
        count: 1,
        destroys: "nothing: it stops a transfer that is running",
        standing: "resumable",
        note:
            "Cancelling leaves the bytes already fetched on disk and the row moves to a " +
            "resumable state, so the action costs time rather than data.",
    },
    "components/eula/EulaViewer.vue": {
        count: 2,
        destroys: "many tabs at once, along with any unsaved work they were holding",
        standing: "gated",
        gatedIn: "components/tabs/TabClosePanel.vue",
        note:
            "The same shape as components/tabs/TabbedNavigation.vue's own entry: this viewer " +
            "runs a close plan only in response to an apply event from TabStrip, which emits " +
            "one only from the close panel or the plan confirm, both of which show the " +
            "reviewable preview and then the gate. Its second call removes a tab group, which " +
            "closes no tab at all. Nothing here touches a clause of the document; a closed tab " +
            "is a way back in, and the viewer's own note says so.",
    },
    "components/github/GitHubAccountsList.vue": {
        count: 1,
        destroys:
            "one stored account's GitHub token, and the grant on that account when GitHub honours the revocation",
        standing: "gated",
        gatedIn: "components/github/GitHubAccountsList.vue",
        note:
            "Issue #10, closed: each row renders its own ConfigSuperConfirm instance, closed " +
            "over that row's own account id, rather than the two-click inline confirm the " +
            "row used before.",
    },
    "components/github/GitHubStatusRow.vue": {
        count: 1,
        destroys: "the stored GitHub token, and the grant on the account when GitHub honours the revocation",
        standing: "gated",
        gatedIn: "components/github/GitHubStatusRow.vue",
        note:
            "Issue #10, closed: replaced the bespoke inline two-click confirm with " +
            "ConfigSuperConfirm, the same anchored two-key gate every other destructive " +
            "control in this application uses.",
    },
    "components/github/githubAccount.ts": {
        count: 2,
        destroys: "the stored GitHub token, and the grant on the account when GitHub honours the revocation",
        standing: "gated",
        gatedIn: "components/github/GitHubStatusRow.vue",
        note:
            "Issue #10, closed: the sign-out primitive behind the row above. It moves behind " +
            "the gate with that row, and is listed separately so the count cannot drift.",
    },
    "components/github/githubAccountsStore.ts": {
        count: 2,
        destroys:
            "one stored account's GitHub token, and the grant on that account when GitHub honours the revocation",
        standing: "gated",
        gatedIn: "components/github/GitHubAccountsList.vue",
        note:
            "Issue #10, closed: the per-account removal primitive behind the row above (the " +
            "interface signature and the implementation both name the same call, hence two). " +
            "It moves behind the gate with that row, and is listed separately so the count " +
            "cannot drift.",
    },
    "components/history/HistoryPanel.vue": {
        count: 1,
        destroys:
            "older revisions of a config folder's version history, and with them the only route back " +
            "to the states of that folder they recorded",
        standing: "gated",
        gatedIn: "components/history/HistoryPanel.vue",
        note:
            "The one call in the whole history feature that takes anything away. Everything else " +
            "there only ever adds a revision, restore included: a restore writes the old files back " +
            "and records that as a new revision, so the state it replaced stays in the list.",
    },
    "components/history/SimpleHistoryList.vue": {
        count: 1,
        destroys:
            "older revisions of a project's, a profile list's, or the application settings' own " +
            "version history - whichever one this instance was mounted against - and with them the " +
            "only route back to the states they recorded",
        standing: "gated",
        gatedIn: "components/history/SimpleHistoryList.vue",
        note:
            "The narrow list-and-restore host's retention control, offered only once its optional " +
            "`discardOlderRevisions` is really there - see `simpleHistoryHost.ts`. Restore, the " +
            "list's other action, only ever adds a revision.",
    },
    "components/history/SimpleHistoryPanel.vue": {
        count: 1,
        destroys:
            "older revisions of a profile list's or the application settings' own version history " +
            "and with them the only route back to the states they recorded",
        standing: "gated",
        gatedIn: "components/history/SimpleHistoryPanel.vue",
        note:
            "Same control, same optional-capability gating as `SimpleHistoryList.vue` above, on the " +
            "sibling component `AppSettings.vue` mounts for its searchable, date-filterable history.",
    },
    "components/history/historyHost.ts": {
        count: 3,
        destroys:
            "older revisions of a config folder's version history, through the host adapter the panel " +
            "shares",
        standing: "gated",
        gatedIn: "components/history/HistoryPanel.vue",
        note:
            "The seam rather than the deletion: an interface method, the probe that refuses a bridge " +
            "missing it, and the adapter that forwards it. Its one caller is the panel, behind the gate.",
    },
    "components/history/historyRestore.ts": {
        count: 1,
        destroys: "one setting's entry in an in-memory copy of a config file that is about to be written back",
        standing: "buffer",
        note:
            "A pure transform of a parsed HOCON document, and the same call the config editor " +
            "makes for an ordinary edit. It runs when somebody puts one setting back to a value " +
            "it did not have then, which means taking the key out is the correct restoration " +
            "rather than a deletion. Nothing reaches the disk here: the merged text goes to the " +
            "history host, which snapshots the folder first and records the write as a new " +
            "revision that can itself be undone.",
    },
    "components/NoticeBulkToolbar.vue": {
        count: 2,
        destroys:
            "the selected notifications' entries in this session's notification history, and off " +
            "the corner too for any of them still showing",
        standing: "gated",
        gatedIn: "components/NoticeBulkToolbar.vue",
        note:
            "`deleteImpact(` is a read-only preview -- it counts how many of the selection are " +
            "still in the history and changes nothing -- and is only caught because it shares " +
            "the delete-shaped naming convention the detector watches for. `deleteSelectedHistory(` " +
            "is the real destructive call, and it only ever runs from `runDelete()`, which is " +
            "wired to nothing but ConfigSuperConfirm's `@confirm`. Dismiss and mark-as-read live " +
            "beside it in this same file and destroy nothing: dismiss only clears the corner and " +
            "leaves the history untouched, and marking as read only moves a watermark forward.",
    },
    "components/notifications/noticeBulk.ts": {
        count: 2,
        destroys:
            "the selected notifications' entries in this session's notification history, and off " +
            "the corner too for any of them still showing",
        standing: "gated",
        gatedIn: "components/NoticeBulkToolbar.vue",
        note:
            "`deleteImpact(` is the same read-only preview described above. `deleteSelectedHistory(` " +
            "is declared here -- this file is the pure-logic layer the toolbar calls into, the same " +
            "shape as `components/tabs/closePlans.ts` -- but it is never called from here; its one " +
            "caller is `components/NoticeBulkToolbar.vue`, behind the gate. There is no local " +
            "version history for the notification queue the way there is for a config folder, so " +
            "the gate's own sentence is the only place 'this cannot be undone' is said, and it has " +
            "to say so.",
    },
    "components/project/ProjectsScreen.vue": {
        count: 1,
        destroys:
            "a world's project file, and with it every map, storage and render setting that " +
            "world was set up to render with",
        standing: "gated",
        gatedIn: "components/project/ProjectList.vue",
        note:
            "The one call in the whole project feature that takes anything away. Everything " +
            "else there writes or reads. The gate names each file, and says out loud that the " +
            "Minecraft world and its already-rendered tiles are both untouched, because those " +
            "are the two things people assume and neither is true.",
    },
    "components/project/projectHost.ts": {
        count: 0,
        destroys:
            "a world's project file, through the host adapter every project surface shares",
        standing: "type-only",
        note:
            "The seam rather than the deletion, exactly as components/history/historyHost.ts " +
            "is. It is declared with a count of zero because the detector cannot see it: " +
            "`deleteProject` is an optional method, so every appearance of it is written " +
            "`deleteProject?(...)`, `deleteProject?.(...)` or as a bare property test, and none " +
            "of those is the `name(` shape the pattern matches. Recorded here anyway so the " +
            "inventory covers the route rather than only the call, and so a future change that " +
            "makes it required is noticed as a count that has drifted from zero.",
    },
    "components/remote/RemoteHostingPanel.vue": {
        count: 1,
        destroys:
            "the running container hosting a map on the person's own server and, unless the target " +
            "keeps its files, the uploaded copy of the world and its tiles too",
        standing: "gated",
        gatedIn: "components/remote/RemoteHostingPanel.vue",
        note:
            "The one call in the whole hosting feature that takes anything away. Named " +
            "removeHosting rather than stop, the same way PagesScreen.vue's own stop call is " +
            "named removeHosting, so this detector's net actually catches it. The gate names " +
            "exactly what a republish costs (the whole upload again, not a resume) before the " +
            "container is ever torn down.",
    },
    "components/remote/RemoteTargetEditor.vue": {
        count: 1,
        destroys: "one saved remote machine: its host, port, account name and the path to its key file",
        standing: "reversible",
        note:
            "Nothing on any disk and nothing on the remote host. What is forgotten is four " +
            "short fields the same form writes again in half a minute, and it deliberately " +
            "cannot forget a secret because there is none in a target: the identity file is " +
            "recorded as a path this application never opens, and there is no password field " +
            "anywhere in the feature. Forgetting a machine also never touches a render in " +
            "flight on it, which is stopped from the run panel and is declared there.",
    },
    "components/remote/remoteTargets.ts": {
        count: 1,
        destroys: "one entry of the saved-machines list, as a list operation",
        standing: "reversible",
        note:
            "The pure function behind the row's Forget, in the same position as " +
            "components/setup/setupPrefs.ts: it returns a new array without one entry and " +
            "performs no deletion of its own. Which machine is forgotten, and whether that " +
            "matters, is a question about the caller, and that caller is declared in its own " +
            "right immediately above.",
    },
    "components/renders/activeRenders.ts": {
        count: 1,
        destroys: "nothing: it stops a render that is running",
        standing: "resumable",
        note:
            "The same shape as components/world/RenderRunPanel.vue's own entry, and the same " +
            "underlying track.run.cancel(): tiles already drawn are kept, and RendersScreen." +
            "vue's per-row Stop button and bulk-cancel dialog both say so out loud. The bulk " +
            "path runs behind ConfigSuperConfirm anyway as an extra check before touching " +
            "several renders at once, but the single-row cancel this file drives is ungated " +
            "on purpose, exactly like RenderRunPanel.vue's own -- there is no gate to name.",
    },
    "components/pages/PagesScreen.vue": {
        count: 3,
        destroys:
            "a published map's website: GitHub Pages is turned off for the repository and the " +
            "publishing branch is deleted, so the address stops working",
        standing: "gated",
        gatedIn: "components/pages/PagesScreen.vue",
        note:
            "The one call in the whole publishing feature that takes anything away. The gate " +
            "names the repository, the branch and the address, and says out loud that the " +
            "render on this computer and the rest of that repository are both untouched, " +
            "because those are the two things people assume and only one of them is obvious.",
    },
    "components/pages/pagesBridge.ts": {
        count: 1,
        destroys:
            "a published map's website, through the seam the screen reaches the main process by",
        standing: "gated",
        gatedIn: "components/pages/PagesScreen.vue",
        note:
            "The seam rather than the deletion, exactly as components/history/historyHost.ts " +
            "is: one interface method, whose only caller is the store below, whose only caller " +
            "is the screen, behind the gate.",
    },
    "components/pages/pagesHosting.ts": {
        count: 3,
        destroys: "a published map's website, through the store the screen drives",
        standing: "gated",
        gatedIn: "components/pages/PagesScreen.vue",
        note:
            "The declaration, the implementation and the one bridge call it forwards to. " +
            "Nothing here decides to run it: the screen does, and the screen puts the two keys " +
            "and the full-range slider in front of it first.",
    },
    "components/menu/SettingsMenu.vue": {
        count: 2,
        destroys: "every saved viewer setting in this browser, followed by a reload",
        standing: "gated",
        gatedIn: "components/menu/SettingsMenu.vue",
    },
    "components/settings/dockPlacement.ts": {
        count: 3,
        destroys:
            "the remembered placement, docked thickness and floating position of every dockable " +
            "surface, in this browser profile",
        standing: "reversible",
        note:
            "The global reset behind the placement controls, now three sibling clears " +
            "(clearDockPlacements, clearDockSizes, clearDockFloatingRects) that the panels " +
            "feature's resetAllDockPlacements/resetAllDockGeometry call together from the same " +
            "plain @click in SurfacePlacementRow.vue -- no gate stands in front of any of the " +
            "three. Each forgets a stored preference rather than any content: every surface " +
            "returns to the default it shipped with, and the same drag/resize/dock controls " +
            "write the choice again the moment one is made. Their own comments give the reason " +
            "each removes its key rather than writing an empty record.",
    },
    "components/setup/firstRunFlow.ts": {
        count: 3,
        destroys: "the recorded consent to download Minecraft client resources",
        standing: "reversible",
        note:
            "Withdrawing consent is the safe direction of a yes-or-no the user can answer " +
            "again from the same screen, and nothing that was downloaded is removed by it.",
    },
    "components/setup/mapStorage.ts": {
        count: 1,
        destroys: "the remembered path of the map storage directory",
        standing: "reversible",
        note:
            "It forgets a stored path, not a directory: nothing on the disk is touched, and " +
            "the setup screen writes the choice again the next time one is made.",
    },
    "components/setup/setupPrefs.ts": {
        count: 1,
        destroys: "one stored preference key",
        standing: "reversible",
        note:
            "The storage adapter itself. Which key is forgotten, and whether that matters, is " +
            "a question about the caller, and every caller is declared in its own right.",
    },
    "components/tabs/TabbedNavigation.vue": {
        count: 2,
        destroys: "many tabs at once, along with any unsaved work they were holding",
        standing: "gated",
        gatedIn: "components/tabs/TabClosePanel.vue",
        note:
            "The strip runs a plan only in response to an apply event from the close panel " +
            "or the plan confirm, both of which show the reviewable preview and then the " +
            "gate. Its second call removes a tab group, which closes no tab at all.",
    },
    "components/tabs/closePlans.ts": {
        count: 2,
        destroys: "many tabs at once, along with any unsaved work they were holding",
        standing: "gated",
        gatedIn: "components/tabs/TabClosePanel.vue",
        note:
            "The model returns a plan and closes nothing by itself; every surface that runs " +
            "one puts the reviewable preview and then the gate in front of it.",
    },
    "components/tabs/tabModel.ts": {
        count: 1,
        destroys: "a tab group, which is a label and an ordering rather than any content",
        standing: "reversible",
        note:
            "Its own note is explicit that removing a group never closes a tab: the members " +
            "become lone tabs in the slot the group held, and a group is made again from the " +
            "same menu that removed one.",
    },
    "components/world/RenderRunPanel.vue": {
        count: 1,
        destroys: "nothing: it stops a render that is running",
        standing: "resumable",
        note:
            "Tiles already drawn are kept deliberately, and the interrupted-render offer " +
            "re-runs against them so a stopped render costs the remaining work only.",
    },
    "stores/profiles.ts": {
        count: 1,
        destroys: "a saved map or server entry, from this session and from the next",
        standing: "gated",
        gatedIn: "components/ProfileManager.vue",
    },
};

/**
 * The defects, listed once in the open.
 *
 * Held apart from the inventory so that adding a `gap` entry is not a quiet edit to a long
 * object but a change to a short list a reviewer reads in full. A gap that nobody wrote here
 * fails, and a gap that was fixed and left here fails too.
 */
const KNOWN_GAPS: readonly string[] = [];

/* -------------------------------------------------------------------------- */

describe("every destructive action is declared with where it stands", () => {
    const files = sourceFiles(uiSource, [".ts", ".vue"]).filter((file) => !file.endsWith(".test.ts"));

    const found = new Map<string, number>();
    for (const file of files) {
        const count = destructiveHits(readFileSync(file, "utf8"));
        if (count > 0) found.set(relativeToSource(file), count);
    }

    it("finds the call sites it is supposed to be watching", () => {
        expect(files.length).toBeGreaterThan(40);
        expect(found.size).toBeGreaterThan(10);
    });

    it("has no destructive call site that is not declared", () => {
        const undeclared = [...found]
            .filter(([file]) => DESTRUCTIVE_FILES[file] === undefined)
            .map(([file, count]) => `${file} makes ${count} destructive call(s)`);

        expect(
            undeclared,
            "Issue #10: a destructive action is only allowed behind the super-confirmation " +
                "gate. Wire it to ConfigSuperConfirm (anchored, which the contract prefers) or " +
                "MenuSuperConfirm (modal, where there is nowhere to anchor), then declare it in " +
                "DESTRUCTIVE_FILES as `gated` with the file holding that gate. If it genuinely " +
                "destroys nothing recoverable, one of the other standings may apply, and the " +
                "note has to say why that word is the true one.",
        ).toEqual([]);
    });

    it("counts the same number in each declared file, so a new delete cannot hide beside an old one", () => {
        const drifted = Object.entries(DESTRUCTIVE_FILES)
            .map(([file, entry]) => ({ file, want: entry.count, have: found.get(file) ?? 0 }))
            .filter((entry) => entry.want !== entry.have)
            .map((entry) => `${entry.file}: declared ${entry.want}, found ${entry.have}`);

        expect(
            drifted,
            "Either a destructive call was added to a file that already had one, or one was " +
                "removed and the declaration is now stale. Both need the count updating, and " +
                "an addition needs its standing stated.",
        ).toEqual([]);
    });

    it("makes every declaration name what it destroys rather than an empty string", () => {
        for (const [file, entry] of Object.entries(DESTRUCTIVE_FILES)) {
            expect(entry.destroys.length, `${file} declares nothing destroyed`).toBeGreaterThan(20);
        }
    });

    it("points every gated entry at a file that really does hold a gate", () => {
        const wrong: string[] = [];

        for (const [file, entry] of Object.entries(DESTRUCTIVE_FILES)) {
            if (entry.standing !== "gated") continue;
            const host = entry.gatedIn;
            if (host === undefined) {
                wrong.push(`${file} is declared gated and names no gate file`);
                continue;
            }
            const text = read(host);
            if (!text.includes("ConfigSuperConfirm") && !text.includes("MenuSuperConfirm")) {
                wrong.push(`${file} claims a gate in ${host}, which uses neither gate`);
            }
        }

        expect(wrong).toEqual([]);
    });

    it("makes every ungated entry say why, at length, rather than leaving the field off", () => {
        const silent = Object.entries(DESTRUCTIVE_FILES)
            .filter(([, entry]) => entry.standing !== "gated")
            .filter(([, entry]) => (entry.note ?? "").length < 60)
            .map(([file]) => file);

        expect(
            silent,
            "An entry that is not behind the gate has to justify the word it chose. The " +
                "standings are a closed set precisely so that the justification is checkable.",
        ).toEqual([]);
    });

    it("keeps the list of known gaps exactly as long as the gaps themselves", () => {
        const declared = Object.entries(DESTRUCTIVE_FILES)
            .filter(([, entry]) => entry.standing === "gap")
            .map(([file]) => file)
            .sort();

        expect(
            declared,
            "A new `gap` means something destructive shipped without its gate. Add it to " +
                "KNOWN_GAPS deliberately, or gate it. A gap that was fixed comes off both.",
        ).toEqual([...KNOWN_GAPS].sort());
    });
});

describe("the detector, on cases it has to get right", () => {
    it("catches a new delete, whatever it is called and wherever it is written", () => {
        const invented = [
            "const a = deleteRender(id);",
            '<v-btn @click="removeDownload(row.id)" />',
            "await host.purgeTiles(mapId);",
            "state.signOut();",
            "localStorage.clear();",
            "void run.cancel();",
            "const next = applyClosePlan(strip, plan);",
        ];

        for (const line of invented) expect(destructiveHits(line), line).toBeGreaterThan(0);
    });

    it("leaves the innocent neighbours of those words alone", () => {
        const innocent = [
            "const can = canRemoveEntry(workspace, key);",
            "function cancel(): void { open.value = false; }",
            "const removed = list.filter((row) => row.id !== id);",
            "if (canSignOut(bridge)) return;",
            "emit('cancel');",
            "window.removeEventListener('touchend', onTouchStop);",
            "document.documentElement.style.removeProperty('--mb-titlebar-height');",
            "URL.revokeObjectURL(url);",
        ];

        for (const line of innocent) expect(destructiveHits(line), line).toBe(0);
    });
});

/* -------------------------------------------------------------------------- */
/* One state machine, two cards                                               */
/* -------------------------------------------------------------------------- */

describe("both gates are the same gate", () => {
    it("has exactly the two gate components, so a third cannot be forked in quietly", () => {
        const named = sourceFiles(uiSource, [".vue"])
            .map(relativeToSource)
            .filter((file) => /SuperConfirm/.test(file));

        expect(
            named.sort(),
            "Reuse or extend one of the two gates rather than writing a third. The contract " +
                "is one state machine with two presentations; a third presentation is fine, a " +
                "third implementation of the rule is not.",
        ).toEqual([...GATES].sort());
    });

    it("runs both of them on the shared state machine rather than their own arithmetic", () => {
        for (const gate of GATES) {
            const text = read(gate);
            expect(text, `${gate} does not use the shared gate`).toContain("createSuperConfirmGate");
            expect(text, `${gate} reimplements the travel end`).not.toMatch(/>=\s*100/);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Every part the contract lists, still present in both cards                 */
/* -------------------------------------------------------------------------- */

/**
 * The parts of the contract that are visible in the source of a gate.
 *
 * Asserted as text because each is a thing that can be deleted without breaking anything
 * that looks broken. A card with one key still opens; a card with no reduced-motion block
 * still animates; a card with no accessible name still reads fine to somebody looking at it.
 */
const REQUIRED_PARTS: readonly { readonly part: string; readonly needle: RegExp }[] = [
    { part: "a first key control", needle: /gate\.keyOne/ },
    { part: "a second, independent key control", needle: /gate\.keyTwo/ },
    { part: "a full-range slider", needle: /<v-slider/ },
    { part: "the slider disabled until both keys are turned", needle: /:disabled="!armed \|\| done"/ },
    { part: "a progress animation while the slider travels", needle: /progress--live/ },
    { part: "a distinct completion animation", needle: /--authorized/ },
    { part: "an Emergency exit", needle: /Emergency exit/ },
    { part: "an Escape path", needle: /@keydown\.esc/ },
    { part: "focus returned when it closes", needle: /returnFocusTo/ },
    { part: "a live status region", needle: /role="status"/ },
    { part: "an accessible name on the surface", needle: /:aria-label="title"/ },
    { part: "an accessible name on the slider", needle: /:aria-label="confirmLabel"/ },
    { part: "a spoken position for the slider", needle: /aria-valuetext/ },
    { part: "a reduced-motion block", needle: /prefers-reduced-motion: reduce/ },
    { part: "a 40px Emergency exit target", needle: /__exit \{\s*\n\s*min-height: 40px/ },
];

describe("each gate still contains every part the contract lists", () => {
    for (const gate of GATES) {
        it(`keeps them all in ${gate}`, () => {
            const text = read(gate);
            const missing = REQUIRED_PARTS.filter(({ needle }) => !needle.test(text)).map(
                ({ part }) => part,
            );
            expect(missing).toEqual([]);
        });
    }
});

/* -------------------------------------------------------------------------- */
/* House style in the copy this feature added                                 */
/* -------------------------------------------------------------------------- */

describe("the super-confirmation copy", () => {
    const owned = [
        ...GATES,
        "components/confirm/superConfirmGate.ts",
        "components/ProfileManager.vue",
        "components/config/ConfigApplyDialog.vue",
    ];

    it("uses no em-dashes, in any of the files this feature owns", () => {
        for (const path of owned) {
            expect(read(path), path).not.toContain("—");
        }
    });
});

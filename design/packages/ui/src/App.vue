<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCloudSyncOutline,
    mdiCloudUploadOutline,
    mdiCog,
    mdiEye,
    mdiFileCogOutline,
    mdiFileDocumentOutline,
    mdiFolderMultipleOutline,
    mdiHomeOutline,
    mdiMapOutline,
    mdiMapPlus,
    mdiProgressClock,
    mdiServerNetwork,
    mdiSourceRepository,
    mdiWeb,
} from "@mdi/js";
import type { MenuPage } from "@worldlens/viewer";
import MapView from "./components/MapView.vue";
import { HomeScreen } from "./components/home/index.js";
import ProfileManager from "./components/ProfileManager.vue";
import ZoomButtons from "./components/controls/ZoomButtons.vue";
import FreeFlightMobileControls from "./components/controls/FreeFlightMobileControls.vue";
import { ControlBar } from "./components/controlbar/index.js";
import { ConfigNotifications, ConfigScreen } from "./components/config/index.js";
import { MainMenu, provideBlueMap, useBlueMapTheme } from "./components/menu/index.js";
import { MarkerMenu } from "./components/markers/index.js";
import type { AnyMarkerSetData } from "./components/markers/markerTypes.js";
import { AppTitleBar } from "./components/shell/index.js";
import { requestReveal } from "./components/shell/revealRequests.js";
import { onDocsArticleRequested } from "./components/docs/docsLink.js";
import {
    TutorialOverlay,
    markTutorialOffered,
    requestTutorialLaunch,
    tutorialCompleted,
    tutorialOffered,
} from "./components/tutorial/index.js";
import { FirstRunSetup, WelcomeSurface } from "./components/setup/index.js";
import { AppSettings, type SettingsSectionAnchor } from "./components/settings/index.js";
import { EulaSurface } from "./components/eula/index.js";
import { WorldScreen } from "./components/world/index.js";
import { ProjectsScreen } from "./components/project/index.js";
import { CiRenderScreen } from "./components/cirender/index.js";
import { createCiRenders } from "./components/cirender/ciRenders.js";
import { resolveCiRenderBridge } from "./components/cirender/ciRenderBridge.js";
import RendersScreen from "./components/renders/RendersScreen.vue";
import { createActiveRenders } from "./components/renders/activeRenders.js";
import type { ConsoleTarget } from "./components/renders/activeRenders.js";
import { CommandPalette, usePaletteShortcut } from "./components/palette/index.js";
import type { PaletteConfigTarget } from "./components/palette/index.js";
import { AppearanceTarget } from "./components/appearance/index.js";
import { TabbedNavigation, type TabGroupSeed, type TabPage } from "./components/tabs/index.js";
import { BackupScreen } from "./components/backup/index.js";
import PagesScreen from "./components/pages/PagesScreen.vue";
import WorldRepoScreen from "./components/worldrepo/WorldRepoScreen.vue";
import PreviewScreen from "./components/preview/PreviewScreen.vue";
import { DocsPage } from "./components/docs/index.js";
import { UpdateBanner, createUpdates } from "./components/update/index.js";
import type { SettingsTarget } from "./components/world/index.js";
import { addLocalMap, profilesStore } from "./stores/profiles.js";
import { appState, blueMapApp, mapState, showMapMenu } from "./stores/bluemap.js";
import { notices, raiseNotice } from "./stores/notices.js";
import { wireProjectAutosaveNotices } from "./stores/projectAutosaveNotices.js";
import { productDisplayName } from "./stores/productName.js";

const { t } = useI18n();

/**
 * The menu components resolve the running app through this injection key (their port of
 * upstream's `$bluemap` global property), and the theme bridge maps `appState.theme` onto the
 * Vuetify MD3 theme. Both belong to the shell, so they are installed once, here.
 */
const currentApp = computed(() => blueMapApp.value);
provideBlueMap(currentApp);
useBlueMapTheme(currentApp);

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The shell is three pages behind one strip, not one screen that swaps itself out.
 *
 * Everything this application does used to happen in the same rectangle: the map filled it,
 * the wizard covered the map when no profile was chosen, and the server list arrived as an
 * overlay on top of both. Which of them you were looking at was decided by state you could
 * not see - `profilesStore.activeId === null` - so there was no way to open the wizard while
 * a map was loaded, and no way to look at the map without leaving the wizard. Tabs replace
 * that with a place you can point at: three destinations, all reachable at any time, and the
 * one you were last on restored on the next launch.
 *
 * The ids are constants rather than inline strings because each one is written three times -
 * in this list, in the template's slot name, and wherever something navigates to it - and a
 * page whose slot name has drifted from its id renders the tab system's honest "this build
 * has no content for that page" message rather than failing loudly.
 */
const PAGE_HOME = "home";
const PAGE_MAP = "map";
const PAGE_WORLD = "world";
const PAGE_PROJECTS = "projects";
const PAGE_CIRENDER = "cirender";
const PAGE_RENDERS = "renders";
const PAGE_SERVERS = "servers";
const PAGE_BACKUPS = "backups";
const PAGE_PAGES = "pages";
const PAGE_WORLDREPO = "worldrepo";
const PAGE_PREVIEW = "preview";
const PAGE_DOCS = "docs";

/**
 * A count of everything in progress, kept alive for the whole life of the shell rather than
 * only while the Renders page happens to be the active tab.
 *
 * `TabbedNavigation` renders only the active page's slot - see `DocsPage.vue`'s own comment
 * on the same mechanism - so a counter built inside `RendersScreen.vue` itself would go dark
 * the instant somebody navigated to another tab, which is exactly the discoverability gap
 * this indicator exists to close. This is a second mount of `createActiveRenders`, not a
 * second implementation of it: the tab label below and the page itself both read the same
 * three routes through the same aggregator, so the count in the tab strip can never disagree
 * with the list it leads to.
 */
const renderIndicator = createActiveRenders({ ciRenders: createCiRenders(resolveCiRenderBridge()) });
onMounted(() => {
    void renderIndicator.reconcile();
});
onUnmounted(() => {
    renderIndicator.dispose();
});
const runningRenderCount = computed(
    () =>
        renderIndicator.rows.value.filter(
            (row) => row.state === "starting" || row.state === "running" || row.state === "offer",
        ).length,
);

const pages = computed<TabPage[]>(() => [
    // First in the strip and pinned on a fresh install (see the `pinned-page-ids` binding
    // below): the one destination that represents every capability this app has, weighted
    // so a newcomer sees the single obvious next step and a returning user sees what they
    // were doing last. "Opening new tabs, people won't know where to go at first" is the
    // exact complaint this page exists to answer.
    { id: PAGE_HOME, label: t("tabs.page.home", "Home"), icon: mdiHomeOutline },
    { id: PAGE_MAP, label: t("tabs.page.map", "Map"), icon: mdiMapOutline },
    { id: PAGE_WORLD, label: t("tabs.page.world", "Make a map"), icon: mdiMapPlus },
    // Declared next to the guide because they are the two ends of one job: the guide asks
    // five questions and writes a project, and this is where every other setting that
    // project can carry actually lives. On a fresh install it is seeded into the "Rendering"
    // group rather than sitting beside the guide in the strip - see `initialGroups` below
    // for why a newcomer meets the guide and not the settings behind it.
    { id: PAGE_PROJECTS, label: t("tabs.page.projects", "Projects"), icon: mdiFolderMultipleOutline },
    // The fourth answer to "where does this render run": GitHub's machines do the work and
    // this one only uploads and downloads. It is a page rather than a radio button on the
    // guide because it is a workflow - a repository, two consents, an upload, and a run
    // watched job by job - and the guide's "where it runs" card links straight to it, so all
    // four places are named in one list without four screens to discover separately.
    { id: PAGE_CIRENDER, label: t("tabs.page.ciRender", "GitHub runners"), icon: mdiCloudSyncOutline },
    // The label itself carries the count, which is what makes this the persistent,
    // unobtrusive indicator the contract asks for: it says something is going wherever the
    // tab strip is drawn, without a toast, a badge dot with no number, or a second surface
    // fighting for attention. Zero renders in progress reads as a perfectly ordinary tab.
    {
        id: PAGE_RENDERS,
        label:
            runningRenderCount.value > 0
                ? t(
                      "tabs.page.rendersCounted",
                      { count: String(runningRenderCount.value) },
                      "Renders ({count})",
                  )
                : t("tabs.page.renders", "Renders"),
        icon: mdiProgressClock,
    },
    { id: PAGE_SERVERS, label: t("tabs.page.servers", "Maps and servers"), icon: mdiServerNetwork },
    { id: PAGE_BACKUPS, label: t("tabs.page.backups", "Backups"), icon: mdiCloudUploadOutline },
    { id: PAGE_PAGES, label: t("tabs.page.pages", "Publish to Pages"), icon: mdiWeb },
    // A world, rather than a render, going the other direction: kept in a git repository so
    // it updates incrementally instead of being re-zipped whole, and recognised again on a
    // second computer that has never touched it - see WorldRepoScreen.vue's own doc comment.
    { id: PAGE_WORLDREPO, label: t("tabs.page.worldRepo", "World repository"), icon: mdiSourceRepository },
    // The local twin of the Pages tab above: that one puts a render on somebody else's
    // static host, this one serves it straight off this computer's own disk so it can be
    // watched in a browser while it is still being rendered. See `PreviewScreen.vue`'s own
    // doc comment for the tile-caching caveat that stays on screen the whole time.
    { id: PAGE_PREVIEW, label: t("tabs.page.preview", "Watch it live"), icon: mdiEye },
    // Full-text, in-app documentation, bundled with no network needed to read it. Its own
    // tab rather than only the Info page fold the changelog uses, because unlike the
    // changelog this is a browsable, searchable set of 25-odd articles that deserves the
    // same reach as every other destination in the strip.
    { id: PAGE_DOCS, label: t("tabs.page.docs", "Docs"), icon: mdiFileDocumentOutline },
]);

/**
 * How a brand-new workspace is arranged, and why it is not twelve flat tabs.
 *
 * Twelve equal-weight destinations is what every one of the pages above deserves and not
 * what a person meeting this application deserves: the two they need on the first day sit in
 * a list with nine they will need later and one they need when stuck, all in the same
 * typeface, all the same size, none of them explaining the others. That flat list is this
 * shell's single biggest source of "cluttered", and the answer is not to delete a
 * destination - every one of them is somebody's whole reason for opening the app - but to
 * say out loud which ones belong together, which is what the tab strip's own groups are for.
 *
 * So a fresh install seeds three collapsed groups and leaves four things in front of them:
 *
 *  - **Home**, pinned by `pinned-page-ids` below and therefore outside every group, because
 *    the pinned region is what keeps the landing page at the front of the strip.
 *  - **Map** and **Make a map**, loose. They are the two things a newcomer actually does -
 *    look at a map, or make one - and putting either behind a disclosure would be answering
 *    "too much on screen" by hiding the part that is not too much.
 *  - **Docs**, loose. It is the destination somebody reaches for precisely when the rest of
 *    the strip has stopped making sense, and it is one tab: a group holding a single tab is
 *    a header that hides exactly one thing and saves exactly one row, which is an
 *    indirection charging rent it does not pay.
 *
 * The three groups are named for the job their members share, taken from what each page is
 * for rather than from where it happens to sit in the list above:
 *
 *  - **Rendering** - Projects, GitHub runners, Renders. Everything that decides how a render
 *    is set up and shows what it is doing: the settings a project carries, the fourth answer
 *    to "where does this render run", and the count of what is in flight.
 *  - **Finished maps** - Maps and servers, Publish to Pages, Watch it live. A map that
 *    already exists, and the three places it can be looked at: this application's own list
 *    of local and remote maps, somebody else's static host, and this computer serving it
 *    straight off its own disk.
 *  - **Keeping a copy** - Backups, World repository. The two ways a world or a render is put
 *    somewhere that is not this one machine: a versioned upload to GitHub, and a git
 *    repository a second computer can adopt.
 *
 * This is a default rather than a structure. Every group here can be renamed, recoloured,
 * reordered, emptied or ungrouped from the moment the strip is drawn, and that choice is what
 * gets persisted; nothing re-applies this list to a workspace that already exists, which is
 * the whole reason it is passed as a seed rather than enforced on every mount. A returning
 * user's strip is exactly the one they arranged, groups and all.
 */
const initialGroups = computed<TabGroupSeed[]>(() => [
    {
        id: "seed-rendering",
        name: t("tabs.group.seed.rendering", "Rendering"),
        color: "primary",
        collapsed: true,
        pageIds: [PAGE_PROJECTS, PAGE_CIRENDER, PAGE_RENDERS],
    },
    {
        id: "seed-finished",
        name: t("tabs.group.seed.finished", "Finished maps"),
        color: "tertiary",
        collapsed: true,
        pageIds: [PAGE_SERVERS, PAGE_PAGES, PAGE_PREVIEW],
    },
    {
        id: "seed-copies",
        name: t("tabs.group.seed.copies", "Keeping a copy"),
        color: "secondary",
        collapsed: true,
        pageIds: [PAGE_BACKUPS, PAGE_WORLDREPO],
    },
]);

const tabs = ref<InstanceType<typeof TabbedNavigation> | null>(null);

/**
 * Navigating from outside the strip.
 *
 * The palette offers the same destinations the tabs do, and finishing a render is a reason to
 * land on the map. Both go through the tab component rather than through a second copy of the
 * shell's navigation state, because two sources of truth for "which page is showing" is how a
 * palette ends up sending somebody to a screen the strip stopped drawing.
 */
function revealPage(pageId: string): void {
    tabs.value?.revealPage(pageId);
}

/**
 * The render id `WorldScreen.vue`'s own `focusRenderId` prop watches, set the moment "Renders
 * in progress" asks to open a local or container render's console.
 *
 * Cleared back to null immediately after the world page reads it, so a second **Open
 * console** for the same render - or a page revisit through the tab strip - fires the watch
 * again rather than being ignored as "no change" by Vue's own equality check on the prop.
 */
const worldFocusRenderId = ref<string | null>(null);

/**
 * "Renders in progress"'s own **Open console** action, resolved into real navigation.
 *
 * A CI render already shows on `CiRenderScreen` the moment it is reconciled - see that
 * screen's own `reconcile()`/`loadKnown()` - so revealing the page is the whole route. A
 * local or container render additionally needs `WorldScreen.vue` told which one to watch,
 * because unlike the CI screen it draws exactly one render at a time.
 */
function onOpenConsole(target: ConsoleTarget): void {
    if (target.page === "cirender") {
        revealPage(PAGE_CIRENDER);
        return;
    }
    worldFocusRenderId.value = target.focusRenderId;
    revealPage(PAGE_WORLD);
    void nextTick(() => {
        worldFocusRenderId.value = null;
    });
}

/**
 * Home reaches every workspace, not only a fresh install's.
 *
 * `TabbedNavigation`'s own seeding pins Home for a genuinely new install, because
 * `PAGE_HOME` is first in `pages` and `pinned-page-ids` names it - see that binding above.
 * A workspace saved by an earlier build never restores a tab for a page it did not know
 * about, though, so `ensurePage` is what reaches an upgrading user: it adds a pinned Home
 * tab exactly once and otherwise does nothing, on every mount, per its own doc comment on
 * `TabbedNavigation.vue`. Cheap enough to call unconditionally rather than behind a
 * one-time flag of this component's own.
 */
onMounted(() => {
    tabs.value?.ensurePage(PAGE_HOME);
});

/**
 * The autosave scheduler's own notice policy, mounted once for the whole session rather than
 * per project screen: `main/project/autosave.ts`'s quiet timer keeps running, and can flush,
 * even while nobody has the project editor open. See `stores/projectAutosaveNotices.ts` for
 * what actually gets said - almost always nothing, per the non-blocking-notification rules.
 */
const stopAutosaveNotices = wireProjectAutosaveNotices();
onUnmounted(stopAutosaveNotices);

/**
 * A glossary term's "tell me more" link asking for the Docs tab specifically.
 *
 * `DocsPage.vue` only exists once this switch lands - `TabbedNavigation.vue` renders only the
 * active page's slot - so the tab switch has to happen somewhere that stays mounted no matter
 * which page is showing, which is here. `DocsPage.vue`'s own `onMounted` reads the same
 * pending target and opens the actual article; this only gets the tab in front of it.
 */
onDocsArticleRequested(() => revealPage(PAGE_DOCS));

/**
 * Which page is on screen, for the chrome that belongs to one of them.
 *
 * Read back from the tab component rather than mirrored here. Only the shell-level furniture
 * needs it: everything inside a page slot already knows, because a slot that is not the active
 * one is never rendered at all.
 */
const mapPageActive = computed(() => tabs.value?.activePage?.id === PAGE_MAP);

/**
 * Opening a link the application does not draw itself.
 *
 * `window.open` rather than a bridge call: the shell denies the popup and hands the URL to
 * the system browser, which is the one route that already refuses anything that is not
 * HTTPS. A renderer that opened URLs itself would be a second policy to keep in step.
 */
/**
 * The updater, mounted once for the whole shell.
 *
 * One controller, because two would each check on their own schedule and each stage their
 * own copy - and the banner and the settings row would then disagree about what is ready.
 * A refusal becomes an ordinary notice rather than a thrown error: "a render is running"
 * is a sentence, not a fault.
 */
const updates = createUpdates({
    onRefusal: (message: string) => {
        raiseNotice("warning", message);
    },
});
const restartingForUpdate = ref(false);

async function restartForUpdate(): Promise<void> {
    restartingForUpdate.value = true;
    try {
        await updates.restart();
    } finally {
        restartingForUpdate.value = false;
    }
}

function openInBrowser(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Restoring a backup, which is the downloads surface's job and not a second downloader.
 *
 * The backup screen has already chosen the release and the asset; the settings surface is
 * where the parts are fetched, verified against their published digests and rejoined. This
 * only carries the choice there and says what happened, because a Restore button that
 * silently changes a screen the person is not looking at reads as a button that did
 * nothing.
 */
function revealBackupRestore(where: { owner: string; repo: string; tag: string; asset: string }): void {
    openSettings();
    raiseNotice(
        "info",
        t(
            "backup.restoreHandoff",
            { asset: where.asset, repo: `${where.owner}/${where.repo}` },
            "Downloads is open. Fetch {asset} from {repo} there: every part is checked against its published digest before anything is written.",
        ),
    );
}

/* -------------------------------------------------------------------------- */
/* Making a map                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A finished render becomes an entry in the same map list a remote server uses, and is
 * opened by making it active. The viewer needs no idea which of the two it is looking at:
 * the profile carries the data root, and `LocalMapHandler` serves it off the disk.
 */
function openRenderedMap(dataRoot: string, mapIds: readonly string[]): void {
    const label = mapIds.length > 0 ? mapIds.join(", ") : t("world.rendered", "Rendered map");
    const profile = addLocalMap(dataRoot, label);
    profilesStore.activeId = profile.id;
}

/**
 * A map that GitHub's runners produced, opened exactly as a local render's is.
 *
 * By the time this fires the map has already been downloaded and registered on this
 * machine, so there is no second case to handle: the profile carries a data root and the
 * viewer neither knows nor needs to know which of the four places drew the tiles.
 */
function openCiRenderedMap(where: { renderId: string; dataRoot: string; mapId: string }): void {
    openRenderedMap(where.dataRoot, [where.mapId]);
}

/**
 * Which world's project the projects page should open when it gets there.
 *
 * The guide writes a project and offers to open it, and the world somebody chose may
 * already have had one. Both land here, and the page reads it as a prop rather than being
 * called as a component: a tab panel that is not the active one is never rendered, so at
 * the moment this decides to navigate there is no component to call a method on.
 */
const projectToOpen = ref<string | null>(null);

function openProject(world: string): void {
    projectToOpen.value = world;
    revealPage(PAGE_PROJECTS);
}

/**
 * Choosing a map takes you to the map.
 *
 * The two places that set an active profile - the wizard finishing a render, and a row in the
 * maps-and-servers list - are both on a different page from the one the map draws on, so
 * without this the user's chosen map would load correctly and invisibly behind whichever page
 * they were still looking at. Watching the store rather than calling this from both sites is
 * what keeps a third caller from having to remember.
 */
watch(
    () => profilesStore.activeId,
    (id) => {
        if (id !== null) revealPage(PAGE_MAP);
    },
);

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const settingsOpen = ref(false);
/**
 * `SettingsSectionAnchor` rather than the narrower `SettingsAnchor`: a render failure can
 * only ever point at the four bridge-reachable anchors, but this shell also opens the
 * surface at sections a render never points at - GitHub sign-in among them, from the
 * CI-render screen's "Open the GitHub sign-in" button. `openSettings()` with no argument
 * used to be the only way that button's `signIn` emit was wired, which opened the sheet
 * without ever switching to, scrolling to or focusing the sign-in row - a click that looked
 * like it worked and left the person exactly where they started.
 */
const settingsAnchor = ref<SettingsSectionAnchor | null>(null);
const settingsMissing = ref(false);

/**
 * Bumped every time the settings surface closes.
 *
 * The shell is the only thing that knows this happened. Settings is an in-app dialog rather
 * than another window, so a surface underneath it sees no focus or visibility event when it
 * closes - and the Mojang download consent, which the wizard and the projects screen both
 * point people at, is changed inside it.
 *
 * That was a real defect: the review step warned that consent was missing, its
 * **Open the setting** button opened Settings, accepting there worked and persisted, and
 * the warning stayed for the life of the window because consent had been sampled once at
 * mount and never read again. The counter is how the surfaces underneath find out.
 * `components/world/consentState.ts` records why this is a fallback for a shared store.
 */
const settingsEpoch = ref(0);

watch(settingsOpen, (open) => {
    if (!open) settingsEpoch.value += 1;
});

function openSettings(anchor: SettingsSectionAnchor | null = null, missing = false): void {
    settingsAnchor.value = anchor;
    settingsMissing.value = missing;
    settingsOpen.value = true;
}

/**
 * A render that failed for a fixable reason says which setting would fix it. This is the
 * other end of that: it opens the surface *and* reveals the exact control, because
 * landing somebody on a settings page and leaving them to find the row is the difference
 * between a remedy and a hint.
 */
function revealSetting(target: SettingsTarget): void {
    openSettings(target.anchor, target.missing);
}

/* -------------------------------------------------------------------------- */
/* Licence viewer                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The standalone docked licence panel, alongside its two embedded copies (the first-run
 * licence step and the consent settings row). `EulaSurface` documents itself as "mount one
 * in the shell and open it from anywhere" - this is that mount, and the "anywhere" is two
 * routes rather than a permanent button: the licence card on Home, and the command
 * palette's own row, reachable with Ctrl+Shift+F from any screen. It used to have a FAB in
 * the corner stack below as well, which made four floating buttons on every screen for a
 * document most people read once; the two workbench controls kept their buttons and this
 * panel kept its reachability.
 */
const eulaOpen = ref(false);

/* -------------------------------------------------------------------------- */
/* "What is this?"                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The standalone "what is this?" panel, alongside first-run setup's own welcome step.
 * `WelcomeSurface` is `EulaSurface`'s twin: "mount one in the shell and open it from
 * anywhere", and this is that mount. Its "anywhere" is the same pair of routes the licence
 * panel's is - the introduction card on Home, and the command palette row - rather than a
 * fourth permanent FAB. It is how the welcome step's content stays reachable once setup is
 * complete and never shown again unprompted - exactly as `firstRunFlow.ts` intends
 * first-run setup itself to behave.
 */
const welcomeOpen = ref(false);

/**
 * "Start here" was pressed inside the panel: close it and land directly on the wizard,
 * skipping Home on purpose. Pressing this button is a deliberate, explicit "take me
 * straight there" from someone already reading the panel's own description of the
 * wizard - unlike `onFirstRunFinished` below, which is not a button press at all and
 * lands a first-time user on Home instead, where that same destination is one click away
 * as the hero card.
 */
function onWelcomeStart(): void {
    revealPage(PAGE_WORLD);
}

/**
 * First-run setup finished for real - not merely dismissed after a failure.
 *
 * This used to call `revealPage(PAGE_WORLD)` directly, which landed a brand-new install
 * straight on the wizard and skipped Home - the one screen built to answer "where do I
 * start" - every single time a person actually finished setup. Home is `pages`' own first
 * entry, seeded pinned and already active on a genuinely fresh workspace (see
 * `seedStrip()` in `TabbedNavigation.vue`), so `revealPage(PAGE_HOME)` here either
 * confirms that seed or, on an upgrading install whose saved layout was last left
 * somewhere else, brings the person back to it - `onMounted`'s `ensurePage(PAGE_HOME)`
 * above guarantees the tab exists by the time this can ever fire. This handler only runs
 * once, the instant a first-time user's own setup completes, so it can never pull a
 * returning user back from wherever their persisted workspace already had them.
 *
 * The welcome step's "start here" pointer still names "Make a map" as the next step - see
 * `welcome.startHere` - and that promise still holds: Home's own hero card is that same
 * destination, weighted `primary`, exactly one click away.
 */
function onFirstRunFinished(): void {
    revealPage(PAGE_HOME);
}

/* -------------------------------------------------------------------------- */
/* Offering the interactive tour, exactly once                                */
/* -------------------------------------------------------------------------- */

/**
 * A single, dismissible, non-blocking invitation - never a second one.
 *
 * Raised on mount rather than tied to first-run finishing, because "offered" has to cover
 * two different people: somebody on a brand-new install (first-run setup may well be showing
 * at the same moment; this toast never blocks it and never steals its focus) and somebody who
 * already finished first-run setup on an earlier build before this feature existed, whose
 * next ordinary launch is the only "first time this could have been offered" they will ever
 * have. `tutorialOffered()` is checked and `markTutorialOffered()` is called in the same
 * breath specifically so a page that mounts this component twice - a test, a hot reload -
 * cannot raise it twice either.
 *
 * `tutorialCompleted()` is also checked, for the person who reached the tour through Info,
 * Docs or the palette before this toast ever got a chance to fire: having already taken the
 * tour is a stronger reason not to invite them again than merely having seen the invitation.
 */
onMounted(() => {
    if (tutorialOffered() || tutorialCompleted()) return;
    markTutorialOffered();
    raiseNotice(
        "info",
        t(
            "tutorial.offer.message",
            "New to BlueMap? There is a short interactive tour that walks through finding a world, rendering it and opening the result.",
        ),
        {
            actions: [
                {
                    id: "start-tour",
                    label: t("tutorial.launch.start", "Take the tour"),
                    run: () => requestTutorialLaunch(),
                },
            ],
        },
    );
});

/* -------------------------------------------------------------------------- */
/* Server configuration                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The options editor, which is a workbench rather than a page.
 *
 * Seven screens, a search that reaches every setting on all of them, and a save plan that
 * states what is about to be written - so it keeps the full-bleed host it has always had,
 * covering the whole shell including the tab strip, rather than becoming a fourth tab. That
 * is deliberate: a tab is somewhere you leave and come back to, and this is a surface you
 * either save or abandon. Escape is the way out, and the tab strip underneath is made inert
 * while it is open so nothing behind an opaque surface can still be reached with Tab.
 */
const configOpen = ref(false);
const configHost = ref<HTMLElement | null>(null);
const pendingConfigScreen = ref<PaletteConfigTarget>(null);

/**
 * The button is found by id rather than by a template ref because it is a tooltip
 * activator, and `v-bind="tooltipProps"` carries a `ref` of Vuetify's own that quietly
 * wins over one written beside it - leaving the ref null and the focus on `<body>`. The id
 * is generated rather than spelled out so nothing else in the document can collide with it.
 */
const configFabId = useId();

function openConfig(screen: PaletteConfigTarget = null): void {
    pendingConfigScreen.value = screen;
    configOpen.value = true;
    // The host is focused so Escape works from the first keystroke. Left alone, focus stays
    // on the button the surface has just covered, and the key that closes this only works
    // once the user has clicked something inside it.
    void nextTick(() => configHost.value?.focus());
}

/** Escape and a finished save both land here, and focus goes back to the button that opened it. */
function closeConfig(): void {
    configOpen.value = false;
    pendingConfigScreen.value = null;
    void nextTick(() => document.getElementById(configFabId)?.focus());
}

/* -------------------------------------------------------------------------- */
/* Command palette                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One shortcut over every command, setting and destination the app has.
 *
 * It opens nothing itself. Every destination it offers emits back to this component, so
 * the code that actually opens these surfaces stays in the one place that already owns it
 * rather than being copied into a second component that would then drift out of step -
 * which is how a palette ends up sending somebody to a screen the shell stopped using.
 *
 * `usePaletteShortcut` binds the window in the capture phase, so the chord works from
 * inside a text field, and calls `preventDefault` only when it actually matched.
 */
const paletteOpen = ref(false);
usePaletteShortcut(paletteOpen);

/**
 * The changelog, which is a fold inside the viewer's own Info page.
 *
 * Two steps rather than one, because the fold is two surfaces down: the menu has to be showing
 * that page before there is a fold to expand. The page is opened here, the way every other menu
 * destination in the palette opens one, and the request tells the page itself to expand and
 * scroll to it. The palette does not offer this row at all without a viewer running, so the
 * guard here is belt and braces rather than the thing keeping it honest.
 */
function openChangelog(): void {
    const app = blueMapApp.value;
    if (app === null) return;
    app.appState.menu.openPage("info", () => t("info.title", "Info"));
    void nextTick(() => {
        requestReveal("changelog");
    });
}

/**
 * A save happened, so the editor steps out of the way and says where it wrote.
 *
 * `saved(folder)` exists so a shell can offer to start a render, and this one deliberately
 * does not: nothing yet takes a config folder to the render engine, and an offer that
 * leads nowhere is worse than no offer. The folder is named because it is the one fact the
 * user cannot recover once this surface closes over it.
 */
function configSaved(folder: string): void {
    closeConfig();
    raiseNotice(
        "success",
        t("config.saved", { folder }, "Saved the BlueMap configuration in {folder}."),
    );
}

/* -------------------------------------------------------------------------- */
/* Viewer chrome                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `appState.controls.state` is the single source of truth for the view mode. It is written
 * only at the end of a view transition, so read it, never mirror it.
 */
const freeFlight = computed(() => appState.value?.controls.state === "free");

/**
 * The free-flight cluster is gated on the map page as well as on the view mode, because the
 * shell's own button column has to step above it and that column is on screen whatever page
 * is showing. Gate only on the mode and the buttons lift over an empty corner whenever
 * somebody in free flight looks at the server list.
 */
const showFreeFlightControls = computed(
    () => mapPageActive.value && mapState.value === "loaded" && freeFlight.value,
);

const showZoomButtons = computed(
    () =>
        showMapMenu.value &&
        (appState.value?.controls.showZoomButtons ?? false) &&
        !freeFlight.value,
);

/** Upstream renders the map state as `$t("map." + mapState)`; these are the en.conf strings. */
const MAP_STATE_FALLBACK: Record<string, string> = {
    unloaded: "No map loaded.",
    loading: "Loading map...",
    errored: "There was an error trying to load this map!",
};

const mapStateMessage = computed(() =>
    t("map." + mapState.value, MAP_STATE_FALLBACK[mapState.value] ?? mapState.value),
);

/**
 * The map's own chrome is for a map, and now the page it belongs to says so.
 *
 * Its "is there anything behind this to zoom, tilt or drop a marker on" question used to be
 * answered by `!showWorldScreen`; the control bar lives inside the map page's slot now, and a
 * slot that is not the active one is never rendered, so the page answers it instead. What is
 * left is the case a page boundary cannot see: the options editor is an opaque surface laid
 * over the whole shell, and the control bar is `z-index: 3` against its `auto`, so without
 * this it would float on top of the editor aiming at a map nobody can see.
 */
const showViewerChrome = computed(() => !configOpen.value);

/**
 * `MenuPage` carries page data behind an index signature, so the marker set the page was
 * opened with arrives as `unknown`.
 */
function pageMarkerSet(page: MenuPage | null | undefined): AnyMarkerSetData | null {
    return (page?.markerSet as AnyMarkerSetData | undefined) ?? null;
}
</script>

<template>
    <v-app class="mb-app">
        <!--
            The window's own chrome. Frameless means the operating system draws no caption
            bar, so this is it; in a browser build the component renders nothing at all.

            It is the first appearance target because it is the first thing a person sees and
            the one piece of chrome that is on screen no matter what they are doing.
        -->
        <AppearanceTarget
            id="app.titleBar"
            :label="t('appearance.target.app.titleBar', 'The window title bar')"
            as="div"
        >
            <AppTitleBar :title="productDisplayName" />
        </AppearanceTarget>

        <!--
            Under the title bar and above everything else, because an update that is ready
            is worth seeing and worth nothing if it interrupts. It never covers a page, and
            it waits: restarting is the person's decision and the render guard is re-read
            at the moment they press it.
        -->
        <UpdateBanner
            :model="updates.banner.value"
            :busy="restartingForUpdate"
            @restart="restartForUpdate"
            @dismiss="updates.dismiss()"
            @open-notes="openInBrowser"
        />

        <v-main class="mb-main">
            <!--
                The viewer, which renders into #map-container rather than into this tree, so
                it stays mounted at shell level and keyed on the profile exactly as before.
                Putting it inside the map page's slot would dispose the whole renderer every
                time somebody glanced at another tab.
            -->
            <MapView v-if="profilesStore.activeId" :key="profilesStore.activeId" />

            <!--
                The strip and its pages. Made inert rather than unmounted while the options
                editor is open, for the same reason the editor's own comment gives: the page
                behind an opaque surface must not still be reachable with Tab, and tearing it
                down would lose whatever step of the wizard somebody was on.
            -->
            <div class="mb-shell-tabs" :inert="configOpen">
                <AppearanceTarget
                    id="app.tabBar"
                    :label="t('appearance.target.app.tabBar', 'The tab bar')"
                    as="div"
                >
                    <TabbedNavigation
                        ref="tabs"
                        class="mb-shell-primary-tabs"
                        panel-pass-through
                        :pages="pages"
                        :pinned-page-ids="[PAGE_HOME]"
                        :initial-groups="initialGroups"
                    >
                        <!--
                            Home draws no canvas and owns no shell-level state, so its page
                            slot is a thin, scrollable host - the same shape every other
                            non-map page here uses. Every destination it offers emits back to
                            this component, exactly as `WorldScreen` and `ProjectsScreen`
                            already do, so the code that actually opens a surface stays in
                            the one place that already owns it.
                        -->
                        <template #home>
                            <div class="mb-world-host mb-interactive">
                                <HomeScreen
                                    @reveal-page="revealPage"
                                    @open-settings="openSettings($event)"
                                    @open-config="openConfig($event)"
                                    @open-eula="eulaOpen = true"
                                    @open-welcome="welcomeOpen = true"
                                    @open-palette="paletteOpen = true"
                                />
                            </div>
                        </template>

                        <!--
                            The map page draws nothing of its own: the canvas is behind the
                            whole application layer, so this page is a transparent,
                            click-through frame that lets the map be dragged and carries the
                            chrome that only makes sense over one.
                        -->
                        <template #map>
                            <div class="mb-map-page">
                                <FreeFlightMobileControls v-if="showFreeFlightControls" />
                                <ZoomButtons v-if="showZoomButtons" />

                                <ControlBar v-if="showViewerChrome" />

                                <div v-if="mapState !== 'loaded'" class="mb-map-state">
                                    <!--
                                        The live region is the sentence and only the sentence.
                                        A button inside it would be re-announced every time the
                                        map moved between loading, loaded and errored, which
                                        turns a status update into a repeated instruction.
                                    -->
                                    <p class="mb-map-state__line" role="status" aria-live="polite">
                                        {{ mapStateMessage }}
                                    </p>

                                    <!--
                                        "No map loaded." names a state and not the one action
                                        that leaves it. With nothing chosen at all the message
                                        keeps its own tab company: the strip already offers the
                                        wizard, and this puts the same door where the person is
                                        actually looking.
                                    -->
                                    <v-btn
                                        v-if="profilesStore.activeId === null"
                                        class="mb-interactive"
                                        variant="tonal"
                                        :prepend-icon="mdiMapPlus"
                                        @click="revealPage(PAGE_WORLD)"
                                    >
                                        {{ t("tabs.page.world", "Make a map") }}
                                    </v-btn>
                                </div>

                                <!--
                                    The menu owns the page stack (`appState.menu`), which the
                                    control bar pushes onto, so it belongs to the same page the
                                    control bar does. Its "markers" page is a slot because the
                                    marker list lives in its own component; `page.markerSet` is
                                    whatever the opener put there, which is the root set for the
                                    Markers button and the `bm-players` set for the Players one.
                                -->
                                <MainMenu
                                    @open-docs="revealPage(PAGE_DOCS)"
                                    @open-tutorial="requestTutorialLaunch()"
                                >
                                    <template #markers="{ page, menu }">
                                        <MarkerMenu
                                            v-if="blueMapApp"
                                            :app="blueMapApp"
                                            :menu="menu"
                                            :marker-set="pageMarkerSet(page)"
                                        />
                                    </template>
                                </MainMenu>
                            </div>
                        </template>

                        <!--
                            The wizard is taller than a short window, so it keeps its own
                            scroll container: the step buttons must never be the thing that
                            ends up off-screen.
                        -->
                        <template #world>
                            <div class="mb-world-host mb-interactive">
                                <WorldScreen
                                    :settings-epoch="settingsEpoch"
                                    :can-open-ci="true"
                                    :focus-render-id="worldFocusRenderId"
                                    @consent="openSettings('mojang-download-consent')"
                                    @settings="revealSetting"
                                    @open-map="openRenderedMap"
                                    @open-project="openProject"
                                    @open-ci-render="revealPage(PAGE_CIRENDER)"
                                />
                            </div>
                        </template>

                        <!--
                            Projects: the settings a world renders with, all of them, before
                            a render starts. Its own scroll container for the same reason the
                            guide has one - the editor is far taller than a short window, and
                            the Save button must never be the thing that ends up off-screen.
                        -->
                        <template #projects>
                            <div class="mb-world-host mb-interactive">
                                <ProjectsScreen
                                    :settings-epoch="settingsEpoch"
                                    :open-world="projectToOpen"
                                    @consent="openSettings('mojang-download-consent')"
                                    @settings="revealSetting"
                                    @open-map="openRenderedMap"
                                />
                            </div>
                        </template>

                        <!--
                            Rendering on GitHub's runners: the answer for a machine that
                            cannot render a large world at all. Its own page rather than a
                            fourth choice on the guide, because it is a workflow with a
                            repository, two consents and a run to watch - and it refuses
                            before packing anything when a world would exceed a release
                            asset's ceiling, which is a message worth arriving early.

                            `rendered` carries a map that has already been downloaded and
                            registered, so it is opened exactly as a local render's is.
                            Mojang's licence is deliberately not accepted on that screen;
                            it points at the settings row that already asks.
                        -->
                        <template #cirender>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <CiRenderScreen
                                        :can-open-settings="true"
                                        @sign-in="openSettings('github-account')"
                                        @open-consent="openSettings('mojang-download-consent')"
                                        @open="openInBrowser"
                                        @rendered="openCiRenderedMap"
                                    />
                                </div>
                            </div>
                        </template>

                        <!--
                            Every render this application knows about, on any of its three
                            routes, including one this app did not start this session - a
                            container found running from an earlier launch, or a render on
                            GitHub's runners entirely independent of this window. Its own page
                            rather than folded into the world guide, so navigating away from
                            wherever a render was started never again means losing sight of
                            it: this page, and the tab label's own live count above, are both
                            reachable regardless of which screen a render was watched from.
                        -->
                        <template #renders>
                            <div class="mb-world-host mb-interactive">
                                <RendersScreen @open-console="onOpenConsole" />
                            </div>
                        </template>

                        <!--
                            The list is a card rather than a full-width screen, so it is
                            centred in its page instead of stretched across it. Its Close
                            button now goes back to the map, which is the only thing "close"
                            can honestly mean on a page that cannot be dismissed.
                        -->
                        <template #servers>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <ProfileManager @close="revealPage(PAGE_MAP)" />
                                </div>
                            </div>
                        </template>

                        <!--
                            Backing a world or a rendered map up to GitHub release assets.
                            Restoring is deliberately not a second downloader: the screen
                            names the release it wants and the existing downloads surface,
                            which already verifies every part against its published digest,
                            is what fetches it.
                        -->
                        <template #backups>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <BackupScreen
                                        :can-open-settings="true"
                                        @sign-in="openSettings()"
                                        @open="openInBrowser"
                                        @restore="revealBackupRestore"
                                    />
                                </div>
                            </div>
                        </template>

                        <template #pages>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <PagesScreen @open="openInBrowser" />
                                </div>
                            </div>
                        </template>

                        <!--
                            A world going the other direction, incrementally: synced into a
                            git repository rather than re-zipped whole, and recognised again
                            on a second computer that never touched it. `adopted` lands on the
                            same Projects page a finished guide run does, open at the world
                            just written - the natural next step once a project exists there.
                        -->
                        <template #worldrepo>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <WorldRepoScreen
                                        @open="openInBrowser"
                                        @open-settings="(anchor) => openSettings(anchor)"
                                        @adopted="openProject"
                                    />
                                </div>
                            </div>
                        </template>

                        <!--
                            The local twin of the Pages tab above. `PreviewScreen.vue` drives
                            its own bridge and IPC channel directly - there is no URL for the
                            shell to open externally here, because opening a loopback address
                            through the same https-only door Pages uses would silently do
                            nothing (see `main/preview/ipc.ts`'s own `openExternal` doc
                            comment), so this screen calls the main process itself instead.
                        -->
                        <template #preview>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <PreviewScreen />
                                </div>
                            </div>
                        </template>

                        <!--
                            Every article under docs/, bundled at build time and rendered
                            through the app's one shared Markdown renderer. Its own scroll
                            container for the same reason every other tall page here has one.
                        -->
                        <template #docs>
                            <div class="mb-world-host mb-interactive">
                                <DocsPage />
                            </div>
                        </template>
                    </TabbedNavigation>
                </AppearanceTarget>
            </div>

            <!--
                The options editor gets a full-bleed host of its own, painted over the tab
                strip and everything under it. `tabindex="-1"` is what lets the region hold
                focus, so Escape reaches it before anything inside has been clicked.
            -->
            <div
                v-if="configOpen"
                ref="configHost"
                class="mb-world-host mb-interactive"
                tabindex="-1"
                role="region"
                :aria-label="t('config.title', 'Server configuration')"
                @keydown.esc="closeConfig"
            >
                <ConfigScreen
                    :initial-screen="
                        pendingConfigScreen !== null && typeof pendingConfigScreen === 'object'
                            ? pendingConfigScreen.screen
                            : (pendingConfigScreen ?? 'core')
                    "
                    :initial-field-path="
                        pendingConfigScreen !== null && typeof pendingConfigScreen === 'object'
                            ? pendingConfigScreen.fieldPath
                            : null
                    "
                    @consent="openSettings('mojang-download-consent')"
                    @saved="configSaved"
                />
            </div>

            <!--
                Shell-only controls: settings and the options editor have no upstream
                counterpart, so they are not in the ported menu, and neither of them is a
                page. The server list used to have a button here too and no longer does -
                it is a tab now, and a floating button that opens what a tab already opens is
                two navigation models arguing in the same corner of the screen. The licence
                panel and "what is this?" used to stack two more buttons here for the same
                bad trade: four permanent buttons on every screen, two of them for panels
                most people open once. Both panels keep their Home cards and gained a
                command-palette row each, so the stack holds only the two workbench
                controls somebody reaches for repeatedly.
            -->
            <div
                class="mb-shell-fabs"
                :class="{ 'mb-shell-fabs--lifted': showFreeFlightControls }"
            >
                <v-tooltip :text="t('settings.title', 'Settings')" location="end">
                    <template #activator="{ props: tooltipProps }">
                        <v-btn
                            v-bind="tooltipProps"
                            class="mb-shell-fab mb-interactive"
                            :icon="mdiCog"
                            color="surface"
                            variant="flat"
                            elevation="3"
                            :aria-label="t('settings.title', 'Settings')"
                            :aria-expanded="settingsOpen"
                            @click="openSettings()"
                        />
                    </template>
                </v-tooltip>

                <v-tooltip :text="t('config.title', 'Server configuration')" location="end">
                    <template #activator="{ props: tooltipProps }">
                        <v-btn
                            :id="configFabId"
                            v-bind="tooltipProps"
                            class="mb-shell-fab mb-interactive"
                            :icon="mdiFileCogOutline"
                            color="surface"
                            variant="flat"
                            elevation="3"
                            :aria-label="t('config.title', 'Server configuration')"
                            :aria-expanded="configOpen"
                            @click="configOpen ? closeConfig() : openConfig()"
                        />
                    </template>
                </v-tooltip>
            </div>

            <AppSettings
                :open="settingsOpen"
                :anchor="settingsAnchor"
                :anchor-missing="settingsMissing"
                :updates="updates"
                @update:open="settingsOpen = $event"
            />

            <!--
                The standalone route `EulaSurface`'s own doc comment describes: a docked panel
                the user can place, opened from the licence card on Home and from the command
                palette's own row rather than only reachable through the first-run step or the
                consent settings row.
            -->
            <EulaSurface :open="eulaOpen" @update:open="eulaOpen = $event" />

            <!--
                `WelcomeSurface`'s own twin route: the welcome step's "what is this?"
                content, reachable from Home's introduction card and the command palette
                rather than only met once at first run. Its "Start here" button is the live
                half of the wizard pointer the welcome step can only ever describe.
            -->
            <WelcomeSurface
                :open="welcomeOpen"
                @update:open="welcomeOpen = $event"
                @start="onWelcomeStart"
            />

            <!--
                Every destination emits back here rather than opening anything itself, so
                the shell keeps one copy of the code that opens each surface.
            -->
            <CommandPalette
                :open="paletteOpen"
                :pages="pages"
                :can-route-config-screens="true"
                @update:open="paletteOpen = $event"
                @reveal-setting="revealSetting"
                @open-settings="openSettings()"
                @open-config="openConfig($event)"
                @open-profiles="revealPage(PAGE_SERVERS)"
                @open-page="revealPage($event)"
                @open-notice-centre="requestReveal('noticeCentre')"
                @open-tab-finder="requestReveal('tabFinder')"
                @open-changelog="openChangelog"
                @open-tutorial="requestTutorialLaunch()"
                @open-eula="eulaOpen = true"
                @open-welcome="welcomeOpen = true"
            />
        </v-main>

        <!--
            First-run setup decides for itself whether this is a first launch and stays
            invisible when it is not. It is mounted outside v-main so its blocking dialog -
            the only one in this application - is never a child of a click-through layer.
        -->
        <FirstRunSetup @finished="onFirstRunFinished" />

        <!--
            The interactive tour: a highlighted control and a card of text beside it, never a
            backdrop and never blocking. Mounted here for the same reason `CommandPalette` and
            `ConfigNotifications` are - it is asked to open from three places that are nowhere
            near each other in this tree (Info, the docs browser, the command palette row
            above), via `requestTutorialLaunch()`, and it drives the tab strip itself through
            `revealPage` as its steps advance.
        -->
        <TutorialOverlay :reveal-page="revealPage" />

        <!--
            The one notification corner, mounted for the same reason and in the same place:
            it is fixed to the bottom-right at z-index 2400 and must stack above everything,
            never as a child of the click-through layer. It lives here rather than inside the
            options editor so a message outlives the screen that raised it - a save that
            closes that surface can still report where it wrote. Exactly one instance reads
            the shared queue; a second would show every notice twice.
        -->
        <ConfigNotifications :state="notices" />
    </v-app>
</template>

<style scoped>
/*
 * Layering, pointer-events and the map/chrome stacking order all live in styles/global.scss,
 * because they are properties of the #app / #map-container pair rather than of this component.
 */

/*
 * The tabbed shell fills the map area and is click-through by default, exactly as v-main is:
 * the map canvas is behind the whole application layer, and a full-bleed navigation container
 * that swallowed pointer events would make the map undraggable everywhere except the gaps
 * between the floating controls. The strip and each page opt back in individually below.
 */
.mb-shell-tabs {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    pointer-events: none;
}

/*
 * The appearance wrapper is `display: contents` until somebody gives it a background, a border
 * or a padding to paint, at which point it becomes a real box - and a box between the flex
 * container and the tab shell would leave the panel with no height to fill. This gives it the
 * same shape the element it replaced had, so styling the tab bar cannot collapse the pages
 * underneath it.
 */
.mb-shell-tabs > .mb-appearance-target--box {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-block-size: 0;
}

.mb-shell-tabs :deep(.mb-shell-primary-tabs) {
    flex: 1 1 auto;
    min-block-size: 0;
}

/* Real chrome, so it takes pointer events, and it never gives up height to the panel. */
.mb-shell-tabs :deep(.mb-shell-primary-tabs > .mb-tabs-strip-row) {
    flex: 0 0 auto;
    pointer-events: auto;
}

/*
 * Positioned so a page can fill it with `inset: 0` and own its own scrolling, and left
 * click-through so the map page can hand a drag straight to the canvas. A page that wants
 * events asks for them with `.mb-interactive`, which is the same bargain every floating
 * control in this shell already makes.
 */
.mb-shell-tabs :deep(.mb-tabs__panel--pointer-passthrough) {
    position: relative;
}

/*
 * Every tab closed. The tab system's empty state offers a button per page, and a button in a
 * click-through layer is a button nobody can press; it also needs a surface of its own,
 * because centred text floating over a map render is text nobody can read.
 */
.mb-shell-tabs :deep(.mb-tabs__empty--pointer-interactive) {
    background: rgb(var(--v-theme-background));
}

/*
 * The control bar anchors itself under the title bar with `position: fixed`, which was right
 * when it was the topmost thing in the window and would now paint straight over the tab strip.
 * Inside the map page it becomes absolute instead, so it sits at the top of whatever space the
 * strip leaves rather than at a measured offset that would have to be kept in step with it.
 */
.mb-shell-tabs :deep(.mb-cb) {
    position: absolute;
    top: 0;
}

/*
 * The map page paints nothing: the canvas is a sibling of #app and shows through. Filling the
 * panel rather than sitting in its flow is what gives the control bar above something with the
 * panel's own geometry to anchor against.
 */
.mb-map-page {
    position: absolute;
    inset: 0;
}

.mb-map-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    max-width: min(90vw, 40rem);
    padding: 0 1rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
    text-align: center;
    text-wrap: balance;
    pointer-events: none;
}

.mb-map-state__line {
    margin: 0;
}

/*
 * Opaque on purpose. There is no map behind the wizard or the server list once the page is
 * on screen - and where there is one, showing it faintly through a form is worse than not
 * showing it at all - so a translucent panel would read as a rendering fault rather than as
 * a surface. Also the options editor's host, where it covers the whole shell.
 *
 * `padding-inline-start` reserves a permanent gutter the width of `.mb-shell-fabs` (12px
 * inset + 48px button = 60px, plus 16px of breathing room) below. `.mb-shell-fabs` is
 * `position: fixed`, so it always paints over whatever this host has scrolled to; without
 * this, any heading or paragraph that starts flush at the left edge could land in the same
 * fixed viewport band as an opaque button and lose its leading characters underneath it -
 * confirmed across nine screenshots, the worst of them a radio button sitting under the
 * gear icon at higher display scales. The gutter runs the container's whole scrollable
 * height rather than only its top, because scrolling can carry any part of the content
 * into that fixed band, not only whatever is on screen when it first opens. `.mb-shell-fab`
 * below is the 48px this number must never drift under.
 */
.mb-world-host {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: rgb(var(--v-theme-background));
    padding-inline-start: calc(76px + env(safe-area-inset-left, 0px));
}

/* The maps-and-servers card has its own width, so its page centres it rather than stretching it. */
.mb-shell-centre {
    display: flex;
    justify-content: center;
    padding: 16px;
}

/*
 * Clear of the tab strip, not on top of it.
 *
 * This stack is `position: fixed` in the bottom-left corner, which was the empty corner
 * when the strip ran along the top of the window. The strip's default placement is the left
 * edge, so that corner belongs to the strip now: a real capture of the running application
 * shows the configuration button drawn over the strip's own overflow and search controls,
 * and a tab that reaches that far down is a tab whose click the button intercepts.
 *
 * `--mb-tabs-strip-inline-size` is published by `TabStrip.vue` from its own measured width,
 * and is `0px` for every placement that leaves the left edge alone - so a top, bottom or
 * right strip puts these buttons back exactly where they have always been. The fallback is
 * `0px` for the same reason: a build that somehow renders no strip at all should not push
 * its buttons into the middle of the window.
 *
 * `.mb-world-host`'s own 76px gutter still covers these buttons where they land, because
 * that gutter is measured from the page panel's left edge and the panel begins where the
 * strip ends.
 */
.mb-shell-fabs {
    position: fixed;
    left: calc(12px + var(--mb-tabs-strip-inline-size, 0px) + env(safe-area-inset-left, 0px));
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/*
 * The free-flight movement cluster takes the bottom-left corner, so this steps above it.
 * The sizes come from the shared tokens in global.scss so the two cannot drift apart.
 */
.mb-shell-fabs--lifted {
    bottom: calc(
        24px + env(safe-area-inset-bottom, 0px) + 2 * var(--mb-ff-size) + var(--mb-ff-gap)
    );
}

.mb-shell-fab {
    width: 48px;
    height: 48px;
    opacity: 0.94;
}

.mb-shell-fab:hover,
.mb-shell-fab:focus-visible {
    opacity: 1;
}

.mb-shell-fab :deep(.v-icon) {
    color: rgb(var(--v-theme-primary));
}
</style>

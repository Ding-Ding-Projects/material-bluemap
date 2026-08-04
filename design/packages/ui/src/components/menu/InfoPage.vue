<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { sanitizeHtml } from "@material-bluemap/viewer";
import type { BlueMapApp } from "@material-bluemap/viewer";
import { useBlueMap } from "./useBlueMap";
import ChangelogViewer from "../changelog/ChangelogViewer.vue";
import { onRevealRequested } from "../shell/revealRequests.js";

/**
 * The Info page: upstream renders `info.content` from the locale file straight through
 * `v-html`. That content is markup (a logo, three control tables, `<kbd>` keys and an
 * external link), so it has to be rendered rather than printed.
 *
 * Four deviations from upstream, all deliberate:
 *  - the markup goes through the port's shared sanitizer before it reaches the DOM;
 *  - external links get `target="_blank" rel="noopener noreferrer"`, because in the desktop
 *    shell an in-place navigation would replace the whole application window;
 *  - the locale's logo is given real alt text and pointed at the circular 512px copy of the
 *    same mark (see {@link decorate});
 *  - this is the port's About surface, so it also states the version of the *application*,
 *    which is a different number from the one the locale footer prints (see below).
 */
const props = defineProps<{ bluemap?: BlueMapApp | null }>();

const app = useBlueMap(() => props.bluemap);
const { t } = useI18n();

/**
 * The logo the locale markup carries, at the size and shape the page actually renders.
 *
 * Every `info.content` translation opens with `<img src="assets/logo.png">` styled to 40%
 * of the sheet width with `border-radius: 50%`. That source is a 200px square, so the page
 * upscales it and then throws its corners away; `logoCircle512.png` is the identical mark,
 * already circular, at a resolution the display can use. Both ship in every build. The
 * rewrite is deliberately exact - anything other than that one path is left alone, because
 * a translation pointing somewhere else is pointing there on purpose.
 */
const LOCALE_LOGO = "assets/logo.png";
const BUNDLED_LOGO = "assets/logoCircle512.png";

/**
 * Applies the port's edits to the sanitized fragment: link hardening, then the logo.
 *
 * The alt text matters as much as the source: upstream ships the image with no `alt` at
 * all, which a screen reader reports by reading the file name aloud. It is named rather
 * than marked decorative because it is the only thing on the page that identifies what the
 * application is.
 */
function decorate(fragment: DocumentFragment): void {
    for (const anchor of Array.from(fragment.querySelectorAll("a[href]"))) {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
    }
    for (const image of Array.from(fragment.querySelectorAll("img"))) {
        if (image.getAttribute("src") === LOCALE_LOGO) image.setAttribute("src", BUNDLED_LOGO);
        if (!image.hasAttribute("alt")) {
            image.setAttribute("alt", t("info.logoAlt", "The BlueMap logo"));
        }
    }
}

const content = computed(() => {
    const version = app.value?.settings?.version ?? "?";
    const raw = t("info.content", { version });
    if (!raw || raw === "info.content") return "";

    const template = document.createElement("template");
    template.innerHTML = sanitizeHtml(raw);
    decorate(template.content);
    return template.innerHTML;
});

/* -------------------------------------------------------------------------- */
/* The application's own version                                              */
/* -------------------------------------------------------------------------- */

/**
 * `getVersion()` over the preload's `app:version` channel, when there is a preload.
 *
 * Two different versions meet on this page and they are not interchangeable. The locale
 * footer prints `settings.version`, which is the version of BlueMap that generated the map
 * data being viewed; this one is the version of the desktop application doing the viewing,
 * and it is the number somebody quotes in a bug report.
 *
 * Feature-detected one method at a time, like every other bridge call in this package: a
 * browser tab has no preload, and there the block renders nothing at all rather than an
 * empty `Version:` label, which would read as "this build has no version" rather than
 * "nobody here can be asked".
 */
interface VersionBridge {
    getVersion?: () => Promise<string>;
}

function versionReader(): (() => Promise<string>) | null {
    const bridge = (globalThis as { materialBluemap?: VersionBridge }).materialBluemap;
    const read = bridge?.getVersion;
    if (typeof read !== "function" || bridge === undefined) return null;
    return () => read.call(bridge);
}

/**
 * Electron's `ipcRenderer.invoke` re-wraps a handler's rejection as
 * `Error invoking remote method 'app:version': Error: <message>`. The channel name and the
 * doubled `Error:` are plumbing rather than the sentence anybody wrote, so they are
 * stripped before the line renders, exactly as `settings/javaSetting.ts` strips them.
 */
function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
}

const appVersion = ref<string | null>(null);
const versionFailure = ref<string | null>(null);

/**
 * Whether the changelog fold is open, which is what decides whether the viewer is built.
 * Driven by the element's own `toggle` event rather than by a click handler, so keyboard
 * activation and the browser's find-in-page auto-expansion both keep it in step.
 */
const changelogOpen = ref(false);

/**
 * The fold element, so something other than a click can open it.
 *
 * `changelogOpen` is a mirror of the element's state rather than the source of it - the
 * `toggle` handler reads it back off the element - so setting the ref alone would build the
 * viewer inside a fold that still looks shut. The element's `open` property is the real
 * switch, and setting it fires `toggle`, which updates the mirror on the way through.
 */
const changelogFold = ref<HTMLDetailsElement | null>(null);

/*
 * The command palette can ask for the changelog by name. It reaches here because this is where
 * the changelog lives: the palette opens the viewer's menu at this page, and this expands the
 * fold once the page has drawn. Scrolled into view as well, because the fold is at the bottom
 * of a page whose top is a logo and three tables of controls - opening it out of sight would be
 * a teleport that lands somebody on the wrong end of the screen.
 */
onRevealRequested("changelog", () => {
    const fold = changelogFold.value;
    if (fold === null) return;
    fold.open = true;
    changelogOpen.value = true;
    fold.scrollIntoView({ block: "nearest" });
});

onMounted(() => {
    const read = versionReader();
    if (read === null) return;
    void read()
        .then((value) => {
            // A shell that answers with a blank string has told us nothing, and printing
            // "Material BlueMap" with a gap after it would be worse than staying quiet.
            const trimmed = value.trim();
            if (trimmed.length > 0) appVersion.value = trimmed;
        })
        .catch((error: unknown) => {
            // A build that has the channel and fails on it has a real fault, and hiding it
            // would leave the page looking like a browser tab. Say what happened instead.
            versionFailure.value = describe(error);
        });
});
</script>

<template>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized above; the source is a bundled locale file -->
    <div v-if="content" class="mb-info-page" v-html="content" />
    <p v-else class="mb-info-page__empty">
        {{ t("info.title", "Info") }}
    </p>

    <!--
      Not a live region: the answer arrives one IPC round trip after mount, well before a
      screen reader working down the page reaches the end of the control tables, and
      announcing it would interrupt that reading for a line the reader is about to reach.
    -->
    <p v-if="appVersion !== null" class="mb-info-page__version">
        {{ t("info.appVersion", { version: appVersion }, "Material BlueMap {version}") }}
    </p>
    <p v-else-if="versionFailure !== null" class="mb-info-page__version">
        {{
            t(
                "info.appVersionFailed",
                { reason: versionFailure },
                "This build could not report its version: {reason}",
            )
        }}
    </p>

    <!--
        Every released version, with the commit that made each change. Folded rather than
        expanded: this page is what somebody opens to read the controls, and 35 versions
        of history unrolled above them would bury it.

        The viewer is built when the fold is opened rather than mounted and hidden. A
        closed `<details>` still holds its children in the document, so mounting it here
        would put every entry's text - 88 commit messages - into this page's accessible
        name and into anything that reads its content, while showing none of it. Built on
        demand, the page says what it says and the history arrives when it is asked for.
    -->
    <v-divider class="mb-info-page__rule" />
    <details
        ref="changelogFold"
        class="mb-info-page__changelog"
        @toggle="changelogOpen = ($event.target as HTMLDetailsElement).open"
    >
        <summary>{{ t("info.changelog", "Changelog, every released version") }}</summary>
        <ChangelogViewer v-if="changelogOpen" />
    </details>
</template>

<style>
.mb-info-page {
    padding: 8px 16px 16px;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-info-page__rule {
    margin: 1rem 0;
}

.mb-info-page__changelog > summary {
    cursor: pointer;
    padding: 0.25rem 0;
    font-weight: 500;
}

.mb-info-page__changelog > summary:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-info-page img {
    display: block;
    width: 40%;
    margin: 2em auto;
    border-radius: 50%;
}

.mb-info-page h2 {
    font-size: 0.9375rem;
    font-weight: 500;
    margin-block: 12px 4px;
}

.mb-info-page p {
    margin-block: 0;
}

.mb-info-page table {
    border-collapse: collapse;
    width: 100%;
    display: block;
    overflow-x: auto;
}

.mb-info-page th,
.mb-info-page td {
    padding: 4px 8px;
    border: solid 1px rgba(var(--v-theme-on-surface), 0.12);
    font-weight: inherit;
    text-align: start;
    vertical-align: top;
}

.mb-info-page kbd {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 4px;
    border: solid 1px rgba(var(--v-theme-on-surface), 0.24);
    background: rgba(var(--v-theme-on-surface), 0.08);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
}

.mb-info-page hr {
    border: none;
    border-block-start: solid 1px rgba(var(--v-theme-on-surface), 0.12);
    margin-block: 12px;
}

.mb-info-page a {
    color: rgb(var(--v-theme-primary));
}

.mb-info-page .info-footer {
    text-align: center;
}

.mb-info-page__empty {
    padding: 12px 16px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/*
 * A sibling of the rendered content rather than a child of it, so the empty state keeps
 * its own padding instead of nesting inside the page's. The inline padding matches both.
 */
.mb-info-page__version {
    margin: 0;
    padding: 0 16px 16px;
    text-align: center;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>

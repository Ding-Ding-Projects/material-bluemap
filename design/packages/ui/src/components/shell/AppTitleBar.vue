<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiWindowMaximize, mdiWindowMinimize, mdiWindowRestore } from "@mdi/js";
import { VBtn, VIcon } from "vuetify/components";
import { createWindowControls, resolveWindowBridge, type WindowBridge } from "./windowControls.js";

/**
 * The application's own title bar.
 *
 * The window is frameless, so this is the whole of the window chrome: the operating
 * system's caption bar is never shown as product chrome, which means Material Design goes
 * all the way to the top edge instead of stopping under a grey strip drawn by somebody
 * else. It also means the three window buttons are this component's responsibility, and a
 * window with no way to close it is a window nobody can quit.
 *
 * **The drag region is the bar, minus the buttons.** `-webkit-app-region: drag` makes an
 * element move the window instead of receiving events, so every interactive thing in here
 * has to opt back out with `no-drag` - and anything that forgets becomes a control that
 * cannot be clicked, only dragged. The buttons and nothing else are marked.
 *
 * In a browser build the whole component renders nothing: `available` is false, there is
 * no window to minimise, and a close button on a web page that cannot close its own tab
 * is exactly the decorative-looking control this project forbids.
 */
const props = withDefaults(
    defineProps<{
        /** Injected in tests. `undefined` means probe, `null` means deliberately no bridge. */
        bridge?: WindowBridge | null;
        /** Shown beside the icon. The window title is set by the document, not here. */
        title?: string;
    }>(),
    { title: "Material BlueMap" },
);

const { t } = useI18n();

/**
 * The same path `index.html` gives the favicon: a `public/` asset, which Vite copies
 * rather than hashing, addressed relatively because `base` is `"./"`.
 *
 * **Bound rather than written as a static `src`.** Vue's template compiler rewrites a
 * static asset attribute into an import resolved against this component's directory,
 * which would look for the file two packages away and fail the build. A binding is left
 * alone. `alt=""` on the tag because the title beside it already names the application,
 * and announcing the logo too would say it twice.
 */
const LOGO_URL = "./assets/logoCircle64.png";

const controls = createWindowControls(
    props.bridge === undefined ? resolveWindowBridge() : props.bridge,
);

/**
 * How tall the bar is, published to the document.
 *
 * `#map-container` is the viewer's own root and lives outside the Vue tree entirely - it
 * is a sibling of `#app` in `index.html` - so it cannot be told to start below this bar by
 * any amount of scoped CSS. It reads this custom property instead, defaulting to zero, so
 * a browser build (where nothing sets it) keeps the full viewport and the desktop build
 * gets a map that begins under the chrome rather than behind it.
 */
const BAR_HEIGHT = "40px";

onMounted(() => {
    if (controls.available) {
        document.documentElement.style.setProperty("--mb-titlebar-height", BAR_HEIGHT);
    }
    void controls.start();
});

onBeforeUnmount(() => {
    document.documentElement.style.removeProperty("--mb-titlebar-height");
    controls.stop();
});
</script>

<template>
    <header v-if="controls.available" class="mb-titlebar" role="banner">
        <!--
            The drag region carries the identity and the empty space. It is not a button and
            takes no focus: double-clicking it maximises the window, which is the operating
            system's own behaviour on a caption bar and arrives through the drag region
            rather than through a handler here.
        -->
        <div class="mb-titlebar-drag">
            <img class="mb-titlebar-logo" :src="LOGO_URL" alt="" />
            <span class="mb-titlebar-title">{{ props.title }}</span>
        </div>

        <div class="mb-titlebar-controls">
            <VBtn
                class="mb-titlebar-button"
                variant="text"
                :ripple="false"
                :aria-label="t('window.minimize', 'Minimize')"
                @click="controls.minimize()"
            >
                <VIcon :icon="mdiWindowMinimize" size="18" />
            </VBtn>

            <!--
                One button, two meanings, and the label changes with the state rather than
                staying "Maximize" on a maximised window. The state is subscribed to, so a
                window maximised by Win+Up or by a double-click on the drag region gets the
                restore icon here too.
            -->
            <VBtn
                class="mb-titlebar-button"
                variant="text"
                :ripple="false"
                :aria-label="
                    controls.maximized.value
                        ? t('window.restore', 'Restore')
                        : t('window.maximize', 'Maximize')
                "
                @click="controls.toggleMaximize()"
            >
                <VIcon
                    :icon="controls.maximized.value ? mdiWindowRestore : mdiWindowMaximize"
                    size="18"
                />
            </VBtn>

            <VBtn
                class="mb-titlebar-button mb-titlebar-button--close"
                variant="text"
                :ripple="false"
                :aria-label="t('window.close', 'Close')"
                @click="controls.close()"
            >
                <VIcon :icon="mdiClose" size="18" />
            </VBtn>
        </div>
    </header>
</template>

<style scoped>
/*
 * Height is published as a custom property on :root by the shell, because #map-container
 * lives outside the Vue tree and has to start below this bar rather than behind it.
 */
.mb-titlebar {
    display: flex;
    align-items: stretch;
    height: var(--mb-titlebar-height, 40px);
    background: rgb(var(--v-theme-surface-light, var(--v-theme-surface)));
    color: rgb(var(--v-theme-on-surface));
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
    user-select: none;
    pointer-events: auto;
}

.mb-titlebar-drag {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding-inline-start: 12px;
    -webkit-app-region: drag;
    app-region: drag;
}

.mb-titlebar-logo {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
}

/*
 * The title truncates rather than wrapping or pushing the buttons off the edge. At 800px
 * wide with the longest bilingual string this is the element that has to give, and the
 * window buttons are the ones that must never be the thing that scrolls out of reach.
 */
.mb-titlebar-title {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: rgba(var(--v-theme-on-surface), 0.85);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mb-titlebar-controls {
    display: flex;
    flex: 0 0 auto;
    -webkit-app-region: no-drag;
    app-region: no-drag;
}

/*
 * 48x40 rather than the operating system's 46x32. Still reads as a caption button, and is
 * a target somebody can actually hit at 150% display scale - which the sizing rules ask
 * for and the OS convention predates.
 */
.mb-titlebar-button.v-btn {
    width: 48px;
    min-width: 48px;
    height: 100%;
    border-radius: 0;
    color: rgba(var(--v-theme-on-surface), 0.85);
}

.mb-titlebar-button.v-btn:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

/*
 * Close goes red on hover because that is what every window on this platform does, and a
 * close button that looks like the other two is one somebody presses by accident. It is a
 * state layer, not the resting colour: a permanently red button in the corner reads as an
 * error the application is reporting.
 */
.mb-titlebar-button--close.v-btn:hover,
.mb-titlebar-button--close.v-btn:focus-visible {
    background: rgb(var(--v-theme-error));
    color: rgb(var(--v-theme-on-error));
}

/*
 * Focus has to be visible on a 40px-tall button with no border, and the global focus rule
 * uses an outline that would be clipped by the bar's own edge. Inset it.
 */
.mb-titlebar-button.v-btn:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -3px;
}
</style>

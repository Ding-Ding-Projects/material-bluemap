<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiMenu,
    mdiMap,
    mdiServerNetwork,
    mdiCompass,
    mdiWeatherNight,
    mdiWhiteBalanceSunny,
} from "@mdi/js";
import MapView from "./components/MapView.vue";
import ProfileManager from "./components/ProfileManager.vue";
import { activeProfile, profilesStore } from "./stores/profiles";

const { t } = useI18n();

const drawer = ref(false);
const page = ref<"map" | "profiles">("map");
const dayLight = ref(true);
const mapView = ref<InstanceType<typeof MapView> | null>(null);

const profileName = computed(() => activeProfile()?.name ?? t("maps.title", "Maps"));
const mapList = computed(() => mapView.value?.maps ?? []);
const currentMapId = computed(() => mapView.value?.currentMapId ?? null);

function switchMap(mapId: string) {
    void mapView.value?.switchMap(mapId);
    drawer.value = false;
}

function toggleDayNight() {
    dayLight.value = !dayLight.value;
    mapView.value?.setSunlight(dayLight.value ? 1 : 0);
}
</script>

<template>
    <v-app class="mb-app">
        <v-app-bar density="comfortable" elevation="2">
            <v-app-bar-nav-icon :icon="mdiMenu" @click="drawer = !drawer" />
            <v-app-bar-title>{{ profileName }}</v-app-bar-title>
            <v-spacer />
            <v-btn
                :icon="dayLight ? mdiWhiteBalanceSunny : mdiWeatherNight"
                :title="t('dayNightSwitch.tooltip', 'Day/Night')"
                @click="toggleDayNight"
            />
            <v-btn :icon="mdiCompass" :title="t('resetCamera.tooltip', 'Reset camera')" @click="mapView?.resetCamera()" />
        </v-app-bar>

        <v-navigation-drawer v-model="drawer" temporary>
            <v-list nav>
                <v-list-item
                    :prepend-icon="mdiMap"
                    :title="t('maps.title', 'Maps')"
                    :active="page === 'map'"
                    @click="page = 'map'"
                />
                <v-list-item
                    :prepend-icon="mdiServerNetwork"
                    title="Servers"
                    :active="page === 'profiles'"
                    @click="page = 'profiles'"
                />
                <v-divider class="my-2" />
                <template v-if="page === 'map'">
                    <v-list-subheader>{{ t('maps.title', 'Maps') }}</v-list-subheader>
                    <v-list-item
                        v-for="map in mapList"
                        :key="map.id"
                        :title="map.name"
                        :active="map.id === currentMapId"
                        @click="switchMap(map.id)"
                    />
                </template>
            </v-list>
        </v-navigation-drawer>

        <v-main class="mb-main">
            <MapView
                v-if="profilesStore.activeId"
                ref="mapView"
                :key="profilesStore.activeId"
            />
            <v-overlay
                :model-value="page === 'profiles'"
                class="align-center justify-center"
                contained
            >
                <ProfileManager @close="page = 'map'" />
            </v-overlay>
        </v-main>
    </v-app>
</template>

<style>
.mb-app {
    /* the three.js canvas lives behind the Vue app */
    background: transparent !important;
}
.mb-main {
    pointer-events: none;
}
.mb-main .v-overlay,
.mb-main .v-overlay * {
    pointer-events: auto;
}
#map-container {
    position: fixed;
    inset: 0;
}
#map-container canvas {
    display: block;
}
</style>

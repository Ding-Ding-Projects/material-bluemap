<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from "vue";
import { BlueMapApp } from "@material-bluemap/viewer";
import { activeProfile, profileDataRoot } from "../stores/profiles";

interface MapEntry {
    id: string;
    name: string;
}

const maps = reactive<MapEntry[]>([]);
const currentMapId = ref<string | null>(null);
const error = ref<string | null>(null);

let app: BlueMapApp | null = null;

onMounted(async () => {
    const container = document.getElementById("map-container");
    const profile = activeProfile();
    if (!container || !profile) return;
    try {
        app = new BlueMapApp(container, {
            dataRoot: profileDataRoot(profile),
            allowRemoteInjection: () => profile.trustCustomizations,
        });
        await app.load();
        maps.splice(
            0,
            maps.length,
            ...app.maps.map((m: { data: { id: string; name: string } }) => ({
                id: m.data.id,
                name: m.data.name,
            })),
        );
        currentMapId.value = app.mapViewer.map?.data.id ?? null;
    } catch (e) {
        error.value = String(e);
    }
});

onUnmounted(() => {
    app?.dispose();
    app = null;
    const container = document.getElementById("map-container");
    if (container) container.innerHTML = "";
});

async function switchMap(mapId: string) {
    await app?.switchMap(mapId);
    currentMapId.value = mapId;
}

function resetCamera() {
    app?.resetCamera();
}

function setSunlight(strength: number) {
    if (!app) return;
    app.mapViewer.data.uniforms.sunlightStrength.value = strength;
}

defineExpose({ maps, currentMapId, switchMap, resetCamera, setSunlight });
</script>

<template>
    <v-alert v-if="error" type="error" class="ma-4" style="pointer-events: auto">
        {{ error }}
    </v-alert>
</template>

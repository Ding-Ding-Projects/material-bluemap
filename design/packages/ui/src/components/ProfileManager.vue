<script setup lang="ts">
import { ref } from "vue";
import { mdiDelete, mdiPlus } from "@mdi/js";
import { addProfile, profilesStore, removeProfile } from "../stores/profiles";

const emit = defineEmits<{ close: [] }>();

const newName = ref("");
const newUrl = ref("");

function create() {
    if (!newUrl.value) return;
    const profile = addProfile({
        name: newName.value || newUrl.value,
        url: newUrl.value,
        trustCustomizations: false,
    });
    profilesStore.activeId = profile.id;
    newName.value = "";
    newUrl.value = "";
    emit("close");
}

function activate(id: string) {
    profilesStore.activeId = id;
    emit("close");
}
</script>

<template>
    <v-card min-width="380" max-width="520" title="BlueMap servers">
        <v-card-text>
            <v-list>
                <v-list-item
                    v-for="profile in profilesStore.profiles"
                    :key="profile.id"
                    :title="profile.name"
                    :subtitle="profile.url"
                    :active="profile.id === profilesStore.activeId"
                    @click="activate(profile.id)"
                >
                    <template #append>
                        <v-btn
                            :icon="mdiDelete"
                            variant="text"
                            size="small"
                            @click.stop="removeProfile(profile.id)"
                        />
                    </template>
                </v-list-item>
            </v-list>
            <v-divider class="my-3" />
            <v-text-field v-model="newName" label="Name" density="compact" />
            <v-text-field
                v-model="newUrl"
                label="BlueMap URL"
                placeholder="https://example.com/bluemap"
                density="compact"
            />
        </v-card-text>
        <v-card-actions>
            <v-btn :prepend-icon="mdiPlus" color="primary" @click="create">Add server</v-btn>
            <v-spacer />
            <v-btn @click="emit('close')">Close</v-btn>
        </v-card-actions>
    </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDelete, mdiLaptop, mdiPlus, mdiServerNetwork } from "@mdi/js";
import ConfigSearchField from "./config/ConfigSearchField.vue";
import { createSettingMatcher } from "./config/regexEngine.js";
import {
    addProfile,
    isLocalProfile,
    profilesStore,
    removeProfile,
    type ServerProfile,
} from "../stores/profiles";

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

/**
 * A map rendered on this machine has no URL, so the subtitle says where it came from
 * instead of rendering an empty line. Two entries whose only visible difference is that
 * one has a blank second row read as one of them being broken.
 */
function subtitleOf(profile: ServerProfile): string {
    return isLocalProfile(profile)
        ? t("servers.localMap", "Rendered on this computer")
        : profile.url;
}

/* -------------------------------------------------------------------------- */
/* Finding one among many                                                     */
/* -------------------------------------------------------------------------- */

/**
 * This list's own query, mode and flags, with its own anchored builder.
 *
 * Every collection in this application carries one, and this list is the collection that
 * grows without anybody deciding it should: a profile is added for each server somebody
 * browses and for each map they render, so the list that was three rows on Tuesday is
 * thirty by Friday. Plain text stays the default and regex is the opt-in the shared field
 * provides, so nothing changes for the person who just wants to type a name.
 *
 * The searched text is what the row actually shows - the name and the subtitle - rather
 * than the underlying record, because a search that matches on a field the user cannot see
 * returns rows that look like mistakes.
 */
const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

function profileText(profile: ServerProfile): string[] {
    return [profile.name, subtitleOf(profile)];
}

const visible = computed(() =>
    profilesStore.profiles.filter((profile) =>
        profileText(profile).some((value) => matcher.value.test(value)),
    ),
);

/** What the builder previews against: the rows themselves, one per line. */
const sample = computed(() =>
    profilesStore.profiles.map((profile) => profileText(profile).join(" ")).join("\n"),
);

const summary = computed(() =>
    matcher.value.active
        ? t(
              "servers.searchSummary",
              { shown: visible.value.length, total: profilesStore.profiles.length },
              "Showing {shown} of {total}.",
          )
        : "",
);

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
    <!-- Not "servers" any more: the list now also holds maps rendered on this machine. -->
    <v-card
        min-width="380"
        max-width="520"
        :title="t('servers.cardTitle', 'Maps and servers')"
    >
        <v-card-text>
            <!--
                The search appears only once there is enough to search. A filter over three
                rows is a control that costs more attention than it saves.
            -->
            <div v-if="profilesStore.profiles.length > 3" class="mb-profiles__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('servers.searchLabel', 'Search maps and servers')"
                    :placeholder="t('servers.searchHint', 'a name, or part of an address')"
                    :sample="sample"
                    :summary="summary"
                />
            </div>

            <v-list>
                <v-list-item
                    v-for="profile in visible"
                    :key="profile.id"
                    :title="profile.name"
                    :subtitle="subtitleOf(profile)"
                    :prepend-icon="isLocalProfile(profile) ? mdiLaptop : mdiServerNetwork"
                    :active="profile.id === profilesStore.activeId"
                    @click="activate(profile.id)"
                >
                    <template #append>
                        <v-btn
                            :icon="mdiDelete"
                            variant="text"
                            size="small"
                            :aria-label="
                                t('servers.remove', { name: profile.name }, 'Remove {name}')
                            "
                            @click.stop="removeProfile(profile.id)"
                        />
                    </template>
                </v-list-item>
            </v-list>

            <!--
                An honest empty result keeps the field on screen, because the way out of it
                is to clear the search rather than to look for a list that is not there.
            -->
            <p
                v-if="profilesStore.profiles.length > 0 && visible.length === 0"
                class="mb-profiles__empty"
                role="status"
            >
                {{
                    t(
                        "servers.noMatch",
                        "Nothing here matches that search. Clearing it brings the whole list back; nothing was removed.",
                    )
                }}
            </p>

            <v-divider class="my-3" />
            <v-text-field
                v-model="newName"
                :label="t('servers.nameLabel', 'Name')"
                density="compact"
            />
            <v-text-field
                v-model="newUrl"
                :label="t('servers.urlLabel', 'BlueMap URL')"
                placeholder="https://example.com/bluemap"
                density="compact"
            />
        </v-card-text>
        <v-card-actions>
            <v-btn :prepend-icon="mdiPlus" color="primary" @click="create">
                {{ t("servers.add", "Add server") }}
            </v-btn>
            <v-spacer />
            <v-btn @click="emit('close')">{{ t("servers.close", "Close") }}</v-btn>
        </v-card-actions>
    </v-card>
</template>

<style scoped>
.mb-profiles__search {
    margin-bottom: 0.5rem;
}

.mb-profiles__empty {
    padding: 0.5rem 0.25rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}
</style>

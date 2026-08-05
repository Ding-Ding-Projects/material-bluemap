<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCheck,
    mdiContentCopy,
    mdiDeleteOutline,
    mdiFolderSearchOutline,
    mdiPencilOutline,
    mdiServerPlus,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VDialog,
    VTextField,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import PathField from "../PathField.vue";
import RemoteFileBrowser from "./RemoteFileBrowser.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import type { RemoteBridge, RemoteDisclosure, RemoteTarget } from "./remoteBridge.js";
import {
    blankDraft,
    describeTarget,
    draftFromTarget,
    draftToTarget,
    newTargetId,
    removeTarget,
    targetText,
    upsertTarget,
    type RemoteTargetDraft,
} from "./remoteTargets.js";

/**
 * The machines this application has been told about, and the form for adding one.
 *
 * ## There is no password field here, and there must never be one
 *
 * Everything on this form is a host, a port, an account name, a path, or a boolean. The
 * only authentication choices are your SSH agent (leave the key path empty) or a private
 * key file named **by path**, which this application records the location of and never
 * opens. The main process builds its `ssh` invocation with `PasswordAuthentication=no` and
 * `BatchMode=yes`, so even a host offering password authentication cannot draw one out of
 * it. Adding a password field here would not merely be redundant; it would be the one place
 * in the whole feature where a secret could exist.
 *
 * ## Nothing typed here is trusted
 *
 * Every field is validated by the main process before it reaches an argument, because a
 * host beginning with `-` is read by `ssh` as an option rather than a machine, and a work
 * directory containing `:` ends the source half of a container mount early. The **Check
 * this machine** button is that validation, run early, so a refusal arrives while somebody
 * is still looking at the field that caused it.
 */
const props = defineProps<{
    bridge: RemoteBridge | null;
    targets: readonly RemoteTarget[];
    selectedId: string | null;
}>();

const emit = defineEmits<{
    "update:targets": [value: readonly RemoteTarget[]];
    "update:selectedId": [value: string | null];
}>();

const { t } = useI18n();

/* -- the saved list -------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const shown = computed(() =>
    props.targets.filter((target) => targetText(target).some((value) => matcher.value.test(value))),
);

const sample = computed(() =>
    props.targets.map((target) => targetText(target).join(" ")).join("\n"),
);

const summary = computed(() =>
    matcher.value.active
        ? t(
              "remote.targets.searchSummary",
              { shown: String(shown.value.length), total: String(props.targets.length) },
              "Showing {shown} of {total}",
          )
        : "",
);

/* -- the form -------------------------------------------------------------- */

const draft = ref<RemoteTargetDraft>(blankDraft());
const editing = ref(false);
const checking = ref(false);
const refusal = ref<string | null>(null);
const accepted = ref<string | null>(null);
const disclosure = ref<RemoteDisclosure | null>(null);

function patch(change: Partial<RemoteTargetDraft>): void {
    draft.value = { ...draft.value, ...change };
    // A field that has changed invalidates the last verdict. Leaving "looks right" on
    // screen beside an edited host is how somebody saves a machine that was never checked.
    refusal.value = null;
    accepted.value = null;
    disclosure.value = null;
}

function startNew(): void {
    draft.value = blankDraft(newTargetId());
    editing.value = true;
    refusal.value = null;
    accepted.value = null;
    disclosure.value = null;
}

function edit(target: RemoteTarget): void {
    draft.value = draftFromTarget(target);
    editing.value = true;
    refusal.value = null;
    accepted.value = null;
    disclosure.value = null;
}

/**
 * Opens the form pre-filled with a copy of an existing machine, under a fresh id and a name
 * that says it is a copy.
 *
 * Nothing is saved yet. A duplicate is most often wanted because two things about the copy
 * need to differ from the original - a different work directory, a different key, a second
 * account on the same host - and the same **Check this machine and keep it** button that
 * validates a new machine validates this one, so a half-edited duplicate can never be saved
 * without the main process having looked at it first.
 */
function duplicate(target: RemoteTarget): void {
    draft.value = {
        ...draftFromTarget(target),
        id: newTargetId(),
        label: t("remote.targets.copyOfLabel", { name: target.label }, "Copy of {name}"),
    };
    editing.value = true;
    refusal.value = null;
    accepted.value = null;
    disclosure.value = null;
}

function cancelEdit(): void {
    editing.value = false;
    refusal.value = null;
    accepted.value = null;
    disclosure.value = null;
}

function choose(target: RemoteTarget): void {
    emit("update:selectedId", target.id);
}

function forget(target: RemoteTarget): void {
    emit("update:targets", removeTarget(props.targets, target.id));
    if (props.selectedId === target.id) emit("update:selectedId", null);
    if (draft.value.id === target.id) cancelEdit();
}

/**
 * Validates the form and, if it holds, saves it.
 *
 * Validation and saving are one action rather than two because the answer to "is this a
 * usable machine" belongs to the main process, and a **Save** that stored an unusable
 * target would be storing something that can only fail later, in the middle of a render
 * flow, with the form long gone from the screen.
 */
async function checkAndSave(): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null || checking.value) return;
    checking.value = true;
    refusal.value = null;
    accepted.value = null;
    try {
        const answer = await bridge.validateRemoteTarget(draftToTarget(draft.value));
        if (!answer.ok) {
            refusal.value = answer.message;
            return;
        }
        emit("update:targets", upsertTarget(props.targets, answer.target));
        emit("update:selectedId", answer.target.id);
        accepted.value = answer.summary;
        editing.value = false;
        if (bridge.canDescribe) {
            const described = await bridge.describeRemoteTarget(answer.target);
            disclosure.value = "ok" in described && described.ok === false ? null : (described as RemoteDisclosure);
        }
    } catch (error) {
        // The channel is documented never to reject, so this is a broken bridge rather
        // than a rejected target, and saying which is more useful than a bare message.
        refusal.value = t(
            "remote.targets.bridgeFailed",
            { message: error instanceof Error ? error.message : String(error) },
            "The application could not check that machine: {message}",
        );
    } finally {
        checking.value = false;
    }
}

/** The disclosure follows the selection, so it always describes the machine in play. */
watch(
    () => props.selectedId,
    async (id) => {
        const bridge = props.bridge;
        const target = props.targets.find((candidate) => candidate.id === id) ?? null;
        if (bridge === null || target === null || !bridge.canDescribe) {
            disclosure.value = null;
            return;
        }
        try {
            const described = await bridge.describeRemoteTarget(target);
            disclosure.value = "ok" in described && described.ok === false ? null : (described as RemoteDisclosure);
        } catch {
            disclosure.value = null;
        }
    },
    { immediate: true },
);

const canSave = computed(
    () =>
        props.bridge !== null &&
        !checking.value &&
        draft.value.host.trim() !== "" &&
        draft.value.user.trim() !== "",
);

/* -- browsing the remote folder for the work directory ---------------------- */

/**
 * The Explorer-style browser needs a host and a user to have anything to connect to, and
 * the build itself needs to be able to list a folder at all. Neither has to have been saved
 * or checked yet - the browser's own listing is itself a live proof the machine answers,
 * which is exactly the "which folder holds it" question this is here to answer.
 */
const canBrowseWorkDir = computed(
    () =>
        props.bridge !== null &&
        props.bridge.canBrowse &&
        draft.value.host.trim() !== "" &&
        draft.value.user.trim() !== "",
);

const browsingWorkDir = ref(false);

function openWorkDirBrowser(): void {
    if (!canBrowseWorkDir.value) return;
    browsingWorkDir.value = true;
}

function chooseWorkDir(path: string): void {
    patch({ workDir: path });
    browsingWorkDir.value = false;
}

defineExpose({ draft, patch, startNew, edit, duplicate, checkAndSave, editing, browsingWorkDir });
</script>

<template>
    <div class="mb-remote-targets">
        <div v-if="targets.length > 0" class="mb-remote-targets__search">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('remote.targets.searchLabel', 'Search your machines')"
                :placeholder="t('remote.targets.searchHint', 'a name, a host, a user or a path')"
                :sample="sample"
                :summary="summary"
            />
        </div>

        <p v-if="targets.length === 0" class="mb-remote-targets__blurb">
            {{
                t(
                    "remote.targets.empty",
                    "No machine has been set up yet. A machine is a host, an account, and either your SSH agent or the path to a key file. This application never asks for a password and has nowhere to keep one.",
                )
            }}
        </p>

        <p
            v-else-if="shown.length === 0"
            class="mb-remote-targets__blurb"
            role="status"
        >
            {{
                t(
                    "remote.targets.noMatch",
                    "No machine matches that search. Clearing it brings the whole list back.",
                )
            }}
        </p>

        <ul v-if="shown.length > 0" class="mb-remote-targets__list">
            <li
                v-for="target in shown"
                :key="target.id"
                class="mb-remote-targets__row"
                :class="{ 'mb-remote-targets__row--chosen': target.id === selectedId }"
            >
                <div class="mb-remote-targets__identity">
                    <span class="mb-remote-targets__label">{{ target.label }}</span>
                    <span class="mb-remote-targets__address">{{ describeTarget(target) }}</span>
                    <v-chip size="x-small" variant="outlined">
                        {{
                            target.identityFile === null
                                ? t("remote.targets.agent", "SSH agent")
                                : t("remote.targets.keyFile", "Key file")
                        }}
                    </v-chip>
                    <v-chip v-if="target.keepRemoteFiles" size="x-small" color="warning" variant="tonal">
                        {{ t("remote.targets.keeps", "Keeps a copy there") }}
                    </v-chip>
                </div>
                <div class="mb-remote-targets__actions">
                    <v-btn
                        :prepend-icon="target.id === selectedId ? mdiCheck : undefined"
                        :variant="target.id === selectedId ? 'tonal' : 'text'"
                        :aria-pressed="target.id === selectedId ? 'true' : 'false'"
                        :aria-label="
                            t('remote.targets.useOne', { name: target.label }, 'Use {name} for this render')
                        "
                        size="small"
                        color="primary"
                        @click="choose(target)"
                    >
                        {{ t("remote.targets.use", "Use this one") }}
                    </v-btn>
                    <v-btn
                        :prepend-icon="mdiPencilOutline"
                        :aria-label="t('remote.targets.editOne', { name: target.label }, 'Edit {name}')"
                        variant="text"
                        size="small"
                        @click="edit(target)"
                    >
                        {{ t("remote.targets.edit", "Edit") }}
                    </v-btn>
                    <v-btn
                        :prepend-icon="mdiContentCopy"
                        :aria-label="t('remote.targets.duplicateOne', { name: target.label }, 'Duplicate {name}')"
                        variant="text"
                        size="small"
                        @click="duplicate(target)"
                    >
                        {{ t("remote.targets.duplicate", "Duplicate") }}
                    </v-btn>
                    <v-btn
                        :prepend-icon="mdiDeleteOutline"
                        :aria-label="t('remote.targets.forgetOne', { name: target.label }, 'Forget {name}')"
                        variant="text"
                        size="small"
                        @click="forget(target)"
                    >
                        {{ t("remote.targets.forget", "Forget") }}
                    </v-btn>
                </div>
            </li>
        </ul>

        <v-btn
            v-if="!editing"
            :prepend-icon="mdiServerPlus"
            :disabled="bridge === null"
            variant="tonal"
            size="small"
            class="mb-remote-targets__add"
            @click="startNew"
        >
            {{ t("remote.targets.add", "Add a machine") }}
        </v-btn>

        <v-card v-if="editing" variant="tonal" class="mb-remote-targets__form">
            <v-card-title class="mb-remote-targets__formTitle">
                {{ t("remote.targets.formTitle", "The machine") }}
            </v-card-title>
            <v-card-text>
                <div class="mb-remote-targets__grid">
                    <v-text-field
                        :model-value="draft.label"
                        :label="t('remote.targets.field.label', 'Name it (optional)')"
                        :placeholder="t('remote.targets.field.labelHint', 'the build server')"
                        variant="outlined"
                        density="compact"
                        autocomplete="off"
                        hide-details="auto"
                        @update:model-value="(value: string) => patch({ label: value })"
                    />
                    <v-text-field
                        :model-value="draft.host"
                        :label="t('remote.targets.field.host', 'Host name or address')"
                        :placeholder="t('remote.targets.field.hostHint', 'build-server.lan')"
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        autocapitalize="off"
                        autocomplete="off"
                        hide-details="auto"
                        @update:model-value="(value: string) => patch({ host: value })"
                    />
                    <v-text-field
                        :model-value="draft.user"
                        :label="t('remote.targets.field.user', 'Sign in as')"
                        :placeholder="t('remote.targets.field.userHint', 'renderer')"
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        autocapitalize="off"
                        autocomplete="off"
                        hide-details="auto"
                        @update:model-value="(value: string) => patch({ user: value })"
                    />
                    <v-text-field
                        :model-value="draft.port"
                        :label="t('remote.targets.field.port', 'Port')"
                        type="number"
                        min="1"
                        max="65535"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                        @update:model-value="(value: string) => patch({ port: value })"
                    />
                </div>

                <div class="mb-remote-targets__wide">
                    <PathField
                        :model-value="draft.identityFile"
                        field="the SSH identity file"
                        semantic="file"
                        :label="t('remote.targets.field.identity', 'Private key file (leave empty to use your SSH agent)')"
                        :placeholder="t('remote.targets.field.identityHint', 'C:\\Users\\you\\.ssh\\id_ed25519')"
                        @update:model-value="(value: string) => patch({ identityFile: value })"
                    />
                    <p class="mb-remote-targets__fieldHint">
                        {{
                            t(
                                'remote.targets.field.identityNote',
                                'A path, never the key itself. This application records where the file is; ssh reads it, and nothing here ever opens it, copies it or sends it. There is no password field anywhere in this feature, and the SSH client is told to refuse one even if the host offers it.',
                            )
                        }}
                    </p>
                </div>

                <div class="mb-remote-targets__grid">
                    <div class="mb-remote-targets__pathWithBrowse">
                        <v-text-field
                            :model-value="draft.workDir"
                            :label="t('remote.targets.field.workDir', 'Work directory on that machine')"
                            :hint="
                                t(
                                    'remote.targets.field.workDirHint',
                                    'Everything this render sends lives under here, in a folder of its own.',
                                )
                            "
                            persistent-hint
                            variant="outlined"
                            density="compact"
                            spellcheck="false"
                            autocapitalize="off"
                            autocomplete="off"
                            @update:model-value="(value: string) => patch({ workDir: value })"
                        />
                        <v-btn
                            :prepend-icon="mdiFolderSearchOutline"
                            :disabled="!canBrowseWorkDir"
                            :aria-label="
                                t(
                                    'remote.targets.browseWorkDirAria',
                                    'Browse the folders on this machine to choose the work directory',
                                )
                            "
                            variant="tonal"
                            size="small"
                            class="mb-remote-targets__browseBtn"
                            @click="openWorkDirBrowser"
                        >
                            {{ t("remote.targets.browseWorkDir", "Browse...") }}
                        </v-btn>
                        <p v-if="!canBrowseWorkDir" class="mb-remote-targets__fieldHint">
                            {{
                                t(
                                    'remote.targets.browseNeedsHostUser',
                                    'A host and an account are needed before this machine can be browsed.',
                                )
                            }}
                        </p>
                    </div>
                    <v-text-field
                        :model-value="draft.image"
                        :label="t('remote.targets.field.image', 'Container image (optional)')"
                        :placeholder="t('remote.targets.field.imageHint', 'the stock JRE image')"
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        autocapitalize="off"
                        autocomplete="off"
                        hide-details="auto"
                        @update:model-value="(value: string) => patch({ image: value })"
                    />
                </div>

                <v-checkbox
                    :model-value="draft.keepRemoteFiles"
                    :label="t('remote.targets.field.keep', 'Leave the uploaded world on that machine afterwards')"
                    :hint="
                        t(
                            'remote.targets.field.keepHint',
                            'Off, the staging folder is removed when the render ends, whether it finished, failed or was stopped. On, a complete copy of your world stays on that machine until you delete it yourself.',
                        )
                    "
                    persistent-hint
                    color="primary"
                    density="compact"
                    @update:model-value="(value: boolean | null) => patch({ keepRemoteFiles: value === true })"
                />

                <div class="mb-remote-targets__formActions">
                    <v-btn
                        :disabled="!canSave"
                        :loading="checking"
                        variant="flat"
                        color="primary"
                        size="small"
                        @click="checkAndSave"
                    >
                        {{ t("remote.targets.save", "Check this machine and keep it") }}
                    </v-btn>
                    <v-btn variant="text" size="small" @click="cancelEdit">
                        {{ t("remote.targets.cancel", "Cancel") }}
                    </v-btn>
                </div>

                <v-alert
                    v-if="refusal"
                    type="error"
                    density="compact"
                    variant="tonal"
                    class="mb-remote-targets__alert"
                    role="alert"
                >
                    {{ refusal }}
                </v-alert>
            </v-card-text>
        </v-card>

        <p v-if="accepted" class="mb-remote-targets__blurb" role="status">
            {{ t("remote.targets.accepted", { target: accepted }, "Kept {target}. Nothing has been connected to yet.") }}
        </p>

        <!--
            What a render would send, before it sends it. A copy of somebody's world sitting
            on a server is a fact they are entitled to know in advance rather than to find in
            a log afterwards.
        -->
        <v-card v-if="disclosure" variant="tonal" class="mb-remote-targets__disclosure">
            <v-card-title class="mb-remote-targets__formTitle">
                {{
                    t(
                        "remote.disclosure.title",
                        { target: disclosure.target },
                        "What a render on {target} sends",
                    )
                }}
            </v-card-title>
            <v-card-text>
                <h5 class="mb-remote-targets__subhead">{{ t("remote.disclosure.sends", "Sent") }}</h5>
                <ul class="mb-remote-targets__facts">
                    <li v-for="line in disclosure.sends" :key="line">{{ line }}</li>
                </ul>
                <h5 class="mb-remote-targets__subhead">
                    {{ t("remote.disclosure.neverSends", "Never sent") }}
                </h5>
                <ul class="mb-remote-targets__facts">
                    <li v-for="line in disclosure.neverSends" :key="line">{{ line }}</li>
                </ul>
                <p class="mb-remote-targets__blurb">
                    <strong>{{ t("remote.disclosure.leftBehind", "Left behind:") }}</strong>
                    {{ disclosure.leavesBehind }}
                </p>
                <p class="mb-remote-targets__blurb">
                    <strong>{{ t("remote.disclosure.auth", "Signing in with:") }}</strong>
                    {{ disclosure.authentication }}
                </p>
            </v-card-text>
        </v-card>

        <!--
            The Explorer-style browser, for the one field on this form that names a folder
            somebody cannot be expected to type from memory. It never needs the machine to be
            saved first: a live listing is itself a stronger proof the machine answers than
            the Check button below would give without one.
        -->
        <v-dialog v-model="browsingWorkDir" max-width="720" scrollable>
            <v-card class="mb-remote-targets__browseDialog">
                <v-card-title class="mb-remote-targets__formTitle">
                    {{
                        t(
                            "remote.targets.browseDialogTitle",
                            { target: draft.host },
                            "Choose the work directory on {target}",
                        )
                    }}
                </v-card-title>
                <v-card-text>
                    <RemoteFileBrowser
                        v-if="browsingWorkDir"
                        :bridge="bridge"
                        :target="draftToTarget(draft)"
                        :start-path="draft.workDir.trim() === '' ? '/' : draft.workDir.trim()"
                        @choose="chooseWorkDir"
                        @cancel="browsingWorkDir = false"
                    />
                </v-card-text>
            </v-card>
        </v-dialog>
    </div>
</template>

<style>
.mb-remote-targets__search {
    max-width: 420px;
    margin-block-end: 8px;
}

.mb-remote-targets__blurb {
    margin-block-start: 6px;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-remote-targets__list {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-remote-targets__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 10px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.mb-remote-targets__row--chosen {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.06);
}

.mb-remote-targets__identity {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
}

.mb-remote-targets__label {
    font-size: 0.875rem;
    font-weight: 500;
    overflow-wrap: anywhere;
}

.mb-remote-targets__address {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-remote-targets__actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
}

.mb-remote-targets__add {
    margin-block-start: 8px;
}

.mb-remote-targets__form,
.mb-remote-targets__disclosure {
    margin-block-start: 12px;
    border-radius: 12px;
}

.mb-remote-targets__formTitle {
    font-size: 0.9375rem;
    padding: 8px 12px 0;
}

.mb-remote-targets__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px 16px;
    margin-block-end: 8px;
}

.mb-remote-targets__wide {
    margin-block-end: 8px;
}

.mb-remote-targets__pathWithBrowse {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-remote-targets__pathWithBrowse > .v-input {
    flex: 1 1 220px;
    min-width: 0;
}

.mb-remote-targets__browseBtn {
    margin-block-start: 4px;
}

.mb-remote-targets__browseDialog {
    border-radius: 16px;
}

/*
 * `PathField.vue` has no `hint` prop of its own - it is a control, not a labelled field - so
 * the identity file's explanation (no password anywhere in this feature, the key is never
 * opened) is rendered as an ordinary paragraph right under it, matching where Vuetify's own
 * `persistent-hint` would have put the same words.
 */
.mb-remote-targets__fieldHint {
    margin: 4px 0 0;
    padding-inline-start: 16px;
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-remote-targets__formActions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 8px;
}

.mb-remote-targets__alert {
    margin-block-start: 8px;
}

.mb-remote-targets__subhead {
    margin-block-start: 8px;
    font-size: 0.8125rem;
    font-weight: 500;
}

.mb-remote-targets__facts {
    margin: 4px 0 0 1.2em;
    font-size: 0.8125rem;
    line-height: 1.6;
}
</style>

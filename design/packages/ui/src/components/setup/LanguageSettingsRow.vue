<script setup lang="ts">
import SetupText from "./SetupText.vue";
import SetupLanguagePanel from "./SetupLanguagePanel.vue";

/**
 * The language mode and both funny levels, on the settings surface.
 *
 * The same `SetupLanguagePanel` the first-run flow shows, mounted rather than reproduced.
 * Two copies of a control that writes the same three persisted keys is how a slider in one
 * surface stops agreeing with the slider in the other, and the failure is silent: both
 * screens look right, and only the one that was opened second is telling the truth.
 *
 * Before this existed the three settings were reachable **only** during first-run setup.
 * They persisted, they worked, and once setup was completed there was no way back to them
 * short of clearing the profile, which is not a setting being configurable, it is a setting
 * being asked once. The contract wants them reachable from the settings surface, and this
 * is that.
 *
 * The words this section can be searched by live in `languageSearch.ts`, not on this
 * component, exactly as consent's do in `consentSearch.ts`. A settings surface folds them
 * into the search it already owns rather than this row growing a second search bar to
 * compete with it, and a module function is readable before this component has mounted,
 * which a template ref is not.
 */
</script>

<template>
    <div class="mb-language-setting">
        <SetupText text-key="language.settingsLead" class="mb-language-setting__lead" />
        <SetupLanguagePanel />
    </div>
</template>

<style>
.mb-language-setting {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-language-setting__lead {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.875rem;
}
</style>

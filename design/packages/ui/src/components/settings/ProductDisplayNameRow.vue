<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { WORLDLENS_IDENTITY } from "@worldlens/shared";
import {
    productDisplayName,
    resetProductDisplayName,
    setProductDisplayName,
} from "../../stores/productName.js";

const { t } = useI18n();
const draft = ref(productDisplayName.value);

function save(): void {
    draft.value = setProductDisplayName(draft.value);
}

function reset(): void {
    resetProductDisplayName();
    draft.value = productDisplayName.value;
}
</script>

<template>
    <div class="mb-product-name">
        <v-text-field
            v-model="draft"
            :label="t('settings.productName.label', 'Name shown by the app')"
            :hint="t('settings.productName.hint', 'Shown in the title bar, About, notifications and introductions.')"
            persistent-hint
            maxlength="80"
            @keydown.enter.prevent="save"
        />
        <div class="mb-product-name__actions">
            <v-btn variant="tonal" :disabled="draft.trim() === productDisplayName" @click="save">
                {{ t("settings.productName.save", "Use this display name") }}
            </v-btn>
            <v-btn variant="text" :disabled="productDisplayName === WORLDLENS_IDENTITY.shippedName" @click="reset">
                {{ t("settings.productName.reset", "Reset to Worldlens") }}
            </v-btn>
        </div>
        <p class="mb-product-name__boundary">
            {{
                t(
                    "settings.productName.boundary",
                    "This changes presentation only. The data folder, installer, packages, update feed, repository markers and diagnostic product name remain Worldlens.",
                )
            }}
        </p>
        <p class="mb-product-name__provenance">
            {{
                productDisplayName === WORLDLENS_IDENTITY.shippedName
                    ? t("settings.productName.default", "Current value: the built-in name Worldlens.")
                    : t("settings.productName.saved", { name: productDisplayName }, "Current value: {name}, saved on this device.")
            }}
        </p>
    </div>
</template>

<style scoped>
.mb-product-name {
    display: grid;
    gap: 10px;
}

.mb-product-name__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-product-name__boundary,
.mb-product-name__provenance {
    margin: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.8125rem;
    line-height: 1.5;
}
</style>


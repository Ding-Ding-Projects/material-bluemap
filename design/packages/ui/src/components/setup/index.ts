/**
 * First-run setup and the consent settings row.
 *
 * `FirstRunSetup` is the whole flow. Mount exactly one of them in the shell; it decides
 * for itself whether this is a first launch and stays invisible when it is not.
 *
 * `ConsentSettingsRow` is the other end of the same record, for the settings page. It is
 * where a render that lacks consent points somebody, which is why the flow never asks
 * the question a second time.
 */

export { default as FirstRunSetup } from "./FirstRunSetup.vue";
export { default as ConsentSettingsRow } from "./ConsentSettingsRow.vue";
export { default as ConsentQuote } from "./ConsentQuote.vue";
export { default as SetupEulaStep } from "./SetupEulaStep.vue";
export { default as SetupLanguagePanel } from "./SetupLanguagePanel.vue";
export { default as LanguageSettingsRow } from "./LanguageSettingsRow.vue";
export { default as SetupText } from "./SetupText.vue";

export {
    SETUP_STEPS,
    createConsentSettings,
    createFirstRunController,
    formatConsentTimestamp,
    resolveBridge,
    resolveStorageBridge,
} from "./firstRunFlow.js";
export type {
    ConsentAnswer,
    ConsentRecordLike,
    ConsentSettingsController,
    FirstRunController,
    FirstRunOptions,
    FirstRunStateLike,
    OptionalStorageBridge,
    SetupBridge,
    SetupStep,
} from "./firstRunFlow.js";

export {
    FUNNY_LEVELS,
    LANGUAGE_MODES,
    cantonese,
    documentLanguage,
    english,
    flat,
    funnyLevel,
    langAttr,
    languageMode,
    levelName,
    pair,
    reloadSetupLanguage,
    resetSetupLanguage,
    setFunnyLevel,
    setLanguageMode,
    useSetupI18n,
} from "./setupI18n.js";
export type { FunnyLevel, LanguageMode, SetupI18n, TextPair, TranslationVars } from "./setupI18n.js";

export {
    CONSENT_QUOTE,
    CONSENT_QUOTE_TRANSLATION,
    MOJANG_DOWNLOAD_HOST,
    MOJANG_EULA_URL,
    exactKeys,
    voicedKeys,
} from "./setupStrings.js";
export type { ExactKey, FixedKey, StringKey, VoicedKey } from "./setupStrings.js";

export {
    clearMapStorageDir,
    currentPlatform,
    defaultMapStorageDir,
    detectPlatform,
    expandsAtRenderTime,
    isAbsolutePath,
    joinMapStorageDir,
    mapStorageExample,
    normalizeMapStorageDir,
    pathSeparator,
    pathToken,
    readMapStorageDir,
    validateMapStorageDir,
    writeMapStorageDir,
} from "./mapStorage.js";
export type { MapStorageProblem, SetupPlatform } from "./mapStorage.js";

export { memoryStorage, setSetupStorage, setupStorage } from "./setupPrefs.js";
export type { SetupStorage } from "./setupPrefs.js";

export { consentSearchLabels } from "./consentSearch.js";
export { languageSearchLabels } from "./languageSearch.js";

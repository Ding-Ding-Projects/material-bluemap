/**
 * Automatic updates, as the interface sees them.
 *
 * Two surfaces over one controller. Mount exactly one {@link createUpdates} in the shell:
 *
 * ```ts
 * const updates = createUpdates({ onRefusal: (message) => raiseNotice("warning", message) });
 * ```
 *
 * then put {@link UpdateBanner} in the layout under the title bar and
 * {@link UpdateStatusRow} in the settings surface, both reading that one controller. Two
 * copies of the state is how a banner still offering 0.2.0 ends up beside a row that has
 * already installed it.
 *
 * The banner is the *offer* and appears only when there is one; the row is the state, and
 * is always there. Everything about when each appears is in `updateModel.ts` as pure
 * functions, so it is tested without mounting anything.
 */

export { default as UpdateBanner } from "./UpdateBanner.vue";
export { default as UpdateStatusRow } from "./UpdateStatusRow.vue";

export {
    resolveUpdateBridge,
    type UpdateBridge,
    type UpdateFailure,
    type UpdateFailureCode,
    type UpdateRestartRefusal,
    type UpdateRestartResult,
    type UpdateState,
    type UpdateStatus,
} from "./updateBridge.js";

export {
    UPDATE_FIXED,
    UPDATE_VOICED,
    isUpdateVoicedKey,
    updateCantonese,
    updateEnglish,
    updatePair,
    updateString,
    updateText,
    type UpdateCopyKey,
    type UpdateFixedKey,
    type UpdateVoicedKey,
} from "./updateCopy.js";

export {
    bannerFor,
    clearDismissedUpdate,
    dismissUpdate,
    readDismissedUpdate,
    statusFor,
    unknownUpdateState,
    type UpdateBannerModel,
    type UpdateStatusModel,
    type UpdateTone,
} from "./updateModel.js";

export { createUpdates, type UpdatesController, type UpdatesOptions } from "./useUpdates.js";

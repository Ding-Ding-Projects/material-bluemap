<script setup lang="ts">
/**
 * A render-mask shape, drawn rather than typed.
 *
 * `ConfigMaskField.vue` already lets somebody type `min-x`/`max-x`/... by hand; this sits
 * beside it as the other way in. It reads and writes the exact same record, through
 * `maskCanvas.ts`'s `fromMaskRecord`/`toMaskRecord`, so nothing here is a second source of
 * truth -- dragging a corner and typing a number both end up changing the same fields, and
 * either one is always free to correct the other.
 *
 * Height (`min-y`/`max-y`) is not drawn here: a top-down canvas has no honest gesture for
 * "how tall", so those two stay on `ConfigMaskField.vue`'s own numeric fields and this
 * component only ever reads and re-writes them unchanged.
 */
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCrosshairsGps,
    mdiEarth,
    mdiExport,
    mdiImport,
    mdiMagnetOn,
    mdiMagnifyMinusOutline,
    mdiMagnifyPlusOutline,
    mdiMapMarker,
    mdiPlus,
    mdiRedo,
    mdiRestore,
    mdiUndo,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VBtnToggle,
    VCard,
    VCardText,
    VChip,
    VIcon,
    VTextField,
    VTooltip,
} from "vuetify/components";
import type { PlainValue } from "@material-bluemap/config";
import {
    UNKNOWN_WORLD,
    addPolygonPoint,
    aroundSpawnPreset,
    JAVA_INT_MIN,
    canRedo,
    canUndo,
    defaultShapeFor,
    estimateArea,
    existingRegionsPreset,
    fromMaskRecord,
    initHistory,
    moveBox,
    moveBoxCorner,
    moveBoxEdge,
    moveCircleCenter,
    moveEllipseCenter,
    movePolygon,
    movePolygonPoint,
    nudgeStep,
    pushHistory,
    redo,
    removePolygonPoint,
    resizeCircle,
    resizeEllipseX,
    resizeEllipseZ,
    snapShape,
    toMaskRecord,
    undo,
    wholeWorldPreset,
    type BoxCorner,
    type BoxEdge,
    type BoxShape,
    type CircleShape,
    type DrawableShape,
    type EllipseShape,
    type History,
    type PolygonShape,
    type ShapeKind,
    type SnapMode,
    type WorldOrientation,
} from "./maskCanvas.js";
import {
    fitView,
    pointerToWorld,
    worldToPixel,
    zoomView,
    type PixelRect,
    type ViewState,
} from "./maskCanvasView.js";

const props = withDefaults(
    defineProps<{
        modelValue: Record<string, PlainValue>;
        shapeKind: ShapeKind;
        label: string;
        world?: WorldOrientation;
        disabled?: boolean;
    }>(),
    { disabled: false, world: () => UNKNOWN_WORLD },
);

const emit = defineEmits<{ "update:modelValue": [value: Record<string, PlainValue>] }>();

const { t } = useI18n();
const isDisabled = computed(() => props.disabled === true);
/**
 * `withDefaults` narrows `props.world` to a definite `WorldOrientation` for the script,
 * but the template's auto-exposed prop binding still sees the source interface's optional
 * `world?:`, thanks to `exactOptionalPropertyTypes` -- the same disagreement
 * `ConfigMaskField.vue` normalises for `disabled`. This shadows it once for the template.
 */
const world = computed<WorldOrientation>(() => props.world);

/* -------------------------------------------------------------------------- */
/* Shape state and history                                                    */
/* -------------------------------------------------------------------------- */

const history = ref<History<DrawableShape>>(
    initHistory(fromMaskRecord(props.modelValue, props.shapeKind)),
);
const shape = computed(() => history.value.present);

/**
 * A change made outside this component (the numeric fields elsewhere on the row, or a new
 * mask loaded) re-seeds a fresh history rather than merging into the undo stack: this
 * component's own undo/redo is a session over what *it* drew, not a rewrite of history
 * belonging to a keystroke somewhere else on the page.
 */
watch(
    () => props.modelValue,
    (next) => {
        const incoming = fromMaskRecord(next, props.shapeKind);
        if (JSON.stringify(incoming) !== JSON.stringify(shape.value)) {
            history.value = initHistory(incoming);
        }
    },
);

/**
 * Every emitted record carries `type` derived from the shape's OWN kind, not from
 * `props.shapeKind`. The two agree for every ordinary edit, because every editing
 * function in `maskCanvas.ts` preserves the shape's kind -- but `wholeWorldPreset()` is a
 * deliberate exception (see its own doc comment: "reset" is a genuine start-over and
 * always produces a box), so the record it produces must say `bluemap:box`, never
 * whatever kind the row happened to be a moment before.
 */
function emitShape(next: DrawableShape): void {
    emit("update:modelValue", {
        ...props.modelValue,
        ...toMaskRecord(next),
        type: `bluemap:${next.kind}`,
    });
}

function commit(next: DrawableShape): void {
    history.value = pushHistory(history.value, next);
    emitShape(next);
}

function doUndo(): void {
    history.value = undo(history.value);
    emitShape(history.value.present);
}

function doRedo(): void {
    history.value = redo(history.value);
    emitShape(history.value.present);
}

/* -------------------------------------------------------------------------- */
/* Snapping                                                                    */
/* -------------------------------------------------------------------------- */

const snap = ref<SnapMode>("chunk");

function applySnapNow(): void {
    commit(snapShape(shape.value, snap.value));
}

/* -------------------------------------------------------------------------- */
/* Orientation: what is honestly known about the world                        */
/* -------------------------------------------------------------------------- */

const orientationKnown = computed(() => props.world.extent !== null);

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

const regionsPreset = computed(() => existingRegionsPreset(props.world, props.shapeKind));

function applyWholeWorld(): void {
    commit(wholeWorldPreset().shape);
    fitToShape();
}

function applyExistingRegions(): void {
    const preset = regionsPreset.value;
    if (preset === null) return;
    commit(preset.shape);
    fitToShape();
}

function applyAroundSpawn(): void {
    commit(aroundSpawnPreset(props.world, props.shapeKind).shape);
    fitToShape();
}

function resetToWholeWorld(): void {
    applyWholeWorld();
}

/* -------------------------------------------------------------------------- */
/* Export and import: a mask shape, shared or reused as a plain JSON file    */
/* -------------------------------------------------------------------------- */

/**
 * The last export/import outcome, shown inline. This does not go through the app-wide
 * notification queue in `notifications.ts` -- that queue is owned by `ConfigScreen.vue`
 * several components up, and threading it down here would mean touching the shared
 * screen shell for a leaf component's own file dialog. The message is still non-blocking
 * (it never gates interaction) and still persists until the next action replaces it,
 * matching the "errors and warnings stay until dismissed" rule for the facts it carries.
 */
const fileStatus = ref<{ readonly kind: "success" | "error"; readonly text: string } | null>(null);
const importInput = ref<HTMLInputElement | null>(null);

/** What this shape actually is, as the same JSON a hand-typed `render-mask` entry uses. */
function exportPayload(): Record<string, PlainValue> {
    return { ...props.modelValue, ...toMaskRecord(shape.value) };
}

function exportShape(): void {
    const payload = exportPayload();
    const fileName = `mask-${shape.value.kind}-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 4)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    fileStatus.value = {
        kind: "success",
        text: t(
            "mask.export.done",
            { shapes: 1, path: fileName },
            "Saved {shapes} shapes to {path}, in blocks, Minecraft world coordinates.",
        ),
    };
}

function triggerImport(): void {
    importInput.value?.click();
}

async function onImportFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("The file does not hold a single mask shape object.");
        }
        const record = parsed as Record<string, unknown>;
        const rawType = typeof record["type"] === "string" ? record["type"] : "box";
        const importedKind = rawType.replace(/^bluemap:/, "") as ShapeKind;
        if (importedKind !== props.shapeKind) {
            throw new Error(
                `The file holds a "${importedKind}" shape, but this canvas is drawing a "${props.shapeKind}" shape. Change the shape type above first, then import again.`,
            );
        }
        commit(fromMaskRecord(record, importedKind));
        fitToShape();
        fileStatus.value = {
            kind: "success",
            text: t(
                "mask.import.done",
                { shapes: 1, path: file.name },
                "Loaded {shapes} shapes from {path}.",
            ),
        };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        fileStatus.value = {
            kind: "error",
            text: t(
                "mask.import.failed",
                { path: file.name, reason },
                "Could not load {path}: {reason}",
            ),
        };
    }
}

/* -------------------------------------------------------------------------- */
/* View: pan and zoom                                                         */
/* -------------------------------------------------------------------------- */

const surface = ref<HTMLElement | null>(null);
const view = ref<ViewState>({ centerX: 0, centerZ: 0, blocksPerPixel: 2 });

function currentRect(): PixelRect {
    const element = surface.value;
    if (element === null) return { left: 0, top: 0, width: 400, height: 300 };
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width || 400, height: rect.height || 300 };
}

function shapeBounds(target: DrawableShape): {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
} {
    switch (target.kind) {
        case "box":
            return { minX: target.minX, maxX: target.maxX, minZ: target.minZ, maxZ: target.maxZ };
        case "circle":
            return {
                minX: target.centerX - target.radius,
                maxX: target.centerX + target.radius,
                minZ: target.centerZ - target.radius,
                maxZ: target.centerZ + target.radius,
            };
        case "ellipse":
            return {
                minX: target.centerX - target.radiusX,
                maxX: target.centerX + target.radiusX,
                minZ: target.centerZ - target.radiusZ,
                maxZ: target.centerZ + target.radiusZ,
            };
        case "polygon": {
            const xs = target.points.map((point) => point.x);
            const zs = target.points.map((point) => point.z);
            return {
                minX: Math.min(...xs),
                maxX: Math.max(...xs),
                minZ: Math.min(...zs),
                maxZ: Math.max(...zs),
            };
        }
    }
}

function fitToShape(): void {
    void nextTick(() => {
        view.value = fitView(shapeBounds(shape.value), currentRect());
    });
}

fitToShape();

function zoomIn(): void {
    view.value = zoomView(view.value, 0.8);
}

function zoomOut(): void {
    view.value = zoomView(view.value, 1.25);
}

/* -------------------------------------------------------------------------- */
/* Cursor world-coordinate readout                                            */
/* -------------------------------------------------------------------------- */

const cursorWorld = ref<{ x: number; z: number } | null>(null);

function onPointerMoveOverCanvas(event: PointerEvent): void {
    cursorWorld.value = pointerToWorld(event.clientX, event.clientY, currentRect(), view.value);
}

function onPointerLeaveCanvas(): void {
    cursorWorld.value = null;
}

function worldFor(clientX: number, clientY: number) {
    return pointerToWorld(clientX, clientY, currentRect(), view.value);
}

function pixelFor(point: { x: number; z: number }) {
    return worldToPixel(point, currentRect(), view.value);
}

/* -------------------------------------------------------------------------- */
/* Pointer dragging                                                            */
/* -------------------------------------------------------------------------- */

type DragTarget =
    | { readonly kind: "box-edge"; readonly edge: BoxEdge }
    | { readonly kind: "box-corner"; readonly corner: BoxCorner }
    | { readonly kind: "circle-radius" }
    | { readonly kind: "ellipse-radius-x" }
    | { readonly kind: "ellipse-radius-z" }
    | { readonly kind: "polygon-point"; readonly index: number }
    | { readonly kind: "move" };

const dragging = ref<DragTarget | null>(null);

/**
 * The shape as it stood the instant a drag began. Every `pointermove` during the drag
 * writes straight into `history.present` without touching `past` -- a drag has to feel
 * continuous, not accumulate one undo step per pixel -- and this is what lets the drag's
 * end turn the *whole gesture* into exactly one step: push this original shape onto
 * `past`, keep whatever the drag left in `present`.
 */
const dragStartShape = ref<DrawableShape | null>(null);

function beginDrag(target: DragTarget, event: PointerEvent): void {
    if (isDisabled.value) return;
    dragging.value = target;
    dragStartShape.value = shape.value;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    selectedHandle.value = handleId(target);
    event.stopPropagation();
}

function onDragMove(event: PointerEvent): void {
    const target = dragging.value;
    if (target === null) return;
    const dx = event.movementX * view.value.blocksPerPixel;
    const dz = event.movementY * view.value.blocksPerPixel;
    const next = deltaShape(target, shape.value, dx, dz);
    if (next === null) return;
    history.value = { ...history.value, present: next };
    emitShape(next);
}

/** Computes what one delta does to `current`, without touching history. `null` if the target does not match the shape's own kind. */
function deltaShape(
    target: DragTarget,
    current: DrawableShape,
    dx: number,
    dz: number,
): DrawableShape | null {
    if (target.kind === "box-edge" && current.kind === "box") {
        return moveBoxEdge(
            current,
            target.edge,
            target.edge === "minX" || target.edge === "maxX" ? dx : dz,
        );
    }
    if (target.kind === "box-corner" && current.kind === "box")
        return moveBoxCorner(current, target.corner, dx, dz);
    if (target.kind === "circle-radius" && current.kind === "circle")
        return resizeCircle(current, dx);
    if (target.kind === "ellipse-radius-x" && current.kind === "ellipse")
        return resizeEllipseX(current, dx);
    if (target.kind === "ellipse-radius-z" && current.kind === "ellipse")
        return resizeEllipseZ(current, dz);
    if (target.kind === "polygon-point" && current.kind === "polygon")
        return movePolygonPoint(current, target.index, dx, dz);
    if (target.kind === "move") {
        if (current.kind === "box") return moveBox(current, dx, dz);
        if (current.kind === "circle") return moveCircleCenter(current, dx, dz);
        if (current.kind === "ellipse") return moveEllipseCenter(current, dx, dz);
        if (current.kind === "polygon") return movePolygon(current, dx, dz);
    }
    return null;
}

function onDragEnd(event: PointerEvent): void {
    if (dragging.value === null || dragStartShape.value === null) return;
    dragging.value = null;
    // One undo step for the whole gesture: the shape as it was before the drag becomes
    // the past entry, and whatever the drag left in `present` stays `present`.
    history.value = pushHistory(
        { ...history.value, present: dragStartShape.value },
        history.value.present,
    );
    dragStartShape.value = null;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
}

/* -------------------------------------------------------------------------- */
/* Keyboard: every handle is reachable and adjustable without a pointer       */
/* -------------------------------------------------------------------------- */

const selectedHandle = ref<string | null>(null);

function handleId(target: DragTarget): string {
    switch (target.kind) {
        case "box-edge":
            return `edge:${target.edge}`;
        case "box-corner":
            return `corner:${target.corner}`;
        case "circle-radius":
            return "circle-radius";
        case "ellipse-radius-x":
            return "ellipse-radius-x";
        case "ellipse-radius-z":
            return "ellipse-radius-z";
        case "polygon-point":
            return `point:${target.index}`;
        case "move":
            return "move";
    }
}

function selectHandle(id: string): void {
    selectedHandle.value = id;
}

/** Turns arrow-key input on a focused handle into the same delta a drag on it would make. */
function onHandleKeydown(target: DragTarget, event: KeyboardEvent): void {
    if (isDisabled.value) return;
    const step = nudgeStep(snap.value, event.shiftKey);
    let dx = 0;
    let dz = 0;
    switch (event.key) {
        case "ArrowLeft":
            dx = -step;
            break;
        case "ArrowRight":
            dx = step;
            break;
        case "ArrowUp":
            dz = -step;
            break;
        case "ArrowDown":
            dz = step;
            break;
        default:
            return;
    }
    event.preventDefault();
    const next = deltaShape(target, shape.value, dx, dz);
    if (next !== null) commit(next);
}

/** The keyboard-only creation path: focusing the canvas and pressing Enter places a shape. */
function createFromKeyboard(): void {
    commit(defaultShapeFor(props.shapeKind, props.world));
    fitToShape();
}

const hasShape = computed(() => {
    if (shape.value.kind === "polygon") return shape.value.points.length > 0;
    return true;
});

/**
 * The value a screen reader announces for a handle -- `role="slider"` promises a current
 * value, and an aria-label alone ("Resize corner se") never says what "se" is currently
 * at. Read after every drag frame and every keyboard nudge, same as the visible position.
 */
function boxCornerValueText(corner: BoxCorner, current: BoxShape): string {
    const x = corner === "nw" || corner === "sw" ? current.minX : current.maxX;
    const z = corner === "nw" || corner === "ne" ? current.minZ : current.maxZ;
    return `X ${x}, Z ${z}`;
}

/* -------------------------------------------------------------------------- */
/* Polygon point add/remove                                                   */
/* -------------------------------------------------------------------------- */

function addPointAfter(index: number): void {
    if (shape.value.kind !== "polygon") return;
    const current = shape.value;
    const a = current.points[index] ?? current.points[0];
    const b = current.points[(index + 1) % current.points.length] ?? a;
    if (a === undefined || b === undefined) return;
    commit(
        addPolygonPoint(
            current,
            { x: Math.round((a.x + b.x) / 2), z: Math.round((a.z + b.z) / 2) },
            index,
        ),
    );
}

function removePoint(index: number): void {
    if (shape.value.kind !== "polygon") return;
    commit(removePolygonPoint(shape.value, index));
}

/* -------------------------------------------------------------------------- */
/* Numeric fields: the always-available equivalent path                      */
/* -------------------------------------------------------------------------- */

/** Parsed as the user types; an invalid or partial number reports inline and changes nothing yet. */
const fieldErrors = ref<Record<string, string>>({});

function setNumberField(setter: (value: number) => void, key: string, raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-") {
        fieldErrors.value = {
            ...fieldErrors.value,
            [key]: t("config.maskCanvas.numberIncomplete", "Keep typing a number."),
        };
        return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
        fieldErrors.value = {
            ...fieldErrors.value,
            [key]: t("config.maskCanvas.numberInvalid", "That is not a number."),
        };
        return;
    }
    const { [key]: _dropped, ...rest } = fieldErrors.value;
    fieldErrors.value = rest;
    setter(value);
}

function setBoxField(field: "minX" | "maxX" | "minZ" | "maxZ", raw: string): void {
    if (shape.value.kind !== "box") return;
    const current = shape.value;
    setNumberField((value) => commit({ ...current, [field]: value } as BoxShape), field, raw);
}

function setCircleField(field: "centerX" | "centerZ" | "radius", raw: string): void {
    if (shape.value.kind !== "circle") return;
    const current = shape.value;
    setNumberField((value) => commit({ ...current, [field]: value } as CircleShape), field, raw);
}

function setEllipseField(field: "centerX" | "centerZ" | "radiusX" | "radiusZ", raw: string): void {
    if (shape.value.kind !== "ellipse") return;
    const current = shape.value;
    setNumberField((value) => commit({ ...current, [field]: value } as EllipseShape), field, raw);
}

function setPolygonPointField(index: number, axis: "x" | "z", raw: string): void {
    if (shape.value.kind !== "polygon") return;
    const current = shape.value;
    setNumberField(
        (value) =>
            commit({
                ...current,
                points: current.points.map((point, i) =>
                    i === index ? { ...point, [axis]: value } : point,
                ),
            } as PolygonShape),
        `point:${index}:${axis}`,
        raw,
    );
}

/* -------------------------------------------------------------------------- */
/* Cost readout                                                               */
/* -------------------------------------------------------------------------- */

const area = computed(() => estimateArea(shape.value));

const worldFraction = computed(() => {
    const extent = props.world.extent;
    if (extent === null || area.value.blocks === null) return null;
    const worldBlocks = Math.max(
        1,
        (extent.maxX - extent.minX + 1) * (extent.maxZ - extent.minZ + 1),
    );
    return area.value.blocks / worldBlocks;
});
</script>

<template>
    <div class="mb-mask-canvas" role="group" :aria-label="label">
        <v-alert
            v-if="!orientationKnown"
            type="info"
            density="compact"
            variant="tonal"
            class="mb-mask-canvas__orientation"
        >
            {{
                t(
                    "config.maskCanvas.orientationUnknown",
                    { reason: world.extentUnavailableReason ?? "" },
                    "The world's extent could not be determined ({reason}), so this canvas shows raw block coordinates on a plain grid rather than pretending to know the world's shape.",
                )
            }}
        </v-alert>

        <div class="mb-mask-canvas__toolbar">
            <v-btn-toggle
                v-model="snap"
                mandatory
                density="comfortable"
                variant="outlined"
                :disabled="isDisabled"
            >
                <v-btn value="off">{{ t("config.maskCanvas.snapOff", "No snap") }}</v-btn>
                <v-btn value="chunk">{{
                    t("config.maskCanvas.snapChunk", "Snap to chunk (16)")
                }}</v-btn>
                <v-btn value="region">{{
                    t("config.maskCanvas.snapRegion", "Snap to region (512)")
                }}</v-btn>
            </v-btn-toggle>
            <v-btn
                :prepend-icon="mdiMagnetOn"
                :disabled="isDisabled"
                variant="tonal"
                size="small"
                @click="applySnapNow"
            >
                {{ t("config.maskCanvas.snapNow", "Snap current shape") }}
            </v-btn>

            <v-btn
                :icon="mdiMagnifyPlusOutline"
                :aria-label="t('config.maskCanvas.zoomIn', 'Zoom in')"
                variant="text"
                size="small"
                @click="zoomIn"
            />
            <v-btn
                :icon="mdiMagnifyMinusOutline"
                :aria-label="t('config.maskCanvas.zoomOut', 'Zoom out')"
                variant="text"
                size="small"
                @click="zoomOut"
            />

            <v-btn
                :icon="mdiUndo"
                :aria-label="t('config.maskCanvas.undo', 'Undo')"
                :disabled="isDisabled || !canUndo(history)"
                variant="text"
                size="small"
                @click="doUndo"
            />
            <v-btn
                :icon="mdiRedo"
                :aria-label="t('config.maskCanvas.redo', 'Redo')"
                :disabled="isDisabled || !canRedo(history)"
                variant="text"
                size="small"
                @click="doRedo"
            />
        </div>

        <div class="mb-mask-canvas__presets">
            <v-btn
                :prepend-icon="mdiEarth"
                :disabled="isDisabled"
                variant="outlined"
                size="small"
                @click="applyWholeWorld"
            >
                {{ t("config.maskCanvas.presetWholeWorld", "Whole world") }}
            </v-btn>
            <v-btn
                :prepend-icon="mdiMapMarker"
                :disabled="isDisabled"
                variant="outlined"
                size="small"
                @click="applyAroundSpawn"
            >
                {{ t("config.maskCanvas.presetAroundSpawn", "Around spawn") }}
            </v-btn>
            <v-btn
                :prepend-icon="mdiCrosshairsGps"
                :disabled="isDisabled || regionsPreset === null"
                variant="outlined"
                size="small"
                @click="applyExistingRegions"
            >
                {{ t("config.maskCanvas.presetExistingRegions", "Extent of existing regions") }}
            </v-btn>
            <v-tooltip v-if="regionsPreset === null" activator="parent" location="bottom">
                {{
                    t(
                        "config.maskCanvas.presetExistingRegionsUnavailable",
                        "Not available: the world's region files have not been measured.",
                    )
                }}
            </v-tooltip>

            <v-btn
                :prepend-icon="mdiRestore"
                :disabled="isDisabled"
                variant="text"
                size="small"
                @click="resetToWholeWorld"
            >
                {{ t("config.maskCanvas.reset", "Reset to whole world") }}
            </v-btn>

            <v-btn
                :prepend-icon="mdiExport"
                :disabled="isDisabled"
                variant="text"
                size="small"
                @click="exportShape"
            >
                {{ t("mask.export.button", "Export mask…") }}
            </v-btn>
            <v-btn
                :prepend-icon="mdiImport"
                :disabled="isDisabled"
                variant="text"
                size="small"
                @click="triggerImport"
            >
                {{ t("mask.import.button", "Import mask…") }}
            </v-btn>
            <input
                ref="importInput"
                type="file"
                accept="application/json,.json"
                class="mb-mask-canvas__hiddenInput"
                @change="onImportFileChosen"
            />
        </div>

        <p
            class="mb-mask-canvas__presetNote"
            v-if="shape.kind === 'box' && shape.minX === JAVA_INT_MIN"
        >
            {{ wholeWorldPreset().description }}
        </p>

        <v-alert
            v-if="fileStatus !== null"
            :type="fileStatus.kind === 'success' ? 'success' : 'error'"
            density="compact"
            variant="tonal"
            closable
            @click:close="fileStatus = null"
        >
            {{ fileStatus.text }}
        </v-alert>

        <!--
          The drawing surface itself. Every handle below is independently focusable
          (`tabindex="0"`) with its own `keydown` nudge handler, so the whole shape is
          creatable and adjustable without a pointer: this is not a decorative fallback,
          the numeric fields further down are the *other* keyboard-complete path onto the
          same value.
        -->
        <div
            ref="surface"
            class="mb-mask-canvas__surface"
            :class="{ 'mb-mask-canvas__surface--unknown': !orientationKnown }"
            role="img"
            :aria-label="
                t('config.maskCanvas.surfaceLabel', 'A top-down drawing of the render mask shape')
            "
            tabindex="0"
            @pointermove="onPointerMoveOverCanvas"
            @pointerleave="onPointerLeaveCanvas"
            @keydown.enter="createFromKeyboard"
        >
            <svg
                v-if="hasShape"
                class="mb-mask-canvas__svg"
                @pointermove="onDragMove"
                @pointerup="onDragEnd"
                @pointercancel="onDragEnd"
            >
                <!-- World origin crosshair, always drawn so raw coordinates stay orientable. -->
                <line
                    :x1="pixelFor({ x: -1e9, z: 0 }).x"
                    :y1="pixelFor({ x: 0, z: 0 }).y"
                    :x2="pixelFor({ x: 1e9, z: 0 }).x"
                    :y2="pixelFor({ x: 0, z: 0 }).y"
                    class="mb-mask-canvas__origin"
                />
                <line
                    :x1="pixelFor({ x: 0, z: 0 }).x"
                    :y1="pixelFor({ x: 0, z: -1e9 }).y"
                    :x2="pixelFor({ x: 0, z: 0 }).x"
                    :y2="pixelFor({ x: 0, z: 1e9 }).y"
                    class="mb-mask-canvas__origin"
                />

                <rect
                    v-if="world.extent !== null"
                    :x="pixelFor({ x: world.extent.minX, z: world.extent.minZ }).x"
                    :y="pixelFor({ x: world.extent.minX, z: world.extent.minZ }).y"
                    :width="
                        pixelFor({ x: world.extent.maxX, z: world.extent.maxZ }).x -
                        pixelFor({ x: world.extent.minX, z: world.extent.minZ }).x
                    "
                    :height="
                        pixelFor({ x: world.extent.maxX, z: world.extent.maxZ }).y -
                        pixelFor({ x: world.extent.minX, z: world.extent.minZ }).y
                    "
                    class="mb-mask-canvas__extent"
                />

                <g
                    v-if="world.spawn !== null"
                    :transform="`translate(${pixelFor(world.spawn).x}, ${pixelFor(world.spawn).y})`"
                >
                    <circle r="5" class="mb-mask-canvas__spawn" />
                    <title>{{ t("config.maskCanvas.spawnMarker", "Spawn") }}</title>
                </g>

                <!-- Box -->
                <template v-if="shape.kind === 'box'">
                    <rect
                        :x="pixelFor({ x: shape.minX, z: shape.minZ }).x"
                        :y="pixelFor({ x: shape.minX, z: shape.minZ }).y"
                        :width="
                            pixelFor({ x: shape.maxX, z: shape.maxZ }).x -
                            pixelFor({ x: shape.minX, z: shape.minZ }).x
                        "
                        :height="
                            pixelFor({ x: shape.maxX, z: shape.maxZ }).y -
                            pixelFor({ x: shape.minX, z: shape.minZ }).y
                        "
                        class="mb-mask-canvas__shape"
                        tabindex="0"
                        role="slider"
                        :aria-label="t('config.maskCanvas.handleMove', 'Move the whole shape')"
                        :aria-valuetext="`X ${shape.minX}..${shape.maxX}, Z ${shape.minZ}..${shape.maxZ}`"
                        @pointerdown="(event: PointerEvent) => beginDrag({ kind: 'move' }, event)"
                        @keydown="
                            (event: KeyboardEvent) => onHandleKeydown({ kind: 'move' }, event)
                        "
                        @focus="selectHandle('move')"
                    />
                    <circle
                        v-for="corner in ['nw', 'ne', 'sw', 'se'] as const"
                        :key="corner"
                        :cx="
                            corner === 'nw' || corner === 'sw'
                                ? pixelFor({ x: shape.minX, z: 0 }).x
                                : pixelFor({ x: shape.maxX, z: 0 }).x
                        "
                        :cy="
                            corner === 'nw' || corner === 'ne'
                                ? pixelFor({ x: 0, z: shape.minZ }).y
                                : pixelFor({ x: 0, z: shape.maxZ }).y
                        "
                        r="6"
                        class="mb-mask-canvas__handle"
                        :class="{
                            'mb-mask-canvas__handle--selected':
                                selectedHandle === `corner:${corner}`,
                        }"
                        tabindex="0"
                        role="slider"
                        :aria-label="
                            t(
                                'config.maskCanvas.handleCorner',
                                { corner },
                                'Resize corner {corner}',
                            )
                        "
                        :aria-valuetext="boxCornerValueText(corner, shape)"
                        @pointerdown="
                            (event: PointerEvent) =>
                                beginDrag({ kind: 'box-corner', corner }, event)
                        "
                        @keydown="
                            (event: KeyboardEvent) =>
                                onHandleKeydown({ kind: 'box-corner', corner }, event)
                        "
                        @focus="selectHandle(`corner:${corner}`)"
                    />
                </template>

                <!-- Circle -->
                <template v-else-if="shape.kind === 'circle'">
                    <circle
                        :cx="pixelFor({ x: shape.centerX, z: shape.centerZ }).x"
                        :cy="pixelFor({ x: shape.centerX, z: shape.centerZ }).y"
                        :r="shape.radius / view.blocksPerPixel"
                        class="mb-mask-canvas__shape"
                        tabindex="0"
                        role="slider"
                        :aria-label="t('config.maskCanvas.handleMove', 'Move the whole shape')"
                        :aria-valuetext="`X ${shape.centerX}, Z ${shape.centerZ}`"
                        @pointerdown="(event: PointerEvent) => beginDrag({ kind: 'move' }, event)"
                        @keydown="
                            (event: KeyboardEvent) => onHandleKeydown({ kind: 'move' }, event)
                        "
                        @focus="selectHandle('move')"
                    />
                    <circle
                        :cx="pixelFor({ x: shape.centerX + shape.radius, z: shape.centerZ }).x"
                        :cy="pixelFor({ x: shape.centerX + shape.radius, z: shape.centerZ }).y"
                        r="6"
                        class="mb-mask-canvas__handle"
                        tabindex="0"
                        role="slider"
                        :aria-label="t('config.maskCanvas.handleRadius', 'Resize radius')"
                        :aria-valuetext="`${shape.radius} blocks`"
                        @pointerdown="
                            (event: PointerEvent) => beginDrag({ kind: 'circle-radius' }, event)
                        "
                        @keydown="
                            (event: KeyboardEvent) =>
                                onHandleKeydown({ kind: 'circle-radius' }, event)
                        "
                        @focus="selectHandle('circle-radius')"
                    />
                </template>

                <!-- Ellipse -->
                <template v-else-if="shape.kind === 'ellipse'">
                    <ellipse
                        :cx="pixelFor({ x: shape.centerX, z: shape.centerZ }).x"
                        :cy="pixelFor({ x: shape.centerX, z: shape.centerZ }).y"
                        :rx="shape.radiusX / view.blocksPerPixel"
                        :ry="shape.radiusZ / view.blocksPerPixel"
                        class="mb-mask-canvas__shape"
                        tabindex="0"
                        role="slider"
                        :aria-label="t('config.maskCanvas.handleMove', 'Move the whole shape')"
                        :aria-valuetext="`X ${shape.centerX}, Z ${shape.centerZ}`"
                        @pointerdown="(event: PointerEvent) => beginDrag({ kind: 'move' }, event)"
                        @keydown="
                            (event: KeyboardEvent) => onHandleKeydown({ kind: 'move' }, event)
                        "
                        @focus="selectHandle('move')"
                    />
                    <circle
                        :cx="pixelFor({ x: shape.centerX + shape.radiusX, z: shape.centerZ }).x"
                        :cy="pixelFor({ x: shape.centerX + shape.radiusX, z: shape.centerZ }).y"
                        r="6"
                        class="mb-mask-canvas__handle"
                        tabindex="0"
                        role="slider"
                        :aria-label="t('config.maskCanvas.handleRadiusX', 'Resize the X radius')"
                        :aria-valuetext="`${shape.radiusX} blocks`"
                        @pointerdown="
                            (event: PointerEvent) => beginDrag({ kind: 'ellipse-radius-x' }, event)
                        "
                        @keydown="
                            (event: KeyboardEvent) =>
                                onHandleKeydown({ kind: 'ellipse-radius-x' }, event)
                        "
                        @focus="selectHandle('ellipse-radius-x')"
                    />
                    <circle
                        :cx="pixelFor({ x: shape.centerX, z: shape.centerZ + shape.radiusZ }).x"
                        :cy="pixelFor({ x: shape.centerX, z: shape.centerZ + shape.radiusZ }).y"
                        r="6"
                        class="mb-mask-canvas__handle"
                        tabindex="0"
                        role="slider"
                        :aria-label="t('config.maskCanvas.handleRadiusZ', 'Resize the Z radius')"
                        :aria-valuetext="`${shape.radiusZ} blocks`"
                        @pointerdown="
                            (event: PointerEvent) => beginDrag({ kind: 'ellipse-radius-z' }, event)
                        "
                        @keydown="
                            (event: KeyboardEvent) =>
                                onHandleKeydown({ kind: 'ellipse-radius-z' }, event)
                        "
                        @focus="selectHandle('ellipse-radius-z')"
                    />
                </template>

                <!-- Polygon -->
                <template v-else-if="shape.kind === 'polygon'">
                    <polygon
                        :points="
                            shape.points
                                .map((point) => `${pixelFor(point).x},${pixelFor(point).y}`)
                                .join(' ')
                        "
                        class="mb-mask-canvas__shape"
                    />
                    <circle
                        v-for="(point, index) in shape.points"
                        :key="index"
                        :cx="pixelFor(point).x"
                        :cy="pixelFor(point).y"
                        r="6"
                        class="mb-mask-canvas__handle"
                        :class="{
                            'mb-mask-canvas__handle--selected': selectedHandle === `point:${index}`,
                        }"
                        tabindex="0"
                        role="slider"
                        :aria-label="
                            t(
                                'config.maskCanvas.handlePoint',
                                { index: index + 1 },
                                'Move vertex {index}',
                            )
                        "
                        :aria-valuetext="`X ${point.x}, Z ${point.z}`"
                        @pointerdown="
                            (event: PointerEvent) =>
                                beginDrag({ kind: 'polygon-point', index }, event)
                        "
                        @keydown="
                            (event: KeyboardEvent) =>
                                onHandleKeydown({ kind: 'polygon-point', index }, event)
                        "
                        @focus="selectHandle(`point:${index}`)"
                        @dblclick="removePoint(index)"
                    />
                </template>
            </svg>

            <p v-else class="mb-mask-canvas__empty">
                {{
                    t(
                        "config.maskCanvas.noShapeYet",
                        "No shape yet. Press Enter to place one, or fill in the fields below.",
                    )
                }}
                <v-btn
                    size="small"
                    variant="tonal"
                    :prepend-icon="mdiPlus"
                    @click="createFromKeyboard"
                    >{{ t("config.maskCanvas.createShape", "Create a shape") }}</v-btn
                >
            </p>
        </div>

        <div class="mb-mask-canvas__readouts">
            <v-chip size="small" variant="tonal">
                {{
                    cursorWorld === null
                        ? t("config.maskCanvas.cursorNone", "Cursor: not over the canvas")
                        : t(
                              "config.maskCanvas.cursorAt",
                              { x: Math.round(cursorWorld.x), z: Math.round(cursorWorld.z) },
                              "Cursor: X {x}, Z {z}",
                          )
                }}
            </v-chip>
            <!--
              This one shape's own footprint, as a compact "label: number unit" reading
              rather than the full sentence: `ConfigMaskField.vue` shows the whole render
              mask's cost as a sentence once, at the top of the list; this chip re-renders on
              every drag frame, so a short reading is the one that does not fight the eye.
              The label and unit words are `mask.cost.*` from `copy/surfaces/maskDraw.ts`,
              the same catalogue the whole-list sentence uses, so the vocabulary matches
              wherever a mask's cost is quoted in the app.
            -->
            <v-chip size="small" variant="tonal" :color="area.unbounded ? 'warning' : undefined">
                <template v-if="area.unbounded">
                    {{
                        t(
                            "mask.cost.unbounded",
                            "At least one shape has no limit on some axis, so no area number can be given.",
                        )
                    }}
                </template>
                <template v-else>
                    {{ t("mask.cost.label", "Selected area") }}:
                    {{ (area.blocks ?? 0).toLocaleString() }}
                    {{ t("mask.cost.units.blocks", "blocks") }},
                    {{ (area.chunks ?? 0).toLocaleString() }}
                    {{ t("mask.cost.units.chunks", "chunks") }},
                    {{ (area.regions ?? 0).toLocaleString() }}
                    {{ t("mask.cost.units.regions", "regions") }}
                    <span v-if="!area.exact">{{
                        t("config.maskCanvas.areaEstimateTag", " (estimate)")
                    }}</span>
                </template>
            </v-chip>
            <v-chip v-if="worldFraction !== null" size="small" variant="tonal">
                {{
                    t(
                        "config.maskCanvas.worldFraction",
                        { percent: (worldFraction * 100).toFixed(worldFraction < 0.01 ? 2 : 1) },
                        "{percent}% of the measured world",
                    )
                }}
            </v-chip>
        </div>

        <!-- Numeric fields: the always-available equivalent path to the drawing above. -->
        <div class="mb-mask-canvas__fields">
            <template v-if="shape.kind === 'box'">
                <v-text-field
                    :model-value="shape.minX"
                    type="number"
                    :label="t('config.maskCanvas.fieldMinX', 'Min X')"
                    :error-messages="fieldErrors['minX'] ? [fieldErrors['minX']] : []"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setBoxField('minX', value)"
                />
                <v-text-field
                    :model-value="shape.maxX"
                    type="number"
                    :label="t('config.maskCanvas.fieldMaxX', 'Max X')"
                    :error-messages="fieldErrors['maxX'] ? [fieldErrors['maxX']] : []"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setBoxField('maxX', value)"
                />
                <v-text-field
                    :model-value="shape.minZ"
                    type="number"
                    :label="t('config.maskCanvas.fieldMinZ', 'Min Z')"
                    :error-messages="fieldErrors['minZ'] ? [fieldErrors['minZ']] : []"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setBoxField('minZ', value)"
                />
                <v-text-field
                    :model-value="shape.maxZ"
                    type="number"
                    :label="t('config.maskCanvas.fieldMaxZ', 'Max Z')"
                    :error-messages="fieldErrors['maxZ'] ? [fieldErrors['maxZ']] : []"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setBoxField('maxZ', value)"
                />
            </template>

            <template v-else-if="shape.kind === 'circle'">
                <v-text-field
                    :model-value="shape.centerX"
                    type="number"
                    :label="t('config.maskCanvas.fieldCenterX', 'Center X')"
                    :error-messages="fieldErrors['centerX'] ? [fieldErrors['centerX']] : []"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setCircleField('centerX', value)"
                />
                <v-text-field
                    :model-value="shape.centerZ"
                    type="number"
                    :label="t('config.maskCanvas.fieldCenterZ', 'Center Z')"
                    :error-messages="fieldErrors['centerZ'] ? [fieldErrors['centerZ']] : []"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setCircleField('centerZ', value)"
                />
                <v-text-field
                    :model-value="shape.radius"
                    type="number"
                    :label="t('config.maskCanvas.fieldRadius', 'Radius')"
                    :error-messages="fieldErrors['radius'] ? [fieldErrors['radius']] : []"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setCircleField('radius', value)"
                />
            </template>

            <template v-else-if="shape.kind === 'ellipse'">
                <v-text-field
                    :model-value="shape.centerX"
                    type="number"
                    :label="t('config.maskCanvas.fieldCenterX', 'Center X')"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setEllipseField('centerX', value)"
                />
                <v-text-field
                    :model-value="shape.centerZ"
                    type="number"
                    :label="t('config.maskCanvas.fieldCenterZ', 'Center Z')"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setEllipseField('centerZ', value)"
                />
                <v-text-field
                    :model-value="shape.radiusX"
                    type="number"
                    :label="t('config.maskCanvas.fieldRadiusX', 'Radius X')"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setEllipseField('radiusX', value)"
                />
                <v-text-field
                    :model-value="shape.radiusZ"
                    type="number"
                    :label="t('config.maskCanvas.fieldRadiusZ', 'Radius Z')"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    :disabled="isDisabled"
                    @update:model-value="(value: string) => setEllipseField('radiusZ', value)"
                />
            </template>

            <template v-else-if="shape.kind === 'polygon'">
                <ol class="mb-mask-canvas__points">
                    <li v-for="(point, index) in shape.points" :key="index">
                        <v-text-field
                            :model-value="point.x"
                            type="number"
                            :label="
                                t(
                                    'config.maskCanvas.fieldPointX',
                                    { index: index + 1 },
                                    'Point {index} X',
                                )
                            "
                            density="compact"
                            variant="outlined"
                            hide-details="auto"
                            :disabled="isDisabled"
                            @update:model-value="
                                (value: string) => setPolygonPointField(index, 'x', value)
                            "
                        />
                        <v-text-field
                            :model-value="point.z"
                            type="number"
                            :label="
                                t(
                                    'config.maskCanvas.fieldPointZ',
                                    { index: index + 1 },
                                    'Point {index} Z',
                                )
                            "
                            density="compact"
                            variant="outlined"
                            hide-details="auto"
                            :disabled="isDisabled"
                            @update:model-value="
                                (value: string) => setPolygonPointField(index, 'z', value)
                            "
                        />
                        <v-btn
                            size="small"
                            variant="text"
                            :disabled="isDisabled"
                            @click="addPointAfter(index)"
                            >{{ t("config.maskCanvas.addPoint", "Add point after") }}</v-btn
                        >
                        <v-btn
                            size="small"
                            variant="text"
                            color="error"
                            :disabled="isDisabled || shape.points.length <= 3"
                            @click="removePoint(index)"
                        >
                            {{ t("config.maskCanvas.removePoint", "Remove") }}
                        </v-btn>
                    </li>
                </ol>
            </template>
        </div>
    </div>
</template>

<style>
.mb-mask-canvas {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-mask-canvas__toolbar,
.mb-mask-canvas__presets,
.mb-mask-canvas__readouts {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-mask-canvas__presetNote {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* Activated only via the Import button's own `.click()`; never a tab stop of its own. */
.mb-mask-canvas__hiddenInput {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

.mb-mask-canvas__surface {
    position: relative;
    width: 100%;
    min-height: 320px;
    max-width: 100%;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
    background: rgba(var(--v-theme-on-surface), 0.03);
}

.mb-mask-canvas__surface:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-mask-canvas__svg {
    width: 100%;
    height: 320px;
    display: block;
    touch-action: none;
}

.mb-mask-canvas__origin {
    stroke: rgba(var(--v-theme-on-surface), 0.25);
    stroke-width: 1;
}

.mb-mask-canvas__extent {
    fill: none;
    stroke: rgba(var(--v-theme-on-surface), 0.35);
    stroke-dasharray: 6 4;
}

.mb-mask-canvas__spawn {
    fill: rgb(var(--v-theme-error));
    stroke: white;
    stroke-width: 1.5;
}

.mb-mask-canvas__shape {
    fill: rgba(var(--v-theme-primary), 0.25);
    stroke: rgb(var(--v-theme-primary));
    stroke-width: 2;
    cursor: move;
}

.mb-mask-canvas__handle {
    fill: rgb(var(--v-theme-primary));
    stroke: white;
    stroke-width: 1.5;
    cursor: grab;
}

.mb-mask-canvas__handle:focus-visible,
.mb-mask-canvas__handle--selected {
    outline: 2px solid rgb(var(--v-theme-secondary));
    outline-offset: 2px;
}

.mb-mask-canvas__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    min-height: 320px;
    padding: 16px;
    text-align: center;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-mask-canvas__fields {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-mask-canvas__points {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
}

.mb-mask-canvas__points li {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

@media (prefers-reduced-motion: reduce) {
    .mb-mask-canvas__handle {
        transition: none;
    }
}
</style>

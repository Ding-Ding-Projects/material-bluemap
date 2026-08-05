/**
 * The per-element appearance editor.
 *
 * It opens anchored beside the element being edited, stays non-modal so the
 * element remains visible and usable while it is open, tracks the anchor as the
 * page scrolls or the element moves, and hands focus back to whatever opened it.
 *
 * Its own dialog is an appearance target like everything else. That is not a
 * flourish: a theming feature that cannot theme its own dialog has not proved it
 * can theme anything, because the one surface it definitely controls is the one it
 * left out.
 */

import { clear, el, formatShortcut, uniqueId } from "../../platform/dom.js";
import { announce } from "../../settings/dom.js";
import { fillPhrase, t } from "../../settings/i18n.js";
import { AnchoredPanel } from "../../search/anchoredPanel.js";
import type { AppearanceController } from "../controller.js";
import type { BoxValues, StateName } from "../model.js";
import { BOX_DEFAULTS, BOX_PROPERTIES, STATE_DEFAULTS, findTarget, styleId } from "../model.js";
import type { TypographyKey, TypographyProperty } from "../type/model.js";
import { TYPOGRAPHY_DEFAULTS, TYPOGRAPHY_PROPERTIES, capabilityOf } from "../type/model.js";
import type { ControlRow } from "./controls.js";
import { colorRow, fontRow, numberRow, selectRow, textRow, toggleRow } from "./controls.js";

export interface OpenEditorOptions {
    /** The control the editor hangs off. Focus returns here when it closes. */
    readonly anchor: HTMLElement;
    /** Appearance target kind, for example `tab`. */
    readonly kind: string;
    /** Instance id when one specific element is being edited. */
    readonly instance?: string | undefined;
    /** Visible name of that instance, shown in the scope control. */
    readonly instanceLabel?: string | undefined;
    readonly controller: AppearanceController;
}

const TYPOGRAPHY_GROUP_ORDER: readonly TypographyProperty["group"][] = [
    "family",
    "weightStyle",
    "decoration",
    "case",
    "color",
    "metrics",
    "effects",
];

/** One editor at a time. A second would fight the first over the same live target. */
let activePanel: AnchoredPanel | null = null;
let activeTracker: number | null = null;

export function closeAppearanceEditor(): void {
    activePanel?.close();
}

export function openAppearanceEditor(options: OpenEditorOptions): void {
    const found = findTarget(options.kind);
    if (found === undefined) {
        announce(t("editor.noTarget"));
        return;
    }
    // Bound to a const so the closures below keep the narrowed type: TypeScript does
    // not carry a narrowing from an early return into a function body.
    const target = found;

    activePanel?.close();

    const panel = new AnchoredPanel({
        anchor: options.anchor,
        // `anchor` here is the live element being edited -- a tab, a card, a whole page's
        // wrapping surface -- used only to position the editor beside it. It is not a toggle
        // button, so it must not also be exempt from the outside-click check: without this,
        // almost any click on a large wrapped element (a page root, a footer, the whole
        // command palette) would land "inside" the anchor and the editor would refuse to
        // close, which is the exact class of bug this file exists to avoid reintroducing.
        dismissBoundary: null,
        returnFocusTo: options.anchor,
        title: t("editor.titleFor", { name: t(target.labelKey) }),
        onClose: () => {
            if (activeTracker !== null) {
                window.cancelAnimationFrame(activeTracker);
                activeTracker = null;
            }
            if (activePanel === panel) activePanel = null;
            unsubscribe();
        },
    });
    activePanel = panel;

    let scope: "kind" | "instance" = options.instance === undefined ? "kind" : "instance";
    const currentId = (): string =>
        scope === "instance" ? styleId(options.kind, options.instance) : options.kind;

    const rows: ControlRow[] = [];
    const body = el("div", { class: "mb-editor-body" });
    const content = el("div", {
        class: "mb-appearance-editor",
        data: { mbKind: "appearance-editor" },
    });

    const unsubscribe = options.controller.store.subscribe(() => {
        for (const row of rows) row.refresh();
        refreshPreview();
        refreshUnknownNote();
    });

    /* ---------------------------------------------------------- *
     * Header, scope, preview
     * ---------------------------------------------------------- */

    const heading = el("h2", { class: "mb-editor-title" });
    fillPhrase(heading, "editor.titleFor", { name: t(target.labelKey) });

    const closeButton = el("button", {
        class: "md-icon-button",
        text: "Close",
        attrs: { type: "button", "aria-label": t("editor.close") },
    });
    closeButton.addEventListener("click", () => {
        panel.close();
    });

    content.append(el("div", { class: "mb-editor-head" }, heading, closeButton));

    if (target.descriptionKey !== undefined) {
        const description = el("p", { class: "md-field__help mb-help" });
        fillPhrase(description, target.descriptionKey);
        content.append(description);
    }

    if (options.instance !== undefined) {
        const scopeName = uniqueId("mb-scope");
        const legend = el("legend", { class: "md-field__label", text: t("editor.scope") });
        const fieldset = el("fieldset", { class: "mb-scope" }, legend);
        const choices: readonly { value: "kind" | "instance"; label: string }[] = [
            { value: "kind", label: t("editor.scopeKind", { name: t(target.labelKey) }) },
            {
                value: "instance",
                label: options.instanceLabel ?? t("editor.scopeInstance"),
            },
        ];
        for (const choice of choices) {
            const id = uniqueId("mb-scope-opt");
            const radio = el("input", {
                attrs: { id, type: "radio", name: scopeName, value: choice.value },
            });
            radio.checked = scope === choice.value;
            radio.addEventListener("change", () => {
                if (!radio.checked) return;
                scope = choice.value;
                rebuild();
            });
            fieldset.append(
                el(
                    "div",
                    { class: "mb-radio" },
                    radio,
                    el("label", { text: choice.label, attrs: { for: id } })
                )
            );
        }
        const scopeHelp = el("p", { class: "md-field__help mb-help" });
        fillPhrase(scopeHelp, "editor.scopeHelp");
        content.append(fieldset, scopeHelp);
    }

    const preview = el("div", { class: "mb-editor-preview" });
    const previewSample = el("span", { class: "mb-editor-sample" });
    preview.append(el("span", { class: "mb-editor-preview-label", text: t("type.preview") }), previewSample);
    content.append(preview);

    const liveNote = el("p", { class: "md-field__help mb-help" });
    fillPhrase(liveNote, "editor.livePreview");
    content.append(liveNote);

    const unknownNote = el("p", { class: "mb-capability-note", attrs: { role: "note", hidden: "" } });
    content.append(unknownNote);

    content.append(body);

    /* ---------------------------------------------------------- *
     * Footer
     * ---------------------------------------------------------- */

    const resetElement = el("button", {
        class: "md-button md-button--outlined",
        text: t("editor.resetElement"),
        attrs: { type: "button" },
    });
    resetElement.addEventListener("click", () => {
        options.controller.store.resetElement(currentId());
        announce(t("editor.resetElementDone", { name: t(target.labelKey) }));
    });

    const shortcutHint = el("p", { class: "md-field__help mb-help" });
    fillPhrase(shortcutHint, "editor.keyboardHint");

    content.append(
        el("div", { class: "mb-editor-foot" }, resetElement),
        el(
            "p",
            { class: "md-field__help mb-help mb-shortcut-hint" },
            document.createTextNode(`${formatShortcut(["Shift", "F10"])} · ${formatShortcut(["Alt", "Enter"])}`)
        ),
        shortcutHint
    );

    /* ---------------------------------------------------------- *
     * Rows
     * ---------------------------------------------------------- */

    function section(titleKey: string): HTMLElement {
        const wrapper = el("section", { class: "mb-editor-section" });
        wrapper.append(el("h3", { class: "mb-editor-section-title", text: t(titleKey) }));
        return wrapper;
    }

    function typographyRow(property: TypographyProperty): ControlRow {
        const store = options.controller.store;
        const capability = capabilityOf(property);
        const base = {
            labelKey: property.labelKey,
            descriptionKey: property.descriptionKey,
            capabilityNoteKey: capability.supported ? null : capability.reasonKey,
            onReset: (): void => {
                store.resetTypographyProperty(currentId(), property.key);
            },
            isDefault: (): boolean =>
                store.get(currentId()).typography[property.key] === TYPOGRAPHY_DEFAULTS[property.key],
        };
        const readString = (): string => String(store.get(currentId()).typography[property.key]);
        const readNumber = (): number => Number(store.get(currentId()).typography[property.key]);
        const writeValue = (value: string | number | boolean): void => {
            store.setTypography(
                currentId(),
                property.key,
                value as never
            );
        };

        switch (property.kind) {
            case "font":
                return fontRow({
                    ...base,
                    allowInherit: true,
                    families: () => options.controller.families(),
                    requestInstalled: () => options.controller.requestInstalledFonts(),
                    installedNoteKey: () => options.controller.installedNoteKey(),
                    read: readString,
                    write: writeValue,
                });
            case "toggle":
                return toggleRow({
                    ...base,
                    read: () => store.get(currentId()).typography[property.key] === true,
                    write: writeValue,
                });
            case "select":
                return selectRow({
                    ...base,
                    choices: property.choices ?? [],
                    read: readString,
                    write: (value) => {
                        // Weight is a number stored as a string in the choice list, because a
                        // select option value is always text. Converting here keeps the model
                        // honest rather than storing "400" where a number is expected.
                        writeValue(property.key === "fontWeight" ? Number(value) : value);
                    },
                });
            case "number":
                return numberRow({
                    ...base,
                    min: property.min ?? 0,
                    max: property.max ?? 100,
                    step: property.step ?? 1,
                    unit: property.unit,
                    read: readNumber,
                    write: writeValue,
                });
            case "color":
                return colorRow({
                    ...base,
                    allowInherit: true,
                    prefs: options.controller.prefs,
                    read: readString,
                    write: writeValue,
                });
            case "text":
                return textRow({
                    ...base,
                    maxLength: property.maxLength ?? 200,
                    read: readString,
                    write: writeValue,
                });
        }
    }

    function boxRow(property: (typeof BOX_PROPERTIES)[number]): ControlRow {
        const store = options.controller.store;
        const base = {
            labelKey: property.labelKey,
            onReset: (): void => {
                store.resetBoxProperty(currentId(), property.key);
            },
            isDefault: (): boolean =>
                store.get(currentId()).box[property.key] === BOX_DEFAULTS[property.key],
        };
        const write = (value: string | number): void => {
            store.setBox(currentId(), property.key, value as never);
        };
        switch (property.kind) {
            case "color":
                return colorRow({
                    ...base,
                    allowInherit: true,
                    prefs: options.controller.prefs,
                    read: () => String(store.get(currentId()).box[property.key]),
                    write,
                });
            case "number":
                return numberRow({
                    ...base,
                    descriptionKey: "box.inheritNote",
                    min: property.min ?? -1,
                    max: property.max ?? 64,
                    step: property.step ?? 1,
                    unit: property.unit,
                    read: () => Number(store.get(currentId()).box[property.key]),
                    write,
                });
            default:
                return textRow({
                    ...base,
                    descriptionKey: "box.decorNote",
                    maxLength: property.maxLength ?? 16,
                    read: () => String(store.get(currentId()).box[property.key]),
                    write,
                });
        }
    }

    function stateRow(state: StateName, key: keyof typeof STATE_DEFAULTS, labelKey: string): ControlRow {
        const store = options.controller.store;
        return colorRow({
            labelKey,
            allowInherit: true,
            prefs: options.controller.prefs,
            onReset: () => {
                store.resetStateProperty(currentId(), state, key);
            },
            isDefault: () => store.get(currentId()).states[state][key] === STATE_DEFAULTS[key],
            read: () => store.get(currentId()).states[state][key],
            write: (value) => {
                store.setState(currentId(), state, key, value);
            },
        });
    }

    function rebuild(): void {
        clear(body);
        rows.length = 0;

        const typography = section("type.title");
        for (const group of TYPOGRAPHY_GROUP_ORDER) {
            const groupProperties = TYPOGRAPHY_PROPERTIES.filter(
                (property) => property.group === group
            );
            if (groupProperties.length === 0) continue;
            const groupWrapper = el("div", { class: "mb-editor-group" });
            groupWrapper.append(
                el("h4", { class: "mb-editor-group-title", text: t(`type.group.${group}`) })
            );
            for (const property of groupProperties) {
                const row = typographyRow(property);
                rows.push(row);
                groupWrapper.append(row.element);
            }
            typography.append(groupWrapper);
        }

        const box = section("box.title");
        for (const property of BOX_PROPERTIES) {
            const row = boxRow(property);
            rows.push(row);
            box.append(row.element);
        }

        const states = section("state.title");
        const stateHelp = el("p", { class: "md-field__help mb-help" });
        fillPhrase(stateHelp, "state.help");
        states.append(stateHelp);
        for (const state of target.states) {
            const wrapper = el("div", { class: "mb-editor-group" });
            wrapper.append(el("h4", { class: "mb-editor-group-title", text: t(`state.${state}`) }));
            for (const [key, labelKey] of [
                ["background", "box.background"],
                ["borderColor", "box.borderColor"],
                ["textColor", "type.textColor"],
            ] as const) {
                const row = stateRow(state, key, labelKey);
                rows.push(row);
                wrapper.append(row.element);
            }
            states.append(wrapper);
        }

        body.append(typography, box, states);
        refreshPreview();
        refreshUnknownNote();
    }

    function refreshPreview(): void {
        const id = currentId();
        preview.dataset["mbKind"] = options.kind;
        preview.dataset["mbStyle"] = id.includes("#") ? id : "";
        previewSample.textContent = t(target.sampleKey);
    }

    function refreshUnknownNote(): void {
        const unknown = options.controller.store.get(currentId()).unknown;
        const count = Object.keys(unknown).length;
        if (count === 0) {
            unknownNote.hidden = true;
            unknownNote.textContent = "";
            return;
        }
        unknownNote.hidden = false;
        fillPhrase(unknownNote, "editor.unknownKept", { count });
    }

    rebuild();
    panel.show(content);
    trackAnchor(options.anchor, panel);
}

/**
 * Keep the panel attached while its anchor moves.
 *
 * `AnchoredPanel` already repositions on scroll, on resize, and when its own size
 * changes. What it cannot see is the anchor moving for another reason: a tab
 * reordering, a row expanding above it, a layout shift. This watches the anchor's
 * own rectangle and dispatches a scroll event, which is the reposition signal the
 * panel already listens for, rather than reaching into its internals.
 */
function trackAnchor(anchor: HTMLElement, panel: AnchoredPanel): void {
    let previous = anchor.getBoundingClientRect();
    const step = (): void => {
        if (!panel.isOpen) {
            activeTracker = null;
            return;
        }
        const rect = anchor.getBoundingClientRect();
        if (
            Math.abs(rect.left - previous.left) > 0.5 ||
            Math.abs(rect.top - previous.top) > 0.5 ||
            Math.abs(rect.width - previous.width) > 0.5 ||
            Math.abs(rect.height - previous.height) > 0.5
        ) {
            previous = rect;
            document.dispatchEvent(new Event("scroll"));
        }
        if (!anchor.isConnected) {
            panel.close();
            activeTracker = null;
            return;
        }
        activeTracker = window.requestAnimationFrame(step);
    };
    activeTracker = window.requestAnimationFrame(step);
}

/** Types re-exported so callers do not need a second import for the box value shape. */
export type { BoxValues, TypographyKey };

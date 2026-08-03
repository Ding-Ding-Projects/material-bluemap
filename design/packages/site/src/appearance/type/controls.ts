/**
 * The word-processor-depth typography controls.
 *
 * Every property in `TYPOGRAPHY_PROPERTIES` gets a control here, grouped the way a
 * word processor's font dialog groups them. A property this browser cannot render
 * is not skipped: it is rendered with a note saying so, its value is still stored,
 * and it is still written to an exported theme, so a browser that does render it
 * shows what the visitor set.
 *
 * The section is built here rather than inside the anchored editor so the same
 * controls can be dropped into any other surface without dragging the editor's
 * anchoring, scope, and preview along with them.
 */

import { el } from "../../platform/dom.js";
import { t } from "../../settings/i18n.js";
import type { AppearanceController } from "../controller.js";
import type { ControlRow } from "../editor/controls.js";
import { colorRow, fontRow, numberRow, selectRow, textRow, toggleRow } from "../editor/controls.js";
import type { TypographyProperty } from "./model.js";
import { TYPOGRAPHY_DEFAULTS, TYPOGRAPHY_PROPERTIES, capabilityOf } from "./model.js";

/** The order the groups appear in, chosen to match a font dialog rather than the model. */
export const TYPOGRAPHY_GROUP_ORDER: readonly TypographyProperty["group"][] = [
    "family",
    "weightStyle",
    "decoration",
    "case",
    "color",
    "metrics",
    "effects",
];

export interface TypographyControlsOptions {
    readonly controller: AppearanceController;
    /** The style id being edited. A function, because the editor's scope control changes it. */
    readonly styleId: () => string;
}

export interface TypographyControlsView {
    readonly element: HTMLElement;
    readonly rows: readonly ControlRow[];
}

/** One control for one typography property, wired to the appearance store. */
export function createTypographyRow(
    property: TypographyProperty,
    options: TypographyControlsOptions
): ControlRow {
    const store = options.controller.store;
    const capability = capabilityOf(property);
    const id = options.styleId;

    const base = {
        labelKey: property.labelKey,
        descriptionKey: property.descriptionKey,
        capabilityNoteKey: capability.supported ? null : capability.reasonKey,
        onReset: (): void => {
            store.resetTypographyProperty(id(), property.key);
        },
        isDefault: (): boolean =>
            store.get(id()).typography[property.key] === TYPOGRAPHY_DEFAULTS[property.key],
    };

    const readString = (): string => String(store.get(id()).typography[property.key]);
    const readNumber = (): number => Number(store.get(id()).typography[property.key]);
    const write = (value: string | number | boolean): void => {
        store.setTypography(id(), property.key, value as never);
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
                write,
            });
        case "toggle":
            return toggleRow({
                ...base,
                read: () => store.get(id()).typography[property.key] === true,
                write,
            });
        case "select":
            return selectRow({
                ...base,
                choices: property.choices ?? [],
                read: readString,
                write: (value) => {
                    // A select option's value is always text, but font weight is stored as a
                    // number. Converting here keeps the stored shape honest instead of
                    // leaving "400" where a number is expected.
                    write(property.key === "fontWeight" ? Number(value) : value);
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
                write,
            });
        case "color":
            return colorRow({
                ...base,
                allowInherit: true,
                prefs: options.controller.prefs,
                read: readString,
                write,
            });
        case "text":
            return textRow({
                ...base,
                maxLength: property.maxLength ?? 200,
                read: readString,
                write,
            });
    }
}

/** The whole typography section, grouped and titled. */
export function createTypographyControls(
    options: TypographyControlsOptions
): TypographyControlsView {
    const element = el("section", { class: "mb-editor-section" });
    element.append(el("h3", { class: "mb-editor-section-title", text: t("type.title") }));

    const rows: ControlRow[] = [];
    for (const group of TYPOGRAPHY_GROUP_ORDER) {
        const properties = TYPOGRAPHY_PROPERTIES.filter((property) => property.group === group);
        if (properties.length === 0) continue;
        const wrapper = el("div", { class: "mb-editor-group" });
        wrapper.append(
            el("h4", { class: "mb-editor-group-title", text: t(`type.group.${group}`) })
        );
        for (const property of properties) {
            const row = createTypographyRow(property, options);
            rows.push(row);
            wrapper.append(row.element);
        }
        element.append(wrapper);
    }

    // The one place CSS forces a compromise: a single decoration style applies to
    // every decoration line at once, so a wavy underline makes a strike wavy too.
    // Saying so beats silently drawing something the visitor did not ask for.
    element.append(el("p", { class: "md-field__help mb-help", text: t("type.strikeConflict") }));

    return { element, rows };
}

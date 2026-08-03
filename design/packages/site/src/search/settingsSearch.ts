/**
 * Settings search: option labels, their descriptions, and their current values.
 *
 * A match that sits on a different settings tab says so on the result row, using that tab's own
 * visible name, so a visitor who knows what a setting is called never has to guess which tab hides
 * it. Activating a result asks the settings surface to navigate there and draw attention to the
 * control.
 *
 * Current values are searched because "150%" and "Dark" are what a visitor remembers.
 */

import type { SearchableSetting, SettingsSearchHost } from "./contract.js";
import { el } from "./dom.js";
import type { BoundedRegexEvaluator } from "./evaluator.js";
import type { CandidateField } from "./runSearch.js";
import { createSearchSurface, highlightedText, metaChip } from "./searchSurface.js";
import type { SearchSurfaceView } from "./searchSurface.js";
import { label, phrase } from "./strings.js";

type SettingField = "label" | "value" | "description" | "keywords";

const SETTING_FIELDS: readonly CandidateField<SearchableSetting, SettingField>[] = [
    { name: "label", get: (setting) => setting.label },
    { name: "value", get: (setting) => setting.valueText },
    { name: "description", get: (setting) => setting.description },
    { name: "keywords", get: (setting) => setting.keywords?.join(" ") },
];

export interface SettingsSearchOptions {
    readonly host: SettingsSearchHost;
    readonly fieldId?: string;
    readonly evaluator?: BoundedRegexEvaluator | undefined;
}

export function createSettingsSearch(
    options: SettingsSearchOptions,
): SearchSurfaceView<SearchableSetting, SettingField> {
    const host = options.host;

    return createSearchSurface<SearchableSetting, SettingField>({
        fieldId: options.fieldId ?? "settings",
        labelText: label("settingsFieldLabel"),
        placeholder: phrase("settingsPlaceholder"),
        resultsLabel: label("settingsFieldLabel"),
        fields: SETTING_FIELDS,
        items: () => host.listSettings(),
        subscribe: (listener) => host.subscribe(listener),
        evaluator: options.evaluator,
        renderResult: ({ item, hit }) => {
            const button = el("button", {
                class: "mbm-result",
                attrs: { type: "button", "aria-label": label("settingsGoTo", { label: item.label }) },
            });

            button.append(
                hit !== null && hit.field === "label"
                    ? highlightedText(item.label, hit.span, "mbm-result__title")
                    : el("span", { class: "mbm-result__title", text: item.label }),
            );

            const onThisTab = item.tabId === host.activeTabId();
            const meta = el("div", { class: "mbm-result__meta" });
            meta.append(
                metaChip(
                    onThisTab
                        ? phrase("settingsOnThisTab")
                        : phrase("settingsOnOtherTab", { tab: item.tabLabel }),
                ),
            );
            if (item.sectionLabel !== undefined) {
                meta.append(metaChip(item.sectionLabel));
            }
            button.append(meta);

            const value = el("span", { class: "mbm-result__value" });
            value.append(document.createTextNode(`${phrase("settingsCurrentValue", { value: "" })}`));
            value.append(
                hit !== null && hit.field === "value"
                    ? highlightedText(item.valueText, hit.span, "mbm-result__value-text")
                    : el("span", { class: "mbm-result__value-text", text: item.valueText }),
            );
            button.append(value);

            if (item.description !== "") {
                button.append(
                    hit !== null && hit.field === "description"
                        ? highlightedText(item.description, hit.span, "mbm-result__excerpt")
                        : el("span", { class: "mbm-result__excerpt", text: item.description }),
                );
            }

            button.addEventListener("click", () => host.revealSetting(item.id));
            return button;
        },
    });
}

/** Mount the settings search into a container. */
export function mountSettingsSearch(
    container: HTMLElement,
    options: SettingsSearchOptions,
): SearchSurfaceView<SearchableSetting, SettingField> {
    const view = createSettingsSearch(options);
    container.append(view.element);
    return view;
}

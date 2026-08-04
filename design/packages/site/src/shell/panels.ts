/**
 * The three panels that hang off the top bar: appearance, language and tone, and the
 * notification centre.
 *
 * These are the shell's own controls. `src/settings/` is free to build a fuller settings page
 * on top of the same controllers; both surfaces write through the same objects, so they stay
 * in step with each other and with what is persisted.
 */

import { DENSITIES, THEME_MODES, type Density, type ThemeMode } from "../theme/ThemeController.js";
import { FUNNY_LEVELS, LANGUAGE_MODES, type FunnyLevel, type LanguageMode } from "../i18n/I18n.js";
import { clear, el, uniqueId } from "../platform/dom.js";
import type { I18n } from "../i18n/I18n.js";
import type { Notifications } from "../notifications/Notifications.js";
import type { Preferences } from "../platform/Preferences.js";
import type { StringKey } from "../i18n/strings.js";
import type { ThemeController } from "../theme/ThemeController.js";
import { confirmDestructive } from "../settings/confirm.js";

interface RadioGroupOptions<T extends string> {
    readonly i18n: I18n;
    readonly name: string;
    readonly legend: StringKey;
    readonly values: readonly T[];
    readonly labelFor: (value: T) => StringKey;
    readonly current: T;
    readonly onChange: (value: T) => void;
}

function radioGroup<T extends string>(options: RadioGroupOptions<T>): HTMLElement {
    const fieldset = el("fieldset", { class: "panel__group" });
    const legend = el("legend", { class: "md-field__label" });
    options.i18n.bindText(legend, options.legend);
    fieldset.append(legend);

    for (const value of options.values) {
        const id = uniqueId(`${options.name}-${value}`);
        const input = el("input", {
            class: "panel__radio",
            attrs: {
                type: "radio",
                name: options.name,
                id,
                value,
                ...(value === options.current ? { checked: true } : {}),
            },
        });
        input.addEventListener("change", () => {
            if (input.checked) options.onChange(value);
        });
        const label = el("label", { class: "panel__choice", attrs: { for: id } }, input);
        const text = el("span", { class: "md-label-large" });
        options.i18n.bindText(text, options.labelFor(value));
        label.append(text);
        fieldset.append(label);
    }
    return fieldset;
}

const THEME_LABEL: Record<ThemeMode, StringKey> = {
    system: "appearance.theme.system",
    light: "appearance.theme.light",
    dark: "appearance.theme.dark",
};

const DENSITY_LABEL: Record<Density, StringKey> = {
    comfortable: "appearance.density.comfortable",
    compact: "appearance.density.compact",
};

const LANGUAGE_LABEL: Record<LanguageMode, StringKey> = {
    en: "language.mode.en",
    yue: "language.mode.yue",
    bilingual: "language.mode.bilingual",
};

export function createAppearancePanel(deps: {
    readonly i18n: I18n;
    readonly theme: ThemeController;
    readonly notifications: Notifications;
}): HTMLElement {
    const { i18n, theme, notifications } = deps;
    const panel = el("div", { class: "panel" });

    const title = el("h2", { class: "md-title-medium" });
    i18n.bindText(title, "appearance.title");
    panel.append(title);

    panel.append(
        radioGroup<ThemeMode>({
            i18n,
            name: "site-theme",
            legend: "appearance.themeLabel",
            values: THEME_MODES,
            labelFor: (value) => THEME_LABEL[value],
            current: theme.mode,
            onChange: (value) => theme.setMode(value),
        }),
    );

    const themeHelp = el("p", { class: "md-body-small panel__help" });
    i18n.bindText(themeHelp, "appearance.themeHelp");
    panel.append(themeHelp);

    panel.append(
        radioGroup<Density>({
            i18n,
            name: "site-density",
            legend: "appearance.densityLabel",
            values: DENSITIES,
            labelFor: (value) => DENSITY_LABEL[value],
            current: theme.density,
            onChange: (value) => theme.setDensity(value),
        }),
    );

    const densityHelp = el("p", { class: "md-body-small panel__help" });
    i18n.bindText(densityHelp, "appearance.densityHelp");
    panel.append(densityHelp);

    const reset = el("button", {
        class: "md-button md-button--outlined",
        attrs: { type: "button" },
    });
    i18n.bindText(reset, "common.reset");
    reset.addEventListener("click", () => {
        theme.reset();
        for (const input of panel.querySelectorAll<HTMLInputElement>('input[name="site-theme"]')) {
            input.checked = input.value === theme.mode;
        }
        for (const input of panel.querySelectorAll<HTMLInputElement>(
            'input[name="site-density"]',
        )) {
            input.checked = input.value === theme.density;
        }
        notifications.notify({ severity: "success", title: { key: "appearance.resetDone" } });
    });
    panel.append(el("div", { class: "panel__actions" }, reset));

    return panel;
}

export function createLanguagePanel(deps: {
    readonly i18n: I18n;
    readonly prefs: Preferences;
}): HTMLElement {
    const { i18n, prefs } = deps;
    const panel = el("div", { class: "panel" });

    const title = el("h2", { class: "md-title-medium" });
    i18n.bindText(title, "language.title");
    panel.append(title);

    panel.append(
        radioGroup<LanguageMode>({
            i18n,
            name: "site-language",
            legend: "language.modeLabel",
            values: LANGUAGE_MODES,
            labelFor: (value) => LANGUAGE_LABEL[value],
            current: i18n.mode,
            onChange: (value) => i18n.setMode(value),
        }),
    );

    const modeHelp = el("p", { class: "md-body-small panel__help" });
    i18n.bindText(modeHelp, "language.modeHelp");
    panel.append(modeHelp);

    /*
     * Two sliders, one per language, wired to two separate settings. Moving the English one
     * does not touch Cantonese copy and moving the Cantonese one does not touch English copy,
     * which is the whole point of them being two controls rather than one.
     */
    const previewEn = el("p", { class: "md-body-small panel__preview", attrs: { lang: "en" } });
    const previewYue = el("p", { class: "md-body-small panel__preview", attrs: { lang: "zh-HK" } });

    function refreshPreviews(): void {
        previewEn.textContent = i18n.english("language.preview", { level: i18n.funnyEn });
        previewYue.textContent = i18n.cantonese("language.preview", { level: i18n.funnyYue });
    }

    function slider(language: "en" | "yue", legend: StringKey): HTMLElement {
        const id = uniqueId(`funny-${language}`);
        const outputId = `${id}-value`;
        const wrapper = el("div", { class: "panel__slider" });

        const label = el("label", { class: "md-field__label", attrs: { for: id } });
        i18n.bindText(label, legend);
        wrapper.append(label);

        const current = language === "en" ? i18n.funnyEn : i18n.funnyYue;
        const input = el("input", {
            class: "md-slider",
            attrs: {
                type: "range",
                id,
                min: "1",
                max: "5",
                step: "1",
                value: String(current),
                list: `${id}-ticks`,
                "aria-describedby": outputId,
            },
        });
        const output = el("output", {
            class: "md-label-large panel__slider-value",
            attrs: { id: outputId, for: id },
            text: i18n.levelName(current, language),
        });

        input.addEventListener("input", () => {
            const level = Number.parseInt(input.value, 10) as FunnyLevel;
            i18n.setFunnyLevel(language, level);
            output.textContent = i18n.levelName(level, language);
            refreshPreviews();
        });

        const ticks = el("datalist", { attrs: { id: `${id}-ticks` } });
        for (const level of FUNNY_LEVELS) {
            ticks.append(
                el("option", {
                    attrs: { value: String(level), label: i18n.levelName(level, language) },
                }),
            );
        }

        wrapper.append(el("div", { class: "panel__slider-row" }, input, output), ticks);
        return wrapper;
    }

    panel.append(slider("en", "language.funnyEnLabel"));
    panel.append(slider("yue", "language.funnyYueLabel"));

    const funnyHelp = el("p", { class: "md-body-small panel__help" });
    i18n.bindText(funnyHelp, "language.funnyHelp");
    panel.append(funnyHelp);

    refreshPreviews();
    panel.append(previewEn, previewYue);

    const disclosure = el("p", { class: "md-body-small panel__disclosure" });
    i18n.bindText(disclosure, "language.disclosure");
    panel.append(disclosure);

    if (!prefs.available) {
        const warning = el("p", {
            class: "md-body-small panel__warning",
            attrs: { role: "status" },
        });
        i18n.bindText(warning, "language.storageWarning");
        panel.append(warning);
    }

    const reset = el("button", {
        class: "md-button md-button--outlined",
        attrs: { type: "button" },
    });
    i18n.bindText(reset, "common.reset");
    reset.addEventListener("click", () => {
        i18n.reset();
        for (const input of panel.querySelectorAll<HTMLInputElement>(
            'input[name="site-language"]',
        )) {
            input.checked = input.value === i18n.mode;
        }
        const ranges = panel.querySelectorAll<HTMLInputElement>('input[type="range"]');
        const levels: FunnyLevel[] = [i18n.funnyEn, i18n.funnyYue];
        for (const [index, range] of [...ranges].entries()) {
            range.value = String(levels[index] ?? 3);
        }
        const outputs = panel.querySelectorAll<HTMLOutputElement>("output");
        const languages: ("en" | "yue")[] = ["en", "yue"];
        for (const [index, output] of [...outputs].entries()) {
            const language = languages[index] ?? "en";
            output.textContent = i18n.levelName(levels[index] ?? 3, language);
        }
        refreshPreviews();
    });
    panel.append(el("div", { class: "panel__actions" }, reset));

    i18n.subscribe(refreshPreviews);
    return panel;
}

export function createNotificationPanel(deps: {
    readonly i18n: I18n;
    readonly notifications: Notifications;
}): HTMLElement {
    const { i18n, notifications } = deps;
    const panel = el("div", { class: "notification-centre" });

    const title = el("h2", { class: "md-title-medium" });
    i18n.bindText(title, "notify.centreTitle");

    const clearAll = el("button", {
        class: "md-button md-button--text",
        attrs: { type: "button" },
    });
    i18n.bindText(clearAll, "notify.dismissAll");
    clearAll.addEventListener("click", async () => {
        const confirmed = await confirmDestructive(
            i18n.t("notify.clearAllConfirm", { count: notifications.list().length }),
        );
        if (confirmed) notifications.clearAll();
    });

    panel.append(el("div", { class: "notification-centre__header" }, title, clearAll));

    const body = el("div");
    panel.append(body);

    const draw = (): void => {
        notifications.renderCentre(body);
        clearAll.disabled = notifications.list().length === 0;
    };
    draw();
    notifications.subscribe(draw);
    i18n.subscribe(draw);

    return panel;
}

export { clear };

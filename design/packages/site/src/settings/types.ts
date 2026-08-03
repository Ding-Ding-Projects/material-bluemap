/**
 * The shape of a setting.
 *
 * Settings are declared as data rather than built by hand in the DOM so that the
 * same declaration feeds the settings page, the search index, the reset machinery,
 * and the export file. A control that exists in only one of those four is the
 * usual way a setting ends up unsearchable or unresettable.
 */

export type SettingValue = string | number | boolean;

export interface SettingCommon {
    /** Stable storage id. Never reused for a different meaning. */
    readonly id: string;
    readonly tab: string;
    readonly group: string;
    /** i18n key for the label. */
    readonly labelKey: string;
    /** i18n key for the explanatory line under the label. */
    readonly descriptionKey?: string | undefined;
    /**
     * Extra text folded into the search index: synonyms and the words a visitor is
     * likely to type. Searching only visible labels misses "dark mode" when the
     * label reads "Theme".
     */
    readonly keywords?: readonly string[] | undefined;
    /**
     * Marks a setting whose effect a visitor cannot see until something else is on.
     * The settings page shows the dependency instead of hiding the control, so a
     * search result never lands on a row that has silently vanished.
     */
    readonly dependsOn?: { readonly id: string; readonly equals: SettingValue } | undefined;
}

export interface ToggleSetting extends SettingCommon {
    readonly kind: "toggle";
    readonly defaultValue: boolean;
}

export interface SelectOption {
    readonly value: string;
    readonly labelKey: string;
    /** Rendered in its own typeface when the option names a font family. */
    readonly previewFontFamily?: string | undefined;
}

export interface SelectSetting extends SettingCommon {
    readonly kind: "select";
    readonly defaultValue: string;
    readonly options: readonly SelectOption[];
}

export interface SliderSetting extends SettingCommon {
    readonly kind: "slider";
    readonly defaultValue: number;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    /** i18n key prefix; `${key}.${value}` names each stop for screen readers. */
    readonly stopLabelKeyPrefix?: string | undefined;
    readonly unit?: string | undefined;
}

export interface NumberSetting extends SettingCommon {
    readonly kind: "number";
    readonly defaultValue: number;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly unit?: string | undefined;
}

export interface TextSetting extends SettingCommon {
    readonly kind: "text";
    readonly defaultValue: string;
    readonly maxLength: number;
    readonly placeholderKey?: string | undefined;
}

export interface ColorSetting extends SettingCommon {
    readonly kind: "color";
    /** Any representation the translator understands. Stored exactly as authored. */
    readonly defaultValue: string;
}

export interface FontSetting extends SettingCommon {
    readonly kind: "font";
    /** A font family id from the appearance controller's list. */
    readonly defaultValue: string;
    /** Restrict the list to monospace families. */
    readonly monospaceOnly?: boolean | undefined;
}

export interface ActionSetting extends SettingCommon {
    readonly kind: "action";
    /** i18n key for the button label. */
    readonly actionLabelKey: string;
    /** True when running this needs a confirmation gate. */
    readonly destructive: boolean;
    readonly run: () => void | Promise<void>;
}

export type SettingDefinition =
    | ToggleSetting
    | SelectSetting
    | SliderSetting
    | NumberSetting
    | TextSetting
    | ColorSetting
    | FontSetting
    | ActionSetting;

/** Settings that hold a value. Actions do not, so they are excluded from storage. */
export type StoredSetting = Exclude<SettingDefinition, ActionSetting>;

export function isStoredSetting(setting: SettingDefinition): setting is StoredSetting {
    return setting.kind !== "action";
}

export interface SettingsTab {
    readonly id: string;
    readonly labelKey: string;
    readonly descriptionKey?: string | undefined;
    /** Material Symbols-style glyph name is deliberately absent: the site bundles no icon font. */
    readonly groups: readonly SettingsGroup[];
}

export interface SettingsGroup {
    readonly id: string;
    readonly labelKey: string;
    readonly descriptionKey?: string | undefined;
}

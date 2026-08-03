/**
 * The infinite colour picker.
 *
 * The chooser is a continuous two-dimensional field plus a continuous hue track,
 * backed by numeric entry in eight colour spaces and a translator across fourteen
 * representations. Swatches, recent colours, and the eyedropper sit on top of that
 * as shortcuts; none of them is the chooser, and removing all three would still
 * leave every colour reachable.
 *
 * Nothing here asks the browser to parse a colour string, so the same text yields
 * the same value in every engine, and a value the visitor typed is never
 * reinterpreted by a stylesheet.
 */

import { clear, el, uniqueId } from "../../platform/dom.js";
import { announce, copyText } from "../../settings/dom.js";
import { fillPhrase, t } from "../../settings/i18n.js";
import type { Preferences } from "../../platform/Preferences.js";
import type { ColorSpace } from "./spaces.js";
import { COLOR_SPACES, componentsOf, convert, toAuthoredUnits, fromAuthoredUnits } from "./spaces.js";
import type { ColorValue } from "./value.js";
import { color, gamutReport, inSpace, round, srgb, toRenderableCss } from "./value.js";
import type { RepresentationId } from "./representations.js";
import { REPRESENTATIONS, REPRESENTATION_IDS, formatRepresentation, parseColor } from "./representations.js";
import { contrastReport, formatRatio } from "./contrast.js";
import { NAMED_COLOR_NAMES } from "./named.js";

const RECENTS_KEY = "appearance.recentColors";
const MAX_RECENTS = 12;

/** A small starting palette. Every one of these is reachable from the field as well. */
const PALETTE: readonly string[] = [
    "#000000",
    "#ffffff",
    "#6750a4",
    "#625b71",
    "#7d5260",
    "#b3261e",
    "#1e6e3c",
    "#1b5fa8",
    "#b26a00",
    "#5b5f97",
    "#00668b",
    "#8f4c38",
];

export interface ColorPickerOptions {
    /** Starting colour. Any representation the translator reads. */
    readonly initial: string;
    /** Called on every change, with the colour serialised in its authored space. */
    readonly onChange: (value: string) => void;
    /**
     * The surface the colour will sit on, used for the contrast readout. Contrast
     * against nothing in particular is a number that describes nothing.
     */
    readonly contrastAgainst?: string | undefined;
    /** Visible name of that surface, shown in the readout. */
    readonly contrastAgainstName?: string | undefined;
    /** Opaque page colour used to resolve translucency before measuring. */
    readonly pageColor?: string | undefined;
    readonly prefs?: Preferences | undefined;
}

export interface ColorPickerView {
    readonly element: HTMLElement;
    setValue(text: string): void;
    getValue(): string;
    /** Move keyboard focus to the first control, for a picker opened from a button. */
    focus(): void;
    destroy(): void;
}

interface Refs {
    field: HTMLElement;
    thumb: HTMLButtonElement;
    hue: HTMLInputElement;
    saturation: HTMLInputElement;
    brightness: HTMLInputElement;
    alpha: HTMLInputElement;
    alphaNumber: HTMLInputElement;
    spaceSelect: HTMLSelectElement;
    componentInputs: HTMLInputElement[];
    componentLabels: HTMLElement[];
    preview: HTMLElement;
    gamutPanel: HTMLElement;
    contrastPanel: HTMLElement;
    representationInputs: Map<RepresentationId, HTMLInputElement>;
    representationNotes: Map<RepresentationId, HTMLElement>;
    recentsRow: HTMLElement;
}

/** Serialise a value in its own space, so an OKLCH colour stays OKLCH in storage. */
export function serialiseColor(value: ColorValue): string {
    const representation: RepresentationId =
        value.space === "srgb"
            ? value.alpha < 1
                ? "hex8"
                : "hex"
            : value.space === "hsv"
              ? "hsv"
              : (value.space as RepresentationId);
    return formatRepresentation(value, representation).text;
}

export function createColorPicker(options: ColorPickerOptions): ColorPickerView {
    const parsedInitial = parseColor(options.initial);
    let value: ColorValue = parsedInitial.value ?? srgb(0.4, 0.31, 0.64, 1);
    let hueMemory = inSpace(value, "hsv").coords[0];
    let space: ColorSpace = value.space;
    let recents = readRecents(options.prefs);
    let destroyed = false;

    const idBase = uniqueId("mb-color");
    const helpId = `${idBase}-help`;

    const refs = {} as Refs;
    refs.representationInputs = new Map();
    refs.representationNotes = new Map();
    refs.componentInputs = [];
    refs.componentLabels = [];

    const root = el("div", {
        class: "mb-color-picker",
        data: { mbKind: "color-picker" },
        attrs: { role: "group", "aria-label": t("color.title") },
    });

    /* --------------------------------------------------------------
     * Continuous field
     * -------------------------------------------------------------- */

    refs.field = el("div", {
        class: "mb-color-field",
        attrs: { "aria-hidden": "true" },
    });
    refs.thumb = el("button", {
        class: "mb-color-thumb",
        attrs: {
            type: "button",
            "aria-label": t("color.field"),
            "aria-describedby": helpId,
        },
    });
    refs.field.append(refs.thumb);

    const fieldHelp = el("p", { class: "md-field__help mb-help", attrs: { id: helpId } });
    fillPhrase(fieldHelp, "color.fieldHelp");

    root.append(
        el("div", { class: "mb-color-stage" }, refs.field, buildPreview(refs)),
        fieldHelp
    );

    /* --------------------------------------------------------------
     * Axis sliders
     * -------------------------------------------------------------- */

    refs.hue = rangeInput(`${idBase}-hue`, 0, 360, 0.1);
    refs.saturation = rangeInput(`${idBase}-sat`, 0, 100, 0.1);
    refs.brightness = rangeInput(`${idBase}-val`, 0, 100, 0.1);
    refs.alpha = rangeInput(`${idBase}-alpha`, 0, 100, 0.1);

    root.append(
        el(
            "div",
            { class: "mb-color-sliders" },
            sliderRow("color.hue", refs.hue, "mb-track-hue"),
            sliderRow("color.saturation", refs.saturation, "mb-track-sat"),
            sliderRow("color.brightness", refs.brightness, "mb-track-val"),
            sliderRow("color.alpha", refs.alpha, "mb-track-alpha")
        )
    );

    /* --------------------------------------------------------------
     * Space and numeric entry
     * -------------------------------------------------------------- */

    refs.spaceSelect = el("select", {
        class: "md-field__select",
        attrs: { id: `${idBase}-space` },
    });
    for (const candidate of COLOR_SPACES) {
        refs.spaceSelect.append(
            el("option", { text: spaceLabel(candidate), attrs: { value: candidate } })
        );
    }

    const componentGrid = el("div", { class: "mb-color-components" });
    for (let index = 0; index < 3; index++) {
        const inputId = `${idBase}-c${index}`;
        const label = el("label", { class: "md-field__label", attrs: { for: inputId } });
        const input = el("input", {
            class: "md-field__input mb-input-number",
            attrs: { id: inputId, type: "number", inputmode: "decimal", autocomplete: "off" },
        });
        refs.componentLabels.push(label);
        refs.componentInputs.push(input);
        componentGrid.append(el("div", { class: "mb-field" }, label, input));
    }

    const alphaId = `${idBase}-alpha-n`;
    refs.alphaNumber = el("input", {
        class: "md-field__input mb-input-number",
        attrs: {
            id: alphaId,
            type: "number",
            min: "0",
            max: "1",
            step: "0.01",
            inputmode: "decimal",
            autocomplete: "off",
        },
    });
    componentGrid.append(
        el(
            "div",
            { class: "mb-field" },
            el("label", { class: "md-field__label", text: t("color.alpha"), attrs: { for: alphaId } }),
            refs.alphaNumber
        )
    );

    const spaceHelp = el("p", { class: "md-field__help mb-help" });
    fillPhrase(spaceHelp, "color.spaceHelp");

    root.append(
        el(
            "section",
            { class: "mb-color-section" },
            el("h3", { class: "mb-color-heading", text: t("color.components") }),
            el(
                "div",
                { class: "mb-field" },
                el("label", {
                    class: "md-field__label",
                    text: t("color.space"),
                    attrs: { for: `${idBase}-space` },
                }),
                refs.spaceSelect
            ),
            componentGrid,
            spaceHelp
        )
    );

    /* --------------------------------------------------------------
     * Gamut and contrast
     * -------------------------------------------------------------- */

    refs.gamutPanel = el("div", {
        class: "mb-color-gamut",
        attrs: { role: "status", hidden: "" },
    });
    refs.contrastPanel = el("div", { class: "mb-color-contrast", attrs: { role: "status" } });
    root.append(refs.gamutPanel, refs.contrastPanel);

    /* --------------------------------------------------------------
     * Translator
     * -------------------------------------------------------------- */

    const translator = el("section", { class: "mb-color-section" });
    translator.append(el("h3", { class: "mb-color-heading", text: t("color.translator") }));
    const translatorHelp = el("p", { class: "md-field__help mb-help" });
    fillPhrase(translatorHelp, "color.translatorHelp");
    translator.append(translatorHelp);

    const namedListId = `${idBase}-names`;
    const namedList = el("datalist", { attrs: { id: namedListId } });
    for (const name of NAMED_COLOR_NAMES) {
        namedList.append(el("option", { attrs: { value: name } }));
    }
    translator.append(namedList);

    for (const id of REPRESENTATION_IDS) {
        const info = REPRESENTATIONS[id];
        const inputId = `${idBase}-r-${id}`;
        const input = el("input", {
            class: "md-field__input mb-input-mono",
            attrs: {
                id: inputId,
                type: "text",
                autocomplete: "off",
                autocapitalize: "off",
                spellcheck: "false",
                ...(id === "named" ? { list: namedListId } : {}),
            },
        });
        const note = el("p", { class: "mb-color-note", attrs: { hidden: "" } });
        const copyButton = el("button", {
            class: "md-icon-button",
            text: "Copy",
            attrs: { type: "button", "aria-label": t("color.copy", { name: info.label }) },
        });
        copyButton.addEventListener("click", () => {
            void handleCopy(input, info.label);
        });
        input.addEventListener("change", () => {
            applyText(input.value, id);
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyText(input.value, id);
            }
        });

        refs.representationInputs.set(id, input);
        refs.representationNotes.set(id, note);
        translator.append(
            el(
                "div",
                { class: "mb-color-row" },
                el("label", { class: "md-field__label", text: info.label, attrs: { for: inputId } }),
                input,
                copyButton,
                note
            )
        );
    }
    root.append(translator);

    /* --------------------------------------------------------------
     * Shortcuts: palette, recents, eyedropper
     * -------------------------------------------------------------- */

    const shortcuts = el("section", { class: "mb-color-section" });
    shortcuts.append(el("h3", { class: "mb-color-heading", text: t("color.swatches") }));
    const swatchHelp = el("p", { class: "md-field__help mb-help" });
    fillPhrase(swatchHelp, "color.swatchesHelp");
    shortcuts.append(swatchHelp);

    const paletteRow = el("div", { class: "mb-swatch-row", attrs: { role: "group", "aria-label": t("color.swatches") } });
    for (const swatch of PALETTE) {
        paletteRow.append(swatchButton(swatch));
    }
    shortcuts.append(paletteRow);

    shortcuts.append(el("h3", { class: "mb-color-heading", text: t("color.recents") }));
    refs.recentsRow = el("div", {
        class: "mb-swatch-row",
        attrs: { role: "group", "aria-label": t("color.recents") },
    });
    shortcuts.append(refs.recentsRow);

    if (hasEyeDropper()) {
        const dropper = el("button", {
            class: "md-button md-button--tonal",
            text: t("color.eyedropper"),
            attrs: { type: "button" },
        });
        dropper.addEventListener("click", () => {
            void runEyeDropper();
        });
        shortcuts.append(dropper);
    } else {
        shortcuts.append(el("p", { class: "md-field__help mb-help", text: t("color.eyedropperUnsupported") }));
    }
    root.append(shortcuts);

    /* --------------------------------------------------------------
     * Behaviour
     * -------------------------------------------------------------- */

    function spaceLabel(candidate: ColorSpace): string {
        switch (candidate) {
            case "srgb":
                return "sRGB";
            case "hsl":
                return "HSL";
            case "hsv":
                return "HSV / HSB";
            case "hwb":
                return "HWB";
            case "lab":
                return "CIELAB";
            case "lch":
                return "LCH";
            case "oklab":
                return "OKLab";
            case "oklch":
                return "OKLCH";
        }
    }

    function buildPreview(target: Refs): HTMLElement {
        target.preview = el("div", { class: "mb-color-preview", attrs: { "aria-hidden": "true" } });
        return target.preview;
    }

    function rangeInput(id: string, min: number, max: number, step: number): HTMLInputElement {
        return el("input", {
            class: "md-slider mb-range",
            attrs: {
                id,
                type: "range",
                min: String(min),
                max: String(max),
                step: String(step),
            },
        });
    }

    function sliderRow(labelKey: string, input: HTMLInputElement, trackClass: string): HTMLElement {
        input.classList.add(trackClass);
        const label = el("label", { class: "md-field__label", attrs: { for: input.id } });
        fillPhrase(label, labelKey);
        const readout = el("output", { class: "mb-range-readout", attrs: { for: input.id } });
        input.addEventListener("input", () => {
            readout.textContent = input.value;
        });
        return el("div", { class: "mb-slider-row" }, label, input, readout);
    }

    function swatchButton(text: string): HTMLButtonElement {
        const parsed = parseColor(text);
        const rendered = parsed.value === null ? "transparent" : toRenderableCss(parsed.value);
        const button = el("button", {
            class: "mb-swatch",
            attrs: { type: "button", "aria-label": text, title: text },
        });
        button.style.setProperty("--mb-swatch-color", rendered);
        button.addEventListener("click", () => {
            applyText(text, null);
        });
        return button;
    }

    function setValueInternal(next: ColorValue, remember: boolean): void {
        value = next;
        space = next.space;
        const hsv = inSpace(next, "hsv").coords;
        if (hsv[1] > 0.01 && hsv[2] > 0.01) hueMemory = hsv[0];
        render();
        options.onChange(serialiseColor(value));
        if (remember) rememberRecent(serialiseColor(value));
    }

    function applyText(text: string, source: RepresentationId | null): void {
        const parsed = parseColor(text);
        if (parsed.value === null) {
            if (source !== null) {
                const note = refs.representationNotes.get(source);
                if (note !== undefined) {
                    note.textContent = t("color.invalid");
                    note.hidden = false;
                }
            }
            return;
        }
        setValueInternal(parsed.value, true);
    }

    function fromField(saturation: number, brightness: number): void {
        const clampedS = Math.min(100, Math.max(0, saturation));
        const clampedV = Math.min(100, Math.max(0, brightness));
        setValueInternal(color("hsv", [hueMemory, clampedS, clampedV], value.alpha), false);
        announce(
            `${t("color.saturation")} ${Math.round(clampedS)}, ${t("color.brightness")} ${Math.round(clampedV)}`
        );
    }

    function pointerToField(event: PointerEvent): void {
        const rect = refs.field.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        fromField(x, 100 - y);
    }

    refs.field.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        refs.field.setPointerCapture(event.pointerId);
        pointerToField(event);
        refs.thumb.focus();
    });
    refs.field.addEventListener("pointermove", (event) => {
        if (!refs.field.hasPointerCapture(event.pointerId)) return;
        pointerToField(event);
    });
    refs.field.addEventListener("pointerup", (event) => {
        if (refs.field.hasPointerCapture(event.pointerId)) {
            refs.field.releasePointerCapture(event.pointerId);
            rememberRecent(serialiseColor(value));
        }
    });

    refs.thumb.addEventListener("keydown", (event) => {
        const step = event.shiftKey ? 10 : 1;
        const hsv = inSpace(value, "hsv").coords;
        let saturation = hsv[1];
        let brightness = hsv[2];
        switch (event.key) {
            case "ArrowLeft":
                saturation -= step;
                break;
            case "ArrowRight":
                saturation += step;
                break;
            case "ArrowUp":
                brightness += step;
                break;
            case "ArrowDown":
                brightness -= step;
                break;
            case "Home":
                saturation = 0;
                break;
            case "End":
                saturation = 100;
                break;
            default:
                return;
        }
        event.preventDefault();
        fromField(saturation, brightness);
    });

    refs.hue.addEventListener("input", () => {
        hueMemory = Number(refs.hue.value);
        const hsv = inSpace(value, "hsv").coords;
        setValueInternal(color("hsv", [hueMemory, hsv[1], hsv[2]], value.alpha), false);
    });
    refs.hue.addEventListener("change", () => {
        rememberRecent(serialiseColor(value));
    });

    refs.saturation.addEventListener("input", () => {
        const hsv = inSpace(value, "hsv").coords;
        fromField(Number(refs.saturation.value), hsv[2]);
    });
    refs.brightness.addEventListener("input", () => {
        const hsv = inSpace(value, "hsv").coords;
        fromField(hsv[1], Number(refs.brightness.value));
    });
    refs.alpha.addEventListener("input", () => {
        setValueInternal({ ...value, alpha: Number(refs.alpha.value) / 100 }, false);
    });
    refs.alphaNumber.addEventListener("change", () => {
        const parsed = Number(refs.alphaNumber.value);
        if (!Number.isFinite(parsed)) return;
        setValueInternal({ ...value, alpha: Math.min(1, Math.max(0, parsed)) }, true);
    });

    refs.spaceSelect.addEventListener("change", () => {
        const next = refs.spaceSelect.value as ColorSpace;
        setValueInternal(inSpace(value, next), false);
    });

    for (const [index, input] of refs.componentInputs.entries()) {
        input.addEventListener("change", () => {
            const parsed = Number(input.value);
            if (!Number.isFinite(parsed)) {
                render();
                return;
            }
            const authored = toAuthoredUnits(space, inSpace(value, space).coords);
            const next: [number, number, number] = [authored[0], authored[1], authored[2]];
            next[index] = parsed;
            setValueInternal(color(space, fromAuthoredUnits(space, next), value.alpha), true);
        });
    }

    async function handleCopy(input: HTMLInputElement, name: string): Promise<void> {
        const copied = await copyText(input.value);
        if (copied) {
            announce(t("color.copied", { name }));
            return;
        }
        input.focus();
        input.select();
        announce(t("color.copyFailed"));
    }

    function hasEyeDropper(): boolean {
        return typeof window !== "undefined" && "EyeDropper" in window;
    }

    async function runEyeDropper(): Promise<void> {
        interface EyeDropperLike {
            open(): Promise<{ sRGBHex: string }>;
        }
        const constructor = (window as unknown as { EyeDropper?: new () => EyeDropperLike })
            .EyeDropper;
        if (constructor === undefined) return;
        try {
            const result = await new constructor().open();
            applyText(result.sRGBHex, null);
        } catch {
            // A cancelled pick is the common case and is not an error worth reporting.
        }
    }

    function rememberRecent(text: string): void {
        if (text === "") return;
        recents = [text, ...recents.filter((entry) => entry !== text)].slice(0, MAX_RECENTS);
        writeRecents(options.prefs, recents);
        renderRecents();
    }

    function renderRecents(): void {
        clear(refs.recentsRow);
        if (recents.length === 0) {
            refs.recentsRow.append(el("p", { class: "md-field__help mb-help", text: t("color.recentsEmpty") }));
            return;
        }
        for (const entry of recents) refs.recentsRow.append(swatchButton(entry));
    }

    function renderGamut(): void {
        const report = gamutReport(value);
        if (report.inGamut) {
            refs.gamutPanel.hidden = true;
            clear(refs.gamutPanel);
            return;
        }
        refs.gamutPanel.hidden = false;
        clear(refs.gamutPanel);
        const message = el("p", { class: "mb-color-warning" });
        fillPhrase(message, "color.gamutWarning");
        const authoredSwatch = el("span", { class: "mb-gamut-swatch" });
        authoredSwatch.style.setProperty(
            "--mb-swatch-color",
            `rgb(${report.authored.map((c) => Math.round(c * 255)).join(" ")})`
        );
        const displayedSwatch = el("span", { class: "mb-gamut-swatch" });
        displayedSwatch.style.setProperty(
            "--mb-swatch-color",
            `rgb(${report.displayed.map((c) => Math.round(c * 255)).join(" ")})`
        );
        refs.gamutPanel.append(
            message,
            el(
                "div",
                { class: "mb-gamut-compare" },
                el("span", { class: "mb-gamut-item" }, authoredSwatch, el("span", { text: t("color.gamutAuthored") })),
                el("span", { class: "mb-gamut-item" }, displayedSwatch, el("span", { text: t("color.gamutDisplayed") }))
            )
        );
    }

    function renderContrast(): void {
        clear(refs.contrastPanel);
        const backdropText = options.contrastAgainst ?? "#ffffff";
        const backdrop = parseColor(backdropText).value ?? srgb(1, 1, 1, 1);
        const page = parseColor(options.pageColor ?? backdropText).value ?? srgb(1, 1, 1, 1);
        const report = contrastReport(value, backdrop, page);
        const name = options.contrastAgainstName ?? backdropText;

        const heading = el("span", {
            class: "mb-contrast-label",
            text: `${t("color.contrast")}: ${formatRatio(report.ratio)}`,
        });
        const against = el("span", {
            class: "mb-contrast-against",
            text: t("color.contrastAgainst", { name }),
        });
        const verdict = el("span", {
            class: "mb-contrast-verdict",
            text:
                report.grade === "fail"
                    ? t("color.contrastFail")
                    : t("color.contrastPass", {
                          level:
                              report.grade === "aaa"
                                  ? "WCAG AAA"
                                  : report.grade === "aa"
                                    ? "WCAG AA"
                                    : "WCAG AA (large text)",
                      }),
        });
        refs.contrastPanel.dataset["grade"] = report.grade;
        refs.contrastPanel.append(heading, against, verdict);
        if (report.composited) {
            refs.contrastPanel.append(
                el("span", { class: "md-field__help mb-help", text: t("color.contrastComposited") })
            );
        }
    }

    function render(): void {
        if (destroyed) return;
        const hsv = inSpace(value, "hsv").coords;
        const displayHue = hsv[1] < 0.01 || hsv[2] < 0.01 ? hueMemory : hsv[0];

        refs.field.style.setProperty(
            "--mb-field-hue",
            toRenderableCss(color("hsv", [displayHue, 100, 100], 1))
        );
        refs.thumb.style.setProperty("--mb-thumb-x", `${hsv[1]}%`);
        refs.thumb.style.setProperty("--mb-thumb-y", `${100 - hsv[2]}%`);
        refs.thumb.style.setProperty("--mb-thumb-color", toRenderableCss(value));
        refs.thumb.setAttribute(
            "aria-label",
            `${t("color.field")}: ${t("color.saturation")} ${Math.round(hsv[1])}, ${t("color.brightness")} ${Math.round(hsv[2])}`
        );

        refs.hue.value = String(round(displayHue, 1));
        refs.saturation.value = String(round(hsv[1], 1));
        refs.brightness.value = String(round(hsv[2], 1));
        refs.alpha.value = String(round(value.alpha * 100, 1));
        refs.alphaNumber.value = String(round(value.alpha, 4));
        for (const input of [refs.hue, refs.saturation, refs.brightness, refs.alpha]) {
            input.dispatchEvent(new Event("input", { bubbles: false }));
        }
        refs.alpha.style.setProperty(
            "--mb-alpha-color",
            toRenderableCss({ ...value, alpha: 1 })
        );

        refs.preview.style.setProperty("--mb-swatch-color", toRenderableCss(value));
        refs.spaceSelect.value = space;

        const infos = componentsOf(space);
        const authored = toAuthoredUnits(space, convert(value.space, space, value.coords));
        for (let index = 0; index < 3; index++) {
            const info = infos[index] as (typeof infos)[0];
            const label = refs.componentLabels[index];
            const input = refs.componentInputs[index];
            if (label === undefined || input === undefined) continue;
            label.textContent = info.unit === "" ? info.label : `${info.label} (${info.unit})`;
            input.min = String(info.min);
            input.max = info.cyclic ? String(info.max) : String(info.max);
            input.step = String(info.step);
            if (document.activeElement !== input) {
                input.value = String(round(authored[index] ?? 0, info.precision));
            }
        }

        for (const id of REPRESENTATION_IDS) {
            const input = refs.representationInputs.get(id);
            const note = refs.representationNotes.get(id);
            if (input === undefined || note === undefined) continue;
            const formatted = formatRepresentation(value, id);
            if (document.activeElement !== input) input.value = formatted.text;
            const messages: string[] = [];
            for (const loss of formatted.losses) {
                if (loss === "alpha") messages.push(t("color.lossAlpha"));
                else if (loss === "gamut") messages.push(t("color.lossGamut"));
                else if (loss === "no-exact-name") messages.push(t("color.noName"));
                else messages.push(t("color.lossCmyk"));
            }
            note.textContent = messages.join(" ");
            note.hidden = messages.length === 0;
        }

        renderGamut();
        renderContrast();
    }

    renderRecents();
    render();

    return {
        element: root,
        setValue(text: string): void {
            const parsed = parseColor(text);
            if (parsed.value === null) return;
            value = parsed.value;
            space = value.space;
            render();
        },
        getValue(): string {
            return serialiseColor(value);
        },
        focus(): void {
            refs.thumb.focus();
        },
        destroy(): void {
            destroyed = true;
            root.remove();
        },
    };
}

function readRecents(prefs: Preferences | undefined): string[] {
    if (prefs === undefined) return [];
    const stored = prefs.readJson<string[]>(RECENTS_KEY, (raw) => {
        if (!Array.isArray(raw)) return undefined;
        return raw.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_RECENTS);
    });
    return stored ?? [];
}

function writeRecents(prefs: Preferences | undefined, recents: readonly string[]): void {
    prefs?.writeJson(RECENTS_KEY, recents);
}


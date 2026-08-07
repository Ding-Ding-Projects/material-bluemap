/**
 * Named presets, and the theme file that carries them off this machine.
 *
 * A preset is every per-element override under a name. The exported file is the
 * same thing plus the saved presets and, optionally, the current settings, so a
 * customised look survives a cleared browser and can be handed to someone else.
 *
 * Import never trims. A property this build has no control for is kept on the
 * element it belonged to, reported by name, and written out again unchanged.
 */

import { clear, el, uniqueId } from "../platform/dom.js";
import { announce, downloadFile, pickFile } from "../settings/dom.js";
import { fillPhrase, t } from "../settings/i18n.js";
import type { AppearanceController } from "./controller.js";

export interface PresetsPanelOptions {
    readonly controller: AppearanceController;
    /** Current settings, folded into the exported file so one file carries the whole look. */
    readonly settingsSnapshot: () => Record<string, string | number | boolean>;
    /** Apply an imported settings block. Returns how many values were applied. */
    readonly applySettings: (values: Record<string, unknown>) => number;
    /** Gate a destructive action. Resolves true when the visitor confirmed. */
    readonly confirmDestructive: (message: string) => Promise<boolean>;
}

export interface PresetsPanelView {
    readonly element: HTMLElement;
    refresh(): void;
}

export function createPresetsPanel(options: PresetsPanelOptions): PresetsPanelView {
    const store = options.controller.store;
    const root = el("section", { class: "mb-presets" });

    const heading = el("h3", { class: "mb-section-title" });
    fillPhrase(heading, "preset.title");
    const help = el("p", { class: "md-field__help mb-help" });
    fillPhrase(help, "preset.help");
    root.append(heading, help);

    /* ---------------------------------------------------------- *
     * Save
     * ---------------------------------------------------------- */

    const nameId = uniqueId("mb-preset-name");
    const nameInput = el("input", {
        class: "md-field__input",
        attrs: { id: nameId, type: "text", maxlength: "80", autocomplete: "off" },
    });
    const saveButton = el("button", {
        class: "md-button md-button--filled",
        text: t("preset.save"),
        attrs: { type: "button" },
    });
    const saveStatus = el("p", { class: "md-field__help mb-help", attrs: { role: "status" } });

    saveButton.addEventListener("click", () => {
        const name = nameInput.value.trim();
        if (name === "") {
            nameInput.focus();
            return;
        }
        const result = store.savePreset(name);
        if (result.saved) {
            nameInput.value = "";
            saveStatus.textContent = t("preset.saved", { name });
            announce(saveStatus.textContent);
            render();
            return;
        }
        if (result.reason === "name-taken") {
            clear(saveStatus);
            saveStatus.append(
                document.createTextNode(t("preset.nameTaken", { name })),
                document.createTextNode(" ")
            );
            const replace = el("button", {
                class: "md-button md-button--outlined",
                text: t("preset.replace"),
                attrs: { type: "button" },
            });
            replace.addEventListener("click", () => {
                store.savePreset(name, true);
                nameInput.value = "";
                saveStatus.textContent = t("preset.saved", { name });
                announce(saveStatus.textContent);
                render();
            });
            saveStatus.append(replace);
        }
    });

    const nameLabel = el("label", { class: "md-field__label", attrs: { for: nameId } });
    fillPhrase(nameLabel, "preset.nameLabel");
    root.append(
        el("div", { class: "mb-preset-save" }, nameLabel, nameInput, saveButton),
        saveStatus
    );

    /* ---------------------------------------------------------- *
     * List
     * ---------------------------------------------------------- */

    const list = el("ul", { class: "mb-preset-list" });
    root.append(list);

    /**
     * Bulk selection over the saved presets. Small lists, so the honest scope is simple:
     * "select all" always means every saved preset, never a filtered subset -- there is no
     * search field on this list (see menuCoverage.test.ts and the site contract audit for
     * why: with typically a handful of named presets, a filter would be decoration rather
     * than a feature, the same reasoning that keeps a search field off a four-item menu).
     */
    const selected = new Set<string>();

    const selectAllButton = el("button", {
        class: "md-button md-button--text",
        text: t("preset.selectAll"),
        attrs: { type: "button" },
    });
    const clearSelectionButton = el("button", {
        class: "md-button md-button--text",
        text: t("preset.clearSelection"),
        attrs: { type: "button" },
    });
    const deleteSelectedButton = el("button", {
        class: "md-button md-button--outlined md-button--danger",
        text: t("preset.deleteSelected"),
        attrs: { type: "button" },
    });
    const exportSelectedButton = el("button", {
        class: "md-button md-button--outlined",
        text: t("preset.exportSelected"),
        attrs: { type: "button" },
    });
    const selectionCount = el("p", { class: "md-field__help mb-help", attrs: { role: "status" } });
    const exportSelectedHelp = el("p", { class: "md-field__help mb-help" });
    fillPhrase(exportSelectedHelp, "preset.exportSelectedDesc");

    function updateSelectionBar(): void {
        const total = store.presets().length;
        selectionCount.textContent = t("preset.selectionCount", { selected: selected.size, total });
        const hasSelection = selected.size > 0;
        deleteSelectedButton.disabled = !hasSelection;
        exportSelectedButton.disabled = !hasSelection;
        clearSelectionButton.disabled = !hasSelection;
        selectAllButton.disabled = total === 0;
    }

    selectAllButton.addEventListener("click", () => {
        for (const preset of store.presets()) selected.add(preset.id);
        render();
    });
    clearSelectionButton.addEventListener("click", () => {
        selected.clear();
        render();
    });
    deleteSelectedButton.addEventListener("click", () => {
        void (async (): Promise<void> => {
            const ids = [...selected];
            if (ids.length === 0) return;
            const confirmed = await options.confirmDestructive(
                t("preset.deleteSelectedConfirm", { count: ids.length })
            );
            if (!confirmed) return;
            const removed = store.deletePresets(ids);
            selected.clear();
            transferStatus.textContent = t("preset.selectedDeleted", { count: removed });
            announce(transferStatus.textContent);
            render();
        })();
    });
    exportSelectedButton.addEventListener("click", () => {
        const ids = [...selected];
        if (ids.length === 0) return;
        const theme = store.exportPresets(ids);
        const stamp = new Date().toISOString().slice(0, 10);
        downloadFile(
            `worldlens-presets-selected-${stamp}.json`,
            `${JSON.stringify(theme, null, 4)}\n`,
            "application/json"
        );
    });

    root.append(
        el(
            "div",
            { class: "mb-preset-selection" },
            selectAllButton,
            clearSelectionButton,
            deleteSelectedButton,
            exportSelectedButton,
            selectionCount
        ),
        exportSelectedHelp
    );

    /* ---------------------------------------------------------- *
     * Export and import
     * ---------------------------------------------------------- */

    const exportButton = el("button", {
        class: "md-button md-button--outlined",
        text: t("preset.export"),
        attrs: { type: "button" },
    });
    exportButton.addEventListener("click", () => {
        const theme = store.exportTheme(options.settingsSnapshot());
        const stamp = new Date().toISOString().slice(0, 10);
        downloadFile(
            `worldlens-theme-${stamp}.json`,
            `${JSON.stringify(theme, null, 4)}\n`,
            "application/json"
        );
    });

    const importButton = el("button", {
        class: "md-button md-button--outlined",
        text: t("preset.import"),
        attrs: { type: "button" },
    });
    const transferStatus = el("p", { class: "md-field__help mb-help", attrs: { role: "status" } });
    importButton.addEventListener("click", () => {
        void (async (): Promise<void> => {
            const text = await pickFile("application/json,.json");
            if (text === null) return;
            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                transferStatus.textContent = t("preset.importFailed");
                announce(transferStatus.textContent);
                return;
            }
            const report = store.importTheme(parsed);
            if (report.error !== null) {
                transferStatus.textContent = t("preset.importFailed");
                announce(transferStatus.textContent);
                return;
            }
            const settings =
                typeof parsed === "object" && parsed !== null
                    ? (parsed as { settings?: unknown }).settings
                    : undefined;
            if (typeof settings === "object" && settings !== null) {
                options.applySettings(settings as Record<string, unknown>);
            }
            const messages = [
                t("preset.importDone", {
                    styles: report.stylesApplied,
                    presets: report.presetsApplied,
                }),
            ];
            if (report.preservedProperties.length > 0) {
                messages.push(
                    t("preset.importPreserved", {
                        count: report.preservedProperties.length,
                        names: report.preservedProperties.join(", "),
                    })
                );
            }
            transferStatus.textContent = messages.join(" ");
            announce(messages.join(" "));
            render();
        })();
    });

    const exportHelp = el("p", { class: "md-field__help mb-help" });
    fillPhrase(exportHelp, "preset.exportDesc");
    const importHelp = el("p", { class: "md-field__help mb-help" });
    fillPhrase(importHelp, "preset.importDesc");

    const resetAllButton = el("button", {
        class: "md-button md-button--outlined md-button--danger",
        text: t("editor.resetAll"),
        attrs: { type: "button" },
    });
    const resetHelp = el("p", { class: "md-field__help mb-help" });
    fillPhrase(resetHelp, "editor.resetAllDesc");
    resetAllButton.addEventListener("click", () => {
        void (async (): Promise<void> => {
            const confirmed = await options.confirmDestructive(t("editor.resetAllDesc"));
            if (!confirmed) return;
            store.resetAllElements();
            transferStatus.textContent = t("editor.resetAllDone");
            announce(transferStatus.textContent);
            render();
        })();
    });

    root.append(
        el("div", { class: "mb-preset-transfer" }, exportButton, importButton),
        exportHelp,
        importHelp,
        transferStatus,
        el("div", { class: "mb-preset-transfer" }, resetAllButton),
        resetHelp
    );

    function render(): void {
        clear(list);
        const presets = store.presets();
        // A selected id whose preset no longer exists (deleted from another tab, or by
        // this panel's own single-item delete button) cannot stay selected -- there would
        // be nothing left for "delete selected" or "export selected" to act on.
        const live = new Set(presets.map((preset) => preset.id));
        for (const id of [...selected]) if (!live.has(id)) selected.delete(id);
        updateSelectionBar();

        if (presets.length === 0) {
            list.append(el("li", { class: "md-field__help mb-help", text: t("preset.empty") }));
            return;
        }
        for (const preset of presets) {
            const item = el("li", { class: "mb-preset-item" });

            const checkbox = el("input", {
                class: "mb-select-checkbox",
                attrs: {
                    type: "checkbox",
                    "aria-label": t("preset.select", { name: preset.name }),
                },
            });
            checkbox.checked = selected.has(preset.id);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) selected.add(preset.id);
                else selected.delete(preset.id);
                updateSelectionBar();
            });

            const title = el("span", { class: "mb-preset-name", text: preset.name });
            const created = el("span", {
                class: "mb-preset-created",
                text: t("preset.created", { date: preset.createdAt.slice(0, 10) }),
            });

            const apply = el("button", {
                class: "md-button md-button--tonal",
                text: t("preset.apply", { name: preset.name }),
                attrs: { type: "button" },
            });
            apply.addEventListener("click", () => {
                store.applyPreset(preset.id);
                announce(t("preset.applied", { name: preset.name }));
                render();
            });

            const rename = el("button", {
                class: "md-icon-button",
                text: t("preset.renameShort"),
                attrs: { type: "button", "aria-label": t("preset.rename", { name: preset.name }) },
            });
            rename.addEventListener("click", () => {
                nameInput.value = preset.name;
                nameInput.focus();
                saveStatus.textContent = t("preset.nameTaken", { name: preset.name });
            });

            const remove = el("button", {
                class: "md-icon-button md-button--danger",
                text: t("preset.deleteShort"),
                attrs: { type: "button", "aria-label": t("preset.delete", { name: preset.name }) },
            });
            remove.addEventListener("click", () => {
                void (async (): Promise<void> => {
                    const confirmed = await options.confirmDestructive(
                        t("preset.deleteConfirm", { name: preset.name })
                    );
                    if (!confirmed) return;
                    store.deletePreset(preset.id);
                    announce(t("preset.deleted", { name: preset.name }));
                    render();
                })();
            });

            item.append(
                checkbox,
                el("span", { class: "mb-preset-meta" }, title, created),
                el("span", { class: "mb-preset-actions" }, apply, rename, remove)
            );
            list.append(item);
        }
    }

    render();
    return { element: root, refresh: render };
}

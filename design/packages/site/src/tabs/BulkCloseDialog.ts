/**
 * The two bulk-close actions: "Close pages containing text" and "Close pages not containing
 * text".
 *
 * They are one dialog with one flag. Both build the same MatchSpec, compile it through the
 * same matcher, and hand it to the same preview, which negates the result for the inverse
 * direction. There is no second interpretation of case, Unicode, flags or scope anywhere,
 * because there is no second code path.
 *
 * This is a modal, and it is the only modal the site raises. Closing several pages at once is
 * a decision the visitor has to make before anything happens, which is exactly what a
 * blocking dialog is for. Everything that merely reports goes to the notification system.
 *
 * Safeguards, all visible before anything closes:
 *   - an empty query or an invalid pattern closes nothing and says why;
 *   - the match mode and the affected count are stated, with a reviewable list;
 *   - pinned pages are excluded unless the visitor explicitly includes them;
 *   - pages that cannot be closed are listed as excluded rather than reported as closed;
 *   - a matching run that hits its time budget says the preview is incomplete.
 */

import { MATCH_MODES, type MatchMode, type MatchSpec } from "./matcher.js";
import { clear, el, icon } from "../platform/dom.js";
import type { BulkClosePreview, TabModel } from "./TabModel.js";
import type { I18n } from "../i18n/I18n.js";
import type { Notifications } from "../notifications/Notifications.js";
import type { RegexBuilderSlot } from "../platform/RegexBuilderSlot.js";

export interface BulkCloseScope {
    readonly kind: "all" | "group";
    readonly groupId: string | null;
}

export interface BulkCloseDeps {
    readonly i18n: I18n;
    readonly model: TabModel;
    readonly notifications: Notifications;
    readonly regex: RegexBuilderSlot;
}

export interface BulkCloseOpenOptions {
    /** True opens the "not containing" direction. Same predicate, negated. */
    readonly invert: boolean;
    readonly scope: BulkCloseScope;
}

const MATCH_BUDGET_MS = 50;

export function openBulkCloseDialog(deps: BulkCloseDeps, options: BulkCloseOpenOptions): void {
    const { i18n, model, notifications, regex } = deps;

    const scopeIds =
        options.scope.kind === "group" && options.scope.groupId !== null
            ? model.openIds().filter((id) => model.groupOf(id)?.id === options.scope.groupId)
            : undefined;

    const dialog = el("dialog", { class: "md-dialog bulk-close" });
    // A div rather than a form: implicit submission on Enter would close the dialog through
    // the browser's own path, skipping the confirmation the dialog exists to obtain.
    const body = el("div", { class: "md-dialog__body" });

    const titleKey = options.invert ? "bulk.notContainingTitle" : "bulk.containingTitle";
    const title = el("h2", { class: "md-title-large md-dialog__title" });
    i18n.bindText(title, titleKey);
    i18n.bindAttr(dialog, "aria-label", titleKey);
    body.append(title);

    const scopeLine = el("p", { class: "md-body-small bulk-close__scope" });
    if (options.scope.kind === "group" && options.scope.groupId !== null) {
        const group = model.listGroups().find((candidate) => candidate.id === options.scope.groupId);
        i18n.bindText(scopeLine, "bulk.scope.group", { name: group?.name ?? options.scope.groupId });
    } else {
        i18n.bindText(scopeLine, "bulk.scope.all");
    }
    body.append(scopeLine);

    // ---- query ---------------------------------------------------------------------

    const field = el("div", { class: "md-field" });
    const queryId = "bulk-close-query";
    const queryLabel = el("label", { class: "md-field__label", attrs: { for: queryId } });
    i18n.bindText(queryLabel, "bulk.queryLabel");
    field.append(queryLabel);

    const queryRow = el("div", { class: "bulk-close__query" });
    const query = el("input", {
        class: "md-field__input",
        attrs: { id: queryId, type: "text", autocomplete: "off", spellcheck: "false", maxlength: "2000" },
    });
    queryRow.append(query);

    // The guided builder appears only when the search module has provided one. No provider
    // means no button, rather than a button that opens nothing.
    const builderButton = el("button", { class: "md-button md-button--outlined bulk-close__builder", attrs: { type: "button" } });
    i18n.bindText(builderButton, "bulk.builderButton");
    builderButton.addEventListener("click", () => {
        regex.open({
            anchor: builderButton,
            field: query,
            pattern: query.value,
            flags: caseToggle.checked ? "" : "i",
            sample: model.openIds().map((id) => model.label(id)).join("\n"),
            onChange: (next) => {
                query.value = next.pattern;
                if (mode !== "regex") setMode("regex");
                update();
            },
        });
    });
    const syncBuilderButton = (): void => {
        builderButton.hidden = !regex.available || mode !== "regex";
    };
    queryRow.append(builderButton);
    field.append(queryRow);

    const help = el("p", { class: "md-field__help" });
    i18n.bindText(help, "bulk.queryHelp");
    field.append(help);

    const error = el("p", { class: "md-field__help md-field__help--error", attrs: { role: "alert" } });
    field.append(error);
    body.append(field);

    // ---- mode and options ------------------------------------------------------------

    let mode: MatchMode = "plain";

    const modeSet = el("fieldset", { class: "bulk-close__modes" });
    const modeLegend = el("legend", { class: "md-field__label" });
    i18n.bindText(modeLegend, "bulk.modeLabel");
    modeSet.append(modeLegend);

    const modeInputs = new Map<MatchMode, HTMLInputElement>();
    for (const candidate of MATCH_MODES) {
        const id = `bulk-close-mode-${candidate}`;
        const input = el("input", {
            class: "bulk-close__radio",
            attrs: { type: "radio", name: "bulk-close-mode", id, value: candidate, ...(candidate === "plain" ? { checked: true } : {}) },
        });
        input.addEventListener("change", () => {
            if (input.checked) setMode(candidate);
        });
        modeInputs.set(candidate, input);
        const label = el("label", { class: "bulk-close__mode", attrs: { for: id } }, input);
        const text = el("span");
        i18n.bindText(text, candidate === "plain" ? "bulk.mode.plain" : "bulk.mode.regex");
        label.append(text);
        modeSet.append(label);
    }
    body.append(modeSet);

    const caseToggle = el("input", { attrs: { type: "checkbox" } });
    const caseLabel = el("label", { class: "md-switch" }, caseToggle);
    const caseText = el("span", { class: "md-label-large" });
    i18n.bindText(caseText, "bulk.caseSensitive");
    caseLabel.append(caseText);
    body.append(caseLabel);

    const pinnedToggle = el("input", { attrs: { type: "checkbox" } });
    const pinnedLabel = el("label", { class: "md-switch" }, pinnedToggle);
    const pinnedText = el("span", { class: "md-label-large" });
    i18n.bindText(pinnedText, "bulk.includePinned");
    pinnedLabel.append(pinnedText);
    body.append(pinnedLabel);

    // ---- preview ---------------------------------------------------------------------

    const previewHeading = el("h3", { class: "md-title-small" });
    i18n.bindText(previewHeading, "bulk.previewHeading");
    body.append(previewHeading);

    const summary = el("p", { class: "md-body-medium bulk-close__summary", attrs: { role: "status" } });
    body.append(summary);

    const excluded = el("p", { class: "md-body-small bulk-close__excluded" });
    body.append(excluded);

    const list = el("ul", { class: "bulk-close__preview", attrs: { role: "list" } });
    body.append(list);

    // ---- actions ---------------------------------------------------------------------

    const actions = el("div", { class: "md-dialog__actions" });
    const cancel = el("button", { class: "md-button md-button--text", attrs: { type: "button" } });
    i18n.bindText(cancel, "common.cancel");
    cancel.addEventListener("click", () => dialog.close());
    actions.append(cancel);

    const confirm = el("button", { class: "md-button md-button--danger", attrs: { type: "button" } });
    i18n.bindText(confirm, "bulk.confirm");
    actions.append(confirm);
    body.append(actions);

    dialog.append(body);
    document.body.append(dialog);

    // ---- behaviour -------------------------------------------------------------------

    let preview: BulkClosePreview | null = null;

    function setMode(next: MatchMode): void {
        mode = next;
        const input = modeInputs.get(next);
        if (input !== undefined) input.checked = true;
        update();
    }

    function currentSpec(): MatchSpec {
        return { query: query.value, mode, caseSensitive: caseToggle.checked };
    }

    function update(): void {
        syncBuilderButton();
        preview = model.previewBulkClose(
            currentSpec(),
            { invert: options.invert, includePinned: pinnedToggle.checked },
            scopeIds,
        );

        clear(error);
        clear(summary);
        clear(excluded);
        clear(list);

        if (!preview.matcher.ok) {
            if (preview.matcher.reason === "empty") {
                i18n.bindText(error, "bulk.emptyQuery");
            } else {
                i18n.bindText(error, "bulk.invalidPattern", { message: preview.matcher.message });
            }
            query.setAttribute("aria-invalid", preview.matcher.reason === "empty" ? "false" : "true");
            confirm.disabled = true;
            return;
        }

        query.setAttribute("aria-invalid", "false");

        i18n.bindText(summary, "bulk.willClose", {
            count: preview.willClose.length,
            total: preview.eligible.length,
        });

        if (preview.timedOut) {
            const warning = el("span", { class: "bulk-close__warning" });
            i18n.bindText(warning, "bulk.timedOut", { budget: MATCH_BUDGET_MS });
            summary.append(document.createTextNode(" "));
            summary.append(warning);
        }

        const excludedCount = preview.excludedPinned.length + preview.excludedProtected.length;
        if (excludedCount > 0) i18n.bindText(excluded, "bulk.excludedPinned", { count: excludedCount });

        if (preview.willClose.length === 0) {
            const empty = el("li", { class: "bulk-close__empty" });
            i18n.bindText(empty, "bulk.noMatches");
            list.append(empty);
            confirm.disabled = true;
            return;
        }

        for (const entry of preview.willClose) {
            const item = el("li", { class: "bulk-close__item" });
            item.append(el("span", { class: "md-body-medium", text: entry.label }));
            if (entry.pinned) {
                const badge = el("span", { class: "md-chip" });
                badge.append(icon("pin"));
                item.append(badge);
            }
            if (entry.groupName !== null) {
                item.append(el("span", { class: "md-chip", text: entry.groupName }));
            }
            list.append(item);
        }
        confirm.disabled = false;
    }

    confirm.addEventListener("click", () => {
        if (preview === null || preview.willClose.length === 0) return;
        const result = model.applyBulkClose(preview);
        dialog.close();
        notifications.notify({
            severity: result.failed.length > 0 ? "warning" : "success",
            title: {
                key: "bulk.result",
                vars: { closed: result.closed.length, excluded: result.excluded },
            },
            ...(result.failed.length > 0
                ? { body: { text: result.failed.map((id) => model.label(id)).join(", ") } }
                : {}),
        });
    });

    query.addEventListener("input", update);
    caseToggle.addEventListener("change", update);
    pinnedToggle.addEventListener("change", update);
    const unsubscribeRegex = regex.subscribe(syncBuilderButton);

    dialog.addEventListener("close", () => {
        unsubscribeRegex();
        dialog.remove();
    });

    update();
    dialog.showModal();
    query.focus();
}

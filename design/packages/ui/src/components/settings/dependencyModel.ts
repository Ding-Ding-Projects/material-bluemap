/**
 * Pure text and export helpers for the system-dependency installer panel.
 *
 * Kept separate from `DependencyInstallerPanel.vue` for the same reason
 * `project/projectModel.ts` is kept separate from `ProjectList.vue`: the text a row
 * renders and the text a search matches against have to be the exact same string,
 * and a function is the only way to guarantee that rather than hoping two template
 * expressions stay in sync by hand.
 */

import type { Translate } from "../world/worldFolder.js";
import type { DependencyRow } from "./dependencyInstaller.js";
import type { SysdepInstallEvent, SysdepInstallStage, SysdepPreviewRoute } from "./dependencyBridge.js";

/** The route chip's text, in the surface's own words - never the raw discriminant. */
export function dependencyRouteLabel(route: SysdepPreviewRoute, t: Translate): string {
    switch (route.kind) {
        case "package-manager":
            return route.manager === "winget"
                ? t("dependencies.route.winget", { id: route.packageId }, "winget: {id}")
                : t("dependencies.route.chocolatey", { id: route.packageId }, "Chocolatey: {id}");
        case "unsupported":
            return t("dependencies.route.unsupported", "Not installable from here");
        case "unavailable":
            return t("dependencies.route.unavailable", "No package manager available");
    }
}

/** The live stage's text, in the surface's own words. */
export function dependencyStageLabel(stage: SysdepInstallStage, t: Translate): string {
    switch (stage) {
        case "queued":
            return t("dependencies.stage.queued", "Waiting to start");
        case "checking-existing":
            return t("dependencies.stage.checkingExisting", "Checking whether it is already installed");
        case "elevation-notice":
            return t("dependencies.stage.elevationNotice", "Windows may ask for administrator permission now");
        case "resolving":
            return t("dependencies.stage.resolving", "Resolving");
        case "downloading":
            return t("dependencies.stage.downloading", "Downloading");
        case "installing":
            return t("dependencies.stage.installing", "Installing");
        case "verifying":
            return t("dependencies.stage.verifying", "Confirming it actually runs");
        case "done":
            return t("dependencies.stage.done", "Done");
        case "skipped":
            return t("dependencies.stage.skipped", "Skipped");
        case "failed":
            return t("dependencies.stage.failed", "Failed");
        case "cancelled":
            return t("dependencies.stage.cancelled", "Cancelled");
    }
}

/** Every word a row renders, joined for the search bar - name, route, elevation, state. */
export function dependencySearchText(row: DependencyRow, t: Translate): string {
    const parts = [
        row.displayName,
        row.id,
        dependencyRouteLabel(row.preview.route, t),
        row.preview.elevation,
        row.preview.alreadyInstalled ? "already installed" : "",
        row.preview.installedVersion ?? "",
        row.stage === "idle" ? "" : dependencyStageLabel(row.stage, t),
        row.message,
        row.outcome?.kind ?? "",
    ];
    return parts.filter((part) => part.trim().length > 0).join(" ");
}

export type DependencyExportFormat = "json" | "markdown" | "text";

export function dependencyExportFileName(format: DependencyExportFormat): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "json") return `dependency-install-log-${stamp}.json`;
    if (format === "markdown") return `dependency-install-log-${stamp}.md`;
    return `dependency-install-log-${stamp}.txt`;
}

/** One event, as a single readable line - shared by the Markdown and plain-text exports. */
function eventLine(event: SysdepInstallEvent): string {
    const manager = event.manager ?? "-";
    const progress =
        event.progress.kind === "determinate"
            ? `${String(event.progress.percent)}%`
            : event.progress.kind === "indeterminate"
              ? "in progress"
              : "";
    return `${event.dependency} [${manager}] ${event.stage}${progress ? ` (${progress})` : ""}: ${event.message}`;
}

/** The full event log, in the requested format. Every field survives - nothing is summarised away. */
export function dependencyExportText(log: readonly SysdepInstallEvent[], format: DependencyExportFormat): string {
    if (format === "json") return JSON.stringify(log, null, 4);
    if (format === "markdown") {
        const header = "| Dependency | Manager | Stage | Progress | Message |\n|---|---|---|---|---|";
        const rows = log.map((event) => {
            const progress =
                event.progress.kind === "determinate"
                    ? `${String(event.progress.percent)}%`
                    : event.progress.kind === "indeterminate"
                      ? "in progress"
                      : "";
            return `| ${event.dependency} | ${event.manager ?? "-"} | ${event.stage} | ${progress} | ${event.message.replace(/\|/g, "\\|")} |`;
        });
        return [header, ...rows].join("\n");
    }
    return log.map(eventLine).join("\n");
}

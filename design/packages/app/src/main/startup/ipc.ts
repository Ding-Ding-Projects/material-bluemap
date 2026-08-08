import type { App, BrowserWindow, Clipboard, Dialog, IpcMain } from "electron";
import { join } from "node:path";
import { SingleFlight, type StartupIssue } from "./model.js";
import { StartupIssueStore, type StartupExportFormat } from "./store.js";

export interface StartupIpc {
    readonly store: StartupIssueStore;
    copy(): Promise<{ ok: boolean; message: string }>;
    retry(): Promise<{ ok: boolean; message: string }>;
    export(
        format: StartupExportFormat,
        parent?: BrowserWindow | null,
    ): Promise<{ ok: boolean; path: string | null; message: string }>;
}

function extension(format: StartupExportFormat): string {
    return format === "json" ? "json" : "md";
}

export function installStartupIpc(options: {
    readonly ipcMain: IpcMain;
    readonly app: App;
    readonly dialog: Dialog;
    readonly clipboard: Clipboard;
    readonly store: StartupIssueStore;
    readonly resolveWindow: (sender: Electron.WebContents) => BrowserWindow | null;
}): StartupIpc {
    const retryFlight = new SingleFlight<{ ok: boolean; message: string }>();
    const exportFlight = new SingleFlight<{ ok: boolean; path: string | null; message: string }>();

    const retry = (): Promise<{ ok: boolean; message: string }> =>
        retryFlight.run(async () => {
            options.app.relaunch();
            options.app.exit(0);
            return { ok: true, message: "Worldlens is restarting." };
        });

    const copy = async (): Promise<{ ok: boolean; message: string }> => {
        options.clipboard.writeText(await options.store.format("markdown"));
        return { ok: true, message: "Startup diagnostics were copied." };
    };

    const exportDiagnostics = (
        format: StartupExportFormat,
        parent: BrowserWindow | null = null,
    ): Promise<{ ok: boolean; path: string | null; message: string }> =>
        exportFlight.run(async () => {
            const ext = extension(format);
            const dialogOptions = {
                title: "Export Worldlens startup diagnostics",
                defaultPath: join(
                    options.app.getPath("documents"),
                    `worldlens-startup-diagnostics.${ext}`,
                ),
                filters: [
                    format === "json"
                        ? { name: "JSON", extensions: ["json"] }
                        : { name: "Markdown", extensions: ["md"] },
                ],
            };
            const choice =
                parent === null
                    ? await options.dialog.showSaveDialog(dialogOptions)
                    : await options.dialog.showSaveDialog(parent, dialogOptions);
            if (choice.canceled || choice.filePath === undefined) {
                return { ok: false, path: null, message: "The export was cancelled." };
            }
            await options.store.export(choice.filePath, format);
            return {
                ok: true,
                path: choice.filePath,
                message: `Startup diagnostics were exported to ${choice.filePath}.`,
            };
        });

    options.ipcMain.handle("startup:read", () => options.store.snapshot());
    options.ipcMain.handle("startup:copy", copy);
    options.ipcMain.handle("startup:export", (event, format: StartupExportFormat) =>
        exportDiagnostics(format, options.resolveWindow(event.sender)),
    );
    options.ipcMain.handle("startup:retry", retry);

    return { store: options.store, copy, retry, export: exportDiagnostics };
}

export function currentStartupIssues(issues: readonly StartupIssue[]): readonly StartupIssue[] {
    return [...issues].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

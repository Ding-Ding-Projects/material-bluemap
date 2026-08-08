import { BrowserWindow, type App } from "electron";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { StartupIpc } from "./ipc.js";
import type { StartupIssue } from "./model.js";

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

async function logoDataUrl(path: string | null): Promise<string | null> {
    if (path === null) return null;
    try {
        return `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
    } catch {
        return null;
    }
}

function issueMarkup(issues: readonly StartupIssue[]): string {
    return issues
        .map(
            (issue) => `<article class="issue">
                <div class="issue-kicker">${escapeHtml(issue.category)} · ${escapeHtml(issue.phase)}</div>
                <h2>${escapeHtml(issue.title)}</h2>
                <p>${escapeHtml(issue.message)}</p>
                ${issue.detail === null ? "" : `<details><summary>Technical details</summary><pre>${escapeHtml(issue.detail)}</pre></details>`}
                <p class="boundary">${issue.securityBoundary ? "Worldlens stopped this path to protect data or security. Nothing was bypassed." : "The failed feature stayed off; the rest of the shell can still be used."}</p>
            </article>`,
        )
        .join("");
}

function recoveryHtml(issues: readonly StartupIssue[], logo: string | null): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'">
<title>Worldlens recovery</title><style>
:root{color-scheme:light dark;font:16px/1.5 "Segoe UI Variable",Segoe UI,sans-serif;background:#f7f9ff;color:#18202a}
*{box-sizing:border-box}body{margin:0;min-width:320px;background:linear-gradient(145deg,#f7f9ff,#e6f0ff)}
.titlebar{-webkit-app-region:drag;height:44px;display:flex;align-items:center;padding-left:14px;background:#071b35;color:#fff}
.titlebar strong{flex:1}.window{-webkit-app-region:no-drag;display:flex;height:44px}.window a{display:grid;place-items:center;width:48px;color:#fff;text-decoration:none;font-size:20px}.window a:hover,.window a:focus{background:#16436f;outline:2px solid #8bc8ff;outline-offset:-3px}.window .close:hover{background:#b3261e}
main{max-width:920px;margin:0 auto;padding:32px 24px 48px}.hero{display:grid;grid-template-columns:112px 1fr;gap:24px;align-items:center;margin-bottom:24px}.hero img{width:112px;height:112px;border-radius:28px;box-shadow:0 10px 28px #001d3d40}.hero h1{font-size:2rem;line-height:1.15;margin:0 0 8px}.hero p{margin:0;color:#3f4d5c}
.notice{padding:16px 18px;border-radius:18px;background:#fff7df;border:1px solid #806000;color:#352a00;margin:0 0 18px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 24px}.actions a{display:inline-flex;min-height:44px;align-items:center;border-radius:999px;padding:0 18px;text-decoration:none;font-weight:650;color:#fff;background:#005db7}.actions a.secondary{color:#00427d;background:#d6e8ff}.actions a:focus{outline:3px solid #001d36;outline-offset:2px}
.issue{background:#fff;border:1px solid #c5cfda;border-radius:20px;padding:18px;margin:14px 0;box-shadow:0 3px 10px #001d3620}.issue-kicker{text-transform:uppercase;letter-spacing:.08em;font-size:.76rem;color:#3f5f7c}.issue h2{font-size:1.1rem;margin:6px 0}.issue p{overflow-wrap:anywhere}.issue pre{white-space:pre-wrap;word-break:break-word;background:#edf3fa;padding:12px;border-radius:12px;max-height:240px;overflow:auto}.boundary{font-weight:600}.footer{color:#4f5c69;font-size:.9rem;margin-top:24px}
@media(max-width:560px){.hero{grid-template-columns:72px 1fr}.hero img{width:72px;height:72px;border-radius:18px}.hero h1{font-size:1.5rem}main{padding:22px 16px 36px}}
@media(prefers-color-scheme:dark){:root{background:#0d1117;color:#e7edf5}body{background:linear-gradient(145deg,#0d1117,#11263e)}.notice{background:#342f1a;border-color:#d6ba5a;color:#fff1ba}.issue{background:#17212d;border-color:#405267}.hero p,.footer{color:#b6c3d1}.issue pre{background:#0d1722}.actions a.secondary{background:#183b60;color:#c9e4ff}.actions a:focus{outline-color:#8bc8ff}}
</style></head><body>
<header class="titlebar"><strong>Worldlens recovery / Worldlens 復原</strong><nav class="window" aria-label="Window controls"><a href="worldlens-recovery://minimize" aria-label="Minimize">−</a><a href="worldlens-recovery://maximize" aria-label="Maximize or restore">□</a><a class="close" href="worldlens-recovery://close" aria-label="Close">×</a></nav></header>
<main><section class="hero">${logo === null ? "" : `<img src="${logo}" alt="Worldlens logo: a map under a lens">`}<div><h1>Worldlens opened its recovery shell</h1><p>Worldlens 開咗復原介面</p></div></section>
<p class="notice" role="alert"><strong>Your data was not pushed past the failed safety check.</strong> The affected feature remains unavailable, but the diagnostics below stay readable and exportable. Fix the reported problem, then restart. / <strong>資料冇被夾硬推過失敗嘅安全檢查。</strong> 出事功能暫時唔用得，但下面診斷可以照睇同匯出；修正後重新啟動即可。</p>
<nav class="actions" aria-label="Recovery actions"><a href="worldlens-recovery://retry">Restart and retry / 重開再試</a><a class="secondary" href="worldlens-recovery://copy">Copy details / 複製詳情</a><a class="secondary" href="worldlens-recovery://export-json">Export JSON</a><a class="secondary" href="worldlens-recovery://export-markdown">Export Markdown</a></nav>
<section aria-label="Startup issues">${issueMarkup(issues)}</section><p class="footer">No error is being treated as success. Security and data-integrity refusals stay in force. / 冇任何錯誤會扮成功；安全同資料完整性拒絕照樣生效。</p></main></body></html>`;
}

export async function openRecoveryWindow(options: {
    readonly app: App;
    readonly startup: StartupIpc;
    readonly issues: readonly StartupIssue[];
    readonly iconPath: string | null;
    readonly logoPath: string | null;
}): Promise<BrowserWindow> {
    const existing = BrowserWindow.getAllWindows().find(
        (candidate) => !candidate.isDestroyed() && candidate.getTitle() === "Worldlens recovery",
    );
    if (existing !== undefined) {
        if (existing.isMinimized()) existing.restore();
        existing.show();
        return existing;
    }

    const window = new BrowserWindow({
        title: "Worldlens recovery",
        width: 920,
        height: 760,
        minWidth: 360,
        minHeight: 520,
        show: false,
        frame: false,
        autoHideMenuBar: true,
        backgroundColor: "#f7f9ff",
        ...(options.iconPath === null ? {} : { icon: options.iconPath }),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            javascript: false,
        },
    });

    const act = async (url: string): Promise<void> => {
        let action: string;
        try {
            action = new URL(url).hostname;
        } catch {
            return;
        }
        if (action === "minimize") window.minimize();
        else if (action === "maximize") {
            if (window.isMaximized()) window.unmaximize();
            else window.maximize();
        } else if (action === "close") window.close();
        else if (action === "copy") await options.startup.copy();
        else if (action === "export-json") await options.startup.export("json", window);
        else if (action === "export-markdown") await options.startup.export("markdown", window);
        else if (action === "retry") await options.startup.retry();
    };

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("worldlens-recovery://")) void act(url);
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith("worldlens-recovery://")) return;
        event.preventDefault();
        void act(url);
    });
    window.once("ready-to-show", () => window.show());
    await window.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(recoveryHtml(options.issues, await logoDataUrl(options.logoPath)))}`,
    );
    return window;
}

export function iconFileUrl(path: string): string {
    return pathToFileURL(path).href;
}

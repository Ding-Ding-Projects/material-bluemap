import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const main = readFileSync(join(packageRoot, "src", "main", "index.ts"), "utf8");
const recovery = readFileSync(
    join(packageRoot, "src", "main", "startup", "recoveryWindow.ts"),
    "utf8",
);

describe("startup recovery completeness guard", () => {
    const guardedPhases = [
        "profile-migration",
        "embedded-server",
        "session-security",
        "core-ipc",
        "rendering",
        "github-sign-in",
        "downloads",
        "backups",
        "ci-render",
        "pages",
        "runtime",
        "remote-render",
        "remote-hosting",
        "file-access",
        "updates",
        "world-sources",
        "preview",
        "world-repository",
        "ssh-world-source",
        "docker-world",
        "world-inspection",
        "java-discovery",
        "dependency-installer",
        "gh-cli",
        "config-editor",
        "config-history",
        "projects",
        "profile-history",
        "settings-history",
        "path-dialogs",
        "bedrock-conversion",
        "repair",
    ] as const;

    it.each(guardedPhases)("keeps the %s phase behind the startup boundary", (phase) => {
        expect(main).toContain(`"${phase}"`);
    });

    it("creates the ordinary window before optional feature initialization", () => {
        const create = main.indexOf("const window = new BrowserWindow");
        const optional = main.indexOf("Optional feature registration begins");
        expect(create).toBeGreaterThan(-1);
        expect(optional).toBeGreaterThan(create);
    });

    it("covers bridge, renderer, promise and exception failures without exit-only startup", () => {
        for (const signal of [
            '"preload-error"',
            '"did-fail-load"',
            '"render-process-gone"',
            'process.on("uncaughtException"',
            'process.on("unhandledRejection"',
            'enterTerminalRecovery("app-ready"',
        ]) {
            expect(main).toContain(signal);
        }
        expect(main).not.toContain("app.exit(1)");
        expect(main).not.toContain('dialog.showErrorBox("Worldlens could not start"');
    });

    it("keeps the recovery renderer isolated and its actions main-process owned", () => {
        expect(recovery).toContain("javascript: false");
        expect(recovery).toContain("nodeIntegration: false");
        expect(recovery).toContain("contextIsolation: true");
        expect(recovery).toContain("sandbox: true");
        expect(recovery).toContain("default-src 'none'");
        for (const action of [
            "worldlens-recovery://retry",
            "worldlens-recovery://copy",
            "worldlens-recovery://export-json",
            "worldlens-recovery://export-markdown",
            "worldlens-recovery://close",
        ]) {
            expect(recovery).toContain(action);
        }
    });

    it("ships a deterministic probe that only fails a named phase", () => {
        expect(main).toContain('getSwitchValue("worldlens-startup-probe")');
        expect(main).toContain("injectStartupProbe(phase)");
        expect(main).toContain('startupProbe === "profile-migration"');
    });
});

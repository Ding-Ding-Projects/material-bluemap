import { describe, expect, it } from "vitest";

import { handleSquirrelShortcutEvent, type SquirrelShortcutHost } from "./squirrelShortcuts.js";

function host(overrides: Partial<SquirrelShortcutHost> = {}) {
    const calls: { command: string; args: readonly string[] }[] = [];
    let quitCalls = 0;
    const value: SquirrelShortcutHost = {
        platform: "win32",
        argv: ["Worldlens.exe", "--squirrel-install"],
        execPath: "C:\\Users\\example\\AppData\\Local\\Worldlens\\app-1.0.0\\Worldlens.exe",
        exists: () => true,
        spawn: (command, args) => calls.push({ command, args }),
        quit: () => {
            quitCalls += 1;
        },
        defer: (callback) => callback(),
        ...overrides,
    };
    return { value, calls, quitCalls: () => quitCalls };
}

describe("Squirrel shortcut lifecycle", () => {
    it("recreates the installed executable shortcut on install and update", () => {
        for (const event of ["--squirrel-install", "--squirrel-updated"] as const) {
            const fixture = host({ argv: ["Worldlens.exe", event] });
            expect(handleSquirrelShortcutEvent(fixture.value)).toBe(true);
            expect(fixture.calls).toEqual([
                {
                    command: "C:\\Users\\example\\AppData\\Local\\Worldlens\\Update.exe",
                    args: ["--createShortcut=Worldlens.exe"],
                },
            ]);
            expect(fixture.quitCalls()).toBe(1);
        }
    });

    it("removes the shortcut on uninstall and never launches the regular app", () => {
        const fixture = host({ argv: ["Worldlens.exe", "--squirrel-uninstall"] });
        expect(handleSquirrelShortcutEvent(fixture.value)).toBe(true);
        expect(fixture.calls[0]?.args).toEqual(["--removeShortcut=Worldlens.exe"]);
        expect(fixture.quitCalls()).toBe(1);
    });

    it("leaves ordinary and non-Windows launches alone", () => {
        expect(handleSquirrelShortcutEvent(host({ argv: ["Worldlens.exe"] }).value)).toBe(false);
        expect(handleSquirrelShortcutEvent(host({ platform: "linux" }).value)).toBe(false);
    });
});

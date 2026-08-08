import { basename, dirname, resolve } from "node:path";

export type SquirrelShortcutEvent =
    | "--squirrel-install"
    | "--squirrel-updated"
    | "--squirrel-uninstall"
    | "--squirrel-obsolete";

export interface SquirrelShortcutHost {
    readonly platform: NodeJS.Platform;
    readonly argv: readonly string[];
    readonly execPath: string;
    readonly exists: (path: string) => boolean;
    readonly spawn: (command: string, args: readonly string[]) => void;
    readonly quit: () => void;
    readonly defer: (callback: () => void, milliseconds: number) => void;
}

const SQUIRREL_EVENTS = new Set<string>([
    "--squirrel-install",
    "--squirrel-updated",
    "--squirrel-uninstall",
    "--squirrel-obsolete",
]);

function eventFrom(argv: readonly string[]): SquirrelShortcutEvent | null {
    const candidate = argv.find((value): value is SquirrelShortcutEvent => SQUIRREL_EVENTS.has(value));
    return candidate ?? null;
}

/**
 * Squirrel starts the installed executable once with one of these event flags. electron-builder
 * creates the install package, but the application owns shortcut repair on install and update.
 * We use Update.exe directly so the desktop and Start-menu entries are recreated even if an old
 * updater removed them; ordinary launches never reach this path.
 */
export function handleSquirrelShortcutEvent(host: SquirrelShortcutHost): boolean {
    if (host.platform !== "win32") return false;
    const event = eventFrom(host.argv);
    if (event === null) return false;

    if (event === "--squirrel-install" || event === "--squirrel-updated" || event === "--squirrel-uninstall") {
        const updateExe = resolve(dirname(host.execPath), "..", "Update.exe");
        if (host.exists(updateExe)) {
            const shortcut = basename(host.execPath);
            const command = event === "--squirrel-uninstall" ? "--removeShortcut" : "--createShortcut";
            host.spawn(updateExe, [`${command}=${shortcut}`]);
        }
    }

    // Give Update.exe a moment to receive the command, but never initialize the normal app or
    // show a window for an installer lifecycle event.
    host.defer(host.quit, 1_000);
    return true;
}

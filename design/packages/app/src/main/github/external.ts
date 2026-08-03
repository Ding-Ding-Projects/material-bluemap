/**
 * The single door out of the application to the rest of the internet.
 *
 * Sign-in has to send somebody to github.com, and the wrong way to do that is a
 * `BrowserWindow` pointed at GitHub's login page. An in-app window means the
 * application is standing between a person and a password field: it can read what is
 * typed, the person cannot see the address bar or the certificate, and they have no
 * way to tell a real login page from one this app drew. The system browser already has
 * their session, their password manager and their security keys, and it shows them
 * where they are.
 *
 * So every outward link goes through `shell.openExternal`, and only over https. The
 * scheme check is the important half: `shell.openExternal` will happily hand a `file:`
 * or a custom-scheme URL to the operating system, which is a way to launch things.
 * Parsing the URL rather than matching a prefix matters too - `https:/\evil` passes a
 * `startsWith("https://")` test in some spellings and does not parse as an https URL.
 */

import { shell } from "electron";

/** True only for a URL that parses and whose scheme is exactly https. */
export function isExternalUrlAllowed(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    return parsed.protocol === "https:";
}

/**
 * Opens a URL in the system browser. False when it was refused, which is not an error:
 * the caller shows the address instead so the person can open it themselves.
 */
export async function openExternalHttps(url: string): Promise<boolean> {
    if (!isExternalUrlAllowed(url)) return false;
    try {
        await shell.openExternal(url);
        return true;
    } catch {
        // A machine with no browser association is a real configuration, not a crash.
        // The user code and the address are on screen either way.
        return false;
    }
}

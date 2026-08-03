/**
 * The tripwire that keeps the capture off the public internet.
 *
 * Issue #17's second requirement: the harness must fail loudly if it reaches the network
 * at all during a capture, so pointing it back at somebody's public server cannot happen
 * by accident. This installs that guard inside the running app and reads back what it
 * caught.
 *
 * ## Two layers, because the app has two ways out
 *
 * 1. **`globalThis.fetch` in the main process.** `RemoteProxyHandler` is the only thing
 *    in the app that talks to a server the user named, and it does it with `fetch`. A
 *    refused call surfaces to the viewer as the proxy's ordinary 502, so a leak looks
 *    like a broken map rather than like a silent success.
 * 2. **`session.defaultSession.webRequest.onBeforeRequest`.** Everything Chromium itself
 *    loads: the renderer's own bundle, images, workers, and any request a future feature
 *    makes from the page. The app's own `hardenSession` uses `onBeforeSendHeaders` and
 *    `onHeadersReceived`, so this listener slot is free and nothing is displaced.
 *
 * ## What it does not cover, said plainly
 *
 * It does not patch `node:net` or `node:http`, so a component that opened a raw socket
 * would not be seen. Nothing in the app does that today - the proxy is the only outbound
 * path and it is `fetch` - but this is a guard over the paths that exist, not a proof
 * that no path could ever exist. The CI job it runs in is the other half of that: the
 * render happens in an earlier job, so the capture job has no legitimate reason to
 * contact anything but loopback.
 *
 * ## Timing
 *
 * The guard is installed immediately after launch, and the app makes no outbound request
 * until a server profile is active. The harness seeds that profile itself, after this
 * returns, so there is no window in which the app could reach anything before the guard
 * is watching.
 */

import type { ElectronApplication } from "@playwright/test";

export interface NetworkViolation {
    /** The URL that was refused. */
    readonly url: string;
    /** Which layer caught it: `main:fetch` or `renderer`. */
    readonly via: string;
    /** Milliseconds since the guard was installed. */
    readonly afterMs: number;
}

interface GuardState {
    violations: NetworkViolation[];
    allowed: string[];
    installedAt: number;
}

interface GuardGlobal {
    __materialBluemapCaptureGuard?: GuardState;
}

/**
 * Installs the guard. Safe to call twice; the second call is a no-op.
 *
 * `allowedOrigins` is on top of loopback, which is always allowed: the app's own embedded
 * server and the harness's fixture server both live there. Pass the remote origin when a
 * remote-mode capture is deliberately browsing a real server.
 */
export async function installNetworkGuard(
    app: ElectronApplication,
    allowedOrigins: readonly string[],
): Promise<void> {
    await app.evaluate(({ session }, allowed: string[]) => {
        const scope = globalThis as unknown as GuardGlobal;
        if (scope.__materialBluemapCaptureGuard !== undefined) return;

        const state: GuardState = { violations: [], allowed, installedAt: Date.now() };
        scope.__materialBluemapCaptureGuard = state;

        // Schemes that never leave the machine. `devtools:` and `chrome-extension:` are
        // Chromium's own; refusing them would break the tooling rather than protect
        // anyone.
        const localSchemes = new Set([
            "data:",
            "blob:",
            "file:",
            "about:",
            "chrome:",
            "devtools:",
            "chrome-extension:",
            "chrome-devtools:",
        ]);
        const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

        const permitted = (raw: string): boolean => {
            let url: URL;
            try {
                url = new URL(raw);
            } catch {
                // Not a URL at all: it cannot be a request to a public host, and treating
                // it as a violation would report noise as a leak.
                return true;
            }
            if (localSchemes.has(url.protocol)) return true;
            if (loopbackHosts.has(url.hostname)) return true;
            return allowed.includes(url.origin);
        };

        const record = (url: string, via: string): void => {
            state.violations.push({ url, via, afterMs: Date.now() - state.installedAt });
        };

        const originalFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const url =
                typeof input === "string"
                    ? input
                    : input instanceof URL
                      ? input.href
                      : input.url;
            if (!permitted(url)) {
                record(url, "main:fetch");
                return Promise.reject(
                    new Error(
                        `capture network guard refused ${url}: the screenshot harness may only ` +
                            "talk to loopback",
                    ),
                );
            }
            return originalFetch(input, init);
        };

        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            if (permitted(details.url)) {
                callback({ cancel: false });
                return;
            }
            record(details.url, "renderer");
            callback({ cancel: true });
        });
    }, [...allowedOrigins]);
}

/** Everything the guard refused, oldest first. */
export async function networkViolations(app: ElectronApplication): Promise<NetworkViolation[]> {
    return await app.evaluate(() => {
        const scope = globalThis as unknown as GuardGlobal;
        return scope.__materialBluemapCaptureGuard?.violations ?? [];
    });
}

/** True once the guard is in place, so the harness can prove it rather than assume it. */
export async function networkGuardInstalled(app: ElectronApplication): Promise<boolean> {
    return await app.evaluate(() => {
        const scope = globalThis as unknown as GuardGlobal;
        return scope.__materialBluemapCaptureGuard !== undefined;
    });
}

/** A one-line report of a violation, for a failure message somebody has to act on. */
export function describeViolation(violation: NetworkViolation): string {
    return `${violation.via} -> ${violation.url} (${violation.afterMs} ms after the guard went in)`;
}

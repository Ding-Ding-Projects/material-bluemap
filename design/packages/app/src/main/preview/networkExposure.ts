/**
 * Whether "host this render live" defaults to loopback-only or to every interface on this
 * network, remembered per installation - the same persisted-choice shape
 * `files/downloadConcurrency.ts` uses for its own single setting, applied to a boolean
 * instead of a bounded number.
 *
 * ## Why this exists as a setting at all, rather than only a per-session checkbox
 *
 * The security rule this whole feature answers to is unambiguous: bind to loopback by
 * default, and network exposure is an explicit, informed opt-in every time. A checkbox that
 * always starts unticked already satisfies "never default it on" for a single session. What
 * it cannot do honestly is remember somebody's real, repeated choice - somebody who reads
 * the warning once, decides they trust their own home network, and ticks it every single
 * time they host a render is not being asked to make an informed choice on the second
 * occasion, they are being nagged. This store is what lets the panel's own default track
 * that decision instead, while the opt-in language and the warning **stay on screen every
 * time regardless of what this remembers** - see `previewHost.ts` and `PreviewHostPanel.vue`.
 *
 * The value this store holds is a *default*, never an override: whatever it says, the panel
 * still shows the exposure checkbox unticked-by-default on first open and still shows the
 * full consequence sentence beside it. Nothing here can silently expose a render to the
 * network with no control on screen saying so.
 *
 * ## The default stays off
 *
 * `false` (loopback only) is both the shipped default and what a missing or corrupt file
 * degrades to - a settings file that cannot be read must never be interpreted as "somebody
 * asked for network exposure."
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** What a fresh install behaves as: loopback only. */
export const DEFAULT_ALLOW_NETWORK = false;

export interface PreviewNetworkSetting {
    readonly allowNetwork: boolean;
    /** True when nothing has ever been written and this is the shipped default. */
    readonly isDefault: boolean;
}

/** Beside the app's other remembered settings, not inside any render's own output. */
export const PREVIEW_NETWORK_FILE = "preview-network-default.json";

interface StoredSetting {
    readonly allowNetwork?: unknown;
}

export interface PreviewNetworkStoreOptions {
    /** Electron's `userData`. */
    readonly dataDir: string;
}

/**
 * Reads and writes the default exposure choice, and can always answer.
 *
 * Mirrors `DownloadConcurrencyStore`'s shape exactly: a staged-then-renamed write so a
 * crash mid-save cannot leave a half-written file, and a read that degrades to the safe
 * default rather than ever surfacing a stored value this store did not itself validate.
 */
export class PreviewNetworkStore {
    private readonly file: string;

    constructor(options: PreviewNetworkStoreOptions) {
        this.file = join(options.dataDir, PREVIEW_NETWORK_FILE);
    }

    read(): PreviewNetworkSetting {
        const allowNetwork = this.storedValue();
        return { allowNetwork, isDefault: allowNetwork === DEFAULT_ALLOW_NETWORK };
    }

    private storedValue(): boolean {
        let parsed: unknown;
        try {
            parsed = JSON.parse(readFileSync(this.file, "utf8"));
        } catch {
            return DEFAULT_ALLOW_NETWORK;
        }
        if (typeof parsed !== "object" || parsed === null) return DEFAULT_ALLOW_NETWORK;
        const value = (parsed as StoredSetting).allowNetwork;
        return typeof value === "boolean" ? value : DEFAULT_ALLOW_NETWORK;
    }

    /** Records a choice. Never throws: a settings file that cannot be written must never
     * stop the panel from working, it just stops the choice from surviving a restart. */
    write(allowNetwork: boolean): PreviewNetworkSetting {
        try {
            mkdirSync(dirname(this.file), { recursive: true });
            const staging = `${this.file}.writing`;
            writeFileSync(staging, `${JSON.stringify({ allowNetwork }, null, 4)}\n`, "utf8");
            renameSync(staging, this.file);
        } catch {
            // Applies for this session only; `read()` reports it as unsaved by falling
            // back to whatever was last actually persisted (or the default).
        }
        return this.read();
    }
}

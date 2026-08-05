/**
 * Tracking a world fetched over SSH the way a download is tracked, without Electron anywhere
 * in sight.
 *
 * `remote/worldsource.ts`'s `fetchRemoteWorld` is one call that runs to completion; what this
 * adds is the bookkeeping every other fetch-like feature in this application already has: an
 * id a cancel button can name, a live map of what is in flight, and progress pushed out as it
 * happens rather than only known at the end. It is not the same event shape the GitHub
 * `worldsource/fetcher.ts` broadcasts on the download channel - that shape carries parts,
 * joining and extracting phases that a directory copy over `scp` or `rsync` simply does not
 * have, and forcing it into that shape would mean phases that are always empty. This gets its
 * own small channel instead, carrying exactly what a directory transfer produces: lines of
 * text, and a final result.
 */

import { randomUUID } from "node:crypto";
import type { CommandRunner } from "../runtime/command.js";
import {
    fetchRemoteWorld,
    type RemoteWorldFetchOptions,
    type RemoteWorldFetchResult,
} from "../remote/worldsource.js";
import type { RemoteTarget } from "../remote/target.js";

export interface SshWorldSourceLineEvent {
    readonly kind: "line";
    readonly id: string;
    readonly message: string;
}

export interface SshWorldSourceFinishedEvent {
    readonly kind: "finished";
    readonly id: string;
    readonly result: RemoteWorldFetchResult;
}

export type SshWorldSourceEvent = SshWorldSourceLineEvent | SshWorldSourceFinishedEvent;

export interface SshWorldSourceRequest {
    readonly target: RemoteTarget;
    readonly remotePath: string;
    readonly localPath: string;
}

export interface SshWorldSourceFetcherOptions {
    readonly knownHostsFile: string;
    readonly userKnownHostsFile?: string | null;
    readonly onEvent: (event: SshWorldSourceEvent) => void;
    readonly ssh?: string;
    readonly scp?: string;
    readonly rsync?: string;
    readonly runner?: CommandRunner;
    /** Injected so a test can fetch without a real host. */
    readonly fetch?: (
        target: RemoteTarget,
        remotePath: string,
        localPath: string,
        options: RemoteWorldFetchOptions,
    ) => Promise<RemoteWorldFetchResult>;
}

export class SshWorldSourceFetcher {
    private readonly options: SshWorldSourceFetcherOptions;
    private readonly active = new Map<string, AbortController>();

    constructor(options: SshWorldSourceFetcherOptions) {
        this.options = options;
    }

    /** Fetches still running, by id - what the cancel button and the "active" query both read. */
    activeFetchIds(): readonly string[] {
        return [...this.active.keys()];
    }

    /** True when `id` was in flight and has now been asked to stop. False for an unknown id. */
    cancel(id: string): boolean {
        const controller = this.active.get(id);
        if (controller === undefined) return false;
        controller.abort();
        return true;
    }

    /**
     * Runs one fetch to completion, broadcasting a `line` event for everything the transfer
     * says and a `finished` event with the final result. The id is assigned and tracked
     * *before* the transfer starts, so a cancel request issued while this is still awaited
     * has something to find.
     */
    async fetch(request: SshWorldSourceRequest): Promise<{ readonly id: string; readonly result: RemoteWorldFetchResult }> {
        const id = randomUUID();
        const controller = new AbortController();
        this.active.set(id, controller);

        const run = this.options.fetch ?? fetchRemoteWorld;
        try {
            const result = await run(request.target, request.remotePath, request.localPath, {
                knownHostsFile: this.options.knownHostsFile,
                ...(this.options.userKnownHostsFile === undefined
                    ? {}
                    : { userKnownHostsFile: this.options.userKnownHostsFile }),
                ...(this.options.ssh === undefined ? {} : { ssh: this.options.ssh }),
                ...(this.options.scp === undefined ? {} : { scp: this.options.scp }),
                ...(this.options.rsync === undefined ? {} : { rsync: this.options.rsync }),
                ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
                signal: controller.signal,
                onLine: (message) => this.options.onEvent({ kind: "line", id, message }),
            });
            this.options.onEvent({ kind: "finished", id, result });
            return { id, result };
        } finally {
            this.active.delete(id);
        }
    }
}

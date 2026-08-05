/**
 * `SshWorldSourceFetcher`'s bookkeeping - ids, cancellation and events - proved with an
 * injected `fetch` so no real host, no `ssh` and no `scp` are anywhere near this file.
 */

import { describe, expect, it } from "vitest";
import { testTarget } from "../remote/fakes.js";
import { cancelled } from "../remote/failure.js";
import type { RemoteWorldFetchResult } from "../remote/worldsource.js";
import { SshWorldSourceFetcher } from "./sshFetcher.js";
import type { SshWorldSourceEvent } from "./sshFetcher.js";

const SUCCESS: RemoteWorldFetchResult = { ok: true, kind: "posix", transfer: "rsync", message: "Sending with rsync." };

describe("SshWorldSourceFetcher", () => {
    it("broadcasts every line and a finished event, and reports the same result it returns", async () => {
        const events: SshWorldSourceEvent[] = [];
        const fetcher = new SshWorldSourceFetcher({
            knownHostsFile: "/app/known_hosts",
            onEvent: (event) => events.push(event),
            fetch: async (_target, _remotePath, _localPath, options) => {
                options.onLine?.("connecting");
                options.onLine?.("Sending with rsync.");
                return SUCCESS;
            },
        });

        const { id, result } = await fetcher.fetch({
            target: testTarget(),
            remotePath: "/srv/world",
            localPath: "C:/local/world",
        });

        expect(result).toEqual(SUCCESS);
        expect(events).toEqual([
            { kind: "line", id, message: "connecting" },
            { kind: "line", id, message: "Sending with rsync." },
            { kind: "finished", id, result: SUCCESS },
        ]);
    });

    it("tracks a fetch as active only while it is running", async () => {
        let resolveFetch: () => void = () => {
            /* replaced below before it could matter */
        };
        const gate = new Promise<void>((resolve) => {
            resolveFetch = resolve;
        });
        const fetcher = new SshWorldSourceFetcher({
            knownHostsFile: "/app/known_hosts",
            onEvent: () => {
                /* not under test here */
            },
            fetch: async () => {
                await gate;
                return SUCCESS;
            },
        });

        const inFlight = fetcher.fetch({ target: testTarget(), remotePath: "/srv/world", localPath: "C:/local" });
        // Give the fetch a tick to register itself as active before the gate opens.
        await Promise.resolve();
        expect(fetcher.activeFetchIds()).toHaveLength(1);

        resolveFetch();
        await inFlight;
        expect(fetcher.activeFetchIds()).toEqual([]);
    });

    it("cancels an active fetch by aborting its signal, and reports an unknown id honestly", async () => {
        let sawAbort = false;
        const fetcher = new SshWorldSourceFetcher({
            knownHostsFile: "/app/known_hosts",
            onEvent: () => {
                /* not under test here */
            },
            fetch: async (_target, _remotePath, _localPath, options): Promise<RemoteWorldFetchResult> => {
                await new Promise<void>((resolve) => {
                    options.signal?.addEventListener("abort", () => {
                        sawAbort = true;
                        resolve();
                    });
                });
                return { ok: false, failure: cancelled(), hostKeys: [] };
            },
        });

        const inFlight = fetcher.fetch({ target: testTarget(), remotePath: "/srv/world", localPath: "C:/local" });
        await Promise.resolve();
        const [id] = fetcher.activeFetchIds();
        expect(id).toBeDefined();
        expect(fetcher.cancel("not-a-real-id")).toBe(false);
        if (id !== undefined) expect(fetcher.cancel(id)).toBe(true);

        await inFlight;
        expect(sawAbort).toBe(true);
        expect(fetcher.activeFetchIds()).toEqual([]);
    });

    it("assigns a distinct id to each fetch, even run concurrently", async () => {
        const fetcher = new SshWorldSourceFetcher({
            knownHostsFile: "/app/known_hosts",
            onEvent: () => {
                /* not under test here */
            },
            fetch: async () => SUCCESS,
        });

        const [first, second] = await Promise.all([
            fetcher.fetch({ target: testTarget(), remotePath: "/srv/a", localPath: "C:/a" }),
            fetcher.fetch({ target: testTarget(), remotePath: "/srv/b", localPath: "C:/b" }),
        ]);
        expect(first.id).not.toBe(second.id);
    });
});

/**
 * Starting the map web server, locally or in a container, and proving it answers.
 *
 * ## "Started" is not a claim this module is willing to make on faith
 *
 * Upstream logs `Starting webserver ...` *before* it binds, and its bind failure arrives
 * later as a `ConfigurationException` banner. So a log line is not evidence, and neither
 * is a process that is still alive: the JVM stays up for a moment after a failed bind
 * while it prints the banner and exits 1. The only evidence that a URL works is
 * connecting to it, from here, on the address a person would type - which is what
 * {@link WebServer.start} waits for before it reports a URL at all.
 *
 * That check earns its keep most on the Docker path. A container binds the port inside
 * its own network namespace, and `-p 127.0.0.1:8100:8100` is what carries it out to this
 * machine. If the config had said `ip: "127.0.0.1"` instead of `0.0.0.0`, the server would
 * start perfectly, log nothing wrong, and be unreachable from the host forever - the
 * failure that `config.ts` writes `0.0.0.0` into a container's config to prevent, and that
 * this probe would catch if it ever came back.
 *
 * ## Everything is injectable, so no test opens a socket
 *
 * The connect probe, the clock and the free-port picker are all parameters. A test can
 * therefore drive the whole "server never answers, so report that honestly" path in
 * milliseconds without binding anything.
 */

import { createServer, connect } from "node:net";
import { EngineProcess, type EngineRunResult, type SpawnEngine } from "./process.js";
import type { EngineLaunch } from "./plan.js";
import type { RenderSignal } from "../render/progress.js";

/** How long a web server is given to answer before the start is called a failure. */
export const READY_TIMEOUT_MS = 60_000;

/** How long between connect attempts while waiting. */
export const READY_POLL_MS = 250;

/** Answers whether something is listening on `host:port` right now. Never rejects. */
export type PortProbe = (host: string, port: number, timeoutMs: number) => Promise<boolean>;

/** The default probe: one TCP connection, opened and immediately closed. */
export const tcpPortProbe: PortProbe = (host, port, timeoutMs) =>
    new Promise<boolean>((resolve) => {
        const socket = connect({ host, port });
        let settled = false;
        const finish = (answer: boolean): void => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(answer);
        };
        socket.setTimeout(timeoutMs);
        socket.once("connect", () => finish(true));
        socket.once("timeout", () => finish(false));
        // A refused connection is the ordinary answer while a server is still starting,
        // so it is "not yet" rather than an error worth reporting.
        socket.once("error", () => finish(false));
    });

/**
 * A port nothing is listening on, chosen by asking the operating system for one.
 *
 * Binding port 0 and reading back what was assigned is the only way to pick a port
 * without a race that ends in a bind failure: scanning for a closed port and then binding
 * it leaves a window in which something else takes it.
 *
 * The window is not zero even here - this closes the socket before the engine binds - but
 * it is as small as a port can be reserved for a process that is not the one binding it.
 */
export async function freePort(host = "127.0.0.1"): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
        const server = createServer();
        server.once("error", reject);
        server.listen(0, host, () => {
            const address = server.address();
            const port = typeof address === "object" && address !== null ? address.port : 0;
            server.close(() => {
                if (port === 0) {
                    reject(new Error("The operating system did not assign a port to listen on."));
                    return;
                }
                resolve(port);
            });
        });
    });
}

export interface WebServerOptions {
    readonly launch: EngineLaunch;
    /** Where a person would open it. Defaults to the launch's own reported URL. */
    readonly url?: string;
    /** The address to probe. Loopback: the URL is always a host address. */
    readonly probeHost?: string;
    readonly probePort?: number;
    readonly readyTimeoutMs?: number;
    readonly pollMs?: number;
    readonly probe?: PortProbe;
    readonly spawn?: SpawnEngine;
    readonly env?: NodeJS.ProcessEnv;
    readonly onSignal?: (signal: RenderSignal, stream: "stdout" | "stderr") => void;
    readonly stopContainer?: (name: string) => Promise<void>;
    /** Injected so a test does not wait in real time. */
    readonly delay?: (ms: number) => Promise<void>;
    readonly now?: () => number;
}

export type WebServerStart =
    | {
          readonly ok: true;
          /** A URL that has been connected to from this machine, not one that was hoped for. */
          readonly url: string;
          readonly port: number;
      }
    | {
          readonly ok: false;
          /** One sentence naming what went wrong. */
          readonly reason: string;
          /** The engine's own outcome, when it exited rather than simply never answering. */
          readonly result: EngineRunResult | null;
      };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One run of the map web server.
 *
 * `start()` resolves once the port answers or once it is clear it never will; the process
 * keeps running afterwards and `finished` is the promise that resolves when it stops.
 * `stop()` is the same cancellation the render path uses, which for a container means
 * asking the daemon rather than killing a client that does not own the container.
 */
export class WebServer {
    private readonly options: WebServerOptions;
    private readonly process: EngineProcess;
    private run: Promise<EngineRunResult> | null = null;
    private outcome: EngineRunResult | null = null;

    constructor(options: WebServerOptions) {
        this.options = options;
        this.process = new EngineProcess({
            launch: options.launch,
            ...(options.spawn === undefined ? {} : { spawn: options.spawn }),
            ...(options.env === undefined ? {} : { env: options.env }),
            ...(options.onSignal === undefined ? {} : { onSignal: options.onSignal }),
            ...(options.stopContainer === undefined ? {} : { stopContainer: options.stopContainer }),
        });
    }

    /** The URL this run will report, once it has been proved to answer. */
    url(): string | null {
        return this.options.url ?? this.options.launch.url;
    }

    /** Resolves when the engine process has exited. Null until `start` has been called. */
    finished(): Promise<EngineRunResult> | null {
        return this.run;
    }

    /**
     * Starts the server and waits until it answers. Never rejects.
     *
     * Three outcomes and all three are values: it answered, the process exited before it
     * answered, or the wait ran out. The last two carry a sentence, and the second
     * carries the engine's own result so a repair pass has the exit code and stderr.
     */
    async start(): Promise<WebServerStart> {
        const url = this.url();
        const port = this.options.probePort ?? this.options.launch.hostPort;
        if (url === null || port === null) {
            return {
                ok: false,
                reason: "The web server was started without a port to publish, so there is no address to open.",
                result: null,
            };
        }

        const host = this.options.probeHost ?? "127.0.0.1";
        const probe = this.options.probe ?? tcpPortProbe;
        const delay = this.options.delay ?? sleep;
        const clock = this.options.now ?? Date.now;
        const deadline = clock() + (this.options.readyTimeoutMs ?? READY_TIMEOUT_MS);
        const pollMs = this.options.pollMs ?? READY_POLL_MS;

        this.run = this.process.start().then((result) => {
            this.outcome = result;
            return result;
        });
        // The rejection channel is never used - `EngineProcess.start` does not reject -
        // but an unobserved promise here would be an unhandled rejection warning the
        // moment that ever changed.
        this.run.catch(() => undefined);

        for (;;) {
            if (await probe(host, port, pollMs)) return { ok: true, url, port };

            const finished = this.outcome;
            if (finished !== null) {
                return {
                    ok: false,
                    reason: describeExit(finished, port),
                    result: finished,
                };
            }
            if (clock() >= deadline) {
                return {
                    ok: false,
                    reason: `The web server did not answer on ${host}:${String(port)} within ${String(
                        Math.round((this.options.readyTimeoutMs ?? READY_TIMEOUT_MS) / 1000),
                    )} seconds, so its address was not reported.`,
                    result: null,
                };
            }
            await delay(pollMs);
        }
    }

    /** Asks the server to stop. Safe before `start`, after it, and twice. */
    stop(): void {
        this.process.cancel();
    }
}

function describeExit(result: EngineRunResult, port: number): string {
    if (result.spawnError === "ENOENT") {
        return "The web server could not be started: the program that runs it was not found.";
    }
    if (result.spawnError !== null) {
        return `The web server could not be started (${result.spawnError}).`;
    }
    const last = result.diagnostics[result.diagnostics.length - 1] ?? result.stderr[result.stderr.length - 1];
    const said = last === undefined ? "" : ` ${last}`;
    return `The web server stopped before it answered on port ${String(port)}${
        result.exitCode === null ? "" : ` (exit code ${String(result.exitCode)})`
    }.${said}`;
}

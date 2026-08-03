/**
 * Bounded, isolated evaluation.
 *
 * Every request is given a deadline. When the deadline passes the channel is terminated outright,
 * which is the only reliable way to stop a regular expression that has started backtracking, and
 * a fresh one is spawned for the next request. Timeouts, invalid patterns and limit violations are
 * separate reported outcomes: none of them silently degrade into "no matches", and none of them
 * leave the previous pattern's results on screen as if they were current.
 */

import { REGEX_TIMEOUT_MS } from "./engine.js";
import type { RegexFilterResult, RegexRunResult } from "./engine.js";
import { createWorkerChannel } from "./workerChannel.js";
import type { RegexChannel, RegexRequest, RegexResponse } from "./workerChannel.js";

export type EvaluationOutcome<T> =
    | { readonly status: "ok"; readonly result: T }
    | { readonly status: "invalid"; readonly message: string }
    | { readonly status: "limit"; readonly message: string }
    | { readonly status: "timeout"; readonly limitMs: number }
    | { readonly status: "unavailable"; readonly message: string };

export type RunOutcome = EvaluationOutcome<RegexRunResult>;
export type FilterOutcome = EvaluationOutcome<RegexFilterResult>;

export interface EvaluatorOptions {
    /** Milliseconds before the channel is terminated. Defaults to `REGEX_TIMEOUT_MS`. */
    readonly timeoutMs?: number;
    /** Channel factory. Defaults to a blob worker. Returning `null` reports "unavailable". */
    readonly spawn?: () => RegexChannel | null;
}

interface PendingRequest {
    readonly resolve: (outcome: EvaluationOutcome<unknown>) => void;
    readonly timer: ReturnType<typeof setTimeout>;
}

const UNAVAILABLE_MESSAGE =
    "The isolated evaluator could not start, so no pattern was run. Plain text search still works.";

/**
 * Owns one channel and hands out bounded evaluations. Construct one per page, not one per field:
 * requests are keyed by id, so several search bars can share a single worker safely.
 */
export class BoundedRegexEvaluator {
    private readonly timeoutMs: number;
    private readonly spawn: () => RegexChannel | null;
    private readonly pending = new Map<number, PendingRequest>();
    private channel: RegexChannel | null = null;
    private channelFailed = false;
    private nextId = 1;
    private disposed = false;

    constructor(options: EvaluatorOptions = {}) {
        this.timeoutMs = options.timeoutMs ?? REGEX_TIMEOUT_MS;
        this.spawn = options.spawn ?? createWorkerChannel;
    }

    /** Milliseconds a single evaluation may take before it is stopped. */
    get limitMs(): number {
        return this.timeoutMs;
    }

    /** Run a pattern over sample text and report every match with its captures. */
    run(pattern: string, flags: string, sample: string): Promise<RunOutcome> {
        return this.send({ id: 0, op: "run", pattern, flags, sample }) as Promise<RunOutcome>;
    }

    /** Report which of `candidates` the pattern matches, and where each one first matched. */
    filter(
        pattern: string,
        flags: string,
        candidates: readonly string[],
    ): Promise<FilterOutcome> {
        return this.send({
            id: 0,
            op: "filter",
            pattern,
            flags,
            candidates,
        }) as Promise<FilterOutcome>;
    }

    /** Terminate the channel and fail every request still in flight. */
    dispose(): void {
        this.disposed = true;
        this.failAll({ status: "unavailable", message: UNAVAILABLE_MESSAGE });
        this.dropChannel();
    }

    private send(request: RegexRequest): Promise<EvaluationOutcome<unknown>> {
        if (this.disposed) {
            return Promise.resolve({ status: "unavailable", message: UNAVAILABLE_MESSAGE });
        }

        const channel = this.ensureChannel();
        if (channel === null) {
            return Promise.resolve({ status: "unavailable", message: UNAVAILABLE_MESSAGE });
        }

        const id = this.nextId;
        this.nextId += 1;

        return new Promise<EvaluationOutcome<unknown>>((resolve) => {
            const timer = setTimeout(() => {
                // Terminating is the point: a backtracking match cannot be asked to stop.
                this.dropChannel();
                this.settle(id, { status: "timeout", limitMs: this.timeoutMs });
                this.failAll({ status: "timeout", limitMs: this.timeoutMs });
            }, this.timeoutMs);

            this.pending.set(id, { resolve, timer });
            channel.postMessage({ ...request, id } as RegexRequest);
        });
    }

    private ensureChannel(): RegexChannel | null {
        if (this.channel !== null) {
            return this.channel;
        }
        if (this.channelFailed) {
            return null;
        }

        const channel = this.spawn();
        if (channel === null) {
            this.channelFailed = true;
            return null;
        }

        channel.onMessage((response) => this.receive(response));
        channel.onError((message) => {
            this.dropChannel();
            this.failAll({ status: "unavailable", message });
        });
        this.channel = channel;
        return channel;
    }

    private receive(response: RegexResponse): void {
        if (response.ok) {
            this.settle(response.id, { status: "ok", result: response.result });
            return;
        }
        if (response.code === "limit-exceeded") {
            this.settle(response.id, { status: "limit", message: response.message });
            return;
        }
        if (response.code === "invalid-pattern") {
            this.settle(response.id, { status: "invalid", message: response.message });
            return;
        }
        this.settle(response.id, { status: "unavailable", message: response.message });
    }

    private settle(id: number, outcome: EvaluationOutcome<unknown>): void {
        const entry = this.pending.get(id);
        if (entry === undefined) {
            return;
        }
        clearTimeout(entry.timer);
        this.pending.delete(id);
        entry.resolve(outcome);
    }

    private failAll(outcome: EvaluationOutcome<unknown>): void {
        for (const [id] of [...this.pending]) {
            this.settle(id, outcome);
        }
    }

    private dropChannel(): void {
        if (this.channel !== null) {
            this.channel.terminate();
            this.channel = null;
        }
    }
}

/** The evaluator every surface on the page shares. */
let sharedEvaluator: BoundedRegexEvaluator | null = null;

export function sharedRegexEvaluator(): BoundedRegexEvaluator {
    if (sharedEvaluator === null) {
        sharedEvaluator = new BoundedRegexEvaluator();
    }
    return sharedEvaluator;
}

/** Replace the shared evaluator. Used by tests and by teardown. */
export function setSharedRegexEvaluator(evaluator: BoundedRegexEvaluator | null): void {
    if (sharedEvaluator !== null && sharedEvaluator !== evaluator) {
        sharedEvaluator.dispose();
    }
    sharedEvaluator = evaluator;
}

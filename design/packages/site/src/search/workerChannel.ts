/**
 * The transport between the page and the isolated evaluator.
 *
 * Every regex the visitor writes runs inside a dedicated worker so that a pattern which
 * backtracks forever costs a terminated worker instead of a frozen page. The worker is built from
 * a blob URL whose source is `createRegexEngine` stringified, which keeps the whole thing local:
 * no second file to fetch, no network request, nothing to serve, and the exact code the tests
 * exercise is the code the worker runs.
 */

import { createRegexEngine } from "./engine.js";
import type { RegexFilterResult, RegexRunResult } from "./engine.js";

/** Ask the engine to run a pattern over sample text. */
export interface RunRequest {
    readonly id: number;
    readonly op: "run";
    readonly pattern: string;
    readonly flags: string;
    readonly sample: string;
}

/** Ask the engine which of these strings the pattern matches. */
export interface FilterRequest {
    readonly id: number;
    readonly op: "filter";
    readonly pattern: string;
    readonly flags: string;
    readonly candidates: readonly string[];
}

export type RegexRequest = RunRequest | FilterRequest;

/** Why an evaluation failed. Each is a distinct, reported state, never a silent no-match. */
export type RegexFailureCode = "invalid-pattern" | "limit-exceeded" | "internal";

export type RegexResponse =
    | { readonly id: number; readonly ok: true; readonly op: "run"; readonly result: RegexRunResult }
    | {
          readonly id: number;
          readonly ok: true;
          readonly op: "filter";
          readonly result: RegexFilterResult;
      }
    | {
          readonly id: number;
          readonly ok: false;
          readonly code: RegexFailureCode;
          readonly message: string;
      };

/**
 * The slice of `Worker` the evaluator needs. Declaring it explicitly keeps the evaluator testable
 * in Node, where there is no DOM `Worker`.
 */
export interface RegexChannel {
    postMessage(request: RegexRequest): void;
    onMessage(listener: (response: RegexResponse) => void): void;
    onError(listener: (message: string) => void): void;
    terminate(): void;
}

/**
 * Build the worker's source. `createRegexEngine` closes over nothing, so stringifying it produces
 * a complete program. `engine.test.ts` runs this source to prove that stays true.
 */
export function buildRegexWorkerSource(): string {
    return [
        '"use strict";',
        `const createRegexEngine = ${createRegexEngine.toString()};`,
        "const engine = createRegexEngine();",
        "function failureCode(error) {",
        '    if (error instanceof RangeError) { return "limit-exceeded"; }',
        '    if (error instanceof SyntaxError || error instanceof TypeError) { return "invalid-pattern"; }',
        '    return "internal";',
        "}",
        'self.addEventListener("message", (event) => {',
        "    const request = event.data;",
        "    try {",
        '        if (request.op === "filter") {',
        "            const result = engine.filterCandidates({",
        "                pattern: request.pattern,",
        "                flags: request.flags,",
        "                candidates: request.candidates,",
        "            });",
        '            self.postMessage({ id: request.id, ok: true, op: "filter", result });',
        "            return;",
        "        }",
        "        const result = engine.runRegex({",
        "            pattern: request.pattern,",
        "            flags: request.flags,",
        "            sample: request.sample,",
        "        });",
        '        self.postMessage({ id: request.id, ok: true, op: "run", result });',
        "    } catch (error) {",
        "        self.postMessage({",
        "            id: request.id,",
        "            ok: false,",
        "            code: failureCode(error),",
        "            message: error instanceof Error ? error.message : String(error),",
        "        });",
        "    }",
        "});",
    ].join("\n");
}

let cachedWorkerUrl: string | null = null;

/** The blob URL for the worker source, created once per page. */
export function regexWorkerUrl(): string {
    if (cachedWorkerUrl === null) {
        const blob = new Blob([buildRegexWorkerSource()], { type: "text/javascript" });
        cachedWorkerUrl = URL.createObjectURL(blob);
    }
    return cachedWorkerUrl;
}

/**
 * Spawn a worker-backed channel. Returns `null` when workers are unavailable, so the caller can
 * report that plainly instead of falling back to unbounded evaluation on the main thread.
 */
export function createWorkerChannel(): RegexChannel | null {
    if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
        return null;
    }

    let worker: Worker;
    try {
        worker = new Worker(regexWorkerUrl());
    } catch {
        return null;
    }

    return {
        postMessage(request) {
            worker.postMessage(request);
        },
        onMessage(listener) {
            worker.addEventListener("message", (event: MessageEvent<RegexResponse>) => {
                listener(event.data);
            });
        },
        onError(listener) {
            worker.addEventListener("error", (event: ErrorEvent) => {
                listener(event.message || "The isolated evaluator stopped unexpectedly.");
            });
        },
        terminate() {
            worker.terminate();
        },
    };
}

/**
 * A channel that answers on the calling thread. It exists for tests and for asserting the worker
 * protocol without a browser. The site never uses it: an uninterruptible evaluation on the main
 * thread is exactly what the worker is there to prevent.
 */
export function createInProcessChannel(): RegexChannel {
    const engine = createRegexEngine();
    let messageListener: ((response: RegexResponse) => void) | null = null;
    let stopped = false;

    function failureCode(error: unknown): RegexFailureCode {
        if (error instanceof RangeError) {
            return "limit-exceeded";
        }
        if (error instanceof SyntaxError || error instanceof TypeError) {
            return "invalid-pattern";
        }
        return "internal";
    }

    return {
        postMessage(request) {
            if (stopped || messageListener === null) {
                return;
            }
            const listener = messageListener;
            try {
                if (request.op === "filter") {
                    const result = engine.filterCandidates({
                        pattern: request.pattern,
                        flags: request.flags,
                        candidates: request.candidates,
                    });
                    listener({ id: request.id, ok: true, op: "filter", result });
                    return;
                }
                const result = engine.runRegex({
                    pattern: request.pattern,
                    flags: request.flags,
                    sample: request.sample,
                });
                listener({ id: request.id, ok: true, op: "run", result });
            } catch (error) {
                listener({
                    id: request.id,
                    ok: false,
                    code: failureCode(error),
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        },
        onMessage(listener) {
            messageListener = listener;
        },
        onError() {
            // An in-process channel reports failures through the message listener.
        },
        terminate() {
            stopped = true;
            messageListener = null;
        },
    };
}

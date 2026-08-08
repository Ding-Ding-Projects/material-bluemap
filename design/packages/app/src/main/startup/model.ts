import { randomUUID } from "node:crypto";

export type StartupCategory =
    | "profile-migration"
    | "configuration"
    | "dependency"
    | "preload"
    | "update"
    | "network"
    | "initialization"
    | "renderer";

export interface StartupIssue {
    readonly id: string;
    readonly sessionId: string;
    readonly category: StartupCategory;
    readonly phase: string;
    readonly title: string;
    readonly message: string;
    readonly detail: string | null;
    readonly occurredAt: string;
    readonly recoverable: boolean;
    readonly securityBoundary: boolean;
}

export interface StartupIssueInput {
    readonly category: StartupCategory;
    readonly phase: string;
    readonly title: string;
    readonly message: string;
    readonly detail?: string | null;
    readonly recoverable?: boolean;
    readonly securityBoundary?: boolean;
}

const REDACTIONS: readonly [RegExp, string][] = [
    [/\b(?:gh[opusr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/giu, "[credential removed]"],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [credential removed]"],
    [/([?&](?:access_?token|token|code)=)[^&#\s]+/giu, "$1[credential removed]"],
    [/(\b(?:authorization|password|secret)\s*[:=]\s*)[^\s,;]+/giu, "$1[credential removed]"],
];

export function redactStartupText(value: unknown): string {
    let text = value instanceof Error ? (value.stack ?? value.message) : String(value);
    for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
    return text;
}

export function toStartupIssue(sessionId: string, input: StartupIssueInput): StartupIssue {
    return {
        id: randomUUID(),
        sessionId,
        category: input.category,
        phase: input.phase,
        title: redactStartupText(input.title),
        message: redactStartupText(input.message),
        detail: input.detail == null ? null : redactStartupText(input.detail),
        occurredAt: new Date().toISOString(),
        recoverable: input.recoverable ?? true,
        securityBoundary: input.securityBoundary ?? false,
    };
}

export function errorMessage(error: unknown): string {
    return redactStartupText(error instanceof Error ? error.message : error);
}

export function errorDetail(error: unknown): string | null {
    if (!(error instanceof Error)) return null;
    return redactStartupText(error.stack ?? error.message);
}

export class SingleFlight<T> {
    private current: Promise<T> | null = null;

    run(operation: () => Promise<T>): Promise<T> {
        if (this.current !== null) return this.current;
        this.current = Promise.resolve()
            .then(operation)
            .finally(() => {
                this.current = null;
            });
        return this.current;
    }

    get running(): boolean {
        return this.current !== null;
    }
}

export async function attemptStartupStep<T>(options: {
    readonly category: StartupCategory;
    readonly phase: string;
    readonly title: string;
    readonly run: () => T | Promise<T>;
    readonly report: (issue: StartupIssueInput) => void | Promise<void>;
}): Promise<T | null> {
    try {
        return await options.run();
    } catch (error) {
        await options.report({
            category: options.category,
            phase: options.phase,
            title: options.title,
            message: errorMessage(error),
            detail: errorDetail(error),
            recoverable: true,
            securityBoundary: false,
        });
        return null;
    }
}

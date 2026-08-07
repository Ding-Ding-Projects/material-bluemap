/**
 * The Bedrock detection and conversion bridge, structurally mirrored from the preload for
 * the same reason `worldCatalog.ts` restates its own: this package compiles and runs in
 * three places and only one of them has a preload.
 */

export interface BedrockConfidence {
    readonly bedrock: boolean;
    readonly confidence: "certain" | "likely" | null;
    readonly markers: {
        readonly levelDat: boolean;
        readonly levelNameFile: boolean;
        readonly database: boolean;
        readonly databaseFiles: number | null;
    };
    readonly explanation: string;
}

export interface FidelityNote {
    readonly id: string;
    readonly title: string;
    readonly detail: string;
    readonly source: "chunker-readme" | "this-app";
}

export interface FidelityBriefing {
    readonly notes: readonly FidelityNote[];
    readonly mayBeOutOfDate: boolean;
    readonly checkedAgainst: string;
}

export type MemoryRiskLevel = "low" | "approaching" | "high" | "unknown";

export interface MemoryRisk {
    readonly level: MemoryRiskLevel;
    readonly sourceBytes: number | null;
    readonly thresholdBytes: number;
    readonly warn: boolean;
    readonly title: string;
    readonly detail: string;
}

export interface BedrockDetectResult {
    readonly folder: string;
    readonly detection: BedrockConfidence;
    readonly name: string | null;
    readonly suggestedOutput: string | null;
    readonly estimatedSize: { readonly low: number; readonly high: number } | null;
    readonly fidelity: FidelityBriefing | null;
    readonly memory: MemoryRisk | null;
    readonly error: string | null;
}

export interface ChunkerLicence {
    readonly spdx: "MIT";
    readonly holder: "Hive Games";
    readonly url: string;
    readonly bundled: false;
    readonly note: string;
}

/** Mirrors `ChunkerRelease` in `main/bedrock/chunker.ts`: what `fetchChunker` would fetch. */
export interface ChunkerReleaseReadout {
    readonly version: string;
    readonly asset: string;
    readonly url: string;
    readonly sha256: string;
    readonly sizeBytes: number | null;
    readonly digestTrust: "pinned" | "api";
    /** One sentence naming exactly what was and was not verified. */
    readonly verificationNote: string;
}

export interface ChunkerStatus {
    readonly lookup: { readonly found: boolean; readonly version: string | null } & Record<string, unknown>;
    readonly available: ChunkerReleaseReadout;
    readonly fidelity: FidelityBriefing;
    readonly licence: ChunkerLicence;
}

export type ConversionPhase = "starting" | "converting" | "compacting" | "verifying";

export type ConversionProgressEvent =
    | { readonly conversionId: string; readonly kind: "phase"; readonly phase: ConversionPhase }
    | { readonly conversionId: string; readonly kind: "progress"; readonly percent: number }
    | { readonly conversionId: string; readonly kind: "editions"; readonly from: string; readonly to: string }
    | { readonly conversionId: string; readonly kind: "log"; readonly line: string; readonly stream: "stdout" | "stderr" }
    | { readonly conversionId: string; readonly kind: "batch" } & Record<string, unknown>
    | { readonly conversionId: string; readonly kind: "download"; readonly received: number; readonly total: number | null }
    | { readonly conversionId: string; readonly kind: "finished"; readonly outcome: ConversionOutcome };

export interface ConversionSuccess {
    readonly ok: true;
    readonly outputDirectory: string;
    readonly regionFiles: number;
    readonly sourceEdition: string | null;
    readonly targetEdition: string | null;
    readonly durationMs: number;
}

export interface ConversionFailure {
    readonly ok: false;
    readonly code: string;
    readonly message: string;
    readonly cleanedUp: boolean;
    readonly diagnostics: readonly string[];
    readonly durationMs: number;
}

export type ConversionOutcome = ConversionSuccess | ConversionFailure;

export interface BedrockConvertRequest {
    readonly world: string;
    readonly output?: string;
    readonly format?: string;
    readonly sizeBytes?: number | null;
}

/** What this surface needs from the shell. All or nothing, per `historyHostFromBridge`'s own rule. */
export interface BedrockBridge {
    detect(folder: string, sizeBytes?: number | null): Promise<BedrockDetectResult>;
    chunkerStatus(): Promise<ChunkerStatus>;
    fetchChunker(): Promise<{ readonly ok: boolean; readonly message: string; readonly jarPath: string | null }>;
    convert(request: BedrockConvertRequest): Promise<ConversionOutcome & { readonly conversionId: string }>;
    cancel(conversionId: string): Promise<boolean>;
    onBedrockEvent(listener: (event: ConversionProgressEvent) => void): () => void;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The Bedrock bridge, or null when this build cannot detect or convert a Bedrock world.
 *
 * Reads the preload's `bedrock` namespace, exactly as `historyHostFromBridge` reads
 * `bridge.history` - a namespace rather than flat methods on the root, because `detect` and
 * `convert` are specific enough names that a flat bridge would risk colliding with an
 * unrelated method somebody adds later.
 */
export function resolveBedrockBridge(): BedrockBridge | null {
    const host = (globalThis as { worldlens?: { bedrock?: unknown } }).worldlens;
    if (host === undefined) return null;
    const api = host.bedrock;
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<BedrockBridge>;
    const required = [
        candidate.detect,
        candidate.chunkerStatus,
        candidate.fetchChunker,
        candidate.convert,
        candidate.cancel,
        candidate.onBedrockEvent,
    ];
    if (!required.every(isFunction)) return null;

    const complete = api as BedrockBridge;
    return {
        detect: (folder, sizeBytes) => complete.detect(folder, sizeBytes),
        chunkerStatus: () => complete.chunkerStatus(),
        fetchChunker: () => complete.fetchChunker(),
        convert: (request) => complete.convert(request),
        cancel: (conversionId) => complete.cancel(conversionId),
        onBedrockEvent: (listener) => complete.onBedrockEvent(listener),
    };
}

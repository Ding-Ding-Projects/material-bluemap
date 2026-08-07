/**
 * The renderer-side seam for fetching a Minecraft world from a saved SSH target.
 *
 * These types deliberately mirror the preload instead of importing it. The UI package is
 * also built for the documentation site, where Electron and Node do not exist. Keeping the
 * structural contract here lets the real desktop bridge be feature-detected without pulling
 * main-process code into the renderer bundle.
 */

import type { RemoteTarget } from "../remote/remoteBridge.js";

export type SshRemoteHostKind = "posix" | "windows" | "unknown";

export interface SshHostKeyOffer {
    readonly type: string;
    readonly base64: string;
    readonly fingerprint: string;
    readonly line: string;
}

export type SshDetectAnswer =
    | { readonly ok: true; readonly kind: SshRemoteHostKind; readonly detail: string | null }
    | {
          readonly ok: false;
          readonly message: string;
          readonly hostKeys: readonly SshHostKeyOffer[];
      };

export type SshRemoteWorldPathCheck =
    { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: string };

export interface SshRemoteWorldEntry {
    readonly path: string;
    readonly size: number;
    readonly mtimeMs: number;
}

export type SshSurveyAnswer =
    | {
          readonly ok: true;
          readonly kind: SshRemoteHostKind;
          readonly entries: readonly SshRemoteWorldEntry[];
      }
    | { readonly ok: false; readonly message: string };

export interface SshRemoteFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    readonly setting: unknown | null;
    readonly remoteCode: string;
    readonly target: string | null;
}

export type SshRemoteWorldFetchResult =
    | {
          readonly ok: true;
          readonly kind: SshRemoteHostKind;
          readonly transfer: "rsync" | "scp";
          readonly message: string;
      }
    | {
          readonly ok: false;
          readonly failure: SshRemoteFailure;
          readonly hostKeys: readonly SshHostKeyOffer[];
      };

export type SshWorldSourceEvent =
    | { readonly kind: "line"; readonly id: string; readonly message: string }
    | {
          readonly kind: "finished";
          readonly id: string;
          readonly result: SshRemoteWorldFetchResult;
      };

export interface SshWorldSourceBridge {
    validate(
        target: RemoteTarget,
    ): Promise<
        | { readonly ok: true; readonly target: RemoteTarget; readonly summary: string }
        | { readonly ok: false; readonly message: string }
    >;
    detect(target: RemoteTarget): Promise<SshDetectAnswer>;
    trustHostKey(
        target: RemoteTarget,
        fingerprint: string,
    ): Promise<{ readonly ok: boolean; readonly message: string }>;
    checkPath(path: string, kind: SshRemoteHostKind): Promise<SshRemoteWorldPathCheck>;
    survey(target: RemoteTarget, path: string, kind: SshRemoteHostKind): Promise<SshSurveyAnswer>;
    diff(
        previous: readonly SshRemoteWorldEntry[],
        current: readonly SshRemoteWorldEntry[],
    ): Promise<{
        readonly added: readonly string[];
        readonly changed: readonly string[];
        readonly removed: readonly string[];
        readonly unchanged: number;
        readonly anyChange: boolean;
    }>;
    fetch(request: {
        readonly target: RemoteTarget;
        readonly remotePath: string;
        readonly localPath: string;
    }): Promise<{ readonly id: string; readonly result: SshRemoteWorldFetchResult }>;
    cancel(id: string): Promise<boolean>;
    active(): Promise<readonly string[]>;
    onSshWorldSourceEvent(listener: (event: SshWorldSourceEvent) => void): () => void;
}

type Host = Partial<{
    worldlens: Partial<{ sshWorldSource: Partial<SshWorldSourceBridge> }>;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * Resolves the whole guided capability from the real nested preload shape.
 *
 * All methods are required. A partial bridge is more dangerous than an unavailable one:
 * showing a fingerprint without the method that re-scans and records it, or starting a
 * transfer without a cancellation route, would make controls that promise work they cannot
 * perform.
 */
export function resolveSshWorldSourceBridge(): SshWorldSourceBridge | null {
    const candidate = (globalThis as Host).worldlens?.sshWorldSource;
    if (candidate === undefined) return null;

    const required: readonly (keyof SshWorldSourceBridge)[] = [
        "validate",
        "detect",
        "trustHostKey",
        "checkPath",
        "survey",
        "diff",
        "fetch",
        "cancel",
        "active",
        "onSshWorldSourceEvent",
    ];
    if (!required.every((name) => isFunction(candidate[name]))) return null;
    return candidate as SshWorldSourceBridge;
}

/** A cheap survey is enough to require both parts that define a Java world folder. */
export function surveyLooksLikeWorld(entries: readonly SshRemoteWorldEntry[]): boolean {
    const paths = new Set(entries.map((entry) => entry.path.replaceAll("\\", "/").toLowerCase()));
    const hasLevel = paths.has("level.dat");
    const hasRegion = [...paths].some((path) =>
        /^(region|dim-1\/region|dim1\/region)\/[^/]+\.mca$/.test(path),
    );
    return hasLevel && hasRegion;
}

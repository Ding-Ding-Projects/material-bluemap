/**
 * Renderer-side seam for a world exposed by this computer's local Docker daemon.
 *
 * These structural types mirror the preload rather than importing Electron into the UI
 * package, which is also bundled into the documentation site.
 */

export type DockerWorldFailureCode =
    | "invalid-request"
    | "not-installed"
    | "daemon-unreachable"
    | "refused"
    | "unusable"
    | "not-found"
    | "not-a-world"
    | "live-world-not-acknowledged"
    | "copy-failed"
    | "storage-unwritable"
    | "cancelled";

export interface DockerWorldFailure {
    readonly code: DockerWorldFailureCode;
    readonly message: string;
    readonly detail: string | null;
}

export interface DockerContainerSummary {
    readonly id: string;
    readonly name: string;
    readonly image: string;
    readonly status: string;
    readonly running: boolean;
}

export interface DockerVolumeSummary {
    readonly name: string;
    readonly driver: string;
}

export interface DockerMount {
    readonly type: string;
    readonly source: string;
    readonly volumeName: string | null;
    readonly destination: string;
    readonly readOnly: boolean;
}

export interface DockerContainerDetail extends DockerContainerSummary {
    readonly mounts: readonly DockerMount[];
    readonly startedAt: string | null;
}

export interface DockerVolumeDetail extends DockerVolumeSummary {
    readonly mountpoint: string;
}

export type DockerWorldListAnswer =
    | {
          readonly ok: true;
          readonly containers: readonly DockerContainerSummary[];
          readonly volumes: readonly DockerVolumeSummary[];
      }
    | { readonly ok: false; readonly failure: DockerWorldFailure };

export type DockerContainerAnswer =
    | { readonly ok: true; readonly detail: DockerContainerDetail }
    | { readonly ok: false; readonly failure: DockerWorldFailure };

export type DockerVolumeAnswer =
    | { readonly ok: true; readonly detail: DockerVolumeDetail }
    | { readonly ok: false; readonly failure: DockerWorldFailure };

export type DockerSourceRequest =
    | {
          readonly kind: "container";
          readonly containerId: string;
          readonly mountDestination: string;
      }
    | { readonly kind: "volume"; readonly volumeName: string };

export interface DockerWorldFingerprint {
    readonly regions: readonly {
        readonly path: string;
        readonly bytes: number;
        readonly modifiedAt: number;
    }[];
}

export type DockerWorldFingerprintResult =
    | { readonly ok: true; readonly fingerprint: DockerWorldFingerprint | null }
    | { readonly ok: false; readonly failure: DockerWorldFailure };

export type DockerWorldFetchResult =
    | {
          readonly ok: true;
          readonly fetchId: string;
          readonly filesCopied: number;
          readonly filesUnchanged: number;
      }
    | { readonly ok: false; readonly fetchId: string; readonly failure: DockerWorldFailure };

export type DockerWorldEvent =
    | {
          readonly type: "started";
          readonly fetchId: string;
          readonly route: string;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly fetchId: string;
          readonly level: "info" | "warning";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "progress";
          readonly fetchId: string;
          readonly phase: "source-copy" | "placement" | "validation";
          readonly filesDone: number | null;
          readonly filesTotal: number | null;
          readonly currentFile: string | null;
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly fetchId: string;
          readonly filesCopied: number;
          readonly filesUnchanged: number;
          readonly at: string;
      }
    | {
          readonly type: "failed";
          readonly fetchId: string;
          readonly failure: DockerWorldFailure;
          readonly at: string;
      }
    | { readonly type: "cancelled"; readonly fetchId: string; readonly at: string };

export interface DockerWorldSourceBridge {
    list(): Promise<DockerWorldListAnswer>;
    inspectContainer(id: string): Promise<DockerContainerAnswer>;
    inspectVolume(name: string): Promise<DockerVolumeAnswer>;
    fetch(request: {
        readonly source: DockerSourceRequest;
        readonly destination: string;
        readonly acknowledgeLiveRisk?: boolean;
    }): Promise<DockerWorldFetchResult>;
    cancel(fetchId: string): Promise<boolean>;
    active(): Promise<readonly string[]>;
    fingerprint(source: DockerSourceRequest): Promise<DockerWorldFingerprintResult>;
    fingerprintsEqual(a: DockerWorldFingerprint, b: DockerWorldFingerprint): Promise<boolean>;
    onDockerWorldEvent(listener: (event: DockerWorldEvent) => void): () => void;
}

type Host = Partial<{
    materialBluemap: Partial<{ dockerWorld: Partial<DockerWorldSourceBridge> }>;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** Resolves only a complete capability; a picker with no cancel/event path is not complete. */
export function resolveDockerWorldSourceBridge(): DockerWorldSourceBridge | null {
    const candidate = (globalThis as Host).materialBluemap?.dockerWorld;
    if (candidate === undefined) return null;
    const required: readonly (keyof DockerWorldSourceBridge)[] = [
        "list",
        "inspectContainer",
        "inspectVolume",
        "fetch",
        "cancel",
        "active",
        "fingerprint",
        "fingerprintsEqual",
        "onDockerWorldEvent",
    ];
    return required.every((name) => isFunction(candidate[name]))
        ? (candidate as DockerWorldSourceBridge)
        : null;
}

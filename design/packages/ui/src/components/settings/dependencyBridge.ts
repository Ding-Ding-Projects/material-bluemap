/**
 * The seam between the system-dependency installer and the main process.
 *
 * A structural mirror of what the preload exposes on `window.worldlens`,
 * restated rather than imported for the same reason `settingsBridge.ts` restates its
 * own slice: this package compiles and runs in three places (the desktop app, a
 * browser tab, and under Vitest) and only the first of them has a preload. It is
 * deliberately its own file rather than folded into `settingsBridge.ts` - that file is
 * being extended for the Java-provisioning consent flow at the same time this one is
 * being written, and a shared file two people are mid-edit on is a merge conflict
 * waiting to happen, not a place to add nine more interfaces.
 *
 * Every method is optional and feature-detected one at a time, the same rule
 * `settingsBridge.ts` follows: a browser tab has no main process to ask, and the panel
 * says so rather than showing a button that quietly does nothing.
 */

/** Mirrors `SysdepManagerId` in `main/sysdeps/types.ts`. */
export type SysdepManagerId = "winget" | "chocolatey";

/** Mirrors `ElevationExpectation` in `main/sysdeps/types.ts`. */
export type SysdepElevation = "required" | "possible" | "none" | "unknown";

/** Mirrors `SysdepProgress`. Deliberately has no field that can hold a fabricated percentage. */
export type SysdepProgress =
    | { readonly kind: "determinate"; readonly percent: number }
    | { readonly kind: "indeterminate" }
    | { readonly kind: "none" };

/** Mirrors the preload's `SysdepPreviewRoute`. */
export type SysdepPreviewRoute =
    | { readonly kind: "package-manager"; readonly manager: SysdepManagerId; readonly packageId: string }
    | { readonly kind: "unsupported"; readonly reason: string }
    | { readonly kind: "unavailable"; readonly reason: string };

/** One row of the preview shown before the install button is pressed. */
export interface SysdepPreviewRow {
    readonly id: string;
    readonly displayName: string;
    readonly route: SysdepPreviewRoute;
    readonly elevation: SysdepElevation;
    /** The exact sentence to show before the button is pressed. Facts only. */
    readonly elevationDisclosure: string;
    readonly alreadyInstalled: boolean;
    readonly installedVersion: string | null;
}

export type SysdepInstallStage =
    | "queued"
    | "checking-existing"
    | "elevation-notice"
    | "resolving"
    | "downloading"
    | "installing"
    | "verifying"
    | "done"
    | "skipped"
    | "failed"
    | "cancelled";

export interface SysdepInstallEvent {
    readonly dependency: string;
    readonly manager: SysdepManagerId | null;
    readonly stage: SysdepInstallStage;
    readonly message: string;
    readonly progress: SysdepProgress;
}

/**
 * The real outcome of trying to get one dependency onto the machine. Every branch
 * that can genuinely happen is named - there is no generic "error" branch that
 * swallows the interesting ones.
 */
export type SysdepOutcome =
    | { readonly kind: "installed"; readonly dependency: string; readonly manager: SysdepManagerId; readonly verified: boolean; readonly verifiedOutput: string | null }
    | {
          readonly kind: "already-installed";
          readonly dependency: string;
          readonly manager: SysdepManagerId | null;
          readonly verified: boolean;
          readonly verifiedOutput: string | null;
      }
    | { readonly kind: "declined-elevation"; readonly dependency: string; readonly manager: SysdepManagerId; readonly exitCode: number | null }
    | { readonly kind: "not-found"; readonly dependency: string; readonly manager: SysdepManagerId; readonly packageId: string }
    | { readonly kind: "network-failure"; readonly dependency: string; readonly manager: SysdepManagerId; readonly message: string }
    | {
          readonly kind: "verification-failed";
          readonly dependency: string;
          readonly manager: SysdepManagerId;
          /** The package manager's own exit code - it reported success. */
          readonly exitCode: number | null;
          readonly message: string;
      }
    | {
          readonly kind: "failed";
          readonly dependency: string;
          readonly manager: SysdepManagerId | null;
          readonly exitCode: number | null;
          /** The package manager's real output, never a generic apology. */
          readonly message: string;
      }
    | { readonly kind: "cancelled"; readonly dependency: string }
    | { readonly kind: "unsupported"; readonly dependency: string; readonly message: string };

export interface SysdepBatchResult {
    readonly outcomes: readonly SysdepOutcome[];
    /** True the moment the batch stopped early because of cancellation. */
    readonly cancelled: boolean;
}

/**
 * Installing git, the GitHub CLI, Docker Desktop and rsync through winget/Chocolatey.
 *
 * Optional, like every bridge in this package: a browser tab has no main process to
 * launch `winget`/`choco` with, and the panel says so rather than showing a button
 * that quietly does nothing.
 */
export interface DependencyInstallerBridge {
    sysdepsPreview?: () => Promise<readonly SysdepPreviewRow[]>;
    installSysdeps?: (ids: readonly string[]) => Promise<SysdepBatchResult>;
    cancelSysdepInstall?: () => Promise<{ readonly cancelled: boolean }>;
    onSysdepInstallEvent?: (listener: (event: SysdepInstallEvent) => void) => () => void;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The preload, or null when there is none. Every method on it is still optional. */
export function resolveDependencyBridge(): DependencyInstallerBridge | null {
    const host = (globalThis as { worldlens?: DependencyInstallerBridge }).worldlens;
    return host ?? null;
}

/** True when this build can preview and install system dependencies at all. */
export function canInstallSysdeps(bridge: DependencyInstallerBridge | null): boolean {
    return (
        isFunction(bridge?.sysdepsPreview) &&
        isFunction(bridge?.installSysdeps) &&
        isFunction(bridge?.cancelSysdepInstall) &&
        isFunction(bridge?.onSysdepInstallEvent)
    );
}

/**
 * Shared vocabulary for the package-manager provisioning engine.
 *
 * This directory is the winget/Chocolatey sibling of `java/provision.ts`: that
 * module fetches a private JDK with no admin rights and no package manager in
 * sight, because a JVM belongs to this app alone. Everything here is for the
 * opposite case — Git, the GitHub CLI, Docker Desktop, rsync — real system tools
 * that other software and the user's own shell also want on `PATH`, which is
 * exactly why they go through a real installer instead of a private copy, and
 * exactly why that sometimes means asking Windows for administrator permission.
 *
 * The event shape below is deliberately close to `ProvisionEvent`'s — a stage, a
 * user-readable message, and progress fields — so a future combined readiness
 * surface can render both through one contract. It differs in the one place the
 * two domains genuinely differ: `ProvisionEvent.received`/`total` are byte counts,
 * because a direct download always knows its byte total ahead of time; a
 * package-manager install frequently does not, so progress here is explicit about
 * whether a percentage is known at all rather than forcing one.
 */

export type SysdepManagerId = "winget" | "chocolatey";

/** How a dependency is obtained. Chosen once per dependency, not per machine. */
export type SysdepRoute =
    | "winget"
    | "chocolatey"
    /** A Windows optional feature (DISM-backed), not a package-manager package. */
    | "windows-feature";

/**
 * Whether pressing the button is expected to raise a Windows elevation prompt.
 *
 * This is a property of the *installer the package ships*, not of the package
 * manager running it — winget and choco both run fine unelevated, but the
 * inno/wix/exe installer they hand off to can default to a per-machine install
 * that only Windows itself can authorize. `"unknown"` exists because Chocolatey's
 * own answer genuinely depends on how the machine's Chocolatey was set up, and
 * pretending to know is worse than saying so.
 */
export type ElevationExpectation = "required" | "possible" | "none" | "unknown";

/** How a post-install check confirms the tool actually runs. */
export interface SysdepVerifyCommand {
    readonly command: string;
    readonly args: readonly string[];
    /** Matched against combined stdout+stderr to confirm this is really the tool. */
    readonly outputPattern: RegExp;
}

/** A package-manager identity for one dependency, for one specific manager. */
export interface SysdepManagerTarget {
    readonly manager: SysdepManagerId;
    readonly packageId: string;
}

export interface SysdepDescriptor {
    readonly id: string;
    readonly displayName: string;
    readonly route: SysdepRoute;
    /** The manager tried first. Null only for the `"windows-feature"` route. */
    readonly primary: SysdepManagerTarget | null;
    /** Tried when `primary`'s manager is unavailable but this one is. */
    readonly fallback: SysdepManagerTarget | null;
    readonly elevation: ElevationExpectation;
    /**
     * The exact sentence to show BEFORE the button is pressed. Facts only — a
     * funny-level slider styles the copy around this elsewhere, never this string
     * itself, so it stays quotable verbatim in a disclosure the user must read.
     */
    readonly elevationDisclosure: string;
    readonly verify: SysdepVerifyCommand;
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

/**
 * What is known about completion right now.
 *
 * `"determinate"` only appears when the package manager itself printed a real
 * number — Chocolatey's `Progress: Downloading … NN%` line. `"indeterminate"` is
 * the honest answer for winget, which (confirmed live, see the scout notes) drops
 * its animated bar entirely and prints only phase lines once its stdout is not a
 * real console. `"none"` is for stages with no percentage concept at all
 * (resolving, verifying, elevation-notice). There is no field that can be read as
 * a fabricated percentage — the type does not allow inventing one.
 */
export type SysdepProgress =
    | { readonly kind: "determinate"; readonly percent: number }
    | { readonly kind: "indeterminate" }
    | { readonly kind: "none" };

export const NO_PROGRESS: SysdepProgress = { kind: "none" };
export const INDETERMINATE_PROGRESS: SysdepProgress = { kind: "indeterminate" };

export interface SysdepInstallEvent {
    readonly dependency: string;
    readonly manager: SysdepManagerId | null;
    readonly stage: SysdepInstallStage;
    readonly message: string;
    readonly progress: SysdepProgress;
}

/**
 * The real outcome of trying to get one dependency onto the machine.
 *
 * Every branch that can genuinely happen is named, per the brief: already
 * installed, declined elevation, not found, network failure, verification
 * failure despite a reported success, cancellation, and a route this engine
 * cannot take at all (the `windows-feature` case). There is deliberately no
 * generic "error" branch that swallows the interesting ones — `"failed"` is the
 * last resort, and it still carries the real exit code and output.
 */
export type SysdepOutcome =
    | {
          readonly kind: "installed";
          readonly dependency: string;
          readonly manager: SysdepManagerId;
          readonly verified: boolean;
          readonly verifiedOutput: string | null;
      }
    | {
          readonly kind: "already-installed";
          readonly dependency: string;
          readonly manager: SysdepManagerId | null;
          readonly verified: boolean;
          readonly verifiedOutput: string | null;
      }
    | {
          readonly kind: "declined-elevation";
          readonly dependency: string;
          readonly manager: SysdepManagerId;
          readonly exitCode: number | null;
      }
    | {
          readonly kind: "not-found";
          readonly dependency: string;
          readonly manager: SysdepManagerId;
          readonly packageId: string;
      }
    | {
          readonly kind: "network-failure";
          readonly dependency: string;
          readonly manager: SysdepManagerId;
          readonly message: string;
      }
    | {
          readonly kind: "verification-failed";
          readonly dependency: string;
          readonly manager: SysdepManagerId;
          /** The package manager's own exit code — it reported success. */
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
    | {
          readonly kind: "unsupported";
          readonly dependency: string;
          readonly message: string;
      };

export interface SysdepBatchResult {
    readonly outcomes: readonly SysdepOutcome[];
    /** True the moment the batch stopped early because of cancellation. */
    readonly cancelled: boolean;
}

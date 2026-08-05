/**
 * The per-dependency route table, decided once from the scout's live findings —
 * not something a caller picks per invocation.
 *
 * Two dependencies this app cares about are deliberately absent from this table:
 *
 * - **The JDK** is provisioned by `java/provision.ts` via direct download into the
 *   app's own `userData`, never through a package manager. It needs no admin
 *   rights and touches nothing else on the machine, which is exactly right for a
 *   private tool this one app uses — routing it through winget would trade that
 *   away for no benefit.
 * - **ssh** is Windows's own built-in OpenSSH client, present by default since
 *   Windows 10 1803. Where it is genuinely missing, the fix is the Windows
 *   optional-feature mechanism (DISM), always admin-gated, never a
 *   winget/Chocolatey package — the catalog packages that superficially match
 *   ("Microsoft.OpenSSH.Preview", "SSHells") would shadow the platform's own
 *   client rather than restore it. That route belongs to a Windows-capability
 *   checker, not this engine, so it is not modelled here at all.
 */

import type { RunProcess } from "./process.js";
import { checkChocolateyInstalled, detectChocolatey } from "./chocolatey.js";
import { checkWingetInstalled, detectWinget } from "./winget.js";
import type { SysdepDescriptor, SysdepManagerId } from "./types.js";

const GIT_ELEVATION =
    "Git's Windows installer defaults to a machine-wide install, so Windows will ask " +
    "for administrator permission before this runs.";
const GH_ELEVATION =
    "The GitHub CLI's installer defaults to a machine-wide install, so Windows will " +
    "ask for administrator permission before this runs.";
const DOCKER_ELEVATION =
    "Docker Desktop configures WSL2/Hyper-V integration and background services, " +
    "which unavoidably needs administrator permission on every current Windows " +
    "setup — Windows will ask for it before this runs.";
const RSYNC_ELEVATION =
    "Whether this needs administrator permission depends on how Chocolatey was set " +
    "up on this machine. If Chocolatey itself is not present yet, installing " +
    "Chocolatey first always needs administrator permission, before rsync's own " +
    "install even starts.";

export const SYSDEP_DEPENDENCIES: readonly SysdepDescriptor[] = [
    {
        id: "git",
        displayName: "Git",
        route: "winget",
        primary: { manager: "winget", packageId: "Git.Git" },
        fallback: { manager: "chocolatey", packageId: "git" },
        elevation: "required",
        elevationDisclosure: GIT_ELEVATION,
        verify: { command: "git", args: ["--version"], outputPattern: /git version/i },
    },
    {
        id: "githubCli",
        displayName: "GitHub CLI",
        route: "winget",
        primary: { manager: "winget", packageId: "GitHub.cli" },
        fallback: null,
        elevation: "required",
        elevationDisclosure: GH_ELEVATION,
        verify: { command: "gh", args: ["--version"], outputPattern: /gh version/i },
    },
    {
        id: "dockerDesktop",
        displayName: "Docker Desktop",
        route: "winget",
        primary: { manager: "winget", packageId: "Docker.DockerDesktop" },
        fallback: null,
        elevation: "required",
        elevationDisclosure: DOCKER_ELEVATION,
        verify: { command: "docker", args: ["--version"], outputPattern: /docker version/i },
    },
    {
        id: "rsync",
        displayName: "rsync",
        route: "chocolatey",
        primary: { manager: "chocolatey", packageId: "rsync" },
        fallback: null,
        elevation: "unknown",
        elevationDisclosure: RSYNC_ELEVATION,
        verify: { command: "rsync", args: ["--version"], outputPattern: /rsync\s+version/i },
    },
];

export function findSysdepDescriptor(id: string): SysdepDescriptor | null {
    return SYSDEP_DEPENDENCIES.find((descriptor) => descriptor.id === id) ?? null;
}

export interface SysdepAvailability {
    readonly winget: { readonly available: boolean; readonly version: string | null };
    readonly chocolatey: { readonly available: boolean; readonly version: string | null };
}

/** Detects both managers up front, once per batch, rather than once per dependency. */
export async function detectPackageManagers(run: RunProcess): Promise<SysdepAvailability> {
    const [winget, chocolatey] = await Promise.all([detectWinget(run), detectChocolatey(run)]);
    return { winget, chocolatey };
}

export type SysdepResolvedRoute =
    | {
          readonly kind: "package-manager";
          readonly manager: SysdepManagerId;
          readonly packageId: string;
      }
    | { readonly kind: "unsupported"; readonly reason: string }
    | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Picks the manager to use for one dependency, given what is actually on this
 * machine. Prefers `primary`, falls back to `fallback` only when `primary`'s
 * manager is unavailable — never because `fallback` is somehow "better".
 */
export function resolveSysdepRoute(
    descriptor: SysdepDescriptor,
    availability: SysdepAvailability,
): SysdepResolvedRoute {
    if (descriptor.route === "windows-feature") {
        return {
            kind: "unsupported",
            reason: `${descriptor.displayName} is a Windows feature, not a package-manager package.`,
        };
    }
    const managerAvailable = (manager: SysdepManagerId): boolean =>
        manager === "winget" ? availability.winget.available : availability.chocolatey.available;

    if (descriptor.primary !== null && managerAvailable(descriptor.primary.manager)) {
        return {
            kind: "package-manager",
            manager: descriptor.primary.manager,
            packageId: descriptor.primary.packageId,
        };
    }
    if (descriptor.fallback !== null && managerAvailable(descriptor.fallback.manager)) {
        return {
            kind: "package-manager",
            manager: descriptor.fallback.manager,
            packageId: descriptor.fallback.packageId,
        };
    }
    const wanted = [descriptor.primary?.manager, descriptor.fallback?.manager].filter(
        (manager): manager is SysdepManagerId => manager !== undefined,
    );
    return {
        kind: "unavailable",
        reason:
            wanted.length > 0
                ? `Neither ${wanted.join(" nor ")} is available on this machine.`
                : "No package manager is available on this machine.",
    };
}

export interface SysdepPresence {
    readonly installed: boolean;
    readonly version: string | null;
}

/** Checks whether the resolved package is already on the machine. */
export async function checkSysdepInstalled(
    run: RunProcess,
    route: { readonly manager: SysdepManagerId; readonly packageId: string },
): Promise<SysdepPresence> {
    return route.manager === "winget"
        ? checkWingetInstalled(run, route.packageId)
        : checkChocolateyInstalled(run, route.packageId);
}

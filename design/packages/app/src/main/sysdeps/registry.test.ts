import { describe, expect, it } from "vitest";
import {
    SYSDEP_DEPENDENCIES,
    checkSysdepInstalled,
    detectPackageManagers,
    findSysdepDescriptor,
    resolveSysdepRoute,
} from "./registry.js";
import type { RunProcess, RunProcessOptions } from "./process.js";
import type { SysdepAvailability } from "./registry.js";

function fakeRun(
    byCommand: Record<string, { readonly exitCode: number; readonly stdout?: string }>,
): RunProcess {
    return async (options: RunProcessOptions) => {
        const script = byCommand[options.command];
        if (script === undefined) {
            return {
                exitCode: null,
                stdout: "",
                stderr: "",
                aborted: false,
                timedOut: false,
                launchError: "ENOENT",
            };
        }
        return {
            exitCode: script.exitCode,
            stdout: script.stdout ?? "",
            stderr: "",
            aborted: false,
            timedOut: false,
            launchError: null,
        };
    };
}

describe("SYSDEP_DEPENDENCIES", () => {
    it("every entry carries an elevation disclosure sentence, not a placeholder", () => {
        for (const descriptor of SYSDEP_DEPENDENCIES) {
            expect(descriptor.elevationDisclosure.length).toBeGreaterThan(20);
        }
    });

    it("never defaults a machine-scope-shaped install to a per-user scope silently", () => {
        // Every dependency here today needs admin or is genuinely unknown - none of the
        // winget manifests declared `Scope: user` per the scout's live findings, so the
        // registry must not claim `elevation: "none"` for any of them.
        for (const descriptor of SYSDEP_DEPENDENCIES) {
            if (descriptor.primary?.manager === "winget") {
                expect(descriptor.elevation).not.toBe("none");
            }
        }
    });

    it("findSysdepDescriptor finds a known id and returns null for an unknown one", () => {
        expect(findSysdepDescriptor("git")?.displayName).toBe("Git");
        expect(findSysdepDescriptor("does-not-exist")).toBeNull();
    });
});

describe("resolveSysdepRoute", () => {
    const git = findSysdepDescriptor("git")!;
    const rsync = findSysdepDescriptor("rsync")!;

    it("uses the primary manager when it is available", () => {
        const availability: SysdepAvailability = {
            winget: { available: true, version: "v1.29.280" },
            chocolatey: { available: true, version: "2.7.3" },
        };
        const route = resolveSysdepRoute(git, availability);
        expect(route).toEqual({ kind: "package-manager", manager: "winget", packageId: "Git.Git" });
    });

    it("falls back to the secondary manager only when the primary is unavailable", () => {
        const availability: SysdepAvailability = {
            winget: { available: false, version: null },
            chocolatey: { available: true, version: "2.7.3" },
        };
        const route = resolveSysdepRoute(git, availability);
        expect(route).toEqual({ kind: "package-manager", manager: "chocolatey", packageId: "git" });
    });

    it("reports unavailable, naming the wanted managers, when neither is present", () => {
        const availability: SysdepAvailability = {
            winget: { available: false, version: null },
            chocolatey: { available: false, version: null },
        };
        const route = resolveSysdepRoute(git, availability);
        expect(route.kind).toBe("unavailable");
        if (route.kind === "unavailable") {
            expect(route.reason).toContain("winget");
            expect(route.reason).toContain("chocolatey");
        }
    });

    it("reports unavailable for a dependency with no fallback when its one manager is missing", () => {
        const availability: SysdepAvailability = {
            winget: { available: true, version: "v1.29.280" },
            chocolatey: { available: false, version: null },
        };
        const route = resolveSysdepRoute(rsync, availability);
        expect(route.kind).toBe("unavailable");
    });
});

describe("detectPackageManagers", () => {
    it("detects both managers from one call", async () => {
        const run = fakeRun({
            winget: { exitCode: 0, stdout: "v1.29.280" },
            choco: { exitCode: 0, stdout: "2.7.3" },
        });
        const availability = await detectPackageManagers(run);
        expect(availability.winget).toEqual({ available: true, version: "v1.29.280" });
        expect(availability.chocolatey).toEqual({ available: true, version: "2.7.3" });
    });
});

describe("checkSysdepInstalled", () => {
    it("dispatches to winget's own presence check", async () => {
        const run = fakeRun({ winget: { exitCode: 0, stdout: "Git  Git.Git  2.55.0.2" } });
        const result = await checkSysdepInstalled(run, { manager: "winget", packageId: "Git.Git" });
        expect(result.installed).toBe(true);
    });

    it("dispatches to Chocolatey's own presence check", async () => {
        const run = fakeRun({ choco: { exitCode: 0, stdout: "rsync|6.4.8" } });
        const result = await checkSysdepInstalled(run, {
            manager: "chocolatey",
            packageId: "rsync",
        });
        expect(result).toEqual({ installed: true, version: "6.4.8" });
    });
});

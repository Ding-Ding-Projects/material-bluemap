import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { createDependencyInstaller } from "./dependencyInstaller.js";
import type {
    DependencyInstallerBridge,
    SysdepBatchResult,
    SysdepInstallEvent,
    SysdepPreviewRow,
} from "./dependencyBridge.js";

const GIT_PREVIEW: SysdepPreviewRow = {
    id: "git",
    displayName: "Git",
    route: { kind: "package-manager", manager: "winget", packageId: "Git.Git" },
    elevation: "required",
    elevationDisclosure: "Git's installer needs administrator permission.",
    alreadyInstalled: false,
    installedVersion: null,
};

const RSYNC_PREVIEW: SysdepPreviewRow = {
    id: "rsync",
    displayName: "rsync",
    route: { kind: "package-manager", manager: "chocolatey", packageId: "rsync" },
    elevation: "unknown",
    elevationDisclosure: "Depends on this machine's Chocolatey setup.",
    alreadyInstalled: false,
    installedVersion: null,
};

const ALREADY_THERE: SysdepPreviewRow = {
    id: "githubCli",
    displayName: "GitHub CLI",
    route: { kind: "package-manager", manager: "winget", packageId: "GitHub.cli" },
    elevation: "required",
    elevationDisclosure: "The GitHub CLI's installer needs administrator permission.",
    alreadyInstalled: true,
    installedVersion: "2.97.0",
};

/** Runs a composable inside a real effect scope so `onScopeDispose` is valid. */
function withScope<T>(factory: () => T): { readonly value: T; readonly stop: () => void } {
    const scope = effectScope();
    const value = scope.run(factory);
    if (value === undefined) throw new Error("factory returned undefined");
    return { value, stop: () => scope.stop() };
}

function fakeBridge(overrides: Partial<DependencyInstallerBridge> = {}): DependencyInstallerBridge {
    return {
        sysdepsPreview: () => Promise.resolve([GIT_PREVIEW, RSYNC_PREVIEW, ALREADY_THERE]),
        installSysdeps: () => Promise.resolve({ outcomes: [], cancelled: false }),
        cancelSysdepInstall: () => Promise.resolve({ cancelled: false }),
        onSysdepInstallEvent: () => () => undefined,
        ...overrides,
    };
}

describe("createDependencyInstaller", () => {
    it("reports unsupported when there is no bridge, rather than a broken button", () => {
        const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge: null }));
        expect(installer.supported).toBe(false);
        expect(installer.previewState.value).toBe("unsupported");
        stop();
    });

    it("loads the preview and pre-selects everything the button would actually change", async () => {
        const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge: fakeBridge() }));
        await installer.loadPreview();

        expect(installer.previewState.value).toBe("ready");
        expect(installer.rows.value.map((row) => row.id)).toEqual(["git", "rsync", "githubCli"]);
        // Already-installed is excluded from the default selection - installing it again
        // would not change anything, so the button's own count must not include it.
        expect([...installer.selected.value].sort()).toEqual(["git", "rsync"]);
        expect(installer.installableRows.value.map((row) => row.id)).toEqual(["git", "rsync"]);
        stop();
    });

    it("reports a real preview failure rather than an empty list", async () => {
        const bridge = fakeBridge({
            sysdepsPreview: () => Promise.reject(new Error("winget itself would not launch")),
        });
        const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge }));
        await installer.loadPreview();

        expect(installer.previewState.value).toBe("failed");
        expect(installer.previewFailure.value).toBe("winget itself would not launch");
        stop();
    });

    describe("bulk selection", () => {
        it("selects all, none, and the inverse, over installable rows only", async () => {
            const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge: fakeBridge() }));
            await installer.loadPreview();

            installer.selectNone();
            expect(installer.selected.value.size).toBe(0);

            installer.selectAll();
            expect([...installer.selected.value].sort()).toEqual(["git", "rsync"]);
            // The already-installed row is never in the selectable set at all.
            expect(installer.selected.value.has("githubCli")).toBe(false);

            installer.toggle("git");
            expect(installer.selected.value.has("git")).toBe(false);

            installer.selectInverse();
            expect([...installer.selected.value].sort()).toEqual(["git"]);
            stop();
        });
    });

    describe("running a batch", () => {
        it("renders winget's real indeterminate progress and Chocolatey's real percentages, never a fabricated number", async () => {
            let onEvent: ((event: SysdepInstallEvent) => void) | null = null;
            const bridge = fakeBridge({
                onSysdepInstallEvent: (listener) => {
                    onEvent = listener;
                    return () => undefined;
                },
                installSysdeps: async (ids) => {
                    for (const id of ids) {
                        onEvent?.({
                            dependency: id,
                            manager: id === "git" ? "winget" : "chocolatey",
                            stage: "downloading",
                            message: `Downloading ${id}`,
                            progress:
                                id === "git" ? { kind: "indeterminate" } : { kind: "determinate", percent: 42 },
                        });
                    }
                    return {
                        outcomes: ids.map((id) => ({
                            kind: "installed" as const,
                            dependency: id,
                            manager: (id === "git" ? "winget" : "chocolatey") as "winget" | "chocolatey",
                            verified: true,
                            verifiedOutput: `${id} works`,
                        })),
                        cancelled: false,
                    };
                },
            });

            const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge }));
            await installer.loadPreview();
            await installer.run();

            const gitRow = installer.rows.value.find((row) => row.id === "git");
            const rsyncRow = installer.rows.value.find((row) => row.id === "rsync");
            expect(gitRow?.progress).toEqual({ kind: "indeterminate" });
            expect(rsyncRow?.progress).toEqual({ kind: "determinate", percent: 42 });
            expect(gitRow?.outcome?.kind).toBe("installed");
            stop();
        });

        it("shows a failed item's real error and exit code, not a generic apology", async () => {
            const bridge = fakeBridge({
                installSysdeps: () =>
                    Promise.resolve<SysdepBatchResult>({
                        outcomes: [
                            {
                                kind: "failed",
                                dependency: "git",
                                manager: "winget",
                                exitCode: 1603,
                                message: "winget: installer returned a fatal error (0x643)",
                            },
                        ],
                        cancelled: false,
                    }),
            });
            const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge }));
            await installer.loadPreview();
            installer.selectNone();
            installer.toggle("git");
            await installer.run();

            const gitRow = installer.rows.value.find((row) => row.id === "git");
            expect(gitRow?.outcome).toEqual({
                kind: "failed",
                dependency: "git",
                manager: "winget",
                exitCode: 1603,
                message: "winget: installer returned a fatal error (0x643)",
            });
            stop();
        });

        it("reports cancellation honestly: what finished stays finished, what did not is said plainly", async () => {
            const bridge = fakeBridge({
                installSysdeps: () =>
                    Promise.resolve<SysdepBatchResult>({
                        outcomes: [
                            { kind: "installed", dependency: "git", manager: "winget", verified: true, verifiedOutput: "git works" },
                            { kind: "cancelled", dependency: "rsync" },
                        ],
                        cancelled: true,
                    }),
            });
            const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge }));
            await installer.loadPreview();
            await installer.run();

            expect(installer.lastResult.value?.cancelled).toBe(true);
            const gitRow = installer.rows.value.find((row) => row.id === "git");
            const rsyncRow = installer.rows.value.find((row) => row.id === "rsync");
            expect(gitRow?.outcome?.kind).toBe("installed");
            expect(rsyncRow?.outcome?.kind).toBe("cancelled");
            stop();
        });

        it("does nothing when nothing is selected, rather than calling install with an empty batch", async () => {
            const install = vi.fn();
            const bridge = fakeBridge({ installSysdeps: install });
            const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge }));
            await installer.loadPreview();
            installer.selectNone();
            await installer.run();

            expect(install).not.toHaveBeenCalled();
            stop();
        });

        it("cancel() calls the real cancel channel and moves run state to cancelling", async () => {
            const cancelFn = vi.fn(() => Promise.resolve({ cancelled: true }));
            const bridge = fakeBridge({ cancelSysdepInstall: cancelFn });
            const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge }));
            await installer.cancel();
            expect(cancelFn).toHaveBeenCalledOnce();
            expect(installer.runState.value).toBe("cancelling");
            stop();
        });
    });

    it("keeps a running log of every event, in order, for the exportable install log", async () => {
        let onEvent: ((event: SysdepInstallEvent) => void) | null = null;
        const bridge = fakeBridge({
            onSysdepInstallEvent: (listener) => {
                onEvent = listener;
                return () => undefined;
            },
            installSysdeps: async () => {
                onEvent?.({ dependency: "git", manager: "winget", stage: "queued", message: "Waiting", progress: { kind: "none" } });
                onEvent?.({ dependency: "git", manager: "winget", stage: "done", message: "Installed", progress: { kind: "none" } });
                return { outcomes: [], cancelled: false };
            },
        });
        const { value: installer, stop } = withScope(() => createDependencyInstaller({ bridge }));
        await installer.loadPreview();
        await installer.run();

        expect(installer.log.value.map((event) => event.stage)).toEqual(["queued", "done"]);
        stop();
    });
});

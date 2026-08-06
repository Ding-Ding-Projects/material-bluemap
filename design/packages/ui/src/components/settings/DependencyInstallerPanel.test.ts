/**
 * @vitest-environment jsdom
 *
 * The one-button system-dependency installer, mounted.
 *
 * What is only true of the rendered component, and would be asserted against nothing
 * useful as a stand-in: that the elevation disclosure actually appears on screen
 * before the button is pressed, naming the real dependencies; that a real
 * determinate percentage renders differently from winget's honest indeterminate
 * state; that a failed row shows its real exit code and message, not a generic
 * apology; and that the search bar really filters the rows on screen.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import DependencyInstallerPanel from "./DependencyInstallerPanel.vue";
import type { DependencyInstallerBridge, SysdepInstallEvent, SysdepPreviewRow } from "./dependencyBridge.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;

    Element.prototype.scrollIntoView = () => {};
    document.elementsFromPoint = (): Element[] => [];

    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        },
    });
});

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

const GIT_ROW: SysdepPreviewRow = {
    id: "git",
    displayName: "Git",
    route: { kind: "package-manager", manager: "winget", packageId: "Git.Git" },
    elevation: "required",
    elevationDisclosure: "Git's installer needs administrator permission before this runs.",
    alreadyInstalled: false,
    installedVersion: null,
};

const RSYNC_ROW: SysdepPreviewRow = {
    id: "rsync",
    displayName: "rsync",
    route: { kind: "package-manager", manager: "chocolatey", packageId: "rsync" },
    elevation: "unknown",
    elevationDisclosure: "Whether rsync needs administrator permission depends on this machine's Chocolatey setup.",
    alreadyInstalled: false,
    installedVersion: null,
};

function fakeBridge(overrides: Partial<DependencyInstallerBridge> = {}): DependencyInstallerBridge {
    return {
        sysdepsPreview: () => Promise.resolve([GIT_ROW, RSYNC_ROW]),
        installSysdeps: () => Promise.resolve({ outcomes: [], cancelled: false }),
        cancelSysdepInstall: () => Promise.resolve({ cancelled: false }),
        onSysdepInstallEvent: () => () => undefined,
        ...overrides,
    };
}

function panel(bridge: DependencyInstallerBridge | null) {
    return mount(DependencyInstallerPanel, {
        props: { bridge },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
}

describe("a build that cannot reach the main process", () => {
    it("says so, rather than showing a button that quietly does nothing", async () => {
        const wrapper = panel(null);
        await flushPromises();
        expect(wrapper.text()).toContain("This build cannot install system dependencies from here");
        wrapper.unmount();
    });
});

describe("the preview, before the button is pressed", () => {
    it("names the exact route and elevation disclosure for every dependency", async () => {
        const wrapper = panel(fakeBridge());
        await flushPromises();

        expect(wrapper.text()).toContain("winget: Git.Git");
        expect(wrapper.text()).toContain("Chocolatey: rsync");
        expect(wrapper.text()).toContain("Git's installer needs administrator permission before this runs.");
        expect(wrapper.text()).toContain("Whether rsync needs administrator permission depends on this machine's Chocolatey setup.");
        // Both dependencies are selected by default (neither is already installed) and
        // both need elevation, so the disclosure banner reports both of them, before
        // any install has run.
        expect(wrapper.text()).toContain("2 of these will ask Windows for administrator permission");
        wrapper.unmount();
    });

    it("marks an already-installed dependency and excludes it from the default selection", async () => {
        const already: SysdepPreviewRow = { ...GIT_ROW, alreadyInstalled: true, installedVersion: "2.55.0.2" };
        const wrapper = panel(fakeBridge({ sysdepsPreview: () => Promise.resolve([already, RSYNC_ROW]) }));
        await flushPromises();

        expect(wrapper.text()).toContain("Already installed (2.55.0.2)");
        // Only rsync needs elevation once git is excluded as already installed.
        expect(wrapper.text()).toContain("1 of these will ask Windows for administrator permission");
        wrapper.unmount();
    });
});

describe("running the batch", () => {
    it("renders Chocolatey's real percentage and winget's honest indeterminate state, never inventing a number", async () => {
        let onEvent: ((event: SysdepInstallEvent) => void) | null = null;
        const wrapper = panel(
            fakeBridge({
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
                            progress: id === "git" ? { kind: "indeterminate" } : { kind: "determinate", percent: 63 },
                        });
                    }
                    await Promise.resolve();
                    return { outcomes: [], cancelled: false };
                },
            }),
        );
        await flushPromises();

        const install = wrapper.findAll("button").find((btn) => btn.text().includes("Install"));
        await install?.trigger("click");
        await flushPromises();

        const bars = wrapper.findAllComponents({ name: "VProgressLinear" });
        const determinate = bars.find((bar) => bar.attributes("aria-valuenow") === "63");
        const indeterminate = bars.find((bar) => bar.props("indeterminate") === true && bar.attributes("aria-valuenow") === undefined);
        expect(determinate).toBeTruthy();
        expect(indeterminate).toBeTruthy();
        wrapper.unmount();
    });

    it("shows a failed row's real error and exit code, not a generic apology", async () => {
        const wrapper = panel(
            fakeBridge({
                installSysdeps: () =>
                    Promise.resolve({
                        outcomes: [
                            {
                                kind: "failed" as const,
                                dependency: "git",
                                manager: "winget" as const,
                                exitCode: 1603,
                                message: "winget: installer returned a fatal error (0x643)",
                            },
                        ],
                        cancelled: false,
                    }),
            }),
        );
        await flushPromises();

        const install = wrapper.findAll("button").find((btn) => btn.text().includes("Install"));
        await install?.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("1603");
        expect(wrapper.text()).toContain("winget: installer returned a fatal error (0x643)");
        wrapper.unmount();
    });

    it("shows a Cancel button while running, and hides the Install button", async () => {
        let resolveInstall: (() => void) | null = null;
        const wrapper = panel(
            fakeBridge({
                installSysdeps: () =>
                    new Promise((resolve) => {
                        resolveInstall = () => resolve({ outcomes: [], cancelled: false });
                    }),
            }),
        );
        await flushPromises();

        const install = wrapper.findAll("button").find((btn) => btn.text().includes("Install"));
        await install?.trigger("click");
        await flushPromises();

        expect(wrapper.findAll("button").some((btn) => btn.text().includes("Cancel"))).toBe(true);
        expect(wrapper.findAll("button").some((btn) => btn.text().includes("Install"))).toBe(false);

        resolveInstall?.();
        await flushPromises();
    });
});

describe("finding one among many", () => {
    it("filters rows by the search bar", async () => {
        // Four rows, not three: the search field only renders once there is enough to
        // search, the same threshold `ProjectList.vue` uses for its own list.
        const third: SysdepPreviewRow = {
            id: "dockerDesktop",
            displayName: "Docker Desktop",
            route: { kind: "package-manager", manager: "winget", packageId: "Docker.DockerDesktop" },
            elevation: "required",
            elevationDisclosure: "Docker Desktop needs administrator permission.",
            alreadyInstalled: false,
            installedVersion: null,
        };
        const fourth: SysdepPreviewRow = {
            id: "githubCli",
            displayName: "GitHub CLI",
            route: { kind: "package-manager", manager: "winget", packageId: "GitHub.cli" },
            elevation: "required",
            elevationDisclosure: "The GitHub CLI needs administrator permission.",
            alreadyInstalled: false,
            installedVersion: null,
        };
        const wrapper = panel(
            fakeBridge({ sysdepsPreview: () => Promise.resolve([GIT_ROW, RSYNC_ROW, third, fourth]) }),
        );
        await flushPromises();

        const field = wrapper.find('input[type="text"], input:not([type])');
        await field.setValue("docker");
        await flushPromises();

        expect(wrapper.text()).toContain("Docker Desktop");
        // The blurb paragraph mentions "rsync" by name regardless of the search, so the
        // real assertion is against the row's own route chip, which only renders per row.
        expect(wrapper.text()).not.toContain("Chocolatey: rsync");
        wrapper.unmount();
    });
});

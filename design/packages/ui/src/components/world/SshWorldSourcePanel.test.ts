// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import SshWorldSourcePanel from "./SshWorldSourcePanel.vue";
import type { RemoteBridge, RemoteTarget, TargetStorage } from "../remote/index.js";
import type { SshWorldSourceBridge, SshWorldSourceEvent } from "./sshWorldSourceBridge.js";

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
});

const target: RemoteTarget = {
    id: "server",
    label: "Backyard server",
    host: "server.lan",
    port: 22,
    user: "minecraft",
    identityFile: null,
    workDir: "/srv/bluemap",
    image: "eclipse-temurin:21-jre",
    docker: "docker",
    keepRemoteFiles: false,
};

function memoryStorage(): TargetStorage {
    const values = new Map<string, string>([
        ["material-bluemap-remote-targets", JSON.stringify({ version: 1, targets: [target] })],
    ]);
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
}

function remoteBridge(): RemoteBridge {
    return {
        validateRemoteTarget: async () => ({ ok: true, target, summary: "valid" }),
        describeRemoteTarget: async () => ({ ok: false, message: "not needed" }),
        remotePreflight: async () => {
            throw new Error("not needed");
        },
        trustRemoteHostKey: async () => ({ ok: false, message: "not needed" }),
        startRemoteRender: async () => {
            throw new Error("not needed");
        },
        cancelRemoteRender: async () => false,
        activeRemoteRenders: async () => [],
        browseRemoteDirectory: async (_target, path) => ({
            ok: true,
            listing: {
                path,
                os: "linux",
                separator: "/",
                entries: [],
                truncated: false,
                totalEntries: 0,
            },
        }),
        canDescribe: false,
        canTrustHostKey: false,
        canCancel: false,
        canSeeActive: false,
        canBrowse: true,
    };
}

function sshBridge() {
    const listeners = new Set<(event: SshWorldSourceEvent) => void>();
    let trusted = false;
    const bridge: SshWorldSourceBridge = {
        validate: vi.fn(async () => ({ ok: true as const, target, summary: "valid" })),
        detect: vi.fn(async () =>
            trusted
                ? { ok: true as const, kind: "posix" as const, detail: "Linux" }
                : {
                      ok: false as const,
                      message: "This host key is unknown.",
                      hostKeys: [
                          {
                              type: "ssh-ed25519",
                              base64: "AAAA",
                              fingerprint: "SHA256:review-me",
                              line: "server ssh-ed25519 AAAA",
                          },
                      ],
                  },
        ),
        trustHostKey: vi.fn(async (_target, fingerprint) => {
            trusted = fingerprint === "SHA256:review-me";
            return {
                ok: trusted,
                message: trusted ? "Fingerprint recorded after re-scan." : "Fingerprint changed.",
            };
        }),
        checkPath: vi.fn(async (path) => ({ ok: true as const, path })),
        survey: vi.fn(async () => ({
            ok: true as const,
            kind: "posix" as const,
            entries: [
                { path: "level.dat", size: 64, mtimeMs: 1 },
                { path: "region/r.0.0.mca", size: 4096, mtimeMs: 2 },
            ],
        })),
        diff: vi.fn(async () => ({
            added: [],
            changed: [],
            removed: [],
            unchanged: 2,
            anyChange: false,
        })),
        fetch: vi.fn(async () => {
            listeners.forEach((listener) =>
                listener({ kind: "line", id: "fetch-1", message: "Sending with rsync" }),
            );
            return {
                id: "fetch-1",
                result: {
                    ok: true as const,
                    kind: "posix" as const,
                    transfer: "rsync" as const,
                    message: "resumable",
                },
            };
        }),
        cancel: vi.fn(async () => true),
        active: vi.fn(async () => []),
        onSshWorldSourceEvent: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    return bridge;
}

function mounted(bridge: SshWorldSourceBridge) {
    return mount(SshWorldSourcePanel, {
        props: { bridge, remoteBridge: remoteBridge(), storage: memoryStorage() },
        global: {
            plugins: [
                createVuetify(),
                createI18n({
                    legacy: false,
                    missingWarn: false,
                    fallbackWarn: false,
                    locale: "none",
                    fallbackLocale: "none",
                    messages: {},
                }),
            ],
            stubs: {
                AppearanceTarget: { template: "<section><slot /></section>" },
                ConfigSearchField: { template: "<div data-test='search-with-regex-builder' />" },
                RemoteTargetEditor: { template: "<div data-test='real-target-editor' />" },
                RemoteFileBrowser: { template: "<div data-test='real-remote-browser' />" },
                PathField: { template: "<div data-test='local-path-field' />" },
            },
        },
    });
}

describe("the mounted SSH world-source wizard path", () => {
    it("requires reviewed trust, surveys a real world, fetches it, and hands the local folder back", async () => {
        const bridge = sshBridge();
        const wrapper = mounted(bridge);
        await wrapper.get("[data-test='ssh-open']").trigger("click");
        const vm = wrapper.vm as unknown as {
            chooseTarget(id: string): void;
            detect(): Promise<void>;
            trust(key: {
                type: string;
                base64: string;
                fingerprint: string;
                line: string;
            }): Promise<void>;
            chooseRemoteFolder(path: string): void;
            surveyRemote(): Promise<void>;
            localParent: string;
            fetchWorld(): Promise<void>;
        };

        vm.chooseTarget("server");
        await vm.detect();
        await flushPromises();
        expect(wrapper.text()).toContain("SHA256:review-me");
        expect(wrapper.find("[data-test='ssh-browse']").attributes("disabled")).toBeDefined();

        await vm.trust({
            type: "ssh-ed25519",
            base64: "AAAA",
            fingerprint: "SHA256:review-me",
            line: "server ssh-ed25519 AAAA",
        });
        vm.chooseRemoteFolder("/srv/minecraft/world");
        await vm.surveyRemote();
        vm.localParent = "C:\\Fetched Worlds";
        await vm.fetchWorld();
        await flushPromises();

        expect(bridge.trustHostKey).toHaveBeenCalledWith(target, "SHA256:review-me");
        expect(bridge.survey).toHaveBeenCalledWith(target, "/srv/minecraft/world", "posix");
        expect(bridge.fetch).toHaveBeenCalledWith({
            target,
            remotePath: "/srv/minecraft/world",
            localPath: "C:\\Fetched Worlds",
        });
        expect(wrapper.emitted("use")).toEqual([["C:\\Fetched Worlds\\world"]]);
        expect(wrapper.text()).toContain("1 progress messages received");
        wrapper.unmount();
    });

    it("registers the panel search and the reused target/browser surfaces", async () => {
        const wrapper = mounted(sshBridge());
        await wrapper.get("[data-test='ssh-open']").trigger("click");
        expect(wrapper.find("[data-test='search-with-regex-builder']").exists()).toBe(true);
        expect(wrapper.find("[data-test='real-target-editor']").exists()).toBe(true);
        expect(wrapper.find("[data-test='local-path-field']").exists()).toBe(true);
        wrapper.unmount();
    });
});

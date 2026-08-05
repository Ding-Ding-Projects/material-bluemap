/**
 * @vitest-environment jsdom
 *
 * The "where does this render run" surface, mounted.
 *
 * Five properties are only true of the rendered component and would be asserted against a
 * stand-in for nothing:
 *
 * 1. A build with no bridges says what is missing instead of offering machines it cannot
 *    reach.
 * 2. Each of Docker's five states puts different words on the screen. Five distinguishable
 *    states in the main process are worth nothing if the interface renders two of them the
 *    same.
 * 3. A **changed** host key renders **no way to accept it**. Not a disabled button, not one
 *    behind a confirmation - nothing pressable anywhere on the surface. This is the
 *    security-critical assertion in the whole feature.
 * 4. An **unknown** host key shows its `SHA256:` fingerprints and accepting one sends that
 *    exact fingerprint and nothing else.
 * 5. The four checks appear in their real order, with the ones a stopped run never reached
 *    drawn as not reached rather than as failures.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RunLocationCard from "./RunLocationCard.vue";
import type {
    DockerStatus,
    DockerSummary,
    HostKeyOffer,
    PreflightReport,
    RemoteBridge,
    RemoteTarget,
    RuntimeBridge,
    RuntimeMode,
} from "./remoteBridge.js";
import type { TargetStorage } from "./remoteTargets.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields, radios and overlays observe their
    // own size. The same stubs every other mounted test in this package installs.
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

    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        onresize: null,
        onscroll: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;
});

/** The real i18n, built as `i18n.ts` builds it: no messages, every key on its fallback. */
const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", messages: {} });
const vuetify = createVuetify();

const target: RemoteTarget = {
    id: "t-1",
    label: "the build server",
    host: "build.lan",
    port: 22,
    user: "renderer",
    identityFile: null,
    workDir: "/srv/renders",
    image: "eclipse-temurin:25-jre",
    docker: "docker",
    keepRemoteFiles: false,
};

const offer: HostKeyOffer = {
    type: "ssh-ed25519",
    base64: "AAAAC3NzaC1lZDI1NTE5AAAAIexample",
    fingerprint: "SHA256:0123456789012345678901234567890123456789012",
    line: "build.lan ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample",
};

function storageWith(targets: readonly RemoteTarget[]): TargetStorage {
    const cells = new Map<string, string>([
        ["material-bluemap-remote-targets", JSON.stringify({ version: 1, targets })],
    ]);
    return {
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => void cells.set(key, value),
    };
}

function dockerSummary(status: DockerStatus): DockerSummary {
    return {
        status,
        available: status === "available",
        clientVersion: status === "not-installed" ? null : "29.6.1",
        serverVersion: status === "available" ? "29.6.1" : null,
        message: "the main process's own sentence",
        detail: null,
    };
}

function runtimeBridge(
    status: DockerStatus,
    renderModes: readonly RuntimeMode[] = ["local"],
): RuntimeBridge {
    return {
        dockerRuntime: async () => dockerSummary(status),
        runtimeModes: async () => ({ preferred: "local", modes: [], dockerImage: "eclipse-temurin:25-jre" }),
        renderModes: async () => renderModes,
        canProbeDocker: true,
    };
}

function remoteBridge(report: PreflightReport, trust = vi.fn(async () => ({ ok: true, message: "recorded." }))): RemoteBridge {
    return {
        validateRemoteTarget: async () => ({ ok: true, target, summary: "renderer@build.lan:22" }),
        describeRemoteTarget: async () => ({
            target: "renderer@build.lan:22",
            sends: ["The world folders of the maps in this render, copied whole."],
            neverSends: ["Any password. This app never asks for one."],
            leavesBehind: "Nothing.",
            authentication: "Your SSH agent.",
        }),
        remotePreflight: async () => report,
        trustRemoteHostKey: trust,
        startRemoteRender: async () => ({ ok: false, renderId: "", failure: { code: "x", message: "", detail: null, exitCode: null } }),
        cancelRemoteRender: async () => false,
        activeRemoteRenders: async () => [],
        canDescribe: true,
        canTrustHostKey: true,
        canCancel: true,
        canSeeActive: true,
    };
}

function report(overrides: Partial<PreflightReport> = {}): PreflightReport {
    return {
        ok: false,
        target: "renderer@build.lan:22",
        checks: [],
        failure: null,
        hostKeys: [],
        docker: null,
        freeBytes: null,
        workDir: null,
        ...overrides,
    };
}

function mountCard(props: Record<string, unknown> = {}) {
    return mount(RunLocationCard, {
        props: { remoteBridge: null, runtimeBridge: null, storage: null, ...props },
        global: { plugins: [i18n, vuetify] },
    });
}

describe("a build that can do none of this", () => {
    it("says what is missing rather than offering a machine it cannot reach", async () => {
        const wrapper = mountCard();
        await flushPromises();

        expect(wrapper.text()).toContain("This build cannot hand a render to another machine");
        expect(wrapper.text()).toContain("This build cannot check whether Docker is here");
        // No form to fill in, because there is nothing to save it to.
        expect(wrapper.find(".mb-remote-targets").exists()).toBe(false);
    });

    it("still names all four places, because the question is worth answering either way", async () => {
        const wrapper = mountCard();
        await flushPromises();

        expect(wrapper.find('[data-place="local"]').exists()).toBe(true);
        expect(wrapper.find('[data-place="docker"]').exists()).toBe(true);
        expect(wrapper.find('[data-place="remote"]').exists()).toBe(true);
        expect(wrapper.text()).toContain("On GitHub");
    });
});

describe("Docker's five states on screen", () => {
    const states: readonly DockerStatus[] = [
        "available",
        "daemon-unreachable",
        "not-installed",
        "refused",
        "unusable",
    ];

    it("renders a different note for each one", async () => {
        const said: string[] = [];
        for (const status of states) {
            const wrapper = mountCard({ runtimeBridge: runtimeBridge(status) });
            await flushPromises();
            const note = wrapper.find(`.mb-remote-docker[data-docker-status="${status}"]`);
            expect(note.exists(), `no note rendered for ${status}`).toBe(true);
            said.push(note.text());
            wrapper.unmount();
        }

        expect(new Set(said).size, "two Docker states rendered the same words").toBe(states.length);
    });

    it("tells a stopped daemon from a missing installation, which have opposite fixes", async () => {
        const stopped = mountCard({ runtimeBridge: runtimeBridge("daemon-unreachable") });
        await flushPromises();
        const missing = mountCard({ runtimeBridge: runtimeBridge("not-installed") });
        await flushPromises();

        expect(stopped.text()).toContain("29.6.1");
        expect(stopped.text()).toMatch(/daemon is not running/i);
        expect(stopped.text()).toMatch(/Start Docker Desktop/i);

        expect(missing.text()).toMatch(/Docker is not installed on this computer/i);
        expect(missing.text()).toMatch(/Install Docker Desktop if you want/i);
    });

    it("does not offer a container choice a build cannot honour, even with Docker running", async () => {
        // The failure this catches: a selectable Docker option that quietly renders
        // locally, leaving somebody certain they used a container when they did not.
        const wrapper = mountCard({ runtimeBridge: runtimeBridge("available") });
        await flushPromises();

        expect(wrapper.find('[data-place="docker"]').attributes("data-state")).toBe("unsupported");
        expect(wrapper.text()).toMatch(/render locally instead/i);
    });

    it("offers it when the build says its render channel honours one", async () => {
        const wrapper = mountCard({ runtimeBridge: runtimeBridge("available", ["local", "docker"]) });
        await flushPromises();

        expect(wrapper.find('[data-place="docker"]').attributes("data-state")).toBe("ready");
    });
});

describe("the preflight, shown in order", () => {
    it("draws the checks a stopped run never reached as not reached", async () => {
        const wrapper = mountCard({
            remoteBridge: remoteBridge(
                report({
                    checks: [{ stage: "ssh", ok: false, message: "build.lan did not answer.", detail: null }],
                    failure: { code: "remote-failed", message: "unreachable", detail: null, exitCode: null, remoteCode: "unreachable" },
                }),
            ),
            storage: storageWith([target]),
        });
        await flushPromises();

        wrapper.vm.selectedId = "t-1";
        await flushPromises();
        await wrapper.vm.check();
        await flushPromises();

        const rows = wrapper.findAll(".mb-remote-preflight__row");
        expect(rows.map((row) => row.attributes("data-stage"))).toEqual([
            "ssh",
            "host-key",
            "docker",
            "disk",
        ]);
        expect(rows.map((row) => row.attributes("data-state"))).toEqual([
            "failed",
            "not-reached",
            "not-reached",
            "not-reached",
        ]);
        // Nobody should be sent to install Docker on a machine that was switched off.
        expect(rows[2]?.text()).toMatch(/Not checked/i);
    });

    it("says all four passed, and that nothing has been uploaded yet", async () => {
        const wrapper = mountCard({
            remoteBridge: remoteBridge(
                report({
                    ok: true,
                    checks: (["ssh", "host-key", "docker", "disk"] as const).map((stage) => ({
                        stage,
                        ok: true,
                        message: `${stage} is fine`,
                        detail: null,
                    })),
                    freeBytes: 64_000_000_000,
                    workDir: "/srv/renders",
                }),
            ),
            storage: storageWith([target]),
        });
        await flushPromises();

        wrapper.vm.selectedId = "t-1";
        await flushPromises();
        await wrapper.vm.check();
        await flushPromises();

        expect(wrapper.text()).toMatch(/All four passed/);
        expect(wrapper.text()).toContain("/srv/renders has 64.0 GB free.");
        expect(wrapper.find('[data-place="remote"]').attributes("data-state")).toBe("ready");
    });
});

describe("the host key", () => {
    it("offers NO way to accept a key that has changed", async () => {
        // The security-critical assertion. A rebuilt server and an intercepted connection
        // are indistinguishable from here, so there is no button - not disabled, not behind
        // a confirmation, not present.
        const wrapper = mountCard({
            remoteBridge: remoteBridge(
                report({
                    checks: [
                        { stage: "host-key", ok: false, message: "offered a different host key", detail: null },
                    ],
                    failure: {
                        code: "remote-failed",
                        message: "host key changed",
                        detail: "recorded: ssh-ed25519 SHA256:old",
                        exitCode: null,
                        remoteCode: "host-key-changed",
                    },
                }),
            ),
            storage: storageWith([target]),
        });
        await flushPromises();

        wrapper.vm.selectedId = "t-1";
        await flushPromises();
        await wrapper.vm.check();
        await flushPromises();

        const refusal = wrapper.find('[data-host-key="changed"]');
        expect(refusal.exists()).toBe(true);
        expect(refusal.text()).toMatch(/has CHANGED/);

        // Nothing on the whole surface offers to trust anything.
        const buttons = wrapper.findAll("button").map((button) => `${button.text()} ${button.attributes("aria-label") ?? ""}`);
        expect(buttons.some((label) => /accept|trust/i.test(label))).toBe(false);
        // And no fingerprint is put on screen, because a fingerprint on screen acquires a
        // button beside it sooner or later.
        expect(wrapper.find(".mb-remote-preflight__fingerprint").exists()).toBe(false);
    });

    it("puts an unknown key in front of the person, with its fingerprint", async () => {
        const wrapper = mountCard({
            remoteBridge: remoteBridge(
                report({
                    checks: [{ stage: "host-key", ok: false, message: "never seen", detail: null }],
                    failure: {
                        code: "remote-failed",
                        message: "host key unknown",
                        detail: null,
                        exitCode: null,
                        remoteCode: "host-key-unknown",
                    },
                    hostKeys: [offer],
                }),
            ),
            storage: storageWith([target]),
        });
        await flushPromises();

        wrapper.vm.selectedId = "t-1";
        await flushPromises();
        await wrapper.vm.check();
        await flushPromises();

        const decision = wrapper.find('[data-host-key="unknown"]');
        expect(decision.exists()).toBe(true);
        expect(decision.text()).toContain(offer.fingerprint);
        expect(decision.text()).toContain("ssh-ed25519");
        expect(decision.text()).toMatch(/ssh-keygen -lf/);
    });

    it("sends the exact fingerprint that was accepted, and nothing else", async () => {
        const trust = vi.fn(async () => ({ ok: true, message: "ssh-ed25519 key recorded." }));
        const wrapper = mountCard({
            remoteBridge: remoteBridge(
                report({
                    checks: [{ stage: "host-key", ok: false, message: "never seen", detail: null }],
                    failure: {
                        code: "remote-failed",
                        message: "host key unknown",
                        detail: null,
                        exitCode: null,
                        remoteCode: "host-key-unknown",
                    },
                    hostKeys: [offer],
                }),
                trust,
            ),
            storage: storageWith([target]),
        });
        await flushPromises();

        wrapper.vm.selectedId = "t-1";
        await flushPromises();
        await wrapper.vm.check();
        await flushPromises();

        await wrapper.vm.trust(offer.fingerprint);
        await flushPromises();

        expect(trust).toHaveBeenCalledWith(target, offer.fingerprint);
        // The key blob itself never crosses: the main process re-scans and records only a
        // key it has just been offered whose fingerprint matches.
        expect(JSON.stringify(trust.mock.calls)).not.toContain(offer.base64);
    });
});

describe("choosing a machine", () => {
    it("throws away the last machine's checks the moment another is chosen", async () => {
        // The single most dangerous piece of state on this screen: a passed preflight
        // carried across a selection change would let a render start against a host nobody
        // had looked at.
        const second: RemoteTarget = { ...target, id: "t-2", host: "other.lan", label: "the other one" };
        const wrapper = mountCard({
            remoteBridge: remoteBridge(report({ ok: true, checks: [] })),
            storage: storageWith([target, second]),
        });
        await flushPromises();

        wrapper.vm.selectedId = "t-1";
        await flushPromises();
        await wrapper.vm.check();
        await flushPromises();
        expect(wrapper.vm.report?.ok).toBe(true);

        wrapper.vm.selectedId = "t-2";
        await flushPromises();

        expect(wrapper.vm.report).toBeNull();
        expect(wrapper.find('[data-place="remote"]').attributes("data-state")).toBe("needs-setup");
    });

    it("tells the shell which machine a render would use", async () => {
        const wrapper = mountCard({
            remoteBridge: remoteBridge(report()),
            storage: storageWith([target]),
        });
        await flushPromises();

        wrapper.vm.selectedId = "t-1";
        await flushPromises();

        const emitted = wrapper.emitted("update:target");
        expect(emitted).toBeTruthy();
        expect(emitted?.at(-1)?.[0]).toMatchObject({ id: "t-1", host: "build.lan" });
    });
});

describe("the fourth place", () => {
    it("asks the shell to open it rather than pretending to be it", async () => {
        const wrapper = mountCard({ canOpenCi: true });
        await flushPromises();

        const button = wrapper
            .findAll("button")
            .find((candidate) => candidate.text().includes("GitHub runners"));
        expect(button).toBeTruthy();
        await button?.trigger("click");

        expect(wrapper.emitted("openCi")).toBeTruthy();
    });

    it("says out loud that a world past the asset ceiling is refused before anything is packed", async () => {
        const wrapper = mountCard();
        await flushPromises();

        expect(wrapper.text()).toMatch(/refuses before packing/i);
    });
});

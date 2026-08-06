// @vitest-environment jsdom

/**
 * The gh command-line tool's own accounts, mounted.
 *
 * A separate suite from `GitHubAccountsList.test.ts` next door, for the same reason the two
 * components are separate: this proves the gh-specific facts (host, machine-wide switch
 * warning, missing-scope command, the three honest empty states) that a shared suite would
 * blur into the app's own account list.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VApp } from "vuetify/components";
import GhCliAccountsList from "./GhCliAccountsList.vue";
import { createGhCliAccountsStore, type GhCliAccountsStoreState } from "./ghCliAccountsStore.js";
import type { GhCliAccountReadout, GhCliAccountsStatusReadout, GhCliBridge, GhCliSwitchReadout } from "./ghCliBridge.js";

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

const vuetify = createVuetify({ components, directives });

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

function account(overrides: Partial<GhCliAccountReadout> = {}): GhCliAccountReadout {
    return {
        login: "octocat",
        host: "github.com",
        active: false,
        scopes: ["repo", "workflow"],
        scopesReported: true,
        tokenSource: "keyring",
        gitProtocol: "https",
        healthy: true,
        stateDetail: null,
        missingAppScopes: [],
        ...overrides,
    };
}

let wrapper: VueWrapper | null = null;

function mountList(state: GhCliAccountsStoreState): { wrapper: VueWrapper; emitted: Record<string, unknown[][]> } {
    const Host = defineComponent({
        setup() {
            return () => h(VApp, null, { default: () => [h(GhCliAccountsList, { list: state })] });
        },
    });
    wrapper = mount(Host, {
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper;
    const inner = wrapper.findComponent(GhCliAccountsList);
    return { wrapper, emitted: inner.emitted() as Record<string, unknown[][]> };
}

async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

/** A scripted `gh` CLI bridge, mirroring what `main/ghcli/ipc.ts` would actually answer. */
function scriptedGhCli(
    status: GhCliAccountsStatusReadout,
    onSwitch?: (host: string, login: string) => GhCliSwitchReadout,
): { bridge: GhCliBridge; calls: string[] } {
    const calls: string[] = [];
    const bridge: GhCliBridge = {
        ghCliListAccounts: (): Promise<GhCliAccountsStatusReadout> => {
            calls.push("list");
            return Promise.resolve(status);
        },
        ghCliSwitchAccount: (host, login): Promise<GhCliSwitchReadout> => {
            calls.push(`switch:${host}:${login}`);
            const result = onSwitch?.(host, login) ?? {
                ok: true,
                account: { ...account({ host, login, active: true }) },
                message: `${login} is now gh's active account on ${host}. This is machine-wide: every terminal, script and other tool on this computer that shells out to gh will use this account from now on, not only this application.`,
            };
            return Promise.resolve(result);
        },
    };
    return { bridge, calls };
}

async function readyList(state: GhCliAccountsStoreState): Promise<ReturnType<typeof mountList>> {
    const mounted = mountList(state);
    await state.load();
    await settle();
    return mounted;
}

describe("rendering real accounts", () => {
    it("shows every account's host, active chip and permissions", async () => {
        const { bridge } = scriptedGhCli({
            availability: "ready",
            version: "gh version 2.96.0",
            accounts: [
                account({ login: "DingDingChae", host: "github.com", active: true }),
                account({ login: "cafepromenade", host: "github.com", active: false, scopes: ["gist"] }),
            ],
            source: "json",
            message: "gh has 2 accounts signed in on this computer.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        const text = root.text();
        expect(text).toContain("DingDingChae");
        expect(text).toContain("cafepromenade");
        expect(text).toContain("github.com");
        expect(root.findAll('[role="option"]')).toHaveLength(2);
        expect(root.find('[aria-selected="true"]').exists()).toBe(true);
    });

    it("shows the machine-wide switch warning whenever any account is listed", async () => {
        const { bridge } = scriptedGhCli({
            availability: "ready",
            version: "gh version 2.96.0",
            accounts: [account({ active: true })],
            source: "json",
            message: "gh has 1 account signed in on this computer.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        expect(root.text()).toContain("whole computer");
    });

    it("shows a missing-scope warning with the exact refresh command", async () => {
        const { bridge } = scriptedGhCli({
            availability: "ready",
            version: "gh version 2.96.0",
            accounts: [
                account({ login: "narrow", host: "github.com", scopes: ["repo"], missingAppScopes: ["workflow"] }),
            ],
            source: "json",
            message: "gh has 1 account signed in on this computer.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        const text = root.text();
        expect(text).toContain("workflow");
        expect(text).toContain("gh auth refresh --hostname github.com --scopes workflow");
    });

    it("marks an unhealthy account with a warning chip", async () => {
        const { bridge } = scriptedGhCli({
            availability: "ready",
            version: "gh version 2.96.0",
            accounts: [account({ healthy: false, stateDetail: "token invalid" })],
            source: "json",
            message: "gh has 1 account signed in on this computer.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        expect(root.text()).toContain("gh reports a problem with this account");
    });
});

describe("switching, always re-verified", () => {
    it("switches and reports the machine-wide outcome by name", async () => {
        const { bridge } = scriptedGhCli({
            availability: "ready",
            version: "gh version 2.96.0",
            accounts: [
                account({ login: "DingDingChae", active: true }),
                account({ login: "cafepromenade", active: false }),
            ],
            source: "json",
            message: "gh has 2 accounts signed in on this computer.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        const switchButtons = root.findAll("button").filter((btn) => btn.text().includes("Switch"));
        expect(switchButtons.length).toBeGreaterThan(0);
        await switchButtons[0]!.trigger("click");
        await settle();

        expect(root.text()).toContain("machine-wide");
    });

    it("reports a switch that did not take as a failure, never as a silent success", async () => {
        const { bridge } = scriptedGhCli(
            {
                availability: "ready",
                version: "gh version 2.96.0",
                accounts: [account({ login: "DingDingChae", active: true }), account({ login: "cafepromenade" })],
                source: "json",
                message: "gh has 2 accounts signed in on this computer.",
            },
            () => ({
                ok: false,
                account: null,
                message: "Switching gh's active account to cafepromenade on github.com did not take.",
            }),
        );
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        const switchButtons = root.findAll("button").filter((btn) => btn.text().includes("Switch"));
        await switchButtons[0]!.trigger("click");
        await settle();

        expect(root.text()).toContain("did not take");
    });
});

describe("the three honest empty/unavailable states", () => {
    it("says plainly when gh is not installed, and offers the dependency installer", async () => {
        const { bridge } = scriptedGhCli({
            availability: "not-installed",
            version: null,
            accounts: [],
            source: null,
            message:
                "The GitHub command-line tool (gh) is not on this computer's PATH, so its own accounts cannot be listed. This application's own sign-in above is unaffected either way - install gh from cli.github.com if you also want to use it from a terminal.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        expect(root.text()).toContain("not on this computer's PATH");
        expect(root.text()).toContain("sign-in above is unaffected");

        const openDeps = root.findAll("button").find((btn) => btn.text().includes("System dependencies"));
        expect(openDeps).toBeDefined();
        await openDeps!.trigger("click");
        await settle();
        const emittedAfter = root.findComponent(GhCliAccountsList).emitted() as Record<string, unknown[][]>;
        expect(emittedAfter["open-dependencies"]).toHaveLength(1);
    });

    it("says plainly when gh is installed but signed in as nobody, and shows the add-account command", async () => {
        const { bridge } = scriptedGhCli({
            availability: "no-accounts",
            version: "gh version 2.96.0",
            accounts: [],
            source: "json",
            message: "gh is installed but nobody is signed in to it. Run `gh auth login` in a terminal.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        expect(root.text()).toContain("nobody is signed in to it");
        expect(root.text()).toContain("gh auth login");
    });

    it("says plainly when gh answered something this build does not recognise", async () => {
        const { bridge } = scriptedGhCli({
            availability: "unrecognised",
            version: "gh version 2.96.0",
            accounts: [],
            source: null,
            message: "gh answered \"gh auth status\" in a format this application does not recognise.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        expect(root.text()).toContain("does not recognise");
    });

    it("distinguishes a search with no matches from having no accounts at all", async () => {
        const { bridge } = scriptedGhCli({
            availability: "ready",
            version: "gh version 2.96.0",
            accounts: [
                account({ login: "alpha" }),
                account({ login: "bravo" }),
                account({ login: "charlie" }),
                account({ login: "delta" }),
            ],
            source: "json",
            message: "gh has 4 accounts signed in on this computer.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        const field = root.find('input[type="text"], input:not([type])');
        await field.setValue("no-such-login-anywhere");
        await settle();

        expect(root.text()).toContain("Nothing here matches that search");
    });
});

describe("this component never shows what the app's own account list would", () => {
    it("carries the two-stores explainer, distinguishing itself from the app's own accounts", async () => {
        const { bridge } = scriptedGhCli({
            availability: "ready",
            version: "gh version 2.96.0",
            accounts: [account({ active: true })],
            source: "json",
            message: "gh has 1 account signed in on this computer.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        expect(root.text()).toContain("separate sign-in");
        expect(root.text()).toContain("not managed by this application");
    });

    it("never renders anything that looks like a token", async () => {
        const { bridge } = scriptedGhCli({
            availability: "ready",
            version: "gh version 2.96.0",
            accounts: [account({ active: true })],
            source: "json",
            message: "gh has 1 account signed in on this computer.",
        });
        const state = createGhCliAccountsStore({ bridge });
        const { wrapper: root } = await readyList(state);

        expect(root.text().toLowerCase()).not.toMatch(/\bghp_|ghu_|ghs_|gho_/);
    });
});

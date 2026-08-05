// @vitest-environment jsdom

/**
 * The multi-account listbox, mounted.
 *
 * `githubAccountsStore.test.ts` next door proves the collection's own logic against a
 * scripted bridge; this file asserts the part a green logic test cannot vouch for - that
 * every row really is on screen with the right facts and exactly one active marker, that
 * the search really filters what is rendered in both plain and regex mode, that the arrow
 * keys really move a single roving tab stop, and that per-account sign-out really stands
 * behind an inline confirmation before it runs.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VApp } from "vuetify/components";
import GitHubAccountsList from "./GitHubAccountsList.vue";
import { createGitHubAccountsList, type GitHubAccountsListState } from "./githubAccountsStore.js";
import type {
    GitHubAccountReadout,
    GitHubAccountsListReadout,
    GitHubAuthEventReadout,
    GitHubBridge,
    GitHubRefreshAccountReadout,
    GitHubRemoveAccountReadout,
    GitHubSetActiveAccountReadout,
} from "./githubBridge.js";

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

function account(overrides: Partial<GitHubAccountReadout> = {}): GitHubAccountReadout {
    return {
        login: "octocat",
        userId: 583231,
        name: null,
        scopes: ["repo", "read:org"],
        scopesReported: true,
        source: "oauth-app",
        signedInAt: "2026-08-03T09:14:00.000Z",
        expiresAt: null,
        refreshable: false,
        persisted: true,
        warnings: [],
        ...overrides,
    };
}

let wrapper: VueWrapper | null = null;

function mountList(
    state: GitHubAccountsListState,
    props: { canAdd?: boolean; adding?: boolean } = {},
): { wrapper: VueWrapper; emitted: Record<string, unknown[][]> } {
    const Host = defineComponent({
        setup() {
            return () =>
                h(VApp, null, {
                    default: () => [
                        h(GitHubAccountsList, {
                            list: state,
                            canAdd: props.canAdd ?? true,
                            adding: props.adding ?? false,
                        }),
                    ],
                });
        },
    });
    wrapper = mount(Host, {
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper;
    const inner = wrapper.findComponent(GitHubAccountsList);
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

/** A preload whose account table is mutable, mirroring `githubAccountsStore.test.ts`'s own fake. */
function scriptedAccounts(
    initial: { readonly id: string; readonly account: GitHubAccountReadout }[],
    initialActive: string | null,
    options: { readonly revoked?: boolean } = {},
): { bridge: GitHubBridge; calls: string[] } {
    const revoked = options.revoked ?? true;
    const table = new Map(initial.map((entry) => [entry.id, entry.account]));
    let activeId = initialActive;
    const listeners: ((event: GitHubAuthEventReadout) => void)[] = [];
    const calls: string[] = [];
    const emit = (event: GitHubAuthEventReadout): void => {
        for (const listener of [...listeners]) listener(event);
    };

    const bridge: GitHubBridge = {
        githubListAccounts: (): Promise<GitHubAccountsListReadout> => {
            calls.push("list");
            return Promise.resolve({
                accounts: [...table].map(([id, acc]) => ({ ...acc, id, active: id === activeId })),
                activeId,
            });
        },
        githubSetActiveAccount: (id): Promise<GitHubSetActiveAccountReadout> => {
            calls.push(`setActive:${id}`);
            if (!table.has(id)) {
                return Promise.resolve({ ok: false, activeId, account: null, reason: "No stored account has that id." });
            }
            activeId = id;
            const found = table.get(id) ?? null;
            if (found !== null) emit({ type: "signed-in", account: found });
            return Promise.resolve({ ok: true, activeId, account: found, reason: null });
        },
        githubRemoveAccount: (id): Promise<GitHubRemoveAccountReadout> => {
            calls.push(`remove:${id}`);
            const wasActive = activeId === id;
            table.delete(id);
            let fallbackAccount: GitHubAccountReadout | null = null;
            if (wasActive) {
                const next = [...table.keys()][0] ?? null;
                activeId = next;
                fallbackAccount = next !== null ? (table.get(next) ?? null) : null;
                if (fallbackAccount !== null) emit({ type: "signed-in", account: fallbackAccount });
                else emit({ type: "signed-out" });
            }
            return Promise.resolve({
                removed: true,
                wasActive,
                newActiveId: activeId,
                revoked,
                reason: null,
                manageUrl: null,
                fallbackAccount,
            });
        },
        githubRefreshAccount: (id): Promise<GitHubRefreshAccountReadout> => {
            calls.push(`refresh:${id}`);
            const found = table.get(id) ?? null;
            return Promise.resolve({ ok: found !== null, account: found, failure: null });
        },
        onGitHubAuthEvent: (listener) => {
            listeners.push(listener);
            return () => {
                const index = listeners.indexOf(listener);
                if (index >= 0) listeners.splice(index, 1);
            };
        },
    };

    return { bridge, calls };
}

/* -------------------------------------------------------------------------- */

describe("rendering the list", () => {
    it("shows every account with its facts, and marks exactly one active", async () => {
        const script = scriptedAccounts(
            [
                { id: "u1", account: account({ login: "octocat", name: "The Octocat" }) },
                { id: "u2", account: account({ login: "monalisa", name: null, scopes: [], scopesReported: false, source: "github-app" }) },
            ],
            "u1",
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        const options = document.querySelectorAll('[role="option"]');
        expect(options).toHaveLength(2);

        const text = document.body.textContent ?? "";
        expect(text).toContain("octocat");
        expect(text).toContain("The Octocat");
        expect(text).toContain("monalisa");

        const activeChips = document.querySelectorAll(".mb-accounts__activeChip");
        expect(activeChips).toHaveLength(1);
        expect(activeChips[0]?.closest(".mb-accounts__option")?.textContent).toContain("octocat");
    });

    it("shows the honest empty state, with an obvious way to sign in", async () => {
        const script = scriptedAccounts([], null);
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        const mounted = mountList(state, { canAdd: true });
        await settle();

        expect(document.querySelector('[role="listbox"]')).toBeNull();
        const text = document.body.textContent ?? "";
        expect(text).toContain("No accounts are signed in");

        await wrapper?.find(".mb-accounts__add").trigger("click");
        const emitted = mounted.wrapper.findComponent(GitHubAccountsList).emitted() as Record<
            string,
            unknown[][]
        >;
        expect(emitted["add-account"]).toBeDefined();
    });
});

describe("finding one account among many", () => {
    function five(): { id: string; account: GitHubAccountReadout }[] {
        return [
            { id: "u1", account: account({ login: "octocat" }) },
            { id: "u2", account: account({ login: "monalisa", scopes: [], scopesReported: false }) },
            { id: "u3", account: account({ login: "hubot", scopes: ["workflow"] }) },
            { id: "u4", account: account({ login: "defunkt", scopes: ["repo"] }) },
            { id: "u5", account: account({ login: "mojombo", scopes: ["repo"] }) },
        ];
    }

    it("filters by plain substring, case-insensitively", async () => {
        const script = scriptedAccounts(five(), "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        expect(document.querySelectorAll('[role="option"]')).toHaveLength(5);

        await wrapper?.find(".mb-config-search input").setValue("OCTO");
        await settle();

        const options = document.querySelectorAll('[role="option"]');
        expect(options).toHaveLength(1);
        expect(options[0]?.textContent).toContain("octocat");
    });

    it("filters by regular expression once the mode is switched on", async () => {
        const script = scriptedAccounts(five(), "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        const regexToggle = [...document.querySelectorAll<HTMLButtonElement>(".mb-config-search button")].find(
            (button) => (button.getAttribute("aria-label") ?? "").includes("regular expression"),
        );
        expect(regexToggle).toBeDefined();
        regexToggle?.click();
        await settle();

        // No trailing anchor: the matcher tests against the whole search text of a row
        // (login, source and scopes together), not the login alone.
        await wrapper?.find(".mb-config-search input").setValue("^(defunkt|mojombo)");
        await settle();

        const options = [...document.querySelectorAll('[role="option"]')];
        expect(options).toHaveLength(2);
        const logins = options.map((option) => option.textContent ?? "");
        expect(logins.some((text) => text.includes("defunkt"))).toBe(true);
        expect(logins.some((text) => text.includes("mojombo"))).toBe(true);
        expect(logins.some((text) => text.includes("octocat"))).toBe(false);
    });

    it("says a bad pattern rather than silently showing nothing", async () => {
        const script = scriptedAccounts(five(), "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        const regexToggle = [...document.querySelectorAll<HTMLButtonElement>(".mb-config-search button")].find(
            (button) => (button.getAttribute("aria-label") ?? "").includes("regular expression"),
        );
        regexToggle?.click();
        await settle();

        await wrapper?.find(".mb-config-search input").setValue("(unterminated");
        await settle();

        expect(document.body.textContent).toContain("not valid");
    });
});

describe("switching the active account", () => {
    it("makes an inactive row active from its own button", async () => {
        const script = scriptedAccounts(
            [
                { id: "u1", account: account({ login: "octocat" }) },
                { id: "u2", account: account({ login: "monalisa" }) },
            ],
            "u1",
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        const buttons = [...document.querySelectorAll<HTMLButtonElement>(".mb-accounts__actions button")];
        const makeActive = buttons.find((button) => (button.textContent ?? "").includes("Make active"));
        expect(makeActive).toBeDefined();
        makeActive?.click();
        await settle();

        expect(script.calls).toContain("setActive:u2");
        const activeChips = document.querySelectorAll(".mb-accounts__activeChip");
        expect(activeChips).toHaveLength(1);
        expect(activeChips[0]?.closest(".mb-accounts__option")?.textContent).toContain("monalisa");
    });
});

describe("signing one account out", () => {
    it("puts the two-key gate in front of it, one gate per row, and reports the fallback account by name", async () => {
        // Rows sort by login, so these two logins are chosen to keep that order
        // predictable: "alice" (u1, the one this test signs out) before "zed" (u2, the
        // one it should fall back to).
        const script = scriptedAccounts(
            [
                { id: "u1", account: account({ login: "alice" }) },
                { id: "u2", account: account({ login: "zed" }) },
            ],
            "u1",
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        // Issue #10: each row's sign-out is a real credential revocation against a real
        // account, so it sits behind its own `ConfigSuperConfirm` instance, closed over
        // that row's own account id, rather than one shared "which row is confirming" flag.
        const buttons = [...document.querySelectorAll<HTMLButtonElement>(".mb-accounts__signout")];
        expect(buttons).toHaveLength(2);
        const aliceIndex = buttons.findIndex((button) =>
            (button.closest(".mb-accounts__rowhost")?.textContent ?? "").includes("alice"),
        );
        expect(aliceIndex).toBeGreaterThanOrEqual(0);

        const gates = wrapper?.findAllComponents({ name: "ConfigSuperConfirm" }) ?? [];
        expect(gates).toHaveLength(2);
        const aliceGate = gates[aliceIndex];
        expect(String(aliceGate?.props("action"))).toContain("revoke");

        // Nothing happens until that row's own gate says so.
        expect(script.calls).not.toContain("remove:u1");

        aliceGate?.vm.$emit("confirm");
        await settle();

        expect(script.calls).toContain("remove:u1");
        expect(document.body.textContent).toContain("zed");
    });

    it("says GitHub confirmed the revocation when it did", async () => {
        const script = scriptedAccounts(
            [{ id: "u1", account: account({ login: "octocat" }) }],
            "u1",
            { revoked: true },
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        wrapper?.findComponent({ name: "ConfigSuperConfirm" }).vm.$emit("confirm");
        await settle();

        const reportText = document.querySelector(".mb-accounts__revoked")?.textContent ?? "";
        expect(reportText).toContain("GitHub confirmed the token was revoked");
    });

    it("says GitHub did not confirm the revocation when it did not - never rounding that up to safe", async () => {
        // Regression: the report used to be silent about `revoked` entirely, so an account
        // whose token GitHub never actually revoked was reported exactly the same as one
        // that was. This is the security-critical distinction `GitHubAccountRow.vue`'s
        // single-account flow already makes.
        const script = scriptedAccounts(
            [{ id: "u1", account: account({ login: "octocat" }) }],
            "u1",
            { revoked: false },
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        wrapper?.findComponent({ name: "ConfigSuperConfirm" }).vm.$emit("confirm");
        await settle();

        const reportText = document.querySelector(".mb-accounts__revoked")?.textContent ?? "";
        expect(reportText).toContain("did not confirm");
        expect(reportText).not.toContain("GitHub confirmed the token was revoked");
    });

    it("does not sign anybody out merely by rendering the row or its gate", async () => {
        const script = scriptedAccounts([{ id: "u1", account: account({ login: "octocat" }) }], "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        // Opening the gate's card is not authorizing it - only the gate's own `confirm`
        // is, and that path is exercised by the tests above.
        expect(wrapper?.findComponent({ name: "ConfigSuperConfirm" }).exists()).toBe(true);
        expect(script.calls).not.toContain("remove:u1");
    });
});

describe("keyboard operation", () => {
    it("moves a single roving tab stop with the arrow keys, and activates a row with Enter", async () => {
        // "alice" sorts before "zed", so the rendered order matches insertion order and
        // ArrowDown from the first row lands on the second, unambiguously.
        const script = scriptedAccounts(
            [
                { id: "u1", account: account({ login: "alice" }) },
                { id: "u2", account: account({ login: "zed" }) },
            ],
            "u1",
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        mountList(state);
        await settle();

        const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
        expect(options).toHaveLength(2);
        expect(options[0]?.getAttribute("tabindex")).toBe("0");
        expect(options[1]?.getAttribute("tabindex")).toBe("-1");

        options[0]?.focus();
        options[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        await settle();

        expect(options[0]?.getAttribute("tabindex")).toBe("-1");
        expect(options[1]?.getAttribute("tabindex")).toBe("0");
        expect(document.activeElement).toBe(options[1]);

        options[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await settle();

        expect(script.calls).toContain("setActive:u2");
    });
});

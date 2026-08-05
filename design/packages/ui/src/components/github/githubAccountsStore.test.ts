/**
 * The stored-accounts collection, driven by a scripted bridge.
 *
 * `githubAccount.test.ts` next door proves the single "who is signed in" state machine;
 * this file proves the collection behind it - listing, switching, removing and refreshing
 * one account at a time, and that the list reloads itself on every sign-in/sign-out event
 * regardless of which surface caused it.
 */

import { describe, expect, it } from "vitest";
import { accountSearchText, createGitHubAccountsList } from "./githubAccountsStore.js";
import type {
    GitHubAccountReadout,
    GitHubAccountSummaryReadout,
    GitHubAccountsListReadout,
    GitHubAuthEventReadout,
    GitHubBridge,
    GitHubRefreshAccountReadout,
    GitHubRemoveAccountReadout,
    GitHubSetActiveAccountReadout,
} from "./githubBridge.js";

const OCTOCAT: GitHubAccountReadout = {
    login: "octocat",
    userId: 583231,
    name: "The Octocat",
    scopes: ["repo", "read:org"],
    scopesReported: true,
    source: "oauth-app",
    signedInAt: "2026-08-03T09:14:00.000Z",
    expiresAt: null,
    refreshable: false,
    persisted: true,
    warnings: [],
};

const MONALISA: GitHubAccountReadout = {
    login: "monalisa",
    userId: 918274,
    name: null,
    scopes: [],
    scopesReported: false,
    source: "github-app",
    signedInAt: "2026-08-01T12:00:00.000Z",
    expiresAt: "2026-09-01T12:00:00.000Z",
    refreshable: true,
    persisted: true,
    warnings: [],
};

function summarize(account: GitHubAccountReadout, id: string, active: boolean): GitHubAccountSummaryReadout {
    return { ...account, id, active };
}

/**
 * A preload whose account collection is a mutable in-memory table, so `setActive` and
 * `removeAccount` really do change what a subsequent `listAccounts` reports - exactly the
 * property the composable's own reload-on-event behaviour depends on.
 */
function scriptedAccounts(
    initial: { readonly id: string; readonly account: GitHubAccountReadout }[],
    initialActive: string | null,
): {
    bridge: GitHubBridge;
    emit: (event: GitHubAuthEventReadout) => void;
    calls: string[];
} {
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
                accounts: [...table].map(([id, account]) => summarize(account, id, id === activeId)),
                activeId,
            });
        },
        githubSetActiveAccount: (id): Promise<GitHubSetActiveAccountReadout> => {
            calls.push(`setActive:${id}`);
            if (!table.has(id)) {
                return Promise.resolve({ ok: false, activeId, account: null, reason: "No stored account has that id." });
            }
            activeId = id;
            const account = table.get(id) ?? null;
            if (account !== null) emit({ type: "signed-in", account });
            return Promise.resolve({ ok: true, activeId, account, reason: null });
        },
        githubRemoveAccount: (id): Promise<GitHubRemoveAccountReadout> => {
            calls.push(`remove:${id}`);
            if (!table.has(id)) {
                return Promise.resolve({
                    removed: false,
                    wasActive: false,
                    newActiveId: activeId,
                    revoked: false,
                    reason: null,
                    manageUrl: null,
                    fallbackAccount: null,
                });
            }
            const wasActive = activeId === id;
            table.delete(id);
            let fallbackAccount: GitHubAccountReadout | null = null;
            if (wasActive) {
                const next = [...table.keys()][0] ?? null;
                activeId = next;
                fallbackAccount = next !== null ? (table.get(next) ?? null) : null;
            }
            if (wasActive) {
                if (fallbackAccount !== null) emit({ type: "signed-in", account: fallbackAccount });
                else emit({ type: "signed-out" });
            }
            return Promise.resolve({
                removed: true,
                wasActive,
                newActiveId: activeId,
                revoked: true,
                reason: null,
                manageUrl: null,
                fallbackAccount,
            });
        },
        githubRefreshAccount: (id): Promise<GitHubRefreshAccountReadout> => {
            calls.push(`refresh:${id}`);
            const account = table.get(id);
            if (account === undefined) {
                return Promise.resolve({
                    ok: false,
                    account: null,
                    failure: {
                        code: "no-such-account",
                        message: "No stored account has that id.",
                        missingScopes: [],
                        offerOAuthFallback: false,
                    },
                });
            }
            return Promise.resolve({ ok: true, account, failure: null });
        },
        onGitHubAuthEvent: (listener) => {
            listeners.push(listener);
            return () => {
                const index = listeners.indexOf(listener);
                if (index >= 0) listeners.splice(index, 1);
            };
        },
    };

    return { bridge, emit, calls };
}

/* -------------------------------------------------------------------------- */
/* Capability detection                                                       */
/* -------------------------------------------------------------------------- */

describe("a build with no multi-account bridge", () => {
    it("reports every capability as false and never throws when asked to act", async () => {
        const state = createGitHubAccountsList({ bridge: null });

        expect(state.canList).toBe(false);
        expect(state.canRemove).toBe(false);
        expect(state.canSetActive).toBe(false);
        expect(state.canRefresh).toBe(false);

        await state.load();
        expect(state.accounts.value).toEqual([]);

        expect(await state.setActive("u1")).toBe(false);
        expect(await state.removeAccount("u1")).toBe(false);
        expect(await state.refreshAccount("u1")).toBe(false);

        state.dispose();
    });
});

/* -------------------------------------------------------------------------- */
/* Listing                                                                    */
/* -------------------------------------------------------------------------- */

describe("listing", () => {
    it("reads every stored account and which one is active", async () => {
        const script = scriptedAccounts(
            [
                { id: "u1", account: OCTOCAT },
                { id: "u2", account: MONALISA },
            ],
            "u1",
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();

        expect(state.accounts.value).toHaveLength(2);
        expect(state.activeId.value).toBe("u1");
        expect(state.accounts.value.find((account) => account.id === "u1")?.active).toBe(true);
        expect(state.accounts.value.find((account) => account.id === "u2")?.active).toBe(false);

        state.dispose();
    });

    it("states a list read that threw rather than swallowing it", async () => {
        const bridge: GitHubBridge = {
            githubListAccounts: () => Promise.reject(new Error("Error invoking remote method 'github:listAccounts': Error: disk full")),
        };
        const state = createGitHubAccountsList({ bridge });
        await state.load();

        expect(state.listFailure.value).toBe("disk full");
        state.dispose();
    });
});

/* -------------------------------------------------------------------------- */
/* Switching                                                                  */
/* -------------------------------------------------------------------------- */

describe("switching the active account", () => {
    it("moves the active marker and reloads the list", async () => {
        const script = scriptedAccounts(
            [
                { id: "u1", account: OCTOCAT },
                { id: "u2", account: MONALISA },
            ],
            "u1",
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();

        const ok = await state.setActive("u2");

        expect(ok).toBe(true);
        expect(state.activeId.value).toBe("u2");
        expect(state.accounts.value.find((account) => account.id === "u2")?.active).toBe(true);
        expect(state.accounts.value.find((account) => account.id === "u1")?.active).toBe(false);

        state.dispose();
    });

    it("reports the reason rather than switching when the id is unknown", async () => {
        const script = scriptedAccounts([{ id: "u1", account: OCTOCAT }], "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();

        const ok = await state.setActive("ghost");

        expect(ok).toBe(false);
        expect(state.actionFailure.value).toBe("No stored account has that id.");
        expect(state.activeId.value).toBe("u1");

        state.dispose();
    });
});

/* -------------------------------------------------------------------------- */
/* Removing                                                                   */
/* -------------------------------------------------------------------------- */

describe("removing one account", () => {
    it("falls back to another stored account and names it, when the active one is removed", async () => {
        const script = scriptedAccounts(
            [
                { id: "u1", account: OCTOCAT },
                { id: "u2", account: MONALISA },
            ],
            "u1",
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();

        const ok = await state.removeAccount("u1");

        expect(ok).toBe(true);
        expect(state.removeReport.value?.report.wasActive).toBe(true);
        expect(state.removeReport.value?.report.fallbackAccount?.login).toBe("monalisa");
        expect(state.accounts.value).toHaveLength(1);
        expect(state.activeId.value).toBe("u2");

        state.dispose();
    });

    it("reports genuinely signed out when the removed account was the only one", async () => {
        const script = scriptedAccounts([{ id: "u1", account: OCTOCAT }], "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();

        const ok = await state.removeAccount("u1");

        expect(ok).toBe(true);
        expect(state.removeReport.value?.report.fallbackAccount).toBeNull();
        expect(state.accounts.value).toHaveLength(0);
        expect(state.activeId.value).toBeNull();

        state.dispose();
    });

    it("removes an inactive account without disturbing which one is active", async () => {
        const script = scriptedAccounts(
            [
                { id: "u1", account: OCTOCAT },
                { id: "u2", account: MONALISA },
            ],
            "u1",
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();

        const ok = await state.removeAccount("u2");

        expect(ok).toBe(true);
        expect(state.removeReport.value?.report.wasActive).toBe(false);
        expect(state.activeId.value).toBe("u1");
        expect(state.accounts.value).toHaveLength(1);

        state.dispose();
    });

    it("never lets two removals for different accounts run at once", async () => {
        const script = scriptedAccounts(
            [
                { id: "u1", account: OCTOCAT },
                { id: "u2", account: MONALISA },
            ],
            "u1",
        );
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();

        const first = state.removeAccount("u1");
        const second = state.removeAccount("u2");

        expect(await second).toBe(false);
        expect(await first).toBe(true);

        state.dispose();
    });
});

/* -------------------------------------------------------------------------- */
/* Refreshing                                                                 */
/* -------------------------------------------------------------------------- */

describe("refreshing one account", () => {
    it("re-reads that account's metadata, and never leaks a token in the failure", async () => {
        const script = scriptedAccounts([{ id: "u1", account: OCTOCAT }], "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();

        const ok = await state.refreshAccount("u1");

        expect(ok).toBe(true);
        expect(script.calls).toContain("refresh:u1");

        state.dispose();
    });

    it("states the failure's reason when an account cannot be renewed", async () => {
        const script = scriptedAccounts([{ id: "u1", account: OCTOCAT }], "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();

        const ok = await state.refreshAccount("ghost");

        expect(ok).toBe(false);
        expect(state.actionFailure.value).toBe("No stored account has that id.");

        state.dispose();
    });
});

/* -------------------------------------------------------------------------- */
/* Reloading on events from anywhere                                          */
/* -------------------------------------------------------------------------- */

describe("staying in step with the rest of the app", () => {
    it("reloads the list when a sign-in or sign-out event arrives from elsewhere", async () => {
        const script = scriptedAccounts([{ id: "u1", account: OCTOCAT }], "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        script.calls.length = 0;

        script.emit({ type: "signed-in", account: MONALISA });
        await Promise.resolve();
        await Promise.resolve();

        expect(script.calls).toContain("list");

        state.dispose();
    });

    it("stops listening once disposed", async () => {
        const script = scriptedAccounts([{ id: "u1", account: OCTOCAT }], "u1");
        const state = createGitHubAccountsList({ bridge: script.bridge });
        await state.load();
        state.dispose();
        script.calls.length = 0;

        script.emit({ type: "signed-out" });
        await Promise.resolve();

        expect(script.calls).not.toContain("list");
    });
});

/* -------------------------------------------------------------------------- */
/* Search text                                                                */
/* -------------------------------------------------------------------------- */

describe("accountSearchText", () => {
    it("carries the login, the name, the source and reported scopes", () => {
        const text = accountSearchText(summarize(OCTOCAT, "u1", true));
        expect(text).toContain("octocat");
        expect(text).toContain("The Octocat");
        expect(text).toContain("oauth-app");
        expect(text).toContain("repo");
        expect(text).toContain("read:org");
    });

    it("never claims a scope for a token that reports none", () => {
        const text = accountSearchText(summarize(MONALISA, "u2", false));
        expect(text).toContain("monalisa");
        expect(text).not.toContain("repo");
    });
});

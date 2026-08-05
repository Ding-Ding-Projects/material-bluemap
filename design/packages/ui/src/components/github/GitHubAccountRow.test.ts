// @vitest-environment jsdom

/**
 * The sign-in section, mounted.
 *
 * The state machine next door is unit-tested against a scripted event stream; this file
 * asserts the part a green logic test cannot vouch for — that the code really is on
 * screen when a code event arrives, that a build with no bridge really draws no controls,
 * that the token field really is a password field, and that the sign-out confirmation
 * really stands between the button and the revocation.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import GitHubAccountRow from "./GitHubAccountRow.vue";
import { createGitHubAccount, type GitHubAccountState } from "./githubAccount.js";
import type {
    GitHubAccountReadout,
    GitHubAuthEventReadout,
    GitHubBridge,
    GitHubSignInOutcome,
    GitHubStatusReadout,
} from "./githubBridge.js";

beforeAll(() => {
    // jsdom has no layout engine, so neither of these exists. Vuetify's application
    // wrapper observes its own size and reads media queries; without them the mount
    // throws before a single assertion runs.
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
});

const ACCOUNT: GitHubAccountReadout = {
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

const SIGNED_OUT: GitHubStatusReadout = {
    signedIn: false,
    account: null,
    clientConfigured: true,
    clientKind: "oauth",
    encryptionAvailable: true,
    requiredScopes: ["repo", "read:org"],
    signingIn: false,
};

const vuetify = createVuetify();

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

let wrapper: VueWrapper | null = null;

function mountRow(state: GitHubAccountState): VueWrapper {
    const Host = defineComponent({
        setup() {
            return () => h(VApp, null, { default: () => [h(GitHubAccountRow, { account: state })] });
        },
    });
    wrapper = mount(Host, {
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper;
    return wrapper;
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

/** A preload whose sign-in is driven by whatever a test pushes through `emit`. */
function scripted(status: GitHubStatusReadout = SIGNED_OUT): {
    bridge: GitHubBridge;
    emit: (event: GitHubAuthEventReadout) => void;
    calls: string[];
} {
    const listeners: ((event: GitHubAuthEventReadout) => void)[] = [];
    const calls: string[] = [];
    // Mutable, because signing out changes what the status says. A fake that keeps
    // answering "signed in" after a sign-out would let a broken row look correct.
    let current = status;
    const emit = (event: GitHubAuthEventReadout): void => {
        for (const listener of [...listeners]) listener(event);
    };
    return {
        emit,
        calls,
        bridge: {
            githubStatus: () => Promise.resolve(current),
            githubSignIn: async () => {
                calls.push("signIn");
                return await new Promise<GitHubSignInOutcome>(() => {});
            },
            githubCancelSignIn: () => {
                calls.push("cancel");
                emit({ type: "cancelled" });
                return Promise.resolve(true);
            },
            githubSignInWithToken: (token) => {
                calls.push(`token:${token}`);
                return Promise.resolve({ ok: true, account: ACCOUNT });
            },
            githubSignOut: () => {
                calls.push("signOut");
                current = SIGNED_OUT;
                emit({ type: "signed-out" });
                return Promise.resolve({
                    signedOut: true,
                    revoked: false,
                    reason: "This app holds no client secret, so GitHub would not confirm it.",
                    manageUrl: "https://github.com/settings/applications",
                    fallbackAccount: null,
                });
            },
            onGitHubAuthEvent: (listener) => {
                listeners.push(listener);
                return () => {
                    const index = listeners.indexOf(listener);
                    if (index >= 0) listeners.splice(index, 1);
                };
            },
        },
    };
}

describe("a build with no bridge", () => {
    it("says it cannot sign in, and offers nothing that would throw", async () => {
        const state = createGitHubAccount({ bridge: null });
        mountRow(state);
        await settle();

        const text = document.body.textContent ?? "";
        expect(text).toContain("cannot sign in to GitHub");
        // Still says what the feature would have been for, so the section is not a
        // dead end that never explains itself.
        expect(text).toContain("private repositories");

        expect(document.querySelectorAll(".mb-github-flow__start")).toHaveLength(0);
        expect(document.querySelectorAll("input")).toHaveLength(0);
        expect(document.querySelectorAll(".mb-github-status__signout")).toHaveLength(0);
    });
});

describe("the browser sign-in", () => {
    it("shows the code large, with a copy control and the address to open", async () => {
        const script = scripted();
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await settle();

        await wrapper?.find(".mb-github-flow__start").trigger("click");
        await settle();

        script.emit({
            type: "code",
            userCode: "WDJB-MJHT",
            verificationUri: "https://github.com/login/device",
            verificationUriComplete: "https://github.com/login/device?user_code=WDJB-MJHT",
            expiresAt: "2026-08-03T09:29:00.000Z",
            expiresInSeconds: 900,
            intervalSeconds: 5,
            browserOpened: true,
        });
        await settle();

        const code = document.querySelector(".mb-github-flow__code");
        expect(code?.textContent?.trim()).toBe("WDJB-MJHT");
        // Spelled out for a screen reader, because WDJB-MJHT read as a word is not
        // something anybody can type into a verification page.
        expect(code?.getAttribute("aria-label")).toContain("W D J B - M J H T");

        expect(document.querySelector(".mb-github-flow__copy")).not.toBeNull();
        expect(document.querySelector<HTMLAnchorElement>(".mb-github-flow__url")?.href).toBe(
            "https://github.com/login/device",
        );
        expect(document.body.textContent).toContain("15:00");
    });

    it("counts down from the events, and stops when they stop", async () => {
        const script = scripted();
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await settle();

        await wrapper?.find(".mb-github-flow__start").trigger("click");
        script.emit({
            type: "code",
            userCode: "WDJB-MJHT",
            verificationUri: "https://github.com/login/device",
            verificationUriComplete: null,
            expiresAt: "2026-08-03T09:29:00.000Z",
            expiresInSeconds: 900,
            intervalSeconds: 5,
            browserOpened: false,
        });
        await settle();
        expect(document.body.textContent).toContain("15:00");

        script.emit({ type: "waiting", secondsRemaining: 605, intervalSeconds: 5 });
        await settle();
        expect(document.body.textContent).toContain("10:05");

        // The browser could not be opened, so the address is offered to be opened by hand
        // rather than the panel claiming a window that never appeared.
        expect(document.body.textContent).toContain("could not be opened");
    });

    it("offers a fresh code when one expires, and never keeps the dead one on screen", async () => {
        const script = scripted();
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await settle();

        await wrapper?.find(".mb-github-flow__start").trigger("click");
        script.emit({
            type: "code",
            userCode: "WDJB-MJHT",
            verificationUri: "https://github.com/login/device",
            verificationUriComplete: null,
            expiresAt: "2026-08-03T09:29:00.000Z",
            expiresInSeconds: 900,
            intervalSeconds: 5,
            browserOpened: true,
        });
        await settle();

        script.emit({
            type: "failed",
            failure: {
                code: "expired",
                message: "The code ran out of time before it was entered.",
                missingScopes: [],
                offerOAuthFallback: false,
            },
        });
        await settle();

        expect(document.querySelector(".mb-github-flow__code")).toBeNull();
        expect(document.querySelector(".mb-github-flow__expired")?.textContent).toContain(
            "ran out of time",
        );

        const retry = document.querySelector<HTMLElement>(".mb-github-flow__retry");
        expect(retry?.textContent).toContain("new code");
    });

    it("cancels the wait and says nothing was stored", async () => {
        const script = scripted();
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await settle();

        await wrapper?.find(".mb-github-flow__start").trigger("click");
        script.emit({
            type: "code",
            userCode: "WDJB-MJHT",
            verificationUri: "https://github.com/login/device",
            verificationUriComplete: null,
            expiresAt: "2026-08-03T09:29:00.000Z",
            expiresInSeconds: 900,
            intervalSeconds: 5,
            browserOpened: true,
        });
        await settle();

        const buttons = [...document.querySelectorAll<HTMLElement>(".mb-github-flow__actions button")];
        const cancel = buttons.find((button) => (button.textContent ?? "").includes("Cancel"));
        expect(cancel).toBeDefined();
        cancel?.click();
        await settle();

        expect(script.calls).toContain("cancel");
        expect(document.querySelector(".mb-github-flow__cancelled")?.textContent).toContain(
            "Nothing was stored",
        );
        expect(document.querySelector(".mb-github-flow__code")).toBeNull();
    });

    it("shows the failure's own sentence and the fallback the main process offered", async () => {
        const script = scripted();
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await settle();

        await wrapper?.find(".mb-github-flow__start").trigger("click");
        script.emit({
            type: "code",
            userCode: "WDJB-MJHT",
            verificationUri: "https://github.com/login/device",
            verificationUriComplete: null,
            expiresAt: "2026-08-03T09:29:00.000Z",
            expiresInSeconds: 900,
            intervalSeconds: 5,
            browserOpened: true,
        });
        script.emit({
            type: "failed",
            failure: {
                code: "insufficient-scopes",
                message: "That account signed in without the permissions this app needs.",
                missingScopes: ["repo"],
                offerOAuthFallback: true,
            },
        });
        await settle();

        expect(document.querySelector(".mb-github-flow__failed")?.textContent).toContain(
            "without the permissions this app needs",
        );
        expect(document.body.textContent).toContain("repo");
        expect(document.querySelector(".mb-github-flow__oauth")).not.toBeNull();
    });

    it("has no start button on a build with no application configured", async () => {
        const script = scripted({ ...SIGNED_OUT, clientConfigured: false, clientKind: null });
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await state.load();
        await settle();

        expect(document.querySelector(".mb-github-flow__start")).toBeNull();
        expect(document.body.textContent).toContain("no GitHub application configured");
        // The other route is still there, which is the whole reason this state is not fatal.
        expect(document.querySelector(".mb-github-token__field")).not.toBeNull();
    });
});

describe("the pasted token", () => {
    it("is a password field that does not echo, and hands the value straight over", async () => {
        const script = scripted();
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await settle();

        const input = document.querySelector<HTMLInputElement>(".mb-github-token__field input");
        expect(input?.type).toBe("password");
        expect(input?.autocomplete).toBe("off");

        await wrapper?.find(".mb-github-token__field input").setValue("ghp_pasted");
        await settle();

        // Submitted through the form rather than the button, which is the route a
        // keyboard takes and the one a disabled button does not guard.
        await wrapper?.find("form.mb-github-token").trigger("submit");
        await settle();

        expect(script.calls).toContain("token:ghp_pasted");
        // Emptied on success, and nowhere on screen either.
        expect(document.body.textContent).not.toContain("ghp_pasted");
    });

    it("will not submit an empty field, by the button or past it", async () => {
        const script = scripted();
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await settle();

        expect(
            document.querySelector<HTMLButtonElement>("button.mb-github-token__submit")?.disabled,
        ).toBe(true);

        // The disabled button is the visible guard; the handler is the real one, because
        // a keyboard submit never touches the button at all.
        await wrapper?.find("form.mb-github-token").trigger("submit");
        await settle();

        expect(script.calls.some((call) => call.startsWith("token:"))).toBe(false);
    });

    it("reveals the token only when asked, through a control the keyboard can reach", async () => {
        const script = scripted();
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await settle();

        const reveal = document.querySelector<HTMLButtonElement>("button.mb-github-token__reveal");
        expect(reveal).not.toBeNull();
        expect(reveal?.getAttribute("aria-pressed")).toBe("false");

        reveal?.click();
        await settle();

        expect(
            document.querySelector<HTMLInputElement>(".mb-github-token__field input")?.type,
        ).toBe("text");
        expect(
            document.querySelector<HTMLButtonElement>("button.mb-github-token__reveal")
                ?.getAttribute("aria-pressed"),
        ).toBe("true");
    });
});

describe("the signed-in account", () => {
    it("names the account and what its token may do", async () => {
        const script = scripted({ ...SIGNED_OUT, signedIn: true, account: ACCOUNT });
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await state.load();
        await settle();

        const text = document.body.textContent ?? "";
        expect(text).toContain("octocat");
        expect(text).toContain("The Octocat");
        expect(text).toContain("repo, read:org");
        expect(text).toContain("Does not expire");
        // Signed in, so neither sign-in route is offered any more.
        expect(document.querySelector(".mb-github-flow__start")).toBeNull();
        expect(document.querySelector(".mb-github-token__field")).toBeNull();
    });

    it("says a token that reports no scopes reports none, rather than showing an empty list", async () => {
        const script = scripted({
            ...SIGNED_OUT,
            signedIn: true,
            account: { ...ACCOUNT, source: "github-app", scopes: [], scopesReported: false },
        });
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await state.load();
        await settle();

        expect(document.body.textContent).toContain("reports no scope list");
    });

    it("warns before the fact when a sign-in could not be stored", async () => {
        const script = scripted({
            ...SIGNED_OUT,
            signedIn: true,
            account: { ...ACCOUNT, persisted: false },
        });
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await state.load();
        await settle();

        expect(document.querySelector(".mb-github-status__unstored")?.textContent).toContain(
            "until the app closes",
        );
    });

    it("asks before signing out, says the token is revoked, and can be backed out of", async () => {
        const script = scripted({ ...SIGNED_OUT, signedIn: true, account: ACCOUNT });
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await state.load();
        await settle();

        await wrapper?.find("button.mb-github-status__signout").trigger("click");
        await settle();

        expect(script.calls).not.toContain("signOut");
        const confirmText = document.querySelector(".mb-github-status__confirm")?.textContent ?? "";
        expect(confirmText).toContain("revoke");
        expect(confirmText).toContain("deletes the stored token from this computer");
        // The decision has the focus, or the next keystroke acts on a button that is gone.
        expect(document.activeElement?.classList.contains("mb-github-status__confirmSignout")).toBe(
            true,
        );

        await wrapper?.find("button.mb-github-status__keep").trigger("click");
        await settle();

        expect(script.calls).not.toContain("signOut");
        expect(document.querySelector(".mb-github-status__confirm")).toBeNull();
        expect(document.querySelector("button.mb-github-status__signout")).not.toBeNull();
    });

    it("signs out when the confirmation is taken, and reports what GitHub did not confirm", async () => {
        const script = scripted({ ...SIGNED_OUT, signedIn: true, account: ACCOUNT });
        const state = createGitHubAccount({ bridge: script.bridge });
        mountRow(state);
        await state.load();
        await settle();

        await wrapper?.find("button.mb-github-status__signout").trigger("click");
        await settle();
        await wrapper?.find("button.mb-github-status__confirmSignout").trigger("click");
        await settle();

        expect(script.calls).toContain("signOut");
        const report = document.querySelector(".mb-github__signOutReport")?.textContent ?? "";
        expect(report).toContain("did not confirm a revocation");
        expect(
            document.querySelector<HTMLAnchorElement>(".mb-github__link")?.href,
        ).toBe("https://github.com/settings/applications");
    });

    it("reports the fallback account instead of a self-contradicting 'signed out' message when another account is stored", async () => {
        // The legacy single-account channel now falls back to another stored account
        // rather than always leaving nobody signed in (see `accounts.ts#signOut`), so
        // this fake mirrors the main process exactly: it emits the fallback account's own
        // `signed-in` event before its `githubSignOut()` call resolves.
        const FALLBACK_ACCOUNT: GitHubAccountReadout = {
            ...ACCOUNT,
            login: "monalisa",
            name: "Mona Lisa",
        };
        const listeners: ((event: GitHubAuthEventReadout) => void)[] = [];
        let current: GitHubStatusReadout = { ...SIGNED_OUT, signedIn: true, account: ACCOUNT };
        const emit = (event: GitHubAuthEventReadout): void => {
            for (const listener of [...listeners]) listener(event);
        };
        const bridge: GitHubBridge = {
            githubStatus: () => Promise.resolve(current),
            // `state.supported` requires at least one sign-in route; unused by this test
            // otherwise, so it never resolves.
            githubSignInWithToken: () => new Promise(() => {}),
            githubSignOut: () => {
                current = { ...SIGNED_OUT, signedIn: true, account: FALLBACK_ACCOUNT };
                emit({ type: "signed-in", account: FALLBACK_ACCOUNT });
                return Promise.resolve({
                    signedOut: true,
                    revoked: true,
                    reason: null,
                    manageUrl: null,
                    fallbackAccount: FALLBACK_ACCOUNT,
                });
            },
            onGitHubAuthEvent: (listener) => {
                listeners.push(listener);
                return () => {
                    const index = listeners.indexOf(listener);
                    if (index >= 0) listeners.splice(index, 1);
                };
            },
        };
        const state = createGitHubAccount({ bridge });
        mountRow(state);
        await state.load();
        await settle();

        await wrapper?.find("button.mb-github-status__signout").trigger("click");
        await settle();
        await wrapper?.find("button.mb-github-status__confirmSignout").trigger("click");
        await settle();

        // Still signed in - as the fallback account - so the "Signed in" card is drawn.
        expect(state.signedIn.value).toBe(true);
        expect(document.querySelector(".mb-github-status")).not.toBeNull();
        expect(document.body.textContent).toContain("monalisa");

        // The report beside it says exactly that, rather than "Signed out" beside a card
        // that is simultaneously saying somebody is signed in.
        const report = document.querySelector(".mb-github__signOutReport")?.textContent ?? "";
        expect(report).toContain("monalisa");
        expect(report).toContain("now the active account");
        expect(report).not.toContain("Signed out");
        expect(report).not.toContain("works nowhere any more");
    });
});

describe('closing "Add account" mid-flight', () => {
    afterEach(() => {
        delete (globalThis as { materialBluemap?: GitHubBridge }).materialBluemap;
    });

    it("cancels the in-flight device sign-in instead of only hiding its Cancel button", async () => {
        // `GitHubAccountRow` resolves its own accounts-list bridge from the global preload
        // rather than from the `account` prop, so the multi-account surface only mounts
        // when that global is set - every other test in this file leaves it unset on
        // purpose to exercise the single-account fallback.
        const script = scripted({ ...SIGNED_OUT, signedIn: true, account: ACCOUNT });
        const bridge: GitHubBridge = {
            ...script.bridge,
            githubListAccounts: () =>
                Promise.resolve({
                    accounts: [{ ...ACCOUNT, id: "u1", active: true }],
                    activeId: "u1",
                }),
        };
        (globalThis as { materialBluemap?: GitHubBridge }).materialBluemap = bridge;

        const state = createGitHubAccount({ bridge });
        mountRow(state);
        await state.load();
        await settle();

        const addButton = document.querySelector<HTMLElement>(".mb-accounts__add");
        expect(addButton?.textContent).toContain("Add account");
        addButton?.click();
        await settle();

        await wrapper?.find(".mb-github-flow__start").trigger("click");
        await settle();

        script.emit({
            type: "code",
            userCode: "WDJB-MJHT",
            verificationUri: "https://github.com/login/device",
            verificationUriComplete: null,
            expiresAt: "2026-08-03T09:29:00.000Z",
            expiresInSeconds: 900,
            intervalSeconds: 5,
            browserOpened: true,
        });
        await settle();

        expect(state.phase.value).toBe("waiting");
        expect(document.querySelector(".mb-github-flow__code")).not.toBeNull();

        // "Close" is the only control this surface offers at this point - the device
        // flow's own Cancel button is inside the panel this click is about to hide.
        const closeButton = document.querySelector<HTMLElement>(".mb-accounts__add");
        expect(closeButton?.textContent).toContain("Close");
        closeButton?.click();
        await settle();

        expect(script.calls).toContain("cancel");
        expect(state.phase.value).toBe("idle");
        expect(document.querySelector(".mb-github-flow__code")).toBeNull();
    });
});

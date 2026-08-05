/**
 * The sign-in state machine, driven by a scripted event stream.
 *
 * Everything the browser sign-in shows arrives on `onGitHubAuthEvent`, so a fake that
 * hands the controller a list of events is not a stand-in for the real thing — it is the
 * real interface, with the main process replaced by a script. That is what makes it
 * possible to assert the parts nobody can reach by clicking: a code that expires, an
 * approval that never comes, a `failed` event belonging to the *other* sign-in route.
 */

import { describe, expect, it } from "vitest";
import {
    classifyAuthFailure,
    createGitHubAccount,
    formatCountdown,
    formatTimestamp,
    githubSearchValues,
    spellOutCode,
} from "./githubAccount.js";
import type {
    GitHubAccountReadout,
    GitHubAuthEventReadout,
    GitHubBridge,
    GitHubSignInOutcome,
    GitHubStatusReadout,
} from "./githubBridge.js";

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

const CODE_EVENT: GitHubAuthEventReadout = {
    type: "code",
    userCode: "WDJB-MJHT",
    verificationUri: "https://github.com/login/device",
    verificationUriComplete: "https://github.com/login/device?user_code=WDJB-MJHT",
    expiresAt: "2026-08-03T09:29:00.000Z",
    expiresInSeconds: 900,
    intervalSeconds: 5,
    browserOpened: true,
};

/**
 * A preload whose sign-in is a script rather than a network call.
 *
 * `emit` is the main process's own broadcast: whatever a test pushes through it is what
 * the controller sees, in the order it was pushed. `signIn` resolves only when a test says
 * so, because a device flow that resolves immediately is the one shape the real one never
 * takes.
 */
function scriptedBridge(
    options: {
        status?: GitHubStatusReadout;
        onSignIn?: (emit: (event: GitHubAuthEventReadout) => void) => Promise<GitHubSignInOutcome>;
    } = {},
): {
    bridge: GitHubBridge;
    emit: (event: GitHubAuthEventReadout) => void;
    listeners: number;
    calls: string[];
} {
    const listeners: ((event: GitHubAuthEventReadout) => void)[] = [];
    const calls: string[] = [];
    let status = options.status ?? SIGNED_OUT;
    const emit = (event: GitHubAuthEventReadout): void => {
        for (const listener of [...listeners]) listener(event);
    };

    const bridge: GitHubBridge = {
        githubStatus: () => {
            calls.push("status");
            return Promise.resolve(status);
        },
        githubSignIn: async () => {
            calls.push("signIn");
            if (options.onSignIn === undefined) {
                // Never resolves on its own: the events are the story, and a test that
                // wants an outcome from the call itself supplies one.
                return await new Promise<GitHubSignInOutcome>(() => {});
            }
            return await options.onSignIn(emit);
        },
        githubCancelSignIn: () => {
            calls.push("cancel");
            emit({ type: "cancelled" });
            return Promise.resolve(true);
        },
        githubSignOut: () => {
            calls.push("signOut");
            status = SIGNED_OUT;
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
    };

    return {
        bridge,
        emit,
        get listeners() {
            return listeners.length;
        },
        calls,
    };
}

/** Lets every already-resolved promise run, which is all these fakes ever need. */
async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("a build that cannot sign in", () => {
    it("says so rather than offering a control that would throw", async () => {
        const state = createGitHubAccount({ bridge: null });

        expect(state.supported).toBe(false);
        expect(state.canReadStatus).toBe(false);
        expect(state.canDeviceSignIn).toBe(false);
        expect(state.canUseToken).toBe(false);
        expect(state.canSignOut).toBe(false);

        await state.load();
        await state.startDeviceSignIn();

        expect(state.status.value).toBeNull();
        expect(state.account.value).toBeNull();
        expect(state.phase.value).toBe("idle");
        expect(state.statusFailure.value).toBeNull();
        expect(await state.signInWithToken("anything")).toBe(false);
        expect(await state.cancelSignIn()).toBe(false);
    });

    it("refuses the browser route when the events cannot be watched, code or no code", () => {
        // `githubSignIn` with no event stream would start a flow whose user code never
        // reaches the screen: a quarter of an hour of spinner with nothing to type.
        const state = createGitHubAccount({
            bridge: { githubStatus: () => Promise.resolve(SIGNED_OUT), githubSignIn: () => Promise.resolve({ ok: true, account: ACCOUNT }) },
        });

        expect(state.canDeviceSignIn).toBe(false);
        expect(state.supported).toBe(false);
    });

    it("still offers the token route on a build with only that", () => {
        const state = createGitHubAccount({
            bridge: { githubSignInWithToken: () => Promise.resolve({ ok: true, account: ACCOUNT }) },
        });

        expect(state.supported).toBe(true);
        expect(state.canUseToken).toBe(true);
        expect(state.canDeviceSignIn).toBe(false);
    });

    it("reports a status read that threw, with Electron's invoke plumbing stripped", async () => {
        const state = createGitHubAccount({
            bridge: {
                githubStatus: () =>
                    Promise.reject(
                        new Error(
                            "Error invoking remote method 'github:status': Error: no handler registered",
                        ),
                    ),
                githubSignInWithToken: () => Promise.resolve({ ok: true, account: ACCOUNT }),
            },
        });

        await state.load();

        expect(state.statusFailure.value).toBe("no handler registered");
        expect(state.status.value).toBeNull();
    });
});

describe("the browser sign-in, one event at a time", () => {
    it("shows nothing until a code event says what to show", async () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        void state.startDeviceSignIn();
        expect(state.phase.value).toBe("starting");
        expect(state.code.value).toBeNull();
        expect(state.secondsRemaining.value).toBeNull();

        script.emit(CODE_EVENT);

        expect(state.phase.value).toBe("waiting");
        expect(state.code.value?.userCode).toBe("WDJB-MJHT");
        expect(state.code.value?.verificationUri).toBe("https://github.com/login/device");
        expect(state.code.value?.browserOpened).toBe(true);
        expect(state.secondsRemaining.value).toBe(900);
    });

    it("takes the countdown from the events and never runs one of its own", async () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        void state.startDeviceSignIn();
        script.emit(CODE_EVENT);
        script.emit({ type: "waiting", secondsRemaining: 880, intervalSeconds: 5 });
        expect(state.secondsRemaining.value).toBe(880);

        script.emit({ type: "waiting", secondsRemaining: 875, intervalSeconds: 5 });
        expect(state.secondsRemaining.value).toBe(875);

        // No event, no movement. Real time passing is what a clock of its own would react
        // to, and a clock that keeps counting after the main process has stopped talking
        // is one that counts confidently down to a code nobody can still use.
        await flush();
        expect(state.secondsRemaining.value).toBe(875);
    });

    it("ignores a waiting event that arrives with no code on screen", () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        script.emit({ type: "waiting", secondsRemaining: 500, intervalSeconds: 5 });

        expect(state.phase.value).toBe("idle");
        expect(state.secondsRemaining.value).toBeNull();
    });

    it("signs in when the approval event arrives", async () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        void state.startDeviceSignIn();
        script.emit(CODE_EVENT);
        script.emit({ type: "signed-in", account: ACCOUNT });

        expect(state.phase.value).toBe("signed-in");
        expect(state.signedIn.value).toBe(true);
        expect(state.account.value?.login).toBe("octocat");
        expect(state.code.value).toBeNull();
        expect(state.secondsRemaining.value).toBeNull();
        await flush();
    });

    it("offers a fresh code when the old one expires, rather than waiting on", () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        void state.startDeviceSignIn();
        script.emit(CODE_EVENT);
        script.emit({
            type: "failed",
            failure: {
                code: "expired",
                message: "The code ran out of time before it was entered.",
                missingScopes: [],
                offerOAuthFallback: false,
            },
        });

        expect(state.phase.value).toBe("expired");
        expect(state.code.value).toBeNull();
        expect(state.failure.value?.message).toBe("The code ran out of time before it was entered.");
        expect(state.waiting.value).toBe(false);
    });

    it("tells a refusal apart from a failure", () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        void state.startDeviceSignIn();
        script.emit(CODE_EVENT);
        script.emit({
            type: "failed",
            failure: {
                code: "denied",
                message: "Sign-in was refused on the GitHub page.",
                missingScopes: [],
                offerOAuthFallback: false,
            },
        });

        expect(state.phase.value).toBe("denied");
    });

    it("keeps a real failure as a failure, with its own sentence and its fallback offer", () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        void state.startDeviceSignIn();
        script.emit(CODE_EVENT);
        script.emit({
            type: "failed",
            failure: {
                code: "insufficient-scopes",
                message: "That account signed in without the permissions this app needs.",
                missingScopes: ["repo"],
                offerOAuthFallback: true,
            },
        });

        expect(state.phase.value).toBe("failed");
        expect(state.failure.value?.missingScopes).toEqual(["repo"]);
        expect(state.failure.value?.offerOAuthFallback).toBe(true);
    });

    it("does not start a second sign-in while one is waiting", async () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        void state.startDeviceSignIn();
        script.emit(CODE_EVENT);
        await state.startDeviceSignIn();

        expect(script.calls.filter((call) => call === "signIn")).toHaveLength(1);
    });

    it("reports a bridge that broke its own contract as a bridge failure", async () => {
        const state = createGitHubAccount({
            bridge: {
                githubStatus: () => Promise.resolve(SIGNED_OUT),
                githubSignIn: () => Promise.reject(new Error("the window went away")),
                onGitHubAuthEvent: () => () => undefined,
            },
        });

        await state.startDeviceSignIn();

        expect(state.phase.value).toBe("failed");
        expect(state.failure.value?.code).toBe("bridge-failed");
        expect(state.failure.value?.message).toBe("the window went away");
    });

    it("settles from the call itself when no event ever said anything", async () => {
        const script = scriptedBridge({
            onSignIn: () =>
                Promise.resolve({
                    ok: false,
                    failure: {
                        code: "no-client-configured",
                        message: "This build has no GitHub application configured.",
                        missingScopes: [],
                        offerOAuthFallback: false,
                    },
                }),
        });
        const state = createGitHubAccount({ bridge: script.bridge });

        await state.startDeviceSignIn();

        expect(state.phase.value).toBe("failed");
        expect(state.failure.value?.code).toBe("no-client-configured");
    });

    it("clears a finished sign-in back to idle, but never one still in flight", () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        void state.startDeviceSignIn();
        script.emit(CODE_EVENT);
        state.dismissOutcome();
        expect(state.phase.value).toBe("waiting");

        script.emit({ type: "cancelled" });
        state.dismissOutcome();
        expect(state.phase.value).toBe("idle");
        expect(state.failure.value).toBeNull();
    });
});

describe("cancelling", () => {
    it("stops waiting and says nothing was stored", async () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        void state.startDeviceSignIn();
        script.emit(CODE_EVENT);
        expect(state.waiting.value).toBe(true);

        const stopped = await state.cancelSignIn();

        expect(stopped).toBe(true);
        expect(script.calls).toContain("cancel");
        expect(state.phase.value).toBe("cancelled");
        expect(state.code.value).toBeNull();
        expect(state.secondsRemaining.value).toBeNull();
        expect(state.failure.value).toBeNull();
        expect(state.account.value).toBeNull();
    });

    it("re-reads the status when the main process had nothing to cancel", async () => {
        const bridge: GitHubBridge = {
            githubStatus: () => Promise.resolve(SIGNED_OUT),
            githubCancelSignIn: () => Promise.resolve(false),
            githubSignIn: () => new Promise<GitHubSignInOutcome>(() => {}),
            onGitHubAuthEvent: () => () => undefined,
        };
        const state = createGitHubAccount({ bridge });

        expect(await state.cancelSignIn()).toBe(false);
        await flush();
        expect(state.status.value).toEqual(SIGNED_OUT);
    });
});

describe("the pasted-token route", () => {
    it("signs in and keeps nothing of the token", async () => {
        const seen: string[] = [];
        const bridge: GitHubBridge = {
            githubStatus: () =>
                Promise.resolve({ ...SIGNED_OUT, signedIn: true, account: ACCOUNT }),
            githubSignInWithToken: (token) => {
                seen.push(token);
                return Promise.resolve({ ok: true, account: ACCOUNT });
            },
        };
        const state = createGitHubAccount({ bridge });

        expect(await state.signInWithToken("ghp_a_real_looking_token")).toBe(true);

        expect(seen).toEqual(["ghp_a_real_looking_token"]);
        expect(state.account.value?.login).toBe("octocat");
        expect(state.tokenFailure.value).toBeNull();
        expect(state.tokenBusy.value).toBe(false);
        // Nothing the controller holds and nothing it would render repeats the credential:
        // it went across and was not kept.
        expect(state.failure.value).toBeNull();
        expect(state.statusFailure.value).toBeNull();
        expect(state.code.value).toBeNull();
    });

    it("shows the refusal without quoting the token, and keeps it out of the browser panel", async () => {
        const bridge: GitHubBridge = {
            githubStatus: () => Promise.resolve(SIGNED_OUT),
            githubSignInWithToken: () =>
                Promise.resolve({
                    ok: false,
                    failure: {
                        code: "insufficient-scopes",
                        message: "That token cannot read private repositories.",
                        missingScopes: ["repo"],
                        offerOAuthFallback: false,
                    },
                }),
        };
        const state = createGitHubAccount({ bridge });

        expect(await state.signInWithToken("ghp_wrong")).toBe(false);

        expect(state.tokenFailure.value?.message).toBe("That token cannot read private repositories.");
        expect(state.tokenFailure.value?.missingScopes).toEqual(["repo"]);
        expect(state.tokenFailure.value?.message).not.toContain("ghp_wrong");
        // The browser panel never did anything, and must not be painted red about it.
        expect(state.phase.value).toBe("idle");
        expect(state.failure.value).toBeNull();
    });

    it("leaves the browser panel alone when the main process broadcasts a token refusal", () => {
        // Both routes end in the same place in the main process, so a refused token is
        // broadcast as a `failed` event too. With no browser sign-in in flight it belongs
        // to nothing on this panel.
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        script.emit({
            type: "failed",
            failure: {
                code: "invalid-token",
                message: "GitHub does not recognise that token.",
                missingScopes: [],
                offerOAuthFallback: false,
            },
        });

        expect(state.phase.value).toBe("idle");
        expect(state.failure.value).toBeNull();
    });

    it("refuses to send the same token twice while one attempt is in flight", async () => {
        let resolve: (outcome: GitHubSignInOutcome) => void = () => {};
        const attempts: string[] = [];
        const bridge: GitHubBridge = {
            githubStatus: () => Promise.resolve(SIGNED_OUT),
            githubSignInWithToken: (token) => {
                attempts.push(token);
                return new Promise<GitHubSignInOutcome>((settle) => {
                    resolve = settle;
                });
            },
        };
        const state = createGitHubAccount({ bridge });

        const first = state.signInWithToken("ghp_one");
        expect(state.tokenBusy.value).toBe(true);
        expect(await state.signInWithToken("ghp_one")).toBe(false);
        expect(attempts).toEqual(["ghp_one"]);

        resolve({ ok: true, account: ACCOUNT });
        expect(await first).toBe(true);
    });
});

describe("signing out", () => {
    it("reports honestly that GitHub did not confirm the revocation", async () => {
        const script = scriptedBridge({ status: { ...SIGNED_OUT, signedIn: true, account: ACCOUNT } });
        const state = createGitHubAccount({ bridge: script.bridge });

        await state.load();
        expect(state.signedIn.value).toBe(true);

        await state.signOut();

        expect(state.signOutReport.value?.signedOut).toBe(true);
        expect(state.signOutReport.value?.revoked).toBe(false);
        expect(state.signOutReport.value?.manageUrl).toBe("https://github.com/settings/applications");
        expect(state.signingOut.value).toBe(false);
        expect(state.signedIn.value).toBe(false);
    });

    it("clears the account when the main process broadcasts a sign-out", async () => {
        const script = scriptedBridge({ status: { ...SIGNED_OUT, signedIn: true, account: ACCOUNT } });
        const state = createGitHubAccount({ bridge: script.bridge });

        await state.load();
        script.emit({ type: "signed-out" });

        expect(state.account.value).toBeNull();
        expect(state.signedIn.value).toBe(false);
    });
});

describe("a sign-in that was already running", () => {
    it("is shown as waiting with no code, because its code event has been and gone", async () => {
        const script = scriptedBridge({ status: { ...SIGNED_OUT, signingIn: true } });
        const state = createGitHubAccount({ bridge: script.bridge });

        await state.load();

        expect(state.phase.value).toBe("starting");
        expect(state.adopted.value).toBe(true);
        expect(state.code.value).toBeNull();
    });
});

describe("letting go", () => {
    it("stops listening when the surface goes away", () => {
        const script = scriptedBridge();
        const state = createGitHubAccount({ bridge: script.bridge });

        expect(script.listeners).toBe(1);
        state.dispose();
        expect(script.listeners).toBe(0);

        script.emit({ type: "signed-in", account: ACCOUNT });
        expect(state.account.value).toBeNull();
    });
});

describe("the small pure pieces", () => {
    it("names the three ends that are not failures", () => {
        expect(classifyAuthFailure("expired")).toBe("expired");
        expect(classifyAuthFailure("denied")).toBe("denied");
        expect(classifyAuthFailure("cancelled")).toBe("cancelled");
        expect(classifyAuthFailure("network")).toBe("failed");
        expect(classifyAuthFailure("")).toBe("failed");
    });

    it("formats a countdown, and has nothing to say without one", () => {
        expect(formatCountdown(900)).toBe("15:00");
        expect(formatCountdown(59)).toBe("00:59");
        expect(formatCountdown(0)).toBe("00:00");
        expect(formatCountdown(null)).toBe("");
        expect(formatCountdown(-1)).toBe("");
        expect(formatCountdown(Number.NaN)).toBe("");
    });

    it("spells the code out for a screen reader without changing it", () => {
        expect(spellOutCode("WDJB-MJHT")).toBe("W D J B - M J H T");
    });

    it("shows no timestamp rather than an invalid one", () => {
        expect(formatTimestamp(null, "en")).toBeNull();
        expect(formatTimestamp("not a date", "en")).toBeNull();
        expect(formatTimestamp("2026-08-03T09:14:00.000Z", "en")).not.toBeNull();
    });

    it("lets the settings search find the section by what is on screen", () => {
        const values = githubSearchValues({
            status: { ...SIGNED_OUT, signedIn: true, account: ACCOUNT },
            account: ACCOUNT,
        });

        expect(values).toContain("octocat");
        expect(values).toContain("The Octocat");
        expect(values).toContain("oauth-app");
        expect(values).toContain("repo");
        expect(values.every((value) => value.trim().length > 0)).toBe(true);
    });

    it("does not list scopes for a token that reports none, since that is not the same as having none", () => {
        const values = githubSearchValues({
            status: null,
            account: { ...ACCOUNT, scopes: [], scopesReported: false, source: "github-app" },
        });

        expect(values).toContain("github-app");
        expect(values).not.toContain("repo");
    });

    it("has nothing to search by before anything has been read", () => {
        expect(githubSearchValues({ status: null, account: null })).toEqual([]);
    });
});

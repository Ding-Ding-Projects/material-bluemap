/**
 * Tests for more than one signed-in GitHub account at once.
 *
 * The fakes are the same shape `session.test.ts` and `storage.test.ts` already use - a
 * reversible "encryption" that is obviously not protection, and a `fetch` that dispatches
 * on the URL - because the things worth proving here are the same kind of thing: that a
 * second account does not disturb the first, that removing one account never touches
 * another's file, that a credential store with nothing working in it still leaves a
 * usable in-memory session and writes nothing to disk, and that whatever does land on
 * disk is metadata and never a token.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitHubAccountsController, migrateLegacyAccount } from "./accounts.js";
import type { GitHubAuthEvent } from "./session.js";
import { TokenStore } from "./storage.js";
import type { SafeStorageLike } from "./storage.js";

const OAUTH_BASE = "https://github.test";
const API_BASE = "https://api.github.test";
const APP_CLIENT = { id: "Iv23liPCatYTLpipKJYS", kind: "app" as const };

function fakeSafeStorage(available = true): SafeStorageLike {
    return {
        isEncryptionAvailable: () => available,
        encryptString: (plainText) =>
            Buffer.from(`enc:${Buffer.from(plainText, "utf8").toString("base64")}`, "utf8"),
        decryptString: (encrypted) =>
            Buffer.from(encrypted.toString("utf8").slice(4), "base64").toString("utf8"),
    };
}

/**
 * Succeeds encrypting the first `successfulWrites` times, then throws on every call after
 * that - the same shape `storage.test.ts` uses to simulate a write failure, but here it
 * lets the STAGING write (the first `TokenStore.save()` inside `session.ts#accept`) go
 * through before the FINAL write (`#finalize`'s move into the account's own file) fails.
 */
function fakeSafeStorageFailingAfter(successfulWrites: number): SafeStorageLike {
    let encryptCalls = 0;
    return {
        isEncryptionAvailable: () => true,
        encryptString: (plainText) => {
            encryptCalls += 1;
            if (encryptCalls > successfulWrites) throw new Error("no keyring");
            return Buffer.from(`enc:${Buffer.from(plainText, "utf8").toString("base64")}`, "utf8");
        },
        decryptString: (encrypted) =>
            Buffer.from(encrypted.toString("utf8").slice(4), "base64").toString("utf8"),
    };
}

function json(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200 });
}

type Route = () => Response;

/**
 * A `fetch` whose routing table is swapped out between calls.
 *
 * Only one device-flow sign-in is ever in flight in these tests at a time, so there is no
 * need to disambiguate identities by request body - whichever table `use()` last set is
 * the one in effect, exactly like plugging a different account's phone into the flow.
 */
function switchableFetch(): {
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
    use: (routes: Record<string, Route>) => void;
} {
    let routes: Record<string, Route> = {};
    return {
        use: (next) => {
            routes = next;
        },
        fetch: (url) => {
            const route = routes[url];
            if (route === undefined) throw new Error(`unrouted request to ${url}`);
            return Promise.resolve(route());
        },
    };
}

function deviceFlowRoutes(login: string, id: number, token: string): Record<string, Route> {
    return {
        [`${OAUTH_BASE}/login/device/code`]: () =>
            json({
                device_code: `dc-${login}`,
                user_code: `${login.toUpperCase()}-CODE`,
                verification_uri: "https://github.com/login/device",
                expires_in: 899,
                interval: 5,
            }),
        [`${OAUTH_BASE}/login/oauth/access_token`]: () =>
            json({ access_token: token, expires_in: 28800 }),
        [`${API_BASE}/user`]: () => json({ login, id, name: null }),
    };
}

let directory: string;

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "worldlens-accounts-"));
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

function controllerWith(options: {
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
    safeStorage?: SafeStorageLike;
}): { controller: GitHubAccountsController; events: GitHubAuthEvent[] } {
    const events: GitHubAuthEvent[] = [];
    const controller = new GitHubAccountsController({
        directory,
        safeStorage: options.safeStorage ?? fakeSafeStorage(),
        fetch: options.fetch,
        sleep: () => Promise.resolve(),
        client: () => APP_CLIENT,
        openExternal: () => Promise.resolve(true),
        onEvent: (event) => events.push(event),
        now: () => 1_000_000,
        apiBase: API_BASE,
        oauthBase: OAUTH_BASE,
    });
    return { controller, events };
}

describe("multiple accounts", () => {
    it("adds a second account without disturbing the first, and switches which is active", async () => {
        const { fetch, use } = switchableFetch();
        const { controller, events } = controllerWith({ fetch });

        use(deviceFlowRoutes("octocat", 1, "ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        const first = await controller.startDeviceSignIn();
        expect(first.ok).toBe(true);

        use(deviceFlowRoutes("otherbot", 2, "ghu_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
        const second = await controller.startDeviceSignIn();
        expect(second.ok).toBe(true);

        // The legacy single-account surface resolves to whichever account signed in most
        // recently - the same observable behaviour it always had, extended rather than
        // replaced, and the first account is still there, untouched.
        expect(controller.status().account?.login).toBe("otherbot");
        const list = controller.listAccounts();
        expect(list.accounts.map((account) => account.login).sort()).toEqual(["octocat", "otherbot"]);

        const octocatId = list.accounts.find((account) => account.login === "octocat")?.id;
        expect(octocatId).toBeDefined();
        if (octocatId === undefined) return;

        const switched = controller.setActiveAccount(octocatId);
        expect(switched.ok).toBe(true);
        expect(switched.account?.login).toBe("octocat");

        // Switching active accounts changed what the legacy channel reports, with no new
        // sign-in and no new channel involved.
        expect(controller.status().account?.login).toBe("octocat");
        expect(controller.listAccounts().activeId).toBe(octocatId);

        expect(
            events.some((event) => event.type === "signed-in" && event.account.login === "octocat"),
        ).toBe(true);
    });

    it("refuses to switch active accounts when the target's credential file is unreadable", async () => {
        const { fetch, use } = switchableFetch();
        const { controller, events } = controllerWith({ fetch });

        use(deviceFlowRoutes("octocat", 1, "ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        await controller.startDeviceSignIn();
        use(deviceFlowRoutes("otherbot", 2, "ghu_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
        await controller.startDeviceSignIn();

        const list = controller.listAccounts();
        const octocatId = list.accounts.find((account) => account.login === "octocat")?.id;
        const otherId = list.accounts.find((account) => account.login === "otherbot")?.id;
        expect(octocatId).toBeDefined();
        expect(otherId).toBeDefined();
        if (octocatId === undefined || otherId === undefined) return;

        // otherbot is active (it signed in last). Corrupt octocat's credential file on
        // disk directly, the same shape external tampering or a half-written file would
        // take, so its metadata can no longer be read even though the registry still
        // names the id.
        writeFileSync(join(directory, `github-credential-${octocatId}.json`), "not json", "utf8");

        const eventsBefore = events.length;
        const switched = controller.setActiveAccount(octocatId);

        // The switch must be refused outright - not accepted with a null account - and
        // must leave otherbot active everywhere: in the returned result, on the legacy
        // status channel, in listAccounts(), and in whatever setActiveAccount() persisted
        // to disk. No extra "signed-in" event fires for the id that never actually became
        // active.
        expect(switched.ok).toBe(false);
        expect(switched.account).toBeNull();
        expect(switched.activeId).toBe(otherId);
        expect(switched.reason).not.toBeNull();
        expect(controller.status().account?.login).toBe("otherbot");
        expect(controller.listAccounts().activeId).toBe(otherId);
        expect(events.length).toBe(eventsBefore);
    });

    it("signs one account out without touching another, falling back when it was active", async () => {
        const { fetch, use } = switchableFetch();
        const { controller } = controllerWith({ fetch });

        use(deviceFlowRoutes("octocat", 1, "ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        await controller.startDeviceSignIn();
        use(deviceFlowRoutes("otherbot", 2, "ghu_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
        await controller.startDeviceSignIn();

        const beforeIds = controller.listAccounts().accounts;
        const otherId = beforeIds.find((account) => account.login === "otherbot")?.id;
        const octoId = beforeIds.find((account) => account.login === "octocat")?.id;
        expect(otherId).toBeDefined();
        expect(octoId).toBeDefined();
        if (otherId === undefined || octoId === undefined) return;

        // otherbot signed in last, so it is active; removing it specifically must fall
        // back to octocat rather than leaving the app signed out.
        const removed = await controller.removeAccount(otherId);
        expect(removed.removed).toBe(true);
        expect(removed.wasActive).toBe(true);
        expect(removed.newActiveId).toBe(octoId);
        expect(removed.fallbackAccount?.login).toBe("octocat");

        expect(controller.status().account?.login).toBe("octocat");
        expect(controller.listAccounts().accounts.map((account) => account.login)).toEqual(["octocat"]);
        // otherbot's own file is gone; octocat's is not touched by the removal.
        expect(existsSync(join(directory, `github-credential-${otherId}.json`))).toBe(false);
        expect(existsSync(join(directory, `github-credential-${octoId}.json`))).toBe(true);

        // Signing out the only remaining account falls back to signed-out, not an error.
        const signedOut = await controller.signOut();
        expect(signedOut.signedOut).toBe(true);
        expect(signedOut.fallbackAccount).toBeNull();
        expect(controller.status().signedIn).toBe(false);
        expect(controller.listAccounts().accounts).toEqual([]);
    });

    it("sweeps an orphaned pending staging file left by an interrupted sign-in on startup", async () => {
        // Simulates the exact crash window this guards: `session.ts#accept` already wrote a
        // verified, `safeStorage`-encrypted credential to a staging file, but the process
        // died before `#finalize`'s `stagingStore.clear()` ever ran. No controller
        // constructed yet in this test - so nothing here could have created this file
        // itself - and it must already be a fully valid encrypted envelope, indistinguishable
        // from any live account file, to prove the sweep does not depend on the content being
        // malformed.
        const orphan = join(directory, "github-credential-pending-deadbeef-0000-4000-8000-000000000000.json");
        const store = new TokenStore({ file: orphan, safeStorage: fakeSafeStorage() });
        const saved = store.save({ token: "ghu_leftoverleftoverleftoverleftoverlefto", refreshToken: null }, {
            kind: "github-app",
            login: "orphaned-account",
            userId: 999,
            scopes: ["repo"],
            scopesReported: true,
            clientId: APP_CLIENT.id,
            expiresAt: null,
            refreshTokenExpiresAt: null,
        });
        expect(saved.ok).toBe(true);
        expect(existsSync(orphan)).toBe(true);

        // A sibling file that must NOT be swept, to prove the pattern is specific rather
        // than "delete everything in the directory".
        const registryLike = join(directory, "github-accounts.json");
        writeFileSync(registryLike, "{}", "utf8");

        const { fetch } = switchableFetch();
        controllerWith({ fetch }); // constructing sweeps on startup, before any sign-in

        expect(existsSync(orphan)).toBe(false);
        expect(existsSync(registryLike)).toBe(true);
    });

    it("refuses to persist with no working credential store, but stays usable for this run", async () => {
        const { fetch, use } = switchableFetch();
        const { controller } = controllerWith({ fetch, safeStorage: fakeSafeStorage(false) });

        use(deviceFlowRoutes("octocat", 1, "ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        const result = await controller.startDeviceSignIn();

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.account.persisted).toBe(false);
        // Still usable in memory for the rest of this run, exactly like the single-account
        // path always behaved.
        expect(controller.status().account?.login).toBe("octocat");
        expect(controller.listAccounts().accounts.map((account) => account.login)).toEqual(["octocat"]);

        // Not "wrote it anyway, differently": nothing was written at all.
        expect(readdirSync(directory)).toEqual([]);
    });

    it("stays signed in and reports persisted:false when the final write fails after the staging write succeeded", async () => {
        // The staging write (inside session.ts#accept) succeeds - `safeStorage` is working
        // - but the second write, moving the verified credential into the account's own
        // file inside #finalize, fails. The old behaviour trusted that move blindly: it
        // deleted the staging file, built a fresh session over an empty final store, and
        // still reported `persisted: true`, so the very next status() call read as signed
        // out with no error ever surfaced.
        const { fetch, use } = switchableFetch();
        const { controller } = controllerWith({ fetch, safeStorage: fakeSafeStorageFailingAfter(1) });

        use(deviceFlowRoutes("octocat", 1, "ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        const result = await controller.startDeviceSignIn();

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // The interface must not claim the token was saved when the second write failed.
        expect(result.account.persisted).toBe(false);

        // The session itself is not lost: the same in-memory secret that was already
        // verified keeps the account signed in and usable for the rest of this run.
        expect(controller.status().signedIn).toBe(true);
        expect(controller.status().account?.login).toBe("octocat");
        const token = await controller.accessToken();
        expect(token.ok).toBe(true);
        expect(controller.listAccounts().accounts.map((account) => account.login)).toEqual(["octocat"]);

        // Nothing durable claims an account with no working credential file behind it: no
        // final credential file was created, and the registry was never told to point at it.
        expect(existsSync(join(directory, "github-credential-u1.json"))).toBe(false);
        expect(existsSync(join(directory, "github-accounts.json"))).toBe(false);
    });

    it("never writes a token anywhere in what it persists", async () => {
        const { fetch, use } = switchableFetch();
        const { controller } = controllerWith({ fetch });

        const token = "ghu_secrettokenthatmustneverbewritten00";
        use(deviceFlowRoutes("octocat", 1, token));
        await controller.startDeviceSignIn();

        const files = readdirSync(directory);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const contents = readFileSync(join(directory, file), "utf8");
            expect(contents).not.toContain(token);
        }

        const registry = JSON.parse(readFileSync(join(directory, "github-accounts.json"), "utf8")) as {
            ids: string[];
        };
        expect(registry.ids).toHaveLength(1);
        expect(JSON.stringify(registry)).not.toContain(token);
    });

    it("brings a pre-multi-account sign-in forward as the active account, once", async () => {
        const safeStorage = fakeSafeStorage();
        const legacyFile = join(directory, "github-credential.json");
        const legacyStore = new TokenStore({ file: legacyFile, safeStorage });
        legacyStore.save(
            { token: "ghu_legacytoken0000000000000000000000000", refreshToken: null },
            {
                kind: "oauth-app",
                login: "legacyuser",
                userId: 42,
                scopes: ["public_repo"],
                scopesReported: true,
                clientId: "Ov1",
                expiresAt: null,
                refreshTokenExpiresAt: null,
            },
        );

        const accountsDirectory = join(directory, "accounts");
        migrateLegacyAccount({ legacyFile, directory: accountsDirectory, safeStorage });

        const migrated = new GitHubAccountsController({
            directory: accountsDirectory,
            safeStorage,
            fetch: () => Promise.reject(new Error("no network expected")),
            sleep: () => Promise.resolve(),
            client: () => APP_CLIENT,
            openExternal: () => Promise.resolve(true),
        });

        expect(migrated.status().account?.login).toBe("legacyuser");
        expect(migrated.listAccounts().accounts.map((account) => account.login)).toEqual(["legacyuser"]);

        // A second migration attempt, with a different legacy account, is a no-op: the
        // multi-account registry already exists and is never overwritten from underneath it.
        const otherLegacyFile = join(directory, "other-legacy.json");
        new TokenStore({ file: otherLegacyFile, safeStorage }).save(
            { token: "ghu_othertoken00000000000000000000000000", refreshToken: null },
            {
                kind: "oauth-app",
                login: "shouldnotappear",
                userId: 99,
                scopes: [],
                scopesReported: true,
                clientId: "Ov1",
                expiresAt: null,
                refreshTokenExpiresAt: null,
            },
        );
        migrateLegacyAccount({ legacyFile: otherLegacyFile, directory: accountsDirectory, safeStorage });
        expect(migrated.listAccounts().accounts.map((account) => account.login)).toEqual(["legacyuser"]);
    });

    it("does not let a concurrent removeAccount() clobber a setActiveAccount() that lands while it awaits", async () => {
        const { fetch, use } = switchableFetch();
        const { controller, events } = controllerWith({ fetch });

        use(deviceFlowRoutes("alice", 1, "ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        await controller.startDeviceSignIn();
        use(deviceFlowRoutes("bob", 2, "ghu_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
        await controller.startDeviceSignIn();
        use(deviceFlowRoutes("carol", 3, "ghu_cccccccccccccccccccccccccccccccccccc"));
        await controller.startDeviceSignIn();

        const list = controller.listAccounts().accounts;
        const aliceId = list.find((account) => account.login === "alice")?.id;
        const bobId = list.find((account) => account.login === "bob")?.id;
        const carolId = list.find((account) => account.login === "carol")?.id;
        expect(aliceId).toBeDefined();
        expect(bobId).toBeDefined();
        expect(carolId).toBeDefined();
        if (aliceId === undefined || bobId === undefined || carolId === undefined) return;

        // carol signed in last, so it is active.
        expect(controller.listAccounts().activeId).toBe(carolId);

        const eventsBeforeRemoval = events.length;

        // Start removing carol (its account.signOut() awaits revokeToken(), which yields at
        // least one microtask before resuming) but do not await it yet.
        const removal = controller.removeAccount(carolId);

        // While that removal is still suspended, switch the active account to bob. This is a
        // fully synchronous call, so it completes and is observable immediately.
        const switched = controller.setActiveAccount(bobId);
        expect(switched.ok).toBe(true);
        expect(controller.activeAccountId()).toBe(bobId);

        const removed = await removal;
        expect(removed.removed).toBe(true);

        // The removal started when carol was active, but by the time its fallback logic ran,
        // bob had already been made active by the concurrent call above. The just-succeeded
        // setActiveAccount() must win, not get silently reverted back to alice.
        expect(controller.activeAccountId()).toBe(bobId);
        expect(removed.newActiveId).not.toBe(aliceId);

        // No spurious "signed-in" event for alice should have been broadcast by the removal
        // either - only events from after the removal started are relevant here, since
        // alice's own original sign-in legitimately emitted one earlier.
        expect(
            events
                .slice(eventsBeforeRemoval)
                .some((event) => event.type === "signed-in" && event.account.login === "alice"),
        ).toBe(false);
    });
});

describe("accessTokenFor: a token by account id, not only the active one", () => {
    it("resolves a non-active account's own token without disturbing which account is active", async () => {
        const { fetch, use } = switchableFetch();
        const { controller } = controllerWith({ fetch });

        use(deviceFlowRoutes("alice", 1, "ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        await controller.startDeviceSignIn();
        use(deviceFlowRoutes("bob", 2, "ghu_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
        await controller.startDeviceSignIn();

        // bob signed in last, so bob is active - but the token asked for by id is alice's.
        const list = controller.listAccounts();
        expect(list.activeId).not.toBeNull();
        const aliceId = list.accounts.find((account) => account.login === "alice")?.id;
        expect(aliceId).toBeDefined();
        if (aliceId === undefined) return;

        const forAlice = await controller.accessTokenFor(aliceId);
        expect(forAlice.ok).toBe(true);
        if (!forAlice.ok) return;
        expect(forAlice.token).toBe("ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

        // Asking for a specific account's token by id never switches which one is active,
        // unlike setActiveAccount() - the whole point is to authenticate as an account
        // without disturbing every other feature that still reads the active one.
        expect(controller.activeAccountId()).toBe(list.activeId);
        expect(controller.status().account?.login).toBe("bob");

        const forBob = await controller.accessTokenFor(list.activeId as string);
        expect(forBob.ok).toBe(true);
        if (!forBob.ok) return;
        expect(forBob.token).toBe("ghu_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    });

    it("refuses an id nobody stored, the same way the other by-id channels do", async () => {
        const { fetch, use } = switchableFetch();
        const { controller } = controllerWith({ fetch });

        use(deviceFlowRoutes("alice", 1, "ghu_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        await controller.startDeviceSignIn();

        const result = await controller.accessTokenFor("u999999-nobody-signed-in-as-this");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-such-account");
    });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitHubAccountsController } from "./accounts.js";
import type { SafeStorageLike } from "./storage.js";

const OAUTH_BASE = "https://github.test";
const API_BASE = "https://api.github.test";
const APP_CLIENT = { id: "Iv23liPCatYTLpipKJYS", kind: "app" as const };

function fakeSafeStorage(): SafeStorageLike {
    return {
        isEncryptionAvailable: () => true,
        encryptString: (plainText) =>
            Buffer.from(`enc:${Buffer.from(plainText, "utf8").toString("base64")}`, "utf8"),
        decryptString: (encrypted) =>
            Buffer.from(encrypted.toString("utf8").slice(4), "base64").toString("utf8"),
    };
}

function json(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200 });
}

function switchableFetch(): {
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
    use: (routes: Record<string, () => Response>) => void;
} {
    let routes: Record<string, () => Response> = {};
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

function deviceFlowRoutes(login: string, id: number, token: string): Record<string, () => Response> {
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
    directory = await mkdtemp(join(tmpdir(), "material-bluemap-reviewer-probe-"));
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

describe("REVIEWER PROBE: removeAccount vs concurrent setActiveAccount", () => {
    it("does NOT let a concurrent setActiveAccount get silently clobbered", async () => {
        const { fetch, use } = switchableFetch();
        const controller = new GitHubAccountsController({
            directory,
            safeStorage: fakeSafeStorage(),
            fetch,
            sleep: () => Promise.resolve(),
            client: () => APP_CLIENT,
            openExternal: () => Promise.resolve(true),
            now: () => 1_000_000,
            apiBase: API_BASE,
            oauthBase: OAUTH_BASE,
        });

        use(deviceFlowRoutes("alice", 1, "ghu_a".padEnd(40, "a")));
        const r1 = await controller.startDeviceSignIn();
        expect(r1.ok).toBe(true);

        use(deviceFlowRoutes("bob", 2, "ghu_b".padEnd(40, "b")));
        const r2 = await controller.startDeviceSignIn();
        expect(r2.ok).toBe(true);

        use(deviceFlowRoutes("carol", 3, "ghu_c".padEnd(40, "c")));
        const r3 = await controller.startDeviceSignIn();
        expect(r3.ok).toBe(true);

        // carol signed in last, so she is active.
        expect(controller.activeAccountId()).not.toBeNull();
        const list = controller.listAccounts().accounts;
        const aliceId = list.find((a) => a.login === "alice")?.id;
        const bobId = list.find((a) => a.login === "bob")?.id;
        const carolId = list.find((a) => a.login === "carol")?.id;
        expect(aliceId).toBeDefined();
        expect(bobId).toBeDefined();
        expect(carolId).toBeDefined();
        if (aliceId === undefined || bobId === undefined || carolId === undefined) return;

        expect(controller.activeAccountId()).toBe(carolId);

        // Fire-and-forget remove of the active account (carol), then IMMEDIATELY (same
        // synchronous tick, no await in between) switch active to bob.
        const removePromise = controller.removeAccount(carolId);
        const switched = controller.setActiveAccount(bobId);

        expect(switched.ok).toBe(true);
        // setActiveAccount is fully synchronous and must have taken effect immediately.
        expect(controller.activeAccountId()).toBe(bobId);

        await removePromise;

        // THE CLAIM: after the pending removeAccount resolves, does it clobber the
        // already-succeeded setActiveAccount(bob) with its own stale fallback logic?
        // eslint-disable-next-line no-console
        console.log("FINAL activeAccountId:", controller.activeAccountId(), {
            aliceId,
            bobId,
            carolId,
        });
        expect(controller.activeAccountId()).toBe(bobId);
    });
});

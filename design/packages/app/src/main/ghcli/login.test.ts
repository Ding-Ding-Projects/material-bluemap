import { describe, expect, it } from "vitest";
import type {
    ProcessResult,
    ProcessRunOptions,
    ProcessRunner,
    ProcessToFileResult,
} from "../cirender/gh.js";
import {
    GH_CLI_LOGIN_SCOPES,
    GH_CLI_OAUTH_CLIENT_ID,
    loginGhCli,
    type GhCliLoginState,
} from "./login.js";

interface Call {
    readonly args: readonly string[];
    readonly input: string | undefined;
    readonly omittedEnvironment: readonly string[];
}

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function fetchSequence(bodies: readonly unknown[]): {
    readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
    readonly requests: { readonly url: string; readonly body: string }[];
} {
    const queue = [...bodies];
    const requests: { url: string; body: string }[] = [];
    return {
        requests,
        fetch: (url, init) => {
            requests.push({ url, body: String(init?.body ?? "") });
            const next = queue.shift();
            if (next === undefined) return Promise.reject(new Error("unexpected fetch"));
            return Promise.resolve(response(next));
        },
    };
}

function runner(
    overrides: Readonly<Record<string, Partial<ProcessResult>>> = {},
    onCall?: (args: readonly string[], options: ProcessRunOptions | undefined) => void,
): ProcessRunner & { calls: Call[] } {
    const calls: Call[] = [];
    return {
        calls,
        run(_command, args, options?: ProcessRunOptions): Promise<ProcessResult> {
            onCall?.(args, options);
            calls.push({
                args: [...args],
                input: options?.input,
                omittedEnvironment: [...(options?.omitEnvironmentVariables ?? [])],
            });
            return Promise.resolve({
                started: true,
                code: 0,
                stdout: "",
                stderr: "",
                ...overrides[args.join(" ")],
            });
        },
        runToFile(): Promise<ProcessToFileResult> {
            return Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" });
        },
    };
}

const STATUS =
    '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat","tokenSource":"keyring","scopes":"repo, workflow, gist, read:org, read:project, project","gitProtocol":"https"}]}}';

function statusWithScopes(scopes: string): string {
    return JSON.stringify({
        hosts: {
            "github.com": [
                {
                    state: "success",
                    active: true,
                    host: "github.com",
                    login: "octocat",
                    tokenSource: "keyring",
                    scopes,
                    gitProtocol: "https",
                },
            ],
        },
    });
}

function successfulRunner(): ProcessRunner & { calls: Call[] } {
    return runner({
        "auth status --hostname github.com --json hosts": { stdout: STATUS },
        "api --hostname github.com user --jq .login": { stdout: "octocat\n" },
    });
}

describe("loginGhCli", () => {
    it("handles pending and slow-down, then stores only through gh stdin and proves the identity", async () => {
        const accessToken = "gho_super_secret_token_123456789";
        const deviceCode = "device-secret-123456789";
        const network = fetchSequence([
            {
                device_code: deviceCode,
                user_code: "ABCD-EFGH",
                verification_uri: "https://github.com/login/device",
                verification_uri_complete: "https://github.com/login/device?user_code=ABCD-EFGH",
                expires_in: 900,
                interval: 1,
            },
            { error: "authorization_pending" },
            { error: "slow_down", interval: 2 },
            {
                access_token: accessToken,
                token_type: "bearer",
                scope: GH_CLI_LOGIN_SCOPES.join(" "),
            },
        ]);
        const process = successfulRunner();
        const states: GhCliLoginState[] = [];
        const opened: string[] = [];
        const waits: number[] = [];
        let now = 1_000;

        const result = await loginGhCli({
            runner: process,
            fetch: network.fetch,
            sleep: (milliseconds) => {
                waits.push(milliseconds);
                now += milliseconds;
                return Promise.resolve();
            },
            now: () => now,
            openExternal: (url) => {
                opened.push(url);
                return Promise.resolve(true);
            },
            onState: (state) => states.push(state),
        });

        expect(result.ok).toBe(true);
        expect(result.state).toMatchObject({ stage: "succeeded", account: { login: "octocat" } });
        expect(opened).toEqual(["https://github.com/login/device?user_code=ABCD-EFGH"]);
        expect(waits).toEqual([1_000, 1_000, 3_000]);
        expect(states.map((state) => state.stage)).toEqual(
            expect.arrayContaining([
                "requesting-code",
                "waiting-for-approval",
                "storing-credential",
                "verifying",
                "succeeded",
            ]),
        );

        const requested = new URLSearchParams(network.requests[0]!.body);
        expect(requested.get("client_id")).toBe(GH_CLI_OAUTH_CLIENT_ID);
        expect(requested.get("scope")?.split(" ")).toEqual(GH_CLI_LOGIN_SCOPES);

        const loginCall = process.calls.find((call) => call.args.includes("--with-token"));
        expect(loginCall?.args).toEqual([
            "auth",
            "login",
            "--hostname",
            "github.com",
            "--git-protocol",
            "https",
            "--with-token",
        ]);
        expect(loginCall?.input).toBe(accessToken);
        expect(loginCall?.args).not.toContain(accessToken);
        for (const call of process.calls) {
            expect(call.omittedEnvironment).toEqual(
                expect.arrayContaining(["GH_TOKEN", "GITHUB_TOKEN", "GH_DEBUG"]),
            );
            expect(call.args).not.toContain(accessToken);
            expect(JSON.stringify(call.omittedEnvironment)).not.toContain(accessToken);
        }
        expect(process.calls.map((call) => call.args.join(" "))).toContain(
            "auth status --hostname github.com --json hosts",
        );
        expect(process.calls.map((call) => call.args.join(" "))).toContain(
            "api --hostname github.com user --jq .login",
        );

        const publicPayload = JSON.stringify({ result, states });
        expect(publicPayload).not.toContain(accessToken);
        expect(publicPayload).not.toContain(deviceCode);
    });

    it.each([
        ["access_denied", "denied"],
        ["expired_token", "expired"],
    ] as const)(
        "maps %s to a terminal %s state without invoking gh",
        async (oauthError, expectedStage) => {
            const network = fetchSequence([
                {
                    device_code: "device-secret-123456789",
                    user_code: "ABCD-EFGH",
                    verification_uri: "https://github.com/login/device",
                    expires_in: 900,
                    interval: 1,
                },
                { error: oauthError },
            ]);
            const process = runner();
            let now = 1_000;
            const result = await loginGhCli({
                runner: process,
                fetch: network.fetch,
                sleep: (milliseconds) => {
                    now += milliseconds;
                    return Promise.resolve();
                },
                now: () => now,
            });

            expect(result).toMatchObject({ ok: false, state: { stage: expectedStage } });
            expect(process.calls).toEqual([]);
        },
    );

    it("cancels while waiting without invoking gh or exposing the device code", async () => {
        const controller = new AbortController();
        const network = fetchSequence([
            {
                device_code: "device-secret-123456789",
                user_code: "ABCD-EFGH",
                verification_uri: "https://github.com/login/device",
                expires_in: 900,
                interval: 1,
            },
        ]);
        const process = runner();
        const result = await loginGhCli({
            runner: process,
            fetch: network.fetch,
            sleep: () => {
                controller.abort();
                return Promise.resolve();
            },
            signal: controller.signal,
        });

        expect(result).toMatchObject({ ok: false, state: { stage: "cancelled" } });
        expect(process.calls).toEqual([]);
        expect(JSON.stringify(result)).not.toContain("device-secret-123456789");
    });

    it("reports cancellation honestly when it lands while gh is handling an approved token", async () => {
        const controller = new AbortController();
        const network = fetchSequence([
            {
                device_code: "device-secret-123456789",
                user_code: "ABCD-EFGH",
                verification_uri: "https://github.com/login/device",
                expires_in: 900,
                interval: 1,
            },
            {
                access_token: "gho_super_secret_token_123456789",
                token_type: "bearer",
                scope: GH_CLI_LOGIN_SCOPES.join(" "),
            },
        ]);
        const process = runner({}, (args) => {
            if (args.includes("--with-token")) controller.abort();
        });
        const result = await loginGhCli({
            runner: process,
            fetch: network.fetch,
            sleep: () => Promise.resolve(),
            signal: controller.signal,
        });

        expect(result).toMatchObject({ ok: false, state: { stage: "cancelled" } });
        expect(result.state.message).toContain("may already have stored");
        expect(process.calls).toHaveLength(1);
    });

    it("rejects an unexpected verification URL before it reaches the browser or renderer", async () => {
        const network = fetchSequence([
            {
                device_code: "device-secret-123456789",
                user_code: "ABCD-EFGH",
                verification_uri: "https://example.com/login/device",
                expires_in: 900,
                interval: 1,
            },
        ]);
        const process = runner();
        const opened: string[] = [];
        const states: GhCliLoginState[] = [];
        const result = await loginGhCli({
            runner: process,
            fetch: network.fetch,
            openExternal: (url) => {
                opened.push(url);
                return Promise.resolve(true);
            },
            onState: (state) => states.push(state),
        });

        expect(result).toMatchObject({
            ok: false,
            state: { stage: "failed", failureCode: "unsafe-verification-uri" },
        });
        expect(opened).toEqual([]);
        expect(process.calls).toEqual([]);
        expect(JSON.stringify({ result, states })).not.toContain("example.com");
    });

    it("redacts a refused token even when gh repeats it in stderr", async () => {
        const accessToken = "gho_super_secret_token_123456789";
        const network = fetchSequence([
            {
                device_code: "device-secret-123456789",
                user_code: "ABCD-EFGH",
                verification_uri: "https://github.com/login/device",
                expires_in: 900,
                interval: 1,
            },
            { access_token: accessToken, token_type: "bearer", scope: "repo workflow" },
        ]);
        const process = runner({
            "auth login --hostname github.com --git-protocol https --with-token": {
                code: 1,
                stderr: `refused ${accessToken}`,
            },
        });
        const result = await loginGhCli({
            runner: process,
            fetch: network.fetch,
            sleep: () => Promise.resolve(),
        });

        expect(result).toMatchObject({ ok: false, state: { failureCode: "gh-login-failed" } });
        expect(JSON.stringify(result)).not.toContain(accessToken);
        expect(result.state.message).toContain("[redacted]");
    });

    it("redacts the approved token from post-storage verification errors", async () => {
        const accessToken = "oauth-secret-without-known-prefix-123456789";
        const network = fetchSequence([
            {
                device_code: "device-secret-123456789",
                user_code: "ABCD-EFGH",
                verification_uri: "https://github.com/login/device",
                expires_in: 900,
                interval: 1,
            },
            {
                access_token: accessToken,
                token_type: "bearer",
                scope: GH_CLI_LOGIN_SCOPES.join(" "),
            },
        ]);
        const process = runner({
            "auth status --hostname github.com --json hosts": {
                code: 1,
                stderr: `verification repeated ${accessToken}`,
            },
        });
        const states: GhCliLoginState[] = [];

        const result = await loginGhCli({
            runner: process,
            fetch: network.fetch,
            sleep: () => Promise.resolve(),
            onState: (state) => states.push(state),
        });

        expect(result).toMatchObject({
            ok: false,
            state: { stage: "failed", failureCode: "gh-status-unverified" },
        });
        expect(result.state.message).toContain("[redacted]");
        expect(JSON.stringify({ result, states })).not.toContain(accessToken);
    });

    it("refuses success when the active stored account is missing a requested scope", async () => {
        const accessToken = "gho_super_secret_token_123456789";
        const network = fetchSequence([
            {
                device_code: "device-secret-123456789",
                user_code: "ABCD-EFGH",
                verification_uri: "https://github.com/login/device",
                expires_in: 900,
                interval: 1,
            },
            {
                access_token: accessToken,
                token_type: "bearer",
                scope: GH_CLI_LOGIN_SCOPES.join(" "),
            },
        ]);
        const process = runner({
            "auth status --hostname github.com --json hosts": {
                stdout: statusWithScopes("repo, gist, read:org, read:project, project"),
            },
            "api --hostname github.com user --jq .login": { stdout: "octocat\n" },
        });

        const result = await loginGhCli({
            runner: process,
            fetch: network.fetch,
            sleep: () => Promise.resolve(),
        });

        expect(result).toMatchObject({
            ok: false,
            state: {
                stage: "failed",
                failureCode: "insufficient-scopes",
                account: { login: "octocat" },
            },
        });
        expect(result.state.message).toContain("workflow");
        expect(JSON.stringify(result)).not.toContain(accessToken);
        expect(process.calls.map((call) => call.args.join(" "))).not.toContain(
            "api --hostname github.com user --jq .login",
        );
    });

    it("accepts normalized broader scopes that imply the requested read scopes", async () => {
        const accessToken = "oauth-secret-without-known-prefix-123456789";
        const network = fetchSequence([
            {
                device_code: "device-secret-123456789",
                user_code: "ABCD-EFGH",
                verification_uri: "https://github.com/login/device",
                expires_in: 900,
                interval: 1,
            },
            {
                access_token: accessToken,
                token_type: "bearer",
                scope: GH_CLI_LOGIN_SCOPES.join(" "),
            },
        ]);
        const process = runner({
            "auth status --hostname github.com --json hosts": {
                stdout: statusWithScopes(" repo, WORKFLOW, GIST, admin:org, project "),
            },
            "api --hostname github.com user --jq .login": { stdout: "octocat\n" },
        });
        const states: GhCliLoginState[] = [];

        const result = await loginGhCli({
            runner: process,
            fetch: network.fetch,
            sleep: () => Promise.resolve(),
            onState: (state) => states.push(state),
        });

        expect(result).toMatchObject({ ok: true, state: { stage: "succeeded" } });
        expect(result.state.message).toContain("requested scopes are verified");
        expect(JSON.stringify({ result, states })).not.toContain(accessToken);
    });

    it("fails scope repair honestly when the browser approves a different account", async () => {
        const network = fetchSequence([
            {
                device_code: "device-secret-123456789",
                user_code: "ABCD-EFGH",
                verification_uri: "https://github.com/login/device",
                expires_in: 900,
                interval: 1,
            },
            {
                access_token: "gho_super_secret_token_123456789",
                token_type: "bearer",
                scope: "repo workflow",
            },
        ]);
        const result = await loginGhCli({
            runner: successfulRunner(),
            fetch: network.fetch,
            sleep: () => Promise.resolve(),
            expectedLogin: "another-account",
        });

        expect(result).toMatchObject({
            ok: false,
            state: { failureCode: "unexpected-account", account: { login: "octocat" } },
        });
        expect(result.state.message).toContain("stored and activated octocat");
    });
});

/**
 * Listing and switching `gh`'s own accounts, against a fake process runner.
 *
 * `gh` is deliberately never spawned here, for the same reason `cirender/gh.test.ts` never
 * spawns it: the states that matter - not installed, installed with nobody signed in,
 * installed with several accounts, an old `gh` with no `--json` support, gh's own output in
 * a shape nothing here recognises - cannot all be produced on one machine, and the switch
 * path must never touch a real machine's real active account as a side effect of a test run.
 *
 * The JSON fixtures below are real captures from `gh auth status --json hosts` on gh
 * 2.96.0 (2026-07-02), with the logins changed. The text fixtures are the equivalent real
 * capture of plain `gh auth status` on the same version, used here only to exercise the
 * fallback parser - the JSON route is what a `gh` this new actually takes in production.
 */

import { describe, expect, it } from "vitest";
import {
    APP_SCOPES_OF_INTEREST,
    listGhCliAccounts,
    parseGhAuthStatusJson,
    parseGhAuthStatusText,
    switchGhCliAccount,
} from "./accounts.js";
import type { GhCliAccountSummary } from "./accounts.js";
import type {
    ProcessResult,
    ProcessRunner,
    ProcessRunOptions,
    ProcessToFileResult,
} from "../cirender/gh.js";
import { GH_CLI_AUTH_ENVIRONMENT } from "./environment.js";

interface Call {
    readonly args: readonly string[];
    readonly omittedEnvironment: readonly string[];
}

interface FakeRunner extends ProcessRunner {
    readonly calls: Call[];
}

/** Answers by matching the *whole* argument list against a joined key, e.g. `"auth status --json hosts"`. */
function fakeRunner(answers: Readonly<Record<string, Partial<ProcessResult>>>): FakeRunner {
    const calls: Call[] = [];
    return {
        calls,
        run(_command, args, options?: ProcessRunOptions): Promise<ProcessResult> {
            calls.push({
                args: [...args],
                omittedEnvironment: [...(options?.omitEnvironmentVariables ?? [])],
            });
            const key = args.join(" ");
            const found = answers[key];
            return Promise.resolve({ started: true, code: 0, stdout: "", stderr: "", ...found });
        },
        runToFile(_command, args, _destination): Promise<ProcessToFileResult> {
            calls.push({ args: [...args], omittedEnvironment: [] });
            return Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" });
        },
    };
}

const VERSION_OK: Partial<ProcessResult> = { stdout: "gh version 2.96.0 (2026-07-02)\n" };

const REAL_JSON_MULTI_ACCOUNT =
    '{"hosts":{"github.com":[' +
    '{"state":"success","active":true,"host":"github.com","login":"DingDingChae","tokenSource":"keyring","scopes":"gist, read:org, repo, workflow","gitProtocol":"https"},' +
    '{"state":"success","active":false,"host":"github.com","login":"cafepromenade","tokenSource":"keyring","scopes":"gist, read:org, repo, workflow","gitProtocol":"https"},' +
    '{"state":"success","active":false,"host":"github.com","login":"codingmachineedge","tokenSource":"keyring","scopes":"gist, project, read:org, repo, workflow","gitProtocol":"https"}' +
    "]}}";

const REAL_JSON_EMPTY = '{"hosts":{}}';

const REAL_TEXT_MULTI_ACCOUNT =
    "github.com\n" +
    "  ✓ Logged in to github.com account DingDingChae (keyring)\n" +
    "  - Active account: true\n" +
    "  - Git operations protocol: https\n" +
    "  - Token: gho_************************************\n" +
    "  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'\n" +
    "\n" +
    "  ✓ Logged in to github.com account cafepromenade (keyring)\n" +
    "  - Active account: false\n" +
    "  - Git operations protocol: https\n" +
    "  - Token: gho_************************************\n" +
    "  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'\n";

const REAL_TEXT_NOT_LOGGED_IN =
    "You are not logged into any GitHub hosts. To log in, run: gh auth login\n";

/* -------------------------------------------------------------------------- */
/* The JSON route                                                             */
/* -------------------------------------------------------------------------- */

describe("parseGhAuthStatusJson", () => {
    it("parses a real multi-account capture into ordered summaries", () => {
        const accounts = parseGhAuthStatusJson(REAL_JSON_MULTI_ACCOUNT);
        expect(accounts).not.toBeNull();
        expect(accounts).toHaveLength(3);
        const active = accounts!.find((account) => account.active);
        expect(active?.login).toBe("DingDingChae");
        expect(active?.scopes).toEqual(["gist", "read:org", "repo", "workflow"]);
        expect(active?.host).toBe("github.com");
        expect(active?.tokenSource).toBe("keyring");
        expect(active?.healthy).toBe(true);
    });

    it("reads an empty hosts object as zero accounts, not as unparseable", () => {
        expect(parseGhAuthStatusJson(REAL_JSON_EMPTY)).toEqual([]);
    });

    it("returns null (never an empty list) for something that is not this JSON shape", () => {
        expect(
            parseGhAuthStatusJson("unknown flag: --json\n\nUsage:  gh auth status [flags]"),
        ).toBeNull();
        expect(parseGhAuthStatusJson("")).toBeNull();
        expect(parseGhAuthStatusJson('{"nothing":"relevant"}')).toBeNull();
    });

    it("says a scope-less account's scopes are not reported, rather than empty", () => {
        const json =
            '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"app-installer","tokenSource":"keyring","scopes":"","gitProtocol":"https"}]}}';
        const accounts = parseGhAuthStatusJson(json)!;
        expect(accounts[0]!.scopesReported).toBe(false);
        expect(accounts[0]!.scopes).toEqual([]);
    });

    it("carries a non-success state through as unhealthy, with the raw state as detail", () => {
        const json =
            '{"hosts":{"github.com":[{"state":"token invalid","active":true,"host":"github.com","login":"stale","tokenSource":"keyring","scopes":"repo","gitProtocol":"https"}]}}';
        const accounts = parseGhAuthStatusJson(json)!;
        expect(accounts[0]!.healthy).toBe(false);
        expect(accounts[0]!.stateDetail).toBe("token invalid");
    });

    it("flags the app scopes this application cares about that an account is missing", () => {
        const json =
            '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"narrow","tokenSource":"keyring","scopes":"repo","gitProtocol":"https"}]}}';
        const accounts = parseGhAuthStatusJson(json)!;
        expect(accounts[0]!.missingAppScopes).toEqual(["workflow"]);
        expect(APP_SCOPES_OF_INTEREST).toContain("workflow");
    });
});

/* -------------------------------------------------------------------------- */
/* The text fallback                                                          */
/* -------------------------------------------------------------------------- */

describe("parseGhAuthStatusText", () => {
    it("parses a real multi-account text capture, including per-account scopes", () => {
        const accounts = parseGhAuthStatusText(REAL_TEXT_MULTI_ACCOUNT);
        expect(accounts).not.toBeNull();
        expect(accounts).toHaveLength(2);
        expect(accounts![0]).toMatchObject({
            login: "DingDingChae",
            host: "github.com",
            active: true,
            scopes: ["gist", "read:org", "repo", "workflow"],
            gitProtocol: "https",
        });
        expect(accounts![1]).toMatchObject({ login: "cafepromenade", active: false });
    });

    it("reads the 'not logged into any hosts' sentence as zero accounts, not unrecognised", () => {
        expect(parseGhAuthStatusText(REAL_TEXT_NOT_LOGGED_IN)).toEqual([]);
    });

    it("reads the legacy 'as LOGIN' form older gh versions used", () => {
        const accounts = parseGhAuthStatusText(
            "ghe.example.com\n  ✓ Logged in to ghe.example.com as octocat\n  - Active account: true\n",
        );
        expect(accounts).toEqual([
            expect.objectContaining({ login: "octocat", host: "ghe.example.com", active: true }),
        ]);
    });

    it("returns null - never an empty list - for text it does not recognise at all", () => {
        expect(parseGhAuthStatusText("something gh never actually prints")).toBeNull();
    });
});

/* -------------------------------------------------------------------------- */
/* listGhCliAccounts: three honest states, plus the fallback and the failure  */
/* -------------------------------------------------------------------------- */

describe("listGhCliAccounts", () => {
    it("says not-installed when gh is not on PATH, and asks nothing else", async () => {
        const runner = fakeRunner({
            "--version": { started: false, code: null, stderr: "spawn gh ENOENT" },
        });
        const status = await listGhCliAccounts({ runner });
        expect(status.availability).toBe("not-installed");
        expect(status.accounts).toEqual([]);
        expect(runner.calls).toHaveLength(1);
    });

    it("says no-accounts when gh is installed but the JSON route reports nobody signed in", async () => {
        const runner = fakeRunner({
            "--version": VERSION_OK,
            "auth status --json hosts": { stdout: REAL_JSON_EMPTY },
        });
        const status = await listGhCliAccounts({ runner });
        expect(status.availability).toBe("no-accounts");
        expect(status.source).toBe("json");
        expect(status.message).toContain("sign-in action below");
        expect(status.message).toContain("stored by gh");
    });

    it("prefers the JSON route and reports it as the source", async () => {
        const runner = fakeRunner({
            "--version": VERSION_OK,
            "auth status --json hosts": { stdout: REAL_JSON_MULTI_ACCOUNT },
        });
        const status = await listGhCliAccounts({ runner });
        expect(status.availability).toBe("ready");
        expect(status.source).toBe("json");
        expect(status.accounts).toHaveLength(3);
        // The text fallback command must never be run when the JSON route already answered.
        expect(runner.calls.map((call) => call.args.join(" "))).not.toContain("auth status");
    });

    it("falls back to text parsing when gh's --json flag is not recognised", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.20.0\n" },
            "auth status --json hosts": {
                code: 1,
                stderr: "unknown flag: --json\n\nUsage:  gh auth status [flags]\n",
            },
            "auth status": { code: 0, stdout: REAL_TEXT_MULTI_ACCOUNT },
        });
        const status = await listGhCliAccounts({ runner });
        expect(status.availability).toBe("ready");
        expect(status.source).toBe("text");
        expect(status.accounts).toHaveLength(2);
    });

    it("reports unrecognised - never zero accounts - when neither route can be understood", async () => {
        const runner = fakeRunner({
            "--version": VERSION_OK,
            "auth status --json hosts": { code: 1, stderr: "some future flag rejection" },
            "auth status": { code: 1, stderr: "something this parser has never seen" },
        });
        const status = await listGhCliAccounts({ runner });
        expect(status.availability).toBe("unrecognised");
        expect(status.accounts).toEqual([]);
        expect(status.message).toContain("gh auth status");
    });

    it("never passes --show-token anywhere", async () => {
        const runner = fakeRunner({
            "--version": VERSION_OK,
            "auth status --json hosts": { stdout: REAL_JSON_MULTI_ACCOUNT },
        });
        await listGhCliAccounts({ runner });
        for (const call of runner.calls) {
            expect(call.args).not.toContain("--show-token");
            expect(call.args).not.toContain("-t");
        }
    });

    it("strips inherited auth overrides from every version, JSON, and text-fallback call", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.20.0\n" },
            "auth status --json hosts": { code: 1, stderr: "unknown flag: --json" },
            "auth status": { code: 0, stdout: REAL_TEXT_MULTI_ACCOUNT },
        });
        await listGhCliAccounts({ runner });

        expect(runner.calls.map((call) => call.args.join(" "))).toEqual([
            "--version",
            "auth status --json hosts",
            "auth status",
        ]);
        for (const call of runner.calls) {
            expect(call.omittedEnvironment).toEqual(GH_CLI_AUTH_ENVIRONMENT);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* switchGhCliAccount: never trust the exit code, always re-read              */
/* -------------------------------------------------------------------------- */

describe("switchGhCliAccount", () => {
    it("reports ok only after re-reading confirms the switch actually took", async () => {
        const switchedJson = REAL_JSON_MULTI_ACCOUNT.replace(
            '"active":true',
            '"active":false',
        ).replace(
            '"login":"cafepromenade","tokenSource":"keyring","scopes":"gist, read:org, repo, workflow","gitProtocol":"https"}',
            '"login":"cafepromenade","tokenSource":"keyring","scopes":"gist, read:org, repo, workflow","gitProtocol":"https","active":true}',
        );
        const runner = fakeRunner({
            "auth switch --hostname github.com --user cafepromenade": { code: 0 },
            "--version": VERSION_OK,
            "auth status --json hosts": { stdout: switchedJson },
        });
        const result = await switchGhCliAccount({ runner }, "github.com", "cafepromenade");
        expect(result.ok).toBe(true);
        expect(result.account?.login).toBe("cafepromenade");
        expect(result.message).toContain("machine-wide");
    });

    it("never reports ok from a zero exit code alone when the re-read disagrees", async () => {
        // gh exits 0 but the account genuinely never became active - re-reading must catch it.
        const runner = fakeRunner({
            "auth switch --hostname github.com --user cafepromenade": { code: 0 },
            "--version": VERSION_OK,
            "auth status --json hosts": { stdout: REAL_JSON_MULTI_ACCOUNT }, // still DingDingChae active
        });
        const result = await switchGhCliAccount({ runner }, "github.com", "cafepromenade");
        expect(result.ok).toBe(false);
        expect(result.message).toContain("did not take");
    });

    it("reports a real gh refusal by name", async () => {
        const runner = fakeRunner({
            "auth switch --hostname github.com --user nobody": {
                code: 1,
                stderr: "no user found for github.com",
            },
            "--version": VERSION_OK,
            "auth status --json hosts": { stdout: REAL_JSON_MULTI_ACCOUNT },
        });
        const result = await switchGhCliAccount({ runner }, "github.com", "nobody");
        expect(result.ok).toBe(false);
        expect(result.message).toContain("no user found for github.com");
    });

    it("refuses with a clear message when gh is not installed", async () => {
        const runner = fakeRunner({
            "auth switch --hostname github.com --user cafepromenade": {
                started: false,
                code: null,
                stderr: "spawn gh ENOENT",
            },
        });
        const result = await switchGhCliAccount({ runner }, "github.com", "cafepromenade");
        expect(result.ok).toBe(false);
        expect(result.message).toContain("PATH");
    });

    it("refuses an empty host or login without spawning anything", async () => {
        const runner = fakeRunner({});
        const result = await switchGhCliAccount({ runner }, "", "someone");
        expect(result.ok).toBe(false);
        expect(runner.calls).toHaveLength(0);
    });

    it("never passes --show-token while switching", async () => {
        const runner = fakeRunner({
            "auth switch --hostname github.com --user cafepromenade": { code: 0 },
            "--version": VERSION_OK,
            "auth status --json hosts": { stdout: REAL_JSON_MULTI_ACCOUNT },
        });
        await switchGhCliAccount({ runner }, "github.com", "cafepromenade");
        for (const call of runner.calls) expect(call.args).not.toContain("--show-token");
    });

    it("strips inherited auth overrides from switching and its complete re-read", async () => {
        const runner = fakeRunner({
            "auth switch --hostname github.com --user cafepromenade": { code: 0 },
            "--version": VERSION_OK,
            "auth status --json hosts": { stdout: REAL_JSON_MULTI_ACCOUNT },
        });
        await switchGhCliAccount({ runner }, "github.com", "cafepromenade");

        expect(runner.calls.map((call) => call.args.join(" "))).toEqual([
            "auth switch --hostname github.com --user cafepromenade",
            "--version",
            "auth status --json hosts",
        ]);
        for (const call of runner.calls) {
            expect(call.omittedEnvironment).toEqual(GH_CLI_AUTH_ENVIRONMENT);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Never a secret in a message                                                */
/* -------------------------------------------------------------------------- */

describe("no token ever appears in any produced message", () => {
    it("across every status and switch message produced above", async () => {
        const runner = fakeRunner({
            "--version": VERSION_OK,
            "auth status --json hosts": { stdout: REAL_JSON_MULTI_ACCOUNT },
            "auth switch --hostname github.com --user cafepromenade": { code: 0 },
        });
        const status = await listGhCliAccounts({ runner });
        const switched = await switchGhCliAccount({ runner }, "github.com", "cafepromenade");
        const messages = [status.message, switched.message];
        for (const message of messages) {
            expect(message.toLowerCase()).not.toMatch(/\bghp_|ghu_|ghs_|gho_/);
        }
    });
});

/** Keeps `GhCliAccountSummary` honest against a hand-typed literal, so a field renamed in
 *  `accounts.ts` and not here fails to compile rather than silently drifting. */
function assertShape(account: GhCliAccountSummary): void {
    expect(typeof account.login).toBe("string");
}
void assertShape;

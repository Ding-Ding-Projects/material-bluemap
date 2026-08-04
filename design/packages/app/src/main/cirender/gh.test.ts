/**
 * Detecting and driving `gh`, against a fake process runner.
 *
 * `gh` is deliberately never spawned here. The three states that matter - not installed,
 * installed and signed out, installed and ready - cannot all be produced on one machine,
 * and a suite that only worked where `gh` happened to be set up would test the one state
 * nobody needs help with.
 *
 * The assertion worth reading twice is the negative one: **`--show-token` is never
 * passed**. The account name is all this needs, and asking `gh` for the credential would
 * put a token into a pipe for no reason at all.
 */

import { describe, expect, it } from "vitest";
import {
    GH_COMMAND,
    GH_LOGIN_COMMAND,
    detectGh,
    ghApiJson,
    ghApiPost,
    ghApiToFile,
} from "./gh.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "./gh.js";

interface Call {
    readonly command: string;
    readonly args: readonly string[];
    readonly input: string | null;
    readonly destination: string | null;
}

interface FakeRunner extends ProcessRunner {
    readonly calls: Call[];
}

/** Answers by matching the first argument, so a test says `{ "--version": ... }`. */
function fakeRunner(
    answers: Readonly<Record<string, Partial<ProcessResult>>>,
    toFile: Partial<ProcessToFileResult> = {},
): FakeRunner {
    const calls: Call[] = [];
    const answer = (args: readonly string[]): ProcessResult => {
        const key = Object.keys(answers).find((candidate) => args.includes(candidate));
        const found = key === undefined ? {} : answers[key];
        return { started: true, code: 0, stdout: "", stderr: "", ...found };
    };
    return {
        calls,
        run(command, args, options) {
            calls.push({
                command,
                args: [...args],
                input: options?.input ?? null,
                destination: null,
            });
            return Promise.resolve(answer(args));
        },
        runToFile(command, args, destination) {
            calls.push({ command, args: [...args], input: null, destination });
            return Promise.resolve({ started: true, code: 0, bytes: 12, stderr: "", ...toFile });
        },
    };
}

const NOT_ON_PATH: Partial<ProcessResult> = { started: false, code: null, stderr: "spawn gh ENOENT" };

describe("three states, three sentences", () => {
    it("says gh is not installed when it is not on PATH", async () => {
        const runner = fakeRunner({ "--version": NOT_ON_PATH });
        const status = await detectGh(runner);

        expect(status.availability).toBe("not-installed");
        expect(status.message).toContain("PATH");
        expect(status.message).toContain("cli.github.com");
        // Nothing else is attempted: asking a missing executable about its auth state is
        // a second failure with a worse message.
        expect(runner.calls).toHaveLength(1);
    });

    it("says gh is installed but signed out, and names the command to run", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.62.0 (2026-01-01)\n" },
            status: { code: 1, stderr: "You are not logged into any GitHub hosts.\n" },
        });
        const status = await detectGh(runner);

        expect(status.availability).toBe("signed-out");
        expect(status.version).toBe("gh version 2.62.0 (2026-01-01)");
        expect(status.account).toBeNull();
        expect(status.message).toContain(GH_LOGIN_COMMAND);
        // The hard-won rule, stated to the person rather than attempted: `gh auth login`
        // suppresses its device-code prompt when stdin is not a terminal, so it can only
        // be run by a human in a real one.
        expect(status.message).toContain("terminal");
    });

    it("says gh is ready, with the account it named", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.62.0\n" },
            status: {
                code: 0,
                stdout: "github.com\n  ✓ Logged in to github.com account octocat (keyring)\n",
            },
        });
        const status = await detectGh(runner);

        expect(status.availability).toBe("ready");
        expect(status.account).toBe("octocat");
        expect(status.host).toBe("github.com");
        expect(status.message).toContain("octocat");
    });

    it("reads an older gh that wrote its status to stderr, and said 'as' rather than 'account'", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.20.0\n" },
            status: { code: 0, stderr: "ghe.example.com\n  ✓ Logged in to ghe.example.com as octocat\n" },
        });
        const status = await detectGh(runner);

        expect(status.availability).toBe("ready");
        expect(status.account).toBe("octocat");
        expect(status.host).toBe("ghe.example.com");
    });

    it("treats a gh that will not report its version as unusable rather than ready", async () => {
        const runner = fakeRunner({ "--version": { code: 1, stderr: "some loader error" } });
        const status = await detectGh(runner);
        expect(status.availability).toBe("not-installed");
        expect(status.message).toContain("would not report its version");
    });

    it("never asks gh for the token", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.62.0\n" },
            status: { code: 0, stdout: "✓ Logged in to github.com account octocat\n" },
        });
        await detectGh(runner);
        for (const call of runner.calls) {
            expect(call.args).not.toContain("--show-token");
            expect(call.args).not.toContain("-t");
        }
    });
});

describe("calling the API through it", () => {
    it("passes the endpoint as one argument and parses the answer", async () => {
        const runner = fakeRunner({ api: { stdout: '{"id":7,"status":"queued"}' } });
        const body = await ghApiJson("repos/o/r/actions/runs/7", { runner });

        expect(body).toEqual({ id: 7, status: "queued" });
        const call = runner.calls[0];
        expect(call?.command).toBe(GH_COMMAND);
        // One argument, never interpolated into a command line: nothing in a repository
        // name can become part of a command when there is no shell to parse it.
        expect(call?.args).toContain("repos/o/r/actions/runs/7");
    });

    it("carries an enterprise host through when gh reported one", async () => {
        const runner = fakeRunner({ api: { stdout: "{}" } });
        await ghApiJson("repos/o/r", { runner, host: "ghe.example.com" });
        expect(runner.calls[0]?.args).toEqual(
            expect.arrayContaining(["--hostname", "ghe.example.com"]),
        );
    });

    it("sends a dispatch body on stdin as JSON", async () => {
        const runner = fakeRunner({ api: {} });
        await ghApiPost("repos/o/r/actions/workflows/render-world.yml/dispatches", {
            ref: "main",
            inputs: { "map-id": "world" },
        }, { runner });

        const call = runner.calls[0];
        expect(call?.args).toEqual(expect.arrayContaining(["-X", "POST", "--input", "-"]));
        expect(JSON.parse(call?.input ?? "{}")).toEqual({ ref: "main", inputs: { "map-id": "world" } });
    });

    it("turns gh's HTTP status into the same error the API route raises", async () => {
        const runner = fakeRunner({
            api: { code: 1, stderr: "gh: Not Found (HTTP 404)\n" },
        });
        const error = await ghApiJson("repos/o/r", { runner }).catch((thrown: unknown) => thrown);
        expect((error as { status: number }).status).toBe(404);
        expect((error as Error).message).toContain("answers the same way for both");
    });

    it("explains a 403 as a permission or an SSO authorisation, not as a missing repository", async () => {
        const runner = fakeRunner({ api: { code: 1, stderr: "gh: Forbidden (HTTP 403)\n" } });
        const error = await ghApiJson("repos/o/r", { runner }).catch((thrown: unknown) => thrown);
        expect((error as Error).message).toContain("SSO");
    });

    it("says gh is missing rather than reporting a parse failure", async () => {
        const runner = fakeRunner({ api: NOT_ON_PATH });
        await expect(ghApiJson("repos/o/r", { runner })).rejects.toThrowError(/PATH/);
    });

    it("refuses an answer that is not JSON rather than passing undefined onwards", async () => {
        const runner = fakeRunner({ api: { stdout: "not json at all" } });
        await expect(ghApiJson("repos/o/r", { runner })).rejects.toThrowError(/not JSON/);
    });

    it("streams a binary body to a file and reports how many bytes landed", async () => {
        const runner = fakeRunner({ api: {} }, { bytes: 4096 });
        const bytes = await ghApiToFile("repos/o/r/actions/artifacts/9/zip", "/tmp/x.zip", { runner });
        expect(bytes).toBe(4096);
        expect(runner.calls[0]?.destination).toBe("/tmp/x.zip");
    });
});

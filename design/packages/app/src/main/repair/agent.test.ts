import { describe, expect, it } from "vitest";
import type { CommandOutput, CommandRunner } from "../runtime/command.js";
import { buildRepairPrompt, detectCodingAgent, opencodeRunner, parseAgentReply } from "./agent.js";
import type { RepairEvidence } from "./evidence.js";
import type { RepairScope } from "./guardrails.js";

function output(partial: Partial<CommandOutput>): CommandOutput {
    return {
        ok: partial.ok ?? false,
        exitCode: partial.exitCode ?? null,
        stdout: partial.stdout ?? "",
        stderr: partial.stderr ?? "",
        spawnError: partial.spawnError ?? null,
    };
}

const EVIDENCE: RepairEvidence = {
    subject: "render",
    mode: "local",
    command: "/opt/jdk/bin/java",
    args: ["-jar", "/opt/app/cli.jar"],
    exitCode: 1,
    signal: null,
    spawnError: null,
    cancelled: false,
    stderr: ["java.lang.IllegalStateException: something nobody has seen before"],
    diagnostics: [],
    setupProblems: [],
    consentMissing: false,
    mapsScheduled: null,
    config: [{ path: "core.conf", text: "accept-download: true\n" }],
    hostConfigDir: "/srv/render/config",
    outputRoot: "/srv/render/web",
    worlds: [{ mapId: "overworld", path: "/srv/saves/world" }],
    javaExecutable: "/opt/jdk/bin/java",
    javaVersion: "25.0.3",
    requiredJavaFeature: 25,
    docker: null,
    port: null,
    host: null,
    at: "2026-08-04T10:00:00.000Z",
};

const SCOPE: RepairScope = { configDir: "/srv/render/config", worldPaths: ["/srv/saves/world"] };

describe("finding a local coding agent", () => {
    it("reports absence as an ordinary fact, not a failure", async () => {
        const runner: CommandRunner = () => Promise.resolve(output({ spawnError: "ENOENT" }));
        const found = await detectCodingAgent(runner);
        expect(found.available).toBe(false);
        expect(found.message).toContain("no 'opencode' command");
    });

    it("reports the version when it is there", async () => {
        const runner: CommandRunner = () => Promise.resolve(output({ ok: true, exitCode: 0, stdout: "1.4.2\n" }));
        const found = await detectCodingAgent(runner);
        expect(found).toMatchObject({ available: true, version: "1.4.2" });
    });

    it("treats a command that is there but does not run as unavailable", async () => {
        const runner: CommandRunner = () => Promise.resolve(output({ exitCode: 127 }));
        const found = await detectCodingAgent(runner);
        expect(found.available).toBe(false);
        expect(found.message).toContain("exit code 127");
    });

    it("passes the prompt as one argument, so nothing in it is ever a second command", async () => {
        const seen: { command: string; args: readonly string[] }[] = [];
        const runner: CommandRunner = (command, args) => {
            seen.push({ command, args });
            return Promise.resolve(output({ ok: true, exitCode: 0 }));
        };
        await opencodeRunner(runner)("a prompt with && rm -rf / in it");
        expect(seen[0]?.command).toBe("opencode");
        expect(seen[0]?.args).toEqual(["run", "a prompt with && rm -rf / in it"]);
    });
});

describe("the prompt", () => {
    const prompt = buildRepairPrompt(EVIDENCE, SCOPE);

    it("forbids the destructive things by name", () => {
        const lower = prompt.toLowerCase();
        expect(lower).toContain("do not delete any file or folder");
        expect(lower).toContain("do not run git");
        expect(lower).toContain("force-push");
        expect(lower).toContain("history rewriting");
        expect(lower).toContain("world folder");
        expect(lower).toContain("do not send the config");
    });

    it("names the one folder edits may be proposed in, and the worlds to keep away from", () => {
        expect(prompt).toContain("/srv/render/config");
        expect(prompt).toContain("/srv/saves/world");
    });

    it("asks for a refusal to guess, in as many words", () => {
        expect(prompt).toContain('"cause": null');
        expect(prompt).toContain("A wrong edit to");
    });

    it("carries the evidence, with the config already masked", () => {
        expect(prompt).toContain("something nobody has seen before");
        expect(prompt).toContain("--- core.conf ---");
    });
});

describe("reading the reply", () => {
    it("takes a fenced JSON document", () => {
        const reply = parseAgentReply(
            [
                "Here is what I found.",
                "```json",
                '{ "cause": "the storage root was wrong", "confident": true, "edits": [',
                '  { "path": "storages/file.conf", "text": "root: \\"/srv/render/web/maps\\"\\n" } ] }',
                "```",
            ].join("\n"),
        );
        expect(reply.ok).toBe(true);
        if (!reply.ok) return;
        expect(reply.proposal.cause).toBe("the storage root was wrong");
        expect(reply.proposal.edits).toEqual([
            { kind: "write", path: "storages/file.conf", text: 'root: "/srv/render/web/maps"\n' },
        ]);
    });

    it("takes a bare JSON document too", () => {
        const reply = parseAgentReply('{"cause": null, "edits": []}');
        expect(reply.ok === true && reply.proposal.cause).toBeNull();
        expect(reply.ok === true && reply.proposal.edits).toEqual([]);
    });

    it("accepts a reply that proposes nothing at all as a complete answer", () => {
        const reply = parseAgentReply('```json\n{"cause": null, "confident": false, "edits": []}\n```');
        expect(reply.ok).toBe(true);
        expect(reply.ok === true && reply.proposal.edits).toEqual([]);
        expect(reply.ok === true && reply.proposal.confident).toBe(false);
    });

    it("refuses prose rather than inferring an edit from it", () => {
        const reply = parseAgentReply("I think the world path is wrong; you should fix maps/overworld.conf.");
        expect(reply.ok).toBe(false);
        expect(reply.ok === false && reply.reason).toContain("did not answer with a JSON document");
    });

    it("refuses a document that is not valid JSON", () => {
        const reply = parseAgentReply('```json\n{ "cause": "x", }\n```');
        expect(reply.ok).toBe(false);
        expect(reply.ok === false && reply.reason).toContain("not valid JSON");
    });

    it("refuses an edit with no file name", () => {
        const reply = parseAgentReply('{"edits": [{"text": "a: 1"}]}');
        expect(reply.ok).toBe(false);
        expect(reply.ok === false && reply.reason).toContain("names no file");
    });

    it("carries a proposed deletion through, so the guard can refuse it by name", () => {
        const reply = parseAgentReply('{"edits": [{"kind": "delete", "path": "maps/overworld.conf"}]}');
        expect(reply.ok === true && reply.proposal.edits[0]?.kind).toBe("delete");
    });

    it("reads the last fenced block, which is the answer after any thinking aloud", () => {
        const reply = parseAgentReply(
            ['```json', '{"cause": "first guess", "edits": []}', '```', 'on reflection:', '```json', '{"cause": "second", "edits": []}', '```'].join(
                "\n",
            ),
        );
        expect(reply.ok === true && reply.proposal.cause).toBe("second");
    });
});

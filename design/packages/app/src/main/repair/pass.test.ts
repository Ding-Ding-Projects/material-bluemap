import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CommandOutput } from "../runtime/command.js";
import type { RepairEvidence } from "./evidence.js";
import type { AgentAvailability } from "./agent.js";
import type { RepairScope } from "./guardrails.js";
import { runRepairPass, type RepairOptions } from "./pass.js";

const CONFIG_DIR = resolve("/srv/render/config");

const SCOPE: RepairScope = { configDir: CONFIG_DIR, worldPaths: [resolve("/srv/saves/world")] };

function evidence(overrides: Partial<RepairEvidence> = {}): RepairEvidence {
    return {
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
        config: [],
        hostConfigDir: CONFIG_DIR,
        outputRoot: "/srv/render/web",
        worlds: [{ mapId: "overworld", path: resolve("/srv/saves/world") }],
        javaExecutable: "/opt/jdk/bin/java",
        javaVersion: "25.0.3",
        requiredJavaFeature: 25,
        docker: null,
        port: null,
        host: null,
        at: "2026-08-04T10:00:00.000Z",
        ...overrides,
    };
}

const INSTALLED: AgentAvailability = {
    available: true,
    command: "opencode",
    version: "1.4.2",
    message: "opencode 1.4.2 is installed.",
};

function said(text: string): () => Promise<CommandOutput> {
    return () => Promise.resolve({ ok: true, exitCode: 0, stdout: text, stderr: "", spawnError: null });
}

/** A pass with a writable in-memory config folder. */
function withDisk(
    files: Record<string, string>,
    options: Partial<RepairOptions> = {},
): { readonly options: RepairOptions; readonly files: Record<string, string>; readonly recorded: string[] } {
    const disk = { ...files };
    const recorded: string[] = [];
    return {
        files: disk,
        recorded,
        options: {
            scope: SCOPE,
            readText: (path) => Promise.resolve(disk[path] ?? null),
            writeText: (path, text) => {
                disk[path] = text;
                return Promise.resolve();
            },
            recordHistory: (folder, label) => {
                recorded.push(`${folder}: ${label}`);
                return Promise.resolve({ ok: true, message: "Recorded one revision." });
            },
            ...options,
        },
    };
}

describe("the deterministic half comes first", () => {
    it("never consults the agent for a failure it recognised", async () => {
        let asked = 0;
        const result = await runRepairPass(evidence({ consentMissing: true }), {
            scope: SCOPE,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: () => {
                asked += 1;
                return Promise.resolve({ ok: true, exitCode: 0, stdout: "{}", stderr: "", spawnError: null });
            },
        });

        expect(asked).toBe(0);
        expect(result.explained).toBe(true);
        expect(result.diagnoses.map((entry) => entry.code)).toEqual(["download-not-accepted"]);
        expect(result.agent.consulted).toBe(false);
        expect(result.agent.message).toContain("explained by the checks built into the app");
        expect(result.applied).toEqual([]);
    });

    it("changes nothing at all when it explains the failure", async () => {
        const { options, files } = withDisk({ [join(CONFIG_DIR, "core.conf")]: "accept-download: false\n" });
        const result = await runRepairPass(evidence({ consentMissing: true }), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said('{"cause":"x","edits":[{"path":"core.conf","text":"accept-download: true\\n"}]}'),
        });
        expect(files[join(CONFIG_DIR, "core.conf")]).toBe("accept-download: false\n");
        expect(result.applied).toEqual([]);
    });
});

describe("when nothing was recognised", () => {
    it("says so and stops, when the agent is switched off", async () => {
        const result = await runRepairPass(evidence(), { scope: SCOPE, allowAgent: false, agent: INSTALLED });
        expect(result.explained).toBe(false);
        expect(result.agent.consulted).toBe(false);
        expect(result.agent.message).toContain("switched off");
        expect(result.applied).toEqual([]);
    });

    it("says so honestly when no agent is installed", async () => {
        const result = await runRepairPass(evidence(), {
            scope: SCOPE,
            allowAgent: true,
            agent: {
                available: false,
                command: "opencode",
                version: null,
                message: "There is no 'opencode' command on this account's PATH, so the automatic repair can only use the checks built into this app.",
            },
        });
        expect(result.agent.consulted).toBe(false);
        expect(result.agent.message).toContain("no 'opencode' command");
        expect(result.applied).toEqual([]);
    });

    it("accepts 'I do not know' from the agent as a correct answer", async () => {
        const result = await runRepairPass(evidence(), {
            scope: SCOPE,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said('```json\n{"cause": null, "confident": false, "edits": []}\n```'),
        });
        expect(result.agent.consulted).toBe(true);
        expect(result.agent.message).toContain("could not work out why this failed either");
        expect(result.applied).toEqual([]);
    });

    it("changes nothing when the agent answers in prose", async () => {
        const result = await runRepairPass(evidence(), {
            scope: SCOPE,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said("I think you should delete the world and start again."),
        });
        expect(result.agent.message).toContain("did not answer with a JSON document");
        expect(result.applied).toEqual([]);
    });

    it("changes nothing when the agent could not be run at all", async () => {
        const result = await runRepairPass(evidence(), {
            scope: SCOPE,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: () => Promise.reject(new Error("the agent fell over")),
        });
        expect(result.agent.message).toContain("the agent fell over");
        expect(result.applied).toEqual([]);
    });

    it("does not diagnose or repair a cancelled run", async () => {
        const result = await runRepairPass(evidence({ cancelled: true }), {
            scope: SCOPE,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said('{"cause":"x","edits":[{"path":"core.conf","text":"a: 1\\n"}]}'),
        });
        expect(result.agent.consulted).toBe(false);
        expect(result.summary).toContain("cancelled");
    });
});

describe("the guardrails, from inside the pass", () => {
    it("refuses an edit outside the config folder and writes nothing", async () => {
        const { options, files } = withDisk({});
        const result = await runRepairPass(evidence(), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said(
                '{"cause":"x","edits":[{"path":"../../.ssh/authorized_keys","text":"ssh-rsa AAAA\\n"}]}',
            ),
        });
        expect(result.applied).toEqual([]);
        expect(Object.keys(files)).toEqual([]);
        expect(result.agent.refused[0]?.reason).toContain("outside the config folder");
    });

    it("refuses a deletion and writes nothing", async () => {
        const { options, files } = withDisk({ [join(CONFIG_DIR, "core.conf")]: "a: 1\n" });
        const result = await runRepairPass(evidence(), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said('{"cause":"x","edits":[{"kind":"delete","path":"core.conf"}]}'),
        });
        expect(result.applied).toEqual([]);
        expect(files[join(CONFIG_DIR, "core.conf")]).toBe("a: 1\n");
        expect(result.agent.refused[0]?.reason).toContain("never deletes anything");
    });

    it("refuses a file inside the world, whatever the agent called it", async () => {
        const { options } = withDisk({});
        const result = await runRepairPass(evidence(), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said(
                `{"cause":"x","edits":[{"path":${JSON.stringify(join(resolve("/srv/saves/world"), "level.dat"))},"text":"anything"}]}`,
            ),
        });
        expect(result.applied).toEqual([]);
        expect(result.agent.refused).toHaveLength(1);
    });

    it("applies a good edit even when another one beside it was refused", async () => {
        const { options, files } = withDisk({ [join(CONFIG_DIR, "core.conf")]: "accept-download: false\n" });
        const result = await runRepairPass(evidence(), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said(
                '{"cause":"the download flag was off","edits":[' +
                    '{"path":"core.conf","text":"accept-download: true\\n"},' +
                    '{"path":"/etc/passwd","text":"nope"}]}',
            ),
        });
        expect(result.applied.map((change) => change.path)).toEqual(["core.conf"]);
        expect(files[join(CONFIG_DIR, "core.conf")]).toBe("accept-download: true\n");
        expect(result.agent.refused).toHaveLength(1);
    });
});

describe("applying a change", () => {
    it("shows the change as a diff and says why it was made", async () => {
        const { options } = withDisk({ [join(CONFIG_DIR, "core.conf")]: "accept-download: false\n" });
        const result = await runRepairPass(evidence(), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said(
                '{"cause":"the download flag was off","edits":[{"path":"core.conf","text":"accept-download: true\\n"}]}',
            ),
        });

        const change = result.applied[0];
        expect(change?.diff).toContain("-accept-download: false");
        expect(change?.diff).toContain("+accept-download: true");
        expect(change?.linesAdded).toBe(1);
        expect(change?.linesRemoved).toBe(1);
        expect(change?.why).toBe("the download flag was off");
        expect(result.summary).toContain("can be undone");
    });

    it("records the change in the config folder's history", async () => {
        const { options, recorded } = withDisk({ [join(CONFIG_DIR, "core.conf")]: "a: 1\n" });
        const result = await runRepairPass(evidence(), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said('{"cause":"x","edits":[{"path":"core.conf","text":"a: 2\\n"}]}'),
        });
        expect(recorded).toEqual([`${CONFIG_DIR}: Automatic repair: core.conf`]);
        expect(result.history?.recorded).toBe(true);
    });

    it("keeps the change when the history could not be written, and says so", async () => {
        const { options, files } = withDisk(
            { [join(CONFIG_DIR, "core.conf")]: "a: 1\n" },
            { recordHistory: () => Promise.reject(new Error("git is not installed")) },
        );
        const result = await runRepairPass(evidence(), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said('{"cause":"x","edits":[{"path":"core.conf","text":"a: 2\\n"}]}'),
        });
        expect(files[join(CONFIG_DIR, "core.conf")]).toBe("a: 2\n");
        expect(result.history?.recorded).toBe(false);
        expect(result.history?.message).toContain("git is not installed");
    });

    it("writes nothing when the proposed contents match what is already there", async () => {
        const { options, recorded } = withDisk({ [join(CONFIG_DIR, "core.conf")]: "a: 1\n" });
        const result = await runRepairPass(evidence(), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said('{"cause":"x","edits":[{"path":"core.conf","text":"a: 1\\n"}]}'),
        });
        expect(result.applied).toEqual([]);
        expect(recorded).toEqual([]);
        expect(result.agent.refused[0]?.reason).toContain("identical");
    });

    it("reports a write that failed rather than claiming the repair happened", async () => {
        const { options } = withDisk(
            { [join(CONFIG_DIR, "core.conf")]: "a: 1\n" },
            { writeText: () => Promise.reject(new Error("the disk is read only")) },
        );
        const result = await runRepairPass(evidence(), {
            ...options,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said('{"cause":"x","edits":[{"path":"core.conf","text":"a: 2\\n"}]}'),
        });
        expect(result.applied).toEqual([]);
        expect(result.agent.refused[0]?.reason).toContain("the disk is read only");
        expect(result.history).toBeNull();
    });

    it("changes nothing when it was run without permission to write", async () => {
        const result = await runRepairPass(evidence(), {
            scope: SCOPE,
            allowAgent: true,
            agent: INSTALLED,
            runAgent: said('{"cause":"x","edits":[{"path":"core.conf","text":"a: 2\\n"}]}'),
        });
        expect(result.applied).toEqual([]);
        expect(result.agent.message).toContain("without permission to write");
    });
});

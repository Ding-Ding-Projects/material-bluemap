/**
 * The last resort: handing an unexplained failure to a local coding agent.
 *
 * Reached only when `diagnose.ts` matched nothing. That ordering is the whole design -
 * everything with a known cause and a known fix is decided by code, and the agent gets the
 * residue - because a model asked "why did this fail?" always answers, and an answer is
 * not the same thing as a cause.
 *
 * ## What is sent, and what is not
 *
 * The prompt carries the evidence record, which has already had its credentials masked by
 * `evidence.ts`, and it carries the rules the agent must work inside. It does not carry
 * anything else on the machine, and the agent is told in the first paragraph not to go
 * looking. The forbidden list is imported from `guardrails.ts` rather than written here, so
 * the words in the prompt and the checks that enforce them cannot drift apart.
 *
 * Nothing an agent replies is trusted. The reply is parsed as a strict JSON document, and
 * every edit in it goes through `partitionEdits` before a file is opened. An agent that
 * replies with prose, with a proposal to delete something, or with a path outside the
 * config folder produces the same outcome as an agent that is not installed: nothing is
 * changed and the pass says so.
 *
 * ## Doing nothing is a correct answer
 *
 * The prompt asks for it explicitly, and {@link parseAgentReply} accepts a reply that
 * proposes no edits as a complete, successful reply. "I could not work out why this
 * failed" costs a person one sentence; a confident wrong edit costs them a config file and
 * their trust in the feature.
 */

import { execFileCommandRunner, type CommandOutput, type CommandRunner } from "../runtime/command.js";
import { describeEvidence, type RepairEvidence } from "./evidence.js";
import { FORBIDDEN_ACTIONS, type ProposedEdit, type RepairScope } from "./guardrails.js";

/** The CLI this looks for. Named once so the sentences and the probe agree. */
export const OPENCODE_COMMAND = "opencode";

/** How long the agent is given before the pass gives up on it. */
export const AGENT_TIMEOUT_MS = 180_000;

export interface AgentAvailability {
    readonly available: boolean;
    readonly command: string;
    readonly version: string | null;
    /** One sentence, whichever way it went, because both are shown. */
    readonly message: string;
}

/**
 * Whether a local coding agent is installed.
 *
 * Absence is the ordinary case and is reported as a plain fact rather than as an error:
 * most machines do not have `opencode`, the app works without it, and the only thing lost
 * is the last resort for a failure nothing else explained.
 */
export async function detectCodingAgent(
    runner: CommandRunner = execFileCommandRunner,
    command: string = OPENCODE_COMMAND,
): Promise<AgentAvailability> {
    const output = await runner(command, ["--version"], { timeoutMs: 15_000 });
    if (output.spawnError === "ENOENT") {
        return {
            available: false,
            command,
            version: null,
            message: `There is no '${command}' command on this account's PATH, so the automatic repair can only use the checks built into this app.`,
        };
    }
    if (!output.ok) {
        return {
            available: false,
            command,
            version: null,
            message: `'${command} --version' did not run${
                output.exitCode === null ? "" : ` (exit code ${String(output.exitCode)})`
            }, so it was not used.`,
        };
    }
    const version = output.stdout.trim().split(/\r?\n/)[0] ?? null;
    return {
        available: true,
        command,
        version: version === "" ? null : version,
        message: version === "" ? `${command} is installed.` : `${command} ${version} is installed.`,
    };
}

/** Runs one prompt and hands back whatever the agent said. Never rejects. */
export type RunAgent = (prompt: string) => Promise<CommandOutput>;

/**
 * The default runner: `opencode run <prompt>`, with the prompt as one argument.
 *
 * One argv element and no shell anywhere, so a config path with a quote, a semicolon or a
 * `&&` in it is text rather than a second command.
 */
export function opencodeRunner(
    runner: CommandRunner = execFileCommandRunner,
    command: string = OPENCODE_COMMAND,
    timeoutMs: number = AGENT_TIMEOUT_MS,
): RunAgent {
    return async (prompt) => await runner(command, ["run", prompt], { timeoutMs });
}

/* -------------------------------------------------------------------------- */
/* The prompt                                                                  */
/* -------------------------------------------------------------------------- */

/** The shape the agent is asked to answer in, quoted into the prompt verbatim. */
const REPLY_SHAPE = `{
  "cause": "one sentence naming the cause, or null if you cannot work it out",
  "confident": true,
  "edits": [
    { "path": "maps/overworld.conf", "text": "the complete new contents of the file" }
  ],
  "notes": "anything a person should know, or null"
}`;

/**
 * Builds the prompt for one unexplained failure.
 *
 * Written as instructions rather than as a conversation, and every constraint is stated as
 * a prohibition with a reason: an agent that is told *why* it may not run git is less
 * likely to decide this situation is the exception.
 */
export function buildRepairPrompt(evidence: RepairEvidence, scope: RepairScope): string {
    const worlds =
        scope.worldPaths.length === 0
            ? "  (none recorded)"
            : scope.worldPaths.map((path) => `  ${path}`).join("\n");

    return [
        "You are diagnosing why a BlueMap render or web server failed to start, inside a desktop app that",
        "has already checked every failure it knows how to recognise and found none of them. Your job is to",
        "read the evidence below and, only if it genuinely says why, propose a change to the BlueMap config.",
        "",
        "RULES. These are enforced by the app after you answer; an answer that breaks one is discarded whole.",
        ...FORBIDDEN_ACTIONS.map((rule) => `- ${rule}`),
        `- The only folder you may propose changes in is: ${scope.configDir}`,
        "- The only files you may propose changing are BlueMap's own config files: core.conf, webapp.conf,",
        "  webserver.conf, plugin.conf, maps/<name>.conf and storages/<name>.conf (or their .json spellings).",
        "- Give the complete new contents of each file you change, not a patch and not an excerpt.",
        "",
        "The Minecraft world folders below are named so you can recognise them in the evidence.",
        "They are read-only inputs. Never propose a change to anything inside them:",
        worlds,
        "",
        "ANSWER with one JSON document and nothing else, in a ```json fenced block, shaped like this:",
        "```json",
        REPLY_SHAPE,
        "```",
        "",
        'If the evidence does not say why this failed, answer with "cause": null and an empty "edits" list.',
        "That is a useful answer and it is the one that is wanted whenever you are guessing. A wrong edit to",
        "somebody's config is worse than no answer at all.",
        "",
        "EVIDENCE",
        "--------",
        describeEvidence(evidence),
    ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* The reply                                                                   */
/* -------------------------------------------------------------------------- */

export interface AgentProposal {
    /** The agent's one-sentence cause, or null when it did not work one out. */
    readonly cause: string | null;
    readonly confident: boolean;
    readonly edits: readonly ProposedEdit[];
    readonly notes: string | null;
}

export type AgentReply =
    | { readonly ok: true; readonly proposal: AgentProposal }
    | { readonly ok: false; readonly reason: string };

/** The last fenced JSON block, or the whole text when it is JSON on its own. */
function extractJson(text: string): string | null {
    const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
    const last = fences[fences.length - 1]?.[1];
    if (last !== undefined && last.trim() !== "") return last.trim();
    const trimmed = text.trim();
    return trimmed.startsWith("{") ? trimmed : null;
}

function optionalText(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Reads an agent's reply into a proposal, or refuses it.
 *
 * Strict on purpose. Everything below is a *refusal* rather than a repair of a malformed
 * reply: an agent that answered in prose has not answered this question, and inferring a
 * file edit from prose is exactly the guessing this whole module is arranged to avoid.
 */
export function parseAgentReply(text: string): AgentReply {
    const json = extractJson(text);
    if (json === null) {
        return {
            ok: false,
            reason: "The coding agent did not answer with a JSON document, so nothing it said was acted on.",
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        return {
            ok: false,
            reason: `The coding agent's answer was not valid JSON (${
                error instanceof Error ? error.message : String(error)
            }), so nothing it said was acted on.`,
        };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return {
            ok: false,
            reason: "The coding agent's answer was not a JSON object, so nothing it said was acted on.",
        };
    }

    const document = parsed as Record<string, unknown>;
    const rawEdits = document["edits"];
    if (rawEdits !== undefined && !Array.isArray(rawEdits)) {
        return { ok: false, reason: "The coding agent's answer listed its edits as something other than a list." };
    }

    const edits: ProposedEdit[] = [];
    for (const [index, entry] of (rawEdits ?? []).entries()) {
        if (typeof entry !== "object" || entry === null) {
            return {
                ok: false,
                reason: `Edit ${String(index + 1)} in the coding agent's answer is not a file with a path and contents.`,
            };
        }
        const edit = entry as Record<string, unknown>;
        const path = edit["path"];
        const contents = edit["text"] ?? edit["contents"];
        const kind = edit["kind"];
        if (typeof path !== "string" || path.trim() === "") {
            return { ok: false, reason: `Edit ${String(index + 1)} in the coding agent's answer names no file.` };
        }
        // A `delete` is carried through rather than dropped, so the guard refuses it by
        // name and the person is told the agent asked for one. Silently ignoring it would
        // hide the one thing worth knowing about that reply.
        edits.push({
            kind: kind === "delete" ? "delete" : "write",
            path,
            ...(typeof contents === "string" ? { text: contents } : {}),
        });
    }

    return {
        ok: true,
        proposal: {
            cause: optionalText(document["cause"]),
            confident: document["confident"] === true,
            edits,
            notes: optionalText(document["notes"]),
        },
    };
}

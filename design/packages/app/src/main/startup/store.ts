import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
    redactStartupText,
    toStartupIssue,
    type StartupIssue,
    type StartupIssueInput,
} from "./model.js";

export type StartupExportFormat = "json" | "markdown";

export interface StartupDiagnosticsSnapshot {
    readonly sessionId: string;
    readonly current: readonly StartupIssue[];
    readonly history: readonly StartupIssue[];
    readonly storageWarning: string | null;
}

export class StartupIssueStore {
    readonly sessionId = randomUUID();
    readonly file: string;
    private readonly currentIssues: StartupIssue[] = [];
    private storageWarning: string | null = null;
    private pending: Promise<void> = Promise.resolve();

    constructor(readonly root: string) {
        this.file = join(root, "startup-diagnostics.jsonl");
    }

    record(input: StartupIssueInput): StartupIssue {
        const issue = toStartupIssue(this.sessionId, input);
        this.currentIssues.push(issue);
        this.pending = this.pending.then(async () => {
            try {
                await mkdir(this.root, { recursive: true });
                await appendFile(this.file, `${JSON.stringify(issue)}\n`, { encoding: "utf8" });
            } catch (error) {
                this.storageWarning = `Startup diagnostics could not be saved: ${redactStartupText(error)}`;
            }
        });
        return issue;
    }

    async flush(): Promise<void> {
        await this.pending;
    }

    async snapshot(limit = 200): Promise<StartupDiagnosticsSnapshot> {
        await this.flush();
        let history: StartupIssue[] = [];
        try {
            const source = await readFile(this.file, "utf8");
            history = source
                .split(/\r?\n/u)
                .filter((line) => line.trim().length > 0)
                .flatMap((line) => {
                    try {
                        return [JSON.parse(line) as StartupIssue];
                    } catch {
                        return [];
                    }
                })
                .slice(-limit);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "ENOENT") {
                this.storageWarning = `Startup diagnostics could not be read: ${redactStartupText(error)}`;
            }
        }
        return {
            sessionId: this.sessionId,
            current: [...this.currentIssues],
            history,
            storageWarning: this.storageWarning,
        };
    }

    async format(format: StartupExportFormat): Promise<string> {
        const snapshot = await this.snapshot();
        if (format === "json") return `${JSON.stringify(snapshot, null, 2)}\n`;

        const lines = [
            "# Worldlens startup diagnostics",
            "",
            `Session: ${snapshot.sessionId}`,
            `Exported: ${new Date().toISOString()}`,
            "",
        ];
        if (snapshot.storageWarning !== null) {
            lines.push(`> Warning: ${snapshot.storageWarning}`, "");
        }
        if (snapshot.history.length === 0) {
            lines.push("No startup issues were recorded.", "");
        } else {
            for (const issue of snapshot.history) {
                lines.push(
                    `## ${issue.title}`,
                    "",
                    `- Time: ${issue.occurredAt}`,
                    `- Category: ${issue.category}`,
                    `- Phase: ${issue.phase}`,
                    `- Recoverable: ${issue.recoverable ? "yes" : "no"}`,
                    `- Security boundary: ${issue.securityBoundary ? "yes" : "no"}`,
                    "",
                    issue.message,
                    "",
                );
                if (issue.detail !== null) lines.push("```text", issue.detail, "```", "");
            }
        }
        return `${lines.join("\n").trimEnd()}\n`;
    }

    async export(path: string, format: StartupExportFormat): Promise<void> {
        await writeFile(path, await this.format(format), { encoding: "utf8" });
    }
}

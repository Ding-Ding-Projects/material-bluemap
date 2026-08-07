import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const liveRenderSpeed: Article = {
    id: "live-render-speed",
    title: "Adjusting a render while it runs",
    summary:
        "A live 1-5 control for real process priority or Docker CPU quota, throughput evidence beside it, and an explicit restart that carries both deferred thread fields through the packaged bridge.",
    category: "application",
    status: "shipped",
    statusNote:
        "The live routes, packaged preload seam, restart request and local/Docker config fields have focused automated proof; a packaged hidden-desktop interaction remains separate runtime evidence.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "A local render changes the live JVM process priority and reads the granted priority back instead of assuming the operating system accepted it.",
                        "A Docker render changes the running container's CPU quota. GitHub-runner and SSH routes are disabled with their exact reason rather than left clickable and inert.",
                        "Throughput reports recent percentage-points per minute from the engine's real progress samples.",
                        "Restart at this level cancels, waits for the render to end, then relaunches with both render-thread-count and render-thread-priority from the selected level.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "definitions",
                    items: [
                        { term: "Live click", description: "One request against the render in flight; it is not persisted as a setting." },
                        { term: "Deferred restart", description: "A new render request carrying renderThreadCount and renderThreadPriority through UI, preload and main-process contracts." },
                        { term: "Priority bound", description: "render-thread-priority must be an integer from 1 through 10 before a config is accepted." },
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "An exited process, stopped container or unknown render id returns a structured refusal without claiming a change landed.",
                        "A refused priority raise reports the level actually granted.",
                        "A rejected bridge promise becomes the same visible refusal shape rather than an unhandled rejection.",
                        "A stale packaged preload missing adjustRenderSpeed is rejected by the UI resolver before an unusable control is presented.",
                        "An invalid deferred priority is refused before a partial replacement config is accepted.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "A live request addresses only the process id or container name this application started. It writes no render config. Only an explicit restart creates a replacement config through the same bounded path and validation as an ordinary launch.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "speedControl.test.ts proves the priority and quota tables and their refusal shapes.",
                        "renderRun.test.ts proves bridge routing and cancel-wait-relaunch with both deferred fields.",
                        "liveSpeedBridge.test.ts loads the real preload, captures its exposed object and drives that exact object through the real UI resolver.",
                        "config.test.ts proves local and Docker output write both fields and reject an invalid priority.",
                        "projectSurfaceSizing.test.ts keeps the control targets and labels usable at constrained widths.",
                    ],
                },
            ],
        },
    ],
    suggested: [
        { articleId: "render-console", reason: "The live progress and log surface beside this control." },
        { articleId: "docker-and-local", reason: "How the two adjustable routes are launched." },
        { articleId: "remote-render", reason: "Why the SSH route does not yet expose this live lever." },
    ],
    sources: [
        { label: "docs/live-render-speed.md", href: repoFile("docs/live-render-speed.md") },
        { label: "renderRun.ts", href: repoFile("design/packages/ui/src/components/world/renderRun.ts") },
        { label: "liveSpeedBridge.test.ts", href: repoFile("design/packages/app/src/preload/liveSpeedBridge.test.ts") },
    ],
};

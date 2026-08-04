/**
 * A recording fake of the GitHub API, for tests. Never shipped behaviour.
 *
 * Every test in this folder runs against this rather than the network, and that is not
 * only about speed. The interesting cases here are ones nobody can produce on demand: a
 * run that is queued and then in progress and then failed, an artifact whose published
 * digest does not match its bytes, a release whose asset somebody deleted between two
 * syncs. Scripting them is the only way they get tested at all.
 *
 * ## Recording, not just answering
 *
 * Every request is kept, with its method, URL and body. That is what lets the tests assert
 * the **negative** properties, which are the ones that matter most in this feature: that
 * an unchanged world produced no upload, that a failed run produced no artifact download,
 * that a refusal happened before anything was dispatched. A stub that only answered could
 * not tell "it did not call that" from "it called it and ignored the answer".
 *
 * ## Real `Response` objects
 *
 * Replies are built with the platform's own `Response`, so `.json()`, `.text()`,
 * `.arrayBuffer()` and - the one that matters for the artifact download - `.body` as a
 * real web stream all behave exactly as they do against the network. A hand-rolled
 * response object would pass tests that the real `downloadToFile` would fail on, because
 * it pipes `.body` rather than reading it whole.
 */

export interface RecordedCall {
    readonly method: string;
    readonly url: string;
    readonly body: string | null;
}

export interface FakeReply {
    readonly status: number;
    /** Serialized as JSON, with a JSON content type. */
    readonly json?: unknown;
    /** Sent as-is. Use for a log body. */
    readonly text?: string;
    /** Sent as-is. Use for an artifact zip. */
    readonly bytes?: Uint8Array;
}

interface Route {
    readonly method: string;
    readonly match: (url: string) => boolean;
    readonly replies: FakeReply[];
}

function matcher(pattern: string | RegExp): (url: string) => boolean {
    return typeof pattern === "string" ? (url) => url.includes(pattern) : (url) => pattern.test(url);
}

export class RecordingGitHub {
    readonly calls: RecordedCall[] = [];
    readonly #routes: Route[] = [];

    /**
     * Answers `pattern` with each reply in turn, repeating the last one for ever.
     *
     * The repetition is what makes a poll loop expressible: `on("GET", "/runs/1",
     * queued, inProgress, completed)` describes a run that finishes on the third read and
     * then stays finished however many times it is asked again.
     */
    on(method: string, pattern: string | RegExp, ...replies: FakeReply[]): this {
        this.#routes.push({ method: method.toUpperCase(), match: matcher(pattern), replies: [...replies] });
        return this;
    }

    /** How many times a URL matching `pattern` was requested. */
    countOf(pattern: string | RegExp, method?: string): number {
        const match = matcher(pattern);
        return this.calls.filter(
            (call) => match(call.url) && (method === undefined || call.method === method.toUpperCase()),
        ).length;
    }

    /** True when nothing matching `pattern` was ever requested. */
    never(pattern: string | RegExp): boolean {
        return this.countOf(pattern) === 0;
    }

    readonly fetch = (url: string, init?: RequestInit): Promise<Response> => {
        const method = (init?.method ?? "GET").toUpperCase();
        this.calls.push({ method, url, body: typeof init?.body === "string" ? init.body : null });

        const route = this.#routes.find((candidate) => candidate.method === method && candidate.match(url));
        if (route === undefined) {
            // A 404 rather than a thrown error, because an unrouted call is a test that has
            // not said what should happen there - and a 404 is what the code under test
            // would see from a repository it cannot reach, which is a real path it handles.
            return Promise.resolve(
                new Response(JSON.stringify({ message: `no route for ${method} ${url}` }), {
                    status: 404,
                    headers: { "content-type": "application/json" },
                }),
            );
        }

        const reply = route.replies.length > 1 ? (route.replies.shift() as FakeReply) : (route.replies[0] as FakeReply);
        if (reply === undefined) {
            return Promise.resolve(new Response(null, { status: 500 }));
        }
        return Promise.resolve(toResponse(reply));
    };
}

function toResponse(reply: FakeReply): Response {
    if (reply.bytes !== undefined) {
        return new Response(reply.bytes, {
            status: reply.status,
            headers: { "content-type": "application/zip" },
        });
    }
    if (reply.text !== undefined) {
        return new Response(reply.text, {
            status: reply.status,
            headers: { "content-type": "text/plain" },
        });
    }
    if (reply.json !== undefined) {
        return new Response(JSON.stringify(reply.json), {
            status: reply.status,
            headers: { "content-type": "application/json" },
        });
    }
    return new Response(null, { status: reply.status });
}

/* -------------------------------------------------------------------------- */
/* Shapes, so a test says what it means rather than restating GitHub's JSON    */
/* -------------------------------------------------------------------------- */

export function repositoryJson(options: {
    owner: string;
    repo: string;
    isPrivate: boolean;
    canWrite?: boolean;
    defaultBranch?: string;
}): unknown {
    return {
        full_name: `${options.owner}/${options.repo}`,
        name: options.repo,
        owner: { login: options.owner },
        private: options.isPrivate,
        permissions: { push: options.canWrite ?? true },
        html_url: `https://github.test/${options.owner}/${options.repo}`,
        default_branch: options.defaultBranch ?? "main",
    };
}

export function runJson(options: {
    id: number;
    status: string;
    conclusion?: string | null;
    createdAt?: string;
    headSha?: string;
}): unknown {
    return {
        id: options.id,
        run_number: options.id,
        html_url: `https://github.test/runs/${String(options.id)}`,
        status: options.status,
        conclusion: options.conclusion ?? null,
        created_at: options.createdAt ?? "2026-08-04T10:00:00Z",
        updated_at: options.createdAt ?? "2026-08-04T10:00:00Z",
        head_sha: options.headSha ?? "abcdef0123456789abcdef0123456789abcdef01",
        event: "workflow_dispatch",
    };
}

export function jobJson(options: {
    id: number;
    name: string;
    status: string;
    conclusion?: string | null;
}): unknown {
    return {
        id: options.id,
        name: options.name,
        status: options.status,
        conclusion: options.conclusion ?? null,
        html_url: `https://github.test/job/${String(options.id)}`,
        started_at: "2026-08-04T10:00:10Z",
        completed_at: options.conclusion === undefined ? null : "2026-08-04T10:30:00Z",
    };
}

export function artifactJson(options: {
    id: number;
    name: string;
    bytes: number;
    digest?: string | null;
    expired?: boolean;
}): unknown {
    return {
        id: options.id,
        name: options.name,
        size_in_bytes: options.bytes,
        expired: options.expired ?? false,
        digest: options.digest ?? null,
        archive_download_url: `https://api.test/artifacts/${String(options.id)}/zip`,
    };
}

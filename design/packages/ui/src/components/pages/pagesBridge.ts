/**
 * The seam between the Pages-hosting surface and the main process.
 *
 * Every type here is a structural mirror of the one the Electron preload exposes on
 * `window.materialBluemap`, **restated rather than imported**, for the same reason
 * `ciRenderBridge.ts` and `backupBridge.ts` restate theirs: this package compiles and runs in
 * three places and only one of them has a preload. Importing across that boundary would also
 * drag `node:fs`, a git driver and a process spawner into the renderer's bundle, which is
 * exactly what the preload was split out to prevent.
 *
 * Nothing here invents a capability. {@link resolvePagesBridge} returns `null` when the four
 * methods a publish cannot happen without are missing, and the rest are probed one at a time
 * and reported as flags, so a surface can say "this build cannot take a site down" rather than
 * drawing a button that does nothing.
 *
 * ## No credential crosses this, in either direction
 *
 * There is no token on any of these types and no channel that could carry one. Authentication
 * is `gh`'s own credential store, held in the main process's child processes and never read.
 * When `gh` is signed out the surface learns it from a report that names the command to run in
 * a terminal, because `gh auth login` cannot be driven from inside an application at all.
 */

/* -------------------------------------------------------------------------- */
/* What the render and the site look like                                     */
/* -------------------------------------------------------------------------- */

export interface PagesCandidate {
    readonly renderId: string;
    readonly webRoot: string;
    readonly maps: readonly string[];
    /** Why this render could not be read, when that is the case. Listed anyway. */
    readonly problem: string | null;
}

export interface PagesOwner {
    readonly login: string;
    readonly kind: "user" | "organization";
}

export interface StaticHostMap {
    readonly id: string;
    readonly missing: readonly string[];
}

export interface StaticHostReport {
    readonly servable: boolean;
    readonly changedSettings: boolean;
    readonly addedNoJekyll: boolean;
    readonly maps: readonly StaticHostMap[];
    readonly totalBytes: number;
    readonly fileCount: number;
    readonly oversizedFiles: readonly { readonly path: string; readonly bytes: number }[];
    readonly overSoftLimit: boolean;
    readonly notes: readonly string[];
}

/** What `gh` is on this machine, as three separate remedies rather than one dead end. */
export type GhAvailability = "not-installed" | "signed-out" | "ready";

export interface GhStatus {
    readonly availability: GhAvailability;
    readonly version: string | null;
    /** The account `gh` named, when it named one. Never a token. */
    readonly account: string | null;
    readonly host: string | null;
    readonly message: string;
}

export interface PagesRepositoryReport {
    readonly fullName: string;
    readonly exists: boolean;
    readonly private: boolean | null;
    readonly canWrite: boolean | null;
    readonly htmlUrl: string | null;
    readonly branchExists: boolean;
    /**
     * Null when the branch does not exist, so there is nothing to be somebody else's.
     *
     * `false` is the one that stops a publish: a branch this application cannot prove it
     * wrote is a branch it will not replace.
     */
    readonly branchIsOurs: boolean | null;
    readonly branchMarker: PagesMarker | null;
    readonly failure: string | null;
}

export interface PagesMarker {
    readonly tool: string;
    readonly version: number;
    readonly renderId: string;
    readonly maps: readonly string[];
    readonly publishedAt: string;
}

export interface PagesPreflight {
    readonly renderId: string;
    readonly webRoot: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    /** A preview: it was produced with writing switched off and touched nothing. */
    readonly site: StaticHostReport | null;
    readonly siteFailure: string | null;
    readonly gh: GhStatus;
    readonly gitVersion: string | null;
    readonly repository: PagesRepositoryReport | null;
    /** Non-empty means publishing must not be started. */
    readonly blockers: readonly string[];
    readonly warnings: readonly string[];
    readonly published: PagesRecord | null;
}

export interface PagesRecord {
    readonly version: number;
    readonly renderId: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly url: string | null;
    readonly commit: string | null;
    readonly status: PagesSiteStatus;
    readonly verified: boolean;
    readonly publishedAt: string;
}

/**
 * What the site is, said in GitHub's own words - with one exception.
 *
 * `live` is not GitHub's word and is never taken from it. It is set only after a request to
 * the published URL answered 200, because "GitHub says built" and "a browser can open it" are
 * two claims and only the second is what somebody is about to send to a friend.
 */
export type PagesSiteStatus = "live" | "built" | "building" | "queued" | "errored" | "unknown";

export type PagesPhase =
    | "preparing"
    | "checking"
    | "staging"
    | "pushing"
    | "enabling"
    | "waiting"
    | "verifying"
    | "finished";

export interface PagesFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    /** True when running `gh auth login` in a terminal is the thing that would fix it. */
    readonly needsGhSignIn: boolean;
}

export interface PagesPublishReport {
    readonly renderId: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly repositoryUrl: string;
    readonly commit: string;
    /** True only once GitHub showed that branch's head as this commit. */
    readonly pushVerified: boolean;
    readonly status: PagesSiteStatus;
    readonly url: string | null;
    /** True only when a request to the published URL answered 200. */
    readonly verified: boolean;
    readonly httpStatus: number | null;
    readonly site: StaticHostReport;
    readonly notes: readonly string[];
}

export interface PagesStopReport {
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly pagesDisabled: boolean;
    readonly branchDeleted: boolean;
    readonly notes: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Requests, results and events                                               */
/* -------------------------------------------------------------------------- */

export interface PagesTarget {
    readonly renderId: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch?: string;
}

export interface PagesPublishRequest extends PagesTarget {
    readonly visibility?: "public" | "private";
    /** Refused without it, in the main process rather than only here. */
    readonly acknowledgePublish?: boolean;
}

export type PagesResult =
    | { readonly ok: true; readonly report: PagesPublishReport; readonly durationMs: number }
    | { readonly ok: false; readonly failure: PagesFailure };

export type PagesStopResult =
    | { readonly ok: true; readonly report: PagesStopReport }
    | { readonly ok: false; readonly failure: PagesFailure };

export type PagesEvent =
    | { readonly type: "started"; readonly renderId: string; readonly target: string; readonly at: string }
    | { readonly type: "phase"; readonly renderId: string; readonly phase: PagesPhase; readonly at: string }
    | {
          readonly type: "progress";
          readonly renderId: string;
          readonly phase: PagesPhase;
          readonly description: string;
          readonly done: number;
          readonly total: number;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly renderId: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly renderId: string;
          readonly report: PagesPublishReport;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly renderId: string; readonly failure: PagesFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly renderId: string; readonly at: string };

export type Answer<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly message: string };

/* -------------------------------------------------------------------------- */
/* The bridge                                                                 */
/* -------------------------------------------------------------------------- */

export interface PagesBridge {
    listRenders(): Promise<Answer<readonly PagesCandidate[]>>;
    preflight(request: PagesTarget): Promise<Answer<PagesPreflight>>;
    publish(request: PagesPublishRequest): Promise<PagesResult>;
    onEvent(listener: (event: PagesEvent) => void): () => void;

    listOwners(): Promise<Answer<readonly PagesOwner[]>>;
    listPublished(): Promise<Answer<readonly PagesRecord[]>>;
    /** Turns Pages off and deletes the publishing branch. Destructive, and gated in the screen. */
    removeHosting(request: PagesTarget): Promise<PagesStopResult>;
    cancel(renderId: string): Promise<boolean>;

    /** True when the accounts this sign-in can publish under can be listed. */
    readonly canListOwners: boolean;
    /** True when past publishes can be listed, which is what makes a site findable again. */
    readonly canListPublished: boolean;
    /** True when a published site can actually be taken down from here. */
    readonly canStop: boolean;
    /** True when a publish in flight can be stopped. */
    readonly canCancel: boolean;
}

/** The shape a preload is probed against, one method at a time. */
type Host = Partial<{
    pagesRenders: () => Promise<Answer<readonly PagesCandidate[]>>;
    pagesOwners: () => Promise<Answer<readonly PagesOwner[]>>;
    pagesPreflight: (request: PagesTarget) => Promise<Answer<PagesPreflight>>;
    publishPages: (request: PagesPublishRequest) => Promise<PagesResult>;
    stopPagesHosting: (request: PagesTarget) => Promise<PagesStopResult>;
    cancelPagesPublish: (renderId: string) => Promise<boolean>;
    activePagesPublishes: () => Promise<readonly string[]>;
    publishedPages: () => Promise<Answer<readonly PagesRecord[]>>;
    onPagesEvent: (listener: (event: PagesEvent) => void) => () => void;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The bridge, or `null` when this build cannot publish a map at all.
 *
 * All or nothing for the four it cannot happen without: listing the renders there are,
 * reading what a publish would do, doing it, and hearing about it while it happens. A bridge
 * carrying `publishPages` and no `onPagesEvent` would present a button that begins minutes of
 * invisible work over tens of thousands of files, and one with no `pagesPreflight` could not
 * tell somebody that the branch they are about to replace belongs to somebody else. Neither is
 * a degradation worth shipping.
 */
export function resolvePagesBridge(): PagesBridge | null {
    const host = (globalThis as { materialBluemap?: Host }).materialBluemap;
    if (host === undefined) return null;

    const { pagesRenders, pagesPreflight, publishPages, onPagesEvent } = host;
    if (
        !isFunction(pagesRenders) ||
        !isFunction(pagesPreflight) ||
        !isFunction(publishPages) ||
        !isFunction(onPagesEvent)
    ) {
        return null;
    }

    const canListOwners = isFunction(host.pagesOwners);
    const canListPublished = isFunction(host.publishedPages);
    const canStop = isFunction(host.stopPagesHosting);
    const canCancel = isFunction(host.cancelPagesPublish);

    const unavailable = (what: string): Answer<never> => ({
        ok: false,
        message: `This build cannot ${what}. The desktop application is what does it.`,
    });

    return {
        listRenders: () => pagesRenders(),
        preflight: (request) => pagesPreflight(request),
        publish: (request) => publishPages(request),
        onEvent: (listener) => onPagesEvent(listener),

        listOwners: () => {
            const call = host.pagesOwners;
            return isFunction(call)
                ? call()
                : Promise.resolve(unavailable("list the accounts you can publish under"));
        },
        listPublished: () => {
            const call = host.publishedPages;
            return isFunction(call) ? call() : Promise.resolve(unavailable("list published maps"));
        },
        removeHosting: (request) => {
            const call = host.stopPagesHosting;
            return isFunction(call)
                ? call(request)
                : Promise.resolve({
                      ok: false,
                      failure: {
                          code: "unsupported",
                          message:
                              "This build cannot take a published site down. The desktop " +
                              "application is what does it.",
                          detail: null,
                          needsGhSignIn: false,
                      },
                  });
        },
        // False rather than a rejection: "this build cannot stop a publish" and "there was
        // nothing to stop" both leave it running, and the surface says which from `canCancel`.
        cancel: (renderId) => {
            const call = host.cancelPagesPublish;
            return isFunction(call) ? call(renderId) : Promise.resolve(false);
        },

        canListOwners,
        canListPublished,
        canStop,
        canCancel,
    };
}

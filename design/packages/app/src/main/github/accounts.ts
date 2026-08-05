/**
 * More than one GitHub account signed in at once, on top of the single-account machinery
 * in `session.ts` and `storage.ts` rather than instead of it.
 *
 * ## The shape of the compromise
 *
 * Every existing "who is signed in" caller - the `github:status`/`github:signIn`/
 * `github:signOut`/etc. IPC channels, and every main-process consumer that was handed a
 * `GitHubSession`-shaped object (downloads, backups, CI render, world sources) - keeps
 * working completely unchanged. They all resolve to whichever account is **active**. This
 * class implements the exact same public surface `GitHubSession` does (`status`,
 * `accessToken`, `cancelSignIn`, `startDeviceSignIn`, `signInWithToken`, `checkRepository`,
 * `signOut`) so a caller holding one of these instead of a bare `GitHubSession` cannot
 * tell the difference. `GitHubIpc.session` in `ipc.ts` is one of these now.
 *
 * On top of that, four new capabilities are additive: list every stored account, remove
 * one specifically (not necessarily the active one), switch which one is active, and
 * force a specific one's token to be renewed. None of them rename or repurpose a channel
 * that already existed; see `ipc.ts` for where they are wired.
 *
 * ## One credential file per account, never one shared file
 *
 * Each account's secret lives in its own `TokenStore`, at its own file
 * (`github-credential-<id>.json`), encrypted with the same `safeStorage` this application
 * always used. That is what "stored separately, under a per-account key" means here:
 * `safeStorage` has no notion of named keys, so a private file per account is the nearest
 * thing to one, and it is also what keeps `TokenStore`'s own refusal behaviour - never
 * write a token in the clear when there is no working credential store - true for every
 * account rather than only the first one.
 *
 * A second file, `github-accounts.json`, holds nothing sensitive at all: the list of
 * known account ids and which one is active. Each account's richer metadata - login,
 * scopes, expiry - is read back from that account's own `TokenStore.metadata()`, on
 * demand, rather than duplicated into the registry, so there is exactly one place that
 * can go stale.
 *
 * ## Why sign-in still goes through a staging file
 *
 * An account's id is derived from who the token turns out to belong to
 * (`deriveAccountId`), and that is not known until the token has been verified against
 * the API - which is exactly what `GitHubSession.startDeviceSignIn`/`signInWithToken`
 * already do, unchanged. So a sign-in first runs the ordinary single-account flow against
 * a throwaway file, and only once it has succeeded does `#finalize` derive the real id and
 * move the credential into that account's permanent file (or, when there is nowhere safe
 * to write it, simply keeps using the in-memory session exactly as the single-account path
 * always has). This reuses `GitHubSession` and `TokenStore` completely unmodified rather
 * than re-implementing device-flow verification a second time.
 */

import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { GitHubClient } from "./config.js";
import { REQUIRED_SCOPES } from "./config.js";
import type { FetchLike, SleepLike } from "./deviceFlow.js";
import { accountFromRecord, GitHubSession } from "./session.js";
import type {
    AccessTokenResult,
    GitHubAccount,
    GitHubAuthEvent,
    GitHubFailure,
    GitHubStatus,
    SignInResult,
    SignOutResult,
} from "./session.js";
import type { SafeStorageLike, StoredCredential } from "./storage.js";
import { TokenStore } from "./storage.js";
import type { RepositoryAccess } from "./token.js";

/** The file inside the accounts directory holding the (secret-free) account index. */
const ACCOUNTS_REGISTRY_FILE = "github-accounts.json";

/** Bumped if the registry's shape changes in a way an older reader would misread. */
const ACCOUNTS_REGISTRY_VERSION = 1;

/**
 * Matches exactly the staging filenames `#pendingFile()` hands out
 * (`github-credential-pending-<uuid>.json`), and nothing an account's own permanent file
 * or the registry file could ever be named.
 */
const PENDING_FILE_PATTERN = /^github-credential-pending-.+\.json$/;

interface AccountsRegistryState {
    readonly version: number;
    readonly ids: readonly string[];
    readonly activeId: string | null;
}

function emptyRegistry(): AccountsRegistryState {
    return { version: ACCOUNTS_REGISTRY_VERSION, ids: [], activeId: null };
}

function parseRegistry(raw: string): AccountsRegistryState | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record["version"] !== ACCOUNTS_REGISTRY_VERSION) return null;

    const rawIds = record["ids"];
    const ids = Array.isArray(rawIds)
        ? rawIds.filter((entry): entry is string => typeof entry === "string")
        : [];

    const rawActive = record["activeId"];
    const activeId = typeof rawActive === "string" && ids.includes(rawActive) ? rawActive : null;

    return { version: ACCOUNTS_REGISTRY_VERSION, ids, activeId };
}

/**
 * The subset of the public API `GitHubSession` and `GitHubAccountsController` share.
 *
 * Every existing main-process consumer that was handed a `GitHubSession` only ever calls
 * through this surface (see `download/token.ts`'s structurally-typed `SignedInSession`,
 * and `main/index.ts`'s use of `github.session`), so a value of this type is a drop-in
 * replacement wherever a plain `GitHubSession` used to be threaded through.
 */
export interface GitHubSessionLike {
    status(): GitHubStatus;
    accessToken(): Promise<AccessTokenResult>;
    cancelSignIn(): boolean;
    startDeviceSignIn(options?: { useOAuthFallback?: boolean }): Promise<SignInResult>;
    signInWithToken(rawToken: string): Promise<SignInResult>;
    checkRepository(owner: string, repo: string): Promise<RepositoryAccess>;
    signOut(): Promise<SignOutResult>;
}

/** One stored account, as shown to the interface - the same facts `GitHubAccount` carries. */
export interface AccountSummary extends GitHubAccount {
    readonly id: string;
    /** True for exactly the account every legacy single-account channel resolves to. */
    readonly active: boolean;
}

export interface AccountsList {
    readonly accounts: readonly AccountSummary[];
    readonly activeId: string | null;
}

/** `signOut()`'s existing result, with the one fact multi-account adds: who is signed in now. */
export interface AccountSignOutResult extends SignOutResult {
    /** The account this fell back to, or null when nobody else was signed in. */
    readonly fallbackAccount: GitHubAccount | null;
}

export interface RemoveAccountResult {
    readonly removed: boolean;
    readonly wasActive: boolean;
    readonly newActiveId: string | null;
    readonly revoked: boolean;
    readonly reason: string | null;
    readonly manageUrl: string | null;
    readonly fallbackAccount: GitHubAccount | null;
}

export interface SetActiveAccountResult {
    readonly ok: boolean;
    readonly activeId: string | null;
    readonly account: GitHubAccount | null;
    readonly reason: string | null;
}

export interface RefreshAccountResult {
    readonly ok: boolean;
    /** Refreshed metadata for the account. Never the token itself - that never crosses IPC. */
    readonly account: GitHubAccount | null;
    readonly failure: GitHubFailure | null;
}

export interface GitHubAccountsControllerOptions {
    /** Where every account's files live. Created on first write. */
    readonly directory: string;
    readonly safeStorage: SafeStorageLike;
    readonly fetch: FetchLike;
    readonly sleep: SleepLike;
    readonly client: () => GitHubClient | null;
    readonly oauthFallbackClient?: (() => GitHubClient | null) | undefined;
    readonly clientSecret?: (() => string | null) | undefined;
    readonly openExternal: (url: string) => Promise<boolean>;
    readonly onEvent?: ((event: GitHubAuthEvent) => void) | undefined;
    readonly now?: (() => number) | undefined;
    readonly apiBase?: string | undefined;
    readonly oauthBase?: string | undefined;
    readonly requiredScopes?: readonly string[] | undefined;
    readonly maxNetworkRetries?: number | undefined;
}

/**
 * The id an account is stored and referred to by everywhere outside this file.
 *
 * Keyed on the numeric GitHub user id when one is known - a real identity, stable across
 * a login rename - and on the lowercased login only for the rare case there is none (a
 * pasted token GitHub could not attach an id to). Two sign-ins that turn out to be the
 * same GitHub account, by whichever method, land on the same id and the same file rather
 * than silently duplicating it.
 */
export function deriveAccountId(identity: {
    readonly login: string;
    readonly userId: number | null;
}): string {
    const base = identity.userId !== null ? `u${identity.userId}` : identity.login.toLowerCase();
    const safe = base.replace(/[^a-z0-9._-]/gi, "-");
    return safe === "" ? "account" : safe;
}

/**
 * Brings an existing single-account sign-in forward into the multi-account store.
 *
 * A no-op the moment the accounts directory already has a registry file - migration only
 * ever runs once, on the first launch after an update, never overwriting anything the
 * multi-account path has since written. Leaves the old file exactly where it was either
 * way: there is nothing to gain from deleting it, and copying rather than moving is what
 * makes a bug here a missed account rather than a lost one.
 */
export function migrateLegacyAccount(options: {
    readonly legacyFile: string;
    readonly directory: string;
    readonly safeStorage: SafeStorageLike;
}): void {
    const registryFile = join(options.directory, ACCOUNTS_REGISTRY_FILE);
    if (existsSync(registryFile) || !existsSync(options.legacyFile)) return;

    const legacyStore = new TokenStore({ file: options.legacyFile, safeStorage: options.safeStorage });
    const read = legacyStore.read();
    if (!read.ok) return;

    const account = accountFromRecord(read.record);
    if (account === null) return;
    const id = deriveAccountId(account);

    const meta: Omit<StoredCredential, "storedAt"> = {
        kind: read.record.kind,
        login: read.record.login,
        userId: read.record.userId,
        scopes: read.record.scopes,
        scopesReported: read.record.scopesReported,
        clientId: read.record.clientId,
        expiresAt: read.record.expiresAt,
        refreshTokenExpiresAt: read.record.refreshTokenExpiresAt,
    };
    const newStore = new TokenStore({
        file: join(options.directory, `github-credential-${id}.json`),
        safeStorage: options.safeStorage,
    });
    const saved = newStore.save(read.secret, meta);
    if (!saved.ok) return;

    mkdirSync(options.directory, { recursive: true });
    const state: AccountsRegistryState = { version: ACCOUNTS_REGISTRY_VERSION, ids: [id], activeId: id };
    const staging = `${registryFile}.writing`;
    writeFileSync(staging, `${JSON.stringify(state, null, 4)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(staging, registryFile);
}

export class GitHubAccountsController implements GitHubSessionLike {
    readonly #options: GitHubAccountsControllerOptions;
    readonly #directory: string;
    readonly #registryFile: string;
    /** Account ids that are durable - each one has a real file on disk. */
    #registryIds: string[];
    /** Mirrors `#registryIds`, kept as a set for cheap membership checks while mutating. */
    readonly #persistedIds: Set<string>;
    #activeId: string | null;
    /** Hydrated sessions, persisted or not. An unpersisted one lives only in this map. */
    readonly #sessions = new Map<string, GitHubSession>();
    /** The one device-flow sign-in allowed to be waiting for approval at a time. */
    #pendingStaging: GitHubSession | null = null;

    constructor(options: GitHubAccountsControllerOptions) {
        this.#options = options;
        this.#directory = options.directory;
        this.#registryFile = join(this.#directory, ACCOUNTS_REGISTRY_FILE);

        const loaded = this.#readRegistry();
        this.#registryIds = [...loaded.ids];
        this.#persistedIds = new Set(loaded.ids);
        this.#activeId = loaded.activeId;

        this.#sweepOrphanedStagingFiles();
    }

    /**
     * Deletes every leftover `github-credential-pending-*.json` staging file at startup.
     *
     * `startDeviceSignIn`/`signInWithToken` write a fully-formed, `safeStorage`-encrypted
     * credential to one of these the moment verification succeeds, and only delete it a few
     * lines later via `#finalize`'s `stagingStore.clear()`. If the process is killed, crashes,
     * or is otherwise interrupted in that window, the file is orphaned: nothing in
     * `#registryIds` ever names it, `listAccounts()` never scans for it, and there is no
     * in-app way to find or revoke it. Since a controller only ever has one pending sign-in
     * in flight at a time and always clears its own staging file before this constructor
     * could run again, any matching file found here belongs to an earlier, interrupted run
     * - never to a sign-in this instance is about to start - so it is safe to remove
     * unconditionally, on a best-effort basis.
     */
    #sweepOrphanedStagingFiles(): void {
        let entries: string[];
        try {
            entries = readdirSync(this.#directory);
        } catch {
            return;
        }
        for (const entry of entries) {
            if (!PENDING_FILE_PATTERN.test(entry)) continue;
            try {
                unlinkSync(join(this.#directory, entry));
            } catch {
                // Best-effort: a locked or already-gone file is not worth failing startup over.
            }
        }
    }

    /* ------------------------------- legacy single-account surface ------------------ */

    status(): GitHubStatus {
        const active = this.#activeSession();
        if (active !== null) {
            return { ...active.status(), signingIn: this.#pendingStaging !== null };
        }
        return {
            signedIn: false,
            account: null,
            clientConfigured: this.#options.client() !== null,
            clientKind: this.#options.client()?.kind ?? null,
            encryptionAvailable: this.#encryptionAvailable(),
            requiredScopes: this.#options.requiredScopes ?? REQUIRED_SCOPES,
            signingIn: this.#pendingStaging !== null,
        };
    }

    async accessToken(): Promise<AccessTokenResult> {
        const active = this.#activeSession();
        if (active === null) {
            return this.#failure({
                code: "signed-out",
                message: "Nobody is signed in to GitHub on this computer.",
            });
        }
        return await active.accessToken();
    }

    cancelSignIn(): boolean {
        return this.#pendingStaging?.cancelSignIn() ?? false;
    }

    /** Runs the ordinary device flow, then adds (or updates) an account and makes it active. */
    async startDeviceSignIn(options: { useOAuthFallback?: boolean } = {}): Promise<SignInResult> {
        if (this.#pendingStaging !== null) {
            return this.#failure({
                code: "already-signing-in",
                message: "A sign-in is already waiting for approval on GitHub.",
            });
        }

        const stagingStore = new TokenStore({ file: this.#pendingFile(), safeStorage: this.#options.safeStorage });
        const staging = this.#buildSession(stagingStore);
        this.#pendingStaging = staging;
        try {
            const result = await staging.startDeviceSignIn(options);
            if (!result.ok) return result;
            return this.#finalize(stagingStore, staging, result.account);
        } finally {
            this.#pendingStaging = null;
        }
    }

    /** Runs the ordinary pasted-token path, then adds (or updates) an account and activates it. */
    async signInWithToken(rawToken: string): Promise<SignInResult> {
        const stagingStore = new TokenStore({ file: this.#pendingFile(), safeStorage: this.#options.safeStorage });
        const staging = this.#buildSession(stagingStore);
        const result = await staging.signInWithToken(rawToken);
        if (!result.ok) return result;
        return this.#finalize(stagingStore, staging, result.account);
    }

    async checkRepository(owner: string, repo: string): Promise<RepositoryAccess> {
        const active = this.#activeSession();
        if (active === null) {
            return {
                ok: false,
                failure: {
                    code: "invalid-token",
                    message: "Nobody is signed in to GitHub on this computer.",
                    manageUrl: null,
                    offerOAuthFallback: false,
                },
            };
        }
        return await active.checkRepository(owner, repo);
    }

    /** Signs out the ACTIVE account, falling back to another stored one when there is one. */
    async signOut(): Promise<AccountSignOutResult> {
        if (this.#activeId === null) {
            this.#emit({ type: "signed-out" });
            return { signedOut: false, revoked: false, reason: null, manageUrl: null, fallbackAccount: null };
        }
        const outcome = await this.#removeAccountInternal(this.#activeId);
        return {
            signedOut: outcome.signedOut,
            revoked: outcome.revoked,
            reason: outcome.reason,
            manageUrl: outcome.manageUrl,
            fallbackAccount: outcome.fallbackAccount,
        };
    }

    /* ------------------------------------- new, additive surface -------------------- */

    activeAccountId(): string | null {
        return this.#activeId;
    }

    /** Every stored account, persisted or (for this run only) in-memory, richest first. */
    listAccounts(): AccountsList {
        const accounts: AccountSummary[] = [];
        let changed = false;

        for (const id of [...this.#registryIds]) {
            const live = this.#sessions.get(id)?.status().account ?? null;
            if (live !== null) {
                accounts.push({ ...live, id, active: id === this.#activeId });
                continue;
            }
            const meta = new TokenStore({
                file: this.#accountFile(id),
                safeStorage: this.#options.safeStorage,
            }).metadata();
            if (meta === null) {
                // The index still names it, but its file is gone or unreadable. Nothing
                // real to show, so it comes off the list rather than reading as a ghost
                // account nobody can act on.
                this.#registryIds = this.#registryIds.filter((existing) => existing !== id);
                this.#persistedIds.delete(id);
                if (this.#activeId === id) this.#activeId = this.#registryIds[0] ?? null;
                changed = true;
                continue;
            }
            accounts.push({ ...accountFromRecord(meta, false)!, id, active: id === this.#activeId });
        }

        // Accounts held only in memory (no working credential store when they signed in)
        // are not in `#registryIds` at all; find them from the live sessions directly.
        for (const [id, session] of this.#sessions) {
            if (this.#registryIds.includes(id)) continue;
            const account = session.status().account;
            if (account !== null) accounts.push({ ...account, id, active: id === this.#activeId });
        }

        if (changed) this.#persistRegistry();
        return { accounts, activeId: this.#activeId };
    }

    /** Removes exactly one account's token and metadata, whether or not it is active. */
    async removeAccount(id: string): Promise<RemoveAccountResult> {
        if (!this.#knowsAccount(id)) {
            return {
                removed: false,
                wasActive: false,
                newActiveId: this.#activeId,
                revoked: false,
                reason: null,
                manageUrl: null,
                fallbackAccount: null,
            };
        }
        const outcome = await this.#removeAccountInternal(id);
        return {
            removed: true,
            wasActive: outcome.wasActive,
            newActiveId: outcome.newActiveId,
            revoked: outcome.revoked,
            reason: outcome.reason,
            manageUrl: outcome.manageUrl,
            fallbackAccount: outcome.fallbackAccount,
        };
    }

    /** Switches which stored account every legacy channel resolves to. */
    setActiveAccount(id: string): SetActiveAccountResult {
        if (!this.#knowsAccount(id)) {
            return {
                ok: false,
                activeId: this.#activeId,
                account: null,
                reason: "No stored account has that id.",
            };
        }
        // Resolve before committing anything: the registry can still name an id whose
        // credential file has gone missing or unreadable (listAccounts() self-heals this,
        // but only on its own pass). Switching to that ghost id first and checking after
        // would leave #activeId pointing at an account nobody can use, persisted to disk,
        // with the caller told `ok: true` and handed a null account.
        const account = this.#sessionFor(id).status().account;
        if (account === null) {
            return {
                ok: false,
                activeId: this.#activeId,
                account: null,
                reason: "That account's stored credential could not be read.",
            };
        }
        this.#activeId = id;
        this.#persistRegistry();
        this.#emit({ type: "signed-in", account });
        return { ok: true, activeId: id, account, reason: null };
    }

    /** Renews one specific account's token. Never returns the token itself. */
    async refreshAccount(id: string): Promise<RefreshAccountResult> {
        if (!this.#knowsAccount(id)) {
            return {
                ok: false,
                account: null,
                failure: {
                    code: "no-such-account",
                    message: "No stored account has that id.",
                    missingScopes: [],
                    offerOAuthFallback: false,
                },
            };
        }
        const session = this.#sessionFor(id);
        const result = await session.accessToken();
        if (!result.ok) return { ok: false, account: null, failure: result.failure };
        return { ok: true, account: session.status().account, failure: null };
    }

    /* --------------------------------------------------------------------------------- */

    #knowsAccount(id: string): boolean {
        return this.#registryIds.includes(id) || this.#sessions.has(id);
    }

    #activeSession(): GitHubSession | null {
        if (this.#activeId === null) return null;
        const live = this.#sessions.get(this.#activeId);
        if (live !== undefined) return live;
        return this.#registryIds.includes(this.#activeId) ? this.#sessionFor(this.#activeId) : null;
    }

    #sessionFor(id: string): GitHubSession {
        const existing = this.#sessions.get(id);
        if (existing !== undefined) return existing;
        const store = new TokenStore({ file: this.#accountFile(id), safeStorage: this.#options.safeStorage });
        const session = this.#buildSession(store);
        this.#sessions.set(id, session);
        return session;
    }

    #buildSession(store: TokenStore): GitHubSession {
        return new GitHubSession({
            store,
            fetch: this.#options.fetch,
            sleep: this.#options.sleep,
            client: this.#options.client,
            ...(this.#options.oauthFallbackClient === undefined
                ? {}
                : { oauthFallbackClient: this.#options.oauthFallbackClient }),
            ...(this.#options.clientSecret === undefined ? {} : { clientSecret: this.#options.clientSecret }),
            openExternal: this.#options.openExternal,
            ...(this.#options.onEvent === undefined ? {} : { onEvent: this.#options.onEvent }),
            ...(this.#options.now === undefined ? {} : { now: this.#options.now }),
            ...(this.#options.apiBase === undefined ? {} : { apiBase: this.#options.apiBase }),
            ...(this.#options.oauthBase === undefined ? {} : { oauthBase: this.#options.oauthBase }),
            ...(this.#options.requiredScopes === undefined
                ? {}
                : { requiredScopes: this.#options.requiredScopes }),
            ...(this.#options.maxNetworkRetries === undefined
                ? {}
                : { maxNetworkRetries: this.#options.maxNetworkRetries }),
        });
    }

    /**
     * Moves a just-verified sign-in from its staging file into the account it turned out
     * to belong to, and makes that account active.
     *
     * When the staging store could not persist (no working credential store), there is
     * nothing on disk to move; the staging session itself - already holding the secret in
     * memory - becomes the account's session for the rest of this run, exactly as the
     * single-account path always behaved. The same fallback applies when the staging
     * write *did* succeed but the move into the account's own file does not - a full
     * disk, a transient lock, `safeStorage` refusing the second call in the same run.
     * Trusting that move to have happened (the previous behaviour) deleted the only copy
     * on disk and handed back an unhydrated session with nothing in memory either, while
     * still reporting `persisted: true` - a sign-in the interface calls a success and the
     * very next status check calls signed out.
     */
    #finalize(stagingStore: TokenStore, staging: GitHubSession, account: GitHubAccount): SignInResult {
        const id = deriveAccountId(account);
        let reportedAccount = account;

        if (account.persisted) {
            const read = stagingStore.read();
            const finalStore = new TokenStore({ file: this.#accountFile(id), safeStorage: this.#options.safeStorage });
            const saved = read.ok
                ? finalStore.save(read.secret, {
                      kind: read.record.kind,
                      login: read.record.login,
                      userId: read.record.userId,
                      scopes: read.record.scopes,
                      scopesReported: read.record.scopesReported,
                      clientId: read.record.clientId,
                      expiresAt: read.record.expiresAt,
                      refreshTokenExpiresAt: read.record.refreshTokenExpiresAt,
                  })
                : null;

            if (saved !== null && saved.ok) {
                stagingStore.clear();
                this.#sessions.set(id, this.#buildSession(finalStore));
                this.#persistedIds.add(id);
            } else {
                // Leave the staging file exactly where it is - it is the only remaining
                // copy of the secret, and there is nowhere proven-safe to move it to yet.
                // Keep using the staging session, which already holds it in memory.
                this.#sessions.set(id, staging);
                this.#persistedIds.delete(id);
                reportedAccount = { ...account, persisted: false };
            }
        } else {
            this.#sessions.set(id, staging);
            this.#persistedIds.delete(id);
        }

        if (!this.#registryIds.includes(id)) this.#registryIds.push(id);
        this.#activeId = id;
        this.#persistRegistry();
        return { ok: true, account: reportedAccount };
    }

    async #removeAccountInternal(id: string): Promise<{
        readonly signedOut: boolean;
        readonly revoked: boolean;
        readonly reason: string | null;
        readonly manageUrl: string | null;
        readonly wasActive: boolean;
        readonly newActiveId: string | null;
        readonly fallbackAccount: GitHubAccount | null;
    }> {
        const session = this.#sessions.get(id) ?? (this.#registryIds.includes(id) ? this.#sessionFor(id) : null);

        let signedOut = false;
        let revoked = false;
        let reason: string | null = null;
        let manageUrl: string | null = null;
        if (session !== null) {
            // `session.signOut()` always yields at least one microtask (it awaits
            // `revokeToken`, even on its no-client-secret early return), so another IPC call
            // - most notably a synchronous `setActiveAccount()` - can run and change
            // `#activeId` while this call is suspended here. Do not decide "was this the
            // active account" from a snapshot taken before this await: re-derive it after
            // resuming, immediately below, so a concurrent switch is never clobbered.
            const outcome = await session.signOut();
            signedOut = outcome.signedOut;
            revoked = outcome.revoked;
            reason = outcome.reason;
            manageUrl = outcome.manageUrl;
        }

        this.#sessions.delete(id);
        this.#persistedIds.delete(id);
        this.#registryIds = this.#registryIds.filter((existing) => existing !== id);

        const wasActive = this.#activeId === id;
        let newActiveId = this.#activeId;
        let fallbackAccount: GitHubAccount | null = null;
        if (wasActive) {
            newActiveId = this.#registryIds[0] ?? [...this.#sessions.keys()][0] ?? null;
            this.#activeId = newActiveId;
            if (newActiveId !== null) fallbackAccount = this.#sessionFor(newActiveId).status().account;
        }

        this.#persistRegistry();

        if (wasActive) {
            if (fallbackAccount !== null) this.#emit({ type: "signed-in", account: fallbackAccount });
            else this.#emit({ type: "signed-out" });
        }

        return { signedOut, revoked, reason, manageUrl, wasActive, newActiveId, fallbackAccount };
    }

    #accountFile(id: string): string {
        return join(this.#directory, `github-credential-${id}.json`);
    }

    #pendingFile(): string {
        return join(this.#directory, `github-credential-pending-${randomUUID()}.json`);
    }

    #encryptionAvailable(): boolean {
        try {
            return this.#options.safeStorage.isEncryptionAvailable();
        } catch {
            return false;
        }
    }

    #readRegistry(): AccountsRegistryState {
        let raw: string;
        try {
            raw = readFileSync(this.#registryFile, "utf8");
        } catch {
            return emptyRegistry();
        }
        return parseRegistry(raw) ?? emptyRegistry();
    }

    /** Writes only the durable (persisted) accounts. Never creates a file for none. */
    #persistRegistry(): void {
        const durableIds = this.#registryIds.filter((id) => this.#persistedIds.has(id));
        const durableActive =
            this.#activeId !== null && this.#persistedIds.has(this.#activeId)
                ? this.#activeId
                : (durableIds[0] ?? null);

        if (durableIds.length === 0 && !existsSync(this.#registryFile)) return;

        const state: AccountsRegistryState = {
            version: ACCOUNTS_REGISTRY_VERSION,
            ids: durableIds,
            activeId: durableActive,
        };
        mkdirSync(this.#directory, { recursive: true });
        const staging = `${this.#registryFile}.writing`;
        writeFileSync(staging, `${JSON.stringify(state, null, 4)}\n`, { encoding: "utf8", mode: 0o600 });
        renameSync(staging, this.#registryFile);
    }

    #failure(partial: Pick<GitHubFailure, "code" | "message"> & Partial<GitHubFailure>): {
        readonly ok: false;
        readonly failure: GitHubFailure;
    } {
        const failure: GitHubFailure = {
            code: partial.code,
            message: partial.message,
            missingScopes: partial.missingScopes ?? [],
            offerOAuthFallback: partial.offerOAuthFallback ?? false,
        };
        this.#emit({ type: "failed", failure });
        return { ok: false, failure };
    }

    #emit(event: GitHubAuthEvent): void {
        this.#options.onEvent?.(event);
    }
}

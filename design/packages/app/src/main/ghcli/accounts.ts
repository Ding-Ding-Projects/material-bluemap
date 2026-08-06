/**
 * The `gh` command-line tool's OWN accounts - not this application's.
 *
 * ## Two stores, never merged
 *
 * `main/github/accounts.ts` (`GitHubAccountsController`) is this application's own
 * multi-account credential store: a token per account, in this app's own encrypted files,
 * under this app's own control. This module reads a *completely different* store - `gh`'s
 * own `~/.config/gh/hosts.yml` (or wherever `gh` itself decides to keep it), shared by
 * every terminal, script and other tool on this machine that happens to shell out to
 * `gh`. The two can disagree at any moment: an account signed in to `gh` may never have
 * touched this app, an account signed in to this app may never have touched `gh`, and
 * "the active account" can be a different login in each store at the same time. Nothing
 * here reconciles them, and nothing in the interface may present them as one list - see
 * `packages/ui/src/components/github/GhCliAccountsList.vue`, which renders this module's
 * accounts in a visibly separate section from `GitHubAccountsList.vue`'s own.
 *
 * ## Read the real machine-readable route, do not scrape prose by default
 *
 * `gh auth status --json hosts` (confirmed present on the `gh` version this was built
 * against, 2.96.0) answers structured JSON on stdout and, unlike the plain-text form,
 * **exits 0 even when nobody is signed in to anything** - only a fatal error makes it
 * fail. That is the route {@link listGhCliAccounts} prefers. Only when that JSON cannot be
 * parsed at all - an old `gh` that does not recognise `--json` - does it fall back to
 * {@link parseGhAuthStatusText}, which is deliberately isolated in its own function with
 * its own tests over real captured output, and returns `null` (never an empty list) when
 * the text itself is not in a shape this module recognises. An unrecognised format is
 * reported as exactly that - `availability: "unrecognised"` - never silently reported as
 * zero accounts, which would read as "you are not signed in to anything" when the truth
 * is "this application could not understand what gh said".
 *
 * ## `gh auth login` / `gh auth refresh` are never driven from here
 *
 * Exactly the rule `cirender/gh.ts` already documents and this module leans on rather than
 * re-litigating: both commands suppress their device-code prompt the moment stdin is not a
 * real terminal, which is always true of a child process this application spawns, so they
 * would print nothing and hang forever. Launching a console for them does not rescue it
 * either - the hang is in the process itself, not in having somewhere to show output. So
 * "add an account" and "this account is missing scopes" are answered the same way
 * `cirender/gh.ts` answers "you are signed out": by naming the exact command for the person
 * to run in *their own* terminal, never by spawning it here.
 *
 * ## Switching is machine-wide, and the switch here proves rather than assumes
 *
 * `gh auth switch` changes which account every other terminal, script and tool on this
 * computer gets when it shells out to `gh` - it is not scoped to this application in any
 * way. {@link switchGhCliAccount} never reports success from `gh`'s exit code alone: it
 * re-reads the account list afterwards and only reports `ok: true` when the requested
 * login is genuinely the active one on that host now. The machine-wide sentence itself
 * lives in the returned `message` so the caller cannot forget to say it.
 *
 * ## Never the token
 *
 * `--show-token` is never passed, `GH_TOKEN` is never read or set, and nothing here ever
 * asks `gh` for a credential - only for the account list and the auth-switch outcome, both
 * of which name accounts and never carry a secret.
 */

import { GH_COMMAND, GH_LOGIN_COMMAND } from "../cirender/gh.js";
import type { ProcessRunner } from "../cirender/gh.js";

/**
 * The scopes this application's own gh-driven features actually need: `repo` for the
 * backup route (`backup/github.ts`'s `REQUIRED_SCOPE`) and `workflow` for dispatching a CI
 * render (`cirender/actions.ts`'s workflow-dispatch call). Not `gh`'s own minimum - `gh
 * auth login`'s device-flow default already grants both - this is what *this application*
 * checks an account against, so a gap shows up here, on the account list, rather than only
 * at the moment a render or a backup fails partway through.
 */
export const APP_SCOPES_OF_INTEREST: readonly string[] = ["repo", "workflow"];

export type GhCliAvailability = "not-installed" | "no-accounts" | "ready" | "unrecognised";

export interface GhCliAccountSummary {
    readonly login: string;
    readonly host: string;
    /** True for the one account `gh` itself would use on this host right now. */
    readonly active: boolean;
    readonly scopes: readonly string[];
    /**
     * False when `gh` reported no scope text at all for this account - a fine-grained
     * token, most often - in which case `scopes` is empty but that emptiness is not "this
     * account has no permissions", it is "this kind of token does not say".
     */
    readonly scopesReported: boolean;
    /** `keyring`, `oauth_token` (a plain file), and so on. Never a secret itself. */
    readonly tokenSource: string | null;
    readonly gitProtocol: string | null;
    /** True unless `gh`'s own per-account auth check reported something other than success. */
    readonly healthy: boolean;
    /** `gh`'s own state word when {@link healthy} is false. Null when it is true. */
    readonly stateDetail: string | null;
    /** From {@link APP_SCOPES_OF_INTEREST}, the ones this account's token does not carry. */
    readonly missingAppScopes: readonly string[];
}

export interface GhCliAccountsStatus {
    readonly availability: GhCliAvailability;
    /** `gh version 2.96.0 (2026-07-02)`, first line only, or null when it is not installed. */
    readonly version: string | null;
    readonly accounts: readonly GhCliAccountSummary[];
    /** Which route actually produced this list. Null when there is no list to attribute. */
    readonly source: "json" | "text" | null;
    /** One honest sentence naming the situation. */
    readonly message: string;
}

export interface GhCliSwitchResult {
    readonly ok: boolean;
    /** The account re-read after switching, whether or not the switch actually took. */
    readonly account: GhCliAccountSummary | null;
    /**
     * Names the machine-wide consequence on success, so a caller cannot report a switch
     * without also saying what it really changed. Names the real failure on failure.
     */
    readonly message: string;
}

export interface GhCliRunOptions {
    readonly runner: ProcessRunner;
    readonly signal?: AbortSignal | undefined;
}

const NOT_INSTALLED =
    "The GitHub command-line tool (gh) is not on this computer's PATH, so its own accounts" +
    " cannot be listed. This application's own sign-in above is unaffected either way -" +
    " install gh from cli.github.com if you also want to use it from a terminal.";

function firstLine(text: string): string {
    return (text.split(/\r?\n/)[0] ?? "").trim();
}

function missingAppScopesOf(scopes: readonly string[], scopesReported: boolean): readonly string[] {
    if (!scopesReported) return [];
    return APP_SCOPES_OF_INTEREST.filter((scope) => !scopes.includes(scope));
}

/* -------------------------------------------------------------------------- */
/* The JSON route: `gh auth status --json hosts`                              */
/* -------------------------------------------------------------------------- */

/**
 * Parses `gh auth status --json hosts`'s stdout into account summaries, or returns `null`
 * when the text is not that JSON shape at all - which is the "fall back to text parsing"
 * signal for {@link listGhCliAccounts}. An empty `hosts` object is a real, valid answer
 * (nobody is signed in to anything) and comes back as an empty array, not `null`.
 */
export function parseGhAuthStatusJson(raw: string): readonly GhCliAccountSummary[] | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const hosts = (parsed as Record<string, unknown>)["hosts"];
    if (typeof hosts !== "object" || hosts === null) return null;

    const accounts: GhCliAccountSummary[] = [];
    for (const [hostKey, entryList] of Object.entries(hosts as Record<string, unknown>)) {
        if (!Array.isArray(entryList)) continue;
        for (const entry of entryList) {
            if (typeof entry !== "object" || entry === null) continue;
            const record = entry as Record<string, unknown>;
            const login = typeof record["login"] === "string" ? record["login"] : null;
            if (login === null || login.trim() === "") continue;

            const scopesRaw = typeof record["scopes"] === "string" ? record["scopes"] : "";
            const scopes = scopesRaw
                .split(",")
                .map((scope) => scope.trim())
                .filter((scope) => scope.length > 0);
            const scopesReported = scopesRaw.trim().length > 0;

            const state = typeof record["state"] === "string" ? record["state"] : "success";
            const healthy = state === "success";

            accounts.push({
                login,
                host: typeof record["host"] === "string" && record["host"].trim() !== "" ? record["host"] : hostKey,
                active: record["active"] === true,
                scopes,
                scopesReported,
                tokenSource: typeof record["tokenSource"] === "string" ? record["tokenSource"] : null,
                gitProtocol: typeof record["gitProtocol"] === "string" ? record["gitProtocol"] : null,
                healthy,
                stateDetail: healthy ? null : state,
                missingAppScopes: missingAppScopesOf(scopes, scopesReported),
            });
        }
    }
    return accounts;
}

/* -------------------------------------------------------------------------- */
/* The text fallback: plain `gh auth status`, for a `gh` old enough to lack   */
/* `--json` on this command.                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Matches both the modern `Logged in to HOST account LOGIN (SOURCE)` and the legacy
 * `Logged in to HOST as LOGIN`, the same two shapes `cirender/gh.ts`'s own `accountFrom`
 * already has to handle across `gh` versions.
 */
const ACCOUNT_HEADER = /Logged in to (\S+) (?:account (\S+)|as (\S+))(?: \(([^)]*)\))?/g;

/**
 * Parses plain `gh auth status` text (stdout and stderr combined - older `gh` wrote this
 * to one stream, current `gh` to the other) into account summaries.
 *
 * Returns `[]` when the text plainly says nobody is signed in to anything, and `null` -
 * never `[]` - when the text matches neither that phrase nor a single "Logged in to"
 * header, which means this is a format this function does not recognise and the caller
 * must fail honestly rather than report zero accounts that might not be zero at all.
 *
 * This route cannot see `gh`'s finer per-account health state the way the JSON route's
 * own `state` field can - the text this function reads was captured on a `gh` new enough
 * to have that field in its JSON but old enough that this is only reached when the JSON
 * form itself is unavailable - so every account this parses comes back `healthy: true`.
 * That is an honest limitation of the fallback, not a claim the account is definitely
 * fine; the JSON route is preferred for exactly this reason whenever it is available.
 */
export function parseGhAuthStatusText(text: string): readonly GhCliAccountSummary[] | null {
    if (/not logged into any/i.test(text)) return [];

    const matches = [...text.matchAll(ACCOUNT_HEADER)];
    if (matches.length === 0) return null;

    const accounts: GhCliAccountSummary[] = [];
    for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        if (match === undefined || match.index === undefined) continue;
        const host = match[1] ?? "";
        const login = match[2] ?? match[3] ?? "";
        if (host === "" || login === "") continue;
        const tokenSource = match[4]?.trim() ?? "";

        const blockStart = match.index + match[0].length;
        const nextMatch = matches[index + 1];
        const blockEnd = nextMatch?.index ?? text.length;
        const block = text.slice(blockStart, blockEnd);

        const activeMatch = /Active account:\s*(true|false)/i.exec(block);
        const active = activeMatch?.[1]?.toLowerCase() === "true";

        const protocolMatch = /Git operations protocol:\s*(\S+)/i.exec(block);
        const gitProtocol = protocolMatch?.[1] ?? null;

        const scopesMatch = /Token scopes:\s*(.+)/i.exec(block);
        const scopes = scopesMatch
            ? scopesMatch[1]!
                  .split(",")
                  .map((raw) => raw.trim().replace(/^'+|'+$/g, ""))
                  .filter((scope) => scope.length > 0)
            : [];
        const scopesReported = scopesMatch !== null;

        accounts.push({
            login,
            host,
            active,
            scopes,
            scopesReported,
            tokenSource: tokenSource === "" ? null : tokenSource,
            gitProtocol,
            healthy: true,
            stateDetail: null,
            missingAppScopes: missingAppScopesOf(scopes, scopesReported),
        });
    }
    return accounts;
}

/* -------------------------------------------------------------------------- */
/* Listing                                                                    */
/* -------------------------------------------------------------------------- */

function summarize(
    accounts: readonly GhCliAccountSummary[],
    version: string | null,
    source: "json" | "text",
): GhCliAccountsStatus {
    if (accounts.length === 0) {
        return {
            availability: "no-accounts",
            version,
            accounts: [],
            source,
            message:
                `${GH_COMMAND} is installed but nobody is signed in to it. Run \`${GH_LOGIN_COMMAND}\`` +
                " in a terminal - it has to be run there, because it asks for a code interactively" +
                " and cannot be driven from inside this application - then check again.",
        };
    }
    const plural = accounts.length === 1 ? "account is" : "accounts are";
    return {
        availability: "ready",
        version,
        accounts,
        source,
        message: `${GH_COMMAND} has ${accounts.length} ${plural} signed in on this computer.`,
    };
}

/**
 * Every account `gh` itself has stored on this computer, from the most stable route this
 * installed version of `gh` supports. See the module doc comment for the JSON-then-text
 * strategy and why an unrecognised format is never reported as zero accounts.
 */
export async function listGhCliAccounts(options: GhCliRunOptions): Promise<GhCliAccountsStatus> {
    const runOptions = options.signal === undefined ? {} : { signal: options.signal };

    const version = await options.runner.run(GH_COMMAND, ["--version"], runOptions);
    if (!version.started) {
        return { availability: "not-installed", version: null, accounts: [], source: null, message: NOT_INSTALLED };
    }
    if (version.code !== 0) {
        return {
            availability: "not-installed",
            version: null,
            accounts: [],
            source: null,
            message:
                `${GH_COMMAND} is on PATH but would not report its version` +
                `${firstLine(version.stderr) === "" ? "" : `: ${firstLine(version.stderr)}`}. ` +
                "Its accounts cannot be listed until that is fixed.",
        };
    }
    const versionText = firstLine(version.stdout) || firstLine(version.stderr) || null;

    const jsonResult = await options.runner.run(GH_COMMAND, ["auth", "status", "--json", "hosts"], runOptions);
    const jsonAccounts = parseGhAuthStatusJson(jsonResult.stdout);
    if (jsonAccounts !== null) return summarize(jsonAccounts, versionText, "json");

    // `--json` was not recognised by this `gh` (or answered something unparseable) - fall
    // back to the plain text form, which every version of `gh` has always supported.
    const textResult = await options.runner.run(GH_COMMAND, ["auth", "status"], runOptions);
    const combinedText = `${textResult.stdout}\n${textResult.stderr}`;
    const textAccounts = parseGhAuthStatusText(combinedText);
    if (textAccounts !== null) return summarize(textAccounts, versionText, "text");

    return {
        availability: "unrecognised",
        version: versionText,
        accounts: [],
        source: null,
        message:
            `${GH_COMMAND} answered "${GH_COMMAND} auth status" in a format this application does not` +
            ` recognise, so its accounts cannot be listed safely. Run \`${GH_COMMAND} auth status\` in a` +
            " terminal to see them yourself.",
    };
}

/* -------------------------------------------------------------------------- */
/* Switching                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Switches `gh`'s own active account on one host - **for the whole computer**, not only
 * this application. Never trusts `gh auth switch`'s exit code alone: it re-reads the
 * account list afterwards and reports `ok: true` only once the requested login is
 * genuinely the active one on that host. `message` names the machine-wide consequence on
 * success and the real reason on failure.
 */
export async function switchGhCliAccount(
    options: GhCliRunOptions,
    host: string,
    login: string,
): Promise<GhCliSwitchResult> {
    if (host.trim() === "" || login.trim() === "") {
        return { ok: false, account: null, message: "Give a host and a login to switch gh's active account to." };
    }
    const runOptions = options.signal === undefined ? {} : { signal: options.signal };

    const result = await options.runner.run(
        GH_COMMAND,
        ["auth", "switch", "--hostname", host, "--user", login],
        runOptions,
    );
    if (!result.started) {
        return { ok: false, account: null, message: NOT_INSTALLED };
    }

    const status = await listGhCliAccounts(options);
    const match = status.accounts.find(
        (account) => account.host === host && account.login.toLowerCase() === login.toLowerCase(),
    );

    if (match?.active === true) {
        return {
            ok: true,
            account: match,
            message:
                `${login} is now gh's active account on ${host}. This is machine-wide: every terminal,` +
                " script and other tool on this computer that shells out to gh will use this account" +
                " from now on, not only this application.",
        };
    }

    const stderrLine = firstLine(result.stderr);
    const reason =
        result.code !== 0 && stderrLine !== ""
            ? ` gh said: ${stderrLine}`
            : status.availability === "unrecognised"
              ? ` ${status.message}`
              : "";
    return {
        ok: false,
        account: match ?? null,
        message: `Switching gh's active account to ${login} on ${host} did not take.${reason}`,
    };
}

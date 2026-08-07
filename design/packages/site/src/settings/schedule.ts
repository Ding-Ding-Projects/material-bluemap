import type { Preferences } from "../platform/Preferences.js";
import type { SettingValue } from "./types.js";
import type { SettingsStore } from "./store.js";

export const SCHEDULE_SCHEMA_VERSION = 1 as const;
export const MAX_SCHEDULE_RULES = 50;
export const MAX_EXTERNAL_BYTES = 64 * 1024;
export const EXTERNAL_TIMEOUT_MS = 8_000;
export const MIN_REFRESH_MINUTES = 5;
export const MAX_REFRESH_MINUTES = 1_440;

const RULES_KEY = "scheduled-settings.rules";
const HISTORY_KEY = "scheduled-settings.history";
const RULE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ENTITY_ID = /^(?:binary_sensor|input_boolean)\.[a-z0-9_]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type ScheduleSource =
    | { readonly kind: "local" }
    | { readonly kind: "api"; readonly url: string; readonly refreshMinutes: number }
    | {
          readonly kind: "home-assistant";
          readonly baseUrl: string;
          readonly entityId: string;
          /** Stable credential-vault key. Never the token itself. */
          readonly credentialKey: string;
          readonly refreshMinutes: number;
      };

export interface ScheduledSettingsRule {
    readonly id: string;
    readonly label: string;
    readonly enabled: boolean;
    readonly priority: number;
    readonly timezone: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly everyDay: boolean;
    /** Sunday=0 through Saturday=6. Ignored when everyDay is true. */
    readonly weekdays: readonly number[];
    readonly values: Readonly<Record<string, SettingValue>>;
    readonly source: ScheduleSource;
}

export interface ScheduleDocument {
    readonly version: typeof SCHEDULE_SCHEMA_VERSION;
    readonly rules: readonly ScheduledSettingsRule[];
}

export interface ScheduleHistoryEntry {
    readonly id: string;
    readonly at: string;
    readonly action: "saved" | "imported" | "reset";
    readonly document: ScheduleDocument;
}

export type ScheduleStatus =
    | { readonly kind: "idle"; readonly message: string }
    | { readonly kind: "applied"; readonly ruleId: string; readonly ids: readonly string[] }
    | { readonly kind: "off"; readonly ruleId: string }
    | { readonly kind: "error"; readonly ruleId: string; readonly code: string };

export interface SecretProvider {
    tokenFor(credentialKey: string): Promise<string | null>;
}

export interface ExternalClientOptions {
    readonly fetcher?: typeof fetch;
    readonly secrets?: SecretProvider;
}

export function localTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}

export function supportedTimezones(): readonly string[] {
    const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] })
        .supportedValuesOf;
    if (supported === undefined) return [localTimezone(), "UTC"];
    return [...new Set([localTimezone(), "UTC", ...supported("timeZone")])];
}

export function defaultRule(index = 1): ScheduledSettingsRule {
    return {
        id: `rule-${index}`,
        label: `Rule ${index}`,
        enabled: true,
        priority: index,
        timezone: localTimezone(),
        startDate: "",
        endDate: "",
        startTime: "09:00",
        endTime: "17:00",
        everyDay: true,
        weekdays: [],
        values: { "language.mode": "en" },
        source: { kind: "local" },
    };
}

export function validateExternalUrl(
    text: string,
): { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly code: string } {
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return { ok: false, code: "invalid-url" };
    }
    if (url.username !== "" || url.password !== "")
        return { ok: false, code: "credentials-in-url" };
    if (url.hash !== "") return { ok: false, code: "fragment" };
    if (url.protocol === "https:") return { ok: true, url };
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
    return url.protocol === "http:" && loopback
        ? { ok: true, url }
        : { ok: false, code: "https-required" };
}

export function validateRule(rule: ScheduledSettingsRule, store: SettingsStore): readonly string[] {
    const errors: string[] = [];
    if (!RULE_ID.test(rule.id)) errors.push("id");
    if (rule.label.trim().length === 0 || rule.label.length > 80) errors.push("label");
    if (!Number.isInteger(rule.priority) || rule.priority < -1000 || rule.priority > 1000)
        errors.push("priority");
    try {
        new Intl.DateTimeFormat("en", { timeZone: rule.timezone }).format(new Date());
    } catch {
        errors.push("timezone");
    }
    if (rule.startDate !== "" && (!DATE.test(rule.startDate) || !validDate(rule.startDate)))
        errors.push("start-date");
    if (rule.endDate !== "" && (!DATE.test(rule.endDate) || !validDate(rule.endDate)))
        errors.push("end-date");
    if (rule.startDate !== "" && rule.endDate !== "" && rule.startDate > rule.endDate)
        errors.push("date-order");
    if (!TIME.test(rule.startTime)) errors.push("start-time");
    if (!TIME.test(rule.endTime)) errors.push("end-time");
    if (!rule.everyDay && rule.weekdays.length === 0) errors.push("weekdays-empty");
    if (rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
        errors.push("weekdays");
    if (rule.source.kind !== "api" && Object.keys(rule.values).length === 0)
        errors.push("values-empty");
    for (const [id, value] of Object.entries(rule.values)) {
        if (store.validate(id, value) === null) errors.push(`value:${id}`);
    }
    if (rule.source.kind === "api") {
        if (!validateExternalUrl(rule.source.url).ok) errors.push("api-url");
        if (!validRefresh(rule.source.refreshMinutes)) errors.push("refresh");
    }
    if (rule.source.kind === "home-assistant") {
        if (!validateExternalUrl(rule.source.baseUrl).ok) errors.push("ha-url");
        if (!ENTITY_ID.test(rule.source.entityId)) errors.push("ha-entity");
        if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(rule.source.credentialKey))
            errors.push("ha-credential-key");
        if (!validRefresh(rule.source.refreshMinutes)) errors.push("refresh");
    }
    return [...new Set(errors)];
}

export function ruleMatches(rule: ScheduledSettingsRule, now: Date): boolean {
    if (!rule.enabled) return false;
    const current = zonedParts(now, rule.timezone);
    if (current === null) return false;
    const start = minutes(rule.startTime);
    const end = minutes(rule.endTime);
    const minute = minutes(current.time);
    // The early portion of a cross-midnight window belongs to the day on which
    // the rule started. This keeps a Friday 22:00-02:00 rule alive after midnight
    // on Saturday without also treating Saturday as selected.
    const usePreviousDay = start > end && minute < end;
    const parts = usePreviousDay
        ? zonedParts(new Date(now.getTime() - 86_400_000), rule.timezone)
        : current;
    if (parts === null) return false;
    if (rule.startDate !== "" && parts.date < rule.startDate) return false;
    if (rule.endDate !== "" && parts.date > rule.endDate) return false;
    if (!rule.everyDay && !rule.weekdays.includes(parts.weekday)) return false;
    // Equal endpoints mean the full selected day, never an invisible zero-minute window.
    if (start === end) return true;
    return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Higher priority wins; a later rule wins a priority tie. */
export function winningRule(
    rules: readonly ScheduledSettingsRule[],
    now: Date,
): ScheduledSettingsRule | null {
    let winner: { rule: ScheduledSettingsRule; index: number } | null = null;
    for (const [index, rule] of rules.entries()) {
        if (!ruleMatches(rule, now)) continue;
        if (
            winner === null ||
            rule.priority > winner.rule.priority ||
            (rule.priority === winner.rule.priority && index > winner.index)
        ) {
            winner = { rule, index };
        }
    }
    return winner === null ? null : winner.rule;
}

export class ScheduleRepository {
    constructor(
        private readonly prefs: Preferences,
        private readonly store: SettingsStore,
    ) {}

    load(): ScheduleDocument {
        return (
            this.prefs.readJson(RULES_KEY, (value) => reviveDocument(value, this.store)) ?? {
                version: SCHEDULE_SCHEMA_VERSION,
                rules: [],
            }
        );
    }

    save(
        document: ScheduleDocument,
        action: ScheduleHistoryEntry["action"] = "saved",
    ): readonly string[] {
        const revived = reviveDocument(document, this.store);
        if (revived === undefined) return ["document"];
        this.prefs.writeJson(RULES_KEY, revived);
        const history = this.history();
        history.push({
            id: `${Date.now()}-${history.length}`,
            at: new Date().toISOString(),
            action,
            document: revived,
        });
        this.prefs.writeJson(HISTORY_KEY, history.slice(-100));
        return [];
    }

    history(): ScheduleHistoryEntry[] {
        return this.prefs.readJson(HISTORY_KEY, reviveHistory) ?? [];
    }

    reset(): void {
        this.save({ version: SCHEDULE_SCHEMA_VERSION, rules: [] }, "reset");
    }

    restore(historyId: string): readonly string[] {
        const entry = this.history().find((candidate) => candidate.id === historyId);
        return entry === undefined ? ["history"] : this.save(entry.document, "imported");
    }
}

export class ExternalSettingsClient {
    private readonly fetcher: typeof fetch;
    private readonly secrets: SecretProvider;

    constructor(options: ExternalClientOptions = {}) {
        this.fetcher = options.fetcher ?? fetch;
        this.secrets = options.secrets ?? { tokenFor: async () => null };
    }

    async values(
        rule: ScheduledSettingsRule,
        store: SettingsStore,
        signal: AbortSignal,
    ): Promise<{ values: Readonly<Record<string, SettingValue>>; off: boolean }> {
        if (rule.source.kind === "local") return { values: rule.values, off: false };
        if (rule.source.kind === "api") {
            const checked = validateExternalUrl(rule.source.url);
            if (!checked.ok) throw new Error(checked.code);
            const payload = await this.request(checked.url, {}, signal);
            if (!isRecord(payload) || payload["version"] !== 1 || !isRecord(payload["values"]))
                throw new Error("api-schema");
            return { values: validatedValues(payload["values"], store), off: false };
        }
        const checked = validateExternalUrl(rule.source.baseUrl);
        if (!checked.ok) throw new Error(checked.code);
        const token = await this.secrets.tokenFor(rule.source.credentialKey);
        if (token === null || token === "") throw new Error("missing-token");
        const endpoint = new URL(`/api/states/${rule.source.entityId}`, checked.url);
        const payload = await this.request(endpoint, { Authorization: `Bearer ${token}` }, signal);
        if (!isRecord(payload) || typeof payload["state"] !== "string")
            throw new Error("ha-schema");
        const state = payload["state"];
        if (state === "off") return { values: {}, off: true };
        if (state !== "on") throw new Error("ha-state");
        return { values: rule.values, off: false };
    }

    private async request(
        url: URL,
        headers: Readonly<Record<string, string>>,
        outerSignal: AbortSignal,
    ): Promise<unknown> {
        const controller = new AbortController();
        const abort = (): void => controller.abort();
        outerSignal.addEventListener("abort", abort, { once: true });
        const timeout = globalThis.setTimeout(abort, EXTERNAL_TIMEOUT_MS);
        try {
            const response = await this.fetcher(url, {
                method: "GET",
                headers: { Accept: "application/json", ...headers },
                redirect: "manual",
                credentials: "omit",
                cache: "no-store",
                signal: controller.signal,
            });
            if (
                response.type === "opaqueredirect" ||
                (response.status >= 300 && response.status < 400)
            )
                throw new Error("redirect");
            if (response.status === 401 || response.status === 403)
                throw new Error("authentication");
            if (response.status === 429) throw new Error("rate-limited");
            if (!response.ok) throw new Error(`http-${response.status}`);
            const declared = Number(response.headers.get("content-length") ?? "0");
            if (declared > MAX_EXTERNAL_BYTES) throw new Error("too-large");
            const text = await response.text();
            if (new TextEncoder().encode(text).byteLength > MAX_EXTERNAL_BYTES)
                throw new Error("too-large");
            try {
                return JSON.parse(text) as unknown;
            } catch {
                throw new Error("malformed-json");
            }
        } finally {
            globalThis.clearTimeout(timeout);
            outerSignal.removeEventListener("abort", abort);
        }
    }
}

export class ScheduledSettingsController {
    private generation = 0;
    private abort: AbortController | null = null;
    private timer: number | null = null;
    private statusValue: ScheduleStatus = { kind: "idle", message: "No matching rule." };
    private readonly listeners = new Set<(status: ScheduleStatus) => void>();
    private readonly externalCache = new Map<
        string,
        { at: number; values: Readonly<Record<string, SettingValue>>; off: boolean }
    >();

    constructor(
        private readonly repository: ScheduleRepository,
        private readonly store: SettingsStore,
        private readonly client = new ExternalSettingsClient(),
    ) {}

    get status(): ScheduleStatus {
        return this.statusValue;
    }

    subscribe(listener: (status: ScheduleStatus) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async refresh(now = new Date()): Promise<ScheduleStatus> {
        this.generation += 1;
        const generation = this.generation;
        this.abort?.abort();
        this.abort = new AbortController();
        const rule = winningRule(this.repository.load().rules, now);
        if (rule === null) {
            this.store.replaceScheduledOverrides({});
            return this.setStatus({ kind: "idle", message: "No matching rule." });
        }
        try {
            const refreshMinutes = rule.source.kind === "local" ? 0 : rule.source.refreshMinutes;
            const cached = this.externalCache.get(rule.id);
            const canReuse =
                cached !== undefined && now.getTime() - cached.at < refreshMinutes * 60_000;
            const resolved = canReuse
                ? cached
                : await this.client.values(rule, this.store, this.abort.signal);
            if (generation !== this.generation) return this.statusValue;
            if (!canReuse && rule.source.kind !== "local") {
                this.externalCache.set(rule.id, {
                    at: now.getTime(),
                    values: resolved.values,
                    off: resolved.off,
                });
            }
            if (resolved.off) {
                this.store.replaceScheduledOverrides({});
                return this.setStatus({ kind: "off", ruleId: rule.id });
            }
            const ids = this.store.replaceScheduledOverrides(resolved.values);
            return this.setStatus({ kind: "applied", ruleId: rule.id, ids });
        } catch (error) {
            if (generation !== this.generation) return this.statusValue;
            this.store.replaceScheduledOverrides({});
            return this.setStatus({ kind: "error", ruleId: rule.id, code: errorCode(error) });
        }
    }

    start(): void {
        if (this.timer !== null) return;
        void this.refresh();
        this.timer = globalThis.setInterval(() => void this.refresh(), 60_000) as unknown as number;
    }

    destroy(): void {
        this.generation += 1;
        this.abort?.abort();
        if (this.timer !== null) globalThis.clearInterval(this.timer);
        this.timer = null;
        this.store.replaceScheduledOverrides({});
        this.listeners.clear();
    }

    private setStatus(status: ScheduleStatus): ScheduleStatus {
        this.statusValue = status;
        for (const listener of [...this.listeners]) listener(status);
        return status;
    }
}

function reviveDocument(value: unknown, store: SettingsStore): ScheduleDocument | undefined {
    if (
        !isRecord(value) ||
        value["version"] !== SCHEDULE_SCHEMA_VERSION ||
        !Array.isArray(value["rules"])
    )
        return undefined;
    if (value["rules"].length > MAX_SCHEDULE_RULES) return undefined;
    const rules: ScheduledSettingsRule[] = [];
    for (const raw of value["rules"]) {
        const rule = reviveRule(raw);
        if (
            rule === undefined ||
            validateRule(rule, store).length > 0 ||
            rules.some((existing) => existing.id === rule.id)
        )
            return undefined;
        rules.push(rule);
    }
    return { version: SCHEDULE_SCHEMA_VERSION, rules };
}

function reviveRule(value: unknown): ScheduledSettingsRule | undefined {
    if (!isRecord(value) || !isRecord(value["values"]) || !isRecord(value["source"]))
        return undefined;
    const sourceRaw = value["source"];
    let source: ScheduleSource;
    if (sourceRaw["kind"] === "local") source = { kind: "local" };
    else if (
        sourceRaw["kind"] === "api" &&
        typeof sourceRaw["url"] === "string" &&
        typeof sourceRaw["refreshMinutes"] === "number"
    ) {
        source = {
            kind: "api",
            url: sourceRaw["url"],
            refreshMinutes: sourceRaw["refreshMinutes"],
        };
    } else if (
        sourceRaw["kind"] === "home-assistant" &&
        typeof sourceRaw["baseUrl"] === "string" &&
        typeof sourceRaw["entityId"] === "string" &&
        typeof sourceRaw["credentialKey"] === "string" &&
        typeof sourceRaw["refreshMinutes"] === "number"
    ) {
        source = {
            kind: "home-assistant",
            baseUrl: sourceRaw["baseUrl"],
            entityId: sourceRaw["entityId"],
            credentialKey: sourceRaw["credentialKey"],
            refreshMinutes: sourceRaw["refreshMinutes"],
        };
    } else return undefined;
    if (
        typeof value["id"] !== "string" ||
        typeof value["label"] !== "string" ||
        typeof value["enabled"] !== "boolean" ||
        typeof value["priority"] !== "number" ||
        typeof value["timezone"] !== "string" ||
        typeof value["startDate"] !== "string" ||
        typeof value["endDate"] !== "string" ||
        typeof value["startTime"] !== "string" ||
        typeof value["endTime"] !== "string" ||
        typeof value["everyDay"] !== "boolean" ||
        !Array.isArray(value["weekdays"])
    )
        return undefined;
    const values: Record<string, SettingValue> = {};
    for (const [id, raw] of Object.entries(value["values"])) {
        if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean")
            return undefined;
        values[id] = raw;
    }
    return {
        id: value["id"],
        label: value["label"],
        enabled: value["enabled"],
        priority: value["priority"],
        timezone: value["timezone"],
        startDate: value["startDate"],
        endDate: value["endDate"],
        startTime: value["startTime"],
        endTime: value["endTime"],
        everyDay: value["everyDay"],
        weekdays: value["weekdays"].filter((day): day is number => typeof day === "number"),
        values,
        source,
    };
}

function reviveHistory(value: unknown): ScheduleHistoryEntry[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.flatMap((raw) => {
        if (
            !isRecord(raw) ||
            typeof raw["id"] !== "string" ||
            typeof raw["at"] !== "string" ||
            !["saved", "imported", "reset"].includes(String(raw["action"])) ||
            !isRecord(raw["document"])
        )
            return [];
        return [
            {
                id: raw["id"],
                at: raw["at"],
                action: raw["action"] as ScheduleHistoryEntry["action"],
                document: raw["document"] as unknown as ScheduleDocument,
            },
        ];
    });
}

function validatedValues(
    raw: Record<string, unknown>,
    store: SettingsStore,
): Record<string, SettingValue> {
    const values: Record<string, SettingValue> = {};
    for (const [id, candidate] of Object.entries(raw)) {
        if (
            typeof candidate !== "string" &&
            typeof candidate !== "number" &&
            typeof candidate !== "boolean"
        )
            continue;
        const value = store.validate(id, candidate);
        if (value !== null) values[id] = value;
    }
    if (Object.keys(values).length === 0) throw new Error("no-allowed-values");
    return values;
}

function zonedParts(
    date: Date,
    timezone: string,
): { date: string; time: string; weekday: number } | null {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            weekday: "short",
        }).formatToParts(date);
        const read = (type: Intl.DateTimeFormatPartTypes): string =>
            parts.find((part) => part.type === type)?.value ?? "";
        const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(read("weekday"));
        return {
            date: `${read("year")}-${read("month")}-${read("day")}`,
            time: `${read("hour")}:${read("minute")}`,
            weekday,
        };
    } catch {
        return null;
    }
}

function minutes(time: string): number {
    const [hour = "0", minute = "0"] = time.split(":");
    return Number(hour) * 60 + Number(minute);
}

function validDate(value: string): boolean {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month &&
        date.getUTCDate() === day
    );
}

function validRefresh(value: number): boolean {
    return Number.isInteger(value) && value >= MIN_REFRESH_MINUTES && value <= MAX_REFRESH_MINUTES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 80) : "unknown";
}

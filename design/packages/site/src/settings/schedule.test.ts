// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { Preferences } from "../platform/Preferences.js";
import {
    ExternalSettingsClient,
    MAX_EXTERNAL_BYTES,
    MAX_SCHEDULE_RULES,
    ScheduleRepository,
    ScheduledSettingsController,
    defaultRule,
    ruleMatches,
    validateExternalUrl,
    validateRule,
    winningRule,
    type ScheduledSettingsRule,
} from "./schedule.js";
import { SETTINGS } from "./schema.js";
import { SettingsStore } from "./store.js";

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length(): number {
        return this.values.size;
    }
    clear(): void {
        this.values.clear();
    }
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }
    removeItem(key: string): void {
        this.values.delete(key);
    }
    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

function setup(): {
    storage: Storage;
    prefs: Preferences;
    store: SettingsStore;
    repository: ScheduleRepository;
} {
    const storage = new MemoryStorage();
    const prefs = new Preferences(storage);
    const store = new SettingsStore(prefs);
    store.register(SETTINGS);
    return { storage, prefs, store, repository: new ScheduleRepository(prefs, store) };
}

function rule(overrides: Partial<ScheduledSettingsRule> = {}): ScheduledSettingsRule {
    return { ...defaultRule(), timezone: "UTC", ...overrides };
}

describe("scheduled settings validation and matching", () => {
    it("accepts HTTPS and loopback HTTP but refuses credentials, fragments, and cleartext hosts", () => {
        expect(validateExternalUrl("https://example.test/settings.json").ok).toBe(true);
        expect(validateExternalUrl("http://127.0.0.1:8123/api").ok).toBe(true);
        expect(validateExternalUrl("http://example.test/api")).toEqual({
            ok: false,
            code: "https-required",
        });
        expect(validateExternalUrl("https://a:b@example.test/")).toEqual({
            ok: false,
            code: "credentials-in-url",
        });
        expect(validateExternalUrl("https://example.test/#secret")).toEqual({
            ok: false,
            code: "fragment",
        });
    });

    it("validates ids, dates, weekdays, values, refresh bounds, and Home Assistant entities", () => {
        const { store } = setup();
        expect(validateRule(rule(), store)).toEqual([]);
        const invalid = rule({
            id: "No spaces allowed",
            startDate: "2026-02-31",
            everyDay: false,
            weekdays: [],
            values: { missing: true },
            source: {
                kind: "home-assistant",
                baseUrl: "http://example.test",
                entityId: "light.kitchen",
                credentialKey: "",
                refreshMinutes: 1,
            },
        });
        expect(validateRule(invalid, store)).toEqual(
            expect.arrayContaining([
                "id",
                "start-date",
                "weekdays-empty",
                "value:missing",
                "ha-url",
                "ha-entity",
                "ha-credential-key",
                "refresh",
            ]),
        );
    });

    it("supports weekday, date, timezone, cross-midnight, and full-day equal endpoints", () => {
        const fridayNight = rule({
            everyDay: false,
            weekdays: [5],
            startDate: "2026-08-07",
            endDate: "2026-08-07",
            startTime: "22:00",
            endTime: "02:00",
        });
        expect(ruleMatches(fridayNight, new Date("2026-08-07T23:00:00Z"))).toBe(true);
        expect(ruleMatches(fridayNight, new Date("2026-08-08T01:30:00Z"))).toBe(true);
        expect(ruleMatches(fridayNight, new Date("2026-08-08T03:00:00Z"))).toBe(false);
        const fullDay = rule({ startTime: "00:00", endTime: "00:00" });
        expect(ruleMatches(fullDay, new Date("2026-08-07T14:19:00Z"))).toBe(true);
        const toronto = rule({ timezone: "America/Toronto", startTime: "09:00", endTime: "10:00" });
        expect(ruleMatches(toronto, new Date("2026-08-07T13:30:00Z"))).toBe(true);
    });

    it("uses higher priority, then the later rule for a stable tie", () => {
        const now = new Date("2026-08-07T12:00:00Z");
        expect(
            winningRule([rule({ id: "one", priority: 10 }), rule({ id: "two", priority: 10 })], now)
                ?.id,
        ).toBe("two");
        expect(
            winningRule([rule({ id: "one", priority: 11 }), rule({ id: "two", priority: 10 })], now)
                ?.id,
        ).toBe("one");
    });
});

describe("schedule persistence and recoverability", () => {
    it("persists a versioned document, bounds the rule count, records history, and restores a prior base", () => {
        const { prefs, store, repository } = setup();
        const first = { version: 1 as const, rules: [rule({ label: "Morning" })] };
        expect(repository.save(first)).toEqual([]);
        expect(new ScheduleRepository(prefs, store).load()).toEqual(first);
        expect(
            repository.save({
                version: 1,
                rules: Array.from({ length: MAX_SCHEDULE_RULES + 1 }, (_, index) =>
                    rule({ id: `rule-${index}` }),
                ),
            }),
        ).toEqual(["document"]);
        const historyId = repository.history()[0]?.id;
        repository.reset();
        expect(repository.load().rules).toHaveLength(0);
        expect(historyId).toBeDefined();
        expect(repository.restore(historyId ?? "missing")).toEqual([]);
        expect(repository.load()).toEqual(first);
    });

    it("fails closed on an unknown schema version", () => {
        const { storage, prefs, store } = setup();
        storage.setItem(
            "mbm-site:scheduled-settings.rules",
            JSON.stringify({ version: 99, rules: [rule()] }),
        );
        expect(new ScheduleRepository(prefs, store).load()).toEqual({ version: 1, rules: [] });
    });
});

describe("external rule sources", () => {
    it("allowlists API values and ignores unknown fields", async () => {
        const { store } = setup();
        const client = new ExternalSettingsClient({
            fetcher: vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            version: 1,
                            values: { "theme.mode": "dark", unknown: "nope" },
                            ignored: true,
                        }),
                        { status: 200 },
                    ),
            ) as typeof fetch,
        });
        const result = await client.values(
            rule({
                values: {},
                source: { kind: "api", url: "https://example.test/rule", refreshMinutes: 5 },
            }),
            store,
            new AbortController().signal,
        );
        expect(result).toEqual({ values: { "theme.mode": "dark" }, off: false });
    });

    it.each([
        [302, "redirect", ""],
        [401, "authentication", "{}"],
        [429, "rate-limited", "{}"],
        [200, "malformed-json", "not-json"],
    ])("reports HTTP %s as %s", async (status, code, body) => {
        const { store } = setup();
        const client = new ExternalSettingsClient({
            fetcher: vi.fn(
                async () =>
                    new Response(body, {
                        status,
                        headers: status === 302 ? { location: "https://elsewhere.test" } : {},
                    }),
            ) as typeof fetch,
        });
        await expect(
            client.values(
                rule({
                    values: {},
                    source: { kind: "api", url: "https://example.test/rule", refreshMinutes: 5 },
                }),
                store,
                new AbortController().signal,
            ),
        ).rejects.toThrow(code);
    });

    it("refuses an oversized response even when the server omits content-length", async () => {
        const { store } = setup();
        const client = new ExternalSettingsClient({
            fetcher: vi.fn(
                async () => new Response("x".repeat(MAX_EXTERNAL_BYTES + 1), { status: 200 }),
            ) as typeof fetch,
        });
        await expect(
            client.values(
                rule({
                    values: {},
                    source: { kind: "api", url: "https://example.test/rule", refreshMinutes: 5 },
                }),
                store,
                new AbortController().signal,
            ),
        ).rejects.toThrow("too-large");
    });

    it("reads Home Assistant on/off through an injected secret provider without putting a token in the rule", async () => {
        const { store } = setup();
        const fetcher = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
            expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
                "Bearer kept-out-of-settings",
            );
            return new Response(JSON.stringify({ state: "on" }), { status: 200 });
        }) as typeof fetch;
        const client = new ExternalSettingsClient({
            fetcher,
            secrets: { tokenFor: async () => "kept-out-of-settings" },
        });
        const result = await client.values(
            rule({
                source: {
                    kind: "home-assistant",
                    baseUrl: "https://ha.example.test",
                    entityId: "input_boolean.site_dark",
                    credentialKey: "ha-main",
                    refreshMinutes: 5,
                },
                values: { "theme.mode": "dark" },
            }),
            store,
            new AbortController().signal,
        );
        expect(result).toEqual({ values: { "theme.mode": "dark" }, off: false });
        const missing = new ExternalSettingsClient({
            fetcher,
            secrets: { tokenFor: async () => null },
        });
        await expect(
            missing.values(
                rule({
                    source: {
                        kind: "home-assistant",
                        baseUrl: "https://ha.example.test",
                        entityId: "input_boolean.site_dark",
                        credentialKey: "ha-main",
                        refreshMinutes: 5,
                    },
                }),
                store,
                new AbortController().signal,
            ),
        ).rejects.toThrow("missing-token");
    });
});

describe("scheduled override controller", () => {
    it("applies an effective layer and restores the untouched base when no rule matches", async () => {
        const { store, repository } = setup();
        store.set("theme.mode", "light");
        repository.save({ version: 1, rules: [rule({ values: { "theme.mode": "dark" } })] });
        const controller = new ScheduledSettingsController(repository, store);
        await controller.refresh(new Date("2026-08-07T12:00:00Z"));
        expect(store.getString("theme.mode")).toBe("dark");
        expect(store.provenance("theme.mode")).toBe("scheduled-override");
        expect(store.snapshot()["theme.mode"]).toBe("light");
        await controller.refresh(new Date("2026-08-07T20:00:00Z"));
        expect(store.getString("theme.mode")).toBe("light");
    });

    it("ignores a superseded external generation", async () => {
        const { store, repository } = setup();
        repository.save({
            version: 1,
            rules: [
                rule({
                    values: {},
                    source: { kind: "api", url: "https://example.test/rule", refreshMinutes: 5 },
                }),
            ],
        });
        let resolveFirst: ((value: Response) => void) | undefined;
        const fetcher = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveFirst = resolve;
                    }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ version: 1, values: { "theme.mode": "light" } }), {
                    status: 200,
                }),
            ) as typeof fetch;
        const controller = new ScheduledSettingsController(
            repository,
            store,
            new ExternalSettingsClient({ fetcher }),
        );
        const stale = controller.refresh(new Date("2026-08-07T12:00:00Z"));
        const current = controller.refresh(new Date("2026-08-07T12:06:00Z"));
        await current;
        resolveFirst?.(
            new Response(JSON.stringify({ version: 1, values: { "theme.mode": "dark" } }), {
                status: 200,
            }),
        );
        await stale;
        expect(store.getString("theme.mode")).toBe("light");
    });
});

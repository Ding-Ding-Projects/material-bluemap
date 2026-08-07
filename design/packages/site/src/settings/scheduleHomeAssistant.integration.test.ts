import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Preferences } from "../platform/Preferences.js";
import {
    ExternalSettingsClient,
    ScheduleRepository,
    ScheduledSettingsController,
    SessionSecretProvider,
    defaultRule,
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
    dump(): string {
        return JSON.stringify([...this.values.entries()]);
    }
}

const servers = new Set<Server>();

afterEach(async () => {
    await Promise.all(
        [...servers].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    servers.clear();
    vi.restoreAllMocks();
});

async function fakeHomeAssistant(
    reply: (authorization: string | undefined) => { status: number; body: unknown },
): Promise<string> {
    const server = createServer((request, response) => {
        if (request.url !== "/api/states/input_boolean.site_theme") {
            response.writeHead(404).end();
            return;
        }
        const result = reply(request.headers.authorization);
        response.writeHead(result.status, { "content-type": "application/json" });
        response.end(JSON.stringify(result.body));
    });
    servers.add(server);
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    return "http://127.0.0.1:" + address.port;
}

function fixture(baseUrl: string): {
    storage: MemoryStorage;
    store: SettingsStore;
    repository: ScheduleRepository;
    secrets: SessionSecretProvider;
    high: ScheduledSettingsRule;
    low: ScheduledSettingsRule;
} {
    const storage = new MemoryStorage();
    const prefs = new Preferences(storage);
    const store = new SettingsStore(prefs);
    store.register(SETTINGS);
    store.set("theme.mode", "light");
    const repository = new ScheduleRepository(prefs, store);
    const common = {
        timezone: "UTC",
        startTime: "00:00",
        endTime: "00:00",
    } as const;
    const high = {
        ...defaultRule(),
        ...common,
        id: "home-assistant-high",
        label: "Home Assistant high priority",
        priority: 100,
        values: { "theme.mode": "dark" },
        source: {
            kind: "home-assistant" as const,
            baseUrl,
            entityId: "input_boolean.site_theme",
            credentialKey: "ha-high",
            refreshMinutes: 5,
        },
    };
    const low = {
        ...defaultRule(),
        ...common,
        id: "local-low",
        label: "Local fallback",
        priority: 10,
        values: { "theme.mode": "system" },
    };
    repository.save({ version: 1, rules: [low, high] });
    return { storage, store, repository, secrets: new SessionSecretProvider(), high, low };
}

describe("Home Assistant static-site integration", () => {
    it("applies the higher-priority Home Assistant rule when the live entity is on", async () => {
        const baseUrl = await fakeHomeAssistant((authorization) => {
            expect(authorization).toBe("Bearer session-only-token");
            return { status: 200, body: { state: "on" } };
        });
        const state = fixture(baseUrl);
        state.secrets.setToken("ha-high", "session-only-token");
        const controller = new ScheduledSettingsController(
            state.repository,
            state.store,
            new ExternalSettingsClient({ secrets: state.secrets }),
        );

        expect(await controller.refresh(new Date("2026-08-07T12:00:00Z"))).toEqual({
            kind: "applied",
            ruleId: state.high.id,
            ids: ["theme.mode"],
        });
        expect(state.store.getString("theme.mode")).toBe("dark");
    });

    it("treats off as a non-match and falls through to the lower-priority rule", async () => {
        const baseUrl = await fakeHomeAssistant(() => ({ status: 200, body: { state: "off" } }));
        const state = fixture(baseUrl);
        state.secrets.setToken("ha-high", "session-only-token");
        const controller = new ScheduledSettingsController(
            state.repository,
            state.store,
            new ExternalSettingsClient({ secrets: state.secrets }),
        );

        expect(await controller.refresh(new Date("2026-08-07T12:00:00Z"))).toEqual({
            kind: "applied",
            ruleId: state.low.id,
            ids: ["theme.mode"],
        });
        expect(state.store.getString("theme.mode")).toBe("system");
    });

    it.each([
        [503, "http-503"],
        [401, "authentication"],
    ])("fails closed on HTTP %s without silently applying the fallback", async (status, code) => {
        const baseUrl = await fakeHomeAssistant(() => ({ status, body: { state: "unavailable" } }));
        const state = fixture(baseUrl);
        state.secrets.setToken("ha-high", "session-only-token");
        const controller = new ScheduledSettingsController(
            state.repository,
            state.store,
            new ExternalSettingsClient({ secrets: state.secrets }),
        );

        expect(await controller.refresh(new Date("2026-08-07T12:00:00Z"))).toEqual({
            kind: "error",
            ruleId: state.high.id,
            code,
        });
        expect(state.store.getString("theme.mode")).toBe("light");
    });

    it("never persists, exports, or logs the session token and reload starts empty", async () => {
        const secret = "do-not-persist-export-or-log";
        const baseUrl = await fakeHomeAssistant(() => ({ status: 200, body: { state: "on" } }));
        const state = fixture(baseUrl);
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(state.secrets.setToken("ha-high", secret)).toBe(true);
        const controller = new ScheduledSettingsController(
            state.repository,
            state.store,
            new ExternalSettingsClient({ secrets: state.secrets }),
        );
        await controller.refresh(new Date("2026-08-07T12:00:00Z"));

        expect(state.storage.dump()).not.toContain(secret);
        expect(JSON.stringify(state.repository.load())).not.toContain(secret);
        expect(log).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(await new SessionSecretProvider().tokenFor("ha-high")).toBeNull();
        state.secrets.clearAll();
        expect(await state.secrets.tokenFor("ha-high")).toBeNull();
    });
});

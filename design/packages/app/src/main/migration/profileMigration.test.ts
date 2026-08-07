import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    PROFILE_MIGRATION_CONSENT_FILE,
    PROFILE_MIGRATION_RECEIPT_FILE,
    PROFILE_MIGRATION_TRANSACTION_FILE,
    migrateWorldlensProfile,
    profileMigrationPlan,
    type ProfileMigrationCheckpoint,
} from "./profileMigration.js";

const roots: string[] = [];
const now = () => new Date("2026-08-07T05:00:00.000Z");

function root(): string {
    const value = mkdtempSync(join(tmpdir(), "worldlens-profile-migration-"));
    roots.push(value);
    return value;
}

afterEach(() => {
    for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

async function put(path: string, text: string): Promise<void> {
    await mkdir(join(path, "nested"), { recursive: true });
    await writeFile(join(path, "settings.json"), text, "utf8");
    await writeFile(join(path, "nested", "history.json"), `${text}-history`, "utf8");
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

describe("Worldlens profile migration", () => {
    it("migrates an old-only profile through verified staging and keeps the old copy", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await put(plan.legacyDirectory, "legacy");
        await writeFile(
            join(plan.legacyDirectory, "github-account.json"),
            JSON.stringify({ credentialReference: "os-credential-store:account-1" }),
            "utf8",
        );
        const requestConsent = vi.fn().mockResolvedValue("accept");

        const outcome = await migrateWorldlensProfile({
            appDataDirectory: appData,
            requestConsent,
            now,
        });

        expect(outcome).toMatchObject({ kind: "migrated", files: 3 });
        expect(requestConsent).toHaveBeenCalledOnce();
        expect(await readFile(join(plan.worldlensDirectory, "settings.json"), "utf8")).toBe(
            "legacy",
        );
        expect(await readFile(join(plan.legacyDirectory, "settings.json"), "utf8")).toBe("legacy");
        expect(
            await readFile(join(plan.worldlensDirectory, "github-account.json"), "utf8"),
        ).toContain("os-credential-store:account-1");
        expect(JSON.stringify(outcome)).not.toContain("os-credential-store:account-1");
        expect(
            JSON.parse(
                await readFile(
                    join(plan.worldlensDirectory, PROFILE_MIGRATION_RECEIPT_FILE),
                    "utf8",
                ),
            ),
        ).toMatchObject({ product: "Worldlens", oldProfileRetained: true, status: "verified" });
    });

    it("does nothing on a clean Worldlens-only install", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await put(plan.worldlensDirectory, "current");
        const requestConsent = vi.fn().mockResolvedValue("accept");
        expect(
            await migrateWorldlensProfile({ appDataDirectory: appData, requestConsent, now }),
        ).toMatchObject({
            kind: "no-legacy-profile",
        });
        expect(requestConsent).not.toHaveBeenCalled();
    });

    it("merges disjoint old and new roots and preserves the previous Worldlens root as a backup", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await mkdir(plan.legacyDirectory, { recursive: true });
        await writeFile(join(plan.legacyDirectory, "legacy.json"), "old", "utf8");
        await mkdir(plan.worldlensDirectory, { recursive: true });
        await writeFile(join(plan.worldlensDirectory, "new.json"), "new", "utf8");

        const outcome = await migrateWorldlensProfile({
            appDataDirectory: appData,
            requestConsent: async () => "accept",
            now,
        });
        expect(outcome.kind).toBe("migrated");
        expect(await readFile(join(plan.worldlensDirectory, "legacy.json"), "utf8")).toBe("old");
        expect(await readFile(join(plan.worldlensDirectory, "new.json"), "utf8")).toBe("new");
        expect(
            (await readdir(appData)).some((name) => name.startsWith("Worldlens.pre-migration-")),
        ).toBe(true);
    });

    it("refuses divergent collisions without changing either root", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await mkdir(plan.legacyDirectory, { recursive: true });
        await mkdir(plan.worldlensDirectory, { recursive: true });
        await writeFile(join(plan.legacyDirectory, "settings.json"), "old", "utf8");
        await writeFile(join(plan.worldlensDirectory, "settings.json"), "new", "utf8");

        const outcome = await migrateWorldlensProfile({
            appDataDirectory: appData,
            requestConsent: async () => "accept",
            now,
        });
        expect(outcome).toEqual(
            expect.objectContaining({ kind: "collision", paths: ["settings.json"] }),
        );
        expect(await readFile(join(plan.legacyDirectory, "settings.json"), "utf8")).toBe("old");
        expect(await readFile(join(plan.worldlensDirectory, "settings.json"), "utf8")).toBe("new");
    });

    it("quarantines a partial staging directory and retries from the retained old profile", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await put(plan.legacyDirectory, "legacy");
        await mkdir(plan.stagingDirectory, { recursive: true });
        await writeFile(join(plan.stagingDirectory, "half-written"), "partial", "utf8");

        const outcome = await migrateWorldlensProfile({
            appDataDirectory: appData,
            requestConsent: async () => "accept",
            now,
        });
        expect(outcome.kind).toBe("migrated");
        expect((await readdir(appData)).some((name) => name.includes("staging.partial-"))).toBe(
            true,
        );
        expect(await readFile(join(plan.worldlensDirectory, "settings.json"), "utf8")).toBe(
            "legacy",
        );
    });

    it("persists denial, does not nag, and supports an explicit retry", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await put(plan.legacyDirectory, "legacy");
        const deny = vi.fn().mockResolvedValue("deny");
        expect(
            await migrateWorldlensProfile({ appDataDirectory: appData, requestConsent: deny, now }),
        ).toMatchObject({
            kind: "denied",
        });
        expect(deny).toHaveBeenCalledOnce();
        expect(
            JSON.parse(await readFile(join(appData, PROFILE_MIGRATION_CONSENT_FILE), "utf8")),
        ).toMatchObject({ decision: "deny" });

        const shouldNotRun = vi.fn().mockResolvedValue("accept");
        expect(
            await migrateWorldlensProfile({
                appDataDirectory: appData,
                requestConsent: shouldNotRun,
                now,
            }),
        ).toMatchObject({ kind: "denied" });
        expect(shouldNotRun).not.toHaveBeenCalled();

        expect(
            await migrateWorldlensProfile({
                appDataDirectory: appData,
                requestConsent: async () => "accept",
                retryDenied: true,
                now,
            }),
        ).toMatchObject({ kind: "migrated" });
    });

    it("reports corrupt consent and receipt records instead of guessing", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await put(plan.legacyDirectory, "legacy");
        await writeFile(join(appData, PROFILE_MIGRATION_CONSENT_FILE), "not json", "utf8");
        expect(
            await migrateWorldlensProfile({
                appDataDirectory: appData,
                requestConsent: async () => "accept",
                now,
            }),
        ).toMatchObject({ kind: "corrupt" });

        const second = root();
        const secondPlan = profileMigrationPlan(second);
        await put(secondPlan.legacyDirectory, "legacy");
        await mkdir(secondPlan.worldlensDirectory, { recursive: true });
        await writeFile(
            join(secondPlan.worldlensDirectory, PROFILE_MIGRATION_RECEIPT_FILE),
            "{}",
            "utf8",
        );
        expect(
            await migrateWorldlensProfile({
                appDataDirectory: second,
                requestConsent: async () => "accept",
                now,
            }),
        ).toMatchObject({ kind: "corrupt" });
    });

    it("refuses a corrupt transaction journal before touching either profile", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await mkdir(plan.legacyDirectory, { recursive: true });
        await writeFile(join(plan.legacyDirectory, "legacy.json"), "old", "utf8");
        await mkdir(plan.worldlensDirectory, { recursive: true });
        await writeFile(join(plan.worldlensDirectory, "current.json"), "current", "utf8");
        await writeFile(join(appData, PROFILE_MIGRATION_TRANSACTION_FILE), "{}", "utf8");

        const outcome = await migrateWorldlensProfile({
            appDataDirectory: appData,
            requestConsent: async () => "accept",
            now,
        });

        expect(outcome).toMatchObject({ kind: "corrupt" });
        expect(await readFile(join(plan.legacyDirectory, "legacy.json"), "utf8")).toBe("old");
        expect(await readFile(join(plan.worldlensDirectory, "current.json"), "utf8")).toBe(
            "current",
        );
    });

    it("rolls activation back to a pre-existing Worldlens root when read-back fails", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await mkdir(plan.legacyDirectory, { recursive: true });
        await writeFile(join(plan.legacyDirectory, "legacy.json"), "old", "utf8");
        await mkdir(plan.worldlensDirectory, { recursive: true });
        await writeFile(join(plan.worldlensDirectory, "new.json"), "new", "utf8");

        const outcome = await migrateWorldlensProfile({
            appDataDirectory: appData,
            requestConsent: async () => "accept",
            now,
            verifyActivatedProfile: async () => {
                throw new Error("simulated disk read-back failure");
            },
        });
        expect(outcome).toMatchObject({
            kind: "failed",
            message: "simulated disk read-back failure",
        });
        expect(await readFile(join(plan.worldlensDirectory, "new.json"), "utf8")).toBe("new");
        expect(await readFile(join(plan.legacyDirectory, "legacy.json"), "utf8")).toBe("old");
        expect((await readdir(appData)).some((name) => name.startsWith("Worldlens.failed-"))).toBe(
            true,
        );
    });

    const activationCheckpoints: readonly ProfileMigrationCheckpoint[] = [
        "before-backup-rename",
        "after-backup-rename",
        "before-receipt-write",
        "after-receipt-write",
        "before-staging-activation",
        "after-staging-activation",
        "before-verification",
        "after-verification",
    ];

    for (const crashAt of activationCheckpoints) {
        it(`recovers a process crash at ${crashAt} without stranding either profile`, async () => {
            const appData = root();
            const plan = profileMigrationPlan(appData);
            await mkdir(plan.legacyDirectory, { recursive: true });
            await writeFile(join(plan.legacyDirectory, "legacy.json"), "old", "utf8");
            await mkdir(plan.worldlensDirectory, { recursive: true });
            await writeFile(join(plan.worldlensDirectory, "current.json"), "current", "utf8");

            await expect(
                migrateWorldlensProfile({
                    appDataDirectory: appData,
                    requestConsent: async () => "accept",
                    now,
                    onCheckpoint: async (point) =>
                        point === crashAt ? "simulate-crash" : undefined,
                }),
            ).rejects.toThrow(`Simulated process crash at ${crashAt}.`);

            const recovered = await migrateWorldlensProfile({
                appDataDirectory: appData,
                requestConsent: async () => "accept",
                now,
            });

            expect(["migrated", "already-migrated"]).toContain(recovered.kind);
            expect(await readFile(join(plan.worldlensDirectory, "current.json"), "utf8")).toBe(
                "current",
            );
            expect(await readFile(join(plan.worldlensDirectory, "legacy.json"), "utf8")).toBe(
                "old",
            );
            expect(await readFile(join(plan.legacyDirectory, "legacy.json"), "utf8")).toBe("old");
            expect(await exists(join(appData, PROFILE_MIGRATION_TRANSACTION_FILE))).toBe(false);
        });
    }

    for (const failAt of [
        "before-backup-rename",
        "after-backup-rename",
        "before-receipt-write",
        "after-receipt-write",
        "before-staging-activation",
        "after-staging-activation",
    ] as const) {
        it(`recovers an ordinary failure at ${failAt} and permits a clean retry`, async () => {
            const appData = root();
            const plan = profileMigrationPlan(appData);
            await mkdir(plan.legacyDirectory, { recursive: true });
            await writeFile(join(plan.legacyDirectory, "legacy.json"), "old", "utf8");
            await mkdir(plan.worldlensDirectory, { recursive: true });
            await writeFile(join(plan.worldlensDirectory, "current.json"), "current", "utf8");

            const failed = await migrateWorldlensProfile({
                appDataDirectory: appData,
                requestConsent: async () => "accept",
                now,
                onCheckpoint: async (point) => {
                    if (point === failAt) throw new Error(`injected failure at ${failAt}`);
                },
            });
            expect(failed).toMatchObject({
                kind: "failed",
                message: `injected failure at ${failAt}`,
            });
            expect(await readFile(join(plan.legacyDirectory, "legacy.json"), "utf8")).toBe("old");
            expect(await exists(join(appData, PROFILE_MIGRATION_TRANSACTION_FILE))).toBe(false);

            const retried = await migrateWorldlensProfile({
                appDataDirectory: appData,
                requestConsent: async () => "accept",
                now,
            });
            expect(["migrated", "already-migrated"]).toContain(retried.kind);
            expect(await readFile(join(plan.worldlensDirectory, "current.json"), "utf8")).toBe(
                "current",
            );
            expect(await readFile(join(plan.worldlensDirectory, "legacy.json"), "utf8")).toBe(
                "old",
            );
        });
    }

    for (const crashAt of ["before-rollback", "after-rollback"] as const) {
        it(`finishes a rollback interrupted at ${crashAt} and preserves current-only data`, async () => {
            const appData = root();
            const plan = profileMigrationPlan(appData);
            await mkdir(plan.legacyDirectory, { recursive: true });
            await writeFile(join(plan.legacyDirectory, "legacy.json"), "old", "utf8");
            await mkdir(plan.worldlensDirectory, { recursive: true });
            await writeFile(join(plan.worldlensDirectory, "current.json"), "current", "utf8");

            await expect(
                migrateWorldlensProfile({
                    appDataDirectory: appData,
                    requestConsent: async () => "accept",
                    now,
                    verifyActivatedProfile: async () => {
                        throw new Error("injected verification failure");
                    },
                    onCheckpoint: async (point) =>
                        point === crashAt ? "simulate-crash" : undefined,
                }),
            ).rejects.toThrow(`Simulated process crash at ${crashAt}.`);

            const retried = await migrateWorldlensProfile({
                appDataDirectory: appData,
                requestConsent: async () => "accept",
                now,
            });
            expect(["migrated", "already-migrated"]).toContain(retried.kind);
            expect(await readFile(join(plan.worldlensDirectory, "current.json"), "utf8")).toBe(
                "current",
            );
            expect(await readFile(join(plan.worldlensDirectory, "legacy.json"), "utf8")).toBe(
                "old",
            );
            expect(await readFile(join(plan.legacyDirectory, "legacy.json"), "utf8")).toBe("old");
            expect(await exists(join(appData, PROFILE_MIGRATION_TRANSACTION_FILE))).toBe(false);
        });
    }

    it("is idempotent after a verified receipt", async () => {
        const appData = root();
        const plan = profileMigrationPlan(appData);
        await put(plan.legacyDirectory, "legacy");
        const consent = vi.fn().mockResolvedValue("accept");
        expect(
            await migrateWorldlensProfile({
                appDataDirectory: appData,
                requestConsent: consent,
                now,
            }),
        ).toMatchObject({
            kind: "migrated",
        });
        expect(
            await migrateWorldlensProfile({
                appDataDirectory: appData,
                requestConsent: consent,
                now,
            }),
        ).toMatchObject({
            kind: "already-migrated",
        });
        expect(consent).toHaveBeenCalledOnce();
    });
});

import { createHash, randomBytes } from "node:crypto";
import {
    copyFile,
    mkdir,
    open,
    readFile,
    readdir,
    rename,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { LEGACY_MATERIAL_BLUEMAP_IDENTITY, WORLDLENS_IDENTITY } from "@worldlens/shared";

export const PROFILE_MIGRATION_VERSION = 1;
export const PROFILE_MIGRATION_CONSENT_FILE = ".worldlens-profile-migration-consent.json";
export const PROFILE_MIGRATION_RECEIPT_FILE = ".worldlens-profile-migration.json";
export const PROFILE_MIGRATION_TRANSACTION_FILE = ".worldlens-profile-migration-transaction.json";
const STAGING_NAME = ".worldlens-profile-migration-staging";

export interface ProfileMigrationPlan {
    readonly legacyDirectory: string;
    readonly worldlensDirectory: string;
    readonly stagingDirectory: string;
}

export type ProfileMigrationConsent = "accept" | "deny";

export type ProfileMigrationOutcome =
    | { readonly kind: "no-legacy-profile"; readonly plan: ProfileMigrationPlan }
    | { readonly kind: "already-migrated"; readonly plan: ProfileMigrationPlan }
    | { readonly kind: "denied"; readonly plan: ProfileMigrationPlan }
    | {
          readonly kind: "migrated";
          readonly plan: ProfileMigrationPlan;
          readonly files: number;
          readonly bytes: number;
      }
    | {
          readonly kind: "collision";
          readonly plan: ProfileMigrationPlan;
          readonly paths: readonly string[];
      }
    | { readonly kind: "corrupt"; readonly plan: ProfileMigrationPlan; readonly message: string }
    | { readonly kind: "failed"; readonly plan: ProfileMigrationPlan; readonly message: string };

interface ConsentRecord {
    readonly version: 1;
    readonly decision: ProfileMigrationConsent;
    readonly decidedAt: string;
}

interface ManifestEntry {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
}

interface Receipt {
    readonly version: 1;
    readonly status: "verified";
    readonly product: "Worldlens";
    readonly source: string;
    readonly target: string;
    readonly completedAt: string;
    readonly oldProfileRetained: true;
    readonly files: number;
    readonly bytes: number;
    readonly manifestSha256: string;
    readonly preMigrationWorldlensBackup: string | null;
}

export type ProfileMigrationCheckpoint =
    | "before-backup-rename"
    | "after-backup-rename"
    | "before-receipt-write"
    | "after-receipt-write"
    | "before-staging-activation"
    | "after-staging-activation"
    | "before-verification"
    | "after-verification"
    | "before-rollback"
    | "after-rollback";

type TransactionPhase =
    | "prepared"
    | "backup-renamed"
    | "receipt-written"
    | "activated"
    | "verified"
    | "rollback-started";

interface ProfileMigrationTransaction {
    readonly version: 1;
    readonly phase: TransactionPhase;
    readonly legacyDirectory: string;
    readonly worldlensDirectory: string;
    readonly stagingDirectory: string;
    readonly backupDirectory: string | null;
    readonly failedDirectory: string;
    readonly manifest: readonly ManifestEntry[];
    readonly files: number;
    readonly bytes: number;
    readonly startedAt: string;
}

class CorruptJsonError extends Error {}
class SimulatedProfileMigrationCrash extends Error {}

export interface MigrateWorldlensProfileOptions {
    readonly appDataDirectory: string;
    readonly requestConsent: (plan: ProfileMigrationPlan) => Promise<ProfileMigrationConsent>;
    readonly retryDenied?: boolean;
    readonly now?: () => Date;
    /** Test seam for the post-activation read-back; production always uses the real verifier. */
    readonly verifyActivatedProfile?: (
        directory: string,
        manifest: readonly ManifestEntry[],
    ) => Promise<void>;
    /** Test seam. Returning `simulate-crash` models process death without in-process recovery. */
    readonly onCheckpoint?: (
        checkpoint: ProfileMigrationCheckpoint,
    ) => Promise<void | "simulate-crash">;
}

function inside(parent: string, child: string): boolean {
    const rel = relative(resolve(parent), resolve(child));
    return (
        rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !resolve(rel).startsWith(sep)
    );
}

export function profileMigrationPlan(appDataDirectory: string): ProfileMigrationPlan {
    const root = resolve(appDataDirectory);
    const legacyDirectory = join(root, ...LEGACY_MATERIAL_BLUEMAP_IDENTITY.dataDirectorySegments);
    const worldlensDirectory = join(root, WORLDLENS_IDENTITY.dataDirectoryName);
    const stagingDirectory = join(root, STAGING_NAME);
    if (
        !inside(root, legacyDirectory) ||
        !inside(root, worldlensDirectory) ||
        !inside(root, stagingDirectory)
    ) {
        throw new Error("Profile migration paths escaped the application-data directory.");
    }
    return { legacyDirectory, worldlensDirectory, stagingDirectory };
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

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
    await writeFile(temp, `${JSON.stringify(value, null, 4)}\n`, "utf8");
    // Windows refuses fsync on a read-only file handle even though Unix accepts it.
    // `r+` changes no bytes; it only requests the handle capability both platforms need.
    const handle = await open(temp, "r+");
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
    await rename(temp, path);
}

async function readJson(path: string): Promise<unknown | null> {
    try {
        return JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        if (error instanceof SyntaxError) throw new CorruptJsonError(`${path} is not valid JSON.`);
        throw error;
    }
}

function consentRecord(value: unknown): ConsentRecord | null {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<ConsentRecord>;
    if (
        candidate.version !== PROFILE_MIGRATION_VERSION ||
        (candidate.decision !== "accept" && candidate.decision !== "deny") ||
        typeof candidate.decidedAt !== "string"
    ) {
        return null;
    }
    return candidate as ConsentRecord;
}

function receipt(value: unknown): Receipt | null {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<Receipt>;
    if (
        candidate.version !== PROFILE_MIGRATION_VERSION ||
        candidate.status !== "verified" ||
        candidate.product !== WORLDLENS_IDENTITY.shippedName ||
        candidate.oldProfileRetained !== true ||
        typeof candidate.manifestSha256 !== "string"
    ) {
        return null;
    }
    return candidate as Receipt;
}

function transactionRecord(
    value: unknown,
    plan: ProfileMigrationPlan,
    appDataDirectory: string,
): ProfileMigrationTransaction | null {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<ProfileMigrationTransaction>;
    const phases: readonly TransactionPhase[] = [
        "prepared",
        "backup-renamed",
        "receipt-written",
        "activated",
        "verified",
        "rollback-started",
    ];
    if (
        candidate.version !== PROFILE_MIGRATION_VERSION ||
        candidate.phase === undefined ||
        !phases.includes(candidate.phase) ||
        candidate.legacyDirectory !== plan.legacyDirectory ||
        candidate.worldlensDirectory !== plan.worldlensDirectory ||
        candidate.stagingDirectory !== plan.stagingDirectory ||
        typeof candidate.failedDirectory !== "string" ||
        !inside(appDataDirectory, candidate.failedDirectory) ||
        dirname(candidate.failedDirectory) !== dirname(plan.worldlensDirectory) ||
        !candidate.failedDirectory.startsWith(`${plan.worldlensDirectory}.failed-`) ||
        (candidate.backupDirectory !== null &&
            (typeof candidate.backupDirectory !== "string" ||
                !inside(appDataDirectory, candidate.backupDirectory) ||
                dirname(candidate.backupDirectory) !== dirname(plan.worldlensDirectory) ||
                !candidate.backupDirectory.startsWith(
                    `${plan.worldlensDirectory}.pre-migration-`,
                ))) ||
        !Array.isArray(candidate.manifest) ||
        typeof candidate.files !== "number" ||
        typeof candidate.bytes !== "number" ||
        typeof candidate.startedAt !== "string"
    ) {
        return null;
    }
    let manifestBytes = 0;
    for (const entry of candidate.manifest) {
        if (typeof entry !== "object" || entry === null) return null;
        const typed = entry as ManifestEntry;
        const segments = typeof typed.path === "string" ? typed.path.split("/") : [];
        if (
            typeof typed.path !== "string" ||
            typed.path.includes("\\") ||
            segments.length === 0 ||
            segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
            !Number.isSafeInteger(typed.bytes) ||
            typed.bytes < 0 ||
            !/^[0-9a-f]{64}$/.test(typed.sha256)
        ) {
            return null;
        }
        manifestBytes += typed.bytes;
    }
    if (candidate.files !== candidate.manifest.length || candidate.bytes !== manifestBytes)
        return null;
    return candidate as ProfileMigrationTransaction;
}

async function hashFile(path: string): Promise<{ bytes: number; sha256: string }> {
    const data = await readFile(path);
    return { bytes: data.byteLength, sha256: createHash("sha256").update(data).digest("hex") };
}

async function filesUnder(root: string): Promise<string[]> {
    if (!(await exists(root))) return [];
    const found: string[] = [];
    const walk = async (directory: string): Promise<void> => {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const full = join(directory, entry.name);
            if (entry.isSymbolicLink()) {
                throw new Error(
                    `Profile migration refused symbolic link ${full}; it could leave the profile root.`,
                );
            }
            if (entry.isDirectory()) await walk(full);
            else if (entry.isFile()) found.push(relative(root, full).split(sep).join("/"));
            else throw new Error(`Profile migration cannot preserve unsupported entry ${full}.`);
        }
    };
    await walk(root);
    return found;
}

async function manifestFor(root: string, paths: readonly string[]): Promise<ManifestEntry[]> {
    const manifest: ManifestEntry[] = [];
    for (const path of paths) {
        const digest = await hashFile(join(root, ...path.split("/")));
        manifest.push({ path, ...digest });
    }
    return manifest;
}

function manifestDigest(manifest: readonly ManifestEntry[]): string {
    return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

async function copyTree(source: string, target: string): Promise<void> {
    for (const path of await filesUnder(source)) {
        const from = join(source, ...path.split("/"));
        const to = join(target, ...path.split("/"));
        await mkdir(dirname(to), { recursive: true });
        await copyFile(from, to);
    }
}

async function collisions(legacy: string, current: string): Promise<string[]> {
    if (!(await exists(current))) return [];
    const legacyPaths = new Set(await filesUnder(legacy));
    const currentPaths = (await filesUnder(current)).filter(
        (path) => path !== PROFILE_MIGRATION_RECEIPT_FILE,
    );
    const conflicts: string[] = [];
    for (const path of currentPaths) {
        if (!legacyPaths.has(path)) continue;
        const [left, right] = await Promise.all([
            hashFile(join(legacy, ...path.split("/"))),
            hashFile(join(current, ...path.split("/"))),
        ]);
        if (left.bytes !== right.bytes || left.sha256 !== right.sha256) conflicts.push(path);
    }
    return conflicts;
}

async function verifyManifest(
    directory: string,
    manifest: readonly ManifestEntry[],
): Promise<void> {
    for (const expected of manifest) {
        const actual = await hashFile(join(directory, ...expected.path.split("/")));
        if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
            throw new Error(`Verification failed for ${expected.path}.`);
        }
    }
}

function timestampForPath(date: Date): string {
    return date.toISOString().replace(/[:.]/g, "-");
}

function transactionPath(appDataDirectory: string): string {
    return join(resolve(appDataDirectory), PROFILE_MIGRATION_TRANSACTION_FILE);
}

function uniqueSiblingPath(base: string, now: Date): string {
    return `${base}-${timestampForPath(now)}-${randomBytes(4).toString("hex")}`;
}

async function checkpoint(
    options: MigrateWorldlensProfileOptions,
    point: ProfileMigrationCheckpoint,
): Promise<void> {
    const decision = await options.onCheckpoint?.(point);
    if (decision === "simulate-crash") {
        throw new SimulatedProfileMigrationCrash(`Simulated process crash at ${point}.`);
    }
}

async function writeTransaction(
    path: string,
    transaction: ProfileMigrationTransaction,
    phase: TransactionPhase,
): Promise<ProfileMigrationTransaction> {
    const next = { ...transaction, phase } satisfies ProfileMigrationTransaction;
    await writeJsonAtomic(path, next);
    return next;
}

async function quarantineStaging(
    transaction: ProfileMigrationTransaction,
    now: () => Date,
): Promise<void> {
    if (!(await exists(transaction.stagingDirectory))) return;
    await rename(
        transaction.stagingDirectory,
        uniqueSiblingPath(`${transaction.stagingDirectory}.partial`, now()),
    );
}

async function rollbackTransaction(
    path: string,
    transaction: ProfileMigrationTransaction,
    options: MigrateWorldlensProfileOptions,
    now: () => Date,
): Promise<void> {
    const durable = await writeTransaction(path, transaction, "rollback-started");
    await checkpoint(options, "before-rollback");

    const failedExists = await exists(durable.failedDirectory);
    if (!failedExists && (await exists(durable.worldlensDirectory))) {
        await rename(durable.worldlensDirectory, durable.failedDirectory);
    }
    if (
        !(await exists(durable.worldlensDirectory)) &&
        durable.backupDirectory !== null &&
        (await exists(durable.backupDirectory))
    ) {
        await rename(durable.backupDirectory, durable.worldlensDirectory);
    }
    await quarantineStaging(durable, now);
    await checkpoint(options, "after-rollback");
    await rm(path, { force: true });
}

async function recoverProfileMigrationTransaction(
    options: MigrateWorldlensProfileOptions,
    plan: ProfileMigrationPlan,
    now: () => Date,
): Promise<void> {
    const path = transactionPath(options.appDataDirectory);
    const raw = await readJson(path);
    if (raw === null) return;
    let transaction = transactionRecord(raw, plan, resolve(options.appDataDirectory));
    if (transaction === null) {
        throw new CorruptJsonError(`${path} is not a valid profile migration transaction.`);
    }

    if (transaction.phase === "rollback-started") {
        await rollbackTransaction(path, transaction, options, now);
        return;
    }

    const [currentExists, stagingExists, backupExists] = await Promise.all([
        exists(transaction.worldlensDirectory),
        exists(transaction.stagingDirectory),
        transaction.backupDirectory === null
            ? Promise.resolve(false)
            : exists(transaction.backupDirectory),
    ]);
    const activationMayHaveCompleted =
        currentExists &&
        !stagingExists &&
        (transaction.backupDirectory === null || backupExists) &&
        (transaction.phase === "receipt-written" ||
            transaction.phase === "activated" ||
            transaction.phase === "verified");

    if (activationMayHaveCompleted) {
        try {
            await (options.verifyActivatedProfile ?? verifyManifest)(
                transaction.worldlensDirectory,
                transaction.manifest,
            );
            const storedReceipt = receipt(
                await readJson(
                    join(transaction.worldlensDirectory, PROFILE_MIGRATION_RECEIPT_FILE),
                ),
            );
            if (storedReceipt === null) throw new Error("Migration receipt read-back failed.");
            transaction = await writeTransaction(path, transaction, "verified");
            await checkpoint(options, "after-verification");
            await rm(path, { force: true });
            return;
        } catch (error) {
            if (error instanceof SimulatedProfileMigrationCrash) throw error;
            await rollbackTransaction(path, transaction, options, now);
            return;
        }
    }

    if (!currentExists && transaction.backupDirectory !== null && backupExists) {
        await rename(transaction.backupDirectory, transaction.worldlensDirectory);
    }
    await quarantineStaging(transaction, now);
    await rm(path, { force: true });
}

export async function migrateWorldlensProfile(
    options: MigrateWorldlensProfileOptions,
): Promise<ProfileMigrationOutcome> {
    const plan = profileMigrationPlan(options.appDataDirectory);
    const now = options.now ?? (() => new Date());
    const receiptPath = join(plan.worldlensDirectory, PROFILE_MIGRATION_RECEIPT_FILE);
    const journalPath = transactionPath(options.appDataDirectory);

    try {
        await recoverProfileMigrationTransaction(options, plan, now);

        const existingReceipt = await readJson(receiptPath);
        if (existingReceipt !== null) {
            if (receipt(existingReceipt) === null) {
                return {
                    kind: "corrupt",
                    plan,
                    message: `${receiptPath} is not a valid migration receipt.`,
                };
            }
            return { kind: "already-migrated", plan };
        }
        if (!(await exists(plan.legacyDirectory))) return { kind: "no-legacy-profile", plan };

        const consentPath = join(options.appDataDirectory, PROFILE_MIGRATION_CONSENT_FILE);
        const rawConsent = await readJson(consentPath);
        let consent = rawConsent === null ? null : consentRecord(rawConsent);
        if (rawConsent !== null && consent === null) {
            return {
                kind: "corrupt",
                plan,
                message: `${consentPath} is not a valid consent record.`,
            };
        }
        if (consent?.decision === "deny" && !options.retryDenied) return { kind: "denied", plan };
        if (consent?.decision !== "accept") {
            const decision = await options.requestConsent(plan);
            consent = {
                version: PROFILE_MIGRATION_VERSION,
                decision,
                decidedAt: now().toISOString(),
            };
            await writeJsonAtomic(consentPath, consent);
            if (decision === "deny") return { kind: "denied", plan };
        }

        const conflicts = await collisions(plan.legacyDirectory, plan.worldlensDirectory);
        if (conflicts.length > 0) return { kind: "collision", plan, paths: conflicts };

        if (await exists(plan.stagingDirectory)) {
            const partial = uniqueSiblingPath(`${plan.stagingDirectory}.partial`, now());
            await rename(plan.stagingDirectory, partial);
        }
        await mkdir(plan.stagingDirectory, { recursive: false });
        if (await exists(plan.worldlensDirectory)) {
            await copyTree(plan.worldlensDirectory, plan.stagingDirectory);
        }
        await copyTree(plan.legacyDirectory, plan.stagingDirectory);

        const legacyPaths = await filesUnder(plan.legacyDirectory);
        const manifest = await manifestFor(plan.legacyDirectory, legacyPaths);
        await verifyManifest(plan.stagingDirectory, manifest);
        const bytes = manifest.reduce((sum, entry) => sum + entry.bytes, 0);

        const startedAt = now();
        const hasCurrentProfile = await exists(plan.worldlensDirectory);
        const backup = hasCurrentProfile
            ? uniqueSiblingPath(`${plan.worldlensDirectory}.pre-migration`, startedAt)
            : null;
        let transaction: ProfileMigrationTransaction = {
            version: PROFILE_MIGRATION_VERSION,
            phase: "prepared",
            legacyDirectory: plan.legacyDirectory,
            worldlensDirectory: plan.worldlensDirectory,
            stagingDirectory: plan.stagingDirectory,
            backupDirectory: backup,
            failedDirectory: uniqueSiblingPath(`${plan.worldlensDirectory}.failed`, startedAt),
            manifest,
            files: manifest.length,
            bytes,
            startedAt: startedAt.toISOString(),
        };
        await writeJsonAtomic(journalPath, transaction);

        if (backup !== null) {
            await checkpoint(options, "before-backup-rename");
            await rename(plan.worldlensDirectory, backup);
            transaction = await writeTransaction(journalPath, transaction, "backup-renamed");
            await checkpoint(options, "after-backup-rename");
        }

        const migrationReceipt: Receipt = {
            version: PROFILE_MIGRATION_VERSION,
            status: "verified",
            product: WORLDLENS_IDENTITY.shippedName,
            source: plan.legacyDirectory,
            target: plan.worldlensDirectory,
            completedAt: now().toISOString(),
            oldProfileRetained: true,
            files: manifest.length,
            bytes,
            manifestSha256: manifestDigest(manifest),
            preMigrationWorldlensBackup: backup,
        };
        await checkpoint(options, "before-receipt-write");
        await writeJsonAtomic(
            join(plan.stagingDirectory, PROFILE_MIGRATION_RECEIPT_FILE),
            migrationReceipt,
        );
        transaction = await writeTransaction(journalPath, transaction, "receipt-written");
        await checkpoint(options, "after-receipt-write");

        await checkpoint(options, "before-staging-activation");
        await rename(plan.stagingDirectory, plan.worldlensDirectory);
        transaction = await writeTransaction(journalPath, transaction, "activated");
        await checkpoint(options, "after-staging-activation");

        await checkpoint(options, "before-verification");
        await (options.verifyActivatedProfile ?? verifyManifest)(plan.worldlensDirectory, manifest);
        if (receipt(await readJson(receiptPath)) === null)
            throw new Error("Migration receipt read-back failed.");
        transaction = await writeTransaction(journalPath, transaction, "verified");
        await checkpoint(options, "after-verification");
        await rm(journalPath, { force: true });

        return { kind: "migrated", plan, files: manifest.length, bytes };
    } catch (error) {
        if (error instanceof SimulatedProfileMigrationCrash) throw error;
        let recoveryFailure: unknown = null;
        try {
            await recoverProfileMigrationTransaction(options, plan, now);
        } catch (caught) {
            if (caught instanceof SimulatedProfileMigrationCrash) throw caught;
            recoveryFailure = caught;
        }
        if (error instanceof CorruptJsonError)
            return { kind: "corrupt", plan, message: error.message };
        const message = error instanceof Error ? error.message : String(error);
        return {
            kind: "failed",
            plan,
            message:
                recoveryFailure === null
                    ? message
                    : `${message} Recovery also failed: ${
                          recoveryFailure instanceof Error
                              ? recoveryFailure.message
                              : String(recoveryFailure)
                      }`,
        };
    }
}

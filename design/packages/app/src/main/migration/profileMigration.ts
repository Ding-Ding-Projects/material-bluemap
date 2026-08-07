import { createHash, randomBytes } from "node:crypto";
import {
    copyFile,
    mkdir,
    open,
    readFile,
    readdir,
    rename,
    stat,
    writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
    LEGACY_MATERIAL_BLUEMAP_IDENTITY,
    WORLDLENS_IDENTITY,
} from "@worldlens/shared";

export const PROFILE_MIGRATION_VERSION = 1;
export const PROFILE_MIGRATION_CONSENT_FILE = ".worldlens-profile-migration-consent.json";
export const PROFILE_MIGRATION_RECEIPT_FILE = ".worldlens-profile-migration.json";
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
    | { readonly kind: "migrated"; readonly plan: ProfileMigrationPlan; readonly files: number; readonly bytes: number }
    | { readonly kind: "collision"; readonly plan: ProfileMigrationPlan; readonly paths: readonly string[] }
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

class CorruptJsonError extends Error {}

export interface MigrateWorldlensProfileOptions {
    readonly appDataDirectory: string;
    readonly requestConsent: (plan: ProfileMigrationPlan) => Promise<ProfileMigrationConsent>;
    readonly retryDenied?: boolean;
    readonly now?: () => Date;
    /** Test seam for the post-activation read-back; production always uses the real verifier. */
    readonly verifyActivatedProfile?: (directory: string, manifest: readonly ManifestEntry[]) => Promise<void>;
}

function inside(parent: string, child: string): boolean {
    const rel = relative(resolve(parent), resolve(child));
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !resolve(rel).startsWith(sep);
}

export function profileMigrationPlan(appDataDirectory: string): ProfileMigrationPlan {
    const root = resolve(appDataDirectory);
    const legacyDirectory = join(root, ...LEGACY_MATERIAL_BLUEMAP_IDENTITY.dataDirectorySegments);
    const worldlensDirectory = join(root, WORLDLENS_IDENTITY.dataDirectoryName);
    const stagingDirectory = join(root, STAGING_NAME);
    if (!inside(root, legacyDirectory) || !inside(root, worldlensDirectory) || !inside(root, stagingDirectory)) {
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
                throw new Error(`Profile migration refused symbolic link ${full}; it could leave the profile root.`);
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

async function verifyManifest(directory: string, manifest: readonly ManifestEntry[]): Promise<void> {
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

export async function migrateWorldlensProfile(
    options: MigrateWorldlensProfileOptions,
): Promise<ProfileMigrationOutcome> {
    const plan = profileMigrationPlan(options.appDataDirectory);
    const now = options.now ?? (() => new Date());
    const receiptPath = join(plan.worldlensDirectory, PROFILE_MIGRATION_RECEIPT_FILE);

    try {
        const existingReceipt = await readJson(receiptPath);
        if (existingReceipt !== null) {
            if (receipt(existingReceipt) === null) {
                return { kind: "corrupt", plan, message: `${receiptPath} is not a valid migration receipt.` };
            }
            return { kind: "already-migrated", plan };
        }
        if (!(await exists(plan.legacyDirectory))) return { kind: "no-legacy-profile", plan };

        const consentPath = join(options.appDataDirectory, PROFILE_MIGRATION_CONSENT_FILE);
        const rawConsent = await readJson(consentPath);
        let consent = rawConsent === null ? null : consentRecord(rawConsent);
        if (rawConsent !== null && consent === null) {
            return { kind: "corrupt", plan, message: `${consentPath} is not a valid consent record.` };
        }
        if (consent?.decision === "deny" && !options.retryDenied) return { kind: "denied", plan };
        if (consent?.decision !== "accept") {
            const decision = await options.requestConsent(plan);
            consent = { version: PROFILE_MIGRATION_VERSION, decision, decidedAt: now().toISOString() };
            await writeJsonAtomic(consentPath, consent);
            if (decision === "deny") return { kind: "denied", plan };
        }

        const conflicts = await collisions(plan.legacyDirectory, plan.worldlensDirectory);
        if (conflicts.length > 0) return { kind: "collision", plan, paths: conflicts };

        if (await exists(plan.stagingDirectory)) {
            const partial = `${plan.stagingDirectory}.partial-${timestampForPath(now())}`;
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

        let backup: string | null = null;
        if (await exists(plan.worldlensDirectory)) {
            backup = `${plan.worldlensDirectory}.pre-migration-${timestampForPath(now())}`;
            await rename(plan.worldlensDirectory, backup);
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
        await writeJsonAtomic(join(plan.stagingDirectory, PROFILE_MIGRATION_RECEIPT_FILE), migrationReceipt);
        await rename(plan.stagingDirectory, plan.worldlensDirectory);

        try {
            await (options.verifyActivatedProfile ?? verifyManifest)(plan.worldlensDirectory, manifest);
            if (receipt(await readJson(receiptPath)) === null) throw new Error("Migration receipt read-back failed.");
        } catch (error) {
            const failed = `${plan.worldlensDirectory}.failed-${timestampForPath(now())}`;
            await rename(plan.worldlensDirectory, failed);
            if (backup !== null) await rename(backup, plan.worldlensDirectory);
            return {
                kind: "failed",
                plan,
                message: error instanceof Error ? error.message : String(error),
            };
        }

        return { kind: "migrated", plan, files: manifest.length, bytes };
    } catch (error) {
        if (error instanceof CorruptJsonError) return { kind: "corrupt", plan, message: error.message };
        return { kind: "failed", plan, message: error instanceof Error ? error.message : String(error) };
    }
}

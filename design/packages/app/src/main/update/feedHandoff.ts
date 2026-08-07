/**
 * Durable proof that this installed profile has reached the Worldlens release feed.
 *
 * Until that proof exists the updater checks the current feed first and may fall back to
 * the legacy repository for the one bridge release. Once the current feed actually
 * delivers an update, the exact current/legacy repository-and-channel identity pair is
 * recorded atomically and later launches stop consulting the legacy source. Release-feed
 * URLs end in the installed version, so persisting those URLs would make every new build
 * forget the previous build's confirmation. A changed identity pair still invalidates the
 * record; a stale confirmation must never silently bless a different repository or channel.
 */

import { randomBytes } from "node:crypto";
import {
    closeSync,
    fsyncSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const UPDATE_FEED_HANDOFF_FILE = ".worldlens-update-feed-handoff.json";

interface HandoffRecord {
    readonly version: 2;
    readonly currentIdentity: string;
    readonly legacyIdentity: string;
    readonly confirmedAt: string;
}

export interface UpdateFeedHandoff {
    isCurrentConfirmed(currentIdentity: string, legacyIdentity: string): boolean;
    confirmCurrent(currentIdentity: string, legacyIdentity: string): void;
}

function record(value: unknown): HandoffRecord | null {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<HandoffRecord>;
    if (
        candidate.version !== 2 ||
        typeof candidate.currentIdentity !== "string" ||
        typeof candidate.legacyIdentity !== "string" ||
        candidate.currentIdentity.trim() === "" ||
        candidate.legacyIdentity.trim() === "" ||
        typeof candidate.confirmedAt !== "string"
    ) {
        return null;
    }
    return candidate as HandoffRecord;
}

export function createFileUpdateFeedHandoff(
    dataDirectory: string,
    now: () => Date = () => new Date(),
): UpdateFeedHandoff {
    const path = join(dataDirectory, UPDATE_FEED_HANDOFF_FILE);

    const read = (): HandoffRecord | null => {
        try {
            return record(JSON.parse(readFileSync(path, "utf8")) as unknown);
        } catch {
            return null;
        }
    };

    return {
        isCurrentConfirmed(currentIdentity, legacyIdentity) {
            const stored = read();
            return (
                stored !== null &&
                stored.currentIdentity === currentIdentity &&
                stored.legacyIdentity === legacyIdentity
            );
        },
        confirmCurrent(currentIdentity, legacyIdentity) {
            mkdirSync(dirname(path), { recursive: true });
            const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
            writeFileSync(
                temporary,
                `${JSON.stringify(
                    {
                        version: 2,
                        currentIdentity,
                        legacyIdentity,
                        confirmedAt: now().toISOString(),
                    } satisfies HandoffRecord,
                    null,
                    4,
                )}\n`,
                "utf8",
            );
            const handle = openSync(temporary, "r+");
            try {
                fsyncSync(handle);
            } finally {
                closeSync(handle);
            }
            renameSync(temporary, path);
        },
    };
}

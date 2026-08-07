/**
 * Durable proof that this installed profile has reached the Worldlens release feed.
 *
 * Until that proof exists the updater checks the current feed first and may fall back to
 * the legacy repository for the one bridge release. Once the current feed actually
 * delivers an update, the exact current/legacy URL pair is recorded atomically and later
 * launches stop consulting the legacy source. A changed feed pair invalidates the record;
 * a stale confirmation must never silently bless a different repository.
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
    readonly version: 1;
    readonly currentFeed: string;
    readonly legacyFeed: string;
    readonly confirmedAt: string;
}

export interface UpdateFeedHandoff {
    isCurrentConfirmed(currentFeed: string, legacyFeed: string): boolean;
    confirmCurrent(currentFeed: string, legacyFeed: string): void;
}

function record(value: unknown): HandoffRecord | null {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<HandoffRecord>;
    if (
        candidate.version !== 1 ||
        typeof candidate.currentFeed !== "string" ||
        typeof candidate.legacyFeed !== "string" ||
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
        isCurrentConfirmed(currentFeed, legacyFeed) {
            const stored = read();
            return (
                stored !== null &&
                stored.currentFeed === currentFeed &&
                stored.legacyFeed === legacyFeed
            );
        },
        confirmCurrent(currentFeed, legacyFeed) {
            mkdirSync(dirname(path), { recursive: true });
            const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
            writeFileSync(
                temporary,
                `${JSON.stringify(
                    {
                        version: 1,
                        currentFeed,
                        legacyFeed,
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

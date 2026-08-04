/**
 * Telling a Bedrock Edition world apart from a Java one, and saying which it is.
 *
 * BlueMap reads Java Edition worlds: Anvil `.mca` region files and a `level.dat` written
 * in Java's big-endian NBT dialect. A Bedrock world is neither. Its chunks live in a
 * LevelDB database under `db/`, and its `level.dat` is little-endian NBT behind an
 * eight-byte header, so the Java reader does not merely find different data in it - it
 * fails to parse it at all.
 *
 * Before this module existed the app was *correct* about such a folder and useless about
 * it. `catalog.ts` would find `level.dat`, hand it to the Java NBT reader, catch the
 * parse failure and list the world with a `detailsError` - which reads as "your world is
 * corrupt". It is not corrupt. It is a perfectly healthy world of the other edition, and
 * that is a different sentence with a different next step.
 *
 * ## This module judges; it does not read the disk
 *
 * Exactly the split `inspect.ts` already makes. {@link detectBedrockWorld} takes a
 * listing and returns a verdict, so every wrong-folder case can be tested against a
 * fixture rather than against a Bedrock world somebody has to have installed. The one
 * function here that does touch a disk is {@link readBedrockLevelName}, and it reads a
 * single small text file.
 *
 * ## Why the verdict has a confidence rather than being a boolean
 *
 * `db` is not a reserved name. A Java world with a datapack, a mod, or a backup tool that
 * parked a directory called `db` beside `region/` is a Java world, and reporting it as
 * Bedrock would send its owner to a converter they do not need for a world the app can
 * already render today. So Java evidence always wins outright, and in its absence the
 * verdict says how sure it is: a `db` directory holding real LevelDB files is settled, a
 * `db` directory that could not be read but sits beside `levelname.txt` is still settled,
 * and a bare `db` directory with nothing corroborating it is reported as `likely` so the
 * interface can hedge instead of asserting.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorldFolderListing } from "../world/inspect.js";

/** The plain-text file Bedrock writes the world's display name into. */
export const LEVEL_NAME_FILE = "levelname.txt";

/** The directory holding a Bedrock world's LevelDB chunk database. */
export const LEVELDB_DIRECTORY = "db";

/**
 * How sure the verdict is.
 *
 * - `certain` - LevelDB files were counted, or `levelname.txt` corroborates the `db`
 *   directory. Nothing else produces this pair of facts by accident.
 * - `likely` - a `db` directory beside a `level.dat`, and nothing more. Worth saying,
 *   worth hedging about.
 */
export type BedrockConfidence = "certain" | "likely";

export interface BedrockWorldDetection {
    readonly bedrock: boolean;
    /** Null exactly when `bedrock` is false. */
    readonly confidence: BedrockConfidence | null;
    /** Which markers were actually found, so a message can name them rather than assert. */
    readonly markers: {
        readonly levelDat: boolean;
        readonly levelNameFile: boolean;
        readonly database: boolean;
        /** LevelDB files counted under `db/`, or null when it was not read. */
        readonly databaseFiles: number | null;
    };
    /**
     * One sentence naming the edition and the next step.
     *
     * Empty when this is not a Bedrock world. Written here rather than in the interface
     * because it is the single sentence this whole module exists to be able to say, and
     * a copy of it in the renderer would drift from the markers that justify it.
     */
    readonly explanation: string;
}

/** A folder that is not Bedrock, with the markers still reported. */
function notBedrock(markers: BedrockWorldDetection["markers"]): BedrockWorldDetection {
    return { bedrock: false, confidence: null, markers, explanation: "" };
}

/**
 * Whether a folder is a Bedrock Edition world.
 *
 * Java evidence is checked first and is decisive. A folder holding Anvil region files is
 * a Java world however many other directories happen to sit beside them, and there is no
 * arrangement of Bedrock markers that should override a `region/` directory with terrain
 * in it - a world the app renders today must never be re-routed through a converter.
 */
export function detectBedrockWorld(listing: WorldFolderListing): BedrockWorldDetection {
    const files = new Set<string>();
    const directories = new Set<string>();
    for (const entry of listing.entries) {
        const name = entry.path.toLowerCase();
        // Only the chosen folder's own children can be markers. `inspect.ts` also reports
        // deeper paths - `DIM-1/region`, `saves-child/level.dat` - and a child world's
        // `level.dat` two segments down says nothing about the folder being judged here.
        if (name.includes("/")) continue;
        if (entry.directory) directories.add(name);
        else files.add(name);
    }

    const databaseFiles = listing.leveldbFiles ?? null;
    const markers = {
        levelDat: files.has("level.dat"),
        levelNameFile: files.has(LEVEL_NAME_FILE),
        database: directories.has(LEVELDB_DIRECTORY),
        databaseFiles,
    } as const;

    // Any Anvil terrain at all, anywhere in the listing, settles it as Java. `regionFiles`
    // is keyed by dimension, so this catches a world whose overworld is empty but whose
    // nether is not.
    for (const count of Object.values(listing.regionFiles)) {
        if (count > 0) return notBedrock(markers);
    }
    // A `region` or `dimensions` directory with no files in it yet is still Java-shaped:
    // a freshly created world that has not generated terrain is not a Bedrock world.
    if (directories.has("region") || directories.has("dimensions")) return notBedrock(markers);

    if (!markers.levelDat || !markers.database) return notBedrock(markers);

    const confidence: BedrockConfidence =
        (databaseFiles !== null && databaseFiles > 0) || markers.levelNameFile
            ? "certain"
            : "likely";

    return { bedrock: true, confidence, markers, explanation: explain(confidence) };
}

function explain(confidence: BedrockConfidence): string {
    const opening =
        confidence === "certain"
            ? "This is a Minecraft Bedrock Edition world"
            : "This looks like a Minecraft Bedrock Edition world";
    return (
        `${opening}. Its chunks are kept in a LevelDB database under db\\, not in the ` +
        `Anvil region files BlueMap reads, so it has to be converted to Java Edition ` +
        `before it can be rendered. The app can do that with Chunker, leaving this world ` +
        `untouched and writing a Java copy beside it.`
    );
}

/**
 * How much of `levelname.txt` is read.
 *
 * A world name is a line of text. The cap is here because this file is only *conventionally*
 * a world name - nothing stops a corrupt or hostile save shipping a hundred megabytes under
 * that name, and reading it whole to display one row of a list would hand a folder somebody
 * picked the ability to exhaust this process's memory.
 */
export const MAX_LEVEL_NAME_BYTES = 4096;

/**
 * The world's display name, from `levelname.txt`.
 *
 * Null rather than a guess when the file is missing, unreadable or empty. The folder name
 * is right there in the summary already, and quietly substituting it here would produce a
 * row claiming the world is called `2024-08-01-backup` on the authority of a file that was
 * never read.
 *
 * Bedrock writes this as UTF-8 with no BOM and usually no trailing newline; both a `\r\n`
 * and a bare `\n` are trimmed, because a name rendered with a stray carriage return in it
 * breaks the row it is drawn in.
 */
export async function readBedrockLevelName(worldFolder: string): Promise<string | null> {
    let raw: Buffer;
    try {
        raw = await readFile(join(worldFolder, LEVEL_NAME_FILE));
    } catch {
        return null;
    }
    const text = raw.subarray(0, MAX_LEVEL_NAME_BYTES).toString("utf8");
    // Cut at the first line break rather than trimming the whole string: a file that
    // somehow holds several lines contributes its first, not all of them joined.
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    const name = firstLine.trim();
    return name === "" ? null : name;
}

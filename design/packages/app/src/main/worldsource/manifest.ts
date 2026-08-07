/**
 * Turning a foreign split into the manifest this project's joiner already reads.
 *
 * There are two ways to join four verified files into one archive: write a second joiner
 * here, or describe what was downloaded in the format the existing one takes. The second
 * is what happens, deliberately.
 *
 * `@worldlens/parts` is where joining lives - it streams, it re-checks every part
 * as it appends, it resumes an interrupted join from the last complete part, and it is
 * the same code `scripts/join-parts.mjs` runs and the same code the release downloader
 * runs. A second implementation here would be a second set of those behaviours to get
 * right, a second place for a resume bug to live, and a second thing to remember when the
 * format changes. So a `SHA256SUMS` layout is written out as a `<name>.parts.json` and
 * handed to `joinParts`, and there is still exactly one joiner in this repository.
 *
 * ## The synthesised manifest is validated by the reader that will read it
 *
 * {@link synthesiseManifest} builds the object, serialises it, and then parses it back
 * with `parseManifest` - the same function that reads a published manifest. That is not
 * ceremony. Every rule in that parser (indices from 1 with no gaps, plain file names, part
 * sizes that do not exceed the declared part size, a total that agrees with the sum of the
 * parts) is a rule this synthesis could get wrong, and getting it wrong here would fail
 * later, inside the join, with a message about a malformed manifest that nobody wrote.
 */

import {
    PARTS_MANIFEST_VERSION,
    manifestNameFor,
    parseManifest,
    type PartsManifest,
} from "@worldlens/parts";

export interface SynthesisedPart {
    /** The published asset name, kept exactly as published. */
    readonly name: string;
    readonly bytes: number;
    /** Lowercase hex SHA-256, from the release's own checksum list. */
    readonly sha256: string;
}

export interface SynthesiseManifestOptions {
    /** The name the joined archive gets, e.g. `world.zip`. A plain file name. */
    readonly file: string;
    /** The parts, already in join order. Their published order is not re-derived here. */
    readonly parts: readonly SynthesisedPart[];
    /**
     * The digest of every part concatenated, computed locally while verifying them.
     *
     * Derived rather than published - see `verify.ts`. It is carried so the join proves it
     * wrote what it read; it is never presented as the publisher's word.
     */
    readonly sha256: string;
}

/**
 * Builds the manifest, proving it against the real parser before returning it.
 *
 * Note what is *not* preserved: the published index. A `SHA256SUMS` split usually numbers
 * from zero and this format numbers from one, so the parts are renumbered 1..N in the
 * order they were given while every `name` keeps its published spelling. The number in the
 * manifest is a position in a list; the name is what identifies a file on disk, and the
 * two must not be confused - renaming the files to match would mean the disk no longer
 * matches the release, and a re-download could not find what it already had.
 */
export function synthesiseManifest(options: SynthesiseManifestOptions): PartsManifest {
    if (options.parts.length === 0) {
        throw new Error(`${options.file} has no parts, so no manifest can describe it.`);
    }

    const bytes = options.parts.reduce((total, part) => total + part.bytes, 0);
    // The declared part size has to be at least as large as the largest part, and every
    // real split has one size for all but the last. Taking the maximum is correct for both
    // and for the odd release whose parts are not uniform at all.
    const partSize = options.parts.reduce((largest, part) => Math.max(largest, part.bytes), 0);

    const document = {
        version: PARTS_MANIFEST_VERSION,
        file: options.file,
        bytes,
        sha256: options.sha256,
        partSize,
        parts: options.parts.map((part, index) => ({
            index: index + 1,
            name: part.name,
            bytes: part.bytes,
            sha256: part.sha256,
        })),
    };

    // Round-tripped through the parser that will read it. A synthesis that violates a rule
    // of the format fails here, naming the rule, rather than inside a join minutes later.
    return parseManifest(JSON.stringify(document), `the manifest derived for ${options.file}`);
}

/** The file name a synthesised manifest is written under, beside the parts it describes. */
export function synthesisedManifestName(file: string): string {
    return manifestNameFor(file);
}

/** The manifest as it is written to disk: four-space JSON with a trailing newline. */
export function serialiseManifest(manifest: PartsManifest): string {
    return `${JSON.stringify(manifest, null, 4)}\n`;
}

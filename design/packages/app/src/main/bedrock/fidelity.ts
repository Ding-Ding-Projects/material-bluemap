/**
 * What is lost when a Bedrock world is converted to Java, said before it happens.
 *
 * Edition conversion is not a re-encoding, it is a translation between two games that
 * genuinely differ. Chunker is explicit about this in its own README, under
 * "Currently unsupported features", and the honest place to repeat it is *before* the
 * conversion starts - a person who learns after a twenty-minute conversion that their
 * villages are gone has been told a fact they can no longer act on.
 *
 * ## Where these come from
 *
 * The first two are verbatim from Chunker's README at
 * https://github.com/HiveGamesOSS/Chunker - they are the project's own statement of what
 * it does not convert, not this app's guess at it. The rest are consequences of the
 * conversion that BlueMap in particular will make visible, and they are labelled as this
 * app's own observation rather than dressed up as upstream documentation.
 *
 * Kept as data rather than as a paragraph so the same list can be shown in the confirm
 * step, recorded in the conversion record, and written into the rendered map's
 * provenance without three copies of the wording drifting apart.
 */

/** Who says so, which is the difference between a citation and an assertion. */
export type FidelitySource = "chunker" | "material-bluemap";

export interface FidelityNote {
    readonly id: string;
    readonly title: string;
    readonly detail: string;
    readonly source: FidelitySource;
}

/**
 * The Chunker version these notes were read from.
 *
 * Recorded so a future reader can tell whether the list is still current rather than
 * having to trust that somebody checked. If the CLI that actually ran reports a different
 * version, {@link fidelityNotesFor} says the list may be out of date instead of quietly
 * presenting stale limitations as current fact.
 */
export const FIDELITY_NOTES_READ_FROM = "1.19.1";

/** Where the statements attributed to `chunker` were read. */
export const CHUNKER_README_URL = "https://github.com/HiveGamesOSS/Chunker#currently-unsupported-features";

export const FIDELITY_NOTES: readonly FidelityNote[] = [
    {
        id: "entities",
        title: "Entities are not converted",
        detail:
            "Chunker states that entities do not convert, excluding paintings and item " +
            "frames. Mobs, dropped items, minecarts, boats, armour stands and villagers " +
            "will not be in the Java copy. This does not affect what BlueMap draws, " +
            "because BlueMap renders blocks rather than entities - but it does mean the " +
            "converted world is not a faithful copy to play.",
        source: "chunker",
    },
    {
        id: "structures",
        title: "Structure data is not converted",
        detail:
            "Chunker states that structure data - villages, strongholds and the rest of " +
            "the generated-structure bookkeeping - does not convert. The blocks that were " +
            "already generated are still there and still render; what is lost is the " +
            "game's record that a structure exists at that spot, so anything that depends " +
            "on it, such as village mechanics or a locate command, will not work.",
        source: "chunker",
    },
    {
        id: "block-mapping",
        title: "Some blocks have no exact Java equivalent",
        detail:
            "The two editions do not have identical block sets. Chunker maps each block to " +
            "the closest Java block it can, and where there is no counterpart the result is " +
            "an approximation. Bedrock-only blocks and some block states will therefore " +
            "render as something near to, rather than exactly, what was there.",
        source: "material-bluemap",
    },
    {
        id: "not-a-round-trip",
        title: "This is a one-way copy, not a link",
        detail:
            "The converted world is a snapshot taken at the moment of conversion. Playing " +
            "the Bedrock world afterwards does not update it, and the map rendered from the " +
            "copy will not show anything built since. Convert again to bring it up to date.",
        source: "material-bluemap",
    },
];

export interface FidelityBriefing {
    readonly notes: readonly FidelityNote[];
    /**
     * True when the Chunker being used is not the one these notes were read from.
     *
     * Not an error and not a refusal - a different version is entirely normal and very
     * probably fine. It is a flag so the interface can say "checked against 1.19.1" rather
     * than presenting a list read from one version as though it were verified against
     * another.
     */
    readonly mayBeOutOfDate: boolean;
    readonly readFromVersion: string;
    readonly runningVersion: string | null;
    readonly sourceUrl: string;
}

/**
 * The briefing to show before a conversion runs.
 *
 * Takes the version of the Chunker that will actually run, so the answer is about the
 * conversion about to happen rather than about conversion in general.
 */
export function fidelityNotesFor(runningVersion: string | null): FidelityBriefing {
    return {
        notes: FIDELITY_NOTES,
        mayBeOutOfDate: runningVersion !== null && runningVersion !== FIDELITY_NOTES_READ_FROM,
        readFromVersion: FIDELITY_NOTES_READ_FROM,
        runningVersion,
        sourceUrl: CHUNKER_README_URL,
    };
}

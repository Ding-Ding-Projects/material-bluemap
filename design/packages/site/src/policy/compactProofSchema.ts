export const COMPACT_PROOF_SCHEMA_VERSION = 2;

export const COMPACT_PROOF_FILES = [
    "pages-parity-360x640-collapsed.json",
    "pages-parity-390x844-bilingual-2x-expanded.json",
    "pages-parity-390x844-bilingual-2x.json",
    "pages-parity-390x844-collapsed.json",
    "pages-parity-414x896-collapsed.json",
    "pages-parity-appearance-414x844-bilingual.json",
    "pages-parity-appearance-414x896-bilingual.json",
    "pages-parity-changelog-414x844-bilingual.json",
    "pages-parity-changelog-414x896-bilingual.json",
    "pages-parity-command-390x844-bilingual-2x.json",
    "pages-parity-command-390x844-bilingual.json",
    "pages-parity-desktop-1024x768.json",
    "pages-parity-exports-390x844-bilingual.json",
    "pages-parity-notifications-414x896-cantonese.json",
    "pages-parity-schedule-390x844-bilingual.json",
    "pages-parity-search-360x640-english.json",
    "pages-parity-settings-1024x768-english.json",
    "pages-parity-tabs-390x844-english.json",
] as const;

const OVERFLOW_CLASSIFICATIONS = new Set(["accidental", "intentional-horizontal-scroller"]);

export function validateCompactProof(value: unknown): readonly string[] {
    const errors: string[] = [];
    const proof = record(value);
    if (proof === null) return ["proof"];
    if (proof["schemaVersion"] !== COMPACT_PROOF_SCHEMA_VERSION) errors.push("schemaVersion");
    if (!validIso(proof["generatedAt"])) errors.push("generatedAt");

    const requested = record(proof["requested"]);
    const scenario = record(proof["scenario"]);
    const interaction = record(proof["interaction"]);
    const metrics = record(proof["metrics"]);
    const verification = record(proof["verification"]);
    if (requested === null) errors.push("requested");
    if (scenario === null) errors.push("scenario");
    if (interaction === null) errors.push("interaction");
    if (metrics === null) errors.push("metrics");
    if (verification === null) errors.push("verification");
    if (
        requested === null ||
        scenario === null ||
        interaction === null ||
        metrics === null ||
        verification === null
    )
        return errors;

    if (typeof requested["scenario"] !== "string") errors.push("requested.scenario");
    if (scenario["scenario"] !== requested["scenario"]) errors.push("scenario.match");
    for (const field of ["opened", "targetPresent", "targetVisible"] as const) {
        if (typeof scenario[field] !== "boolean") errors.push("scenario." + field);
    }

    if (typeof interaction["available"] !== "boolean") errors.push("interaction.available");
    if (interaction["available"] === true) {
        for (const state of ["initial", "afterFirst", "afterSecond", "final"] as const) {
            const snapshot = record(interaction[state]);
            if (snapshot === null) {
                errors.push("interaction." + state);
                continue;
            }
            if (!["true", "false"].includes(String(snapshot["expanded"])))
                errors.push("interaction." + state + ".expanded");
            if (typeof snapshot["label"] !== "string" || snapshot["label"].length === 0)
                errors.push("interaction." + state + ".label");
            if (state !== "initial" && typeof snapshot["focusStayed"] !== "boolean")
                errors.push("interaction." + state + ".focusStayed");
        }
    }

    const navigation = record(metrics["navigation"]);
    if (navigation === null) errors.push("metrics.navigation");
    else {
        if (!Object.hasOwn(navigation, "controls")) errors.push("metrics.navigation.controls");
        if (typeof navigation["controlledElementExists"] !== "boolean")
            errors.push("metrics.navigation.controlledElementExists");
        if (!Object.hasOwn(navigation, "expanded")) errors.push("metrics.navigation.expanded");
        if (!Object.hasOwn(navigation, "label")) errors.push("metrics.navigation.label");
    }

    const overflow = Array.isArray(metrics["overflowingElements"])
        ? metrics["overflowingElements"]
        : null;
    const summary = record(metrics["overflowSummary"]);
    if (overflow === null) errors.push("metrics.overflowingElements");
    if (summary === null) errors.push("metrics.overflowSummary");
    if (overflow !== null) {
        overflow.forEach((item, index) => {
            const entry = record(item);
            if (
                entry === null ||
                !OVERFLOW_CLASSIFICATIONS.has(String(entry["classification"])) ||
                !Object.hasOwn(entry, "scrollOwner")
            )
                errors.push("metrics.overflowingElements[" + index + "]");
        });
    }
    if (overflow !== null && summary !== null) {
        if (summary["total"] !== overflow.length || summary["classified"] !== overflow.length)
            errors.push("metrics.overflowSummary.arithmetic");
        if (
            summary["accidental"] !==
            overflow.filter((item) => record(item)?.["classification"] === "accidental").length
        )
            errors.push("metrics.overflowSummary.accidental");
    }

    const scenarioTarget = record(metrics["scenarioTarget"]);
    if (
        scenarioTarget === null ||
        typeof scenarioTarget["present"] !== "boolean" ||
        !Object.hasOwn(scenarioTarget, "horizontalOverflow") ||
        !Array.isArray(scenarioTarget["outOfBounds"])
    )
        errors.push("metrics.scenarioTarget");
    if (
        requested["scenario"] === "appearance" &&
        scenarioTarget !== null &&
        (scenarioTarget["horizontalOverflow"] !== 0 ||
            (Array.isArray(scenarioTarget["outOfBounds"]) &&
                scenarioTarget["outOfBounds"].length !== 0))
    )
        errors.push("metrics.scenarioTarget.appearance-clipping");

    const transitions = record(verification["toggleTransitions"]);
    for (const field of [
        "focusRetained",
        "finalStateMatched",
        "ariaControlsValid",
        "scenarioMatched",
        "overflowClassificationComplete",
    ] as const) {
        if (verification[field] !== true) errors.push("verification." + field);
    }
    if (transitions === null) errors.push("verification.toggleTransitions");
    else
        for (const field of [
            "firstInverted",
            "secondInverted",
            "firstLabelChanged",
            "secondLabelChanged",
        ] as const) {
            if (transitions[field] !== true) errors.push("verification.toggleTransitions." + field);
        }
    if (!Array.isArray(verification["failures"]) || verification["failures"].length !== 0)
        errors.push("verification.failures");
    return errors;
}

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function validIso(value: unknown): boolean {
    return (
        typeof value === "string" &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString() === value
    );
}

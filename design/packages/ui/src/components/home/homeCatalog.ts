/**
 * What one capability tile on Home is, and every pure operation over the set of them.
 *
 * Mirrors `docs/docsModel.ts`'s split: nothing here touches Vue, an emit, or a live store,
 * so "does this tile match a search" and "what does its search text contain" are both
 * questions a Node test answers in a line. `HomeScreen.vue` is the only module that turns a
 * capability into a card, a click and an emit; this file only knows the words.
 *
 * A tile's `disabledReason` is not computed here. Whether "render a map first" applies is a
 * fact about the live profile list, and threading that list through a pure catalogue builder
 * would only relocate the coupling this module exists to avoid - so `HomeScreen.vue` builds
 * the list itself, in a `computed()`, from the same shared stores the rest of the shell
 * already reads, and this module is left with exactly the part that has one right answer
 * regardless of what is currently rendered: given a list of tiles and a query, which ones
 * match.
 */

import { includesCI, type SettingMatcher } from "../config/regexEngine.js";

/** One card on the Home page. */
export interface HomeCapability {
    /** Stable across renders - used as the `:key` and by tests that click one card. */
    readonly id: string;
    /** The section heading this card is filed under. */
    readonly group: string;
    readonly title: string;
    readonly description: string;
    /** An `@mdi/js` path. */
    readonly icon: string;
    /** Extra words a search should find this card by, beyond its title and description. */
    readonly keywords: readonly string[];
    /**
     * Null when the action is ready to use. Otherwise the exact unmet condition, in plain
     * words - "Render a map first", not a blank disabled button - per the project's guided-
     * forms rule: a disabled action always names what would unblock it.
     */
    readonly disabledReason: string | null;
    /** The primary action's own label, shown on its button. */
    readonly actionLabel: string;
    /**
     * Shown instead of the primary action while `disabledReason` is set: the one thing that
     * actually resolves the missing prerequisite, e.g. "Make a map".
     */
    readonly remedyLabel: string | null;
    /** Weighted above its group's other cards - used for the single newcomer CTA. */
    readonly primary: boolean;
    /**
     * What the card's own button does. A closure rather than a discriminated-union command
     * shape: `HomeScreen.vue` is the only reader, every action is either an emit or a call
     * into an already-shared store, and a tagged-union indirection would buy nothing here
     * that a function does not already give for free. Not read by anything in this module -
     * `filterCapabilities` and `capabilityHaystack` only ever look at the text fields above.
     */
    readonly action: () => void;
    /** Runs the remedy named by `remedyLabel`, or null when there is nothing to fix. */
    readonly remedyAction: (() => void) | null;
}

/**
 * One collapsible block of the Home page: a stable id the user's open/closed choice is
 * remembered under, the heading a person actually reads, and the cards inside it.
 *
 * The id is deliberately not the heading. A heading is translated and moves with the funny
 * level, so a preference keyed by it would be forgotten the moment somebody changed
 * language; the id is an ASCII constant `HomeScreen.vue` declares once beside the heading.
 */
export interface HomeSection {
    readonly id: string;
    readonly heading: string;
    readonly items: readonly HomeCapability[];
}

/** A section as declared, before its cards are known. */
export interface HomeSectionDefinition {
    readonly id: string;
    readonly heading: string;
}

/**
 * Files each capability under the section whose heading it names, in the declared section
 * order, dropping any section that has nothing in it this launch.
 *
 * An empty section is dropped rather than rendered as a heading with "(0)" beside it: "The
 * open map" with no map open is not an honest count of anything, it is a control wired to
 * nothing, which is exactly what the command palette's own rule refuses to ship.
 */
export function groupCapabilities(
    capabilities: readonly HomeCapability[],
    definitions: readonly HomeSectionDefinition[],
): readonly HomeSection[] {
    return definitions
        .map((definition) => ({
            id: definition.id,
            heading: definition.heading,
            items: capabilities.filter((capability) => capability.group === definition.heading),
        }))
        .filter((section) => section.items.length > 0);
}

/** Everything a search matches against, for one card. */
export function capabilityHaystack(capability: HomeCapability): string {
    return [
        capability.group,
        capability.title,
        capability.description,
        capability.disabledReason ?? "",
        ...capability.keywords,
    ]
        .filter((part) => part.trim().length > 0)
        .join("\n");
}

/** One line per card, which is what the regex builder's preview scans. */
export function homeSampleText(capabilities: readonly HomeCapability[]): string {
    return capabilities.map((capability) => `${capability.group}: ${capability.title}`).join("\n");
}

/** Every card whose searchable text matches, in the order it was given. */
export function filterCapabilities(
    capabilities: readonly HomeCapability[],
    matcher: SettingMatcher,
): readonly HomeCapability[] {
    if (!matcher.active) return capabilities;
    return capabilities.filter((capability) => matcher.test(capabilityHaystack(capability)));
}

/** Plain-text convenience for a matcher-free caller; unused by the component, kept for tests. */
export function capabilityMatchesText(capability: HomeCapability, query: string): boolean {
    return query.length === 0 || includesCI(capabilityHaystack(capability), query);
}

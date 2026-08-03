/**
 * The content pages this module supplies.
 *
 * These are the tabs whose content lives here. The shell owns its own chrome tabs, for
 * example a settings page, and is free to add them around this list. Ids are stable and
 * are safe to use in a route or a persisted tab order.
 */

export interface ContentPage {
    readonly id: "home" | "docs" | "screenshots";
    readonly title: string;
    /** Sentence used for the tab's accessible description and any page subtitle. */
    readonly description: string;
}

export const contentPages: readonly ContentPage[] = [
    {
        id: "home",
        title: "Home",
        description: "What material-bluemap is, what works today, what does not, and how to install or build it.",
    },
    {
        id: "docs",
        title: "Documentation",
        description: "An article for every feature, covering behaviour, configuration, failure modes, security and verification.",
    },
    {
        id: "screenshots",
        title: "Screenshots",
        description: "Captures of the real running application, taken by the project's harness in continuous integration.",
    },
];

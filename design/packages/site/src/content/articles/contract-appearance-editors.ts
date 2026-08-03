import type { Article } from "../types.js";
import { repoFile, issue, CONTRACTS_URL } from "../links.js";

export const contractAppearanceEditors: Article = {
    id: "contract-appearance-editors",
    title: "Contract: per-element appearance editors and the infinite colour picker",
    summary:
        "An Edit appearance editor anchored beside every rendered element, with word-processor-depth typography, a continuous colour picker with a colour translator, presets and layered reset.",
    category: "contracts",
    status: "specified",
    statusNote:
        "Not implemented in the product. There is a single Material Design 3 theme configured in one file, no per-element editor, no colour picker and no persisted appearance state. Tracked as issue 8.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "callout",
                    tone: "not-implemented",
                    title: "This describes a requirement, not shipped behaviour",
                    content: [
                        "The interface configures one theme globally. Nothing can be customised per element, and ",
                        "nothing about appearance is persisted. Progress is tracked as ",
                        { link: "issue 8", href: issue(8), external: true },
                        ".",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The requirement is per element, with no exemptions: no tab, menu, toolbar, dialog, picker, ",
                        "notification, field, button, icon, surface, state or editor chrome is outside it. A ",
                        "theming feature that cannot theme its own dialog does not satisfy it.",
                    ],
                },
                {
                    kind: "list",
                    items: [
                        "Every element exposes Edit appearance from its context menu and through a keyboard path.",
                        "Tabs keep their normal management menu and gain Edit tab appearance, with Shift and right-click opening the editor directly where the platform can tell the difference.",
                        "The editor is non-modal and anchored beside the exact element being edited. It tracks that anchor, flips or shifts at viewport edges without looking detached, previews live, and returns focus to the element when it closes.",
                        "Tab groups are independent decoration targets rather than containers that inherit a tab colour, covering header and grouped region, badges, borders, separators, and the expanded, collapsed, hover and focus states.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Typography is modelled on the depth of a word processor rather than a theme selector: every ",
                        "installed and bundled font enumerated and searchable, each family name rendered in its own ",
                        "face, live preview, variable-font axes, and a CJK-safe fallback. Beyond family and size ",
                        "that means weight, italic and oblique, underline style and colour, single and double ",
                        "strikethrough, overline, capitalisation and small caps, superscript and subscript, baseline ",
                        "offset, foreground colour, highlight, outline, shadow, glow where the platform renders it, ",
                        "character and word spacing, line height, direction and alignment.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Every colour control opens the same continuous picker: a spectrum or wheel, or a ",
                        "two-dimensional colour field, plus numeric entry. Swatches, recent colours, palettes and an ",
                        "eyedropper are shortcuts layered on top, never the only chooser. The picker carries a ",
                        "bidirectional translator across named colours, HEX and HEX8, RGB and RGBA, HSL and HSLA, ",
                        "HSV, HWB, CIELAB and LCH, OKLab and OKLCH, and CMYK. It preserves alpha, names the current ",
                        "colour space and gamut, warns before clipping, reports accessible contrast against the ",
                        "relevant foreground and background, and copies any representation without changing the ",
                        "selected colour.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Persistence",
                            description:
                                "Every setting persists per element and survives a restart.",
                        },
                        {
                            term: "Inheritance",
                            description:
                                "An element can inherit from an explicitly chosen parent or preset rather than only carrying its own values.",
                        },
                        {
                            term: "Reset",
                            description:
                                "Per property, per element, per surface and globally. All four levels, because a global reset is not a fix for one wrong value.",
                        },
                        {
                            term: "Presets and themes",
                            description:
                                "Named presets and user themes export and import as a file, so a customised appearance survives a reinstall and can be shared, without dropping values the target cannot represent.",
                        },
                        {
                            term: "Unsupported capabilities",
                            description:
                                "Stay visible with a plain explanation of the platform limit, and the user's value is preserved rather than silently discarded.",
                        },
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "A global theme with no per-element targeting, or an editor that only reaches tabs.",
                        "A finite swatch-only colour chooser presented as the colour picker.",
                        "A font list that omits installed fonts, or renders every family name in the same face.",
                        "A detached appearance page instead of an editor anchored to the element.",
                        "A right-click path with no keyboard equivalent.",
                        "A control that silently drops a value it cannot represent.",
                        "An editor that obscures its target with no collision handling, loses its anchor when tabs reorder, applies changes to the wrong tab, traps focus, overwrites an unrelated preset, or persists a preview the user cancelled.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Imported presets and themes are untrusted input. They are parsed as data, validated against the known property set, and never evaluated as code or injected as raw style text.",
                        "Enumerating installed fonts exposes a fingerprintable property of the machine. It stays local: the list is never transmitted, and the site sends nothing anywhere at all.",
                        "Decoration never replaces an accessible name, count or state. A badge or an emoji is added to the accessible name, not substituted for it.",
                        "Contrast is reported by the picker, so a user cannot arrive at an unreadable combination without being told.",
                        "The editor is keyboard operable with visible focus, works at narrow widths and at 100, 125, 150 and 200 percent display scale, and respects reduced motion.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "An inventory of every rendered element, with proof that each has an editor.",
                        "Normal right-click, the modifier path where supported, keyboard access, anchor tracking, collision handling, live preview, cancel and apply, inheritance, persistence, every reset level, and import and export.",
                        "Enumerated installed fonts, Latin and CJK fallback, variable fonts, every typography property, and preservation of values the platform cannot render.",
                        "Colour round-trips through every supported representation including alpha, wide-gamut and out-of-gamut values, clipping warnings, contrast calculations, copy, eyedropper fallback, and keyboard and screen-reader operation.",
                        "All three language modes, at narrow widths and at every supported display scale.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "not-implemented",
                    title: "None of this has run",
                    content: "There is no editor to test.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "contract-tab-navigation",
            reason: "Tabs and tab groups are the first decoration targets this editor has to cover.",
        },
        {
            articleId: "contract-regex-builder",
            reason: "Every picker and editor carries its own search bar, and that search bar carries the builder.",
        },
        {
            articleId: "screenshot-gallery",
            reason: "The harness that captures the shell at every display scale, which is where sizing defects show up.",
        },
    ],

    sources: [
        {
            label: "design/docs/contracts/appearance-editors.md",
            href: repoFile("design/docs/contracts/appearance-editors.md"),
        },
        { label: "Issue 8", href: issue(8) },
        { label: "Contract index", href: CONTRACTS_URL },
    ],
};

import type { Article } from "../types.js";
import { LANGUAGE_AND_TONE_DOC_URL, repoFile } from "../links.js";

export const languageAndTone: Article = {
    id: "language-and-tone",
    title: "Language modes, funny levels, and the rule that facts do not move",
    summary:
        "English, playful Hong Kong Cantonese and a bilingual mode, with an independent funny level per language, wired into the copy the application actually renders and held to a test that every level keeps naming the file, the path and the count.",
    category: "application",
    status: "shipped",
    statusNote:
        "The store, both sliders, the settings row and the catalogue are on the default branch, with test files running in CI including catalogueCoverage.test.ts, which reads every call site in the package. The catalogue answers 2183 of 2187 real call-site keys (99.8%) across 27 surfaces declared fully covered, up from roughly a hundred out of fifteen hundred. Anything outside a covered surface still renders its English fallback, which is the designed behaviour for an uncatalogued key rather than a defect.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "Two sliders, not one. The English level and the Cantonese level are independent settings: ",
                        "English can stay buttoned up while Cantonese lets loose, and neither moves when the other ",
                        "does. All three preferences persist immediately, so a choice survives closing the ",
                        "application halfway through setup.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "They are offered during first-run setup, and the settings surface mounts the same panel ",
                        "rather than reproducing it. Two copies of a control writing the same keys is how a slider ",
                        "on one surface stops agreeing with the slider on the other, and the failure is silent ",
                        "because both screens look right and only the one opened second is telling the truth. ",
                        "Before that row existed the three settings were reachable only during first-run setup, ",
                        "which is a setting being asked once rather than a setting being configurable.",
                    ],
                },
                {
                    kind: "table",
                    caption: "Two tiers, and why a string is in one rather than the other",
                    columns: ["Tier", "What is in it", "How many strings"],
                    rows: [
                        [
                            "Voiced",
                            "Prose the user reads: errors, warnings, the sentence saying what a delete will take with it, the line reporting what was saved and where.",
                            "Five per language, level one being fully professional and level five maximum playfulness",
                        ],
                        [
                            "Fixed",
                            "Titles, buttons, column headings, the names of things. A funny level cannot usefully restyle a cancel button, and a label that moves under somebody is one they re-read every time.",
                            "One per language, still varying with the mode",
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Every call site in the application already passed an English fallback as its third ",
                        "argument, used only when the key resolves nowhere. The bundled locales are upstream's ",
                        "viewer locales and carry none of this project's keys, so every one of them rendered that ",
                        "fallback in all thirty languages at every level: not a bug in any one call site, but ",
                        "nothing at all on the other side of the call. This layer is the other side. It builds a ",
                        "message set for whichever mode and levels are active and merges it into the locale ",
                        "already in use, re-merging whenever a slider moves, so an entry added to the catalogue ",
                        "starts varying at every existing call site with no component edited at all.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "note",
                    title: "Merging rather than selecting a locale of its own",
                    content:
                        "A synthetic locale works and breaks something: the viewer's settings menu compares the active locale against its own list of thirty to decide which language is ticked, so pointing it at a name that is not in the list makes the tick disappear and the menu stop agreeing with itself. Merging leaves the active locale alone and adds keys to it, and it is idempotent by construction, so no stale string can survive a change of level.",
                },
                {
                    kind: "paragraph",
                    content: [
                        "A funny level changes voice and never facts. Level five may be as silly as it likes about ",
                        "the manner of a failed delete; it may not stop naming the file, stop saying the delete ",
                        "cannot be undone, or lose the storage whose tiles are being left behind. The catalogue ",
                        "names, per key and per language, the substrings that have to survive every level, and the ",
                        "test checks all ten strings of every entry against them. A voiced key with no fact ",
                        "declared fails, so nothing is quietly exempt. Placeholders are held the same way: every ",
                        "level of an entry uses the same set, the call site's fallback is the authority for which ",
                        "placeholders exist, and an entry that invents or drops one is rejected.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Bilingual copy is two elements in the surfaces that own their own markup, English ",
                        "prominent and Cantonese beneath it. Out in the rest of the application a message can only ",
                        "be a string, so the two languages are separated by a newline and a narrowly scoped ",
                        "stylesheet, gated on the mode, makes that newline render as a line break in the ",
                        "containers text lands in. That is honestly weaker than two elements, because a text node ",
                        "cannot be styled separately from its sibling, and it does guarantee the part that matters ",
                        "at a narrow width: the second language goes downwards rather than sideways, and its ",
                        "container is allowed to grow to fit it rather than clipping it.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "table",
                    caption: "The three persisted settings",
                    columns: ["Setting", "Values", "Default"],
                    rows: [
                        ["Language mode", "English, Cantonese, bilingual", "English"],
                        ["English funny level", "1 to 5", "3"],
                        ["Cantonese funny level", "1 to 5", "3"],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Under the sliders is a disclosure saying that the level styles every message the ",
                        "application produces, errors and warnings included, and that the facts do not move. It is ",
                        "rendered at the current level like everything else, and every level of it still says both ",
                        "of those things. Somebody is entitled to know that before they move a slider rather than ",
                        "after an error reads oddly. A reset from the settings surface puts all three back.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "The words this settings section can be found by live in a module rather than on the ",
                        "component, so the settings surface folds them into the search it already owns instead of ",
                        "the row growing a second search bar to compete with it, and so they are readable before ",
                        "the component has mounted.",
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
                        "A key the catalogue does not carry renders its English fallback with its arguments interpolated, exactly as before this layer existed. That is the designed behaviour and it is what makes the catalogue safe to grow one surface at a time.",
                        "A stored mode or level this build does not know falls back to the default, and levels are clamped into range on read.",
                        "Storage refuses, so the choice does not survive a restart and nothing is reported.",
                        "A catalogue entry that drops a placeholder its call site passes fails the build rather than rendering a sentence with a hole in it.",
                        "A catalogue entry that stops carrying a required fact at some level fails the build. That is the failure this layer exists to prevent, so it is the one checked hardest.",
                        "A bilingual string in a container the stylesheet does not name would render as one run rather than two lines, which is why those containers are enumerated and asserted.",
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
                        "Nothing reaches the network. The catalogue is compiled into the bundle, the three preferences are written to local storage, and no text is transmitted or logged.",
                        "The safety-relevant consequence is the one the fact test exists for: a destructive-action gate, a consent question and an error report all render through this layer, and a user who cannot tell what a button will do has not consented to it.",
                        "The first-run consent facts go further and resolve from an exact catalogue with the level not consulted at all, because a licence quotation is a fact in the shape of a whole paragraph.",
                        "The Cantonese is playful and never at the user's expense. Humour is aimed at the software's own behaviour, never at somebody's lost work, their money or their ability to use a computer, and where a sentence reports damage the Cantonese gets no funnier than the English at any level.",
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
                        [
                            { code: "appCopy.test.ts" },
                            ": five levels in both languages for every voiced entry, no key in both tiers, level ",
                            "one and level five genuinely differing in both languages, the two languages not being ",
                            "copies of each other, the same placeholders at every level, a real call site for ",
                            "every catalogue key carrying exactly the placeholders that call site passes, every ",
                            "required literal present at every level, and a declared fact for every voiced key.",
                        ],
                        [
                            { code: "voiceNotFacts.test.ts" },
                            ": the two sliders are independent, moving one moves only its own half, the path ",
                            "survives at every combination of the two levels, and an uncatalogued key still ",
                            "renders its fallback with arguments interpolated.",
                        ],
                        [
                            { code: "appVoice.test.ts" },
                            ": the merge into the active locale, its idempotence, and the message set changing with ",
                            "mode and level.",
                        ],
                        [
                            { code: "bilingualLayout.test.ts" },
                            ": Cantonese in its own block beneath the English where markup allows it, no empty ",
                            "second element in a single mode, the stylesheet gated on the bilingual mode and ",
                            "changing nothing that is not about fitting a second line, control rows wrapping at a ",
                            "narrow width, both sliders collapsing rather than sitting in fixed columns, and the ",
                            "disclosure staying on screen at the funniest level, where the copy is longest.",
                        ],
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What the catalogue reaches today",
                    content:
                        "The options editor and its apply and field surfaces, the map and storage screens, the world wizard, the settings surface including this section itself, the downloads list, the notification centre and the two-key gate. Everything else, the command palette and the tab strip among them, renders its English fallback in every mode until its keys are added. The mechanism reaches every call site; the catalogue does not yet.",
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "contract-localization",
            reason: "The full contract, and the surfaces this does not cover yet.",
        },
        {
            articleId: "destructive-action-gate",
            reason: "The surface where voice-not-facts matters most, and one the catalogue already covers.",
        },
        {
            articleId: "first-run-consent",
            reason: "The flow these controls were first offered in, and the exact tier its licence quotation uses.",
        },
    ],

    sources: [
        { label: "docs/language-and-tone.md", href: LANGUAGE_AND_TONE_DOC_URL },
        { label: "packages/ui/src/copy", href: repoFile("design/packages/ui/src/copy") },
        {
            label: "packages/ui/src/components/setup/LanguageSettingsRow.vue",
            href: repoFile("design/packages/ui/src/components/setup/LanguageSettingsRow.vue"),
        },
        {
            label: "packages/ui/src/components/setup/setupI18n.ts",
            href: repoFile("design/packages/ui/src/components/setup/setupI18n.ts"),
        },
    ],
};

# Language modes and funny levels

Three language modes, and an independent funny level per language. The level changes the voice of
every message the application produces, errors and warnings included. It never changes the facts,
and that is enforced by a test rather than by care.

The code is `design/packages/ui/src/copy/` for the words and the wiring, and
`design/packages/ui/src/components/setup/` for the controls and the persisted store.

## Behaviour

### The three modes and the two sliders

| Setting | Values | Default | Stored under |
|---|---|---|---|
| Language mode | `en`, `yue`, `bilingual` | `en` | `worldlens.language.mode` |
| English funny level | 1 to 5 | 3 | `worldlens.language.funny.en` |
| Cantonese funny level | 1 to 5 | 3 | `worldlens.language.funny.yue` |

Two sliders, not one. English can stay buttoned up while Cantonese lets loose, and neither moves
when the other does. All three persist immediately, so a choice survives closing the application
halfway through setup.

They are offered during first-run setup, so the rest of that flow can be read in whichever voice
somebody wants, and again on the settings surface. The settings surface **mounts the same panel**
rather than reproducing it: two copies of a control writing the same three keys is how a slider on
one surface stops agreeing with the slider on the other, and the failure is silent because both
screens look right and only the one opened second is telling the truth. Before that row existed
the three settings were reachable only during first-run setup, which is a setting being asked once
rather than a setting being configurable.

### Where the words live

`appCopy.ts` holds the catalogue in two tiers, and which tier a string is in is a decision rather
than a convenience.

- **VOICED** is prose the user reads: errors, warnings, the sentence saying what a delete will
  take with it, the line reporting what was saved and where. Five English strings and five
  Cantonese strings, index 0 being level 1 (fully professional) and index 4 being level 5 (maximum
  playfulness).
- **FIXED** is titles, buttons, column headings, the names of things. One string per language, no
  level. A funny level cannot usefully restyle "Cancel", and a button whose label moves under
  somebody is a button they re-read every time. These still change with the mode, which is the
  half that matters for them.

There is deliberately no third exact tier here. Out in the application the facts are the
interpolated values (the path, the count, the map id, the folder) and they are protected by a
stronger mechanism than a tier could give them, described below.

### How it reaches nine hundred call sites without editing any of them

Every call site in the application is shaped
`t("world.folder.noLevelDat", { folder }, "There is no level.dat in {folder}, ...")`. The English
string in the third argument is a *fallback*: vue-i18n uses it only when the key resolves nowhere.
The bundled locales under `public/lang/` are upstream BlueMap's viewer locales and carry none of
this project's keys, so every one of those keys rendered its English fallback in all thirty
languages at every funny level. Not a bug in any one of them: there was simply nothing on the
other side of the call.

`appVoice.ts` is the other side. It turns the catalogue into a vue-i18n message set for whichever
mode and levels are active and **merges** it into the locale the application is already using,
re-merging whenever a slider moves or the mode changes. An entry added to the catalogue starts
varying at every existing call site with no component edited at all, and a key the catalogue does
not carry still renders its English fallback exactly as before, which is what makes this safe to
grow one surface at a time.

Merging rather than selecting a synthetic locale is deliberate. `main.ts` hands the i18n locale to
the viewer's seam, and the viewer's settings menu compares that value against its own list of
thirty locales to decide which language is ticked; pointing the locale at a name that is not in
the list makes the tick disappear and the menu stop agreeing with itself. Merging leaves the
active locale alone and simply adds keys to it, and it is idempotent by construction, so no stale
string can survive a change of level.

### What the catalogue covers today

The mechanism reaches every call site; the catalogue does not yet carry every key. On the default
branch it carries the options editor and its apply and field surfaces, the map and storage
screens, the world wizard from folder through review to a running render, the settings surface
(consent, Java, storage, GitHub and the language section itself), the downloads list, the
notification centre and its level names, and the super-confirmation gate. Everything else, the
command palette and the tab strip among them, renders its English fallback in every mode until its
keys are added, which is the designed behaviour rather than a defect and is why this layer could
land without editing a single call site.

### Bilingual, in a string that can only be a string

The setup flow renders bilingual copy as two elements, English prominent and the Cantonese beneath
it at a smaller size. That is the right answer and it needs markup, which is exactly what a
vue-i18n message cannot be: `t()` returns a string, and the call sites out in the application put
that string wherever they put it.

So a bilingual message carries a newline between the two languages, and `bilingual.css` makes that
newline render as a line break in the containers Vuetify puts text in, gated behind
`html[data-language-mode="bilingual"]` so it cannot affect either single-language mode. Vue's
template compiler condenses whitespace in template text before it reaches the DOM, so the only
newlines the rule can act on are ones that arrived as data.

This is honestly weaker than what the setup flow does: the secondary line is a line rather than a
de-emphasised one, because a text node cannot be styled separately from its sibling text. What it
does guarantee is the part that matters at a narrow width, which is that the second language goes
downwards rather than sideways, and that the containers it lands in are allowed to grow to fit it
instead of clipping it.

### Voice, never facts

A level may be as silly as it likes about the *manner* of a failed delete. It may not stop naming
the file, stop saying the delete cannot be undone, or quietly lose the storage whose tiles are
being left behind.

`FACTS` names, per key and per language, the substrings that have to survive every level, and the
test checks all ten strings of every entry against them. A voiced key with no fact declared fails,
so nothing is quietly exempt. Placeholders are checked the same way: every level of an entry uses
the same set, the call site's fallback is the source of truth for which placeholders exist, and an
entry that invents one or drops one is rejected.

The Cantonese is natural and playful, and never at the user's expense. The house rule is narrow
and absolute: humour is aimed at the software's own behaviour, never at somebody's lost work,
their money, or their ability to use a computer. Where a sentence reports damage, the Cantonese
gets no funnier than the English does, at any level. Identifiers stay identical in both languages,
because translating a filename produces a sentence that reads well and sends the reader looking
for a file that does not exist.

### The disclosure is not optional

Under the sliders is a line saying that the level styles every message the application produces,
errors and warnings included, and that the facts do not move. It is rendered at the current level
like everything else, and every level of it still says both of those things. Somebody is entitled
to know that before they move a slider rather than after an error reads oddly.

## Configuration

The three settings above are the whole of it, and they are reachable from first-run setup and from
the settings surface. A reset puts all three back to their defaults from the settings surface.

The words this section can be found by live in `languageSearch.ts` rather than on the component,
exactly as the consent section's do, so a settings surface folds them into the search it already
owns instead of the row growing a second search bar to compete with it, and so they are readable
before the component has mounted.

## Failure modes

- **A key the catalogue does not carry** renders its English fallback with its arguments
  interpolated, exactly as it did before this layer existed. That is the designed behaviour, not a
  degradation.
- **A stored mode or level this build does not know** falls back to the default; levels are
  clamped into 1 to 5 on read.
- **Storage refuses.** The choice does not survive a restart, and nothing is reported, because a
  remembered preference is not worth a notification.
- **A catalogue entry that drops a placeholder its call site passes** fails the build rather than
  rendering a sentence with a hole in it.
- **A catalogue entry that stops carrying a required fact at some level** fails the build. This is
  the failure this layer exists to prevent, so it is the one checked hardest.
- **A bilingual string in a container the stylesheet does not name** would render as one run
  rather than two lines. The containers are enumerated and asserted for that reason.

## Security considerations

Nothing here reaches the network. The catalogue is compiled into the bundle, the three preferences
are written to local storage, and no text is transmitted or logged.

The safety-relevant consequence of this feature is the one the fact test exists for: a
destructive-action gate, a consent question and an error report all render through this layer, and
a user who cannot tell what a button will do has not consented to it. The consent facts in
first-run setup go further still and resolve from an exact catalogue with the level not consulted
at all, because a licence quotation is a fact in the shape of a whole paragraph.

## Accessibility

The accessible name of a Vuetify slider comes from its `name` prop, which is what the thumb (the
element carrying `role="slider"`) renders as `aria-label`; an `aria-label` passed to the component
lands on the wrapper and names nothing. `aria-valuetext` is not forwarded either, so each level's
name is announced through a polite live region beneath the track rather than being left visible
but unspoken. The two sliders are declared as a grid that collapses rather than as two fixed
columns, and rows of controls wrap below 480 pixels, where two languages stop fitting side by
side. The disclosure stays on screen at the funniest level, which is where the copy is longest.

## Verification

| Test | What it holds |
|---|---|
| `appCopy.test.ts` | Five levels in both languages for every voiced entry, no empty string, no em-dash, no key in both tiers, level 1 and level 5 genuinely differing in both languages, the two languages not being copies of each other, the same placeholders at every level, a real call site for every catalogue key carrying exactly the placeholders that call site passes, every required fact present at every level, and a declared fact for every voiced key. |
| `appVoice.test.ts` | The merge into the active locale, its idempotence, and the message set changing with mode and level. |
| `voiceNotFacts.test.ts` | The two sliders are independent, moving one moves only its own half, the path survives at every combination of the two levels, and a key the catalogue does not carry still renders its fallback with arguments interpolated. |
| `bilingualLayout.test.ts` | The surfaces that own their markup put Cantonese in its own block beneath the English and show no empty second element in a single mode; `bilingual.css` parses, gates every rule on the bilingual mode, changes nothing that is not about fitting a second line, honours the break in every container it names, wraps control rows below 480 pixels; and the language panel collapses its sliders, renders both languages with no unresolved placeholder, keeps the disclosure on screen at the funniest level, and offers a way back to the defaults. |
| `setupI18n.test.ts`, `setupStrings.test.ts`, `languageSearch.test.ts` | The persisted store, the setup catalogue's own tiers including the exact one, and the words the settings section is searchable by. |

Run them with `npx vitest run packages/ui/src/copy packages/ui/src/components/setup` from
`design/`.

## Suggested reading

- [Super confirmation](./super-confirmation.md), the surface where voice-not-facts matters most,
  and one of the surfaces the catalogue already covers.
- [The notification centre](./notification-centre.md), whose own copy is in the catalogue.
- [The command palette](./command-palette.md), whose copy is not in the catalogue yet and which
  therefore still renders its English fallbacks, the ordinary behaviour for a key the catalogue
  does not carry.

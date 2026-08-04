# The regex builder, and the search bars it reaches

Every search bar in the application opens a guided pattern builder, anchored beside the field it
belongs to. Plain text is the default; regular expressions are something a user turns on
deliberately. The builder names the engine it is building for, states its own limits, and previews
against the text the search will actually scan.

The code is `design/packages/ui/src/components/config/` for the settings family, with sibling
adapters in `components/menu/` and `components/markers/`.

## Behaviour

### Three fields, three builders, one behaviour

There are three shared search fields, each rendering its own anchored builder:
`ConfigSearchField` with `ConfigRegexBuilder`, `MenuSearchField` and `MenuSearchBar` with
`MenuRegexBuilder`, and `MarkerSearchField` with the marker `RegexBuilder`. Three rather than one
because they belong to three surface families with different chrome, not because the behaviour
differs.

Each surface owns its own copy of the engine adapter, so one surface's limits cannot be changed
out from under another's. All three are plain text by default with regex as the explicit opt-in,
and all three run the host runtime's own `RegExp`.

### The builder is bound to the field, not parked beside it

The pattern and the flags are two-way: typing in the raw editor changes the search immediately,
and typing in the search bar changes the editor. There is no shared builder holding state for
whichever field was touched last. The builder opens from a field, is anchored beside it, writes
back into it, and returns focus to it when it closes. Turning regex off again leaves the literal
query exactly as typed rather than rewriting it.

### What the builder offers

- **Guided construction** by token group: character classes, anchors, groups (capturing,
  non-capturing, named, and a back-reference), alternation and quantifiers, plus a literals field
  that backslash-escapes every metacharacter so a typed string matches itself.
- **A raw pattern editor**, which is the same value the search bar holds.
- **Every supported flag** as a chip group: `g`, `i`, `m`, `s`, `u`, `y`.
- **Editable sample text**, seeded with the real corpus of the surface that opened it, one
  candidate per line. A builder previewing against an invented sample teaches a pattern that
  matches the sample and nothing the user has.
- **Live matches with their capture groups**, named groups listed by name, and syntax feedback on
  the pattern as it is typed.
- **Copy**, which writes the pattern exactly as built with no delimiters or escaping the user did
  not ask for.
- **The engine, stated in the interface** rather than only in a comment: ECMAScript `RegExp`,
  evaluated locally on this thread, which is the same engine the search itself filters with, so
  the preview cannot disagree with the search that consumes the pattern. `\d`, `\w`, `\s`, `\b`,
  named groups, back-references and lookaround all behave exactly as they do in the browser.

### Every search bar has one, and a test says so

The rule most likely to decay is this one, because nothing about writing a plain text field
labelled "Search" feels like a violation while you are doing it: a surface ships, the field looks
right, and the contract quietly covers one fewer place than it did last week.

`regexPolicy.test.ts` therefore walks every component in the package and asks two questions. Does
this file contain a search-shaped input, meaning one whose label, placeholder, name, model or
class says search, filter, find or query? And if so, does it get that search from one of the three
shared fields? A file that answers yes and no fails. A file that legitimately holds a
search-shaped input that is not a search has to be named in an exemption list with the reason, so
the exemption is a sentence somebody wrote rather than an absence nobody noticed.

**That exemption list is currently empty**, and the guard is what makes "every search bar" a
statement about the code rather than about somebody's memory. The detector is deliberately
generous about what counts as a search: it is better to make somebody write one exemption sentence
than to let a real search bar through because its label was "Find a map".

What the guard deliberately does not check is that a builder *works*. That is what the per-surface
mount tests are for, and duplicating it there would make the guard slow and fragile without making
it stricter.

## Configuration

| Limit | Value | Where |
|---|---|---|
| Pattern length | 512 characters | `MAX_PATTERN_LENGTH` |
| Sample length | 20000 characters | `MAX_SAMPLE_LENGTH` |
| Reported matches | 500 | `MAX_MATCHES` |
| Wall clock per preview run | 100 ms | `MAX_EVAL_MS` |
| Flags | `g`, `i`, `m`, `s`, `u`, `y` | `SUPPORTED_FLAGS` |

They are stated in the builder's own interface as well as here, because a limit the user cannot
see is a limit that reads as a bug when it bites. None of them is user-configurable.

Plain-text mode is a case-insensitive substring match, and it is the default everywhere.

## Failure modes

- **A pattern that will not compile.** The error is shown, and the matcher matches *nothing*
  rather than falling back to the last pattern that did compile, which would leave results on
  screen for a search nobody can see any more.
- **A pattern that would backtrack exponentially is refused before it is compiled.** This is the
  one failure the size and time limits cannot cover, and the arithmetic says why: a single
  `exec()` cannot be interrupted, the wall clock is checked *between* matches, and `(a+)+$`
  against twenty thousand characters never returns from the first one, so the budget is never
  reached. Capping the inputs bounds a polynomial pattern and does nothing at all to an
  exponential one. `regexRisk.ts` inspects the pattern's shape for a nested unbounded quantifier
  and for the other classic exponential form, and refuses with an explicit reason rather than
  freezing the window. Refusing is a real cost, a user who genuinely wanted `(\w+\s*)+` is told
  no, and it is the right trade against a frozen window with no way back, because the same intent
  is almost always expressible without the nesting.
- **A zero-width match** is handled rather than driving an infinite loop.
- **A sample longer than the limit** is truncated for the preview, and the limit is on screen.
- **More matches than the cap** are reported as capped rather than silently ending the list.
- **Turning regex mode off** leaves the literal query intact, so the meaning of what is typed does
  not change under the user.

## Security considerations

Evaluation is local and in memory. No pattern and no sample text is transmitted, logged or
persisted anywhere, including by the surfaces that persist other state: the tab strip explicitly
excludes queries and patterns from what it writes to storage, because they are not ordinary layout
preferences and can contain anything a person typed.

Catastrophic backtracking is the obvious denial-of-service route into any regex feature, and it is
the one this project treats as a real threat rather than a theoretical one, because the pattern
runs on the thread that draws the interface. The static refusal above is the mitigation; the four
bounds are the second line.

Tab titles, notification text and settings values are treated as potentially sensitive: a search
or a bulk close reads them to do its job and does not retain or transmit them afterwards.

Every entry point is keyboard reachable with an accessible name and state, validation and result
changes are announced without constant interruption, and match highlighting is never the only way
a result is conveyed.

## Verification

| Test | What it holds |
|---|---|
| `regexEngine.test.ts` | Valid and invalid patterns, every supported flag, escaping a literal, capture and named groups, zero-width matches, and each of the four bounds being enforced and reported. |
| `regexRisk.test.ts` | The exponential shapes that are refused, the realistic queries that are not, and the reason text that comes back with a refusal. |
| `regexPolicy.test.ts` | Every search-shaped input in the package uses a shared field or carries a written exemption, every exemption still points at a file that still looks like a search, the detector catches a plain search field and does not accuse an ordinary text field, and the sweep actually found the components it is watching. |
| Per-surface mount tests | Each search bar's own suite drives its builder: opening it, two-way synchronisation, validation, clearing, and returning to plain text. Examples are `NoticeCentrePanel.test.ts`, `CommandPalette.test.ts`, `ChangelogViewer.test.ts` and `TabbedNavigation.test.ts`. |

Run the engine and policy tests with `npx vitest run packages/ui/src/components/config` from
`design/`.

## Where the builder appears

Every search bar in the application, which today includes the options editor and each of its
screens, the application settings surface, the maps and viewer menus, the marker menu, the world
wizard's steps, the release download lists, the interrupted-render list, the server profile list,
the command palette, the notification centre, the changelog viewer, the appearance editor's
element search, the colour picker, the typography editor's font searches, all four tab searches
and both tab bulk-close fields. The authority for that list is the guard rather than this
paragraph: it enumerates the components on every run, and a new surface joins the list by passing
it or fails.

## Suggested reading

- [Tabbed navigation](./tabbed-navigation.md), whose four searches and two bulk-close fields are
  the heaviest consumer of the builder.
- [The command palette](./command-palette.md) and
  [the notification centre](./notification-centre.md), two surfaces built around one of these
  fields.
- [Appearance editors](./appearance-editors.md), where the builder reaches the pickers themselves.

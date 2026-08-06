# Changelog and the in-app changelog viewer

The project's changelog is generated from its own git history and its release tags, and it is
readable inside the application rather than only on a website. Every entry carries the full SHA
of the commit that made the change, and generation fails rather than emitting a reference to a
commit that cannot be resolved.

## Behaviour

### Where the record comes from

`scripts/build-changelog.mjs` reads the repository and writes two files:

| Output | What it is |
|---|---|
| `CHANGELOG.md` | The scannable record: every version, its date, its entries grouped by area, each linked to its commit. |
| `design/packages/ui/src/components/changelog/changelogData.generated.ts` | The same record plus each commit's full message body, which is what the viewer renders and searches. Its generated filename and banner keep quoted historical prose outside executable-source policy scans. |

Both are generated. Neither is edited by hand.

- **Versions are the tags the release workflow published.** A version's entries are the commits
  reachable from its tag and from no earlier tag. That is not `previous..current`: three tags in
  this repository sit on a side branch that was merged later, and a range against the immediately
  preceding tag alone would either lose those commits or replay them under a later version.
- **The date on a version is the tagged commit's own date.** The tags are lightweight, and the
  GitHub Release for a tag is published minutes later by the same workflow run. Taking the
  publication timestamp instead would make generation depend on the network and produce a
  different file offline.
- **Entries are grouped by the area of the repository they changed**, derived from the paths in
  each commit. They are deliberately not classified as features or fixes: the commits here carry
  no such marker, so any such label would be inferred from the wording of a subject line, and a
  changelog that infers is a changelog that eventually says something nobody wrote.
- **A merge commit is one entry, marked as a summary**, carrying how many commits it brought to
  the mainline. Those commits are listed under the same version alongside it, and its own files
  are the diff against its first parent, so it is categorised by what it actually brought in.
- **A version that shipped with nothing recorded says so.** A tag can land on a commit an earlier
  tag already carried. That version keeps its place in the list with an explicit line, because a
  gap in a version list reads as history that was lost.

### The viewer

`design/packages/ui/src/components/changelog/` holds it. `ChangelogViewer` needs no props: the
data is compiled in, and the props exist so a test can mount it over a fixture.

- **Every released version**, not only the newest, plus an Unreleased section for work that is
  committed but not yet carried by a published release.
- **A search** wired to the app's own `ConfigSearchField` and the regex builder anchored to it.
  Plain text is the default and stays a case-insensitive substring match; regex is an explicit
  opt-in; query, pattern, flags, validation and mode are one piece of state shared by the field
  and the builder. The search covers each entry's subject, its full commit message, its short SHA
  and its full SHA.
- **A date filter** with two typed fields and an anchored calendar: month and year jump, range
  selection by clicking two days, and presets (today, last 7 days, last 30 days, this month, this
  year, all time). The fields accept plain ISO in every locale and the active locale's own numeric
  order, worked out from `Intl` rather than assumed.
- **The two filters compose** with "and". Both are named in the count line above the list, so a
  surprising result can be explained by reading one sentence rather than by clearing controls one
  at a time to find out which was responsible.
- **Copy and export** to Markdown or plain text, honouring the active filter and any selection.
  The file states its own scope in its first lines, and every entry carries the full SHA in text,
  so a changelog that has left the app is still traceable.
- **Commit references render short and link long**: ten hex digits on screen, the full forty in
  the accessible name and in every export.

## Configuration

Regenerate after committing:

```
node scripts/build-changelog.mjs
```

Prove the committed outputs are current, which is what CI should run:

```
node scripts/build-changelog.mjs --check
```

`--check` compares both outputs against what the current history produces and exits non-zero with
the file that is stale. It needs the full history: a default `actions/checkout` is a depth-1
clone, so a job running this needs `fetch-depth: 0`.

## Failure modes

- **An unresolvable commit reference aborts generation.** Every SHA is fed through
  `git cat-file --batch-check` before anything is written, and one missing object stops the run
  with the offending reference named. A wrong SHA is worse than no SHA, because it sends the
  reader somewhere confidently irrelevant.
- **Two commits that render the same short form abort generation**, rather than shipping two
  links that look identical.
- **A partly typed date is not an error.** `2026-08` is reported as incomplete, the text is left
  exactly as entered, and the range keeps its previous value. `2026-02-31` is reported as a date
  that does not exist. Nothing is silently applied and nothing is silently discarded.
- **A version filtered down to nothing is dropped**, while a version that genuinely shipped
  nothing is kept and labelled. Those two facts must never look the same, so the empty version is
  hidden while a filter is active: it has no text and no dates in it, so it cannot have matched.
- **An empty result names what filtered it** and offers to clear the filters, rather than saying
  "no results" and leaving a stale date range invisible.
- **A clipboard that refuses says so.** The desktop shell's own `clipboard:writeText` channel is
  tried first and the browser's API second; a failure is reported rather than leaving a button
  that looked like it worked.

## Security

Nothing here reaches the network. The changelog is compiled into the bundle, the search runs on
the local `RegExp` engine under the bounds `components/config/regexEngine.ts` states (512-character
pattern, 20000-character sample, 500 matches, 100 ms per preview run), and no pattern, sample or
export is transmitted, logged or persisted. Commit links open in a new context with
`rel="noopener noreferrer"`, so a navigation cannot replace the application window.

## Accessibility

The viewer is a labelled region with a heading, the count line is a polite live region, every
entry's checkbox is named with the entry it selects, and every commit link is named with the full
SHA rather than with the ten digits on screen. The calendar is a grid with a roving tabindex:
exactly one cell is tabbable, arrow keys move it, Home and End reach the ends of the month, and
PageUp/PageDown page by month and (with Shift) by year. The calendar is a card, so it paints its
own surface rather than letting the list behind it read through; it is bounded to the viewport and
scrolls inside that bound rather than clipping a week off the bottom; and it opens below and to
the start of the button that summoned it, so it never covers that button. Day cells are at least
32 by 32 pixels, and a day that carries entries is marked in its accessible name as well as with a
dot.

## Verification

| Test | What it holds |
|---|---|
| `changelogData.test.ts` | Every referenced commit exists in the repository, every short SHA is a real prefix of its full SHA and unique, each commit appears exactly once, every category is one the viewer can label, and the subjects match what `git log` says. The git assertions are skipped, visibly, on a shallow clone. |
| `changelogModel.test.ts` | The filters compose rather than override, an empty version is kept and marked while unfiltered and dropped while filtered, exports state their range, keep the full SHA in text and honour a selection, and the no-match state is honest. |
| `changelogDates.test.ts` | ISO parses in every locale, the locale's own numeric order is read from `Intl`, incomplete input is distinguished from impossible input and from unparsable input, no parse ever returns a day beside an error, the month grid is six consecutive weeks padded from its neighbours, and the presets are computed against a supplied day rather than the clock. |
| `ChangelogViewer.test.ts` | Mounted: every version reaches the DOM, commit links carry the full SHA, the search narrows the list and names itself, the date range and search compose in the component, the empty state names both filters and clears them, copying goes through the shell's clipboard channel, a selection narrows the export, and the region, headings and checkbox names are present. |

Run them with `npx vitest run packages/ui/src/components/changelog` from `design/`.

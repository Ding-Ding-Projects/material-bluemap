# Settings tab search

## Behaviour

The settings page keeps its existing cross-tab search and now gives every settings tab its own
search row. A tab field searches only that panel's labels, descriptions, current values, section
name and keywords. Its result count and invalid-pattern state stay beside the field, so a query in
one panel cannot silently hide or reinterpret settings in another panel.

Each field has its own adjacent regex-builder slot. Plain text is the default; switching the
builder to regex validates the pattern, preserves the selected flags, and evaluates locally against
that tab's bounded settings sample. Global and sticky expressions reset their cursor before each
predicate, so visibility and counts remain stable when a regex is reused. Clearing a field returns
focus to that same field and restores its plain-text state.

## Configuration

The tab fields are created from `SETTINGS_TABS`, so adding a settings tab automatically creates its
search input, unique accessible id, hint, clear action, result summary and builder anchor. Copy is
localized through the settings string table and follows the site's English, playful Hong Kong
Cantonese and bilingual shell settings. The page-level query and each tab query remain separate;
the page combines them with an AND predicate when both are active.

## Failure modes

- An invalid regex leaves the tab's rows visible and reports the invalid state inline rather than
  pretending that no settings exist.
- An empty query does not filter the tab and cannot trigger a bulk or destructive action.
- If browser storage is unavailable, the field still works for the current page; only preference
  persistence is lost.
- If a tab has no match, the field reports an honest no-results message while the other tabs keep
  their own independent state.

## Security considerations

Patterns and sample text are evaluated locally and are never sent to a server. The evaluator uses
the same bounded regex-builder path as the other site searches, and the matcher resets stateful
flags before every test. Only the settings metadata rendered by the current tab is exposed to its
sample provider.

## Verification

- `pnpm test --run packages/site/src/settings/tabSearch.test.ts` — one structural test confirms
  every schema tab has a unique search field and adjacent builder slot.
- Focused Pages suites — 127 tests passed across 13 files, including localization, content,
  changelog, article-palette, regex-builder and settings-tab search coverage.
- `pnpm --filter @material-bluemap/site typecheck`
- `pnpm lint`
- `pnpm --filter @material-bluemap/site build` — 205 modules transformed.

## Suggested articles

- [Localized shell and appearance coverage](localized-shell-and-appearance.md)
- [Tabbed discovery and search](tabbed-discovery.md)
- [Command palette and changelog](command-palette-changelog.md)

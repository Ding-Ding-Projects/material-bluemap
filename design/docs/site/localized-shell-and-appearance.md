# Localized shell and appearance coverage

## Behaviour

The Pages shell persists exactly three modes—English, playful Hong Kong Cantonese, and
bilingual—and two independent funny-level values, one per language. The main tab labels,
discovery headings, command palette, changelog controls, status messages, and search-builder
labels read those live values. The search package is synchronised from the shell at boot and on
every setting change, so a search field refreshes its own label, placeholder, builder title and
results without sharing query or regex state with another field.

Documentation search results carry `article-id#section-id`. Activating one opens the documentation
tab, expands the article, focuses its summary, and scrolls to the exact matched section heading.

Every semantic control rendered inside a Pages surface is registered as a per-instance Material
appearance target. Right-click, <kbd>Shift</kbd>+right-click, <kbd>Shift</kbd>+<kbd>F10</kbd> and
<kbd>Alt</kbd>+<kbd>Enter</kbd> reach the same context menu/editor paths, and the editor itself is
also a target.

## Configuration

Preferences are stored through `src/platform/Preferences.ts` under the site namespace. The
settings page owns the language mode, English funny level and Cantonese funny level; the shell
does not duplicate or shadow those values. Appearance edits are stored by kind and instance and
can be reset per element or globally.

## Failure modes

- If browser storage is unavailable, the settings still affect the current page and the settings
  surface reports that they will not survive reload.
- An invalid or partial typed changelog date stays visible and is marked invalid; it is not
  silently coerced or dropped.
- If a section id cannot be resolved, the result falls back to the article disclosure rather than
  throwing or leaving the visitor on a blank page.

## Security considerations

Search patterns and sample text remain local to the bounded regex evaluator. Appearance values are
validated before persistence. Provider-authored documentation is rendered through the isolated
content renderer and never interpreted as executable HTML.

## Verification

- `pnpm --filter @worldlens/site typecheck`
- `pnpm test --run packages/site/src/content/dateRangePicker.test.ts packages/site/src/content/content.test.ts packages/site/src/search/attachBuilder.test.ts`
- `pnpm lint`
- `pnpm --filter @worldlens/site build`

## Suggested articles

- [Tabbed discovery and search](tabbed-discovery.md)
- [Command palette and changelog](command-palette-changelog.md)
- [Notifications and destructive gate](notifications-and-destructive-gate.md)

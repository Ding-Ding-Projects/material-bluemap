# Product contracts

Five cross-cutting requirements apply to every user-facing surface Worldlens ships: the
Electron desktop app, the map webapp the standalone server serves to browsers, and any
documentation or landing page the project publishes. They are contracts rather than features,
because each one applies to every surface individually and none of them is satisfied by
implementing it once in a convenient place.

Each contract has its own document below, covering behaviour, configuration, failure modes,
security and accessibility, and verification.

## Status: none of the five is implemented yet

This index states status honestly, so nobody reads a contract document as a description of
shipped behaviour. **All five are pending.** [`../../ROADMAP.md`](../../ROADMAP.md) schedules
them to land with Phases F through I, alongside the options GUI, the Docker hosting GUI, and the
desktop quality-of-life work that gives them surfaces to apply to.

What exists in `packages/ui` today is a shell: 9 TypeScript and Vue source files (about 474
lines) plus 2 stylesheets. Concretely, that is `App.vue` (an app bar, a navigation drawer, a
day/night toggle and a reset-camera button), `components/MapView.vue`, `components/ProfileManager.vue`,
`stores/profiles.ts`, `i18n.ts`, `vuetify.ts`, `main.ts`, `index.ts` and `bridge.d.ts`. It has no
search bar, no tab strip, no context menus, no appearance editor and no destructive action, which
is why none of the contracts has anything to attach to yet.

| Contract | What it requires | Status |
|---|---|---|
| [Regex builder](./regex-builder.md) | A full guided regex builder in the product, reachable from **every** search bar and every settings, properties or appearance surface, with plain text as the default and two-way sync of query, pattern, flags, validation and mode | **Not implemented.** A standalone, worker-isolated reference builder is vendored at [`../../tools/regex-builder-reference/regex-builder.html`](../../tools/regex-builder-reference/regex-builder.html), but it is a reference tool, not wired into any product surface. No search bar exists in the UI yet. |
| [Tabbed navigation](./tab-navigation.md) | Browser-style tabs with overflow, reordering, pinning, grouping, four separate tab searches, the two bulk-close actions, and persistence of order, pins, groups and collapsed state | **Not implemented.** The UI shell navigates with an app bar and a navigation drawer. There is no tab strip, no group model, and nothing persisted. |
| [Appearance editors](./appearance-editors.md) | An **Edit appearance…** editor anchored beside every rendered element, Word-depth typography, an infinite colour picker with the colour translator, presets, export/import, per-element and global reset | **Not implemented.** `vuetify.ts` configures a single Material Design 3 theme. There is no per-element editor, no colour picker and no persisted appearance state. |
| [Localization](./localization.md) | English, playful Hong Kong-style Cantonese and bilingual modes, persisted, plus two independent funny-level sliders (1 to 5, one per language) wired to the rendered copy | **Not implemented.** `i18n.ts` is a port of the upstream webapp locale loader: HOCON files under `./lang/`, lazily fetched, with the language list and default from `./lang/settings.conf` and 30 upstream locales bundled. The three required modes, the Cantonese copy and both sliders do not exist. |
| [Super confirmation](./super-confirmation.md) | Two independent key controls plus a full-range slider before any destructive action, with an emergency exit, in the app's own UI layer | **Not implemented.** The app exposes no destructive action yet, so there is nothing gated and nothing to gate. This lands with the options and Docker hosting GUIs, which introduce the first destructive operations (deleting profiles, maps, render output and containers). |

## What "implemented" will mean

A contract moves out of pending only when it is implemented, documented, localized, persisted
where applicable, resettable where applicable, and covered by the tests its own document
specifies. Each document ends with a Verification section listing exactly those cases. Partial
credit does not apply: a regex builder reachable from four of five search bars is a pending
contract with a bug, not a shipped one.

When a contract lands, update its row here in the same task, with the phase it landed in and the
tests that prove it. An index that describes the past is worse than no index, because a reader
cannot tell it is stale.

## Related

- [`../../ROADMAP.md`](../../ROADMAP.md) has the phase table these contracts are scheduled
  against.
- [`../../../plan.md`](../../../plan.md) maps each contract into the build phases and records the
  scope decisions behind them.
- [`../porting-conventions.md`](../porting-conventions.md) governs the ported code these
  contracts sit on top of. The contracts are additions beyond upstream BlueMap, so anything they
  change about ported behaviour belongs in [`../deviations.md`](../deviations.md).

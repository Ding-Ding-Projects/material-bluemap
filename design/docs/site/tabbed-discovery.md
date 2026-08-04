# Tabbed discovery and search

## Behaviour

The Pages shell uses browser-style tabs. The `Search` tab mounts independent search surfaces for
documentation articles, settings options, the current tab strip (including overflow), each tab
group, group names, and every open tab. Group surfaces are derived from the persisted group list:
creating, renaming, or removing a group rebuilds only that group's search controls, so a new
group never borrows another field's query or regex state. Both bulk-close directions are present
and share the same field-level matcher, with pinned tabs excluded by default and a reviewable
preview before close.

Every tab, group, overflow, and page-action menu also owns a keyboard-accessible local filter.
The filter defaults to plain text and its adjacent guided builder can opt into the bounded
ECMAScript regex engine without changing the menu command semantics. Empty matches are stated in
the menu itself, and the builder returns focus to the menu field when it closes.

## Configuration

Search mode is plain text until the visitor opts into regex. The adjacent guided builder owns the
pattern, flags, sample text, validation, captures, and copy/export for that one field. Queries and
patterns stay in the browser's local preference namespace; article text and tab labels are not
sent over the network.

## Failure modes and security

Invalid patterns render an explicit invalid state and never close or hide data. Evaluation is
bounded by the shared evaluator, and bulk close reports excluded or failed tabs instead of
claiming they closed. Only visible labels/titles are searched; hidden metadata is not included.

## Verification

`pnpm --filter @material-bluemap/site typecheck`, the site Vitest suite, and the Vite production
build pass in the Pages rewrite worktree. The discovery regression test mutates the group list and
proves that the independent group fields appear and disappear with it; `Menu.test.ts` proves the
menu-owned field filters commands, exposes its builder affordance and reports an honest empty
state. Runtime browser capture remains a separate evidence boundary.

## Suggested articles

- [Command palette and changelog](command-palette-changelog.md)
- [Notifications and destructive gate](notifications-and-destructive-gate.md)

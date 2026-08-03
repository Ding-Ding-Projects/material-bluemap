# Tabbed navigation

## Behavior

Every user-facing app and every documentation or Pages site it ships uses persistent browser-style tabs for discrete pages. Tab strips support overflow without clipping, reordering, pinning, grouping, a searchable tab list, persisted structure, and per-tab appearance customization.

Pinning is first-class: users pin and unpin through the context menu, keyboard path, and searchable list. Pinned tabs occupy a stable dedicated region, remain reachable during overflow, reorder within that region, retain a full accessible name when visually compact, and stay protected from close-others, close-to-edge, and text-based bulk closes unless an explicit previewed include-pinned choice expands the scope.

Grouping is equally complete. Users create, name, rename, color, reorder, collapse, expand, and remove groups; move tabs into, out of, and between groups with pointer or keyboard input; and restore group order, membership, collapsed state, tab order, and pinned order after restart. Groups are fully decoratable: normal right-click includes **Edit group appearance…**, Shift+right-click opens the anchored editor directly when supported, and the editor controls all installed-font typography, text and highlight colors, icons or emoji, badges, foreground/background treatments, borders, shapes, radius, spacing, separators, and interaction states. Decorations persist per group, reset/export cleanly, retain contrast, and never replace the accessible group name, count, or expanded/collapsed state. Search and bulk-close scope remains explicit for the current group, selected groups, or all groups.

Every app ships four separate search scopes:

1. **Current tab-strip search** searches the visible strip and its overflow.
2. **Per-group tab search** exists inside every group and searches only that group's tabs.
3. **Tab-group search** searches group names and visible group labels.
4. **Master tab search** covers every open tab across all app-owned windows, workspaces, strips, and groups.

Each field owns an adjacent anchored full regex builder and independent query, pattern, flags, validation, and mode; plain text remains the default. Results show the visible label, window or workspace, strip, group, and pinned state. Keyboard activation focuses the result and provides a return path. Activating a result in a collapsed group reveals it temporarily without erasing the user's saved collapsed preference. Search results retain the active query while exposing only the tab-management actions valid for that result.

Every tab strip and searchable tab list also provides these two bulk-close actions:

1. **Close tabs containing text** closes tabs whose visible label or title matches user-entered text.
2. **Close tabs not containing text** closes tabs whose visible label or title does not match the same predicate.

The scope is deliberately visible tab text. Page contents, hidden metadata, credentials, and other non-displayed data are not inspected unless a product adds a separately named, documented scope that the user explicitly selects.

Plain-text matching is the default. Each action has a builder affordance anchored beside its input that opens the project's complete regex builder and synchronizes query, pattern, supported flags, validation, and mode in both directions. Regex mode is optional for the user, but the full builder is a required part of both actions. The inverse action negates the identical matcher rather than maintaining a second interpretation of case, Unicode, flags, or scope.

Each tab also has a complete appearance editor. Normal right-click preserves tab management and includes **Edit tab appearance…**; Shift+right-click opens the editor directly when supported. The non-modal dialog or popover stays anchored beside that tab and exposes all installed fonts, Word-style typography and text effects, continuous color/highlight pickers with built-in translation, and per-tab size, shape, spacing, icon, and state styling. The [appearance-editor contract](./appearance-editors.md) defines the full control set and verification bar.

## Configuration and safeguards

Before a bulk close, show whether matching is plain text or regex, the number of affected tabs, and a reviewable preview. An empty query or invalid regex closes nothing. Exclude pinned tabs by default and require an explicit **Include pinned tabs** choice to expand the scope. Existing unsaved-work prompts and recovery behavior remain authoritative for every affected tab.

Use a blocking confirmation only when the user must decide before continuing, such as including pinned tabs or handling unsaved work. Report progress, excluded tabs, partial completion, and non-decision errors through the non-blocking notification system. Never claim that a protected or failed tab closed.

Apply the required English, playful Hong Kong-style Cantonese, and bilingual modes. Persist only ordinary tab preferences that the product already documents; do not persist a sensitive query, pattern, sample, or preview without explicit need and consent.

## Failure modes

The feature is incomplete if either direction is missing, if “not containing” uses a separate matcher with different flags or casing, if regex is reduced to a toggle without the full builder, if the builder is detached from the action that consumes it, or if a stale valid pattern runs after the current pattern becomes invalid.

Closing on empty input, silently including pinned tabs, bypassing unsaved-work protection, inspecting hidden content without a named scope, freezing the main interface, or reporting partial completion as total success are defects.

## Security and accessibility

Evaluate locally under the regex-builder pattern, sample, result-count, and execution-time bounds. Handle zero-width matches and catastrophic backtracking safely. Treat tab titles as potentially sensitive: do not transmit, log, or retain them merely to perform a bulk close.

Both actions, their builder affordances, the preview, the pinned-tab option, and confirmations must be keyboard reachable and screen-reader named. Announce the active mode, validation error, affected count, excluded count, and completion result without relying only on color. Return focus sensibly after the builder, preview, or confirmation closes.

## Verification

Test exact, substring, case-sensitive, case-insensitive, Unicode, multiline-title, no-match, all-match, zero-width, invalid, empty, oversized, timeout, and adversarial patterns against the project's production regex engine. For every case, compare **contains** with **not containing** and prove they partition the same eligible tab set.

Exercise current-strip, every per-group, group-name, and master all-tabs search independently in plain and regex modes. Prove there is no cross-field state leak, location and pinned metadata are correct, collapsed-group results reveal without changing the persisted preference, and keyboard activation/return works. Also exercise pinned and unpinned tabs, pinned order, group creation/rename/color/reorder/collapse/removal, tab moves between groups, every group decoration and interaction state, group reset/export, persisted group state, unsaved work, partial failures, current/selected/all-group scopes, narrow layouts, tab overflow, screen-reader state, reduced motion, contrast, and all three language modes. Confirm that the preview equals the attempted set and that the final result names every excluded or failed tab honestly.

[Product index](./README.md) · [Regex builder](./regex-builder.md) · [Appearance editors](./appearance-editors.md) · [Localization](./localization.md)

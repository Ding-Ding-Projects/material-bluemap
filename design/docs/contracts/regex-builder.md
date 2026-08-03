# Regex builder

## Behavior

Every new and existing project ships a usable regex builder. This requirement has no exemption for libraries, services, infrastructure, documentation, or configuration repositories. If a project does not have a builder, the next project-changing task includes it before completion.

This repository demonstrates the contract with its local, worker-isolated [ECMAScript regex builder](../../tools/regex-builder-reference/regex-builder.html).

Expose the builder through the project’s natural interface. User-facing applications use an accessible screen, panel, drawer, or dialog. Non-UI projects provide a documented runnable CLI, TUI, or local web tool. Linking only to an unrelated external regex site is insufficient.

The complete builder provides:

- guided insertion of literals, character classes, anchors, groups, alternation, and quantifiers;
- a raw pattern editor and every supported flag;
- editable sample text, syntax feedback, live match highlighting, capture-group inspection, and copy or export; and
- a visible statement of the project’s real regex engine, dialect, flags, and escaping rules.

Every search bar provides direct access to this complete builder. Plain-text search remains the default until the user deliberately enables regex. The search surface and builder synchronize the query, pattern, flags, validation state, and active mode in both directions. A compact search bar may open the builder through progressive disclosure, but it may not offer only a reduced regex toggle or redirect to an external tool.

The **Close tabs containing text** and **Close tabs not containing text** fields are search inputs under this contract. Each must open its own full anchored builder and apply the resulting pattern and flags to the same visible-tab-label predicate. Regex use is optional for the user; shipping the complete builder beside both actions is not optional.

## Configuration

Use the project’s production regex engine so the builder’s results match the feature that consumes the pattern. Keep engine adapters and limits explicit, keep the builder separate from unrelated product logic, and document how to launch it. Apply the required English, playful Hong Kong-style Cantonese, and bilingual modes to every user-facing builder surface.

Projects may choose their own safe pattern length, sample size, match-count, and execution-time limits. State those limits near the builder or in its documentation. Search integrations must define how flags, case sensitivity, whole-field matching, and empty patterns interact with the existing search behavior.

## Failure modes

A missing builder, an unconnected mockup, a regex preview that uses a different dialect than production, a search bar without the complete builder, a one-way query sync, or regex mode that silently changes plain-text search is a product defect. Syntax errors must remain visible and must not execute a stale prior pattern.

Handle zero-width matches without an infinite loop. Treat timeouts, match truncation, unsupported flags, invalid escapes, and input-limit violations as explicit states. Copy/export must preserve the exact pattern and flags without adding undocumented delimiters or escaping.

## Security and accessibility

Evaluate locally when practical. Do not transmit, log, or persist patterns or sample text without an explicit need and user consent. Bound pattern and sample sizes, match counts, and runtime. Isolate or time-limit evaluation so catastrophic backtracking cannot freeze the main interface or exhaust a service; apply rate limits and resource controls when evaluation is server-side.

The builder and each search-bar entry point must be keyboard reachable, have accessible names and state, retain focus sensibly when opened or closed, and announce validation and result changes without excessive interruption. Match highlighting cannot be the only way results are conveyed. Keep safety and error copy clear in every language mode.

## Verification

Test the builder against the project’s real regex engine. Cover guided controls, raw-editor synchronization, supported flags, copy/export, valid and invalid patterns, no-match input, Unicode, multiline anchors, zero-width matches, numbered and named captures, result truncation, input limits, timeouts, and adversarial backtracking cases.

For every search bar, exercise plain-text and regex modes, opening the full builder, two-way query and flag synchronization, validation, clearing, keyboard use, narrow layouts, and a return to plain-text mode without changing the literal query. For both tab-closing actions, prove that contains and not-contains negate the same predicate, invalid or empty input closes nothing, the preview matches the affected set, pinned-tab defaults and unsaved-work protection hold, and Unicode/case flags do not diverge. Test all three language modes and confirm that no pattern or sample text is persisted or transmitted unexpectedly.

[Product index](./README.md) · [Localization](./localization.md) · [Tabbed navigation](./tab-navigation.md)

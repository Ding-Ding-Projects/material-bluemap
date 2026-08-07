# Scheduled settings and external sources

The documentation site can temporarily apply its real language and appearance settings from a
versioned schedule. A rule never rewrites the visitor's underlying preference: when it stops
matching, the next lower-priority match is evaluated, and the stored base returns only when no
candidate applies or an external lookup fails closed.

## Behaviour

Each rule has a stable ID, visible label, enabled state, priority, optional date range, start and end
time, timezone, and either every day or selected weekdays. Equal start and end times mean the full
selected day. A cross-midnight window belongs to the day on which it starts. Higher priority wins;
the later rule wins a priority tie.

The target picker is populated from the site's live settings declaration. Toggle, choice, number,
colour, font, and text values use the same bounds and options as the ordinary Settings surface.
Search and the command palette index both schedule destinations and teleport to the exact editor.

## Configuration

Open **Settings → Schedules**. Add a rule, choose its dates, times, timezone and weekdays, then add
one or more real settings. Choose one source per rule:

- **Values in this rule** applies the selected values directly.
- **Versioned JSON API** expects `{ "version": 1, "values": { ... } }` from an HTTPS URL (loopback
  HTTP is allowed for local development). Unknown or invalid setting IDs are not applied.
- **Home Assistant boolean entity** reads an `input_boolean.*` or `binary_sensor.*`. `on` applies
  the rule's values. `off` means that rule does not match, so evaluation falls through to the next
  lower-priority matching rule. Enter the token in the password field for the current page session;
  it lives only in memory and can be cleared per rule or all at once.

Rules export as UTF-8 JSON, import through the same validator, and retain a bounded 100-entry local
history. Restoring creates another history entry rather than rewriting the previous record.

## Failure modes

- Invalid IDs, dates, timezones, times, weekday sets, priorities, values, URLs, refresh intervals,
  entity IDs, and credential keys are named inline and the rule is not saved.
- External requests refuse non-loopback cleartext HTTP, URL credentials, fragments, redirects,
  responses above 64 KiB, authentication failures, rate limiting, malformed JSON, and timeouts over
  eight seconds.
- A newer refresh aborts and supersedes an older generation, so a slow response cannot overwrite a
  newer rule result.
- External failures restore the base layer, show a persistent non-blocking error notification, and
  leave **Refresh and apply now** beside the failing configuration.
- A reload, page close, **Clear this token**, or **Clear all session tokens** removes the in-memory
  token. The rule then reports `missing-token` until the visitor enters it again.

## Security considerations

Tokens are held only in a page-lifetime JavaScript map. They are absent from local storage, session
storage, the rule schema, browser exports, history, logs, URLs, and user-facing error text. Requests
omit ambient credentials, use manual redirect handling and a bounded body, and accept only
allowlisted setting IDs validated against the site's real schema. Schedule data remains in the
site's namespaced browser storage and is not transmitted unless the visitor configures an external
source.

## Verification

- `schedule.test.ts` covers dates, timezones, weekdays, cross-midnight and full-day windows,
  precedence, versioning, rule-count bounds, history/restore, API and Home Assistant validation,
  response bounds, cancellation, and base-value recovery.
- `scheduleHomeAssistant.integration.test.ts` drives a real loopback HTTP server for `on`, `off`
  fallthrough, unavailable and authentication responses, and proves the token is absent from
  persistence, export data and console output.
- `schedulePanel.test.ts` covers the real Schedules tab, guided controls, save/history, search and
  teleport destinations, rendered scheduled theme, the password input, clearing, and the
  session-only disclosure.
- `compact-proof.mjs` opens the built schedule editor at `390×844` bilingual, adds a rule, and fails
  on accidental overflow, clipped controls, undersized targets, a missing surface, or incorrect
  compact navigation state.
- Genuine headless capture: `docs/screenshots/pages-parity-schedule-390x844-bilingual.png` with its
  machine-readable record in `docs/runtime-proof/pages-parity-schedule-390x844-bilingual.json`.

## Suggested articles

- [Pages feature parity](pages-feature-parity.md)
- [Language and tone](language-and-tone.md)
- [Appearance editors](appearance-editors.md)
- [Notification centre](notification-centre.md)

# Localization

## Behavior

Every user-facing application provides a persisted, configurable language mode with exactly these baseline choices:

1. English;
2. playful Hong Kong-style Cantonese; and
3. bilingual.

Cantonese may be funny and locally natural, but destructive, financial, security, accessibility, and error messages must remain respectful, clear, and accurate. Bilingual mode keeps the primary label prominent and presents compact secondary copy or progressive disclosure without crowding the interface.

Every user-facing application also exposes a persisted funny-level slider from 1 (fully serious) to 5 (maximum playfulness), adjustable independently for English and for Cantonese. The slider scales tone only: at every level the destructive, financial, security, accessibility, and error copy stays clear and accurate, level 1 reads fully professional, and level 5 is maximum playfulness.

An application may additionally offer an optional spoken TTS narrator for app events. It stays off by default and is enabled only by the user, narrates in English, Cantonese, or Both (English then Cantonese, strictly serialized) using natural-sounding voices with a Hong Kong Cantonese voice for the Cantonese track, and plays infrequently through debounce plus a per-category cooldown. The narrator speaks one non-overlapping utterance at a time from a serialized queue that replaces a superseded queued line rather than stacking it. Its tone follows the per-language funny-level, while error narration stays plain, clear, and accurate at every level and is never suppressed by the rate limits.

## Configuration

Keep localization resources separate from product logic. Persist the selected mode, define deterministic fallback behavior, and make all three choices reachable through an accessible control. Non-UI libraries and infrastructure need no language mode until they add a user-facing surface.

## Failure modes

Missing translations, untranslated interpolation, a nonpersistent choice, broken fallback, ambiguous safety copy, or bilingual overflow is a product defect. Do not silently fall back in a way that changes the meaning of a destructive or security-sensitive action.

## Security and accessibility

Never interpolate secrets or private data into translation telemetry or error messages. Preserve accessible names, focus behavior, reading order, input purpose, and sufficient contrast in every mode. Humor must not obscure consent, risk, cost, or failure. An optional spoken narrator must yield to or duck under an active screen reader and honor reduced-sound or quiet-hours settings where they exist, so it never competes with assistive technology.

## Verification

Test all three modes, persistence after restart, missing-key fallback, variable-length content, keyboard and assistive-technology labels, and common narrow layouts. Test the funny-level slider at levels 1 through 5 for each language independently, confirming persistence, that level 1 is fully professional, and that safety-critical copy stays clear at level 5. Review critical Cantonese copy for naturalness and precise meaning; verify bilingual mode does not truncate primary actions. If a spoken narrator is present, verify it is off by default, serializes Both-language output as English then Cantonese, keeps utterances non-overlapping through the queue with superseded lines replaced, keeps error narration clear and never rate-limited, and yields to screen readers and reduced-sound or quiet-hours settings.

[Product index](./README.md)

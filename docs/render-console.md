# Render console

## Behaviour

The render screen keeps a bounded console instead of a last-lines `<pre>`. Each line carries
its level as text as well as a theme-aware colour, so warnings and errors remain distinguishable
without colour vision.

**Following new output is a checkbox, "Follow new lines", on by default.** While it is on and the
view is already at the bottom, every new line pulls the view down with it. The moment a reader
scrolls up - a wheel notch, a keyboard press, a dragged scrollbar - following *pauses*
automatically, without touching the checkbox: the reader did not say "stop following forever",
they scrolled up to read something. A `Newest lines` control appears only while paused, and either
scrolling back to the bottom by hand or clicking it resumes following. Turning the checkbox off
stops new output from moving the view at all, and `Newest lines` never appears while it is off -
there is nothing to "get back to following" when following was never asked for.

A reader's own text selection inside the console is never fought: an append that would otherwise
scroll checks for an active, non-collapsed selection first and, if it finds one, leaves the view
exactly where it is rather than yanking a half-copied sentence out from under the reader. Scrolling
never moves keyboard focus, either.

The `<ol>` carries `role="log"` for assistive technology but sets `aria-live="off"` deliberately:
`role="log"` has an implicit `aria-live="polite"`, and a render prints lines by the thousand, which
would otherwise mean a screen reader narrating every single one as it arrives. The region stays
reachable and readable line by line with the keyboard; a reader chooses when to read it rather than
having it read at them.

The preference is persisted per surface (`localStorage`, mirrored into the app settings history)
and restored on the next launch. `components/scroll/stickyScroll.ts` and
`components/scroll/autoScrollPrefs.ts` hold the shared mechanism; `BackupRunCard.vue`'s and
`DownloadRowCard.vue`'s own logs use the same two modules for the identical behaviour, see
[Backing up a world or a rendered map](./backup.md) and
[Large worlds and rendered maps](./large-worlds.md).

The cap is explicit: the UI reports how many earlier lines were dropped rather than implying the
visible slice is the whole log. Advice rows can point to the exact settings target that needs
attention. Copy and Markdown export use the current selection and preserve the level, timestamp
and rendered text.

## Configuration

The console accepts the line stream, a dropped-line count, a cap and a height from the render
screen. The default cap is 10,000 lines and the default height is a responsive viewport clamp.
Search uses the shared settings field and its adjacent regex builder; plain text is the default,
and invalid patterns match nothing. The component honours `prefers-reduced-motion` for both the
follow-scroll animation and its own indeterminate progress, and uses the active English, Cantonese
or bilingual language mode. Auto-scroll follows the reader's chosen funny level and language mode
too - the checkbox's own tooltip is voiced at all five levels in both languages.

## Failure modes

- A line outside the cap is not silently counted as present; the dropped count remains visible.
- A detached (paused) reader is not pulled to the bottom by progress ticks.
- A reader with an active text selection inside the console is not scrolled away from it.
- A failed copy/export action reports a non-blocking notice and leaves the console usable.
- A setting target that is no longer mounted is reported as unavailable instead of pretending it
  opened.

## Security considerations

Console text is rendered as text, never as HTML, so engine output cannot inject markup into the
app. Export is local and does not upload log lines. Search is bounded by the same local regex
limits as every other settings field.

## Verification

`RenderConsole.test.ts`, `annotations.test.ts` and `consoleModel.test.ts` cover line-level
selection, level labels, follow/detach behaviour, dropped-line accounting, advice navigation,
reduced motion, copy/export and invalid/regex search. `RenderConsole.test.ts` (27 tests) adds
coverage for the auto-scroll checkbox specifically: on by default with a real accessible name,
following new output while checked, not moving the view once unchecked, pausing without
unticking the checkbox on a manual scroll, resuming on scrolling back to the bottom, the jump
control appearing only while paused, not scrolling away from an active text selection, never
moving keyboard focus, and the preference surviving a fresh mount. `components/scroll/`'s own
`stickyScroll.test.ts` (16 tests) and `autoScrollPrefs.test.ts` (17 tests) prove the shared
mechanism directly, including reduced motion and storage-failure paths.

## Suggested articles

- [Rendering on a remote host](./remote-render.md) for the same progress and cancellation model
  when the engine runs over SSH.
- [The regex builder and the search bars it reaches](./regex-builder.md) for the shared search
  contract.
- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) for
  the advice actions that appear beside failures.

# Render console

## Behaviour

The render screen keeps a bounded console instead of a last-lines `<pre>`. Each line carries
its level as text as well as a theme-aware colour, so warnings and errors remain distinguishable
without colour vision. The view follows new output only while it is already at the bottom. Once a
reader scrolls up, the console stays detached and exposes a `Jump to latest` action.

The cap is explicit: the UI reports how many earlier lines were dropped rather than implying the
visible slice is the whole log. Advice rows can point to the exact settings target that needs
attention. Copy and Markdown export use the current selection and preserve the level, timestamp
and rendered text.

## Configuration

The console accepts the line stream, a dropped-line count, a cap and a height from the render
screen. The default cap is 10,000 lines and the default height is a responsive viewport clamp.
Search uses the shared settings field and its adjacent regex builder; plain text is the default,
and invalid patterns match nothing. The component honours `prefers-reduced-motion` and uses the
active English, Cantonese or bilingual language mode.

## Failure modes

- A line outside the cap is not silently counted as present; the dropped count remains visible.
- A detached reader is not pulled to the bottom by progress ticks.
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
reduced motion, copy/export and invalid/regex search. The full workspace gate at commit
`897ecad1662c59e5a87affd1d89627b289d91d71` reports 349 test files, 5,602 passed and 3 skipped;
typecheck, lint and build also pass locally.

## Suggested articles

- [Rendering on a remote host](./remote-render.md) for the same progress and cancellation model
  when the engine runs over SSH.
- [The regex builder and the search bars it reaches](./regex-builder.md) for the shared search
  contract.
- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) for
  the advice actions that appear beside failures.

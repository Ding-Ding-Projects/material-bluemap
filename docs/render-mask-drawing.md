# Drawing a render mask

`render-mask` decides which part of a world BlueMap actually renders. It used to be configured
entirely by typing block coordinates into numeric fields
(`design/packages/ui/src/components/config/ConfigMaskField.vue`) — a control nobody can use
without already knowing the exact X/Y/Z of the area they care about. This document covers both
halves now: the **value layer** underneath a drawing surface (the two-way-bound numbers, the
honest cost estimate, the engine-fidelity check, and export/import) and the drawing surface
itself, `design/packages/ui/src/components/config/MaskDrawingCanvas.vue`, an SVG canvas with
draggable handles, snap-to-chunk/region, undo/redo, zoom, presets and a keyboard-operable
equivalent for every gesture. See [What still needs building](#what-still-needs-building) for
what is genuinely not wired up yet.

## Behaviour

### The mask stays what the config schema already defines

Nothing here invents a new mask representation. `@material-bluemap/config`'s `MaskConfig` union
— `box` / `circle` / `ellipse` / `polygon` / `blur`, each optionally `subtract`, combined as an
ordered list — is the single source of truth, exactly as `docs/config-history.md` describes for
every other config value. A drawing surface produces the same `Record<string, PlainValue>` shape
`ConfigMaskField.vue`'s own `v-model` already speaks.

### Two-way binding: neither the numbers nor the drawing is the master

`design/packages/ui/src/components/config/maskDraft.ts` holds one shape's numeric fields and its
drawn geometry as one synchronised value, on the same discipline this project's regex builder
already uses for pattern and flags:

- **Typing** a coordinate calls `setFieldText`. A value that parses cleanly commits immediately
  and the drawing can move. A value that does not — `""`, `"-"`, `"12x"`, mid-edit — updates only
  the displayed text and reports why in `error`; the committed number, and therefore the drawn
  shape, is left exactly where it was. A stray keystroke never snaps a shape somewhere absurd.
- **Dragging** a handle on a canvas calls `setFieldNumber`. It always produces a valid value —
  an integer field is rounded to the nearest whole block, the same rounding a typed fractional
  value already gets truncated to, so the two input paths never quietly disagree about where the
  block boundary is.
- **`draftToRecord`** is the only place the two are reconciled back into the plain record the
  config editor saves: it always reads the committed number, never the currently displayed text,
  so a field mid-invalid-edit still saves and draws using the last value that was genuinely
  valid. Non-numeric parts of a shape's record — a polygon's own point list, a blur's nested mask
  list — pass through untouched; this module only owns the numeric fields.

### What it costs, honestly

`design/packages/ui/src/components/config/maskGeometry.ts` turns a mask list into an area figure
in blocks, chunks (16×16 blocks) and regions (512×512 blocks — 32×32 chunks, Minecraft's own
anvil region size), plus the X/Z extent a drawing surface should frame the world in.

The estimate is honest rather than invented wherever exactness would be expensive:

| Situation | What is reported |
|---|---|
| No shapes at all | `whole-world`: the whole world renders, no number to give |
| Exactly one additive, fully bounded shape | `exact`: the real analytic area (box: product of the ranges; circle/ellipse: πr²/πr₁r₂; polygon: the shoelace formula) |
| More than one additive shape, or any `subtract` shape | `upper-bound`: the **sum** of the additive shapes' own footprints. Real overlap or subtraction only ever makes the true rendered area *smaller*, so this bound never understates the real cost |
| Any additive shape unbounded on an axis | `unbounded`: no number at all, rather than a guess |

A combined mask's *exact* rendered area depends on where shapes overlap and what they subtract —
recomputing that precisely means testing every block, which is most of a render, not an estimate
of one. `MaskCostEstimate.exact` says which case applied, so a caller renders "≈" rather than
presenting an upper bound as a fact.

### Getting the drawn mask to the engine intact — and where it silently does not

`render-mask` reaches the actual render engine through two genuinely different routes, and they
do **not** honour it equally:

- **The local desktop render** runs the real upstream BlueMap jar in a real JVM
  (`design/packages/app/src/main/render/orchestrator.ts`), which deserialises `render-mask`
  through the real `CombinedMaskSerializer` — every shape, `subtract`, any number of them, in
  full. Whatever was drawn is exactly what renders.
- **The cloud/Actions render** is this project's own TypeScript port
  (`design/packages/cli/src/maps.ts`, `maskFor`), and today it only translates **one single,
  non-subtracting box**. Anything richer — a circle, an ellipse, a polygon, a blur, a `subtract`
  shape, or more than one shape — is logged as unsupported and the map renders **completely
  unmasked: the whole world**, not a bounding-box approximation of what was drawn.

That gap is exactly the silent-substitution failure a drawing surface must never produce.
`design/packages/app/src/main/render/maskFidelity.ts`'s `checkCloudFidelity` is a deliberate,
independent mirror of `maskFor`'s own rule — empty is fine, one non-subtracting box is fine,
everything else reports `honored: false` with a named reason ("This is a circle…", "This shape is
set to subtract…", "3 shapes are configured…"). A drawing surface calls this before a cloud
render starts and shows the real consequence — **the whole world, unmasked** — never a quieter
phrase like "may not match exactly". `localFidelity` is the reassuring counterpart: the local
desktop path is always `honored: true`, whatever shape was drawn, so the warning is legibly about
one render path and not a statement that the mask itself is broken.

**The warning exists at two levels, because the risk does too.**
`design/packages/ui/src/components/config/MaskDrawingCanvas.vue` shows a per-shape warning while
one shape is open for drawing (`cloudFidelityForSingleShape` in `maskCanvas.ts`), which answers
"if this shape were the mask's only entry, would the cloud path translate it?" — true for a plain
box, false for anything else. That question alone leaves a real gap: draw **two** ordinary,
non-subtracting boxes and every per-shape alert stays quiet, because each box *alone* would
translate fine. The mask as a whole still does not, because the cloud path only ever keeps a list
of exactly one shape.

`design/packages/ui/src/components/config/ConfigMaskField.vue` closes that gap with a second,
list-level check — `cloudFidelityForMask`, also in `maskCanvas.ts` — shown once for the whole
render-mask list rather than repeated per shape, and only at the list's top level (never for a
blur's own nested list, which softens its parent's shapes rather than standing as a mask of its
own). It is a second hand mirror of the same rule `checkCloudFidelity` already mirrors from
`maskFor`, kept in sync the same way: `maskCanvas.test.ts` exercises the identical cases
`maskFidelity.test.ts` does, so a missed hand-sync on either side is a red test, never a silent
drift. Two ordinary boxes is the case worth naming by name here, because it is the single most
likely way a real mask exceeds what the cloud renderer understands — nothing about drawing a
second box looks unusual, and nothing warned about it before this list-level check existed.

### Export and import

`design/packages/ui/src/components/config/maskFile.ts` writes a mask list as a small,
self-describing JSON document rather than requiring hand-copied HOCON:

```json
{
    "format": "material-bluemap.render-mask",
    "version": 1,
    "units": "blocks",
    "coordinateSystem": "minecraft-world-xyz",
    "exportedAt": "2026-08-05T00:00:00.000Z",
    "masks": [ /* the same MaskConfig[] the schema already validates */ ]
}
```

Units and the coordinate convention are stated in the file itself, not assumed — a reader who has
never seen this app's source still knows what the numbers mean. `parseMaskFile` never throws: a
file that is not JSON, not this format, from a newer version this build does not understand, or
holding a shape `combinedMaskSchema` refuses comes back as `{ ok: false, reason }` naming exactly
what was wrong, so an import failure is reported inline rather than silently importing nothing.
The round trip is exact — export then import reproduces the identical mask list, shape order,
`subtract` flags and all.

### Local version history — inherited, not reimplemented

A drawn mask needs no new history plumbing. It lives in the map's own `maps/<id>.conf` under
`render-mask`, exactly like every other map setting, so it is already covered by the config-folder
history `docs/config-history.md` describes in full: `ConfigScreen.vue` snapshots the folder after
every save, a restore snapshots the current disk state first and then writes the old files back as
a **new** revision — never a rewrite — and a failed history write never fails the save it was
recording. Saving a mask you just drew is a save like any other.

## What still needs building

The value layer (synchronised numeric/geometric state, the cost estimate, both cloud-fidelity
checks, export/import) and the drawing canvas itself are both built, wired together, and voiced
in the copy catalogue (`design/packages/ui/src/copy/surfaces/maskDraw.ts` is spread into
`SURFACE_VOICED`/`SURFACE_FIXED`/`SURFACE_FACTS` in `copy/surfaces/index.ts`, exactly like every
other finished surface). Two things named in earlier drafts of this document are still genuinely
not wired up:

- **the world-extent/spawn-point backing.** `inspectWorldFolder`/`measureWorld`/`LevelData`'s
  spawn read already exist for the "Make a map" wizard, but `ConfigMaskField.vue` never passes a
  `world` prop down to the canvas — every mask editor still opens against `UNKNOWN_WORLD`, an
  unlabelled grid with no real extent or spawn marker to frame itself against, rather than the
  real measured world;
- **command palette entries** pointing at the mask editor specifically. The palette's own
  catalogue (`copy/surfaces/palette.ts`) has no `mask.*` entries yet, so the render-mask editor is
  not reachable from a `Ctrl+Shift+F` search today.

`maskDraft.ts`, `maskGeometry.ts`, `maskFile.ts` and `maskFidelity.ts` are the seam a canvas
component binds to: call `createShapeDraft`/`setFieldText`/`setFieldNumber` for the synchronised
value, `estimateRenderCost` for the live cost readout, `checkCloudFidelity` before offering a
cloud render, and `exportMaskFile`/`parseMaskFile` for the share/reuse file.

## Failure modes

- **A field mid-invalid-edit never moves the drawing or the saved value.** `draftToRecord` reads
  only committed numbers.
- **An unbounded shape reports no cost number, never an invented one.** `estimateRenderCost`
  returns `basis: "unbounded"` with `areaBlocks: null` rather than treating Java's
  `Integer.MAX_VALUE` sentinel as a real coordinate.
- **A mask the cloud render path cannot translate is never silently approximated.**
  `checkCloudFidelity` reports `honored: false` and the real consequence — the whole world renders,
  unmasked — with a named reason, before any CI minutes are spent.
- **A malformed or newer-format mask file is refused with a reason, not silently emptied.**
  `parseMaskFile` never throws and never returns an empty mask for a file that failed to parse.
- **A history write that fails never fails the save.** Inherited unchanged from
  `docs/config-history.md`.

## Security considerations

A mask file is not sensitive on its own — it holds only block coordinates and shape geometry, no
credentials or paths — so export/import needs no special handling beyond the schema validation
`parseMaskFile` already applies before anything reaches `combinedMaskSchema`, the same guard the
config editor already trusts for every other value read from a file.

## Verification

- `design/packages/ui/src/components/config/maskGeometry.test.ts` — bounds, per-shape footprint
  area (box, circle, ellipse, polygon via the shoelace formula, a nested blur), and
  `estimateRenderCost`'s four bases, including that an upper bound for overlapping shapes never
  understates the true combined area.
- `design/packages/ui/src/components/config/maskDraft.test.ts` — typing and dragging never
  clobber each other or an unrelated field, invalid and partial text is reported without being
  discarded, integer rounding agrees between the two input paths, and `draftToRecord` always
  reads the committed value.
- `design/packages/ui/src/components/config/maskFile.test.ts` — export/import round-trips a
  single shape, multiple shapes with a subtract polygon, and an empty (whole-world) mask exactly;
  a non-JSON file, a wrong format, a future version, and an invalid shape are each refused with a
  named reason.
- `design/packages/app/src/main/render/maskFidelity.test.ts` — mirrors every case
  `packages/cli/src/maps.ts`'s own `maskFor` doc comment describes: empty, a single non-subtracting
  box, a single subtracting box, a circle, more than one shape, and each of the four unsupported
  shape kinds named distinctly; the local path is always honored regardless of shape.
- `design/packages/ui/src/components/config/maskCanvas.test.ts` — `cloudFidelityForSingleShape`'s
  own per-shape cases, plus `cloudFidelityForMask`'s list-level mirror of the same five cases
  `maskFidelity.test.ts` exercises: empty, one non-subtracting box, one subtracting box, one
  circle, and two plain boxes.
- `design/packages/ui/src/components/config/ConfigMaskField.test.ts` — the list-level warning
  actually renders: silent for an empty mask and for exactly one plain box, present for two plain
  boxes, a single subtracting box and a single circle, and fires exactly once — never twice — for
  a blur whose nested list holds two boxes of its own.
- `design/packages/ui/src/copy/surfaces/maskDraw.test.ts` — the catalogue's own shape (five
  levels, both languages, no em dashes), that level 1 and level 5 genuinely read differently, and
  that every pinned fact — the real numbers, and "whole world"/"unmasked" and "a single,
  non-subtracting box" in the two cloud-fidelity warnings specifically — survives every funny
  level in both languages.

## Suggested next

- [Local version history for config folders](./config-history.md) — the history a saved mask
  already inherits.
- [The regex builder and the search bars it reaches](./regex-builder.md) — the search-bar pattern
  a mask list's own search bar should follow once the drawing surface's shape list needs one.
- [Language modes and funny levels](./language-and-tone.md) — the voice/facts split
  `maskDraw.ts`'s catalogue follows.

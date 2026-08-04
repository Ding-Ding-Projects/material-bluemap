# Appearance: per-element editing, the infinite colour picker and the typography editor

An element is wrapped once and gains the whole feature: its resolved appearance applied live, a
context menu with **Edit appearance...**, a keyboard path to the same command, a non-modal editor
anchored beside it, and focus back on the element when that editor closes.

The code is `design/packages/ui/src/components/appearance/`. A host writes
`<AppearanceTarget id="app.tabBar" label="The tab bar">` around whatever it renders.

## Behaviour

### A record of opinions, not of values

An appearance record is deliberately a record of *opinions*. A key that is absent means "I have no
view on this, follow whatever is above me"; a key that is present means "this one, regardless".
Keeping those distinguishable is what makes per-property reset work at all: resetting a tab's
weight has to remove the opinion so the tab goes back to following the theme, rather than write
today's theme weight into the tab and pin it there until somebody notices, six months later, that
restyling the application changed everything except that one element.

Records resolve in layers. `GLOBAL_TARGET` is a reserved element id rather than a separate field,
so the global layer is edited, reset and exported through exactly the same code paths as any
single element's; a global layer with its own parallel implementation would be a feature with two
reset bugs instead of one.

Two halves are kept apart rather than folded into one flat bag, because they are edited in
different tabs, reset independently and, for a group header or a strip, inherited from different
places:

| Half | Properties |
|---|---|
| Surface | `backgroundColor`, `borderColor`, `borderWidth`, `borderStyle`, `borderRadius`, `paddingInline`, `paddingBlock`, `elevation`, `opacity` |
| Typography | Family, size and unit, weight, bold, italic or oblique with an angle, variable-font axes, underline style and colour, single or double strikethrough, overline, capitalisation, small caps, baseline shift and offset, text colour, highlight, outline, shadow, glow, letter spacing, word spacing, line height, direction and alignment |

An element with no overrides renders Material Design 3 `body-medium`: Roboto at 14px with a 400
weight. Every colour defaults to the empty string, meaning inherit, because an element whose
default background were a real colour would paint over whatever it sits on the moment it acquired
any override at all.

### The wrapper is invisible until it has something to paint

`AppearanceTarget` is `display: contents` by default, so adding it to an existing surface changes
nothing about that surface's layout. Typography passes straight through a contents box by
inheritance; a background, border, padding, shadow or opacity does not, and would render nothing
at all, silently, which would look exactly like the feature being broken. The wrapper therefore
becomes a real box the moment one of those declarations is present and goes back to being
invisible when the user resets them.

### Colours are stored as the user wrote them

Every colour is a string, and it is the string the user authored: `oklch(0.7 0.1 250)` stays
`oklch(0.7 0.1 250)` in the record even though what is painted is an `rgb()` the browser is certain
to understand. Storing the resolved value would destroy the gamut the user chose in, the precision
they typed and the notation they think in, and the record is the thing that gets exported, shared
and imported into a build with a different engine.

The corollary is that a colour can fail to parse, and this feature never answers a failed colour
with black. It leaves the declaration off, keeps the authored text exactly as it was, and reports
it so the editor can say which value it could not use and offer it back for correction.

### The infinite colour picker

"Infinite" is the word for the thing it is not allowed to be: a grid of swatches. Everything is
layered on a continuous two-dimensional field plus a continuous hue and alpha, and the swatches,
the recent list and the eyedropper write into that field rather than replacing it. There is no
colour expressible in sRGB that cannot be reached by dragging, and none expressible in a supported
space that cannot be reached by typing. The recent list is shared by every picker in the session
and is not persisted, and the eyedropper appears only where the platform provides one rather than
as a button that would do nothing.

The translator reads and writes eleven notations: named colours, hexadecimal (including the
eight-digit form), `rgb`/`rgba`, `hsl`, `hsv`, `hwb`, `lab`, `lch`, `oklab`, `oklch` and `cmyk`.
Alpha is preserved, the active space is named, and a contrast report is shown against the relevant
foreground or background. Any representation can be copied.

The canonical value is **unclamped** sRGB. Lab, LCH, OKLab and OKLCH can all describe colours no
sRGB display can show, and clamping on entry would quietly delete them: somebody typing
`oklch(0.7 0.35 30)` would watch it snap to something duller with no explanation. Keeping the
out-of-range numbers is what lets the picker say "this is outside sRGB, and here is what will be
shown instead", which is a true statement about a real situation. So the split runs through the
whole module: the spaces defined as re-parameterisations of sRGB (HSL, HSV, HWB, hex, CMYK) work
on the clipped colour and the caller is told whether clipping actually changed anything, while the
device-independent spaces (Lab, LCH, OKLab, OKLCH, XYZ) work on the raw value and never clip.

CIELAB and LCH use the D50 white point and OKLab and OKLCH use D65, because that is what CSS Color
4 specifies and therefore what a value pasted out of a browser's developer tools means. The
Bradford adaptation matrices are the ones the specification publishes, transcribed rather than
re-derived.

### The typography editor, and what the engine will actually draw

The offered shape is deliberately wider than CSS, because somebody who has used a word processor's
font dialog expects to find small caps, an oblique angle, a double strikethrough, an outline and a
glow. Capability detection and style generation are therefore two separate steps:
`detectTypographyCapabilities` asks the engine what it can do, and `typographyCss` emits only what
the engine accepted and returns the list it had to leave out. **The value stays in the spec either
way**, so turning the control back on, or opening the same profile on a machine with a newer
engine, brings it back untouched.

The second honesty problem has no capability flag to hang off. CSS draws underline, strikethrough
and overline through one `text-decoration-line` declaration with *one* style and *one* colour
between them, so a wavy underline beside a double strikethrough is not a thing CSS can express.
Picking one silently would leave somebody staring at a control whose value the preview ignores, so
the module picks a documented winner and returns a note naming the property that lost, for the
editor to show beside it.

The font picker offers what the application ships plus what it can reasonably assume is installed,
and can ask Chromium for the rest through `queryLocalFonts()`, which the user may refuse. Every
stack it builds ends in a generic, and CJK-capable faces are appended, because the moment text
contains a Chinese, Japanese or Korean character a Latin-only face has nothing to draw with and
the browser falls back to whatever it likes.

### The editor edits itself

The editor's root carries the resolved appearance of the `appearance.editor` target, so pointing
the editor at its own chrome restyles it while it is open. A theming feature that cannot theme its
own dialog is incomplete, and this is also the cheapest possible test of the whole thing: if the
editor cannot restyle itself, it cannot restyle anything.

The editor is not a page, deliberately. Appearance is judged by looking at the element, not at a
form, so it is a non-modal surface anchored beside the thing being edited and everything in it
changes the live element as it is touched.

### Presets, export and import

Named presets can be saved, applied and deleted; deleting one goes through the
[super-confirmation gate](./super-confirmation.md), because it takes the settings every element
following that preset was inheriting with it. A whole theme exports as JSON carrying a format
marker so a stray JSON file is not read as a theme, and imports report what it could and could not
use.

**Unknown keys survive the round trip.** A theme exported by a later build carries sections this
one has never heard of. Dropping them is the obvious implementation and it means a user who opens
their theme in an older version, changes one font and saves has silently deleted everything the
newer version added. Anything unrecognised is parked in the record's `preserved` bag and written
straight back out. This build cannot render those values and never claims to; it declines to be
the reason they vanish. A value of the wrong type is treated the same way and named in the import
report, rather than deleted.

## Configuration

| Setting | Value |
|---|---|
| Storage key | `material-bluemap-appearance` in `localStorage` |
| Export format marker | `material-bluemap-appearance` |
| Export version | `APPEARANCE_VERSION`, currently 1 |
| Global layer id | `GLOBAL_TARGET`, the reserved element id `global` |
| Context menu | **Edit appearance...** under the host's own menu items |
| Straight to the editor | Shift and right-click, or `Ctrl+Shift+F10` |
| Open the context menu by keyboard | `Shift+F10` or the Menu key |

The keyboard path is not a courtesy: `Shift+F10` and the Menu key are what a Windows user presses
to open a context menu, so they open this one. `Ctrl+Shift+F10` mirrors Shift and right-click, the
menu item displays that shortcut beside its label from the same handler that binds it, and the
wrapper advertises both through `aria-keyshortcuts`, which is how assistive technology learns
about a binding it cannot see.

The `menu` slot renders above the appearance commands, so an element that already has a management
menu keeps it and gains **Edit appearance...** underneath rather than having its menu replaced.

### Which elements are editable today

`AppearanceTarget` is a wrapper, so the set of editable elements is the set of places it is
wrapped around. On the default branch that is the window title bar, the tab bar, each server
profile row, and the editor's own chrome. Every other rendered element in the application is not
yet a target; the surrounding contract asks for all of them, and that gap is stated on the
project's contract page rather than papered over here.

## Failure modes

- **A colour that will not parse** is kept verbatim, not painted, and named back to the user. It
  is never replaced with black.
- **A colour outside sRGB** is kept, painted as its clipped equivalent, and reported as clipped
  rather than silently changed.
- **A property this engine cannot draw** stays visible with an explanation and keeps its stored
  value.
- **Two decoration controls that CSS cannot honour at once**: a documented winner is applied and
  the losing property is named beside its control.
- **A theme file from a newer build** imports, renders what this build understands, and writes the
  rest back out untouched on the next export.
- **A value of the wrong type in an imported theme** is preserved and reported rather than
  dropped, so the user is told which of their settings did not survive and can fix it.
- **Storage refuses or holds a shape this build does not expect.** Both directions are guarded and
  silent, and a bad blob is repaired rather than trusted, because the file is editable by hand and
  by an older version of this application.
- **The browser refuses font enumeration.** The picker offers the bundled and assumed-installed
  families and says nothing alarming; `queryLocalFonts` is reached for defensively and never
  throws.

## Security considerations

Nothing here reaches the network: the two bundled families ship inside the application, no font,
stylesheet or colour is fetched, and nothing is transmitted or logged. That is also what lets the
shell keep `font-src 'self'` in its Content-Security-Policy.

Appearance is written to `localStorage` and exported only when the user asks. An exported theme is
JSON containing colours, sizes and family names; it carries no path, no token and no content from
the application's data.

Font enumeration is a permissioned browser capability and is treated as one. It is asked for, it
can be refused, and a refusal is an ordinary outcome rather than an error.

An imported theme is data, never code. It is parsed as JSON, every recognised value is validated
against the property it claims to set, and anything unrecognised is preserved as opaque data that
this build never interprets. The colour strings it carries are parsed by this project's own parser
and turned into declarations by this project's own formatter, so an imported string cannot become
arbitrary CSS.

## Accessibility

The editor is reachable by pointer and by keyboard through equal paths, both advertised. It is
non-modal and anchored, tracks its anchor, flips at a viewport edge, and returns focus to the
element it was editing when it closes. Its own search field carries the regex builder like every
other search bar. The colour picker states the active space and reports contrast against the
relevant foreground or background, so a colour choice can be checked rather than guessed at. Every
property that the engine cannot support stays visible with an explanation instead of disappearing,
which keeps the control set stable for somebody navigating it by keyboard.

## Verification

| Test | What it holds |
|---|---|
| `appearanceRecord.test.ts` | Absent means inherit and present means override, per-property reset removes the opinion rather than freezing a value, and an unparseable colour is reported rather than painted. |
| `appearanceStore.test.ts` | Layer resolution including the global target, persistence guarded in both directions, a repaired blob rather than a trusted one, unknown keys and wrong-typed values preserved and reported, and presets applied, saved and removed. |
| `colorSpaces.test.ts` | The conversions, both directions, with the D50 and D65 white points the specification names, and out-of-gamut values carried rather than clamped. |
| `colorParse.test.ts` | Every notation the translator accepts, alpha preserved, and each parse failure distinguished by reason. |
| `colorFormat.test.ts` | Every notation it writes, the clip report, and the contrast report. |
| `typographySpec.test.ts` | Capability detection per property, values kept when a capability is absent, and the documented decoration winner with a note naming the property that lost. |
| `fontCatalog.test.ts` | Stacks that always end in a generic, CJK fallbacks appended, and enumeration that neither throws nor requires a browser at import time. |
| `InfiniteColorPicker.test.ts` | Mounted: the continuous field, typing in each notation, copying a representation, and the gamut warning. |
| `AppearanceTarget.test.ts` | Mounted: the context menu with the host's own items above the appearance ones, both keyboard paths, the editor anchored and returning focus, and the wrapper becoming a box only when a box declaration is present. |

Run them with `npx vitest run packages/ui/src/components/appearance` from `design/`.

## Suggested reading

- [Tabbed navigation](./tabbed-navigation.md), which carries an opaque appearance record on every
  tab and group and never reads inside it.
- [Super confirmation](./super-confirmation.md), which stands in front of deleting a preset.
- [The regex builder and the search bars it reaches](./regex-builder.md), which supplies the
  editor's and the picker's search fields.

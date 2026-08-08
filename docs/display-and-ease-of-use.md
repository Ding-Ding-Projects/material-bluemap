# Display and ease of use

One settings tab for the two choices a person makes with their eyes rather than with their
workflow: how big the whole interface is drawn, and whether it is dark, light, high-contrast, or
follows the computer. Both controls exist for the person least equipped to go hunting for them -
a child, an older reader, anyone on a dense panel who finds 14px chrome too small to read or too
fiddly to click - so both are one tab into Settings, offered as labelled buttons rather than free
fields, and surfaced as their own card on Home.

The code is `design/packages/ui/src/components/settings/uiSizeSetting.ts` and `UiSizeRow.vue` for
the size dial, `themeSetting.ts` and `ThemeRow.vue` for the theme, and the section itself in
`AppSettings.vue` under the `display` anchor.

## Behaviour

### The interface size dial

| Setting | Values | Default | Stored under |
|---|---|---|---|
| Interface size | level 1 to 5 → 100 / 125 / 150 / 175 / 200% | 1 (100%) | `worldlens.display.uiSize` |

Five stops, deliberately the same scale points the project's own sizing rule already requires
every layout to hold at ("layouts that hold at 100/125/150/200% scale"), plus the 175 midpoint.
Nothing below 100%: a dial that can make the interface smaller is a dial that can only be escaped
by finding the now-tiny control that changes it back.

The change applies live - the buttons themselves grow the moment one is pressed, which is both
the honest preview and the reassurance that the control that undoes a choice grows along with
everything else - and it is applied again at every launch, before the first frame, by
`installUiSize()` in `main.ts`.

**How the scale is actually applied.** In the desktop shell, through the preload's `setUiZoom`,
which calls Chromium's own `webFrame.setZoomFactor` - the identical mechanism behind Ctrl+plus in
a browser. That route scales the map canvas's device pixel ratio along with the chrome, so the
three.js viewer re-renders crisp rather than being stretched. In a browser tab, where there is no
preload, the standard CSS `zoom` property on the document root is the fallback; the map is
upscaled rather than re-rendered there, the same trade every plain web page makes under browser
zoom. The bridge is feature-detected per call, so a released shell older than this renderer gets
the CSS fallback rather than a thrown error.

**Why this exists beside the appearance editor.** The appearance editor can already resize any
text the app renders, per element or globally, and that is the right tool for taste. It is the
wrong tool for "I cannot read this": it reaches only the elements wrapped in an appearance
target, it leaves icons, paddings and click targets at their designed size, and it asks somebody
who is struggling to see the interface to operate that same interface's most detailed editor
first. The dial scales everything at once - text, icons, buttons, the click targets themselves,
and the map.

### The theme, reachable without a map

| Setting | Values | Default | Stored under |
|---|---|---|---|
| Theme | follow the system, `dark`, `light`, `contrast` | follow the system | `bluemap-theme` |

The viewer has always offered this choice in its own settings menu, and that menu only exists
while a map is open - so the person who had not rendered anything yet, exactly the person setting
the app up to their eyes, had no theme control at all. The settings row is the same choice
against the same stored record: it writes the viewer's own `bluemap-theme` localStorage entry in
the viewer's own JSON encoding, so the two controls can never disagree about what was chosen.

Three rules keep the two writers convergent (`themeSetting.ts`'s module watcher):

- While a viewer app is live, its `appState.theme` is authoritative; the settings row routes
  through `app.setTheme()`.
- A new viewer app gets the stored choice pushed into it. The viewer only loads its persisted
  settings when the map's `settings.json` opts into `useCookies`, and the fallback when a map
  ships no such file is `false` - so without the push, opening a local map could snap the whole
  window back to the system scheme.
- A change made inside the in-map menu is mirrored back out to the stored record, so it survives
  the viewer being torn down on a profile switch.

`useBlueMapTheme` - the bridge that maps the choice onto the Vuetify MD3 theme - reads the live
app first and the stored choice when there is no app, so a theme chosen before the first map is
ever rendered reaches the chrome it was chosen for.

### Search, palette, Home

The section is declared in `SETTINGS_SECTIONS`, so it arrives everywhere that list already
reaches with no further wiring: the settings surface's own search indexes the five stop labels,
the four theme names and the live values (the current percentage, the current theme), the command
palette lists the section with the same title and description the tab renders, and Home carries a
card for it in **Settings and tools** - directly after Settings itself, because it is the tile
for the person least equipped to go looking.

## Verification

`uiSizeSetting.test.ts` proves the stops, the persistence round-trip (including a corrupted
stored value falling back to the default rather than throwing), the bridge-first application and
the CSS fallback, and that the designed size removes the CSS zoom entirely rather than writing
`zoom: 1`. `themeSetting.test.ts` proves the stored record is byte-compatible with the viewer's
own, the push into a fresh app, the leave-alone when the app already agrees, and the mirror back
out. `UiSizeRow.test.ts` and `ThemeRow.test.ts` prove the buttons genuinely resize the document
and rewrite the shared record rather than merely looking pressed, and that the size row's own
toggle wraps instead of clipping - the control built to fix sizing failures must not ship one.
`AppSettings.test.ts` proves the section has its own tab, mounts the real controls, resizes the
interface from a mounted surface, and is found by the surface's search under a stop label and a
theme name.

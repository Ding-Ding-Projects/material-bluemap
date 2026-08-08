# The design system: Material Design 3 tokens, and what spends them

Every visual decision in this application resolves to one of the tokens below. Nothing in a
component hard-codes a corner radius, a shadow, a type size, a state-layer opacity or an
animation curve; a component that needs one names the token, and the token is declared once.

The code is `design/packages/ui/src/styles/md3.scss` for the vocabulary,
`design/packages/ui/src/styles/global.scss` for the rules that spend it, and
`design/packages/ui/src/vuetify.ts` for the colour schemes and the component defaults.
`design/packages/ui/src/vuetify.test.ts` holds all three to their claims.

## Why this exists

The application is built from Vuetify components, so for a long time "how it looks" was
whatever Vuetify's own defaults said. That produced two silent problems.

The first was colour. Each theme named five colours - primary, secondary, surface,
background, error - and every other Material role a component asked for was answered from
Vuetify's grey reference palette. So `outline`, `surface-variant` and the whole container
ladder were not this product's palette at all, and the marker layer, which needs real M3
roles, derived its own approximations with `color-mix` arithmetic.

The second was everything that is not colour. **Vuetify's `rounded` scale is Material 2
arithmetic wearing Material 3 names**: its `lg` is 8px where M3's is 16px, its `xl` is 24px
where M3's is 28px, and it has no `md` step at all. Its state-layer opacities are M2's
0.04/0.12/0.12/0.08 rather than M3's 0.08/0.1/0.1/0.16, and its elevation is M2's
umbra/penumbra/ambient triple rather than M3's key-plus-ambient pair. The md3 blueprint
already set cards to `rounded="lg"` - so the cards were *asking* for the large corner and
getting 8px. Setting component defaults alone would have changed nothing visible.

That is why `global.scss` re-points the utility classes themselves at the tokens. `.rounded-lg`
now resolves to the real 16px, `.rounded-xl` to 28px, `.rounded-md` exists at all, and
`.elevation-0` through `.elevation-5` draw M3's ladder. One edit, every screen.

## The tokens

### Colour

The full M3 role set, per theme, in `vuetify.ts`: primary, secondary and tertiary each with
their container and `on-` pairs; the error ramp; background and surface; the five-step
surface container ladder (`lowest`, `low`, default, `high`, `highest`) plus `dim`, `bright`
and `light`; `surface-variant`; `outline` and `outline-variant`; the inverse roles; `tint`,
`scrim` and `shadow`.

Dark and light are generated from the tonal palettes of the blue seed the app has always
used - `#00639B` is that family's tone 40 and `#8FCDFF` its tone 80, and both are pinned by
test so the scheme cannot be quietly regenerated from a different seed. Light schemes take
primary/secondary/tertiary at tone 40 on containers at 90, dark at tone 80 on containers at
30, per the spec.

The contrast theme is deliberately **not** tonal. It answers the same role names with the
highest-contrast values that keep their meaning: black at every surface tier, white text and
outlines, white primary, yellow secondary. Deriving it from a seed would defeat the one thing
it exists for.

`styles/markers.scss` maps these onto `--md-sys-color-*` for the viewer's raw-DOM marker
layer, which sits outside the Vue tree and so is reached by no component stylesheet.

### Shape

| Token | Value | Spent on |
|---|---|---|
| `--md-sys-shape-corner-none` | 0px | Window caption buttons |
| `--md-sys-shape-corner-xs` | 4px | `.rounded` |
| `--md-sys-shape-corner-sm` | 8px | `.rounded-sm` |
| `--md-sys-shape-corner-md` | 12px | Text fields and everything built from one |
| `--md-sys-shape-corner-lg` | 16px | Cards, sheets, alerts, banners, lists, snackbars |
| `--md-sys-shape-corner-xl` | 28px | Dialogs and menus, through the surfaces they contain |
| `--md-sys-shape-corner-full` | 9999px | Buttons, chips, button groups |

### Type

Fifteen ramps - display, headline, title, body and label, each large/medium/small - and each
with four axes: `-size`, `-line-height`, `-weight`, `-tracking`. Every value is in `rem` and
**no rule anywhere sets a root font size**, because interface scale belongs to the
interface-size dial (see [Display and ease of use](./display-and-ease-of-use.md)), which
works through page zoom. Headings map onto the scale at zero specificity with `:where()`, so
a component that has its own opinion still wins, and so does the appearance editor.

Prose is capped at a 68ch measure. The wizard was running roughly 150 characters to a line on
a wide window, which is about double what is readable. The cap applies to `<p>` only and is
released explicitly inside tables, `pre`, `code`, `kbd` and `samp`, where a paragraph is a
cell or a path rather than prose.

### Elevation, state and motion

Elevation is `--md-sys-elevation-shadow-level0` through `level5`, M3's key-plus-ambient
shadow pair. It is deliberately **not** named `--md-sys-elevation-levelN`: `markers.scss`
owns that name for a `drop-shadow()` filter chain and is imported later, so a `box-shadow`
under that name would be silently clobbered into an invalid declaration and every elevated
surface would go flat. A test pins the absence.

State layers are `--md-sys-state-hover-opacity` 8%, `-focus-` 10%, `-pressed-` 10%,
`-dragged-` 16%, and `global.scss` re-points Vuetify's own `--v-*-opacity` variables at them
so every state overlay in the framework retunes from one place.

Motion is the MD3 Expressive set: seven easings - `emphasized` and its decelerate/accelerate
variants, `standard` and its two, and `linear` - and a twelve-step duration ladder,
`short1..4` at 50/100/150/200ms, `medium1..4` at 250/300/350/400ms, `long1..4` at
450/500/550/600ms.

**Reduced motion is absolute.** The kill switch at the bottom of `global.scss` is last in the
file and uses `!important`, so it outranks any normal declaration regardless of which token
fed it. A surface that animates through a Vue `<Transition>` rather than a CSS rule has to
degrade itself as well, and is tested for it.

## Component defaults

`COMPONENT_DEFAULTS` in `vuetify.ts` spends the corrected scale once, for the whole
application, rather than in forty component files that would each then own an opinion about
what a rounded card is: things a person presses are fully rounded, containers take the large
corner, overlays take the extra-large one through the surfaces they contain, and fields sit
one step tighter than their container.

Two details worth knowing before editing it. `VDialog` and `VMenu` take no `rounded` prop, so
their corner is set on what they contain through nested defaults - the same mechanism the
blueprint uses for `VBtnGroup: { VBtn }`, and provide/inject follows the component tree
through the overlay's teleport. And `VSelect`, `VAutocomplete`, `VCombobox` and `VFileInput`
all render a `VTextField` internally and pass `undefined` where nothing was set, which
Vuetify treats as "not provided" - so the single `VTextField` entry reaches all of them.

## What overrides what

From weakest to strongest:

1. The type and heading rules in `global.scss`, written with `:where()`, at zero specificity.
2. Vuetify's component styles and this application's own component stylesheets.
3. `COMPONENT_DEFAULTS`, which a prop on the component overrides directly - that is how the
   window's caption buttons stay square against a pill default.
4. The appearance editor, which lands its per-element overrides as inline styles.
5. The reduced-motion kill switch, for motion only.

The ordering is the point: **the appearance editor must always win**, because a theming
feature that cannot theme its own application is incomplete. No rule added by the token layer
is `!important` except the two Vuetify radius and elevation utilities that already were, and
neither of those ever appears on an appearance-target wrapper.

## Verification

`vuetify.test.ts` asserts every M3 role is present as a real hex colour in all three themes;
that every `on-X`/`X` reading pair reaches WCAG AA 4.5:1 by real contrast arithmetic, with the
contrast theme at 21:1; that the token sheet publishes the whole shape scale, all fifteen type
ramps with all four axes, elevation 0-5, all four state opacities and the complete motion set;
that every type value is in `rem` and no root font size is set; that the two sheets agree
value-for-value on every token both declare; that `global.scss` re-points the utilities rather
than hard-coding a second scale; that no `!important` was added outside the two that already
had one; that the reduced-motion kill switch is still last and still absolute; and that the
map layer's stacking and pointer-events contract is untouched.

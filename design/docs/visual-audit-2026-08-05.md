# Visual audit, 2026-08-05

A pixel-level look at the current `docs/screenshots/` set: does the UI in each image
actually look right to a user? This is not a re-run of the capture harness and not a
code read — it is eyes on the PNGs the capture lane produced this session, cross-checked
against `docs/screenshots/captions.md` and `docs/screenshots/manifest.json` (both stamped
to commit `c533c8c8d49655194057882a5896e583c35ffd8e`, local run).

**Scope reviewed:** all 66 captures listed in `manifest.json` (the current, documented
set) plus a check of the older, undocumented files left in the directory from prior
sessions (`guide-*`, `render-*`, `map-hosted-on-github-pages.png`,
`pages-published-by-the-app.png`, `installed-app-1920x1200.png`,
`shell-titlebar-1920x1080.png`, `titlebar-zoom-1920.png`). 82 PNG files exist on disk;
66 are the current documented set, 16 are orphaned leftovers from the 2026-08-03/04
sessions that `captions.md`/`manifest.json` no longer reference.

At review time the capture lane's latest sweep was uncommitted on disk (`git status`
showed the screenshots as modified, not new commits yet) — this audit reviewed the disk
state directly, which is the freshest available render of the current UI.

## Priority 1 — real, current defect: the bottom-left utility stack overlaps page content

**Confidence: high. Reproduced identically in 9 separate screenshots.** This is the
single most significant finding in this pass.

The fixed circular button stack at the bottom-left of the window (Settings gear, a
"new/duplicate config" file icon, and a render/wand icon — a Material "speed dial"
style FAB cluster) does not reserve any clearance from the scrollable content behind
it. Whenever a heading or paragraph happens to scroll to the same vertical band as
the stack, the opaque white circles paint directly over the leading characters of the
text, and in narrower/denser layouts they sit on top of radio buttons.

Concrete instances, exact pixels:

| Image | What is obscured |
|---|---|
| `config-tab-run.png` | "Rendering" section heading renders as **"ndering"**; the flag row renders as **"r, --render"** instead of "-r, --render" (both cropped and confirmed at pixel level) |
| `settings-drawer.png` | The gear icon sits over the "C" of "Choose the world or folder to back up before this can start.", reading **"hoose the world..."** |
| `shell-800x600-narrow.png` | "This render will run on this computer..." renders as **"his render will run..."** |
| `shell-1024x768.png` | "For a password and has nowhere to keep one." renders as **"or a password..."** (missing "f") |
| `shell-scale-2x.png` | Severe: the gear icon sits almost exactly on top of the **"On this computer" radio button**, and "Run this render" renders as **"un this render"** (the "R" is hidden behind the gear icon) |
| `shell-scale-1_25x.png` | "This render will run on this computer..." renders as **"his render will run..."** again |
| `shell-scale-1_5x.png` | The gear icon sits on the **"In a container on this computer" radio button**, and the wand icon sits on the **"On another machine, over SSH" radio button** |
| `ci-render-screen.png` | "Pick an account above, or type any owner you have write access to." renders as **"ck an account above..."** (missing "Pi") |

At `shell-scale-2x.png` and `shell-scale-1_5x.png` this is not just a text-legibility
problem — the FAB visually sits on top of actual radio-button controls a user needs to
click. Whether the FAB's hit-testing area also intercepts those clicks I cannot verify
from a screenshot alone, but the visual overlap alone is a real, user-visible defect at
today's build.

The bug is layout-dependent, not universal: at wide viewports where a wizard card is
horizontally centered with generous left margin (`shell-1280x800.png`,
`shell-1920x1080.png`, `shell-scale-1x.png`), the stack sits in empty margin and nothing
is obscured. It reproduces reliably on any full-bleed, left-aligned layout (the options
editor, the Settings drawer's "GitHub runners" tab, the CI-render screen) and on any
narrower or higher-scale window regardless of which screen is showing.

**Owner: UI-bugs lane** (this is a genuine layout/z-index defect, not a capture
artifact — the same crop position across 9 independently-scrolled screenshots produces
the same missing-character pattern, which rules out a one-off capture glitch).

## Priority 2 — real, current defect: Cantonese funny-level caption overlaps its own tick label

**Confidence: high. Reproduced in 2 screenshots.**

On the "Funny level, Cantonese" slider, the current-level descriptor text (中間落墨,
Cantonese for "balanced") renders stacked directly on top of the "1" tick-mark label
instead of below it. The equivalent English slider positions its descriptor ("Balanced")
cleanly on its own line below the "1", with no overlap — direct pixel comparison
confirms the Cantonese-only regression:

- `firstrun-1-welcome.png` — first-run wizard, Welcome step
- `settings-section-language-and-tone.png` — Settings drawer, Language and tone section

Both instances are today's capture (Aug 5), both show the identical overlap, both are
the same slider component used in two different places, so this is a component-level
bug, not a one-off.

**Owner: UI-bugs lane** (localization-triggered overlap in a shared slider component;
clipping audit could also plausibly own it since the symptom looks like clipping, but
it is genuinely two text nodes overlapping, not a container cutting text).

## Priority 3 — worth verifying, not certain: settings search may not actually filter

**Confidence: medium.** I can describe exactly what the pixels show; I cannot rule out
an innocent explanation (see below), so this is flagged as "verify" rather than "fix."

Three different search surfaces exist in this app. One behaves as documented; two show
a pattern that contradicts their own caption text:

- `config-search.png` (options editor's "Search every setting"): typing "port" produces
  "6 of 154 settings match, across 4 screens" and the panel shows **only** those 6
  matching settings, correctly filtered. This one works as documented.
- `settings-search.png` (Settings drawer): typing "java" produces "1 of the 10 settings
  match," and the panel shows the "Java runtime" card (a real match) **followed by the
  entire, unfiltered "Mojang download consent" section** — full heading, full body text,
  full warning card, none of which contains "java." If this were truly filtered to 1
  match, the Mojang section should not be visible at all.
- `menu-search.png` (viewer's in-map Settings menu): typing "re" produces "9 of 60" and
  the panel shows the complete, unfiltered settings list (Perspective, Flat, Free-Flight,
  every resolution option, every render-distance slider) — visually indistinguishable
  from the unfiltered `menu-settings.png` capture aside from the added search box and
  counter.

The innocent explanation: the Settings drawer and viewer-menu search may intentionally
work as "jump to first match, but leave already-opened sections/panels visible" (the
Settings drawer does show tab chips for sections a user has previously opened, e.g.
"Mojang download consent ×"), rather than a destructive filter. If so, the caption text
in `captions.md` ("filtering the drawer down to the settings that match") overstates
what the feature does, which would make this a documentation-accuracy issue rather than
a functional bug. I cannot distinguish these two possibilities from static screenshots
alone.

**Owner: UI-bugs lane**, to check the real behavior directly (type into a fresh,
no-prior-tabs search and see whether non-matching content actually disappears). If it
does not filter, either fix the filtering or correct the caption's claim.

## Everything else: clean

The remainder of the 66 documented captures look correct and match their filenames and
captions:

- **Appearance editor tab strip** (`config-tab-core.png` through `config-tab-history.png`,
  `config-screen.png`, `config-search.png`, `config-regex-builder.png`,
  `config-delete-gate.png`, `config-history.png`): the tab strip has proper height, all
  8 tabs (Core/Maps/Storages/Web app/Web server/Server plugin/Run/History) render with
  visible labels and close buttons, no painting into the section below — this looks like
  the reported zero-height bug is genuinely fixed. The "Speed" dial (1·GENTLE through
  5·FASTEST with the "BLUEMAP'S DEFAULT" badge) is fully legible with no clipping.
- **EULA dialog** (`eula-viewer.png`): provenance banner, "why the live document is not
  on screen" explanation, searchable section tabs all render cleanly. No overlap, no
  transparency issue.
- **Docked panels** (`settings-section-*.png`, `settings-drawer.png`): each has a working
  scrollbar with a partial-position thumb (confirmed by direct crop on
  `settings-section-github-account.png` — up/down arrows and a mid-track thumb are
  present, not the reported "scroll cut off with no scrollbar" bug). The "SIGN IN WITH
  THIS TOKEN" button and eye icon at the bottom of that panel are fully rendered, not
  truncated.
- **Notification centre / toolbar** (`notifications-history.png`, `notifications-toast.png`,
  `notifications-corner.png`): filter chips (Errors/Warnings/Successes/Information with
  live counts), bulk-select actions, and the notification list all render correctly, no
  overlap with the toast itself.
- **Accounts list** (`settings-section-github-account.png`): signed-out GitHub account
  section, browser sign-in button, token fallback field, and scope list all render
  cleanly.
- **Destructive-action gates** (`super-confirm-untouched.png`, `-one-key.png`, `-armed.png`,
  `config-delete-gate.png`): correct progressive state — untouched (grey slider, disabled),
  one key (slider still disabled), both keys (slider armed red, positioned at the start
  ready to drag) — matches the documented behavior exactly.
- **Wizard steps 1–5 and release downloads**: step indicator (checkmarks on completed
  steps, highlighted current step) is consistent across all 5 screenshots, no dropped
  steps, no layout shift.
- **First-run dialog** (`firstrun-1-welcome-window.png`, `-2-consent.png`, `-3-storage.png`):
  correctly modal with dimmed backdrop, step tabs (Welcome/The Licence/Minecraft
  Files/Map Storage) all legible, Accept/Decline buttons present with full explanatory
  text.
- **Shell chrome at all viewports and scales** (`shell-1280x800.png` through
  `shell-scale-2x.png`, `theme-light.png`, `theme-dark.png`, `chrome-*.png`): the
  frameless Material title bar, window control buttons, and viewer control bar all
  render correctly at every tested size (800×600 through 1920×1080) and every scale
  (1x–2x) — aside from the FAB-overlap defect logged above, nothing here is clipped or
  misaligned.
- **Projects / CI-render / Pages-publishing screens**: honest empty states
  ("None of the 0 worlds this computer knows about carries a project yet"), the real
  `ENOENT` error surfaced from the filesystem rather than swallowed, and (for CI-render
  and Pages-publishing) the real "nobody is signed in to GitHub" guidance banners.

One cosmetic item I looked at but am **not** flagging as a defect: the notification-bell
badge in `menu-root.png`/`menu-maps.png`/`menu-settings.png`/`menu-info.png`/
`menu-markers.png` shows a small muted/off glyph instead of a number, where the config
screens show real numeric counts (1, 4, 8, 9). This could be an intentional "muted in
this context" indicator; I don't have enough evidence either way to call it a bug.

## Stale/orphaned images (not part of the current documented set)

`guide-0-where-maps-are-stored.png`, `guide-1-world-validated.png`,
`guide-2-where-it-goes.png`, `guide-3-review-and-start.png`,
`guide-4-map-server-list.png`, `render-1-wizard-world.png` through `render-6-map.png`,
`map-hosted-on-github-pages.png`, `pages-published-by-the-app.png`,
`installed-app-1920x1200.png`, `shell-titlebar-1920x1080.png`, and
`titlebar-zoom-1920.png` are all still sitting in `docs/screenshots/` but are not
referenced by the current `captions.md` or `manifest.json` (both regenerated today from
commit `c533c8c8`). They predate this session's UI fixes (mtimes 2026-08-03/04) and were
not reviewed for defects, since anything found in them would already be superseded by
the current documented set. Flagging for the **capture-re-shoot lane** to confirm they
can be deleted as superseded, rather than left as dead weight in the directory.

## Summary

- **82 PNG files present; 66 reviewed in full as the current documented set; 16 noted
  as stale/orphaned and not reviewed for defects.**
- **1 high-confidence, high-impact defect**: the bottom-left utility/speed-dial button
  stack overlaps page content and, at some scales, interactive radio buttons — confirmed
  in 9 screenshots across 6 different surfaces. Owner: UI-bugs lane.
- **1 high-confidence, medium-impact defect**: the Cantonese funny-level slider caption
  overlaps its own "1" tick label — confirmed in 2 screenshots across 2 surfaces (same
  shared component). Owner: UI-bugs lane.
- **1 medium-confidence item worth verifying**: the Settings-drawer and viewer-menu
  search may not filter their lists despite claiming to, while the options editor's
  search demonstrably does filter correctly. Owner: UI-bugs lane, to check live behavior.
- Everything else reviewed — the appearance editor tab strip, the EULA dialog, docked
  panels and their scrollbars, the notification centre, the accounts list, the
  destructive-action gates, the wizard, first-run, and all shell/theme/scale
  combinations — looks clean and matches its filename and caption.

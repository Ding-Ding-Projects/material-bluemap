# Super confirmation for destructive actions

Two independently operated keys, and then a slider that has to travel its whole range, before
anything irreversible happens. The gate lives in the application's own interface, names the exact
thing it is about to destroy, and always offers a way out.

The code is `design/packages/ui/src/components/confirm/` for the rule, with two presentations of
it: `components/config/ConfigSuperConfirm.vue` (anchored beside the control it guards) and
`components/menu/MenuSuperConfirm.vue` (modal, for a narrow sheet with nowhere to anchor a second
surface).

## Behaviour

### One state machine, two cards

The contract is a list of things that must be true at the moment a destructive action fires, and
those are properties of a small state machine rather than of a card layout. So the rule lives in
`createSuperConfirmGate` once and the two components are two skins over it. Two presentations of
one rule is the shape that goes wrong: when the rule lives in each component, the first fix lands
in one of them, the other keeps the bug, and there is nothing to look at that says which is right.

What the factory is responsible for, each of which is a test next door:

- **Untouched, the gate is locked** and the slider cannot move at all.
- **One key alone does not arm it.** Neither does the same key twice, because they are two
  separate booleans rather than a counter.
- **A slider let go before the end springs back to the start**, so a slip cannot destroy anything
  and a half-finished drag cannot be resumed by a second, smaller one.
- **Turning a key back off mid-travel disarms and resets**, rather than leaving a gate that is
  visually locked and internally most of the way to firing. That happens in the setter rather than
  in a watcher: a watcher runs on the next flush, and in that window there is a gate that reads as
  locked and is one nudge from completing.
- **Authorisation happens exactly once.** A slider that keeps reporting values after it hits the
  end must not fire a second delete, and Vuetify emits on both drag and keyboard, so that is
  reachable.

`travel` is read-only from outside and everything that moves it goes through `travelTo`, which is
where the arming is checked, so there is no second route by which a slider could arrive at the end
without passing the two keys.

The four phases are `locked`, `armed`, `moving` and `authorized`, deliberately four states rather
than a pair of booleans: "armed but not moving" and "armed and moving" need different copy, one
saying what to do next and the other reporting progress, and a component asking
`armed && travel > 0` in three places is a component where the three answers eventually disagree.

### After it fires

The completed gate holds for `GATE_COMPLETION_HOLD_MS` and then closes itself. The contract asks
for a distinct completion animation *and* for focus to return to the control that opened the gate,
and those pull in opposite directions: a surface that closes the instant the slider lands shows no
completion at all, and one that waits for a click leaves a keyboard user stranded in a card whose
only remaining control is an exit that no longer exits anything.

`returnFocusTo` puts focus back on the originating control whether the gate completed or was
escaped. It is the part that is easy to leave out because nothing looks wrong without it: a
sighted mouse user never notices, while somebody driving the keyboard finds that cancelling drops
focus onto the document body and the next Tab starts again from the top of the page, several
screens away from the button they were standing on.

### The inventory, which is how a new delete cannot slip past

"Every destructive action is behind the gate" is a claim about the next delete button as much as
about the ones that exist, so it is enforced as an inventory rather than by remembering.
`superConfirmPolicy.test.ts` walks every source file in the package looking for destructive call
sites: anything shaped `deleteSomething(`, `removeSomething(`, `purgeSomething(` and so on, caught
by naming convention rather than by a list of known primitives, plus the handful whose names do
not follow the convention (signing out, resetting every setting, forgetting a stored directory,
running a bulk close, stopping work in flight, emptying web storage).

Every file that contains one is declared with how many it holds, what it destroys in the words a
user would recognise, and where it stands. The standings are a closed set, so the justification is
checkable rather than a sentence somebody wrote to make a test pass:

| Standing | Means |
|---|---|
| `gated` | The gate stands in front of it. The declaration names the file holding that gate, which is not always the file making the call. |
| `type-only` | A declaration of a host method rather than a call to one. |
| `buffer` | Mutates the unsaved in-memory workspace. Nothing has left the disk and the apply dialog names every file that would actually be deleted, before anything is. |
| `reversible` | The user can put the state straight back through the same control. |
| `resumable` | Survivable rather than destructive: what was already produced is kept and the work resumes from it. |
| `unwired` | Model code with no user-facing caller yet. The gate is owed by whoever wires it. |
| `gap` | Shipped, reachable, and not behind the gate. A defect, named as one. |

Inventing a sixth excuse means editing the union type, which shows up in the diff. The counts are
declared per file too, so a second delete cannot hide beside an already-declared one. Gaps are
listed a second time in a short list a reviewer reads in full: a gap nobody wrote there fails, and
a gap that was fixed and left there fails too.

### What is gated today

| Destructive action | Gate |
|---|---|
| Removing a saved map or server profile | `components/ProfileManager.vue` |
| Deleting a user-saved appearance preset | `components/appearance/AppearanceEditor.vue` |
| Deleting a map config | `components/config/MapsScreen.vue` |
| Deleting a storage config | `components/config/StoragesScreen.vue` |
| A save whose plan takes config files off the disk | `components/config/ConfigApplyDialog.vue` |
| Clearing every saved viewer setting | `components/menu/SettingsMenu.vue` |
| Closing many tabs at once | `components/tabs/TabClosePanel.vue` |

### The gaps, stated rather than hidden

Signing out of GitHub revokes the stored token and, when GitHub honours the revocation, the grant
on the account. It is confirmed inline in two steps with focus return, and it is **not** behind the
two-key gate. Both the row and the primitive behind it are declared as `gap` and are tracked under
the project's issue for this contract. This document says so because an inventory whose defects are
invisible is an inventory that has stopped being useful.

## Configuration

| Constant | Value | Why |
|---|---|---|
| `GATE_TRAVEL_START` | 0 | Where the slider starts and what it springs back to |
| `GATE_TRAVEL_END` | 100 | A gate that fires at 90% is a gate whose last tenth is decoration |
| `GATE_COMPLETION_HOLD_MS` | 900 | Long enough to show completion, short enough not to strand a keyboard user |

None of these is user-configurable. The facts the gate shows are not configurable copy either: the
exact action, the exact affected data, and what is irreversible about it are the reason the gate
exists. Tone follows the language mode and both funny levels like everything else, and the
[voice-not-facts rule](./language-and-tone.md) is what keeps the naming intact at every level.

Each gate is required, in source, to still contain every part the contract lists: a first key, a
second independent key, a full-range slider, that slider disabled until both keys are turned, a
progress animation while it travels, a distinct completion animation, an Emergency exit, an Escape
path, focus returned on close, a live status region, an accessible name on the surface, on the
slider and a spoken position for it, a reduced-motion block, and a 40 pixel Emergency exit target.
Each of those is a thing that can be deleted without breaking anything that *looks* broken, which
is why they are asserted by name.

## Failure modes

- **A partial slider, or one key.** Nothing fires. The slider is disabled while unarmed and
  `travelTo` refuses regardless, so the disabled attribute is the visible guard rather than the
  real one.
- **A key turned back off mid-travel.** The travel resets synchronously, in the same statement, so
  no caller can observe a locked gate that is nearly complete.
- **A slider that keeps reporting after the end.** The second report is refused; the action runs
  once.
- **A reopened gate.** `reset()` is called on open, so a gate is never found part-way through.
- **Escape, or the emergency exit.** Nothing is changed and focus goes back to the control the
  user started from.
- **An authorised gate whose keys are then flipped.** It is left alone: the full bar is the
  completion state, and flipping a switch afterwards should not rewind the record of something
  that has already happened.
- **A destructive call site nobody declared.** The policy test fails with the file, the count and
  an explanation of what to do about it.

## Security considerations

The gate is a defence against a mistaken click, not against an attacker who already controls the
process. It is a usability safety control and is not an authorisation boundary; nothing about it
should be read as access control.

Two independent controls plus a full-range slider exist so that no single accidental input can
complete it, which is exactly the failure a single confirm button has. The keys, the slider, the
progress state, the completion state and the emergency exit all have accessible names and visible
focus, so the gate is not weaker for a keyboard or screen-reader user.

The gate never performs part of the destructive action in order to preview it. A preview describes
what would happen; it does not do any of it. The one place a preview is large, the bulk close, is
a plan computed without touching a tab, and the same plan object is what runs.

It lives in the application's own framework and renderer. No external CAPTCHA, hosted helper page,
separate confirmation application or new window is involved, because a confirmation the user has
to leave the application to complete is a confirmation that teaches them to trust a second window.

## Accessibility

Both cards are operable by keyboard alone: the keys are switches, the slider takes arrow keys, and
the Emergency exit and Escape both cancel. The surface carries an accessible name, the slider
carries its own name and a spoken position through `aria-valuetext`, and a live status region
reports the phase. Motion is decorative: a reduced-motion preference disables the animation
without disabling the control it was decorating. The Emergency exit has a 40 pixel minimum target.
Focus returns to the originating control on every exit path.

## Verification

| Test | What it holds |
|---|---|
| `superConfirmGate.test.ts` | The state machine: untouched, one key, both keys, a partial slider, a key turned back off, reset, the values a screen reader is given, the completion hold, and focus returning to where it came from. |
| `superConfirm.test.ts` | Both cards, mounted, through every state: untouched, one key only, both keys, a partial slider, a full slider, cancelling, Escape, reduced motion, keyboard only, and what assistive technology is told. Then the real operations: that the facts shown are the caller's rather than the gate's, that removing a saved map or server actually removes it and only then, that deleting a map config does, and that a save which takes files off the disk is gated. |
| `superConfirmPolicy.test.ts` | The inventory: no undeclared destructive call site, per-file counts that cannot drift, every declaration naming what it destroys, every gated entry pointing at a file that really holds a gate, every ungated entry justifying its standing at length, the known-gap list exactly as long as the gaps themselves, exactly two gate components, both running the shared state machine, and every contract part still present in each card. |

Run them with `npx vitest run packages/ui/src/components/confirm` from `design/`.

## Suggested reading

- [Tabbed navigation](./tabbed-navigation.md), whose bulk closes are the largest thing behind this
  gate.
- [Language modes and funny levels](./language-and-tone.md), for why a level 5 gate still names
  the file.
- [Notification centre](./notification-centre.md), for the opposite rule: what must never block.

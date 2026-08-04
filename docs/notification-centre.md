# The notification centre

A toast is a message that leaves. That is the point of it, and it is also the problem with it:
the one notice worth reading twice is reliably the one that scrolled past while somebody was
looking at the map. The centre is where it goes.

The code is `design/packages/ui/src/components/notifications/`. The queue, its levels, its
timings and its bounded history stay in `components/config/notifications.ts`; nothing in the
centre owns state.

## Behaviour

### The bell, and the panel behind it

`NotificationCentre` is the whole feature: a bell with a count, and the reviewable history
behind it. It is mounted inside the notification corner, which is where the bell already appeared
and where somebody looks when a toast has gone, so a shell that mounts that one corner gets this
without a second mount.

- **The badge is the unread count while there is one**, meaning notices raised since the panel
  was last opened. With nothing unread it falls back to the size of the history, so the control
  still says what it holds rather than reading as an empty button.
- **Opening it is what marks the history read.** Not a timer and not a hover: the badge means
  "raised since you last looked", and only looking can clear it.
- **It opens upward and inward from the corner**, so it never covers the button that opened it,
  and it closes on Escape and on a click outside, both of which return focus to the bell.
- **It is a panel, not a dialog.** Nothing in it is a decision, so nothing in it blocks; the map
  keeps working underneath. The only surfaces in this application that block are the ones that
  genuinely cannot continue without an answer, and a list of things that already happened is not
  one of them.

### What a notice keeps

Every notice raised this session, with its level, title, body, detail, timestamp and the actions
it offered. **Restoring one puts that same notice back in the corner with its actions attached**,
so a retry dismissed by a stray click is one press away rather than gone. A notice that is
already showing says so rather than offering a button that would do nothing.

### Finding one again

- **Filter chips, one per level**, in severity order: error, warning, success, information.
  Somebody opening the centre after something went wrong is looking for the failure, and a row
  that leads with information makes them read past three chips to reach it. Each chip carries its
  count, and **every level is present even at zero**, because a control that vanishes when its
  count reaches zero is a control the user cannot find again when it stops being zero. Nothing
  selected means every level, because a filter row with nothing pressed is a user who has not
  filtered rather than one who asked to see nothing.
- **A search bar**, which is the settings editor's own `ConfigSearchField` with the regex builder
  anchored beside it. Reusing it is not only less code: it is the only way a pattern built here
  is guaranteed to behave the way one built in the options search behaves, because it is the same
  field over the same engine.
- **The two compose** rather than one overriding the other, and the count line above the list
  says how many of how many are showing.

A search is tested against the level name, the timestamp, the title, the body, the detail and
every action label, joined into one line per notice. The level name is in because "error" is what
somebody types before they notice the chips; the timestamp is in because `2026-08-04` is how a
session gets narrowed to an afternoon without a date picker in the way; the detail is in because
a stack trace is often the only place a file name appears. That same one-line-per-notice text is
what the regex builder previews against, so what the builder highlights is literally what the
filter tests.

### Copying it out

The copy action writes the filtered view as Markdown, carrying each notice's level and timestamp,
so a pasted extract still says what happened and when. It exports what the panel is showing,
filter and search included: an export that quietly widened to everything would be an export
nobody can use to report what they were looking at.

## Configuration

| Setting | Value | Where |
|---|---|---|
| Information dismisses itself after | 5 seconds | `INFO_TIMEOUT_MS` |
| Success dismisses itself after | 4 seconds | `SUCCESS_TIMEOUT_MS` |
| Warning and error | Never dismiss themselves | A failure that auto-dismisses is a failure nobody read |
| History kept | The most recent 50 notices of the session | `HISTORY_LIMIT` |

None of these is user-configurable, and the history is per session rather than persisted: it is a
record of what this run of the application reported, not a log.

## Failure modes

- **A message is raised while nothing is mounted.** It is still recorded in the history, which is
  the difference between a queue and a component.
- **An invalid pattern matches nothing** rather than falling back to everything, so a search
  nobody can see is never left showing results.
- **A history longer than the panel** scrolls inside the panel rather than off the screen. The
  bound is asserted from the stylesheet, because jsdom computes no layout.
- **Nothing has happened yet.** The panel says so, and that state is deliberately distinct from
  "your filter matched nothing" so a user can tell which of the two they are looking at.
- **A restore of a notice that is already on screen** is refused with a sentence rather than
  offered as a button that does nothing.

## Security considerations

Nothing here reaches the network, and nothing is persisted. The search runs on the local `RegExp`
engine under the bounds `components/config/regexEngine.ts` states (512-character pattern,
20000-character sample, 500 matches, 100 ms per preview run); no pattern, sample or export is
transmitted or written to storage.

A notice carries text the application composed. Where a message quotes a subsystem, the quoting
happens where that subsystem's errors are already turned into sentences, so nothing arrives at the
corner as a raw stack. The centre renders that text as text; it never interprets it as markup.

The copy action is a deliberate export of session diagnostics. It carries exactly what the panel
is showing, so the user can see what they are about to paste before they paste it, which matters
because a detail line can contain a local path.

## Accessibility

The panel is a named region rather than an unlabelled card. The level filters are a named group
of real buttons, each announcing whether it is pressed. Every control in the panel is a button
and is therefore keyboard reachable, the icon-only close control is labelled, and closing emits an
event so the surface that opened it returns focus to the bell. In the corner itself, arrivals are
announced politely rather than interrupting, a failure is an alert rather than a status, the
dismiss control has a 40 pixel target, the stack is a flow column so two notices cannot overlap,
pointer events pass through everywhere except the toasts themselves, and both surfaces respect a
reduced-motion preference.

## Verification

| Test | What it holds |
|---|---|
| `noticeCentre.test.ts` | What a search reads, that one notice stays one line, that an empty level selection means everything, that the filters compose rather than override, that an uncompilable pattern matches nothing, that every level is counted even at zero, and that the export carries level and timestamp and honours the filter. |
| `NoticeCentrePanel.test.ts` | Mounted: the history newest first with its actions intact, search over body and detail with an honest count line, the shared search field rather than a rebuilt one, the builder previewing against real history, no-match distinguished from nothing-to-show, level chips with counts and pressed state, restoring a notice with its id and actions, and the region, group and control labelling. |
| `notificationContract.test.ts` | Mounted: every level reaches the corner and none reaches a dialog, information and success take themselves away while warning and error do not, several stack as siblings, a dismissed notice stays in the history, and the bell is present with the history behind it. |
| `notificationPolicy.test.ts` | Source policy: every blocking surface in the package is declared with the decision it asks for, the notification path itself holds none of them, nothing in the package asks for payment, sponsorship, a rating, a subscription or an upgrade, and the corner's layout guarantees are read out of the stylesheet. |

Run them with `npx vitest run packages/ui/src/components/notifications` from `design/`.

## Suggested reading

- [The regex builder and the search bars it reaches](./regex-builder.md), which supplies this
  panel's search.
- [The command palette](./command-palette.md), the other route to something whose name you know.
- [Super confirmation](./super-confirmation.md), for the opposite rule: what does block, and why.

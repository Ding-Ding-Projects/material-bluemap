# Browsing for a folder or a file

Every field in the application that names a folder or a file on this computer offers the
same native browse button beside the text box, in addition to typing or pasting the path by
hand. Typing always keeps working; the button is an addition, never a replacement.

This is the shared control, `PathField`, and the point of documenting it once here rather
than once per screen is that it behaves identically everywhere it appears: the same button
placement, the same keyboard behaviour, the same disabled state and explanation when there is
nothing to browse with.

## Where it appears

| Screen | Field | What it picks |
|---|---|---|
| Any schema-driven config screen (Maps, Storages, the general config editor) | Every setting the config schema marks as a path - the web server root, the map storage folder, the debug and access log files, the JDBC driver `.jar`, and more | Folder or file, depending on the setting |
| Maps screen, New Map dialog | World folder | Folder |
| Storages screen, New Storage dialog | Folder for rendered tiles | Folder |
| Settings, Storage row | Folder for rendered maps | Folder |
| First-run setup wizard, storage step | Folder for rendered maps | Folder |
| Remote render target editor | Private key file (the SSH identity file) | File |
| Backup screen | The world or render folder being backed up | Folder |
| Project editor, render options | Where the rendered map is written, when overriding the default | Folder |

The make-a-map wizard's own world-folder step, the project screen's "add a world" flow, the
CI render screen and the "mount another Minecraft folder" dialog each offer their own folder
browse button as well, wired directly rather than through this shared control - they predate
it and already worked, so they were left as they were rather than rewritten for its own sake.
Typing, browsing and (on the wizard's own step) dropping a folder all work the same way in
every case; see [Finding worlds](./finding-worlds.md) for that step specifically.

## Behaviour

- **A pick writes into the field exactly as typing would.** There is no separate "picked"
  state, no extra confirmation step, and no notice when the dialog is cancelled - a
  cancelled dialog leaves the field exactly as it was, matching every picker in the
  application.
- **The dialog starts at the field's current value**, once there is one, rather than at an
  arbitrary default location.
- **A field can ask for a folder, a file, or offer both.** A file field can also restrict the
  dialog to particular extensions - the JDBC driver field only offers `.jar` files, the log
  file fields only offer `.log` files - while a field with no natural extension, such as an
  SSH private key, offers every file.

## Keyboard and accessibility

- The browse button is a real button, so Enter and Space activate it through the browser's
  own native keyboard handling.
- Its accessible name always says what it browses for - "Browse for world folder", never a
  bare "Browse" - so a screen-reader or keyboard user tabbing through several such buttons on
  one screen can tell them apart.
- A field offering both a folder and a file button gives each one its own distinguishable
  name, for the same reason.
- The dialog itself carries a title naming the same field, so its own window is identifiable
  independent of the button that opened it.

## Failure modes and security

- **No desktop app, no browse button.** A browser tab, or any build without the desktop
  bridge, has no native folder or file dialog to open. The button is shown disabled with an
  explanation naming the field and saying that typing or pasting the path still works; the
  text field itself is never disabled.
- **The application only ever records the path as text.** Browsing for the SSH private key
  file is the clearest case: the application writes down where the file is, hands that path
  to the SSH client, and never opens, copies or transmits the file's contents itself. There
  is no password field anywhere in the remote render feature, and the SSH client is told to
  refuse one even if the remote host offers it.
- **A picked path is not validated by the dialog.** Whether a chosen folder or file actually
  works for its purpose - a world folder that contains a save, a storage folder that is
  writable - is checked by the screen that owns the field, the same way a typed path is
  checked, so browsing carries no more trust than typing does.

## Verification

```sh
cd design && npx vitest run packages/ui/src/components/PathField.test.ts       # the control itself
cd design && npx vitest run packages/ui/src/components/pathFieldHost.test.ts   # the bridge probe
cd design && npx vitest run packages/ui/src/copy/surfaces/pathField.test.ts    # its copy, in both languages
cd design && npx vitest run packages/ui/src/components/pathFieldPolicy.test.ts # every wired field, plus a sweep for one that was never wired
cd design && npx vitest run packages/app/src/main/dialogs                     # the native dialog, in the main process
```

`pathFieldPolicy.test.ts` is the guard against this feature quietly rotting: it names every
field above and fails if one loses its browse button, and separately scans every text field
in the application for one that reads as a folder or a file path but carries no browse button
and no written reason why not.

## Related

- [Finding worlds](./finding-worlds.md) - the wizard step this control shares its browse
  behaviour with, which also offers dropping a folder
- [Rendering on a remote host](./remote-render.md) - the SSH identity file field
- [Backing up a world or a rendered map](./backup.md) - the backup screen's folder field

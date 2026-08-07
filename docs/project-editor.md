# Editing a project

## Behaviour

A project is the repeatable description of a render: its maps, storages, render options and the
four whole-file BlueMap settings. `ProjectEditor.vue` presents those sections as its own nested
browser-style tab strip, so the project remains editable without leaving the application shell.

The shell's map panel deliberately lets pointer input pass through to the map canvas. That is an
explicit host choice, `panel-pass-through`, rather than a selector that reaches every tab panel
below it. The Project Editor's nested panels explicitly restore ordinary pointer input. A click,
pointer press, Enter or Space therefore activates the editor's real tabs and buttons without
opening a hidden overlay or falling through to the map underneath.

An empty project offers two honest starting paths:

- **Add a map** opens the inline form and focuses its first field.
- **Use this preset** applies one of the project's real BlueMap-derived templates, selects the
  first created map and focuses its name. The generated maps remain fully editable.

The editor labels unsaved work and does not save on a tab change. Save is a deliberate action; a
successful project save is recorded in the project's append-only local history. Revert discards
the current edits only through the host's existing audited project path.

## Configuration

| Item               | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Tab layout key     | `worldlens-project-editor-tabs`; the former key is imported only when current state is absent           |
| Sections           | Maps, Storages, How it renders, History, Core, Web app, Web server, Plugin                              |
| Pointer policy     | The application shell alone opts into pass-through; nested tab panels default to `pointer-events: auto` |
| New-map defaults   | BlueMap's own schema and project templates, never invented sample data                                  |
| Responsive targets | At least 44 CSS pixels for primary project, tab, search and live-speed controls                         |

The editor's project value remains owned by its host. A map, storage or setting edit emits an
updated project; Save, Revert, Close and Render remain separate actions. Tab placement, ordering,
pinning and grouping are ordinary tab-layout preferences and do not alter project data.

## Failure modes

- A stale shell-level `pointer-events: none` rule reaching nested panels makes controls look live
  while every pointer action falls through. The typed pass-through prop and mounted shell test
  guard that boundary.
- A keyboard handler that treats Enter or Space as a menu gesture can open an overlay rather than
  activate the tab. The tab strip handles both keys as activation and prevents their default
  scrolling/menu behavior.
- A newly added map with no focus target leaves a keyboard user at the button that disappeared.
  Add and preset routes wait for the form to render and focus the first editable field.
- A narrow or bilingual layout can crowd the map list, action row or search controls. The project
  container stacks those regions at its responsive breakpoints, wraps long labels and bounds
  overlays to the viewport with internal scrolling.
- Save failures remain visible as the host's exact error. The editor does not infer success from
  a dismissed progress state.

## Security considerations

Editing is local. The pointer boundary grants input only to the visible nested panel; it does not
add a privileged bridge or broaden the files the project host may write. Project persistence uses
the existing validated project path and append-only local history. Presets contain BlueMap config
values, not credentials or network-fetched content.

Removing a map still uses the project's destructive confirmation and states that already-rendered
tiles remain on disk. The interaction fix does not bypass that gate or any unsaved-work check.

## Verification

- `components/project/ProjectEditor.test.ts` exercises the real nested tabs with pointer input,
  Enter and Space; the Add button's full pointer sequence; inline-form focus; preset creation;
  post-preset editability; save, revert and validation states.
- `packages/ui/src/App.test.ts` mounts the real shell and Project Editor together, proves only the
  outer shell panel computes to `pointer-events: none`, proves the nested panel is interactive,
  and clicks the Core, Maps and Add-map paths.
- `components/project/projectSurfaceSizing.test.ts` inventories the 44px targets, responsive
  stacking, text wrapping and viewport-bounded overlay rules for the project and related controls.
- `pnpm --filter @worldlens/ui run typecheck` verifies the typed pass-through boundary and
  the editor/component contracts.

The focused mounted tests and UI typecheck pass on this change. A packaged, hidden-desktop capture
remains a separate runtime proof and must be reported independently from these DOM and CSS checks.

## Suggested articles

- [Browser-style tabbed navigation](./tabbed-navigation.md) for the layout and keyboard model the
  nested editor uses.
- [Worlds ready to use on the Projects tab](./project-world-discovery.md) for the path that opens a
  discovered world in this editor.
- [Local version history for config folders](./config-history.md) for the append-only history model
  shared by project saves.
- [Super confirmation](./super-confirmation.md) for the gate used when a map is removed.

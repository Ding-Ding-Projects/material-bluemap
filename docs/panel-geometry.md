# Resizable and draggable panel geometry

Every Pages panel can be resized. Floating interactive panels can also be dragged by their visible
geometry toolbar. Geometry is persisted per surface, bounded by the current viewport, resettable,
and operable without a pointer.

## Behaviour

The shared `PanelGeometry` controller covers four explicit classes: settings tab panels, ordinary
site page panels, anchored interactive panels, and interactive overlays. Docked panels resize.
Floating panels resize and move. Menus remain anchored command lists rather than pretending to be
free-floating windows.

The toolbar exposes wider, taller, smaller, and reset controls with 44-pixel targets. Dragging the
toolbar detaches a floating panel from its anchor for the visit. <kbd>Alt</kbd>+Arrow moves a
floating panel; <kbd>Alt</kbd>+<kbd>Shift</kbd>+Arrow resizes any focused panel.

## Configuration

There is no global switch. Adjust each panel directly and its versioned geometry is stored under
that surface's stable ID. **Reset panel size and position** removes only that panel's record and
returns an anchored panel to its anchor or a docked panel to its responsive layout.

## Failure modes

- Malformed or partly specified stored geometry is ignored.
- A saved size larger than a new viewport is clamped inside a 12-pixel margin.
- A panel moved toward an edge is clamped so its toolbar remains reachable.
- Compact anchored panels retain their sheet fallback and internal scrolling; their saved wide
  position remains available when the viewport becomes wide again.
- A page renderer that replaces its panel contents receives the shared toolbar after rendering, so
  it cannot accidentally erase the controls.

## Security considerations

Geometry contains only width, height and optional screen-relative coordinates. It stays in
namespaced browser preferences, is never transmitted, contains no page content, and cannot name an
arbitrary selector or execute code.

## Verification

- `PanelGeometry.test.ts` proves visible controls, keyboard move/resize, persistence, restoration,
  viewport bounds and reset.
- `panelGeometryCoverage.ts` is a hand-written four-surface inventory. The test reads every owning
  source file and fails if the shared controller is not actually attached.
- Compact captures of the schedule editor and appearance editor show the toolbar and bounded
  internal scrolling at 390 and 414 CSS pixels.

## Suggested articles

- [Pages feature parity](pages-feature-parity.md)
- [Appearance editors](appearance-editors.md)
- [Browser-style tabbed navigation](tabbed-navigation.md)
- [Regex builder](regex-builder.md)

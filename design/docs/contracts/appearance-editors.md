# Appearance editors

## Behavior

Every user-facing app provides an appearance editor for every rendered element. This is a strict completion requirement: no tab, menu, toolbar, dialog, picker, notification, field, button, icon, surface, state, or editor chrome is exempt. A missing editor is added during the next project-changing task before that task is considered complete.

Every element exposes **Edit appearance…** from its context menu and through an accessible keyboard path. Tabs preserve their normal management menu, add **Edit tab appearance…**, and use Shift+right-click to open the editor directly when the platform supports modifier-specific pointer input. The editor is a non-modal dialog or popover anchored beside the exact element being edited. It tracks the anchor, flips or shifts at viewport edges without looking detached, updates the live target, and restores focus to that target when closed.

Tab groups are independent decoration targets, not merely containers that inherit a tab color. Their header and grouped region expose **Edit group appearance…** through normal right-click and Shift+right-click direct access where supported. The anchored editor covers typography, text and highlight colors, icon or emoji, badges, foreground/background treatments, borders, shapes, radius, spacing, separators, and expanded/collapsed/hover/focus states. Decorative content never replaces the accessible name, count, or state.

## Typography

Typography controls are modeled on the depth of Microsoft Word rather than a minimal theme selector:

- enumerate every installed and bundled font, search the list, render each family name in its own face, preview the target text live, expose variable-font axes, and provide a CJK-safe fallback;
- support free-entry and stepped size, weight and bold, italic and oblique, underline style and color, single and double strikethrough, overline, capitalization, small caps, superscript, subscript, and baseline offset;
- support foreground color, highlight, outline, shadow, glow where the platform renders it, character spacing, word spacing, line height, text direction, and alignment; and
- show unsupported capabilities with an explanation and preserve values the platform cannot currently render.

All settings persist per element, can inherit from an explicitly chosen parent or preset, and can reset per property, per element, per surface, or globally. Named presets and user themes export and import without dropping unsupported values.

## Infinite color picker and translator

Every color control opens the same continuous, effectively infinite picker: a spectrum/wheel or two-dimensional color field plus numeric entry. Finite swatches, recent colors, palettes, and an eyedropper are useful shortcuts but never the only chooser.

The picker includes a built-in bidirectional color translator for named colors when defined, HEX/HEX8, RGB/RGBA, HSL/HSLA, HSV/HSB, HWB, CIELAB/LCH, OKLab/OKLCH, and CMYK. It preserves alpha, identifies the current color space and gamut, warns before clipping, previews the translated result, reports accessible contrast against the relevant foreground and background, and copies any representation without changing the selected color.

## Failure modes

A global theme without per-element targeting, a tab-only editor, a finite swatch-only chooser, a font list that omits installed fonts, a detached appearance page, a right-click path with no keyboard equivalent, or a control that silently drops unsupported values is incomplete.

The editor must not obscure the target without collision handling, lose its anchor when tabs reorder, apply changes to the wrong tab, trap focus, overwrite unrelated presets, or persist a preview the user cancelled.

## Verification

Inventory every rendered element and prove editor coverage. Exercise normal right-click, Shift+right-click where supported, keyboard access, anchor tracking, collision handling, live preview, cancel/apply, inheritance, persistence, every reset level, import/export, and all language modes at narrow widths and 100/125/150/200% scaling.

Enumerate installed fonts and test Latin plus CJK fallback, variable fonts, every typography property, and unsupported-capability preservation. For colors, round-trip every supported representation including alpha, wide-gamut and out-of-gamut values, clipping warnings, contrast calculations, copy, eyedropper fallback, and keyboard/screen-reader operation.

[Product index](./README.md) · [Tabbed navigation](./tab-navigation.md) · [Localization](./localization.md)

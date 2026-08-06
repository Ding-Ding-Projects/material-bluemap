# Super confirmation

Super confirmation is the shared interaction requirement for destructive actions in user-facing apps.

## Behavior

The app's own UI presents the exact action and affected data in an anchored dialog when possible. The user operates two independent key controls, then completes a full-range slider. Animation communicates arming, progress, and completion. Emergency exit, Escape/back, and normal focus return cancel safely without changing data.

No external CAPTCHA, hosted helper page, separate confirmation app, or new window is required or permitted for this interaction. The implementation belongs in the app's existing framework and renderer.

## Accessibility and localization

The two keys, slider, progress state, completion state, and Emergency exit control have accessible names and visible focus. The gate respects reduced motion, narrow layouts, contrast, keyboard operation, and every supported language and funny-level setting. Humor changes tone only; the destructive facts remain exact.

## Verification

Test each incomplete state, successful completion, cancellation, Escape/back, reduced motion, keyboard and screen-reader paths, localized strings, and the real destructive operation. Document the action protected and the evidence gathered.

The world-repository screen uses the shared anchored gate for both one-row and bulk stop-tracking.
Its action copy names every repository and branch, states that local world folders and unrelated
repository content remain untouched, and reports a refused deletion without removing the tracked
row. `WorldRepoScreen.test.ts` drives the rendered switches and slider through untouched, one-key,
partial-travel, full-travel and failure paths; `superConfirm.test.ts` supplies the shared Escape,
Emergency exit, focus-return, reduced-motion, keyboard, assistive-label and localization proof for
the same `ConfigSuperConfirm` component.

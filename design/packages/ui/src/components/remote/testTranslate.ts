/**
 * A translator for tests, behaving as `vue-i18n` does with no messages loaded.
 *
 * Which is the state this application is nearly always rendered in: every key falls back to
 * its English string and the named arguments are interpolated into it. Written once here
 * rather than per test file so a fallback that quietly stops interpolating - the exact bug
 * the three-argument `t(key, { args }, "fallback")` rule exists to prevent - fails in every
 * test at once rather than in whichever one happened to check.
 */

import type { Translate } from "../world/worldFolder.js";

function interpolate(template: string, values: Readonly<Record<string, unknown>>): string {
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in values ? String(values[name]) : whole,
    );
}

export const t: Translate = ((
    _key: string,
    second: string | Readonly<Record<string, unknown>>,
    third?: string,
): string => {
    if (typeof second === "string") return second;
    return interpolate(third ?? "", second);
}) as Translate;

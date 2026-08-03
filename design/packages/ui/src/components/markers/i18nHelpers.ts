import { useI18n } from "vue-i18n";

/** Replaces `{placeholder}` tokens, so an English fallback interpolates like a locale does. */
function interpolate(message: string, values: Record<string, string | number>): string {
    return message.replace(/\{(\w+)\}/g, (whole, key: string) =>
        key in values ? String(values[key]) : whole,
    );
}

export interface MarkerI18n {
    /** Translate a key, falling back to the given English string when it is missing. */
    t: (key: string, fallback: string) => string;
    /** Translate with an English fallback, interpolating `{placeholders}` either way. */
    tx: (key: string, fallback: string, values?: Record<string, string | number>) => string;
    /**
     * Translate a vue-i18n plural message such as `"marker | markers"`. The fallback uses
     * the same `singular | plural` form.
     */
    tp: (key: string, count: number, fallback: string) => string;
}

/**
 * The marker menu keeps upstream BlueMap's i18n keys so the 30 bundled locale files light
 * up, and adds its own keys only for surfaces upstream never had (the regex builder, the
 * breadcrumb, the empty states). Those extra keys are missing from every locale, so each
 * call carries a plain English fallback.
 *
 * These wrappers exist because `t(key, fallback)` alone does not cover two cases:
 *
 * - placeholders, because a fallback used in place of a missing key is not interpolated
 *   with the values that were passed, and
 * - plurals, because `markers.marker` is the vue-i18n form `"marker | markers"` and a
 *   missing key would otherwise render as the raw key.
 *
 * `te` decides in both cases whether a real translation exists.
 */
export function useMarkerI18n(): MarkerI18n {
    const { t, te } = useI18n();

    function translate(key: string, fallback: string): string {
        return te(key) ? t(key) : fallback;
    }

    function tx(
        key: string,
        fallback: string,
        values: Record<string, string | number> = {},
    ): string {
        const message = te(key) ? t(key, values) : fallback;
        return interpolate(message, values);
    }

    function tp(key: string, count: number, fallback: string): string {
        if (te(key)) return t(key, count);
        const parts = fallback.split("|").map((part) => part.trim());
        return (count === 1 ? parts[0] : parts[1]) ?? parts[0] ?? "";
    }

    return { t: translate, tx, tp };
}

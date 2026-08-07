import { parseHocon } from "@worldlens/shared";

/**
 * Converts a given value to JSON and writes it to the given key in
 * localStorage.
 */
export const setLocalStorage = (key: string, value: unknown): void => {
    localStorage.setItem(key, JSON.stringify(value));
};

/**
 * Fetches the value from a given key from localStorage. If the stored value is
 * in JSON format, the parsed value will be returned.
 */
export const getLocalStorage = (key: string): unknown => {
    const value = localStorage.getItem(key);

    // return undefined for not defined values
    // because "null" might be ambiguous if there is actually "null" stored for that key
    if (value == null) return undefined;

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

export const round = (value: number, precision: number): number => {
    const f = Math.pow(10, precision);
    return Math.round(value * f) / f;
};

/**
 * Fetches and parses a `.conf` file, which a remote BlueMap server serves as HOCON.
 *
 * `parseHocon` is the port's own dependency-free parser: the `hocon-parser` package this
 * used to call resolves substitutions with `eval`, which the app's Content Security Policy
 * (`script-src 'self'`, no `unsafe-eval`) refuses at runtime.
 */
export const fetchHocon = async (url: string): Promise<unknown> => {
    return fetch(url)
        .then((res) => res.text())
        .then((value) => parseHocon(value));
};

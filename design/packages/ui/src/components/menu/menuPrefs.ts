import { reactive, watch } from "vue";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/**
 * Disclosure state for the menu search bars.
 *
 * Only whether a search bar is *open* is persisted. The query, the regex mode and the flags
 * deliberately are not: the regex-builder contract says patterns and sample text are not
 * stored without an explicit need, and a filter that silently survives a restart is how a
 * user comes to believe half their maps or settings have disappeared.
 */
const STORAGE_KEY = "material-bluemap-menu-search";

export interface MenuSearchState {
    /** Whether the search field is revealed. Persisted per surface. */
    open: boolean;
    query: string;
    /** True when the query is a regular expression rather than plain text. */
    regex: boolean;
    flags: string;
}

function loadOpenFlags(): Record<string, boolean> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        const result: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value === "boolean") result[key] = value;
        }
        return result;
    } catch {
        return {};
    }
}

const openFlags = reactive<Record<string, boolean>>(loadOpenFlags());

watch(
    openFlags,
    (value) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        } catch {
            // Private-mode or quota failure: the disclosure state is not worth an error toast.
        }
        // Fire-and-forget mirror into the main process's own settings history, on top of
        // the localStorage write above rather than instead of it - see
        // `appSettingsHistorySync.ts`'s own doc comment for the whole rule.
        recordAppSetting("menuSearch", value);
    },
    { deep: true },
);

/** Search state for one surface, with its open/closed state remembered across restarts. */
export function useMenuSearch(surface: string): MenuSearchState {
    const state = reactive<MenuSearchState>({
        open: openFlags[surface] ?? false,
        query: "",
        regex: false,
        flags: "i",
    });

    watch(
        () => state.open,
        (value) => {
            openFlags[surface] = value;
        },
    );

    return state;
}

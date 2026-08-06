/**
 * Home: the pinned landing tab that answers "what is this and where do I start", every time
 * it is opened rather than only on a newcomer's first launch.
 */

export { default as HomeScreen } from "./HomeScreen.vue";

export {
    capabilityHaystack,
    capabilityMatchesText,
    filterCapabilities,
    homeSampleText,
} from "./homeCatalog.js";
export type { HomeCapability } from "./homeCatalog.js";

export { homeIntroCollapsed, setHomeIntroCollapsed } from "./homeState.js";

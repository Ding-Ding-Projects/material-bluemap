/**
 * A world found on disk is not the same thing as a project.
 *
 * `../world/worldCatalog.ts` already answers "what worlds does this machine have" - the
 * default Minecraft folder, every folder somebody mounted, every world in each, most
 * recently played first. This module answers the question the Projects tab actually asks:
 * *which of those worlds has nobody set up yet*.
 *
 * ## Why the distinction matters
 *
 * Every world this computer can find is not a project, and treating them as the same thing
 * fails in one of two directions. Silently creating a project file for every world the
 * catalogue finds would write settings nobody asked for into somebody's world folders the
 * moment this tab is opened - the exact "built, tested, unreachable" mistake in reverse, a
 * feature that does something nobody triggered. Showing every discovered world folded into
 * the projects list, indistinguishable from one somebody actually configured, would bury
 * the handful of real projects under however many saves happen to exist on the machine.
 *
 * So a discovered world is its own thing: listed as *available to use*, with a one-click
 * route into the project it does not have yet, and visibly distinct from an established
 * project until somebody actually starts one. See `DiscoveredWorlds.vue` for where that
 * distinction is drawn on screen.
 *
 * ## Identity, not path strings
 *
 * "Already a project" is decided by {@link samePath} - separator-folded and case-folded,
 * the same identity every other match in this application's world-handling code uses -
 * rather than an exact string comparison. A project's `world` field and a path the catalogue
 * read from a directory listing routinely differ in case or separator on Windows without
 * naming a different folder, and a discovered world that fails to recognise its own project
 * would offer to create a second one over the first.
 */

import { dedupeWorldsByPath, samePath, type MinecraftWorldSummary } from "../world/worldCatalog.js";

/**
 * Every discovered world that is not already a project, deduplicated by path.
 *
 * `projectWorlds` is compared against with {@link samePath}, so a project whose `world`
 * field was written with a trailing separator or a different case still correctly hides
 * the world it belongs to.
 */
export function discoveredWorlds(
    allWorlds: readonly MinecraftWorldSummary[],
    projectWorlds: readonly string[],
): readonly MinecraftWorldSummary[] {
    const deduped = dedupeWorldsByPath(allWorlds);
    if (projectWorlds.length === 0) return deduped;
    return deduped.filter((world) => !projectWorlds.some((project) => samePath(project, world.path)));
}

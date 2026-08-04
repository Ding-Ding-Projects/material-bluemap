/**
 * `@material-bluemap/config` — BlueMap's configuration, modelled.
 *
 * Three things live here:
 *
 *   1. A schema per config file, every field carrying its real default, its
 *      bounds, upstream's own documentation, the control the GUI should render,
 *      and whether changing it invalidates tiles that are already rendered.
 *   2. A HOCON reader and writer that round-trip, so editing one setting in a
 *      generated file does not strip the comments that explain the other forty.
 *   3. The CLI's flag list, modelled well enough to express a run from a GUI.
 *
 * Read `README.md` in this package for what is and is not modelled, and why.
 */

export * from "./meta.js";
export * from "./hocon/index.js";
export * from "./templates/template.js";
export * from "./templates/sources.js";
export * from "./schema/index.js";
export * from "./validate.js";
export * from "./generate.js";
export * from "./cli/flags.js";
export * from "./project.js";

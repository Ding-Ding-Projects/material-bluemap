/**
 * electron-builder packaging configuration for the Material BlueMap desktop app.
 *
 * Why electron-builder and not Electron Forge: Forge's packager step drives its
 * pruning through the package manager and needs pnpm's hoisted node-linker to
 * resolve a workspace app. This monorepo uses pnpm's default isolated linker, and
 * changing that would affect every package, not just this one. electron-builder
 * packages a pre-built directory instead, which is all this app needs.
 *
 * Why Squirrel.Windows and not NSIS: the shared project rules prefer
 * Squirrel.Windows for Electron apps on Windows, because it also emits the
 * RELEASES / .nupkg pair that Electron's own autoUpdater consumes.
 *
 * What actually gets packaged: build.mjs bundles the main process (ESM) and the
 * preload (CJS) with esbuild, inlining every runtime dependency except `electron`
 * itself. So the shipped app is the `dist` tree plus this package.json — no
 * node_modules tree is copied into the asar, which is what the negated node_modules
 * pattern below asserts.
 */

/** @type {import("electron-builder").Configuration} */
module.exports = {
    appId: "dev.materialbluemap.desktop",
    productName: "Material BlueMap",
    // `dist/` holds the esbuild output; `release/` is already gitignored.
    directories: {
        output: "release",
    },
    files: [
        "dist/**/*",
        "package.json",
        // The bundle is self-contained; nothing from node_modules is needed at runtime.
        "!node_modules/**/*",
        // Source maps are build artefacts, not shipping artefacts.
        "!**/*.map",
    ],
    asar: true,
    // No native modules reach the packaged app — everything is bundled by esbuild.
    npmRebuild: false,
    buildDependenciesFromSource: false,
    win: {
        target: [
            {
                target: "squirrel",
                arch: ["x64"],
            },
        ],
    },
    squirrelWindows: {
        // NuGet package id: no spaces allowed, so it cannot be derived from productName.
        name: "MaterialBlueMap",
        // Emitted next to RELEASES and the .nupkg in `release/`.
        artifactName: "MaterialBlueMap-${version}-Setup.${ext}",
    },
    // Releases are published by the CI workflow via `gh release create`, never by
    // electron-builder itself.
    publish: null,
};

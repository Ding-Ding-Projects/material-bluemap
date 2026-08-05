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
    // The renderer is a separate workspace package, so it is not under this app's
    // directory and `files` cannot reach it. Without this the packaged app starts,
    // fails to find the UI bundle, and shows nothing at all: `resolveUiRoot` throws
    // inside `createWindow`, which is invoked as `void createWindow()`, so the
    // rejection is swallowed and the window is never created. It looks exactly like
    // the app not launching.
    //
    // `../../../tools/oracle/out/jars` is the same directory `tools/build-jars.mjs`
    // stages into on a workstation (jars.ts's DEFAULT_STAGING / stagingJarDirectory),
    // and the CI package job populates it with the CLI jar before this config runs.
    // `bundledJarDirectory()` in jars.ts reads it back from `resourcesPath/jars` in a
    // packaged build, so this is the one place that makes local rendering possible in
    // a shipped installer at all. Without a staged jar this copies nothing - it is not
    // required to exist, unlike `../ui/dist` above, because a developer running
    // `pnpm run make` without first running `tools/build-jars.mjs` should still get an
    // installer, just one whose local render fails the same honest way a checkout's
    // does until the jar is built.
    extraResources: [
        {
            from: "../ui/dist",
            to: "ui",
            filter: ["**/*"],
        },
        {
            from: "../../../tools/oracle/out/jars",
            to: "jars",
            filter: ["**/*"],
        },
    ],
    asar: true,
    // No native modules reach the packaged app — everything is bundled by esbuild.
    npmRebuild: false,
    buildDependenciesFromSource: false,
    win: {
        // Multi-size .ico (256px + 64px) derived from the tracked project logo.
        icon: "build/icon.ico",
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
        // Squirrel refuses to build without this. It must be a URL, not a path:
        // Squirrel fetches it at install time to draw the Add/Remove Programs entry
        // and the shortcut. Pinned to main so a released installer keeps resolving.
        iconUrl:
            "https://raw.githubusercontent.com/Ding-Ding-Projects/material-bluemap/main/design/packages/app/build/icon.ico",
    },
    // Releases are published by the CI workflow via `gh release create`, never by
    // electron-builder itself.
    publish: null,
};

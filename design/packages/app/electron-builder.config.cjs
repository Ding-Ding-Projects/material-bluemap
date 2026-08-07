/**
 * electron-builder packaging configuration for the Worldlens desktop app.
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

// Worldlens releases are permanently unsigned. Clear every electron-builder signing input
// before configuration is evaluated so a developer shell or runner secret cannot silently
// turn one build into a differently trusted artifact.
for (const key of [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "WIN_CSC_LINK",
    "WIN_CSC_KEY_PASSWORD",
    "CSC_IDENTITY_AUTO_DISCOVERY",
]) {
    delete process.env[key];
}

/** @type {import("electron-builder").Configuration} */
module.exports = {
    appId: "dev.worldlens.desktop",
    productName: "Worldlens",
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
        // The two render workflow files a CI-render bootstrap commits to a repository -
        // see cirender/workflowTemplates.ts's `loadCiWorkflowTemplates`, which reads them
        // back from `resourcesPath/workflows/` in a packaged build. Without this entry a
        // shipped installer has no `.github/workflows` to walk up to (the packaged app's
        // own directory tree is not a checkout of this repository), so bootstrapping a
        // repository would fail on every real install with "the workflow files this
        // application ships... could not be found" even though it works perfectly in a
        // development checkout, where the fallback walk finds this repository's own
        // `.github/workflows` instead. Copied straight from the source of truth, the same
        // way the UI bundle above is staged rather than duplicated by hand.
        {
            from: "../../../.github/workflows",
            to: "workflows",
            filter: ["render-world.yml", "render-shard-wave.yml"],
        },
    ],
    asar: true,
    // Permanent product policy: Worldlens artifacts are intentionally unsigned. Integrity is
    // supplied by HTTPS, the immutable Squirrel feed metadata, and package hashes.
    forceCodeSigning: false,
    // No native modules reach the packaged app — everything is bundled by esbuild.
    npmRebuild: false,
    buildDependenciesFromSource: false,
    win: {
        // Multi-size .ico (256px + 64px) derived from the tracked project logo.
        icon: "build/icon.ico",
        signExecutable: false,
        signAndEditExecutable: false,
        target: [
            {
                target: "squirrel",
                arch: ["x64"],
            },
        ],
    },
    squirrelWindows: {
        // NuGet package id: no spaces allowed, so it cannot be derived from productName.
        name: "Worldlens",
        // Emitted next to RELEASES and the .nupkg in `release/`.
        artifactName: "Worldlens-${version}-Setup.${ext}",
        // Squirrel refuses to build without this. It must be a URL, not a path:
        // Squirrel fetches it at install time to draw the Add/Remove Programs entry
        // and the shortcut. Pinned to main so a released installer keeps resolving.
        iconUrl:
            "https://raw.githubusercontent.com/Ding-Ding-Projects/worldlens/main/design/packages/app/build/icon.ico",
    },
    // Releases are published by the CI workflow via `gh release create`, never by
    // electron-builder itself.
    publish: null,
};

/**
 * Projects: a world's own record of how it should be rendered.
 *
 * Mount {@link ProjectsScreen}. It resolves the Electron bridge itself, decides for itself
 * whether this build can see a world folder at all, and shows the list, the editor for one
 * project, and the render that a project starts.
 *
 * The shell is expected to do three things with what it emits. `consent` opens the app's
 * own Mojang download-consent setting; nothing in here ever asks for that, because it is
 * answered once at first launch and remembered. `settings` carries the anchor a failed
 * render says would fix it. `openMap` hands over the folder a finished render wrote, so the
 * viewer can load it.
 *
 * Everything else is exported for tests and for a shell that wants to compose the pieces
 * itself. {@link projectModel} in particular is pure: every rule about ids, ordering,
 * editing and rendering is a plain function over plain values, testable with no disk and no
 * DOM anywhere near it.
 */

export { default as ProjectsScreen } from "./ProjectsScreen.vue";
export { default as ProjectList } from "./ProjectList.vue";
export { default as ProjectEditor } from "./ProjectEditor.vue";
export { default as ProjectMapsPanel } from "./ProjectMapsPanel.vue";
export { default as ProjectStoragesPanel } from "./ProjectStoragesPanel.vue";

export {
    hostMissingReason,
    projectHostFromBridge,
    provideProjectHost,
    resolveProjectHost,
    useProjectHost,
} from "./projectHost.js";
export type {
    ProjectHost,
    ProjectListing,
    ProjectReadAnswer,
    ProjectSummary,
    ProjectWriteAnswer,
} from "./projectHost.js";

export {
    CREDENTIAL_BLOCK,
    DEFAULT_DIMENSIONS,
    EMPTY_RENDER,
    ENGINE_MAP_ID_PATTERN,
    EXPORT_FORMATS,
    MAP_ID_MAX_LENGTH,
    SINGLETONS,
    STORAGE_ID_PATTERN,
    createProject,
    defaultStamp,
    exportFileName,
    exportProjects,
    findMap,
    findStorage,
    formatWhen,
    mapDescriptor,
    mapIdProblem,
    mapIds,
    mapsUsingStorage,
    newProjectId,
    newStorageText,
    nowStamp,
    openMapFile,
    openSingletonFile,
    openStorageFile,
    orderedMaps,
    presetFor,
    previewMapId,
    projectDetailLine,
    projectDetailParts,
    projectFromWizard,
    projectOptionName,
    projectRenderRoute,
    projectSearchText,
    projectToRenderRequest,
    renderProblems,
    singletonText,
    sortProjects,
    sortingFor,
    storageCarriesCredentials,
    storageDescriptorForText,
    storageIdProblem,
    storageIds,
    storageTypeOf,
    syncMapConfig,
    touch,
    withMapAdded,
    withMapConfig,
    withMapEnabled,
    withMapIdentity,
    withMapMoved,
    withMapRemoved,
    withMapReplaced,
    withName,
    withRender,
    withSingleton,
    withStorageAdded,
    withStorageConfig,
    withStorageRemoved,
    withStorageType,
    worldLabel,
    worldLeaf,
} from "./projectModel.js";
export type {
    ExportFormat,
    IdProblem,
    MapIdentity,
    NewMap,
    ProjectRow,
    ProjectStamp,
    SingletonKind,
    WizardAnswers,
} from "./projectModel.js";

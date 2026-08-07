import cloudRenderSetupSource from "../../assets/action-artwork/cloud-render-setup.png";
import configDeleteConfirmationSource from "../../assets/action-artwork/config-delete-confirmation.png";
import localRenderSpeedSource from "../../assets/action-artwork/local-render-speed.png";
import repositoryPublicationSource from "../../assets/action-artwork/repository-publication.png";
import restartToInstallSource from "../../assets/action-artwork/restart-to-install.png";

/**
 * The deliberately hand-written inventory of action artwork.
 *
 * The images are not interchangeable hero art. Each record names the exact action and owning
 * surface it explains, and the inventory test fails when two actions point at one filename.
 * Keeping the semantic English fallback here also makes an accidentally empty `alt` impossible
 * even before a translated string reaches the component.
 */
export const ACTION_ARTWORK = {
    cloudRenderSetup: {
        action: "Set up a repository and start a cloud render",
        owner: "components/cirender/CiRenderScreen.vue",
        filename: "cloud-render-setup.png",
        source: cloudRenderSetupSource,
        alt: "A local Minecraft world travelling through a cloud render pipeline and returning as a finished map",
    },
    localRenderSpeed: {
        action: "Choose how intensely this computer renders locally",
        owner: "components/config/SpeedControl.vue",
        filename: "local-render-speed.png",
        source: localRenderSpeedSource,
        alt: "A desktop workstation turning terrain chunks into a map at five increasing processing levels",
    },
    restartToInstall: {
        action: "Restart the application to install a ready update",
        owner: "components/update/UpdateBanner.vue",
        filename: "restart-to-install.png",
        source: restartToInstallSource,
        alt: "A completed update package ready beside a workstation while the open map remains safely visible",
    },
    repositoryPublication: {
        action: "Pack and publish a repository backup",
        owner: "components/backup/BackupScreen.vue",
        filename: "repository-publication.png",
        source: repositoryPublicationSource,
        alt: "A world folder split into checked archive parts and uploaded into a repository vault",
    },
    configDeleteConfirmation: {
        action: "Review configuration writes and permanent file deletions",
        owner: "components/config/ConfigApplyDialog.vue",
        filename: "config-delete-confirmation.png",
        source: configDeleteConfirmationSource,
        alt: "Changed configuration pages being reviewed before selected files move into a deletion tray",
    },
} as const;

export type ActionArtworkId = keyof typeof ACTION_ARTWORK;

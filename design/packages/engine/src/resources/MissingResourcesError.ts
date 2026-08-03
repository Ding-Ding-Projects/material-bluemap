/**
 * upstream: common/MissingResourcesException.java (extends ConfigurationException) —
 * thrown by the accept-download consent-gate when the required minecraft-client
 * resources are neither cached nor allowed to be downloaded (core.conf:
 * {@code accept-download: false}).
 */
export class MissingResourcesError extends Error {
    constructor() {
        super(
            "BlueMap is missing important resources!\n" +
                "You must accept the required file download in order for BlueMap to work!"
        );
        this.name = "MissingResourcesError";
    }
}

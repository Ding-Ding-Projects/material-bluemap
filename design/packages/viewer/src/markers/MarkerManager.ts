import type { MarkerSet } from "./MarkerSet";
import { alert } from "../util/Utils";
import { RevalidatingFileLoader } from "../util/RevalidatingFileLoader";

/**
 * A manager for loading and updating markers from a file
 */
export class MarkerManager {
    declare readonly isMarkerManager: boolean;

    root: MarkerSet;
    fileUrl: string;
    events: EventTarget | null;
    disposed: boolean;

    _updateInterval: ReturnType<typeof setTimeout> | null;
    _updateIntervalMillis: number;
    _paused: boolean;

    /**
     * @param root - The scene to which all markers will be added
     * @param fileUrl - The marker file from which this manager updates its markers
     */
    constructor(
        root: MarkerSet,
        fileUrl: string,
        events: EventTarget | null = null,
        paused: boolean = false,
    ) {
        Object.defineProperty(this, "isMarkerManager", { value: true });

        this.root = root;
        this.fileUrl = fileUrl;
        this.events = events;
        this.disposed = false;

        this._updateInterval = null;
        this._updateIntervalMillis = 0;
        this._paused = paused;
    }

    /**
     * Sets the automatic-update frequency, setting this to 0 or negative disables automatic updates (default).
     * This is better than using setInterval() on update() because this will wait for the update to finish before requesting the next update.
     * @param ms - interval in milliseconds
     */
    setAutoUpdateInterval(ms: number): void {
        this._updateIntervalMillis = ms;
        if (this._updateInterval) clearTimeout(this._updateInterval);
        if (!this._paused && ms > 0) {
            const autoUpdate = () => {
                if (this.disposed) return;
                this.update()
                    .then((success) => {
                        if (!this._paused) {
                            if (success) {
                                this._updateInterval = setTimeout(autoUpdate, ms);
                            } else {
                                this._updateInterval = setTimeout(
                                    autoUpdate,
                                    Math.max(ms, 1000 * 15),
                                );
                            }
                        }
                    })
                    .catch((e) => {
                        alert(this.events, e, "warning");
                        if (!this._paused)
                            this._updateInterval = setTimeout(autoUpdate, Math.max(ms, 1000 * 15));
                    });
            };

            if (!this._paused) this._updateInterval = setTimeout(autoUpdate, ms);
        }
    }

    /**
     * Pause auto-updates
     */
    pauseAutoUpdates(): void {
        this._paused = true;
        if (this._updateInterval) clearTimeout(this._updateInterval);
    }

    /**
     * Resume auto-updates
     */
    resumeAutoUpdates(): void {
        if (this.disposed) return;
        this._paused = false;
        this.setAutoUpdateInterval(this._updateIntervalMillis);
    }

    /**
     * Loads the marker-file and updates all managed markers.
     * @returns A promise completing when the markers finished updating
     */
    update(): Promise<boolean | void> {
        return this.loadMarkerFile()
            .then((markerFileData) => this.updateFromData(markerFileData))
            .catch(() => this.clear());
    }

    updateFromData(_markerData: unknown): boolean | void {}

    /**
     * Stops automatic-updates and disposes all markersets and markers managed by this manager
     */
    dispose(): void {
        this.disposed = true;
        this.setAutoUpdateInterval(0);
        this.clear();
    }

    /**
     * Removes all markers managed by this marker-manager
     */
    clear(): void {
        this.root.clear();
    }

    /**
     * Loads the marker file
     * @returns A promise completing with the parsed json object from the loaded file
     */
    private loadMarkerFile(): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const loader = new RevalidatingFileLoader();
            loader.setRevalidatedUrls(new Set()); // force no-cache requests
            loader.setResponseType("json");
            loader.load(
                this.fileUrl,
                (markerFileData) => {
                    if (!markerFileData) reject(`Failed to parse '${this.fileUrl}'!`);
                    else resolve(markerFileData);
                },
                () => {},
                () => reject(`Failed to load '${this.fileUrl}'!`),
            );
        });
    }
}

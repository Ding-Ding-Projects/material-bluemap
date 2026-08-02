// based on https://github.com/mrdoob/three.js/blob/a58e9ecf225b50e4a28a934442e854878bc2a959/src/loaders/FileLoader.js

import { Loader, Cache } from "three";
import type { LoadingManager } from "three";

interface LoadingCallbacks {
    onLoad: ((data: unknown) => void) | undefined;
    onProgress: ((event: ProgressEvent) => void) | undefined;
    onError: ((err: unknown) => void) | undefined;
}

interface LoadingEntry {
    revalidatedUrls: Set<string> | undefined;
    callbacks: LoadingCallbacks[];
}

const loading: Record<string, LoadingEntry | undefined> = Object.create(null);

const warn = console.warn;

class HttpError extends Error {
    response: Response;

    constructor(message: string, response: Response) {
        super(message);
        this.response = response;
    }
}

/**
 * A FileLoader that, if passed a Set of URLs, will be put into a mode where it
 * revalidates files by setting the Request cache option to "no-cache" for URLs
 * that have not previously been revalidated.
 *
 * This loader supports caching. If you want to use it, add `THREE.Cache.enabled = true;`
 * once to your application.
 *
 * ```js
 * const loader = new THREE.FileLoader();
 * const data = await loader.loadAsync( 'example.txt' );
 * ```
 *
 * @augments Loader
 */
export class RevalidatingFileLoader extends Loader {
    /**
     * The expected mime type. Valid values can be found
     * [here](hhttps://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString#mimetype)
     */
    mimeType: string;

    /**
     * The expected response type.
     *
     * @default ''
     */
    responseType: "arraybuffer" | "blob" | "document" | "json" | "";

    /**
     * Whether client-side decompression is required.
     *
     * @default false;
     */
    clientDecompression: boolean;

    /**
     * Used for aborting requests.
     *
     * @private
     */
    private _abortController: AbortController;

    /**
     * If set to a Set, this loader will revalidate URLs by setting the
     * Request cache option to "no-cache" for URLs not in the Set, adding
     * them to the Set once loaded.
     */
    _revalidatedUrls: Set<string> | undefined;

    /**
     * Constructs a new file loader.
     *
     * @param manager - The loading manager.
     */
    constructor(manager?: LoadingManager) {
        super(manager);

        this.mimeType = "";
        this.responseType = "";
        this.clientDecompression = false;
        this._abortController = new AbortController();
        this._revalidatedUrls = undefined;
    }

    /**
     * @param revalidatedUrls - If set to a Set, this
     *   loader will revalidate URLs by setting the Request cache option to
     *   "no-cache" for URLs not in the Set, adding them to the Set once loaded.
     */
    setRevalidatedUrls(revalidatedUrls: Set<string> | undefined): this {
        this._revalidatedUrls = revalidatedUrls;
        return this;
    }

    /**
     * Starts loading from the given URL and pass the loaded response to the `onLoad()` callback.
     *
     * @param url - The path/URL of the file to be loaded. This can also be a data URI.
     * @param onLoad - Executed when the loading process has been finished.
     * @param onProgress - Executed while the loading is in progress.
     * @param onError - Executed when errors occur.
     * @return The cached resource if available.
     */
    load(
        url: string,
        onLoad?: (data: unknown) => void,
        onProgress?: (event: ProgressEvent) => void,
        onError?: (err: unknown) => void,
    ): unknown {
        if ((url as string | undefined) === undefined) url = "";

        if ((this.path as string | undefined) !== undefined) url = this.path + url;

        url = this.manager.resolveURL(url);

        // copy reference at start of method in case it is changed while loading
        const revalidatedUrls = this._revalidatedUrls;
        const forceNoCacheRequest = revalidatedUrls ? !revalidatedUrls.has(url) : false;

        if (!forceNoCacheRequest) {
            const cached = Cache.get(`file:${url}`);

            if (cached !== undefined) {
                this.manager.itemStart(url);

                setTimeout(() => {
                    if (onLoad) onLoad(cached);
                    this.manager.itemEnd(url);
                }, 0);

                return cached;
            }
        }

        // Check if request is duplicate

        const previousLoadingEntry = loading[url];

        if (
            previousLoadingEntry !== undefined &&
            (!revalidatedUrls || previousLoadingEntry.revalidatedUrls === revalidatedUrls)
        ) {
            previousLoadingEntry.callbacks.push({ onLoad, onProgress, onError });
            return;
        }

        // Create new loading entry (replacing if duplicate with different revalidatedUrls)
        const loadingEntry: LoadingEntry = (loading[url] = {
            revalidatedUrls,
            callbacks: [{ onLoad, onProgress, onError }],
        });

        // create request
        const req = new Request(url, {
            headers: new Headers(this.requestHeader),
            cache: (forceNoCacheRequest ? "no-cache" : undefined) as RequestCache,
            credentials: this.withCredentials ? "include" : "same-origin",
            signal:
                // future versions of LoadingManager have an abortController property
                typeof AbortSignal.any === "function" &&
                (this.manager as LoadingManager & { abortController?: AbortController })
                    .abortController?.signal
                    ? AbortSignal.any([
                          this._abortController.signal,
                          (this.manager as LoadingManager & { abortController: AbortController })
                              .abortController.signal,
                      ])
                    : this._abortController.signal,
        });

        // record states ( avoid data race )
        const mimeType = this.mimeType;
        const responseType = this.responseType;

        // start the fetch
        fetch(req)
            .then((response) => {
                if (response.status === 200 || response.status === 0) {
                    // Some browsers return HTTP Status 0 when using non-http protocol
                    // e.g. 'file://' or 'data://'. Handle as success.

                    if (response.status === 0) {
                        warn("FileLoader: HTTP Status 0 received.");
                    }

                    // Workaround: Checking if response.body === undefined for Alipay browser #23548

                    const body = response.body as unknown as
                        | ReadableStream<Uint8Array>
                        | undefined;

                    if (
                        typeof ReadableStream === "undefined" ||
                        body === undefined ||
                        (body.getReader as unknown) === undefined
                    ) {
                        return response;
                    }

                    const reader = body.getReader();

                    // Nginx needs X-File-Size check
                    // https://serverfault.com/questions/482875/why-does-nginx-remove-content-length-header-for-chunked-content
                    const contentLength =
                        response.headers.get("X-File-Size") ||
                        response.headers.get("Content-Length");
                    const total = contentLength ? parseInt(contentLength) : 0;
                    const lengthComputable = total !== 0;
                    let loaded = 0;

                    // periodically read data into the new stream tracking while download progress
                    const stream = new ReadableStream<Uint8Array>({
                        start(controller) {
                            readData();

                            function readData() {
                                reader.read().then(
                                    ({ done, value }) => {
                                        if (done) {
                                            controller.close();
                                        } else {
                                            loaded += value.byteLength;

                                            const event = new ProgressEvent("progress", {
                                                lengthComputable,
                                                loaded,
                                                total,
                                            });
                                            for (
                                                let i = 0, il = loadingEntry.callbacks.length;
                                                i < il;
                                                i++
                                            ) {
                                                const callback = loadingEntry.callbacks[i]!;
                                                if (callback.onProgress) callback.onProgress(event);
                                            }

                                            controller.enqueue(value);
                                            readData();
                                        }
                                    },
                                    (e) => {
                                        controller.error(e);
                                    },
                                );
                            }
                        },
                    });

                    return new Response(stream);
                } else {
                    throw new HttpError(
                        `fetch for "${response.url}" responded with ${response.status}: ${response.statusText}`,
                        response,
                    );
                }
            })
            .then(async (response) => {
                if (this.clientDecompression) {
                    const ds = new DecompressionStream("gzip");
                    const decompressedStream = (await response.blob()).stream().pipeThrough(ds);
                    const decompressedResponse = new Response(decompressedStream);
                    return decompressedResponse;
                }
                return response;
            })
            .then((response) => {
                switch (responseType) {
                    case "arraybuffer":
                        return response.arrayBuffer();

                    case "blob":
                        return response.blob();

                    case "document":
                        return response.text().then((text) => {
                            const parser = new DOMParser();
                            return parser.parseFromString(text, mimeType as DOMParserSupportedType);
                        });

                    case "json":
                        return response.json();

                    default:
                        if (mimeType === "") {
                            return response.text();
                        } else {
                            // sniff encoding
                            const re = /charset="?([^;"\s]*)"?/i;
                            const exec = re.exec(mimeType);
                            const label = exec && exec[1] ? exec[1].toLowerCase() : undefined;
                            const decoder = new TextDecoder(label);
                            return response.arrayBuffer().then((ab) => decoder.decode(ab));
                        }
                }
            })
            .then((data: unknown) => {
                // Add to cache only on HTTP success, so that we do not cache
                // error response bodies as proper responses to requests.
                Cache.add(`file:${url}`, data);

                if (loading[url] === loadingEntry) {
                    delete loading[url];
                }

                for (let i = 0, il = loadingEntry.callbacks.length; i < il; i++) {
                    const callback = loadingEntry.callbacks[i]!;
                    if (callback.onLoad) callback.onLoad(data);
                }
            })
            .catch((err: unknown) => {
                // Abort errors and other errors are handled the same

                if (loading[url] === loadingEntry) {
                    delete loading[url];
                }

                for (let i = 0, il = loadingEntry.callbacks.length; i < il; i++) {
                    const callback = loadingEntry.callbacks[i]!;
                    if (callback.onError) callback.onError(err);
                }
                this.manager.itemError(url);
            })
            .finally(() => {
                this.manager.itemEnd(url);
            });
        this.manager.itemStart(url);
    }

    /**
     * Sets the expected response type.
     *
     * @param value - The response type.
     * @return A reference to this file loader.
     */
    setResponseType(value: "arraybuffer" | "blob" | "document" | "json" | ""): this {
        this.responseType = value;
        return this;
    }

    /**
     * Sets the expected mime type of the loaded file.
     *
     * @param value - The mime type.
     * @return A reference to this file loader.
     */
    setMimeType(value: string): this {
        this.mimeType = value;
        return this;
    }

    /**
     * Sets whether client-side decompression is required.
     * @param value - True if the client must decompress the loaded file
     * @returns A reference to this file loader.
     */
    setClientDecompression(value: boolean): this {
        this.clientDecompression = value;
        return this;
    }

    /**
     * Aborts ongoing fetch requests.
     *
     * @return A reference to this instance.
     */
    abort(): this {
        this._abortController.abort();
        this._abortController = new AbortController();

        return this;
    }
}

/**
 * A watch service that watches for changes and events.
 *
 * (upstream: {@code WatchService<T> extends AutoCloseable} — the blocking
 * {@code poll(long, TimeUnit)} and {@code take()} methods return promises in this port,
 * and the timeout is taken in milliseconds instead of a (timeout, TimeUnit) pair)
 *
 * @param <T> The type of the events or changes this WatchService provides
 */
export interface WatchService<T> {
    /**
     * Retrieves and consumes the next batch of events.
     * Returns <code>null</code> if there are none.
     * @throws WatchService.ClosedException If the watch-service is closed
     */
    poll(): T[] | null;

    /**
     * Retrieves and consumes the next batch of events,
     * waiting if necessary up to the specified wait time if none are yet present.
     * Resolves <code>null</code> if the wait time elapsed without any events.
     * @throws WatchService.ClosedException (as promise-rejection) If the watch-service is
     * closed, or it is closed while waiting for the next event
     */
    poll(timeoutMs: number): Promise<T[] | null>;

    /**
     * Retrieves and consumes the next batch of events,
     * waiting if necessary until an event becomes available.
     * @throws WatchService.ClosedException (as promise-rejection) If the watch-service is
     * closed, or it is closed while waiting for the next event
     */
    take(): Promise<T[]>;

    /** upstream: AutoCloseable#close */
    close(): Promise<void>;
}

/**
 * Thrown when the WatchService is closed or gets closed when polling or while waiting for events
 * (upstream: {@code WatchService.ClosedException extends RuntimeException})
 */
class ClosedException extends Error {
    constructor(message?: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "ClosedException";
    }
}

export const WatchService = {
    ClosedException,
};

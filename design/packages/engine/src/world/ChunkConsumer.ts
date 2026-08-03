export interface ChunkConsumer<T> {
    /**
     * (upstream interface-default: returns {@code true})
     */
    filter?(chunkX: number, chunkZ: number, lastModified: number): boolean;

    accept(chunkX: number, chunkZ: number, chunk: T): void;

    /**
     * (upstream interface-default: rethrows the exception)
     */
    fail?(chunkX: number, chunkZ: number, exception: Error): void;
}

export const ChunkConsumer = {
    /**
     * upstream: ChunkConsumer.ListOnly — a consumer that only lists chunks (never
     * loading them): filter forwards to the given callback and always returns false
     */
    listOnly<T>(
        accept: (chunkX: number, chunkZ: number, lastModified: number) => void,
    ): ChunkConsumer<T> {
        return {
            filter(chunkX: number, chunkZ: number, lastModified: number): boolean {
                accept(chunkX, chunkZ, lastModified);
                return false;
            },
            accept(_chunkX: number, _chunkZ: number, _chunk: T): void {
                throw new Error("Should never be called.");
            },
        };
    },
};

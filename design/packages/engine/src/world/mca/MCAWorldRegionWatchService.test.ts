import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WatchService } from "../../util/WatchService.js";
import { MCAWorldRegionWatchService } from "./MCAWorldRegionWatchService.js";

describe("MCAWorldRegionWatchService", () => {
    let tempDir: string;
    let service: MCAWorldRegionWatchService | null = null;

    function createTempDir(): string {
        tempDir = mkdtempSync(join(tmpdir(), "bluemap-watch-"));
        return tempDir;
    }

    /** waits until chokidar finished its initial scan, so subsequent changes are seen */
    async function watcherReady(watchService: MCAWorldRegionWatchService): Promise<void> {
        await new Promise<void>((resolve) => watchService["watcher"]!.once("ready", resolve));
    }

    afterEach(async () => {
        await service?.close();
        service = null;
        rmSync(tempDir, { recursive: true, force: true });
    });

    it("emits region-positions for created and changed region-files", { timeout: 15000 }, async () => {
        const regionFolder = createTempDir();
        service = new MCAWorldRegionWatchService(regionFolder);
        await watcherReady(service);

        const takePromise = service.take();
        writeFileSync(join(regionFolder, "r.1.-2.mca"), "data");

        const batch = await takePromise;
        expect(batch.map((pos) => pos.getX() + "," + pos.getY())).toEqual(["1,-2"]);

        // a modification of the same file emits the position again
        const nextTake = service.take();
        writeFileSync(join(regionFolder, "r.1.-2.mca"), "more data");
        const nextBatch = await nextTake;
        expect(nextBatch.map((pos) => pos.getX() + "," + pos.getY())).toEqual(["1,-2"]);
    });

    it("coalesces pending events and ignores non-region files", { timeout: 15000 }, async () => {
        const regionFolder = createTempDir();
        service = new MCAWorldRegionWatchService(regionFolder);
        await watcherReady(service);

        writeFileSync(join(regionFolder, "foo.txt"), "not a region");
        writeFileSync(join(regionFolder, "r.0.0.mca"), "a");
        writeFileSync(join(regionFolder, "r.0.0.mca"), "ab");
        writeFileSync(join(regionFolder, "r.0.0.mca"), "abc");

        // let the fs-events settle, then drain everything
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const drained: string[] = [];
        for (;;) {
            const batch = service.poll();
            if (batch === null) break;
            drained.push(...batch.map((pos) => pos.getX() + "," + pos.getY()));
        }

        // all events for the region-file collapsed onto its position, foo.txt ignored
        expect(drained).toEqual(["0,0"]);
    });

    it("poll(timeout) resolves null when no event arrives", { timeout: 15000 }, async () => {
        const regionFolder = createTempDir();
        service = new MCAWorldRegionWatchService(regionFolder);
        await watcherReady(service);

        expect(await service.poll(200)).toBeNull();
        expect(service.poll()).toBeNull();
    });

    it("close rejects waiting calls and closes the service", { timeout: 15000 }, async () => {
        const regionFolder = createTempDir();
        const closingService = new MCAWorldRegionWatchService(regionFolder);
        await watcherReady(closingService);

        const waiting = closingService.take();
        await closingService.close();

        await expect(waiting).rejects.toBeInstanceOf(WatchService.ClosedException);
        expect(() => closingService.poll()).toThrow(WatchService.ClosedException);
        await expect(closingService.take()).rejects.toBeInstanceOf(WatchService.ClosedException);
    });

    it(
        "starts reporting when the region-folder is created after watching started",
        { timeout: 20000 },
        async () => {
            const base = createTempDir();
            const regionFolder = join(base, "region");
            service = new MCAWorldRegionWatchService(regionFolder);

            const takePromise = service.take();
            mkdirSync(regionFolder);

            // keep touching the region-file until the (re-attached) watch picks it up
            const interval = setInterval(() => {
                writeFileSync(join(regionFolder, "r.5.6.mca"), String(Date.now()));
            }, 400);
            try {
                const batch = await takePromise;
                expect(batch.map((pos) => pos.getX() + "," + pos.getY())).toEqual(["5,6"]);
            } finally {
                clearInterval(interval);
            }
        },
    );
});

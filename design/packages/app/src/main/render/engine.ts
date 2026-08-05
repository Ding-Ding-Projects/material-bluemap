/**
 * Resolving the engine the orchestrator is about to run.
 *
 * This is the seam between render orchestration and the Java toolchain layer in
 * `../java/`. That layer already knows how to find a JDK, judge whether it is new
 * enough, download one when it is not, and locate the seven BlueMap jars in both a
 * packaged app and a checkout. None of that is reimplemented here; this only asks it
 * for the two things a render needs and turns its failures into the orchestrator's
 * shape.
 *
 * Decisions D17 and D18 put a second engine in the tree - the TypeScript mesher in
 * `packages/engine`. D17's Phase D parity gate closed on 2026-08-04 (byte-identical output
 * at both fixture sizes), but passing that gate does not itself move this seam: D17 was
 * amended the next day to keep the Java engine the standing default, and the mesher takes
 * over only through a later, separately verified switch decision. The resolver is a
 * function for exactly that reason: swapping which engine renders is a different
 * `resolveEngine`, not a change to the orchestrator - see `engine.test.ts` for the pin.
 */

import { ensureJava, NoUsableJavaError, resolveCliJar } from "../java/index.js";
import type { JarLookupOptions } from "../java/index.js";
import { EngineUnavailableError } from "./orchestrator.js";
import type { ResolvedEngine } from "./orchestrator.js";

export interface UpstreamEngineOptions {
    /** Electron's `userData`. Where a provisioned JDK is looked for and installed. */
    readonly dataDir: string;
    /** `process.resourcesPath` in a packaged app; omit in development. */
    readonly resourcesPath?: string | null;
    /**
     * Whether a missing JDK may be downloaded.
     *
     * Off by default, matching `ensureJava`. Two hundred megabytes leaving the machine
     * is a decision somebody makes; the caller turns this on once they have said yes.
     */
    readonly allowProvisioning?: boolean;
    readonly jarLookup?: JarLookupOptions;
}

/**
 * The engine that renders today: upstream BlueMap's CLI, on a real JVM.
 *
 * Both halves are resolved every time rather than cached. A JDK can be uninstalled and
 * a jar can be rebuilt between two renders, and a cached answer to either question is
 * a render that fails with a path that used to exist.
 */
export function upstreamJavaEngine(
    options: UpstreamEngineOptions,
): () => Promise<ResolvedEngine> {
    return async (): Promise<ResolvedEngine> => {
        // The jar first: it is a directory listing, where finding a JVM can mean
        // launching a process or downloading two hundred megabytes. Reporting "the
        // engine is not installed" without having spent that is the better order.
        let jar;
        try {
            jar = resolveCliJar(options.jarLookup ?? lookupFrom(options));
        } catch (error) {
            throw new EngineUnavailableError("jar", describe(error));
        }

        let java;
        try {
            java = await ensureJava({
                dataDir: options.dataDir,
                ...(options.allowProvisioning === undefined
                    ? {}
                    : { allowProvisioning: options.allowProvisioning }),
            });
        } catch (error) {
            if (error instanceof NoUsableJavaError) {
                throw new EngineUnavailableError("java", error.message);
            }
            throw new EngineUnavailableError("java", describe(error));
        }

        return {
            engine: "upstream-java",
            engineVersion: jar.version,
            enginePath: jar.path,
            javaExecutable: java.installation.executable,
            javaVersion: java.installation.version.version,
        };
    };
}

function lookupFrom(options: UpstreamEngineOptions): JarLookupOptions {
    return options.resourcesPath === undefined
        ? {}
        : { resourcesPath: options.resourcesPath };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

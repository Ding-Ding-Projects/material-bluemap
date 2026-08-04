/**
 * Sending a render somewhere other than this computer, without a second progress panel.
 *
 * `main/remote/orchestrator.ts` goes to real trouble to emit **the same** `RenderEvent`s a
 * local render emits, on the same channel, so that the same bar moves, the same log fills
 * and the same Cancel button works with no knowledge that a network was involved. The
 * interface can only keep that promise by not building a second path for it, so this is a
 * {@link WorldBridge} that wraps another one and changes exactly two of its methods:
 *
 * - `startRender` goes to the remote channel when the chosen location is a remote machine.
 * - `cancelRender` goes back to whichever channel started *that* render id.
 *
 * Everything else - the events, the interrupted list, the resume path, the consent read -
 * is the underlying bridge's, untouched. `RenderRunPanel` and `renderRun.ts` never learn
 * that any of this exists, which is the point: a second panel would be a second thing to
 * keep in step, and the one that got behind would be the one nobody was watching.
 *
 * ## Cancelling has to reach the container
 *
 * `cancelRemoteRender` asks the *remote daemon* to stop the container by name. Hanging up
 * the SSH connection would end the log and leave a JVM rendering into somebody's disk with
 * nothing holding a handle to it, so the ids started remotely are remembered here and their
 * cancellation is routed accordingly. An id this router never started is passed straight
 * through, because a render adopted from another window is the local orchestrator's.
 *
 * ## The engine is remembered, never invented
 *
 * A remote result carries no engine description - the `started` and `finished` events do -
 * so this listens on the same event stream and keeps the description each render reported.
 * When a render is refused before anything starts there is no engine and no success to
 * describe one for, so nothing has to be made up. The one remaining gap, a success whose
 * events were never seen, is filled with a label that says only what is actually known:
 * which machine it ran on.
 */

import type {
    EngineDescription,
    RenderEvent,
    RenderRequest,
    RenderResult,
    WorldBridge,
} from "../world/worldBridge.js";
import type { RemoteBridge, RemoteRenderResult, RemoteTarget } from "./remoteBridge.js";
import type { RunLocation } from "./runtimeChoice.js";

/** What the router asks, at the moment a render is started rather than when it was built. */
export interface RenderRoute {
    readonly location: RunLocation;
    /** The machine, when the location is `remote`. Null otherwise. */
    readonly target: RemoteTarget | null;
    /** Bytes the render is expected to need there, for the preflight's disk check. */
    readonly requiredBytes?: number;
}

export interface RenderRouter extends WorldBridge {
    /** True when a render started through this router is being run somewhere else. */
    isRemote(renderId: string): boolean;
    dispose(): void;
}

/**
 * Wraps a bridge so a render can be sent elsewhere.
 *
 * Returns the underlying bridge unchanged when there is nothing to route to, so a build
 * without the remote channel carries no extra layer at all rather than one that always
 * falls through.
 */
export function createRenderRouter(
    base: WorldBridge | null,
    remote: RemoteBridge | null,
    route: () => RenderRoute,
): RenderRouter | null {
    if (base === null) return null;

    const remoteIds = new Set<string>();
    const engines = new Map<string, EngineDescription>();

    const unsubscribe = base.onRenderEvent((event: RenderEvent) => {
        if (event.type === "started" || event.type === "finished") {
            engines.set(event.renderId, event.engine);
        }
    });

    /** The engine that actually ran, or a label that claims only what is known. */
    function engineFor(renderId: string, target: RemoteTarget | null): EngineDescription {
        const seen = engines.get(renderId);
        if (seen !== undefined) return seen;
        return {
            id: "upstream-java",
            label:
                target === null
                    ? "BlueMap engine, in a container on another machine"
                    : `BlueMap engine, in a container on ${target.host}`,
            // Deliberately empty rather than guessed. The panel shows the label; a version
            // number invented here would be indistinguishable from one the engine reported.
            version: "",
            javaVersion: null,
        };
    }

    function asRenderResult(
        answer: RemoteRenderResult,
        target: RemoteTarget | null,
    ): RenderResult {
        if (!answer.ok) {
            // `RemoteFailure` extends `RenderFailure`, so the failure banner, its detail
            // disclosure and its exit code all work with no special case. `settings` is
            // null because no local setting fixes "that host has no Docker".
            return {
                ok: false,
                renderId: answer.renderId,
                failure: {
                    code: answer.failure.code,
                    message: answer.failure.message,
                    settings: null,
                    detail: answer.failure.detail,
                    exitCode: answer.failure.exitCode,
                },
            };
        }
        remoteIds.add(answer.renderId);
        return {
            ok: true,
            renderId: answer.renderId,
            dataRoot: answer.dataRoot,
            mapIds: [...answer.mapIds],
            engine: engineFor(answer.renderId, target),
            durationMs: answer.durationMs,
        };
    }

    return {
        async startRender(request: RenderRequest): Promise<RenderResult> {
            const chosen = route();

            // A container on this computer is still the ordinary render channel; it only
            // needs to be told where to run. Falling through without setting this is what
            // made choosing Docker render locally anyway - the choice was made, shown as
            // made, and then dropped on the way to the main process, which is worse than
            // not offering it.
            if (chosen.location === "docker") {
                return await base.startRender({ ...request, runtime: "docker" });
            }

            if (chosen.location !== "remote" || remote === null || chosen.target === null) {
                // Explicit rather than absent. Absent already means local, but saying it
                // keeps the request honest about a choice somebody actually made.
                return await base.startRender({ ...request, runtime: "local" });
            }
            const target = chosen.target;
            const answer = await remote.startRemoteRender({
                ...request,
                target,
                ...(chosen.requiredBytes === undefined ? {} : { requiredBytes: chosen.requiredBytes }),
            });
            const result = asRenderResult(answer, target);
            // Recorded even for a failure, so a render that failed *there* is cancelled
            // there too if the panel's Cancel is pressed while the result is in flight.
            if (answer.renderId !== "") remoteIds.add(answer.renderId);
            return result;
        },

        async cancelRender(renderId: string): Promise<boolean> {
            if (remote !== null && remoteIds.has(renderId)) {
                return await remote.cancelRemoteRender(renderId);
            }
            return await base.cancelRender(renderId);
        },

        listRenders: () => base.listRenders(),
        renderEngine: (renderId) => base.renderEngine(renderId),
        activeRenders: () => base.activeRenders(),
        interruptedRenders: () => base.interruptedRenders(),
        resumeRender: (renderId, maps) => base.resumeRender(renderId, maps),
        dismissResume: (renderId) => base.dismissResume(renderId),
        onRenderEvent: (listener) => base.onRenderEvent(listener),
        readConsent: () => base.readConsent(),

        isRemote: (renderId) => remoteIds.has(renderId),
        dispose(): void {
            unsubscribe();
        },
    };
}

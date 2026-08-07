/**
 * Containers left running from an earlier session, and the offer to pick them back up.
 *
 * A containerised render outlives the window that started it: closing the app, or the
 * machine sleeping, does not stop a render running inside Docker or on a remote host. Left
 * alone, that container just sits there with nobody watching it. `main/runtime/ipc.ts`
 * registers the four channels this file wraps - `runtime:containers`, `runtime:reattach`,
 * `runtime:cancelContainer`, `runtime:dismissContainer` - and the preload exposes all four,
 * but nothing in this package ever called any of them: a render left running in a container
 * was invisible to every screen in the application.
 *
 * Once an offer is accepted, the render reports on the **render** channel like any other -
 * same list, same bar, same cancel button - which is why this file, like `resumeOffers.ts`
 * beside it, only has to get somebody from "there is a container out there" to "the render
 * list already knows about it".
 */

import { ref, type Ref } from "vue";

export type ContainerMode = "docker" | "remote";
export type ContainerState = "running" | "exited" | "absent" | "unknown";
export type ReattachAction = "attach" | "collect" | "unknown";

/** One container this app started and is no longer watching. */
export interface ContainerOffer {
    readonly renderId: string;
    readonly containerName: string;
    readonly mode: ContainerMode;
    /** The machine in words, so a person with two renders knows which one this is. */
    readonly where: string;
    readonly mapIds: readonly string[];
    readonly startedAt: string;
    readonly state: ContainerState;
    readonly action: ReattachAction;
    /** True when accepting will act rather than refuse. */
    readonly canResume: boolean;
    /** True when the honest advice is to start the render again instead. */
    readonly suggestRestart: boolean;
    readonly message: string;
}

/** A container named the way this app names them, with no record beside it. */
export interface StrayContainer {
    readonly containerName: string;
    readonly where: string;
    readonly message: string;
}

export interface ContainerScan {
    readonly offers: readonly ContainerOffer[];
    readonly strays: readonly StrayContainer[];
}

export type ReattachRefusalCode = "no-record" | "already-running" | "no-access" | "daemon-silent" | "nothing-to-collect";

export type ReattachResult =
    | { readonly ok: true; readonly renderId: string; readonly action: "attached" | "collected"; readonly dataRoot: string; readonly message: string }
    | { readonly ok: false; readonly renderId: string; readonly code: ReattachRefusalCode; readonly message: string };

/** What this surface asks of its environment. Restated rather than imported from the preload; see the file header. */
export interface ContainerOffersBridge {
    containerOffers(): Promise<ContainerScan>;
    reattachContainer(renderId: string): Promise<ReattachResult>;
    cancelContainer(renderId: string): Promise<boolean>;
    dismissContainer(renderId: string): Promise<boolean>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The bridge, or `null` when this build cannot offer a container back.
 *
 * All or nothing across the four, the same reasoning `resolveWorldBridge` uses for its own
 * required set: an offer with `reattachContainer` and no `dismissContainer` would draw a
 * "not now" button that throws the moment it is pressed.
 */
export function resolveContainerOffersBridge(): ContainerOffersBridge | null {
    const host = (globalThis as { worldlens?: Partial<ContainerOffersBridge> }).worldlens;
    if (host === undefined) return null;
    if (
        !isFunction(host.containerOffers) ||
        !isFunction(host.reattachContainer) ||
        !isFunction(host.cancelContainer) ||
        !isFunction(host.dismissContainer)
    ) {
        return null;
    }
    return {
        containerOffers: () => host.containerOffers!(),
        reattachContainer: (renderId) => host.reattachContainer!(renderId),
        cancelContainer: (renderId) => host.cancelContainer!(renderId),
        dismissContainer: (renderId) => host.dismissContainer!(renderId),
    };
}

export interface ContainerOffers {
    readonly offers: Ref<readonly ContainerOffer[]>;
    readonly strays: Ref<readonly StrayContainer[]>;
    readonly loading: Ref<boolean>;
    readonly failure: Ref<string | null>;
    /** The render id being acted on right now, or null. */
    readonly busy: Ref<string | null>;
    readonly available: boolean;

    load(): Promise<void>;
    /** Picks a container back up. A render this returns `ok: true` for now reports on the render channel. */
    accept(renderId: string): Promise<ReattachResult | null>;
    /** Stops a reattachable container without picking it up. */
    stop(renderId: string): Promise<boolean>;
    /** Forgets the record without touching whatever it points at. */
    dismiss(renderId: string): Promise<boolean>;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createContainerOffers(bridge: ContainerOffersBridge | null): ContainerOffers {
    const offers = ref<readonly ContainerOffer[]>([]);
    const strays = ref<readonly StrayContainer[]>([]);
    const loading = ref(false);
    const failure = ref<string | null>(null);
    const busy = ref<string | null>(null);

    async function load(): Promise<void> {
        if (bridge === null || loading.value) return;
        loading.value = true;
        try {
            const scan = await bridge.containerOffers();
            offers.value = scan.offers;
            strays.value = scan.strays;
            failure.value = null;
        } catch (error) {
            failure.value = describe(error);
        } finally {
            loading.value = false;
        }
    }

    function drop(renderId: string): void {
        offers.value = offers.value.filter((offer) => offer.renderId !== renderId);
    }

    async function accept(renderId: string): Promise<ReattachResult | null> {
        if (bridge === null || busy.value !== null) return null;
        busy.value = renderId;
        try {
            const result = await bridge.reattachContainer(renderId);
            // Taken off the offer list the moment it is accepted, whichever way it went:
            // `ok: true` means it now reports on the render channel, and a refusal means
            // asking again would only repeat the same refusal.
            if (result.ok) drop(renderId);
            return result;
        } catch (error) {
            failure.value = describe(error);
            return null;
        } finally {
            busy.value = null;
        }
    }

    async function stop(renderId: string): Promise<boolean> {
        if (bridge === null || busy.value !== null) return false;
        busy.value = renderId;
        try {
            const stopped = await bridge.cancelContainer(renderId);
            if (stopped) drop(renderId);
            return stopped;
        } catch (error) {
            failure.value = describe(error);
            return false;
        } finally {
            busy.value = null;
        }
    }

    async function dismiss(renderId: string): Promise<boolean> {
        if (bridge === null) return false;
        try {
            const done = await bridge.dismissContainer(renderId);
            if (done) drop(renderId);
            return done;
        } catch (error) {
            failure.value = describe(error);
            return false;
        }
    }

    return { offers, strays, loading, failure, busy, available: bridge !== null, load, accept, stop, dismiss };
}

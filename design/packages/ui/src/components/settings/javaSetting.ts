/**
 * The Java runtime setting: what the app found, or an honest account of why it cannot say.
 *
 * The app's own discovery is real and careful. `packages/app/src/main/java/discovery.ts`
 * looks at `JAVA_HOME`, then `java` on `PATH`, then the copy the app provisioned for
 * itself, **runs each candidate before believing it**, and keeps every rejection so a
 * failure can be explained ("JAVA_HOME points at Java 17") rather than merely announced
 * ("no Java found"). `describeDiscoveryFailure()` is that explanation.
 *
 * The desktop app reaches it over `java:runtime`, which {@link createJavaSetting} picks
 * up by feature detection. A browser tab has no main process to ask, so there the section
 * says **this build cannot report the Java runtime** and stops. It does not print a
 * version, guess from a path, or show an empty field that reads as "none installed" — a
 * settings row that reports a fact nobody measured is worse than one that admits the
 * question cannot be asked here, because the second can be acted on and the first cannot.
 *
 * One further fact is shown wherever it is available. `listRenders()` carries the engine
 * line each render ran with, so the most recent one can be quoted as what it is: a record
 * of a past render, not a reading of this machine now.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
    canListRenders,
    canReportJava,
    resolveSettingsBridge,
    type JavaRejectionReadout,
    type JavaRuntimeReadout,
    type RenderSummaryReadout,
    type SettingsBridge,
} from "./settingsBridge.js";

/**
 * What the section is currently able to say.
 *
 * `unsupported` is where a host without the preload lands, and it is a first-class answer
 * rather than an error: nothing failed, the question simply cannot be put from here.
 */
export type JavaSettingState = "unsupported" | "loading" | "found" | "missing" | "failed";

export interface JavaSettingOptions {
    /** Injected in tests. `undefined` means probe the preload, `null` means no bridge. */
    bridge?: SettingsBridge | null;
}

/** The engine a past render ran with, which is a record rather than a live reading. */
export interface LastRenderEngine {
    readonly renderId: string;
    readonly engine: string;
    readonly startedAt: string;
}

export interface JavaSetting {
    readonly state: Ref<JavaSettingState>;
    /** The discovery, when this build can ask for one. */
    readonly report: Ref<JavaRuntimeReadout | null>;
    /** The exception from a call that threw, stated rather than swallowed. */
    readonly failure: Ref<string | null>;
    /** The most recent render's engine line, when the render list can be read. */
    readonly lastRender: Ref<LastRenderEngine | null>;
    /** True when the preload exposes the discovery at all. */
    readonly supported: boolean;
    /** True when the render list can be read, which is the only Java evidence today. */
    readonly canQuoteRenders: boolean;
    /** Every candidate that was looked at and turned down, in the order tried. */
    readonly rejected: ComputedRef<readonly JavaRejectionReadout[]>;
    /** The feature version being required, when a report says so. */
    readonly required: ComputedRef<number | null>;

    load(): Promise<void>;
}

/**
 * Electron's `ipcRenderer.invoke` delivers a handler's rejection re-wrapped as
 * `Error invoking remote method 'java:runtime': Error: <message>`. The channel name and
 * the doubled `Error:` are plumbing, not the sentence the main process wrote, so they
 * are stripped before the row renders the message. Anything else passes through as is.
 */
function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
}

/**
 * One line per rejected candidate, in the shape `describeDiscoveryFailure()` prints them.
 *
 * Kept as a list rather than joined into a paragraph so the interface can render each on
 * its own row; the words are the main process's own, unedited, because "JAVA_HOME is set
 * to C:\jdk17 but there is no java executable there" is already the sentence somebody
 * needs and rewording it can only make it less exact.
 */
export function describeJavaRejections(report: JavaRuntimeReadout | null): string[] {
    if (report === null) return [];
    return report.rejected.map(
        (rejection) => `${rejection.source}: ${rejection.executable} — ${rejection.reason}`,
    );
}

/** `Java 25.0.3 (feature 25)` from a report, or null when there is no installation. */
export function describeJavaInstallation(report: JavaRuntimeReadout | null): string | null {
    const installation = report?.installation;
    if (installation === undefined || installation === null) return null;
    return `Java ${installation.version.version} (${installation.source})`;
}

/** The newest render, by start time. Null for an empty list. */
export function newestRender(
    summaries: readonly RenderSummaryReadout[],
): RenderSummaryReadout | null {
    let newest: RenderSummaryReadout | null = null;
    for (const summary of summaries) {
        if (newest === null || summary.startedAt > newest.startedAt) newest = summary;
    }
    return newest;
}

export function createJavaSetting(options: JavaSettingOptions = {}): JavaSetting {
    const bridge = options.bridge !== undefined ? options.bridge : resolveSettingsBridge();
    const supported = canReportJava(bridge);
    const canQuoteRenders = canListRenders(bridge);

    const state = ref<JavaSettingState>(supported ? "loading" : "unsupported");
    const report = ref<JavaRuntimeReadout | null>(null);
    const failure = ref<string | null>(null);
    const lastRender = ref<LastRenderEngine | null>(null);

    const rejected = computed<readonly JavaRejectionReadout[]>(() => report.value?.rejected ?? []);
    const required = computed<number | null>(() => report.value?.required ?? null);

    async function loadRenders(): Promise<void> {
        const list = bridge?.listRenders;
        if (typeof list !== "function") return;
        try {
            const newest = newestRender(await list());
            lastRender.value =
                newest === null
                    ? null
                    : { renderId: newest.renderId, engine: newest.engine, startedAt: newest.startedAt };
        } catch {
            // A render list that cannot be read is not a Java failure and must not be
            // reported as one. The section simply has one fewer fact to show.
            lastRender.value = null;
        }
    }

    async function load(): Promise<void> {
        // The render list is a separate, slower IPC and only decorates the section.
        // Discovery must not queue behind it: the state flips to `loading` before
        // anything is awaited, so the row shows a spinner immediately and the "Look
        // again" button's `loading` guard actually guards.
        const renders = loadRenders();

        const discover = bridge?.javaRuntime;
        if (typeof discover !== "function") {
            state.value = "unsupported";
            await renders;
            return;
        }

        state.value = "loading";
        failure.value = null;
        try {
            const answer = await discover();
            report.value = answer;
            state.value = answer.installation === null ? "missing" : "found";
        } catch (error) {
            report.value = null;
            failure.value = describe(error);
            state.value = "failed";
        }
        await renders;
    }

    return {
        state,
        report,
        failure,
        lastRender,
        supported,
        canQuoteRenders,
        rejected,
        required,
        load,
    };
}

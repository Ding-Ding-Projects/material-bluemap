/**
 * The seam between a search surface and the guided regular-expression builder.
 *
 * Every search field and both bulk-close actions accept a regular expression, and each one
 * wants the full guided builder anchored beside it rather than a distant page. The builder
 * itself lives in `src/search/`, so the shell declares the slot and the search module fills
 * it by calling `provide` once during start-up.
 *
 * Until something calls `provide`, `available` is false and a surface renders no builder
 * affordance at all. That is deliberate: a "Build the pattern" button that opens nothing
 * would be a decorative control pretending to work, which is worse than not offering one. The
 * raw pattern field, its validation and its two-way sync with the query still work either
 * way, because those belong to the surface rather than to the builder.
 */

export interface RegexBuilderRequest {
    /** The control the builder anchors to. It stays visually attached to this field. */
    readonly anchor: HTMLElement;
    /** The field the visitor was typing in, so focus can return to it on close. */
    readonly field: HTMLInputElement | HTMLTextAreaElement;
    readonly pattern: string;
    readonly flags: string;
    /** Current matching mode, so the provider can reopen the field without changing semantics. */
    readonly mode?: "plain" | "regex";
    /** Text the builder can preview matches against. Never leaves the browser. */
    readonly sample: string;
    /** Called on every edit, so the originating field and the builder stay in step. */
    readonly onChange: (next: { readonly pattern: string; readonly flags: string }) => void;
    readonly onClose?: () => void;
}

export interface RegexBuilderHandle {
    close(): void;
}

export interface RegexBuilderProvider {
    open(request: RegexBuilderRequest): RegexBuilderHandle;
}

export class RegexBuilderSlot {
    private provider: RegexBuilderProvider | null = null;
    private readonly listeners = new Set<() => void>();

    get available(): boolean {
        return this.provider !== null;
    }

    provide(provider: RegexBuilderProvider): void {
        this.provider = provider;
        for (const listener of [...this.listeners]) listener();
    }

    /** Notify a surface that a builder became available after it had already rendered. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    open(request: RegexBuilderRequest): RegexBuilderHandle | null {
        return this.provider?.open(request) ?? null;
    }
}

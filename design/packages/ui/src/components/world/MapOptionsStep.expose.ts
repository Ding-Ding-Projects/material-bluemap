/** The parent-owned route into MapOptionsStep's own filtered, grouped settings surface. */
export interface MapOptionsStepExpose {
    /** Reveals, scrolls to, focuses, and briefly highlights the exact setting. */
    revealField(path: string): Promise<boolean>;
}

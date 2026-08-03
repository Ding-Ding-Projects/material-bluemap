/**
 * Reactivity seam: upstream BlueMapWeb wraps its data objects with Vue's `reactive()` so
 * the UI observes mutations. The viewer package stays framework-free — the UI installs
 * its framework's reactive factory here at startup (before constructing the viewer).
 * Default is identity (no reactivity), which keeps the viewer usable standalone.
 */
export type ReactiveFactory = <T extends object>(target: T) => T;

let reactiveFactory: ReactiveFactory = (target) => target;

export function setReactiveFactory(factory: ReactiveFactory): void {
    reactiveFactory = factory;
}

export function makeReactive<T extends object>(target: T): T {
    return reactiveFactory(target);
}

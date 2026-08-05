import { MissingSqlDriverError } from "../Database.js";

/**
 * Dynamically imports an optional SQL driver package, turning "not installed" into a
 * {@link MissingSqlDriverError} naming the package — issue #32's explicit requirement
 * ("choosing an SQL storage with its driver absent produces a clear message naming the
 * missing package — not a stack trace") — instead of a raw `ERR_MODULE_NOT_FOUND`.
 *
 * `specifier` reaches the actual `import()` call through this function's own parameter,
 * never as a string literal written directly inside an `import(...)` expression at any
 * call site. That distinction is deliberate, not stylistic: esbuild only inlines a
 * dynamic import into its bundle when it can statically resolve the literal string
 * passed to `import()`; hand it an identifier instead — as every call here does, because
 * the literal only ever appears as an argument passed *into* this function — and esbuild
 * leaves it as a genuine runtime `import()` that Node resolves against `node_modules`
 * when (and only when) the code actually runs. That is what keeps `mysql2`, `pg` and
 * `sql.js` out of the packaged app's bundle unless a person actually configures an SQL
 * storage: the critical packaging constraint from commit e976ee9 (no native module may
 * enter the bundle graph) holds regardless, since none of the three ships native code —
 * this is what additionally keeps the *bundle size* honest for the common case where
 * nobody uses SQL storage at all.
 */
export async function loadOptionalModule<T>(
    specifier: string,
    packageName: string,
    dialectLabel: string,
): Promise<T> {
    try {
        return (await import(specifier)) as T;
    } catch (ex) {
        throw new MissingSqlDriverError(packageName, dialectLabel, { cause: ex });
    }
}

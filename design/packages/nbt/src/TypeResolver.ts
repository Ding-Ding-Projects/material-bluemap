import type { TypeToken } from "./TypeToken.js";
import type { IOException } from "./Exceptions.js";

export interface TypeResolver<T, B> {
    getBaseType(): TypeToken<B>;

    resolve(base: B): TypeToken<T>;

    getPossibleTypes(): Iterable<TypeToken<T>>;

    /**
     * Called when parsing the data against the base type (base is undefined) or against
     * the resolved type (base is set) threw an exception.<br>
     * Can be used to recover from errors with some default value.<br>
     * If not implemented, the exception is rethrown.
     * (Upstream splits this into two default-methods onException(ex) / onException(ex, base).)
     */
    onException?(parseException: IOException, base?: B): T;
}

import type { Key } from "./Key.js";

export interface Keyed {
    getKey(): Key;
}

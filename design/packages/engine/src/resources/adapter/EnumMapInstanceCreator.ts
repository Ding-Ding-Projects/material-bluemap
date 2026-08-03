/**
 * upstream: adapter/EnumMapInstanceCreator.java — tells gson to back an
 * {@code EnumMap<K, V>} field with an actual EnumMap. The enum-ports have no
 * reflective Map support, so this creates a plain Map; note that a java EnumMap
 * iterates in enum-declaration order while a JS Map iterates in insertion order —
 * adapters that fill the map in a defined order (e.g. the Face-map of a model
 * element) keep that order themselves.
 */
export class EnumMapInstanceCreator<K, V> {
    createInstance(): Map<K, V> {
        return new Map<K, V>();
    }
}

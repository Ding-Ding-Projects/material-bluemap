import type { Keyed } from "./Keyed.js";

/**
 * Upstream uses a weak string-interner (StringUtil.intern) so that interned keys can be
 * compared by identity. JavaScript strings already compare by value with {@code ===},
 * which gives the same semantics, so interning is a no-op here.
 */
function intern(string: string): string {
    return string;
}

export class Key implements Keyed {
    static readonly MINECRAFT_NAMESPACE: string = "minecraft";
    static readonly BLUEMAP_NAMESPACE: string = "bluemap";

    private readonly namespace: string;
    private readonly value: string;
    private readonly formatted: string;

    constructor(formatted: string);
    constructor(namespace: string, value: string);
    constructor(namespaceOrFormatted: string, value?: string) {
        if (value === undefined) {
            const formatted = namespaceOrFormatted;
            let namespace = Key.MINECRAFT_NAMESPACE;
            let val = formatted;
            const namespaceSeparator = formatted.indexOf(":");
            if (namespaceSeparator > 0) {
                namespace = formatted.substring(0, namespaceSeparator);
                val = formatted.substring(namespaceSeparator + 1);
            }

            this.namespace = intern(namespace);
            this.value = intern(val);
        } else {
            this.namespace = intern(namespaceOrFormatted);
            this.value = intern(value);
        }
        this.formatted = intern(this.namespace + ":" + this.value);
    }

    getNamespace(): string {
        return this.namespace;
    }

    getValue(): string {
        return this.value;
    }

    getFormatted(): string {
        return this.formatted;
    }

    getKey(): Key {
        return this;
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Key)) return false;
        return this.formatted === o.formatted;
    }

    hashCode(): number {
        // Java String#hashCode of the formatted representation
        let h = 0;
        for (let i = 0; i < this.formatted.length; i++) {
            h = (Math.imul(31, h) + this.formatted.charCodeAt(i)) | 0;
        }
        return h;
    }

    toString(): string {
        return this.formatted;
    }

    static parse(formatted: string): Key;
    static parse(formatted: string, defaultNamespace: string): Key;
    static parse(formatted: string, defaultNamespace?: string): Key {
        if (defaultNamespace === undefined) return new Key(formatted);

        let namespace = defaultNamespace;
        let value = formatted;
        const namespaceSeparator = formatted.indexOf(":");
        if (namespaceSeparator > 0) {
            namespace = formatted.substring(0, namespaceSeparator);
            value = formatted.substring(namespaceSeparator + 1);
        }

        return new Key(namespace, value);
    }

    static minecraft(value: string): Key {
        return new Key(Key.MINECRAFT_NAMESPACE, value);
    }

    static bluemap(value: string): Key {
        return new Key(Key.BLUEMAP_NAMESPACE, value);
    }
}

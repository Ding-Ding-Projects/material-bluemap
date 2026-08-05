/**
 * upstream: storage/sql/PageSpliterator.java
 *
 * Upstream is a lazy {@code Spliterator<T>} that pulls one page at a time from a
 * caller-supplied `IntFunction<T[]>` and keeps asking for the next page until one comes
 * back null or empty — so `SQLStorage#mapIds` and `SQLGridStorage#stream` never have to
 * hold a whole (potentially huge) map's tiles in memory at once just to iterate them.
 *
 * Every consumer of a paged result in this port already collects the whole thing into
 * an array before returning (see {@link GridStorage.stream} and {@link Storage.mapIds}:
 * "upstream returns a lazy Stream; the port collects it" is the port's standing
 * deviation, applied consistently across every storage backend). So rather than port a
 * lazy `Spliterator`/iterator protocol that nothing here would actually iterate lazily,
 * `collectPages` reproduces the one behavior that matters — bounded-memory paging, not
 * "load everything in one query" — as a plain async loop.
 *
 * One deliberate improvement over upstream's `refill()`: upstream always requests one
 * more page after a short (but non-empty) one, discovering the end only when that next
 * page comes back empty. Since every page here already reports its own true length (the
 * dialect's `LIMIT`/`OFFSET` statements never return more than asked, and `count` is
 * always an exact page size), a page shorter than `pageSize` unambiguously *is* the
 * last one, so this stops one round-trip earlier. Nothing about the final result differs.
 */
export async function collectPages<T>(
    pageSize: number,
    fetchPage: (start: number, count: number) => Promise<readonly T[]>,
): Promise<T[]> {
    const all: T[] = [];
    for (let page = 0; ; page++) {
        const batch = await fetchPage(page * pageSize, pageSize);
        if (batch.length === 0) break;
        all.push(...batch);
        if (batch.length < pageSize) break;
    }
    return all;
}

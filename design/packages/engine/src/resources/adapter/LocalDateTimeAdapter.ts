import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { JsonParseError, nextString, type JsonValue } from "./JsonMapper.js";

/**
 * upstream: adapter/LocalDateTimeAdapter.java — parses/writes
 * {@code DateTimeFormatter.ISO_OFFSET_DATE_TIME} (e.g. "2011-11-24T22:00:00+00:00").
 * Ported to js {@code Date}; note upstream drops the offset when converting to
 * LocalDateTime, while Date applies it — since all values compared against each other
 * (the mojang version-manifest) carry the same +00:00 offset, ordering is identical.
 */
export class LocalDateTimeAdapter implements JsonAdapter<Date> {
    write(value: Date): JsonValue {
        return value.toISOString();
    }

    read(json: JsonValue): Date {
        const value = nextString(json);
        // ISO_OFFSET_DATE_TIME requires date, time and offset parts
        if (!/^\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value))
            throw new JsonParseError("Text '" + value + "' could not be parsed");
        const date = new Date(value);
        if (Number.isNaN(date.getTime()))
            throw new JsonParseError("Text '" + value + "' could not be parsed");
        return date;
    }
}

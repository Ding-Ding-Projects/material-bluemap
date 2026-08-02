/**
 * A Strategy for converting a field-name into a String used as an NBT-name for
 * (de)serialization of the given field.
 * (Upstream operates on java.lang.reflect.Field; the port receives the schema
 * property-name directly.)
 */
export type NamingStrategy = (fieldName: string) => string;

const LETTER = /\p{L}/u;
const UPPER_CASE_LETTER = /\p{Lu}/u;

/**
 * Splits a String in camelCase into its separate words.
 */
export function splitCamelCase(input: string): string[] {
    const result: string[] = [];
    let start = 0;
    for (let i = 1; i < input.length; i++) {
        const c = input.charAt(i);
        if (UPPER_CASE_LETTER.test(c)) {
            result.push(input.substring(start, i));
            start = i;
        }
    }
    result.push(input.substring(start));
    return result;
}

/**
 * Finds the first letter of a string and transforms it using the given operation.
 * @return The string with the first letter replaced using the given operation
 */
export function transformFirstLetter(input: string, operation: (letter: string) => string): string {
    for (let i = 0; i < input.length; i++) {
        const c = input.charAt(i);
        if (!LETTER.test(c)) continue;
        return input.substring(0, i) + operation(c) + input.substring(i + 1);
    }

    // no letters found
    return input;
}

export const NamingStrategy = {
    /**
     * A NamingStrategy which does no conversion, using the field-name directly.
     */
    FIELD_NAME: ((fieldName) => fieldName) as NamingStrategy,

    /**
     * A NamingStrategy for all-lowercase nbt-names.
     */
    LOWER_CASE: ((fieldName) => fieldName.toLowerCase()) as NamingStrategy,

    /**
     * A NamingStrategy for ALL-UPPERCASE nbt-names.
     */
    UPPER_CASE: ((fieldName) => fieldName.toUpperCase()) as NamingStrategy,

    /**
     * A NamingStrategy for UpperCamelCase nbt-names.
     * <p><i>(Field-Names are expected to be in lowerCamelCase)</i></p>
     */
    UPPER_CAMEL_CASE: ((fieldName) =>
        transformFirstLetter(fieldName, (c) => c.toUpperCase())) as NamingStrategy,

    /**
     * Creates a NamingStrategy for lowercase-names-with-a-delimiter nbt-names.
     * <p><i>(Field-Names are expected to be in lowerCamelCase)</i></p>
     */
    lowerCaseWithDelimiter(delimiter: string): NamingStrategy {
        return (fieldName) => splitCamelCase(fieldName).join(delimiter).toLowerCase();
    },

    /**
     * Creates a NamingStrategy for UPPERCASE-NAMES-WITH-A-DELIMITER nbt-names.
     * <p><i>(Field-Names are expected to be in lowerCamelCase)</i></p>
     */
    upperCaseWithDelimiter(delimiter: string): NamingStrategy {
        return (fieldName) => splitCamelCase(fieldName).join(delimiter).toUpperCase();
    },
} as const;

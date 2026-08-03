/**
 * Error classes mirroring the Java exception types thrown by BlueNBT, so that
 * ported catch-semantics stay intact (e.g. LenientListAdapter only recovers
 * from {@link IOException}s while state-errors keep propagating).
 */

export class IOException extends Error {
    constructor(message?: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "IOException";
    }
}

export class EOFException extends IOException {
    constructor(message?: string) {
        super(message);
        this.name = "EOFException";
    }
}

export class UTFDataFormatException extends IOException {
    constructor(message?: string) {
        super(message);
        this.name = "UTFDataFormatException";
    }
}

export class IllegalStateException extends Error {
    constructor(message?: string) {
        super(message);
        this.name = "IllegalStateException";
    }
}

export class IllegalArgumentException extends Error {
    constructor(message?: string) {
        super(message);
        this.name = "IllegalArgumentException";
    }
}

export class NumberFormatException extends IllegalArgumentException {
    constructor(message?: string) {
        super(message);
        this.name = "NumberFormatException";
    }
}

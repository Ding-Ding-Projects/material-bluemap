/**
 * upstream: util/Tristate.java — a Java enum with per-constant method-overrides
 * (TRUE / UNDEFINED / FALSE); ported as a class with three static instances, the
 * per-constant overrides folded into instance-checks. Java's lazy
 * {@code Supplier}/{@code BooleanSupplier} overloads are kept: the supplier is only
 * invoked on the branches where upstream invokes it.
 */
export class Tristate {
    static readonly TRUE = new Tristate("TRUE", true);
    static readonly UNDEFINED = new Tristate("UNDEFINED", false);
    static readonly FALSE = new Tristate("FALSE", false);

    private readonly value: boolean;
    private negative!: Tristate;
    private readonly enumName: string;

    static {
        Tristate.TRUE.negative = Tristate.FALSE;
        Tristate.UNDEFINED.negative = Tristate.UNDEFINED;
        Tristate.FALSE.negative = Tristate.TRUE;
    }

    private constructor(name: string, value: boolean) {
        this.enumName = name;
        this.value = value;
    }

    getOr(other: Tristate): Tristate;
    /** upstream: getOr(BooleanSupplier) */
    getOr(other: () => boolean): boolean;
    getOr(defaultValue: boolean): boolean;
    getOr(other: Tristate | (() => boolean) | boolean): Tristate | boolean {
        // UNDEFINED overrides all three getOr variants to yield the fallback
        if (this === Tristate.UNDEFINED) {
            if (other instanceof Tristate) return other;
            if (typeof other === "function") return other();
            return other;
        }

        if (other instanceof Tristate) return this;
        return this.value;
    }

    negated(): Tristate {
        return this.negative;
    }

    /**
     * upstream: the abstract {@code and(Supplier<Tristate>)} with per-constant
     * overrides, plus the {@code and(Tristate)} convenience-overload delegating to it
     */
    and(other: Tristate | (() => Tristate)): Tristate {
        // FALSE: and(other) -> this (other is never evaluated)
        if (this === Tristate.FALSE) return this;

        const result = other instanceof Tristate ? other : other();

        // TRUE: and(other) -> other.get()
        if (this === Tristate.TRUE) return result;

        // UNDEFINED: and(other) -> other.get() == FALSE ? FALSE : this
        return result === Tristate.FALSE ? Tristate.FALSE : this;
    }

    /**
     * upstream: the abstract {@code or(Supplier<Tristate>)} with per-constant
     * overrides, plus the {@code or(Tristate)} convenience-overload delegating to it
     */
    or(other: Tristate | (() => Tristate)): Tristate {
        // TRUE: or(other) -> this (other is never evaluated)
        if (this === Tristate.TRUE) return this;

        const result = other instanceof Tristate ? other : other();

        // FALSE: or(other) -> other.get()
        if (this === Tristate.FALSE) return result;

        // UNDEFINED: or(other) -> other.get() == TRUE ? TRUE : this
        return result === Tristate.TRUE ? Tristate.TRUE : this;
    }

    /** Java Enum#name() */
    name(): string {
        return this.enumName;
    }

    toString(): string {
        return "Tristate." + this.name();
    }

    static valueOf(value: boolean): Tristate {
        return value ? Tristate.TRUE : Tristate.FALSE;
    }
}

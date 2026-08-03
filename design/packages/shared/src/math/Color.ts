const fr = Math.fround;

/**
 * Mutable, allocation-free color.
 *
 * upstream: util/math/Color.java — `r`, `g`, `b` and `a` are java `float`s, so every
 * blend step rounds to 32-bit before the next one runs. `Math.fround` marks each of those
 * steps: this color is what the mesher accumulates per block and what the lowres tiles are
 * built from, so a double intermediate that is only rounded at the end changes pixels
 * (see docs/deviations.md).
 *
 * Note: upstream Java has both a public field {@code premultiplied} and a method
 * {@code premultiplied()}; JavaScript cannot have both on one class, so the boolean
 * field is named {@code isPremultiplied} here while the method keeps its upstream
 * name (all call sites in the engine use the method form).
 */
export class Color {
    r: number = 0;
    g: number = 0;
    b: number = 0;
    a: number = 0;
    isPremultiplied: boolean = false;

    set(r: number, g: number, b: number, a: number, premultiplied: boolean): Color;
    set(color: Color): Color;
    set(color: number): Color;
    set(color: number, premultiplied: boolean): Color;
    set(
        colorOrR: Color | number,
        gOrPremultiplied?: number | boolean,
        b?: number,
        a?: number,
        premultiplied?: boolean
    ): Color {
        if (colorOrR instanceof Color) {
            const color = colorOrR;
            this.r = color.r;
            this.g = color.g;
            this.b = color.b;
            this.a = color.a;
            this.isPremultiplied = color.isPremultiplied;
            return this;
        }

        if (typeof gOrPremultiplied === "number") {
            this.r = fr(colorOrR);
            this.g = fr(gOrPremultiplied);
            this.b = fr(b as number);
            this.a = fr(a as number);
            this.isPremultiplied = premultiplied as boolean;
            return this;
        }

        const color = colorOrR | 0;
        this.r = fr(((color >> 16) & 0xff) / 255);
        this.g = fr(((color >> 8) & 0xff) / 255);
        this.b = fr((color & 0xff) / 255);
        this.a = fr(((color >> 24) & 0xff) / 255);
        this.isPremultiplied = gOrPremultiplied ?? false;
        return this;
    }

    getInt(): number {
        const r = Math.trunc(fr(this.r * 255)) & 0xff;
        const g = Math.trunc(fr(this.g * 255)) & 0xff;
        const b = Math.trunc(fr(this.b * 255)) & 0xff;
        const a = Math.trunc(fr(this.a * 255)) & 0xff;
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    add(color: Color): Color {
        if (color.a < 1 && !color.isPremultiplied) {
            throw new Error("Can only add premultiplied colors with alpha!");
        }

        this.premultiplied();

        this.r = fr(this.r + color.r);
        this.g = fr(this.g + color.g);
        this.b = fr(this.b + color.b);
        this.a = fr(this.a + color.a);

        return this;
    }

    /** upstream takes an `int` divisor */
    div(divisor: number): Color {
        this.premultiplied();

        const p = fr(1 / divisor);
        this.r = fr(this.r * p);
        this.g = fr(this.g * p);
        this.b = fr(this.b * p);
        this.a = fr(this.a * p);

        return this;
    }

    multiply(color: Color): Color {
        if (color.isPremultiplied) this.premultiplied();
        else this.straight();

        this.r = fr(this.r * color.r);
        this.g = fr(this.g * color.g);
        this.b = fr(this.b * color.b);
        this.a = fr(this.a * color.a);

        return this;
    }

    overlay(color: Color): Color {
        if (color.a < 1 && !color.isPremultiplied)
            throw new Error("Can only overlay premultiplied colors with alpha!");

        this.premultiplied();

        const p = fr(1 - color.a);
        this.a = fr(fr(p * this.a) + color.a);
        this.r = fr(fr(p * this.r) + color.r);
        this.g = fr(fr(p * this.g) + color.g);
        this.b = fr(fr(p * this.b) + color.b);

        return this;
    }

    underlay(color: Color): Color {
        if (color.a < 1 && !color.isPremultiplied)
            throw new Error("Can only underlay premultiplied colors with alpha!");

        this.premultiplied();

        const p = fr(1 - this.a);
        this.a = fr(fr(p * color.a) + this.a);
        this.r = fr(fr(p * color.r) + this.r);
        this.g = fr(fr(p * color.g) + this.g);
        this.b = fr(fr(p * color.b) + this.b);

        return this;
    }

    flatten(): Color {
        if (this.a === 1) return this;

        if (this.isPremultiplied && this.a > 0) {
            const m = fr(1 / this.a);
            this.r = fr(this.r * m);
            this.g = fr(this.g * m);
            this.b = fr(this.b * m);
        }

        this.a = 1;

        return this;
    }

    premultiplied(): Color {
        if (!this.isPremultiplied) {
            this.r = fr(this.r * this.a);
            this.g = fr(this.g * this.a);
            this.b = fr(this.b * this.a);
            this.isPremultiplied = true;
        }
        return this;
    }

    straight(): Color {
        if (this.isPremultiplied) {
            if (this.a > 0) {
                const m = fr(1 / this.a);
                this.r = fr(this.r * m);
                this.g = fr(this.g * m);
                this.b = fr(this.b * m);
            }
            this.isPremultiplied = false;
        }
        return this;
    }

    /**
     * Parses the color from a string and sets it to this Color instance.
     * The value can be an integer in String-Format or a string in hexadecimal format prefixed with # (css-style: e.g. #f16 becomes #ff1166).
     * @param value The String to parse
     * @return The parsed Integer
     * @throws Error If the value is not formatted correctly or if there is no value present.
     */
    parse(value: string): Color {
        let val = value;
        if (val.charAt(0) === "#") {
            val = val.substring(1);
            if (val.length === 3) val = val + "f";
            if (val.length === 4)
                val =
                    "" +
                    val.charAt(0) +
                    val.charAt(0) +
                    val.charAt(1) +
                    val.charAt(1) +
                    val.charAt(2) +
                    val.charAt(2) +
                    val.charAt(3) +
                    val.charAt(3);
            if (val.length === 6) val = val + "ff";
            if (val.length !== 8) throw new Error("Invalid color format: '" + value + "'!");
            val = val.substring(6, 8) + val.substring(0, 6); // move alpha to front
            if (!/^[0-9a-fA-F]{8}$/.test(val)) throw new Error('For input string: "' + val + '"');
            return this.set(Number.parseInt(val, 16) | 0);
        }

        if (!/^[+-]?\d+$/.test(val)) throw new Error('For input string: "' + val + '"');
        let color = Number.parseInt(val, 10);
        if (color < -2147483648 || color > 2147483647)
            throw new Error('For input string: "' + val + '"');
        color = color | 0;
        if ((color & 0xff000000) === 0) color |= 0xff000000; // assume full alpha if not present
        return this.set(color);
    }

    toString(): string {
        return (
            "Color{" +
            "r=" + this.r + " (" + Math.trunc(fr(this.r * 255)) + ")" +
            ", g=" + this.g + " (" + Math.trunc(fr(this.g * 255)) + ")" +
            ", b=" + this.b + " (" + Math.trunc(fr(this.b * 255)) + ")" +
            ", a=" + this.a + " (" + Math.trunc(fr(this.a * 255)) + ")" +
            ", premultiplied=" + this.isPremultiplied +
            "}"
        );
    }
}

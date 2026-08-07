import { Color } from "@worldlens/shared";
import type { PNG } from "pngjs";

/**
 * upstream: util/BufferedImageUtil.java — pixel-inspection helpers over
 * java.awt.image.BufferedImage; ported over pngjs' PNG, whose pixel-data is always
 * 8-bit straight-alpha RGBA. That makes upstream's workaround for java bug 5051418
 * (readPixelDirect) and the isAlphaPremultiplied color-model branch unnecessary: a
 * decoded PNG never carries premultiplied alpha here.
 */
export const BufferedImageUtil = {
    halfTransparent(image: PNG): boolean {
        // upstream returns false early for OPAQUE/BITMASK transparency-models; pngjs
        // always exposes RGBA so the alpha-scan below covers those cases (an opaque
        // image simply finds no alpha between 0 and 1)
        const color = new Color();
        for (let x = 0; x < image.width; x++) {
            for (let y = 0; y < image.height; y++) {
                BufferedImageUtil.readPixel(image, x, y, color);
                if (color.a > 0 && color.a < 1) return true;
            }
        }
        return false;
    },

    averageColor(image: PNG): Color {
        const average = new Color();
        const color = new Color();
        let count = 0;
        for (let x = 0; x < image.width; x++) {
            for (let y = 0; y < image.height; y++) {
                BufferedImageUtil.readPixel(image, x, y, color);

                count++;
                average.add(color.premultiplied());
            }
        }
        average.div(count);
        return average;
    },

    readPixel(image: PNG, x: number, y: number, target: Color | null): Color {
        if (target == null) target = new Color();

        const i = (image.width * y + x) << 2;
        target.set(
            image.data[i]! / 255,
            image.data[i + 1]! / 255,
            image.data[i + 2]! / 255,
            image.data[i + 3]! / 255,
            false
        );

        return target;
    },
};

package de.bluecolored.bluemap.core.map.hires;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Dumps reference output of the real (upstream) ArrayTileModel + PRBMWriter so the
 * TypeScript port can be pinned against it byte-for-byte.
 *
 * Lives in the upstream package on purpose: ArrayTileModel's array fields and `size` are
 * package-private, and the reference dump wants to show the post-sort face order too.
 */
public class PrbmOracle {

    /** deterministic 32-bit LCG so the TS side can reproduce the very same model */
    private static int seed;
    private static int nextInt(int bound) {
        seed = seed * 1103515245 + 12345;
        int v = (seed >>> 16) & 0x7FFF;
        return v % bound;
    }
    private static float nextFloat() {
        return nextInt(20001) / 1000f - 10f;
    }

    public static void main(String[] args) throws IOException {
        dump("empty", empty());
        dump("single", single());
        dump("threeFacesUnsorted", threeFacesUnsorted());
        dump("transformed", transformed());
        dump("floatIntermediates", floatIntermediates());
        dump("mergeSort40", mergeSort40());
    }

    /**
     * A single face whose transform result differs depending on whether the
     * multiply-add chain is rounded to float after every operator (which Java does)
     * or accumulated in wider precision and rounded once (which a naive JS port does).
     */
    private static ArrayTileModel floatIntermediates() {
        ArrayTileModel m = new ArrayTileModel(1);
        int f = m.add(1);
        m.setPositions(f,
                0.7499656677246094f, -3.517979621887207f, -217.63333129882812f,
                0.0003674277104437351f, -0.004270222969353199f, -0.0012166306842118502f,
                1.276799201965332f, 95.83064270019531f, 0.0016251394990831614f);
        m.setMaterialIndex(f, 0);
        m.transform(f, 1,
                0.3499417304992676f, 0.09921848773956299f, -0.3815346956253052f,
                -0.9278327226638794f, -0.20076239109039307f, -0.0070441048592329025f,
                -6.990570068359375f, 13.897296905517578f, -0.4894551634788513f);
        m.sort();
        return m;
    }

    private static ArrayTileModel empty() {
        return new ArrayTileModel(0);
    }

    private static ArrayTileModel single() {
        ArrayTileModel m = new ArrayTileModel(4);
        int f = m.add(1);
        m.setPositions(f,
                0f, 0f, 0f,
                1f, 0f, 0f,
                0f, 1f, 0f);
        m.setUvs(f,
                0.0f, 0.0f,
                1.0f, 0.0f,
                0.0f, 1.0f);
        m.setAOs(f, 1f, 0.5f, 0.25f);
        m.setColor(f, 1f, 0.5f, 0.0f);
        m.setSunlight(f, 15);
        m.setBlocklight(f, 7);
        m.setMaterialIndex(f, 3);
        m.sort();
        return m;
    }

    private static ArrayTileModel threeFacesUnsorted() {
        ArrayTileModel m = new ArrayTileModel(2);
        int start = m.add(3);

        m.setPositions(start,
                0.1f, 0.2f, 0.3f,
                1.1f, 0.2f, 0.3f,
                0.1f, 1.2f, 0.3f);
        m.setUvs(start, 0.125f, 0.25f, 0.375f, 0.5f, 0.625f, 0.75f);
        m.setAOs(start, 0f, 0.5f, 1f);
        m.setColor(start, 0.1f, 0.2f, 0.3f);
        m.setSunlight(start, 15);
        m.setBlocklight(start, 0);
        m.setMaterialIndex(start, 7);

        m.setPositions(start + 1,
                -1.5f, 2.25f, -3.75f,
                4.5f, -5.25f, 6.75f,
                -7.5f, 8.25f, -9.75f);
        m.setUvs(start + 1, 1f, 0f, 0f, 1f, 1f, 1f);
        m.setAOs(start + 1, 0.33333334f, 0.6666667f, 0.99999994f);
        m.setColor(start + 1, 0.99999994f, 0.33333334f, 0.6666667f);
        m.setSunlight(start + 1, 4);
        m.setBlocklight(start + 1, 12);
        m.setMaterialIndex(start + 1, 2);

        m.setPositions(start + 2,
                16f, 16f, 16f,
                0f, 16f, 16f,
                16f, 0f, 16f);
        m.setUvs(start + 2, 0f, 0f, 0.0625f, 0f, 0f, 0.0625f);
        m.setAOs(start + 2, 1f, 1f, 1f);
        m.setColor(start + 2, 0f, 0f, 0f);
        m.setSunlight(start + 2, 0);
        m.setBlocklight(start + 2, 15);
        m.setMaterialIndex(start + 2, 2);

        m.sort();
        return m;
    }

    private static ArrayTileModel transformed() {
        ArrayTileModel m = new ArrayTileModel(8);
        int start = m.add(4);
        for (int i = 0; i < 4; i++) {
            int f = start + i;
            m.setPositions(f,
                    i + 0.1f, i + 0.2f, i + 0.3f,
                    i + 1.1f, i + 1.2f, i + 1.3f,
                    i + 2.1f, i + 2.2f, i + 2.3f);
            m.setUvs(f, 0.1f, 0.2f, 0.3f, 0.4f, 0.5f, 0.6f);
            m.setAOs(f, 0.2f, 0.4f, 0.8f);
            m.setColor(f, 0.9f, 0.8f, 0.7f);
            m.setSunlight(f, i * 3);
            m.setBlocklight(f, 15 - i * 3);
            m.setMaterialIndex(f, (i % 2) + 1);
        }

        m.translate(start, 4, 0.5f, -0.25f, 1.75f);
        m.scale(start, 4, 0.0625f, 2f, -1f);
        m.rotate(start, 2, 22.5f, 0f, 1f, 0f);
        m.rotateXYZ(start, 4, 15f, 30f, 45f);
        m.rotateZYX(start + 1, 2, -10f, 20f, -30f);
        m.rotateYXZ(start, 3, 12.5f, -7.5f, 100f);
        m.transform(start, 4,
                1.5f, 0.25f, -0.75f,
                0f, 2f, 0.5f,
                -1f, 0.125f, 3f);
        m.transform(start, 4,
                0.5f, 0f, 0f, 1f,
                0f, 0.5f, 0f, 2f,
                0f, 0f, 0.5f, 3f,
                0f, 0f, 0f, 1f);
        m.invertOrientation(start + 1);

        m.sort();
        return m;
    }

    private static ArrayTileModel mergeSort40() {
        seed = 987654321;
        ArrayTileModel m = new ArrayTileModel(1);
        int start = m.add(40);
        for (int i = 0; i < 40; i++) {
            int f = start + i;
            m.setPositions(f,
                    nextFloat(), nextFloat(), nextFloat(),
                    nextFloat(), nextFloat(), nextFloat(),
                    nextFloat(), nextFloat(), nextFloat());
            m.setUvs(f,
                    nextFloat(), nextFloat(),
                    nextFloat(), nextFloat(),
                    nextFloat(), nextFloat());
            m.setAOs(f, nextInt(101) / 100f, nextInt(101) / 100f, nextInt(101) / 100f);
            m.setColor(f, nextInt(101) / 100f, nextInt(101) / 100f, nextInt(101) / 100f);
            m.setSunlight(f, nextInt(16));
            m.setBlocklight(f, nextInt(16));
            m.setMaterialIndex(f, nextInt(5));
        }
        m.sort();
        return m;
    }

    private static void dump(String name, ArrayTileModel model) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (PRBMWriter writer = new PRBMWriter(out)) {
            writer.write(model);
        }

        StringBuilder mi = new StringBuilder();
        for (int i = 0; i < model.size; i++) {
            if (i > 0) mi.append(',');
            mi.append(model.materialIndex[i]);
        }

        StringBuilder pos = new StringBuilder();
        for (int i = 0; i < model.size * ArrayTileModel.FI_POSITION; i++) {
            if (i > 0) pos.append(',');
            pos.append(Float.floatToIntBits(model.position[i]));
        }

        System.out.println("### " + name);
        System.out.println("size=" + model.size);
        System.out.println("materialIndex=" + mi);
        System.out.println("positionBits=" + pos);
        System.out.println("prbm=" + toHex(out.toByteArray()));
        System.out.println();
    }

    private static String toHex(byte[] data) {
        StringBuilder sb = new StringBuilder(data.length * 2);
        for (byte b : data) sb.append(String.format("%02x", b));
        return sb.toString();
    }

}

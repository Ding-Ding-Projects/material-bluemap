import com.flowpowered.math.TrigMath;

/** Dumps flow-math's table-quantised sin/cos for the angles the mesher actually asks for. */
public class TrigOracle {
    public static void main(String[] args) {
        System.out.println("SIN_CONVERSION_FACTOR_CHECK=" + (4194304.0 / (Math.PI * 2)));
        double[] degrees = {
                0, 22.5, -22.5, 45, 90, 180, 270, 360, 15, 30, 12.5, -7.5, 100, -10, 20, -30,
                1, 2, 3, 7.5, 67.5, 112.5, 135, 157.5, 999.75, -1234.5
        };
        for (double deg : degrees) {
            double half = Math.toRadians(deg) * 0.5;
            System.out.println(
                    "deg=" + deg
                            + " half=" + Double.doubleToLongBits(half)
                            + " sin=" + Float.floatToIntBits(TrigMath.sin(half))
                            + " cos=" + Float.floatToIntBits(TrigMath.cos(half))
                            + " mathSin=" + Float.floatToIntBits((float) Math.sin(half))
                            + " mathCos=" + Float.floatToIntBits((float) Math.cos(half)));
        }
    }
}

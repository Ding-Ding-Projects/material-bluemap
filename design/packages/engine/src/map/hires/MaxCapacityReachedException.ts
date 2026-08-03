/** upstream: map/hires/MaxCapacityReachedException.java */
export class MaxCapacityReachedException extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MaxCapacityReachedException";
    }
}

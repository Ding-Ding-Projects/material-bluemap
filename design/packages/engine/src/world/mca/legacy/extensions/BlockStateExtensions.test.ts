import { describe, expect, it } from "vitest";
import { BlockState } from "../../../BlockState.js";
import type { BlockStateAccess } from "./BlockStateExtension.js";
import { applyLegacyExtensions } from "./BlockStateExtensions.js";

function bs(serialized: string): BlockState {
    return BlockState.fromString(serialized);
}

/** neighbor-access backed by a "x,y,z" -> BlockState map; everything else is AIR */
function accessOf(blocks: Record<string, BlockState>): BlockStateAccess {
    return (x, y, z) => blocks[x + "," + y + "," + z] ?? BlockState.AIR;
}

function props(state: BlockState): Record<string, string> {
    return Object.fromEntries(state.getProperties());
}

describe("applyLegacyExtensions", () => {
    it("leaves unaffected block-states untouched (same instance)", () => {
        const stone = bs("minecraft:stone[]");
        expect(applyLegacyExtensions(stone, 0, 0, 0, accessOf({}))).toBe(stone);
    });

    it("connects wooden fences to same blocks and culling blocks, but not to air", () => {
        const fence = bs("minecraft:fence[]");
        const world = accessOf({
            "0,0,-1": bs("minecraft:fence[]"), // north: same -> connect
            "1,0,0": bs("minecraft:stone[]"), // east: culling -> connect
            "-1,0,0": bs("minecraft:oak_sapling[]"), // west: not culling -> no connect
            // south: air -> no connect
        });

        const result = applyLegacyExtensions(fence, 0, 0, 0, world);
        expect(props(result)).toEqual({
            north: "true",
            east: "true",
            south: "false",
            west: "false",
        });
    });

    it("connects tripwire only to tripwire (plain ConnectExtension)", () => {
        const tripwire = bs("minecraft:tripwire[]");
        const world = accessOf({
            "0,0,-1": bs("minecraft:tripwire[]"),
            "1,0,0": bs("minecraft:stone[]"), // culling does NOT connect tripwire
        });

        const result = applyLegacyExtensions(tripwire, 0, 0, 0, world);
        expect(props(result)).toEqual({
            north: "true",
            east: "false",
            south: "false",
            west: "false",
        });
    });

    it("marks grass below snow as snowy", () => {
        const grass = bs("minecraft:grass[]");
        const snowy = applyLegacyExtensions(
            grass,
            3,
            64,
            2,
            accessOf({ "3,65,2": bs("minecraft:snow_layer[layers=1]") }),
        );
        expect(snowy.getProperties().get("snowy")).toBe("true");
        expect(snowy.getId().getFormatted()).toBe("minecraft:grass");

        const bare = applyLegacyExtensions(grass, 3, 64, 2, accessOf({}));
        expect(bare.getProperties().get("snowy")).toBe("false");
    });

    it("completes door-halves from the other half", () => {
        const lower = bs("minecraft:wooden_door[half=lower,facing=east,open=true]");
        const upper = bs("minecraft:wooden_door[half=upper,hinge=right,powered=true]");

        const extendedLower = applyLegacyExtensions(lower, 0, 0, 0, accessOf({ "0,1,0": upper }));
        expect(props(extendedLower)).toEqual({
            half: "lower",
            facing: "east",
            open: "true",
            hinge: "right",
            powered: "true",
        });

        const extendedUpper = applyLegacyExtensions(upper, 0, 1, 0, accessOf({ "0,0,0": lower }));
        expect(props(extendedUpper)).toEqual({
            half: "upper",
            hinge: "right",
            powered: "true",
            facing: "east",
            open: "true",
        });
    });

    describe("stair shapes", () => {
        const stairs = (facing: string) =>
            bs("minecraft:oak_stairs[facing=" + facing + ",half=bottom]");

        it("straight without stair neighbors", () => {
            const result = applyLegacyExtensions(stairs("east"), 0, 0, 0, accessOf({}));
            expect(result.getProperties().get("shape")).toBe("straight");
        });

        it("outer corners from the stairs behind", () => {
            // back (towards facing, east) turns north = facing.left() -> outer_left
            const outerLeft = applyLegacyExtensions(
                stairs("east"),
                0,
                0,
                0,
                accessOf({ "1,0,0": stairs("north") }),
            );
            expect(outerLeft.getProperties().get("shape")).toBe("outer_left");

            const outerRight = applyLegacyExtensions(
                stairs("east"),
                0,
                0,
                0,
                accessOf({ "1,0,0": stairs("south") }),
            );
            expect(outerRight.getProperties().get("shape")).toBe("outer_right");
        });

        it("inner corners from the stairs in front", () => {
            const innerLeft = applyLegacyExtensions(
                stairs("east"),
                0,
                0,
                0,
                accessOf({ "-1,0,0": stairs("north") }),
            );
            expect(innerLeft.getProperties().get("shape")).toBe("inner_left");

            const innerRight = applyLegacyExtensions(
                stairs("east"),
                0,
                0,
                0,
                accessOf({ "-1,0,0": stairs("south") }),
            );
            expect(innerRight.getProperties().get("shape")).toBe("inner_right");
        });

        it("stays straight when the corner is continued by an equal stair", () => {
            const result = applyLegacyExtensions(
                stairs("east"),
                0,
                0,
                0,
                accessOf({ "1,0,0": stairs("north"), "0,0,1": stairs("east") }),
            );
            expect(result.getProperties().get("shape")).toBe("straight");
        });

        it("stays straight when the half does not match", () => {
            const result = applyLegacyExtensions(
                stairs("east"),
                0,
                0,
                0,
                accessOf({ "1,0,0": bs("minecraft:oak_stairs[facing=north,half=top]") }),
            );
            expect(result.getProperties().get("shape")).toBe("straight");
        });

        it("falls back to straight for missing properties (legacy NPE catch)", () => {
            const result = applyLegacyExtensions(
                bs("minecraft:oak_stairs[]"),
                0,
                0,
                0,
                accessOf({}),
            );
            expect(props(result)).toEqual({ shape: "straight" });
        });
    });

    it("derives redstone-wire connections", () => {
        const wire = bs("minecraft:redstone_wire[]");
        const world = accessOf({
            "0,0,-1": bs("minecraft:redstone_wire[]"), // north: wire -> side
            "1,-1,0": bs("minecraft:redstone_wire[]"), // east: air, wire below -> side
            "-1,0,0": bs("minecraft:stone[]"), // west: blocked...
            "-1,1,0": bs("minecraft:redstone_wire[]"), // ...but wire above (up not blocking) -> up
            // south: nothing -> none
        });

        const result = applyLegacyExtensions(wire, 0, 0, 0, world);
        expect(props(result)).toEqual({ north: "side", east: "side", west: "up", south: "none" });
    });

    it("does not connect redstone upwards when the wire is covered", () => {
        const wire = bs("minecraft:redstone_wire[]");
        const world = accessOf({
            "0,1,0": bs("minecraft:stone[]"), // covered
            "-1,0,0": bs("minecraft:stone[]"),
            "-1,1,0": bs("minecraft:redstone_wire[]"),
        });

        const result = applyLegacyExtensions(wire, 0, 0, 0, world);
        expect(result.getProperties().get("west")).toBe("none");
    });

    it("pairs double-chests", () => {
        const chest = bs("minecraft:chest[facing=north]");

        // facing north: left() is west
        const withLeft = applyLegacyExtensions(
            chest,
            0,
            0,
            0,
            accessOf({ "-1,0,0": bs("minecraft:chest[facing=north]") }),
        );
        expect(withLeft.getProperties().get("type")).toBe("right");

        const withRight = applyLegacyExtensions(
            chest,
            0,
            0,
            0,
            accessOf({ "1,0,0": bs("minecraft:chest[facing=north]") }),
        );
        expect(withRight.getProperties().get("type")).toBe("left");

        const single = applyLegacyExtensions(chest, 0, 0, 0, accessOf({}));
        expect(single.getProperties().get("type")).toBe("single");
    });

    it("copies the lower double-plant into the upper half", () => {
        const upper = bs("minecraft:double_plant[half=upper]");
        const lower = bs("minecraft:double_plant[half=lower,variant=sunflower]");

        const result = applyLegacyExtensions(upper, 0, 1, 0, accessOf({ "0,0,0": lower }));
        expect(props(result)).toEqual({ half: "upper", variant: "sunflower" });

        expect(applyLegacyExtensions(lower, 0, 0, 0, accessOf({}))).toBe(lower);
    });

    it("shapes fire by its surroundings", () => {
        const fire = bs("minecraft:fire[]");

        // floating fire: sides open towards non-culling neighbors
        const floating = applyLegacyExtensions(
            fire,
            0,
            0,
            0,
            accessOf({ "0,0,-1": bs("minecraft:stone[]") }),
        );
        expect(props(floating)).toEqual({
            up: "true",
            north: "false",
            south: "true",
            west: "true",
            east: "true",
        });
        expect(floating.getProperties().has("down")).toBe(false);

        // grounded fire: all sides false
        const grounded = applyLegacyExtensions(
            fire,
            0,
            0,
            0,
            accessOf({ "0,-1,0": bs("minecraft:stone[]") }),
        );
        expect(props(grounded)).toEqual({
            up: "false",
            north: "false",
            south: "false",
            west: "false",
            east: "false",
        });
    });

    it("raises wall-posts only where needed", () => {
        const wall = bs("minecraft:cobblestone_wall[]");

        // straight north-south wall -> no post
        const straight = applyLegacyExtensions(
            wall,
            0,
            0,
            0,
            accessOf({
                "0,0,-1": bs("minecraft:cobblestone_wall[]"),
                "0,0,1": bs("minecraft:cobblestone_wall[]"),
            }),
        );
        expect(props(straight)).toEqual({
            north: "true",
            south: "true",
            east: "false",
            west: "false",
            up: "false",
        });

        // corner -> post
        const corner = applyLegacyExtensions(
            wall,
            0,
            0,
            0,
            accessOf({
                "0,0,-1": bs("minecraft:cobblestone_wall[]"),
                "1,0,0": bs("minecraft:cobblestone_wall[]"),
            }),
        );
        expect(corner.getProperties().get("up")).toBe("true");

        // straight wall with a block above -> post
        const underBlock = applyLegacyExtensions(
            wall,
            0,
            0,
            0,
            accessOf({
                "0,0,-1": bs("minecraft:cobblestone_wall[]"),
                "0,0,1": bs("minecraft:cobblestone_wall[]"),
                "0,1,0": bs("minecraft:stone[]"),
            }),
        );
        expect(underBlock.getProperties().get("up")).toBe("true");
    });
});

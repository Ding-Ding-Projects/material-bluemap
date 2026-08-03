import { describe, expect, it } from "vitest";
import { Grid } from "./Grid.js";
import { Vector2i } from "./math/Vector2i.js";

describe("Grid", () => {
    describe("cell coordinates (floorDiv semantics)", () => {
        const grid = new Grid(16);

        it("computes cells for positive positions", () => {
            expect(grid.getCellX(0)).toBe(0);
            expect(grid.getCellX(15)).toBe(0);
            expect(grid.getCellX(16)).toBe(1);
            expect(grid.getCellY(31)).toBe(1);
            expect(grid.getCellY(32)).toBe(2);
        });

        it("floors for negative positions", () => {
            expect(grid.getCellX(-1)).toBe(-1);
            expect(grid.getCellX(-16)).toBe(-1);
            expect(grid.getCellX(-17)).toBe(-2);
            expect(grid.getCellY(-1)).toBe(-1);
        });

        it("computes local coordinates (floorMod semantics)", () => {
            expect(grid.getLocalX(0)).toBe(0);
            expect(grid.getLocalX(15)).toBe(15);
            expect(grid.getLocalX(16)).toBe(0);
            expect(grid.getLocalX(-1)).toBe(15);
            expect(grid.getLocalY(-17)).toBe(15);
        });

        it("getCell/getLocal combine both axes", () => {
            expect(grid.getCell(new Vector2i(-1, 16)).equals(new Vector2i(-1, 1))).toBe(true);
            expect(grid.getLocal(new Vector2i(-1, 16)).equals(new Vector2i(15, 0))).toBe(true);
        });
    });

    describe("offset grids", () => {
        const grid = new Grid(16, 8);

        it("shifts cell borders by the offset", () => {
            expect(grid.getCellX(7)).toBe(-1);
            expect(grid.getCellX(8)).toBe(0);
            expect(grid.getCellX(23)).toBe(0);
            expect(grid.getCellX(24)).toBe(1);
            expect(grid.getLocalX(7)).toBe(15);
            expect(grid.getLocalX(8)).toBe(0);
        });

        it("computes cell min/max positions", () => {
            expect(grid.getCellMinX(0)).toBe(8);
            expect(grid.getCellMaxX(0)).toBe(23);
            expect(grid.getCellMinX(-1)).toBe(-8);
            expect(grid.getCellMaxX(-1)).toBe(7);
            expect(grid.getCellMin(new Vector2i(0, -1)).equals(new Vector2i(8, -8))).toBe(true);
            expect(grid.getCellMax(new Vector2i(0, -1)).equals(new Vector2i(23, 7))).toBe(true);
        });
    });

    describe("UNIT grid", () => {
        it("is the identity grid", () => {
            expect(Grid.UNIT.getCellX(5)).toBe(5);
            expect(Grid.UNIT.getCellY(-3)).toBe(-3);
            expect(Grid.UNIT.getLocalX(5)).toBe(0);
            expect(Grid.UNIT.getLocalY(5)).toBe(0);
            expect(Grid.UNIT.getCellMinX(7)).toBe(7);
            expect(Grid.UNIT.getCellMaxX(7)).toBe(7);
        });

        it("still converts into target grids", () => {
            const grid = new Grid(16);
            expect(Grid.UNIT.getCellMinX(-1, grid)).toBe(-1);
            expect(Grid.UNIT.getCellMaxX(15, grid)).toBe(0);
        });
    });

    describe("target grid conversion", () => {
        const chunkGrid = new Grid(16);
        const regionGrid = new Grid(512);

        it("maps cell borders into the target grid", () => {
            expect(regionGrid.getCellMinX(0, chunkGrid)).toBe(0);
            expect(regionGrid.getCellMaxX(0, chunkGrid)).toBe(31);
            expect(regionGrid.getCellMinX(-1, chunkGrid)).toBe(-32);
            expect(regionGrid.getCellMaxX(-1, chunkGrid)).toBe(-1);
            expect(chunkGrid.getCellMinX(-1, regionGrid)).toBe(-1);
            expect(chunkGrid.getCellMaxX(-1, regionGrid)).toBe(-1);
        });

        it("getIntersecting returns all intersecting target cells", () => {
            const cells = regionGrid.getIntersecting(new Vector2i(0, 0), chunkGrid);
            expect(cells.length).toBe(32 * 32);
            expect(cells[0]!.equals(new Vector2i(0, 0))).toBe(true);
            expect(cells[cells.length - 1]!.equals(new Vector2i(31, 31))).toBe(true);
        });

        it("getIntersecting returns a single cell when the grids line up", () => {
            const cells = chunkGrid.getIntersecting(new Vector2i(3, -2), regionGrid);
            expect(cells.length).toBe(1);
            expect(cells[0]!.equals(new Vector2i(0, -1))).toBe(true);
        });

        it("forEachIntersecting visits the same cells", () => {
            const visited: Array<[number, number]> = [];
            regionGrid.forEachIntersecting(new Vector2i(-1, 0), chunkGrid, (x, y) =>
                visited.push([x, y])
            );
            expect(visited.length).toBe(32 * 32);
            expect(visited[0]).toEqual([-32, 0]);
            expect(visited[visited.length - 1]).toEqual([-1, 31]);
        });
    });

    describe("multiply / divide", () => {
        it("multiplies grid sizes and offsets", () => {
            const a = new Grid(new Vector2i(4, 4), new Vector2i(1, 2));
            const b = new Grid(new Vector2i(2, 2), new Vector2i(3, 5));
            const product = a.multiply(b);
            expect(product.getGridSize().equals(new Vector2i(8, 8))).toBe(true);
            expect(product.getOffset().equals(new Vector2i(5, 9))).toBe(true);
        });

        it("divide is the inverse of multiply", () => {
            const a = new Grid(new Vector2i(4, 4), new Vector2i(1, 2));
            const b = new Grid(new Vector2i(2, 2), new Vector2i(3, 5));
            expect(a.multiply(b).divide(b).equals(a)).toBe(true);
        });

        it("chunk-grid times region-scale gives the region grid", () => {
            expect(new Grid(16).multiply(new Grid(32)).equals(new Grid(512))).toBe(true);
            expect(new Grid(512).divide(new Grid(16)).equals(new Grid(32))).toBe(true);
        });
    });

    it("clamps the grid size to at least 1", () => {
        const grid = new Grid(new Vector2i(0, -5));
        expect(grid.getGridSize().equals(new Vector2i(1, 1))).toBe(true);
    });

    it("equals and toString", () => {
        expect(new Grid(16, 8).equals(new Grid(new Vector2i(16, 16), new Vector2i(8, 8)))).toBe(
            true
        );
        expect(new Grid(16).equals(new Grid(16, 8))).toBe(false);
        expect(new Grid(16).equals(null)).toBe(false);
        expect(new Grid(2, 1).toString()).toBe("Grid{gridSize=(2, 2), offset=(1, 1)}");
    });
});

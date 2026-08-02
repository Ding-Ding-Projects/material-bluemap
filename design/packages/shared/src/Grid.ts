import { Vector2i } from "./math/Vector2i.js";

export type BiIntConsumer = (x: number, y: number) => void;

/** Java Math.floorDiv for 32-bit ints */
function floorDiv(x: number, y: number): number {
    return Math.floor(x / y) | 0;
}

/** Java Math.floorMod for 32-bit ints */
function floorMod(x: number, y: number): number {
    return (((x % y) + y) % y) | 0;
}

export class Grid {
    static readonly UNIT: Grid = new (class extends Grid {
        override getCellX(posX: number): number {
            return posX;
        }
        override getCellY(posY: number): number {
            return posY;
        }
        override getCell(pos: Vector2i): Vector2i {
            return pos;
        }
        override getLocalX(posX: number): number {
            return 0;
        }
        override getLocalY(posY: number): number {
            return 0;
        }
        override getLocal(pos: Vector2i): Vector2i {
            return pos;
        }
        override getCellMinX(cellX: number, targetGrid?: Grid): number {
            if (targetGrid !== undefined) return super.getCellMinX(cellX, targetGrid);
            return cellX;
        }
        override getCellMinY(cellY: number, targetGrid?: Grid): number {
            if (targetGrid !== undefined) return super.getCellMinY(cellY, targetGrid);
            return cellY;
        }
        override getCellMin(cell: Vector2i, targetGrid?: Grid): Vector2i {
            if (targetGrid !== undefined) return super.getCellMin(cell, targetGrid);
            return cell;
        }
        override getCellMaxX(cellX: number, targetGrid?: Grid): number {
            if (targetGrid !== undefined) return super.getCellMaxX(cellX, targetGrid);
            return cellX;
        }
        override getCellMaxY(cellY: number, targetGrid?: Grid): number {
            if (targetGrid !== undefined) return super.getCellMaxY(cellY, targetGrid);
            return cellY;
        }
        override getCellMax(cell: Vector2i, targetGrid?: Grid): Vector2i {
            if (targetGrid !== undefined) return super.getCellMax(cell, targetGrid);
            return cell;
        }
    })(Vector2i.ONE, Vector2i.ZERO);

    private readonly gridSize: Vector2i;
    private readonly offset: Vector2i;

    constructor(gridSize: number);
    constructor(gridSize: number, offset: number);
    constructor(gridSize: Vector2i);
    constructor(gridSize: Vector2i, offset: Vector2i);
    constructor(gridSize: number | Vector2i, offset?: number | Vector2i) {
        if (typeof gridSize === "number") {
            gridSize = new Vector2i(gridSize, gridSize);
        }
        if (offset === undefined) {
            offset = Vector2i.ZERO;
        } else if (typeof offset === "number") {
            offset = new Vector2i(offset, offset);
        }

        gridSize = gridSize.max(1, 1);

        this.gridSize = gridSize;
        this.offset = offset;
    }

    getGridSize(): Vector2i {
        return this.gridSize;
    }

    getOffset(): Vector2i {
        return this.offset;
    }

    getCellX(posX: number): number {
        return floorDiv(posX - this.offset.getX(), this.gridSize.getX());
    }

    getCellY(posY: number): number {
        return floorDiv(posY - this.offset.getY(), this.gridSize.getY());
    }

    getCell(pos: Vector2i): Vector2i {
        return new Vector2i(this.getCellX(pos.getX()), this.getCellY(pos.getY()));
    }

    getLocalX(posX: number): number {
        return floorMod(posX - this.offset.getX(), this.gridSize.getX());
    }

    getLocalY(posY: number): number {
        return floorMod(posY - this.offset.getY(), this.gridSize.getY());
    }

    getLocal(pos: Vector2i): Vector2i {
        return new Vector2i(this.getLocalX(pos.getX()), this.getLocalY(pos.getY()));
    }

    getCellMinX(cellX: number, targetGrid?: Grid): number {
        if (targetGrid !== undefined) return targetGrid.getCellX(this.getCellMinX(cellX));
        return (Math.imul(cellX, this.gridSize.getX()) + this.offset.getX()) | 0;
    }

    getCellMinY(cellY: number, targetGrid?: Grid): number {
        if (targetGrid !== undefined) return targetGrid.getCellY(this.getCellMinY(cellY));
        return (Math.imul(cellY, this.gridSize.getY()) + this.offset.getY()) | 0;
    }

    getCellMin(cell: Vector2i, targetGrid?: Grid): Vector2i {
        if (targetGrid !== undefined)
            return new Vector2i(
                this.getCellMinX(cell.getX(), targetGrid),
                this.getCellMinY(cell.getY(), targetGrid)
            );
        return new Vector2i(this.getCellMinX(cell.getX()), this.getCellMinY(cell.getY()));
    }

    getCellMaxX(cellX: number, targetGrid?: Grid): number {
        if (targetGrid !== undefined) return targetGrid.getCellX(this.getCellMaxX(cellX));
        return (Math.imul(cellX + 1, this.gridSize.getX()) + this.offset.getX() - 1) | 0;
    }

    getCellMaxY(cellY: number, targetGrid?: Grid): number {
        if (targetGrid !== undefined) return targetGrid.getCellY(this.getCellMaxY(cellY));
        return (Math.imul(cellY + 1, this.gridSize.getY()) + this.offset.getY() - 1) | 0;
    }

    getCellMax(cell: Vector2i, targetGrid?: Grid): Vector2i {
        if (targetGrid !== undefined)
            return new Vector2i(
                this.getCellMaxX(cell.getX(), targetGrid),
                this.getCellMaxY(cell.getY(), targetGrid)
            );
        return new Vector2i(this.getCellMaxX(cell.getX()), this.getCellMaxY(cell.getY()));
    }

    forEachIntersecting(cell: Vector2i, targetGrid: Grid, action: BiIntConsumer): void {
        const min = this.getCellMin(cell, targetGrid);
        const max = this.getCellMax(cell, targetGrid);
        for (let x = min.getX(); x <= max.getX(); x++) {
            for (let y = min.getY(); y <= max.getY(); y++) {
                action(x, y);
            }
        }
    }

    getIntersecting(cell: Vector2i, targetGrid: Grid): Vector2i[] {
        const min = this.getCellMin(cell, targetGrid);
        const max = this.getCellMax(cell, targetGrid);

        if (min.equals(max)) return [min];

        const intersects: Vector2i[] = [];
        for (let x = min.getX(); x <= max.getX(); x++) {
            for (let y = min.getY(); y <= max.getY(); y++) {
                intersects.push(new Vector2i(x, y));
            }
        }

        return intersects;
    }

    multiply(other: Grid): Grid {
        return new Grid(
            this.gridSize.mul(other.gridSize),
            this.offset.mul(other.gridSize).add(other.offset)
        );
    }

    divide(other: Grid): Grid {
        return new Grid(
            this.gridSize.div(other.gridSize),
            this.offset.sub(other.offset).div(other.gridSize)
        );
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Grid)) return false;
        return this.gridSize.equals(o.gridSize) && this.offset.equals(o.offset);
    }

    toString(): string {
        return "Grid{" + "gridSize=" + this.gridSize + ", offset=" + this.offset + "}";
    }
}

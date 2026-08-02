import { Color, UniformsUtils } from "three";
import type { Curve, CurvePath, Vector3, WebGLRenderer } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import type { LineMaterialParameters } from "three/examples/jsm/lines/LineMaterial";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { Line2 } from "three/examples/jsm/lines/Line2";
import { deepEquals } from "../util/Utils";
import { ObjectMarker } from "./ObjectMarker";
import type { MarkerClickEvent, ObjectMarkerDataInput } from "./ObjectMarker";
import { lineShader } from "../util/LineShader";

export interface ColorLike {
    r?: number;
    g?: number;
    b?: number;
    a?: number;
}

export interface LineMarkerDataInput extends ObjectMarkerDataInput {
    line?: { x?: number; y?: number; z?: number }[];
    depthTest?: boolean;
    lineWidth?: number;
    lineColor?: ColorLike;
    minDistance?: number;
    maxDistance?: number;
}

export class LineMarker extends ObjectMarker {
    declare readonly isLineMarker: boolean;

    line: LineMarkerLine;

    _markerData: LineMarkerDataInput;

    constructor(markerId: string) {
        super(markerId);
        Object.defineProperty(this, "isLineMarker", { value: true });
        this.data.type = "line";

        this.line = new LineMarkerLine([0, 0, 0]);

        this.add(this.line);

        this._markerData = {};
    }

    setLine(line: number[] | Vector3[] | Curve<Vector3> | CurvePath<Vector3>): void {
        let points: number[];

        if (
            (line as Curve<Vector3>).type === "Curve" ||
            (line as Curve<Vector3>).type === "CurvePath"
        ) {
            line = (line as Curve<Vector3>).getPoints(5);
        }

        if (Array.isArray(line)) {
            if (line.length === 0) {
                points = [];
            } else if ((line[0] as Vector3).isVector3) {
                points = [];
                (line as Vector3[]).forEach((point) => {
                    points.push(point.x, point.y, point.z);
                });
            } else {
                points = line as number[];
            }
        } else {
            throw new Error("Invalid argument type!");
        }

        this.line.updateGeometry(points);
    }

    override updateFromData(markerData: LineMarkerDataInput): void {
        super.updateFromData(markerData);

        // update shape only if needed, based on last update-data
        if (
            !this._markerData.line ||
            !deepEquals(markerData.line, this._markerData.line) ||
            !this._markerData.position ||
            !deepEquals(markerData.position, this._markerData.position)
        ) {
            this.setLine(this.createPointsFromData(markerData.line));
        }

        // update depthTest
        this.line.depthTest = !!markerData.depthTest;

        // update border-width
        this.line.linewidth = markerData.lineWidth !== undefined ? markerData.lineWidth : 2;

        // update line-color
        const lc = markerData.lineColor || {};
        this.line.color.setRGB((lc.r || 0) / 255, (lc.g || 0) / 255, (lc.b || 0) / 255);
        this.line.opacity = lc.a || 0;

        // update min/max distances
        const minDist = markerData.minDistance || 0;
        const maxDist =
            markerData.maxDistance !== undefined ? markerData.maxDistance : Number.MAX_VALUE;
        this.line.fadeDistanceMin = minDist;
        this.line.fadeDistanceMax = maxDist;

        // save used marker data for next update
        this._markerData = markerData;
    }

    override dispose(): void {
        super.dispose();

        this.line.dispose();
    }

    /**
     * Creates a shape from a data object, usually parsed json from a markers.json
     */
    private createPointsFromData(
        shapeData: { x?: number; y?: number; z?: number }[] | undefined,
    ): number[] {
        const points: number[] = [];

        if (Array.isArray(shapeData)) {
            shapeData.forEach((point) => {
                const x = (point.x || 0) - this.position.x;
                const y = (point.y || 0) - this.position.y;
                const z = (point.z || 0) - this.position.z;

                points.push(x, y, z);
            });
        }

        return points;
    }
}

class LineMarkerLine extends Line2 {
    constructor(points: number[]) {
        const geometry = new LineGeometry();
        geometry.setPositions(points);

        const material = new LineMaterial({
            color: new Color(),
            opacity: 0,
            transparent: true,
            linewidth: 1,
            depthTest: true,
            vertexColors: false,
            dashed: false,
            uniforms: UniformsUtils.clone(lineShader.uniforms),
            vertexShader: lineShader.vertexShader,
            fragmentShader: lineShader.fragmentShader,
        } as unknown as LineMaterialParameters);
        material.uniforms.fadeDistanceMin = { value: 0 };
        material.uniforms.fadeDistanceMax = { value: Number.MAX_VALUE };

        material.resolution.set(window.innerWidth, window.innerHeight);

        super(geometry, material);

        this.computeLineDistances();
    }

    get color(): Color {
        return this.material.color;
    }

    get opacity(): number {
        return this.material.opacity;
    }

    set opacity(opacity: number) {
        this.material.opacity = opacity;
        this.visible = opacity > 0;
    }

    get linewidth(): number {
        return this.material.linewidth;
    }

    set linewidth(width: number) {
        this.material.linewidth = width;
    }

    get depthTest(): boolean {
        return this.material.depthTest;
    }

    set depthTest(test: boolean) {
        this.material.depthTest = test;
    }

    get fadeDistanceMin(): number {
        return this.material.uniforms.fadeDistanceMin!.value;
    }

    set fadeDistanceMin(min: number) {
        this.material.uniforms.fadeDistanceMin!.value = min;
    }

    get fadeDistanceMax(): number {
        return this.material.uniforms.fadeDistanceMax!.value;
    }

    set fadeDistanceMax(max: number) {
        this.material.uniforms.fadeDistanceMax!.value = max;
    }

    override onClick(event: MarkerClickEvent): boolean {
        if (event.intersection) {
            if (event.intersection.distance > this.fadeDistanceMax) return false;
            if (event.intersection.distance < this.fadeDistanceMin) return false;
        }

        return super.onClick(event);
    }

    updateGeometry(points: number[]): void {
        this.geometry = new LineGeometry();
        this.geometry.setPositions(points);
        this.computeLineDistances();
    }

    override onBeforeRender = (renderer: WebGLRenderer): void => {
        renderer.getSize(this.material.resolution);
    };

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }
}

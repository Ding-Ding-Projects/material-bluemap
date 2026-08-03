import {
    Color,
    DoubleSide,
    ExtrudeGeometry,
    Mesh,
    ShaderMaterial,
    Shape,
    UniformsUtils,
    Vector2,
} from "three";
import type { WebGLRenderer } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import type { LineMaterialParameters } from "three/examples/jsm/lines/LineMaterial";
import { MARKER_FILL_VERTEX_SHADER } from "./MarkerFillVertexShader";
import { MARKER_FILL_FRAGMENT_SHADER } from "./MarkerFillFragmentShader";
import { Line2 } from "three/examples/jsm/lines/Line2";
import type { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { deepEquals } from "../util/Utils";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { ObjectMarker } from "./ObjectMarker";
import type { MarkerClickEvent, ObjectMarkerDataInput } from "./ObjectMarker";
import { lineShader } from "../util/LineShader";

export interface ColorLike {
    r?: number;
    g?: number;
    b?: number;
    a?: number;
}

export interface ExtrudeMarkerDataInput extends ObjectMarkerDataInput {
    shape?: { x?: number; z?: number }[];
    shapeMinY?: number;
    shapeMaxY?: number;
    holes?: { x?: number; z?: number }[][];
    depthTest?: boolean;
    lineWidth?: number;
    lineColor?: ColorLike;
    fillColor?: ColorLike;
    minDistance?: number;
    maxDistance?: number;
}

export class ExtrudeMarker extends ObjectMarker {
    declare readonly isExtrudeMarker: boolean;

    fill: ExtrudeMarkerFill;
    border: ExtrudeMarkerBorder;

    _markerData: ExtrudeMarkerDataInput;

    constructor(markerId: string) {
        super(markerId);
        Object.defineProperty(this, "isExtrudeMarker", { value: true });
        this.data.type = "extrude";

        const zero = new Vector2();
        const shape = new Shape([zero, zero, zero]);
        this.fill = new ExtrudeMarkerFill(shape);
        this.border = new ExtrudeMarkerBorder(shape);
        this.border.renderOrder = -1; // render border before fill

        this.add(this.border, this.fill);

        this._markerData = {};
    }

    setShapeY(minY: number, maxY: number): void {
        const relativeY = maxY - this.position.y;
        const height = maxY - minY;
        this.fill.position.y = relativeY;
        this.border.position.y = relativeY;
        this.fill.scale.y = height;
        this.border.scale.y = height;
    }

    setShape(shape: Shape): void {
        this.fill.updateGeometry(shape);
        this.border.updateGeometry(shape);
    }

    override updateFromData(markerData: ExtrudeMarkerDataInput): void {
        super.updateFromData(markerData);

        // update shape only if needed, based on last update-data
        if (
            !this._markerData.shape ||
            !deepEquals(markerData.shape, this._markerData.shape) ||
            !this._markerData.holes ||
            !deepEquals(markerData.holes, this._markerData.holes) ||
            !this._markerData.position ||
            !deepEquals(markerData.position, this._markerData.position)
        ) {
            this.setShape(this.createShapeWithHolesFromData(markerData.shape, markerData.holes));
        }

        // update shapeY
        this.setShapeY((markerData.shapeMinY || 0) - 0.01, (markerData.shapeMaxY || 0) + 0.01); // offset by 0.01 to avoid z-fighting

        // update depthTest
        this.border.depthTest = !!markerData.depthTest;
        this.fill.depthTest = !!markerData.depthTest;

        // update border-width
        this.border.linewidth = markerData.lineWidth !== undefined ? markerData.lineWidth : 2;

        // update border-color
        const bc = markerData.lineColor || {};
        this.border.color.setRGB((bc.r || 0) / 255, (bc.g || 0) / 255, (bc.b || 0) / 255);
        this.border.opacity = bc.a || 0;

        // update fill-color
        const fc = markerData.fillColor || {};
        this.fill.color.setRGB((fc.r || 0) / 255, (fc.g || 0) / 255, (fc.b || 0) / 255);
        this.fill.opacity = fc.a || 0;

        // update min/max distances
        const minDist = markerData.minDistance || 0;
        const maxDist =
            markerData.maxDistance !== undefined ? markerData.maxDistance : Number.MAX_VALUE;
        this.border.fadeDistanceMin = minDist;
        this.border.fadeDistanceMax = maxDist;
        this.fill.fadeDistanceMin = minDist;
        this.fill.fadeDistanceMax = maxDist;

        // save used marker data for next update
        this._markerData = markerData;
    }

    override dispose(): void {
        super.dispose();

        this.fill.dispose();
        this.border.dispose();
    }

    /**
     * Creates a shape from a data object, usually parsed json from a markers.json
     */
    private createShapeFromData(
        shapeData: { x?: number; z?: number }[] | undefined,
    ): Shape | false {
        const points: Vector2[] = [];

        if (Array.isArray(shapeData)) {
            shapeData.forEach((point) => {
                const x = (point.x || 0) - this.position.x + 0.01; // offset by 0.01 to avoid z-fighting
                const z = (point.z || 0) - this.position.z + 0.01;

                points.push(new Vector2(x, z));
            });

            return new Shape(points);
        }

        return false;
    }

    /**
     * Creates a shape with holes from a data object, usually parsed json from a markers.json
     */
    private createShapeWithHolesFromData(
        shapeData: { x?: number; z?: number }[] | undefined,
        holes: { x?: number; z?: number }[][] | undefined,
    ): Shape {
        const shape = this.createShapeFromData(shapeData);

        if (shape && Array.isArray(holes)) {
            holes.forEach((hole) => {
                const holeShape = this.createShapeFromData(hole);
                if (holeShape) {
                    shape.holes.push(holeShape);
                }
            });
        }

        return shape as Shape;
    }
}

class ExtrudeMarkerFill extends Mesh<ExtrudeGeometry, ShaderMaterial> {
    constructor(shape: Shape) {
        const geometry = ExtrudeMarkerFill.createGeometry(shape);
        const material = new ShaderMaterial({
            vertexShader: MARKER_FILL_VERTEX_SHADER,
            fragmentShader: MARKER_FILL_FRAGMENT_SHADER,
            side: DoubleSide,
            depthTest: true,
            transparent: true,
            uniforms: {
                markerColor: { value: new Color() },
                markerOpacity: { value: 0 },
                fadeDistanceMin: { value: 0 },
                fadeDistanceMax: { value: Number.MAX_VALUE },
            },
        });

        super(geometry, material);
    }

    get color(): Color {
        return this.material.uniforms.markerColor!.value;
    }

    get opacity(): number {
        return this.material.uniforms.markerOpacity!.value;
    }

    set opacity(opacity: number) {
        this.material.uniforms.markerOpacity!.value = opacity;
        this.visible = opacity > 0;
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

    updateGeometry(shape: Shape): void {
        this.geometry.dispose();
        this.geometry = ExtrudeMarkerFill.createGeometry(shape);
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }

    static createGeometry(shape: Shape): ExtrudeGeometry {
        const geometry = new ExtrudeGeometry(shape, {
            depth: 1,
            steps: 5,
            bevelEnabled: false,
        });
        geometry.rotateX(Math.PI / 2); //make y to z

        return geometry;
    }
}

class ExtrudeMarkerBorder extends Line2 {
    constructor(shape: Shape) {
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(ExtrudeMarkerBorder.createLinePoints(shape));

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

        super(geometry as LineGeometry, material);

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

    updateGeometry(shape: Shape): void {
        this.geometry = new LineSegmentsGeometry() as LineGeometry;
        this.geometry.setPositions(ExtrudeMarkerBorder.createLinePoints(shape));
        this.computeLineDistances();
    }

    override onBeforeRender = (renderer: WebGLRenderer): void => {
        renderer.getSize(this.material.resolution);
    };

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }

    static createLinePoints(shape: Shape): number[] {
        const points3d: number[] = [];

        points3d.push(...this.convertPoints(shape.getPoints(5)));
        shape.getPointsHoles(5).forEach((hole) => points3d.push(...this.convertPoints(hole)));

        return points3d;
    }

    private static convertPoints(points: { x: number; y: number }[]): number[] {
        const points3d: number[] = [];
        points.push(points[0]!);

        let prevPoint: { x: number; y: number } | null = null;
        points.forEach((point) => {
            // vertical line
            points3d.push(point.x, 0, point.y);
            points3d.push(point.x, -1, point.y);

            if (prevPoint) {
                // line to previous point top
                points3d.push(prevPoint.x, 0, prevPoint.y);
                points3d.push(point.x, 0, point.y);

                // line to previous point bottom
                points3d.push(prevPoint.x, -1, prevPoint.y);
                points3d.push(point.x, -1, point.y);
            }

            prevPoint = point;
        });

        return points3d;
    }
}

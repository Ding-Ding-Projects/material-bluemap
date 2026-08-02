import { MathUtils, Matrix4, PerspectiveCamera } from "three";
import { makeReactive } from "./reactivity";

export interface CombinedCameraData {
    fov: number;
    aspect: number;
    near: number;
    far: number;
    zoom: number;
    ortho: number;
    distance: number;
}

export class CombinedCamera extends PerspectiveCamera {
    needsUpdate: boolean;
    data: CombinedCameraData;

    ortographicProjection?: Matrix4;
    perspectiveProjection?: Matrix4;

    constructor(fov: number, aspect: number, near: number, far: number, ortho: number) {
        super(fov, aspect, near, far);

        this.needsUpdate = true;

        this.data = makeReactive({
            fov: this.fov,
            aspect: this.aspect,
            near: this.near,
            far: this.far,
            zoom: this.zoom,
            ortho: ortho,
            distance: 1,
        });

        // redirect parent properties
        Object.defineProperty(this, "fov", {
            get(this: CombinedCamera) {
                return this.data.fov;
            },
            set(this: CombinedCamera, value: number) {
                if (value !== this.data.fov) {
                    this.data.fov = value;
                    this.needsUpdate = true;
                }
            },
        });
        Object.defineProperty(this, "aspect", {
            get(this: CombinedCamera) {
                return this.data.aspect;
            },
            set(this: CombinedCamera, value: number) {
                if (value !== this.data.aspect) {
                    this.data.aspect = value;
                    this.needsUpdate = true;
                }
            },
        });
        Object.defineProperty(this, "near", {
            get(this: CombinedCamera) {
                return this.data.near;
            },
            set(this: CombinedCamera, value: number) {
                if (value !== this.data.near) {
                    this.data.near = value;
                    this.needsUpdate = true;
                }
            },
        });
        Object.defineProperty(this, "far", {
            get(this: CombinedCamera) {
                return this.data.far;
            },
            set(this: CombinedCamera, value: number) {
                if (value !== this.data.far) {
                    this.data.far = value;
                    this.needsUpdate = true;
                }
            },
        });
        Object.defineProperty(this, "zoom", {
            get(this: CombinedCamera) {
                return this.data.zoom;
            },
            set(this: CombinedCamera, value: number) {
                if (value !== this.data.zoom) {
                    this.data.zoom = value;
                    this.needsUpdate = true;
                }
            },
        });

        this.updateProjectionMatrix();
    }

    override updateProjectionMatrix(): void {
        if (!this.needsUpdate) return;

        if (!this.ortographicProjection) this.ortographicProjection = new Matrix4();

        if (!this.perspectiveProjection) this.perspectiveProjection = new Matrix4();

        //if (!this.data)
        //    this.data = {};

        //copied from PerspectiveCamera
        const near = this.near;
        let top = (near * Math.tan(MathUtils.DEG2RAD * 0.5 * this.fov)) / this.zoom;
        let height = 2 * top;
        let width = this.aspect * height;
        let left = -0.5 * width;
        const view = this.view;

        if (view !== null && view.enabled) {
            const fullWidth = view.fullWidth,
                fullHeight = view.fullHeight;

            left += (view.offsetX * width) / fullWidth;
            top -= (view.offsetY * height) / fullHeight;
            width *= view.width / fullWidth;
            height *= view.height / fullHeight;
        }

        const skew = this.filmOffset;
        if (skew !== 0) left += (near * skew) / this.getFilmWidth();

        // this part different to PerspectiveCamera
        let normalizedOrtho = -Math.pow(this.ortho - 1, 6) + 1;
        let orthoTop =
            (Math.max(this.distance, 0.0001) * Math.tan(MathUtils.DEG2RAD * 0.5 * this.fov)) /
            this.zoom;
        let orthoHeight = 2 * orthoTop;
        let orthoWidth = this.aspect * orthoHeight;
        let orthoLeft = -0.5 * orthoWidth;

        this.perspectiveProjection.makePerspective(left, left + width, top, top - height, near, this.far);
        this.ortographicProjection.makeOrthographic(
            orthoLeft,
            orthoLeft + orthoWidth,
            orthoTop,
            orthoTop - orthoHeight,
            near,
            this.far,
        );

        for (let i = 0; i < 16; i++) {
            this.projectionMatrix.elements[i] =
                this.perspectiveProjection.elements[i]! * (1 - normalizedOrtho) +
                this.ortographicProjection.elements[i]! * normalizedOrtho;
        }
        // to here

        this.projectionMatrixInverse.copy(this.projectionMatrix).invert();

        this.needsUpdate = false;
    }

    get ortho(): number {
        return this.data.ortho;
    }

    set ortho(value: number) {
        if (value !== this.data.ortho) {
            this.data.ortho = value;
            this.needsUpdate = true;
        }
    }

    get distance(): number {
        return this.data.distance;
    }

    set distance(value: number) {
        if (value !== this.data.distance) {
            this.data.distance = value;
            this.needsUpdate = true;
        }
    }
}

Object.defineProperties(CombinedCamera.prototype, {
    isPerspectiveCamera: {
        configurable: true,
        get(this: CombinedCamera): boolean {
            return this.ortho < 1;
        },
        set(value: boolean) {},
    },
    isOrthographicCamera: {
        configurable: true,
        get(this: CombinedCamera): boolean {
            return !this.isPerspectiveCamera;
        },
        set(value: boolean) {},
    },
    type: {
        configurable: true,
        get(this: CombinedCamera): string {
            return this.isPerspectiveCamera ? "PerspectiveCamera" : "OrthographicCamera";
        },
        set(type: string) {
            //ignore
        },
    },
});

import type { Key, Vector2d, Vector3d } from "@worldlens/shared";

export interface Entity {
    getId(): Key;

    /** upstream: java.util.UUID — ported as its canonical string representation */
    getUuid(): string;

    getCustomName(): unknown;

    isCustomNameVisible(): boolean;

    getPos(): Vector3d;

    getMotion(): Vector3d;

    /** upstream: Vector2f — the shared math port has no immutable float vector, doubles are used */
    getRotation(): Vector2d;
}

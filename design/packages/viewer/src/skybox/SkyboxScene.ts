import { BackSide, Mesh, Scene, ShaderMaterial, SphereGeometry } from "three";
import type { IUniform } from "three";

import { SKY_FRAGMENT_SHADER } from "./SkyFragmentShader";
import { SKY_VERTEX_SHADER } from "./SkyVertexShader";

export class SkyboxScene extends Scene {
    declare readonly isSkyboxScene: true;

    constructor(uniforms: { [uniform: string]: IUniform }) {
        super();

        this.matrixWorldAutoUpdate = false;

        Object.defineProperty(this, "isSkyboxScene", { value: true });

        const geometry = new SphereGeometry(1, 40, 5);
        const material = new ShaderMaterial({
            uniforms: uniforms,
            vertexShader: SKY_VERTEX_SHADER,
            fragmentShader: SKY_FRAGMENT_SHADER,
            side: BackSide,
        });
        const skybox = new Mesh(geometry, material);

        this.add(skybox);
    }
}

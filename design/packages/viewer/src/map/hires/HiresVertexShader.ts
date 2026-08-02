import { ShaderChunk } from "three";

// language=GLSL
export const HIRES_VERTEX_SHADER = `
#include <common>
${ShaderChunk.logdepthbuf_pars_vertex}

const vec2 lightDirection = normalize(vec2(1.0, 0.5));

uniform float distance;

attribute float ao;
attribute float sunlight;
attribute float blocklight;

varying vec3 vPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vColor;
varying float vAo;
varying float vSunlight;
varying float vBlocklight;

void main() {
    vPosition = position;
    vec4 worldPos = modelMatrix * vec4(vPosition, 1);
    vWorldPosition = worldPos.xyz;
    vNormal = normal;
    vUv = uv;
    vColor = color;
    vAo = ao;
    vSunlight = sunlight;
    vBlocklight = blocklight;

    // apply directional lighting
    if (vNormal.y != 0.0 || abs(abs(vNormal.x) - abs(vNormal.z)) != 0.0) {
        float distFac = smoothstep(1000.0, 50.0, distance);
        vAo *= 1.0 - abs(dot(vNormal.xz, lightDirection)) * 0.4 * distFac;
        vAo *= 1.0 - max(0.0, -vNormal.y) * 0.6 * distFac;
    }

    gl_Position = projectionMatrix * (viewMatrix * modelMatrix * vec4(position, 1));

    ${ShaderChunk.logdepthbuf_vertex}
}
`;

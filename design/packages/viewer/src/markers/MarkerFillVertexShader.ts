import { ShaderChunk } from "three";

export const MARKER_FILL_VERTEX_SHADER = `
#include <common>
${ShaderChunk.logdepthbuf_pars_vertex}

varying vec3 vPosition;
//varying vec3 vWorldPosition;
//varying vec3 vNormal;
//varying vec2 vUv;
//varying vec3 vColor;
varying float vDistance;

void main() {
	vec4 worldPos = modelMatrix * vec4(position, 1);
	vec4 viewPos = viewMatrix * worldPos;

	vPosition = position;
	//vWorldPosition = worldPos.xyz;
	//vNormal = normal;
	//vUv = uv;
	//vColor = vec3(1.0);
	vDistance = -viewPos.z;

	gl_Position = projectionMatrix * viewPos;

	${ShaderChunk.logdepthbuf_vertex}
}
`;

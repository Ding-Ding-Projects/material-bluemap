import { ShaderChunk } from "three";

// language=GLSL
export const LOWRES_VERTEX_SHADER = `
#include <common>
${ShaderChunk.logdepthbuf_pars_vertex}

uniform sampler2D textureImage;
uniform vec2 tileSize;
uniform vec2 textureSize;

varying vec3 vPosition;
varying vec3 vWorldPosition;
varying float vDistance;

float metaToHeight(vec4 meta) {
	float heightUnsigned = meta.g * 65280.0 + meta.b * 255.0;
	if (heightUnsigned >= 32768.0) {
		return -(65535.0 - heightUnsigned);
	} else {
		return heightUnsigned;
	}
}

vec2 posToMetaUV(vec2 pos) {
	return vec2(pos.x / textureSize.x, pos.y / textureSize.y + 0.5);
}

void main() {
	vPosition = position;

	vec4 meta = texture(textureImage, posToMetaUV(position.xz));
	vPosition.y = metaToHeight(meta) + 1.0 - position.x * 0.0001 - position.z * 0.0002; //including small offset-tilt to prevent z-fighting

	vec4 worldPos = modelMatrix * vec4(vPosition, 1);
	vec4 viewPos = viewMatrix * worldPos;

	vWorldPosition = worldPos.xyz;
	vDistance = -viewPos.z;

	gl_Position = projectionMatrix * viewPos;

	${ShaderChunk.logdepthbuf_vertex}
}

`;

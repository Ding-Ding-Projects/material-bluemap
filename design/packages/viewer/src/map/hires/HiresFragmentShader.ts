import { ShaderChunk } from "three";

// language=GLSL
export const HIRES_FRAGMENT_SHADER = `
${ShaderChunk.logdepthbuf_pars_fragment}

#ifndef texture
	#define texture texture2D
#endif

uniform float distance;
uniform sampler2D textureImage;
uniform float sunlightStrength;
uniform float ambientLight;
uniform float animationFrameHeight;
uniform float animationFrameIndex;
uniform float animationInterpolationFrameIndex;
uniform float animationInterpolation;
uniform bool chunkBorders;

varying vec3 vPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vColor;
varying float vAo;
varying float vSunlight;
varying float vBlocklight;
//varying float vDistance;

void main() {

	vec4 color = texture(textureImage, vec2(vUv.x, animationFrameHeight * (vUv.y + animationFrameIndex)));
	if (animationInterpolation > 0.0) {
		color = mix(color, texture(textureImage, vec2(vUv.x, animationFrameHeight * (vUv.y + animationInterpolationFrameIndex))), animationInterpolation);
	}

	if (color.a <= 0.01) discard;

	//apply vertex-color
	color.rgb *= vColor.rgb;

	//apply ao
	color.rgb *= vAo;

	//apply light
	float light = mix(vBlocklight, max(vSunlight, vBlocklight), sunlightStrength);
	color.rgb *= mix(ambientLight, 1.0, light / 15.0);

	if (chunkBorders) {
		vec4 lineColour = vec4(1.0, 0.0, 1.0, 0.4);
		float lineInterval = 16.0;
		float lineThickness = 0.125; //width of two Minecraft pixels
		float offset = 0.5;

		vec2 worldPos = vWorldPosition.xz;
		worldPos += offset;
		float x = abs(mod(worldPos.x, lineInterval) - offset);
		float y = abs(mod(worldPos.y, lineInterval) - offset);
		bool isChunkBorder = x < lineThickness || y < lineThickness;

		//only show line on upwards facing surfaces
		bool showChunkBorder = isChunkBorder && vNormal.y > 0.1;

		float distFac = smoothstep(200.0, 600.0, distance);
		color.rgb = mix(mix(color.rgb, lineColour.rgb, float(showChunkBorder) * lineColour.a), color.rgb, distFac);
	}

	gl_FragColor = color;

	${ShaderChunk.logdepthbuf_fragment}
}
`;

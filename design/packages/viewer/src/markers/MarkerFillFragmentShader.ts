import { ShaderChunk } from "three";

export const MARKER_FILL_FRAGMENT_SHADER = `
${ShaderChunk.logdepthbuf_pars_fragment}

#define FLT_MAX 3.402823466e+38

varying vec3 vPosition;
//varying vec3 vWorldPosition;
//varying vec3 vNormal;
//varying vec2 vUv;
//varying vec3 vColor;
varying float vDistance;

uniform vec3 markerColor;
uniform float markerOpacity;

uniform float fadeDistanceMax;
uniform float fadeDistanceMin;

void main() {
	vec4 color = vec4(markerColor, markerOpacity);

	// distance fading
	float fdMax = FLT_MAX;
	if ( fadeDistanceMax > 0.0 ) fdMax = fadeDistanceMax;

	float minDelta = (vDistance - fadeDistanceMin) / fadeDistanceMin;
	float maxDelta = (vDistance - fadeDistanceMax) / (fadeDistanceMax * 0.5);
	float distanceOpacity = min(
		clamp(minDelta, 0.0, 1.0),
		1.0 - clamp(maxDelta + 1.0, 0.0, 1.0)
	);

	color.a *= distanceOpacity;

	// apply vertex-color
	//color.rgb *= vColor.rgb;

	gl_FragColor = color;

	${ShaderChunk.logdepthbuf_fragment}
}
`;

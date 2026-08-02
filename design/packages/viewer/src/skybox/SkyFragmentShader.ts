// language=GLSL
export const SKY_FRAGMENT_SHADER = `
uniform float sunlightStrength;
uniform float ambientLight;
uniform vec3 skyColor;
uniform vec3 voidColor;

varying vec3 vPosition;

vec3 adjustColor(vec3 color) {
	return vec3(color * max(sunlightStrength * sunlightStrength, ambientLight));
}

void main() {
	float horizonWidth = 0.005;
	float horizonHeight = 0.0;

	vec3 adjustedSkyColor = adjustColor(skyColor);
	vec3 adjustedVoidColor = adjustColor(voidColor);
	float voidMultiplier = (clamp(vPosition.y - horizonHeight, -horizonWidth, horizonWidth) + horizonWidth) / (horizonWidth * 2.0);
	vec3 color = mix(adjustedVoidColor, adjustedSkyColor, voidMultiplier);

	gl_FragColor = vec4(color, 1.0);
}
`;

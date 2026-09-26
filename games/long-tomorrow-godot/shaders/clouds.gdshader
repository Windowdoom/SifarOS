shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, fog_disabled;
// Lit cloud layer: two octaves of value-noise fbm drifting with time,
// coverage from the weather state, forward-scattering toward the sun.
uniform float cover = 0.3;
uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);
uniform vec3 sun_col : source_color = vec3(1.0);
uniform vec3 base_col : source_color = vec3(0.6, 0.7, 0.8);
uniform float day = 1.0;
varying vec3 vd;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
	vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
		mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s * 2.0 - 1.0; }

void vertex() { vd = normalize(VERTEX); }
void fragment() {
	if (vd.y < 0.12) discard;
	vec2 uv = vd.xz / (vd.y + 0.35) * 1.2;
	float n = fbm(vec3(uv * 0.6 + vec2(TIME * 0.004, TIME * 0.002), TIME * 0.01));
	float n2 = fbm(vec3(uv * 2.3, TIME * 0.02));
	float d = smoothstep(1.0 - cover * 1.4, 1.2 - cover, n * 0.5 + 0.5 + n2 * 0.15);
	float thick = smoothstep(0.2, 1.0, d);
	float s = max(dot(vd, normalize(sun_dir)), 0.0);
	vec3 lit = mix(base_col * 0.55, sun_col * 1.25, pow(s, 4.0) * 0.6 + 0.45) * mix(1.0, 0.45, cover * thick);
	ALBEDO = lit * (0.25 + 0.75 * day);
	ALPHA = d * smoothstep(0.14, 0.45, vd.y) * 0.85;
}

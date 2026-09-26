shader_type spatial;
render_mode diffuse_lambert, specular_disabled;
// Faceted low-poly look: each triangle gets one normal from screen-space derivatives.
uniform vec4 albedo : source_color = vec4(1.0);
uniform bool use_vc = false;
void fragment() {
	if (!use_vc) {
		vec3 n = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
		if (dot(n, VIEW) < 0.0) n = -n;
		NORMAL = n;
	}
	ALBEDO = use_vc ? pow(COLOR.rgb, vec3(2.2)) : albedo.rgb;
	ROUGHNESS = 1.0;
}

extends Node3D
## Per-world weather that changes over time, ported from the original:
## clear, overcast, rain, storm (lightning, with thunder delayed by distance
## at 343 m/s), snow, dust storm, spore fall, ash fall and Titan's slow
## methane drizzle. A cloud layer tracks coverage; fog and sunlight respond.

var surface: Node3D
var prof = null
var type = "clear"
var t = 0.0
var next_change = 200.0
var goal = {"cover": 0.18, "dim": 1.0, "fog": 1.0}
var cur = {"cover": 0.18, "dim": 1.0, "fog": 1.0}
var dim = 1.0
var flash = 0.0
var thunder: Array = []
var rain: GPUParticles3D
var parts: GPUParticles3D
var clouds: MeshInstance3D
var cloud_mat: ShaderMaterial
var bolt: MeshInstance3D
var bolt_t = 0.0
var base_fog = 0.0
var _rain_mat: ParticleProcessMaterial
var _part_mat: ParticleProcessMaterial
var _part_draw: StandardMaterial3D

const COVER := {"clear": 0.18, "overcast": 0.75, "rain": 0.85, "storm": 0.95, "snow": 0.7, "dust": 0.4, "spores": 0.55, "ash": 0.8, "methane": 0.8}
const DIM := {"clear": 1.0, "overcast": 0.55, "rain": 0.42, "storm": 0.3, "snow": 0.55, "dust": 0.5, "spores": 0.6, "ash": 0.45, "methane": 0.5}
const FOGMUL := {"clear": 1.0, "overcast": 1.1, "rain": 1.35, "storm": 1.6, "snow": 1.5, "dust": 2.2, "spores": 1.5, "ash": 1.8, "methane": 1.3}

static func profile(site: Dictionary, id: String):
	var b: String = site.get("biome", "")
	var sky: Dictionary = site.sky
	var vac = float(sky.get("stars", 0)) >= 1.0 and float(sky.get("haze", 0)) < 0.2
	if vac or site.get("style", "") in ["engineer", "bridge"]: return null
	if id == "titan": return [["overcast", 3], ["methane", 3], ["storm", 1]]
	if id == "mars": return [["clear", 4], ["dust", 2], ["overcast", 1]]
	if id == "earth": return [["clear", 4], ["overcast", 2], ["rain", 2], ["storm", 1]]
	if id == "kepler452_b" or b == "jungle" or b == "ocean": return [["clear", 3], ["overcast", 2], ["rain", 3], ["storm", 2]]
	if id == "proxima_b" or id == "lhs1140_b" or b == "tundra": return [["clear", 2], ["overcast", 2], ["snow", 3]]
	if id == "trappist_e": return [["clear", 2], ["overcast", 2], ["rain", 2]]
	if id == "tauceti_f" or b == "desert" or b == "iron": return [["clear", 3], ["dust", 2]]
	if b == "fungal": return [["overcast", 2], ["spores", 3]]
	if b == "lava": return [["overcast", 2], ["ash", 3]]
	if b == "toxic": return [["overcast", 3], ["rain", 2]]
	return [["clear", 3], ["overcast", 2]]

static func _weighted(p: Array, x: float) -> String:
	var tot = 0.0
	for e in p: tot += float(e[1])
	var k = x * tot
	for e in p:
		k -= float(e[1])
		if k <= 0: return e[0]
	return p[p.size() - 1][0]

func _ready() -> void:
	var site: Dictionary = surface.site
	prof = profile(site, surface.site_id)
	if surface.env.fog_enabled: base_fog = surface.env.fog_density
	if prof == null: return
	var rr = Cosmos.Rng.new(Cosmos.hash(surface.site_id + str(int(floor(float(GameState.s.earthYear) * 365.0)))))
	type = _weighted(prof, rr.next())
	next_change = 120 + rr.next() * 200
	# rain: stretched streaks
	rain = GPUParticles3D.new()
	rain.amount = 6000; rain.lifetime = 2.0; rain.visibility_aabb = AABB(Vector3(-50, -40, -50), Vector3(100, 80, 100))
	_rain_mat = ParticleProcessMaterial.new()
	_rain_mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX; _rain_mat.emission_box_extents = Vector3(45, 1, 45)
	_rain_mat.direction = Vector3(0, -1, 0); _rain_mat.spread = 2; _rain_mat.gravity = Vector3.ZERO
	_rain_mat.initial_velocity_min = 15; _rain_mat.initial_velocity_max = 17
	rain.process_material = _rain_mat
	var rq = QuadMesh.new(); rq.size = Vector2(0.02, 0.7)
	var rm = StandardMaterial3D.new(); rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	rm.albedo_color = Color(0.72, 0.78, 0.85, 0.35); rm.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y; rm.billboard_keep_scale = true
	rq.material = rm; rain.draw_pass_1 = rq
	rain.local_coords = false
	add_child(rain)
	# snow / dust / spores / ash
	parts = GPUParticles3D.new()
	parts.amount = 3000; parts.lifetime = 12.0; parts.visibility_aabb = AABB(Vector3(-50, -40, -50), Vector3(100, 80, 100))
	_part_mat = ParticleProcessMaterial.new()
	_part_mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX; _part_mat.emission_box_extents = Vector3(45, 15, 45)
	_part_mat.direction = Vector3(0, -1, 0); _part_mat.spread = 25; _part_mat.gravity = Vector3.ZERO
	_part_mat.turbulence_enabled = true; _part_mat.turbulence_noise_strength = 0.6
	parts.process_material = _part_mat
	var pq = QuadMesh.new(); pq.size = Vector2(0.12, 0.12)
	_part_draw = StandardMaterial3D.new(); _part_draw.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; _part_draw.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_part_draw.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED; _part_draw.albedo_texture = _spark_tex()
	pq.material = _part_draw; parts.draw_pass_1 = pq
	parts.local_coords = false
	add_child(parts)
	# cloud layer
	var sky: Dictionary = site.sky
	if float(sky.get("haze", 0)) >= 0.3 and float(sky.get("stars", 0)) < 1.0:
		cloud_mat = ShaderMaterial.new()
		cloud_mat.shader = load("res://shaders/clouds.gdshader")
		cloud_mat.set_shader_parameter("sun_col", DB.col(sky.get("sunCol", "#ffffff")))
		cloud_mat.set_shader_parameter("base_col", DB.col(sky.hor))
		clouds = MeshInstance3D.new()
		var sm = SphereMesh.new(); sm.radius = 2200; sm.height = 4400; sm.radial_segments = 48; sm.rings = 16; sm.is_hemisphere = true
		sm.flip_faces = true
		clouds.mesh = sm; clouds.material_override = cloud_mat
		clouds.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		clouds.extra_cull_margin = 16384
		add_child(clouds)
	_apply(true)

static func _spark_tex() -> Texture2D:
	var img = Image.create(32, 32, false, Image.FORMAT_RGBA8)
	for y in 32:
		for x in 32:
			var d = Vector2(x - 15.5, y - 15.5).length() / 16.0
			img.set_pixel(x, y, Color(1, 1, 1, clampf(1.0 - d, 0, 1) ** 2))
	return ImageTexture.create_from_image(img)

func force(k: String) -> void:
	if prof == null: return
	type = k
	_apply(true)

func _apply(instant := false) -> void:
	goal = {"cover": COVER.get(type, 0.3), "dim": DIM.get(type, 1.0), "fog": FOGMUL.get(type, 1.0)}
	if instant: cur = goal.duplicate()
	var pc = {"snow": "#ffffff", "dust": "#d8a070", "spores": "#e0a0ff", "ash": "#6a6060", "methane": "#e0a060"}
	if pc.has(type): _part_draw.albedo_color = Color(pc[type])
	var rm: StandardMaterial3D = rain.draw_pass_1.material
	rm.albedo_color = Color(0.85, 0.63, 0.38, 0.4) if type == "methane" else Color(0.72, 0.78, 0.85, 0.35)
	var rainy = type in ["rain", "storm", "methane"]
	var pty = type in ["snow", "dust", "spores", "ash"]
	rain.emitting = rainy; rain.visible = rainy
	parts.emitting = pty; parts.visible = pty
	var fall: float = 1.6 if type == "methane" else (22.0 if type == "storm" else 15.0)
	_rain_mat.initial_velocity_min = fall; _rain_mat.initial_velocity_max = fall * 1.1
	(rain.draw_pass_1 as QuadMesh).size = Vector2(0.02, 0.25 if type == "methane" else 0.7)
	rain.lifetime = 45.0 / fall
	var wind: float = 18.0 if type == "dust" else (6.0 if type == "storm" else 2.0)
	_rain_mat.direction = Vector3(wind * 0.03, -1, 0).normalized()
	var pf: float = {"snow": 1.1, "dust": 0.3, "spores": 0.25, "ash": 0.8}.get(type, 1.0)
	_part_mat.initial_velocity_min = pf; _part_mat.initial_velocity_max = pf * 1.3
	_part_mat.direction = Vector3(wind * (1.0 if type == "dust" else 0.3), -pf, 0).normalized()
	_part_mat.initial_velocity_max = Vector2(wind * (1.0 if type == "dust" else 0.3), pf).length()
	_part_mat.initial_velocity_min = _part_mat.initial_velocity_max * 0.8
	(parts.draw_pass_1 as QuadMesh).size = Vector2.ONE * (0.22 if type == "dust" else 0.12)

func _process(delta: float) -> void:
	if prof == null:
		dim = 1.0
		return
	t += delta
	if t > next_change:
		t = 0; next_change = 150 + randf() * 240
		var prev = type
		type = _weighted(prof, randf())
		if type != prev:
			_apply()
			var msg = {"rain": "Rain moving in.", "storm": "Storm warning: lightning in the area.", "snow": "Snowfall starting.", "dust": "Dust storm approaching. Visibility dropping."}
			if msg.has(type): Game.hud_toast(msg[type])
	for k in cur: cur[k] = lerpf(cur[k], goal[k], 1.0 - exp(-0.25 * delta))
	dim = cur.dim
	if surface.env.fog_enabled: surface.env.fog_density = base_fog * cur.fog
	var cam = get_viewport().get_camera_3d()
	if cam == null: return
	var cp = cam.global_position
	rain.global_position = cp + Vector3(0, 25, 0)
	parts.global_position = cp + Vector3(0, 12, 0)
	if clouds:
		clouds.global_position = cp
		cloud_mat.set_shader_parameter("cover", cur.cover)
		cloud_mat.set_shader_parameter("sun_dir", surface.sun.global_transform.basis.z)
		cloud_mat.set_shader_parameter("day", surface.day)
	if type == "storm" and randf() < delta * 0.12: _strike(cp)
	if flash > 0:
		flash -= delta * 3.5
		surface.env.tonemap_exposure = 1.0 + maxf(0, flash) * 0.9
		if flash <= 0: surface.env.tonemap_exposure = 1.0
	if bolt:
		bolt_t -= delta
		if bolt_t <= 0: bolt.queue_free(); bolt = null
	for th in thunder.duplicate():
		th.d -= delta
		if th.d <= 0:
			Sfx.play("thunder", th.v); thunder.erase(th)
	Sfx.rain_level(0.5 if type == "storm" else (0.3 if type in ["rain", "methane"] else (0.35 if type == "dust" else 0.0)))

func _strike(cp: Vector3) -> void:
	var ang = randf() * TAU; var dist = 150.0 + randf() * 900.0
	var x = cp.x + cos(ang) * dist; var z = cp.z + sin(ang) * dist
	var y0: float = surface.h(x, z)
	var im = ImmediateMesh.new()
	var m = StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color("#e8f0ff"); m.emission_enabled = true; m.emission = Color("#e8f0ff"); m.emission_energy_multiplier = 30
	im.surface_begin(Mesh.PRIMITIVE_LINE_STRIP, m)
	var px = x; var pz = z; var y = y0 + 420.0
	while y > y0:
		im.surface_add_vertex(Vector3(px, y, pz)); px += (randf() - 0.5) * 26; pz += (randf() - 0.5) * 26; y -= 24
	im.surface_add_vertex(Vector3(x, y0, z))
	im.surface_end()
	if bolt: bolt.queue_free()
	bolt = MeshInstance3D.new(); bolt.mesh = im; add_child(bolt)
	var l = OmniLight3D.new(); l.light_color = Color("#dfe8ff"); l.light_energy = 40; l.omni_range = 900; l.position = Vector3(x, y0 + 200, z)
	bolt.add_child(l)
	bolt_t = 0.18; flash = 1.0
	thunder.append({"d": dist / 343.0, "v": clampf(1.4 - dist / 900.0, 0.2, 1.0)})

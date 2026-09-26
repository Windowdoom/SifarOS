extends Node3D
## A walkable planet surface built from its site data: terrain, sky, settlement,
## NPCs, enemies, ores, quest objectives, your ship, vehicles, weather.
## The site id "__bridge" builds the interior of your ship instead.

const EnemyScript = preload("res://scripts/enemy.gd")
const NpcScript = preload("res://scripts/npc.gd")
const RoverScript = preload("res://scripts/rover.gd")
const WeatherScript = preload("res://scripts/weather.gd")

var site_id = ""
var site: Dictionary
var interior = false
var seed = 1
var r: Cosmos.Rng
var pois = {}
var size = 640.0
var cells = 160
var player: Player
var sun: DirectionalLight3D
var env: Environment
var sky_mat: Material
var npcs: Array = []
var enemies: Array = []
var interacts: Array = []   # {pos, r, label, hold, fn, node, quest}
var ores: Array = []
var ship: Node3D
var ship_door = Vector3.ZERO
var vehicles: Array = []
var weather: Node3D
var day_phase = 0.35
var day = 1.0
var hold_t = 0.0
var sea_level = -999.0
var win_mats: Array = []
var fx_root: Node3D
var boss = null
var _noise_a = FastNoiseLite.new()
var _noise_b = FastNoiseLite.new()
var _craters: Array = []
var _flats: Array = []

func site_name() -> String:
	return "%s · Bridge" % GameState.s.ship.name if interior else str(site.get("name", site_id))

func _ready() -> void:
	interior = site_id == "__bridge"
	if interior:
		site = {"name": "Bridge", "g": 1.0, "breathable": true, "style": "bridge", "sky": {"zen": "#000000", "hor": "#000000", "fog": "#05070c", "fogD": 0.0, "sunCol": "#ffffff", "sunEl": 0.5, "stars": 0, "haze": 0}, "ground": ["#222222","#222222","#222222","#222222"], "terrain": {"amp": 0, "plate": true}, "enemies": [], "ores": [], "services": []}
	else:
		site = Cosmos.site(site_id)
	seed = int(site.get("seed", Cosmos.hash(site_id)))
	r = Cosmos.Rng.new(seed)
	day_phase = float(GameState.s.get("dayPhase", 0.35))
	fx_root = Node3D.new(); add_child(fx_root)
	pois = _make_pois()
	_prepare_height()
	_build_environment()
	if interior:
		_build_bridge()
	else:
		_build_terrain()
		if site.get("sea") != null: _build_sea()
		_build_settlement()
		if site.get("style", "") in ["city", "colony", "dome", "shore", "yards"]: _build_bazaar()
		if site.get("style", "") in ["city", "colony", "shore"]: _build_plaza_art()
		_build_props()
		_spawn_ores()
		_spawn_npcs()
		_spawn_wildlife()
		_place_ship()
		_place_vehicles()
		sync_quest_objects()
		weather = WeatherScript.new()
		weather.surface = self
		add_child(weather)
	var amb = site.get("amb", null)
	if interior: Sfx.ambient(0, 420, [36, 54, 72], 0.1)
	elif amb is Dictionary: Sfx.ambient(float(amb.get("wind", 0)), float(amb.get("windFreq", 420)), amb.get("drone", [50, 75]), float(amb.get("vol", 0.18)))
	else: Sfx.ambient(0, 420, [50, 75], 0.18)
	player = Player.new()
	player.surface = self
	player.gravity = 9.81 * float(site.get("g", 1.0))
	add_child(player)
	player.global_position = spawn_point()
	var pd: Array = pois.pad
	player.yaw = atan2(-pd[0], -pd[1]) + PI if not interior else PI
	Game.inst.hud.set_help("WASD move · Shift sprint · Space jump · E use · F vehicle · B board ship · LMB fire · R reload · H heal · V view · J journal · M map · K command · Esc menu")

# ── points of interest (same layout as the browser game) ──────────────
func _make_pois() -> Dictionary:
	var P = {}
	var rr = Cosmos.Rng.new(Cosmos.hash(site_id + "poi"))
	var near = ["shop","bar","clinic","hall","yard","fab","office","union","kiosk","lab","array","range","archive","rig","depot","heart","garage","memorial"]
	for i in near.size():
		var a = float(i) / near.size() * TAU + 0.2
		var rad = 34.0 + (i % 3) * 9.0
		P[near[i]] = [cos(a) * rad, sin(a) * rad]
	P.plaza = [0.0, 0.0]; P.pad = [-72.0, 52.0]; P.custodian = [0.0, -60.0]; P.core = [0.0, -30.0]
	var far = func(k: String, ang: float, rad: float): P[k] = [cos(ang) * rad, sin(ang) * rad]
	far.call("dest", 0.3, 300); far.call("keel", 0.0, 330); far.call("drillsite", 2.4, 300); far.call("vein", 1.1, 200); far.call("rings", -2.2, 150)
	far.call("quarry", -0.7, 190); far.call("icefield", 2.9, 190); far.call("crack", 1.8, 220); far.call("faculae", -1.5, 160)
	for i in range(1, 4):
		far.call("dish%d" % i, i * 2.1 + 0.4, 130 + i * 18); far.call("tower%d" % i, i * 2.09 + 1, 95 + i * 25); far.call("shard%d" % i, i * 2.1 - 0.6, 150 + i * 28)
		far.call("pylon%d" % i, i * 2.094, 70); far.call("strand%d" % i, 0.9 + i * 0.55, 120 + i * 22); far.call("poi%d" % i, rr.next() * TAU, 170 + rr.next() * 260)
	far.call("camp", rr.next() * TAU, 220 + rr.next() * 140)
	if site.get("style") == "city":
		P.garage = [-40.0, -110.0]; P.dest = [260.0, 150.0]
	if site.get("style") == "shore": P.rings = [40.0, -230.0]
	return P

# ── height field ──────────────────────────────────────────────────────
func _prepare_height() -> void:
	var T: Dictionary = site.terrain
	if T.get("plate", false): return
	_noise_a.seed = seed; _noise_a.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise_a.fractal_type = FastNoiseLite.FRACTAL_FBM; _noise_a.fractal_octaves = int(T.get("oct", 5)); _noise_a.frequency = float(T.get("scale", 0.004))
	_noise_b.seed = seed + 91; _noise_b.fractal_type = FastNoiseLite.FRACTAL_RIDGED; _noise_b.fractal_octaves = 5; _noise_b.frequency = float(T.get("scale", 0.004)) * 0.6
	var rr = Cosmos.Rng.new(seed + 7)
	for i in int(T.get("craters", 0)):
		var a = rr.next() * TAU; var d = 150.0 + rr.next() * 420.0
		_craters.append({"x": cos(a) * d, "z": sin(a) * d, "r": 10.0 + pow(rr.next(), 2) * 70.0, "dep": 0.35})
	_flats = [{"x": 0.0, "z": 0.0, "r": float(T.get("flat", 150)), "h": 0.0}]
	for k in ["keel","drillsite","dest","camp","poi1","poi2","poi3","tower1","tower2","tower3","rings","vein","dish1","dish2","dish3"]:
		if pois.has(k): _flats.append({"x": pois[k][0], "z": pois[k][1], "r": 14.0, "h": null})
	for f in _flats:
		if f.h == null: f.h = _base_h(f.x, f.z)

func _base_h(x: float, z: float) -> float:
	var T: Dictionary = site.terrain
	var n = _noise_a.get_noise_2d(x, z)
	if float(T.get("ridge", 0)) > 0:
		n = lerpf(n, _noise_b.get_noise_2d(x + 91, z - 37) * 1.5 - 0.55, float(T.ridge))
	var h = n * float(T.amp)
	var d = Vector2(x, z).length()
	h += smoothstep(300.0, 560.0, d) * float(T.amp) * 0.9
	for c in _craters:
		var dd = Vector2(x - c.x, z - c.z).length() / c.r
		if dd < 1.6:
			if dd < 1.0: h += c.r * c.dep * (dd * dd - 1.0) * 0.6
			else: h += c.r * c.dep * 0.25 * pow((1.6 - dd) / 0.6, 2) * ((dd - 1.0) / 0.2 if dd < 1.2 else 1.0)
	return h

func h(x: float, z: float) -> float:
	var T: Dictionary = site.terrain
	if T.get("plate", false):
		return 0.0 if (interior or Vector2(x, z).length() <= 390.0) else -600.0
	var v = _base_h(x, z)
	for f in _flats:
		var d = Vector2(x - f.x, z - f.z).length()
		if d < f.r * 1.8 + 12.0:
			v = lerpf(f.h, v, smoothstep(f.r, f.r * 1.8 + 12.0, d))
	return v

func ground_at(x: float, z: float) -> float:
	var q = PhysicsRayQueryParameters3D.create(Vector3(x, 500, z), Vector3(x, -700, z))
	var hit = get_world_3d().direct_space_state.intersect_ray(q)
	return hit.position.y if hit else h(x, z)

func spawn_point() -> Vector3:
	if interior: return Vector3(0, 0.2, 4)
	var pd: Array = pois.pad
	var L: float = max(1.0, Vector2(pd[0], pd[1]).length())
	var k = (L - 30.0) / L
	var x: float = pd[0] * k; var z: float = pd[1] * k
	return Vector3(x, h(x, z) + 1.0, z)

# ── environment: sky, sun, fog, post ──────────────────────────────────
func _build_environment() -> void:
	var sky: Dictionary = site.sky
	var vac = float(sky.get("stars", 0)) >= 1.0
	env = Environment.new()
	var s = Sky.new()
	if interior:
		env.background_mode = Environment.BG_COLOR; env.background_color = Color("#05070c")
		env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color("#3a4250"); env.ambient_light_energy = 0.6
	elif vac:
		var pm = PanoramaSkyMaterial.new()
		pm.panorama = Gen.tex("res://assets/planets/starmap.jpg")
		pm.energy_multiplier = 0.35
		s.sky_material = pm; sky_mat = pm
		env.background_mode = Environment.BG_SKY; env.sky = s
		env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color("#7a8494"); env.ambient_light_energy = 0.35
	else:
		var ps = ProceduralSkyMaterial.new()
		ps.sky_top_color = DB.col(sky.zen); ps.sky_horizon_color = DB.col(sky.hor)
		ps.ground_horizon_color = DB.col(sky.hor); ps.ground_bottom_color = DB.col(site.ground[0]).darkened(0.4)
		ps.sun_angle_max = 30.0 * float(sky.get("sunSize", 1.0)); ps.sun_curve = 0.1
		s.sky_material = ps; sky_mat = ps
		env.background_mode = Environment.BG_SKY; env.sky = s
		env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; env.ambient_light_energy = 0.9
		env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES; env.tonemap_exposure = 1.0 if not vac else 1.25
	env.glow_enabled = true; env.glow_intensity = 0.6; env.glow_bloom = 0.08; env.glow_hdr_threshold = 1.1
	env.ssao_enabled = true; env.ssao_radius = 1.2; env.ssao_intensity = 1.6
	if not interior and float(sky.get("fogD", 0)) > 0:
		env.fog_enabled = true
		env.fog_light_color = DB.col(sky.fog)
		env.fog_density = float(sky.fogD) * 0.55
		env.fog_aerial_perspective = 0.4
		env.fog_sky_affect = 0.25
	env.adjustment_enabled = true; env.adjustment_saturation = 1.05; env.adjustment_contrast = 1.05
	# Forward+ high end (Metal on Apple Silicon, Vulkan/D3D12 elsewhere): real-time
	# global illumination, indirect light, reflections and lit volumetric fog.
	if str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "forward_plus")) == "forward_plus" and OS.get_name() != "Web":
		env.sdfgi_enabled = not interior
		env.sdfgi_use_occlusion = true
		env.sdfgi_cascades = 4
		env.sdfgi_min_cell_size = 0.2
		env.sdfgi_energy = 1.0
		env.ssil_enabled = true; env.ssil_radius = 5.0; env.ssil_intensity = 1.0
		env.ssr_enabled = true; env.ssr_max_steps = 64; env.ssr_fade_in = 0.15; env.ssr_fade_out = 2.0
		if not interior and float(sky.get("fogD", 0)) > 0:
			env.volumetric_fog_enabled = true
			env.volumetric_fog_density = clampf(float(sky.fogD) * 0.4, 0.002, 0.03)
			env.volumetric_fog_albedo = DB.col(sky.fog)
			env.volumetric_fog_anisotropy = 0.6
			env.volumetric_fog_length = 180.0
	var we = WorldEnvironment.new(); we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.light_color = DB.col(sky.get("sunCol", "#ffffff"))
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 180.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	add_child(sun)
	_set_sun()
	if not interior: _sky_bodies()

func _set_sun() -> void:
	var sky: Dictionary = site.sky
	var el = float(sky.get("sunEl", 0.5)); var az = 0.6
	if int(site.get("day", 0)) > 0:
		var ph = day_phase * TAU
		el = sin(ph) * 0.85 + 0.1; az = ph * 0.9
	var d = Vector3(cos(az) * cos(el), sin(el), sin(az) * cos(el)).normalized()
	if site.get("id", "") == "proxima_b": d = Vector3(-1, float(sky.sunEl), 0.15).normalized()
	sun.look_at_from_position(Vector3.ZERO, -d, Vector3.UP if absf(d.y) < 0.99 else Vector3.RIGHT)
	day = smoothstep(-0.12, 0.18, d.y)
	var vac = float(sky.get("stars", 0)) >= 1.0
	var base_e = 1.6 if float(sky.get("sunSize", 1.0)) > 2.0 else 2.0
	var wd: float = weather.dim if weather else 1.0
	sun.light_energy = base_e * max(0.03, day) * wd
	if not interior:
		env.ambient_light_energy = (0.35 if vac else 0.9) * (0.25 + 0.75 * day) * wd + (maxf(0.0, weather.flash) * 6.0 if weather else 0.0)
		for m in win_mats:
			m.emission_energy_multiplier = 0.05 + pow(1.0 - day, 1.6) * 2.4

func _sky_bodies() -> void:
	var sb: Array = site.get("skyBodies", [])
	for b in sb:
		var dir = Vector3(b.dir[0], b.dir[1], b.dir[2]).normalized()
		var R = 3000.0
		var rad = tan(float(b.size) / 2.0) * R * 2.0
		var mi = MeshInstance3D.new()
		var sp = SphereMesh.new(); sp.radius = rad; sp.height = rad * 2; sp.radial_segments = 48; sp.rings = 24
		mi.mesh = sp
		var m = StandardMaterial3D.new()
		var texmap = {"earth": "earth_day", "jupiter": "jupiter", "saturn": "saturn"}
		if texmap.has(b.kind):
			m.albedo_texture = Gen.tex("res://assets/planets/%s.jpg" % texmap[b.kind])
		else:
			m.albedo_color = DB.col(b.get("col", "#aaaaaa"))
		m.disable_fog = true
		mi.material_override = m
		mi.position = dir * R
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		if b.kind == "saturn":
			var ring = MeshInstance3D.new()
			var tm = TorusMesh.new(); tm.inner_radius = rad * 1.25; tm.outer_radius = rad * 2.2; tm.rings = 64
			ring.mesh = tm
			var rm = StandardMaterial3D.new(); rm.albedo_color = Color(0.85, 0.78, 0.6, 0.7); rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; rm.disable_fog = true
			ring.material_override = rm; ring.position = mi.position; ring.scale = Vector3(1, 0.02, 1); ring.rotation = Vector3(0.4, 0, 0.2)
			add_child(ring)

# ── terrain ────────────────────────────────────────────────────────────
func _build_terrain() -> void:
	var T: Dictionary = site.terrain
	if T.get("plate", false):
		return
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var step = size / cells
	var tint = DB.col(site.ground[1]).lerp(Color.WHITE, 0.45)
	var hn = FastNoiseLite.new(); hn.seed = seed + 3; hn.frequency = 0.01
	var heights = PackedFloat32Array(); heights.resize((cells + 1) * (cells + 1))
	for j in cells + 1:
		for i in cells + 1:
			var x = -size / 2 + i * step; var z = -size / 2 + j * step
			heights[j * (cells + 1) + i] = h(x, z)
	var amp: float = max(1.0, float(T.amp))
	for j in cells + 1:
		for i in cells + 1:
			var x = -size / 2 + i * step; var z = -size / 2 + j * step
			var y = heights[j * (cells + 1) + i]
			var hx = heights[j * (cells + 1) + min(i + 1, cells)] - heights[j * (cells + 1) + max(i - 1, 0)]
			var hz = heights[min(j + 1, cells) * (cells + 1) + i] - heights[max(j - 1, 0) * (cells + 1) + i]
			var nrm = Vector3(-hx, 2 * step, -hz).normalized()
			var steep = smoothstep(0.82, 0.62, nrm.y)
			var high = smoothstep(amp * 0.35, amp * 0.9, y)
			var patch = smoothstep(-0.2, 0.4, hn.get_noise_2d(x, z))
			var wa: float = max(0.0, 1.0 - steep - high) * (1.0 - patch)
			var wb: float = max(0.0, 1.0 - steep - high) * patch
			st.set_color(Color(wa, wb, steep, high))
			st.set_normal(nrm)
			st.set_uv(Vector2(x, z) * 0.1)
			st.add_vertex(Vector3(x, y, z))
	for j in cells:
		for i in cells:
			var a = j * (cells + 1) + i
			st.add_index(a); st.add_index(a + 1); st.add_index(a + cells + 1)
			st.add_index(a + 1); st.add_index(a + cells + 2); st.add_index(a + cells + 1)
	st.generate_tangents()
	var mesh = st.commit()
	var mi = MeshInstance3D.new(); mi.mesh = mesh
	var tm = Gen.terrain_material(site)
	tm.set_shader_parameter("tint", Vector3(tint.r, tint.g, tint.b))
	mi.material_override = tm
	add_child(mi)
	# collision
	var body = StaticBody3D.new()
	var cs = CollisionShape3D.new()
	var hm = HeightMapShape3D.new()
	hm.map_width = cells + 1; hm.map_depth = cells + 1
	hm.map_data = heights
	cs.shape = hm
	cs.scale = Vector3(step, 1, step)
	body.add_child(cs)
	add_child(body)
	# horizon skirt
	var sk = SurfaceTool.new(); sk.begin(Mesh.PRIMITIVE_TRIANGLES)
	var N = 80; var W = 9000.0
	var fn = FastNoiseLite.new(); fn.seed = seed + 11; fn.frequency = 0.0008
	var gc = DB.col(site.ground[1]).lerp(DB.col(site.ground[3]), 0.3)
	for j in N + 1:
		for i in N + 1:
			var x = -W / 2 + i * W / N; var z = -W / 2 + j * W / N
			var inside = absf(x) < size / 2 - 10 and absf(z) < size / 2 - 10
			var y = h(x, z) + (-12.0 if inside else 0.0)
			if not inside: y += smoothstep(size * 0.5, 4000.0, Vector2(x, z).length()) * amp * 2.2 * (fn.get_noise_2d(x, z) * 0.5 + 0.7)
			sk.set_color(gc); sk.add_vertex(Vector3(x, y, z))
	for j in N:
		for i in N:
			var a = j * (N + 1) + i
			sk.add_index(a); sk.add_index(a + 1); sk.add_index(a + N + 1)
			sk.add_index(a + 1); sk.add_index(a + N + 2); sk.add_index(a + N + 1)
	sk.generate_normals()
	var smi = MeshInstance3D.new(); smi.mesh = sk.commit()
	var sm = StandardMaterial3D.new(); sm.vertex_color_use_as_albedo = true; sm.roughness = 1.0
	smi.material_override = sm
	smi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(smi)

func _build_sea() -> void:
	var sea: Dictionary = site.sea
	sea_level = float(sea.level)
	var mi = MeshInstance3D.new()
	var pm = PlaneMesh.new(); pm.size = Vector2(9000, 9000)
	mi.mesh = pm
	mi.material_override = Gen.water_material(DB.col(sea.color), sea.get("lava", false))
	mi.position.y = sea_level
	add_child(mi)

# ── helpers for building ──────────────────────────────────────────────
func box(x: float, y: float, z: float, w: float, hh: float, d: float, m: Material, rot_y := 0.0, collide := true) -> Node3D:
	var body: Node3D = StaticBody3D.new() if collide else Node3D.new()
	body.position = Vector3(x, y + hh / 2.0, z)
	body.rotation.y = rot_y
	var mi = MeshInstance3D.new()
	var bm = BoxMesh.new(); bm.size = Vector3(w, hh, d)
	mi.mesh = bm; mi.material_override = m
	body.add_child(mi)
	if collide:
		var cs = CollisionShape3D.new(); var sh = BoxShape3D.new(); sh.size = bm.size
		cs.shape = sh; body.add_child(cs)
	add_child(body)
	return body

func mesh_at(mesh: Mesh, pos: Vector3, m: Material, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi = MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = m
	mi.position = pos; mi.rotation = rot; mi.scale = scl
	add_child(mi)
	return mi

func sign_label(text: String, pos: Vector3, look_at_pos: Vector3, col := Color("#ffcf7e"), px := 64) -> void:
	var l = Label3D.new()
	l.text = text; l.font_size = px; l.pixel_size = 0.02; l.modulate = col
	l.outline_size = 8; l.outline_modulate = Color(0, 0, 0, 0.8)
	add_child(l)
	l.position = pos
	l.look_at(look_at_pos, Vector3.UP)
	l.rotate_object_local(Vector3.UP, PI)

func point_light(pos: Vector3, col: Color, energy := 4.0, rng := 30.0) -> OmniLight3D:
	var l = OmniLight3D.new(); l.position = pos; l.light_color = col; l.light_energy = energy; l.omni_range = rng
	add_child(l)
	return l

func dome(x: float, z: float, R: float, col: Color, glass := true) -> void:
	var sp = SphereMesh.new(); sp.radius = R; sp.height = R; sp.is_hemisphere = true; sp.radial_segments = 40; sp.rings = 16
	var m = StandardMaterial3D.new(); m.albedo_color = col; m.roughness = 0.2; m.metallic = 0.4
	if glass:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.albedo_color.a = 0.55
		m.emission_enabled = true; m.emission = Color("#ffd6a0"); m.emission_energy_multiplier = 0.15
	var y = h(x, z)
	mesh_at(sp, Vector3(x, y, z), m)
	var body = StaticBody3D.new(); body.position = Vector3(x, y, z)
	var cs = CollisionShape3D.new(); var sh = CylinderShape3D.new(); sh.radius = R * 0.72; sh.height = R * 0.8
	cs.shape = sh; cs.position.y = R * 0.4; body.add_child(cs); add_child(body)
	point_light(Vector3(x, y + R * 0.4, z), Color("#ffd6a0"), 3.0, R * 2)

# ── settlements by style ──────────────────────────────────────────────
func _build_settlement() -> void:
	var st: String = site.get("style", "wild")
	var matA = Gen.panel(Color("#8a96a4"), Cosmos.hash("#8a96a4") % 6)
	var matB = Gen.panel(Color("#5a6474"), Cosmos.hash("#5a6474") % 6)
	var dark = Gen.mat(Color("#1c2028"), 0.5, 0.5)
	var labels = {"shop":"SUPPLY","bar":"THE TIRED ATLAS" if site_id == "earth" else "CANTINA","clinic":"CLINIC","hall":"COMMAND","yard":"HULLS","fab":"FABRICATOR","office":"YARD OFFICE","union":"DUST UNION","kiosk":"ORACLE","lab":"RESEARCH","array":"FAR-SIDE ARRAY","range":"RANGE","archive":"ARCHIVE","rig":"DEEPWELL","depot":"DEPOT","garage":"GARAGE"}
	var used = {}
	for id in DB.D.NPCS:
		if DB.D.NPCS[id].site == site_id: used[DB.D.NPCS[id].poi] = true
	for sv in site.get("services", []):
		var mp = {"market":"shop","bar":"bar","clinic":"clinic","crafting":"fab","shipyard":"yard","jobs":"hall","black":"depot"}
		if mp.has(sv): used[mp[sv]] = true
	var human = ["city","dome","yards","ice","shore","colony","rigs","outpost","camp"]
	if human.has(st):
		for k in used:
			if not pois.has(k) or ["plaza","pad","heart","custodian","core"].has(k) or str(k).right(1).is_valid_int(): continue
			var p: Array = pois[k]
			var a = atan2(p[1], p[0])
			var w = 10 + r.next() * 6; var hh = 5 + r.next() * 4; var d = 9 + r.next() * 4
			var bx: float = p[0] + cos(a) * (d / 2 + 3); var bz: float = p[1] + sin(a) * (d / 2 + 3)
			box(bx, h(bx, bz), bz, w, hh, d, matA if r.next() < 0.5 else matB, -a + PI / 2)
			var door_pos = Vector3(bx - cos(a) * (d / 2 + 0.05), h(bx, bz) + 1.5, bz - sin(a) * (d / 2 + 0.05))
			var door = mesh_at(_quad(2.4, 3), door_pos, Gen.glow(Color("#8fd0e8"), 2.0))
			door.look_at(Vector3(0, door_pos.y, 0), Vector3.UP); door.rotate_object_local(Vector3.UP, PI)
			if labels.has(k):
				sign_label(labels[k], Vector3(bx - cos(a) * (d / 2 + 0.1), h(bx, bz) + hh - 0.9, bz - sin(a) * (d / 2 + 0.1)), Vector3(0, h(bx, bz) + hh - 0.9, 0))
	# landing pad
	var pd: Array = pois.pad
	var pad = CylinderMesh.new(); pad.top_radius = 18; pad.bottom_radius = 19; pad.height = 0.6; pad.radial_segments = 48
	var py = h(pd[0], pd[1])
	mesh_at(pad, Vector3(pd[0], py + 0.3, pd[1]), Gen.panel(Color("#4a5060"), 5))
	var ring = TorusMesh.new(); ring.inner_radius = 15.9; ring.outer_radius = 16.1; ring.rings = 64
	mesh_at(ring, Vector3(pd[0], py + 0.62, pd[1]), Gen.glow(Color("#f2a33a"), 1.3))
	var pb = StaticBody3D.new(); var pcs = CollisionShape3D.new(); var pcy = CylinderShape3D.new(); pcy.radius = 18.5; pcy.height = 0.6
	pcs.shape = pcy; pb.position = Vector3(pd[0], py + 0.3, pd[1]); pb.add_child(pcs); add_child(pb)
	if human.has(st):
		for q in [[12, 12], [-12, -12]]:
			box(q[0], h(q[0], q[1]), q[1], 0.3, 6, 0.3, dark)
			mesh_at(_sphere(0.4), Vector3(q[0], h(q[0], q[1]) + 6.2, q[1]), Gen.glow(Color("#ffd6a0"), 4))
			point_light(Vector3(q[0], h(q[0], q[1]) + 6, q[1]), Color("#ffd6a0"), 3.0, 40)
	match st:
		"city": _build_city(matA, matB, dark)
		"dome", "ice":
			for i in 7:
				var a = i / 7.0 * TAU + 0.4; var d = 70 + r.next() * 40
				var x = cos(a) * d; var z = sin(a) * d; var R = 10 + r.next() * 12
				dome(x, z, R, Color("#cfe0ea") if st == "ice" else Color("#aab4c0"))
				var tl = d - R - 8
				var tube = CylinderMesh.new(); tube.top_radius = 1.6; tube.bottom_radius = 1.6; tube.height = tl; tube.radial_segments = 16
				var t = mesh_at(tube, Vector3(cos(a) * (R + 4 + tl / 2), h(cos(a) * (R + 4 + tl / 2), sin(a) * (R + 4 + tl / 2)) + 1.6, sin(a) * (R + 4 + tl / 2)), matB)
				t.rotation = Vector3(0, -a, PI / 2)
			if site_id == "luna":
				for i in range(1, 4): _dish(pois["dish%d" % i][0], pois["dish%d" % i][1], matA)
			if st == "ice":
				for i in 3:
					var x = -40.0 + i * 40; var z = -90.0
					box(x, h(x, z), z, 4, 26, 4, dark)
				box(pois.drillsite[0], h(pois.drillsite[0], pois.drillsite[1]), pois.drillsite[1], 8, 4, 6, matB)
		"yards":
			for i in 4:
				var a = i / 4.0 * TAU + 0.7; var d = 95.0
				var x = cos(a) * d; var z = sin(a) * d
				var hg = CylinderMesh.new(); hg.top_radius = 16; hg.bottom_radius = 16; hg.height = 40; hg.radial_segments = 24
				var m = mesh_at(hg, Vector3(x, h(x, z), z), matA); m.rotation = Vector3(0, -a, PI / 2); m.scale = Vector3(1, 1, 0.5)
				var hull = Gen.ship(Color("#6a7280")); hull.position = Vector3(x + cos(a) * 30, h(x, z) + 8, z + sin(a) * 30); hull.rotation.y = -a; hull.scale = Vector3.ONE * 0.7
				add_child(hull)
				for jj in 2:
					var cx = x + cos(a + 1.57) * (14 if jj else -14); var cz = z + sin(a + 1.57) * (14 if jj else -14)
					box(cx, h(cx, cz), cz, 1.2, 34, 1.2, Gen.mat(Color("#d8a040"), 0.5, 0.4))
			box(pois.memorial[0], h(pois.memorial[0], pois.memorial[1]), pois.memorial[1], 1.2, 3.5, 1.2, Gen.mat(Color("#c8b8a8")))
		"shore":
			for i in 14:
				var x = -120.0 + i * 18 + r.next() * 6; var z = -160.0 - r.next() * 50; var hh = 5 + r.next() * 4
				box(x, h(x, z), z, 7, hh, 7, matA if r.next() < 0.5 else matB)
			for i in 3:
				var x = 60.0 + i * 30; var z = -70.0
				box(x, h(x, z), z, 6, 40, 6, dark)
				mesh_at(_sphere(3), Vector3(x, h(x, z) + 43, z), Gen.glow(Color("#ff9a3a"), 6))
				point_light(Vector3(x, h(x, z) + 43, z), Color("#ff9a3a"), 8, 80)
		"colony":
			for i in 14:
				var a = r.next() * TAU; var d = 55 + r.next() * 80
				var x = cos(a) * d; var z = sin(a) * d
				if Vector2(x - pd[0], z - pd[1]).length() < 30: continue
				if i % 3 == 0: dome(x, z, 5, Color("#9fe0a8"))
				else: box(x, h(x, z), z, 8 + r.next() * 4, 3.5, 6, matA if r.next() < 0.5 else matB, r.next() * 3)
			if pois.has("keel"):
				var kp: Array = pois.keel
				var keel = CylinderMesh.new(); keel.top_radius = 9; keel.bottom_radius = 14; keel.height = 60; keel.radial_segments = 6
				var km = StandardMaterial3D.new(); km.albedo_color = Color("#18161a"); km.metallic = 0.95; km.roughness = 0.15; km.emission_enabled = true; km.emission = Color("#f2a33a"); km.emission_energy_multiplier = 0.2
				var k = mesh_at(keel, Vector3(kp[0], h(kp[0], kp[1]) - 12, kp[1]), km); k.rotation.z = 0.35
		"rigs":
			for i in 6:
				var a = i / 6.0 * TAU; var d = 80 + r.next() * 30
				var x = cos(a) * d; var z = sin(a) * d
				for dx in [-3, 3]:
					for dz in [-3, 3]:
						box(x + dx, h(x, z), z + dz, 0.8, 30, 0.8, Gen.mat(Color("#d8a040"), 0.5, 0.5))
				box(x, h(x, z) + 28, z, 8, 2, 8, dark)
		"reef":
			for i in 40:
				var a = r.next() * TAU; var d = 25 + r.next() * 140
				var x = cos(a) * d; var z = sin(a) * d; var hh = 6 + r.next() * 22
				var col: Color = [Color("#3ad8ff"), Color("#8a6aff"), Color("#3affc0"), Color("#ff6ad8")][int(r.next() * 4)]
				var cm = StandardMaterial3D.new(); cm.albedo_color = Color("#0e2a30"); cm.emission_enabled = true; cm.emission = col; cm.emission_energy_multiplier = 1.4; cm.roughness = 0.3
				var cone = CylinderMesh.new(); cone.top_radius = 0.0; cone.bottom_radius = 1 + r.next() * 2.5; cone.height = hh; cone.radial_segments = 7
				mesh_at(cone, Vector3(x, h(x, z) + hh / 2 - 1, z), cm, Vector3((r.next() - 0.5) * 0.3, r.next() * 3, (r.next() - 0.5) * 0.3))
			var heart = mesh_at(_sphere(3.5), Vector3(pois.heart[0], 3.5, pois.heart[1]), Gen.glow(Color("#5fe0ff"), 2.5))
			heart.name = "Heart"
		"ruins":
			var mm = Gen.mat(Color("#3a3e48"), 0.35, 0.85)
			for i in 60:
				var a = r.next() * TAU; var d = 30 + r.next() * 260
				var x = cos(a) * d; var z = sin(a) * d
				var hh = 30 + r.next() * 60 if r.next() < 0.2 else 4 + r.next() * 16
				var w = 4 + r.next() * 8
				var b = box(x, h(x, z) - 1, z, w, hh, w * (0.5 + r.next() * 0.8), mm, r.next() * 0.5)
				if r.next() < 0.3: b.rotation.z = (r.next() - 0.5) * 0.25
				if r.next() < 0.4:
					var ln = BoxMesh.new(); ln.size = Vector3(w + 0.1, 0.12, 0.2)
					mesh_at(ln, Vector3(x, h(x, z) + hh * 0.6, z), Gen.glow(Color("#6a7a9a"), 1.2))
			box(pois.core[0], 0, pois.core[1] - 12, 14, 90, 14, mm)
			var cl = BoxMesh.new(); cl.size = Vector3(14.2, 1, 14.2)
			mesh_at(cl, Vector3(pois.core[0], 60, pois.core[1] - 12), Gen.glow(Color("#a38cff"), 2.5))
			for i in range(1, 4): box(pois["tower%d" % i][0] + 6, h(pois["tower%d" % i][0], pois["tower%d" % i][1]), pois["tower%d" % i][1], 6, 40, 6, mm)
		"elder":
			var sm = StandardMaterial3D.new(); sm.albedo_texture = Gen.tex("res://assets/textures/pavers_color.jpg"); sm.normal_enabled = true; sm.normal_texture = Gen.tex("res://assets/textures/pavers_normal.jpg")
			sm.albedo_color = Color("#d8c4a0"); sm.roughness = 0.9; sm.uv1_triplanar = true; sm.uv1_world_triplanar = true; sm.uv1_scale = Vector3.ONE * 0.125
			for t in 4:
				var R = 60.0 + t * 28; var hh = 3.0 + t * 3
				for i in 16:
					var a = i / 16.0 * TAU + t * 0.2
					var x = cos(a) * R; var z = sin(a) * R
					if Vector2(x - pd[0], z - pd[1]).length() < 26: continue
					box(x, h(x, z), z, 16, hh, 10, sm, -a + PI / 2)
			for i in 10:
				var a = i / 10.0 * TAU
				box(cos(a) * 28, 0, sin(a) * 28, 2.4, 14, 2.4, sm)
			var arch = TorusMesh.new(); arch.inner_radius = 12; arch.outer_radius = 16; arch.rings = 40
			mesh_at(arch, Vector3(0, 0, -44), sm, Vector3(PI / 2, 0, 0), Vector3(1, 1, 1))
		"engineer", "vault":
			var em = Gen.mat(Color("#18161a"), 0.18, 0.95)
			var plate = CylinderMesh.new(); plate.top_radius = 390; plate.bottom_radius = 392; plate.height = 4; plate.radial_segments = 96
			mesh_at(plate, Vector3(0, -2, 0), em)
			_plate_collider()
			for R in [60.0, 140.0, 240.0, 340.0]:
				var rg = TorusMesh.new(); rg.inner_radius = R; rg.outer_radius = R + 0.6; rg.rings = 128
				mesh_at(rg, Vector3(0, 0.03, 0), Gen.glow(Color("#f2a33a"), 2.0), Vector3.ZERO, Vector3(1, 0.05, 1))
			for i in 12:
				var a = i / 12.0 * TAU + 0.13
				box(cos(a) * 300, 0, sin(a) * 300, 12, 120 + r.next() * 120, 12, em)
			if st == "engineer":
				for i in range(1, 4):
					var p: Array = pois["pylon%d" % i]
					box(p[0], 0, p[1], 3, 14, 3, em)
					var cap = mesh_at(_sphere(1.6), Vector3(p[0], 16, p[1]), Gen.glow(Color("#f2a33a"), 5.0 if GameState.s.flags.get("pylon_%d" % i) else 0.5))
					cap.name = "PylonCap%d" % i
			if site_id == "anchorage":
				box(0, 0, -90, 40, 70, 20, em)
				mesh_at(_quad(14, 30), Vector3(0, 15, -79.9), Gen.glow(Color("#ffcf7e"), 3))
		"theatre": _build_theatre()
		"outpost":
			for i in 5:
				var a = r.next() * TAU; var d = 40 + r.next() * 40
				box(cos(a) * d, h(cos(a) * d, sin(a) * d), sin(a) * d, 8, 3.5, 6, matA if r.next() < 0.5 else matB, r.next() * 3)
			mesh_at(_sphere(5), Vector3(-30, h(-30, 50) + 5, 50), Gen.mat(Color("#d8dde2"), 0.4, 0.5))
		"camp":
			for i in 10:
				var a = r.next() * TAU; var d = 15 + r.next() * 35
				box(cos(a) * d, h(cos(a) * d, sin(a) * d), sin(a) * d, 5 + r.next() * 6, 2 + r.next() * 2.5, 1, Gen.mat(Color("#5a4a3a"), 0.6, 0.4), r.next() * 3)
			point_light(Vector3(0, h(0, 0) + 1.5, 0), Color("#ff8a3a"), 6, 30)
		"alien": _build_alien_town()
		"derelict", "crash":
			var hm = Gen.panel(Color("#5a6070"), 9, 1.0)
			for i in (7 if st == "derelict" else 4):
				var x = (r.next() - 0.5) * 160; var z = (r.next() - 0.5) * 160
				var w = 30 + r.next() * 50 if st == "derelict" else 8 + r.next() * 14
				var b = box(x, h(x, z) - 3, z, w, 8 + r.next() * 14, 10 + r.next() * 16, hm, r.next() * 3)
				b.rotation.z = (r.next() - 0.5) * 0.4
	for k in ["poi1", "poi2", "poi3"]:
		var p: Array = pois[k]
		var col = Color("#a38cff") if k == "poi2" else (Color("#3ec9a7") if k == "poi3" else Color("#f2a33a"))
		var b = mesh_at(_octa(1.2), Vector3(p[0], h(p[0], p[1]) + 2, p[1]), Gen.glow(col, 2))
		b.add_to_group("spin")
	_build_colony()

## Street life around the plaza: market stalls under coloured awnings,
## string lights, planters with trees, benches, and a crowd that lingers.
func _build_bazaar() -> void:
	var rr = Cosmos.Rng.new(seed + 404)
	var awn = [Color("#c8412c"), Color("#e0a030"), Color("#2f7f6f"), Color("#3a5aa8"), Color("#8a3a7a"), Color("#d86a3a")]
	var wood = Gen.mat(Color("#6a4a30"), 0.8)
	var goods = [Color("#e8c060"), Color("#d04a3a"), Color("#6ab04c"), Color("#f0e0c0"), Color("#b07ad0")]
	for i in 14:
		var a = float(i) / 14.0 * TAU + 0.1
		var d = 20.0 + (i % 2) * 5.0
		var x = cos(a) * d; var z = sin(a) * d
		var y = h(x, z)
		var rot = -a + PI / 2
		var st = Node3D.new(); st.position = Vector3(x, y, z); st.rotation.y = rot; add_child(st)
		for px in [-1.4, 1.4]:
			for pz in [-0.9, 0.9]:
				var post = MeshInstance3D.new(); var c = CylinderMesh.new(); c.top_radius = 0.05; c.bottom_radius = 0.05; c.height = 2.4
				post.mesh = c; post.material_override = wood; post.position = Vector3(px, 1.2, pz); st.add_child(post)
		var roof = MeshInstance3D.new(); var rb = BoxMesh.new(); rb.size = Vector3(3.2, 0.06, 2.3); roof.mesh = rb
		var am = StandardMaterial3D.new(); am.albedo_color = awn[i % awn.size()]; am.roughness = 0.9
		roof.material_override = am; roof.position.y = 2.45; roof.rotation.x = 0.12; st.add_child(roof)
		var table = MeshInstance3D.new(); var tb = BoxMesh.new(); tb.size = Vector3(2.6, 0.9, 0.9); table.mesh = tb
		table.material_override = wood; table.position = Vector3(0, 0.45, 0.4); st.add_child(table)
		for g in 6:
			var gm = MeshInstance3D.new(); var gs = SphereMesh.new(); gs.radius = 0.14; gs.height = 0.24
			gm.mesh = gs; gm.material_override = Gen.mat(goods[int(rr.next() * goods.size())], 0.6)
			gm.position = Vector3(-1.0 + g * 0.4, 1.0, 0.4 + (rr.next() - 0.5) * 0.4); st.add_child(gm)
		var lamp = OmniLight3D.new(); lamp.light_color = Color("#ffc878"); lamp.light_energy = 1.2; lamp.omni_range = 6; lamp.position = Vector3(0, 2.2, 0.4)
		st.add_child(lamp)
		var sb = StaticBody3D.new(); var cs = CollisionShape3D.new(); var bs = BoxShape3D.new(); bs.size = Vector3(2.6, 0.9, 0.9); cs.shape = bs
		cs.position = Vector3(0, 0.45, 0.4); sb.add_child(cs); st.add_child(sb)
		add_npc({"name": DB.D.NAMES.first[int(rr.next() * DB.D.NAMES.first.size())] + " the trader", "role": "Stallholder", "dlg": "vendor"}, x + cos(a) * 1.6, z + sin(a) * 1.6, true)
	# string lights between stalls
	var bulb = Gen.glow(Color("#ffd89a"), 3.0)
	for i in 14:
		var a0 = float(i) / 14.0 * TAU + 0.1; var a1 = float(i + 1) / 14.0 * TAU + 0.1
		var p0 = Vector3(cos(a0) * 22.5, h(cos(a0) * 22.5, sin(a0) * 22.5) + 3.2, sin(a0) * 22.5)
		var p1 = Vector3(cos(a1) * 22.5, h(cos(a1) * 22.5, sin(a1) * 22.5) + 3.2, sin(a1) * 22.5)
		for k in 7:
			var t = float(k) / 7.0
			var b = MeshInstance3D.new(); var bm = SphereMesh.new(); bm.radius = 0.07; bm.height = 0.14; b.mesh = bm; b.material_override = bulb
			b.position = p0.lerp(p1, t) - Vector3(0, sin(t * PI) * 0.5, 0); add_child(b)
	# planters with trees and benches around the plaza
	for i in 10:
		var a = float(i) / 10.0 * TAU
		var x = cos(a) * 12.0; var z = sin(a) * 12.0; var y = h(x, z)
		box(x, y, z, 1.6, 0.6, 1.6, Gen.mat(Color("#8a8278"), 0.9))
		var crown = MeshInstance3D.new(); var cm = SphereMesh.new(); cm.radius = 1.4; cm.height = 2.4; crown.mesh = cm
		crown.material_override = Gen.mat(Color("#3f7a34").lerp(Color("#6a9a3a"), rr.next()), 0.85); crown.position = Vector3(x, y + 3.2, z); add_child(crown)
		var trunk = MeshInstance3D.new(); var tm = CylinderMesh.new(); tm.top_radius = 0.12; tm.bottom_radius = 0.18; tm.height = 2.4; trunk.mesh = tm
		trunk.material_override = Gen.mat(Color("#4a3424")); trunk.position = Vector3(x, y + 1.6, z); add_child(trunk)
		var ba = a + PI / 10.0
		box(cos(ba) * 12.0, h(cos(ba) * 12.0, sin(ba) * 12.0), sin(ba) * 12.0, 1.8, 0.45, 0.5, Gen.mat(Color("#7a5a3a"), 0.8), -ba)
	# a crowd that lingers near the market
	for i in 24:
		var a = rr.next() * TAU; var d = 6.0 + rr.next() * 26.0
		var nm = DB.D.NAMES.first[int(rr.next() * DB.D.NAMES.first.size())]
		var n = add_npc({"name": nm, "role": "citizen", "citizen": true}, cos(a) * d, sin(a) * d, rr.next() < 0.4)
		n.set_meta("home_r", 32.0)

func _plate_collider() -> void:
	var b = StaticBody3D.new()
	var cs = CollisionShape3D.new(); var sh = CylinderShape3D.new(); sh.radius = 390; sh.height = 4
	cs.shape = sh; cs.position.y = -2; b.add_child(cs); add_child(b)

func _dish(x: float, z: float, m: Material) -> void:
	var y = h(x, z)
	box(x, y, z, 1.2, 8, 1.2, m)
	var sp = SphereMesh.new(); sp.radius = 7; sp.height = 4; sp.is_hemisphere = true
	var dm = Gen.mat(Color("#d8dde2"), 0.3, 0.6)
	var d = mesh_at(sp, Vector3(x, y + 9, z), dm)
	d.rotation.x = PI * 0.7

func _build_city(matA: Material, matB: Material, dark: Material) -> void:
	var block = 36.0; var street = 14.0
	for i in 6:
		win_mats.append(Gen.facade(i, [Color("#e8ecf0"), Color("#d8dce4"), Color("#f0ece6"), Color("#c8d0dc"), Color("#e0e0e0"), Color("#d0d8e0")][i], i % 3 != 0))
	var signs = ["NOODLES","SOLNET","ORACLE CARES","HOTEL","LOTUS","PHARMACY","KEBAB 24H","AI-FREE","KARAOKE","BANK OF LUNA","FRONTIER? NO THANKS","DREAM TANKS"]
	var scol = [Color("#ff4a8a"), Color("#4ad8ff"), Color("#a38cff"), Color("#ffcf4a"), Color("#6aff9a"), Color("#ff7a3a")]
	for bx in range(-6, 7):
		for bz in range(-6, 7):
			var cx = bx * (block + street); var cz = bz * (block + street)
			var d = Vector2(cx, cz).length()
			if d < 60 or d > 300: continue
			if Vector2(cx - pois.pad[0], cz - pois.pad[1]).length() < 45: continue
			if Vector2(cx - pois.garage[0], cz - pois.garage[1]).length() < 25: continue
			if Vector2(cx - pois.dest[0], cz - pois.dest[1]).length() < 25: continue
			var n = 1 + int(r.next() * 3)
			for i in n:
				var w = 10 + r.next() * (block / n - 6); var dd = 10 + r.next() * 16
				var hh = (14 + r.next() * r.next() * 110) * (1 - d / 400)
				var x = cx + (i - (n - 1) / 2.0) * (block / n); var z = cz + (r.next() - 0.5) * 8
				box(x, 0, z, w, hh, dd, win_mats[int(r.next() * 6)])
				if r.next() < 0.35:
					sign_label(signs[int(r.next() * signs.size())], Vector3(x, 6 + r.next() * min(20, hh - 8), z + dd / 2 + 0.1), Vector3(x, 6, z + 50), scol[int(r.next() * scol.size())], 96)
				if hh > 70:
					mesh_at(_sphere(0.6), Vector3(x, hh + 1, z), Gen.glow(Color("#ff3a3a"), 6))
	# streets
	var road = Gen.mat(Color("#23262c"), 0.85, 0.0)
	for k in range(-6, 7):
		var p = k * (block + street) - (block + street) / 2
		var rm = BoxMesh.new(); rm.size = Vector3(street, 0.05, 640)
		mesh_at(rm, Vector3(p, 0.03, 0), road)
		var rm2 = BoxMesh.new(); rm2.size = Vector3(640, 0.05, street)
		mesh_at(rm2, Vector3(0, 0.035, p), road)
	if GameState.s.flags.get("built_elevator"):
		var t = CylinderMesh.new(); t.top_radius = 0.6; t.bottom_radius = 0.6; t.height = 6000
		mesh_at(t, Vector3(-520, 3000, -900), Gen.glow(Color("#dfe8ff"), 1.2))

func _build_alien_town() -> void:
	var civ = Cosmos.civ_by_id(site.get("civ", "")) if site.get("civ") != null else null
	var col: Color = civ.color if civ else Color("#8ae0ff")
	var m = StandardMaterial3D.new(); m.albedo_color = col.darkened(0.5); m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = 0.4; m.roughness = 0.3; m.metallic = 0.5
	for i in 22:
		var a = r.next() * TAU; var d = 20 + r.next() * 90
		var x = cos(a) * d; var z = sin(a) * d
		var hh = 4 + r.next() * 18
		var c = CylinderMesh.new(); c.top_radius = 0.6 + r.next() * 2; c.bottom_radius = 2 + r.next() * 3; c.height = hh; c.radial_segments = 6 + int(r.next() * 4)
		mesh_at(c, Vector3(x, h(x, z) + hh / 2, z), m)
		var b = StaticBody3D.new(); var cs = CollisionShape3D.new(); var sh = CylinderShape3D.new(); sh.radius = c.bottom_radius; sh.height = hh
		cs.shape = sh; b.position = Vector3(x, h(x, z) + hh / 2, z); b.add_child(cs); add_child(b)

func _build_theatre() -> void:
	var white = Gen.panel(Color("#e6eaee"), 4, 0.4)
	var plate = CylinderMesh.new(); plate.top_radius = 390; plate.bottom_radius = 392; plate.height = 4; plate.radial_segments = 96
	mesh_at(plate, Vector3(0, -2, 0), white)
	_plate_collider()
	for R in [40.0, 120.0, 220.0, 320.0]:
		var rg = TorusMesh.new(); rg.inner_radius = R; rg.outer_radius = R + 0.35; rg.rings = 128
		mesh_at(rg, Vector3(0, 0.02, 0), Gen.glow(Color("#8fe8ff"), 2.0), Vector3.ZERO, Vector3(1, 0.05, 1))
	for i in 8:
		var a = i / 8.0 * TAU + PI / 8
		var x = cos(a) * 230; var z = sin(a) * 230; var lit = i != 5
		box(x, 0, z, 46, 60, 30, Gen.panel(Color("#eef1f3"), 3, 0.35) if lit else Gen.mat(Color("#1a2026"), 0.3, 0.6), -a + PI / 2)
		var door = mesh_at(_quad(10, 24), Vector3(cos(a) * 214.9, 12, sin(a) * 214.9), Gen.glow(Color("#dff6ff") if lit else Color("#223038"), 2.2 if lit else 0.4))
		door.look_at(Vector3(0, 12, 0), Vector3.UP); door.rotate_object_local(Vector3.UP, PI)
		if lit: point_light(Vector3(cos(a) * 205, 10, sin(a) * 205), Color("#cfefff"), 6, 60)
	var t: Array = pois.custodian
	box(t[0], 0, t[1], 4, 1.1, 10, white)
	var tl = BoxMesh.new(); tl.size = Vector3(4.2, 0.08, 10.2)
	mesh_at(tl, Vector3(t[0], 1.12, t[1]), Gen.glow(Color("#8fe8ff"), 1.6))
	var lamp = CylinderMesh.new(); lamp.top_radius = 9; lamp.bottom_radius = 9; lamp.height = 1.2
	mesh_at(lamp, Vector3(t[0], 26, t[1]), white)
	for i in 7:
		var a = i / 7.0 * TAU
		var c = CylinderMesh.new(); c.top_radius = 1.8; c.bottom_radius = 1.8; c.height = 0.1
		mesh_at(c, Vector3(t[0] + (cos(a) * 5 if i else 0.0), 25.35, t[1] + (sin(a) * 5 if i else 0.0)), Gen.glow(Color.WHITE, 6))
	var sl = SpotLight3D.new(); sl.position = Vector3(t[0], 25, t[1]); sl.rotation.x = -PI / 2; sl.light_energy = 12; sl.spot_range = 60; sl.spot_angle = 28; sl.shadow_enabled = true
	add_child(sl)
	for i in 24:
		var a = i / 24.0 * TAU
		box(cos(a) * 120, 0, sin(a) * 120, 1.2, 14, 1.2, white)

## A colony you (or the Concord) chartered grows around the landing pad.
func _build_colony() -> void:
	var s = GameState.s
	if not s.has("pol"): return
	var c = s.pol.colonies.get(site_id)
	if c == null or not c.get("founded", false): return
	var rr = Cosmos.Rng.new(Cosmos.hash(site_id + "colony"))
	var hab = Gen.panel(Color("#dfe2e6"), 2)
	var n = 2 + int(c.level) * 2 + c.built.size()
	var cx: float = pois.pad[0] * 0.4; var cz: float = pois.pad[1] * 0.4
	for i in n:
		var a = i * 2.399 + rr.next() * 0.3; var d = 18.0 + i * 4.2
		var x = cx + cos(a) * d; var z = cz + sin(a) * d
		if Vector2(x - pois.pad[0], z - pois.pad[1]).length() < 24: continue
		if i % 3 == 0: dome(x, z, 5 + rr.next() * 3, Color("#cfe0ea"))
		else: box(x, h(x, z), z, 7 + rr.next() * 3, 3.2, 5 + rr.next() * 2, hab, rr.next() * 3)
	sign_label("COLONY" if c.owner == "player" else "CONCORD COLONY", Vector3(cx, h(cx, cz) + 5, cz), Vector3(0, h(cx, cz) + 5, 0), Color("#8fd0e8"))
	add_interact(Vector3(cx, h(cx, cz), cz), 5, "Colony office", 0, func(): Game.inst.ui.show_command("colonies"))

func _build_props() -> void:
	var st: String = site.get("style", "")
	var N = 0 if (st == "engineer" or st == "theatre") else (60 if st == "city" else 160)
	var kinds = {"trees":"tree","boulders":"rock","mesas":"rock","iceSpikes":"spike","lichen":"lichen","coral":"coral","monoliths":"rock","pylons":"","fungus":"fungus","crystals":"crystal"}
	var kind: String = kinds.get(site.get("props", ""), "rock")
	if kind == "" or N == 0: return
	var base = DB.col(site.ground[3])
	var mm = MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
	var mesh: Mesh
	var m: Material
	match kind:
		"tree":
			mesh = _sphere(1.0); m = Gen.mat(DB.col(site.ground[1]).darkened(0.2), 0.85)
		"fungus":
			mesh = _sphere(1.0); m = Gen.glow(Color("#b07ad0"), 0.8)
		"spike":
			var c = CylinderMesh.new(); c.top_radius = 0; c.bottom_radius = 0.6; c.height = 4; mesh = c; m = Gen.mat(Color("#dfeaf2"), 0.2, 0.2)
		"crystal":
			mesh = _octa(1.0); m = Gen.glow(Color("#8ae0ff"), 1.2)
		_:
			var sp = SphereMesh.new(); sp.radius = 1; sp.height = 1.6; sp.radial_segments = 8; sp.rings = 5; mesh = sp; m = Gen.mat(base, 0.95)
	mm.mesh = mesh
	var xf = []
	var tries = 0
	while xf.size() < N and tries < N * 4:
		tries += 1
		var x = (r.next() - 0.5) * size * 0.9; var z = (r.next() - 0.5) * size * 0.9
		if Vector2(x, z).length() < float(site.terrain.get("flat", 150)) * 0.8: continue
		var y = h(x, z)
		if sea_level > -900 and y < sea_level + 1: continue
		var s = 1.0 + r.next() * 3.0
		var sc = Vector3(s, s * (1.4 if kind == "tree" else 0.8), s)
		if kind == "tree": sc = Vector3(s * 1.6, s * 2.2, s * 1.6)
		xf.append(Transform3D(Basis(Vector3.UP, r.next() * TAU).scaled(sc), Vector3(x, y + sc.y * 0.3, z)))
	mm.instance_count = xf.size()
	for i in xf.size(): mm.set_instance_transform(i, xf[i])
	var mmi = MultiMeshInstance3D.new(); mmi.multimesh = mm; mmi.material_override = m
	add_child(mmi)
	if kind == "tree":
		var tm = MultiMesh.new(); tm.transform_format = MultiMesh.TRANSFORM_3D
		var tr = CylinderMesh.new(); tr.top_radius = 0.18; tr.bottom_radius = 0.3; tr.height = 1
		tm.mesh = tr; tm.instance_count = xf.size()
		for i in xf.size():
			var t: Transform3D = xf[i]
			tm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(1, t.basis.get_scale().y, 1)), t.origin - Vector3(0, t.basis.get_scale().y * 0.6, 0)))
		var tmi = MultiMeshInstance3D.new(); tmi.multimesh = tm; tmi.material_override = Gen.mat(Color("#4a3424"))
		add_child(tmi)
	# a few physics barrels and crates near the plaza
	for i in 10:
		var a = r.next() * TAU; var d = 14 + r.next() * 30
		var x = cos(a) * d; var z = sin(a) * d
		var rb = RigidBody3D.new(); rb.mass = 30
		var barrel = i % 2 == 0
		var mi = MeshInstance3D.new()
		var cs = CollisionShape3D.new()
		if barrel:
			var cy = CylinderMesh.new(); cy.top_radius = 0.45; cy.bottom_radius = 0.45; cy.height = 1.1; mi.mesh = cy
			mi.material_override = Gen.mat(Color("#b8342a"), 0.4, 0.5)
			var sh = CylinderShape3D.new(); sh.radius = 0.45; sh.height = 1.1; cs.shape = sh
		else:
			var bm = BoxMesh.new(); bm.size = Vector3.ONE; mi.mesh = bm
			mi.material_override = Gen.panel(Color("#b0a080"), 4, 0.1)
			var sh = BoxShape3D.new(); sh.size = Vector3.ONE; cs.shape = sh
		rb.add_child(mi); rb.add_child(cs)
		rb.position = Vector3(x, h(x, z) + 1.0, z)
		add_child(rb)

func _spawn_ores() -> void:
	var ol: Array = site.get("ores", [])
	if ol.is_empty(): return
	var n = 22 if site.get("style") == "wild" else 14
	for i in n:
		var ore: String = ol[int(r.next() * ol.size())]
		var a = r.next() * TAU; var d = 70 + r.next() * 430
		var x = cos(a) * d; var z = sin(a) * d
		if i < 4 and pois.has("vein"):
			x = pois.vein[0] + (r.next() - 0.5) * 40; z = pois.vein[1] + (r.next() - 0.5) * 40
		var y = h(x, z)
		if (sea_level > -900 and y < sea_level) or y < -100: continue
		var col = DB.col(DB.D.ORE_COL.get(ore, "#cccccc"))
		var g = StaticBody3D.new(); g.position = Vector3(x, y + 0.4, z)
		var rock = MeshInstance3D.new(); rock.mesh = _sphere(1.4); rock.scale = Vector3(1.3, 0.9, 1.1); rock.material_override = Gen.mat(DB.col(site.ground[3]), 0.9)
		g.add_child(rock)
		for k in 5:
			var cr = MeshInstance3D.new(); cr.mesh = _octa(0.35 + r.next() * 0.3)
			var cm = StandardMaterial3D.new(); cm.albedo_color = col; cm.emission_enabled = true; cm.emission = col; cm.emission_energy_multiplier = 2.0 if ore == "sifarite" else 0.6; cm.metallic = 0.6; cm.roughness = 0.2
			cr.material_override = cm
			cr.position = Vector3((r.next() - 0.5) * 2, 0.5 + r.next() * 0.6, (r.next() - 0.5) * 2); cr.rotation = Vector3(r.next() * 3, r.next() * 3, r.next() * 3)
			g.add_child(cr)
		var cs = CollisionShape3D.new(); var sh = SphereShape3D.new(); sh.radius = 1.4; cs.shape = sh; g.add_child(cs)
		add_child(g)
		var o = {"node": g, "ore": ore, "left": 3 + int(r.next() * 4)}
		ores.append(o)
		add_interact(g.position, 3.0, "Mine %s (Mining %d)" % [DB.D.ITEMS[ore].name, int(DB.D.ITEMS[ore].lvl)], 1.4, func(): return _mine(o), g)

func _mine(o: Dictionary) -> bool:
	var s = GameState.s
	var lv = GameState.level_for(s.player.skills.mining)
	var req = int(DB.D.ITEMS[o.ore].lvl)
	if lv < req:
		Game.hud_toast("You need Mining %d to mine %s." % [req, DB.D.ITEMS[o.ore].name]); return false
	var chance = clampf(0.35 + (lv - req) * 0.02, 0, 0.95)
	if randf() < chance:
		GameState.give(o.ore, 1)
		GameState.add_xp("mining", 40 + req * 6)
		Game.hud_toast("+1 %s" % DB.D.ITEMS[o.ore].name)
		Story.event("inv")
		o.left -= 1
		if o.left <= 0:
			o.node.queue_free()
			return true
	return false

func _spawn_npcs() -> void:
	var s = GameState.s
	for id in DB.D.NPCS:
		var n: Dictionary = DB.D.NPCS[id]
		if n.site != site_id: continue
		if not DlgLive.npc_present(id): continue
		var p: Array = pois.get(n.poi, [0.0, 0.0])
		add_npc({"id": id, "name": n.name, "role": n.role, "dlg": n.get("dlg", ""), "alien": n.get("alien", ""), "crew": n.get("crew", "")}, p[0] + (r.next() - 0.5) * 2, p[1] + (r.next() - 0.5) * 2, true)
	if site.get("generated", false):
		var svcs: Array = site.get("services", [])
		var mp = {"market": "vendor", "clinic": "clinic", "jobs": "vendor", "black": "fence"}
		for i in svcs.size():
			var a = i * 1.3
			var nm: String = DB.D.NAMES.first[int(r.next() * DB.D.NAMES.first.size())] + " " + DB.D.NAMES.last[int(r.next() * DB.D.NAMES.last.size())]
			add_npc({"name": nm, "role": {"market": "Trader", "jobs": "Contracts broker", "clinic": "Medic"}.get(svcs[i], "Fence"), "dlg": mp.get(svcs[i], "vendor")}, cos(a) * 16, sin(a) * 16, true)
	var cn: int = {"city": 34, "dome": 14, "yards": 18, "colony": 16, "shore": 12, "ice": 8, "rigs": 8, "elder": 18, "reef": 10, "alien": 16, "outpost": 6}.get(site.get("style", ""), 0)
	for i in cn:
		var a = r.next() * TAU; var d = 10 + r.next() * (220.0 if site.style == "city" else 70.0)
		var nm: String = "Kepleri" if site.style == "elder" else ("Thalassi singer" if site.style == "reef" else DB.D.NAMES.first[int(r.next() * DB.D.NAMES.first.size())])
		add_npc({"name": nm, "role": "citizen", "citizen": true, "alien": "kepleri" if site.style == "elder" else ("thalassi" if site.style == "reef" else "")}, cos(a) * d, sin(a) * d, false)
	if site.get("style") == "city" or site.get("faction") in ["concord", "frontier"]:
		for i in (6 if site.style == "city" else 3):
			var a = r.next() * TAU; var d = 20 + r.next() * 60
			spawn_enemy("guard", cos(a) * d, sin(a) * d)

func add_npc(o: Dictionary, x: float, z: float, stationary: bool) -> Node3D:
	var n = NpcScript.new()
	n.o = o; n.surface = self; n.stationary = stationary
	n.position = Vector3(x, h(x, z) + 0.1, z)
	add_child(n)
	npcs.append(n)
	return n

func _spawn_wildlife() -> void:
	var sys = Cosmos.get_system(site.get("system", "sol"))
	var sec: float = float(sys.get("security", 0.5)) if sys else 0.5
	var groups = int(round((5.0 if site.get("style") == "wild" else 3.0) * (1.2 - sec)))
	var en: Array = site.get("enemies", ["raider"])
	if en.is_empty(): return
	for g in groups:
		var type: String = en[int(r.next() * en.size())]
		var a = r.next() * TAU; var d = 190 + r.next() * 320
		var cx = cos(a) * d; var cz = sin(a) * d
		if h(cx, cz) < -100: continue
		var n = 1 + int(r.next() * 2) if (type == "sentinel" or type == "construct") else 2 + int(r.next() * 3)
		for i in n: spawn_enemy(type, cx + (r.next() - 0.5) * 20, cz + (r.next() - 0.5) * 20)
	if site.get("style") == "camp":
		for i in 5: spawn_enemy("raider", (r.next() - 0.5) * 40, (r.next() - 0.5) * 40)
	if site.get("style") == "vault":
		for i in 3: spawn_enemy("construct", (r.next() - 0.5) * 80, -40 + (r.next() - 0.5) * 40)

func spawn_enemy(type: String, x: float, z: float, tag := "") -> Node3D:
	if not DB.D.ENEMY_DEFS.has(type): return null
	var e = EnemyScript.new()
	e.type = type; e.def = DB.D.ENEMY_DEFS[type]; e.surface = self; e.tag = tag
	e.position = Vector3(x, h(x, z) + (3.0 if e.def.get("fly", false) else 0.2), z)
	add_child(e)
	enemies.append(e)
	return e

func npc_hostile() -> void:
	for n in npcs:
		if is_instance_valid(n) and n.o.get("id", "") != "" and n.global_position.distance_to(player.global_position) < 12:
			var e = spawn_enemy("thug", n.global_position.x, n.global_position.z)
			n.queue_free()

func _place_ship() -> void:
	var pd: Array = pois.pad
	ship = Gen.ship(Color("#9fb0c2"))
	var y = h(pd[0], pd[1]) + 2.6
	ship.position = Vector3(pd[0], y, pd[1]); ship.rotation.y = 0.6
	add_child(ship)
	for leg in [[-3, 4], [3, 4], [0, -6]]:
		var c = CylinderMesh.new(); c.top_radius = 0.3; c.bottom_radius = 0.5; c.height = 2.2
		var mi = MeshInstance3D.new(); mi.mesh = c; mi.material_override = Gen.mat(Color("#2a2e36"), 0.5, 0.7)
		mi.position = Vector3(leg[0], -1.1, leg[1]); ship.add_child(mi)
	var sb = StaticBody3D.new(); var cs = CollisionShape3D.new(); var sh = BoxShape3D.new(); sh.size = Vector3(20, 5, 26)
	cs.shape = sh; sb.add_child(cs); ship.add_child(sb)
	var L: float = max(1.0, Vector2(pd[0], pd[1]).length())
	ship_door = Vector3(pd[0] - pd[0] / L * 16, h(pd[0], pd[1]), pd[1] - pd[1] / L * 16)
	var beacon = CylinderMesh.new(); beacon.top_radius = 0.6; beacon.bottom_radius = 0.6; beacon.height = 0.1
	mesh_at(beacon, ship_door + Vector3(0, 0.7, 0), Gen.glow(Color("#8fd0e8"), 3))
	add_interact(ship_door, 6.0, "Board the %s" % GameState.s.ship.name, 0, func(): board_ship())

func board_ship() -> void:
	Story.event("board", {})
	Game.inst.go_surface_bridge()

func _place_vehicles() -> void:
	var st: String = site.get("style", "")
	if ["engineer", "reef", "elder", "vault", "theatre"].has(st): return
	var pd: Array = pois.pad
	var spots = [[pd[0] + 24, pd[1] + 4]]
	if r.next() < 0.7: spots.append([40 + r.next() * 20, -30])
	for p in spots:
		var v = RoverScript.new()
		v.surface = self
		v.hover = st == "city"
		v.position = Vector3(p[0], h(p[0], p[1]) + 1.5, p[1])
		add_child(v)
		v.rotation.y = atan2(-p[0], -p[1])
		vehicles.append(v)

# ── bridge interior ───────────────────────────────────────────────────
func _build_bridge() -> void:
	var wall = Gen.panel(Color("#6a7280"), 41, 0.6)
	var floor_m = Gen.panel(Color("#2e343e"), 42, 1.0)
	box(0, -0.5, 12, 22, 0.5, 44, floor_m)
	box(0, 6, 12, 22, 0.5, 44, wall)
	box(-11, 0, 12, 0.5, 6, 44, wall); box(11, 0, 12, 0.5, 6, 44, wall)
	box(0, 0, -10, 22, 6, 0.5, wall); box(0, 0, 34, 22, 6, 0.5, wall)
	# viewscreen
	var vs = mesh_at(_quad(16, 4.5), Vector3(0, 3, -9.7), Gen.glow(Color("#1a2a44"), 1.2))
	for i in 6:
		mesh_at(_quad(1.4, 0.4), Vector3(-9 + i * 3.6, 5.6, 2 + (i % 2) * 8), Gen.glow(Color("#dfe8ff"), 4), Vector3(PI / 2, 0, 0))
	point_light(Vector3(0, 4.5, -2), Color("#cfe0ff"), 3, 30)
	point_light(Vector3(0, 4.5, 20), Color("#cfe0ff"), 2, 30)
	# consoles
	for c in [[-2.2, -6.2], [2.2, -6.2], [-8.5, -3], [8.5, -3], [-8.5, 1.5], [8.5, 1.5]]:
		box(c[0], 0, c[1], 1.6, 1.0, 0.8, Gen.mat(Color("#1c2028"), 0.4, 0.6))
		mesh_at(_quad(1.4, 0.6), Vector3(c[0], 1.2, c[1] + 0.2), Gen.glow(Color("#3ec9a7"), 1.5), Vector3(-0.6, 0, 0))
	box(0, 0, 0.2, 1.2, 1.2, 1.2, Gen.mat(Color("#3a3240"), 0.6, 0.2))
	# warp core
	var core = CylinderMesh.new(); core.top_radius = 0.5; core.bottom_radius = 0.5; core.height = 5.4
	var cc = Color("#ff8a3a") if GameState.s.ship.drive == "torch" else Color("#7fd4ff")
	mesh_at(core, Vector3(0, 2.8, 26), Gen.glow(cc, 4))
	point_light(Vector3(0, 3, 26), cc, 6, 18)
	for i in 5:
		var t = TorusMesh.new(); t.inner_radius = 1.2; t.outer_radius = 1.4
		mesh_at(t, Vector3(0, 0.6 + i * 1.1, 26), Gen.mat(Color("#8a929c"), 0.3, 0.9))
	var loc: Dictionary = GameState.s.loc
	add_interact(Vector3(0, 0, 0.2), 2.4, "Captain's chair · helm", 0, func(): Game.inst.ui.show_helm())
	add_interact(Vector3(-1.6, 0, -0.2), 2.2, "Command console", 0, func(): Game.inst.ui.show_command("overview"))
	add_interact(Vector3(-5.5, 0, 29), 2.4, "Cargo and inventory", 0, func(): Game.inst.ui.show_journal("inv"))
	add_interact(Vector3(0, 0, 5), 2.4, "Disembark" if not loc.get("inSpace", false) else "Airlock (sealed in space)", 0, func():
		if not GameState.s.loc.get("inSpace", false): Game.inst.go_surface(GameState.s.loc.site)
		else: Game.hud_toast("We're in space, Captain. Take the helm to land or dock."))
	# crew at stations
	var spots = [[-2.2, -5.2], [2.2, -5.2], [-8.5, -2.2], [8.5, -2.2], [-8.5, 2.3], [8.5, 2.3], [-6, 26], [6, 26]]
	var i = 0
	for id in GameState.s.crew:
		if i >= spots.size(): break
		var c: Dictionary = DB.D.CREW[id]
		add_npc({"name": c.name, "role": c.get("role", "Crew"), "crewTalk": id}, spots[i][0], spots[i][1], true)
		i += 1

# ── interactables and quests ──────────────────────────────────────────
func add_interact(pos: Vector3, radius: float, label: String, hold: float, fn: Callable, node: Node3D = null, quest := "") -> Dictionary:
	var it = {"pos": pos, "r": radius, "label": label, "hold": hold, "fn": fn, "node": node, "quest": quest}
	interacts.append(it)
	return it

func sync_quest_objects() -> void:
	var s = GameState.s
	for it in interacts.duplicate():
		if it.quest != "":
			if it.node: it.node.queue_free()
			interacts.erase(it)
	for q in Story.active():
		var st = Story.cur(q)
		if st == null: continue
		var tgt: String = st.target.get("site", "") if st.get("target") is Dictionary else ""
		if tgt != site_id: continue
		if st.has("interact"):
			var fx = st.interact.fx
			_quest_interact(q, st.interact.poi, st.interact.label, float(st.interact.get("hold", 1)), func():
				Story.apply(fx); return true)
		if st.has("collect"):
			var pre = null
			if st.collect.get("item", "") == "shard": pre = "shard"
			elif st.collect.get("item", "") == "quietlog": pre = "tower"
			elif st.collect.has("flagCount"): pre = st.collect.flagCount[0]
			if pre == null or not DB.D.COLLECTS.has(pre): continue
			var def: Dictionary = DB.D.COLLECTS[pre]
			for i in range(1, 4):
				var key = "got_%s%d" % [pre, i]
				if s.flags.get(key) or s.flags.get("%s_%d" % [pre, i]): continue
				var ii = i; var pp: String = pre
				_quest_interact(q, "%s%d" % [pre, i], def.label, 2.0, func():
					if def.has("req") and not Story.meets(def.req):
						Game.hud_toast("Needs %s" % Story.req_label(def.req)); return false
					s.flags[key] = 1
					if def.has("flag"): s.flags["%s_%d" % [def.flag, ii]] = 1
					if def.has("give"): GameState.give(def.give, 1)
					GameState.add_xp({"dish": "engineering", "tower": "science", "strand": "medicine"}.get(pp, "science"), 600)
					if def.has("wave"):
						for k in 3 + ii:
							var a = randf() * TAU
							spawn_enemy(def.wave, cos(a) * 120, sin(a) * 120)
					Story.event("flag"); Story.event("inv")
					return true)
		if st.has("spawn") and not s.quests[q].get("spawned_%d" % int(s.quests[q].stage), false):
			s.quests[q]["spawned_%d" % int(s.quests[q].stage)] = true
			var p: Array = pois.get(st.spawn.poi, [0.0, 0.0])
			for i in int(st.spawn.n):
				spawn_enemy(st.spawn.type, p[0] + (randf() - 0.5) * 30, p[1] + (randf() - 0.5) * 30, st.spawn.get("tag", ""))

func _quest_interact(q: String, poi: String, label: String, hold: float, fn: Callable) -> void:
	if not pois.has(poi): return
	var p: Array = pois[poi]
	var y = h(p[0], p[1])
	var holder = Node3D.new(); holder.position = Vector3(p[0], y, p[1]); add_child(holder)
	var beam = CylinderMesh.new(); beam.top_radius = 0.5; beam.bottom_radius = 0.5; beam.height = 60
	var bm = StandardMaterial3D.new(); bm.albedo_color = Color(1, 0.64, 0.23, 0.18); bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; bm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; bm.cull_mode = BaseMaterial3D.CULL_DISABLED
	var b = MeshInstance3D.new(); b.mesh = beam; b.material_override = bm; b.position.y = 30; holder.add_child(b)
	var o = MeshInstance3D.new(); o.mesh = _octa(0.6); o.material_override = Gen.glow(Color("#ffcf7e"), 4); o.position.y = 1.4; o.add_to_group("spin"); holder.add_child(o)
	add_interact(Vector3(p[0], y, p[1]), 3.2, label, hold, fn, holder, q)

func refresh_markers() -> void:
	if not interior: sync_quest_objects()

# ── effects ───────────────────────────────────────────────────────────
func tracer(a: Vector3, b: Vector3, col: Color, beam := false) -> void:
	var im = ImmediateMesh.new()
	var mi = MeshInstance3D.new(); mi.mesh = im
	var m = StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = col; m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = 4.0 if beam else 2.5
	im.surface_begin(Mesh.PRIMITIVE_LINES, m); im.surface_add_vertex(a); im.surface_add_vertex(b); im.surface_end()
	fx_root.add_child(mi)
	get_tree().create_timer(0.12 if beam else 0.06).timeout.connect(mi.queue_free)

func spark(p: Vector3, col: Color) -> void:
	var l = OmniLight3D.new(); l.position = p; l.light_color = col; l.light_energy = 2; l.omni_range = 4
	fx_root.add_child(l)
	get_tree().create_timer(0.06).timeout.connect(l.queue_free)

func gunshot(_p: Vector3) -> void:
	Sfx.play(str(player.weapon().get("snd", "pistol")))
	for e in enemies:
		if is_instance_valid(e) and e.hostile and e.global_position.distance_to(player.global_position) < 70: e.state = "combat"
	for n in npcs:
		if is_instance_valid(n) and n.o.get("id", "") == "" and n.global_position.distance_to(player.global_position) < 50: n.flee = 8.0

var bolts: Array = []
func fire_bolt(from: Vector3, vel: Vector3, col: Color, dmg: float, owner) -> void:
	var m = MeshInstance3D.new(); m.mesh = _sphere(0.09); m.material_override = Gen.glow(col, 6); m.scale = Vector3(1, 1, 6)
	fx_root.add_child(m); m.global_position = from; m.look_at(from + vel, Vector3.UP if absf(vel.normalized().y) < 0.99 else Vector3.RIGHT)
	bolts.append({"node": m, "pos": from, "vel": vel, "life": 2.0, "dmg": dmg})

func _update_bolts(delta: float) -> void:
	var pc = player.global_position + Vector3(0, 1, 0)
	for b in bolts.duplicate():
		b.life -= delta
		var a0: Vector3 = b.pos
		var step: Vector3 = b.vel * delta
		b.pos = a0 + step
		b.node.global_position = b.pos
		var L2 = step.length_squared()
		var t = clampf((pc - a0).dot(step) / L2, 0, 1) if L2 > 0 else 0.0
		if (a0 + step * t).distance_to(pc) < (2.0 if player.get_meta("in_vehicle", false) else 0.75):
			player.take_hit(b.dmg); Sfx.play("hurt"); b.life = 0
		if b.life <= 0:
			b.node.queue_free(); bolts.erase(b)

var _burst_tex: Texture2D
func muzzle_flash(p: Vector3) -> void:
	if _burst_tex == null: _burst_tex = load("res://assets/kenney/sprites/burst.png")
	var sp = Sprite3D.new(); sp.texture = _burst_tex; sp.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sp.pixel_size = 0.004; sp.modulate = Color(1, 0.85, 0.5); sp.shaded = false; sp.rotation.z = randf() * TAU
	fx_root.add_child(sp); sp.global_position = p
	var l = OmniLight3D.new(); l.light_color = Color("#ffc070"); l.light_energy = 3; l.omni_range = 5; sp.add_child(l)
	get_tree().create_timer(0.05).timeout.connect(sp.queue_free)

func _kenney(name: String, pos: Vector3, sc: float, rot := 0.0) -> Node3D:
	var n = load("res://assets/kenney/models/%s.glb" % name).instantiate()
	n.position = pos; n.scale = Vector3.ONE * sc; n.rotation.y = rot
	add_child(n)
	return n

## Kenney storefronts, a fountain and trees around the plaza, with colliders.
func _build_plaza_art() -> void:
	var y0 = h(0, 0)
	_kenney("pavement-fountain", Vector3(0, y0, 0), 7.0)
	var shops = ["building-small-a", "building-small-b", "building-small-c", "building-small-d", "building-garage"]
	for i in 10:
		var a = float(i) / 10.0 * TAU + 0.31
		var d = 58.0
		var x = cos(a) * d; var z = sin(a) * d
		var b = _kenney(shops[i % shops.size()], Vector3(x, h(x, z), z), 11.0, -a - PI / 2)
		var sb = StaticBody3D.new(); var cs = CollisionShape3D.new(); var bs = BoxShape3D.new(); bs.size = Vector3(0.9, 1.2, 0.9)
		cs.shape = bs; cs.position.y = 0.6; sb.add_child(cs); b.add_child(sb)
	for i in 16:
		var a = float(i) / 16.0 * TAU
		var x = cos(a) * 44.0; var z = sin(a) * 44.0
		_kenney("grass-trees-tall" if i % 2 == 0 else "grass-trees", Vector3(x, h(x, z), z), 6.0, a)

func explode_fx(p: Vector3, _k: float) -> void:
	var l = OmniLight3D.new(); l.position = p; l.light_color = Color("#ffb060"); l.light_energy = 8; l.omni_range = 10
	fx_root.add_child(l)
	get_tree().create_timer(0.2).timeout.connect(l.queue_free)

func crime(n: float) -> void:
	var s = GameState.s
	var sys = Cosmos.get_system(site.get("system", "sol"))
	var sec: float = float(sys.get("security", 0.5)) if sys else 0.5
	if sec < 0.3 or site.get("style", "") == "camp": return
	var before = float(s.get("wanted", 0))
	s.wanted = minf(5.0, before + n * 0.5); s.wantedCool = 0.0
	if player.invuln > 0: return
	if ceil(s.wanted) > ceil(before):
		Sfx.play("alarm"); Game.hud_toast("Security is responding.")
		for i in int(ceil(s.wanted)):
			var a = randf() * TAU
			spawn_enemy("secdrone", player.global_position.x + cos(a) * 60, player.global_position.z + sin(a) * 60)
	for e in enemies:
		if is_instance_valid(e) and (e.type == "guard" or e.type == "secdrone"): e.hostile = true; e.state = "combat"

func _update_wanted(delta: float) -> void:
	var s = GameState.s
	if float(s.get("wanted", 0)) <= 0: return
	var seen = false
	for e in enemies:
		if is_instance_valid(e) and not e.dead and e.hostile and (e.type == "guard" or e.type == "secdrone") and e.state == "combat" and e.global_position.distance_to(player.global_position) < 80: seen = true
	s.wantedCool = float(s.get("wantedCool", 0)) + (0.0 if seen else delta)
	if s.wantedCool > 20:
		s.wanted = maxf(0.0, float(s.wanted) - delta * 0.12)
		if s.wanted == 0:
			Game.hud_toast("Security lost your trail.")
			for e in enemies:
				if is_instance_valid(e) and e.type == "guard": e.hostile = false; e.state = "idle"

func explode(p: Vector3, radius: float, dmg: float) -> void:
	var l = OmniLight3D.new(); l.position = p; l.light_color = Color("#ffb060"); l.light_energy = 12; l.omni_range = radius * 3
	fx_root.add_child(l)
	get_tree().create_timer(0.25).timeout.connect(l.queue_free)
	for e in enemies:
		if is_instance_valid(e) and e.global_position.distance_to(p) < radius: e.take_damage(dmg * (1 - e.global_position.distance_to(p) / radius), Vector3.UP)
	for n in get_children():
		if n is RigidBody3D and n.global_position.distance_to(p) < radius * 1.5:
			n.apply_central_impulse((n.global_position - p).normalized() * 400 + Vector3.UP * 200)
	var pd = player.global_position.distance_to(p)
	if pd < radius: player.take_hit(dmg * (1 - pd / radius) * 0.8)
	Sfx.play("explode")

func player_died() -> void:
	var s = GameState.s
	var lost = int(int(s.credits) * 0.1)
	GameState.add_credits(-lost)
	s.player.hp = GameState.max_hp()
	Game.hud_toast("You were killed. Your medical insurance revives you at the pad. (−%d credits)" % lost)
	player.global_position = spawn_point()
	player.velocity = Vector3.ZERO
	# a fresh start: charges dropped, security stands down, no shots in flight
	s.wanted = 0.0; s.wantedCool = 0.0
	for b in bolts: b.node.queue_free()
	bolts.clear()
	for e in enemies:
		if not is_instance_valid(e) or e.dead: continue
		if e.type == "secdrone": e.queue_free()
		elif e.type == "guard": e.hostile = false; e.state = "idle"; e.last_seen = null
		else: e.state = "idle"; e.last_seen = null
	player.invuln = 5.0

func near_air(p: Vector3) -> bool:
	return Vector2(p.x, p.z).length() < 40 or p.distance_to(ship_door) < 14 or (player and player.get_meta("in_vehicle", false))

func darkness() -> float:
	var wd: float = weather.dim if weather else 1.0
	var vac = float(site.sky.get("stars", 0)) >= 1.0
	return maxf(maxf(1.0 - day, 1.0 - wd), 0.7 if vac and not interior else 0.0)

func set_weather(t: String) -> void:
	if weather: weather.force(t)

func start_tabib_fight() -> void:
	var p: Array = pois.custodian
	for n in npcs.duplicate():
		if is_instance_valid(n) and n.o.get("id", "") == "tabib":
			n.queue_free(); npcs.erase(n)
	boss = spawn_enemy("tabib", p[0], p[1] - 6)
	if boss:
		boss.boss = true; boss.state = "combat"
	for i in 4:
		var a = i * 1.57
		spawn_enemy("orderly", p[0] + cos(a) * 14, p[1] + sin(a) * 14)
	Game.hud_toast("The Tabib: \"%s\"" % DB.D.TABIB.couplets[5].split("\n")[0])

# ── per-frame ─────────────────────────────────────────────────────────
func _process(delta: float) -> void:
	if not is_instance_valid(player): return
	var s = GameState.s
	if int(site.get("day", 0)) > 0 and not Game.inst.ui.is_open():
		day_phase = fmod(day_phase + delta / (float(site.day) * 60.0 * 1.6), 1.0)
		s.dayPhase = day_phase
	_set_sun()
	for n in get_tree().get_nodes_in_group("spin"):
		n.rotate_y(delta * 1.5)
	_update_interact(delta)
	_update_hud()
	_update_bolts(delta)
	_update_wanted(delta)
	if boss and is_instance_valid(boss):
		boss.boss_tick(delta)

func _update_interact(delta: float) -> void:
	var pp = player.global_position
	var best = null; var bd = 1e9
	for it in interacts:
		var d = Vector2(it.pos.x - pp.x, it.pos.z - pp.z).length()
		if d < it.r and d < bd: best = it; bd = d
	for n in npcs:
		if not is_instance_valid(n) or n.o.get("citizen", false) and n.o.get("dlg", "") == "": continue
		var d = n.global_position.distance_to(pp)
		if d < 3.2 and d < bd:
			best = {"npc": n, "label": "Talk to %s" % n.o.name, "hold": 0}; bd = d
	var veh = null
	for v in vehicles:
		if is_instance_valid(v) and v.global_position.distance_to(pp) < 4.5: veh = v
	var hud: CanvasLayer = Game.inst.hud
	if player.get_meta("in_vehicle", false):
		hud.set_prompt("[F] Exit vehicle"); return
	if best == null and veh == null:
		hud.set_prompt(""); hold_t = 0.0; return
	if best == null:
		hud.set_prompt("[F] Drive")
		return
	var pct = ""
	if float(best.get("hold", 0)) > 0 and hold_t > 0: pct = " · %d%%" % int(hold_t / float(best.hold) * 100)
	hud.set_prompt("[E] " + best.label + pct + ("   [F] Drive" if veh else ""))
	if Game.inst.ui.is_open(): return
	if float(best.get("hold", 0)) > 0:
		if Input.is_action_pressed("interact"):
			hold_t += delta
			if hold_t >= float(best.hold):
				hold_t = 0.0
				var ok = best.fn.call()
				if ok == true and best.get("quest", "") != "":
					if best.node: best.node.queue_free()
					interacts.erase(best)
				elif ok == true and best.has("node") and best.node and not is_instance_valid(best.node):
					interacts.erase(best)
		else:
			hold_t = 0.0
	elif Input.is_action_just_pressed("interact"):
		if best.has("npc"): best.npc.talk()
		else: best.fn.call()

func _unhandled_input(event: InputEvent) -> void:
	if Game.inst.ui.is_open(): return
	if event.is_action_pressed("vehicle"):
		for v in vehicles:
			if is_instance_valid(v) and (v.driver == player or v.global_position.distance_to(player.global_position) < 4.5):
				v.toggle_driver(player); return
	if event.is_action_pressed("board") and not interior and player.global_position.distance_to(ship_door) < 14:
		board_ship()

func _update_hud() -> void:
	var s = GameState.s
	var W: Dictionary = player.weapon()
	var w: String = s.player.weapon
	var t = "EARTH %.3f · SHIP T+%.2f y · %d CR\nHP %d / %d" % [float(s.earthYear), float(s.shipYears), int(s.credits), int(s.player.hp), int(GameState.max_hp())]
	if not site.get("breathable", true) and not interior: t += "    O₂ %d" % int(player.o2)
	t += "\n%s  %d / %d" % [W.name, int(player.mag.get(w, 0)), int(s.inv.get(W.ammo, 0))]
	if player.reload_t > 0: t += "  (reloading)"
	var q = Story.cur(str(s.get("track", "mq")))
	if q != null: t += "\n\n▸ %s\n  %s" % [DB.D.QUESTS[s.track].name, q.text]
	Game.inst.hud.set_readout(t)

# ── small mesh helpers ────────────────────────────────────────────────
func _sphere(rad: float) -> SphereMesh:
	var m = SphereMesh.new(); m.radius = rad; m.height = rad * 2; m.radial_segments = 16; m.rings = 8
	return m

func _octa(rad: float) -> Mesh:
	var m = SphereMesh.new(); m.radius = rad; m.height = rad * 2; m.radial_segments = 4; m.rings = 2
	return m

func _quad(w: float, hh: float) -> QuadMesh:
	var q = QuadMesh.new(); q.size = Vector2(w, hh)
	return q

class_name Looks
extends Node3D
## Non-human bodies from the original game: drones, crawlers, stingers,
## sentinels, Engineer constructs and the Thalassi. Each animates itself
## through pose(delta, speed, talking).

var kind = ""
var parts: Array = []
var legs: Array = []
var mat: StandardMaterial3D
var _t = 0.0

static func _m(col: Color, metal := 0.15, rough := 0.55) -> StandardMaterial3D:
	var m = StandardMaterial3D.new(); m.albedo_color = col; m.metallic = metal; m.roughness = rough
	return m

static func _e(col: Color, energy := 4.0) -> StandardMaterial3D:
	var m = StandardMaterial3D.new(); m.albedo_color = col; m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = energy
	return m

func _add(mesh: Mesh, m: Material, pos: Vector3, parent: Node3D = null, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi = MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = m; mi.position = pos; mi.rotation = rot; mi.scale = scl
	(parent if parent else self).add_child(mi)
	return mi

static func _sph(r: float, seg := 16, rings := 10) -> SphereMesh:
	var s = SphereMesh.new(); s.radius = r; s.height = r * 2; s.radial_segments = seg; s.rings = rings
	return s

static func _cyl(top: float, bot: float, h: float, seg := 8) -> CylinderMesh:
	var c = CylinderMesh.new(); c.top_radius = top; c.bottom_radius = bot; c.height = h; c.radial_segments = seg
	return c

static func _box(x: float, y: float, z: float) -> BoxMesh:
	var b = BoxMesh.new(); b.size = Vector3(x, y, z)
	return b

static func creature(k: String, col := Color("#4a3a2a")) -> Looks:
	var g = Looks.new(); g.kind = k
	var shell = _m(col)
	var eye = _e(Color("#f2a33a") if k in ["sentinel", "construct"] else (Color("#ff4a3a") if k in ["rogueDrone", "secdrone"] else Color("#ffda6a")))
	match k:
		"crawler":
			g._add(_sph(0.55), shell, Vector3(0, 0.6, 0), null, Vector3.ZERO, Vector3(1.3, 0.6, 1.8))
			g._add(_sph(0.3), shell, Vector3(0, 0.65, 0.9))
			for x in [-0.12, 0.12]: g._add(_sph(0.05, 8, 4), eye, Vector3(x, 0.75, 1.15))
			for i in 6:
				var side = -1.0 if i < 3 else 1.0
				var L = Node3D.new(); L.position = Vector3(side * 0.5, 0.6, -0.5 + (i % 3) * 0.5); g.add_child(L)
				g._add(_cyl(0.05, 0.03, 1.1, 6), shell, Vector3(side * 0.4, -0.25, 0), L, Vector3(0, 0, side * 1.0))
				g.legs.append(L)
		"stinger":
			var bm = StandardMaterial3D.new(); bm.albedo_color = Color("#1a3a4a"); bm.emission_enabled = true; bm.emission = Color("#3ad8ff"); bm.emission_energy_multiplier = 0.3; bm.roughness = 0.3
			g.parts.append(g._add(_sph(0.8, 20, 10), bm, Vector3.ZERO, null, Vector3.ZERO, Vector3(1.6, 0.18, 1)))
			g._add(_cyl(0.06, 0.01, 2, 6), shell, Vector3(0, 0, -1.6), null, Vector3(PI / 2, 0, 0))
			g._add(_sph(0.07, 8, 4), eye, Vector3(0, 0.1, 0.7))
		"rogueDrone", "secdrone":
			g._add(_sph(0.35), _m(Color("#dfe6ee") if k == "secdrone" else Color("#2a2f38"), 0.8, 0.3), Vector3.ZERO)
			var t = TorusMesh.new(); t.inner_radius = 0.51; t.outer_radius = 0.59
			g.parts.append(g._add(t, _m(Color("#12161c"), 0.9, 0.2), Vector3.ZERO))
			g._add(_sph(0.1, 10, 6), _e(Color("#6fa8ff")) if k == "secdrone" else eye, Vector3(0, 0, 0.3))
			if k == "secdrone":
				g._add(_box(0.15, 0.06, 0.06), _e(Color("#ff3a3a"), 3), Vector3(-0.08, 0.36, 0))
				g._add(_box(0.15, 0.06, 0.06), _e(Color("#3a6aff"), 3), Vector3(0.08, 0.36, 0))
		"sentinel":
			var oc = _sph(0.7, 4, 2)
			g.parts.append(g._add(oc, _m(Color("#3a3e48"), 0.9, 0.25), Vector3(0, 2.2, 0), null, Vector3.ZERO, Vector3(1, 1.4, 1)))
			g._add(_sph(0.14, 10, 6), eye, Vector3(0, 2.3, 0.5))
			for i in 3:
				var L = Node3D.new(); L.position.y = 2; L.rotation.y = i * TAU / 3; g.add_child(L)
				g._add(_cyl(0.06, 0.04, 2.5, 6), _m(Color("#2a2e36"), 0.9, 0.3), Vector3(0, -1.05, 0.55), L, Vector3(-0.45, 0, 0))
				g.legs.append(L)
		"construct":
			var m = _m(Color("#18161a"), 0.95, 0.2)
			g._add(_box(0.9, 1.6, 0.6), m, Vector3(0, 1.6, 0))
			g.parts.append(g._add(_sph(0.4, 3, 1), m, Vector3(0, 2.7, 0)))
			g._add(_box(0.92, 0.05, 0.62), _e(Color("#f2a33a"), 5), Vector3(0, 1.9, 0))
			g._add(_box(0.92, 0.05, 0.62), _e(Color("#f2a33a"), 5), Vector3(0, 1.3, 0))
			g._add(_sph(0.09, 8, 4), eye, Vector3(0, 2.7, 0.25))
			for x in [-0.3, 0.3]:
				var L = Node3D.new(); L.position = Vector3(x, 0.9, 0); g.add_child(L)
				g._add(_box(0.22, 0.9, 0.22), m, Vector3(0, -0.45, 0), L)
				g.legs.append(L)
	for mi in g.find_children("*", "MeshInstance3D", true, false):
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	return g

static func thalassi(col := Color("#5fe0ff"), sc := 1.0) -> Looks:
	var g = Looks.new(); g.kind = "thalassi"
	g.mat = StandardMaterial3D.new(); g.mat.albedo_color = Color(0.04, 0.16, 0.23, 0.82); g.mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	g.mat.emission_enabled = true; g.mat.emission = col; g.mat.emission_energy_multiplier = 1.4; g.mat.roughness = 0.2; g.mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	var body = Node3D.new(); g.add_child(body); g.parts.append(body)
	var cone = _cyl(0.45 * sc, 0.0, 2.2 * sc, 20)
	g._add(cone, g.mat, Vector3(0, 1.2 * sc, 0), body)
	g._add(_sph(0.42 * sc, 24, 18), g.mat, Vector3(0, 2.4 * sc, 0), body, Vector3.ZERO, Vector3(1, 1.4, 1))
	g._add(_sph(0.14 * sc, 12, 8), _e(col, 5), Vector3(0, 2.4 * sc, 0), body)
	for i in 9:
		var a = float(i) / 9.0 * TAU
		g.legs.append(g._add(_cyl(0.03 * sc, 0.005, 1.6 * sc, 5), g.mat, Vector3(cos(a) * 0.35 * sc, 0.7 * sc, sin(a) * 0.35 * sc), body))
	var l = OmniLight3D.new(); l.light_color = col; l.light_energy = 1.2; l.omni_range = 6; l.position.y = 2.2 * sc; g.add_child(l)
	return g

func pose(delta: float, sp: float, talk := false) -> void:
	_t += delta
	match kind:
		"crawler":
			var t = _t * (4 + sp * 2)
			for i in legs.size(): legs[i].rotation.x = sin(t + i * 1.7) * 0.5 * minf(1, sp / 2 + 0.1)
		"stinger":
			parts[0].scale.x = 1.6 + sin(_t * 5) * 0.2
		"rogueDrone", "secdrone":
			parts[0].rotation.x = PI / 2; parts[0].rotation.z += 6 * delta
		"sentinel":
			for i in legs.size(): legs[i].get_child(0).rotation.x = -0.45 + sin(_t * 3 + i * 2) * 0.15 * minf(1, sp)
			parts[0].rotation.y += delta * 0.8
		"construct":
			legs[0].rotation.x = sin(_t * 5) * 0.4 * minf(1, sp); legs[1].rotation.x = -sin(_t * 5) * 0.4 * minf(1, sp)
			parts[0].rotation.y += delta * 2
		"thalassi":
			parts[0].position.y = 0.25 + sin(_t * 1.2) * 0.12
			for i in legs.size():
				legs[i].rotation.x = sin(_t * 2 + i) * 0.35; legs[i].rotation.z = cos(_t * 1.7 + i * 2) * 0.35
			mat.emission_energy_multiplier = 1.0 + sin(_t * (9.0 if talk else 2.0)) * 0.6 + (0.8 if talk else 0.0)

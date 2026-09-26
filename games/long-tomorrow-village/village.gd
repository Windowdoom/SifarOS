extends Node3D
## The Long Tomorrow: Village. A RuneScape-style slice: tilted camera you
## rotate around your character, click-to-move, a 0.6 s game tick, skills
## from 1 to 99 on the classic XP curve, gathering (woodcutting, mining,
## fishing), cooking, tick-based melee, a 28-slot inventory, a bank, right-
## click menus and a stone side panel. One flat-shaded low-poly art style.

const TICK = 0.6
const SKILLS = ["attack", "strength", "defence", "hitpoints", "woodcutting", "mining", "fishing", "cooking"]
const ITEMS = {
	"logs": {"name": "Logs", "col": "#8a5a32"}, "oak_logs": {"name": "Oak logs", "col": "#b07a3a"},
	"copper_ore": {"name": "Copper ore", "col": "#c87a4a"}, "tin_ore": {"name": "Tin ore", "col": "#a8a8a0"}, "iron_ore": {"name": "Iron ore", "col": "#6a4a3a"},
	"raw_shrimps": {"name": "Raw shrimps", "col": "#e8a0a0"}, "shrimps": {"name": "Shrimps", "col": "#e87a3a"}, "burnt_shrimps": {"name": "Burnt shrimps", "col": "#2a2220"},
	"bones": {"name": "Bones", "col": "#e8e2d0"}, "coins": {"name": "Coins", "col": "#e8c040"},
}
const RES = {
	"tree": {"name": "Tree", "verb": "Chop down", "skill": "woodcutting", "lvl": 1, "xp": 25.0, "item": "logs", "chance": 0.45, "respawn": 8},
	"oak": {"name": "Oak", "verb": "Chop down", "skill": "woodcutting", "lvl": 15, "xp": 37.5, "item": "oak_logs", "chance": 0.3, "respawn": 14},
	"copper": {"name": "Copper rocks", "verb": "Mine", "skill": "mining", "lvl": 1, "xp": 17.5, "item": "copper_ore", "chance": 0.4, "respawn": 4},
	"tin": {"name": "Tin rocks", "verb": "Mine", "skill": "mining", "lvl": 1, "xp": 17.5, "item": "tin_ore", "chance": 0.4, "respawn": 4},
	"iron": {"name": "Iron rocks", "verb": "Mine", "skill": "mining", "lvl": 15, "xp": 35.0, "item": "iron_ore", "chance": 0.3, "respawn": 9},
	"fish": {"name": "Fishing spot", "verb": "Net", "skill": "fishing", "lvl": 1, "xp": 10.0, "item": "raw_shrimps", "chance": 0.45, "respawn": 0},
}

var xp = {}
var inv = []
var bank = {}
var hp = 10
var objs = []          # {kind, name, pos, r, node, down, res_t, ...}
var mobs = []
var player: Node3D
var p_limbs = {}
var target_pos = null
var action = null      # {obj, verb}
var tick_t = 0.0
var ticks = 0
var atk_cd = 0
var cam_yaw = 0.6
var cam_pitch = 0.62
var cam_dist = 24.0
var cam: Camera3D
var mats = {}
var anim_t = 0.0
var busy_anim = 0.0
# UI
var ui: CanvasLayer
var chat: RichTextLabel
var hover: Label
var inv_grid: GridContainer
var skills_box: VBoxContainer
var hp_label: Label
var menu: PopupMenu
var menu_opts = []
var xp_drops = []

# ── helpers ───────────────────────────────────────────────────────────
static func xp_for(level: int) -> float:
	var pts = 0.0
	for l in range(1, level): pts += floor(l + 300.0 * pow(2.0, l / 7.0))
	return floor(pts / 4.0)

func level(s: String) -> int:
	var lv = 1
	while lv < 99 and xp[s] >= xp_for(lv + 1): lv += 1
	return lv

func m(col) -> ShaderMaterial:
	var key = str(col)
	if not mats.has(key):
		var sm = ShaderMaterial.new(); sm.shader = preload("res://flat.gdshader")
		sm.set_shader_parameter("albedo", Color(col))
		mats[key] = sm
	return mats[key]

func part(parent: Node3D, mesh: Mesh, col, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi = MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = m(col)
	mi.position = pos; mi.rotation = rot; mi.scale = scl
	parent.add_child(mi)
	return mi

func box(x, y, z) -> BoxMesh:
	var b = BoxMesh.new(); b.size = Vector3(x, y, z); return b

func cyl(t, b, hh, seg := 6) -> CylinderMesh:
	var c = CylinderMesh.new(); c.top_radius = t; c.bottom_radius = b; c.height = hh; c.radial_segments = seg; c.rings = 1; return c

func sph(r, seg := 6, rings := 4) -> SphereMesh:
	var s = SphereMesh.new(); s.radius = r; s.height = r * 2; s.radial_segments = seg; s.rings = rings; return s

func h(x: float, z: float) -> float:
	var v = sin(x * 0.08) * cos(z * 0.07) * 0.8 + sin(x * 0.21 + z * 0.13) * 0.25
	var d = Vector2(x - 22, z + 14).length()   # pond
	if d < 11: v -= (11 - d) * 0.35
	return v

func say(t: String) -> void:
	chat.append_text("\n" + t)

# ── setup ─────────────────────────────────────────────────────────────
func _ready() -> void:
	for s in SKILLS: xp[s] = 0.0
	xp.hitpoints = xp_for(10)
	for i in 28: inv.append(null)
	_world()
	_village()
	_resources()
	player = _person("#3a5a9a", "#c89a78", "#6a4a2a")
	add_child(player)
	player.position = Vector3(0, h(0, 4), 4)
	for i in 4: _spawn_mob("goblin", Vector3(-30 + randf() * 12, 0, 20 + randf() * 12))
	for i in 5: _spawn_mob("chicken", Vector3(14 + randf() * 10, 0, 16 + randf() * 8))
	cam = Camera3D.new(); cam.fov = 45; add_child(cam); cam.current = true
	_ui()
	say("Welcome to Afterlight Village.")
	say("Left-click to walk or act. Right-click for options. Arrow keys or middle mouse rotate the camera; scroll zooms.")
	_refresh()
	for a in OS.get_cmdline_user_args():
		if a == "--demo": _set_action(objs[4])
		if a.begins_with("--shot="):
			await get_tree().create_timer(9.0).timeout
			get_viewport().get_texture().get_image().save_png(a.substr(7)); get_tree().quit()

func _world() -> void:
	var env = Environment.new()
	var sky = Sky.new(); var ps = ProceduralSkyMaterial.new()
	ps.sky_top_color = Color("#5d8fd0"); ps.sky_horizon_color = Color("#c8dcea"); ps.ground_horizon_color = Color("#c8dcea"); ps.ground_bottom_color = Color("#6a7a50")
	sky.sky_material = ps; env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; env.ambient_light_energy = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true; env.fog_light_color = Color("#c8dcea"); env.fog_density = 0.0035
	env.ssao_enabled = true; env.ssao_intensity = 1.2
	var we = WorldEnvironment.new(); we.environment = env; add_child(we)
	var sun = DirectionalLight3D.new(); sun.rotation = Vector3(-0.9, 0.7, 0); sun.light_color = Color("#fff0d8"); sun.light_energy = 1.05; sun.shadow_enabled = true; sun.shadow_bias = 0.15; sun.shadow_normal_bias = 2.5; sun.directional_shadow_max_distance = 80.0
	add_child(sun)
	# faceted terrain with painted vertex colours: grass, dirt paths, sand by the pond
	var st = SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var N = 60; var S = 2.0; var o = -N * S / 2.0
	for i in N:
		for j in N:
			var q = [Vector2(o + i * S, o + j * S), Vector2(o + (i + 1) * S, o + j * S), Vector2(o + (i + 1) * S, o + (j + 1) * S), Vector2(o + i * S, o + (j + 1) * S)]
			for tri in [[0, 1, 2], [0, 2, 3]]:
				var c = Vector2.ZERO
				for k in tri: c += q[k]
				c /= 3.0
				var col = _ground_col(c.x, c.y)
				for k in tri:
					st.set_color(col); st.add_vertex(Vector3(q[k].x, h(q[k].x, q[k].y), q[k].y))
	st.generate_normals()   # vertices are unshared, so each triangle gets its own face normal
	var gm = st.commit()
	var mat = ShaderMaterial.new(); mat.shader = preload("res://flat.gdshader"); mat.set_shader_parameter("use_vc", true)
	var gi = MeshInstance3D.new(); gi.mesh = gm; gi.material_override = mat; add_child(gi)
	var water = MeshInstance3D.new(); var pm = PlaneMesh.new(); pm.size = Vector2(24, 24); water.mesh = pm
	var wm = StandardMaterial3D.new(); wm.albedo_color = Color(0.2, 0.45, 0.65, 0.8); wm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; wm.roughness = 0.1; wm.metallic = 0.3
	water.material_override = wm; water.position = Vector3(22, -0.9, -14); add_child(water)

func _ground_col(x: float, z: float) -> Color:
	var d = Vector2(x - 22, z + 14).length()
	if d < 13: return Color("#d8c890")
	var path = absf(z - 2) < 1.8 or absf(x) < 1.6 or (absf(x + z * 0.2 - 10) < 1.5 and z < 0)
	if path: return Color("#9a7a52")
	var n = fmod(absf(sin(x * 12.9898 + z * 78.233) * 43758.5453), 1.0)
	return Color("#5a9a3a").lerp(Color("#7ab04a"), n * 0.6)

func _house(x: float, z: float, w: float, d: float, rot: float, roof, sign_text := "") -> void:
	var n = Node3D.new(); n.position = Vector3(x, h(x, z), z); n.rotation.y = rot; add_child(n)
	part(n, box(w, 3.2, d), "#e8dcc0", Vector3(0, 1.6, 0))
	for c in [Vector3(-w / 2, 1.6, -d / 2), Vector3(w / 2, 1.6, -d / 2), Vector3(-w / 2, 1.6, d / 2), Vector3(w / 2, 1.6, d / 2)]:
		part(n, box(0.3, 3.3, 0.3), "#5a3a22", c)
	var pr = PrismMesh.new(); pr.size = Vector3(w + 0.8, 2.2, d + 0.8)
	part(n, pr, roof, Vector3(0, 4.3, 0))
	part(n, box(1.1, 2.0, 0.1), "#5a3a22", Vector3(0, 1.0, d / 2 + 0.02))
	for sx in [-w / 3, w / 3]: part(n, box(0.9, 0.8, 0.1), "#f8e8a0", Vector3(sx, 2.0, d / 2 + 0.02))
	var sb = StaticBody3D.new(); var cs = CollisionShape3D.new(); var bs = BoxShape3D.new(); bs.size = Vector3(w, 3.2, d); cs.shape = bs; cs.position.y = 1.6; sb.add_child(cs); n.add_child(sb)
	if sign_text != "":
		var l = Label3D.new(); l.text = sign_text; l.font_size = 64; l.pixel_size = 0.01; l.position = Vector3(0, 3.1, d / 2 + 0.1); l.modulate = Color("#ffe8a0"); l.outline_size = 12
		n.add_child(l)

func _village() -> void:
	_house(-12, -6, 7, 5, 0.1, "#9a3a2a", "Bank")
	_house(-14, 10, 6, 5, -0.2, "#5a6a8a")
	_house(9, -9, 6, 6, 0.3, "#9a3a2a", "Cook's")
	_house(-2, -16, 8, 5, 0.0, "#6a4a3a")
	_house(12, 10, 5, 5, -0.4, "#5a6a8a")
	# bank booth in front of the bank, and a range in front of the cook's house
	var bb = _obj_node("bank", "Bank booth", Vector3(-12, 0, -2.4), 1.4)
	part(bb, box(2.2, 1.2, 0.8), "#6a4a2a", Vector3(0, 0.6, 0)); part(bb, box(2.4, 0.15, 1.0), "#caa060", Vector3(0, 1.25, 0))
	var rg = _obj_node("range", "Range", Vector3(8.2, 0, -5.2), 1.2)
	part(rg, box(1.4, 1.0, 1.0), "#4a4a50", Vector3(0, 0.5, 0)); part(rg, box(0.8, 0.3, 0.6), "#ff7a2a", Vector3(0, 1.1, 0))
	var fl = OmniLight3D.new(); fl.light_color = Color("#ff9a4a"); fl.light_energy = 1.5; fl.omni_range = 5; fl.position.y = 1.4; rg.add_child(fl)
	# well, fences, lamp posts
	var well = Node3D.new(); well.position = Vector3(3, h(3, 3), 3); add_child(well)
	part(well, cyl(1.1, 1.1, 1.0, 8), "#8a8a80", Vector3(0, 0.5, 0)); part(well, cyl(0.9, 0.9, 1.02, 8), "#2a4a6a", Vector3(0, 0.52, 0))
	part(well, box(0.15, 2.4, 0.15), "#5a3a22", Vector3(-1, 1.2, 0)); part(well, box(0.15, 2.4, 0.15), "#5a3a22", Vector3(1, 1.2, 0))
	var roof = PrismMesh.new(); roof.size = Vector3(2.6, 0.9, 1.6); part(well, roof, "#7a3a2a", Vector3(0, 2.7, 0))
	for i in 18:
		var x = -30.0 + i * 2.2
		var f = Node3D.new(); f.position = Vector3(x, h(x, 26), 26); add_child(f)
		part(f, box(0.15, 1.2, 0.15), "#6a4a2a", Vector3(0, 0.6, 0)); part(f, box(2.2, 0.12, 0.08), "#8a6a3a", Vector3(0, 0.9, 0)); part(f, box(2.2, 0.12, 0.08), "#8a6a3a", Vector3(0, 0.45, 0))

func _obj_node(kind: String, name: String, pos: Vector3, r: float) -> Node3D:
	var n = Node3D.new(); pos.y = h(pos.x, pos.z); n.position = pos; add_child(n)
	var sb = StaticBody3D.new(); var cs = CollisionShape3D.new(); var sh = CylinderShape3D.new(); sh.radius = r; sh.height = 3.0
	cs.shape = sh; cs.position.y = 1.5; sb.add_child(cs); n.add_child(sb)
	var o = {"kind": kind, "name": name, "pos": pos, "r": r, "node": n, "down": false, "res_t": 0}
	sb.set_meta("obj", o)
	objs.append(o)
	return n

func _tree(kind: String, pos: Vector3) -> void:
	var n = _obj_node(kind, RES[kind].name, pos, 1.0)
	var oak = kind == "oak"
	part(n, cyl(0.25, 0.35, 2.2 if oak else 1.8), "#6a4a2a", Vector3(0, 1.1, 0))
	var crown = Node3D.new(); n.add_child(crown); crown.name = "crown"
	if oak:
		part(crown, sph(1.8, 7, 4), "#4a7a2a", Vector3(0, 3.6, 0)); part(crown, sph(1.3, 6, 4), "#5a8a32", Vector3(0.9, 4.3, 0.4))
	else:
		part(crown, cyl(0.0, 1.5, 2.4, 7), "#3a7a3a", Vector3(0, 3.2, 0)); part(crown, cyl(0.0, 1.1, 1.8, 7), "#4a8a3a", Vector3(0, 4.3, 0))
	var stump = part(n, cyl(0.35, 0.4, 0.4), "#6a4a2a", Vector3(0, 0.2, 0)); stump.visible = false; stump.name = "stump"

func _rock(kind: String, pos: Vector3) -> void:
	var n = _obj_node(kind, RES[kind].name, pos, 0.9)
	part(n, sph(1.0, 5, 3), "#7a7670", Vector3(0, 0.5, 0), Vector3(0, randf() * 3, 0), Vector3(1.2, 0.8, 1.0))
	var ore = Node3D.new(); ore.name = "ore"; n.add_child(ore)
	var col = {"copper": "#d8864a", "tin": "#c8c8c0", "iron": "#8a4a3a"}[kind]
	for i in 4: part(ore, sph(0.22, 4, 2), col, Vector3(randf_range(-0.6, 0.6), 0.8 + randf() * 0.3, randf_range(-0.4, 0.6)))

func _resources() -> void:
	for p in [Vector2(-24, -20), Vector2(-28, -12), Vector2(-20, -26), Vector2(-32, -24), Vector2(-26, 4), Vector2(-34, -2), Vector2(26, 18), Vector2(-6, 20)]:
		_tree("tree", Vector3(p.x, 0, p.y))
	for p in [Vector2(-36, -16), Vector2(-30, 12)]: _tree("oak", Vector3(p.x, 0, p.y))
	var k = 0
	for p in [Vector2(30, -30), Vector2(33, -28), Vector2(28, -33), Vector2(35, -33), Vector2(32, -36), Vector2(26, -37)]:
		_rock(["copper", "tin", "copper", "tin", "iron", "iron"][k], Vector3(p.x, 0, p.y)); k += 1
	for p in [Vector2(15, -18), Vector2(19, -6)]:
		var n = _obj_node("fish", "Fishing spot", Vector3(p.x, 0, p.y), 1.2)
		n.position.y = -0.85
		for i in 3: part(n, cyl(0.5 + i * 0.4, 0.5 + i * 0.4, 0.02, 12), "#dff0ff", Vector3(0, 0.02 * i, 0)).name = "ring%d" % i

# ── people and monsters ───────────────────────────────────────────────
func _person(shirt, skin, legs) -> Node3D:
	var n = Node3D.new()
	var body = Node3D.new(); body.name = "body"; n.add_child(body)
	part(body, box(0.6, 0.75, 0.35), shirt, Vector3(0, 1.25, 0))
	part(body, box(0.42, 0.42, 0.42), skin, Vector3(0, 1.85, 0))
	part(body, box(0.44, 0.12, 0.44), "#3a2a1a", Vector3(0, 2.1, 0))
	for side in [-1, 1]:
		var leg = Node3D.new(); leg.position = Vector3(side * 0.16, 0.85, 0); body.add_child(leg)
		part(leg, box(0.22, 0.85, 0.25), legs, Vector3(0, -0.42, 0))
		var arm = Node3D.new(); arm.position = Vector3(side * 0.4, 1.55, 0); body.add_child(arm)
		part(arm, box(0.18, 0.7, 0.2), shirt, Vector3(0, -0.33, 0))
		part(arm, box(0.16, 0.14, 0.18), skin, Vector3(0, -0.72, 0))
		n.set_meta("leg_r" if side > 0 else "leg_l", leg); n.set_meta("arm_r" if side > 0 else "arm_l", arm)
	return n

func _spawn_mob(kind: String, pos: Vector3) -> void:
	var n: Node3D
	var mob = {"kind": kind, "home": pos, "hp": 5 if kind == "goblin" else 3, "max": 5 if kind == "goblin" else 3, "lvl": 2 if kind == "goblin" else 1, "dead": 0, "cd": 0, "fight": false, "wander": Vector3.ZERO}
	if kind == "goblin":
		n = _person("#6a5a3a", "#6a9a3a", "#4a3a2a"); n.scale = Vector3.ONE * 0.8
		mob.name = "Goblin"
	else:
		n = Node3D.new(); mob.name = "Chicken"
		part(n, sph(0.35, 6, 4), "#f0ece0", Vector3(0, 0.45, 0), Vector3.ZERO, Vector3(1, 0.9, 1.3))
		part(n, sph(0.18, 5, 3), "#f0ece0", Vector3(0, 0.8, 0.3)); part(n, box(0.08, 0.08, 0.12), "#e8a020", Vector3(0, 0.78, 0.5)); part(n, box(0.05, 0.12, 0.08), "#d02a2a", Vector3(0, 0.98, 0.3))
	pos.y = h(pos.x, pos.z); n.position = pos; add_child(n)
	var sb = StaticBody3D.new(); var cs = CollisionShape3D.new(); var sh = CylinderShape3D.new(); sh.radius = 0.7; sh.height = 2.0; cs.shape = sh; cs.position.y = 1; sb.add_child(cs); n.add_child(sb)
	var bar = Label3D.new(); bar.billboard = BaseMaterial3D.BILLBOARD_ENABLED; bar.position.y = 2.6 if kind == "goblin" else 1.4; bar.font_size = 48; bar.pixel_size = 0.008; bar.outline_size = 8; bar.no_depth_test = true
	n.add_child(bar)
	mob.node = n; mob.bar = bar; mob.r = 0.8
	sb.set_meta("obj", mob)
	mob.kind_obj = "mob"
	mobs.append(mob)

func _hitsplat(pos: Vector3, dmg: int, col: Color) -> void:
	var l = Label3D.new(); l.text = str(dmg); l.billboard = BaseMaterial3D.BILLBOARD_ENABLED; l.font_size = 72; l.pixel_size = 0.01
	l.modulate = Color.WHITE; l.outline_modulate = col; l.outline_size = 28; l.no_depth_test = true
	add_child(l); l.global_position = pos
	var tw = create_tween(); tw.tween_property(l, "global_position", pos + Vector3(0, 0.8, 0), 0.9); tw.tween_callback(l.queue_free)

# ── UI ────────────────────────────────────────────────────────────────
func _stone() -> StyleBoxFlat:
	var sb = StyleBoxFlat.new(); sb.bg_color = Color("#3e3529"); sb.border_color = Color("#1a140e"); sb.set_border_width_all(3); sb.set_corner_radius_all(4); sb.set_content_margin_all(8)
	return sb

func _ui() -> void:
	ui = CanvasLayer.new(); add_child(ui)
	var side = PanelContainer.new(); side.add_theme_stylebox_override("panel", _stone())
	side.anchor_left = 1; side.anchor_right = 1; side.anchor_top = 1; side.anchor_bottom = 1
	side.offset_left = -300; side.offset_right = -10; side.offset_top = -560; side.offset_bottom = -10
	ui.add_child(side)
	var v = VBoxContainer.new(); side.add_child(v)
	var tabs = HBoxContainer.new(); v.add_child(tabs)
	var pages = []
	inv_grid = GridContainer.new(); inv_grid.columns = 4; inv_grid.add_theme_constant_override("h_separation", 6); inv_grid.add_theme_constant_override("v_separation", 6)
	skills_box = VBoxContainer.new(); skills_box.visible = false
	for pair in [["Inventory", inv_grid], ["Skills", skills_box]]:
		var b = Button.new(); b.text = pair[0]; tabs.add_child(b); v.add_child(pair[1]); pages.append(pair[1])
		var pg = pair[1]
		b.pressed.connect(func():
			for p in pages: p.visible = p == pg)
	for i in 28:
		var slot = Button.new(); slot.custom_minimum_size = Vector2(62, 56); slot.clip_text = true
		slot.add_theme_font_size_override("font_size", 10)
		var idx = i
		slot.pressed.connect(func(): _use_slot(idx))
		inv_grid.add_child(slot)
	hp_label = Label.new(); hp_label.add_theme_font_size_override("font_size", 16); v.add_child(hp_label)
	var cp = PanelContainer.new(); cp.add_theme_stylebox_override("panel", _stone())
	cp.anchor_top = 1; cp.anchor_bottom = 1; cp.offset_left = 10; cp.offset_right = 560; cp.offset_top = -190; cp.offset_bottom = -10
	ui.add_child(cp)
	chat = RichTextLabel.new(); chat.scroll_following = true; chat.add_theme_color_override("default_color", Color("#f0e0b0")); chat.add_theme_font_size_override("normal_font_size", 14)
	cp.add_child(chat)
	hover = Label.new(); hover.position = Vector2(12, 8); hover.add_theme_font_size_override("font_size", 18)
	hover.add_theme_color_override("font_outline_color", Color.BLACK); hover.add_theme_constant_override("outline_size", 5); hover.add_theme_color_override("font_color", Color("#ffff60"))
	ui.add_child(hover)
	# minimap: a top-down orthographic view of the same world
	var mc = SubViewportContainer.new(); mc.anchor_left = 1; mc.anchor_right = 1; mc.offset_left = -210; mc.offset_right = -10; mc.offset_top = 10; mc.offset_bottom = 210; mc.stretch = true
	ui.add_child(mc)
	var sv = SubViewport.new(); sv.size = Vector2i(200, 200); sv.world_3d = get_world_3d(); mc.add_child(sv)
	var mcam = Camera3D.new(); mcam.projection = Camera3D.PROJECTION_ORTHOGONAL; mcam.size = 70; mcam.rotation = Vector3(-PI / 2, 0, 0); mcam.name = "mcam"; sv.add_child(mcam)
	set_meta("mcam", mcam)
	menu = PopupMenu.new(); ui.add_child(menu)
	menu.id_pressed.connect(func(id): menu_opts[id].call())

func _refresh() -> void:
	for i in 28:
		var slot: Button = inv_grid.get_child(i)
		var it = inv[i]
		slot.text = ITEMS[it].name if it else ""
		slot.modulate = Color(ITEMS[it].col).lerp(Color.WHITE, 0.45) if it else Color(1, 1, 1, 0.5)
	for c in skills_box.get_children(): c.queue_free()
	var total = 0
	for s in SKILLS:
		var l = Label.new(); var lv = level(s); total += lv
		var nxt = xp_for(lv + 1) - xp[s] if lv < 99 else 0.0
		l.text = "%s  %d   (%d xp, %d to next)" % [s.capitalize(), lv, int(xp[s]), int(nxt)]
		l.add_theme_color_override("font_color", Color("#ffe890")); skills_box.add_child(l)
	var tl = Label.new(); tl.text = "Total level: %d" % total; skills_box.add_child(tl)
	hp_label.text = "Hitpoints %d / %d    Bank: %d items" % [hp, level("hitpoints"), _bank_count()]

func _bank_count() -> int:
	var n = 0
	for k in bank: n += int(bank[k])
	return n

func _free_slot() -> int:
	return inv.find(null)

func _add_xp(s: String, amt: float) -> void:
	var before = level(s)
	xp[s] += amt
	var l = Label.new(); l.text = "+%s %s xp" % [str(snapped(amt, 0.1)), s.capitalize()]
	l.add_theme_font_size_override("font_size", 16); l.add_theme_color_override("font_color", Color.WHITE)
	l.add_theme_color_override("font_outline_color", Color.BLACK); l.add_theme_constant_override("outline_size", 5)
	l.position = Vector2(get_viewport().get_visible_rect().size.x - 380, 240); ui.add_child(l)
	var tw = create_tween(); tw.tween_property(l, "position:y", 150.0, 1.4); tw.parallel().tween_property(l, "modulate:a", 0.0, 1.4); tw.tween_callback(l.queue_free)
	if level(s) > before:
		say("[color=#60ff60]Congratulations, you just advanced a %s level. You are now level %d.[/color]" % [s.capitalize(), level(s)])
	_refresh()

func _use_slot(i: int) -> void:
	var it = inv[i]
	if it == null: return
	if it == "shrimps":
		inv[i] = null; hp = min(level("hitpoints"), hp + 3); say("You eat the shrimps. It heals some health.")
	else:
		say("%s." % ITEMS[it].name)
	_refresh()

# ── input ─────────────────────────────────────────────────────────────
func _pick(screen: Vector2):
	var from = cam.project_ray_origin(screen); var dir = cam.project_ray_normal(screen)
	var hit = get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from, from + dir * 300))
	if hit and hit.collider.has_meta("obj"): return hit.collider.get_meta("obj")
	# ground: march along the ray to the height field
	var t = 0.0
	while t < 300:
		var p = from + dir * t
		if p.y <= h(p.x, p.z): return p
		t += 0.25
	return null

func _options(o) -> Array:
	var out = []
	if o is Vector3:
		out.append(["Walk here", func(): _walk(o)])
		return out
	if o.get("kind_obj", "") == "mob":
		out.append(["Attack %s (level-%d)" % [o.name, o.lvl], func(): _set_action(o)])
		out.append(["Examine %s" % o.name, func(): say("A %s. %s" % [o.name.to_lower(), "It looks mean." if o.kind == "goblin" else "Bwaak."])])
	elif RES.has(o.kind):
		out.append(["%s %s" % [RES[o.kind].verb, o.name], func(): _set_action(o)])
		out.append(["Examine %s" % o.name, func(): say("Requires %s level %d." % [RES[o.kind].skill.capitalize(), RES[o.kind].lvl])])
	elif o.kind == "bank":
		out.append(["Bank Bank booth", func(): _set_action(o)])
	elif o.kind == "range":
		out.append(["Cook-at Range", func(): _set_action(o)])
	out.append(["Walk here", func(): _walk(o.pos)])
	return out

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion:
		var o = _pick(e.position)
		hover.text = "" if o == null else _options(o)[0][0]
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
			cam_yaw -= e.relative.x * 0.01; cam_pitch = clampf(cam_pitch + e.relative.y * 0.005, 0.45, 1.35)
	if e is InputEventMouseButton and e.pressed:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP: cam_dist = maxf(8.0, cam_dist - 1.2)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN: cam_dist = minf(34.0, cam_dist + 1.2)
		elif e.button_index == MOUSE_BUTTON_LEFT:
			var o = _pick(e.position)
			if o != null: _options(o)[0][1].call()
		elif e.button_index == MOUSE_BUTTON_RIGHT:
			var o = _pick(e.position)
			if o == null: return
			menu.clear(); menu_opts = []
			var opts = _options(o)
			opts.append(["Cancel", func(): pass])
			for i in opts.size():
				menu.add_item(opts[i][0], i); menu_opts.append(opts[i][1])
			menu.position = Vector2i(e.position); menu.popup()

func _walk(p: Vector3) -> void:
	action = null; target_pos = p

func _set_action(o) -> void:
	action = o; target_pos = o.pos if not o.has("node") or o.get("kind_obj", "") != "mob" else o.node.position

# ── game loop ─────────────────────────────────────────────────────────
func _process(delta: float) -> void:
	if Input.is_key_pressed(KEY_LEFT): cam_yaw += delta * 1.8
	if Input.is_key_pressed(KEY_RIGHT): cam_yaw -= delta * 1.8
	if Input.is_key_pressed(KEY_UP): cam_pitch = minf(1.35, cam_pitch + delta)
	if Input.is_key_pressed(KEY_DOWN): cam_pitch = maxf(0.45, cam_pitch - delta)
	var moving = false
	if action != null and action.get("kind_obj", "") == "mob": target_pos = action.node.position
	if target_pos != null:
		var to = target_pos - player.position; to.y = 0
		var reach = (action.r + 0.9) if action != null else 0.15
		if to.length() > reach:
			var step = to.normalized() * minf(to.length() - reach + 0.01, delta * (4.2 if Input.is_key_pressed(KEY_SHIFT) else 2.6))
			player.position += step
			player.rotation.y = atan2(to.x, to.z)
			moving = true
		else:
			if to.length() > 0.01: player.rotation.y = atan2(to.x, to.z)
			if action == null: target_pos = null
	player.position.y = h(player.position.x, player.position.z)
	_animate(player, moving, delta)
	# camera orbits the player like the classic client
	var off = Vector3(sin(cam_yaw) * cos(cam_pitch), sin(cam_pitch), cos(cam_yaw) * cos(cam_pitch)) * cam_dist
	cam.global_position = cam.global_position.lerp(player.position + off, clampf(delta * 8, 0, 1))
	cam.look_at(player.position + Vector3(0, 1.2, 0))
	var mcam: Camera3D = get_meta("mcam")
	mcam.global_position = player.position + Vector3(0, 60, 0)
	for o in objs:
		if o.kind == "fish":
			for i in 3:
				var r = o.node.get_node("ring%d" % i); var k = fmod(anim_t * 0.5 + i / 3.0, 1.0)
				r.scale = Vector3.ONE * (0.5 + k); r.visible = true
	for mob in mobs:
		_mob_frame(mob, delta)
	tick_t += delta
	while tick_t >= TICK:
		tick_t -= TICK
		_tick()

func _animate(n: Node3D, moving: bool, delta: float) -> void:
	anim_t += delta
	if not n.has_meta("leg_r"): return
	var sw = sin(anim_t * 9.0) * 0.6 if moving else 0.0
	n.get_meta("leg_r").rotation.x = sw; n.get_meta("leg_l").rotation.x = -sw
	n.get_meta("arm_r").rotation.x = -sw * 0.8; n.get_meta("arm_l").rotation.x = sw * 0.8
	if n == player and busy_anim > 0:
		busy_anim = maxf(0.0, busy_anim - delta)
		n.get_meta("arm_r").rotation.x = -1.2 + sin(busy_anim * 12.0) * 0.8

func _mob_frame(mob: Dictionary, delta: float) -> void:
	var n: Node3D = mob.node
	if mob.dead > 0:
		n.visible = false; return
	n.visible = true
	mob.bar.text = "" if mob.hp == mob.max and not mob.fight else "▮".repeat(mob.hp) + "▯".repeat(mob.max - mob.hp)
	mob.bar.modulate = Color("#40e040") if mob.hp * 2 > mob.max else Color("#e04030")
	var goal: Vector3 = player.position if mob.fight else mob.home + mob.wander
	var to = goal - n.position; to.y = 0
	var moving = to.length() > (1.4 if mob.fight else 0.3)
	if moving:
		n.position += to.normalized() * delta * (2.2 if mob.fight else 0.8)
		n.rotation.y = atan2(to.x, to.z)
	n.position.y = h(n.position.x, n.position.z)
	_animate(n, moving, 0.0)
	mob.pos = n.position

func _tick() -> void:
	ticks += 1
	for o in objs:
		if o.down and ticks >= o.res_t: _respawn(o)
	for mob in mobs:
		if mob.dead > 0:
			mob.dead -= 1
			if mob.dead == 0:
				mob.hp = mob.max; mob.node.position = mob.home; mob.fight = false
			continue
		if ticks % 8 == 0 and not mob.fight: mob.wander = Vector3(randf_range(-4, 4), 0, randf_range(-4, 4))
		if mob.fight:
			mob.cd -= 1
			if mob.cd <= 0 and mob.node.position.distance_to(player.position) < 2.0:
				mob.cd = 4
				var acc = 0.5 * (mob.lvl + 8.0) / (level("defence") + 8.0)
				var dmg = randi_range(1, mob.lvl) if randf() < acc else 0
				hp -= dmg
				_hitsplat(player.position + Vector3(0, 2.2, 0), dmg, Color("#c02020") if dmg > 0 else Color("#3060c0"))
				if hp <= 0: _die()
				_refresh()
	if action == null: return
	var o = action
	var dist = Vector2(o.pos.x - player.position.x, o.pos.z - player.position.z).length()
	if dist > o.r + 1.2: return
	if o.get("kind_obj", "") == "mob": _fight_tick(o); return
	match o.kind:
		"bank":
			var n = 0
			for i in 28:
				if inv[i]: bank[inv[i]] = int(bank.get(inv[i], 0)) + 1; inv[i] = null; n += 1
			say("You deposit %d items into your bank." % n if n > 0 else "You have nothing to deposit.")
			action = null; target_pos = null; _refresh()
		"range":
			var i = inv.find("raw_shrimps")
			if i < 0:
				say("You have nothing to cook."); action = null; return
			busy_anim = 0.6
			var burn = clampf(0.55 - level("cooking") * 0.017, 0.0, 0.55)
			if randf() < burn:
				inv[i] = "burnt_shrimps"; say("You accidentally burn the shrimps.")
			else:
				inv[i] = "shrimps"; say("You successfully cook some shrimps."); _add_xp("cooking", 30)
			_refresh()
		_:
			if not RES.has(o.kind) or o.down: action = null; return
			var R = RES[o.kind]
			if level(R.skill) < R.lvl:
				say("You need a %s level of %d to do that." % [R.skill.capitalize(), R.lvl]); action = null; return
			if _free_slot() < 0:
				say("Your inventory is too full to hold any more."); action = null; return
			busy_anim = 0.6
			var ch = R.chance + (level(R.skill) - R.lvl) * 0.012
			if randf() < ch:
				inv[_free_slot()] = R.item
				say("You get some %s." % ITEMS[R.item].name.to_lower())
				_add_xp(R.skill, R.xp)
				if R.respawn > 0 and randf() < (0.6 if o.kind != "oak" else 0.25):
					_deplete(o, R.respawn)
					action = null

func _deplete(o: Dictionary, secs: int) -> void:
	o.down = true; o.res_t = ticks + int(secs / TICK)
	if o.node.has_node("crown"): o.node.get_node("crown").visible = false; o.node.get_node("stump").visible = true
	if o.node.has_node("ore"): o.node.get_node("ore").visible = false

func _respawn(o: Dictionary) -> void:
	o.down = false
	if o.node.has_node("crown"): o.node.get_node("crown").visible = true; o.node.get_node("stump").visible = false
	if o.node.has_node("ore"): o.node.get_node("ore").visible = true

func _fight_tick(mob: Dictionary) -> void:
	if mob.dead > 0: action = null; return
	mob.fight = true
	atk_cd -= 1
	if atk_cd > 0: return
	atk_cd = 4
	busy_anim = 0.4
	var acc = 0.6 * (level("attack") + 8.0) / (mob.lvl * 2 + 8.0)
	var max_hit = 1 + int(level("strength") / 8)
	var dmg = randi_range(0, max_hit) if randf() < acc else 0
	mob.hp -= dmg
	_hitsplat(mob.node.position + Vector3(0, 1.8, 0), dmg, Color("#c02020") if dmg > 0 else Color("#3060c0"))
	if dmg > 0:
		_add_xp("attack", dmg * 4.0 / 3.0); _add_xp("strength", dmg * 4.0 / 3.0); _add_xp("defence", dmg * 4.0 / 3.0); _add_xp("hitpoints", dmg * 1.33)
	if mob.hp <= 0:
		mob.dead = 25; action = null; target_pos = null
		say("You defeat the %s." % mob.name.to_lower())
		var s = _free_slot()
		if s >= 0: inv[s] = "bones"
		var s2 = _free_slot()
		if s2 >= 0 and mob.kind == "goblin": inv[s2] = "coins"
		_refresh()

func _die() -> void:
	say("[color=#ff6060]Oh dear, you are dead![/color]")
	hp = level("hitpoints")
	player.position = Vector3(0, 0, 4); action = null; target_pos = null
	for mob in mobs: mob.fight = false

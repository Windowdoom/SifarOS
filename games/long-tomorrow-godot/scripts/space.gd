extends Node3D
## A star system in space: the star, planets (NASA/Solar System Scope maps
## where available, palette colours otherwise), Saturn's rings, the asteroid
## belt, stations and Engineer gates. Flight: mouse to steer, W/S thrust,
## Q/E roll, Shift boost, C cruise drive. L to land near a world with a site,
## E to dock or use a gate, M for the star map.

var system_id = "sol"
var start_near = ""
var backdrop = false
var sys: Dictionary
var ship: Node3D
var cam: Camera3D
var vel = Vector3.ZERO
var cruise = false
var bodies: Array = []   # {b, node, pos}
var _t = 0.0
var _near = null

const TEX := {"earth": "earth_day.jpg", "mars": "mars.jpg", "jupiter": "jupiter.jpg", "saturn": "saturn.jpg", "venus": "venus.jpg", "europa": "europa.jpg", "titan": "titan.jpg", "io": "io.jpg", "ganymede": "ganymede.jpg", "enceladus": "enceladus.jpg", "neptune": "neptune.jpg", "pluto": "pluto.jpg"}

func _ready() -> void:
	sys = Cosmos.get_system(system_id)
	if sys == null or sys.is_empty(): sys = Cosmos.get_system("sol")
	var env = Environment.new()
	var sky = Sky.new(); var pm = PanoramaSkyMaterial.new()
	pm.panorama = Gen.tex("res://assets/planets/starmap.jpg"); pm.energy_multiplier = 0.5
	sky.sky_material = pm
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color("#20242c"); env.ambient_light_energy = 0.4
	env.tonemap_mode = Environment.TONE_MAPPER_ACES; env.glow_enabled = true; env.glow_intensity = 0.8; env.glow_hdr_threshold = 1.0
	var we = WorldEnvironment.new(); we.environment = env; add_child(we)
	var st: Dictionary = sys.get("star", {"color": "#fff4ea", "R": 1.0})
	var scol = DB.col(str(st.get("color", "#fff4ea")))
	var sun = DirectionalLight3D.new(); sun.light_color = scol; sun.light_energy = 1.6; sun.shadow_enabled = false
	add_child(sun)
	var star = MeshInstance3D.new(); var sm = SphereMesh.new(); var R = 600.0 * clampf(float(st.get("R", 1.0)), 0.2, 4.0)
	sm.radius = R; sm.height = R * 2; star.mesh = sm; star.material_override = Gen.glow(scol, 8)
	add_child(star)
	for b in sys.get("bodies", []):
		_add_body(b)
	ship = Gen.ship(Color("#9fb0c2"))
	add_child(ship)
	cam = Camera3D.new(); cam.far = 400000; cam.near = 0.5; cam.fov = 70
	add_child(cam); cam.current = true
	# start near a body (the one we took off from) or at the edge of the inner system
	var p0 = Vector3(0, 400, 14000)
	for e in bodies:
		if start_near != "" and (e.b.get("site", "") == start_near or e.b.id == start_near):
			p0 = e.pos + Vector3(0, float(e.b.get("r", 100)) * 0.6, float(e.b.get("r", 100)) * 2.5 + 200)
	if backdrop:
		for e in bodies:
			if e.b.id == "earth": p0 = e.pos + Vector3(-500, 120, 700)
	ship.position = p0
	ship.look_at(Vector3.ZERO)
	# sunlight falls from the star onto the ship's neighbourhood
	sun.look_at_from_position(Vector3.ZERO, p0, Vector3.UP)
	Sfx.ambient(0, 420, [36, 54, 72], 0.1)
	if not backdrop:
		Game.inst.hud.set_help("Mouse steer · W/S thrust · Q/E roll · Shift boost · C cruise · L land · E dock/gate · M star map · J journal · K command · Esc menu")
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _add_body(b: Dictionary) -> void:
	var ang = float(b.get("ang", randf() * TAU))
	var orbit = float(b.get("orbit", 10000))
	var pos = Vector3(cos(ang) * orbit, 0, sin(ang) * orbit)
	var node = Node3D.new(); node.position = pos; add_child(node)
	var t: String = b.get("type", "rocky")
	var r = float(b.get("r", 100) if b.get("r") != null else 100)
	if t == "belt":
		var mm = MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D
		var rock = SphereMesh.new(); rock.radius = 1; rock.height = 1.6; rock.radial_segments = 6; rock.rings = 3
		mm.mesh = rock; mm.instance_count = 1500
		var rr = Cosmos.Rng.new(Cosmos.hash(system_id + "belt"))
		for i in 1500:
			var a = rr.next() * TAU; var d = orbit + (rr.next() - 0.5) * 2400
			var s = 4.0 + rr.next() * 30.0
			mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ONE * s), Vector3(cos(a) * d, (rr.next() - 0.5) * 300, sin(a) * d)))
		var mi = MultiMeshInstance3D.new(); mi.multimesh = mm; mi.material_override = Gen.mat(Color("#6a625a"), 0.95)
		add_child(mi); node.queue_free()
		return
	var mesh = MeshInstance3D.new()
	if t == "gate":
		var tor = TorusMesh.new(); tor.inner_radius = r * 0.85; tor.outer_radius = r; tor.rings = 64
		mesh.mesh = tor; mesh.material_override = Gen.glow(Color("#f2a33a"), 3); mesh.rotation.x = PI / 2
	elif t in ["station", "hub", "mega"]:
		var bm = BoxMesh.new(); bm.size = Vector3(r, r * 0.3, r * 2)
		mesh.mesh = bm; mesh.material_override = Gen.panel(Color("#9aa4b0"), 5, 0.6)
		var ring = MeshInstance3D.new(); var tr = TorusMesh.new(); tr.inner_radius = r * 1.1; tr.outer_radius = r * 1.25; ring.mesh = tr
		ring.material_override = Gen.mat(Color("#8a929c"), 0.4, 0.8); ring.add_to_group("space_spin"); node.add_child(ring)
	else:
		var sm = SphereMesh.new(); sm.radius = r; sm.height = r * 2; sm.radial_segments = 64; sm.rings = 32
		mesh.mesh = sm
		var m = StandardMaterial3D.new(); m.roughness = 0.9
		var id: String = b.get("id", "")
		if TEX.has(id): m.albedo_texture = Gen.tex("res://assets/planets/" + TEX[id])
		else:
			var pal: Array = b.get("pal", ["#8a8078", "#5a524c"])
			m.albedo_color = DB.col(pal[0])
		if t == "lava": m.emission_enabled = true; m.emission = Color("#ff5a1a"); m.emission_energy_multiplier = 0.6
		mesh.material_override = m
		if b.get("atmo", null) != null:
			var at = MeshInstance3D.new(); var as_ = SphereMesh.new(); as_.radius = r * 1.03; as_.height = r * 2.06; at.mesh = as_
			var am = StandardMaterial3D.new(); am.albedo_color = DB.col(b.atmo); am.albedo_color.a = 0.18; am.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			am.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; am.blend_mode = BaseMaterial3D.BLEND_MODE_ADD; am.cull_mode = BaseMaterial3D.CULL_FRONT
			at.material_override = am; node.add_child(at)
		if id == "saturn":
			var ring = MeshInstance3D.new(); var rq = CylinderMesh.new(); rq.top_radius = r * 2.3; rq.bottom_radius = r * 2.3; rq.height = 2
			ring.mesh = rq; var rm = StandardMaterial3D.new(); rm.albedo_color = Color(0.85, 0.78, 0.62, 0.55); rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			ring.material_override = rm; ring.rotation.x = 0.45; node.add_child(ring)
	node.add_child(mesh)
	var lab = Label3D.new(); lab.text = str(b.get("name", "")); lab.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lab.pixel_size = r * 0.004; lab.position.y = r * 1.4; lab.modulate = Color(1, 1, 1, 0.7); lab.no_depth_test = true
	node.add_child(lab)
	bodies.append({"b": b, "node": node, "pos": pos, "r": r})

func _unhandled_input(event: InputEvent) -> void:
	if backdrop or Game.inst.ui.is_open(): return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		ship.rotate_object_local(Vector3.UP, -event.relative.x * 0.002)
		ship.rotate_object_local(Vector3.RIGHT, -event.relative.y * 0.002)
	if event.is_action_pressed("cruise"):
		cruise = not cruise
		Game.hud_toast("Cruise drive engaged." if cruise else "Cruise drive off.")
	if event.is_action_pressed("land") and _near != null:
		var b: Dictionary = _near.b
		if b.get("site", null) != null and b.site != "":
			Sfx.play("engine"); Game.inst.go_surface(b.site)
		else:
			Game.hud_toast("Nowhere to land on %s." % b.get("name", "that"))
	if event.is_action_pressed("interact") and _near != null:
		var b: Dictionary = _near.b
		if b.get("type", "") == "gate": Game.inst.ui.show_starmap(true)
		elif b.get("site", null) != null and b.site != "": Game.inst.go_surface(b.site)

func _process(delta: float) -> void:
	_t += delta
	for n in get_tree().get_nodes_in_group("space_spin"): n.rotate_y(delta * 0.1)
	if backdrop:
		ship.rotate_y(delta * 0.02)
		cam.global_position = ship.global_position + ship.global_transform.basis * Vector3(0, 6, 24)
		cam.look_at(ship.global_position + Vector3(0, 2, 0))
		return
	var ui_open: bool = Game.inst.ui.is_open()
	var b = ship.global_transform.basis
	if not ui_open:
		var roll = Input.get_axis("roll_right", "roll_left")
		ship.rotate_object_local(Vector3.FORWARD, roll * delta * 1.4)
		var thr = Input.get_axis("move_back", "move_forward")
		var boost = Input.is_action_pressed("sprint")
		vel += -b.z * thr * (120.0 if boost else 45.0) * delta
	var cap = 4000.0 if cruise else 260.0
	if cruise: vel = vel.lerp(-b.z * cap, clampf(delta * 0.8, 0, 1))
	if vel.length() > cap: vel = vel.normalized() * cap
	vel *= 1.0 - clampf(delta * 0.15, 0, 1)
	ship.global_position += vel * delta
	# nearest body, and keep out of planets
	_near = null
	var nd = 1e18
	for e in bodies:
		var d: float = ship.global_position.distance_to(e.pos) - float(e.r)
		if d < nd: nd = d; _near = e
		if d < 30.0 and e.b.get("type", "") != "gate":
			ship.global_position = e.pos + (ship.global_position - e.pos).normalized() * (float(e.r) + 30.0); vel = Vector3.ZERO
	if _near != null and nd > float(_near.r) * 3.0 + 800: _near = null
	cam.global_position = cam.global_position.lerp(ship.global_position + b * Vector3(0, 7, 30), clampf(delta * 8, 0, 1))
	cam.global_basis = cam.global_basis.slerp(b, clampf(delta * 6, 0, 1))
	var t = "%s · %s\nSpeed %d m/s%s" % [sys.get("name", system_id), str(sys.get("star", {}).get("cls", "")), int(vel.length()), "  (cruise)" if cruise else ""]
	if _near != null:
		var nb: Dictionary = _near.b
		t += "\nNear %s" % nb.get("name", "")
		var pr = ""
		if nb.get("type", "") == "gate": pr = "[E] Use the gate"
		elif nb.get("site", null) != null and nb.site != "": pr = "[L] Land on %s" % nb.name
		Game.inst.hud.set_prompt(pr)
	else:
		Game.inst.hud.set_prompt("")
	Game.inst.hud.set_readout(t)

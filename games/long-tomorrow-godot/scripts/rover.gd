extends VehicleBody3D
## Drivable vehicle. A six-wheel pressurised rover on most worlds (real
## VehicleBody3D wheels, suspension and friction under the site's gravity),
## or a hovercar in cities (four spring-damper thrusters over the ground).
## F to enter or leave; W/S throttle, A/D steer, Space brake, Shift boost.

var surface: Node3D
var hover = false
var driver = null
var hp = 400.0
var dead = false
var _wheels: Array = []
var _thrusters = [Vector3(-1.0, 0, -1.8), Vector3(1.0, 0, -1.8), Vector3(-1.0, 0, 1.8), Vector3(1.0, 0, 1.8)]
var _glow: Array = []

func _ready() -> void:
	mass = 900.0 if hover else 2400.0
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = Vector3(0, -0.4, 0)
	gravity_scale = float(surface.site.get("g", 1.0))
	collision_layer = 1 | 8
	collision_mask = 1
	var body_col = Color("#d8dde4") if hover else Color("#e0dcd0")
	var hull = Gen.panel(body_col, 77 if hover else 78, 0.4)
	var cs = CollisionShape3D.new(); var sh = BoxShape3D.new()
	sh.size = Vector3(2.2, 1.0, 4.2) if hover else Vector3(2.6, 1.2, 4.8)
	cs.shape = sh; cs.position.y = 0.5 if hover else 0.9
	add_child(cs)
	if hover:
		_box(Vector3(2.2, 0.6, 4.2), Vector3(0, 0.4, 0), hull)
		_box(Vector3(1.9, 0.55, 2.0), Vector3(0, 0.95, -0.2), _glass())
		for t in _thrusters:
			var c = CylinderMesh.new(); c.top_radius = 0.32; c.bottom_radius = 0.32; c.height = 0.12
			var mi = MeshInstance3D.new(); mi.mesh = c; mi.material_override = Gen.glow(Color("#7fd4ff"), 3); mi.position = t + Vector3(0, 0.05, 0)
			add_child(mi); _glow.append(mi)
		var l = OmniLight3D.new(); l.light_color = Color("#7fd4ff"); l.light_energy = 1.5; l.omni_range = 6; l.position.y = -0.2; add_child(l)
	else:
		_box(Vector3(2.6, 1.0, 4.8), Vector3(0, 1.0, 0), hull)
		_box(Vector3(2.2, 0.9, 2.2), Vector3(0, 1.9, -0.8), hull)
		_box(Vector3(2.0, 0.6, 0.05), Vector3(0, 1.95, -1.93), _glass())
		_box(Vector3(0.5, 0.25, 0.1), Vector3(-0.8, 1.2, -2.45), Gen.glow(Color("#fff2dc"), 4))
		_box(Vector3(0.5, 0.25, 0.1), Vector3(0.8, 1.2, -2.45), Gen.glow(Color("#fff2dc"), 4))
		var head = SpotLight3D.new(); head.position = Vector3(0, 1.3, -2.6); head.spot_range = 50; head.spot_angle = 35; head.light_energy = 4; add_child(head)
		for z in [-1.6, 0.0, 1.6]:
			for x in [-1.45, 1.45]:
				var w = VehicleWheel3D.new()
				w.position = Vector3(x, 0.55, z)
				w.wheel_radius = 0.55; w.wheel_rest_length = 0.3; w.suspension_travel = 0.35
				w.suspension_stiffness = 40.0; w.damping_compression = 0.9; w.damping_relaxation = 1.2
				w.wheel_friction_slip = 2.2; w.use_as_traction = true; w.use_as_steering = z < 0
				add_child(w)
				var c = CylinderMesh.new(); c.top_radius = 0.55; c.bottom_radius = 0.55; c.height = 0.4
				var mi = MeshInstance3D.new(); mi.mesh = c; mi.rotation.z = PI / 2
				mi.material_override = Gen.mat(Color("#2a2a2c"), 0.9)
				w.add_child(mi)
				_wheels.append(w)

func _box(size: Vector3, pos: Vector3, m: Material) -> void:
	var b = BoxMesh.new(); b.size = size
	var mi = MeshInstance3D.new(); mi.mesh = b; mi.material_override = m; mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mi)

func _glass() -> StandardMaterial3D:
	var m = StandardMaterial3D.new(); m.albedo_color = Color(0.12, 0.18, 0.24, 0.55); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.metallic = 0.9; m.roughness = 0.05
	return m

func toggle_driver(p: Player) -> void:
	if driver == p:
		driver = null
		p.set_meta("in_vehicle", false); p.set_meta("vehicle", null)
		p.global_position = global_position + global_transform.basis.x * 2.4 + Vector3.UP * 0.5
		p.velocity = Vector3.ZERO
		p.collision_layer = 1; p.collision_mask = 1
		p.spring.remove_excluded_object(get_rid())
		Sfx.play("door")
	elif driver == null:
		driver = p
		p.set_meta("in_vehicle", true); p.set_meta("vehicle", self)
		p.collision_layer = 0; p.collision_mask = 0
		p.spring.add_excluded_object(get_rid())
		Sfx.play("door")
		Game.hud_toast("W/S throttle · A/D steer · Space brake · Shift boost · F exit")

func _physics_process(delta: float) -> void:
	var ui_open: bool = Game.inst.ui.is_open()
	var thr = 0.0
	var steer = 0.0
	var brk = false
	var boost = false
	if driver and not ui_open:
		thr = Input.get_axis("move_back", "move_forward")
		steer = Input.get_axis("move_right", "move_left")
		brk = Input.is_action_pressed("jump")
		boost = Input.is_action_pressed("sprint")
		driver.global_position = global_position + global_transform.basis.y * 1.2
		driver.velocity = Vector3.ZERO
	if hover:
		_hover(delta, thr, steer, brk, boost)
	else:
		var power = (9000.0 if boost else 5500.0)
		engine_force = thr * power * (0.35 if linear_velocity.dot(-global_transform.basis.z) * thr < 0 else 1.0) * -1.0
		steering = move_toward(steering, steer * 0.5, delta * 2.5)
		brake = 60.0 if brk or (driver == null) else 0.0
	if global_position.y < -200:
		global_position = surface.spawn_point() + Vector3(4, 2, 0); linear_velocity = Vector3.ZERO

func _hover(delta: float, thr: float, steer: float, brk: bool, boost: bool) -> void:
	var space = get_world_3d().direct_space_state
	var ride = 1.6
	var b = global_transform.basis
	for i in _thrusters.size():
		var p: Vector3 = global_transform * _thrusters[i]
		var q = PhysicsRayQueryParameters3D.create(p, p - Vector3.UP * (ride * 3.0))
		q.exclude = [get_rid()]
		var hit = space.intersect_ray(q)
		if hit:
			var d: float = p.distance_to(hit.position)
			var comp = clampf((ride - d) / ride, -0.5, 1.0)
			var vel = linear_velocity + angular_velocity.cross(p - global_position)
			var f = (comp * 3.2 - vel.y * 0.35) * mass * 9.81 * gravity_scale / 4.0 * 1.4
			apply_force(Vector3.UP * maxf(f, 0.0), p - global_position)
		_glow[i].material_override.emission_energy_multiplier = 2.0 + absf(thr) * 3.0
	var fwd = -b.z; fwd.y = 0; fwd = fwd.normalized()
	var speed_cap = 48.0 if boost else 30.0
	if linear_velocity.dot(fwd) * signf(thr) < speed_cap:
		apply_central_force(fwd * thr * mass * (14.0 if boost else 9.0))
	apply_torque(Vector3.UP * steer * mass * 3.0 - Vector3(0, angular_velocity.y, 0) * mass * 1.5)
	# lateral grip and upright stabilisation
	var right = b.x
	apply_central_force(-right * linear_velocity.dot(right) * mass * 2.0)
	var up_err = b.y.cross(Vector3.UP)
	apply_torque(up_err * mass * 20.0 - angular_velocity * Vector3(1, 0, 1) * mass * 4.0)
	if brk: apply_central_force(-linear_velocity * mass * 2.0)

func take_damage(dmg: float, _dir := Vector3.FORWARD) -> void:
	if dead: return
	hp -= dmg
	if hp <= 0:
		dead = true
		if driver: toggle_driver(driver)
		surface.explode(global_position, 8, 120)

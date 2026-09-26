class_name Player
extends CharacterBody3D
## The player on foot: third/first-person camera, real surface gravity,
## sprint and jump, and the weapons from the original game (magazines,
## reload, spread, pellets, beams), plus health, oxygen and trauma kits.

var surface: Node3D
var gravity = 9.81
var rig: Chars
var yaw = 0.0
var pitch = -0.15
var cam_dist = 4.2
var first_person = false
var pivot: Node3D
var spring: SpringArm3D
var cam: Camera3D
var lamp: SpotLight3D
var fire_cd = 0.0
var reload_t = 0.0
var mag = {}
var hurt_flash = 0.0
var sens = 0.0025
var o2 = 240.0
var invuln = 0.0

func _ready() -> void:
	var sh = CollisionShape3D.new()
	var cap = CapsuleShape3D.new(); cap.radius = 0.38; cap.height = 1.8
	sh.shape = cap; sh.position.y = 0.9
	add_child(sh)
	floor_snap_length = 0.5
	floor_max_angle = deg_to_rad(50)
	var P: Dictionary = GameState.s.player
	var look = {"body": P.get("body", "soldier"), "gun": true}
	if P.body == "michelle" and not surface.site.get("breathable", true) and not surface.interior:
		look = {"body": "xbot", "suit": Color("#cfd0cb"), "suit2": Color("#f2a33a"), "glow": Color("#f2a33a"), "gun": true}
	elif P.body == "xbot":
		look = {"body": "xbot", "suit": Color("#e6e9ee"), "suit2": Color("#f2a33a"), "glow": Color("#f2a33a"), "gun": true}
	rig = Chars.make(look)
	add_child(rig)
	pivot = Node3D.new(); pivot.position.y = 1.55
	add_child(pivot)
	spring = SpringArm3D.new()
	var sp = SphereShape3D.new(); sp.radius = 0.25
	spring.shape = sp; spring.spring_length = cam_dist; spring.margin = 0.2
	spring.add_excluded_object(get_rid())
	spring.collision_mask = 1
	pivot.add_child(spring)
	cam = Camera3D.new(); cam.fov = 72; cam.far = 20000; cam.near = 0.08
	cam.position = Vector3(0.95, 0.25, 0)
	spring.add_child(cam)
	cam.current = true
	lamp = SpotLight3D.new(); lamp.spot_range = 45; lamp.spot_angle = 30; lamp.light_energy = 0.0; lamp.shadow_enabled = false
	lamp.position = Vector3(0, 1.62, -0.15)
	add_child(lamp)
	o2 = max_o2()
	var w: String = P.get("weapon", "sidearm")
	mag[w] = int(DB.D.WEAPONS[w].mag)

func max_o2() -> float:
	return 240.0 + (int(GameState.s.player.attrs.END) - 5) * 25.0

func _unhandled_input(event: InputEvent) -> void:
	if Game.inst.ui.is_open(): return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		yaw -= event.relative.x * sens
		pitch = clampf(pitch - event.relative.y * sens, -1.35, 1.1)
	if event.is_action_pressed("toggle_view"):
		first_person = not first_person
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP: cam_dist = max(1.8, cam_dist - 0.4)
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN: cam_dist = min(9.0, cam_dist + 0.4)
	if event.is_action_pressed("reload"): start_reload()
	if event.is_action_pressed("heal"): use_medkit()
	for i in 6:
		if event is InputEventKey and event.pressed and event.physical_keycode == KEY_1 + i:
			var list = owned_weapons()
			if i < list.size(): equip(list[i])

func owned_weapons() -> Array:
	var out = []
	for w in DB.D.WEAPONS:
		if int(GameState.s.inv.get(w, 0)) > 0: out.append(w)
	return out

func equip(w: String) -> void:
	GameState.s.player.weapon = w
	if not mag.has(w): mag[w] = int(DB.D.WEAPONS[w].mag)
	Game.hud_toast(DB.D.WEAPONS[w].name)

func weapon() -> Dictionary:
	return DB.D.WEAPONS[GameState.s.player.weapon]

func start_reload() -> void:
	var W = weapon()
	var w: String = GameState.s.player.weapon
	if reload_t > 0 or int(mag.get(w, 0)) >= int(W.mag) or int(GameState.s.inv.get(W.ammo, 0)) <= 0: return
	reload_t = float(W.reload)

func use_medkit() -> void:
	var s = GameState.s
	if int(s.inv.get("medkit", 0)) <= 0:
		Game.hud_toast("No trauma kits."); return
	GameState.take("medkit")
	s.player.hp = minf(GameState.max_hp(), float(s.player.hp) + 45.0 + GameState.level_for(s.player.skills.medicine) * 0.5)
	Game.hud_toast("Trauma kit applied.")

func _physics_process(delta: float) -> void:
	var ui_open: bool = Game.inst.ui.is_open()
	if get_meta("in_vehicle", false):
		rig.visible = false
		pivot.rotation = Vector3(pitch, yaw, 0)
		spring.spring_length = lerpf(spring.spring_length, 9.0, clampf(4 * delta, 0, 1))
		_survival(delta)
		return
	# movement relative to the camera
	var input = Vector2.ZERO
	if not ui_open:
		input = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var sprint = Input.is_action_pressed("sprint") and not ui_open
	var agi = int(GameState.s.player.attrs.AGI)
	var speed = (6.4 if sprint else 3.6) * (1.0 + (agi - 5) * 0.03)
	var basis = Basis(Vector3.UP, yaw)
	var dir = (basis * Vector3(input.x, 0, input.y))
	if dir.length() > 1: dir = dir.normalized()
	var hv = Vector2(velocity.x, velocity.z)
	var target = Vector2(dir.x, dir.z) * speed
	var accel = 12.0 if is_on_floor() else 2.5
	hv = hv.lerp(target, clampf(accel * delta, 0, 1))
	velocity.x = hv.x; velocity.z = hv.y
	if not is_on_floor():
		velocity.y -= gravity * delta
	elif Input.is_action_just_pressed("jump") and not ui_open:
		velocity.y = sqrt(2.0 * gravity * 1.1)
	move_and_slide()
	if global_position.y < -80:
		global_position = surface.spawn_point()
		velocity = Vector3.ZERO
	# face the direction of travel, or the aim direction while aiming/firing
	var aiming = (Input.is_action_pressed("aim") or Input.is_action_pressed("fire")) and not ui_open
	if aiming or first_person:
		rig.rotation.y = lerp_angle(rig.rotation.y, yaw, clampf(14 * delta, 0, 1))
	elif hv.length() > 0.4:
		rig.rotation.y = lerp_angle(rig.rotation.y, atan2(-hv.x, -hv.y), clampf(10 * delta, 0, 1))
	rig.locomote(hv.length() if is_on_floor() else 5.5)
	# camera
	pivot.rotation = Vector3(pitch, yaw, 0)
	spring.spring_length = lerpf(spring.spring_length, 0.0 if first_person else (cam_dist * (0.6 if aiming else 1.0)), clampf(10 * delta, 0, 1))
	rig.visible = spring.spring_length > 0.8
	# weapons
	fire_cd -= delta
	if reload_t > 0:
		reload_t -= delta
		if reload_t <= 0: _finish_reload()
	var W = weapon()
	var trigger = Input.is_action_pressed("fire") if W.auto else Input.is_action_just_pressed("fire")
	if trigger and not ui_open and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and fire_cd <= 0 and reload_t <= 0:
		_fire(W)
	# survival
	_survival(delta)

func _finish_reload() -> void:
	var W = weapon()
	var w: String = GameState.s.player.weapon
	var need = int(W.mag) - int(mag.get(w, 0))
	var have = int(GameState.s.inv.get(W.ammo, 0))
	var n: int = min(need, have)
	mag[w] = int(mag.get(w, 0)) + n
	GameState.take(W.ammo, n)

func _fire(W: Dictionary) -> void:
	var w: String = GameState.s.player.weapon
	if int(mag.get(w, 0)) <= 0:
		start_reload(); return
	mag[w] = int(mag[w]) - 1
	fire_cd = 1.0 / float(W.rof)
	var space = get_world_3d().direct_space_state
	var origin = cam.global_position
	var fwd = -cam.global_transform.basis.z
	var pellets = int(W.get("pellets", 1))
	var combat_lv = GameState.level_for(GameState.s.player.skills.combat)
	var spread = float(W.spread) * (1.0 - combat_lv / 250.0)
	for p in pellets:
		var d = (fwd + Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * spread).normalized()
		var q = PhysicsRayQueryParameters3D.create(origin, origin + d * float(W.range))
		q.exclude = [get_rid()]
		q.collide_with_areas = true
		var hit = space.intersect_ray(q)
		var end = origin + d * float(W.range)
		if hit:
			end = hit.position
			var target = hit.collider
			while target and not target.has_method("take_damage") and target.get_parent():
				target = target.get_parent()
			if target and target.has_method("take_damage"):
				var head: bool = hit.position.y > target.global_position.y + 1.45
				target.take_damage(float(W.dmg) * (1.8 if head else 1.0) * (1.0 + combat_lv / 120.0), d)
				if not (target is VehicleBody3D): Game.inst.hud.hit_marker(); Sfx.play("hit", 0.6)
			elif hit.collider is RigidBody3D:
				hit.collider.apply_impulse(d * float(W.dmg) * 0.4, hit.position - hit.collider.global_position)
			surface.spark(end, Color(W.tracer))
		var muzzle: Vector3 = rig.gun.global_position if rig.gun and rig.visible else origin + fwd * 0.5
		surface.tracer(muzzle, end, Color(W.tracer), W.get("beam", false))
	surface.gunshot(global_position)
	var mz = rig.gun.global_position if rig.gun and rig.visible else origin + fwd * 0.5
	surface.muzzle_flash(mz + fwd * 0.3)
	pitch = minf(pitch + float(W.get("dmg", 20)) * 0.0009, 1.1)

func take_hit(dmg: float) -> void:
	if invuln > 0: return
	var s = GameState.s
	var armour = 1.0 - GameState.level_for(s.player.skills.combat) / 400.0
	s.player.hp = float(s.player.hp) - dmg * armour
	hurt_flash = 1.0
	if float(s.player.hp) <= 0:
		surface.player_died()

func _survival(delta: float) -> void:
	var s = GameState.s
	hurt_flash = max(0.0, hurt_flash - delta * 2)
	invuln = max(0.0, invuln - delta)
	Game.inst.hud.hurt(hurt_flash * 0.8 + maxf(0.0, 1.0 - float(s.player.hp) / GameState.max_hp() - 0.5) * 1.2)
	Game.inst.hud.set_crosshair(not get_meta("in_vehicle", false))
	if float(s.player.hp) < GameState.max_hp() and hurt_flash <= 0:
		s.player.hp = minf(GameState.max_hp(), float(s.player.hp) + delta * 0.6)
	if not surface.site.get("breathable", true) and not surface.interior:
		if surface.near_air(global_position):
			o2 = min(max_o2(), o2 + delta * 30)
		else:
			o2 -= delta
			if o2 <= 0:
				o2 = 0
				if int(s.inv.get("o2", 0)) > 0:
					GameState.take("o2"); o2 = 100; Game.hud_toast("O₂ canister connected.")
				else:
					take_hit(6 * delta)
	var dark: float = surface.darkness()
	lamp.light_energy = lerpf(lamp.light_energy, 6.0 * dark if dark > 0.35 else 0.0, clampf(3 * delta, 0, 1))
	lamp.global_rotation = Vector3(pitch * 0.5, rig.global_rotation.y, 0)

extends CharacterBody3D
## A hostile (or, for guards, potentially hostile) actor, driven by the
## original ENEMY_DEFS: hit points, speed, damage, range, rate of fire,
## melee or ranged, flying, loot, faction. Same AI as the browser game:
## idle wander near home, see the player (range + line of sight), close to a
## preferred range, strafe, shoot bolts that lead the target.

var type = ""
var def: Dictionary
var surface: Node3D
var tag = ""
var hp = 100.0
var max_hp = 100.0
var state = "idle"
var hostile = true
var boss = false
var phase = 0
var dead = false
var dead_t = 0.0
var fire_cd = 1.0
var home = Vector3.ZERO
var target = null
var wander_t = 0.0
var last_seen = null
var lost = 0.0
var strafe = 1.0
var height = 1.8
var rig: Chars
var look: Looks
var _yaw = 0.0
var _los_t = 0.0
var _can_see = false

func _ready() -> void:
	hostile = type != "guard"
	var lv = GameState.level_for(GameState.s.player.skills.combat)
	max_hp = float(def.hp)
	hp = max_hp * (1.0 + lv / 150.0)
	fire_cd = 1.0 + randf()
	home = global_position if is_inside_tree() else Vector3.ZERO
	var L: String = def.look
	var radius = 0.45 if L == "human" else (1.1 if def.get("role", "") == "tabib" else (0.5 if L == "chars" else 0.9))
	height = 1.8 if L == "human" else (4.1 if def.get("role", "") == "tabib" else (1.9 if L == "chars" else (2.6 if L == "sentinel" else (2.9 if L == "construct" else 1.2))))
	var cs = CollisionShape3D.new()
	var cap = CapsuleShape3D.new(); cap.radius = radius; cap.height = max(height, radius * 2.0 + 0.01)
	cs.shape = cap; cs.position.y = height / 2.0
	add_child(cs)
	collision_layer = 4
	collision_mask = 1
	if L == "human":
		var role = "guard" if type == "guard" else "raider"
		var o = Chars.for_role(role, (surface.site.get("faction", "concord") if type == "guard" else "syndicate"))
		if not surface.site.get("breathable", true) and type != "guard":
			o = Chars.for_role("suit")
		o.gun = true
		rig = Chars.make(o)
		add_child(rig)
	elif L == "chars":
		var o = Chars.for_role(def.role, "none")
		o.gun = def.has("gun") or def.role == "tabib"
		rig = Chars.make(o)
		add_child(rig)
	else:
		look = Looks.creature(L)
		add_child(look)
	_yaw = randf() * TAU

func _enter_tree() -> void:
	pass

func take_damage(dmg: float, dir := Vector3.FORWARD) -> void:
	if dead: return
	hp -= dmg
	state = "combat"
	last_seen = surface.player.global_position
	if type == "guard" and not hostile:
		hostile = true
		surface.crime(2)
	if hp <= 0:
		_die(dir)

func _die(dir: Vector3) -> void:
	dead = true
	dead_t = 0.0
	var s = GameState.s
	s.stats.kills = int(s.stats.kills) + 1
	GameState.add_xp("combat", float(def.xp))
	if def.faction == "syndicate": GameState.add_rep("syndicate", -1)
	if def.faction == "concord": GameState.add_rep("concord", -3)
	Story.event("kill", {"tag": tag, "type": type})
	if type == "tabib":
		Polity.tabib_end("ama")
	if def.look in ["sentinel", "construct", "rogueDrone", "secdrone"]:
		surface.explode_fx(global_position + Vector3.UP, 0.6)
		Sfx.play("explode", 0.6)
	var loot = {}
	for k in def.loot:
		var lo = int(def.loot[k][0]); var hi = int(def.loot[k][1])
		var n = lo + randi() % (hi - lo + 1)
		if n > 0: loot[k] = n
	collision_layer = 0
	if not loot.is_empty():
		var body = self
		var it: Dictionary = surface.add_interact(global_position, 2.4, "Search body", 0, func(): return true, null)
		it.fn = func():
			for k in loot:
				if k == "credits": GameState.add_credits(int(loot[k]))
				else: GameState.give(k, int(loot[k]))
			var names = []
			for k in loot: names.append("%d %s" % [loot[k], "credits" if k == "credits" else str(DB.D.ITEMS.get(k, {"name": k}).name)])
			Game.hud_toast("Found: " + ", ".join(names))
			Sfx.play("pickup")
			surface.interacts.erase(it)
			Story.event("inv")
			return true
	if boss:
		surface.boss = null
		Game.inst.hud.boss_bar("", -1)

func _physics_process(delta: float) -> void:
	if surface == null or not is_instance_valid(surface.player): return
	var P: Player = surface.player
	var pp: Vector3 = P.global_position
	if P.get_meta("in_vehicle", false) and P.get_meta("vehicle", null): pp = P.get_meta("vehicle").global_position
	var dist = global_position.distance_to(pp)
	if dead:
		dead_t += delta
		var k = minf(1.0, dead_t * 2.5)
		if def.get("fly", false):
			global_position.y = maxf(surface.h(global_position.x, global_position.z), global_position.y - delta * 12)
			if look: look.rotation.x = -k * 1.2
		else:
			(rig if rig else look).rotation.x = -k * 1.45
		if rig: rig.locomote(0)
		if dead_t > 120: queue_free()
		return
	if dist > 260:
		visible = false
		return
	visible = true
	fire_cd -= delta
	# line of sight, a few times a second
	_los_t -= delta
	if _los_t <= 0:
		_los_t = 0.2
		_can_see = hostile and dist < (120.0 if state == "combat" else 55.0) and (dist < 14 or _los(pp))
	if _can_see:
		state = "combat"; last_seen = pp; lost = 0
	elif state == "combat":
		lost += delta
		if lost > 12: state = "idle"
	var move_to = null
	var speed = 0.0
	var aim = false
	if state == "combat" and last_seen != null:
		var pref: float = 0.5 if def.get("melee", false) else minf(float(def.range) * 0.55, 18.0)
		var to_p: Vector3 = (last_seen - global_position); to_p.y = 0
		var dd = to_p.length()
		if dd > pref + 3: move_to = last_seen
		elif dd < pref - 4 and not def.get("melee", false): move_to = global_position - to_p.normalized() * 6
		else:
			if randf() < delta * 0.5: strafe *= -1
			var side = Vector3(-to_p.z, 0, to_p.x).normalized()
			move_to = global_position + side * strafe * 4
		speed = float(def.speed)
		_yaw = atan2(pp.x - global_position.x, pp.z - global_position.z)
		aim = true
		if _can_see and fire_cd <= 0 and dd < float(def.range):
			fire_cd = 1.0 / float(def.rof) * (0.7 + randf() * 0.6)
			if def.get("melee", false):
				if dist < float(def.range) + 0.5: P.take_hit(float(def.dmg))
			else:
				_shoot(pp, P)
	elif type != "guard":
		wander_t -= delta
		if target == null or wander_t < 0:
			target = home + Vector3((randf() - 0.5) * 30, 0, (randf() - 0.5) * 30); wander_t = 5 + randf() * 8
		move_to = target; speed = 1.2
	var hv = Vector2(velocity.x, velocity.z)
	if move_to != null:
		var to: Vector3 = move_to - global_position; to.y = 0
		if to.length() > 0.5:
			to = to.normalized()
			hv = hv.lerp(Vector2(to.x, to.z) * speed, clampf(6 * delta, 0, 1))
			if not aim: _yaw = atan2(to.x, to.z)
		else: hv *= 0.8
	else: hv *= 0.8
	velocity.x = hv.x; velocity.z = hv.y
	if def.get("fly", false):
		var gy: float = surface.h(global_position.x, global_position.z)
		var want = gy + (2.2 if def.look == "stinger" else 3.5) + sin(Time.get_ticks_msec() / 500.0 + home.x) * 0.4
		velocity.y = (want - global_position.y) * 3.0
	else:
		if is_on_floor(): velocity.y = -0.5
		else: velocity.y -= P.gravity * delta
	move_and_slide()
	if Vector2(global_position.x, global_position.z).length() > 600:
		global_position.x *= 0.99; global_position.z *= 0.99
	var node: Node3D = rig if rig else look
	node.rotation.y = lerp_angle(node.rotation.y, _yaw, clampf(10 * delta, 0, 1))
	var hs = hv.length()
	if rig: rig.locomote(hs)
	elif look: look.pose(delta, hs)

func _los(pp: Vector3) -> bool:
	var q = PhysicsRayQueryParameters3D.create(global_position + Vector3(0, height * 0.8, 0), pp + Vector3(0, 1.4, 0))
	q.exclude = [get_rid(), surface.player.get_rid()]
	q.collision_mask = 1
	return get_world_3d().direct_space_state.intersect_ray(q).is_empty()

func _shoot(pp: Vector3, P: Player) -> void:
	var from = global_position + Vector3(0, height * 0.75, 0)
	var to = pp + Vector3(0, 1.2, 0)
	to += P.velocity * (from.distance_to(to) / 70.0 * 0.6)
	var acc = (0.05 + from.distance_to(to) * 0.0025) * (1.0 + Vector2(P.velocity.x, P.velocity.z).length() * 0.05)
	var d = ((to - from).normalized() + Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * acc).normalized()
	var col = Color("#f2a33a") if def.look in ["construct", "sentinel"] else (Color("#6fa8ff") if def.faction == "concord" else Color("#ff5a4e"))
	var sys = Cosmos.get_system(surface.site.get("system", "sol"))
	var sec: float = float(sys.get("security", 0.0)) if sys else 0.0
	surface.fire_bolt(from, d * 70.0, col, float(def.dmg) * (1.0 + sec * 0.2), self)
	Sfx.play("laser" if def.look in ["sentinel", "construct"] else "enemyshot", maxf(0.15, 1.0 - global_position.distance_to(pp) / 80.0))

## The Tabib's phases: at 66% and 33% it calls orderlies and, unless your
## chart is good (Polity.treated), triages itself back up by 15%.
func boss_tick(_delta: float) -> void:
	if dead: return
	var frac = hp / (max_hp * (1.0 + GameState.level_for(GameState.s.player.skills.combat) / 150.0))
	Game.inst.hud.boss_bar("The Tabib · physician of worlds", frac)
	var th = [0.66, 0.33]
	if phase < 2 and frac < th[phase]:
		phase += 1
		for i in 3 + phase:
			var a = randf() * TAU
			surface.spawn_enemy("orderly", global_position.x + cos(a) * 16, global_position.z + sin(a) * 16)
		if not Polity.treated():
			hp += max_hp * 0.15
			Game.hud_toast("The Tabib triages: \"Your chart is poor. I have time; you do not.\" It heals. (Lower your risk meters to stop this.)")
		else:
			Game.hud_toast("The Tabib reaches for its triage and finds nothing to cut. Your chart is too good.")

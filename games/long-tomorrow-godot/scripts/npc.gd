extends CharacterBody3D
## A person (or alien) you can talk to. Named NPCs stand at their post and
## turn to face you; citizens wander the settlement and flee from gunfire.

var o: Dictionary = {}
var surface: Node3D
var stationary = true
var hp = 80.0
var flee = 0.0
var target = null
var wander_t = 0.0
var rig: Chars
var look: Looks
var dead = false
var dead_t = 0.0
var hostile = false

func _ready() -> void:
	var cs = CollisionShape3D.new()
	var cap = CapsuleShape3D.new(); cap.radius = 0.4; cap.height = 1.8
	cs.shape = cap; cs.position.y = 0.9
	add_child(cs)
	collision_layer = 4
	collision_mask = 1
	var site: Dictionary = surface.site
	var alien: String = o.get("alien", "")
	var id: String = o.get("id", "")
	match alien:
		"thalassi":
			look = Looks.thalassi(Color("#9fe8ff") if id == "deepchoir" else (Color("#ffcf7e") if id == "seven" else Color("#5fe0ff")), 1.4 if id == "deepchoir" else 1.0)
		"kepleri":
			rig = Chars.make({"body": "soldier", "tint": Color("#b8a080"), "scale": 0.92})
			rig.scale = Vector3(1.35, 1.0, 1.35)
		"engineer", "tabib", "android":
			rig = Chars.make(Chars.for_role(alien))
		"machine":
			look = Looks.creature("sentinel"); look.scale = Vector3.ONE * 1.6
		_:
			var crew_id: String = o.get("crew", o.get("crewTalk", ""))
			var cl: Dictionary = DB.D.CREW.get(crew_id, {})
			var rr = Cosmos.Rng.new(Cosmos.hash(str(o.get("name", "x"))))
			var lk: Dictionary
			if cl.has("body"):
				lk = {"body": cl.body, "tint": Color(cl.get("tint", "#ffffff"))}
			else:
				lk = Chars.for_role("civ", site.get("faction", ""), rr)
			if not site.get("breathable", true) and not surface.interior:
				lk = Chars.for_role("suit", "", rr)
			rig = Chars.make(lk)
	if rig: add_child(rig)
	if look: add_child(look)
	if stationary:
		(rig if rig else look).rotation.y = atan2(-position.x, -position.z) + (PI if rig else 0.0)

func talk() -> void:
	if dead: return
	var ui = Game.inst.ui
	if o.has("crewTalk"):
		ui.dialogue_data(DlgLive.crew_dialogue(o.crewTalk), "crew_" + str(o.crewTalk), self)
	elif o.get("dlg", "") != "" and DB.D.DLG.has(o.dlg):
		ui.dialogue(o.dlg, self)
	elif o.get("citizen", false):
		var lines = ["Busy. Sorry.", "Mind the dust.", "You're off that Concord ship, aren't you?", "Nice day for it.", "Don't block the walkway."]
		Game.hud_toast("%s: \"%s\"" % [o.name, lines.pick_random()])

func take_damage(dmg: float, dir := Vector3.FORWARD) -> void:
	if dead: return
	hp -= dmg
	flee = 10.0
	surface.crime(3.0 if o.get("id", "") != "" else 1.2)
	if o.get("id", "") != "" and hp <= 0:
		hp = 1; flee = 15
		Game.hud_toast("%s is wounded and flees." % o.name)
		return
	if hp <= 0:
		dead = true
		surface.crime(4)
		GameState.add_rep(str(surface.site.get("faction", "")), -5)
		collision_layer = 0

func _physics_process(delta: float) -> void:
	if surface == null or not is_instance_valid(surface.player): return
	var node: Node3D = rig if rig else look
	if dead:
		dead_t += delta
		node.rotation.x = -minf(1.0, dead_t * 2.5) * 1.45
		if rig: rig.locomote(0)
		if dead_t > 30: queue_free()
		return
	var pp: Vector3 = surface.player.global_position
	var dist = global_position.distance_to(pp)
	if dist > 260:
		visible = false; return
	visible = true
	var move_to = null
	var speed = 0.0
	if flee > 0:
		flee -= delta
		var away = (global_position - pp); away.y = 0
		move_to = global_position + away.normalized() * 10; speed = 5.5
	elif stationary:
		if dist < 6:
			node.rotation.y = lerp_angle(node.rotation.y, atan2(pp.x - global_position.x, pp.z - global_position.z) + (PI if rig else 0.0), clampf(6 * delta, 0, 1))
	else:
		wander_t -= delta
		if target == null or wander_t < 0 or global_position.distance_to(target) < 1.5:
			var rad = float(get_meta("home_r", 220.0 if surface.site.get("style", "") == "city" else 70.0))
			var a = randf() * TAU; var d = 10 + randf() * rad
			target = Vector3(cos(a) * d, global_position.y, sin(a) * d); wander_t = 8 + randf() * 14
		move_to = target; speed = 1.3
	var hv = Vector2(velocity.x, velocity.z)
	if move_to != null:
		var to: Vector3 = move_to - global_position; to.y = 0
		if to.length() > 0.5:
			to = to.normalized()
			hv = hv.lerp(Vector2(to.x, to.z) * speed, clampf(6 * delta, 0, 1))
			node.rotation.y = lerp_angle(node.rotation.y, atan2(to.x, to.z) + (PI if rig else 0.0), clampf(8 * delta, 0, 1))
		else: hv *= 0.8
	else: hv *= 0.8
	velocity.x = hv.x; velocity.z = hv.y
	if is_on_floor(): velocity.y = -0.5
	else: velocity.y -= surface.player.gravity * delta
	move_and_slide()
	if global_position.y < -50 and not surface.interior:
		global_position.y = surface.h(global_position.x, global_position.z) + 0.5
	var talking: bool = Game.inst.ui.talking == self
	if rig:
		rig.talking = talking
		if dist < 90 or talking: rig.locomote(hv.length())
	elif look:
		look.pose(delta, hv.length(), talking)

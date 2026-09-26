class_name Chars
extends Node3D
## A rigged character: Mixamo body, tint, animation blending, and a weapon in hand.
## Bodies: "soldier" (armoured), "michelle" (civilian), "xbot" (synthetic / EVA suit).
## The civilian body borrows the soldier's idle/walk/run: both rigs share the
## same skeleton path and bone names, so the clips play unchanged.

const BODIES := {
	"soldier": {"path": "res://assets/models/soldier.glb", "idle": "Idle", "walk": "Walk", "run": "Run", "facing": 0.0},
	"michelle": {"path": "res://assets/models/michelle.glb", "idle": "sold/Idle", "walk": "sold/Walk", "run": "sold/Run", "dance": "SambaDance", "facing": PI},
	"xbot": {"path": "res://assets/models/xbot.glb", "idle": "idle", "walk": "walk", "run": "run", "agree": "agree", "shake": "headShake", "facing": PI},
}
static var _scenes = {}
static var _soldier_lib: AnimationLibrary

var body = "soldier"
var model: Node3D
var anim: AnimationPlayer
var skeleton: Skeleton3D
var gun: Node3D
var _cur = ""
var talking = false

static func _scene(b: String) -> PackedScene:
	if not _scenes.has(b):
		_scenes[b] = load(BODIES[b].path)
	return _scenes[b]

static func _soldier_anims() -> AnimationLibrary:
	if _soldier_lib == null:
		var s: Node = _scene("soldier").instantiate()
		var ap: AnimationPlayer = s.find_child("AnimationPlayer", true, false)
		_soldier_lib = AnimationLibrary.new()
		for n in ["Idle", "Walk", "Run"]:
			var a: Animation = ap.get_animation(n).duplicate(true)
			# keep the clips in place: drop root translation drift
			for t in range(a.get_track_count() - 1, -1, -1):
				if a.track_get_type(t) == Animation.TYPE_POSITION_3D and not str(a.track_get_path(t)).ends_with("Hips"):
					a.remove_track(t)
			a.loop_mode = Animation.LOOP_LINEAR
			_soldier_lib.add_animation(n, a)
		s.free()
	return _soldier_lib

## opts: body, tint (Color), suit (Color, synthetic body), glow (Color), scale, gun (bool)
static func make(opts: Dictionary) -> Chars:
	var c = Chars.new()
	c.body = opts.get("body", "soldier")
	if not BODIES.has(c.body): c.body = "soldier"
	c.model = _scene(c.body).instantiate()
	c.model.rotation.y = BODIES[c.body].facing
	var sc: float = opts.get("scale", 1.0)
	c.model.scale = Vector3.ONE * sc
	c.add_child(c.model)
	c.anim = c.model.find_child("AnimationPlayer", true, false)
	c.skeleton = c.model.find_child("Skeleton3D", true, false)
	if c.body == "michelle":
		c.anim.add_animation_library("sold", _soldier_anims())
	for n in c.anim.get_animation_list():
		var a = c.anim.get_animation(n)
		if not n.contains("pose") and not n.contains("TPose"):
			a.loop_mode = Animation.LOOP_LINEAR
	c._paint(opts)
	if opts.get("gun", false):
		c._attach_gun()
	c.play("idle")
	c.anim.seek(randf() * 1.5, true)
	return c

func _paint(opts: Dictionary) -> void:
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		var m: MeshInstance3D = mi
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		for i in m.get_surface_override_material_count():
			var base = m.get_active_material(i)
			if base == null: continue
			var mat: StandardMaterial3D = base.duplicate() if base is StandardMaterial3D else StandardMaterial3D.new()
			if body == "xbot" and opts.has("suit"):
				var joints = m.name.contains("Joints")
				mat.albedo_texture = null
				mat.albedo_color = opts.get("suit2", Color(0.12, 0.13, 0.16)) if joints else opts.suit
				mat.metallic = 0.6 if joints else 0.15
				mat.roughness = 0.5 if joints else 0.4
				if opts.has("glow"):
					mat.emission_enabled = true
					mat.emission = opts.glow
					mat.emission_energy_multiplier = 1.6 if joints else 0.05
			elif opts.has("tint"):
				mat.albedo_color = opts.tint
			m.set_surface_override_material(i, mat)

func _attach_gun() -> void:
	if skeleton == null: return
	var att = BoneAttachment3D.new()
	att.bone_name = "mixamorig_RightHand"
	skeleton.add_child(att)
	gun = Node3D.new()
	var bl = load("res://assets/kenney/fps/blaster.glb").instantiate()
	bl.scale = Vector3.ONE * 0.3
	bl.rotation.y = PI
	gun.add_child(bl)
	att.add_child(gun)

func _ready() -> void:
	# bone space carries the rig's import scale; cancel it so the weapon is life-size
	if gun:
		var sc: Vector3 = gun.get_parent().global_transform.basis.get_scale()
		var k = Vector3(1.0 / max(sc.x, 1e-4), 1.0 / max(sc.y, 1e-4), 1.0 / max(sc.z, 1e-4))
		gun.scale = k
		gun.position = Vector3(0.0, 0.09, 0.04) * k

## Looks by role, as in the original game (faction colours, synthetic bodies).
static func for_role(role: String, faction := "", rr = null) -> Dictionary:
	var rnd = func() -> float: return rr.next() if rr else randf()
	var pick = func(a: Array): return a[int(rnd.call() * a.size()) % a.size()]
	var fcol: Dictionary = {"concord": "#b8c4d8", "frontier": "#9aa58a", "syndicate": "#8a6a5a", "oracle": "#d8d0f0", "none": "#c8c0b0"}
	match role:
		"guard", "marine": return {"body": "soldier", "tint": Color(fcol.get(faction, "#b8c4d8"))}
		"raider": return {"body": "soldier", "tint": Color(pick.call(["#6a5a4a", "#5a4a44", "#4a4a44", "#7a6a5a"]))}
		"android": return {"body": "xbot", "suit": Color("#eef0f6"), "suit2": Color("#2a2438"), "glow": Color("#a38cff")}
		"engineer": return {"body": "xbot", "suit": Color("#f4efe6"), "suit2": Color("#b88a3a"), "glow": Color("#f2a33a"), "scale": 1.62}
		"tabib": return {"body": "xbot", "suit": Color("#f4f6f8"), "suit2": Color("#9fe8f4"), "glow": Color("#8fe8ff"), "scale": 2.3}
		"orderly": return {"body": "xbot", "suit": Color("#cfd5da"), "suit2": Color("#4a5a64"), "glow": Color("#bfe8f0"), "scale": 1.05}
		"suit": return {"body": "xbot", "suit": Color(pick.call(["#e6e9ee", "#d8dce2", "#e8d8c0", "#c8d4e0"])), "suit2": Color(pick.call(["#f2a33a", "#3a4658", "#8a2a2a", "#2a5a8a"]))}
	if rnd.call() < 0.5:
		return {"body": "michelle", "tint": Color(pick.call(["#ffffff", "#e8e0ff", "#fff0e0", "#e0f0ff"]))}
	return {"body": "soldier", "tint": Color(pick.call(["#c8c0b0", "#b0b8c8", "#a8b0a0", "#c0b0a0", "#9aa0a8"]))}

func has_anim(key: String) -> bool:
	return BODIES[body].has(key)

func play(key: String, blend := 0.25, speed := 1.0) -> void:
	var name: String = BODIES[body].get(key, BODIES[body].idle)
	if name == _cur:
		anim.speed_scale = speed
		return
	_cur = name
	if anim.has_animation(name):
		anim.play(name, blend)
		anim.speed_scale = speed

## Pick idle / walk / run from ground speed (m/s).
func locomote(speed: float) -> void:
	if talking and has_anim("agree") and speed < 0.2:
		play("agree"); return
	if speed < 0.3: play("idle")
	elif speed < 3.4: play("walk", 0.25, clampf(speed / 1.5, 0.6, 1.8))
	else: play("run", 0.25, clampf(speed / 5.0, 0.7, 1.5))

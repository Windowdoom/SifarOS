class_name Game
extends Node3D
## The Long Tomorrow: game root.
## Owns input, the HUD, the UI layer and the current place (a planet surface
## or a star system in space), and moves the player between them.

static var inst: Game

const SurfaceScript = preload("res://scripts/surface.gd")
const SpaceScript = preload("res://scripts/space.gd")
const HudScript = preload("res://scripts/hud.gd")
const UIScript = preload("res://scripts/ui.gd")

var hud: CanvasLayer
var ui: CanvasLayer
var place: Node3D
var mode = "title"   # title | surface | space
var paused = false
var _autosave_t = 0.0
var _test = {}
var _test_t = 0.0

func _ready() -> void:
	inst = self
	DB.ensure()
	_setup_input()
	add_child(Sfx.new())
	hud = HudScript.new()
	add_child(hud)
	ui = UIScript.new()
	add_child(ui)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--"):
			var kv = a.substr(2).split("=", true, 1)
			_test[kv[0]] = kv[1] if kv.size() > 1 else "1"
	if _test.has("site") or _test.has("space"):
		new_game({"name": "Test Pilot", "origin": "pilot", "body": _test.get("body", "soldier"), "mode": _test.get("mode", "captain")}, false)
		if _test.has("site"):
			go_surface(_test.site)
		else:
			go_space(_test.space, _test.get("near", ""))
		if _test.has("weather"):
			await get_tree().process_frame
			if place and place.has_method("set_weather"): place.set_weather(_test.weather)
		return
	ui.show_title()
	_title_backdrop()

static func hud_toast(t: String) -> void:
	if inst and inst.hud:
		inst.hud.toast(t)

func S() -> Dictionary:
	return GameState.s

func _setup_input() -> void:
	var keys = {
		"move_forward": [KEY_W], "move_back": [KEY_S], "move_left": [KEY_A], "move_right": [KEY_D],
		"jump": [KEY_SPACE], "sprint": [KEY_SHIFT], "interact": [KEY_E], "land": [KEY_L],
		"roll_left": [KEY_Q], "roll_right": [KEY_E], "up": [KEY_R], "down": [KEY_F], "reload": [KEY_R],
		"vehicle": [KEY_F], "toggle_view": [KEY_V], "pause": [KEY_ESCAPE], "journal": [KEY_J],
		"map": [KEY_M], "command": [KEY_K], "board": [KEY_B], "heal": [KEY_H], "cruise": [KEY_C], "target": [KEY_T],
	}
	for action in keys:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for k in keys[action]:
			var ev = InputEventKey.new()
			ev.physical_keycode = k
			InputMap.action_add_event(action, ev)
	for pair in [["fire", MOUSE_BUTTON_LEFT], ["aim", MOUSE_BUTTON_RIGHT]]:
		if not InputMap.has_action(pair[0]):
			InputMap.add_action(pair[0])
			var mb = InputEventMouseButton.new()
			mb.button_index = pair[1]
			InputMap.action_add_event(pair[0], mb)

# ── flow ─────────────────────────────────────────────────────────────
func _title_backdrop() -> void:
	_clear_place()
	var sp = SpaceScript.new()
	sp.backdrop = true
	sp.system_id = "sol"
	place = sp
	add_child(sp)

func new_game(p: Dictionary, intro := true) -> void:
	GameState.new_game(p)
	Story.start("mq")
	if S().mode == "statesman":
		Polity.init_state()
		S().pol.office = "chancellor"; S().pol.capital = 55.0; S().pol.approval = 54.0
		S().rep.concord = int(S().rep.concord) + 30
	else:
		Polity.init_state()
	go_surface("earth")
	if intro:
		play_cut("intro")

func continue_game() -> void:
	if not GameState.load_slot("auto"):
		hud_toast("No save found.")
		return
	Polity.init_state()
	var loc: Dictionary = S().loc
	if loc.get("site", "") != "" and not loc.get("inSpace", false):
		go_surface(loc.site)
	else:
		go_space(loc.system, "")

func _clear_place() -> void:
	if place:
		place.queue_free()
		place = null

func go_surface_bridge() -> void:
	_clear_place()
	var surf = SurfaceScript.new()
	surf.site_id = "__bridge"
	place = surf
	add_child(surf)
	mode = "surface"
	hud.set_location(surf.site_name())

func go_surface(id: String) -> void:
	if Cosmos.site(id).is_empty():
		push_error("unknown site " + id)
		return
	_clear_place()
	var s = S()
	s.loc.site = id
	s.loc.system = Cosmos.site(id).get("system", s.loc.system)
	s.loc.inSpace = false
	var surf = SurfaceScript.new()
	surf.site_id = id
	place = surf
	add_child(surf)
	mode = "surface"
	hud.set_location(surf.site_name())
	Story.event("land", {"site": id, "system": s.loc.system})
	autosave()

func go_space(sys_id: String, near := "") -> void:
	_clear_place()
	var s = S()
	s.loc.system = sys_id
	s.loc.inSpace = true
	s.visited[sys_id] = 1
	var sp = SpaceScript.new()
	sp.system_id = sys_id
	sp.start_near = near
	place = sp
	add_child(sp)
	mode = "space"
	hud.set_location(DB.system(sys_id).get("name", sys_id))
	Story.event("system", {"system": sys_id})
	autosave()

func take_off() -> void:
	var from: String = S().loc.site
	go_space(S().loc.system, from)
	Story.event("takeoff", {})

## Interstellar travel: warp or fusion torch, with the Earth calendar moving on.
func jump_to(sys_id: String, via_gate := false) -> void:
	var s = S()
	var here: String = s.loc.system
	var years = 0.0
	var ship_years = 0.0
	if not via_gate:
		var d = Cosmos.dist(here, sys_id)
		if is_inf(d):
			hud_toast("Another galaxy. Only an Engineer gate can take you there.")
			return
		var warp = s.ship.drive != "torch"
		var speed = 0.12 if not warp else (12.0 if s.ship.drive == "warp1" else 60.0)
		if not warp:
			# fusion torch: 0.12 c cruise, real time dilation
			var gamma = 1.0 / sqrt(1.0 - 0.12 * 0.12)
			years = d / 0.12
			ship_years = years / gamma
		else:
			years = d / speed / 365.0 * 30.0
			ship_years = years
		s.stats.jumps = int(s.stats.jumps) + 1
	advance_world(years, ship_years)
	go_space(sys_id, "")
	if years > 0.05:
		hud_toast("Arrived. %.1f years passed on Earth; %.2f aboard." % [years, ship_years])

func advance_world(years: float, ship_years := -1.0) -> void:
	var s = S()
	if years <= 0.0:
		return
	s.earthYear = float(s.earthYear) + years
	s.shipYears = float(s.shipYears) + (years if ship_years < 0.0 else ship_years)
	var w: Dictionary = s.world
	w.pop = float(w.pop) * pow(1.012, years)
	Polity.sim(years)

func autosave() -> void:
	if mode != "title" and not S().is_empty():
		GameState.save("auto")

func _process(delta: float) -> void:
	if mode != "title" and not S().is_empty() and not paused:
		S().earthYear = float(S().earthYear) + delta / (365.0 * 24.0 * 60.0)
		_autosave_t += delta
		if _autosave_t > 60.0:
			_autosave_t = 0.0
			autosave()
	if _test.has("shot"):
		_test_t += delta
		if _test_t > float(_test.get("wait", "6")):
			_test.erase("wait")
			var img = get_viewport().get_texture().get_image()
			img.save_png(_test.shot)
			print("SHOT ", _test.shot)
			_test.erase("shot")
			get_tree().quit()

func _unhandled_input(event: InputEvent) -> void:
	if mode == "title":
		return
	if event.is_action_pressed("pause"):
		if ui.is_open():
			ui.close_all()
		else:
			ui.show_pause()
		return
	if ui.is_open():
		return
	if event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	if event.is_action_pressed("journal"):
		ui.show_journal()
	elif event.is_action_pressed("map"):
		ui.show_starmap()
	elif event.is_action_pressed("command"):
		ui.show_command()

# ── hooks used by the story engine ──────────────────────────────────────
func npc_hostile() -> void:
	if place and place.has_method("npc_hostile"):
		place.npc_hostile()

func show_ending(key: String) -> void:
	S().flags["ended"] = key
	S().flags["deepgates"] = 1
	Story.set_stage("mq", 250)
	ui.show_ending(key)

func play_cut(id: String) -> void:
	var shots: Array = DB.D.CUTS.get(id, [])
	if shots.is_empty():
		return
	ui.show_cutscene(shots)

func open_shop(kind: String) -> void:
	ui.show_shop(kind)

func start_tabib_fight() -> void:
	if place and place.has_method("start_tabib_fight"):
		place.start_tabib_fight()

func on_quest_changed(_q: String, _st: int) -> void:
	if place and place.has_method("refresh_markers"):
		place.refresh_markers()

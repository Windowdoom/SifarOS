class_name GameState
## The saved game: player, ship, inventory, flags, quests, reputation, world,
## calendar. Mirrors the original game's state so story data works unchanged.

static var s: Dictionary = {}

static func new_game(p: Dictionary) -> void:
	DB.ensure()
	var O: Dictionary = DB.D.ORIGINS[p.origin]
	var attrs: Dictionary = p.get("attrs", {"STR": 5, "PER": 5, "END": 5, "CHA": 5, "INT": 5, "AGI": 5}).duplicate()
	attrs[O.attr] = int(attrs.get(O.attr, 5)) + 1
	var skills = {}
	for k in DB.D.SKILLS:
		skills[k] = xp_for(max(1, int(O.skills.get(k, 1))))
	s = {
		"player": {"name": p.name, "origin": p.origin, "attrs": attrs, "skills": skills, "hp": 100.0, "o2": 240.0, "body": p.get("body", "soldier"), "weapon": "sidearm"},
		"credits": 3000, "inv": {"sidearm": 1, "slugs": 60, "medkit": 2, "o2": 2},
		"ship": {"name": p.get("ship", "Long Tomorrow"), "hull": "kestrel", "drive": "torch", "hp": 950.0, "fuel": 80.0},
		"crew": [], "loyalty": {}, "flags": {}, "quests": {}, "track": "mq",
		"rep": {"concord": 0, "frontier": 0, "oracle": 0, "syndicate": -10, "thalassi": 0, "kepleri": 0, "engineers": 0},
		"earthYear": float(DB.D.START_YEAR), "shipYears": 0.0, "loc": {"system": "sol", "site": "earth"},
		"visited": {"sol": 1}, "news": [], "world": {"oracle": 0.25, "frontier": 0.3, "pop": 1.0},
		"stats": {"kills": 0, "jumps": 0}, "mode": p.get("mode", "captain"),
	}
	for k in O.gear:
		s.inv[k] = int(s.inv.get(k, 0)) + int(O.gear[k])
	for k in O.rep:
		s.rep[k] = int(s.rep[k]) + int(O.rep[k])
	s.player.hp = max_hp()
	if s.mode == "sandbox":
		s.credits = 300000
		s.ship.drive = "warp1"
		s.flags["warp"] = 1

static func xp_for(level: int) -> int:
	var pts = 0.0
	for l in range(1, level):
		pts += floor(l + 300.0 * pow(2.0, l / 7.0))
	return int(floor(pts / 4.0))

static func level_for(xp: float) -> int:
	var lv = 1
	while lv < 99 and xp >= xp_for(lv + 1):
		lv += 1
	return lv

static func max_hp() -> float:
	var P: Dictionary = s.player
	return 100.0 + (int(P.attrs.END) - 5) * 12.0 + level_for(P.skills.combat) * 1.2

static func add_xp(skill: String, n: float) -> void:
	if not s.player.skills.has(skill):
		return
	var before = level_for(s.player.skills[skill])
	s.player.skills[skill] = float(s.player.skills[skill]) + n
	var after = level_for(s.player.skills[skill])
	if after > before:
		Game.hud_toast("%s level %d" % [DB.D.SKILLS[skill].name, after])

static func add_credits(n: int) -> void:
	s.credits = max(0, int(s.credits) + n)

static func give(item: String, n: int = 1) -> void:
	s.inv[item] = int(s.inv.get(item, 0)) + n

static func take(item: String, n: int = 1) -> void:
	s.inv[item] = max(0, int(s.inv.get(item, 0)) - n)

static func add_rep(f: String, n: int) -> void:
	if s.rep.has(f):
		s.rep[f] = clampi(int(s.rep[f]) + n, -100, 100)

static func save(slot := "auto") -> bool:
	var f = FileAccess.open("user://save_%s.json" % slot, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(s))
	return true

static func load_slot(slot := "auto") -> bool:
	if not FileAccess.file_exists("user://save_%s.json" % slot):
		return false
	var f = FileAccess.open("user://save_%s.json" % slot, FileAccess.READ)
	var d = JSON.parse_string(f.get_as_text())
	if typeof(d) != TYPE_DICTIONARY:
		return false
	s = d
	return true

static func has_save(slot := "auto") -> bool:
	return FileAccess.file_exists("user://save_%s.json" % slot)

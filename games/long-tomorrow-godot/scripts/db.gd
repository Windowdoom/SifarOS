class_name DB
## All authored game data (systems, sites, story, dialogue, items, governance),
## exported from the original game into data/game.json.

static var D: Dictionary = {}

static func ensure() -> void:
	if not D.is_empty():
		return
	var f = FileAccess.open("res://data/game.json", FileAccess.READ)
	if f == null:
		push_error("data/game.json missing")
		return
	D = JSON.parse_string(f.get_as_text())

static func site(id: String) -> Dictionary:
	ensure()
	return D.SITES.get(id, {})

static func system(id: String) -> Dictionary:
	ensure()
	return D.SYSTEMS.get(id, {})

static func col(hex: String) -> Color:
	return Color.html(hex) if hex != "" else Color.WHITE

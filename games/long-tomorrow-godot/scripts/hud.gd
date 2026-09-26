extends CanvasLayer
## On-screen text: location, interaction prompt, flight readout, toasts, controls.

var loc: Label
var prompt: Label
var readout: Label
var toast_label: Label
var help: Label
var _toast_t = 0.0

func _ready() -> void:
	loc = _label(Vector2(24, 18), 26)
	readout = _label(Vector2(24, 56), 15)
	prompt = _label(Vector2(0, 0), 20)
	prompt.anchor_left = 0.5; prompt.anchor_right = 0.5; prompt.anchor_top = 0.72; prompt.anchor_bottom = 0.72
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt.offset_left = -400; prompt.offset_right = 400
	toast_label = _label(Vector2(0, 0), 17)
	toast_label.anchor_left = 0.5; toast_label.anchor_right = 0.5; toast_label.anchor_top = 0.86; toast_label.anchor_bottom = 0.86
	toast_label.offset_left = -520; toast_label.offset_right = 520
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help = _label(Vector2(24, 0), 13)
	help.anchor_top = 1.0; help.anchor_bottom = 1.0; help.offset_top = -40
	help.modulate = Color(1, 1, 1, 0.6)

func _label(pos: Vector2, size: int) -> Label:
	var l = Label.new()
	l.position = pos
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	l.add_theme_constant_override("outline_size", 6)
	add_child(l)
	return l

var boss_label: Label
func boss_bar(t: String, frac: float) -> void:
	if boss_label == null:
		boss_label = _label(Vector2(0, 0), 18)
		boss_label.anchor_left = 0.5; boss_label.anchor_right = 0.5; boss_label.offset_left = -300; boss_label.offset_right = 300; boss_label.offset_top = 20
		boss_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if frac < 0: boss_label.text = ""; return
	var n = int(clampf(frac, 0, 1) * 30)
	boss_label.text = "%s\n[%s%s]" % [t, "█".repeat(n), "·".repeat(30 - n)]

func set_location(t: String) -> void:
	loc.text = t.to_upper()

func set_prompt(t: String) -> void:
	prompt.text = t

func set_readout(t: String) -> void:
	readout.text = t

func set_help(t: String) -> void:
	help.text = t

func toast(t: String, seconds := 6.0) -> void:
	toast_label.text = t
	_toast_t = seconds

func _process(delta: float) -> void:
	if _toast_t > 0.0:
		_toast_t -= delta
		toast_label.modulate.a = clampf(_toast_t, 0.0, 1.0)

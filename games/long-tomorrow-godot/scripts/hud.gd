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
	_make_combat_hud()

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

var cross: TextureRect
var hitmark: TextureRect
var vignette: ColorRect
var _hit_t = 0.0

func _make_combat_hud() -> void:
	cross = TextureRect.new(); cross.texture = load("res://assets/kenney/sprites/crosshair.png")
	cross.anchor_left = 0.5; cross.anchor_right = 0.5; cross.anchor_top = 0.5; cross.anchor_bottom = 0.5
	cross.offset_left = -16; cross.offset_right = 16; cross.offset_top = -16; cross.offset_bottom = 16
	cross.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; cross.modulate = Color(1, 1, 1, 0.85)
	add_child(cross)
	hitmark = TextureRect.new(); hitmark.texture = load("res://assets/kenney/sprites/hit.png")
	hitmark.anchor_left = 0.5; hitmark.anchor_right = 0.5; hitmark.anchor_top = 0.5; hitmark.anchor_bottom = 0.5
	hitmark.offset_left = -22; hitmark.offset_right = 22; hitmark.offset_top = -22; hitmark.offset_bottom = 22
	hitmark.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; hitmark.modulate = Color(1, 0.3, 0.2, 0)
	add_child(hitmark)
	vignette = ColorRect.new(); vignette.set_anchors_preset(Control.PRESET_FULL_RECT); vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh = Shader.new()
	sh.code = "shader_type canvas_item; uniform float amt = 0.0; void fragment(){ float d = distance(UV, vec2(0.5)); COLOR = vec4(0.7, 0.02, 0.02, smoothstep(0.35, 0.75, d) * amt); }"
	var m = ShaderMaterial.new(); m.shader = sh; vignette.material = m
	add_child(vignette)

func hit_marker() -> void:
	_hit_t = 0.15

func set_crosshair(on: bool) -> void:
	if cross: cross.visible = on

func hurt(amount: float) -> void:
	if vignette: vignette.material.set_shader_parameter("amt", clampf(amount, 0.0, 1.0))

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
	if hitmark:
		_hit_t = maxf(0.0, _hit_t - delta)
		hitmark.modulate.a = _hit_t / 0.15
	if _toast_t > 0.0:
		_toast_t -= delta
		toast_label.modulate.a = clampf(_toast_t, 0.0, 1.0)

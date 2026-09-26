extends CanvasLayer
## Menus and overlays: title and character creation, pause (save/load),
## dialogue, journal (status, inventory, quests, crew), star map and jumps,
## Command (Sol's governance), shops, helm, cutscenes and endings.

var talking = null
var _panel: PanelContainer
var _open = false
var _dlg: Dictionary
var _dlg_id = ""
var _cut: Array = []
var _cut_i = 0
var _cut_t = 0.0
var _cut_label: RichTextLabel

func is_open() -> bool:
	return _open

func close_all() -> void:
	if _panel: _panel.queue_free(); _panel = null
	if _cut_label: _cut_label.get_parent().queue_free(); _cut_label = null
	_open = false
	talking = null
	if Game.inst.mode != "title": Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _modal(title: String, wide := false) -> VBoxContainer:
	if _panel: _panel.queue_free()
	_open = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_panel = PanelContainer.new()
	var sb = StyleBoxFlat.new(); sb.bg_color = Color(0.04, 0.05, 0.07, 0.92); sb.border_color = Color("#f2a33a"); sb.set_border_width_all(1)
	sb.set_content_margin_all(20); sb.set_corner_radius_all(4)
	_panel.add_theme_stylebox_override("panel", sb)
	_panel.anchor_left = 0.5; _panel.anchor_right = 0.5; _panel.anchor_top = 0.5; _panel.anchor_bottom = 0.5
	var w = 900.0 if wide else 640.0
	_panel.offset_left = -w / 2; _panel.offset_right = w / 2; _panel.offset_top = -330; _panel.offset_bottom = 330
	add_child(_panel)
	var scroll = ScrollContainer.new(); scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_panel.add_child(scroll)
	var v = VBoxContainer.new(); v.size_flags_horizontal = Control.SIZE_EXPAND_FILL; v.add_theme_constant_override("separation", 8)
	scroll.add_child(v)
	var h = Label.new(); h.text = title.to_upper(); h.add_theme_font_size_override("font_size", 22); h.add_theme_color_override("font_color", Color("#f2a33a"))
	v.add_child(h)
	return v

func _text(v: Container, t: String, size := 15) -> RichTextLabel:
	var r = RichTextLabel.new(); r.bbcode_enabled = true; r.fit_content = true; r.text = t
	r.add_theme_font_size_override("normal_font_size", size); r.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_child(r)
	return r

func _btn(v: Container, t: String, fn: Callable, enabled := true) -> Button:
	var b = Button.new(); b.text = t; b.disabled = not enabled; b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.pressed.connect(func(): Sfx.play("ui"); fn.call())
	v.add_child(b)
	return b

func _row(v: Container) -> HBoxContainer:
	var h = HBoxContainer.new(); h.add_theme_constant_override("separation", 8); v.add_child(h)
	return h

# ── title ────────────────────────────────────────────────────────────
func show_title() -> void:
	var v = _modal("The Long Tomorrow")
	_text(v, "[i]2187. A signal on the hydrogen line, arriving from every direction at once.[/i]")
	if GameState.has_save("auto"):
		_btn(v, "Continue", func(): close_all(); Game.inst.continue_game())
	_btn(v, "New game", func(): _creator())
	_btn(v, "Quit", func(): get_tree().quit())

func _creator() -> void:
	var v = _modal("New captain", true)
	var pick = {"name": "Captain", "ship": "Long Tomorrow", "origin": "pilot", "body": "soldier", "mode": "captain"}
	var name_e = LineEdit.new(); name_e.placeholder_text = "Your name"; name_e.text = "Captain"; v.add_child(name_e)
	var ship_e = LineEdit.new(); ship_e.placeholder_text = "Ship name"; ship_e.text = "Long Tomorrow"; v.add_child(ship_e)
	var groups = [["origin", DB.D.ORIGINS.keys(), func(k): return "%s · %s" % [DB.D.ORIGINS[k].name, DB.D.ORIGINS[k].home]],
		["body", ["soldier", "michelle", "xbot"], func(k): return {"soldier": "Armoured", "michelle": "Civilian", "xbot": "Synthetic"}[k]],
		["mode", ["captain", "statesman", "sandbox"], func(k): return {"captain": "Captain (story)", "statesman": "Statesman (start as Chancellor)", "sandbox": "Sandbox (rich, warp drive)"}[k]]]
	for g in groups:
		var ob = OptionButton.new()
		for k in g[1]: ob.add_item(g[2].call(k))
		var key: String = g[0]; var keys: Array = g[1]
		ob.select(keys.find(pick[key]))
		ob.item_selected.connect(func(i): pick[key] = keys[i])
		var l = Label.new(); l.text = key.capitalize(); v.add_child(l); v.add_child(ob)
	_btn(v, "Begin", func():
		pick.name = name_e.text.strip_edges() if name_e.text.strip_edges() != "" else "Captain"
		pick.ship = ship_e.text.strip_edges() if ship_e.text.strip_edges() != "" else "Long Tomorrow"
		close_all(); Game.inst.new_game(pick))
	_btn(v, "Back", func(): show_title())

# ── pause ────────────────────────────────────────────────────────────
func show_pause() -> void:
	var v = _modal("Paused")
	_btn(v, "Resume", func(): close_all())
	for slot in ["1", "2", "3"]:
		var sl: String = slot
		_btn(v, "Save to slot %s" % sl, func(): GameState.save(sl); Game.hud_toast("Saved to slot %s." % sl); close_all())
		_btn(v, "Load slot %s" % sl, func():
			if GameState.load_slot(sl):
				close_all(); GameState.save("auto"); Game.inst.continue_game()
			else: Game.hud_toast("Slot %s is empty." % sl), GameState.has_save(sl))
	_btn(v, "Quit to title", func(): Game.inst.autosave(); get_tree().reload_current_scene())

# ── dialogue ─────────────────────────────────────────────────────────
func dialogue(id: String, npc) -> void:
	dialogue_data(DB.D.DLG[id], id, npc)

func dialogue_data(D: Dictionary, id: String, npc) -> void:
	_dlg = D; _dlg_id = id; talking = npc
	_show_node(D.start)

func _show_node(nid) -> void:
	if nid == null or not _dlg.nodes.has(nid):
		close_all(); return
	var N: Dictionary = _dlg.nodes[nid]
	var sp = N.get("s", null)
	var who = ""; var role = ""
	if sp != null:
		if DB.D.NPCS.has(sp): who = DB.D.NPCS[sp].name; role = DB.D.NPCS[sp].role
		elif DB.D.CREW.has(sp): who = DB.D.CREW[sp].name; role = DB.D.CREW[sp].get("role", "")
		else: who = str(sp)
	elif talking and is_instance_valid(talking):
		who = talking.o.get("name", ""); role = talking.o.get("role", "")
	var v = _modal(who, true)
	if role != "": _text(v, "[color=#8a94a4]%s[/color]" % role, 13)
	_text(v, DlgLive.node_text(_dlg_id, nid, N), 17)
	var choices = []
	for c in N.get("c", []):
		if c.get("hide") != null and Story.meets(c.hide): continue
		var r = c.get("req")
		if r is Dictionary and (r.has("stageMin") or r.has("stage") or r.has("crew") or r.has("flag")):
			var gate = {}
			for k in ["stageMin", "stage", "crew", "flag"]:
				if r.has(k): gate[k] = r[k]
			if not Story.meets(gate): continue
		choices.append(c)
	var i = 0
	for c in choices:
		i += 1
		var ok = Story.meets(c.get("req"))
		var lab = Story.req_label(c.get("req")) if c.get("req") != null else ""
		var t: String = c.t
		if t.begins_with("["): t = t.substr(t.find("]") + 1).strip_edges()
		var cc: Dictionary = c
		_btn(v, "%d. %s%s" % [i, ("[%s] " % lab) if lab != "" else "", t], func(): _pick(cc), ok)

func _pick(c: Dictionary) -> void:
	var fx = c.get("fx")
	if fx is Dictionary and (fx.has("shop") or fx.has("cut") or fx.has("ending")):
		close_all(); Story.apply(fx); return
	Story.apply(fx)
	if c.get("end", false) or c.get("go") == null:
		if _panel and talking != null: close_all()
		elif _panel: close_all()
	else:
		_show_node(c.go)

# ── journal ──────────────────────────────────────────────────────────
func show_journal(tab := "status") -> void:
	var s = GameState.s
	var v = _modal("%s · wrist computer" % s.player.name, true)
	var tabs = _row(v)
	for t in [["status", "Status"], ["inv", "Inventory"], ["quests", "Journal"], ["crew", "Crew"], ["factions", "Factions"]]:
		var k: String = t[0]
		var b = Button.new(); b.text = t[1]; b.toggle_mode = true; b.button_pressed = k == tab
		b.pressed.connect(func(): show_journal(k)); tabs.add_child(b)
	match tab:
		"status":
			var P: Dictionary = s.player
			var t = "Captain [b]%s[/b], %s\nShip: %s  ·  Drive: %s\nEarth date %.2f  ·  Ship time %.2f years\nHealth %d / %d  ·  Credits %d  ·  Kills %d\n\n[b]Attributes[/b]  " % [P.name, DB.D.ORIGINS[P.origin].name, s.ship.name, s.ship.drive, float(s.earthYear), float(s.shipYears), int(P.hp), int(GameState.max_hp()), int(s.credits), int(s.stats.kills)]
			for a in P.attrs: t += "%s %d   " % [a, int(P.attrs[a])]
			t += "\n\n[b]Skills[/b]\n"
			for k in DB.D.SKILLS: t += "%s: level %d  (%d xp)\n" % [DB.D.SKILLS[k].name, GameState.level_for(float(P.skills[k])), int(P.skills[k])]
			_text(v, t)
		"inv":
			for k in s.inv:
				if int(s.inv[k]) <= 0: continue
				var it: Dictionary = DB.D.ITEMS.get(k, DB.D.WEAPONS.get(k, {"name": k, "desc": ""}))
				_text(v, "[b]%s[/b] ×%d  [color=#8a94a4]%s[/color]" % [it.name, int(s.inv[k]), it.get("desc", "")], 14)
		"quests":
			_text(v, "[b]%s[/b]" % Story.act_name())
			for q in s.quests:
				var Q = Story.qdef(q)
				if Q.is_empty(): continue
				var st = Story.cur(q)
				var line = "[b]%s[/b]  %s" % [Q.name, "(done)" if s.quests[q].get("done", false) else ""]
				if st != null: line += "\n  %s" % st.text
				var kk: String = q
				_text(v, line, 14)
				if st != null: _btn(v, "Track", func(): s.track = kk; Game.hud_toast("Tracking %s" % Q.name))
		"crew":
			if s.crew.is_empty(): _text(v, "No crew yet.")
			for c in s.crew: _text(v, "[b]%s[/b], %s  ·  loyalty %d" % [DB.D.CREW[c].name, DB.D.CREW[c].get("role", ""), int(s.loyalty.get(c, 50))])
		"factions":
			for f in s.rep: _text(v, "%s: %d" % [DB.D.FACTIONS[f].name if DB.D.FACTIONS.has(f) else f, int(s.rep[f])])
	_btn(v, "Close", func(): close_all())

# ── star map and jumps ───────────────────────────────────────────────
## Drive model: the fusion torch is sub-light (0.12 c with real time
## dilation); White-Juday warp drives cross light years in days.
func plan_jump(to: String) -> Dictionary:
	var s = GameState.s
	var d = Cosmos.dist(s.loc.system, to)
	if is_inf(d): return {"ok": false, "why": "Another galaxy. Only an Engineer gate reaches it."}
	var drive: String = s.ship.drive
	if drive == "torch":
		var beta = 0.12
		var gamma = 1.0 / sqrt(1.0 - beta * beta)
		var accel = 1.1
		var years = d / beta + accel
		return {"ok": true, "d": d, "years": years, "ship": years / gamma, "fuel": d * 2.0}
	var speed = 12.0 if drive == "warp1" else 60.0   # ly per 30 days
	var years = d / speed * 30.0 / 365.0
	return {"ok": true, "d": d, "years": years, "ship": years, "fuel": d * 0.5}

func show_starmap(gate := false) -> void:
	var s = GameState.s
	var v = _modal("Star map" + (" · Engineer gate" if gate else ""), true)
	var here = Cosmos.pos_of(s.loc.system)
	if here.is_empty(): _text(v, "Position unknown."); _btn(v, "Close", func(): close_all()); return
	if gate:
		for g in Cosmos.gate_list():
			var gid: String = g.id
			_btn(v, "%s" % g.name, func(): close_all(); Game.inst.jump_to(gid, true), bool(s.flags.get(g.get("flag", ""), false)) or g.get("flag", "") == "")
	var list = Cosmos.near(here.g, here.p, 30.0 if s.ship.drive == "torch" else 120.0)
	list.sort_custom(func(a, b): return a.pos.distance_to(here.p) < b.pos.distance_to(here.p))
	_text(v, "From %s. Drive: %s. Fuel %d." % [DB.system(s.loc.system).get("name", s.loc.system), s.ship.drive, int(s.ship.fuel)], 14)
	var n = 0
	for e in list:
		if e.id == s.loc.system: continue
		n += 1
		if n > 40: break
		var pj = plan_jump(e.id)
		var id: String = e.id
		var t = "%s  (%s)  %.1f ly · Earth +%.1f y · ship +%.2f y" % [e.name, e.cls, float(pj.get("d", 0)), float(pj.get("years", 0)), float(pj.get("ship", 0))]
		_btn(v, t, func():
			var p = plan_jump(id)
			if float(s.ship.fuel) < float(p.fuel) * 0.1: Game.hud_toast("Not enough fuel."); return
			s.ship.fuel = maxf(0, float(s.ship.fuel) - float(p.fuel) * 0.1)
			close_all(); Sfx.play("warp"); Game.inst.jump_to(id, false))
	_btn(v, "Close", func(): close_all())

# ── helm (bridge) ────────────────────────────────────────────────────
func show_helm() -> void:
	var s = GameState.s
	var v = _modal("Helm · %s" % s.ship.name)
	if not s.loc.get("inSpace", false):
		_btn(v, "Take off", func(): close_all(); Game.inst.take_off())
	_btn(v, "Star map", func(): show_starmap())
	_btn(v, "Close", func(): close_all())

# ── command ──────────────────────────────────────────────────────────
func show_command(_tab := "overview") -> void:
	var p = Polity.P()
	var v = _modal("Command · Sol", true)
	var t = "[b]%s[/b]  ·  approval %d%%  ·  treasury %d  ·  prognosis [b]%s[/b]\n\n[b]Risk meters[/b]\n" % [Polity.gov_type(p), int(p.approval), int(p.treasury), Polity.prognosis()]
	for k in p.risks: t += "%s: %d\n" % [DB.D.RISKS[k].name if DB.D.RISKS.has(k) else k, int(p.risks[k])]
	_text(v, t)
	_text(v, "[b]World Ledger[/b] (three completed works discharge you with the Tabib)", 14)
	for id in DB.D.LEDGER:
		var L: Dictionary = DB.D.LEDGER[id]
		var k: String = id
		var done: bool = p.ledgerDone.has(id)
		_btn(v, "%s%s · %d" % ["✓ " if done else "", L.name, int(L.cost)], func():
			if Polity.ledger_work(k): Game.hud_toast("%s: funded." % L.name); show_command()
			else: Game.hud_toast("Not enough treasury."), not done)
	_btn(v, "Close", func(): close_all())

# ── shop ─────────────────────────────────────────────────────────────
func show_shop(kind: String) -> void:
	var s = GameState.s
	var v = _modal("Shop · %s" % kind)
	var mult = 1.0 if kind != "black" else 0.6
	_text(v, "Credits: %d" % int(s.credits))
	for k in DB.D.ITEMS:
		var it: Dictionary = DB.D.ITEMS[k]
		if not it.has("v") or int(it.v) <= 0: continue
		if kind == "market" and it.get("type", "") not in ["use", "ammo", "trade"]: continue
		var key: String = k
		var price = int(it.v)
		var h = _row(v)
		var l = Label.new(); l.text = "%s  (%d cr, have %d)" % [it.name, price, int(s.inv.get(k, 0))]; l.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(l)
		_btn(h, "Buy", func():
			if int(s.credits) >= price: GameState.add_credits(-price); GameState.give(key); Sfx.play("coin"); show_shop(kind)
			else: Sfx.play("deny"), kind != "black")
		_btn(h, "Sell", func():
			if int(s.inv.get(key, 0)) > 0: GameState.take(key); GameState.add_credits(int(price * 0.5 * mult)); Sfx.play("coin"); show_shop(kind), int(s.inv.get(k, 0)) > 0)
	for w in DB.D.WEAPONS:
		if kind == "black" or int(s.inv.get(w, 0)) > 0: continue
		var W: Dictionary = DB.D.WEAPONS[w]
		var price2 = int(W.get("cost", 2500))
		var ww: String = w
		_btn(v, "Buy %s (%d cr)" % [W.name, price2], func():
			if int(s.credits) >= price2: GameState.add_credits(-price2); GameState.give(ww); Sfx.play("coin"); show_shop(kind)
			else: Sfx.play("deny"))
	_btn(v, "Close", func(): close_all())

# ── cutscenes and endings ────────────────────────────────────────────
func show_cutscene(shots: Array) -> void:
	_cut = shots; _cut_i = 0; _cut_t = 0.0
	if _cut_label == null:
		var bg = ColorRect.new(); bg.color = Color(0, 0, 0, 0.72); bg.set_anchors_preset(Control.PRESET_FULL_RECT)
		add_child(bg)
		_cut_label = RichTextLabel.new(); _cut_label.bbcode_enabled = true
		_cut_label.anchor_left = 0.15; _cut_label.anchor_right = 0.85; _cut_label.anchor_top = 0.35; _cut_label.anchor_bottom = 0.8
		_cut_label.add_theme_font_size_override("normal_font_size", 22)
		bg.add_child(_cut_label)
	_open = true
	_show_shot()

func _shot_text(sh) -> String:
	if sh is Array: return str(sh[3]) if sh.size() > 3 else ""
	if sh is Dictionary: return "[b]%s[/b]\n\n%s" % [sh.get("title", ""), sh.get("text", "")]
	return str(sh)

func _shot_len(sh) -> float:
	if sh is Array and sh.size() > 1: return float(sh[1])
	return 8.0

func _show_shot() -> void:
	if _cut_i >= _cut.size():
		_cut_label.get_parent().queue_free(); _cut_label = null; _open = false
		if Game.inst.mode != "title": Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		return
	_cut_label.text = _shot_text(_cut[_cut_i]) + "\n\n[color=#8a94a4][font_size=14]Space or click to continue[/font_size][/color]"
	_cut_t = 0.0

func _input(event: InputEvent) -> void:
	if _cut_label and ((event is InputEventKey and event.pressed and event.physical_keycode in [KEY_SPACE, KEY_ENTER, KEY_ESCAPE]) or (event is InputEventMouseButton and event.pressed)):
		_cut_i += 1; _show_shot(); get_viewport().set_input_as_handled()
	elif _panel and _dlg_id != "" and event is InputEventKey and event.pressed and event.physical_keycode >= KEY_1 and event.physical_keycode <= KEY_9 and talking != null:
		var i: int = event.physical_keycode - KEY_1
		var btns = _panel.find_children("*", "Button", true, false)
		if i < btns.size() and not btns[i].disabled: btns[i].pressed.emit()

func _process(delta: float) -> void:
	if _cut_label:
		_cut_t += delta
		if _cut_t > _shot_len(_cut[_cut_i]):
			_cut_i += 1; _show_shot()

func show_ending(key: String) -> void:
	var E: Dictionary = DB.D.ENDINGS.get(key, {"name": key, "text": ""})
	show_cutscene([{"title": E.name, "text": E.text}, {"title": "Free flight", "text": "The story is done. The galaxy is still open. Fly on."}])

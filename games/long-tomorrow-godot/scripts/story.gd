class_name Story
## Quest and dialogue engine, ported from the browser game.
## Quests, stages, requirements (req) and effects (fx) use the original data unchanged.

static func S() -> Dictionary:
	return GameState.s

static func stage(q: String) -> int:
	return int(S().quests[q].stage) if S().quests.has(q) else 0

static func done(q: String) -> bool:
	return S().quests.has(q) and S().quests[q].get("done", false)

static func qdef(q: String) -> Dictionary:
	return DB.D.QUESTS.get(q, {})

static func cur(q: String):
	var Q = qdef(q)
	if Q.is_empty() or not S().quests.has(q) or S().quests[q].get("done", false):
		return null
	return Q.stages.get(str(S().quests[q].stage), null)

static func active() -> Array:
	var out = []
	for q in S().quests:
		if not S().quests[q].get("done", false) and DB.D.QUESTS.has(q):
			out.append(q)
	return out

static func act_name() -> String:
	var st = stage("mq")
	if st < 80: return "Act I · The Null Signal"
	if st < 130: return "Act II · Afterlight"
	if st < 160: return "Act III · Seven Worlds"
	if st < 190: return "Act IV · The Quiet"
	if st < 220: return "Act V · The Elder Sun"
	if st < 240: return "Act VI · The Throat"
	if st < 250: return "Act VII · The Anchorage"
	return "Epilogue · Free flight"

static func crew_bonus(skill: String) -> int:
	var b = 0
	var crew: Array = S().crew
	if skill == "science" and crew.has("ilyas"): b += 5
	if skill == "engineering" and crew.has("mara"): b += 5
	if skill == "diplomacy" and crew.has("ren"): b += 5
	return b

static func meets(req) -> bool:
	if req == null or typeof(req) != TYPE_DICTIONARY:
		return true
	var s = S()
	if req.has("any"):
		var ok = false
		for r in req.any:
			if meets(r): ok = true
		if not ok: return false
	if req.has("skill") and GameState.level_for(float(s.player.skills.get(req.skill[0], 0))) + crew_bonus(req.skill[0]) < int(req.skill[1]): return false
	if req.has("attr") and int(s.player.attrs.get(req.attr[0], 0)) < int(req.attr[1]): return false
	if req.has("flag"):
		var parts: PackedStringArray = str(req.flag).split("=")
		var k: String = parts[0]
		if k.begins_with("!"):
			if s.flags.get(k.substr(1)): return false
		elif parts.size() > 1:
			if str(s.flags.get(k, "")) != parts[1]: return false
		elif not s.flags.get(k): return false
	if req.has("item") and int(s.inv.get(req.item[0], 0)) < int(req.item[1]): return false
	if req.has("credits") and int(s.credits) < int(req.credits): return false
	if req.has("origin") and s.player.origin != req.origin: return false
	if req.has("crew") and not s.crew.has(req.crew): return false
	if req.has("rep") and int(s.rep.get(req.rep[0], 0)) < int(req.rep[1]): return false
	if req.has("stage") and stage(req.stage[0]) != int(req.stage[1]): return false
	if req.has("stageMin") and stage(req.stageMin[0]) < int(req.stageMin[1]): return false
	if req.has("fn") and not (req.fn == "treated" and Polity.treated()): return false
	return true

static func req_label(req) -> String:
	if req == null: return ""
	if req.has("any"):
		var parts = []
		for r in req.any:
			var l = req_label(r)
			if l != "": parts.append(l)
		return " / ".join(parts)
	if req.has("skill"): return "%s %d" % [str(DB.D.SKILLS[req.skill[0]].name).to_upper(), int(req.skill[1])]
	if req.has("attr"): return "%s %d" % [req.attr[0], int(req.attr[1])]
	if req.has("credits"): return "%d CR" % int(req.credits)
	if req.has("item"): return "%s ×%d" % [str(DB.D.ITEMS[req.item[0]].name).to_upper(), int(req.item[1])]
	if req.has("origin"): return str(DB.D.ORIGINS[req.origin].name).to_upper()
	if req.has("crew"): return str(DB.D.CREW[req.crew].name).to_upper()
	if req.has("rep"): return "%s %d" % [str(DB.D.FACTIONS[req.rep[0]].short).to_upper(), int(req.rep[1])]
	if req.has("fn") and req.fn == "treated": return "EVERY RISK UNDER 40 OR 3 LEDGER WORKS"
	return ""

static func apply(fx) -> void:
	if fx == null or typeof(fx) != TYPE_DICTIONARY:
		return
	var s = S()
	if fx.has("credits"): GameState.add_credits(int(fx.credits))
	if fx.has("rep"):
		for f in fx.rep: GameState.add_rep(f, int(fx.rep[f]))
	if fx.has("flag"):
		for k in fx.flag: s.flags[k] = fx.flag[k]
	if fx.has("xp"):
		for k in fx.xp: GameState.add_xp(k, float(fx.xp[k]))
	if fx.has("take"):
		for k in fx.take: GameState.take(k, int(fx.take[k]))
	if fx.has("give"):
		for k in fx.give: GameState.give(k, int(fx.give[k]))
	if fx.has("loyal"):
		for k in fx.loyal:
			s.loyalty[k] = clampf(float(s.loyalty.get(k, 50)) + float(fx.loyal[k]), 0, 100)
			if s.crew.has(k) and float(fx.loyal[k]) <= -15:
				Game.hud_toast("%s will remember that." % DB.D.CREW[k].name)
	if fx.has("start"): start(fx.start)
	if fx.has("stage"): set_stage(fx.stage[0], int(fx.stage[1]))
	if fx.has("crew"): join_crew(fx.crew)
	if fx.has("heal"): s.player.hp = GameState.max_hp()
	if fx.has("unlock"): s.flags[fx.unlock] = 1
	if fx.has("fn"): run_fn(fx.fn)
	if fx.has("fight"): Game.inst.npc_hostile()
	if fx.has("ending"): Game.inst.show_ending(fx.ending)
	if fx.has("cut"): Game.inst.play_cut(fx.cut)
	if fx.has("shop"): Game.inst.open_shop(fx.shop)

static func join_crew(id: String) -> void:
	var s = S()
	if s.crew.has(id): return
	s.crew.append(id)
	s.loyalty[id] = float(s.loyalty.get(id, 60))
	Game.hud_toast("%s joins your crew." % DB.D.CREW[id].name)

static func run_fn(fn: String) -> void:
	var s = S()
	match fn:
		"buildDrive":
			s.ship.drive = "warp1"; s.flags["warp"] = 1
			Game.hud_toast("White–Juday Field Drive I installed"); GameState.add_xp("engineering", 2000)
		"keelDone":
			s.flags["gate_keel"] = 1; s.flags["gate_trappist"] = 1; set_stage("mq", 120); Game.inst.play_cut("gatewake")
		"trappistDone":
			s.flags["gate_tau"] = 1; set_stage("mq", 150)
		"quietDone":
			s.flags["gate_kepler"] = 1; set_stage("mq", 180)
		"keplerDone":
			s.flags["gate_throat"] = 1; GameState.give("elderchart", 1); set_stage("mq", 210)
		"heavyTurnIn":
			var need = 12
			for k in ["iridium", "platinum"]:
				var t: int = min(need, int(s.inv.get(k, 0)))
				GameState.take(k, t); need -= t
		"tabibFight":
			set_stage("tabib", 40); Game.inst.start_tabib_fight()
		"tabibDischarged":
			Polity.tabib_end("discharged")
		"tabibResident":
			Polity.tabib_end("resident")

static func start(q: String) -> void:
	var s = S()
	if s.quests.has(q) or not DB.D.QUESTS.has(q): return
	s.quests[q] = {"stage": 0}
	var keys = []
	for k in DB.D.QUESTS[q].stages: keys.append(int(k))
	keys.sort()
	set_stage(q, keys[0], true)
	Game.hud_toast("New task: %s" % DB.D.QUESTS[q].name)

static func set_stage(q: String, st: int, silent := false) -> void:
	var s = S()
	var Q = qdef(q)
	if Q.is_empty(): return
	if not s.quests.has(q): s.quests[q] = {"stage": 0}
	if int(s.quests[q].stage) == st: return
	s.quests[q].stage = st
	s.quests[q].k = 0
	var sd = Q.stages.get(str(st), null)
	var mx = 0
	for k in Q.stages: mx = max(mx, int(k))
	if sd == null or (sd.get("target") == null and st >= mx):
		s.quests[q].done = true
		if not silent: Game.hud_toast("Completed: %s" % Q.name)
		if q == "mq": s.flags["story_done"] = 1
	elif not silent:
		Game.hud_toast("%s: %s" % [Q.name, sd.text])
	if q == "mq" or not s.quests.has(s.track) or s.quests[s.track].get("done", false):
		s.track = q
	if Game.inst: Game.inst.on_quest_changed(q, st)

static func event(ev: String, data := {}) -> void:
	var s = S()
	for q in active():
		var st = cur(q)
		if st == null: continue
		if st.has("on") and st.on.ev == ev:
			if st.on.has("site") and st.on.site != data.get("site", ""): continue
			if st.on.has("system") and st.on.system != data.get("system", ""): continue
			if st.has("fx"): apply(st.fx)
			if st.has("next"): set_stage(q, int(st.next))
		if st.has("have") and ev == "inv" and int(s.inv.get(st.have.item, 0)) >= int(st.have.n) and q == "mq" and stage("mq") == 60:
			set_stage("mq", 70)
		if st.has("collect") and (ev == "inv" or ev == "flag"):
			var ok = false
			if st.collect.has("item"): ok = int(s.inv.get(st.collect.item, 0)) >= int(st.collect.n)
			if st.collect.has("flagCount"):
				var pre: String = st.collect.flagCount[0]
				var c = 0
				for k in s.flags:
					if str(k).begins_with(pre + "_") and s.flags[k]: c += 1
				ok = c >= int(st.collect.flagCount[1])
			if ok and st.has("next"): set_stage(q, int(st.next))
			elif ok and q == "mq":
				var order = []
				for k in DB.D.QUESTS.mq.stages: order.append(int(k))
				order.sort()
				set_stage(q, order[order.find(stage("mq")) + 1])
		if st.has("kill") and ev == "kill" and data.get("tag", "") == st.kill.tag:
			s.quests[q].k = int(s.quests[q].get("k", 0)) + 1
			if int(s.quests[q].k) >= int(st.kill.n):
				if st.has("fx"): apply(st.fx)
				else: set_stage(q, int(st.get("next", stage(q) + 10)))
		if st.has("space") and ev == "spacekill" and data.get("tag", "") == st.space.tag:
			s.quests[q].k = int(s.quests[q].get("k", 0)) + 1
			if int(s.quests[q].k) >= int(st.space.n):
				if st.has("fx"): apply(st.fx)
				else: set_stage(q, stage(q) + 10)

## The line a character says: dialogue text or its computed value.
static func node_text(n: Dictionary) -> String:
	var t = n.t
	if typeof(t) == TYPE_DICTIONARY:
		return str(t.get("text", ""))
	return str(t)

class_name Polity
## Sol's governance state: risk meters, government scores, approval, the
## World Ledger, Sol colonies, and the Tabib's verdicts. This is a reduced
## port of the original polity.js: the monthly simulation here drifts the
## risk meters and approval; the full laws/charter/operations/crisis model
## of the browser game has not been ported yet.

static func S() -> Dictionary:
	return GameState.s

static func P() -> Dictionary:
	init_state()
	return S().pol

static func init_state() -> void:
	var s = S()
	if s.has("pol") and s.pol is Dictionary and s.pol.has("risks"): return
	var colonies = {}
	for k in DB.D.get("SOL_COLONIES", {}):
		var c: Dictionary = DB.D.SOL_COLONIES[k]
		colonies[k] = {"owner": c.get("owner", "concord"), "pop": c.get("pop", 0), "loyalty": 55 if c.get("owner", "") == "frontier" else 70, "level": 1}
	s.pol = {"office": null, "capital": 30.0, "treasury": 140.0, "approval": 50.0, "months": 0,
		"risks": {"fin": 20.0, "climate": 44.0, "unrest": 24.0, "ai": 18.0, "gal": 14.0},
		"gov": {"dem": 70.0, "free": 64.0, "corp": 45.0, "nat": 35.0},
		"ledgerDone": {}, "laws": {}, "colonies": colonies}

static func sim(_years: float) -> void:
	init_state()
	var s = S()
	var p: Dictionary = s.pol
	var target = int(floor((float(s.earthYear) - float(DB.D.START_YEAR)) * 12.0))
	var n = 0
	while int(p.months) < target and n < 240:
		_month(p, s); n += 1
	if int(p.months) < target: p.months = target

static func _month(p: Dictionary, s: Dictionary) -> void:
	p.months = int(p.months) + 1
	var w: Dictionary = s.world
	var r: Dictionary = p.risks
	# ORACLE's reach raises AI risk; Frontier strength raises galactic friction; everything mean-reverts slowly
	r.ai = clampf(float(r.ai) + (float(w.get("oracle", 0.25)) - 0.3) * 0.4 + randf_range(-0.3, 0.3), 0, 100)
	r.gal = clampf(float(r.gal) + (float(w.get("frontier", 0.3)) - 0.3) * 0.3 + randf_range(-0.3, 0.3), 0, 100)
	for k in ["fin", "climate", "unrest"]:
		r[k] = clampf(float(r[k]) + randf_range(-0.6, 0.6) + (30.0 - float(r[k])) * 0.004, 0, 100)
	var avg = 0.0
	for k in r: avg += float(r[k])
	avg /= 5.0
	p.approval = clampf(float(p.approval) + (50.0 - avg) * 0.02 + randf_range(-0.5, 0.5), 5, 95)
	p.treasury = float(p.treasury) + 2.0

static func gov_type(p: Dictionary) -> String:
	var g: Dictionary = p.gov.duplicate(); g["ai"] = p.risks.ai
	for t in DB.D.get("GOV_TYPES", []):
		var ok = true
		for k in ["dem", "free", "corp", "nat", "ai"]:
			if t.get(k) != null and not (float(g.get(k, 0)) >= float(t[k])): ok = false
		if ok: return t.name
	return "Total State"

static func prognosis() -> String:
	var r: Dictionary = P().risks
	var worst = 0.0; var avg = 0.0
	for k in r: worst = maxf(worst, float(r[k])); avg += float(r[k])
	avg /= 5.0
	return "grave" if worst >= 80 else ("poor" if avg >= 50 else ("guarded" if avg >= 35 else "good"))

static func treated() -> bool:
	var p = P()
	for k in p.risks:
		if float(p.risks[k]) >= 40: return p.ledgerDone.size() >= 3
	return true

static func tabib_end(key: String) -> void:
	var s = S()
	if s.flags.get("tabib"): return
	s.flags["tabib"] = key
	Story.set_stage("tabib", 50)
	var E = {"discharged": ["Discharged", "The Tabib closes its file on humanity and puts the pen down. Somewhere in the Echo, a door you did not know was open closes gently. Every year afterwards, on the anniversary, at exactly 04:00, receivers across Sol log one couplet: \"Your markers held. I checked. / I always check; I never once neglect.\""],
		"ama": ["Against Medical Advice", "You killed the physician of worlds. The eight rooms go dark one by one; seven universes lose their doctor, and none of them will ever know why. Sol keeps its diseases and its freedom. Nobody will triage you now. Nobody will save you either."],
		"resident": ["The Resident", "You take the coat. The crew watch you go through the eighth door and it closes behind you. Fifty years later a young civilisation on the far side of the Echo receives its first consultation note at 04:00. It is written in couplets, in a hand your crew would recognise."]}[key]
	var p = P()
	var shots = [{"title": E[0], "text": E[1]}, {"title": "Sol", "text": "%s, approval %d percent, %d works of the World Ledger completed. Prognosis at the end of the consultation: %s." % [gov_type(p), int(round(float(p.approval))), p.ledgerDone.size(), prognosis()]}]
	Game.inst.ui.show_cutscene(shots)

## Spend political capital on a World Ledger work: lowers the matching risk.
static func ledger_work(id: String) -> bool:
	var p = P()
	var L: Dictionary = DB.D.LEDGER.get(id, {})
	var cost = float(L.get("cost", 20))
	if p.ledgerDone.has(id) or float(p.treasury) < cost: return false
	p.treasury = float(p.treasury) - cost
	p.ledgerDone[id] = int(p.months)
	for k in p.risks: p.risks[k] = maxf(0.0, float(p.risks[k]) - 8.0)
	return true

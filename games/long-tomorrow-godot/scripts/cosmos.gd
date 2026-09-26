class_name Cosmos
## The mapped universe, ported from the browser game with the same seeds:
## 1. authored story systems, 2. the real catalogue (named stars, exoplanet
## hosts, nebulae, clusters, black holes, pulsars at measured galactic
## coordinates), 3. a deterministic procedural galaxy. Every 40-ly sector is
## seeded; density follows an exponential disk, bulge and logarithmic arms.
## Galactocentric frame: Sol at (-26,670, 0, +55) ly.

const R0 := 26670.0
const SOL_Z := 55.0
const SECTOR := 40.0
const SYL_A := ["ka","ve","tho","rin","sa","qel","mor","ith","da","zu","an","el","or","ys","tar","vhe","nu","ash","ko","li","ra","sen","ul","ze","xa","om","pri","ta","gha","ir"]
const SYL_B := ["n","r","sh","th","l","s","x","k","m","v","","","",""]
const ETHOS := [
	{"id":"collective","name":"Collective","desc":"Individual minds merged into a single will.","attitude":0.2},
	{"id":"mercantile","name":"Mercantile","desc":"Everything has a price, including an alliance.","attitude":0.5},
	{"id":"theocratic","name":"Devotional","desc":"They believe the Engineers were gods, and that gods can be disappointed.","attitude":0.0},
	{"id":"machine","name":"Machine","desc":"Post-biological. They uploaded, or they were built.","attitude":-0.1},
	{"id":"hegemony","name":"Hegemonic","desc":"Expansionist. They see every other species as a future province.","attitude":-0.5},
	{"id":"pacifist","name":"Contemplative","desc":"They renounced weapons after a war nobody else remembers.","attitude":0.6},
	{"id":"predatory","name":"Predatory","desc":"Raiders. The reason some systems have no one left.","attitude":-0.9},
	{"id":"scholar","name":"Archivist","desc":"They collect civilizations the way you collect stamps.","attitude":0.3},
]

static var _init_done = false
static var systems: Dictionary = {}     # authored + catalogue, with galactocentric pos
static var sec_cache: Dictionary = {}
static var sys_cache: Dictionary = {}
static var site_cache: Dictionary = {}
static var civ_cache: Dictionary = {}
static var stations: Dictionary = {}

# ── deterministic RNG, bit-exact with the browser game ─────────────────
class Rng:
	var st: int
	func _init(seed: int) -> void:
		st = seed & 0xFFFFFFFF
		if st == 0: st = 1
	static func _imul(a: int, b: int) -> int:
		return ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF
	func next() -> float:
		st = (st + 0x6D2B79F5) & 0xFFFFFFFF
		var t = _imul(st ^ (st >> 15), 1 | st)
		t = ((t + _imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
		return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
	func pick(arr: Array):
		return arr[int(next() * arr.size())]
	func weighted(list: Array):
		var tot = 0.0
		for x in list: tot += x.w
		var v = next() * tot
		for x in list:
			v -= x.w
			if v <= 0: return x
		return list[-1]

static func hash(s: String) -> int:
	var h = 2166136261
	for ch in s.to_utf8_buffer():
		h ^= ch
		h = (h * 16777619) & 0xFFFFFFFF
	return h

static func gen_name(r: Rng, syl := 2) -> String:
	var s = ""
	for i in syl:
		s += r.pick(SYL_A)
		if i < syl - 1 and r.next() < 0.3: s += "'"
	s += r.pick(SYL_B)
	return s.substr(0, 1).to_upper() + s.substr(1)

# ── frames ──────────────────────────────────────────────────────────
static func gc(l: float, b: float, d: float) -> Vector3:
	var L = deg_to_rad(l); var B = deg_to_rad(b)
	return Vector3(d * cos(B) * cos(L) - R0, d * cos(B) * sin(L), d * sin(B) + SOL_Z)

static func ensure() -> void:
	if _init_done: return
	_init_done = true
	DB.ensure()
	for id in DB.D.SYSTEMS:
		var s: Dictionary = DB.D.SYSTEMS[id].duplicate(true)
		s.id = id
		if id == "lmc":
			s.galaxy = "lmc"; s.pos = Vector3(400, -300, 20)
		elif id == "m31":
			s.galaxy = "m31"; s.pos = Vector3(-31000, 8000, 120)
		else:
			s.galaxy = "mw"; s.pos = gc(s.gal.l, s.gal.b, s.gal.d)
		systems[id] = s
	var all = []
	for a in DB.D.REAL_STARS: all.append([a[0], a[1], a[2], a[3], a[4], a[5], "star", a[6] if a.size() > 6 else ""])
	for a in DB.D.CATALOG: all.append(a)
	for a in all:
		var id: String = a[0]
		if systems.has(id): continue
		systems[id] = {"id": id, "name": a[1], "catalog": true, "cls": a[2], "kind": a[6], "note": a[7] if a.size() > 7 else "", "galaxy": "mw", "pos": gc(a[4], a[5], a[3]), "gal": {"l": a[4], "b": a[5], "d": a[3]}, "seed": hash(id), "purpose": a[7] if a.size() > 7 else ""}

# ── structural density: expected notable systems per sector ────────
static func density(gal_id: String, x: float, y: float, z: float) -> float:
	var g: Dictionary = DB.D.GALAXIES[gal_id]
	var R = Vector2(x, y).length()
	if R > float(g.radius) * 1.1: return 0.0
	var disk = exp(-R / float(g.rd)) * exp(-absf(z) / float(g.h))
	var t: String = g.type
	if t == "spiral" and g.has("arms"):
		var th = atan2(y, x)
		var k = 1.0 / tan(deg_to_rad(float(g.pitch)))
		var ph = float(g.arms) * (th - log(max(R, 500.0) / 4000.0) * k)
		disk *= 0.45 + 1.35 * pow(0.5 + 0.5 * cos(ph), 3)
	if t == "ring":
		var rr = absf(R - float(g.radius) * 0.65) / (float(g.radius) * 0.08)
		disk = exp(-rr * rr) * exp(-absf(z) / float(g.h)) + exp(-Vector2(R, z).length() / (float(g.radius) * 0.08))
	if t == "elliptical" or t == "dwarf": disk = exp(-Vector3(x, y, z).length() / float(g.rd))
	if t == "void": disk = exp(-Vector3(x, y, z).length() / float(g.rd)) * 0.4
	var bulge = 0.0
	if g.has("bulge"): bulge = exp(-Vector3(x, y, z * 1.6).length() / float(g.bulge)) * 1.4
	return (disk + bulge) * float(g.density) * 5.0 / exp(-R0 / 8500.0)

static func roll_class(r: Rng) -> String:
	return r.weighted([{"c":"M","w":62},{"c":"K","w":13},{"c":"G","w":8},{"c":"F","w":4},{"c":"A","w":1.6},{"c":"B","w":0.35},{"c":"O","w":0.05},{"c":"WD","w":5},{"c":"BD","w":4},{"c":"BH","w":0.25},{"c":"NS","w":0.35},{"c":"RG","w":1.2}]).c

static func proc_name(gal_id: String, i: int, j: int, k: int, q: int, r: Rng) -> String:
	var pre: String = {"mw":"SIF","lmc":"LMC","smc":"SMC","m31":"AND","m33":"TRI","sagdeg":"SGR"}.get(gal_id, gal_id.substr(0, 3).to_upper())
	if r.next() < 0.12:
		var n = gen_name(r, 2)
		if r.next() < 0.5: n += " " + r.pick(["Prime","Reach","Deep","Crossing","Rest","Hollow","Verge"])
		return n
	var h = (((i * 73856093) & 0xFFFFFFFF) ^ ((j * 19349663) & 0xFFFFFFFF) ^ ((k * 83492791) & 0xFFFFFFFF)) & 0xFFFFFFFF
	return "%s %d-%02d" % [pre, h % 9000 + 1000, q]

static func sector(gal_id: String, i: int, j: int, k: int) -> Array:
	var key = "%s:%d:%d:%d" % [gal_id, i, j, k]
	if sec_cache.has(key): return sec_cache[key]
	var c = Vector3((i + 0.5) * SECTOR, (j + 0.5) * SECTOR, (k + 0.5) * SECTOR)
	var n = density(gal_id, c.x, c.y, c.z)
	if gal_id == "mw":
		var ds = Vector3(c.x + R0, c.y, c.z - SOL_Z).length()
		if ds < 60: n = 0.0
		elif ds < 250: n *= 0.35
	var r = Rng.new(hash(key))
	var count = int(floor(n)) + (1 if r.next() < fmod(n, 1.0) else 0)
	count = min(count, 40)
	var out = []
	for q in count:
		var pos = Vector3((i + r.next()) * SECTOR, (j + r.next()) * SECTOR, (k + r.next()) * SECTOR)
		var cls = roll_class(r)
		var id = "P.%s.%d.%d.%d.%d" % [gal_id, i, j, k, q]
		out.append({"id": id, "cls": cls, "pos": pos, "galaxy": gal_id, "seed": hash(id), "name": proc_name(gal_id, i, j, k, q, r)})
	if sec_cache.size() > 6000: sec_cache.clear()
	sec_cache[key] = out
	return out

## All systems (authored, catalogue, procedural) within radius (ly) of p.
static func near(gal_id: String, p: Vector3, radius: float) -> Array:
	ensure()
	var out = []
	for id in systems:
		var s: Dictionary = systems[id]
		if s.galaxy != gal_id: continue
		if s.pos.distance_to(p) <= radius:
			out.append({"id": id, "name": s.name, "pos": s.pos, "cls": s.star.cls if s.has("star") else s.get("cls", ""), "authored": not s.get("catalog", false), "galaxy": gal_id})
	if radius <= 400:
		var rr = int(ceil(radius / SECTOR))
		var i0 = int(floor(p.x / SECTOR)); var j0 = int(floor(p.y / SECTOR)); var k0 = int(floor(p.z / SECTOR))
		var kr: int = min(rr, int(ceil(2500.0 / SECTOR)))
		for i in range(i0 - rr, i0 + rr + 1):
			for j in range(j0 - rr, j0 + rr + 1):
				for k in range(k0 - kr, k0 + kr + 1):
					for st in sector(gal_id, i, j, k):
						if st.pos.distance_to(p) <= radius: out.append(st)
	return out

static func pos_of(id: String) -> Dictionary:
	ensure()
	if systems.has(id): return {"g": systems[id].galaxy, "p": systems[id].pos}
	if id.begins_with("P."):
		var a = id.split(".")
		var list = sector(a[1], int(a[2]), int(a[3]), int(a[4]))
		var q = int(a[5])
		if q < list.size(): return {"g": a[1], "p": list[q].pos}
	if id.begins_with("GATE."): return {"g": id.substr(5), "p": Vector3.ZERO}
	return {}

static func dist(a: String, b: String) -> float:
	var A = pos_of(a); var B = pos_of(b)
	if A.is_empty() or B.is_empty() or A.g != B.g: return INF
	return A.p.distance_to(B.p)

static func dist_from_sol(id: String) -> float:
	var A = pos_of(id)
	if A.is_empty(): return 0.0
	if A.g != "mw": return float(DB.D.GALAXIES[A.g].d)
	return Vector3(A.p.x + R0, A.p.y, A.p.z - SOL_Z).length()

# ── civilisations claim spheres of each galaxy ──────────────────────
static func civs(gal_id: String) -> Array:
	if civ_cache.has(gal_id): return civ_cache[gal_id]
	var g: Dictionary = DB.D.GALAXIES[gal_id]
	var r = Rng.new(hash("civ:" + gal_id))
	var n = 16 if gal_id == "mw" else (1 if g.type == "void" else max(3, int(round(log(float(g.radius)) / log(10.0) * 2.2))))
	var list = []
	for i in n:
		var ang = r.next() * TAU
		var rad = sqrt(r.next()) * float(g.radius) * 0.85
		var c = Vector3(cos(ang) * rad, sin(ang) * rad, (r.next() - 0.5) * float(g.h))
		if gal_id == "mw" and Vector3(c.x + R0, c.y, c.z).length() < 900: c.x -= 1200
		var ethos: Dictionary = r.pick(ETHOS)
		var name = gen_name(r, 2 if r.next() < 0.5 else 3)
		var hue = r.next()
		var plural = name + ("" if name.ends_with("i") else r.pick(["i","ari","en","ith","ans"]))
		var adj = name + r.pick(["ic","an","ese","i"])
		var tier = 1 + int(r.next() * 5)
		var radius = 600.0 + r.next() * (3400.0 if gal_id == "mw" else float(g.radius) * 0.08)
		var attitude = clampf(float(ethos.attitude) + (r.next() - 0.5) * 0.6, -1, 1)
		list.append({"id": "%s-civ%d" % [gal_id, i], "galaxy": gal_id, "name": name, "plural": plural, "adj": adj, "ethos": ethos, "tier": tier, "center": c, "radius": radius, "attitude": attitude, "color": Color.from_hsv(hue, 0.55, 0.9), "homeworld": gen_name(r, 2)})
	civ_cache[gal_id] = list
	return list

static func civ_at(gal_id: String, p: Vector3, r: Rng):
	for c in civs(gal_id):
		var d: float = p.distance_to(c.center)
		if d < c.radius and r.next() < 0.75 * (1.0 - d / c.radius) + 0.1: return c
	return null

static func civ_by_id(id: String):
	var g = id.split("-civ")[0]
	for c in civs(g):
		if c.id == id: return c
	return null

## Any system id → a full, playable system.
static func get_system(id: String):
	ensure()
	if sys_cache.has(id): return sys_cache[id]
	var sys = null
	if systems.has(id) and systems[id].has("bodies"):
		sys = systems[id]
	elif systems.has(id) and systems[id].get("catalog", false):
		var c: Dictionary = systems[id]
		sys = generate({"id": id, "name": c.name, "cls": c.cls, "pos": c.pos, "galaxy": "mw", "seed": c.seed, "kind": c.kind, "note": c.note})
	elif id.begins_with("P."):
		var a = id.split(".")
		var list = sector(a[1], int(a[2]), int(a[3]), int(a[4]))
		if int(a[5]) >= list.size(): return null
		sys = generate(list[int(a[5])])
	elif id.begins_with("GATE."):
		sys = gate_system(id.substr(5))
	if sys == null: return null
	sys.id = id
	sys_cache[id] = sys
	return sys

static func biome_palette(t: String, r: Rng) -> Array:
	var P = {"lava":[["#2a1a16","#ff5a1a"],["#1a1414","#ff7a2a"]],"iron":[["#5a4a44","#8a6a5a"],["#4a3e3a","#a07a62"]],"glass":[["#2a3a5a","#9ab8e8"],["#1a2a44","#6a9ad8"]],
		"desert":[["#c89a5a","#e8c890"],["#b87a4a","#d8a870"],["#d8b890","#f0dcb8"]],"toxic":[["#8a9a3a","#c8d860"],["#6a7a4a","#b8c870"]],
		"ocean":[["#1a4a7a","#3a8ac0"],["#12507a","#40a0b0"]],"jungle":[["#2a5a2a","#5a8a3a"],["#3a4a8a","#6a5ab0"],["#6a2a4a","#b05a7a"]],
		"tundra":[["#8a9a9a","#c8d8d0"],["#7a8a7a","#b8c8b0"]],"fungal":[["#5a3a6a","#b07ad0"],["#6a4a3a","#e0a060"]],"crystal":[["#3a5a7a","#8ae0ff"],["#5a3a7a","#d08aff"]],
		"ice":[["#c8d8e8","#f0f8ff"],["#a8c0d8","#e0ecf8"]],"barren":[["#6a6560","#8a857e"],["#5a524a","#7a7068"]],"gas":[["#d9b48a","#a86f46"],["#8aa2c8","#4a6088"],["#c8a0d8","#6a4a88"],["#a8d8c8","#4a8878"]]}
	return r.pick(P.get(t, P.barren))

static func belt_ores(r: Rng, d_sol: float, gal: String) -> Array:
	var o = ["iron", "ice", "titanium"]
	if r.next() < 0.6: o.append("platinum")
	if r.next() < 0.4 or d_sol > 200: o.append("iridium")
	if (gal != "mw" and r.next() < 0.3) or r.next() < 0.02: o.append("sifarite")
	if r.next() < 0.3: o.append("he3")
	return o

static func generate(st: Dictionary) -> Dictionary:
	var r = Rng.new(int(st.seed))
	var cls: String = st.get("cls", "M")
	var letter = cls.substr(0, 1)
	for pre in ["BD","WD","BH","NS","RG","LBV","Pulsar","Magnetar"]:
		if cls.begins_with(pre): letter = pre; break
	var L2: String = {"Pulsar":"NS","Magnetar":"NS","LBV":"B","L":"BD","T":"BD","Y":"BD"}.get(letter, letter)
	var color_of = {"O":"#9bb0ff","B":"#aabfff","A":"#cad7ff","F":"#f8f7ff","G":"#fff4ea","K":"#ffd2a1","M":"#ffb07a","WD":"#e6edff","BD":"#c8583a","BH":"#000000","NS":"#d8e8ff","RG":"#ff9a5a"}
	var Rs: float = {"O":10.0,"B":5.0,"A":1.8,"F":1.3,"G":1.0,"K":0.75,"M":0.3,"WD":0.012,"BD":0.1,"BH":0.0,"NS":0.0,"RG":40.0}.get(L2, 0.5)
	var star = {"cls": cls, "color": color_of.get(L2, "#ffffff"), "R": Rs, "blackhole": L2 == "BH", "pulsar": L2 == "NS", "giant": L2 == "RG"}
	var d_sol = dist_from_sol(st.id)
	if d_sol == 0.0: d_sol = Vector3(st.pos.x + R0, st.pos.y, st.pos.z).length() if st.galaxy == "mw" else float(DB.D.GALAXIES[st.galaxy].d)
	var civ = civ_at(st.galaxy, st.pos, r)
	var control = null
	if st.galaxy == "mw" and d_sol < 180:
		control = r.weighted([{"c":"frontier","w": 4 if d_sol < 60 else 2},{"c":"concord","w": 3 if d_sol < 40 else 0.5},{"c":"syndicate","w":1.2},{"c":null,"w":3}]).c
	if civ != null: control = "civ:" + civ.id
	var bodies = []
	var nb: int = {"O":2,"B":2,"A":4,"F":6,"G":7,"K":6,"M":5,"WD":2,"BD":3,"BH":2,"NS":2,"RG":3}.get(L2, 3)
	var count = int(r.next() * nb) + (0 if L2 == "BH" else 1)
	var letters = "bcdefghij"
	var orbit = 1800.0 + r.next() * 900.0
	var hz = sqrt({"O":1e5,"B":1e3,"A":20.0,"F":3.0,"G":1.0,"K":0.35,"M":0.02,"WD":0.001,"BD":0.0005,"BH":0.0,"NS":0.0,"RG":500.0}.get(L2, 0.1))
	for n in count:
		var au = hz * pow(1.8, n - count * 0.4) * (0.6 + r.next() * 0.5)
		var temp = au / hz if hz > 0 else 10.0
		var type: String
		if star.pulsar: type = "barren" if r.next() < 0.7 else "iron"
		elif star.blackhole: type = "barren" if r.next() < 0.5 else "crystal"
		elif temp < 0.45: type = r.pick(["lava","lava","iron","glass"])
		elif temp < 0.8: type = r.pick(["desert","toxic","desert","glass","lava"])
		elif temp < 1.35: type = r.weighted([{"c":"ocean","w":2},{"c":"jungle","w":2},{"c":"tundra","w":2},{"c":"desert","w":2},{"c":"fungal","w":1},{"c":"crystal","w":0.6},{"c":"toxic","w":1}]).c
		elif temp < 2.6: type = r.pick(["tundra","ice","barren","gas","crystal"])
		else: type = r.pick(["gas","gas","ice","ice","barren"])
		var gas = type == "gas"
		var rad = 420.0 + r.next() * 520.0 if gas else 50.0 + r.next() * 170.0
		var pal = biome_palette(type, r)
		var atmo = biome_palette(type, r)[1] if ["ocean","jungle","toxic","tundra","fungal","desert"].has(type) else null
		var b = {"id": "b%d" % n, "name": "%s %s" % [st.name, letters[n]], "type": "gas" if gas else "proc", "biome": type, "r": rad, "orbit": orbit, "ang": r.next() * TAU, "pal": pal, "atmo": atmo,
			"rings": gas and r.next() < 0.35, "scoop": "he3" if gas else null, "temp": int(round(255.0 / sqrt(max(temp, 0.05)) - 30))}
		if not gas: b.site = "%s~%s" % [st.id, b.id]
		bodies.append(b)
		orbit += 1500.0 + r.next() * 2600.0 + (1500.0 if gas else 0.0)
	if r.next() < 0.55:
		bodies.append({"id": "belt", "name": st.name + " belt", "type": "belt", "orbit": orbit + 1200.0, "width": 900.0 + r.next() * 1600.0, "ores": belt_ores(r, d_sol, st.galaxy), "density": 0.6 + r.next() * 0.8, "hostile": r.next() < 0.15})
	var feats = []
	if control != null and str(control).begins_with("civ:") and r.next() < 0.8: feats.append("civstation")
	elif control == "frontier" and r.next() < 0.6: feats.append("outpost")
	elif control == "syndicate" and r.next() < 0.7: feats.append("den")
	elif control == "concord" and r.next() < 0.6: feats.append("listening")
	if r.next() < 0.035: feats.append("derelict")
	if r.next() < 0.012 or st.id == "tabby": feats.append("dyson")
	if r.next() < 0.02 or (st.get("kind", "") == "cluster" and r.next() < 0.5): feats.append("vault")
	if r.next() < 0.05: feats.append("anomaly")
	var station_orbit: float = bodies[int(r.next() * bodies.size())].orbit if bodies.size() > 0 else 3000.0
	for kind in ["civstation", "outpost", "den", "listening"]:
		if feats.has(kind):
			var sid: String = st.id + "~st"
			var sname: String
			match kind:
				"civstation": sname = "%s %s" % [civ.name, r.pick(["Spire","Haven","Concourse","Waypoint"])]
				"outpost": sname = st.name + " Outpost"
				"den": sname = r.pick(["The Rat's Nest","Coldharbor","Last Call","The Pit","Dead Man's Dock"])
				_: sname = st.name + " Listening Post"
			stations[sid] = {"name": sname, "faction": ("civ:" + civ.id) if kind == "civstation" else {"outpost":"frontier","den":"syndicate","listening":"concord"}[kind],
				"services": ["market","outfitter","jobs","repair","bar","black"] if kind == "den" else (["market","jobs","repair"] if kind == "civstation" else ["market","jobs","repair","outfitter"])}
			bodies.append({"id": "st", "name": sname, "type": "station", "orbit": station_orbit, "ang": r.next() * TAU, "dock": sid})
			break
	if feats.has("derelict"): bodies.append({"id": "wreck", "name": r.pick(["Generation ship Aniara","Hope of Lagos","Seedship Tamarind","Unknown hull","Long Walk II","Mayflower Deep"]), "type": "wreck", "orbit": orbit * 0.7, "ang": r.next() * TAU, "site": st.id + "~wreck"})
	if feats.has("dyson"): bodies.append({"id": "dyson", "name": "Dyson swarm", "type": "dyson", "orbit": 900.0, "ang": 0.0})
	if feats.has("vault"): bodies.append({"id": "vault", "name": "Engineer vault", "type": "vaultbody", "r": 70.0, "orbit": orbit * 0.5, "ang": r.next() * TAU, "pal": ["#1e1c1a","#f2a33a"], "site": st.id + "~vault"})
	if feats.has("anomaly"): bodies.append({"id": "anom", "name": "Unidentified signal", "type": "anomaly", "orbit": orbit * 0.6, "ang": r.next() * TAU})
	var desc = []
	if st.get("note", "") != "": desc.append(st.note)
	var np = 0
	for b in bodies:
		if b.type == "proc" or b.type == "gas": np += 1
	desc.append("%d planets." % np)
	if civ != null: desc.append("Claimed by the %s (%s)." % [civ.plural, civ.ethos.name])
	if feats.has("dyson"): desc.append("Something is harvesting this star's light.")
	if feats.has("vault"): desc.append("Engineer structure detected.")
	var security = 0.15
	if control == "concord": security = 0.8
	elif control == "frontier": security = 0.45
	elif control == "syndicate": security = 0.1
	elif civ != null: security = 0.5
	return {"id": st.id, "name": st.name, "galaxy": st.galaxy, "pos": st.pos, "star": star, "bodies": bodies, "control": control, "civ": civ.id if civ != null else null, "security": security, "generated": true, "purpose": " ".join(desc), "feats": feats}

static func gate_system(gal_id: String) -> Dictionary:
	var g: Dictionary = DB.D.GALAXIES[gal_id]
	return {"id": "GATE." + gal_id, "name": g.name + " Gate", "galaxy": gal_id, "pos": Vector3.ZERO, "star": {"cls": "G2V", "color": "#fff4ea", "R": 1.0}, "control": "engineers", "security": 0.6,
		"purpose": str(g.get("note", "")) + " The Engineer gate anchors here.",
		"bodies": [{"id": "gate", "name": "Engineer Gate", "type": "gate", "r": 300.0, "orbit": 6000.0, "ang": 0.0, "flag": g.get("gate", "deepgates")}]}

## Any site id → an authored site, or one generated from the body's biome.
static func site(id: String) -> Dictionary:
	ensure()
	if DB.D.SITES.has(id):
		var s: Dictionary = DB.D.SITES[id]
		s.id = id
		return s
	if site_cache.has(id): return site_cache[id]
	var parts = id.split("~")
	if parts.size() < 2: return {}
	var sys = get_system(parts[0])
	if sys == null: return {}
	var body = null
	for b in sys.bodies:
		if b.id == parts[1]: body = b
	if body == null: return {}
	var r = Rng.new(hash(id))
	var civ = civ_by_id(sys.civ) if sys.civ != null else null
	var out: Dictionary
	if parts[1] == "wreck":
		out = biome_site("barren", r, {"name": body.name, "style": "derelict", "body": body.name})
	elif parts[1] == "vault":
		out = biome_site("barren", r, {"name": "Engineer Vault", "style": "vault", "body": sys.name})
	else:
		var style = "wild"
		if civ != null and r.next() < 0.6: style = "alien"
		elif sys.control == "frontier" and r.next() < 0.5: style = "outpost"
		elif sys.control == "syndicate" and r.next() < 0.5: style = "camp"
		elif r.next() < 0.12: style = "ruins"
		elif r.next() < 0.1: style = "crash"
		var nm = "Wilderness"
		match style:
			"alien": nm = "%s %s" % [civ.homeworld, r.pick(["Enclave","Colony","Reach","Terrace"])]
			"outpost": nm = body.name + " Claim"
			"camp": nm = r.pick(["Scav Camp","Raider Hold","Chop Shop"])
			"ruins": nm = "Ancient ruins"
			"crash": nm = "Crash site"
		out = biome_site(body.biome, r, {"name": nm, "style": style, "body": body.name, "civ": civ.id if civ != null else null})
	out.system = parts[0]; out.id = id; out.generated = true
	out.faction = {"outpost": "frontier", "camp": "syndicate"}.get(out.style, "none")
	if out.style == "alien" and civ != null: out.faction = "civ:" + civ.id
	site_cache[id] = out
	return out

static func biome_site(biome: String, r: Rng, o: Dictionary) -> Dictionary:
	var B = {
		"lava":{"g":[0.8,1.6],"air":false,"temp":"410 °C","atm":"Thin, sulfurous","sky":["#1a0a06","#8a2a10","#4a1a10",0.004],"ground":["#2a1a16","#3a2420","#ff5a1a","#1a1212"],"amp":[30,60],"enemies":["crawler"],"ores":["iron","titanium","iridium"],"sea":{"level":-4,"color":"#ff4a10","lava":true}},
		"iron":{"g":[0.9,1.8],"air":false,"temp":"210 °C","atm":"Trace","sky":["#20140e","#8a5a3a","#5a3a2a",0.003],"ground":["#5a4a44","#7a5a4a","#a07a62","#3a2e2a"],"amp":[20,50],"enemies":["rogueDrone"],"ores":["iron","titanium","platinum"]},
		"glass":{"g":[0.9,1.5],"air":false,"temp":"1,000 °C day side","atm":"Silicate winds","sky":["#0a1a3a","#4a7ad8","#2a4a8a",0.004],"ground":["#2a3a5a","#4a6a9a","#9ab8e8","#1a2a44"],"amp":[20,40],"enemies":["crawler"],"ores":["platinum","iridium"]},
		"desert":{"g":[0.5,1.4],"air":false,"temp":"48 °C","atm":"Thin CO₂","sky":["#6a8ab0","#e8c8a0","#d8b890",0.003],"ground":["#b87a4a","#c89a5a","#e8c890","#8a5a3a"],"amp":[30,70],"enemies":["crawler","raider"],"ores":["iron","titanium"]},
		"toxic":{"g":[0.7,1.3],"air":false,"temp":"62 °C","atm":"Chlorine-laced","sky":["#3a4a1a","#b8c860","#8a9a4a",0.006],"ground":["#5a6a3a","#8a9a3a","#c8d860","#3a4a2a"],"amp":[20,40],"enemies":["stinger","crawler"],"ores":["titanium","platinum"],"sea":{"level":-4,"color":"#6a7a2a"}},
		"ocean":{"g":[0.7,1.2],"air":true,"temp":"19 °C","atm":"N₂/O₂, breathable","sky":["#2a6ab0","#bcdcef","#a8c8e0",0.0028],"ground":["#c8b890","#8a9a6a","#5a7a4a","#6a6050"],"amp":[26,40],"enemies":["stinger"],"ores":["ice","titanium"],"sea":{"level":-3,"color":"#1a5a8a"}},
		"jungle":{"g":[0.8,1.3],"air":true,"temp":"31 °C","atm":"Dense N₂/O₂, breathable","sky":["#3a7ac0","#d8e8c0","#9ab89a",0.004],"ground":["#2a5a2a","#3a6a2a","#6a7a4a","#2a3a22"],"amp":[30,60],"enemies":["stinger","crawler"],"ores":["titanium"],"sea":{"level":-6,"color":"#2a5a4a"}},
		"tundra":{"g":[0.7,1.2],"air":false,"temp":"−35 °C","atm":"Thin N₂","sky":["#5a7a9a","#d8e0e8","#b8c8d4",0.003],"ground":["#7a8a7a","#9aa89a","#e0e8e8","#5a6a5a"],"amp":[26,50],"enemies":["crawler"],"ores":["ice","iron"]},
		"fungal":{"g":[0.6,1.1],"air":false,"temp":"24 °C","atm":"Spore-laden, unbreathable","sky":["#3a2a4a","#c8a0c8","#6a4a6a",0.006],"ground":["#4a3a4a","#6a4a6a","#b07ad0","#2a1a2a"],"amp":[20,45],"enemies":["stinger","crawler"],"ores":["titanium","platinum"]},
		"crystal":{"g":[0.6,1.4],"air":false,"temp":"−80 °C","atm":"Trace neon","sky":["#0a1020","#5a8ab0","#1a2a44",0.003],"ground":["#2a3a5a","#3a5a7a","#8ae0ff","#1a2a3a"],"amp":[30,55],"enemies":["sentinel"],"ores":["platinum","iridium"]},
		"ice":{"g":[0.2,1.0],"air":false,"temp":"−190 °C","atm":"None","sky":["#000000","#0a0c14","#0a0c14",0.0008],"ground":["#a8c0d8","#c8d8e8","#f0f8ff","#8aa0b8"],"amp":[20,40],"enemies":["rogueDrone"],"ores":["ice","he3"]},
		"barren":{"g":[0.1,0.9],"air":false,"temp":"−120 °C","atm":"Vacuum","sky":["#000000","#07080c","#08090d",0.0007],"ground":["#5a524a","#6a6560","#8a857e","#3a3632"],"amp":[25,50],"enemies":["rogueDrone"],"ores":["iron","titanium","platinum"]},
	}
	var b: Dictionary = B.get(biome, B.barren)
	var g = snappedf(b.g[0] + r.next() * (b.g[1] - b.g[0]), 0.01)
	var vac: bool = b.sky[0] == "#000000"
	var style: String = o.style
	var day = 0 if r.next() < 0.4 else int(round(10 + r.next() * 60))
	var site = {"name": o.name, "body": o.body, "g": g, "breathable": b.air, "day": day, "style": style, "civ": o.get("civ"), "temp": b.temp, "atm": b.atm, "biome": biome,
		"purpose": {"wild":"Uncharted wilderness. Ore, fauna, and whatever the survey missed.","outpost":"A Frontier claim. Fuel, a noticeboard, and people who ask where you are from.","camp":"Raiders dug in here. Clear them out for the bounty, or deal with them.","alien":"A settlement of another species. Tread carefully.","ruins":"Ruins older than your species. Relics sell for fortunes.","crash":"Wreckage scattered across the surface. Salvage and survivors, maybe.","derelict":"A dead ship. Somebody launched it with hope.","vault":"An Engineer vault. The door has been waiting for you."}.get(style, ""),
		"sky": {"zen": b.sky[0], "hor": b.sky[1], "fog": b.sky[2], "fogD": b.sky[3], "sunCol": "#fff4e0", "sunSize": 0.5 + r.next() * 2.0, "sunEl": 0.1 + r.next() * 0.6, "stars": 1 if vac else 0.2, "haze": 0.0 if vac else 0.6},
		"ground": b.ground, "terrain": {"amp": b.amp[0] + r.next() * (b.amp[1] - b.amp[0]), "scale": 0.003 + r.next() * 0.003, "oct": 5, "flat": 80 if style == "wild" else 170, "ridge": r.next() * 0.6},
		"sea": b.get("sea"), "services": ["market","jobs","clinic"] if style == "outpost" else (["market"] if style == "alien" else (["black"] if style == "camp" else [])),
		"enemies": ["raider","raider"] if style == "camp" else (["construct"] if style == "vault" else (["sentinel"] if style == "ruins" else b.enemies)),
		"ores": ["sifarite","iridium"] if style == "vault" else b.ores, "seed": int(r.next() * 1e9)}
	return site

static func station(id: String):
	if stations.has(id): return stations[id]
	if DB.D.STATIONS.has(id): return DB.D.STATIONS[id]
	get_system(id.split("~")[0])
	return stations.get(id)

static func gate_list() -> Array:
	var s = GameState.s
	var out = []
	for id in DB.D.SYSTEMS:
		var S: Dictionary = DB.D.SYSTEMS[id]
		for b in S.get("bodies", []):
			if b.type == "gate":
				if s.flags.get(b.flag): out.append(id)
				break
	if s.flags.get("deepgates"):
		for g in DB.D.GALAXIES:
			if g != "mw" and not DB.D.GALAXIES[g].has("gateSystem"): out.append("GATE." + g)
	return out

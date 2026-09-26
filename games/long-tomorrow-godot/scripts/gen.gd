class_name Gen
## Procedural materials and meshes: cladding panels, curtain-wall glass with
## lit windows, the terrain splat shader, water, glows and ship hulls.

static var _cache = {}

static func tex(path: String) -> Texture2D:
	if not _cache.has(path):
		_cache[path] = load(path) if ResourceLoader.exists(path) else null
	return _cache[path]

static func mat(color: Color, rough := 0.7, metal := 0.1) -> StandardMaterial3D:
	var k = "m%s%.2f%.2f" % [color.to_html(), rough, metal]
	if not _cache.has(k):
		var m = StandardMaterial3D.new()
		m.albedo_color = color; m.roughness = rough; m.metallic = metal
		_cache[k] = m
	return _cache[k]

static func glow(color: Color, energy := 3.0) -> StandardMaterial3D:
	var k = "g%s%.1f" % [color.to_html(), energy]
	if not _cache.has(k):
		var m = StandardMaterial3D.new()
		m.albedo_color = color
		m.emission_enabled = true; m.emission = color; m.emission_energy_multiplier = energy
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_cache[k] = m
	return _cache[k]

## Cladding: bevelled plates, fasteners, vents, stencils. World-scaled triplanar UVs.
static func panel(color: Color, seed := 1, metal := 0.6) -> StandardMaterial3D:
	var k = "p%s%d%.2f" % [color.to_html(), seed % 6, metal]
	if _cache.has(k): return _cache[k]
	var set: Array = _panel_images(seed % 6)
	var m = StandardMaterial3D.new()
	m.albedo_color = color
	m.albedo_texture = set[0]
	m.normal_enabled = true; m.normal_texture = set[1]; m.normal_scale = 1.2
	m.roughness_texture = set[2]; m.roughness = 1.0
	m.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN
	m.metallic = metal
	m.uv1_triplanar = true; m.uv1_world_triplanar = true; m.uv1_scale = Vector3.ONE * 0.125
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_cache[k] = m
	return m

static func _panel_images(seed: int) -> Array:
	var key = "pimg%d" % seed
	if _cache.has(key): return _cache[key]
	var S = 256
	var r = Cosmos.Rng.new(seed * 7 + 3)
	var alb = Image.create(S, S, true, Image.FORMAT_RGB8)
	var hgt = Image.create(S, S, false, Image.FORMAT_L8)
	var rgh = Image.create(S, S, true, Image.FORMAT_RGB8)
	alb.fill(Color8(140, 144, 150)); hgt.fill(Color8(0, 0, 0)); rgh.fill(Color8(0, 170, 120))
	var cols = 4; var rows = 3
	var pw = S / cols; var ph = S / rows
	for j in rows:
		for i in cols:
			var parts = [[0, 0, 1.0, 1.0]]
			var rv = r.next()
			if rv < 0.25: parts = [[0, 0, 1.0, 0.5], [0, 0.5, 1.0, 0.5]]
			elif rv < 0.37: parts = [[0, 0, 0.5, 1.0], [0.5, 0, 0.5, 1.0]]
			for p in parts:
				var x = int(i * pw + p[0] * pw); var y = int(j * ph + p[1] * ph)
				var w = int(pw * p[2]); var h = int(ph * p[3])
				var t = 222 + int((r.next() - 0.5) * 16)
				alb.fill_rect(Rect2i(x + 2, y + 2, w - 4, h - 4), Color8(t, t + 1, t + 3))
				for kk in 6:
					var c = 110 + kk * 24
					hgt.fill_rect(Rect2i(x + 2 + kk, y + 2 + kk, w - 4 - 2 * kk, h - 4 - 2 * kk), Color8(c, c, c))
				rgh.fill_rect(Rect2i(x + 3, y + 3, w - 6, h - 6), Color8(0, int(105 + r.next() * 80), int(40 + r.next() * 70)))
				for f in [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]:
					hgt.fill_rect(Rect2i(f[0] - 3, f[1] - 3, 6, 6), Color8(255, 255, 255))
					alb.fill_rect(Rect2i(f[0] - 2, f[1] - 2, 4, 4), Color8(70, 74, 80))
				if r.next() < 0.12:
					var vx = x + int(w * 0.2); var vy = y + int(h * 0.3); var vw = int(w * 0.6); var vh = int(h * 0.34)
					alb.fill_rect(Rect2i(vx, vy, vw, vh), Color8(38, 42, 48))
					var q = 0
					while q < vh - 3:
						hgt.fill_rect(Rect2i(vx, vy + q, vw, 4), Color8(122, 122, 122))
						hgt.fill_rect(Rect2i(vx, vy + q + 4, vw, 3), Color8(48, 48, 48))
						q += 7
				elif r.next() < 0.12:
					var hx = x + int(w * 0.28); var hy = y + int(h * 0.3)
					hgt.fill_rect(Rect2i(hx - 2, hy - 2, int(w * 0.44) + 4, int(h * 0.34) + 4), Color8(96, 96, 96))
					hgt.fill_rect(Rect2i(hx + 1, hy + 1, int(w * 0.44) - 2, int(h * 0.34) - 2), Color8(208, 208, 208))
				if r.next() < 0.07:
					alb.fill_rect(Rect2i(x + 10, y + h - 22, int(w * 0.34), 7), Color8(230, 160, 40))
	# grime and streaks
	var noise = FastNoiseLite.new(); noise.seed = seed; noise.frequency = 0.024; noise.fractal_octaves = 4
	for y in S:
		for x in S:
			var n = noise.get_noise_2d(x, y) * 0.5 + 0.5
			var g = clampf(1.0 - maxf(0.0, n * 0.55 - 0.08) * 0.5 - float(y % ph) / ph * 0.05, 0, 1)
			var c = alb.get_pixel(x, y)
			alb.set_pixel(x, y, Color(c.r * g, c.g * g, c.b * g * 0.99))
	for i in 90:
		var sx = int(r.next() * S); var sy = int(r.next() * rows) * ph + 6
		for yy in range(sy, min(S, sy + int(ph * (0.25 + r.next() * 0.7)))):
			var c = alb.get_pixel(sx, yy)
			alb.set_pixel(sx, yy, c.darkened(0.08))
	alb.generate_mipmaps(); rgh.generate_mipmaps()
	var nrm = _height_to_normal(hgt, 2.6)
	var out = [ImageTexture.create_from_image(alb), ImageTexture.create_from_image(nrm), ImageTexture.create_from_image(rgh)]
	_cache[key] = out
	return out

static func _height_to_normal(h: Image, strength: float) -> Image:
	var w = h.get_width(); var hh = h.get_height()
	var n = Image.create(w, hh, true, Image.FORMAT_RGB8)
	for y in hh:
		for x in w:
			var dx = (h.get_pixel((x + 1) % w, y).r - h.get_pixel((x - 1 + w) % w, y).r) * strength
			var dy = (h.get_pixel(x, (y + 1) % hh).r - h.get_pixel(x, (y - 1 + hh) % hh).r) * strength
			var v = Vector3(-dx, dy, 1.0).normalized()
			n.set_pixel(x, y, Color(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, v.z * 0.5 + 0.5))
	n.generate_mipmaps()
	return n

## Curtain wall: 4 storeys x 10 bays per 16 m tile, reflective glass, some offices lit.
static func facade(seed: int, tint: Color, warm := true) -> StandardMaterial3D:
	var k = "f%d%s%s" % [seed, tint.to_html(), warm]
	if _cache.has(k): return _cache[k]
	var S = 256
	var r = Cosmos.Rng.new(seed * 13 + 1)
	var alb = Image.create(S, S, true, Image.FORMAT_RGB8)
	var emi = Image.create(S, S, true, Image.FORMAT_RGB8)
	var orm = Image.create(S, S, true, Image.FORMAT_RGB8)
	emi.fill(Color.BLACK)
	var FL = S / 4; var BW = S / 10.0; var spand = int(FL * 0.3)
	var glass: Color = [Color("#1a2430"), Color("#1e2a36"), Color("#18212b")][seed % 3]
	var conc: Color = [Color("#b8b4ac"), Color("#8e939a"), Color("#c8c2b8")][seed % 3]
	for f in 4:
		var y = f * FL
		alb.fill_rect(Rect2i(0, y, S, spand), conc); orm.fill_rect(Rect2i(0, y, S, spand), Color8(255, 210, 10))
		for b in 10:
			var x = int(b * BW)
			alb.fill_rect(Rect2i(x, y + spand, int(BW) + 1, FL - spand), glass)
			orm.fill_rect(Rect2i(x, y + spand, int(BW) + 1, FL - spand), Color8(255, 24, 235))
			if r.next() < (0.38 if warm else 0.3):
				var col = Color(1.0, 0.84, 0.63) if (warm and r.next() < 0.65) else Color(0.78, 0.88, 1.0)
				var kk = 0.45 + r.next() * 0.55
				emi.fill_rect(Rect2i(x + 1, y + spand + 1, int(BW) - 2, FL - spand - 2), col * kk)
		for b in 11:
			var x = int(b * BW)
			alb.fill_rect(Rect2i(max(0, x - 1), y + spand, 2, FL - spand), Color("#7c838c"))
			orm.fill_rect(Rect2i(max(0, x - 1), y + spand, 2, FL - spand), Color8(255, 90, 255))
	alb.generate_mipmaps(); emi.generate_mipmaps(); orm.generate_mipmaps()
	var m = StandardMaterial3D.new()
	m.albedo_color = tint
	m.albedo_texture = ImageTexture.create_from_image(alb)
	m.emission_enabled = true; m.emission_texture = ImageTexture.create_from_image(emi); m.emission_energy_multiplier = 0.2
	m.roughness_texture = ImageTexture.create_from_image(orm); m.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN; m.roughness = 1.0
	m.metallic_texture = m.roughness_texture; m.metallic_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_BLUE; m.metallic = 1.0
	m.uv1_triplanar = true; m.uv1_world_triplanar = true; m.uv1_scale = Vector3.ONE / 16.0
	_cache[k] = m
	return m

static func terrain_material(site: Dictionary) -> ShaderMaterial:
	var sets = {"temperate": ["grass", "dirt", "rocky", "rock"], "arid": ["sand", "cracked", "rocky", "rock"], "regolith": ["rocky", "cracked", "rock", "rocky"],
		"ice": ["ice", "rocky", "rock", "ice"], "dunes": ["sand", "dirt", "rocky", "rock"], "lava": ["rocky", "lava", "rock", "rock"], "terrace": ["grass", "pavers", "rocky", "rock"],
		"ruin": ["rocky", "cracked", "rock", "pavers"], "terminator": ["dirt", "ice", "rocky", "rock"]}
	var id: String = site.get("id", "")
	var b: String = site.get("biome", "")
	var key = "regolith"
	if id == "earth" or b == "jungle" or b == "ocean": key = "temperate"
	elif id == "kepler452_b": key = "terrace"
	elif id == "mars" or b == "desert": key = "arid"
	elif id == "titan": key = "dunes"
	elif id == "europa" or id == "enceladus" or b == "ice" or b == "tundra": key = "ice"
	elif id == "proxima_b": key = "terminator"
	elif b == "lava": key = "lava"
	elif site.get("style", "") == "ruins": key = "ruin"
	var L: Array = sets[key]
	var sh = Shader.new()
	sh.code = """
shader_type spatial;
uniform sampler2D t0 : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t1 : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t2 : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D t3 : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D n2 : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec3 tint = vec3(1.0);
varying vec3 wp; varying vec3 wn;
void vertex(){ wp = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz; wn = normalize((MODEL_MATRIX * vec4(NORMAL,0.0)).xyz); }
vec3 samp(sampler2D t, vec2 uv){ return mix(texture(t, uv * 0.18).rgb, texture(t, uv * 0.031).rgb, 0.35); }
vec3 tri(sampler2D t){ vec3 w = pow(abs(wn), vec3(4.0)); w /= (w.x+w.y+w.z);
  return texture(t, wp.zy*0.12).rgb*w.x + texture(t, wp.xz*0.12).rgb*w.y + texture(t, wp.xy*0.12).rgb*w.z; }
void fragment(){
  vec4 s = COLOR; float tot = s.r+s.g+s.b+s.a+1e-4; s /= tot;
  vec3 c = samp(t0, wp.xz)*s.r + samp(t1, wp.xz)*s.g + tri(t2)*s.b + samp(t3, wp.xz)*s.a;
  ALBEDO = c * tint * 1.25;
  ROUGHNESS = 0.92; METALLIC = 0.0;
  vec3 nt = texture(n2, wp.xz*0.18).rgb;
  NORMAL_MAP = mix(vec3(0.5,0.5,1.0), nt, 0.6);
}
"""
	var m = ShaderMaterial.new()
	m.shader = sh
	for i in 4:
		m.set_shader_parameter("t%d" % i, tex("res://assets/textures/%s_color.jpg" % L[i]))
	var nrm = tex("res://assets/textures/rocky_normal.jpg")
	m.set_shader_parameter("n2", nrm)
	return m

static func water_material(color: Color, lava := false) -> ShaderMaterial:
	var sh = Shader.new()
	sh.code = """
shader_type spatial;
render_mode cull_disabled;
uniform vec3 col : source_color;
uniform bool lava = false;
void fragment(){
  vec2 p = (INV_VIEW_MATRIX * vec4(VERTEX,1.0)).xz;
  float w = sin(p.x*0.35 + TIME*1.3)*0.5 + sin(p.y*0.27 - TIME*1.1)*0.5 + sin((p.x+p.y)*0.8 + TIME*2.0)*0.25;
  ALBEDO = col * (0.8 + w*0.06);
  if (lava) { EMISSION = col * (1.5 + w*0.5); ROUGHNESS = 0.8; }
  else { ROUGHNESS = 0.05; METALLIC = 0.2; SPECULAR = 0.8; }
  NORMAL_MAP = normalize(vec3(0.5 + w*0.06, 0.5 + cos(p.x*0.4+TIME)*0.05, 1.0));
}
"""
	var m = ShaderMaterial.new()
	m.shader = sh
	m.set_shader_parameter("col", color)
	m.set_shader_parameter("lava", lava)
	return m

## A procedural ship: hull, cockpit, engines. Length ~26 m, faces -Z.
static func ship(paint: Color) -> Node3D:
	var root = Node3D.new()
	var hull = panel(paint, 3, 0.75)
	var dark = mat(Color("#2a2e36"), 0.5, 0.7)
	var add = func(mesh: Mesh, pos: Vector3, m: Material, rot := Vector3.ZERO):
		var mi = MeshInstance3D.new(); mi.mesh = mesh; mi.position = pos; mi.rotation = rot; mi.material_override = m
		root.add_child(mi)
		return mi
	var body = BoxMesh.new(); body.size = Vector3(6, 3, 16)
	add.call(body, Vector3(0, 0, 0), hull)
	var nose = PrismMesh.new(); nose.size = Vector3(6, 3, 6)
	add.call(nose, Vector3(0, 0, -11), hull, Vector3(-PI / 2, 0, 0))
	var cock = BoxMesh.new(); cock.size = Vector3(3.4, 1.2, 4)
	var glass = StandardMaterial3D.new(); glass.albedo_color = Color("#1a2a3a"); glass.metallic = 0.9; glass.roughness = 0.05
	add.call(cock, Vector3(0, 1.9, -5), glass)
	for sx in [-1, 1]:
		var wing = BoxMesh.new(); wing.size = Vector3(7, 0.5, 7)
		add.call(wing, Vector3(sx * 6, -0.4, 3), hull)
		var eng = CylinderMesh.new(); eng.top_radius = 1.1; eng.bottom_radius = 1.3; eng.height = 5
		add.call(eng, Vector3(sx * 3.2, 0, 8.5), dark, Vector3(PI / 2, 0, 0))
		var noz = CylinderMesh.new(); noz.top_radius = 0.9; noz.bottom_radius = 0.9; noz.height = 0.2
		add.call(noz, Vector3(sx * 3.2, 0, 11.05), glow(Color("#8fd0e8"), 4.0), Vector3(PI / 2, 0, 0))
	var fin = BoxMesh.new(); fin.size = Vector3(0.4, 3.5, 4)
	add.call(fin, Vector3(0, 3, 6), hull)
	root.set_meta("length", 26.0)
	return root

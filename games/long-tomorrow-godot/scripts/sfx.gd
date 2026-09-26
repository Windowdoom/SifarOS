class_name Sfx
extends Node
## Fully synthesized audio, ported from the original's Web Audio recipes:
## filtered noise bursts and swept oscillators with exponential envelopes.
## Each effect is rendered once to 16-bit PCM and cached; a rain bed and a
## per-world ambience (wind + drone) loop underneath.

const RATE := 22050
static var inst: Sfx
var _cache = {}
var _pool: Array = []
var _rain: AudioStreamPlayer
var _amb: AudioStreamPlayer
var _rain_target = 0.0
var _noise = PackedFloat32Array()

func _ready() -> void:
	inst = self
	var rng = RandomNumberGenerator.new(); rng.seed = 7
	_noise.resize(RATE * 2)
	for i in _noise.size(): _noise[i] = rng.randf() * 2.0 - 1.0
	for i in 16:
		var p = AudioStreamPlayer.new(); add_child(p); _pool.append(p)
	_rain = AudioStreamPlayer.new(); add_child(_rain)
	_rain.stream = _loop(_render_bed(2600.0, 0.4, 7000.0))
	_rain.volume_db = -80
	_amb = AudioStreamPlayer.new(); add_child(_amb)

static func play(name: String, vol := 1.0) -> void:
	if inst == null: return
	inst._play(name, vol)

static func rain_level(level: float) -> void:
	if inst == null: return
	inst._rain_target = level

## Wind and drone bed for a world: wind level, wind cutoff, drone frequencies.
static func ambient(wind: float, wind_freq: float, drones: Array, vol := 0.18) -> void:
	if inst == null: return
	inst._set_ambient(wind, wind_freq, drones, vol)

func _process(delta: float) -> void:
	var cur = db_to_linear(_rain.volume_db) if _rain.playing else 0.0
	var want = _rain_target * 0.5
	cur = move_toward(cur, want, delta / 3.0 * 0.5)
	if cur > 0.001:
		if not _rain.playing: _rain.play()
		_rain.volume_db = linear_to_db(cur)
	elif _rain.playing:
		_rain.stop()

const FILES = {"pistol": "blaster", "shot": "blaster", "rifle": "blaster_repeater", "shotgun": "blaster", "hit": "enemy_hurt", "enemyshot": "enemy_attack", "jump": "jump_a", "land": "land", "ui2": "weapon_change"}

func _play(name: String, vol: float) -> void:
	if not _cache.has(name) and FILES.has(name):
		_cache[name] = load("res://assets/kenney/sounds/%s.ogg" % FILES[name])
	if not _cache.has(name):
		var buf = _render(name)
		if buf.is_empty(): return
		_cache[name] = _wav(buf)
	for p in _pool:
		if not p.playing:
			p.stream = _cache[name]; p.volume_db = linear_to_db(maxf(vol, 0.001)); p.play()
			return

# ── synthesis ────────────────────────────────────────────────────────
class Buf:
	var d = PackedFloat32Array()
	func ensure(n: int) -> void:
		if d.size() < n: d.resize(n)

## Biquad (RBJ cookbook) coefficients for lowpass / highpass / bandpass.
static func _coef(type: String, f: float, q: float) -> Array:
	var w = TAU * clampf(f, 20.0, RATE * 0.45) / RATE
	var alpha = sin(w) / (2.0 * q); var c = cos(w)
	var b0: float; var b1: float; var b2: float
	match type:
		"highpass": b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2
		"bandpass": b0 = alpha; b1 = 0; b2 = -alpha
		_: b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2
	var a0 = 1 + alpha
	return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - alpha) / a0]

func _noise_burst(B: Buf, dur: float, o: Dictionary) -> void:
	var freq: float = o.get("freq", 1200.0); var q: float = o.get("q", 0.8); var type: String = o.get("type", "lowpass")
	var gain: float = o.get("gain", 0.5); var decay: float = o.get("decay", dur); var t0: float = o.get("t0", 0.0); var sweep: float = o.get("sweep", 0.0)
	var start = int(t0 * RATE); var n = int((dur + 0.05) * RATE)
	B.ensure(start + n)
	var x1 = 0.0; var x2 = 0.0; var y1 = 0.0; var y2 = 0.0
	var off = randi() % _noise.size()
	var k = _coef(type, freq, q)
	for i in n:
		var t = float(i) / RATE
		if sweep > 0 and i % 32 == 0:
			var f = freq * pow(maxf(40.0, sweep) / freq, minf(t / dur, 1.0))
			k = _coef(type, f, q)
		var x = _noise[(off + i) % _noise.size()]
		var y: float = k[0] * x + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2
		x2 = x1; x1 = x; y2 = y1; y1 = y
		var g = gain * pow(0.0008 / gain, minf(t / decay, 1.0)) if t < decay else 0.0008
		if t > dur: g = 0.0
		B.d[start + i] += y * g

func _tone(B: Buf, f0: float, dur: float, o: Dictionary) -> void:
	var type: String = o.get("type", "sine"); var gain: float = o.get("gain", 0.3); var f1 = o.get("f1", null)
	var t0: float = o.get("t0", 0.0); var attack: float = o.get("attack", 0.005)
	var start = int(t0 * RATE); var n = int((dur + 0.05) * RATE)
	B.ensure(start + n)
	var ph = 0.0
	for i in n:
		var t = float(i) / RATE
		var f = f0
		if f1 != null: f = f0 * pow(maxf(20.0, float(f1)) / f0, minf(t / dur, 1.0))
		ph += f / RATE
		var p = fmod(ph, 1.0)
		var s = 0.0
		match type:
			"square": s = 1.0 if p < 0.5 else -1.0
			"sawtooth": s = 2.0 * p - 1.0
			"triangle": s = 4.0 * absf(p - 0.5) - 1.0
			_: s = sin(ph * TAU)
		var g = 0.0
		if t < attack: g = gain * t / attack
		elif t < dur: g = gain * pow(0.0008 / gain, (t - attack) / maxf(dur - attack, 1e-4))
		B.d[start + i] += s * g

func _render(name: String) -> PackedFloat32Array:
	var B = Buf.new()
	var nb = func(dur, o): _noise_burst(B, dur, o)
	var tn = func(f, dur, o): _tone(B, f, dur, o)
	match name:
		"pistol", "shot": nb.call(0.25, {"freq": 2400.0, "sweep": 300.0, "gain": 0.55, "decay": 0.2}); tn.call(160.0, 0.12, {"type": "square", "gain": 0.18, "f1": 50.0})
		"rifle": nb.call(0.18, {"freq": 3200.0, "sweep": 500.0, "gain": 0.45, "decay": 0.14}); tn.call(220.0, 0.08, {"type": "sawtooth", "gain": 0.12, "f1": 60.0})
		"shotgun": nb.call(0.5, {"freq": 1600.0, "sweep": 120.0, "gain": 0.8, "decay": 0.45}); tn.call(90.0, 0.3, {"type": "square", "gain": 0.25, "f1": 30.0})
		"laser": tn.call(1800.0, 0.22, {"type": "sawtooth", "gain": 0.14, "f1": 180.0}); tn.call(900.0, 0.22, {"type": "sine", "gain": 0.12, "f1": 120.0})
		"null": tn.call(80.0, 0.8, {"gain": 0.4, "f1": 30.0}); tn.call(2400.0, 0.5, {"type": "triangle", "gain": 0.1, "f1": 40.0}); nb.call(0.6, {"freq": 400.0, "gain": 0.3})
		"enemyshot": nb.call(0.15, {"freq": 1800.0, "sweep": 400.0, "gain": 0.25, "decay": 0.12})
		"hit": tn.call(700.0, 0.06, {"type": "square", "gain": 0.08, "f1": 500.0})
		"hurt": nb.call(0.2, {"freq": 500.0, "gain": 0.3}); tn.call(140.0, 0.2, {"gain": 0.2, "f1": 90.0})
		"explode": nb.call(1.6, {"freq": 900.0, "sweep": 60.0, "gain": 0.9, "decay": 1.5}); tn.call(60.0, 1.2, {"gain": 0.5, "f1": 25.0})
		"step": nb.call(0.07, {"freq": 700.0, "gain": 0.05, "decay": 0.06, "type": "bandpass", "q": 1.5})
		"jump": nb.call(0.15, {"freq": 500.0, "gain": 0.07, "decay": 0.12})
		"land": nb.call(0.14, {"freq": 300.0, "gain": 0.14, "decay": 0.12})
		"ui": tn.call(880.0, 0.07, {"type": "triangle", "gain": 0.08})
		"ui2": tn.call(660.0, 0.08, {"type": "triangle", "gain": 0.08}); tn.call(990.0, 0.1, {"type": "triangle", "gain": 0.07, "t0": 0.05})
		"deny": tn.call(220.0, 0.15, {"type": "square", "gain": 0.07}); tn.call(165.0, 0.18, {"type": "square", "gain": 0.07, "t0": 0.08})
		"pickup": tn.call(1320.0, 0.08, {"gain": 0.1}); tn.call(1760.0, 0.12, {"gain": 0.08, "t0": 0.06})
		"coin": tn.call(1568.0, 0.07, {"type": "square", "gain": 0.05}); tn.call(2093.0, 0.15, {"type": "square", "gain": 0.05, "t0": 0.06})
		"level":
			var fs = [523.0, 659.0, 784.0, 1047.0, 1319.0]
			for i in fs.size(): tn.call(fs[i], 0.45, {"type": "triangle", "gain": 0.12, "t0": i * 0.09})
			tn.call(262.0, 1.2, {"gain": 0.12, "t0": 0.2})
		"quest":
			var fs = [392.0, 523.0, 659.0]
			for i in fs.size(): tn.call(fs[i], 0.6, {"gain": 0.1, "t0": i * 0.14})
		"reload": nb.call(0.06, {"freq": 3000.0, "gain": 0.12, "type": "highpass"}); nb.call(0.06, {"freq": 2000.0, "gain": 0.12, "type": "highpass", "t0": 0.35})
		"empty": tn.call(1200.0, 0.03, {"type": "square", "gain": 0.05})
		"mine": nb.call(0.16, {"freq": 2600.0, "gain": 0.12, "type": "bandpass", "q": 4.0}); tn.call(420.0 + randf() * 80.0, 0.1, {"type": "square", "gain": 0.04})
		"door": nb.call(0.5, {"freq": 600.0, "sweep": 2000.0, "gain": 0.12, "type": "bandpass", "q": 2.0})
		"warp": tn.call(40.0, 4.0, {"type": "sawtooth", "gain": 0.2, "f1": 900.0}); nb.call(4.0, {"freq": 200.0, "sweep": 6000.0, "gain": 0.35, "decay": 4.0})
		"engine": nb.call(0.4, {"freq": 300.0, "gain": 0.1})
		"shield": tn.call(300.0, 0.25, {"gain": 0.12, "f1": 900.0})
		"alarm":
			for t in [0.0, 0.35, 0.7]: tn.call(740.0, 0.25, {"type": "square", "gain": 0.06, "t0": t})
		"thunder":
			nb.call(0.35, {"freq": 3500.0, "sweep": 600.0, "gain": 0.5, "decay": 0.3})
			nb.call(5.0, {"freq": 260.0, "sweep": 45.0, "gain": 0.75, "decay": 4.6, "t0": 0.05})
			nb.call(3.5, {"freq": 120.0, "gain": 0.5, "decay": 3.2, "t0": 0.6})
		"clank": tn.call(420.0 + randf() * 200.0, 0.25, {"type": "triangle", "gain": 0.07, "f1": 260.0}); nb.call(0.12, {"freq": 1800.0, "gain": 0.1, "type": "bandpass", "q": 3.0})
		"splash": nb.call(0.6, {"freq": 1400.0, "sweep": 300.0, "gain": 0.25, "decay": 0.55})
	return B.d

func _render_bed(bp: float, q: float, lp: float) -> PackedFloat32Array:
	var n = RATE * 4
	var out = PackedFloat32Array(); out.resize(n)
	var k1 = _coef("bandpass", bp, q); var k2 = _coef("lowpass", lp, 0.707)
	var s = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
	for pass_i in 2:
		for i in n:
			var x = _noise[i % _noise.size()]
			var y: float = k1[0] * x + k1[1] * s[0] + k1[2] * s[1] - k1[3] * s[2] - k1[4] * s[3]
			s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y
			var z: float = k2[0] * y + k2[1] * s[4] + k2[2] * s[5] - k2[3] * s[6] - k2[4] * s[7]
			s[5] = s[4]; s[4] = y; s[7] = s[6]; s[6] = z
			if pass_i == 1: out[i] = z * 1.6
	return out

func _set_ambient(wind: float, wind_freq: float, drones: Array, vol: float) -> void:
	var n = RATE * 8
	var out = PackedFloat32Array(); out.resize(n)
	if wind > 0:
		var ys = [0.0, 0.0, 0.0, 0.0]
		for i in n:
			var t = float(i) / RATE
			# a slow LFO sweeps the cutoff, as the original's 0.07 Hz wind gust
			var f = wind_freq + sin(t * TAU / 8.0) * wind_freq * 0.6
			if i % 64 == 0: set_meta("_k", _coef("lowpass", maxf(f, 40.0), 0.707))
			var k: Array = get_meta("_k")
			var x = _noise[i % _noise.size()]
			var y: float = k[0] * x + k[1] * ys[0] + k[2] * ys[1] - k[3] * ys[2] - k[4] * ys[3]
			ys[1] = ys[0]; ys[0] = x; ys[3] = ys[2]; ys[2] = y
			out[i] += y * wind
	for j in drones.size():
		var fr = float(drones[j]) * pow(2.0, (j - 1) * 7.0 / 1200.0)
		fr = round(fr * 8.0) / 8.0   # whole cycles over the 8 s loop, so it seams cleanly
		for i in n:
			var ph = fr * float(i) / RATE
			var s = sin(ph * TAU) if j % 2 == 0 else 4.0 * absf(fmod(ph, 1.0) - 0.5) - 1.0
			out[i] += s * 0.05 / (1.0 + j * 0.6)
	_amb.stop()
	_amb.stream = _loop(out)
	_amb.volume_db = linear_to_db(maxf(vol, 0.001) * 2.5)
	_amb.play()

static func _to_pcm(buf: PackedFloat32Array) -> PackedByteArray:
	var pcm = PackedByteArray(); pcm.resize(buf.size() * 2)
	for i in buf.size():
		pcm.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32767.0))
	return pcm

static func _wav(buf: PackedFloat32Array) -> AudioStreamWAV:
	var w = AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS; w.mix_rate = RATE; w.stereo = false
	w.data = _to_pcm(buf)
	return w

static func _loop(buf: PackedFloat32Array) -> AudioStreamWAV:
	var w = _wav(buf)
	w.loop_mode = AudioStreamWAV.LOOP_FORWARD; w.loop_begin = 0; w.loop_end = buf.size()
	return w

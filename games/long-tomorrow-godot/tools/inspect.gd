extends SceneTree
func _initialize():
	for p in ["res://assets/models/xbot.glb"]:
		var s = load(p).instantiate()
		print("== ",p)
		_walk(s, 0)
		var ap = s.find_child("AnimationPlayer", true, false)
		if ap:
			for n in ap.get_animation_list():
				var a = ap.get_animation(n)
				print("anim ", n, " len ", a.length, " tracks ", a.get_track_count(), " t0 ", a.track_get_path(0), " type ", a.track_get_type(0))
		s.free()
	quit()
func _walk(n, d):
	if d < 4:
		var extra = ""
		if n is Skeleton3D:
			extra = " bones=%d b0=%s b1=%s" % [n.get_bone_count(), n.get_bone_name(0), n.get_bone_name(1)]
		print("  ".repeat(d), n.name, " : ", n.get_class(), extra)
		for c in n.get_children(): _walk(c, d + 1)

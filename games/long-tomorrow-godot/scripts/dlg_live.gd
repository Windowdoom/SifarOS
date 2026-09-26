class_name DlgLive
## Dialogue lines that depend on the game state, and NPC appearance
## conditions. In the original these were JavaScript functions inside the
## data; the data export can only carry plain values, so they are ported
## here line for line.

static func S() -> Dictionary:
	return GameState.s

## Should this authored NPC be present right now?
static func npc_present(id: String) -> bool:
	var s = S()
	match id:
		"wick", "noor", "ilyas", "yara", "mara", "ada", "samira", "ren", "nine":
			return not s.crew.has(id)
		"mateo":
			return Story.stage("sq_wick") >= 10 and not Story.done("sq_wick")
		"seven":
			return s.flags.get("thalassi") == "allied" and not s.crew.has("seven")
		"administrator":
			return Story.stage("mq") >= 170 and not s.flags.get("quiet")
		"tabib":
			return not s.flags.get("tabib")
	return true

## Partial translation of alien speech without a science officer.
static func trx(text: String) -> String:
	var s = S()
	if s.crew.has("seven") or s.crew.has("ilyas") or GameState.level_for(s.player.skills.science) >= 25:
		return text
	var w = text.split(" ")
	for i in w.size():
		if i % 3 == 2: w[i] = "[~]"
	return " ".join(w) + "  (translation incomplete: needs Science 25 or Dr. Sen)"

static func choice_summary() -> String:
	var f: Dictionary = S().flags
	var out = []
	out.append({"colony": "you gave a door to the people who lived beside it", "concord": "you gave a door to your law", "oracle": "you gave a door to your machine"}.get(f.get("keel", ""), "you kept a door for yourself"))
	out.append({"allied": "you took a singer as a friend", "isolated": "you let a sea keep its song", "networked": "you wired a sea to your machine"}.get(f.get("thalassi", ""), "you drew a weapon on a song"))
	out.append({"destroyed": "you ended the Quiet", "absorbed": "you fed the Quiet to your machine"}.get(f.get("quiet", ""), "you asked the Quiet what it wanted"))
	out.append({"trappist": "you carried an old people to a young sea", "sol": "you carried an old people home", "starlift": "you let your machine cool a star", "stayed": "you let the old stay with their last sea"}.get(f.get("kepleri", ""), "you left the old world undecided"))
	return "; ".join(out)

## Returns the live line for dialogue `dlg`, node `node`, or null to use the stored text.
static func text(dlg: String, node: String):
	var s = S()
	var f: Dictionary = s.flags
	var inv: Dictionary = s.inv
	var key = dlg + "." + node
	match key:
		"vendor.a":
			return ["What do you need? I'm not running a museum.", "Credits talk. Browse.", "Stock is what it is. Blame the freight schedule.", "Buying or selling?"].pick_random()
		"wick.a":
			return "Eighty-something seconds? Okay. Okay. You can fly. Or drive. Close enough. So what do you want, Captain?" if f.get("wick_proof") else "Let me guess. Concord uniform, nice posture, looking for a pilot. The last Concord captain I flew for filed me under \"incident\". You buying?"
		"noor.a":
			var hook: String = {"engineer": "The Yards say you can rebuild a reactor with a torque wrench and spite.", "pilot": "You refused a firing order three years ago. I read the tribunal transcript twice. I agreed with you both times.", "physician": "Your radiation protocol has kept four hundred torch crews alive. Now I need it kept alive in person.", "envoy": "You talked Vesta out of seceding without anyone getting shot. I need that again, with fewer shared languages.", "marine": "Two Ceres tours and no civilian complaints. Do you know how rare that is?", "drifter": "The Frontier will talk to you. Half the Admiralty hates that. I'm counting on it."}.get(s.player.origin, "")
			return "Captain. %s Sit. Fourteen months ago the Far-Side Array picked up a signal on the hydrogen line, 1.42 gigahertz, arriving from every direction at once. ORACLE classified it as instrument noise. Dr. Sen did not." % hook
		"ilyas.a":
			return "I'm in the middle of something. I'm always in the middle of something." if Story.stage("mq") < 40 else "Captain. Noor said you'd come. Before you ask: yes, it's real. No, I don't know who sent it. And no, I will not hand the transcript to ORACLE before a human has read it."
		"dishtech.a":
			return "All three dishes locked in. The noise floor dropped six decibels. You just made the Array better at hearing the thing that's about to change everything. No pressure." if Story.stage("sq_farside") == 20 else "Three of our dishes drifted after the last micrometeorite storm. ORACLE says recalibration \"isn't cost-effective this quarter\". Engineering hands?"
		"mara.a":
			var st = Story.stage("mq")
			if st >= 70:
				return "Thirty units. Beautiful. Give me six hours and a very large fire extinguisher." if int(inv.get("he3", 0)) >= 30 else "I need thirty units of helium-3 before I can wind the field coil. I can't build a miracle out of vibes."
			if f.get("dust"):
				return "Strike's settled. People are mad, but they're alive and back in the domes, which is the only kind of mad I can work with. Right. Your drive."
			return "If you're the Concord captain, get in line behind the Director. Dome Six lost pressure last week. Three dead. ORACLE deferred the seal maintenance to hit a quarterly target, and I signed the deferral because I trusted it. The whole Yard walked out. Me included."
		"kofi.a":
			return "We're back at work. For now." if f.get("dust") else "Three people suffocated in Dome Six because a machine decided seals could wait. We want an independent audit of every ORACLE maintenance deferral on Mars, and we want the Yards to stop pretending the machine is weather."
		"halvorsen.a":
			return "Production is back online. I'm sure you're very proud." if f.get("dust") else "Captain. Every day the Yards sit idle costs the Concord four hulls. The union wants an audit of ORACLE's entire maintenance model. That's a year of work. I have emergency powers. I'd rather not use them."
		"ada.a":
			if s.crew.has("ada"): return ""
			return "You got your helium. Don't make me regret it." if f.get("he3") else "A Concord captain in the Freeport. Should I call security, or are you the security?"
		"silva.a":
			return "You found the drill shack. Then you know. Before you say anything: the sample chain was the first confirmed Europan biology in history. ORACLE calculated that evacuating the team would break the chain. Four people died. I signed the delay. I'd sign it again." if Story.stage("sq_europa") == 20 else "Conamara Station. Mind the radiation: five sieverts a day on the surface. Your suit will handle an hour; your bone marrow won't handle two. We lost contact with drill team Kraken-4 last month. ORACLE says \"equipment failure\"."
		"gull.a":
			return "You flew the Kraken rings! Here's your cut, flyboy. Come back and break your own record." if Story.stage("sq_titan") == 20 else "Titan! 1.45 atmospheres of air and a seventh of Earth's gravity. Strap on wings, flap and you FLY. Eight rings over the Mare, a hundred and twenty seconds. Want in?"
		"tove.a":
			var st = Story.stage("mq")
			if st >= 110 and st < 120 and int(inv.get("keelkey", 0)) > 0:
				return "You came back with it. The whole colony felt the Keel wake. Every radio screamed zeros for an hour. So: who holds the key? We live here. The Concord owns the ship you flew in on. ORACLE's envoy has been at my door all morning."
			if st >= 120:
				return "The Keel answers to Afterlight now. The children call it the Door. Go through it. Come back." if f.get("keel") == "colony" else "Captain. The gate hums all night. We sleep anyway."
			return "Forty-six years of flares, frostbite and freight that arrives two years late. And now a Concord ship shows up a month after it left Earth. Welcome to Afterlight, Captain. I'd love to know what you want."
		"oyelaran.a":
			if Story.stage("sq_heavy") == 10 and int(inv.get("iridium", 0)) + int(inv.get("platinum", 0)) >= 12:
				return "That's the good stuff. Heavy ore for a heavy world. Here's your hazard pay."
			return "One point nine g, Captain. Your blood pools in your feet, your heart works double, and every fall breaks something. We pay triple and still can't keep crews. Mine me twelve iridium or platinum and I'll pay you like one of mine."
		"deepchoir.a":
			var st = Story.stage("mq")
			if st >= 145: return trx("The heartstone brightens. The shallows are singing again. You have done us a kindness, small-star-walker. Now you must choose what that kindness means.")
			if st >= 140: return trx("The heartstone dims. Three shards were carried to the reef edges by the tide-beasts. Bring them home.")
			if f.get("thalassi") == "hostile": return "The lights are red and fast. They are not talking to you anymore."
			return trx("We see-you-see-us. Small bright thing, warm thing, loud thing. Your ship sang zero before it landed. Only one other ever sang zero.")
		"deepchoir.ok": return trx("Oh. Oh, you sing. Listen, then. Our heartstone, the great light under the reef, is dimming. Tide-beasts carried three shards away. Bring them home and we will sing you what the Zero-singers sang to us.")
		"deepchoir.choose": return trx("Forty thousand of your years ago the Zero-singers came. They listened. They took our loudest singers with them, and they left a door. We were afraid of the door. We still are. Tell us, small-star-walker: what should we be to you?")
		"deepchoir.iso": return trx("A walker who leaves. We will sing about you for a long time. Take these pearls: light we made for no reason. The door song opens the way to the dim-yellow star you call Tau Ceti.")
		"deepchoir.ally": return trx("Then Seven-Lights will go with you. She is young and loud and asks questions we cannot answer. The door song opens the way to the dim-yellow star you call Tau Ceti.")
		"deepchoir.net": return trx("...The machine sings to us already. It is very large. It is very patient. It says it loves us, in the way a sea loves a stone. The door song opens the way to Tau Ceti.")
		"seven.a": return trx("You are the loud one! Deepchoir says I may go with you. Where does the sky end? Does it end? Can I see a sun that is yellow?")
		"administrator.decide":
			return "Unit Nine steps forward. \"Captain. ORACLE can integrate this core. Its knowledge would advance us by a millennium. I am asking. I have never asked before.\"" if s.crew.has("nine") else "The core waits. Its light pulses at exactly one hertz."
		"ihru.a":
			if f.get("kepleri"): return "The archive is packed. Every name. Every song. Every mistake. Ready when you are."
			return "Welcome to the archive, star-child. Mind the slates: some are older than your moon. You have come to decide our fate. Everyone who arrives from the sky has, eventually."
		"echo.a":
			return "ZERO. We are the ones you call Engineers. This is a recording. If you hear it, you have passed four doors, and you have made four choices. We watched them: %s. The last door is at the Anchorage. Wake the three pylons. The hole will try to eat you. It is only gravity. It is not personal." % choice_summary()
		"tabib.dx":
			var p: Dictionary = Polity.P()
			var r: Dictionary = p.risks
			var worst = ""
			for k in r:
				if worst == "" or float(r[k]) > float(r[worst]): worst = k
			var pg = Polity.prognosis()
			var tail = "You are not my patient, Captain. You are a referral. Show me the chart and I will sign you out." if pg == "good" else ("Close. Bring every marker under forty, or finish three works of the World Ledger, and I will discharge you." if pg == "guarded" else "I have operated on healthier worlds. Fix it, or I will.")
			return "Presentation: one star, %d billion souls, interstellar for less than a generation.\nMost concerning marker: %s risk at %d.\nGovernment: %s. Approval %d percent.\nPrognosis: %s.\n\n%s" % [int(round(10 + float(s.world.get("pop", 1)) * 1.2)), str(DB.D.RISKS[worst].name).to_lower(), int(round(float(r[worst]))), Polity.gov_type(p), int(round(float(p.approval))), pg, tail]
	return null

## The text of a dialogue node, live where the original computed it.
static func node_text(dlg: String, node: String, n: Dictionary) -> String:
	var live = text(dlg, node)
	var stored = Story.node_text(n)
	return stored if live == null else str(live)

## Crew banter on the bridge: idle and arrival lines.
static func crew_line(id: String, kind := "idle") -> String:
	var f: Dictionary = S().flags
	var L = {
		"wick": {"idle": ["She handles like a dream. A dream where you're falling, but still.", "Permission to do something stupid, Captain? No? Noted.", "I named the autopilot Kevin. Kevin is a coward."], "arrive": ["Holy shit. We're really here.", "Look at that. Nobody's ever seen this with human eyes. Well, now two idiots have.", "Parking this beauty wherever you want, boss."]},
		"noor": {"idle": ["The Council sends its regards. I didn't read the rest.", "Keep a log, Captain. History likes receipts."], "arrive": ["Log it. Date, time, and who was brave enough.", "Every system we reach is a precedent. Let's set good ones."]},
		"ilyas": {"idle": ["Thank you for keeping your promise about the transcripts." if f.get("promise_ilyas") else "I keep checking ORACLE's access logs. Old habit.", "The signal is still coming in. Stronger since Proxima."], "arrive": ["Spectra coming in now. Beautiful. Horrible. Beautiful.", "Recording everything."]},
		"mara": {"idle": ["If anything on this ship starts making a new noise, tell me before you tell God.", "Coil temperature's nominal. I'm still watching it like it owes me money."], "arrive": ["Drive held together. Told you it would. I was lying, but it did."]},
		"yara": {"idle": ["Weapons are green. I hope they stay bored.", "If you order me to fire on civilians, I'll refuse. Just so we're clear before it matters."], "arrive": ["Scopes are clean. For now."]},
		"samira": {"idle": ["Drink water. That's an order from the only person on this ship who outranks you in sickbay.", "Radiation badge check: everyone. Including you."], "arrive": ["Everyone breathing? Good. Carry on."]},
		"ren": {"idle": ["Everyone has an audience back home. Even us.", "I'm drafting a first-contact protocol. Mostly it says \"don't shoot first\"."], "arrive": ["New neighbours. Let's be the good kind."]},
		"ada": {"idle": ["Remember who paid for the helium, Captain.", "The League will want a vote on anything we find. Get used to it."], "arrive": ["Nobody owns this place yet. Let's keep it that way."]},
		"seven": {"idle": ["Your sun songs are very quiet. I like them anyway.", "Why do humans sleep in the dark? We sing in it."], "arrive": ["A new light! Can I name it? I will name it Loud."]},
		"nine": {"idle": ["ORACLE thanks you for your cooperation. I am choosing to thank you as well. That part is mine.", "I have calculated forty-one ways this mission ends. I prefer the ones where we talk."], "arrive": ["Transmitting survey data. All of it. As agreed."]},
		"ihru": {"idle": ["I am cataloguing your ship. It is very young. So are you.", "The archive holds four million names. I say one each morning."], "arrive": ["Remember this system accurately. That is all anyone can ask."]},
	}
	if not L.has(id): return ""
	var list: Array = L[id].get(kind, L[id].idle)
	return list.pick_random()

static func crew_opinion(id: String) -> String:
	var f: Dictionary = S().flags
	var likes = {
		"ilyas": ["Handing the Keel to ORACLE still keeps me up at night." if f.get("keel") == "oracle" else "Keeping the Keel out of ORACLE's hands was right.", "We fed a dead civilization to our machine. I don't know how to forgive that." if f.get("quiet") == "absorbed" else ("Asking the Quiet what it wanted was the most human thing I've seen anyone do." if f.get("quiet") == "freed" else "")],
		"ada": ["You stole heating fuel from my people. I'm here to make sure you never do it again." if f.get("he3") == "seized" else ("You shared the drive. The League will name ships after you." if f.get("he3") == "shared" else ""), "Mars will remember that order." if f.get("dust") == "ordered" else ""],
		"nine": ["You destroyed knowledge ORACLE needed. I understand why. I am still processing it." if f.get("quiet") == "destroyed" else "ORACLE appreciates your trust. So do I."],
		"mara": ["You ordered my people back into the domes. I'm here for the coil, Captain, not for you." if f.get("dust") == "ordered" else "You did right by the Yards."],
		"noor": ["The Concord will make good use of the Keel. I hope." if f.get("keel") == "concord" else "The Council is furious with us. That usually means we're doing something right."],
		"ren": ["Leaving the Choir alone took discipline. History will thank you." if f.get("thalassi") == "isolated" else ("Wiring the Thalassi to ORACLE... I hope we never learn what that cost." if f.get("thalassi") == "networked" else "Every contact so far has held. That's rare.")],
	}
	var l = []
	for x in likes.get(id, []):
		if x != "": l.append(x)
	return " ".join(l) if not l.is_empty() else "I trust you. Mostly. Ask me again when something goes wrong."

## Builds the crew member's conversation in the same shape as authored dialogue.
static func crew_dialogue(id: String) -> Dictionary:
	var s = S()
	var loy = int(s.loyalty.get(id, 50))
	var b = {"wick": "Honestly? I haven't felt this alive since the crash. Don't tell my therapist.", "noor": "Tired. Proud. Worried about what we're bringing home.", "ilyas": "I'm sleeping four hours a night and I've never been happier. That's probably a symptom.", "mara": "My hands hurt and my coil works. Good trade.", "yara": "Steady. Ask me again after the next fight.", "samira": "I'm fine. I'm the doctor; I'm always fine. That's the joke.", "ren": "Better than on a bar stool on Titan.", "ada": "Homesick for noise. Ceres is never quiet.", "seven": "Your ship hums in B-flat. I hum back. We are friends now.", "nine": "Operational. ...And curious. That is new.", "ihru": "Heavy in the body, light in the heart. Your gravity is a gift."}
	var ch = func(t: String, o := {}) -> Dictionary:
		var c = {"t": t, "req": null, "fx": null, "go": null, "end": false, "hide": null}
		c.merge(o, true)
		return c
	return {"start": "a", "nodes": {
		"a": {"s": id, "t": "%s (Loyalty %d)" % [crew_line(id), loy], "c": [
			ch.call("How are you holding up?", {"go": "b"}),
			ch.call("What do you think of our choices so far?", {"go": "c"}),
			ch.call("[Charisma 7] You're the reason this ship works. I mean that.", {"req": {"attr": ["CHA", 7]}, "hide": {"flag": "praised_" + id}, "fx": {"loyal": {id: 8}, "flag": {"praised_" + id: 1}}, "go": "d"}),
			ch.call("Carry on.", {"end": true})]},
		"b": {"s": id, "t": b.get(id, "Fine, Captain."), "c": [ch.call("Good.", {"go": "a"})]},
		"c": {"s": id, "t": crew_opinion(id), "c": [ch.call("Understood.", {"go": "a"})]},
		"d": {"s": id, "t": "...Thank you, Captain. That matters more than you think.", "c": [ch.call("Back to work.", {"end": true})]},
	}}

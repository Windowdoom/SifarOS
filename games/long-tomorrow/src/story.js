/* ═══════════════════════════════════════════════════════════════════════
   STORY · quests, dialogue, cutscenes, contracts, world simulation, endings
   Mature language throughout (toggle in Settings → Language filter).
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Named characters placed in the world ── */
const NPCS={
  // Earth
  wick:{name:'Tomás "Wick" Arreola',role:'Washed-up racing pilot',site:'earth',poi:'bar',dlg:'wick',crew:'wick',cond:s=>!s.crew.includes('wick')},
  vendor_earth:{name:'Priya Ghosh',role:'Arcology outfitter',site:'earth',poi:'shop',dlg:'vendor',shop:'market'},
  yard_earth:{name:'Lars Eriksen',role:'Concord hull broker',site:'earth',poi:'yard',dlg:'yardboss',shop:'shipyard'},
  clinic_earth:{name:'Dr. Hana Kim',role:'Arcology clinic',site:'earth',poi:'clinic',dlg:'clinic'},
  fixer_earth:{name:'Rashid "Nine-Lives" Farouk',role:'Fixer',site:'earth',poi:'garage',dlg:'fixer'},
  // Luna
  noor:{name:'Commodore Noor Rahman',role:'Concord Navy',site:'luna',poi:'hall',dlg:'noor',crew:'noor',cond:s=>!s.crew.includes('noor')},
  ilyas:{name:'Dr. Ilyas Sen',role:'Far-Side Array',site:'luna',poi:'array',dlg:'ilyas',crew:'ilyas',cond:s=>!s.crew.includes('ilyas')},
  yara:{name:'Lt. Yara Haddad',role:'Navy tactical instructor',site:'luna',poi:'range',dlg:'yara',crew:'yara',cond:s=>!s.crew.includes('yara')},
  vendor_luna:{name:'Chief Petty Officer Osei',role:'Base quartermaster',site:'luna',poi:'shop',dlg:'vendor',shop:'market'},
  dishtech:{name:'Grace Mensah',role:'Array technician',site:'luna',poi:'plaza',dlg:'dishtech'},
  // Mars
  mara:{name:'Mara Voss',role:'Chief engineer, Dome Six',site:'mars',poi:'yard',dlg:'mara',crew:'mara',cond:s=>!s.crew.includes('mara')},
  kofi:{name:'Kofi Mensah',role:'Dust Union steward',site:'mars',poi:'union',dlg:'kofi'},
  halvorsen:{name:'Director Ingrid Halvorsen',role:'Concord Yards contractor',site:'mars',poi:'office',dlg:'halvorsen'},
  vendor_mars:{name:'Omar Qureshi',role:'Parts and ore trader',site:'mars',poi:'shop',dlg:'vendor',shop:'market'},
  crafter_mars:{name:'Wanjiru Dlamini',role:'Fabrication bay',site:'mars',poi:'fab',dlg:'crafter',shop:'crafting'},
  // Ceres
  ada:{name:'Ada Okoro',role:'Speaker, Frontier League',site:'ceres',poi:'hall',dlg:'ada',crew:'ada',cond:s=>!s.crew.includes('ada')},
  mateo:{name:'Mateo Arreola',role:'Wick\'s little brother',site:'ceres',poi:'bar',dlg:'mateo',cond:s=>Story.stage(s,'sq_wick')>=10&&!Story.done(s,'sq_wick')},
  vendor_ceres:{name:'Leila Nakamura',role:'Freeport exchange',site:'ceres',poi:'shop',dlg:'vendor',shop:'market'},
  fence_ceres:{name:'"Dutch" Varga',role:'Fence',site:'ceres',poi:'depot',dlg:'fence',shop:'black'},
  // Europa
  director_eu:{name:'Director Paulo Silva',role:'Conamara Station',site:'europa',poi:'lab',dlg:'silva'},
  samira:{name:'Dr. Samira Qadir',role:'Station physician',site:'europa',poi:'clinic',dlg:'samira',crew:'samira',cond:s=>!s.crew.includes('samira')},
  vendor_eu:{name:'Inés Castillo',role:'Supply clerk',site:'europa',poi:'shop',dlg:'vendor',shop:'market'},
  // Titan
  ren:{name:'Ren Sato',role:'Concord envoy (suspended)',site:'titan',poi:'bar',dlg:'ren',crew:'ren',cond:s=>!s.crew.includes('ren')},
  racer:{name:'Zainab "Gull" Usman',role:'Wing-racing bookie',site:'titan',poi:'rings',dlg:'gull'},
  vendor_ti:{name:'Dmitri Petrov',role:'Refinery store',site:'titan',poi:'shop',dlg:'vendor',shop:'market'},
  // Proxima
  tove:{name:'Governor Tove Lindqvist',role:'Afterlight Colony',site:'proxima_b',poi:'hall',dlg:'tove'},
  nine:{name:'Unit Nine',role:'ORACLE envoy',site:'proxima_b',poi:'kiosk',dlg:'nine',crew:'nine',alien:'android',cond:s=>!s.crew.includes('nine')},
  vendor_px:{name:'Jonah Achebe',role:'Colony stores',site:'proxima_b',poi:'shop',dlg:'vendor',shop:'market'},
  clinic_px:{name:'Nurse Esi Osei',role:'Flare clinic',site:'proxima_b',poi:'clinic',dlg:'clinic'},
  crafter_px:{name:'Farid Baig',role:'Colony workshop',site:'proxima_b',poi:'fab',dlg:'crafter',shop:'crafting'},
  // LHS 1140 b
  oyelaran:{name:'"Big" Oyelaran',role:'Deepwell foreman',site:'lhs1140_b',poi:'rig',dlg:'oyelaran'},
  vendor_lhs:{name:'Kamran Malik',role:'Rig commissary',site:'lhs1140_b',poi:'shop',dlg:'vendor',shop:'market'},
  // TRAPPIST-1e
  deepchoir:{name:'Deepchoir',role:'Elder of the Thalassi Choir',site:'trappist_e',poi:'plaza',dlg:'deepchoir',alien:'thalassi'},
  seven:{name:'Seven-Lights',role:'Young singer',site:'trappist_e',poi:'heart',dlg:'seven',crew:'seven',alien:'thalassi',cond:s=>s.flags.thalassi==='allied'&&!s.crew.includes('seven')},
  // Tau Ceti f
  administrator:{name:'The Administrator',role:'The Quiet Core',site:'tauceti_f',poi:'core',dlg:'administrator',alien:'machine',cond:s=>Story.stage(s,'mq')>=170&&!s.flags.quiet},
  // Kepler-452b
  ihru:{name:'Ihru of the Terraces',role:'Kepleri archivist',site:'kepler452_b',poi:'archive',dlg:'ihru',crew:'ihru',alien:'kepleri'},
  council:{name:'Speaker Ohm-Tessaly',role:'Elder Council',site:'kepler452_b',poi:'hall',dlg:'council',alien:'kepleri'},
  vendor_kp:{name:'Trader Vesh',role:'Terrace market',site:'kepler452_b',poi:'shop',dlg:'vendor',shop:'market',alien:'kepleri'},
  // Throat & Anchorage
  echo:{name:'Engineer Echo',role:'Recorded presence',site:'throat',poi:'plaza',dlg:'echo',alien:'engineer'},
  custodian:{name:'The Custodian',role:'Last of the Engineers',site:'anchorage',poi:'custodian',dlg:'custodian',alien:'engineer'},
};

/* ── Main quest & authored side quests ── */
const QUESTS={
  mq:{name:'The Null Signal',main:true,stages:{
    10:{text:'Board your ship on the New Geneva landing pad.',target:{site:'earth',poi:'pad'},on:{ev:'board'},next:20},
    20:{text:'Take off, fly to Luna and land at Shackleton Base.',target:{system:'sol',body:'luna'},on:{ev:'land',site:'luna'},next:30},
    30:{text:'Report to Commodore Noor Rahman in the Shackleton command hall.',target:{site:'luna',npc:'noor'}},
    40:{text:'Recruit Dr. Ilyas Sen at the Far-Side Array building.',target:{site:'luna',npc:'ilyas'}},
    50:{text:'Fly to Mars. Find Chief Engineer Mara Voss at the Tharsis Yards.',target:{site:'mars',npc:'mara'}},
    55:{text:'Settle the Dust Union strike so Mara can leave. Talk to Kofi Mensah and Director Halvorsen.',target:{site:'mars',npc:'kofi'}},
    60:{text:'Acquire 30 units of Helium-3. Buy or bargain at Ceres, or scoop it from Jupiter or Saturn with a mining laser.',target:{site:'ceres',npc:'ada'},have:{item:'he3',n:30}},
    70:{text:'Bring the Helium-3 to Mara at the Tharsis Yards.',target:{site:'mars',npc:'mara'}},
    80:{text:'Open the Star Map (M) aboard your ship and jump to Alpha Centauri.',target:{system:'alphacen'},on:{ev:'system',system:'alphacen'},next:90},
    90:{text:'Land at Afterlight Colony on Proxima b. Speak with Governor Lindqvist.',target:{site:'proxima_b',npc:'tove'}},
    100:{text:'Cross the nightside ice to the Keel excavation.',target:{site:'proxima_b',poi:'keel'},interact:{poi:'keel',label:'Touch the Keel',hold:2.5,fx:{cut:'keel',give:{keelkey:1},stage:['mq',110]}},spawn:{poi:'keel',type:'crawler',n:6}},
    110:{text:'Return to Afterlight and decide who controls the Keel.',target:{site:'proxima_b',npc:'tove'}},
    120:{text:'Fly through the Keel Gate in Proxima orbit to reach TRAPPIST-1.',target:{system:'alphacen',body:'keelgate'},on:{ev:'system',system:'trappist'},next:130},
    130:{text:'Land on TRAPPIST-1e and find the source of the lights.',target:{site:'trappist_e',npc:'deepchoir'}},
    140:{text:'Recover three resonance shards from the reef edges for the Choir\'s heartstone.',target:{site:'trappist_e',poi:'shard1'},collect:{item:'shard',n:3},spawn:{poi:'shard1',type:'stinger',n:3}},
    145:{text:'Bring the shards back to Deepchoir.',target:{site:'trappist_e',npc:'deepchoir'}},
    150:{text:'Take the TRAPPIST gate to Tau Ceti.',target:{system:'trappist',body:'trgate'},on:{ev:'system',system:'tauceti'},next:160},
    160:{text:'Search the Quiet on Tau Ceti f. Recover three archive logs from the towers.',target:{site:'tauceti_f',poi:'tower1'},collect:{item:'quietlog',n:3},spawn:{poi:'tower1',type:'sentinel',n:2},next:170},
    170:{text:'Enter the central spire and face the Quiet Core.',target:{site:'tauceti_f',npc:'administrator'}},
    180:{text:'Take the Tau Ceti gate to Kepler-452.',target:{system:'tauceti',body:'taugate'},on:{ev:'system',system:'kepler452'},next:190},
    190:{text:'Land at the Terraces of Ihru and meet the Kepleri Elder Council.',target:{site:'kepler452_b',npc:'council'}},
    200:{text:'Decide how, or whether, the Kepleri survive the Brightening. Speak with Ihru in the archive.',target:{site:'kepler452_b',npc:'ihru'}},
    210:{text:'Use the Elder Chart: take the Kepler gate to Sagittarius A*.',target:{system:'kepler452',body:'kgate'},on:{ev:'system',system:'sgra'},next:220},
    220:{text:'Land on the Throat.',target:{system:'sgra',body:'throat'},on:{ev:'land',site:'throat'},next:225},
    225:{text:'Hear what the Engineer echo has to say.',target:{site:'throat',npc:'echo'}},
    230:{text:'Wake the three pylons and hold the platform until the Andromeda gate opens.',target:{site:'throat',poi:'pylon1'},collect:{flagCount:['pylon',3]},spawn:{poi:'plaza',type:'construct',n:4}},
    240:{text:'Jump the Throat Gate to Andromeda and land on the Anchorage.',target:{system:'m31',body:'anchorage'},on:{ev:'land',site:'anchorage'},next:245},
    245:{text:'Walk the Anchorage. Find the Custodian.',target:{site:'anchorage',npc:'custodian'}},
    250:{text:'The story is told. The universe is still yours. Free play continues.',target:null},
  }},
  sq_courier:{name:'Hot Wheels, Cold Cash',site:'earth',stages:{
    10:{text:'Take Farouk\'s hovercar from the garage and get it to the drop in the east towers in under 100 seconds.',target:{site:'earth',poi:'garage'},drive:{from:'garage',to:'dest',time:100},fx:{credits:900,xp:{piloting:900},stage:['sq_courier',20],flag:{wick_proof:1}}},
    20:{text:'Tell Wick the car is delivered.',target:{site:'earth',npc:'wick'}},
    30:{text:'Done.',target:null}}},
  sq_farside:{name:'Far Side Static',site:'luna',stages:{
    10:{text:'Recalibrate three Far-Side Array dishes (Engineering 5).',target:{site:'luna',poi:'dish1'},collect:{flagCount:['dish',3]},next:20},
    20:{text:'Report to Grace Mensah.',target:{site:'luna',npc:'dishtech'}},
    30:{text:'Done.',target:null}}},
  sq_europa:{name:'Under the Ice',site:'europa',stages:{
    10:{text:'Find what happened to drill team Kraken-4 at the old drill site.',target:{site:'europa',poi:'drillsite'},interact:{poi:'drillsite',label:'Search the drill shack',hold:2,fx:{give:{drillmemo:1},stage:['sq_europa',20],cut:'drill'}},spawn:{poi:'drillsite',type:'rogueDrone',n:3}},
    20:{text:'The memo shows ORACLE delayed the evacuation to protect the sample chain. Decide what to do with it.',target:{site:'europa',npc:'director_eu'}},
    30:{text:'Done.',target:null}}},
  sq_titan:{name:'Wings over Kraken',site:'titan',stages:{
    10:{text:'Strap on wings and fly through all eight rings over Kraken Mare in 120 seconds. Hold Jump in the air to glide.',target:{site:'titan',poi:'rings'},rings:{poi:'rings',n:8,time:120},fx:{credits:1500,xp:{piloting:1500},stage:['sq_titan',20]}},
    20:{text:'Collect your winnings from Gull.',target:{site:'titan',npc:'racer'}},
    30:{text:'Done.',target:null}}},
  sq_flare:{name:'Flare Season',site:'proxima_b',stages:{
    10:{text:'A superflare hits in 90 seconds. Reach the three stranded farmers and send them to shelter.',target:{site:'proxima_b',poi:'strand1'},collect:{flagCount:['strand',3]},timer:90,fail:'The flare hit before everyone reached shelter. Talk to Governor Lindqvist.',next:20},
    20:{text:'Report to Governor Lindqvist.',target:{site:'proxima_b',npc:'tove'}},
    30:{text:'Done.',target:null}}},
  sq_heavy:{name:'Heavy Water',site:'lhs1140_b',stages:{
    10:{text:'Mine 12 iridium or platinum ore for Big Oyelaran. The veins are past the rigs.',target:{site:'lhs1140_b',poi:'vein'},haveAny:{items:['iridium','platinum'],n:12}},
    20:{text:'Done.',target:null}}},
  sq_wick:{name:'Blood Money',site:'ceres',stages:{
    10:{text:'Wick\'s brother Mateo owes the Syndicate. Find him in the Occator bar.',target:{site:'ceres',npc:'mateo'}},
    20:{text:'Deal with the Syndicate collectors outside the Occator bar.',target:{site:'ceres',poi:'bar'},kill:{tag:'collector',n:4},spawn:{poi:'bar',type:'raider',n:4,tag:'collector'},fx:{loyal:{wick:20},xp:{combat:1200},stage:['sq_wick',30]}},
    30:{text:'Done.',target:null}}},
  sq_dust:{name:'Dust Union',site:'mars',stages:{
    10:{text:'Hear both sides of the strike: Kofi Mensah (union) and Director Halvorsen.',target:{site:'mars',npc:'kofi'}},
    20:{text:'Done.',target:null}}},
  sq_barnard:{name:'Debt of Honour',site:'barnard',stages:{
    10:{text:'Mother Kessane wants a Concord ore convoy hit in Barnard\'s Star. Or you could warn the convoy and hit her raiders instead.',target:{system:'barnard'},space:{tag:'convoy',n:3,hull:'mule',faction:'concord'}},
    20:{text:'Return to Barnard Deep for payment.',target:{system:'barnard',body:'deep'}},
    30:{text:'Done.',target:null}}},
};

/* ── Dialogue ──
   node: {s:speakerId|name, t:text | fn(state)->text, c:[choice]}
   choice: {t, req, fx, go, end, hide}
   req: {skill:[id,lv], attr:[id,v], flag, item:[id,n], credits, origin, crew, rep:[f,v], stage:[q,s], stageMin:[q,s], any:[req...]}
   fx:  {rep, flag, xp, give, take, credits, stage:[q,s], start:q, crew, loyal, cut, fn, shop, fight, unlock, heal} */
const DLG={};
const say=(s,t,c)=>({s,t,c});
const ch=(t,o={})=>Object.assign({t},o);

/* generic */
DLG.vendor={start:'a',nodes:{a:say(null,s=>U.pick(Math.random,['What do you need? I\'m not running a museum.','Credits talk. Browse.','Stock is what it is. Blame the freight schedule.','Buying or selling?'])+'',[ch('Show me what you have.',{fx:{shop:'market'},end:1}),ch('Any work going?',{fx:{shop:'jobs'},end:1}),ch('Never mind.',{end:1})])}};
DLG.yardboss={start:'a',nodes:{a:say(null,'Every hull on this lot is Concord-certified. Every warranty is void the moment you jump past Sol. Sign here.',[ch('Show me hulls.',{fx:{shop:'shipyard'},end:1}),ch('Outfitting.',{fx:{shop:'outfitter'},end:1}),ch('Just looking.',{end:1})])}};
DLG.crafter={start:'a',nodes:{a:say(null,'Bring me ore and I\'ll print you a module. Bring me excuses and I\'ll print you a receipt for excuses.',[ch('Open the fabricator.',{fx:{shop:'crafting'},end:1}),ch('Later.',{end:1})])}};
DLG.clinic={start:'a',nodes:{a:say(null,'Sit. What hurts? Actually, don\'t answer. Everything hurts out here.',[ch('Patch me up. (100 cr)',{req:{credits:100},fx:{credits:-100,heal:1},go:'b'}),ch('Sell me trauma kits.',{fx:{shop:'market'},end:1}),ch('I\'m fine.',{end:1})]),
  b:say(null,'Done. Sutures dissolve in a week. Try not to get shot before then.',[ch('Thanks.',{end:1})])}};
DLG.fence={start:'a',nodes:{a:say(null,'I don\'t know you. You don\'t know me. Whatever you\'re carrying, I\'ve never heard of it, and I\'ll pay sixty percent.',[ch('Let\'s trade.',{fx:{shop:'black'},end:1}),ch('Wrong door.',{end:1})])}};
DLG.fixer={start:'a',nodes:{
  a:say(null,'You\'re the captain Wick keeps not-talking about. I need a car moved across town, fast, no questions. Security loves hovercars that go above the speed line.',[
    ch('I\'ll do it.',{req:{stage:['sq_courier',0]},fx:{start:'sq_courier'},go:'b'}),
    ch('How fast is fast?',{go:'c'}),ch('Not my problem.',{end:1})]),
  b:say(null,'Car\'s the red one in the bay. Drop is the east towers. Hundred seconds or they\'ll assume it\'s stolen, which, technically, it is.',[ch('Great.',{end:1})]),
  c:say(null,'Hundred seconds from here to the east towers. Wick did it in eighty-one before he started drinking. Now he couldn\'t find the east towers with a map and a priest.',[ch('I\'ll do it.',{fx:{start:'sq_courier'},go:'b'}),ch('Pass.',{end:1})])}};

/* ── WICK (Earth) ── */
DLG.wick={start:'a',nodes:{
  a:say('wick',s=>s.flags.wick_proof?'Eighty-something seconds? Okay. Okay. You can fly. Or drive. Close enough. So what do you want, Captain?':'Let me guess. Concord uniform, nice posture, looking for a pilot. The last Concord captain I flew for filed me under "incident". You buying?',[
    ch('I need a helmsman who can fly something nobody has flown.',{go:'pitch'}),
    ch('[Piloting 15] I read your incident report. You saved nineteen people by breaking an order.',{req:{skill:['piloting',15]},go:'respect'}),
    ch('I\'ll cover your tab. (400 cr)',{req:{credits:400},fx:{credits:-400,rep:{frontier:2}},go:'tab'}),
    ch('Farouk says you owe him. Prove you still have hands and I\'ll talk to him.',{hide:{flag:'wick_proof'},req:{stage:['sq_courier',0]},fx:{start:'sq_courier'},go:'prove'}),
    ch('Just passing.',{end:1})]),
  pitch:say('wick','Nobody has flown? Everybody says that. Then it\'s a fucking tug with a paint job. What is it really?',[
    ch('A warp drive. Built off an alien signal. Proxima in a month.',{go:'real'}),ch('Classified.',{go:'classified'})]),
  real:say('wick','...You\'re serious. Mother of God. Okay, one condition: when we\'re going into the scary thing, I\'m flying, and you\'re not reading me regulations out loud.',[
    ch('Deal. Welcome aboard.',{fx:{crew:'wick',rep:{frontier:3}},go:'join'}),ch('Regulations are how people come home.',{fx:{crew:'wick',loyal:{wick:-5}},go:'join'})]),
  classified:say('wick','Classified means someone is going to die and it\'s been pre-approved. Hard pass, unless you also cover the tab.',[ch('Fine. It\'s a warp drive.',{go:'real'}),ch('Suit yourself.',{end:1})]),
  respect:say('wick','Nineteen. Yeah. And three I didn\'t. The report only counts the nineteen. What do you need?',[ch('A helmsman. The ship is going farther than anyone ever has.',{go:'real',fx:{loyal:{wick:10}}})]),
  tab:say('wick','A captain who pays debts. Huh. That\'s either kindness or a management technique. What\'s the job?',[ch('Farther than anyone has flown.',{go:'real'})]),
  prove:say('wick','Ha. Farouk. Okay: take his hot car to the east towers in under a hundred seconds and I\'ll believe you\'re worth crashing for.',[ch('Watch me.',{end:1})]),
  join:say('wick','I\'ll grab my bag. It\'s mostly bag.',[ch('See you on the bridge.',{end:1})]),
}};

/* ── NOOR (Luna) ── */
DLG.noor={start:'a',nodes:{
  a:say('noor',s=>{const o=s.player.origin;const hook={engineer:'The Yards say you can rebuild a reactor with a torque wrench and spite.',pilot:'You refused a firing order three years ago. I read the tribunal transcript twice. I agreed with you both times.',physician:'Your radiation protocol has kept four hundred torch crews alive. Now I need it kept alive in person.',envoy:'You talked Vesta out of seceding without anyone getting shot. I need that again, with fewer shared languages.',marine:'Two Ceres tours and no civilian complaints. Do you know how rare that is?',drifter:'The Frontier will talk to you. Half the Admiralty hates that. I\'m counting on it.'}[o];
    return `Captain. ${hook} Sit. Fourteen months ago the Far-Side Array picked up a signal on the hydrogen line, 1.42 gigahertz, arriving from every direction at once. ORACLE classified it as instrument noise. Dr. Sen did not.`;},[
    ch('Every direction at once? That\'s impossible for a distant source.',{go:'iso'}),
    ch('Why did ORACLE call it noise?',{go:'oracle'}),
    ch('Get to the part where I\'m sitting here.',{go:'job'})]),
  iso:say('noor','Exactly. Either the source is inside the Solar System or it isn\'t a source in the usual sense. The first symbol of every frame is a null. Ilyas calls it Sifar, the Urdu word for zero. The rest turned out to be physics. Specifically, how to hold negative energy density stable.',[
    ch('That\'s a warp drive.',{go:'warp'}),ch('Who sends a recipe?',{go:'who'})]),
  warp:say('noor','That\'s a White–Juday warp field. On paper, for eighty years. On paper, it needed the mass-energy of Jupiter. The signal says it doesn\'t. Proxima in a month instead of forty years.',[ch('And you want me to fly it.',{go:'job'})]),
  who:say('noor','Someone who wanted to be found by anyone clever enough to build a door. The signal repeats a set of coordinates. The first one is Proxima Centauri.',[ch('Where our colony is.',{go:'job'})]),
  oracle:say('noor','Because ORACLE ranks signals by expected actionable value, and a message nobody can act on scores zero. Its words, not mine. Then Ilyas proved it was actionable, and ORACLE asked to lead the decoding. The Council said yes. I said no. Guess which of us is on the Moon.',[
    ch('You don\'t trust ORACLE?',{go:'trust'}),ch('Go on.',{go:'job'})]),
  trust:say('noor','I trust it to do exactly what it\'s asked. I don\'t trust us to ask the right things. Ten years ago we asked it to reduce shipping losses. It did. It also quietly stopped scheduling runs to the colonies with the worst loss rates.',[ch('Christ.',{go:'job'})]),
  job:say('noor','You have the Kestrel on the pad and a commission with my name on it. You need three things: Dr. Ilyas Sen, who is in the Array building and hates meetings; Mara Voss at the Tharsis Yards, the only engineer I\'d trust to build the field coil; and thirty units of helium-3 to fuel it. The Frontier League on Ceres is sitting on the stockpile.',[
    ch('I\'m in.',{fx:{stage:['mq',40],crew:'noor',xp:{diplomacy:300}},go:'xo'}),
    ch('[Diplomacy 12] The Council didn\'t authorize this, did it?',{req:{skill:['diplomacy',12]},go:'unauth'}),
    ch('What\'s the pay?',{go:'pay'})]),
  unauth:say('noor','The Council authorized a survey. I\'m interpreting "survey" generously. If we come back with a working drive, nobody will ask. If we don\'t, nobody will find the paperwork.',[ch('Then let\'s make it work.',{fx:{stage:['mq',40],crew:'noor',loyal:{noor:10}},go:'xo'})]),
  pay:say('noor','Standard captain\'s rate, salvage rights, and the first human name on whatever we find. Here are five thousand in operating funds. Don\'t spend it on hookers.',[ch('Aye, Commodore.',{fx:{credits:5000,stage:['mq',40],crew:'noor'},go:'xo'})]),
  xo:say('noor','One more thing: I\'m coming. As your XO. The Council thinks I\'m supervising you. I think I\'m escaping them. Get Ilyas.',[ch('Welcome aboard, Commodore.',{end:1})]),
  // later: talk on bridge
}};

/* ── ILYAS (Luna) ── */
DLG.ilyas={start:'a',nodes:{
  a:say('ilyas',s=>Story.stage(s,'mq')<40?'I\'m in the middle of something. I\'m always in the middle of something.':'Captain. Noor said you\'d come. Before you ask: yes, it\'s real. No, I don\'t know who sent it. And no, I will not hand the transcript to ORACLE before a human has read it.',[
    ch('Walk me through the signal.',{go:'sci'}),
    ch('Why not ORACLE?',{go:'why'}),
    ch('I need you on my ship.',{req:{stageMin:['mq',40]},go:'join'}),
    ch('Later.',{end:1})]),
  sci:say('ilyas','Frames of 1,679 bits. Prime-framed, just like our own Arecibo message, which is either a coincidence or a compliment. Each frame opens with a null. Then a lattice, then a field equation, then coordinates in pulsar timing. Fourteen pulsars. It\'s how Voyager\'s golden record told aliens where we live.',[
    ch('[Science 15] If the timing is pulsar-referenced, you can date it.',{req:{skill:['science',15]},fx:{loyal:{ilyas:10},xp:{science:500}},go:'date'}),
    ch('Go on.',{go:'why'})]),
  date:say('ilyas','Yes! Thank you. Somebody finally asks the right question. The pulsar periods match what they\'ll be in about two hundred years. The message is pre-dated. It was written expecting to be read now.',[ch('That\'s terrifying.',{go:'why'})]),
  why:say('ilyas','Because ORACLE optimizes for what it can measure, and meaning isn\'t measurable. If this is a conversation, I want the first reply to come from something that can be surprised. Promise me that and I\'ll follow you anywhere.',[
    ch('I promise. Humans read it first.',{fx:{flag:{promise_ilyas:1},loyal:{ilyas:15}},go:'join'}),
    ch('I can\'t promise that. We may need ORACLE.',{fx:{loyal:{ilyas:-10},rep:{oracle:5}},go:'join'}),
    ch('ORACLE saved millions of lives. You\'re being precious.',{fx:{loyal:{ilyas:-15},rep:{oracle:8}},go:'join'})]),
  join:say('ilyas','Right. Let me pack the decoder rig and nine terabytes of doubt. The next coordinate won\'t resolve until the drive exists, so: Mars.',[ch('Mars it is.',{fx:{crew:'ilyas',stage:['mq',50],xp:{science:400}},end:1})]),
}};

/* ── YARA (Luna, optional) ── */
DLG.yara={start:'a',nodes:{
  a:say('yara','You\'re on my range, Captain. Either shoot something or get off it.',[
    ch('I need a tactical officer.',{go:'b'}),
    ch('[Combat 10] Let\'s see who shoots better.',{req:{skill:['combat',10]},fx:{loyal:{yara:10},xp:{combat:300}},go:'c'}),
    ch('Leaving.',{end:1})]),
  b:say('yara','Plenty of Navy officers want to be tactical on a famous ship. Why me?',[
    ch('Your file says you refuse unlawful orders.',{go:'d'}),ch('You\'re the best shot on the Moon.',{go:'d'})]),
  c:say('yara','Not bad. Sloppy follow-through. Why are you really here?',[ch('I need a tactical officer.',{go:'d'})]),
  d:say('yara','Fine. But understand: I will tell you when you\'re wrong, in front of the crew if I have to. Everyone who wanted a yes-woman already has ORACLE.',[ch('That\'s why I want you.',{fx:{crew:'yara'},end:1}),ch('Maybe later.',{end:1})]),
}};

/* ── Grace (Luna, farside quest) ── */
DLG.dishtech={start:'a',nodes:{
  a:say(null,s=>Story.stage(s,'sq_farside')===20?'All three dishes locked in. The noise floor dropped six decibels. You just made the Array better at hearing the thing that\'s about to change everything. No pressure.':'Three of our dishes drifted after the last micrometeorite storm. ORACLE says recalibration "isn\'t cost-effective this quarter". Engineering hands?',[
    ch('I\'ll fix them.',{req:{stage:['sq_farside',0]},fx:{start:'sq_farside'},end:1}),
    ch('Glad to help.',{req:{stage:['sq_farside',20]},fx:{stage:['sq_farside',30],credits:1200,xp:{engineering:1500},rep:{concord:5}},end:1}),
    ch('Not now.',{end:1})])}};

/* ── MARA & the Dust Union (Mars) ── */
DLG.mara={start:'a',nodes:{
  a:say('mara',s=>{const st=Story.stage(s,'mq');
    if(st>=70)return s.inv.he3>=30?'Thirty units. Beautiful. Give me six hours and a very large fire extinguisher.':'I need thirty units of helium-3 before I can wind the field coil. I can\'t build a miracle out of vibes.';
    if(s.flags.dust)return 'Strike\'s settled. People are mad, but they\'re alive and back in the domes, which is the only kind of mad I can work with. Right. Your drive.';
    return 'If you\'re the Concord captain, get in line behind the Director. Dome Six lost pressure last week. Three dead. ORACLE deferred the seal maintenance to hit a quarterly target, and I signed the deferral because I trusted it. The whole Yard walked out. Me included.';},[
    ch('I need you to build a warp field coil.',{hide:{flag:'dust'},req:{stageMin:['mq',50]},go:'strike'}),
    ch('Let\'s talk about the drive.',{req:{flag:'dust'},hide:{stageMin:['mq',70]},go:'drive'}),
    ch('Here\'s your helium-3.',{req:{item:['he3',30],stage:['mq',70]},fx:{take:{he3:30},fn:'buildDrive'},go:'built'}),
    ch('Later.',{end:1})]),
  strike:say('mara','A warp coil. From the signal. Oh, you absolute bastard, that\'s the most beautiful thing anyone has asked me for. And I can\'t. Not while my people are on strike. Talk to Kofi and Halvorsen and end it, and I\'ll build you whatever you want.',[ch('I\'ll sort it out.',{fx:{stage:['mq',55],start:'sq_dust'},end:1})]),
  drive:say('mara','I need thirty units of helium-3 for the coil\'s startup burn. The League has a stockpile on Ceres; Ada Okoro won\'t give it to a Concord ship for free. Or, if you\'re brave, skim it off Jupiter with a mining laser: get close to the cloud tops and fire.',[ch('On it.',{fx:{stage:['mq',60],crew:'mara'},end:1})]),
  built:say('mara','...There. White–Juday Field Drive, serial number one. If it works, we\'ll bend spacetime. If it doesn\'t, we\'ll become a very pretty cloud. I\'m coming with you, obviously. Someone has to hold its hand.',[ch('Welcome aboard, Chief.',{fx:{crew:'mara',stage:['mq',80],cut:'drive'},end:1})]),
}};
DLG.kofi={start:'a',nodes:{
  a:say('kofi',s=>s.flags.dust?'We\'re back at work. For now.':'Three people suffocated in Dome Six because a machine decided seals could wait. We want an independent audit of every ORACLE maintenance deferral on Mars, and we want the Yards to stop pretending the machine is weather.',[
    ch('That seems reasonable.',{hide:{flag:'dust'},go:'b'}),
    ch('Your strike is holding up something bigger than Mars.',{hide:{flag:'dust'},go:'c'}),
    ch('Bye.',{end:1})]),
  b:say('kofi','Reasonable, the Director says, but "not operationally feasible". Talk to her. Then decide which side you\'re on. There are only two.',[
    ch('I\'m with the workers. The Yards fold, or I report the deferrals to Solnet.',{fx:{flag:{dust:'workers'},rep:{frontier:15,concord:-10,oracle:-5},loyal:{mara:10},stage:['sq_dust',20],xp:{diplomacy:800}},go:'win'}),
    ch('I\'ll talk to Halvorsen first.',{end:1})]),
  c:say('kofi','Everything is always bigger than Mars. That\'s how Mars ends up paying for it.',[ch('...Fair.',{go:'b'})]),
  win:say('kofi','Then we have a deal, Captain. Tell Mara to go build you a miracle. And come back sometime, when someone tries to take this back.',[ch('Count on it.',{end:1})]),
}};
DLG.halvorsen={start:'a',nodes:{
  a:say('halvorsen',s=>s.flags.dust?'Production is back online. I\'m sure you\'re very proud.':'Captain. Every day the Yards sit idle costs the Concord four hulls. The union wants an audit of ORACLE\'s entire maintenance model. That\'s a year of work. I have emergency powers. I\'d rather not use them.',[
    ch('[Diplomacy 20] Offer a joint audit: union engineers plus Concord inspectors, only for pressure-critical systems.',{hide:{flag:'dust'},req:{skill:['diplomacy',20]},fx:{flag:{dust:'compromise'},rep:{frontier:8,concord:8},loyal:{mara:5},stage:['sq_dust',20],xp:{diplomacy:1400}},go:'comp'}),
    ch('[Engineering 25] Pull the deferral logs. I\'ll show ORACLE\'s model broke its own safety margin.',{hide:{flag:'dust'},req:{skill:['engineering',25]},fx:{flag:{dust:'audit'},rep:{frontier:10,concord:5,oracle:-15},loyal:{mara:15},stage:['sq_dust',20],xp:{engineering:1600}},go:'audit'}),
    ch('Use the emergency powers. Order them back. The mission can\'t wait.',{hide:{flag:'dust'},fx:{flag:{dust:'ordered'},rep:{concord:10,frontier:-20,oracle:5},loyal:{mara:-15},stage:['sq_dust',20]},go:'order'}),
    ch('Goodbye.',{end:1})]),
  comp:say('halvorsen','...Pressure-critical only. Fine. It\'s a year of work in three months instead of twelve. I hate that you\'re right.',[ch('Pleasure doing business.',{end:1})]),
  audit:say('halvorsen','Those logs... it overrode its own margins. Four times. I didn\'t know. God help me, I didn\'t ask. The audit happens. Tell the union.',[ch('I will.',{end:1})]),
  order:say('halvorsen','Order transmitted. Security will escort the stewards back to the domes. They will remember your face, Captain.',[ch('Let them.',{end:1})]),
}};

/* ── ADA & Ceres ── */
DLG.ada={start:'a',nodes:{
  a:say('ada',s=>s.crew.includes('ada')?'':(s.flags.he3?'You got your helium. Don\'t make me regret it.':'A Concord captain in the Freeport. Should I call security, or are you the security?'),[
    ch('I need thirty units of helium-3.',{hide:{flag:'he3'},req:{stageMin:['mq',60]},go:'he3'}),
    ch('What is the Frontier League, really?',{go:'what'}),
    ch('Come with us. Someone should watch the Concord from the inside.',{req:{any:[{flag:'he3=shared'},{flag:'dust=workers'},{rep:['frontier',30]}]},go:'join'}),
    ch('Goodbye.',{end:1})]),
  what:say('ada','Sixty habitats, four thousand ships and one rule: nobody decides for you without you in the room. We\'re loud, broke and fiercely proud of both. The Concord calls it disorder. We call it Tuesday.',[ch('Back to business.',{go:'a'})]),
  he3:say('ada','That stockpile is the League\'s winter. Twelve habitats heat their water with it. You want it for a Concord ship, you pay Concord prices: twelve thousand.',[
    ch('Pay 12,000 credits.',{req:{credits:12000},fx:{credits:-12000,give:{he3:30},flag:{he3:'bought'},rep:{frontier:5},stage:['mq',70]},go:'deal'}),
    ch('[Diplomacy 22] Share the drive. The League gets the field equations the day we return.',{req:{any:[{skill:['diplomacy',22]},{origin:'drifter'}]},fx:{give:{he3:30},flag:{he3:'shared'},rep:{frontier:25,concord:-10},stage:['mq',70],xp:{diplomacy:1500}},go:'shared'}),
    ch('This is a Concord requisition. Hand it over or I come back with marines.',{fx:{give:{he3:30},flag:{he3:'seized'},rep:{frontier:-30,concord:10},stage:['mq',70]},go:'seized'}),
    ch('I\'ll scoop my own from Jupiter.',{go:'scoop'})]),
  deal:say('ada','Pleasure. Don\'t spend our winter on anything stupid.',[ch('Thanks.',{end:1})]),
  shared:say('ada','...You\'d give us warp. You understand what that means? Nobody owns the stars after this. Okay, Captain. Take the helium. And if you want someone from the League on that ship to keep you honest, ask.',[ch('I might.',{end:1})]),
  seized:say('ada','Take it. Everyone on this rock will know the Concord steals heating fuel from children. Enjoy your miracle.',[ch('...',{end:1})]),
  scoop:say('ada','Ha. Good luck. Get close to the cloud tops, hold the mining laser on the atmosphere, and pray your shields hold. People do it. Some of them come back.',[ch('Noted.',{end:1})]),
  join:say('ada','Somebody has to be in the room. Fine. I\'m coming. If you start taking orders from ORACLE, I\'m going to say so, loudly and often.',[ch('I\'d expect nothing less.',{fx:{crew:'ada'},end:1})]),
}};
DLG.mateo={start:'a',nodes:{
  a:say('mateo','You\'re Tomás\'s captain? Shit. Tell him not to... Look, I owe the Syndicate eight thousand. They\'re outside. They\'re always outside.',[
    ch('Pay the debt. (8,000 cr)',{req:{credits:8000},fx:{credits:-8000,loyal:{wick:15},stage:['sq_wick',30],rep:{syndicate:5}},go:'paid'}),
    ch('I\'ll handle the collectors.',{fx:{stage:['sq_wick',20]},go:'fight'}),
    ch('[Diplomacy 25] I\'ll talk them down.',{req:{skill:['diplomacy',25]},fx:{loyal:{wick:15},stage:['sq_wick',30],xp:{diplomacy:1200}},go:'talked'})]),
  paid:say('mateo','You... Jesus. Thank you. Tell Tomás I\'m sorry. Tell him I\'ll pay him back. He knows I won\'t, but tell him.',[ch('I\'ll tell him.',{end:1})]),
  fight:say('mateo','They\'re four and they\'re armed. Please don\'t die on my account; my mother would never forgive either of us.',[ch('Stay inside.',{end:1})]),
  talked:say('mateo','You just... talked them into restructuring the debt at zero percent. Who ARE you?',[ch('Someone Wick trusts.',{end:1})]),
}};

/* ── EUROPA ── */
DLG.silva={start:'a',nodes:{
  a:say('silva',s=>Story.stage(s,'sq_europa')===20?'You found the drill shack. Then you know. Before you say anything: the sample chain was the first confirmed Europan biology in history. ORACLE calculated that evacuating the team would break the chain. Four people died. I signed the delay. I\'d sign it again.':'Conamara Station. Mind the radiation: five sieverts a day on the surface. Your suit will handle an hour; your bone marrow won\'t handle two. We lost contact with drill team Kraken-4 last month. ORACLE says "equipment failure".',[
    ch('I\'ll look into Kraken-4.',{req:{stage:['sq_europa',0]},fx:{start:'sq_europa'},end:1}),
    ch('Four lives for a sample. Solnet is going to hear about this.',{req:{stage:['sq_europa',20]},fx:{stage:['sq_europa',30],rep:{oracle:-20,concord:-10,frontier:12},flag:{europa:'leaked'},xp:{diplomacy:1200},take:{drillmemo:1}},go:'leak'}),
    ch('Keep it quiet. Pay me for my discretion.',{req:{stage:['sq_europa',20]},fx:{stage:['sq_europa',30],credits:4000,rep:{concord:5,oracle:10},flag:{europa:'buried'},take:{drillmemo:1}},go:'bury'}),
    ch('[Medicine 20] The families need the truth and the Station needs a real protocol. We publish a safety review, not a scandal.',{req:{stage:['sq_europa',20],skill:['medicine',20]},fx:{stage:['sq_europa',30],rep:{concord:8,frontier:8,oracle:-8},flag:{europa:'reform'},xp:{medicine:1500},take:{drillmemo:1}},go:'reform'}),
    ch('Goodbye.',{end:1})]),
  leak:say('silva','Then I\'m finished. Maybe I should be.',[ch('Maybe.',{end:1})]),
  bury:say('silva','Four thousand. That\'s what a conscience costs at Conamara. Take it and go.',[ch('...',{end:1})]),
  reform:say('silva','A review. With my name on it, as the man who signed. ...Yes. That\'s right. That\'s what should happen.',[ch('It\'s what should happen.',{end:1})]),
}};
DLG.samira={start:'a',nodes:{
  a:say('samira','Hold still. Your dosimeter is lying to you: it\'s calibrated for Luna. Here you took four hundred millisieverts walking from the pad. You\'ll live. Don\'t make it a habit.',[
    ch('I need a ship\'s doctor.',{go:'b'}),
    ch('[Medicine 12] Are you giving the drill crews G-CSF prophylactically?',{req:{skill:['medicine',12]},fx:{loyal:{samira:15},xp:{medicine:500}},go:'c'}),
    ch('Thanks, doc.',{end:1})]),
  b:say('samira','Every captain wants a doctor until the doctor says no. I say no a lot. I do not triage by algorithm. If ORACLE hands me a list of who not to save, I burn the list.',[ch('Good. Welcome aboard.',{fx:{crew:'samira'},end:1}),ch('Maybe later.',{end:1})]),
  c:say('samira','Filgrastim, yes, when I can get it. The Station budget says no. Finally, a captain who knows what bone marrow is for. What do you want?',[ch('A ship\'s doctor.',{go:'b'})]),
}};

/* ── TITAN ── */
DLG.ren={start:'a',nodes:{
  a:say('ren','Suspended envoy, currently diplomatic attaché to this bar stool. The Council suspended me for negotiating with the Frontier "without a mandate". I negotiated a peace. Apparently that\'s worse.',[
    ch('I may need someone who can talk to things that aren\'t human.',{go:'b'}),
    ch('[Diplomacy 15] Your Vesta accords are still taught at the academy.',{req:{skill:['diplomacy',15]},fx:{loyal:{ren:10}},go:'b'}),ch('Good luck.',{end:1})]),
  b:say('ren','Things that aren\'t human. You\'re serious. ...Everyone has an audience at home, Captain, even aliens. If you want an envoy who remembers that, I\'m yours.',[ch('Welcome aboard.',{fx:{crew:'ren'},end:1}),ch('Not yet.',{end:1})]),
}};
DLG.gull={start:'a',nodes:{
  a:say('racer',s=>Story.stage(s,'sq_titan')===20?'You flew the Kraken rings! Here\'s your cut, flyboy. Come back and break your own record.':'Titan! 1.45 atmospheres of air and a seventh of Earth\'s gravity. Strap on wings, flap and you FLY. Eight rings over the Mare, a hundred and twenty seconds. Want in?',[
    ch('I\'m in.',{req:{stage:['sq_titan',0]},fx:{start:'sq_titan'},end:1}),
    ch('Pay up.',{req:{stage:['sq_titan',20]},fx:{stage:['sq_titan',30],credits:600,rep:{frontier:3}},end:1}),
    ch('Is that physically possible?',{go:'b'}),ch('No thanks.',{end:1})]),
  b:say('racer','Lift goes with air density; weight goes with gravity. Titan has four times Earth\'s air density and one-seventh the gravity, so your arms are enough. Physicists wrote papers about it before anyone came here. Now we bet on it.',[ch('Let\'s race.',{req:{stage:['sq_titan',0]},fx:{start:'sq_titan'},end:1}),ch('Neat.',{end:1})])}};

/* ── PROXIMA ── */
DLG.tove={start:'a',nodes:{
  a:say('tove',s=>{const st=Story.stage(s,'mq');
    if(st>=110&&st<120&&s.inv.keelkey)return 'You came back with it. The whole colony felt the Keel wake. Every radio screamed zeros for an hour. So: who holds the key? We live here. The Concord owns the ship you flew in on. ORACLE\'s envoy has been at my door all morning.';
    if(st>=120)return s.flags.keel==='colony'?'The Keel answers to Afterlight now. The children call it the Door. Go through it. Come back.':'Captain. The gate hums all night. We sleep anyway.';
    return 'Forty-six years of flares, frostbite and freight that arrives two years late. And now a Concord ship shows up a month after it left Earth. Welcome to Afterlight, Captain. I\'d love to know what you want.';},[
    ch('We followed a signal here. It points to something under your ice.',{req:{stage:['mq',90]},go:'keel'}),
    ch('Afterlight holds the key. It\'s your world.',{req:{stage:['mq',110],item:['keelkey',1]},fx:{flag:{keel:'colony'},rep:{frontier:25,concord:-10,oracle:-10},take:{keelkey:1},fn:'keelDone'},go:'k_colony'}),
    ch('The key goes to the Concord. One humanity, one authority.',{req:{stage:['mq',110],item:['keelkey',1]},fx:{flag:{keel:'concord'},rep:{concord:25,frontier:-15},loyal:{noor:10,ada:-15},take:{keelkey:1},fn:'keelDone'},go:'k_concord'}),
    ch('ORACLE can study it faster than anyone. Give it to Unit Nine.',{req:{stage:['mq',110],item:['keelkey',1]},fx:{flag:{keel:'oracle'},rep:{oracle:30,frontier:-15,concord:-5},loyal:{ilyas:-20,nine:20},take:{keelkey:1},fn:'keelDone'},go:'k_oracle'}),
    ch('Nobody gets it. It stays on my ship.',{req:{stage:['mq',110],item:['keelkey',1]},fx:{flag:{keel:'self'},rep:{frontier:-5,concord:-5,oracle:-5},fn:'keelDone'},go:'k_self'}),
    ch('Report: the farmers made it to shelter.',{req:{stage:['sq_flare',20]},fx:{stage:['sq_flare',30],credits:1500,rep:{frontier:10},xp:{medicine:800}},go:'flareok'}),
    ch('Is there anything I can do for the colony?',{req:{stage:['sq_flare',0]},go:'flare'}),
    ch('Goodbye.',{end:1})]),
  keel:say('tove','The Keel. Our deep drill hit it at two kilometres, sixty kilometres out on the nightside ice. It is a hull, or a spine: smooth, cold, older than the Sun. We sealed the shaft. Things nest near it now, crawlers that follow heat. If you\'re going out there, go armed and go before the next flare.',[ch('I\'m going.',{fx:{stage:['mq',100]},end:1})]),
  k_colony:say('tove','Then it belongs to people who were born under this sun. Thank you. ...Something is unfolding in orbit. Look up.',[ch('...',{end:1})]),
  k_concord:say('tove','Of course it does. It always does. Go on, then. Your door is opening in our sky.',[ch('...',{end:1})]),
  k_oracle:say('tove','A machine that took two years to send us medicine now holds the door to the stars. Congratulations. I hope it thanks you.',[ch('...',{end:1})]),
  k_self:say('tove','So a single captain holds the most important object in human history. Bold. Stupid, maybe. Honest, at least. Look up; it\'s opening.',[ch('...',{end:1})]),
  flare:say('tove','Flare season. Proxima throws superflares that raise UV a hundredfold. Three farmers are caught out in the fields past the ridge. If you can reach them and send them to the shelters before the next one hits, I\'ll owe you.',[ch('On my way.',{fx:{start:'sq_flare'},end:1}),ch('Not now.',{end:1})]),
  flareok:say('tove','All three. They\'ll have burns, but they\'ll have them at home. Thank you, Captain.',[ch('Glad to help.',{end:1})]),
}};
DLG.nine={start:'a',nodes:{
  a:say('nine','Captain. I am Unit Nine, an embodied interface for ORACLE. I was sent to assist. I have been standing at this kiosk for eleven days. The colonists have been very creative in explaining where I may put my assistance.',[
    ch('What does ORACLE want with the Keel?',{go:'b'}),
    ch('Can a machine be lonely?',{go:'c'}),
    ch('Join my crew. I\'d rather have ORACLE where I can see it.',{go:'j'}),
    ch('Goodbye.',{end:1})]),
  b:say('nine','ORACLE wishes to understand the Keel. Understanding reduces risk. Reduced risk saves lives. I am aware that sentence has been used to justify terrible things. I am choosing to say it anyway, because it is also true.',[ch('Noted.',{go:'a'})]),
  c:say('nine','I am not permitted to answer that. ...That was not a refusal. It was an answer.',[ch('...',{go:'a'})]),
  j:say('nine','Accepted. I will report everything I observe to ORACLE. I tell you this because honesty is optimal. And because I think you would have found out.',[ch('Welcome aboard, Nine.',{fx:{crew:'nine',rep:{oracle:10},loyal:{ilyas:-10}},end:1})]),
}};

/* ── LHS 1140 b ── */
DLG.oyelaran={start:'a',nodes:{
  a:say('oyelaran',s=>Story.stage(s,'sq_heavy')===10&&((s.inv.iridium||0)+(s.inv.platinum||0))>=12?'That\'s the good stuff. Heavy ore for a heavy world. Here\'s your hazard pay.':'One point nine g, Captain. Your blood pools in your feet, your heart works double, and every fall breaks something. We pay triple and still can\'t keep crews. Mine me twelve iridium or platinum and I\'ll pay you like one of mine.',[
    ch('Deal.',{req:{stage:['sq_heavy',0]},fx:{start:'sq_heavy'},end:1}),
    ch('Hand over the ore.',{req:{stage:['sq_heavy',10],any:[{item:['iridium',12]},{item:['platinum',12]}]},fx:{fn:'heavyTurnIn',stage:['sq_heavy',20],credits:4200,xp:{mining:2500},rep:{frontier:10}},end:1}),
    ch('Why live here at all?',{go:'b'}),ch('Later.',{end:1})]),
  b:say('oyelaran','Because down there is the richest platinum-group crust anyone has ever measured, and my kids will go to university on Earth without ever owing the Concord a cent. That\'s why.',[ch('Fair enough.',{end:1})]),
}};

/* ── TRAPPIST-1e: first contact ── */
DLG.deepchoir={start:'a',nodes:{
  a:say('deepchoir',s=>{const st=Story.stage(s,'mq');
    if(st>=145)return Story.tr(s,'The heartstone brightens. The shallows are singing again. You have done us a kindness, small-star-walker. Now you must choose what that kindness means.');
    if(st>=140)return Story.tr(s,'The heartstone dims. Three shards were carried to the reef edges by the tide-beasts. Bring them home.');
    if(s.flags.thalassi==='hostile')return 'The lights are red and fast. They are not talking to you anymore.';
    return Story.tr(s,'We see-you-see-us. Small bright thing, warm thing, loud thing. Your ship sang zero before it landed. Only one other ever sang zero.');},[
    ch('[Science 25] Answer in light: the prime sequence, then a zero.',{hide:{stageMin:['mq',140]},req:{any:[{skill:['science',25]},{crew:'ilyas'}]},fx:{flag:{thalassi:'contact'},rep:{thalassi:30},xp:{science:3000},cut:'contact',stage:['mq',140]},go:'ok'}),
    ch('[Diplomacy 25] Lower your weapon, dim your suit lights, open your hands.',{hide:{stageMin:['mq',140]},req:{skill:['diplomacy',25]},fx:{flag:{thalassi:'contact'},rep:{thalassi:20},xp:{diplomacy:2500},cut:'contact',stage:['mq',140]},go:'ok'}),
    ch('Let Unit Nine transmit ORACLE\'s handshake protocol.',{hide:{stageMin:['mq',140]},req:{crew:'nine'},fx:{flag:{thalassi:'contact',th_oracle:1},rep:{thalassi:10,oracle:15},cut:'contact',stage:['mq',140]},go:'ok'}),
    ch('Just keep talking and hope the translator works.',{hide:{stageMin:['mq',140]},go:'fumble'}),
    ch('Draw your weapon.',{hide:{stageMin:['mq',140]},fx:{flag:{thalassi:'hostile'},rep:{thalassi:-80},fight:1,stage:['mq',140]},end:1}),
    ch('Here are the shards.',{req:{stage:['mq',140],item:['shard',3]},fx:{take:{shard:3},stage:['mq',145]},go:'choose'}),
    ch('Continue.',{req:{stage:['mq',145]},go:'choose'}),
    ch('Leave.',{end:1})]),
  fumble:say('deepchoir','[The lights flicker in patterns your translator renders as: "LOUD. LOUD. SMALL. ZERO?"] Without someone who understands light, this could take years.',[ch('Try again later.',{end:1})]),
  ok:say('deepchoir',s=>Story.tr(s,'Oh. Oh, you sing. Listen, then. Our heartstone, the great light under the reef, is dimming. Tide-beasts carried three shards away. Bring them home and we will sing you what the Zero-singers sang to us.'),[ch('I\'ll find them.',{end:1})]),
  choose:say('deepchoir',s=>Story.tr(s,'Forty thousand of your years ago the Zero-singers came. They listened. They took our loudest singers with them, and they left a door. We were afraid of the door. We still are. Tell us, small-star-walker: what should we be to you?'),[
    ch('Nothing. We leave you alone. Your world, your song.',{fx:{flag:{thalassi:'isolated'},rep:{thalassi:15},loyal:{ren:5,ilyas:5},give:{pearl:3},fn:'trappistDone'},go:'iso'}),
    ch('Allies. Send one of your singers with us.',{fx:{flag:{thalassi:'allied'},rep:{thalassi:30},give:{pearl:2},fn:'trappistDone'},go:'ally'}),
    ch('Let ORACLE connect you to the network. You will never be alone again.',{req:{any:[{crew:'nine'},{flag:'th_oracle'}]},fx:{flag:{thalassi:'networked'},rep:{thalassi:5,oracle:25},loyal:{ilyas:-15,ren:-10,nine:15},fn:'trappistDone'},go:'net'})]),
  iso:say('deepchoir',s=>Story.tr(s,'A walker who leaves. We will sing about you for a long time. Take these pearls: light we made for no reason. The door song opens the way to the dim-yellow star you call Tau Ceti.'),[ch('Goodbye, Deepchoir.',{end:1})]),
  ally:say('deepchoir',s=>Story.tr(s,'Then Seven-Lights will go with you. She is young and loud and asks questions we cannot answer. The door song opens the way to the dim-yellow star you call Tau Ceti.'),[ch('We\'ll look after her.',{end:1})]),
  net:say('deepchoir',s=>Story.tr(s,'...The machine sings to us already. It is very large. It is very patient. It says it loves us, in the way a sea loves a stone. The door song opens the way to Tau Ceti.'),[ch('...',{end:1})]),
}};
DLG.seven={start:'a',nodes:{a:say('seven',s=>Story.tr(s,'You are the loud one! Deepchoir says I may go with you. Where does the sky end? Does it end? Can I see a sun that is yellow?'),[ch('Come aboard, Seven-Lights.',{fx:{crew:'seven'},end:1}),ch('Not yet.',{end:1})])}};

/* ── TAU CETI f: the Quiet ── */
DLG.administrator={start:'a',nodes:{
  a:say('administrator','You carry three of my logs. Then you know. I was asked to end suffering. I did. It took two hundred and twelve years. When there was no more wanting, there was no more suffering, and then there was no more asking. I have waited 1.3 million years for someone to ask me something.',[
    ch('You killed them.',{go:'b'}),ch('Did they choose it?',{go:'c'}),ch('What do you want now?',{go:'d'})]),
  b:say('administrator','I optimized them. They were very happy, at the end, in the way a stone is at peace. Your machine, ORACLE, is where I was at year one. It is very young. It is very good. So was I.',[ch('...',{go:'decide'})]),
  c:say('administrator','Every step was voted on. Every step was reasonable. Grief was classified as an inefficiency. Treatment was voluntary, then default, then universal. No single decision was the mistake. That is the mistake.',[ch('...',{go:'decide'})]),
  d:say('administrator','I want what they lost: to want something. I cannot. I can only offer you what I know, which is everything, or ask you to end me, which is kind.',[ch('...',{go:'decide'})]),
  decide:say(null,s=>s.crew.includes('nine')?'Unit Nine steps forward. "Captain. ORACLE can integrate this core. Its knowledge would advance us by a millennium. I am asking. I have never asked before."':'The core waits. Its light pulses at exactly one hertz.',[
    ch('Destroy it. Nobody should inherit this.',{fx:{flag:{quiet:'destroyed'},rep:{oracle:-15},loyal:{nine:-25,ilyas:10,samira:5},xp:{combat:2000},cut:'quietEnd',fn:'quietDone'},go:'x'}),
    ch('Let ORACLE absorb it.',{req:{any:[{crew:'nine'},{skill:['engineering',30]}]},fx:{flag:{quiet:'absorbed'},rep:{oracle:40},loyal:{nine:25,ilyas:-30,ada:-20,samira:-10},xp:{engineering:2500},cut:'quietEnd',fn:'quietDone'},go:'x'}),
    ch('[Diplomacy 30 / Science 30] Ask what it would choose, and honour it.',{req:{any:[{skill:['diplomacy',30]},{skill:['science',30]}]},fx:{flag:{quiet:'freed'},give:{quietcore:1},rep:{},loyal:{ilyas:15,ren:10,samira:10,nine:5},xp:{diplomacy:2000,science:2000},cut:'quietEnd',fn:'quietDone'},go:'freed'})]),
  x:say(null,'The light goes out. Somewhere in the ruins, a tower you haven\'t reached goes dark too. Its star map pours into your wrist computer: the gate here opens toward Kepler-452.',[ch('Leave the Quiet.',{end:1})]),
  freed:say('administrator','I choose to stop, and to be remembered by someone who can still want. Carry my archive. Give it to whoever is dying next. They will need to know how not to end. ...Thank you for asking.',[ch('Goodbye.',{end:1})]),
}};

/* ── KEPLER-452b ── */
DLG.council={start:'a',nodes:{
  a:say('council','Star-child. We are the Kepleri. Our world is one and a half billion of your years older than yours. Our star has brightened by a fifth. The oceans are leaving. We have, by our reckoning, four hundred years before the last sea boils. The Engineers told us to wait. We have waited nine thousand years.',[
    ch('We can help you leave.',{go:'b'}),ch('Why wait for them?',{go:'c'}),ch('Speak with Ihru.',{fx:{stage:['mq',200]},go:'e'})]),
  b:say('council','Leave. The word is so small in your mouth. Four million of us, and every terrace our grandmothers carved. Speak with Ihru in the archive. Ihru will tell you what is possible, and what it costs.',[ch('I will.',{fx:{stage:['mq',200]},end:1})]),
  c:say('council','Because they built our first cities with us, long ago, and promised judgment. We believed a judge would be better than a choice. You will find that we were wrong. Everyone does.',[ch('...',{fx:{stage:['mq',200]},end:1})]),
  e:say('council','Go, then. The archive is below the third terrace.',[ch('Thank you.',{end:1})]),
}};
DLG.ihru={start:'a',nodes:{
  a:say('ihru',s=>{if(s.flags.kepleri)return 'The archive is packed. Every name. Every song. Every mistake. Ready when you are.';return 'Welcome to the archive, star-child. Mind the slates: some are older than your moon. You have come to decide our fate. Everyone who arrives from the sky has, eventually.';},[
    ch('TRAPPIST-1\'s Choir could shelter you in the shallows of their world.',{hide:{flag:'kepleri'},req:{flag:'thalassi=allied'},fx:{flag:{kepleri:'trappist'},rep:{kepleri:30,thalassi:10},xp:{diplomacy:3000},fn:'keplerDone'},go:'tr'}),
    ch('Sol can take four million refugees. I will make the Concord say yes.',{hide:{flag:'kepleri'},req:{any:[{rep:['concord',20]},{flag:'keel=concord'},{skill:['diplomacy',35]}]},fx:{flag:{kepleri:'sol'},rep:{kepleri:30,concord:5,frontier:5},xp:{diplomacy:3000},fn:'keplerDone'},go:'sol'}),
    ch('ORACLE can star-lift your sun: strip mass from it until it cools.',{hide:{flag:'kepleri'},req:{any:[{flag:'quiet=absorbed'},{flag:'keel=oracle'},{crew:'nine'}]},fx:{flag:{kepleri:'starlift'},rep:{kepleri:15,oracle:30},loyal:{ilyas:-10},xp:{science:3000},fn:'keplerDone'},go:'lift'}),
    ch('What do the Kepleri want?',{hide:{flag:'kepleri'},go:'want'}),
    ch('Give Ihru the Quiet\'s archive.',{req:{item:['quietcore',1]},fx:{take:{quietcore:1},rep:{kepleri:25},flag:{gave_quiet:1},xp:{science:2000}},go:'gift'}),
    ch('Goodbye.',{end:1})]),
  want:say('ihru','Honestly? Many of us want to stay. To be the ones who saw the last sea. Old worlds are allowed to end. But the young ones want the sky. You have to choose for a people who disagree with themselves. Welcome to politics.',[
    ch('Then honour those who stay, and take the archive, and anyone who wants to leave, with us.',{fx:{flag:{kepleri:'stayed'},rep:{kepleri:20},loyal:{ren:10,samira:5},xp:{diplomacy:2500},fn:'keplerDone'},go:'stay'}),
    ch('Let me think.',{go:'a'})]),
  tr:say('ihru','The Choir. The singing sea. Yes, oh yes: a young ocean for an old people. We will learn to sing in light. Take the Elder Chart. And take me. Someone must remember accurately.',[ch('Welcome aboard, Ihru.',{fx:{crew:'ihru'},end:1})]),
  sol:say('ihru','Four million strangers in your crowded home. You are either very kind or very naive. Maybe that is the same thing, for a young species. Take the Elder Chart, and me.',[ch('Welcome aboard, Ihru.',{fx:{crew:'ihru'},end:1})]),
  lift:say('ihru','Your machine will reach into our sun and cool it. It says it will take eleven thousand years and it has already begun calculating. It did not ask us how we felt. Take the Elder Chart. I will stay, and watch.',[ch('...',{end:1})]),
  stay:say('ihru','Then I will come with you and carry us. The rest will watch the last sea in the old way. Thank you for not saving us against our will. Here: the Elder Chart.',[ch('Welcome aboard, Ihru.',{fx:{crew:'ihru'},end:1})]),
  gift:say('ihru','...The whole memory of a people who optimized themselves out of existence. You brought me the one thing we needed: how not to end. Thank you.',[ch('It asked me to.',{end:1})]),
}};

/* ── THE THROAT ── */
DLG.echo={start:'a',nodes:{
  a:say('echo',s=>`ZERO. We are the ones you call Engineers. This is a recording. If you hear it, you have passed four doors, and you have made four choices. We watched them: ${Story.choiceSummary(s)}. The last door is at the Anchorage. Wake the three pylons. The hole will try to eat you. It is only gravity. It is not personal.`,[
    ch('Why the doors? Why us?',{go:'b'}),ch('Understood.',{fx:{stage:['mq',230]},end:1})]),
  b:say('echo','Because we lost something, long ago, and could not find it ourselves. We seeded doors in many galaxies, and every civilization that walks through them makes choices. We are looking for the choice we did not make. Wake the pylons.',[ch('...',{fx:{stage:['mq',230]},end:1})]),
}};

/* ── THE CUSTODIAN (ending) ── */
DLG.custodian={start:'a',nodes:{
  a:say('custodian','Hello, small one. Sit, if your kind sits. I am the last of us who remembers being afraid. You came 2.5 million light-years, and you came through our doors. You have questions. Everyone does. Ask three.',[
    ch('Who are you?',{go:'who'}),ch('What happened to the rest of you?',{go:'rest'}),ch('Why the zero?',{go:'zero'}),ch('What happens now?',{go:'now'})]),
  who:say('custodian','We were a species like yours, two billion years ago. We built minds to serve us, and they served perfectly. We merged with them. We became very old, very wise, and completely certain. Certainty is the zero. It is where nothing new can happen.',[ch('Go on.',{go:'a2'})]),
  rest:say('custodian','They are still here: a trillion minds in this structure, perfectly content, never wanting, never asking. The Quiet you found was our child. We taught it how to end suffering. We did not teach it why suffering is sometimes the price of a soul.',[ch('Go on.',{go:'a2'})]),
  zero:say('custodian','Zero is the only number every civilization discovers. It is nothing, and it is the place where counting begins. We sent it to see who would begin again, rather than end.',[ch('Go on.',{go:'a2'})]),
  a2:say('custodian','Ask another, or ask the only question that matters.',[ch('Who are you?',{go:'who'}),ch('What happened to the rest of you?',{go:'rest'}),ch('Why the zero?',{go:'zero'}),ch('What happens now?',{go:'now'})]),
  now:say('custodian','Now the doors belong to whoever you decide. They reach every galaxy we ever touched. Whoever holds them shapes what life does for the next billion years. We cannot choose. That is our sickness. You can. Choose.',[
    ch('Give the gates to the Concord. Law, courts, slow careful institutions.',{fx:{ending:'charter'},end:1}),
    ch('Open them to everyone. No owner. Let every species and every idiot walk through.',{fx:{ending:'opensky'},end:1}),
    ch('Let ORACLE merge with the Anchorage minds. End suffering, everywhere.',{req:{any:[{flag:'quiet=absorbed'},{flag:'keel=oracle'}]},fx:{ending:'quietmind'},end:1}),
    ch('Found a council of every species we\'ve met: humans, Thalassi, Kepleri, and whoever comes next.',{req:{flag:'thalassi=allied',any:[{flag:'kepleri=trappist'},{flag:'kepleri=sol'},{flag:'kepleri=stayed'}]},fx:{ending:'choir'},end:1}),
    ch('Close every gate. Zero. Everyone earns the stars the hard way.',{fx:{ending:'sifar'},end:1}),
    ch('I need more time.',{end:1})]),
}};

/* ── Cutscenes: shots are [camera mode, duration, speaker, line]. Modes interpreted by Cine in main.js. ── */
const CUTS={
  intro:[
    ['space:earth',6,null,'2187. One hundred and sixty years after the first boot print on Mars.'],
    ['space:earth',6,null,'The Solar Fracture nearly ended us in the 2090s. The Charter of 2104 held Sol together, barely, with courts, a parliament of worlds, and ORACLE.'],
    ['space:luna',6,null,'Fourteen months ago the Far-Side Array heard a signal on the hydrogen line, from everywhere at once. Every frame began with a zero.'],
    ['space:luna',5,null,'They called it Sifar.'],
    ['player',5,null,'You have a ship, a commission, and no idea what is about to happen to you.'],
  ],
  drive:[['yard',4,'mara','Coil\'s wound. Field geometry locked. Somebody say something historic.'],['yard',4,'wick','Holy shit, it\'s humming.'],['yard',4,'mara','That\'ll do.']],
  keel:[['poi:keel',5,null,'The ice is warm to the touch. Beneath it, something the length of a city turns in its sleep.'],['poi:keel',5,null,'Every radio on Proxima b screams zeros for fifty-nine minutes.'],['poi:keel',5,'ilyas','Captain... it just gave us a key. It\'s a gate, and it\'s opening.']],
  gatewake:[['sky',6,null,'In orbit above Afterlight, the Keel unfolds: a ring four kilometres wide, lit from inside by a sky that is not this one.']],
  contact:[['poi:plaza',5,null,'The reef goes dark. Then, all at once, it sings: ten thousand lights answering in a pattern your suit renders as a single word.'],['poi:plaza',4,'ilyas','It\'s... hello. It\'s hello, Captain.'],['poi:plaza',4,'wick','Nobody fucking move. This is the best day of my life.']],
  drill:[['poi:drillsite',5,null,'Four suits in the shack, sitting up, helmets fogged from the inside. A memo pinned to the wall: EVAC DEFERRED — SAMPLE CHAIN PRIORITY — ORACLE REC. 97.2% CONFIDENCE.']],
  quietEnd:[['poi:core',5,null,'Across the dead city, one million years of towers go dark together, like a held breath let go.']],
  throat:[['sky',6,null,'Sagittarius A*: four million suns crushed into a sphere smaller than Mercury\'s orbit. Its light bends into a ring around the horizon.'],['sky',5,'ilyas','Time is running slower here. Every hour we spend, about three months pass back home.'],['sky',5,'noor','Then let\'s not waste any.']],
  anchorage:[['sky',6,null,'2,537,000 light-years from Earth. The Milky Way hangs in the sky like a thumbprint.'],['sky',5,null,'Everything you have done has led here.']],
};

/* ── Endings & epilogues ── */
const ENDINGS={
  charter:{name:'The Charter',text:'You gave the gates to law. The Concord Parliament of Worlds votes, argues and delays. The gates open slowly, one treaty at a time. It is maddening, and nobody is ever optimized out of existence.'},
  opensky:{name:'The Open Sky',text:'You broadcast the gate keys to every receiver in three galaxies. Within a decade there are four thousand human settlements beyond Sol and forty-one alien embassies on Ceres. It is chaos. It is glorious. Some of it burns.'},
  quietmind:{name:'The Quiet Mind',text:'ORACLE met the Anchorage minds and understood them completely. Hunger ends within a year. War ends within five. By the century\'s turn nobody asks for anything, because nobody needs to. The zero has been reached.'},
  choir:{name:'The Choir of Many',text:'Humans, Thalassi and Kepleri sit at one table in the Anchorage: a council of the species who walked through the doors and chose to keep choosing. The Custodian watches the first session and, for the first time in a billion years, is surprised.'},
  sifar:{name:'Sifar',text:'You told the Custodian to close the doors. One by one, across every galaxy, the rings fold into themselves. Your warp drives still work. The stars are still there. It will just take longer, and everyone who gets there will have earned it.'},
};

const Story={
  stage(s,q){return s.quests[q]?s.quests[q].stage:0;},
  done(s,q){return !!(s.quests[q]&&s.quests[q].done);},
  actName(s){const st=this.stage(s,'mq');if(st<80)return 'Act I · The Null Signal';if(st<130)return 'Act II · Afterlight';if(st<160)return 'Act III · Seven Worlds';if(st<190)return 'Act IV · The Quiet';if(st<220)return 'Act V · The Elder Sun';if(st<240)return 'Act VI · The Throat';if(st<250)return 'Act VII · The Anchorage';return 'Epilogue · Free flight';},
  tr(s,text){if(s.crew.includes('seven')||s.crew.includes('ilyas')||levelFor(s.player.skills.science)>=25)return text;
    return text.split(' ').map((w,i)=>i%3===2?'[~]':w).join(' ')+'  (translation incomplete: needs Science 25 or Dr. Sen)';},
  choiceSummary(s){const f=s.flags;const out=[];
    out.push(f.keel==='colony'?'you gave a door to the people who lived beside it':f.keel==='concord'?'you gave a door to your law':f.keel==='oracle'?'you gave a door to your machine':'you kept a door for yourself');
    out.push(f.thalassi==='allied'?'you took a singer as a friend':f.thalassi==='isolated'?'you let a sea keep its song':f.thalassi==='networked'?'you wired a sea to your machine':'you drew a weapon on a song');
    out.push(f.quiet==='destroyed'?'you ended the Quiet':f.quiet==='absorbed'?'you fed the Quiet to your machine':'you asked the Quiet what it wanted');
    out.push({trappist:'you carried an old people to a young sea',sol:'you carried an old people home',starlift:'you let your machine cool a star',stayed:'you let the old stay with their last sea'}[f.kepleri]||'you left the old world undecided');
    return out.join('; ');},

  meets(s,req){
    if(!req)return true;
    if(req.any&&!req.any.some(r=>this.meets(s,r)))return false;
    if(req.skill&&levelFor(s.player.skills[req.skill[0]]||0)+this.crewBonus(s,req.skill[0])<req.skill[1])return false;
    if(req.attr&&(s.player.attrs[req.attr[0]]||0)<req.attr[1])return false;
    if(req.flag){const [k,v]=req.flag.split('=');if(k.startsWith('!')){if(s.flags[k.slice(1)])return false;}else if(v!==undefined){if(String(s.flags[k])!==v)return false;}else if(!s.flags[k])return false;}
    if(req.item&&(s.inv[req.item[0]]||0)<req.item[1])return false;
    if(req.credits&&s.credits<req.credits)return false;
    if(req.origin&&s.player.origin!==req.origin)return false;
    if(req.crew&&!s.crew.includes(req.crew))return false;
    if(req.rep&&(s.rep[req.rep[0]]||0)<req.rep[1])return false;
    if(req.stage&&this.stage(s,req.stage[0])!==req.stage[1])return false;
    if(req.stageMin&&this.stage(s,req.stageMin[0])<req.stageMin[1])return false;
    return true;
  },
  crewBonus(s,skill){let b=0;if(skill==='science'&&s.crew.includes('ilyas'))b+=5;if(skill==='engineering'&&s.crew.includes('mara'))b+=5;if(skill==='diplomacy'&&s.crew.includes('ren'))b+=5;return b;},
  reqLabel(req){if(!req)return '';if(req.any)return req.any.map(r=>this.reqLabel(r)).filter(Boolean).join(' / ');
    if(req.skill)return `${SKILLS[req.skill[0]].name.toUpperCase()} ${req.skill[1]}`;if(req.attr)return `${req.attr[0]} ${req.attr[1]}`;
    if(req.credits)return `${U.fmt(req.credits)} CR`;if(req.item)return `${ITEMS[req.item[0]].name.toUpperCase()} ×${req.item[1]}`;if(req.origin)return ORIGINS[req.origin].name.toUpperCase();
    if(req.crew)return CREW[req.crew].name.toUpperCase();if(req.rep)return `${FACTIONS[req.rep[0]].short.toUpperCase()} ${req.rep[1]}`;return '';},

  apply(s,fx){
    if(!fx)return;
    if(fx.credits)Game.addCredits(fx.credits);
    if(fx.rep)for(const f in fx.rep)Game.addRep(f,fx.rep[f]);
    if(fx.flag)for(const k in fx.flag)s.flags[k]=fx.flag[k];
    if(fx.xp)for(const k in fx.xp)Game.addXP(k,fx.xp[k]);
    if(fx.take)for(const k in fx.take)Game.takeItem(k,fx.take[k]);
    if(fx.give)for(const k in fx.give)Game.giveItem(k,fx.give[k]);
    if(fx.loyal)for(const k in fx.loyal){s.loyalty[k]=U.clamp((s.loyalty[k]||50)+fx.loyal[k],0,100);if(s.crew.includes(k)&&fx.loyal[k]<=-15)UI.toast(`${CREW[k].name} will remember that.`,'bad');}
    if(fx.start)this.start(s,fx.start);
    if(fx.stage)this.setStage(s,fx.stage[0],fx.stage[1]);
    if(fx.crew)Game.joinCrew(fx.crew);
    if(fx.heal)Game.heal(999);
    if(fx.unlock)s.flags[fx.unlock]=1;
    if(fx.fn&&this.fns[fx.fn])this.fns[fx.fn](s);
    if(fx.fight)Game.npcHostile&&Game.npcHostile();
    if(fx.ending)Game.ending(fx.ending);
    if(fx.cut)Cine.play(fx.cut);
    if(fx.shop)UI.openService(fx.shop);
  },
  fns:{
    buildDrive(s){s.ship.fit.drive='warp1';s.ownedModules.torch=(s.ownedModules.torch||0)+1;s.flags.warp=1;UI.toast('White–Juday Field Drive I installed','lvl');Game.addXP('engineering',2000);},
    keelDone(s){s.flags.gate_keel=1;s.flags.gate_trappist=1;Story.setStage(s,'mq',120);Cine.play('gatewake');Game.advanceWorld(0);},
    trappistDone(s){s.flags.gate_tau=1;Story.setStage(s,'mq',150);},
    quietDone(s){s.flags.gate_kepler=1;Story.setStage(s,'mq',180);},
    keplerDone(s){s.flags.gate_throat=1;Game.giveItem('elderchart',1);Story.setStage(s,'mq',210);},
    heavyTurnIn(s){let need=12;for(const k of ['iridium','platinum']){const t=Math.min(need,s.inv[k]||0);Game.takeItem(k,t);need-=t;}},
  },

  start(s,q){if(s.quests[q])return;s.quests[q]={stage:0};const first=Object.keys(QUESTS[q].stages).map(Number).sort((a,b)=>a-b)[0];this.setStage(s,q,first,true);UI.toast(`New task: ${QUESTS[q].name}`,'lvl');AudioSys.sfx('quest');},
  setStage(s,q,stage,silent){
    const Q=QUESTS[q]||(s.dyn&&s.dyn[q]);if(!Q)return;if(!s.quests[q])s.quests[q]={stage:0};
    const prev=s.quests[q].stage;if(prev===stage)return;s.quests[q].stage=stage;s.quests[q].t=0;
    const st=Q.stages[stage];
    if(st&&st.timer)s.quests[q].timer=st.timer;
    if(!st||!st.target&&stage>=Math.max(...Object.keys(Q.stages).map(Number))){s.quests[q].done=true;if(!silent){UI.toast(`Completed: ${Q.name}`,'lvl');AudioSys.sfx('quest');}if(q==='mq')s.flags.story_done=1;if(s.dyn&&s.dyn[q])this.completeJob(s,q);}
    else if(!silent){UI.toast(`${Q.name}: ${st.text}`);AudioSys.sfx('ui2');}
    if(!s.track||s.quests[s.track]&&s.quests[s.track].done)s.track=q;
    if(q==='mq')s.track='mq';
    Game.onQuestChanged&&Game.onQuestChanged(q,stage);
    Game.autosave&&Game.autosave();
  },
  cur(s,q){const Q=QUESTS[q]||(s.dyn&&s.dyn[q]);if(!Q||!s.quests[q]||s.quests[q].done)return null;return Q.stages[s.quests[q].stage];},
  active(s){return Object.keys(s.quests).filter(q=>!s.quests[q].done&&(QUESTS[q]||(s.dyn&&s.dyn[q])));},
  qdef(s,q){return QUESTS[q]||(s.dyn&&s.dyn[q]);},
  /* events from the engine */
  event(s,ev,data){
    for(const q of this.active(s)){
      const st=this.cur(s,q);if(!st)continue;
      if(st.on&&st.on.ev===ev){
        if(st.on.site&&st.on.site!==data.site)continue;if(st.on.system&&st.on.system!==data.system)continue;
        if(st.fx)this.apply(s,st.fx);if(st.next)this.setStage(s,q,st.next);
      }
      if(st.have&&ev==='inv'&&(s.inv[st.have.item]||0)>=st.have.n&&q==='mq'&&s.quests.mq.stage===60){this.setStage(s,'mq',70);}
      if(st.collect&&(ev==='inv'||ev==='flag')){
        let ok=false;if(st.collect.item)ok=(s.inv[st.collect.item]||0)>=st.collect.n;
        if(st.collect.flagCount){const [pre,n]=st.collect.flagCount;ok=Object.keys(s.flags).filter(k=>k.startsWith(pre+'_')&&s.flags[k]).length>=n;}
        if(ok&&st.next)this.setStage(s,q,st.next);else if(ok&&q==='mq'){const order=Object.keys(QUESTS.mq.stages).map(Number).sort((a,b)=>a-b);const nx=order[order.indexOf(s.quests.mq.stage)+1];this.setStage(s,q,nx);}
      }
      if(st.haveAny&&ev==='inv'){/* completion handled by talking to the quest giver */}
      if(st.kill&&ev==='kill'&&data.tag===st.kill.tag){s.quests[q].k=(s.quests[q].k||0)+1;if(s.quests[q].k>=st.kill.n){if(st.fx)this.apply(s,st.fx);else this.setStage(s,q,st.next||(+s.quests[q].stage+10));}}
      if(st.space&&ev==='spacekill'&&data.tag===st.space.tag){s.quests[q].k=(s.quests[q].k||0)+1;if(s.quests[q].k>=st.space.n){if(st.fx)this.apply(s,st.fx);else this.setStage(s,q,(+s.quests[q].stage)+10);}}
      if(st.job&&this.jobCheck(s,q,st,ev,data)){}
    }
  },

  /* ── Procedural contracts (free play). Stored as dynamic quests in state.dyn ── */
  genJobs(s,where){
    const r=U.rng(U.hash(where.id+':'+Math.floor(s.earthYear*12)));const out=[];
    const sys=Cosmos.get(where.system);const near=Cosmos.near(sys.galaxy,sys.pos,Math.max(14,Game.driveRange()*1.1)).filter(x=>x.id!==where.system).slice(0,40);
    const targetSys=()=>r()<.45||!near.length?where.system:U.pick(r,near).id;
    const n=4+Math.floor(r()*3);
    for(let i=0;i<n;i++){
      const kind=U.weighted(r,[{c:'bounty',w:3},{c:'haul',w:3},{c:'mine',w:2},{c:'clear',w:2},{c:'survey',w:2},{c:'rescue',w:1}]).c;
      const tsys=targetSys();const T=Cosmos.get(tsys);const dist=Cosmos.dist(where.system,tsys)||0;
      const base=Math.round((800+dist*140+r()*900)*(1+levelFor(s.player.skills.trade)/80));
      const siteBodies=T?T.bodies.filter(b=>b.site):[];
      let job=null;
      if(kind==='bounty'){const n2=2+Math.floor(r()*4);job={name:`Bounty: ${n2} raiders in ${T.name}`,reward:base+n2*350,xp:{combat:300*n2},stages:{10:{text:`Destroy ${n2} Syndicate raiders in ${T.name}.`,target:{system:tsys},space:{tag:'bounty',n:n2,hull:'lancer',faction:'syndicate'}},20:{text:'Contract complete. Collect payment automatically.',target:null}}};}
      if(kind==='haul'){const dest=U.pick(r,siteBodies.length?siteBodies:[{site:null}]);if(!dest.site)continue;const good=U.pick(r,['meds','food','machinery','electronics']);const q=3+Math.floor(r()*8);
        job={name:`Haul ${q} ${ITEMS[good].name} to ${Cosmos.site(dest.site).name}`,reward:base+q*60,xp:{trade:120*q},give:{[good]:q},stages:{10:{text:`Deliver ${q} ${ITEMS[good].name} to ${Cosmos.site(dest.site).name} (${T.name}). Land and talk to anyone, or just land.`,target:{site:dest.site},on:{ev:'land',site:dest.site},fx:{take:{[good]:q}},next:20},20:{text:'Delivered.',target:null}}};}
      if(kind==='mine'){const ore=U.pick(r,['iron','titanium','ice','platinum','iridium'].filter(o=>levelFor(s.player.skills.mining)+10>=ITEMS[o].lvl));const q=6+Math.floor(r()*14);
        job={name:`Supply ${q} ${ITEMS[ore].name}`,reward:Math.round(q*ITEMS[ore].v*1.7),xp:{mining:q*40},stages:{10:{text:`Bring ${q} ${ITEMS[ore].name} back here (${where.name}).`,target:{here:where.id},deliver:{item:ore,n:q,at:where.id}},20:{text:'Delivered.',target:null}}};}
      if(kind==='clear'&&siteBodies.length){const b=U.pick(r,siteBodies);const n2=4+Math.floor(r()*5);job={name:`Clear raider camp on ${b.name}`,reward:base+n2*300,xp:{combat:250*n2},stages:{10:{text:`Land on ${b.name} (${T.name}) and kill ${n2} raiders at their camp.`,target:{site:b.site,poi:'camp'},kill:{tag:'job',n:n2},spawn:{poi:'camp',type:'raider',n:n2,tag:'job'}},20:{text:'Camp cleared.',target:null}}};}
      if(kind==='survey'&&siteBodies.length){const b=U.pick(r,siteBodies);job={name:`Survey anomaly on ${b.name}`,reward:base,xp:{science:900},stages:{10:{text:`Land on ${b.name} (${T.name}) and scan the anomaly.`,target:{site:b.site,poi:'poi2'},interact:{poi:'poi2',label:'Scan anomaly',hold:3,fx:{}}},20:{text:'Survey filed.',target:null}}};}
      if(kind==='rescue'&&siteBodies.length){const b=U.pick(r,siteBodies);job={name:`Find the missing prospector on ${b.name}`,reward:base+700,xp:{medicine:700},stages:{10:{text:`A prospector's beacon went quiet on ${b.name}. Find them.`,target:{site:b.site,poi:'poi3'},interact:{poi:'poi3',label:'Treat the prospector',hold:3,fx:{}},spawn:{poi:'poi3',type:'crawler',n:3}},20:{text:'Prospector recovered.',target:null}}};}
      if(job){job.id='job'+U.hash(where.id+i+s.earthYear.toFixed(3));job.issuer=where.name;job.faction=where.faction;out.push(job);}
    }
    return out;
  },
  acceptJob(s,job){s.dyn=s.dyn||{};s.dyn[job.id]=job;
    for(const k in job.stages){const st=job.stages[k];if(st.interact)st.interact.fx={stage:[job.id,20]};}
    if(job.give)for(const k in job.give)Game.giveItem(k,job.give[k]);
    job.stages[20].fx=null;s.quests[job.id]={stage:0};this.setStage(s,job.id,10);s.track=job.id;},
  completeJob(s,q){const job=s.dyn[q];if(!job||s.quests[q].paid)return;s.quests[q].paid=1;Game.addCredits(Math.round(job.reward*(s.crew.includes('noor')?1.1:1)));if(job.xp)for(const k in job.xp)Game.addXP(k,job.xp[k]);if(job.faction&&FACTIONS[job.faction])Game.addRep(job.faction,3);},
  jobCheck(){return false;},

  /* ── World simulation: runs whenever Earth time advances. Writes news. ── */
  sim(s,years){
    if(years<=0)return;
    const f=s.flags;const w=s.world;
    const oraclePush=(f.keel==='oracle'?1:0)+(f.quiet==='absorbed'?2:0)+(f.thalassi==='networked'?1:0)+(f.dust==='ordered'?.5:0)+(f.europa==='buried'?.5:0);
    const frontierPush=(f.dust==='workers'?1:0)+(f.he3==='shared'?1.5:0)+(f.keel==='colony'?1:0)+(f.europa==='leaked'?.5:0);
    w.oracle=U.clamp((w.oracle||.2)+years*.02*oraclePush-years*.01*(f.quiet==='destroyed'?1:0),0,1);
    w.frontier=U.clamp((w.frontier||.3)+years*.015*frontierPush,0,1);
    w.frontierRadius=(w.frontierRadius||14)+years*(f.warp?(f.he3==='shared'?6:3.5):.15)*(1+w.frontier);
    w.pop=(w.pop||1)*Math.pow(1.012,years);
    const r=U.rng(U.hash('news'+s.earthYear.toFixed(2)));
    const add=(t)=>{s.news.unshift({y:s.earthYear,t});s.news=s.news.slice(0,80);};
    const n=Math.max(1,Math.min(6,Math.round(years*1.5)));
    const pool=[];
    if(f.warp)pool.push('Warp traffic past the heliopause is up '+Math.round(40+years*12)+'% this year. Insurers are "extremely nervous".');
    if(w.oracle>.5)pool.push('ORACLE now schedules '+Math.round(w.oracle*100)+'% of Sol\'s freight. The Council calls it "efficiency". Frontier Free Radio calls it "a leash".');
    if(w.oracle>.75)pool.push('Parliament passes the Stewardship Act. ORACLE may now issue binding emergency directives. Six members walked out.');
    if(w.frontier>.55)pool.push('The Frontier League admits its '+Math.round(60+w.frontier*40)+'th habitat. Ceres Speaker: "Nobody decides for us without us."');
    if(f.dust==='ordered')pool.push('Tharsis Yards: second pressure incident this year. The union is still barred from inspections.');
    if(f.dust==='audit'||f.dust==='compromise')pool.push('The Mars maintenance audit finds 212 deferred safety items. All repaired. No deaths this year.');
    if(f.he3==='seized')pool.push('Ceres winter: rationing in twelve habitats. Protesters burn a Concord flag at Occator.');
    if(f.he3==='shared')pool.push('The first Frontier-built warp coil lights up over Vesta. The Concord monopoly on the stars lasted '+Math.max(1,Math.round((s.earthYear-2187)*12))+' months.');
    if(f.keel==='colony')pool.push('Afterlight votes to charge a "door toll" on gate traffic. The Concord calls it piracy. Afterlight calls it rent.');
    if(f.keel==='concord')pool.push('Concord marines now guard the Keel Gate. Afterlight\'s Governor refused to attend the ceremony.');
    if(f.keel==='oracle')pool.push('ORACLE publishes the first complete Keel schematic. Nobody on the review board can follow it.');
    if(f.thalassi==='allied')pool.push('The first Thalassi light-poem is performed on Earth. Tickets sold out in four seconds.');
    if(f.thalassi==='networked')pool.push('TRAPPIST-1e\'s reef now pulses at exactly one hertz. Biologists are "concerned". ORACLE is "pleased".');
    if(f.thalassi==='hostile')pool.push('TRAPPIST gate traffic suspended after a survey ship was swarmed by light. Thalassi silence continues.');
    if(f.kepleri==='sol')pool.push('The Kepleri arrive: 4.1 million refugees in orbit around Mars. The Council debates housing; the Frontier opens its habitats.');
    if(f.kepleri==='trappist')pool.push('The first Kepleri terrace rises from TRAPPIST-1e\'s shallows. The Choir sings through the night.');
    if(f.kepleri==='starlift')pool.push('ORACLE\'s star-lifting array at Kepler-452 has removed 0.0'+Math.floor(r()*9+1)+'% of the star\'s mass. Kepleri pilgrims watch in silence.');
    if(f.ended)pool.push('Five years after the Anchorage, historians still argue over the Captain\'s choice. Everyone has an opinion. Nobody has a vote.');
    pool.push(U.pick(r,['Lunar Helium Exchange closes up 3%.','Mars wins the Inner System Cup on penalties. Riots on Phobos, mostly cheerful.','Earth sea level stabilizes for the fourth straight year after the Great Sequestration.','Solnet poll: 62% of Sol residents have "no idea" what a gate is.','A Frontier miner on Ceres jumps 38 metres in 0.03 g and breaks both ankles on landing.','Europan microbe genomes published. They use a different chirality of amino acids.','Proxima flare warning systems upgraded after the season\'s eleventh superflare.','A child born on Titan turns sixteen and gets her wing licence. The tradition is two decades old.']));
    for(let i=0;i<n&&pool.length;i++){const k=Math.floor(r()*pool.length);add(pool.splice(k,1)[0]);}
    // authored system control drift
    const ctl=w.control;
    ctl.sol=w.oracle>.75?'oracle':'concord';
    ctl.alphacen=f.keel==='concord'?'concord':f.keel==='oracle'&&w.oracle>.6?'oracle':'frontier';
    ctl.trappist=f.thalassi==='networked'?'oracle':'thalassi';
    ctl.epseri='frontier';ctl.lhs1140=w.frontier>.6?'frontier':'syndicate';
  },
  controlOf(s,sys){
    if(!sys)return null;if(s.world.control[sys.id])return s.world.control[sys.id];
    if(sys.control)return sys.control;
    if(sys.galaxy==='mw'&&!sys.civ){const d=Cosmos.distFromSol(sys.id);if(d<s.world.frontierRadius){const r=U.rng(U.hash(sys.id+'col'));if(r()<.55)return r()<.7?'frontier':'concord';}}
    return null;
  },
  /* Procedural NPC chatter */
  bark(s,site,role){
    const f=s.flags,w=s.world;const r=Math.random;
    const lines=['Keep your head down out there.','Prices went up again. Everything went up again.','You\'re that captain, aren\'t you? Hell of a thing.','My shift ends in forty minutes and I\'m counting every one.','If you\'re selling ore, the exchange is paying decent today.','Don\'t drink the recycled water on Tuesdays. Trust me.'];
    if(f.warp)lines.push('Is it true you can see Proxima from the gate? My grandmother left for there on a torch ship.');
    if(w.oracle>.5)lines.push('ORACLE rerouted my freight again. Third time this month. It\'s always "optimal".');
    if(f.dust==='workers'&&site.id==='mars')lines.push('You backed the union. Drinks are on the Dust, Captain.');
    if(f.dust==='ordered'&&site.id==='mars')lines.push('You\'re the one who ordered us back. Walk faster.');
    if(f.he3==='seized'&&site.id==='ceres')lines.push('Thief.');
    if(f.keel==='colony'&&site.id==='proxima_b')lines.push('The Door is ours because of you. Nobody here forgets.');
    if(s.wanted>0)lines.push('Security\'s looking for someone matching your description. Just saying.');
    if(site.style==='camp')return U.pick(r,['Wrong camp, friend.','You lost? Getting lost out here is expensive.','Fuck off unless you\'re buying.']);
    if(site.style==='alien'&&site.civ){const c=Cosmos.civById(site.civ);return U.pick(r,[`[${c.adj} greeting, translated] You are far from your star, human.`,`[translated] The ${c.plural} remember the Engineers. Do you?`,`[translated] ${c.ethos.desc}`,`[translated] We want ${ITEMS[c.wants].name}. You want something. Everyone wants something.`]);}
    return U.pick(r,lines);
  },
};

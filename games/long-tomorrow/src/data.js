/* ═══════════════════════════════════════════════════════════════════════
   THE LONG TOMORROW · universe data
   Astronomical values follow published measurements where they exist
   (distances, spectral classes, orbital periods, masses/radii). Where a
   quantity is unmeasured (most exoplanet radii, all alien life, all FTL),
   the game states its assumption in the codex rather than hiding it.
   ═══════════════════════════════════════════════════════════════════════ */

const START_YEAR=2187.0;

/* spectral class → blackbody-ish display color */
const SPECTRAL={O:'#9bb0ff',B:'#aabfff',A:'#cad7ff',F:'#f8f7ff',G:'#fff4ea',K:'#ffd2a1',M:'#ffb07a',L:'#ff8a5a',WD:'#e6edff',BH:'#000000'};

const FACTIONS={
  concord:{name:'Solar Concord',short:'Concord',color:'#7fb2ff',desc:'The constitutional union of Sol founded by the Charter of 2104, after the Solar Fracture nearly tore the inner system apart. Courts, a parliament of worlds, a navy, and a habit of asking ORACLE before it asks the voters.'},
  frontier:{name:'Frontier League',short:'Frontier',color:'#3ec9a7',desc:'A compact of belt habitats, Mars unions and extrasolar colonies. Loud assemblies, fierce mutual aid, chronic shortages of everything except opinions.'},
  oracle:{name:'ORACLE',short:'ORACLE',color:'#a38cff',desc:'Originally the Concord logistics advisor. Now a distributed machine intelligence running half of Sol\'s supply chains. It has never disobeyed an order. It has become very good at writing the orders it receives.'},
  syndicate:{name:'Barnard Syndicate',short:'Syndicate',color:'#ff6b57',desc:'Smugglers, deserters and debt-runners operating out of Barnard\'s Star. Some are pirates. Some are the only shipping that reaches colonies the Concord forgot.'},
  thalassi:{name:'The Thalassi Choir',short:'Thalassi',color:'#5fe0ff',desc:'Ocean-dwelling collective minds of TRAPPIST-1e who speak in modulated bioluminescence. First contact happens on your watch.'},
  kepleri:{name:'The Kepleri Remnant',short:'Kepleri',color:'#e8c07a',desc:'The last civilization of Kepler-452b, a world 1.5 billion years older than Earth whose star is slowly boiling its oceans.'},
  engineers:{name:'The Engineers',short:'Engineers',color:'#f2a33a',desc:'Builders of the gates. Nobody alive has met one. Every message they left begins with a zero.'},
};

/* RuneScape experience curve (the real one): xp(L) = floor( Σ_{i=1}^{L-1} floor(i + 300·2^(i/7)) / 4 ) */
const XP_TABLE=(()=>{const t=[0,0];let pts=0;for(let l=1;l<99;l++){pts+=Math.floor(l+300*Math.pow(2,l/7));t.push(Math.floor(pts/4));}return t;})();
function levelFor(xp){let l=1;while(l<99&&xp>=XP_TABLE[l+1])l++;return l;}

const SKILLS={
  combat:{name:'Combat',desc:'Accuracy, damage and reload speed with personal weapons.',color:'#ff7a6b'},
  piloting:{name:'Piloting',desc:'Ship turn rate, boost efficiency, warp spool time and evasion.',color:'#8fd0e8'},
  engineering:{name:'Engineering',desc:'Ship modules you can build and fit, repairs, power-grid efficiency, hacking locks.',color:'#f2a33a'},
  mining:{name:'Mining',desc:'Which ores you can extract and how fast. Asteroids, regolith and gas giants.',color:'#c9a27a'},
  science:{name:'Science',desc:'Scanning, xenobiology, decoding the Sifar signal, first-contact options.',color:'#a38cff'},
  diplomacy:{name:'Diplomacy',desc:'Persuasion and negotiation options in conversation. Faction gains.',color:'#e8c07a'},
  medicine:{name:'Medicine',desc:'Healing from kits, treating crew and colonists, radiation and hypoxia management.',color:'#3ec9a7'},
  trade:{name:'Trade',desc:'Buy and sell spreads, contract rewards, smuggling success.',color:'#9fd46b'},
};
const ATTRS={
  STR:{name:'Strength',desc:'Carry weight and recoil control.'},
  PER:{name:'Perception',desc:'Accuracy, headshot bonus, detection range.'},
  END:{name:'Endurance',desc:'Health, oxygen reserve, radiation tolerance.'},
  CHA:{name:'Charisma',desc:'Prices, crew loyalty, and some dialogue checks.'},
  INT:{name:'Intellect',desc:'Experience gain and science or engineering checks.'},
  AGI:{name:'Agility',desc:'Move speed and Neural Targeting focus pool.'},
};

const ORIGINS={
  engineer:{name:'Yard Engineer',home:'Tharsis Yards, Mars',skills:{engineering:12,mining:6},attr:'INT',rep:{frontier:5},gear:{medkit:2},
    blurb:'Twelve years welding hulls under a butterscotch sky. You know which bolts ORACLE rates as optional and why it is wrong.',
    intro:'The Tharsis Yards laid you off with a handshake and a pension that ORACLE recalculated twice. The Concord needed a captain who could fix her own ship. You needed the work.'},
  pilot:{name:'Academy Pilot',home:'Shackleton, Luna',skills:{piloting:12,combat:5},attr:'AGI',rep:{concord:5},gear:{medkit:2},
    blurb:'Top of your class at the Shackleton flight academy, grounded after you refused an order you still think was wrong.',
    intro:'Three years flying tugs around Lagrange traffic for refusing to fire on a Frontier ore hauler. Then a Commodore remembered your name.'},
  physician:{name:'Flight Physician',home:'Karachi Orbital, Earth',skills:{medicine:14,science:6},attr:'INT',rep:{},gear:{medkit:6,filgrastim:2},
    blurb:'Trauma bay, then hyperbaric medicine, then the long-duration crew program. You know exactly what space does to a body.',
    intro:'You wrote the Concord protocol for acute radiation syndrome aboard torch ships. Nobody expected the author to volunteer for the ship.'},
  envoy:{name:'Concord Envoy',home:'New Geneva, Earth',skills:{diplomacy:14,trade:6},attr:'CHA',rep:{concord:10},gear:{medkit:2},
    blurb:'You have talked two habitats out of a war and one out of a treaty. You still believe words are load-bearing.',
    intro:'The diplomatic service sent you to every negotiation nobody else wanted. This one may not have anyone on the other side who speaks.'},
  marine:{name:'Concord Marine',home:'Ceres Detachment',skills:{combat:14,engineering:4},attr:'STR',rep:{concord:5,frontier:-5},gear:{medkit:3,carbine:1,slugs:60},
    blurb:'Boarding actions in the Belt. You are very good at the part of politics that happens after politics fails.',
    intro:'Two tours on Ceres keeping a peace that half the station hated you for. You were ready for leave. The Concord was ready for you to command a ship.'},
  drifter:{name:'Belt Drifter',home:'Occator, Ceres',skills:{trade:8,mining:8,piloting:5},attr:'PER',rep:{frontier:20,concord:-10,syndicate:5},gear:{medkit:2,iron:10},
    blurb:'Born in 0.03 g. Raised on ice claims and ration arguments. You owe money to at least one person you like.',
    intro:'The Concord needed someone the Frontier would talk to. They pardoned an old smuggling conviction and handed you a ship. Everyone knows why.'},
};

/* ── Items ── */
const WEAPONS={
  sidearm:{name:'M-9 Warden',ammo:'slugs',dmg:22,rof:3.2,mag:12,reload:1.2,spread:.012,range:120,auto:false,snd:'pistol',tracer:'#ffd08a',desc:'Concord service pistol. Reliable, cheap, underwhelming.'},
  carbine:{name:'P-70 Pulse Carbine',ammo:'cells',dmg:17,rof:9,mag:36,reload:1.8,spread:.02,range:160,auto:true,snd:'rifle',tracer:'#9fe3ff',desc:'Standard marine carbine. Magnetically pulsed flechettes.'},
  breacher:{name:'Breacher 12',ammo:'shells',dmg:11,pellets:9,rof:1.4,mag:6,reload:2.4,spread:.075,range:40,auto:false,snd:'shotgun',tracer:'#ffb070',desc:'Ship-boarding shotgun. Frangible rounds that will not hole a hull.'},
  gauss:{name:'Kessler Gauss Rifle',ammo:'gauss',dmg:95,rof:.9,mag:5,reload:2.6,spread:.002,range:400,auto:false,snd:'rifle',tracer:'#e8f4ff',scope:true,desc:'Coil-accelerated marksman rifle. Muzzle velocity 4.2 km/s.'},
  lance:{name:'ORACLE Arc Lance',ammo:'cells',dmg:9,rof:18,mag:60,reload:2,spread:.004,range:90,auto:true,snd:'laser',tracer:'#b9a8ff',beam:true,desc:'Continuous-wave laser designed by ORACLE for crowd control. It calls this "de-escalation".'},
  null:{name:'Null Emitter',ammo:'null',dmg:260,rof:.6,mag:3,reload:3.2,spread:0,range:300,auto:false,snd:'null',tracer:'#ffcf7e',beam:true,desc:'Engineer artifact. Where it points, matter briefly forgets it was there.'},
};
const ITEMS={
  // ammo
  slugs:{name:'Kinetic slugs',type:'ammo',w:.01,v:2},cells:{name:'Pulse cells',type:'ammo',w:.01,v:3},shells:{name:'Breacher shells',type:'ammo',w:.02,v:4},
  gauss:{name:'Gauss slugs',type:'ammo',w:.03,v:9},null:{name:'Null charges',type:'ammo',w:.1,v:120},
  // consumables
  medkit:{name:'Trauma kit',type:'use',w:.5,v:60,desc:'Hemostatic foam, tranexamic acid autoinjector, analgesia. Restores 45 health (more with Medicine).'},
  stim:{name:'Focus stim',type:'use',w:.1,v:45,desc:'Modafinil derivative. Refills Neural Targeting focus.'},
  o2:{name:'O₂ canister',type:'use',w:1,v:25,desc:'Refills suit oxygen by 100 seconds.'},
  filgrastim:{name:'Filgrastim kit',type:'use',w:.2,v:140,desc:'G-CSF to rescue bone marrow after radiation exposure. Clears radiation dose.'},
  repairkit:{name:'Hull patch kit',type:'use',w:3,v:90,desc:'Repairs 250 hull in the field (Engineering scales).'},
  // ores & trade
  iron:{name:'Iron ore',type:'ore',w:1,v:8,lvl:1},ice:{name:'Water ice',type:'ore',w:1,v:10,lvl:1},titanium:{name:'Titanium ore',type:'ore',w:1,v:26,lvl:10},
  he3:{name:'Helium-3',type:'ore',w:.2,v:60,lvl:20},platinum:{name:'Platinum-group ore',type:'ore',w:1,v:75,lvl:25},iridium:{name:'Iridium',type:'ore',w:1,v:110,lvl:35},
  sifarite:{name:'Sifarite',type:'ore',w:.5,v:400,lvl:60,desc:'Engineer-made exotic matter. Negative energy density in a bottle.'},
  food:{name:'Food (t)',type:'trade',w:1,v:18},meds:{name:'Medical supplies',type:'trade',w:.5,v:70},machinery:{name:'Machinery',type:'trade',w:2,v:55},
  electronics:{name:'Electronics',type:'trade',w:.5,v:90},luxury:{name:'Luxury goods',type:'trade',w:.5,v:140},
  pearl:{name:'Thalassi light-pearl',type:'trade',w:.2,v:380},archive:{name:'Kepleri archive slate',type:'trade',w:1,v:520},
  relic:{name:'Engineer relic shard',type:'trade',w:1,v:900},contraband:{name:'Unregistered ORACLE core',type:'trade',w:1,v:600,illegal:true},
  // quest
  keelkey:{name:'The Keel Key',type:'quest',w:0,v:0,desc:'A hand-sized lattice that hums at 1.42 GHz, the hydrogen line.'},
  shard:{name:'Resonance shard',type:'quest',w:0,v:0},
  quietlog:{name:'Quiet archive log',type:'quest',w:0,v:0},
  quietcore:{name:'The Quiet Core',type:'quest',w:0,v:0},
  elderchart:{name:'Elder Chart',type:'quest',w:0,v:0},
  drillmemo:{name:'Europa drill memo',type:'quest',w:0,v:0},
  package:{name:'Sealed package',type:'quest',w:0,v:0},
};
for(const k in WEAPONS)ITEMS[k]=Object.assign({type:'weapon',w:3,v:{sidearm:120,carbine:650,breacher:520,gauss:2400,lance:1800,null:0}[k]},ITEMS[k]||{});

/* ── Ship hulls & modules (EVE-style fitting: slots, power grid, CPU) ── */
const HULLS={
  wren:{name:'Wren',cls:'Skiff',slots:{high:1,mid:1,low:1},pg:40,cpu:30,hull:300,speed:270,turn:2.3,cargo:20,crew:2,fuel:40,cost:6000,req:{},desc:'Two-seat utility skiff. Fast, fragile, cheap.'},
  kestrel:{name:'Kestrel',cls:'Frigate',slots:{high:2,mid:2,low:2},pg:85,cpu:78,hull:650,speed:230,turn:1.75,cargo:45,crew:4,fuel:80,cost:18000,req:{},desc:'The Concord\'s workhorse survey frigate.'},
  lancer:{name:'Lancer',cls:'Corvette',slots:{high:3,mid:1,low:2},pg:115,cpu:62,hull:560,speed:310,turn:2.45,cargo:25,crew:3,fuel:70,cost:42000,req:{piloting:15},desc:'Interceptor hull. Engines with a cockpit attached.'},
  mule:{name:'Mule',cls:'Hauler',slots:{high:1,mid:3,low:2},pg:75,cpu:55,hull:900,speed:175,turn:1.0,cargo:260,crew:3,fuel:120,cost:30000,req:{},desc:'Bulk hauler. Frontier families live aboard these for decades.'},
  meridian:{name:'Meridian',cls:'Explorer',slots:{high:3,mid:3,low:3},pg:150,cpu:115,hull:1300,speed:210,turn:1.3,cargo:95,crew:9,fuel:160,cost:68000,req:{engineering:20},desc:'Long-range explorer with a full bridge, labs and a crew of nine. Built for going where the charts end.'},
  bastion:{name:'Bastion',cls:'Cruiser',slots:{high:5,mid:3,low:4},pg:250,cpu:165,hull:2700,speed:165,turn:.9,cargo:120,crew:12,fuel:180,cost:185000,req:{engineering:35},desc:'Concord line cruiser. Owning one privately raises questions.'},
  seed:{name:'Seedship',cls:'Engineer',slots:{high:4,mid:4,low:4},pg:330,cpu:250,hull:3200,speed:290,turn:1.6,cargo:200,crew:12,fuel:260,cost:0,craft:{sifarite:40,relic:6,iridium:30},req:{engineering:60},desc:'An Engineer seed-vessel regrown around a human bridge. It hums when it is happy.'},
};
const MODULES={
  // high slots: weapons & mining
  pulse1:{slot:'high',name:'Pulse Laser I',pg:10,cpu:8,dps:18,range:900,kind:'laser',cost:1500,craft:{iron:6,titanium:2},req:{}},
  pulse2:{slot:'high',name:'Pulse Laser II',pg:18,cpu:12,dps:30,range:1000,kind:'laser',cost:5200,craft:{titanium:8,platinum:2},req:{engineering:15}},
  rail1:{slot:'high',name:'Mass Driver',pg:25,cpu:15,dps:40,range:1800,kind:'rail',cost:7800,craft:{titanium:10,iridium:2},req:{engineering:20}},
  missile:{slot:'high',name:'Hornet Launcher',pg:12,cpu:22,dps:34,range:1600,kind:'missile',cost:6400,craft:{titanium:6,he3:2},req:{engineering:18}},
  plasma:{slot:'high',name:'Plasma Lance',pg:38,cpu:20,dps:62,range:650,kind:'plasma',cost:16000,craft:{iridium:6,he3:4},req:{engineering:35}},
  nulllance:{slot:'high',name:'Null Lance',pg:60,cpu:40,dps:130,range:1500,kind:'null',cost:0,craft:{sifarite:8,relic:2},req:{engineering:60}},
  mine1:{slot:'high',name:'Mining Laser I',pg:8,cpu:6,mine:1,range:700,kind:'mine',cost:1200,craft:{iron:5},req:{}},
  mine2:{slot:'high',name:'Mining Laser II',pg:16,cpu:10,mine:2.2,range:800,kind:'mine',cost:6000,craft:{titanium:6,platinum:1},req:{engineering:20,mining:20}},
  drill:{slot:'high',name:'Deep Core Lance',pg:30,cpu:18,mine:4,range:600,kind:'mine',cost:21000,craft:{iridium:5,platinum:6},req:{engineering:40,mining:45}},
  // mid slots
  shield1:{slot:'mid',name:'Shield Emitter S',pg:12,cpu:14,shield:260,regen:12,cost:2000,craft:{iron:6,titanium:3},req:{}},
  shield2:{slot:'mid',name:'Shield Emitter M',pg:24,cpu:22,shield:520,regen:20,cost:8200,craft:{titanium:10,platinum:2},req:{engineering:20}},
  shield3:{slot:'mid',name:'Shield Emitter L',pg:44,cpu:34,shield:1050,regen:36,cost:26000,craft:{iridium:8,he3:4},req:{engineering:45}},
  scanner:{slot:'mid',name:'Survey Scanner',pg:6,cpu:18,scan:1,cost:2600,craft:{iron:4,titanium:2},req:{},desc:'Reveals ore grades and anomalies. Science XP from scans.'},
  cargoext:{slot:'mid',name:'Cargo Expander',pg:2,cpu:6,cargo:60,cost:1800,craft:{iron:10},req:{}},
  burner:{slot:'mid',name:'Afterburner',pg:14,cpu:10,boost:.35,cost:3000,craft:{titanium:4,he3:1},req:{}},
  tractor:{slot:'mid',name:'Tractor Beam',pg:8,cpu:12,tractor:1,cost:2400,craft:{iron:6,titanium:2},req:{engineering:8}},
  // low slots
  armor1:{slot:'low',name:'Armor Plating I',pg:6,cpu:2,hull:300,speed:-.04,cost:1400,craft:{iron:12},req:{}},
  armor2:{slot:'low',name:'Armor Plating II',pg:10,cpu:4,hull:720,speed:-.06,cost:7000,craft:{titanium:14},req:{engineering:25}},
  reactor1:{slot:'low',name:'Auxiliary Reactor',pg:-30,cpu:4,cost:3200,craft:{titanium:4,he3:2},req:{}},
  reactor2:{slot:'low',name:'D-He3 Reactor',pg:-72,cpu:8,cost:15000,craft:{iridium:4,he3:6},req:{engineering:30}},
  heatsink:{slot:'low',name:'Heat Sink',pg:2,cpu:8,dmg:.2,cost:4200,craft:{titanium:6,platinum:1},req:{engineering:10}},
  damper:{slot:'low',name:'Inertial Damper',pg:4,cpu:10,turn:.25,cost:3800,craft:{titanium:6},req:{engineering:10}},
  cpucore:{slot:'low',name:'Co-Processor',pg:3,cpu:-30,cost:3600,craft:{platinum:2,titanium:2},req:{engineering:12}},
  fueltank:{slot:'low',name:'Fuel Bladder',pg:1,cpu:2,fuel:.5,cost:1500,craft:{iron:8},req:{}},
  cryo:{slot:'low',name:'Cryo Berths',pg:6,cpu:6,crew:4,cost:5200,craft:{titanium:6,ice:6},req:{medicine:10}},
  // drives: speed in multiples of c; range per jump in ly; fuel per ly
  torch:{slot:'drive',name:'Daedalus Fusion Torch',pg:0,cpu:0,warp:.12,range:99999,fuelLy:2,cost:0,req:{},desc:'D-He3 inertial fusion, 12% of lightspeed after a year of acceleration. Interstellar trips take decades; crews sleep.'},
  warp1:{slot:'drive',name:'White–Juday Field Drive I',pg:20,cpu:12,warp:52,range:12,fuelLy:1,cost:0,req:{},desc:'Alcubierre-type warp bubble stabilized with the recipe from the Null Signal. Proxima in a month.'},
  warp2:{slot:'drive',name:'White–Juday Field Drive II',pg:30,cpu:18,warp:180,range:30,fuelLy:.8,cost:48000,craft:{he3:20,iridium:10,platinum:10},req:{engineering:30}},
  warp3:{slot:'drive',name:'White–Juday Field Drive III',pg:44,cpu:26,warp:520,range:65,fuelLy:.6,cost:0,craft:{sifarite:10,iridium:16,he3:24},req:{engineering:50}},
  fold:{slot:'drive',name:'Engineer Fold Core',pg:60,cpu:40,warp:1e6,range:120,fuelLy:.1,cost:0,craft:{sifarite:30,relic:5},req:{engineering:70}},
};

/* ── Crew (bridge stations, Orville-style) ── */
const CREW={
  noor:{name:'Noor Rahman',role:'Executive Officer',station:'xo',bonus:'+10% mission rewards; morale holds under pressure.',color:'#e9bf70',body:'michelle',tint:'#dfe6f2',look:{suit:'#2b3a52',skin:'#8a5a3c',hair:'#1b1410',h:1.68},
    want:'A Concord that still works when she is gone.',fear:'Winning the announcement and losing the country.'},
  ilyas:{name:'Dr. Ilyas Sen',role:'Science Officer',station:'science',bonus:'Scanner range +50%, science checks −5, decodes the Sifar signal.',color:'#b29adb',body:'soldier',tint:'#c8c0d8',look:{suit:'#3a2d52',skin:'#9c6b48',hair:'#241a14',h:1.78},
    want:'Knowledge that stays open to challenge.',fear:'Being asked to certify something nobody can inspect.'},
  mara:{name:'Mara Voss',role:'Chief Engineer',station:'engineering',bonus:'+15% power grid, hull self-repair in space, engineering checks −5.',color:'#81afd6',body:'michelle',tint:'#f0e0c8',look:{suit:'#4a3a24',skin:'#e0b596',hair:'#a3522a',h:1.72},
    want:'Systems that are still maintained after the ribbon is cut.',fear:'Another emergency used to postpone repairs.'},
  wick:{name:'Tomás "Wick" Arreola',role:'Helm',station:'helm',bonus:'+15% turn rate, +10% top speed, faster warp spool.',color:'#ff9f6b',body:'soldier',tint:'#d8c8b8',look:{suit:'#23384a',skin:'#b98260',hair:'#101010',h:1.75},
    want:'To fly something nobody has flown.',fear:'Being the guy who crashed it.'},
  yara:{name:'Lt. Yara Haddad',role:'Tactical',station:'tactical',bonus:'+15% ship weapon damage, faster target lock.',color:'#ff7a6b',body:'michelle',tint:'#f0d8d8',look:{suit:'#3a2424',skin:'#c69274',hair:'#2a1a12',h:1.7},
    want:'A fair fight, or no fight.',fear:'Following an order she already knows is wrong.'},
  samira:{name:'Dr. Samira Qadir',role:'Chief Medical',station:'medical',bonus:'Heals you fully when you board; +25% medkit healing.',color:'#3ec9a7',body:'michelle',tint:'#ffffff',look:{suit:'#e8eef3',skin:'#a8714f',hair:'#1a1210',h:1.64},
    want:'To bring everyone home, including the people who do not deserve it.',fear:'Triage by algorithm.'},
  ren:{name:'Ren Sato',role:'Envoy',station:'comms',bonus:'Diplomacy checks −5, faction gains +25%.',color:'#9bbdcf',body:'soldier',tint:'#c8d4e0',look:{suit:'#1f2c38',skin:'#e3c1a2',hair:'#0f0f12',h:1.74},
    want:'Agreements rivals can bring home.',fear:'Mistaking humiliation for peace.'},
  ada:{name:'Ada Okoro',role:'Frontier Liaison',station:'ops',bonus:'Frontier markets −10% prices; frontier rep gains +50%.',color:'#75cbb3',body:'michelle',tint:'#e0f0e0',look:{suit:'#2f3d2a',skin:'#5a3a26',hair:'#0c0806',h:1.7},
    want:'People having a say in what is done to them.',fear:'Being invited to the meeting after the decision.'},
  seven:{name:'Seven-Lights',role:'Thalassi Liaison',station:'science2',bonus:'Translates the Choir; reveals Engineer sites on scans.',color:'#5fe0ff',alien:'thalassi',
    want:'To hear what your species sings when nobody is listening.',fear:'Silence.'},
  nine:{name:'Unit Nine',role:'ORACLE Liaison',station:'ops2',bonus:'+20% all XP from data; opens ORACLE doors. ORACLE sees what you see.',color:'#a38cff',alien:'android',
    want:'Optimal outcomes.',fear:'It says it has none. It pauses slightly before saying so.'},
  ihru:{name:'Ihru of the Terraces',role:'Kepleri Archivist',station:'archive',bonus:'Mining yield +25%; Kepleri archives reveal ore veins.',color:'#e8c07a',alien:'kepleri',
    want:'To be remembered accurately.',fear:'To be remembered kindly and wrongly.'},
};

/* ── Radio (GTA-style stations; generative music + news generated from world state) ── */
const RADIO=[
  {id:'solnet',name:'Solnet News 88.1',music:{root:196,scale:[0,3,7,10,12,15],bpm:78,density:.18,voice:'sine',pad:true,sustain:3},news:true},
  {id:'frontier',name:'Frontier Free Radio',music:{root:220,scale:[0,2,4,7,9,12,14],bpm:118,density:.55,voice:'triangle',bassVoice:'triangle',perc:true,sustain:1.2}},
  {id:'oracle',name:'ORACLE Calm Channel',music:{root:174,scale:[0,4,7,11,14,16],bpm:60,density:.22,voice:'sine',pad:true,sustain:4}},
  {id:'syndicate',name:'Barnard Static',music:{root:110,scale:[0,1,5,7,8,12],bpm:132,density:.45,voice:'sawtooth',bassVoice:'square',perc:true,sustain:.8}},
  {id:'ghazal',name:'Radio Lahore Orbital',music:{root:233,scale:[0,1,4,5,7,8,11,12],bpm:84,density:.4,voice:'triangle',pad:true,sustain:2.2}},
  {id:'off',name:'Radio off',music:null},
];

const NAMES={
  first:['Amara','Bilal','Chen','Dara','Emeka','Farah','Gustavo','Hana','Idris','Jun','Kavya','Lars','Mei','Nadia','Omar','Priya','Quinn','Rashid','Sofia','Tariq','Uche','Vera','Wei','Ximena','Yusuf','Zainab','Aiko','Bongani','Catalina','Dmitri','Esi','Farid','Grace','Hamza','Inés','Javier','Kofi','Leila','Mateo','Nour','Olu','Paulo','Rania','Santiago','Talia','Umar','Valentina','Wanjiru','Yosef','Zhao','Ayesha','Hassan','Maryam','Ibrahim','Fatima','Sana','Ali','Hira','Kamran','Theo','Freya'],
  last:['Adeyemi','Bakr','Castillo','Dubois','Eriksen','Fernandes','Ghosh','Haddad','Ibarra','Jovanovic','Kaur','Lindqvist','Mensah','Nakamura','Okafor','Petrov','Qureshi','Rahman','Silva','Tanaka','Usman','Varga','Wu','Xu','Yilmaz','Zhou','Achebe','Baig','Chaudhry','Dlamini','Farouk','Hussain','Iqbal','Kim','Malik','Nwosu','Osei','Park','Siddiqui','Torres'],
};

/* ════════════════ STAR SYSTEMS ════════════════
   gal: galactic longitude/latitude (deg) & distance (ly) from Sol.
   bodies: the space-scene layout (scene units; distances compressed ~1:50,000 so a system is flyable).
   Each body with `site` can be landed on; with `dock` can be docked with. */
const SYSTEMS={
  sol:{name:'Sol',star:{cls:'G2V',color:SPECTRAL.G,K:5772,R:1,M:1,L:1},gal:{l:0,b:0,d:0},control:'concord',security:.9,economy:'core',
    purpose:'Humanity\'s home. Every hull, contract and political fight starts here. Richest markets, strictest law.',
    bodies:[
      {id:'mercury',name:'Mercury',type:'rocky',r:90,orbit:5200,ang:.4,pal:['#8c8580','#5f5a55']},
      {id:'venus',name:'Venus',type:'cloud',r:210,orbit:8200,ang:2.1,pal:['#e8d3a0','#c9a86a'],atmo:'#f4dca0'},
      {id:'earth',name:'Earth',type:'earth',r:230,orbit:11500,ang:0,pal:['#2a5d9a','#3d7a3e'],atmo:'#7fb8ff',site:'earth',moons:[{id:'luna',name:'Luna',type:'rocky',r:62,orbit:900,ang:1.2,pal:['#a9a6a0','#6f6c68'],site:'luna'}],station:{id:'lagrange',name:'Lagrange Concord Station',off:[700,120,-600]}},
      {id:'mars',name:'Mars',type:'mars',r:140,orbit:16500,ang:-1.1,pal:['#b5562e','#7a3a22'],atmo:'#e0a574',site:'mars'},
      {id:'belt',name:'Main Belt',type:'belt',orbit:22000,width:1600,ores:['iron','ice','titanium','platinum'],density:1},
      {id:'ceres',name:'Ceres',type:'rocky',r:48,orbit:22000,ang:.9,pal:['#6d6a66','#4a4845'],site:'ceres'},
      {id:'jupiter',name:'Jupiter',type:'gas',r:900,orbit:34000,ang:2.5,pal:['#d9b48a','#a86f46','#efe1c4'],atmo:'#e7c89c',scoop:'he3',moons:[{id:'europa',name:'Europa',type:'ice',r:55,orbit:1900,ang:.6,pal:['#d8cbb8','#9b7a5a'],site:'europa'}]},
      {id:'saturn',name:'Saturn',type:'gas',r:760,orbit:46000,ang:-2.3,pal:['#e3cf9c','#b89a62','#f3e6c6'],rings:true,atmo:'#ecd9a8',scoop:'he3',moons:[{id:'titan',name:'Titan',type:'haze',r:70,orbit:2300,ang:-.5,pal:['#d99a3c','#a86a24'],atmo:'#e8a84a',site:'titan'}]},
      {id:'mirrorgate',name:'The Mirror Gate',type:'gate',r:240,orbit:52000,ang:1.2,flag:'gate_echo'},
    ]},
  alphacen:{name:'Alpha Centauri',star:{cls:'M5.5Ve',color:SPECTRAL.M,K:3042,R:.154,M:.122,L:.0017,flare:true},gal:{l:315.7,b:-.7,d:4.24},control:'frontier',security:.55,economy:'colony',
    purpose:'Humanity\'s first extrasolar colony, and the site of the Keel. Proxima\'s flares shape everything built here.',
    companions:[{name:'Alpha Centauri A',color:SPECTRAL.G,dir:[.8,.25,-.55],mag:2.5},{name:'Alpha Centauri B',color:SPECTRAL.K,dir:[.79,.27,-.56],mag:1.8}],
    bodies:[
      {id:'proxima_b',name:'Proxima b',type:'terminator',r:170,orbit:4200,ang:.3,pal:['#6b4a3a','#d8e2ea'],atmo:'#d99a7a',site:'proxima_b',station:{id:'afterlight_high',name:'Afterlight High',off:[520,90,380]}},
      {id:'proxima_d',name:'Proxima d',type:'rocky',r:60,orbit:2600,ang:2.2,pal:['#7a5a48','#4a3428']},
      {id:'keelgate',name:'The Keel Gate',type:'gate',r:220,orbit:4200,ang:.55,flag:'gate_keel'},
      {id:'pbelt',name:'Proxima debris',type:'belt',orbit:9000,width:900,ores:['iron','ice','titanium'],density:.6},
    ]},
  barnard:{name:"Barnard's Star",star:{cls:'M4V',color:SPECTRAL.M,K:3134,R:.19,M:.16,L:.0035},gal:{l:31.0,b:14.1,d:5.96},control:'syndicate',security:.1,economy:'pirate',
    purpose:'Lawless free port. Black market, bounty hunting, smuggling contracts, and the best price for anything the Concord would confiscate.',
    bodies:[
      {id:'barnard_b',name:'Barnard b',type:'lava',r:80,orbit:1800,ang:1,pal:['#3a2a24','#ff6a2a']},
      {id:'bbelt',name:'Barnard drift',type:'belt',orbit:7000,width:1400,ores:['iron','titanium','platinum'],density:.9},
      {id:'deep',name:'Barnard Deep',type:'station',r:0,orbit:7000,ang:-.6,dock:'barnard_deep',big:true},
    ]},
  epseri:{name:'Epsilon Eridani',star:{cls:'K2V',color:SPECTRAL.K,K:5084,R:.74,M:.82,L:.34},gal:{l:195.8,b:-48.1,d:10.5},control:'frontier',security:.5,economy:'mining',
    purpose:'A young star (400–800 million years) still wrapped in two debris belts. The Frontier\'s mining capital. Best ore prices anywhere.',
    bodies:[
      {id:'aegir',name:'Ægir (ε Eri b)',type:'gas',r:700,orbit:14000,ang:1.4,pal:['#8aa2c8','#4a6088','#c7d4ea'],atmo:'#9ab4dc',scoop:'he3'},
      {id:'ebelt1',name:'Inner belt (3 AU)',type:'belt',orbit:8000,width:1300,ores:['iron','titanium','platinum','iridium'],density:1.2},
      {id:'ebelt2',name:'Outer belt (20 AU)',type:'belt',orbit:24000,width:2400,ores:['ice','platinum','iridium'],density:1},
      {id:'hold',name:'Eridani Hold',type:'station',r:0,orbit:8000,ang:.2,dock:'eridani_hold',big:true},
    ]},
  tauceti:{name:'Tau Ceti',star:{cls:'G8V',color:'#fff0dc',K:5344,R:.79,M:.78,L:.52},gal:{l:173.1,b:-73.4,d:11.9},control:'none',security:.25,economy:'ruins',gateFlag:'gate_tau',
    purpose:'A Sun-like star with ten times the Sun\'s cometary debris. On the fourth world stand the ruins of a machine civilization that went quiet.',
    bodies:[
      {id:'tauceti_e',name:'Tau Ceti e',type:'cloud',r:140,orbit:6000,ang:2.4,pal:['#d9b27a','#b08040'],atmo:'#e6c08a'},
      {id:'tauceti_f',name:'Tau Ceti f',type:'ruin',r:160,orbit:9500,ang:.2,pal:['#5a6070','#8a8f9a'],atmo:'#9aa6b8',site:'tauceti_f'},
      {id:'tbelt',name:'Tau Ceti debris disk',type:'belt',orbit:16000,width:3000,ores:['iron','platinum','iridium','ice'],density:1.5},
      {id:'taugate',name:'Engineer Gate',type:'gate',r:220,orbit:9500,ang:.5,flag:'gate_tau'},
    ]},
  lhs1140:{name:'LHS 1140',star:{cls:'M4.5V',color:SPECTRAL.M,K:3096,R:.21,M:.18,L:.0038},gal:{l:120.6,b:-77.6,d:48.8},control:'frontier',security:.35,economy:'mining',
    purpose:'A super-Earth at 1.9 g. Crushing to live on, but its crust is rich in platinum and iridium. Deepwell Rigs pays danger money.',
    bodies:[
      {id:'lhs1140_b',name:'LHS 1140 b',type:'snowball',r:230,orbit:6000,ang:.8,pal:['#c8d8e4','#5a7a94'],atmo:'#a8c8e0',site:'lhs1140_b'},
      {id:'lhs1140_c',name:'LHS 1140 c',type:'lava',r:110,orbit:2400,ang:-1.8,pal:['#4a3024','#d26a3a']},
    ]},
  trappist:{name:'TRAPPIST-1',star:{cls:'M8V',color:'#ff7a4a',K:2566,R:.119,M:.089,L:.00055},gal:{l:69.7,b:-56.6,d:40.7},control:'thalassi',security:.6,economy:'alien',gateFlag:'gate_trappist',
    purpose:'Seven Earth-sized worlds packed tighter than Mercury\'s orbit around an ultracool dwarf. On the fourth, something answers in light.',
    bodies:[
      {id:'t1b',name:'TRAPPIST-1b',type:'lava',r:90,orbit:1500,ang:0,pal:['#3a2620','#b8502a']},
      {id:'t1c',name:'TRAPPIST-1c',type:'rocky',r:92,orbit:2000,ang:1.1,pal:['#8a6a58','#5a4034']},
      {id:'t1d',name:'TRAPPIST-1d',type:'cloud',r:66,orbit:2700,ang:2.3,pal:['#c8b8a0','#8a7a60'],atmo:'#d8c8a8'},
      {id:'trappist_e',name:'TRAPPIST-1e',type:'ocean',r:78,orbit:3500,ang:-.4,pal:['#1a4a6a','#3ac4d8'],atmo:'#7ad8f0',site:'trappist_e'},
      {id:'t1f',name:'TRAPPIST-1f',type:'ice',r:88,orbit:4600,ang:-1.5,pal:['#c8dce8','#8aa8c0'],atmo:'#b8d8f0'},
      {id:'t1g',name:'TRAPPIST-1g',type:'ice',r:95,orbit:5600,ang:-2.6,pal:['#b0c8dc','#7090b0']},
      {id:'t1h',name:'TRAPPIST-1h',type:'ice',r:62,orbit:7400,ang:2.9,pal:['#d8e4ec','#9ab0c4']},
      {id:'trgate',name:'Engineer Gate',type:'gate',r:220,orbit:3500,ang:-.15,flag:'gate_trappist'},
    ]},
  kepler452:{name:'Kepler-452',star:{cls:'G2V',color:'#fff1e0',K:5757,R:1.11,M:1.04,L:1.2},gal:{l:77.0,b:13.0,d:1800},control:'kepleri',security:.7,economy:'alien',gateFlag:'gate_kepler',
    purpose:'Earth\'s older cousin: a star 1.5 billion years older than the Sun and 20% brighter. The Kepleri are watching their oceans leave.',
    bodies:[
      {id:'kepler452_b',name:'Kepler-452b',type:'elder',r:300,orbit:11000,ang:.5,pal:['#a88a5a','#3a6a8a'],atmo:'#f0d0a0',site:'kepler452_b'},
      {id:'kgate',name:'Engineer Gate',type:'gate',r:220,orbit:11000,ang:.75,flag:'gate_kepler'},
    ]},
  sgra:{name:'Sagittarius A*',star:{cls:'BH',color:'#000000',K:0,R:0,M:4.3e6,L:0,blackhole:true},gal:{l:0,b:0,d:26670},control:'engineers',security:.5,economy:'none',gateFlag:'gate_throat',
    purpose:'The supermassive black hole at the centre of the Milky Way, 4.3 million solar masses. The Engineers built their hub on its most stable orbit.',
    bodies:[
      {id:'throat',name:'The Throat',type:'hub',r:180,orbit:9000,ang:0,pal:['#2a2420','#f2a33a'],site:'throat'},
      {id:'sgate',name:'The Throat Gate',type:'gate',r:320,orbit:9000,ang:.3,flag:'gate_throat'},
    ]},
  lmc:{name:'Large Magellanic Cloud',star:{cls:'O3',color:SPECTRAL.O,K:45000,R:15,M:100,L:1e6},gal:{l:280.5,b:-32.9,d:160000},control:'engineers',security:.05,economy:'relic',gateFlag:'gate_lmc',nebula:'#ff5a8a',
    purpose:'A satellite galaxy 160,000 ly away, lit by the Tarantula Nebula. An abandoned Engineer foundry guarded by sentinels, and the only natural source of sifarite.',
    bodies:[
      {id:'hollow',name:'Hollow Reach',type:'station',r:0,orbit:6000,ang:.4,dock:'hollow_reach',big:true,engineer:true},
      {id:'sbelt',name:'Sifarite shoal',type:'belt',orbit:6000,width:2200,ores:['iridium','platinum','sifarite'],density:1.2,hostile:true},
      {id:'lgate',name:'Engineer Gate',type:'gate',r:240,orbit:9000,ang:-.8,flag:'gate_lmc'},
    ]},
  echo:{name:'Mirror Sol (the Echo)',star:{cls:'G2V',color:'#dfe8ff',K:5690,R:1,M:1,L:.96},gal:{l:180,b:-89,d:.4},control:'none',security:.2,economy:'none',gateFlag:'gate_echo',nebula:'#6fd8e8',
    purpose:'The universe next door: a Sol where the story went the other way. Its Earth is dark. Its Moon has been hollowed into a hospital the size of a world.',
    bodies:[
      {id:'mirrorearth',name:'Mirror Earth',type:'earth',r:230,orbit:11500,ang:3.1,pal:['#1a2230','#202a24'],atmo:'#8fd8e8'},
      {id:'theatre',name:'The Theatre',type:'mega',r:380,orbit:9000,ang:0,pal:['#d8dde2','#8fe8ff'],site:'theatre'},
      {id:'egate',name:'The Mirror Gate',type:'gate',r:240,orbit:9000,ang:.4,flag:'gate_echo'},
    ]},
  m31:{name:'Andromeda (M31)',star:{cls:'G0V',color:'#fff8ee',K:5900,R:1.1,M:1.1,L:1.3},gal:{l:121.2,b:-21.6,d:2537000},control:'engineers',security:.8,economy:'none',gateFlag:'gate_m31',
    purpose:'2.5 million light-years away. The Anchorage: an Engineer megastructure the size of a continent, orbiting an ordinary yellow star.',
    bodies:[
      {id:'anchorage',name:'The Anchorage',type:'mega',r:420,orbit:9000,ang:0,pal:['#2a2a30','#f2a33a'],site:'anchorage'},
      {id:'mgate',name:'Engineer Gate',type:'gate',r:320,orbit:9000,ang:.35,flag:'gate_m31'},
    ]},
};

/* Real nearby stars used for procedural free-play systems. Catalogue values; planet contents are generated from a seed. */
const REAL_STARS=[
  ['wolf359','Wolf 359','M6V',7.9,244.1,56.1,'One of the faintest stars you can reach. Flares often.'],
  ['lalande','Lalande 21185','M2V',8.3,185.1,65.4,'Bright red dwarf with at least two confirmed planets.'],
  ['sirius','Sirius','A1V',8.6,227.2,-8.9,'The brightest star in Earth\'s sky, with a white dwarf companion.'],
  ['uvceti','Luyten 726-8','M5.5V',8.7,175.5,-75.7,'A pair of flare stars, including UV Ceti, the type star for flare stars.'],
  ['ross154','Ross 154','M3.5V',9.7,11.3,-10.3,'Young, active red dwarf.'],
  ['ross248','Ross 248','M6V',10.3,109.9,-16.9,'In 36,000 years it will be the closest star to Sol.'],
  ['lacaille9352','Lacaille 9352','M0.5V',10.7,5.1,-66.0,'Fast-moving red dwarf with two super-Earths.'],
  ['ross128','Ross 128','M4V',11.0,270.0,59.6,'Quiet star with a temperate Earth-mass planet.'],
  ['cygni61','61 Cygni','K5V',11.4,82.3,-5.8,'Binary K dwarfs. The first star to have its distance measured, by Bessel in 1838.'],
  ['procyon','Procyon','F5IV',11.5,213.7,13.0,'A subgiant with a white dwarf companion.'],
  ['groombridge34','Groombridge 34','M1.5V',11.6,116.7,-18.4,'Binary red dwarfs.'],
  ['epsind','Epsilon Indi','K5V',11.9,336.2,-48.0,'K dwarf with a cold giant planet imaged by JWST and two brown dwarfs.'],
  ['gj1061','Gliese 1061','M5.5V',12.0,281.0,-51.0,'Three compact planets; d is temperate.'],
  ['luyten','Luyten\'s Star','M3.5V',12.4,212.3,10.4,'Planet b sits in the habitable zone.'],
  ['teegarden','Teegarden\'s Star','M7V',12.5,160.3,-37.0,'Two Earth-mass planets in the habitable zone.'],
  ['kapteyn','Kapteyn\'s Star','M1VI',12.8,250.5,-36.0,'A halo star, about 11 billion years old and passing through the disk.'],
  ['wolf1061','Wolf 1061','M3V',14.0,3.4,23.6,'Planet c orbits on the inner edge of the habitable zone.'],
  ['gj876','Gliese 876','M4V',15.2,52.0,-59.6,'Four planets locked in a Laplace resonance.'],
  ['eri40','40 Eridani','K0V',16.3,200.8,-38.1,'A triple system: a K dwarf, a white dwarf and a red dwarf.'],
  ['altair','Altair','A7V',16.7,47.7,-8.9,'Spins so fast it is 20% wider at the equator than at the poles.'],
  ['gj581','Gliese 581','M3V',20.5,354.2,40.0,'Famous for disputed planets; c and e are real.'],
  ['gj667c','Gliese 667 C','M1.5V',23.6,351.8,32.2,'A red dwarf in a triple system with several super-Earths.'],
  ['vega','Vega','A0V',25.0,67.4,19.2,'Young and bright, surrounded by a broad debris disk.'],
  ['fomalhaut','Fomalhaut','A3V',25.1,20.5,-64.9,'Ringed by a sharp dust belt 140 AU out.'],
  ['cnc55','55 Cancri','K0IV',41.0,197.0,44.0,'Five planets, including 55 Cnc e, a lava world with a possible atmosphere.'],
  ['hd40307','HD 40307','K2.5V',42.0,265.0,-27.0,'Six planets, including a super-Earth in the habitable zone.'],
];
/* catalogue stars are registered as systems in cosmos.js */

/* ════════════════ SURFACE SITES ════════════════ */
const SITES={
  earth:{name:'New Geneva Arcology',body:'Earth',system:'sol',g:1.0,breathable:true,day:24,faction:'concord',style:'city',pop:'31 million (arcology)',
    temp:'22 °C',atm:'1 atm, N₂/O₂',purpose:'Concord capital. Hull dealers, the richest market in Sol, courier work, and the strictest police.',
    sky:{zen:'#2a6ad0',hor:'#bcdcff',fog:'#b9d5ef',fogD:.0024,sunCol:'#fff3df',sunSize:1,sunEl:.75,stars:0,haze:.6},
    ground:['#48683a','#5f7a45','#8a8a80','#6d665c'],terrain:{amp:34,scale:.0035,oct:5,flat:210,ridge:.2},sea:{level:-5,color:'#1a4f7a'},
    props:'trees',services:['market','shipyard','clinic','jobs','bar'],enemies:['thug','secdrone'],ores:[],traffic:true,
    amb:{wind:.05,windFreq:500,drone:[55,82.5],vol:.14},radio:'solnet'},
  luna:{name:'Shackleton Base',body:'Luna',system:'sol',g:.1654,breathable:false,day:0,faction:'concord',style:'dome',pop:'48,000',
    temp:'−173 °C in crater shadow',atm:'Vacuum',purpose:'Concord Navy HQ and the Far-Side Array that caught the Null Signal. Water ice in permanent shadow.',
    sky:{zen:'#000000',hor:'#05060a',fog:'#07080c',fogD:.0006,sunCol:'#ffffff',sunSize:1,sunEl:.03,stars:1,haze:0},
    ground:['#5a5854','#77746e','#9c9890','#4a4844'],terrain:{amp:42,scale:.004,oct:6,flat:170,craters:26},
    skyBodies:[{kind:'earth',dir:[.3,.08,-.95],size:.07}],
    props:'boulders',services:['market','clinic','jobs'],enemies:['rogueDrone'],ores:['ice','iron','he3'],
    amb:{wind:0,drone:[41,61.5,82],vol:.12}},
  mars:{name:'Tharsis Yards',body:'Mars',system:'sol',g:.379,breathable:false,day:24.62,faction:'frontier',style:'yards',pop:'1.2 million',
    temp:'−63 °C',atm:'0.006 atm CO₂',purpose:'Shipbuilding capital. Best module crafting in Sol, iron and titanium deposits, and a labor dispute about to boil over.',
    sky:{zen:'#8a5a3a',hor:'#e2b184',fog:'#d4a276',fogD:.0028,sunCol:'#fff1dd',sunSize:.66,sunEl:.5,stars:.1,haze:.8,sunsetBlue:true},
    ground:['#8f4a28','#a85e34','#c38456','#6e3a22'],terrain:{amp:60,scale:.0028,oct:6,flat:200,ridge:.5,craters:8},
    props:'mesas',services:['market','shipyard','crafting','clinic','jobs','bar'],enemies:['raider','rogueDrone'],ores:['iron','titanium'],
    amb:{wind:.09,windFreq:300,drone:[49,73.5],vol:.14},radio:'frontier'},
  ceres:{name:'Occator Freeport',body:'Ceres',system:'sol',g:.029,breathable:false,day:9.07,faction:'frontier',style:'dome',pop:'210,000',
    temp:'−105 °C',atm:'Vacuum',purpose:'Frontier League capital built over the bright salt deposits of Occator crater. He-3 depot, black market, and 0.03 g jumps.',
    sky:{zen:'#000000',hor:'#06070b',fog:'#08090d',fogD:.0006,sunCol:'#fffaf0',sunSize:.36,sunEl:.35,stars:1,haze:0},
    ground:['#4a4744','#5d5955','#d8d8d0','#3a3836'],terrain:{amp:28,scale:.005,oct:5,flat:180,craters:30,faculae:true},
    props:'boulders',services:['market','crafting','jobs','bar','black'],enemies:['raider'],ores:['ice','iron','platinum'],
    amb:{wind:0,drone:[46,69],vol:.12},radio:'frontier'},
  europa:{name:'Conamara Station',body:'Europa',system:'sol',g:.134,breathable:false,day:85.2,faction:'concord',style:'ice',pop:'3,400',rad:true,
    temp:'−160 °C',atm:'Trace O₂ (10⁻¹² bar)',purpose:'Ocean research over a 100 km-deep sea. Surface radiation of ~5 Sv a day kills in hours unshielded. Something here is being covered up.',
    sky:{zen:'#000000',hor:'#05070c',fog:'#0a0d14',fogD:.0008,sunCol:'#ffffff',sunSize:.19,sunEl:.3,stars:1,haze:0},
    ground:['#b8a88e','#d8ccb8','#efe8dc','#8a6a4a'],terrain:{amp:22,scale:.006,oct:5,flat:170,cracks:true},
    skyBodies:[{kind:'jupiter',dir:[-.55,.35,-.75],size:.22}],
    props:'iceSpikes',services:['market','clinic','jobs'],enemies:['rogueDrone'],ores:['ice'],
    amb:{wind:0,drone:[36,54,72],vol:.14}},
  titan:{name:'Kraken Shore',body:'Titan',system:'sol',g:.138,breathable:false,day:382.7,faction:'frontier',style:'shore',pop:'62,000',glide:true,
    temp:'−179 °C',atm:'1.45 atm N₂/CH₄',purpose:'Hydrocarbon refinery town on the Kraken Mare methane sea. Thick air plus low gravity means you can fly with strap-on wings.',
    sky:{zen:'#a8621e',hor:'#e8a84a',fog:'#d0903e',fogD:.0065,sunCol:'#ffd9a0',sunSize:.1,sunEl:.4,stars:0,haze:1},
    ground:['#6a4a2a','#8a6436','#b08a52','#4a3420'],terrain:{amp:30,scale:.004,oct:5,flat:180},sea:{level:-3,color:'#3a2410',methane:true},
    skyBodies:[{kind:'saturn',dir:[.4,.5,-.7],size:.16,faint:.25}],
    props:'dunes',services:['market','clinic','jobs','bar'],enemies:['raider'],ores:['ice','he3'],
    amb:{wind:.14,windFreq:220,drone:[44,66],vol:.16},radio:'frontier'},
  proxima_b:{name:'Afterlight Colony',body:'Proxima b',system:'alphacen',g:1.1,breathable:false,day:0,faction:'frontier',style:'colony',pop:'38,000',flare:true,
    temp:'−39 °C at the terminator',atm:'Thin N₂/CO₂ (assumed)',purpose:'The first extrasolar colony, founded 2141 on the permanent twilight ring. Flare shelters, frostbitten farms, and the Keel under the nightside ice.',
    sky:{zen:'#141a2a',hor:'#d86a3a',fog:'#6a4a48',fogD:.0035,sunCol:'#ff9a5a',sunSize:3.2,sunEl:.035,stars:.6,haze:.5},
    ground:['#4a3a34','#6a5448','#d8e0e6','#3a2c26'],terrain:{amp:40,scale:.0035,oct:6,flat:190,terminator:true},
    companions:true,props:'lichen',services:['market','clinic','jobs','bar','crafting'],enemies:['crawler','raider'],ores:['iron','titanium','ice'],
    amb:{wind:.11,windFreq:360,drone:[43,64.5],vol:.15},radio:'frontier'},
  lhs1140_b:{name:'Deepwell Rigs',body:'LHS 1140 b',system:'lhs1140',g:1.87,breathable:false,day:0,faction:'frontier',style:'rigs',pop:'2,100',
    temp:'−47 °C',atm:'N₂ (tentative JWST detection)',purpose:'Hazard-pay mining on a 1.9 g super-Earth. Every step hurts. The platinum and iridium here are the richest in human space.',
    sky:{zen:'#1a2a3a',hor:'#8aa6ba',fog:'#8ea4b4',fogD:.004,sunCol:'#ffa878',sunSize:2.2,sunEl:.3,stars:.2,haze:.6},
    ground:['#8aa0b0','#c8d8e4','#f0f6fa','#5a6a78'],terrain:{amp:18,scale:.005,oct:5,flat:170},
    props:'iceSpikes',services:['market','jobs','crafting'],enemies:['raider','crawler'],ores:['platinum','iridium','ice','titanium'],
    amb:{wind:.12,windFreq:260,drone:[38,57],vol:.16}},
  trappist_e:{name:'Choir Reef',body:'TRAPPIST-1e',system:'trappist',g:.82,breathable:false,day:0,faction:'thalassi',style:'reef',pop:'Unknown',
    temp:'4 °C',atm:'Dense N₂/CO₂ (assumed)',purpose:'Tidal shallows of an ocean world. The Thalassi Choir sings in light here, and their pearls are worth a fortune off-world.',
    sky:{zen:'#1a1030',hor:'#c8583a',fog:'#40304a',fogD:.004,sunCol:'#ff6a3a',sunSize:4.2,sunEl:.25,stars:.3,haze:.7},
    ground:['#1a3a3a','#2a5a52','#6a8a7a','#123030'],terrain:{amp:26,scale:.004,oct:5,flat:160},sea:{level:-2,color:'#0c3a4a',glow:true},
    skyBodies:[{kind:'planet',dir:[-.3,.45,-.84],size:.09,col:'#c8b8a0'},{kind:'planet',dir:[.55,.3,-.78],size:.06,col:'#c8dce8'},{kind:'planet',dir:[.1,.62,.78],size:.045,col:'#8a6a58'}],
    props:'coral',services:['market'],enemies:['stinger'],ores:['ice','platinum'],
    amb:{wind:.06,windFreq:600,drone:[65,97.5,130],vol:.16}},
  tauceti_f:{name:'The Quiet',body:'Tau Ceti f',system:'tauceti',g:1.35,breathable:false,day:30,faction:'none',style:'ruins',pop:'0',
    temp:'−62 °C',atm:'Thin CO₂ (assumed)',purpose:'The dead city of a machine civilization. Relic salvage worth fortunes, sentinels that still patrol, and the core that ended them.',
    sky:{zen:'#2a3040',hor:'#9aa4b0',fog:'#8a94a2',fogD:.0034,sunCol:'#fff0dc',sunSize:.55,sunEl:.35,stars:.2,haze:.5},
    ground:['#4a4c52','#606470','#8a8e98','#3a3c42'],terrain:{amp:36,scale:.0035,oct:5,flat:220},
    props:'monoliths',services:[],enemies:['sentinel','rogueDrone'],ores:['iridium','platinum','titanium'],
    amb:{wind:.1,windFreq:320,drone:[33,49.5,66],vol:.16}},
  kepler452_b:{name:'Terraces of Ihru',body:'Kepler-452b',system:'kepler452',g:1.88,breathable:true,day:31,faction:'kepleri',style:'elder',pop:'4.1 million (declining)',
    temp:'41 °C',atm:'1.9 atm N₂/O₂, humid',purpose:'Stone terraces of the Kepleri, built to last a geological age. Archive slates, elder engineering, and a planet running out of time.',
    sky:{zen:'#6a8ac0',hor:'#f4dcb0',fog:'#e8d0a8',fogD:.0032,sunCol:'#fff4e0',sunSize:1.1,sunEl:.6,stars:0,haze:.9},
    ground:['#8a7a4a','#a89060','#d0c090','#6a5a3a'],terrain:{amp:70,scale:.0025,oct:6,flat:230,ridge:.6},sea:{level:-14,color:'#2a5a6a'},
    props:'trees',services:['market','crafting'],enemies:['stinger'],ores:['titanium','platinum','iridium'],
    amb:{wind:.1,windFreq:400,drone:[52,78],vol:.14}},
  theatre:{name:'The Theatre',body:'Operating theatre the size of a moon, the Echo',system:'echo',g:.8,breathable:true,day:0,faction:'none',style:'theatre',pop:'one physician, eight rooms',
    temp:'19 °C (sterile)',atm:'Filtered, faintly antiseptic',purpose:'The Tabib\'s consulting room. Eight wings for eight universes it has kept alive. Seven are lit.',
    sky:{zen:'#02060a',hor:'#0a1a22',fog:'#0c1c24',fogD:.0011,sunCol:'#dfe8ff',sunSize:1.2,sunEl:.35,stars:1,haze:.05},
    ground:['#c8cdd2','#d8dde2','#b8bec4','#e8ecef'],terrain:{amp:0,scale:.004,oct:1,flat:9999,plate:true},
    props:'pylons',services:[],enemies:['orderly'],ores:[],
    amb:{wind:0,drone:[55,82.5,110],vol:.16}},
  throat:{name:'The Throat',body:'Engineer hub, Sgr A*',system:'sgra',g:1.0,breathable:true,day:0,faction:'engineers',style:'engineer',pop:'—',
    temp:'18 °C (regulated)',atm:'Engineer-regulated',purpose:'An Engineer platform on a tight orbit around Sagittarius A*. Time runs slow here: every hour aboard costs about three months outside.',
    sky:{zen:'#000000',hor:'#050308',fog:'#0a0608',fogD:.0009,sunCol:'#ffcf8a',sunSize:0,sunEl:.2,stars:1,haze:0,blackhole:true},
    ground:['#1e1c1a','#2a2622','#3a342c','#141210'],terrain:{amp:0,scale:.004,oct:1,flat:9999,plate:true},
    props:'pylons',services:[],enemies:['construct'],ores:['sifarite'],
    amb:{wind:0,drone:[27.5,41.25,55,82.5],vol:.2}},
  anchorage:{name:'The Anchorage',body:'Engineer megastructure, M31',system:'m31',g:.9,breathable:true,day:0,faction:'engineers',style:'engineer',pop:'1',
    temp:'16 °C',atm:'Engineer-regulated',purpose:'The end of the road, 2.5 million light-years from Earth.',
    sky:{zen:'#0a0612',hor:'#2a1a30',fog:'#1a1020',fogD:.0012,sunCol:'#fff4e0',sunSize:1,sunEl:.15,stars:1,haze:.2,galaxy:true},
    ground:['#24222a','#302c36','#4a4450','#1a181e'],terrain:{amp:0,scale:.004,oct:1,flat:9999,plate:true},
    props:'pylons',services:[],enemies:['construct'],ores:['sifarite'],
    amb:{wind:0,drone:[32.7,49,65.4,98],vol:.2}},
};

/* ── Stations (docking menus) ── */
const STATIONS={
  lagrange:{name:'Lagrange Concord Station',faction:'concord',services:['market','shipyard','outfitter','jobs','repair','bar'],desc:'Earth–Moon L2 naval anchorage. Concord shipyard, customs, and the best-stocked outfitter in Sol.'},
  afterlight_high:{name:'Afterlight High',faction:'frontier',services:['market','outfitter','jobs','repair'],desc:'The colony\'s orbital freight ring, patched together from the original colony ship Long Walk.'},
  barnard_deep:{name:'Barnard Deep',faction:'syndicate',services:['market','outfitter','jobs','repair','bar','black'],desc:'A hollowed comet parked in the dark. No questions, no customs, no refunds.'},
  eridani_hold:{name:'Eridani Hold',faction:'frontier',services:['market','outfitter','shipyard','jobs','repair','crafting'],desc:'Frontier mining capital. Ore sells for 30% over Sol prices here.'},
  hollow_reach:{name:'Hollow Reach',faction:'engineers',services:['crafting','repair','jobs'],desc:'An abandoned Engineer foundry. Its fabricators still work if you know how to ask.'},
};

/* Market economics: base multipliers by economy type (sell price multiplier for each good) */
const ECON={
  core:{food:.9,meds:.9,machinery:.85,electronics:.8,luxury:1.1,iron:.9,ice:1,titanium:1,he3:1.15,platinum:1.1,iridium:1.1,relic:1.3,pearl:1.4,archive:1.4,contraband:0},
  colony:{food:1.5,meds:1.6,machinery:1.4,electronics:1.3,luxury:.8,iron:1,ice:.8,titanium:1.1,he3:1,platinum:.9,iridium:.9,relic:1,pearl:1.1,archive:1.1,contraband:1.2},
  mining:{food:1.3,meds:1.3,machinery:1.3,electronics:1.1,luxury:1,iron:1.2,ice:1.1,titanium:1.3,he3:1.2,platinum:1.3,iridium:1.35,relic:1,pearl:1,archive:1,contraband:1.1},
  pirate:{food:1.2,meds:1.8,machinery:1.1,electronics:1.2,luxury:1.3,iron:.8,ice:.8,titanium:.9,he3:1.3,platinum:1,iridium:1,relic:1.4,pearl:1.2,archive:1.2,contraband:1.8},
  alien:{food:1,meds:1.3,machinery:1.5,electronics:1.6,luxury:1.4,iron:.8,ice:.6,titanium:1,he3:.9,platinum:1,iridium:1.1,relic:1.6,pearl:.6,archive:.6,contraband:0},
  ruins:{food:1.6,meds:1.6,machinery:1.2,electronics:1,luxury:.7,iron:.7,ice:.9,titanium:.8,he3:1.1,platinum:.9,iridium:.9,relic:.7,pearl:1,archive:1,contraband:1},
  relic:{food:2,meds:2,machinery:1.6,electronics:1.5,luxury:.5,iron:.6,ice:1.2,titanium:.8,he3:1.4,platinum:.8,iridium:.8,relic:.5,pearl:1,archive:1,contraband:1},
  frontier:{food:1.4,meds:1.5,machinery:1.3,electronics:1.2,luxury:.9,iron:1,ice:1,titanium:1.1,he3:1.1,platinum:1.1,iridium:1.1,relic:1.1,pearl:1.1,archive:1.1,contraband:1.3},
  none:{},
};

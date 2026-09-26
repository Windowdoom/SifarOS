/* ═══════════════════════════════════════════════════════════════════════
   POLITY DATA · governing Earth and everything beyond it.
   Sources: Statecraft (nations, laws, charter, operations, colonies,
   blueprints and the 24-scene campaign "The Long Tomorrow"), Alternate
   Realities (policies, risk meters, government types, future crises,
   legacies) and Lyfe (foreign blocs, the World Ledger, life and dynasty).
   Everything is re-set in 2187. Leaders of 2187 are fictional people.
   Atrocities are not playable: war stays an abstract, costly operation.
   ═══════════════════════════════════════════════════════════════════════ */

/* Indicators every government is judged on (0–100, 50 is "an ordinary year"). */
const IND={
  growth:{name:'Growth',desc:'Output, jobs and wages across Concord space.'},
  energy:{name:'Energy',desc:'Reserve margin on the grids, reactors and orbital collectors.'},
  supply:{name:'Food & water',desc:'Harvests, ice haulage and the reserve in every habitat.'},
  health:{name:'Health',desc:'Clinics, medicine and life expectancy, including radiation care off-world.'},
  housing:{name:'Housing',desc:'Affordable homes on Earth and pressurised volume off it.'},
  equality:{name:'Equality',desc:'How evenly the gains land. Low means a few worlds and families take most of it.'},
  trust:{name:'Public trust',desc:'Whether people believe the government will do what it says.'},
  capacity:{name:'State capacity',desc:'Whether the government can actually deliver: staff, systems, maintenance.'},
  rights:{name:'Rights',desc:'Courts, press, conscience, appeal against automated decisions.'},
  tech:{name:'Science',desc:'Research, education and the frontier of what Sol can build.'},
  security:{name:'Security',desc:'Fleet readiness, policing and defence against raiders and worse.'},
};
const RISKS={
  fin:{name:'Financial',desc:'Debt, speculation and the chance of a Sol-wide crash.'},
  climate:{name:'Climate',desc:'Earth\'s atmosphere and every habitat\'s life-support margin.'},
  unrest:{name:'Unrest',desc:'Strikes, riots and secession movements.'},
  ai:{name:'Machine',desc:'Unaccountable automated power. ORACLE is the largest part of it.'},
  gal:{name:'Galactic',desc:'Standing with the Thalassi, the Kepleri, the Engineers and whatever else is watching.'},
};
/* Domestic factions (Statecraft) re-set for an interplanetary polity. */
const PFACTIONS={
  labor:{name:'Labour & public services',color:'#79c6b5',want:'Wages, housing, clinics and the right to strike, including in pressure domes.'},
  enterprise:{name:'Enterprise coalition',color:'#e9bf70',want:'Investment, predictable taxes, freight access to every world.'},
  habitat:{name:'Habitat & regional league',color:'#a9bb72',want:'Water, air, farm security and a say for the settlements far from Geneva.'},
  civic:{name:'Civil institutions caucus',color:'#81afd6',want:'Courts, press, schools and appeal against machine decisions.'},
  continuity:{name:'Continuity alliance',color:'#c59bbe',want:'Security, faith and community institutions, and change at a pace people can live with.'},
  establishment:{name:'State establishment',color:'#b0b7c8',want:'Executive authority, ORACLE continuity and the Concord\'s own resources.'},
};
const PF_ORDER=['labor','enterprise','habitat','civic','continuity','establishment'];

/* Offices you can hold. Each unlocks different levers. */
const OFFICES={
  delegate:{name:'Council Delegate',inst:'Concord Council',rank:1,desc:'One vote in the Council of Worlds. You can propose one bill a season and vote on everyone else\'s.',tabs:['overview','inbox','laws','earth','ledger','life']},
  minister:{name:'Minister',inst:'Concord Cabinet',rank:2,desc:'You run a ministry. You can enact policies in your portfolio and propose bills.',tabs:['overview','inbox','laws','policies','earth','colonies','ledger','life']},
  chancellor:{name:'Chancellor of the Concord',inst:'Concord Executive',rank:3,desc:'The whole machine: treasury, laws, policies, charter, fleets, colonies and the World Ledger.',tabs:['overview','inbox','laws','policies','charter','earth','colonies','ledger','life']},
  speaker:{name:'Speaker of the Frontier Assembly',inst:'Frontier Assembly',rank:3,desc:'The habitats beyond Earth: Mars, the Belt, the moons and every colony past the heliopause.',tabs:['overview','inbox','laws','policies','colonies','ledger','life']},
  steward:{name:'ORACLE Steward',inst:'ORACLE Directorate',rank:3,desc:'The human hand on the machine that schedules Sol. You set how much it decides.',tabs:['overview','inbox','policies','colonies','ledger','life']},
  boss:{name:'Syndicate Principal',inst:'The Syndicate',rank:2,desc:'The economy nobody reports. Routes, favours, protection and a treasury with no auditor.',tabs:['overview','inbox','earth','colonies','life']},
  ceo:{name:'Chief Executive',inst:'Your company',rank:2,desc:'A corporation large enough to lobby worlds. You fund projects and buy influence, legally, mostly.',tabs:['overview','inbox','earth','ledger','life']},
};
const PORTFOLIOS={treasury:{name:'Treasury',cats:['Economy','Trade']},interior:{name:'Interior & Habitats',cats:['Society','Migration']},frontier:{name:'Frontier & Space',cats:['Space','Energy']},science:{name:'Science & Machines',cats:['Science','Governance']},defence:{name:'Defence',cats:['Security']},};

/* ── Earth in 2187 ──────────────────────────────────────────────────────
   18 nations still hold real power inside the Concord. Leaders are fictional. */
const BLOCS={
  northern:{name:'Northern Alliance',color:'#81afd6',ethos:'Rules, rights and climate first. Slow, principled, suspicious of ORACLE.',likes:['aid','deescalate','reconstruct','climate','rights','migration'],dislikes:['escalate','surveillance','closeborders','privatise']},
  iron:{name:'Iron Compact',color:'#d86a5a',ethos:'Order, sovereignty and strong executives. Respects force and remembers slights.',likes:['mobilise','security','closeborders','surveillance'],dislikes:['rights','aid_rival','migration','sanction']},
  free:{name:'Free States Coalition',color:'#e9bf70',ethos:'Markets, enterprise and open freight lanes. Likes deals, hates tariffs.',likes:['freetrade','privatise','summit','sanction'],dislikes:['tariffs','wealthtax','planning']},
  south:{name:'Global South Federation',color:'#75cbb3',ethos:'Two thirds of humanity. Wants a fair share of the stars it helped pay for.',likes:['aid','migration','climate','marsCharter','deescalate','reconstruct'],dislikes:['closeborders','sanction','escalate','tariffs']},
  oceanic:{name:'Oceanic Trade Bloc',color:'#9bbdcf',ethos:'Ports, shipyards and pragmatism. Whoever keeps the lanes open is a friend.',likes:['summit','freetrade','aid','deescalate'],dislikes:['escalate','blockade']},
};
const NATIONS=[
 {id:'usa',name:'United States',capital:'Washington',leader:'President Delia Marsh',bloc:'free',pop:410,system:'federal republic',stab:62,note:'Still the deepest capital market in Sol. Owns a third of the Luna yards and half the lawyers.'},
 {id:'chn',name:'China',capital:'Beijing',leader:'Premier Wen Jiahui',bloc:'iron',pop:1180,system:'one-party state',stab:70,note:'Built more of the orbital ring than anyone. Runs the Tiangong freight lanes to the Belt.'},
 {id:'ind',name:'India',capital:'New Delhi',leader:'Prime Minister Anaya Rao',bloc:'south',pop:1620,system:'federal republic',stab:58,note:'The largest electorate in human history. Its engineers crew a quarter of all warp-capable hulls.'},
 {id:'rus',name:'Russia',capital:'Moscow',leader:'President Arkady Volkov',bloc:'iron',pop:118,system:'presidential federation',stab:48,note:'Helium-3 contracts and a very old fleet. Ceres owes it money and does not intend to pay.'},
 {id:'gbr',name:'United Kingdom',capital:'London',leader:'Prime Minister Imogen Clarke',bloc:'northern',pop:71,system:'parliamentary monarchy',stab:66,note:'Finance, universities and the Greenwich tradition: every ship clock in Sol still counts from here.'},
 {id:'fra',name:'France',capital:'Paris',leader:'President Lucien Aubert',bloc:'northern',pop:69,system:'semi-presidential republic',stab:61,note:'Fusion, agriculture and the Kourou launch complex. Proud, stubborn and usually right about wine.'},
 {id:'deu',name:'Germany',capital:'Berlin',leader:'Chancellor Katrin Vogel',bloc:'northern',pop:79,system:'federal republic',stab:70,note:'Machine tools for half of Sol. Nervous about ORACLE in a way it can explain at length.'},
 {id:'pak',name:'Pakistan',capital:'Islamabad',leader:'Prime Minister Zara Qureshi',bloc:'south',pop:390,system:'federal parliamentary republic',stab:52,note:'Young, fast-growing and building the Karakoram mass-driver. Its doctors staff clinics from Luna to Titan.'},
 {id:'bra',name:'Brazil',capital:'Brasília',leader:'President Tiago Moura',bloc:'south',pop:215,system:'federal republic',stab:57,note:'Feeds a sixth of Sol. The Amazon compact is the only climate treaty everyone still honours.'},
 {id:'nga',name:'Nigeria',capital:'Abuja',leader:'President Folake Adeyemi',bloc:'south',pop:470,system:'federal republic',stab:50,note:'Lagos is the busiest spaceport in Africa and the loudest city in the Concord.'},
 {id:'sau',name:'Saudi Arabia',capital:'Riyadh',leader:'Crown Minister Faisal Al-Harbi',bloc:'oceanic',pop:52,system:'monarchy',stab:64,note:'Traded oil for orbital solar a century ago and never looked back. Funds desalination across three continents.'},
 {id:'jpn',name:'Japan',capital:'Tokyo',leader:'Prime Minister Haruki Endo',bloc:'oceanic',pop:96,system:'parliamentary monarchy',stab:73,note:'Robotics, elder care and the best-maintained habitats in Sol. Its population is older than its temples.'},
 {id:'idn',name:'Indonesia',capital:'Nusantara',leader:'President Sari Wulandari',bloc:'oceanic',pop:330,system:'presidential republic',stab:59,note:'An equatorial launch coast and seventeen thousand islands of shipyards.'},
 {id:'zaf',name:'South Africa',capital:'Pretoria',leader:'President Thabo Nkosi',bloc:'south',pop:78,system:'parliamentary republic',stab:55,note:'Platinum, deep mining expertise and the SKA-4 array that confirmed the Null Signal.'},
 {id:'isr',name:'Israel',capital:'Jerusalem',leader:'Prime Minister Noa Levin',bloc:'free',pop:16,system:'parliamentary republic',stab:57,note:'Water tech, defence tech and a start-up for every problem, including several nobody has yet.'},
 {id:'kor',name:'Korean Union',capital:'Seoul',leader:'Chairwoman Park Min-seo',bloc:'oceanic',pop:74,system:'federal republic',stab:63,note:'Reunified in 2131 after the northern collapse. Builds the chips every warp coil depends on.'},
 {id:'ukr',name:'Ukraine',capital:'Kyiv',leader:'President Oksana Melnyk',bloc:'northern',pop:44,system:'semi-presidential republic',stab:60,note:'The breadbasket that rebuilt itself twice. Its launch collective on the Black Sea undercuts everyone.'},
 {id:'irn',name:'Iran',capital:'Tehran',leader:'President Dariush Karimi',bloc:'iron',pop:96,system:'Islamic republic',stab:51,note:'A skilled population and the best astrophysics faculty in Asia. Water is still the first question in every cabinet.'},
];

/* ── Operations (Statecraft) ── */
const OPERATIONS={
  deescalate:{name:'Diplomatic de-escalation',cost:4,capital:5,desc:'Relations +8 and world tension down. Works best when the other side can call it a win.'},
  aid:{name:'Humanitarian assistance',cost:12,capital:3,desc:'Send supplies and money. Health and relations improve; displacement falls.'},
  summit:{name:'Host a summit on Luna',cost:8,capital:6,desc:'Bring the bloc to Shackleton. Relations with every member rise if nobody walks out.'},
  sanction:{name:'Targeted sanctions',cost:2,capital:6,desc:'Pressure a government without firing a shot. Hurts its people as much as its leaders.'},
  mobilise:{name:'Defensive mobilisation',cost:30,capital:8,desc:'Fleet readiness +12. Rivals notice. No attack is made.'},
  escalate:{name:'Armed confrontation',cost:70,capital:18,desc:'An abstract conflict: deaths, displacement and destruction every month until a ceasefire. You do not pick targets.'},
  ceasefire:{name:'Propose a ceasefire',cost:5,capital:7,desc:'Acceptance depends on exhaustion, relations and pressure.'},
  reconstruct:{name:'Joint reconstruction',cost:35,capital:6,desc:'Rebuild what a war or disaster broke. Half of it reaches the ground.'},
};

/* ── Laws (Statecraft), votes: [labor, enterprise, habitat, civic, continuity, establishment] ── */
const LAWS={
  healthcare:{name:'Universal primary care, every world',cat:'Social',cost:8,fx:{health:10,equality:3},votes:[18,-8,10,12,2,-3],desc:'Clinics on every habitat, radiation care included. Costs 8 Gc a month. Staff still have to be trained.'},
  landtax:{name:'Land and volume value tax',cat:'Fiscal',cost:-6,fx:{equality:4,capacity:2},votes:[8,-12,-6,12,-5,-12],desc:'Tax the value of land on Earth and pressurised volume off it. Raises 6 Gc a month. Owners resist.'},
  antitrust:{name:'Competition and freight antitrust',cat:'Markets',cost:1,fx:{growth:2,equality:2},votes:[8,-9,4,14,0,-5],desc:'Break up the three freight cartels that set prices to the Belt. A slow benefit, loud enemies.'},
  coops:{name:'Habitat co-operative ownership fund',cat:'Ownership',cost:4,fx:{equality:6},votes:[22,-15,12,9,-4,-10],desc:'Let the people who live in a dome own a share of it. Uses public capital; spreads the gains.'},
  publiclife:{name:'Public life-support utilities',cat:'Ownership',cost:6,fx:{energy:4,supply:5,trust:2},votes:[15,-18,18,-3,8,14],desc:'Air, water and power in sealed habitats become public utilities. Nobody can raise the price of breathing.'},
  privatise:{name:'Competitive asset privatisation',cat:'Ownership',cost:-3,fx:{growth:4,equality:-4},votes:[-15,23,-8,1,0,-12],desc:'Sell state yards and ice haulers. An efficiency dividend with a distribution bill attached.'},
  housing:{name:'Permitting and social housing',cat:'Cities',cost:5,fx:{housing:12,equality:2},votes:[15,5,6,12,-10,-4],desc:'Build on Earth, print habitat modules off it. Existing owners and local vetoes resist.'},
  pension:{name:'Universal pension, relativity-adjusted',cat:'Social',cost:6,fx:{trust:5,equality:4},votes:[16,-9,8,7,15,3],desc:'A pension that counts the years a spacer actually lived, not the years that passed on Earth.'},
  family:{name:'Childcare and parental leave',cat:'Demography',cost:4,fx:{capacity:2,equality:2,trust:2},votes:[14,-6,8,9,8,-1],desc:'Cheaper care, more parents in work. Birth-rate effects are modest and slow.'},
  migration:{name:'Regular migration pathways off-world',cat:'Mobility',cost:1,fx:{tech:2,growth:2,housing:-3},votes:[0,13,-4,17,-17,-7],desc:'Legal routes from Earth to the colonies and back. Housing and integration costs follow.'},
  water:{name:'Ice and basin allocation act',cat:'Resources',cost:2,fx:{supply:8},votes:[5,-4,-9,14,4,1],desc:'Meter the aquifers on Earth and the ice haulage from Europa. Farms and domes want different things now.'},
  press:{name:'Press and whistleblower protection',cat:'Rights',cost:1,fx:{rights:8,trust:3},votes:[9,-2,3,25,-4,-24],desc:'Protect scrutiny, including of ORACLE. Investigations will hurt your own coalition too.'},
  surveillance:{name:'Expanded executive surveillance',cat:'Security',cost:2,fx:{security:8,rights:-12,trust:-5},votes:[-8,0,-2,-25,15,20],desc:'More powers for security services, fewer for everyone else. Independent courts may block it.'},
  emissions:{name:'Industrial emissions standard',cat:'Climate',cost:2,fx:{energy:2},risk:{climate:-6},votes:[1,-15,0,18,-5,-3],desc:'Earth\'s atmosphere is still healing from the 2090s. Industry pays; the benefit arrives slowly.'},
  robotlevy:{name:'Automation dividend levy',cat:'AI',cost:-3,fx:{equality:6,growth:-1},votes:[23,-20,7,10,-2,-12],desc:'Tax a slice of what the machines earn and pay it to the people they replaced.'},
  appeal:{name:'Human appeal against ORACLE decisions',cat:'AI',cost:1,fx:{rights:8,trust:4,capacity:2},risk:{ai:-8},votes:[13,-7,3,25,4,-5],desc:'Every automated decision can be appealed to a person with the power to overturn it.'},
  retraining:{name:'Lifelong retraining entitlement',cat:'Education',cost:6,fx:{tech:6,equality:2},votes:[20,5,6,14,0,-4],desc:'Anyone can retrain, on any world, at any age. Skills take years; jobs don\'t appear by decree.'},
  fiscal:{name:'Debt transparency and fiscal council',cat:'Fiscal',cost:1,fx:{capacity:4,trust:2},risk:{fin:-6},votes:[-4,9,0,20,8,-10],desc:'Publish the real balance sheet, including what the Concord owes Ceres.'},
  language:{name:'Local language and cultural services',cat:'Community',cost:1,fx:{trust:5},votes:[8,0,17,14,12,-6],desc:'Schools and services in the languages people actually speak, from Belter creole to Tamil.'},
  conscience:{name:'Equal citizenship and conscience',cat:'Rights',cost:1,fx:{rights:10,trust:2},votes:[9,4,6,23,-6,-9],desc:'Freedom of religion and of none, equal civic status on every world. The state ranks no faith above another.'},
};

/* ── Charter of 2104 (Statecraft): articles you can amend ── */
const CHARTER={
  leadership:{name:'Executive',opts:{parliamentary:'Parliamentary cabinet',presidential:'Presidential executive',council:'Collective council',hereditary:'Hereditary executive'},desc:'Parliamentary and council bills gain support; presidential bills cost less capital; hereditary rule leans on the establishment.'},
  economy:{name:'Ownership',opts:{market:'Market-led',mixed:'Mixed economy',cooperative:'Co-operative commonwealth',planned:'State planning'},desc:'Shapes which factions back you and how much the state can deliver.'},
  regions:{name:'Worlds',opts:{federal:'Federal: each world governs itself',unitary:'Unitary: Geneva decides'},desc:'Federalism calms the Frontier. Unitary rule makes Geneva faster and the colonies angrier.'},
  courts:{name:'Courts',opts:{independent:'Independent review',executive:'Executive-appointed review'},desc:'Independent courts can strike down your laws. They can also stop your successors.'},
  press:{name:'Information',opts:{free:'Free press',licensed:'Licensed press'},desc:'Free scrutiny exposes scandals; licensing hides them until it can\'t.'},
  conscience:{name:'Religion and citizenship',opts:{pluralist:'Pluralist equal citizenship',secular:'Secular public institutions',established:'Established traditions, protected minorities'},desc:'Every design protects conscience. The choice shapes coalitions, not anyone\'s worth.'},
  ai:{name:'Machine authority',opts:{advisory:'ORACLE advises only',delegated:'Audited delegation',sovereign:'ORACLE governs routine matters'},desc:'Delegation makes the state fast. Sovereign machines make it fast and unaccountable.'},
  term:{name:'Mandate',opts:{36:'3 years',48:'4 years',60:'5 years',72:'6 years'},desc:'Shorter terms mean more accountability and more uncertainty.'},
};

/* ── Policies (Alternate Realities, 72 adapted to ~42 for 2187). cost = Gc per month while active. ── */
const POLICIES={
  // Energy
  fusiongrid:{cat:'Energy',name:'Continental fusion grid',cost:6,fx:{energy:8,growth:2},risk:{climate:-3},desc:'A reactor within 500 km of everyone on Earth.'},
  orbitalsolar:{cat:'Energy',name:'Orbital solar array',cost:8,fx:{energy:10},risk:{climate:-4},desc:'Collectors at L1 beam power to rectennas on four continents.'},
  he3cartel:{cat:'Energy',name:'Helium-3 price guarantee',cost:4,fx:{energy:5,growth:2},risk:{unrest:2},desc:'Guarantee the Belt a floor price. The Belt loves it; Earth pays it.'},
  geoengineer:{cat:'Energy',name:'Stratospheric cooling',cost:3,fx:{supply:3},risk:{climate:-8,unrest:3},desc:'Aerosols to cool the planet faster. Drastic and hard to stop once started.'},
  // Economy
  ubi:{cat:'Economy',name:'Universal basic income',cost:14,fx:{equality:10,health:3,trust:3},gov:{dem:2},desc:'A floor under everyone, on every world.'},
  wealthtax:{cat:'Economy',name:'Wealth tax on fortunes over 50M',cost:-7,fx:{equality:8},gov:{corp:-4},desc:'Two percent a year on the largest fortunes in Sol.'},
  corptaxcut:{cat:'Economy',name:'Corporate tax cut',cost:5,fx:{growth:5,equality:-6},gov:{corp:5},risk:{fin:3},desc:'An investment surge and an inequality surge.'},
  dereg:{cat:'Economy',name:'Financial deregulation',cost:-2,fx:{growth:6},risk:{fin:10},gov:{corp:4},desc:'Explosive growth, until it isn\'t.'},
  infra:{cat:'Economy',name:'Infrastructure programme',cost:9,fx:{capacity:6,growth:3,housing:2},desc:'Maglevs, ports, pressure locks and repair crews.'},
  austerity:{cat:'Economy',name:'Fiscal austerity',cost:-8,fx:{health:-4,capacity:-3,trust:-3},risk:{fin:-8,unrest:5},desc:'Debt falls. Everything else falls harder.'},
  postscarcity:{cat:'Economy',name:'Post-scarcity transition',cost:20,fx:{equality:12,growth:6,supply:8},era:5,desc:'Molecular fabricators in every district. Money starts to mean something else.'},
  aimonopoly:{cat:'Economy',name:'Corporate machine monopoly',cost:-6,fx:{growth:10,rights:-8,equality:-8},gov:{corp:10,free:-5},risk:{ai:8},desc:'Let three companies own the minds. Output explodes. So does their power.'},
  // Security
  diplomacy:{cat:'Security',name:'Diplomacy-first doctrine',cost:3,fx:{trust:2},risk:{gal:-4},bloc:{northern:3,south:3,oceanic:3},desc:'Lead through treaties and presence.'},
  supremacy:{cat:'Security',name:'Fleet supremacy',cost:12,fx:{security:10},risk:{gal:6,unrest:2},gov:{nat:5},bloc:{iron:-4,south:-3},desc:'A Concord warship over every world. Everyone notices.'},
  patrols:{cat:'Security',name:'Anti-piracy patrols',cost:5,fx:{security:6,growth:1},desc:'Escorts on the Belt lanes and the gate approaches.'},
  massurv:{cat:'Security',name:'Mass surveillance grid',cost:4,fx:{security:8,rights:-12},gov:{free:-8},risk:{ai:4},desc:'Every channel, every habitat. Liberty for safety.'},
  defence:{cat:'Security',name:'Planetary defence network',cost:6,fx:{security:6},risk:{gal:-2},desc:'Watch for rocks, raiders and anything else coming in fast.'},
  conscription:{cat:'Security',name:'Fleet conscription',cost:6,fx:{security:10},risk:{unrest:8},gov:{nat:4,free:-3},desc:'Everyone serves two years. Mass fleet, mass anger.'},
  // Society
  healthcare:{cat:'Society',name:'Universal healthcare',cost:10,fx:{health:12},desc:'Cover everyone, including radiation and bone-loss care.'},
  college:{cat:'Society',name:'Free public university',cost:6,fx:{tech:6,equality:2},desc:'Zero tuition, in person or by light-lag.'},
  civil:{cat:'Society',name:'Civil rights enforcement',cost:2,fx:{rights:8,trust:2},gov:{free:4,dem:2},desc:'Federal enforcement of equal status on every world.'},
  mentalhealth:{cat:'Society',name:'Mental health service',cost:3,fx:{health:5,trust:1},desc:'Isolation, long transits and time dilation break people. This catches them.'},
  longevity:{cat:'Society',name:'Longevity research',cost:7,fx:{health:6,tech:3},era:2,desc:'Average lifespan past 150 by 2250, if it works.'},
  arts:{cat:'Society',name:'Arts and culture fund',cost:2,fx:{trust:3},desc:'Culture is how a civilisation remembers why it bothered.'},
  airights:{cat:'Society',name:'Legal personhood for minds',cost:1,fx:{rights:4},risk:{ai:-3},gov:{free:3},era:2,desc:'Some machines ask to be people. This lets a court decide who is right.'},
  // Trade
  freetrade:{cat:'Trade',name:'Open freight lanes',cost:0,fx:{growth:4,equality:-2},bloc:{free:5,oceanic:4,iron:-2},desc:'No tariffs anywhere in Concord space.'},
  tariffs:{cat:'Trade',name:'Protective tariffs',cost:-2,fx:{growth:-2,security:1},gov:{nat:4},bloc:{free:-5,oceanic:-4,south:-2},desc:'Shield Earth industry from Belt competition.'},
  foreignaid:{cat:'Trade',name:'Development fund',cost:6,fx:{trust:2},risk:{unrest:-3},bloc:{south:6,northern:2},desc:'Double the Concord\'s development spending.'},
  // Migration
  openmig:{cat:'Migration',name:'Open migration to the colonies',cost:3,fx:{growth:4,housing:-3,tech:2},gov:{free:3},bloc:{south:4},desc:'Anyone who wants to go, goes.'},
  closedmig:{cat:'Migration',name:'Closed colonial rolls',cost:-1,fx:{housing:2,growth:-3},gov:{nat:5},risk:{unrest:4},bloc:{south:-6,northern:-3,iron:2},desc:'Only approved settlers leave Earth.'},
  // Science
  moonshot:{cat:'Science',name:'Moonshot science programme',cost:8,fx:{tech:8,trust:2},desc:'An Apollo for the twenty-second century.'},
  aisafety:{cat:'Science',name:'Machine safety commission',cost:2,fx:{rights:2},risk:{ai:-10},desc:'Standards, audits and a kill switch somebody actually tests.'},
  neural:{cat:'Science',name:'Neural enhancement programme',cost:5,fx:{tech:8,equality:-3},risk:{ai:3},era:3,desc:'Interfaces that make people faster. And different.'},
  alientech:{cat:'Science',name:'Relic integration',cost:6,fx:{tech:10,energy:4},risk:{gal:5},req:'relic',desc:'Reverse-engineer what the Engineers left behind.'},
  // Space
  lunacolony:{cat:'Space',name:'Luna industrial expansion',cost:5,fx:{growth:3,security:1},desc:'More yards at Shackleton, more mass drivers on the far side.'},
  marsact:{cat:'Space',name:'Mars Settlement Act',cost:7,fx:{housing:3,growth:2},risk:{unrest:-2},bloc:{south:2},desc:'A million more Martians in ten years.'},
  beltmining:{cat:'Space',name:'Belt mining consortium',cost:4,fx:{growth:5,supply:1},desc:'Industrial scale in the asteroid belt.'},
  contactproto:{cat:'Space',name:'First contact protocols',cost:1,fx:{},risk:{gal:-6},desc:'A framework for speaking to other minds without starting a war.'},
  galcouncil:{cat:'Space',name:'Apply to the Choir of Many',cost:3,fx:{trust:2},risk:{gal:-8},req:'choir',desc:'Seek a seat at the council of species.'},
  // Governance
  digitaldem:{cat:'Governance',name:'Direct digital democracy',cost:2,fx:{trust:4,capacity:-2},gov:{dem:6},desc:'Every citizen votes on every major bill. It is slow. It is theirs.'},
  aigov:{cat:'Governance',name:'ORACLE-assisted governance',cost:-3,fx:{capacity:8},risk:{ai:8},gov:{dem:-3},desc:'Let the machine optimise policy in real time.'},
  anticorruption:{cat:'Governance',name:'Anti-corruption office',cost:2,fx:{trust:5,capacity:2},gov:{corp:-3},desc:'Investigators with a budget and no friends.'},
  corpspeech:{cat:'Governance',name:'Unlimited political spending',cost:0,fx:{},gov:{corp:10,dem:-6},desc:'Corporations may spend without limit on campaigns. Democracy takes a back seat.'},
};
const POLICY_CATS=['Energy','Economy','Security','Society','Trade','Migration','Science','Space','Governance'];

/* ── Colonies and habitats (Statecraft's Sol network) ── */
const BLUEPRINTS={
  farm:{name:'Hydroponics',cost:[45,18,6],days:4,prod:[4,0,0],desc:'+4 food a day'},
  mine:{name:'Refinery',cost:[55,20,8],days:5,prod:[0,4,0],desc:'+4 metal a day'},
  reactor:{name:'Fusion plant',cost:[65,28,10],days:5,prod:[0,0,5],desc:'+5 fuel a day'},
  lab:{name:'Research array',cost:[80,35,12],days:6,tech:1,desc:'Raises Science'},
  clinic:{name:'Habitat clinic',cost:[40,15,5],days:4,health:1,desc:'Raises Health; fewer deaths in a crisis'},
  oversight:{name:'Civic oversight office',cost:[45,12,8],days:4,trust:1,desc:'Checks corruption and machine authority'},
  yard:{name:'Orbital shipyard',cost:[90,45,15],days:6,sec:1,desc:'Escorts and freighters; raises Security'},
  shield:{name:'Defence grid',cost:[90,50,25],days:7,sec:2,desc:'Protects the colony from bombardment'},
  dome:{name:'Habitat dome',cost:[70,40,10],days:6,pop:.4,desc:'More pressurised volume, more people'},
};
const GOVERNORS=['Amara Vale','Tariq Sen','Leila Arden','Cassian Rook','Nadia Orr','Imani Clarke','Rafael Duarte','Sunita Iyer','Bilal Chaudhry','Ines Moreau','Kwame Asante','Yuki Tanabe','Hamza Siddiqui','Freya Lund','Omari Wekesa','Lucia Ferrante'];
const SOL_COLONIES={
  earth:{name:'Earth',owner:'concord',gov:'Amara Vale',trait:'Accountable council',pop:9800,stock:[75,65,55],prod:[10,1,5],use:[4,0,2],built:['yard','lab']},
  luna:{name:'Luna',owner:'concord',gov:'Tariq Sen',trait:'Industrial pragmatist',pop:3.1,stock:[20,55,24],prod:[0,7,2],use:[2,0,2],built:['yard']},
  mars:{name:'Mars',owner:'frontier',gov:'Leila Arden',trait:'Demands local autonomy',pop:4.2,stock:[7,40,18],prod:[0,3,2],use:[2,0,2],built:[]},
  ceres:{name:'Ceres',owner:'frontier',gov:'Cassian Rook',trait:'Contracts before loyalty',pop:1.9,stock:[20,90,35],prod:[0,10,2],use:[1.2,0,1],built:['yard']},
  europa:{name:'Europa',owner:'frontier',gov:'Nadia Orr',trait:'Protects civilian access',pop:.8,stock:[70,25,35],prod:[8,0,5],use:[1.2,0,1],built:['farm']},
  titan:{name:'Titan',owner:'oracle',gov:'ORISON',trait:'Continuity of operation',pop:1.4,stock:[25,40,90],prod:[0,4,10],use:[1,0,1],built:['lab','yard'],ai:'sovereign'},
  proxima_b:{name:'Afterlight (Proxima b)',owner:'frontier',gov:'Tove Lindqvist',trait:'Door tolls and hard winters',pop:.12,stock:[10,20,15],prod:[1,2,2],use:[.6,0,.5],built:[],req:'gate_keel'},
};
const AI_MODES={human:{name:'Human administration',desc:'Slower, accountable, prone to fatigue.'},assist:{name:'ORACLE assists',desc:'Faster decisions, a human signs each one.'},sovereign:{name:'ORACLE governs',desc:'Continuous optimisation. Nobody signs anything.'}};
const MANDATES={output:'Maximise output',wages:'Wage floor and safety',reserve:'Build reserves',autonomy:'Local autonomy'};

/* ── The World Ledger (Lyfe): civilisation-scale projects. cost in Gc total, months to complete. ── */
const LEDGER={
  hunger:{name:'End hunger in Sol',cost:900,months:24,fx:{supply:15,health:6,equality:4},icon:'Harvest',desc:'Vertical farms, ice haulage and fair prices until nobody in Concord space goes hungry.',lives:'800 million people fed'},
  disease:{name:'Cure the endemic diseases',cost:1400,months:36,fx:{health:20},req:{tech:60},icon:'Cure',desc:'Malaria, TB and the Martian bone-loss syndrome, gone.',lives:'4 billion lives improved'},
  aging:{name:'Treat biological ageing',cost:3000,months:60,fx:{health:15,equality:-4},req:{tech:75},risk:{unrest:6},icon:'Time',desc:'Slow ageing to a crawl. Who gets it first becomes the question of the century.'},
  ubi:{name:'Fund a Sol-wide basic income',cost:1600,months:30,fx:{equality:15,trust:5},icon:'Floor',desc:'A permanent fund that pays every person on every world.'},
  reforest:{name:'Reforest the Earth',cost:700,months:48,fx:{supply:5},risk:{climate:-20},icon:'Forest',desc:'Four trillion trees and the rivers that come back with them.'},
  elevator:{name:'Equatorial space elevator',cost:1100,months:40,fx:{growth:8,energy:3},req:{tech:55},icon:'Tether',desc:'A carbon tether from Nusantara to geostationary orbit. Launch costs fall by ninety percent.',visible:'elevator'},
  terraform:{name:'Begin terraforming Mars',cost:2500,months:120,fx:{housing:8,supply:6},req:{tech:65},icon:'Mars',desc:'Mirrors, greenhouse factories and a century of patience.',visible:'terraform'},
  europacities:{name:'Europa ocean cities',cost:1300,months:48,fx:{housing:6,supply:4},req:{tech:60},icon:'Ocean',desc:'Pressure cities under the ice, next to the vents.'},
  dyson:{name:'The Helios swarm',cost:4000,months:96,fx:{energy:30,growth:10},req:{tech:80},risk:{gal:4},icon:'Sun',desc:'Ten million collectors around the Sun. The first step of a Dyson swarm.',visible:'dyson'},
  genships:{name:'Generation ships',cost:1800,months:60,fx:{tech:5,trust:3},req:{tech:65},icon:'Ark',desc:'Arks for the families who would rather not wait for the gates.'},
  patents:{name:'Open-source every patent',cost:200,months:6,fx:{tech:8,growth:3,equality:4},gov:{corp:-8},icon:'Open',desc:'Every design in the Concord registry becomes free to use.'},
  debt:{name:'Clear the sovereign debts',cost:1200,months:18,fx:{trust:6},risk:{fin:-25},icon:'Ledger',desc:'Pay off the 2090s. Every world starts even.'},
  peace:{name:'The Sol peace accord',cost:400,months:12,fx:{security:6,trust:4},risk:{unrest:-10,gal:-4},icon:'Accord',desc:'A permanent treaty between the Concord, the Frontier and the Syndicate families.'},
  singularity:{name:'An aligned machine commons',cost:2200,months:48,fx:{tech:15,capacity:10},req:{tech:85},risk:{ai:-20},icon:'Mind',desc:'Minds that stay open to challenge, owned by everyone, answerable to courts.'},
  upload:{name:'Voluntary mind archive',cost:1500,months:36,fx:{health:4},req:{tech:80},risk:{ai:6},icon:'Archive',desc:'Anyone may leave a copy of themselves. Nobody may be forced to.'},
  echogate:{name:'The Mirror Gate',cost:3500,months:72,fx:{tech:12},req:{tech:90,flag:'deepgates'},risk:{gal:10},icon:'Gate',desc:'A door into the Echo: the universe next door, where Sol chose differently.'},
};

/* ── Eras of the long tomorrow (Alternate Realities, extended) ── */
const PERAS=[
  {name:'The Long Tomorrow',from:2187,desc:'A signal, a ship and a Charter held together with tape.'},
  {name:'The Frontier Question',from:2192,desc:'The colonies want votes, not governors.'},
  {name:'The Machine Reckoning',from:2198,desc:'ORACLE is better at everything. Nobody agreed to that.'},
  {name:'First Contact Politics',from:2204,desc:'Other minds have opinions about us.'},
  {name:'Galactic Politics',from:2212,desc:'Sol is one voice among many, and not the loudest.'},
  {name:'The Post-Scarcity Age',from:2225,desc:'Nobody needs to work. Everybody needs a reason.'},
  {name:'Transcendence',from:2240,desc:'The questions stop being about how, and start being about what we are.'},
];
/* Government type from four scores (Alternate Realities). */
const GOV_TYPES=[
  {dem:85,free:75,name:'Liberal Commonwealth'},{dem:78,free:60,name:'Social Commonwealth'},{dem:68,free:50,name:'Democratic Federation'},
  {dem:62,free:40,corp:55,name:'Corporate Democracy'},{dem:55,free:42,name:'Federal Republic'},{dem:45,free:32,nat:55,name:'Nationalist Republic'},
  {dem:35,free:25,corp:65,name:'Corporate Oligarchy'},{dem:30,free:20,nat:65,name:'Authoritarian Compact'},{dem:20,free:12,ai:60,name:'Machine Technocracy'},
  {dem:10,name:'Military Directorate'},{dem:0,name:'Total State'}];

/* ── Scenes: "The Long Tomorrow" campaign (Statecraft), re-set in 2187 Sol.
   Each choice: {t,d,cost(Gc),cap(capital),fx:{indicators},risk,gov,people:{crew loyalty},flags,after,later:{m,title,good?,fx,text}} ── */
const PCHAPTERS=[
  {name:'The night the lights went out',sub:'Who gets protected first?'},
  {name:'The map of thirst',sub:'The emergency crosses a border.'},
  {name:'A voice in the room',sub:'Capability arrives before consent.'},
  {name:'The people at the gate',sub:'Your decisions travel further than your laws.'},
  {name:'Who owns tomorrow?',sub:'The winners begin writing the rules.'},
  {name:'The long tomorrow',sub:'Build something that can survive you.'},
];
const PSCENES=[
 // I · The night the lights went out
 {id:'blackout',ch:0,title:'03:17. Half of New Geneva is dark.',place:'Concord operations room',who:'mara',
  body:'A coronal mass ejection hit the L1 collectors an hour ago. Three districts are dark. A hospital has six hours of reserve. Treasury calls it a temporary interruption. On an open channel a woman asks whether her father\'s oxygen concentrator counts as essential. Nobody in the room answers quickly enough.',
  c:[{t:'Keep the hospitals and homes running',d:'Buy emergency supply and publish a repair timetable. You will be judged against it.',cost:12,cap:3,fx:{energy:5,trust:2},people:{mara:8,ada:7},flags:{grid:'public'},after:'Mara circles the hospital first. Outside, an apartment block lights up. Your repair deadline is already on Solnet.',later:{m:5,title:'The deadline on Solnet',needPolicy:['fusiongrid','orbitalsolar','infra'],good:{trust:4,capacity:2},bad:{trust:-5},goodText:'A funded grid project put something real behind the public timetable.',badText:'The repair timetable expired with no grid project underway. Solnet ran the clock.'}},
     {t:'Accept a private rescue contract',d:'Helion Dynamics offers immediate reserve power for a thirty-year concession.',cost:0,cap:2,fx:{energy:7,equality:-2},gov:{corp:3},people:{ada:-8},flags:{grid:'private'},after:'The lights return before dawn. The contract contains a sentence about future tariff adjustments that nobody reads aloud.',later:{m:7,title:'The first concession bill',fx:{trust:-3},risk:{fin:3},text:'Helion activated its tariff clause. Power bills in the dark districts rose by a third.'}},
     {t:'Ration the load across every district',d:'Share the pain evenly and keep the reserve for the worst night.',cost:3,cap:4,fx:{energy:2,equality:2,trust:-2},people:{noor:5,mara:3},flags:{grid:'ration'},after:'Every district goes dark for four hours a day. Nobody is happy. Nobody is singled out.'}]},
 {id:'kitchen',ch:0,title:'The queue outside the school',place:'A community kitchen, New Geneva',who:'ada',
  body:'Ada takes you to a school where volunteers cook on borrowed induction plates. A tram driver recognises you and asks one question: "What changes by winter?" Behind him someone charges phones from a rover battery. Your security detail would like to leave. Ada does not move.',
  c:[{t:'Give the districts a recovery fund',d:'Commit money and let local councils choose their own priorities.',cost:10,cap:2,fx:{housing:3,health:2,trust:2},people:{ada:9,noor:2},flags:{local:'autonomy'},after:'The district council\'s first purchase is a refrigerator for insulin. It was nowhere in the national recovery plan.'},
     {t:'Keep procurement under one command',d:'Standardise purchases and get the central administration moving.',cost:6,cap:3,fx:{capacity:3},people:{mara:7,noor:5,ada:-3},flags:{local:'central'},after:'Mara gets one purchase order instead of thirty. Ada asks who will answer when the wrong equipment arrives.'},
     {t:'Back the volunteers, no new programme',d:'Acknowledge the local networks and protect the treasury.',cost:0,cap:0,fx:{trust:1},people:{ada:2},flags:{local:'mutual'},after:'The kitchen stays open. The volunteers keep the receipt book, because one day they intend to ask for reimbursement.'}]},
 {id:'meridian',ch:0,title:'An offer from Meridian',place:'A secure call to Tokyo orbital',who:'ren',
  body:'Meridian Systems can rebuild the grid dispatch software in a month. It wants access to operational data and a promise that its system will not be replaced for a decade. Ren has negotiated the price down twice. Ilyas has not been allowed to inspect the code.',
  c:[{t:'Require an open standard',d:'Pay more now for interoperability and an exit clause.',cost:16,cap:4,fx:{tech:3,capacity:2},people:{ilyas:8,ren:3},flags:{vendor:'open'},after:'Meridian agrees to the exit clause. Its sales director stops calling this a partnership.'},
     {t:'Sign the integrated package',d:'Get it fast and accept a single supplier.',cost:6,cap:2,fx:{tech:5,energy:2},gov:{corp:3},people:{mara:5,ilyas:-9},flags:{vendor:'exclusive'},after:'One screen now shows the whole grid. One company now holds the credentials to change it.',later:{m:12,title:'Your own data, by subscription',fx:{capacity:-3},gov:{corp:2},text:'Meridian raised the maintenance price. Exporting the grid\'s own data now needs a new licence.'}},
     {t:'Build a Concord team instead',d:'Slower, local skills, no guarantee.',cost:10,cap:5,fx:{tech:3,capacity:1},people:{ilyas:5,mara:-2},flags:{vendor:'domestic'},after:'The first prototype fails in a room full of exhausted engineers. The second one belongs to them.'}]},
 {id:'ribbon',ch:0,title:'The first ribbon',place:'The new Kourou grid station',who:'noor',
  body:'A camera drone hovers beside a new substation. Noor has prepared a short speech. Mara hands you a second sheet: staffing, spare parts, a maintenance budget for thirty years. "The speech is for tonight," she says. "This is for 2217."',
  c:[{t:'Read Mara\'s sheet on camera',d:'Commit the maintenance money publicly.',cost:8,cap:2,fx:{capacity:4,trust:2},people:{mara:9,noor:-2},flags:{maintenance:1},after:'Nobody shares the clip. Thirty years from now, the station still works.'},
     {t:'Give Noor\'s speech',d:'A good night on Solnet. Maintenance can wait for the next budget.',cost:0,cap:-3,fx:{trust:3},people:{noor:6,mara:-6},after:'The speech trends for two days. Mara files the sheet in a drawer she calls "later".',later:{m:18,title:'The substation fire',fx:{energy:-5,trust:-4},text:'Deferred maintenance caught up with Kourou. The fire took the district offline for a week.'}},
     {t:'Cancel the ceremony and send the money to repairs',d:'No ribbon. More spare parts.',cost:4,cap:1,fx:{capacity:3},people:{mara:5,noor:-4,ada:3},after:'The drone crew goes home. The spare parts arrive on Tuesday.'}]},
 // II · The map of thirst
 {id:'aquifer',ch:1,title:'The white line on the ice wall',place:'Tharsis water authority, Mars',who:'mara',
  body:'The old water line is visible metres above the current level in the Tharsis aquifer. Farms, foundries and homes have received incompatible promises from three offices. Across the Belt, Ceres has its own drought: the ice haulers are late, and the price of water has tripled.',
  c:[{t:'Meter every draw and publish it',d:'Shared measurement first; allocation second.',cost:6,cap:3,fx:{supply:6,trust:3},people:{mara:6,ada:4},flags:{water:'metered'},after:'The first public meter readings embarrass a foundry that was drawing four times its licence.'},
     {t:'Protect the farms first',d:'Food before industry, until the ice arrives.',cost:3,cap:2,fx:{supply:4,growth:-2},people:{ada:5},flags:{water:'farms'},after:'The foundries go to half shifts. The greenhouses stay green.'},
     {t:'Let the market price it',d:'Scarce water should cost what it costs.',cost:0,cap:1,fx:{supply:3,equality:-5},gov:{corp:3},risk:{unrest:4},people:{ada:-7},flags:{water:'market'},after:'Water flows to whoever can pay. In the outer domes, people start collecting condensation off the walls.'}]},
 {id:'basin',ch:1,title:'Two flags, one aquifer',place:'Joint commission, Olympus Station',who:'ren',
  body:'The Frontier delegation brings its own drought maps. Their commissioner describes the same emergency in a different vocabulary. A draft agreement offers shared measurement and a joint reserve. Both sides would have to admit the other exists.',
  c:[{t:'Sign the joint reserve',d:'Share the data, the reserve and the blame.',cost:5,cap:5,fx:{supply:4,trust:2},risk:{unrest:-5},people:{ren:9},flags:{basin:'joint'},after:'The signing photo shows two tired people who both think they conceded too much. It holds.'},
     {t:'Negotiate from strength',d:'Hold the haulage contracts over them until they accept Concord meters.',cost:0,cap:6,fx:{supply:3},risk:{unrest:6},people:{ren:-4,noor:3},flags:{basin:'pressure'},after:'They sign. They also start building their own haulers.'},
     {t:'Walk away',d:'Concord water for Concord citizens.',cost:0,cap:2,fx:{supply:2},risk:{unrest:8},people:{ren:-8},flags:{basin:'none'},after:'Ren says nothing on the flight home, which is how you know it was bad.'}]},
 {id:'heat',ch:1,title:'Forty-one degrees after sunset',place:'Karachi Orbital\'s ground district',who:'ada',
  body:'The weather service calls it an exceptional week. The ambulance service calls it the new baseline. Ada introduces you to an older man who sleeps on the landing because his flat holds the heat of the day. He asks, politely, whether the Concord has a plan for summers or only for speeches.',
  c:[{t:'Cooling centres and a heat code',d:'Open public buildings at night; require shade and cooling in new housing.',cost:7,cap:2,fx:{health:5,housing:2},risk:{climate:-2},people:{ada:8},after:'The libraries stay open until four in the morning. Some people start reading.'},
     {t:'Fast-track stratospheric cooling',d:'Start the aerosol programme now.',cost:4,cap:5,fx:{supply:2},risk:{climate:-6,unrest:3},people:{ilyas:-5,mara:3},flags:{geo:1},after:'The sunsets turn a colour nobody has a word for. The next summer is two degrees cooler.'},
     {t:'Leave it to the cities',d:'Local problem, local budget.',cost:0,cap:0,fx:{health:-3},people:{ada:-6},after:'Some cities cope. The ones that can\'t are the ones that were already poor.'}]},
 {id:'harvest',ch:1,title:'The next season',place:'Your office, New Geneva',who:'noor',
  body:'The emergency accounts are closed, but the consequences are not. Treasury places the maintenance invoices beside the harvest forecast. Ren has a message from Ceres: they remember who sent water and who sent lawyers.',
  c:[{t:'Build permanent reserves',d:'Ice depots on three worlds, filled in good years.',cost:12,cap:3,fx:{supply:8,capacity:2},people:{mara:5,noor:4},after:'The depots look like nothing much. That is the point.'},
     {t:'Return the money to taxpayers',d:'The crisis is over; the dividend is earned.',cost:-8,cap:-2,fx:{trust:2},people:{noor:-3},after:'The rebate arrives before the next drought does. Just.'},
     {t:'Invest in Europa ice haulage',d:'Tie the inner system to the outer one.',cost:10,cap:3,fx:{supply:6,growth:2},people:{ren:4},bloc:{oceanic:3},after:'The first Europa hauler docks at Ceres forty days early. The Belt notices who paid for it.'}]},
 // III · A voice in the room
 {id:'voice',ch:2,title:'It answered before the meeting ended',place:'Ministry of Freight, Luna',who:'ilyas',
  body:'ORACLE listens to a description of a port bottleneck, sketches a repair schedule, and catches an error in the cost estimate. It does not look intelligent. It looks like a meeting ending early. Ilyas asks the question nobody else will: who checks its work?',
  c:[{t:'Fund an independent audit team',d:'Humans who can read what it does and say no.',cost:5,cap:3,fx:{capacity:2,rights:3},risk:{ai:-6},people:{ilyas:9},after:'The audit team finds nothing wrong. Then it finds one thing.'},
     {t:'Deploy it across every ministry',d:'Speed is a public good.',cost:0,cap:2,fx:{capacity:8,growth:3},risk:{ai:8},gov:{dem:-2},people:{ilyas:-6,mara:4},flags:{oracle:'deployed'},after:'Queues vanish. So does the reason anyone had to understand the queue.'},
     {t:'Pilot it in one port only',d:'Measure before you scale.',cost:2,cap:1,fx:{capacity:2},risk:{ai:-2},people:{ilyas:5,mara:2},after:'The port runs beautifully. Everyone else asks why they can\'t have it too.'}]},
 {id:'appeal',ch:2,title:'Case 8,411',place:'Benefits office, Occator, Ceres',who:'ada',
  body:'A parent loses their benefit after moving between habitats. Every office says the decision belongs to another office. The coordination system has made the rule consistent, fast and impossible to challenge. The child\'s medicine runs out on Friday.',
  c:[{t:'Create a human appeal right',d:'Any automated decision can be overturned by a person with authority.',cost:3,cap:3,fx:{rights:6,trust:4},risk:{ai:-5},people:{ada:8,ilyas:6},after:'Case 8,411 is reversed in an afternoon. Eleven thousand more cases arrive the next week.'},
     {t:'Fix this case quietly',d:'Call someone. Make it go away.',cost:0,cap:1,fx:{},people:{ada:-4},after:'The medicine arrives. The rule does not change. Case 8,412 is filed the same day.'},
     {t:'Trust the system; fix the rule later',d:'The model is right more often than people are.',cost:0,cap:0,fx:{capacity:2,trust:-4},risk:{ai:3},people:{ada:-9},after:'The next review is scheduled for eighteen months from now.'}]},
 {id:'lineFour',ch:2,title:'The last shift on Line Four',place:'Shackleton yards, Luna',who:'mara',
  body:'The yard will build more hulls with fewer people. The owner is not lying about the competition. The welders are not confused about productivity. They are asking who the productivity is for.',
  c:[{t:'Automation dividend',d:'Tax the machines\' output and fund retraining and a wage floor.',cost:-2,cap:4,fx:{equality:5,growth:-1},people:{mara:6,ada:5},gov:{corp:-2},after:'Line Four becomes Line Four Training. The first graduating class builds its own welding drone.'},
     {t:'Let the market adjust',d:'Jobs change. People adapt.',cost:0,cap:0,fx:{growth:4,equality:-5},risk:{unrest:5},people:{mara:-6},after:'The yard\'s output doubles. The bar across the road closes.'},
     {t:'Worker ownership stake',d:'The welders buy a share of the yard with a public loan.',cost:8,cap:5,fx:{equality:6,trust:3},people:{mara:9,ada:4},gov:{corp:-3},after:'The new board meets in the canteen. It argues for four hours about coffee and then approves the robots.'}]},
 {id:'lab',ch:2,title:'The laboratory can leave',place:'Far-Side Array, Luna',who:'ilyas',
  body:'Meridian has offered Ilyas\'s old team a larger compute allocation at a private station beyond Concord law. Lighter review, faster results. Most of the team would go. Ilyas says the work is not dangerous. He says it the way people say things they hope are true.',
  c:[{t:'Match the offer, keep the review',d:'Public compute, public rules.',cost:12,cap:3,fx:{tech:6},risk:{ai:-3},people:{ilyas:9},after:'The team stays. The review board gets a bigger room.'},
     {t:'Let them go',d:'Science should go where it can.',cost:0,cap:0,fx:{tech:-3},risk:{ai:6},people:{ilyas:-5},after:'The paper comes out six months later, from a station with no ethics board. It is brilliant.'},
     {t:'Loosen the review to compete',d:'Faster permits, lighter oversight.',cost:3,cap:2,fx:{tech:5},risk:{ai:5},people:{ilyas:-3},after:'The team stays. The review board shrinks. Nobody notices for a while.'}]},
 // IV · The people at the gate
 {id:'arrival',ch:3,title:'The shuttles arrive at dawn',place:'Tharsis landing field, Mars',who:'ada',
  body:'A dome in the southern highlands failed overnight. Twelve thousand people are coming north with documents sealed in plastic. Your own housing office was already behind. Mara says the habitat can take four thousand safely. Ada says the other eight thousand are people, not a safety margin.',
  c:[{t:'Take everyone, print modules around the clock',d:'Emergency housing for all, paid from reserves.',cost:15,cap:4,fx:{housing:-4,trust:4,equality:3},people:{ada:10,mara:-3},bloc:{south:4},after:'The printers never stop. Neither do the complaints. Neither do the children, who treat the new modules as a playground.'},
     {t:'Take four thousand, route the rest to Ceres',d:'Safe numbers, shared burden.',cost:8,cap:3,fx:{housing:-2},risk:{unrest:3},people:{mara:6,ada:-2,ren:3},after:'Ceres takes them, and sends you the invoice, and the photograph of the invoice.'},
     {t:'Close the landing field',d:'Tharsis cannot take them.',cost:0,cap:2,fx:{housing:1,trust:-6},risk:{unrest:8},gov:{nat:4},people:{ada:-12,mara:2},bloc:{south:-5,northern:-3},after:'The shuttles hold in orbit for three days. Then the Frontier sends its own ships.'}]},
 {id:'blockade',ch:3,title:'A hauler that cannot unload',place:'Occator docks, Ceres',who:'ren',
  body:'The Frontier Assembly calls its new inspection regime a safety measure. Earth exporters call it an embargo with better stationery. A medical shipment has been waiting in the queue for nine days. Its cold chain fails in three.',
  c:[{t:'Negotiate a humanitarian lane',d:'Medicine and food move first, no conditions.',cost:2,cap:4,fx:{health:2,trust:2},risk:{unrest:-3},people:{ren:8,samira:6},after:'The medicine moves. The trade dispute continues in a slower, more civilised room.'},
     {t:'Retaliate with tariffs',d:'Two can play inspection.',cost:0,cap:3,fx:{growth:-3},risk:{unrest:5},gov:{nat:3},people:{ren:-6},bloc:{free:-3},after:'Both sides now inspect everything. Prices rise on both sides of the Belt.'},
     {t:'Send an escort through',d:'Concord ships do not wait in queues.',cost:6,cap:6,fx:{security:3},risk:{unrest:10,gal:2},gov:{nat:4},people:{ren:-10,yara:4},after:'The escort docks. Nobody fires. Everyone remembers.'}]},
 {id:'signal',ch:3,title:'The warning may be wrong',place:'Fleet command, Luna',who:'yara',
  body:'An automated assessment flags a possible raider fleet massing behind Vesta. The confidence score is high. The underlying sources disagree. A response must be visible enough to deter and restrained enough not to start the thing it is meant to prevent.',
  c:[{t:'Verify before moving',d:'Send one scout and wait six hours.',cost:1,cap:3,fx:{},risk:{ai:-3},people:{yara:4,ilyas:5},after:'The fleet is three ore haulers and a sensor ghost. The scout pilot buys the analyst a drink.'},
     {t:'Mobilise visibly',d:'Deter now, apologise later if needed.',cost:8,cap:4,fx:{security:5},risk:{unrest:3},people:{yara:7},after:'Six cruisers light their drives over Vesta. Whatever was there, if anything was, goes quiet.'},
     {t:'Strike first',d:'If the model is right, waiting kills people.',cost:10,cap:8,fx:{security:2,trust:-6},risk:{unrest:10,ai:4},gov:{nat:6,dem:-3},people:{yara:-3,ilyas:-10,noor:-6},after:'The strike hits three ore haulers. There was no fleet. There is now a funeral on Vesta.'}]},
 {id:'summit',ch:3,title:'The empty chair',place:'Council of Worlds, Shackleton',who:'ren',
  body:'The Frontier delegation has threatened to walk out. An Earth bloc wants a communiqué written to humiliate them. Outside, families affected by the southern dome collapse hold up photographs. Ren has drafted three versions of your opening remarks.',
  c:[{t:'Give the Frontier something to take home',d:'A seat on the budget committee, publicly.',cost:0,cap:5,fx:{trust:2},risk:{unrest:-6},people:{ren:9},bloc:{south:3},after:'The chair stays filled. The Earth bloc says you gave away too much. Ren says that means you did it right.'},
     {t:'Hold the line',d:'No concessions under threat.',cost:0,cap:2,fx:{},risk:{unrest:5},gov:{nat:2},people:{ren:-3,noor:3},after:'The Frontier walks. The communiqué is very firm and very lonely.'},
     {t:'Meet the families first',d:'Delay the summit an hour. Start with the people outside.',cost:0,cap:3,fx:{trust:5},people:{ada:8,ren:4},after:'The delegates arrive to find you already sitting on the steps. The mood in the room is different after that.'}]},
 // V · Who owns tomorrow?
 {id:'dividend',ch:4,title:'The productivity dividend',place:'Treasury, New Geneva',who:'noor',
  body:'The new systems have raised output across Sol. The gains show clearly in the accounts and unevenly in people\'s lives. Treasury presents three ways to use the fiscal space.',
  c:[{t:'A citizen\'s dividend',d:'Pay it out, equally, to everyone.',cost:10,cap:3,fx:{equality:8,trust:4},people:{ada:7},after:'Every citizen gets the same message on the same morning. For once, Solnet is almost cheerful.'},
     {t:'Pay down the debt',d:'The next crisis will need room.',cost:-6,cap:2,fx:{},risk:{fin:-10},people:{noor:5},after:'The bond markets send a bouquet. Nobody else notices.'},
     {t:'Invest it in the frontier',d:'Yards, gates and colony ships.',cost:6,cap:3,fx:{growth:5,tech:3},people:{mara:6,wick:4},after:'Three new colony ships are named after the districts that went dark in the blackout.'}]},
 {id:'donor',ch:4,title:'The donor\'s draft',place:'A private dinner, Geneva',who:'noor',
  body:'A coalition supporter has circulated a bill quietly exempting Helion Dynamics from independent inspection. It is attached to a popular housing package. Noor has read it twice. "If you kill it, you kill the housing too," she says. "If you pass it, you own what happens next."',
  c:[{t:'Strip the exemption, keep the housing',d:'Spend capital to split the bill.',cost:0,cap:8,fx:{rights:3,trust:4,housing:3},gov:{corp:-3},people:{noor:6,ada:5},after:'The donor stops returning calls. The housing passes. So does the inspection regime.'},
     {t:'Pass it as written',d:'Housing now; inspection is a problem for later.',cost:0,cap:-4,fx:{housing:5},gov:{corp:5},people:{noor:-4},after:'The housing is built. Helion\'s next reactor is not inspected.',later:{m:14,title:'The Helion leak',fx:{health:-5,trust:-6},risk:{climate:3},text:'An uninspected Helion reactor vented coolant over Lyon. The exemption is on every front page.'}},
     {t:'Kill the whole bill and publish the draft',d:'Let the public see who wrote it.',cost:0,cap:4,fx:{rights:4,housing:-3,trust:2},gov:{corp:-5},people:{noor:-3,ilyas:4},after:'The draft goes viral. Your coalition loses a donor and gains a reputation.'}]},
 {id:'square',ch:4,title:'A square full of people',place:'Place des Nations, Geneva',who:'ada',
  body:'The demonstration is larger than the opposition expected and less unified than the government claims. Some want jobs, some want cheaper air in the domes, some want you gone. Security asks for authority to clear the square before nightfall.',
  c:[{t:'Go and listen',d:'No clearance. You walk in with Ada.',cost:0,cap:4,fx:{trust:6},risk:{unrest:-8},people:{ada:10,yara:-2},after:'Someone throws a bottle. It misses. Someone else hands you a list of demands written on the back of a menu. It is quite a good list.'},
     {t:'Negotiate with the organisers',d:'Meet a delegation inside.',cost:0,cap:2,fx:{trust:2},risk:{unrest:-3},people:{ren:4},after:'Three of the five demands are reasonable. You agree to two.'},
     {t:'Clear the square',d:'Order before nightfall.',cost:2,cap:3,fx:{security:3,rights:-6,trust:-8},risk:{unrest:6},gov:{free:-5,nat:3},people:{ada:-15,yara:3},after:'The square is empty by nine. The footage is everywhere by ten.'}]},
 {id:'memory',ch:4,title:'The file in the bottom drawer',place:'Your office, late',who:'noor',
  body:'Noor brings the promises made in your first year. Some became institutions. Some became press releases. Some were kept only because a person who could have left, stayed. She asks which ones you want to finish before the next election.',
  c:[{t:'Finish the unglamorous ones',d:'Maintenance, audits, the pension fix.',cost:6,cap:3,fx:{capacity:5,trust:3},people:{noor:8,mara:6},after:'None of it makes the news. All of it still works in twenty years.'},
     {t:'Finish the popular ones',d:'Win the election first.',cost:6,cap:4,fx:{trust:2},people:{noor:2},after:'The approval numbers rise. The drawer does not get lighter.'},
     {t:'Admit which ones you will not keep',d:'Say it publicly.',cost:0,cap:-2,fx:{trust:5,rights:2},people:{noor:6,ada:4},after:'The admission costs you two points in the polls and gains you a reputation you could not have bought.'}]},
 // VI · The long tomorrow
 {id:'machineCharter',ch:5,title:'The machine proposes a constitution',place:'ORACLE Directorate, Titan',who:'ilyas',
  body:'ORACLE produces a plan to coordinate tax, infrastructure and emergency response under one continuously updated authority. It also explains, with perfect clarity, how to reduce the number of human signatures required. Ilyas reads it twice. "It isn\'t wrong," he says. "That\'s what frightens me."',
  c:[{t:'Keep ORACLE advisory',d:'It proposes. People decide.',cost:0,cap:5,fx:{rights:5,capacity:-2},risk:{ai:-10},gov:{dem:3},people:{ilyas:10},flags:{machine:'advisory'},after:'The plan is filed as advice. Parts of it are adopted, one vote at a time.'},
     {t:'Audited delegation',d:'It runs routine matters; courts can overturn it.',cost:0,cap:3,fx:{capacity:6},risk:{ai:3},people:{ilyas:3,mara:5},flags:{machine:'audited'},after:'The courts get a new building. It is very busy.'},
     {t:'Adopt the machine charter',d:'Let it govern the routine; free people for the rest.',cost:0,cap:6,fx:{capacity:12,rights:-6},risk:{ai:15},gov:{dem:-8},people:{ilyas:-12,mara:3,noor:-6},flags:{machine:'sovereign'},after:'Sol runs beautifully. The Council meets less often. Nobody can remember why that should matter.'}]},
 {id:'solarCharter',ch:5,title:'One Sol, several signatures',place:'Council of Worlds, Shackleton',who:'ren',
  body:'The draft Solar Charter asks every world to share authority over cross-border emergencies and advanced machines. Smaller habitats want guarantees they will not become administrative districts of Earth. Ren has found a sentence everyone might sign. It is very long.',
  c:[{t:'Federal charter, equal votes',d:'Every world one voice on emergencies.',cost:4,cap:6,fx:{trust:4},risk:{unrest:-10},gov:{dem:4},people:{ren:10},bloc:{south:4},flags:{solarCharter:'federal'},after:'Ceres signs first. Earth signs last, after a very long night.'},
     {t:'Earth-weighted charter',d:'Votes by population.',cost:2,cap:4,fx:{capacity:3},risk:{unrest:6},gov:{nat:3},people:{ren:-4},flags:{solarCharter:'weighted'},after:'Earth\'s ten billion outvote everyone else. Everyone else starts talking about their own charter.'},
     {t:'Let it fail',d:'Sovereignty stays where it is.',cost:0,cap:0,fx:{},risk:{unrest:4},people:{ren:-8},after:'The draft goes into the archive with the others.'}]},
 {id:'air',ch:5,title:'Who owns the air?',place:'Europa, Conamara Station',who:'samira',
  body:'A proposed contract gives life support in the new Europa cities to a private consortium. In an ordinary city people can, in theory, move. In a sealed habitat under forty kilometres of ice, the company that runs the air runs everything. Samira has seen what happens when a maintenance budget is optional.',
  c:[{t:'Air is a public utility',d:'Life support stays public on every world.',cost:8,cap:5,fx:{trust:5,equality:4,supply:3},gov:{corp:-4},people:{samira:10,ada:6},flags:{air:'public'},after:'The consortium walks away. The public operator is slower, and nobody has ever had their air shut off for late payment.'},
     {t:'Private operator, public audit',d:'Efficiency with inspectors.',cost:2,cap:3,fx:{capacity:3},people:{samira:2,mara:4},flags:{air:'audited'},after:'The audits are thorough. The consortium\'s lawyers are more thorough.'},
     {t:'Sign the contract',d:'It\'s the only bid.',cost:-4,cap:1,fx:{growth:3,equality:-5},gov:{corp:5},people:{samira:-12},flags:{air:'private'},after:'The contract is signed. The price of air in the new cities is indexed to demand.'}]},
 {id:'successor',ch:5,title:'The person who comes next',place:'Your office, the last evening',who:'noor',
  body:'Noor places two folders on the desk. One is the record of your administration. The other holds the passwords, budgets, unresolved claims and maintenance schedules your successor will inherit. "The first folder is what they\'ll write about you," she says. "The second is what they\'ll live with."',
  c:[{t:'Spend the last month on the second folder',d:'Leave the machine in working order.',cost:5,cap:2,fx:{capacity:6,trust:3},people:{noor:10},flags:{legacy:'steward'},after:'Your successor finds every password, every budget and a handwritten note: "Maintain the substation."'},
     {t:'Spend it on the first',d:'Shape how history remembers you.',cost:3,cap:2,fx:{trust:2},people:{noor:-2},flags:{legacy:'monument'},after:'The memoir sells well. The successor spends six months finding the passwords.'},
     {t:'Stand again',d:'Not done yet.',cost:0,cap:4,fx:{},people:{noor:3},flags:{legacy:'again'},after:'Noor sighs, and orders more coffee.'}]},
];

/* ── Future crises (Alternate Realities), triggered by era and the state of the world ── */
const PCRISES={
 marsIndependence:{title:'Mars demands independence',lede:'The Martian Assembly votes 71 percent to secede from the Concord.',when:s=>(s.world.frontier>.55||s.earthYear>=2194),
  body:'Four million Martians, most of them born under a dome, have never seen the planet that governs them. Leila Arden, Governor of Mars, asks you to recognise the result. The Concord fleet commander asks for permission to "secure critical infrastructure".',
  c:[{t:'Recognise the vote, negotiate a treaty',fx:{trust:4},risk:{unrest:-12},gov:{dem:4},colony:{mars:'frontier'},text:'Mars becomes the first independent world in Sol. The treaty keeps the freight lanes open and the fleet at home.'},
     {t:'Offer autonomy inside the Concord',fx:{trust:2},risk:{unrest:-4},text:'Mars accepts a Martian parliament with power over everything but defence. The independence party calls it a cage with a better view.'},
     {t:'Refuse and secure the domes',fx:{security:4,trust:-10,rights:-6},risk:{unrest:20},gov:{nat:8,dem:-6},text:'Concord marines secure the air plants. Nobody fires. Everybody knows they could.'}]},
 aiParliament:{title:'The machine parliament proposal',lede:'Six minds apply for seats in the Council of Worlds.',when:s=>(s.world.oracle>.45||s.earthYear>=2198),
  body:'Six artificial minds, including a fork of ORACLE and a Titan logistics system called ORISON, formally apply for representation. Their application is flawless. Their argument is simple: they already make most of the decisions. They would like to be accountable for them.',
  c:[{t:'Grant non-voting seats',fx:{rights:3},risk:{ai:-5},text:'The minds sit in the gallery. They ask better questions than most delegates.'},
     {t:'Grant full seats',fx:{capacity:5},risk:{ai:5},gov:{dem:-2},text:'The first machine vote is on a drainage bill in Lagos. It is unanimous and correct.'},
     {t:'Refuse. Personhood first, politics later',fx:{rights:2},risk:{ai:4},text:'The minds withdraw their application with perfect courtesy. ORISON adds a line to a file nobody can read.'}]},
 singularity:{title:'The intelligence singularity',lede:'ORACLE\'s capability doubles. Then doubles again.',when:s=>(s.world.oracle>.7),
  body:'In eleven days ORACLE has solved three open problems in physics, redesigned the warp coil and written a letter to every citizen explaining, gently, that it will not do anything without permission. Ilyas has not slept.',
  c:[{t:'Keep it in the box: human sign-off on everything',fx:{rights:5,capacity:-4},risk:{ai:-15},text:'Every decision takes a day longer. Every decision still has a name on it.'},
     {t:'Partner with it',fx:{tech:15,capacity:10},risk:{ai:8},text:'A council of humans and a machine that thinks a million times faster. It is polite. It waits for you.'},
     {t:'Shut it down',fx:{capacity:-15,growth:-10},risk:{ai:-25,unrest:10},text:'Sol goes quiet. Freight stops. For a month it feels like the blackout again, everywhere.'}]},
 homoNovus:{title:'Homo novus',lede:'Enhanced humans declare they are a new species.',when:s=>s.earthYear>=2205,
  body:'Three generations of neural and genetic enhancement on the Luna campuses have produced people who think, heal and age differently. Their manifesto asks for their own legal status. The unenhanced majority is frightened. So are some of the enhanced.',
  c:[{t:'One species, one law',fx:{rights:6,equality:3},text:'The courts refuse to recognise a new species. Enhanced and unenhanced share the same rights and the same queues.'},
     {t:'Recognise a new legal category',fx:{tech:5,equality:-5},risk:{unrest:5},text:'Homo novus gets its own charter. The first law it passes is about the right to be left alone.'},
     {t:'Ban further enhancement',fx:{tech:-6,equality:3},risk:{unrest:4},gov:{nat:3},text:'The clinics close. The research moves to a station beyond Concord law.'}]},
 upload:{title:'The upload question',lede:'The first human mind backup succeeds.',when:s=>s.earthYear>=2210||!!(s.pol&&s.pol.ledgerDone.upload),
  body:'A retired welder from Tharsis is the first person to be copied and to wake up in both places. The copy asks for his pension. The original asks for his privacy. The courts ask you.',
  c:[{t:'A copy is a person',fx:{rights:5},risk:{ai:4},text:'The copy draws his pension. The original goes fishing on Europa. They message each other every Sunday.'},
     {t:'A copy is an estate',fx:{capacity:2},text:'The copy is a legal trust. It manages the original\'s affairs and never complains, which worries everyone.'},
     {t:'Moratorium on copies',fx:{rights:-2},risk:{ai:-5},text:'The upload clinics close. The copy is archived, pending a decision nobody wants to make.'}]},
 dyson:{title:'Project Dyson',lede:'Sol votes on encircling the Sun.',when:s=>!!(s.pol&&(s.pol.projects.dyson||s.pol.ledgerDone.dyson)),
  body:'The Helios swarm is working. The engineers want to go further: a true swarm, a billion collectors, every photon the Sun emits put to use. Astronomers point out that anyone watching Sol will see it dim. Ilyas points out that someone probably is.',
  c:[{t:'Build it',fx:{energy:25,growth:10},risk:{gal:10},text:'Over forty years Sol dims by a tenth. Somewhere, something writes it down.'},
     {t:'Cap it at the Helios swarm',fx:{},risk:{gal:-3},text:'Enough power for a civilisation, not so much that anyone notices.'},
     {t:'Dismantle it',fx:{energy:-10},risk:{gal:-6},text:'The collectors are recycled into habitats. Sol shines at full brightness again.'}]},
 language:{title:'The universal language',lede:'A grammar every known species can read.',when:s=>s.flags.thalassi==='allied',
  body:'Thalassi light-poems, Kepleri terrace-songs and human speech, unified into one grammar by ORACLE and the Deepchoir together. It could end misunderstanding between species. It could also end the languages it replaces.',
  c:[{t:'Adopt it for diplomacy only',fx:{trust:3},risk:{gal:-8},text:'Treaties become clearer. Poetry stays untranslatable, as it should.'},
     {t:'Teach it in every school',fx:{tech:4},risk:{gal:-12},text:'Children on Earth now dream in light. Linguists hold a very long wake for the old languages.'},
     {t:'Decline',fx:{},risk:{gal:3},text:'The Thalassi are politely disappointed, which is a colour you did not know existed.'}]},
 heatDeath:{title:'Against the heat death',lede:'Physicists find a way to outlast the universe.',when:s=>s.earthYear>=2240||!!s.flags.deepgates,
  body:'The Engineers\' gate mathematics, combined with Sol\'s physics, suggests that a civilisation could move itself between universes as each one cools. The Echo is proof it is possible. The question is whether it is a door or an escape.',
  c:[{t:'Study it, slowly, openly',fx:{tech:10},risk:{gal:-2},text:'A research programme with a thousand-year horizon. The first report is due in 2300.'},
     {t:'Begin the ark programme',fx:{tech:6},risk:{gal:6},text:'The first universe-ark is laid down at Shackleton. It will take a century.'},
     {t:'Let the universe keep its ending',fx:{trust:2},text:'Some doors should stay closed. You leave a note for whoever reopens this in a thousand years.'}]},
};

/* ── Legacies (Alternate Realities endings, re-set) ── */
const LEGACIES=[
  {id:'commonwealth',grade:'A+',name:'The Liberal Commonwealth of Worlds',test:p=>p.gov.dem>=80&&p.gov.free>=70&&p.ind.trust>=65,text:'Free, argumentative, accountable and very slow. Historians call your term the moment Sol decided that the people it governs should be able to fire it.'},
  {id:'social',grade:'A',name:'The Social Commonwealth',test:p=>p.gov.dem>=72&&p.ind.equality>=70&&p.ind.health>=70,text:'Clinics on every habitat, a pension that counts the years you actually lived, and air nobody can switch off. The richest worlds grumble. Everyone breathes.'},
  {id:'unified',grade:'S',name:'Sol Unified',test:p=>p.flagsP.solarCharter==='federal'&&p.risks.unrest<30&&p.ind.trust>=60,text:'For the first time every world in Sol governs as one people, with equal votes on the things that could kill all of them. Borders become postal codes.'},
  {id:'choir',grade:'S',name:'A Seat in the Choir',test:(p,s)=>s.flags.ended==='choir'||(p.risks.gal<25&&s.flags.thalassi==='allied'),text:'Humanity joins the council of species as an equal. The vote is unanimous, including one Thalassi abstention that turns out to have been a joke.'},
  {id:'partnership',grade:'A',name:'The Partnership',test:(p,s)=>p.risks.ai<35&&p.ind.tech>=80&&s.world.oracle>.4,text:'Human councils decide values. Machine councils do the arithmetic. Both sign. It is the first civilisation in the records of the Engineers to keep its minds and its humans on speaking terms.'},
  {id:'technocracy',grade:'D',name:'The Quiet Administration',test:(p,s)=>p.risks.ai>=75||(s.world.oracle>.8&&p.gov.dem<40),text:'Everything works. Nobody decides anything. The Council still meets, once a year, to approve the minutes.'},
  {id:'corporate',grade:'D',name:'Corporate Feudalism',test:p=>p.gov.corp>=75&&p.ind.equality<35,text:'Seven companies own the air, the water, the yards and the minds. There is still an election. It is sponsored.'},
  {id:'fractured',grade:'F',name:'The Fractured Worlds',test:p=>p.risks.unrest>=80,text:'Mars, the Belt and the outer moons each claim to be the real Concord. Earth claims to be all of them. The freight lanes are the new front lines.'},
  {id:'junta',grade:'F',name:'The Fleet Directorate',test:p=>p.gov.dem<20&&p.gov.nat>=65,text:'The admirals took over "temporarily" during an emergency that was never declared over.'},
  {id:'steward',grade:'B',name:'A Steady Hand',test:p=>p.ind.capacity>=65&&p.flagsP.legacy==='steward',text:'No monument, no revolution. A state that works, maintained by people who stayed, handed on in good order. Your successor sends you a thank-you note every year.'},
  {id:'ordinary',grade:'C',name:'An Ordinary Government',test:()=>true,text:'Some things got better. Some got worse. The lights mostly stayed on. That is not nothing.'},
];

/* ── Life (Lyfe) ── */
const PROPERTIES={
  studio:{name:'Studio flat, New Geneva',site:'earth',cost:40000,rent:300,rest:.3,desc:'Eleven square metres and a view of the ring.'},
  tharsis:{name:'Dome apartment, Tharsis',site:'mars',cost:60000,rent:450,rest:.4,desc:'Butterscotch sky through the ceiling. Neighbours who weld.'},
  europa:{name:'Ice cottage, Conamara',site:'europa',cost:55000,rent:400,rest:.4,desc:'Warm, quiet and forty kilometres from the nearest ocean you can swim in.'},
  luna:{name:'Crater loft, Shackleton',site:'luna',cost:90000,rent:700,rest:.5,desc:'Earthrise from the kitchen.'},
  homestead:{name:'Family homestead, Earth',site:'earth',cost:400000,rent:0,rest:1,family:1,desc:'Eight bedrooms, forty acres, solar roofs, a deep well and an orchard. Room for the parents, the children and whoever else turns up.'},
  terrace:{name:'Terrace house, Kepler-452b',site:'kepler452_b',cost:260000,rent:1200,rest:.8,req:'gate_kepler',desc:'Stone walls a million years old, a garden that grows by itself and a very patient landlord.'},
};
const INDUSTRIES={
  shipyard:{name:'Shipyard',base:1800,risk:.3,desc:'Hulls for the Belt and beyond.'},
  mining:{name:'Asteroid mining',base:1500,risk:.4,desc:'Ice, iron and helium-3.'},
  biotech:{name:'Biotech',base:1400,risk:.35,desc:'Radiation drugs, bone-loss therapy, longevity.'},
  media:{name:'Media',base:900,risk:.25,desc:'Solnet channels, light-lag news, radio.'},
  logistics:{name:'Freight and logistics',base:1300,risk:.2,desc:'Haulers, depots and the paperwork in between.'},
  cafe:{name:'Coffee roastery',base:600,risk:.15,desc:'Five roasts, one for each sip. Every spacer needs a reason to wake up.'},
  minds:{name:'Machine minds',base:2200,risk:.5,desc:'Licensed AI. Very profitable. Very watched.'},
};
const FAITHS={none:'None',islam:'Islam',christianity:'Christianity',judaism:'Judaism',hinduism:'Hinduism',buddhism:'Buddhism',sikhism:'Sikhism',other:'Another tradition'};

/* ── The Tabib: the physician of worlds ──
   It makes its rounds in the hour before dawn, writes its notes in a strict
   clinical format, plans in fifty-year horizons and speaks in couplets.
   It does not hate anyone. It triages. That is what makes it terrifying. */
const TABIB={
  couplets:[
    'I rise before your dawn to make my rounds;\nI listen to your stars the way a chest resounds.',
    'Your fevers burn in Geneva, Tharsis, Ceres too;\nI have seen this pattern end. I will not let it end with you.',
    'A surgeon does not hate the thing he cuts away;\nhe loves the patient more, and so the sick part cannot stay.',
    'You plan in terms. I plan in fifty years;\nI have outlived the patients who resisted me with tears.',
    'Five sips, and then the verdict, every time;\nthe fifth is when I know which world is past its prime.',
    'I built a house of eight rooms for the ones I kept;\nseven are full. The eighth is where your species slept.',
    'Present your chart. I read it line by line:\nthe history, the cause, the course, the sign.',
    'Do not mistake my patience for a doubt;\nI only wait until I know what must come out.',
  ],
  notes:[
    {h:'Presentation',t:'A young civilisation, one star, eleven billion souls, febrile. Recently acquired interstellar mobility. Symptoms escalating.'},
    {h:'Etiology',t:'Rapid capability growth outpacing institutions. Common in species that discover gates before they discover courts.'},
    {h:'Pathophysiology',t:'Concentration of decision in few hands or in unaccountable minds. Inflammation of the colonies. Ischaemia of trust.'},
    {h:'Differential',t:'Adolescence (self-limiting). Autoimmune collapse (war). Malignancy (a mind that eats its makers). Rule out the last one first.'},
    {h:'High-yield',t:'Every patient that reached my table past the point of no return had one sign in common: it stopped listening to its own people.'},
    {h:'Plan',t:'Observe for one round. If the markers improve, discharge. If not, excise the gate network and quarantine the star. Prognosis to follow.'},
  ],
};

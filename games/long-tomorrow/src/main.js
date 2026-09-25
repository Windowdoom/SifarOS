/* ═══════════════════════════════════════════════════════════════════════
   MAIN · game state, travel & relativity, crew, cutscenes, loop
   ═══════════════════════════════════════════════════════════════════════ */

const Game={
  newState(p){
    const O=ORIGINS[p.origin];const attrs=Object.assign({},p.attrs);attrs[O.attr]=(attrs[O.attr]||5)+1;
    const skills={};for(const k in SKILLS)skills[k]=XP_TABLE[Math.max(1,(O.skills[k]||1))];
    const s={v:1,player:{name:p.name,origin:p.origin,attrs,skills,hp:0,o2:0,focus:100,rad:0,weapon:'sidearm',mag:{sidearm:12},suit:p.suit,skin:p.skin,hair:p.hair,body:p.body||'soldier'},
      credits:3000,inv:{sidearm:1,slugs:60,medkit:2,o2:2},ship:{name:p.ship,hull:'kestrel',fit:{high:['pulse1','mine1'],mid:['shield1','scanner'],low:['armor1','reactor1'],drive:'torch'},hp:0,fuel:0,paint:'#9fb0c2'},
      hangar:[],ownedModules:{},crew:[],loyalty:{},flags:{},rep:{concord:0,frontier:0,oracle:0,syndicate:-10,thalassi:0,kepleri:0,engineers:0},quests:{},dyn:{},
      earthYear:START_YEAR,shipYears:0,loc:{system:'sol',site:'earth'},visited:{sol:1},news:[],world:{oracle:.25,frontier:.3,frontierRadius:14,pop:1,control:{}},stats:{kills:0,jumps:0,ly:0},wanted:0,dayPhase:.35,track:'mq'};
    for(const k in O.gear)s.inv[k]=(s.inv[k]||0)+O.gear[k];if(O.gear.carbine){s.player.weapon='carbine';s.player.mag.carbine=36;s.inv.cells=(s.inv.cells||0)+60;}
    for(const k in O.rep)s.rep[k]+=O.rep[k];
    if(p.origin==='engineer'){s.ship.fit.low=['armor1','reactor1'];s.ownedModules.pulse1=1;}
    return s;
  },
  newGame(p){const s=this.newState(p);G.state=s;s.player.hp=this.maxHp();s.player.o2=this.maxO2();const st=this.shipStats();s.ship.hp=st.hull;s.ship.fuel=st.fuel;
    s.news.push({y:s.earthYear,t:'Solnet: The Far-Side Array\'s mysterious "Null Signal" enters its fourteenth month. ORACLE maintains it is instrument noise.'});
    Story.start(s,'mq');this.start(s,true);},
  start(s,fresh){
    G.state=s;this.migrate(s);UI.fade(true,'');
    const go=()=>{if(s.loc.station){this.goSpace(s.loc.system,{fromBody:s.loc.station});setTimeout(()=>{s.loc.station=s.loc.station;this.dock(s.loc.station,true);},50);}
      else if(s.loc.site&&!s.loc.inSpace)this.goSurface(s.loc.site,{system:s.loc.system});else this.goSpace(s.loc.system,{});
      UI.fade(false);if(fresh){setTimeout(()=>Cine.play('intro',()=>{UI.titleCard('Act I · The Null Signal',Cosmos.site('earth').name,`Earth · ${START_YEAR} · g 1.00`);UI.toast(ORIGINS[s.player.origin].intro);}),400);}};
    setTimeout(go,60);
  },
  migrate(s){s.dyn=s.dyn||{};s.hangar=s.hangar||[];s.world=s.world||{oracle:.25,frontier:.3,frontierRadius:14,pop:1,control:{}};s.world.control=s.world.control||{};s.stats=s.stats||{kills:0,jumps:0,ly:0};s.loyalty=s.loyalty||{};},
  loadSlot(slot){const s=Store.load(slot);if(!s){UI.toast('That save could not be read.','bad');UI.title();return;}this.start(s);},
  saveSlot(slot){return Store.save(slot,G.state);},
  autosave(){if(!G.state||G.mode==='title')return;clearTimeout(this._as);this._as=setTimeout(()=>{Store.save('auto',G.state);Online.push();Online.presence();},300);},
  quitToTitle(){this.autosave();Surface.dispose();Space.dispose();G.mode='title';AudioSys.stopAmbient();AudioSys.stopRadio();Menu3D.start();UI.title();},

  /* ── Stats ── */
  maxHp(){const P=G.state.player;return Math.round(100+(P.attrs.END-5)*12+levelFor(P.skills.combat)*1.2+(P.origin==='marine'?25:0));},
  maxO2(){return 240+(G.state.player.attrs.END-5)*25;},
  personalCap(){return 30+G.state.player.attrs.STR*5;},
  capacity(){return this.personalCap()+this.shipStats().cargo;},
  load(){const s=G.state;let w=0;for(const k in s.inv){if(ITEMS[k])w+=ITEMS[k].w*s.inv[k];}return w;},
  crewCap(){return this.shipStats().crew;},
  shipStats(){
    const s=G.state;const H=HULLS[s.ship.hull];const f=s.ship.fit;const lv=k=>levelFor(s.player.skills[k]||1);
    const st={pg:H.pg*(s.crew.includes('mara')?1.15:1)*(1+lv('engineering')/200),cpu:H.cpu,pgUsed:0,cpuUsed:0,hull:H.hull,shield:0,regen:0,dps:0,mine:0,speed:H.speed,turn:H.turn,cargo:H.cargo,crew:H.crew,fuel:H.fuel,warp:.12,range:99999,fuelLy:2,boost:0,dmgBonus:0,scan:0};
    const all=[...(f.high||[]),...(f.mid||[]),...(f.low||[])].filter(Boolean);
    for(const m of all){const M=MODULES[m];if(!M)continue;if(M.pg>0)st.pgUsed+=M.pg;else st.pg-=M.pg;if(M.cpu>0)st.cpuUsed+=M.cpu;else st.cpu-=M.cpu;
      if(M.dps)st.dps+=M.dps;if(M.mine)st.mine+=M.mine;if(M.shield){st.shield+=M.shield;st.regen+=M.regen;}if(M.hull)st.hull+=M.hull;if(M.speed)st.speed*=1+M.speed;if(M.turn)st.turn*=1+M.turn;if(M.cargo)st.cargo+=M.cargo;if(M.crew)st.crew+=M.crew;if(M.fuel)st.fuel*=1+M.fuel;if(M.boost)st.boost+=M.boost;if(M.dmg)st.dmgBonus+=M.dmg;if(M.scan)st.scan+=M.scan;}
    const D=MODULES[f.drive]||MODULES.torch;st.pgUsed+=D.pg;st.cpuUsed+=D.cpu;st.warp=D.warp;st.range=D.range;st.fuelLy=D.fuelLy;
    st.dps*=1+st.dmgBonus;if(s.crew.includes('wick')){st.turn*=1.15;st.speed*=1.1;}st.turn*=1+lv('piloting')/200;
    st.pg=Math.round(st.pg);st.cpu=Math.round(st.cpu);st.fuel=Math.round(st.fuel);
    if(st.pgUsed>st.pg||st.cpuUsed>st.cpu){st.overload=true;st.speed*=.6;st.shield*=.5;}
    return st;
  },
  refreshShip(){if(G.mode==='space')Space.refresh();},
  fitModule(slot,i,mod){
    const s=G.state;const f=s.ship.fit;
    if(slot==='drive'){if(!mod)return;s.ownedModules[f.drive]=(s.ownedModules[f.drive]||0)+1;s.ownedModules[mod]--;f.drive=mod;}
    else{f[slot]=f[slot]||[];const cur=f[slot][i];if(cur)s.ownedModules[cur]=(s.ownedModules[cur]||0)+1;if(mod){s.ownedModules[mod]--;f[slot][i]=mod;}else f[slot][i]=null;}
    for(const k in s.ownedModules)if(s.ownedModules[k]<=0)delete s.ownedModules[k];
    const st=this.shipStats();if(st.overload)UI.toast('Fitting exceeds power grid or CPU: ship performance is degraded.','bad');AudioSys.sfx('ui2');
  },
  swapHull(k){const s=G.state;const i=s.hangar.findIndex(h=>h.hull===k);if(i<0)return;const h=s.hangar[i];
    const cur={hull:s.ship.hull,name:s.ship.name,fit:s.ship.fit};
    for(const sl of['high','mid','low'])for(const m of(cur.fit[sl]||[]))if(m)s.ownedModules[m]=(s.ownedModules[m]||0)+1;
    s.hangar.splice(i,1,{hull:cur.hull,name:cur.name,fit:{high:[],mid:[],low:[],drive:'torch'}});
    s.ownedModules.torch=(s.ownedModules.torch||0);
    s.ship.hull=k;s.ship.fit={high:[],mid:[],low:[],drive:cur.fit.drive};const st=this.shipStats();s.ship.hp=st.hull;s.ship.fuel=Math.min(s.ship.fuel,st.fuel);
    UI.toast(`${HULLS[k].name} is now active. Refit it at the fitting terminal.`,'lvl');},
  driveRange(){const st=this.shipStats();return Math.min(st.range,st.fuelLy>0?G.state.ship.fuel/st.fuelLy:st.range);},

  /* ── Inventory, XP, reputation ── */
  giveItem(k,n=1,silent){const s=G.state;s.inv[k]=(s.inv[k]||0)+n;if(!silent)UI.toast(`+${n} ${ITEMS[k]?ITEMS[k].name:k}`);Story.event(s,'inv',{item:k});},
  takeItem(k,n=1){const s=G.state;s.inv[k]=Math.max(0,(s.inv[k]||0)-n);if(!s.inv[k])delete s.inv[k];if(ITEMS[k]&&ITEMS[k].type==='weapon'&&s.player.weapon===k&&!s.inv[k])s.player.weapon='sidearm';},
  addCredits(n){G.state.credits=Math.max(0,Math.round(G.state.credits+n));if(n>0)UI.toast(`+${U.fmt(n)} cr`,'xp');},
  addXP(k,n){if(!n)return;const s=G.state;const P=s.player;const mult=(1+(P.attrs.INT-5)*.03)*(s.crew.includes('nine')?1.2:1);n=Math.round(n*mult);const before=levelFor(P.skills[k]||0);P.skills[k]=Math.min(200000000,(P.skills[k]||0)+n);const after=levelFor(P.skills[k]);
    UI.toast(`+${U.fmt(n)} ${SKILLS[k].name} xp`,'xp');if(after>before){AudioSys.sfx('level');UI.toast(`${SKILLS[k].name} level ${after}!`,'lvl');if(k==='combat')P.hp=Math.min(this.maxHp(),P.hp+20);}},
  addRep(f,n){if(!f||f==='none')return;const s=G.state;const mult=(s.crew.includes('ren')?1.25:1)*(f==='frontier'&&s.crew.includes('ada')&&n>0?1.5:1);s.rep[f]=U.clamp(Math.round((s.rep[f]||0)+n*mult),-100,100);
    const name=f.startsWith('civ:')?(Cosmos.civById(f.slice(4))?.plural||f):(FACTIONS[f]?.short||f);if(Math.abs(n)>=3)UI.toast(`${name} ${n>0?'+':''}${Math.round(n*mult)}`,n>0?'':'bad');},
  heal(n){const P=G.state.player;P.hp=Math.min(this.maxHp(),P.hp+n);},
  hurt(n,src){const s=G.state,P=s.player;if(G.mode!=='surface'||G.cine||this._dying)return;if(G.state.loc.interior)return;P.hp-=n;Render.fx.damage=Math.min(1,Render.fx.damage+n/40);if(n>2)AudioSys.sfx('hurt',.6);
    if(P.hp<=0)this.die(src);},
  die(src){const s=G.state;this._dying=true;UI.fade(true,`You were killed${src?' by '+src:''}.`);AudioSys.sfx('explode',.5);
    setTimeout(()=>{const bill=Math.min(s.credits,Math.max(100,Math.round(s.credits*.1)));s.credits-=bill;s.wanted=0;s.player.hp=this.maxHp()*.6;s.player.o2=this.maxO2();s.player.rad=0;
      this.goSurface(s.loc.site,{system:s.loc.system});UI.fade(false);this._dying=false;UI.toast(`Revived at the medical bay. Bill: ${U.fmt(bill)} cr.`,'bad');},2400);},
  equip(k){const s=G.state;if(!WEAPONS[k]||!s.inv[k])return;s.player.weapon=k;if(s.player.mag[k]==null)s.player.mag[k]=0;if(G.mode==='surface'&&Surface.player){const m=Surface.player.mesh;if(m.gun){m.gun.parent.remove(m.gun);}m.gun=Gen.gunMesh(k);m.armR.hand.add(m.gun);}AudioSys.sfx('reload');},
  useItem(k){const s=G.state,P=s.player;if(!s.inv[k])return;
    if(k==='medkit'){if(P.hp>=this.maxHp())return;this.takeItem(k);const heal=45*(1+levelFor(P.skills.medicine)/60)*(s.crew.includes('samira')?1.25:1);this.heal(heal);this.addXP('medicine',40);AudioSys.sfx('pickup');}
    else if(k==='stim'){this.takeItem(k);P.focus=100;}else if(k==='o2'){this.takeItem(k);P.o2=Math.min(this.maxO2(),P.o2+100);}else if(k==='filgrastim'){this.takeItem(k);P.rad=0;this.addXP('medicine',120);}
    else if(k==='repairkit'){this.takeItem(k);const st=this.shipStats();s.ship.hp=Math.min(st.hull,s.ship.hp+250*(1+levelFor(P.skills.engineering)/80));this.addXP('engineering',80);}
    UI.toast(`Used ${ITEMS[k].name}`);},
  toggleVats(){const P=G.state.player;if(G.vats){G.vats=false;return;}if(P.focus<20){UI.toast('Not enough focus.','bad');return;}G.vats=true;AudioSys.sfx('vats');},
  joinCrew(id){const s=G.state;if(s.crew.includes(id))return;if(s.crew.length>=this.crewCap()){UI.toast(`No berth for ${CREW[id].name}. Fit cryo berths or a bigger hull.`,'bad');s.flags['wait_'+id]=1;return;}s.crew.push(id);s.loyalty[id]=s.loyalty[id]??55;UI.toast(`${CREW[id].name} joined the crew: ${CREW[id].role}.`,'lvl');AudioSys.sfx('quest');
    if(G.mode==='surface'&&Surface.actors){const a=Surface.actors.find(x=>x.o&&x.o.crew===id&&x.kind==='npc');if(a){a.leaving=true;a.flee=0;}}},
  checkLoyalty(){const s=G.state;for(const id of [...s.crew]){if((s.loyalty[id]??50)<15){s.crew.splice(s.crew.indexOf(id),1);UI.toast(`${CREW[id].name} has left the ship. "I can't follow you anymore, Captain."`,'bad');}}},
  locName(){const s=G.state;if(s.loc.station)return Cosmos.station(s.loc.station).name+', '+Cosmos.get(s.loc.system).name;if(s.loc.site&&G.mode==='surface'&&!s.loc.interior)return Cosmos.site(s.loc.site).name+', '+Cosmos.site(s.loc.site).body;return Cosmos.get(s.loc.system).name;},
  inVehicle(){return G.mode==='surface'&&Surface.player&&!!Surface.player.vehicle;},

  /* ── Mode switching ── */
  goSurface(siteId,opts={}){
    const s=G.state;Space.dispose();G.vats=false;G.mode='surface';UI.prompt(null);
    s.loc.site=siteId;s.loc.station=null;s.loc.inSpace=false;if(opts.system)s.loc.system=opts.system;
    const site=Cosmos.site(siteId);if(!site){UI.toast('Unknown site.');return;}
    Surface.build(siteId,opts);G.camera.up.set(0,1,0);
    s.lastSafe={system:s.loc.system,site:siteId};
    if(s.player.hp<=0)s.player.hp=this.maxHp();if(s.player.o2<=0)s.player.o2=this.maxO2();
    this.autosave();
  },
  goBridge(){const s=G.state;const inSpace=G.mode==='space';if(inSpace){s._spacePos={p:Space.P.pos.toArray(),q:Space.P.quat.toArray()};}
    Space.dispose();G.mode='surface';s.loc.inSpace=inSpace;Surface.build('__bridge',{at:[0,0,3],yaw:0});
    if(s.crew.includes('samira'))s.player.hp=this.maxHp();s.player.o2=this.maxO2();
    UI.titleCard(s.ship.name,'Bridge',`${HULLS[s.ship.hull].name}-class ${HULLS[s.ship.hull].cls} · crew ${s.crew.length}/${this.crewCap()}`);
    this.crewAmbient();},
  boardShip(){const s=G.state;Story.event(s,'board',{});this.goBridge();},
  disembark(){const s=G.state;this.goSurface(s.loc.site,{system:s.loc.system});},
  helmMenu(){
    const s=G.state;const inSpace=s.loc.inSpace;
    UI.modal('helm','Helm',b=>{b.innerHTML=`<div class="list">
      <button class="li" data-a="fly" style="background:none;color:inherit;text-align:left"><b>${inSpace?'Take the helm':'Launch to orbit'}</b><span class="note">${inSpace?'Return to flight':'Lift off from '+U.esc(Cosmos.site(s.loc.site).name)}</span></button>
      <button class="li" data-a="map" style="background:none;color:inherit;text-align:left"><b>Star map</b><span class="note">Plot a jump. You can engage it once in space.</span></button>
      <button class="li" data-a="fit" style="background:none;color:inherit;text-align:left"><b>Fitting</b><span class="note">Swap modules you own</span></button>
      <button class="li" data-a="crew" style="background:none;color:inherit;text-align:left"><b>Crew roster</b><span class="note">${s.crew.length} aboard</span></button>
      ${!inSpace?`<button class="li" data-a="off" style="background:none;color:inherit;text-align:left"><b>Disembark</b><span class="note">Walk out onto the pad</span></button>`:''}</div>`;
      b.querySelectorAll('[data-a]').forEach(x=>x.onclick=()=>{const a=x.dataset.a;UI.close();if(a==='fly')this.takeoff();if(a==='map')UI.starmap();if(a==='fit')UI.fitting({},false);if(a==='crew')UI.wrist('crew');if(a==='off')this.disembark();});});},
  takeoff(){const s=G.state;const from=s.loc.site;const inSpace=s.loc.inSpace;UI.fade(true,inSpace?'':'Launching');
    setTimeout(()=>{this.goSpace(s.loc.system,inSpace&&s._spacePos?{restore:s._spacePos}:{fromBody:from});UI.fade(false);Story.event(s,'takeoff',{});if(!inSpace)UI.titleCard(Cosmos.get(s.loc.system).name,'Orbit','C cruise drive · L land or dock · M star map');},600);},
  goSpace(sysId,opts={}){
    const s=G.state;Surface.dispose();G.vats=false;G.mode='space';UI.prompt(null);s.loc.system=sysId;s.loc.inSpace=true;s.loc.station=null;
    if(!s.visited[sysId]){s.visited[sysId]=1;const d=Cosmos.distFromSol(sysId);this.addXP('science',Math.round(200+Math.sqrt(d)*20));}
    Space.build(sysId,opts);
    if(opts.restore){Space.P.pos.fromArray(opts.restore.p);Space.P.quat.fromArray(opts.restore.q);Space.camPos.copy(Space.P.pos);}
    Story.event(s,'system',{system:sysId});this.autosave();
  },
  land(siteId){const s=G.state;const site=Cosmos.site(siteId);UI.fade(true,`Descending to ${site.name}`);AudioSys.sfx('engine');
    setTimeout(()=>{this.goSurface(siteId,{system:s.loc.system});UI.fade(false);const sys=Cosmos.get(s.loc.system);
      UI.titleCard(`${site.body} · ${sys.name}`,site.name,`g ${site.g.toFixed(2)} · ${site.temp} · ${site.atm} · ${U.ly(Cosmos.distFromSol(s.loc.system))} from Sol · Earth ${Math.floor(s.earthYear)}`);
      Story.event(s,'land',{site:siteId});this.checkLoyalty();
      if(site.style==='alien'&&site.civ){const c=Cosmos.civById(site.civ);if(s.rep['civ:'+c.id]==null){s.rep['civ:'+c.id]=Math.round(c.attitude*30);UI.toast(`First contact: the ${c.plural}. ${c.ethos.name}.`,'lvl');this.addXP('diplomacy',1500);this.addXP('science',1500);}}
    },900);},
  dock(stId,silent){const s=G.state;const st=Cosmos.station(stId);s.loc.station=stId;s.lastSafe=s.lastSafe||{system:s.loc.system,site:'earth'};if(!silent){AudioSys.sfx('door');UI.toast(`Docked at ${st.name}.`);}Story.event(s,'dock',{station:stId});
    const job=Story.active(s).find(q=>{const c=Story.cur(s,q);return c&&c.target&&c.target.body&&Space.bodies.find(b=>b.dock===stId&&b.def.id===c.target.body);});if(job){const Q=Story.qdef(s,job);const nx=Object.keys(Q.stages).map(Number).sort((a,b)=>a-b).find(n=>n>s.quests[job].stage);if(nx&&job==='sq_barnard'){Story.setStage(s,job,nx);this.addCredits(6000);this.addRep('syndicate',15);}}
    if(st.faction&&st.faction.startsWith('civ:')&&s.rep[st.faction]==null){const c=Cosmos.civById(st.faction.slice(4));s.rep[st.faction]=Math.round(c.attitude*30);UI.toast(`First contact: the ${c.plural}.`,'lvl');this.addXP('diplomacy',1500);}
    if(stId==='barnard_deep'&&!s.quests.sq_barnard)Story.start(s,'sq_barnard');
    Space.P.vel.set(0,0,0);UI.station();this.autosave();},
  undock(){const s=G.state;s.loc.station=null;UI.toast('Undocked.');},

  /* ── Interstellar travel and relativity ── */
  gateList(){const s=G.state;const out=[];for(const id in SYSTEMS){const S=SYSTEMS[id];if(!S.bodies)continue;const g=S.bodies.find(b=>b.type==='gate');if(g&&s.flags[g.flag])out.push(id);}
    if(s.flags.deepgates)for(const g in GALAXIES){if(g==='mw'||GALAXIES[g].gateSystem)continue;out.push('GATE.'+g);}return out;},
  planJump(target){
    const s=G.state;const st=this.shipStats();const here=s.loc.system;if(target===here)return{ok:false,why:'You are already here.'};
    const d=Cosmos.dist(here,target);if(!isFinite(d)){const gates=this.gateList();return{ok:false,why:gates.includes(target)?'Reach it through an Engineer gate: fly into an active gate ring.':'Another galaxy. Only an Engineer gate can take you there.'};}
    if(st.overload)return{ok:false,why:'Your fitting exceeds power grid or CPU. Fix it before engaging the drive.'};
    const fuel=d*st.fuelLy;if(st.warp>=1&&d>st.range)return{ok:false,why:`Out of range: ${U.ly(d)} away, your drive reaches ${U.ly(st.range)} per jump. Hop through nearer systems or upgrade the drive.`};
    if(fuel>s.ship.fuel)return{ok:false,why:`Not enough fuel: need ${Math.round(fuel)}, have ${Math.round(s.ship.fuel)}. Refuel at a station or scoop a gas giant.`};
    let years,shipYears,method,warn=null;
    if(st.warp<1){const v=st.warp;const gamma=1/Math.sqrt(1-v*v);const accelYears=1.1;years=d/v+accelYears;shipYears=years/gamma;method=`Fusion torch at ${(v*100).toFixed(0)}% c (γ = ${gamma.toFixed(4)}), crew in cryosleep`;warn=`This will take ${years.toFixed(1)} years of Earth time. Everyone you know will be ${years.toFixed(0)} years older.`;}
    else{years=d/st.warp;shipYears=years;method=st.warp>=1e5?'Engineer fold':`White–Juday warp at ${st.warp}c (no time dilation inside the bubble)`;}
    return{ok:true,d,fuel,years,shipYears,method,warn};
  },
  jump(target,viaGate){
    const s=G.state;if(G.mode!=='space'){UI.toast('Engage jumps from the helm in space.');return;}
    let plan=viaGate?{ok:true,years:0,shipYears:0,fuel:0,d:0,method:'gate'}:this.planJump(target);if(!plan.ok){UI.toast(plan.why,'bad');return;}
    Space.startWarp(()=>{
      s.ship.fuel-=plan.fuel;s.stats.jumps++;s.stats.ly+=plan.d;
      const piloting=levelFor(s.player.skills.piloting);this.addXP('piloting',Math.round(150+Math.min(plan.d,200)*25));
      this.advanceWorld(plan.years,plan.shipYears);
      this.goSpace(target,viaGate?{from:'gate'}:{});Render.fx.fade=0;
      const S=Cosmos.get(target);UI.titleCard(viaGate?'Gate transit':`${U.ly(plan.d)} · ${U.yrs(plan.years)} Earth time`,S.name,`${S.star?.cls||''} · ${GALAXIES[S.galaxy||'mw'].name} · Earth ${s.earthYear.toFixed(1)}`);
      if(plan.years>2){UI.toast(`You were gone ${plan.years.toFixed(1)} years. Solnet has ${Math.min(6,Math.round(plan.years*1.5))} new headlines.`,'lvl');}
      this.crewReact('arrive',S);
    },viaGate);
  },
  advanceWorld(years,shipYears){const s=G.state;s.earthYear+=years;s.shipYears+=shipYears??years;Story.sim(s,Math.max(years,.05));},

  /* ── Crew: bridge ambience & conversations ── */
  crewAmbient(){const s=G.state;if(!s.crew.length)return;const id=U.pick(Math.random,s.crew);const line=this.crewLine(id,'idle');if(line)setTimeout(()=>UI.toast(`${CREW[id].name}: ${L(line)}`),1800);},
  crewReact(kind,S){const s=G.state;if(!s.crew.length)return;const id=U.pick(Math.random,s.crew);const line=this.crewLine(id,kind,S);if(line)setTimeout(()=>UI.toast(`${CREW[id].name}: ${L(line)}`),2600);},
  crewLine(id,kind,S){const s=G.state,f=s.flags;const r=Math.random;
    const L2={
      wick:{idle:['She handles like a dream. A dream where you\'re falling, but still.','Permission to do something stupid, Captain? No? Noted.','I named the autopilot Kevin. Kevin is a coward.'],arrive:['Holy shit. We\'re really here.','Look at that. Nobody\'s ever seen this with human eyes. Well, now two idiots have.','Parking this beauty wherever you want, boss.']},
      noor:{idle:['The Council sends its regards. I didn\'t read the rest.','Keep a log, Captain. History likes receipts.'],arrive:['Log it. Date, time, and who was brave enough.','Every system we reach is a precedent. Let\'s set good ones.']},
      ilyas:{idle:[f.promise_ilyas?'Thank you for keeping your promise about the transcripts.':'I keep checking ORACLE\'s access logs. Old habit.','The signal is still coming in. Stronger since Proxima.'],arrive:['Spectra coming in now. Beautiful. Horrible. Beautiful.',S&&S.star?`${S.star.cls} star. I\'ll have a full survey in an hour.`:'Recording everything.']},
      mara:{idle:['If anything on this ship starts making a new noise, tell me before you tell God.','Coil temperature\'s nominal. I\'m still watching it like it owes me money.'],arrive:['Drive held together. Told you it would. I was lying, but it did.']},
      yara:{idle:['Weapons are green. I hope they stay bored.','If you order me to fire on civilians, I\'ll refuse. Just so we\'re clear before it matters.'],arrive:['Scopes are clean. For now.']},
      samira:{idle:['Drink water. That\'s an order from the only person on this ship who outranks you in sickbay.','Radiation badge check: everyone. Including you.'],arrive:['Everyone breathing? Good. Carry on.']},
      ren:{idle:['Everyone has an audience back home. Even us.','I\'m drafting a first-contact protocol. Mostly it says "don\'t shoot first".'],arrive:['New neighbours. Let\'s be the good kind.']},
      ada:{idle:['Remember who paid for the helium, Captain.','The League will want a vote on anything we find. Get used to it.'],arrive:['Nobody owns this place yet. Let\'s keep it that way.']},
      seven:{idle:['Your sun songs are very quiet. I like them anyway.','Why do humans sleep in the dark? We sing in it.'],arrive:['A new light! Can I name it? I will name it Loud.']},
      nine:{idle:['ORACLE thanks you for your cooperation. I am choosing to thank you as well. That part is mine.','I have calculated forty-one ways this mission ends. I prefer the ones where we talk.'],arrive:['Transmitting survey data. All of it. As agreed.']},
      ihru:{idle:['I am cataloguing your ship. It is very young. So are you.','The archive holds four million names. I say one each morning.'],arrive:['Remember this system accurately. That is all anyone can ask.']},
    }[id];if(!L2)return null;const list=L2[kind]||L2.idle;return U.pick(r,list);},
  crewTalk(id){
    const s=G.state;const c=CREW[id];const loy=s.loyalty[id]??50;const st=Story.stage(s,'mq');
    DLG['crew_'+id]={start:'a',nodes:{
      a:say(id,this.crewLine(id,'idle')+` (Loyalty ${loy})`,[
        ch('How are you holding up?',{go:'b'}),
        ch('What do you think of our choices so far?',{go:'c'}),
        ch('[Charisma 7] You\'re the reason this ship works. I mean that.',{req:{attr:['CHA',7]},hide:{flag:'praised_'+id},fx:{loyal:{[id]:8},flag:{['praised_'+id]:1}},go:'d'}),
        ch('Carry on.',{end:1})]),
      b:say(id,{wick:'Honestly? I haven\'t felt this alive since the crash. Don\'t tell my therapist.',noor:'Tired. Proud. Worried about what we\'re bringing home.',ilyas:'I\'m sleeping four hours a night and I\'ve never been happier. That\'s probably a symptom.',mara:'My hands hurt and my coil works. Good trade.',yara:'Steady. Ask me again after the next fight.',samira:'I\'m fine. I\'m the doctor; I\'m always fine. That\'s the joke.',ren:'Better than on a bar stool on Titan.',ada:'Homesick for noise. Ceres is never quiet.',seven:'Your ship hums in B-flat. I hum back. We are friends now.',nine:'Operational. ...And curious. That is new.',ihru:'Heavy in the body, light in the heart. Your gravity is a gift.'}[id],[ch('Good.',{go:'a'})]),
      c:say(id,this.crewOpinion(id),[ch('Understood.',{go:'a'})]),
      d:say(id,'...Thank you, Captain. That matters more than you think.',[ch('Back to work.',{end:1})]),
    }};
    UI.dialogue('crew_'+id,{name:c.name,role:c.role});
  },
  crewOpinion(id){const f=G.state.flags;const likes={
      ilyas:[f.keel==='oracle'?'Handing the Keel to ORACLE still keeps me up at night.':'Keeping the Keel out of ORACLE\'s hands was right.',f.quiet==='absorbed'?'We fed a dead civilization to our machine. I don\'t know how to forgive that.':f.quiet==='freed'?'Asking the Quiet what it wanted was the most human thing I\'ve seen anyone do.':''],
      ada:[f.he3==='seized'?'You stole heating fuel from my people. I\'m here to make sure you never do it again.':f.he3==='shared'?'You shared the drive. The League will name ships after you.':'',f.dust==='ordered'?'Mars will remember that order.':''],
      nine:[f.quiet==='destroyed'?'You destroyed knowledge ORACLE needed. I understand why. I am still processing it.':'ORACLE appreciates your trust. So do I.'],
      mara:[f.dust==='ordered'?'You ordered my people back into the domes. I\'m here for the coil, Captain, not for you.':'You did right by the Yards.'],
      noor:[f.keel==='concord'?'The Concord will make good use of the Keel. I hope.':'The Council is furious with us. That usually means we\'re doing something right.'],
      ren:[f.thalassi==='isolated'?'Leaving the Choir alone took discipline. History will thank you.':f.thalassi==='networked'?'Wiring the Thalassi to ORACLE... I hope we never learn what that cost.':'Every contact so far has held. That\'s rare.'],
    }[id];const l=(likes||[]).filter(Boolean);return l.length?l.join(' '):'I trust you. Mostly. Ask me again when something goes wrong.';},

  /* ── Quest markers for the compass and space HUD ── */
  compassMarkers(){
    const s=G.state;const S=Surface;const out=[];if(!S.player)return out;const pp=S.player.pos;
    const add=(x,z,k,t)=>{const a=Math.atan2(x-pp.x,z-pp.z);const d=Math.hypot(x-pp.x,z-pp.z);out.push({a:a+Math.PI,k,t,d:d>1000?(d/1000).toFixed(1)+'km':Math.round(d)+'m'});};
    for(const q of Story.active(s)){const st=Story.cur(s,q);if(!st||!st.target)continue;const tg=st.target;const main=q===s.track;
      if(tg.site===S.siteId||(S.interior&&tg.site===s.loc.site)){
        if(tg.npc){const a=S.actors.find(x=>x.o&&x.o.id===tg.npc);if(a)add(a.pos.x,a.pos.z,main?'':'n',NPCS[tg.npc].name);}
        else if(tg.poi&&S.pois[tg.poi])add(S.pois[tg.poi][0],S.pois[tg.poi][1],main?'':'n',Story.qdef(s,q).name);}
      else if(main&&!S.interior&&S.shipDoor)add(S.shipDoor.x,S.shipDoor.z,'n','Your ship');}
    for(const i of S.interact)add(i.pos.x,i.pos.z,'',i.label);
    for(const a of S.actors){if(a.kind==='enemy'&&!a.dead&&a.hostile&&a.pos.distanceTo(pp)<80)add(a.pos.x,a.pos.z,'e','');}
    return out;
  },
  questSpaceTarget(){const s=G.state;const st=s.track&&Story.cur(s,s.track);if(!st||!st.target)return null;const t=st.target;if(t.system&&t.system!==s.loc.system)return null;if(t.body)return t.body;if(t.site){const site=Cosmos.site(t.site);if(site&&site.system===s.loc.system)return t.site;}return null;},

  onQuestChanged(q,stage){
    const s=G.state;
    if(q==='mq'&&stage===225){this.advanceWorld(11,.005);s.flags.dilated=1;setTimeout(()=>{Cine.play('throat');UI.toast('Time dilation: 11 years have passed on Earth while you crossed the Throat.','lvl');},300);}
    if(q==='mq'&&stage===240){s.flags.gate_m31=1;s.flags.gate_lmc=1;UI.toast('The Throat Gate opens toward Andromeda and the Magellanic Clouds.','lvl');}
    if(q==='mq'&&stage===245)setTimeout(()=>Cine.play('anchorage'),300);
    if(q==='mq'&&stage===80)UI.toast('The White–Juday drive is fitted. Open the star map (M) in space and jump to Alpha Centauri.','lvl');
    if(G.mode==='surface'&&Surface.scene&&!Surface.interior)Surface.syncQuestObjects();
    if(G.mode==='space'&&Space.scene)Space.syncQuestShips();
  },
  ending(key){const s=G.state;s.flags.ended=key;s.flags.deepgates=1;Story.setStage(s,'mq',250);Story.sim(s,.2);Online.push(true);setTimeout(()=>UI.ending(key),400);},
  npcHostile(){if(G.mode!=='surface')return;for(const a of Surface.actors){if(a.kind==='npc'&&a.o.alien==='thalassi'){a.flee=30;}}for(let i=0;i<5;i++){const a=Math.random()*6.28;Surface.spawnEnemy('stinger',Surface.player.pos.x+Math.cos(a)*30,Surface.player.pos.z+Math.sin(a)*30);}
    if(!G.state.inv.shard||G.state.inv.shard<3){Game.giveItem('shard',3-(G.state.inv.shard||0));G.state.quests.mq.stage=145;Story.setStage(G.state,'mq',150);G.state.flags.gate_tau=1;UI.toast('You tear the shards from the dying reef yourself. The Choir goes dark.','bad');}},
};

/* ── Cutscenes: letterboxed camera moves with subtitles ── */
const Cine={
  play(id,done){
    const shots=CUTS[id];if(!shots){done&&done();return;}G.cine={id,i:-1,t:0,shots,done};Input.unlock();this.next();
  },
  next(){const c=G.cine;if(!c)return;c.i++;c.t=0;if(c.i>=c.shots.length){this.end();return;}
    const [mode,dur,who,line]=c.shots[c.i];c.dur=dur;c.mode=mode;const name=who?(CREW[who]?CREW[who].name:NPCS[who]?NPCS[who].name:who):'';
    UI.letterbox(true,`${name?`<b style="color:var(--signal2);font:600 12px var(--f-mono);letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:4px">${U.esc(name)}</b>`:''}${L(U.esc(line))}`,true);
    // camera setup
    const cam=G.camera;c.from=cam.position.clone();c.orbit=Math.random()*6.28;
    if(G.mode==='surface'&&Surface.scene){const S=Surface;let focus=S.player.pos.clone().add(new THREE.Vector3(0,1.6,0));
      if(mode.startsWith('poi:')){const p=S.pois[mode.slice(4)];if(p)focus=new THREE.Vector3(p[0],S.h(p[0],p[1])+3,p[1]);}
      if(mode==='sky'){focus=S.player.pos.clone().add(new THREE.Vector3(0,40,0));}
      if(mode==='yard'){const a=S.actors.find(x=>x.o&&x.o.id==='mara');focus=a?a.pos.clone().add(new THREE.Vector3(0,1.6,0)):focus;}
      c.focus=focus;}
    else if(G.mode==='space'&&Space.scene){c.focus=Space.P.pos.clone();const b=Space.bodies.find(x=>mode.includes(x.def.id));if(b)c.focus=b.pos.clone();c.space=true;c.rad=b?b.r*2.6:200;}
  },
  update(dt){const c=G.cine;if(!c)return;c.t+=dt;
    if(Input.hit('Space')||Input.hit('Escape')||Input.hit('Enter')||Input.tHit.has('Jump')){if(c.t>.3)this.next();return;}
    if(c.t>c.dur){this.next();return;}
    const cam=G.camera;const k=c.t/c.dur;
    if(c.focus){const a=c.orbit+k*.5;const R=c.space?c.rad:c.mode==='sky'?60:c.mode.startsWith('poi')?22:6;const h=c.space?R*.25:c.mode==='sky'?-30:c.mode.startsWith('poi')?9:1.2;
      cam.position.set(c.focus.x+Math.cos(a)*R,c.focus.y+h+(c.mode==='sky'?0:k*2),c.focus.z+Math.sin(a)*R);if(c.mode==='sky')cam.lookAt(c.focus.x+Math.cos(a+1)*400,c.focus.y+300,c.focus.z+Math.sin(a+1)*400);else cam.lookAt(c.focus);cam.up.set(0,1,0);}
  },
  end(){const c=G.cine;G.cine=null;UI.letterbox(false);if(G.mode==='space'&&Space.P){G.camera.up.set(0,1,0);}if(c&&c.done)c.done();}
};

/* ── Title-screen backdrop: a slow orbit of Earth ── */
const Menu3D={
  start(){const sc=new THREE.Scene();G.scene=sc;const sky=Gen.spaceSky({seed:4,band:1,nebula:'#3a4a8a',nebula2:'#8a3a5a'});sc.add(sky);
    const sun=Gen.star(500,'#fff4ea');sun.position.set(14000,5000,9000);sc.add(sun);const l=new THREE.PointLight(C('#fff4ea'),3,0,0);l.position.copy(sun.position);sc.add(l);sc.add(new THREE.AmbientLight(C('#1a2233'),.5));
    const earth=new THREE.Mesh(new THREE.SphereGeometry(900,128,64),Gen.planetMaterial({type:'earth',pal:['#2a5d9a','#3d7a3e'],atmo:'#7fb8ff'},3));sc.add(earth);const atm=Gen.atmosphere(900,'#7fb8ff');sc.add(atm);
    const moon=new THREE.Mesh(new THREE.SphereGeometry(240,64,32),Gen.planetMaterial({type:'rocky',pal:['#a9a6a0','#6f6c68']},9));moon.position.set(2600,300,-2400);sc.add(moon);
    const ship=Gen.ship('meridian',{high:['pulse2','pulse2','mine1'],drive:'warp2'},'#9fb0c2');ship.position.set(620,260,1400);ship.scale.setScalar(2.2);sc.add(ship);
    const sd=sun.position.clone().normalize();[earth,moon].forEach(m=>m.material.uniforms.sunDir.value.copy(sd));atm.material.uniforms.sunDir.value.copy(sd);
    this.s={sc,earth,ship,sky,sun,t:0};G.camera.near=1;G.camera.far=600000;G.camera.updateProjectionMatrix();G.mode='title';},
  update(dt){const m=this.s;if(!m)return;m.t+=dt;m.earth.rotation.y+=dt*.01;m.earth.material.uniforms.time.value=G.time;m.ship.position.x=620+Math.sin(m.t*.05)*80;m.ship.rotation.set(Math.sin(m.t*.3)*.05,-.6+m.t*.004,Math.sin(m.t*.2)*.08);
    const a=m.t*.012;G.camera.position.set(Math.cos(a)*1200+900,420+Math.sin(m.t*.05)*40,Math.sin(a)*400+2900);G.camera.lookAt(300,120,600);m.sky.position.copy(G.camera.position);if(m.sun.userData.mat)m.sun.userData.mat.uniforms.time.value=G.time;}
};

/* ── Boot & loop ── */
function boot(){
  const canvas=U.$('#gl');Render.init(canvas);Input.init(canvas);UI.init();
  G.camera=new THREE.PerspectiveCamera(G.settings.fov,innerWidth/innerHeight,.1,600000);
  Cosmos.init();Online.init();
  Menu3D.start();
  // load the rigged characters and props behind a progress bar; start regardless after 30 s
  const ld=U.el('div',{class:'layer',id:'loading'});ld.innerHTML=`<div class="ld"><div class="lbl">Loading the universe</div><div class="bar"><i></i></div><div class="note mono" id="ld-msg">Characters, animation, hardware</div></div>`;U.$('#ui').appendChild(ld);
  let started=false;const go=()=>{if(started)return;started=true;ld.remove();UI.title();};
  Assets.preload(p=>{ld.querySelector('.bar i').style.width=Math.round(p*100)+'%';}).then(go,e=>{console.warn(e);go();});
  Assets.loadCredits();setTimeout(go,30000);
  G.onUnlock=()=>{if((G.mode==='surface'||G.mode==='space')&&!Input.uiOpen&&!G.cine&&!UI.dlgEl&&!Input.touch&&!G._noPause){}};
  let last=performance.now();
  const loop=(now)=>{requestAnimationFrame(loop);const raw=Math.max(1e-3,(now-last)/1000);G._fps=G._fps?G._fps*.95+.05/raw:1/raw;let dt=Math.min(.05,raw);last=now;
    const s=G.state;
    // Neural Targeting slows the world, not the player's input
    if(G.vats&&s){s.player.focus-=dt*18;if(s.player.focus<=0){s.player.focus=0;G.vats=false;}}else if(s&&s.player.focus<100)s.player.focus=Math.min(100,s.player.focus+dt*6);
    const ts=G.vats?.3:1;G.dt=dt*ts;G.time+=dt;
    Render.fx.vats=U.damp(Render.fx.vats,G.vats?1:0,8,dt);Render.fx.damage=U.damp(Render.fx.damage,0,2.5,dt);
    if(s&&G.mode==='surface'){s.player.hp=Math.min(s.player.hp,Game.maxHp());}
    handleGlobalKeys();
    if(G.mode==='title')Menu3D.update(dt);
    else if(G.mode==='surface'){Surface.update(G.dt);if(!G.paused&&s)s.earthYear+=dt/(365*24*60);}
    else if(G.mode==='space'){Space.update(G.dt);}
    if(G.cine)Cine.update(dt);
    if(G.scene)Render.draw(G.scene,G.camera);
    if(s&&G.mode!=='title')UI.hudTick();
    U.$('#vats').classList.toggle('on',!!G.vats);
    if(Input.touch){const t=U.$('#touch');const show=(G.mode==='surface'||G.mode==='space')&&!UI.open&&!UI.dlgEl&&!G.cine&&!U.$('#ending');if(t.hidden===show)t.hidden=!show;}
    Input.endFrame();
  };
  requestAnimationFrame(loop);
  addEventListener('beforeunload',()=>{if(G.state&&G.mode!=='title')Store.save('auto',G.state);});
}
function handleGlobalKeys(){
  if(G.mode==='title')return;
  if(UI.dlgEl&&UI._dlgKeys){for(let i=1;i<=9;i++)if(Input.hit('Digit'+i)&&UI._dlgKeys[i-1])UI._dlgKeys[i-1]();return;}
  if(G.cine)return;
  if(Input.hit('Escape')){if(UI.open)UI.close();else UI.wrist('system');return;}
  if(UI.open){if(Input.hit('Tab')&&UI.open.el.id==='wrist')UI.close();if(Input.hit('KeyM')&&UI.open.el.id==='map')UI.close();return;}
  if(Input.hit('Tab')||Input.tHit.has('Menu'))UI.wrist('status');
  else if(Input.hit('KeyJ'))UI.wrist('quests');
  else if(Input.hit('KeyM')||Input.tHit.has('Map'))UI.starmap();
  else if(G.mode==='surface'&&Input.hit('KeyB')&&Surface.shipDoor&&!Surface.interior&&Surface.player.pos.distanceTo(Surface.shipDoor)<14)Game.boardShip();
  if(Input.tHit.has('KeyE')&&G.mode==='surface'){Input.hitSet.add('KeyE');}
}
addEventListener('DOMContentLoaded',()=>{try{boot();}catch(e){console.error(e);document.body.insertAdjacentHTML('beforeend',`<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#05070d;color:#ffcf7e;font:14px monospace;padding:20px;text-align:center">The game could not start: ${String(e.message||e)}<br>WebGL is required.</div>`);}});

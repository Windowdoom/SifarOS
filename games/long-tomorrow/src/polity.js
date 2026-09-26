/* ═══════════════════════════════════════════════════════════════════════
   POLITY · the Command layer: govern Earth, the colonies and beyond.
   A month-by-month simulation (budget, indicators, five risk meters,
   factions, government type, blocs, colonies, the World Ledger,
   elections), the 24-scene governance campaign, future crises, the
   life and dynasty layer, and The Tabib's rounds.
   Opens with K, from the wrist computer, or at any command terminal.
   ═══════════════════════════════════════════════════════════════════════ */
const Polity={
  /* ── state ── */
  init(s){
    if(!s.pol){
      const nations={};for(const n of NATIONS)nations[n.id]={rel:U.clamp(10+(n.stab-55)*.4,-40,60),stab:n.stab,war:0,aid:0};
      const blocs={};for(const b in BLOCS)blocs[b]=b==='iron'?-5:15;
      const colonies={};for(const k in SOL_COLONIES){const c=SOL_COLONIES[k];colonies[k]={owner:c.owner,gov:c.gov,pop:c.pop,stock:[...c.stock],prod:[...c.prod],use:[...c.use],built:[...c.built],queue:[],ai:c.ai||'assist',mandate:'output',loyalty:c.owner==='frontier'?55:70,level:1,founded:false};}
      s.pol={office:null,portfolio:null,capital:30,treasury:140,approval:50,months:0,monthsInOffice:0,
        extra:{},risksExtra:{},govAdj:{},facAdj:{},ind:{},risks:{},gov:{},fac:{},
        laws:{fiscal:1,conscience:1,press:1},policies:{diplomacy:1,patrols:1},
        charter:{leadership:'parliamentary',economy:'mixed',regions:'federal',courts:'independent',press:'free',conscience:'pluralist',ai:'delegated',term:48},
        nations,blocs,colonies,projects:{},ledgerDone:{},scenesDone:{},sceneIdx:0,lastScene:-9,crisesDone:{},inbox:[],later:[],flagsP:{},
        nextElection:48,electionsWon:0,history:[],offersSeen:{},donated:0,tabib:{stage:0,lastNote:-99,notes:0},seen:0};
      this.recompute(s);
    }
    if(!s.life){const age0=s.player.origin==='marine'?27:s.player.origin==='drifter'?24:31;
      s.life={age0,born:Math.floor(START_YEAR-age0),faith:'none',practice:{pray:false,fast:false,streak:0},partner:null,spouse:null,children:[],parents:{born:Math.floor(START_YEAR-age0-30),alive:true},props:{},company:null,generation:1,ancestors:[]};}
    return s.pol;
  },
  P(){return G.state&&this.init(G.state);},
  office(){const p=this.P();return p&&p.office?OFFICES[p.office]:null;},
  rank(){const o=this.office();return o?o.rank:0;},
  era(s){let e=PERAS[0];for(const x of PERAS)if(s.earthYear>=x.from)e=x;return e;},
  eraIdx(s){let i=0;PERAS.forEach((x,j)=>{if(s.earthYear>=x.from)i=j;});return i;},
  govType(p){const g=Object.assign({ai:p.risks.ai},p.gov);for(const t of GOV_TYPES){let ok=true;for(const k of['dem','free','corp','nat','ai'])if(t[k]!=null&&!(g[k]>=t[k]))ok=false;if(ok)return t.name;}return 'Total State';},

  /* recompute derived indicators, risks, government scores and factions from structure + decaying shocks */
  recompute(s){
    const p=s.pol,w=s.world;const st={};for(const k in IND)st[k]=0;const rk={fin:20,climate:44,unrest:24,ai:18,gal:14};const gv={dem:70,free:64,corp:45,nat:35};const fa={};for(const f of PF_ORDER)fa[f]=50;
    const add=(o,fx,m=1)=>{if(fx)for(const k in fx)if(k in o)o[k]+=fx[k]*m;};
    for(const id in p.laws){const L=LAWS[id];if(!L)continue;add(st,L.fx);add(rk,L.risk);L.votes.forEach((v,i)=>fa[PF_ORDER[i]]+=v*.35);}
    for(const id in p.policies){const Q=POLICIES[id];if(!Q)continue;add(st,Q.fx);add(rk,Q.risk);add(gv,Q.gov);}
    for(const id in p.ledgerDone){const L=LEDGER[id];if(!L)continue;add(st,L.fx);add(rk,L.risk);add(gv,L.gov);}
    const ch=p.charter;
    if(ch.ai==='delegated'){st.capacity+=4;rk.ai+=8;}if(ch.ai==='sovereign'){st.capacity+=10;rk.ai+=22;gv.dem-=8;}if(ch.ai==='advisory'){rk.ai-=4;st.capacity-=2;}
    if(ch.courts==='executive'){gv.dem-=8;gv.free-=6;fa.civic-=10;fa.establishment+=8;}
    if(ch.press==='licensed'){gv.free-=15;st.rights-=10;fa.civic-=12;}
    if(ch.regions==='unitary'){st.capacity+=3;rk.unrest+=10;fa.habitat-=12;}else{fa.habitat+=5;}
    if(ch.economy==='market'){gv.corp+=10;fa.enterprise+=10;fa.labor-=6;}if(ch.economy==='cooperative'){gv.corp-=12;fa.labor+=10;fa.enterprise-=10;st.equality+=5;}if(ch.economy==='planned'){gv.corp-=10;gv.free-=6;fa.establishment+=10;fa.enterprise-=12;st.capacity+=3;}
    if(ch.leadership==='hereditary'){gv.dem-=25;fa.establishment+=10;fa.civic-=15;}if(ch.leadership==='presidential'){fa.establishment+=3;}if(ch.leadership==='council'){gv.dem+=3;}
    if(ch.conscience==='established'){fa.continuity+=8;fa.civic-=5;}if(ch.conscience==='secular'){fa.civic+=4;fa.continuity-=5;}
    // the wider world pushes on the Concord
    const orc=(w&&w.oracle)||.25,fro=(w&&w.frontier)||.3;st.capacity+=orc*12;st.rights-=orc*6;rk.ai+=orc*40;rk.unrest+=fro*14;
    const f=s.flags;if(f.thalassi==='hostile')rk.gal+=22;if(f.thalassi==='allied')rk.gal-=8;if(f.he3==='seized')rk.unrest+=10;if(f.he3==='shared')st.energy+=4;if(f.dust==='ordered')rk.unrest+=6;if(f.quiet==='absorbed')rk.ai+=15;if(f.quiet==='destroyed')rk.ai-=8;
    // colonies
    for(const k in p.colonies){const c=p.colonies[k];for(const b of c.built){const B=BLUEPRINTS[b];if(!B)continue;if(B.tech)st.tech+=.8;if(B.health)st.health+=.6;if(B.trust)st.trust+=.5;if(B.sec)st.security+=.6;}if(c.ai==='sovereign'){rk.ai+=2;st.capacity+=.8;}}
    for(const k in IND)p.ind[k]=U.clamp(Math.round(50+st[k]+(p.extra[k]||0)),0,100);
    const I=p.ind;
    rk.fin+=Math.sqrt(Math.max(0,-p.treasury))*1.2;rk.climate+=(I.energy<40?5:0);rk.unrest+=(50-p.approval)*.35+(50-I.equality)*.25+(50-I.supply)*.2;rk.ai-=(I.rights-50)*.12;rk.gal+=(I.security>75?4:0);
    for(const k in rk)p.risks[k]=U.clamp(Math.round(rk[k]+(p.risksExtra[k]||0)),0,100);
    for(const k in gv)p.gov[k]=U.clamp(Math.round(gv[k]+(p.govAdj[k]||0)),0,100);
    for(const k of PF_ORDER)p.fac[k]=U.clamp(Math.round(fa[k]+(p.facAdj[k]||0)+(p.approval-50)*.3),0,100);
    return p;
  },
  /* apply a bundle of effects from a scene, crisis, operation or consequence */
  applyFx(s,o,mult=1){
    const p=s.pol;if(!o)return;
    if(o.fx)for(const k in o.fx)if(k in IND)p.extra[k]=(p.extra[k]||0)+o.fx[k]*mult;
    if(o.risk)for(const k in o.risk)p.risksExtra[k]=(p.risksExtra[k]||0)+o.risk[k]*mult;
    if(o.gov)for(const k in o.gov)p.govAdj[k]=(p.govAdj[k]||0)+o.gov[k]*mult;
    if(o.bloc)for(const k in o.bloc)p.blocs[k]=U.clamp((p.blocs[k]||0)+o.bloc[k]*mult,-100,100);
    if(o.people)for(const k in o.people){s.loyalty[k]=U.clamp((s.loyalty[k]||50)+o.people[k]*.6,0,100);}
    if(o.flags)Object.assign(p.flagsP,o.flags);
    if(o.colony)for(const k in o.colony)if(p.colonies[k])p.colonies[k].owner=o.colony[k];
    if(o.cost)p.treasury-=o.cost;if(o.cap)p.capital=U.clamp(p.capital-o.cap,0,100);
    this.recompute(s);
  },
  news(s,t){s.news.unshift({y:s.earthYear,t});s.news=s.news.slice(0,80);},
  push(s,item){const p=s.pol;item.id=item.id||('i'+Math.random().toString(36).slice(2,8));item.at=s.earthYear;p.inbox.unshift(item);p.inbox=p.inbox.slice(0,40);},

  /* ── time: called by the world simulation whenever Earth's calendar moves ── */
  sim(s,years){
    this.init(s);const p=s.pol;const target=Math.floor((s.earthYear-START_YEAR)*12);let n=0;
    while(p.months<target&&n<240){this.month(s,true);n++;}
    if(p.months<target)p.months=target; // very long relativistic jumps: the world skips ahead
  },
  advanceMonth(){const s=G.state;const tgt=START_YEAR+(s.pol.months+1)/12+1e-6;Game.advanceWorld(Math.max(1e-4,tgt-s.earthYear));const p=s.pol;UI.toast(`${this.monthName(s)}: approval ${Math.round(p.approval)}%, treasury ${this.gc(p.treasury)}.`);Game.autosave();},
  month(s,silent){
    const p=s.pol;p.months++;const of=p.office;if(of)p.monthsInOffice++;
    // shocks fade over a few years; structure stays while laws and policies do
    for(const k in p.extra)p.extra[k]*=.975;for(const k in p.risksExtra)p.risksExtra[k]*=.97;for(const k in p.govAdj)p.govAdj[k]*=.992;for(const k in p.facAdj)p.facAdj[k]*=.97;
    // budget (Gc a month)
    let spend=40;for(const id in p.laws)spend+=(LAWS[id]&&LAWS[id].cost)||0;for(const id in p.policies)spend+=(POLICIES[id]&&POLICIES[id].cost)||0;
    const revenue=62+(p.ind.growth-50)*.8+(p.ind.capacity-50)*.2;p.lastBudget={revenue:Math.round(revenue),spend:Math.round(spend)};p.treasury+=revenue-spend;
    if(p.treasury<0)p.treasury*=1.004; // interest on debt
    // World Ledger construction
    for(const id in p.projects){const L=LEDGER[id];const per=L.cost/L.months;if(p.treasury>-600){p.treasury-=per;p.projects[id]++;}
      if(p.projects[id]>=L.months){delete p.projects[id];p.ledgerDone[id]=s.earthYear;if(L.visible)s.flags['built_'+L.visible]=1;this.news(s,`World Ledger: ${L.name} is complete. ${L.lives||''}`);this.push(s,{kind:'news',title:'World Ledger complete',text:`${L.name}. ${L.desc}`});}}
    // colonies
    for(const k in p.colonies){const c=p.colonies[k];for(let i=0;i<3;i++)c.stock[i]=Math.max(0,Math.min(400,c.stock[i]+(c.prod[i]-c.use[i])*3));
      if(c.stock[0]<=0){c.loyalty-=2;p.risksExtra.unrest=(p.risksExtra.unrest||0)+.5;}
      c.queue=c.queue.filter(q=>{q.left--;if(q.left<=0){c.built.push(q.b);const B=BLUEPRINTS[q.b];if(B.prod)for(let i=0;i<3;i++)c.prod[i]+=B.prod[i];if(B.pop)c.pop=+(c.pop+B.pop).toFixed(2);if(c.founded)c.level=Math.min(6,1+Math.floor(c.built.length/2));return false;}return true;});
      const fedBonus=p.charter.regions==='federal'?.15:-.25;const mand=c.mandate==='autonomy'?.25:c.mandate==='wages'?.15:c.mandate==='output'?-.1:0;const aiPen=c.ai==='sovereign'?-.1:0;
      c.loyalty=U.clamp(c.loyalty+fedBonus+mand+aiPen+(p.approval-50)*.01,0,100);
      if(c.founded)c.pop=+(c.pop*1.004+.002).toFixed(3);}
    // approval and political capital
    const I=p.ind;const tgt=50+(I.growth-50)*.25+(I.health-50)*.15+(I.housing-50)*.15+(I.trust-50)*.3+(I.equality-50)*.1+(I.security-50)*.08+(I.supply-50)*.12-Math.max(0,p.risks.unrest-55)*.25-Math.min(15,Math.max(0,-p.treasury)/80);
    p.approval=U.clamp(p.approval+(tgt-p.approval)*.22,3,97);
    p.capital=U.clamp(p.capital+3+(p.approval-50)/12,0,100);
    // blocs and nations drift toward what the Concord is doing
    for(const b in p.blocs){const B=BLOCS[b];let push=0;for(const id in p.policies){const Q=POLICIES[id];if(Q&&Q.bloc&&Q.bloc[b])push+=Q.bloc[b]*.05;}p.blocs[b]=U.clamp(p.blocs[b]*.99+push,-100,100);}
    for(const n of NATIONS){const N=p.nations[n.id];N.rel=U.clamp(N.rel*.995+(p.blocs[n.bloc]||0)*.01,-100,100);
      if(N.war>0){N.war--;N.stab=U.clamp(N.stab-2,0,100);p.extra.growth=(p.extra.growth||0)-.3;p.risksExtra.unrest=(p.risksExtra.unrest||0)+.4;if(N.war===0)this.news(s,`${n.name}: the conflict has burned itself out. Reconstruction estimates run to decades.`);}
      else N.stab=U.clamp(N.stab+(n.stab-N.stab)*.05,0,100);}
    this.recompute(s);
    // delayed consequences
    p.later=p.later.filter(L=>{if(p.months<L.due)return true;let good=null;
      if(L.needPolicy){good=L.needPolicy.some(id=>p.policies[id])||Object.keys(p.projects).length>0;this.applyFx(s,{fx:good?L.good:L.bad});}
      else this.applyFx(s,L);
      this.push(s,{kind:'later',title:L.title,text:L.needPolicy?(good?L.goodText:L.badText):L.text});this.news(s,L.title+'. '+(L.needPolicy?(good?L.goodText:L.badText):L.text));return false;});
    // elections for elected offices
    if(of==='chancellor'||of==='speaker'){p.nextElection--;if(p.nextElection<=0)this.election(s);}
    // the NPC government keeps governing when you don't
    if(!of||p.office==='delegate'||p.office==='boss'||p.office==='ceo'){if(Math.random()<.08){const ids=Object.keys(POLICIES).filter(id=>!POLICIES[id].era||this.eraIdx(s)>=POLICIES[id].era);const id=U.pick(Math.random,ids);if(p.policies[id]){if(Math.random()<.5){delete p.policies[id];this.news(s,`Concord Council repeals: ${POLICIES[id].name}.`);}}else{p.policies[id]=1;this.news(s,`Concord Council enacts: ${POLICIES[id].name}.`);}}}
    this.offers(s);this.campaign(s);this.crises(s);this.tabibTick(s);this.lifeTick(s);
    if(!silent&&!G.cine)UI.toast(`${this.monthName(s)}: approval ${Math.round(p.approval)}%, treasury ${this.gc(p.treasury)}.`);
  },
  monthName(s){const m=Math.floor(((s.earthYear-Math.floor(s.earthYear))*12)+1e-6);return ['January','February','March','April','May','June','July','August','September','October','November','December'][U.clamp(m,0,11)]+' '+Math.floor(s.earthYear);},
  gc(v){return (v<0?'−':'')+Math.abs(Math.round(v))+' Gc';},

  /* ── offices ── */
  offers(s){
    const p=s.pol,r=s.rep,f=s.flags;const st=Story.stage(s,'mq');const offer=(id,text,extra={})=>{if(p.offersSeen[id])return;p.offersSeen[id]=1;this.push(s,Object.assign({kind:'offer',office:id,title:`Offer: ${OFFICES[id].name}`,text},extra));UI.toast(`Command: you have been offered the post of ${OFFICES[id].name}. Press K.`,'lvl');};
    if(!p.office&&r.concord>=20&&st>=40)offer('delegate','The Luna constituency seat on the Concord Council is vacant. Commodore Rahman put your name forward. "You keep making decisions that matter," she says. "Might as well get a vote."');
    if(p.office==='delegate'&&p.monthsInOffice>=4&&p.approval>=42)offer('minister','The Chancellor needs a minister who has been past the heliopause. Pick a portfolio.',{portfolio:true});
    if((!p.office||p.office==='delegate')&&r.frontier>=35)offer('speaker','The Frontier Assembly votes to make you its Speaker. Ceres, Mars, Europa and Afterlight want someone who has actually been there.');
    if(!p.office&&r.oracle>=35&&(f.keel==='oracle'||f.quiet==='absorbed'||s.world.oracle>.5))offer('steward','The ORACLE Directorate invites you to become its Steward: the human signature on the machine that schedules Sol.');
    if(!p.office&&r.syndicate>=35)offer('boss','The families of the Syndicate would like you at the table. Nobody says the word "offer". Everybody understands it.');
    if(!p.office&&s.life&&s.life.company&&s.life.company.value>=2000000)offer('ceo','Your board votes you Chief Executive with the full powers of the chair. Lobbyists start calling within the hour.');
  },
  takeOffice(s,id,portfolio){const p=s.pol;p.office=id;p.portfolio=portfolio||null;p.monthsInOffice=0;if(id==='chancellor'||id==='speaker')p.nextElection=+p.charter.term;
    p.capital=Math.max(p.capital,40);this.news(s,`${G.state.player.name} takes office as ${OFFICES[id].name}${portfolio?' ('+PORTFOLIOS[portfolio].name+')':''}.`);p.history.push({y:s.earthYear,t:'Took office: '+OFFICES[id].name});UI.toast(`You are now ${OFFICES[id].name}.`,'lvl');AudioSys.sfx('level');Game.addXP('diplomacy',3000);},
  resign(s){const p=s.pol;if(!p.office)return;p.history.push({y:s.earthYear,t:'Left office: '+OFFICES[p.office].name});this.news(s,`${G.state.player.name} resigns as ${OFFICES[p.office].name}.`);p.office=null;p.portfolio=null;},
  standForChancellor(s){const p=s.pol;if(p.capital<30){UI.toast('You need 30 political capital to run.','bad');return;}p.capital-=30;
    const avg=PF_ORDER.reduce((a,f)=>a+p.fac[f],0)/6;const share=50+(p.approval-50)*.8+(avg-50)*.3+(Math.random()*10-5);
    if(share>50){this.takeOffice(s,'chancellor');this.push(s,{kind:'news',title:'Elected Chancellor',text:`You win the Council vote with ${share.toFixed(1)} percent. Noor has already cleared your calendar for the next four years.`});}
    else{this.push(s,{kind:'news',title:'The vote goes against you',text:`${share.toFixed(1)} percent. Close, and not close enough. You keep your ministry, and your enemies keep a list.`});}
    this.open('overview');},
  election(s){const p=s.pol;const avg=PF_ORDER.reduce((a,f)=>a+p.fac[f],0)/6;const share=50+(p.approval-50)*.8+(avg-50)*.3+(Math.random()*8-4)+(p.charter.press==='licensed'?4:0);
    if(share>50){p.electionsWon++;p.nextElection=+p.charter.term;this.news(s,`Election: ${G.state.player.name} re-elected with ${share.toFixed(1)}%.`);this.push(s,{kind:'news',title:'Re-elected',text:`${share.toFixed(1)} percent. Another term. The drawer of promises gets a new folder.`});}
    else{this.news(s,`Election: ${G.state.player.name} defeated with ${share.toFixed(1)}%.`);this.push(s,{kind:'news',title:'Defeated',text:`${share.toFixed(1)} percent. You hand over the passwords. Whether your successor finds the maintenance schedule depends on what you left in the second folder.`});p.history.push({y:s.earthYear,t:'Lost election'});p.office=p.office==='chancellor'?'delegate':null;p.portfolio=null;p.monthsInOffice=0;}},

  /* ── the campaign and crises ── */
  campaign(s){const p=s.pol;if(this.rank()<2||p.office==='boss'||p.office==='ceo')return;if(p.months-p.lastScene<2)return;if(p.inbox.some(i=>i.kind==='scene'&&!i.done))return;
    const sc=PSCENES.find(x=>!p.scenesDone[x.id]);if(!sc)return;p.lastScene=p.months;this.push(s,{kind:'scene',scene:sc.id,title:sc.title});UI.toast(`Command: ${PCHAPTERS[sc.ch].name} · ${sc.title}`,'lvl');},
  crises(s){const p=s.pol;for(const id in PCRISES){if(p.crisesDone[id]||p.inbox.some(i=>i.crisis===id))continue;const C=PCRISES[id];let ok=false;try{ok=C.when(s);}catch(e){}if(!ok)continue;
      if(this.rank()>=3&&p.office!=='boss'&&p.office!=='ceo'){this.push(s,{kind:'crisis',crisis:id,title:C.title});UI.toast(`Crisis: ${C.title}`,'bad');AudioSys.sfx('alarm');}
      else{p.crisesDone[id]=1;const ch=U.pick(Math.random,C.c);this.applyFx(s,ch);this.news(s,`${C.title}: ${ch.text}`);}
      break;}},
  choose(item,idx){const s=G.state,p=s.pol;
    if(item.kind==='scene'){const sc=PSCENES.find(x=>x.id===item.scene);const c=sc.c[idx];if(c.cost>0&&p.treasury<c.cost-200){UI.toast('The treasury cannot cover that.','bad');return;}if((c.cap||0)>p.capital){UI.toast('Not enough political capital.','bad');return;}
      this.applyFx(s,c);p.scenesDone[sc.id]=idx;item.done=true;item.result=c.after;if(c.later)p.later.push(Object.assign({due:p.months+c.later.m},c.later));
      if(c.people)for(const k in c.people)if(s.crew.includes(k)&&c.people[k]>=8)UI.toast(`${CREW[k]?CREW[k].name:k} approves.`,'lvl');
      this.news(s,`${sc.title}: ${c.t}.`);Game.addXP('diplomacy',600);}
    else if(item.kind==='crisis'){const C=PCRISES[item.crisis];const c=C.c[idx];this.applyFx(s,c);p.crisesDone[item.crisis]=1;item.done=true;item.result=c.text;this.news(s,`${C.title}: ${c.text}`);Game.addXP('diplomacy',1200);}
    else if(item.kind==='offer'){if(idx===0){if(item.portfolio)return;this.takeOffice(s,item.office);}item.done=true;item.result=idx===0?'Accepted.':'Declined.';}
    Game.autosave();this.open('inbox');},

  /* ── levers ── */
  canPolicy(id){const p=this.P();const Q=POLICIES[id];if(!p.office)return false;const o=p.office;
    if(o==='chancellor')return true;if(o==='minister')return !!(p.portfolio&&PORTFOLIOS[p.portfolio].cats.includes(Q.cat));
    if(o==='speaker')return ['Economy','Trade','Migration','Space','Energy','Society'].includes(Q.cat);if(o==='steward')return ['Science','Governance'].includes(Q.cat);return false;},
  togglePolicy(id){const s=G.state,p=s.pol;const Q=POLICIES[id];if(!this.canPolicy(id))return;if(p.capital<6){UI.toast('Not enough political capital (6).','bad');return;}
    if(Q.era&&this.eraIdx(s)<Q.era){UI.toast(`Not possible before the era of ${PERAS[Q.era].name}.`,'bad');return;}
    if(Q.req==='relic'&&!(s.inv.relic>0)&&!s.flags.gate_lmc){UI.toast('Needs Engineer relics to study.','bad');return;}if(Q.req==='choir'&&!s.flags.thalassi){UI.toast('Needs contact with the Thalassi first.','bad');return;}
    p.capital-=6;if(p.policies[id]){delete p.policies[id];this.news(s,`Repealed: ${Q.name}.`);}else{p.policies[id]=1;this.news(s,`Enacted: ${Q.name}.`);if(Q.bloc)for(const b in Q.bloc)p.blocs[b]=U.clamp(p.blocs[b]+Q.bloc[b],-100,100);}
    this.recompute(s);AudioSys.sfx('ui2');this.render();},
  voteShare(id,repeal){const p=this.P();const L=LAWS[id];let sum=0;L.votes.forEach((v,i)=>{const f=PF_ORDER[i];sum+=(repeal?-v:v)*(.4+p.fac[f]/100);});
    const bonus=(p.charter.leadership==='parliamentary'||p.charter.leadership==='council')?5:0;return U.clamp(50+sum*.5+(p.approval-50)*.3+bonus,2,98);},
  propose(id){const s=G.state,p=s.pol;const L=LAWS[id];const repeal=!!p.laws[id];const need=p.office==='delegate'?12:p.charter.leadership==='presidential'?8:10;
    if(p.capital<need){UI.toast(`You need ${need} political capital to bring a bill.`,'bad');return;}if(p.office==='delegate'&&p.months-(p.lastBill||-99)<3){UI.toast('Delegates may bring one bill a season.','bad');return;}
    if(p.charter.courts==='independent'&&id==='surveillance'&&!repeal&&Math.random()<.4){p.capital-=need;this.push(s,{kind:'news',title:'Struck down',text:'The Concord Court rules the surveillance act unconstitutional. The ruling runs to 212 pages. The dissent runs to four.'});this.render();return;}
    p.capital-=need;p.lastBill=p.months;const share=this.voteShare(id,repeal)+(Math.random()*8-4);
    if(share>50){if(repeal)delete p.laws[id];else p.laws[id]=1;L.votes.forEach((v,i)=>p.facAdj[PF_ORDER[i]]=(p.facAdj[PF_ORDER[i]]||0)+(repeal?-v:v)*.25);this.news(s,`Council ${repeal?'repeals':'passes'}: ${L.name} (${share.toFixed(0)}%).`);UI.toast(`Bill ${repeal?'repealed':'passed'} with ${share.toFixed(0)}%.`,'lvl');Game.addXP('diplomacy',800);}
    else{this.news(s,`Council rejects: ${L.name} (${share.toFixed(0)}%).`);UI.toast(`The bill fails: ${share.toFixed(0)}%.`,'bad');p.approval-=1;}
    this.recompute(s);this.render();},
  amend(k,v){const s=G.state,p=s.pol;if(p.office!=='chancellor')return;if(p.capital<25){UI.toast('A charter amendment needs 25 political capital.','bad');return;}if(p.approval<50){UI.toast('Amendments need at least 50% approval to be ratified.','bad');return;}
    p.capital-=25;p.charter[k]=v;this.news(s,`Charter amended: ${CHARTER[k].name} → ${CHARTER[k].opts[v]}.`);p.history.push({y:s.earthYear,t:`Amended the Charter: ${CHARTER[k].name}`});this.recompute(s);AudioSys.sfx('quest');this.render();},
  operate(op,nid){const s=G.state,p=s.pol;const O=OPERATIONS[op];const n=NATIONS.find(x=>x.id===nid);const N=p.nations[nid];if(!n)return;
    if(this.rank()<3&&p.office!=='boss'){UI.toast('Only a head of government can order that.','bad');return;}
    if(p.capital<O.capital){UI.toast(`Needs ${O.capital} political capital.`,'bad');return;}p.capital-=O.capital;p.treasury-=O.cost;
    const B=BLOCS[n.bloc];const likes=B.likes.includes(op),hates=B.dislikes.includes(op);
    const blocDelta=(likes?4:0)-(hates?6:0);p.blocs[n.bloc]=U.clamp(p.blocs[n.bloc]+blocDelta,-100,100);
    let msg='';
    if(op==='deescalate'){N.rel+=8;p.risksExtra.unrest=(p.risksExtra.unrest||0)-1;msg=`Talks with ${n.leader}. The temperature drops a degree.`;}
    if(op==='aid'){N.rel+=10;N.stab+=6;p.extra.trust=(p.extra.trust||0)+.5;msg=`Aid lands in ${n.capital}. ${n.leader} thanks the Concord in public, which costs them something.`;}
    if(op==='summit'){for(const x of NATIONS)if(x.bloc===n.bloc)p.nations[x.id].rel+=Math.random()<.8?5:-3;msg=`The ${B.name} summit at Shackleton ends with a photo nobody hates.`;}
    if(op==='sanction'){N.rel-=15;N.stab-=6;p.extra.growth=(p.extra.growth||0)-.5;msg=`Sanctions on ${n.name}. Their markets fall. So, a little, do yours.`;}
    if(op==='mobilise'){p.extra.security=(p.extra.security||0)+4;for(const x of NATIONS)if(x.bloc==='iron')p.nations[x.id].rel-=4;msg='Fleet readiness rises. So do eyebrows in the Iron Compact.';}
    if(op==='escalate'){N.war=12;N.rel-=40;p.extra.security=(p.extra.security||0)-2;p.risksExtra.unrest=(p.risksExtra.unrest||0)+8;p.risksExtra.gal=(p.risksExtra.gal||0)+3;p.govAdj.nat=(p.govAdj.nat||0)+4;msg=`Conflict with ${n.name}. Every month it continues, people die who did not choose it.`;this.push(s,{kind:'news',title:'War',text:msg+' Offer a ceasefire from the Earth tab when you can.'});}
    if(op==='ceasefire'){if(!N.war){msg='There is no war to end.';}else{const ok=Math.random()<.35+N.rel/-400+(12-N.war)/20;if(ok){N.war=0;N.rel+=10;msg=`${n.leader} accepts the ceasefire.`;}else msg=`${n.leader} rejects the ceasefire. The preparation costs are spent.`;}}
    if(op==='reconstruct'){N.stab+=10;N.rel+=12;msg=`Reconstruction teams arrive in ${n.name}. Half the money reaches the ground; that is considered good.`;}
    N.rel=U.clamp(N.rel,-100,100);N.stab=U.clamp(N.stab,0,100);this.news(s,msg);UI.toast(msg);this.recompute(s);this.render();},
  /* colonies */
  build(ck,b){const s=G.state,p=s.pol;const c=p.colonies[ck];const B=BLUEPRINTS[b];if(!this.controls(ck)){UI.toast('You do not govern that world.','bad');return;}
    if(p.treasury<B.cost[0]-150){UI.toast('Treasury too low.','bad');return;}if(c.stock[1]<B.cost[1]||c.stock[2]<B.cost[2]){UI.toast(`Needs ${B.cost[1]} metal and ${B.cost[2]} fuel in the colony stockpile.`,'bad');return;}
    p.treasury-=B.cost[0];c.stock[1]-=B.cost[1];c.stock[2]-=B.cost[2];c.queue.push({b,left:Math.max(1,Math.round(B.days/2))});UI.toast(`${B.name} under construction on ${this.colName(ck)}.`);AudioSys.sfx('ui2');this.render();},
  controls(ck){const p=this.P();const c=p.colonies[ck];if(!c)return false;if(c.founded&&c.owner==='player')return true;const o=p.office;
    if(o==='chancellor')return c.owner==='concord'||(p.charter.regions==='unitary'&&c.owner==='frontier');if(o==='speaker')return c.owner==='frontier';if(o==='steward')return c.owner==='oracle'||c.ai==='sovereign';if(o==='minister')return p.portfolio==='frontier'&&c.owner==='concord';return false;},
  colName(ck){const c=SOL_COLONIES[ck];if(c)return c.name;const site=Cosmos.site(ck);return site?site.name:ck;},
  found(siteId,priv){const s=G.state,p=s.pol;const site=Cosmos.site(siteId);if(!site||p.colonies[siteId])return;
    if(priv){if(s.credits<250000){UI.toast('A private colony charter costs 250,000 credits.','bad');return;}Game.addCredits(-250000);}
    else{if(!(p.office==='chancellor'||p.office==='speaker')){UI.toast('Only the Chancellor or the Speaker can charter a public colony.','bad');return;}if(p.treasury<60-150){UI.toast('Treasury too low.','bad');return;}p.treasury-=60;}
    p.colonies[siteId]={owner:priv?'player':(p.office==='speaker'?'frontier':'concord'),gov:priv?s.player.name:U.pick(Math.random,GOVERNORS),pop:.004,stock:[30,40,20],prod:[1,1,1],use:[.5,0,.4],built:[],queue:[{b:'dome',left:2}],ai:'assist',mandate:'autonomy',loyalty:80,level:1,founded:true};
    this.news(s,`A new colony is chartered on ${site.name}. Its first hundred settlers arrive within the year.`);p.history.push({y:s.earthYear,t:'Founded a colony: '+site.name});Game.addXP('diplomacy',2500);UI.toast(`Colony chartered on ${site.name}. It will grow each month; visit it to see.`,'lvl');this.render();},
  /* World Ledger */
  startProject(id){const s=G.state,p=s.pol;const L=LEDGER[id];if(this.rank()<3||p.office==='boss'){UI.toast('Only a head of government can commit the treasury. You can still donate.','bad');return;}
    if(L.req){if(L.req.tech&&p.ind.tech<L.req.tech){UI.toast(`Needs Science ${L.req.tech}.`,'bad');return;}if(L.req.flag&&!s.flags[L.req.flag]){UI.toast('Not yet possible.','bad');return;}}
    if(p.projects[id]!=null){delete p.projects[id];UI.toast('Project paused.');this.render();return;}p.projects[id]=p.projects[id]||0;this.news(s,`The Concord commits to the World Ledger: ${L.name}.`);AudioSys.sfx('quest');this.render();},
  donate(id,cr){const s=G.state,p=s.pol;if(s.credits<cr){UI.toast('Not enough credits.','bad');return;}Game.addCredits(-cr);const L=LEDGER[id];const months=cr/100000/(L.cost/L.months);p.projects[id]=(p.projects[id]||0)+months;p.donated+=cr;Game.addRep('concord',Math.round(cr/50000));this.news(s,`A private donor gives ${U.fmt(cr)} credits to ${L.name}.`);UI.toast(`Donated to ${L.name}.`,'lvl');this.render();},

  /* ── life and dynasty ── */
  age(s){return s.life.age0+(s.shipYears||0);},
  earthAge(born,s){return s.earthYear-born;},
  lifeTick(s){const L=s.life;if(!L)return;
    if(L.parents.alive&&s.earthYear-L.parents.born>94+((L.parents.born*7)%9)){L.parents.alive=false;this.push(s,{kind:'life',title:'News from home',text:'A message has been waiting in the relay queue for months. Your mother passed away in her sleep, in the house you grew up in. Time moves faster on Earth than it does on your ship. She left you a voice note. It is eleven seconds long and you listen to it nine times.'});}
    for(const c of L.children){const a=this.childAge(c,s);if(a>=18&&!c.adult){c.adult=true;this.push(s,{kind:'life',title:`${c.name} comes of age`,text:`${c.name} is eighteen. They have your stubbornness and somebody else's patience. They could inherit everything, if you ever decide to stop.`});}}
    if(L.company){const C=L.company;const I=INDUSTRIES[C.ind];const g=(s.pol.ind.growth-50)/50*.004;const swing=(Math.random()-.5)*I.risk*.06;C.value=U.clamp(Math.round(C.value*(1+.005+g+swing)),10000,4e9);C.revenue=Math.round(C.value*.008);s.credits=Math.round(s.credits+C.revenue*C.share);}
    for(const k in L.props){const P=PROPERTIES[k];if(P.rent)s.credits=Math.round(s.credits+P.rent);}
    if(L.practice.pray)L.practice.streak++;},
  childAge(c,s){return c.shipBorn!=null?(s.shipYears||0)-c.shipBorn:s.earthYear-c.born;},
  propose2(id){const s=G.state,L=s.life;const lo=s.loyalty[id]||50;if(lo<70){UI.toast(`${CREW[id].name} isn't there yet. Loyalty ${Math.round(lo)} of 70.`,'bad');return;}L.partner=id;this.push(s,{kind:'life',title:'Something like a life',text:`${CREW[id].name} says yes before you finish the question, then pretends to reconsider for effect.`});AudioSys.sfx('level');this.render();},
  marry(style){const s=G.state,L=s.life;if(!L.partner)return;L.spouse=L.partner;L.weddingStyle=style;const nm=CREW[L.spouse].name;const txt={civil:`A civil ceremony in the Shackleton registry. Wick cries and denies it.`,nikah:`A nikah on the observation deck, with two witnesses, a modest mahr and a very nervous imam patched in from Karachi Orbital. The crew learns the word "mubarak" and uses it for a week.`,church:`A church wedding at the chapel on Luna, where the bells are recordings from Earth and nobody minds.`,temple:`A temple ceremony with the fire lit in a pressure-rated brazier that Mara certified personally.`,gurdwara:`An Anand Karaj at the Ceres gurdwara. The langar afterwards feeds half of Occator.`,synagogue:`A chuppah on the hangar deck. The glass is broken, the ship is not.`,small:`No ceremony. Just the two of you and the stars, which is its own kind of vow.`}[style]||'';
    this.push(s,{kind:'life',title:`Married to ${nm}`,text:txt});s.loyalty[L.spouse]=100;Game.addXP('diplomacy',1500);AudioSys.sfx('level');this.render();},
  haveChild(){const s=G.state,L=s.life;if(!L.spouse)return;if(L.children.length&&(s.shipYears-(L.children[L.children.length-1].shipBorn||0))<.8){UI.toast('Give it a little time.','bad');return;}
    const r=U.rng(Date.now()>>>0);const nm=U.pick(r,NAMES.first);const c={name:nm,shipBorn:(s.shipYears||0)+.75,born:s.earthYear+.75};L.children.push(c);this.push(s,{kind:'life',title:'A child is coming',text:`${CREW[L.spouse].name} tells you on the bridge, in front of everybody, because they know you can't make a fuss there. You will name them ${nm}.`});this.render();},
  succeed(){const s=G.state,L=s.life;const heir=L.children.find(c=>c.adult);if(!heir){UI.toast('You need an adult heir.','bad');return;}
    const old=s.player.name;L.ancestors.push({name:old,age:Math.round(this.age(s)),year:Math.floor(s.earthYear),legacy:this.legacy(s).name});
    s.player.name=heir.name+' '+(old.split(' ').slice(1).join(' ')||'');L.age0=18-(s.shipYears||0);L.generation++;L.children=L.children.filter(c=>c!==heir);L.partner=null;L.spouse=null;
    for(const k in s.player.skills)s.player.skills[k]=Math.floor(s.player.skills[k]*.6);s.player.hp=Game.maxHp();
    this.news(s,`${old} hands the ${s.ship.name} to ${heir.name}. Generation ${L.generation} begins.`);this.push(s,{kind:'life',title:'The torch passes',text:`${old} stays on Earth, in the house with too many bedrooms, and sends advice nobody asked for on every relay. You are ${s.player.name} now. The ship, the debts, the enemies and the crew are yours.`});
    UI.toast(`You are now ${s.player.name}.`,'lvl');this.render();},
  buyProp(k){const s=G.state,L=s.life;const P=PROPERTIES[k];if(L.props[k])return;if(P.req&&!s.flags[P.req]){UI.toast('Not reachable yet.','bad');return;}if(s.credits<P.cost){UI.toast('Not enough credits.','bad');return;}Game.addCredits(-P.cost);L.props[k]=s.earthYear;UI.toast(`Bought: ${P.name}.`,'lvl');AudioSys.sfx('coin');this.render();},
  sellProp(k){const s=G.state,L=s.life;if(!L.props[k])return;Game.addCredits(Math.round(PROPERTIES[k].cost*.85));delete L.props[k];this.render();},
  foundCompany(ind,name){const s=G.state,L=s.life;if(L.company)return;if(s.credits<100000){UI.toast('Founding a company needs 100,000 credits.','bad');return;}Game.addCredits(-100000);L.company={name:name||'New Venture',ind,value:150000,revenue:0,share:1};
    this.news(s,`${L.company.name}, a new ${INDUSTRIES[ind].name.toLowerCase()} company, registers in Geneva.`);UI.toast('Company founded.','lvl');this.render();},
  invest(){const s=G.state,C=s.life.company;if(!C||s.credits<50000)return;Game.addCredits(-50000);C.value+=65000;this.render();},
  sellCompany(){const s=G.state,L=s.life;if(!L.company)return;Game.addCredits(Math.round(L.company.value*L.company.share));this.news(s,`${L.company.name} is sold.`);L.company=null;this.render();},
  /* qibla in space: the 2006 ISS guidance, extended: face Earth, then Makkah if you can see it */
  qibla(s){const sys=Cosmos.get(s.loc.system);if(!sys||s.loc.system==='sol')return s.loc.system==='sol'&&s.loc.site==='earth'?'Toward Makkah, as on any day on Earth.':'Toward Earth. From here it is the pale blue point a little above the horizon.';
    return `Toward Sol, ${U.fmt(Math.round(Cosmos.dist?Cosmos.dist('sol',s.loc.system):0))} light-years away. The ship\'s compass marks it.`;},

  legacy(s){const p=s.pol;for(const L of LEGACIES){try{if(L.test(p,s))return L;}catch(e){}}return LEGACIES[LEGACIES.length-1];},

  /* ── The Tabib ── */
  tabibTick(s){const p=s.pol,T=p.tabib;const trig=!!s.flags.ended||s.earthYear>=2205||(this.rank()>=3&&Object.values(p.risks).some(v=>v>=85));
    if(T.stage===0&&trig&&!Story.done(s,'tabib')&&!s.quests.tabib){T.stage=1;T.lastNote=p.months;Story.start(s,'tabib');s.flags.gate_echo=1;
      this.push(s,{kind:'tabib',title:'04:00 · Consultation note',text:TABIB.couplets[0]+'\n\n'+this.tabibNote(s,0)});this.news(s,'Every receiver in Sol logs the same message at exactly 04:00 ship time. Nobody can say where it came from. It is signed with a word that means "physician".');}
    else if(T.stage===1&&p.months-T.lastNote>=6&&T.notes<TABIB.notes.length-1){T.notes++;T.lastNote=p.months;this.push(s,{kind:'tabib',title:'04:00 · Consultation note',text:TABIB.couplets[T.notes%TABIB.couplets.length]+'\n\n'+this.tabibNote(s,T.notes)});}},
  tabibNote(s,i){const n=TABIB.notes[Math.min(i,TABIB.notes.length-1)];return `${n.h.toUpperCase()}: ${n.t}\nPROGNOSIS: ${this.prognosis(s)}.`;},
  prognosis(s){const r=s.pol.risks;const worst=Math.max(...Object.values(r));const avg=Object.values(r).reduce((a,b)=>a+b,0)/5;
    return worst>=80?'grave':avg>=50?'poor':avg>=35?'guarded':'good';},
  treated(s){const r=s.pol.risks;return Object.values(r).every(v=>v<40)||Object.keys(s.pol.ledgerDone).length>=3;},

  tabibEnd(key){const s=G.state;if(s.flags.tabib)return;s.flags.tabib=key;Story.setStage(s,'tabib',50);const p=this.P();const L=this.legacy(s);
    const E={discharged:{name:'Discharged',text:'The Tabib closes its file on humanity and puts the pen down. Somewhere in the Echo, a door you did not know was open closes gently. Every year afterwards, on the anniversary, at exactly 04:00, receivers across Sol log one couplet: "Your markers held. I checked. / I always check; I never once neglect."'},
      ama:{name:'Against Medical Advice',text:'You killed the physician of worlds. The eight rooms go dark one by one; seven universes lose their doctor, and none of them will ever know why. Sol keeps its diseases and its freedom. Nobody will triage you now. Nobody will save you either.'},
      resident:{name:'The Resident',text:'You take the coat. The crew watch you go through the eighth door and it closes behind you. Fifty years later a young civilisation on the far side of the Echo receives its first consultation note at 04:00. It is written in couplets, in a hand your crew would recognise.'}}[key];
    const slides=[['The Tabib',E.text],['Sol',`${L.name}. ${this.govType(p)}, approval ${Math.round(p.approval)} percent, ${Object.keys(p.ledgerDone).length} works of the World Ledger completed. Prognosis at the end of the consultation: ${this.prognosis(s)}.`],
      ['The eight rooms',key==='ama'?'Archaeologists from four universes will one day argue about who the physician was. The only record is a chart with your species\' name on it, and one line in the Plan section, crossed out.':key==='resident'?'The eighth room is lit now. Its first patient is a civilisation of glass on a world with two suns. You make your rounds before its dawn.':'Seven rooms full, one empty. The Tabib leaves the eighth room\'s light on, which your crew agree is either a threat or a compliment.'],
      ['Your crew',s.crew.length?`${s.crew.map(c=>CREW[c].name).join(', ')}. ${key==='resident'?'They kept the ship. They keep a chair empty on the bridge.':'Wick asks whether "discharged" means what he thinks it means. Ilyas says yes. Wick orders drinks for everyone.'}`:'You faced it alone.'],
      [s.player.name,`Earth year ${Math.floor(s.earthYear)}. ${key==='resident'?'You are the physician of worlds now. The game continues, but the universe will never be quite the same size again.':'The universe is still out there. The game continues.'}`]];
    const el=U.el('div',{class:'layer interactive',id:'ending'});el.style.zIndex=35;
    el.innerHTML=`<div class="in"><div class="lbl" style="color:#8fe8ff">The Physician of Worlds</div><h2>${U.esc(E.name)}</h2>${slides.map(x=>`<div class="slide"><b>${U.esc(x[0])}</b>${U.esc(x[1])}</div>`).join('')}<div class="row"><button class="btn primary" id="cont">Continue</button></div></div>`;
    UI.root.appendChild(el);Input.unlock();Input.uiOpen=true;G.paused=true;el.querySelector('#cont').onclick=()=>{el.remove();Input.uiOpen=false;G.paused=false;};
    this.news(s,{discharged:'The Tabib discharges humanity. Receivers across Sol log a single word at 04:00: DISCHARGED.',ama:'The Theatre in the Echo has gone dark. Whatever made its rounds there will not make them again.',resident:G.state.player.name+' walks into the eighth room of the Theatre and does not come back.'}[key]);
    Game.addXP('combat',key==='ama'?20000:0);Game.addXP('diplomacy',key!=='ama'?20000:4000);Surface.boss=null;UI.bossBar&&UI.bossBar(null);AudioSys.sfx('level');Game.autosave();},

  /* ═════════════════════════════ UI ═════════════════════════════ */
  open(tab){const s=G.state;if(!s||G.mode==='title')return;this.init(s);this.recompute(s);const p=s.pol;
    const o=this.office();const tabsAll=[['overview','Overview'],['inbox','Inbox'],['laws','Laws'],['policies','Policies'],['charter','Charter'],['earth','Earth & blocs'],['colonies','Colonies'],['ledger','World Ledger'],['life','Life']];
    const allowed=o?o.tabs:['overview','inbox','earth','colonies','ledger','life'];const tabs=tabsAll.filter(t=>allowed.includes(t[0]));
    this.tab=tabs.find(t=>t[0]===tab)?tab:'overview';
    const m=UI.modal('command','Command'+(o?' · '+o.name:''),'',{tabs,onTab:(t,b)=>{this.tab=t;this.draw(b);},wide:true});
    m.el.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x.dataset.tab===this.tab));this.body=m.body;this.draw(m.body);p.seen=p.inbox.length;},
  render(){if(this.body&&this.body.isConnected)this.draw(this.body);},
  bar(v,col,max=100){return `<span class="pbar"><i style="width:${U.clamp(v/max*100,0,100)}%;background:${col||'var(--signal)'}"></i></span>`;},
  fxText(o){if(!o)return '';const out=[];if(o.fx)for(const k in o.fx)if(IND[k])out.push(`${IND[k].name} ${o.fx[k]>0?'+':''}${o.fx[k]}`);if(o.risk)for(const k in o.risk)out.push(`${RISKS[k].name} risk ${o.risk[k]>0?'+':''}${o.risk[k]}`);return out.join(' · ');},
  draw(b){const s=G.state,p=s.pol;const t=this.tab;b.innerHTML='';
    if(t==='overview')this.drawOverview(b);else if(t==='inbox')this.drawInbox(b);else if(t==='laws')this.drawLaws(b);else if(t==='policies')this.drawPolicies(b);
    else if(t==='charter')this.drawCharter(b);else if(t==='earth')this.drawEarth(b);else if(t==='colonies')this.drawColonies(b);else if(t==='ledger')this.drawLedger(b);else if(t==='life')this.drawLife(b);},
  drawOverview(b){const s=G.state,p=s.pol,o=this.office();const era=this.era(s);const unread=p.inbox.filter(i=>!i.done&&i.kind!=='news').length;
    const risksHtml=Object.keys(RISKS).map(k=>`<div class="kvrow" title="${RISKS[k].desc}"><span>${RISKS[k].name}</span>${this.bar(p.risks[k],p.risks[k]>=72?'var(--danger)':p.risks[k]>=50?'#e9bf70':'#75cbb3')}<b class="mono">${p.risks[k]}</b></div>`).join('');
    const indHtml=Object.keys(IND).map(k=>`<div class="kvrow" title="${IND[k].desc}"><span>${IND[k].name}</span>${this.bar(p.ind[k],p.ind[k]<35?'var(--danger)':'#81afd6')}<b class="mono">${p.ind[k]}</b></div>`).join('');
    const facHtml=PF_ORDER.map(f=>`<div class="kvrow" title="${PFACTIONS[f].want}"><span>${PFACTIONS[f].name}</span>${this.bar(p.fac[f],PFACTIONS[f].color)}<b class="mono">${p.fac[f]}</b></div>`).join('');
    const govHtml=['dem','free','corp','nat'].map(k=>`<div class="kvrow"><span>${{dem:'Democracy',free:'Freedom',corp:'Corporate power',nat:'Nationalism'}[k]}</span>${this.bar(p.gov[k],'#b0b7c8')}<b class="mono">${p.gov[k]}</b></div>`).join('');
    const L=this.legacy(s);
    b.innerHTML=`<div class="pol-top"><div><div class="lbl">${this.monthName(s)} · ${era.name}</div><h3 class="pol-h">${o?o.name:'Private citizen'}${p.portfolio?' · '+PORTFOLIOS[p.portfolio].name:''}</h3><p class="note">${o?o.desc:'You hold no office. The Concord governs without you, for now. Reputation opens doors: the Council (Concord), the Frontier Assembly, the ORACLE Directorate, the Syndicate, or your own company.'}</p></div>
      <div class="pol-stats"><div><span class="lbl">Approval</span><b>${Math.round(p.approval)}%</b></div><div><span class="lbl">Treasury</span><b>${this.gc(p.treasury)}</b><small class="note">${p.lastBudget?`+${p.lastBudget.revenue} / −${p.lastBudget.spend} a month`:''}</small></div><div><span class="lbl">Capital</span><b>${Math.round(p.capital)}</b></div><div><span class="lbl">Government</span><b style="font-size:15px">${this.govType(p)}</b></div>${(p.office==='chancellor'||p.office==='speaker')?`<div><span class="lbl">Election in</span><b>${p.nextElection} mo</b></div>`:''}</div></div>
      <div class="row" style="margin:10px 0 14px;gap:8px;flex-wrap:wrap"><button class="btn primary" id="pm">Advance one month</button>${unread?`<button class="btn" id="pin">Inbox · ${unread} waiting</button>`:''}${p.office==='minister'&&p.monthsInOffice>=6?'<button class="btn" id="pstand">Stand for Chancellor (30 capital)</button>':''}${p.office?'<button class="btn danger small" id="pres">Resign</button>':''}</div>
      <div class="grid3"><div class="card"><h4>The state of Sol</h4>${indHtml}</div><div class="card"><h4>Risks</h4>${risksHtml}<p class="note" style="margin-top:8px">Past 72, a risk starts causing disasters. The Machine and Galactic risks also decide how some things beyond Sol see you.</p><h4 style="margin-top:14px">Government</h4>${govHtml}</div>
      <div class="card"><h4>Factions</h4>${facHtml}<h4 style="margin-top:14px">How history would judge you today</h4><p><b>${L.name}</b> <span class="pill">${L.grade}</span></p><p class="note">${L.text}</p></div></div>`;
    b.querySelector('#pm').onclick=()=>{this.advanceMonth();this.render();};
    const pin=b.querySelector('#pin');if(pin)pin.onclick=()=>this.open('inbox');const pst=b.querySelector('#pstand');if(pst)pst.onclick=()=>this.standForChancellor(s);const pr=b.querySelector('#pres');if(pr)pr.onclick=()=>{this.resign(s);this.open('overview');};},
  drawInbox(b){const s=G.state,p=s.pol;const open=p.inbox.filter(i=>!i.done&&(i.kind==='scene'||i.kind==='crisis'||i.kind==='offer'));const rest=p.inbox.filter(i=>!open.includes(i)).slice(0,16);
    let html='';
    if(!open.length)html+=`<p class="note">Nothing needs a decision right now. ${this.rank()>=2?'New matters arrive every couple of months.':'Hold an office to receive the business of government.'}</p>`;
    for(const it of open){
      if(it.kind==='scene'){const sc=PSCENES.find(x=>x.id===it.scene);const who=CREW[sc.who]?CREW[sc.who].name:sc.who;
        html+=`<div class="card pol-scene"><div class="lbl">${PCHAPTERS[sc.ch].name} · ${sc.place}</div><h3 class="pol-h">${sc.title}</h3><p>${sc.body}</p><p class="note">With ${who}.</p><div class="pol-choices">${sc.c.map((c,i)=>`<button class="pol-choice" data-it="${it.id}" data-c="${i}"><b>${c.t}</b><span>${c.d}</span><small class="mono">${c.cost?`${c.cost>0?'−':'+'}${Math.abs(c.cost)} Gc · `:''}${c.cap?`${c.cap>0?'−':'+'}${Math.abs(c.cap)} capital · `:''}${this.fxText(c)}</small></button>`).join('')}</div></div>`;}
      else if(it.kind==='crisis'){const C=PCRISES[it.crisis];html+=`<div class="card pol-scene crisis"><div class="lbl" style="color:var(--danger)">Crisis</div><h3 class="pol-h">${C.title}</h3><p><b>${C.lede}</b></p><p>${C.body}</p><div class="pol-choices">${C.c.map((c,i)=>`<button class="pol-choice" data-it="${it.id}" data-c="${i}"><b>${c.t}</b><small class="mono">${this.fxText(c)}</small></button>`).join('')}</div></div>`;}
      else if(it.kind==='offer'){html+=`<div class="card pol-scene"><div class="lbl">Offer</div><h3 class="pol-h">${OFFICES[it.office].name}</h3><p>${it.text}</p><p class="note">${OFFICES[it.office].desc}</p>
        ${it.portfolio?`<div class="row" style="flex-wrap:wrap;gap:6px">${Object.entries(PORTFOLIOS).map(([k,v])=>`<button class="btn small" data-port="${k}" data-it="${it.id}">${v.name}</button>`).join('')}<button class="btn small" data-it="${it.id}" data-c="1">Decline</button></div>`:`<div class="row"><button class="btn primary small" data-it="${it.id}" data-c="0">Accept</button><button class="btn small" data-it="${it.id}" data-c="1">Decline</button></div>`}</div>`;}}
    html+=`<h4 class="lbl" style="margin:16px 0 8px">Recent</h4><div class="list">${rest.map(i=>`<div class="li" style="display:block"><b>${U.esc(i.title||'')}</b> <span class="note mono">${Math.floor(i.at)}</span><div class="note" style="white-space:pre-line">${U.esc(i.result||i.text||'')}</div></div>`).join('')||'<p class="note">Nothing yet.</p>'}</div>`;
    b.innerHTML=html;
    b.querySelectorAll('[data-c]').forEach(x=>x.onclick=()=>{const it=p.inbox.find(i=>i.id===x.dataset.it);if(it)this.choose(it,+x.dataset.c);});
    b.querySelectorAll('[data-port]').forEach(x=>x.onclick=()=>{const it=p.inbox.find(i=>i.id===x.dataset.it);if(!it)return;it.done=true;it.result='Accepted: '+PORTFOLIOS[x.dataset.port].name;this.takeOffice(s,'minister',x.dataset.port);this.open('overview');});},
  drawLaws(b){const s=G.state,p=s.pol;const cats=[...new Set(Object.values(LAWS).map(l=>l.cat))];
    b.innerHTML=`<p class="note">Bills pass on a Council vote. Each faction weighs a bill by its interests; your approval and the Charter tilt the room. Bringing a bill costs political capital${p.office==='delegate'?'; as a delegate you may bring one a season':''}.</p><div class="list">${Object.entries(LAWS).map(([id,L])=>{const on=!!p.laws[id];const sh=this.voteShare(id,on);
      return `<div class="li"><div style="flex:1"><b>${L.name}</b> <span class="pill">${L.cat}</span>${on?' <span class="pill" style="color:var(--ok)">In force</span>':''}<div class="note">${L.desc}</div><div class="note mono">${L.cost>0?'−':'+'}${Math.abs(L.cost)} Gc/mo · ${this.fxText(L)}</div>
      <div class="pol-votes">${L.votes.map((v,i)=>`<span title="${PFACTIONS[PF_ORDER[i]].name}" style="color:${v>0?'var(--ok)':v<0?'var(--danger)':'var(--dim)'}">${PFACTIONS[PF_ORDER[i]].name.split(' ')[0]} ${v>0?'+':''}${on?-v:v}</span>`).join('')}</div></div>
      <div style="text-align:right"><div class="mono ${sh>50?'ok':'bad'}">${sh.toFixed(0)}% ${on?'to repeal':'forecast'}</div><button class="btn small" data-law="${id}">${on?'Repeal':'Propose'}</button></div></div>`;}).join('')}</div>`;
    b.querySelectorAll('[data-law]').forEach(x=>x.onclick=()=>this.propose(x.dataset.law));},
  drawPolicies(b){const s=G.state,p=s.pol;const ei=this.eraIdx(s);
    b.innerHTML=`<p class="note">Policies take effect at once and cost (or raise) money every month. Enacting or repealing one costs 6 political capital. ${p.office==='minister'?`Your portfolio covers: ${PORTFOLIOS[p.portfolio].cats.join(', ')}.`:''}</p>`+POLICY_CATS.map(cat=>`<h4 class="lbl" style="margin:14px 0 6px">${cat}</h4><div class="grid2">${Object.entries(POLICIES).filter(([,Q])=>Q.cat===cat).map(([id,Q])=>{const on=!!p.policies[id];const can=this.canPolicy(id);const locked=Q.era&&ei<Q.era;
      return `<div class="card pol-pol ${on?'on':''}"><div class="row" style="justify-content:space-between"><b>${Q.name}</b>${on?'<span class="pill" style="color:var(--ok)">Active</span>':''}</div><div class="note">${Q.desc}</div><div class="note mono">${Q.cost>0?'−':'+'}${Math.abs(Q.cost)} Gc/mo${this.fxText(Q)?' · '+this.fxText(Q):''}</div>${locked?`<div class="note">Available from: ${PERAS[Q.era].name}</div>`:can?`<button class="btn small" data-pol="${id}" style="margin-top:6px">${on?'Repeal':'Enact'}</button>`:''}</div>`;}).join('')}</div>`).join('');
    b.querySelectorAll('[data-pol]').forEach(x=>x.onclick=()=>this.togglePolicy(x.dataset.pol));},
  drawCharter(b){const s=G.state,p=s.pol;
    b.innerHTML=`<p class="note">The Charter of 2104 held Sol together after the Solar Fracture. Amending an article costs 25 political capital and needs 50% approval to ratify.</p><div class="grid2">${Object.entries(CHARTER).map(([k,A])=>`<div class="card"><h4>${A.name}</h4><p class="note">${A.desc}</p><div class="row" style="flex-wrap:wrap;gap:6px">${Object.entries(A.opts).map(([v,lab])=>`<button class="btn small ${String(p.charter[k])===String(v)?'primary':''}" data-ch="${k}" data-v="${v}">${lab}</button>`).join('')}</div></div>`).join('')}</div>`;
    b.querySelectorAll('[data-ch]').forEach(x=>x.onclick=()=>{if(String(p.charter[x.dataset.ch])===x.dataset.v)return;this.amend(x.dataset.ch,x.dataset.v);});},
  drawEarth(b){const s=G.state,p=s.pol;const sel=this.nation||'usa';const n=NATIONS.find(x=>x.id===sel);const N=p.nations[sel];
    const blocHtml=Object.entries(BLOCS).map(([k,B])=>`<div class="kvrow" title="${B.ethos}"><span style="color:${B.color}">${B.name}</span>${this.bar(p.blocs[k]+100,B.color,200)}<b class="mono">${Math.round(p.blocs[k])}</b></div>`).join('');
    b.innerHTML=`<div class="grid2"><div><h4 class="lbl" style="margin-bottom:8px">Blocs</h4>${blocHtml}<h4 class="lbl" style="margin:14px 0 8px">Nations</h4><div class="list pol-nations">${NATIONS.map(x=>{const X=p.nations[x.id];return `<button class="li ${x.id===sel?'sel':''}" data-n="${x.id}"><span><b>${x.name}</b> <span class="note">${x.leader}</span></span><span class="mono ${X.rel>=0?'ok':'bad'}">${X.war?'⚔ ':''}${Math.round(X.rel)}</span></button>`;}).join('')}</div></div>
      <div class="card"><h3 class="pol-h">${n.name}</h3><p class="note">${n.capital} · ${n.system} · ${U.fmt(n.pop)} million · <span style="color:${BLOCS[n.bloc].color}">${BLOCS[n.bloc].name}</span></p><p>${n.note}</p><p class="note">Led by ${n.leader}. Stability ${Math.round(N.stab)}. Relations ${Math.round(N.rel)}.${N.war?` <b style="color:var(--danger)">At war: ${N.war} months of fighting projected.</b>`:''}</p>
      <p class="note">${BLOCS[n.bloc].ethos}</p><h4 class="lbl" style="margin:12px 0 6px">Operations</h4><div class="list">${Object.entries(OPERATIONS).map(([k,O])=>`<div class="li"><div><b>${O.name}</b><div class="note">${O.desc}</div><div class="note mono">${O.cost} Gc · ${O.capital} capital${BLOCS[n.bloc].likes.includes(k)?' · the bloc approves':''}${BLOCS[n.bloc].dislikes.includes(k)?' · the bloc will resent it':''}</div></div><button class="btn small ${k==='escalate'?'danger':''}" data-op="${k}">Order</button></div>`).join('')}</div></div></div>`;
    b.querySelectorAll('[data-n]').forEach(x=>x.onclick=()=>{this.nation=x.dataset.n;this.render();});b.querySelectorAll('[data-op]').forEach(x=>x.onclick=()=>this.operate(x.dataset.op,sel));},
  drawColonies(b){const s=G.state,p=s.pol;const cards=Object.entries(p.colonies).filter(([k])=>!SOL_COLONIES[k]||!SOL_COLONIES[k].req||s.flags[SOL_COLONIES[k].req]).map(([k,c])=>{const mine=this.controls(k);
      return `<div class="card"><div class="row" style="justify-content:space-between"><h4>${this.colName(k)}</h4><span class="pill">${{concord:'Concord',frontier:'Frontier',oracle:'ORACLE',player:'Your charter'}[c.owner]||c.owner}</span></div>
      <p class="note">Governor ${c.gov} · ${c.pop>=1?U.fmt(Math.round(c.pop))+' million':Math.round(c.pop*1e6).toLocaleString()+' people'} · loyalty ${Math.round(c.loyalty)}${c.founded?' · level '+c.level:''}</p>
      <div class="note mono">Food ${Math.round(c.stock[0])} (${(c.prod[0]-c.use[0])>=0?'+':''}${(c.prod[0]-c.use[0]).toFixed(1)}) · Metal ${Math.round(c.stock[1])} (+${(c.prod[1]-c.use[1]).toFixed(1)}) · Fuel ${Math.round(c.stock[2])} (${(c.prod[2]-c.use[2])>=0?'+':''}${(c.prod[2]-c.use[2]).toFixed(1)})</div>
      <div class="note">Built: ${c.built.map(x=>BLUEPRINTS[x].name).join(', ')||'nothing yet'}${c.queue.length?' · Building: '+c.queue.map(q=>BLUEPRINTS[q.b].name+' ('+q.left+' mo)').join(', '):''}</div>
      ${mine?`<div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><label class="note">Administration <select data-ai="${k}">${Object.entries(AI_MODES).map(([m,M])=>`<option value="${m}" ${c.ai===m?'selected':''}>${M.name}</option>`).join('')}</select></label><label class="note">Mandate <select data-md="${k}">${Object.entries(MANDATES).map(([m,M])=>`<option value="${m}" ${c.mandate===m?'selected':''}>${M}</option>`).join('')}</select></label></div>
        <div class="row" style="gap:4px;margin-top:8px;flex-wrap:wrap">${Object.entries(BLUEPRINTS).map(([bk,B])=>`<button class="btn small" data-b="${bk}" data-k="${k}" title="${B.desc}">${B.name} <span class="mono">${B.cost[0]}Gc</span></button>`).join('')}</div>`:''}</div>`;}).join('');
    const cands=Object.keys(s.visited||{}).flatMap(sys=>{const S=Cosmos.get(sys);return S?S.bodies.filter(bd=>bd.site).map(bd=>bd.site):[];}).filter(id=>!p.colonies[id]&&!['throat','anchorage','theatre','__bridge'].includes(id)).slice(0,24);
    b.innerHTML=`<p class="note">Colonies produce food, metal and fuel, build from their own stockpiles and grow. Sovereign machine administration is efficient and raises the Machine risk; autonomy mandates keep colonies loyal.</p><div class="grid2">${cards}</div>
      <h4 class="lbl" style="margin:16px 0 8px">Charter a new colony</h4><p class="note">Any world you have visited. A public charter (Chancellor or Speaker) costs 60 Gc from the treasury; a private charter costs 250,000 credits and the colony is yours. New colonies appear around the landing site and grow as you build.</p>
      <div class="list">${cands.map(id=>{const st=Cosmos.site(id);return `<div class="li"><span><b>${st?st.name:id}</b> <span class="note">${st?(st.body||''):''}</span></span><span class="row"><button class="btn small" data-found="${id}">Public charter</button><button class="btn small" data-pfound="${id}">Private charter</button></span></div>`;}).join('')||'<p class="note">Visit more worlds to find sites.</p>'}</div>`;
    b.querySelectorAll('[data-ai]').forEach(x=>x.onchange=()=>{p.colonies[x.dataset.ai].ai=x.value;this.recompute(s);});b.querySelectorAll('[data-md]').forEach(x=>x.onchange=()=>{p.colonies[x.dataset.md].mandate=x.value;});
    b.querySelectorAll('[data-b]').forEach(x=>x.onclick=()=>this.build(x.dataset.k,x.dataset.b));b.querySelectorAll('[data-found]').forEach(x=>x.onclick=()=>this.found(x.dataset.found,false));b.querySelectorAll('[data-pfound]').forEach(x=>x.onclick=()=>this.found(x.dataset.pfound,true));},
  drawLedger(b){const s=G.state,p=s.pol;
    b.innerHTML=`<p class="note">The World Ledger records the civilisation-scale acts of a species. A head of government can commit the treasury; anyone can donate (100,000 credits buys one Gc of work). Some projects change what you see: the elevator rises over Earth, the swarm gathers around the Sun.</p><div class="grid2">${Object.entries(LEDGER).map(([id,L])=>{const done=p.ledgerDone[id];const prog=p.projects[id];const reqOk=!L.req||((!L.req.tech||p.ind.tech>=L.req.tech)&&(!L.req.flag||s.flags[L.req.flag]));
      return `<div class="card ${done?'pol-done':''}"><div class="row" style="justify-content:space-between"><b>${L.name}</b><span class="pill">${L.icon}</span></div><p class="note">${L.desc}</p><div class="note mono">${L.cost} Gc over ${L.months} months${L.req&&L.req.tech?' · needs Science '+L.req.tech:''}${this.fxText(L)?' · '+this.fxText(L):''}</div>
      ${done?`<p class="ok">Completed ${Math.floor(done)}.${L.lives?' '+L.lives+'.':''}</p>`:`${prog!=null?`<div style="margin:6px 0">${this.bar(prog,'#f2a33a',L.months)} <span class="mono note">${Math.floor(prog)}/${L.months} mo</span></div>${p.treasury<=-600?'<p class="bad note">Stalled: the treasury is more than 600 Gc in debt. Raise revenue or pause something.</p>':''}`:''}<div class="row" style="gap:6px">${reqOk?`<button class="btn small" data-proj="${id}">${prog!=null?'Pause':'Commit treasury'}</button>`:'<span class="note">Not yet possible</span>'}<button class="btn small" data-don="${id}">Donate 100k</button></div>`}</div>`;}).join('')}</div>`;
    b.querySelectorAll('[data-proj]').forEach(x=>x.onclick=()=>this.startProject(x.dataset.proj));b.querySelectorAll('[data-don]').forEach(x=>x.onclick=()=>this.donate(x.dataset.don,100000));},
  drawLife(b){const s=G.state,L=s.life,p=s.pol;const age=this.age(s);const crewOpts=s.crew.filter(id=>CREW[id]&&!['seven','nine','deepchoir'].includes(id));
    const kids=L.children.map(c=>{const a=this.childAge(c,s);return `<div class="li"><span><b>${c.name}</b></span><span class="note">${a<0?'due in '+Math.ceil(-a*12)+' months (ship time)':Math.floor(a)+' years old'}${c.adult?' · heir':''}</span></div>`;}).join('');
    const parentAge=Math.floor(s.earthYear-L.parents.born);
    b.innerHTML=`<div class="grid2"><div class="card"><h4>You</h4><p><b>${U.esc(s.player.name)}</b>, generation ${L.generation}.</p><p class="note">Biological age ${age.toFixed(1)} (your body counts ship time). Born ${L.born}. On Earth it is ${Math.floor(s.earthYear)}: people you grew up with are ${Math.floor(s.earthYear-L.born)}.</p>
      <p class="note">Parents: ${L.parents.alive?`on Earth, ${parentAge} years old, still sending messages about your diet.`:'passed away while you were travelling.'}</p>
      <h4 style="margin-top:12px">Partner</h4>${L.spouse?`<p>Married to <b>${CREW[L.spouse].name}</b>.</p><button class="btn small" id="lkid">Start or grow the family</button>`:L.partner?`<p>With <b>${CREW[L.partner].name}</b>.</p><div class="row" style="flex-wrap:wrap;gap:6px">${[['civil','Civil ceremony'],['nikah','Nikah'],['church','Church wedding'],['synagogue','Chuppah'],['temple','Hindu ceremony'],['gurdwara','Anand Karaj'],['small','Just the two of you']].map(([k,l])=>`<button class="btn small" data-wed="${k}">${l}</button>`).join('')}</div>`:
        `<p class="note">Someone on your crew who trusts you completely (loyalty 70+) might want more than a berth.</p><div class="row" style="flex-wrap:wrap;gap:6px">${crewOpts.map(id=>`<button class="btn small" data-rom="${id}">${CREW[id].name} · ${Math.round(s.loyalty[id]||50)}</button>`).join('')||'<span class="note">Recruit crew first.</span>'}</div>`}
      <h4 style="margin-top:12px">Children</h4><div class="list">${kids||'<p class="note">None yet.</p>'}</div>${L.children.some(c=>c.adult)?'<button class="btn" id="lsuc" style="margin-top:8px">Pass the torch to your heir</button>':''}
      ${L.ancestors.length?`<h4 style="margin-top:12px">The line</h4><div class="list">${L.ancestors.map(a=>`<div class="li"><span>${U.esc(a.name)}</span><span class="note">${a.year} · ${U.esc(a.legacy)}</span></div>`).join('')}</div>`:''}</div>
      <div class="card"><h4>Faith and practice</h4><p class="note">Entirely optional. Practice never costs you anything in play; it helps some people stay steady on long transits.</p><label class="li"><span>Tradition</span><select id="lfaith">${Object.entries(FAITHS).map(([k,v])=>`<option value="${k}" ${L.faith===k?'selected':''}>${v}</option>`).join('')}</select></label>
        ${L.faith!=='none'?`<label class="li"><span>Keep daily prayer</span><input type="checkbox" id="lpray" ${L.practice.pray?'checked':''}></label><label class="li"><span>Keep the fast in its season</span><input type="checkbox" id="lfast" ${L.practice.fast?'checked':''}></label>${L.practice.pray?`<p class="note">Prayer kept for ${L.practice.streak} months. Focus recovers faster while you keep it.</p>`:''}${L.faith==='islam'?`<p class="note">Qibla: ${this.qibla(s)}</p><p class="note">Prayer times follow the ship's clock. Travellers may shorten and combine prayers, as they always have.</p>`:''}`:''}
        <h4 style="margin-top:12px">Homes</h4><div class="list">${Object.entries(PROPERTIES).map(([k,P])=>`<div class="li"><div><b>${P.name}</b><div class="note">${P.desc}</div><div class="note mono">${U.fmt(P.cost)} cr${P.rent?` · lets for ${P.rent} cr/mo`:''}</div></div>${L.props[k]?`<button class="btn small" data-sell="${k}">Sell</button>`:`<button class="btn small" data-buy="${k}" ${s.credits<P.cost?'disabled':''}>Buy</button>`}</div>`).join('')}</div>
        <h4 style="margin-top:12px">Company</h4>${L.company?`<p><b>${U.esc(L.company.name)}</b> · ${INDUSTRIES[L.company.ind].name}</p><p class="note mono">Value ${U.fmt(L.company.value)} cr · dividend ${U.fmt(Math.round(L.company.revenue))} cr/mo</p><div class="row" style="gap:6px"><button class="btn small" id="linv">Invest 50k</button><button class="btn small" id="lsell">Sell</button></div>`:
        `<p class="note">Found a company for 100,000 credits. Its value moves with Sol's economy; at two million, the board will offer you real power.</p><div class="row" style="gap:6px;flex-wrap:wrap"><input id="lcname" placeholder="Company name" maxlength="28" style="flex:1;min-width:120px"><select id="lcind">${Object.entries(INDUSTRIES).map(([k,I])=>`<option value="${k}">${I.name}</option>`).join('')}</select><button class="btn small" id="lfound">Found</button></div>`}</div></div>`;
    const q=id=>b.querySelector(id);
    b.querySelectorAll('[data-rom]').forEach(x=>x.onclick=()=>this.propose2(x.dataset.rom));b.querySelectorAll('[data-wed]').forEach(x=>x.onclick=()=>this.marry(x.dataset.wed));
    if(q('#lkid'))q('#lkid').onclick=()=>this.haveChild();if(q('#lsuc'))q('#lsuc').onclick=()=>this.succeed();
    q('#lfaith').onchange=e=>{L.faith=e.target.value;if(L.faith==='none'){L.practice.pray=false;L.practice.fast=false;}this.render();};if(q('#lpray'))q('#lpray').onchange=e=>{L.practice.pray=e.target.checked;this.render();};if(q('#lfast'))q('#lfast').onchange=e=>{L.practice.fast=e.target.checked;};
    b.querySelectorAll('[data-buy]').forEach(x=>x.onclick=()=>this.buyProp(x.dataset.buy));b.querySelectorAll('[data-sell]').forEach(x=>x.onclick=()=>this.sellProp(x.dataset.sell));
    if(q('#lfound'))q('#lfound').onclick=()=>this.foundCompany(q('#lcind').value,q('#lcname').value.trim());if(q('#linv'))q('#linv').onclick=()=>this.invest();if(q('#lsell'))q('#lsell').onclick=()=>this.sellCompany();},
};

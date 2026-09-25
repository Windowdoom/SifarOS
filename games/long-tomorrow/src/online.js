/* ═══════════════════════════════════════════════════════════════════════
   ONLINE · the Captains' Registry. When the game runs as a published
   claude.ai artifact, every captain's record is shared: hiscores, how the
   galaxy chose, and who is flying right now. Offline copies have no
   window.claude, so this module quietly does nothing there.
   ═══════════════════════════════════════════════════════════════════════ */
const Online={
  ready:false,db:null,room:null,uid:null,captains:[],peers:[],lastSent:'',lastT:0,
  async init(){
    if(!window.claude||typeof window.claude.use!=='function')return;
    try{
      const [db,user,room]=await Promise.all([claude.use('db'),claude.use('user'),claude.use('room')]);
      this.db=db;this.room=room;
      if(user){try{this.uid=await user.id();}catch(e){}}
      if(db){db.collection('captains').orderBy('updated','desc').limit(300).onSnapshot(snap=>{
          const before=new Map(this.captains.map(c=>[c.id,c]));
          this.captains=snap.docs.map(d=>Object.assign({id:d.id},d.data()));
          for(const ch of snap.docChanges()){if(ch.type!=='modified'||ch.doc.id===this.uid)continue;const n=ch.doc.data(),o=before.get(ch.doc.id);
            if(n&&o&&n.ending&&n.ending!==o.ending&&ENDINGS[n.ending])UI.toast(`Captain ${String(n.name).slice(0,28)} chose ${ENDINGS[n.ending].name}.`,'lvl');}
          this.ready=true;},()=>{});}
      if(room){room.onPeers(ch=>{this.peers=ch.peers.filter(p=>p.kind==='viewer');this.renderBadge();},()=>{});this.presence();}
    }catch(e){}
  },
  record(){const s=G.state;if(!s)return null;const P=s.player;const f=s.flags;
    return{name:String(P.name).slice(0,40),origin:P.origin,ship:String(s.ship.name).slice(0,40),hull:s.ship.hull,act:Story.actName(s),stage:Story.stage(s,'mq'),
      year:Math.round(s.earthYear*10)/10,systems:Object.keys(s.visited).length,far:Math.round(Math.max(0,...Object.keys(s.visited).map(id=>Cosmos.distFromSol(id)))),
      kills:s.stats.kills,total:Object.keys(SKILLS).reduce((a,k)=>a+levelFor(P.skills[k]||0),0),crew:s.crew.length,
      choices:{keel:f.keel||null,dust:f.dust||null,he3:f.he3||null,thalassi:f.thalassi||null,quiet:f.quiet||null,kepleri:f.kepleri||null},ending:f.ended||null,updated:Date.now()};},
  /* Called from autosave. Writes the captain's own document at most once a minute, and only when something changed. */
  async push(force){
    if(!this.db||!this.uid)return;const r=this.record();if(!r)return;const key=JSON.stringify(Object.assign({},r,{updated:0}));
    if(key===this.lastSent)return;if(!force&&Date.now()-this.lastT<60000){clearTimeout(this._pt);this._pt=setTimeout(()=>this.push(true),60000-(Date.now()-this.lastT));return;}
    this.lastT=Date.now();this.lastSent=key;try{await this.db.doc('captains/'+this.uid).set(r);}catch(e){if(e&&e.code==='invalid_argument')this.db=null;}
  },
  presence(){if(!this.room||!G.state)return;const s=G.state;const sys=Cosmos.get(s.loc.system);
    this.room.presence({cap:String(s.player.name).slice(0,40),sys:sys?sys.name:'',where:Game.locName?Game.locName().slice(0,60):'',act:Story.actName(s)}).catch(()=>{});},
  renderBadge(){let b=U.$('#online');if(!b){b=U.el('div',{id:'online',style:'position:absolute;left:50%;top:calc(48px + env(safe-area-inset-top,0px));transform:translateX(-50%);font:10px var(--f-mono);letter-spacing:.14em;color:var(--ok);text-transform:uppercase;text-shadow:0 0 6px #000'});UI.hud.appendChild(b);}
    const n=this.peers.filter(p=>!p.isMe).length;b.textContent=n?`● ${n} other captain${n>1?'s':''} flying now`:'';},
  panel(b){
    if(!this.db&&!this.room){b.innerHTML=`<p class="note">The Captains' Registry is online only when the game runs as a published page on claude.ai. This copy is offline, so your captain is yours alone.</p>`;return;}
    const cs=this.captains;const n=cs.length;
    const pct=(key)=>{const tally={};let tot=0;for(const c of cs){const v=c.choices&&c.choices[key];if(v){tally[v]=(tally[v]||0)+1;tot++;}}return{tally,tot};};
    const labels={keel:{colony:'Gave it to Afterlight',concord:'Gave it to the Concord',oracle:'Gave it to ORACLE',self:'Kept it'},thalassi:{allied:'Allied',isolated:'Left alone',networked:'Networked to ORACLE',hostile:'Drew a weapon'},
      quiet:{destroyed:'Destroyed it',absorbed:'Fed it to ORACLE',freed:'Asked what it wanted'},kepleri:{trappist:'To TRAPPIST-1',sol:'To Sol',starlift:'Star-lifted',stayed:'Let them stay'},dust:{workers:'Backed the union',compromise:'Brokered a deal',audit:'Proved the audit',ordered:'Ordered them back'}};
    const names={dust:'The Dust Union strike',keel:'The Keel',thalassi:'First contact',quiet:'The Quiet Core',kepleri:'The Brightening'};
    const mine=this.record()||{choices:{}};
    const stats=Object.keys(names).map(k=>{const {tally,tot}=pct(k);if(!tot)return '';return `<div class="card"><h4>${names[k]}</h4>${Object.keys(labels[k]).map(v=>{const p=tally[v]?Math.round(tally[v]/tot*100):0;return `<div class="statline"><span style="${mine.choices[k]===v?'color:var(--signal2)':''}">${labels[k][v]}${mine.choices[k]===v?' ·you':''}</span><div class="bar"><i style="width:${p}%"></i></div><span>${p}%</span></div>`;}).join('')}<div class="note mono">${tot} captain${tot>1?'s':''} decided</div></div>`;}).join('');
    const ends={};for(const c of cs)if(c.ending)ends[c.ending]=(ends[c.ending]||0)+1;
    const hi=[...cs].sort((a,b)=>(b.total||0)-(a.total||0)).slice(0,25);
    const online=this.peers.map(p=>{const pr=p.presence||{};return `<div class="li"><span>${U.esc(String(pr.cap||'Unknown captain').slice(0,40))}${p.isMe?' <span class="note">(you)</span>':''}</span><span class="note">${U.esc(String(pr.where||pr.sys||'').slice(0,60))}</span></div>`;}).join('');
    b.innerHTML=`<p class="note">Every captain who plays this page is recorded here: their standing, how far they went, and what they chose. ${n} captain${n===1?'':'s'} on record.</p>
      <div class="grid2"><div><h4 class="lbl" style="margin:8px 0">Flying now</h4><div class="list">${online||'<p class="note">Nobody else is aboard right now.</p>'}</div>
      <h4 class="lbl" style="margin:16px 0 8px">Hiscores · total level</h4><div class="list">${hi.map((c,i)=>`<div class="li ${c.id===this.uid?'sel':''}"><span><span class="mono sig">${i+1}</span> ${U.esc(String(c.name||'?').slice(0,40))} <span class="note">${U.esc(ORIGINS[c.origin]?.name||'')} · ${U.esc(String(c.ship||'').slice(0,30))}</span></span><span class="mono">${c.total||0} · ${c.systems||0} sys · ${U.ly(c.far||0)}</span></div>`).join('')||'<p class="note">No records yet.</p>'}</div></div>
      <div><h4 class="lbl" style="margin:8px 0">How the galaxy chose</h4><div class="list">${stats||'<p class="note">Nobody has reached a major decision yet.</p>'}</div>
      ${Object.keys(ends).length?`<div class="card" style="margin-top:10px"><h4>Endings</h4>${Object.entries(ends).map(([k,v])=>`<div class="statline"><span>${U.esc(ENDINGS[k]?.name||k)}</span><div class="bar"><i style="width:${v/n*100}%"></i></div><span>${v}</span></div>`).join('')}</div>`:''}</div></div>`;
  },
};

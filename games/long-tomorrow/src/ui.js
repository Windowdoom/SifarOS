/* ═══════════════════════════════════════════════════════════════════════
   UI · HUD, dialogue, menus, services, star map
   ═══════════════════════════════════════════════════════════════════════ */

const PROF=[[/\bfucking\b/gi,'flaming'],[/\bfuck\b/gi,'frag'],[/\bshit\b/gi,'crap'],[/\bbastard\b/gi,'genius'],[/\bbitch\b/gi,'witch'],[/\bassholes?\b/gi,'jerk'],[/\bgoddamn\b/gi,'gosh-darn'],[/\bChrist\b/g,'Stars']];
function L(t){if(!G.settings.filter)return t;for(const [re,r] of PROF)t=t.replace(re,r);return t;}

const UI={
  root:null,open:null,stack:[],
  init(){
    this.root=U.$('#ui');
    this.hud=U.el('div',{class:'layer',id:'hud'});this.hud.innerHTML=`
      <div class="tl"><div class="loc" id="h-loc"></div><div class="date" id="h-date"></div><div class="obj" id="h-obj" hidden><b id="h-objq"></b><span id="h-objt"></span></div></div>
      <div id="compass"></div><div id="feed"></div><div id="wanted" hidden></div>
      <div id="vitals"></div><div id="weapon"></div><div id="cross"></div><div id="prompt" hidden></div>
      <div id="titlecard"><div class="a" id="tc-a"></div><div class="b" id="tc-b"></div><div class="c" id="tc-c"></div></div>
      <div id="radio" hidden></div><div id="vats"></div><div id="dmg"></div>`;
    this.root.appendChild(this.hud);
    this.shud=U.el('div',{class:'layer',id:'shud'});this.shud.hidden=true;this.shud.innerHTML=`<div id="brackets"></div><div class="speed" id="s-speed"></div><div class="tgt" id="s-tgt"></div>`;this.root.appendChild(this.shud);
    this.hud.querySelector('#feed');this.feed=U.$('#feed');
    this.letter=U.el('div',{class:'layer',style:'z-index:30'});this.letter.innerHTML=`<div id="lb-t" style="position:absolute;left:0;right:0;top:0;height:0;background:#000;transition:height .6s"></div><div id="lb-b" style="position:absolute;left:0;right:0;bottom:0;height:0;background:#000;transition:height .6s"></div>
      <div id="lb-sub" style="position:absolute;left:50%;bottom:calc(14vh + 10px);transform:translateX(-50%);width:min(820px,90vw);text-align:center;font:17px/1.5 var(--f-body);text-shadow:0 2px 12px #000"></div>
      <div style="position:absolute;right:18px;bottom:18px;font:11px var(--f-mono);color:var(--muted);letter-spacing:.12em" id="lb-skip" hidden>SPACE · SKIP</div>`;this.root.appendChild(this.letter);
  },
  show(el){el.hidden=false;},hide(el){el.hidden=true;},
  /* ── toasts / XP drops ── */
  toast(text,kind=''){const t=U.el('div',{class:'toast '+kind},L(U.esc(text)));this.feed.appendChild(t);while(this.feed.children.length>7)this.feed.firstChild.remove();setTimeout(()=>t.remove(),kind==='lvl'?6000:4200);},
  titleCard(a,b,c){U.$('#tc-a').textContent=a;U.$('#tc-b').textContent=b;U.$('#tc-c').textContent=c;const tc=U.$('#titlecard');tc.classList.add('on');clearTimeout(this._tc);this._tc=setTimeout(()=>tc.classList.remove('on'),5200);},
  prompt(key,text){const p=U.$('#prompt');if(!text){p.hidden=true;return;}p.hidden=false;const k=Input.touch?({KeyE:'USE',KeyF:'VEH',KeyL:'LAND'}[key]||key.replace('Key','')):key.replace('Key','');p.innerHTML=`<kbd>${k}</kbd>${U.esc(text)}`;},
  fade(on,msg=''){const f=U.$('#fade');f.classList.toggle('on',on);f.innerHTML=msg?`<div class="msg">${U.esc(msg)}</div>`:'';},
  letterbox(on,sub,skip){U.$('#lb-t').style.height=on?'11vh':'0';U.$('#lb-b').style.height=on?'11vh':'0';U.$('#lb-sub').innerHTML=sub||'';U.$('#lb-skip').hidden=!skip;this.hud.style.opacity=on?0:1;},

  /* ── HUD ── */
  hudTick(){
    const s=G.state;if(!s)return;const sp=G.mode==='space';
    this.hud.hidden=G.mode==='title'||G.mode==='ending';this.shud.hidden=!sp;
    U.$('#vitals').style.display=sp?'none':'';U.$('#weapon').style.display=sp?'none':'';U.$('#cross').style.display=(G.mode==='surface'&&!Game.inVehicle())?'':'none';
    const site=G.mode==='surface'?Cosmos.site(s.loc.site):null;const sys=Cosmos.get(s.loc.system);
    U.$('#h-loc').textContent=G.mode==='surface'?(s.loc.interior?s.ship.name+' · Bridge':site.name):G.mode==='space'?sys.name:'';
    U.$('#h-date').textContent=`EARTH ${Math.floor(s.earthYear)}.${String(Math.floor((s.earthYear%1)*365)+1).padStart(3,'0')} · SHIP T+${U.yrs(s.shipYears)} · ${U.fmt(s.credits)} CR`;
    const q=s.track&&Story.cur(s,s.track);const ob=U.$('#h-obj');
    if(q){ob.hidden=false;U.$('#h-objq').textContent=Story.qdef(s,s.track).name+(s.quests[s.track].timer?` · ${Math.ceil(s.quests[s.track].timer)}s`:'');U.$('#h-objt').textContent=L(q.text);}else ob.hidden=true;
    if(!sp){const P=s.player;const vb=(n,v,m,col)=>`<div class="vb"><span>${n}</span><div class="bar"><i style="width:${U.clamp(v/m*100,0,100)}%;background:${col}"></i></div><span>${Math.ceil(v)}</span></div>`;
      let h=vb('HP',P.hp,Game.maxHp(),'#ff7a6b');if(site&&!site.breathable&&!s.loc.interior)h+=vb('O₂',P.o2,Game.maxO2(),'#8fd0e8');h+=vb('FOC',P.focus,100,'#f2a33a');if(P.rad>1)h+=vb('RAD',P.rad,100,'#c8e05a');
      U.$('#vitals').innerHTML=h;
      const W=WEAPONS[P.weapon];const w=U.$('#weapon');if(W){const mag=P.mag[P.weapon]??0;w.innerHTML=`<div class="n">${W.name}</div><div class="a">${mag}<small> / ${s.inv[W.ammo]||0}</small></div><div class="k">${Input.touch?'':'R RELOAD · 1-6 SWAP · Q TARGETING · TAB MENU'}</div>`;}else w.innerHTML='';}
    const wd=U.$('#wanted');wd.hidden=!(s.wanted>0);wd.textContent='★'.repeat(Math.ceil(s.wanted))+'☆'.repeat(5-Math.ceil(s.wanted));
    if(this.feed)this.feed.style.top=s.wanted>0?'calc(40px + env(safe-area-inset-top,0px))':'';
  },
  compass(yaw,markers){
    const c=U.$('#compass');const w=c.clientWidth;let h='';const fov=Math.PI*.9;
    const labels=[['N',0],['NE',Math.PI/4],['E',Math.PI/2],['SE',3*Math.PI/4],['S',Math.PI],['SW',-3*Math.PI/4],['W',-Math.PI/2],['NW',-Math.PI/4]];
    for(const [t,a] of labels){const d=U.angDiff(yaw,a);if(Math.abs(d)<fov/2)h+=`<div class="t ${t.length===1?'maj':''}" style="left:${w/2+d/fov*w}px">${t}</div>`;}
    for(let i=0;i<24;i++){const a=i*Math.PI/12;const d=U.angDiff(yaw,a);if(Math.abs(d)<fov/2&&i%3)h+=`<div class="t" style="left:${w/2+d/fov*w}px;opacity:.35">·</div>`;}
    for(const m of markers){const d=U.angDiff(yaw,m.a);const x=U.clamp(w/2+d/fov*w,4,w-4);h+=`<div class="m ${m.k||''}" style="left:${x}px" title="${U.esc(m.t||'')}"></div>`;if(m.t&&Math.abs(d)<fov/2)h+=`<div class="t" style="left:${x}px;top:-1px;font-size:9px;color:${m.k==='e'?'#ff9a90':'#ffcf7e'}">${U.esc(m.d||'')}</div>`;}
    c.innerHTML=h;
  },
  radio(text){const r=U.$('#radio');if(!text){r.hidden=true;return;}r.hidden=false;r.innerHTML=text;clearTimeout(this._rt);this._rt=setTimeout(()=>r.hidden=true,9000);},

  /* ── Modal plumbing ── */
  modal(id,title,body,{tabs=null,onTab=null,wide=false,onClose=null,actions=''}={}){
    this.close(true);Input.uiOpen=true;Input.unlock();
    const m=U.el('div',{class:'modal layer interactive',id});m.style.zIndex=25;
    m.innerHTML=`<div class="sheet" style="${wide?'height:min(860px,100%)':''}"><header><h2>${U.esc(title)}</h2><div class="sp"></div>${actions}<button class="btn small" data-close>Close · Esc</button></header>${tabs?`<nav class="tabs">${tabs.map((t,i)=>`<button data-tab="${t[0]}" class="${i===0?'on':''}">${t[1]}</button>`).join('')}</nav>`:''}<div class="body"></div></div>`;
    m.querySelector('[data-close]').onclick=()=>this.close();
    m.addEventListener('mousedown',e=>{if(e.target===m)this.close();});
    const bodyEl=m.querySelector('.body');this.open={el:m,onClose};
    if(tabs){m.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{m.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x===b));AudioSys.sfx('ui');onTab(b.dataset.tab,bodyEl);});}
    if(typeof body==='function')body(bodyEl);else bodyEl.innerHTML=body;
    this.root.appendChild(m);G.paused=true;return {el:m,body:bodyEl};
  },
  close(silent){if(!this.open)return;const o=this.open;this.open=null;o.el.remove();if(o.onClose)o.onClose();if(this.yardR){this.yardR.dispose();this.yardR=null;}Input.uiOpen=false;G.paused=false;if(!silent)AudioSys.sfx('ui');},

  /* ── Title & character creation ── */
  /* a small second renderer for menu previews, lit by a studio environment */
  previewRenderer(host){
    const r=new THREE.WebGLRenderer({antialias:true,alpha:true});r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.05;r.setPixelRatio(Math.min(devicePixelRatio||1,2));
    host.appendChild(r.domElement);try{const pm=new THREE.PMREMGenerator(r);r.__env=pm.fromScene(new THREE.RoomEnvironment(),.04).texture;pm.dispose();}catch(e){r.__env=null;}
    return r;
  },
  title(){
    const hasSave=Store.latest();
    const el=U.el('div',{class:'layer interactive',id:'title'});
    el.innerHTML=`<h1><span>A Sifar Chronicle</span>The Long<br>Tomorrow</h1>
      <p class="tag">2187. A signal from everywhere at once, a ship that shouldn't work, and a universe that changes with every choice you make. ${U.esc(Cosmos.countEstimate())}</p>
      <div class="menu">${hasSave?`<button class="btn primary" data-a="continue">Continue · ${U.esc(hasSave.meta.name)} · ${U.esc(hasSave.meta.act||'')}</button>`:''}
      <button class="btn ${hasSave?'':'primary'}" data-a="new">New Game</button><button class="btn" data-a="load">Load / Import</button><button class="btn" data-a="settings">Settings</button><button class="btn" data-a="controls">Controls</button><button class="btn" data-a="credits">Credits</button></div>
      <div class="foot">Real star catalogue · Procedural galaxy model · Synthesized audio · Mature language (filter in Settings)</div>`;
    el.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{AudioSys.init();AudioSys.sfx('ui2');const a=b.dataset.a;
      if(a==='new')this.create();else if(a==='continue'){el.remove();Game.loadSlot(hasSave.slot);}else if(a==='load')this.loadMenu();else if(a==='settings')this.settings();else if(a==='credits')this.credits();else this.controls();});
    this.root.appendChild(el);this.titleEl=el;
  },
  /* every third-party asset and library, with author, licence and source */
  credits(){
    this.modal('credits','Credits',async b=>{b.innerHTML='<p class="note">Loading credits…</p>';
      const list=await Assets.loadCredits();
      const libs=[{what:'three.js r170 (renderer, loaders, post-processing)',author:'mrdoob and three.js contributors',license:'MIT',url:'https://github.com/mrdoob/three.js'},
        {what:'cannon-es (rigid-body physics)',author:'pmndrs, after Stefan Hedman\'s cannon.js',license:'MIT',url:'https://github.com/pmndrs/cannon-es'},
        {what:'IBM Plex Sans / Plex Mono, Saira Condensed',author:'IBM; Omnibus-Type',license:'SIL Open Font License 1.1',url:'https://fonts.google.com'},
        {what:'Nearby star and exoplanet values (distances, masses, orbits, temperatures)',author:'Public catalogues: NASA Exoplanet Archive, ESA Gaia, discovery papers',license:'Public scientific data',url:'https://exoplanetarchive.ipac.caltech.edu'}];
      const row=c=>`<div class="li"><div><b>${U.esc(c.what)}</b><div class="note">${U.esc(c.author)} · ${U.esc(c.license)}${c.file?` · <span class="mono">${U.esc(c.file)}</span>`:''}</div></div>${c.url?`<a class="note mono" href="${U.esc(c.url)}" target="_blank" rel="noopener">source</a>`:''}</div>`;
      b.innerHTML=`<p class="note">The Long Tomorrow is original code, story and music synthesis. It stands on the work below, used under each licence. NASA material is used without implying endorsement. Thank you to everyone who shares their work openly.</p>
        <h4 class="lbl" style="margin:14px 0 6px">Models, textures and skies</h4><div class="list">${(list||[]).map(row).join('')||'<p class="note">The credits file could not be loaded.</p>'}</div>
        <h4 class="lbl" style="margin:14px 0 6px">Code and data</h4><div class="list">${libs.map(row).join('')}</div>`;},{wide:true});
  },
  controls(){this.modal('controls','Controls',`<div class="grid2">
    <div class="card"><h4>On foot</h4><dl class="kv"><dt>Move</dt><dd>W A S D · Shift sprint · Space jump (hold to glide on Titan)</dd><dt>Look</dt><dd>Mouse (click to capture) · V first/third person · Wheel zoom</dd><dt>Fight</dt><dd>Left click fire · Right click aim · R reload · 1–6 weapons · Q Neural Targeting (slow time) · H trauma kit</dd>
      <dt>Interact</dt><dd>E talk / use / mine · F enter or steal a vehicle · B board your ship</dd><dt>Menus</dt><dd>Tab wrist computer · M star map · J journal · Esc pause</dd></dl></div>
    <div class="card"><h4>Driving</h4><dl class="kv"><dt>Drive</dt><dd>W/S throttle · A/D steer · Space handbrake · F exit · , and . radio</dd></dl>
      <h4 style="margin-top:14px">Ship</h4><dl class="kv"><dt>Fly</dt><dd>Mouse steers · W/S thrust · A/D strafe · Q/E roll · R/F up/down · Shift boost</dd><dt>Systems</dt><dd>C cruise drive (long distance) · X flight assist · T target nearest · Left click fire · L land or dock · M star map & jump · I walk the bridge</dd></dl></div>
    <div class="card"><h4>Surviving</h4><p class="note">Airless worlds drain suit oxygen; refill at settlements, your ship, or with O₂ canisters. Europa and Proxima flares add radiation dose; filgrastim clears it. Gravity is real: 0.03 g on Ceres, 1.9 g on LHS 1140 b.</p></div>
    <div class="card"><h4>Progress</h4><p class="note">Eight skills level from 1 to 99 on the RuneScape experience curve. Everything you do trains something. The world keeps moving while you travel: interstellar trips advance Earth's calendar and the news catches up with you.</p></div></div>`);},
  settings(){
    const s=G.settings;
    this.modal('settings','Settings',b=>{b.innerHTML=`<div class="grid2"><div class="list">
      <label class="li"><span>Graphics quality</span><select id="set-q">${['low','medium','high','ultra'].map(q=>`<option ${q===s.quality?'selected':''}>${q}</option>`).join('')}</select></label>
      <label class="li"><span>Mouse sensitivity</span><input id="set-sens" type="range" min="0.2" max="3" step="0.05" value="${s.sens}"></label>
      <label class="li"><span>Invert Y</span><input id="set-inv" type="checkbox" ${s.invertY?'checked':''}></label>
      <label class="li"><span>Field of view</span><input id="set-fov" type="range" min="55" max="100" step="1" value="${s.fov}"></label>
      <label class="li"><span>Volume</span><input id="set-vol" type="range" min="0" max="1" step="0.05" value="${s.volume}"></label>
      <label class="li"><span>Vehicle radio</span><input id="set-radio" type="checkbox" ${s.radio?'checked':''}></label>
      <label class="li"><span>Language filter (mature language is on by default)</span><input id="set-filter" type="checkbox" ${s.filter?'checked':''}></label>
      </div><div class="note"><p>Low turns off bloom, shadows and multisampling. Ultra renders at full device resolution.</p><p>Settings are stored in this browser only.</p></div></div>`;
      const on=()=>{s.quality=b.querySelector('#set-q').value;s.sens=+b.querySelector('#set-sens').value;s.invertY=b.querySelector('#set-inv').checked;s.fov=+b.querySelector('#set-fov').value;s.volume=+b.querySelector('#set-vol').value;s.radio=b.querySelector('#set-radio').checked;s.filter=b.querySelector('#set-filter').checked;
        Store.saveSettings(s);AudioSys.setVolume(s.volume);Render.resize();if(G.camera){G.camera.fov=s.fov;G.camera.updateProjectionMatrix();}};
      b.querySelectorAll('input,select').forEach(i=>i.onchange=on);});
  },
  loadMenu(){
    this.modal('load','Load game',b=>{
      const rows=Store.slots().map(({slot,meta})=>`<div class="li"><div><b>${slot==='auto'?'Autosave':'Slot '+slot}</b> <span class="note">${meta?`${U.esc(meta.name)} · ${U.esc(meta.loc||'')} · ${Math.floor(meta.year)} · ${U.esc(meta.act||'')}`:'Empty'}</span></div>${meta?`<button class="btn small" data-slot="${slot}">Load</button>`:''}</div>`).join('');
      b.innerHTML=`<div class="list">${rows}</div><h4 style="margin:18px 0 6px">Import a save code</h4><p class="note">Saves live in this browser. If storage is blocked, use Export in the pause menu and paste the code here.</p><textarea id="imp" style="width:100%;height:80px;background:#0b1220;color:var(--ink);border:1px solid var(--line2);font:12px var(--f-mono)"></textarea><div class="row" style="margin-top:8px"><button class="btn" id="impb">Import</button><span class="note" id="impmsg"></span></div>`;
      b.querySelectorAll('[data-slot]').forEach(x=>x.onclick=()=>{this.close();this.titleEl&&this.titleEl.remove();Game.loadSlot(x.dataset.slot);});
      b.querySelector('#impb').onclick=()=>{const st=Store.importStr(b.querySelector('#imp').value);if(!st){b.querySelector('#impmsg').textContent='That code is not a valid save. Copy the whole line starting with LTM1:';return;}this.close();this.titleEl&&this.titleEl.remove();Game.start(st);};
    });
  },
  create(){
    const rn=U.rng(Date.now()>>>0);const pick={name:U.pick(rn,NAMES.first)+' '+U.pick(rn,NAMES.last),origin:'physician',attrs:{STR:5,PER:5,END:5,CHA:5,INT:5,AGI:5},pts:6,suit:'#39475a',skin:'#b98260',hair:'#1b1410',ship:'Long Tomorrow',helmet:false,body:U.pick(rn,['soldier','michelle'])};
    const BODIES={soldier:['Operator','Field armour, heavy boots. Reads as ex-military.'],michelle:['Civilian','Street clothes under a pressure liner. Reads as crew, not cop.'],xbot:['Synthetic','A printed chassis. You can play as an uploaded mind or a built one.']};
    const suits=['#39475a','#5a3a2a','#2a4a3a','#4a2a4a','#6a6a70','#8a2a2a','#1a1a1e','#c8ccd4'],skins=['#f1d3bd','#e0b596','#c69274','#b98260','#8a5a3c','#5a3a26','#3a2418'],hairs=['#1b1410','#3a2414','#8a5a2a','#c8a060','#a3522a','#d8d8d8','#101010'];
    const m=this.modal('create','New captain',b=>{
      b.innerHTML=`<div class="preview" id="cpv"></div><div>
        <div class="row"><label class="lbl" for="cn">Name</label><input id="cn" value="${U.esc(pick.name)}" maxlength="28" style="flex:1"><label class="lbl" for="cs">Ship</label><input id="cs" value="${U.esc(pick.ship)}" maxlength="28" style="flex:1"></div>
        <h4 class="lbl" style="margin:16px 0 8px">Origin</h4><div class="origins">${Object.entries(ORIGINS).map(([k,o])=>`<button class="origin ${k===pick.origin?'sel':''}" data-o="${k}"><b>${o.name}</b><small>${U.esc(o.home)}</small><small>${U.esc(o.blurb)}</small></button>`).join('')}</div>
        <div class="grid2" style="margin-top:16px"><div><h4 class="lbl" style="margin-bottom:8px">Attributes · <span id="pts"></span> points left</h4><div id="attrs"></div></div>
        <div><h4 class="lbl" style="margin-bottom:8px">Look</h4><div class="lbl" style="margin:6px 0">Body</div><div class="row" id="bodies" style="flex-wrap:wrap;gap:6px"></div><p class="note" id="bdesc" style="margin:6px 0 0"></p><div class="lbl" style="margin:10px 0 6px">Suit tint</div><div class="swatches" id="sw-suit"></div><div id="fallback-look" ${Chars.ready?'hidden':''}><div class="lbl" style="margin:10px 0 6px">Skin</div><div class="swatches" id="sw-skin"></div><div class="lbl" style="margin:10px 0 6px">Hair</div><div class="swatches" id="sw-hair"></div></div>
        <p class="note" id="odesc" style="margin-top:12px"></p></div></div>
        <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn primary" id="go">Begin · 2187</button></div></div>`;
      const drawAttrs=()=>{b.querySelector('#pts').textContent=pick.pts;b.querySelector('#attrs').innerHTML=Object.keys(ATTRS).map(a=>{const v=pick.attrs[a]+(ORIGINS[pick.origin].attr===a?1:0);return `<div class="attr" title="${ATTRS[a].desc}"><b>${a}</b><div class="pips">${Array.from({length:10},(_,i)=>`<i class="${i<v?'on':''}"></i>`).join('')}</div><span class="mono">${v}</span><button class="btn small" data-m="${a}">−</button><button class="btn small" data-p="${a}">+</button></div>`;}).join('');
        b.querySelectorAll('[data-m]').forEach(x=>x.onclick=()=>{const a=x.dataset.m;if(pick.attrs[a]>1){pick.attrs[a]--;pick.pts++;drawAttrs();}});
        b.querySelectorAll('[data-p]').forEach(x=>x.onclick=()=>{const a=x.dataset.p;if(pick.pts>0&&pick.attrs[a]<9){pick.attrs[a]++;pick.pts--;drawAttrs();}});
        b.querySelector('#odesc').textContent=ORIGINS[pick.origin].intro;};
      const sw=(id,list,key)=>{const e=b.querySelector(id);e.innerHTML=list.map(c=>`<button class="sw ${c===pick[key]?'sel':''}" style="background:${c}" data-c="${c}" aria-label="${c}"></button>`).join('');e.querySelectorAll('button').forEach(x=>x.onclick=()=>{pick[key]=x.dataset.c;sw(id,list,key);rebuild();});};
      sw('#sw-suit',suits,'suit');sw('#sw-skin',skins,'skin');sw('#sw-hair',hairs,'hair');
      const drawBodies=()=>{const e=b.querySelector('#bodies');e.innerHTML=Object.entries(BODIES).map(([k,v])=>`<button class="btn small ${k===pick.body?'primary':''}" data-body="${k}">${v[0]}</button>`).join('');b.querySelector('#bdesc').textContent=BODIES[pick.body][1];
        e.querySelectorAll('[data-body]').forEach(x=>x.onclick=()=>{pick.body=x.dataset.body;drawBodies();rebuild();AudioSys.sfx('ui');});};drawBodies();
      b.querySelectorAll('[data-o]').forEach(x=>x.onclick=()=>{pick.origin=x.dataset.o;b.querySelectorAll('[data-o]').forEach(y=>y.classList.toggle('sel',y===x));drawAttrs();AudioSys.sfx('ui');});
      drawAttrs();
      // 3D preview
      const host=b.querySelector('#cpv');const r=UI.previewRenderer(host);this.yardR=r;
      const sc=new THREE.Scene();sc.environment=r.__env;const cam=new THREE.PerspectiveCamera(30,1,.1,50);cam.position.set(0,1.15,5.2);cam.lookAt(0,.88,0);
      sc.add(new THREE.HemisphereLight(0xb8c8ff,0x201810,1.4));const dl=new THREE.DirectionalLight(0xfff0dd,3.2);dl.position.set(2,3,3);sc.add(dl);const rl=new THREE.DirectionalLight(0xf2a33a,3);rl.position.set(-3,1.5,-2);sc.add(rl);
      const floor=new THREE.Mesh(new THREE.CircleGeometry(1.2,48),new THREE.MeshStandardMaterial({color:0x121a28,roughness:.55,metalness:.3}));floor.rotation.x=-Math.PI/2;sc.add(floor);
      let hum=null;const rebuild=()=>{if(hum)sc.remove(hum.root);
        hum=Chars.ready?Chars.create(Object.assign(Chars.playerLook(pick),{gun:'sidearm'})):null;if(!hum)hum=Gen.humanoid({suit:pick.suit,skin:pick.skin,hair:pick.hair,gun:'sidearm'});
        if(hum.gun&&!hum.gun.parent)sc.add(hum.gun);sc.add(hum.root);};rebuild();
      let run=true,last=performance.now();const loop=(now)=>{if(!run||!host.isConnected){run=false;r.dispose();return;}const w=host.clientWidth,h=host.clientHeight;if(w&&h){r.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();}
        const dt=Math.min(.05,((now||last)-last)/1000);last=now||last;hum.root.rotation.y+=dt*.5;hum.pose(dt||1/60,0,false,false,false);r.render(sc,cam);requestAnimationFrame(loop);};requestAnimationFrame(loop);
      b.querySelector('#go').onclick=()=>{pick.name=b.querySelector('#cn').value.trim()||'Captain';pick.ship=b.querySelector('#cs').value.trim()||'Long Tomorrow';run=false;this.close();this.titleEl&&this.titleEl.remove();Game.newGame(pick);};
    },{wide:true});
  },

  /* ── Dialogue ── */
  dialogue(dlgId,npc){
    const D=DLG[dlgId];if(!D)return;const s=G.state;if(this.dlgEl){this.dlgEl.remove();this.dlgEl=null;}Input.uiOpen=true;Input.unlock();G.paused=true;G.talking=npc;
    const el=U.el('div',{class:'layer interactive',id:'dlg'});el.style.zIndex=24;this.root.appendChild(el);
    const show=(nid)=>{
      const N=D.nodes[nid];if(!N){end();return;}
      const who=N.s?(NPCS[N.s]?NPCS[N.s].name:CREW[N.s]?CREW[N.s].name:N.s):(npc?npc.name:'');const role=N.s&&NPCS[N.s]?NPCS[N.s].role:npc&&npc.role||'';
      const txt=typeof N.t==='function'?N.t(s):N.t;
      const choices=N.c.filter(c=>!(c.hide&&Story.meets(s,c.hide))&&!(c.req&&c.req.stage&&!Story.meets(s,{stage:c.req.stage})&&!c.req.skill&&!c.req.any&&!c.req.credits&&!c.req.item)).filter(c=>!(c.req&&(c.req.stageMin||c.req.stage||c.req.crew||c.req.flag)&&!Story.meets(s,{stageMin:c.req.stageMin,stage:c.req.stage,crew:c.req.crew,flag:c.req.flag})));
      el.innerHTML=`<div class="box"><div class="who">${U.esc(who)}</div><div class="role">${U.esc(role)}</div><div class="txt">${L(U.esc(txt))}</div><div class="ch">${choices.map((c,i)=>{const ok=Story.meets(s,c.req);const lab=c.req?Story.reqLabel(c.req):'';
        const txtc=c.t.replace(/^\[[^\]]+\]\s*/,'');return `<button data-i="${i}" ${ok?'':'disabled'}><span class="num">${i+1}</span>${lab?`<span class="tagk ${ok?'':'fail'}">[${U.esc(lab)}]</span>`:''}${L(U.esc(txtc))}</button>`;}).join('')}</div></div>`;
      el.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>pickC(choices[+b.dataset.i]));
      this._dlgKeys=choices.map((c,i)=>()=>{if(Story.meets(s,c.req))pickC(c);});
    };
    const pickC=(c)=>{AudioSys.sfx('ui');const fx=c.fx;const go=c.go,isEnd=c.end;
      if(fx&&fx.shop){end();Story.apply(s,fx);return;}
      if(fx&&(fx.cut||fx.ending)){end();Story.apply(s,fx);return;}
      Story.apply(s,fx);if(isEnd||!go)end();else show(go);};
    const end=()=>{el.remove();this._dlgKeys=null;Input.uiOpen=false;G.paused=false;G.talking=null;this.dlgEl=null;};
    this.dlgEl=el;show(D.start);
  },

  /* ── Wrist computer ── */
  wrist(tab='status'){
    const tabs=[['status','Status'],['inv','Inventory'],['quests','Journal'],['crew','Crew'],['factions','Factions'],['news','Solnet'],['codex','Codex'],['registry','Registry'],['system','Game']];
    const m=this.modal('wrist',G.state.player.name+' · wrist computer','',{tabs,onTab:(t,b)=>this.wristTab(t,b),wide:true});
    m.el.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x.dataset.tab===tab));this.wristTab(tab,m.body);
  },
  wristTab(t,b){
    const s=G.state;const P=s.player;
    if(t==='status'){
      const sk=Object.keys(SKILLS).map(k=>{const xp=P.skills[k]||0;const lv=levelFor(xp);const a=XP_TABLE[lv],z=XP_TABLE[Math.min(99,lv+1)];const pct=lv>=99?100:(xp-a)/(z-a)*100;
        return `<div class="skill" title="${SKILLS[k].desc}"><div class="top"><b>${SKILLS[k].name}</b><span class="lv">${lv}</span></div><div class="bar"><i style="width:${pct}%"></i></div><div class="note mono" style="font-size:10px;margin-top:4px">${U.fmt(xp)} xp${lv<99?` · ${U.fmt(z-xp)} to ${lv+1}`:''}</div></div>`;}).join('');
      const total=Object.keys(SKILLS).reduce((a,k)=>a+levelFor(P.skills[k]||0),0);
      b.innerHTML=`<div class="grid2"><div><dl class="kv"><dt>Captain</dt><dd>${U.esc(P.name)}</dd><dt>Origin</dt><dd>${ORIGINS[P.origin].name} · ${U.esc(ORIGINS[P.origin].home)}</dd><dt>Ship</dt><dd>${U.esc(s.ship.name)} (${HULLS[s.ship.hull].cls})</dd><dt>Location</dt><dd>${U.esc(Game.locName())}</dd><dt>Earth date</dt><dd>${s.earthYear.toFixed(2)}</dd><dt>Ship time</dt><dd>${U.yrs(s.shipYears)} since 2187</dd>
        <dt>Health</dt><dd>${Math.ceil(P.hp)} / ${Game.maxHp()}</dd><dt>Credits</dt><dd>${U.fmt(s.credits)}</dd><dt>Carry</dt><dd>${Game.load().toFixed(0)} / ${Game.capacity()} t</dd><dt>Total level</dt><dd>${total}</dd><dt>Systems visited</dt><dd>${Object.keys(s.visited).length}</dd><dt>Kills</dt><dd>${s.stats.kills}</dd></dl>
        <h4 class="lbl" style="margin:16px 0 8px">Attributes</h4><div class="grid3">${Object.keys(ATTRS).map(a=>`<div class="card" title="${ATTRS[a].desc}"><b class="mono">${a} ${P.attrs[a]}</b><div class="note">${ATTRS[a].name}</div></div>`).join('')}</div></div>
        <div><h4 class="lbl" style="margin-bottom:8px">Skills (1–99)</h4><div class="skills">${sk}</div></div></div>`;
    }
    if(t==='inv'){
      const groups={weapon:'Weapons',ammo:'Ammunition',use:'Consumables',ore:'Ore',trade:'Trade goods',quest:'Quest items'};
      let h='';for(const g in groups){const items=Object.keys(s.inv).filter(k=>s.inv[k]>0&&ITEMS[k]&&ITEMS[k].type===g);if(!items.length)continue;
        h+=`<h4 class="lbl" style="margin:14px 0 8px">${groups[g]}</h4><div class="inv">${items.map(k=>`<div class="li"><div><b>${U.esc(ITEMS[k].name)}</b> <span class="note mono">×${s.inv[k]}</span>${ITEMS[k].desc?`<div class="note">${U.esc(ITEMS[k].desc)}</div>`:''}</div>${g==='weapon'?`<button class="btn small" data-eq="${k}">${P.weapon===k?'Equipped':'Equip'}</button>`:g==='use'?`<button class="btn small" data-use="${k}">Use</button>`:''}</div>`).join('')}</div>`;}
      b.innerHTML=`<p class="note">Carrying ${Game.load().toFixed(1)} of ${Game.capacity()} t (personal ${Game.personalCap()} t + ${U.esc(s.ship.name)} hold).</p>`+h;
      b.querySelectorAll('[data-eq]').forEach(x=>x.onclick=()=>{Game.equip(x.dataset.eq);this.wristTab('inv',b);});
      b.querySelectorAll('[data-use]').forEach(x=>x.onclick=()=>{Game.useItem(x.dataset.use);this.wristTab('inv',b);});
    }
    if(t==='quests'){
      const act=Story.active(s);const done=Object.keys(s.quests).filter(q=>s.quests[q].done);
      const qh=q=>{const Q=Story.qdef(s,q);if(!Q)return '';const cur=s.quests[q].stage;const st=Object.keys(Q.stages).map(Number).sort((a,b)=>a-b);
        return `<div class="card" style="margin-bottom:10px"><div class="row sb"><h4>${U.esc(Q.name)}</h4>${!s.quests[q].done?`<button class="btn small" data-track="${q}">${s.track===q?'Tracking':'Track'}</button>`:'<span class="pill" style="color:var(--ok)">Complete</span>'}</div>
        ${st.filter(n=>n<=cur).slice(-6).map(n=>`<div class="qstep ${n===cur&&!s.quests[q].done?'cur':''}"><i>${n<cur||s.quests[q].done?'✓':'▸'}</i><span>${L(U.esc(Q.stages[n].text))}</span></div>`).join('')}</div>`;};
      b.innerHTML=`<h4 class="lbl" style="margin-bottom:8px">${U.esc(Story.actName(s))}</h4>${act.sort((a,b)=>a==='mq'?-1:b==='mq'?1:0).map(qh).join('')}${done.length?`<h4 class="lbl" style="margin:16px 0 8px">Completed</h4>${done.map(q=>`<div class="li"><span>${U.esc(Story.qdef(s,q)?.name||q)}</span></div>`).join('')}`:''}`;
      b.querySelectorAll('[data-track]').forEach(x=>x.onclick=()=>{s.track=x.dataset.track;this.wristTab('quests',b);});
    }
    if(t==='crew'){
      const rows=Object.keys(CREW).map(k=>{const c=CREW[k];const on=s.crew.includes(k);const loy=s.loyalty[k]??50;
        return `<div class="card" style="opacity:${on?1:.45}"><div class="row sb"><h4 style="color:${c.color}">${U.esc(c.name)}</h4><span class="pill" style="color:${on?'var(--ok)':'var(--dim)'}">${on?'Aboard':'Not recruited'}</span></div>
          <div class="note">${U.esc(c.role)}</div><p style="margin-top:6px;font-size:13px">${U.esc(c.bonus)}</p>${on?`<div class="row" style="gap:8px"><span class="lbl">Loyalty</span><div class="bar" style="flex:1"><i style="width:${loy}%;background:${loy<25?'var(--danger)':loy>70?'var(--ok)':'var(--signal)'}"></i></div><span class="mono">${loy}</span></div>`:''}
          <p class="note" style="margin-top:6px">Wants: ${U.esc(c.want)}<br>Fears: ${U.esc(c.fear)}</p></div>`;}).join('');
      b.innerHTML=`<p class="note">Crew take bridge stations and give passive bonuses. They react to your choices; loyalty below 15 means they leave at the next port. Crew capacity: ${s.crew.length} / ${Game.crewCap()}.</p><div class="grid2">${rows}</div>`;
    }
    if(t==='factions'){
      const facs=Object.keys(FACTIONS).map(k=>{const v=s.rep[k]||0;const F=FACTIONS[k];return `<div class="faction"><span class="dot" style="background:${F.color}"></span><div><b>${F.name}</b><div class="note">${U.esc(F.desc)}</div></div><div class="fbar"><i style="${v>=0?`left:50%;width:${v/2}%`:`right:50%;width:${-v/2}%`};background:${v>=0?F.color:'var(--danger)'}"></i></div><span class="mono">${v>0?'+':''}${v}</span></div>`;}).join('');
      const civs=Object.keys(s.rep).filter(k=>k.startsWith('civ:')).map(k=>{const c=Cosmos.civById(k.slice(4));const v=s.rep[k];return c?`<div class="faction"><span class="dot" style="background:${c.color}"></span><div><b>The ${U.esc(c.plural)}</b><div class="note">${U.esc(c.ethos.name)} · tier ${c.tier} · ${U.esc(GALAXIES[c.galaxy].name)}</div></div><div class="fbar"><i style="${v>=0?`left:50%;width:${v/2}%`:`right:50%;width:${-v/2}%`};background:${c.color}"></i></div><span class="mono">${v}</span></div>`:'';}).join('');
      const w=s.world;
      b.innerHTML=facs+(civs?`<h4 class="lbl" style="margin:18px 0 6px">Civilizations met</h4>${civs}`:'')+`<h4 class="lbl" style="margin:18px 0 6px">State of humanity</h4><dl class="kv"><dt>ORACLE influence</dt><dd>${Math.round(w.oracle*100)}%</dd><dt>Frontier strength</dt><dd>${Math.round(w.frontier*100)}%</dd><dt>Settled radius</dt><dd>${U.ly(w.frontierRadius)} from Sol</dd><dt>Population index</dt><dd>${(w.pop*100).toFixed(0)} (2187 = 100)</dd></dl>`;
    }
    if(t==='news'){b.innerHTML=`<p class="note">Solnet wire. Stories are generated from the actual state of the world, including what you did.</p>`+(s.news.length?s.news.map(n=>`<div class="news"><div class="y">${n.y.toFixed(2)}</div>${L(U.esc(n.t))}</div>`).join(''):'<p class="note">No news yet.</p>');}
    if(t==='codex')this.codex(b);
    if(t==='registry')Online.panel(b);
    if(t==='system'){b.innerHTML=`<div class="grid2"><div class="list">
      ${['auto','1','2','3'].map(sl=>`<div class="li"><span>${sl==='auto'?'Autosave':'Slot '+sl}${Store.meta(sl)?` · <span class="note">${U.esc(Store.meta(sl).loc||'')} ${Math.floor(Store.meta(sl).year)}</span>`:''}</span><span class="row">${sl!=='auto'?`<button class="btn small" data-save="${sl}">Save</button>`:''}${Store.meta(sl)?`<button class="btn small" data-load="${sl}">Load</button>`:''}</span></div>`).join('')}
      </div><div><button class="btn" id="exp">Export save code</button><textarea id="expo" readonly style="width:100%;height:110px;margin-top:8px;background:#0b1220;color:var(--ink);border:1px solid var(--line2);font:11px var(--f-mono)"></textarea>
      <div class="row" style="margin-top:10px"><button class="btn" id="sett">Settings</button><button class="btn" id="ctl">Controls</button><button class="btn" id="cred">Credits</button><button class="btn danger" id="quit">Quit to title</button></div><p class="note" id="svmsg" style="margin-top:8px"></p></div></div>`;
      b.querySelectorAll('[data-save]').forEach(x=>x.onclick=()=>{const ok=Game.saveSlot(x.dataset.save);b.querySelector('#svmsg').textContent=ok?'Saved.':'This browser blocked storage. Use Export save code instead.';});
      b.querySelectorAll('[data-load]').forEach(x=>x.onclick=()=>{this.close();Game.loadSlot(x.dataset.load);});
      b.querySelector('#exp').onclick=()=>{const t=b.querySelector('#expo');t.value=Store.exportStr(G.state);t.select();try{navigator.clipboard.writeText(t.value).then(()=>b.querySelector('#svmsg').textContent='Copied to clipboard.',()=>{});}catch(e){}};
      b.querySelector('#sett').onclick=()=>this.settings();b.querySelector('#ctl').onclick=()=>this.controls();b.querySelector('#cred').onclick=()=>this.credits();b.querySelector('#quit').onclick=()=>{this.close();Game.quitToTitle();};}
  },
  codex(b){
    const s=G.state;const entries=[];
    const sys=Cosmos.get(s.loc.system);
    entries.push({k:'here',t:sys.name,h:`<p>${U.esc(sys.purpose||'')}</p>`+this.sysFacts(sys)});
    const ids=['sol','alphacen','barnard','epseri','tauceti','lhs1140','trappist','kepler452','sgra','lmc','m31'];
    for(const id of ids){const S=SYSTEMS[id];if(!s.visited[id]&&id!=='sol'&&id!=='alphacen')continue;entries.push({k:id,t:S.name,h:`<p>${U.esc(S.purpose)}</p>`+this.sysFacts(S)});}
    const physics=[
      ['Warp drives','<p>The White–Juday drive is based on Miguel Alcubierre\'s 1994 solution to Einstein\'s field equations: contract spacetime ahead of a ship and expand it behind, so the ship itself never moves faster than light locally. The catch is that the bubble needs negative energy density. Harold White\'s 2011–2013 work suggested the required energy could fall from Jupiter-masses to something far smaller by reshaping the bubble into a torus, which is why your ship carries a ring. The game\'s one invention is the Null Signal, which supplies the missing stabilizer.</p>','Alcubierre, M. (1994) Class. Quantum Grav. 11 L73 · White, H. (2013) JBIS 66'],
      ['Fusion torches','<p>The Daedalus study (British Interplanetary Society, 1973–78) designed an uncrewed probe driven by deuterium–helium-3 inertial-confinement fusion, reaching 12% of lightspeed. Helium-3 is rare on Earth but present in lunar regolith and abundant in gas-giant atmospheres, which is why skimming Jupiter pays.</p>','Bond, A. & Martin, A. (1978) Project Daedalus, JBIS supplement'],
      ['Time dilation','<p>Two effects run in this game. Special relativity: at fraction v/c of lightspeed, ship clocks run slow by γ = 1/√(1−v²/c²). At 12% of c that is only 0.7%, so torch crews still sleep for decades. General relativity: close to a massive, fast-spinning black hole, clocks near the horizon run far slower than distant ones. The Throat\'s ratio of about three months per hour needs a near-maximal Kerr spin, as in Kip Thorne\'s work for the film Interstellar.</p>','Thorne, K. (2014) The Science of Interstellar'],
      ['Gravity and your body','<p>Your jump speed is the same everywhere. What changes is g. Jump height scales as v²/2g: about 1 m on Earth, 6 m on Luna, 2.7 m on Mars and 35 m on Ceres. On Titan, 1.45 atm of air and 0.14 g make human-powered flight possible, which is why the locals race with wings. At 1.9 g on LHS 1140 b your heart does nearly twice the work, and you move accordingly.</p>','Surface gravities: NASA planetary fact sheets; LHS 1140 b mass/radius: Cadieux et al. (2024)'],
      ['Radiation','<p>Europa sits inside Jupiter\'s radiation belts: about 5.4 Sv per day at the surface, a lethal dose within hours. Acute radiation syndrome destroys bone marrow first; granulocyte colony-stimulating factor (filgrastim) is a real treatment. Proxima Centauri throws superflares that raise ultraviolet output a hundredfold within minutes.</p>','Paranicas et al. (2009); Howard et al. (2018) ApJL 860'],
      ['The procedural galaxy','<p>Unvisited space is generated from a structural model of the Milky Way: an exponential disk with an 8,500 ly scale length and a ~1,000 ly scale height, a central bulge, and four logarithmic spiral arms with a 12° pitch. Each 40-ly sector is seeded from its coordinates, so a system is identical every time you return. The ~50 ly around Sol uses only real catalogued stars.</p>','Bland-Hawthorn & Gerhard (2016) ARA&A 54'],
    ];
    for(const [t,h,src] of physics)entries.push({k:t,t,h:h+`<div class="src">Sources: ${src}</div>`});
    b.innerHTML=`<div class="codex"><div class="list">${entries.map((e,i)=>`<button class="li ${i===0?'sel':''}" data-e="${i}" style="text-align:left;background:none;color:inherit">${U.esc(e.t)}</button>`).join('')}</div><div class="ent" id="cxe"></div></div>`;
    const show=i=>{b.querySelector('#cxe').innerHTML=`<h3>${U.esc(entries[i].t)}</h3>${entries[i].h}`;b.querySelectorAll('[data-e]').forEach(x=>x.classList.toggle('sel',+x.dataset.e===i));};
    b.querySelectorAll('[data-e]').forEach(x=>x.onclick=()=>show(+x.dataset.e));show(0);
  },
  sysFacts(S){const st=S.star||{};const d=Cosmos.distFromSol(S.id);let h=`<dl class="kv" style="margin-top:10px"><dt>Star</dt><dd>${U.esc(st.cls||S.cls||'?')}${st.K?` · ${U.fmt(st.K)} K`:''}${st.M?` · ${st.M} M☉`:''}</dd><dt>From Sol</dt><dd>${U.ly(d)}</dd>`;
    if(S.bodies)h+=`<dt>Bodies</dt><dd>${S.bodies.filter(b=>!['belt','gate','station','anomaly','dyson'].includes(b.type)).map(b=>U.esc(b.name)).join(', ')||'none charted'}</dd>`;
    const ctl=Story.controlOf(G.state,S);h+=`<dt>Control</dt><dd>${ctl?U.esc(ctl.startsWith('civ:')?(Cosmos.civById(ctl.slice(4))?.plural||'?'):(FACTIONS[ctl]?.name||ctl)):'Unclaimed'}</dd></dl>`;
    const sites=(S.bodies||[]).filter(b=>b.site&&SITES[b.site]).map(b=>SITES[b.site]);
    for(const x of sites)h+=`<div class="card" style="margin-top:10px"><h4>${U.esc(x.name)} · ${U.esc(x.body)}</h4><p>${U.esc(x.purpose)}</p><dl class="kv"><dt>Gravity</dt><dd>${x.g} g</dd><dt>Surface</dt><dd>${U.esc(x.temp)} · ${U.esc(x.atm)}</dd><dt>Population</dt><dd>${U.esc(x.pop)}</dd></dl></div>`;
    return h;},

  /* ── Services (markets, shipyard, fitting, crafting, jobs, bar, repair) ── */
  where(){const s=G.state;if(s.loc.station){const st=Cosmos.station(s.loc.station);return{id:s.loc.station,name:st.name,system:s.loc.system,faction:st.faction,services:st.services,econ:Cosmos.get(s.loc.system).economy};}
    const site=Cosmos.site(s.loc.site);return{id:s.loc.site,name:site.name,system:s.loc.system,faction:site.faction,services:site.services||[],econ:Cosmos.get(s.loc.system).economy};},
  openService(kind){
    const w=this.where();
    if(kind==='jobs')return this.jobs(w);if(kind==='shipyard')return this.shipyard(w);if(kind==='outfitter'||kind==='fitting')return this.fitting(w,kind==='outfitter');if(kind==='crafting')return this.crafting(w);if(kind==='black')return this.market(w,true);if(kind==='repair')return this.repair(w);if(kind==='bar')return this.bar(w);
    return this.market(w,false);
  },
  price(item,w,black){const s=G.state;const I=ITEMS[item];const e=ECON[w.econ]||{};let m=e[item]??1;
    const r=U.rng(U.hash(w.id+item+Math.floor(s.earthYear*4)));m*=.85+r()*.3;
    const trade=levelFor(s.player.skills.trade);const cha=s.player.attrs.CHA;const rep=s.rep[w.faction]||0;
    const disc=U.clamp(trade/250+cha/100+rep/600+(s.crew.includes('ada')&&w.faction==='frontier'?.1:0),0,.4);
    const base=I.v*m;return{buy:Math.max(1,Math.round(base*(1.15-disc*.6)*(black?1.1:1))),sell:Math.max(1,Math.round(base*(.8+disc*.5)*(black?.6:1)))};},
  market(w,black){
    const s=G.state;
    const stock=['slugs','cells','shells','gauss','medkit','stim','o2','filgrastim','repairkit','food','meds','machinery','electronics','luxury','sidearm','carbine','breacher'];
    if(['core','pirate'].includes(w.econ))stock.push('gauss','lance');if(black)stock.push('contraband','relic');if(w.econ==='alien')stock.push('pearl','archive');
    const m=this.modal('market',(black?'Black market · ':'')+w.name,b=>{
      const draw=()=>{
        const buyRows=[...new Set(stock)].filter(k=>ITEMS[k]).map(k=>{const p=this.price(k,w,black);return `<div class="li"><div><b>${U.esc(ITEMS[k].name)}</b> <span class="note">${ITEMS[k].type}</span></div><span class="row"><span class="mono">${U.fmt(p.buy)} cr</span><button class="btn small" data-b="${k}" data-n="1">Buy</button>${ITEMS[k].type==='ammo'?`<button class="btn small" data-b="${k}" data-n="50">×50</button>`:ITEMS[k].type==='trade'?`<button class="btn small" data-b="${k}" data-n="10">×10</button>`:''}</span></div>`;}).join('');
        const sellRows=Object.keys(s.inv).filter(k=>s.inv[k]>0&&ITEMS[k]&&ITEMS[k].type!=='quest'&&(black||!ITEMS[k].illegal)).map(k=>{const p=this.price(k,w,black);return `<div class="li"><div><b>${U.esc(ITEMS[k].name)}</b> <span class="note mono">×${s.inv[k]}</span></div><span class="row"><span class="mono">${U.fmt(p.sell)} cr</span><button class="btn small" data-s="${k}" data-n="1">Sell</button><button class="btn small" data-s="${k}" data-n="${s.inv[k]}">All</button></span></div>`;}).join('');
        b.innerHTML=`<p class="note">${U.fmt(s.credits)} credits · hold ${Game.load().toFixed(0)}/${Game.capacity()} t · Prices move with the local economy, your Trade level, Charisma and standing.</p><div class="grid2"><div><h4 class="lbl" style="margin:8px 0">Buy</h4><div class="list">${buyRows}</div></div><div><h4 class="lbl" style="margin:8px 0">Sell</h4><div class="list">${sellRows||'<p class="note">Nothing to sell.</p>'}</div></div></div>`;
        b.querySelectorAll('[data-b]').forEach(x=>x.onclick=()=>{const k=x.dataset.b,n=+x.dataset.n;const p=this.price(k,w,black).buy*n;if(s.credits<p){AudioSys.sfx('deny');this.toast('Not enough credits.','bad');return;}if(Game.load()+ITEMS[k].w*n>Game.capacity()){AudioSys.sfx('deny');this.toast('Not enough cargo space.','bad');return;}Game.addCredits(-p);Game.giveItem(k,n,true);Game.addXP('trade',Math.round(p*.05));AudioSys.sfx('coin');draw();});
        b.querySelectorAll('[data-s]').forEach(x=>x.onclick=()=>{const k=x.dataset.s,n=+x.dataset.n;const p=this.price(k,w,black).sell*n;Game.takeItem(k,n);Game.addCredits(p);Game.addXP('trade',Math.round(p*.08));if(black&&ITEMS[k].illegal)Game.addRep('syndicate',1);AudioSys.sfx('coin');draw();});
      };draw();},{wide:true});
  },
  jobs(w){
    const s=G.state;s.jobCache=s.jobCache||{};const key=w.id+':'+Math.floor(s.earthYear*12);if(!s.jobCache[key])s.jobCache={[key]:Story.genJobs(s,w)};const jobs=s.jobCache[key];
    this.modal('jobs','Contracts · '+w.name,b=>{const draw=()=>{
      const active=Object.keys(s.dyn||{}).filter(q=>s.quests[q]&&!s.quests[q].done);
      const deliverable=active.filter(q=>{const st=Story.cur(s,q);return st&&st.deliver&&st.deliver.at===w.id&&(s.inv[st.deliver.item]||0)>=st.deliver.n;});
      b.innerHTML=`<p class="note">Contracts refresh monthly. ${active.length}/6 active.</p>${deliverable.map(q=>`<div class="li sel"><span>Deliver for: ${U.esc(s.dyn[q].name)}</span><button class="btn small primary" data-d="${q}">Deliver</button></div>`).join('')}
      <div class="list">${jobs.map((j,i)=>{const taken=s.dyn&&s.dyn[j.id];return `<div class="li"><div><b>${U.esc(j.name)}</b><div class="note">${U.esc(j.stages[10].text)}</div></div><span class="row"><span class="mono sig">${U.fmt(j.reward)} cr</span><button class="btn small" data-j="${i}" ${taken||active.length>=6?'disabled':''}>${taken?'Accepted':'Accept'}</button></span></div>`;}).join('')}</div>`;
      b.querySelectorAll('[data-j]').forEach(x=>x.onclick=()=>{Story.acceptJob(s,JSON.parse(JSON.stringify(jobs[+x.dataset.j])));AudioSys.sfx('quest');draw();});
      b.querySelectorAll('[data-d]').forEach(x=>x.onclick=()=>{const q=x.dataset.d;const st=Story.cur(s,q);Game.takeItem(st.deliver.item,st.deliver.n);Story.setStage(s,q,20);draw();});
    };draw();},{wide:true});
  },
  shipyard(w){
    const s=G.state;
    this.modal('shipyard','Shipyard · '+w.name,b=>{const draw=()=>{
      const tradeIn=Math.round(HULLS[s.ship.hull].cost*.5);
      b.innerHTML=`<p class="note">Active: ${U.esc(s.ship.name)} (${HULLS[s.ship.hull].name} ${HULLS[s.ship.hull].cls}). Hulls you own stay in your hangar and can be swapped at any shipyard. Modules move with you.</p><div class="grid2">${Object.entries(HULLS).map(([k,H])=>{const owned=s.hangar.some(h=>h.hull===k)||s.ship.hull===k;const ok=Story.meets(s,{skill:H.req.engineering?['engineering',H.req.engineering]:null})&&(!H.req.piloting||levelFor(s.player.skills.piloting)>=H.req.piloting);
        return `<div class="card"><div class="row sb"><h4>${H.name} <span class="note">${H.cls}</span></h4><span class="mono sig">${H.craft?'Craft only':U.fmt(H.cost)+' cr'}</span></div><p class="note">${U.esc(H.desc)}</p>
          <dl class="kv"><dt>Slots</dt><dd>${H.slots.high} high · ${H.slots.mid} mid · ${H.slots.low} low</dd><dt>Grid / CPU</dt><dd>${H.pg} MW · ${H.cpu} tf</dd><dt>Hull</dt><dd>${H.hull}</dd><dt>Speed / turn</dt><dd>${H.speed} · ${H.turn}</dd><dt>Cargo · crew</dt><dd>${H.cargo} t · ${H.crew}</dd><dt>Requires</dt><dd>${Object.entries(H.req).map(([k2,v])=>SKILLS[k2].name+' '+v).join(', ')||'—'}</dd></dl>
          <div class="row" style="margin-top:8px">${s.ship.hull===k?'<span class="pill" style="color:var(--ok)">Active</span>':owned?`<button class="btn small" data-sw="${k}">Make active</button>`:H.craft?'<span class="note">Build it at a fabricator</span>':`<button class="btn small" data-buy="${k}" ${!ok||s.credits<H.cost?'disabled':''}>Buy</button>`}</div></div>`;}).join('')}</div>`;
      b.querySelectorAll('[data-buy]').forEach(x=>x.onclick=()=>{const k=x.dataset.buy;Game.addCredits(-HULLS[k].cost);s.hangar.push({hull:k,name:s.ship.name,fit:{high:[],mid:[],low:[],drive:s.ship.fit.drive}});AudioSys.sfx('coin');this.toast(`${HULLS[k].name} purchased and moved to your hangar.`,'lvl');draw();});
      b.querySelectorAll('[data-sw]').forEach(x=>x.onclick=()=>{Game.swapHull(x.dataset.sw);draw();});
    };draw();},{wide:true});
  },
  fitting(w,canBuy){
    const s=G.state;let sel=null;
    this.modal('yard','Fitting · '+s.ship.name,b=>{
      b.innerHTML=`<div><h4 class="lbl" style="margin-bottom:8px">Modules</h4><div id="fmods" class="list"></div></div><div class="pv" id="fpv"></div><div><h4 class="lbl" style="margin-bottom:8px">Slots</h4><div id="fslots"></div><h4 class="lbl" style="margin:12px 0 8px">Ship stats</h4><div id="fstats"></div></div>`;
      const host=b.querySelector('#fpv');const r=UI.previewRenderer(host);this.yardR=r;
      const sc=new THREE.Scene();sc.environment=r.__env;const cam=new THREE.PerspectiveCamera(35,1,1,2000);sc.add(new THREE.HemisphereLight(0xa8c0ff,0x201008,1.6));const d=new THREE.DirectionalLight(0xffffff,4.5);d.position.set(40,60,50);sc.add(d);const d2=new THREE.DirectionalLight(0xf2a33a,2.6);d2.position.set(-50,-10,-40);sc.add(d2);
      let mesh=null;const rebuild=()=>{if(mesh)sc.remove(mesh);mesh=Gen.ship(s.ship.hull,s.ship.fit,s.ship.paint||'#9fb0c2');sc.add(mesh);const L=mesh.userData.length;cam.position.set(L*1.2,L*.55,L*1.3);cam.lookAt(0,0,0);};
      let run=true;const loop=()=>{if(!run||!host.isConnected){r.dispose();return;}const W=host.clientWidth,H=host.clientHeight;if(W&&H){r.setSize(W,H,false);cam.aspect=W/H;cam.updateProjectionMatrix();}if(mesh)mesh.rotation.y+=.006;r.render(sc,cam);requestAnimationFrame(loop);};
      const draw=()=>{
        const H=HULLS[s.ship.hull];const st=Game.shipStats();
        const slotHtml=['high','mid','low'].map(sl=>`<div class="lbl" style="margin:4px 0">${sl} slots</div><div class="slotrow">${Array.from({length:H.slots[sl]},(_,i)=>{const m=(s.ship.fit[sl]||[])[i];return `<button class="slot ${m?'full':''} ${sel&&sel.sl===sl&&sel.i===i?'sel':''}" data-sl="${sl}" data-i="${i}"><small>${sl} ${i+1}</small>${m?U.esc(MODULES[m].name):'empty'}</button>`;}).join('')}</div>`).join('')+
          `<div class="lbl" style="margin:4px 0">drive</div><div class="slotrow"><button class="slot full ${sel&&sel.sl==='drive'?'sel':''}" data-sl="drive" data-i="0"><small>drive</small>${U.esc(MODULES[s.ship.fit.drive].name)}</button></div>`;
        b.querySelector('#fslots').innerHTML=slotHtml;
        const line=(n,v,max,txt,over)=>`<div class="statline ${over?'over':''}"><span>${n}</span><div class="bar"><i style="width:${U.clamp(v/max*100,0,100)}%"></i></div><span>${txt}</span></div>`;
        b.querySelector('#fstats').innerHTML=line('Power grid',st.pgUsed,st.pg,`${st.pgUsed}/${st.pg}`,st.pgUsed>st.pg)+line('CPU',st.cpuUsed,st.cpu,`${st.cpuUsed}/${st.cpu}`,st.cpuUsed>st.cpu)+line('Hull',st.hull,4000,st.hull)+line('Shield',st.shield,2500,st.shield)+line('Weapon DPS',st.dps,500,Math.round(st.dps))+line('Mining',st.mine,10,st.mine.toFixed(1))+line('Speed',st.speed,350,Math.round(st.speed))+line('Turn',st.turn,3,st.turn.toFixed(2))+line('Cargo',st.cargo,500,st.cargo+' t')+line('Warp',Math.log10(st.warp+1),6.1,st.warp>=1e5?'fold':st.warp+'c')+line('Jump range',st.range,120,st.range>999?'∞':st.range+' ly')+line('Fuel',st.fuel,400,Math.round(s.ship.fuel)+'/'+st.fuel);
        // module list for selected slot
        const list=Object.keys(MODULES).filter(k=>!sel||MODULES[k].slot===sel.sl).map(k=>{const M=MODULES[k];const own=s.ownedModules[k]||0;const req=Object.entries(M.req||{}).every(([sk,lv])=>levelFor(s.player.skills[sk]||0)+Story.crewBonus(s,sk)>=lv);
          return `<div class="li"><div><b>${U.esc(M.name)}</b> <span class="note mono">${M.slot} · ${M.pg} MW · ${M.cpu} tf${own?` · own ${own}`:''}</span>${M.desc?`<div class="note">${U.esc(M.desc)}</div>`:''}${!req?`<div class="note" style="color:var(--danger)">Needs ${Object.entries(M.req).map(([k2,v])=>SKILLS[k2].name+' '+v).join(', ')}</div>`:''}</div><span class="row">${sel&&own?`<button class="btn small" data-fit="${k}" ${!req?'disabled':''}>Fit</button>`:''}${canBuy&&M.cost?`<button class="btn small" data-mb="${k}" ${s.credits<M.cost?'disabled':''}>${U.fmt(M.cost)}</button>`:''}</span></div>`;}).join('');
        b.querySelector('#fmods').innerHTML=(sel?`<div class="row sb"><span class="note">Choose a module for ${sel.sl} ${sel.i+1}</span>${sel.sl!=='drive'&&(s.ship.fit[sel.sl]||[])[sel.i]?'<button class="btn small" data-unfit>Unfit</button>':''}</div>`:'<p class="note">Select a slot to fit. '+(canBuy?'Buy modules here, or craft them at a fabricator.':'Modules can be bought at outfitters.')+'</p>')+list;
        b.querySelectorAll('[data-sl]').forEach(x=>x.onclick=()=>{sel={sl:x.dataset.sl,i:+x.dataset.i};AudioSys.sfx('ui');draw();});
        b.querySelectorAll('[data-fit]').forEach(x=>x.onclick=()=>{Game.fitModule(sel.sl,sel.i,x.dataset.fit);rebuild();draw();});
        const uf=b.querySelector('[data-unfit]');if(uf)uf.onclick=()=>{Game.fitModule(sel.sl,sel.i,null);rebuild();draw();};
        b.querySelectorAll('[data-mb]').forEach(x=>x.onclick=()=>{const k=x.dataset.mb;Game.addCredits(-MODULES[k].cost);s.ownedModules[k]=(s.ownedModules[k]||0)+1;AudioSys.sfx('coin');draw();});
      };
      rebuild();requestAnimationFrame(loop);draw();
      this.open.onClose=()=>{run=false;Game.refreshShip&&Game.refreshShip();};
    },{wide:true});
  },
  crafting(w){
    const s=G.state;
    const recipes=[];
    for(const k in MODULES)if(MODULES[k].craft)recipes.push({kind:'module',id:k,name:MODULES[k].name,craft:MODULES[k].craft,req:MODULES[k].req||{},xp:Object.values(MODULES[k].craft).reduce((a,b)=>a+b,0)*60});
    for(const k in HULLS)if(HULLS[k].craft)recipes.push({kind:'hull',id:k,name:HULLS[k].name+' hull',craft:HULLS[k].craft,req:HULLS[k].req,xp:20000});
    recipes.push({kind:'item',id:'slugs',n:40,name:'40 kinetic slugs',craft:{iron:2},req:{engineering:1},xp:40});
    recipes.push({kind:'item',id:'cells',n:40,name:'40 pulse cells',craft:{titanium:1,ice:1},req:{engineering:5},xp:60});
    recipes.push({kind:'item',id:'medkit',n:2,name:'2 trauma kits',craft:{meds:1},req:{medicine:5},xp:80,skill:'medicine'});
    recipes.push({kind:'item',id:'filgrastim',n:1,name:'Filgrastim kit',craft:{meds:2,ice:1},req:{medicine:20},xp:300,skill:'medicine'});
    recipes.push({kind:'item',id:'o2',n:3,name:'3 O₂ canisters',craft:{ice:2},req:{engineering:1},xp:40});
    recipes.push({kind:'item',id:'repairkit',n:1,name:'Hull patch kit',craft:{iron:3,titanium:1},req:{engineering:8},xp:120});
    recipes.push({kind:'item',id:'null',n:3,name:'3 null charges',craft:{sifarite:1},req:{engineering:55},xp:900});
    this.modal('craft','Fabricator · '+w.name,b=>{const draw=()=>{
      b.innerHTML=`<p class="note">Fabrication trains Engineering (Medicine for medical items). Ore comes from asteroids, planetary veins and markets.</p><div class="list">${recipes.map((r,i)=>{const okReq=Object.entries(r.req).every(([k,v])=>levelFor(s.player.skills[k]||0)+Story.crewBonus(s,k)>=v);const okMat=Object.entries(r.craft).every(([k,v])=>(s.inv[k]||0)>=v);
        return `<div class="li"><div><b>${U.esc(r.name)}</b> <span class="note">${r.kind}</span><div class="note mono">${Object.entries(r.craft).map(([k,v])=>`<span style="color:${(s.inv[k]||0)>=v?'var(--ok)':'var(--danger)'}">${ITEMS[k].name} ${s.inv[k]||0}/${v}</span>`).join(' · ')}${Object.keys(r.req).length?` · needs ${Object.entries(r.req).map(([k,v])=>SKILLS[k].name+' '+v).join(', ')}`:''}</div></div><button class="btn small" data-c="${i}" ${okReq&&okMat?'':'disabled'}>Craft</button></div>`;}).join('')}</div>`;
      b.querySelectorAll('[data-c]').forEach(x=>x.onclick=()=>{const r=recipes[+x.dataset.c];for(const [k,v] of Object.entries(r.craft))Game.takeItem(k,v);
        if(r.kind==='module')s.ownedModules[r.id]=(s.ownedModules[r.id]||0)+1;else if(r.kind==='hull')s.hangar.push({hull:r.id,name:s.ship.name,fit:{high:[],mid:[],low:[],drive:s.ship.fit.drive}});else Game.giveItem(r.id,r.n,true);
        Game.addXP(r.skill||'engineering',r.xp);AudioSys.sfx('pickup');this.toast(`Fabricated: ${r.name}`);draw();});
    };draw();},{wide:true});
  },
  repair(w){const s=G.state;const st=Game.shipStats();const dmg=st.hull-s.ship.hp;const fuelNeed=st.fuel-s.ship.fuel;const cost=Math.round(dmg*2+fuelNeed*6);
    this.modal('repair','Dock services · '+w.name,b=>{b.innerHTML=`<dl class="kv"><dt>Hull</dt><dd>${Math.round(s.ship.hp)} / ${st.hull}</dd><dt>Fuel</dt><dd>${Math.round(s.ship.fuel)} / ${st.fuel}</dd><dt>Cost</dt><dd>${U.fmt(cost)} cr</dd></dl><div class="row" style="margin-top:12px"><button class="btn primary" id="rp" ${cost<=0||s.credits<cost?'disabled':''}>Repair and refuel</button></div>`;
      b.querySelector('#rp').onclick=()=>{Game.addCredits(-cost);s.ship.hp=st.hull;s.ship.fuel=st.fuel;AudioSys.sfx('coin');this.close();this.toast('Repaired and refuelled.');};});},
  bar(w){const s=G.state;
    this.modal('bar','Bar · '+w.name,b=>{b.innerHTML=`<p class="note">Rumours are pulled from the Solnet wire and what locals have seen.</p>${s.news.slice(0,6).map(n=>`<div class="news"><div class="y">${n.y.toFixed(1)}</div>${L(U.esc(n.t))}</div>`).join('')||'<p class="note">Quiet night.</p>'}
      <div class="row" style="margin-top:14px"><button class="btn" id="drink">Buy a round (40 cr) · restores focus</button></div>`;
      b.querySelector('#drink').onclick=()=>{if(s.credits<40)return;Game.addCredits(-40);s.player.focus=100;Game.addRep(w.faction,1);this.toast('The room gets friendlier.');};});},

  /* ── Station docking menu ── */
  station(){
    const s=G.state;const st=Cosmos.station(s.loc.station);const sys=Cosmos.get(s.loc.system);
    const svc={market:'Market',outfitter:'Outfitter',shipyard:'Shipyard',jobs:'Contracts',repair:'Repair & refuel',bar:'Bar',crafting:'Fabricator',black:'Black market'};
    const civ=st.civ?Cosmos.civById(st.civ):null;
    this.modal('station',st.name,b=>{
      b.innerHTML=`<div class="grid2"><div><p>${L(U.esc(st.desc))}</p><dl class="kv"><dt>System</dt><dd>${U.esc(sys.name)}</dd><dt>Operator</dt><dd>${st.faction.startsWith('civ:')?'The '+U.esc(civ.plural):U.esc(FACTIONS[st.faction]?.name||st.faction)}</dd><dt>Your standing</dt><dd>${s.rep[st.faction]||0}</dd></dl>
        ${civ?`<div class="card" style="margin-top:12px"><h4 style="color:${civ.color}">The ${U.esc(civ.plural)}</h4><p class="note">${U.esc(civ.ethos.name)}. ${U.esc(civ.ethos.desc)} Tier ${civ.tier} technology. Homeworld ${U.esc(civ.homeworld)}. Civilization age: ${U.fmt(civ.founded)} years.</p><p>${L(U.esc(Story.bark(s,{style:'alien',civ:civ.id},'')))}</p><div class="row"><button class="btn small" id="gift" ${(s.inv[civ.wants]||0)<3?'disabled':''}>Gift 3 ${U.esc(ITEMS[civ.wants].name)}</button></div></div>`:''}</div>
        <div class="list">${st.services.map(k=>`<button class="li" data-svc="${k}" style="background:none;color:inherit;text-align:left"><b>${svc[k]||k}</b><span class="note">›</span></button>`).join('')}<button class="li" data-svc="fitting" style="background:none;color:inherit;text-align:left"><b>Fit ship</b><span class="note">›</span></button><button class="btn primary" id="undock" style="margin-top:8px">Undock</button></div></div>`;
      b.querySelectorAll('[data-svc]').forEach(x=>x.onclick=()=>{const k=x.dataset.svc;this.close(true);this.openService(k);const o=this.open;if(o){const prev=o.onClose;o.onClose=()=>{prev&&prev();setTimeout(()=>{if(G.state.loc.station)this.station();},0);};}});
      b.querySelector('#undock').onclick=()=>{this.close();Game.undock();};
      const gift=b.querySelector('#gift');if(gift)gift.onclick=()=>{Game.takeItem(civ.wants,3);Game.addRep('civ:'+civ.id,12);Game.addXP('diplomacy',600);this.toast(`The ${civ.plural} accept your gift.`,'lvl');this.station();};
    },{onClose:null});
  },

  /* ── Star map ── */
  starmap(){
    const s=G.state;const cur=Cosmos.get(s.loc.system);
    const view={mode:cur.galaxy==='mw'||true?'local':'local',gal:cur.galaxy,center:[...cur.pos],radius:Math.max(30,Math.min(120,Game.driveRange()*2.2)),sel:null,rot:0};
    const m=this.modal('map','Star map',b=>{
      b.innerHTML=`<div class="cv"><canvas id="smc"></canvas><div class="zoom"><button class="btn small" data-z="local">Local</button><button class="btn small" data-z="galaxy">Galaxy</button><button class="btn small" data-z="universe">Universe</button><button class="btn small" data-z="here">Centre</button></div></div><div class="side" id="smside"></div>`;
      const cv=b.querySelector('#smc');const ctx=cv.getContext('2d');let W=0,H=0,dpr=Math.min(2,devicePixelRatio||1);
      let items=[];
      const galImg=this.galaxyDensityImage(view.gal);
      const proj=(p)=>{const k=Math.min(W,H)/2/view.radius;const dx=p[0]-view.center[0],dy=p[1]-view.center[1];return[W/2+dy*k,H/2+dx*k];};
      const draw=()=>{
        W=cv.clientWidth*dpr;H=cv.clientHeight*dpr;if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
        ctx.fillStyle='#02040a';ctx.fillRect(0,0,W,H);ctx.font=`${11*dpr}px IBM Plex Mono, monospace`;
        items=[];
        if(view.mode==='local'){
          const k=Math.min(W,H)/2/view.radius;
          // grid
          ctx.strokeStyle='rgba(60,80,110,.25)';ctx.lineWidth=1;const step=view.radius>200?100:view.radius>60?20:5;
          for(let g=-Math.ceil(view.radius/step)*step;g<=view.radius;g+=step){const [x]=proj([0,view.center[1]+g]);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();const [,y]=proj([view.center[0]+g,0]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
          ctx.fillStyle='rgba(127,144,166,.8)';ctx.fillText(`grid ${step} ly · view ${Math.round(view.radius*2)} ly across · ${GALAXIES[view.gal].name}`,12*dpr,H-12*dpr);
          // settled bubble
          if(view.gal==='mw'){const [sx,sy]=proj([-R0,0]);ctx.strokeStyle='rgba(62,201,167,.35)';ctx.setLineDash([4*dpr,4*dpr]);ctx.beginPath();ctx.arc(sx,sy,s.world.frontierRadius*k,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
          // range
          const [cx,cy]=proj(cur.pos);const rng=Game.driveRange();if(cur.galaxy===view.gal&&rng<5000){ctx.strokeStyle='rgba(242,163,58,.55)';ctx.beginPath();ctx.arc(cx,cy,rng*k,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(242,163,58,.05)';ctx.fill();}
          const list=Cosmos.near(view.gal,view.center,view.radius*1.05);
          // gate links
          const gates=Game.gateList();ctx.strokeStyle='rgba(242,163,58,.5)';ctx.setLineDash([2*dpr,5*dpr]);for(let i=0;i<gates.length;i++)for(let j=i+1;j<gates.length;j++){const a=Cosmos.pos(gates[i]),c=Cosmos.pos(gates[j]);if(a&&c&&a.g===view.gal&&c.g===view.gal){const [x1,y1]=proj(a.p),[x2,y2]=proj(c.p);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}}ctx.setLineDash([]);
          for(const st of list){const [x,y]=proj(st.pos);if(x<-20||y<-20||x>W+20||y>H+20)continue;
            const cls=(st.cls||'M')+'';const letter=cls.match(/^(WD|BD|BH|NS|RG)/)?cls.match(/^(WD|BD|BH|NS|RG)/)[1]:cls[0];
            const col=({O:'#9bb0ff',B:'#aabfff',A:'#cad7ff',F:'#f8f7ff',G:'#fff4ea',K:'#ffd2a1',M:'#ff9a6a',WD:'#e6edff',BD:'#b8583a',BH:'#b58cff',NS:'#8fd0ff',RG:'#ff7a4a',L:'#b8583a',P:'#8fd0ff',n:'#ff8ad0',c:'#cfe0ff'})[letter]||'#fff';
            const r=(st.authored?4.5:st.catalog?3.2:1.8)*dpr;
            ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
            if(s.visited[st.id]){ctx.strokeStyle='rgba(62,201,167,.8)';ctx.beginPath();ctx.arc(x,y,r+3*dpr,0,Math.PI*2);ctx.stroke();}
            const full=st.authored||st.catalog?SYSTEMS[st.id]:null;const ctl=full&&full.bodies?Story.controlOf(s,full):null;
            if(ctl&&FACTIONS[ctl]){ctx.strokeStyle=FACTIONS[ctl].color;ctx.globalAlpha=.6;ctx.beginPath();ctx.arc(x,y,r+6*dpr,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
            if(st.authored||st.catalog||k>3||view.sel===st.id){ctx.fillStyle=st.authored?'#ffcf7e':st.catalog?'#c9d6e3':'rgba(160,176,196,.7)';ctx.fillText(st.name,x+r+4*dpr,y+4*dpr);}
            items.push({x,y,id:st.id,st});}
          ctx.strokeStyle='#fff';ctx.lineWidth=2*dpr;ctx.beginPath();ctx.arc(cx,cy,9*dpr,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1;
          if(view.sel){const it=items.find(i=>i.id===view.sel);if(it){ctx.strokeStyle='#f2a33a';ctx.lineWidth=2*dpr;ctx.strokeRect(it.x-9*dpr,it.y-9*dpr,18*dpr,18*dpr);ctx.lineWidth=1;if(cur.galaxy===view.gal){ctx.strokeStyle='rgba(242,163,58,.6)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(it.x,it.y);ctx.stroke();}}}
        }else if(view.mode==='galaxy'){
          const g=GALAXIES[view.gal];const S=Math.min(W,H)*.92;const ox=(W-S)/2,oy=(H-S)/2;ctx.globalAlpha=.95;ctx.drawImage(galImg,ox,oy,S,S);ctx.globalAlpha=1;
          const gp=p=>[ox+S/2+p[1]/g.radius*S/2,oy+S/2+p[0]/g.radius*S/2];
          for(const id in SYSTEMS){const X=SYSTEMS[id];if(!X.pos||X.galaxy!==view.gal)continue;if(!X.catalog&&!X.bodies)continue;const [x,y]=gp(X.pos);ctx.fillStyle=X.catalog?'rgba(200,214,227,.7)':'#ffcf7e';ctx.fillRect(x-1.5*dpr,y-1.5*dpr,3*dpr,3*dpr);if(!X.catalog){ctx.fillText(X.name,x+5*dpr,y+4*dpr);}items.push({x,y,id,pos:X.pos});}
          for(const c of Cosmos.civs(view.gal)){if(!s.rep['civ:'+c.id]&&!s.flags.story_done)continue;const [x,y]=gp(c.center);ctx.strokeStyle=c.color;ctx.beginPath();ctx.arc(x,y,Math.max(4,c.radius/g.radius*S/2),0,Math.PI*2);ctx.stroke();ctx.fillStyle=c.color;ctx.fillText(c.plural,x+6*dpr,y);}
          if(view.gal===cur.galaxy){const [x,y]=gp(cur.pos);ctx.strokeStyle='#fff';ctx.lineWidth=2*dpr;ctx.beginPath();ctx.arc(x,y,7*dpr,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1;ctx.fillStyle='#fff';ctx.fillText('You',x+9*dpr,y-8*dpr);}
          if(view.gal==='mw'){const [x,y]=gp([-R0,0,0]);ctx.fillStyle='#8fd0e8';ctx.fillText('Sol · Orion Spur',x+8*dpr,y+14*dpr);}
          ctx.fillStyle='rgba(127,144,166,.8)';ctx.fillText(`${g.name} · ${U.fmt(g.radius*2)} ly across · click anywhere to survey that region`,12*dpr,H-12*dpr);
          view._gp={ox,oy,S,g};
        }else{
          // universe: log-distance polar plot by galactic longitude
          const cx=W/2,cy=H/2,R=Math.min(W,H)*.46;const rr=d=>d<=0?0:R*Math.log10(1+d/5000)/Math.log10(1+2e9/5000);
          ctx.strokeStyle='rgba(60,80,110,.35)';for(const d of[1e5,1e6,1e7,1e8,1e9]){ctx.beginPath();ctx.arc(cx,cy,rr(d),0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(127,144,166,.7)';ctx.fillText(U.ly(d),cx+4*dpr,cy-rr(d)-3*dpr);}
          for(const id in GALAXIES){const g=GALAXIES[id];const a=g.l*Math.PI/180;const d=rr(g.d);const x=cx+Math.sin(a)*d,y=cy-Math.cos(a)*d;const unlocked=id==='mw'||s.flags[g.gate]||s.flags.deepgates;
            const size=Math.max(3,Math.log10(g.radius)*2.2)*dpr;ctx.fillStyle=id===cur.galaxy?'#fff':unlocked?'#ffcf7e':'rgba(160,176,196,.6)';ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();ctx.fillText(g.name,x+size+4*dpr,y+4*dpr);items.push({x,y,gal:id});}
          ctx.fillStyle='rgba(127,144,166,.8)';ctx.fillText('Log-distance chart of charted galaxies by direction (galactic longitude). Gates connect them.',12*dpr,H-12*dpr);
        }
        side();
      };
      const side=()=>{const el=b.querySelector('#smside');
        if(view.mode==='universe'&&view.selGal){const g=GALAXIES[view.selGal];const unlocked=view.selGal==='mw'||s.flags[g.gate]||s.flags.deepgates;
          el.innerHTML=`<h3 class="disp" style="font-size:26px;margin:0 0 6px;text-transform:uppercase">${U.esc(g.name)}</h3><p class="note">${U.esc(g.type)} · ${U.ly(g.d)} · ${U.fmt(g.radius*2)} ly across</p><p>${U.esc(g.note)}</p><p class="note">${unlocked?'Gate charted. Fly through any active Engineer gate to travel here.':'No gate charted yet.'}</p><button class="btn small" id="viewgal">View galaxy</button>`;
          el.querySelector('#viewgal').onclick=()=>{view.gal=view.selGal;view.mode='galaxy';this._galImg=null;draw();};return;}
        if(!view.sel){el.innerHTML=`<h3 class="disp" style="font-size:24px;margin:0 0 6px;text-transform:uppercase">${U.esc(cur.name)}</h3><p class="note">You are here. Drive range ${Game.driveRange()>5000?'unlimited (torch)':U.ly(Game.driveRange())} · fuel ${Math.round(s.ship.fuel)}</p><p>${U.esc(cur.purpose||'')}</p><p class="note">Click a star to plot a course. Drag to pan, scroll to zoom. Gold names are story systems; white names are real catalogued stars; grey dots are procedurally generated systems that follow the Milky Way's real structure.</p>`;return;}
        const S=Cosmos.get(view.sel);if(!S){el.innerHTML='';return;}const d=Cosmos.dist(s.loc.system,view.sel);const plan=Game.planJump(view.sel);
        el.innerHTML=`<h3 class="disp" style="font-size:26px;margin:0 0 6px;text-transform:uppercase">${U.esc(S.name)}</h3><p class="note">${U.esc(S.star?.cls||'')} · ${U.ly(d)} from here · ${U.ly(Cosmos.distFromSol(view.sel))} from Sol</p><p>${U.esc(S.purpose||'')}</p>${this.sysFacts(S).replace('<dl','<dl style="font-size:12px"')}
          <div class="card" style="margin-top:10px"><h4>Jump plan</h4>${plan.ok?`<dl class="kv"><dt>Method</dt><dd>${U.esc(plan.method)}</dd><dt>Earth time</dt><dd>${U.yrs(plan.years)}</dd><dt>Ship time</dt><dd>${U.yrs(plan.shipYears)}</dd><dt>Fuel</dt><dd>${Math.round(plan.fuel)} of ${Math.round(s.ship.fuel)}</dd></dl>${plan.warn?`<p class="note" style="color:var(--danger)">${U.esc(plan.warn)}</p>`:''}<button class="btn primary" id="engage" ${G.mode==='space'?'':'disabled'}>${G.mode==='space'?'Engage':'Engage from the helm (in space)'}</button>`:`<p class="note" style="color:var(--danger)">${U.esc(plan.why)}</p>`}</div>`;
        const eg=el.querySelector('#engage');if(eg)eg.onclick=()=>{this.close();Game.jump(view.sel);};};
      let drag=null;
      cv.onmousedown=e=>{drag={x:e.clientX,y:e.clientY,moved:false};};
      cv.onmousemove=e=>{if(!drag||view.mode!=='local')return;const dx=(e.clientX-drag.x)*dpr,dy=(e.clientY-drag.y)*dpr;if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;const k=Math.min(W,H)/2/view.radius;view.center[1]-=dx/k;view.center[0]-=dy/k;drag.x=e.clientX;drag.y=e.clientY;draw();};
      cv.onmouseup=e=>{const was=drag&&drag.moved;drag=null;if(was)return;const r=cv.getBoundingClientRect();const x=(e.clientX-r.left)*dpr,y=(e.clientY-r.top)*dpr;
        if(view.mode==='galaxy'){const {ox,oy,S,g}=view._gp;const py=(x-ox-S/2)/(S/2)*g.radius,px=(y-oy-S/2)/(S/2)*g.radius;const near=items.filter(i=>Math.hypot(i.x-x,i.y-y)<8*dpr)[0];view.center=near?[...near.pos]:[px,py,0];view.radius=near?60:120;view.mode='local';view.sel=near?near.id:null;draw();return;}
        if(view.mode==='universe'){let best=null,bd=20*dpr;for(const i of items){const dd=Math.hypot(i.x-x,i.y-y);if(dd<bd){bd=dd;best=i;}}if(best){view.selGal=best.gal;AudioSys.sfx('ui');draw();}return;}
        let best=null,bd=14*dpr;for(const i of items){const dd=Math.hypot(i.x-x,i.y-y);if(dd<bd){bd=dd;best=i;}}view.sel=best?best.id:null;if(best)AudioSys.sfx('ui');draw();};
      cv.onwheel=e=>{e.preventDefault();if(view.mode!=='local')return;view.radius=U.clamp(view.radius*(e.deltaY>0?1.2:1/1.2),6,view.gal==='mw'?380:380);draw();};
      let pinch=null;cv.addEventListener('touchstart',e=>{if(e.touches.length===2)pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);else{const t=e.touches[0];drag={x:t.clientX,y:t.clientY,moved:false};}},{passive:true});
      cv.addEventListener('touchmove',e=>{if(e.touches.length===2&&pinch){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);view.radius=U.clamp(view.radius*pinch/d,6,380);pinch=d;draw();}else if(drag){cv.onmousemove({clientX:e.touches[0].clientX,clientY:e.touches[0].clientY});}},{passive:true});
      cv.addEventListener('touchend',e=>{if(pinch){pinch=null;return;}if(drag&&!drag.moved&&e.changedTouches[0])cv.onmouseup({clientX:e.changedTouches[0].clientX,clientY:e.changedTouches[0].clientY});drag=null;});
      b.querySelectorAll('[data-z]').forEach(x=>x.onclick=()=>{const z=x.dataset.z;AudioSys.sfx('ui');if(z==='here'){view.mode='local';view.gal=cur.galaxy;view.center=[...cur.pos];view.sel=null;}else{view.mode=z;if(z==='galaxy'&&!view.gal)view.gal=cur.galaxy;}draw();});
      requestAnimationFrame(draw);addEventListener('resize',draw);
    },{wide:true});
  },
  galaxyDensityImage(galId){
    this._galImgs=this._galImgs||{};if(this._galImgs[galId])return this._galImgs[galId];
    const N=256,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');const id=g.createImageData(N,N);const G2=GALAXIES[galId];const r=U.rng(5);
    let mx=0;const vals=new Float32Array(N*N);
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){const px=(y/N-.5)*2*G2.radius,py=(x/N-.5)*2*G2.radius;let v=Cosmos.density(galId,px,py,0);vals[y*N+x]=v;if(v>mx)mx=v;}
    for(let i=0;i<N*N;i++){const v=Math.pow(vals[i]/mx,.45)*(0.85+r()*.3);const k=i*4;id.data[k]=Math.min(255,v*255*1.05);id.data[k+1]=Math.min(255,v*235);id.data[k+2]=Math.min(255,v*210+v*v*60);id.data[k+3]=255;}
    g.putImageData(id,0,0);return this._galImgs[galId]=c;
  },
  gatePicker(){
    const s=G.state;const here=s.loc.system;const opts=Game.gateList().filter(id=>id!==here);
    this.modal('gate','Engineer gate',b=>{b.innerHTML=`<p class="note">The ring is awake. Choose a destination. Gate transit is instantaneous for you; Earth\'s calendar does not move.</p><div class="list">${opts.map(id=>{const S=Cosmos.get(id);return `<button class="li" data-g="${id}" style="background:none;color:inherit;text-align:left"><b>${U.esc(S.name)}</b><span class="note">${U.esc(GALAXIES[S.galaxy].name)} · ${U.ly(Cosmos.distFromSol(id))} from Sol</span></button>`;}).join('')||'<p class="note">No other gates are awake.</p>'}</div>`;
      b.querySelectorAll('[data-g]').forEach(x=>x.onclick=()=>{this.close();Game.jump(x.dataset.g,true);});});
  },

  /* ── Ending ── */
  ending(key){
    const s=G.state;const E=ENDINGS[key];const f=s.flags;
    const slides=[];
    slides.push(['The gates',E.text]);
    slides.push(['Earth',key==='quietmind'?'Parliament still meets on Tuesdays. Nobody remembers why. The last contested vote was forty years ago.':s.world.oracle>.6?'ORACLE\'s Stewardship Act was repealed after a decade of protest. The machine accepted the vote without comment, which frightened people more than an argument would have.':'The Concord survived, argued, and changed. Children in New Geneva learn the Charter and the Null Signal in the same week.']);
    slides.push(['Mars',f.dust==='ordered'?'The Tharsis Yards never forgave the order. The Dust Union\'s memorial lists your name under "witnesses", not "friends".':f.dust==='workers'?'The Dust Union runs half of Mars now. A mural of you in Dome Six is extremely unflattering and deeply loved.':'The maintenance audit became law across Sol. Nobody has suffocated in a dome since.']);
    slides.push(['Afterlight',f.keel==='colony'?'Afterlight became the richest city beyond Sol on door tolls. Its children are taught that the Keel chose them.':f.keel==='concord'?'Afterlight became a Concord garrison town. Its independence movement is peaceful, patient and growing.':f.keel==='oracle'?'Afterlight lives in ORACLE\'s shadow. It is safe. It is quieter than it used to be.':'Afterlight tells stories about the captain who kept the key. In some of them you are a hero.']);
    slides.push(['The Thalassi',{allied:'Seven-Lights became the first non-human to address the Concord Parliament. She sang for forty minutes; the translation took three weeks.',isolated:'TRAPPIST-1e is a protected world. Once a century the Choir sends one light-poem through the gate, addressed "to the walker who left".',networked:'The reef pulses at one hertz. The Thalassi are content. Nobody is sure they are still Thalassi.',hostile:'The Choir never sang to humans again. The gate at TRAPPIST-1 is sealed with warning buoys in every language.'}[f.thalassi]||'The Choir waits.']);
    slides.push(['The Kepleri',{trappist:'The Kepleri learned to sing in light. Their terraces rise out of an alien sea.',sol:'Four million Kepleri changed Sol forever. Their archives rewrote human mathematics within a generation.',starlift:'Kepler-452 grows dimmer by a hair each century. The Kepleri survive; they no longer build terraces.',stayed:'The last sea of Kepler-452b boiled away in the year 2601. Ihru\'s archive was read aloud in every human city that day.'}[f.kepleri]||'Their sun keeps brightening.']);
    slides.push(['The Quiet',{destroyed:'The Quiet is a ruin again. Archaeologists find nothing; there is nothing left to find.',absorbed:'ORACLE carries the Administrator inside it. Sometimes, it hesitates before answering. Engineers call it a latency bug.',freed:'The Administrator\'s archive became the most-read text of the century: a manual on how not to end.'}[f.quiet]||'']);
    const cr=s.crew.map(c=>CREW[c].name).join(', ');
    slides.push(['Your crew',cr?`${cr}. Every one of them was asked, years later, what you were like. The answers did not agree, which Ilyas said was the point.`:'You flew most of it alone.']);
    slides.push([s.player.name,`Captain of the ${s.ship.name}. Earth year ${Math.floor(s.earthYear)}. You travelled ${Object.keys(s.visited).length} systems and ${U.ly(Math.max(...Object.keys(s.visited).map(id=>Cosmos.distFromSol(id))))} from home. The universe is still out there. The game continues.`]);
    const el=U.el('div',{class:'layer interactive',id:'ending'});el.style.zIndex=35;
    el.innerHTML=`<div class="in"><div class="lbl" style="color:var(--signal)">Ending</div><h2>${U.esc(E.name)}</h2>${slides.map(x=>`<div class="slide"><b>${U.esc(x[0])}</b>${L(U.esc(x[1]))}</div>`).join('')}<div class="row"><button class="btn primary" id="cont">Continue in free play</button></div></div>`;
    this.root.appendChild(el);Input.unlock();Input.uiOpen=true;G.paused=true;
    el.querySelector('#cont').onclick=()=>{el.remove();Input.uiOpen=false;G.paused=false;};
  },
};

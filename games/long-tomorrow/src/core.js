/* ═══════════════════════════════════════════════════════════════════════
   THE LONG TOMORROW · core: utilities, noise, input, audio, persistence
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const U = {
  clamp:(x,a,b)=>x<a?a:x>b?b:x,
  lerp:(a,b,t)=>a+(b-a)*t,
  smooth:(a,b,x)=>{const t=U.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);},
  damp:(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt)),
  angDiff:(a,b)=>{let d=(b-a)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return d;},
  rng(seed){let s=(seed>>>0)||1;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};},
  hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;},
  pick:(r,arr)=>arr[Math.floor(r()*arr.length)],
  fmt:(n,d=0)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}),
  ly:(n)=>n>=1e6?(n/1e6).toFixed(2)+' Mly':n>=1000?U.fmt(n)+' ly':n.toFixed(n<10?2:1)+' ly',
  yrs:(y)=>{if(y<1/365)return Math.max(1,Math.round(y*365*24))+' h';if(y<0.25)return Math.round(y*365)+' days';return y.toFixed(y<10?2:1)+' yr';},
  esc:(s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  el(tag,attrs,html){const e=document.createElement(tag);if(attrs)for(const k in attrs){if(k==='class')e.className=attrs[k];else if(k==='style')e.style.cssText=attrs[k];else if(k.startsWith('on'))e.addEventListener(k.slice(2),attrs[k]);else e.setAttribute(k,attrs[k]);}if(html!=null)e.innerHTML=html;return e;},
  $:(s)=>document.querySelector(s),
  weighted(r,list){let t=0;for(const x of list)t+=x.w;let v=r()*t;for(const x of list){v-=x.w;if(v<=0)return x;}return list[list.length-1];},
  hex:(c)=>new THREE.Color(c),
};

/* ── Simplex noise 2D/3D (after Gustavson, public domain) ── */
function makeNoise(seed){
  const r=U.rng(seed);const p=new Uint8Array(256);for(let i=0;i<256;i++)p[i]=i;
  for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1));[p[i],p[j]]=[p[j],p[i]];}
  const perm=new Uint8Array(512),pm12=new Uint8Array(512);
  for(let i=0;i<512;i++){perm[i]=p[i&255];pm12[i]=perm[i]%12;}
  const g3=[1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1];
  const F2=.5*(Math.sqrt(3)-1),G2=(3-Math.sqrt(3))/6,F3=1/3,G3=1/6;
  function n2(xin,yin){
    let n0=0,n1=0,n2=0;const s=(xin+yin)*F2;const i=Math.floor(xin+s),j=Math.floor(yin+s);const t=(i+j)*G2;
    const x0=xin-(i-t),y0=yin-(j-t);const i1=x0>y0?1:0,j1=x0>y0?0:1;
    const x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2;const ii=i&255,jj=j&255;
    let t0=.5-x0*x0-y0*y0;if(t0>=0){const gi=pm12[ii+perm[jj]]*3;t0*=t0;n0=t0*t0*(g3[gi]*x0+g3[gi+1]*y0);}
    let t1=.5-x1*x1-y1*y1;if(t1>=0){const gi=pm12[ii+i1+perm[jj+j1]]*3;t1*=t1;n1=t1*t1*(g3[gi]*x1+g3[gi+1]*y1);}
    let t2=.5-x2*x2-y2*y2;if(t2>=0){const gi=pm12[ii+1+perm[jj+1]]*3;t2*=t2;n2=t2*t2*(g3[gi]*x2+g3[gi+1]*y2);}
    return 70*(n0+n1+n2);
  }
  function n3(xin,yin,zin){
    let n0,n1,n2,n3;const s=(xin+yin+zin)*F3;const i=Math.floor(xin+s),j=Math.floor(yin+s),k=Math.floor(zin+s);
    const t=(i+j+k)*G3;const x0=xin-(i-t),y0=yin-(j-t),z0=zin-(k-t);let i1,j1,k1,i2,j2,k2;
    if(x0>=y0){if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;}else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;}else{i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;}}
    else{if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;}else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;}else{i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;}}
    const x1=x0-i1+G3,y1=y0-j1+G3,z1=z0-k1+G3,x2=x0-i2+2*G3,y2=y0-j2+2*G3,z2=z0-k2+2*G3,x3=x0-1+3*G3,y3=y0-1+3*G3,z3=z0-1+3*G3;
    const ii=i&255,jj=j&255,kk=k&255;
    const c=(tt,gi,x,y,z)=>{if(tt<0)return 0;tt*=tt;return tt*tt*(g3[gi]*x+g3[gi+1]*y+g3[gi+2]*z);};
    n0=c(.6-x0*x0-y0*y0-z0*z0,pm12[ii+perm[jj+perm[kk]]]*3,x0,y0,z0);
    n1=c(.6-x1*x1-y1*y1-z1*z1,pm12[ii+i1+perm[jj+j1+perm[kk+k1]]]*3,x1,y1,z1);
    n2=c(.6-x2*x2-y2*y2-z2*z2,pm12[ii+i2+perm[jj+j2+perm[kk+k2]]]*3,x2,y2,z2);
    n3=c(.6-x3*x3-y3*y3-z3*z3,pm12[ii+1+perm[jj+1+perm[kk+1]]]*3,x3,y3,z3);
    return 32*(n0+n1+n2+n3);
  }
  return {n2,n3};
}
function fbm2(N,x,y,oct=5,lac=2,gain=.5){let a=1,f=1,s=0,n=0;for(let i=0;i<oct;i++){s+=a*N.n2(x*f,y*f);n+=a;a*=gain;f*=lac;}return s/n;}
function ridge2(N,x,y,oct=5){let a=1,f=1,s=0,n=0,w=1;for(let i=0;i<oct;i++){let v=1-Math.abs(N.n2(x*f,y*f));v*=v*w;w=U.clamp(v*1.6,0,1);s+=a*v;n+=a;a*=.5;f*=2.03;}return s/n;}
function fbm3(N,x,y,z,oct=5){let a=1,f=1,s=0,n=0;for(let i=0;i<oct;i++){s+=a*N.n3(x*f,y*f,z*f);n+=a;a*=.5;f*=2;}return s/n;}

/* ── Input: keyboard, mouse, pointer lock, touch ── */
const Input={
  keys:new Set(),hitSet:new Set(),upSet:new Set(),mdx:0,mdy:0,wheel:0,mb:[false,false,false],mhit:[false,false,false],
  locked:false,touch:false,tMove:{x:0,y:0},tBtn:new Set(),tHit:new Set(),uiOpen:false,
  init(canvas){
    addEventListener('keydown',e=>{
      if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA'))return;
      if(!this.keys.has(e.code))this.hitSet.add(e.code);this.keys.add(e.code);
      if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyF'].includes(e.code)&&!e.ctrlKey)e.preventDefault();
    });
    addEventListener('keyup',e=>{this.keys.delete(e.code);this.upSet.add(e.code);});
    addEventListener('blur',()=>{this.keys.clear();this.mb=[false,false,false];});
    canvas.addEventListener('mousedown',e=>{this.mb[e.button]=true;this.mhit[e.button]=true;
      if(!this.locked&&!this.uiOpen&&G.wantsLock())this.lock();});
    addEventListener('mouseup',e=>{this.mb[e.button]=false;});
    addEventListener('mousemove',e=>{if(this.locked){this.mdx+=e.movementX;this.mdy+=e.movementY;}
      else if(this.mb[2]||this.mb[0]&&G.dragLook){this.mdx+=e.movementX;this.mdy+=e.movementY;}});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    addEventListener('wheel',e=>{if(!this.uiOpen)this.wheel+=Math.sign(e.deltaY);},{passive:true});
    document.addEventListener('pointerlockchange',()=>{this.locked=document.pointerLockElement===canvas;if(!this.locked)G.onUnlock&&G.onUnlock();});
    this.canvas=canvas;
    if('ontouchstart' in window||navigator.maxTouchPoints>0)this.setupTouch();
  },
  lock(){try{const p=this.canvas.requestPointerLock();if(p&&p.catch)p.catch(()=>{});}catch(e){}},
  unlock(){try{document.exitPointerLock();}catch(e){}},
  down(c){return this.keys.has(c)||this.tBtn.has(c);},
  hit(c){return this.hitSet.has(c)||this.tHit.has(c);},
  endFrame(){this.hitSet.clear();this.upSet.clear();this.tHit.clear();this.mdx=0;this.mdy=0;this.wheel=0;this.mhit=[false,false,false];},
  axis(){let x=0,y=0;if(this.down('KeyW')||this.down('ArrowUp'))y+=1;if(this.down('KeyS')||this.down('ArrowDown'))y-=1;
    if(this.down('KeyD')||this.down('ArrowRight'))x+=1;if(this.down('KeyA')||this.down('ArrowLeft'))x-=1;
    x+=this.tMove.x;y+=this.tMove.y;const l=Math.hypot(x,y);if(l>1){x/=l;y/=l;}return{x,y};},
  fire(){return this.mb[0]||this.tBtn.has('Fire');},
  setupTouch(){
    this.touch=true;const root=U.$('#touch');
    const stick=root.querySelector('.stick'),knob=stick.querySelector('i'),look=root.querySelector('.look');
    let sid=null,cx=0,cy=0;
    stick.addEventListener('touchstart',e=>{const t=e.changedTouches[0];sid=t.identifier;const r=stick.getBoundingClientRect();cx=r.left+r.width/2;cy=r.top+r.height/2;e.preventDefault();},{passive:false});
    stick.addEventListener('touchmove',e=>{for(const t of e.changedTouches)if(t.identifier===sid){let dx=(t.clientX-cx)/55,dy=(t.clientY-cy)/55;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}this.tMove.x=dx;this.tMove.y=-dy;knob.style.transform=`translate(${dx*40}px,${dy*40}px)`;}e.preventDefault();},{passive:false});
    const end=e=>{for(const t of e.changedTouches)if(t.identifier===sid){sid=null;this.tMove.x=0;this.tMove.y=0;knob.style.transform='';}};
    stick.addEventListener('touchend',end);stick.addEventListener('touchcancel',end);
    let lid=null,lx=0,ly=0;
    look.addEventListener('touchstart',e=>{const t=e.changedTouches[0];lid=t.identifier;lx=t.clientX;ly=t.clientY;e.preventDefault();},{passive:false});
    look.addEventListener('touchmove',e=>{for(const t of e.changedTouches)if(t.identifier===lid){this.mdx+=(t.clientX-lx)*1.6;this.mdy+=(t.clientY-ly)*1.6;lx=t.clientX;ly=t.clientY;}e.preventDefault();},{passive:false});
    look.addEventListener('touchend',()=>{lid=null;});
    root.querySelectorAll('[data-k]').forEach(b=>{
      const k=b.dataset.k;
      b.addEventListener('touchstart',e=>{this.tBtn.add(k);this.tHit.add(k);e.preventDefault();},{passive:false});
      b.addEventListener('touchend',e=>{this.tBtn.delete(k);e.preventDefault();},{passive:false});
    });
  }
};

/* ── Audio: fully synthesized. Nothing streams; everything is built from oscillators and noise. ── */
const AudioSys={
  ctx:null,master:null,sfxBus:null,musBus:null,amb:null,radio:null,enabled:false,noiseBuf:null,
  init(){
    if(this.ctx)return;
    try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
    const c=this.ctx;this.master=c.createGain();this.master.gain.value=G.settings.volume;this.master.connect(c.destination);
    this.sfxBus=c.createGain();this.sfxBus.gain.value=.9;this.sfxBus.connect(this.master);
    this.musBus=c.createGain();this.musBus.gain.value=.35;this.musBus.connect(this.master);
    const len=c.sampleRate*2;this.noiseBuf=c.createBuffer(1,len,c.sampleRate);const d=this.noiseBuf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    this.enabled=true;
  },
  setVolume(v){if(this.master)this.master.gain.value=v;},
  noise(dur,{freq=1200,q=.8,type='lowpass',gain=.5,decay=dur,t0=0,sweep=0}={}){
    if(!this.enabled)return;const c=this.ctx,t=c.currentTime+t0;const s=c.createBufferSource();s.buffer=this.noiseBuf;
    const f=c.createBiquadFilter();f.type=type;f.frequency.setValueAtTime(freq,t);if(sweep)f.frequency.exponentialRampToValueAtTime(Math.max(40,sweep),t+dur);f.Q.value=q;
    const g=c.createGain();g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0008,t+decay);
    s.connect(f);f.connect(g);g.connect(this.sfxBus);s.start(t,Math.random());s.stop(t+dur+.05);
  },
  tone(f0,dur,{type='sine',gain=.3,f1=null,t0=0,attack=.005,bus=null}={}){
    if(!this.enabled)return;const c=this.ctx,t=c.currentTime+t0;const o=c.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,t);
    if(f1)o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+attack);g.gain.exponentialRampToValueAtTime(.0008,t+dur);
    o.connect(g);g.connect(bus||this.sfxBus);o.start(t);o.stop(t+dur+.05);
  },
  sfx(name,vol=1){
    if(!this.enabled)return;
    switch(name){
      case 'pistol':this.noise(.25,{freq:2400,sweep:300,gain:.55*vol,decay:.2});this.tone(160,.12,{type:'square',gain:.18*vol,f1:50});break;
      case 'rifle':this.noise(.18,{freq:3200,sweep:500,gain:.45*vol,decay:.14});this.tone(220,.08,{type:'sawtooth',gain:.12*vol,f1:60});break;
      case 'shotgun':this.noise(.5,{freq:1600,sweep:120,gain:.8*vol,decay:.45});this.tone(90,.3,{type:'square',gain:.25*vol,f1:30});break;
      case 'laser':this.tone(1800,.22,{type:'sawtooth',gain:.14*vol,f1:180});this.tone(900,.22,{type:'sine',gain:.12*vol,f1:120});break;
      case 'null':this.tone(80,.8,{type:'sine',gain:.4*vol,f1:30});this.tone(2400,.5,{type:'triangle',gain:.1*vol,f1:40});this.noise(.6,{freq:400,gain:.3*vol});break;
      case 'enemyshot':this.noise(.15,{freq:1800,sweep:400,gain:.25*vol,decay:.12});break;
      case 'hit':this.tone(700,.06,{type:'square',gain:.08*vol,f1:500});break;
      case 'hurt':this.noise(.2,{freq:500,gain:.3*vol});this.tone(140,.2,{type:'sine',gain:.2*vol,f1:90});break;
      case 'explode':this.noise(1.6,{freq:900,sweep:60,gain:.9*vol,decay:1.5});this.tone(60,1.2,{type:'sine',gain:.5*vol,f1:25});break;
      case 'step':this.noise(.07,{freq:700,gain:.05*vol,decay:.06,type:'bandpass',q:1.5});break;
      case 'jump':this.noise(.15,{freq:500,gain:.07*vol,decay:.12});break;
      case 'land':this.noise(.14,{freq:300,gain:.14*vol,decay:.12});break;
      case 'ui':this.tone(880,.07,{type:'triangle',gain:.08});break;
      case 'ui2':this.tone(660,.08,{type:'triangle',gain:.08});this.tone(990,.1,{type:'triangle',gain:.07,t0:.05});break;
      case 'deny':this.tone(220,.15,{type:'square',gain:.07});this.tone(165,.18,{type:'square',gain:.07,t0:.08});break;
      case 'pickup':this.tone(1320,.08,{type:'sine',gain:.1});this.tone(1760,.12,{type:'sine',gain:.08,t0:.06});break;
      case 'coin':this.tone(1568,.07,{type:'square',gain:.05});this.tone(2093,.15,{type:'square',gain:.05,t0:.06});break;
      case 'level':[523,659,784,1047,1319].forEach((f,i)=>this.tone(f,.45,{type:'triangle',gain:.12,t0:i*.09}));this.tone(262,1.2,{type:'sine',gain:.12,t0:.2});break;
      case 'quest':[392,523,659].forEach((f,i)=>this.tone(f,.6,{type:'sine',gain:.1,t0:i*.14}));break;
      case 'reload':this.noise(.06,{freq:3000,gain:.12,type:'highpass'});this.noise(.06,{freq:2000,gain:.12,type:'highpass',t0:.35});break;
      case 'empty':this.tone(1200,.03,{type:'square',gain:.05});break;
      case 'mine':this.noise(.16,{freq:2600,gain:.12,type:'bandpass',q:4});this.tone(420+Math.random()*80,.1,{type:'square',gain:.04});break;
      case 'door':this.noise(.5,{freq:600,sweep:2000,gain:.12,type:'bandpass',q:2});break;
      case 'warp':this.tone(40,4,{type:'sawtooth',gain:.2,f1:900});this.noise(4,{freq:200,sweep:6000,gain:.35,decay:4});break;
      case 'engine':this.noise(.4,{freq:300,gain:.1});break;
      case 'shield':this.tone(300,.25,{type:'sine',gain:.12,f1:900});break;
      case 'alarm':[0,.35,.7].forEach(t=>this.tone(740,.25,{type:'square',gain:.06,t0:t}));break;
      case 'vats':this.tone(200,.5,{type:'sine',gain:.12,f1:90});this.noise(.4,{freq:900,gain:.1,sweep:200});break;
    }
  },
  /* ambient bed: filtered noise wind + low drone, parameterized by world */
  setAmbient(spec){
    if(!this.enabled)return;this.stopAmbient();
    const c=this.ctx,out=c.createGain();out.gain.value=0;out.connect(this.master);out.gain.linearRampToValueAtTime(spec.vol??.18,c.currentTime+2.5);
    const nodes=[];
    if(spec.wind>0){const s=c.createBufferSource();s.buffer=this.noiseBuf;s.loop=true;const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=spec.windFreq||420;
      const lfo=c.createOscillator();lfo.frequency.value=.07;const lg=c.createGain();lg.gain.value=(spec.windFreq||420)*.6;lfo.connect(lg);lg.connect(f.frequency);lfo.start();
      const g=c.createGain();g.gain.value=spec.wind;s.connect(f);f.connect(g);g.connect(out);s.start();nodes.push(s,lfo);}
    (spec.drone||[]).forEach((fr,i)=>{const o=c.createOscillator();o.type=i%2?'triangle':'sine';o.frequency.value=fr;o.detune.value=(i-1)*7;
      const g=c.createGain();g.gain.value=.05/(1+i*.6);o.connect(g);g.connect(out);o.start();nodes.push(o);});
    this.amb={out,nodes};
  },
  stopAmbient(){if(!this.amb)return;const {out,nodes}=this.amb;const c=this.ctx;out.gain.cancelScheduledValues(c.currentTime);out.gain.setValueAtTime(out.gain.value,c.currentTime);out.gain.linearRampToValueAtTime(0,c.currentTime+1);
    setTimeout(()=>{nodes.forEach(n=>{try{n.stop();}catch(e){}});out.disconnect();},1200);this.amb=null;},
  /* generative radio: each station is a scale + tempo + voice; the sequencer schedules a bar ahead */
  radioTimer:null,radioStep:0,
  playStation(st){
    this.stopRadio();if(!this.enabled||!st||!st.music)return;
    const m=st.music;const c=this.ctx;let next=c.currentTime+.1;const beat=60/m.bpm/2;
    const r=U.rng(U.hash(st.id));const pattern=[];for(let i=0;i<32;i++)pattern.push(r()<m.density?Math.floor(r()*m.scale.length):-1);
    const bass=[];for(let i=0;i<8;i++)bass.push(Math.floor(r()*3));
    const tick=()=>{
      while(next<c.currentTime+.4){
        const i=this.radioStep%32;const n=pattern[i];
        if(n>=0){const f=m.root*Math.pow(2,m.scale[n]/12)*(r()<.2?2:1);this.tone(f,beat*(m.sustain||1.6),{type:m.voice,gain:.06,t0:next-c.currentTime,bus:this.musBus});}
        if(i%8===0){const bf=m.root/2*Math.pow(2,m.scale[bass[(i/8+this.radioStep/32|0)%8]*2%m.scale.length]/12);this.tone(bf,beat*7,{type:m.bassVoice||'sine',gain:.09,t0:next-c.currentTime,attack:.05,bus:this.musBus});}
        if(m.pad&&i%16===0){[0,2,4].forEach(k=>this.tone(m.root*Math.pow(2,m.scale[(k+(this.radioStep/16|0))%m.scale.length]/12),beat*15,{type:'sine',gain:.025,attack:.8,t0:next-c.currentTime,bus:this.musBus}));}
        if(m.perc&&i%4===0)this.noise(.05,{freq:i%8===0?140:6000,type:i%8===0?'lowpass':'highpass',gain:i%8===0?.25:.03,t0:next-c.currentTime});
        next+=beat;this.radioStep++;
      }
    };
    tick();this.radioTimer=setInterval(tick,120);
  },
  stopRadio(){if(this.radioTimer){clearInterval(this.radioTimer);this.radioTimer=null;}}
};

/* ── Persistence. localStorage may be unavailable (private windows, sandboxed viewers), so every access is guarded
      and the game always offers an export code as a fallback. ── */
const Store={
  KEY:'ltm.save.v1',
  get(k){try{return localStorage.getItem(k);}catch(e){return null;}},
  set(k,v){try{localStorage.setItem(k,v);return true;}catch(e){return false;}},
  del(k){try{localStorage.removeItem(k);}catch(e){}},
  slotKey(s){return this.KEY+'.'+s;},
  save(slot,state){
    const meta={name:state.player.name,origin:state.player.origin,loc:state.loc.site||state.loc.system,year:state.earthYear,t:Date.now(),act:Story.actName(state)};
    const ok=this.set(this.slotKey(slot),JSON.stringify(state))&&this.set(this.slotKey(slot)+'.meta',JSON.stringify(meta));
    return ok;
  },
  load(slot){const s=this.get(this.slotKey(slot));if(!s)return null;try{return JSON.parse(s);}catch(e){return null;}},
  meta(slot){const s=this.get(this.slotKey(slot)+'.meta');if(!s)return null;try{return JSON.parse(s);}catch(e){return null;}},
  slots(){return ['auto','1','2','3'].map(s=>({slot:s,meta:this.meta(s)}));},
  latest(){let best=null;for(const s of this.slots())if(s.meta&&(!best||s.meta.t>best.meta.t))best=s;return best;},
  exportStr(state){try{return 'LTM1:'+btoa(unescape(encodeURIComponent(JSON.stringify(state))));}catch(e){return '';}},
  importStr(str){try{str=str.trim();if(!str.startsWith('LTM1:'))return null;return JSON.parse(decodeURIComponent(escape(atob(str.slice(5)))));}catch(e){return null;}},
  settings(){try{return JSON.parse(this.get('ltm.settings')||'{}');}catch(e){return {};}},
  saveSettings(s){this.set('ltm.settings',JSON.stringify(s));}
};

/* ── Global game object ── */
const G={
  state:null,mode:'boot',renderer:null,camera:null,scene:null,time:0,dt:0,timeScale:1,
  settings:Object.assign({sens:1,invertY:false,volume:.7,quality:'high',fov:72,radio:true},Store.settings()),
  dragLook:false,
  wantsLock(){return (this.mode==='surface'||this.mode==='space')&&!Input.touch;},
  onUnlock:null,
};

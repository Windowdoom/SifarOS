/* ═══════════════════════════════════════════════════════════════════════
   SURFACE · planetary surfaces and the ship interior
   Terrain is an analytic height field shared by the mesh and the physics,
   so collision is exact. Static geometry uses AABB colliders in a spatial
   hash. Characters are vertical capsules integrated at the site's real g.
   ═══════════════════════════════════════════════════════════════════════ */

const ENEMY_DEFS={
  thug:{name:'Street thug',hp:60,speed:3.4,dmg:7,range:30,rof:1.6,look:'human',gun:'sidearm',xp:120,faction:'syndicate',loot:{slugs:[6,18],credits:[20,80]}},
  raider:{name:'Raider',hp:85,speed:3.6,dmg:6,range:42,rof:3,look:'human',gun:'carbine',xp:180,faction:'syndicate',loot:{cells:[8,24],credits:[30,120],medkit:[0,1]}},
  guard:{name:'Security',hp:110,speed:3.8,dmg:8,range:45,rof:2.6,look:'human',gun:'carbine',xp:220,faction:'concord',loot:{cells:[10,30]}},
  secdrone:{name:'Security drone',hp:70,speed:7,dmg:7,range:40,rof:2,look:'secdrone',xp:200,faction:'concord',fly:true,loot:{}},
  rogueDrone:{name:'Rogue drone',hp:55,speed:6,dmg:6,range:35,rof:1.8,look:'rogueDrone',xp:160,faction:'none',fly:true,loot:{titanium:[0,2],cells:[0,10]}},
  crawler:{name:'Flare-crawler',hp:95,speed:5.6,dmg:14,range:2.4,rof:1.1,look:'crawler',xp:200,faction:'fauna',melee:true,loot:{meds:[0,1]}},
  stinger:{name:'Reef stinger',hp:45,speed:7.5,dmg:10,range:2.6,rof:1.2,look:'stinger',xp:150,faction:'fauna',melee:true,fly:true,loot:{}},
  sentinel:{name:'Sentinel',hp:240,speed:2.4,dmg:13,range:65,rof:1.2,look:'sentinel',xp:700,faction:'machine',loot:{relic:[0,1],iridium:[1,3]}},
  construct:{name:'Engineer construct',hp:320,speed:3.8,dmg:17,range:26,rof:1.4,look:'construct',xp:1100,faction:'engineers',loot:{sifarite:[0,1],relic:[0,1]}},
};
const ORE_COL={iron:'#9a6a4a',ice:'#cfe8ff',titanium:'#b8c4d0',he3:'#9fe3ff',platinum:'#e8e0c8',iridium:'#8a9aff',sifarite:'#ffb040'};
const COLLECTS={shard:{label:'Pry loose the resonance shard',give:'shard'},tower:{label:'Download archive log',give:'quietlog'},pylon:{label:'Wake the pylon',flag:'pylon',wave:'construct'},
  dish:{label:'Recalibrate dish',flag:'dish',req:{skill:['engineering',5]}},strand:{label:'Send the farmer to shelter',flag:'strand'}};

const Surface={
  scene:null,site:null,

  build(siteId,opts={}){
    const S=this;S.dispose();
    const interior=siteId==='__bridge';
    const site=interior?{name:'Bridge',g:1,breathable:true,style:'bridge',sky:{zen:'#000',hor:'#000',fog:'#05070c',fogD:.0,sunCol:'#fff',sunSize:0,sunEl:.5,stars:0,haze:0},ground:['#222','#222','#222','#222'],terrain:{amp:0,scale:.01,oct:1,flat:9999,plate:true},services:[],enemies:[],ores:[],amb:{wind:0,drone:[55,82.5,110],vol:.08}}:Cosmos.site(siteId);
    S.site=site;S.siteId=siteId;S.interior=interior;S.seed=site.seed||U.hash(siteId);S.r=U.rng(S.seed);
    S.scene=new THREE.Scene();G.scene=S.scene;
    S.colliders=[];S.grid=new Map();S.actors=[];S.vehicles=[];S.props=[];S.ores=[];S.interact=[];S.bolts=[];S.tracers=[];S.bodies=[];S.rings=[];S.beams=[];S.traffic=[];S.lights=[];
    S.g=site.g*9.81;S.size=interior?60:1200;S.bound=interior?40:575;
    S.time=0;S.flareT=site.flare?160+S.r()*120:Infinity;S.flare=0;
    const cam=G.camera;cam.near=.08;cam.far=interior?300:8000;cam.fov=G.settings.fov;cam.updateProjectionMatrix();
    // lights & sky
    const sky=site.sky;S.scene.fog=interior?null:new THREE.FogExp2(C(sky.fog),sky.fogD);
    S.hemi=new THREE.HemisphereLight(C(sky.hor),C(site.ground[0]),interior?.7:(sky.stars>=1?.12:.55));S.scene.add(S.hemi);
    S.sun=new THREE.DirectionalLight(C(sky.sunCol),interior?0:(sky.sunSize>2?2.2:2.8));S.sun.castShadow=G.settings.quality!=='low';
    const sc=S.sun.shadow.camera;sc.left=-70;sc.right=70;sc.top=70;sc.bottom=-70;sc.near=1;sc.far=500;S.sun.shadow.mapSize.set(G.settings.quality==='ultra'?4096:2048,G.settings.quality==='ultra'?4096:2048);S.sun.shadow.bias=-.0004;S.sun.shadow.normalBias=.04;
    S.scene.add(S.sun);S.scene.add(S.sun.target);
    if(!interior){
      S.skyMesh=new THREE.Mesh(new THREE.SphereGeometry(3000,48,24),Gen.skyMaterial(sky));S.skyMesh.renderOrder=-10;S.scene.add(S.skyMesh);
      S.sunDir=new THREE.Vector3();S.setSun(0);
      this.addSkyBodies(site);
    }
    S.parts=new Gen.Particles(S.scene,900);
    // terrain
    S.pois=this.layoutPOIs(site,siteId);
    S.h=this.makeHeight(site);
    if(!interior){this.buildTerrain(site);if(site.sea)this.buildSea(site);}
    // content
    if(interior)this.buildBridge();else{this.buildSettlement(site);this.buildProps(site);this.spawnOres(site);this.spawnWildlife(site);this.spawnNPCs(site,siteId);this.placeShip();this.spawnVehicles(site);}
    this.syncQuestObjects();
    // player
    const P=S.player={pos:new THREE.Vector3(),vel:new THREE.Vector3(),yaw:0,onGround:false,vehicle:null,fireCd:0,reload:0,stepT:0,airT:0,landV:0,aim:false,glide:false,lastHurt:0,flap:1};
    P.mesh=Gen.humanoid({suit:G.state.player.suit,skin:G.state.player.skin,hair:G.state.player.hair,helmet:!site.breathable,gun:G.state.player.weapon,visor:'#f2a33a'});
    S.scene.add(P.mesh.root);
    let sp=opts.at,yaw0=opts.yaw;
    if(!sp){if(interior)sp=[0,0,4];else{const pd=S.pois.pad;const L=Math.hypot(pd[0],pd[1])||1;const k=(L-30)/L;sp=[pd[0]*k,0,pd[1]*k];yaw0=Math.atan2(pd[0],pd[1]);}}
    P.pos.set(sp[0],0,sp[2]);P.pos.y=S.groundAt(P.pos.x,P.pos.z,999)+.05;
    S.cam={yaw:yaw0??Math.PI,pitch:-.12,dist:4.2,fp:false,shake:0,kick:0};
    // wings (Titan)
    if(site.glide){const wm=new THREE.MeshStandardMaterial({color:C('#f2a33a'),transparent:true,opacity:.75,side:THREE.DoubleSide,roughness:.4});const w=new THREE.Mesh(new THREE.PlaneGeometry(4.2,1.1),wm);w.position.set(0,.35,-.18);w.visible=false;P.mesh.torso.add(w);P.wings=w;}
    // ambience
    AudioSys.setAmbient(site.amb||{wind:0,drone:[50,75]});
    if(!interior){this.weather=this.makeWeather(site);}
    G.state.loc.interior=interior;
    return S;
  },
  dispose(){
    if(!this.scene)return;
    this.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(x=>{if(x.map&&!Object.values(Gen._tex).includes(x.map))x.map.dispose();x.dispose&&!Object.values(Gen._mat).includes(x)&&x.dispose();});}});
    this.scene=null;
  },

  /* ── Sky: sun path, planets and moons in the sky ── */
  setSun(t){
    const site=this.site;const sky=site.sky;let el=sky.sunEl,az=.6;
    if(site.day>0){const ph=(G.state.dayPhase||0)*Math.PI*2;el=Math.sin(ph)*.85+.1;az=ph*.9;}
    this.sunDir.set(Math.cos(az)*Math.cos(el),Math.sin(el),Math.sin(az)*Math.cos(el)).normalize();
    if(site.terrain&&site.terrain.terminator)this.sunDir.set(-1,sky.sunEl,.15).normalize();
    const day=U.smooth(-.12,.18,this.sunDir.y);
    const u=this.skyMesh.material.uniforms;u.sunDir.value.copy(this.sunDir);u.day.value=Math.max(day,sky.stars>=1?1:.04);u.time.value=G.time;
    this.sun.intensity=(sky.sunSize>2?2.1:2.8)*Math.max(.02,day)*(this.flare>0?1+this.flare*2:1);
    this.hemi.intensity=(sky.stars>=1?.14:.55)*(.12+.88*day);
    this.day=day;
  },
  addSkyBodies(site){
    const add=(dir,size,col,{rings=false,faint=1,bands=false}={})=>{
      const d=new THREE.Vector3(...dir).normalize();const R=2400;const rad=Math.tan(size/2)*R*2;
      const m=Gen.planetMaterial({type:bands?'gas':'rocky',pal:[col,col==='#c8b8a0'?'#8a7a60':'#6a6a70','#efe1c4'],atmo:null},U.hash(col));
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(rad,48,32),m);mesh.position.copy(d).multiplyScalar(R);mesh.renderOrder=-5;
      m.uniforms.sunDir.value.copy(this.sunDir);if(faint<1){m.transparent=true;m.opacity=faint;}
      mesh.material.depthWrite=false;this.scene.add(mesh);this.skyBodies=(this.skyBodies||[]);this.skyBodies.push({mesh,d});
      if(rings){const r=Gen.rings(rad,'#d8c89a');r.position.copy(mesh.position);r.renderOrder=-4;r.material.depthWrite=false;this.scene.add(r);this.skyBodies.push({mesh:r,d});}
    };
    for(const b of site.skyBodies||[]){
      if(b.kind==='earth'){const m=Gen.planetMaterial({type:'earth',pal:['#2a5d9a','#3d7a3e'],atmo:'#7fb8ff'},3);const R=2400,rad=Math.tan(b.size/2)*R*2;const mesh=new THREE.Mesh(new THREE.SphereGeometry(rad,48,32),m);mesh.position.set(...b.dir).normalize().multiplyScalar(R);mesh.renderOrder=-5;m.uniforms.sunDir.value.copy(this.sunDir);this.scene.add(mesh);}
      else if(b.kind==='jupiter')add(b.dir,b.size,'#d9b48a',{bands:true});
      else if(b.kind==='saturn')add(b.dir,b.size,'#e3cf9c',{bands:true,rings:true,faint:b.faint||1});
      else add(b.dir,b.size,b.col||'#aaa');
    }
    if(site.companions){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.glowTex(),color:C('#fff4e0'),blending:THREE.AdditiveBlending,depthWrite:false}));s.material.color.multiplyScalar(3);s.position.set(.8,.3,-.5).normalize().multiplyScalar(2400);s.scale.setScalar(70);this.scene.add(s);}
    if(site.sky.blackhole){const bh=Gen.star(260,'#000',{blackhole:true});bh.position.set(-.3,.55,-.78).normalize().multiplyScalar(2200);bh.lookAt(0,0,0);bh.rotateX(.4);this.scene.add(bh);this.bh=bh;}
    if(site.sky.galaxy){const s=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:Gen.galaxyTex(4,9),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
      s.position.set(.3,.5,-.8).normalize().multiplyScalar(2300);s.lookAt(0,0,0);s.rotateX(1.1);s.scale.setScalar(1500);s.material.color.setScalar(1.8);this.scene.add(s);}
  },

  /* ── Points of interest: deterministic per site ── */
  layoutPOIs(site,siteId){
    const r=U.rng(U.hash(siteId+'poi'));const P={};
    const near=['shop','bar','clinic','hall','yard','fab','office','union','kiosk','lab','array','range','archive','rig','depot','heart','garage','memorial'];
    near.forEach((k,i)=>{const a=i/near.length*Math.PI*2+.2;const rad=34+(i%3)*9;P[k]=[Math.cos(a)*rad,Math.sin(a)*rad];});
    P.plaza=[0,0];P.pad=[-72,52];P.custodian=[0,-60];P.core=[0,-30];
    const far=(k,ang,rad)=>{P[k]=[Math.cos(ang)*rad,Math.sin(ang)*rad];};
    far('dest',.3,300);far('keel',0,330);far('drillsite',2.4,300);far('vein',1.1,200);far('rings',-2.2,150);far('quarry',-.7,190);far('icefield',2.9,190);far('crack',1.8,220);far('faculae',-1.5,160);
    for(let i=1;i<=3;i++){far('dish'+i,i*2.1+.4,130+i*18);far('tower'+i,i*2.09+1,95+i*25);far('shard'+i,i*2.1-.6,150+i*28);far('pylon'+i,i*2.094,70);far('strand'+i,.9+i*.55,120+i*22);far('poi'+i,r()*6.28,170+r()*260);}
    far('camp',r()*6.28,220+r()*140);
    if(site.style==='city'){P.garage=[-40,-110];P.dest=[260,150];}
    if(site.style==='shore'){P.rings=[40,-230];}
    return P;
  },

  /* ── Height field ── */
  makeHeight(site){
    const T=site.terrain;const N=makeNoise(this.seed);const r=U.rng(this.seed+7);
    if(T.plate){const edge=this.interior?999:390;return(x,z)=>{const d=Math.hypot(x,z);if(d>edge)return -600;return 0;};}
    const craters=[];for(let i=0;i<(T.craters||0);i++){const a=r()*6.28,d=150+r()*420;craters.push({x:Math.cos(a)*d,z:Math.sin(a)*d,r:10+Math.pow(r(),2)*70,dep:.35});}
    const flats=[{x:0,z:0,r:T.flat,h:0}];
    for(const k of['keel','drillsite','dest','camp','poi1','poi2','poi3','tower1','tower2','tower3','rings','vein','dish1','dish2','dish3']){if(this.pois[k]){flats.push({x:this.pois[k][0],z:this.pois[k][1],r:14,h:null});}}
    const base=(x,z)=>{let n=fbm2(N,x*T.scale,z*T.scale,T.oct||5);if(T.ridge)n=U.lerp(n,ridge2(N,x*T.scale*.6+91,z*T.scale*.6-37,5)*1.5-.55,T.ridge);
      let h=n*T.amp;const d=Math.hypot(x,z);h+=U.smooth(300,560,d)*T.amp*.9;
      for(const c of craters){const dd=Math.hypot(x-c.x,z-c.z)/c.r;if(dd<1.6){h+=dd<1?c.r*c.dep*(dd*dd-1)*.6:c.r*c.dep*.25*Math.pow((1.6-dd)/.6,2)*(dd<1.2?(dd-1)/.2:1);}}
      return h;};
    for(const f of flats)if(f.h===null)f.h=base(f.x,f.z);
    return(x,z)=>{let h=base(x,z);for(const f of flats){const d=Math.hypot(x-f.x,z-f.z);if(d<f.r*1.8+12){h=U.lerp(f.h,h,U.smooth(f.r,f.r*1.8+12,d));}}return h;};
  },
  normalAt(x,z){const e=1.2;const hx=this.h(x+e,z)-this.h(x-e,z),hz=this.h(x,z+e)-this.h(x,z-e);return new THREE.Vector3(-hx,2*e,-hz).normalize();},
  buildTerrain(site){
    const q=G.settings.quality;const seg=q==='low'?120:q==='medium'?170:q==='ultra'?260:210;
    const geo=new THREE.PlaneGeometry(this.size,this.size,seg,seg);geo.rotateX(-Math.PI/2);
    const pos=geo.attributes.position;const cols=new Float32Array(pos.count*3);const N=makeNoise(this.seed+3);
    const g0=C(site.ground[0]),g1=C(site.ground[1]),g2=C(site.ground[2]),g3=C(site.ground[3]);const tmp=new THREE.Color();
    const T=site.terrain;const sea=site.sea?site.sea.level:-999;
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);const y=this.h(x,z);pos.setY(i,y);
      const n=this.normalAt(x,z);const slope=1-n.y;const nz=fbm2(N,x*.02,z*.02,3)*.5+.5;const hn=U.clamp((y+T.amp*.3)/(T.amp*1.6+1),0,1);
      tmp.copy(g0).lerp(g1,U.smooth(.2,.7,nz*.6+hn*.6));
      if(hn>.72)tmp.lerp(g2,U.smooth(.72,.95,hn));
      tmp.lerp(g3,U.smooth(.18,.45,slope));
      if(y<sea+1.2)tmp.lerp(g2,.35*(1-U.smooth(sea,sea+1.2,y)));
      if(T.terminator)tmp.lerp(g2,U.smooth(40,260,x+fbm2(N,x*.01,z*.01,3)*60));
      if(T.faculae){const d=Math.hypot(x-this.pois.faculae[0],z-this.pois.faculae[1]);tmp.lerp(g2,1-U.smooth(10,60,d+fbm2(N,x*.05,z*.05,3)*25));}
      if(T.cracks){const c=Math.abs(N.n2(x*.012,z*.012));if(c<.05)tmp.lerp(C('#8a4a2a'),.7*(1-c/.05));}
      const v=.9+fbm2(N,x*.15,z*.15,2)*.12;cols[i*3]=tmp.r*v;cols[i*3+1]=tmp.g*v;cols[i*3+2]=tmp.b*v;}
    geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
    const mat=Gen.terrainMaterial();const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;this.scene.add(mesh);this.terrain=mesh;
    // skirt out to the horizon
    const sg=new THREE.PlaneGeometry(9000,9000,90,90);sg.rotateX(-Math.PI/2);const sp=sg.attributes.position;const sc=new Float32Array(sp.count*3);
    for(let i=0;i<sp.count;i++){const x=sp.getX(i),z=sp.getZ(i);const inside=Math.abs(x)<this.size/2-10&&Math.abs(z)<this.size/2-10;let y=this.h(x,z)+(inside?-12:0);
      if(!inside)y+=U.smooth(this.size*.5,4000,Math.hypot(x,z))*T.amp*2.2*(fbm2(N,x*.0008,z*.0008,3)*.5+.7);sp.setY(i,y);tmp.copy(g1).lerp(g3,.3);sc.set([tmp.r,tmp.g,tmp.b],i*3);}
    sg.setAttribute('color',new THREE.BufferAttribute(sc,3));sg.computeVertexNormals();this.scene.add(new THREE.Mesh(sg,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));
  },
  buildSea(site){
    const m=Gen.liquidMaterial(site.sea.color,{lava:site.sea.lava,glow:site.sea.glow});
    const w=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000,1,1),m);w.rotation.x=-Math.PI/2;w.position.y=site.sea.level;this.scene.add(w);this.sea=w;
    m.uniforms.fogColor.value.copy(C(site.sky.fog));m.uniforms.fogDensity.value=site.sky.fogD;m.uniforms.skyCol.value.copy(C(site.sky.hor));m.uniforms.sunCol.value.copy(C(site.sky.sunCol));
  },

  /* ── Colliders ── */
  addBox(x,y,z,w,h,d,mat,{collide=true,shadow=true,uvScale=8,rotY=0}={}){
    const geo=new THREE.BoxGeometry(w,h,d);
    const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++){const f=Math.floor(i/4);const sx=f<2?d:w,sy=f===2||f===3?d:h;uv.setXY(i,uv.getX(i)*sx/uvScale,uv.getY(i)*sy/uvScale);}
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y+h/2,z);m.rotation.y=rotY;m.castShadow=shadow;m.receiveShadow=true;this.scene.add(m);
    if(collide){const c=Math.abs(Math.cos(rotY)),s=Math.abs(Math.sin(rotY));const hw=(w*c+d*s)/2,hd=(w*s+d*c)/2;this.addCollider(x-hw,y,z-hd,x+hw,y+h,z+hd);}
    return m;
  },
  addCollider(x0,y0,z0,x1,y1,z1){const c={x0,y0,z0,x1,y1,z1};this.colliders.push(c);const cs=16;
    for(let i=Math.floor(x0/cs);i<=Math.floor(x1/cs);i++)for(let k=Math.floor(z0/cs);k<=Math.floor(z1/cs);k++){const key=i+','+k;let l=this.grid.get(key);if(!l)this.grid.set(key,l=[]);l.push(c);}return c;},
  near(x,z,r=2){const cs=16;const out=new Set();for(let i=Math.floor((x-r)/cs);i<=Math.floor((x+r)/cs);i++)for(let k=Math.floor((z-r)/cs);k<=Math.floor((z+r)/cs);k++){const l=this.grid.get(i+','+k);if(l)for(const c of l)out.add(c);}return out;},
  groundAt(x,z,fromY,rad=.3){let g=this.h(x,z);for(const c of this.near(x,z,rad)){if(x>c.x0-rad&&x<c.x1+rad&&z>c.z0-rad&&z<c.z1+rad&&c.y1<=fromY+.5&&c.y1>g)g=c.y1;}return g;},
  rayBox(o,d,c,maxT){let tmin=0,tmax=maxT;for(const [a,lo,hi] of[['x',c.x0,c.x1],['y',c.y0,c.y1],['z',c.z0,c.z1]]){const oa=o[a],da=d[a];if(Math.abs(da)<1e-8){if(oa<lo||oa>hi)return -1;}else{let t1=(lo-oa)/da,t2=(hi-oa)/da;if(t1>t2)[t1,t2]=[t2,t1];tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);if(tmin>tmax)return -1;}}return tmin;},
  raycastStatic(o,d,maxT){
    let best=maxT;const seen=new Set();
    for(let t=0;t<=maxT;t+=8){const px=o.x+d.x*t,pz=o.z+d.z*t;for(const c of this.near(px,pz,9)){if(seen.has(c))continue;seen.add(c);const h=this.rayBox(o,d,c,best);if(h>=0&&h<best)best=h;}}
    // terrain march
    let prev=0;for(let t=.5;t<best;t+=Math.max(.5,t*.02)){const y=o.y+d.y*t;if(y<this.h(o.x+d.x*t,o.z+d.z*t)){let a=prev,b=t;for(let i=0;i<8;i++){const m=(a+b)/2;if(o.y+d.y*m<this.h(o.x+d.x*m,o.z+d.z*m))b=m;else a=m;}best=b;break;}prev=t;}
    return best;
  },
  los(a,b){const d=new THREE.Vector3().subVectors(b,a);const L=d.length();d.divideScalar(L);return this.raycastStatic(a,d,L)>=L-.5;},

  /* ── Settlements ── */
  buildSettlement(site){
    const st=site.style;const r=this.r;const P=this.pois;
    const panel=(c)=>new THREE.MeshStandardMaterial({color:C(c),roughness:.6,metalness:.35,map:Gen.panelTex('#ffffff',U.hash(c)%50)});
    const matA=panel('#8a96a4'),matB=panel('#5a6474'),matDark=Gen.std('#1c2028',{metalness:.5,roughness:.5});
    const glowA=Gen.emissive('#f2a33a',3),glowB=Gen.emissive('#8fd0e8',3),glowC=Gen.emissive('#3ec9a7',3);
    const svcBuild=(k,w=12,h=6,d=10,mat=matA,label)=>{if(!P[k])return;const [x,z]=P[k];const a=Math.atan2(z,x);const bx=x+Math.cos(a)*(d/2+3),bz=z+Math.sin(a)*(d/2+3);
      this.addBox(bx,0,bz,w,h,d,mat,{rotY:-a+Math.PI/2});
      const door=new THREE.Mesh(new THREE.PlaneGeometry(2.4,3),glowB);door.position.set(bx-Math.cos(a)*(d/2+.02),1.5,bz-Math.sin(a)*(d/2+.02));door.lookAt(0,1.5,0);this.scene.add(door);
      if(label){const sg=new THREE.Mesh(new THREE.PlaneGeometry(6,1.5),new THREE.MeshBasicMaterial({map:Gen.signTex(label,'#ffcf7e'),transparent:false}));sg.material.color.setScalar(2.2);sg.position.set(bx-Math.cos(a)*(d/2+.05),h-.9,bz-Math.sin(a)*(d/2+.05));sg.lookAt(0,h-.9,0);this.scene.add(sg);}
    };
    const labels={shop:'SUPPLY',bar:site.id==='earth'?'THE TIRED ATLAS':'CANTINA',clinic:'CLINIC',hall:'COMMAND',yard:'HULLS',fab:'FABRICATOR',office:'YARD OFFICE',union:'DUST UNION',kiosk:'ORACLE',lab:'RESEARCH',array:'FAR-SIDE ARRAY',range:'RANGE',archive:'ARCHIVE',rig:'DEEPWELL',depot:'DEPOT',garage:'GARAGE'};
    const usedPOIs=new Set(Object.values(NPCS).filter(n=>n.site===this.siteId).map(n=>n.poi));
    if(site.services)for(const s of site.services){const map={market:'shop',bar:'bar',clinic:'clinic',crafting:'fab',shipyard:'yard',jobs:'hall',black:'depot'};if(map[s])usedPOIs.add(map[s]);}
    const humanStyles=['city','dome','yards','ice','shore','colony','rigs','outpost','camp'];
    if(humanStyles.includes(st))for(const k of usedPOIs){if(!P[k]||['plaza','pad','heart','custodian','core'].includes(k)||k.match(/\d$/))continue;svcBuild(k,10+r()*6,5+r()*4,9+r()*4,r()<.5?matA:matB,labels[k]);}
    // landing pad
    const [px,pz]=P.pad;const pad=new THREE.Mesh(new THREE.CylinderGeometry(18,19,.6,48),Gen.std('#3a4050',{metalness:.6,roughness:.5,map:Gen.panelTex('#ffffff',5)}));pad.position.set(px,.3,pz);pad.receiveShadow=true;this.scene.add(pad);this.addCollider(px-13,0,pz-13,px+13,.6,pz+13);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(16,.08,6,64),Gen.emissive('#f2a33a',1.3));ring.rotation.x=Math.PI/2;ring.position.set(px,.65,pz);this.scene.add(ring);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const l=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.sparkTex(),color:C('#f2a33a'),blending:THREE.AdditiveBlending,depthWrite:false}));l.position.set(px+Math.cos(a)*18.5,1,pz+Math.sin(a)*18.5);l.scale.setScalar(.7);this.scene.add(l);}
    const plazaLight=(x,z,col)=>{const pl=new THREE.PointLight(C(col),2.2,40,2);pl.position.set(x,6,z);this.scene.add(pl);this.lights.push(pl);const pole=this.addBox(x,0,z,.3,6,.3,matDark,{collide:true});const lamp=new THREE.Mesh(new THREE.SphereGeometry(.4,10,8),Gen.emissive(col,4));lamp.position.set(x,6.2,z);this.scene.add(lamp);};
    if(humanStyles.includes(st)){plazaLight(12,12,'#ffd6a0');plazaLight(-12,-12,'#ffd6a0');}

    if(st==='city')this.buildCity(matA,matB,matDark);
    else if(st==='dome'||st==='ice'){for(let i=0;i<7;i++){const a=i/7*Math.PI*2+.4,d=70+r()*40;const x=Math.cos(a)*d,z=Math.sin(a)*d;const R=10+r()*12;
        const dm=new THREE.Mesh(new THREE.SphereGeometry(R,40,20,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:C(st==='ice'?'#cfe0ea':'#aab4c0'),roughness:.25,metalness:.4,transparent:true,opacity:.55,emissive:C('#ffd6a0'),emissiveIntensity:.08}));dm.position.set(x,0,z);this.scene.add(dm);
        this.addCollider(x-R*.72,0,z-R*.72,x+R*.72,R*.8,z+R*.72);const base=new THREE.Mesh(new THREE.TorusGeometry(R,.5,8,48),matDark);base.rotation.x=Math.PI/2;base.position.set(x,.3,z);this.scene.add(base);
        const inner=new THREE.PointLight(C('#ffd6a0'),1.4,R*2);inner.position.set(x,R*.4,z);this.scene.add(inner);
        // tube to plaza
        const tl=d-R-8;const tube=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,tl,12),matB);tube.rotation.z=Math.PI/2;tube.rotation.y=-a;tube.position.set(Math.cos(a)*(R+4+tl/2),1.6,Math.sin(a)*(R+4+tl/2));this.scene.add(tube);}
      if(site===SITES.luna||this.siteId==='luna')for(let i=1;i<=3;i++)this.dish(P['dish'+i][0],P['dish'+i][1],matA);
      if(st==='ice'){for(let i=0;i<3;i++){const x=-40+i*40,z=-90;this.addBox(x,0,z,4,26,4,matDark);const f=new THREE.Mesh(new THREE.ConeGeometry(3,6,4),matB);f.position.set(x,29,z);this.scene.add(f);}this.addBox(P.drillsite[0],0,P.drillsite[1],8,4,6,matB);}
    }
    else if(st==='yards'){for(let i=0;i<4;i++){const a=i/4*Math.PI*2+.7,d=95;const x=Math.cos(a)*d,z=Math.sin(a)*d;
        const hg=new THREE.Mesh(new THREE.CylinderGeometry(16,16,40,24,1,true,0,Math.PI),matA);hg.rotation.z=Math.PI/2;hg.rotation.y=-a;hg.position.set(x,0,z);this.scene.add(hg);this.addCollider(x-14,0,z-14,x+14,15,z+14);
        const hull=Gen.ship(['kestrel','meridian','mule','lancer'][i],{high:[],drive:'torch'},'#6a7280');hull.position.set(x+Math.cos(a)*30,8,z+Math.sin(a)*30);hull.rotation.y=-a;hull.scale.setScalar(.7);this.scene.add(hull);
        for(let j=0;j<2;j++){const cx=x+Math.cos(a+1.57)*(j?14:-14),cz=z+Math.sin(a+1.57)*(j?14:-14);this.addBox(cx,0,cz,1.2,34,1.2,Gen.std('#d8a040',{metalness:.4}));const arm=new THREE.Mesh(new THREE.BoxGeometry(22,1,1),Gen.std('#d8a040',{metalness:.4}));arm.position.set(cx,34,cz);arm.rotation.y=-a;this.scene.add(arm);}}
      this.addBox(P.memorial[0],0,P.memorial[1],1.2,3.5,1.2,Gen.std('#c8b8a8'));
    }
    else if(st==='shore'){for(let i=0;i<14;i++){const x=-120+i*18+r()*6,z=-160-r()*50;const hh=5+r()*4;for(const dx of[-2.5,2.5])for(const dz of[-2.5,2.5])this.addBox(x+dx,-4,z+dz,.4,4+hh*.1,.4,matDark,{collide:false});this.addBox(x,0,z,7,hh,7,r()<.5?matA:matB);}
      for(let i=0;i<3;i++){const x=60+i*30,z=-70;this.addBox(x,0,z,6,40,6,matDark);const fl=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.glowTex(),color:C('#ff9a3a'),blending:THREE.AdditiveBlending,depthWrite:false}));fl.material.color.multiplyScalar(4);fl.position.set(x,43,z);fl.scale.setScalar(9);this.scene.add(fl);this.flares=(this.flares||[]).concat(fl);}
    }
    else if(st==='colony'){for(let i=0;i<14;i++){const a=r()*6.28,d=55+r()*80;const x=Math.cos(a)*d,z=Math.sin(a)*d;if(Math.hypot(x-P.pad[0],z-P.pad[1])<30)continue;
        if(i%3===0){const gh=new THREE.Mesh(new THREE.CylinderGeometry(4,4,18,16,1,false,0,Math.PI),new THREE.MeshStandardMaterial({color:C('#9fe0a8'),transparent:true,opacity:.5,emissive:C('#6fd08a'),emissiveIntensity:.35}));gh.rotation.z=Math.PI/2;gh.rotation.y=r()*3;gh.position.set(x,0,z);this.scene.add(gh);this.addCollider(x-4,0,z-4,x+4,4,z+4);}
        else this.addBox(x,0,z,8+r()*4,3.5,6,r()<.5?matA:matB,{rotY:r()*3});}
      for(let i=0;i<4;i++){const a=i*1.57+.3;const x=Math.cos(a)*50,z=Math.sin(a)*50;const sh=new THREE.Mesh(new THREE.SphereGeometry(6,24,12,0,Math.PI*2,0,Math.PI/2),matDark);sh.position.set(x,-1,z);sh.scale.y=.5;this.scene.add(sh);const sg=new THREE.Mesh(new THREE.PlaneGeometry(4,1),new THREE.MeshBasicMaterial({map:Gen.signTex('SHELTER','#ff6a4a')}));sg.material.color.setScalar(2);sg.position.set(x,2.5,z+.1);sg.lookAt(0,2.5,0);this.scene.add(sg);}
      for(let i=0;i<5;i++){const x=-120+i*10,z=110;this.addBox(x,0,z,.6,22,.6,Gen.std('#d8dde2'));const bl=new THREE.Mesh(new THREE.BoxGeometry(.3,9,1),Gen.std('#d8dde2'));bl.position.set(x,22,z+.6);this.scene.add(bl);this.turbines=(this.turbines||[]).concat(bl);}
      const kp=P.keel;const keel=new THREE.Mesh(new THREE.CylinderGeometry(9,14,60,6,1,true),new THREE.MeshStandardMaterial({color:C('#18161a'),metalness:.95,roughness:.15,emissive:C('#f2a33a'),emissiveIntensity:.15,side:THREE.DoubleSide}));keel.position.set(kp[0],this.h(kp[0],kp[1])-12,kp[1]);keel.rotation.z=.35;this.scene.add(keel);
      this.addBox(kp[0]-14,this.h(kp[0],kp[1]),kp[1],3,5,12,matDark);
    }
    else if(st==='rigs'){for(let i=0;i<6;i++){const a=i/6*6.28,d=80+r()*30;const x=Math.cos(a)*d,z=Math.sin(a)*d;for(const dx of[-3,3])for(const dz of[-3,3])this.addBox(x+dx,0,z+dz,.8,30,.8,Gen.std('#d8a040',{metalness:.5}));this.addBox(x,28,z,8,2,8,matDark);const l=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.sparkTex(),color:C('#ff4a3a'),blending:THREE.AdditiveBlending}));l.position.set(x,32,z);l.scale.setScalar(2);this.scene.add(l);}}
    else if(st==='reef'){const cm=(c)=>new THREE.MeshStandardMaterial({color:C('#0e2a30'),emissive:C(c),emissiveIntensity:.8,roughness:.3,transparent:true,opacity:.9});
      for(let i=0;i<40;i++){const a=r()*6.28,d=25+r()*140;const x=Math.cos(a)*d,z=Math.sin(a)*d;const h=6+r()*22;const col=U.pick(r,['#3ad8ff','#8a6aff','#3affc0','#ff6ad8']);
        const sp=new THREE.Mesh(new THREE.ConeGeometry(1+r()*2.5,h,7,4),cm(col));sp.position.set(x,this.h(x,z)+h/2-1,z);sp.rotation.set((r()-.5)*.3,r()*3,(r()-.5)*.3);this.scene.add(sp);this.addCollider(x-1,this.h(x,z),z-1,x+1,this.h(x,z)+h,z+1);
        if(r()<.3){const arch=new THREE.Mesh(new THREE.TorusGeometry(6+r()*6,.7,8,24,Math.PI),cm(col));arch.position.set(x,this.h(x,z),z);arch.rotation.y=r()*3;this.scene.add(arch);}}
      const heart=new THREE.Mesh(new THREE.IcosahedronGeometry(3.5,2),new THREE.MeshStandardMaterial({color:C('#0a2030'),emissive:C('#5fe0ff'),emissiveIntensity:1.2,roughness:.1}));heart.position.set(P.heart[0],3.5,P.heart[1]);this.scene.add(heart);this.heart=heart;
    }
    else if(st==='ruins'){const mm=new THREE.MeshStandardMaterial({color:C('#3a3e48'),metalness:.85,roughness:.35});
      for(let i=0;i<60;i++){const a=r()*6.28,d=30+r()*260;const x=Math.cos(a)*d,z=Math.sin(a)*d;const h=r()<.2?30+r()*60:4+r()*16;const w=4+r()*8;const y=this.h(x,z);
        const m=this.addBox(x,y-1,z,w,h,w*(.5+r()*.8),mm,{rotY:r()*.5});if(r()<.3){m.rotation.z=(r()-.5)*.25;}
        if(r()<.4){const ln=new THREE.Mesh(new THREE.BoxGeometry(w+.1,.12,.2),Gen.emissive('#6a7a9a',1.2));ln.position.set(x,y+h*.6,z);this.scene.add(ln);}}
      const core=this.addBox(P.core[0],0,P.core[1]-12,14,90,14,mm);const cl=new THREE.Mesh(new THREE.BoxGeometry(14.2,1,14.2),Gen.emissive('#a38cff',2.5));cl.position.set(P.core[0],60,P.core[1]-12);this.scene.add(cl);this.coreLight=cl;
      for(let i=1;i<=3;i++){const [x,z]=P['tower'+i];this.addBox(x+6,this.h(x,z),z,6,40,6,mm);}
    }
    else if(st==='elder'){const sm=new THREE.MeshStandardMaterial({color:C('#b8a07a'),roughness:.85,map:Gen.panelTex('#d8c8a8',21)});
      for(let t=0;t<4;t++){const R=60+t*28,hh=3+t*3;for(let i=0;i<16;i++){const a=i/16*6.28+t*.2;const x=Math.cos(a)*R,z=Math.sin(a)*R;if(Math.hypot(x-P.pad[0],z-P.pad[1])<26)continue;this.addBox(x,0,z,16,hh,10,sm,{rotY:-a+Math.PI/2});}}
      for(let i=0;i<10;i++){const a=i/10*6.28;const x=Math.cos(a)*28,z=Math.sin(a)*28;this.addBox(x,0,z,2.4,14,2.4,sm);}
      const arch=new THREE.Mesh(new THREE.TorusGeometry(14,2,10,40,Math.PI),sm);arch.position.set(0,0,-44);this.scene.add(arch);
    }
    else if(st==='engineer'||st==='vault'){const em=new THREE.MeshStandardMaterial({color:C('#18161a'),metalness:.95,roughness:.18});
      const plate=new THREE.Mesh(new THREE.CylinderGeometry(390,392,4,96),em);plate.position.y=-2;plate.receiveShadow=true;this.scene.add(plate);
      const lines=new THREE.Mesh(new THREE.RingGeometry(60,61,96),Gen.emissive('#f2a33a',3));lines.rotation.x=-Math.PI/2;lines.position.y=.02;this.scene.add(lines);
      for(const R of[140,240,340]){const l=new THREE.Mesh(new THREE.RingGeometry(R,R+.6,128),Gen.emissive('#f2a33a',2));l.rotation.x=-Math.PI/2;l.position.y=.02;this.scene.add(l);}
      for(let i=0;i<24;i++){const a=i/24*6.28;const l=new THREE.Mesh(new THREE.PlaneGeometry(.5,330),Gen.emissive('#f2a33a',1.4));l.rotation.x=-Math.PI/2;l.rotation.z=a;l.position.set(Math.cos(a)*225,.03,Math.sin(a)*225);this.scene.add(l);}
      for(let i=0;i<12;i++){const a=i/12*6.28+.13;const x=Math.cos(a)*300,z=Math.sin(a)*300;this.addBox(x,0,z,12,120+r()*120,12,em);}
      if(st==='engineer')for(let i=1;i<=3;i++){const [x,z]=P['pylon'+i];this.addBox(x,0,z,3,14,3,em);const cap=new THREE.Mesh(new THREE.OctahedronGeometry(2,0),Gen.emissive('#f2a33a',G.state.flags['pylon_'+i]?5:.5));cap.position.set(x,16,z);this.scene.add(cap);this.pylonCaps=(this.pylonCaps||{});this.pylonCaps[i]=cap;}
      if(this.siteId==='anchorage'){const t=this.addBox(0,0,-90,40,70,20,em);const door=new THREE.Mesh(new THREE.PlaneGeometry(14,30),Gen.emissive('#ffcf7e',3));door.position.set(0,15,-79.9);this.scene.add(door);}
    }
    else if(st==='outpost'){for(let i=0;i<5;i++){const a=r()*6.28,d=40+r()*40;this.addBox(Math.cos(a)*d,0,Math.sin(a)*d,8,3.5,6,r()<.5?matA:matB,{rotY:r()*3});}const t=new THREE.Mesh(new THREE.SphereGeometry(5,20,14),Gen.std('#d8dde2',{metalness:.5}));t.position.set(-30,5,50);this.scene.add(t);this.addCollider(-35,0,45,-25,10,55);this.addBox(20,0,-40,.5,24,.5,matDark);}
    else if(st==='camp'){const cp=[0,0];for(let i=0;i<10;i++){const a=r()*6.28,d=15+r()*35;const x=cp[0]+Math.cos(a)*d,z=cp[1]+Math.sin(a)*d;this.addBox(x,0,z,5+r()*6,2+r()*2.5,1,Gen.std('#5a4a3a',{metalness:.4}),{rotY:r()*3});}
      const fire=new THREE.PointLight(C('#ff8a3a'),3,30);fire.position.set(0,1.5,0);this.scene.add(fire);this.fire=fire;}
    else if(st==='alien'){this.buildAlienTown(site);}
    else if(st==='derelict'||st==='crash'){const hm=Gen.std('#5a6070',{metalness:.7,roughness:.5,map:Gen.panelTex('#ffffff',9)});
      for(let i=0;i<(st==='derelict'?7:4);i++){const x=(r()-.5)*160,z=(r()-.5)*160;const w=st==='derelict'?30+r()*50:8+r()*14;const m=this.addBox(x,this.h(x,z)-3,z,w,8+r()*14,10+r()*16,hm,{rotY:r()*3});m.rotation.z=(r()-.5)*.4;}}
    // generic POI objects for wild sites
    for(const k of['poi1','poi2','poi3']){const [x,z]=P[k];const y=this.h(x,z);const m=new THREE.Mesh(new THREE.OctahedronGeometry(1.2,0),Gen.emissive(k==='poi2'?'#a38cff':k==='poi3'?'#3ec9a7':'#f2a33a',2));m.position.set(x,y+2,z);this.scene.add(m);this.beacons=(this.beacons||[]).concat(m);}
  },
  dish(x,z,mat){const y=this.h(x,z);this.addBox(x,y,z,1.2,8,1.2,mat);const d=new THREE.Mesh(new THREE.SphereGeometry(7,32,12,0,Math.PI*2,0,Math.PI*.35),Gen.std('#d8dde2',{side:THREE.DoubleSide,metalness:.6,roughness:.3}));d.position.set(x,y+8,z);d.rotation.x=-Math.PI*.7;this.scene.add(d);},
  buildCity(matA,matB,matDark){
    const r=this.r;const block=36,street=14;const winMats=[];for(let i=0;i<6;i++){const t=Gen.windowTex(100+i,i%3!==0);t.wrapS=t.wrapT=THREE.RepeatWrapping;const m=new THREE.MeshStandardMaterial({color:C(['#4a5a70','#3a4252','#5a6a7a','#2a3240','#6a7080','#40485a'][i]),map:t,emissiveMap:t,emissive:new THREE.Color(1,1,1),emissiveIntensity:1.1,roughness:.35,metalness:.6});winMats.push(m);}
    const signs=['NOODLES','SOLNET','ORACLE CARES','HOTEL','馬拉','LOTUS','PHARMACY','KEBAB 24H','AI-FREE','الفجر','KARAOKE','BANK OF LUNA','FRONTIER? NO THANKS','DREAM TANKS'];const sc=['#ff4a8a','#4ad8ff','#a38cff','#ffcf4a','#6aff9a','#ff7a3a'];
    for(let bx=-6;bx<=6;bx++)for(let bz=-6;bz<=6;bz++){
      const cx=bx*(block+street),cz=bz*(block+street);const d=Math.hypot(cx,cz);if(d<60||d>300)continue;if(Math.hypot(cx-this.pois.pad[0],cz-this.pois.pad[1])<45)continue;if(Math.hypot(cx-this.pois.garage[0],cz-this.pois.garage[1])<25)continue;if(Math.hypot(cx-this.pois.dest[0],cz-this.pois.dest[1])<25)continue;
      const n=1+Math.floor(r()*3);for(let i=0;i<n;i++){const w=10+r()*(block/n-6),dd=10+r()*16;const h=(14+r()*r()*110)*(1-d/400);const x=cx+(i-(n-1)/2)*(block/n),z=cz+(r()-.5)*8;
        const m=this.addBox(x,0,z,w,h,dd,U.pick(r,winMats),{uvScale:16});
        if(r()<.35){const sg=new THREE.Mesh(new THREE.PlaneGeometry(w*.8,w*.2),new THREE.MeshBasicMaterial({map:Gen.signTex(U.pick(r,signs),U.pick(r,sc))}));sg.material.color.setScalar(2.4);sg.position.set(x,6+r()*Math.min(20,h-8),z+dd/2+.1);this.scene.add(sg);}
        if(h>70){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.sparkTex(),color:C('#ff3a3a'),blending:THREE.AdditiveBlending}));sp.position.set(x,h+1,z);sp.scale.setScalar(2.5);this.scene.add(sp);}}}
    // streets
    const road=Gen.std('#1a1d24',{roughness:.9});for(let i=-6;i<=6;i++){const o=i*(block+street)+(block+street)/2;const a=new THREE.Mesh(new THREE.PlaneGeometry(street,620),road);a.rotation.x=-Math.PI/2;a.position.set(o,.04,0);a.receiveShadow=true;this.scene.add(a);const b=a.clone();b.rotation.z=Math.PI/2;b.position.set(0,.045,o);this.scene.add(b);}
    // street lamps (emissive only)
    for(let i=0;i<60;i++){const o=(Math.floor(r()*13)-6)*(block+street)+(block+street)/2;const t=(r()-.5)*560;const x=r()<.5?o+street*.4:t,z=r()<.5?t:o+street*.4;const l=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.glowTex(),color:C('#ffc88a'),blending:THREE.AdditiveBlending,depthWrite:false}));l.position.set(x,7,z);l.scale.setScalar(5);this.scene.add(l);}
    // traffic lanes: loops around blocks at altitude
    for(let i=0;i<34;i++){const lane=(Math.floor(r()*12)-6)*(block+street)+(block+street)/2;const alt=5+Math.floor(r()*4)*6;const axis=r()<.5;const dir=r()<.5?1:-1;
      const car=this.makeCar(U.pick(r,['#c8ccd4','#2a3a5a','#8a2a2a','#1a1a1e','#d8a040','#3a6a4a']));car.position.set(axis?lane:(r()-.5)*560,alt,axis?(r()-.5)*560:lane);this.scene.add(car);
      this.traffic.push({mesh:car,axis,lane,alt,dir,speed:18+r()*14,t:axis?car.position.z:car.position.x});}
  },
  makeCar(col){const g=new THREE.Group();const b=new THREE.Mesh(new THREE.BoxGeometry(2.2,.8,4.4),Gen.std(col,{metalness:.8,roughness:.25}));g.add(b);const c=new THREE.Mesh(new THREE.BoxGeometry(1.8,.6,2),new THREE.MeshStandardMaterial({color:C('#0a1420'),metalness:.9,roughness:.05}));c.position.set(0,.6,-.2);g.add(c);
    const hl=new THREE.Mesh(new THREE.BoxGeometry(1.8,.15,.05),Gen.emissive('#ffffff',4));hl.position.set(0,0,2.22);g.add(hl);const tl=new THREE.Mesh(new THREE.BoxGeometry(1.8,.15,.05),Gen.emissive('#ff2a2a',4));tl.position.set(0,0,-2.22);g.add(tl);
    for(const x of[-1,1])for(const z of[-1.4,1.4]){const pod=new THREE.Mesh(new THREE.CylinderGeometry(.35,.4,.25,12),Gen.std('#20242c',{metalness:.7}));pod.position.set(x*1.2,-.45,z);g.add(pod);const gl=new THREE.Mesh(new THREE.CircleGeometry(.3,12),Gen.emissive('#6fc8ff',3));gl.rotation.x=Math.PI/2;gl.position.set(x*1.2,-.58,z);g.add(gl);}
    g.traverse(m=>{if(m.isMesh)m.castShadow=true;});return g;},
  buildAlienTown(site){
    const civ=Cosmos.civById(site.civ);const r=this.r;const style=civ?civ.ethos.style:'garden';const col=civ?civ.color:'#8ad0ff';
    const mat=new THREE.MeshStandardMaterial({color:C(col).multiplyScalar(.5),roughness:.4,metalness:.4,emissive:C(col),emissiveIntensity:.15});
    for(let i=0;i<34;i++){const a=r()*6.28,d=30+r()*150;const x=Math.cos(a)*d,z=Math.sin(a)*d;if(Math.hypot(x-this.pois.pad[0],z-this.pois.pad[1])<28)continue;const y=this.h(x,z);let m;
      if(style==='hive'){m=new THREE.Mesh(new THREE.CylinderGeometry(3+r()*4,5+r()*5,6+r()*16,6),mat);}
      else if(style==='fortress'||style==='machine'){m=new THREE.Mesh(new THREE.BoxGeometry(8+r()*10,10+r()*40,8+r()*10),mat);}
      else if(style==='temple'){m=new THREE.Mesh(new THREE.ConeGeometry(5+r()*6,14+r()*30,4),mat);}
      else if(style==='library'){m=new THREE.Mesh(new THREE.CylinderGeometry(6,6,8+r()*20,20),mat);}
      else{m=new THREE.Mesh(new THREE.SphereGeometry(4+r()*7,20,14),mat);m.scale.y=.6+r()*.8;}
      m.geometry.computeBoundingBox();const bb=m.geometry.boundingBox;m.position.set(x,y-bb.min.y*m.scale.y,z);m.rotation.y=r()*3;m.castShadow=true;this.scene.add(m);
      this.addCollider(x+bb.min.x*.8,y,z+bb.min.z*.8,x+bb.max.x*.8,y+(bb.max.y-bb.min.y)*m.scale.y,z+bb.max.z*.8);
      if(r()<.4){const l=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.glowTex(),color:C(col),blending:THREE.AdditiveBlending,depthWrite:false}));l.material.color.multiplyScalar(2);l.position.set(x,y+(bb.max.y-bb.min.y)*m.scale.y+2,z);l.scale.setScalar(6);this.scene.add(l);}}
  },
  buildProps(site){
    const r=this.r;const st=site.style;const N=site.style==='engineer'?0:site.style==='city'?60:160;
    const kinds={trees:'tree',boulders:'rock',mesas:'rock',iceSpikes:'spike',dunes:'rock',lichen:'lichen',coral:'coral',monoliths:'rock',pylons:null,fungus:'fungus',crystals:'crystal'};
    const kind=kinds[site.props]||'rock';if(!kind)return;
    const geos={rock:new THREE.DodecahedronGeometry(1,1),spike:new THREE.ConeGeometry(.6,4,5),tree:null,lichen:new THREE.SphereGeometry(1,8,6),coral:new THREE.ConeGeometry(.5,3,6),fungus:null,crystal:new THREE.OctahedronGeometry(1,0)};
    const baseC=C(site.ground[3]);
    if(kind==='tree'||kind==='fungus'){
      const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.3,1,6),Gen.std(kind==='tree'?'#4a3424':'#d8c8e0'),N);const crown=new THREE.InstancedMesh(kind==='tree'?new THREE.IcosahedronGeometry(1,1):new THREE.SphereGeometry(1,14,8,0,Math.PI*2,0,Math.PI/2),Gen.std(kind==='tree'?(site.ground[1]):'#b07ad0',{roughness:.8,emissive:kind==='fungus'?C('#b07ad0'):new THREE.Color(0),emissiveIntensity:kind==='fungus'?.3:0}),N);
      const m=new THREE.Matrix4();let n=0;for(let i=0;i<N*3&&n<N;i++){const x=(r()-.5)*this.size*.9,z=(r()-.5)*this.size*.9;const d=Math.hypot(x,z);if(d<site.terrain.flat*.8)continue;const y=this.h(x,z);if(site.sea&&y<site.sea.level+1)continue;const s=kind==='tree'?4+r()*6:2+r()*4;
        m.compose(new THREE.Vector3(x,y+s*.5,z),new THREE.Quaternion(),new THREE.Vector3(s*.6,s,s*.6));trunk.setMatrixAt(n,m);m.compose(new THREE.Vector3(x,y+s*(kind==='tree'?1.1:1),z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,r()*3,0)),new THREE.Vector3(s*.55,s*(kind==='tree'?.7:.35),s*.55));crown.setMatrixAt(n,m);this.addCollider(x-.4,y,z-.4,x+.4,y+s,z+.4);n++;}
      trunk.count=crown.count=n;trunk.castShadow=crown.castShadow=true;this.scene.add(trunk,crown);return;}
    const geo=geos[kind];const mat=kind==='crystal'?new THREE.MeshStandardMaterial({color:C(site.ground[2]),emissive:C(site.ground[2]),emissiveIntensity:.5,roughness:.1,metalness:.3}):kind==='coral'?new THREE.MeshStandardMaterial({color:C('#1a3a3a'),emissive:C('#3ad8ff'),emissiveIntensity:.6}):new THREE.MeshStandardMaterial({color:baseC,roughness:.95,map:Gen.detailTex()});
    const inst=new THREE.InstancedMesh(geo,mat,N);const m=new THREE.Matrix4();let n=0;
    for(let i=0;i<N*3&&n<N;i++){const x=(r()-.5)*this.size*.92,z=(r()-.5)*this.size*.92;if(Math.hypot(x,z)<(st==='wild'?20:site.terrain.flat*.75))continue;const y=this.h(x,z);if(site.sea&&y<site.sea.level&&kind!=='coral')continue;
      const s=kind==='rock'?.6+Math.pow(r(),3)*6:kind==='spike'?.6+r()*2.2:kind==='lichen'?.3+r()*.6:.5+r()*2;
      m.compose(new THREE.Vector3(x,y+(kind==='spike'?s*1.6:s*.3),z),new THREE.Quaternion().setFromEuler(new THREE.Euler(r()*.4,r()*6,r()*.4)),new THREE.Vector3(s,kind==='rock'?s*(.5+r()*.6):s,s));inst.setMatrixAt(n++,m);
      if(s>1.6&&kind!=='lichen')this.addCollider(x-s*.7,y,z-s*.7,x+s*.7,y+s*(kind==='spike'?3:.8),z+s*.7);}
    inst.count=n;inst.castShadow=true;inst.receiveShadow=true;this.scene.add(inst);
    // physics props: crates & barrels around settlement
    if(!['reef','engineer','wild'].includes(st)){for(let i=0;i<16;i++){const a=r()*6.28,d=15+r()*50;const x=Math.cos(a)*d,z=Math.sin(a)*d;this.addProp(x,z,r()<.3?'barrel':'crate');}}
  },
  addProp(x,z,kind){
    const barrel=kind==='barrel';const mesh=barrel?new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,1.1,14),Gen.std('#b8342a',{metalness:.5,roughness:.4})):new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:C('#6a6040'),map:Gen.panelTex('#b0a080',4),roughness:.7}));
    mesh.castShadow=true;const y=this.groundAt(x,z,99)+ (barrel?.55:.5);mesh.position.set(x,y,z);this.scene.add(mesh);
    this.props.push({mesh,vel:new THREE.Vector3(),ang:new THREE.Vector3(),r:barrel?.5:.55,hp:barrel?30:60,explosive:barrel,kind});
  },
  spawnOres(site){
    const r=this.r;if(!site.ores||!site.ores.length)return;const n=site.style==='wild'?22:14;
    for(let i=0;i<n;i++){const ore=U.pick(r,site.ores);const a=r()*6.28,d=(site.style==='engineer'?80:70)+r()*430;let x=Math.cos(a)*d,z=Math.sin(a)*d;
      if(i<4&&this.pois.vein){x=this.pois.vein[0]+(r()-.5)*40;z=this.pois.vein[1]+(r()-.5)*40;}
      const y=this.h(x,z);if(site.sea&&y<site.sea.level)continue;if(y<-100)continue;
      const g=new THREE.Group();const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1.4,1),Gen.std(site.ground[3],{roughness:.9}));rock.scale.set(1.3,.9,1.1);g.add(rock);
      for(let k=0;k<5;k++){const cr=new THREE.Mesh(new THREE.OctahedronGeometry(.35+r()*.3,0),new THREE.MeshStandardMaterial({color:C(ORE_COL[ore]),emissive:C(ORE_COL[ore]),emissiveIntensity:ore==='sifarite'?2:.5,roughness:.2,metalness:.6}));cr.position.set((r()-.5)*2,.5+r()*.6,(r()-.5)*2);cr.rotation.set(r()*3,r()*3,r()*3);g.add(cr);}
      g.position.set(x,y+.4,z);g.traverse(m=>{if(m.isMesh)m.castShadow=true;});this.scene.add(g);
      this.ores.push({mesh:g,ore,left:3+Math.floor(r()*4),respawn:0,pos:new THREE.Vector3(x,y+1,z)});this.addCollider(x-1.4,y,z-1.4,x+1.4,y+1.5,z+1.4);}
  },
  spawnWildlife(site){
    const r=this.r;const s=G.state;if(site.style==='bridge')return;
    const sys=Cosmos.get(site.system);const sec=sys.security??.5;const groups=Math.round((site.style==='wild'?5:3)*(1.2-sec));
    for(let g=0;g<groups;g++){const type=U.pick(r,site.enemies||['raider']);const a=r()*6.28,d=190+r()*320;const cx=Math.cos(a)*d,cz=Math.sin(a)*d;if(this.h(cx,cz)<-100)continue;
      const n=type==='sentinel'||type==='construct'?1+Math.floor(r()*2):2+Math.floor(r()*3);for(let i=0;i<n;i++)this.spawnEnemy(type,cx+(r()-.5)*20,cz+(r()-.5)*20);}
    if(site.style==='camp')for(let i=0;i<5;i++)this.spawnEnemy('raider',(r()-.5)*40,(r()-.5)*40);
    if(site.style==='vault')for(let i=0;i<3;i++)this.spawnEnemy('construct',(r()-.5)*80,-40+(r()-.5)*40);
  },
  spawnEnemy(type,x,z,tag){
    const D=ENEMY_DEFS[type];if(!D)return;const site=this.site;
    let mesh;if(D.look==='human'){mesh=Gen.humanoid({suit:type==='guard'?'#2a3a5a':U.pick(Math.random,['#4a3a2a','#3a2a2a','#2a2a2a','#4a4a3a']),skin:U.pick(Math.random,['#c69274','#8a5a3c','#e0b596','#5a3a26']),hair:'#1a1410',helmet:!site.breathable,gun:D.gun,accent:type==='guard'?'#7fb2ff':'#ff5a4e'});}
    else mesh=Gen.creature(D.look);
    const y=this.groundAt(x,z,999);mesh.root.position.set(x,y,z);this.scene.add(mesh.root);
    const e={kind:'enemy',type,def:D,mesh,pos:new THREE.Vector3(x,y+(D.fly?3:0),z),vel:new THREE.Vector3(),yaw:Math.random()*6,hp:D.hp*(1+levelFor(G.state.player.skills.combat)/150),maxHp:D.hp,state:'idle',t:0,fireCd:1+Math.random(),home:new THREE.Vector3(x,y,z),tag,radius:D.look==='human'?.45:.9,height:D.look==='human'?1.8:D.look==='sentinel'?2.6:D.look==='construct'?2.9:1.2,hostile:type!=='guard'};
    this.actors.push(e);return e;
  },
  spawnNPCs(site,siteId){
    const s=G.state;const r=this.r;const P=this.pois;
    for(const id in NPCS){const n=NPCS[id];if(n.site!==siteId)continue;if(n.cond&&!n.cond(s))continue;const p=P[n.poi]||[0,0];this.addNPC({id,name:n.name,role:n.role,dlg:n.dlg,alien:n.alien,crew:n.crew},p[0]+(r()-.5)*2,p[1]+(r()-.5)*2,true);}
    // service vendors for generated sites
    if(site.generated){const svcs=site.services||[];const map={market:'vendor',clinic:'clinic',jobs:'vendor',black:'fence'};svcs.forEach((k,i)=>{const a=i*1.3,d=16;const civ=site.civ?Cosmos.civById(site.civ):null;this.addNPC({name:civ?genName(U.rng(i+this.seed),2):U.pick(r,NAMES.first)+' '+U.pick(r,NAMES.last),role:k==='market'?'Trader':k==='jobs'?'Contracts broker':k==='clinic'?'Medic':'Fence',dlg:map[k]||'vendor',civ:site.civ},Math.cos(a)*d,Math.sin(a)*d,true);});}
    // citizens
    const n={city:34,dome:14,yards:18,colony:16,shore:12,ice:8,rigs:8,elder:18,reef:10,alien:16,outpost:6}[site.style]||0;
    for(let i=0;i<n;i++){const a=r()*6.28,d=10+r()*(site.style==='city'?220:70);this.addNPC({name:(site.style==='reef'?'Thalassi singer':site.style==='elder'?'Kepleri':site.civ?Cosmos.civById(site.civ).name:U.pick(r,NAMES.first)+' '+U.pick(r,NAMES.last)),role:'citizen',citizen:true,alien:site.style==='reef'?'thalassi':site.style==='elder'?'kepleri':null,civ:site.civ},Math.cos(a)*d,Math.sin(a)*d,false);}
    if(site.style==='city'||site.faction==='concord'||site.faction==='frontier')for(let i=0;i<(site.style==='city'?6:3);i++){const a=r()*6.28,d=20+r()*60;this.spawnEnemy('guard',Math.cos(a)*d,Math.sin(a)*d);}
  },
  addNPC(o,x,z,stationary){
    let mesh;const s=G.state;const site=this.site;
    if(o.alien==='thalassi')mesh=Gen.thalassi(o.id==='deepchoir'?'#9fe8ff':o.id==='seven'?'#ffcf7e':'#5fe0ff',o.id==='deepchoir'?1.4:1);
    else if(o.alien==='kepleri')mesh=Gen.humanoid({h:1.5,build:1.6,suit:'#8a6a4a',skin:'#a89070',accent:'#e8c07a',arms:4,pack:false});
    else if(o.alien==='engineer')mesh=Gen.humanoid({h:3,build:.8,kind:'engineer',suit:'#d8d2c8',skin:'#e8e2d8',accent:'#f2a33a',pack:false,glow:true});
    else if(o.alien==='android')mesh=Gen.humanoid({kind:'android',suit:'#e8e8f0',skin:'#d0d0dc',accent:'#a38cff',pack:false,glow:true});
    else if(o.alien==='machine'){mesh=Gen.creature('sentinel');mesh.root.scale.setScalar(1.6);}
    else if(o.civ&&(o.citizen||!o.id)){mesh=Gen.species(Cosmos.civById(o.civ));}
    else{const cl=o.crew&&CREW[o.crew]?CREW[o.crew].look:null;const r=U.rng(U.hash(o.name||'x'));
      mesh=Gen.humanoid(cl?{suit:cl.suit,skin:cl.skin,hair:cl.hair,h:cl.h,helmet:!site.breathable&&!this.interior}:{suit:U.pick(r,['#39475a','#5a4a3a','#3a4a3a','#4a3a4a','#6a6a70','#2a3a5a']),skin:U.pick(r,['#f1d3bd','#e0b596','#c69274','#b98260','#8a5a3c','#5a3a26']),hair:U.pick(r,['#1b1410','#3a2414','#8a5a2a','#c8a060','#101010']),h:1.6+r()*.25,helmet:!site.breathable&&!this.interior});}
    const y=this.groundAt(x,z,999);mesh.root.position.set(x,y,z);this.scene.add(mesh.root);
    const n={kind:'npc',o,mesh,pos:new THREE.Vector3(x,y,z),vel:new THREE.Vector3(),yaw:Math.random()*6,hp:80,maxHp:80,stationary,target:null,t:Math.random()*5,radius:.4,height:1.8,flee:0,home:new THREE.Vector3(x,y,z)};
    if(stationary)n.yaw=Math.atan2(-x,-z);
    this.actors.push(n);return n;
  },
  placeShip(){const s=G.state;const [px,pz]=this.pois.pad;const ship=Gen.ship(s.ship.hull,s.ship.fit,s.ship.paint||'#9fb0c2');const L=ship.userData.length;ship.position.set(px,.6+L*.07,pz);ship.rotation.y=.6;this.scene.add(ship);this.shipMesh=ship;
    const legs=[[-.3,.3],[.3,.3],[0,-.35]];for(const [a,b] of legs){const lg=new THREE.Mesh(new THREE.CylinderGeometry(.3,.5,L*.07+.6,8),Gen.std('#2a2e36',{metalness:.7}));lg.position.set(px+Math.cos(.6)*a*L-Math.sin(.6)*b*L,(L*.07+.6)/2,pz+Math.sin(.6)*a*L+Math.cos(.6)*b*L);this.scene.add(lg);}
    const hw=L*.42;this.addCollider(px-hw,.6,pz-hw,px+hw,.6+L*.14,pz+hw);
    const dl=Math.hypot(px,pz);this.shipDoor=new THREE.Vector3(px-px/dl*(hw+3),0,pz-pz/dl*(hw+3));
    const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,.1,16),Gen.emissive('#8fd0e8',3));beacon.position.set(this.shipDoor.x,.66,this.shipDoor.z);this.scene.add(beacon);},
  spawnVehicles(site){
    const r=this.r;const P=this.pois;
    if(['engineer','reef','elder','vault','ruins'].includes(site.style)&&site.style!=='ruins')return;
    if(site.style==='city'){const qc=this.addVehicle('hover',P.garage[0],P.garage[1],'#c8342a');qc.questCar=true;this.addVehicle('hover',P.pad[0]+26,P.pad[1]-6,'#2a3a5a');this.addVehicle('hover',20,40,'#d8a040',true);}
    else{this.addVehicle('rover',P.pad[0]+24,P.pad[1]+4,'#d8a040');if(r()<.7)this.addVehicle('rover',40+r()*20,-30,'#8a96a4');}
  },
  addVehicle(kind,x,z,col,civilian){
    let mesh;if(kind==='hover')mesh=this.makeCar(col);else{mesh=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(2.6,1,4.8),new THREE.MeshStandardMaterial({color:C(col),metalness:.5,roughness:.45,map:Gen.panelTex('#ffffff',12)}));body.position.y=1.1;mesh.add(body);
      const cab=new THREE.Mesh(new THREE.BoxGeometry(2.2,1,1.8),new THREE.MeshStandardMaterial({color:C('#0a1420'),metalness:.9,roughness:.05}));cab.position.set(0,1.9,.9);mesh.add(cab);
      const rack=new THREE.Mesh(new THREE.BoxGeometry(2.4,.2,2),Gen.std('#2a2e36'));rack.position.set(0,1.7,-1.3);mesh.add(rack);
      const hl=new THREE.Mesh(new THREE.BoxGeometry(2,.2,.05),Gen.emissive('#fff4e0',4));hl.position.set(0,1.2,2.42);mesh.add(hl);
      mesh.userData.wheels=[];for(const wx of[-1.45,1.45])for(const wz of[-1.6,0,1.6]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.45,14),Gen.std('#15171c',{roughness:.9}));w.rotation.z=Math.PI/2;w.position.set(wx,.55,wz);mesh.add(w);mesh.userData.wheels.push(w);}
      mesh.traverse(m=>{if(m.isMesh)m.castShadow=true;});}
    const y=this.groundAt(x,z,999);mesh.position.set(x,y+(kind==='hover'?1.4:0),z);this.scene.add(mesh);
    const v={kind,mesh,pos:mesh.position,yaw:Math.atan2(-x,-z),speed:0,vy:0,alt:kind==='hover'?1.4:0,civilian,pitch:0,roll:0,hp:300};this.vehicles.push(v);return v;
  },

  /* ── Quest objects, markers ── */
  syncQuestObjects(){
    const s=G.state;const id=this.siteId;
    this.interact=this.interact.filter(i=>!i.quest);(this.qmeshes||[]).forEach(m=>this.scene.remove(m));this.qmeshes=[];
    for(const q of Story.active(s)){const st=Story.cur(s,q);if(!st)continue;const tgtSite=st.target&&st.target.site;
      if(st.interact&&tgtSite===id){this.addQuestInteract(q,st.interact.poi,st.interact.label,st.interact.hold,()=>{Story.apply(s,st.interact.fx);});}
      if(st.collect&&tgtSite===id){
        const pre=st.collect.item==='shard'?'shard':st.collect.item==='quietlog'?'tower':st.collect.flagCount?st.collect.flagCount[0]:null;if(!pre)continue;const def=COLLECTS[pre];
        for(let i=1;i<=3;i++){const key='got_'+pre+i;if(s.flags[key]||s.flags[pre+'_'+i])continue;this.addQuestInteract(q,pre+i,def.label,2,()=>{
          if(def.req&&!Story.meets(s,def.req)){UI.toast(`Needs ${Story.reqLabel(def.req)}`,'bad');AudioSys.sfx('deny');return false;}
          s.flags[key]=1;if(def.flag)s.flags[def.flag+'_'+i]=1;if(def.give)Game.giveItem(def.give,1);Game.addXP(pre==='dish'?'engineering':pre==='tower'?'science':pre==='strand'?'medicine':'science',600);
          if(def.wave)for(let k=0;k<3+i;k++){const a=Math.random()*6.28;this.spawnEnemy(def.wave,Math.cos(a)*120,Math.sin(a)*120);}
          if(pre==='pylon'&&this.pylonCaps&&this.pylonCaps[i])this.pylonCaps[i].material=Gen.emissive('#f2a33a',5);
          if(pre==='strand'){const n=this.actors.find(a=>a.strand===i);if(n){n.flee=20;}}
          Story.event(s,'flag',{});Story.event(s,'inv',{});return true;});
          if(pre==='strand'){const p=this.pois['strand'+i];const n=this.addNPC({name:'Stranded farmer',role:'Afterlight colonist'},p[0]+2,p[1],true);n.strand=i;}}}
      if(st.spawn&&tgtSite===id&&!s.quests[q]['spawned_'+s.quests[q].stage]){s.quests[q]['spawned_'+s.quests[q].stage]=1;const p=this.pois[st.spawn.poi]||[0,0];for(let i=0;i<st.spawn.n;i++)this.spawnEnemy(st.spawn.type,p[0]+(Math.random()-.5)*30,p[1]+(Math.random()-.5)*30,st.spawn.tag);}
      if(st.rings&&tgtSite===id)this.setupRings(q,st);
    }
  },
  addQuestInteract(q,poi,label,hold,fn){const p=this.pois[poi];if(!p)return;const y=this.groundAt(p[0],p[1],999);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,60,12,1,true),new THREE.MeshBasicMaterial({color:C('#f2a33a'),transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));beam.position.set(p[0],y+30,p[1]);this.scene.add(beam);this.qmeshes.push(beam);
    const obj=new THREE.Mesh(new THREE.OctahedronGeometry(.6,0),Gen.emissive('#ffcf7e',4));obj.position.set(p[0],y+1.4,p[1]);this.scene.add(obj);this.qmeshes.push(obj);
    this.interact.push({quest:q,pos:new THREE.Vector3(p[0],y+1,p[1]),label,hold:hold||1,fn,mesh:obj,beam,r:3.2});},
  setupRings(q,st){if(this.rings.length)return;const p=this.pois[st.rings.poi];const r=U.rng(77);
    for(let i=0;i<st.rings.n;i++){const x=p[0]+Math.cos(i*.7)*60+i*25,z=p[1]-i*28+Math.sin(i)*30;const y=Math.max(this.h(x,z),this.site.sea?this.site.sea.level:0)+18+Math.sin(i*1.3)*12+i*2;
      const m=new THREE.Mesh(new THREE.TorusGeometry(6,.35,8,40),Gen.emissive(i===0?'#6fffb0':'#f2a33a',3));m.position.set(x,y,z);m.lookAt(p[0]+Math.cos((i+1)*.7)*60+(i+1)*25,y,p[1]-(i+1)*28);this.scene.add(m);this.rings.push({mesh:m,pos:m.position,done:false});}
    this.race={q,idx:0,t:0,on:false,limit:st.rings.time};},

  /* ── Weather ── */
  makeWeather(site){
    const kind=this.siteId==='titan'?'rain':site.style==='wild'&&site.biome==='tundra'?'snow':site.biome==='fungal'?'spores':this.siteId==='mars'?'dust':null;if(!kind)return null;
    const N=kind==='rain'?2500:1500;const pos=new Float32Array(N*3);for(let i=0;i<N;i++)pos.set([(Math.random()-.5)*80,Math.random()*40,(Math.random()-.5)*80],i*3);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const col={rain:'#d8a060',snow:'#ffffff',spores:'#e0a0ff',dust:'#e0a070'}[kind];
    const pts=new THREE.Points(geo,new THREE.PointsMaterial({color:C(col),size:kind==='rain'?.08:kind==='dust'?.12:.15,transparent:true,opacity:kind==='dust'?.35:.7,depthWrite:false}));pts.frustumCulled=false;this.scene.add(pts);
    return{kind,pts,pos,N,fall:kind==='rain'?1.6:kind==='snow'?1.2:kind==='spores'?.3:.2};
  },

  /* ═══════════ Update ═══════════ */
  update(dt){
    const S=this,s=G.state,P=S.player;if(!S.scene)return;S.time+=dt;
    if(!G.paused&&!G.cine){if(P.vehicle)this.updateVehicle(P.vehicle,dt,true);else this.updatePlayer(dt);}
    this.updateCamera(dt);
    if(!G.paused){this.updateActors(dt);this.updateBolts(dt);this.updateProps(dt);this.updateHazards(dt);this.updateQuestRuntime(dt);this.updateTraffic(dt);if(!G.cine)this.updateInteract(dt);}
    S.parts.update(dt);
    for(const t of S.tracers){t.life-=dt;t.line.material.opacity=Math.max(0,t.life*6);}S.tracers=S.tracers.filter(t=>{if(t.life<=0){S.scene.remove(t.line);t.line.geometry.dispose();return false;}return true;});
    // sky & lights
    if(!S.interior){if(S.site.day>0&&!G.paused)s.dayPhase=((s.dayPhase||0)+dt/(S.site.day*60*1.6))%1;S.setSun();
      S.skyMesh.position.copy(G.camera.position);const sp=S.player.pos;S.sun.position.copy(sp).addScaledVector(S.sunDir,200);S.sun.target.position.copy(sp);
      if(S.sea){const u=S.sea.material.uniforms;u.time.value=G.time;u.sunDir.value.copy(S.sunDir);}
      if(S.bh&&S.bh.userData.disk)S.bh.userData.disk.material.uniforms.time.value=G.time;
      if(S.flares)S.flares.forEach((f,i)=>f.scale.setScalar(8+Math.sin(G.time*13+i*3)*1.5));
      if(S.turbines)S.turbines.forEach(t=>t.rotation.z+=dt*2);
      if(S.heart)S.heart.rotation.y+=dt*.3;
      if(S.beacons)S.beacons.forEach(b=>b.rotation.y+=dt);
      for(const i of S.interact){if(i.mesh)i.mesh.rotation.y+=dt*2;}
      if(S.weather){const w=S.weather,p=w.pos,c=G.camera.position;for(let i=0;i<w.N;i++){let y=p[i*3+1]-w.fall*dt*(w.kind==='rain'?12:3);let x=p[i*3],z=p[i*3+2];if(w.kind==='dust'){x+=dt*4;}if(y<c.y-20||Math.abs(x-c.x)>40||Math.abs(z-c.z)>40){x=c.x+(Math.random()-.5)*80;z=c.z+(Math.random()-.5)*80;y=c.y+20+Math.random()*10;}p[i*3]=x;p[i*3+1]=y;p[i*3+2]=z;}w.pts.geometry.attributes.position.needsUpdate=true;}
    }else if(S.viewscreen){S.viewscreen.material.uniforms.time.value=G.time;if(S.core)S.core.rotation.y+=dt;}
    // night lights on city windows
    Render.fx.exposure=S.interior?1.1:(S.site.sky.stars>=1?1.05:1)*(0.85+0.3*(S.day??1));
  },

  /* ── Player controller ── */
  updatePlayer(dt){
    const S=this,s=G.state,P=S.player,site=S.site;const g=S.g;
    const ax=Input.axis();const sprint=Input.down('ShiftLeft')||Input.down('ShiftRight');const load=Game.load()/Game.capacity();
    const gFac=site.g>1.2?Math.min(1,1.25/Math.pow(site.g,.65)):1;const over=load>1?.55:1;
    const agi=1+(s.player.attrs.AGI-5)*.02;
    const speed=(sprint&&!P.aim?7.6:4.3)*gFac*over*agi*(P.glide?0:1);
    const yaw=S.cam.yaw;const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const want=new THREE.Vector3().addScaledVector(fwd,ax.y).addScaledVector(right,ax.x);if(want.lengthSq()>1)want.normalize();want.multiplyScalar(speed);
    const traction=P.onGround?Math.min(14,4+10*Math.sqrt(site.g)):1.2;
    P.vel.x=U.damp(P.vel.x,want.x,traction,dt);P.vel.z=U.damp(P.vel.z,want.z,traction,dt);
    // water
    const inWater=site.sea&&P.pos.y<site.sea.level-.9;
    if(inWater){P.vel.y=U.damp(P.vel.y,Input.down('Space')?2:0,3,dt);P.vel.x*=.96;P.vel.z*=.96;if(site.sea.lava){Game.hurt(40*dt,'lava');}}
    else P.vel.y-=g*dt;
    if(Input.hit('Space')&&P.onGround){P.vel.y=4.4;P.onGround=false;AudioSys.sfx('jump');Game.addXP('combat',0);}
    // Titan gliding and flapping
    P.glide=false;
    if(site.glide&&!P.onGround&&Input.down('Space')&&P.airT>.25){P.glide=true;if(Input.hit('Space')&&P.flap>0){P.vel.y+=2.6;P.flap-=.25;}
      P.vel.y=Math.max(P.vel.y,-1.4);const gs=13*(sprint?1.3:1);P.vel.x=U.damp(P.vel.x,fwd.x*gs,1.5,dt);P.vel.z=U.damp(P.vel.z,fwd.z*gs,1.5,dt);if(Math.random()<.3)AudioSys.sfx('step',.3);}
    if(P.onGround)P.flap=Math.min(1,P.flap+dt*.5);
    if(P.wings)P.wings.visible=P.glide||(site.glide&&!P.onGround&&P.airT>.25);
    const prevY=P.pos.y;
    P.pos.addScaledVector(P.vel,dt);
    // collisions with boxes
    const R=.38,Hh=1.8,step=.5;
    for(const c of S.near(P.pos.x,P.pos.z,1)){
      if(P.pos.y+Hh<=c.y0||P.pos.y>=c.y1)continue;
      const cx=U.clamp(P.pos.x,c.x0,c.x1),cz=U.clamp(P.pos.z,c.z0,c.z1);const dx=P.pos.x-cx,dz=P.pos.z-cz;const d2=dx*dx+dz*dz;
      if(d2<R*R){
        if(c.y1-P.pos.y<=step&&P.vel.y<=.5){P.pos.y=c.y1;P.vel.y=0;continue;}
        if(c.y0>=prevY+Hh-.05&&P.vel.y>0){P.pos.y=c.y0-Hh;P.vel.y=0;continue;}
        if(d2>1e-6){const d=Math.sqrt(d2);P.pos.x=cx+dx/d*R;P.pos.z=cz+dz/d*R;}
        else{const ex=[P.pos.x-c.x0,c.x1-P.pos.x,P.pos.z-c.z0,c.z1-P.pos.z];const m=Math.min(...ex);const i=ex.indexOf(m);if(i===0)P.pos.x=c.x0-R;else if(i===1)P.pos.x=c.x1+R;else if(i===2)P.pos.z=c.z0-R;else P.pos.z=c.z1+R;}
      }
    }
    // ground
    const gy=S.groundAt(P.pos.x,P.pos.z,prevY,.3);
    const wasGround=P.onGround;
    if(P.pos.y<=gy+.02){if(!wasGround){const v=-P.vel.y;if(v>4)AudioSys.sfx('land');const dmgV=site.g<.5?20:12;if(v>dmgV)Game.hurt((v-dmgV)*7,'fall');}P.pos.y=gy;P.vel.y=Math.max(0,P.vel.y);P.onGround=true;P.airT=0;}
    else{if(P.onGround&&P.pos.y-gy<.35&&P.vel.y<=0){P.pos.y=gy;}else{P.onGround=false;P.airT+=dt;}}
    if(P.pos.y<-400){Game.hurt(9999,'fall');}
    // world bound
    const d=Math.hypot(P.pos.x,P.pos.z);if(d>S.bound){P.pos.x*=S.bound/d;P.pos.z*=S.bound/d;if(!S._bwarn){UI.toast('Survey boundary. Take the ship to reach elsewhere on this world.');S._bwarn=1;setTimeout(()=>S._bwarn=0,6000);}}
    // facing
    const hs=Math.hypot(P.vel.x,P.vel.z);
    P.aim=Input.mb[2]||Input.fire()||(Input.touch&&Input.tBtn.has('Fire'));
    if(P.aim||S.cam.fp)P.yaw=yaw;else if(hs>.3)P.yaw=Math.atan2(-P.vel.x,-P.vel.z);
    const cur=P.mesh.root.rotation.y;P.mesh.root.rotation.y=cur+U.angDiff(cur,P.yaw+Math.PI)*Math.min(1,dt*14);
    P.mesh.root.position.copy(P.pos);P.mesh.pose(dt,P.onGround?hs:0,!P.onGround&&P.airT>.15,P.aim,false);
    P.mesh.root.visible=!S.cam.fp;
    if(P.onGround&&hs>1){P.stepT-=dt*hs;if(P.stepT<0){P.stepT=2.2;AudioSys.sfx('step',site.sky.stars>=1?.25:1);if(site.g<.3)S.parts.burst(P.pos.clone().add(new THREE.Vector3(0,.1,0)),C(site.ground[1]),4,1.2,.4,1.5,site.g*9.81);}}
    // weapons
    this.updateWeapon(dt);
    // hotkeys
    for(let i=1;i<=6;i++)if(Input.hit('Digit'+i)){const list=Object.keys(WEAPONS).filter(k=>s.inv[k]>0);if(list[i-1])Game.equip(list[i-1]);}
    if(Input.hit('KeyH'))Game.useItem('medkit');
    if(Input.hit('KeyQ'))Game.toggleVats();
    if(Input.hit('KeyF'))this.tryVehicle();
    if(Input.hit('KeyV'))S.cam.fp=!S.cam.fp;
  },
  updateWeapon(dt){
    const S=this,s=G.state,P=S.player;const W=WEAPONS[s.player.weapon];if(!W)return;
    P.fireCd-=dt;
    if(P.reload>0){P.reload-=dt;if(P.reload<=0){const need=W.mag-(s.player.mag[s.player.weapon]||0);const take=Math.min(need,s.inv[W.ammo]||0);s.inv[W.ammo]=(s.inv[W.ammo]||0)-take;s.player.mag[s.player.weapon]=(s.player.mag[s.player.weapon]||0)+take;}return;}
    if(Input.hit('KeyR')&&(s.player.mag[s.player.weapon]||0)<W.mag&&(s.inv[W.ammo]||0)>0){P.reload=W.reload*(1-levelFor(s.player.skills.combat)/250);AudioSys.sfx('reload');return;}
    const trig=W.auto?Input.fire():(Input.mhit[0]||Input.tHit.has('Fire'));
    if(trig&&P.fireCd<=0&&!G.talking){
      if((s.player.mag[s.player.weapon]||0)<=0){if((s.inv[W.ammo]||0)>0){P.reload=W.reload;AudioSys.sfx('reload');}else{AudioSys.sfx('empty');P.fireCd=.3;}return;}
      s.player.mag[s.player.weapon]--;P.fireCd=1/W.rof;this.fire(W);
    }
  },
  aimRay(){const cam=G.camera;const o=cam.position.clone();const d=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion);
    // start the ray at the player's chest distance to avoid hitting geometry behind the player
    const P=this.player;const skip=Math.max(0,o.distanceTo(P.pos.clone().setY(P.pos.y+1.5))-.5);o.addScaledVector(d,skip);return{o,d};},
  fire(W){
    const S=this,s=G.state,P=S.player;const cam=G.camera;
    const moving=Math.hypot(P.vel.x,P.vel.z)>1;const lv=levelFor(s.player.skills.combat);
    let spread=W.spread*(moving?1.8:1)*(Input.mb[2]?.45:1)*(1-lv/200)*(G.vats?.3:1)*(1.3-s.player.attrs.PER*.05);
    const {o,d:dir}=this.aimRay();
    const muzzle=new THREE.Vector3();if(P.mesh.gun&&!S.cam.fp){P.mesh.gun.updateMatrixWorld(true);muzzle.copy(P.mesh.gun.userData.muzzle).applyMatrix4(P.mesh.gun.matrixWorld);}else muzzle.copy(cam.position).addScaledVector(dir,.6).add(new THREE.Vector3(0,-.2,0));
    AudioSys.sfx(W.snd);S.cam.kick+=W.dmg>50?.06:.018;S.cam.shake+=W.dmg>50?.25:.06;
    S.parts.burst(muzzle,C(W.tracer),6,4,.35,.08);
    const pellets=W.pellets||1;let hitAny=false;
    for(let p=0;p<pellets;p++){
      const d=dir.clone().add(new THREE.Vector3((Math.random()-.5)*2*spread,(Math.random()-.5)*2*spread,(Math.random()-.5)*2*spread)).normalize();
      let best=this.raycastStatic(o,d,W.range);let hitA=null,head=false;
      for(const a of S.actors){if(a.dead)continue;const top=a.pos.y+a.height;const c=new THREE.Vector3(a.pos.x,a.pos.y+a.height*.5,a.pos.z);
        const t=this.raySphere(o,d,c,Math.max(a.radius,a.height*.45));if(t>0&&t<best){best=t;hitA=a;const hp=o.clone().addScaledVector(d,t);head=hp.y>top-a.height*.18&&a.o==null&&a.def&&a.def.look==='human';}}
      for(const v of S.vehicles){const t=this.raySphere(o,d,v.pos.clone().add(new THREE.Vector3(0,1,0)),1.8);if(t>0&&t<best){best=t;hitA=null;v.hp-=W.dmg;if(v.hp<=0&&!v.dead){v.dead=true;this.explode(v.pos.clone(),8,120);}}}
      for(const pr of S.props){const t=this.raySphere(o,d,pr.mesh.position,pr.r);if(t>0&&t<best){best=t;hitA={prop:pr};}}
      const hp=o.clone().addScaledVector(d,best);
      this.tracer(muzzle,hp,W.tracer,W.beam);
      if(hitA&&hitA.prop){const pr=hitA.prop;pr.vel.addScaledVector(d,W.dmg*.15);pr.ang.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(W.dmg*.1);pr.hp-=W.dmg;if(pr.explosive&&pr.hp<=0&&!pr.dead){pr.dead=true;this.explode(pr.mesh.position.clone(),7,110);}S.parts.burst(hp,C('#ffd08a'),5,5,.2,.3,9);}
      else if(hitA){hitAny=true;let dmg=W.dmg*(1+lv/100)*(head?2+s.player.attrs.PER*.08:1)*(G.vats?1.25:1)*(.9+Math.random()*.2);this.damageActor(hitA,dmg,d,head);S.parts.burst(hp,C(hitA.def&&hitA.def.look!=='human'?'#ffd08a':'#c8342a'),8,4,.25,.4,9);}
      else if(best<W.range){S.parts.burst(hp,C('#ffd08a'),6,5,.18,.35,9);S.parts.burst(hp,C(this.site.ground[1]),4,2,.4,.6,3);}
    }
    if(hitAny){const c=U.$('#cross');c.classList.add('hit');setTimeout(()=>c.classList.remove('hit'),110);AudioSys.sfx('hit');}
    // noise panics civilians and alerts enemies
    for(const a of S.actors){if(a.dead)continue;const dist=a.pos.distanceTo(P.pos);if(a.kind==='npc'&&!a.o.id&&dist<50)a.flee=8;if(a.kind==='enemy'&&dist<70&&a.hostile)a.state='combat';}
  },
  raySphere(o,d,c,r){const oc=o.clone().sub(c);const b=oc.dot(d);const cc=oc.lengthSq()-r*r;const h=b*b-cc;if(h<0)return -1;const t=-b-Math.sqrt(h);return t>0?t:-1;},
  tracer(a,b,col,beam){const geo=new THREE.BufferGeometry().setFromPoints([a,b]);const m=new THREE.LineBasicMaterial({color:C(col),transparent:true,opacity:1,blending:THREE.AdditiveBlending});m.color.multiplyScalar(beam?5:3);const l=new THREE.Line(geo,m);this.scene.add(l);this.tracers.push({line:l,life:beam?.12:.07});},
  damageActor(a,dmg,dir,head){
    const s=G.state;if(a.dead)return;a.hp-=dmg;
    if(a.kind==='npc'){a.flee=10;const civ=!a.o.id||a.o.citizen;if(!a.hostile){this.crime(a.o.id?3:1.2);}if(a.o.id&&a.hp<=0){a.hp=1;a.flee=15;UI.toast(`${a.o.name} is wounded and flees.`,'bad');return;}}
    if(a.kind==='enemy'){a.state='combat';if(a.type==='guard'&&!a.hostile){a.hostile=true;this.crime(2);}}
    if(a.hp<=0)this.kill(a,dir);
  },
  kill(a,dir){
    const s=G.state;a.dead=true;a.deadT=0;
    if(a.kind==='enemy'){const D=a.def;s.stats.kills++;Game.addXP('combat',D.xp);if(D.faction==='syndicate')Game.addRep('syndicate',-1);if(D.faction==='concord'){Game.addRep('concord',-3);}
      Story.event(s,'kill',{tag:a.tag||'',type:a.type});
      if(D.look!=='human'){this.parts.burst(a.pos.clone().add(new THREE.Vector3(0,1,0)),C(D.look==='construct'||D.look==='sentinel'?'#f2a33a':'#ffd08a'),30,8,.5,1,6);if(['sentinel','construct','rogueDrone','secdrone'].includes(D.look))AudioSys.sfx('explode',.6);}
      const loot={};for(const k in D.loot){const [lo,hi]=D.loot[k];const n=Math.floor(lo+Math.random()*(hi-lo+1));if(n>0)loot[k]=n;}
      this.bodies.push({pos:a.pos.clone(),loot,mesh:a.mesh.root,t:0});}
    if(a.kind==='npc'){this.crime(4);Game.addRep(this.site.faction,-5);}
    a.fall=dir?dir.clone():new THREE.Vector3(0,0,1);
  },
  crime(n){const s=G.state;const sec=(Cosmos.get(this.site.system).security??.5);if(sec<.3||this.site.style==='camp')return;const before=s.wanted;s.wanted=Math.min(5,s.wanted+n*.5);s.wantedCool=0;if(Math.ceil(s.wanted)>Math.ceil(before)){AudioSys.sfx('alarm');UI.toast('Security is responding.','bad');
      const P=this.player.pos;for(let i=0;i<Math.ceil(s.wanted);i++){const a=Math.random()*6.28;this.spawnEnemy('secdrone',P.x+Math.cos(a)*60,P.z+Math.sin(a)*60);}}
    for(const a of this.actors)if(a.type==='guard'||a.type==='secdrone'){a.hostile=true;a.state='combat';}},
  explode(p,radius,dmg){AudioSys.sfx('explode');this.parts.burst(p,C('#ffb060'),60,14,1.2,.9,-2);this.parts.burst(p,C('#ff5a2a'),40,8,1.6,1.4,-1);this.cam.shake+=.8;
    const fl=new THREE.PointLight(C('#ffa050'),8,radius*5);fl.position.copy(p).add(new THREE.Vector3(0,2,0));this.scene.add(fl);setTimeout(()=>this.scene&&this.scene.remove(fl),220);
    for(const a of this.actors){if(a.dead)continue;const d=a.pos.distanceTo(p);if(d<radius)this.damageActor(a,dmg*(1-d/radius),a.pos.clone().sub(p).normalize());}
    const pd=this.player.pos.distanceTo(p);if(pd<radius){Game.hurt(dmg*(1-pd/radius)*.8,'explosion');this.player.vel.add(this.player.pos.clone().sub(p).normalize().multiplyScalar(12*(1-pd/radius)));}
    for(const pr of this.props){const d=pr.mesh.position.distanceTo(p);if(d<radius*1.5){pr.vel.add(pr.mesh.position.clone().sub(p).normalize().multiplyScalar(18*(1-d/(radius*1.5))).add(new THREE.Vector3(0,6,0)));pr.ang.set(Math.random()*8,Math.random()*8,Math.random()*8);if(pr.explosive&&!pr.dead&&d<radius*.8){pr.dead=true;setTimeout(()=>this.scene&&this.explode(pr.mesh.position.clone(),7,110),120);}}}
  },

  /* ── NPC & enemy AI ── */
  updateActors(dt){
    const S=this,s=G.state,P=S.player;const pp=P.vehicle?P.vehicle.pos:P.pos;
    for(const a of S.actors){
      const dist=a.pos.distanceTo(pp);
      if(a.dead){a.deadT+=dt;const k=Math.min(1,a.deadT*2.5);if(a.mesh.root){a.mesh.root.rotation.x=-k*1.45*(a.def&&a.def.fly?0:1);if(a.def&&a.def.fly){a.pos.y=Math.max(S.groundAt(a.pos.x,a.pos.z,a.pos.y),a.pos.y-dt*12);a.mesh.root.position.copy(a.pos);}}if(a.kind==='npc'&&a.deadT>30)a.mesh.root.visible=false;continue;}
      if(dist>260&&!a.o){a.mesh.root.visible=false;continue;}a.mesh.root.visible=true;
      let moveTo=null,speed=0,aim=false;
      if(a.kind==='npc'){
        a.t-=dt;
        if(a.flee>0){a.flee-=dt;const away=a.pos.clone().sub(pp).setY(0).normalize();moveTo=a.pos.clone().addScaledVector(away,10);speed=5.5;}
        else if(a.stationary){if(dist<6){a.yaw=Math.atan2(pp.x-a.pos.x,pp.z-a.pos.z);}}
        else{if(!a.target||a.t<0||a.pos.distanceTo(a.target)<1.5){const r=Math.random;const rad=S.site.style==='city'?220:70;const ang=r()*6.28,d=10+r()*rad;a.target=new THREE.Vector3(Math.cos(ang)*d,0,Math.sin(ang)*d);a.t=8+r()*14;}moveTo=a.target;speed=1.3;}
      }else{
        const D=a.def;a.fireCd-=dt;
        const canSee=a.hostile&&dist<(a.state==='combat'?120:55)&&(dist<14||S.los(a.pos.clone().add(new THREE.Vector3(0,a.height*.8,0)),pp.clone().add(new THREE.Vector3(0,1.4,0))));
        if(canSee){a.state='combat';a.lastSeen=pp.clone();a.lost=0;}else if(a.state==='combat'){a.lost=(a.lost||0)+dt;if(a.lost>12)a.state='idle';}
        if(a.state==='combat'&&a.lastSeen){
          const pref=D.melee?.5:Math.min(D.range*.55,18);const toP=a.lastSeen.clone().sub(a.pos).setY(0);const dd=toP.length();
          if(dd>pref+3)moveTo=a.lastSeen;else if(dd<pref-4&&!D.melee)moveTo=a.pos.clone().addScaledVector(toP.normalize(),-6);
          else{a.strafe=(a.strafe||1);if(Math.random()<dt*.5)a.strafe*=-1;const side=new THREE.Vector3(-toP.z,0,toP.x).normalize();moveTo=a.pos.clone().addScaledVector(side,a.strafe*4);}
          speed=D.speed*(G.vats?.35:1);a.yaw=Math.atan2(pp.x-a.pos.x,pp.z-a.pos.z);aim=true;
          if(canSee&&a.fireCd<=0&&dd<D.range){a.fireCd=1/D.rof*(.7+Math.random()*.6);
            if(D.melee){if(dist<D.range+.5)Game.hurt(D.dmg,D.name);}
            else this.enemyShoot(a,pp);}
        }else if(a.type!=='guard'){a.t-=dt;if(!a.target||a.t<0){const r=Math.random;a.target=a.home.clone().add(new THREE.Vector3((r()-.5)*30,0,(r()-.5)*30));a.t=5+r()*8;}moveTo=a.target;speed=1.2;}
      }
      if(moveTo){const to=moveTo.clone().sub(a.pos).setY(0);const L=to.length();if(L>.5){to.divideScalar(L);a.vel.x=U.damp(a.vel.x,to.x*speed,6,dt);a.vel.z=U.damp(a.vel.z,to.z*speed,6,dt);if(!aim)a.yaw=Math.atan2(to.x,to.z);}else{a.vel.x*=.8;a.vel.z*=.8;}}
      else{a.vel.x*=.8;a.vel.z*=.8;}
      a.pos.x+=a.vel.x*dt;a.pos.z+=a.vel.z*dt;
      for(const c of S.near(a.pos.x,a.pos.z,1)){if(a.pos.y+1.6<=c.y0||a.pos.y>=c.y1-.4)continue;const cx=U.clamp(a.pos.x,c.x0,c.x1),cz=U.clamp(a.pos.z,c.z0,c.z1);const dx=a.pos.x-cx,dz=a.pos.z-cz;const d2=dx*dx+dz*dz;if(d2<a.radius*a.radius&&d2>1e-6){const d=Math.sqrt(d2);a.pos.x=cx+dx/d*a.radius;a.pos.z=cz+dz/d*a.radius;if(a.target&&!a.flee)a.t=0;}}
      const gy=S.groundAt(a.pos.x,a.pos.z,a.pos.y+.5);const fly=a.def&&a.def.fly;a.pos.y=fly?U.damp(a.pos.y,gy+(a.def.look==='stinger'?2.2:3.5)+Math.sin(G.time*2+a.home.x)*.4,3,dt):gy;
      if(Math.hypot(a.pos.x,a.pos.z)>S.bound){a.pos.multiplyScalar(.99);}
      a.mesh.root.position.copy(a.pos);a.mesh.root.rotation.y=U.damp(a.mesh.root.rotation.y,a.yaw,10,dt);
      const hs=Math.hypot(a.vel.x,a.vel.z);a.mesh.pose(dt,hs,false,aim,G.talking===a);
    }
    // loot bodies fade after a while
    S.actors=S.actors.filter(a=>{if(a.dead&&a.kind==='enemy'&&a.deadT>120){S.scene.remove(a.mesh.root);return false;}return true;});
    // wanted decay
    if(s.wanted>0){const seen=S.actors.some(a=>!a.dead&&a.hostile&&(a.type==='guard'||a.type==='secdrone')&&a.state==='combat'&&a.pos.distanceTo(pp)<80);s.wantedCool=(s.wantedCool||0)+(seen?0:dt);if(s.wantedCool>20){s.wanted=Math.max(0,s.wanted-dt*.12);if(s.wanted===0){UI.toast('Security lost your trail.');for(const a of S.actors)if(a.type==='guard'){a.hostile=false;a.state='idle';}}}}
  },
  enemyShoot(a,pp){
    const D=a.def;const from=a.pos.clone().add(new THREE.Vector3(0,a.height*.75,0));const to=pp.clone().add(new THREE.Vector3(0,1.2,0));
    const P=this.player;const lead=P.vel.clone().multiplyScalar(from.distanceTo(to)/70*.6);to.add(lead);
    const acc=(.05+from.distanceTo(to)*.0025)*(1+Math.hypot(P.vel.x,P.vel.z)*.05);
    const d=to.sub(from).normalize().add(new THREE.Vector3((Math.random()-.5)*acc,(Math.random()-.5)*acc,(Math.random()-.5)*acc)).normalize();
    const col=D.look==='construct'||D.look==='sentinel'?'#f2a33a':D.faction==='concord'?'#6fa8ff':'#ff5a4e';
    const m=new THREE.Mesh(new THREE.SphereGeometry(.09,6,4),Gen.emissive(col,6));m.scale.z=6;m.position.copy(from);m.lookAt(from.clone().add(d));this.scene.add(m);
    this.bolts.push({mesh:m,pos:from,vel:d.multiplyScalar(70),life:2,dmg:D.dmg*(1+(Cosmos.get(this.site.system).security||0)*.2),owner:a});
    AudioSys.sfx(D.look==='sentinel'||D.look==='construct'?'laser':'enemyshot',Math.max(.15,1-a.pos.distanceTo(pp)/80));
  },
  updateBolts(dt){
    const P=this.player;const pp=P.vehicle?P.vehicle.pos:P.pos;const ts=G.vats?.3:1;
    for(const b of this.bolts){b.life-=dt;const step=b.vel.clone().multiplyScalar(dt*ts);const a0=b.pos.clone();b.pos.add(step);b.mesh.position.copy(b.pos);
      const pc=pp.clone().add(new THREE.Vector3(0,1,0));const L2=step.lengthSq();const t=L2>0?U.clamp(pc.clone().sub(a0).dot(step)/L2,0,1):0;const closest=a0.addScaledVector(step,t);
      if(closest.distanceTo(pc)<(P.vehicle?2:.75)){b.life=0;Game.hurt(b.dmg,b.owner.def.name);this.parts.burst(closest,C('#ff8a6a'),6,3,.2,.3);continue;}
      if(b.pos.y<this.h(b.pos.x,b.pos.z)){b.life=0;this.parts.burst(b.pos,C('#ffb080'),4,3,.2,.3,5);}}
    this.bolts=this.bolts.filter(b=>{if(b.life<=0){this.scene.remove(b.mesh);return false;}return true;});
  },
  updateProps(dt){
    const g=this.g;for(const p of this.props){if(p.dead&&p.explosive){if(p.mesh.visible){p.mesh.visible=false;}continue;}
      if(p.vel.lengthSq()<.0004&&p.ang.lengthSq()<.0004)continue;
      p.vel.y-=g*dt;p.mesh.position.addScaledVector(p.vel,dt);p.mesh.rotation.x+=p.ang.x*dt;p.mesh.rotation.y+=p.ang.y*dt;p.mesh.rotation.z+=p.ang.z*dt;
      const gy=this.groundAt(p.mesh.position.x,p.mesh.position.z,p.mesh.position.y)+p.r;if(p.mesh.position.y<gy){p.mesh.position.y=gy;if(p.vel.y<-1.5)p.vel.y*=-.35;else p.vel.y=0;p.vel.x*=.82;p.vel.z*=.82;p.ang.multiplyScalar(.8);}
      for(const c of this.near(p.mesh.position.x,p.mesh.position.z,1)){const q=p.mesh.position;if(q.y<c.y0||q.y>c.y1)continue;if(q.x>c.x0-p.r&&q.x<c.x1+p.r&&q.z>c.z0-p.r&&q.z<c.z1+p.r){p.vel.x*=-.4;p.vel.z*=-.4;q.addScaledVector(p.vel,dt*2);}}}
    // player kicks props
    const P=this.player;if(!P.vehicle)for(const p of this.props){const d=p.mesh.position.clone().sub(P.pos);d.y=0;const L=d.length();if(L<p.r+.45&&L>0){d.normalize();p.vel.addScaledVector(d,Math.hypot(P.vel.x,P.vel.z)*.9+.5);p.vel.y+=1;p.ang.set(Math.random()*3,Math.random()*3,Math.random()*3);}}
  },

  /* ── Vehicles ── */
  tryVehicle(){
    const S=this,P=S.player,s=G.state;
    if(P.vehicle){const v=P.vehicle;P.vehicle=null;const side=new THREE.Vector3(Math.cos(v.yaw),0,-Math.sin(v.yaw)).multiplyScalar(-2.6);P.pos.copy(v.pos).add(side);P.pos.y=S.groundAt(P.pos.x,P.pos.z,v.pos.y+3);P.vel.set(0,0,0);P.mesh.root.visible=true;AudioSys.sfx('door');AudioSys.stopRadio();UI.radio(null);return;}
    let best=null,bd=4;for(const v of S.vehicles){if(v.dead)continue;const d=v.pos.distanceTo(P.pos);if(d<bd){bd=d;best=v;}}
    for(const t of S.traffic){const d=t.mesh.position.distanceTo(P.pos);if(d<5){best=this.hijack(t);break;}}
    if(!best)return;P.vehicle=best;P.mesh.root.visible=false;AudioSys.sfx('door');
    if(best.civilian){best.civilian=false;this.crime(1);UI.toast('Vehicle stolen.','bad');}
    if(best.questCar)Story.event(s,'drivestart',{});
    if(G.settings.radio){const st=RADIO[s.radioIdx||0];this.playRadio(st);}
  },
  hijack(t){this.traffic.splice(this.traffic.indexOf(t),1);const v={kind:'hover',mesh:t.mesh,pos:t.mesh.position,yaw:t.mesh.rotation.y,speed:t.speed*.5,vy:0,alt:t.alt,civilian:true,pitch:0,roll:0,hp:300};this.vehicles.push(v);return v;},
  playRadio(st){AudioSys.playStation(st);const s=G.state;const news=st.news&&s.news.length?' · '+L(U.esc(U.pick(Math.random,s.news.slice(0,8)).t)):'';UI.radio(`<b>${U.esc(st.name)}</b>${news}`);},
  updateVehicle(v,dt,driven){
    const S=this,s=G.state;const g=S.g;const hover=v.kind==='hover';
    const ax=Input.axis();const thr=ax.y,steer=-ax.x;
    const top=hover?38:24,acc=hover?16:8*Math.min(1,Math.sqrt(S.site.g)+.3);
    if(Input.hit('Comma')||Input.hit('Period')){s.radioIdx=((s.radioIdx||0)+(Input.hit('Period')?1:RADIO.length-1))%RADIO.length;this.playRadio(RADIO[s.radioIdx]);}
    const grounded=hover||v.onGround!==false;
    if(grounded){v.speed+=thr*acc*dt;if(Input.down('Space')&&!hover)v.speed*=Math.pow(.2,dt);v.speed*=Math.pow(hover?.7:.55,dt);v.speed=U.clamp(v.speed,-top*.4,top);
      v.yaw+=steer*dt*(hover?1.6:1.3)*U.clamp(Math.abs(v.speed)/6,0,1)*Math.sign(v.speed||1);}
    const fwd=new THREE.Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
    v.pos.x+=fwd.x*v.speed*dt;v.pos.z+=fwd.z*v.speed*dt;
    const gy=S.groundAt(v.pos.x,v.pos.z,v.pos.y+1.5,1.2);
    if(hover){if(Input.down('KeyR')||Input.down('Space'))v.alt=Math.min(40,v.alt+dt*8);if(Input.down('ControlLeft')||Input.down('KeyC'))v.alt=Math.max(1.4,v.alt-dt*8);
      const target=Math.max(gy+1.4,(S.site.sea?S.site.sea.level+1.4:-999),S.h(v.pos.x,v.pos.z)+v.alt);v.pos.y=U.damp(v.pos.y,target,4,dt);v.roll=U.damp(v.roll,steer*.35*U.clamp(v.speed/15,0,1),5,dt);v.pitch=U.damp(v.pitch,-thr*.08,4,dt);}
    else{
      const c=Math.cos(v.yaw),sn=Math.sin(v.yaw);const sample=(fx,sx)=>S.groundAt(v.pos.x+sn*fx+c*sx,v.pos.z+c*fx-sn*sx,v.pos.y+1.2,.2);
      const hf=sample(2,0),hb=sample(-2,0),hl=sample(0,-1.3),hr=sample(0,1.3);const target=(hf+hb+hl+hr)/4;
      if(v.pos.y>target+.15){v.onGround=false;v.vy-=g*dt;v.pos.y+=v.vy*dt;if(v.pos.y<=target){if(v.vy<-8)Game.hurt((-v.vy-8)*2,'crash');v.pos.y=target;v.vy=0;v.onGround=true;}}
      else{const newVy=(target-v.pos.y)/dt;v.vy=newVy>0?Math.min(newVy,v.speed*.9+2):0;v.pos.y=target;v.onGround=true;if(v.vy>6&&S.site.g<.6){v.onGround=false;}}
      v.pitch=U.damp(v.pitch,Math.atan2(hb-hf,4),8,dt);v.roll=U.damp(v.roll,Math.atan2(hl-hr,2.6),8,dt);
      if(v.mesh.userData.wheels)v.mesh.userData.wheels.forEach(w=>w.rotation.x+=v.speed*dt/.55);
    }
    for(const cl of S.near(v.pos.x,v.pos.z,3)){if(v.pos.y+1.5<=cl.y0||v.pos.y>=cl.y1-.3||cl.y1-v.pos.y<1.1)continue;const R=1.8;const cx=U.clamp(v.pos.x,cl.x0,cl.x1),cz=U.clamp(v.pos.z,cl.z0,cl.z1);const dx=v.pos.x-cx,dz=v.pos.z-cz;const d2=dx*dx+dz*dz;if(d2<R*R){const d=Math.sqrt(d2)||.01;v.pos.x=cx+dx/d*R;v.pos.z=cz+dz/d*R;if(Math.abs(v.speed)>8){S.cam.shake+=.3;AudioSys.sfx('land');if(Math.abs(v.speed)>18)Game.hurt((Math.abs(v.speed)-18)*1.5,'crash');}v.speed*=-.25;}}
    const d=Math.hypot(v.pos.x,v.pos.z);if(d>S.bound){v.pos.x*=S.bound/d;v.pos.z*=S.bound/d;v.speed*=.5;}
    // run-over
    for(const a of S.actors){if(a.dead)continue;if(a.pos.distanceTo(v.pos)<2.2&&Math.abs(v.speed)>6){this.damageActor(a,Math.abs(v.speed)*6,fwd);a.pos.addScaledVector(fwd,2);}}
    v.mesh.position.copy(v.pos);v.mesh.rotation.set(0,0,0);v.mesh.rotateY(v.yaw);v.mesh.rotateX(v.pitch);v.mesh.rotateZ(v.roll);
    this.player.pos.copy(v.pos);
    if(Input.hit('KeyF'))this.tryVehicle();
    if(v.speed>2&&!hover&&S.site.sky.stars<1&&Math.random()<.4)S.parts.emit(v.pos.clone().add(new THREE.Vector3((Math.random()-.5)*2,.3,0)).addScaledVector(fwd,-2.3),new THREE.Vector3((Math.random()-.5),.8,(Math.random()-.5)),C(S.site.ground[1]),.9,1.2,-.3);
  },
  updateTraffic(dt){for(const t of this.traffic){t.t+=t.dir*t.speed*dt;if(t.t>300)t.t=-300;if(t.t<-300)t.t=300;if(t.axis){t.mesh.position.set(t.lane+t.dir*3,t.alt,t.t);t.mesh.rotation.y=t.dir>0?0:Math.PI;}else{t.mesh.position.set(t.t,t.alt,t.lane+t.dir*3);t.mesh.rotation.y=t.dir>0?Math.PI/2:-Math.PI/2;}}},

  /* ── Camera ── */
  updateCamera(dt){
    const S=this,P=S.player,cam=G.camera;const c=S.cam;
    if(G.cine){return;}
    const sens=.0022*G.settings.sens*(Input.mb[2]?.6:1)*(G.vats?.6:1);
    if(!G.paused){c.yaw-=Input.mdx*sens;c.pitch-=Input.mdy*sens*(G.settings.invertY?-1:1);c.pitch=U.clamp(c.pitch,-1.35,1.25);c.dist=U.clamp(c.dist+Input.wheel*.6,1.6,P.vehicle?16:9);}
    c.kick=U.damp(c.kick,0,10,dt);c.shake=U.damp(c.shake,0,6,dt);
    const v=P.vehicle;
    let target;
    if(v){target=v.pos.clone().add(new THREE.Vector3(0,2.2,0));const dist=Math.max(c.dist,8)+(v.kind==='hover'?2:0);
      if(Input.mdx===0&&Input.mdy===0&&Math.abs(v.speed)>3){c.yaw=c.yaw+U.angDiff(c.yaw,v.yaw+Math.PI)*Math.min(1,dt*2.5);}
      const off=new THREE.Vector3(Math.sin(c.yaw)*Math.cos(c.pitch),-Math.sin(c.pitch)+.25,Math.cos(c.yaw)*Math.cos(c.pitch)).multiplyScalar(dist);
      cam.position.copy(target).add(off);}
    else if(c.fp){target=P.pos.clone().add(new THREE.Vector3(0,1.62,0));cam.position.copy(target);}
    else{
      target=P.pos.clone().add(new THREE.Vector3(0,1.55,0));const aim=Input.mb[2];const dist=aim?1.9:c.dist;
      const back=new THREE.Vector3(Math.sin(c.yaw)*Math.cos(c.pitch),-Math.sin(c.pitch),Math.cos(c.yaw)*Math.cos(c.pitch));
      const right=new THREE.Vector3(Math.cos(c.yaw),0,-Math.sin(c.yaw));target.addScaledVector(right,aim?.55:.35);
      // camera collision
      const d=S.interior?Math.min(dist,this.interiorCamLimit(target,back,dist)):Math.min(dist,S.raycastStatic(target,back,dist)-.25);
      cam.position.copy(target).addScaledVector(back,Math.max(.4,d));
    }
    const gy=S.h(cam.position.x,cam.position.z)+.35;if(!S.interior&&cam.position.y<gy)cam.position.y=gy;
    const look=new THREE.Vector3(-Math.sin(c.yaw)*Math.cos(c.pitch),Math.sin(c.pitch),-Math.cos(c.yaw)*Math.cos(c.pitch));
    cam.lookAt(cam.position.clone().add(look));cam.rotateX(c.kick);
    if(c.shake>.001){cam.rotation.z+=(Math.random()-.5)*c.shake*.05;cam.position.x+=(Math.random()-.5)*c.shake*.1;cam.position.y+=(Math.random()-.5)*c.shake*.1;}
    const fov=G.settings.fov*(Input.mb[2]&&WEAPONS[G.state.player.weapon]?.scope?.45:Input.mb[2]?.85:1)*(P.vehicle?1.08:1);cam.fov=U.damp(cam.fov,fov,10,dt);cam.updateProjectionMatrix();
    // compass
    const markers=Game.compassMarkers();UI.compass(c.yaw+Math.PI,markers);
  },
  interiorCamLimit(t,dir,dist){let best=dist;for(const cl of this.colliders){const h=this.rayBox(t,dir,cl,best);if(h>=0&&h<best)best=h-.2;}return best;},

  /* ── Hazards: oxygen, radiation, flares ── */
  updateHazards(dt){
    const S=this,s=G.state,P=s.player,site=S.site;if(S.interior)return;
    const pp=S.player.pos;const inTown=Math.hypot(pp.x,pp.z)<Math.min(55,site.terrain.flat*.35)&&['city','dome','yards','ice','shore','colony','rigs','outpost','elder'].includes(site.style);
    const nearShip=S.shipDoor&&pp.distanceTo(S.shipDoor)<8;
    if(!site.breathable){if(inTown||nearShip||S.player.vehicle&&S.player.vehicle.kind==='rover'){P.o2=Math.min(Game.maxO2(),P.o2+dt*30);}else{P.o2-=dt;if(P.o2<=0){P.o2=0;Game.hurt(6*dt,'hypoxia');if(!S._o2w){UI.toast('Suit oxygen empty. Get back to the settlement or your ship.','bad');S._o2w=1;setTimeout(()=>S._o2w=0,8000);}}else if(P.o2<30&&!S._o2l){S._o2l=1;UI.toast('Oxygen low.','bad');AudioSys.sfx('alarm');setTimeout(()=>S._o2l=0,15000);}}}
    if(site.rad&&!inTown&&!nearShip)P.rad=Math.min(150,P.rad+dt*.35*(1-(P.attrs.END-5)*.05));
    if(site.flare){S.flareT-=dt;
      if(S.flareT<30&&S.flareT>0&&!S._fw){S._fw=1;UI.toast('FLARE WARNING: Proxima superflare in 30 seconds. Get to a shelter or the settlement.','bad');AudioSys.sfx('alarm');}
      if(S.flareT<=0){S.flare=U.clamp(1+S.flareT/25,0,1)*(S.flareT>-25?1:0);if(S.flareT<-25){S.flareT=240+Math.random()*180;S._fw=0;S.flare=0;}
        if(S.flare>0&&!inTown&&!nearShip){P.rad=Math.min(150,P.rad+dt*4);}Render.fx.tint.set(1+S.flare*.5,1+S.flare*.2,1);}else Render.fx.tint.set(1,1,1);}
    if(P.rad>100)Game.hurt((P.rad-100)*.05*dt,'radiation');
    // ore respawn
    for(const o of S.ores){if(o.left<=0){o.respawn-=dt;if(o.respawn<=0){o.left=3+Math.floor(Math.random()*3);o.mesh.visible=true;}}}
  },

  /* ── Quest runtime: courier timer, wing race, stage timers ── */
  updateQuestRuntime(dt){
    const S=this,s=G.state;
    for(const q of Story.active(s)){const st=Story.cur(s,q);if(!st)continue;const Q=s.quests[q];
      if(st.timer&&st.target&&st.target.site===S.siteId){Q.timer=(Q.timer??st.timer)-dt;if(Q.timer<=0){UI.toast(st.fail||'Out of time.','bad');Q.timer=st.timer;for(let i=1;i<=3;i++){delete s.flags['strand_'+i];delete s.flags['got_strand'+i];}S.syncQuestObjects();}}
      if(st.drive&&st.target.site===S.siteId){const v=S.player.vehicle;if(v&&v.questCar){Q.timer=(Q.timer??st.drive.time);if(!Q.driving){Q.driving=1;Q.timer=st.drive.time;UI.toast(`Go! ${st.drive.time} seconds to the drop.`,'lvl');}Q.timer-=dt;
          const dp=S.pois[st.drive.to];if(Math.hypot(v.pos.x-dp[0],v.pos.z-dp[1])<14){Q.driving=0;delete Q.timer;Story.apply(s,st.fx);}
          else if(Q.timer<=0){Q.driving=0;delete Q.timer;UI.toast('Too slow. Farouk wants the car back at the garage.','bad');v.pos.set(S.pois.garage[0],S.h(S.pois.garage[0],S.pois.garage[1])+1.4,S.pois.garage[1]);v.speed=0;this.tryVehicle();}}}
    }
    if(S.race){const R=S.race;const P=S.player;const ring=S.rings[R.idx];
      if(ring){const d=P.pos.clone().add(new THREE.Vector3(0,1,0)).distanceTo(ring.pos);if(d<6.5){if(!R.on){R.on=true;R.t=0;UI.toast('Race started!','lvl');}ring.done=true;ring.mesh.material=Gen.emissive('#3ec9a7',1);R.idx++;AudioSys.sfx('pickup');if(S.rings[R.idx])S.rings[R.idx].mesh.material=Gen.emissive('#6fffb0',3);
          if(R.idx>=S.rings.length){const st=Story.cur(s,R.q);UI.toast(`Finished in ${R.t.toFixed(1)} s`,'lvl');if(R.t<=R.limit&&st)Story.apply(s,st.fx);else{UI.toast('Too slow. Try again.','bad');this.resetRace();}}}}
      if(R.on){R.t+=dt;s.quests[R.q].timer=Math.max(0,R.limit-R.t);if(R.t>R.limit+5){UI.toast('Out of time. Rings reset.','bad');this.resetRace();}}}
  },
  resetRace(){this.race.idx=0;this.race.on=false;this.race.t=0;delete G.state.quests[this.race.q].timer;this.rings.forEach((r,i)=>{r.done=false;r.mesh.material=Gen.emissive(i===0?'#6fffb0':'#f2a33a',3);});},

  /* ── Interaction ── */
  updateInteract(dt){
    const S=this,s=G.state,P=S.player;if(P.vehicle){UI.prompt('KeyF','Exit vehicle');return;}
    const pp=P.pos;const cand=[];
    for(const a of S.actors){if(a.kind==='npc'&&!a.dead&&a.pos.distanceTo(pp)<3.2&&!a.flee)cand.push({d:a.pos.distanceTo(pp),label:a.o.dlg||a.o.citizen?`Talk to ${a.o.name}`:a.o.name,act:()=>this.talk(a)});}
    for(const b of S.bodies){if(Object.keys(b.loot).length&&b.pos.distanceTo(pp)<2.4)cand.push({d:b.pos.distanceTo(pp),label:'Search body',act:()=>{for(const k in b.loot){if(k==='credits')Game.addCredits(b.loot[k]);else Game.giveItem(k,b.loot[k]);}b.loot={};AudioSys.sfx('pickup');}});}
    for(const o of S.ores){if(o.left>0&&o.pos.distanceTo(pp)<3)cand.push({d:o.pos.distanceTo(pp),label:`Mine ${ITEMS[o.ore].name} (Mining ${ITEMS[o.ore].lvl})`,hold:true,ore:o});}
    for(const i of S.interact){if(i.pos.distanceTo(pp)<i.r)cand.push({d:i.pos.distanceTo(pp)-1,label:i.label,hold:i.hold,it:i});}
    for(const v of S.vehicles){if(!v.dead&&v.pos.distanceTo(pp)<4)cand.push({d:v.pos.distanceTo(pp)+.5,key:'KeyF',label:v.civilian?'Steal vehicle':'Drive',act:()=>this.tryVehicle()});}
    if(S.shipDoor&&pp.distanceTo(S.shipDoor)<6)cand.push({d:pp.distanceTo(S.shipDoor),label:`Board the ${s.ship.name}`,act:()=>Game.boardShip()});
    if(S.interior){for(const st of S.stations||[]){if(st.pos.distanceTo(pp)<2.4)cand.push({d:st.pos.distanceTo(pp),label:st.label,act:st.act});}}
    cand.sort((a,b)=>a.d-b.d);const c=cand[0];
    if(!c){UI.prompt(null);S.holdT=0;return;}
    UI.prompt(c.key||'KeyE',c.label+(c.hold&&S.holdT>0?` · ${Math.round(S.holdT/(c.it?c.it.hold:1.4)*100)}%`:''));
    if(c.key==='KeyF')return;
    if(c.hold){
      if(Input.down('KeyE')){S.holdT=(S.holdT||0)+dt;
        if(c.ore){if(S.holdT>1.4){S.holdT=0;this.mineTick(c.ore);}if(Math.random()<.3){S.parts.burst(c.ore.pos,C(ORE_COL[c.ore.ore]),3,3,.2,.4,9);}}
        else if(S.holdT>=c.it.hold){S.holdT=0;const ok=c.it.fn();if(ok!==false){this.interact.splice(this.interact.indexOf(c.it),1);this.scene.remove(c.it.mesh);this.scene.remove(c.it.beam);AudioSys.sfx('quest');}}}
      else S.holdT=0;
    }else if(Input.hit('KeyE'))c.act();
  },
  mineTick(o){
    const s=G.state;const lv=levelFor(s.player.skills.mining);const req=ITEMS[o.ore].lvl;
    if(lv<req){UI.toast(`You need Mining ${req} to mine ${ITEMS[o.ore].name}.`,'bad');AudioSys.sfx('deny');return;}
    AudioSys.sfx('mine');const chance=U.clamp(.35+(lv-req)*.02+(s.crew.includes('ihru')?.1:0),0,.95);
    if(Math.random()<chance){Game.giveItem(o.ore,1);Game.addXP('mining',Math.round(25+req*4.5));o.left--;if(o.left<=0){o.mesh.visible=false;o.respawn=75;UI.toast('The vein is depleted.');}}
  },
  talk(a){
    const o=a.o;if(o.dlg&&DLG[o.dlg]){UI.dialogue(o.dlg,{name:o.name,role:o.role});return;}
    if(o.crewTalk){Game.crewTalk(o.crewTalk);return;}
    UI.toast(`${o.name}: ${L(Story.bark(G.state,this.site,o.role))}`);
  },

  /* ═══════════ Ship interior (bridge, corridor, engineering) ═══════════ */
  buildBridge(){
    const S=this,s=G.state;const r=U.rng(4);
    const wall=new THREE.MeshStandardMaterial({color:C('#3a4250'),roughness:.55,metalness:.4,map:Gen.panelTex('#c8d0da',41)});
    const floorM=new THREE.MeshStandardMaterial({color:C('#1e232c'),roughness:.35,metalness:.6,map:Gen.panelTex('#8a96a4',42)});
    const trim=Gen.emissive('#f2a33a',2),blue=Gen.emissive('#6fc8ff',2.2);
    const room=(x0,z0,x1,z1,h)=>{const w=x1-x0,d=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2;const fl=new THREE.Mesh(new THREE.BoxGeometry(w,.2,d),floorM);fl.position.set(cx,-.1,cz);fl.receiveShadow=true;S.scene.add(fl);
      const ce=new THREE.Mesh(new THREE.BoxGeometry(w,.2,d),wall);ce.position.set(cx,h+.1,cz);S.scene.add(ce);
      for(let i=0;i<Math.floor(w/4);i++){const lp=new THREE.Mesh(new THREE.BoxGeometry(2.4,.05,.5),Gen.emissive('#e8f0ff',2.5));lp.position.set(x0+2+i*4,h-.02,cz);S.scene.add(lp);}};
    // bridge
    room(-11,-9,11,6,5);room(-2,6,2,20,3.4);room(-8,20,8,32,6);
    const W=(x0,z0,x1,z1,h=5)=>S.addBox((x0+x1)/2,0,(z0+z1)/2,Math.max(.3,x1-x0),h,Math.max(.3,z1-z0),wall,{uvScale:4});
    W(-11.3,-9,-11,6);W(11,-9,11.3,6);W(-11,5.9,-2,6.2);W(2,5.9,11,6.2);W(-11,-9.3,11,-9,1.2);
    W(-2.3,6,-2,20,3.4);W(2,6,2.3,20,3.4);
    W(-8.3,20,-8,32,6);W(8,20,8.3,32,6);W(-8,31.9,8,32.2,6);W(-8,19.9,-2,20.2,6);W(2,19.9,8,20.2,6);
    // viewscreen
    const vm=new THREE.ShaderMaterial({uniforms:{time:{value:0},col:{value:C(Cosmos.get(s.loc.system).star?.color||'#fff4ea')},space:{value:G.state.loc.site?0:1},hor:{value:C(G.state.loc.site?(Cosmos.site(G.state.loc.site)?.sky.hor||'#445'):'#000')}},
      vertexShader:`varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:GLSL_NOISE+`uniform float time,space;uniform vec3 col,hor;varying vec2 vU;float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
        void main(){vec2 p=vU;vec3 c=vec3(.003,.004,.01);vec2 g=floor(p*vec2(220.,70.));float s=step(.994,h(g));c+=vec3(s)*1.4;
          c+=vec3(.2,.25,.45)*pow(fbm(vec3(p*3.,time*.02))*.5+.5,3.)*.4;
          if(space>.5){vec2 q=p-vec2(.72,.6);q.x*=3.;float d=length(q);c+=col*(smoothstep(.12,.1,d)*3.+exp(-d*8.)*.6);}
          else{c=mix(hor*.8,vec3(.02,.03,.06),smoothstep(.2,.8,p.y));c+=vec3(s)*.3*step(.5,p.y);}
          float scan=.92+.08*sin(p.y*700.+time*4.);gl_FragColor=vec4(c*scan*1.4,1.);}`});
    const vs=new THREE.Mesh(new THREE.PlaneGeometry(20,4.2),vm);vs.position.set(0,2.6,-8.95);S.scene.add(vs);S.viewscreen=vs;
    const frame=new THREE.Mesh(new THREE.BoxGeometry(20.6,.15,.3),trim);frame.position.set(0,.45,-8.9);S.scene.add(frame);const f2=frame.clone();f2.position.y=4.75;S.scene.add(f2);
    // consoles
    const consoleAt=(x,z,rot,label,col='#6fc8ff')=>{const g=new THREE.Group();const base=new THREE.Mesh(new THREE.BoxGeometry(1.8,1,.9),Gen.std('#20252e',{metalness:.7,roughness:.35}));base.position.y=.5;g.add(base);
      const scr=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.7),Gen.emissive(col,1.8));scr.position.set(0,1.15,.1);scr.rotation.x=-.6;g.add(scr);g.position.set(x,0,z);g.rotation.y=rot;S.scene.add(g);S.addCollider(x-.9,0,z-.6,x+.9,1,z+.6);return g;};
    const chair=(x,z,rot,big)=>{const g=new THREE.Group();const seat=new THREE.Mesh(new THREE.BoxGeometry(big?1.1:.7,.15,big?1:.7),Gen.std('#3a2a24',{roughness:.6}));seat.position.y=.55;g.add(seat);const back=new THREE.Mesh(new THREE.BoxGeometry(big?1.1:.7,big?1.3:.9,.15),Gen.std('#3a2a24',{roughness:.6}));back.position.set(0,1.15,big?.5:.35);g.add(back);
      const post=new THREE.Mesh(new THREE.CylinderGeometry(.08,.2,.55,10),Gen.std('#20252e',{metalness:.8}));post.position.y=.27;g.add(post);if(big){const arm=new THREE.Mesh(new THREE.BoxGeometry(.15,.12,.8),trim);arm.position.set(.6,.8,0);g.add(arm);const a2=arm.clone();a2.position.x=-.6;g.add(a2);}g.position.set(x,0,z);g.rotation.y=rot;S.scene.add(g);return g;};
    const stations={helm:[-2.2,-6.2,0],nav:[2.2,-6.2,0],science:[-8.5,-3,Math.PI/2],tactical:[8.5,-3,-Math.PI/2],comms:[-8.5,1.5,Math.PI/2],ops:[8.5,1.5,-Math.PI/2],xo:[-1.6,-.8,0],engineering:[0,29,Math.PI],medical:[-6,26,Math.PI/2],science2:[-8.5,-6,Math.PI/2],ops2:[8.5,-6,-Math.PI/2],archive:[6,26,-Math.PI/2]};
    for(const k of['helm','nav','science','tactical','comms','ops','science2','ops2'])consoleAt(...stations[k],k);
    chair(0,.2,0,true);chair(-1.6,-.2,0,false);chair(-2.2,-5.2,0);chair(2.2,-5.2,0);
    const rail=new THREE.Mesh(new THREE.TorusGeometry(4.2,.06,6,48,Math.PI),trim);rail.rotation.x=-Math.PI/2;rail.position.set(0,1,-2.4);rail.rotation.z=Math.PI;S.scene.add(rail);
    // engineering: warp core
    const core=new THREE.Group();const cyl=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,5.6,24,1,true),new THREE.MeshStandardMaterial({color:C('#0a1420'),transparent:true,opacity:.5,metalness:.9,roughness:.05}));cyl.position.y=2.8;core.add(cyl);
    const inner=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,5.4,16),Gen.emissive(s.ship.fit.drive==='torch'?'#ff8a3a':'#7fd4ff',4));inner.position.y=2.8;core.add(inner);
    for(let i=0;i<5;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(1.3,.08,8,32),trim);ring.rotation.x=Math.PI/2;ring.position.y=.6+i*1.1;core.add(ring);}
    core.position.set(0,0,26);S.scene.add(core);S.core=core;S.addCollider(-1.4,0,24.6,1.4,6,27.4);
    const pl=new THREE.PointLight(C(s.ship.fit.drive==='torch'?'#ff8a3a':'#7fd4ff'),3,18);pl.position.set(0,3,26);S.scene.add(pl);
    const bl=new THREE.PointLight(C('#cfe0ff'),1.4,30);bl.position.set(0,4,-2);S.scene.add(bl);
    consoleAt(-5.5,30,Math.PI,'fitting','#f2a33a');consoleAt(5.5,30,Math.PI,'cargo','#3ec9a7');
    // interactive stations
    S.stations=[
      {pos:new THREE.Vector3(0,0,.2),label:'Captain\'s chair · helm & navigation',act:()=>Game.helmMenu()},
      {pos:new THREE.Vector3(-5.5,0,29),label:'Fitting terminal',act:()=>UI.fitting(UI.where?{id:'ship',name:s.ship.name}:null,false)},
      {pos:new THREE.Vector3(5.5,0,29),label:'Cargo manifest',act:()=>UI.wrist('inv')},
      {pos:new THREE.Vector3(0,0,5),label:G.state.loc.site?'Disembark':'Airlock (sealed in space)',act:()=>{if(G.state.loc.site)Game.disembark();else UI.toast('We\'re in space, Captain. Take the helm to land or dock.');}},
    ];
    // crew at stations
    for(const id of s.crew){const c=CREW[id];const st=stations[c.station]||stations.ops;const sx=st[0]+Math.sin(st[2])*.9,sz=st[1]+Math.cos(st[2])*.9;
      const n=this.addNPC({name:c.name,role:c.role,crewTalk:id,crew:id,alien:c.alien},sx,sz,true);n.yaw=st[2]+Math.PI;}
    S.hemi.intensity=.55;
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   SPACE · in-system flight, combat, mining, docking, gates and warp.
   Distances are compressed about 1:50,000 so a system can be crossed with
   the cruise drive; everything else (relative sizes, colours, star types)
   follows the data.
   ═══════════════════════════════════════════════════════════════════════ */

const Space={
  scene:null,
  build(sysId,opts={}){
    const S=this;S.dispose();const s=G.state;const sys=Cosmos.get(sysId);S.sys=sys;S.sysId=sysId;
    S.scene=new THREE.Scene();G.scene=S.scene;S.bodies=[];S.ships=[];S.shots=[];S.rocks=[];S.fields=[];S.gates=[];S.time=0;S.spawnT=20+Math.random()*30;S.cruise=0;S.cruiseCharge=0;S.fa=true;S.target=null;S.warp=null;
    const cam=G.camera;cam.near=1;cam.far=600000;cam.fov=G.settings.fov;cam.updateProjectionMatrix();
    // backdrop
    const gal=sys.galaxy||'mw';const r=U.rng(U.hash(sysId));
    const toCore=new THREE.Vector3(1,0,0);let skyOpts={seed:U.hash(sysId)%100,band:gal==='mw'?1:.25,gn:[.15,.95,-.2],nebula:sys.nebula||(gal==='lmc'?'#ff5a8a':U.pick(r,['#3a4a8a','#2a5a6a','#5a3a7a','#6a3a3a'])),nebula2:U.pick(r,['#8a3a5a','#3a6a8a','#7a5a2a']),density:sys.kind==='nebula'?3:gal==='mw'&&Cosmos.distFromSol(sysId)>5000?1.8:1};
    if(gal!=='mw')skyOpts.galaxySprite={dir:[.4,.3,-.8],size:gal==='m31'?3800:gal==='lmc'||gal==='smc'?5200:1400,arms:4};
    if(sysId==='sgra')skyOpts.density=2.5;
    S.sky=Gen.spaceSky(skyOpts);S.scene.add(S.sky);
    // star
    const st=sys.star||{};const Rs=st.blackhole?420:U.clamp((st.R||.5)*520,120,st.giant?4200:1600);
    S.star=Gen.star(Rs,st.color||'#fff4ea',{blackhole:!!st.blackhole});S.scene.add(S.star);S.starR=Rs;
    const lc=st.blackhole?C('#ffb070'):C(st.color||'#fff4ea');S.light=new THREE.PointLight(lc,st.blackhole?1.6:2.2,0,0);S.scene.add(S.light);
    S.scene.add(new THREE.AmbientLight(C('#1a2233'),.55));
    if(sys.companions)for(const c of sys.companions){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.glowTex(),color:C(c.color),blending:THREE.AdditiveBlending,depthWrite:false}));sp.material.color.multiplyScalar(c.mag*2);sp.position.set(...c.dir).normalize().multiplyScalar(300000);sp.scale.setScalar(9000);S.scene.add(sp);}
    // bodies
    const addBody=(b,parent)=>{
      const base=parent?parent.pos:new THREE.Vector3();const ang=b.ang||0;const pos=new THREE.Vector3(Math.cos(ang)*b.orbit,(b.inc||0)*b.orbit,Math.sin(ang)*b.orbit).add(base);
      if(b.type==='belt'){this.makeBelt(b);return;}
      const o={def:b,pos,r:b.r||0,name:b.name};
      if(b.type==='station'){const m=Gen.station(b.big,b.engineer);m.position.copy(pos);m.rotation.set(.3,ang,0);this.scene.add(m);o.mesh=m;o.r=m.userData.radius;o.dock=b.dock;}
      else if(b.type==='gate'){const on=!b.flag||s.flags[b.flag]||s.flags.deepgates&&sysId.startsWith('GATE.');const m=Gen.gate(b.r,on);m.position.copy(pos);m.lookAt(0,0,0);this.scene.add(m);o.mesh=m;o.gate=true;o.active=on;this.gates.push(o);}
      else if(b.type==='dyson'){this.makeDyson(Rs);return;}
      else if(b.type==='anomaly'){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.glowTex(),color:C('#a38cff'),blending:THREE.AdditiveBlending,depthWrite:false}));sp.material.color.multiplyScalar(3);sp.position.copy(pos);sp.scale.setScalar(900);this.scene.add(sp);o.mesh=sp;o.r=60;o.anomaly=true;}
      else if(b.type==='wreck'){const m=Gen.ship('bastion',{},'#5a6070',{scale:6});m.position.copy(pos);m.rotation.set(.6,1.2,.3);this.scene.add(m);o.mesh=m;o.r=200;}
      else{const m=new THREE.Mesh(new THREE.SphereGeometry(b.r,96,48),Gen.planetMaterial(b,U.hash(b.id)));m.position.copy(pos);m.rotation.z=(r()-.5)*.4;this.scene.add(m);o.mesh=m;
        if(b.atmo){const a=Gen.atmosphere(b.r,b.atmo);a.position.copy(pos);this.scene.add(a);o.atmo=a;}
        if(b.rings){const rg=Gen.rings(b.r,b.pal[2]||'#d8c89a');rg.position.copy(pos);this.scene.add(rg);o.rings=rg;}
        if(!parent&&b.orbit>0){const pts=[];for(let i=0;i<=128;i++){const a=i/128*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*b.orbit,0,Math.sin(a)*b.orbit));}const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:C('#2a3a52'),transparent:true,opacity:.35}));this.scene.add(ln);}}
      o.site=b.site;this.bodies.push(o);
      if(b.station){const sm=Gen.station(false,false);sm.position.copy(pos).add(new THREE.Vector3(...b.station.off));this.scene.add(sm);this.bodies.push({def:{type:'station',name:b.station.name},name:b.station.name,pos:sm.position,r:sm.userData.radius,mesh:sm,dock:b.station.id});}
      for(const m of b.moons||[])addBody(m,o);
    };
    for(const b of sys.bodies||[])addBody(b,null);
    // player ship
    this.buildPlayerShip();
    const P=S.P;
    if(opts.from==='gate'){const g=this.gates[0];P.pos.copy(g?g.pos:new THREE.Vector3(8000,0,0)).add(new THREE.Vector3(0,120,0));}
    else if(opts.fromBody){const b=this.bodies.find(x=>x.site===opts.fromBody||x.dock===opts.fromBody);if(b){const out=b.pos.clone().normalize();const side=new THREE.Vector3(-out.z,0,out.x);P.pos.copy(b.pos).addScaledVector(out,b.r*1.6+150).addScaledVector(side,b.r*1.1).add(new THREE.Vector3(0,b.r*.35,0));S._lookAt=b.pos.clone().addScaledVector(side,-b.r*.2);}}
    else{const first=this.bodies.find(b=>b.site)||this.bodies[0];const ref=first?first.pos:new THREE.Vector3(6000,0,0);P.pos.copy(ref).add(ref.clone().normalize().multiplyScalar((first?first.r:0)*3+3000)).add(new THREE.Vector3(0,600,0));}
    const look=S._lookAt||(this.bodies.find(b=>b.site)||{pos:new THREE.Vector3()}).pos;S._lookAt=null;P.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(look,P.pos,new THREE.Vector3(0,1,0)));
    P.vel.set(0,0,0);S.camPos=P.pos.clone();
    S.parts=new Gen.Particles(S.scene,1400);
    S.tunnel=Gen.warpTunnel();S.tunnel.visible=false;S.scene.add(S.tunnel);
    // ambient traffic
    const ctl=Story.controlOf(s,sys);const nTraffic=sys.bodies&&sys.bodies.length>2?(ctl==='concord'?7:ctl?5:2):1;
    for(let i=0;i<nTraffic;i++)this.spawnNPCShip(ctl==='syndicate'?'syndicate':ctl&&ctl.startsWith('civ:')?ctl:ctl||'frontier','trader');
    if(ctl==='concord'||ctl==='frontier')for(let i=0;i<2;i++)this.spawnNPCShip(ctl,'patrol');
    this.syncQuestShips();
    AudioSys.setAmbient({wind:0,drone:[36,54,72],vol:.1});
    G.state.loc.interior=false;
    return S;
  },
  dispose(){if(!this.scene)return;this.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();});this.scene=null;U.$('#brackets')&&(U.$('#brackets').innerHTML='');},
  makeBelt(b){
    const r=U.rng(U.hash(b.id));const fields=3;const s=G.state;
    for(let f=0;f<fields;f++){const a=r()*6.28;const c=new THREE.Vector3(Math.cos(a)*b.orbit,(r()-.5)*200,Math.sin(a)*b.orbit);const field={center:c,name:`${b.name} · field ${String.fromCharCode(65+f)}`,hostile:b.hostile};this.fields.push(field);
      const n=90;const geos=[0,1,2,3].map(i=>Gen.asteroid(U.hash(b.id)+i*7,1));const mat=new THREE.MeshStandardMaterial({color:C('#6a625a'),roughness:.95,map:Gen.detailTex()});
      for(const [gi,geo] of geos.entries()){const inst=new THREE.InstancedMesh(geo,mat,n/4);const m=new THREE.Matrix4();for(let i=0;i<n/4;i++){const p=c.clone().add(new THREE.Vector3((r()-.5)*b.width,(r()-.5)*b.width*.25,(r()-.5)*b.width));const sc=8+Math.pow(r(),3)*90;m.compose(p,new THREE.Quaternion().setFromEuler(new THREE.Euler(r()*6,r()*6,r()*6)),new THREE.Vector3(sc,sc*(.6+r()*.5),sc));inst.setMatrixAt(i,m);}this.scene.add(inst);}
      for(let i=0;i<14;i++){const ore=U.pick(r,b.ores);const sc=14+r()*22;const m=new THREE.Mesh(Gen.asteroid(U.hash(b.id)+f*100+i,sc),new THREE.MeshStandardMaterial({color:C('#5a524a'),roughness:.9,emissive:C(ORE_COL[ore]),emissiveIntensity:ore==='sifarite'?.5:.12}));
        m.position.copy(c).add(new THREE.Vector3((r()-.5)*b.width*.8,(r()-.5)*b.width*.2,(r()-.5)*b.width*.8));this.scene.add(m);this.rocks.push({mesh:m,ore,left:6+Math.floor(r()*10),r:sc*1.3,pos:m.position,rot:new THREE.Vector3(r()*.2,r()*.2,r()*.2)});}
      if(b.hostile)for(let i=0;i<3;i++)this.spawnNPCShip('engineers','sentinel',c.clone().add(new THREE.Vector3((r()-.5)*600,0,(r()-.5)*600)));
    }
  },
  makeDyson(Rs){const n=1800;const inst=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:C('#1a1a20'),metalness:.9,roughness:.2,emissive:C('#f2a33a'),emissiveIntensity:.15,side:THREE.DoubleSide}),n);const m=new THREE.Matrix4();const r=U.rng(9);
    for(let i=0;i<n;i++){const v=new THREE.Vector3(r()*2-1,r()*2-1,r()*2-1).normalize();const R=Rs*(2.2+r()*1.4);const p=v.clone().multiplyScalar(R);const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),v);const s=40+r()*120;m.compose(p,q,new THREE.Vector3(s,s,1));inst.setMatrixAt(i,m);}this.scene.add(inst);this.dyson=inst;},

  /* ── Ship stats applied to physics ── */
  buildPlayerShip(){
    const s=G.state;const st=Game.shipStats();
    if(this.P&&this.P.mesh)this.scene.remove(this.P.mesh);
    const mesh=Gen.ship(s.ship.hull,s.ship.fit,s.ship.paint||'#9fb0c2');this.scene.add(mesh);
    const P=this.P=Object.assign(this.P||{pos:new THREE.Vector3(),vel:new THREE.Vector3(),quat:new THREE.Quaternion(),throttle:0},{mesh,st,shield:Math.min(this.P?.shield??st.shield,st.shield),cap:100,lastHit:0,cd:{},radius:mesh.userData.radius});
    if(P.shield===undefined||isNaN(P.shield))P.shield=st.shield;
    const sh=new THREE.Mesh(new THREE.SphereGeometry(P.radius*1.15,32,16),new THREE.ShaderMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,uniforms:{a:{value:0},col:{value:C('#8fd0ff')}},
      vertexShader:`varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform float a;uniform vec3 col;varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.-abs(dot(vN,vV)),2.5);gl_FragColor=vec4(col*f*a*3.,f*a);}`}));mesh.add(sh);P.shieldMesh=sh;
  },
  refresh(){this.buildPlayerShip();},

  /* ── NPC ships ── */
  spawnNPCShip(faction,role,at,tag){
    const s=G.state;const r=Math.random;
    const hull=role==='trader'?U.pick(r,['mule','kestrel','wren']):role==='sentinel'?'seed':role==='patrol'?U.pick(r,['kestrel','lancer']):U.pick(r,['lancer','wren','kestrel']);
    const civ=faction&&faction.startsWith('civ:')?Cosmos.civById(faction.slice(4)):null;
    const paint=faction==='concord'?'#c8d4e4':faction==='frontier'?'#6a8a6a':faction==='syndicate'?'#5a3a34':faction==='engineers'?'#1c1a1e':civ?civ.color:'#8a8a8a';
    const fit={high:role==='trader'?[]:hull==='seed'?['nulllance']:['pulse1','pulse1'],drive:'warp1'};
    const mesh=Gen.ship(hull,fit,paint,{trim:faction==='syndicate'?'#ff5a4e':faction==='engineers'?'#f2a33a':'#8fd0e8',engine:faction==='syndicate'?'#ff7a4a':faction==='engineers'?'#ffcf7e':'#7fd4ff',scale:hull==='seed'?.6:1});
    const pos=at?at.clone():this.P.pos.clone().add(new THREE.Vector3((r()-.5)*6000,(r()-.5)*1500,(r()-.5)*6000));
    if(role==='trader'&&!at){const b=U.pick(r,this.bodies.filter(x=>x.site||x.dock)||[]);if(b)pos.copy(b.pos).add(new THREE.Vector3((r()-.5)*2000,(r()-.5)*400,(r()-.5)*2000));}
    mesh.position.copy(pos);this.scene.add(mesh);
    const H=HULLS[hull];const hostile=faction==='syndicate'||faction==='engineers'&&role==='sentinel'||(civ&&(civ.attitude<-.4||(s.rep['civ:'+civ.id]||0)<-20))||((faction==='concord'||faction==='frontier')&&(s.rep[faction]||0)<-40);
    const sh={mesh,pos:mesh.position,vel:new THREE.Vector3(),quat:new THREE.Quaternion().setFromEuler(new THREE.Euler(0,r()*6,0)),faction,role,hostile,tag,hull:H.hull*(role==='sentinel'?1.5:1)*(hull==='seed'?.6:1),shield:role==='trader'?100:200+(role==='sentinel'?400:0),maxShield:role==='trader'?100:200+(role==='sentinel'?400:0),speed:H.speed*(role==='trader'?.6:1),turn:H.turn*(role==='sentinel'?.7:1),dps:role==='trader'?0:role==='sentinel'?55:22,cd:0,radius:mesh.userData.radius,name:civ?`${civ.adj} ${role}`:`${FACTIONS[faction]?FACTIONS[faction].short:faction} ${role}`,dest:null,state:'cruise',t:0};
    sh.maxHull=sh.hull;this.ships.push(sh);return sh;
  },
  syncQuestShips(){
    const s=G.state;for(const q of Story.active(s)){const st=Story.cur(s,q);if(!st||!st.space)continue;if(st.target&&st.target.system&&st.target.system!==this.sysId)continue;if(s.quests[q]['sp_'+this.sysId+s.quests[q].stage])continue;s.quests[q]['sp_'+this.sysId+s.quests[q].stage]=1;
      const need=st.space.n-(s.quests[q].k||0);const at=this.P.pos.clone().add(new THREE.Vector3(3000,300,-2500));
      for(let i=0;i<need;i++){const sh=this.spawnNPCShip(st.space.faction,st.space.hull==='mule'?'trader':'raider',at.clone().add(new THREE.Vector3(i*200,0,i*150)),st.space.tag);sh.hostile=st.space.tag!=='convoy'?true:sh.hostile;sh.quest=true;if(st.space.tag==='convoy'){sh.hostile=false;sh.convoy=true;}}
      UI.toast(`Contacts on scope: ${st.space.n} ${st.space.tag==='convoy'?'convoy haulers':'raiders'}.`,'bad');}
  },

  /* ═══════════ Update ═══════════ */
  update(dt){
    const S=this,s=G.state,P=S.P;if(!S.scene)return;S.time+=dt;
    if(S.warp){this.updateWarp(dt);}
    else if(!G.paused&&!G.cine)this.updateFlight(dt);
    if(!G.paused){this.updateShips(dt);this.updateShots(dt);this.spawnEvents(dt);}
    S.parts.update(dt);
    // visuals
    S.sky.position.copy(G.camera.position);
    const sunDir=new THREE.Vector3();
    for(const b of S.bodies){if(b.mesh&&b.mesh.material&&b.mesh.material.uniforms&&b.mesh.material.uniforms.sunDir){sunDir.copy(b.pos).negate().normalize();b.mesh.material.uniforms.sunDir.value.copy(sunDir);b.mesh.material.uniforms.time.value=G.time;b.mesh.rotation.y+=dt*.004;}
      if(b.atmo)b.atmo.material.uniforms.sunDir.value.copy(sunDir);if(b.gate&&b.mesh.userData.vm)b.mesh.userData.vm.uniforms.time.value=G.time;if(b.def.type==='station'&&b.mesh)b.mesh.rotation.z+=dt*.05;}
    if(S.star.userData.mat)S.star.userData.mat.uniforms.time.value=G.time;if(S.star.userData.disk)S.star.userData.disk.material.uniforms.time.value=G.time;
    if(S.dyson)S.dyson.rotation.y+=dt*.01;
    for(const rk of S.rocks){rk.mesh.rotation.x+=rk.rot.x*dt;rk.mesh.rotation.y+=rk.rot.y*dt;}
    this.hud();
  },
  updateFlight(dt){
    const S=this,s=G.state,P=S.P,st=P.st;
    const sens=.0018*G.settings.sens;const turn=st.turn*(G.vats?.5:1);
    const mdx=U.clamp(Input.mdx*sens,-turn*dt*1.3,turn*dt*1.3),mdy=U.clamp(Input.mdy*sens*(G.settings.invertY?-1:1),-turn*dt*1.3,turn*dt*1.3);
    const ax=Input.axis();
    const roll=(Input.down('KeyQ')?1:0)-(Input.down('KeyE')?1:0);
    const q=P.quat;
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-mdx-(Input.touch?ax.x*turn*dt:0)));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-mdy));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),roll*turn*dt*.9));q.normalize();
    const fwd=new THREE.Vector3(0,0,1).applyQuaternion(q),right=new THREE.Vector3(1,0,0).applyQuaternion(q),up=new THREE.Vector3(0,1,0).applyQuaternion(q);
    if(Input.hit('KeyX')){S.fa=!S.fa;UI.toast(`Flight assist ${S.fa?'on':'off'}`);}
    if(Input.hit('KeyC')){if(S.cruise>0||S.cruiseCharge>0){S.cruise=0;S.cruiseCharge=0;UI.toast('Cruise disengaged');}else{S.cruiseCharge=2.2;AudioSys.sfx('shield');UI.toast('Cruise drive charging');}}
    if(S.cruiseCharge>0){S.cruiseCharge-=dt;if(S.cruiseCharge<=0){S.cruise=1;AudioSys.sfx('engine');}}
    // nearest body distance governs cruise speed (gravity-well braking)
    let nd=Infinity,nb=null;for(const b of S.bodies){const d=P.pos.distanceTo(b.pos)-b.r;if(d<nd){nd=d;nb=b;}}const dStar=P.pos.length()-S.starR;if(dStar<nd){nd=dStar;nb=null;}
    const boost=(Input.down('ShiftLeft')&&P.cap>5)?(1.9+(st.boost||0)):1;if(boost>1)P.cap-=dt*28;else P.cap=Math.min(100,P.cap+dt*12);
    let maxV=st.speed*boost;
    if(S.cruise>0){const cv=U.clamp(nd*.6,600,32000);maxV=cv;if(nd<300){S.cruise=0;UI.toast('Cruise dropped: proximity');}
      P.vel.lerp(fwd.clone().multiplyScalar(maxV*Math.max(.2,(ax.y+1)/2)),1-Math.exp(-dt*1.2));Render.fx.warp=U.damp(Render.fx.warp,.25,2,dt);}
    else{Render.fx.warp=U.damp(Render.fx.warp,0,3,dt);
      const acc=st.speed*1.4;const thrust=new THREE.Vector3().addScaledVector(fwd,Input.touch?ax.y:ax.y).addScaledVector(right,Input.touch?0:ax.x).addScaledVector(up,(Input.down('KeyR')?1:0)-(Input.down('KeyF')?1:0));
      if(S.fa){P.throttle=U.clamp(P.throttle+ax.y*dt*.8,-.3,1);if(!Input.down('KeyW')&&!Input.down('KeyS')&&!Input.touch)P.throttle=P.throttle;const want=fwd.clone().multiplyScalar(P.throttle*maxV).addScaledVector(right,(Input.touch?0:ax.x)*maxV*.4).addScaledVector(up,((Input.down('KeyR')?1:0)-(Input.down('KeyF')?1:0))*maxV*.4);P.vel.lerp(want,1-Math.exp(-dt*2.2));}
      else{P.vel.addScaledVector(thrust,acc*dt*boost);if(P.vel.length()>maxV*1.5)P.vel.setLength(maxV*1.5);}}
    if(Input.touch&&Input.tBtn.has('Boost'))P.throttle=1;
    P.pos.addScaledVector(P.vel,dt);
    // collisions with bodies
    for(const b of S.bodies){if(b.def.type==='gate'||b.anomaly)continue;const d=P.pos.distanceTo(b.pos);const R=b.r*(b.def.type==='station'?.6:1)+P.radius;if(d<R){const n=P.pos.clone().sub(b.pos).normalize();P.pos.copy(b.pos).addScaledVector(n,R);const vn=P.vel.dot(n);if(vn<0){this.damagePlayer(Math.abs(vn)*.6);P.vel.addScaledVector(n,-vn*1.6);S.cruise=0;}}}
    if(P.pos.length()<S.starR*1.05){this.damagePlayer(400*dt);P.pos.setLength(S.starR*1.05);}
    for(const rk of S.rocks){if(rk.left<=0)continue;const d=P.pos.distanceTo(rk.pos);if(d<rk.r+P.radius){const n=P.pos.clone().sub(rk.pos).normalize();P.pos.copy(rk.pos).addScaledVector(n,rk.r+P.radius);const vn=P.vel.dot(n);if(vn<0){P.vel.addScaledVector(n,-vn*1.5);if(vn<-60)this.damagePlayer(-vn*.3);}}}
    // gates
    for(const g of S.gates){const d=P.pos.distanceTo(g.pos);if(d<g.def.r*.9){if(g.active){if(!S._gateCd){S._gateCd=1;P.vel.multiplyScalar(0);UI.gatePicker();setTimeout(()=>S._gateCd=0,4000);}}else if(!S._gw){S._gw=1;UI.toast('The gate is dormant. Its lights do not answer.');setTimeout(()=>S._gw=0,6000);}}}
    // mesh
    P.mesh.position.copy(P.pos);P.mesh.quaternion.copy(P.quat);
    const thr=S.cruise?1:U.clamp(P.vel.length()/Math.max(1,st.speed),0,1.5);for(const gl of P.mesh.userData.glows){gl.scale.setScalar(P.mesh.userData.length*(.06+thr*.32)*(boost>1?1.6:1));}
    if(P.mesh.userData.warpRing)P.mesh.userData.warpRing.material.color.setScalar(S.cruise?4:1.5+Math.sin(G.time*3)*.3);
    // shields regen
    if(S.time-P.lastHit>3)P.shield=Math.min(st.shield,P.shield+st.regen*dt);
    P.shieldMesh.material.uniforms.a.value=U.damp(P.shieldMesh.material.uniforms.a.value,0,4,dt);
    if(s.crew.includes('mara')&&s.ship.hp<st.hull)s.ship.hp=Math.min(st.hull,s.ship.hp+dt*2);
    // weapons & mining
    this.updateWeapons(dt,fwd);
    if(Input.hit('KeyT'))this.cycleTarget();
    if(Input.hit('KeyL'))this.tryLand(nb);
    if(Input.hit('KeyI'))Game.goBridge();
    // camera
    const L=P.mesh.userData.length;const camOff=new THREE.Vector3(0,L*.32,-L*1.5-Math.min(40,P.vel.length()*.03)).applyQuaternion(P.quat);
    const target=P.pos.clone().add(camOff);S.camPos.lerp(target,1-Math.exp(-dt*(S.cruise?12:7)));G.camera.position.copy(S.camPos);
    const lookAt=P.pos.clone().addScaledVector(fwd,L*4);G.camera.up.copy(up);G.camera.lookAt(lookAt);
    if(S.shake>0){S.shake=U.damp(S.shake,0,5,dt);G.camera.position.add(new THREE.Vector3((Math.random()-.5)*S.shake,(Math.random()-.5)*S.shake,(Math.random()-.5)*S.shake));}
    G.camera.fov=U.damp(G.camera.fov,G.settings.fov*(S.cruise?1.18:boost>1?1.1:1),4,dt);G.camera.updateProjectionMatrix();
    // engine particles
    if(thr>.1&&Math.random()<.6)for(const e of P.mesh.userData.glows){const wp=e.getWorldPosition(new THREE.Vector3());S.parts.emit(wp,fwd.clone().multiplyScalar(-40-thr*60).add(P.vel.clone().multiplyScalar(.9)),C(P.mesh.userData.engineCol),L*.06,.5,0);}
  },
  updateWeapons(dt,fwd){
    const S=this,s=G.state,P=S.P,st=P.st;
    const fireC=Input.fire(),fireM=Input.mb[2]||Input.tBtn.has('Mine');
    (s.ship.fit.high||[]).forEach((m,i)=>{if(!m)return;const M=MODULES[m];P.cd[i]=(P.cd[i]||0)-dt;const mining=M.kind==='mine';const trig=mining?(fireM||(fireC&&!st.dps)):fireC;if(!trig||P.cd[i]>0)return;
      const hp=P.mesh.userData.hardpoints[i]?P.mesh.userData.hardpoints[i].clone().applyQuaternion(P.quat).add(P.pos):P.pos.clone();
      let dir=fwd.clone();if(S.target&&!mining&&!S.target.dead){const to=S.target.pos.clone().sub(hp);const lead=this.lead(hp,S.target,M.kind==='laser'||M.kind==='null'?1e9:M.kind==='rail'?2600:M.kind==='missile'?900:1200);const ld=lead.sub(hp).normalize();if(ld.dot(fwd)>.93)dir=ld;}
      const dmgMul=(1+(st.dmgBonus||0))*(s.crew.includes('yara')?1.15:1)*(1+levelFor(s.player.skills.piloting)/300);
      if(mining){P.cd[i]=.25;this.mineBeam(hp,dir,M,dt);return;}
      if(M.kind==='laser'||M.kind==='null'){P.cd[i]=M.kind==='null'?.9:.18;this.beam(hp,dir,M.range,M.dps*(M.kind==='null'?.9:.18)*dmgMul,M.kind==='null'?'#ffcf7e':'#ff6a5a','player');AudioSys.sfx(M.kind==='null'?'null':'laser',.5);}
      else if(M.kind==='rail'){P.cd[i]=.8;this.shoot(hp,dir.multiplyScalar(2600).add(P.vel),M.dps*.8*dmgMul,'#e8f4ff','player',1.2,6);AudioSys.sfx('rifle');}
      else if(M.kind==='plasma'){P.cd[i]=.45;this.shoot(hp,dir.multiplyScalar(1200).add(P.vel),M.dps*.45*dmgMul,'#b58cff','player',1.3,9);AudioSys.sfx('laser');}
      else if(M.kind==='missile'){P.cd[i]=1.2;const sh=this.shoot(hp,dir.multiplyScalar(500).add(P.vel),M.dps*1.2*dmgMul,'#ff9f6b','player',4,5);sh.homing=S.target;AudioSys.sfx('shotgun',.4);}
      P.cap=Math.max(0,P.cap-.6);
    });
  },
  lead(from,t,speed){const to=t.pos.clone().sub(from);const tt=to.length()/speed;return t.pos.clone().addScaledVector(t.vel||new THREE.Vector3(),tt);},
  beam(from,dir,range,dmg,col,owner){
    const S=this;let best=range,hit=null;
    for(const sh of S.ships){if(sh.dead||(owner==='player'?false:sh===owner))continue;if(owner!=='player'&&owner.faction===sh.faction)continue;const t=Surface.raySphere(from,dir,sh.pos,sh.radius);if(t>0&&t<best){best=t;hit=sh;}}
    if(owner!=='player'){const t=Surface.raySphere(from,dir,S.P.pos,S.P.radius);if(t>0&&t<best){best=t;hit='player';}}
    for(const rk of S.rocks){if(rk.left<=0)continue;const t=Surface.raySphere(from,dir,rk.pos,rk.r);if(t>0&&t<best){best=t;hit=null;}}
    const end=from.clone().addScaledVector(dir,best);
    const geo=new THREE.BufferGeometry().setFromPoints([from,end]);const m=new THREE.LineBasicMaterial({color:C(col),transparent:true,blending:THREE.AdditiveBlending});m.color.multiplyScalar(6);const l=new THREE.Line(geo,m);S.scene.add(l);setTimeout(()=>{S.scene&&S.scene.remove(l);geo.dispose();},70);
    if(hit==='player')this.damagePlayer(dmg);else if(hit)this.damageShip(hit,dmg,owner);
    if(hit)S.parts.burst(end,C(col),6,40,6,.3);
  },
  mineBeam(from,dir,M,dt){
    const S=this,s=G.state;let best=M.range,hit=null;for(const rk of S.rocks){if(rk.left<=0)continue;const t=Surface.raySphere(from,dir,rk.pos,rk.r);if(t>0&&t<best){best=t;hit=rk;}}
    // gas giant scoop: aim at a gas giant from close range
    let scoop=null;for(const b of S.bodies){if(!b.def.scoop)continue;const t=Surface.raySphere(from,dir,b.pos,b.r*1.02);if(t>0&&t<Math.min(best,b.r*.6)){scoop=b;best=t;}}
    const end=from.clone().addScaledVector(dir,best);const geo=new THREE.BufferGeometry().setFromPoints([from,end]);const m=new THREE.LineBasicMaterial({color:C('#6fffb0'),transparent:true,blending:THREE.AdditiveBlending});m.color.multiplyScalar(5);const l=new THREE.Line(geo,m);S.scene.add(l);setTimeout(()=>{S.scene&&S.scene.remove(l);geo.dispose();},240);
    const lv=levelFor(s.player.skills.mining);
    if(scoop){if(lv<ITEMS.he3.lvl){UI.toast(`Gas scooping needs Mining ${ITEMS.he3.lvl}. (Tip: train on belt ore first.)`,'bad');return;}
      if(Math.random()<.35+lv*.006){Game.giveItem('he3',1);Game.addXP('mining',60);}this.damagePlayer(3,true);S.parts.burst(end,C('#9fe3ff'),4,20,5,.4);AudioSys.sfx('mine');return;}
    if(!hit)return;S.parts.burst(end,C(ORE_COL[hit.ore]),4,30,4,.5);AudioSys.sfx('mine');
    const req=ITEMS[hit.ore].lvl;if(lv<req){if(!S._mw){S._mw=1;UI.toast(`Mining ${req} needed for ${ITEMS[hit.ore].name}.`,'bad');setTimeout(()=>S._mw=0,4000);}return;}
    if(Math.random()<(.3+(lv-req)*.015)*M.mine){const n=s.crew.includes('ihru')&&Math.random()<.25?2:1;if(Game.load()+ITEMS[hit.ore].w*n>Game.capacity()){UI.toast('Cargo hold full.','bad');return;}Game.giveItem(hit.ore,n);Game.addXP('mining',Math.round(20+req*4));hit.left--;
      if(hit.left<=0){S.parts.burst(hit.pos,C(ORE_COL[hit.ore]),60,60,12,1.2);hit.mesh.visible=false;UI.toast('Asteroid depleted.');}}
  },
  shoot(from,vel,dmg,col,owner,life=3,size=6){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:Gen.sparkTex(),color:C(col),blending:THREE.AdditiveBlending,depthWrite:false}));m.material.color.multiplyScalar(4);m.scale.setScalar(size);m.position.copy(from);this.scene.add(m);const sh={mesh:m,pos:m.position,vel,dmg,owner,life,col};this.shots.push(sh);return sh;},
  updateShots(dt){
    const S=this;for(const sh of S.shots){sh.life-=dt;if(sh.homing&&!sh.homing.dead){const to=sh.homing.pos.clone().sub(sh.pos).normalize();sh.vel.lerp(to.multiplyScalar(Math.max(700,sh.vel.length()+dt*400)),1-Math.exp(-dt*3));S.parts.emit(sh.pos,new THREE.Vector3(),C('#ff9f6b'),4,.5);}
      const a0=sh.pos.clone();sh.pos.addScaledVector(sh.vel,dt);const seg=sh.pos.clone().sub(a0);const sl=seg.lengthSq();
      const near=(c)=>{const t=sl>0?U.clamp(c.clone().sub(a0).dot(seg)/sl,0,1):0;return a0.clone().addScaledVector(seg,t).distanceTo(c);};
      if(sh.owner==='player'){for(const t of S.ships){if(t.dead)continue;if(near(t.pos)<t.radius+4){this.damageShip(t,sh.dmg,'player');sh.life=0;S.parts.burst(sh.pos.clone(),C(sh.col),10,50,6,.4);break;}}}
      else if(near(S.P.pos)<S.P.radius+3){this.damagePlayer(sh.dmg);sh.life=0;S.parts.burst(sh.pos.clone(),C(sh.col),10,50,6,.4);}
      else for(const t of S.ships){if(t.dead||t===sh.owner||t.faction===sh.owner.faction)continue;if(near(t.pos)<t.radius+4){this.damageShip(t,sh.dmg,sh.owner);sh.life=0;break;}}}
    S.shots=S.shots.filter(sh=>{if(sh.life<=0){S.scene.remove(sh.mesh);return false;}return true;});
  },
  damagePlayer(d,heat){const S=this,s=G.state,P=S.P;P.lastHit=S.time;if(!heat)S.shake=Math.max(S.shake||0,Math.min(20,d*.3));
    if(P.shield>0){const a=Math.min(P.shield,d);P.shield-=a;d-=a;P.shieldMesh.material.uniforms.a.value=1;if(!heat)AudioSys.sfx('shield');}
    if(d>0){s.ship.hp-=d;Render.fx.damage=Math.min(1,Render.fx.damage+d/80);if(!heat)AudioSys.sfx('hurt');}
    if(s.ship.hp<=0)this.destroyed();},
  damageShip(t,d,by){if(t.dead)return;if(by==='player'&&!t.hostile){t.hostile=true;if(t.faction==='concord'||t.faction==='frontier'){Game.addRep(t.faction,-8);G.state.wanted=Math.min(5,(G.state.wanted||0)+1);UI.toast(`You fired on a ${FACTIONS[t.faction].short} ship.`,'bad');for(const o of this.ships)if(o.faction===t.faction&&o.role==='patrol')o.hostile=true;}if(t.faction.startsWith('civ:'))Game.addRep(t.faction,-10);}
    t.aggro=by;if(t.shield>0){const a=Math.min(t.shield,d);t.shield-=a;d-=a;}t.hull-=d;t.lastHit=this.time;if(t.hull<=0)this.killShip(t,by);},
  killShip(t,by){const S=this,s=G.state;t.dead=true;S.scene.remove(t.mesh);AudioSys.sfx('explode',Math.max(.2,1-t.pos.distanceTo(S.P.pos)/5000));
    S.parts.burst(t.pos.clone(),C('#ffb060'),120,160,18,1.6);S.parts.burst(t.pos.clone(),C('#ffffff'),30,60,30,.3);
    const fl=new THREE.PointLight(C('#ffa050'),20,4000);fl.position.copy(t.pos);S.scene.add(fl);setTimeout(()=>S.scene&&S.scene.remove(fl),300);
    if(S.target===t)S.target=null;
    if(by==='player'){s.stats.kills++;Game.addXP('piloting',t.role==='sentinel'?1400:450);Game.addXP('combat',120);
      if(t.faction==='syndicate'){Game.addRep('syndicate',-2);Game.addRep('concord',1);Game.addCredits(t.role==='sentinel'?0:250);}
      if(t.role==='sentinel'){Game.giveItem('relic',1);if(Math.random()<.6)Game.giveItem('sifarite',1+Math.floor(Math.random()*2));}
      if(t.role==='trader'&&t.faction!=='syndicate'){Game.giveItem(U.pick(Math.random,['food','machinery','electronics','meds']),2+Math.floor(Math.random()*4));Game.addRep('syndicate',2);}
      Story.event(s,'spacekill',{tag:t.tag||(t.role!=='trader'&&t.faction==='syndicate'?'bounty':'')});}},
  destroyed(){const s=G.state;if(this._dead)return;this._dead=true;AudioSys.sfx('explode');UI.fade(true,'Hull breach. Emergency pod launched.');
    setTimeout(()=>{this._dead=false;const cost=Math.min(s.credits,Math.round(HULLS[s.ship.hull].cost*.1+500));Game.addCredits(-cost);s.ship.hp=Game.shipStats().hull*.5;s.wanted=0;UI.toast(`Insurance claim: ${U.fmt(cost)} cr. Your ship was recovered and patched.`,'bad');
      const back=s.lastSafe||{system:'sol',site:'earth'};Game.goSurface(back.site,{system:back.system});UI.fade(false);},2200);},
  cycleTarget(){const S=this;const list=S.ships.filter(s=>!s.dead&&s.pos.distanceTo(S.P.pos)<12000).sort((a,b)=>(b.hostile-a.hostile)||a.pos.distanceTo(S.P.pos)-b.pos.distanceTo(S.P.pos));if(!list.length){S.target=null;return;}const i=list.indexOf(S.target);S.target=list[(i+1)%list.length];AudioSys.sfx('ui');},

  /* ── NPC ship AI ── */
  updateShips(dt){
    const S=this,P=S.P,s=G.state;
    for(const t of S.ships){if(t.dead)continue;t.t-=dt;t.cd-=dt;
      if(t.lastHit&&S.time-t.lastHit>4)t.shield=Math.min(t.maxShield,t.shield+dt*10);
      let goal=null,spd=t.speed;
      const enemy=t.hostile?P:null;const dP=t.pos.distanceTo(P.pos);
      // patrols engage hostile pirates nearby
      let foe=null;if(t.role==='patrol'){foe=S.ships.find(o=>!o.dead&&o.faction==='syndicate'&&o.pos.distanceTo(t.pos)<3000);}
      if(!foe&&t.hostile&&dP<6000&&!(s.flags.gate_throat&&false))foe='player';
      if(t.convoy&&t.aggro)t.hostile=false;
      if(foe){const fp=foe==='player'?P.pos:foe.pos;const fv=foe==='player'?P.vel:foe.vel;const d=t.pos.distanceTo(fp);
        if(d>500||t.state==='break'){goal=fp.clone().addScaledVector(fv,.8);if(t.state==='break'&&t.t<0)t.state='attack';}else{goal=t.pos.clone().add(t.vel.clone().normalize().multiplyScalar(800)).add(new THREE.Vector3((Math.random()-.5)*600,(Math.random()-.5)*600,(Math.random()-.5)*600));t.state='break';t.t=2+Math.random()*2;}
        const fwd=new THREE.Vector3(0,0,1).applyQuaternion(t.quat);const to=fp.clone().sub(t.pos).normalize();
        if(t.dps>0&&t.cd<=0&&fwd.dot(to)>.96&&d<1600){t.cd=t.role==='sentinel'?1.6:.55+Math.random()*.4;
          const from=t.pos.clone().addScaledVector(fwd,t.radius);
          if(t.role==='sentinel')this.beam(from,to,1600,t.dps*1.6,'#ffcf7e',t);else this.shoot(from,to.clone().multiplyScalar(1100).add(t.vel),t.dps*.55,t.faction==='concord'?'#6fa8ff':'#ff5a4e',t,2.4,7);
          if(foe==='player')AudioSys.sfx('enemyshot',Math.max(.15,1-d/2500));}
        if(t.hull<t.maxHull*.25&&t.role!=='sentinel'){goal=t.pos.clone().add(t.pos.clone().sub(fp).normalize().multiplyScalar(3000));spd*=1.3;}}
      else if(t.role==='trader'||t.role==='patrol'){if(!t.dest||t.pos.distanceTo(t.dest)<400||t.t<0){const b=U.pick(Math.random,S.bodies.filter(x=>x.site||x.dock));t.dest=b?b.pos.clone().add(new THREE.Vector3((Math.random()-.5)*b.r*3,(Math.random()-.5)*b.r,(Math.random()-.5)*b.r*3)):new THREE.Vector3((Math.random()-.5)*20000,0,(Math.random()-.5)*20000);t.t=120;}goal=t.dest;spd*=t.pos.distanceTo(t.dest)>4000?6:1;}
      else{goal=t.pos.clone().add(new THREE.Vector3(Math.sin(S.time*.2+t.radius)*300,0,Math.cos(S.time*.2)*300));spd*=.4;}
      if(goal){const want=goal.clone().sub(t.pos).normalize();const cur=new THREE.Vector3(0,0,1).applyQuaternion(t.quat);const axis=new THREE.Vector3().crossVectors(cur,want);const ang=Math.asin(U.clamp(axis.length(),-1,1))*(cur.dot(want)<0?-1:1);
        if(axis.lengthSq()>1e-6){axis.normalize();t.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(axis,U.clamp(cur.dot(want)<0?Math.PI:ang,-t.turn*dt,t.turn*dt)));}
        const fwd=new THREE.Vector3(0,0,1).applyQuaternion(t.quat);t.vel.lerp(fwd.multiplyScalar(spd),1-Math.exp(-dt*1.5));}
      t.pos.addScaledVector(t.vel,dt);t.mesh.quaternion.copy(t.quat);
      for(const gl of t.mesh.userData.glows)gl.scale.setScalar(t.mesh.userData.length*(.2+U.clamp(t.vel.length()/t.speed,0,2)*.3));
      if(t.pos.distanceTo(P.pos)>40000&&!t.quest&&t.role!=='sentinel'){t.dead=true;S.scene.remove(t.mesh);}
    }
    S.ships=S.ships.filter(t=>!t.dead);
  },
  spawnEvents(dt){
    const S=this,s=G.state;S.spawnT-=dt;if(S.spawnT>0||S.warp)return;const sec=S.sys.security??.3;S.spawnT=45+sec*120+Math.random()*60;
    const ctl=Story.controlOf(s,S.sys);
    if(Math.random()<(1-sec)*.8&&S.ships.filter(t=>t.hostile).length<6){const n=1+Math.floor(Math.random()*(sec<.3?4:2));const at=S.P.pos.clone().add(new THREE.Vector3((Math.random()-.5)*5000,(Math.random()-.5)*1200,(Math.random()-.5)*5000));
      for(let i=0;i<n;i++)this.spawnNPCShip(ctl&&ctl.startsWith('civ:')&&Cosmos.civById(ctl.slice(4))?.attitude<-.4?ctl:'syndicate','raider',at.clone().add(new THREE.Vector3(i*120,0,i*80)));UI.toast(`${n} hostile contact${n>1?'s':''} dropping out of warp.`,'bad');AudioSys.sfx('alarm');}
    else if(S.ships.length<10)this.spawnNPCShip(ctl&&ctl!=='syndicate'?ctl:'frontier','trader');
  },

  /* ── Landing & docking ── */
  landable(nb){const S=this,P=S.P;let best=null;for(const b of S.bodies){if(!b.site&&!b.dock)continue;const d=P.pos.distanceTo(b.pos)-b.r;const lim=b.dock?Math.max(700,b.r*3):Math.max(500,b.r*1.6);if(d<lim&&(!best||d<best.d))best={b,d};}return best&&best.b;},
  tryLand(){const S=this;const b=this.landable();if(!b){UI.toast('Nothing to land on or dock with nearby. Get closer.');return;}if(S.P.vel.length()>900&&!S.cruise){UI.toast('Too fast to land. Slow down.');return;}
    S.cruise=0;if(b.dock)Game.dock(b.dock);else Game.land(b.site);},

  /* ── Warp sequence ── */
  startWarp(onArrive,gate){const S=this;S.warp={t:0,onArrive,gate,phase:'spool'};AudioSys.sfx('warp');UI.toast(gate?'Gate transit':'Warp field forming','lvl');},
  updateWarp(dt){
    const S=this,W=S.warp,P=S.P;W.t+=dt;const fwd=new THREE.Vector3(0,0,1).applyQuaternion(P.quat);
    if(W.phase==='spool'){const k=Math.min(1,W.t/3);S.shake=k*6;Render.fx.warp=k*.6;if(P.mesh.userData.warpRing)P.mesh.userData.warpRing.material.color.setScalar(2+k*8);P.pos.addScaledVector(fwd,k*200*dt);if(W.t>3){W.phase='tunnel';W.t=0;S.tunnel.visible=true;}}
    else if(W.phase==='tunnel'){S.tunnel.position.copy(P.pos);S.tunnel.quaternion.copy(P.quat);S.tunnel.rotateX(Math.PI/2);S.tunnel.userData.m.uniforms.time.value=G.time;S.tunnel.userData.m.uniforms.k.value=Math.min(1,W.t*1.5);S.tunnel.userData.m.uniforms.col.value.copy(C(W.gate?'#ffcf7e':'#7fd4ff'));
      Render.fx.warp=.9;S.shake=3;S.sky.visible=W.t<.3;if(W.t>3.2){Render.fx.fade=Math.min(1,(W.t-3.2)*3);}if(W.t>3.6){const cb=W.onArrive;S.warp=null;Render.fx.warp=0;cb();}}
    P.mesh.position.copy(P.pos);const L=P.mesh.userData.length;G.camera.position.copy(P.pos).add(new THREE.Vector3(0,L*.3,-L*1.4).applyQuaternion(P.quat)).add(new THREE.Vector3((Math.random()-.5)*S.shake,(Math.random()-.5)*S.shake,0));G.camera.lookAt(P.pos.clone().addScaledVector(fwd,L*5));
    G.camera.fov=U.damp(G.camera.fov,W.phase==='tunnel'?115:G.settings.fov,3,dt);G.camera.updateProjectionMatrix();
  },

  /* ── HUD: brackets, target, speed ── */
  hud(){
    const S=this,s=G.state,P=S.P;const el=U.$('#brackets');if(!el)return;const cam=G.camera;const W=innerWidth,H=innerHeight;let h='';
    const proj=(p)=>{const v=p.clone().project(cam);const behind=v.z>1;return{x:(v.x*.5+.5)*W,y:(-v.y*.5+.5)*H,behind};};
    const tgtQ=Game.questSpaceTarget();
    const drawB=(p,label,cls,dist)=>{const q=proj(p);if(q.behind||q.x<0||q.y<0||q.x>W||q.y>H){if(cls.includes('q')){const v=p.clone().sub(cam.position).applyQuaternion(cam.quaternion.clone().invert());const a=Math.atan2(-v.y,v.x);const x=W/2+Math.cos(a)*Math.min(W,H)*.42,y=H/2+Math.sin(a)*Math.min(W,H)*.42;h+=`<div class="offarrow" style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${a}rad)">➤</div>`;}return;}
      h+=`<div class="bracket ${cls}" style="left:${q.x}px;top:${q.y}px"><div class="t">${U.esc(label)} · ${dist<1000?Math.round(dist)+' m':(dist/1000).toFixed(1)+' km'}</div></div>`;};
    for(const b of S.bodies){if(b.def.type==='gate'&&!b.active&&b.pos.distanceTo(P.pos)>30000)continue;const d=P.pos.distanceTo(b.pos)-b.r;const isQ=tgtQ&&(tgtQ===b.def.id||tgtQ===b.site||tgtQ===b.dock);drawB(b.pos,b.name+(b.site||b.dock?' ◆':''),'n'+(isQ?' q':''),Math.max(0,d)*50);}
    for(const f of S.fields){drawB(f.center,f.name,'n',P.pos.distanceTo(f.center)*50);}
    for(const t of S.ships){const d=t.pos.distanceTo(P.pos);if(d>9000)continue;drawB(t.pos,t.name+(t.hostile?' ⚠':''),t.hostile?'e':'',d*50);}
    if(S.target&&!S.target.dead){const t=S.target;const l=this.lead(P.pos,t,1200);const q=proj(l);if(!q.behind)h+=`<div class="lead" style="left:${q.x}px;top:${q.y}px"></div>`;}
    el.innerHTML=h;
    const st=P.st;const v=P.vel.length()*50;
    const bar=(n,val,max,col)=>`<div class="vb"><span>${n}</span><div class="bar"><i style="width:${U.clamp(val/max*100,0,100)}%;background:${col}"></i></div><span>${Math.round(val)}</span></div>`;
    U.$('#s-speed').innerHTML=`<div class="lbl">${S.cruise?'CRUISE':S.cruiseCharge>0?'CHARGING':'SUBLIGHT'} · FA ${S.fa?'ON':'OFF'}</div><div class="v">${v>1e6?(v/3e8).toFixed(3)+'<small> c</small>':v>10000?(v/1000).toFixed(1)+'<small> km/s</small>':Math.round(v)+'<small> m/s</small>'}</div>${bar('SHD',P.shield,st.shield,'#8fd0ff')}${bar('HULL',s.ship.hp,st.hull,'#ff7a6b')}${bar('CAP',P.cap,100,'#f2a33a')}${bar('FUEL',s.ship.fuel,st.fuel,'#3ec9a7')}
      <div class="lbl" style="margin-top:6px">${this.landable()?'L · '+(this.landable().dock?'DOCK':'LAND')+' · ':''}C CRUISE · M MAP · T TARGET · I BRIDGE</div>`;
    const t=S.target;U.$('#s-tgt').innerHTML=t&&!t.dead?`<div class="lbl">Target</div><div class="disp" style="font-size:20px;text-transform:uppercase">${U.esc(t.name)}</div>${bar('SHD',t.shield,t.maxShield,'#8fd0ff')}${bar('HULL',t.hull,t.maxHull,'#ff7a6b')}<div class="lbl">${Math.round(t.pos.distanceTo(P.pos)*50)} m · ${t.hostile?'HOSTILE':'NEUTRAL'}</div>`:'';
  },
};

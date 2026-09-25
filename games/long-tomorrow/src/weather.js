/* ═══════════════════════════════════════════════════════════════════════
   WEATHER · per-world weather that changes over time.
   States: clear, overcast, rain, storm (lightning + thunder delayed by
   distance at 343 m/s), snow, dust storm, spore fall, ash fall, methane
   rain (Titan: real methane drizzle falls slowly in 0.14 g, thick air).
   A lit cloud layer tracks coverage; fog, sun and exposure respond.
   ═══════════════════════════════════════════════════════════════════════ */
const Weather={
  profile(site){
    const id=site.id||'';const b=site.biome;const vac=site.sky.stars>=1&&site.sky.haze<.2;
    if(vac||site.style==='engineer'||site.style==='bridge')return null;
    if(id==='titan')return[{t:'overcast',w:3},{t:'methane',w:3},{t:'storm',w:1}];
    if(id==='mars')return[{t:'clear',w:4},{t:'dust',w:2},{t:'overcast',w:1}];
    if(id==='earth')return[{t:'clear',w:4},{t:'overcast',w:2},{t:'rain',w:2},{t:'storm',w:1}];
    if(id==='kepler452_b'||b==='jungle'||b==='ocean')return[{t:'clear',w:3},{t:'overcast',w:2},{t:'rain',w:3},{t:'storm',w:2}];
    if(id==='proxima_b'||id==='lhs1140_b'||b==='tundra')return[{t:'clear',w:2},{t:'overcast',w:2},{t:'snow',w:3}];
    if(id==='trappist_e')return[{t:'clear',w:2},{t:'overcast',w:2},{t:'rain',w:2}];
    if(id==='tauceti_f'||b==='desert'||b==='iron')return[{t:'clear',w:3},{t:'dust',w:2}];
    if(b==='fungal')return[{t:'overcast',w:2},{t:'spores',w:3}];
    if(b==='lava')return[{t:'overcast',w:2},{t:'ash',w:3}];
    if(b==='toxic')return[{t:'overcast',w:3},{t:'rain',w:2}];
    return[{t:'clear',w:3},{t:'overcast',w:2}];
  },
  create(S,site){
    const prof=this.profile(site);if(!prof)return null;
    const r=U.rng(U.hash(S.siteId+Math.floor(G.state.earthYear*365)));
    const W={prof,type:U.weighted(r,prof).t,level:0,target:1,t:0,next:120+r()*200,flash:0,bolt:null,thunder:[],S,site};
    // precipitation: line streaks for rain, points for everything else
    const N=4000;const pos=new Float32Array(N*6);for(let i=0;i<N;i++){const x=(Math.random()-.5)*90,y=Math.random()*50,z=(Math.random()-.5)*90;pos.set([x,y,z,x,y-.6,z],i*6);}
    const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(pos,3));
    W.rain=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:C('#b8c8d8'),transparent:true,opacity:.35,depthWrite:false}));W.rain.frustumCulled=false;S.scene.add(W.rain);
    const M=2500;const pp=new Float32Array(M*3);for(let i=0;i<M;i++)pp.set([(Math.random()-.5)*90,Math.random()*40,(Math.random()-.5)*90],i*3);
    const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pp,3));
    W.parts=new THREE.Points(pg,new THREE.PointsMaterial({color:C('#ffffff'),size:.12,transparent:true,opacity:.8,depthWrite:false,map:Gen.sparkTex(),alphaTest:.01}));W.parts.frustumCulled=false;S.scene.add(W.parts);
    W.rainN=N;W.partN=M;
    // cloud layer
    if(site.sky.haze>=.3&&site.sky.stars<1){
      const cm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,fog:false,uniforms:{time:{value:0},cover:{value:.3},sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:C(site.sky.sunCol)},base:{value:C(site.sky.hor)},day:{value:1}},
        vertexShader:`varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
        fragmentShader:GLSL_NOISE+`uniform float time,cover,day;uniform vec3 sunDir,sunCol,base;varying vec3 vD;void main(){if(vD.y<.02)discard;
          vec2 uv=vD.xz/(vD.y+.12)*1.6;float n=fbm(vec3(uv*.6+vec2(time*.004,time*.002),time*.01));float n2=fbm(vec3(uv*2.3,time*.02));
          float d=smoothstep(1.-cover*1.4,1.2-cover,n*.5+.5+n2*.15);float thick=smoothstep(.2,1.,d);
          float s=max(dot(normalize(vD),normalize(sunDir)),0.);vec3 lit=mix(base*.55,sunCol*1.25,pow(s,4.)*.6+.45)*mix(1.,.45,cover*thick);
          vec3 col=lit*(.25+.75*day);gl_FragColor=vec4(col,d*smoothstep(.02,.18,vD.y)*.92);}`});
      W.clouds=new THREE.Mesh(new THREE.SphereGeometry(2600,48,24),cm);W.clouds.renderOrder=-9;S.scene.add(W.clouds);
    }
    this.apply(W,true);return W;
  },
  apply(W,instant){
    const S=W.S,sky=W.site.sky;const k=W.type;
    const cover={clear:.18,overcast:.75,rain:.85,storm:.95,snow:.7,dust:.4,spores:.55,ash:.8,methane:.8}[k]??.3;
    const dim={clear:1,overcast:.55,rain:.42,storm:.3,snow:.55,dust:.5,spores:.6,ash:.45,methane:.5}[k]??1;
    const fogMul={clear:1,overcast:1.3,rain:1.9,storm:2.4,snow:2.2,dust:4,spores:2.5,ash:3,methane:1.8}[k]??1;
    W.goal={cover,dim,fogMul};if(instant)W.cur=Object.assign({},W.goal);
    const pc={snow:'#ffffff',dust:'#d8a070',spores:'#e0a0ff',ash:'#6a6060',methane:'#e0a060'}[k];if(pc)W.parts.material.color.copy(C(pc));
    W.rain.material.color.copy(C(k==='methane'?'#d8a060':'#b8c8d8'));
  },
  update(W,dt){
    if(!W)return;const S=W.S;const cam=G.camera.position;W.t+=dt;
    if(W.t>W.next){W.t=0;W.next=150+Math.random()*240;const prev=W.type;W.type=U.weighted(Math.random,W.prof).t;if(W.type!==prev){this.apply(W);if(['rain','storm','snow','dust'].includes(W.type))UI.toast({rain:'Rain moving in.',storm:'Storm warning: lightning in the area.',snow:'Snowfall starting.',dust:'Dust storm approaching. Visibility dropping.'}[W.type]);}}
    for(const k of['cover','dim','fogMul'])W.cur[k]=U.damp(W.cur[k],W.goal[k],.25,dt);
    S.weatherDim=W.cur.dim;if(S.scene.fog)S.scene.fog.density=W.site.sky.fogD*W.cur.fogMul;
    if(W.clouds){const u=W.clouds.material.uniforms;u.time.value=G.time;u.cover.value=W.cur.cover;u.sunDir.value.copy(S.sunDir);u.day.value=S.day??1;W.clouds.position.copy(cam);}
    const rainy=['rain','storm','methane'].includes(W.type);const pty=['snow','dust','spores','ash'].includes(W.type);
    W.rain.visible=rainy;W.parts.visible=pty;
    const wind=W.type==='dust'?18:W.type==='storm'?6:2;
    if(rainy){const p=W.rain.geometry.attributes.position.array;const fall=(W.type==='methane'?1.6:W.type==='storm'?22:15)*dt;const slant=wind*.03;
      for(let i=0;i<W.rainN;i++){const o=i*6;let x=p[o],y=p[o+1]-fall,z=p[o+2];
        if(y<cam.y-15||Math.abs(x-cam.x)>45||Math.abs(z-cam.z)>45){x=cam.x+(Math.random()-.5)*90;z=cam.z+(Math.random()-.5)*90;y=cam.y+15+Math.random()*30;}
        const len=W.type==='methane'?.25:.7;p[o]=x;p[o+1]=y;p[o+2]=z;p[o+3]=x+slant;p[o+4]=y-len;p[o+5]=z;}
      W.rain.geometry.attributes.position.needsUpdate=true;
      if(Math.random()<dt*20){const x=cam.x+(Math.random()-.5)*30,z=cam.z+(Math.random()-.5)*30;S.parts.emit(new THREE.Vector3(x,S.h(x,z)+.05,z),new THREE.Vector3(0,1.2,0),C('#9ab0c8'),.25,.25,9);}}
    if(pty){const p=W.parts.geometry.attributes.position.array;const fall={snow:1.1,dust:.3,spores:.25,ash:.8}[W.type]*dt;
      for(let i=0;i<W.partN;i++){const o=i*3;let x=p[o]+wind*dt*(W.type==='dust'?1:.3)+Math.sin(G.time+i)*.01,y=p[o+1]-fall,z=p[o+2];
        if(y<cam.y-12||Math.abs(x-cam.x)>45||Math.abs(z-cam.z)>45){x=cam.x+(Math.random()-.5)*90;z=cam.z+(Math.random()-.5)*90;y=cam.y+Math.random()*30-2;}p[o]=x;p[o+1]=y;p[o+2]=z;}
      W.parts.geometry.attributes.position.needsUpdate=true;W.parts.material.size=W.type==='dust'?.22:.12;}
    // lightning
    if(W.type==='storm'&&Math.random()<dt*.12)this.strike(W);
    if(W.flash>0){W.flash-=dt*3.5;S.hemi.intensity+=Math.max(0,W.flash)*6;Render.fx.exposure+=Math.max(0,W.flash)*.9;}
    if(W.bolt){W.boltT-=dt;if(W.boltT<=0){S.scene.remove(W.bolt);W.bolt.geometry.dispose();W.bolt=null;}}
    W.thunder=W.thunder.filter(t=>{t.d-=dt;if(t.d<=0){AudioSys.sfx('thunder',t.v);return false;}return true;});
    AudioSys.rain&&AudioSys.rain(rainy?(W.type==='storm'?.5:.3):W.type==='dust'?.35:0);
  },
  strike(W){
    const S=W.S,cam=G.camera.position;const ang=Math.random()*6.28,dist=150+Math.random()*900;const x=cam.x+Math.cos(ang)*dist,z=cam.z+Math.sin(ang)*dist;const y0=S.h(x,z);
    const pts=[];let px=x,pz=z;for(let y=y0+420;y>y0;y-=24){pts.push(new THREE.Vector3(px,y,pz));px+=(Math.random()-.5)*26;pz+=(Math.random()-.5)*26;}pts.push(new THREE.Vector3(x,y0,z));
    const m=new THREE.LineBasicMaterial({color:C('#e8f0ff')});m.color.multiplyScalar(30);W.bolt=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),m);S.scene.add(W.bolt);W.boltT=.18;W.flash=1;
    W.thunder.push({d:dist/343,v:U.clamp(1.4-dist/900,.2,1)});
  },
};

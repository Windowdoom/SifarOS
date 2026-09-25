/* ═══════════════════════════════════════════════════════════════════════
   GEN · procedural geometry, shaders and textures. No external assets:
   every pixel is computed here or in a shader.
   ═══════════════════════════════════════════════════════════════════════ */

const GLSL_NOISE=`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
 vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
 i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
 float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
 vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
 vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
 vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
 vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
 vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<6;i++){s+=a*snoise(p);p*=2.03;a*=.5;}return s;}
float fbm3o(vec3 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*snoise(p);p*=2.1;a*=.5;}return s;}
`;

const Gen={
  _tex:{},_geo:{},_mat:{},
  /* ── Canvas textures ── */
  canvasTex(w,h,draw,{repeat=null,srgb=true}={}){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);const t=new THREE.CanvasTexture(c);
    t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat[0],repeat[1]);}t.anisotropy=4;return t;},
  glowTex(){return this._tex.glow||(this._tex.glow=this.canvasTex(256,256,(g,w)=>{const gr=g.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.18,'rgba(255,255,255,.55)');gr.addColorStop(.45,'rgba(255,255,255,.12)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,w,w);},{srgb:false}));},
  sparkTex(){return this._tex.spark||(this._tex.spark=this.canvasTex(64,64,(g,w)=>{const gr=g.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,255,255,.6)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,w,w);},{srgb:false}));},
  smokeTex(){return this._tex.smoke||(this._tex.smoke=this.canvasTex(128,128,(g,w)=>{const N=makeNoise(7);const id=g.createImageData(w,w);for(let y=0;y<w;y++)for(let x=0;x<w;x++){const dx=x/w-.5,dy=y/w-.5;const r=Math.hypot(dx,dy)*2;const n=fbm2(N,x/22,y/22,4)*.5+.5;const a=Math.max(0,1-r)*n;const i=(y*w+x)*4;id.data[i]=id.data[i+1]=id.data[i+2]=255;id.data[i+3]=a*255;}g.putImageData(id,0,0);},{srgb:false}));},
  detailTex(){return this._tex.detail||(this._tex.detail=this.canvasTex(256,256,(g,w)=>{const N=makeNoise(11);const id=g.createImageData(w,w);for(let y=0;y<w;y++)for(let x=0;x<w;x++){
      // tileable via 4D torus trick approximated with blended samples
      const u=x/w,v=y/w;const s=(a,b)=>fbm2(N,a*12,b*12,5);const n=s(u,v)*(1-u)*(1-v)+s(u-1,v)*u*(1-v)+s(u,v-1)*(1-u)*v+s(u-1,v-1)*u*v;
      const c=128+n*110;const i=(y*w+x)*4;id.data[i]=id.data[i+1]=id.data[i+2]=c;id.data[i+3]=255;}g.putImageData(id,0,0);},{repeat:[1,1],srgb:false}));},
  /* ── Architectural PBR sets drawn on canvas: albedo, normal (from a height field), roughness/metalness ── */
  heightToNormal(hf,w,h,str){
    const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');const id=g.createImageData(w,h);const d=id.data;
    const H=(x,y)=>hf[((y+h)%h)*w+((x+w)%w)];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=(H(x+1,y)-H(x-1,y))*str,dy=(H(x,y+1)-H(x,y-1))*str;const l=Math.hypot(dx,dy,1);const i=(y*w+x)*4;
      d[i]=(-dx/l*.5+.5)*255;d[i+1]=(dy/l*.5+.5)*255;d[i+2]=(1/l*.5+.5)*255;d[i+3]=255;}
    g.putImageData(id,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;},
  _canvas(S){const c=document.createElement('canvas');c.width=c.height=S;return [c,c.getContext('2d')];},
  _tex2(c,srgb){const t=new THREE.CanvasTexture(c);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;},
  /* tileable grime: low-res fbm, drawn scaled with multiply so it costs almost nothing */
  _grime(g,S,seed,amt){const G=128;const [c,cg]=this._canvas(G);const N=makeNoise(seed);const id=cg.createImageData(G,G);
    for(let y=0;y<G;y++)for(let x=0;x<G;x++){const u=x/G,v=y/G;const f=(a,b)=>fbm2(N,a*5,b*5,4);const n=f(u,v)*(1-u)*(1-v)+f(u-1,v)*u*(1-v)+f(u,v-1)*(1-u)*v+f(u-1,v-1)*u*v;
      const k=255*(1-Math.max(0,n*.55+.12)*amt);const i=(y*G+x)*4;id.data[i]=k;id.data[i+1]=k;id.data[i+2]=k*.985;id.data[i+3]=255;}
    cg.putImageData(id,0,0);g.save();g.globalCompositeOperation='multiply';g.imageSmoothingEnabled=true;g.drawImage(c,0,0,S,S);g.restore();},
  /* cladding: bevelled plates, fasteners, louvred vents, hatches, stencils, streaks */
  panelSet(seed=1,{cols=4,rows=3}={}){
    const key='pset'+seed+'_'+cols+'_'+rows;if(this._tex[key])return this._tex[key];
    const S=512,r=U.rng(seed*7+3);const [hc,hg]=this._canvas(S),[ac,ag]=this._canvas(S),[rc,rg]=this._canvas(S);
    hg.fillStyle='#000';hg.fillRect(0,0,S,S);ag.fillStyle='#8c9096';ag.fillRect(0,0,S,S);rg.fillStyle='rgb(0,170,120)';rg.fillRect(0,0,S,S);
    const pw=S/cols,ph=S/rows;
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const parts=r()<.25?[[0,0,1,.5],[0,.5,1,.5]]:r()<.15?[[0,0,.5,1],[.5,0,.5,1]]:[[0,0,1,1]];
      for(const [u,v,uw,vh] of parts){const x=i*pw+u*pw,y=j*ph+v*ph,w=pw*uw,h=ph*vh;
        const t=222+Math.floor((r()-.5)*16);ag.fillStyle=`rgb(${t},${t+1},${t+3})`;ag.fillRect(x+2,y+2,w-4,h-4);
        for(let k=0;k<6;k++){const c=110+k*24;hg.fillStyle=`rgb(${c},${c},${c})`;hg.fillRect(x+2+k,y+2+k,w-4-2*k,h-4-2*k);}
        rg.fillStyle=`rgb(0,${Math.round(105+r()*80)},${Math.round(40+r()*70)})`;rg.fillRect(x+3,y+3,w-6,h-6);
        hg.fillStyle='#fff';ag.fillStyle='rgba(70,74,80,.9)';for(const [fx,fy] of [[x+10,y+10],[x+w-10,y+10],[x+10,y+h-10],[x+w-10,y+h-10]]){hg.beginPath();hg.arc(fx,fy,3.2,0,6.3);hg.fill();ag.beginPath();ag.arc(fx,fy,2.3,0,6.3);ag.fill();}
        if(r()<.12){const vx=x+w*.2,vy=y+h*.3,vw=w*.6,vv=h*.34;ag.fillStyle='rgba(38,42,48,.9)';ag.fillRect(vx,vy,vw,vv);
          for(let q=0;q<vv-3;q+=7){hg.fillStyle='#7a7a7a';hg.fillRect(vx,vy+q,vw,4);hg.fillStyle='#303030';hg.fillRect(vx,vy+q+4,vw,3);ag.fillStyle='rgba(120,126,134,.5)';ag.fillRect(vx,vy+q,vw,1);}
          rg.fillStyle='rgb(0,150,200)';rg.fillRect(vx,vy,vw,vv);}
        else if(r()<.12){const hx=x+w*.28,hy=y+h*.3,hw=w*.44,hh=h*.34;hg.fillStyle='#606060';hg.fillRect(hx-2,hy-2,hw+4,hh+4);hg.fillStyle='#d0d0d0';hg.fillRect(hx+1,hy+1,hw-2,hh-2);
          ag.strokeStyle='rgba(50,54,60,.7)';ag.lineWidth=1.5;ag.strokeRect(hx,hy,hw,hh);ag.fillStyle='rgba(50,54,60,.8)';ag.fillRect(hx+hw-12,hy+hh/2-3,8,6);}
        if(r()<.07){ag.save();ag.beginPath();ag.rect(x+10,y+h-24,w*.34,8);ag.clip();for(let q=-10;q<w*.34+10;q+=10){ag.fillStyle=q/10%2?'rgba(230,160,40,.9)':'rgba(30,30,30,.9)';ag.beginPath();ag.moveTo(x+10+q,y+h-16);ag.lineTo(x+18+q,y+h-24);ag.lineTo(x+23+q,y+h-24);ag.lineTo(x+15+q,y+h-16);ag.fill();}ag.restore();}
        if(r()<.18){ag.fillStyle='rgba(44,48,56,.6)';ag.font='600 12px "IBM Plex Mono", monospace';ag.fillText(String.fromCharCode(65+Math.floor(r()*8))+'-'+(10+Math.floor(r()*89)),x+16,y+26);}
      }}
    this._grime(ag,S,seed,.42);
    ag.globalAlpha=.07;ag.fillStyle='#1c1c1c';for(let i=0;i<90;i++){const x=r()*S,y=Math.floor(r()*rows)*ph+6;ag.fillRect(x,y,1+r()*2.2,ph*(.25+r()*.7));}ag.globalAlpha=1;
    const hd=hg.getImageData(0,0,S,S).data;const hf=new Float32Array(S*S);for(let i=0;i<S*S;i++)hf[i]=hd[i*4]/255;
    return this._tex[key]={map:this._tex2(ac,true),normalMap:this.heightToNormal(hf,S,S,2.6),orm:this._tex2(rc,false)};
  },
  /* curtain wall: 4 storeys × 10 bays per tile; glass reflects, spandrels are concrete, some offices lit */
  facadeSet(seed,warm=true){
    const key='fset'+seed+warm;if(this._tex[key])return this._tex[key];
    const S=512,r=U.rng(seed*13+1),FL=S/4,BW=S/10;const [hc,hg]=this._canvas(S),[ac,ag]=this._canvas(S),[ec,eg]=this._canvas(S),[rc,rg]=this._canvas(S);
    const spand=FL*.3;hg.fillStyle='#000';hg.fillRect(0,0,S,S);eg.fillStyle='#000';eg.fillRect(0,0,S,S);
    const glass=['#1a2430','#1e2a36','#18212b'][seed%3],conc=['#b8b4ac','#8e939a','#c8c2b8'][seed%3];
    for(let f=0;f<4;f++){const y=f*FL;
      ag.fillStyle=conc;ag.fillRect(0,y,S,spand);hg.fillStyle='#9a9a9a';hg.fillRect(0,y,S,spand);rg.fillStyle='rgb(0,210,10)';rg.fillRect(0,y,S,spand);
      for(let b=0;b<10;b++){const x=b*BW,gy=y+spand,gh=FL-spand;
        ag.fillStyle=glass;ag.fillRect(x,gy,BW,gh);rg.fillStyle='rgb(0,24,235)';rg.fillRect(x,gy,BW,gh);
        const lit=r()<(warm?.38:.3);if(lit){const tone=r();const col=warm?(tone<.65?[255,214,160]:[200,225,255]):[190,215,255];const k=.45+r()*.55;
          const gr=eg.createLinearGradient(0,gy,0,gy+gh);gr.addColorStop(0,`rgba(${col[0]},${col[1]},${col[2]},${k})`);gr.addColorStop(1,`rgba(${col[0]*.6|0},${col[1]*.6|0},${col[2]*.6|0},${k*.5})`);eg.fillStyle=gr;eg.fillRect(x+2,gy+2,BW-4,gh-4);
          if(r()<.35){eg.fillStyle='rgba(0,0,0,.55)';for(let q=gy+4;q<gy+gh*.6;q+=5)eg.fillRect(x+2,q,BW-4,2);}
          ag.fillStyle='rgba(60,70,80,.35)';ag.fillRect(x+2,gy+2,BW-4,gh-4);}}
      // mullions and transom
      for(let b=0;b<=10;b++){const x=b*BW;ag.fillStyle='#7c838c';ag.fillRect(x-2,y+spand,4,FL-spand);hg.fillStyle='#fff';hg.fillRect(x-2,y+spand,4,FL-spand);rg.fillStyle='rgb(0,90,255)';rg.fillRect(x-2,y+spand,4,FL-spand);}
      ag.fillStyle='#6c737c';ag.fillRect(0,y+spand-2,S,4);hg.fillStyle='#ddd';hg.fillRect(0,y+spand-2,S,4);}
    this._grime(ag,S,seed+50,.25);
    const hd=hg.getImageData(0,0,S,S).data;const hf=new Float32Array(S*S);for(let i=0;i<S*S;i++)hf[i]=hd[i*4]/255;
    return this._tex[key]={map:this._tex2(ac,true),emissiveMap:this._tex2(ec,true),normalMap:this.heightToNormal(hf,S,S,2),orm:this._tex2(rc,false)};
  },
  /* PBR material from a panel set; colour tints the neutral albedo */
  pbr(color,seed=1,o={}){const k='pbr'+color+seed+JSON.stringify(o);return this.mat(k,()=>{const P=this.panelSet(seed%6);
    return new THREE.MeshStandardMaterial(Object.assign({color:C(color),map:P.map,normalMap:P.normalMap,normalScale:new THREE.Vector2(1,1),roughnessMap:P.orm,metalnessMap:P.orm,roughness:1,metalness:.9},o));});},
  panelTex(base='#8a96a4',seed=1){return this.panelSet(seed%6).map;},
  windowTex(seed,warm=true){const key='win'+seed+warm;if(this._tex[key])return this._tex[key];
    return this._tex[key]=this.canvasTex(256,512,(g,w,h)=>{const r=U.rng(seed);g.fillStyle='#0a0d12';g.fillRect(0,0,w,h);
      for(let y=0;y<h;y+=16)for(let x=0;x<w;x+=12){const on=r()<.42;if(on){const t=r();g.fillStyle=warm?(t<.6?`rgba(255,${200+r()*40|0},${130+r()*50|0},${.6+r()*.4})`:`rgba(180,220,255,${.5+r()*.5})`):`rgba(160,200,255,${.4+r()*.5})`;}else g.fillStyle='rgba(40,50,70,.4)';g.fillRect(x+2,y+3,8,10);}
    },{srgb:true});},
  signTex(text,col,bg='#05070c'){const key='sign'+text+col;if(this._tex[key])return this._tex[key];
    return this._tex[key]=this.canvasTex(512,128,(g,w,h)=>{g.fillStyle=bg;g.fillRect(0,0,w,h);g.font='700 78px "Saira Condensed", "Arial Narrow", sans-serif';g.textAlign='center';g.textBaseline='middle';
      g.shadowColor=col;g.shadowBlur=24;g.fillStyle=col;g.fillText(text,w/2,h/2+4);g.shadowBlur=0;g.fillStyle='#fff';g.globalAlpha=.55;g.fillText(text,w/2,h/2+4);},{srgb:true});},
  galaxyTex(arms=4,seed=3,col='#cfd8ff'){const key='gal'+arms+seed;if(this._tex[key])return this._tex[key];
    return this._tex[key]=this.canvasTex(512,512,(g,w)=>{g.fillStyle='rgba(0,0,0,0)';g.clearRect(0,0,w,w);const r=U.rng(seed);g.globalCompositeOperation='lighter';
      const core=g.createRadialGradient(w/2,w/2,0,w/2,w/2,w*.18);core.addColorStop(0,'rgba(255,236,200,.9)');core.addColorStop(1,'rgba(255,220,180,0)');g.fillStyle=core;g.fillRect(0,0,w,w);
      for(let i=0;i<9000;i++){const arm=Math.floor(r()*arms);const t=Math.pow(r(),.7);const rad=t*w*.46;const ang=arm*Math.PI*2/arms+Math.log(1+t*8)*1.6+(r()-.5)*.55*(1-t*.4);
        const x=w/2+Math.cos(ang)*rad,y=w/2+Math.sin(ang)*rad;const b=r();g.fillStyle=b<.15?'rgba(255,190,170,.35)':b<.5?'rgba(170,200,255,.25)':'rgba(255,245,230,.18)';const s=r()*1.8+.4;g.fillRect(x,y,s,s);}
    },{srgb:false});},

  mat(key,make){return this._mat[key]||(this._mat[key]=make());},
  std(color,o={}){const k='std'+color+JSON.stringify(o);return this.mat(k,()=>new THREE.MeshStandardMaterial(Object.assign({color:C(color),roughness:.7,metalness:.1},o)));},
  emissive(color,intensity=2){const k='em'+color+intensity;return this.mat(k,()=>{const m=new THREE.MeshBasicMaterial({color:C(color)});m.color.multiplyScalar(intensity);return m;});},

  /* ── Sky dome for planetary surfaces ── */
  skyMaterial(sky){
    return new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{
      zen:{value:C(sky.zen)},hor:{value:C(sky.hor)},fogc:{value:C(sky.fog)},sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:C(sky.sunCol)},
      sunSize:{value:sky.sunSize},haze:{value:sky.haze},stars:{value:sky.stars},day:{value:1},time:{value:0},blueSun:{value:sky.sunsetBlue?1:0},bh:{value:sky.blackhole?1:0},galaxy:{value:sky.galaxy?1:0}},
      vertexShader:`varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
      fragmentShader:GLSL_NOISE+`
      uniform vec3 zen,hor,fogc,sunDir,sunCol;uniform float sunSize,haze,stars,day,time,blueSun,bh,galaxy;varying vec3 vDir;
      float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      void main(){
        vec3 d=normalize(vDir);float y=d.y;
        vec3 col=mix(hor,zen,pow(max(y,0.),.42));
        col=mix(col,fogc,smoothstep(.02,-.25,y));
        float sd=dot(d,normalize(sunDir));
        float ang=sunSize*.0046+.0004;
        float disk=smoothstep(cos(ang*1.05),cos(ang*.9),sd);
        float mie=pow(max(sd,0.),mix(900.,18.,haze))*mix(.4,2.2,haze)+pow(max(sd,0.),6.)*.25*haze;
        vec3 glowCol=mix(sunCol,vec3(.45,.65,1.),blueSun*smoothstep(.2,-.05,sunDir.y));
        col*=day;
        col+=glowCol*mie*(.35+.65*day);
        col+=sunCol*disk*18.;
        // Milky Way band + stars
        float night=stars*(1.-day*.92);
        if(night>.01){
          vec3 gp=normalize(vec3(.35,.85,-.4));float band=exp(-pow(dot(d,gp),2.)*9.);
          float n=fbm(d*6.+3.)*.5+.5;col+=vec3(.55,.6,.8)*band*n*n*.16*night;
          col+=vec3(.9,.7,.55)*band*pow(fbm3o(d*14.),2.)*.12*night;
          vec3 c=floor(d*420.);float h=hash(c);float s=step(.9965,h)*(.6+.4*sin(time*2.+h*60.));
          col+=mix(vec3(.8,.85,1.),vec3(1.,.8,.6),fract(h*97.))*s*1.6*night*smoothstep(-.05,.1,y);
        }
        if(bh>.5){float r=length(d.xz);}
        gl_FragColor=vec4(col,1.);
      }`});
  },

  /* ── Terrain: four photo-textured layers blended by a per-vertex splat (height, slope, noise),
        two sampling scales against tiling, triplanar rock on cliffs, blended normal maps ── */
  TERRAIN_SETS:{
    temperate:['grass','dirt','rocky','rock'],arid:['sand','cracked','rocky','rock'],regolith:['rocky','cracked','rock','rocky'],
    ice:['ice','rocky','rock','ice'],dunes:['sand','dirt','rocky','rock'],lava:['rocky','lava','rock','rock'],reef:['sand','rocky','rock','dirt'],
    terrace:['grass','pavers','rocky','rock'],ruin:['rocky','cracked','rock','pavers'],terminator:['dirt','ice','rocky','rock'],
  },
  terrainSetFor(site){
    const id=site.id||'';const b=site.biome;
    if(id==='earth'||id==='kepler452_b'||b==='jungle'||b==='ocean'||b==='fungal')return id==='kepler452_b'?'terrace':'temperate';
    if(id==='mars'||b==='desert'||b==='toxic')return 'arid';
    if(id==='titan')return 'dunes';
    if(id==='europa'||id==='lhs1140_b'||b==='ice'||b==='tundra'||b==='crystal'||b==='glass')return 'ice';
    if(id==='trappist_e')return 'reef';if(id==='proxima_b')return 'terminator';if(id==='tauceti_f')return 'ruin';if(b==='lava')return 'lava';
    return 'regolith';
  },
  terrainMaterial(site){
    const set=this.TERRAIN_SETS[this.terrainSetFor(site)];
    const TEX={grass:['grass_color','grass_normal'],dirt:['dirt_color','rocky_normal'],rocky:['rocky_color','rocky_normal'],rock:['rock_color','rock_normal'],
      sand:['sand_color','rocky_normal'],cracked:['cracked_color','rocky_normal'],ice:['ice_color','ice_normal'],lava:['lava_color','rock_normal'],pavers:['pavers_color','pavers_normal']};
    const albedo=set.map(k=>Assets.tex('textures/'+TEX[k][0]+'.jpg',{repeat:1}));const normals=set.map(k=>Assets.tex('textures/'+TEX[k][1]+'.jpg',{srgb:false,repeat:1}));
    const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,metalness:0});
    m.onBeforeCompile=sh=>{
      ['A','B','C','D'].forEach((k,i)=>{sh.uniforms['tAlb'+k]={value:albedo[i]};sh.uniforms['tNrm'+k]={value:normals[i]};});
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 splat;varying vec4 vSplat;varying vec3 vWP;varying vec3 vWN;')
        .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSplat=splat;vWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);');
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
        uniform sampler2D tAlbA,tAlbB,tAlbC,tAlbD,tNrmA,tNrmB,tNrmC,tNrmD;varying vec4 vSplat;varying vec3 vWP;varying vec3 vWN;
        vec3 tri(sampler2D t,vec3 p,vec3 w,float s){return texture2D(t,p.zy*s).rgb*w.x+texture2D(t,p.xz*s).rgb*w.y+texture2D(t,p.xy*s).rgb*w.z;}
        vec3 two(sampler2D t,vec2 uv){return mix(texture2D(t,uv*.22).rgb,texture2D(t,uv*.037).rgb,.35);}`)
      .replace('#include <map_fragment>',`
        vec4 sw=vSplat/max(dot(vSplat,vec4(1.)),1e-3);vec3 tw=pow(abs(normalize(vWN)),vec3(4.));tw/=dot(tw,vec3(1.));
        vec3 alb=two(tAlbA,vWP.xz)*sw.x+two(tAlbB,vWP.xz)*sw.y+tri(tAlbC,vWP,tw,.12)*sw.z+two(tAlbD,vWP.xz)*sw.w;
        diffuseColor.rgb*=alb*1.35;`)
      .replace('#include <normal_fragment_maps>',`
        vec3 nt=(two(tNrmA,vWP.xz)*sw.x+two(tNrmB,vWP.xz)*sw.y+tri(tNrmC,vWP,tw,.12)*sw.z+two(tNrmD,vWP.xz)*sw.w)*2.-1.;
        vec3 nW=normalize(vWN);vec3 T=normalize(cross(nW,vec3(0.,0.,1.)));vec3 Bt=cross(T,nW);
        vec3 pert=normalize(T*nt.x*.9+Bt*nt.y*.9+nW*nt.z);normal=normalize((viewMatrix*vec4(pert,0.)).xyz);`);
    };
    return m;
  },
  /* ── Liquid surface: water, methane, lava ── */
  liquidMaterial(color,{lava=false,glow=false,methane=false}={}){
    return new THREE.ShaderMaterial({transparent:!lava,uniforms:{col:{value:C(color)},time:{value:0},sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:new THREE.Color(1,1,1)},skyCol:{value:new THREE.Color(.5,.6,.8)},lava:{value:lava?1:0},glow:{value:glow?1:0},fogColor:{value:new THREE.Color()},fogDensity:{value:.002}},
      vertexShader:`varying vec3 vW;varying float vFogDepth;uniform float time;void main(){vec3 p=position;vec4 w=modelMatrix*vec4(p,1.);
        w.y+=sin(w.x*.08+time*1.1)*.18+sin(w.z*.11+time*.8)*.14;vW=w.xyz;vec4 mv=viewMatrix*w;vFogDepth=-mv.z;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:GLSL_NOISE+`uniform vec3 col,sunDir,sunCol,skyCol,fogColor;uniform float time,lava,glow,fogDensity;varying vec3 vW;varying float vFogDepth;
        void main(){
          vec2 p=vW.xz*.06;float n1=snoise(vec3(p,time*.12)),n2=snoise(vec3(p*2.7+7.,time*.2));
          vec3 N=normalize(vec3(n1*.22+n2*.1,1.,n2*.22-n1*.08));
          vec3 V=normalize(cameraPosition-vW);float fres=pow(1.-max(dot(N,V),0.),4.);
          vec3 R=reflect(-V,N);float spec=pow(max(dot(R,normalize(sunDir)),0.),240.)*8.;
          vec3 c;float a;
          if(lava>.5){float h=fbm3o(vec3(vW.xz*.03,time*.05));float cr=smoothstep(.1,.5,abs(h));c=mix(vec3(6.,1.4,.2),vec3(.08,.03,.02),cr);a=1.;}
          else{c=mix(col,skyCol,fres*.85)+sunCol*spec;a=.82+fres*.18;
            if(glow>.5){float g=pow(max(snoise(vec3(vW.xz*.15,time*.4)),0.),3.);c+=vec3(.1,.9,1.)*g*1.8;}}
          float fog=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);c=mix(c,fogColor,fog);
          gl_FragColor=vec4(c,a);}`});
  },

  /* ── Humanoid (humans, androids, Kepleri, Engineers) with procedural animation ── */
  humanoid(o={}){
    const h=o.h||1.75,s=h/1.75,build=o.build||1;
    const suit=C(o.suit||'#39475a'),skin=C(o.skin||'#b98260'),accent=C(o.accent||'#f2a33a');
    const mSuit=new THREE.MeshStandardMaterial({color:suit,roughness:.62,metalness:.25,map:this.panelTex('#ffffff',7)});
    const mSkin=new THREE.MeshStandardMaterial({color:skin,roughness:.75});
    const mDark=new THREE.MeshStandardMaterial({color:C('#1a1f28'),roughness:.5,metalness:.4});
    const mAcc=new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:o.glow?1.6:.25,roughness:.4});
    const root=new THREE.Group();const body=new THREE.Group();root.add(body);
    const hipY=.92*s;
    const pelvis=new THREE.Mesh(new THREE.BoxGeometry(.34*s*build,.18*s,.22*s),mSuit);pelvis.position.y=hipY;body.add(pelvis);
    const torso=new THREE.Group();torso.position.y=hipY+.08*s;body.add(torso);
    const chest=new THREE.Mesh(new THREE.BoxGeometry(.44*s*build,.52*s,.26*s),mSuit);chest.position.y=.3*s;torso.add(chest);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(.3*s*build,.2*s,.04*s),mAcc);plate.position.set(0,.36*s,.14*s);torso.add(plate);
    if(o.pack!==false){const pack=new THREE.Mesh(new THREE.BoxGeometry(.32*s*build,.4*s,.16*s),mDark);pack.position.set(0,.3*s,-.2*s);torso.add(pack);
      const l=new THREE.Mesh(new THREE.BoxGeometry(.05*s,.05*s,.02),mAcc);l.position.set(.1*s,.42*s,-.29*s);torso.add(l);}
    const neck=new THREE.Group();neck.position.y=.6*s;torso.add(neck);
    let head;
    if(o.kind==='engineer'){head=new THREE.Mesh(new THREE.SphereGeometry(.16*s,24,18),new THREE.MeshStandardMaterial({color:C('#e8e2d8'),roughness:.25,metalness:.1}));head.scale.set(.85,1.3,.95);}
    else{head=new THREE.Mesh(new THREE.SphereGeometry(.115*s,20,16),mSkin);head.scale.set(.9,1.1,1);}
    head.position.y=.14*s;neck.add(head);
    if(o.hair&&!o.helmet){const hair=new THREE.Mesh(new THREE.SphereGeometry(.12*s,16,12,0,Math.PI*2,0,Math.PI*.55),new THREE.MeshStandardMaterial({color:C(o.hair),roughness:.9}));hair.position.y=.16*s;hair.scale.set(.95,1.05,1.05);neck.add(hair);}
    if(o.helmet){const hm=new THREE.Mesh(new THREE.SphereGeometry(.18*s,24,18),new THREE.MeshStandardMaterial({color:suit,roughness:.4,metalness:.4}));hm.position.y=.14*s;neck.add(hm);
      const visor=new THREE.Mesh(new THREE.SphereGeometry(.182*s,24,18,-Math.PI*.38,Math.PI*.76,Math.PI*.28,Math.PI*.34),new THREE.MeshStandardMaterial({color:C('#0c1420'),roughness:.05,metalness:.95,emissive:C(o.visor||'#f2a33a'),emissiveIntensity:.08}));visor.position.y=.14*s;neck.add(visor);}
    if(o.kind==='android'){const eye=new THREE.Mesh(new THREE.BoxGeometry(.16*s,.025*s,.02),this.emissive('#a38cff',3));eye.position.set(0,.16*s,.11*s);neck.add(eye);}
    if(o.kind==='engineer'){const band=new THREE.Mesh(new THREE.TorusGeometry(.13*s,.008*s,6,32),this.emissive('#f2a33a',4));band.position.y=.2*s;band.rotation.x=Math.PI/2;neck.add(band);}
    const limb=(len,rad,mat)=>{const g=new THREE.Group();const m=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad*.85,len,10),mat);m.position.y=-len/2;g.add(m);return g;};
    const mkArm=(side,yOff=0)=>{const sh=new THREE.Group();sh.position.set(side*.27*s*build,.5*s-yOff,0);torso.add(sh);
      const up=limb(.3*s,.055*s*build,mSuit);sh.add(up);const el=new THREE.Group();el.position.y=-.3*s;up.add(el);const lo=limb(.28*s,.047*s*build,mSuit);el.add(lo);
      const hand=new THREE.Mesh(new THREE.SphereGeometry(.05*s,10,8),o.helmet?mDark:mSkin);hand.position.y=-.3*s;lo.add(hand);return{sh,el,hand};};
    const armL=mkArm(-1),armR=mkArm(1);let arms2=null;if(o.arms===4){arms2=[mkArm(-1,.2*s),mkArm(1,.2*s)];}
    const mkLeg=(side)=>{const hp=new THREE.Group();hp.position.set(side*.1*s*build,hipY-.04*s,0);body.add(hp);
      const th=limb(.44*s,.075*s*build,mSuit);hp.add(th);const kn=new THREE.Group();kn.position.y=-.44*s;th.add(kn);const sh=limb(.42*s,.06*s*build,mSuit);kn.add(sh);
      const boot=new THREE.Mesh(new THREE.BoxGeometry(.12*s*build,.09*s,.24*s),mDark);boot.position.set(0,-.44*s,.05*s);sh.add(boot);return{hp,kn};};
    const legL=mkLeg(-1),legR=mkLeg(1);
    let gun=null;if(o.gun){gun=this.gunMesh(o.gun);gun.position.set(0,-.04,0);armR.hand.add(gun);}
    root.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=false;}});
    const a={root,body,torso,neck,head,armL,armR,arms2,legL,legR,gun,phase:Math.random()*6,h,
      pose(dt,speed,air,aiming,talk){
        this.phase+=dt*(speed>.1?2.4+speed*.9:1.2);const p=this.phase;const k=U.clamp(speed/4,0,1.2);
        const sw=Math.sin(p)*.75*k;
        this.legL.hp.rotation.x=air?-.5:sw;this.legR.hp.rotation.x=air?.25:-sw;
        this.legL.kn.rotation.x=air?.9:Math.max(0,Math.sin(p+1.4))*1.1*k;this.legR.kn.rotation.x=air?.4:Math.max(0,Math.sin(p+1.4+Math.PI))*1.1*k;
        this.body.position.y=(air?0:Math.abs(Math.sin(p))*.05*k)+(speed<.1?Math.sin(p*.7)*.006:0);
        this.armL.sh.rotation.x=air?-1.2:-sw*.8;this.armL.el.rotation.x=-.25-(k*.3);this.armL.sh.rotation.z=air?-.5:.05;
        if(aiming){this.armR.sh.rotation.x=-1.45;this.armR.el.rotation.x=-.1;this.armR.sh.rotation.z=.05;this.armL.sh.rotation.x=-1.3;this.armL.sh.rotation.z=.5;this.armL.el.rotation.x=-.5;}
        else{this.armR.sh.rotation.x=air?-1.2:sw*.8;this.armR.el.rotation.x=-.25-(k*.3);this.armR.sh.rotation.z=air?.5:-.05;}
        if(talk){this.armR.sh.rotation.x=-.4+Math.sin(p*1.7)*.25;this.armR.el.rotation.x=-.9;this.head.rotation.x=Math.sin(p*1.3)*.08;}
        if(this.arms2){this.arms2[0].sh.rotation.x=-sw*.5-.3;this.arms2[1].sh.rotation.x=sw*.5-.3;this.arms2[0].el.rotation.x=-.8;this.arms2[1].el.rotation.x=-.8;}
        this.torso.rotation.x=aiming?.05:k*.08;
      }};
    return a;
  },
  gunMesh(id){const g=new THREE.Group();const dark=this.std('#20252e',{metalness:.7,roughness:.35});const acc=new THREE.MeshStandardMaterial({color:C(WEAPONS[id]?.tracer||'#f2a33a'),emissive:C(WEAPONS[id]?.tracer||'#f2a33a'),emissiveIntensity:1.2});
    const len={sidearm:.22,carbine:.62,breacher:.55,gauss:.95,lance:.6,null:.7}[id]||.4;
    const body=new THREE.Mesh(new THREE.BoxGeometry(.06,.09,len),dark);body.position.z=len/2-.05;g.add(body);
    const bar=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,len*.5,8),dark);bar.rotation.x=Math.PI/2;bar.position.set(0,.02,len+.05);g.add(bar);
    const strip=new THREE.Mesh(new THREE.BoxGeometry(.065,.012,len*.6),acc);strip.position.set(0,.05,len/2);g.add(strip);
    if(id==='null'){const r=new THREE.Mesh(new THREE.TorusGeometry(.07,.015,8,20),acc);r.position.z=len*.8;g.add(r);}
    g.userData.muzzle=new THREE.Vector3(0,.02,len+.3);return g;},

  /* ── Aliens & creatures ── */
  thalassi(col='#5fe0ff',scale=1){
    const g=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color:C('#0a2a3a'),emissive:C(col),emissiveIntensity:1.4,transparent:true,opacity:.82,roughness:.2});
    const body=new THREE.Mesh(new THREE.ConeGeometry(.45*scale,2.2*scale,20,1,true),mat);body.position.y=1.2*scale;body.rotation.x=Math.PI;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.42*scale,24,18),mat);head.position.y=2.4*scale;head.scale.set(1,1.4,1);g.add(head);
    const core=new THREE.Mesh(new THREE.SphereGeometry(.14*scale,12,10),this.emissive(col,5));core.position.y=2.4*scale;g.add(core);
    const tend=[];for(let i=0;i<9;i++){const t=new THREE.Mesh(new THREE.CylinderGeometry(.03*scale,.005,1.6*scale,5),mat);const a=i/9*Math.PI*2;t.position.set(Math.cos(a)*.35*scale,.7*scale,Math.sin(a)*.35*scale);g.add(t);tend.push(t);}
    return{root:g,mat,core,pose(dt,sp,air,aim,talk){const t=G.time;g.position.y=.25+Math.sin(t*1.2)*.12;tend.forEach((x,i)=>{x.rotation.x=Math.sin(t*2+i)*.35;x.rotation.z=Math.cos(t*1.7+i*2)*.35;});
      mat.emissiveIntensity=1+Math.sin(t*(talk?9:2))*.6+(talk?.8:0);}};
  },
  creature(kind,col){
    const g=new THREE.Group();let upd=()=>{};const legs=[];
    const shell=new THREE.MeshStandardMaterial({color:C(col||'#4a3a2a'),roughness:.55,metalness:.15});
    const eye=this.emissive(kind==='sentinel'||kind==='construct'?'#f2a33a':kind==='rogueDrone'||kind==='secdrone'?'#ff4a3a':'#ffda6a',4);
    if(kind==='crawler'){
      const b=new THREE.Mesh(new THREE.SphereGeometry(.55,16,12),shell);b.scale.set(1.3,.6,1.8);b.position.y=.6;g.add(b);
      const h=new THREE.Mesh(new THREE.SphereGeometry(.3,12,10),shell);h.position.set(0,.65,.9);g.add(h);
      for(const x of[-.12,.12]){const e=new THREE.Mesh(new THREE.SphereGeometry(.05,8,6),eye);e.position.set(x,.75,1.15);g.add(e);}
      for(let i=0;i<6;i++){const side=i<3?-1:1;const L=new THREE.Group();L.position.set(side*.5,.6,-.5+(i%3)*.5);g.add(L);const seg=new THREE.Mesh(new THREE.CylinderGeometry(.05,.03,1.1,6),shell);seg.position.set(side*.4,-.25,0);seg.rotation.z=side*1.0;L.add(seg);legs.push(L);}
      upd=(dt,sp)=>{const t=G.time*(4+sp*2);legs.forEach((L,i)=>{L.rotation.x=Math.sin(t+i*1.7)*.5*Math.min(1,sp/2+.1);});};
    }else if(kind==='stinger'){
      const b=new THREE.Mesh(new THREE.SphereGeometry(.8,20,10),new THREE.MeshStandardMaterial({color:C(col||'#1a3a4a'),emissive:C('#3ad8ff'),emissiveIntensity:.3,roughness:.3}));b.scale.set(1.6,.18,1);g.add(b);
      const tail=new THREE.Mesh(new THREE.CylinderGeometry(.06,.01,2,6),shell);tail.rotation.x=Math.PI/2;tail.position.z=-1.6;g.add(tail);
      const e=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),eye);e.position.set(0,.1,.7);g.add(e);
      upd=()=>{b.scale.x=1.6+Math.sin(G.time*5)*.2;g.position.y+=0;};g.userData.fly=2.2;
    }else if(kind==='rogueDrone'||kind==='secdrone'){
      const b=new THREE.Mesh(new THREE.SphereGeometry(.35,16,12),this.std(kind==='secdrone'?'#dfe6ee':'#2a2f38',{metalness:.8,roughness:.3}));g.add(b);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.55,.04,8,28),this.std('#12161c',{metalness:.9,roughness:.2}));ring.rotation.x=Math.PI/2;g.add(ring);
      const e=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),kind==='secdrone'?this.emissive('#6fa8ff',4):eye);e.position.z=.3;g.add(e);
      if(kind==='secdrone'){const lb=new THREE.Mesh(new THREE.BoxGeometry(.3,.06,.06),this.emissive('#ff3a3a',3));lb.position.y=.36;g.add(lb);const lr=lb.clone();lr.material=this.emissive('#3a6aff',3);lr.position.x=.15;lb.position.x=-.15;g.add(lr);}
      upd=()=>{ring.rotation.z+=.1;};g.userData.fly=2.6;
    }else if(kind==='sentinel'){
      const b=new THREE.Mesh(new THREE.OctahedronGeometry(.7,0),this.std('#3a3e48',{metalness:.9,roughness:.25}));b.position.y=2.2;b.scale.y=1.4;g.add(b);
      const e=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),eye);e.position.set(0,2.3,.5);g.add(e);
      for(let i=0;i<3;i++){const L=new THREE.Group();L.position.y=2;L.rotation.y=i*Math.PI*2/3;g.add(L);const s=new THREE.Mesh(new THREE.CylinderGeometry(.06,.04,2.5,6),this.std('#2a2e36',{metalness:.9}));s.position.set(0,-1.05,.55);s.rotation.x=-.45;L.add(s);legs.push(L);}
      upd=(dt,sp)=>{legs.forEach((L,i)=>L.children[0].rotation.x=-.45+Math.sin(G.time*3+i*2)*.15*Math.min(1,sp));b.rotation.y+=dt*.8;};
    }else if(kind==='construct'){
      const m=new THREE.MeshStandardMaterial({color:C('#18161a'),metalness:.95,roughness:.2});
      const b=new THREE.Mesh(new THREE.BoxGeometry(.9,1.6,.6),m);b.position.y=1.6;g.add(b);
      const h=new THREE.Mesh(new THREE.TetrahedronGeometry(.4,0),m);h.position.y=2.7;g.add(h);
      const line=new THREE.Mesh(new THREE.BoxGeometry(.92,.05,.62),this.emissive('#f2a33a',5));line.position.y=1.9;g.add(line);
      const line2=line.clone();line2.position.y=1.3;g.add(line2);
      const e=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),eye);e.position.set(0,2.7,.25);g.add(e);
      for(const x of[-.3,.3]){const L=new THREE.Mesh(new THREE.BoxGeometry(.22,.9,.22),m);L.position.set(x,.45,0);g.add(L);legs.push(L);}
      upd=(dt,sp)=>{legs[0].rotation.x=Math.sin(G.time*5)*.4*Math.min(1,sp);legs[1].rotation.x=-Math.sin(G.time*5)*.4*Math.min(1,sp);h.rotation.y+=dt*2;};
    }
    g.traverse(m=>{if(m.isMesh)m.castShadow=true;});
    return{root:g,pose(dt,sp){upd(dt,sp);}};
  },
  /* alien species body from a generated civilization */
  species(civ){
    const b=civ.body;const col='#'+new THREE.Color().setHSL(b.hue,b.sat,.45).getHexString();const acc='#'+new THREE.Color().setHSL((b.hue+.5)%1,.7,.6).getHexString();
    if(b.plan==='floater'){const t=this.thalassi(acc,b.h/2.4);return t;}
    if(b.plan==='insectoid'){const c=this.creature('crawler',col);c.root.scale.setScalar(b.h/1.2);return c;}
    if(b.plan==='crystalline'){const g=new THREE.Group();const m=new THREE.MeshStandardMaterial({color:C(col),emissive:C(acc),emissiveIntensity:b.glow?1.2:.3,roughness:.1,metalness:.3,transparent:true,opacity:.9});
      for(let i=0;i<5;i++){const c=new THREE.Mesh(new THREE.OctahedronGeometry(.25+Math.random()*.25,0),m);c.position.set((Math.random()-.5)*.5,.4+i*.35*b.h/1.6,(Math.random()-.5)*.3);g.add(c);}
      return{root:g,pose(dt){g.children.forEach((c,i)=>{c.rotation.y+=dt*(.5+i*.2);c.position.y+=Math.sin(G.time*2+i)*.002;});}};}
    const kind=b.plan==='tall'?'tall':b.plan==='squat'?'squat':'humanoid';
    const h=this.humanoid({h:b.h*(kind==='tall'?1.2:1),build:kind==='squat'?1.5:kind==='tall'?.8:1,suit:col,skin:acc,accent:acc,arms:b.limbs,pack:false,glow:b.glow});
    return h;
  },

  /* ── Spaceships built from hull class + fitted modules ── */
  ship(hullId,fit={},paint='#9fb0c2',opts={}){
    const g=new THREE.Group();const hp=[],eng=[];const scale=opts.scale||1;
    const PS=this.panelSet(U.hash(hullId)%6);const hullMat=new THREE.MeshStandardMaterial({color:C(paint).multiplyScalar(.9),metalness:.75,roughness:1,map:PS.map,normalMap:PS.normalMap,roughnessMap:PS.orm});
    const dark=new THREE.MeshStandardMaterial({color:C('#1a1e26'),metalness:.7,roughness:.35});
    const trim=new THREE.MeshStandardMaterial({color:C(opts.trim||'#f2a33a'),emissive:C(opts.trim||'#f2a33a'),emissiveIntensity:.6,metalness:.3,roughness:.4});
    const glass=new THREE.MeshStandardMaterial({color:C('#0a1624'),emissive:C('#8fd0e8'),emissiveIntensity:.5,metalness:.9,roughness:.05});
    const add=(geo,mat,x,y,z,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.scale.set(sx,sy,sz);g.add(m);return m;};
    const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);const cyl=(r1,r2,l,s=16)=>new THREE.CylinderGeometry(r1,r2,l,s);
    let L=20;
    switch(hullId){
      case 'wren':L=10;add(box(3,1.4,8),hullMat,0,0,0);add(new THREE.ConeGeometry(1.5,3,4),hullMat,0,0,5.5,Math.PI/2,Math.PI/4);add(box(1.6,.7,2),glass,0,.8,1.8);
        add(box(7,.25,2.5),hullMat,0,-.2,-1.5);eng.push([-1,0,-4.4],[1,0,-4.4]);hp.push([0,-.8,3]);break;
      case 'kestrel':L=22;add(box(5,2.4,16),hullMat,0,0,0);add(new THREE.ConeGeometry(2.6,6,6),hullMat,0,0,11,Math.PI/2);add(box(2.4,1,3.2),glass,0,1.5,5);
        add(box(14,.5,5),hullMat,0,-.3,-3);add(box(2,2.2,5),hullMat,-6.5,0,-3.5);add(box(2,2.2,5),hullMat,6.5,0,-3.5);add(box(5.2,.2,16.2),trim,0,1.25,0,0,0,0,1,1,.2);
        eng.push([-6.5,0,-6.3],[6.5,0,-6.3],[0,0,-8.2]);hp.push([-3,-1.4,6],[3,-1.4,6],[0,1.6,-2]);break;
      case 'lancer':L=20;add(box(3,1.6,16),hullMat,0,0,0);add(new THREE.ConeGeometry(1.7,7,4),hullMat,0,0,11.4,Math.PI/2,Math.PI/4);add(box(1.6,.9,3),glass,0,1.1,4);
        for(const s of[-1,1]){add(box(9,.3,5),hullMat,s*5,0,-3,0,0,s*-.12);add(cyl(.9,1.1,8),hullMat,s*9,0,-2,Math.PI/2);eng.push([s*9,0,-6.2]);hp.push([s*9,0,2.4]);}
        eng.push([0,0,-8.2]);hp.push([0,-1,5]);break;
      case 'mule':L=34;add(box(9,7,26),hullMat,0,0,0);add(box(6,4,6),hullMat,0,1,16);add(box(3.4,1.4,2),glass,0,2.4,19);
        for(let i=0;i<4;i++)add(box(10,7.6,.6),dark,0,0,-9+i*6);add(box(9.2,.3,26.2),trim,0,3.6,0,0,0,0,1,1,.05);eng.push([-3,0,-13.4],[3,0,-13.4]);hp.push([0,4,10]);break;
      case 'meridian':{L=48;const saucer=add(new THREE.SphereGeometry(10,48,24),hullMat,0,0,8,0,0,0,1.1,.28,1.25);
        add(new THREE.SphereGeometry(3.4,32,16,0,Math.PI*2,0,Math.PI/2),glass,0,2.2,12,0,0,0,1,.45,1);
        add(box(4,3.5,20),hullMat,0,-.5,-8);add(box(18,1,8),hullMat,0,-.5,-10,0,0,0,1,1,1);
        for(const s of[-1,1]){const n=add(cyl(2.1,2.4,22,24),hullMat,s*10,-.5,-10,Math.PI/2);add(cyl(1.8,1.8,.6,24),trim,s*10,-.5,1,Math.PI/2);
          add(new THREE.TorusGeometry(2.2,.25,8,32),this.emissive('#6fc8ff',2.5),s*10,-.5,-20.6);eng.push([s*10,-.5,-21.5]);}
        add(new THREE.TorusGeometry(10.5,.2,8,64),trim,0,.4,8,Math.PI/2,0,0,1.1,1.25,1);hp.push([-5,-2,14],[5,-2,14],[0,2.8,4]);eng.push([0,-.5,-18.4]);break;}
      case 'bastion':L=70;add(box(12,8,50),hullMat,0,0,0);add(new THREE.ConeGeometry(6.5,16,6),hullMat,0,0,33,Math.PI/2);add(box(10,5,14),hullMat,0,6,-8);add(box(5,1.6,3),glass,0,8.9,-3);
        for(const s of[-1,1]){add(box(4,10,40),hullMat,s*8,0,-3);eng.push([s*8,0,-23.4]);}for(let i=0;i<5;i++)hp.push([(i%2?1:-1)*6.5,4.2,18-i*9]);eng.push([0,0,-25.4]);
        add(box(12.2,.3,50.2),trim,0,4.1,0,0,0,0,1,1,.08);break;
      case 'seed':{L=56;const sm=new THREE.MeshStandardMaterial({color:C('#1c1a1e'),metalness:.95,roughness:.18});
        add(new THREE.SphereGeometry(7,32,20),sm,0,0,0,0,0,0,1,.7,3.2);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;add(box(.4,.4,40),this.emissive('#f2a33a',3.5),Math.cos(a)*5.6,Math.sin(a)*3.9,0);}
        add(new THREE.TorusGeometry(9,.6,10,48),sm,0,0,-14);add(new THREE.TorusGeometry(8.6,.15,8,48),this.emissive('#ffcf7e',4),0,0,-14);for(let i=0;i<4;i++)hp.push([Math.cos(i*1.57)*6,Math.sin(i*1.57)*4,12]);eng.push([0,0,-22.5]);break;}
      default:add(box(4,2,12),hullMat,0,0,0);eng.push([0,0,-6.2]);hp.push([0,-1.2,4]);
    }
    // drive visuals
    const drive=fit.drive||'torch';
    if(drive.startsWith('warp')||drive==='fold'){
      const rr=L*.42;const ring=new THREE.Mesh(new THREE.TorusGeometry(rr,rr*.05,10,64),new THREE.MeshStandardMaterial({color:C('#2a3140'),metalness:.9,roughness:.25}));ring.position.z=-L*.05;g.add(ring);
      const glow=new THREE.Mesh(new THREE.TorusGeometry(rr,rr*.018,8,64),this.emissive(drive==='fold'?'#ffcf7e':'#7fd4ff',3));glow.position.z=-L*.05;g.add(glow);g.userData.warpRing=glow;
      if(drive!=='warp1'){const r2=ring.clone();r2.position.z=-L*.3;r2.scale.setScalar(.85);g.add(r2);}
    }
    // turrets on hardpoints by high-slot modules
    (fit.high||[]).forEach((m,i)=>{if(!m||!hp[i])return;const M=MODULES[m];const t=new THREE.Group();t.position.set(...hp[i]);
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.6,.8,.5,10),dark);t.add(base);
      const col=M.kind==='mine'?'#6fffb0':M.kind==='missile'?'#ff9f6b':M.kind==='null'?'#ffcf7e':M.kind==='plasma'?'#b58cff':'#ff6a5a';
      const bar=new THREE.Mesh(new THREE.CylinderGeometry(.14,.18,M.kind==='rail'?4:2.4,8),dark);bar.rotation.x=Math.PI/2;bar.position.set(0,.3,1.2);t.add(bar);
      const tip=new THREE.Mesh(new THREE.SphereGeometry(.16,8,6),this.emissive(col,3));tip.position.set(0,.3,M.kind==='rail'?3.2:2.4);t.add(tip);g.add(t);});
    // engines
    const glows=[];
    eng.forEach(p=>{const n=new THREE.Mesh(new THREE.CylinderGeometry(L*.045,L*.06,L*.08,16,1,true),dark);n.rotation.x=Math.PI/2;n.position.set(p[0],p[1],p[2]+L*.02);g.add(n);
      const inner=new THREE.Mesh(new THREE.CircleGeometry(L*.042,16),this.emissive(opts.engine||'#7fd4ff',2));inner.position.set(p[0],p[1],p[2]-.01);inner.rotation.y=Math.PI;g.add(inner);
      const s=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex(),color:C(opts.engine||'#7fd4ff'),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));s.position.set(p[0],p[1],p[2]-L*.06);s.scale.setScalar(L*.3);g.add(s);glows.push(s);});
    // nav lights
    const nav=(x,y,z,c)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:this.sparkTex(),color:C(c),blending:THREE.AdditiveBlending,depthWrite:false}));s.position.set(x,y,z);s.scale.setScalar(L*.05);g.add(s);return s;};
    const navs=[nav(-L*.35,0,-L*.1,'#ff3a3a'),nav(L*.35,0,-L*.1,'#3aff7a'),nav(0,L*.08,-L*.4,'#ffffff')];
    g.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});
    g.scale.setScalar(scale);
    g.userData={length:L*scale,radius:L*.55*scale,hardpoints:hp.map(p=>new THREE.Vector3(...p)),glows,navs,engineCol:opts.engine||'#7fd4ff'};
    return g;
  },

  /* ── Planets (space view) ── */
  planetMaterial(body,seed){
    const types={earth:1,mars:2,gas:3,ice:4,lava:5,cloud:6,haze:7,ocean:8,terminator:9,rocky:0,snowball:4,ruin:0,elder:1,hub:10,mega:10,proc:11,vaultbody:10};
    let t=types[body.type]??0;
    const pal=body.pal||['#888','#555'];
    let biome=0;if(body.type==='proc'){biome={lava:5,iron:0,glass:12,desert:2,toxic:6,ocean:8,jungle:1,tundra:4,fungal:13,crystal:12,ice:4,barren:0}[body.biome]??0;t=biome;}
    // real maps: Sol bodies use their own; generated worlds borrow a real map of a similar world, re-tinted
    const MAPS={earth:'earth_day',mars:'mars',jupiter:'jupiter',saturn:'saturn',titan:'titan',europa:'europa',venus:'venus'};
    let mapName=MAPS[body.id];const r=U.rng(seed);
    if(!mapName&&body.type==='gas')mapName=U.pick(r,['jupiter','saturn','neptune']);
    if(!mapName&&body.type==='proc'){mapName={ice:U.pick(r,['europa','enceladus','pluto']),tundra:'ganymede',barren:U.pick(r,['ganymede','pluto']),iron:'mars',desert:'mars',lava:'io',glass:'io',crystal:'enceladus',toxic:'venus'}[body.biome]||null;}
    if(!mapName&&['ice','snowball'].includes(body.type))mapName='europa';if(!mapName&&body.type==='cloud')mapName='venus';if(!mapName&&body.type==='lava')mapName='io';if(!mapName&&body.type==='mars')mapName='mars';
    const own=!!MAPS[body.id];const tint=own?new THREE.Color(1,1,1):C(pal[0]).lerp(C(pal[1]),.5).multiplyScalar(1.6);
    const map=mapName?Assets.tex('planets/'+mapName+'.jpg',{aniso:4}):null;
    const isEarth=body.id==='earth';
    return new THREE.ShaderMaterial({uniforms:{c1:{value:C(pal[0])},c2:{value:C(pal[1])},c3:{value:C(pal[2]||pal[1])},type:{value:t},seed:{value:(seed%1000)/37},sunDir:{value:new THREE.Vector3(1,0,0)},time:{value:0},atmo:{value:C(body.atmo||'#000000')},hasAtmo:{value:body.atmo?1:0},
      map:{value:map},useMap:{value:map?1:0},tint:{value:tint},mixMap:{value:own?1:.75},earth:{value:isEarth?1:0},night:{value:isEarth?Assets.tex('planets/earth_night.jpg',{aniso:4}):null},clouds:{value:isEarth?Assets.tex('planets/earth_clouds.jpg',{srgb:false,aniso:4}):null}},
      vertexShader:`varying vec3 vN;varying vec3 vP;varying vec3 vWN;varying vec3 vW;void main(){vN=normalize(normal);vP=position;vWN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader:GLSL_NOISE+`uniform vec3 c1,c2,c3,sunDir,atmo,tint;uniform float type,seed,time,hasAtmo,useMap,mixMap,earth;uniform sampler2D map,night,clouds;varying vec3 vN;varying vec3 vP;varying vec3 vWN;varying vec3 vW;
      void main(){
        vec3 n=normalize(vP);vec3 p=n*2.2+seed;float h=fbm(p);vec3 col;float spec=0.;vec3 emi=vec3(0.);float cloud=0.;
        float lat=n.y;
        if(type<.5){col=mix(c2,c1,smoothstep(-.3,.4,h));float cr=pow(abs(snoise(p*6.)),6.);col*=1.-cr*.5;}
        else if(type<1.5){float land=smoothstep(.02,.08,h);col=mix(c1*.7,mix(c2,vec3(.55,.5,.38),smoothstep(.2,.45,h)),land);spec=(1.-land)*.6;
          col=mix(col,vec3(.95),smoothstep(.72,.85,abs(lat)));cloud=smoothstep(.1,.55,fbm(n*3.+vec3(time*.01,0.,0.)+9.));
          emi=vec3(1.,.72,.35)*land*step(.9,fract(sin(dot(floor(n*420.),vec3(12.9,78.2,37.7)))*43758.5))*smoothstep(.1,.3,h)*.55;}
        else if(type<2.5){col=mix(c2,c1,smoothstep(-.4,.5,h));col=mix(col,vec3(.9,.88,.86),smoothstep(.86,.94,abs(lat)));}
        else if(type<3.5){float b=sin(lat*18.+fbm(p*vec3(1.,6.,1.))*3.2+seed);col=mix(c1,c2,b*.5+.5);col=mix(col,c3,smoothstep(.6,1.,fbm(p*vec3(3.,12.,3.))));
          float spot=smoothstep(.12,.0,length(vec2(atan(n.z,n.x)-1.,lat+.35)*vec2(.5,1.4)));col=mix(col,vec3(.72,.3,.18),spot*.8);}
        else if(type<4.5){col=mix(c2,c1,smoothstep(-.2,.6,h));float cr=abs(snoise(p*8.));col=mix(col,c2*.6,smoothstep(.04,0.,cr)*.8);spec=.25;}
        else if(type<5.5){col=mix(c1,c1*.5,h*.5+.5);float cr=smoothstep(.08,0.,abs(snoise(p*4.)));emi=c2*cr*3.;}
        else if(type<6.5){float b=fbm(p*vec3(1.,3.,1.)+vec3(time*.02,0.,0.));col=mix(c1,c2,b*.5+.5);}
        else if(type<7.5){col=mix(c1,c2,fbm(p*vec3(1.,4.,1.))*.5+.5)*.9;}
        else if(type<8.5){float land=smoothstep(.25,.3,h);col=mix(c1,c2,fbm(p*3.)*.5+.5);col=mix(col,vec3(.2,.35,.25),land*.8);spec=(1.-land)*.8;cloud=smoothstep(.2,.6,fbm(n*3.+14.))*.7;}
        else if(type<9.5){col=mix(c1,c2,smoothstep(-.4,.4,dot(n,normalize(sunDir))*-1.+h*.3));}
        else if(type<10.5){col=c1;float g1=step(.97,fract(n.x*40.))+step(.97,fract(n.y*40.))+step(.97,fract(n.z*40.));emi=c2*g1*1.5;spec=.5;}
        else if(type<11.5){col=mix(c2,c1,smoothstep(-.3,.4,h));}
        else if(type<12.5){col=mix(c1,c2,smoothstep(-.1,.5,h));emi=c2*pow(max(snoise(p*5.),0.),4.)*1.5;spec=.6;}
        else {col=mix(c1,c2,smoothstep(-.3,.5,h));emi=c2*pow(max(snoise(p*7.),0.),5.)*.8;}
        if(useMap>.5){vec2 uv=vec2(atan(n.z,n.x)/6.2831853+.5,asin(clamp(n.y,-1.,1.))/3.14159265+.5);vec3 mc=texture2D(map,uv).rgb*tint;
          col=mix(col,mc,mixMap);
          if(earth>.5){vec3 brc=texture2D(clouds,uv+vec2(time*.0006,0.)).rgb;cloud=smoothstep(.15,.9,brc.b);float ocean=smoothstep(.45,.1,texture2D(clouds,uv).g);spec=ocean*.9;
            emi=pow(texture2D(night,uv).rgb,vec3(1.3))*2.2;}}
        vec3 N=normalize(vWN);vec3 L=normalize(sunDir);float d=dot(N,L);float lit=smoothstep(-.12,.35,d);
        vec3 V=normalize(cameraPosition-vW);vec3 H=normalize(L+V);float sp=pow(max(dot(N,H),0.),60.)*spec*lit;
        vec3 c=col*lit*1.25+sp*vec3(1.,.95,.85);
        c=mix(c,vec3(1.)*lit*1.2,cloud);
        c+=emi*(1.-lit)*((type>0.5&&type<1.5)||earth>.5?1.:0.)*(1.-cloud*.8)+emi*(type>1.5&&earth<.5?1.:0.);
        float rim=pow(1.-max(dot(N,V),0.),3.);c+=atmo*rim*hasAtmo*smoothstep(-.3,.4,d)*1.4;
        gl_FragColor=vec4(c,1.);}`});
  },
  atmosphere(radius,color){
    const m=new THREE.ShaderMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.BackSide,uniforms:{col:{value:C(color)},sunDir:{value:new THREE.Vector3(1,0,0)}},
      vertexShader:`varying vec3 vWN;varying vec3 vW;void main(){vWN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader:`uniform vec3 col,sunDir;varying vec3 vWN;varying vec3 vW;void main(){vec3 V=normalize(cameraPosition-vW);float f=pow(1.-abs(dot(normalize(vWN),V)),2.2);
        float l=smoothstep(-.4,.5,dot(normalize(vWN),normalize(sunDir)));float a=pow(max(0.,dot(-normalize(vWN),V)),5.);gl_FragColor=vec4(col*l*1.6,a*l*1.1);}`});
    return new THREE.Mesh(new THREE.SphereGeometry(radius*1.07,64,32),m);
  },
  rings(radius,color){
    const m=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,uniforms:{col:{value:C(color)},inner:{value:radius*1.25},outer:{value:radius*2.3},sunDir:{value:new THREE.Vector3(1,0,0)}},
      vertexShader:`varying vec3 vP;varying vec3 vW;void main(){vP=position;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader:`uniform vec3 col;uniform float inner,outer;varying vec3 vP;void main(){float r=length(vP.xy);float t=(r-inner)/(outer-inner);if(t<0.||t>1.)discard;
        float b=.55+.45*sin(t*90.)*sin(t*23.+1.)*sin(t*7.);float gap=smoothstep(.015,.0,abs(t-.62))*.9;float a=b*(1.-gap)*smoothstep(0.,.05,t)*smoothstep(1.,.9,t);gl_FragColor=vec4(col*(.7+b*.5),a*.85);}`});
    const r=new THREE.Mesh(new THREE.RingGeometry(radius*1.25,radius*2.3,128,1),m);r.rotation.x=-Math.PI/2+.45;return r;
  },
  star(radius,color,{blackhole=false}={}){
    const g=new THREE.Group();
    if(blackhole){
      const hole=new THREE.Mesh(new THREE.SphereGeometry(radius,48,32),new THREE.MeshBasicMaterial({color:0x000000}));g.add(hole);
      const disk=new THREE.Mesh(new THREE.RingGeometry(radius*1.6,radius*6,160,4),new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},rin:{value:radius*1.6},rout:{value:radius*6}},
        vertexShader:`varying vec3 vP;varying vec3 vW;void main(){vP=position;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader:GLSL_NOISE+`uniform float time,rin,rout;varying vec3 vP;varying vec3 vW;void main(){float r=length(vP.xy);float t=(r-rin)/(rout-rin);float a=atan(vP.y,vP.x);
          float swirl=fbm(vec3(cos(a-time*.3/(t+.2))*3.,sin(a-time*.3/(t+.2))*3.,t*6.));float band=.6+.4*sin(t*60.+swirl*6.);
          vec3 V=normalize(cameraPosition-vW);vec3 tang=normalize(vec3(-sin(a),0.,cos(a)));float dop=1.+.7*dot(tang,V);
          vec3 hot=mix(vec3(3.2,2.4,1.8),vec3(1.8,.55,.12),t);float I=pow(1.-t,1.6)*band*(swirl*.5+.8)*dop*dop*dop;gl_FragColor=vec4(hot*I*1.6,clamp(I,0.,1.)*smoothstep(0.,.04,t));}`}));
      disk.rotation.x=-Math.PI/2+.12;g.add(disk);
      // lensed image of the far side of the disk: a halo ring seen face-on
      const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:this.canvasTex(512,512,(c,w)=>{c.clearRect(0,0,w,w);const gr=c.createRadialGradient(w/2,w/2,w*.17,w/2,w/2,w*.3);gr.addColorStop(0,'rgba(255,220,160,0)');gr.addColorStop(.18,'rgba(255,230,190,1)');gr.addColorStop(.32,'rgba(255,170,90,.55)');gr.addColorStop(1,'rgba(255,120,40,0)');c.fillStyle=gr;c.fillRect(0,0,w,w);},{srgb:false}),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
      halo.scale.setScalar(radius*7.5);halo.material.color.setScalar(2.2);g.add(halo);g.userData.disk=disk;
      return g;
    }
    const m=new THREE.ShaderMaterial({uniforms:{col:{value:C(color)},time:{value:0}},
      vertexShader:`varying vec3 vN;varying vec3 vP;varying vec3 vW;void main(){vN=normalize(mat3(modelMatrix)*normal);vP=position;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader:GLSL_NOISE+`uniform vec3 col;uniform float time;varying vec3 vN;varying vec3 vP;varying vec3 vW;void main(){vec3 n=normalize(vP);float g=fbm(n*9.+time*.05)*.5+.5;float gran=snoise(n*60.+time*.2)*.5+.5;
        vec3 V=normalize(cameraPosition-vW);float mu=max(dot(normalize(vN),V),0.);float limb=.35+.65*pow(mu,.55);vec3 c=col*(2.4+g*1.3+gran*.5)*limb*3.;gl_FragColor=vec4(c,1.);}`});
    g.add(new THREE.Mesh(new THREE.SphereGeometry(radius,64,32),m));
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex(),color:C(color),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));glow.scale.setScalar(radius*9);glow.material.color.multiplyScalar(2.5);g.add(glow);
    const flare=new THREE.Sprite(new THREE.SpriteMaterial({map:this.canvasTex(512,64,(c,w,h)=>{const gr=c.createLinearGradient(0,0,w,0);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.5,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=gr;c.fillRect(0,h/2-2,w,4);},{srgb:false}),color:C(color),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
    flare.scale.set(radius*40,radius*2.5,1);g.add(flare);
    g.userData.mat=m;return g;
  },
  /* ── Space backdrop: procedural nebula + Milky Way band + starfield ── */
  spaceSky(opts={}){
    const g=new THREE.Group();
    const neb=C(opts.nebula||'#3a4a8a'),neb2=C(opts.nebula2||'#8a3a5a');
    const sky=new THREE.Mesh(new THREE.SphereGeometry(1,64,32),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{n1:{value:neb},n2:{value:neb2},band:{value:opts.band??1},seed:{value:opts.seed||1},gn:{value:new THREE.Vector3(...(opts.gn||[.2,.9,-.35])).normalize()},density:{value:opts.density??1}},
      vertexShader:`varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
      fragmentShader:GLSL_NOISE+`uniform vec3 n1,n2,gn;uniform float band,seed,density;varying vec3 vD;void main(){vec3 d=normalize(vD);
        float b=exp(-pow(dot(d,gn),2.)*14.)*band;float f=fbm(d*3.+seed)*.5+.5;float f2=fbm(d*7.-seed)*.5+.5;
        vec3 c=vec3(.004,.005,.01);c+=n1*pow(f,3.)*.12*density+n2*pow(f2,4.)*.1*density;
        c+=vec3(.75,.72,.8)*b*pow(f2,1.5)*.25;c-=vec3(.1)*b*smoothstep(.55,.75,fbm(d*12.+seed))*.9;
        gl_FragColor=vec4(max(c,0.),1.);}`}));
    sky.scale.setScalar(1);sky.renderOrder=-10;g.add(sky);
    const N=opts.stars||6000;const pos=new Float32Array(N*3),col=new Float32Array(N*3),size=new Float32Array(N);const r=U.rng(opts.seed||5);
    const gn=new THREE.Vector3(...(opts.gn||[.2,.9,-.35])).normalize();
    const palette=[[.62,.7,1],[.8,.85,1],[1,1,1],[1,.95,.85],[1,.82,.62],[1,.65,.45]];
    for(let i=0;i<N;i++){let v=new THREE.Vector3(r()*2-1,r()*2-1,r()*2-1).normalize();if(r()<.55*(opts.band??1)){v.addScaledVector(gn,-v.dot(gn)*(.85+r()*.15)).normalize();}
      pos.set([v.x*9000,v.y*9000,v.z*9000],i*3);const c=palette[Math.floor(Math.pow(r(),.8)*palette.length)];const b=.35+Math.pow(r(),6)*3;col.set([c[0]*b,c[1]*b,c[2]*b],i*3);size[i]=1+Math.pow(r(),8)*4;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setAttribute('size',new THREE.BufferAttribute(size,1));
    const pts=new THREE.Points(geo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexColors:true,uniforms:{pr:{value:Render.pixelRatio()}},
      vertexShader:`attribute float size;varying vec3 vC;uniform float pr;void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_Position.z=gl_Position.w*.9999;gl_PointSize=size*pr*1.4;}`,
      fragmentShader:`varying vec3 vC;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);float a=smoothstep(.5,0.,d);gl_FragColor=vec4(vC*a*a*1.6,a);}`}));
    g.add(pts);
    if(opts.galaxySprite){const s=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.galaxyTex(opts.galaxySprite.arms||4,9),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
      s.position.set(...opts.galaxySprite.dir).normalize().multiplyScalar(8000);s.lookAt(0,0,0);s.rotateX(opts.galaxySprite.tilt||1.1);s.scale.setScalar(opts.galaxySprite.size||2600);s.material.color.setScalar(1.6);g.add(s);}
    g.userData.follow=true;return g;
  },
  gate(radius,active){
    const g=new THREE.Group();const m=new THREE.MeshStandardMaterial({color:C('#1c1a1e'),metalness:.95,roughness:.2});
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,radius*.08,16,96),m);g.add(ring);
    for(let i=0;i<12;i++){const s=new THREE.Mesh(new THREE.BoxGeometry(radius*.12,radius*.3,radius*.12),m);const a=i/12*Math.PI*2;s.position.set(Math.cos(a)*radius,Math.sin(a)*radius,0);s.rotation.z=a;g.add(s);
      const l=new THREE.Mesh(new THREE.BoxGeometry(radius*.125,radius*.04,radius*.125),this.emissive('#f2a33a',active?4:.6));l.position.copy(s.position);l.rotation.z=a;g.add(l);}
    const vm=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},on:{value:active?1:0}},
      vertexShader:`varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:GLSL_NOISE+`uniform float time,on;varying vec2 vU;void main(){vec2 c=vU-.5;float r=length(c)*2.;if(r>1.)discard;float a=atan(c.y,c.x);
        float sw=fbm(vec3(cos(a+time*.4+r*4.)*2.,sin(a+time*.4+r*4.)*2.,r*3.-time*.3));vec3 col=mix(vec3(1.,.62,.2),vec3(.35,.5,1.),r);float I=(.25+.75*smoothstep(1.,.2,r))*(sw*.5+.6)*on;gl_FragColor=vec4(col*I*2.,I);}`});
    const disk=new THREE.Mesh(new THREE.CircleGeometry(radius*.95,64),vm);g.add(disk);g.userData.vm=vm;g.userData.radius=radius;return g;
  },
  station(big,engineer){
    const g=new THREE.Group();const m=new THREE.MeshStandardMaterial({color:C(engineer?'#1c1a1e':'#8a96a4'),metalness:.7,roughness:.35,map:engineer?null:this.panelTex('#ffffff',33)});
    const R=big?260:150;
    if(engineer){const core=new THREE.Mesh(new THREE.OctahedronGeometry(R*.5,0),m);core.scale.y=2.2;g.add(core);
      for(let i=0;i<3;i++){const r=new THREE.Mesh(new THREE.TorusGeometry(R*(.8+i*.25),R*.02,8,96),this.emissive('#f2a33a',2.5));r.rotation.x=Math.PI/2+i*.5;r.rotation.y=i;g.add(r);}
    }else{
      const ring=new THREE.Mesh(new THREE.TorusGeometry(R,R*.12,16,96),m);g.add(ring);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(R*.18,R*.18,R*1.1,24),m);hub.rotation.x=Math.PI/2;g.add(hub);
      for(let i=0;i<4;i++){const sp=new THREE.Mesh(new THREE.BoxGeometry(R*.05,R*2,R*.05),m);sp.rotation.z=i*Math.PI/4;g.add(sp);}
      const wm=new THREE.MeshBasicMaterial({map:this.windowTex(3,true)});wm.color.setScalar(2.5);
      const band=new THREE.Mesh(new THREE.TorusGeometry(R,R*.125,6,96,Math.PI*2),wm);band.scale.set(1,1,.35);g.add(band);
      const dock=new THREE.Mesh(new THREE.BoxGeometry(R*.4,R*.25,R*.1),this.emissive('#3ec9a7',2));dock.position.z=R*.56;g.add(dock);
    }
    g.userData.radius=R;return g;
  },
  asteroid(seed,size){
    const geo=new THREE.IcosahedronGeometry(size,3);const N=makeNoise(seed);const p=geo.attributes.position;const v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=v.clone().normalize();const d=1+fbm3(N,n.x*1.6,n.y*1.6,n.z*1.6,4)*.45;v.copy(n).multiplyScalar(size*d);p.setXYZ(i,v.x,v.y,v.z);}
    geo.computeVertexNormals();return geo;
  },
  /* particles: pooled additive sprites */
  Particles:class{
    constructor(scene,n=500){this.n=n;this.pos=new Float32Array(n*3);this.col=new Float32Array(n*3);this.size=new Float32Array(n);this.life=new Float32Array(n);this.max=new Float32Array(n);this.vel=new Float32Array(n*3);this.grav=new Float32Array(n);this.i=0;
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(this.pos,3));geo.setAttribute('color',new THREE.BufferAttribute(this.col,3));geo.setAttribute('size',new THREE.BufferAttribute(this.size,1));
      this.geo=geo;this.pts=new THREE.Points(geo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexColors:true,uniforms:{tex:{value:Gen.sparkTex()},scale:{value:innerHeight*.5}},
        vertexShader:`attribute float size;varying vec3 vC;uniform float scale;void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*scale/max(-mv.z,.1);gl_Position=projectionMatrix*mv;}`,
        fragmentShader:`uniform sampler2D tex;varying vec3 vC;void main(){vec4 t=texture2D(tex,gl_PointCoord);gl_FragColor=vec4(vC*t.a,t.a);}`}));
      this.pts.frustumCulled=false;scene.add(this.pts);}
    emit(p,v,col,size,life,grav=0){const i=this.i=(this.i+1)%this.n;this.pos.set([p.x,p.y,p.z],i*3);this.vel.set([v.x,v.y,v.z],i*3);this.col.set([col.r,col.g,col.b],i*3);this.size[i]=size;this.life[i]=life;this.max[i]=life;this.grav[i]=grav;}
    burst(p,col,n,speed,size,life,grav=0){const c=col.isColor?col:C(col);for(let k=0;k<n;k++){const v=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize().multiplyScalar(speed*(.3+Math.random()*.7));this.emit(p,v,c,size*(.5+Math.random()),life*(.5+Math.random()*.8),grav);}}
    update(dt){for(let i=0;i<this.n;i++){if(this.life[i]<=0){this.size[i]=0;continue;}this.life[i]-=dt;const k=i*3;this.vel[k+1]-=this.grav[i]*dt;this.pos[k]+=this.vel[k]*dt;this.pos[k+1]+=this.vel[k+1]*dt;this.pos[k+2]+=this.vel[k+2]*dt;
        const f=Math.max(0,this.life[i]/this.max[i]);this.col[k]*=.985;this.col[k+1]*=.975;this.col[k+2]*=.97;if(f<=0)this.size[i]=0;}
      this.geo.attributes.position.needsUpdate=true;this.geo.attributes.color.needsUpdate=true;this.geo.attributes.size.needsUpdate=true;}
    dispose(){this.pts.parent&&this.pts.parent.remove(this.pts);this.geo.dispose();}
  },
  warpTunnel(){
    const m=new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},col:{value:C('#7fd4ff')},k:{value:0}},
      vertexShader:`varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:GLSL_NOISE+`uniform float time,k;uniform vec3 col;varying vec2 vU;void main(){float a=vU.x*6.2831;float s=snoise(vec3(cos(a)*3.,sin(a)*3.,vU.y*8.-time*6.));
        float streak=pow(max(s,0.),6.)*3.+pow(fract(vU.x*64.+s*.1),40.)*step(.5,fract(vU.y*6.-time*3.+vU.x*13.))*1.5;
        vec3 c=mix(col,vec3(1.,.75,.4),smoothstep(-.5,.9,s))*streak*k;gl_FragColor=vec4(c,clamp(streak*k,0.,1.));}`});
    const t=new THREE.Mesh(new THREE.CylinderGeometry(30,30,2400,48,1,true),m);t.rotation.x=Math.PI/2;t.userData.m=m;return t;
  },
};

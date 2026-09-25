/* ═══════════════════════════════════════════════════════════════════════
   Render pipeline (three.js r170):
   HDR scene (MSAA) → GTAO ambient occlusion → Unreal bloom → ACES output
   → cinematic grade (chromatic aberration, grain, vignette, warp lensing,
   damage and Neural Targeting grades, fades) → SMAA on lower settings.
   Image-based lighting comes from PMREM environments per scene.
   ═══════════════════════════════════════════════════════════════════════ */

// Authored colours are sRGB hex; three's colour management converts them to the linear working space.
function C(hex){return new THREE.Color(hex);}

const GradeShader={
  uniforms:{tDiffuse:{value:null},time:{value:0},warp:{value:0},damage:{value:0},vats:{value:0},fade:{value:0},sat:{value:1},vignette:{value:.9},grain:{value:.035},ca:{value:.0012},aspect:{value:1},tint:{value:new THREE.Vector3(1,1,1)}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tDiffuse;uniform float time,warp,damage,vats,fade,sat,vignette,grain,ca,aspect;uniform vec3 tint;varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+time*61.7)*43758.5453);}
    void main(){vec2 uv=vUv;vec2 cc=uv-.5;cc.x*=aspect;float r=length(cc);vec2 dir=normalize(cc+1e-5);
      if(warp>0.){uv=.5+(uv-.5)*(1.-warp*.18*r*r);uv+=dir*warp*.012*sin(r*40.-time*18.);}
      float k=ca*(1.+warp*6.+damage*3.)*r;
      vec3 col=vec3(texture2D(tDiffuse,uv+dir*k).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-dir*k).b);
      col*=tint;float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,sat);
      if(vats>0.)col=mix(col,vec3(l*1.25,l*.92,l*.55),vats*.55);
      if(damage>0.)col=mix(col,vec3(l*1.3,l*.15,l*.1),damage*.35*smoothstep(.25,.9,r));
      col*=mix(1.,smoothstep(1.1,.25,r),vignette*.5);
      col+=(h(uv*1000.)-.5)*grain;col*=1.-fade;
      gl_FragColor=vec4(col,1.);}`
};

const Render={
  fx:{bloom:.85,threshold:.9,exposure:1,vignette:.9,grain:.035,ca:.0012,warp:0,damage:0,vats:0,fade:0,sat:1,tint:new THREE.Vector3(1,1,1),ao:true},
  init(canvas){
    const r=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',stencil:false});
    r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1;r.outputColorSpace=THREE.SRGBColorSpace;
    r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;
    G.renderer=r;this.pmrem=new THREE.PMREMGenerator(r);
    this.build();addEventListener('resize',()=>this.resize());
  },
  pixelRatio(){const q=G.settings.quality;const d=Math.min(devicePixelRatio||1,2);return q==='low'?Math.min(.85,d):q==='medium'?Math.min(1,d):q==='ultra'?d:Math.min(1.35,d);},
  build(){
    const r=G.renderer,q=G.settings.quality;const w=innerWidth,h=innerHeight,pr=this.pixelRatio();
    r.setPixelRatio(pr);r.setSize(w,h,false);const W=Math.floor(w*pr),H=Math.floor(h*pr);
    if(this.composer)this.composer.dispose&&this.composer.dispose();
    const rt=new THREE.WebGLRenderTarget(W,H,{type:THREE.HalfFloatType,samples:(q==='high'||q==='ultra')?4:0});
    const c=this.composer=new THREE.EffectComposer(r,rt);c.setPixelRatio(1);c.setSize(W,H);
    this.renderPass=new THREE.RenderPass(new THREE.Scene(),new THREE.PerspectiveCamera());c.addPass(this.renderPass);
    this.gtao=null;
    if(q==='high'||q==='ultra'){this.gtao=new THREE.GTAOPass(new THREE.Scene(),new THREE.PerspectiveCamera(),W,H);this.gtao.blendIntensity=.85;
      this.gtao.updateGtaoMaterial({radius:.6,distanceExponent:1.4,thickness:1.2,scale:1,samples:q==='ultra'?16:10});c.addPass(this.gtao);}
    this.bloom=null;if(q!=='low'){this.bloom=new THREE.UnrealBloomPass(new THREE.Vector2(W,H),.55,.55,.92);c.addPass(this.bloom);}
    c.addPass(new THREE.OutputPass());
    this.grade=new THREE.ShaderPass(GradeShader);c.addPass(this.grade);
    if(q==='low'||q==='medium')c.addPass(new THREE.SMAAPass(W,H));
    r.shadowMap.enabled=q!=='low';this.W=W;this.H=H;
    if(G.camera){G.camera.aspect=w/h;G.camera.updateProjectionMatrix();}
  },
  resize(){clearTimeout(this._rz);this._rz=setTimeout(()=>this.build(),120);},
  /* image-based lighting: equirect HDR or a procedural sky scene → PMREM */
  envFromTexture(t){if(!t)return null;const e=this.pmrem.fromEquirectangular(t).texture;return e;},
  envFromScene(scene){return this.pmrem.fromScene(scene,.03,.1,1000).texture;},
  draw(scene,camera){
    const f=this.fx;
    this.renderPass.scene=scene;this.renderPass.camera=camera;
    if(this.gtao){const on=f.ao&&G.mode==='surface';this.gtao.enabled=on;if(on){this.gtao.scene=scene;this.gtao.camera=camera;}}
    if(this.bloom){this.bloom.strength=f.bloom*.62;this.bloom.threshold=f.threshold;}
    G.renderer.toneMappingExposure=f.exposure;
    const u=this.grade.uniforms;u.time.value=G.time%1000;u.warp.value=f.warp;u.damage.value=f.damage;u.vats.value=f.vats;u.fade.value=f.fade;u.sat.value=f.sat;
    u.vignette.value=f.vignette;u.grain.value=f.grain;u.ca.value=f.ca;u.aspect.value=this.W/this.H;u.tint.value.copy(f.tint);
    this.composer.render();
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   Render pipeline: HDR scene target (MSAA on WebGL2) → threshold → 5-level
   dual-filter bloom → composite (ACES filmic, chromatic aberration, grain,
   vignette, warp lensing, damage + targeting grades) → sRGB.
   ═══════════════════════════════════════════════════════════════════════ */

// Authored colors are sRGB hex; lighting is computed linearly. C() converts once.
const _ccache=new Map();
function C(hex){let c=_ccache.get(hex);if(!c){c=new THREE.Color(hex).convertSRGBToLinear();_ccache.set(hex,c);}return c.clone();}

const Render={
  rt:null,bright:null,levels:[],quad:null,ocam:null,mats:{},w:0,h:0,
  fx:{bloom:.85,threshold:.9,exposure:1,vignette:.9,grain:.045,ca:.0012,warp:0,damage:0,vats:0,fade:0,sat:1,tint:new THREE.Vector3(1,1,1)},
  init(canvas){
    const r=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',stencil:false});
    r.outputEncoding=THREE.LinearEncoding;r.toneMapping=THREE.NoToneMapping;r.autoClear=true;
    r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;
    G.renderer=r;this.gl2=r.capabilities.isWebGL2;
    this.ftype=this.gl2?THREE.HalfFloatType:THREE.UnsignedByteType;
    this.ocam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),null);this.qscene=new THREE.Scene();this.qscene.add(this.quad);
    const vs=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
    this.mats.bright=new THREE.ShaderMaterial({vertexShader:vs,uniforms:{t:{value:null},th:{value:1}},fragmentShader:`
      uniform sampler2D t;uniform float th;varying vec2 vUv;
      void main(){vec3 c=texture2D(t,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));float k=smoothstep(th,th*1.8+.2,l);gl_FragColor=vec4(c*k,1.);}`});
    // Kawase-style dual filter: 13-tap downsample, 9-tap tent upsample.
    this.mats.down=new THREE.ShaderMaterial({vertexShader:vs,uniforms:{t:{value:null},px:{value:new THREE.Vector2()}},fragmentShader:`
      uniform sampler2D t;uniform vec2 px;varying vec2 vUv;
      void main(){vec3 s=texture2D(t,vUv).rgb*4.;
        s+=texture2D(t,vUv+px*vec2(-1,-1)).rgb;s+=texture2D(t,vUv+px*vec2(1,-1)).rgb;s+=texture2D(t,vUv+px*vec2(-1,1)).rgb;s+=texture2D(t,vUv+px*vec2(1,1)).rgb;
        gl_FragColor=vec4(s/8.,1.);}`});
    this.mats.up=new THREE.ShaderMaterial({vertexShader:vs,uniforms:{t:{value:null},prev:{value:null},px:{value:new THREE.Vector2()},mixw:{value:1}},fragmentShader:`
      uniform sampler2D t,prev;uniform vec2 px;uniform float mixw;varying vec2 vUv;
      void main(){vec3 s=texture2D(t,vUv+px*vec2(-2,0)).rgb+texture2D(t,vUv+px*vec2(2,0)).rgb+texture2D(t,vUv+px*vec2(0,-2)).rgb+texture2D(t,vUv+px*vec2(0,2)).rgb;
        s+=(texture2D(t,vUv+px*vec2(-1,1)).rgb+texture2D(t,vUv+px*vec2(1,1)).rgb+texture2D(t,vUv+px*vec2(-1,-1)).rgb+texture2D(t,vUv+px*vec2(1,-1)).rgb)*2.;
        gl_FragColor=vec4(s/12.+texture2D(prev,vUv).rgb*mixw,1.);}`});
    this.mats.comp=new THREE.ShaderMaterial({vertexShader:vs,uniforms:{
      tScene:{value:null},tBloom:{value:null},bloom:{value:.8},exposure:{value:1},vignette:{value:.9},grain:{value:.04},ca:{value:.001},
      time:{value:0},warp:{value:0},damage:{value:0},vats:{value:0},fade:{value:0},sat:{value:1},tint:{value:new THREE.Vector3(1,1,1)},aspect:{value:1},useBloom:{value:1}},
      fragmentShader:`
      uniform sampler2D tScene,tBloom;uniform float bloom,exposure,vignette,grain,ca,time,warp,damage,vats,fade,sat,aspect,useBloom;uniform vec3 tint;varying vec2 vUv;
      vec3 aces(vec3 x){const float a=2.51,b=.03,c=2.43,d=.59,e=.14;return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.);}
      float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+time*61.7)*43758.5453);}
      void main(){
        vec2 uv=vUv;vec2 cc=uv-.5;cc.x*=aspect;float r=length(cc);
        if(warp>0.){uv=.5+(uv-.5)*(1.-warp*.18*r*r);uv+=normalize(cc+1e-5)*warp*.012*sin(r*40.-time*18.);}
        float k=ca*(1.+warp*6.+damage*3.)*r;vec2 dir=normalize(cc+1e-5);
        vec3 col=vec3(texture2D(tScene,uv+dir*k).r,texture2D(tScene,uv).g,texture2D(tScene,uv-dir*k).b);
        if(useBloom>.5)col+=texture2D(tBloom,uv).rgb*bloom;
        col*=exposure*tint;
        col=aces(col);
        float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,sat);
        if(vats>0.){col=mix(col,vec3(l*1.25,l*.92,l*.55),vats*.55);}
        if(damage>0.){col=mix(col,vec3(l*1.3,l*.15,l*.1),damage*.35*smoothstep(.25,.9,r));}
        col*=mix(1.,smoothstep(1.05,.25,r),vignette*.55);
        col=pow(col,vec3(1./2.2));
        col+=(h(uv*1000.)-.5)*grain;
        col*=1.-fade;
        gl_FragColor=vec4(col,1.);}`});
    this.resize();addEventListener('resize',()=>this.resize());
  },
  pixelRatio(){const q=G.settings.quality;const d=Math.min(devicePixelRatio||1,2);return q==='low'?Math.min(1,d):q==='medium'?Math.min(1.25,d):q==='ultra'?d:Math.min(1.5,d);},
  resize(){
    const r=G.renderer,w=innerWidth,h=innerHeight,pr=this.pixelRatio();r.setPixelRatio(pr);r.setSize(w,h,false);
    const W=Math.floor(w*pr),H=Math.floor(h*pr);this.w=W;this.h=H;
    if(this.rt)this.rt.dispose();this.levels.forEach(l=>l.dispose());if(this.bright)this.bright.dispose();
    const opts={type:this.ftype,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true};
    if(this.gl2&&THREE.WebGLMultisampleRenderTarget&&G.settings.quality!=='low'){this.rt=new THREE.WebGLMultisampleRenderTarget(W,H,opts);this.rt.samples=4;}
    else this.rt=new THREE.WebGLRenderTarget(W,H,opts);
    const lo={type:this.ftype,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false};
    this.bright=new THREE.WebGLRenderTarget(W>>1,H>>1,lo);
    this.levels=[];let lw=W>>1,lh=H>>1;for(let i=0;i<5;i++){lw=Math.max(2,lw>>1);lh=Math.max(2,lh>>1);this.levels.push(new THREE.WebGLRenderTarget(lw,lh,lo));}
    this.ups=[];for(let i=0;i<4;i++)this.ups.push(new THREE.WebGLRenderTarget(this.levels[i].width,this.levels[i].height,lo));
    if(G.camera){G.camera.aspect=w/h;G.camera.updateProjectionMatrix();}
    G.renderer.shadowMap.enabled=G.settings.quality!=='low';
  },
  pass(mat,target){this.quad.material=mat;G.renderer.setRenderTarget(target);G.renderer.render(this.qscene,this.ocam);},
  draw(scene,camera){
    const r=G.renderer,f=this.fx,useBloom=G.settings.quality!=='low';
    r.setRenderTarget(this.rt);r.render(scene,camera);
    const comp=this.mats.comp.uniforms;
    if(useBloom){
      this.mats.bright.uniforms.t.value=this.rt.texture;this.mats.bright.uniforms.th.value=f.threshold;this.pass(this.mats.bright,this.bright);
      let src=this.bright;
      for(const l of this.levels){this.mats.down.uniforms.t.value=src.texture;this.mats.down.uniforms.px.value.set(1/src.width,1/src.height);this.pass(this.mats.down,l);src=l;}
      let prev=this.levels[4];
      for(let i=3;i>=0;i--){const u=this.mats.up.uniforms;u.t.value=prev.texture;u.prev.value=this.levels[i].texture;u.px.value.set(.5/prev.width,.5/prev.height);u.mixw.value=1;this.pass(this.mats.up,this.ups[i]);prev=this.ups[i];}
      comp.tBloom.value=prev.texture;
    }
    comp.useBloom.value=useBloom?1:0;
    comp.tScene.value=this.rt.texture;comp.bloom.value=f.bloom*.22;comp.exposure.value=f.exposure;comp.vignette.value=f.vignette;comp.grain.value=f.grain;
    comp.ca.value=f.ca;comp.time.value=G.time%1000;comp.warp.value=f.warp;comp.damage.value=f.damage;comp.vats.value=f.vats;comp.fade.value=f.fade;comp.sat.value=f.sat;comp.tint.value.copy(f.tint);
    comp.aspect.value=this.w/this.h;
    this.pass(this.mats.comp,null);
  }
};

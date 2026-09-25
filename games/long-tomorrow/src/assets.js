/* ═══════════════════════════════════════════════════════════════════════
   ASSETS · third-party models, textures and HDRIs (credited in-game).
   Published build: files are served next to the page under assets/.
   Offline build: the build embeds them as data URLs in window.__ASSETS__.
   Every loader fails soft: the game falls back to procedural geometry.
   ═══════════════════════════════════════════════════════════════════════ */
const Assets={
  gltfs:new Map(),texs:new Map(),hdrs:new Map(),credits:null,failed:new Set(),loaded:new Map(),
  sync(p){return this.loaded.get(p)||null;},
  url(p){return (window.__ASSETS__&&window.__ASSETS__[p])||('assets/'+p);},
  /* embedded glTF images decode through <img> (blob: URLs) rather than fetch(), which strict page policies can block */
  loader(){if(this._gl)return this._gl;const l=new THREE.GLTFLoader();l.register(parser=>{parser.textureLoader=new THREE.TextureLoader(parser.options.manager);parser.textureLoader.setCrossOrigin(parser.options.crossOrigin);return{name:'lt_img_textures'};});return this._gl=l;},
  /* raw bytes: the file itself, or its base64 twin (hosts that only serve web types get "<file>.b64.txt") */
  magic:{glb:'glTF',hdr:'#?'},
  async bytes(p){const u=this.url(p);const ext=p.split('.').pop();const ok=buf=>{const m=this.magic[ext];if(!m)return true;const b=new Uint8Array(buf,0,m.length);return String.fromCharCode(...b)===m;};
    if(!this.b64||u.startsWith('data:')){try{const r=await fetch(u);if(r.ok){const buf=await r.arrayBuffer();if(ok(buf))return buf;}}catch(e){}}
    const r=await fetch(u+'.b64.txt');if(!r.ok)throw new Error('missing '+p);this.b64=true;const t=(await r.text()).replace(/\s+/g,'');const bin=atob(t);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a.buffer;},
  gltf(p){
    if(!this.gltfs.has(p))this.gltfs.set(p,this.bytes(p).then(buf=>this.loader().parseAsync(buf,'')).then(g=>{this.loaded.set(p,g);return g;}).catch(e=>{console.warn('asset failed',p,e);this.failed.add(p);return null;}));
    return this.gltfs.get(p);
  },
  /* synchronous texture handle; pixels arrive when loaded */
  tex(p,{srgb=true,repeat=null,aniso=8}={}){
    const key=p+(srgb?'s':'l')+(repeat||'');let t=this.texs.get(key);if(t)return t;
    t=new THREE.TextureLoader().load(this.url(p),undefined,undefined,()=>{this.failed.add(p);});
    t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=aniso;
    if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);}
    this.texs.set(key,t);return t;
  },
  /* Radiance .hdr → half-float equirect texture (parsed here so it only needs a plain fetch) */
  hdr(p){
    if(!this.hdrs.has(p))this.hdrs.set(p,this.bytes(p).then(buf=>{
      const d=new THREE.RGBELoader().setDataType(THREE.HalfFloatType).parse(buf);
      const t=new THREE.DataTexture(d.data,d.width,d.height,THREE.RGBAFormat,d.type);t.colorSpace=THREE.LinearSRGBColorSpace;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.flipY=true;t.needsUpdate=true;
      t.mapping=THREE.EquirectangularReflectionMapping;return t;}).catch(e=>{console.warn('hdr failed',p,e);this.failed.add(p);return null;}));
    return this.hdrs.get(p);
  },
  async loadCredits(){
    if(this.credits)return this.credits;
    try{const r=await fetch(this.url('CREDITS.json'));this.credits=await r.json();}catch(e){this.credits=window.__CREDITS__||[];}
    return this.credits;
  },
  /* preload the essentials behind the title screen, reporting progress */
  async preload(onProgress){
    const list=['models/soldier.glb','models/michelle.glb','models/xbot.glb','models/anim_walk.glb','models/anim_sit.glb','models/barrel.glb'];
    let done=0;const tick=()=>{done++;onProgress&&onProgress(done/list.length);};
    await Promise.all(list.map(p=>this.gltf(p).then(tick)));
    await Chars.init();
  },
};

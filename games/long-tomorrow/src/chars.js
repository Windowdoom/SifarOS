/* ═══════════════════════════════════════════════════════════════════════
   CHARS · rigged, animated characters built from credited Mixamo bodies
   (Soldier, Michelle, X Bot) that share one skeleton layout. Clips from any
   body are retargeted at load: the hips' rotation and translation are
   converted through each rig's armature frame and scaled by hip height.
   Aiming and head-look point bone chains at world-space targets, which
   works whatever the bones' local axes are.
   ═══════════════════════════════════════════════════════════════════════ */
const Chars={
  ready:false,bodies:{},clipSrc:[],helmet:null,
  async init(){
    const [sol,mic,xb,walk,sit]=await Promise.all(['models/soldier.glb','models/michelle.glb','models/xbot.glb','models/anim_walk.glb','models/anim_sit.glb'].map(p=>Assets.gltf(p)));
    if(!sol||!mic||!xb)return false;
    const info=g=>{g.scene.updateMatrixWorld(true);let hips=null;g.scene.traverse(o=>{if((o.isBone||/^mixamorig/.test(o.name))&&/Hips$/.test(o.name)&&!hips)hips=o;});if(!hips)return null;
      const arm=hips.parent;const q=arm.quaternion.clone();const wp=new THREE.Vector3();hips.getWorldPosition(wp);
      // which way the rig faces in its file: forward = left × up, from the hands in the T-pose
      let lh=null,rh=null;g.scene.traverse(o=>{if(/LeftHand$/.test(o.name)&&!lh)lh=o;if(/RightHand$/.test(o.name)&&!rh)rh=o;});
      let yaw=0;if(lh&&rh){const l=lh.getWorldPosition(new THREE.Vector3()).sub(rh.getWorldPosition(new THREE.Vector3()));yaw=Math.atan2(-l.z,l.x);}
      return{hips,armQ:q,hipH:wp.y,yaw,scene:g.scene,anims:g.animations};};
    this.bodies={soldier:info(sol),michelle:info(mic),xbot:info(xb)};if(!this.bodies.soldier||!this.bodies.michelle||!this.bodies.xbot)return false;
    const W=walk?info(walk):null,S=sit?info(sit):null;
    const find=(g,re)=>g.anims.find(a=>re.test(a.name));
    const B=this.bodies;
    // clip sources: [name, clip, source-info]
    this.clipSrc=[['idle',find(B.soldier,/^Idle$/),B.soldier],['walk',find(B.soldier,/^Walk$/),B.soldier],['run',find(B.soldier,/^Run$/),B.soldier],
      ['sneak',find(B.xbot,/sneak/),B.xbot],['agree',find(B.xbot,/agree/),B.xbot],['shake',find(B.xbot,/headShake/),B.xbot],['sad',find(B.xbot,/sad/),B.xbot],['dance',find(B.michelle,/Samba/),B.michelle]];
    if(W)this.clipSrc.push(['stroll',W.anims[0],W]);if(S)this.clipSrc.push(['sit',S.anims[0],S]);
    this.clipSrc=this.clipSrc.filter(c=>c[1]);
    // retarget every clip to every body once
    for(const k in B){const b=B[k];b.clips={};const names=new Set();b.scene.traverse(o=>{if(o.isBone)names.add(o.name);});
      for(const [n,clip,src] of this.clipSrc)b.clips[n]=this.retarget(clip,src,b,names,n==='sit');
      // a rig's own locomotion beats any retarget
      if(k==='xbot')for(const [n,re] of [['idle',/^idle$/],['walk',/^walk$/],['run',/^run$/]]){const c=find(b,re);if(c)b.clips[n]=this.retarget(c,b,b,names,false);}}
    this.ready=true;return true;
  },
  /* Retarget a clip between Mixamo rigs whose bones share names but not local axes.
     Each bone's world rotation is expressed as a delta from its rest (bind) pose on the
     source, applied to the target's rest pose, then converted back to the target's local
     space top-down. Hips height is scaled by the ratio of hip heights; root drift is removed
     so every clip plays in place. Clips that already belong to the rig are only filtered. */
  retarget(clip,src,dst,names,keepHipY){
    const isHip=n=>/Hips$/.test(n);
    if(src===dst){const out=clip.clone();out.tracks=out.tracks.filter(t=>{const [node,prop]=t.name.split('.');if(!names.has(node)||prop==='scale')return false;if(prop==='position'&&!isHip(node))return false;
        if(isHip(node)&&prop==='position'){const v=t.values;const x0=v[0],z0=v[2];for(let i=0;i<v.length;i+=3){v[i]=x0;v[i+2]=keepHipY?z0+(v[i+2]-z0)*.3:z0;}}return true;});return out;}
    const rig=r=>{if(r.rig)return r.rig;const sc=r===src||r===dst?r.scene:r.scene;sc.updateMatrixWorld(true);const nodes={},rest={},restL={},order=[];
      sc.traverse(o=>{if(/^mixamorig/.test(o.name)){nodes[o.name]=o;rest[o.name]=o.getWorldQuaternion(new THREE.Quaternion());restL[o.name]={q:o.quaternion.clone(),p:o.position.clone()};order.push(o.name);}});
      return r.rig={nodes,rest,restL,order};};
    // the source is sampled on its own clone so the shared bind pose is never disturbed
    if(!src.sampler){const sc=THREE.SkeletonUtils.clone(src.scene);sc.updateMatrixWorld(true);const nodes={};sc.traverse(o=>{if(/^mixamorig/.test(o.name))nodes[o.name]=o;});src.sampler={sc,nodes};}
    const S=rig(src),D=rig(dst),sm=src.sampler;
    for(const n in sm.nodes){const r=S.restL[n];if(r){sm.nodes[n].quaternion.copy(r.q);sm.nodes[n].position.copy(r.p);}}
    const mixer=new THREE.AnimationMixer(sm.sc);const act=mixer.clipAction(clip);act.play();
    const fps=30,dur=Math.max(clip.duration,1/fps),N=Math.max(2,Math.round(dur*fps)+1);const times=new Float32Array(N);for(let i=0;i<N;i++)times[i]=Math.min(dur,i/fps);
    const animated=new Set(clip.tracks.map(t=>t.name.split('.')[0]));
    const bones=D.order.filter(n=>names.has(n));const qv={};for(const n of bones)if(animated.has(n)&&S.nodes[n])qv[n]=new Float32Array(N*4);
    const hipName=bones.find(isHip);const hv=new Float32Array(N*3);const ratio=dst.hipH/src.hipH;
    const sArm=S.nodes[hipName]&&S.nodes[hipName].parent,dArm=D.nodes[hipName]&&D.nodes[hipName].parent;
    const sM=new THREE.Matrix3(),dMi=new THREE.Matrix3();if(sArm){sArm.updateMatrixWorld(true);sM.setFromMatrix4(sArm.matrixWorld);}if(dArm){dArm.updateMatrixWorld(true);dMi.setFromMatrix4(dArm.matrixWorld).invert();}
    const W={},tq=new THREE.Quaternion(),pw=new THREE.Quaternion(),v=new THREE.Vector3();let x0=null,z0=null;
    // deltas are world rotations; conjugate them by the difference in facing so a raised right arm stays a raised right arm
    const Cf=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(dst.yaw||0)-(src.yaw||0)),Cfi=Cf.clone().invert();
    for(let i=0;i<N;i++){
      mixer.setTime(Math.min(times[i],dur-1e-4));sm.sc.updateMatrixWorld(true);
      for(const n of bones){const d=D.nodes[n];const par=d.parent;
        if(par&&W[par.name])pw.copy(W[par.name]);else if(par)par.getWorldQuaternion(pw);else pw.identity();
        let wq;
        if(qv[n]){sm.nodes[n].getWorldQuaternion(tq);tq.multiply(S.rest[n].clone().invert());tq.premultiply(Cf).multiply(Cfi);wq=tq.clone().multiply(D.rest[n]);}
        else wq=pw.clone().multiply(D.restL[n].q);
        W[n]=wq;
        if(qv[n]){const lq=pw.clone().invert().multiply(wq);const a=qv[n];a[i*4]=lq.x;a[i*4+1]=lq.y;a[i*4+2]=lq.z;a[i*4+3]=lq.w;}}
      if(hipName&&sm.nodes[hipName]){v.copy(sm.nodes[hipName].position).applyMatrix3(sM);if(x0===null){x0=v.x;z0=v.z;}v.x=0;v.z=keepHipY?(v.z-z0)*.3:0;v.y*=ratio;v.applyMatrix3(dMi);hv[i*3]=v.x;hv[i*3+1]=v.y;hv[i*3+2]=v.z;}
    }
    mixer.stopAllAction();mixer.uncacheRoot(sm.sc);
    const tracks=[];for(const n in qv){const a=qv[n];for(let i=1;i<N;i++){const o=i*4,p=o-4;if(a[o]*a[p]+a[o+1]*a[p+1]+a[o+2]*a[p+2]+a[o+3]*a[p+3]<0){a[o]*=-1;a[o+1]*=-1;a[o+2]*=-1;a[o+3]*=-1;}}tracks.push(new THREE.QuaternionKeyframeTrack(n+'.quaternion',times,a));}
    if(hipName&&animated.has(hipName))tracks.push(new THREE.VectorKeyframeTrack(hipName+'.position',times,hv));
    return new THREE.AnimationClip(clip.name,dur,tracks);
  },
  /* EVA helmet: clearcoat shell, gold-tinted iridescent visor facing +Z, neck ring and a lamp */
  makeHelmet(r){const g=new THREE.Group();
    const shell=new THREE.Mesh(new THREE.SphereGeometry(r,40,28),this._shellM||(this._shellM=new THREE.MeshPhysicalMaterial({color:C('#eceff2'),roughness:.32,metalness:.05,clearcoat:.9,clearcoatRoughness:.15})));shell.castShadow=true;g.add(shell);
    const visor=new THREE.Mesh(new THREE.SphereGeometry(r*1.025,40,20,Math.PI*.5-Math.PI*.36,Math.PI*.72,Math.PI*.3,Math.PI*.34),this._visorM||(this._visorM=new THREE.MeshPhysicalMaterial({color:C('#241a08'),roughness:.05,metalness:1,clearcoat:1,iridescence:.5,iridescenceIOR:1.5,envMapIntensity:1.5})));g.add(visor);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r*.78,r*.12,10,32),this._ringM||(this._ringM=new THREE.MeshStandardMaterial({color:C('#8a929c'),metalness:.9,roughness:.3})));ring.rotation.x=Math.PI/2;ring.position.y=-r*.78;g.add(ring);
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(r*.28,r*.16,r*.22),Gen.emissive('#fff2dc',3));lamp.position.set(r*.78,r*.35,r*.5);g.add(lamp);
    return g;},
  /* the player's chosen body and suit tint (used by the creator and every scene) */
  playerLook(p,site){const b=p.body||'soldier';
    // the civilian body suits up on airless or toxic worlds: a white pressure suit trimmed in the player's colour
    if(site&&!site.breathable&&b==='michelle')return{body:'xbot',suit:'#cfd0cb',suit2:p.suit?new THREE.Color(p.suit).lerp(new THREE.Color('#f2a33a'),.35).getStyle():'#f2a33a',eva:true};
    if(b==='xbot')return{body:'xbot',suit:p.suit?new THREE.Color(p.suit).lerp(new THREE.Color('#ffffff'),.55).getStyle():'#e6e9ee',suit2:'#f2a33a',glow:'#f2a33a'};
    return{body:b,tint:p.suit?new THREE.Color(p.suit).lerp(new THREE.Color('#ffffff'),.6).getStyle():null};},
  /* opts: {body, tint, suit (for xbot), helmet, scale, gun, glow, emissive} */
  create(o={}){
    if(!this.ready)return null;
    const body=this.bodies[o.body||'soldier']||this.bodies.soldier;
    const model=THREE.SkeletonUtils.clone(body.scene);model.rotation.y=-(body.yaw||0);const root=new THREE.Group();root.add(model);
    const sc=o.scale||1;model.scale.multiplyScalar(sc);
    const bones={};model.traverse(n=>{if(n.isBone){const k=n.name.replace(/^mixamorig:?/,'');bones[k]=n;}
      if(n.isMesh||n.isSkinnedMesh){n.castShadow=true;n.receiveShadow=true;n.frustumCulled=false;
        const m=n.material.clone();
        if((o.body==='xbot')&&(o.suit||o.glow)){m.map=null;const joints=/Joint/i.test(n.name)||/Joint/i.test(m.name);m.color=C(joints?(o.suit2||'#1c2026'):(o.suit||'#d8dce2'));m.roughness=joints?.5:.42;m.metalness=joints?.6:.15;
          if(o.glow){m.emissive=C(o.glow);m.emissiveIntensity=joints?2.4:.08;}}
        else if(o.tint){m.color=C(o.tint);}
        if(o.emissive){m.emissive=C(o.emissive);m.emissiveIntensity=.6;}
        m.envMapIntensity=1;n.material=m;}});
    const mixer=new THREE.AnimationMixer(model);const actions={};
    for(const n in body.clips){const a=mixer.clipAction(body.clips[n]);a.enabled=true;a.setEffectiveWeight(0);a.play();actions[n]=a;}
    if(actions.idle)actions.idle.setEffectiveWeight(1);
    // phase offsets so crowds don't march in step
    const ph=Math.random()*3;for(const n in actions)actions[n].time=ph%(actions[n].getClip().duration||1);
    const c={root,model,mixer,actions,bones,body:o.body||'soldier',h:body.hipH*sc/0.56,weights:{idle:1,walk:0,run:0},state:'loco',
      hand:bones.RightHand,torso:bones.Spine2||bones.Spine1,gun:null,helm:null,aimDir:new THREE.Vector3(0,0,1),look:null,
      armR:{hand:null},_tv:new THREE.Vector3(),_tq:new THREE.Quaternion(),
      pose:(dt,speed,air,aim,talk)=>Chars.pose(c,dt,speed,air,aim,talk)};
    c.armR.hand={add:(g)=>{c.gun=g;root.parent?root.parent.add(g):root.add(g);},remove:()=>{}};
    if(o.gun){c.gun=Gen.gunMesh(o.gun);root.add(c.gun);}
    // pressure helmet for bare-headed bodies (the armoured and synthetic bodies are already sealed)
    if(o.helmet&&((o.body||'soldier')==='michelle'||o.eva)&&bones.Head){model.updateMatrixWorld(true);const hp=bones.Head.getWorldPosition(new THREE.Vector3());const top=bones.HeadTop_End?bones.HeadTop_End.getWorldPosition(new THREE.Vector3()):hp.clone().add(new THREE.Vector3(0,.2*sc,0));
      const len=top.distanceTo(hp);const h=this.makeHelmet(len*(o.eva?.62:.8)+.04);h.position.copy(hp).lerp(top,.42);root.add(h);root.updateMatrixWorld(true);bones.Head.attach(h);c.helm=h;}
    return c;
  },
  setState(c,s){c.state=s;},
  pose(c,dt,speed,air,aim,talk){
    const A=c.actions;let w={idle:0,walk:0,run:0,sneak:0,sit:0,agree:0,dance:0,stroll:0};
    if(c.state==='sit'&&A.sit)w.sit=1;
    else if(c.state==='dance'&&A.dance)w.dance=1;
    else if(talk&&A.agree&&speed<.2)w.agree=1;
    else{const s=speed;const kw=U.smooth(.15,1.6,s)*(1-U.smooth(3.2,5.2,s)),kr=U.smooth(3.2,5.2,s);w.walk=kw;w.run=kr;w.idle=1-Math.max(kw,kr);if(air){w.idle=0;w.walk=0;w.run=1;}}
    for(const n in c.weights)if(!(n in w))w[n]=0;
    for(const n in w){if(!A[n])continue;const cur=c.weights[n]??0;const nv=U.damp(cur,w[n],10,dt);c.weights[n]=nv;A[n].setEffectiveWeight(nv);}
    if(A.walk)A.walk.timeScale=U.clamp(speed/1.5,.6,1.8);if(A.run)A.run.timeScale=U.clamp(speed/5,.7,1.5);
    c.mixer.update(dt*(air?.35:1));
    c.root.updateMatrixWorld(true);
    // aim: point the right arm chain along the aim direction and bring the left hand to the weapon
    if(aim&&c.bones.RightArm&&c.bones.RightForeArm){
      const d=c.aimDir;this.pointChain(c.bones.RightArm,c.bones.RightForeArm,d);this.pointChain(c.bones.RightForeArm,c.bones.RightHand,d);
      if(c.bones.LeftArm&&c.bones.LeftForeArm){const hp=c.bones.RightHand.getWorldPosition(c._tv).clone().addScaledVector(d,.25);const la=c.bones.LeftArm.getWorldPosition(new THREE.Vector3());const dl=hp.sub(la).normalize();
        this.pointChain(c.bones.LeftArm,c.bones.LeftForeArm,dl);this.pointChain(c.bones.LeftForeArm,c.bones.LeftHand,dl);}
    }
    if(c.look&&c.bones.Head){const hp=c.bones.Head.getWorldPosition(c._tv);const d=c.look.clone().sub(hp).normalize();const fwd=new THREE.Vector3(0,0,1).applyQuaternion(c.root.getWorldQuaternion(c._tq));if(d.dot(fwd)>.2)this.turnHead(c.bones.Head,d,.6);}
    // weapon follows the hand
    if(c.gun&&c.bones.RightHand){const hp=c.bones.RightHand.getWorldPosition(c._tv);const par=c.gun.parent;if(par){par.updateMatrixWorld();const inv=new THREE.Matrix4().copy(par.matrixWorld).invert();
        const lp=hp.clone().applyMatrix4(inv);c.gun.position.copy(lp);
        const dir=aim?c.aimDir.clone():c.bones.RightHand.getWorldPosition(new THREE.Vector3()).sub(c.bones.RightForeArm.getWorldPosition(new THREE.Vector3())).normalize();
        const wq=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),dir);const pq=par.getWorldQuaternion(new THREE.Quaternion()).invert();c.gun.quaternion.copy(pq.multiply(wq));}}
  },
  /* rotate `bone` so the segment bone→child points along world direction d */
  pointChain(bone,child,d){
    const bp=bone.getWorldPosition(new THREE.Vector3()),cp=child.getWorldPosition(new THREE.Vector3());const cur=cp.sub(bp).normalize();
    const q=new THREE.Quaternion().setFromUnitVectors(cur,d);const bw=bone.getWorldQuaternion(new THREE.Quaternion());const nw=q.multiply(bw);
    const pw=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();bone.quaternion.copy(pw.multiply(nw));bone.updateMatrixWorld(true);
  },
  turnHead(head,d,k){const hw=head.getWorldQuaternion(new THREE.Quaternion());const fwd=new THREE.Vector3(0,0,1).applyQuaternion(hw);const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(fwd.x,0,fwd.z).normalize(),new THREE.Vector3(d.x,0,d.z).normalize());
    q.slerp(new THREE.Quaternion(),1-k);const nw=q.multiply(hw);const pw=head.parent.getWorldQuaternion(new THREE.Quaternion()).invert();head.quaternion.copy(pw.multiply(nw));},
  /* choose a body and look for a role */
  forRole(role,faction,rnd=Math.random){
    const fcol={concord:'#b8c4d8',frontier:'#9aa58a',syndicate:'#8a6a5a',oracle:'#d8d0f0',none:'#c8c0b0'}[faction]||null;
    if(role==='guard'||role==='marine')return{body:'soldier',tint:fcol||'#b8c4d8'};
    if(role==='raider')return{body:'soldier',tint:U.pick(rnd,['#6a5a4a','#5a4a44','#4a4a44','#7a6a5a'])};
    if(role==='android')return{body:'xbot',suit:'#eef0f6',suit2:'#2a2438',glow:'#a38cff'};
    if(role==='engineer')return{body:'xbot',suit:'#f4efe6',suit2:'#b88a3a',glow:'#f2a33a',scale:1.62};
    if(role==='tabib')return{body:'xbot',suit:'#f4f6f8',suit2:'#9fe8f4',glow:'#8fe8ff',scale:2.3};
    if(role==='orderly')return{body:'xbot',suit:'#cfd5da',suit2:'#4a5a64',glow:'#bfe8f0',scale:1.05};
    if(role==='suit')return{body:'xbot',suit:U.pick(rnd,['#e6e9ee','#d8dce2','#e8d8c0','#c8d4e0']),suit2:U.pick(rnd,['#f2a33a','#3a4658','#8a2a2a','#2a5a8a']),eva:true};
    const f=rnd()<.5;return f?{body:'michelle',tint:U.pick(rnd,['#ffffff','#e8e0ff','#fff0e0','#e0f0ff'])}:{body:'soldier',tint:U.pick(rnd,['#c8c0b0','#b0b8c8','#a8b0a0','#c0b0a0','#9aa0a8'])};
  },
};

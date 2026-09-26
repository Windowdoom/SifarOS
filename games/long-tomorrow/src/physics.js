/* ═══════════════════════════════════════════════════════════════════════
   PHYS · rigid bodies with cannon-es. The terrain becomes a heightfield,
   buildings become static boxes, props are dynamic. The player and
   vehicles are kinematic bodies so they shove things realistically.
   Everything is optional: without CANNON the older simple props run.
   ═══════════════════════════════════════════════════════════════════════ */
const Phys={
  world:null,bodies:[],kin:null,
  init(S,g){
    this.clear();if(!window.CANNON)return false;
    const w=this.world=new CANNON.World({gravity:new CANNON.Vec3(0,-g,0)});w.broadphase=new CANNON.SAPBroadphase(w);w.allowSleep=true;
    w.defaultContactMaterial.friction=.45;w.defaultContactMaterial.restitution=.18;
    // terrain heightfield (±160 m around the settlement, 2 m cells)
    const size=320,es=2,n=size/es+1;const data=[];
    for(let i=0;i<n;i++){const row=[];for(let j=0;j<n;j++)row.push(Math.max(-50,S.h(i*es-size/2,size/2-j*es)));data.push(row);}
    const hf=new CANNON.Body({mass:0});hf.addShape(new CANNON.Heightfield(data,{elementSize:es}));hf.quaternion.setFromEuler(-Math.PI/2,0,0);hf.position.set(-size/2,0,size/2);w.addBody(hf);
    // static colliders near the settlement
    for(const c of S.colliders){const cx=(c.x0+c.x1)/2,cz=(c.z0+c.z1)/2;if(Math.abs(cx)>170||Math.abs(cz)>170)continue;
      const b=new CANNON.Body({mass:0});b.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(.05,(c.x1-c.x0)/2),Math.max(.05,(c.y1-c.y0)/2),Math.max(.05,(c.z1-c.z0)/2))));
      b.position.set(cx,(c.y0+c.y1)/2,cz);w.addBody(b);}
    // kinematic proxy for the player / vehicle
    this.kin=new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC});this.kin.addShape(new CANNON.Sphere(.45),new CANNON.Vec3(0,.5,0));this.kin.addShape(new CANNON.Sphere(.4),new CANNON.Vec3(0,1.3,0));w.addBody(this.kin);
    this.kinCar=new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC});this.kinCar.addShape(new CANNON.Box(new CANNON.Vec3(1.4,1,2.6)));this.kinCar.position.set(0,-999,0);w.addBody(this.kinCar);
    return true;
  },
  clear(){this.world=null;this.bodies=[];this.kin=null;},
  add(mesh,shape,mass,opts={}){
    if(!this.world)return null;const b=new CANNON.Body({mass,linearDamping:.08,angularDamping:.25,allowSleep:true,sleepSpeedLimit:.15,sleepTimeLimit:1});
    b.addShape(shape);b.position.copy(mesh.position);b.quaternion.copy(mesh.quaternion);this.world.addBody(b);
    const o=Object.assign({mesh,body:b},opts);this.bodies.push(o);return o;
  },
  box(mesh,hx,hy,hz,mass,opts){return this.add(mesh,new CANNON.Box(new CANNON.Vec3(hx,hy,hz)),mass,opts);},
  cyl(mesh,r,h,mass,opts){const shape=new CANNON.Cylinder(r,r,h,12);return this.add(mesh,shape,mass,opts);},
  impulse(o,dir,force,at){if(!o||!o.body)return;o.body.wakeUp();const p=at?new CANNON.Vec3(at.x,at.y,at.z):o.body.position;o.body.applyImpulse(new CANNON.Vec3(dir.x*force,dir.y*force,dir.z*force),p);},
  blast(p,radius,force){for(const o of this.bodies){const b=o.body;const d=new THREE.Vector3(b.position.x-p.x,b.position.y-p.y,b.position.z-p.z);const L=d.length();if(L>radius)continue;d.normalize();d.y+=.6;
    b.wakeUp();b.applyImpulse(new CANNON.Vec3(d.x*force*(1-L/radius)*b.mass*.12,d.y*force*(1-L/radius)*b.mass*.12,d.z*force*(1-L/radius)*b.mass*.12),b.position);}},
  raycast(o,d,max){for(const x of this.bodies){const b=x.body;const c=new THREE.Vector3(b.position.x,b.position.y,b.position.z);const t=Surface.raySphere(o,d,c,x.r||.6);if(t>0&&t<max)return{o:x,t};}return null;},
  step(dt,playerPos,vehicle){
    if(!this.world)return;
    if(this.kin&&playerPos){const k=this.kin;const vx=(playerPos.x-k.position.x)/Math.max(dt,1e-3),vy=(playerPos.y-k.position.y)/Math.max(dt,1e-3),vz=(playerPos.z-k.position.z)/Math.max(dt,1e-3);
      if(Math.abs(vx)+Math.abs(vy)+Math.abs(vz)<200)k.velocity.set(vx,vy,vz);else{k.position.set(playerPos.x,playerPos.y,playerPos.z);k.velocity.set(0,0,0);}}
    if(this.kinCar){if(vehicle){const k=this.kinCar;const p=vehicle.pos;k.velocity.set((p.x-k.position.x)/Math.max(dt,1e-3),(p.y+1-k.position.y)/Math.max(dt,1e-3),(p.z-k.position.z)/Math.max(dt,1e-3));if(k.position.y<-900)k.position.set(p.x,p.y+1,p.z);k.quaternion.setFromEuler(0,vehicle.yaw,0);}else{this.kinCar.position.set(0,-999,0);this.kinCar.velocity.set(0,0,0);}}
    this.world.step(1/60,dt,3);
    for(const o of this.bodies){if(o.dead)continue;const b=o.body;o.mesh.position.set(b.position.x,b.position.y,b.position.z);o.mesh.quaternion.set(b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w);
      if(b.position.y<-200){b.position.set(b.position.x,Surface.h(b.position.x,b.position.z)+2,b.position.z);b.velocity.set(0,0,0);}}
  },
  remove(o){if(!o)return;o.dead=true;if(this.world&&o.body)this.world.removeBody(o.body);},
};

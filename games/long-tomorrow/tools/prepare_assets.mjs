// Asset pipeline: turns downloaded third-party files into web-ready assets under ../assets
// and writes assets/CREDITS.json (shown in-game under Credits).
// Usage: node tools/prepare_assets.mjs <candidateModelsDir> <candidateTexturesDir>
// Needs: @gltf-transform/core, /functions, /extensions, draco3dgltf, meshoptimizer, sharp.
import fs from 'fs';import path from 'path';import sharp from 'sharp';
import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,weld,simplify,textureCompress,resample,quantize,flatten,join,palette} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';import {MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';

const [,, CAND, TEX] = process.argv;
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets');
for (const d of ['models','textures','planets','hdri']) fs.mkdirSync(path.join(OUT,d),{recursive:true});
await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule(),'meshopt.decoder':MeshoptDecoder});

const SRC = {
  mixamo3: {author:'Adobe Mixamo (via the three.js examples)',license:'Mixamo terms: royalty-free use in games and projects',url:'https://www.mixamo.com'},
  mixamoB: {author:'Adobe Mixamo (via Babylon.js Assets)',license:'Mixamo terms: royalty-free use in games and projects',url:'https://www.mixamo.com'},
  nasa: {author:'NASA 3D Resources',license:'Public domain (no copyright); no NASA endorsement implied',url:'https://github.com/nasa/NASA-3D-Resources'},
  babylon: {author:'Babylon.js Assets',license:'CC BY 4.0',url:'https://github.com/BabylonJS/Assets'},
};
const MODELS = [
  {out:'soldier.glb', src:'soldier.glb', tex:1024, what:'Soldier (armoured human, idle/walk/run)', credit:SRC.mixamo3},
  {out:'michelle.glb', src:'michelle.glb', tex:512, what:'Michelle (civilian human)', credit:SRC.mixamo3},
  {out:'xbot.glb', src:'xbot.glb', tex:512, tris:26000, what:'X Bot (synthetic body, 7 animations)', credit:SRC.mixamo3},
  {out:'anim_walk.glb', src:'anim_Walking.glb', what:'Walking animation', credit:SRC.mixamoB},
  {out:'anim_sit.glb', src:'anim_Sitting_Clap.glb', what:'Sitting animation', credit:SRC.mixamoB},
  {out:'barrel.glb', src:'barrel.glb', tex:512, what:'Exploding barrel', credit:SRC.babylon},
  {out:'shark.glb', src:'bab_shark.glb', tex:1024, tris:14000, what:'Shark (animated)', credit:SRC.babylon},
  {out:'iondrive.glb', src:'iondrive.glb', static:true, tris:18000, error:.2, what:'Primary Ion Drive', credit:{author:'Mike Murdock (via the three.js examples)',license:'CC BY 4.0',url:'https://blog.sketchfab.com/art-spotlight-primary-ion-drive/'}},
  {out:'rover_sev.glb', src:'nasa_Space_Exploration_Vehicle.glb', static:true, tris:16000, error:.2, tex:1024, what:'Space Exploration Vehicle', credit:SRC.nasa},
  {out:'spacesuit_z2.glb', src:'nasa_Z2_Spacesuit.glb', static:true, tris:9000, tex:1024, what:'Z-2 spacesuit', credit:SRC.nasa},
  {out:'lunar_module.glb', src:'nasa_Apollo_Lunar_Module.glb', static:true, tris:14000, tex:512, what:'Apollo Lunar Module', credit:SRC.nasa},
  {out:'dsn_dish.glb', src:'nasa_Deep_Space_Network_70-meter.glb', static:true, tris:9000, error:.08, tex:512, what:'Deep Space Network 70 m antenna', credit:SRC.nasa},
  {out:'perseverance.glb', src:'nasa_Mars_2020_Perseverance_Rover.glb', static:true, tris:16000, tex:512, what:'Mars 2020 Perseverance rover', credit:SRC.nasa},
];
const TEXTURES = [
  // [out, src, size, credit, note]
  ['textures/rocky_color.jpg','b_rockyGround_basecolor.png',1024,SRC.babylon,'Rocky ground'],
  ['textures/rocky_normal.jpg','b_rockyGround_normal.png',1024,SRC.babylon,'Rocky ground normal'],
  ['textures/rock_color.jpg','b_rock.png',512,SRC.babylon,'Rock'],
  ['textures/rock_normal.jpg','b_rockn.png',512,SRC.babylon,'Rock normal'],
  ['textures/grass_color.jpg','b_grass.png',1024,SRC.babylon,'Grass'],
  ['textures/grass_normal.jpg','b_grassn.png',256,SRC.babylon,'Grass normal'],
  ['textures/sand_color.jpg','b_sand.jpg',1024,SRC.babylon,'Sand'],
  ['textures/cracked_color.jpg','b_ground.jpg',512,SRC.babylon,'Cracked ground'],
  ['textures/dirt_color.jpg','b_dirt.jpg',1024,SRC.babylon,'Dirt'],
  ['textures/pavers_color.jpg','b_floor.png',512,SRC.babylon,'Stone pavers'],
  ['textures/pavers_normal.jpg','b_floorn.png',512,SRC.babylon,'Stone pavers normal'],
  ['textures/lava_color.jpg','b_lavatile.jpg',512,SRC.babylon,'Lava'],
  ['textures/ice_color.jpg','t_Ice002_1K-JPG_Color.jpg',1024,{author:'ambientCG (via the three.js examples)',license:'CC0 1.0',url:'https://ambientcg.com/view?id=Ice002'},'Ice'],
  ['textures/ice_normal.jpg','t_Ice002_1K-JPG_NormalGL.jpg',1024,{author:'ambientCG (via the three.js examples)',license:'CC0 1.0',url:'https://ambientcg.com/view?id=Ice002'},'Ice normal'],
  ['planets/earth_day.jpg','s_earth_day.jpg',2048,{author:'Solar System Scope (based on NASA imagery), via the three.js examples',license:'CC BY 4.0',url:'https://www.solarsystemscope.com/textures/'},'Earth day map'],
  ['planets/earth_night.jpg','s_earth_night.jpg',2048,{author:'Solar System Scope (based on NASA imagery), via the three.js examples',license:'CC BY 4.0',url:'https://www.solarsystemscope.com/textures/'},'Earth night lights'],
  ['planets/earth_clouds.jpg','s_earth_brc.jpg',2048,{author:'Solar System Scope (based on NASA imagery), via the three.js examples',license:'CC BY 4.0',url:'https://www.solarsystemscope.com/textures/'},'Earth bump/roughness/clouds'],
  ['planets/mars.jpg','n_Mars.jpg',1440,SRC.nasa,'Mars'],
  ['planets/jupiter.jpg','n_Jupiter.jpg',720,SRC.nasa,'Jupiter'],
  ['planets/saturn.jpg','n_Saturn.jpg',720,SRC.nasa,'Saturn'],
  ['planets/titan.jpg','n_Saturn_-_Titan.jpg',720,SRC.nasa,'Titan'],
  ['planets/europa.jpg','n_Jupiter_-_Europa.jpg',1440,SRC.nasa,'Europa'],
  ['planets/venus.jpg','n_Venus.jpg',1440,SRC.nasa,'Venus'],
  ['planets/neptune.jpg','n_Neptune.jpg',720,SRC.nasa,'Neptune'],
  ['planets/io.jpg','n_Jupiter_-_Io_A.jpg',1440,SRC.nasa,'Io'],
  ['planets/ganymede.jpg','n_Jupiter_-_Ganymede.jpg',1440,SRC.nasa,'Ganymede'],
  ['planets/enceladus.jpg','n_Saturn_-_Enceladus.jpg',1440,SRC.nasa,'Enceladus'],
  ['planets/pluto.jpg','n_Pluto.jpg',720,SRC.nasa,'Pluto'],
  ['planets/starmap.jpg','n_Yale_Bright_Star_Map.jpg',2880,SRC.nasa,'Yale Bright Star Map (the real sky from Sol)'],
];
const HDRI = [
  ['hdri/city.hdr','h_potsdamer_platz_1k.hdr','Potsdamer Platz'],
  ['hdri/interior.hdr','h_empty_warehouse_01_1k.hdr','Empty Warehouse 01'],
];
const credits = [];
const kb = f => Math.round(fs.statSync(f).size/1024);

for (const m of MODELS) {
  const src = path.join(CAND, m.src), dst = path.join(OUT, 'models', m.out);
  const doc = await io.read(src);
  for (const e of doc.getRoot().listExtensionsUsed()) if (['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(e.extensionName)) e.dispose();
  // static props: merge flat-coloured materials into a palette and join parts into as few draw calls as possible
  const ops = [dedup(), prune()];
  if (m.static) {
    for (const a of doc.getRoot().listAnimations()) { a.listChannels().forEach(c => c.dispose()); a.listSamplers().forEach(x => x.dispose()); a.dispose(); }   // animated nodes cannot be flattened or joined
    if (m.bare) for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives())   // the game re-materials it: keep only positions
      for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
    // join() only merges siblings under a common node, so gather every flattened mesh under one root
    const gather = (d) => { const sc = d.getRoot().listScenes()[0]; const root = d.createNode('merged');
      for (const n of [...sc.listChildren()]) { sc.removeChild(n); root.addChild(n); } sc.addChild(root); };
    ops.push(palette({min:2}), flatten(), gather, join({keepNamed:false}), prune());
  }
  if (m.tris) {
    let t = 0; for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives()) { const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
    if (t > m.tris) ops.push(weld(), simplify({simplifier:MeshoptSimplifier, ratio:m.tris / t, error:m.error || .03}));
  }
  ops.push(resample());
  if (m.tex) ops.push(textureCompress({encoder:sharp, targetFormat:'webp', resize:[m.tex,m.tex], quality:82}));
  ops.push(quantize());
  await doc.transform(...ops);
  await io.write(dst, doc);
  credits.push({file:'models/'+m.out, what:m.what, ...m.credit});
  let tris = 0, prims = 0; for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives()) { prims++; const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  console.log('model', m.out, kb(dst)+' KB', Math.round(tris)+' tris', prims+' draws', doc.getRoot().listMaterials().length+' materials');
}
for (const [out, src, size, credit, what] of TEXTURES) {
  const dst = path.join(OUT, out);
  await sharp(path.join(TEX, src)).resize({width:size, height:size, fit:'inside', withoutEnlargement:true}).jpeg({quality:84, mozjpeg:true}).toFile(dst);
  credits.push({file:out, what, ...credit});
  console.log('tex', out, kb(dst)+' KB');
}
for (const [out, src, name] of HDRI) {
  fs.copyFileSync(path.join(TEX, src), path.join(OUT, out));
  credits.push({file:out, what:name+' HDRI', author:'Poly Haven (HDRI Haven), via pmndrs/drei-assets', license:'CC0 1.0', url:'https://polyhaven.com'});
}
fs.writeFileSync(path.join(OUT, 'CREDITS.json'), JSON.stringify(credits, null, 1));
let total = 0; const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else total += fs.statSync(p).size; } }; walk(OUT);
console.log('TOTAL', Math.round(total/1048576*10)/10, 'MB');

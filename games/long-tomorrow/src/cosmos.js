/* ═══════════════════════════════════════════════════════════════════════
   COSMOS · the mapped universe
   Three layers:
   1. Authored systems (data.js SYSTEMS) where the story happens.
   2. A real catalogue: named stars, exoplanet hosts, nebulae, clusters,
      black holes and pulsars at their measured galactic coordinates.
   3. A deterministic procedural galaxy: every 40-ly sector of every galaxy
      is seeded, and star density follows a real structural model
      (exponential disk, vertical scale height, bulge, logarithmic spiral
      arms). The Milky Way alone addresses billions of systems; nothing is
      stored until you visit it.
   Galactocentric frame: x toward Sol→centre axis, Sol at (−26,670, 0, +55) ly.
   ═══════════════════════════════════════════════════════════════════════ */

const R0=26670, SOL_Z=55, SECTOR=40;

/* ── Galaxies. l/b/d are the direction and distance from Sol (d in ly). ── */
const GALAXIES={
  mw:{name:'Milky Way',type:'spiral',l:0,b:0,d:0,radius:52850,rd:8500,h:1000,arms:4,pitch:12,bulge:3200,density:1,
    note:'Our galaxy: a barred spiral 105,700 ly across with 100 to 400 billion stars. Sol sits in the Orion Spur, 26,670 ly from the centre.'},
  sagdeg:{name:'Sagittarius Dwarf',type:'dwarf',l:5.6,b:-14.2,d:70000,radius:5000,rd:1800,h:1500,density:.25,gate:'deepgates',
    note:'A dwarf spheroidal galaxy being torn apart by the Milky Way. Its stars stream around our galaxy in a ring.'},
  lmc:{name:'Large Magellanic Cloud',type:'irregular',l:280.5,b:-32.9,d:160000,radius:7000,rd:2600,h:900,density:.55,gate:'gate_lmc',gateSystem:'lmc',
    note:'The Milky Way\'s largest satellite galaxy. Home of the Tarantula Nebula and R136a1, the most massive star known.'},
  smc:{name:'Small Magellanic Cloud',type:'irregular',l:302.8,b:-44.3,d:200000,radius:3500,rd:1500,h:900,density:.4,gate:'deepgates',
    note:'The LMC\'s smaller sibling, trailing a bridge of gas pulled out by tides.'},
  ngc6822:{name:'Barnard\'s Galaxy',type:'irregular',l:25.3,b:-18.4,d:1600000,radius:3500,rd:1400,h:800,density:.35,gate:'deepgates',
    note:'A barred irregular galaxy in the Local Group, found by E. E. Barnard in 1884.'},
  ic1613:{name:'IC 1613',type:'irregular',l:129.7,b:-60.6,d:2380000,radius:5000,rd:2000,h:900,density:.3,gate:'deepgates',
    note:'A faint dwarf irregular with almost no dust. Its stars have barely been disturbed since the galaxy formed.'},
  m32:{name:'Messier 32',type:'elliptical',l:121.15,b:-21.98,d:2490000,radius:3250,rd:900,h:900,density:.8,gate:'deepgates',
    note:'A compact elliptical galaxy orbiting Andromeda, possibly the stripped core of a larger one.'},
  m31:{name:'Andromeda',type:'spiral',l:121.2,b:-21.6,d:2537000,radius:110000,rd:17000,h:1400,arms:2,pitch:9,bulge:5000,density:.9,gate:'gate_m31',gateSystem:'m31',
    note:'The nearest large galaxy, about a trillion stars. It is falling toward the Milky Way at 110 km/s and will merge with it in about 4.5 billion years.'},
  m33:{name:'Triangulum',type:'spiral',l:133.6,b:-31.3,d:2730000,radius:30000,rd:6000,h:900,arms:2,pitch:18,bulge:1200,density:.6,gate:'deepgates',
    note:'The third-largest Local Group galaxy. A flocculent spiral with the giant star-forming region NGC 604.'},
  ngc253:{name:'Sculptor Galaxy',type:'spiral',l:97.4,b:-88,d:11400000,radius:45000,rd:9000,h:1200,arms:2,pitch:14,bulge:3000,density:1.1,gate:'deepgates',
    note:'A dusty starburst spiral forming stars at several times the Milky Way\'s rate.'},
  m82:{name:'Cigar Galaxy',type:'irregular',l:141.4,b:40.6,d:11400000,radius:20000,rd:4000,h:2500,density:1.4,gate:'deepgates',
    note:'A starburst galaxy blowing superheated winds out of its core after a close pass by M81.'},
  m81:{name:'Bode\'s Galaxy',type:'spiral',l:142.1,b:40.9,d:11800000,radius:45000,rd:9000,h:1200,arms:2,pitch:13,bulge:4000,density:1,gate:'deepgates',
    note:'A grand-design spiral with a 70-million-solar-mass black hole.'},
  cena:{name:'Centaurus A',type:'elliptical',l:309.5,b:19.4,d:12000000,radius:30000,rd:8000,h:6000,density:1.1,gate:'deepgates',
    note:'A giant elliptical cut by a dust lane, firing relativistic jets a million light-years long from a 55-million-solar-mass black hole.'},
  m51:{name:'Whirlpool',type:'spiral',l:104.9,b:68.6,d:23000000,radius:38000,rd:7500,h:1000,arms:2,pitch:20,bulge:2500,density:1,gate:'deepgates',
    note:'The textbook grand-design spiral, tugged into shape by its companion NGC 5195.'},
  m104:{name:'Sombrero',type:'spiral',l:298.5,b:51.1,d:31100000,radius:25000,rd:6000,h:2400,arms:1,pitch:4,bulge:9000,density:1.2,gate:'deepgates',
    note:'A huge bright bulge ringed by a dark dust lane; its central black hole has about a billion solar masses.'},
  m87:{name:'Messier 87',type:'elliptical',l:283.8,b:74.5,d:53500000,radius:60000,rd:14000,h:14000,density:1.5,gate:'deepgates',
    note:'A supergiant elliptical at the heart of the Virgo Cluster. Its black hole, M87*, was the first ever imaged (EHT, 2019): 6.5 billion solar masses.'},
  greatattr:{name:'Norma Cluster',type:'elliptical',l:325.3,b:-7.3,d:220000000,radius:40000,rd:10000,h:10000,density:1.3,gate:'deepgates',
    note:'The heart of the Great Attractor, the gravitational focus that the Local Group and everything around it is flowing toward.'},
  hoag:{name:'Hoag\'s Object',type:'ring',l:17.6,b:46.5,d:612000000,radius:60000,rd:12000,h:1000,density:.8,gate:'deepgates',
    note:'A near-perfect ring of blue stars around a yellow core. Nobody is sure how it formed. The Engineers were.'},
  bootes:{name:'The Boötes Void',type:'void',l:35,b:65,d:700000000,radius:30000,rd:9000,h:3000,density:.15,gate:'deepgates',
    note:'A region 330 million light-years across with almost no galaxies. The sixty known inside it are the loneliest in the universe. Something lives there.'},
  ic1101:{name:'IC 1101',type:'elliptical',l:6,b:52,d:1040000000,radius:250000,rd:50000,h:50000,density:1.2,gate:'deepgates',
    note:'One of the largest galaxies known, at the centre of the cluster Abell 2029. Its core is strangely diffuse, as if something emptied it.'},
};

/* ── The real catalogue: [id, name, class, dist ly, l, b, kind, note] ── */
const CATALOG=[
  // nearest stars and famous neighbours (also in data.js REAL_STARS, merged below)
  ['luhman16','Luhman 16','L7.5+T0.5',6.5,285.0,1.4,'bd','The closest brown dwarfs to Sol, with weather bands of iron rain.'],
  ['wise0855','WISE 0855−0714','Y4',7.4,230.0,31.0,'bd','The coldest known brown dwarf, colder than the North Pole. Water-ice clouds.'],
  ['scholz','Scholz\'s Star','M9.5+T5',22.0,196.0,-11.0,'star','Passed through the Oort cloud 70,000 years ago, when humans were watching the sky.'],
  ['gliese710','Gliese 710','K7V',62.0,20.0,3.0,'star','Will pass within 0.2 ly of Sol in 1.3 million years and shake the Oort cloud loose.'],
  ['arcturus','Arcturus','K1.5III',36.7,15.1,69.1,'star','An old orange giant from the galactic halo, the brightest star in the northern sky.'],
  ['pollux','Pollux','K0III',33.8,192.2,23.4,'star','An orange giant with a giant planet, Thestias.'],
  ['capella','Capella','G3III',42.9,162.6,4.6,'star','Two yellow giants orbiting each other every 104 days.'],
  ['aldebaran','Aldebaran','K5III',65.3,181.0,-20.2,'star','The red eye of Taurus. Pioneer 10 will pass it in about two million years.'],
  ['regulus','Regulus','B8IV',79.3,226.4,48.9,'star','Spins so fast it is close to flying apart.'],
  ['hd189733','HD 189733','K1.5V',64.5,60.96,-3.9,'star','Its blue hot Jupiter rains molten glass sideways in 8,700 km/h winds.'],
  ['peg51','51 Pegasi','G2IV',50.6,90.1,-34.7,'star','Helvetios: the first exoplanet found around a Sun-like star (1995).'],
  ['gj1214','GJ 1214','M4.5V',48.0,20.4,19.4,'star','A steamy sub-Neptune wrapped in haze.'],
  ['betapic','Beta Pictoris','A6V',63.4,258.4,-30.6,'star','A young star with a debris disk and two directly imaged giants.'],
  ['k218','K2-18','M2.5V',124.0,236.0,51.0,'star','A possible hycean world. A 2025 claim of dimethyl sulfide in its air is disputed.'],
  ['toi700','TOI-700','M2V',101.4,275.0,-30.0,'star','A quiet red dwarf with Earth-sized TOI-700 d in the habitable zone.'],
  ['hr8799','HR 8799','A5V',133.0,90.0,-40.0,'star','Four directly imaged super-Jupiters on wide orbits.'],
  ['hd209458','HD 209458','G0V',157.0,76.8,-28.5,'star','Osiris: a hot Jupiter trailing a comet-like tail of evaporating hydrogen.'],
  ['kepler16','Kepler-16','K+M',245.0,79.0,11.0,'star','A planet with two suns, like Tatooine.'],
  ['kepler186','Kepler-186','M1V',580.0,73.0,12.0,'star','Kepler-186f was the first Earth-sized world found in a habitable zone (2014).'],
  ['kepler22','Kepler-22','G5V',640.0,76.0,16.0,'star','Kepler-22b, a possible ocean world 2.4 times Earth\'s radius.'],
  ['kepler442','Kepler-442','K1V',1206.0,72.0,10.0,'star','Kepler-442b is one of the best habitability candidates found by Kepler.'],
  ['wasp12','WASP-12','G0V',1410.0,178.0,10.0,'star','Its hot Jupiter is spiralling in and being eaten by its star.'],
  ['tabby','Tabby\'s Star','F3V',1470.0,84.0,6.0,'star','KIC 8462852. Dips of up to 22% in brightness, with no pattern. Dust, say the papers. Something else, says the Sifar signal.'],
  ['psr1257','PSR B1257+12','Pulsar',2300.0,311.3,75.4,'pulsar','The first confirmed exoplanets (1992) orbit this dead star.'],
  // bright & giant stars
  ['sirius2','Canopus','A9II',310.0,261.2,-25.3,'star','The second-brightest star in the night sky; spacecraft have used it to navigate.'],
  ['spica','Spica','B1V',250.0,316.1,50.8,'star','A close pair of hot blue stars squeezed into egg shapes.'],
  ['polaris','Polaris','F7Ib',433.0,123.3,26.5,'star','The North Star: a pulsing Cepheid supergiant in a triple system.'],
  ['betelgeuse','Betelgeuse','M1Ia',548.0,199.8,-9.0,'star','A red supergiant 760 times the Sun\'s radius. The Great Dimming of 2019 came from a stellar burp of dust. It will go supernova.'],
  ['antares','Antares','M1.5Iab',550.0,351.9,15.1,'star','The heart of Scorpius. Put it where the Sun is and it would swallow Mars.'],
  ['rigel','Rigel','B8Ia',860.0,209.2,-25.2,'star','A blue supergiant about 120,000 times as luminous as the Sun.'],
  ['deneb','Deneb','A2Ia',2600.0,84.3,2.0,'star','One of the most luminous stars visible to the naked eye.'],
  ['vycma','VY Canis Majoris','M5eIa',3900.0,239.4,-5.1,'star','A hypergiant shedding its outer layers in vast arcs.'],
  ['uyscuti','UY Scuti','M4Ia',5900.0,27.0,-0.3,'star','For years the largest known star by radius.'],
  ['etacar','Eta Carinae','LBV',7500.0,287.6,-0.6,'star','A violent binary. In 1843 its Great Eruption made it the second-brightest star in the sky.'],
  ['mira','Mira','M7IIIe',300.0,167.8,-57.9,'star','A pulsing giant with a 13-light-year tail, like a comet.'],
  // nebulae & clusters
  ['pleiades','Pleiades (M45)','B-cluster',444.0,166.6,-23.5,'cluster','The Seven Sisters: a young cluster drifting through a dust cloud.'],
  ['hyades','Hyades','cluster',153.0,180.0,-22.0,'cluster','The nearest open cluster to Sol.'],
  ['helix','Helix Nebula','WD',650.0,36.2,-57.1,'nebula','The Eye of God: the shed shell of a dying Sun-like star. Sol will look like this in five billion years.'],
  ['orion','Orion Nebula (M42)','nebula',1344.0,209.0,-19.4,'nebula','The nearest large stellar nursery. Protoplanetary disks, the Trapezium stars and new worlds being born.'],
  ['ring','Ring Nebula (M57)','WD',2300.0,63.2,13.97,'nebula','A planetary nebula around a white dwarf 200 times the Sun\'s luminosity.'],
  ['eagle','Pillars of Creation (M16)','nebula',5700.0,17.0,.8,'nebula','Columns of gas and dust, light-years tall, being eaten away by starlight.'],
  ['crab','Crab Nebula','Pulsar',6500.0,184.6,-5.8,'pulsar','The remains of the supernova seen in 1054, with a neutron star spinning 30 times a second.'],
  ['m13','Great Globular Cluster (M13)','cluster',22200.0,59.0,40.9,'cluster','Target of the 1974 Arecibo message. It will arrive in 25,000 years. The Engineers already replied.'],
  ['omegacen','Omega Centauri','cluster',17090.0,309.1,15.0,'cluster','Ten million stars, probably the core of a galaxy the Milky Way ate. There is an intermediate-mass black hole at its centre.'],
  ['tuc47','47 Tucanae','cluster',14700.0,305.9,-44.9,'cluster','An ancient globular cluster packed with millisecond pulsars.'],
  // compact objects
  ['cygx1','Cygnus X-1','BH',7200.0,71.3,3.1,'bh','The first widely accepted black hole: 21 solar masses feeding on a blue supergiant.'],
  ['gaiabh1','Gaia BH1','BH',1560.0,22.6,19.3,'bh','The nearest known black hole: a dormant 10-solar-mass hole with a Sun-like companion.'],
  ['sgr1806','SGR 1806−20','Magnetar',42000.0,10.0,-.2,'pulsar','A magnetar. Its 2004 flare briefly outshone the full Moon in gamma rays from across the galaxy.'],
  ['v404','V404 Cygni','BH',7800.0,73.1,-2.1,'bh','A black hole in a triple system that flares violently every few decades.'],
];

/* ── Name generator: syllable grammar seeded per civilization/world ── */
const SYL={a:['ka','ve','tho','rin','sa','qel','mor','ith','da','zu','an','el','or','ys','tar','vhe','nu','ash','ko','li','ra','sen','ul','ze','xa','om','pri','ta','gha','ir'],
  b:['n','r','sh','th','l','s','x','k','m','v','','','',''],e:['i','a','ari','ene','un','oth','esh','ix','ae','ul']};
function genName(r,syl=2){let s='';for(let i=0;i<syl;i++)s+=U.pick(r,SYL.a)+(i<syl-1&&r()<.3?"'":'');s+=U.pick(r,SYL.b);return s.charAt(0).toUpperCase()+s.slice(1);}

const ETHOS=[
  {id:'collective',name:'Collective',desc:'Individual minds merged into a single will.',attitude:.2,style:'hive'},
  {id:'mercantile',name:'Mercantile',desc:'Everything has a price, including an alliance.',attitude:.5,style:'bazaar'},
  {id:'theocratic',name:'Devotional',desc:'They believe the Engineers were gods, and that gods can be disappointed.',attitude:0,style:'temple'},
  {id:'machine',name:'Machine',desc:'Post-biological. They uploaded, or they were built.',attitude:-.1,style:'machine'},
  {id:'hegemony',name:'Hegemonic',desc:'Expansionist. They see every other species as a future province.',attitude:-.5,style:'fortress'},
  {id:'pacifist',name:'Contemplative',desc:'They renounced weapons after a war nobody else remembers.',attitude:.6,style:'garden'},
  {id:'predatory',name:'Predatory',desc:'Raiders and slavers. The reason some systems have no one left.',attitude:-.9,style:'camp'},
  {id:'scholar',name:'Archivist',desc:'They collect civilizations the way you collect stamps.',attitude:.3,style:'library'},
];
const BODYPLANS=['humanoid','tall','squat','quadruped','floater','insectoid','serpentine','crystalline'];

const Cosmos={
  secCache:new Map(),sysCache:new Map(),siteCache:new Map(),civCache:new Map(),

  helio(l,b,d){const L=l*Math.PI/180,B=b*Math.PI/180;return[d*Math.cos(B)*Math.cos(L),d*Math.cos(B)*Math.sin(L),d*Math.sin(B)];},
  // heliocentric (x toward GC) → galactocentric (Sol at −R0)
  gc(l,b,d){const h=this.helio(l,b,d);return[h[0]-R0,h[1],h[2]+SOL_Z];},

  init(){
    // Authored systems: attach galaxy + galactocentric position
    for(const id in SYSTEMS){const s=SYSTEMS[id];if(s.procedural)continue;s.id=id;
      if(id==='lmc'){s.galaxy='lmc';s.pos=[400,-300,20];}
      else if(id==='m31'){s.galaxy='m31';s.pos=[-31000,8000,120];}
      else{s.galaxy='mw';s.pos=this.gc(s.gal.l,s.gal.b,s.gal.d);}
    }
    // Real stars from data.js + catalogue
    const all=REAL_STARS.map(a=>[a[0],a[1],a[2],a[3],a[4],a[5],'star',a[6]]).concat(CATALOG);
    for(const [id,name,cls,d,l,b,kind,note] of all){
      if(SYSTEMS[id])continue;
      SYSTEMS[id]={id,name,catalog:true,kind,note,cls,galaxy:'mw',pos:this.gc(l,b,d),gal:{l,b,d},seed:U.hash(id),
        purpose:note};
    }
  },

  /* ── Structural density model: expected notable systems per 40-ly sector ── */
  density(galId,x,y,z){
    const g=GALAXIES[galId];const R=Math.hypot(x,y);if(R>g.radius*1.1)return 0;
    let disk=Math.exp(-R/g.rd)*Math.exp(-Math.abs(z)/g.h);
    if(g.type==='spiral'&&g.arms){
      const th=Math.atan2(y,x);const k=1/Math.tan(g.pitch*Math.PI/180);
      const ph=g.arms*(th-Math.log(Math.max(R,500)/4000)*k);
      disk*=.45+1.35*Math.pow(.5+.5*Math.cos(ph),3);
    }
    if(g.type==='ring'){const rr=Math.abs(R-g.radius*.65)/(g.radius*.08);disk=Math.exp(-rr*rr)*Math.exp(-Math.abs(z)/g.h)+Math.exp(-Math.hypot(R,z)/(g.radius*.08));}
    if(g.type==='elliptical'||g.type==='dwarf'){disk=Math.exp(-Math.hypot(x,y,z)/g.rd);}
    if(g.type==='void'){disk=Math.exp(-Math.hypot(x,y,z)/g.rd)*.4;}
    let bulge=g.bulge?Math.exp(-Math.hypot(x,y,z*1.6)/g.bulge)*1.4:0;
    // normalized so the solar neighbourhood yields ~5 notable systems per sector
    return (disk+bulge)*g.density*5/Math.exp(-R0/8500);
  },

  sector(galId,i,j,k){
    const key=galId+':'+i+':'+j+':'+k;let s=this.secCache.get(key);if(s)return s;
    const cx=(i+.5)*SECTOR,cy=(j+.5)*SECTOR,cz=(k+.5)*SECTOR;
    let n=this.density(galId,cx,cy,cz);
    // the solar neighbourhood is fully catalogued: no invented stars within 60 ly of Sol, fewer out to 250 ly
    if(galId==='mw'){const ds=Math.hypot(cx+R0,cy,cz-SOL_Z);if(ds<60)n=0;else if(ds<250)n*=.35;}
    const r=U.rng(U.hash(key));let count=Math.floor(n)+(r()<n%1?1:0);count=Math.min(count,40);
    s=[];
    for(let q=0;q<count;q++){
      const pos=[(i+r())*SECTOR,(j+r())*SECTOR,(k+r())*SECTOR];
      const cls=this.rollClass(r);
      const id=`P.${galId}.${i}.${j}.${k}.${q}`;
      s.push({id,cls,pos,galaxy:galId,seed:U.hash(id),name:this.procName(galId,i,j,k,q,r)});
    }
    if(this.secCache.size>6000)this.secCache.clear();
    this.secCache.set(key,s);return s;
  },
  rollClass(r){return U.weighted(r,[{c:'M',w:62},{c:'K',w:13},{c:'G',w:8},{c:'F',w:4},{c:'A',w:1.6},{c:'B',w:.35},{c:'O',w:.05},{c:'WD',w:5},{c:'BD',w:4},{c:'BH',w:.25},{c:'NS',w:.35},{c:'RG',w:1.2}]).c;},
  procName(galId,i,j,k,q,r){
    const pre={mw:'SIF',lmc:'LMC',smc:'SMC',m31:'AND',m33:'TRI',sagdeg:'SGR'}[galId]||galId.toUpperCase().slice(0,3);
    if(r()<.12)return genName(r,2)+(r()<.5?' '+U.pick(r,['Prime','Reach','Deep','Crossing','Rest','Hollow','Verge']):'');
    return `${pre} ${((i*73856093^j*19349663^k*83492791)>>>0)%9000+1000}-${String(q).padStart(2,'0')}`;
  },
  sectorsNear(galId,p,radius){
    const out=[];const r=Math.ceil(radius/SECTOR);const i0=Math.floor(p[0]/SECTOR),j0=Math.floor(p[1]/SECTOR),k0=Math.floor(p[2]/SECTOR);
    const kr=Math.min(r,Math.ceil(2500/SECTOR));
    for(let i=i0-r;i<=i0+r;i++)for(let j=j0-r;j<=j0+r;j++)for(let k=k0-kr;k<=k0+kr;k++){
      for(const st of this.sector(galId,i,j,k)){const d=Math.hypot(st.pos[0]-p[0],st.pos[1]-p[1],st.pos[2]-p[2]);if(d<=radius)out.push(st);}
    }
    return out;
  },
  /* all systems (authored, catalogue, procedural) within radius of p in a galaxy */
  near(galId,p,radius){
    const out=[];
    for(const id in SYSTEMS){const s=SYSTEMS[id];if(!s.pos||s.galaxy!==galId)continue;const d=Math.hypot(s.pos[0]-p[0],s.pos[1]-p[1],s.pos[2]-p[2]);if(d<=radius)out.push({id,name:s.name,pos:s.pos,cls:s.star?s.star.cls:s.cls,authored:!s.catalog&&!s.procedural,catalog:!!s.catalog,kind:s.kind,galaxy:galId});}
    if(radius<=400)for(const st of this.sectorsNear(galId,p,radius))out.push(st);
    return out;
  },

  /* ── Resolve any system id to a full, playable system ── */
  get(id){
    if(this.sysCache.has(id))return this.sysCache.get(id);
    let sys;
    if(SYSTEMS[id]&&SYSTEMS[id].bodies){sys=SYSTEMS[id];}
    else if(SYSTEMS[id]&&SYSTEMS[id].catalog){sys=this.generate({id,name:SYSTEMS[id].name,cls:SYSTEMS[id].cls,pos:SYSTEMS[id].pos,galaxy:'mw',seed:SYSTEMS[id].seed,kind:SYSTEMS[id].kind,note:SYSTEMS[id].note});}
    else if(id.startsWith('P.')){const [,g,i,j,k,q]=id.split('.');const st=this.sector(g,+i,+j,+k)[+q];if(!st)return null;sys=this.generate(st);}
    else if(id.startsWith('GATE.')){sys=this.gateSystem(id.slice(5));}
    else return null;
    sys.id=id;this.sysCache.set(id,sys);return sys;
  },
  pos(id){const s=SYSTEMS[id];if(s&&s.pos)return{g:s.galaxy||'mw',p:s.pos};if(id.startsWith('P.')){const [,g,i,j,k,q]=id.split('.');const st=this.sector(g,+i,+j,+k)[+q];return st?{g,p:st.pos}:null;}
    if(id.startsWith('GATE.')){const g=id.slice(5);return{g,p:[0,0,0]};}return null;},
  dist(a,b){const A=this.pos(a),B=this.pos(b);if(!A||!B)return Infinity;if(A.g!==B.g)return Infinity;return Math.hypot(A.p[0]-B.p[0],A.p[1]-B.p[1],A.p[2]-B.p[2]);},
  distFromSol(id){const A=this.pos(id);if(!A)return 0;if(A.g!=='mw')return GALAXIES[A.g].d;return Math.hypot(A.p[0]+R0,A.p[1],A.p[2]-SOL_Z);},
  galaxyOf(id){const A=this.pos(id);return A?A.g:'mw';},

  /* ── Civilizations: seeded per galaxy. Each claims a sphere of space. ── */
  civs(galId){
    if(this.civCache.has(galId))return this.civCache.get(galId);
    const g=GALAXIES[galId];const r=U.rng(U.hash('civ:'+galId));
    const n=galId==='mw'?16:g.type==='void'?1:Math.max(3,Math.round(Math.log10(g.radius)*2.2));
    const list=[];
    for(let i=0;i<n;i++){
      const ang=r()*Math.PI*2,rad=Math.sqrt(r())*g.radius*.85;let c=[Math.cos(ang)*rad,Math.sin(ang)*rad,(r()-.5)*g.h];
      if(galId==='mw'){const ds=Math.hypot(c[0]+R0,c[1],c[2]);if(ds<900){c[0]-=1200;}}
      const ethos=U.pick(r,ETHOS);const name=genName(r,r()<.5?2:3);
      const hue=r();
      list.push({id:galId+'-civ'+i,galaxy:galId,name,plural:name+(name.endsWith('i')?'':U.pick(r,['i','ari','en','ith','ans'])),
        adj:name+U.pick(r,['ic','an','ese','i']),ethos,tier:1+Math.floor(r()*5),center:c,radius:600+r()*(galId==='mw'?3400:g.radius*.08),
        attitude:U.clamp(ethos.attitude+(r()-.5)*.6,-1,1),body:{plan:U.pick(r,BODYPLANS),h:1.2+r()*1.9,hue,sat:.3+r()*.6,glow:r()<.4,limbs:r()<.25?4:2,eyes:1+Math.floor(r()*4)},
        color:'#'+new THREE.Color().setHSL(hue,.55,.62).getHexString(),
        sells:U.pick(r,[['pearl','luxury'],['relic','electronics'],['archive','meds'],['iridium','platinum'],['electronics','machinery']]),
        wants:U.pick(r,['meds','food','machinery','electronics','he3']),
        homeworld:genName(r,2),founded:Math.floor(2+r()*900)*1000,
      });
    }
    this.civCache.set(galId,list);return list;
  },
  civAt(galId,p,r){for(const c of this.civs(galId)){const d=Math.hypot(p[0]-c.center[0],p[1]-c.center[1],p[2]-c.center[2]);if(d<c.radius&&r()<.75*(1-d/c.radius)+.1)return c;}return null;},
  civById(id){const g=id.split('-civ')[0];return this.civs(g).find(c=>c.id===id);},

  /* ── Procedural system generator ── */
  generate(st){
    const r=U.rng(st.seed);const cls=st.cls||'M';const letter=/^(BD|WD|BH|NS|RG|LBV|Pulsar|Magnetar)/.test(cls)?cls.match(/^(BD|WD|BH|NS|RG|LBV|Pulsar|Magnetar)/)[1]:cls[0];
    const kindMap={Pulsar:'NS',Magnetar:'NS',LBV:'B',L:'BD',T:'BD',Y:'BD'};const L2=kindMap[letter]||letter;
    const colorOf={O:'#9bb0ff',B:'#aabfff',A:'#cad7ff',F:'#f8f7ff',G:'#fff4ea',K:'#ffd2a1',M:'#ffb07a',WD:'#e6edff',BD:'#c8583a',BH:'#000',NS:'#d8e8ff',RG:'#ff9a5a'};
    const Rs={O:10,B:5,A:1.8,F:1.3,G:1,K:.75,M:.3,WD:.012,BD:.1,BH:0,NS:0,RG:40}[L2]||.5;
    const star={cls,color:colorOf[L2]||'#fff',R:Rs,blackhole:L2==='BH',pulsar:L2==='NS',giant:L2==='RG'||/I/.test(cls)};
    const dSol=this.distFromSol(st.id)||(st.galaxy==='mw'?Math.hypot(st.pos[0]+R0,st.pos[1],st.pos[2]):GALAXIES[st.galaxy].d);
    const civ=this.civAt(st.galaxy,st.pos,r);
    let control=null;
    if(st.galaxy==='mw'&&dSol<180){control=U.weighted(r,[{c:'frontier',w:dSol<60?4:2},{c:'concord',w:dSol<40?3:.5},{c:'syndicate',w:1.2},{c:null,w:3}]).c;}
    if(civ)control='civ:'+civ.id;
    const bodies=[];const nb={O:2,B:2,A:4,F:6,G:7,K:6,M:5,WD:2,BD:3,BH:2,NS:2,RG:3}[L2]||3;const count=Math.floor(r()*nb)+(L2==='BH'?0:1);
    const letters='bcdefghij';let orbit=1800+r()*900;
    const hz=Math.sqrt({O:1e5,B:1e3,A:20,F:3,G:1,K:.35,M:.02,WD:.001,BD:.0005,BH:0,NS:0,RG:500}[L2]||.1);
    for(let n=0;n<count;n++){
      const au=hz*Math.pow(1.8,n-count*.4)*(0.6+r()*.5);const temp=hz?au/hz:10;
      let type;
      if(star.pulsar)type=r()<.7?'barren':'iron';
      else if(star.blackhole)type=r()<.5?'barren':'crystal';
      else if(temp<.45)type=U.pick(r,['lava','lava','iron','glass']);
      else if(temp<.8)type=U.pick(r,['desert','toxic','desert','glass','lava']);
      else if(temp<1.35)type=U.weighted(r,[{c:'ocean',w:2},{c:'jungle',w:2},{c:'tundra',w:2},{c:'desert',w:2},{c:'fungal',w:1},{c:'crystal',w:.6},{c:'toxic',w:1}]).c;
      else if(temp<2.6)type=U.pick(r,['tundra','ice','barren','gas','crystal']);
      else type=U.pick(r,['gas','gas','ice','ice','barren']);
      const gas=type==='gas';const rad=gas?420+r()*520:50+r()*170;
      const b={id:'b'+n,name:st.name+' '+letters[n],type:gas?'gas':'proc',biome:type,r:rad,orbit,ang:r()*Math.PI*2,
        pal:this.biomePalette(type,r),atmo:['ocean','jungle','toxic','tundra','fungal','desert'].includes(type)?this.biomePalette(type,r)[1]:null,
        rings:gas&&r()<.35,scoop:gas?'he3':null,temp:Math.round(255/Math.sqrt(Math.max(temp,.05))-30)};
      if(!gas)b.site=st.id+'~'+b.id;
      bodies.push(b);orbit+=1500+r()*2600+(gas?1500:0);
    }
    if(r()<.55)bodies.push({id:'belt',name:st.name+' belt',type:'belt',orbit:orbit+1200,width:900+r()*1600,ores:this.beltOres(r,dSol,st.galaxy),density:.6+r()*.8,hostile:r()<.15});
    // stations and notable features
    const feats=[];
    if(control&&control.startsWith('civ:')&&r()<.8)feats.push('civstation');
    else if(control==='frontier'&&r()<.6)feats.push('outpost');
    else if(control==='syndicate'&&r()<.7)feats.push('den');
    else if(control==='concord'&&r()<.6)feats.push('listening');
    if(r()<.035)feats.push('derelict');
    if(r()<.012||st.id==='tabby')feats.push('dyson');
    if(r()<.02||(st.kind==='cluster'&&r()<.5))feats.push('vault');
    if(r()<.05)feats.push('anomaly');
    if(st.kind==='nebula')feats.push('nebula');
    const stationOrbit=bodies.length?bodies[Math.floor(r()*bodies.length)].orbit:3000;
    if(feats.some(f=>['civstation','outpost','den','listening'].includes(f))){
      const kind=feats.find(f=>['civstation','outpost','den','listening'].includes(f));
      const sid=st.id+'~st';const sname=kind==='civstation'?civ.name+' '+U.pick(r,['Spire','Haven','Concourse','Waypoint']):kind==='outpost'?st.name+' Outpost':kind==='den'?U.pick(r,['The Rat\'s Nest','Coldharbor','Last Call','The Pit','Dead Man\'s Dock']):st.name+' Listening Post';
      STATIONS[sid]={name:sname,faction:kind==='civstation'?'civ:'+civ.id:kind==='outpost'?'frontier':kind==='den'?'syndicate':'concord',
        services:kind==='den'?['market','outfitter','jobs','repair','bar','black']:kind==='civstation'?['market','jobs','repair']:['market','jobs','repair','outfitter'],
        desc:kind==='civstation'?`A ${civ.adj} waystation. ${civ.ethos.desc}`:kind==='den'?'A pirate den. Everything is for sale, especially you.':kind==='outpost'?'A Frontier claim with a fuel depot and a noticeboard.':'A Concord listening post watching the dark.',civ:civ?civ.id:null};
      bodies.push({id:'st',name:sname,type:'station',orbit:stationOrbit,ang:r()*6.28,dock:sid,big:kind==='civstation',engineer:false});
    }
    if(feats.includes('derelict'))bodies.push({id:'wreck',name:U.pick(r,['Generation ship Aniara','Hope of Lagos','Seedship Tamarind','Unknown hull','Long Walk II','Mayflower Deep']),type:'wreck',orbit:orbit*.7,ang:r()*6.28,site:st.id+'~wreck'});
    if(feats.includes('dyson'))bodies.push({id:'dyson',name:'Dyson swarm',type:'dyson',orbit:900,ang:0});
    if(feats.includes('vault'))bodies.push({id:'vault',name:'Engineer vault',type:'vaultbody',r:70,orbit:orbit*.5,ang:r()*6.28,pal:['#1e1c1a','#f2a33a'],site:st.id+'~vault'});
    if(feats.includes('anomaly'))bodies.push({id:'anom',name:'Unidentified signal',type:'anomaly',orbit:orbit*.6,ang:r()*6.28});
    const economy=control==='syndicate'?'pirate':control&&control.startsWith('civ:')?'alien':feats.includes('vault')?'relic':control==='frontier'?'mining':'frontier';
    const desc=[];
    if(st.note)desc.push(st.note);
    desc.push(`${bodies.filter(b=>b.type==='proc'||b.type==='gas').length} planets${bodies.some(b=>b.type==='belt')?', a debris belt':''}.`);
    if(civ)desc.push(`Claimed by the ${civ.plural} (${civ.ethos.name}).`);
    if(feats.includes('dyson'))desc.push('Something is harvesting this star\'s light.');
    if(feats.includes('vault'))desc.push('Engineer structure detected.');
    return {id:st.id,name:st.name,galaxy:st.galaxy,pos:st.pos,star,bodies,control,civ:civ?civ.id:null,security:control==='concord'?.8:control==='frontier'?.45:control==='syndicate'?.1:civ?.5:.15,economy,generated:true,kind:st.kind,
      purpose:desc.join(' '),feats};
  },
  beltOres(r,dSol,gal){const o=['iron','ice','titanium'];if(r()<.6)o.push('platinum');if(r()<.4||dSol>200)o.push('iridium');if(gal!=='mw'&&r()<.3||r()<.02)o.push('sifarite');if(r()<.3)o.push('he3');return o;},
  biomePalette(t,r){
    const P={lava:[['#2a1a16','#ff5a1a'],['#1a1414','#ff7a2a']],iron:[['#5a4a44','#8a6a5a'],['#4a3e3a','#a07a62']],glass:[['#2a3a5a','#9ab8e8'],['#1a2a44','#6a9ad8']],
      desert:[['#c89a5a','#e8c890'],['#b87a4a','#d8a870'],['#d8b890','#f0dcb8']],toxic:[['#8a9a3a','#c8d860'],['#6a7a4a','#b8c870']],
      ocean:[['#1a4a7a','#3a8ac0'],['#12507a','#40a0b0']],jungle:[['#2a5a2a','#5a8a3a'],['#3a4a8a','#6a5ab0'],['#6a2a4a','#b05a7a']],
      tundra:[['#8a9a9a','#c8d8d0'],['#7a8a7a','#b8c8b0']],fungal:[['#5a3a6a','#b07ad0'],['#6a4a3a','#e0a060']],crystal:[['#3a5a7a','#8ae0ff'],['#5a3a7a','#d08aff']],
      ice:[['#c8d8e8','#f0f8ff'],['#a8c0d8','#e0ecf8']],barren:[['#6a6560','#8a857e'],['#5a524a','#7a7068']],gas:[['#d9b48a','#a86f46'],['#8aa2c8','#4a6088'],['#c8a0d8','#6a4a88'],['#a8d8c8','#4a8878']]};
    return U.pick(r,P[t]||P.barren);
  },

  gateSystem(galId){
    const g=GALAXIES[galId];
    return {id:'GATE.'+galId,name:g.name+' Gate',galaxy:galId,pos:[0,0,0],star:{cls:'G2V',color:'#fff4ea',R:1},control:'engineers',security:.6,economy:'relic',
      purpose:g.note+' The Engineer gate anchors here.',
      bodies:[{id:'gate',name:'Engineer Gate',type:'gate',r:300,orbit:6000,ang:0,flag:g.gate},{id:'st',name:g.name+' Lighthouse',type:'station',orbit:6000,ang:.4,dock:'GATE.'+galId+'~st',big:true,engineer:true},
        {id:'belt',name:'Relic field',type:'belt',orbit:9000,width:1800,ores:['iridium','platinum','sifarite'],density:1,hostile:true}]};
  },

  /* ── Surface site resolution (authored or generated) ── */
  site(id){
    if(SITES[id])return SITES[id];
    if(this.siteCache.has(id))return this.siteCache.get(id);
    const [sysId,bodyId]=id.split('~');const sys=this.get(sysId);if(!sys)return null;const body=sys.bodies.find(b=>b.id===bodyId);if(!body)return null;
    const r=U.rng(U.hash(id));const civ=sys.civ?this.civById(sys.civ):null;
    let site;
    if(bodyId==='wreck')site=this.biomeSite('barren',r,{name:body.name,style:'derelict',body:body.name});
    else if(bodyId==='vault')site=this.biomeSite('barren',r,{name:'Engineer Vault',style:'vault',body:sys.name});
    else{
      let style='wild';
      if(civ&&r()<.6)style='alien';
      else if(sys.control==='frontier'&&r()<.5)style='outpost';
      else if(sys.control==='syndicate'&&r()<.5)style='camp';
      else if(r()<.12)style='ruins';
      else if(r()<.1)style='crash';
      site=this.biomeSite(body.biome,r,{name:style==='alien'?civ.homeworld+' '+U.pick(r,['Enclave','Colony','Reach','Terrace']):style==='outpost'?body.name+' Claim':style==='camp'?U.pick(r,['Scav Camp','Raider Hold','Chop Shop']):style==='ruins'?'Ancient ruins':style==='crash'?'Crash site':'Wilderness',style,body:body.name,civ:civ?civ.id:null});
    }
    site.system=sysId;site.id=id;site.generated=true;
    if(site.style==='outpost')site.faction='frontier';else if(site.style==='camp')site.faction='syndicate';else if(site.style==='alien')site.faction='civ:'+civ.id;else site.faction='none';
    this.siteCache.set(id,site);return site;
  },
  biomeSite(biome,r,o){
    const B={
      lava:{g:[.8,1.6],air:false,temp:'410 °C',atm:'Thin, sulfurous',sky:['#1a0a06','#8a2a10','#4a1a10',.004],ground:['#2a1a16','#3a2420','#ff5a1a','#1a1212'],amp:[30,60],props:'mesas',enemies:['crawler'],ores:['iron','titanium','iridium'],sea:{level:-4,color:'#ff4a10',lava:true},amb:[.1,200]},
      iron:{g:[.9,1.8],air:false,temp:'210 °C',atm:'Trace',sky:['#20140e','#8a5a3a','#5a3a2a',.003],ground:['#5a4a44','#7a5a4a','#a07a62','#3a2e2a'],amp:[20,50],props:'boulders',enemies:['rogueDrone'],ores:['iron','titanium','platinum'],amb:[.05,300]},
      glass:{g:[.9,1.5],air:false,temp:'1,000 °C day side',atm:'Silicate winds',sky:['#0a1a3a','#4a7ad8','#2a4a8a',.004],ground:['#2a3a5a','#4a6a9a','#9ab8e8','#1a2a44'],amp:[20,40],props:'iceSpikes',enemies:['crawler'],ores:['platinum','iridium'],amb:[.2,900]},
      desert:{g:[.5,1.4],air:false,temp:'48 °C',atm:'Thin CO₂',sky:['#6a8ab0','#e8c8a0','#d8b890',.003],ground:['#b87a4a','#c89a5a','#e8c890','#8a5a3a'],amp:[30,70],props:'mesas',enemies:['crawler','raider'],ores:['iron','titanium'],amb:[.1,320]},
      toxic:{g:[.7,1.3],air:false,temp:'62 °C',atm:'Chlorine-laced',sky:['#3a4a1a','#b8c860','#8a9a4a',.006],ground:['#5a6a3a','#8a9a3a','#c8d860','#3a4a2a'],amp:[20,40],props:'fungus',enemies:['stinger','crawler'],ores:['titanium','platinum'],sea:{level:-4,color:'#6a7a2a'},amb:[.1,400]},
      ocean:{g:[.7,1.2],air:true,temp:'19 °C',atm:'N₂/O₂, breathable',sky:['#2a6ab0','#bcdcef','#a8c8e0',.0028],ground:['#c8b890','#8a9a6a','#5a7a4a','#6a6050'],amp:[26,40],props:'trees',enemies:['stinger'],ores:['ice','titanium'],sea:{level:-3,color:'#1a5a8a'},amb:[.08,600]},
      jungle:{g:[.8,1.3],air:true,temp:'31 °C',atm:'Dense N₂/O₂, breathable',sky:['#3a7ac0','#d8e8c0','#9ab89a',.004],ground:['#2a5a2a','#3a6a2a','#6a7a4a','#2a3a22'],amp:[30,60],props:'trees',enemies:['stinger','crawler'],ores:['titanium'],sea:{level:-6,color:'#2a5a4a'},amb:[.08,700]},
      tundra:{g:[.7,1.2],air:false,temp:'−35 °C',atm:'Thin N₂',sky:['#5a7a9a','#d8e0e8','#b8c8d4',.003],ground:['#7a8a7a','#9aa89a','#e0e8e8','#5a6a5a'],amp:[26,50],props:'lichen',enemies:['crawler'],ores:['ice','iron'],amb:[.14,280]},
      fungal:{g:[.6,1.1],air:false,temp:'24 °C',atm:'Spore-laden, unbreathable',sky:['#3a2a4a','#c8a0c8','#6a4a6a',.006],ground:['#4a3a4a','#6a4a6a','#b07ad0','#2a1a2a'],amp:[20,45],props:'fungus',enemies:['stinger','crawler'],ores:['titanium','platinum'],amb:[.06,500]},
      crystal:{g:[.6,1.4],air:false,temp:'−80 °C',atm:'Trace neon',sky:['#0a1020','#5a8ab0','#1a2a44',.003],ground:['#2a3a5a','#3a5a7a','#8ae0ff','#1a2a3a'],amp:[30,55],props:'crystals',enemies:['sentinel'],ores:['platinum','iridium'],amb:[.05,800]},
      ice:{g:[.2,1],air:false,temp:'−190 °C',atm:'None',sky:['#000','#0a0c14','#0a0c14',.0008],ground:['#a8c0d8','#c8d8e8','#f0f8ff','#8aa0b8'],amp:[20,40],props:'iceSpikes',enemies:['rogueDrone'],ores:['ice','he3'],amb:[0,0]},
      barren:{g:[.1,.9],air:false,temp:'−120 °C',atm:'Vacuum',sky:['#000','#07080c','#08090d',.0007],ground:['#5a524a','#6a6560','#8a857e','#3a3632'],amp:[25,50],props:'boulders',enemies:['rogueDrone'],ores:['iron','titanium','platinum'],amb:[0,0],craters:true},
    };
    const b=B[biome]||B.barren;const g=+(b.g[0]+r()*(b.g[1]-b.g[0])).toFixed(2);
    const vac=b.sky[0]==='#000';
    const site={name:o.name,body:o.body,g,breathable:b.air,day:r()<.4?0:Math.round(10+r()*60),style:o.style,civ:o.civ,pop:o.style==='alien'?U.fmt(Math.round(r()*900+50))+' thousand':o.style==='outpost'?U.fmt(Math.round(r()*900+80)):'—',
      temp:b.temp,atm:b.atm,biome,purpose:({wild:'Uncharted wilderness. Ore, fauna, and whatever the survey missed.',outpost:'A Frontier claim. Fuel, a noticeboard, and people who ask where you are from.',camp:'Raiders dug in here. Clear them out for the bounty, or deal with them.',alien:'A settlement of another species. Tread carefully.',ruins:'Ruins older than your species. Relics sell for fortunes.',crash:'Wreckage scattered across the surface. Salvage and survivors, maybe.',derelict:'A dead ship. Somebody launched it with hope.',vault:'An Engineer vault. The door has been waiting for you.'})[o.style]||'',
      sky:{zen:b.sky[0],hor:b.sky[1],fog:b.sky[2],fogD:b.sky[3],sunCol:'#fff4e0',sunSize:.5+r()*2,sunEl:.1+r()*.6,stars:vac?1:.2,haze:vac?0:.6},
      ground:b.ground,terrain:{amp:b.amp[0]+r()*(b.amp[1]-b.amp[0]),scale:.003+r()*.003,oct:5,flat:o.style==='wild'?80:170,ridge:r()*.6,craters:b.craters?Math.floor(r()*24):0},
      sea:b.sea,props:b.props,services:o.style==='outpost'?['market','jobs','clinic']:o.style==='alien'?['market']:o.style==='camp'?['black']:[],
      enemies:o.style==='camp'?['raider','raider']:o.style==='vault'?['construct']:o.style==='ruins'?['sentinel']:b.enemies,ores:o.style==='vault'?['sifarite','iridium']:b.ores,
      amb:{wind:b.amb[0],windFreq:b.amb[1],drone:[40+r()*30,60+r()*40],vol:.14},seed:Math.floor(r()*1e9)};
    return site;
  },
  station(id){if(STATIONS[id])return STATIONS[id];
    if(id.startsWith('GATE.')&&id.endsWith('~st')){const g=id.slice(5,-3);STATIONS[id]={name:GALAXIES[g].name+' Lighthouse',faction:'engineers',services:['crafting','repair','jobs','market'],desc:'An Engineer lighthouse at the gate. Its fabricators still answer.'};return STATIONS[id];}
    const sysId=id.split('~')[0];this.get(sysId);return STATIONS[id]||null;},
  countEstimate(){return '≈ 4.1 billion addressable systems in the Milky Way model; 19 galaxies charted.';},
};

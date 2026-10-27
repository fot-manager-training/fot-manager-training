import * as THREE from 'three';
// Cyber fox supplied by the user in fox (1).html; the editor UI is intentionally omitted.
export function createFox(){
const live=true;
const mat=(c,r=.72)=>new THREE.MeshStandardMaterial({color:c,roughness:r});const orange=mat('#df9850'),cream=mat('#f4f6ee'),brown=mat('#101310'),pink=mat('#d7b393'),blush=mat('#d6a478');const dark=new THREE.MeshPhysicalMaterial({color:'#101310',roughness:.19,clearcoat:1,clearcoatRoughness:.12});const white=mat('#f4f6ee',.25);const amber=new THREE.MeshPhysicalMaterial({color:'#91622f',roughness:.27,clearcoat:1});
const fox=new THREE.Group();const rig={},manual={},base={};
function joint(id,label,parent,pos){let g=new THREE.Group();g.position.set(...pos);g.userData.part=id;g.name=label;parent.add(g);rig[id]=g;manual[id]=[0,0,0];return g;}
const sphere=new THREE.SphereGeometry(1,40,28);
function ell(parent,x,y,z,sx,sy,sz,m){let o=new THREE.Mesh(sphere,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function curve(parent,pts,r,m){let c=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)));let o=new THREE.Mesh(new THREE.TubeGeometry(c,32,r,8,false),m);parent.add(o);return o;}
const body=joint('body','Корпус',fox,[0,1.15,0]);ell(body,0,0,0,.73,1.07,.58,orange);
const belly=joint('belly','Животик',body,[0,-.03,.45]);ell(belly,0,0,0,.45,.71,.17,cream);
for(const s of [-1,1]){let side=s<0?'L':'R',name=s<0?'слева':'справа';let back=joint('back'+side,'Задняя лапка '+name,body,[s*.49,-.55,-.13]);ell(back,s*.07,-.04,0,.41,.52,.43,orange);let foot=joint('hindFoot'+side,'Задняя стопа '+name,back,[s*.09,-.38,.20]);ell(foot,0,0,.03,.29,.19,.33,brown);
let arm=joint('arm'+side,'Передняя лапка '+name,body,[s*.40,.26,.35]);ell(arm,0,-.5,.01,.235,.62,.235,orange);let paw=joint('paw'+side,'Кисть '+name,arm,[0,-1.05,.11]);ell(paw,0,0,0,.255,.205,.30,brown);for(let i=-1;i<=1;i++)ell(paw,i*.125,-.045,.19,.082,.12,.105,brown);}
const bib=joint('bib','Грудка',body,[0,.65,.43]);ell(bib,0,0,0,.47,.49,.23,cream);for(let i=-1;i<=1;i++){let g=joint('fluff'+i,'Прядка грудки '+(i+2),bib,[i*.21,-.29,.07]);ell(g,0,-.06,0,.14,.25-Math.abs(i)*.035,.12,cream);g.rotation.z=-i*.23;}
// Original furry tail; the smooth wag and deformation also run on the home screen.
const tail=joint('tail','Хвост',body,[-.43,-.66,-.28]);const tailGeo=new THREE.BufferGeometry(),tn=64,ts=24,tPos=[],tCols=[],tIdx=[];const oc=new THREE.Color('#df9850'),cc=new THREE.Color('#f4f6ee');
for(let i=0;i<=tn;i++){let t=i/tn;for(let j=0;j<=ts;j++){tPos.push(0,0,0);let boundary=.70+.025*Math.sin(j/ts*Math.PI*10);let c=t>boundary?cc:oc;tCols.push(c.r,c.g,c.b);if(i<tn&&j<ts){let a=i*(ts+1)+j,b=a+ts+1;tIdx.push(a,a+1,b,b,a+1,b+1);}}}tailGeo.setAttribute('position',new THREE.Float32BufferAttribute(tPos,3));tailGeo.setAttribute('color',new THREE.Float32BufferAttribute(tCols,3));tailGeo.setIndex(tIdx);const tailMesh=new THREE.Mesh(tailGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,side:THREE.DoubleSide}));tailMesh.name='fox-tail-surface';tailMesh.castShadow=true;tailMesh.receiveShadow=true;tailMesh.frustumCulled=false;tail.add(tailMesh);const tailTip=joint('tailTip','Кончик хвоста',tail,[-1.68,.13,.3]);
function deformTail(t){let p=tailGeo.attributes.position;const k=manual.tailTip[1]+(live?Math.sin(t*1.55)*.14:0);for(let i=0;i<=tn;i++){let u=i/tn,r=.44*Math.pow(Math.sin(Math.PI*u),.64)+.003,x=-1.85*u,y=.05+.12*Math.sin(Math.PI*u)+Math.sin(u*2)*k*.35+u*u*manual.tailTip[2]*.65+u*u*Math.sin(t*1.55)*.10,z=.42*u+Math.sin(u*Math.PI)*.1+u*u*k+u*u*manual.tailTip[0]*.45;for(let j=0;j<=ts;j++){let a=j/ts*Math.PI*2;p.setXYZ(i*(ts+1)+j,x,y+Math.sin(a)*r,z+Math.cos(a)*r*.85);}}p.needsUpdate=true;tailGeo.computeVertexNormals();tailTip.position.set(-1.85,.05+Math.sin(2)*k*.35,.42+k);}
const neck=joint('neck','Шея',body,[0,.94,0]);ell(neck,0,0,0,.39,.38,.37,orange);
orange.roughness=.50;cream.roughness=.38;cream.metalness=.22;brown.metalness=.65;brown.roughness=.32;
const head=joint('head','Голова',neck,[0,.54,.10]);
let hg=new THREE.SphereGeometry(1,64,40),cols=[];let hp=hg.attributes.position;for(let i=0;i<hp.count;i++){let x=hp.getX(i),y=hp.getY(i);let boundary=-.34+.12*Math.pow(Math.abs(x),1.5)+.11*Math.exp(-x*x*35);let blend=THREE.MathUtils.smoothstep(boundary-y,-.012,.018);let c=oc.clone().lerp(cc,blend);cols.push(c.r,c.g,c.b);}hg.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));let hm=new THREE.Mesh(hg,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78}));hm.scale.set(1.19,.97,.85);hm.castShadow=true;hm.receiveShadow=true;head.add(hm);
function ear(s){let g=joint(s<0?'earL':'earR',s<0?'Левое ушко':'Правое ушко',head,[s*.81,.65,-.08]);let sh=new THREE.Shape();sh.moveTo(-.33,-.12);sh.bezierCurveTo(-.40,.15,-.35,.91,-.22,.98);sh.bezierCurveTo(-.07,1.04,.43,.32,.38,-.08);sh.quadraticCurveTo(0,-.30,-.33,-.12);let geo=new THREE.ExtrudeGeometry(sh,{depth:.12,bevelEnabled:true,bevelSize:.065,bevelThickness:.075,bevelSegments:5,curveSegments:24});function layer(m,sc,z){let o=new THREE.Mesh(geo,m);o.scale.set(sc,sc,sc);o.position.set(0,0,z);o.castShadow=true;g.add(o);return o;}layer(brown,1,0);layer(orange,.9,.065);let inner=layer(pink,.65,.19);inner.position.y=.10;g.rotation.z=-s*.20;return g;}ear(-1);ear(1);
for(let s of [-1,1]){let side=s<0?'L':'R';let cheek=joint('cheek'+side,s<0?'Левая щёчка':'Правая щёчка',head,[s*.83,-.39,.12]);ell(cheek,0,0,0,.34,.225,.36,cream);let tuft=ell(cheek,s*.23,.055,-.06,.24,.095,.17,cream);tuft.rotation.z=s*.20;ell(cheek,s*.18,-.095,-.04,.21,.10,.17,cream);
// Big, soft eyes with a fine warm iris, dark pupil and two catchlights.
let eye=joint('eye'+side,s<0?'Левый глаз':'Правый глаз',head,[s*.51,.045,.738]);eye.scale.set(.78,.78,.88);ell(eye,0,0,0,.295,.345,.135,brown);ell(eye,0,0,.033,.275,.325,.126,amber);let pupil=joint('pupil'+side,s<0?'Левый зрачок':'Правый зрачок',eye,[0,.026,.103]);ell(pupil,0,0,0,.237,.276,.085,dark);ell(pupil,-.074,.115,.075,.073,.075,.016,white);ell(pupil,.066,-.065,.083,.028,.029,.011,white);
let brow=joint('brow'+side,s<0?'Левая бровка':'Правая бровка',head,[s*.49,.49,.70]);let b=ell(brow,0,0,0,.18,.047,.065,cream);b.rotation.z=-s*.16;
ell(head,s*.80,-.19,.668,.12,.057,.012,blush);}
const muzzle=joint('muzzle','Мордочка',head,[0,-.39,.78]);ell(muzzle,-.17,-.025,0,.31,.185,.20,cream);ell(muzzle,.17,-.025,0,.31,.185,.20,cream);
const jaw=joint('jaw','Нижняя челюсть',head,[0,-.51,.69]);ell(jaw,0,-.075,.045,.34,.145,.18,cream);
const nose=joint('nose','Носик',muzzle,[0,.105,.185]);let sh=new THREE.Shape();sh.moveTo(-.14,.03);sh.bezierCurveTo(-.17,.115,.17,.115,.14,.03);sh.bezierCurveTo(.11,-.04,.04,-.10,0,-.10);sh.bezierCurveTo(-.04,-.10,-.11,-.04,-.14,.03);let noseMesh=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:.02,bevelEnabled:true,bevelSize:.028,bevelThickness:.028,bevelSegments:5,curveSegments:20}),dark);nose.add(noseMesh);
curve(muzzle,[[0,-.015,.203],[0,-.09,.204],[-.10,-.13,.193],[-.21,-.10,.173]],.009,brown);curve(muzzle,[[0,-.09,.204],[.10,-.13,.193],[.21,-.10,.173]],.009,brown);
for(let s of [-1,1]){let g=joint('whiskers'+(s<0?'L':'R'),s<0?'Левые усики':'Правые усики',muzzle,[s*.23,-.045,.13]);for(let i=0;i<2;i++)curve(g,[[0,0,0],[s*.12,.025-i*.055,.01],[s*.24,.055-i*.10,-.025]],.004,cream);}
// Equipment inherits the same articulated joints as the character.
const metal=new THREE.MeshStandardMaterial({color:'#101310',metalness:.72,roughness:.32});
const trim=new THREE.MeshStandardMaterial({color:'#343c32',metalness:.8,roughness:.32});
const neon=(c,i=2)=>new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:i,roughness:.3,metalness:.25});
const lime=neon('#c8f53a',2.2),green=neon('#21a038',2),dimGreen=neon('#718b33',.8);
function rounded(w,h,d,r,m,parent,x=0,y=0,z=0){let sh=new THREE.Shape(),a=-w/2,b=-h/2;sh.moveTo(a+r,b);sh.lineTo(a+w-r,b);sh.quadraticCurveTo(a+w,b,a+w,b+r);sh.lineTo(a+w,b+h-r);sh.quadraticCurveTo(a+w,b+h,a+w-r,b+h);sh.lineTo(a+r,b+h);sh.quadraticCurveTo(a,b+h,a,b+h-r);sh.lineTo(a,b+r);sh.quadraticCurveTo(a,b,a+r,b);let o=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:d,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:3,curveSegments:16}),m);o.position.set(x,y,z-d/2);o.castShadow=true;parent.add(o);return o;}
function ring(parent,r,t,m,x,y,z,rx=0,ry=0){let o=new THREE.Mesh(new THREE.TorusGeometry(r,t,10,80),m);o.position.set(x,y,z);o.rotation.set(rx,ry,0);parent.add(o);return o;}
const headset=joint('headset','VR-шлем',head,[0,.04,.88]);
// A padded enclosure, wraparound strap, and top strap, rather than flat glasses.
rounded(2.03,.82,.39,.20,metal,headset,0,0,.17);
rounded(1.91,.70,.10,.16,trim,headset,0,0,.41);
rounded(1.80,.60,.065,.14,lime,headset,0,0,.48);
const glass=new THREE.MeshPhysicalMaterial({color:'#0a140d',metalness:.72,roughness:.16,clearcoat:1});
rounded(1.75,.55,.07,.12,glass,headset,0,0,.527);
curve(head,[[-1.02,.06,.87],[-1.20,.09,.30],[-.90,.13,-.69],[0,.14,-.89],[.90,.13,-.69],[1.20,.09,.30],[1.02,.06,.87]],.095,metal);
curve(head,[[0,.39,1.0],[0,.88,.46],[0,.99,-.14],[0,.78,-.61],[0,.14,-.87]],.065,metal);
curve(head,[[0,.45,.97],[0,.92,.40],[0,1.005,-.16],[0,.79,-.63]],.012,green);
for(let s of [-1,1]){rounded(.16,.43,.28,.055,trim,headset,s*1.01,0,.16);rounded(.045,.29,.04,.014,s<0?green:lime,headset,s*1.09,0,.32);ell(headset,s*.79,.235,.585,.033,.033,.016,metal);ell(headset,s*.79,.235,.601,.014,.014,.009,lime);}
// The visor has animated scan lines and two friendly luminous eye glyphs.
let scan=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float uTime;void main(){float line=pow(max(0.,sin(vUv.y*170.+uTime*1.8)),18.)*.10;float sweep=exp(-pow((vUv.x-fract(uTime*.12))/.10,2.))*.13;float edge=smoothstep(.5,.25,abs(vUv.x-.5));gl_FragColor=vec4(.784,.961,.227,(line+sweep)*edge);}' });
let screen=new THREE.Mesh(new THREE.PlaneGeometry(1.50,.42),scan);screen.position.set(0,0,.572);headset.add(screen);
const glyphs=[];for(let s of [-1,1]){let e=new THREE.Group();e.position.set(s*.40,.015,.589);headset.add(e);curve(e,[[-.16,-.045,0],[-.10,.035,0],[0,.07,0],[.10,.035,0],[.16,-.045,0]],.023,lime);glyphs.push(e);}
rounded(.22,.025,.012,.008,green,headset,0,-.205,.584);
for(let s of [-1,1]){let earGroup=rig['ear'+(s<0?'L':'R')];curve(earGroup,[[-.25,.10,.26],[-.24,.47,.27],[-.20,.76,.27]],.014,s<0?lime:green);rounded(.10,.18,.065,.02,metal,earGroup,.21,.10,.21);
let arm=rig['arm'+(s<0?'L':'R')];ell(arm,0,-.20,.005,.25,.28,.25,metal);ring(arm,.243,.017,s<0?lime:green,0,-.38,.01,Math.PI/2);rounded(.17,.24,.05,.035,trim,arm,0,-.18,.25);rounded(.11,.025,.01,.006,lime,arm,0,-.18,.284);
let paw=rig['paw'+(s<0?'L':'R')];ring(paw,.20,.018,s<0?green:lime,0,.09,-.045,Math.PI/2);ell(paw,0,.07,.235,.09,.045,.035,metal);curve(paw,[[-.045,.08,.267],[.045,.08,.267]],.008,lime);
let rear=rig['back'+(s<0?'L':'R')];ell(rear,s*.25,-.03,.20,.18,.23,.18,metal);ring(rear,.10,.015,green,s*.26,-.01,.36);
curve(rig['cheek'+(s<0?'L':'R')],[[s*.04,.01,.30],[s*.13,-.035,.29],[s*.23,-.035,.23]],.012,s<0?lime:green);}
curve(belly,[[-.29,.38,.13],[-.31,.10,.17],[-.24,-.35,.15]],.014,lime);curve(belly,[[.29,.38,.13],[.31,.10,.17],[.24,-.35,.15]],.014,green);
// Segmented luminous stripes follow the deforming tail surface.
const tailBands=[];for(let u of [.34,.40,.70,.75]){let g=new THREE.BufferGeometry(),ar=new Float32Array(65*3);g.setAttribute('position',new THREE.BufferAttribute(ar,3));let o=new THREE.Line(g,new THREE.LineBasicMaterial({color:u<.5?'#c8f53a':'#8bce52',toneMapped:false}));o.frustumCulled=false;tail.add(o);tailBands.push({u,o});}
function cyberTick(t){scan.uniforms.uTime.value=t;lime.emissiveIntensity=1.7+Math.sin(t*2)*.25;green.emissiveIntensity=1.5+Math.sin(t*2+1)*.25;glyphs.forEach(g=>g.scale.y=1-.80*Math.pow(Math.max(0,Math.cos(t*1.35)),64));for(let {u,o} of tailBands){let ar=o.geometry.attributes.position;let i=Math.round(u*tn);for(let j=0;j<=64;j++){let a=j/64*ts,j0=Math.floor(a),f=a-j0;let p=tailGeo.attributes.position,k=i*(ts+1)+j0,k1=i*(ts+1)+Math.min(ts,j0+1);ar.setXYZ(j,THREE.MathUtils.lerp(p.getX(k),p.getX(k1),f),THREE.MathUtils.lerp(p.getY(k),p.getY(k1),f)+.006,THREE.MathUtils.lerp(p.getZ(k),p.getZ(k1),f)+.006);}ar.needsUpdate=true;}}

for(const id in rig)base[id]={rotation:rig[id].rotation.clone(),position:rig[id].position.clone(),scale:rig[id].scale.clone()};
function update({time:t,yaw=0,pitch=0,left=0,right=0,bodyYaw=0,bodyLean=0,reaction=0,reduced=false,headOnly=false}){
 for(const id in rig){const g=rig[id],b=base[id];g.rotation.copy(b.rotation);g.position.copy(b.position);g.scale.copy(b.scale)}
 fox.rotation.set(0,bodyYaw,bodyLean);
 head.rotation.y+=yaw;head.rotation.x-=pitch;rig.armL.rotation.z-=left;rig.armR.rotation.z+=right;
 for(const s of ['L','R']){rig['pupil'+s].position.x+=yaw*.055;rig['pupil'+s].position.y+=pitch*.045}
 if(!reduced&&!headOnly){
  body.scale.y=1+Math.sin(t*2)*.012;body.scale.x=1-Math.sin(t*2)*.006;
  head.rotation.z+=Math.sin(t*.9)*.035;head.rotation.x+=Math.sin(t*1.3)*.016;
  rig.earL.rotation.z+=Math.sin(t*2.3)*.04+Math.pow(Math.max(0,Math.sin(t*1.8)),16)*.15;
  rig.earR.rotation.z-=Math.sin(t*2.1+.5)*.035+Math.pow(Math.max(0,Math.sin(t*1.6+1)),18)*.12;
  belly.scale.y=1+Math.sin(t*2)*.018;bib.rotation.x+=Math.sin(t*2)*.025;
  for(let i=-1;i<=1;i++)rig['fluff'+i].rotation.x+=Math.sin(t*2+.3*i)*.035;
  const blink=1-.97*Math.pow(Math.max(0,Math.cos(t*1.35)),64);
  for(const s of ['L','R']){
   rig['eye'+s].scale.y=base['eye'+s].scale.y*blink;
   rig['brow'+s].position.y+=Math.sin(t*1.2)*.008;
   rig['whiskers'+s].rotation.z+=Math.sin(t*1.8)*.03;
   rig['paw'+s].rotation.x+=Math.sin(t*1.4+(s==='L'?0:1))*.018;
  }
  if(reaction>0){head.rotation.x+=Math.sin(t*8)*.10*reaction;rig.armR.rotation.z+=reaction*1.4;rig.pawR.rotation.z+=Math.sin(t*10)*.22*reaction;tail.rotation.y+=Math.sin(t*9)*.22*reaction}
  else if(reaction<0){head.rotation.y+=Math.sin(t*9)*.13*-reaction;rig.earL.rotation.z-=.12*-reaction;rig.earR.rotation.z+=.12*-reaction}
 }
 if(headOnly&&!reduced){const blink=1-.97*Math.pow(Math.max(0,Math.cos(t*1.35)),64);for(const side of ['L','R'])rig['eye'+side].scale.y=base['eye'+side].scale.y*blink}
 if(!reduced){tail.rotation.y+=Math.sin(t*1.55)*.18;tail.rotation.z+=Math.sin(t*1.55+.4)*.08}
 deformTail(reduced?0:t);cyberTick(reduced?0:t);
}
update({time:0,reduced:true});
return {model:fox,rig,base,update};
}

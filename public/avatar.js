import * as THREE from 'three';
import {createFox} from './fox-character.js?v=20261021-2';
const casePoses={
 '01':{yaw:0,pitch:.38,left:2.65,right:2.65},
 '02':{yaw:.55,pitch:.22,left:0,right:2.1},
 '03':{yaw:.55,pitch:-.22,left:0,right:1.05},
 '04':{yaw:0,pitch:-.38,left:0,right:0},
 '05':{yaw:-.55,pitch:-.22,left:1.05,right:0},
 '06':{yaw:-.55,pitch:.22,left:2.1,right:0}
};
export async function initAvatar(options={}){
 const story=options.mode==='story',container=options.container||document.getElementById('avatar'),stage=story?container:document.querySelector('.orbit-stage');if(!container||!stage)return;
 const poster=()=>{container.innerHTML='<img src="/assets/fox-poster.png?v=20261021-2" alt="Лисичка" class="avatar-poster">'};
 let renderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'})}catch{poster();return {destroy(){}}}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(container.clientWidth,container.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;container.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,40);
 scene.add(new THREE.HemisphereLight(0xf4f6ee,0x1b201b,1.7));
 for(const [color,intensity,pos]of [[0xf4f6ee,2.4,[-3,7,6]],[0xf4f6ee,1.4,[4,4,5]],[0xc8f53a,1.5,[-3,5,-4]]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(...pos);scene.add(light)}
 const character=createFox(),{model,rig}=character,root=model;scene.add(root);
 const fitCamera=()=>{camera.aspect=container.clientWidth/Math.max(1,container.clientHeight);const distance=Math.max(8.1,7.8/camera.aspect);camera.position.set(-.12,2.18,distance);camera.lookAt(-.12,2.05,0);camera.updateProjectionMatrix()};fitCamera();
 const cursor=new THREE.Vector2(),current={yaw:0,pitch:0,left:0,right:0,bodyYaw:0,bodyLean:0},reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let alive=true,activeCase=null,cursorActive=false,scroll=0,visible=true,frame,last=performance.now(),lastRender=0,reaction=0,lastPointer=null,lastScrollY=-1,lastViewportHeight=0;
 const onLook=e=>{activeCase=casePoses[e.detail.no]?e.detail.no:null};if(!story)window.addEventListener('case-look',onLook);
 const onReaction=e=>{reaction=e.detail?.positive?1:-1};if(story)window.addEventListener('novel-reaction',onReaction);
 const pointAt=(x,y)=>{const mini=scroll>.5,rect=(mini?container:stage).getBoundingClientRect();cursor.set(THREE.MathUtils.clamp((x-rect.left-rect.width/2)/(mini||story?Math.max(180,innerWidth*.42):rect.width*.45),-1,1),THREE.MathUtils.clamp((rect.top+rect.height*(mini?.35:.5)-y)/(mini||story?Math.max(180,innerHeight*.65):rect.height*.45),-1,1));cursorActive=true};
 const onPointer=e=>{if(e.pointerType==='touch')return;lastPointer=[e.clientX,e.clientY];pointAt(...lastPointer)};
 const onLeave=e=>{if(!e?.relatedTarget){cursorActive=false;lastPointer=null}};
 window.addEventListener('pointermove',onPointer,{passive:true});document.addEventListener('mouseout',onLeave);window.addEventListener('blur',onLeave);
 const onScroll=()=>{lastScrollY=scrollY;lastViewportHeight=innerHeight;if(story){visible=container.getBoundingClientRect().bottom>0;return}const rect=stage.getBoundingClientRect();scroll=THREE.MathUtils.clamp(-rect.top/Math.max(250,rect.height*.6),0,1);const w=container.clientWidth,h=container.clientHeight,tiny=innerWidth<=760?.52:(document.body.classList.contains('kksb-home')&&innerWidth>=1024?205/w:.50);
  container.style.position='fixed';container.style.left='0';container.style.top='0';container.style.transformOrigin='0 0';
  const x=rect.left+rect.width/2-w/2,y=rect.top+rect.height/2-h/2;
  container.style.transform=`translate(${THREE.MathUtils.lerp(x,innerWidth<=760?8:12,scroll)}px,${THREE.MathUtils.lerp(y,innerHeight-h*tiny-12,scroll)}px) scale(${THREE.MathUtils.lerp(1,tiny,scroll)})`;container.classList.toggle('avatar-mini',scroll>.98);if(lastPointer)pointAt(...lastPointer);visible=true;
 };
 window.addEventListener('scroll',onScroll,{passive:true});const resize=()=>{if(!alive)return;renderer.setSize(container.clientWidth,container.clientHeight);fitCamera();onScroll()};window.addEventListener('resize',resize);const observer=new ResizeObserver(resize);observer.observe(container);if(!story)observer.observe(stage);onScroll();container.querySelector('.avatar-loading')?.remove();

 const loop=now=>{if(!alive)return;frame=requestAnimationFrame(loop);if(!story&&(scrollY!==lastScrollY||innerHeight!==lastViewportHeight))onScroll();if(now-lastRender<32)return;lastRender=now;const dt=Math.min((now-last)/1000,.1);last=now;if(!visible||document.hidden)return;
  const mini=scroll>.5,x=cursorActive?cursor.x:0,y=cursorActive?cursor.y:0,p=activeCase&&!mini?casePoses[activeCase]:null;
  const yaw=mini?x*.72:p?p.yaw+x*.055:x*(story?.42:.35),pitch=mini?y*.45:p?p.pitch+y*.035:y*.20;
  const poses={yaw,pitch,left:0,right:0,bodyYaw:story?yaw*.20:0,bodyLean:story?-yaw*.035:0};
  for(const k of Object.keys(current))current[k]=reduced?poses[k]:THREE.MathUtils.damp(current[k],poses[k],k==='bodyYaw'?4:8,dt);
  character.update({time:now*.001,...current,reaction,reduced,headOnly:!story});reaction=THREE.MathUtils.damp(reaction,0,2,dt);renderer.render(scene,camera);
 };frame=requestAnimationFrame(loop);
 const onPageHide=e=>{if(!e.persisted)destroy()};const onPageShow=()=>{if(alive){last=performance.now();resize()}};
 const destroy=()=>{if(!alive)return;alive=false;cancelAnimationFrame(frame);observer.disconnect();const geometries=new Set(),materials=new Set();model.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();window.removeEventListener('case-look',onLook);window.removeEventListener('novel-reaction',onReaction);window.removeEventListener('pointermove',onPointer);document.removeEventListener('mouseout',onLeave);window.removeEventListener('blur',onLeave);window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',resize);window.removeEventListener('pagehide',onPageHide);window.removeEventListener('pageshow',onPageShow)};
 const controller={model,root,rig,renderer,scene,camera,destroy,getLook:()=>current.yaw,getScroll:()=>scroll,getPose:()=>({case:activeCase,armAngles:[current.left,current.right],cursor:cursor.toArray(),head:rig.head.rotation.toArray().slice(0,3),body:root.rotation.toArray().slice(0,3),leftArm:rig.armL.rotation.toArray().slice(0,3),rightArm:rig.armR.rotation.toArray().slice(0,3),eyes:[rig.pupilL.position.x,rig.pupilL.position.y]})};
 if(story)window.fotNovelAvatar=controller;else window.fotAvatar=controller;window.addEventListener('pagehide',onPageHide);window.addEventListener('pageshow',onPageShow);return controller;
}

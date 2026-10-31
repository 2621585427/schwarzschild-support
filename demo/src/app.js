import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Raytracer} from './renderer.js';
import {PARAMS,DEFAULTS,QUALITY,PRESETS,STORAGE_KEY,clampParameter,PARAM_ALIASES,REFERENCE_PRESETS,DEBUG_NAMES} from './config.js';
import {Experience} from './experience.js';
import {t,translate,setLanguage,getLanguage} from './i18n.js';
import {
  consumePendingVipSource,
  initialVipState,
  isNativeRuntime,
  isVipActive,
  notifyNativeWebReady,
  openNativePrivacy,
  openNativeSupport,
  requestNativeFullscreen,
  requestVipPurchase,
  restoreVipPurchases,
  saveImageWithNative,
} from './entitlement.js';

const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
const mobile=matchMedia('(max-width:760px)').matches;
const phone=/(Android|iPhone|iPad|iPod|Mobile|HarmonyOS)/i.test(navigator.userAgent)||navigator.userAgentData?.mobile===true||(mobile&&navigator.maxTouchPoints>0);
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const finite=(v,fallback,min,max)=>v!==null && Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
const captureMode=query.get('capture')==='1';
let stored={};
try{stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{};}catch{/* Storage is optional. */}
const params={...DEFAULTS};
if(!captureMode && stored.params)for(const key of Object.keys(DEFAULTS)){const v=clampParameter(key,stored.params[key]);if(v!==undefined)params[key]=v;}
const requestedQuality=QUALITY[query.get('quality')]?query.get('quality'):(!captureMode&&QUALITY[stored.quality]?stored.quality:mobile?'standard':'high');
let quality=requestedQuality==='cinematic'&&!isVipActive()?'high':requestedQuality;
let preset=PRESETS[query.get('preset')]?query.get('preset'):(!captureMode&&PRESETS[stored.preset]?stored.preset:'hero');
let mode=query.get('mode')==='orbit'?'orbit':query.get('mode')==='cinema'?'cinema':captureMode?'orbit':!reduced&&stored.mode!=='orbit'?'cinema':'orbit';
let playing=!captureMode&&!reduced&&query.get('paused')!=='1'&&!query.has('t');
let simTime=finite(query.get('t'),0,0,1e7),debug=Math.round(finite(query.get('view')??query.get('debug'),!captureMode&&Number.isFinite(stored.debug)?stored.debug:0,0,12));
let azimuth=PRESETS[preset].azimuth,dirty=true,contextLost=false,frames=0,restores=0,raf=0,fatal=null;
let pipeline,saveTimer,toastTimer,resolveReady,experience;
let adaptiveScale=1,adaptiveFrames=0,adaptiveStarted=0,adaptiveStable=0,adaptiveLow=0;
const qualityProfile=value=>{const base=QUALITY[value];return phone&&base.mobile?{...base,...base.mobile}:base;};
const ready=new Promise(r=>{resolveReady=r;});
const camera=new THREE.PerspectiveCamera(params.fov,innerWidth/innerHeight,.1,1000);
const canvas=$('cosmos');
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=false;controls.minDistance=3.2;controls.maxDistance=55;controls.minPolarAngle=THREE.MathUtils.degToRad(1);controls.maxPolarAngle=THREE.MathUtils.degToRad(179);controls.rotateSpeed=.42;controls.zoomSpeed=.65;
const audio=new Audio('./assets/event-horizon.wav');audio.loop=true;audio.volume=.35;audio.preload='none';let soundOn=false;

function toast(message){$('toast').textContent=t(message);$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function save(){if(captureMode)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,params,quality,preset,mode,azimuth,debug,ship:experience?.ship,hudHidden:document.body.classList.contains('hud-hidden'),panelHidden:document.body.classList.contains('panel-hidden')}));}catch{}},180);}
function placeCamera(distance=params.distance,inclination=params.inclination,theta=azimuth){const polar=THREE.MathUtils.degToRad(inclination);camera.position.set(distance*Math.sin(polar)*Math.sin(theta),distance*Math.cos(polar),distance*Math.sin(polar)*Math.cos(theta));camera.lookAt(0,0,0);camera.updateMatrixWorld();}
function cameraParams(){params.distance=camera.position.length();params.inclination=THREE.MathUtils.radToDeg(Math.acos(camera.position.y/params.distance));azimuth=Math.atan2(camera.position.x,camera.position.z);refreshInputs(['distance','inclination']);}
function refreshModes(){document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});$('cruise').setAttribute('aria-pressed',String(mode==='cinema'));}
function refreshEntitlementUI(){
  const active=isVipActive();
  document.body.classList.toggle('vip-locked',!active);
  document.body.classList.toggle('vip-active',active);
  document.querySelectorAll('[data-vip-feature]').forEach(button=>{
    button.classList.toggle('vip-feature-locked',!active);
    button.setAttribute('aria-description',active?t('VIP unlocked'):t('Requires VIP'));
  });
  $('restore-purchases').hidden=!isNativeRuntime();
  $('restore-purchases').textContent=t('Restore purchases');
  $('privacy-link').hidden=!isNativeRuntime();
  $('support-link').hidden=!isNativeRuntime();
  experience?.refreshVipUI();
}
function activatePendingVipFeature(){
  const source=consumePendingVipSource();
  if(!isVipActive()||!source)return;
  if(source==='cinematic')setQuality('cinematic');
  if(source==='vessel')experience?.setShipView(true);
}
function setMode(value){if(experience?.ship.enabled)experience.setShipView(false,{instant:true});if(!['cinema','orbit'].includes(value))throw new RangeError('Mode must be cinema or orbit');if(mode!==value){cameraParams();mode=value;}refreshModes();dirty=true;save();return mode;}
function setPlaying(value){playing=Boolean(value);if(playing&&frames>0){adaptiveStarted=performance.now()+800;adaptiveFrames=0;adaptiveStable=0;adaptiveLow=0;}$('play').setAttribute('aria-label',t(playing?'Pause simulation':'Resume simulation'));$('play').setAttribute('aria-pressed',String(!playing));$('play-label').textContent=t(playing?'Freeze time':'Resume time');$('play-icon').innerHTML=playing?'<path d="M5 3v10M11 3v10"/>':'<path d="m5 3 8 5-8 5Z"/>';dirty=true;return playing;}
function selectPreset(key,persist=true){if(experience?.ship.enabled)experience.setShipView(false,{instant:true});if(!PRESETS[key])throw new RangeError('Unknown camera preset');const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;preset=key;const p=PRESETS[key];params.distance=p.distance;params.inclination=p.inclination;params.fov=p.fov;azimuth=p.azimuth;controls.target.set(0,0,0);placeCamera();if(p.position){camera.position.fromArray(p.position);camera.lookAt(0,0,0);cameraParams();}controls.update();document.querySelectorAll('[data-preset]').forEach(b=>{const active=b.dataset.preset===key;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});$('view-number').textContent=p.number;refreshInputs(['distance','inclination','fov']);dirty=true;if(persist){save();toast(t('Preset selected')+' · '+t(p.label));}}
function format(p,v){const digits=p.step>=1?0:p.step>=.1?1:2;return Number(v).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits})+p.unit;}
function refreshInputs(keys=Object.keys(DEFAULTS)){for(const key of keys){const input=$('param-'+key);if(!input)continue;const p=PARAMS.find(p=>p.key===key);input.value=params[key];input.style.setProperty('--fill',100*(params[key]-p.min)/(p.max-p.min)+'%');$('value-'+key).textContent=format(p,params[key]);}}
function setParameter(key,value){const alias=PARAM_ALIASES[key];if(alias){key=alias[0];value=Number(value)*alias[1];}const v=clampParameter(key,value);if(v===undefined)throw new RangeError('Unknown parameter or non-finite value: '+key);if(['distance','inclination','fov'].includes(key)&&mode==='cinema')setMode('orbit');params[key]=v;if(['distance','inclination'].includes(key)){placeCamera();controls.update();}refreshInputs([key]);if(['holeScale','outer'].includes(key))experience?.clampShip();dirty=true;save();return v;}
function buildControls(){
  const groups=[
    ['SPACETIME','Geometry',['timeScale','holeScale','lensing','fov','integrationSteps','stepScale','redshift','distance','inclination']],
    ['ACCRETION','Disk',['inner','outer','opacity','luminosity','temperature','diskThickness','turbulence','rotation','doppler']],
    ['CELESTIAL FIELD','Sky',['starBrightness','galaxy','photonRing','starDensity']],
    ['IMAGE PIPELINE','Imaging',['exposure','bloom','chromatic','bloomRadius','vignette','grain']],
  ];
  for(const [index,[group,subtitle,keys]] of groups.entries()){
    const details=document.createElement('details');details.className='parameter-group';details.open=group!=='CELESTIAL FIELD';
    const summary=document.createElement('summary');summary.innerHTML=`<span class="group-index">0${index+1}</span><span>${group}</span><span class="group-zh">${subtitle}</span>`;details.append(summary);
    const content=document.createElement('div');content.className='group-content';
    keys.map(key=>PARAMS.find(p=>p.key===key)).forEach(p=>{
      const row=document.createElement('div');row.className='parameter';
      row.innerHTML=`<label for="param-${p.key}"><span>${p.name}</span><output id="value-${p.key}" for="param-${p.key}"></output></label><input id="param-${p.key}" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${params[p.key]}" aria-label="${p.name}">`;
      row.querySelector('input').addEventListener('input',e=>setParameter(p.key,e.target.value));content.append(row);
    });
    details.append(content);$('parameters').append(details);
  }
  refreshInputs();
}
function size(){
  const w=Math.round(finite(query.get('width'),innerWidth,240,4096)),h=Math.round(finite(query.get('height'),innerHeight,240,4096));
  const dpr=finite(query.get('dpr'),devicePixelRatio, .5,3);
  camera.aspect=w/h;camera.updateProjectionMatrix();pipeline.resize(w,h,dpr,quality,adaptiveScale,phone);
  const info=pipeline.info;$('resolution').textContent=info.integration.join(' × ')+(adaptiveScale<.99?' · '+Math.round(adaptiveScale*100)+'%':'');dirty=true;
}
function setQuality(value,{steps=true}={}){
  if(!QUALITY[value])throw new RangeError('Unknown quality');
  if(value==='cinematic'&&!isVipActive()){
    if(!requestVipPurchase('cinematic'))toast(isNativeRuntime()?'VIP unavailable':'Cinematic quality is available in the iOS app');
    return quality;
  }
  quality=value;adaptiveScale=1;adaptiveFrames=0;adaptiveStable=0;adaptiveLow=0;adaptiveStarted=frames>0?performance.now()+1200:0;
  if(steps){params.integrationSteps=qualityProfile(value).steps;refreshInputs(['integrationSteps']);}
  document.querySelectorAll('[data-quality]').forEach(b=>{const active=b.dataset.quality===quality;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  $('quality-label').textContent=t(quality.toUpperCase());if(pipeline)size();save();return quality;
}
function setDebug(value){debug=Math.round(finite(String(value),0,0,12));$('debug').value=String(debug);$('debug-label').textContent='VIEW '+String(debug).padStart(2,'0');$('status').textContent=debug?debug+' / '+t([...DEBUG_NAMES,'Capture / escape','Disk crossings','Geodesic error'][debug]):t('INTEGRATING NULL GEODESICS');dirty=true;save();return debug;}
function panel(value){const hidden=value??!document.body.classList.contains('panel-hidden');document.body.classList.toggle('panel-hidden',hidden);$('toggle-panel').setAttribute('aria-expanded',String(!hidden));$('toggle-panel').textContent=hidden?'+':'−';$('deck-body').hidden=hidden;save();}
function reset(){experience?.reset();audio.pause();soundOn=false;$('sound').setAttribute('aria-pressed','false');$('audio-status').textContent=t('AUDIO OFF');$('sound').setAttribute('aria-label',t('Enable ambient audio'));document.body.classList.remove('hud-hidden');Object.assign(params,DEFAULTS);setMode('cinema');selectPreset('hero',false);setDebug(0);setQuality(mobile?'standard':'high');simTime=0;setPlaying(!reduced);refreshInputs();save();toast('Observation reset');}
async function toggleAudio(){
  if(soundOn){audio.pause();soundOn=false;}else{try{await audio.play();soundOn=true;}catch{toast('Audio unavailable. Try enabling sound again.');return;}}
  $('audio-status').textContent=t(soundOn?'AUDIO ON':'AUDIO OFF');$('sound').setAttribute('aria-pressed',soundOn);$('sound').setAttribute('aria-label',t(soundOn?'Mute ambient audio':'Enable ambient audio'));toast(soundOn?'Ambient signal enabled':'Ambient signal muted');
}
async function fullscreen(){if(requestNativeFullscreen())return;try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is not available in this browser.');}}
function snapshot(){return {version:'2.2.0',language:getLanguage(),...experience?.state(),params:{...params},quality,preset,mode,playing,time:simTime,debug,frames,ready:frames>0&&!contextLost&&!fatal&&(query.get('ship')!=='1'||!!experience?.vessel.loaded),contextLost,restores,soundOn,camera:camera.position.toArray(),render:pipeline?.info,vip:initialVipState(),error:fatal};}
function render(){
  if(contextLost||!pipeline||fatal)return;
  if(mode==='cinema'&&!experience?.ship.enabled&&!experience?.transition){
    // A closed 120-second camera path, evaluated at absolute simulation time.
    const phase=simTime*Math.PI*2/120;
    placeCamera(params.distance*(1+.018*Math.sin(phase)),Math.min(89.5,Math.max(4,params.inclination+1.6*Math.sin(phase))),azimuth+.14*Math.sin(phase));
  }
  experience?.beforeRender(simTime);
  pipeline.render(camera,params,simTime,debug,experience?.ship.enabled?.5:pipeline.cssWidth<=760?.5:.405,experience?.ship);frames++;dirty=false;
}
function maintainFrameRate(now){
  if(captureMode||!playing||experience?.intro.active||!pipeline)return;
  if(!adaptiveStarted){adaptiveStarted=now+1200;return;}
  if(now<adaptiveStarted)return;
  if(now-adaptiveStarted<1200)return;
  const measured=adaptiveFrames*1000/(now-adaptiveStarted),q=qualityProfile(quality),minScale=q.minPixels/q.maxPixels;
  if(measured<44){
    adaptiveLow++;
    if(adaptiveLow>=2){
      const target=48,demand=Math.sqrt(Math.max(measured,4)/target);
      const next=Math.max(minScale,adaptiveScale*Math.max(.45,Math.min(.92,demand)));
      if(next<adaptiveScale-.015){
        adaptiveScale=next;pipeline.setAdaptiveScale(next);$('resolution').textContent=pipeline.info.integration.join(' × ')+' · '+Math.round(next*100)+'%';dirty=true;
      }
      adaptiveLow=0;
    }
    adaptiveStable=0;
  }else if(measured>57&&adaptiveScale<.99){
    if(++adaptiveStable>=3){
      adaptiveScale=Math.min(1,adaptiveScale+.04);pipeline.setAdaptiveScale(adaptiveScale);$('resolution').textContent=pipeline.info.integration.join(' × ')+(adaptiveScale<.99?' · '+Math.round(adaptiveScale*100)+'%':'');dirty=true;adaptiveStable=0;
    }
  }else{adaptiveStable=0;adaptiveLow=0;}
  adaptiveFrames=0;adaptiveStarted=now;
}
async function capture(options={}){
  if(contextLost||fatal)throw new Error('Renderer is unavailable');await window.GARGANTUA.ready;render();
  // Read synchronously after rendering. toBlob() can observe a cleared
  // double-buffered WebGL canvas on some compositors when preserveDrawingBuffer
  // is disabled.
  const dataURL=canvas.toDataURL('image/png');
  const blob=await (await fetch(dataURL)).blob();
  if(options.download!==false){
    if(!saveImageWithNative(dataURL)){
      const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`schwarzschild-${preset}-${Math.floor(simTime)}s.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    toast('Observation ready to save');
  }
  return {blob,dataURL,width:canvas.width,height:canvas.height,state:snapshot()};
}
function showError(message){$('error-message').textContent=t(message);$('error').hidden=false;document.body.classList.add('loaded');}
function fail(error){fatal=String(error?.message||error);window.__GARGANTUA_ERROR__=fatal;showError(fatal);$('status').textContent=t('RENDERER UNAVAILABLE');}

buildControls();
$('debug').replaceChildren(...[...DEBUG_NAMES,'Capture / escape','Disk crossings','Geodesic error'].map((name,i)=>new Option(i+' · '+name,String(i))));
if(captureMode||query.has('preset'))selectPreset(preset,false);else{if(Number.isFinite(stored.azimuth))azimuth=stored.azimuth;placeCamera();$('view-number').textContent=PRESETS[preset].number;document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===preset));}
for(const key of [...Object.keys(DEFAULTS),...Object.keys(PARAM_ALIASES)])if(query.has(key)){const alias=PARAM_ALIASES[key],actual=alias?alias[0]:key,value=clampParameter(actual,Number(query.get(key))*(alias?alias[1]:1));if(value!==undefined)params[actual]=value;}
if(!query.has('integrationSteps')&&(captureMode||query.has('quality')||!Number.isFinite(stored.params?.integrationSteps)))params.integrationSteps=qualityProfile(quality).steps;
placeCamera();controls.update();refreshInputs();refreshModes();setPlaying(playing);setDebug(debug);
panel(query.get('panel')==='1'?false:query.get('panel')==='0'?true:mobile||(!captureMode&&stored.panelHidden===true));
if(query.get('ui')==='0'||query.get('hud')==='0'||(captureMode&&query.get('hud')!=='1'))document.body.classList.add('capture-clean');
if(!captureMode&&!query.has('hud')&&!query.has('ui')&&stored.hudHidden)document.body.classList.add('hud-hidden');

document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>selectPreset(b.dataset.preset)));
document.querySelectorAll('[data-quality]').forEach(b=>b.addEventListener('click',()=>setQuality(b.dataset.quality)));
$('debug').addEventListener('change',e=>setDebug(e.target.value));$('play').addEventListener('click',()=>setPlaying(!playing));$('reset').addEventListener('click',reset);$('toggle-panel').addEventListener('click',()=>panel());$('sound').addEventListener('click',toggleAudio);$('capture').addEventListener('click',()=>capture().catch(e=>toast(e.message)));$('fullscreen').addEventListener('click',fullscreen);
$('info').addEventListener('click',()=>$('about').showModal());document.querySelector('.dialog-close').addEventListener('click',()=>$('about').close());$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});$('retry').addEventListener('click',()=>location.reload());
$('restore-purchases').addEventListener('click',()=>{if(!restoreVipPurchases())toast('Restore purchases is available in the iOS app');});
$('privacy-link').addEventListener('click',()=>{if(!openNativePrivacy())toast('Privacy information is available in the iOS app');});
$('support-link').addEventListener('click',()=>{if(!openNativeSupport())toast('Support is available in the iOS app');});
document.addEventListener('schwarzschild-entitlement',()=>{
  if(!isVipActive()&&quality==='cinematic')setQuality('high');
  refreshEntitlementUI();
  activatePendingVipFeature();
});
canvas.addEventListener('pointerdown',()=>{if(mode==='cinema')setMode('orbit');});canvas.addEventListener('wheel',()=>{if(mode==='cinema')setMode('orbit');},{passive:true});
controls.addEventListener('change',()=>{if(mode==='orbit'&&!experience?.ship.enabled&&!experience?.transition){cameraParams();save();}dirty=true;});
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(experience?.handleKey(e))return;
  if($('about').open){if(e.key==='Escape')$('about').close();return;}
  if(e.shiftKey&&['Digit1','Digit2','Digit3','Digit4'].includes(e.code)){e.preventDefault();selectPreset(REFERENCE_PRESETS[Number(e.code.slice(-1))-1]);return;}
  if(/^\d$/.test(e.key)){setDebug(Number(e.key));return;}
  switch(e.key.toLowerCase()){
    case ' ':e.preventDefault();setPlaying(!playing);break;
    case 'l':setMode(mode==='cinema'?'orbit':'cinema');break;
    case 'h':document.body.classList.toggle('hud-hidden');save();break;
    case 'p':panel();break;
    case 'r':reset();break;
    case 'm':toggleAudio();break;
    case 's':e.preventDefault();capture().catch(e=>toast(e.message));break;
    case 'f':fullscreen();break;
    case '?':$('about').showModal();break;
    case 'escape':document.body.classList.remove('hud-hidden');save();break;
  }
});
window.addEventListener('resize',()=>{if(pipeline&&!contextLost)size();});
document.addEventListener('visibilitychange',()=>{last=performance.now();adaptiveStarted=last+600;adaptiveFrames=0;adaptiveStable=0;adaptiveLow=0;if(document.hidden){audio.pause();}else if(soundOn){audio.play().catch(()=>{soundOn=false;$('sound').setAttribute('aria-pressed',false);});}dirty=true;});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;window.__GARGANTUA_READY__=false;$('status').textContent=t('RECONNECTING TO GPU');showError('The graphics context was interrupted. Reconnecting automatically…');setTimeout(()=>{if(contextLost)pipeline?.contextExtension?.restoreContext();},1200);});
canvas.addEventListener('webglcontextrestored',()=>{
  try{pipeline.dispose();pipeline=new Raytracer(canvas);size();contextLost=false;restores++;$('error').hidden=true;setDebug(debug);dirty=true;render();window.__GARGANTUA_READY__=true;toast('Graphics connection restored');}catch(e){fail(e);}
});

window.GARGANTUA={ready,getState:snapshot,setParameter,setQuality,setPreset:selectPreset,setMode,setDebug,pause:()=>setPlaying(false),play:()=>setPlaying(true),setTime:value=>{simTime=finite(String(value),0,0,1e7);dirty=true;return simTime;},capture,render:()=>{render();return snapshot();},reset,
  setHUD:visible=>{document.body.classList.remove('capture-clean');document.body.classList.toggle('hud-hidden',!visible);save();},
  requestVip:(source='cinematic')=>requestVipPurchase(source),
  restoreVip:restoreVipPurchases,
  loseContext:()=>{const ext=pipeline.contextExtension;if(!ext)throw new Error('Context-loss extension unavailable');ext.loseContext();return true;},
  restoreContext:()=>{pipeline.contextExtension?.restoreContext();},
};
experience=new Experience({camera,controls,params,query,stored,captureMode,reduced,api:window.GARGANTUA,save,toast,panel,markDirty:()=>dirty=true,setMode,refreshInputs,getTime:()=>simTime,getPlaying:()=>playing});
refreshEntitlementUI();
let last=performance.now(),fpsStart=last,frameCount=0;
function tick(now){
  raf=requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.1);last=now;
  if(contextLost||fatal||document.hidden)return;
  experience?.tick(now,dt,playing,simTime);
  if(playing&&!experience?.intro.active){simTime+=dt*params.timeScale;dirty=true;}
  if(experience?.transition)dirty=true;
  if(mode==='orbit'&&!experience?.ship.enabled&&!experience?.transition)controls.update();
  if(dirty){try{render();frameCount++;adaptiveFrames++;if(frames===1){adaptiveStarted=now+1200;adaptiveFrames=0;document.body.classList.add('loaded');document.body.dataset.renderReady='true';window.__GARGANTUA_READY__=query.get('ship')!=='1'||!!experience?.ship.enabled;resolveReady(snapshot());if(!pipeline.hdr)toast('HDR float targets unavailable; using compatible rendering.');}maintainFrameRate(now);}catch(e){fail(e);}}
  if(now-fpsStart>900){$('fps').textContent=playing?Math.round(frameCount*1000/(now-fpsStart)):'—';fpsStart=now;frameCount=0;}
  const seconds=Math.floor(simTime);$('clock').textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':');
}
try{pipeline=new Raytracer(canvas);setQuality(quality,{steps:false});requestAnimationFrame(tick);notifyNativeWebReady();}catch(error){fail(error);}
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);audio.pause();});
window.addEventListener('pageshow',e=>{if(e.persisted){last=performance.now();dirty=true;raf=requestAnimationFrame(tick);}});

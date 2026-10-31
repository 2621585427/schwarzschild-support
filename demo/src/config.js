export const PARAMS = [
  {key:'inner',group:'Accretion disk',name:'Inner radius',min:2.46,max:6,step:.01,value:3.05,unit:' rₛ'},
  {key:'outer',group:'Accretion disk',name:'Outer radius',min:1.8,max:36,step:.03,value:11,unit:' rₛ'},
  {key:'temperature',group:'Accretion disk',name:'Temperature',min:2500,max:16000,step:100,value:7400,unit:' K'},
  {key:'luminosity',group:'Accretion disk',name:'Luminosity',min:.2,max:15,step:.1,value:5.2,unit:''},
  {key:'opacity',group:'Accretion disk',name:'Optical depth',min:.05,max:2,step:.01,value:.38,unit:''},
  {key:'turbulence',group:'Accretion disk',name:'Turbulence',min:0,max:2.5,step:.01,value:.8,unit:''},
  {key:'diskThickness',group:'Accretion disk',name:'Disk thickness',min:.25,max:2.5,step:.01,value:1,unit:'×'},
  {key:'rotation',group:'Accretion disk',name:'Rigid rotation speed',min:0,max:3,step:.05,value:.65,unit:'×'},
  {key:'doppler',group:'Relativity',name:'Doppler strength',min:0,max:2,step:.01,value:1,unit:''},
  {key:'redshift',group:'Relativity',name:'Gravitational redshift',min:0,max:2,step:.01,value:1,unit:''},
  {key:'holeScale',group:'Relativity',name:'Black hole scale',min:.5,max:2.5,step:.01,value:1,unit:'×'},
  {key:'lensing',group:'Relativity',name:'Lensing strength',min:0,max:1.6,step:.01,value:1,unit:'×'},
  {key:'integrationSteps',group:'Relativity',name:'Integration steps',min:64,max:1024,step:1,value:640,unit:''},
  {key:'stepScale',group:'Relativity',name:'Adaptive step scale',min:.55,max:1.4,step:.01,value:1,unit:'×'},
  {key:'distance',group:'Observer',name:'Distance',min:3.2,max:55,step:.1,value:27,unit:' rₛ'},
  {key:'inclination',group:'Observer',name:'Inclination',min:1,max:179,step:.1,value:78,unit:'°'},
  {key:'fov',group:'Observer',name:'Field of view',min:25,max:90,step:.1,value:44,unit:'°'},
  {key:'starDensity',group:'Celestial background',name:'Star density',min:0,max:3,step:.05,value:1.2,unit:'×'},
  {key:'starBrightness',group:'Celestial background',name:'Star brightness',min:0,max:2.4,step:.01,value:1,unit:'×'},
  {key:'photonRing',group:'Celestial background',name:'Photon ring emission',min:0,max:2,step:.01,value:1,unit:'×'},
  {key:'galaxy',group:'Celestial background',name:'Milky Way',min:0,max:2.2,step:.05,value:.55,unit:'×'},
  {key:'exposure',group:'Optics & film',name:'Exposure',min:.3,max:3,step:.05,value:1.15,unit:'×'},
  {key:'bloom',group:'Optics & film',name:'Bloom intensity',min:0,max:2.2,step:.01,value:.5,unit:''},
  {key:'bloomRadius',group:'Optics & film',name:'Bloom radius',min:.5,max:3,step:.05,value:1.2,unit:''},
  {key:'vignette',group:'Optics & film',name:'Vignette',min:0,max:1,step:.01,value:.5,unit:''},
  {key:'grain',group:'Optics & film',name:'Film grain',min:0,max:1,step:.01,value:.25,unit:''},
  {key:'chromatic',group:'Optics & film',name:'Chromatic aberration',min:0,max:3,step:.05,value:.6,unit:' px'},
  {key:'timeScale',group:'Time',name:'Time scale',min:0,max:6.6,step:.03,value:1,unit:'×'},
];
export const DEFAULTS = Object.fromEntries(PARAMS.map(p=>[p.key,p.value]));
export const QUALITY = {
  // The ray budget is deliberately separate from the canvas output resolution.
  // Low-end GPUs lower the integration target while the final UI remains crisp.
  standard:{scale:.62,dpr:1,step:.058,steps:224,maxPixels:500000,minPixels:200000,mobile:{scale:.58,step:.08,steps:160,maxPixels:220000,minPixels:80000}},
  high:{scale:.82,dpr:1.5,step:.045,steps:448,maxPixels:900000,minPixels:320000,mobile:{scale:.7,step:.068,steps:224,maxPixels:340000,minPixels:120000}},
  cinematic:{scale:.94,dpr:2,step:.03,steps:640,maxPixels:1600000,minPixels:500000,mobile:{scale:.82,step:.052,steps:320,maxPixels:520000,minPixels:180000}},
};
export const PRESETS = {
  hero:{distance:27,inclination:78,fov:44,azimuth:.16,label:'Classic',number:'01'},
  edge:{distance:29,inclination:88.5,fov:42,azimuth:.26,label:'Edge-on',number:'02'},
  polar:{position:[7.2,10.8,7.8],distance:15.137,inclination:44.47,fov:60,azimuth:.745,label:'Polar',number:'02'},
  close:{distance:17,inclination:72,fov:49,azimuth:-.2,label:'Close approach',number:'04'},
  gargantua:{position:[.1,2.8,14.5],distance:14.768,inclination:79.069,fov:44,azimuth:.0069,label:'Lensed hero',number:'01'},
  inferno:{position:[4.5,.9,5.2],distance:6.936,inclination:82.545,fov:72,azimuth:.713,label:'Inferno',number:'03'},
  deepfield:{position:[.1,4.1,22],distance:22.379,inclination:79.443,fov:38,azimuth:.0045,label:'Deep field',number:'04'},
};
export const REFERENCE_PRESETS=['gargantua','polar','inferno','deepfield'];
export const PARAM_ALIASES={diskInner:['inner',3],diskOuter:['outer',1],diskDensity:['opacity',1],diskGain:['luminosity',5],diskTemperature:['temperature',7400],spin:['rotation',1],beaming:['doppler',1],galaxyBrightness:['galaxy',1],bloomStrength:['bloom',1],dispersion:['chromatic',1]};
export const SHIP_DEFAULTS={enabled:false,radius:6,speed:1.3,shakeAmplitude:1,shakeFrequency:3.2,angle:.3,lookYaw:0,lookPitch:0};
export const DEBUG_NAMES=['Final composite','Geodesic trace','Disk temperature','Doppler factor','Redshift field','Photon ring','Lensed celestial sky','Disk emission','Impact parameter','HDR Bloom'];
export const STORAGE_KEY='gargantua.schwarzschild.v1';
export function clampParameter(key,value){const p=PARAMS.find(p=>p.key===key);if(!p||!Number.isFinite(Number(value)))return undefined;return Math.min(p.max,Math.max(p.min,Number(value)));}

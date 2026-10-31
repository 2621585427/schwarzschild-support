import * as THREE from 'three';
import {vertex,raytrace,downsample,blur,composite} from './shaders.js';
import {QUALITY} from './config.js';

const uniform=value=>({value});
export class Raytracer {
  constructor(canvas){
    this.canvas=canvas;
    // No multisampling, depth/stencil buffer or preserved back buffer: every
    // visual pass is full-screen, so those allocations only cost bandwidth.
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,depth:false,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
    this.renderer.autoClear=false;
    this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping=THREE.NoToneMapping;
    this.renderer.debug.onShaderError=(gl,program,vs,fs)=>{throw new Error(`Shader compilation failed: ${gl.getProgramInfoLog(program)} ${gl.getShaderInfoLog(vs)} ${gl.getShaderInfoLog(fs)}`);};
    this.contextExtension=this.renderer.getContext().getExtension('WEBGL_lose_context');
    this.hdr=!!this.renderer.extensions.get('EXT_color_buffer_float');
    this.type=this.hdr?THREE.HalfFloatType:THREE.UnsignedByteType;
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
    this.passCamera=new THREE.Camera();this.scene=new THREE.Scene();
    this.mesh=new THREE.Mesh(this.geometry);this.mesh.frustumCulled=false;this.scene.add(this.mesh);
    this.ray=this.material(raytrace,{
      uResolution:uniform(new THREE.Vector2()),uCamera:uniform(new THREE.Vector3()),uRight:uniform(new THREE.Vector3()),uUp:uniform(new THREE.Vector3()),uForward:uniform(new THREE.Vector3()),
      uFov:uniform(44),uCenter:uniform(.41),uTime:uniform(0),uStep:uniform(.037),uMaxSteps:uniform(640),uDebug:uniform(0),
      ...Object.fromEntries(['Inner','Outer','Temperature','Luminosity','Opacity','Turbulence','Rotation','Doppler','Redshift','StarDensity','Galaxy','HoleScale','Lensing','DiskThickness','StarBrightness','PhotonRing','ShipView'].map(k=>['u'+k,uniform(1)])),
    });
    this.down=this.material(downsample,{uInput:uniform(null),uTexel:uniform(new THREE.Vector2()),uThreshold:uniform(1)});
    this.blur=this.material(blur,{uInput:uniform(null),uDirection:uniform(new THREE.Vector2())});
    this.composite=this.material(composite,{
      ...Object.fromEntries(['Scene','Bloom0','Bloom1','Bloom2','Bloom3'].map(k=>['u'+k,uniform(null)])),
      uResolution:uniform(new THREE.Vector2()),uBloom:uniform(.5),uExposure:uniform(1),uVignette:uniform(.5),uGrain:uniform(.3),uChromatic:uniform(.5),uTime:uniform(0),uDebug:uniform(0),uCenter:uniform(.41),
    });
    this.targets=[];this.actualScale=1;
  }
  material(fragmentShader,uniforms){return new THREE.RawShaderMaterial({vertexShader:vertex,fragmentShader,uniforms,depthTest:false,depthWrite:false});}
  target(w,h,depth=false){return new THREE.WebGLRenderTarget(w,h,{type:this.type,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:depth,stencilBuffer:false,generateMipmaps:false});}
  resize(width,height,dpr,quality,dynamicScale=1,mobileProfile=false){
    this.quality=quality;this.cssWidth=width;this.cssHeight=height;this.deviceDpr=dpr;this.mobileProfile=!!mobileProfile;
    this.dynamicScale=Math.max(.25,Math.min(1,Number(dynamicScale)||1));
    const base=QUALITY[quality],q=this.mobileProfile&&base.mobile?{...base,...base.mobile}:base;
    this.profile=q;
    const outputRatio=Math.min(dpr,q.dpr,Math.sqrt(8294400/(width*height)));
    const maxSize=this.renderer.capabilities.maxTextureSize;
    const ratio=Math.min(outputRatio,maxSize/width,maxSize/height);
    this.width=Math.max(2,Math.round(width*ratio));this.height=Math.max(2,Math.round(height*ratio));
    this.renderer.setPixelRatio(1);this.renderer.setSize(this.width,this.height,false);
    const pixelBudget=Math.max(q.minPixels,q.maxPixels*this.dynamicScale);
    const scale=Math.min(q.scale,Math.sqrt(pixelBudget/(this.width*this.height)));
    const rw=Math.max(2,Math.floor(this.width*scale)),rh=Math.max(2,Math.floor(this.height*scale));
    this.targets.forEach(t=>t.dispose());
    this.main=this.target(rw,rh);this.mips=[];this.targets=[this.main];
    for(let i=0;i<4;i++){
      const w=Math.max(2,Math.floor(rw/Math.pow(2,i+1))),h=Math.max(2,Math.floor(rh/Math.pow(2,i+1)));
      const a=this.target(w,h),b=this.target(w,h);this.mips.push({a,b});this.targets.push(a,b);
    }
    this.ray.uniforms.uResolution.value.set(rw,rh);
    this.ray.uniforms.uStep.value=q.step;this.ray.uniforms.uMaxSteps.value=q.steps;
    this.composite.uniforms.uResolution.value.set(this.width,this.height);
    this.actualScale=scale;
  }
  setAdaptiveScale(value){
    const next=Math.max(.25,Math.min(1,Number(value)||1));
    if(Math.abs(next-this.dynamicScale)<.015)return this.dynamicScale;
    this.resize(this.cssWidth,this.cssHeight,this.deviceDpr,this.quality,next,this.mobileProfile);
    return this.dynamicScale;
  }
  pass(material,target){this.mesh.material=material;this.renderer.setRenderTarget(target);this.renderer.render(this.scene,this.passCamera);}
  render(camera,params,time,debug,center,ship=null){
    camera.updateMatrixWorld();
    const u=this.ray.uniforms;
    u.uCamera.value.copy(camera.position);u.uRight.value.setFromMatrixColumn(camera.matrixWorld,0);u.uUp.value.setFromMatrixColumn(camera.matrixWorld,1);u.uForward.value.setFromMatrixColumn(camera.matrixWorld,2).negate();
    const portraitScale=ship?.enabled?1:Math.max(1,1.18/(this.cssWidth/this.cssHeight));
    u.uFov.value=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(ship?.enabled?ship.fov||84:params.fov)*.5)*portraitScale));u.uCenter.value=center;u.uTime.value=time;u.uDebug.value=debug;
    for(const key of ['inner','outer','temperature','luminosity','opacity','turbulence','rotation','doppler','redshift','starDensity','galaxy','holeScale','lensing','diskThickness','starBrightness','photonRing'])u['u'+key[0].toUpperCase()+key.slice(1)].value=params[key];
    u.uOuter.value=Math.max(params.outer,params.inner+.24);u.uShipView.value=ship?.enabled?1:0;
    u.uStep.value=(this.profile||QUALITY[this.quality]).step*params.stepScale;u.uMaxSteps.value=Math.round(params.integrationSteps);
    this.pass(this.ray,this.main);
    // Vessel mode is an unobstructed flight camera; only the exterior enters HDR/Bloom.
    if((debug===0 && params.bloom>0)||debug===9){
      let input=this.main;
      this.mips.forEach(({a,b},index)=>{
        this.down.uniforms.uInput.value=input.texture;this.down.uniforms.uTexel.value.set(1/input.width,1/input.height);this.down.uniforms.uThreshold.value=index===0?.85:0;
        this.pass(this.down,a);
        this.blur.uniforms.uInput.value=a.texture;this.blur.uniforms.uDirection.value.set(params.bloomRadius/a.width,0);this.pass(this.blur,b);
        this.blur.uniforms.uInput.value=b.texture;this.blur.uniforms.uDirection.value.set(0,params.bloomRadius/a.height);this.pass(this.blur,a);
        input=a;
      });
    }
    const c=this.composite.uniforms;c.uScene.value=this.main.texture;
    this.mips.forEach(({a},i)=>c['uBloom'+i].value=a.texture);
    for(const k of ['bloom','exposure','vignette','grain','chromatic'])c['u'+k[0].toUpperCase()+k.slice(1)].value=params[k];
    c.uTime.value=time;c.uDebug.value=debug;c.uCenter.value=center;
    this.pass(this.composite,null);
  }
  get info(){return {hdr:this.hdr,output:[this.width,this.height],integration:[this.main?.width,this.main?.height],quality:this.quality,mobileProfile:!!this.mobileProfile,adaptiveScale:this.dynamicScale,pixels:(this.main?.width||0)*(this.main?.height||0),step:this.ray.uniforms.uStep.value,maxSteps:this.ray.uniforms.uMaxSteps.value,webgl:this.renderer.getContext().getParameter(this.renderer.getContext().VERSION)};}
  dispose(){this.targets.forEach(t=>t.dispose());[this.ray,this.down,this.blur,this.composite].forEach(m=>m.dispose());this.geometry.dispose();this.renderer.dispose();}
}

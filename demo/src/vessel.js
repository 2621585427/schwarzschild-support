import * as THREE from 'three';
import {GLTFLoader} from '../vendor/GLTFLoader.js';

// Retained Blender-authored cockpit resource and optional render helper.
// The website uses an unobstructed flight camera and does not call this render pass.
export class Vessel {
  constructor(){
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(84,1,.02,30);
    this.scene.add(new THREE.HemisphereLight(0x8ca9bc,0x151318,2.0));
    const warm=new THREE.DirectionalLight(0xffb36a,3.8);warm.position.set(-2,4,-5);this.scene.add(warm);
    const cool=new THREE.PointLight(0x55b9d1,8,12);cool.position.set(0,.8,-.5);this.scene.add(cool);
    this.loaded=false;this.error=null;
    this.ready=new GLTFLoader().loadAsync(new URL('../assets/vessel/observation-vessel.glb',import.meta.url).href).then(gltf=>{
      this.model=gltf.scene;this.model.traverse(o=>{if(o.isMesh){o.frustumCulled=true;o.material.side=THREE.DoubleSide;}});this.scene.add(this.model);this.loaded=true;return this;
    }).catch(error=>{this.error=error.message;throw error;});
  }
  render(renderer,target,ship,time){
    if(!this.loaded)return;
    this.camera.aspect=target.width/target.height;this.camera.fov=ship.fov||84;this.camera.updateProjectionMatrix();
    this.camera.rotation.set(ship.pitch??ship.lookPitch,ship.yaw??ship.lookYaw,0,'YXZ');
    this.camera.position.set(0,0,0);
    renderer.setRenderTarget(target);renderer.clearDepth();renderer.render(this.scene,this.camera);
  }
  dispose(){this.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))m.dispose();}});}
}

import {t} from './i18n.js';
export class Intro {
  constructor(){this.active=false;this.started=0;this.elapsed=0;this.duration=15000;this.finished=0;this.element=document.getElementById('opening');document.getElementById('intro-skip').addEventListener('click',()=>this.skip());}
  play(){this.active=true;this.started=performance.now();this.elapsed=0;this.element.hidden=false;document.body.classList.add('intro-active');this.tick(this.started);return true;}
  skip(){this.active=false;this.finished=performance.now();this.element.hidden=true;document.body.classList.remove('intro-active');return true;}
  tick(now){if(!this.active)return;this.elapsed=Math.min(this.duration,now-this.started);const p=this.elapsed/this.duration;this.element.style.setProperty('--progress',p);document.getElementById('intro-progress').style.width=(p*100)+'%';document.getElementById('intro-elapsed').textContent='T+00:'+String((this.elapsed/1000).toFixed(1)).padStart(4,'0');const stages=['INITIALIZING OPTICAL PATH','CALIBRATING SCHWARZSCHILD METRIC','INTEGRATING NULL GEODESICS','ALIGNING PHOTON SPHERE','OBSERVATORY ONLINE'];document.getElementById('intro-status').textContent=t(stages[Math.min(4,Math.floor(p*5))]);if(p>=1)this.skip();}
}

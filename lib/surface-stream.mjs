import { patchKey,snappedSite,surfaceOffset } from './surface-world.mjs';

export class SurfaceStream {
  constructor({load,onPatch,onState=()=>{},now=()=>Date.now(),capacity=6}) {
    Object.assign(this,{load,onPatch,onState,now,capacity});
    this.cache=new Map();this.generation=0;this.current=null;this.pending=null;this.error=null;this.retryAt=0;this.paused=false;this.position=null;
  }
  reset(patch) {
    this.generation++;this.pending?.controller.abort();this.pending=null;this.error=null;this.retryAt=0;
    this.cache.clear();this.current=patch;this.position=patch?.site??null;
    if(patch) this.remember(patch);this.state();
  }
  remember(patch) {
    const key=patchKey(patch.site);this.cache.delete(key);this.cache.set(key,patch);
    while(this.cache.size>this.capacity) this.cache.delete(this.cache.keys().next().value);
  }
  state() {this.onState({loading:Boolean(this.pending),error:this.error});}
  adopt(patch) {this.current=patch;this.error=null;this.remember(patch);this.onPatch(patch);this.state();}
  update(position,{paused=false,force=false}={}) {
    this.position=position;this.paused=paused;
    if(!this.current||paused) return;
    const grid=this.current.grids[0],half=(grid.size-1)*grid.step/2;
    const offset=surfaceOffset(this.current.site,position),distance=Math.max(Math.abs(offset.east),Math.abs(offset.north));
    if(distance<half*.45&&!force) return;
    for(const patch of [...this.cache.values()].reverse()) {
      if(patch===this.current) continue;
      const p=surfaceOffset(patch.site,position),radius=(patch.grids[0].size-1)*patch.grids[0].step/2;
      if(Math.max(Math.abs(p.east),Math.abs(p.north))<radius*.3) {this.adopt(patch);return;}
    }
    if(this.pending||(!force&&this.now()<this.retryAt)) return;
    const target=snappedSite(position),controller=new AbortController(),generation=this.generation;
    this.pending={controller};this.error=null;this.state();
    this.pending.promise=Promise.resolve().then(()=>this.load(target,controller.signal)).then(patch=>{
      if(generation!==this.generation||controller.signal.aborted) return;
      this.remember(patch);
      const p=surfaceOffset(patch.site,this.position),radius=(patch.grids[0].size-1)*patch.grids[0].step/2;
      if(!this.paused&&Math.max(Math.abs(p.east),Math.abs(p.north))<radius*.7) this.adopt(patch);
    }).catch(error=>{
      if(generation===this.generation&&!controller.signal.aborted) {this.error=error;this.retryAt=this.now()+5000;}
    }).finally(()=>{if(generation===this.generation) {this.pending=null;this.state();}});
  }
  retry() {if(this.position) this.update(this.position,{paused:this.paused,force:true});}
  stop() {this.generation++;this.pending?.controller.abort();this.pending=null;this.state();}
}

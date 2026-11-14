import { lunarBasis,surfaceOffset } from './surface-world.mjs';
import { moonRadius } from './terrain-math.mjs';
const rad=Math.PI/180;
export const scatterCellCount=Math.ceil(2*moonRadius/64);

function cubeVector(face,u,v) {
  const a=face===0?[1,u,v]:face===1?[-1,u,v]:face===2?[u,1,v]:face===3?[u,-1,v]:face===4?[u,v,1]:[u,v,-1];
  const length=Math.hypot(...a);return a.map(n=>n/length);
}
function coordinates(vector) {return {lat:Math.atan2(vector[2],Math.hypot(vector[0],vector[1]))/rad,lon:Math.atan2(vector[1],vector[0])/rad};}
function address(vector) {
  const [x,y,z]=vector,m=Math.max(Math.abs(x),Math.abs(y),Math.abs(z));
  const face=m===Math.abs(x)?(x>=0?0:1):m===Math.abs(y)?(y>=0?2:3):(z>=0?4:5);
  const u=(face<2?y:x)/m,v=(face<4?z:y)/m;
  return {face,x:Math.max(0,Math.min(scatterCellCount-1,Math.floor((u+1)*.5*scatterCellCount))),y:Math.max(0,Math.min(scatterCellCount-1,Math.floor((v+1)*.5*scatterCellCount)))};
}
function center(cell,fx=.5,fy=.5) {return coordinates(cubeVector(cell.face,2*(cell.x+fx)/scatterCellCount-1,2*(cell.y+fy)/scatterCellCount-1));}
export const scatterKey=cell=>`${cell.face}:${cell.x}:${cell.y}`;
function seedFor(face,x,y,salt=0) {
  let h=Math.imul(face+17,73856093)^Math.imul(x+23,19349663)^Math.imul(y+41,83492791)^salt;
  h=Math.imul(h^(h>>>16),0x45d9f3b);return (h^(h>>>16))>>>0;
}
export function nearbyScatterCells(site,radius=240) {
  const home=address(lunarBasis(site).up),reach=Math.ceil(radius/20)+2,cells=new Map();
  for(let y=-reach;y<=reach;y++) for(let x=-reach;x<=reach;x++) {
    const projected=address(cubeVector(home.face,2*(home.x+x+.5)/scatterCellCount-1,2*(home.y+y+.5)/scatterCellCount-1));
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      const candidate={face:projected.face,x:projected.x+dx,y:projected.y+dy};
      if(candidate.x<0||candidate.y<0||candidate.x>=scatterCellCount||candidate.y>=scatterCellCount) continue;
      const key=scatterKey(candidate);if(cells.has(key)) continue;
      const p=surfaceOffset(site,center(candidate));
      if(Math.hypot(p.east,p.north)<radius+70) cells.set(key,candidate);
    }
  }
  return [...cells.values()];
}
export function scatterCell(cell) {
  let seed=seedFor(cell.face,cell.x,cell.y);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const region=seedFor(cell.face,Math.floor(cell.x/12),Math.floor(cell.y/12))/4294967296;
  const u=2*(cell.x+.5)/scatterCellCount-1,v=2*(cell.y+.5)/scatterCellCount-1;
  const density=(.18+region*1.4)/Math.pow(1+u*u+v*v,1.5),result=[];
  const counts={pebble:Math.floor((200+random()*250)*density),rock:Math.floor((24+random()*36)*density),boulder:random()<.65*density?1:0,mark:random()<density*.6?1:0};
  for(const [kind,count] of Object.entries(counts)) for(let i=0;i<count;i++) {
    const point=center(cell,random(),random());
    const radius=kind==='pebble'?.012+random()*.045:kind==='rock'?.06+Math.pow(random(),2)*.22:kind==='boulder'?.5+random()*1.1:.25+random()*.9;
    result.push({id:`${scatterKey(cell)}:${kind}:${i}`,kind,...point,radius,stretch:.8+random()*.65,angle:random()*Math.PI*2,tilt:(random()-.5)*.8,color:.65+random()*.35});
  }
  return result;
}

import { fromCustomClient } from 'geotiff';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AnalysisError } from './horizons.mjs';
import { clearanceSamples, destination, moonRadius, terrainAngle } from './terrain-math.mjs';
import { intersect, visibleWindows } from './windows.mjs';
import { terrainTimeoutMs } from './config.mjs';

const cache = resolve('data/cache/terrain-v1');
const rad = Math.PI/180;
const sources = {
  south: { id:'south', name:'LOLA south polar DEM · Barker et al. (2023)', url:'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF', citation:'https://pgda.gsfc.nasa.gov/products/90', projection:'south', scale:1, gridMeters:20 },
  north: { id:'north', name:'LOLA north polar DEM · NASA GSFC', url:'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp_NP/LDEM_80N_20MPP_ADJ.TIF', citation:'https://pgda.gsfc.nasa.gov/products/98', projection:'north', scale:1, gridMeters:20 },
  global: { id:'global', name:'LOLA global 64 ppd · Ohio University tiled distribution', url:'https://www.its.ohio.edu/foundations/lunar/dem/lola-global-64ppd.tif', citation:'https://www.its.ohio.edu/foundations/lunar/docs.html', projection:'lonlat', scale:.5, gridMeters:Math.PI*moonRadius/180/64 },
  globalFine: {id:'globalFine',name:'LRO LOLA global 256 ppd · USGS (2014)',url:'https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif',citation:'https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m',projection:'eqc',scale:.5,gridMeters:118.4505876},
};
const datasets = new Map(), jobs = new Map();
let active=0;
const waiting=[];
async function limited(work) {
  if(active>=6) await new Promise(resolve=>waiting.push(resolve));
  active++;
  try {return await work();} finally {active--; waiting.shift()?.();}
}
const hash = text=>createHash('sha256').update(text).digest('hex');
async function save(path,value) {
  await mkdir(cache,{recursive:true});
  const temporary=`${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify(value));
  await rename(temporary,path);
}

// Persist byte ranges, never download an entire multi-GB raster. No API key.
function rangeClient(url) {
  return { url, async request({headers}) {
    const range=headers.Range, path=resolve(cache,hash(url+range)+'.range');
    let record;
    try {record=JSON.parse(await readFile(path,'utf8'));} catch(error) {if(error.code!=='ENOENT'&&!(error instanceof SyntaxError)) throw error;}
    if(!record) {
      record=await limited(async()=>{
        const reply=await fetch(url,{headers,signal:AbortSignal.timeout(terrainTimeoutMs)});
        if(reply.status!==206) {await reply.body?.cancel();throw new Error(`DEM requires HTTP Range: ${reply.status}`);}
        const bytes=Buffer.from(await reply.arrayBuffer());
        if(bytes.length>8_000_000) throw new Error('Oversized DEM range');
        const value={contentRange:reply.headers.get('content-range'),data:bytes.toString('base64')};
        await save(path,value);
        return value;
      });
    }
    const bytes=Buffer.from(record.data,'base64');
    return {ok:true,status:206,getHeader:key=>key.toLowerCase()==='content-range'?record.contentRange:'application/octet-stream',getData:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }};
}

async function dataset(source) {
  if(!datasets.has(source.id)) datasets.set(source.id,(async()=>{
    const tiff=await fromCustomClient(rangeClient(source.url),{allowFullFile:false,blockSize:65536,cacheSize:100});
    const images=[];
    for(let i=0;i<await tiff.getImageCount();i++) {
      const image=await tiff.getImage(i);
      images.push({image,origin:i?images[0].origin:image.getOrigin(),resolution:image.getResolution(i?images[0].image:undefined),tiles:new Map(),level:i});
    }
    return images;
  })().catch(error=>{datasets.delete(source.id);throw error;}));
  return datasets.get(source.id);
}

function project(point, source) {
  if(source.projection==='lonlat') return [(point.lon+360)%360,point.lat];
  if(source.projection==='eqc') return [point.lon*rad*moonRadius,point.lat*rad*moonRadius];
  const rho=2*moonRadius*Math.tan((90-Math.abs(point.lat))*rad/2);
  return [rho*Math.sin(point.lon*rad),rho*Math.cos(point.lon*rad)*(source.projection==='north'?-1:1)];
}

function sourceFor(point,spacing=0) {return point.lat<=-80.05?sources.south:point.lat>=80.05?sources.north:spacing>=200?sources.global:sources.globalFine;}

async function elevations(points, spacing) {
  const grouped=new Map();
  for(let i=0;i<points.length;i++) {
    const source=sourceFor(points[i],spacing);
    if(!grouped.has(source.id)) grouped.set(source.id,{source,points:[]});
    grouped.get(source.id).points.push([i,points[i]]);
  }
  const output=new Float32Array(points.length);
  for(const {source,points:list} of grouped.values()) {
    const images=await dataset(source);
    const level=Math.min(images.length-1,Math.max(0,Math.floor(Math.log2(spacing/source.gridMeters))));
    const entry=images[level], {image,origin,resolution,tiles}=entry;
    const width=image.getWidth(), height=image.getHeight(), tw=image.getTileWidth(), th=image.getTileHeight();
    const needs=new Map(), samples=[];
    for(const [index,point] of list) {
      const [x,y]=project(point,source);
      const px=(x-origin[0])/resolution[0]-.5, py=(y-origin[1])/resolution[1]-.5;
      const ix=Math.floor(px), iy=Math.floor(py), ax=px-ix, ay=py-iy;
      const cells=[];
      for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) {
        const cx=['lonlat','eqc'].includes(source.projection)?((ix+dx)%width+width)%width:Math.max(0,Math.min(width-1,ix+dx));
        const cy=Math.max(0,Math.min(height-1,iy+dy));
        const tx=Math.floor(cx/tw), ty=Math.floor(cy/th), key=tx+','+ty;
        needs.set(key,[tx,ty]);
        cells.push({key,offset:(cy-ty*th)*Math.min(tw,width-tx*tw)+cx-tx*tw,weight:(dx?ax:1-ax)*(dy?ay:1-ay)});
      }
      samples.push({index,cells});
    }
    const loaded=new Map();
    await Promise.all([...needs].map(async([key,[tx,ty]])=>{
      if(!tiles.has(key)) {
        const work=image.readRasters({window:[tx*tw,ty*th,Math.min(width,(tx+1)*tw),Math.min(height,(ty+1)*th)],samples:[0]}).then(a=>a[0]).catch(error=>{tiles.delete(key);throw error;});
        tiles.set(key,work);
      }
      loaded.set(key,await tiles.get(key));
    }));
    for(const {index,cells} of samples) {
      let value=0;
      for(const cell of cells) {
        const h=loaded.get(cell.key)[cell.offset];
        if(!Number.isFinite(h)||h===image.getGDALNoData()||Math.abs(h*source.scale)>15000) throw new Error('DEM contains missing heights');
        value+=h*source.scale*cell.weight;
      }
      output[index]=value;
    }
    // Bound the decoded cache; disk byte ranges remain available for revisits.
    while(tiles.size>180) tiles.delete(tiles.keys().next().value);
  }
  return output;
}

async function grid(site, size, step, sampleSpacing=step) {
  const points=[];
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) points.push(destination(site,(x-(size-1)/2)*step,((size-1)/2-y)*step));
  return {size,step,heights:Array.from(await elevations(points,sampleSpacing))};
}

async function buildTerrain(site, receiverHeight) {
  const source=sourceFor(site), base=source.gridMeters;
  const center=(await elevations([site],base))[0];
  const nearStep=Math.max(20,base/2);
  const grids=[];
  grids.push(await grid(site,129,nearStep,base));
  grids.push(await grid(site,129,Math.max(256,nearStep*4)));
  grids.push(await grid(site,257,1600));
  const count=720, horizon=Array(count).fill(-90), distances=Array(count).fill(0);
  const observer=center+receiverHeight;
  for(const [start,end,step] of [[Math.max(10,base/2),3000,Math.max(10,base/2)],[3000,30000,source.id==='globalFine'?sources.global.gridMeters:160],[30000,200000,1000]]) {
    const points=[], rays=[];
    for(let d=start;d<=end;d+=step) for(let az=0;az<count;az++) {
      points.push(destination(site,d*Math.sin(az/count*2*Math.PI),d*Math.cos(az/count*2*Math.PI)));
      rays.push([az,d]);
    }
    const heights=await elevations(points,step);
    for(let i=0;i<heights.length;i++) {
      const [az,d]=rays[i], angle=terrainAngle(d,heights[i],observer);
      if(angle>horizon[az]) {horizon[az]=angle;distances[az]=d;}
    }
  }
  return {site:{lat:site.lat,lon:site.lon,elevationMeters:center},receiverHeight,grids,horizon,horizonDistances:distances,
    quality:{gridMeters:base,horizonAzimuthStep:.5,maxDistanceMeters:200000,frame:'MOON_ME / DE421',referenceRadiusMeters:moonRadius,approximate:true},
    sources:[source,sources.global].filter((s,i,a)=>a.findIndex(t=>t.id===s.id)===i).map(({name,url,citation,gridMeters})=>({name,url,citation,gridMeters})),createdUtc:new Date().toISOString()};
}

export async function getTerrain(site, receiverHeight=2) {
  if(!Number.isFinite(receiverHeight)||receiverHeight<0||receiverHeight>100) throw new AnalysisError('receiverHeight',400);
  const key=`v2:${site.lat},${site.lon},${receiverHeight}`, path=resolve(cache,hash(key)+'.json');
  try {return JSON.parse(await readFile(path,'utf8'));} catch(error) {if(error.code!=='ENOENT'&&!(error instanceof SyntaxError)) throw error;}
  if(jobs.has(key)) return jobs.get(key);
  if(jobs.size>=2) throw new AnalysisError('terrainBusy',429);
  const work=buildTerrain(site,receiverHeight).then(async value=>{
    await save(path,value);return value;
  }).catch(error=>{console.error('Terrain:',error.message);throw new AnalysisError('terrainUnavailable',503);}).finally(()=>jobs.delete(key));
  jobs.set(key,work);
  return work;
}

export function applyTerrain(analysis, terrain) {
  const samples=clearanceSamples(analysis.samples,terrain.horizon);
  const windows={sun:visibleWindows(samples,'sunClearance'),earth:visibleWindows(samples,'earthClearance')};
  windows.both=intersect(windows.sun,windows.earth);
  const durations=windows.both.map(w=>w.end-w.start);
  return {...analysis,windows,terrain:{...terrain,grids:undefined,horizonDistances:undefined},
    summary:{longestMs:Math.max(0,...durations),totalMs:durations.reduce((a,b)=>a+b,0)},
    model:{centers:true,terrain:true,receiverHeight:terrain.receiverHeight,horizonDeg:null}};
}

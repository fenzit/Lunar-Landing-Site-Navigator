import { destination,moonRadius } from './terrain-math.mjs';
const rad=Math.PI/180;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

export function lunarBasis(site) {
  const p=site.lat*rad,l=site.lon*rad;
  return {up:[Math.cos(p)*Math.cos(l),Math.cos(p)*Math.sin(l),Math.sin(p)],east:[-Math.sin(l),Math.cos(l),0],north:[-Math.sin(p)*Math.cos(l),-Math.sin(p)*Math.sin(l),Math.cos(p)]};
}

// The logarithmic map is the inverse of destination(), including both poles.
export function surfaceOffset(origin,point) {
  const a=lunarBasis(origin),b=lunarBasis(point).up;
  const e=dot(a.east,b),n=dot(a.north,b),u=dot(a.up,b),s=Math.hypot(e,n);
  if(s<1e-14) return {east:0,north:u<0?Math.PI*moonRadius:0};
  const scale=moonRadius*Math.atan2(s,u)/s;
  return {east:e*scale,north:n*scale};
}

export function changeDirection(azimuth,elevation,from,to) {
  const a=lunarBasis(from),b=lunarBasis(to),az=azimuth*rad,el=elevation*rad;
  const vector=a.up.map((v,i)=>v*Math.sin(el)+(a.east[i]*Math.sin(az)+a.north[i]*Math.cos(az))*Math.cos(el));
  return {azimuth:(Math.atan2(dot(b.east,vector),dot(b.north,vector))/rad+360)%360,elevation:Math.asin(Math.max(-1,Math.min(1,dot(b.up,vector))))/rad};
}

export function frameHeight(height,distance,referenceHeight) {
  return (moonRadius+height)*Math.cos(distance/moonRadius)-(moonRadius+referenceHeight);
}

export function walkingCoordinates(frame,position) {return destination(frame,position.x,-position.z);}
export function patchKey(site) {return `${site.lat.toFixed(6)},${site.lon.toFixed(6)}`;}
export function snappedSite(site) {
  const lat=Math.max(-90,Math.min(90,Math.round(site.lat/ .005)*.005));
  return {lat:Number(lat.toFixed(6)),lon:Number((((Math.round(site.lon/.005)*.005+540)%360)-180).toFixed(6))};
}

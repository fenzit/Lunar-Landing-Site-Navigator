// Lunar DEM heights are metres above the 1,737,400 m reference sphere.
export const moonRadius = 1_737_400;
const rad = Math.PI / 180;

export function destination(site, east, north) {
  const distance = Math.hypot(east, north), a = distance / moonRadius;
  if(!distance) return {...site};
  const p=site.lat*rad,l=site.lon*rad, e=east/distance,n=north/distance;
  const x=Math.cos(p)*Math.cos(l)*Math.cos(a)+(-Math.sin(l)*e-Math.sin(p)*Math.cos(l)*n)*Math.sin(a);
  const y=Math.cos(p)*Math.sin(l)*Math.cos(a)+(Math.cos(l)*e-Math.sin(p)*Math.sin(l)*n)*Math.sin(a);
  const z=Math.sin(p)*Math.cos(a)+Math.cos(p)*n*Math.sin(a);
  return {lat:Math.atan2(z,Math.hypot(x,y))/rad,lon:((Math.atan2(y,x)/rad+540)%360)-180};
}

export function terrainAngle(distance, elevation, observerElevation) {
  const angle = distance / moonRadius, r = moonRadius + elevation;
  return Math.atan2(r*Math.cos(angle) - (moonRadius+observerElevation), r*Math.sin(angle)) / rad;
}

export function horizonAt(profile, azimuth) {
  const x = ((azimuth%360)+360)%360 / 360 * profile.length;
  const i = Math.floor(x), f = x-i;
  return profile[i%profile.length]*(1-f) + profile[(i+1)%profile.length]*f;
}

export function elevationClearance(elevation, azimuth, profile) {
  return elevation - (profile ? horizonAt(profile, azimuth) : 0);
}

export function gridHeight(grid, east, north) {
  const { size, step, heights } = grid;
  const x = east/step + (size-1)/2, y = (size-1)/2 - north/step;
  if (x<0 || y<0 || x>size-1 || y>size-1) return null;
  const i = Math.min(size-2, Math.floor(x)), j = Math.min(size-2, Math.floor(y));
  const a = x-i, b = y-j;
  // Match the two rendered triangles, so the walking camera stays on the mesh.
  const nw=heights[j*size+i],ne=heights[j*size+i+1],sw=heights[(j+1)*size+i],se=heights[(j+1)*size+i+1];
  return a+b<=1?nw+(ne-nw)*a+(sw-nw)*b:se+(sw-se)*(1-a)+(ne-se)*(1-b);
}

// Find a real DEM vantage above a nearby depression. This only moves the
// camera; it never changes either the terrain or the analysis coordinates.
export function terrainLookout(grid) {
  const center=(grid.size-1)/2,margin=Math.ceil(grid.size*.1);
  let best=null;
  for(let y=margin;y<grid.size-margin;y+=4) for(let x=margin;x<grid.size-margin;x+=4) {
    const east=(x-center)*grid.step,north=(center-y)*grid.step;
    const height=grid.heights[y*grid.size+x];
    for(const distance of [Math.max(200,grid.step*6),Math.max(500,grid.step*10)]) for(let az=0;az<360;az+=45) {
      const lower=gridHeight(grid,east+Math.sin(az*rad)*distance,north+Math.cos(az*rad)*distance);
      if(lower===null) continue;
      const drop=height-lower,score=drop/Math.sqrt(distance);
      if(drop>5&&(!best||score>best.score)) best={east,north,azimuth:az,pitch:-Math.max(3,Math.min(18,Math.atan2(drop,distance)/rad*.6)),drop,score};
    }
  }
  return best;
}

// Piecewise linear ephemerides are subdivided at every crossed horizon azimuth
// bin, including the seam at north. A narrow ridge cannot disappear merely
// because it lies between two 30-minute Horizons samples.
export function clearanceSamples(samples, profile) {
  const result = [];
  const n = profile.length, bin = 360/n;
  const add = (a,b,f) => {
    const s = { t: a.t+(b.t-a.t)*f };
    for (const body of ['sun','earth']) {
      const delta = ((b[body+'Az']-a[body+'Az']+540)%360)-180;
      s[body+'Az'] = (a[body+'Az']+delta*f+360)%360;
      s[body+'El'] = a[body+'El']+(b[body+'El']-a[body+'El'])*f;
      s[body+'Clearance'] = elevationClearance(s[body+'El'], s[body+'Az'], profile);
    }
    result.push(s);
  };
  for(let i=1;i<samples.length;i++) {
    const a=samples[i-1], b=samples[i], fractions=new Set([0]);
    for(const body of ['sun','earth']) {
      const start=a[body+'Az'], d=((b[body+'Az']-start+540)%360)-180;
      if(!d) continue;
      const lo=Math.min(start,start+d), hi=Math.max(start,start+d);
      for(let k=Math.floor(lo/bin)+1;k*bin<hi;k++) fractions.add((k*bin-start)/d);
    }
    for(const f of [...fractions].sort((a,b)=>a-b)) add(a,b,f);
  }
  add(samples.at(-2),samples.at(-1),1);
  return result;
}

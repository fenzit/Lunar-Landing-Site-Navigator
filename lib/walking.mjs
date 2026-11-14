export function moveWalker(position,dx,dz,limit,obstacles=[]) {
  const clamp=n=>Math.max(-limit,Math.min(limit,n));
  let x=position.x,z=position.z,vx=clamp(x+dx)-x,vz=clamp(z+dz)-z;
  const margin=.24,epsilon=.0001;
  for(const obstacle of obstacles) {
    const ox=x-obstacle.x,oz=z-obstacle.z,d=Math.hypot(ox,oz),r=obstacle.radius+margin;
    if(d<r) {x=obstacle.x+(d?ox/d:1)*(r+epsilon);z=obstacle.z+(d?oz/d:0)*(r+epsilon);}
  }
  for(let iteration=0;iteration<4;iteration++) {
    const length2=vx*vx+vz*vz;if(length2<1e-12) break;
    let first=1,hit=null;
    for(const obstacle of obstacles) {
      const ox=x-obstacle.x,oz=z-obstacle.z,r=obstacle.radius+margin;
      const b=ox*vx+oz*vz,c=ox*ox+oz*oz-r*r,discriminant=b*b-length2*c;
      if(b>=0||discriminant<0) continue;
      const t=(-b-Math.sqrt(discriminant))/length2;
      if(t>=0&&t<first) {first=t;hit=obstacle;}
    }
    const fraction=hit?Math.max(0,first-epsilon/Math.sqrt(length2)):1;
    x+=vx*fraction;z+=vz*fraction;
    if(!hit) break;
    vx*=1-fraction;vz*=1-fraction;
    const distance=Math.hypot(x-hit.x,z-hit.z),nx=(x-hit.x)/distance,nz=(z-hit.z)/distance;
    const inward=vx*nx+vz*nz;
    if(inward<0) {vx-=inward*nx;vz-=inward*nz;}
  }
  return {x:clamp(x),z:clamp(z)};
}

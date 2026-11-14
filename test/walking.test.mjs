import test from 'node:test';
import assert from 'node:assert/strict';
import { moveWalker } from '../lib/walking.mjs';

test('walking towards the lander stops outside its hull and permits backing away',()=>{
  const obstacles=[{x:0,z:-8,radius:1}];let position={x:0,z:0};
  for(let i=0;i<80;i++) position=moveWalker(position,0,-.16,100,obstacles);
  assert.ok(position.z>-7,'camera must stop on the near side, not pass through the hull');
  assert.ok(Math.hypot(position.x,position.z+8)>=1.2);
  const back=moveWalker(position,0,.2,100,obstacles);assert.ok(back.z>position.z);
});
test('a fast movement cannot tunnel through a small landing pad',()=>{
  const p=moveWalker({x:0,z:0},0,-10,100,[{x:0,z:-3,radius:.32}]);
  assert.ok(p.z>-3);
});

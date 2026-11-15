import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {moonDirection} from '../lib/geography.mjs';
import {overviewPositions,overviewDistances} from '../public/overview-orbits.mjs';

test('solar overview fixes the Sun while preserving Moon-relative JPL directions',()=>{
  const sky={sunLat:-1.4,sunLon:82,earthLat:6.1,earthLon:-5};
  let previousMoon;
  for(const rotation of [0,.7,2.4]){
    const pose=overviewPositions(sky,rotation),moon=new THREE.Vector3(...pose.moon);
    assert.deepEqual(pose.sun,[0,0,0]);
    assert.ok(Math.abs(moon.length()-overviewDistances.sun)<1e-10);
    if(previousMoon)assert.ok(moon.distanceTo(previousMoon)>1,'Moon must move around the fixed Sun');
    previousMoon=moon;
    const inverse=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-rotation);
    for(const body of ['sun','earth']){
      const direction=new THREE.Vector3(...pose[body]).sub(moon);
      assert.ok(Math.abs(direction.length()-overviewDistances[body])<1e-10);
      direction.applyQuaternion(inverse).normalize();
      assert.ok(direction.distanceTo(new THREE.Vector3(...moonDirection(sky[`${body}Lat`],sky[`${body}Lon`])))<1e-10,'Visible direction must still match JPL in the lunar frame');
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimelinePlayback} from '../public/timeline-playback.mjs';
import {presetManifest,presetSky} from '../lib/preset-bundle.mjs';
import {skyAtTime,minute} from '../lib/windows.mjs';
import {overviewPositions} from '../public/overview-orbits.mjs';

test('annual local playback stays continuous across normal frames and a delayed frame',async()=>{
  const m=await presetManifest(),start=m.coverage.start,end=m.coverage.end;
  const sky=await presetSky({start,end,step:30}),total=(end-start)/minute;
  const playback=createTimelinePlayback(0,total,0);
  const position=index=>overviewPositions(skyAtTime(sky.samples,start+index*minute,30*minute),0).earth;
  let previous=position(0),now=0,last;
  for(let i=0;i<120;i++){
    now+=i===60?5000:1000/60;
    last=playback(now);
    const current=position(last.minuteIndex);
    assert.ok(Math.hypot(...current.map((value,j)=>value-previous[j]))<2,'One frame must not teleport the annual scenario across its orbit');
    previous=current;
  }
  assert.ok(last.fraction<1,'A stalled frame must not complete playback');
  for(let i=0;i<12000&&last.fraction<1;i++)last=playback(now+=1000/60);
  assert.equal(last.minuteIndex,total,'Playback must still reach the exact range end');
});

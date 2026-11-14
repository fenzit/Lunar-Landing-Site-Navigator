// GeoTIFF can merge many neighbouring strips into one very large request.
// Bound the upstream requests without changing the range seen by the decoder.
export function rangeContentError(range,contentRange,data) {
  const expected=/^bytes=(\d+)-(\d+)$/.exec(range),actual=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange??'');
  if(!expected||!actual||+actual[1]!==+expected[1]||+actual[2]!==Math.min(+expected[2],+actual[3]-1)) return 'DEM Content-Range mismatch';
  if(data.byteLength!==+actual[2]-+actual[1]+1) return 'Incomplete DEM range';
  return null;
}

export async function boundedRangeRequest(range, request, maximumBytes=4*1024*1024) {
  const match=/^bytes=(\d+)-(\d+)$/.exec(range);
  if(!match) throw new Error('Expected one explicit byte range');
  const start=Number(match[1]),end=Number(match[2]);
  if(end<start||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||!Number.isSafeInteger(maximumBytes)||maximumBytes<1) throw new Error('Invalid byte range');
  async function part(a,b) {
    const response=await request(`bytes=${a}-${b}`);
    const data=await response.getData();
    const error=rangeContentError(`bytes=${a}-${b}`,response.getHeader('content-range'),data);
    if(error) throw new Error(error);
    const header=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.getHeader('content-range'));
    return {data,total:+header[3],end:+header[2]};
  }
  const work=[];
  for(let offset=start;offset<=end;offset+=maximumBytes) work.push(part(offset,Math.min(end,offset+maximumBytes-1)));
  const chunks=await Promise.all(work),total=chunks[0].total;
  if(chunks.some(chunk=>chunk.total!==total)) throw new Error('Inconsistent DEM file size');
  if(chunks.length===1) return {ok:true,status:206,getHeader:key=>key.toLowerCase()==='content-range'?`bytes ${start}-${chunks[0].end}/${total}`:'application/octet-stream',getData:async()=>chunks[0].data};
  const length=chunks.reduce((sum,chunk)=>sum+chunk.data.byteLength,0),data=new Uint8Array(length);
  let offset=0;
  for(const chunk of chunks) {data.set(new Uint8Array(chunk.data),offset);offset+=chunk.data.byteLength;}
  return {ok:true,status:206,getHeader:key=>key.toLowerCase()==='content-range'?`bytes ${start}-${start+length-1}/${total}`:'application/octet-stream',getData:async()=>data.buffer};
}

// GeoTIFF can merge many neighbouring strips into one very large request.
// Bound the upstream requests without changing the range seen by the decoder.
export async function boundedRangeRequest(range, request, maximumBytes=4*1024*1024) {
  const match=/^bytes=(\d+)-(\d+)$/.exec(range);
  if(!match) throw new Error('Expected one explicit byte range');
  const start=Number(match[1]),end=Number(match[2]);
  if(end<start) throw new Error('Invalid byte range');
  if(end-start+1<=maximumBytes) return request(range);
  const work=[];
  for(let offset=start;offset<=end;offset+=maximumBytes) work.push(request(`bytes=${offset}-${Math.min(end,offset+maximumBytes-1)}`));
  const responses=await Promise.all(work);
  const chunks=await Promise.all(responses.map(response=>response.getData()));
  const length=chunks.reduce((total,chunk)=>total+chunk.byteLength,0),data=new Uint8Array(length);
  let offset=0;
  for(const chunk of chunks) {data.set(new Uint8Array(chunk),offset);offset+=chunk.byteLength;}
  const total=responses.at(-1).getHeader('content-range').split('/').at(-1);
  return {ok:true,status:206,getHeader:key=>key.toLowerCase()==='content-range'?`bytes ${start}-${start+length-1}/${total}`:'application/octet-stream',getData:async()=>data.buffer};
}

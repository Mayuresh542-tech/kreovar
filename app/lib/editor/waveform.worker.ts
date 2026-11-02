// Native audio decoding happens asynchronously; peak extraction runs off the UI thread.
self.onmessage=(event:MessageEvent<{channels:Float32Array[];bins:number}>)=>{
  const {channels,bins}=event.data,length=channels[0]?.length||0,step=Math.max(1,Math.ceil(length/bins)),peaks:number[]=[];
  for(let i=0;i<bins;i++){let peak=0;for(const channel of channels)for(let j=i*step;j<Math.min(length,(i+1)*step);j++)peak=Math.max(peak,Math.abs(channel[j]));peaks.push(peak);}
  self.postMessage(peaks);
};
export {};

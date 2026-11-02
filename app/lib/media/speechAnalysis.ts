export function speechAnalysis(data: {transcript?: unknown; words?: unknown}) {
  if(typeof data.transcript !== "string" || !data.transcript.trim()) throw new Error("No speech was found in this footage.");
  const words=Array.isArray(data.words)?data.words.filter((w):w is {start:number;end:number}=>w && Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.start>=0&&w.end>w.start).sort((a,b)=>a.start-b.start):[];
  const silenceIntervals:{start:number;end:number;duration:number}[]=[];
  let end=words[0]?.end || 0;
  for(const word of words.slice(1)) { if(word.start-end>=.6) silenceIntervals.push({start:end,end:word.start,duration:word.start-end}); end=Math.max(end,word.end); }
  return {transcript:data.transcript.trim(),analyzed:true,silenceIntervals,...(words.length?{silenceCount:silenceIntervals.length}:{})};
}

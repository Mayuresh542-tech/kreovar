
export interface TextGradient {angle:number;stops:{offset:number;color:string}[]}
export const TEXT_GRADIENTS=[
 {id:'sunset',name:'Sunset',angle:0,stops:[{offset:0,color:'#ff5f6d'},{offset:1,color:'#ffc371'}]},
 {id:'aurora',name:'Aurora',angle:0,stops:[{offset:0,color:'#a78bfa'},{offset:1,color:'#22d3ee'}]},
 {id:'ocean',name:'Ocean',angle:90,stops:[{offset:0,color:'#38bdf8'},{offset:1,color:'#2563eb'}]},
 {id:'gold',name:'Gold',angle:90,stops:[{offset:0,color:'#fff1a8'},{offset:1,color:'#f59e0b'}]}
] satisfies (TextGradient&{id:string;name:string})[];
export function readTextGradient(value:unknown):TextGradient|null{
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose a valid text gradient.');
 const g=value as Record<string,unknown>;
 if(typeof g.angle!=='number'||!Number.isFinite(g.angle)||g.angle<0||g.angle>360||!Array.isArray(g.stops)||g.stops.length<2||g.stops.length>5)throw Error('Gradient needs 2–5 colours and an angle from 0 to 360.');
 const stops=g.stops.map((item:unknown)=>{if(!item||typeof item!=='object')throw Error('Invalid gradient colour.');const s=item as Record<string,unknown>;if(typeof s.offset!=='number'||!Number.isFinite(s.offset)||s.offset<0||s.offset>1||typeof s.color!=='string'||!/^#[0-9a-f]{6}$/i.test(s.color))throw Error('Invalid gradient colour or position.');return {offset:s.offset,color:s.color};});
 if(stops[0].offset!==0||stops.at(-1)!.offset!==1||stops.some((s,i)=>i>0&&s.offset<=stops[i-1].offset))throw Error('Gradient colours must run in order from 0 to 1.');
 return {angle:g.angle,stops};
}
export function textFill(ctx:CanvasRenderingContext2D,gradient:TextGradient|null|undefined,color:string,width:number,height:number,centerX=0):string|CanvasGradient{
 if(!gradient)return color;
 const angle=gradient.angle*Math.PI/180,x=Math.cos(angle),y=Math.sin(angle),length=Math.abs(width*x)+Math.abs(height*y);
 const fill=ctx.createLinearGradient(centerX-x*length/2,-y*length/2,centerX+x*length/2,y*length/2);
 for(const stop of gradient.stops)fill.addColorStop(stop.offset,stop.color);
 return fill;
}

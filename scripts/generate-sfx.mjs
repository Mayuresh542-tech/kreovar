import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),rate=44100;
export const effects=[['soft-whoosh','Soft whoosh','Transitions',.8,'noise'],['fast-swish','Fast swish','Transitions',.35,'noise'],['cinematic-rise','Cinematic rise','Transitions',1.8,'rise'],['low-impact','Low impact','Impacts',.7,'kick'],['sub-drop','Sub drop','Impacts',1.2,'kick'],['digital-pop','Digital pop','UI',.15,'pop'],['soft-click','Soft click','UI',.08,'pop'],['notification','Notification','UI',.6,'chime'],['success-chime','Success chime','UI',1,'chime'],['sparkle','Sparkle','Accents',1.1,'sparkle'],['glitch','Digital glitch','Accents',.4,'glitch'],['ticking','Clock ticks','Accents',1,'ticks']];
export function synthesize(index,duration,kind){const count=Math.round(duration*rate),buffer=Buffer.alloc(44+count*2);buffer.write('RIFF');buffer.writeUInt32LE(36+count*2,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);let seed=137+index,phase=0,filtered=0;
for(let n=0;n<count;n++){const t=n/rate,x=t/duration;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;let v=0;
if(kind==='noise'){filtered=.85*filtered+.15*noise;v=filtered*Math.sin(Math.PI*x)*1.2;}
if(kind==='rise'){phase+=2*Math.PI*(100+1800*x*x)/rate;v=(.3*Math.sin(phase)+noise*.15)*x*Math.sin(Math.PI*x);}
if(kind==='kick'){phase+=2*Math.PI*(38+110*Math.exp(-12*t))/rate;v=Math.sin(phase)*Math.exp(-5*t)+noise*.07*Math.exp(-20*t);}
if(kind==='pop')v=Math.sin(2*Math.PI*(index===6?1500:550)*t)*Math.exp(-50*t)+noise*.12*Math.exp(-70*t);
if(kind==='chime')v=(Math.sin(2*Math.PI*660*t)+.5*Math.sin(2*Math.PI*990*t)+.2*Math.sin(2*Math.PI*1320*t))*Math.exp(-5*t)*.35;
if(kind==='sparkle')v=(Math.sin(2*Math.PI*(1200+300*Math.floor(t*8))*t)+.3*Math.sin(2*Math.PI*2200*t))*Math.exp(-3*t)*.3;
if(kind==='glitch')v=(noise*.3+Math.sign(Math.sin(2*Math.PI*(200+Math.floor(t*20)*37)*t))*.15)*(Math.floor(t*30)%3?1:0);
if(kind==='ticks'){const local=t%.25;v=(noise*.25+Math.sin(2*Math.PI*1400*local)*.3)*Math.exp(-130*local);}
const edge=Math.min(1,t/.005,(duration-t)/.01);buffer.writeInt16LE(Math.round(Math.max(-.85,Math.min(.85,v*edge)) *32767),44+n*2);}return buffer;}
if(process.argv[1]===fileURLToPath(import.meta.url)){const dir=path.join(root,'public/sfx');fs.mkdirSync(dir,{recursive:true});effects.forEach(([id,, ,duration,kind],index)=>fs.writeFileSync(path.join(dir,id+'.wav'),synthesize(index,duration,kind)));console.log('Generated 12 original PCM WAV effects.');}

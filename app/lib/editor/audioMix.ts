import {clamp,type Clip,type EditorProject,type AudioRole} from './model';
import {audioRole,smartClipGain,calculateDuckingGain,buildFfmpegDuckingFilter,DEFAULT_DUCKING_CONFIG,type DuckingConfig} from './audioDucking';

export {audioRole,smartClipGain,calculateDuckingGain,buildFfmpegDuckingFilter,DEFAULT_DUCKING_CONFIG,type DuckingConfig};
const speechWindowsCache = new WeakMap<
  EditorProject,
  {
    revision: number;
    clipsRef: EditorProject['clips'];
    captionsRef: EditorProject['captions'];
    tracksRef: EditorProject['tracks'];
    trackSig: string;
    audioDucking: boolean | undefined;
    clipCount: number;
    captionCount: number;
    windows: { start: number; end: number }[];
  }
>();

function keyCount(obj: Record<string, unknown>): number {
  let count = 0;
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) count++;
  }
  return count;
}

function trackFlagsSignature(tracks: EditorProject['tracks']): string {
  let sig = '';
  for (const id in tracks) {
    const t = tracks[id];
    sig += `${id}:${t.hidden ? 1 : 0}${t.muted ? 1 : 0};`;
  }
  return sig;
}

export function speechWindows(p: EditorProject): { start: number; end: number }[] {
  const clipCount = keyCount(p.clips);
  const captionCount = keyCount(p.captions);
  const trackSig = trackFlagsSignature(p.tracks);
  const cached = speechWindowsCache.get(p);
  if (
    cached &&
    cached.revision === p.revision &&
    cached.clipsRef === p.clips &&
    cached.captionsRef === p.captions &&
    cached.tracksRef === p.tracks &&
    cached.trackSig === trackSig &&
    cached.audioDucking === p.settings.audioDucking &&
    cached.clipCount === clipCount &&
    cached.captionCount === captionCount
  ) {
    return cached.windows;
  }

  const captions: Clip[] = [];
  for (const id in p.clips) {
    const c = p.clips[id];
    if (c.contentId && p.captions[c.contentId] && !p.tracks[c.trackId]?.hidden) {
      captions.push(c);
    }
  }

  const windows: { start: number; end: number }[] = [];
  for (const id in p.clips) {
    const c = p.clips[id];
    const track = p.tracks[c.trackId];
    const asset = c.assetId ? p.assets[c.assetId] : undefined;
    if (!asset || asset.kind === 'image' || track?.hidden || track?.muted || !c.volume || audioRole(p, c) !== 'speech') {
      continue;
    }
    const end = c.startTime + c.duration;
    let hasOverlap = false;
    for (let i = 0; i < captions.length; i++) {
      const cap = captions[i];
      if (cap.startTime < end && cap.startTime + cap.duration > c.startTime) {
        hasOverlap = true;
        windows.push({
          start: Math.max(c.startTime, cap.startTime),
          end: Math.min(end, cap.startTime + cap.duration),
        });
      }
    }
    // Caption times provide speech cues. Untranscribed speech uses the whole voice clip, not guessed pauses.
    if (!hasOverlap) windows.push({ start: c.startTime, end });
  }
  windows.sort((a, b) => a.start - b.start);
  speechWindowsCache.set(p, {
    revision: p.revision,
    clipsRef: p.clips,
    captionsRef: p.captions,
    tracksRef: p.tracks,
    trackSig,
    audioDucking: p.settings.audioDucking,
    clipCount,
    captionCount,
    windows,
  });
  return windows;
}
export function clipGain(p:EditorProject,c:Clip,time:number,windows=speechWindows(p),options?:{smartEnvelope?:boolean;duckingConfig?:Partial<DuckingConfig>}){
 if(options?.smartEnvelope)return smartClipGain(p,c,time,windows,options.duckingConfig);
 const track=p.tracks[c.trackId],local=time-c.startTime;
 if(!track||track.hidden||track.muted||local<0||local>c.duration)return 0;
 const fade=Math.min(c.fadeIn?clamp(local/c.fadeIn,0,1):1,c.fadeOut?clamp((c.duration-local)/c.fadeOut,0,1):1);
 let duck=1;
 if(p.settings.audioDucking&&c.ducking!==false&&audioRole(p,c)!=='speech')for(const w of windows){
  if(time<w.start-.08||time>w.end+.22)continue;
  const amount=time<w.start?clamp((time-w.start+.08)/.08,0,1):time>w.end?clamp(1-(time-w.end)/.22,0,1):1;
  duck=Math.min(duck,1-.75*amount);
 }
 return c.volume*fade*duck;
}

/**
 * Equal-power micro-fade across an adjacent transition boundary so video joins never click.
 */
export function transitionAudioMicroFade(p: EditorProject, c: Clip, time: number): number {
  const local = time - c.startTime;
  if (local < 0 || local > c.duration) return 0;
  let gain = 1;
  const microWindow = Math.min(0.06, c.duration * 0.15);
  for (const t of Object.values(p.transitions)) {
    if (t.toClipId === c.id && local < microWindow && c.fadeIn <= 0) {
      gain = Math.min(gain, Math.sin((clamp(local / microWindow, 0, 1) * Math.PI) / 2));
    }
    if (t.fromClipId === c.id && c.duration - local < microWindow && c.fadeOut <= 0) {
      gain = Math.min(gain, Math.sin((clamp((c.duration - local) / microWindow, 0, 1) * Math.PI) / 2));
    }
  }
  return gain;
}

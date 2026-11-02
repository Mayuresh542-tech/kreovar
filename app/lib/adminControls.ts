
export const CONTROL_KEYS = ['maintenance','content','voice','captions','ai','stock','export'] as const;
export function controlledFeature(path:string,method:string):string|null {
 if (['/api/content-kit','/api/platform-kit'].includes(path)) return method==='POST'?'content':null;
 if (path.startsWith('/api/voice/') && method==='POST') return 'voice';
 if (path==='/api/transcribe'||(path.startsWith('/api/captions/')&&method==='POST')) return 'captions';
 if (['/api/editor/ai-edit','/api/ai/complete','/api/editor/generate-image','/api/thumbnails/generate'].includes(path)) return 'ai';
 if (['/api/render','/api/editor/export-mp4','/api/editor/export'].includes(path) && method==='POST') return 'export';
 if (/^\/api\/(broll|sfx|stock)(\/|$)/.test(path)) return 'stock';
 return null;
}
export function validLimits(value:unknown):value is Record<string,number|null> {
 if (!value || typeof value!=='object' || Array.isArray(value)) return false;
 const keys=['content_ideas','content_scripts','voice_characters','caption_seconds','ai_edits','exports','stock_downloads'];
 return Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k) && ((value as Record<string,unknown>)[k]===null || (Number.isSafeInteger((value as Record<string,unknown>)[k]) && Number((value as Record<string,unknown>)[k])>=0 && Number((value as Record<string,unknown>)[k])<=10000000)));
}
export function errorCategory(raw:unknown):string {
 const s=String(raw||'').toLowerCase();
 if(/quota|429|rate.limit|resource.exhausted/.test(s))return 'Provider quota / rate limit';
 if(/timeout|timed.out|abort/.test(s))return 'Request timed out';
 if(/401|403|unauthor|api.key|credential/.test(s))return 'Provider authentication / permission';
 if(/audio|codec|ffmpeg|decode|format/.test(s))return 'Media processing';
 if(/network|fetch|connection/.test(s))return 'Provider connection';
 return 'Request failed; inspect server logs using this record ID';
}
